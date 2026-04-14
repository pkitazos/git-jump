import { StringDecoder } from "string_decoder";
import { err, ok, Result } from "./types";
import { handleError } from "./command";

// Control Sequence Format
// 1b (5b|4f) [number] [; number]+ (Letter or ~)

const ESC = 0x1b;
const CSI = 0x5b; // [
const SS3 = 0x4f; // O
const SS2 = 0x4e; // N

const UPPER_A = 0x41;
const UPPER_Z = 0x5a;
const LOWER_A = 0x61;
const LOWER_Z = 0x7a;
const TILDE = 0x7e;

function isTerminator(char: number): boolean {
  return (
    (char >= UPPER_A && char <= UPPER_Z) ||
    (char >= LOWER_A && char <= LOWER_Z) ||
    char === TILDE
  );
}

type CharacterCtx = {
  getKey: () => Buffer<ArrayBufferLike> | null;
  push: (char: number) => void;
  end: () => Buffer<ArrayBuffer> | null;
};

export function parseKeys(data: Buffer): Result<Buffer[]> {
  try {
    return ok(parseKeysInner(data));
  } catch (e) {
    return err(e instanceof Error ? e : new Error(String(e)));
  }
}

function parseKeysInner(data: Buffer): Buffer[] {
  const keys = [];
  let context: CharacterCtx | null = null;

  for (let char of data) {
    if (context === null) {
      if (char === ESC) {
        context = createEscapeSequenceContext();
      } else {
        context = createStringContext();
      }
    }

    context.push(char);
    const key = context.getKey();

    // If context could parse a key, save the key
    // and reset the context so that next character
    // is treated out of context and new context
    // can be created
    if (key !== null) {
      keys.push(key);
      context = null;
    }
  }

  // We processed all characters but there might be a case
  // that context could parse only some of them into actual
  // key
  const unparsedChars = context === null ? null : context.end();

  if (unparsedChars !== null) {
    keys.push(unparsedChars);
  }

  return keys;
}

function createEscapeSequenceContext() {
  let state: string | null = null;
  let buffer: number[] = [];
  let key: Buffer | null = null;

  const setKey = () => {
    key = Buffer.from(buffer);
    buffer = [];
  };

  return {
    getKey: () => key,

    push: (char: number) => {
      buffer.push(char);

      switch (state) {
        case null: {
          state = "escape-symbol";

          break;
        }

        case "escape-symbol": {
          if (char === CSI || char === SS3 || char === SS2) {
            // It's one of the valid escape symbols, so
            // can proceed to parsing parameters
            state = "parameters";
          } else {
            // parsing a key like "1b7f"
            setKey();
          }

          break;
        }

        case "parameters": {
          // If it's any letter or ~, close the context
          if (isTerminator(char)) {
            setKey();
          }

          break;
        }

        default: {
          throw new Error("Unknown state");
        }
      }
    },

    end: () => (buffer.length === 0 ? null : Buffer.from(buffer)),
  };
}

function createStringContext() {
  const decoder = new StringDecoder("utf-8");
  let key: Buffer | null = null;

  return {
    getKey: () => key,

    push: (char: number) => {
      const result = decoder.write(Buffer.from([char]));

      if (result !== "") {
        key = Buffer.from(result, "utf-8");
      }
    },

    end: () => {
      const rest = decoder.end();
      return rest === "" ? null : Buffer.from(rest, "utf-8");
    },
  };
}

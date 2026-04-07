import {
  BACKSPACE,
  CTRL_C,
  DELETE,
  DOWN,
  ENTER,
  ESCAPE_CODE,
  LEFT,
  RIGHT,
  UNICODE_C0_RANGE,
  UNICODE_C1_RANGE,
  UP,
} from "./constants";
import { generateList, getQuickSelectLines } from "./list";
import { AppState, InputResult } from "./types";

export function handleKey(key: Buffer, state: AppState): InputResult {
  return isSpecialKey(key)
    ? handleSpecialKey(key, state)
    : handleStringKey(key, state);
}

function isSpecialKey(key: Buffer): boolean {
  return isEscapeCode(key) || isC0C1ControlCode(key) || isDeleteKey(key);
}

/**
 * Takes in a special character and returns the appropriate action to modify
 * the application state accordingly
 *
 * @param key - The raw hexadecimal byte buffer of the pressed key sequence.
 *
 * Supported special key codes
 * - `1b5b44` - left
 * - `1b5b43` - right
 * - `1b5b41` - up
 * - `1b5b42` - down
 * - `1b62` - Option+left, word jump
 * - `1b66` - Option+right, word jump
 * - `1b4f48`, `01` - Cmd+left, Control+a, Home
 * - `1b4f46`, `05` - Cmd+right, Control+e, End
 * - `7f`, `08` - Delete (`08` on Windows)
 * - `0d` - Enter
 * - `1b5b337e` - fn+Delete, Forward Delete
 * - `1b7f` - Option+Delete, delete whole word
 * - `17` - Control+w, delete the whole line
 * - `0b` - Control+k, delete from cursor to the end of the line
 * - `1b30` .. `1b39` - Alt+0..9
 */
function handleSpecialKey(key: Buffer, state: AppState): InputResult {
  if (key.equals(CTRL_C)) return { tag: "exit" };

  if (key.equals(ENTER)) {
    return { tag: "switchTo", item: state.list[state.highlightedLineIndex] };
  }

  if (key.equals(UP)) {
    return {
      tag: "stateUpdate",
      state: {
        ...state,
        highlightedLineIndex: Math.max(0, state.highlightedLineIndex - 1),
      },
    };
  }

  if (key.equals(RIGHT)) {
    if (state.searchStringCursorPosition === state.searchString.length) {
      return { tag: "noop" };
    }

    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchStringCursorPosition: state.searchStringCursorPosition + 1,
      },
    };
  }

  if (key.equals(LEFT)) {
    if (state.searchStringCursorPosition === 0) {
      return { tag: "noop" };
    }

    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchStringCursorPosition: state.searchStringCursorPosition - 1,
      },
    };
  }

  if (key.equals(DOWN)) {
    return {
      tag: "stateUpdate",
      state: {
        ...state,
        highlightedLineIndex: Math.min(
          state.list.length - 1,
          state.highlightedLineIndex + 1,
        ),
      },
    };
  }

  if (key.equals(DELETE) || key.equals(BACKSPACE)) {
    if (state.searchStringCursorPosition === 0) {
      return { tag: "noop" };
    }

    const newSearchString = removeAt(
      state.searchString,
      state.searchStringCursorPosition - 1,
    );

    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchString: newSearchString,
        searchStringCursorPosition: state.searchStringCursorPosition - 1,
        list: generateList(state.branches, state.currentHEAD, newSearchString),
        highlightedLineIndex: 0,
      },
    };
  }

  if (isMetaPlusNumberCombination(key)) {
    const quickSelectIndex = getNumberFromMetaPlusCombination(key);
    const quickSelectLines = getQuickSelectLines(state.list);

    if (quickSelectIndex < quickSelectLines.length) {
      return { tag: "switchTo", item: quickSelectLines[quickSelectIndex] };
    }
  }

  return { tag: "noop" };
}

function removeAt(str: string, index: number): string {
  return str.split("").toSpliced(index, 1).join("");
}

function insertAt(str: string, index: number, text: string): string {
  return str.split("").toSpliced(index, 0, text).join("");
}

function handleStringKey(key: Buffer, state: AppState): InputResult {
  const inputString = key.toString();

  const newSearchString = insertAt(
    state.searchString,
    state.searchStringCursorPosition,
    inputString,
  );

  return {
    tag: "stateUpdate",
    state: {
      ...state,
      searchString: newSearchString,
      searchStringCursorPosition:
        state.searchStringCursorPosition + inputString.length,
      list: generateList(state.branches, state.currentHEAD, newSearchString),
      highlightedLineIndex: 0,
    },
  };
}

function isEscapeCode(data: Buffer): boolean {
  return data[0] === ESCAPE_CODE;
}

function isC0C1ControlCode(data: Buffer): boolean {
  // If key buffer has more then one byte it's not a control character
  if (data.length > 1) {
    return false;
  }

  const code = data[0];

  const inC0Range =
    code >= UNICODE_C0_RANGE.start && code <= UNICODE_C0_RANGE.end;
  const inC1Range =
    code >= UNICODE_C1_RANGE.start && code <= UNICODE_C1_RANGE.end;

  return inC0Range || inC1Range;
}

function isDeleteKey(data: Buffer) {
  return data.length === 1 && data[0] === DELETE[0];
}

function isMetaPlusNumberCombination(key: Buffer) {
  if (key.length === 2 && key[0] === ESCAPE_CODE) {
    return key[1] >= 0x30 && key[1] <= 0x39;
  }
}

function getNumberFromMetaPlusCombination(key: Buffer): number {
  // E.g. number = 5 = 0x35 = 0011 0101; 0011 0101 & 0000 1111 = 0000 0101 = 5
  return key[1] & 0x0f;
}

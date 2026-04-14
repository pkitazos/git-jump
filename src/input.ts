import {
  BACKSPACE,
  CMD_LEFT,
  CMD_RIGHT,
  CTRL_A,
  CTRL_C,
  CTRL_E,
  CTRL_K,
  CTRL_W,
  DELETE,
  DOWN,
  ENTER,
  ESCAPE_CODE,
  FN_DELETE,
  LEFT,
  OPT_BACKSPACE,
  OPT_LEFT,
  OPT_RIGHT,
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
 * - `03` - Control+c, exit
 * - `0d` - Enter
 * - `1b5b41` - Up
 * - `1b5b42` - Down
 * - `1b5b43` - Right
 * - `1b5b44` - Left
 * - `1b66` - Option+right, word jump right
 * - `1b62` - Option+left, word jump left
 * - `1b7f` - Option+backspace, delete whole word
 * - `1b4f48`, `01` - Cmd+left, Control+a, Home
 * - `1b4f46`, `05` - Cmd+right, Control+e, End
 * - `7f`, `08` - Backspace (`08` on Windows)
 * - `1b5b337e` - fn+Delete, forward delete
 * - `17` - Control+w, delete the whole line
 * - `0b` - Control+k, delete from cursor to end of line
 * - `1b30` .. `1b39` - Alt+0..9, quick select
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

  if (key.equals(OPT_RIGHT)) {
    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchStringCursorPosition: nextWordBoundary(
          state.searchString,
          state.searchStringCursorPosition,
        ),
      },
    };
  }

  if (key.equals(OPT_LEFT)) {
    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchStringCursorPosition: prevWordBoundary(
          state.searchString,
          state.searchStringCursorPosition,
        ),
      },
    };
  }

  if (key.equals(OPT_BACKSPACE)) {
    const stopAt = prevWordBoundary(
      state.searchString,
      state.searchStringCursorPosition,
    );

    const newSearchString =
      state.searchString.slice(0, stopAt) +
      state.searchString.slice(state.searchStringCursorPosition);

    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchString: newSearchString,
        searchStringCursorPosition: stopAt,
        list: generateList(state.branches, state.currentHEAD, newSearchString),
        highlightedLineIndex: 0,
      },
    };
  }

  if (key.equals(CMD_LEFT) || key.equals(CTRL_A)) {
    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchStringCursorPosition: 0,
      },
    };
  }

  if (key.equals(CMD_RIGHT) || key.equals(CTRL_E)) {
    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchStringCursorPosition: state.searchString.length,
      },
    };
  }

  if (key.equals(FN_DELETE)) {
    if (state.searchStringCursorPosition === state.searchString.length) {
      return { tag: "noop" };
    }

    const newSearchString = removeAt(
      state.searchString,
      state.searchStringCursorPosition,
    );

    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchString: newSearchString,
        list: generateList(state.branches, state.currentHEAD, newSearchString),
        highlightedLineIndex: 0,
      },
    };
  }

  if (key.equals(CTRL_W)) {
    const newSearchString = "";
    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchString: newSearchString,
        searchStringCursorPosition: 0,
        list: generateList(state.branches, state.currentHEAD, newSearchString),
        highlightedLineIndex: 0,
      },
    };
  }

  if (key.equals(CTRL_K)) {
    const newSearchString = state.searchString.slice(
      0,
      state.searchStringCursorPosition,
    );

    return {
      tag: "stateUpdate",
      state: {
        ...state,
        searchString: newSearchString,
        list: generateList(state.branches, state.currentHEAD, newSearchString),
        highlightedLineIndex: 0,
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

const BREAKPOINTS = [" ", "-", "/", ".", "_"];

function nextWordBoundary(text: string, pos: number): number {
  let i = pos;
  // first skip breakpoint characters in case we're right next to them
  while (i < text.length && BREAKPOINTS.includes(text[i])) i++;
  // then skip word characters until next breakpoint
  while (i < text.length && !BREAKPOINTS.includes(text[i])) i++;
  return i;
}

function prevWordBoundary(text: string, pos: number): number {
  let i = pos - 1;
  // first skip breakpoint characters in case we're right next to them
  while (i >= 0 && BREAKPOINTS.includes(text[i])) i--;
  // then skip word characters until next breakpoint
  while (i >= 0 && !BREAKPOINTS.includes(text[i])) i--;
  return i + 1;
}

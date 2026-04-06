import { GOD_STATE, switchToListItem } from ".";
import {
  BACKSPACE,
  CTRL_C,
  DELETE,
  DOWN,
  ENTER,
  escapeCode,
  LEFT,
  RIGHT,
  UNICODE_C0_RANGE,
  UNICODE_C1_RANGE,
  UP,
} from "./constants";
import { generateList, getQuickSelectLines } from "./list";
import { clear, view } from "./ui";

export function isSpecialKey(key: Buffer): boolean {
  return isEscapeCode(key) || isC0C1ControlCode(key) || isDeleteKey(key);
}

/**
 * Processes special keyboard inputs (navigation arrows, Enter, Delete, quick-select numbers).
 * It mutates the application state (e.g., moving the cursor down, deleting a character
 * from the search string) and triggers a UI re-render based on the action.
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
export function handleSpecialKey(key: Buffer) {
  if (key.equals(CTRL_C)) {
    clear();
    process.exit();
  }

  if (key.equals(ENTER)) {
    switchToListItem(GOD_STATE.list[GOD_STATE.highlightedLineIndex]);

    return;
  }

  if (key.equals(UP)) {
    GOD_STATE.highlightedLineIndex = Math.max(
      0,
      GOD_STATE.highlightedLineIndex - 1,
    );
    view(GOD_STATE);

    return;
  }

  if (key.equals(RIGHT)) {
    if (
      GOD_STATE.searchStringCursorPosition === GOD_STATE.searchString.length
    ) {
      return;
    }

    GOD_STATE.searchStringCursorPosition += 1;
    view(GOD_STATE);

    return;
  }

  if (key.equals(LEFT)) {
    if (GOD_STATE.searchStringCursorPosition === 0) {
      return;
    }

    GOD_STATE.searchStringCursorPosition -= 1;
    view(GOD_STATE);

    return;
  }

  if (key.equals(DOWN)) {
    GOD_STATE.highlightedLineIndex = Math.min(
      GOD_STATE.list.length - 1,
      GOD_STATE.highlightedLineIndex + 1,
    );
    view(GOD_STATE);

    return;
  }

  if (key.equals(DELETE) || key.equals(BACKSPACE)) {
    if (GOD_STATE.searchStringCursorPosition === 0) {
      return;
    }

    GOD_STATE.searchString =
      GOD_STATE.searchString.substring(
        0,
        GOD_STATE.searchStringCursorPosition - 1,
      ) +
      GOD_STATE.searchString.substring(
        GOD_STATE.searchStringCursorPosition,
        GOD_STATE.searchString.length,
      );
    GOD_STATE.searchStringCursorPosition -= 1;
    GOD_STATE.list = generateList(GOD_STATE);
    GOD_STATE.highlightedLineIndex = 0;
    view(GOD_STATE);

    return;
  }

  if (isMetaPlusNumberCombination(key)) {
    const quickSelectIndex = getNumberFromMetaPlusCombination(key);
    const quickSelectLines = getQuickSelectLines(GOD_STATE.list);

    if (quickSelectIndex < quickSelectLines.length) {
      switchToListItem(quickSelectLines[quickSelectIndex]);
    }

    return;
  }
}

export function handleStringKey(key: Buffer) {
  const inputString = key.toString();

  GOD_STATE.searchString =
    GOD_STATE.searchString.substring(0, GOD_STATE.searchStringCursorPosition) +
    inputString +
    GOD_STATE.searchString.substring(
      GOD_STATE.searchStringCursorPosition,
      GOD_STATE.searchString.length,
    );
  GOD_STATE.searchStringCursorPosition += inputString.length;
  GOD_STATE.list = generateList(GOD_STATE);
  GOD_STATE.highlightedLineIndex = 0;

  view(GOD_STATE);
}

function isEscapeCode(data: Buffer): boolean {
  return data[0] === escapeCode;
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
  if (key.length === 2 && key[0] === escapeCode) {
    return key[1] >= 0x30 && key[1] <= 0x39;
  }
}

function getNumberFromMetaPlusCombination(key: Buffer): number {
  // E.g. number = 5 = 0x35 = 0011 0101; 0011 0101 & 0000 1111 = 0000 0101 = 5
  return key[1] & 0x0f;
}

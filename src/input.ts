import { switchToListItem } from ".";
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
    switchToListItem(state.list[state.highlightedLineIndex]);

    return;
  }

  if (key.equals(UP)) {
    state.highlightedLineIndex = Math.max(0, state.highlightedLineIndex - 1);
    view(state);

    return;
  }

  if (key.equals(RIGHT)) {
    if (state.searchStringCursorPosition === state.searchString.length) {
      return;
    }

    state.searchStringCursorPosition += 1;
    view(state);

    return;
  }

  if (key.equals(LEFT)) {
    if (state.searchStringCursorPosition === 0) {
      return;
    }

    state.searchStringCursorPosition -= 1;
    view(state);

    return;
  }

  if (key.equals(DOWN)) {
    state.highlightedLineIndex = Math.min(
      state.list.length - 1,
      state.highlightedLineIndex + 1,
    );
    view(state);

    return;
  }

  if (key.equals(DELETE) || key.equals(BACKSPACE)) {
    if (state.searchStringCursorPosition === 0) {
      return;
    }

    state.searchString =
      state.searchString.substring(0, state.searchStringCursorPosition - 1) +
      state.searchString.substring(
        state.searchStringCursorPosition,
        state.searchString.length,
      );
    state.searchStringCursorPosition -= 1;
    state.list = generateList(state);
    state.highlightedLineIndex = 0;
    view(state);

    return;
  }

  if (isMetaPlusNumberCombination(key)) {
    const quickSelectIndex = getNumberFromMetaPlusCombination(key);
    const quickSelectLines = getQuickSelectLines(state.list);

    if (quickSelectIndex < quickSelectLines.length) {
      switchToListItem(quickSelectLines[quickSelectIndex]);
    }

    return;
  }
}

export function handleStringKey(key: Buffer) {
  const inputString = key.toString();

  state.searchString =
    state.searchString.substring(0, state.searchStringCursorPosition) +
    inputString +
    state.searchString.substring(
      state.searchStringCursorPosition,
      state.searchString.length,
    );
  state.searchStringCursorPosition += inputString.length;
  state.list = generateList(state);
  state.highlightedLineIndex = 0;

  view(state);
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

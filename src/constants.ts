/**
 * Hexadecimal buffer sequences representing specific special keyboard inputs.
 * These are used to interpret raw keystrokes from the terminal for navigation and control.
 */
const CTRL_C = Buffer.from("03", "hex");
const UP = Buffer.from("1b5b41", "hex");
const DOWN = Buffer.from("1b5b42", "hex");
const RIGHT = Buffer.from("1b5b43", "hex");
const LEFT = Buffer.from("1b5b44", "hex");
const DELETE = Buffer.from("7f", "hex");
const BACKSPACE = Buffer.from("08", "hex");
const ENTER = Buffer.from("0d", "hex");

const escapeCode = 0x1b;
const UNICODE_C0_RANGE = { start: 0x00, end: 0x1f };
const UNICODE_C1_RANGE = { start: 0x80, end: 0x9f };

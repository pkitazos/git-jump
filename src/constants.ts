/**
 * Hexadecimal buffer sequences representing specific special keyboard inputs.
 * These are used to interpret raw keystrokes from the terminal for navigation and control.
 */
export const CTRL_C = Buffer.from("03", "hex");
export const UP = Buffer.from("1b5b41", "hex");
export const DOWN = Buffer.from("1b5b42", "hex");
export const RIGHT = Buffer.from("1b5b43", "hex");
export const LEFT = Buffer.from("1b5b44", "hex");
export const DELETE = Buffer.from("7f", "hex");
export const BACKSPACE = Buffer.from("08", "hex");
export const ENTER = Buffer.from("0d", "hex");

export const escapeCode = 0x1b;
export const UNICODE_C0_RANGE = { start: 0x00, end: 0x1f };
export const UNICODE_C1_RANGE = { start: 0x80, end: 0x9f };

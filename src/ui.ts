import { getQuickSelectLines } from "./list";
import {
  AppState,
  BranchData,
  CurrentHEAD,
  LayoutColumn,
  LayoutColumnVariant,
  LinesWindow,
  ListItem,
  ListItemVariant,
  Message,
  RenderOutput,
  Scene,
} from "./types";
import { clamp, match } from "./utils";

const BRANCH_INDEX_PADD = "   ";
const LINE_SPACER = "  ";

const ESCAPE_CODE_PATTERN = /\x1b.+?m/gi;

// --- styling

export function dim(s: string): string {
  return `\x1b[2m${s}\x1b[22m`;
}

export function bold(s: string): string {
  return `\x1b[1m${s}\x1b[22m`;
}

export function highlight(s: string): string {
  return `\x1b[38;5;4m${s}\x1b[39m`;
}

export function green(s: string): string {
  return `\x1b[38;5;2m${s}\x1b[39m`;
}

export function yellow(s: string): string {
  return `\x1b[38;5;3m${s}\x1b[39m`;
}

export function red(s: string): string {
  return `\x1b[38;5;1m${s}\x1b[39m`;
}

// --- string utils

function truncate(s: string, maxWidth: number): string {
  const truncated = s.slice(0, maxWidth);
  if (truncated.length >= s.length) return truncated;
  return `${truncated.substring(0, truncated.length - 1)}…`;
}

// this just takes a string and a column width, splits it on spaces, and packs the words back
// onto lines without going over the width
// the "sanitizing" is for removing ansi escape codes when measuring
// length so colors don't count toward the column count
export function wrapText(text: string, columns: number): string[] {
  if (text.length === 0) return [];

  const [firstWord, ...words] = text.split(" ");

  return words
    .reduce(
      ([currLine, ...restLines], word) => {
        const sanitizedWord = word.replace(ESCAPE_CODE_PATTERN, "");
        const sanitizedCurrLine = currLine.replace(ESCAPE_CODE_PATTERN, "");

        const potentialLineLen =
          // +1 at the end is for the space in front of the word
          sanitizedCurrLine.length + sanitizedWord.length + 1;

        return potentialLineLen > columns
          ? [word, currLine, ...restLines]
          : [currLine + " " + word, ...restLines];
      },
      [firstWord],
    )
    .reverse();
}

// --- layout math

// "window" in the sense of which slice of the list is visible on screen
// given the screen height + total list size + the highlighted line it computes the
// top/bottom indices for a window centered on the highlighted line
function calculateLinesWindow(
  rows: number,
  linesCount: number,
  highlightedLineIndex: number,
  reservedRows: number = 2,
): LinesWindow {
  if (linesCount === 0) return { topIndex: 0, bottomIndex: 0 };

  const windowSize = Math.max(1, rows - reservedRows);
  const windowHalf = Math.floor(windowSize / 2);

  const topIndex = clamp(
    highlightedLineIndex - windowHalf,
    0,
    linesCount - windowSize,
  );

  const bottomIndex = Math.min(topIndex + windowSize - 1, linesCount - 1);

  return { topIndex, bottomIndex };
}

function calculateInteractiveLayout(
  terminalColumns: number,
  branches: BranchData[],
): LayoutColumn[] {
  const indexColumnWidth = 3;
  const moreIndicatorColumnWidth = 5;

  const maxBranchLength =
    branches.length > 0 ? Math.max(...branches.map((b) => b.name.length)) : 0;

  const branchNameColumnWidth = clamp(
    terminalColumns - indexColumnWidth - moreIndicatorColumnWidth,
    0,
    maxBranchLength,
  );

  const remainingWidth = Math.max(
    0,
    terminalColumns - indexColumnWidth - branchNameColumnWidth,
  );

  return [
    { type: LayoutColumnVariant.INDEX, width: indexColumnWidth },
    { type: LayoutColumnVariant.BRANCH_NAME, width: branchNameColumnWidth },
    { type: LayoutColumnVariant.MORE_INDICATOR, width: remainingWidth },
  ];
}

// --- item formatters + line decorators

function highlightLine(
  line: string,
  lineIndex: number,
  highlightedLineIndex: number,
  selected: boolean = false,
) {
  if (lineIndex !== highlightedLineIndex) return line;
  return selected ? green(line) : highlight(line);
}

function addScrollIndicator(
  line: string,
  lineIndex: number,
  listLength: number,
  listWindow: LinesWindow,
  layout: LayoutColumn[],
): string {
  if (
    lineIndex !== listWindow.bottomIndex ||
    listWindow.bottomIndex >= listLength - 1
  ) {
    return line;
  }

  return line + dim("   ↓ ".padStart(layout[layout.length - 1].width, " "));
}

// builds the HEAD row as a single string using the list of layout columns computed in a previous step
function formatHEAD(currentHEAD: CurrentHEAD, layout: LayoutColumn[]): string {
  return layout
    .map((column: LayoutColumn) =>
      match(column, "type", {
        [LayoutColumnVariant.INDEX]: () => BRANCH_INDEX_PADD,

        [LayoutColumnVariant.BRANCH_NAME]: () => {
          return currentHEAD.detached
            ? `${bold(currentHEAD.sha)} ${dim("(detached)")}`
            : bold(currentHEAD.branchName);
        },

        [LayoutColumnVariant.MORE_INDICATOR]: () => "",
      }),
    )
    .join("");
}

// like formatHEAD but the index column shows the quick-select number (only for 0-9, otherwise blank padding)
// and the branch name gets truncated/padded to fit the column width.
function formatBranch(
  branch: BranchData,
  layout: LayoutColumn[],
  index: number,
): string {
  return layout
    .map((column) =>
      match(column, "type", {
        [LayoutColumnVariant.INDEX]: () =>
          index < 10 ? ` ${dim(index.toString())} ` : BRANCH_INDEX_PADD,

        [LayoutColumnVariant.BRANCH_NAME]: () =>
          truncate(branch.name, column.width).padEnd(column.width, " "),

        [LayoutColumnVariant.MORE_INDICATOR]: () => "",
      }),
    )
    .join("");
}

function formatQuickSelectHint(
  maxIndex: number,
  columnWidth: number,
  isMac: boolean,
): string {
  const trailingIndex = maxIndex > 0 ? `..${maxIndex}` : "";
  const modifierKey = isMac ? "⌥" : "Alt";

  return dim(
    `${modifierKey}+0${trailingIndex} quick select `.padStart(columnWidth, " "),
  );
}

const SEARCH_PLACEHOLDER = "Search";
// TODO: if the search string ever overflowed the width we'd want to truncate from the
// FRONT and follow the cursor like a sliding window, but realistically branch name
// searches are never gonna get that long.
function formatSearchField(searchString: string, width: number): string {
  return searchString === ""
    ? dim(SEARCH_PLACEHOLDER.padEnd(width, " "))
    : truncate(searchString, width).padEnd(width, " ");
}

/**
 * Parses custom pseudo-tags ({bold}, {dim}, {wrap:N}) into terminal-ready strings.
 */
export function formatHelpText(rawHelp: string, columns: number): string[] {
  let help = rawHelp;

  help = help.replace(/\{bold\}(.+)\{\/bold\}/g, (_, content) => bold(content));

  help = help.replace(/\{dim\}(.+)\{\/dim\}/g, (_, content) => dim(content));

  help = help.replace(
    /\{wrap:(\d+)\}(.+)\{\/wrap\}/g,
    (_, paddingSize, content) => {
      const pad = parseInt(paddingSize, 10);
      return wrapText(content.trim(), columns - pad)
        .map((line, index) => (index === 0 ? line : " ".repeat(pad) + line))
        .join("\n");
    },
  );

  return help.split("\n");
}

function formatMessageBlock(
  messagePayload: Message,
  columns: number,
): string[] {
  if (messagePayload.kind === "error") {
    const { title, message } = messagePayload.error;

    const wrappedBody = wrapText(message, columns - LINE_SPACER.length).map(
      (line) => LINE_SPACER + line,
    );

    return ["", LINE_SPACER + red(bold(title)), "", ...wrappedBody, "", ""];
  }

  const wrappedLines = messagePayload.content
    .flatMap((line) =>
      line === "" ? [""] : wrapText(line, columns - LINE_SPACER.length),
    )
    .map((line) => LINE_SPACER + line);

  return ["", ...wrappedLines, "", ""];
}

// --- section builders

function buildListLines(list: ListItem[], layout: LayoutColumn[]): string[] {
  // we track quickSelectIndex separately instead of using the map callback's index because HEAD doesn't take an index
  let quickSelectIndex = -1;

  return list.map((line) =>
    match(line, "type", {
      [ListItemVariant.HEAD]: (line) => formatHEAD(line.content, layout),

      [ListItemVariant.BRANCH]: (line) => {
        quickSelectIndex++;
        return formatBranch(line.content, layout, quickSelectIndex);
      },
    }),
  );
}

function buildPlainList(list: ListItem[], columns: number): string[] {
  return buildListLines(list, [
    { type: LayoutColumnVariant.BRANCH_NAME, width: columns },
  ]);
}

function buildInteractiveList(
  list: ListItem[],
  branches: BranchData[],
  columns: number,
  rows: number,
  highlightedLineIndex: number,
): string[] {
  const listLength = list.length;

  if (listLength === 0) {
    return [`${BRANCH_INDEX_PADD}${dim("No such branches")}`];
  }

  const layout = calculateInteractiveLayout(columns, branches);
  const listWindow = calculateLinesWindow(
    rows,
    listLength,
    highlightedLineIndex,
  );

  return buildListLines(list, layout)
    .slice(listWindow.topIndex, listWindow.bottomIndex + 1)
    .map((line, index) =>
      addScrollIndicator(
        highlightLine(line, index, highlightedLineIndex),
        index,
        listLength,
        listWindow,
        layout,
      ),
    );
}

// builds the top line of the interactive view: index padding + search input field, plus
// a quick-select hint ("⌥+0..N quick select") on the right side IF there's enough room
// AND there are branches you can actually quick-select. otherwise the hint is dropped.
// the search field grows with the search string up to the available width.
function buildSearchLine(
  searchString: string,
  list: ListItem[],
  columns: number,
  isMac: boolean,
): string {
  const HINT_MIN_WIDTH = 25;

  const searchWidth = clamp(
    searchString.length,
    SEARCH_PLACEHOLDER.length,
    columns - BRANCH_INDEX_PADD.length,
  );

  const baseLine =
    BRANCH_INDEX_PADD + formatSearchField(searchString, searchWidth);

  const hintColumnWidth = columns - (BRANCH_INDEX_PADD.length + searchWidth);

  if (hintColumnWidth < HINT_MIN_WIDTH) return baseLine;

  const quickSelectLines = getQuickSelectLines(list);
  if (quickSelectLines.length === 0) return baseLine;

  const hint = formatQuickSelectHint(
    quickSelectLines.length - 1,
    hintColumnWidth,
    isMac,
  );

  return baseLine + hint;
}

/**
 * Takes the current application state and produces a pure, declarative description of the UI.
 * We do this by looking at the active "scene" and constructing a `RenderOutput`
 * object containing the exact lines to be drawn, along with any necessary
 * terminal cursor positioning metadata.
 *
 * - LIST (Interactive): Computes the search bar, windowed list layout, and cursor coordinates.
 * - LIST (Plain): Computes a raw string dump of branches (used when piping to other commands).
 * - MESSAGE: Computes a padded, text-wrapped message block.
 */
function buildView(state: AppState): RenderOutput {
  return match(state, "scene", {
    [Scene.MESSAGE]: () => {
      return {
        tag: Scene.MESSAGE,
        lines: formatMessageBlock(state.message, state.columns),
      };
    },

    [Scene.LIST_PLAIN]: () => {
      const plainLines = buildPlainList(state.list, state.columns);
      return {
        tag: Scene.LIST_PLAIN,
        lines: [...plainLines, ""],
      };
    },

    [Scene.LIST_INTERACTIVE]: () => {
      const searchLine = buildSearchLine(
        state.searchString,
        state.list,
        state.columns,
        state.isMac,
      );

      const interactiveList = buildInteractiveList(
        state.list,
        state.branches,
        state.columns,
        state.rows,
        state.highlightedLineIndex,
      );

      const xPos =
        BRANCH_INDEX_PADD.length + state.searchStringCursorPosition + 1;

      return {
        tag: Scene.LIST_INTERACTIVE,
        lines: [searchLine, ...interactiveList],
        cursor: { x: xPos, y: 1 },
      };
    },
  });
}

function render(output: RenderOutput): void {
  match(output, "tag", {
    [Scene.MESSAGE]: (o) => {
      clear();
      write(o.lines);
    },
    [Scene.LIST_PLAIN]: (o) => {
      write(o.lines);
    },
    [Scene.LIST_INTERACTIVE]: (o) => {
      clear();
      write(o.lines);
      cursorTo(o.cursor.x, o.cursor.y);
    },
  });
}

// --- the main public-facing API

export function renderView(state: AppState) {
  render(buildView(state));
}

// --- terminal writer

/**
 * These properties cannot live in the main
 * app state as they are affected by rendering itself,
 * not by application logic. They are part of a different,
 * more low-level sub-system.
 */
type RenderState = { cursorY: number };

/**
 * The initial state for the rendering engine.
 * Starts tracking the vertical cursor position from the first line to ensure clean terminal redraws.
 */
const writerState: RenderState = { cursorY: 1 };

export function clear() {
  cursorTo(1, 1);

  // Clear everything after the cursor
  process.stdout.write(`\x1b[0J`);
}

export function write(lines: string[]) {
  process.stdout.write(lines.join("\n"));

  // Keep track of the cursor's vertical position
  // in order to know how many lines to move up
  // to clean the screen later
  writerState.cursorY = lines.length;
}

function cursorTo(x: number, y: number) {
  const yDelta = writerState.cursorY - y;

  // Move cursor back to the first line
  // \x1b[0A will still move one line up, so
  // do not move in case there is only one line
  if (yDelta > 0) process.stdout.write(`\x1b[${yDelta}A`);

  // There is an escape sequence for moving
  // cursor horizontally using absolute coordinate,
  // so no need to use delta here, like for Y
  process.stdout.write(`\x1b[${x}G`);

  writerState.cursorY = y;
}

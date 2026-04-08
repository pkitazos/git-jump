import * as os from "os";

import { getQuickSelectLines } from "./list";
import {
  BranchData,
  CurrentHEAD,
  LayoutColumn,
  LayoutColumnVariant,
  LinesWindow,
  ListItemVariant,
  Scene,
  State,
} from "./types";

type RenderOutput =
  | {
      tag: "listInteractive";
      lines: string[];
      cursor: { x: number; y: number };
    }
  | { tag: "listPlain"; lines: string[] }
  | { tag: "message"; lines: string[] };

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
  return words.reduce(
    (lines, word) => {
      const currentLine = lines[lines.length - 1];
      const sanitizedCurrentLine = currentLine.replace(ESCAPE_CODE_PATTERN, "");
      const sanitizedWord = word.replace(ESCAPE_CODE_PATTERN, "");

      // +1 at the end is for the space in front of the word
      if (sanitizedCurrentLine.length + sanitizedWord.length + 1 <= columns) {
        lines[lines.length - 1] = currentLine + " " + word;
      } else {
        lines.push(word);
      }

      return lines;
    },
    [firstWord],
  );
}

// --- layout math

// "window" in the sense of which slice of the list is visible on screen
// given the screen height + total list size + the highlighted line it computes the
// top/bottom indices for a window centered on the highlighted line
function calculateLinesWindow(
  rows: number,
  linesCount: number,
  highlightedLineIndex: number,
): LinesWindow {
  const windowSize = rows - 2; // two rows are reserved for something?
  const windowHalf = Math.floor(windowSize / 2);

  const topIndex = Math.max(
    0,
    Math.min(linesCount - windowSize, highlightedLineIndex - windowHalf),
  );

  const bottomIndex = topIndex + (windowSize - 1);

  return { topIndex, bottomIndex };
}

function calculateLayout(state: State): LayoutColumn[] {
  const indexColumnWidth = 3;
  const moreIndicatorColumnWidth = 5;

  const branchNameColumnWidth = Math.min(
    state.columns - indexColumnWidth - moreIndicatorColumnWidth,
    Math.max(...state.branches.map((b) => b.name.length)),
  );

  const moreIndicatorSpacingWidth =
    state.columns -
    indexColumnWidth -
    branchNameColumnWidth -
    moreIndicatorColumnWidth;

  return [
    { type: LayoutColumnVariant.INDEX, width: indexColumnWidth },
    { type: LayoutColumnVariant.BRANCH_NAME, width: branchNameColumnWidth },
    {
      type: LayoutColumnVariant.MORE_INDICATOR,
      width: moreIndicatorSpacingWidth + moreIndicatorColumnWidth,
    },
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
  return layout.reduce((line: string, column: LayoutColumn) => {
    if (column.type === LayoutColumnVariant.INDEX) {
      return line + BRANCH_INDEX_PADD;
    }

    if (column.type === LayoutColumnVariant.BRANCH_NAME) {
      const branch = currentHEAD.detached
        ? `${bold(currentHEAD.sha)} ${dim("(detached)")}`
        : bold(currentHEAD.branchName);

      return line + branch;
    }

    return line;
  }, "");
}

// like formatHEAD but the index column shows the quick-select number (only for 0-9, otherwise blank padding)
// and the branch name gets truncated/padded to fit the column width.
function formatBranch(
  branch: BranchData,
  index: number,
  layout: LayoutColumn[],
): string {
  return layout.reduce((line: string, column: LayoutColumn) => {
    if (column.type === LayoutColumnVariant.INDEX) {
      return (
        line + (index < 10 ? ` ${dim(index.toString())} ` : BRANCH_INDEX_PADD)
      );
    }

    if (column.type === LayoutColumnVariant.BRANCH_NAME) {
      return (
        line + truncate(branch.name, column.width).padEnd(column.width, " ")
      );
    }

    return line;
  }, "");
}

function formatQuickSelectHint(maxIndex: number, columnWidth: number): string {
  const trailingIndex = maxIndex > 0 ? `..${maxIndex}` : "";
  const modifierKey = os.type() === "Darwin" ? "⌥" : "Alt";

  return dim(
    `${modifierKey}+0${trailingIndex} quick select `.padStart(columnWidth, " "),
  );
}

const SEARCH_PLACEHOLDER = "Search";
// TODO: if the search string ever overflowed the width we'd want to truncate from the
// FRONT and follow the cursor like a sliding window, but realistically branch name
// searches are never gonna get that long.
function formatSearchField(state: State, width: number): string {
  return state.searchString === ""
    ? dim(SEARCH_PLACEHOLDER.padEnd(width, " "))
    : truncate(state.searchString, width).padEnd(width, " ");
}

// --- section builders

function buildListLines(state: State, layout: LayoutColumn[]): string[] {
  // we track quickSelectIndex separately instead of using the map callback's index because HEAD doesn't take an index
  let quickSelectIndex = -1;

  return state.list.map((line) => {
    switch (line.type) {
      case ListItemVariant.HEAD: {
        return formatHEAD(line.content, layout);
      }

      case ListItemVariant.BRANCH: {
        quickSelectIndex++;

        return formatBranch(line.content, quickSelectIndex, layout);
      }
    }
  });
}

function buildPlainList(state: State): string[] {
  const layout = [
    { type: LayoutColumnVariant.BRANCH_NAME, width: state.columns },
  ];

  return buildListLines(state, layout);
}

function buildInteractiveList(state: State): string[] {
  if (state.list.length === 0) {
    return [`${BRANCH_INDEX_PADD}${dim("No such branches")}`];
  }

  const layout = calculateLayout(state);
  const listWindow = calculateLinesWindow(
    state.rows,
    state.list.length,
    state.highlightedLineIndex,
  );

  return buildListLines(state, layout)
    .map((line, index) => {
      return addScrollIndicator(
        highlightLine(line, index, state.highlightedLineIndex),
        index,
        state.list.length,
        listWindow,
        layout,
      );
    })
    .slice(listWindow.topIndex, listWindow.bottomIndex + 1);
}

// builds the top line of the interactive view: index padding + search input field, plus
// a quick-select hint ("⌥+0..N quick select") on the right side IF there's enough room
// AND there are branches you can actually quick-select. otherwise the hint is dropped.
// the search field grows with the search string up to the available width.
function buildSearchLine(state: State): string {
  const searchWidth = Math.min(
    state.columns - BRANCH_INDEX_PADD.length,
    Math.max(state.searchString.length, SEARCH_PLACEHOLDER.length),
  );
  const hintMinWidth = 25;

  let line = BRANCH_INDEX_PADD + formatSearchField(state, searchWidth);
  const hintColumnWidth =
    state.columns - (BRANCH_INDEX_PADD.length + searchWidth);

  if (hintColumnWidth < hintMinWidth) {
    return line;
  }

  const quickSelectLines = getQuickSelectLines(state.list);

  if (quickSelectLines.length === 0) {
    return line;
  }

  line += formatQuickSelectHint(quickSelectLines.length - 1, hintColumnWidth);

  return line;
}

// --- the main public-facing API

// this is the top-level dispatch which depending on the "scene" builds the lines and writes them to stdout
//
// LIST has two variants:
// - non-interactive just dumps the list to stdout (for piping or whatever)
// - interactive clears the screen, renders the search line + the windowed list, and moves the cursor to the search input.
// MESSAGE clears the screen and renders the message lines
//
// currently still contains side-effects so idk what the best name would be - leaving
// as `view` until the pure/effectful split happens.
export function view(state: State) {
  switch (state.scene) {
    case Scene.LIST: {
      if (!state.isInteractive) {
        // concat(['']) will add trailing newline
        write(buildPlainList(state).concat([""]));

        return;
      }

      let lines: string[] = [];

      lines.push(buildSearchLine(state));
      lines = lines.concat(buildInteractiveList(state));

      clear();
      write(lines);

      cursorTo(
        BRANCH_INDEX_PADD.length + state.searchStringCursorPosition + 1,
        1,
      );

      break;
    }

    case Scene.MESSAGE: {
      clear();

      const lines = [
        "",
        ...state.message
          .reduce((lines: string[], line: string) => {
            if (line === "") {
              lines.push("");

              return lines;
            }
            return lines.concat(
              wrapText(line, state.columns - LINE_SPACER.length),
            );
          }, [])
          .map((line) => LINE_SPACER + line),
        "",
        "",
      ];

      write(lines);

      break;
    }
  }
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

function write(lines: string[]) {
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

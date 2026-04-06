import * as os from "os";

import { getQuickSelectLines } from "./list";
import {
  BranchData,
  CurrentHEAD,
  LayoutColumn,
  LayoutColumnType,
  LinesWindow,
  ListItem,
  ListItemVariant,
  Scene,
  State,
} from "./types";

const BRANCH_INDEX_PADD = "   ";

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

function truncate(s: string, maxWidth: number): string {
  let truncated = s.slice(0, maxWidth);

  if (truncated.length < s.length) {
    truncated = `${truncated.substring(0, truncated.length - 1)}…`;
  }

  return truncated;
}

export function multilineTextLayout(text: string, columns: number): string[] {
  if (text.length === 0) {
    return [];
  }

  const words = text.split(" ");
  const escapeCodePattern = /\x1b.+?m/gi;

  return words.slice(1).reduce(
    (lines, word) => {
      const currentLine = lines[lines.length - 1];
      const sanitizedCurrentLine = currentLine.replace(escapeCodePattern, "");
      const sanitizedWord = word.replace(escapeCodePattern, "");

      // +1 at the end is for the space in front of the word
      if (sanitizedCurrentLine.length + sanitizedWord.length + 1 <= columns) {
        lines[lines.length - 1] = currentLine + " " + word;
      } else {
        lines.push(word);
      }

      return lines;
    },
    [words[0]],
  );
}

/**
 * These properties cannot live in the main
 * app state as they are affected by rendering itself,
 * not by application logic. They are part of a different,
 * more low-level sub-system.
 */
type RenderState = {
  cursorY: number;
};

/**
 * The initial state for the rendering engine.
 * Starts tracking the vertical cursor position from the first line to ensure clean terminal redraws.
 */
const renderState: RenderState = {
  cursorY: 1,
};

export function clear() {
  cursorTo(1, 1);

  // Clear everything after the cursor
  process.stdout.write(`\x1b[0J`);
}

/**
 * The primary rendering function.
 * Depending on the active Scene (List or Message), it calculates the required
 * layout math, clears the necessary terminal space, and uses ANSI escape codes
 * to draw the updated type to = standard output.
 * @param state - The current application state.
 */
export function view(state: State) {
  switch (state.scene) {
    case Scene.LIST: {
      if (!state.isInteractive) {
        // concat(['']) will add trailing newline
        render(viewNonInteractiveList(state).concat([""]));

        return;
      }

      let lines: string[] = [];

      lines.push(viewSearchLine(state));
      lines = lines.concat(viewList(state));

      clear();
      render(lines);

      cursorTo(
        BRANCH_INDEX_PADD.length + state.searchStringCursorPosition + 1,
        1,
      );

      break;
    }

    case Scene.MESSAGE: {
      clear();

      const lineSpacer = "  ";
      const lines = [
        "",
        ...state.message
          .reduce((lines: string[], line: string) => {
            if (line === "") {
              lines.push("");

              return lines;
            }

            return lines.concat(
              multilineTextLayout(
                line,
                process.stdout.columns - lineSpacer.length,
              ),
            );
          }, [])
          .map((line) => lineSpacer + line),
        "",
        "",
      ];

      render(lines);

      break;
    }
  }
}

export function render(lines: string[]) {
  process.stdout.write(lines.join("\n"));

  // Keep track of the cursor's vertical position
  // in order to know how many lines to move up
  // to clean the screen later
  renderState.cursorY = lines.length;
}

export function cursorTo(x: number, y: number) {
  const yDelta = renderState.cursorY - y;

  // Move cursor back to the first line
  // \x1b[0A will still move one line up, so
  // do not move in case there is only one line
  if (yDelta > 0) {
    process.stdout.write(`\x1b[${yDelta}A`);
  }

  // There is an escape sequence for moving
  // cursor horizontally using absolute coordinate,
  // so no need to use delta here, like for Y
  process.stdout.write(`\x1b[${x}G`);

  renderState.cursorY = y;
}

export function calculateLinesWindow(
  linesCount: number,
  highlightedLineIndex: number,
): LinesWindow {
  const windowSize = state.rows - 2;
  const windowHalf = Math.floor(windowSize / 2);

  const topIndex = Math.max(
    0,
    Math.min(linesCount - windowSize, state.highlightedLineIndex - windowHalf),
  );
  const bottomIndex = topIndex + (windowSize - 1);

  return { topIndex, bottomIndex };
}

export function calculateLayout(state: State): LayoutColumn[] {
  const indexColumnWidth = 3;
  const moreIndicatorColumnWidth = 5;
  const branchNameColumnWidth = Math.min(
    state.columns - indexColumnWidth - moreIndicatorColumnWidth,
    Math.max.apply(
      null,
      state.branches.map((branch: BranchData) => {
        return branch.name.length;
      }),
    ),
  );
  const moreIndicatorSpacingWidth =
    state.columns -
    indexColumnWidth -
    branchNameColumnWidth -
    moreIndicatorColumnWidth;

  return [
    { type: LayoutColumnType.Index, width: indexColumnWidth },
    { type: LayoutColumnType.BranchName, width: branchNameColumnWidth },
    {
      type: LayoutColumnType.MoreIndicator,
      width: moreIndicatorSpacingWidth + moreIndicatorColumnWidth,
    },
  ];
}

export function highlightLine(
  line: string,
  lineIndex: number,
  highlightedLineIndex: number,
  selected: boolean = false,
) {
  if (lineIndex === highlightedLineIndex) {
    return selected ? green(line) : highlight(line);
  }

  return line;
}

export function addScrollIndicator(
  line: string,
  lineIndex: number,
  listLength: number,
  listWindow: LinesWindow,
  layout: LayoutColumn[],
): string {
  if (
    lineIndex === listWindow.bottomIndex &&
    listWindow.bottomIndex < listLength - 1
  ) {
    return line + dim("   ↓ ".padStart(layout[layout.length - 1].width, " "));
  }

  return line;
}

export function viewCurrentHEAD(
  currentHEAD: CurrentHEAD,
  layout: LayoutColumn[],
): string {
  return layout.reduce((line: string, column: LayoutColumn) => {
    if (column.type === LayoutColumnType.Index) {
      return line + BRANCH_INDEX_PADD;
    }

    if (column.type === LayoutColumnType.BranchName) {
      const branch = currentHEAD.detached
        ? `${bold(currentHEAD.sha)} ${dim("(detached)")}`
        : bold(currentHEAD.branchName);

      return line + branch;
    }

    return line;
  }, "");
}

export function viewBranch(
  branch: BranchData,
  index: number,
  layout: LayoutColumn[],
): string {
  return layout.reduce((line: string, column: LayoutColumn) => {
    if (column.type === LayoutColumnType.Index) {
      return (
        line + (index < 10 ? ` ${dim(index.toString())} ` : BRANCH_INDEX_PADD)
      );
    }

    if (column.type === LayoutColumnType.BranchName) {
      return (
        line + truncate(branch.name, column.width).padEnd(column.width, " ")
      );
    }

    return line;
  }, "");
}

export function viewListLines(state: State, layout: LayoutColumn[]): string[] {
  let quickSelectIndex = -1;

  return state.list.map((line: ListItem) => {
    switch (line.type) {
      case ListItemVariant.HEAD: {
        return viewCurrentHEAD(line.content, layout);
      }

      case ListItemVariant.BRANCH: {
        quickSelectIndex++;

        return viewBranch(line.content, quickSelectIndex, layout);
      }
    }
  });
}

export function viewNonInteractiveList(state: State): string[] {
  const layout = [{ type: LayoutColumnType.BranchName, width: state.columns }];

  return viewListLines(state, layout);
}

export function viewList(state: State): string[] {
  if (state.list.length === 0) {
    return [`${BRANCH_INDEX_PADD}${dim("No such branches")}`];
  }

  const layout = calculateLayout(state);
  const listWindow = calculateLinesWindow(
    state.list.length,
    state.highlightedLineIndex,
  );

  return viewListLines(state, layout)
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

export function viewQuickSelectHint(
  maxIndex: number,
  columnWidth: number,
): string {
  const trailingIndex = maxIndex > 0 ? `..${maxIndex}` : "";
  const modifierKey = os.type() === "Darwin" ? "⌥" : "Alt";

  return dim(
    `${modifierKey}+0${trailingIndex} quick select `.padStart(columnWidth, " "),
  );
}

export function viewSearch(state: State, width: number): string {
  const SEARCH_PLACEHOLDER = "Search";

  return state.searchString === ""
    ? dim(SEARCH_PLACEHOLDER.padEnd(width, " "))
    : truncate(state.searchString, width).padEnd(width, " ");
}

export function viewSearchLine(state: State): string {
  const searchPlaceholderWidth = 6;
  const searchWidth = Math.min(
    state.columns - BRANCH_INDEX_PADD.length,
    Math.max(state.searchString.length, searchPlaceholderWidth),
  );
  const hintMinWidth = 25;

  let line = BRANCH_INDEX_PADD + viewSearch(state, searchWidth);
  const hintColumnWidth =
    state.columns - (BRANCH_INDEX_PADD.length + searchWidth);

  if (hintColumnWidth < hintMinWidth) {
    return line;
  }

  const quickSelectLines = getQuickSelectLines(state.list);

  if (quickSelectLines.length === 0) {
    return line;
  }

  line += viewQuickSelectHint(quickSelectLines.length - 1, hintColumnWidth);

  return line;
}

export type AppConfig = {
  mainWorktreeDir: string; // used to read jump data
  activeWorktreeDir: string; // used to read currentHEAD
  isMac: boolean;
  rows: number;
  columns: number;
  maxRows: number;
};

export type GitData = {
  branches: DisplayBranchData[];
  worktrees: Worktree[];
  // currentHEAD: worktrees.find(w => w.dir === activeWorktreeDir)
};

export type Worktree = {
  dir: string; // where on the disc is this worktree
  HEAD: CurrentHEAD; // what branch is checked out
};

export type UIState = {
  highlightedLineIndex: number;
  searchString: string;
  searchStringCursorPosition: number;
  list: ListItem[];
  scene: TScene;
  message: Message;
};

/**
 * The central state object for the entire interactive terminal application.
 * Tracks terminal dimensions, cursor positions, loaded Git data, UI list state, and package information.
 */
export type AppState = AppConfig & GitData & UIState;

export class InputError extends Error {
  title: string;

  constructor(title: string, message: string) {
    super(message);
    this.title = title;
  }
}

export type Message =
  | { kind: "error"; error: InputError }
  | { kind: "info"; content: string[] };

/**
 * Translates a standard status code and message array into a safe Message payload.
 * * @param status - The exit code of the operation (0 = success).
 * @param lines - The text output from the operation.
 * @param errorTitle - A fallback title to use if the status indicates an error.
 */
export function resolveCommandMessage(
  status: number,
  lines: string[],
  errorTitle: string = "Command Failed",
): Message {
  return status === 0
    ? infoMessage(lines)
    : errorMessage(errorTitle, lines.join("\n"));
}

export function infoMessage(content: string[]): Message {
  return { kind: "info", content };
}

export function errorMessage(title: string, content: string): Message {
  return { kind: "error", error: new InputError(title, content) };
}

export type InputResult =
  | { tag: "stateUpdate"; state: UIState }
  | { tag: "switchTo"; item: ListItem }
  | { tag: "exit" }
  | { tag: "noop" };

/**
 * Represents a single Git branch and its usage history.
 */
export type BranchData = {
  name: string;
  lastSwitch: number;
};

export type DisplayBranchData = Prettify<
  BranchData & { checkedOutIn: string | null }
>;

/**
 * Represents the current state of the working directory's HEAD.
 * Tracks whether the HEAD is detached, its commit hash, and the active branch name.
 */
export type CurrentHEAD =
  | { detached: true; sha: string; branchName: null }
  | { detached: false; sha: null; branchName: string };

export function getCurrentHEAD(state: AppState): CurrentHEAD {
  const curr = state.worktrees.find((w) => w.dir === state.activeWorktreeDir);
  if (!curr) throw new Error("Cannot find active directory HEAD");
  return curr.HEAD;
}

/**
 * A dictionary mapping branch names to their respective BranchData.
 * Used for serialising and deserialising the branch jump history.
 */
export type BranchDataCollection = { [key: string]: BranchData };

/**
 * Differentiates between the current HEAD and standard branches in the UI list.
 */
export const ListItemVariant = { HEAD: "head", BRANCH: "branch" } as const;

/**
 * A wrapper for items displayed in the terminal UI list.
 * Combines the underlying Git data with a search match score for filtering and sorting.
 */
export type ListItem =
  | {
      type: typeof ListItemVariant.HEAD;
      content: CurrentHEAD;
      searchMatchScore: number;
    }
  | {
      type: typeof ListItemVariant.BRANCH;
      content: DisplayBranchData;
      searchMatchScore: number;
    };

export type PackageInfo = {
  version: string;
  engines: {
    node: string;
  };
};

/**
 * Defines the active view or screen of the application.
 */
export const Scene = {
  LIST_PLAIN: "list_plain",
  LIST_INTERACTIVE: "list_interactive",
  MESSAGE: "message",
} as const;

export type TScene = (typeof Scene)[keyof typeof Scene];

/**
 * Defines the visible window of list items to render.
 * Used to calculate which slice of the total list should be displayed based on terminal height.
 */
export type LinesWindow = { topIndex: number; bottomIndex: number };

// each row we render can be broken up into various columns
// - some will require an index
// - some will just require displaying a branch name
// - some will contain an indicator for "more"
// for (mostly) every line we return a list of columns
// and then reduce over that list to build a single string corresponding to a row

/**
 * Categorises the different columns displayed in the UI layout.
 */
export const LayoutColumnVariant = {
  INDEX: "Index",
  BRANCH_NAME: "BranchName",
  WORKTREE_PATH: "WorktreePath",
  MORE_INDICATOR: "MoreIndicator",
} as const;

type TLayoutColumnVariant =
  (typeof LayoutColumnVariant)[keyof typeof LayoutColumnVariant];

/**
 * Defines the structural layout of a single column in the terminal UI,
 * including its type and calculated width.
 */
export type LayoutColumn = {
  type: TLayoutColumnVariant;
  width: number;
};

export type RenderOutput =
  | { tag: typeof Scene.MESSAGE; lines: string[] }
  | { tag: typeof Scene.LIST_PLAIN; lines: string[] }
  | {
      tag: typeof Scene.LIST_INTERACTIVE;
      lines: string[];
      cursor: { x: number; y: number };
    };

export type CommandResult =
  | {
      scene: typeof Scene.MESSAGE;
      message: Message;
      exitCode: number;
    }
  | {
      scene: typeof Scene.LIST_PLAIN;
      exitCode: number;
    }
  | {
      scene: typeof Scene.LIST_INTERACTIVE;
    };

export const ListSortCriterion = {
  LAST_SWITCH: "LastSwitch",
  SEARCH_MATCH_SCORE: "SearchMatchScore",
} as const;

export type TListSortCriterion =
  (typeof ListSortCriterion)[keyof typeof ListSortCriterion];

type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type Result<T> = { tag: "ok"; value: T } | { tag: "err"; error: Error };

export function ok<T>(value: T): Result<T> {
  return { tag: "ok", value };
}

export function err<T>(error: Error): Result<T> {
  return { tag: "err", error };
}

export function sequence<T>(results: Result<T>[]): Result<T[]> {
  const values: T[] = [];
  for (const r of results) {
    if (r.tag === "err") return r;
    values.push(r.value);
  }
  return ok(values);
}

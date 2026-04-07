export type AppConfig = {
  gitRepoFolder: string;
  isInteractive: boolean;
  rows: number;
  columns: number;
  maxRows: number;
};

export type GitData = {
  branches: BranchData[];
  currentHEAD: CurrentHEAD;
};

export type UIState = {
  highlightedLineIndex: number;
  searchString: string;
  searchStringCursorPosition: number;
  list: ListItem[];
  scene: Scene;
  message: string[];
};

/**
 * The central state object for the entire interactive terminal application.
 * Tracks terminal dimensions, cursor positions, loaded Git data, UI list state, and package information.
 */
export type AppState = AppConfig & GitData & UIState;

export type State = AppState;

export class InputError extends Error {
  title: string;

  constructor(title: string, message: string) {
    super(message);
    this.title = title;
  }
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

/**
 * Represents the current state of the working directory's HEAD.
 * Tracks whether the HEAD is detached, its commit hash, and the active branch name.
 */
export type CurrentHEAD =
  | { detached: true; sha: string; branchName: null }
  | { detached: false; sha: null; branchName: string };

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
      content: BranchData;
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
export const Scene = { LIST: "list", MESSAGE: "message" } as const;

export type Scene = (typeof Scene)[keyof typeof Scene];

/**
 * Defines the visible window of list items to render.
 * Used to calculate which slice of the total list should be displayed based on terminal height.
 */
export type LinesWindow = {
  topIndex: number;
  bottomIndex: number;
};

/**
 * Categorises the different columns displayed in the UI layout.
 */
export enum LayoutColumnType {
  Index,
  BranchName,
  LastUsed,
  MoreIndicator,
}

/**
 * Defines the structural layout of a single column in the terminal UI,
 * including its type and calculated width.
 */
export type LayoutColumn = {
  type: LayoutColumnType;
  width: number;
};

export type GitCommandResult = {
  status: number;
  message: string[];
  stdout: string;
  stderr: string;
};

export enum ListSortCriterion {
  LastSwitch,
  SearchMatchScore,
}

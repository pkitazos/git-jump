import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import * as fsPath from "path";
import { executeSubCommand, isSubCommand } from "./command";
import { gitSwitch, locateGitRepoFolder, readCurrentHEAD } from "./git";
import { generateList, getBranchNameForLine } from "./list";
import { parseKeys } from "./parseKeys";
import { readBranchesData } from "./storage";
import {
  checkUpdates,
  compareSemver,
  ensureNodeVersion,
  readVersion,
} from "./system";
import { InputError, ListItem, ListItemVariant, Scene, State } from "./types";
import { bold, green, red, view, yellow } from "./ui";
import { handleSpecialKey, handleStringKey, isSpecialKey } from "./input";

/**
 * The initial application state instantiated on startup.
 * It immediately captures the current terminal dimensions and defaults to the List scene.
 * It assumes an interactive terminal environment until proven otherwise.
 */
const state: State = {
  rows: process.stdout.rows,
  columns: process.stdout.columns,
  highlightedLineIndex: 0,
  maxRows: process.stdout.rows,
  branches: [],
  searchString: "",
  searchStringCursorPosition: 0,
  currentHEAD: {
    detached: false,
    sha: null,
    branchName: "",
  },
  list: [],
  lineSelected: false,
  scene: Scene.LIST,
  message: [],
  gitRepoFolder: "",
  isInteractive: true,
  latestPackageVersion: null,
  packageInfo: null,
};

/**
 * The name of the hidden directory created within the target Git repository
 * to store jump-related metadata.
 */
export const JUMP_FOLDER = ".jump";

/**
 * The relative path to the JSON file where branch usage history and timestamps are saved.
 */
export const DATA_FILE_PATH = `${JUMP_FOLDER}/data.json`;

// todo: probably bad
export function switchToListItem(item: ListItem): void {
  const branchName = getBranchNameForLine(item);

  if (item.type === ListItemVariant.HEAD) {
    state.scene = Scene.MESSAGE;
    state.message = [`Staying on ${bold(branchName)}`];
    view(state);

    process.exit(0);
  }

  const { status, message } = gitSwitch([branchName]);

  state.scene = Scene.MESSAGE;
  state.message = message;

  view(state);

  process.exit(status);
}

/**
 * Boots the interactive TUI.
 * Renders the initial view, puts the terminal standard input into raw mode,
 * and begins listening to and parsing a continuous stream of keyboard inputs.
 */
function bare() {
  view(state);

  if (!state.isInteractive) {
    process.exit(0);
  }

  process.stdin.setRawMode(true);

  process.stdin.on("data", (data: Buffer) => {
    parseKeys(data).forEach((key) => {
      const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);
      if (isSpecialKey(keyBuffer)) {
        handleSpecialKey(keyBuffer);

        return;
      }

      handleStringKey(keyBuffer);
    });
  });
}

/**
 * Attempts an immediate branch switch based on a provided search string.
 * First tries an exact git switch; if that fails, it generates a fuzzy-matched
 * list of branches and automatically switches to the best match.
 * @param args - The search string or partial branch name provided by the user.
 */
function jumpTo(args: string[]) {
  const switchResult = gitSwitch(args);

  if (switchResult.status === 0) {
    state.scene = Scene.MESSAGE;
    state.message = switchResult.message;

    view(state);

    process.exit(0);
  }

  // Generate filtered and sorted list of branches
  state.searchString = args[0];
  state.list = generateList(state);

  if (state.list.length === 0) {
    state.scene = Scene.MESSAGE;
    state.message = [
      `${bold(yellow(state.searchString))} does not match any branch`,
    ];

    view(state);

    process.exit(1);
  }

  switchToListItem(state.list[0]);
}

function handleError(error: Error): void {
  if (error instanceof InputError) {
    state.message = [`${yellow(error.title)} ${error.message}`];
  } else {
    state.message = [
      `${red("Error:")} ${error.message}`,
      "",
      `${bold("What to do?")}`,
      "Help improve git-jump, create GitHub issue with this error and steps to reproduce it. Thank you!",
      "",
      `GitHub Issues: https://github.com/pkitazos/git-jump/issues`,
    ];
  }

  state.scene = Scene.MESSAGE;
  view(state);
  process.exit(1);
}

function handleExit() {
  if (state.latestPackageVersion === null) {
    return;
  }

  const currentVersion = readVersion();

  if (compareSemver(currentVersion, state.latestPackageVersion) === -1) {
    const sourcePackageManager = existsSync(
      fsPath.join(__dirname, "../homebrew"),
    )
      ? "homebrew"
      : "npm";
    const updateCommand =
      sourcePackageManager === "npm"
        ? "npm install -g git-jump"
        : "brew upgrade git-jump";

    state.scene = Scene.MESSAGE;
    state.message = state.message.concat([
      "",
      `New version of git-jump is available: ${yellow(currentVersion)} → ${green(state.latestPackageVersion)}.`,
      `Changelog: https://github.com/pkitazos/git-jump/releases/tag/v${state.latestPackageVersion}`,
      "",
      `${bold(updateCommand)} to update.`,
    ]);

    view(state);
  }
}

function initialize() {
  state.isInteractive = process.stdout.isTTY === true;
  state.gitRepoFolder = locateGitRepoFolder(process.cwd());

  const jumpFolderPath = fsPath.join(state.gitRepoFolder, JUMP_FOLDER);
  const dataFileFullPath = fsPath.join(state.gitRepoFolder, DATA_FILE_PATH);

  if (!existsSync(jumpFolderPath)) {
    mkdirSync(jumpFolderPath);
    // Exclude .jump from Git tracking
    appendFileSync(
      fsPath.join(state.gitRepoFolder, ".git", "info", "exclude"),
      `\n${JUMP_FOLDER}`,
    );
  }

  if (!existsSync(dataFileFullPath)) {
    writeFileSync(dataFileFullPath, "{}", { flag: "a" });
  }

  state.currentHEAD = readCurrentHEAD(state.gitRepoFolder);
  state.branches = readBranchesData(state.gitRepoFolder);
  state.list = generateList(state);
  state.highlightedLineIndex = 0;
}

/**
 * The primary entry point for the application.
 * Sets up global event listeners and ensures environment compatibility,
 * initialises the application state, and routes execution based on CLI arguments.
 * @param args - The command-line arguments passed to the script (excluding node and script paths).
 */
function main(args: string[]) {
  process.on("uncaughtException", handleError);
  process.on("exit", handleExit);

  ensureNodeVersion();
  initialize();

  if (args.length === 0) {
    // Checking for updates only when interactive UI is started
    // as only then there potentially a chance for update
    // request to finish before git-jump exists
    checkUpdates();
    bare();

    return;
  }

  if (isSubCommand(args)) {
    executeSubCommand(args[0], args.slice(1));

    return;
  }

  jumpTo(args);
}

main(process.argv.slice(2));

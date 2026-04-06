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
import { DATA_FILE_PATH, JUMP_FOLDER } from "./constants";

/**
 * The initial application state instantiated on startup.
 * It immediately captures the current terminal dimensions and defaults to the List scene.
 * It assumes an interactive terminal environment until proven otherwise.
 */
export const GOD_STATE: State = {
  // these maybe also don't belong on the god state?
  rows: process.stdout.rows,
  columns: process.stdout.columns,
  maxRows: process.stdout.rows,
  // some of these are display state and some are logical state
  highlightedLineIndex: 0,
  branches: [],
  searchString: "",
  searchStringCursorPosition: 0,
  currentHEAD: {
    detached: false,
    sha: null,
    branchName: "",
  },
  list: [],
  scene: Scene.LIST,
  message: [],
  gitRepoFolder: "",
  isInteractive: true,
  // these are not like the others
  latestPackageVersion: null,
  packageInfo: null,
};

// todo: probably bad
export function switchToListItem(item: ListItem): void {
  const branchName = getBranchNameForLine(item);

  if (item.type === ListItemVariant.HEAD) {
    GOD_STATE.scene = Scene.MESSAGE;
    GOD_STATE.message = [`Staying on ${bold(branchName)}`];
    view(GOD_STATE);

    process.exit(0);
  }

  const { status, message } = gitSwitch([branchName]);

  GOD_STATE.scene = Scene.MESSAGE;
  GOD_STATE.message = message;

  view(GOD_STATE);

  process.exit(status);
}

/**
 * Boots the interactive TUI.
 * Renders the initial view, puts the terminal standard input into raw mode,
 * and begins listening to and parsing a continuous stream of keyboard inputs.
 */
function bare() {
  view(GOD_STATE);

  if (!GOD_STATE.isInteractive) {
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
    GOD_STATE.scene = Scene.MESSAGE;
    GOD_STATE.message = switchResult.message;

    view(GOD_STATE);

    process.exit(0);
  }

  // Generate filtered and sorted list of branches
  GOD_STATE.searchString = args[0];
  GOD_STATE.list = generateList(GOD_STATE);

  if (GOD_STATE.list.length === 0) {
    GOD_STATE.scene = Scene.MESSAGE;
    GOD_STATE.message = [
      `${bold(yellow(GOD_STATE.searchString))} does not match any branch`,
    ];

    view(GOD_STATE);

    process.exit(1);
  }

  switchToListItem(GOD_STATE.list[0]);
}

function handleError(error: Error): void {
  if (error instanceof InputError) {
    GOD_STATE.message = [`${yellow(error.title)} ${error.message}`];
  } else {
    GOD_STATE.message = [
      `${red("Error:")} ${error.message}`,
      "",
      `${bold("What to do?")}`,
      "Help improve git-jump, create GitHub issue with this error and steps to reproduce it. Thank you!",
      "",
      `GitHub Issues: https://github.com/pkitazos/git-jump/issues`,
    ];
  }

  GOD_STATE.scene = Scene.MESSAGE;
  view(GOD_STATE);
  process.exit(1);
}

function handleExit() {
  if (GOD_STATE.latestPackageVersion === null) {
    return;
  }

  const currentVersion = readVersion();

  if (compareSemver(currentVersion, GOD_STATE.latestPackageVersion) === -1) {
    const sourcePackageManager = existsSync(
      fsPath.join(__dirname, "../homebrew"),
    )
      ? "homebrew"
      : "npm";
    const updateCommand =
      sourcePackageManager === "npm"
        ? "npm install -g git-jump"
        : "brew upgrade git-jump";

    GOD_STATE.scene = Scene.MESSAGE;
    GOD_STATE.message = GOD_STATE.message.concat([
      "",
      `New version of git-jump is available: ${yellow(currentVersion)} → ${green(GOD_STATE.latestPackageVersion)}.`,
      `Changelog: https://github.com/pkitazos/git-jump/releases/tag/v${GOD_STATE.latestPackageVersion}`,
      "",
      `${bold(updateCommand)} to update.`,
    ]);

    view(GOD_STATE);
  }
}

function initialize() {
  GOD_STATE.isInteractive = process.stdout.isTTY === true;
  GOD_STATE.gitRepoFolder = locateGitRepoFolder(process.cwd());

  const jumpFolderPath = fsPath.join(GOD_STATE.gitRepoFolder, JUMP_FOLDER);
  const dataFileFullPath = fsPath.join(GOD_STATE.gitRepoFolder, DATA_FILE_PATH);

  if (!existsSync(jumpFolderPath)) {
    mkdirSync(jumpFolderPath);
    // Exclude .jump from Git tracking
    appendFileSync(
      fsPath.join(GOD_STATE.gitRepoFolder, ".git", "info", "exclude"),
      `\n${JUMP_FOLDER}`,
    );
  }

  if (!existsSync(dataFileFullPath)) {
    writeFileSync(dataFileFullPath, "{}", { flag: "a" });
  }

  GOD_STATE.currentHEAD = readCurrentHEAD(GOD_STATE.gitRepoFolder);
  GOD_STATE.branches = readBranchesData(GOD_STATE.gitRepoFolder);
  GOD_STATE.list = generateList(GOD_STATE);
  GOD_STATE.highlightedLineIndex = 0;
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

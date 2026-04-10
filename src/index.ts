import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import * as os from "os";
import * as fsPath from "path";

import { executeSubCommand, isSubCommand } from "./command";
import { DATA_FILE_PATH, JUMP_FOLDER } from "./constants";
import {
  gitCommand,
  locateGitRepoFolder,
  readCurrentHEAD,
  readRawGitBranches,
} from "./git";
import { handleKey } from "./input";
import { generateList, getBranchNameForLine } from "./list";
import { parseKeys } from "./parseKeys";
import { getAndCleanBranchData } from "./storage";
import {
  ensureNodeVersion,
  fetchLatestVersion,
  isOlderVersion,
  readPackageInfo,
} from "./system";
import {
  AppState,
  errorMessage,
  infoMessage,
  InputError,
  ListItem,
  ListItemVariant,
  Message,
  Scene,
  State,
} from "./types";
import { bold, buildView, clear, green, red, yellow } from "./ui";
import { match } from "./utils";

/**
 * The initial application state instantiated on startup.
 * It immediately captures the current terminal dimensions and defaults to the List scene.
 * It assumes an interactive terminal environment until proven otherwise.
 */
export const GOD_STATE: State = {
  rows: process.stdout.rows,
  columns: process.stdout.columns,
  isMac: os.type() === "Darwin",
  maxRows: process.stdout.rows,
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
  scene: Scene.LIST_PLAIN,
  message: {} as Message,
  gitRepoFolder: "",
};

let latestPackageVersion: Promise<string | null> | null = null;

// todo: should return the necessary state change.
// It actually seems like this just returns a CommandResult??
function switchToListItem(item: ListItem): void {
  const branchName = getBranchNameForLine(item);

  // if we picked the branch we're already on
  if (item.type === ListItemVariant.HEAD) {
    GOD_STATE.scene = Scene.MESSAGE;
    GOD_STATE.message = infoMessage([`Staying on ${bold(branchName)}`]);
    buildView(GOD_STATE);
    // stat, render and exit
    process.exit(0);
  }

  // otherwise try to switch (in the jumpTo we already tried, so it seems like we're trying twice)
  const { status, message } = gitCommand("switch", [branchName]);

  GOD_STATE.scene = Scene.MESSAGE;
  // this isn't necessarily an info message and could actually be an error
  // so we should check the status before committing to either
  GOD_STATE.message = infoMessage(message);

  buildView(GOD_STATE);

  process.exit(status);
}

/**
 * Boots the interactive TUI.
 * Renders the initial view, puts the terminal standard input into raw mode,
 * and begins listening to and parsing a continuous stream of keyboard inputs.
 */
function bare(state: AppState) {
  buildView(state);

  process.stdin.setRawMode(true);

  process.stdin.on("data", (data: Buffer) => {
    parseKeys(data).forEach((key) => {
      const keyBuffer = Buffer.isBuffer(key) ? key : Buffer.from(key);

      const result = handleKey(keyBuffer, state);

      switch (result.tag) {
        case "noop":
          break;

        case "stateUpdate":
          // can clean this up later
          Object.assign(state, result.state);
          buildView(state);
          break;

        case "switchTo":
          switchToListItem(result.item);
          // then here we would
          // 1. take that result
          // 2. update our state
          // 3. render
          break;

        case "exit":
          clear();
          process.exit();
          break;
      }
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
  const switchResult = gitCommand("switch", args);

  // if the switch is successful
  if (switchResult.status === 0) {
    GOD_STATE.scene = Scene.MESSAGE;
    GOD_STATE.message = infoMessage(switchResult.message);

    // we render
    buildView(GOD_STATE);

    // and exit
    process.exit(0);
  }

  // otherwise, maybe our switch was not successful?
  // so maybe we tried to jump to a specific branch?
  // so ig less check

  // Generate filtered and sorted list of branches
  GOD_STATE.searchString = args[0];
  GOD_STATE.list = generateList(
    GOD_STATE.branches,
    GOD_STATE.currentHEAD,
    GOD_STATE.searchString,
  );

  // if that list is empty
  if (GOD_STATE.list.length === 0) {
    GOD_STATE.scene = Scene.MESSAGE;
    // then we can give the user some feedback and tell them that the string they tried to use to jump does not match
    GOD_STATE.message = infoMessage([
      `${bold(yellow(GOD_STATE.searchString))} does not match any branch`,
    ]);

    buildView(GOD_STATE);

    // and then we exit with an error
    process.exit(1);
  }

  // otherwise, switch anyway?
  switchToListItem(GOD_STATE.list[0]);
}

function handleError(error: Error): void {
  // todo: verify that no InputError are ever thrown, that they are only returned.
  // In which case we would only need the else branch from here
  if (error instanceof InputError) {
    GOD_STATE.message = errorMessage(yellow(error.title), error.message);
  } else {
    GOD_STATE.message = errorMessage(
      `${red("Error:")} ${error.message}`,
      [
        "",
        `${bold("What to do?")}`,
        "Help improve git-jump, create GitHub issue with this error and steps to reproduce it. Thank you!",
        "",
        `GitHub Issues: https://github.com/pkitazos/git-jump/issues`,
      ].join("\n"),
    );
  }

  GOD_STATE.scene = Scene.MESSAGE;
  buildView(GOD_STATE);
  process.exit(1);
}

/**
 * Before exiting, it compares the latest version of the package that exists
 * with the current version of the installed package.
 * If there is a discrepancy it prints some info to the terminal. This function
 * doesn't really "handle" the "exit" it's more like the "shutdown procedure"
 */
async function handleExit() {
  let latestVersion = await latestPackageVersion;
  if (latestVersion === null) return;

  const { version: currentVersion } = readPackageInfo();

  if (isOlderVersion(currentVersion, latestVersion)) {
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

    let messageContent =
      GOD_STATE.message.kind === "info" ? GOD_STATE.message.content : [];

    GOD_STATE.message = infoMessage([
      ...messageContent,
      "",
      `New version of git-jump is available: ${yellow(currentVersion)} → ${green(latestVersion)}.`,
      `Changelog: https://github.com/pkitazos/git-jump/releases/tag/v${latestVersion}`,
      "",
      `${bold(updateCommand)} to update.`,
    ]);

    buildView(GOD_STATE);
  }
}

function initialize() {
  // so because I've converted a lot of my utils to return errors as values
  // this function will wither become incredibly nested or
  // we need to set up some kind of monadic bind to be able to handle early return errors
  // and keep control flow clean
  const res1 = locateGitRepoFolder(process.cwd());

  match(res1, "tag", {
    ok: ({ value: gitRepoFolder }) => {
      GOD_STATE.gitRepoFolder = gitRepoFolder;
    },

    err: () => new Error("Function not implemented."),
  });

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

  const res2 = readRawGitBranches();

  match(res2, "tag", {
    ok: ({ value: rawGitBranches }) => {
      GOD_STATE.branches = getAndCleanBranchData(
        rawGitBranches,
        GOD_STATE.gitRepoFolder,
      );
    },

    err: () => new Error("Function not implemented."),
  });

  const res3 = readCurrentHEAD(GOD_STATE.gitRepoFolder);

  match(res3, "tag", {
    ok: ({ value: currHead }) => {
      GOD_STATE.currentHEAD = currHead;
    },

    err: () => new Error("Function not implemented."),
  });

  GOD_STATE.list = generateList(
    GOD_STATE.branches,
    GOD_STATE.currentHEAD,
    GOD_STATE.searchString,
  );
  GOD_STATE.highlightedLineIndex = 0;
}

/**
 * The primary entry point for the application.
 * Sets up global event listeners and ensures environment compatibility,
 * initialises the application state, and routes execution based on CLI arguments.
 * @param args - The command-line arguments passed to the script (excluding node and script paths).
 */
function main(args: string[]) {
  let state: State = {
    rows: process.stdout.rows,
    columns: process.stdout.columns,
    isMac: os.type() === "Darwin",
    maxRows: process.stdout.rows,
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
    scene: Scene.LIST_PLAIN,
    message: { kind: "info", content: [] },
    gitRepoFolder: "",
  };

  process.on("uncaughtException", handleError);
  process.on("exit", handleExit);

  // todo: handle Result
  ensureNodeVersion();

  // unless we can set up some kind of monad, having this also return a Result
  // will make the main function very hard to read
  initialize();

  if (args.length === 0) {
    // Checking for updates only when interactive UI is started
    // as only then there potentially a chance for update
    // request to finish before git-jump exists
    latestPackageVersion = fetchLatestVersion();
    // not actually rendering shit
    bare(state);
    return;
  }

  if (isSubCommand(args)) {
    // same here
    executeSubCommand(state, args[0], args.slice(1));

    return;
  }

  jumpTo(args);
}

main(process.argv.slice(2));

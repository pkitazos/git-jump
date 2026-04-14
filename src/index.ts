import { appendFileSync, existsSync, mkdirSync, writeFileSync } from "fs";
import * as os from "os";
import * as fsPath from "path";

import {
  executeSubCommand,
  handleError,
  isSubCommand,
  jumpTo,
  switchToListItem,
} from "./command";
import { DATA_FILE_PATH, JUMP_FOLDER } from "./constants";
import {
  locateGitRepoFolder,
  readCurrentHEAD,
  readRawGitBranches,
} from "./git";
import { handleKey } from "./input";
import { generateList } from "./list";
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
  BranchData,
  CommandResult,
  CurrentHEAD,
  infoMessage,
  ListItem,
  Message,
  ok,
  Result,
  Scene,
  State,
} from "./types";
import { bold, clear, green, renderView, yellow } from "./ui";
import { match } from "./utils";

let latestPackageVersion: Promise<string | null> | null = null;

/**
 * Boots the interactive TUI.
 * Renders the initial view, puts the terminal standard input into raw mode,
 * and begins listening to and parsing a continuous stream of keyboard inputs.
 */
async function bare(state: AppState) {
  renderView(state);

  process.stdin.setRawMode(true);

  process.stdin.on("data", (data: Buffer) => {
    const parsed = parseKeys(data);
    if (parsed.tag === "err") return;

    parsed.value.forEach((key) =>
      match(handleKey(key, state), "tag", {
        noop: () => {},

        stateUpdate: ({ state: patch }) => {
          state = Object.assign(state, patch);
          renderView(state);
        },

        switchTo: ({ item }) => {
          const cmd = switchToListItem(item);
          state = applyCommandResult(state, cmd);
          renderView(state);
          shutdown(state, cmd.exitCode);
        },

        exit: () => {
          clear();
          shutdown(state, 0);
        },
      }),
    );
  });
}

function buildUpdateMessage(
  currentVersion: string,
  latestVersion: string,
  currentMessage: Message,
  isHomebrew: boolean,
): Message {
  const updateCommand = isHomebrew
    ? "brew upgrade git-jump"
    : "npm install -g git-jump";

  const existingContent =
    currentMessage.kind === "info" ? currentMessage.content : [];

  return infoMessage([
    ...existingContent,
    "",
    `New version of git-jump is available: ${yellow(currentVersion)} → ${green(latestVersion)}.`,
    `Changelog: https://github.com/pkitazos/git-jump/releases/tag/v${latestVersion}`,
    "",
    `${bold(updateCommand)} to update.`,
  ]);
}

function applyCommandResult(state: State, cmd: CommandResult): State {
  if (cmd.scene !== Scene.MESSAGE) return { ...state, scene: cmd.scene };
  return { ...state, scene: cmd.scene, message: cmd.message };
}

async function shutdown(state: State, exitCode: number) {
  const latestVersion = await latestPackageVersion;

  if (latestVersion !== null) {
    const res = readPackageInfo();

    if (res.tag === "ok" && isOlderVersion(res.value.version, latestVersion)) {
      const isHomebrew = existsSync(fsPath.join(__dirname, "../homebrew"));
      state.message = buildUpdateMessage(
        res.value.version,
        latestVersion,
        state.message,
        isHomebrew,
      );
      state.scene = Scene.MESSAGE;
      renderView(state);
    }
  }

  process.exit(exitCode);
}

type InitData = {
  gitRepoFolder: string;
  branches: BranchData[];
  currentHEAD: CurrentHEAD;
  list: ListItem[];
};

function ensureJumpFolder(gitRepoFolder: string) {
  const jumpFolderPath = fsPath.join(gitRepoFolder, JUMP_FOLDER);
  const dataFileFullPath = fsPath.join(gitRepoFolder, DATA_FILE_PATH);

  if (!existsSync(jumpFolderPath)) {
    mkdirSync(jumpFolderPath);
    appendFileSync(
      fsPath.join(gitRepoFolder, ".git", "info", "exclude"),
      `\n${JUMP_FOLDER}`,
    );
  }

  if (!existsSync(dataFileFullPath)) {
    writeFileSync(dataFileFullPath, "{}", { flag: "a" });
  }
}

function initialize(): Result<InitData> {
  const res1 = locateGitRepoFolder(process.cwd());
  if (res1.tag === "err") return res1;

  const gitRepoFolder = res1.value;

  ensureJumpFolder(gitRepoFolder);

  const res2 = readRawGitBranches();
  if (res2.tag === "err") return res2;

  const res3 = getAndCleanBranchData(res2.value, gitRepoFolder);
  if (res3.tag === "err") return res3;
  const branches = res3.value;

  const res4 = readCurrentHEAD(gitRepoFolder);
  if (res4.tag === "err") return res4;

  const currentHEAD = res4.value;
  const list = generateList(branches, currentHEAD, "");

  return ok({ gitRepoFolder, branches, currentHEAD, list });
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

  process.on("uncaughtException", (error) => {
    state.message = handleError(error);
    state.scene = Scene.MESSAGE;
    renderView(state);
    process.exit(1);
  });

  const nodeCheck = ensureNodeVersion();
  if (nodeCheck.tag === "err") {
    state.message = handleError(nodeCheck.error);
    state.scene = Scene.MESSAGE;
    renderView(state);
    process.exit(1);
  }

  const initResult = initialize();
  if (initResult.tag === "err") {
    state.message = handleError(initResult.error);
    state.scene = Scene.MESSAGE;
    renderView(state);
    process.exit(1);
  }

  const { gitRepoFolder, branches, currentHEAD, list } = initResult.value;
  Object.assign(state, {
    gitRepoFolder,
    branches,
    currentHEAD,
    list,
    highlightedLineIndex: 0,
  });

  if (args.length === 0) {
    // Checking for updates only when interactive UI is started
    // as only then there potentially a chance for update
    // request to finish before git-jump exists
    Object.assign(state, { scene: Scene.LIST_INTERACTIVE });
    latestPackageVersion = fetchLatestVersion();
    return bare(state);
  }

  if (isSubCommand(args)) {
    const cmd = executeSubCommand(state, args[0], args.slice(1));
    state = applyCommandResult(state, cmd);

    if (cmd.scene === Scene.LIST_INTERACTIVE) {
      latestPackageVersion = fetchLatestVersion();
      return bare(state);
    }

    renderView(state);
    process.exit(cmd.exitCode);
  }

  const cmd = jumpTo(args, state.branches, state.currentHEAD);

  state = applyCommandResult(state, cmd);
  renderView(state);
  process.exit(cmd.exitCode);
}

main(process.argv.slice(2));

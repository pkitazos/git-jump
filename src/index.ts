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
  enrichBranches,
  listWorktrees,
  locateGitRepoDirs,
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
  AppConfig,
  AppState,
  CommandResult,
  DisplayBranchData,
  GitData,
  infoMessage,
  ListItem,
  Message,
  ok,
  Result,
  Scene,
  UIState,
  Worktree,
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
  // isHomebrew: boolean,
): Message {
  // const updateCommand = isHomebrew
  //   ? "brew upgrade git-jump"
  //   : "npm install -g git-jump";
  const updateCommand = "npm install -g git-jump";

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

function applyCommandResult(state: AppState, cmd: CommandResult): AppState {
  if (cmd.scene !== Scene.MESSAGE) return { ...state, scene: cmd.scene };
  return { ...state, scene: cmd.scene, message: cmd.message };
}

async function shutdown(state: AppState, exitCode: number) {
  const latestVersion = await latestPackageVersion;

  if (latestVersion !== null) {
    const res = readPackageInfo();

    if (res.tag === "ok" && isOlderVersion(res.value.version, latestVersion)) {
      // const isHomebrew = existsSync(fsPath.join(__dirname, "../homebrew"));
      state.message = buildUpdateMessage(
        res.value.version,
        latestVersion,
        state.message,
        // isHomebrew,
      );
      state.scene = Scene.MESSAGE;
      renderView(state);
    }
  }

  process.exit(exitCode);
}

type InitData = {
  mainWorktreeDir: string;
  activeWorktreeDir: string;
  worktrees: Worktree[];
  branches: DisplayBranchData[];
  list: ListItem[];
};

function ensureJumpFolder(mainWorktreeDir: string) {
  const jumpFolderPath = fsPath.join(mainWorktreeDir, JUMP_FOLDER);
  const dataFileFullPath = fsPath.join(mainWorktreeDir, DATA_FILE_PATH);

  if (!existsSync(jumpFolderPath)) {
    mkdirSync(jumpFolderPath);
    appendFileSync(
      fsPath.join(mainWorktreeDir, ".git/info/exclude"),
      `\n${JUMP_FOLDER}`,
    );
  }

  if (!existsSync(dataFileFullPath)) {
    writeFileSync(dataFileFullPath, "{}", { flag: "a" });
  }
}

function initialize(): Result<InitData> {
  const repoDirsRes = locateGitRepoDirs(process.cwd());
  if (repoDirsRes.tag === "err") return repoDirsRes;

  const { activeWorktreeDir, mainWorktreeDir } = repoDirsRes.value;

  ensureJumpFolder(mainWorktreeDir);

  const rawBranchesRes = readRawGitBranches();
  if (rawBranchesRes.tag === "err") return rawBranchesRes;
  const rawBranches = rawBranchesRes.value;

  const worktreesRes = listWorktrees();
  if (worktreesRes.tag === "err") return worktreesRes;
  const worktrees = worktreesRes.value;

  const cleanBranchesRes = getAndCleanBranchData(rawBranches, mainWorktreeDir);
  if (cleanBranchesRes.tag === "err") return cleanBranchesRes;

  const branches = enrichBranches(
    cleanBranchesRes.value,
    worktrees,
    activeWorktreeDir,
  );

  const currentHEAD = worktrees.find((w) => w.dir === activeWorktreeDir)!.HEAD;

  const list = generateList(branches, currentHEAD, "");

  return ok({
    activeWorktreeDir,
    mainWorktreeDir,
    worktrees,
    branches,
    list,
  });
}

/**
 * The primary entry point for the application.
 * Sets up global event listeners and ensures environment compatibility,
 * initialises the application state, and routes execution based on CLI arguments.
 * @param args - The command-line arguments passed to the script (excluding node and script paths).
 */
function main(args: string[]) {
  let appConfig: AppConfig = {
    rows: process.stdout.rows,
    columns: process.stdout.columns,
    maxRows: process.stdout.rows,
    isMac: os.type() === "Darwin",
    mainWorktreeDir: "",
    activeWorktreeDir: "",
  };

  let ui: UIState = {
    highlightedLineIndex: 0,
    searchString: "",
    searchStringCursorPosition: 0,
    list: [],
    scene: "list_plain",
    message: {
      kind: "info",
      content: [],
    },
  };

  let gitData: GitData = {
    branches: [],
    worktrees: [],
  };

  let state: AppState = {
    ...appConfig,
    ...ui,
    ...gitData,
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

  Object.assign(state, {
    ...initResult.value,
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

  const cmd = jumpTo(state, args);

  state = applyCommandResult(state, cmd);
  renderView(state);
  process.exit(cmd.exitCode);
}

main(process.argv.slice(2));

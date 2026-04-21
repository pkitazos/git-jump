import { readFileSync } from "fs";
import * as fsPath from "path";
import { fetchRemoteBranches, gitCommand } from "./git";
import { generateList, getBranchNameForLine } from "./list";
import {
  deleteJumpDataBranch,
  renameJumpDataBranch,
  updateBranchLastSwitch,
} from "./storage";
import { readPackageInfo } from "./system";
import {
  AppConfig,
  AppState,
  CommandResult,
  errorMessage,
  getCurrentHEAD,
  infoMessage,
  InputError,
  ListItem,
  ListItemVariant,
  Message,
  resolveCommandMessage,
  Scene,
} from "./types";
import { bold, formatHelpText, red } from "./ui";

export function isSubCommand(args: string[]): boolean {
  const isDashDashSubCommand = [
    "--list",
    "--version",
    "-l",
    "-v",
    "-h",
  ].includes(args[0]);

  const isMultiArgumentSubCommand =
    args.length > 1 && ["new", "delete", "rename"].includes(args[0]);

  return isDashDashSubCommand || isMultiArgumentSubCommand;
}

/**
 * A switchboard function that routes execution to specific sub-command logic.
 * It bypasses the interactive UI to perform direct operations.
 * @param name - The primary sub-command name (e.g., "--list", "new", "rename").
 * @param args - Any subsequent arguments required by the specific sub-command.
 */
export function executeSubCommand(
  config: AppConfig,
  name: string,
  args: string[],
): CommandResult {
  switch (name) {
    case "--list":
    case "-l":
      return listSubCommand();

    case "--version":
    case "-v":
      return versionSubCommand();

    // --help is handled by git natively, it open man page
    // using ./git-jump.1
    case "-h":
      return helpSubCommand(config);

    case "new":
      return newSubCommand(config, args);

    case "rename":
      return renameSubCommand(config, args);

    case "delete":
      return deleteSubCommand(config, args);

    default:
      return {
        exitCode: 1,
        scene: Scene.MESSAGE,
        message: errorMessage(
          `Unknown command ${bold(`git jump ${name}`)}`,
          `See ${bold("git jump --help")} for the list of supported commands.`,
        ),
      };
  }
}

/// side-effect: read packageInfo
function versionSubCommand(): CommandResult {
  const res = readPackageInfo();

  if (res.tag === "err")
    return {
      scene: Scene.MESSAGE,
      message: handleError(res.error),
      exitCode: 1,
    };

  return {
    scene: Scene.MESSAGE,
    message: infoMessage([res.value.version, ""]),
    exitCode: 0,
  };
}

function listSubCommand(): CommandResult {
  return {
    scene: Scene.LIST_PLAIN,
    exitCode: 0,
  };
}

/// side-effect: update the JumpData file
function newSubCommand(config: AppConfig, args: string[]): CommandResult {
  const { status, message } = gitCommand("switch", ["--create", ...args]);

  if (status === 0) {
    updateBranchLastSwitch(args[0], Date.now(), config.mainWorktreeDir);
  }

  return {
    scene: Scene.MESSAGE,
    message: resolveCommandMessage(
      status,
      message,
      "Failed to Create new Branch",
    ),
    exitCode: status,
  };
}

/// side-effect: read the help text
function helpSubCommand(config: AppConfig): CommandResult {
  const rawHelp = readFileSync(
    fsPath.join(__dirname, "../docs/help.txt"),
  ).toString();

  return {
    scene: Scene.MESSAGE,
    message: infoMessage(formatHelpText(rawHelp, config.columns)),
    exitCode: 0,
  };
}

/// side-effect: update the JumpData file
function renameSubCommand(config: AppConfig, args: string[]): CommandResult {
  if (args.length < 2) {
    return {
      exitCode: 1,
      scene: Scene.MESSAGE,
      message: errorMessage(
        "Wrong Format.",
        `You should specify both current and new branch name, ${bold("git jump rename <old branch name> <new branch name>")}.`,
      ),
    };
  }

  const { status, message } = gitCommand("branch", [
    "--move",
    args[0],
    args[1],
  ]);

  if (status !== 0) {
    return {
      scene: Scene.MESSAGE,
      message: resolveCommandMessage(
        status,
        message,
        "Failed to Rename Branch",
      ),
      exitCode: status,
    };
  }

  renameJumpDataBranch(args[0], args[1], config.mainWorktreeDir);
  message.push("Renamed.");

  return {
    scene: Scene.MESSAGE,
    message: infoMessage(message),
    exitCode: 0,
  };
}

/// side-effect: update the JumpData file
function deleteSubCommand(config: AppConfig, args: string[]): CommandResult {
  const { status, message } = gitCommand("branch", ["--delete", ...args]);

  if (status === 0) deleteJumpDataBranch(args, config.mainWorktreeDir);

  return {
    scene: Scene.MESSAGE,
    message: resolveCommandMessage(status, message, "Failed to Delete Branch"),
    exitCode: status,
  };
}

type CommandResultMessage = CommandResult extends infer R
  ? R extends { scene: typeof Scene.MESSAGE }
    ? R
    : never
  : never;

/// side-effect: execute git switch
export function switchToListItem(item: ListItem): CommandResultMessage {
  const branchName = getBranchNameForLine(item);

  if (item.type === ListItemVariant.HEAD) {
    return {
      scene: Scene.MESSAGE,
      message: infoMessage([`Staying on ${bold(branchName)}`]),
      exitCode: 0,
    };
  }

  const { status, message } = gitCommand("switch", [branchName]);

  return {
    scene: Scene.MESSAGE,
    message: resolveCommandMessage(status, message, "Failed to Switch Branch"),
    exitCode: status,
  };
}

/// side-effect: execute git switch
export function jumpTo(
  { activeWorktreeDir, branches, worktrees }: AppState,
  args: string[],
): CommandResultMessage {
  const target = args[0];
  const curr = worktrees.find((w) => w.dir === activeWorktreeDir)!;

  if (
    args.length === 1 &&
    !curr.HEAD.detached &&
    target === curr.HEAD.branchName
  ) {
    return {
      scene: Scene.MESSAGE,
      message: infoMessage([`Staying on ${bold(curr.HEAD.branchName)}`]),
      exitCode: 0,
    };
  }

  const switchResult = gitCommand("switch", args);

  if (switchResult.status === 0) {
    return {
      scene: Scene.MESSAGE,
      message: infoMessage(switchResult.message),
      exitCode: 0,
    };
  }

  if (args.length === 1) {
    const remoteResult = fetchRemoteBranches();

    // If the branch exists as a remote, the switch failure wasn't about the branch name
    // so we surface the real git error instead of fuzzy searching
    if (remoteResult.tag === "ok" && remoteResult.value.includes(target)) {
      return {
        scene: Scene.MESSAGE,
        message: errorMessage("Switch Error", switchResult.message.join("\n")),
        exitCode: 1,
      };
    }

    // Otherwise, fall through to fuzzy search on local branches
    const list = generateList(branches, curr.HEAD, target);

    if (list.length === 0) {
      return {
        scene: Scene.MESSAGE,
        message: errorMessage(
          "No Match",
          `${bold(target)} does not match any branch`,
        ),
        exitCode: 1,
      };
    }

    return switchToListItem(list[0]);
  }

  return {
    scene: Scene.MESSAGE,
    message: errorMessage("Switch Error", switchResult.message.join("\n")),
    exitCode: 1,
  };
}

export function handleError(error: Error): Message {
  if (error instanceof InputError) {
    return errorMessage(red(error.title), error.message);
  }

  return errorMessage(
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

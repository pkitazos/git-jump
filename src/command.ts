import { readFileSync } from "fs";
import * as fsPath from "path";
import { gitCommand } from "./git";
import {
  deleteJumpDataBranch,
  renameJumpDataBranch,
  updateBranchLastSwitch,
} from "./storage";
import { readPackageInfo } from "./system";
import {
  AppConfig,
  CommandResult,
  errorMessage,
  infoMessage,
  resolveCommandMessage,
  Scene,
} from "./types";
import { bold, formatHelpText } from "./ui";

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
    updateBranchLastSwitch(args[0], Date.now(), config.gitRepoFolder);
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

  renameJumpDataBranch(args[0], args[1], config.gitRepoFolder);
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

  if (status === 0) deleteJumpDataBranch(args, config.gitRepoFolder);

  return {
    scene: Scene.MESSAGE,
    message: resolveCommandMessage(status, message, "Failed to Delete Branch"),
    exitCode: status,
  };
}

import { readFileSync } from "fs";
import * as fsPath from "path";
import { gitCommand, gitSwitch } from "./git";
import {
  deleteJumpDataBranch,
  renameJumpDataBranch,
  updateBranchLastSwitch,
} from "./storage";
import { readPackageInfo } from "./system";
import { InputError, Scene } from "./types";
import { bold, dim, wrapText, view } from "./ui";
import { GOD_STATE } from ".";

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
export function executeSubCommand(name: string, args: string[]) {
  switch (name) {
    case "--list":
    case "-l": {
      listSubCommand();
      break;
    }
    case "--version":
    case "-v": {
      versionSubCommand();
      break;
    }
    // --help is handled by git natively, it open man page
    // using ./git-jump.1
    case "-h": {
      helpSubCommand();
      break;
    }
    case "new": {
      newSubCommand(args);
      break;
    }
    case "rename": {
      renameSubCommand(args);
      break;
    }
    case "delete": {
      deleteSubCommand(args);
      break;
    }
    default: {
      throw new InputError(
        `Unknown command ${bold(`git jump ${name}`)}`,
        `See ${bold("git jump --help")} for the list of supported commands.`,
      );
    }
  }
}

function versionSubCommand() {
  let { version } = readPackageInfo();
  process.stdout.write(`${version}\n`);
  process.exit(0);
}

function listSubCommand(): void {
  GOD_STATE.isInteractive = false;

  view(GOD_STATE);

  process.exit(0);
}

function newSubCommand(args: string[]): void {
  const { status, message } = gitSwitch(["--create", ...args]);

  GOD_STATE.scene = Scene.MESSAGE;
  GOD_STATE.message = message;

  if (status === 0) {
    updateBranchLastSwitch(args[0], Date.now(), GOD_STATE);
  }

  view(GOD_STATE);

  process.exit(status);
}

function helpSubCommand(): void {
  let help = readFileSync(fsPath.join(__dirname, "../help.txt")).toString();

  help = help.replace(/\{bold\}(.+)\{\/bold\}/g, (substring, content) =>
    bold(content),
  );
  help = help.replace(/\{dim\}(.+)\{\/dim\}/g, (substring, content) =>
    dim(content),
  );
  help = help.replace(
    /\{wrap:(\d+)\}(.+)\{\/wrap\}/g,
    (substring, paddingSize, content) => {
      return wrapText(
        content.trim(),
        process.stdout.columns - parseInt(paddingSize),
      )
        .map((line, index) => {
          // Padding only the lines which wrap to the next line,
          // first line supposed to be already padded
          return index === 0 ? line : " ".repeat(paddingSize) + line;
        })
        .join("\n");
    },
  );

  process.stdout.write(help);

  process.exit(0);
}

function renameSubCommand(args: string[]): void {
  if (args.length < 2) {
    throw new InputError(
      "Wrong Format.",
      `You should specify both current and new branch name, ${bold("git jump rename <old branch name> <new branch name>")}.`,
    );
  }

  const { status, message } = gitCommand("branch", [
    "--move",
    args[0],
    args[1],
  ]);

  GOD_STATE.scene = Scene.MESSAGE;
  GOD_STATE.message = message;

  if (status === 0) {
    renameJumpDataBranch(args[0], args[1], GOD_STATE);

    GOD_STATE.message.push("Renamed.");
  }

  view(GOD_STATE);

  process.exit(status);
}

function deleteSubCommand(args: string[]): void {
  const { status, message } = gitCommand("branch", ["--delete", ...args]);

  GOD_STATE.scene = Scene.MESSAGE;
  GOD_STATE.message = message;

  if (status === 0) {
    deleteJumpDataBranch(args, GOD_STATE);
  }

  view(GOD_STATE);

  process.exit(status);
}

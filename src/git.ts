import { spawnSync } from "child_process";
import { opendirSync, readFileSync } from "fs";
import * as fsPath from "path";
import { updateBranchLastSwitch } from "./storage";
import { CurrentHEAD, GitCommandResult, InputError } from "./types";
import { bold, dim, green, red } from "./ui";

export function locateGitRepoFolder(folder: string): string {
  const dir = opendirSync(folder);

  let item = dir.readSync();
  let found = false;

  while (item !== null && !found) {
    found = item.isDirectory() && item.name === ".git";
    item = dir.readSync();
  }

  dir.closeSync();

  if (found) {
    return folder;
  }

  if (folder === "/") {
    throw new InputError(
      `You're not in Git repo.`,
      "There is no Git repository in current or any parent folder.",
    );
  }

  return locateGitRepoFolder(fsPath.resolve(folder, ".."));
}

export function readRawGitBranches(): string[] {
  const { stdout, stderr, error } = spawnSync(
    "git",
    ["branch", `--format=%(refname:short)`],
    { encoding: "utf-8" },
  );

  if (error) {
    throw new Error(
      `Could not get the list of Git branches. Cause: ${error.message}. Stacktrace: ${error.stack}.`,
    );
  }

  if (stderr !== "") {
    throw new Error(
      `Could not get the list of Git branches. Cause: ${stderr}.`,
    );
  }

  return stdout.split("\n").filter((branchName) => branchName !== "");
}

export function readCurrentHEAD(gitRepoFolder: string): CurrentHEAD {
  const head = readFileSync(fsPath.join(gitRepoFolder, ".git/HEAD")).toString();

  if (!head.startsWith("ref:")) {
    return { detached: true, sha: head.slice(0, 7).trim(), branchName: null };
  }

  return { detached: false, sha: null, branchName: head.slice(16).trim() };
}

/**
 * Executes a Git command synchronously and formats the output for the UI.
 * It catches errors and neatly packages the standard output and error streams.
 * @param command - The primary Git sub-command to run (e.g., "branch", "switch").
 * @param args - Additional flags or arguments for the command.
 * @returns An object containing the exit status, formatted UI messages, and raw stdout/stderr.
 */
export function gitCommand(command: string, args: string[]): GitCommandResult {
  const commandString = ["git", command, ...args].join(" ");

  let { stdout, stderr, error, status } = spawnSync("git", [command, ...args], {
    encoding: "utf-8",
  });

  if (error) {
    throw new Error(`Could not run ${bold(commandString)}.`);
  }

  const cleanLines = (text: string) =>
    text
      .trim()
      .split("\n")
      .filter((line) => line !== "");

  const statusCode = status ?? 1;
  const statusIndicatorColor = statusCode > 0 ? red : green;
  const message = [
    statusIndicatorColor("‣ ") + dim(commandString),
    ...cleanLines(stdout),
    ...cleanLines(stderr),
  ];

  return { status: statusCode, message, stdout, stderr };
}

export function gitSwitch(args: string[]): GitCommandResult {
  const isParameter = (argument: string) =>
    argument.startsWith("-") || argument.startsWith("--");
  const switchResult = gitCommand("switch", args);
  const branchName =
    args.length === 1 && !isParameter(args[0]) ? args[0] : null;

  if (switchResult.status === 0 && branchName !== null) {
    updateBranchLastSwitch(branchName, Date.now(), state);
  }

  return switchResult;
}

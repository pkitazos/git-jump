import { spawnSync } from "child_process";
import { opendirSync, readFileSync } from "fs";
import * as fsPath from "path";
import { CurrentHEAD, InputError, Result } from "./types";

export type GitCommandResult = {
  status: number;
  message: string[];
};

export function locateGitRepoFolder(folder: string): Result<string> {
  const dir = opendirSync(folder);
  let item = dir.readSync();
  let found = false;

  while (item !== null && !found) {
    found = item.isDirectory() && item.name === ".git";
    item = dir.readSync();
  }

  dir.closeSync();

  if (found) return { tag: "ok", value: folder };

  if (folder === "/") {
    return {
      tag: "err",
      error: new InputError(
        `You're not in a Git repo.`,
        "There is no Git repository in the current or any parent folder.",
      ),
    };
  }

  return locateGitRepoFolder(fsPath.resolve(folder, ".."));
}

export function readRawGitBranches(): Result<string[]> {
  const { stdout, stderr, error } = spawnSync(
    "git",
    ["branch", `--format=%(refname:short)`],
    { encoding: "utf-8" },
  );

  if (error || stderr !== "") {
    return {
      tag: "err",
      error: new InputError(
        "Git Command Failed",
        error ? error.message : stderr,
      ),
    };
  }

  const branches = stdout.split("\n").filter((b) => b !== "");
  return { tag: "ok", value: branches };
}

export function readCurrentHEAD(gitRepoFolder: string): Result<CurrentHEAD> {
  try {
    const head = readFileSync(fsPath.join(gitRepoFolder, ".git/HEAD"), {
      encoding: "utf-8",
    });

    if (!head.startsWith("ref:")) {
      return {
        tag: "ok",
        value: {
          detached: true,
          sha: head.slice(0, 7).trim(),
          branchName: null,
        },
      };
    }

    return {
      tag: "ok",
      value: { detached: false, sha: null, branchName: head.slice(16).trim() },
    };
  } catch (error: any) {
    return {
      tag: "err",
      error: new InputError(
        "Failed to read HEAD",
        `Could not read .git/HEAD: ${error.message}`,
      ),
    };
  }
}

/**
 * Executes a Git command synchronously.
 * It catches errors and neatly packages the standard output and error streams.
 * @param command - The primary Git sub-command to run (e.g., "branch", "switch").
 * @param args - Additional flags or arguments for the command.
 * @returns An object containing the exit status and raw stdout/stderr lines.
 */
export function gitCommand(command: string, args: string[]): GitCommandResult {
  let { stdout, stderr, error, status } = spawnSync("git", [command, ...args], {
    encoding: "utf-8",
  });

  if (error) {
    return {
      status: 1,
      message: [`Could not run git ${command}:`, error.message],
    };
  }

  const cleanLines = (text: string) =>
    text
      .trim()
      .split("\n")
      .filter((line) => line !== "");

  return {
    status: status ?? 1,
    message: [...cleanLines(stdout), ...cleanLines(stderr)],
  };
}

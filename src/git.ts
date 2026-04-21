import { spawnSync } from "child_process";
import { opendirSync } from "fs";
import * as fsPath from "path";
import {
  BranchData,
  CurrentHEAD,
  DisplayBranchData,
  err,
  InputError,
  ok,
  Result,
  sequence,
  Worktree,
} from "./types";

export type GitCommandResult = {
  status: number;
  message: string[];
};

export function locateGitRepoDirs(folder: string): Result<{
  mainWorktreeDir: string;
  activeWorktreeDir: string;
}> {
  const dir = opendirSync(folder);
  let item = dir.readSync();
  let found = false;

  while (item !== null && !found) {
    found = item.name === ".git";
    if (found) break;

    item = dir.readSync();
  }

  dir.closeSync();

  if (item && item.isFile()) {
    // then we are in a worktree
    const { stdout } = spawnSync("git", ["rev-parse", "--git-dir"], {
      encoding: "utf-8",
    });

    // stdout should be one line pointing to where the git folder is + some extra bits
    const gitDir = stdout.trim();

    return ok({
      activeWorktreeDir: folder,
      mainWorktreeDir: gitDir.replace(/\/.git\/worktrees\/[^/]+\/?$/, ""),
    });
  }

  if (found)
    return ok({
      activeWorktreeDir: folder,
      mainWorktreeDir: folder,
    });

  if (folder === "/") {
    return err(
      new InputError(
        `You're not in a Git repo.`,
        "There is no Git repository in the current or any parent folder.",
      ),
    );
  }

  return locateGitRepoDirs(fsPath.resolve(folder, ".."));
}

export function listWorktrees(): Result<Worktree[]> {
  const { stdout, stderr, error } = spawnSync(
    "git",
    ["worktree", "list", "--porcelain"],
    { encoding: "utf-8" },
  );

  if (error || stderr !== "") {
    return err(
      new InputError("Git Command Failed", error ? error.message : stderr),
    );
  }

  const records = stdout.trim().split("\n\n").filter(Boolean);

  const worktrees: Result<Worktree>[] = records.map((record) => {
    const fields: Record<string, string | true> = {};
    for (const line of record.split("\n")) {
      const i = line.indexOf(" ");

      if (i === -1) {
        // detached
        fields[line] = true;
      } else {
        const key = line.slice(0, i);
        fields[key] = line.slice(i + 1);
      }
    }

    if (fields.bare)
      return err(
        new InputError(
          "Bare repo not supported",
          "git-jump doesn't support bare repositories.",
        ),
      );

    // then read fields.worktree, fields.HEAD, fields.branch, fields.detached
    const isDetached = fields.detached === true ? true : false;

    const currHead: CurrentHEAD = isDetached
      ? {
          detached: true,
          sha: fields.HEAD as string,
          branchName: null,
        }
      : {
          detached: false,
          sha: null,
          branchName: (fields.branch as string).replace("refs/heads/", ""),
        };

    return ok({
      dir: fields.worktree as string,
      HEAD: currHead,
    });
  });

  return sequence(worktrees);
}

export function enrichBranches(
  branches: BranchData[],
  worktrees: Worktree[],
  activeDir: string,
): DisplayBranchData[] {
  return branches.map((b) => {
    const linkedRepoDir = worktrees.find(
      (w) => w.dir !== activeDir && w.HEAD.branchName === b.name,
    )?.dir;

    return {
      ...b,
      checkedOutIn: linkedRepoDir
        ? fsPath.relative(activeDir, linkedRepoDir)
        : null,
    };
  });
}

export function readRawGitBranches(): Result<string[]> {
  const { stdout, stderr, error } = spawnSync(
    "git",
    ["branch", `--format=%(refname:short)`],
    { encoding: "utf-8" },
  );

  if (error || stderr !== "") {
    return err(
      new InputError("Git Command Failed", error ? error.message : stderr),
    );
  }

  const branches = stdout.split("\n").filter((b) => b !== "");
  return ok(branches);
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

export function fetchRemoteBranches(): Result<string[]> {
  const { stdout, stderr, error, status } = spawnSync(
    "git",
    ["branch", "-r", "--format=%(refname:short)"],
    { encoding: "utf-8" },
  );

  if (error || status !== 0) {
    return err(
      new InputError("Git Command Failed", error ? error.message : stderr),
    );
  }

  const extractedBranchNames = stdout
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const slashIndex = trimmed.indexOf("/");
      if (slashIndex === -1) return "";
      return trimmed.slice(slashIndex + 1);
    })
    .filter((x) => x !== "");

  const uniqueBranches = new Set(extractedBranchNames);
  return ok([...uniqueBranches]);
}

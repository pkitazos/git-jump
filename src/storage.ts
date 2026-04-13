import { readFileSync, writeFileSync } from "fs";
import * as fsPath from "path";
import { DATA_FILE_PATH } from "./constants";
import { BranchData, BranchDataCollection, Result, ok, err } from "./types";

// --- adapters

/**
 * Reads jump data from disk, cleans up stale branches, saves the cleaned data
 * back to disk, and returns the reconciled branch list.
 */
export function getAndCleanBranchData(
  rawGitBranches: string[],
  gitRepoFolder: string,
): Result<BranchData[]> {
  const res1 = readBranchesJumpData(gitRepoFolder);
  if (res1.tag === "err") return res1;

  const cleanJumpData = filterStaleJumpData(rawGitBranches, res1.value);
  const reconciledBranches = reconcileBranches(rawGitBranches, cleanJumpData);

  const res2 = saveBranchesJumpData(gitRepoFolder, cleanJumpData);
  if (res2.tag === "err") return res2;

  return ok(reconciledBranches);
}

/**
 * Reads the historical data from disk, updates the timestamp in memory,
 * and immediately flushes the changes back to `.jump/data.json`.
 */
export function updateBranchLastSwitch(
  name: string,
  lastSwitch: number,
  gitRepoFolder: string,
): Result<void> {
  const res1 = readBranchesJumpData(gitRepoFolder);
  if (res1.tag === "err") return res1;

  const updatedData = setBranchTimestamp(res1.value, name, lastSwitch);

  return saveBranchesJumpData(gitRepoFolder, updatedData);
}

/**
 * Reads the current data from disk, applies the pure rename transformation,
 * and safely writes the updated history back to `.jump/data.json`.
 */
export function renameJumpDataBranch(
  currentName: string,
  newName: string,
  gitRepoFolder: string,
): Result<void> {
  const res1 = readBranchesJumpData(gitRepoFolder);
  if (res1.tag === "err") return res1;

  const updatedData = renameBranch(res1.value, currentName, newName);

  return saveBranchesJumpData(gitRepoFolder, updatedData);
}

/**
 * Reads the current data from disk, filters out the specified branches,
 * and writes the clean data back to `.jump/data.json`.
 */
export function deleteJumpDataBranch(
  branchNames: string[],
  gitRepoFolder: string,
): Result<void> {
  const res1 = readBranchesJumpData(gitRepoFolder);
  if (res1.tag === "err") return res1;

  const updatedData = deleteBranches(res1.value, branchNames);

  return saveBranchesJumpData(gitRepoFolder, updatedData);
}

// --- actual file I/O

function readBranchesJumpData(
  gitRepoFolder: string,
): Result<BranchDataCollection> {
  try {
    return ok(
      JSON.parse(
        readFileSync(fsPath.join(gitRepoFolder, DATA_FILE_PATH)).toString(),
      ),
    );
  } catch (e) {
    return err(
      new Error(
        `JSON in "${DATA_FILE_PATH}" is not valid, could not parse it.`,
      ),
    );
  }
}

function saveBranchesJumpData(
  gitRepoFolder: string,
  jumpData: BranchDataCollection,
): Result<void> {
  try {
    writeFileSync(
      fsPath.join(gitRepoFolder, DATA_FILE_PATH),
      JSON.stringify(jumpData, null, 2),
    );
    return ok(undefined);
  } catch (e) {
    return err(new Error(`Could not write data into "${DATA_FILE_PATH}".`));
  }
}

// --- pure utils

function reconcileBranches(
  rawGitBranches: string[],
  jumpData: BranchDataCollection,
): BranchData[] {
  return rawGitBranches.map((branch) => ({
    name: branch,
    lastSwitch: jumpData[branch]?.lastSwitch ?? 0,
  }));
}

function filterStaleJumpData(
  rawGitBranches: string[],
  jumpData: BranchDataCollection,
): BranchDataCollection {
  return Object.fromEntries(
    Object.entries(jumpData).filter(([b, _]) => rawGitBranches.includes(b)),
  );
}

function setBranchTimestamp(
  jumpData: BranchDataCollection,
  name: string,
  lastSwitch: number,
): BranchDataCollection {
  return {
    ...jumpData,
    [name]: { name, lastSwitch },
  };
}

function renameBranch(
  jumpData: BranchDataCollection,
  currentName: string,
  newName: string,
): BranchDataCollection {
  const currentJumpData = jumpData[currentName];
  if (!currentJumpData) return jumpData;

  const { [currentName]: _removed, ...rest } = jumpData;

  return {
    ...rest,
    [newName]: { ...currentJumpData, name: newName },
  };
}

function deleteBranches(
  jumpData: BranchDataCollection,
  branchesToDelete: string[],
): BranchDataCollection {
  return Object.fromEntries(
    Object.entries(jumpData).filter(([b, _]) => !branchesToDelete.includes(b)),
  );
}

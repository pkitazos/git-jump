import { readFileSync, writeFileSync } from "fs";
import * as fsPath from "path";
import { DATA_FILE_PATH } from "./constants";
import { BranchData, BranchDataCollection } from "./types";

// --- adapters

/**
 * Reads jump data from disk, cleans up stale branches, saves the cleaned data
 * back to disk, and returns the reconciled branch list.
 */
export function getAndCleanBranchData(
  rawGitBranches: string[],
  gitRepoFolder: string,
): BranchData[] {
  const jumpData = readBranchesJumpData(gitRepoFolder);

  const cleanJumpData = filterStaleJumpData(rawGitBranches, jumpData);
  const reconciledBranches = reconcileBranches(rawGitBranches, cleanJumpData);

  saveBranchesJumpData(gitRepoFolder, cleanJumpData);

  return reconciledBranches;
}

/**
 * Reads the historical data from disk, updates the timestamp in memory,
 * and immediately flushes the changes back to `.jump/data.json`.
 */
export function updateBranchLastSwitch(
  name: string,
  lastSwitch: number,
  gitRepoFolder: string,
): void {
  const jumpData = readBranchesJumpData(gitRepoFolder);

  const updatedData = setBranchTimestamp(jumpData, name, lastSwitch);

  saveBranchesJumpData(gitRepoFolder, updatedData);
}

/**
 * Reads the current data from disk, applies the pure rename transformation,
 * and safely writes the updated history back to `.jump/data.json`.
 */
export function renameJumpDataBranch(
  currentName: string,
  newName: string,
  gitRepoFolder: string,
): void {
  const jumpData = readBranchesJumpData(gitRepoFolder);

  const updatedData = renameBranch(jumpData, currentName, newName);

  saveBranchesJumpData(gitRepoFolder, updatedData);
}

/**
 * Reads the current data from disk, filters out the specified branches,
 * and writes the clean data back to `.jump/data.json`.
 */
export function deleteJumpDataBranch(
  branchNames: string[],
  gitRepoFolder: string,
): void {
  const jumpData = readBranchesJumpData(gitRepoFolder);

  const updatedData = deleteBranches(jumpData, branchNames);

  saveBranchesJumpData(gitRepoFolder, updatedData);
}

// --- actual file I/O

function readBranchesJumpData(gitRepoFolder: string): BranchDataCollection {
  try {
    return JSON.parse(
      readFileSync(fsPath.join(gitRepoFolder, DATA_FILE_PATH)).toString(),
    );
  } catch (e) {
    throw new Error(
      `JSON in "${DATA_FILE_PATH}" is not valid, could not parse it.`,
    );
  }
}

function saveBranchesJumpData(
  gitRepoFolder: string,
  jumpData: BranchDataCollection,
): void {
  try {
    writeFileSync(
      fsPath.join(gitRepoFolder, DATA_FILE_PATH),
      JSON.stringify(jumpData, null, 2),
    );
  } catch (e) {
    throw new Error(`Could not write data into "${DATA_FILE_PATH}".`);
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

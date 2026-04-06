import { readFileSync, writeFileSync } from "fs";
import * as fsPath from "path";
import { DATA_FILE_PATH } from ".";
import { readRawGitBranches } from "./git";
import { BranchData, BranchDataCollection, State } from "./types";
/**
 * Reconciles the actual Git branches with the historical usage data.
 * It reads the raw Git branches, cross-references them with the timestamps stored
 * in `.jump/data.json`, cleans up any stale data (deleted branches), and returns
 * the combined dataset.
 * @param gitRepoFolder - The absolute path to the root of the Git repository.
 * @returns An array of BranchData combining Git state with usage history.
 */
export function readBranchesData(gitRepoFolder: string): BranchData[] {
  const rawGitBranches = readRawGitBranches();
  const branchesJumpData = readBranchesJumpData(gitRepoFolder);

  cleanUpJumpData(gitRepoFolder, branchesJumpData, rawGitBranches);

  return rawGitBranches.map((branch) => {
    const jumpData = branchesJumpData[branch];

    return {
      name: branch,
      lastSwitch: jumpData !== undefined ? jumpData.lastSwitch : 0,
    };
  });
}

/**
 * Updates the timestamp for a specific branch in the `.jump/data.json` file.
 * This is called immediately after a successful branch switch to ensure the
 * "recently used" sorting remains accurate.
 * @param name - The name of the branch to update.
 * @param lastSwitch - The current timestamp (e.g., Date.now()).
 * @param state - The current application state.
 */
export function updateBranchLastSwitch(
  name: string,
  lastSwitch: number,
  state: State,
): void {
  const jumpData = readBranchesJumpData(state.gitRepoFolder);

  jumpData[name] = { name, lastSwitch };

  saveBranchesJumpData(state.gitRepoFolder, jumpData);
}

export function renameJumpDataBranch(
  currentName: string,
  newName: string,
  state: State,
): void {
  const jumpData = readBranchesJumpData(state.gitRepoFolder);
  const currentJumpData = jumpData[currentName];

  if (currentJumpData === undefined) {
    return;
  }

  jumpData[newName] = { ...currentJumpData, name: newName };
  delete jumpData[currentName];

  saveBranchesJumpData(state.gitRepoFolder, jumpData);
}

export function deleteJumpDataBranch(
  branchNames: string[],
  state: State,
): void {
  const jumpData = readBranchesJumpData(state.gitRepoFolder);

  branchNames.forEach((name) => {
    if (jumpData[name] === undefined) {
      return;
    }

    delete jumpData[name];
  });

  saveBranchesJumpData(state.gitRepoFolder, jumpData);
}

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

/**
 * Cleans up branches that do not exists in Git already
 * but still present in jump data.
 */
function cleanUpJumpData(
  gitRepoFolder: string,
  jumpData: BranchDataCollection,
  rawGitBranches: string[],
): void {
  const cleanJumpData = Object.keys(jumpData).reduce(
    (cleanData, jumpDataBranchName) => {
      if (rawGitBranches.includes(jumpDataBranchName)) {
        cleanData[jumpDataBranchName] = jumpData[jumpDataBranchName];
      }

      return cleanData;
    },
    {} as BranchDataCollection,
  );

  saveBranchesJumpData(gitRepoFolder, cleanJumpData);
}

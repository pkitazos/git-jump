import { fuzzyMatch } from "./fuzzy";
import {
  BranchData,
  CurrentHEAD,
  ListItem,
  ListItemVariant,
  ListSortCriterion,
} from "./types";

/**
 * Generates the final, sorted, and filtered list of items to display in the terminal.
 * It scores all branches against the current search string using the fuzzy matcher.
 * If the user is actively searching, it sorts by the highest match score.
 * If the search bar is empty, it defaults to sorting by the `lastSwitch` timestamp.
 * @param state - The current application state.
 * @returns An array of ListItem objects ready for the rendering engine.
 */
export function generateList(
  branches: BranchData[],
  currentHEAD: CurrentHEAD,
  searchString: string,
) {
  let list: ListItem[] = [];

  list.push({
    type: ListItemVariant.HEAD,
    content: currentHEAD,
    searchMatchScore:
      searchString === ""
        ? 1
        : fuzzyMatch(
            searchString,
            currentHEAD.detached ? currentHEAD.sha : currentHEAD.branchName,
          ),
  });

  const branchLines: ListItem[] = branches
    // Filter out current branch if HEAD is not detached,
    // because current branch will be displayed as the first list
    .filter((branch) => {
      return currentHEAD.detached || branch.name !== currentHEAD.branchName;
    })
    .map((branch: BranchData) => {
      return {
        type: ListItemVariant.BRANCH,
        content: branch,
        searchMatchScore:
          searchString === "" ? 1 : fuzzyMatch(searchString, branch.name),
      };
    });

  list = list
    .concat(branchLines)
    .filter((line: ListItem) => line.searchMatchScore > 0);

  const sortCriterion =
    searchString === ""
      ? ListSortCriterion.LastSwitch
      : ListSortCriterion.SearchMatchScore;

  return sortedListLines(list, sortCriterion);
}

export function getQuickSelectLines(list: ListItem[]): ListItem[] {
  return list
    .filter((line: ListItem) => line.type !== ListItemVariant.HEAD)
    .slice(0, 10);
}

/**
 * Reads branch name from provided list line.
 * Returns null in case current HEAD was selected
 * and it's detached.
 */
export function getBranchNameForLine(line: ListItem): string {
  switch (line.type) {
    case ListItemVariant.HEAD: {
      return line.content.detached ? line.content.sha : line.content.branchName;
    }

    case ListItemVariant.BRANCH: {
      return line.content.name;
    }
  }
}

function sortedListLines(
  list: ListItem[],
  criterion: ListSortCriterion,
): ListItem[] {
  if (criterion === ListSortCriterion.LastSwitch) {
    return list.slice().sort((a: ListItem, b: ListItem) => {
      if (b.type === ListItemVariant.HEAD) {
        return 1;
      }

      return (
        (b.content as BranchData).lastSwitch -
        (a.content as BranchData).lastSwitch
      );
    });
  }

  return list.slice().sort((a: ListItem, b: ListItem) => {
    return b.searchMatchScore - a.searchMatchScore;
  });
}

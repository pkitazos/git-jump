import { fuzzyMatch } from "./fuzzy";
import {
  BranchData,
  ListItem,
  ListItemVariant,
  ListSortCriterion,
  State,
} from "./types";

/**
 * Generates the final, sorted, and filtered list of items to display in the terminal.
 * It scores all branches against the current search string using the fuzzy matcher.
 * If the user is actively searching, it sorts by the highest match score.
 * If the search bar is empty, it defaults to sorting by the `lastSwitch` timestamp.
 * @param state - The current application state.
 * @returns An array of ListItem objects ready for the rendering engine.
 */
export function generateList(state: State) {
  let list: ListItem[] = [];

  list.push({
    type: ListItemVariant.HEAD,
    content: state.currentHEAD,
    searchMatchScore:
      state.searchString === ""
        ? 1
        : fuzzyMatch(
            state.searchString,
            state.currentHEAD.detached
              ? state.currentHEAD.sha
              : state.currentHEAD.branchName,
          ),
  });

  const branchLines: ListItem[] = state.branches
    // Filter out current branch if HEAD is not detached,
    // because current branch will be displayed as the first list
    .filter((branch) => {
      return (
        state.currentHEAD.detached ||
        branch.name !== state.currentHEAD.branchName
      );
    })
    .map((branch: BranchData) => {
      return {
        type: ListItemVariant.BRANCH,
        content: branch,
        searchMatchScore:
          state.searchString === ""
            ? 1
            : fuzzyMatch(state.searchString, branch.name),
      };
    });

  list = list
    .concat(branchLines)
    .filter((line: ListItem) => line.searchMatchScore > 0);

  const sortCriterion =
    state.searchString === ""
      ? ListSortCriterion.LastSwitch
      : ListSortCriterion.SearchMatchScore;

  return sortedListLines(list, sortCriterion);
}

export function getQuickSelectLines(list: ListItem[]): ListItem[] {
  return list
    .filter((line: ListItem) => {
      return line.type !== ListItemVariant.HEAD;
    })
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

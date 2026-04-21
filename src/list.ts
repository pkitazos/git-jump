import { fuzzyMatch } from "./fuzzy";
import {
  CurrentHEAD,
  DisplayBranchData,
  ListItem,
  ListItemVariant,
  ListSortCriterion,
  type TListSortCriterion,
} from "./types";
import { match } from "./utils";

/**
 * Generates the final, sorted, and filtered list of items to display in the terminal.
 * It scores all branches against the current search string using the fuzzy matcher.
 * If the user is actively searching, it sorts by the highest match score.
 * If the search bar is empty, it defaults to sorting by the `lastSwitch` timestamp.
 * @param state - The current application state.
 * @returns An array of ListItem objects ready for the rendering engine.
 */
export function generateList(
  branches: DisplayBranchData[],
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
    // because current branch will be displayed as the first item in the list
    .filter((b) => currentHEAD.detached || b.name !== currentHEAD.branchName)
    .map((branch) => ({
      type: ListItemVariant.BRANCH,
      content: branch,
      searchMatchScore:
        searchString === "" ? 1 : fuzzyMatch(searchString, branch.name),
    }));

  list = list
    .concat(branchLines)
    .filter((line: ListItem) => line.searchMatchScore > 0);

  const sortCriterion =
    searchString === ""
      ? ListSortCriterion.LAST_SWITCH
      : ListSortCriterion.SEARCH_MATCH_SCORE;

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
  return match(line, "type", {
    head: (l) => (l.content.detached ? l.content.sha : l.content.branchName),
    branch: (l) => l.content.name,
  });
}

function sortedListLines(
  list: ListItem[],
  criterion: TListSortCriterion,
): ListItem[] {
  if (criterion === ListSortCriterion.LAST_SWITCH) {
    return list.slice().sort((a, b) => {
      // HEAD always first
      if (a.type === ListItemVariant.HEAD) return -1;
      if (b.type === ListItemVariant.HEAD) return 1;

      // Disabled rows always last
      const aDisabled = (a.content as DisplayBranchData).checkedOutIn !== null;
      const bDisabled = (b.content as DisplayBranchData).checkedOutIn !== null;
      if (aDisabled !== bDisabled) return aDisabled ? 1 : -1;

      return criterion === ListSortCriterion.LAST_SWITCH
        ? b.content.lastSwitch - a.content.lastSwitch
        : b.searchMatchScore - a.searchMatchScore;
    });
  }

  return list
    .slice()
    .sort(
      (a: ListItem, b: ListItem) => b.searchMatchScore - a.searchMatchScore,
    );
}

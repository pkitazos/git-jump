/**
 * Finds the indices in `target` for each character of `search` that appears
 * in order. Each lookup starts after the previous match.
 * Returns `null` if any character of `search` cannot be found in order.
 *
 * @example
 * findSubsequenceIndexes("abc", "bcabc"); // [2, 3, 4]
 * findSubsequenceIndexes("abc", "ba");    // null
 */
function findSequentialIndexes(
  search: string,
  target: string,
): number[] | null {
  const indexes: number[] = [];
  let startIdx = 0;

  for (const char of search) {
    const found = target.indexOf(char, startIdx);
    if (found === -1) return null;
    indexes.push(found);
    startIdx = found + 1;
  }

  return indexes;
}

const PREFIX_WINDOW = 3;

/**
 * Scores how well `search` fuzzy-matches `target`. Characters of `search`
 * must appear in `target` in the same order, but don't necessarily
 * have to be contiguous. Matching is also case-insensitive.
 *
 * Returns 0 if any character of `search` is missing from `target` (in order).
 * Otherwise returns a positive score where higher means a better match.
 *
 * The total score is `matchScore + prefixBonus + continuityBonus`, where:
 *   - `matchScore` is in [0, 1]
 *   - `prefixBonus` rewards matched characters within the first `PREFIX_WINDOW` positions in the target.
 *   - `continuityBonus` rewards runs of consecutive matched characters.
 *
 * @example
 * fuzzyMatch("abc", "abcdef"); // high — prefix + continuity bonuses
 * fuzzyMatch("abc", "xyabc");  // lower — no prefix bonus
 * fuzzyMatch("abc", "acb");    // 0 — out of order
 */
export function fuzzyMatch(search: string, target: string): number {
  const matchedIndexes = findSequentialIndexes(
    search.toLowerCase(),
    target.toLowerCase(),
  );

  if (matchedIndexes === null) return 0;
  const matchScore = 1; // should be the same as `matchedIndexes.length / search.length;`

  // Sums over every matched index so that a fully contiguous prefix match receives a higher score
  const prefixBonus = matchedIndexes.reduce(
    (sum, idx) => sum + Math.max(0, PREFIX_WINDOW - idx),
    0,
  );

  const continuityBonus = matchedIndexes.reduce(
    (sum, idx, i) =>
      // first index is not followed by anything, so mark it 0
      // subsequent indices get 1 if they are exactly 1 apart, otherwise 0
      sum + (i === 0 ? 0 : idx - matchedIndexes[i - 1] === 1 ? 1 : 0),
    0,
  );

  return matchScore + prefixBonus + continuityBonus;
}

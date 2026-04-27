import * as fsPath from "path";

/**
 * Restricts a number to be within a specified range.
 *
 * @param value The number to clamp.
 * @param min The lower boundary of the output range.
 * @param max The upper boundary of the output range.
 *
 * @example clamp(1, 10, 20) // 10
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

/**
 * Compares two filesystem paths for equality across platforms.
 * Resolves both sides so forward/backslash mixes are reconciled, and
 * compares case-insensitively on Windows where paths are case-insensitive.
 */
export function samePath(a: string, b: string): boolean {
  const aN = fsPath.resolve(a);
  const bN = fsPath.resolve(b);
  return process.platform === "win32"
    ? aN.toLowerCase() === bN.toLowerCase()
    : aN === bN;
}

/**
 * Executes exhaustive pattern matching on a discriminated union.
 *
 * This utility evaluates the specified `discriminator` property of the provided
 * object and executes the corresponding callback function from the `cases` record.
 * Crucially, it provides strict type narrowing, ensuring the callback receives
 * the exact, strongly-typed variant of the object.
 *
 * If a variant is added to the union but omitted from the `cases` object,
 * the TypeScript compiler will throw an error, ensuring exhaustive coverage.
 *
 * @example
 * type Shape =
 * | { kind: "circle"; radius: number }
 * | { kind: "square"; size: number };
 *
 * const area = match(myShape, "kind", {
 * circle: (c) => Math.PI * c.radius ** 2, // 'c' is strictly narrowed to Circle
 * square: (s) => s.size ** 2,             // 's' is strictly narrowed to Square
 * });
 *
 * @template K - The property key used as the discriminator.
 * @template T - The discriminated union type being evaluated.
 * @template C - The exhaustive record of case handlers.
 * @param val - The object (discriminated union) to evaluate.
 * @param discriminator - The key used to discriminate the union (e.g., "type", "kind", "tag").
 * @param cases - An exhaustive mapping of every possible discriminator value to a handler function.
 * @returns The value returned by the matching handler function.
 */
export function match<
  K extends PropertyKey,
  T extends Record<K, PropertyKey>,
  C extends { [P in T[K]]: (narrowedVal: Extract<T, Record<K, P>>) => any },
>(val: T, discriminator: K, cases: C): ReturnType<C[keyof C]> {
  return cases[val[discriminator]](val as any);
}

/**
 * Pattern matches a value against an exhaustive set of cases.
 *
 * @example
 * const result = match(status, {
 *   [Status.ACTIVE]: () => "active",
 *   [Status.INACTIVE]: () => "inactive",
 * });
 *
 * @param value - The value to match against.
 * @param cases - An exhaustive record mapping every possible value to a handler.
 * @returns The result of the matching handler.
 */
export function match_SIMPLE<K extends string | number | symbol, R>(
  value: K,
  cases: Record<K, () => R>,
): R {
  return cases[value]();
}

// let res: GitSubCommandResult = match_SIMPLE(name, {
//   [("--list", "-l")]: () => listSubCommand(),

//   [("--version", "-v")]: () => versionSubCommand(),

//   ["-h"]: () => helpSubCommand(),

//   ["new"]: () => newSubCommand(args),

//   ["rename"]: () => renameSubCommand(args),

//   ["delete"]: () => deleteSubCommand(args),

//   _: () => {
//     throw new InputError(
//       `Unknown command ${bold(`git jump ${name}`)}`,
//       `See ${bold("git jump --help")} for the list of supported commands.`,
//     );
//   },
// });

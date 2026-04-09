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
  return Math.min(Math.max(value, min), max);
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

/**
 * Recursively freeze an object graph so parsed models are immutable by default.
 * Mutation, where allowed, happens only through explicit builder/setter methods
 * that return new instances — never by reaching into a returned model.
 *
 * @template T - The value type.
 * @param value - The value to deep-freeze in place.
 * @returns The same reference, now deeply frozen.
 *
 * @example
 * ```ts
 * const m = deepFreeze({ a: { b: 1 } });
 * Object.isFrozen(m.a); // true
 * ```
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  for (const key of Object.keys(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return Object.freeze(value);
}

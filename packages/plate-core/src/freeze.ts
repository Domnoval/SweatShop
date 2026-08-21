/**
 * Deep immutability helpers.
 *
 * Spec §11.3: "The canonical AST is never destructively modified." Freezing is
 * the runtime half of that guarantee; `Readonly<...>` types are the compile-time
 * half. Layout, corruption, and atmosphere modules receive frozen structures so
 * that an accidental in-place edit throws in strict mode instead of silently
 * mutating canonical geometry.
 */

export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

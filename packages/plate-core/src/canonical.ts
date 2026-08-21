/**
 * Canonical JSON serialization.
 *
 * Spec §5.3 forbids "system-dependent object iteration" and "locale-dependent
 * ordering" inside deterministic artifacts. Any structure that gets hashed — the
 * request, the canonical AST, the presentation plan, the manifest — is
 * serialized through here first: keys sorted by UTF-16 code unit, no
 * `Intl`-sensitive comparison, and non-finite numbers rejected outright.
 */

import { sha256Hex } from "./sha256.js";

export type CanonicalValue =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalValue[]
  | { readonly [key: string]: CanonicalValue };

/** Sort by UTF-16 code unit. `Array#sort` without a comparator is locale-free but stringifies. */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return "null";

  switch (typeof value) {
    case "boolean":
      return value ? "true" : "false";
    case "number": {
      if (!Number.isFinite(value)) {
        throw new Error(`canonicalJson: non-finite number ${String(value)}`);
      }
      // Normalize -0 so that a mirrored coordinate and its origin hash alike.
      return JSON.stringify(value === 0 ? 0 : value);
    }
    case "string":
      return JSON.stringify(value);
    case "undefined":
      throw new Error("canonicalJson: undefined is not serializable");
    case "bigint":
    case "function":
    case "symbol":
      throw new Error(`canonicalJson: ${typeof value} is not serializable`);
    default:
      break;
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const keys = Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort(byCodeUnit);
  const body = keys
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",");
  return `{${body}}`;
}

/** SHA-256 over the canonical serialization, lowercase hex. */
export function canonicalDigest(value: unknown): string {
  return sha256Hex(canonicalJson(value));
}

/**
 * Regenerate the committed integrity hashes for `geometry/v2`.
 *
 * Run this ONLY when deliberately minting the version. A released geometry
 * version is immutable: editing a hash to match an edited path silently
 * rewrites every plate that pinned it.
 *
 *   pnpm exec tsx scripts/generate-geometry-integrity-v2.ts
 */

import { writeFileSync } from "node:fs";

import {
  GEOMETRY_V2_SOURCE,
  GEOMETRY_V2_VERSION,
} from "../packages/glyph-registry/src/geometry.v2.js";
import { pathDigest } from "../packages/glyph-registry/src/geometry-registry.js";

const entries = [...GEOMETRY_V2_SOURCE]
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map((source) => `  "${source.id}": "${pathDigest(source)}",`);

const output = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * SHA-256 over the canonical serialization of each locked mark's viewBox and
 * path data for ${GEOMETRY_V2_VERSION}. Regenerate with
 * \`pnpm exec tsx scripts/generate-geometry-integrity-v2.ts\` only when minting a
 * version; editing a released hash to match an edited path silently rewrites
 * every plate that pinned this version.
 */

export const GEOMETRY_V2_INTEGRITY: Readonly<Record<string, string>> = Object.freeze({
${entries.join("\n")}
});
`;

writeFileSync(
  new URL("../packages/glyph-registry/src/geometry-integrity.v2.ts", import.meta.url),
  output,
  "utf8",
);
process.stdout.write(`Wrote ${entries.length} integrity hashes for ${GEOMETRY_V2_VERSION}\n`);

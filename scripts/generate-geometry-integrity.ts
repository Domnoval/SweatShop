/**
 * Regenerate the committed geometry integrity hashes.
 *
 * Run this ONLY when deliberately minting a geometry version — after the artist
 * approves a contact sheet, and into a NEW version directory. Running it to
 * silence a failing integrity check would defeat the point of the check.
 *
 *   pnpm geometry:hash
 */

import { writeFileSync } from "node:fs";

import { GEOMETRY_V1_SOURCE, GEOMETRY_VERSION } from "../packages/glyph-registry/src/geometry.v1.js";
import { pathDigest } from "../packages/glyph-registry/src/geometry-registry.js";

const entries = [...GEOMETRY_V1_SOURCE]
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  .map((source) => `  "${source.id}": "${pathDigest(source)}",`);

const output = `/**
 * GENERATED FILE — do not edit by hand.
 *
 * SHA-256 over the canonical serialization of each locked glyph's viewBox and
 * path data for ${GEOMETRY_VERSION}. Regenerate with \`pnpm geometry:hash\` only when
 * minting a new geometry version; editing a released hash to match an edited
 * path silently rewrites every plate that pinned this version.
 */

export const GEOMETRY_V1_INTEGRITY: Readonly<Record<string, string>> = Object.freeze({
${entries.join("\n")}
});
`;

const target = new URL(
  "../packages/glyph-registry/src/geometry-integrity.v1.ts",
  import.meta.url,
);
writeFileSync(target, output, "utf8");
process.stdout.write(`Wrote ${entries.length} integrity hashes for ${GEOMETRY_VERSION}\n`);

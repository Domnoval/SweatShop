/**
 * Finite identifier registries referenced by the input contract (spec §3, §8, §9).
 *
 * These are closed unions on purpose. Spec §9 forbids accepting arbitrary
 * formulas in V1: a substrate must be a canon-approved, versioned construction,
 * not a string a caller invented.
 */

export type PlateMode = "exact" | "stylized";

export const LAYOUT_FAMILY_IDS = [
  "orthogonal-wall",
  "clause-columns",
  "concentric-rings",
  "alpha-radial",
  "processional-spiral",
  "mirrored-passage",
  "reliquary-grid",
] as const;

export type LayoutFamilyId = (typeof LAYOUT_FAMILY_IDS)[number];

export const SUBSTRATE_IDS = [
  "alpha-radial-lattice",
  "modular-residue-field",
  "fine-structure-construction",
  "golden-processional-spiral",
  "lissajous-archive-field",
  "voronoi-reliquary",
] as const;

export type SubstrateId = (typeof SUBSTRATE_IDS)[number];

/** Opaque handle into the locked geometry registry. */
export type GlyphGeometryId = string;
/** Public, ordinal node identifier such as `g000018`. */
export type NodeId = string;
/** Deterministic per-request plate identifier. */
export type PlateId = string;

/** Zero-padded ordinal public identifiers (spec §14.2). */
export function ordinalId(prefix: string, index: number): string {
  return `${prefix}${String(index).padStart(6, "0")}`;
}

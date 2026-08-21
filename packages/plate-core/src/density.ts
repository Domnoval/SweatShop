/**
 * Density profile (spec §6).
 *
 * Density must not mean "add arbitrary noise". It maps onto five independently
 * controlled visual systems, and — critically — payload glyph count is fixed by
 * the phrase. Density can compress spacing and thicken the supporting field, but
 * it can never delete a semantic node.
 */

import { clamp01, quantize, PARAMETER_PRECISION } from "./numeric.js";

export type DensityProfile = Readonly<{
  /** Fraction of a glyph cell given over to spacing between payload glyphs. */
  payloadSpacing: number;
  /** Additional spacing between clauses. */
  clauseSpacing: number;
  /** How much substrate guide geometry is drawn. */
  substrateFrequency: number;
  /** Share of free field the decoy planner may occupy. */
  decoyOccupancy: number;
  /** Share of the surface atmosphere may cover. */
  atmosphericCoverage: number;
}>;

export type DensityBandId =
  | "inscription"
  | "diagram"
  | "manuscript"
  | "wall"
  | "black-field";

export type DensityBand = Readonly<{
  id: DensityBandId;
  label: string;
  /** Inclusive lower and upper bounds on the 0–100 interface scale. */
  uiRange: readonly [number, number];
  behavior: string;
}>;

export const DENSITY_BANDS: readonly DensityBand[] = Object.freeze([
  Object.freeze({
    id: "inscription" as const,
    label: "Inscription",
    uiRange: Object.freeze([0, 20] as const),
    behavior: "Large glyphs, generous negative space, minimal decoys",
  }),
  Object.freeze({
    id: "diagram" as const,
    label: "Diagram",
    uiRange: Object.freeze([21, 45] as const),
    behavior: "Clear clause structure with visible substrate",
  }),
  Object.freeze({
    id: "manuscript" as const,
    label: "Manuscript",
    uiRange: Object.freeze([46, 70] as const),
    behavior: "Dense supporting marks and stronger field behavior",
  }),
  Object.freeze({
    id: "wall" as const,
    label: "Wall",
    uiRange: Object.freeze([71, 90] as const),
    behavior: "High occupancy, compressed spacing, layered decoys",
  }),
  Object.freeze({
    id: "black-field" as const,
    label: "Black Field",
    uiRange: Object.freeze([91, 100] as const),
    behavior: "Near-saturated surface with payload protected by hierarchy rules",
  }),
]);

export function densityBand(density: number): DensityBand {
  const ui = clamp01(density) * 100;
  for (const band of DENSITY_BANDS) {
    if (ui >= band.uiRange[0] && ui <= band.uiRange[1]) return band;
  }
  return DENSITY_BANDS[DENSITY_BANDS.length - 1]!;
}

export function densityProfile(density: number): DensityProfile {
  const d = clamp01(density);
  const q = (value: number): number => quantize(value, PARAMETER_PRECISION);
  return Object.freeze({
    // Spacing shrinks as density rises, but never to zero: glyphs must stay
    // separable at the print minimum even in a Black Field.
    payloadSpacing: q(0.42 - d * 0.3),
    clauseSpacing: q(0.34 - d * 0.22),
    substrateFrequency: q(0.12 + d * 0.78),
    decoyOccupancy: q(d * d * 0.72),
    atmosphericCoverage: q(0.05 + d * 0.65),
  });
}

/** Corruption bands (spec §7.2). */

import { clamp01 } from "@studio137/plate-core";

import type { CorruptionBand } from "./types.js";

export const CORRUPTION_BANDS: readonly CorruptionBand[] = Object.freeze([
  Object.freeze({
    id: "canonical" as const,
    label: "Canonical",
    uiRange: Object.freeze([0, 15] as const),
    behavior: "Clean archive state with negligible interference",
  }),
  Object.freeze({
    id: "noise" as const,
    label: "Noise",
    uiRange: Object.freeze([16, 35] as const),
    behavior: "Minor substitutions, registration drift, and surface interruption",
  }),
  Object.freeze({
    id: "interrupted" as const,
    label: "Interrupted",
    uiRange: Object.freeze([36, 60] as const),
    behavior: "Clause occlusion, false passages, and mirrored fragments",
  }),
  Object.freeze({
    id: "degraded" as const,
    label: "Degraded",
    uiRange: Object.freeze([61, 80] as const),
    behavior: "Heavy masks, decoy dominance, repeated echoes, broken reading order",
  }),
  Object.freeze({
    id: "event-field" as const,
    label: "Event Field",
    uiRange: Object.freeze([81, 100] as const),
    behavior: "Near-unreadable public surface with canonical payload retained privately",
  }),
]);

export function corruptionBand(level: number): CorruptionBand {
  const ui = clamp01(level) * 100;
  for (const band of CORRUPTION_BANDS) {
    if (ui >= band.uiRange[0] && ui <= band.uiRange[1]) return band;
  }
  return CORRUPTION_BANDS[CORRUPTION_BANDS.length - 1]!;
}

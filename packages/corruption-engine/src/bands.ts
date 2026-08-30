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

/**
 * The band a normalized level falls in.
 *
 * The declared ranges are inclusive integer pairs (0–15, 16–35, …), so testing
 * `ui >= lower && ui <= upper` leaves every fractional value between two bands
 * matching nothing — and a loop that falls through to its last element reports
 * corruption 15.5 as an Event Field. Each band therefore runs up to where the
 * next one starts, which is total over the whole range.
 */
export function corruptionBand(level: number): CorruptionBand {
  const ui = clamp01(level) * 100;
  for (let index = 0; index < CORRUPTION_BANDS.length - 1; index += 1) {
    if (ui < CORRUPTION_BANDS[index + 1]!.uiRange[0]) return CORRUPTION_BANDS[index]!;
  }
  return CORRUPTION_BANDS[CORRUPTION_BANDS.length - 1]!;
}

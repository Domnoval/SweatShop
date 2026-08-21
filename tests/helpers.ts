/**
 * Shared fixtures for the verification-gate suites (spec §26).
 */

import {
  normalizeUiRequest,
  OUTPUT_PRESETS,
  type PlateRequest,
} from "@studio137/plate-core";
import { compilePlate, type CompiledPlate } from "@studio137/plate-compiler";
import { generateMasterKey, type MasterKey } from "@studio137/private-manifest";

export { GOLDEN_REQUEST, GOLDEN_PHRASE, GOLDEN_SEED } from "../apps/cli/src/golden.js";

/**
 * A phrase that exercises every structure the grammar must support: all nine
 * root families, all four modifiers, every separator, clause boundaries, a
 * mirrored passage, and unsupported literal payloads (spec §26 Gate 1).
 */
export const CONFORMANCE_PHRASE = [
  "all the signal survives, not the ancient body;",
  "the witness knows every threshold of structure",
  "| the void burns before all time...",
  "xyzzy plugh",
].join(" ");

/**
 * Overrides on the **interface** scale.
 *
 * `density` and `corruptionLevel` are 0–100 here, matching what the editor's
 * sliders emit; `normalizeUiRequest` converts them to the compiler's 0–1
 * domain. Spelled out as its own type because passing an already-normalized
 * 0.4 would silently mean "0.4 percent".
 */
export type UiOverrides = Partial<Omit<PlateRequest, "density" | "corruptionLevel">> &
  Readonly<{ density?: number; corruptionLevel?: number }>;

export function requestFor(overrides: UiOverrides = {}): PlateRequest {
  return normalizeUiRequest({
    phrase: "THE SIGNAL SURVIVES THE BODY",
    seed: "verification-suite",
    density: 45,
    corruptionLevel: 20,
    layoutFamily: "concentric-rings",
    mathematicalSubstrate: "alpha-radial-lattice",
    outputSize: OUTPUT_PRESETS["poster-18x24"],
    mode: "exact",
    ...overrides,
  });
}

/**
 * A small output so the suite stays fast.
 *
 * Print safety scales with physical size, so a deliberately small canvas is
 * also the case most likely to surface a stroke-minimum failure.
 */
export const SMALL_OUTPUT = Object.freeze({
  width: 8,
  height: 10,
  unit: "in" as const,
  dpi: 300,
  bleed: 0.125,
  safeMargin: 0.25,
});

export function compileFor(overrides: UiOverrides = {}): CompiledPlate {
  return compilePlate(requestFor({ outputSize: SMALL_OUTPUT, ...overrides }));
}

let sharedKey: MasterKey | undefined;

/** One key for the whole suite. Never written to disk. */
export function testMasterKey(): MasterKey {
  sharedKey ??= generateMasterKey();
  return sharedKey;
}

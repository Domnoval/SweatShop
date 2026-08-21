/**
 * The permanent golden fixture (spec §29).
 *
 * One fixture runs through the compiler, the renderer, the exports, and — once
 * Phase 10 begins — physical proofing. Its AST hash, SVG hash, PNG pixel hash,
 * print hash, and decoded phrase become permanent release gates.
 */

import { OUTPUT_PRESETS, type PlateRequest } from "@studio137/plate-core";

export const GOLDEN_PHRASE = "THE SIGNAL SURVIVES THE BODY";

/** Fixed seed. The fixture must not depend on entropy of any kind. */
export const GOLDEN_SEED = "studio137-golden-v1";

export const GOLDEN_REQUEST: PlateRequest = Object.freeze({
  phrase: GOLDEN_PHRASE,
  seed: GOLDEN_SEED,
  // The spec states these on the 0–100 interface scale; the compiler takes 0–1.
  density: 0.55,
  corruptionLevel: 0.25,
  layoutFamily: "concentric-rings",
  mathematicalSubstrate: "alpha-radial-lattice",
  outputSize: OUTPUT_PRESETS["poster-24x36"],
  mode: "exact",
});

export const GOLDEN_BASENAME = "golden-signal";

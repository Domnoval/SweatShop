/**
 * `@studio137/mode-engine` — the painter's ten composition modes, on the walk.
 *
 * The concept table has always carried a composition recipe —
 * `{ mode, arch, palette, fold, words }` on every one of its nineteen concepts —
 * and until this package nothing read the `mode` field. `lunar` asked for
 * `cymatic` and got the same figure as `war`, which asked for `haring`. This is
 * the half of the system that was sitting in a table.
 *
 * WHAT A MODE IS. Not a style flag: a **construction**. Ten of them are ported
 * from `const MODES` at `assets/symbolpaintermk137.html:384`, each with its own
 * arithmetic for where the next mark goes — a golden-angle packing, a hexagonal
 * lattice, the thirteen nodes of Metatron's Cube and all seventy-eight chords
 * between them, a Poisson dart-throw, the nodal set of a standing wave, a de
 * Jong orbit, the escape-time boundary of the Mandelbrot set, uniform noise, a
 * jittered grid ringed with radiance, and three marks on an empty ground.
 *
 * WHAT CHANGED IN THE PORT, and why:
 *
 *   - **The seed.** The painter hashes the typed phrase. This hashes the WALK —
 *     its cells, their sum, the distinct set they touch (`seed.ts`). Two
 *     spellings of one word are one walk and now draw one field.
 *   - **The stamp.** The painter stamps a Unicode character out of a pool, in
 *     `<text>`, picked at random. House rule 4 forbids `<text>` on a plate and a
 *     random pick carries nothing, so the stamp is a star polygon `{p/q}` whose
 *     two integers are read off the walked cell it stands for (`stamp.ts`).
 *   - **The count.** The painter's density is a slider. Here it is the
 *     theosophic reduction of the walked cell sum against the painter's own
 *     default (`render.ts`).
 *   - **Two mode constants.** Cymatic's wave numbers and Attractor's admission
 *     threshold were stream draws; both are now walk quantities, and both say in
 *     `signatures` what leaving them to the stream would have cost.
 *   - **Containment.** Every mode is contracted about the frame centre until its
 *     ink is inside the safe box (`render.ts`). The painter bleeds; a plate may
 *     not.
 *
 * Everything else — every magic number in the ten constructions — is carried
 * over unchanged and SIGNED: `ModeField.signatures` records twenty-three of them
 * with, for each, what a reader would measure differently if it were flipped.
 */

import type { Walk } from "@studio137/walk-engine";
import { reduceToCell } from "@studio137/walk-engine";

import { MODE_SPECS, type FieldContext, type ModeSpec } from "./fields.js";
import { cellSum, seedFromWalk } from "./seed.js";
import { modeField, type ModeOptions } from "./render.js";
import { MODE_IDS, isModeId, type ModeField, type ModeId } from "./types.js";

export { MODE_IDS, isModeId };
export type {
  ModeField,
  ModeId,
  ModeNode,
  ModePath,
  ModePathRole,
  ModeSignature,
} from "./types.js";
export type { FieldContext, ModeSpec } from "./fields.js";
export type { ModeOptions } from "./render.js";
export { MODE_SPECS } from "./fields.js";
export { BOX, MIN_STROKE, SAFE_PAD, baseStampRadius, modeField, requestedFor } from "./render.js";
export { cellSum, mulberry32, seedFromWalk } from "./seed.js";
export { RADIANCE_REACH, stampFor, stampPath } from "./stamp.js";
/**
 * Exported so `scripts/build-browser-bundle.ts` can put the two runtimes'
 * answers side by side on the same 50,000 arguments it uses to measure
 * `Math.sin` and `Math.cos`. The claim in `trig.ts` — that these two agree
 * bit-for-bit where the built-ins do not — is worth exactly as much as the
 * measurement of it, so the measurement needs a way in.
 */
export { MAX_EXACT_ARG, dcos, dsin } from "./trig.js";

/**
 * What the walk tells a field.
 *
 * `reduced` short-circuits at zero exactly the way `multiplierForWalk` does in
 * `envelope-engine`: `reduceToCell(0, 9)` returns 9, which would give a
 * letterless input the DENSEST possible field. It gets the thinnest instead —
 * nothing was spoken, so one mark is drawn. The two engines now agree that a
 * sum of zero is a floor and not a reduction, which is the correction the ring's
 * legend had to make once already.
 */
export function contextFromWalk(walk: Walk): FieldContext {
  const sum = cellSum(walk);
  return Object.freeze({
    cells: Object.freeze(walk.steps.map((s) => s.cell)),
    activatedCells: walk.activatedCells,
    activated: walk.activatedCells.length,
    sum,
    reduced: sum === 0 ? 1 : reduceToCell(sum, 9),
    order: walk.order,
    steps: walk.steps.length,
  });
}

/**
 * The whole package in one call: a walk and a mode name in, a drawable field
 * out.
 *
 * This is the only entry point `packages/ring` uses, so there is exactly one
 * place where a walk becomes a field and exactly one seed derivation — house
 * rule 1 at the scale of this package. A caller that wants to drive the field
 * directly can still reach `modeField`, but then it owns the seed.
 */
export function fieldFromWalk(
  walk: Walk,
  mode: ModeId,
  options: ModeOptions = {},
): ModeField {
  return modeField(mode, contextFromWalk(walk), seedFromWalk(walk, mode), options);
}

/** The mode's authored constants, for a caller that needs to quote them. */
export function modeSpec(mode: ModeId): ModeSpec {
  return MODE_SPECS[mode];
}

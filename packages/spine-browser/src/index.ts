/**
 * `@studio137/spine-browser` — the browser's view of the spine.
 *
 * ONE JOB: name the surface a user interface needs, so a bundler has a single
 * root to trace. Almost every line below is a re-export, and that is the point.
 * House rule 1 says the browser runs the SAME engine as the CLI, and the cheapest
 * way for that to stop being true is for a convenience to be written here instead
 * of imported. A helper added to this file would be a second answer to whatever
 * it computed: visible to the page, invisible to `s137`, and unreachable by the
 * tests that cover the packages. Two constants at the bottom are derived rather
 * than re-exported; each carries the derivation and what breaks if it drifts.
 *
 * WHY THIS DIRECTORY HAS NO `package.json`. Every other `packages/*` entry is a
 * workspace package, and `.github/workflows/verify.yml` installs with
 * `pnpm install --frozen-lockfile`. A manifest here would add a workspace member
 * the committed lockfile does not know about and fail that install — a broken CI
 * in exchange for nothing, because nothing imports this module by package name.
 * `scripts/build-browser-bundle.ts` hands esbuild this file's absolute path, and
 * the imports below resolve through the root `node_modules/@studio137/*` links
 * that already exist. `tsconfig.json` picks the file up through its
 * `packages` source glob either way, so it is typechecked like everything else.
 *
 * `verbatimModuleSyntax` is on repo-wide: every type crosses with `export type`,
 * so nothing below survives into the bundle except the values.
 */

import { CONCEPT_CORRESPONDENCE, WORD_CORRESPONDENCE } from "@studio137/glyph-registry";
import { MODE_IDS } from "@studio137/mode-engine";

/* ── the ring: one word in, four artifacts out ───────────────────────────── */

export { ring, SPECTRUM } from "@studio137/ring";
export type {
  Choice,
  Necessity,
  PlacedMark,
  Provenance,
  RingArtifacts,
  RingOptions,
} from "@studio137/ring";

/* ── stations 1 and 2: letters resolve, the walk crosses the square ──────── */

export {
  arrivalNormal,
  cellXY,
  cipherValue,
  CIPHER_IDS,
  digitString,
  digitSum,
  inferOrder,
  inverseCipher,
  isCipherId,
  isSquareId,
  kamea,
  magicConstant,
  positions,
  read,
  reduceToCell,
  resolve,
  SQUARE_IDS,
  TRACE_IDS,
  walk,
} from "@studio137/walk-engine";
export type {
  CipherId,
  Kamea,
  Point as WalkPoint,
  Reading,
  ReadOptions,
  Resolution,
  ResolvedLetter,
  SquareId,
  TraceId,
  Walk,
  WalkOptions,
  WalkPath,
  WalkPathRole,
  WalkStep,
} from "@studio137/walk-engine";

/* ── the envelope: a chord family whose envelope has m-1 cusps ───────────── */

export {
  cuspsForWalk,
  envelopeFromWalk,
  multiplierForWalk,
  NODES,
} from "@studio137/envelope-engine";
export type {
  ChordBand,
  EnvelopeFamily,
  EnvelopeOptions,
} from "@studio137/envelope-engine";

/* ── correspondence: the concept layer that rides, and never gates ───────── */

export {
  BRUSH_BINDINGS,
  CONCEPT_CORRESPONDENCE,
  CORRESPONDENCE_COVERAGE,
  CORRESPONDENCE_IS_PROVISIONAL,
  CORRESPONDENCE_SOURCES,
  CORRESPONDENCE_VERSION,
  correspondenceForConcept,
  correspondenceForWord,
  MARK_BINDINGS,
  TRADITION_LABELS,
  UNMAPPED_BRUSHES,
  WORD_CORRESPONDENCE,
} from "@studio137/glyph-registry";
export type {
  ArchKey,
  BrushBinding,
  BrushKey,
  ConceptCorrespondence,
  MarkBinding,
  ModeKey,
  PaletteKey,
  PlanetKey,
  TraditionKey,
  WordCorrespondence,
} from "@studio137/glyph-registry";

/* ── the locked marks ────────────────────────────────────────────────────── */

export {
  GEOMETRY_V2_INTEGRITY,
  GEOMETRY_V2_IS_PROVISIONAL,
  GEOMETRY_V2_SOURCE,
  GEOMETRY_V2_VERSION,
  geometryRegistry,
  geometryRegistryV2,
  pathDigest,
} from "@studio137/glyph-registry";
export type {
  GeometryRegistry,
  GlyphAnchors,
  GlyphGeometryRecord,
  LockedPath,
  PaintRole,
} from "@studio137/glyph-registry";

/* ── the numerals that keep `<text>` off a plate (house rule 4) ───────────────
   Reached by relative path because `@studio137/glyph-registry` publishes one
   export, ".", and its barrel does not carry the numerals. This is the same
   specifier `packages/ring/src/annotate.ts` already uses to reach them, so this
   file adds no new shape of import to the tree — it copies an existing one. */

export {
  NUMERAL_BY_CHARACTER,
  NUMERAL_METRICS,
  NUMERAL_STROKE_WIDTH,
  NUMERALS_V1_SOURCE,
  NUMERALS_V1_VERSION,
} from "../../glyph-registry/src/numerals.v1.js";
export type { NumeralSource } from "../../glyph-registry/src/numerals.v1.js";

/* ── the painter's composition modes ─────────────────────────────────────────
   `@studio137/mode-engine` landed beside this file. It is re-exported as a
   NAMESPACE rather than flattened, for one reason: it is under active development,
   and `export * as modes` follows whatever surface it publishes without a name
   list here to drift, and without a future export of theirs called `walk` or
   `read` silently colliding with station 1's and being dropped from the bundle.
   `MODE_IDS` and `isModeId` are ALSO re-exported flat, because the mode list is
   the thing a UI reaches for first; if either is ever renamed, `tsc` fails here
   rather than a control quietly rendering an empty menu.

   Read `MODES_NOT_YET_DRAWN` below before wiring a picker to either list. */

export * as modes from "@studio137/mode-engine";
export { isModeId, MODE_IDS } from "@studio137/mode-engine";
export type { ModeField, ModeId, ModeNode, ModePath, ModePathRole, ModeSignature } from "@studio137/mode-engine";

/* ── the hash the determinism contract is stated in ──────────────────────── */

export { sha256Hex } from "@studio137/plate-core";

/* ── the two derived readouts ────────────────────────────────────────────── */

/**
 * The words the receipt is allowed to return.
 *
 * `read()` carries no vocabulary of its own — by design, so a reading is a claim
 * about geometry rather than about a word list smuggled into the reader. Every
 * caller supplies one, and `apps/cli/src/index.ts` supplies exactly this:
 * `WORD_CORRESPONDENCE.map((w) => w.word)`. The same projection is spelled here
 * so a page can hand `ring()` the option the CLI hands it and get the same
 * receipt bytes.
 *
 * This is the one value in this file that could drift from the CLI, so it is
 * guarded by experiment rather than by assertion. `scripts/build-browser-bundle.ts`
 * runs `s137 ring` for six words and compares all four artifacts byte-for-byte
 * against a page that called `ring()` with `HOUSE_VOCABULARY`. The prediction, and
 * it has been run: drop the first entry of this array and the build fails on
 * `receipt.txt` — measured, on the word that entry named.
 */
export const HOUSE_VOCABULARY: readonly string[] = Object.freeze(
  WORD_CORRESPONDENCE.map((w) => w.word),
);

/**
 * The composition modes the concept table actually asks for.
 *
 * Read off `CONCEPT_CORRESPONDENCE` rather than authored here, so it cannot claim
 * a mode the table does not name or miss one it does. It is NOT a renderer
 * registry: it says which modes are REQUESTED and nothing about which are DRAWN.
 * When a mode registry lands beside the painter, re-export that instead and the
 * difference between the two lists becomes the honest coverage number.
 *
 * Sorted, so the bundle bytes do not depend on the table's row order.
 */
export const COMPOSITION_MODES: readonly string[] = Object.freeze(
  [...new Set(CONCEPT_CORRESPONDENCE.map((c) => c.composition.mode))].sort(),
);

/**
 * The gap between what the table ASKS FOR and what the engine CAN DRAW.
 *
 * Two lists arrive here from opposite directions. `COMPOSITION_MODES` is read off
 * the concept table: the modes nineteen concepts request. `MODE_IDS` comes from
 * `@studio137/mode-engine`: the modes something can actually construct. Neither is
 * authored here and neither is a subset of the other by construction, so the
 * difference is a real number rather than an opinion, and it is computed instead
 * of being asserted equal — an assertion would turn a coverage gap into a crash
 * and tempt somebody to close it by editing a list.
 *
 * A UI should drive a picker from `MODE_IDS`, since those are the ones that draw,
 * and may show this array as the honest footnote. It is empty when every requested
 * mode has an implementation.
 *
 * `ring()` READS THIS NOW. That sentence was false for a while and is worth
 * leaving a marker on: this comment used to end "`ring()` does not read either
 * list today — `packages/ring/src/index.ts` still reads only `planet` and
 * `brushes` off the concept table", and it stayed there through the commit that
 * made `ring()` dispatch on `composition.mode`. It was true when written and
 * nothing made it false out loud, which is the whole failure mode: a sentence
 * about the system that the system has since contradicted.
 *
 * What is true now: `ring()` paints the field the concept asks for, so the modes
 * change what a plate looks like rather than merely existing beside it. This
 * array is still the honest coverage gap between the two lists and is still
 * empty when every requested mode has an implementation — that part never
 * depended on who was reading it.
 */
export const MODES_NOT_YET_DRAWN: readonly string[] = Object.freeze(
  COMPOSITION_MODES.filter((mode) => !(MODE_IDS as readonly string[]).includes(mode)),
);

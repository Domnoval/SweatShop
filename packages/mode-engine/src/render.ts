/**
 * Field to path data, and the one guarantee this package makes about it:
 * **every coordinate it emits is inside the safe box.**
 *
 * That guarantee is arithmetic, not hope. The painter's fields deliberately
 * bleed off the canvas — `phyllotaxis` puts its last seed at 0.47 of the frame
 * and then draws a stamp centred on it, `lattice` and `chaos` fill the whole
 * rectangle to the edge — and a bleeding figure is fine on a screen and wrong on
 * a plate, where the drawing field is a measured box on a sheet and ink outside
 * it is ink a browser crops into looking correct. This repository has shipped
 * that defect five times.
 *
 * The fix is a single **uniform contraction about the frame centre**, chosen
 * after the field is built: measure how far the ink actually reaches, and if it
 * reaches past the safe box, scale everything — positions, stamp radii,
 * structure — by one factor. Contraction rather than clamping, because clamping
 * positions individually would pile stamps against the border and change the
 * construction; a contraction is the SAME construction, drawn smaller, and it is
 * one number the census can print.
 */

import { MODE_SPECS, type FieldContext, type RawNode } from "./fields.js";
import { mulberry32, seedFromWalk } from "./seed.js";
import { radiancePath, RADIANCE_REACH, segmentPath, stampFor, stampPath } from "./stamp.js";
import type { ModeField, ModeId, ModeNode, ModePath } from "./types.js";

/** The figure frame. Same 220-unit box `walk-engine` draws in — see `walk.ts`. */
export const BOX = 220;

/**
 * How far the mode's ink stays clear of the frame edge, in figure units.
 *
 * 22 is 10% of the frame. It is Free, signed: it leaves the box
 * `[22, 198]²`, whose inscribed circle of radius 88 clears the correspondence
 * marks' ring at 95 while its corners reach 124 — where no mark is placed. Take
 * it to 0 and every mode still contracts to fit the viewBox, but the outermost
 * stamps touch the drawing field's own border and the plate reads as a crop.
 */
export const SAFE_PAD = 22;

/**
 * The thinnest stroke this package will emit, in figure units.
 *
 * At the ring's figure scale of 0.75 that is 0.2625 mm, above the envelope's
 * 0.22 units / 0.165 mm — so adding a mode layer cannot lower the stroke gauge
 * the plate prints. Asserted in the suite rather than assumed.
 */
export const MIN_STROKE = 0.35;
const MAX_STROKE = 1.2;

/** Line weight grows with the mark it draws, bounded at both ends. */
const strokeFor = (radius: number): number =>
  Math.min(MAX_STROKE, Math.max(MIN_STROKE, 0.12 * radius));

const STRUCTURE_STROKE = MIN_STROKE;

/** The painter's stamp size is quoted on a 1000-unit canvas; the frame is 220. */
const FRAME_RATIO = BOX / 1000;

export type ModeOptions = Readonly<{
  /** Stamps to place, overriding the walk-derived count. For tests, not for taste. */
  count?: number;
}>;

/**
 * Stamps a mode asks its construction for, given the walk's reduction.
 *
 * THE COUNT RULE, and the only place it is written. The painter's density is a
 * slider; its per-mode default `dens` is where that slider sits, and this port
 * reads the slider off the word — the theosophic reduction of the walked cell
 * sum, 1..9, taken against 5 as the painter's own setting. A word reducing to 5
 * gets exactly the painter's default field; 1 gets a fifth of it; 9 asks for
 * 1.8× and clips at the mode's cap.
 *
 * `cap` and `base` are NOT derived. They are the mode's identity — Minimal is
 * `cap: 3, base: 280` — and driving them from the word would delete the modes
 * rather than drive them.
 *
 * Exported because the census quotes it for the nine modes a sheet did NOT use,
 * and a second spelling of this arithmetic is a second answer to how dense a
 * word is. The construction may still return fewer (a rejection sampler that
 * starves) or more (a grid that rounds up), which is why `ModeField` carries
 * both `requested` and `nodes.length`.
 */
export function requestedFor(mode: ModeId, reduced: number): number {
  const spec = MODE_SPECS[mode];
  const density = (spec.dens * reduced) / 5;
  return Math.max(1, Math.min(spec.cap, Math.round((spec.cap * density) / 100)));
}

/** A mode's stamp radius at `s = 1`, in figure units, before any contraction. */
export function baseStampRadius(mode: ModeId): number {
  return (MODE_SPECS[mode].base * FRAME_RATIO) / 2;
}

/** Reads the numbers back out of emitted path data, so bounds are of the BYTES. */
function boundsOf(paths: readonly ModePath[]): [number, number, number, number] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of paths) {
    const nums = p.d.match(/-?\d+(?:\.\d+)?/gu) ?? [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = Number(nums[i]);
      const y = Number(nums[i + 1]);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return [0, 0, 0, 0];
  return [minX, minY, maxX, maxY];
}

/**
 * Distinct structure-segment lengths, ranked — so structural ink can carry a hue
 * that reports something (house rule 5). Metatron's 78 chords fall into a small
 * number of length classes; colouring by class is a readout of the construction,
 * and a reader can count the classes off the plate.
 */
function lengthRanks(
  segments: readonly (readonly [number, number, number, number])[],
): (segment: readonly [number, number, number, number]) => number {
  const len = (s: readonly [number, number, number, number]): number =>
    Math.hypot(s[2] - s[0], s[3] - s[1]);
  // CLUSTERED, not rounded. Metatron's 78 chords fall into 7 geometric length
  // classes whose nearest two differ by several units, and rounding to a fixed
  // number of places splits a class whenever float noise straddles a boundary —
  // which it does: the same construction reported 7 classes measured on the raw
  // coordinates and 8 measured on the emitted ones. Sorting and cutting at a
  // gap wider than the noise and far narrower than the classes gives the same
  // answer from either set of coordinates.
  const TOLERANCE = 0.01;
  const sorted = segments.map(len).sort((a, b) => a - b);
  const bounds: number[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    if (i === 0 || sorted[i]! - sorted[i - 1]! > TOLERANCE) bounds.push(sorted[i]!);
  }
  return (s) => {
    if (bounds.length === 0) return 0;
    const v = len(s);
    let rank = 0;
    for (let i = 0; i < bounds.length; i += 1) if (v >= bounds[i]! - TOLERANCE) rank = i;
    return rank / bounds.length;
  };
}

export function modeField(
  mode: ModeId,
  ctx: FieldContext,
  seed: number,
  options: ModeOptions = {},
): ModeField {
  const spec = MODE_SPECS[mode];

  const requested = options.count ?? requestedFor(mode, ctx.reduced);

  const rng = mulberry32(seed);
  const field = spec.place(BOX, BOX, requested, rng, ctx);

  const r0 = baseStampRadius(mode);
  const centre = BOX / 2;
  const half = centre - SAFE_PAD;

  // REACH: the furthest any ink gets from the frame centre on each axis, before
  // contraction. A stamp is bounded exactly by its circumcircle; a Haring stamp
  // by the radiance ring outside it; a structure segment by its endpoints. Half
  // the heaviest stroke is added because a stroke straddles its path.
  let reachX = 0;
  let reachY = 0;
  const note = (x: number, y: number, pad: number): void => {
    reachX = Math.max(reachX, Math.abs(x - centre) + pad);
    reachY = Math.max(reachY, Math.abs(y - centre) + pad);
  };
  for (const nd of field.nodes) {
    const r = r0 * nd.s * (nd.radiant === true ? RADIANCE_REACH : 1);
    note(nd.x, nd.y, r + strokeFor(r0 * nd.s) / 2);
  }
  for (const s of field.structure) {
    note(s[0], s[1], STRUCTURE_STROKE / 2);
    note(s[2], s[3], STRUCTURE_STROKE / 2);
  }

  const contraction = Math.min(
    1,
    reachX > 0 ? half / reachX : 1,
    reachY > 0 ? half / reachY : 1,
  );
  const px = (v: number): number => centre + (v - centre) * contraction;
  const radius = r0 * contraction;

  const activated = ctx.activatedCells;
  const hueOf = (cell: number): number => {
    if (activated.length === 0) return 0;
    const i = activated.indexOf(cell);
    return i < 0 ? 0 : i / activated.length;
  };

  const nodes: ModeNode[] = field.nodes.map((raw: RawNode, index) => {
    // Stamps carry the walked steps in order and wrap: the field is a reading of
    // the word repeated as many times as it takes to fill the construction, not
    // a random draw from the alphabet. A letterless walk has no step to carry,
    // and says so with -1 rather than inventing a cell.
    const step = ctx.steps === 0 ? -1 : index % ctx.steps;
    const cell = step < 0 ? 0 : ctx.cells[step]!;
    return Object.freeze({
      index,
      x: px(raw.x),
      y: px(raw.y),
      s: raw.s,
      rot: raw.rot,
      op: raw.op,
      step,
      cell,
      hue: hueOf(cell),
      radiant: raw.radiant === true,
    });
  });

  const paths: ModePath[] = [];

  const rankOf = lengthRanks(field.structure);
  for (const s of field.structure) {
    paths.push(
      Object.freeze({
        d: segmentPath(px(s[0]), px(s[1]), px(s[2]), px(s[3])),
        role: "structure" as const,
        strokeWidth: STRUCTURE_STROKE,
        hue: rankOf(s),
        // The painter's own opacity for these chords, at `drawMetatronLines`.
        opacity: 0.18,
      }),
    );
  }

  for (const nd of nodes) {
    const r = radius * nd.s;
    if (nd.radiant) {
      paths.push(
        Object.freeze({
          d: radiancePath(nd.x, nd.y, r),
          role: "radiance" as const,
          strokeWidth: strokeFor(r),
          hue: nd.hue,
          opacity: nd.op * 0.8,
        }),
      );
    }
    paths.push(
      Object.freeze({
        d: stampPath(stampFor(nd.cell), nd.x, nd.y, r, nd.rot),
        role: "field" as const,
        strokeWidth: strokeFor(r),
        hue: nd.hue,
        opacity: nd.op,
      }),
    );
  }

  return Object.freeze({
    mode,
    label: spec.label,
    rule: spec.rule,
    viewBox: Object.freeze([0, 0, BOX, BOX] as const),
    requested,
    cap: spec.cap,
    nodes: Object.freeze(nodes),
    paths: Object.freeze(paths),
    stampRadius: radius,
    contraction,
    reach: Math.max(reachX, reachY),
    inkBounds: Object.freeze(boundsOf(paths)),
    seed,
    signatures: spec.signatures,
  });
}

export { seedFromWalk };

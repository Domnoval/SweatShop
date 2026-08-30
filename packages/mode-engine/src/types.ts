/**
 * What a composition mode is, and what it is allowed to hand back.
 *
 * A mode is a **placement field**: it decides where marks go, at what size, at
 * what angle, and how many there are. The painter's own comment on the block
 * these were lifted from says it plainly — *the vibe IS the placement field* —
 * and that is why ten of them are worth porting rather than one parameterised
 * blob. Phyllotaxis is not "lattice with a spiral option"; it is a different
 * construction that answers a different question about where the next mark goes.
 *
 * The field is not the drawing. `render.ts` turns nodes into path data, and the
 * mode may also contribute **structure** — ink that belongs to the construction
 * itself rather than to any one stamp. Metatron's seventy-eight chords and
 * Haring's radiance ticks are the two the painter draws, and both are ported.
 */

export const MODE_IDS = [
  "phyllotaxis",
  "lattice",
  "metatron",
  "organic",
  "cymatic",
  "attractor",
  "mandelbrot",
  "chaos",
  "haring",
  "minimal",
] as const;

export type ModeId = (typeof MODE_IDS)[number];

export function isModeId(value: string): value is ModeId {
  return (MODE_IDS as readonly string[]).includes(value);
}

/**
 * One placement. The painter's node shape, kept field for field.
 *
 * `s`, `rot` and `op` are the painter's; `step`, `cell` and `hue` are added by
 * this port, because in the painter a stamp is a random pick out of a glyph pool
 * and here it is a readout of a walked cell (see `stamp.ts`).
 */
export type ModeNode = Readonly<{
  index: number;
  x: number;
  y: number;
  /** Stamp scale multiplier, about 0.2–2 depending on the mode. */
  s: number;
  /** Degrees. */
  rot: number;
  /** 0–1. */
  op: number;
  /** Index into `walk.steps` this stamp carries; `-1` when the walk has none. */
  step: number;
  /** The walked cell this stamp is the figure of; `0` for a letterless walk. */
  cell: number;
  /** 0–1. Position of `cell` in the walk's activated set — a readout, not a filter. */
  hue: number;
  /** Haring alone rings its stamps with radiance ticks. The painter's own flag. */
  radiant: boolean;
}>;

/**
 * Roles a mode emits, so a renderer can style them without parsing path data —
 * the same contract `walk-engine` uses for `WalkPathRole`.
 *
 *   `structure` — the construction's own ink; drawn once, under everything.
 *   `field`     — one stamp per placement.
 *   `radiance`  — the ticks Haring rings a stamp with.
 */
export type ModePathRole = "structure" | "field" | "radiance";

export type ModePath = Readonly<{
  d: string;
  role: ModePathRole;
  /** Figure units, not stamp units. See `render.ts` for why it does not scale. */
  strokeWidth: number;
  /** 0–1 around the colour wheel. Same contract as `ChordBand.hue`. */
  hue: number;
  opacity: number;
}>;

/**
 * A choice this mode made that the walk did not force, recorded with a
 * prediction — house rule 6, at the granularity of a constant.
 *
 * `origin` says who decided: `painter` for a magic number carried over from
 * `assets/symbolpaintermk137.html` with no derivation behind it, `walk` for one
 * this port replaced with a quantity the word actually produces. Every `walk`
 * entry's reason states what the painter did instead and what that cost.
 */
export type ModeSignature = Readonly<{
  constant: string;
  value: string;
  origin: "painter" | "walk";
  reason: string;
}>;

export type ModeField = Readonly<{
  mode: ModeId;
  label: string;
  /** The painter's one-line statement of the construction. */
  rule: string;
  /** The frame these coordinates live in: `[minX, minY, width, height]`. */
  viewBox: readonly [number, number, number, number];
  /** Stamps this mode was asked for, before the construction failed to place any. */
  requested: number;
  /** The mode's own ceiling on `requested`. */
  cap: number;
  nodes: readonly ModeNode[];
  paths: readonly ModePath[];
  /** Radius of a stamp at `s = 1`, in figure units, after any contraction. */
  stampRadius: number;
  /**
   * Uniform contraction applied about the frame centre so every mark's ink lands
   * inside the safe box. `1` when the construction already fitted.
   */
  contraction: number;
  /**
   * How far the construction's ink reached from the frame centre BEFORE the
   * contraction, in figure units — the larger of the two axes.
   *
   * Reported because it is the only thing that says what the contraction
   * actually prevented, and the two cases differ: a reach past the frame's
   * half-width would have put ink outside the declared viewBox, while a reach
   * past the safe box's would only have crossed the margin. Which of the two a
   * given field was in varies by mode AND by word. Over the 170 vocabulary
   * words: phyllotaxis, attractor, mandelbrot and minimal never reach past the
   * frame; organic and cymatic always do; lattice, metatron, chaos and haring do
   * for some words and not others. So a census sentence that assumed either case
   * would be false on some plates. This is printed, and the sentence branches on
   * it.
   */
  reach: number;
  /** Measured over the emitted path data: `[minX, minY, maxX, maxY]`. */
  inkBounds: readonly [number, number, number, number];
  /** The walk-derived seed every random draw in this field came from. */
  seed: number;
  signatures: readonly ModeSignature[];
}>;

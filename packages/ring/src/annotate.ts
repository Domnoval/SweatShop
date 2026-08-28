/**
 * THE PRESS — the annotation layer for a ring sheet.
 *
 * A number on a drawing is a promise that something was measured. Every callout
 * below is derived from a field the build actually computed, and every one of
 * them names its source in a comment at the point of printing. Nothing here is
 * decorative, and nothing here is a plausible-looking constant: the reference
 * artwork that started this project printed millimetres converted to
 * light-seconds with every mantissa right and every exponent wrong by two or
 * three orders, under a tolerance of ±0.01 LS — ±2998 km — on a 15mm feature.
 * That is the failure this file exists to not repeat.
 *
 * NO TEXT. House rule 4: a `<text>` element in a plate is a failed build.
 * Everything legible on this layer is set in `numerals/v1`, the constructed
 * numeral set — locked path data, drawn by compass and rule, no font consulted.
 * `setRun` is the only way characters reach the sheet and it can only draw what
 * the locked set holds. That is checked, not assumed (`assertSettable`).
 *
 * WHAT LABELS WHAT. The set has ten digits and a handful of symbols; it has no
 * alphabet, so nothing here can be captioned in words. Two devices carry the
 * labelling instead, and both are self-evidencing:
 *
 *   1. Each count sits beside a miniature of the thing it counts — a loop glyph
 *      beside the loop count, a cusp beside the cusp count, a grid beside the
 *      activated-cell count. The reader checks the number by counting the same
 *      shape on the figure.
 *   2. The kamea is drawn in full. A reader who distrusts the magic constant
 *      adds a row.
 *
 * ONE TRUNK. This module owns no quantities. It receives the square from
 * `@studio137/walk-engine`, the envelope from `@studio137/envelope-engine`, and
 * the census from the ring's own grading, and it prints them. It computes
 * exactly two things itself, both pure unit conversions of values it was handed:
 * a length in millimetres from a length in figure units, and a decimal integer
 * from a hex digest.
 */

import { PlateError } from "@studio137/plate-core";
import { kamea, type Walk } from "@studio137/walk-engine";
import type { EnvelopeFamily } from "@studio137/envelope-engine";

// The numeral set is not re-exported from `@studio137/glyph-registry`'s barrel
// and that barrel is out of this change's scope, so it is reached by path. The
// registry package should export it; noted rather than worked around silently.
import {
  NUMERALS_V1_SOURCE,
  NUMERAL_BY_CHARACTER,
  NUMERAL_METRICS,
  type NumeralSource,
} from "../../glyph-registry/src/numerals.v1.js";

import type { Choice, Necessity, PlacedMark, Provenance } from "./index.js";

/* ── the stated print size ───────────────────────────────────────────────
   Every millimetre on this sheet is a real millimetre. The SVG declares
   `width="210mm" height="297mm"` over a `0 0 210 297` viewBox, so one user unit
   is one millimetre exactly and a scale bar drawn 50 units long measures 50mm
   under a ruler. This is the whole basis on which the dimensions below are
   "true by construction": there is no conversion factor to get wrong because
   the identity is 1:1. */

/** ISO A4 portrait, in millimetres. At 300 DPI this rasterises to 2480 x 3508. */
export const SHEET_W = 210;
export const SHEET_H = 297;
export const PRINT_DPI = 300;

/** Frame inset from the sheet edge. */
const FRAME = 10;

/**
 * The drawing field: where the figure is placed, and at what scale.
 *
 * The walk's own frame is a 220-unit box (`Walk.viewBox`). 0.75 is chosen so the
 * conversion is exact and stateable rather than a fitted remainder: 220 figure
 * units print at 165.00mm, and one figure unit is 0.75mm on the nose. Every
 * dimension this file prints is that factor times a number the build computed.
 */
export const FIG_UNITS = 220;
export const FIG_SCALE = 0.75;
const FIG_MM = FIG_UNITS * FIG_SCALE;          // 165.00
const FIG_X = (SHEET_W - FIG_MM) / 2;          // 22.50
const FIG_Y = 15;
/** Figure-unit length to millimetres on the printed sheet. */
export const mm = (figureUnits: number): number => figureUnits * FIG_SCALE;

/* ── palette ─────────────────────────────────────────────────────────────
   House rule 5: hue is a readout, never a filter. Two hues on this layer vary,
   and both vary as a function of a measured quantity — ACCENT marks the kamea
   cells the walk actually landed on, and the stroke gauge's marker is drawn in
   ALARM when the measured minimum stroke falls below the finest print floor.
   Nothing else changes colour for any reason. */

const GROUND = "#07090c";
const INK = "#dbe3ea";
const RULE = "#26374a";
const MUTED = "#6b7d8c";
const ACCENT = "#5ef2c4";
const ALARM = "#d2603a";
/** For a measured nought: recessive, but never so dark it reads as absent. */
const FAINT = "#455a6d";

/* ── stroke weights ──────────────────────────────────────────────────────
   In millimetres, because the sheet is in millimetres. */

const HAIRLINE = 0.25;
const RULE_W = 0.35;
const HEAVY_W = 0.6;

/* ── numeral sizes ───────────────────────────────────────────────────────
   Quoted as FIGURE HEIGHT — the height of a digit — because that is the number
   a reader perceives. The set's em box is 100 units with a 72-unit figure, so
   the em is always figureHeight * 100 / 72. */

const emOf = (figureHeight: number): number =>
  (figureHeight * 100) / NUMERAL_METRICS.figureHeight;

const SIZE_DRAWING_NO = 3.4;
const SIZE_VALUE = 3.2;
const SIZE_SMALL = 2.4;
const SIZE_TINY = 2.1;

/** Every figure height this layer sets, so the thinnest numeral is derived. */
const ALL_SIZES = [SIZE_DRAWING_NO, SIZE_VALUE, SIZE_SMALL, SIZE_TINY] as const;

/**
 * The thinnest ink this layer puts on the plate, in millimetres.
 *
 * The numeral set is one weight — `NUMERAL_METRICS.strokeWidth` units in a
 * 100-unit em — so the finest numeral stroke is the smallest em times that
 * ratio. Compared against the hairline so the answer is the true minimum of
 * everything the layer draws, not just of one family.
 */
export const ANNOTATION_MIN_STROKE_MM = Math.min(
  HAIRLINE,
  ...ALL_SIZES.map((h) => (emOf(h) * NUMERAL_METRICS.strokeWidth) / 100),
);

/* ── typesetting ─────────────────────────────────────────────────────────
   The only path by which a character reaches this sheet. */

const BY_ID = new Map<string, NumeralSource>(NUMERALS_V1_SOURCE.map((r) => [r.id, r]));

const glyph = (ch: string): NumeralSource | undefined => {
  const id = NUMERAL_BY_CHARACTER[ch];
  return id === undefined ? undefined : BY_ID.get(id);
};

const f = (v: number): string => {
  const r = Math.round(v * 1e4) / 1e4;
  return Object.is(r, -0) ? "0" : String(r);
};

/** Advance of one character at em size `em`. A space advances a text-size em. */
const advanceOf = (ch: string, em: number): number => {
  if (ch === " ") return (NUMERAL_METRICS.advance * em) / 100;
  const g = glyph(ch);
  return g === undefined ? 0 : (g.viewBox[2] * em) / 100;
};

const runWidth = (text: string, em: number): number =>
  [...text].reduce((w, ch) => w + advanceOf(ch, em), 0);

/**
 * Refuse to typeset a character the locked set cannot draw.
 *
 * This is an internal invariant, NOT a gate on input (house rule 3). No word
 * ever reaches this function: everything set on this layer is a number this
 * module formatted from a field the build computed, so an unsettable character
 * means a formatting bug here, not an unusual input. Silently dropping it would
 * print `1.5` where `1.5e` was meant — a wrong number, confidently set.
 */
function assertSettable(text: string): void {
  for (const ch of text) {
    if (ch !== " " && glyph(ch) === undefined) {
      throw new PlateError(
        "INVALID_REQUEST",
        `numerals/v1 cannot set ${JSON.stringify(ch)} (in ${JSON.stringify(text)}). ` +
          `The annotation layer may only print characters the locked set holds.`,
        { character: ch, text },
      );
    }
  }
}

/**
 * Set a string, its baseline on `baselineY`, its first glyph's origin at `x`.
 *
 * Advances come from each record's own `viewBox[2]` — the set is monospaced and
 * the advance IS the box width, so there is no width table here to drift out of
 * step with the geometry.
 */
function setRun(
  text: string,
  x: number,
  baselineY: number,
  figureHeight: number,
  colour: string,
): string {
  assertSettable(text);
  const em = emOf(figureHeight);
  const s = em / 100;
  // The set's baseline sits at y=86 in the em box, so the box origin is above it.
  const top = baselineY - (em * NUMERAL_METRICS.baseline) / 100;
  const out: string[] = [];
  let pen = x;
  for (const ch of text) {
    const g = glyph(ch);
    if (g !== undefined) {
      out.push(`<g transform="translate(${f(pen)} ${f(top)}) scale(${f(s)})">`);
      for (const p of g.paths) {
        out.push(
          p.role === "fill"
            ? `<path d="${p.d}" fill="${colour}" stroke="none"/>`
            : `<path d="${p.d}" fill="none" stroke="${colour}" stroke-width="${p.strokeWidth}" ` +
              `stroke-linecap="round" stroke-linejoin="round"/>`,
        );
      }
      out.push("</g>");
    }
    pen += advanceOf(ch, em);
  }
  return out.join("");
}

const setRight = (t: string, right: number, y: number, h: number, c: string): string =>
  setRun(t, right - runWidth(t, emOf(h)), y, h, c);

const setCentred = (t: string, cx: number, y: number, h: number, c: string): string =>
  setRun(t, cx - runWidth(t, emOf(h)) / 2, y, h, c);

/* ── drawing primitives ──────────────────────────────────────────────────
   Rules, arrowheads and knockouts. These are marks, not characters: nothing
   below stands in for a letter the numeral set does not have. Where a relation
   would normally be written with an `=` or a caption, this layer draws the
   relation instead — a highlighted row, a leader, a tick per unit counted. */

const line = (x1: number, y1: number, x2: number, y2: number, c: string, w: number): string =>
  `<path d="M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}" stroke="${c}" stroke-width="${f(w)}" fill="none"/>`;

const box = (x: number, y: number, w: number, h: number, c: string, sw: number): string =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="none" ` +
  `stroke="${c}" stroke-width="${f(sw)}"/>`;

/** A knockout, so a callout stays legible where it crosses the figure. */
const knockout = (x: number, y: number, w: number, h: number): string =>
  `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${GROUND}" opacity="0.92"/>`;

/** A filled dimension arrowhead at (x, y), pointing along `dir` (-1 left, +1 right). */
const arrowH = (x: number, y: number, dir: -1 | 1, c: string): string => {
  const len = 2.6;
  const half = 0.8;
  return (
    `<path d="M${f(x)} ${f(y)} L${f(x - dir * len)} ${f(y - half)} ` +
    `L${f(x - dir * len)} ${f(y + half)} Z" fill="${c}" stroke="none"/>`
  );
};

/* ── count icons ─────────────────────────────────────────────────────────
   Each count on the sheet is labelled by a miniature of the thing it counts, so
   the reader can check the number by counting that same shape on the figure.
   Every icon is drawn inside a 9mm square whose centre is (0, 0) after the
   caller's translate. */

const ICON = 9;

/** Nodes: a circle carrying evenly spaced node ticks. */
function iconNodes(): string {
  const r = 3.1;
  const ticks: string[] = [];
  for (let i = 0; i < 12; i += 1) {
    const a = (2 * Math.PI * i) / 12 - Math.PI / 2;
    ticks.push(
      line(Math.cos(a) * r, Math.sin(a) * r, Math.cos(a) * (r + 1.1), Math.sin(a) * (r + 1.1), MUTED, HAIRLINE),
    );
  }
  return (
    `<circle cx="0" cy="0" r="${f(r)}" fill="none" stroke="${MUTED}" stroke-width="${HAIRLINE}"/>` +
    ticks.join("")
  );
}

/**
 * Cusps: one cusp of an epicycloid — two arcs meeting at a point.
 *
 * The shape a reader is being asked to count on the figure. Drawn as two equal
 * circular arcs whose common endpoint is the cusp tip; the sweep flags oppose,
 * which is what puts a corner there instead of a smooth crest.
 */
function iconCusp(): string {
  const w = 3.4;
  const h = 3.6;
  const r = 4.6;
  return (
    `<path d="M${f(-w)} ${f(h * 0.6)} A${f(r)} ${f(r)} 0 0 1 0 ${f(-h)}" ` +
    `fill="none" stroke="${MUTED}" stroke-width="${HAIRLINE}"/>` +
    `<path d="M0 ${f(-h)} A${f(r)} ${f(r)} 0 0 1 ${f(w)} ${f(h * 0.6)}" ` +
    `fill="none" stroke="${MUTED}" stroke-width="${HAIRLINE}"/>`
  );
}

/** Segments: a run of straight chords with a node at each turn. */
function iconSegments(): string {
  const pts: Array<[number, number]> = [
    [-3.6, 2.2],
    [-1.2, -2.4],
    [1.2, 1.8],
    [3.6, -2.2],
  ];
  const d = pts.map((p, i) => `${i === 0 ? "M" : "L"}${f(p[0])} ${f(p[1])}`).join(" ");
  return (
    `<path d="${d}" fill="none" stroke="${MUTED}" stroke-width="${HAIRLINE}" ` +
    `stroke-linejoin="round" stroke-linecap="round"/>` +
    pts
      .map((p) => `<circle cx="${f(p[0])}" cy="${f(p[1])}" r="0.5" fill="${MUTED}" stroke="none"/>`)
      .join("")
  );
}

/** Loops: the walk's own loop glyph — a circle hung off a node on the line. */
function iconLoop(): string {
  const r = 1.9;
  return (
    line(-3.8, 1.6, 0, 1.6, MUTED, HAIRLINE) +
    line(0, 1.6, 3.8, 1.6, MUTED, HAIRLINE) +
    `<circle cx="0" cy="${f(1.6 - r)}" r="${f(r)}" fill="none" stroke="${MUTED}" stroke-width="${HAIRLINE}"/>` +
    `<circle cx="0" cy="1.6" r="0.5" fill="${MUTED}" stroke="none"/>`
  );
}

/** Activated cells: a kamea, some of whose cells are struck. */
function iconCells(): string {
  const n = 3;
  const s = 5.4;
  const c = s / n;
  const out: string[] = [box(-s / 2, -s / 2, s, s, MUTED, HAIRLINE)];
  for (let i = 1; i < n; i += 1) {
    out.push(line(-s / 2 + c * i, -s / 2, -s / 2 + c * i, s / 2, MUTED, HAIRLINE));
    out.push(line(-s / 2, -s / 2 + c * i, s / 2, -s / 2 + c * i, MUTED, HAIRLINE));
  }
  for (const [r, q] of [[0, 1], [1, 1], [2, 0]] as const) {
    out.push(
      `<rect x="${f(-s / 2 + c * q)}" y="${f(-s / 2 + c * r)}" width="${f(c)}" height="${f(c)}" ` +
        `fill="${MUTED}" stroke="none" opacity="0.5"/>`,
    );
  }
  return out.join("");
}

/** Marks placed: a ring carrying marks at even spacing, which is how they sit. */
function iconMarks(): string {
  const r = 3.0;
  const out = [
    `<circle cx="0" cy="0" r="${f(r)}" fill="none" stroke="${MUTED}" ` +
      `stroke-width="${HAIRLINE}" stroke-dasharray="0.9 1.2"/>`,
  ];
  for (let i = 0; i < 6; i += 1) {
    const a = (2 * Math.PI * i) / 6 - Math.PI / 2;
    out.push(
      `<rect x="${f(Math.cos(a) * r - 0.7)}" y="${f(Math.sin(a) * r - 0.7)}" width="1.4" ` +
        `height="1.4" fill="${MUTED}" stroke="none"/>`,
    );
  }
  return out.join("");
}

/* ── the drawing number ──────────────────────────────────────────────────── */

/**
 * The sheet's SHA, as digits.
 *
 * `sheetId` is 16 hex characters and the numeral set has no A-F, so the digest
 * is printed in base ten. This is a change of base, not of value: a stranger
 * recomputes it by hashing the figure, taking the first 16 hex characters,
 * reading them as a big-endian 64-bit integer and printing that in decimal.
 * Zero-padded to 20 places — the width of 2^64 - 1 — so the field is fixed and
 * a leading zero can never be mistaken for a shorter number.
 */
export function drawingNumber(sheetId: string): string {
  if (!/^[0-9a-f]{16}$/u.test(sheetId)) {
    throw new PlateError(
      "INVALID_REQUEST",
      `A drawing number needs a 16-character lowercase hex digest, received ${JSON.stringify(sheetId)}.`,
      { sheetId },
    );
  }
  return BigInt(`0x${sheetId}`).toString(10).padStart(20, "0");
}

/* ── inputs ──────────────────────────────────────────────────────────────── */

export type AnnotationInput = Readonly<{
  walk: Walk;
  envelope: EnvelopeFamily;
  marks: readonly PlacedMark[];
  choices: readonly Choice[];
  /** SHA of the figure markup, 16 hex characters. */
  sheetId: string;
  /**
   * Every stroke width the figure actually paints, in millimetres on this sheet
   * — collected by the composer as it emits, so the minimum printed below is
   * measured from the drawing rather than restated from a constant.
   */
  figureStrokesMm: readonly number[];
}>;

/**
 * Minimum reliable stroke by print method, in millimetres.
 *
 * Transcribed from `scripts/build-print-kit.ts`, which is where these floors are
 * stated and reasoned. They are garment floors: DTF carries its own white base
 * and holds a finer line than DTG, which must register colour over a separately
 * laid underbase, and on a dark garment that registration is what eats thin
 * strokes. This is a paper sheet (house rule 7), so the floors are printed as a
 * verdict on a second profile, not as a pass mark for this one.
 */
const FLOOR_MM = Object.freeze([
  { id: "dtf", mm: 0.5 },
  { id: "dtgLight", mm: 0.6 },
  { id: "dtgDark", mm: 1.0 },
]);

const NECESSITIES: readonly Necessity[] = ["load-bearing", "answerable", "free", "arbitrary"];
const PROVENANCES: readonly Provenance[] = ["generative", "walk-derived", "partial", "control"];

/* ── the layer ───────────────────────────────────────────────────────────── */

/**
 * Compose the annotation layer, in millimetres, over a figure already placed at
 * `FIG_X, FIG_Y` at `FIG_SCALE`.
 */
export function annotationLayer(input: AnnotationInput): string {
  const { walk, envelope, marks, choices, sheetId, figureStrokesMm } = input;
  const parts: string[] = [];

  /* ── frame ─────────────────────────────────────────────────────────────
     The border a drawing is trimmed to. */
  parts.push(box(FRAME, FRAME, SHEET_W - FRAME * 2, SHEET_H - FRAME * 2, RULE, RULE_W));

  /* ── the envelope diameter, dimensioned ────────────────────────────────
     SOURCE: envelope.radius (figure units, from @studio137/envelope-engine),
     envelope.centre (figure units). Converted once, by mm() — the only unit
     conversion on this sheet, and it is a multiplication by FIG_SCALE.

     The extension lines are tangent to the envelope at its widest point, which
     is why they touch the caustic exactly where the dimension is taken. A ruler
     laid between them on the printed sheet reads the number set above. */
  const cx = FIG_X + mm(envelope.centre[0]);
  const cy = FIG_Y + mm(envelope.centre[1]);
  const rMm = mm(envelope.radius);
  const diameterMm = rMm * 2;
  const dimY = 187;

  // Dashed, and a shade brighter than a hairline: an extension line that cannot
  // be seen where it crosses the figure proves nothing about where the
  // measurement was taken, and where it was taken is the whole claim.
  const extension = (ex: number): string =>
    `<path d="M${f(ex)} ${f(cy)} L${f(ex)} ${f(dimY + 3)}" stroke="${MUTED}" ` +
    `stroke-width="0.3" stroke-dasharray="2.4 2.0" fill="none"/>`;

  parts.push(
    `<g id="dim-envelope">`,
    extension(cx - rMm),
    extension(cx + rMm),
    line(cx - rMm, dimY, cx + rMm, dimY, INK, RULE_W),
    arrowH(cx - rMm, dimY, -1, INK),
    arrowH(cx + rMm, dimY, 1, INK),
  );
  {
    // "117.00 mm" — envelope.radius * 2 * FIG_SCALE, fixed at two decimals
    // because the sheet cannot hold a third: 0.01mm is a third of the finest
    // stroke on the plate.
    const label = `${diameterMm.toFixed(2)} mm`;
    const w = runWidth(label, emOf(SIZE_VALUE));
    parts.push(
      knockout(cx - w / 2 - 1.5, dimY - SIZE_VALUE - 3.4, w + 3, SIZE_VALUE + 3.4),
      setCentred(label, cx, dimY - 2.2, SIZE_VALUE, INK),
    );
  }
  parts.push(`</g>`);

  /* ── title block ───────────────────────────────────────────────────────── */

  const blockTop = 195;
  const blockBottom = SHEET_H - FRAME;
  const rowSplit = 248;
  const colA = FRAME;
  const colB = 75;
  const colC = 140;
  const colE = 108;

  parts.push(
    `<g id="title-block">`,
    line(FRAME, blockTop, SHEET_W - FRAME, blockTop, RULE, HEAVY_W),
    line(FRAME, rowSplit, SHEET_W - FRAME, rowSplit, RULE, RULE_W),
    line(colB, blockTop, colB, rowSplit, RULE, RULE_W),
    line(colC, blockTop, colC, rowSplit, RULE, RULE_W),
    line(colE, rowSplit, colE, blockBottom, RULE, RULE_W),
  );

  parts.push(kameaBlock(walk, colA, blockTop, colB - colA, rowSplit - blockTop));
  parts.push(countsBlock(walk, envelope, marks, colB, blockTop, colC - colB, rowSplit - blockTop));
  parts.push(censusBlock(choices, colC, blockTop, SHEET_W - FRAME - colC, rowSplit - blockTop));
  parts.push(metrologyBlock(figureStrokesMm, colA, rowSplit, colE - colA, blockBottom - rowSplit));
  parts.push(drawingNumberBlock(sheetId, colE, rowSplit, SHEET_W - FRAME - colE, blockBottom - rowSplit));
  parts.push(`</g>`);

  const svg = parts.join("");
  assertNoText(svg);
  return svg;
}

/* ── block: the kamea ────────────────────────────────────────────────────── */

/**
 * The square itself, its order, and its magic constant.
 *
 * SOURCE: kamea(walk.square) from @studio137/walk-engine — the one trunk that
 * owns squares. `.grid` is drawn cell by cell, `.magicConstant` is printed, and
 * the order is `.n`. Nothing is recomputed here; the square is asserted magic at
 * that module's load, not at this one's.
 *
 * The magic constant is labelled by drawing the relation instead of writing it:
 * the top row is underlined in accent and the constant is set at the end of that
 * underline. A reader adds the three or nine numbers above the line and gets it.
 * The order is labelled the same way — a tick per column under the grid, so the
 * printed order and the countable columns are the same claim twice.
 */
function kameaBlock(walk: Walk, x: number, y: number, w: number, h: number): string {
  const square = kamea(walk.square);
  const n = square.n;                                   // SOURCE: Kamea.n (= walk.order)
  const touched = new Set(walk.activatedCells);         // SOURCE: Walk.activatedCells

  const pad = 5;
  const constantGap = 13;
  const orderGap = 9;
  const grid = Math.min(w - pad * 2 - constantGap, h - pad * 2 - orderGap);
  const cell = grid / n;
  const gx = x + pad;
  const gy = y + pad + 1;

  // The widest value the square holds decides the numeral size, so an order-9
  // square with two-digit cells sets as comfortably as an order-3 with one.
  const widest = String(n * n).length;
  const emFit = (cell * 0.74) / (widest * (NUMERAL_METRICS.advance / 100));
  const KAMEA_MAX_FIGURE_HEIGHT = 4.2;
  const figureHeight = Math.min(
    KAMEA_MAX_FIGURE_HEIGHT,
    (Math.min(emFit, cell * 0.62) * NUMERAL_METRICS.figureHeight) / 100,
  );

  const out: string[] = [`<g id="kamea">`];

  // Cells the walk landed on, washed in accent. Hue as readout: the wash is a
  // function of membership in Walk.activatedCells and of nothing else.
  square.grid.forEach((row, r) => {
    row.forEach((value, c) => {
      if (!touched.has(value)) return;
      out.push(
        `<rect x="${f(gx + c * cell)}" y="${f(gy + r * cell)}" width="${f(cell)}" ` +
          `height="${f(cell)}" fill="${ACCENT}" stroke="none" opacity="0.16"/>`,
      );
    });
  });

  out.push(box(gx, gy, grid, grid, RULE, HAIRLINE));
  for (let i = 1; i < n; i += 1) {
    out.push(line(gx + cell * i, gy, gx + cell * i, gy + grid, RULE, HAIRLINE));
    out.push(line(gx, gy + cell * i, gx + grid, gy + cell * i, RULE, HAIRLINE));
  }

  square.grid.forEach((row, r) => {
    row.forEach((value, c) => {
      out.push(
        setCentred(
          String(value),                                 // SOURCE: Kamea.grid[r][c]
          gx + cell * (c + 0.5),
          gy + cell * (r + 0.5) + figureHeight / 2,
          figureHeight,
          touched.has(value) ? ACCENT : INK,
        ),
      );
    });
  });

  // The magic constant, at the end of an underline drawn along the top row.
  const rowY = gy + cell;
  out.push(line(gx, rowY, gx + grid + 3, rowY, ACCENT, HAIRLINE));
  out.push(
    setRun(
      String(square.magicConstant),                      // SOURCE: Kamea.magicConstant
      gx + grid + 4.5,
      rowY - 0.6,
      SIZE_SMALL,
      ACCENT,
    ),
  );

  // The order, under a tick per column.
  const tickY = gy + grid + 3;
  out.push(line(gx, tickY, gx + grid, tickY, MUTED, HAIRLINE));
  for (let i = 0; i <= n; i += 1) {
    out.push(line(gx + cell * i, tickY - 1.2, gx + cell * i, tickY + 1.2, MUTED, HAIRLINE));
  }
  out.push(
    setCentred(String(n), gx + grid / 2, tickY + 5.4, SIZE_SMALL, MUTED), // SOURCE: Kamea.n
  );

  out.push(`</g>`);
  return out.join("");
}

/* ── block: the counts ───────────────────────────────────────────────────── */

/**
 * Five counts, each beside a miniature of the thing it counts.
 *
 * Every value is a field, not a derivation. The reader checks each by counting
 * the same shape on the figure — which is the point of the icons, and the reason
 * the envelope was built so its cusps are countable in the first place.
 */
function countsBlock(
  walk: Walk,
  envelope: EnvelopeFamily,
  marks: readonly PlacedMark[],
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const rows: ReadonlyArray<readonly [string, () => string]> = [
    [String(envelope.nodes), iconNodes],             // SOURCE: EnvelopeFamily.nodes
    [String(envelope.cusps), iconCusp],              // SOURCE: EnvelopeFamily.cusps
    [String(walk.segmentCount), iconSegments],       // SOURCE: Walk.segmentCount
    [String(walk.loopCount), iconLoop],              // SOURCE: Walk.loopCount
    [String(walk.activatedCells.length), iconCells], // SOURCE: Walk.activatedCells.length
    [String(marks.length), iconMarks],               // SOURCE: PlacedMark[].length
  ];

  const pad = 5;
  const pitch = (h - pad * 2) / rows.length;
  const out: string[] = [`<g id="counts">`];

  rows.forEach(([value, icon], i) => {
    const midY = y + pad + pitch * (i + 0.5);
    out.push(`<g transform="translate(${f(x + pad + ICON / 2)} ${f(midY)})">${icon()}</g>`);
    const valueRight = x + w - pad;
    const valueLeft = valueRight - runWidth(value, emOf(SIZE_VALUE));
    // Leader from icon to figure. The figures stay right-aligned — a column of
    // counts that plumbs is the whole reason this set is monospaced — and the
    // leader is what stops a wide cell from reading as two loose columns.
    out.push(
      `<path d="M${f(x + pad + ICON + 2)} ${f(midY)} L${f(valueLeft - 2.5)} ${f(midY)}" ` +
        `stroke="${RULE}" stroke-width="${HAIRLINE}" stroke-dasharray="0.5 1.9" fill="none"/>`,
    );
    out.push(setRight(value, valueRight, midY + SIZE_VALUE / 2, SIZE_VALUE, INK));
  });

  out.push(`</g>`);
  return out.join("");
}

/* ── block: the census ───────────────────────────────────────────────────── */

/**
 * The provenance x necessity census, as counts.
 *
 * SOURCE: RingArtifacts.choices — every Choice carries a provenance and a
 * necessity, and this is their cross-tabulation with both margins. Rows are
 * PROVENANCES in order, columns NECESSITIES in order; the headers are the index
 * of each, 1..4, and the legend names them. Balloon-and-parts-list: one lookup,
 * and the grid stays readable without an alphabet.
 *
 * A zero is set in MUTED rather than omitted. An empty cell reads as "not
 * measured"; a nought reads as "measured, and none" — which is the claim.
 */
function censusBlock(
  choices: readonly Choice[],
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const count = (p: Provenance, nec: Necessity): number =>
    choices.filter((c) => c.provenance === p && c.necessity === nec).length;

  const pad = 5;
  const cols = NECESSITIES.length + 1;   // four grades, then the row total
  const rows = PROVENANCES.length + 1;   // four provenances, then the column total
  const cw = (w - pad * 2) / cols;
  const ch = Math.min(8.2, (h - pad * 2 - 6) / rows);
  const gx = x + pad;
  // Centred in the cell, header row included, so the block does not float.
  const gy = y + (h - ch * rows) / 2 + 2;

  const out: string[] = [`<g id="census">`];

  // Column headers: the necessity index, 1..4. The total column is left blank
  // and separated by a rule instead, so it cannot be read as a fifth grade.
  for (let c = 0; c < NECESSITIES.length; c += 1) {
    out.push(setCentred(String(c + 1), gx + cw * (c + 0.5), gy - 1.8, SIZE_TINY, MUTED));
  }

  for (let r = 0; r < PROVENANCES.length; r += 1) {
    // Row header: the provenance index, 1..4, outside the grid on the left.
    out.push(setCentred(String(r + 1), gx - 2.6, gy + ch * (r + 0.5) + SIZE_TINY / 2, SIZE_TINY, MUTED));
    let rowTotal = 0;
    for (let c = 0; c < NECESSITIES.length; c += 1) {
      const v = count(PROVENANCES[r]!, NECESSITIES[c]!);
      rowTotal += v;
      out.push(
        setCentred(
          String(v),
          gx + cw * (c + 0.5),
          gy + ch * (r + 0.5) + SIZE_TINY / 2,
          SIZE_TINY,
          v === 0 ? FAINT : INK,
        ),
      );
    }
    out.push(
      setCentred(
        String(rowTotal),
        gx + cw * (NECESSITIES.length + 0.5),
        gy + ch * (r + 0.5) + SIZE_TINY / 2,
        SIZE_TINY,
        rowTotal === 0 ? FAINT : MUTED,
      ),
    );
  }

  // Column totals, and the grand total in the corner — which must equal
  // choices.length, and is drawn from the same array either way.
  let grand = 0;
  for (let c = 0; c < NECESSITIES.length; c += 1) {
    const colTotal = PROVENANCES.reduce((t, p) => t + count(p, NECESSITIES[c]!), 0);
    grand += colTotal;
    out.push(
      setCentred(
        String(colTotal),
        gx + cw * (c + 0.5),
        gy + ch * (PROVENANCES.length + 0.5) + SIZE_TINY / 2,
        SIZE_TINY,
        colTotal === 0 ? FAINT : MUTED,
      ),
    );
  }
  out.push(
    setCentred(
      String(grand),
      gx + cw * (NECESSITIES.length + 0.5),
      gy + ch * (PROVENANCES.length + 0.5) + SIZE_TINY / 2,
      SIZE_TINY,
      ACCENT,
    ),
  );

  // Rules: under the headers, above the totals row, and left of the total column.
  out.push(line(gx, gy - 0.6, gx + cw * cols, gy - 0.6, RULE, HAIRLINE));
  out.push(
    line(gx, gy + ch * PROVENANCES.length, gx + cw * cols, gy + ch * PROVENANCES.length, RULE, HAIRLINE),
  );
  out.push(
    line(
      gx + cw * NECESSITIES.length,
      gy - 0.6,
      gx + cw * NECESSITIES.length,
      gy + ch * rows,
      RULE,
      HAIRLINE,
    ),
  );

  out.push(`</g>`);
  return out.join("");
}

/* ── block: scale bar and stroke gauge ───────────────────────────────────── */

/**
 * The scale bar, and the plate's thinnest stroke against the print floors.
 *
 * THE SCALE BAR is true by construction and not by claim: the sheet's viewBox is
 * in millimetres at its stated print size, so a bar drawn 50 units long is 50mm.
 * There is no scale factor between the drawn bar and the printed bar to get
 * wrong. Ten-millimetre divisions, so a reader can check it against a ruler at a
 * glance rather than trusting the end labels.
 *
 * THE STROKE GAUGE prints the finest stroke the plate actually paints, measured
 * from the widths the figure emitted, and places it against the three garment
 * floors from `scripts/build-print-kit.ts`. The marker turns ALARM when the
 * measured minimum falls under the finest of them — a hue that is a function of
 * a comparison between two measured numbers, which is the only kind of hue this
 * sheet is allowed (house rule 5).
 */
function metrologyBlock(
  figureStrokesMm: readonly number[],
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const pad = 5;
  const out: string[] = [`<g id="metrology">`];

  /* scale bar — 50mm, in 10mm divisions */
  const barLen = 50;
  const barX = x + pad;
  const barY = y + pad + 6;
  const barH = 2.4;
  for (let i = 0; i < 5; i += 1) {
    out.push(
      `<rect x="${f(barX + i * 10)}" y="${f(barY)}" width="10" height="${f(barH)}" ` +
        `fill="${i % 2 === 0 ? INK : GROUND}" stroke="${INK}" stroke-width="${HAIRLINE}"/>`,
    );
  }
  out.push(setCentred("0", barX, barY - 1.4, SIZE_TINY, MUTED));
  out.push(setCentred("50", barX + barLen, barY - 1.4, SIZE_TINY, MUTED));
  out.push(setRun("mm", barX + barLen + 3.4, barY + barH / 2 + SIZE_TINY / 2, SIZE_TINY, MUTED));

  /* stroke gauge */
  const minMm = Math.min(...figureStrokesMm, ANNOTATION_MIN_STROKE_MM);
  const gaugeX = x + pad;
  const gaugeW = w - pad * 2 - 18;
  const gaugeY = barY + barH + 12;
  const span = 1.2;                                   // millimetres, full width
  const at = (v: number): number => gaugeX + (Math.min(v, span) / span) * gaugeW;

  out.push(line(gaugeX, gaugeY, gaugeX + gaugeW, gaugeY, MUTED, HAIRLINE));

  // The DTF and DTG-on-light floors are 0.1mm apart and their labels are wider
  // than that gap, so the labels are staggered onto two lines with the taller
  // tick carrying the upper one. Two numbers touching on a drawing is how a
  // reader ends up quoting the wrong one.
  FLOOR_MM.forEach((floor, i) => {
    const fx = at(floor.mm);
    const raised = i % 2 === 1;
    const tickTop = raised ? 6.0 : 2.6;
    out.push(line(fx, gaugeY - tickTop, fx, gaugeY + 0.9, MUTED, HAIRLINE));
    out.push(setCentred(floor.mm.toFixed(1), fx, gaugeY - tickTop - 1.0, SIZE_TINY, MUTED));
  });

  // The marker: a triangle under the axis at the measured minimum, with the
  // value beside it. ALARM when it falls under the finest floor — a hue that is
  // a function of a comparison between two measured numbers, nothing else.
  const under = minMm < FLOOR_MM[0]!.mm;
  const colour = under ? ALARM : ACCENT;
  const mx = at(minMm);
  out.push(
    `<path d="M${f(mx)} ${f(gaugeY)} L${f(mx - 1.3)} ${f(gaugeY + 2.6)} ` +
      `L${f(mx + 1.3)} ${f(gaugeY + 2.6)} Z" fill="${colour}" stroke="none"/>`,
  );
  // Three decimals: the finest stroke on this plate is hundredths of a
  // millimetre, and two decimals would round the reading away.
  out.push(setRun(`${minMm.toFixed(3)} mm`, mx + 2.6, gaugeY + 5.2, SIZE_SMALL, colour));

  out.push(`</g>`);
  return out.join("");
}

/* ── block: the drawing number ───────────────────────────────────────────── */

/**
 * The drawing number: this sheet's own checksum, in base ten.
 *
 * SOURCE: RingArtifacts.sheetId — SHA-256 of the figure markup, first 16 hex
 * characters, read as a 64-bit integer. Not a serial anybody assigned: two
 * people with the same figure compute the same twenty digits and neither has to
 * trust the other. Set in groups of five so a reader can compare it against
 * another copy without losing their place, which is what the monospaced advance
 * of this set was cut for.
 */
function drawingNumberBlock(
  sheetId: string,
  x: number,
  y: number,
  w: number,
  h: number,
): string {
  const digits = drawingNumber(sheetId);
  const groups = [digits.slice(0, 5), digits.slice(5, 10), digits.slice(10, 15), digits.slice(15, 20)];
  const em = emOf(SIZE_DRAWING_NO);
  const gap = 1.6;
  const groupW = runWidth(groups[0]!, em);
  const total = groupW * 4 + gap * 3;

  const startX = x + (w - total) / 2;
  const baseline = y + h / 2 + SIZE_DRAWING_NO / 2 + 1;

  const out: string[] = [`<g id="drawing-number">`];
  groups.forEach((g, i) => {
    out.push(setRun(g, startX + i * (groupW + gap), baseline, SIZE_DRAWING_NO, INK));
  });
  // Ruled above and below, the exact width of the number, so the field reads as
  // one entry rather than as four loose groups.
  out.push(line(startX, baseline + 2.4, startX + total, baseline + 2.4, RULE, HAIRLINE));
  out.push(
    line(startX, baseline - SIZE_DRAWING_NO - 3.0, startX + 9, baseline - SIZE_DRAWING_NO - 3.0, ACCENT, RULE_W),
  );

  out.push(`</g>`);
  return out.join("");
}

/* ── the house rule, enforced ────────────────────────────────────────────── */

/**
 * House rule 4. A `<text>` element in a plate is a failed build regardless of
 * how it looks, because a glyph resolved through a system font is not authored
 * geometry and the version contract dies with it. Asserted here rather than
 * trusted, and asserted again by the ring on the finished sheet.
 */
export function assertNoText(svg: string): void {
  if (/<text[\s>/]/u.test(svg)) {
    throw new PlateError(
      "INVALID_REQUEST",
      "the annotation layer emitted a <text> element — the constructed numeral set exists so that it cannot",
    );
  }
}

/** Where the figure is placed on the sheet, for the composer. */
export const FIGURE_PLACEMENT = Object.freeze({
  x: FIG_X,
  y: FIG_Y,
  scale: FIG_SCALE,
  widthMm: FIG_MM,
});

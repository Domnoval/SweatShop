/**
 * Render the constructed numeral set onto one contact sheet.
 *
 * Modelled on `scripts/contact-sheet.ts`, with one deliberate difference: that
 * sheet labels its cells with `<text>`, and this one may not. A specimen sheet
 * for a set whose entire reason to exist is that the pipeline cannot emit
 * `<text>` would be a lie if it reached for a font to caption itself. So every
 * numeral, index, and specimen string on this sheet is set in the set itself —
 * the sheet is its own proof. Search the output for `<text` and you will not
 * find it.
 *
 * What is drawn, top to bottom: the text-size glyphs in their declared
 * viewBoxes with measured ink bounds overlaid; the superscript class the same
 * way; the three real dimension strings; and a right-aligned column of figures
 * against a plumb line, which is what a monospaced advance is FOR.
 *
 *   pnpm exec tsx scripts/numeral-contact-sheet.ts
 */

import { writeFileSync } from "node:fs";

import {
  NUMERALS_V1_SOURCE,
  NUMERAL_BY_CHARACTER,
  NUMERAL_METRICS,
  type NumeralSource,
} from "../packages/glyph-registry/src/numerals.v1.js";

/* ── palette ───────────────────────────────────────────────────────────── */

const BG = "#07090c";
const RULE = "#182230";
const FRAME = "#243443";
const INK = "#dbe3ea";
const SPECIMEN = "#f2f5f8";
const BOUNDS = "#d2603a";
const MUTED = "#5d6b78";
const ACCENT = "#5ef2c4";

/* ── typesetting ───────────────────────────────────────────────────────── */

const BY_ID = new Map<string, NumeralSource>(NUMERALS_V1_SOURCE.map((r) => [r.id, r]));

const lookup = (ch: string): NumeralSource | null => {
  const id = NUMERAL_BY_CHARACTER[ch];
  return id === undefined ? null : (BY_ID.get(id) ?? null);
};

const f = (n: number): string => String(Math.round(n * 1e3) / 1e3);

/**
 * Place one glyph. `size` is the rendered height of its 100-unit box, so the
 * baseline of everything set at the same size lands on the same line whatever
 * class the glyph belongs to.
 */
function place(rec: NumeralSource, x: number, y: number, size: number, colour: string): string {
  const s = size / 100;
  const out = [`<g transform="translate(${f(x)} ${f(y)}) scale(${f(s)})">`];
  for (const p of rec.paths) {
    if (p.role === "fill") {
      out.push(`<path d="${p.d}" fill="${colour}" stroke="none"/>`);
    } else {
      out.push(
        `<path d="${p.d}" fill="none" stroke="${colour}" stroke-width="${p.strokeWidth}" ` +
          `stroke-linecap="round" stroke-linejoin="round"/>`,
      );
    }
  }
  out.push("</g>");
  return out.join("");
}

/** Advance of a character at a given size. A space advances a text-size em. */
const advanceOf = (ch: string, size: number): number => {
  if (ch === " ") return (NUMERAL_METRICS.advance * size) / 100;
  const rec = lookup(ch);
  return rec === null ? 0 : (rec.viewBox[2] * size) / 100;
};

const widthOf = (text: string, size: number): number =>
  [...text].reduce((w, ch) => w + advanceOf(ch, size), 0);

/** Set a string. Advances come from each record's own viewBox width — nothing else. */
function setText(text: string, x: number, y: number, size: number, colour: string): string {
  const out: string[] = [];
  let pen = x;
  for (const ch of text) {
    const rec = lookup(ch);
    if (rec !== null) out.push(place(rec, pen, y, size, colour));
    pen += advanceOf(ch, size);
  }
  return out.join("");
}

/* ── sheet ─────────────────────────────────────────────────────────────── */

const MARGIN = 60;
const COLS = 8;
const CELL = 150;
const GAP = 14;
const LABEL_SIZE = 34;
const LABEL_GAP = 8;
const CELL_PITCH_Y = CELL + LABEL_SIZE * (NUMERAL_METRICS.baseline / 100) + LABEL_GAP + 26;
const W = MARGIN * 2 + COLS * CELL + (COLS - 1) * GAP;

const TEXT_GLYPHS = NUMERALS_V1_SOURCE.filter((r) => !r.id.startsWith("numeral-sup-"));
const SUP_GLYPHS = NUMERALS_V1_SOURCE.filter((r) => r.id.startsWith("numeral-sup-"));

const parts: string[] = [];
let y = MARGIN;

/** One specimen cell: declared viewBox, measured ink bounds, the glyph, its index. */
function cell(rec: NumeralSource, ox: number, oy: number, index: number): string {
  const s = CELL / 100;
  const [, , vw, vh] = rec.viewBox;
  const [ix0, iy0, ix1, iy1] = rec.inkBounds;
  const out = [
    `<g transform="translate(${f(ox)} ${f(oy)}) scale(${f(s)})">`,
    // The declared viewBox — the box the compiler will reserve.
    `<rect x="0" y="0" width="${f(vw)}" height="${f(vh)}" fill="none" stroke="${FRAME}" stroke-width="0.8"/>`,
    // The metric frame: figure top, baseline, advance axis.
    `<path d="M0 ${NUMERAL_METRICS.figureTop} L${f(vw)} ${NUMERAL_METRICS.figureTop}" stroke="${RULE}" stroke-width="0.7" fill="none"/>`,
    `<path d="M0 ${NUMERAL_METRICS.baseline} L${f(vw)} ${NUMERAL_METRICS.baseline}" stroke="${RULE}" stroke-width="0.7" fill="none"/>`,
    // The measured ink bounds — sampled, stroke width included.
    `<rect x="${f(ix0)}" y="${f(iy0)}" width="${f(ix1 - ix0)}" height="${f(iy1 - iy0)}" ` +
      `fill="none" stroke="${BOUNDS}" stroke-width="0.7" stroke-dasharray="3 3" opacity="0.8"/>`,
    "</g>",
  ];
  for (const p of rec.paths) {
    out.push(
      p.role === "fill"
        ? `<g transform="translate(${f(ox)} ${f(oy)}) scale(${f(s)})"><path d="${p.d}" fill="${INK}" stroke="none"/></g>`
        : `<g transform="translate(${f(ox)} ${f(oy)}) scale(${f(s)})"><path d="${p.d}" fill="none" ` +
            `stroke="${INK}" stroke-width="${p.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/></g>`,
    );
  }
  // Index, set in the set itself. No font is consulted to caption this sheet.
  const label = String(index);
  out.push(
    setText(label, ox + (CELL - widthOf(label, LABEL_SIZE)) / 2, oy + CELL + LABEL_GAP, LABEL_SIZE, MUTED),
  );
  return out.join("");
}

function grid(glyphs: readonly NumeralSource[], startIndex: number): void {
  glyphs.forEach((rec, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    parts.push(cell(rec, MARGIN + col * (CELL + GAP), y + row * CELL_PITCH_Y, startIndex + i));
  });
  y += Math.ceil(glyphs.length / COLS) * CELL_PITCH_Y;
}

/** A hairline rule with a short accent tick at its left end, used as a divider. */
function divider(): void {
  y += 18;
  parts.push(
    `<path d="M${MARGIN} ${f(y)} L${W - MARGIN} ${f(y)}" stroke="${RULE}" stroke-width="1.4" fill="none"/>`,
    `<path d="M${MARGIN} ${f(y)} L${MARGIN + 52} ${f(y)}" stroke="${ACCENT}" stroke-width="1.4" fill="none"/>`,
  );
  y += 34;
}

grid(TEXT_GLYPHS, 0);
divider();
grid(SUP_GLYPHS, TEXT_GLYPHS.length);
divider();

/* The three strings this set was commissioned to typeset. */
const SPECIMENS = ["15.00 ±0.05 mm", "8.47 × 10⁻¹¹ LS", "(−3.25 ±0.01) mm/°S"] as const;
const SPEC_SIZE = 92;

for (const text of SPECIMENS) {
  parts.push(
    `<path d="M${MARGIN} ${f(y + (SPEC_SIZE * NUMERAL_METRICS.baseline) / 100)} ` +
      `L${W - MARGIN} ${f(y + (SPEC_SIZE * NUMERAL_METRICS.baseline) / 100)}" ` +
      `stroke="${RULE}" stroke-width="1" fill="none"/>`,
    setText(text, MARGIN, y, SPEC_SIZE, SPECIMEN),
  );
  y += SPEC_SIZE * 1.18;
}

divider();

/* What a monospaced advance is for: a column of dimensions that plumbs. The
   rule is dropped through the decimal column, not fitted to the glyphs. */
const COLUMN = ["   15.00", " 1084.75", "    0.05", "-2103.60", "    9.28"] as const;
const COL_SIZE = 62;
const COL_X = MARGIN;
const DECIMAL_X = COL_X + widthOf("   15.", COL_SIZE) - (COL_SIZE * NUMERAL_METRICS.advance) / 200;
const columnTop = y;

for (const row of COLUMN) {
  parts.push(setText(row, COL_X, y, COL_SIZE, INK));
  y += COL_SIZE * 1.1;
}
parts.push(
  `<path d="M${f(DECIMAL_X)} ${f(columnTop)} L${f(DECIMAL_X)} ${f(y)}" ` +
    `stroke="${ACCENT}" stroke-width="1" stroke-dasharray="4 5" fill="none" opacity="0.7"/>`,
);

y += MARGIN;

const H = Math.ceil(y);
const svg = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  `<rect width="${W}" height="${H}" fill="${BG}"/>`,
  ...parts,
  `</svg>`,
].join("\n");

if (/<text[\s>/]/u.test(svg)) {
  throw new Error("contact sheet emitted a <text> node — the whole point of this set is that it cannot");
}

writeFileSync(new URL("../artifacts/numeral-contact-sheet.svg", import.meta.url), svg, "utf8");
process.stdout.write(
  `Wrote artifacts/numeral-contact-sheet.svg — ${NUMERALS_V1_SOURCE.length} glyphs, ` +
    `${NUMERALS_V1_SOURCE.reduce((n, r) => n + r.paths.length, 0)} locked paths, 0 text nodes\n`,
);

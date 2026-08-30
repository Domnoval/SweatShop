/**
 * THE RING — the suite the headline deliverable did not have.
 *
 * `packages/ring` produces all four artifacts and, until this file, no test
 * imported it. That is how a false census reason shipped: it was committed,
 * printed on five artifacts, and the suite stayed green. The sheet's own
 * instruction is "if a count disagrees with its number, the sheet is void", so a
 * suite for the ring is a suite that applies that instruction MECHANICALLY —
 * reading the prose the ring emits and checking every number in it against what
 * the engines actually computed.
 *
 * The audit below is therefore not a list of expected strings. It is a table of
 * RELATIONS: each one recognises a sentence shape the ring can print and
 * recomputes the quantity that sentence claims, from the walk, the envelope and
 * the reader. Two properties make it catch the NEXT stale reason and not merely
 * the last one:
 *
 *   1. Every quantitative sentence must be COVERED — matched by at least one
 *      relation. A sentence carrying a number that no relation can evaluate is a
 *      failure, not a pass. Reintroduce "the walked cell sum minus one" and it
 *      is caught twice over: once by the relation kept for that exact phrasing,
 *      whose arithmetic is false for every possible word, and once by coverage
 *      if the phrasing is reworded on its way back in.
 *   2. The derivation must be PRESENT. Every census must state how its cusp
 *      count was arrived at, so deleting the sentence cannot buy a green run.
 *
 * Everything else here is a house rule turned into an exit code: no input is
 * refused, no `<text>` reaches a plate, hygiene cannot decide the ride, the same
 * word hashes to the same bytes twice, and all the ink is inside the viewBox the
 * sheet declares.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { sha256Hex } from "@studio137/plate-core";
import { WORD_CORRESPONDENCE } from "@studio137/glyph-registry";
import { ring, type RingArtifacts, type RingOptions } from "@studio137/ring";
import { cipherValue, digitString, kamea, read, reduceToCell, SQUARE_IDS, walk } from "@studio137/walk-engine";

// The numeral set is not re-exported from the glyph-registry barrel, so it is
// reached by path — the same workaround `packages/ring/src/annotate.ts` records.
// It is needed here to read the numbers back OFF the plate: the annotation layer
// has no <text>, so the only way to check what the sheet says is to recognise
// the locked path data it set the digits in.
import { NUMERALS_V1_SOURCE } from "../packages/glyph-registry/src/numerals.v1.js";

/* ── the battery ─────────────────────────────────────────────────────────── */

/**
 * Words chosen for what they break, not for what they mean.
 *
 * Every case that has cost this build a defect is here: whitespace (which used
 * to move a word off its own square), letterless inputs (which used to print a
 * back-computed reduction that never ran), and words whose letters all land on
 * one cell (which used to read back as nothing at all).
 */
const BATTERY: readonly string[] = Object.freeze([
  "",
  "   ",
  "12345",
  "!!!,.?-",
  "A",
  "AAAA",
  "AS",
  "WE",
  "ZZ",
  "QQQ",
  "ACE",
  "FALL",
  "LONGING",
  "BETWEEN",
  "DESCENT",
  "SWEATSHOP",
  "DeScEnT",
  "  DESCENT  ",
  "\tDESCENT\n",
  "ЖИВОТНОЕ",
  "日本語",
  "🜃🔥✨",
  "Z".repeat(300),
  "a",
  "Æ",
  "O'BRIEN-SMITH",
]);

/** A vocabulary the receipt may return, covering the battery's real words. */
const VOCABULARY: readonly string[] = Object.freeze([
  "A", "AS", "WE", "ZZ", "QQQ", "AAAA", "ACE", "FALL", "LONGING", "BETWEEN",
  "DESCENT", "SWEATSHOP", "OBRIENSMITH",
]);

/* ── reading the plate back ──────────────────────────────────────────────── */

/** The letters station 1 kept — the ring's own record of what was spoken. */
const lettersOf = (art: RingArtifacts): string =>
  art.walk.resolution.letters.map((l) => l.letter).join("");

/** The quantity the multiplier is reduced from, recomputed from the walk. */
const cellSumOf = (art: RingArtifacts): number =>
  art.walk.steps.reduce((total, step) => total + step.cell, 0);

/** The `viewBox` the sheet declares, in millimetres. */
function declaredViewBox(svg: string): readonly [number, number, number, number] {
  const m = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) (-?[\d.]+) (-?[\d.]+)"/u);
  if (m === null) throw new Error("the sheet declares no viewBox");
  return [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as const;
}

/** Where the figure group was placed, read off the sheet rather than assumed. */
function figurePlacement(svg: string): Readonly<{ x: number; y: number; scale: number }> {
  const m = svg.match(
    /<g id="figure" transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\((-?[\d.]+)\)">/u,
  );
  if (m === null) throw new Error("the sheet places no figure group");
  return Object.freeze({ x: Number(m[1]), y: Number(m[2]), scale: Number(m[3]) });
}

/**
 * The bytes the drawing number is a hash of, cut out the way the legend says a
 * stranger may cut them out: between the figure group's opening tag and the
 * literal `</g><!--/figure-->` that closes it.
 */
function figureMarkup(svg: string): string {
  const open = svg.indexOf('<g id="figure"');
  const openEnd = svg.indexOf(">", open) + 1;
  const close = svg.indexOf("</g><!--/figure-->");
  if (open < 0 || close < 0) throw new Error("the sheet carries no delimited figure");
  return svg.slice(openEnd, close);
}

/** Sentences: one per line, then split again at every full stop or semicolon. */
function sentences(text: string): readonly string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.;])\s+/u))
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

/** A sentence that carries a number is a sentence that makes a measurable claim. */
const isQuantitative = (sentence: string): boolean => /\d/u.test(sentence);

const isPrime = (n: number): boolean => {
  if (!Number.isInteger(n) || n < 2) return false;
  for (let d = 2; d * d <= n; d += 1) if (n % d === 0) return false;
  return true;
};

/* ── the relation table ──────────────────────────────────────────────────── */

type Facts = Readonly<{
  art: RingArtifacts;
  letters: string;
  cellSum: number;
  reading: ReturnType<typeof read>;
  viewBox: readonly [number, number, number, number];
  placement: Readonly<{ x: number; y: number; scale: number }>;
}>;

/** `true` when the claim holds; otherwise what is actually true. */
type Verdict = true | string;

type Relation = Readonly<{
  id: string;
  pattern: RegExp;
  check: (m: RegExpMatchArray, f: Facts) => Verdict;
}>;

const eq = (claimed: unknown, actual: unknown, what: string): Verdict =>
  String(claimed) === String(actual)
    ? true
    : `${what}: the prose says ${JSON.stringify(String(claimed))}, the engine says ${JSON.stringify(String(actual))}`;

const all = (...verdicts: readonly Verdict[]): Verdict => {
  const failed = verdicts.filter((v): v is string => v !== true);
  return failed.length === 0 ? true : failed.join("; ");
};

/** `scripts/build-print-kit.ts`, so the floors the legend quotes can be checked. */
const PRINT_KIT = readFileSync(new URL("../scripts/build-print-kit.ts", import.meta.url), "utf8");

/**
 * DESCENT's doubled beat, recomputed. The loop reason cites this word by name on
 * every sheet that hangs no loops of its own, so the citation is checked against
 * the walk rather than believed.
 */
const DESCENT = ring("DESCENT");

const RELATIONS: readonly Relation[] = Object.freeze([
  /* ── the cusp derivation: the defect that triggered this round ─────────── */
  {
    // "walked cell sum 25, reduced theosophically to 7"
    id: "cusps-are-the-reduced-cell-sum",
    pattern: /walked cell sum (\d+), reduced theosophically to (\d+)/u,
    check: (m, f) =>
      all(
        eq(m[1], f.cellSum, "the walked cell sum"),
        eq(m[2], reduceToCell(f.cellSum, 9), "the theosophic reduction of that sum"),
        eq(m[2], f.art.envelope.cusps, "the cusp count the reduction is said to give"),
      ),
  },
  {
    id: "multiplier-is-cusps-plus-one",
    pattern: /the multiplier is that \+ 1 = (\d+)/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.envelope.multiplier, "the multiplier"),
        eq(f.art.envelope.cusps + 1, f.art.envelope.multiplier, "cusps + 1"),
      ),
  },
  {
    id: "cusps-are-multiplier-minus-one",
    pattern: /cusps = multiplier − 1 = (\d+)/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.envelope.multiplier - 1, "multiplier − 1"),
        eq(m[1], f.art.envelope.cusps, "the cusp count"),
      ),
  },
  {
    // The letterless branch: `multiplierForWalk` short-circuits before it
    // reduces, so a sheet may only claim a floor when nothing was walked.
    id: "letterless-multiplier-floor",
    pattern: /the engine floors the multiplier at (\d+), and the family draws (\d+) cusps?/u,
    check: (m, f) =>
      all(
        f.cellSum === 0
          ? true
          : `the sheet says no cells were walked, but the walked cell sum is ${f.cellSum}`,
        eq(m[1], f.art.envelope.multiplier, "the floored multiplier"),
        eq(m[2], f.art.envelope.cusps, "the cusp count"),
      ),
  },
  {
    // The exact sentence the census shipped. It is kept here — not deleted with
    // the code — so that its return fails with the two numbers side by side
    // rather than merely as an unrecognised shape. `reduceToCell(sum, 9)` never
    // equals `sum - 1` for any sum, so this is false for every possible input.
    id: "cusps-are-the-cell-sum-minus-one",
    pattern: /(\d+) cusps? (?:are|is) the walked cell sum minus one/u,
    check: (m, f) =>
      all(
        eq(m[1], f.cellSum - 1, "the walked cell sum minus one"),
        eq(m[1], f.art.envelope.cusps, "the cusp count"),
      ),
  },

  /* ── the envelope ──────────────────────────────────────────────────────── */
  {
    id: "envelope-summary",
    pattern: /^(\d+) nodes, multiplier (\d+), (\d+) cusps$/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.envelope.nodes, "the node count"),
        eq(m[2], f.art.envelope.multiplier, "the multiplier"),
        eq(m[3], f.art.envelope.cusps, "the cusp count"),
      ),
  },
  {
    id: "nodes-are-fixed-and-prime",
    pattern: /nodes are fixed at (\d+) — prime/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.envelope.nodes, "the node count"),
        isPrime(Number(m[1])) ? true : `the sheet calls ${m[1]} prime, and it is not`,
      ),
  },
  {
    id: "hue-bands-over-chords",
    pattern: /(\d+) bands? over (\d+) chords/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.envelope.bands.length, "the band count"),
        eq(m[2], f.art.envelope.chordCount, "the chord count"),
      ),
  },

  /* ── the walk ──────────────────────────────────────────────────────────── */
  {
    id: "the-line-is-these-cells",
    pattern:
      /The line is cells ([\d·]+) in order — the (\d+) letters? of ([A-Z]*) under ([A-Z]+) on ([a-z]+)\./u,
    check: (m, f) =>
      all(
        eq(m[1], digitString(f.art.walk.resolution), "the cell sequence"),
        eq(m[2], f.art.walk.steps.length, "the letter count"),
        eq(m[3], f.letters, "the letters"),
        eq(m[4], f.art.walk.cipher, "the cipher"),
        eq(m[5], f.art.walk.square, "the square"),
      ),
  },
  {
    // Added after a grader found the census calling a figure a "line" on plates
    // that draw none. The word the sentence uses is now itself checked.
    id: "figure-or-line-cells-in-order",
    pattern: /^The (line|figure) is cells ([0-9·]+) in order/u,
    check: (m, f) => {
      const drawsLine = f.art.walk.paths.some((path) => path.role === "line");
      return all(
        eq(m[1], drawsLine ? "line" : "figure", "the word the sentence uses for the drawing"),
        eq(m[2], f.art.walk.resolution.cells.join("·"), "the walked cells"),
      );
    },
  },
  {
    // "Node 0 — twelve o'clock — maps to itself … that one node is bare".
    // Checked by counting the endpoints the emitted chords actually touch — which
    // is exactly how the off-by-one in the sentence this replaced was found.
    id: "node-zero-is-bare",
    pattern: /Node (\d+) — twelve o'clock — maps to itself/u,
    check: (m, f) => {
      const touched = new Set<string>();
      for (const band of f.art.envelope.bands) {
        for (const seg of band.d.matchAll(/M([\d.]+) ([\d.]+) L([\d.]+) ([\d.]+)/gu)) {
          touched.add(`${seg[1]},${seg[2]}`);
          touched.add(`${seg[3]},${seg[4]}`);
        }
      }
      return all(
        eq(m[1], 0, "the node said to map to itself"),
        eq(touched.size, f.art.envelope.nodes - 1, "the nodes a chord touches"),
      );
    },
  },
  {
    // "same 136 chords over all 137 nodes" — the corrected node claim. It said
    // "closes as a single cycle" until a grader counted: m=10 closes as eighteen.
    id: "chords-over-the-nodes",
    pattern: /draws (\d+) chords over (\d+) of the (\d+) nodes/u,
    check: (m, f) =>
      all(
        eq(m[3], f.art.envelope.nodes, "the node count"),
        eq(m[1], f.art.envelope.nodes - 1, "the chord count"),
        eq(m[2], f.art.envelope.nodes - 1, "the nodes a chord actually touches"),
        eq(m[1], f.art.envelope.chordCount, "the chords actually emitted"),
      ),
  },
  {
    // The cap reason on a figure that draws nothing else.
    id: "cap-is-the-only-ink",
    pattern: /only ink on this plate: (\d+) letters? landing on one cell/u,
    check: (m, f) => eq(m[1], f.art.walk.steps.length, "the letters walked"),
  },
  {
    // The cap reason on a loops-only figure, which recovers without the cap.
    id: "recovers-from-the-loops",
    pattern: /with the cap deleted, from the (\d+) loops?/u,
    check: (m, f) => eq(m[1], f.art.walk.loopCount, "the loop count"),
  },
  {
    id: "loops-hang-on-this-line",
    pattern: /^(\d+) loops? hangs? on this figure/u,
    check: (m, f) => eq(m[1], f.art.walk.loopCount, "the loop count"),
  },
  {
    id: "the-line-keeps-these-points",
    pattern: /the line still has its (\d+) points/u,
    check: (m, f) =>
      eq(m[1], f.art.walk.steps.length - f.art.walk.loopCount, "the points the line keeps"),
  },
  {
    id: "the-receipt-would-be-this-short",
    pattern: /reads back a word (\d+) letters? short/u,
    check: (m, f) => eq(m[1], f.art.walk.loopCount, "letters the receipt would lose"),
  },
  {
    // A claim about a DIFFERENT word, cited on sheets that hang no loops. It is
    // checked against that word's own walk, because a citation nobody rechecks
    // is exactly how the last stale reason survived.
    id: "descent-doubles-on-cell-five",
    pattern: /on DESCENT, where E and N both land on cell (\d+)/u,
    check: (m) => {
      const cited = Number(m[1]);
      const landed = DESCENT.walk.steps
        .filter((s) => s.letter === "E" || s.letter === "N")
        .map((s) => s.cell);
      return landed.length > 0 && landed.every((c) => c === cited)
        ? true
        : `DESCENT puts E and N on ${JSON.stringify(landed)}, not all on ${cited}`;
    },
  },
  {
    id: "legend-steps",
    pattern: /^([A-Z]=\d+(?:\s+[A-Z]=\d+)*)$/u,
    check: (m, f) =>
      eq(m[1], f.art.walk.steps.map((s) => `${s.letter}=${s.value}`).join("  "), "the step list"),
  },
  {
    id: "legend-cells",
    pattern: /^cells\s+([\d·]+|none)$/u,
    check: (m, f) => eq(m[1], digitString(f.art.walk.resolution) || "none", "the cell sequence"),
  },
  {
    id: "legend-segments",
    pattern: /^segments\s+(\d+)$/u,
    check: (m, f) => eq(m[1], f.art.walk.segmentCount, "the segment count"),
  },
  {
    id: "legend-loops",
    pattern: /^loops\s+(\d+)\s+\(a loop marks/u,
    check: (m, f) => eq(m[1], f.art.walk.loopCount, "the loop count"),
  },
  {
    id: "legend-activated",
    pattern: /^activated\s+(.+)$/u,
    check: (m, f) =>
      eq(m[1], f.art.walk.activatedCells.join(", ") || "none", "the activated cells"),
  },

  /* ── the square ────────────────────────────────────────────────────────── */
  {
    id: "concept-names-this-order",
    pattern: /whose kamea is the (\d+)×(\d+) square this line is walked on/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.walk.order, "the order"),
        eq(m[2], f.art.walk.order, "the order, stated twice"),
      ),
  },
  {
    id: "planet-chose-this-order",
    pattern: /\(chose the square, (\d+)×(\d+)\)/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.walk.order, "the order"),
        eq(m[2], f.art.walk.order, "the order, stated twice"),
      ),
  },
  {
    id: "legend-header",
    pattern: /^sheet ([0-9a-f]+) · ([a-z]+) (\d+)×(\d+) · cipher ([A-Z]+) · trace ([A-Z]+)$/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.sheetId, "the sheet id"),
        eq(m[2], f.art.walk.square, "the square"),
        eq(m[3], f.art.walk.order, "the order"),
        eq(m[4], f.art.walk.order, "the order, stated twice"),
        eq(m[5], f.art.walk.cipher, "the cipher"),
        eq(m[6], f.art.walk.trace, "the trace"),
      ),
  },

  /* ── the census's own tallies ──────────────────────────────────────────── */
  {
    id: "census-tally",
    pattern: /^LOAD-BEARING (\d+) · ANSWERABLE (\d+) · FREE (\d+) · ARBITRARY (\d+)$/u,
    check: (m, f) => {
      const tally = (n: string): number => f.art.choices.filter((c) => c.necessity === n).length;
      const printed = [m[1], m[2], m[3], m[4]].map(Number);
      return all(
        eq(m[1], tally("load-bearing"), "load-bearing"),
        eq(m[2], tally("answerable"), "answerable"),
        eq(m[3], tally("free"), "free"),
        eq(m[4], tally("arbitrary"), "arbitrary"),
        eq(
          printed.reduce((a, b) => a + b, 0),
          f.art.choices.length,
          "the four grades summed against every choice graded",
        ),
      );
    },
  },
  {
    id: "census-unaccounted",
    pattern: /^(\d+) choice\(s\) have no recorded reason/u,
    check: (m, f) =>
      eq(m[1], f.art.choices.filter((c) => c.necessity === "arbitrary").length, "ungraded choices"),
  },
  {
    id: "census-axes",
    pattern: /^census (columns|rows) 1-(\d+)\s+(.+)$/u,
    check: (m, f) => {
      const names = m[3]!.split(" · ").map((s) => s.trim());
      const used = new Set(
        f.art.choices.map((c) => (m[1] === "columns" ? c.necessity : c.provenance)),
      );
      return all(
        eq(m[2], names.length, `the ${m[1]} the axis names`),
        [...used].every((v) => names.includes(v))
          ? true
          : `the axis names ${JSON.stringify(names)}, the census uses ${JSON.stringify([...used])}`,
      );
    },
  },

  /* ── the plate ─────────────────────────────────────────────────────────── */
  {
    id: "sheet-is-a4-in-millimetres",
    pattern: /ISO A4 portrait, (\d+) × (\d+) mm/u,
    check: (m, f) =>
      all(
        eq(m[1], f.viewBox[2], "the sheet width, against the declared viewBox"),
        eq(m[2], f.viewBox[3], "the sheet height, against the declared viewBox"),
        eq(`${m[1]}mm`, f.art.sheetSvg.match(/width="([^"]+)"/u)?.[1], "the sheet's width attribute"),
        eq(
          `${m[2]}mm`,
          f.art.sheetSvg.match(/height="([^"]+)"/u)?.[1],
          "the sheet's height attribute",
        ),
      ),
  },
  {
    id: "sheet-rasterises-to-these-pixels",
    pattern: /At (\d+) DPI the sheet is (\d+) × (\d+) px/u,
    check: (m, f) => {
      const dpi = Number(m[1]);
      return all(
        eq(m[2], Math.round((f.viewBox[2] / 25.4) * dpi), "the raster width"),
        eq(m[3], Math.round((f.viewBox[3] / 25.4) * dpi), "the raster height"),
      );
    },
  },
  {
    id: "figure-placement",
    pattern: /The figure is placed at ([\d.]+), so its (\d+)-unit frame prints at ([\d.]+) mm/u,
    check: (m, f) =>
      all(
        eq(m[1], f.placement.scale, "the placement scale"),
        eq(m[2], f.art.walk.viewBox[2], "the figure frame"),
        eq(m[3], (Number(m[2]) * f.placement.scale).toFixed(2), "the printed width of that frame"),
      ),
  },
  {
    id: "one-figure-unit-in-millimetres",
    pattern: /one figure unit is exactly ([\d.]+) mm/u,
    check: (m, f) => eq(m[1], f.placement.scale, "the millimetres one figure unit prints at"),
  },
  {
    id: "drawing-number",
    pattern: /^(\d{5}(?: \d{5})+)$/u,
    check: (m, f) =>
      eq(
        m[1]!.replace(/ /gu, ""),
        BigInt(`0x${f.art.sheetId}`).toString(10).padStart(20, "0"),
        "the drawing number, read as a big-endian 64-bit integer",
      ),
  },
  {
    // The legend tells a stranger how to recompute the drawing number. This does
    // exactly that, from the emitted bytes, with no access to the composer.
    id: "digest-is-sha256-of-the-cut-figure",
    pattern: /That digest is SHA-(\d+) of the figure markup/u,
    check: (m, f) =>
      all(
        eq(m[1], 256, "the digest width the legend names"),
        eq(sha256Hex(figureMarkup(f.art.sheetSvg)).slice(0, 16), f.art.sheetId, "the sheet id"),
      ),
  },
  {
    id: "digest-is-sixteen-hex-and-sixty-four-bits",
    pattern: /first (\d+) hex characters, read as a big-endian (\d+)-bit integer/u,
    check: (m, f) =>
      all(
        eq(m[1], f.art.sheetId.length, "the length of the sheet id"),
        eq(m[2], Number(m[1]) * 4, "the bit width of that many hex characters"),
        BigInt(`0x${f.art.sheetId}`) < 2n ** BigInt(Number(m[2]))
          ? true
          : "the sheet id does not fit the stated width",
      ),
  },
  {
    id: "garment-floors-dtf-and-dtg-light",
    pattern: /DTF ([\d.]+) mm, DTG on light ([\d.]+) mm/u,
    check: (m) =>
      all(
        PRINT_KIT.includes(`dtf: ${m[1]}`) ? true : `build-print-kit.ts states no DTF floor of ${m[1]}`,
        PRINT_KIT.includes(`dtgLight: ${m[2]}`)
          ? true
          : `build-print-kit.ts states no DTG-on-light floor of ${m[2]}`,
      ),
  },
  {
    id: "garment-floor-dtg-dark",
    pattern: /^DTG on dark ([\d.]+) mm\.$/u,
    check: (m) =>
      PRINT_KIT.includes(`dtgDark: ${m[1]}`)
        ? true
        : `build-print-kit.ts states no DTG-on-dark floor of ${m[1]}`,
  },
  {
    id: "legend-mark-index",
    pattern: /^(\d+)\s\s([a-z0-9-]+)$/u,
    check: (m, f) => {
      const mark = f.art.marks[Number(m[1]) - 1];
      return mark === undefined
        ? `the legend numbers a mark ${m[1]} the sheet did not place`
        : all(eq(m[1], mark.index, "the mark's index"), eq(m[2], mark.name, "the mark's name"));
    },
  },

  /* ── the receipt ───────────────────────────────────────────────────────── */
  {
    id: "receipt-order",
    pattern: /^order inferred from the drawing\s+(\d+|none)$/u,
    check: (m, f) => eq(m[1], f.reading.order ?? "none", "the order read off the drawing"),
  },
  {
    id: "receipt-cells-recovered",
    pattern: /^cells recovered\s+(.+)$/u,
    check: (m, f) => eq(m[1], f.reading.cells.join("·"), "the cells the reader recovered"),
  },
  {
    id: "receipt-cells-walked",
    pattern: /^cells walked\s+(.+)$/u,
    check: (m, f) => eq(m[1], digitString(f.art.walk.resolution), "the cells the walk laid down"),
  },
  {
    // "readings the figure admits  64" printed a CEILING as a total: `read()`
    // stops expanding loop placements at a work bound, and the saturn figure of
    // ABBAABBAABBAABBAABBAABBA admits 72 while the receipt said 64. The count is
    // still checked, and so is the disclosure — the "at least" must be present
    // exactly when the expansion was clipped, in both directions, because a
    // receipt that always hedged would be as uninformative as one that never
    // did.
    id: "receipt-readings",
    pattern: /^readings the figure admits\s+(at least )?(\d+)/u,
    check: (m, f) =>
      all(
        eq(m[2], f.reading.readings.length, "the readings the figure admits"),
        eq(m[1] !== undefined, f.reading.readingsClipped, "whether the count is printed as a floor"),
      ),
  },
  {
    id: "receipt-collision",
    pattern: /^(\d+) words share this mark/u,
    check: (m, f) => eq(m[1], f.reading.matches.length, "the words sharing this mark"),
  },
]);

/* ── the audit ───────────────────────────────────────────────────────────── */

type Finding = Readonly<{ where: string; sentence: string; problem: string }>;

/**
 * Check every numeric claim the ring printed, and refuse to be silent about a
 * claim no relation can evaluate.
 */
function auditProse(art: RingArtifacts, options: RingOptions = {}): readonly Finding[] {
  const facts: Facts = Object.freeze({
    art,
    letters: lettersOf(art),
    cellSum: cellSumOf(art),
    reading: read(art.walk.paths, {
      ...(options.vocabulary === undefined ? {} : { vocabulary: options.vocabulary }),
    }),
    viewBox: declaredViewBox(art.sheetSvg),
    placement: figurePlacement(art.sheetSvg),
  });

  const findings: Finding[] = [];
  const texts: readonly (readonly [string, string])[] = [
    ["census", art.census],
    ["legend", art.legend],
    ["receipt", art.receipt],
  ];

  for (const [where, text] of texts) {
    for (const sentence of sentences(text)) {
      let matched = 0;
      for (const relation of RELATIONS) {
        const m = sentence.match(relation.pattern);
        if (m === null) continue;
        matched += 1;
        const verdict = relation.check(m, facts);
        if (verdict !== true) findings.push({ where, sentence, problem: `${relation.id} — ${verdict}` });
      }
      if (matched === 0 && isQuantitative(sentence)) {
        findings.push({
          where,
          sentence,
          problem:
            "states a number that no relation in this suite can evaluate. Either the claim is new " +
            "and needs a relation here, or it is a derivation nobody is checking — which is how the " +
            "last false census reason shipped.",
        });
      }
    }
  }
  return findings;
}

const report = (word: string, findings: readonly Finding[]): string =>
  `${JSON.stringify(word)}\n` +
  findings.map((f) => `  [${f.where}] ${f.problem}\n    in: ${f.sentence}`).join("\n");

/* ── 1. the prose against the arithmetic ─────────────────────────────────── */

describe("the census and the legend state only true arithmetic", () => {
  for (const word of BATTERY) {
    it(`every numeric claim holds for ${JSON.stringify(word.slice(0, 24))}`, () => {
      const art = ring(word, { vocabulary: VOCABULARY });
      const findings = auditProse(art, { vocabulary: VOCABULARY });
      expect(report(word, findings)).toBe(`${JSON.stringify(word)}\n`);
    });
  }

  it("holds when the caller overrides the square the concept would have chosen", () => {
    // The "requested" branch of the square reason, and the legend line that used
    // to claim the planet chose a square the caller had already picked.
    const art = ring("DESCENT", { square: "jupiter", vocabulary: VOCABULARY });
    expect(art.walk.square).toBe("jupiter");
    expect(report("DESCENT@jupiter", auditProse(art, { vocabulary: VOCABULARY }))).toBe(
      '"DESCENT@jupiter"\n',
    );
  });

  it("holds with no vocabulary, where the receipt returns cells and no word", () => {
    for (const word of ["DESCENT", "AS", ""]) {
      expect(report(word, auditProse(ring(word)))).toBe(`${JSON.stringify(word)}\n`);
    }
  });

  it("states how the cusp count was derived on every sheet, so deletion is not a pass", () => {
    for (const word of BATTERY) {
      const census = ring(word).census;
      const derives = sentences(census).some(
        (s) =>
          /walked cell sum (\d+), reduced theosophically to (\d+)/u.test(s) ||
          /the engine floors the multiplier at (\d+)/u.test(s),
      );
      expect(derives, `${JSON.stringify(word)} census states no cusp derivation`).toBe(true);
    }
  });

  it("prints one derivation, not two: the legend and the census cannot disagree", () => {
    // The defect was two statements of one rule on one sheet. A reader applying
    // the plate's own instruction would have voided a correct sheet.
    for (const word of BATTERY) {
      const art = ring(word);
      const derivation = (text: string): string | undefined =>
        sentences(text).find(
          (s) =>
            /walked cell sum \d+, reduced theosophically to \d+/u.test(s) ||
            /the engine floors the multiplier at \d+/u.test(s),
        );
      const fromCensus = derivation(art.census);
      const fromLegend = derivation(art.legend);
      expect(fromCensus, JSON.stringify(word)).toBeDefined();
      expect(fromLegend, JSON.stringify(word)).toBeDefined();
      // The census wraps its copy in a sentence; compare the derivation itself.
      const core = (s: string): string => s.slice(s.search(/walked cell sum|no letters, so no cells/u));
      expect(core(fromCensus!), JSON.stringify(word)).toBe(core(fromLegend!));
    }
  });

  it("never claims the cusp count is the cell sum minus one", () => {
    // The literal defect, asserted as an absence as well as by arithmetic above.
    for (const word of BATTERY) {
      const art = ring(word);
      for (const text of [art.census, art.legend]) {
        expect(text, JSON.stringify(word)).not.toMatch(/cell sum minus one/u);
      }
      expect(art.envelope.cusps, JSON.stringify(word)).not.toBe(cellSumOf(art) - 1);
    }
  });
});

/* ── 2. the ride is not decided by input hygiene ─────────────────────────── */

describe("input hygiene decides nothing", () => {
  const artifactsOf = (art: RingArtifacts) =>
    Object.freeze({
      sheetId: art.sheetId,
      square: art.walk.square,
      order: art.walk.order,
      sheetSvg: art.sheetSvg,
      legend: art.legend,
      census: art.census,
      receipt: art.receipt,
    });

  it("DESCENT rides saturn however it was typed", () => {
    const canonical = ring("DESCENT", { vocabulary: VOCABULARY });
    expect(canonical.walk.square).toBe("saturn");
    expect(canonical.correspondence?.concept).toBe("descent");

    for (const typed of ["DESCENT ", " DESCENT", "descent", "  DESCENT  ", "\tDESCENT\n", "DeScEnT"]) {
      const art = ring(typed, { vocabulary: VOCABULARY });
      expect(artifactsOf(art), JSON.stringify(typed)).toEqual(artifactsOf(canonical));
      // The raw string still survives, on the object and in the resolution.
      expect(art.word).toBe(typed);
      expect(art.walk.resolution.input).toBe(typed);
    }
  });

  it("keeps the dropped characters rather than pretending they were not typed", () => {
    expect(ring("DESCENT ").walk.resolution.dropped).toEqual([{ index: 7, char: " " }]);
    expect(ring("DESCENT").walk.resolution.dropped).toEqual([]);
  });

  it("holds for every concept word in the table, not just DESCENT", () => {
    for (const word of ["FALL", "LONGING", "BETWEEN", "ACE", "SWEATSHOP"]) {
      const canonical = ring(word);
      for (const typed of [` ${word}`, `${word} `, ` ${word} `, word.toLowerCase()]) {
        expect(artifactsOf(ring(typed)), `${word} as ${JSON.stringify(typed)}`).toEqual(
          artifactsOf(canonical),
        );
      }
    }
  });
});

/* ── 3. no input is refused ──────────────────────────────────────────────── */

describe("any word at all", () => {
  const REFUSALS: readonly string[] = Object.freeze([
    "",
    " ",
    "   ",
    "\n",
    "12345",
    "!!!,.?-",
    "()[]{}<>&\"'",
    "A",
    "AAAAAAAA",
    "ЖИВОТНОЕ",
    "日本語",
    "العربية",
    "🜃🔥✨",
    "Z".repeat(300),
    "MiXeD CaSe",
    "  padded  ",
    " ",
    "é",
    "Æ",
  ]);

  for (const word of REFUSALS) {
    it(`draws a sheet for ${JSON.stringify(word.slice(0, 24))}`, () => {
      const art = ring(word, { vocabulary: VOCABULARY });
      expect(art.sheetSvg.startsWith("<svg")).toBe(true);
      expect(art.sheetSvg.endsWith("</svg>")).toBe(true);
      expect(art.sheetId).toMatch(/^[0-9a-f]{16}$/u);
      expect(art.legend.length).toBeGreaterThan(0);
      expect(art.census.length).toBeGreaterThan(0);
      expect(art.receipt.length).toBeGreaterThan(0);
      expect(art.word).toBe(word);
    });
  }

  it("draws the same sheet for every input that holds no letters", () => {
    // The four artifacts are of the LETTERS, so every letterless input is the
    // same sheet. That is the strongest form of "nothing here refuses": the
    // emoji and the empty string are not special cases, they are one case.
    const base = ring("");
    for (const word of ["   ", "12345", "!!!", "🜃🔥✨", "日本語", " "]) {
      const art = ring(word);
      expect(art.sheetId, JSON.stringify(word)).toBe(base.sheetId);
      expect(art.sheetSvg, JSON.stringify(word)).toBe(base.sheetSvg);
      expect(art.legend, JSON.stringify(word)).toBe(base.legend);
      expect(art.census, JSON.stringify(word)).toBe(base.census);
      expect(art.receipt, JSON.stringify(word)).toBe(base.receipt);
    }
  });

  it("grades every choice on a letterless sheet rather than dropping the census", () => {
    const art = ring("");
    expect(art.choices.length).toBeGreaterThan(0);
    expect(art.choices.every((c) => c.reason.trim() !== "")).toBe(true);
    expect(art.choices.some((c) => c.necessity === "arbitrary")).toBe(false);
  });
});

/* ── 4. the receipt tells the truth ──────────────────────────────────────── */

describe("the receipt reads back a figure that never leaves one cell", () => {
  /**
   * A, AS, WE, ZZ and QQQ put every letter on one Jupiter cell, so `walk()`
   * emits no line at all — one point is not a segment. The repaired reader takes
   * the node from the start cap and the loops instead, so these figures read
   * back exactly rather than returning nothing.
   */
  const SINGLE_CELL: readonly string[] = Object.freeze(["A", "AS", "WE", "ZZ", "QQQ", "AAAA"]);

  for (const word of SINGLE_CELL) {
    it(`recovers ${word} from a figure with no line`, () => {
      const art = ring(word, { vocabulary: VOCABULARY });

      // The premise: there is genuinely no line to read.
      expect(art.walk.segmentCount).toBe(0);
      expect(art.walk.paths.some((p) => p.role === "line")).toBe(false);
      expect(art.walk.paths.some((p) => p.role === "start-cap")).toBe(true);

      const reading = read(art.walk.paths, { vocabulary: VOCABULARY });

      // What the repaired station guarantees: the cells come back, the order is
      // measured off the drawing, and the word is returned.
      expect(reading.cells).toEqual([...art.walk.resolution.cells]);
      expect(reading.cells.join("·")).toBe(digitString(art.walk.resolution));
      expect(reading.cells.length).toBe(art.walk.steps.length);
      expect(reading.order).toBe(art.walk.order);
      expect(reading.orders).toContain(art.walk.order);
      expect(reading.matches).toContain(word);

      // And what the receipt therefore prints. The old station returned nothing
      // here and the receipt said so; asserting the strings keeps the artifact
      // honest, not just the engine.
      expect(art.receipt).toContain(`RECEIPT — ${word}`);
      expect(art.receipt).toMatch(/\n {2}identical +yes\n/u);
      expect(art.receipt).toMatch(/\n {2}spoken word recovered +yes\n/u);
      expect(art.receipt).toMatch(
        new RegExp(`\\n {2}cells recovered +${digitString(art.walk.resolution)}\\n`, "u"),
      );
      expect(art.receipt).not.toMatch(/\n {2}order inferred from the drawing +none\n/u);
      expect(art.receipt).not.toMatch(/\n {2}returned +nothing\n/u);
    });
  }

  it("still recovers words that do draw a line", () => {
    for (const word of ["ACE", "DESCENT", "SWEATSHOP", "LONGING", "FALL"]) {
      const art = ring(word, { vocabulary: VOCABULARY });
      const reading = read(art.walk.paths, { vocabulary: VOCABULARY });
      expect(reading.cells, word).toEqual([...art.walk.resolution.cells]);
      expect(reading.matches, word).toContain(word);
      expect(art.receipt, word).toMatch(/\n {2}identical +yes\n/u);
      expect(art.receipt, word).toMatch(/\n {2}spoken word recovered +yes\n/u);
    }
  });

  it("says NO rather than guessing when there is nothing drawn to read", () => {
    // House rule 3 cuts both ways: the letterless input is not refused, and the
    // receipt is not flattered either.
    const art = ring("", { vocabulary: VOCABULARY });
    expect(art.walk.paths).toEqual([]);
    expect(read(art.walk.paths, { vocabulary: VOCABULARY }).cells).toEqual([]);
    expect(art.receipt).toContain("RECEIPT — (no letters)");
    expect(art.receipt).toMatch(/\n {2}spoken word recovered +NO\n/u);
    expect(art.receipt).toMatch(/\n {2}order inferred from the drawing +none\n/u);
  });

  it("reads the same word back however the input was typed", () => {
    for (const typed of ["DESCENT", "descent", " DESCENT ", "DeScEnT"]) {
      const art = ring(typed, { vocabulary: VOCABULARY });
      expect(art.receipt, JSON.stringify(typed)).toContain("RECEIPT — DESCENT");
      expect(art.receipt, JSON.stringify(typed)).toMatch(/\n {2}spoken word recovered +yes\n/u);
    }
  });
});

/* ── 5. house rule 4 ─────────────────────────────────────────────────────── */

describe("no <text> reaches a plate", () => {
  it("emits no text element for any word in the battery", () => {
    for (const word of [...BATTERY, ...VOCABULARY]) {
      const art = ring(word, { vocabulary: VOCABULARY });
      expect(art.sheetSvg, JSON.stringify(word.slice(0, 24))).not.toMatch(/<\/?text[\s>/]/u);
      expect(art.sheetSvg, JSON.stringify(word.slice(0, 24))).not.toMatch(/<tspan[\s>/]/u);
      expect(art.sheetSvg.includes("<text"), JSON.stringify(word.slice(0, 24))).toBe(false);
      // font-family on a plate would mean something was set in type after all.
      expect(art.sheetSvg, JSON.stringify(word.slice(0, 24))).not.toMatch(/font-family/u);
    }
  });

  it("emits no text element on a sheet whose square the caller named", () => {
    for (const square of ["saturn", "jupiter", "sol", "luna"] as const) {
      const art = ring("DESCENT", { square });
      expect(art.sheetSvg, square).not.toMatch(/<\/?text[\s>/]/u);
    }
  });
});

/* ── 6. determinism ──────────────────────────────────────────────────────── */

describe("determinism is the product", () => {
  const fingerprint = (art: RingArtifacts): string =>
    sha256Hex([art.sheetId, art.sheetSvg, art.legend, art.census, art.receipt].join(" "));

  it("produces byte-identical artifacts on a second call", () => {
    for (const word of BATTERY) {
      const first = ring(word, { vocabulary: VOCABULARY });
      const second = ring(word, { vocabulary: VOCABULARY });
      expect(fingerprint(second), JSON.stringify(word.slice(0, 24))).toBe(fingerprint(first));
      expect(second.sheetSvg).toBe(first.sheetSvg);
      expect(second.legend).toBe(first.legend);
      expect(second.census).toBe(first.census);
      expect(second.receipt).toBe(first.receipt);
      expect(second.sheetId).toBe(first.sheetId);
    }
  });

  it("hashes the drawing, not the sheet: the number is recomputable from the bytes", () => {
    for (const word of BATTERY) {
      const art = ring(word, { vocabulary: VOCABULARY });
      expect(sha256Hex(figureMarkup(art.sheetSvg)).slice(0, 16), JSON.stringify(word.slice(0, 24))).toBe(
        art.sheetId,
      );
    }
  });

  it("gives different words different drawing numbers", () => {
    const seen = new Map<string, string>();
    for (const word of ["ACE", "DESCENT", "SWEATSHOP", "LONGING", "FALL", "AS", "ZZ", "QQQ"]) {
      const art = ring(word);
      expect(seen.has(art.sheetId), `${word} collides with ${seen.get(art.sheetId) ?? ""}`).toBe(false);
      seen.set(art.sheetId, word);
    }
  });
});

/* ── 7. the ink is inside the viewBox ────────────────────────────────────── */

type Box = { minX: number; minY: number; maxX: number; maxY: number };

/**
 * The extreme points of one elliptical arc, endpoints included.
 *
 * Measured, not approximated: the SVG endpoint parameterisation is converted to
 * a centre and a sweep (spec F.6.5), and the four axis extremes of the ellipse
 * are included only when the sweep actually reaches them. Bounding an arc by its
 * endpoints alone would let a loop bulge off the page unseen, and bounding it by
 * `2r` around each end is loose enough to fail a sheet whose ink is fine — a
 * containment test that cries wolf gets deleted, so this one measures.
 *
 * A rotated ellipse falls back to the circumscribing box of the whole ellipse,
 * which is a true bound for any arc of it. Nothing here emits one today.
 */
function arcExtremes(
  x1: number,
  y1: number,
  rxIn: number,
  ryIn: number,
  phi: number,
  fA: number,
  fS: number,
  x2: number,
  y2: number,
): readonly (readonly [number, number])[] {
  if (rxIn === 0 || ryIn === 0) return [[x1, y1], [x2, y2]];
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const px = cos * dx + sin * dy;
  const py = -sin * dx + cos * dy;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  const lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const denominator = rx * rx * py * py + ry * ry * px * px;
  const factor =
    denominator === 0
      ? 0
      : (fA === fS ? -1 : 1) *
        Math.sqrt(Math.max(0, (rx * rx * ry * ry - denominator) / denominator));
  const cxp = (factor * rx * py) / ry;
  const cyp = (-factor * ry * px) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;

  const points: [number, number][] = [
    [x1, y1],
    [x2, y2],
  ];
  if (phi !== 0) {
    const r = Math.max(rx, ry);
    points.push([cx - r, cy - r], [cx + r, cy + r]);
    return points;
  }

  const theta1 = Math.atan2((py - cyp) / ry, (px - cxp) / rx);
  const theta2 = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx);
  let sweep = theta2 - theta1;
  if (fS === 0 && sweep > 0) sweep -= 2 * Math.PI;
  if (fS === 1 && sweep < 0) sweep += 2 * Math.PI;

  const covers = (theta: number): boolean => {
    // Is `theta` on the swept arc, measured forward from theta1?
    const delta = ((theta - theta1) * Math.sign(sweep) + 2 * Math.PI) % (2 * Math.PI);
    return delta <= Math.abs(sweep);
  };
  for (const k of [0, 1, 2, 3]) {
    const theta = (k * Math.PI) / 2;
    if (covers(theta)) points.push([cx + rx * Math.cos(theta), cy + ry * Math.sin(theta)]);
  }
  return points;
}

/** Arguments each path command takes, so an unknown one cannot be mis-parsed. */
const ARITY: Readonly<Record<string, number>> = Object.freeze({
  M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0,
});

/**
 * Points that bound a path, whatever it is drawn with.
 *
 * Béziers are bounded by their control points — a Bézier lies inside the convex
 * hull of them, so the hull's corners are a true bound without evaluating the
 * curve. Arcs get the measured extremes above. An unrecognised command stops the
 * suite instead of being skipped, because a bound that quietly ignores half a
 * figure is worse than no bound at all.
 */
function pathPoints(d: string): readonly (readonly [number, number])[] {
  const out: (readonly [number, number])[] = [];
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  for (const command of d.matchAll(/([A-Za-z])([^A-Za-z]*)/gu)) {
    const letter = command[1]!;
    const upper = letter.toUpperCase();
    const arity = ARITY[upper];
    if (arity === undefined) {
      throw new Error(`the sheet emits a path command this bound cannot measure: ${letter}`);
    }
    const relative = letter !== upper;
    const args = (command[2]!.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/gu) ?? []).map(Number);
    if (upper === "Z") {
      x = startX;
      y = startY;
      continue;
    }
    for (let i = 0; i + arity <= args.length; i += arity) {
      const a = args.slice(i, i + arity);
      const rx = relative ? x : 0;
      const ry = relative ? y : 0;
      if (upper === "H") {
        x = rx + a[0]!;
      } else if (upper === "V") {
        y = ry + a[0]!;
      } else if (upper === "A") {
        const ex = rx + a[5]!;
        const ey = ry + a[6]!;
        out.push(
          ...arcExtremes(x, y, a[0]!, a[1]!, (a[2]! * Math.PI) / 180, a[3]!, a[4]!, ex, ey),
        );
        x = ex;
        y = ey;
      } else {
        // M, L, C, S, Q, T: every pair is a point on the curve or one of its
        // control points, and the hull of those bounds the curve.
        for (let k = 0; k + 1 < arity; k += 2) out.push([rx + a[k]!, ry + a[k + 1]!]);
        x = rx + a[arity - 2]!;
        y = ry + a[arity - 1]!;
      }
      out.push([x, y]);
      if (upper === "M" && i === 0) {
        startX = x;
        startY = y;
      }
    }
  }
  return out;
}

/**
 * The bounding box of every mark the sheet paints, in sheet millimetres.
 *
 * A transform stack is carried because the figure and the marks are placed by
 * `translate`/`scale`, so a coordinate in the markup is not a coordinate on the
 * page.
 */
function inkBox(svg: string): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let scale = 1;
  let tx = 0;
  let ty = 0;
  const stack: [number, number, number][] = [];

  const add = (x: number, y: number): void => {
    const px = tx + x * scale;
    const py = ty + y * scale;
    box.minX = Math.min(box.minX, px);
    box.minY = Math.min(box.minY, py);
    box.maxX = Math.max(box.maxX, px);
    box.maxY = Math.max(box.maxY, py);
  };
  const attr = (attrs: string, name: string): number => {
    const m = attrs.match(new RegExp(`\\b${name}="(-?[\\d.]+)"`, "u"));
    return m === null ? 0 : Number(m[1]);
  };

  for (const token of svg.matchAll(/<\/g>|<(g|path|rect|circle)\b([^>]*)>/gu)) {
    if (token[0] === "</g>") {
      const popped = stack.pop();
      if (popped !== undefined) [scale, tx, ty] = popped;
      continue;
    }
    const tag = token[1]!;
    const attrs = token[2]!;

    if (tag === "g") {
      stack.push([scale, tx, ty]);
      const transform = attrs.match(/transform="([^"]*)"/u);
      if (transform !== null) {
        const t = transform[1]!.match(/translate\(\s*(-?[\d.]+)[\s,]+(-?[\d.]+)\s*\)/u);
        const s = transform[1]!.match(/scale\(\s*(-?[\d.]+)\s*\)/u);
        tx += scale * (t === null ? 0 : Number(t[1]));
        ty += scale * (t === null ? 0 : Number(t[2]));
        scale *= s === null ? 1 : Number(s[1]);
      }
      continue;
    }
    if (tag === "rect") {
      const x = attr(attrs, "x");
      const y = attr(attrs, "y");
      add(x, y);
      add(x + attr(attrs, "width"), y + attr(attrs, "height"));
      continue;
    }
    if (tag === "circle") {
      const cx = attr(attrs, "cx");
      const cy = attr(attrs, "cy");
      const r = attr(attrs, "r");
      add(cx - r, cy - r);
      add(cx + r, cy + r);
      continue;
    }
    const data = attrs.match(/\sd="([^"]*)"/u);
    if (data === null) continue;
    for (const [px, py] of pathPoints(data[1]!)) add(px, py);
  }
  return box;
}

describe("every mark is inside the viewBox the sheet declares", () => {
  for (const word of BATTERY) {
    it(`keeps the ink on the page for ${JSON.stringify(word.slice(0, 24))}`, () => {
      const art = ring(word, { vocabulary: VOCABULARY });
      const [vx, vy, vw, vh] = declaredViewBox(art.sheetSvg);
      const box = inkBox(art.sheetSvg);

      expect(Number.isFinite(box.minX), "the sheet painted nothing at all").toBe(true);
      expect(box.minX).toBeGreaterThanOrEqual(vx);
      expect(box.minY).toBeGreaterThanOrEqual(vy);
      expect(box.maxX).toBeLessThanOrEqual(vx + vw);
      expect(box.maxY).toBeLessThanOrEqual(vy + vh);
    });
  }

  it("keeps the figure inside the field it was placed in", () => {
    // The loop glyph is the case that has actually escaped: nested loops grow
    // without bound unless clamped, and 300 letters on one cell is the worst of
    // them. Bounding the figure separately means a runaway loop cannot hide
    // behind the annotation frame, which reaches the sheet edge legitimately.
    for (const word of BATTERY) {
      const art = ring(word, { vocabulary: VOCABULARY });
      const place = figurePlacement(art.sheetSvg);
      const frame = art.walk.viewBox[2] * place.scale;
      const svg = art.sheetSvg;
      const figure = svg.slice(svg.indexOf('<g id="figure"'), svg.indexOf("</g><!--/figure-->"));
      const box = inkBox(figure);
      const label = JSON.stringify(word.slice(0, 24));
      // Even a letterless sheet draws its envelope, so an empty box would mean
      // the figure went missing rather than that it stayed inside its field.
      expect(Number.isFinite(box.minX), `${label} drew no figure at all`).toBe(true);
      expect(box.minX, label).toBeGreaterThanOrEqual(place.x);
      expect(box.minY, label).toBeGreaterThanOrEqual(place.y);
      expect(box.maxX, label).toBeLessThanOrEqual(place.x + frame);
      expect(box.maxY, label).toBeLessThanOrEqual(place.y + frame);
    }
  });
});

/* ── 8. the stroke gauge is measured, not enumerated ─────────────────────── */

/**
 * Every stroke the finished sheet paints, in millimetres, read off the emitted
 * bytes.
 *
 * Written here rather than imported so the plate is checked by something other
 * than the code that drew it. One user unit is one millimetre on this sheet, so
 * a painted width is an authored `stroke-width` times every `scale(...)` above
 * it in the group tree.
 *
 * Both the width AND the stroke paint are inherited: `<g id="envelope"
 * stroke-width="0.22">` holds paths that declare no width of their own, and a
 * walker that reads leaf attributes only misses the finest stroke on most
 * plates — it reports 0.204 mm for a sheet that paints 0.165. A shape with no
 * stroke paint in scope, or `stroke="none"`, paints no stroke at all however
 * wide the attribute says.
 */
function paintedStrokesMm(svg: string): readonly number[] {
  type Frame = Readonly<{ scale: number; width: number | undefined; stroke: string | undefined }>;
  const stack: Frame[] = [{ scale: 1, width: undefined, stroke: undefined }];
  const out: number[] = [];
  for (const token of svg.matchAll(/<(g|path|circle|rect|line|polyline|polygon)\b([^>]*)>|<\/g>/gu)) {
    if (token[0] === "</g>") {
      if (stack.length > 1) stack.pop();
      continue;
    }
    const attrs = token[2] ?? "";
    const parent = stack[stack.length - 1]!;
    const scaleAttr = attrs.match(/scale\(\s*(-?[\d.]+)/u);
    const scale = scaleAttr === null ? parent.scale : parent.scale * Number(scaleAttr[1]);
    const widthAttr = attrs.match(/stroke-width="([\d.]+)"/u);
    const width = widthAttr === null ? parent.width : Number(widthAttr[1]);
    const strokeAttr = attrs.match(/\bstroke="([^"]*)"/u);
    const stroke = strokeAttr === null ? parent.stroke : strokeAttr[1];
    if (token[1] === "g") {
      stack.push({ scale, width, stroke });
      continue;
    }
    if (width === undefined || stroke === undefined || stroke === "none") continue;
    const painted = width * scale;
    if (painted > 0) out.push(painted);
  }
  return out;
}

/** Path data back to the character the locked set draws it as. */
const CHARACTER_BY_PATHS = new Map<string, string>(
  NUMERALS_V1_SOURCE.map((g) => [g.paths.map((p) => p.d).join("|"), g.character] as const),
);

/**
 * The number the sheet SETS in the stroke gauge, read back as a string.
 *
 * House rule 4 means nothing on the plate is text, so this recognises each glyph
 * by its locked path data, groups the run by its baseline, and orders it by pen
 * position — which is exactly what a reader with the numeral set does. Nothing
 * here is told what the gauge should say.
 */
function gaugeOnPlate(svg: string): string {
  const open = svg.indexOf('<g id="metrology">');
  if (open < 0) throw new Error("the sheet carries no metrology block");
  let depth = 0;
  let close = -1;
  for (const token of svg.slice(open).matchAll(/<g\b[^>]*>|<\/g>/gu)) {
    depth += token[0] === "</g>" ? -1 : 1;
    if (depth === 0) {
      close = open + token.index + token[0].length;
      break;
    }
  }
  if (close < 0) throw new Error("the metrology block does not close");

  const rows = new Map<string, { x: number; ch: string }[]>();
  const run = /<g transform="translate\((-?[\d.]+) (-?[\d.]+)\) scale\((-?[\d.]+)\)">((?:<path[^>]*\/>)+)<\/g>/gu;
  for (const glyph of svg.slice(open, close).matchAll(run)) {
    const key = [...glyph[4]!.matchAll(/ d="([^"]*)"/gu)].map((d) => d[1]!).join("|");
    const character = CHARACTER_BY_PATHS.get(key);
    if (character === undefined) continue;
    const baseline = `${glyph[2]}/${glyph[3]}`;
    const row = rows.get(baseline) ?? [];
    row.push({ x: Number(glyph[1]), ch: character });
    rows.set(baseline, row);
  }

  const set = [...rows.values()].map((row) =>
    row.sort((a, b) => a.x - b.x).map((c) => c.ch).join(""),
  );
  // The gauge is the only run on the sheet shaped "<digits>.<digits> mm"; the
  // scale bar sets "0", "50" and "mm" on their own baselines and the print
  // floors set one decimal each. The space between value and unit advances the
  // pen without drawing, so it does not appear.
  const gauge = set.filter((t) => /^\d+\.\d+mm$/u.test(t));
  if (gauge.length !== 1) {
    throw new Error(`expected exactly one stroke gauge, found ${JSON.stringify(set)}`);
  }
  return gauge[0]!.replace(/mm$/u, "");
}

/** The gauge is set to three places, rounded down; this is that rounding. */
const toGaugePlaces = (mm: number): string =>
  (Math.floor(Math.round(mm * 1e6) / 1e3) / 1e3).toFixed(3);

describe("the stroke gauge is the plate's own measured minimum", () => {
  /**
   * Words chosen so the thinnest stroke has three different owners: a mark
   * (DESCENT places seven, the finest at 0.090 mm), the envelope (0.165 mm on a
   * sheet whose marks are coarser), and the kamea numerals — which is the one
   * the old gauge could not see, because `kameaBlock` fits its figure height to
   * the order of the square and that height was in no list.
   */
  const GAUGE_WORDS: readonly string[] = Object.freeze([
    "",
    "MOON",
    "TIDE",
    "DESCENT",
    "SWEATSHOP",
    "AS",
  ]);

  for (const square of SQUARE_IDS) {
    it(`prints the measured thinnest stroke on ${square}`, () => {
      for (const word of GAUGE_WORDS) {
        const art = ring(word, { square, vocabulary: VOCABULARY });
        const painted = paintedStrokesMm(art.sheetSvg);
        const thinnest = Math.min(...painted);
        const printed = gaugeOnPlate(art.sheetSvg);
        const label = `${square} ${JSON.stringify(word)}`;

        expect(painted.length, `${label}: the plate paints no stroke at all`).toBeGreaterThan(0);
        // The claim on the plate, and in the legend beside it.
        expect(printed, `${label}: the gauge is not the measured thinnest stroke`).toBe(
          toGaugePlaces(thinnest),
        );
        // A print-safety verdict may understate the finest ink; it may never
        // overstate it. The old gauge overstated luna by 9%.
        expect(Number(printed), `${label}: the gauge is thicker than the ink`).toBeLessThanOrEqual(
          thinnest,
        );
        expect(thinnest - Number(printed), `${label}: the gauge is off by more than it prints`)
          .toBeLessThan(0.001);
        // And it really is the minimum, not merely one of the widths.
        for (const w of painted) expect(w, label).toBeGreaterThanOrEqual(thinnest);
      }
    });
  }

  it("sees the kamea numerals, which shrink with the order of the square", () => {
    // The defect, stated as the measurement that exposed it. On luna the kamea
    // sets its numerals at 0.1505 mm — finer than the envelope's 0.165 mm, which
    // is what the enumerated constant would have reported, and finer than the
    // 0.204167 mm the constant itself held. MOON and TIDE both walk luna, and
    // TIDE is the word in this project's one logged collision.
    for (const word of ["MOON", "TIDE"]) {
      const art = ring(word);
      expect(art.walk.square, word).toBe("luna");
      const thinnest = Math.min(...paintedStrokesMm(art.sheetSvg));
      expect(thinnest, word).toBeCloseTo(0.1505, 6);
      expect(gaugeOnPlate(art.sheetSvg), word).toBe("0.150");
      // The two answers the old constant could give, both wrong here.
      expect(gaugeOnPlate(art.sheetSvg), word).not.toBe("0.165");
      expect(gaugeOnPlate(art.sheetSvg), word).not.toBe("0.204");
    }
  });

  it("finds the stroke a group declares for the paths inside it", () => {
    // The envelope's 0.22 units — 0.165 mm at the placement scale — is declared
    // once on `<g id="envelope">` and inherited by every band. A gauge that read
    // leaf attributes only would miss it and print 0.204 on a jupiter sheet with
    // no marks, which is thicker than the ink by a quarter.
    const art = ring("AS", { vocabulary: VOCABULARY });
    expect(art.marks.length).toBe(0);
    expect(art.sheetSvg).toContain('<g id="envelope" fill="none" stroke-width="0.22"');
    expect(Math.min(...paintedStrokesMm(art.sheetSvg))).toBeCloseTo(0.165, 6);
    expect(gaugeOnPlate(art.sheetSvg)).toBe("0.165");
  });

  it("prints one gauge per plate and it is set in the numeral set, not in text", () => {
    for (const word of BATTERY) {
      const art = ring(word, { vocabulary: VOCABULARY });
      expect(() => gaugeOnPlate(art.sheetSvg), JSON.stringify(word.slice(0, 24))).not.toThrow();
      expect(art.sheetSvg, JSON.stringify(word.slice(0, 24))).not.toMatch(/<text[\s>/]/u);
    }
  });
});

/* ── 9. the receipt discloses a clipped reading set ──────────────────────── */

describe("the cipher knob turns something", () => {
  const VOCAB = WORD_CORRESPONDENCE.map((w) => w.word);
  const CIPHERS = ["PYTH", "NAEQ", "HEB"] as const;

  /**
   * `RingOptions.cipher` did not exist until the instrument grew a CIPHER
   * control, and `ring()` passed the literal `"PYTH"` to `walk()`. Two thirds of
   * that picker was decoration: the user moved it and the plate did not change.
   * These are the two things that had to become true — the knob moves the
   * drawing, and the drawing still reads back — and they are separate claims,
   * because wiring the first without the second is what shipped for one commit.
   */
  /**
   * HEB AND PYTH ARE THE SAME CIPHER ON SATURN, AND THAT IS A THEOREM.
   *
   * Wiring the knob turned this up, and it is worth stating in full because the
   * obvious reading of it is "the knob is still broken". `reduceToCell(v, cells)`
   * takes digit sums until the value fits, so on Saturn — 3x3, nine cells —
   * every cipher value collapses to its digit root. Write the letter index i
   * from 0. PYTH is `(i mod 9) + 1`. HEB is place value: `i + 1` for i < 9,
   * `(i - 8) * 10` for 9 <= i < 18, `(i - 17) * 100` for i >= 18. The digit root
   * of `(i - 8) * 10` is `i - 8`; of `(i - 17) * 100` it is `i - 17`; and
   * `(i mod 9) + 1` is exactly `i + 1`, `i - 8` and `i - 17` over those three
   * ranges. They agree on all 26 letters, necessarily.
   *
   * The divergence starts where a HEB value stops needing to be reduced: J is 10,
   * which fits inside Jupiter's sixteen cells and does not collapse. So the count
   * of letters on which HEB differs from PYTH is a function of the square, and it
   * climbs from 0 on Saturn to 8 on Luna. Not stated as a table here — recomputed
   * below from the two ciphers, so this comment cannot outlive the arithmetic.
   */
  it("is the same cipher twice on Saturn and three ciphers everywhere else", () => {
    const disagreements = (cells: number, a: "PYTH" | "NAEQ" | "HEB", b: "PYTH" | "NAEQ" | "HEB"): number =>
      [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].filter(
        (L) => reduceToCell(cipherValue(L, a), cells) !== reduceToCell(cipherValue(L, b), cells),
      ).length;

    // The theorem, on the square it holds for.
    expect(disagreements(9, "PYTH", "HEB")).toBe(0);
    // And that it is Saturn's alone: every larger square separates them.
    for (const id of SQUARE_IDS) {
      const cells = kamea(id).n * kamea(id).n;
      if (cells === 9) continue;
      expect(disagreements(cells, "PYTH", "HEB"), `${id} should separate PYTH from HEB`).toBeGreaterThan(0);
    }
    // NAEQ is a different ordering outright and separates from PYTH everywhere.
    for (const id of SQUARE_IDS) {
      const cells = kamea(id).n * kamea(id).n;
      expect(disagreements(cells, "PYTH", "NAEQ"), `${id} should separate PYTH from NAEQ`).toBeGreaterThan(0);
    }
  });

  it("draws a different plate for each cipher that is actually a different cipher", () => {
    // DESCENT rides saturn, where PYTH and HEB coincide by the theorem above, so
    // it draws TWO plates and not three. Every word on a larger square draws
    // three. A test that demanded three everywhere would be demanding the
    // arithmetic be false.
    const descent = CIPHERS.map((cipher) => ring("DESCENT", { vocabulary: VOCAB, cipher }).sheetId);
    expect(ring("DESCENT", { vocabulary: VOCAB }).walk.square).toBe("saturn");
    expect(new Set(descent).size).toBe(2);
    expect(descent[0]).toBe(descent[2]);

    for (const word of ["AWAKENING", "QZXJVW"]) {
      const square = ring(word, { vocabulary: VOCAB }).walk.square;
      expect(kamea(square).n * kamea(square).n, `${word} must not ride saturn for this case`).toBeGreaterThan(9);
      const ids = CIPHERS.map((cipher) => ring(word, { vocabulary: VOCAB, cipher }).sheetId);
      expect(new Set(ids).size, `${word} drew ${new Set(ids).size} distinct plates over 3 ciphers`).toBe(3);
    }
  });

  it("defaults to PYTH, so every plate drawn before the option existed still is", () => {
    for (const word of ["DESCENT", "AWAKENING", "", "0123456789"]) {
      const bare = ring(word, { vocabulary: VOCAB });
      const named = ring(word, { vocabulary: VOCAB, cipher: "PYTH" });
      expect(bare.sheetSvg).toBe(named.sheetSvg);
      expect(bare.receipt).toBe(named.receipt);
      expect(bare.legend).toBe(named.legend);
      expect(bare.census).toBe(named.census);
    }
  });

  /**
   * The receipt is the reason the reader had to be told the cipher too.
   *
   * `ring()` called `read()` without one, so every plate was decoded as if it
   * were PYTH. Measured at the time, over all 170 vocabulary words: PYTH read
   * back 170, NAEQ read back 0, and HEB read back 114 — and the 114 was a
   * coincidence, not a success, since HEB and PYTH agree on the cells of A-I.
   * A reader handed the wrong key reports the miss as a property of the drawing.
   */
  it("reads every vocabulary word back under every cipher, not just the house one", () => {
    for (const cipher of CIPHERS) {
      const missed: string[] = [];
      for (const word of VOCAB) {
        const artifacts = ring(word, { vocabulary: VOCAB, cipher });
        if (!/spoken word recovered\s+yes/u.test(artifacts.receipt)) missed.push(word);
      }
      expect(
        missed.slice(0, 12).join(", "),
        `${cipher}: ${missed.length} of ${VOCAB.length} vocabulary words do not read back. ` +
          "Before the reader was handed the cipher this was 170 for NAEQ; a non-zero number here " +
          "means either the drawing lost information or read() is being given the wrong key again.",
      ).toBe("");
    }
  });

  it("says on the legend which cipher drew the plate, so a reader is not guessing", () => {
    for (const cipher of CIPHERS) {
      expect(ring("DESCENT", { vocabulary: VOCAB, cipher }).legend).toContain(`cipher ${cipher}`);
    }
  });
});

describe("a ceiling is printed as a ceiling", () => {
  /**
   * Twenty-four letters alternating over two saturn cells. Eleven loops hang on
   * runs that fit more than one visit, so the placement product runs past
   * `read()`'s expansion ceiling of 64 — and the figure admits 72.
   */
  const CLIPPED = "ABBAABBAABBAABBAABBAABBA";

  it("says the count is a floor when the expansion was clipped", () => {
    const art = ring(CLIPPED, { square: "saturn", vocabulary: VOCABULARY });
    const reading = read(art.walk.paths, { vocabulary: VOCABULARY });

    expect(reading.readingsClipped).toBe(true);
    // Distinct from the candidate ceiling, which this figure never reaches.
    expect(reading.truncated).toBe(false);
    expect(art.receipt).toMatch(/\n {2}readings the figure admits {8}at least 64\b/u);
    expect(art.receipt).toContain("Expansion hit its ceiling, so that is a floor and not");
    // And the prose audit evaluates the new line rather than shrugging at it.
    expect(
      report("ABBA…@saturn", auditProse(art, { vocabulary: VOCABULARY })),
    ).toBe('"ABBA…@saturn"\n');
  });

  it("prints a bare total when nothing was clipped", () => {
    // The disclosure has to be a readout, not a disclaimer bolted to every
    // receipt: the same word on jupiter admits 36 readings and expands all of
    // them.
    const art = ring(CLIPPED, { square: "jupiter", vocabulary: VOCABULARY });
    const reading = read(art.walk.paths, { vocabulary: VOCABULARY });
    expect(reading.readingsClipped).toBe(false);
    expect(reading.readings.length).toBe(36);
    expect(art.receipt).toMatch(/\n {2}readings the figure admits {8}36\b/u);
    expect(art.receipt).not.toContain("at least");
    expect(art.receipt).not.toContain("Expansion hit its ceiling");
  });

  it("clips no reading in the 170-word audit, so its recovery rates mean what they say", () => {
    // `auditVocabulary` walks every word and reads it back blind. A clipped
    // reading set can drop the reading that spells a word, which would shorten
    // `matches` and inflate `recovered` and `uniquelyRecovered` — and the report
    // carries no field that would say so. This asserts the precondition those
    // numbers rest on, over exactly the vocabulary, square, cipher and trace the
    // audit uses by default. The day it stops holding, this fails instead of the
    // rates quietly drifting.
    const words = WORD_CORRESPONDENCE.map((w) => w.word.toUpperCase()).sort();
    expect(words.length).toBe(170);

    const clipped: string[] = [];
    let widest = 0;
    for (const word of words) {
      const figure = walk(word, { square: "jupiter", cipher: "PYTH", trace: "AGRIPPA" });
      const reading = read(figure.paths, { vocabulary: words, cipher: "PYTH" });
      if (reading.readingsClipped) clipped.push(word);
      widest = Math.max(widest, reading.readings.length);
    }
    expect(clipped).toEqual([]);
    // The headroom, recorded so a shrinking margin is visible before it bites.
    // Measured today: the widest reading set in the whole vocabulary is 2
    // (BETWEEN, which walks 2-5-2-5 and arrives at one cell twice from the same
    // direction), against a ceiling of 64.
    expect(widest).toBeLessThan(64);
  });
});

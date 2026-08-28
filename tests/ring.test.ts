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
import { ring, type RingArtifacts, type RingOptions } from "@studio137/ring";
import { digitString, read, reduceToCell } from "@studio137/walk-engine";

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
    id: "receipt-readings",
    pattern: /^readings the figure admits\s+(\d+)/u,
    check: (m, f) => eq(m[1], f.reading.readings.length, "the readings the figure admits"),
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

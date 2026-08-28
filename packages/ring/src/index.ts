/**
 * THE RING — one word in, four artifacts out.
 *
 * The **sheet** is the painted plate; the **legend** numbers every mark back to
 * the codex entry and the rule that placed it; the **census** grades every choice
 * the sheet made; the **receipt** reads the mark back and returns the word.
 *
 * The four exist together on purpose. A sheet on its own is a picture, and a
 * picture cannot be checked. The legend says where each element came from, the
 * census says which choices were forced and which were taste, and the receipt
 * proves the figure still carries the word — read blind, from geometry and public
 * rules alone. Any one of them alone would be a caption.
 *
 * The sheet is a PLATE, not a picture: A4 at its stated print size, with the
 * figure in a drawing field and an annotation layer around it carrying the
 * drawing number, the square, the counts, a true scale bar and the census. See
 * `annotate.ts`. Every number on that layer is a field this module computed, and
 * the layer is set entirely in the constructed numeral set — no `<text>` reaches
 * a plate here, which is asserted on the finished sheet rather than assumed.
 */

import { sha256Hex } from "@studio137/plate-core";

import {
  annotationLayer,
  assertNoText,
  drawingNumber,
  FIGURE_PLACEMENT,
  SHEET_H,
  SHEET_W,
  PRINT_DPI,
} from "./annotate.js";
import {
  correspondenceForWord,
  type ConceptCorrespondence,
} from "@studio137/glyph-registry";
import { GEOMETRY_V2_SOURCE } from "@studio137/glyph-registry";
import { envelopeFromWalk, type EnvelopeFamily } from "@studio137/envelope-engine";
import {
  digitString,
  kamea,
  read,
  resolve,
  walk,
  type SquareId,
  type TraceId,
  type Walk,
} from "@studio137/walk-engine";

export type Necessity = "load-bearing" | "answerable" | "free" | "arbitrary";
export type Provenance = "generative" | "walk-derived" | "partial" | "control";

export type Choice = Readonly<{
  element: string;
  provenance: Provenance;
  necessity: Necessity;
  /** A prediction — what would differ if this were flipped. Never an adjective. */
  reason: string;
}>;

export type PlacedMark = Readonly<{
  index: number;
  id: string;
  name: string;
  tradition: string;
  x: number;
  y: number;
  scale: number;
}>;

export type RingArtifacts = Readonly<{
  word: string;
  sheetId: string;
  walk: Walk;
  envelope: EnvelopeFamily;
  correspondence: ConceptCorrespondence | undefined;
  marks: readonly PlacedMark[];
  choices: readonly Choice[];
  sheetSvg: string;
  legend: string;
  census: string;
  receipt: string;
}>;

export type RingOptions = Readonly<{
  square?: SquareId;
  trace?: TraceId;
  /** Words the receipt may return. The reader carries no vocabulary of its own. */
  vocabulary?: readonly string[];
  /** Most marks to place around the figure. */
  maxMarks?: number;
}>;

const BOX = 220;
const f = (n: number): string => n.toFixed(4);
const esc = (s: string): string =>
  s.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

/**
 * A cool-to-warm ramp, fixed rather than computed.
 *
 * Twelve sRGB steps, so the same chord index yields the same bytes on every
 * machine. Interpolating in a colour space would put the determinism contract at
 * the mercy of a rounding mode for no visible gain at this step count.
 */
export const SPECTRUM: readonly string[] = Object.freeze([
  "#5ef2c4", "#56d9d6", "#56c9ff", "#6ba8f5", "#8a7ff0", "#a678e4",
  "#c46fd0", "#d2603a", "#e08a3c", "#f4b942", "#d8d06a", "#9fe0a0",
]);

/** Where the square came from, so the census can say which without guessing. */
type SquareSource = "requested" | "concept" | "house";

/** The square a word with no concept walks. */
const HOUSE_SQUARE: SquareId = "jupiter";

/**
 * The letters this sheet is a sheet OF — exactly the ones station 1 keeps.
 *
 * House rule 1: this does not re-implement "what counts as a letter". It asks
 * `resolve()`, the station that owns that question, and reads back only the
 * letter sequence. The order argument scales the cell reduction and nothing
 * else — the letters are the same against every square — and the cells this call
 * computes are thrown away. The walk resolves again, against its own square.
 */
function spokenLetters(input: string): string {
  return resolve(input, kamea(HOUSE_SQUARE).n).letters.map((l) => l.letter).join("");
}

/** What to call a sheet whose input held no letters at all. */
const sheetName = (letters: string): string => (letters === "" ? "(no letters)" : letters);

export function ring(word: string, options: RingOptions = {}): RingArtifacts {
  // WHAT THE WORD IS, decided once, for both stations.
  //
  // Station 1 tolerates anything and records what it dropped, so "DESCENT" and
  // "DESCENT " resolve to the same seven letters and walk the same line. The ride
  // has to key off that same notion of the word, or the two stations disagree
  // about what was spoken. Keyed off the raw string — `correspondenceForWord`
  // lowercases but does not trim — a single trailing space from a CRLF word list
  // or a paste missed the concept table and moved DESCENT off saturn (3×3) onto
  // the house square (4×4): different order, different coordinates, different
  // drawing, different drawing number, decided by input hygiene rather than by
  // the word. 156 of the 170 table words changed square when padded with one
  // space each side. House rule 3 says concepts ride; it does not say they ride
  // on whitespace.
  const letters = spokenLetters(word);
  const correspondence = correspondenceForWord(letters);
  // The concept rides: it chooses the square, and never gates resolution. A word
  // with no concept still walks — on the house square — and still reads back. An
  // input with no letters at all still resolves, still draws, and still prints a
  // sheet; nothing here can refuse.
  const square = options.square ?? correspondence?.kamea ?? HOUSE_SQUARE;
  const trace = options.trace ?? "AGRIPPA";
  const squareSource: SquareSource =
    options.square !== undefined
      ? "requested"
      : correspondence === undefined
        ? "house"
        : "concept";

  // The walk is handed the caller's string, not the trimmed letters, so station 1
  // still records every dropped character in `walk.resolution.dropped`. The
  // letters it keeps are the same either way, so the drawing is too — which is
  // what makes the two calls byte-identical rather than merely similar.
  const figure = walk(word, { square, trace, cipher: "PYTH" });
  const envelope = envelopeFromWalk(figure);

  const marks = placeMarks(correspondence, options.maxMarks ?? 8);
  const choices = gradeChoices(figure, envelope, correspondence, squareSource, letters);

  // The drawing is composed and hashed BEFORE it is annotated, and the hash is
  // the drawing number the annotation prints. A sheet cannot carry the checksum
  // of its own finished bytes — writing the number changes them — so the number
  // identifies the DRAWING: the markup inside `<g id="figure">`, in figure units,
  // before placement. That string is delimited verbatim in the emitted file, so
  // a stranger can cut it out and rehash it without trusting this code.
  const ink = composeFigure(figure, envelope, marks);
  const sheetId = sha256Hex(ink.markup).slice(0, 16);

  const sheetSvg = composeSheet(
    ink,
    annotationLayer({
      walk: figure,
      envelope,
      marks,
      choices,
      sheetId,
      figureStrokesMm: ink.strokesMm,
    }),
  );
  // House rule 4, on the finished artifact rather than on any one layer.
  assertNoText(sheetSvg);

  const reading = read(figure.paths, {
    ...(options.vocabulary === undefined ? {} : { vocabulary: options.vocabulary }),
  });

  return Object.freeze({
    // The caller's string, unmodified — the record of what was spoken, kept for
    // the same reason `resolve()` keeps it. The four ARTIFACTS below are of the
    // letters, so `ring("DESCENT ")` and `ring("DESCENT")` emit identical bytes;
    // what was typed around those letters survives here and in
    // `walk.resolution.dropped` rather than on the plate.
    word,
    sheetId,
    walk: figure,
    envelope,
    correspondence,
    marks,
    choices,
    sheetSvg,
    legend: formatLegend(letters, figure, envelope, correspondence, marks, sheetId, squareSource),
    census: formatCensus(choices),
    receipt: formatReceipt(letters, figure, reading, options.vocabulary),
  });
}

/* ── placement ───────────────────────────────────────────────────────────── */

function placeMarks(
  correspondence: ConceptCorrespondence | undefined,
  limit: number,
): readonly PlacedMark[] {
  const ids = (correspondence?.markCandidates ?? []).slice(0, limit);
  const n = ids.length;
  if (n === 0) return Object.freeze([]);
  const radius = BOX / 2 - 15;
  return Object.freeze(
    ids.map((id, i) => {
      const source = GEOMETRY_V2_SOURCE.find((r) => r.id === id);
      const theta = (2 * Math.PI * i) / n - Math.PI / 2;
      return Object.freeze({
        index: i + 1,
        id,
        name: id.replace(/^mark-/u, ""),
        tradition: source === undefined ? "unknown" : "codex",
        x: BOX / 2 + Math.cos(theta) * radius,
        y: BOX / 2 + Math.sin(theta) * radius,
        scale: 0.2,
      });
    }),
  );
}

/* ── the drawing ─────────────────────────────────────────────────────────── */

/**
 * The figure, and every stroke width it paints.
 *
 * The widths are collected here, as the markup is emitted, and handed to the
 * annotation layer — which prints the thinnest of them. Recomputing that number
 * from a table of constants somewhere else would let the table and the drawing
 * drift apart, and the drawing would go on being right while the plate said
 * something else. Widths are converted to millimetres at the placement scale,
 * because that is the size the ink is actually laid down at.
 */
type FigureInk = Readonly<{ markup: string; strokesMm: readonly number[] }>;

/** A stroke width in figure units, at the placement scale, in millimetres. */
const strokeMm = (units: number): number => units * FIGURE_PLACEMENT.scale;

function composeFigure(
  figure: Walk,
  envelope: EnvelopeFamily,
  marks: readonly PlacedMark[],
): FigureInk {
  const layers: string[] = [];
  const strokesMm: number[] = [];

  const ENVELOPE_STROKE = 0.22;
  strokesMm.push(strokeMm(ENVELOPE_STROKE));
  layers.push(
    `<g id="envelope" fill="none" stroke-width="${ENVELOPE_STROKE}" stroke-linecap="round">` +
      envelope.bands
        .map((band) => {
          const colour = SPECTRUM[Math.min(SPECTRUM.length - 1, Math.floor(band.hue * SPECTRUM.length))]!;
          return `<path d="${band.d}" stroke="${colour}" opacity="0.5"/>`;
        })
        .join("") +
      `</g>`,
  );

  if (marks.length > 0) {
    layers.push(
      `<g id="marks" fill="none" stroke="#9aa7b4" stroke-width="2.2" stroke-linejoin="round">` +
        marks
          .map((m) => {
            const source = GEOMETRY_V2_SOURCE.find((r) => r.id === m.id);
            if (source === undefined) return "";
            const body = source.paths
              .map((p) => {
                if (p.role === "fill") return `<path d="${p.d}" fill="#9aa7b4" stroke="none"/>`;
                // The mark is drawn inside its own scale(m.scale), so the width
                // that reaches the plate is the authored width through BOTH
                // scales — the mark's and the sheet placement's.
                strokesMm.push(strokeMm(p.strokeWidth * m.scale));
                return `<path d="${p.d}" stroke-width="${p.strokeWidth}"/>`;
              })
              .join("");
            return (
              `<g transform="translate(${f(m.x - 50 * m.scale)} ${f(m.y - 50 * m.scale)}) ` +
              `scale(${f(m.scale)})">${body}</g>`
            );
          })
          .join("") +
        `</g>`,
    );
  }

  const byRole = (role: string): string =>
    figure.paths
      .filter((p) => p.role === role)
      .map((p) => `<path d="${p.d}"/>`)
      .join("");

  const WALK_STROKE = 1.4;
  const LOOP_STROKE = 1.6;
  strokesMm.push(strokeMm(WALK_STROKE), strokeMm(LOOP_STROKE));
  layers.push(
    `<g id="walk-line" fill="none" stroke="#ffffff" stroke-width="${WALK_STROKE}" ` +
      `stroke-linejoin="round" stroke-linecap="round">${byRole("line")}</g>`,
    `<g id="walk-loops" fill="none" stroke="#f4b942" stroke-width="${LOOP_STROKE}">${byRole("loop")}</g>`,
    `<g id="walk-caps" fill="none" stroke="#ffffff" stroke-width="${WALK_STROKE}" ` +
      `stroke-linecap="round">${byRole("start-cap")}${byRole("end-cap")}</g>`,
  );

  return Object.freeze({
    markup: layers.join(""),
    strokesMm: Object.freeze(strokesMm),
  });
}

/* ── the sheet ───────────────────────────────────────────────────────────── */

/**
 * The plate: A4 portrait at its stated print size, figure in the drawing field,
 * annotation around it.
 *
 * `width="210mm" height="297mm"` over a `0 0 210 297` viewBox makes one user
 * unit one millimetre EXACTLY. That identity is what lets the scale bar and the
 * dimension be true by construction rather than by assertion — there is no
 * conversion between drawn and printed length to get wrong. At 300 DPI the sheet
 * rasterises to 2480 x 3508.
 *
 * The figure group is delimited by a literal `</g><!--/figure-->` so the exact
 * bytes the drawing number hashes can be cut out of the emitted file by a plain
 * string operation, with no need to match nested groups — or to trust us.
 */
function composeSheet(ink: FigureInk, annotation: string): string {
  const place = FIGURE_PLACEMENT;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${SHEET_H}" ` +
    `width="${SHEET_W}mm" height="${SHEET_H}mm">` +
    `<rect width="${SHEET_W}" height="${SHEET_H}" fill="#07090c"/>` +
    `<g id="figure" transform="translate(${f(place.x)} ${f(place.y)}) ` +
    `scale(${f(place.scale)})">${ink.markup}</g><!--/figure-->` +
    `<g id="annotation">${annotation}</g>` +
    `</svg>`
  );
}

/* ── the three texts ─────────────────────────────────────────────────────── */

/** The quantity the multiplier is reduced from. One implementation, two readers. */
const cellSumOf = (figure: Walk): number =>
  figure.steps.reduce((total, step) => total + step.cell, 0);

/**
 * How THIS sheet's multiplier was actually arrived at, in one sentence.
 *
 * The legend and the census both state this derivation, and they must not be
 * able to disagree: a reader applying the plate's own instruction — if a count
 * disagrees with its number, the sheet is void — would otherwise void a correct
 * sheet. So it is written once, here, and both stations print the same string.
 *
 * That is exactly what went wrong. The multiplier was the raw cell sum until the
 * node count was fixed at 137 and Venus's 1225 nodes made the cusps uncountable;
 * the reduction was added, the legend was corrected, and the census was not. One
 * sheet then shipped two statements of one rule, and the census's — "the walked
 * cell sum minus one" — was false for every possible word: ACE summed 9 and drew
 * 9 cusps, not 8; DESCENT summed 25 and drew 7, not 24.
 *
 * The letterless case is the engine's, not this module's: `multiplierForWalk`
 * short-circuits `if (sum === 0) return 2` BEFORE it reduces, so no reduction
 * runs and there is none to report. The old sentence back-computed one anyway and
 * printed "reduced theosophically to 1", which `reduceToCell(0, 9)` — returning
 * 9 — flatly contradicts. This branches on the same `sum === 0` the engine
 * branches on, and says plainly that the multiplier is a floor.
 */
function multiplierDerivation(figure: Walk, envelope: EnvelopeFamily): string {
  const sum = cellSumOf(figure);
  if (sum === 0) {
    return (
      "no letters, so no cells were walked and no reduction ran; the engine floors " +
      `the multiplier at ${envelope.multiplier}, and the family draws ` +
      `${envelope.cusps} cusp${envelope.cusps === 1 ? "" : "s"}`
    );
  }
  return (
    `walked cell sum ${sum}, reduced theosophically to ${envelope.cusps}; ` +
    `the multiplier is that + 1 = ${envelope.multiplier}`
  );
}

function formatLegend(
  letters: string,
  figure: Walk,
  envelope: EnvelopeFamily,
  correspondence: ConceptCorrespondence | undefined,
  marks: readonly PlacedMark[],
  sheetId: string,
  squareSource: SquareSource,
): string {
  const lines: string[] = [
    `LEGEND — ${sheetName(letters)}`,
    `sheet ${sheetId} · ${figure.square} ${figure.order}×${figure.order} · cipher ${figure.cipher} · trace ${figure.trace}`,
    "",
    "THE PLATE",
    `  ISO A4 portrait, ${SHEET_W} × ${SHEET_H} mm, declared on the sheet itself. The viewBox is`,
    `  in millimetres, so one user unit is one millimetre and the scale bar is true`,
    `  by construction — measure it. At ${PRINT_DPI} DPI the sheet is ${Math.round((SHEET_W / 25.4) * PRINT_DPI)} × ${Math.round((SHEET_H / 25.4) * PRINT_DPI)} px.`,
    `  The figure is placed at ${FIGURE_PLACEMENT.scale}, so its ${figure.viewBox[2]}-unit frame prints at ${FIGURE_PLACEMENT.widthMm.toFixed(2)} mm`,
    `  and one figure unit is exactly ${FIGURE_PLACEMENT.scale} mm.`,
    "",
    "  The annotation layer has no alphabet — the constructed numeral set holds",
    "  digits and a few symbols, and nothing on a plate may be set in <text>. So",
    "  each count is labelled by a miniature of what it counts, and the two index",
    "  axes of the census are named here rather than on the sheet:",
    "",
    "    counts, top to bottom   nodes · cusps · segments · loops · activated cells · marks",
    "    census columns 1-4      load-bearing · answerable · free · arbitrary",
    "    census rows 1-4         generative · walk-derived · partial · control",
    "    the last row and column are totals; the corner is every choice graded.",
    "",
    "  DRAWING NUMBER, as set on the sheet:",
    `    ${drawingNumber(sheetId).replace(/(\d{5})(?=\d)/gu, "$1 ")}`,
    "  That digest is SHA-256 of the figure markup — the bytes between the literal",
    "  `<g id=\"figure\" ...>` tag and the literal `</g><!--/figure-->` that closes",
    "  it — first 16 hex characters, read as a big-endian 64-bit integer. The",
    "  drawing is hashed before it is annotated, because a sheet cannot carry the",
    "  checksum of bytes that include the checksum. Cut, hash, convert, compare:",
    "  nothing here has to be taken on trust.",
    "",
    "  The dimension below the figure is the envelope's diameter at the stated",
    "  print size, and its extension lines are tangent to the envelope at the",
    "  widest point, which is where the measurement was taken.",
    "",
    "  The gauge in the title block is the thinnest stroke the plate actually",
    "  paints, measured from the widths the figure emitted, against the garment",
    "  floors in scripts/build-print-kit.ts — DTF 0.5 mm, DTG on light 0.6 mm,",
    "  DTG on dark 1.0 mm. This is a paper sheet; those floors are a verdict on a",
    "  second profile, not a pass mark for this one.",
    "",
    "THE WALK",
    `  ${figure.steps.length === 0 ? "no letters — nothing was walked" : figure.steps.map((s) => `${s.letter}=${s.value}`).join("  ")}`,
    `  cells        ${digitString(figure.resolution) || "none"}`,
    `  segments     ${figure.segmentCount}`,
    `  loops        ${figure.loopCount}   (a loop marks two consecutive letters on one cell)`,
    `  activated    ${figure.activatedCells.join(", ") || "none"}`,
    "",
    "THE ENVELOPE",
    `  ${envelope.nodes} nodes, multiplier ${envelope.multiplier}, ${envelope.cusps} cusps`,
    // The old caption here read "nodes = magic constant × order; multiplier =
    // sum of the walked cells". Both halves stopped being true when the node
    // count was fixed at 137 and the multiplier was reduced: Venus gave 1225
    // nodes, at which density the cusps cannot be counted. A stale derivation
    // printed beside a live number is the exact failure this sheet is against,
    // so it is restated from what `envelope-engine` actually does — and it is
    // restated by `multiplierDerivation`, the one place that sentence is
    // written, because this caption was corrected once while the census's copy
    // of the same rule was left behind.
    `  nodes are fixed at ${envelope.nodes} — prime, so every multiplier below it is coprime`,
    `  with it: each node carries one chord out and one in, and every family draws the`,
    `  same ${envelope.nodes - 1} chords over all ${envelope.nodes} nodes. No multiplier collapses onto a subset.`,
    `  ${multiplierDerivation(figure, envelope)}.`,
    `  cusps = multiplier − 1 = ${envelope.cusps}. Count the cusps to check this sheet.`,
    "",
  ];

  if (letters === "") {
    lines.push(
      "CORRESPONDENCE",
      "  none — this input holds no letters, so there is no word to look one up by.",
      "  It resolved and drew anyway. Nothing here may refuse an input.",
      "",
    );
  } else if (correspondence === undefined) {
    lines.push(
      "CORRESPONDENCE",
      `  none — "${letters}" is in no concept table.`,
      "  It resolved and walked anyway. Letters resolve; concepts ride.",
      "",
    );
  } else {
    lines.push(
      "CORRESPONDENCE",
      `  concept      ${correspondence.concept}`,
      // The planet chooses the square only when nothing else did. A caller who
      // names `square` overrides the concept, and this line used to claim the
      // planet chose a square the caller had already picked.
      `  planet       ${correspondence.planet}   ${
        squareSource === "concept"
          ? `(chose the square, ${figure.order}×${figure.order})`
          : `(names ${correspondence.kamea}; the caller asked for ${figure.square}, which is what was walked)`
      }`,
      `  traditions   ${correspondence.traditions.join(", ") || "none"}`,
      `  brushes      ${correspondence.brushes.join(", ")}`,
      "",
    );
  }

  if (marks.length === 0 && correspondence === undefined) {
    // The old text blamed "the concept's brushes" here, on sheets that have no
    // concept at all — SWEATSHOP's legend said a concept it does not have chose
    // brushes it was never given. Absence of a correspondence and a gap in the
    // mark corpus are different facts and now read differently.
    lines.push(
      "MARKS",
      "  none. No concept rides these letters, so no brushes were named and no mark",
      "  was reachable to place. That is the absence of a correspondence, not a gap",
      "  in the mark corpus.",
      "",
    );
  } else if (marks.length === 0) {
    lines.push(
      "MARKS",
      "  none reachable. This is a hole in the corpus, not an error: this concept's",
      "  brushes resolve to traditions nobody has drawn a mark for.",
      "",
    );
  } else {
    lines.push("MARKS", ...marks.map((m) => `  ${String(m.index).padStart(2)}  ${m.name}`), "");
  }

  return `${lines.join("\n")}\n`;
}

/**
 * Grade every choice, and predict what a reader would measure if it were flipped.
 *
 * House rule 6: a reason is a PREDICTION, never an adjective and never a false
 * derivation. Two rules this file learned the hard way and now keeps:
 *
 *   - A reason is about THIS sheet. Where a convention draws nothing here — a
 *     word with no doubled beat hangs no loops — the grade says so and drops with
 *     it. "Load-bearing" printed above "removing it would not change one byte of
 *     this sheet" is the same self-contradiction the census exists to catch.
 *   - A reason may only claim what the code it describes actually does. Every
 *     string below was re-read against its module before it was written.
 */
function gradeChoices(
  figure: Walk,
  envelope: EnvelopeFamily,
  correspondence: ConceptCorrespondence | undefined,
  squareSource: SquareSource,
  letters: string,
): readonly Choice[] {
  const cells = digitString(figure.resolution);
  const walked = figure.steps.length;
  const loops = figure.loopCount;
  // A repeat hangs a loop instead of extending the line, so this is exactly how
  // many points the line keeps (`walk.ts` pushes one per non-repeating step).
  const linePoints = walked - loops;
  // Asked of the emitted paths rather than inferred from a count: a figure whose
  // letters all land on one cell draws no line at all, and two census reasons used
  // to describe one anyway.
  const hasLine = figure.paths.some((p) => p.role === "line");
  const capped = figure.paths.some((p) => p.role === "start-cap");
  const s = (n: number): string => (n === 1 ? "" : "s");

  const squareReason = ((): string => {
    if (squareSource === "requested") {
      return (
        `The caller named ${figure.square} outright, so no concept chose it. Name another ` +
        `square and these letters reduce against a different maximum and land on a ` +
        `different grid: different order, different coordinates, different drawing number.`
      );
    }
    if (correspondence !== undefined) {
      return (
        `The concept "${correspondence.concept}" rides planet ${correspondence.planet}, whose kamea is the ` +
        `${figure.order}×${figure.order} square this line is walked on. A concept on another planet walks ` +
        `another grid and draws another figure. The lookup keys on the letters ${letters}, not on the ` +
        `string as typed, so padding or punctuation cannot move the word off its own square.`
      );
    }
    return (
      `No concept rides ${letters === "" ? "an input with no letters" : `"${letters}"`}, so the house ` +
      `square ${figure.square} was used. Another square would draw a different figure with equal ` +
      `warrant — nothing in these letters prefers this one.`
    );
  })();

  return Object.freeze([
    Object.freeze({
      element: "the walk",
      provenance: "walk-derived" as const,
      necessity: walked === 0 ? ("free" as const) : ("load-bearing" as const),
      reason:
        walked === 0
          ? "No letters, so no cells and no line: this plate carries the envelope alone, and the receipt returns nothing because there is nothing drawn to read. One letter would put one cell on the grid and give every choice below something to derive from."
          : `${hasLine ? "The line is" : "The figure is"} cells ${cells} in order — the ${walked} letter${s(walked)} of ${letters} under ${figure.cipher} on ${figure.square}. Everything else on the sheet is downstream of that sequence: the paths, the drawing number, the cusp count, the word the receipt hands back. Change the sequence and they move together, which is why no two of them can disagree about the word.`,
    }),
    Object.freeze({
      element: "the square",
      provenance: squareSource === "concept" ? ("walk-derived" as const) : ("control" as const),
      necessity: squareSource === "house" ? ("free" as const) : ("answerable" as const),
      reason: squareReason,
    }),
    Object.freeze({
      element: "the loop glyph",
      provenance: "walk-derived" as const,
      necessity: loops === 0 ? ("answerable" as const) : ("load-bearing" as const),
      reason:
        loops === 0
          ? "No two consecutive letters here land on one cell, so this sheet hangs no loops and dropping the convention would not change one byte of it. It is recorded because of what it does elsewhere: on DESCENT, where E and N both land on cell 5, the loop is the only mark of the doubled beat and without it the receipt reads back a word one letter short."
          : `${loops} loop${s(loops)} hang${loops === 1 ? "s" : ""} on this figure, one for each pair of consecutive letters on one cell. Drop the convention and ${loops === 1 ? "that beat leaves" : "those beats leave"} no mark at all${hasLine ? ` — the line still has its ${linePoints} point${s(linePoints)}, so the drawing looks finished` : ", and this figure has no line to look finished with: every letter landed on one cell"} — and the receipt reads back a word ${loops} letter${s(loops)} short.`,
    }),
    Object.freeze({
      element: "the start cap",
      provenance: "walk-derived" as const,
      // Load-bearing only where the cap is the sole carrier of the reading. With a
      // line or a loop present, deleting it still returns the word — verified by
      // deleting it — so there it is answerable: a claim about a human reader.
      necessity: capped && !hasLine && loops === 0 ? ("load-bearing" as const) : ("answerable" as const),
      reason: capped
        ? // Checked by deleting the cap and re-reading, not assumed — and the answer
          // depends on what else the figure carries. With a line or a loop present
          // `read()` recovers the word without the cap. With neither, the cap is the
          // only ink there is, and `read.ts`'s `capCentre` takes the node from it.
          // An earlier version of this sentence claimed the cap was always redundant
          // to the machine. It stopped being true the moment the reader learned to
          // fall back on it.
          (hasLine
            ? `The cap says which end was spoken first. Without it the ink of this line and the ink of its reversal are the same segments in the same places, so a reader working from the plate alone could start at either end and read the word or its mirror. read() does recover this word with the cap deleted — it takes direction from the order of the points in the path data — so on this sheet the cap is for the eye, not the machine.`
            : loops > 0
              ? `Every letter here landed on one cell, so there is no line to reverse and the cap distinguishes nothing a reader could otherwise get wrong: this figure's start and end are the same place. read() recovers the word with the cap deleted, from the ${loops} loop${s(loops)}. The mark is kept for consistency across the set, not because this plate needs it.`
              : `The cap is the only ink on this plate: ${walked} letter${s(walked)} landing on one cell draws no line and hangs no loop. Delete it and read() returns nothing at all, because capCentre is the only thing left carrying the node. Here the mark is load-bearing for the machine as well as the eye.`)
        : `This drawing has no start cap — ${walked === 0 ? "there are no letters, so there is no line to point" : `the ${figure.trace} trace draws none`} — so nothing on the plate says which end was spoken first. read() is unaffected, since it takes direction from the order of the points in the path data; a reader with only the picture is not.`,
    }),
    Object.freeze({
      element: "the envelope",
      provenance: "generative" as const,
      necessity: "load-bearing" as const,
      // The derivation is not restated here. It is printed from the one function
      // that owns it, so this line and the legend's cannot drift apart again.
      reason: `Cusps are a readout of the word, not an ornament: ${multiplierDerivation(figure, envelope)}. Count the points of the caustic and you have recovered the multiplier. A word whose cell sum reduces to something else draws a different count; two words that reduce alike draw the same envelope, so what the count reports is the reduction, not the spelling.`,
    }),
    Object.freeze({
      element: "the spectrum",
      provenance: "generative" as const,
      necessity: "answerable" as const,
      reason: `Hue advances with chord index — ${envelope.bands.length} band${s(envelope.bands.length)} over ${envelope.chordCount} chords — so colour reports where in the family a chord sits. Flatten it to one colour and every chord stays exactly where it is: the sheet loses a readout, not an ornament, and no geometry moves.`,
    }),
    Object.freeze({
      element: "the ground colour",
      provenance: "control" as const,
      necessity: "free" as const,
      reason:
        "Near-black because the studio's instruments are. The ground is painted outside the figure group, and the drawing number hashes only that group's markup, so any ground colour whatsoever yields the same number — nothing measured on this sheet moves with it.",
    }),
  ]);
}

function formatCensus(choices: readonly Choice[]): string {
  const count = (n: Necessity): number => choices.filter((c) => c.necessity === n).length;
  const lines: string[] = [
    "CENSUS — every choice this sheet made",
    "",
    `LOAD-BEARING ${count("load-bearing")} · ANSWERABLE ${count("answerable")} · ` +
      `FREE ${count("free")} · ARBITRARY ${count("arbitrary")}`,
    "",
    "Free is not a failing grade; unrecorded is. A reason must be a prediction —",
    "what would differ if the choice were flipped — never an adjective.",
    "",
  ];
  for (const c of choices) {
    lines.push(
      `  ${c.element}`,
      `    ${c.provenance} / ${c.necessity}`,
      `    ${c.reason}`,
      "",
    );
  }
  const arbitrary = choices.filter((c) => c.necessity === "arbitrary");
  lines.push(
    arbitrary.length === 0
      ? "Nothing on this sheet is unaccounted for."
      : `${arbitrary.length} choice(s) have no recorded reason. Printed honestly; the census discloses, it does not gate.`,
    "",
  );
  return `${lines.join("\n")}\n`;
}

function formatReceipt(
  letters: string,
  figure: Walk,
  reading: ReturnType<typeof read>,
  vocabulary: readonly string[] | undefined,
): string {
  const lines: string[] = [
    `RECEIPT — ${sheetName(letters)}`,
    "",
    "Read blind: path data and a vocabulary, nothing else. No manifest, no key,",
    "no record of the compile. The drawing is the only witness.",
    "",
    `  order inferred from the drawing   ${reading.order ?? "none"}`,
    `  cells recovered                   ${reading.cells.join("·")}`,
    `  cells walked                      ${digitString(figure.resolution)}`,
    `  identical                         ${reading.cells.join("·") === digitString(figure.resolution) ? "yes" : "NO"}`,
    `  readings the figure admits        ${reading.readings.length}${reading.ambiguousLoops ? "  (ambiguous: a cell is revisited from the same direction)" : ""}`,
    "",
  ];
  if (vocabulary === undefined) {
    lines.push(
      "  No vocabulary supplied, so no word is returned. The cells above are what",
      "  the drawing yields on its own; a vocabulary is what turns them back into",
      "  speech.",
      "",
    );
  } else {
    // Against the letters, not the raw string. `read()` returns words, and a
    // word never carries the space that was pasted after it: matching on the raw
    // input made `ring("DESCENT ")` print "spoken word recovered NO" over a
    // receipt whose own line above it had just returned DESCENT.
    const recovered = reading.matches.includes(letters);
    lines.push(
      `  returned                          ${reading.matches.join(", ") || "nothing"}`,
      `  spoken word recovered             ${recovered ? "yes" : "NO"}`,
      reading.matches.length > 1
        ? `  ${reading.matches.length} words share this mark — a collision, reported rather than resolved.`
        : "",
      "",
    );
  }
  return `${lines.filter((l) => l !== "").join("\n")}\n`;
}

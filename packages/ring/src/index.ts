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
  read,
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

export function ring(word: string, options: RingOptions = {}): RingArtifacts {
  const correspondence = correspondenceForWord(word);
  // The concept rides: it chooses the square, and never gates resolution. A word
  // with no concept still walks — on the house square — and still reads back.
  const square = options.square ?? correspondence?.kamea ?? "jupiter";
  const trace = options.trace ?? "AGRIPPA";

  const figure = walk(word, { square, trace, cipher: "PYTH" });
  const envelope = envelopeFromWalk(figure);

  const marks = placeMarks(correspondence, options.maxMarks ?? 8);
  const choices = gradeChoices(figure, envelope, correspondence);

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
    word,
    sheetId,
    walk: figure,
    envelope,
    correspondence,
    marks,
    choices,
    sheetSvg,
    legend: formatLegend(word, figure, envelope, correspondence, marks, sheetId),
    census: formatCensus(choices),
    receipt: formatReceipt(word, figure, reading, options.vocabulary),
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

function formatLegend(
  word: string,
  figure: Walk,
  envelope: EnvelopeFamily,
  correspondence: ConceptCorrespondence | undefined,
  marks: readonly PlacedMark[],
  sheetId: string,
): string {
  // The quantity the multiplier is reduced from. Printed so the reduction above
  // is checkable: add the cells, reduce, add one.
  const cellSum = figure.steps.reduce((total, step) => total + step.cell, 0);
  const lines: string[] = [
    `LEGEND — ${word.toUpperCase()}`,
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
    `  ${figure.steps.map((s) => `${s.letter}=${s.value}`).join("  ")}`,
    `  cells        ${digitString(figure.resolution)}`,
    `  segments     ${figure.segmentCount}`,
    `  loops        ${figure.loopCount}   (a loop marks two consecutive letters on one cell)`,
    `  activated    ${figure.activatedCells.join(", ")}`,
    "",
    "THE ENVELOPE",
    `  ${envelope.nodes} nodes, multiplier ${envelope.multiplier}, ${envelope.cusps} cusps`,
    // The old caption here read "nodes = magic constant × order; multiplier =
    // sum of the walked cells". Both halves stopped being true when the node
    // count was fixed at 137 and the multiplier was reduced: Venus gave 1225
    // nodes, at which density the cusps cannot be counted. A stale derivation
    // printed beside a live number is the exact failure this sheet is against,
    // so it is restated from what `envelope-engine` actually does — including
    // the cell sum, so the reduction can be checked rather than believed.
    `  nodes are fixed at ${envelope.nodes} — prime, so every multiplier below it closes as a`,
    `  single cycle over all nodes and no family degenerates into a sparse figure.`,
    `  walked cell sum ${cellSum}; reduced theosophically to ${envelope.cusps}; multiplier is that + 1.`,
    `  cusps = multiplier − 1 = ${envelope.cusps}. Count the cusps to check this sheet.`,
    "",
  ];

  if (correspondence === undefined) {
    lines.push(
      "CORRESPONDENCE",
      `  none — "${word}" is in no concept table.`,
      "  It resolved and walked anyway. Letters resolve; concepts ride.",
      "",
    );
  } else {
    lines.push(
      "CORRESPONDENCE",
      `  concept      ${correspondence.concept}`,
      `  planet       ${correspondence.planet}   (chooses the square)`,
      `  traditions   ${correspondence.traditions.join(", ") || "none"}`,
      `  brushes      ${correspondence.brushes.join(", ")}`,
      "",
    );
  }

  if (marks.length === 0) {
    lines.push(
      "MARKS",
      "  none reachable. This is a hole in the corpus, not an error: the concept's",
      "  brushes resolve to traditions nobody has drawn a mark for.",
      "",
    );
  } else {
    lines.push("MARKS", ...marks.map((m) => `  ${String(m.index).padStart(2)}  ${m.name}`), "");
  }

  return `${lines.join("\n")}\n`;
}

function gradeChoices(
  figure: Walk,
  envelope: EnvelopeFamily,
  correspondence: ConceptCorrespondence | undefined,
): readonly Choice[] {
  return Object.freeze([
    Object.freeze({
      element: "the walk",
      provenance: "walk-derived" as const,
      necessity: "load-bearing" as const,
      reason: `Change the cipher and ${figure.input.toUpperCase()} lands on different cells; the figure and the read-back both change.`,
    }),
    Object.freeze({
      element: "the square",
      provenance: correspondence === undefined ? ("control" as const) : ("walk-derived" as const),
      necessity: correspondence === undefined ? ("free" as const) : ("answerable" as const),
      reason:
        correspondence === undefined
          ? "No concept, so the house square was used. Another square would draw a different figure with equal warrant."
          : `The concept "${correspondence.concept}" rides planet ${correspondence.planet}; a different planet is a different square and a different figure.`,
    }),
    Object.freeze({
      element: "the loop glyph",
      provenance: "walk-derived" as const,
      necessity: "load-bearing" as const,
      reason:
        "Remove it and consecutive letters on one cell vanish from the drawing; the receipt then reads back a shorter word than was spoken.",
    }),
    Object.freeze({
      element: "the start cap",
      provenance: "walk-derived" as const,
      necessity: "load-bearing" as const,
      reason:
        "Remove it and the line is symmetric under reversal; every word competes with its own mirror in the read-back.",
    }),
    Object.freeze({
      element: "the envelope",
      provenance: "generative" as const,
      necessity: "load-bearing" as const,
      reason: `Its ${envelope.cusps} cusps are the walked cell sum minus one; a different word draws a different cusp count, and the count is checkable by eye.`,
    }),
    Object.freeze({
      element: "the spectrum",
      provenance: "generative" as const,
      necessity: "answerable" as const,
      reason:
        "Hue advances with chord index, so colour reports position in the construction. Flatten it and the sheet loses a readout, not an ornament.",
    }),
    Object.freeze({
      element: "the ground colour",
      provenance: "control" as const,
      necessity: "free" as const,
      reason:
        "Near-black because the studio's instruments are. A pale ground would read as a different studio; nothing measurable changes.",
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
  word: string,
  figure: Walk,
  reading: ReturnType<typeof read>,
  vocabulary: readonly string[] | undefined,
): string {
  const lines: string[] = [
    `RECEIPT — ${word.toUpperCase()}`,
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
    const recovered = reading.matches.includes(word.toUpperCase());
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

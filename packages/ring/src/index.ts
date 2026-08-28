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
 */

import { sha256Hex } from "@studio137/plate-core";
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
  const sheetSvg = composeSheet(figure, envelope, marks);
  const sheetId = sha256Hex(sheetSvg).slice(0, 16);

  const reading = read(figure.paths, {
    ...(options.vocabulary === undefined ? {} : { vocabulary: options.vocabulary }),
  });

  const choices = gradeChoices(figure, envelope, correspondence);

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

/* ── the sheet ───────────────────────────────────────────────────────────── */

function composeSheet(
  figure: Walk,
  envelope: EnvelopeFamily,
  marks: readonly PlacedMark[],
): string {
  const layers: string[] = [];

  layers.push(
    `<g id="envelope" fill="none" stroke-width="0.22" stroke-linecap="round">` +
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
              .map((p) =>
                p.role === "fill"
                  ? `<path d="${p.d}" fill="#9aa7b4" stroke="none"/>`
                  : `<path d="${p.d}" stroke-width="${p.strokeWidth}"/>`,
              )
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

  layers.push(
    `<g id="walk-line" fill="none" stroke="#ffffff" stroke-width="1.4" ` +
      `stroke-linejoin="round" stroke-linecap="round">${byRole("line")}</g>`,
    `<g id="walk-loops" fill="none" stroke="#f4b942" stroke-width="1.6">${byRole("loop")}</g>`,
    `<g id="walk-caps" fill="none" stroke="#ffffff" stroke-width="1.4" ` +
      `stroke-linecap="round">${byRole("start-cap")}${byRole("end-cap")}</g>`,
  );

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BOX} ${BOX}" ` +
    `width="${BOX * 4}" height="${BOX * 4}">` +
    `<rect width="${BOX}" height="${BOX}" fill="#07090c"/>` +
    layers.join("") +
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
  const lines: string[] = [
    `LEGEND — ${word.toUpperCase()}`,
    `sheet ${sheetId} · ${figure.square} ${figure.order}×${figure.order} · cipher ${figure.cipher} · trace ${figure.trace}`,
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
    `  nodes = magic constant × order; multiplier = sum of the walked cells.`,
    `  Count the cusps to check this sheet against its own caption.`,
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

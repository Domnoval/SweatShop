/**
 * THE RING — one word in, five artifacts out.
 *
 * The **sheet** is the painted plate; the **legend** numbers every mark back to
 * the codex entry and the rule that placed it; the **census** grades every choice
 * the sheet made; the **mode census** measures the composition field the concept
 * asked for; the **receipt** reads the mark back and returns the word.
 *
 * They exist together on purpose. A sheet on its own is a picture, and a picture
 * cannot be checked. The legend says where each element came from, the census
 * says which choices were forced and which were taste, the mode census reports
 * what the composition construction actually placed, and the receipt proves the
 * figure still carries the word — read blind, from geometry and public rules
 * alone. Any one of them alone would be a caption.
 *
 * The fifth is new. Until `@studio137/mode-engine` existed, every concept in the
 * table carried a `composition.mode` — `lunar` asks for cymatic, `war` for
 * haring — and this module read only `planet` and `brushes`, so every word drew
 * the same construction. The mode is dispatched on now, on the same terms the
 * square rides on, and the mode census is where its measurements go.
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
  baseStampRadius,
  contextFromWalk,
  fieldFromWalk,
  isModeId,
  MODE_IDS,
  modeSpec,
  requestedFor,
  type ModeField,
  type ModeId,
} from "@studio137/mode-engine";
import {
  digitString,
  kamea,
  read,
  resolve,
  walk,
  type CipherId,
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
  /**
   * The composition field the concept's `mode` asked for, or `undefined` where
   * no concept rides these letters and the envelope is the whole figure.
   */
  mode: ModeField | undefined;
  marks: readonly PlacedMark[];
  choices: readonly Choice[];
  sheetSvg: string;
  legend: string;
  census: string;
  /**
   * The MODE CENSUS — the fifth text, and the one that carries numbers.
   *
   * The four above grade choices and state derivations; this one reports
   * measurements of a single layer: how many stamps the construction was asked
   * for, how many it placed, what it contracted by, where its ink actually
   * landed, and what each of the other nine modes would have asked the same word
   * for. Every quantity in it is checked by a relation in
   * `tests/mode-engine.test.ts`, the same way `tests/ring.test.ts` checks every
   * quantity in the census and the legend — one text, one auditing suite, so
   * neither table has to know about the other's sentences.
   */
  modeCensus: string;
  receipt: string;
}>;

export type RingOptions = Readonly<{
  square?: SquareId;
  trace?: TraceId;
  /**
   * Which cipher turns a letter into a number. Defaults to `PYTH`.
   *
   * This option did not exist until the instrument grew a CIPHER control and the
   * control did nothing: `ring()` passed the literal `"PYTH"` to `walk()` and
   * three quarters of the picker was decoration. `walk()` has taken a cipher
   * since it was written — the gap was only ever here.
   */
  cipher?: CipherId;
  /** Words the receipt may return. The reader carries no vocabulary of its own. */
  vocabulary?: readonly string[];
  /** Most marks to place around the figure. */
  maxMarks?: number;
  /**
   * Override the composition mode the concept names. `"none"` paints no field at
   * all, which is what every plate in this system looked like before the mode
   * engine existed — the control the contact sheet is read against.
   */
  mode?: ModeId | "none";
}>;

const BOX = 220;
const f = (n: number): string => n.toFixed(4);

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

/** Where the composition mode came from. Same discipline as `SquareSource`. */
type ModeSource = "requested" | "concept" | "none";

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
  // PYTH is the house cipher and stays the default: every plate this system has
  // drawn was drawn on it, and a default that moved would silently rewrite them.
  const cipher = options.cipher ?? "PYTH";
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
  const figure = walk(word, { square, trace, cipher });
  const envelope = envelopeFromWalk(figure);

  // THE MODE RIDES THE SAME WAY THE SQUARE DOES.
  //
  // Every concept in the table has always carried `composition.mode` — `lunar`
  // asks for cymatic, `war` for haring — and nothing read it, so both drew the
  // same figure. It is read here, and it rides on exactly the terms the square
  // rides on: the caller may name one outright, the concept names one otherwise,
  // and a word with NO concept paints no field at all and falls back to the
  // envelope, which is what every plate in this system was.
  //
  // `isModeId` is not decoration. `ModeKey` in the correspondence table and
  // `ModeId` in the mode engine are two separately authored unions over the same
  // ten names — the table's is currently nine, because no concept asks for
  // minimal — and the day one gains a name the other does not, this returns
  // false and the sheet falls back to the envelope instead of throwing on a
  // word. Nothing here may refuse an input.
  const conceptMode = correspondence?.composition.mode;
  const modeSource: ModeSource =
    options.mode !== undefined
      ? "requested"
      : conceptMode !== undefined && isModeId(conceptMode)
        ? "concept"
        : "none";
  const mode: ModeId | undefined =
    options.mode === "none"
      ? undefined
      : options.mode !== undefined
        ? options.mode
        : modeSource === "concept"
          ? (conceptMode as ModeId)
          : undefined;
  const field = mode === undefined ? undefined : fieldFromWalk(figure, mode);

  const marks = placeMarks(correspondence, options.maxMarks ?? 8);
  const choices = gradeChoices(
    figure,
    envelope,
    correspondence,
    squareSource,
    letters,
    field,
    modeSource,
  );

  // The drawing is composed and hashed BEFORE it is annotated, and the hash is
  // the drawing number the annotation prints. A sheet cannot carry the checksum
  // of its own finished bytes — writing the number changes them — so the number
  // identifies the DRAWING: the markup inside `<g id="figure">`, in figure units,
  // before placement. That string is delimited verbatim in the emitted file, so
  // a stranger can cut it out and rehash it without trusting this code.
  const ink = composeFigure(figure, envelope, marks, field);
  const sheetId = sha256Hex(ink).slice(0, 16);

  // Placed once, and the same string is both measured and emitted. The stroke
  // gauge is a verdict on the ink that reaches the paper, so what the annotation
  // measures has to be the bytes the sheet carries and not a reconstruction of
  // them: two spellings of the placement is two answers to "how thin is this
  // plate", and the plate would go on being right while the gauge drifted.
  const placedFigure = placeFigure(ink);

  const sheetSvg = composeSheet(
    placedFigure,
    annotationLayer({
      walk: figure,
      envelope,
      marks,
      choices,
      sheetId,
      placedFigure,
    }),
  );
  // House rule 4, on the finished artifact rather than on any one layer.
  assertNoText(sheetSvg);

  // THE READER IS TOLD THE CIPHER, AND THAT IS NOT CHEATING.
  //
  // House rule 8 says the read is blind: `read()` gets the path data and a word
  // list, never the walk it is trying to recover. The cipher is not part of the
  // walk — it is the convention the plate DECLARES, printed on the first line of
  // its own legend next to the square and the trace. A reader holding the sheet
  // can see it. What the reader still has to do without is which letters were
  // spoken, and it does.
  //
  // This line passed no cipher until `--cipher` existed, which cost nothing while
  // `ring()` hardcoded PYTH and became a silent falsehood the moment it stopped:
  // the receipt read every plate as if it were PYTH, so NAEQ recovered 0 of the
  // 170 vocabulary words and HEB recovered 114. Not because those ciphers are
  // unreadable — because the reader was being handed the wrong key and reporting
  // the miss as a property of the drawing.
  const reading = read(figure.paths, {
    cipher,
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
    mode: field,
    marks,
    choices,
    sheetSvg,
    legend: formatLegend(
      letters,
      figure,
      envelope,
      correspondence,
      marks,
      sheetId,
      squareSource,
      field,
      modeSource,
    ),
    census: formatCensus(choices),
    modeCensus: formatModeCensus(letters, figure, field, modeSource, correspondence),
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
 * The figure, in figure units, before placement.
 *
 * This used to hand the annotation layer a list of every stroke width it had
 * pushed as it emitted, and the annotation printed the thinnest of them. The
 * list was the defect: it recorded the figure's widths and nothing else, so the
 * finest ink on the sheet — the kamea numerals, sized by the order of the
 * square — was never in it, and a `push` forgotten beside a new layer would
 * have gone the same way. The gauge is measured off the emitted markup now
 * (`thinnestStrokeMm`), so there is nothing here to keep in step.
 */
function composeFigure(
  figure: Walk,
  envelope: EnvelopeFamily,
  marks: readonly PlacedMark[],
  field: ModeField | undefined,
): string {
  const layers: string[] = [];

  // THE MODE FIELD, painted FIRST — under the envelope, under the marks, under
  // the walk.
  //
  // MEASURED BEFORE IT WAS ARGUED, because the first version of this comment was
  // wrong. It claimed that a dense field over the chords buries the caustic and
  // makes the plate's own instruction — *count the cusps to check this sheet* —
  // uncheckable. Rendering both orders says otherwise: over three words in all
  // ten modes at 880 px, restacking the two groups changes between 0.19% and
  // 2.94% of the figure's pixels (worst case WAR in lattice, 22,742 of 774,400),
  // and the three cusps of LUNAR's deltoid are countable either way. The stamps
  // are open outlines with thin strokes, so they simply do not occlude much.
  //
  // The order is kept anyway, and the reason is about what is true BY
  // CONSTRUCTION rather than what is true of today's stamps. The envelope's node
  // count was cut to 137 because at Venus's 1225 the caustic vanished into
  // texture and the instruction became a false claim on the artifact. Underneath
  // the chords, no mode can reintroduce that failure — a future stamp with a
  // filled role would occlude the caustic outright from above, and from below it
  // cannot. Every claim the plate made before this layer existed is still
  // checkable with the layer in place, whatever the layer later draws.
  //
  // Every path arrives in figure units with its coordinates already absolute —
  // no transform is opened here, so what the containment test reads off the `d`
  // string is where the ink is.
  //
  // HUE, and exactly what a reader can do with it. It comes through the same
  // `SPECTRUM` the envelope's bands use, and reports which of the walk's
  // distinct cells the stamp stands for. The map from swatch to cell is
  // injective on all 1700 word-by-mode pairs — no two cells ever share a colour,
  // and the ramp has 12 swatches against a largest activated set well inside it.
  // So counting the colours gives you the cells the field STAMPED, which is the
  // whole activated set only when the construction places enough marks to show
  // them: where a field puts at least one stamp per walked letter, all 1501 such
  // pairs recover the activated set exactly, and 1510 of the 1700 recover it in
  // all. The 190 that do not are two modes that structurally cannot — `minimal`
  // draws 3 marks and fails on 161 of the 170 words, `metatron` draws 13 and
  // fails on 29 — and on those the colours are a proper SUBSET of the activated
  // set, never a wrong one.
  //
  // The sentence this replaced said "count the colours and you have the
  // activated set" flatly, which was false for 190 pairs and false for almost
  // every word in the mode the table gives to `stillness`. Its numbers are
  // recomputed in `tests/mode-engine.test.ts`, which reads this comment out of
  // the source and fails on any numeral it cannot produce.
  if (field !== undefined && field.paths.length > 0) {
    layers.push(
      `<g id="mode-${field.mode}" fill="none" stroke-linejoin="round" stroke-linecap="round">` +
        field.paths
          .map((p) => {
            const colour = SPECTRUM[Math.min(SPECTRUM.length - 1, Math.floor(p.hue * SPECTRUM.length))]!;
            return (
              `<path d="${p.d}" stroke="${colour}" stroke-width="${p.strokeWidth}" ` +
              `opacity="${p.opacity.toFixed(3)}"/>`
            );
          })
          .join("") +
        `</g>`,
    );
  }

  const ENVELOPE_STROKE = 0.22;
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
                // scales — the mark's and the sheet placement's. Neither is
                // restated here: the gauge walks those scales off the markup.
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
  layers.push(
    `<g id="walk-line" fill="none" stroke="#ffffff" stroke-width="${WALK_STROKE}" ` +
      `stroke-linejoin="round" stroke-linecap="round">${byRole("line")}</g>`,
    `<g id="walk-loops" fill="none" stroke="#f4b942" stroke-width="${LOOP_STROKE}">${byRole("loop")}</g>`,
    `<g id="walk-caps" fill="none" stroke="#ffffff" stroke-width="${WALK_STROKE}" ` +
      `stroke-linecap="round">${byRole("start-cap")}${byRole("end-cap")}</g>`,
  );

  return layers.join("");
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
function composeSheet(placedFigure: string, annotation: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SHEET_W} ${SHEET_H}" ` +
    `width="${SHEET_W}mm" height="${SHEET_H}mm">` +
    `<rect width="${SHEET_W}" height="${SHEET_H}" fill="#07090c"/>` +
    `${placedFigure}` +
    `<g id="annotation">${annotation}</g>` +
    `</svg>`
  );
}

/**
 * The figure, placed: the one spelling of the drawing field on this sheet.
 *
 * Written once because two consumers need the identical bytes — the sheet emits
 * them, and the annotation layer measures them for the stroke gauge. The
 * closing `</g><!--/figure-->` is part of what is returned, so the delimiter the
 * legend tells a stranger to cut on is produced in the same place as the tag it
 * closes.
 */
function placeFigure(markup: string): string {
  const place = FIGURE_PLACEMENT;
  return (
    `<g id="figure" transform="translate(${f(place.x)} ${f(place.y)}) ` +
    `scale(${f(place.scale)})">${markup}</g><!--/figure-->`
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

/**
 * The mode section of the legend, in prose that carries no numeral.
 *
 * Deliberately, and the reason is a rule this repository already enforces on
 * itself: `tests/ring.test.ts` audits every sentence of the legend and the
 * census, and a sentence that carries a number no relation there can evaluate is
 * a failure — that rule is how the last false derivation was caught. The mode's
 * measured quantities therefore go where a suite audits them, in `modeCensus`,
 * and what the legend says here is what a reader needs in order to know what to
 * look at: which construction painted the field, who chose it, and what the
 * stamps are figures of.
 */
function legendModeSection(
  field: ModeField | undefined,
  modeSource: ModeSource,
  correspondence: ConceptCorrespondence | undefined,
): readonly string[] {
  if (field === undefined) {
    return [
      "THE COMPOSITION MODE",
      correspondence === undefined
        ? "  none. No concept rides these letters, so no composition names a mode and this"
        : "  none. The caller asked for no field, so the concept's mode was not painted and this",
      "  plate carries the envelope and the walk alone — which is every plate this system",
      "  drew before the mode engine read the composition table.",
      "",
    ];
  }
  return [
    "THE COMPOSITION MODE",
    `  mode         ${field.mode}`,
    `  chosen by    ${
      modeSource === "requested"
        ? "the caller, outright"
        : `the concept "${correspondence?.concept ?? "?"}", whose composition names it`
    }`,
    "",
    "  The mode is a CONSTRUCTION, not a style: it decides where the next mark goes.",
    "  Its field is drawn UNDER the envelope, under the correspondence marks and",
    "  under the walk, so nothing this plate could be checked against before the",
    "  layer existed is occluded by it — the cusps of the caustic above all. The",
    "  whole construction is then contracted about the centre of the frame until",
    "  its ink is inside the margin the drawing field keeps clear: the painter it",
    "  was ported from bleeds off its canvas on purpose, and a plate may not.",
    "",
    "  Each mark in the field is a star polygon whose vertex count and whose skip",
    "  are read off the walked cell it stands for, so the field is a figure of the",
    "  cells rather than a pattern laid over them. Its hue reports which of the",
    "  walk's distinct cells that is, on the same ramp the envelope's bands use.",
    "",
    "  Every measured quantity of this layer — the stamps asked for, the stamps",
    "  placed, the contraction, the ink box, and what each of the other modes would",
    "  have asked this word for — is printed on the MODE CENSUS, which is a",
    "  separate text so that every number on it can be checked against the engine.",
    "",
  ];
}

function formatLegend(
  letters: string,
  figure: Walk,
  envelope: EnvelopeFamily,
  correspondence: ConceptCorrespondence | undefined,
  marks: readonly PlacedMark[],
  sheetId: string,
  squareSource: SquareSource,
  field: ModeField | undefined,
  modeSource: ModeSource,
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
    "  paints, measured off the finished markup, against the garment floors in",
    "  scripts/build-print-kit.ts — DTF 0.5 mm, DTG on light 0.6 mm,",
    "  DTG on dark 1.0 mm. This is a paper sheet; those floors are a verdict on a",
    "  second profile, not a pass mark for this one.",
    "",
    "  Measured means measured: every stroke width in the finished bytes, times",
    "  the scales above it, over the figure and this annotation alike — the kamea",
    "  numerals included, which is where the old gauge was wrong. It is rounded",
    "  down to the last place printed, so the number can understate the finest",
    "  ink on the sheet but never overstate it.",
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
    `  with it, so every family draws ${envelope.nodes - 1} chords over ${envelope.nodes - 1} of the ${envelope.nodes} nodes and`,
    `  no multiplier collapses onto a subset. Node 0 — twelve o'clock — maps to itself,`,
    `  so its chord has zero length and is dropped; that one node is bare on every plate.`,
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

  lines.push(...legendModeSection(field, modeSource, correspondence));

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
/**
 * What the mode contributed, and what would differ under a different one.
 *
 * Three choices, and every reason below states a consequence a reader could go
 * and check on a second plate — which is what house rule 6 asks for. They carry
 * no numeral for the reason `legendModeSection` gives: the numbers are on the
 * mode census, where a relation table checks each of them.
 *
 * The alternative named in the first reason is not decorative. It is the mode
 * the CONTACT SHEET is read against, and the sentence says what the two
 * constructions actually do differently — where the stamps land, whether ink
 * reaches the border, whether anything but stamps is drawn — rather than calling
 * one busier than the other.
 */
function gradeModeChoices(
  field: ModeField | undefined,
  modeSource: ModeSource,
  correspondence: ConceptCorrespondence | undefined,
  letters: string,
): readonly Choice[] {
  if (field === undefined) {
    return [
      Object.freeze({
        element: "the composition mode",
        provenance: "control" as const,
        necessity: "free" as const,
        reason:
          modeSource === "requested"
            ? "The caller asked for no field, so no construction painted one and this plate is the envelope and the walk. Name any of the ten and a field of stamps appears over the envelope, every one of them a figure of a walked cell, and the drawing number changes with the ink."
            : `No concept rides ${letters === "" ? "an input with no letters" : `"${letters}"`}, so no composition names a mode and this plate carries the envelope and the walk alone — which is what every plate in this system carried before the mode engine read the composition table. Put these letters in the concept table and the mode it names paints a field over the envelope; nothing about the walk, the cusps or the receipt moves, because none of them is downstream of the field.`,
      }),
    ];
  }

  const other = MODE_IDS[(MODE_IDS.indexOf(field.mode) + 1) % MODE_IDS.length]!;
  const drawsStructure = field.paths.some((p) => p.role === "structure");
  const drawsRadiance = field.paths.some((p) => p.role === "radiance");

  return [
    Object.freeze({
      element: "the composition mode",
      provenance: modeSource === "concept" ? ("walk-derived" as const) : ("control" as const),
      necessity: "load-bearing" as const,
      reason:
        `${
          modeSource === "concept"
            ? `The concept "${correspondence?.concept ?? "?"}" names ${field.mode} in its composition, and until the mode engine existed nothing read that field: every word in the table drew the envelope and the walk and nothing else, whatever mode it asked for.`
            : `The caller named ${field.mode} outright, so no concept chose it.`
        } ${modeSpec(field.mode).label} places its marks by ${modeRuleInWords(field.mode)}${
          drawsStructure
            ? ", and draws the chords of that construction under them"
            : drawsRadiance
              ? ", and rings each mark with the radiance ticks that give the mode its name"
              : ""
        }. Ask for ${other} instead and the same walk, the same cells and the same stamps land by ${modeRuleInWords(other)}: the positions move, the count moves with the mode's own ceiling, the ink box moves, and the drawing number moves with them. What does not move is the walk, the cusp count or the word the receipt hands back — none of them is downstream of the field.`,
    }),
    Object.freeze({
      element: "the mode's stamp",
      provenance: "walk-derived" as const,
      necessity: "load-bearing" as const,
      reason:
        "Each mark is a star polygon whose vertex count and whose skip are read off the walked cell it stands for, and its hue reports which of the walk's distinct cells that is. The painter this mode came from stamps a character picked at random out of a Unicode pool, set in <text>, which carries nothing about the word and cannot be drawn on a plate at all. Flatten every mark here to one shape and the field keeps its positions exactly; what it loses is that the marks differ where the cells differ, so two words walking different cells onto one construction would paint indistinguishable fields.",
    }),
    Object.freeze({
      element: "the field's place in the stack",
      provenance: "control" as const,
      necessity: "answerable" as const,
      reason:
        "The field is painted under the envelope, under the correspondence marks and under the walk. Swap it above the chords and almost nothing on this sheet moves — that was rendered both ways for three words in all ten modes, and the worst case is recorded in composeFigure; the stamps are open outlines with thin strokes, so the caustic reads through them either way. It is kept underneath for what stays true by construction rather than for what is true of today's stamps: the plate's instruction is to count the cusps to check the sheet, and a mode whose marks were filled rather than outlined would bury the caustic from above and could not from below. That is the same failure the node count was reduced to avoid, reached by another route.",
    }),
    Object.freeze({
      element: "the mode's contraction",
      provenance: "control" as const,
      necessity: field.contraction < 1 ? ("load-bearing" as const) : ("answerable" as const),
      // Which of the three sentences is true is decided by the field's REACH,
      // not by whether it contracted at all. The first draft said "remove the
      // contraction and this field's ink crosses the viewBox" on every
      // contracted plate, and that is false wherever the construction only
      // crossed the margin — which is most of them. The reach is printed on the
      // mode census so a reader can check which case this plate is in.
      reason:
        field.contraction >= 1
          ? "This construction already fitted the drawing field, so the contraction is the identity and deleting it would not move one mark of this sheet. It is recorded because of what it does elsewhere: the golden-angle packing puts its outermost seed near the edge of the frame and then draws a mark centred on it, and that mark's ink leaves the margin the drawing field keeps clear."
          : field.reach > BOX / 2
            ? "The construction reached past the frame itself, so the whole of it is scaled about the centre until its ink is inside. Scaled rather than clamped mark by mark: a contracted spiral is the same spiral drawn smaller, a clamped one is a spiral with a rim of marks piled against the border. Remove the contraction and this field's outermost ink crosses the viewBox the sheet declares — which a browser crops into looking correct and a printer does not."
            : "The construction fitted inside the frame but reached across the margin the drawing field keeps clear, so the whole of it is scaled about the centre until its ink is back inside that margin. Scaled rather than clamped mark by mark: a contracted spiral is the same spiral drawn smaller, a clamped one is a spiral with a rim of marks piled against the border. Remove the contraction here and no ink leaves the viewBox — what it loses is the clear band the correspondence marks are placed in, and the outermost stamps sit on the border of the drawing field.",
    }),
  ];
}

/** The construction in words, with no numeral in it. See `legendModeSection`. */
function modeRuleInWords(mode: ModeId): string {
  switch (mode) {
    case "phyllotaxis":
      return "a golden-angle packing, each mark one turn of the angle further round and one step further out";
    case "lattice":
      return "a hexagonal grid, every mark equidistant from six neighbours";
    case "metatron":
      return "the nodes of Metatron's Cube — a centre and two concentric hexagons";
    case "organic":
      return "a dart-throw that rejects any mark falling within one exclusion radius of a mark already placed";
    case "cymatic":
      return "the nodal set of a standing wave, keeping only the places where the wave is at rest";
    case "attractor":
      return "an orbit of the de Jong map, sampled along its own path";
    case "mandelbrot":
      return "the escape-time boundary of the Mandelbrot set, keeping only the points that neither escape at once nor survive to the iteration ceiling";
    case "chaos":
      return "an unstructured draw over the whole frame, with the mark sizes cubed so most are small and a few are very large";
    case "haring":
      return "a grid jittered inside its own cells, tilted the opposite way on every other cell";
    case "minimal":
      return "the golden section, one large mark with at most two satellites and the rest of the frame left empty";
    default:
      return "its own construction";
  }
}

function gradeChoices(
  figure: Walk,
  envelope: EnvelopeFamily,
  correspondence: ConceptCorrespondence | undefined,
  squareSource: SquareSource,
  letters: string,
  field: ModeField | undefined,
  modeSource: ModeSource,
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
    ...gradeModeChoices(field, modeSource, correspondence, letters),
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

/**
 * THE MODE CENSUS — the measured half of what the mode did.
 *
 * Every line here is a quantity read back off the field the sheet actually
 * painted, and every one is checked by a relation in `tests/mode-engine.test.ts`
 * — including the coverage rule that fails a sentence carrying a number no
 * relation can evaluate. That discipline is copied from `tests/ring.test.ts`
 * rather than invented: it is what caught the last false derivation in this
 * repository, and a new text with new numbers and no such suite would be the
 * sixth.
 *
 * The counterfactual table at the end is the census's answer to "what would
 * differ under a different mode". It is not an adjective: for each of the ten
 * constructions it prints what THIS word would have asked that construction for
 * and how large its marks would have been, both computed by the engine's own
 * `requestedFor` and `baseStampRadius` — so the comparison is arithmetic a
 * reader can redo, not a claim that one mode is busier than another.
 */
function formatModeCensus(
  letters: string,
  figure: Walk,
  field: ModeField | undefined,
  modeSource: ModeSource,
  correspondence: ConceptCorrespondence | undefined,
): string {
  const ctx = contextFromWalk(figure);
  const head = `MODE CENSUS — ${sheetName(letters)}`;
  if (field === undefined) {
    return (
      [
        head,
        "",
        modeSource === "requested"
          ? "  no field. The caller asked for none, so no construction ran."
          : `  no field. ${
              correspondence === undefined
                ? "No concept rides these letters, so no composition names a mode."
                : "This concept names no mode this engine implements."
            }`,
        "",
        "  This plate is the envelope and the walk — what every plate in this system was",
        "  before the composition table was read. The counterfactual below is therefore",
        "  the whole of the difference a mode would make.",
        "",
        `  the walk reduces to    ${ctx.reduced}`,
        "",
        "  WHAT EACH MODE WOULD ASK THIS WORD FOR",
        "  mode          stamps   mark radius",
        ...MODE_IDS.map(
          (m) =>
            `  ${m.padEnd(13)} ${String(requestedFor(m, ctx.reduced)).padStart(4)}   ` +
            `${baseStampRadius(m).toFixed(2)}`,
        ),
        "",
      ].join("\n") + "\n"
    );
  }

  const spec = modeSpec(field.mode);
  const box = field.inkBounds;
  const byRole = (role: string): number => field.paths.filter((p) => p.role === role).length;
  // TWO hue populations, and they report different quantities, so they are
  // printed as two numbers. A stamp's hue is the rank of its cell in the walk's
  // activated set — a readout of the word. A structure chord's hue is the rank of
  // its LENGTH among the distinct chord lengths of the construction — a readout
  // of the construction. Summed into one figure they contradicted the sentence
  // printed beside them: Metatron's LUNAR plate showed 10 hues over a walk with 4
  // activated cells, and the census called the first a reading of the second.
  const stampHues = new Set(
    field.paths.filter((p) => p.role !== "structure").map((p) => p.hue),
  ).size;
  const structureHues = new Set(
    field.paths.filter((p) => p.role === "structure").map((p) => p.hue),
  ).size;

  const lines: string[] = [
    head,
    `mode ${field.mode} · ${spec.label} · ${spec.rule}`,
    `chosen by ${
      modeSource === "requested"
        ? "the caller"
        : `the concept "${correspondence?.concept ?? "?"}"`
    }`,
    "",
    "WHAT THIS FIELD IS",
    `  seed                   ${field.seed}`,
    `  the walk reduces to    ${ctx.reduced}`,
    `  stamps asked for       ${field.requested}   (this mode's ceiling is ${field.cap})`,
    `  stamps placed          ${field.nodes.length}`,
    `  paths emitted          ${field.paths.length}   = ${byRole("field")} field · ${byRole("structure")} structure · ${byRole("radiance")} radiance`,
    `  hues on the stamps     ${stampHues}   (the walk activates ${figure.activatedCells.length} distinct cells)`,
    ...(structureHues === 0
      ? []
      : [`  hues on the structure  ${structureHues}   (distinct chord lengths in the construction)`]),
    `  mark radius            ${field.stampRadius.toFixed(4)}   (this mode's base radius is ${baseStampRadius(field.mode).toFixed(4)})`,
    `  contraction            ${field.contraction.toFixed(6)}`,
    `  reach before it        ${field.reach.toFixed(3)}   (the frame's half-width is ${figure.viewBox[2] / 2})`,
    `  ink box                ${box.map((v) => v.toFixed(3)).join("  ")}`,
    `  the frame it is in     0  0  ${figure.viewBox[2]}  ${figure.viewBox[3]}`,
    "",
    "  The seed is FNV-1a over the walk itself — its cells, their sum, its activated",
    "  set, its letter count, the order of its square and the mode's own index — so",
    "  two spellings of one word are one walk and paint one field. The painter this",
    "  mode came from hashes the typed string instead, and a trailing space moves it.",
    "",
    "  The count is the mode's ceiling times its authored density, scaled by the",
    "  walk's reduction against 5 — the painter's own slider position. Rejection",
    "  samplers may place fewer than were asked for and grids may round up, which is",
    "  why both numbers are printed.",
    "",
    "  Every coordinate above is in figure units, absolute, straight off the emitted",
    "  path data. The ink box is measured from the bytes the sheet carries, not",
    "  reconstructed — so it is the box the drawing is actually in.",
    "",
    "WHAT EACH MODE WOULD ASK THIS WORD FOR",
    "  mode          stamps   mark radius",
    ...MODE_IDS.map(
      (m) =>
        `  ${m.padEnd(13)} ${String(requestedFor(m, ctx.reduced)).padStart(4)}   ` +
        `${baseStampRadius(m).toFixed(2)}${m === field.mode ? "   <- this sheet" : ""}`,
    ),
    "",
    "SIGNED CONSTANTS OF THIS CONSTRUCTION",
    "  Every number the painter chose without deriving it, with what a reader would",
    "  measure differently if it were flipped. `walk` marks the ones this port",
    "  replaced with a quantity the word produces; `painter` the ones it kept.",
    "",
  ];
  for (const s of spec.signatures) {
    lines.push(`  ${s.constant}`, `    ${s.origin} · ${s.value}`, `    ${s.reason}`, "");
  }
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
    // A CEILING IS NOT A COUNT. `read()` stops expanding loop placements at a
    // work bound, and this line printed whatever survived it as though it were
    // the total: the saturn figure of ABBAABBAABBAABBAABBAABBA admits 72
    // readings and the receipt said 64, flat. When the bound was reached the
    // number is a floor and says so, and the sentence below says what the
    // missing readings could have cost — a word one of them spells is a word
    // this receipt cannot return.
    `  readings the figure admits        ${reading.readingsClipped ? "at least " : ""}${reading.readings.length}${reading.ambiguousLoops ? "  (ambiguous: a cell is revisited from the same direction)" : ""}`,
    ...(reading.readingsClipped
      ? [
          "                                    Expansion hit its ceiling, so that is a floor and not",
          "                                    a total: readings this figure admits were never",
          "                                    expanded, and a word one of them spells cannot appear",
          "                                    below.",
        ]
      : []),
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

/**
 * Build `artifacts/ring/index.html` — the single page that wraps THE RING.
 *
 * The page exists to make one claim checkable without trusting the caption:
 * every sheet prints its cusp count as a number beside the figure that draws it,
 * and the figure's caustic has exactly that many points. A reader counts the
 * lobes and either the number holds or it does not. Nothing else on the page is
 * asked to be taken on faith.
 *
 * The page is generated, never hand-edited. Everything on it comes out of
 * `ring()`; this script only arranges. Run it twice and the bytes are identical —
 * asserted below rather than hoped for, since a page that drifts between runs
 * cannot be the witness for a determinism claim.
 *
 * Usage:  pnpm exec tsx scripts/build-ring-page.ts [--out artifacts/ring/index.html]
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { sha256Hex } from "@studio137/plate-core";
import { WORD_CORRESPONDENCE } from "@studio137/glyph-registry";
import { read } from "@studio137/walk-engine";
import { ring, SPECTRUM, type RingArtifacts } from "@studio137/ring";

/**
 * The words on the sheet.
 *
 * Four carry concepts and one does not. SWEATSHOP is the control: it is in no
 * concept table and in no vocabulary, so if resolution were gated anywhere it
 * would fail here and nowhere else. It resolves, walks, and draws like the rest;
 * only the receipt's final line — the word handed back — comes up empty. That is
 * house rule 3 shown rather than asserted, and it is why the control is on the
 * page instead of in a test nobody reads.
 */
const WORDS: readonly string[] = ["DESCENT", "FALL", "ACE", "LONGING", "SWEATSHOP"];

/**
 * The reader's vocabulary: the concept table's own words, nothing added.
 *
 * The read station carries no vocabulary of its own (house rule 8) — it is handed
 * one from outside, and hands back whichever of those words the geometry admits.
 * Passing the concept table is what makes SWEATSHOP's empty return meaningful:
 * the list it was checked against is the same list the other four were checked
 * against, so the empty line reports absence from the vocabulary and not a
 * different, weaker test.
 */
const VOCABULARY: readonly string[] = WORD_CORRESPONDENCE.map((w) => w.word);

const esc = (s: string): string =>
  s.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/gu, "-");

/* ── gathering ───────────────────────────────────────────────────────────── */

type Row = Readonly<{
  word: string;
  artifacts: RingArtifacts;
  /** sha256 of the four artifacts concatenated, from the second run. */
  digest: string;
  /**
   * The blind read of this row's own plate, from `read()` in the walk engine —
   * the same call the receipt makes, on the same paths, with the same
   * vocabulary. Called here so the page's own copy is written from structured
   * data instead of scraped out of the receipt's formatting; the engine stays
   * the one authority on what a drawing says (house rule 1).
   */
  reading: ReturnType<typeof read>;
  /** In the concept table — the thing that picks a square. */
  hasConcept: boolean;
  /** In the vocabulary the reader was handed. */
  inVocabulary: boolean;
}>;

/**
 * Run `ring()` twice per word and compare the bytes.
 *
 * Determinism is the product, so the build refuses to emit a page it cannot
 * stand behind. If the two runs disagree the difference is in the engine, and a
 * page built from run one would quietly publish whichever half happened to go
 * first.
 */
function gather(words: readonly string[]): readonly Row[] {
  return words.map((word) => {
    const first = ring(word, { vocabulary: VOCABULARY });
    const second = ring(word, { vocabulary: VOCABULARY });
    const bytes = (a: RingArtifacts): string =>
      // A NUL separator, so no arrangement of the four artifacts can be mistaken
      // for another: the delimiter cannot occur inside any of them.
      [a.sheetSvg, a.legend, a.census, a.receipt].join("\u0000");
    const a = bytes(first);
    const b = bytes(second);
    if (a !== b) {
      throw new Error(
        `NON-DETERMINISTIC: two ring() runs for ${word} produced different bytes ` +
          `(${sha256Hex(a).slice(0, 16)} vs ${sha256Hex(b).slice(0, 16)}).`,
      );
    }
    if (first.sheetId !== second.sheetId) {
      throw new Error(`NON-DETERMINISTIC: sheet id drifted for ${word}.`);
    }
    return {
      word,
      artifacts: second,
      digest: sha256Hex(b),
      reading: read(second.walk.paths, { vocabulary: VOCABULARY }),
      hasConcept: second.correspondence !== undefined,
      inVocabulary: VOCABULARY.some((v) => v.toUpperCase() === word.toUpperCase()),
    };
  });
}

/**
 * House rule 4, enforced at build time.
 *
 * A `<text>` element in a plate means the drawing outsourced a number to a font,
 * and a number that arrives as a font is not derived — it is typed. The
 * constructed numeral set exists precisely so no plate ever needs one. `<tspan>`
 * and `<foreignObject>` are checked too: both are the same escape hatch wearing a
 * different tag.
 */
function assertNoTextInPlates(rows: readonly Row[]): void {
  const offenders: string[] = [];
  for (const row of rows) {
    for (const tag of ["text", "tspan", "textPath", "foreignObject"]) {
      const hits = row.artifacts.sheetSvg.match(new RegExp(`<${tag}[\\s>/]`, "gu"));
      if (hits !== null) offenders.push(`${row.word}: ${hits.length}×<${tag}>`);
    }
  }
  if (offenders.length > 0) {
    throw new Error(`PLATE CARRIES TEXT (house rule 4): ${offenders.join(", ")}`);
  }
}

/* ── the page ────────────────────────────────────────────────────────────── */

/**
 * The rule colour under each word's heading, taken from the plate's own spectrum
 * and indexed by that word's cusp count.
 *
 * Hue is a readout, never a filter (house rule 5). Two words that draw the same
 * cusp count get the same colour here because they draw the same envelope — the
 * colour is reporting a collision, not decorating a card. Nothing on this page
 * varies by hue for any reason that is not a counted quantity.
 */
function accentFor(cusps: number): string {
  return SPECTRUM[cusps % SPECTRUM.length]!;
}

/**
 * A text artifact, printed whole, in one `<pre>` — the block is the artifact,
 * not a set of rows to restyle.
 *
 * The `<pre>` wraps rather than clipping. All three blocks now mix aligned
 * columns with paragraphs; the longest line is 141 characters, and at the widths
 * this page uses on a desktop nothing wraps at all, so the columns stay in
 * column. At 375px the paragraphs reflow and the columnar rows — none wider than
 * about 48 characters — still fit on one line. The alternative was a horizontal
 * scrollbar on every prose line on a phone, which is a line nobody reads. The
 * bytes are identical either way: this is the census, legend and receipt
 * `ring()` emitted, character for character, `.trimEnd()` on the trailing
 * newline aside.
 */
function readout(title: string, note: string, body: string): string {
  return (
    `<section class="readout">` +
    `<h3 class="readout-head"><span class="readout-name">${esc(title)}</span>` +
    `<span class="readout-note">${esc(note)}</span></h3>` +
    `<div class="scroller"><pre>${esc(body).trimEnd()}</pre></div>` +
    `</section>`
  );
}

/**
 * The four steps a word passes through, each with what it actually produced.
 *
 * This strip is the page's answer to the question the control word raises.
 * Resolve, walk and draw report a quantity for every word on the page, in
 * vocabulary or out of it; only *return* can come back empty, because only
 * return consults a word list. Printing all four side by side for all five words
 * makes that a comparison a reader performs rather than a claim they accept — an
 * absence in the fourth column with three full columns to its left is a
 * different fact from a word that failed to resolve.
 */
function chain(row: Row): string {
  const a = row.artifacts;
  const r = row.reading;
  const matched = r.matches.includes(row.word.toUpperCase());
  const cellsHold = r.cells.join("·") === a.walk.steps.map((s) => s.cell).join("·");

  const steps: readonly (readonly [string, string, string, string])[] = [
    [
      "resolve",
      `${a.walk.steps.length}/${row.word.length} letters`,
      a.walk.steps.length === row.word.length ? "ok" : "other",
      a.walk.steps.map((s) => `${s.letter}=${s.value}`).join(" "),
    ],
    [
      "walk",
      `${a.walk.segmentCount} segments`,
      "ok",
      `${a.walk.loopCount} loop${a.walk.loopCount === 1 ? "" : "s"} · ` +
        `cells ${a.walk.steps.map((s) => s.cell).join("·")}`,
    ],
    [
      "draw",
      `${a.envelope.chordCount} chords`,
      "ok",
      `${a.walk.paths.length} walk paths · ${a.marks.length} marks`,
    ],
    [
      "return",
      matched ? row.word : r.matches.length > 0 ? r.matches.join(", ") : "nothing",
      matched ? "ok" : r.matches.length > 0 ? "other" : "empty",
      matched
        ? "the spoken word came back"
        : r.matches.length > 0
          ? `a collision: ${r.matches.join(", ")} draw${r.matches.length === 1 ? "s" : ""} these cells too`
          : "no vocabulary entry draws these cells",
    ],
  ];

  return (
    `<div class="chain">` +
    steps
      .map(
        ([name, value, state, note]) =>
          `<div class="step is-${state}">` +
          `<div class="step-k">${esc(name)}</div>` +
          `<div class="step-v">${esc(value)}</div>` +
          `<div class="step-n">${esc(note)}</div>` +
          `</div>`,
      )
      .join("") +
    `</div>` +
    `<p class="chain-say">Cells recovered from the drawing alone ` +
    `${cellsHold ? "match" : "<b>do not match</b>"} the cells walked` +
    `${r.readings.length === 1 ? ", and the figure admits one reading" : `, across ${r.readings.length} readings the figure admits`}. ` +
    `Resolution never consulted a list; only the fourth step did.</p>`
  );
}

function card(row: Row): string {
  const a = row.artifacts;
  const id = slug(row.word);
  const accent = accentFor(a.envelope.cusps);
  const c = a.correspondence;
  const matched = row.reading.matches.includes(row.word.toUpperCase());

  const vocab = row.inVocabulary ? "in vocabulary" : "<b>in no vocabulary</b>";
  const standing =
    c !== undefined
      ? `concept <b>${esc(c.concept)}</b> rides planet <b>${esc(c.planet)}</b>, ` +
        `which chose the square · ${vocab}`
      : `no concept table entry · house square · ${vocab}`;

  const facts: readonly (readonly [string, string])[] = [
    ["sheet", a.sheetId],
    ["square", `${a.walk.square} ${a.walk.order}×${a.walk.order}`],
    ["cipher", a.walk.cipher],
    ["trace", a.walk.trace],
    ["nodes", String(a.envelope.nodes)],
    ["multiplier", String(a.envelope.multiplier)],
    ["chords", String(a.envelope.chordCount)],
    ["marks", String(a.marks.length)],
  ];

  return (
    `<article class="card" id="${id}" style="--accent:${accent}">` +
    `<header class="card-head">` +
    `<h2>${esc(row.word)}<a class="up" href="#top">index ↑</a></h2>` +
    `<p class="card-sub">${standing}</p>` +
    `</header>` +

    (row.inVocabulary && matched
      ? ""
      : `<p class="control-note">` +
        (row.inVocabulary ? `<b>Reported, not resolved.</b> ` : `<b>Outside the vocabulary.</b> `) +
        `${esc(row.word)} is in ${row.hasConcept ? "the concept table but " : "no concept table and in "}` +
        `${row.inVocabulary ? "the vocabulary" : "no vocabulary the reader was handed"}. ` +
        `It resolved anyway, walked ${a.walk.segmentCount} segments on the ` +
        `${esc(a.walk.square)} square, and drew ${a.envelope.chordCount} chords into a ` +
        `${a.envelope.cusps}-cusp envelope. The blind read recovered its cells exactly. ` +
        `Only the last step — the word handed back from a word list — came up ` +
        `<b>${esc(
          row.reading.matches.length === 0
            ? "nothing"
            : `${row.reading.matches.join(", ")}, not ${row.word}`,
        )}</b>. Letters resolve; concepts ride. Nothing gates resolution, so the ` +
        `gap shows up where it belongs — in the return, on the record.</p>`) +
    chain(row) +

    `<div class="card-top">` +

    `<div class="plate-col">` +
    `<div class="scroller plate">${a.sheetSvg}</div>` +
    `</div>` +

    `<div class="side-col">` +

    `<div class="claim">` +
    `<div class="claim-n" aria-hidden="true">${a.envelope.cusps}</div>` +
    `<div class="claim-t">` +
    `<b>${a.envelope.cusps} cusps.</b> Count the points of the caustic in the figure ` +
    `above. The chord family joins node <i>i</i> to node ` +
    `<i>${a.envelope.multiplier}i</i> mod ${a.envelope.nodes}; such a family is ` +
    `tangent to an epicycloid with exactly ${a.envelope.multiplier} − 1 = ` +
    `${a.envelope.cusps} cusps. The multiplier is the theosophic reduction of ` +
    `${esc(row.word)}'s walked cells, plus one. If the count you make and the ` +
    `number printed here disagree, the caption is wrong and the sheet is void.` +
    `</div></div>` +

    `<dl class="facts">` +
    facts
      .map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`)
      .join("") +
    `</dl>` +
    readout("RECEIPT", "read blind — geometry and public rules alone", a.receipt) +
    `</div>` +

    `</div>` +

    readout("LEGEND", "where every mark came from", a.legend) +
    readout("CENSUS", "every choice, graded, with a prediction", a.census) +

    `</article>`
  );
}

const STYLE = `
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body {
  margin: 0;
  /* Near-black ground, bone foreground: the same values the plates are drawn on,
     so the page does not report a different studio than the artifact does. */
  background: #07090c;
  color: #e6e1d6;
  font: 13px/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, "DejaVu Sans Mono", monospace;
  overflow-x: hidden;
}
a { color: inherit; }
h1, h2, h3 { font-weight: 600; margin: 0; letter-spacing: 0.02em; }
b { font-weight: 600; }
.wrap { max-width: 1180px; margin: 0 auto; padding: 28px 16px 64px; }
.dim { color: #7f8b98; }

header.masthead { border-bottom: 1px solid #1b2129; padding-bottom: 22px; }
.masthead h1 { font-size: 20px; letter-spacing: 0.22em; }
.mast { display: grid; grid-template-columns: minmax(0, 1fr); gap: 20px; margin-top: 16px; }
@media (min-width: 1000px) {
  .mast { grid-template-columns: minmax(0, 1fr) minmax(0, 400px); gap: 28px; align-items: start; }
}
.lede-col { min-width: 0; }
.lede { max-width: 72ch; margin: 0; color: #b9b3a7; }
.lede + .lede { margin-top: 11px; }

.stamp {
  border: 1px solid #1b2129; background: #0a0d11; padding: 11px 13px;
  display: grid; gap: 6px; align-content: start;
  font-size: 12px; color: #8b95a1; min-width: 0;
}
.stamp b { color: #e6e1d6; font-weight: 600; }
.stamp code { color: #b9b3a7; word-break: break-all; }
.stamp-note { color: #6f7a86; font-size: 11px; border-top: 1px solid #161c23; padding-top: 6px; }

nav.index { display: flex; flex-wrap: wrap; gap: 8px; margin: 20px 0 4px; }
nav.index a {
  border: 1px solid #1b2129; padding: 5px 10px; text-decoration: none;
  color: #b9b3a7; font-size: 12px; letter-spacing: 0.08em;
}
nav.index a:hover, nav.index a:focus-visible { border-color: #3a444f; color: #e6e1d6; }

.card { border-top: 1px solid #1b2129; padding-top: 26px; margin-top: 34px; }
.card:first-child { border-top: 0; margin-top: 26px; padding-top: 0; }
.card-head h2 {
  font-size: 26px; letter-spacing: 0.16em;
  border-left: 3px solid var(--accent); padding-left: 10px;
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px 16px;
}
.up {
  font-size: 11px; letter-spacing: 0.12em; font-weight: 400;
  color: #6f7a86; text-decoration: none;
}
.up:hover, .up:focus-visible { color: #e6e1d6; }
.card-sub { margin: 8px 0 0 13px; color: #8b95a1; }

.card-top { display: grid; grid-template-columns: minmax(0, 1fr); gap: 22px; margin-top: 22px; }
@media (min-width: 1000px) {
  .card-top { grid-template-columns: minmax(0, 560px) minmax(0, 1fr); gap: 26px; align-items: start; }
}
.plate-col, .side-col { min-width: 0; }

/* Wide content scrolls inside its own box; the body never scrolls sideways. */
.scroller { overflow-x: auto; overflow-y: hidden; max-width: 100%; scrollbar-width: thin; }
.scroller::-webkit-scrollbar { height: 8px; }
.scroller::-webkit-scrollbar-track { background: #0a0d11; }
.scroller::-webkit-scrollbar-thumb { background: #333d48; }
.scroller { scrollbar-color: #333d48 #0a0d11; }
.plate { border: 1px solid #1b2129; background: #07090c; line-height: 0; }
.plate svg { display: block; width: 100%; height: auto; max-width: 100%; }

.claim {
  display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 12px;
  align-items: start; padding: 12px;
  border: 1px solid #232b34; background: #0a0d11;
}
.claim-n {
  font-size: 40px; line-height: 1; font-weight: 600;
  color: var(--accent); font-variant-numeric: tabular-nums;
  padding-right: 12px; border-right: 1px solid #232b34;
}
.claim-t { color: #b9b3a7; font-size: 12px; }
.claim-t b { color: #e6e1d6; }

.facts {
  margin: 12px 0 0; display: grid; gap: 1px; background: #161c23;
  border: 1px solid #161c23;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
}
.facts > div { background: #0a0d11; padding: 7px 9px; min-width: 0; }
.facts dt { color: #7f8b98; font-size: 11px; letter-spacing: 0.1em; }
.facts dd { margin: 2px 0 0; overflow-wrap: anywhere; }

.control-note {
  margin: 18px 0 0; padding: 12px; border: 1px solid #3a3326; background: #0f0d09;
  color: #cfc6b2; font-size: 12px; max-width: 100ch;
}
.control-note b { color: #f4b942; }

.chain {
  display: grid; gap: 1px; background: #161c23; border: 1px solid #161c23;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  margin: 18px 0 6px;
}
@media (min-width: 760px) { .chain { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.step { background: #0a0d11; padding: 9px 10px; min-width: 0; border-top: 2px solid #2a323b; }
.step-k { color: #7f8b98; font-size: 11px; letter-spacing: 0.14em; }
.step-v { margin-top: 3px; font-size: 14px; overflow-wrap: anywhere; }
.step-n { margin-top: 4px; color: #6f7a86; font-size: 11px; overflow-wrap: anywhere; }
.step.is-ok { border-top-color: #5ef2c4; }
.step.is-ok .step-v { color: #e6e1d6; }
.step.is-other { border-top-color: #f4b942; }
.step.is-other .step-v { color: #f4b942; }
.step.is-empty { border-top-color: #4a5460; }
.step.is-empty .step-v { color: #7f8b98; }
.chain-say { margin: 0; color: #7f8b98; font-size: 11px; max-width: 110ch; }
.chain-say b { color: #f4b942; }

.readout { margin-top: 18px; }
.readout-head {
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 12px;
  font-size: 12px; letter-spacing: 0.18em; padding-bottom: 6px;
  border-bottom: 1px solid #1b2129;
}
.readout-note { letter-spacing: 0; color: #7f8b98; font-size: 11px; }
.readout .scroller { border: 1px solid #1b2129; border-top: 0; background: #0a0d11; }
/* Prose reflows rather than hiding behind a scrollbar; a continuation returns
   to the left margin, so a wrap is never mistaken for a new entry. Nothing
   wraps at desktop widths, where the columns stay in column. */
pre {
  margin: 0; padding: 12px; font: inherit; font-size: 12px;
  color: #cdc7ba; white-space: pre-wrap; overflow-wrap: anywhere; tab-size: 2;
}

footer.colophon {
  margin-top: 46px; border-top: 1px solid #1b2129; padding-top: 18px;
  color: #7f8b98; font-size: 12px; max-width: 78ch;
}
.colophon p { margin: 0 0 11px; }
.colophon b { color: #f4b942; }

@media (max-width: 480px) {
  .wrap { padding: 20px 12px 48px; }
  .masthead h1 { font-size: 16px; letter-spacing: 0.16em; }
  .card-head h2 { font-size: 21px; }
  .claim-n { font-size: 32px; }
  pre { font-size: 11px; }
}
`;

/**
 * A discrepancy the page can see for itself, printed only while it is true.
 *
 * The legend still says the node count is `magic constant × order`. Every plate
 * on this page reports 137 nodes across three different squares of two different
 * orders, so that sentence cannot describe what drew these figures — the engine
 * fixed NODES at 137 and the caption did not follow. The condition is tested
 * against the emitted bytes rather than hard-coded, so when the legend is
 * corrected upstream this paragraph stops appearing on the next build instead of
 * becoming a second stale claim on top of the first.
 */
function nodeCaptionDrift(rows: readonly Row[]): string {
  const claimsDerivation = rows.some((r) => r.artifacts.legend.includes("magic constant × order"));
  const nodes = new Set(rows.map((r) => r.artifacts.envelope.nodes));
  const orders = new Set(rows.map((r) => r.artifacts.walk.order));
  if (!claimsDerivation || nodes.size !== 1 || orders.size < 2) return "";
  const n = [...nodes][0]!;
  return (
    `<p><b>One caption on this page is stale, and the page can prove it.</b> Each ` +
    `legend prints “nodes = magic constant × order”. Every plate here reports ` +
    `${n} nodes, across ${orders.size} different square orders ` +
    `(${[...orders].sort((x, y) => x - y).join(", ")}) — a product that varies with ` +
    `order cannot come out the same number every time. The node count is fixed at ` +
    `${n}; the legend sentence describes a superseded derivation. Reported here ` +
    `rather than quietly patched, because the legend is not this page's to edit. ` +
    `This paragraph is emitted only while the mismatch is in the bytes.</p>`
  );
}

function page(rows: readonly Row[], corpusDigest: string): string {
  const plates = rows.length;
  const cuspList = rows.map((r) => `${r.word} ${r.artifacts.envelope.cusps}`).join(" · ");

  return (
    `<!doctype html>\n<html lang="en">\n<head>\n` +
    `<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">\n` +
    `<title>THE RING — sheet, legend, census, receipt</title>\n` +
    `<style>${STYLE}</style>\n</head>\n<body>\n<div class="wrap">\n` +

    `<header class="masthead" id="top">` +
    `<h1>THE RING</h1>` +
    `<div class="mast">` +

    `<div class="lede-col">` +
    `<p class="lede">One word in, four artifacts out. The <b>sheet</b> is the ` +
    `painted plate; the <b>legend</b> numbers every mark back to the codex entry ` +
    `and the rule that placed it; the <b>census</b> grades every choice and records ` +
    `a prediction for each; the <b>receipt</b> reads the mark back blind and returns ` +
    `the word. A sheet on its own is a picture, and a picture cannot be checked.</p>` +
    `<p class="lede"><b>Check the figures against their captions.</b> Every plate ` +
    `prints a cusp count, and the caustic in that plate has exactly that many ` +
    `points. Count them. If a count disagrees with its number, the sheet is void — ` +
    `that is the whole of what this page asks you to take on trust, and it asks you ` +
    `not to.</p>` +
    `<p class="lede">Each word also carries a four-step chain — <b>resolve</b>, ` +
    `<b>walk</b>, <b>draw</b>, <b>return</b>. The first three report a number for ` +
    `every word here, including the ones no table has heard of; only the fourth ` +
    `consults a word list, so only the fourth can come back empty.</p>` +
    `</div>` +

    `<aside class="stamp">` +
    `<div><b>plates</b> ${plates}</div>` +
    `<div><b>cusps</b> ${esc(cuspList)}</div>` +
    `<div><b>determinism</b> ring() run twice per word, bytes compared — identical</div>` +
    `<div><b>&lt;text&gt; in plates</b> 0 · house rule 4, asserted at build</div>` +
    `<div><b>assets</b> none — no font, no script, no network</div>` +
    `<div><b>vocabulary</b> ${VOCABULARY.length} words, from the concept table</div>` +
    `<div><b>corpus digest</b><br><code>${esc(corpusDigest)}</code></div>` +
    `<div class="stamp-note">sha256 over every sheet, legend, census and receipt on ` +
    `this page. Rebuild from the same commit and this line does not move.</div>` +
    `</aside>` +

    `</div>` +
    `<nav class="index">` +
    rows.map((r) => `<a href="#${slug(r.word)}">${esc(r.word)}</a>`).join("") +
    `</nav>` +
    `</header>\n` +

    `<main>\n${rows.map(card).join("\n")}\n</main>\n` +

    `<footer class="colophon">` +
    nodeCaptionDrift(rows) +
    `<p>Generated by <code>scripts/build-ring-page.ts</code>. The page is an ` +
    `output, not a source — edit the script, never the HTML.</p>` +
    `<p>The rule colour beside each word is <code>SPECTRUM[cusps]</code>, the ` +
    `plate's own ramp indexed by that plate's cusp count. Two words that draw the ` +
    `same envelope get the same colour here, because they are the same envelope. ` +
    `The chain's step colours are the same discipline: green where a step returned ` +
    `the word, amber where it returned a different word, grey where it returned ` +
    `nothing. Hue is a readout, never a filter — flatten it and the page loses ` +
    `information, not decoration.</p>` +
    `<p>The receipt is read blind: path data and a vocabulary, nothing else. It ` +
    `never sees the private manifest or the master key, so what it returns is what ` +
    `a stranger holding the printed sheet could get.</p>` +
    `</footer>\n` +

    `</div>\n</body>\n</html>\n`
  );
}

/* ── entry ───────────────────────────────────────────────────────────────── */

function main(argv: readonly string[]): void {
  const outFlag = argv.indexOf("--out");
  const out = resolve(
    outFlag !== -1 && argv[outFlag + 1] !== undefined
      ? argv[outFlag + 1]!
      : "artifacts/ring/index.html",
  );

  const rows = gather(WORDS);
  assertNoTextInPlates(rows);

  const corpusDigest = sha256Hex(rows.map((r) => r.digest).join("\n"));
  const html = page(rows, corpusDigest);

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");

  const width = Math.max(...rows.map((r) => r.word.length));
  for (const r of rows) {
    const a = r.artifacts;
    process.stdout.write(
      `  ${r.word.padEnd(width)}  cusps ${String(a.envelope.cusps).padStart(2)}` +
        `  m ${String(a.envelope.multiplier).padStart(2)}` +
        `  square ${a.walk.square.padEnd(7)}` +
        `  sheet ${a.sheetId}` +
        `  concept ${a.correspondence === undefined ? "none" : a.correspondence.concept}\n`,
    );
  }
  process.stdout.write(`\ncorpus digest  ${corpusDigest}\n`);
  process.stdout.write(`page sha256    ${sha256Hex(html)}\n`);
  process.stdout.write(`wrote          ${out} (${html.length} bytes)\n`);
}

main(process.argv.slice(2));

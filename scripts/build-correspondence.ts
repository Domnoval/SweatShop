/**
 * Build the deterministic correspondence table: word → concept → planet →
 * kamea → traditions → marks → composition parameters.
 *
 * Every edge in the emitted table is a join between two things somebody already
 * authored. Nothing here decides that "runic feels Norse"; it reads the pools
 * the painter actually draws from and matches them, character for character and
 * id for id, against the codex rows.
 *
 * The four sources, and the exact field each contributes:
 *
 *   assets/symbolpaintermk137.html  KEYS (word → concept), CONCEPTS (concept →
 *                                   planet/brushes/mode/arch/palette/fold/words),
 *                                   GEO (the geometry brush's stamp pool),
 *                                   GLYPHS (each unicode brush's character pool),
 *                                   KAM (the 7 kamea squares), WORDS (the sigil
 *                                   brush's word pool), CATKEYS (the 8 brushes).
 *   assets/codexdata.ts             201 rows; `t` is the tradition key, `id` is
 *                                   present only on drawn rows, `g` (the glyph
 *                                   character) only on unicode rows, `n` on all.
 *   packages/glyph-registry/src/geometry.v2.ts
 *                                   the 50 locked `mark-*` ids — the only marks
 *                                   that exist as path data.
 *
 * The brush → tradition edge is derived three ways, one per brush family, and
 * each way is an exact string equality on an authored field:
 *
 *   unicode brushes  GLYPHS[brush].ch character === codex row `g`
 *   geometry brush   GEO key === codex row `id`, else === normalised codex `n`
 *   sigil brush      no join exists — see the recorded reason
 *
 * This is an extraction tool, not part of the pipeline. It writes a source file
 * for review; nothing here runs at compile time. Re-running it on unchanged
 * inputs must produce a byte-identical file, so every collection is sorted
 * before it is emitted and no object-key order is ever trusted.
 */

import { readFileSync, writeFileSync } from "node:fs";

/* ── literal extraction from the painter ───────────────────────────────────
   The painter is a single-file browser app, so its data blocks cannot be
   imported. They are lifted as source text and evaluated as literals. A
   brace-counting scan is used rather than a regex because several blocks
   contain nested braces and quoted braces would silently truncate a lazy
   match — a truncated CONCEPTS block would drop concepts without erroring. */

const PAINTER = new URL("../assets/symbolpaintermk137.html", import.meta.url);
const painterSrc = readFileSync(PAINTER, "utf8");

const CLOSER: Record<string, string> = { "{": "}", "[": "]", "(": ")" };

/** A run of painter source that carries no structure: a string literal, a line
    comment or a block comment. `inner` is the string's contents (empty for a
    comment) and `next` is the index just past the run; null when no such run
    starts at `i`.

    There is one of these because there were two. `balancedFrom` handled comments
    and `topLevelKeys` did not, so `const GEO={ // the studio's stamps` opened a
    "string" at the apostrophe, swallowed the rest of the block, and returned no
    keys at all — the geometry brush lost every tradition, 25 words stopped
    reaching a mark, and the script exited 0. Two scanners over one grammar means
    the day they disagree only one of them is wrong and nothing says which. House
    rule 1. */
type OpaqueRun = Readonly<{ kind: "string" | "comment"; inner: string; next: number }>;

function opaqueRunAt(src: string, i: number): OpaqueRun | null {
  const ch = src[i];
  if (ch === '"' || ch === "'" || ch === "`") {
    const from = i + 1;
    let j = from;
    while (j < src.length) {
      const c = src[j]!;
      if (c === "\\") { j += 2; continue; }
      if (c === ch) return { kind: "string", inner: src.slice(from, j), next: j + 1 };
      j += 1;
    }
    return { kind: "string", inner: src.slice(from), next: src.length };
  }
  if (ch === "/" && src[i + 1] === "*") {
    const end = src.indexOf("*/", i + 2);
    return { kind: "comment", inner: "", next: end === -1 ? src.length : end + 2 };
  }
  if (ch === "/" && src[i + 1] === "/") {
    const end = src.indexOf("\n", i);
    return { kind: "comment", inner: "", next: end === -1 ? src.length : end + 1 };
  }
  return null;
}

/** Return the literal starting at `open` in `src`, brace/bracket balanced. */
function balancedFrom(src: string, start: number): string {
  const stack: string[] = [];
  let i = start;
  while (i < src.length) {
    const run = opaqueRunAt(src, i);
    if (run) { i = run.next; continue; }
    const ch = src[i]!;
    if (ch === "{" || ch === "[" || ch === "(") { stack.push(CLOSER[ch]!); i += 1; continue; }
    if (ch === "}" || ch === "]" || ch === ")") {
      const want = stack.pop();
      if (want !== ch) throw new Error(`unbalanced ${ch} at ${i} (wanted ${want ?? "nothing"})`);
      i += 1;
      if (stack.length === 0) return src.slice(start, i);
      continue;
    }
    i += 1;
  }
  throw new Error(`literal starting at ${start} never closes`);
}

function literalText(name: string, open: "{" | "["): string {
  const marker = `const ${name}=${open}`;
  const at = painterSrc.indexOf(marker);
  if (at === -1) throw new Error(`${name} not found in symbolpaintermk137.html`);
  return balancedFrom(painterSrc, at + marker.length - 1);
}

function literalValue<T>(name: string, open: "{" | "["): T {
  // eslint-disable-next-line no-new-func
  return new Function(`return (${literalText(name, open)});`)() as T;
}

/** Top-level keys of an object literal, in source order, without evaluating it.
    GEO's values are drawing functions that call browser-only helpers, so the
    block can be measured but not run.

    Comments are stepped over by `opaqueRunAt` and, unlike every other construct
    here, do NOT clear `atKeyPosition`: a comment between a `,` and the key it
    annotates is a comment about that key, not a thing standing where the key
    should be. */
function topLevelKeys(text: string): string[] {
  const keys: string[] = [];
  const stack: string[] = [];
  let i = 0;
  let atKeyPosition = false;
  while (i < text.length) {
    const run = opaqueRunAt(text, i);
    if (run) {
      if (run.kind === "string") {
        if (atKeyPosition && stack.length === 1) keys.push(run.inner);
        atKeyPosition = false;
      }
      i = run.next;
      continue;
    }
    const ch = text[i]!;
    if (ch === "{" || ch === "[" || ch === "(") {
      stack.push(CLOSER[ch]!);
      if (stack.length === 1) atKeyPosition = true;
      i += 1;
      continue;
    }
    if (ch === "}" || ch === "]" || ch === ")") { stack.pop(); atKeyPosition = false; i += 1; continue; }
    if (ch === ",") { atKeyPosition = stack.length === 1; i += 1; continue; }
    if (/\s/.test(ch)) { i += 1; continue; }
    if (atKeyPosition && stack.length === 1 && /[A-Za-z_$]/.test(ch)) {
      let j = i;
      while (j < text.length && /[A-Za-z0-9_$]/.test(text[j]!)) j += 1;
      keys.push(text.slice(i, j));
      atKeyPosition = false;
      i = j;
      continue;
    }
    atKeyPosition = false;
    i += 1;
  }
  return keys;
}

/* ── the painter's own data ───────────────────────────────────────────────── */

type Concept = Readonly<{
  mode: string; arch: string; palette: string;
  brushes: readonly string[]; planet: string; words: readonly string[]; fold: number;
}>;

const CONCEPTS = literalValue<Record<string, Concept>>("CONCEPTS", "{");
const KEYS = literalValue<Record<string, string>>("KEYS", "{");
const GLYPHS = literalValue<Record<string, { f: string; ch: readonly string[] }>>("GLYPHS", "{");
const KAM = literalValue<Record<string, readonly (readonly number[])[]>>("KAM", "{");
const SIGIL_WORDS = literalValue<readonly string[]>("WORDS", "[");
const CATKEYS = literalValue<readonly string[]>("CATKEYS", "[");
const BRUSHMETA = literalValue<readonly (readonly [string, string])[]>("BRUSHMETA", "[");
const GEO_KEYS = topLevelKeys(literalText("GEO", "{"));

/** How many top-level stamps the painter's GEO block authors. Asserted, not
    trusted: the scan above is the only thing between a construct it does not
    understand and a table that looks complete. When it lost stamps every
    downstream count fell by a plausible-looking amount — 33 reachable marks to
    7, 159 words reaching a mark to 134 — with nothing anywhere saying so.
    Deliberately removing a stamp from the painter is a deliberate act; moving
    this number with it is part of that act. */
const GEO_STAMP_FLOOR = 16;

/* ── the codex ────────────────────────────────────────────────────────────── */

/* `U(n,t,e,g,f,m)` and `G(id,n,t,e,m)` in assets/codexdata.ts: `e` is the era
   ("classical", "Old Kingdom"), `g` is the glyph character, and only unicode
   rows have one. Joining a brush's character pool against `e` instead of `g`
   silently matches nothing, so the count of joined characters is asserted below. */
type CodexRow = Readonly<{ n: string; t: string; e?: string; g?: string; m: string; id?: string; d?: number }>;

const codex = (await import("../assets/codexdata.ts")) as {
  DATA: readonly CodexRow[];
  TRADITIONS: Record<string, readonly [string, string]>;
};
const DATA = codex.DATA;
const TRADITIONS = codex.TRADITIONS;

/* ── the locked marks ─────────────────────────────────────────────────────── */

const registry = (await import("../packages/glyph-registry/src/geometry.v2.ts")) as {
  GEOMETRY_V2_SOURCE: readonly { id: string }[];
  GEOMETRY_V2_VERSION: string;
};
const MARK_IDS = registry.GEOMETRY_V2_SOURCE.map((m) => m.id);
const MARK_PREFIX = "mark-";

/* ── shared helpers ───────────────────────────────────────────────────────── */

const byCode = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const uniqSorted = (xs: readonly string[]): string[] => [...new Set(xs)].sort(byCode);
const q = (s: string): string => JSON.stringify(s);
const union = (xs: readonly string[]): string => (xs.length ? xs.map(q).join(" | ") : "never");

/** Letters Unicode will not take apart for us. NFKD decomposes `á` into `a` plus a
    combining acute, so stripping combining marks folds it. It does not decompose
    `Æ`, `Ø`, `Þ`, `ß`, `Ł`, `Œ` or `Ð` — each is a single letter in its own right,
    not a decorated `a` or `o`. Left to the non-alphanumeric strip they are not
    folded, they are *deleted*. */
const FOLD: readonly (readonly [string, string])[] = Object.freeze([
  ["Æ", "ae"], ["æ", "ae"], ["Œ", "oe"], ["œ", "oe"],
  ["Ø", "o"], ["ø", "o"], ["Å", "a"], ["å", "a"],
  ["Þ", "th"], ["þ", "th"], ["Ð", "d"], ["ð", "d"], ["Đ", "d"], ["đ", "d"],
  ["ß", "ss"], ["Ł", "l"], ["ł", "l"],
] as const);

/** Fold an authored display name onto the alphabet a mark stem is written in:
    ASCII lowercase letters and digits, which is all a stem carries. Three things
    happen to a name, and the difference between the third and the other two is
    the whole point.

      1. Letters NFKD decomposes lose their marks: `Vegvísir` → `vegvisir`.
      2. Letters it does not decompose are folded by `FOLD` above:
         `Ægishjálmur` → `aegishjalmur`.
      3. Everything outside the Latin script is dropped — the glyph characters the
         codex carries inside display names (`Berkano · ᛒ`, `Eye of Ra · 𓁹`), the
         `·` separator, spaces and punctuation. None of those is a letter of the
         stem's alphabet, so dropping one cannot change which word this is.

    A Latin letter that reaches the end unfolded is REFUSED, not dropped. Deleting
    one silently changes the word: `Ægishjálmur` normalised to `gishjalmur`, which
    matched no mark, and the extractor then emitted a paragraph asserting
    "assets/codexdata.ts has no row … the glyph was drawn and never given a codex
    row" — false, the row is at assets/codexdata.ts:178. A miss is a bug; a miss
    that ships prose explaining why the data does not exist is what a later reader
    trusts instead of re-checking. Refusing costs one build; the other cost a note.

    This is a build-time assertion over authored data. It gates no letter in the
    pipeline and refuses no input to it — house rule 3 is about resolution, and
    nothing here resolves anything. */
const norm = (s: string): string => {
  let folded = s;
  for (const [from, to] of FOLD) folded = folded.split(from).join(to);
  folded = folded.normalize("NFKD").replace(/[̀-ͯ]/gu, "").toLowerCase();
  for (const ch of folded) {
    if (/[a-z0-9]/u.test(ch)) continue;
    if (!/\p{Script=Latin}/u.test(ch)) continue;
    const cp = `U+${ch.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
    throw new Error(
      `norm(${JSON.stringify(s)}): Latin letter ${JSON.stringify(ch)} (${cp}) has no fold. Dropping it would ` +
      "change the word and hand the join a key that reads like the name and matches nothing — this is exactly " +
      `how ${JSON.stringify("Ægishjálmur")} became ${JSON.stringify("gishjalmur")}. Add it to FOLD.`,
    );
  }
  return folded.replace(/[^a-z0-9]/gu, "");
};

const rowsById = new Map<string, CodexRow[]>();
const rowsByName = new Map<string, CodexRow[]>();
const rowsByChar = new Map<string, CodexRow[]>();
const push = (m: Map<string, CodexRow[]>, k: string, r: CodexRow): void => {
  const cur = m.get(k);
  if (cur) cur.push(r); else m.set(k, [r]);
};
for (const row of DATA) {
  if (row.id !== undefined) push(rowsById, row.id, row);
  push(rowsByName, norm(row.n), row);
  if (row.g !== undefined && row.g !== "") push(rowsByChar, row.g, row);
}

const problems: string[] = [];

/** How many concepts have a brush that reaches this tradition. Resolved lazily so
    the mark notes can cite it before the concept table is built. */
let conceptsReaching: (t: string) => number = () => 0;

/** All distinct traditions on the rows under a key, sorted. */
const tradsOf = (rows: readonly CodexRow[] | undefined): string[] =>
  rows === undefined ? [] : uniqSorted(rows.map((r) => r.t));

/* ── join 1: mark → tradition ─────────────────────────────────────────────
   48 of the 50 marks carry a codex `id`. The other two are the interesting
   ones and are resolved (or refused) explicitly rather than dropped. */

type MarkBinding = Readonly<{ mark: string; stem: string; tradition: string | null; via: string; note: string }>;

type RawMark = Readonly<{ mark: string; stem: string; tradition: string | null; via: MarkBinding["via"]; row?: CodexRow }>;

const rawMarks: RawMark[] = [];
for (const mark of [...MARK_IDS].sort(byCode)) {
  const stem = mark.startsWith(MARK_PREFIX) ? mark.slice(MARK_PREFIX.length) : mark;
  const byId = tradsOf(rowsById.get(stem));
  if (byId.length === 1) {
    rawMarks.push({ mark, stem, tradition: byId[0]!, via: "codex-id" });
    continue;
  }
  if (byId.length > 1) {
    problems.push(`${mark}: codex id ${stem} carries ${byId.length} traditions (${byId.join(",")})`);
    continue;
  }
  const byName = tradsOf(rowsByName.get(stem));
  if (byName.length === 1) {
    rawMarks.push({ mark, stem, tradition: byName[0]!, via: "codex-name", row: rowsByName.get(stem)![0]! });
    continue;
  }
  if (byName.length > 1) {
    problems.push(`${mark}: ${byName.length} codex names normalise to ${stem}`);
    continue;
  }
  rawMarks.push({ mark, stem, tradition: null, via: "unbound" });
}
if (rawMarks.length !== MARK_IDS.length) problems.push(`bound ${rawMarks.length} of ${MARK_IDS.length} marks`);

const idJoined = rawMarks.filter((m) => m.via === "codex-id").length;
const perTradition = (t: string): number => rawMarks.filter((m) => m.tradition === t).length;

const markTradition = new Map(rawMarks.map((b) => [b.mark, b.tradition]));
const marksByTradition = new Map<string, string[]>();
for (const b of rawMarks) {
  if (b.tradition === null) continue;
  const cur = marksByTradition.get(b.tradition);
  if (cur) cur.push(b.mark); else marksByTradition.set(b.tradition, [b.mark]);
}
for (const list of marksByTradition.values()) list.sort(byCode);

/* ── join 2: brush → tradition ────────────────────────────────────────────── */

type BrushBinding = Readonly<{
  brush: string; label: string; rule: string;
  traditions: readonly string[];
  evidence: readonly string[];
  unresolved: readonly { token: string; reason: string }[];
}>;

const brushLabel = new Map(BRUSHMETA.map(([k, v]) => [k, v]));
const brushBindings: BrushBinding[] = [];
const unmappedBrushKeys: string[] = [];
const unmappedBrushes: { brush: string; reason: string }[] = [];

for (const brush of [...CATKEYS].sort(byCode)) {
  const label = brushLabel.get(brush) ?? brush;

  if (brush === "geometry") {
    const evidence: string[] = [];
    const trads = new Set<string>();
    const gaps: { key: string; near: string[] }[] = [];
    if (GEO_KEYS.length < GEO_STAMP_FLOOR) {
      problems.push(
        `brush geometry: the GEO block scanned to ${GEO_KEYS.length} top-level stamps, under the ` +
        `${GEO_STAMP_FLOOR} the painter authors — the scan lost stamps to something inside that block, ` +
        "it did not discover a smaller pool",
      );
    }
    for (const key of [...GEO_KEYS].sort(byCode)) {
      const idRows = rowsById.get(key);
      if (idRows && idRows.length > 0) {
        for (const r of idRows) trads.add(r.t);
        evidence.push(`GEO.${key} === codex id ${q(key)} → ${tradsOf(idRows).join(",")}`);
        continue;
      }
      const nameRows = rowsByName.get(key);
      if (nameRows && nameRows.length === 1) {
        trads.add(nameRows[0]!.t);
        evidence.push(`GEO.${key} === norm(codex n ${q(nameRows[0]!.n)}) → ${nameRows[0]!.t}`);
        continue;
      }
      // Ranked the way a careless binder would rank them — longest shared prefix
      // first — so the recorded reason names the pick that would actually be made.
      const shared = (a: string, b: string): number => {
        let i = 0;
        while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
        return i;
      };
      // Anchored, not free containment. Unanchored, the two-letter codex id `sa`
      // "matched" GEO.unicursal on the `sa` inside "unicur*sa*l", and the recorded
      // reason then predicted a binder weighing "unicursalhex" against "sa" — a
      // choice nobody would ever face. A reason has to be a prediction about
      // something that could actually happen (house rule 6), so a near match must
      // share a word edge: one id starts or ends with the other. That keeps the
      // real cases — GEO.spiral against "goldenspiral", GEO.eye against
      // "eyehorus" and "eyeprov", where the ambiguity is genuine.
      const anchored = (a: string, b: string): boolean => a.startsWith(b) || a.endsWith(b);
      const near = uniqSorted([...rowsById.keys()].filter((id) => id !== key && (anchored(id, key) || anchored(key, id))))
        .sort((a, b) => shared(b, key) - shared(a, key) || b.length - a.length || byCode(a, b));
      gaps.push({ key, near });
    }
    // Same floor the GLYPHS branch gets, and for the same reason: an empty or
    // minority join is a join reading the wrong field, not a discovery that the
    // studio's stamp pool has no counterpart in the codex.
    if (evidence.length === 0) {
      problems.push(
        `brush geometry: none of its ${GEO_KEYS.length} stamp keys matched a codex \`id\` or a normalised ` +
        "codex `n` — the join is reading the wrong field, not discovering an empty tradition",
      );
    } else if (evidence.length * 2 < GEO_KEYS.length) {
      problems.push(
        `brush geometry: only ${evidence.length} of ${GEO_KEYS.length} stamp keys joined — under half the ` +
        "pool the join is the exception rather than the rule, which is what a mis-scan looks like",
      );
    }
    // Written only once the brush's tradition set is final, so each reason can say
    // whether forcing that one token would actually move a candidate.
    const unresolved = gaps.map(({ key, near }) => {
      const target = near[0];
      const wouldBe = target === undefined ? undefined : rowsById.get(target)![0]!.t;
      const carriers = target === undefined
        ? []
        : [...GEO_KEYS].sort(byCode).filter((k) => (rowsById.get(k)?.[0]?.t ?? rowsByName.get(k)?.[0]?.t) === wouldBe);
      return {
        token: key,
        reason:
          `no codex row has id === ${q(key)} and none has norm(n) === ${q(key)}` +
          (near.length ? `; the nearest ids by shared prefix or suffix are ${near.map(q).join(", ")}` : "") +
          `. PREDICTION IF FLIPPED: ` +
          (target === undefined
            ? `bind GEO.${key} to a row chosen by what the name suggests and the geometry brush would gain a ` +
              `tradition from a reading of English — the one kind of edge this table refuses.`
            : wouldBe !== undefined && trads.has(wouldBe)
              ? `bind GEO.${key} to ${q(target)} because one id starts or ends with the other and nothing measurable moves — ` +
                `the brush already reaches ${q(wouldBe)} through ${carriers.length} exactly-matched stamp` +
                `${carriers.length === 1 ? "" : "s"} (${carriers.join(", ")}), so no concept gains or loses a ` +
                `candidate.${near.length > 1 ? ` Note that ${near.length} ids start or end with ${q(key)}, or are started or ended by it, ` +
                  `(${near.map(q).join(", ")}), so the choice among them would be the binder's, not the data's.` : ""}` +
                ` What changes is that the table ` +
                `would then hold one edge asserted by a shared prefix instead of an equality, and the next such case — ` +
                `where the tradition is new — would have a precedent.`
              : `bind GEO.${key} to ${q(target)} on that shared edge and the geometry brush gains tradition ` +
                `${q(wouldBe ?? "")}, which ${(marksByTradition.get(wouldBe ?? "") ?? []).length} marks would ride ` +
                `into the candidate set of every geometry-carrying concept on the strength of one id ending with another.`),
      };
    });
    brushBindings.push({
      brush, label,
      rule: "GEO stamp key === codex `id`, else === norm(codex `n`)",
      traditions: [...trads].sort(byCode),
      evidence, unresolved,
    });
    continue;
  }

  const pool = GLYPHS[brush];
  if (pool) {
    const evidence: string[] = [];
    const gaps: string[] = [];
    const trads = new Set<string>();
    const hits = new Map<string, number>();
    for (const ch of [...pool.ch].sort(byCode)) {
      const rows = rowsByChar.get(ch);
      if (rows && rows.length > 0) {
        for (const r of rows) { trads.add(r.t); hits.set(r.t, (hits.get(r.t) ?? 0) + 1); }
        evidence.push(`GLYPHS.${brush}.ch ${q(ch)} === codex g → ${tradsOf(rows).join(",")}`);
        continue;
      }
      gaps.push(ch);
    }
    if (evidence.length === 0) {
      problems.push(
        `brush ${brush}: none of its ${pool.ch.length} pool characters matched a codex row — ` +
        "the join is reading the wrong field, not discovering an empty tradition",
      );
    }
    const majority = [...hits.entries()].sort((a, b) => b[1] - a[1] || byCode(a[0], b[0]))[0];
    const unresolved = gaps.map((ch) => ({
      token: ch,
      reason:
        `the painter draws ${q(ch)} but no codex row carries g === ${q(ch)}` +
        `. PREDICTION IF FLIPPED: hand it to \`${brush}\`'s majority tradition ` +
        (majority ? `${q(majority[0])} and nothing measurable moves — ${majority[1]} other characters in this pool ` +
          `already carry it, so no concept's candidate set changes` : "and the brush's reach becomes unfalsifiable") +
        `. What changes is that ${gaps.length} of this brush's ${pool.ch.length} characters would be asserted rather ` +
        `than matched, and the same licence applied to a pool whose unmatched character belongs elsewhere would ` +
        `introduce a tradition no matched character supports.`,
    }));
    brushBindings.push({
      brush, label,
      rule: "GLYPHS[brush].ch character === codex `g`",
      traditions: [...trads].sort(byCode),
      evidence, unresolved,
    });
    continue;
  }

  // Anything left has no pool the codex could be joined against. The reason is
  // written after the concept table exists, so it can quote what forcing it costs.
  unmappedBrushKeys.push(brush);
}

const brushTraditions = new Map(brushBindings.map((b) => [b.brush, b.traditions]));

/* ── join 3: concept → everything ─────────────────────────────────────────── */

const wordsOfConcept = new Map<string, string[]>();
for (const word of Object.keys(KEYS).sort(byCode)) {
  const concept = KEYS[word]!;
  const cur = wordsOfConcept.get(concept);
  if (cur) cur.push(word); else wordsOfConcept.set(concept, [word]);
}
for (const list of wordsOfConcept.values()) list.sort(byCode);

for (const concept of new Set(Object.values(KEYS))) {
  if (!(concept in CONCEPTS)) problems.push(`KEYS routes to concept ${concept}, which CONCEPTS does not define`);
}

type ConceptRow = Readonly<{
  concept: string; planet: string; brushes: readonly string[];
  traditions: readonly string[]; marks: readonly string[];
  mode: string; arch: string; palette: string; fold: number;
  ritualWords: readonly string[]; words: readonly string[];
  emptyBrushes: readonly string[];
}>;

const conceptRows: ConceptRow[] = [];
for (const name of Object.keys(CONCEPTS).sort(byCode)) {
  const c = CONCEPTS[name]!;
  if (!(c.planet in KAM)) problems.push(`concept ${name}: planet ${c.planet} has no kamea square`);
  const brushes = [...c.brushes].sort(byCode);
  const traditions = uniqSorted(brushes.flatMap((b) => [...(brushTraditions.get(b) ?? [])]));
  const marks = uniqSorted(traditions.flatMap((t) => marksByTradition.get(t) ?? []));
  const emptyBrushes = brushes.filter(
    (b) => (brushTraditions.get(b) ?? []).every((t) => (marksByTradition.get(t) ?? []).length === 0),
  );
  conceptRows.push({
    concept: name, planet: c.planet, brushes, traditions, marks,
    mode: c.mode, arch: c.arch, palette: c.palette, fold: c.fold,
    ritualWords: [...c.words].sort(byCode),
    words: wordsOfConcept.get(name) ?? [],
    emptyBrushes,
  });
}

for (const row of conceptRows) {
  for (const m of row.marks) if (!markTradition.has(m)) problems.push(`concept ${row.concept}: candidate ${m} is not in ${registry.GEOMETRY_V2_VERSION}`);
}

/* ── the two marks that do not join on `id`, now that the concept table exists
   and the notes can quote what flipping each one would cost ─────────────────── */

conceptsReaching = (t: string): number => conceptRows.filter((r) => r.traditions.includes(t)).length;
/** Concepts carrying a brush that has no tradition at all — named, not assumed to be "sigil". */
const sigilConcepts = conceptRows.filter((r) => r.brushes.some((b) => unmappedBrushKeys.includes(b))).length;

for (const brush of unmappedBrushKeys) {
  const seals = DATA.filter((r) => SIGIL_WORDS.some((w) => norm(w) === norm(r.n.split("·")[0]!.trim())));
  const sealTrads = tradsOf(seals);
  const isDrawn = (r: CodexRow): boolean => r.id !== undefined && MARK_IDS.includes(`${MARK_PREFIX}${r.id}`);
  const sealRows = seals.filter((r) => r.id !== undefined && r.id.startsWith("_seal_"));
  const plainRows = seals.filter((r) => r.id === undefined);
  const carriers = conceptRows.filter((r) => r.brushes.includes(brush));
  const rescued = carriers.filter((r) => r.marks.length === 0).map((r) => r.concept);
  const wouldAdd = uniqSorted(sealTrads.flatMap((t) => marksByTradition.get(t) ?? []));
  unmappedBrushes.push({
    brush,
    reason:
      `pickStamp() defines \`${brush}\` as sigilPath(word, planet): it walks the letters of a WORDS entry across ` +
      `one of the ${Object.keys(KAM).length} kamea and emits the resulting polyline. It selects no codex row, so it ` +
      `offers neither a character to match against \`g\` nor a key to match against \`id\`, and the codex T table ` +
      `has no counterpart for it. The nearest authored coincidence is that ${seals.length} of ${SIGIL_WORDS.length} ` +
      `WORDS entries (${uniqSorted(seals.map((r) => r.n.split("·")[0]!.trim())).join(", ")}) equal the name-head of a ` +
      `codex row, across tradition${sealTrads.length === 1 ? "" : "s"} ${sealTrads.map(q).join(" and ")} — but ` +
      `${seals.filter((r) => !isDrawn(r)).length} of those ${seals.length} rows have no mark in ` +
      `${registry.GEOMETRY_V2_VERSION} at all: ${sealRows.length} are procedural \`_seal_*\` rows the extractor never ` +
      `drew, and ${plainRows.length} (${plainRows.map((r) => q(r.n)).join(", ")}) ${plainRows.length === 1 ? "is a unicode row that shares" : "are unicode rows that share"} ` +
      `a spelling with the painter's word rather than a designed correspondence. ` +
      `PREDICTION IF FLIPPED: map \`${brush}\` to ${sealTrads.map(q).join(" + ")} on that coincidence and the ` +
      `${wouldAdd.length} marks none of those rows named — ${wouldAdd.map(q).join(", ")} — enter the candidate sets ` +
      `of all ${carriers.length} sigil-carrying concepts (${carriers.map((r) => r.concept).join(", ")}), taking ` +
      `${rescued.length === 0 ? "no concept off zero candidates" : `${rescued.join(", ")} from 0 candidates to ${wouldAdd.length}`} ` +
      `on the strength of a word list.`,
  });
}

const markBindings: MarkBinding[] = rawMarks.map((m) => {
  if (m.via === "codex-id") return { ...m, note: "" };
  if (m.via === "codex-name") {
    const row = m.row!;
    return {
      mark: m.mark, stem: m.stem, tradition: m.tradition, via: m.via,
      note:
        `assets/glyphdraws.ts defines a draw function \`${m.stem}\` and the extractor emitted ${m.mark}, but ` +
        `assets/codexdata.ts records it as U(${q(row.n)}, ${q(row.t)}, …, ${q(row.g ?? "")}) — a unicode row, and ` +
        `U() never sets an \`id\`. The id-join that resolves the other ${idJoined} marks therefore finds nothing here. ` +
        `It binds on the name field instead: norm(${q(row.n)}) === ${q(m.stem)}, an exact equality after case-folding ` +
        `and diacritic-stripping, not a stem guess. PREDICTION IF FLIPPED: leave it unbound and tradition ` +
        `${q(row.t)} falls from ${perTradition(row.t)} drawn marks to ${perTradition(row.t) - 1}, and each of the ` +
        `${conceptsReaching(row.t)} concepts whose brushes reach ${q(row.t)} loses exactly this one candidate.`,
    };
  }
  const wordHit = SIGIL_WORDS.filter((w) => norm(w) === m.stem);
  return {
    mark: m.mark, stem: m.stem, tradition: null, via: m.via,
    note:
      `assets/glyphdraws.ts defines a draw function \`${m.stem}\` and the extractor emitted ${m.mark}, but ` +
      `assets/codexdata.ts has no row with id === ${q(m.stem)} and no row whose name normalises to ${q(m.stem)}: ` +
      `the glyph was drawn and never given a codex row, so it has no tradition and appears in no candidate set. ` +
      (wordHit.length
        ? `The only other authored occurrence of the string is ${q(wordHit[0]!)} in the painter's WORDS pool, which ` +
          `the sigil brush walks across a kamea — it synthesises a polyline from the letters and never draws this ` +
          `glyph. That co-occurrence is recorded here and deliberately not used as an edge. `
        : "") +
      `PREDICTION IF FLIPPED: bind it on that word and ${m.mark} becomes the only one of the ${MARK_IDS.length} marks ` +
      `whose tradition came from a word list rather than a codex row, and it enters the candidate set of all ` +
      `${sigilConcepts} sigil-carrying concepts.`,
  };
});

/* ── measured coverage ────────────────────────────────────────────────────── */

const allWords = Object.keys(KEYS).sort(byCode);
const conceptByName = new Map(conceptRows.map((r) => [r.concept, r]));
const wordsWithMarks = allWords.filter((w) => (conceptByName.get(KEYS[w]!)?.marks.length ?? 0) > 0);
const conceptsWithMarks = conceptRows.filter((r) => r.marks.length > 0);
const reachedTraditions = uniqSorted(conceptRows.flatMap((r) => [...r.traditions]));
const reachedMarks = uniqSorted(conceptRows.flatMap((r) => [...r.marks]));
const usedBrushes = uniqSorted(conceptRows.flatMap((r) => [...r.brushes]));
const idleBrushes = [...CATKEYS].sort(byCode).filter((b) => !usedBrushes.includes(b));
const planetCounts = new Map<string, number>();
for (const r of conceptRows) planetCounts.set(r.planet, (planetCounts.get(r.planet) ?? 0) + 1);
const emptyTraditions = Object.keys(TRADITIONS).sort(byCode).filter((t) => (marksByTradition.get(t) ?? []).length === 0);

/* ── console report ───────────────────────────────────────────────────────── */

const log = (s = ""): void => { console.log(s); };
log(`words ............ ${allWords.length} (${wordsWithMarks.length} reach >=1 mark, ${allWords.length - wordsWithMarks.length} reach 0)`);
log(`concepts ......... ${conceptRows.length} (${conceptsWithMarks.length} reach >=1 mark)`);
log(`marks ............ ${MARK_IDS.length} locked, ${markBindings.filter((b) => b.tradition !== null).length} bound to a tradition, ${reachedMarks.length} reachable from a concept`);
log(`traditions ....... ${Object.keys(TRADITIONS).length} in the codex, ${reachedTraditions.length} reached by a brush, ${emptyTraditions.length} with zero drawn marks`);
log(`brushes .......... ${CATKEYS.length} defined, ${brushBindings.length} mapped, ${unmappedBrushes.length} unmapped, ${idleBrushes.length} used by no concept`);
log();
log("brush → tradition");
for (const b of brushBindings) {
  log(`  ${b.brush.padEnd(9)} → ${b.traditions.join(", ").padEnd(22)} ${b.evidence.length} joined, ${b.unresolved.length} unresolved`);
  for (const u of b.unresolved) log(`      unresolved ${q(u.token)}`);
}
for (const u of unmappedBrushes) log(`  ${u.brush.padEnd(9)} → UNMAPPED`);
log();
log("concept → marks");
for (const r of conceptRows) {
  log(`  ${r.concept.padEnd(10)} ${r.planet.padEnd(8)} ${String(r.words.length).padStart(3)}w  ${String(r.marks.length).padStart(2)} marks  [${r.traditions.join(",")}]`);
}
log();
log("planet distribution across concepts");
for (const p of [...planetCounts.keys()].sort(byCode)) log(`  ${p.padEnd(8)} ${planetCounts.get(p)}`);
log();
for (const b of markBindings) if (b.via !== "codex-id") log(`${b.via.toUpperCase()} ${b.mark}`);
for (const p of problems) log(`PROBLEM  ${p}`);

/* ── emit ─────────────────────────────────────────────────────────────────── */

const traditionKeys = Object.keys(TRADITIONS).sort(byCode);
const planetKeys = Object.keys(KAM).sort(byCode);
const brushKeys = [...CATKEYS].sort(byCode);
const modeKeys = uniqSorted(conceptRows.map((r) => r.mode));
const archKeys = uniqSorted(conceptRows.map((r) => r.arch));
const paletteKeys = uniqSorted(conceptRows.map((r) => r.palette));

const list = (xs: readonly string[]): string => `[${xs.map(q).join(", ")}]`;
/** JSDoc-safe: a reason may not contain a comment terminator. */
const doc = (indent: string, text: string): string => {
  const words = text.replace(/\*\//gu, "*​/").split(" ");
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    if (line.length + w.length + 1 > 104) { lines.push(line); line = w; }
    else line = line ? `${line} ${w}` : w;
  }
  if (line) lines.push(line);
  return [`${indent}/**`, ...lines.map((l) => `${indent} * ${l}`), `${indent} */`].join("\n");
};

const out: string[] = [];
out.push(`/**
 * Deterministic correspondence table, version \`correspondence/v1\`.
 *
 * GENERATED by \`scripts/build-correspondence.ts\`. Do not hand-edit: regenerate.
 *
 * Every one of the ${allWords.length} vocabulary words reaches a concept, a planet, a kamea
 * square, a set of codex traditions, a candidate mark set and the composition
 * parameters the painter would apply. Every edge is a join between two authored
 * fields — the painter's own stamp and character pools against the codex rows,
 * and the codex rows against the ${MARK_IDS.length} locked \`${registry.GEOMETRY_V2_VERSION}\` mark ids. No
 * association was invented; where no join exists the gap is recorded with the
 * prediction of what binding it anyway would change.
 *
 * Measured, not estimated:
 *   ${wordsWithMarks.length} of ${allWords.length} words reach at least one mark
 *   ${conceptsWithMarks.length} of ${conceptRows.length} concepts reach at least one mark
 *   ${reachedMarks.length} of ${MARK_IDS.length} marks are reachable from some concept
 *   ${reachedTraditions.length} of ${traditionKeys.length} codex traditions are reached by some brush
 *   ${brushBindings.length} of ${CATKEYS.length} brushes map to a tradition; ${unmappedBrushes.length} is unmapped, with a reason
 */

import type { GlyphGeometryId } from "@studio137/plate-core";

export const CORRESPONDENCE_VERSION = "correspondence/v1";
/** The joins are authored; which mark a concept should *prefer* is not yet canon. */
export const CORRESPONDENCE_IS_PROVISIONAL = true;

/** Source of the correspondence, for anyone auditing an edge. */
export const CORRESPONDENCE_SOURCES = Object.freeze({
  painter: "assets/symbolpaintermk137.html",
  codex: "assets/codexdata.ts",
  geometry: ${q(registry.GEOMETRY_V2_VERSION)},
} as const);

export type TraditionKey = ${union(traditionKeys)};
export type PlanetKey = ${union(planetKeys)};
export type BrushKey = ${union(brushKeys)};
export type ModeKey = ${union(modeKeys)};
export type ArchKey = ${union(archKeys)};
export type PaletteKey = ${union(paletteKeys)};

/** A magic square, row-major, exactly as the painter stores it. */
export type BrushBinding = Readonly<{
  brush: BrushKey;
  label: string;
  /** The equality that produced every tradition below. */
  rule: string;
  traditions: readonly TraditionKey[];
  /** One line per joined token: what matched what. */
  evidence: readonly string[];
  /** Tokens in this brush's pool that no codex row matches, and what forcing them would change. */
  unresolved: readonly Readonly<{ token: string; reason: string }>[];
}>;

export type MarkBinding = Readonly<{
  mark: GlyphGeometryId;
  /** The mark id with its \`mark-\` prefix removed — the draw-function name. */
  stem: string;
  tradition: TraditionKey | null;
  via: "codex-id" | "codex-name" | "unbound";
  /** Empty for the ordinary id-join; a full account for anything else. */
  note: string;
}>;

export type ConceptCorrespondence = Readonly<{
  concept: string;
  planet: PlanetKey;
  /**
   * Which square this concept is walked on — a name, never the square itself.
   * \`@studio137/walk-engine\` owns the seven kamea and verifies them magic at
   * load. This module carried a second copy until it was removed: the grids were
   * identical, but two copies of a magic square is two answers to where a letter
   * lands, and the day they drift the walk and the legend disagree with no error
   * anywhere. House rule 1.
   */
  kamea: PlanetKey;
  brushes: readonly BrushKey[];
  traditions: readonly TraditionKey[];
  /** Marks reachable from this concept's traditions. Sorted; may be empty. */
  markCandidates: readonly GlyphGeometryId[];
  composition: Readonly<{
    mode: ModeKey;
    arch: ArchKey;
    palette: PaletteKey;
    fold: number;
    /** The ritual words the painter would sigilise for this concept. */
    words: readonly string[];
  }>;
  /** The vocabulary words that route here. Sorted. */
  words: readonly string[];
  /** Brushes on this concept whose every tradition has zero drawn marks. */
  brushesReachingNoMark: readonly BrushKey[];
}>;

export type WordCorrespondence = Readonly<{ word: string; concept: string }>;
`);

out.push(`
/** The 13 codex traditions: key → [label, css custom-property]. */
export const TRADITION_LABELS: Readonly<Record<TraditionKey, readonly [string, string]>> = Object.freeze({
${traditionKeys.map((t) => `  ${t}: Object.freeze([${q(TRADITIONS[t]![0])}, ${q(TRADITIONS[t]![1])}] as const),`).join("\n")}
});
`);

out.push(`
/**
 * brush → tradition. Derived from \`pickStamp()\` in the painter: what each brush
 * actually draws, matched against the codex by exact string equality.
 */
export const BRUSH_BINDINGS: readonly BrushBinding[] = Object.freeze([
${brushBindings.map((b) => `  Object.freeze({
    brush: ${q(b.brush)},
    label: ${q(b.label)},
    rule: ${q(b.rule)},
    traditions: Object.freeze(${list(b.traditions)} as const),
    evidence: Object.freeze([${b.evidence.length ? `\n${b.evidence.map((e) => `      ${q(e)},`).join("\n")}\n    ` : ""}]),
    unresolved: Object.freeze([${b.unresolved.length ? `\n${b.unresolved.map((u) => `      Object.freeze({ token: ${q(u.token)}, reason: ${q(u.reason)} }),`).join("\n")}\n    ` : ""}]),
  }),`).join("\n")}
]);
`);

out.push(`
/**
 * Brushes with no counterpart in the codex \`T\` table. Recorded, not forced.
 */
export const UNMAPPED_BRUSHES: readonly Readonly<{ brush: BrushKey; reason: string }>[] = Object.freeze([
${unmappedBrushes.map((u) => `${doc("  ", u.reason)}
  Object.freeze({ brush: ${q(u.brush)}, reason: ${q(u.reason)} }),`).join("\n")}
]);
`);

out.push(`
/**
 * mark → tradition, for all ${MARK_IDS.length} locked marks. \`via\` says which authored field
 * carried the join; anything other than \`codex-id\` carries its full account.
 */
export const MARK_BINDINGS: readonly MarkBinding[] = Object.freeze([
${markBindings.map((b) => (b.note ? `${doc("  ", b.note)}\n` : "") +
  `  Object.freeze({ mark: ${q(b.mark)}, stem: ${q(b.stem)}, tradition: ${b.tradition === null ? "null" : q(b.tradition)}, via: ${q(b.via)}, note: ${q(b.note)} }),`).join("\n")}
]);
`);

out.push(`
/** The ${conceptRows.length} concepts, each with its complete chain. */
export const CONCEPT_CORRESPONDENCE: readonly ConceptCorrespondence[] = Object.freeze([
${conceptRows.map((r) => `  Object.freeze({
    concept: ${q(r.concept)},
    planet: ${q(r.planet)},
    kamea: ${q(r.planet)},
    brushes: Object.freeze(${list(r.brushes)} as const),
    traditions: Object.freeze(${list(r.traditions)} as const),
    markCandidates: Object.freeze(${list(r.marks)} as const),
    composition: Object.freeze({
      mode: ${q(r.mode)},
      arch: ${q(r.arch)},
      palette: ${q(r.palette)},
      fold: ${r.fold},
      words: Object.freeze(${list(r.ritualWords)} as const),
    }),
    words: Object.freeze(${list(r.words)} as const),
    brushesReachingNoMark: Object.freeze(${list(r.emptyBrushes)} as const),
  }),`).join("\n")}
]);
`);

out.push(`
/** All ${allWords.length} vocabulary words, sorted, each with the concept \`KEYS\` routes it to. */
export const WORD_CORRESPONDENCE: readonly WordCorrespondence[] = Object.freeze([
${allWords.map((w) => `  Object.freeze({ word: ${q(w)}, concept: ${q(KEYS[w]!)} }),`).join("\n")}
]);
`);

out.push(`
/** Counted from the tables above at generation time. */
export const CORRESPONDENCE_COVERAGE = Object.freeze({
  words: ${allWords.length},
  wordsReachingAMark: ${wordsWithMarks.length},
  wordsReachingNoMark: ${allWords.length - wordsWithMarks.length},
  wordsReachingNoMarkList: Object.freeze(${list(allWords.filter((w) => !wordsWithMarks.includes(w)))} as const),
  concepts: ${conceptRows.length},
  conceptsReachingAMark: ${conceptsWithMarks.length},
  conceptsReachingNoMark: ${conceptRows.length - conceptsWithMarks.length},
  conceptsReachingNoMarkNames: Object.freeze(${list(conceptRows.filter((r) => r.marks.length === 0).map((r) => r.concept))} as const),
  marksLocked: ${MARK_IDS.length},
  marksBoundToATradition: ${markBindings.filter((b) => b.tradition !== null).length},
  marksReachableFromAConcept: ${reachedMarks.length},
  marksReachableFromNoConcept: Object.freeze(${list([...MARK_IDS].sort(byCode).filter((m) => !reachedMarks.includes(m)))} as const),
  traditionsInCodex: ${traditionKeys.length},
  traditionsReachedByABrush: ${reachedTraditions.length},
  traditionsWithNoDrawnMark: Object.freeze(${list(emptyTraditions)} as const),
  traditionsReachedByNoBrush: Object.freeze(${list(traditionKeys.filter((t) => !reachedTraditions.includes(t)))} as const),
  brushesDefined: ${CATKEYS.length},
  brushesMapped: ${brushBindings.length},
  brushesUnmapped: ${unmappedBrushes.length},
  brushesUsedByNoConcept: Object.freeze(${list(idleBrushes)} as const),
  conceptsPerPlanet: Object.freeze({
${[...planetCounts.keys()].sort(byCode).map((p) => `    ${p}: ${planetCounts.get(p)},`).join("\n")}
  } as const),
  marksPerTradition: Object.freeze({
${traditionKeys.map((t) => `    ${t}: ${(marksByTradition.get(t) ?? []).length},`).join("\n")}
  } as const),
} as const);
`);

out.push(`
const BY_WORD: ReadonlyMap<string, ConceptCorrespondence> = new Map(
  WORD_CORRESPONDENCE.flatMap((w) => {
    const c = CONCEPT_CORRESPONDENCE.find((x) => x.concept === w.concept);
    return c ? [[w.word, c] as const] : [];
  }),
);

/** Look a vocabulary word up. Case-insensitive, matching the painter's own lowercasing. */
export function correspondenceForWord(word: string): ConceptCorrespondence | undefined {
  return BY_WORD.get(word.toLowerCase());
}

/** Look a concept up by name. */
export function correspondenceForConcept(concept: string): ConceptCorrespondence | undefined {
  return CONCEPT_CORRESPONDENCE.find((c) => c.concept === concept);
}
`);

const OUT = new URL("../packages/glyph-registry/src/correspondence.v1.ts", import.meta.url);

/* The write used to happen here unconditionally and the exit code was set after
   it. Every problem above describes a table that disagrees with itself — a
   duplicate codex id drops a mark from MARK_BINDINGS while CORRESPONDENCE_COVERAGE
   goes on reporting `marksLocked: 50` — and that file still reached disk, still
   compiled, still read as canon. Nothing in the repo runs this script, so the exit
   code is seen by whoever happens to be watching the terminal and by nobody else;
   the file is seen by everybody. So the file is the thing that must not appear. */
if (problems.length) {
  log(`\nREFUSED to write packages/glyph-registry/src/correspondence.v1.ts: ${problems.length} problem` +
      `${problems.length === 1 ? "" : "s"} above. The table this run produced disagrees with itself, so it is ` +
      "not written; whatever is on disk is the last run that did not. Fix the input or the join and re-run.");
  process.exitCode = 1;
} else {
  writeFileSync(OUT, `${out.join("").replace(/\n{3,}/gu, "\n\n").trimStart()}\n`, "utf8");
  log(`\nwrote packages/glyph-registry/src/correspondence.v1.ts`);
}
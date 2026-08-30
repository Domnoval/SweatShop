/**
 * Propose — do not author — a mark for each grammar family.
 *
 * The compiler resolves its nine root families, four modifiers and four
 * separators to provisional placeholder geometry. Binding them to the studio's
 * authored marks is what would make a compiled word draw a real mark, and that
 * binding is Record content: it decides what "signal" *looks like*.
 *
 * Inference cannot author canon. A machine that picks the mark for a root family
 * is the grimoire sheet with better tooling — a story fitted to a thing already
 * made. So this emits a signing sheet instead: seventeen rows, each carrying the
 * evidence the existing joins actually surface and a **blank reason field**.
 *
 * A row becomes canon when a human signs it with a reason. Unsigned rows do not
 * exist, and the gap stays honest.
 *
 *   pnpm exec tsx scripts/propose-root-marks.ts
 */

import { writeFileSync } from "node:fs";

import {
  MODIFIERS,
  ROOT_FAMILIES,
  SEPARATORS,
  CONCEPT_CORRESPONDENCE,
  WORD_CORRESPONDENCE,
} from "@studio137/glyph-registry";
import { GRAMMAR_V1_DATA } from "../packages/glyph-registry/src/grammar.v1.js";

const conceptOf = new Map(WORD_CORRESPONDENCE.map((w) => [w.word.toLowerCase(), w.concept]));
const marksOf = new Map(CONCEPT_CORRESPONDENCE.map((c) => [c.concept, c.markCandidates]));

type Row = Readonly<{
  kind: "root" | "modifier" | "separator";
  id: string;
  label: string;
  gloss: string;
  placeholder: string;
  /** Words this family owns that the concept table also knows. */
  bridge: readonly Readonly<{ word: string; concept: string }>[];
  candidates: readonly Readonly<{ mark: string; viaConcepts: readonly string[] }>[];
}>;

function rowFor(
  kind: Row["kind"],
  id: string,
  label: string,
  gloss: string,
  placeholder: string,
  words: readonly string[],
): Row {
  // The only honest evidence available: words this family claims that the
  // concept table also claims. Everything downstream follows from that overlap.
  const bridge = [...new Set(words.map((w) => w.toLowerCase()))]
    .filter((w) => conceptOf.has(w))
    .sort()
    .map((word) => Object.freeze({ word, concept: conceptOf.get(word)! }));

  const byMark = new Map<string, Set<string>>();
  for (const { concept } of bridge) {
    for (const mark of marksOf.get(concept) ?? []) {
      const set = byMark.get(mark) ?? new Set<string>();
      set.add(concept);
      byMark.set(mark, set);
    }
  }

  const candidates = [...byMark.entries()]
    .map(([mark, concepts]) =>
      Object.freeze({ mark, viaConcepts: Object.freeze([...concepts].sort()) }),
    )
    .sort((a, b) => b.viaConcepts.length - a.viaConcepts.length || a.mark.localeCompare(b.mark));

  return Object.freeze({
    kind,
    id,
    label,
    gloss,
    placeholder,
    bridge: Object.freeze(bridge),
    candidates: Object.freeze(candidates),
  });
}

const rows: Row[] = [
  ...ROOT_FAMILIES.map((r) =>
    rowFor("root", r.id, r.label, r.gloss, r.geometryId, GRAMMAR_V1_DATA.rootWords[r.id] ?? []),
  ),
  ...MODIFIERS.map((m) =>
    rowFor(
      "modifier",
      m.id,
      m.label,
      m.gloss,
      m.geometryId,
      Object.entries(GRAMMAR_V1_DATA.modifierWords)
        .filter(([, id]) => id === m.id)
        .map(([word]) => word),
    ),
  ),
  ...SEPARATORS.map((s) => rowFor("separator", s.id, s.label, s.gloss, s.geometryId, [])),
];

const withCandidates = rows.filter((r) => r.candidates.length > 0).length;

const lines: string[] = [
  "# Proposed root marks — a signing sheet",
  "",
  "**Nothing here is canon.** Each row is a proposal with a blank reason field.",
  "A row enters the Record when a human signs it — sign, strike, or rewrite,",
  "reason included. Unsigned rows do not exist and the gap stays honest.",
  "",
  "The compiler currently resolves all seventeen families to provisional",
  "placeholder geometry. Binding them to authored marks is what would make a",
  "compiled word draw a real mark — and it decides what `signal` *looks like*,",
  "which is Record content and not a thing inference may settle.",
  "",
  "## How the evidence was found",
  "",
  "The only honest chain available today: a family owns words; the concept table",
  "owns words; where they overlap, the concept's traditions reach marks. That is",
  "**one bridge wide** — `grammar.v1` and the concept table share only 29 words of",
  "248 and 170 — so the evidence below is thin by construction. A family with no",
  "bridge word gets no candidates, and that silence is data too.",
  "",
  "Separators own no words at all, so they carry no evidence and appear here only",
  "so the sheet is complete rather than quietly seventeen-minus-four rows long.",
  "",
  `**${withCandidates} of ${rows.length}** rows have any candidate at all.`,
  "",
  "---",
  "",
];

for (const row of rows) {
  lines.push(
    `## \`${row.id}\` — ${row.label}`,
    "",
    `> ${row.gloss}`,
    "",
    `- **kind** ${row.kind}`,
    `- **currently draws** \`${row.placeholder}\` (provisional placeholder)`,
  );

  if (row.bridge.length === 0) {
    lines.push(
      `- **bridge words** none — this family shares no word with the concept table`,
      `- **candidates** none. No evidence exists; any mark chosen here would be chosen by taste alone.`,
    );
  } else {
    lines.push(
      `- **bridge words** ${row.bridge.map((b) => `\`${b.word}\`→${b.concept}`).join(", ")}`,
      `- **candidates** ${row.candidates.length}`,
    );
    for (const c of row.candidates.slice(0, 8)) {
      lines.push(`    - \`${c.mark}\` — via ${c.viaConcepts.join(", ")}`);
    }
    if (row.candidates.length > 8) {
      lines.push(`    - _…and ${row.candidates.length - 8} more, all reached the same way_`);
    }
  }

  lines.push(
    "",
    "```",
    `SIGN:   ${row.id} -> ______________________________`,
    "REASON: ",
    "        (a prediction: what would measurably differ if this mark were a",
    "         different one. An adjective grades as Arbitrary.)",
    "```",
    "",
  );
}

lines.push(
  "---",
  "",
  "_Generated by `scripts/propose-root-marks.ts`. Regenerating is byte-identical._",
  "_Signing happens here, by hand. Nothing reads this file back yet — an ingest_",
  "_step gets built once there are signed rows to ingest._",
  "",
);

writeFileSync(
  new URL("../bible/PROPOSED-ROOT-MARKS.md", import.meta.url),
  `${lines.join("\n")}\n`,
  "utf8",
);
process.stdout.write(
  `Wrote bible/PROPOSED-ROOT-MARKS.md — ${rows.length} rows, ${withCandidates} with evidence\n`,
);
for (const r of rows) {
  process.stdout.write(
    `  ${r.kind.padEnd(9)} ${r.id.padEnd(16)} bridge ${String(r.bridge.length).padStart(2)}  candidates ${r.candidates.length}\n`,
  );
}

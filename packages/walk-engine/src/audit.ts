/**
 * The round-trip audit — the instrument that says whether any of this means
 * anything.
 *
 * Every word is walked, drawn, and then read back **blind**: the reader is handed
 * path data and a vocabulary, and nothing else. No manifest, no key, no record of
 * what was compiled. House rule 8, enforced by the shape of the call rather than
 * by a promise — `auditVocabulary` has no access to a manifest to cheat with.
 *
 * Resolution is not the interesting number. Letters always resolve, so 170/170 is
 * true by construction and proves nothing. The yield is the **collision census**
 * and the **unique recovery rate**: how often a drawn mark returns the one word
 * that made it, rather than a word that merely could have.
 */

import { digitString, resolve } from "./resolve.js";
import { read } from "./read.js";
import { kamea, type SquareId } from "./squares.js";
import { walk, type TraceId } from "./walk.js";
import type { CipherId } from "./cipher.js";

export type WordAudit = Readonly<{
  word: string;
  digits: string;
  /** Words the blind read returned, sorted. */
  matches: readonly string[];
  /** The read returned this word among its candidates. */
  recovered: boolean;
  /** The read returned this word and no other. */
  unique: boolean;
  ambiguousLoops: boolean;
}>;

export type Collision = Readonly<{ digits: string; words: readonly string[] }>;

export type AuditReport = Readonly<{
  square: SquareId;
  cipher: CipherId;
  trace: TraceId;
  total: number;
  resolved: number;
  unresolved: readonly string[];
  uniqueDigitStrings: number;
  collisions: readonly Collision[];
  collidingWords: number;
  recovered: number;
  uniquelyRecovered: number;
  lost: readonly string[];
  words: readonly WordAudit[];
}>;

export type AuditOptions = Readonly<{
  square?: SquareId;
  cipher?: CipherId;
  trace?: TraceId;
}>;

export function auditVocabulary(
  vocabulary: readonly string[],
  options: AuditOptions = {},
): AuditReport {
  const square = options.square ?? "jupiter";
  const cipher = options.cipher ?? "PYTH";
  // AGRIPPA by default: it is the only straight trace that also caps, and the
  // start cap is what fixes direction. An uncapped line reads the same forwards
  // and backwards, so every word would compete with its own mirror.
  const trace = options.trace ?? "AGRIPPA";
  const order = kamea(square).n;

  const words = [...vocabulary].map((w) => w.toUpperCase()).sort();
  const unresolved: string[] = [];
  const byDigits = new Map<string, string[]>();

  const audited: WordAudit[] = words.map((word) => {
    const digits = digitString(resolve(word, order, cipher));
    if (digits === "") unresolved.push(word);
    const bucket = byDigits.get(digits);
    if (bucket === undefined) byDigits.set(digits, [word]);
    else bucket.push(word);

    const figure = walk(word, { square, cipher, trace });
    const reading = read(figure.paths, { vocabulary: words, cipher });
    const matches = reading.matches;
    return Object.freeze({
      word,
      digits,
      matches,
      recovered: matches.includes(word),
      unique: matches.length === 1 && matches[0] === word,
      ambiguousLoops: reading.ambiguousLoops,
    });
  });

  const collisions: Collision[] = [...byDigits.entries()]
    .filter(([digits, group]) => digits !== "" && group.length > 1)
    .map(([digits, group]) => Object.freeze({ digits, words: Object.freeze([...group].sort()) }))
    .sort((a, b) => b.words.length - a.words.length || a.digits.localeCompare(b.digits));

  return Object.freeze({
    square,
    cipher,
    trace,
    total: words.length,
    resolved: words.length - unresolved.length,
    unresolved: Object.freeze(unresolved),
    uniqueDigitStrings: byDigits.size,
    collisions: Object.freeze(collisions),
    collidingWords: collisions.reduce((n, c) => n + c.words.length, 0),
    recovered: audited.filter((a) => a.recovered).length,
    uniquelyRecovered: audited.filter((a) => a.unique).length,
    lost: Object.freeze(audited.filter((a) => !a.recovered).map((a) => a.word)),
    words: Object.freeze(audited),
  });
}

/** The printed receipt. Plain text, so it can sit in a commit or on a plate. */
export function formatReceipt(report: AuditReport): string {
  const pct = (n: number): string => `${((n / report.total) * 100).toFixed(1)}%`;
  const lines: string[] = [
    "STUDIO 137 — ROUND-TRIP RECEIPT",
    `square ${report.square} · cipher ${report.cipher} · trace ${report.trace}`,
    "",
    "The read is blind: path data and a vocabulary, nothing else. No manifest,",
    "no key, no record of the compile.",
    "",
    `resolved              ${report.resolved}/${report.total}`,
    `unique digit strings  ${report.uniqueDigitStrings}`,
    `recovered             ${report.recovered}/${report.total}  (${pct(report.recovered)})`,
    `uniquely recovered    ${report.uniquelyRecovered}/${report.total}  (${pct(report.uniquelyRecovered)})`,
    `words in a collision  ${report.collidingWords}`,
    "",
  ];

  if (report.unresolved.length > 0) {
    lines.push(`UNRESOLVED (${report.unresolved.length}): ${report.unresolved.join(", ")}`, "");
  }
  if (report.lost.length > 0) {
    lines.push(`LOST — walked out, did not read back (${report.lost.length}):`);
    lines.push(`  ${report.lost.join(", ")}`, "");
  }

  lines.push(
    `COLLISIONS (${report.collisions.length}) — findings, not failures.`,
    "Two words that resolve alike draw the same mark. Which one a plate means is",
    "a policy question, decided on this data rather than in advance.",
    "",
  );
  for (const c of report.collisions) {
    lines.push(`  ${c.digits.padEnd(24)} ${c.words.join(" = ")}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

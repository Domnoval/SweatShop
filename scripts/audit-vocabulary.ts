/**
 * Run the round-trip audit over the studio's vocabulary and print the receipt.
 *
 *   pnpm exec tsx scripts/audit-vocabulary.ts [--square jupiter] [--cipher PYTH]
 *
 * The vocabulary is the 170 words of the correspondence table — which is, for
 * now, the same table the concepts ride on. That coincidence is temporary: the
 * moment the vocabulary grows past the table, a word will resolve (letters always
 * resolve) and ride nothing. The audit reads its word list from one place so the
 * divergence shows up here rather than hiding.
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { auditVocabulary, formatReceipt, isCipherId, isSquareId } from "@studio137/walk-engine";

import { WORD_CORRESPONDENCE } from "@studio137/glyph-registry";

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
};

const squareArg = arg("square") ?? "jupiter";
const cipherArg = arg("cipher") ?? "PYTH";
if (!isSquareId(squareArg)) throw new Error(`unknown square: ${squareArg}`);
if (!isCipherId(cipherArg)) throw new Error(`unknown cipher: ${cipherArg}`);

const vocabulary = WORD_CORRESPONDENCE.map((w) => w.word);
const report = auditVocabulary(vocabulary, { square: squareArg, cipher: cipherArg });
const receipt = formatReceipt(report);

const out = new URL("../artifacts/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
writeFileSync(`${out}receipt-${squareArg}-${cipherArg}.txt`, receipt, "utf8");
process.stdout.write(receipt);

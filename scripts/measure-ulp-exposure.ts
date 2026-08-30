/**
 * How much of the plate would move if `Math.sin` and `Math.cos` disagreed as
 * badly as they possibly can.
 *
 * `packages/mode-engine/src/trig.ts` took `attractor` off the built-ins because
 * a chaotic map amplifies one ULP without bound. Call sites in the COMMITTED
 * packages still use them — `envelope-engine` placing nodes on the ring,
 * `walk-engine` drawing the cap bar, `ring/annotate.ts` drawing tick marks,
 * `ring/index.ts` placing envelope nodes — and the argument for leaving them
 * there is that every one of those results is `toFixed`-ed before it reaches a
 * path, so a 1-ULP difference cannot survive into the bytes.
 *
 * That is an argument, and this repository has shipped six sentences that were
 * arguments. So it is measured instead: every `Math.sin` and `Math.cos` in the
 * process is replaced by one returning the NEXT REPRESENTABLE DOUBLE — a uniform
 * 1-ULP error on every call, which is strictly worse than the ~3.3% of arguments
 * Chromium actually disagrees with Node on — and the whole vocabulary is
 * compiled twice. A plate whose artifacts change is a plate where the rounding
 * did NOT absorb it.
 *
 *   pnpm exec tsx scripts/measure-ulp-exposure.ts
 *
 * Exits 0 whatever it finds: this reports an exposure, it does not police one.
 * The number belongs in `workbench.md`, and a non-zero one is the trigger for
 * moving `dsin`/`dcos` underneath `walk-engine` and rebaselining the goldens.
 */
import { WORD_CORRESPONDENCE } from "@studio137/glyph-registry";
import { sha256Hex } from "@studio137/plate-core";
import { ring } from "@studio137/ring";
import { SQUARE_IDS } from "@studio137/walk-engine";

const VOCABULARY = WORD_CORRESPONDENCE.map((w) => w.word);

/** The next double away from zero. One ULP, the worst a conforming engine can be. */
function nudge(x: number): number {
  if (!Number.isFinite(x) || x === 0) return x;
  const view = new Float64Array([x]);
  const bits = new BigInt64Array(view.buffer);
  bits[0] = (bits[0] ?? 0n) + (x > 0 ? 1n : -1n);
  return view[0] ?? x;
}

/** Every string the ring returned, hashed together. Any moved digit shows up here. */
function digestAll(word: string, square: string): string {
  const artifacts = ring(word, {
    vocabulary: VOCABULARY,
    square: square as never,
  }) as unknown as Record<string, unknown>;
  const texts = Object.entries(artifacts)
    .filter(([key, value]) => typeof value === "string" && key !== "word")
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, value]) => `${key} ${String(value)}`)
    .join("");
  return sha256Hex(texts);
}

const trueSin = Math.sin;
const trueCos = Math.cos;

const clean = new Map<string, string>();
for (const word of VOCABULARY) {
  for (const square of SQUARE_IDS) clean.set(`${word}\u0000${square}`, digestAll(word, square));
}

// The counter is what stops this script from reporting a clean result because it
// perturbed nothing. `calls === 0` is a broken measurement, not a passing one.
let calls = 0;
Math.sin = (x: number): number => {
  calls += 1;
  return nudge(trueSin(x));
};
Math.cos = (x: number): number => {
  calls += 1;
  return nudge(trueCos(x));
};

const moved: string[] = [];
for (const word of VOCABULARY) {
  for (const square of SQUARE_IDS) {
    const key = `${word}\u0000${square}`;
    if (digestAll(word, square) !== clean.get(key)) moved.push(`${word} on ${square}`);
  }
}

Math.sin = trueSin;
Math.cos = trueCos;

const total = VOCABULARY.length * SQUARE_IDS.length;
process.stdout.write(
  `compiled ${total} plates (${VOCABULARY.length} words x ${SQUARE_IDS.length} squares) twice.\n` +
    `Math.sin/Math.cos calls seen under the perturbation: ${calls}\n`,
);
process.stdout.write(
  calls === 0
    ? "NOTHING CALLED Math.sin OR Math.cos. The perturbation measured nothing — fix the hook, do not read the result.\n"
    : `plates whose bytes changed when EVERY Math.sin/Math.cos result moved 1 ULP: ${moved.length} of ${total}\n`,
);
for (const one of moved.slice(0, 20)) process.stdout.write(`   ${one}\n`);
if (moved.length > 20) process.stdout.write(`   ... and ${moved.length - 20} more\n`);

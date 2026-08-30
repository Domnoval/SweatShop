/**
 * Letter ciphers and theosophic reduction.
 *
 * Three ciphers, ported from `assets/esotericacodexmk137.html:557`. Pythagorean
 * is the canonical audit cipher: it is the only one of the three with full A-Z
 * coverage and no transliteration ambiguity, so it is the one the round-trip
 * receipt runs on. The other two stay available as parameters — a plate may be
 * walked under any of them, but only one may be audited against, or the
 * collision census would be measuring three different languages at once.
 */

import { PlateError } from "@studio137/plate-core";

export const CIPHER_IDS = ["PYTH", "NAEQ", "HEB"] as const;
export type CipherId = (typeof CIPHER_IDS)[number];

/** NAEQ (New Aeon English Qabalah) letter order, ALW. */
const NAEQ_ORDER = "ALWHSDOZKVGRCNYJUFQBMXITEP";

const NAEQ: ReadonlyMap<string, number> = new Map(
  [...NAEQ_ORDER].map((ch, i) => [ch, i + 1] as const),
);

/**
 * A single uppercase A-Z letter to its numeric value.
 *
 * Returns 0 for anything outside A-Z, matching the source engines. Callers strip
 * non-letters before they get here, so a 0 in practice means a bug upstream
 * rather than user input.
 */
export function cipherValue(letter: string, cipher: CipherId): number {
  const i = letter.charCodeAt(0) - 65;
  if (i < 0 || i > 25) return 0;
  switch (cipher) {
    case "PYTH":
      // A-I 1-9, J-R 1-9, S-Z 1-8.
      return (i % 9) + 1;
    case "NAEQ":
      return NAEQ.get(letter) ?? 0;
    case "HEB":
      // Hebrew place value: units, tens, hundreds.
      if (i < 9) return i + 1;
      if (i < 18) return (i - 8) * 10;
      return (i - 17) * 100;
    default: {
      const exhaustive: never = cipher;
      throw new PlateError("INVALID_REQUEST", `Unknown cipher "${String(exhaustive)}".`, {
        requested: cipher,
        known: CIPHER_IDS,
      });
    }
  }
}

/** Sum of a non-negative integer's decimal digits. */
export function digitSum(value: number): number {
  let sum = 0;
  let rest = value;
  while (rest > 0) {
    sum += rest % 10;
    rest = Math.floor(rest / 10);
  }
  return sum;
}

/**
 * Theosophic reduction: repeated digit-sum until the value fits the square.
 *
 * Not modulo. `reduce(19, 16)` is 10 (1+9), where modulo would give 3, and the
 * two land on different cells. All three source engines reduce; matching them is
 * what keeps figures drawn before this package comparable with figures drawn
 * after it. Zero maps to `max` rather than falling off the board.
 */
export function reduceToCell(value: number, max: number): number {
  // `max` is the CELL COUNT — `order * order`, so 9 for Saturn's 3x3 and 81 for
  // Luna's 9x9 — and not the order. Below 9 the loop cannot terminate: the digit
  // sum of a one-digit number is itself, so `reduceToCell(5, 3)` spins forever
  // on a value it can never get under. That is not hypothetical. Wiring the
  // reader's inverse cipher to a lattice's `order` instead of its cell count
  // hung the whole process on the word SUN, silently, with no stack to read —
  // and a browser tab has no timeout to save it. A hang is the worst failure
  // mode available here, so it is turned into a sentence.
  if (!Number.isInteger(max) || max < 9) {
    throw new PlateError(
      "INVALID_REQUEST",
      `reduceToCell needs a cell count of at least 9, got ${max}. ` +
        "This argument is order squared, not the order — the smallest square in the set is 3x3, which is 9 cells.",
      { max, value },
    );
  }
  let v = value;
  while (v > max) v = digitSum(v);
  return v === 0 ? max : v;
}

export function isCipherId(value: string): value is CipherId {
  return (CIPHER_IDS as readonly string[]).includes(value);
}

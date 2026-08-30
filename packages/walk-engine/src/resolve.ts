/**
 * Station 1 — Resolve. Letters to digits, for any word at all.
 *
 * House rule 3: letters resolve, concepts ride. This function has no vocabulary,
 * consults no table, and cannot refuse. A word outside the codex resolves exactly
 * as well as one inside it; the concept layer adds correspondence afterwards and
 * never gates what may be spoken.
 *
 * That is the whole difference from the concept-primary design this replaced,
 * where `FALL` returned "DESCENT" — a word the speaker did not say — and `ACE`
 * was refused outright for being absent from the table.
 */

import { cipherValue, reduceToCell, type CipherId } from "./cipher.js";

export type ResolvedLetter = Readonly<{
  /** Position in the surviving letter sequence, from 0. */
  index: number;
  letter: string;
  /** Raw cipher value before reduction. */
  value: number;
  /** Cell after theosophic reduction into `1..n²`. */
  cell: number;
}>;

export type Resolution = Readonly<{
  /** Exactly what the caller passed, unmodified. */
  input: string;
  cipher: CipherId;
  /** Order of the square this was reduced against. */
  order: number;
  letters: readonly ResolvedLetter[];
  /** Cell sequence, the walk's only input. */
  cells: readonly number[];
  /**
   * Characters dropped as non-letters, in order, indexed into the string the
   * caller passed — not into its uppercased form, which is a different string
   * whenever a character expands under uppercasing.
   */
  dropped: readonly Readonly<{ index: number; char: string }>[];
}>;

/**
 * Resolve a word against a square of order `n`.
 *
 * Never throws. An input with no letters returns an empty resolution rather than
 * an error — refusing it would breach house rule 3, and an empty walk is a fact
 * the caller can report rather than an exception it must catch.
 */
export function resolve(input: string, order: number, cipher: CipherId = "PYTH"): Resolution {
  const max = order * order;
  const letters: ResolvedLetter[] = [];
  const dropped: { index: number; char: string }[] = [];

  // Uppercase per source character, not once over the whole string. Some
  // characters expand — ß to SS, the ligatures ﬁ ﬀ ﬃ to FI FF FFI — so indices
  // into `input.toUpperCase()` drift past every expansion before them and point
  // into a string the caller never typed. `resolve("ﬁ!")` used to report the `!`
  // at index 2; the caller's `!` is at index 1. `dropped` exists so a caller can
  // point back at what they typed, which is the one thing that index must do.
  [...input].forEach((sourceChar, index) => {
    const upper = sourceChar.toUpperCase();
    let anyLetter = false;
    for (const char of upper) {
      if (char >= "A" && char <= "Z") {
        anyLetter = true;
        const value = cipherValue(char, cipher);
        letters.push(
          Object.freeze({ index: letters.length, letter: char, value, cell: reduceToCell(value, max) }),
        );
      }
    }
    // A character contributing no letter is dropped, reported at its own position
    // in the caller's string.
    if (!anyLetter) dropped.push({ index, char: sourceChar });
  });

  return Object.freeze({
    input,
    cipher,
    order,
    letters: Object.freeze(letters),
    cells: Object.freeze(letters.map((l) => l.cell)),
    dropped: Object.freeze(dropped.map((d) => Object.freeze(d))),
  });
}

/** The digit string the fixtures are written in, e.g. `4·5·1·3·5·5·2`. */
export function digitString(resolution: Resolution): string {
  return resolution.cells.join("·");
}

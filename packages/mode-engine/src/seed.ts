/**
 * Where the randomness comes from.
 *
 * The painter seeds from a hash of the typed phrase (`hashStr` at
 * `assets/symbolpaintermk137.html:875`). That is the wrong seed for this spine
 * for two measurable reasons, and both were checked before this file was
 * written:
 *
 *   1. It keys off the string, not the word. `"DESCENT"` and `"DESCENT "` hash
 *      differently, so the painter would place a different field for a trailing
 *      space — the exact failure `packages/ring/src/index.ts` documents having
 *      already made once with the concept lookup.
 *   2. It throws away the walk. The walk is a better seed than any hash of the
 *      input because it is what the input MEANS in this system: the cells, their
 *      sum, the distinct set they touch. Two spellings of one word give one
 *      walk and must give one field.
 *
 * So the seed is FNV-1a over the walk's own quantities. Every arithmetic step is
 * `Math.imul` and `>>> 0`, so a browser and Node agree on all 32 bits — house
 * rule 2 is not satisfied by "should be the same", it is satisfied by using only
 * operations that cannot differ.
 *
 * The mode id is folded in last so that two modes of one word do not replay the
 * identical stream of draws. Nothing depends on that — the fields are different
 * constructions either way — but a shared stream would make ORGANIC and CHAOS
 * put their first mark in the same place for every word in the vocabulary, which
 * reads as a bug whether or not it is one.
 */

import type { Walk } from "@studio137/walk-engine";

import { MODE_IDS, type ModeId } from "./types.js";

const FNV_OFFSET = 2166136261;
const FNV_PRIME = 16777619;

const fold = (h: number, v: number): number => Math.imul(h ^ (v >>> 0), FNV_PRIME) >>> 0;

/** The quantity `envelope-engine` reduces for its multiplier. One meaning, two readers. */
export function cellSum(walk: Walk): number {
  return walk.steps.reduce((total, step) => total + step.cell, 0);
}

export function seedFromWalk(walk: Walk, mode: ModeId): number {
  let h = FNV_OFFSET >>> 0;
  // The cells in the order they were walked. `cell + 1` so a walk that lands on
  // cell 0 — impossible today, since `reduceToCell` floors at 1, but free to
  // become possible — still perturbs the hash instead of folding the identity.
  for (const step of walk.steps) h = fold(h, step.cell + 1);
  h = fold(h, walk.order);
  h = fold(h, cellSum(walk));
  // The activated set is not recoverable from the sequence above in constant
  // work, and it is what several modes' counts are a function of, so it is
  // folded in explicitly rather than left implicit.
  for (const cell of walk.activatedCells) h = fold(h, cell);
  h = fold(h, walk.steps.length);
  h = fold(h, MODE_IDS.indexOf(mode) + 1);
  return h >>> 0;
}

/**
 * Mulberry32, ported verbatim from `mulberry()` at
 * `assets/symbolpaintermk137.html:308`.
 *
 * Ported rather than replaced by `plate-core`'s xoshiro128** because the fields
 * below are ports too: `organic` and `cymatic` are rejection samplers whose
 * output depends on the exact sequence of draws, so swapping the generator
 * changes every figure the painter ever made. Two generators in one repository
 * is a cost; two answers to "what does the painter's cymatic look like" is a
 * bigger one. It is confined to this package and takes its seed from the walk.
 */
export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

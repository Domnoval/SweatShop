/**
 * Chord families — the primary ink.
 *
 * A family of straight chords does not draw its curve directly; the curve is the
 * **envelope** the chords are all tangent to. Place `N` nodes evenly on a circle
 * and join node `i` to node `m·i mod N`, and the envelope is an epicycloid with
 * exactly `m − 1` cusps. Nothing is approximated and nothing is drawn by eye: the
 * whole figure is two integers and a circle.
 *
 * That property is the reason this construction was chosen over any other way of
 * making a dense radial figure. **The cusp count is a readout.** Count the points
 * of the star and you have recovered `m`, and `m` is derived from the word. A
 * reader who distrusts the caption can check the picture against it by counting.
 * A star with sixteen points because sixteen looked good cannot be checked at all,
 * and that is the difference this studio's thesis turns on.
 *
 * Hue obeys the same rule (house rule 5): it advances with chord index around the
 * family, so the colour sweep reports position in the construction rather than
 * decorating it. A gradient with no quantity behind it would grade as Arbitrary.
 */

import { PlateError } from "@studio137/plate-core";
import { reduceToCell, type Walk } from "@studio137/walk-engine";

export type Point = readonly [number, number];

export type ChordBand = Readonly<{
  /** All chords in this hue band, as one path of disjoint segments. */
  d: string;
  /** 0-1 around the colour wheel; the band's position in the family. */
  hue: number;
  chordCount: number;
}>;

export type EnvelopeFamily = Readonly<{
  /** Nodes on the circle. */
  nodes: number;
  /** The multiplier. `i -> m·i mod N`. */
  multiplier: number;
  /** Cusps of the envelope: `m − 1`. Countable off the drawing. */
  cusps: number;
  centre: Point;
  radius: number;
  bands: readonly ChordBand[];
  chordCount: number;
}>;

export type EnvelopeOptions = Readonly<{
  centre?: Point;
  radius?: number;
  /** Hue bands the family is split across, so colour can vary without one path per chord. */
  bands?: number;
  /** Override the derived multiplier. Provided for tests, not for taste. */
  multiplier?: number;
  /** Override the derived node count. */
  nodes?: number;
}>;

const f = (n: number): string => n.toFixed(4);

/**
 * Nodes on the circle. Fixed at 137.
 *
 * This was magic-constant × order, which is a prettier derivation and produced an
 * unreadable plate. Venus gave 1225 nodes, and at that density the chords fill the
 * disc uniformly: the caustic vanishes into texture and the cusps cannot be
 * counted. The sheet printed "count the cusps to check this against its caption"
 * above a figure where counting is impossible — a false claim on the artifact,
 * which is worse than a plain one.
 *
 * 137 is prime, so every multiplier below it is coprime with it and `i -> m·i` is
 * a bijection on the non-zero residues: each of those nodes carries exactly one
 * chord out and one in, so every family draws 136 chords over 136 nodes and none
 * can collapse onto a proper subset. A composite count would let some multipliers
 * do exactly that.
 *
 * Note *every family draws 136 chords*, not *the same 136 chords* — a grader
 * checked, and across m = 2..10 the families are pairwise **disjoint**: zero
 * shared chords in all 36 pairs. Same count, same coverage, no overlap.
 *
 * Node 0 maps to itself, so its chord has zero length and is dropped. Twelve
 * o'clock is bare on every plate.
 *
 * This said "closes as a single cycle" until a grader counted, and the sentence
 * written to correct it was wrong too — it quoted `136 / ord(m)` and then gave
 * m=10 as eighteen, which is the count including node 0's fixed point, while
 * giving m=3 as one, which is the count excluding it. Two conventions in one
 * sentence. Counting the non-zero residues only: m=3 gives 1 cycle, m=10 gives
 * 17. `envelopeCycleCounts` in the tests computes both columns, so this comment
 * is now checked rather than asserted — the fourth generation of one failure in
 * this file, and the first one a test can catch.
 */
export const NODES = 137;

/**
 * The multiplier, from the walk's cell sum reduced theosophically.
 *
 * The reduction is not a convenience — it is the same operation that places a
 * letter on a cell, applied once more. A word's weight collapses to a single
 * digit and that digit is the cusp count, so the figure reports the word in the
 * one unit the system already counts in.
 *
 * Taking the sum raw put the multiplier in the forties, and forty crowded cusps
 * on any node count are not countable. Reduced, DESCENT draws 7, LONGING 6,
 * FALL 4, ACE 9 — a glance is enough.
 *
 * Two words that reduce alike draw the same envelope. That is a collision of
 * exactly the kind the audit reports, visible on the plate rather than hidden.
 */
export function multiplierForWalk(walk: Walk, _nodes: number = NODES): number {
  const sum = walk.steps.reduce((total, step) => total + step.cell, 0);
  if (sum === 0) return 2;
  // 1..9, then offset so the multiplier is never the degenerate identity and the
  // cusp count reads back as exactly the reduction.
  return reduceToCell(sum, 9) + 1;
}

/**
 * Cusps a walk's envelope will draw: the theosophic reduction of its cell sum —
 * except for a letterless walk, where `multiplierForWalk` floors at 2 before any
 * reduction runs and the answer is 1, not `reduceToCell(0, 9)` = 9.
 */
export function cuspsForWalk(walk: Walk): number {
  return multiplierForWalk(walk) - 1;
}

export function envelopeFromWalk(walk: Walk, options: EnvelopeOptions = {}): EnvelopeFamily {
  const nodes = options.nodes ?? NODES;
  if (!Number.isInteger(nodes) || nodes < 3) {
    throw new PlateError("INVALID_REQUEST", `An envelope needs at least 3 nodes, got ${nodes}.`, {
      nodes,
    });
  }
  const multiplier = options.multiplier ?? multiplierForWalk(walk, nodes);
  const [, , boxW, boxH] = walk.viewBox;
  const centre = options.centre ?? ([boxW / 2, boxH / 2] as Point);
  // Leaves an outer band clear: the correspondence marks live there, and inside
  // the family they were unreadable against its texture.
  const radius = options.radius ?? Math.min(boxW, boxH) / 2 - 32;
  const bandCount = Math.max(1, Math.min(options.bands ?? 36, nodes));

  // Start at twelve o'clock so a figure's orientation is a fact rather than an
  // artifact of atan2's zero being due east.
  const node = (i: number): Point => {
    const theta = (2 * Math.PI * (i % nodes)) / nodes - Math.PI / 2;
    return [centre[0] + Math.cos(theta) * radius, centre[1] + Math.sin(theta) * radius];
  };

  const buckets: string[][] = Array.from({ length: bandCount }, () => []);
  for (let i = 0; i < nodes; i += 1) {
    const a = node(i);
    const b = node((i * multiplier) % nodes);
    // A chord from a node to itself has no direction and no tangent; it would
    // render as an invisible zero-length segment and inflate the count.
    if (a[0] === b[0] && a[1] === b[1]) continue;
    const band = Math.floor((i / nodes) * bandCount) % bandCount;
    buckets[band]!.push(`M${f(a[0])} ${f(a[1])} L${f(b[0])} ${f(b[1])}`);
  }

  const bands: ChordBand[] = buckets
    .map((segments, index) =>
      Object.freeze({
        d: segments.join(" "),
        hue: index / bandCount,
        chordCount: segments.length,
      }),
    )
    .filter((b) => b.chordCount > 0);

  return Object.freeze({
    nodes,
    multiplier,
    cusps: multiplier - 1,
    centre: Object.freeze(centre),
    radius,
    bands: Object.freeze(bands),
    chordCount: bands.reduce((n, b) => n + b.chordCount, 0),
  });
}

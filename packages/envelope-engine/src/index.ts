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
import type { Walk } from "@studio137/walk-engine";

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
 * Node count for a square of order `n`: its magic constant times its order.
 *
 * Both factors are properties of the square rather than of the renderer, so the
 * density of the figure is a fact about which kamea was walked. Jupiter gives
 * 136 chords, Luna 3321 — the larger squares genuinely draw denser plates.
 */
export function nodesForOrder(order: number, magicConstant: number): number {
  return magicConstant * order;
}

/**
 * The multiplier, derived from the walk: the sum of the cells it touched.
 *
 * A word's numeric weight becomes the cusp count. DESCENT sums to 25 and draws
 * 24 cusps; ACE sums to 9 and draws 8. Two words with the same weight draw the
 * same envelope, which is a collision of exactly the kind the audit already
 * reports — visible here rather than hidden.
 */
export function multiplierForWalk(walk: Walk, nodes: number): number {
  const sum = walk.steps.reduce((total, step) => total + step.cell, 0);
  const m = sum % nodes;
  // 0 and 1 degenerate: every chord collapses to a point or to the identity, and
  // the family draws nothing at all. Fold them onto the smallest figure that has
  // an envelope rather than emitting an empty layer that looks like a bug.
  return m < 2 ? 2 : m;
}

export function envelopeFromWalk(walk: Walk, options: EnvelopeOptions = {}): EnvelopeFamily {
  const magic = (walk.order * (walk.order * walk.order + 1)) / 2;
  const nodes = options.nodes ?? nodesForOrder(walk.order, magic);
  if (!Number.isInteger(nodes) || nodes < 3) {
    throw new PlateError("INVALID_REQUEST", `An envelope needs at least 3 nodes, got ${nodes}.`, {
      nodes,
    });
  }
  const multiplier = options.multiplier ?? multiplierForWalk(walk, nodes);
  const [, , boxW, boxH] = walk.viewBox;
  const centre = options.centre ?? ([boxW / 2, boxH / 2] as Point);
  const radius = options.radius ?? Math.min(boxW, boxH) / 2 - 8;
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

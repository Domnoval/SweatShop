/**
 * What gets drawn at a placement.
 *
 * The painter stamps a character out of a Unicode pool — `pickStamp()` builds an
 * SVG `<text>` node with `font-size: 76` and a glyph in it. That cannot come
 * across: house rule 4 forbids `<text>` on any emitted plate, and a plate whose
 * marks are font glyphs is a plate that draws differently on a machine without
 * the font. The pool was also a pure random pick, so the mark carried nothing
 * about the word.
 *
 * The stamp here is a **star polygon `{p/q}`**, and both integers are read off
 * the walked cell the stamp stands for:
 *
 *   p = 3 + (cell mod 6)                 — 3 to 8 vertices
 *   q = 1 + (digitSum(cell) mod ⌊(p−1)/2⌋) — the skip
 *
 * so the field is a sequence of figures OF the cells, laid out by the mode. A
 * plate's stamps can be counted by vertex number and the multiset of cells
 * recovered up to the mod — the stamp is a readout at the same weakened
 * resolution the cusp count is.
 *
 * When gcd(p,q) = g > 1 the skip does not close in one pass; it closes in g
 * cycles, and all g are drawn. That is the difference between {6/2} — a
 * hexagram, two triangles — and a hexagon with two thirds of its edges missing,
 * which is what stopping after the first cycle produces.
 */

import { dcos, dsin } from "./trig.js";

export type StampSpec = Readonly<{ p: number; q: number; cycles: number }>;

const digitSum = (n: number): number => {
  let v = Math.abs(Math.trunc(n));
  let s = 0;
  while (v > 0) {
    s += v % 10;
    v = Math.trunc(v / 10);
  }
  return s;
};

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

export function stampFor(cell: number): StampSpec {
  const p = 3 + (Math.abs(cell) % 6);
  // ⌊(p−1)/2⌋ is the largest skip that still produces a star rather than the
  // same polygon traversed backwards: {p/q} and {p/(p−q)} are the same figure.
  const qMax = Math.max(1, Math.floor((p - 1) / 2));
  const q = 1 + (digitSum(cell) % qMax);
  return Object.freeze({ p, q, cycles: gcd(p, q) });
}

const f = (n: number): string => n.toFixed(4);

/**
 * The stamp as absolute path data in figure units.
 *
 * Absolute, and with the rotation and translation already applied to every
 * coordinate, because the containment test has to be able to read the ink
 * position straight off the `d` string. Wrapping the stamp in a `transform`
 * would put the real coordinates one matrix away from anything that measures
 * them, which is precisely how ink leaves a viewBox unnoticed.
 *
 * Every vertex lies on the circle of radius `r` about `(cx, cy)`, and every edge
 * is a chord of it, so that circle bounds the stamp exactly — the containment
 * arithmetic upstream needs no per-vertex scan and cannot be wrong about the
 * shape it is bounding.
 */
export function stampPath(
  spec: StampSpec,
  cx: number,
  cy: number,
  r: number,
  rotationDeg: number,
): string {
  const { p, q, cycles } = spec;
  const phase = (rotationDeg * Math.PI) / 180 - Math.PI / 2;
  const vertex = (k: number): string => {
    const a = phase + (((k % p) + p) % p) * ((2 * Math.PI) / p);
    return `${f(cx + dcos(a) * r)} ${f(cy + dsin(a) * r)}`;
  };
  const parts: string[] = [];
  for (let start = 0; start < cycles; start += 1) {
    const steps = p / cycles;
    let d = `M${vertex(start)}`;
    for (let k = 1; k < steps; k += 1) d += `L${vertex(start + k * q)}`;
    parts.push(`${d}Z`);
  }
  return parts.join("");
}

/** Ratio of a Haring radiance tick's outer end to the stamp radius. Bounds depend on it. */
export const RADIANCE_REACH = 70 / 50;

/**
 * The eight ticks the painter rings a Haring stamp with, at
 * `symbolpaintermk137.html:477`: eight rays from 0.58 to 0.70 of the stamp's
 * native 100, which is 1.16 to 1.40 of its radius of 50. They sit OUTSIDE the
 * stamp, which is why `RADIANCE_REACH` and not the stamp radius bounds a Haring
 * placement.
 */
export function radiancePath(cx: number, cy: number, r: number): string {
  const inner = (58 / 50) * r;
  const outer = RADIANCE_REACH * r;
  const parts: string[] = [];
  for (let t = 0; t < 8; t += 1) {
    const a = (t * Math.PI * 2) / 8;
    parts.push(
      `M${f(cx + dcos(a) * inner)} ${f(cy + dsin(a) * inner)}` +
        `L${f(cx + dcos(a) * outer)} ${f(cy + dsin(a) * outer)}`,
    );
  }
  return parts.join("");
}

export function segmentPath(x1: number, y1: number, x2: number, y2: number): string {
  return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
}

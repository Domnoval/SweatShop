/**
 * Canonical affine matrices (spec §14.1).
 *
 * Every transform in the exported SVG is emitted as a single `matrix(...)`.
 * A transform *list* has several equivalent spellings for the same mapping, so
 * two runs could serialize differently while meaning the same thing. Collapsing
 * to one matrix removes that freedom.
 */

import { formatFixed, MATRIX_PRECISION, quantize } from "@studio137/plate-core";

/** Row-major 2D affine: `[a c e; b d f]`, matching SVG's `matrix(a b c d e f)`. */
export type Matrix = Readonly<{
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}>;

export const IDENTITY: Matrix = Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });

export function multiply(m: Matrix, n: Matrix): Matrix {
  return Object.freeze({
    a: m.a * n.a + m.c * n.b,
    b: m.b * n.a + m.d * n.b,
    c: m.a * n.c + m.c * n.d,
    d: m.b * n.c + m.d * n.d,
    e: m.a * n.e + m.c * n.f + m.e,
    f: m.b * n.e + m.d * n.f + m.f,
  });
}

export function translate(tx: number, ty: number): Matrix {
  return Object.freeze({ a: 1, b: 0, c: 0, d: 1, e: tx, f: ty });
}

export function scale(sx: number, sy: number = sx): Matrix {
  return Object.freeze({ a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 });
}

export function rotateDegrees(degrees: number): Matrix {
  const radians = (degrees * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return Object.freeze({ a: cosine, b: sine, c: -sine, d: cosine, e: 0, f: 0 });
}

/** Reflect across the vertical line `x = cx`, in the space the matrix is applied to. */
export function mirrorVertical(cx: number): Matrix {
  return Object.freeze({ a: -1, b: 0, c: 0, d: 1, e: 2 * cx, f: 0 });
}

/** Reflect across the horizontal line `y = cy`. */
export function mirrorHorizontal(cy: number): Matrix {
  return Object.freeze({ a: 1, b: 0, c: 0, d: -1, e: 0, f: 2 * cy });
}

export function formatMatrix(m: Matrix): string {
  const parts = [m.a, m.b, m.c, m.d, m.e, m.f].map((value) =>
    formatFixed(quantize(value, MATRIX_PRECISION), MATRIX_PRECISION),
  );
  return `matrix(${parts.join(" ")})`;
}

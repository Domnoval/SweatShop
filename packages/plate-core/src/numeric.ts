/**
 * Deterministic numeric and geometric primitives.
 *
 * Spec §14.1 requires fixed numeric precision and a canonical matrix
 * representation in the exported SVG, and Phase 3 requires quantized geometry
 * math. Everything that reaches an artifact passes through `quantize` first, so
 * that an irrelevant last-bit difference in a trigonometric result cannot change
 * an output hash.
 */

export type Point = Readonly<{ x: number; y: number }>;
export type Vector = Readonly<{ x: number; y: number }>;
export type Rect = Readonly<{ x: number; y: number; width: number; height: number }>;

/** Decimal places retained for coordinates in serialized artifacts. */
export const COORDINATE_PRECISION = 4;
/** Decimal places retained for affine matrix components. */
export const MATRIX_PRECISION = 6;
/** Decimal places retained for normalized 0–1 parameters. */
export const PARAMETER_PRECISION = 6;

export function assertFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${label}: expected a finite number, received ${String(value)}`);
  }
  return value;
}

/**
 * Round half away from zero at a fixed decimal place.
 *
 * `Math.round` breaks ties toward +Infinity, which makes rounding asymmetric
 * about the origin and produces `-0`. Mirrored layouts place glyphs at exactly
 * opposed coordinates, so an asymmetric rule would render the two halves of a
 * Mirrored Passage at subtly different positions.
 */
export function quantize(value: number, decimals: number = COORDINATE_PRECISION): number {
  assertFinite(value, "quantize");
  const factor = 10 ** decimals;
  const rounded = Math.round(Math.abs(value) * factor) / factor;
  const signed = value < 0 ? -rounded : rounded;
  return signed === 0 ? 0 : signed;
}

/** Deterministic fixed-precision string, with `-0` normalized and no trailing zeros. */
export function formatFixed(value: number, decimals: number = COORDINATE_PRECISION): string {
  const text = quantize(value, decimals).toFixed(decimals);
  const trimmed = text.includes(".") ? text.replace(/0+$/u, "").replace(/\.$/u, "") : text;
  return trimmed === "-0" || trimmed === "" ? "0" : trimmed;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Map a 0–100 interface control onto the compiler's normalized 0–1 domain (spec §6, §7). */
export function fromUiScale(value: number): number {
  assertFinite(value, "fromUiScale");
  return quantize(clamp(value, 0, 100) / 100, PARAMETER_PRECISION);
}

export function toUiScale(value: number): number {
  return quantize(clamp01(value) * 100, 2);
}

export function point(x: number, y: number): Point {
  return Object.freeze({ x, y });
}

export function addPoints(a: Point, b: Vector): Point {
  return point(a.x + b.x, a.y + b.y);
}

export function scaleVector(v: Vector, k: number): Vector {
  return point(v.x * k, v.y * k);
}

export function vectorLength(v: Vector): number {
  return Math.hypot(v.x, v.y);
}

export function normalizeVector(v: Vector): Vector {
  const length = vectorLength(v);
  return length === 0 ? point(0, 0) : point(v.x / length, v.y / length);
}

/** Rotate a vector 90° counter-clockwise in SVG's y-down coordinate space. */
export function perpendicular(v: Vector): Vector {
  return point(-v.y, v.x);
}

export function rectCenter(rect: Rect): Point {
  return point(rect.x + rect.width / 2, rect.y + rect.height / 2);
}

export function insetRect(rect: Rect, inset: number): Rect {
  return Object.freeze({
    x: rect.x + inset,
    y: rect.y + inset,
    width: Math.max(0, rect.width - inset * 2),
    height: Math.max(0, rect.height - inset * 2),
  });
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

/** Axis-aligned bounding box of a point set. Throws on an empty set. */
export function boundsOf(points: readonly Point[]): Rect {
  if (points.length === 0) {
    throw new Error("boundsOf: expected at least one point");
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY });
}

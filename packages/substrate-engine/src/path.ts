/**
 * Deterministic path construction for substrate guide geometry.
 *
 * Every coordinate is quantized before it becomes a string, so a substrate
 * sampled twice serializes identically (spec §14.1).
 */

import { COORDINATE_PRECISION, formatFixed, type Point } from "@studio137/plate-core";

export function moveTo(p: Point): string {
  return `M${formatFixed(p.x, COORDINATE_PRECISION)} ${formatFixed(p.y, COORDINATE_PRECISION)}`;
}

export function lineTo(p: Point): string {
  return `L${formatFixed(p.x, COORDINATE_PRECISION)} ${formatFixed(p.y, COORDINATE_PRECISION)}`;
}

export function polylinePath(points: readonly Point[], closed = false): string {
  if (points.length === 0) return "";
  const parts = [moveTo(points[0]!), ...points.slice(1).map(lineTo)];
  if (closed) parts.push("Z");
  return parts.join(" ");
}

/** A full circle expressed as two arcs, so it needs no `<circle>` element. */
export function circlePath(center: Point, radius: number): string {
  const r = formatFixed(radius, COORDINATE_PRECISION);
  const left = formatFixed(center.x - radius, COORDINATE_PRECISION);
  const right = formatFixed(center.x + radius, COORDINATE_PRECISION);
  const y = formatFixed(center.y, COORDINATE_PRECISION);
  return `M${left} ${y} A ${r} ${r} 0 1 0 ${right} ${y} A ${r} ${r} 0 1 0 ${left} ${y} Z`;
}

export function segmentPath(a: Point, b: Point): string {
  return `${moveTo(a)} ${lineTo(b)}`;
}

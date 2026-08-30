/**
 * Deterministic mask and interference geometry.
 *
 * These shapes are presentation-only. Nothing here can reach a canonical glyph
 * path: the functions take bounds and emit new paths, and never receive path
 * data to modify.
 */

import {
  COORDINATE_PRECISION,
  formatFixed,
  type DeterministicStream,
  type Rect,
} from "@studio137/plate-core";

export function rectPath(rect: Rect): string {
  const x = formatFixed(rect.x, COORDINATE_PRECISION);
  const y = formatFixed(rect.y, COORDINATE_PRECISION);
  const right = formatFixed(rect.x + rect.width, COORDINATE_PRECISION);
  const bottom = formatFixed(rect.y + rect.height, COORDINATE_PRECISION);
  return `M${x} ${y} L${right} ${y} L${right} ${bottom} L${x} ${bottom} Z`;
}

export function linePath(x1: number, y1: number, x2: number, y2: number): string {
  const f = (value: number): string => formatFixed(value, COORDINATE_PRECISION);
  return `M${f(x1)} ${f(y1)} L${f(x2)} ${f(y2)}`;
}

/**
 * Occlusion mask shapes covering roughly `coverage` of a glyph's bounds.
 *
 * The glyph's box is divided into a fixed grid and cells are drawn from a
 * dedicated stream. Recording the stream fork name is enough to replay the exact
 * geometry later, which is why the manifest stores a seed name rather than a
 * dump of every mask coordinate (spec §18.2).
 */
export function occlusionShapes(
  bounds: Rect,
  coverage: number,
  rng: DeterministicStream,
): readonly Readonly<{ d: string }>[] {
  const columns = 4;
  const rows = 4;
  const cells: Rect[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push(
        Object.freeze({
          x: bounds.x + (bounds.width * column) / columns,
          y: bounds.y + (bounds.height * row) / rows,
          width: bounds.width / columns,
          height: bounds.height / rows,
        }),
      );
    }
  }

  const wanted = Math.max(1, Math.min(cells.length, Math.round(coverage * cells.length)));
  const chosen = rng.shuffle(cells).slice(0, wanted);
  // Sort so the emitted shape order does not depend on shuffle order, keeping
  // the serialized mask byte-stable for a given selection.
  const ordered = chosen.sort((a, b) => a.y - b.y || a.x - b.x);
  return Object.freeze(ordered.map((cell) => Object.freeze({ d: rectPath(cell) })));
}

/** Surface interference strokes across a region. */
export function interferenceShapes(
  bounds: Rect,
  count: number,
  rng: DeterministicStream,
  weightBase: number,
): readonly Readonly<{ d: string; strokeWidth: number; weight: number }>[] {
  const unit = Math.min(bounds.width, bounds.height);
  const shapes: Readonly<{ d: string; strokeWidth: number; weight: number }>[] = [];
  for (let index = 0; index < count; index += 1) {
    const y = bounds.y + rng.nextUnit() * bounds.height;
    const startX = bounds.x + rng.nextUnit() * bounds.width * 0.6;
    const length = bounds.width * (0.12 + rng.nextUnit() * 0.5);
    const drift = (rng.nextUnit() - 0.5) * unit * 0.02;
    shapes.push(
      Object.freeze({
        d: linePath(startX, y, Math.min(bounds.x + bounds.width, startX + length), y + drift),
        strokeWidth: unit * (0.0006 + rng.nextUnit() * 0.0018),
        weight: weightBase * (0.4 + rng.nextUnit() * 0.6),
      }),
    );
  }
  return Object.freeze(shapes);
}

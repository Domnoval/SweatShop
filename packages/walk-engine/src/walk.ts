/**
 * Station 2 — Walk. Cells to a drawn line.
 *
 * Ported from `assets/esotericacodexmk137.html:572` and its renderer, which is the
 * most complete of the studio's three walks: seven squares, three ciphers, five
 * traces, start and end caps, and the SPARE dedupe. The other two die here.
 *
 * One convention is added rather than ported: the **loop glyph**. Where two
 * consecutive letters land on the same cell, the source engines emit a
 * zero-length segment — information the walk genuinely contains, rendered as
 * nothing. DESCENT is the case that exposes it: E and N both resolve to 5, so
 * the doubled beat at the heart of the word is invisible. A loop draws it.
 *
 * Coordinates keep the source's frame exactly — margin 26 in a 220 box — so that
 * every figure drawn by the three HTML instruments before this package remains
 * comparable with figures drawn after it. The painter's margin of 24 is the odd
 * one out and does not survive; adopting it would have shifted every coordinate
 * relative to the existing corpus for no gain.
 */

import { resolve, type Resolution } from "./resolve.js";
import { kamea, positions, type SquareId } from "./squares.js";
import type { CipherId } from "./cipher.js";

export const TRACE_IDS = ["LINEA", "CURVA", "ROSETTA", "AGRIPPA", "SPARE"] as const;
export type TraceId = (typeof TRACE_IDS)[number];

/** Roles a walk emits, so a renderer can style them without parsing path data. */
export type WalkPathRole = "line" | "loop" | "start-cap" | "end-cap" | "node";

export type WalkPath = Readonly<{ d: string; role: WalkPathRole }>;

export type Point = readonly [number, number];

export type WalkStep = Readonly<{
  index: number;
  letter: string;
  value: number;
  cell: number;
  row: number;
  col: number;
  x: number;
  y: number;
  /** True when this step lands on the same cell as the step before it. */
  repeatsPrevious: boolean;
}>;

export type Walk = Readonly<{
  input: string;
  square: SquareId;
  cipher: CipherId;
  trace: TraceId;
  order: number;
  /** The frame the coordinates live in: `[minX, minY, width, height]`. */
  viewBox: readonly [number, number, number, number];
  steps: readonly WalkStep[];
  points: readonly Point[];
  paths: readonly WalkPath[];
  /**
   * Distinct cell values the walk touched, ascending. The count is a property of
   * this word on this square — it is not a constant of the square.
   */
  activatedCells: readonly number[];
  /** Straight-line segments actually drawn; repeats contribute a loop, not a segment. */
  segmentCount: number;
  loopCount: number;
  resolution: Resolution;
}>;

/** Source frame: a 220-unit box with a 26-unit margin on every side. */
const MARGIN = 26;
const BOX = 220;
const SPAN = BOX - MARGIN * 2;

const f = (n: number): string => n.toFixed(4);

export function cellXY(row: number, col: number, order: number): Point {
  const step = SPAN / order;
  return [MARGIN + step * (col + 0.5), MARGIN + step * (row + 0.5)];
}

function straight(points: readonly Point[]): string {
  return points.map((p, i) => `${i === 0 ? "M" : "L"}${f(p[0])} ${f(p[1])}`).join(" ");
}

/** Catmull-Rom through the points, expressed as cubics. Ported verbatim. */
function smooth(points: readonly Point[], closed: boolean): string {
  if (points.length < 3) return straight(points);
  const first = points[0]!;
  const last = points[points.length - 1]!;
  const a: Point[] = closed
    ? [last, ...points, first, points[1]!]
    : [first, ...points, last];

  let d = `M${f(first[0])} ${f(first[1])}`;
  const n = closed ? points.length : points.length - 1;
  for (let i = 0; i < n; i += 1) {
    const p0 = a[i]!, p1 = a[i + 1]!, p2 = a[i + 2]!, p3 = a[i + 3]!;
    const c1: Point = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2: Point = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  if (closed) d += " Z";
  return d;
}

/**
 * A circle tangent to the path at `at`, on the left of the incoming direction.
 *
 * Two half-arcs rather than one, because a single arc command cannot close a full
 * circle — start and end would coincide and the arc would be discarded.
 */
function loopPath(at: Point, normal: Point, radius: number): string {
  const r = Math.min(radius, maxLoopRadius(at));
  const far: Point = [at[0] + normal[0] * r * 2, at[1] + normal[1] * r * 2];
  return (
    `M${f(at[0])} ${f(at[1])}` +
    ` A${f(r)} ${f(r)} 0 1 1 ${f(far[0])} ${f(far[1])}` +
    ` A${f(r)} ${f(r)} 0 1 1 ${f(at[0])} ${f(at[1])}`
  );
}

/**
 * The largest loop that still fits the frame from `at`.
 *
 * A loop of radius `r` reaches at most `2r` from its node in any direction, so
 * half the distance to the nearest edge is the ceiling. Without it, nested loops
 * grow without bound and the figure leaves its own viewBox: ZZZZZZZZZ walks nine
 * letters onto one Jupiter cell and its eighth loop reached 246 in a 220 box —
 * ink that a browser would have cropped into looking correct, and that layout
 * would have reserved space for regardless.
 */
/**
 * Unit normal of the segment arriving at `points[i]` — where a loop hangs.
 *
 * Exported because the reader needs the identical rule. A loop's placement is
 * what tells the reader which *visit* it belongs to when a walk touches one cell
 * more than once, so writer and reader must agree exactly. Two copies of this
 * calculation that drift apart would put the doubled beat on the wrong syllable
 * and the round trip would fail with no error anywhere.
 */
export function arrivalNormal(points: readonly Point[], i: number): Point {
  const at = points[i]!;
  const prev = i > 0 ? points[i - 1] : undefined;
  const next = i + 1 < points.length ? points[i + 1] : undefined;
  const inc: Point =
    prev !== undefined && (prev[0] !== at[0] || prev[1] !== at[1])
      ? [at[0] - prev[0], at[1] - prev[1]]
      : next !== undefined && (next[0] !== at[0] || next[1] !== at[1])
        ? [next[0] - at[0], next[1] - at[1]]
        : [0, -1];
  const len = Math.hypot(inc[0], inc[1]) || 1;
  return [-inc[1] / len, inc[0] / len];
}

function maxLoopRadius(at: Point): number {
  const toEdge = Math.min(at[0], at[1], BOX - at[0], BOX - at[1]);
  return Math.max(0, toEdge / 2);
}

export type WalkOptions = Readonly<{
  square?: SquareId;
  cipher?: CipherId;
  trace?: TraceId;
}>;

export function walk(input: string, options: WalkOptions = {}): Walk {
  const squareId = options.square ?? "jupiter";
  const cipher = options.cipher ?? "PYTH";
  const trace = options.trace ?? "AGRIPPA";
  const square = kamea(squareId);
  const pos = positions(squareId);

  const resolution = resolve(input, square.n, cipher);

  // SPARE walks each distinct *letter* once, keeping first occurrence — the
  // source dedupes letters, not cells, and two letters may share a cell.
  const seen = new Set<string>();
  const chosen = resolution.letters.filter((l) => {
    if (trace !== "SPARE") return true;
    if (seen.has(l.letter)) return false;
    seen.add(l.letter);
    return true;
  });

  const steps: WalkStep[] = chosen.map((l, i) => {
    const [row, col] = pos.get(l.cell) ?? [0, 0];
    const [x, y] = cellXY(row, col, square.n);
    return Object.freeze({
      index: i,
      letter: l.letter,
      value: l.value,
      cell: l.cell,
      row,
      col,
      x,
      y,
      repeatsPrevious: i > 0 && chosen[i - 1]!.cell === l.cell,
    });
  });

  const points: Point[] = steps.map((s) => [s.x, s.y] as Point);

  // The line runs through distinct consecutive positions; a repeat contributes a
  // loop instead of a zero-length segment.
  const linePoints: Point[] = [];
  const loopsPerLinePoint: number[] = [];
  steps.forEach((s, i) => {
    if (s.repeatsPrevious) {
      // Belongs to the visit already on the line, not to a coordinate lookup —
      // a cell touched twice has two visits at identical coordinates, and
      // searching by position attaches the beat to whichever came first.
      const last = loopsPerLinePoint.length - 1;
      if (last >= 0) loopsPerLinePoint[last] = loopsPerLinePoint[last]! + 1;
      return;
    }
    linePoints.push(points[i]!);
    loopsPerLinePoint.push(0);
  });
  const loopCount = loopsPerLinePoint.reduce((a, b) => a + b, 0);

  const paths: WalkPath[] = [];
  const closed = trace === "ROSETTA";
  const caps = trace === "ROSETTA" || trace === "AGRIPPA";

  if (linePoints.length > 1) {
    const d =
      trace === "LINEA" || trace === "AGRIPPA"
        ? straight(linePoints)
        : smooth(linePoints, closed);
    paths.push(Object.freeze({ d, role: "line" as const }));
  }

  const cellStep = SPAN / square.n;
  loopsPerLinePoint.forEach((count, j) => {
    if (count === 0) return;
    const at = linePoints[j]!;
    const normal = arrivalNormal(linePoints, j);
    for (let k = 1; k <= count; k += 1) {
      paths.push(
        Object.freeze({
          d: loopPath(at, normal, cellStep * 0.18 * (1 + 0.55 * (k - 1))),
          role: "loop" as const,
        }),
      );
    }
  });

  if (caps && linePoints.length > 0) {
    const start = linePoints[0]!;
    const r = 5;
    paths.push(
      Object.freeze({
        d:
          `M${f(start[0] - r)} ${f(start[1])}` +
          ` A${f(r)} ${f(r)} 0 1 1 ${f(start[0] + r)} ${f(start[1])}` +
          ` A${f(r)} ${f(r)} 0 1 1 ${f(start[0] - r)} ${f(start[1])}`,
        role: "start-cap" as const,
      }),
    );
    if (linePoints.length > 1) {
      const end = linePoints[linePoints.length - 1]!;
      const pen = linePoints[linePoints.length - 2]!;
      const angle = Math.atan2(end[1] - pen[1], end[0] - pen[0]) + Math.PI / 2;
      const bl = 7;
      paths.push(
        Object.freeze({
          d:
            `M${f(end[0] + Math.cos(angle) * bl)} ${f(end[1] + Math.sin(angle) * bl)}` +
            ` L${f(end[0] - Math.cos(angle) * bl)} ${f(end[1] - Math.sin(angle) * bl)}`,
          role: "end-cap" as const,
        }),
      );
    }
  }

  return Object.freeze({
    input,
    square: squareId,
    cipher,
    trace,
    order: square.n,
    viewBox: Object.freeze([0, 0, BOX, BOX] as const),
    steps: Object.freeze(steps),
    points: Object.freeze(points.map((p) => Object.freeze(p))),
    paths: Object.freeze(paths),
    activatedCells: Object.freeze([...new Set(steps.map((s) => s.cell))].sort((a, b) => a - b)),
    segmentCount: Math.max(0, linePoints.length - 1),
    loopCount,
    resolution,
  });
}

/**
 * The seven planetary kamea.
 *
 * Transcribed from `assets/esotericacodexmk137.html:546`, which is the only one
 * of the studio's three walk implementations carrying all seven — the derivation
 * codex has four (no Sol, Venus or Mercury) and the painter's is unciphered. The
 * squares below are verified magic at load (`assertMagic`) rather than trusted,
 * because a transcription slip in a 9x9 grid is invisible to the eye and would
 * silently relocate every mark walked on it.
 */

import { PlateError } from "@studio137/plate-core";

export const SQUARE_IDS = [
  "saturn",
  "jupiter",
  "mars",
  "sol",
  "venus",
  "mercury",
  "luna",
] as const;

export type SquareId = (typeof SQUARE_IDS)[number];

export type Kamea = Readonly<{
  id: SquareId;
  /** Order of the square: 3 for Saturn through 9 for Luna. */
  n: number;
  /** Rows, top to bottom. */
  grid: readonly (readonly number[])[];
  /** The constant every row, column and diagonal sums to. */
  magicConstant: number;
}>;

const GRIDS: Readonly<Record<SquareId, readonly (readonly number[])[]>> = Object.freeze({
  saturn: [
    [4, 9, 2],
    [3, 5, 7],
    [8, 1, 6],
  ],
  jupiter: [
    [16, 3, 2, 13],
    [5, 10, 11, 8],
    [9, 6, 7, 12],
    [4, 15, 14, 1],
  ],
  mars: [
    [11, 24, 7, 20, 3],
    [4, 12, 25, 8, 16],
    [17, 5, 13, 21, 9],
    [10, 18, 1, 14, 22],
    [23, 6, 19, 2, 15],
  ],
  sol: [
    [6, 32, 3, 34, 35, 1],
    [7, 11, 27, 28, 8, 30],
    [19, 14, 16, 15, 23, 24],
    [18, 20, 22, 21, 17, 13],
    [25, 29, 10, 9, 26, 12],
    [36, 5, 33, 4, 2, 31],
  ],
  venus: [
    [22, 47, 16, 41, 10, 35, 4],
    [5, 23, 48, 17, 42, 11, 29],
    [30, 6, 24, 49, 18, 36, 12],
    [13, 31, 7, 25, 43, 19, 37],
    [38, 14, 32, 1, 26, 44, 20],
    [21, 39, 8, 33, 2, 27, 45],
    [46, 15, 40, 9, 34, 3, 28],
  ],
  mercury: [
    [8, 58, 59, 5, 4, 62, 63, 1],
    [49, 15, 14, 52, 53, 11, 10, 56],
    [41, 23, 22, 44, 45, 19, 18, 48],
    [32, 34, 35, 29, 28, 38, 39, 25],
    [40, 26, 27, 37, 36, 30, 31, 33],
    [17, 47, 46, 20, 21, 43, 42, 24],
    [9, 55, 54, 12, 13, 51, 50, 16],
    [64, 2, 3, 61, 60, 6, 7, 57],
  ],
  luna: [
    [37, 78, 29, 70, 21, 62, 13, 54, 5],
    [6, 38, 79, 30, 71, 22, 63, 14, 46],
    [47, 7, 39, 80, 31, 72, 23, 55, 15],
    [16, 48, 8, 40, 81, 32, 64, 24, 56],
    [57, 17, 49, 9, 41, 73, 33, 65, 25],
    [26, 58, 18, 50, 1, 42, 74, 34, 66],
    [67, 27, 59, 10, 51, 2, 43, 75, 35],
    [36, 68, 19, 60, 11, 52, 3, 44, 76],
    [77, 28, 69, 20, 61, 12, 53, 4, 45],
  ],
});

/** `n(n²+1)/2` — the sum every line of an order-`n` magic square must reach. */
export function magicConstant(n: number): number {
  return (n * (n * n + 1)) / 2;
}

/**
 * Reject a square that is not magic, or whose values are not exactly `1..n²`.
 *
 * Called once per square at module load. A walk reads cells by *value*, so a
 * duplicated or missing value does not throw at walk time — it silently maps two
 * different letters onto the same cell, or throws a bare undefined lookup deep in
 * the path builder. Failing here names the square instead.
 */
export function assertMagic(id: SquareId, grid: readonly (readonly number[])[]): number {
  const n = grid.length;
  const target = magicConstant(n);
  const flat = grid.flatMap((row) => [...row]);

  const problems: string[] = [];
  if (flat.length !== n * n) problems.push(`holds ${flat.length} values, expected ${n * n}`);

  const sorted = [...flat].sort((a, b) => a - b);
  const complete = sorted.every((v, i) => v === i + 1);
  if (!complete) problems.push(`values are not exactly 1..${n * n}`);

  grid.forEach((row, r) => {
    const sum = row.reduce((a, b) => a + b, 0);
    if (sum !== target) problems.push(`row ${r} sums to ${sum}, expected ${target}`);
  });
  for (let c = 0; c < n; c += 1) {
    const sum = grid.reduce((a, row) => a + (row[c] ?? 0), 0);
    if (sum !== target) problems.push(`column ${c} sums to ${sum}, expected ${target}`);
  }
  const d1 = grid.reduce((a, row, i) => a + (row[i] ?? 0), 0);
  const d2 = grid.reduce((a, row, i) => a + (row[n - 1 - i] ?? 0), 0);
  if (d1 !== target) problems.push(`leading diagonal sums to ${d1}, expected ${target}`);
  if (d2 !== target) problems.push(`counter diagonal sums to ${d2}, expected ${target}`);

  if (problems.length > 0) {
    throw new PlateError(
      "INVALID_REQUEST",
      `The ${id} kamea is not a magic square: ${problems.join("; ")}.`,
      { square: id, problems },
    );
  }
  return target;
}

const SQUARES: Readonly<Record<SquareId, Kamea>> = Object.freeze(
  Object.fromEntries(
    SQUARE_IDS.map((id) => {
      const grid = GRIDS[id];
      const constant = assertMagic(id, grid);
      return [
        id,
        Object.freeze({
          id,
          n: grid.length,
          grid: Object.freeze(grid.map((row) => Object.freeze([...row]))),
          magicConstant: constant,
        }),
      ];
    }),
  ) as Record<SquareId, Kamea>,
);

export function kamea(id: SquareId): Kamea {
  const square = SQUARES[id];
  if (square === undefined) {
    throw new PlateError("INVALID_REQUEST", `Unknown kamea "${id}".`, {
      requested: id,
      known: SQUARE_IDS,
    });
  }
  return square;
}

export function isSquareId(value: string): value is SquareId {
  return (SQUARE_IDS as readonly string[]).includes(value);
}

/** Cell value to `[row, column]`. Built once per square, memoised. */
const POSITIONS = new Map<SquareId, ReadonlyMap<number, readonly [number, number]>>();

export function positions(id: SquareId): ReadonlyMap<number, readonly [number, number]> {
  const cached = POSITIONS.get(id);
  if (cached !== undefined) return cached;
  const { grid } = kamea(id);
  const map = new Map<number, readonly [number, number]>();
  grid.forEach((row, r) => row.forEach((value, c) => map.set(value, Object.freeze([r, c]))));
  POSITIONS.set(id, map);
  return map;
}

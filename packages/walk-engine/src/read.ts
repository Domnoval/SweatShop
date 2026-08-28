/**
 * Station 5 — Read. Geometry back to words.
 *
 * House rule 8: **the read is blind.** Everything here derives from the drawn
 * path plus public rules. Nothing consults the private manifest, the master key,
 * or any record of what was compiled. The CLI's existing `decode` verb does the
 * opposite — it opens an encrypted envelope and recovers the phrase from inside
 * it — and that proves only that a copy was kept, never that the mark carries the
 * word. If this module were ever allowed to fall back on it, the round-trip audit
 * would pass while measuring nothing.
 *
 * Three conventions that look decorative turn out to be load-bearing here, which
 * is the best argument that they belong:
 *
 *   - The **loop glyph** is what makes the walk invertible. DESCENT collapses to
 *     six line points because E and N share a cell; without a loop marking the
 *     doubled beat, the figure reads back as a six-letter word and the round trip
 *     fails by construction.
 *   - The **start cap** is what fixes direction. An uncapped line is symmetric
 *     under reversal, so the reader cannot know which end was spoken first and
 *     every word has a mirror twin competing with it.
 *   - The **start cap is also the node** when the walk never leaves one cell. AS
 *     puts both letters on Jupiter cell 1, so the walk has one point, no segment,
 *     and `walk()` emits no line at all — cap and loop only. A reader that looks
 *     for a line first and gives up when there is none returns nothing for AS,
 *     A, WE, ZZ and every other word whose letters share a cell; reading the cap
 *     and the loop nodes instead returns 1·1. The prediction is measurable both
 *     ways: delete `capCentre` below and a one-letter AGRIPPA figure goes blank
 *     again (it has no loops to fall back on); delete the loop branch of
 *     `figurePoints` and a LINEA figure of ZZ goes blank (it has no cap).
 */

import { cipherValue, type CipherId } from "./cipher.js";
import { kamea, SQUARE_IDS, type SquareId } from "./squares.js";
import { arrivalNormal, type WalkPath } from "./walk.js";

const MARGIN = 26;
const BOX = 220;
const SPAN = BOX - MARGIN * 2;

/**
 * Coordinate agreement, in figure units.
 *
 * Path data is written to four decimals and adjacent cells are never closer than
 * 18.667 units (Luna, the finest square), so 1e-3 accepts every coordinate that
 * survived rounding and still rejects two distinct cells by four orders of
 * magnitude.
 */
const near = (a: number, b: number): boolean => Math.abs(a - b) < 1e-3;

/** Every letter that could have produced each value, under a given cipher. */
export function inverseCipher(cipher: CipherId): ReadonlyMap<number, readonly string[]> {
  const map = new Map<number, string[]>();
  for (const letter of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    const v = cipherValue(letter, cipher);
    const bucket = map.get(v);
    if (bucket === undefined) map.set(v, [letter]);
    else bucket.push(letter);
  }
  return new Map([...map].map(([k, v]) => [k, Object.freeze([...v].sort())] as const));
}

/** On-curve points of a path, ignoring cubic control points. */
function onCurvePoints(d: string): [number, number][] {
  const out: [number, number][] = [];
  const tokens = d.match(/[MLC][^MLCAZ]*/gu) ?? [];
  for (const token of tokens) {
    const nums = (token.slice(1).match(/-?\d+(?:\.\d+)?/gu) ?? []).map(Number);
    if (token[0] === "C") {
      // Two control points then the endpoint; only the endpoint is on the curve.
      for (let i = 5; i < nums.length; i += 6) out.push([nums[i - 1]!, nums[i]!]);
    } else {
      for (let i = 1; i < nums.length; i += 2) out.push([nums[i - 1]!, nums[i]!]);
    }
  }
  return out;
}

/**
 * The two ends of a path's first arc: the `M` point and where the first `A`
 * lands.
 *
 * Loops and caps are the same shape — a circle drawn as two half-arcs, because a
 * single arc command whose start and end coincide is discarded — so they are
 * parsed once here rather than twice. Two parsers that drifted apart would put a
 * loop's node and a cap's node on different lattices and the reader would decide
 * a figure disagrees with itself.
 */
function firstArcSpan(
  d: string,
): Readonly<{ from: readonly [number, number]; to: readonly [number, number] }> | undefined {
  const m = d.match(
    /M\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*A[^A]*?(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*(?:A|$)/u,
  );
  if (m === null) return undefined;
  return Object.freeze({
    from: Object.freeze([Number(m[1]), Number(m[2])] as const),
    to: Object.freeze([Number(m[3]), Number(m[4])] as const),
  });
}

/**
 * A loop's node and the unit normal it was hung on.
 *
 * The node alone is not enough to place a loop. A walk may visit one cell twice
 * without the visits being consecutive — DESCENT touches cell 5 at position 1 and
 * again at 4 — and both visits draw at identical coordinates. Matching by
 * coordinate attaches the loop to whichever visit comes first and silently moves
 * the doubled beat to the wrong syllable.
 *
 * What separates them is direction. The loop is hung on the normal of the segment
 * arriving at that visit, and those arrivals differ, so the far point of the first
 * arc recovers which visit the loop belongs to.
 */
function loopFrame(d: string): Readonly<{ node: [number, number]; normal: [number, number] }> | undefined {
  const span = firstArcSpan(d);
  if (span === undefined) return undefined;
  const node: [number, number] = [span.from[0], span.from[1]];
  const dx = span.to[0] - node[0];
  const dy = span.to[1] - node[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return undefined;
  return Object.freeze({ node, normal: [dx / len, dy / len] as [number, number] });
}

/**
 * The cell a start cap was drawn around.
 *
 * The cap is a circle centred on the first point of the walk, drawn from
 * `centre - r` to `centre + r` along x, so the midpoint of its first arc is the
 * node itself and the radius cancels. Taking the `M` point instead would report a
 * node five units to the left of the truth, which on Jupiter is an eighth of a
 * cell — inside the lattice tolerance for the wrong reason on some cells and
 * outside it on others, so the error would show up as an intermittently missing
 * square rather than as a shift.
 */
function capCentre(d: string): [number, number] | undefined {
  const span = firstArcSpan(d);
  if (span === undefined) return undefined;
  return [(span.from[0] + span.to[0]) / 2, (span.from[1] + span.to[1]) / 2];
}

/**
 * The walk's points, in walk order, from whatever the figure actually carries.
 *
 * The line is the whole answer when there is one: its `d` is written start to
 * end, so the order comes with it. But `walk()` only emits a line when two
 * consecutive letters land on *different* cells — one point is not a segment —
 * and a word whose letters all share a cell therefore draws no line at all. What
 * it draws instead is a cap at that node and one loop per repeat, and those carry
 * the node just as exactly.
 *
 * Nodes that disagree are refused rather than guessed. Two distinct nodes with no
 * line between them fix no order: the cap says which is first and nothing says
 * what follows, so any sequence this returned would be invented. `walk()` never
 * emits that figure — loops hang on line points, and a figure with one line point
 * has one node — so refusing costs nothing on real plates and keeps a hand-made
 * or damaged one from reading back a word it does not carry.
 */
function figurePoints(paths: readonly WalkPath[]): readonly [number, number][] {
  const line = paths.find((p) => p.role === "line");
  if (line !== undefined) return onCurvePoints(line.d);

  const nodes: [number, number][] = [];
  for (const path of paths) {
    const node =
      path.role === "start-cap"
        ? capCentre(path.d)
        : path.role === "loop"
          ? loopFrame(path.d)?.node
          : undefined;
    if (node !== undefined) nodes.push(node);
  }
  const first = nodes[0];
  if (first === undefined) return [];
  return nodes.every((n) => near(n[0], first[0]) && near(n[1], first[1])) ? [first] : [];
}

/**
 * Every square order whose lattice explains the points.
 *
 * Cell centres sit at `26 + (168/n)(i + 0.5)`, so for a correct `n` every point
 * lands on a half-step of that lattice. Wrong orders miss. Inferring rather than
 * being told keeps the read honest: the order is not smuggled in from the
 * compile, it is measured off the drawing.
 *
 * The tolerance is set by how coarsely path data is written, not by taste. Four
 * decimal places on a Luna step of 18.667 leaves about 5e-6 of slack in the cell
 * index, so a 1e-6 gate rejects the correct order — as it did here, silently
 * returning "no square explains this" for every 9x9 walk. Adjacent cells differ
 * by a whole unit, so 1e-3 keeps every wrong order out with room to spare.
 *
 * All of them, not the first: a lattice is only pinned down by points that
 * disagree about it. Six points spread over Jupiter fit n=4 and nothing else, but
 * a single point at 110 is the centre cell of every odd square (3, 5, 7 and 9 all
 * put a cell centre there), and a point on Saturn's lattice is always on Luna's
 * as well because 9 = 3·3 puts a cell centre on every Saturn one. Returning only
 * the coarsest fit would print `order 3` for a one-cell Luna figure with the same
 * confidence it prints `order 4` for DESCENT, and the receipt would carry a
 * square the drawing never named.
 */
export function inferOrders(points: readonly (readonly [number, number])[]): readonly number[] {
  // No points, no lattice. Without this an empty set vacuously fits every order
  // and the coarsest would be reported as measured.
  if (points.length === 0) return Object.freeze([]);
  const fits = (n: number): boolean => {
    const step = SPAN / n;
    return points.every(([x, y]) =>
      [x, y].every((v) => {
        const i = (v - MARGIN) / step - 0.5;
        return Math.abs(i - Math.round(i)) < 1e-3 && Math.round(i) >= 0 && Math.round(i) < n;
      }),
    );
  };
  const orders: number[] = [];
  // Ascending, so the coarsest lattice that explains the points comes first. A
  // finer square can always host the points of a coarser one at alternate
  // positions.
  for (let n = 3; n <= 9; n += 1) if (fits(n)) orders.push(n);
  return Object.freeze(orders);
}

/** The coarsest order that explains the points, or none. */
export function inferOrder(points: readonly (readonly [number, number])[]): number | undefined {
  return inferOrders(points)[0];
}

export type Reading = Readonly<{
  /** Cells in walk order for the first consistent reading. */
  cells: readonly number[];
  /** Every cell sequence the drawing admits. More than one means the figure is ambiguous. */
  readings: readonly (readonly number[])[];
  order: number | undefined;
  square: SquareId | undefined;
  /**
   * Every order the drawing's lattice admits, ascending; `order` is the first.
   * More than one means the figure does not name its own square — one point sits
   * on several lattices — and each is expanded into `readings`.
   */
  orders: readonly number[];
  /** The squares those orders name, parallel to `orders`. */
  squares: readonly SquareId[];
  /** Words from the supplied vocabulary that produce exactly these cells. */
  matches: readonly string[];
  /** Total letter sequences consistent with the cells, whether or not words. */
  candidateCount: number;
  /** True when expansion hit its ceiling and `candidateCount` is a floor. */
  truncated: boolean;
  /**
   * True when a loop could be hung on more than one visit — two arrivals at one
   * cell from the same direction. The reading is then one of several, not the one.
   */
  ambiguousLoops: boolean;
}>;

export type ReadOptions = Readonly<{
  square?: SquareId;
  cipher?: CipherId;
  /** Words to test against. The reader carries no vocabulary of its own. */
  vocabulary?: readonly string[];
  /** Ceiling on raw expansion when no vocabulary prunes it. */
  maxCandidates?: number;
}>;

const EMPTY_READING: Reading = Object.freeze({
  cells: Object.freeze([]),
  readings: Object.freeze([]),
  order: undefined,
  square: undefined,
  orders: Object.freeze([]),
  squares: Object.freeze([]),
  matches: Object.freeze([]),
  candidateCount: 0,
  truncated: false,
  ambiguousLoops: false,
});

/**
 * Read a drawn walk back to the words that could have produced it.
 *
 * Expansion is prefix-pruned against the vocabulary rather than enumerated. Each
 * cell admits two or three letters, so a raw product is 3^n — a fifteen-letter
 * word is fourteen million sequences, and the audit would spend its life there.
 * Pruning at each depth against the set of live prefixes keeps it linear in the
 * number of words that actually survive.
 */
export function read(paths: readonly WalkPath[], options: ReadOptions = {}): Reading {
  const cipher = options.cipher ?? "PYTH";
  const points = figurePoints(paths);

  const orders =
    options.square !== undefined ? [kamea(options.square).n] : [...inferOrders(points)];
  if (orders.length === 0 || points.length === 0) return EMPTY_READING;

  // One lattice per admitted order. The cell a coordinate names depends on which
  // square is being read, so an ambiguous order is not one reading with a caveat
  // — it is several readings, expanded like ambiguous loop placement below.
  const lattices = orders.map((order) => {
    const squareId = options.square ?? SQUARE_IDS.find((id) => kamea(id).n === order);
    const grid = squareId === undefined ? undefined : kamea(squareId).grid;
    const step = SPAN / order;
    return {
      order,
      squareId,
      cells: points.map(([x, y]) => {
        const col = Math.round((x - MARGIN) / step - 0.5);
        const row = Math.round((y - MARGIN) / step - 0.5);
        return grid?.[row]?.[col] ?? 0;
      }),
    };
  });

  // Loops carry the repeats the line collapsed out. Each is matched to a visit by
  // node *and* arrival direction, so a cell touched twice keeps its beats apart.
  const frames = paths
    .filter((p) => p.role === "loop")
    .map((p) => loopFrame(p.d))
    .filter((f): f is NonNullable<typeof f> => f !== undefined);

  // Loops sharing a node and a normal are one nested run — their radii step
  // outward from the first, so a run cannot be split between two visits without
  // repeating a radius. The run therefore moves as a unit.
  const runs: { node: [number, number]; normal: [number, number]; count: number }[] = [];
  for (const frame of frames) {
    const existing = runs.find(
      (r) =>
        near(r.node[0], frame.node[0]) &&
        near(r.node[1], frame.node[1]) &&
        near(r.normal[0], frame.normal[0]) &&
        near(r.normal[1], frame.normal[1]),
    );
    if (existing === undefined) {
      runs.push({ node: [...frame.node] as [number, number], normal: [...frame.normal] as [number, number], count: 1 });
    } else {
      existing.count += 1;
    }
  }

  // A run may fit more than one visit: a walk that leaves a cell and comes back
  // the same way arrives twice from the same direction, and the two drawings are
  // point-for-point identical. BETWEEN does exactly this (2-5-2-5). Rather than
  // guess, enumerate every consistent reading and let the caller see all of them.
  const placements = runs.map((run) =>
    points
      .map((p, i) => i)
      .filter((i) => {
        const p = points[i]!;
        if (!near(p[0], run.node[0]) || !near(p[1], run.node[1])) return false;
        const n = arrivalNormal(points, i);
        return near(n[0], run.normal[0]) && near(n[1], run.normal[1]);
      }),
  );
  const ambiguous = placements.some((p) => p.length > 1);

  const MAX_READINGS = 64;
  let assignments: number[][] = [[]];
  for (const options of placements) {
    const next: number[][] = [];
    for (const acc of assignments) {
      for (const choice of options.length === 0 ? [-1] : options) {
        if (next.length >= MAX_READINGS) break;
        next.push([...acc, choice]);
      }
    }
    assignments = next;
  }

  const readings: number[][] = [];
  for (const lattice of lattices) {
    for (const assignment of assignments) {
      if (readings.length >= MAX_READINGS) break;
      const perVisit = points.map(() => 0);
      assignment.forEach((visit, runIndex) => {
        if (visit >= 0) perVisit[visit] = perVisit[visit]! + runs[runIndex]!.count;
      });
      const out: number[] = [];
      lattice.cells.forEach((cell, i) => {
        out.push(cell);
        for (let k = 0; k < perVisit[i]!; k += 1) out.push(cell);
      });
      readings.push(out);
    }
  }
  const cells = readings[0] ?? lattices[0]!.cells;

  const inverse = inverseCipher(cipher);
  const vocabulary = options.vocabulary;
  const matches: string[] = [];
  let candidateCount = 0;
  let truncated = false;

  const distinctReadings = [...new Set(readings.map((r) => r.join(",")))].map((k) =>
    k === "" ? [] : k.split(",").map(Number),
  );

  if (vocabulary !== undefined) {
    const prefixes = new Set<string>();
    const words = new Set<string>();
    for (const w of vocabulary) {
      const u = w.toUpperCase();
      words.add(u);
      for (let i = 1; i <= u.length; i += 1) prefixes.add(u.slice(0, i));
    }
    for (const reading of distinctReadings) {
      const letterSets = reading.map((c) => inverse.get(c) ?? []);
      const walkPrefix = (depth: number, acc: string): void => {
        if (depth === letterSets.length) {
          candidateCount += 1;
          if (words.has(acc)) matches.push(acc);
          return;
        }
        for (const letter of letterSets[depth]!) {
          const next = acc + letter;
          if (!prefixes.has(next)) continue;
          walkPrefix(depth + 1, next);
        }
      };
      walkPrefix(0, "");
    }
  } else {
    const ceiling = options.maxCandidates ?? 100_000;
    // A cell no letter produces contributes zero sequences, not one. The squares
    // above Saturn number cells past 9 and no cipher reaches them, so a reading
    // that lands on Luna cell 41 admits nothing at all; counting it as one
    // sequence reported a candidate that cannot be written down, and the
    // vocabulary branch above — which enumerates rather than multiplies — has
    // always returned 0 for the same reading.
    candidateCount = distinctReadings.reduce(
      (total, reading) => total + reading.reduce((n, c) => n * (inverse.get(c)?.length ?? 0), 1),
      0,
    );
    if (candidateCount > ceiling) {
      candidateCount = ceiling;
      truncated = true;
    }
  }

  return Object.freeze({
    cells: Object.freeze(cells),
    readings: Object.freeze(distinctReadings.map((r) => Object.freeze(r))),
    order: lattices[0]!.order,
    square: lattices[0]!.squareId,
    orders: Object.freeze(lattices.map((l) => l.order)),
    squares: Object.freeze(
      lattices.map((l) => l.squareId).filter((id): id is SquareId => id !== undefined),
    ),
    matches: Object.freeze([...new Set(matches)].sort()),
    candidateCount,
    truncated,
    ambiguousLoops: ambiguous,
  });
}

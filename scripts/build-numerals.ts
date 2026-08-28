/**
 * Construct a dimension-callout numeral set as locked geometry.
 *
 * `packages/render-svg/src/xml.ts` has no text-node branch and
 * `scripts/extract-codex-geometry.ts` quarantines any mark that leans on
 * `<text>` — two marks were refused for exactly that. A font resolved at render
 * time is not authored geometry: a different machine with a different font
 * emits different ink, determinism dies, and the version contract dies with it.
 * So the numerals a technical drawing needs are drawn here, the same way every
 * other mark in this repository is drawn.
 *
 * COMPASS AND RULE ONLY. The instruments below are a straightedge (`line`), a
 * pair of dividers (`arc`, `circle`) and nothing else. Every emitted path is a
 * word in `{M, L, A, Z}` — asserted, not assumed. No bezier appears anywhere in
 * the output, because no bezier can be constructed from these instruments.
 *
 * This is an authoring tool, not part of the pipeline. It writes a source file
 * for review; nothing here runs at compile time.
 *
 *   pnpm exec tsx scripts/build-numerals.ts
 */

import { writeFileSync } from "node:fs";

/* ── notation ──────────────────────────────────────────────────────────────
   Angles are degrees measured from the +x axis in the viewBox's own y-down
   space, so INCREASING an angle turns clockwise on screen. That single
   convention makes every sweep flag in this file a direct transcription of the
   direction the pen travels, with no mental mirror. */

const DEG = Math.PI / 180;

const r4 = (n: number): string => {
  const v = Math.round(n * 1e4) / 1e4;
  return Object.is(v, -0) ? "0" : String(v);
};

const norm360 = (d: number): number => ((d % 360) + 360) % 360;

type Pt = readonly [number, number];

const ptOn = (cx: number, cy: number, r: number, deg: number): Pt => [
  cx + r * Math.cos(deg * DEG),
  cy + r * Math.sin(deg * DEG),
];

const angleOf = (cx: number, cy: number, x: number, y: number): number =>
  norm360(Math.atan2(y - cy, x - cx) / DEG);

/**
 * The two points where two circles cross. `side` picks which one: +1 is the
 * point to the left of the c1→c2 direction vector, -1 the point to its right.
 * Used to join the two bowls of `3` and `S` at a real tangency-free crossing
 * rather than at a guessed coordinate.
 */
function crossing(
  c1: Circle,
  c2: Circle,
  side: 1 | -1,
): Pt {
  const dx = c2.x - c1.x;
  const dy = c2.y - c1.y;
  const d = Math.hypot(dx, dy);
  const a = (d * d + c1.r * c1.r - c2.r * c2.r) / (2 * d);
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a));
  const mx = c1.x + (a * dx) / d;
  const my = c1.y + (a * dy) / d;
  return [mx + (side * h * dy) / d, my - (side * h * dx) / d];
}

type Circle = Readonly<{ x: number; y: number; r: number }>;
const circ = (x: number, y: number, r: number): Circle => ({ x, y, r });

/* ── instruments ───────────────────────────────────────────────────────────
   A straightedge and a pair of dividers. Nothing else is available, which is
   the whole point: a construction that cannot be stated in these terms is a
   construction this file refuses to make. */

type Op =
  | Readonly<{ k: "M"; x: number; y: number }>
  | Readonly<{ k: "L"; x: number; y: number }>
  | Readonly<{ k: "A"; cx: number; cy: number; r: number; a0: number; a1: number; cw: boolean }>
  | Readonly<{ k: "Z" }>;

/** Put the pen down at a point. */
const move = (x: number, y: number): Op => ({ k: "M", x, y });

/** Draw to a point with the straightedge. */
const line = (x: number, y: number): Op => ({ k: "L", x, y });

/**
 * Swing an arc of `c` from angle `a0` to angle `a1`. `cw` is the direction the
 * pen travels on screen. The caller states the circle and the two angles; the
 * serializer derives the endpoint and both SVG flags from them, so a
 * large-arc/sweep flag can never disagree with the intended sweep.
 */
const arc = (c: Circle, a0: number, a1: number, cw: boolean): Op => ({
  k: "A",
  cx: c.x,
  cy: c.y,
  r: c.r,
  a0,
  a1,
  cw,
});

/** Same, but the two angles are named by the points they pass through. */
const arcVia = (c: Circle, from: Pt, to: Pt, cw: boolean): Op =>
  arc(c, angleOf(c.x, c.y, from[0], from[1]), angleOf(c.x, c.y, to[0], to[1]), cw);

/** A closed circle, as two half-turns — SVG cannot express a 360° arc. */
const circle = (c: Circle): Op[] => [
  move(...ptOn(c.x, c.y, c.r, 180)),
  arc(c, 180, 360, true),
  arc(c, 0, 180, true),
  { k: "Z" },
];

/* ── serialization ─────────────────────────────────────────────────────────
   Coordinates are rounded once, here, at four decimals — the same grid
   `extract-codex-geometry.ts` rounds to. Everything downstream (including the
   bounds measurement) reads the rounded string, so what is measured is exactly
   what is emitted. */

function toPathData(ops: readonly Op[]): string {
  const out: string[] = [];
  let cur: Pt | null = null;
  for (const op of ops) {
    switch (op.k) {
      case "M":
        out.push(`M${r4(op.x)} ${r4(op.y)}`);
        cur = [op.x, op.y];
        break;
      case "L":
        out.push(`L${r4(op.x)} ${r4(op.y)}`);
        cur = [op.x, op.y];
        break;
      case "A": {
        const start = ptOn(op.cx, op.cy, op.r, op.a0);
        if (cur === null) {
          out.push(`M${r4(start[0])} ${r4(start[1])}`);
        } else if (Math.hypot(cur[0] - start[0], cur[1] - start[1]) > 1e-6) {
          throw new Error(
            `arc does not start at the current point: pen at ${r4(cur[0])},${r4(cur[1])}, ` +
              `arc begins at ${r4(start[0])},${r4(start[1])}`,
          );
        }
        const delta = op.cw ? norm360(op.a1 - op.a0) : norm360(op.a0 - op.a1);
        const end = ptOn(op.cx, op.cy, op.r, op.a1);
        out.push(
          `A${r4(op.r)} ${r4(op.r)} 0 ${delta > 180 ? 1 : 0} ${op.cw ? 1 : 0} ` +
            `${r4(end[0])} ${r4(end[1])}`,
        );
        cur = end;
        break;
      }
      case "Z":
        out.push("Z");
        break;
    }
  }
  return out.join(" ");
}

/** Uniform scale about the origin, then translate. Circles stay circles. */
function transform(ops: readonly Op[], s: number, tx: number, ty: number): Op[] {
  return ops.map((op): Op => {
    switch (op.k) {
      case "M":
        return { k: "M", x: op.x * s + tx, y: op.y * s + ty };
      case "L":
        return { k: "L", x: op.x * s + tx, y: op.y * s + ty };
      case "A":
        return { ...op, cx: op.cx * s + tx, cy: op.cy * s + ty, r: op.r * s };
      case "Z":
        return op;
    }
  });
}

/* ── measurement ───────────────────────────────────────────────────────────
   Borrowed verbatim in spirit from `scripts/extract-codex-geometry.ts`: arcs
   are flattened by centre-parameterisation and sampled. An arc's endpoints say
   nothing about where its belly reaches, and four marks in this repository were
   legible only because the SVG viewport cropped ink that had escaped. The only
   honest bound is a sampled one. */

const SAMPLES = 96;

/** Endpoint parameterization → centre parameterization (SVG 1.1 F.6.5). */
function arcPoints(
  x1: number, y1: number, rx: number, ry: number,
  phiDeg: number, largeArc: number, sweep: number, x2: number, y2: number,
): Pt[] {
  if (rx === 0 || ry === 0) return [[x1, y1], [x2, y2]];
  rx = Math.abs(rx); ry = Math.abs(ry);
  const phi = (phiDeg * Math.PI) / 180, cosP = Math.cos(phi), sinP = Math.sin(phi);
  const dx2 = (x1 - x2) / 2, dy2 = (y1 - y2) / 2;
  const x1p = cosP * dx2 + sinP * dy2, y1p = -sinP * dx2 + cosP * dy2;

  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) { const s = Math.sqrt(lambda); rx *= s; ry *= s; }

  const sign = largeArc === sweep ? -1 : 1;
  const numer = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denom = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const co = sign * Math.sqrt(Math.max(0, numer / denom));
  const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
  const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
  const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;

  const ang = (ux: number, uy: number, vx: number, vy: number): number => {
    const dot = ux * vx + uy * vy;
    const len = Math.hypot(ux, uy) * Math.hypot(vx, vy);
    let a = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)));
    if (ux * vy - uy * vx < 0) a = -a;
    return a;
  };
  const theta = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const out: Pt[] = [];
  for (let k = 0; k <= SAMPLES; k++) {
    const t = theta + delta * (k / SAMPLES);
    const px = rx * Math.cos(t), py = ry * Math.sin(t);
    out.push([cosP * px - sinP * py + cx, sinP * px + cosP * py + cy]);
  }
  return out;
}

/** Flatten emitted path data back to points. Reads the string, not the ops. */
function pathPoints(d: string): Pt[] {
  const pts: Pt[] = [];
  const tokens = d.match(/[MLAZ]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "";
  const n = (): number => Number.parseFloat(tokens[i++] ?? "0");
  const push = (x: number, y: number): void => { pts.push([x, y]); cx = x; cy = y; };

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/^[MLAZ]$/.test(t)) { cmd = t; i++; continue; }
    switch (cmd) {
      case "M": { const x = n(), y = n(); push(x, y); sx = x; sy = y; cmd = "L"; break; }
      case "L": push(n(), n()); break;
      case "A": {
        const rx = n(), ry = n(), rot = n(), la = n(), sw = n();
        const ex = n(), ey = n();
        for (const p of arcPoints(cx, cy, rx, ry, rot, la, sw, ex, ey)) pts.push(p);
        push(ex, ey);
        break;
      }
      case "Z": push(sx, sy); break;
      default: i++; break;
    }
  }
  return pts;
}

type Bounds = Readonly<{ minX: number; minY: number; maxX: number; maxY: number }>;

/**
 * Ink bounds, not path bounds. A stroked path paints `strokeWidth / 2` beyond
 * its centreline in every direction — with round caps and joins that pad is
 * exact rather than conservative, which is why the whole set is drawn round.
 */
function inkBoundsOf(paths: readonly EmittedPath[]): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) {
    const pad = p.role === "stroke" ? p.strokeWidth / 2 : 0;
    for (const [x, y] of pathPoints(p.d)) {
      minX = Math.min(minX, x - pad); minY = Math.min(minY, y - pad);
      maxX = Math.max(maxX, x + pad); maxY = Math.max(maxY, y + pad);
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Shortest distance from a point to a segment. */
function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const vx = b[0] - a[0], vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * vx + (p[1] - a[1]) * vy) / len2));
  return Math.hypot(p[0] - (a[0] + t * vx), p[1] - (a[1] + t * vy));
}

/**
 * How far a glyph's ink misses being its own half-turn about `(cx, cy)`.
 *
 * Every sampled point is rotated 180° about the centre and measured against the
 * flattened polyline — segments, not vertices, so the answer is not floored by
 * the sample spacing. Zero means the glyph is exactly point-symmetric. This is
 * the check that holds `S` to its construction: the letter is two congruent
 * bowls in opposition, and the moment they stop being congruent it leans.
 */
function halfTurnResidual(paths: readonly EmittedPath[], cx: number, cy: number): number {
  const poly: Pt[][] = paths.map((p) => pathPoints(p.d));
  let worst = 0;
  for (const chain of poly) {
    for (const pt of chain) {
      const image: Pt = [2 * cx - pt[0], 2 * cy - pt[1]];
      let best = Infinity;
      for (const other of poly) {
        for (let i = 1; i < other.length; i += 1) {
          best = Math.min(best, distToSegment(image, other[i - 1]!, other[i]!));
        }
      }
      worst = Math.max(worst, best);
    }
  }
  return worst;
}

/* ── the metric frame ──────────────────────────────────────────────────────
   One grid governs the whole set. Every number below is derived from it; there
   are no free-floating coordinates in the constructions that follow. */

/**
 * Advance width of the text-size class. Monospaced: every glyph gets exactly
 * this, and the advance IS the viewBox width, so a consumer sets a string by
 * summing `viewBox[2]` and never consults a side-table that could drift.
 * 65 against a figure height of 72 is the ratio a typewriter face holds — wide
 * enough that a digit does not touch its neighbour, tight enough that a
 * dimension reads as one number rather than as spaced-out characters.
 */
const ADVANCE = 65;
/** Advance centre — the axis every text-size glyph is composed about. */
const MIDX = ADVANCE / 2;
/** Figure top. Flat-topped glyphs put a stroke centreline here. */
const TOP = 14;
/** Baseline. Flat-bottomed glyphs put a stroke centreline here. */
const BASE = 86;
/** Figure height, centreline to centreline. */
const FIG_H = BASE - TOP;
/** Figure half-width. Digits are built inside MIDX ± this. */
const FIG_A = 25;
const LEFT = MIDX - FIG_A;
const RIGHT = MIDX + FIG_A;
/** Vertical centre of the figure box — and, by construction, of the advance. */
const MIDY = (TOP + BASE) / 2;
/** Mathematical axis: where `+`, `−` and `×` centre. */
const AXIS = MIDY;
/** Lowercase x-height top, for `m`. */
const XH_TOP = 36;

/**
 * The single stroke weight of the whole set, in viewBox units. 7 / 72 ≈ 0.097
 * of the figure height — the light, even stem of an engraver's numeral, where
 * one scriber cuts every line at one width. Superscripts do NOT scale it: a
 * scriber does not change tools to cut an exponent.
 */
const SW = 7;

/** Superscript class: the text-size construction, uniformly scaled. */
const SUP_SCALE = 0.6;
/**
 * Superscript advance. Monospaced within its own class, exactly as ADVANCE is
 * within text size. It is NOT simply `ADVANCE * SUP_SCALE`: the construction
 * scales but the stroke does not, so a scaled glyph carries `SW * (1 - scale)`
 * more ink than a proportional shrink would. Adding that back keeps the
 * superscript side bearing proportional to the text-size one, which is why an
 * exponent reads as the same face set smaller rather than as a crowded one.
 */
const SUP_ADVANCE = ADVANCE * SUP_SCALE + SW * (1 - SUP_SCALE);
/** Superscript figure top, just below the text-size figure top. */
const SUP_TOP = 15;

/* ── constructions ─────────────────────────────────────────────────────────
   One sentence per glyph, above each glyph. If a construction cannot be said
   in a sentence with a straightedge and a pair of dividers, it does not belong
   in this file. */

type EmittedPath = Readonly<{ d: string; role: "stroke" | "fill"; strokeWidth: number }>;
type Draw = Readonly<{ ops: readonly Op[]; role: "stroke" | "fill" }>;
type Glyph = Readonly<{ id: string; character: string; note: string; draws: readonly Draw[] }>;

const S = (ops: readonly Op[]): Draw => ({ ops, role: "stroke" });
const F = (ops: readonly Op[]): Draw => ({ ops, role: "fill" });

/**
 * The draughtsman's four-centre oval (Dürer, Underweysung der Messung III):
 * two small arcs of radius a²/b close the ends of the long axis, two large arcs
 * centred on the short axis carry the flanks, and the four meet at internal
 * tangencies where the centres are collinear. The result tracks a true ellipse
 * to within half a unit while remaining, strictly, four circles.
 */
function fourCentreOval(cx: number, cy: number, a: number, b: number): Op[] {
  const r = (a * a) / b;
  const R = (a * a + (b - r) * (b - r) - r * r) / (2 * (a - r));
  const top = circ(cx, cy - b + r, r);
  const bottom = circ(cx, cy + b - r, r);
  const right = circ(cx + a - R, cy, R);
  const left = circ(cx - a + R, cy, R);

  // Tangency: the junction lies on the line of centres, at R from the flank
  // centre. Solve once on the top-right quadrant; mirror for the other three.
  const dx = top.x - right.x, dy = top.y - right.y;
  const len = Math.hypot(dx, dy);
  const tx = right.x + (R * dx) / len;
  const ty = right.y + (R * dy) / len;
  const ox = tx - cx, oy = ty - cy;

  const tr: Pt = [cx + ox, cy + oy];
  const br: Pt = [cx + ox, cy - oy];
  const bl: Pt = [cx - ox, cy - oy];
  const tl: Pt = [cx - ox, cy + oy];

  return [
    move(tl[0], tl[1]),
    arcVia(top, tl, tr, true),
    arcVia(right, tr, br, true),
    arcVia(bottom, br, bl, true),
    arcVia(left, bl, tl, true),
    { k: "Z" },
  ];
}

/* zero — the four-centre oval, cut by a short slash held inside the counter so
   the outline stays a whole, unbroken curve. There is no O in this set, but a
   dimension is read aloud off a drawing and a bare oval is the one numeral a
   reader is allowed to hesitate over; the slash removes the hesitation. */
const ZERO: Glyph = {
  id: "numeral-0",
  character: "0",
  note: "four-centre oval, 50 x 72, with an interior slash",
  draws: [
    S(fourCentreOval(MIDX, MIDY, FIG_A, FIG_H / 2)),
    S([move(MIDX - 8.5, MIDY + 12), line(MIDX + 8.5, MIDY - 12)]),
  ],
};

/* one — a full-height stem, a flag struck down-left from its head, and a foot
   serif. The foot is not decoration: these are tabular figures and a footless
   one leaves a hole in a column of dimensions. */
const ONE: Glyph = {
  id: "numeral-1",
  character: "1",
  note: "stem, flag, foot serif",
  draws: [
    S([move(MIDX - 17, TOP + 13), line(MIDX, TOP), line(MIDX, BASE)]),
    S([move(MIDX - 16, BASE), line(MIDX + 16, BASE)]),
  ],
};

/* two — a bowl swung 220° from ten o'clock clockwise round to four o'clock,
   a straight diagonal dropped from there to the baseline, and a flat base bar. */
const TWO_BOWL = circ(MIDX, TOP + 20, 20);
const TWO: Glyph = {
  id: "numeral-2",
  character: "2",
  note: "220° bowl, straight diagonal, base bar",
  draws: [
    S([
      move(...ptOn(TWO_BOWL.x, TWO_BOWL.y, TWO_BOWL.r, 195)),
      arc(TWO_BOWL, 195, 55, true),
      line(LEFT + 4, BASE),
      line(RIGHT - 2, BASE),
    ]),
  ],
};

/* three — two circles, the lower larger than the upper, drawn as one stroke
   that changes centre at the point where the two circles actually cross. */
const THREE_UP = circ(MIDX, TOP + 18, 18);
const THREE_LO = circ(MIDX, BASE - 21, 21);
const THREE_J = crossing(THREE_UP, THREE_LO, 1);
const THREE: Glyph = {
  id: "numeral-3",
  character: "3",
  note: "two crossing circles, r18 over r21",
  draws: [
    S([
      move(...ptOn(THREE_UP.x, THREE_UP.y, THREE_UP.r, 200)),
      arcVia(THREE_UP, ptOn(THREE_UP.x, THREE_UP.y, THREE_UP.r, 200), THREE_J, true),
      arcVia(THREE_LO, THREE_J, ptOn(THREE_LO.x, THREE_LO.y, THREE_LO.r, 160), true),
    ]),
  ],
};

/* four — one unbroken rule: up the stem from the baseline to the apex, back
   down the diagonal to the left margin, and out along the crossbar. */
const FOUR: Glyph = {
  id: "numeral-4",
  character: "4",
  note: "stem, diagonal, crossbar — one straightedge stroke",
  draws: [
    S([
      move(MIDX + 11, BASE),
      line(MIDX + 11, TOP),
      line(LEFT, BASE - 23),
      line(RIGHT, BASE - 23),
    ]),
  ],
};

/* five — a flat top bar, a short stem dropped from its left end, and a 285°
   bowl swung from the stem's foot clockwise round to seven o'clock. */
const FIVE_BOWL = circ(MIDX, BASE - 24, 24);
const FIVE_SPRING = ptOn(FIVE_BOWL.x, FIVE_BOWL.y, FIVE_BOWL.r, 205);
const FIVE: Glyph = {
  id: "numeral-5",
  character: "5",
  note: "top bar, stem, 285° bowl",
  draws: [
    S([
      move(RIGHT - 6, TOP),
      line(FIVE_SPRING[0], TOP),
      line(FIVE_SPRING[0], FIVE_SPRING[1]),
      arc(FIVE_BOWL, 205, 130, true),
    ]),
  ],
};

/* six — a closed circular bowl, and a spine that is a single arc struck
   tangent to that bowl at its nine-o'clock point and carried up to the figure
   top. Tangency is forced by putting the spine's centre on the bowl's own
   horizontal centre line, so the two curves meet without a corner. */
function sixSpine(bowl: Circle, tipX: number, tipY: number): { spine: Circle; tip: Pt; foot: Pt } {
  // Centre on the bowl's centre line, through the bowl's left extreme.
  const footX = bowl.x - bowl.r;
  const dx = tipX - footX;
  const dy = tipY - bowl.y;
  // (dx - R)² + dy² = R²  →  R = (dx² + dy²) / (2 dx)
  const R = (dx * dx + dy * dy) / (2 * dx);
  return { spine: circ(footX + R, bowl.y, R), tip: [tipX, tipY], foot: [footX, bowl.y] };
}
const SIX_BOWL = circ(MIDX, BASE - 23, 23);
const SIX = sixSpine(SIX_BOWL, RIGHT - 6, TOP);
const SIX_GLYPH: Glyph = {
  id: "numeral-6",
  character: "6",
  note: "closed r23 bowl, spine arc struck tangent at nine o'clock",
  draws: [
    S([move(SIX.tip[0], SIX.tip[1]), arcVia(SIX.spine, SIX.tip, SIX.foot, false)]),
    S(circle(SIX_BOWL)),
  ],
};

/* seven — a flat top bar, a straight diagonal to the baseline, and a crossbar
   struck square through the diagonal at mid-height. The bar is a drafting
   convention, not an ornament: 1 and 7 must not trade places in a callout. */
const SEVEN_TOP = TOP;
const SEVEN_FOOT_X = MIDX - 10;
const SEVEN_BAR_Y = MIDY + 2;
const SEVEN_AT_BAR =
  RIGHT - 1 + ((SEVEN_FOOT_X - (RIGHT - 1)) * (SEVEN_BAR_Y - SEVEN_TOP)) / (BASE - SEVEN_TOP);
const SEVEN: Glyph = {
  id: "numeral-7",
  character: "7",
  note: "top bar, diagonal, barred at mid-height",
  draws: [
    S([move(LEFT + 1, SEVEN_TOP), line(RIGHT - 1, SEVEN_TOP), line(SEVEN_FOOT_X, BASE)]),
    S([move(SEVEN_AT_BAR - 11, SEVEN_BAR_Y), line(SEVEN_AT_BAR + 11, SEVEN_BAR_Y)]),
  ],
};

/* eight — two circles stacked on the figure's axis and made internally
   tangent, the lower the larger: r_upper + r_lower = half the figure height. */
const EIGHT_UP = circ(MIDX, TOP + 16, 16);
const EIGHT_LO = circ(MIDX, BASE - 20, 20);
const EIGHT: Glyph = {
  id: "numeral-8",
  character: "8",
  note: "two tangent circles, r16 over r20",
  draws: [S(circle(EIGHT_UP)), S(circle(EIGHT_LO))],
};

/* nine — the six, turned a half-turn about the centre of its own advance.
   Not a redrawing: the same two circles, rotated 180°. */
const NINE_BOWL = circ(MIDX, TOP + 23, 23);
const NINE_SPINE = circ(2 * MIDX - SIX.spine.x, 2 * MIDY - SIX.spine.y, SIX.spine.r);
const NINE_TIP: Pt = [2 * MIDX - SIX.tip[0], 2 * MIDY - SIX.tip[1]];
const NINE_FOOT: Pt = [2 * MIDX - SIX.foot[0], 2 * MIDY - SIX.foot[1]];
const NINE: Glyph = {
  id: "numeral-9",
  character: "9",
  note: "the 6, rotated a half-turn about (50, 50)",
  draws: [
    S([move(NINE_TIP[0], NINE_TIP[1]), arcVia(NINE_SPINE, NINE_TIP, NINE_FOOT, false)]),
    S(circle(NINE_BOWL)),
  ],
};

/* plus — two rules of equal length crossing square on the mathematical axis. */
const PLUS_ARM = 20;
const PLUS: Glyph = {
  id: "numeral-plus",
  character: "+",
  note: "two 40-unit rules crossing on the axis",
  draws: [
    S([move(MIDX - PLUS_ARM, AXIS), line(MIDX + PLUS_ARM, AXIS)]),
    S([move(MIDX, AXIS - PLUS_ARM), line(MIDX, AXIS + PLUS_ARM)]),
  ],
};

/* minus — the horizontal rule of the plus, alone. Same length, same axis, so a
   signed pair stacks exactly. */
const MINUS: Glyph = {
  id: "numeral-minus",
  character: "−",
  note: "the plus's horizontal rule, alone",
  draws: [S([move(MIDX - PLUS_ARM, AXIS), line(MIDX + PLUS_ARM, AXIS)])],
};

/* plus-minus — a plus compressed onto an upper axis with a bar below it, the
   three horizontals evenly spaced so the mark reads as one unit. */
const PM_ARM = 17;
const PM_AXIS = AXIS - 7;
const PM_BAR = AXIS + 24;
const PLUSMINUS: Glyph = {
  id: "numeral-plusminus",
  character: "±",
  note: "plus on a raised axis over a base bar",
  draws: [
    S([move(MIDX - PM_ARM, PM_AXIS), line(MIDX + PM_ARM, PM_AXIS)]),
    S([move(MIDX, PM_AXIS - PM_ARM), line(MIDX, PM_AXIS + PM_ARM)]),
    S([move(MIDX - PM_ARM, PM_BAR), line(MIDX + PM_ARM, PM_BAR)]),
  ],
};

/* multiply — the plus, turned 45° about the axis. Its arms are shortened so the
   two marks carry the same optical mass rather than the same measurement. */
const MUL_ARM = 14;
const MULTIPLY: Glyph = {
  id: "numeral-multiply",
  character: "×",
  note: "the plus at 45°, arms shortened for equal optical mass",
  draws: [
    S([move(MIDX - MUL_ARM, AXIS - MUL_ARM), line(MIDX + MUL_ARM, AXIS + MUL_ARM)]),
    S([move(MIDX + MUL_ARM, AXIS - MUL_ARM), line(MIDX - MUL_ARM, AXIS + MUL_ARM)]),
  ],
};

/* period — a filled disc of 8 units, seated so its underside meets the same ink
   line the flat-bottomed digits sit on. It is the one filled path in the set:
   drawn as a stroke it would depend on the renderer's cap style, and a
   dimension whose decimal point vanishes under butt caps is a defect. */
const DOT_R = 4;
const PERIOD: Glyph = {
  id: "numeral-period",
  character: ".",
  note: "filled disc, r4, seated on the baseline ink line",
  draws: [F(circle(circ(MIDX, BASE + SW / 2 - DOT_R, DOT_R)))],
};

/* solidus — one rule, overshooting the figure box top and bottom the way a
   solidus must in order to read at speed. */
const SOLIDUS: Glyph = {
  id: "numeral-solidus",
  character: "/",
  note: "single rule, overshooting the figure box",
  draws: [S([move(MIDX - 18, BASE + 2), line(MIDX + 18, TOP - 2)])],
};

/**
 * Parenthesis: an arc on a chord of 2c with a sagitta of s, so R = (c² + s²)/2s.
 * Both parentheses use one radius; the right is the left reflected in the
 * advance axis, which is what makes a bracketed pair close.
 */
function paren(open: boolean): Op[] {
  const half = 40;         // half-chord: the paren spans MIDY ± 40
  const sag = 26;          // sagitta: how far the belly stands off the chord
  const R = (half * half + sag * sag) / (2 * sag);
  const belly = open ? MIDX - sag / 2 : MIDX + sag / 2;
  const chordX = open ? MIDX + sag / 2 : MIDX - sag / 2;
  const c = circ(open ? belly + R : belly - R, MIDY, R);
  const a: Pt = [chordX, MIDY - half];
  const b: Pt = [chordX, MIDY + half];
  return [move(a[0], a[1]), arcVia(c, a, b, !open)];
}

const PAREN_L: Glyph = {
  id: "numeral-paren-left",
  character: "(",
  note: "arc on an 80-unit chord with a 16-unit sagitta",
  draws: [S(paren(true))],
};
const PAREN_R: Glyph = {
  id: "numeral-paren-right",
  character: ")",
  note: "the left parenthesis, reflected in the advance axis",
  draws: [S(paren(false))],
};

/* degree — a single small circle hung at the figure top, its counter left wide
   enough that it cannot fill in at plate scale. */
const DEGREE: Glyph = {
  id: "numeral-degree",
  character: "°",
  note: "r7.5 ring at the figure top, 8-unit counter",
  draws: [S(circle(circ(MIDX, TOP + 11, 7.5)))],
};

/* m — three stems on a 23-unit pitch, joined by two half-circle arches of
   radius 23/2 springing to the x-height line. */
const M_PITCH = 23;
const M_R = M_PITCH / 2;
const M_SPRING = XH_TOP + M_R;
const M_X0 = MIDX - M_PITCH;
const M_ARCH_1 = circ(M_X0 + M_R, M_SPRING, M_R);
const M_ARCH_2 = circ(MIDX + M_R, M_SPRING, M_R);
const LOWER_M: Glyph = {
  id: "numeral-lower-m",
  character: "m",
  note: "three stems on a 23 pitch, two half-circle arches",
  draws: [
    S([
      move(M_X0, BASE),
      line(M_X0, M_SPRING),
      arc(M_ARCH_1, 180, 360, true),
      line(MIDX, BASE),
    ]),
    S([
      move(MIDX, M_SPRING),
      arc(M_ARCH_2, 180, 360, true),
      line(MIDX + M_PITCH, BASE),
    ]),
  ],
};

/* L — a full-height stem and a foot, set so the pair centres on the advance. */
const CAP_L: Glyph = {
  id: "numeral-cap-l",
  character: "L",
  note: "stem and foot, centred on the advance",
  draws: [S([move(MIDX - 18, TOP), line(MIDX - 18, BASE), line(MIDX + 18, BASE)])],
};

/**
 * S — the eight, opened, on EQUAL bowls.
 *
 * The letter is two circles with 120° of each lifted away, the two remaining
 * 240° arcs traced in OPPOSITE senses: the upper counterclockwise from one
 * o'clock, the lower clockwise to seven. That opposition is the entire
 * difference between an S and a 3, which is two circles curving the same way.
 *
 * WHAT WAS WRONG. This borrowed the 8's own bowls, r16 over r20. Those radii
 * are right for an 8 — a figure whose top bowl must read lighter than its
 * bottom — but they put the tangency at y=46, four units above the glyph's
 * centre, and hung a small bowl above a large one. In a string that reads as a
 * lean: `LS` and `mm/S` on the contact sheet came out italic against upright
 * digits. The previous note in this slot claimed the letter "stands upright
 * with no offset to tune", which was the claim, not the measurement.
 *
 * THE FIX, and why it is this one. Equal bowls. Two circles of r18 stack to
 * exactly the figure height (4r = 72), so they are tangent ON the glyph's own
 * centre (32.5, 50) with nothing left over to offset. The pair is then exactly
 * invariant under a half-turn about that centre — the same symmetry that
 * derives the 9 from the 6 — which is asserted below against the emitted path
 * data, not asserted in prose.
 *
 * Point symmetry alone does not make a letter upright: an italic S is
 * point-symmetric too. What makes THIS one upright is that both bowl centres
 * and the tangency between them sit on the advance axis x=32.5. Swinging the
 * centres off that axis by an angle φ tilts the spine while preserving the
 * symmetry exactly, and φ was tried at 6°, 8°, 10°, 13°, 16° and 18° and the
 * results set into `LS`, `S8`, `SS` and `mm/S` and looked at. Every nonzero φ
 * reads italic, progressively so; φ=0 matches the digits. Worth recording
 * because a band-centroid slant fit — the obvious metric — measures 21° on the
 * upright S and 0° on the one that visibly leans forward: an S's bowls open to
 * opposite sides, so that fit reads the letter's own construction as slant and
 * points the wrong way. The eye was the instrument here; the symmetry
 * assertion is what keeps the result from drifting.
 */
const S_R = FIG_H / 4;
const S_UP = circ(MIDX, TOP + S_R, S_R);
const S_LO = circ(MIDX, BASE - S_R, S_R);
/** Where the two bowls touch — the glyph's centre, by construction. */
const S_T: Pt = [S_UP.x, S_UP.y + S_UP.r];
const CAP_S: Glyph = {
  id: "numeral-cap-s",
  character: "S",
  note: `two equal r${S_R} bowls tangent at the glyph centre, each opened 120° and traced in opposite senses`,
  draws: [
    S([
      move(...ptOn(S_UP.x, S_UP.y, S_UP.r, 330)),
      arcVia(S_UP, ptOn(S_UP.x, S_UP.y, S_UP.r, 330), S_T, false),
      arcVia(S_LO, S_T, ptOn(S_LO.x, S_LO.y, S_LO.r, 150), true),
    ]),
  ],
};

const UNCENTRED_TEXT_SIZE: readonly Glyph[] = [
  ZERO, ONE, TWO, THREE, FOUR, FIVE, SIX_GLYPH, SEVEN, EIGHT, NINE,
  PLUS, MINUS, PLUSMINUS, MULTIPLY, PERIOD, SOLIDUS,
  PAREN_L, PAREN_R, DEGREE, LOWER_M, CAP_L, CAP_S,
];

/* ── optical centring ──────────────────────────────────────────────────────
   Monospaced means more than equal advances: it means each glyph sits on the
   middle of its own advance, or a column of figures will visibly wander even
   though every cell is the same width. Rather than nudge asymmetric
   constructions (`S`, `5`, `2`) by eye, every glyph is slid by its own MEASURED
   ink centre. The shift is derived from the same sampled bounds used for the
   overflow proof, so it is a measurement, not a taste. */

function centreOnAdvance(g: Glyph, advance: number): Glyph {
  const measured = g.draws.map((dr) => ({
    d: toPathData(dr.ops),
    role: dr.role,
    strokeWidth: dr.role === "stroke" ? SW : 0,
  }));
  const b = inkBoundsOf(measured);
  const dx = advance / 2 - (b.minX + b.maxX) / 2;
  if (Math.abs(dx) < 1e-9) return g;
  return { ...g, draws: g.draws.map((dr) => ({ ops: transform(dr.ops, 1, dx, 0), role: dr.role })) };
}

const TEXT_SIZE: readonly Glyph[] = UNCENTRED_TEXT_SIZE.map((g) => centreOnAdvance(g, ADVANCE));
const DIGITS: readonly Glyph[] = TEXT_SIZE.slice(0, 10);
const CENTRED_MINUS: Glyph = TEXT_SIZE[11]!;

/* ── superscripts ──────────────────────────────────────────────────────────
   Not redrawn. Each superscript is its text-size construction under one
   uniform scale, which is why every arc in it is still a circular arc: a
   uniform scale carries a circle to a circle. The stroke width is deliberately
   NOT scaled — the set has one weight, and an exponent cut lighter than the
   mantissa would read as a different tool. */

/** Half of the unscaled stroke the shrink left behind — recentres on SUP_ADVANCE/2. */
const SUP_TX = (SW * (1 - SUP_SCALE)) / 2;
const SUP_TY = SUP_TOP - TOP * SUP_SCALE;

const SUP_CHARS: Readonly<Record<string, string>> = Object.freeze({
  "0": "⁰", "1": "¹", "2": "²", "3": "³", "4": "⁴",
  "5": "⁵", "6": "⁶", "7": "⁷", "8": "⁸", "9": "⁹",
  "−": "⁻",
});

const SUPERSCRIPTS: readonly Glyph[] = [...DIGITS, CENTRED_MINUS].map((g) => ({
  id: g.id.replace(/^numeral-/, "numeral-sup-"),
  character: SUP_CHARS[g.character] ?? g.character,
  note: `${g.note} — scaled ${SUP_SCALE} onto the superscript grid`,
  draws: g.draws.map((dr) => ({
    ops: transform(dr.ops, SUP_SCALE, SUP_TX, SUP_TY),
    role: dr.role,
  })),
}));

/* ── build ─────────────────────────────────────────────────────────────── */

type Record_ = Readonly<{
  id: string;
  character: string;
  note: string;
  viewBox: readonly [number, number, number, number];
  paths: readonly EmittedPath[];
  ink: Bounds;
  overflow: number;
}>;

/** Only `M`, `L`, `A` and `Z` may appear. A bezier here is a house-rule breach. */
const COMPASS_AND_RULE = /^[MLAZ0-9 .-]+$/;

function build(glyphs: readonly Glyph[], viewBox: readonly [number, number, number, number]): Record_[] {
  return glyphs.map((g) => {
    const paths: EmittedPath[] = g.draws.map((dr) => {
      const d = toPathData(dr.ops);
      if (!COMPASS_AND_RULE.test(d)) {
        throw new Error(`${g.id}: path data is not compass-and-rule: ${d}`);
      }
      return { d, role: dr.role, strokeWidth: dr.role === "stroke" ? SW : 0 };
    });
    const ink = inkBoundsOf(paths);
    const [vx, vy, vw, vh] = viewBox;
    const overflow = Math.max(
      vx - ink.minX,
      vy - ink.minY,
      ink.maxX - (vx + vw),
      ink.maxY - (vy + vh),
    );
    return { id: g.id, character: g.character, note: g.note, viewBox, paths, ink, overflow };
  });
}

const TEXT_VIEWBOX = [0, 0, ADVANCE, 100] as const;
const SUP_VIEWBOX = [0, 0, SUP_ADVANCE, 100] as const;

const records: Record_[] = [
  ...build(TEXT_SIZE, TEXT_VIEWBOX),
  ...build(SUPERSCRIPTS, SUP_VIEWBOX),
];

/* ── measured proof ────────────────────────────────────────────────────── */

const pad = (s: string, n: number): string => s.padEnd(n);

console.log(`constructed ${records.length} glyphs — ${TEXT_SIZE.length} at text size, ${SUPERSCRIPTS.length} superscript`);
console.log(`uniform stroke width: ${SW} viewBox units (${(SW / FIG_H).toFixed(4)} of the figure height)`);
console.log(`advance: ${ADVANCE} at text size, ${SUP_ADVANCE} superscript — monospaced within each class\n`);
console.log(
  `${pad("id", 20)} ${pad("ch", 3)} ${pad("paths", 6)} ${pad("ink [minX, minY, maxX, maxY]", 42)} overflow`,
);

let worst = -Infinity;
let worstId = "";
for (const r of records) {
  if (r.overflow > worst) { worst = r.overflow; worstId = r.id; }
  const b = `[${r4(r.ink.minX)}, ${r4(r.ink.minY)}, ${r4(r.ink.maxX)}, ${r4(r.ink.maxY)}]`;
  console.log(
    `${pad(r.id, 20)} ${pad(r.character, 3)} ${pad(String(r.paths.length), 6)} ${pad(b, 42)} ${r4(r.overflow)}`,
  );
}

console.log(
  `\nworst-case ink overflow past the declared viewBox: ${r4(worst)} units (${worstId})`,
);
if (worst > 0) {
  throw new Error(
    `ink escapes its viewBox by ${r4(worst)} units on ${worstId} — refusing to write a set ` +
      `that is legible only because the viewport crops it`,
  );
}
console.log(`every glyph's ink lies inside its declared viewBox (worst case ${r4(worst)} <= 0)`);

// A second, independent check: nothing may leave the 0..100 box either, whatever
// the advance width is.
let worst100 = -Infinity;
for (const r of records) {
  worst100 = Math.max(
    worst100,
    -r.ink.minX, -r.ink.minY, r.ink.maxX - 100, r.ink.maxY - 100,
  );
}
console.log(`worst-case ink overflow past the 0..100 box:        ${r4(worst100)} units`);
if (worst100 > 0) throw new Error("ink escapes the 0..100 box");

/* A third check, for the one glyph whose uprightness is a symmetry rather than
   a measurement. `S` is two congruent bowls in opposition, which makes it
   exactly its own half-turn about the glyph centre. The 8 is deliberately NOT
   in this list: its bowls are r16 over r20 because a figure eight wants a
   lighter top bowl, and that asymmetry is correct there. It was borrowing those
   same bowls that made the S lean.

   The tolerance is one hundredth of a unit — a seven-hundredth of the stroke
   width, far below anything a plate can resolve, and far above the four-decimal
   rounding this file emits at. Measured against the same yardstick, the S that
   carried the 8's bowls missed by 7.8837 units. */
const HALF_TURN_TOLERANCE = 0.01;
for (const id of ["numeral-cap-s"]) {
  const r = records.find((rec) => rec.id === id);
  if (r === undefined) throw new Error(`${id} is missing from the set`);
  const [vx, vy, vw, vh] = r.viewBox;
  const residual = halfTurnResidual(r.paths, vx + vw / 2, vy + vh / 2);
  console.log(`half-turn residual, ${pad(id, 16)} ${r4(residual)} units`);
  if (residual > HALF_TURN_TOLERANCE) {
    throw new Error(
      `${id} is not its own half-turn about (${vx + vw / 2}, ${vy + vh / 2}): ` +
        `off by ${r4(residual)} units. Two bowls that are not congruent make the ` +
        `glyph lean; refusing to write a set that ships an italic letter among ` +
        `upright digits.`,
    );
  }
}

/* ── emit ──────────────────────────────────────────────────────────────── */

const pathSrc = (p: EmittedPath): string =>
  p.role === "fill" ? `      fill(${JSON.stringify(p.d)})` : `      stroke(${JSON.stringify(p.d)})`;

const recordSrc = (r: Record_): string => {
  const vb = r.viewBox === TEXT_VIEWBOX ? "TEXT_VIEWBOX" : "SUPERSCRIPT_VIEWBOX";
  return `  {
    id: "${r.id}",
    character: ${JSON.stringify(r.character)},
    construction: ${JSON.stringify(r.note)},
    viewBox: ${vb},
    paths: Object.freeze([
${r.paths.map(pathSrc).join(",\n")},
    ]),
    inkBounds: Object.freeze([${r4(r.ink.minX)}, ${r4(r.ink.minY)}, ${r4(r.ink.maxX)}, ${r4(r.ink.maxY)}] as const),
  }`;
};

const header = `/**
 * Constructed numerals for dimension callouts, version \`numerals/v1\`.
 *
 * GENERATED by \`scripts/build-numerals.ts\`. Do not hand-edit: regenerate
 * instead, and remember that a released version is immutable — a redraw lands
 * as v2.
 *
 * WHY THIS EXISTS. The renderer structurally cannot emit \`<text>\`
 * (\`packages/render-svg/src/xml.ts\` has no text-node branch) and the geometry
 * extractor quarantines any mark that depends on one. A glyph resolved through
 * a system font is not authored geometry: a different machine with a different
 * font paints different ink, determinism is gone, and the version contract goes
 * with it. So the numerals a technical drawing needs are drawn the same way
 * every other mark here is drawn — as locked path data.
 *
 * COMPASS AND RULE. Every path is a word in \`{M, L, A, Z}\`: straight segments
 * and circular arcs, nothing else. There is no bezier in this file and no font
 * touched the pipeline that produced it. Each record carries the sentence its
 * construction was stated in.
 *
 * METRICS. Figure height ${FIG_H} units, from a top of ${TOP} to a baseline of ${BASE},
 * built about the advance axis at x=${MIDX}. Every stroked path in the set is
 * ${SW} units wide — one weight, one scriber, exponents included. The only filled
 * path in the set is the period's disc, which is filled so that a decimal point
 * cannot disappear under a renderer's butt caps.
 *
 * MONOSPACED. Every text-size glyph advances ${ADVANCE} units and every superscript
 * advances ${SUP_ADVANCE}, so digits stack in a column and a superscript run stays on
 * its own even rhythm. The advance IS the viewBox width — a consumer lays the
 * set out by summing \`viewBox[2]\`, with no side-table of widths to drift.
 *
 * INK. \`inkBounds\` is measured by flattening the emitted path strings and
 * sampling them — arc bellies included, stroke width included — never from
 * endpoints or control points. Worst-case overflow past the declared viewBox
 * across the whole set is ${r4(worst)} units.
 */

import type { GlyphGeometryId } from "@studio137/plate-core";

import type { LockedPath } from "./types.js";

export const NUMERALS_V1_VERSION = "numerals/v1";

/** The one stroke weight of the set, in viewBox units. */
export const NUMERAL_STROKE_WIDTH = ${SW};

/** The metric frame every glyph was constructed on. */
export const NUMERAL_METRICS = Object.freeze({
  advance: ${ADVANCE},
  superscriptAdvance: ${SUP_ADVANCE},
  superscriptScale: ${SUP_SCALE},
  figureTop: ${TOP},
  baseline: ${BASE},
  figureHeight: ${FIG_H},
  xHeightTop: ${XH_TOP},
  mathAxis: ${AXIS},
  strokeWidth: ${SW},
});

export type NumeralSource = Readonly<{
  id: GlyphGeometryId;
  /** The character this glyph sets. Present so a caller can build a string map. */
  character: string;
  /** How it was constructed, in one sentence. */
  construction: string;
  /** \`[minX, minY, width, height]\`. The width is also the advance. */
  viewBox: readonly [number, number, number, number];
  paths: readonly LockedPath[];
  /** Measured by sampling the flattened paths, stroke width included. */
  inkBounds: readonly [number, number, number, number];
}>;

const stroke = (d: string): LockedPath =>
  Object.freeze({ d, role: "stroke" as const, strokeWidth: NUMERAL_STROKE_WIDTH });
const fill = (d: string): LockedPath =>
  Object.freeze({ d, role: "fill" as const, strokeWidth: 0 });

const TEXT_VIEWBOX = Object.freeze([0, 0, ${ADVANCE}, 100] as const);
const SUPERSCRIPT_VIEWBOX = Object.freeze([0, 0, ${SUP_ADVANCE}, 100] as const);

export const NUMERALS_V1_SOURCE: readonly NumeralSource[] = Object.freeze([
`;

const charMap = records
  .map((r) => `  ${JSON.stringify(r.character)}: "${r.id}",`)
  .join("\n");

const footer = `]);

/**
 * Character → glyph id. ASCII \`-\` is mapped alongside U+2212 MINUS SIGN so a
 * caller typing a plain hyphen still gets the set's minus rather than nothing.
 */
export const NUMERAL_BY_CHARACTER: Readonly<Record<string, GlyphGeometryId>> = Object.freeze({
${charMap}
  "-": "numeral-minus",
});
`;

const source = header + records.map(recordSrc).join(",\n") + ",\n" + footer;

writeFileSync(
  new URL("../packages/glyph-registry/src/numerals.v1.ts", import.meta.url),
  source,
  "utf8",
);
console.log(
  `\nwrote packages/glyph-registry/src/numerals.v1.ts — ${records.length} glyphs, ` +
    `${records.reduce((n, r) => n + r.paths.length, 0)} locked paths`,
);

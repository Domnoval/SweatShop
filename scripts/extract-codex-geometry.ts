/**
 * Extract the studio's authored marks into locked, hashable path data.
 *
 * `assets/glyphdraws.ts` draws by appending DOM elements — it was written for a
 * browser and cannot be imported by a headless compiler. This script runs those
 * draw functions against a minimal DOM shim, captures what they emit, and
 * lowers every primitive to a single SVG path command string, which is the only
 * form `LockedPath` accepts.
 *
 * Circles, lines and rects become paths because a locked path exposes `d` and
 * nothing else: a downstream engine must never receive a shape it could
 * reinterpret. `text` is refused outright — a glyph that resolves through a
 * system font is not authored geometry, and would not survive print.
 *
 * This is an extraction tool, not part of the pipeline. It writes a source file
 * for review; nothing here runs at compile time.
 */

import { writeFileSync } from "node:fs";

type Attrs = Record<string, string | number>;
type Captured = Readonly<{ tag: string; attrs: Attrs }>;

/* ── DOM shim ──────────────────────────────────────────────────────────────
   glyphdraws only ever calls createElementNS, setAttribute and appendChild.
   Anything beyond that surfaces as a crash rather than a silent omission. */

function makeShim(): { root: { children: Captured[] }; install: () => void } {
  const captured: Captured[] = [];
  const node = (tag: string) => {
    const attrs: Attrs = {};
    return {
      tag,
      attrs,
      setAttribute(k: string, v: string | number) {
        attrs[k] = v;
      },
      appendChild(child: unknown) {
        return child;
      },
    };
  };
  const install = () => {
    (globalThis as Record<string, unknown>).document = {
      createElementNS(_ns: string, tag: string) {
        const n = node(tag);
        captured.push({ tag: n.tag, attrs: n.attrs });
        return n;
      },
    };
  };
  return { root: { children: captured }, install };
}

/* ── primitive → path ──────────────────────────────────────────────────────
   Two-arc circles match the convention already used in geometry.v1.ts. */

const num = (v: string | number | undefined, fallback = 0): number =>
  v === undefined ? fallback : typeof v === "number" ? v : Number.parseFloat(v);

const r4 = (n: number): string => {
  const v = Math.round(n * 1e4) / 1e4;
  return Object.is(v, -0) ? "0" : String(v);
};

function toPathData(c: Captured): string | null {
  const a = c.attrs;
  switch (c.tag) {
    case "path":
      return typeof a.d === "string" ? a.d : null;
    case "circle": {
      const cx = num(a.cx), cy = num(a.cy), r = num(a.r);
      if (r <= 0) return null;
      return `M${r4(cx - r)} ${r4(cy)} A ${r4(r)} ${r4(r)} 0 1 0 ${r4(cx + r)} ${r4(cy)} A ${r4(r)} ${r4(r)} 0 1 0 ${r4(cx - r)} ${r4(cy)} Z`;
    }
    case "line":
      return `M${r4(num(a.x1))} ${r4(num(a.y1))} L${r4(num(a.x2))} ${r4(num(a.y2))}`;
    case "rect": {
      const x = num(a.x), y = num(a.y), w = num(a.width), h = num(a.height);
      if (w <= 0 || h <= 0) return null;
      return `M${r4(x)} ${r4(y)} L${r4(x + w)} ${r4(y)} L${r4(x + w)} ${r4(y + h)} L${r4(x)} ${r4(y + h)} Z`;
    }
    default:
      return null;
  }
}

/* ── bounds ────────────────────────────────────────────────────────────────
   Curves are flattened by sampling rather than bounded by their control points
   or endpoints. A cubic's control points lie outside the curve it actually
   draws, and an arc's endpoints say nothing about where its belly reaches — both
   shortcuts produce envelopes far larger than the ink, which would throttle
   layout density for no reason. Sampling costs microseconds and is honest. */

const SAMPLES = 48;

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}
function quadAt(p0: number, p1: number, p2: number, t: number): number {
  const u = 1 - t;
  return u * u * p0 + 2 * u * t * p1 + t * t * p2;
}

/** Endpoint parameterization → centre parameterization (SVG 1.1 F.6.5). */
function arcPoints(
  x1: number, y1: number, rx: number, ry: number,
  phiDeg: number, largeArc: number, sweep: number, x2: number, y2: number,
): Array<[number, number]> {
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

  const ang = (ux: number, uy: number, vx: number, vy: number) => {
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

  const out: Array<[number, number]> = [];
  for (let k = 0; k <= SAMPLES; k++) {
    const t = theta + delta * (k / SAMPLES);
    const px = rx * Math.cos(t), py = ry * Math.sin(t);
    out.push([cosP * px - sinP * py + cx, sinP * px + cosP * py + cy]);
  }
  return out;
}

function pathPoints(d: string): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  const tokens = d.match(/[MmLlHhVvCcSsQqTtAaZz]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? [];
  let i = 0, cx = 0, cy = 0, sx = 0, sy = 0, cmd = "";
  const n = () => Number.parseFloat(tokens[i++] ?? "0");
  const push = (x: number, y: number) => { pts.push([x, y]); cx = x; cy = y; };
  const sample = (fn: (t: number) => [number, number]) => {
    for (let k = 1; k <= SAMPLES; k++) pts.push(fn(k / SAMPLES));
  };

  while (i < tokens.length) {
    const t = tokens[i]!;
    if (/[MmLlHhVvCcSsQqTtAaZz]/.test(t)) { cmd = t; i++; continue; }
    const rel = cmd === cmd.toLowerCase();
    const bx = rel ? cx : 0, by = rel ? cy : 0;

    switch (cmd.toUpperCase()) {
      case "M": { const x = n() + bx, y = n() + by; push(x, y); sx = x; sy = y; cmd = rel ? "l" : "L"; break; }
      case "L": push(n() + bx, n() + by); break;
      case "H": push(n() + bx, cy); break;
      case "V": push(cx, n() + by); break;
      case "C": {
        const x0 = cx, y0 = cy;
        const c1x = n() + bx, c1y = n() + by, c2x = n() + bx, c2y = n() + by;
        const ex = n() + bx, ey = n() + by;
        sample((t) => [cubicAt(x0, c1x, c2x, ex, t), cubicAt(y0, c1y, c2y, ey, t)]);
        push(ex, ey);
        break;
      }
      case "S": {
        const x0 = cx, y0 = cy;
        const c2x = n() + bx, c2y = n() + by, ex = n() + bx, ey = n() + by;
        sample((t) => [cubicAt(x0, x0, c2x, ex, t), cubicAt(y0, y0, c2y, ey, t)]);
        push(ex, ey);
        break;
      }
      case "Q": {
        const x0 = cx, y0 = cy;
        const c1x = n() + bx, c1y = n() + by, ex = n() + bx, ey = n() + by;
        sample((t) => [quadAt(x0, c1x, ex, t), quadAt(y0, c1y, ey, t)]);
        push(ex, ey);
        break;
      }
      case "T": push(n() + bx, n() + by); break;
      case "A": {
        const rx = n(), ry = n(), rot = n(), la = n(), sw = n();
        const ex = n() + bx, ey = n() + by;
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

type Bounds = { minX: number; minY: number; maxX: number; maxY: number };

function boundsOf(paths: Array<{ d: string; strokeWidth: number }>): Bounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of paths) {
    const pad = p.strokeWidth / 2;
    for (const [x, y] of pathPoints(p.d)) {
      minX = Math.min(minX, x - pad); minY = Math.min(minY, y - pad);
      maxX = Math.max(maxX, x + pad); maxY = Math.max(maxY, y + pad);
    }
  }
  return { minX, minY, maxX, maxY };
}

/* ── run ───────────────────────────────────────────────────────────────── */

const shim = makeShim();
shim.install();

const { DRAWS } = (await import("../assets/glyphdraws.ts")) as {
  DRAWS: Record<string, (svg: unknown) => void>;
};

type Extracted = {
  id: string;
  paths: Array<{ d: string; role: "stroke" | "fill"; strokeWidth: number }>;
  bounds: Bounds;
  rejected: string[];
};

const results: Extracted[] = [];
const problems: string[] = [];
const quarantined: Array<{ id: string; why: string }> = [];

for (const [id, fn] of Object.entries(DRAWS)) {
  const local = makeShim();
  local.install();
  const svg = { tag: "svg", attrs: {}, setAttribute() {}, appendChild() {} };
  try {
    fn(svg);
  } catch (err) {
    problems.push(`${id}: threw — ${(err as Error).message}`);
    continue;
  }
  const emitted = local.root.children;
  const paths: Extracted["paths"] = [];
  const rejected: string[] = [];

  for (const c of emitted) {
    const d = toPathData(c);
    if (d === null) { rejected.push(c.tag); continue; }
    const fill = String(c.attrs.fill ?? "none");
    const role: "stroke" | "fill" = fill !== "none" && fill !== "" ? "fill" : "stroke";
    paths.push({ d, role, strokeWidth: role === "fill" ? 0 : num(c.attrs["stroke-width"], 1.4) });
  }

  if (paths.length === 0) { problems.push(`${id}: emitted no usable geometry`); continue; }

  // A mark that lost a <text> lost part of itself, and a mark that lost a
  // <clipPath> is now drawing geometry the artist deliberately cut away. Both
  // would extract "successfully" into something that is not the mark. Quarantine
  // them instead — substituting a wrong glyph is the one thing this project
  // refuses to do anywhere else.
  const lostText = rejected.filter((t) => t === "text").length;
  const lostClip = rejected.filter((t) => t === "clipPath" || t === "defs" || t === "g").length;
  if (lostText > 0) {
    quarantined.push({ id, why: `depends on ${lostText} <text> element(s) — resolves through a system font, so it is not authored geometry and would not survive print` });
    continue;
  }
  if (lostClip > 0) {
    quarantined.push({ id, why: `drawn through a <clipPath> — the extracted paths are the unclipped lattice, which is a different mark` });
    continue;
  }

  const bounds = boundsOf(paths);
  // A mark whose ink leaves its own viewBox is only legible because the SVG
  // viewport crops it. The browser hides the overflow; a compiler that places
  // glyphs by their envelope does not, and would reserve the whole overflowing
  // extent. Quarantine rather than silently rescale someone's artwork.
  const pad = 0.75;
  if (bounds.minX < -pad || bounds.minY < -pad || bounds.maxX > 100 + pad || bounds.maxY > 100 + pad) {
    quarantined.push({
      id,
      why: `ink escapes the 0..100 viewBox — [${r4(bounds.minX)}, ${r4(bounds.minY)}, ${r4(bounds.maxX)}, ${r4(bounds.maxY)}]; renders only because the viewport crops it`,
    });
    continue;
  }
  results.push({ id, paths, bounds, rejected });
}

shim.install();

/* ── report ────────────────────────────────────────────────────────────── */

const rejectedTags = new Map<string, string[]>();
for (const r of results) for (const t of r.rejected) {
  if (!rejectedTags.has(t)) rejectedTags.set(t, []);
  rejectedTags.get(t)!.push(r.id);
}

console.log(`extracted ${results.length} of ${Object.keys(DRAWS).length} marks`);
if (quarantined.length) {
  console.log(`\nQUARANTINED ${quarantined.length}:`);
  for (const q of quarantined) console.log(`  ${q.id.padEnd(14)} ${q.why}`);
}
console.log(`total locked paths: ${results.reduce((n, r) => n + r.paths.length, 0)}`);
for (const [tag, ids] of rejectedTags) {
  console.log(`\nREFUSED <${tag}> in ${ids.length} mark(s): ${ids.join(", ")}`);
}
for (const p of problems) console.log(`PROBLEM  ${p}`);

const outside = results.filter(
  (r) => r.bounds.minX < -1 || r.bounds.minY < -1 || r.bounds.maxX > 101 || r.bounds.maxY > 101,
);
if (outside.length) {
  console.log(`\noutside the 0..100 viewBox: ${outside.map((r) => r.id).join(", ")}`);
}

console.log("\nper-mark path counts:");
for (const r of results) {
  const b = r.bounds;
  console.log(
    `  ${r.id.padEnd(18)} ${String(r.paths.length).padStart(3)} paths   ` +
    `[${r4(b.minX)}, ${r4(b.minY)}, ${r4(b.maxX)}, ${r4(b.maxY)}]` +
    (r.rejected.length ? `   refused: ${r.rejected.join(",")}` : ""),
  );
}

/* ── emit geometry/v2 source ───────────────────────────────────────────── */

const clamp01 = (n: number): number => Math.min(100, Math.max(0, n));

const records = results.map((r) => {
  const b = r.bounds;
  const cx = (b.minX + b.maxX) / 2, cy = (b.minY + b.maxY) / 2;
  const inset = 0.18;
  const ix0 = b.minX + (b.maxX - b.minX) * inset, ix1 = b.maxX - (b.maxX - b.minX) * inset;
  const iy0 = b.minY + (b.maxY - b.minY) * inset, iy1 = b.maxY - (b.maxY - b.minY) * inset;
  const paths = r.paths
    .map((p) => (p.role === "fill" ? `    fill(${JSON.stringify(p.d)})` : `    stroke(${JSON.stringify(p.d)}, ${p.strokeWidth})`))
    .join(",\n");
  return `  {
    id: "mark-${r.id}",
    viewBox: MARK_VIEWBOX,
    paths: Object.freeze([
${paths},
    ]),
    anchors: Object.freeze({
      center: p(${r4(cx)}, ${r4(cy)}),
      entry: p(${r4(clamp01(b.minX))}, ${r4(cy)}),
      exit: p(${r4(clamp01(b.maxX))}, ${r4(cy)}),
      modifierSlots: Object.freeze([p(${r4(ix1)}, ${r4(iy0)}), p(${r4(ix1)}, ${r4(iy1)}), p(${r4(ix0)}, ${r4(iy1)}), p(${r4(ix0)}, ${r4(iy0)})]),
    }),
    inkBounds: Object.freeze([${r4(b.minX)}, ${r4(b.minY)}, ${r4(b.maxX)}, ${r4(b.maxY)}] as const),
  }`;
});

const header = `/**
 * Authored glyph geometry, version \`geometry/v2\`.
 *
 * GENERATED by \`scripts/extract-codex-geometry.ts\` from the studio's own draw
 * registry (\`assets/glyphdraws.ts\`). Do not hand-edit: regenerate instead, and
 * remember that a released version is immutable — a redraw lands as v3.
 *
 * These are the studio's real marks, lowered from imperative DOM drawing into
 * locked path data. Every primitive became a path because \`LockedPath\` exposes
 * \`d\` and nothing else, so no downstream engine can reinterpret a shape.
 *
 * ${quarantined.length} of ${results.length + quarantined.length} marks are NOT here. Each was refused for a stated
 * reason rather than approximated — see the quarantine list at the foot of this
 * file. Substituting a wrong glyph is the one thing this pipeline refuses to do.
 */

import type { GlyphGeometryId, Point } from "@studio137/plate-core";

import type { GlyphAnchors, LockedPath } from "./types.js";

export const GEOMETRY_V2_VERSION = "geometry/v2";
/** These are authored marks, but the mapping from meaning to mark is not canon. */
export const GEOMETRY_V2_IS_PROVISIONAL = true;

const MIN_PRINT_STROKE_PT = 0.75;

export type GeometrySource = Readonly<{
  id: GlyphGeometryId;
  viewBox: readonly [number, number, number, number];
  paths: readonly LockedPath[];
  anchors: GlyphAnchors;
  inkBounds: readonly [number, number, number, number];
  minimumPrintStrokePt?: number;
}>;

const p = (x: number, y: number): Point => Object.freeze({ x, y });
const stroke = (d: string, strokeWidth: number): LockedPath =>
  Object.freeze({ d, role: "stroke" as const, strokeWidth });
const fill = (d: string): LockedPath =>
  Object.freeze({ d, role: "fill" as const, strokeWidth: 0 });

const MARK_VIEWBOX = Object.freeze([0, 0, 100, 100] as const);

export const GEOMETRY_V2_SOURCE: readonly GeometrySource[] = Object.freeze([
`;

const footer = `]);

export { MIN_PRINT_STROKE_PT };

/**
 * Refused during extraction, with the reason each was refused:
 *
${quarantined.map((q) => ` * - ${q.id}: ${q.why}`).join("\n")}
 */
`;

writeFileSync(
  new URL("../packages/glyph-registry/src/geometry.v2.ts", import.meta.url),
  header + records.join(",\n") + ",\n" + footer,
  "utf8",
);
console.log(`\nwrote packages/glyph-registry/src/geometry.v2.ts — ${records.length} marks`);

/**
 * Authored glyph geometry, version `geometry/v1`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  PROVISIONAL — NOT ARTIST-APPROVED
 *
 *  Spec Phase 1 requires every canonical glyph to be redrawn by the artist as
 *  clean SVG, approved on a contact sheet, and then frozen. The paths below are
 *  constructed placeholders that satisfy the *structural* contract — distinct
 *  silhouettes, declared anchors, collision envelopes, print-stroke minimums,
 *  and integrity hashes — so that every downstream engine can be built and
 *  tested against real geometry.
 *
 *  Replacing them is a data edit, not a code change: drop the authored paths in
 *  here, run `pnpm geometry:hash`, and the registry picks them up. Per spec
 *  §12.1 a released version is immutable, so a real redraw must land as
 *  `geometry/v2` rather than overwriting this file.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type { GlyphGeometryId, Point } from "@studio137/plate-core";

import type { GlyphAnchors, LockedPath } from "./types.js";

export const GEOMETRY_VERSION = "geometry/v1";
export const GEOMETRY_IS_PROVISIONAL = true;

/** Smallest stroke that survived the validated print process, in points. */
const MIN_PRINT_STROKE_PT = 0.75;

export type GeometrySource = Readonly<{
  id: GlyphGeometryId;
  viewBox: readonly [number, number, number, number];
  paths: readonly LockedPath[];
  anchors: GlyphAnchors;
  /** Ink extent as `[minX, minY, maxX, maxY]`, stroke width included. */
  inkBounds: readonly [number, number, number, number];
  minimumPrintStrokePt?: number;
}>;

const p = (x: number, y: number): Point => Object.freeze({ x, y });

const stroke = (d: string, strokeWidth: number): LockedPath =>
  Object.freeze({ d, role: "stroke" as const, strokeWidth });

const fill = (d: string): LockedPath =>
  Object.freeze({ d, role: "fill" as const, strokeWidth: 0 });

/** Anchors shared by every root family, in the 100×100 root viewBox. */
const ROOT_ANCHORS: GlyphAnchors = Object.freeze({
  center: p(50, 50),
  entry: p(6, 50),
  exit: p(94, 50),
  modifierSlots: Object.freeze([p(78, 20), p(80, 80), p(20, 80), p(20, 20)]),
});

const MODIFIER_ANCHORS: GlyphAnchors = Object.freeze({
  center: p(20, 20),
  modifierSlots: Object.freeze([]),
});

const SEPARATOR_ANCHORS: GlyphAnchors = Object.freeze({
  center: p(30, 50),
  entry: p(30, 4),
  exit: p(30, 96),
  modifierSlots: Object.freeze([]),
});

const ROOT_VIEWBOX = Object.freeze([0, 0, 100, 100] as const);
const MODIFIER_VIEWBOX = Object.freeze([0, 0, 40, 40] as const);
const SEPARATOR_VIEWBOX = Object.freeze([0, 0, 60, 100] as const);

export const GEOMETRY_V1_SOURCE: readonly GeometrySource[] = Object.freeze([
  // ── Root families ────────────────────────────────────────────────────────
  {
    id: "root-signal",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M50 10 L50 90", 8),
      stroke("M62 30 A 26 26 0 0 1 62 70", 5),
      stroke("M72 16 A 52 52 0 0 1 72 84", 5),
      fill("M50 43 A 7 7 0 1 0 50 57 A 7 7 0 1 0 50 43 Z"),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([42, 6, 88, 94] as const),
  },
  {
    id: "root-body",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M32 18 L32 60 A 18 26 0 0 0 68 60 L68 18", 8),
      stroke("M26 18 L74 18", 8),
      stroke("M38 44 L62 44", 5),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([22, 14, 78, 90] as const),
  },
  {
    id: "root-persistence",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M20 72 A 36 36 0 1 1 80 72", 8),
      stroke("M20 72 L28 84", 8),
      stroke("M80 72 L72 84", 8),
      stroke("M8 50 L92 50", 8),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([4, 12, 96, 88] as const),
  },
  {
    id: "root-void",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M66 24.5 A 30 30 0 1 1 34 24.5", 8),
      stroke("M34 24.5 L28 14", 5),
      stroke("M66 24.5 L72 14", 5),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([16, 10, 84, 84] as const),
  },
  {
    id: "root-threshold",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M28 26 L28 86", 8),
      stroke("M72 26 L72 86", 8),
      stroke("M18 26 L82 26", 8),
      stroke("M14 86 L86 86", 8),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([10, 22, 90, 90] as const),
  },
  {
    id: "root-witness",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M12 50 Q50 8 88 50 Q50 92 12 50 Z", 8),
      fill("M50 41 A 9 9 0 1 0 50 59 A 9 9 0 1 0 50 41 Z"),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([8, 25, 92, 75] as const),
  },
  {
    id: "root-structure",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M22 22 L78 22 L78 78 L22 78 Z", 8),
      stroke("M50 22 L50 78", 5),
      stroke("M22 50 L78 50", 5),
      stroke("M50 34 L66 50 L50 66 L34 50 Z", 5),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([18, 18, 82, 82] as const),
  },
  {
    id: "root-transformation",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M50 14 L84 78 L16 78 Z", 8),
      stroke("M30 58 L70 58", 8),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([12, 10, 88, 82] as const),
  },
  {
    id: "root-duration",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M16 50 A 34 34 0 1 0 84 50 A 34 34 0 1 0 16 50 Z", 8),
      stroke("M50 50 L50 18", 8),
      stroke("M50 50 L76 63", 5),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([12, 12, 88, 88] as const),
  },

  // ── Modifiers ────────────────────────────────────────────────────────────
  {
    id: "mod-intensify",
    viewBox: MODIFIER_VIEWBOX,
    paths: Object.freeze([
      stroke("M8 24 L20 12 L32 24", 5),
      stroke("M8 34 L20 22 L32 34", 5),
    ]),
    anchors: MODIFIER_ANCHORS,
    inkBounds: Object.freeze([5, 9, 35, 37] as const),
  },
  {
    id: "mod-negate",
    viewBox: MODIFIER_VIEWBOX,
    paths: Object.freeze([stroke("M9 31 L31 9", 5)]),
    anchors: MODIFIER_ANCHORS,
    inkBounds: Object.freeze([6, 6, 34, 34] as const),
  },
  {
    id: "mod-collective",
    viewBox: MODIFIER_VIEWBOX,
    paths: Object.freeze([
      fill("M20 8 A 4 4 0 1 0 20 16 A 4 4 0 1 0 20 8 Z"),
      fill("M11 24 A 4 4 0 1 0 11 32 A 4 4 0 1 0 11 24 Z"),
      fill("M29 24 A 4 4 0 1 0 29 32 A 4 4 0 1 0 29 24 Z"),
    ]),
    anchors: MODIFIER_ANCHORS,
    inkBounds: Object.freeze([7, 8, 33, 32] as const),
  },
  {
    id: "mod-anterior",
    viewBox: MODIFIER_VIEWBOX,
    paths: Object.freeze([
      stroke("M27 9 A 12 12 0 0 0 27 31", 5),
      stroke("M27 20 L13 20", 5),
    ]),
    anchors: MODIFIER_ANCHORS,
    inkBounds: Object.freeze([10, 6, 30, 34] as const),
  },

  // ── Separators ───────────────────────────────────────────────────────────
  {
    id: "sep-clause-break",
    viewBox: SEPARATOR_VIEWBOX,
    paths: Object.freeze([
      stroke("M30 14 L30 86", 6),
      fill("M30 4 A 4 4 0 1 0 30 12 A 4 4 0 1 0 30 4 Z"),
      fill("M30 88 A 4 4 0 1 0 30 96 A 4 4 0 1 0 30 88 Z"),
    ]),
    anchors: SEPARATOR_ANCHORS,
    inkBounds: Object.freeze([26, 4, 34, 96] as const),
  },
  {
    id: "sep-relation",
    viewBox: SEPARATOR_VIEWBOX,
    paths: Object.freeze([
      stroke("M8 50 L52 50", 6),
      stroke("M30 40 L40 50 L30 60 L20 50 Z", 6),
    ]),
    anchors: SEPARATOR_ANCHORS,
    inkBounds: Object.freeze([5, 37, 55, 63] as const),
  },
  {
    id: "sep-mirror-axis",
    viewBox: SEPARATOR_VIEWBOX,
    paths: Object.freeze([stroke("M22 8 L22 92", 6), stroke("M38 8 L38 92", 6)]),
    anchors: SEPARATOR_ANCHORS,
    inkBounds: Object.freeze([19, 5, 41, 95] as const),
  },
  {
    id: "sep-void-gap",
    viewBox: SEPARATOR_VIEWBOX,
    paths: Object.freeze([
      stroke("M30 14 L30 30", 6),
      stroke("M30 42 L30 58", 6),
      stroke("M30 70 L30 86", 6),
    ]),
    anchors: SEPARATOR_ANCHORS,
    inkBounds: Object.freeze([27, 11, 33, 89] as const),
  },

  // ── Literal escape cartouche ─────────────────────────────────────────────
  {
    // Frames a literal escape payload: source text the grammar does not claim
    // to interpret, carried through the plate rather than discarded (spec §4.1).
    id: "frame-literal-escape",
    viewBox: ROOT_VIEWBOX,
    paths: Object.freeze([
      stroke("M34 12 L12 12 L12 88 L34 88", 7),
      stroke("M66 12 L88 12 L88 88 L66 88", 7),
    ]),
    anchors: ROOT_ANCHORS,
    inkBounds: Object.freeze([8, 8, 92, 92] as const),
  },
] satisfies readonly GeometrySource[]);

export const MINIMUM_PRINT_STROKE_PT = MIN_PRINT_STROKE_PT;

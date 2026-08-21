/**
 * Registry types (spec §12).
 *
 * The central invariant of the whole system lives here:
 *
 *   > Canonical payload glyphs are authored vector geometry. Layout,
 *   > mathematical substrate, corruption, decoys, and atmosphere may position,
 *   > transform, mask, surround, or partially obscure those vectors, but may
 *   > never redraw or mutate their path data.
 *
 * That is enforced structurally: a `LockedPath` exposes `d` as a readonly
 * string and the registry hands out frozen records. Downstream engines receive
 * bounds, anchors, and envelopes — never a path-editing API.
 */

import type { GlyphGeometryId, Point, Rect } from "@studio137/plate-core";

/** How a locked path is painted. Payload glyphs never depend on a system font. */
export type PaintRole = "stroke" | "fill";

export type LockedPath = Readonly<{
  /** SVG path data in the record's own viewBox space. Immutable once released. */
  d: string;
  role: PaintRole;
  /** Stroke width in viewBox units. Ignored when `role` is `fill`. */
  strokeWidth: number;
}>;

export type GlyphAnchors = Readonly<{
  center: Point;
  /** Where a reading path enters the glyph, used to orient it along a substrate. */
  entry?: Point;
  /** Where a reading path leaves the glyph. */
  exit?: Point;
  /** Attachment points for modifier marks, in stack order. */
  modifierSlots: readonly Point[];
}>;

export type GlyphGeometryRecord = Readonly<{
  id: GlyphGeometryId;
  version: string;
  viewBox: readonly [number, number, number, number];
  paths: readonly LockedPath[];
  anchors: GlyphAnchors;
  /** Convex polygon used for collision avoidance. Never used for painting. */
  collisionEnvelope: readonly Point[];
  /** Smallest stroke, in points, that survives the validated print process. */
  minimumPrintStrokePt: number;
  /** SHA-256 over the canonical serialization of the path data. */
  integritySha256: string;
}>;

export interface GeometryRegistry {
  readonly version: string;
  /** True while the geometry is placeholder work awaiting artist approval. */
  readonly provisional: boolean;
  readonly ids: readonly GlyphGeometryId[];
  get(id: GlyphGeometryId): GlyphGeometryRecord;
  has(id: GlyphGeometryId): boolean;
  /** Ink bounds in viewBox units, derived from the collision envelope. */
  inkBounds(id: GlyphGeometryId): Rect;
  /**
   * Re-hash every record's path data and compare against the declared integrity
   * hashes. Called at each pipeline stage for verification Gate 4.
   */
  verifyIntegrity(): void;
}

/**
 * Substrate contracts (spec §9).
 *
 * A substrate organizes space. It may generate coordinates, tangents and
 * normals, guide curves, regions, masks, registration marks, and annotation
 * geometry — and nothing else. Spec §9.2 is explicit: **substrates may not
 * generate or alter canonical glyph paths.** The interface below has no way to
 * express a glyph, which is how that restriction is enforced.
 */

import type {
  DeterministicStream,
  Point,
  Rect,
  SubstrateId,
  Vector,
} from "@studio137/plate-core";

/**
 * Curve parameter domain.
 *
 * `tFixed` is an integer in `[0, T_SCALE]` rather than a float in `[0, 1]` so
 * that stepping along a curve accumulates no floating-point drift and two runs
 * sample exactly the same positions.
 */
export const T_SCALE = 1_000_000;

export type SubstrateGuideRole = "guide" | "registration" | "annotation";

export type SubstrateGuide = Readonly<{
  /** SVG path data in plate coordinate space. Substrate layer only. */
  d: string;
  role: SubstrateGuideRole;
  strokeWidth: number;
  /** 0–1 painting weight the renderer maps onto opacity. */
  weight: number;
}>;

export type DeterministicMask = Readonly<{
  id: string;
  /** Mask shapes in plate coordinate space. */
  shapes: readonly Readonly<{ d: string }>[];
}>;

export type SubstrateFrame = Readonly<{ tangent: Vector; normal: Vector }>;

export interface SubstrateSampler {
  readonly id: SubstrateId;
  readonly version: string;
  readonly bounds: Rect;
  /** Human-readable construction note for the clause sheet and annotations. */
  readonly construction: string;

  /** Position on the substrate's primary guide curve. */
  pointAt(tFixed: number): Point;
  /** Unit tangent and normal at the same parameter, for orienting glyphs. */
  frameAt(tFixed: number): SubstrateFrame;
  /**
   * `count` discrete anchor positions, spread across the construction.
   * Layout solvers snap clause and glyph positions to these.
   */
  anchors(count: number): readonly Point[];
  /** Substrate-layer guide geometry at the given density. */
  guides(density: number): readonly SubstrateGuide[];
  /** Optional deterministic region mask, used by recorded occlusion. */
  maskRegion?(bounds: Rect, rng: DeterministicStream): DeterministicMask;
}

export interface SubstrateFactory {
  readonly id: SubstrateId;
  readonly version: string;
  create(bounds: Rect, rng: DeterministicStream): SubstrateSampler;
}

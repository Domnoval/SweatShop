/**
 * Layout contracts (spec §8).
 *
 * A solver receives glyph *envelopes* — bounds, anchors, and immutable geometry
 * references — and returns placements. There is deliberately no path data in
 * either direction: spec §8.2 requires that a solver "cannot edit path
 * commands", and the only way to guarantee that is to never hand it any.
 */

import type {
  Diagnostic,
  DeterministicStream,
  GlyphGeometryId,
  LayoutFamilyId,
  NodeId,
  Point,
  Rect,
  ResolvedOutput,
} from "@studio137/plate-core";
import type { GlyphAnchors, ModifierId } from "@studio137/glyph-registry";
import type { SubstrateSampler } from "@studio137/substrate-engine";

export const LAYOUT_VERSION = "layout/v1";

export type ModifierEnvelope = Readonly<{
  modifierId: ModifierId;
  geometryId: GlyphGeometryId;
  viewBox: readonly [number, number, number, number];
  inkBounds: Rect;
  /** Which of the host's modifier slots this mark occupies. */
  slotIndex: number;
  /** Size relative to the host root. */
  scale: number;
}>;

export type EnvelopeKind = "glyph" | "separator" | "literal-escape";

export type GlyphEnvelope = Readonly<{
  nodeId: NodeId;
  kind: EnvelopeKind;
  clauseIndex: number;
  tokenIndex: number;
  geometryId: GlyphGeometryId;
  viewBox: readonly [number, number, number, number];
  /** Ink extent inside the viewBox. Layout positions this, not the viewBox. */
  inkBounds: Rect;
  anchors: GlyphAnchors;
  /** Narrowest stroke in this glyph, in viewBox units. */
  minStrokeViewBoxUnits: number;
  minimumPrintStrokePt: number;
  /** Relative advance width. Separators are narrower than roots. */
  advance: number;
  modifiers: readonly ModifierEnvelope[];
  clauseAnchor: boolean;
  /** Present on literal escapes; sizes the cartouche. */
  codePointCount?: number;
}>;

export type PlacedModifier = Readonly<{
  modifierId: ModifierId;
  geometryId: GlyphGeometryId;
  /** Uniform scale applied to the modifier's viewBox. */
  scale: number;
  /** Degrees, clockwise, quantized. */
  rotation: number;
  /** Translation of the modifier's viewBox origin, in plate units. */
  x: number;
  y: number;
  bounds: Rect;
}>;

export type PlacedGlyph = Readonly<{
  nodeId: NodeId;
  kind: EnvelopeKind;
  clauseIndex: number;
  geometryId: GlyphGeometryId;
  /** Uniform scale applied to the glyph's viewBox. */
  scale: number;
  rotation: number;
  /** Translation of the glyph's viewBox origin, in plate units. */
  x: number;
  y: number;
  /** Ink bounds in plate space after scale, rotation, and translation. */
  bounds: Rect;
  /** Glyph centre in plate space, used by corruption and decoy planning. */
  centre: Point;
  readingIndex: number;
  modifiers: readonly PlacedModifier[];
}>;

export type LayoutPlan = Readonly<{
  layoutId: LayoutFamilyId;
  version: string;
  bounds: Rect;
  safeArea: Rect;
  placements: readonly PlacedGlyph[];
  /**
   * Negative space the composition depends on. Decoys and atmosphere must leave
   * these regions alone (spec §8.2, "protected negative space").
   */
  protectedRegions: readonly Rect[];
  readingOrder: readonly NodeId[];
  /** Narrowest stroke anywhere in the plate, in points. */
  minimumStrokePt: number;
  diagnostics: readonly Diagnostic[];
}>;

export type LayoutInput = Readonly<{
  nodes: readonly GlyphEnvelope[];
  bounds: Rect;
  density: number;
  substrate: SubstrateSampler;
  rng: DeterministicStream;
  output: ResolvedOutput;
}>;

export interface LayoutSolver {
  readonly id: LayoutFamilyId;
  readonly version: string;
  readonly description: string;
  solve(input: LayoutInput): LayoutPlan;
}

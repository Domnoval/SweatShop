/**
 * Corruption operation classes (spec §7.1).
 *
 * Corruption here is a grammatical and transmission-state system, not a generic
 * distress filter. Each operation records exactly what an inverse would need.
 *
 * The exact/stylized split is enforced by type: `LossyPayloadOperation` is the
 * only destructive class, and `assertExactModePolicy` refuses a plan containing
 * one. Everything else is either invertible or a non-destructive mask.
 */

import type { GlyphGeometryId, NodeId, Rect } from "@studio137/plate-core";
import type { RootFamilyId } from "@studio137/glyph-registry";

export const CORRUPTION_VERSION = "corruption/v1";

export type CorruptionBandId =
  | "canonical"
  | "noise"
  | "interrupted"
  | "degraded"
  | "event-field";

export type CorruptionBand = Readonly<{
  id: CorruptionBandId;
  label: string;
  uiRange: readonly [number, number];
  behavior: string;
}>;

type OperationBase = Readonly<{ operationId: string }>;

/** Swap a root for its involution partner. Invertible by applying it again. */
export type ReversibleSubstitution = OperationBase &
  Readonly<{
    kind: "reversible-substitution";
    nodeId: NodeId;
    fromRootFamilyId: RootFamilyId;
    toRootFamilyId: RootFamilyId;
    toGeometryId: GlyphGeometryId;
  }>;

/** Reflect a glyph across an axis. Invertible by reflecting again. */
export type ReversibleMirror = OperationBase &
  Readonly<{
    kind: "reversible-mirror";
    nodeId: NodeId;
    axis: "vertical" | "horizontal";
  }>;

/** Reorder a clause's reading. Invertible from the recorded original order. */
export type ReversiblePermutation = OperationBase &
  Readonly<{
    kind: "reversible-permutation";
    clauseIndex: number;
    originalOrder: readonly NodeId[];
    permutedOrder: readonly NodeId[];
  }>;

/**
 * Cover part of a glyph with a recorded mask.
 *
 * Non-destructive: the canonical paths stay in the SVG beneath the mask, which
 * is what lets exact mode use occlusion at all (spec §7.3).
 */
export type PayloadOcclusion = OperationBase &
  Readonly<{
    kind: "payload-occlusion";
    nodeId: NodeId;
    maskId: string;
    /** Fraction of the glyph's bounds covered, 0–1. */
    coverage: number;
    /** Named stream fork the mask geometry came from, for replay. */
    maskGeometrySeed: string;
    shapes: readonly Readonly<{ d: string }>[];
  }>;

/** Marks on a non-payload layer. Never touches a canonical glyph. */
export type DecorativeInterference = OperationBase &
  Readonly<{
    kind: "decorative-interference";
    layer: "behind" | "front";
    shapes: readonly Readonly<{ d: string; strokeWidth: number; weight: number }>[];
  }>;

/**
 * Destructive presentation operations. Stylized mode only.
 *
 * Even here the canonical AST survives intact and the manifest retains the
 * source; only the *public presentation* becomes visually lossy (spec §7.4).
 */
export type LossyPayloadOperation = OperationBase &
  Readonly<{
    kind: "lossy-payload";
    nodeId: NodeId;
    operation: "abrasion" | "dropout" | "misregistration";
    /** Operation strength, 0–1. */
    magnitude: number;
    /** Offset in plate units, for misregistration. */
    offsetX: number;
    offsetY: number;
  }>;

export type CorruptionOperation =
  | ReversibleSubstitution
  | ReversibleMirror
  | ReversiblePermutation
  | PayloadOcclusion
  | DecorativeInterference
  | LossyPayloadOperation;

/** A non-semantic mark that resembles payload but carries none. */
export type DecoyNode = Readonly<{
  decoyId: string;
  geometryId: GlyphGeometryId;
  scale: number;
  rotation: number;
  x: number;
  y: number;
  bounds: Rect;
  layer: "behind" | "front";
  /** 0–1 painting weight. Decoys sit below payload in the hierarchy. */
  weight: number;
}>;

export type AtmospherePlan = Readonly<{
  coverage: number;
  marks: readonly Readonly<{ d: string; strokeWidth: number; weight: number }>[];
  /** Whole-plate misregistration offset, in plate units. */
  registrationOffsetX: number;
  registrationOffsetY: number;
}>;

/** Machine-readable inverse instruction, stored in the private manifest. */
export type InverseOperation = Readonly<{
  operationId: string;
  appliesTo: readonly NodeId[];
  inverse:
    | Readonly<{
        kind: "substitute";
        nodeId: NodeId;
        restoreRootFamilyId: RootFamilyId;
        restoreGeometryId: GlyphGeometryId;
      }>
    | Readonly<{ kind: "unmirror"; nodeId: NodeId; axis: "vertical" | "horizontal" }>
    | Readonly<{ kind: "restore-order"; clauseIndex: number; originalOrder: readonly NodeId[] }>
    | Readonly<{ kind: "remove-mask"; nodeId: NodeId; maskId: string }>;
}>;

/** Manifest record for a corruption site (spec §18). */
export type CorruptionRecord = Readonly<{
  operationId: string;
  kind: CorruptionOperation["kind"];
  nodeIds: readonly NodeId[];
  clauseIndex: number | null;
  reversible: boolean;
}>;

/** Manifest record for an occlusion site (spec §7.3). */
export type OcclusionRecord = Readonly<{
  maskId: string;
  nodeId: NodeId;
  coverage: number;
  maskGeometrySeed: string;
  /** Reading order at the time the mask was applied. */
  originalReadingIndex: number;
  requiredInverse: "remove-mask";
}>;

export type CorruptionPlan = Readonly<{
  version: string;
  band: CorruptionBand;
  level: number;
  mode: "exact" | "stylized";
  operations: readonly CorruptionOperation[];
  inverseOperations: readonly InverseOperation[];
  corruptionSites: readonly CorruptionRecord[];
  occlusionSites: readonly OcclusionRecord[];
  /** Reading order after any permutation, by clause index. */
  effectiveReadingOrder: Readonly<Record<number, readonly NodeId[]>>;
  /** True when the public surface is not guaranteed to be visually decodable. */
  visuallyLossy: boolean;
}>;

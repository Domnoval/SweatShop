/**
 * Corruption, decoy, and atmosphere planning (spec §7, §11.3).
 *
 * Nothing in this module mutates the canonical AST. It produces a *plan* —
 * a list of recorded operations the renderer applies as presentation. The
 * canonical payload group in the exported SVG always contains the unchanged
 * authored paths; a glyph that appears erased is sitting under a recorded mask.
 */

import {
  densityProfile,
  ordinalId,
  PlateError,
  quantize,
  rectsOverlap,
  type DeterministicStream,
  type GlyphGeometryId,
  type NodeId,
  type PlateMode,
  type Rect,
} from "@studio137/plate-core";
import type {
  CorruptionEligibility,
  GrammarRegistry,
  MirrorEligibility,
  RootFamilyId,
} from "@studio137/glyph-registry";
import type { LayoutPlan } from "@studio137/layout-engine";

import { corruptionBand } from "./bands.js";
import { interferenceShapes, occlusionShapes, rectPath } from "./geometry.js";
import type {
  AtmospherePlan,
  CorruptionOperation,
  CorruptionPlan,
  CorruptionRecord,
  DecoyNode,
  InverseOperation,
  OcclusionRecord,
} from "./types.js";
import { CORRUPTION_VERSION } from "./types.js";

/**
 * The projection of a canonical node this engine is allowed to see.
 *
 * Deliberately minimal: eligibility flags and identifiers, no source text and no
 * geometry. Corruption cannot leak the phrase because it is never shown it.
 */
export type CorruptibleNode = Readonly<{
  nodeId: NodeId;
  clauseIndex: number;
  kind: "glyph" | "separator" | "literal-escape";
  rootFamilyId?: RootFamilyId;
  mirrorEligibility?: MirrorEligibility;
  corruptionEligibility?: CorruptionEligibility;
  clauseAnchor: boolean;
  coreAnchor: boolean;
}>;

export type PlanCorruptionInput = Readonly<{
  nodes: readonly CorruptibleNode[];
  layout: LayoutPlan;
  /** Normalized 0–1 corruption level. */
  level: number;
  mode: PlateMode;
  grammar: GrammarRegistry;
  rng: DeterministicStream;
}>;

/** Level at which the Interrupted band begins; structural corruption starts here. */
const INTERRUPTED_THRESHOLD = 0.36;
/** Level at which the Degraded band begins; destructive operations become available. */
const DEGRADED_THRESHOLD = 0.61;
/** Level at which the Event Field band begins; even anchors become touchable. */
const EVENT_FIELD_THRESHOLD = 0.81;

/**
 * Whether a protected node may be corrupted at this level.
 *
 * Clause anchors and core-anchor families hold the composition's hierarchy. They
 * are only exposed in an Event Field, and even then at reduced probability
 * (spec §7.5).
 */
function protectionFactor(node: CorruptibleNode, level: number): number {
  const protectedNode = node.clauseAnchor || node.coreAnchor;
  if (!protectedNode) return 1;
  if (level < EVENT_FIELD_THRESHOLD) return 0;
  return 0.35;
}

function selectEligible(
  nodes: readonly CorruptibleNode[],
  rate: number,
  level: number,
  rng: DeterministicStream,
  predicate: (node: CorruptibleNode) => boolean,
): readonly CorruptibleNode[] {
  return Object.freeze(
    nodes.filter((node) => {
      if (!predicate(node)) return false;
      const factor = protectionFactor(node, level);
      if (factor === 0) return false;
      return rng.nextBool(Math.min(1, rate * factor));
    }),
  );
}

export function planCorruption(input: PlanCorruptionInput): CorruptionPlan {
  const { nodes, layout, level, mode, grammar, rng } = input;
  const band = corruptionBand(level);

  const operations: CorruptionOperation[] = [];
  const inverseOperations: InverseOperation[] = [];
  const corruptionSites: CorruptionRecord[] = [];
  const occlusionSites: OcclusionRecord[] = [];
  const counters = { operation: 0, mask: 0 };

  const nextOperationId = (): string => {
    counters.operation += 1;
    return ordinalId("op", counters.operation);
  };

  const placementById = new Map(layout.placements.map((placement) => [placement.nodeId, placement]));
  const glyphNodes = nodes.filter((node) => node.kind === "glyph");

  // ── Reversible substitution ─────────────────────────────────────────────
  // Each family maps to its involution partner, so applying the operation twice
  // restores the original. Ambiguous substitution is forbidden in exact mode.
  const substitutionStream = rng.fork("substitution");
  for (const node of selectEligible(
    glyphNodes,
    level * 0.4,
    level,
    substitutionStream,
    (candidate) =>
      candidate.corruptionEligibility?.substitutable === true &&
      candidate.rootFamilyId !== undefined,
  )) {
    const from = grammar.root(node.rootFamilyId!);
    const to = grammar.root(from.substitutionPartner);
    if (to.id === from.id) continue;

    const operationId = nextOperationId();
    operations.push(
      Object.freeze({
        kind: "reversible-substitution" as const,
        operationId,
        nodeId: node.nodeId,
        fromRootFamilyId: from.id,
        toRootFamilyId: to.id,
        toGeometryId: to.geometryId,
      }),
    );
    inverseOperations.push(
      Object.freeze({
        operationId,
        appliesTo: Object.freeze([node.nodeId]),
        inverse: Object.freeze({
          kind: "substitute" as const,
          nodeId: node.nodeId,
          restoreRootFamilyId: from.id,
          restoreGeometryId: from.geometryId,
        }),
      }),
    );
    corruptionSites.push(
      Object.freeze({
        operationId,
        kind: "reversible-substitution" as const,
        nodeIds: Object.freeze([node.nodeId]),
        clauseIndex: node.clauseIndex,
        reversible: true,
      }),
    );
  }

  // ── Reversible mirroring ────────────────────────────────────────────────
  const mirrorStream = rng.fork("mirror");
  if (level >= INTERRUPTED_THRESHOLD) {
    for (const node of selectEligible(
      glyphNodes,
      (level - INTERRUPTED_THRESHOLD) * 0.6,
      level,
      mirrorStream,
      (candidate) => candidate.mirrorEligibility === "mirrorable",
    )) {
      const operationId = nextOperationId();
      const axis = mirrorStream.nextBool(0.7) ? ("vertical" as const) : ("horizontal" as const);
      operations.push(
        Object.freeze({ kind: "reversible-mirror" as const, operationId, nodeId: node.nodeId, axis }),
      );
      inverseOperations.push(
        Object.freeze({
          operationId,
          appliesTo: Object.freeze([node.nodeId]),
          inverse: Object.freeze({ kind: "unmirror" as const, nodeId: node.nodeId, axis }),
        }),
      );
      corruptionSites.push(
        Object.freeze({
          operationId,
          kind: "reversible-mirror" as const,
          nodeIds: Object.freeze([node.nodeId]),
          clauseIndex: node.clauseIndex,
          reversible: true,
        }),
      );
    }
  }

  // ── Reversible permutation ──────────────────────────────────────────────
  // Nodes swap the layout slots they occupy. The authored order is recorded, so
  // the reading is recoverable even though the plate now reads out of sequence.
  const permutationStream = rng.fork("permutation");
  const effectiveReadingOrder: Record<number, readonly NodeId[]> = {};
  const clauseIndices = [...new Set(nodes.map((node) => node.clauseIndex))].sort((a, b) => a - b);

  for (const clauseIndex of clauseIndices) {
    const clauseNodes = nodes.filter((node) => node.clauseIndex === clauseIndex);
    const order = clauseNodes.map((node) => node.nodeId);
    effectiveReadingOrder[clauseIndex] = Object.freeze([...order]);

    if (level < INTERRUPTED_THRESHOLD || order.length < 2) continue;
    const chance = (level - INTERRUPTED_THRESHOLD) / (1 - INTERRUPTED_THRESHOLD);
    if (!permutationStream.nextBool(chance * 0.7)) continue;

    // Anchors keep their slots so the clause retains a fixed point to read from.
    const movable = clauseNodes.filter((node) => protectionFactor(node, level) > 0);
    if (movable.length < 2) continue;

    const movableIds = movable.map((node) => node.nodeId);
    const shuffled = permutationStream.shuffle(movableIds);
    if (shuffled.every((id, index) => id === movableIds[index])) continue;

    const swapMap = new Map(movableIds.map((id, index) => [id, shuffled[index]!]));
    const permuted = order.map((id) => swapMap.get(id) ?? id);

    const operationId = nextOperationId();
    operations.push(
      Object.freeze({
        kind: "reversible-permutation" as const,
        operationId,
        clauseIndex,
        originalOrder: Object.freeze([...order]),
        permutedOrder: Object.freeze(permuted),
      }),
    );
    inverseOperations.push(
      Object.freeze({
        operationId,
        appliesTo: Object.freeze([...order]),
        inverse: Object.freeze({
          kind: "restore-order" as const,
          clauseIndex,
          originalOrder: Object.freeze([...order]),
        }),
      }),
    );
    corruptionSites.push(
      Object.freeze({
        operationId,
        kind: "reversible-permutation" as const,
        nodeIds: Object.freeze([...order]),
        clauseIndex,
        reversible: true,
      }),
    );
    effectiveReadingOrder[clauseIndex] = Object.freeze(permuted);
  }

  // ── Recorded occlusion ──────────────────────────────────────────────────
  const occlusionStream = rng.fork("occlusion");
  for (const node of selectEligible(
    nodes,
    level * 0.55,
    level,
    occlusionStream,
    (candidate) =>
      candidate.kind !== "glyph" || candidate.corruptionEligibility?.occludable === true,
  )) {
    const placement = placementById.get(node.nodeId);
    if (placement === undefined) continue;

    counters.mask += 1;
    const maskId = ordinalId("mask", counters.mask);
    const operationId = nextOperationId();
    const coverage = quantize(Math.min(0.85, 0.18 + level * 0.6), 4);
    const maskGeometrySeed = `${occlusionStream.name}/${maskId}`;
    const shapes = occlusionShapes(
      placement.bounds,
      coverage,
      occlusionStream.fork(maskId),
    );

    operations.push(
      Object.freeze({
        kind: "payload-occlusion" as const,
        operationId,
        nodeId: node.nodeId,
        maskId,
        coverage,
        maskGeometrySeed,
        shapes,
      }),
    );
    inverseOperations.push(
      Object.freeze({
        operationId,
        appliesTo: Object.freeze([node.nodeId]),
        inverse: Object.freeze({ kind: "remove-mask" as const, nodeId: node.nodeId, maskId }),
      }),
    );
    corruptionSites.push(
      Object.freeze({
        operationId,
        kind: "payload-occlusion" as const,
        nodeIds: Object.freeze([node.nodeId]),
        clauseIndex: node.clauseIndex,
        reversible: true,
      }),
    );
    occlusionSites.push(
      Object.freeze({
        maskId,
        nodeId: node.nodeId,
        coverage,
        maskGeometrySeed,
        originalReadingIndex: placement.readingIndex,
        requiredInverse: "remove-mask" as const,
      }),
    );
  }

  // ── Decorative interference ─────────────────────────────────────────────
  const interferenceStream = rng.fork("interference");
  const interferenceCount = Math.round(level * 48);
  if (interferenceCount > 0) {
    const operationId = nextOperationId();
    operations.push(
      Object.freeze({
        kind: "decorative-interference" as const,
        operationId,
        layer: "front" as const,
        shapes: interferenceShapes(
          layout.bounds,
          interferenceCount,
          interferenceStream,
          0.18 + level * 0.4,
        ),
      }),
    );
    corruptionSites.push(
      Object.freeze({
        operationId,
        kind: "decorative-interference" as const,
        nodeIds: Object.freeze([]),
        clauseIndex: null,
        reversible: true,
      }),
    );
  }

  // ── Destructive operations (stylized mode only) ─────────────────────────
  if (mode === "stylized" && level >= DEGRADED_THRESHOLD) {
    const lossyStream = rng.fork("lossy");
    const lossyKinds = ["abrasion", "dropout", "misregistration"] as const;
    for (const node of selectEligible(
      glyphNodes,
      (level - DEGRADED_THRESHOLD) * 0.8,
      level,
      lossyStream,
      () => true,
    )) {
      const placement = placementById.get(node.nodeId);
      if (placement === undefined) continue;
      const operationId = nextOperationId();
      const magnitude = quantize((level - DEGRADED_THRESHOLD) / (1 - DEGRADED_THRESHOLD), 4);
      const drift = Math.min(placement.bounds.width, placement.bounds.height) * 0.12 * magnitude;
      operations.push(
        Object.freeze({
          kind: "lossy-payload" as const,
          operationId,
          nodeId: node.nodeId,
          operation: lossyStream.pick(lossyKinds),
          magnitude,
          offsetX: quantize((lossyStream.nextUnit() - 0.5) * 2 * drift),
          offsetY: quantize((lossyStream.nextUnit() - 0.5) * 2 * drift),
        }),
      );
      corruptionSites.push(
        Object.freeze({
          operationId,
          kind: "lossy-payload" as const,
          nodeIds: Object.freeze([node.nodeId]),
          clauseIndex: node.clauseIndex,
          reversible: false,
        }),
      );
    }
  }

  const plan: CorruptionPlan = Object.freeze({
    version: CORRUPTION_VERSION,
    band,
    level,
    mode,
    operations: Object.freeze(operations),
    inverseOperations: Object.freeze(inverseOperations),
    corruptionSites: Object.freeze(corruptionSites),
    occlusionSites: Object.freeze(occlusionSites),
    effectiveReadingOrder: Object.freeze(effectiveReadingOrder),
    visuallyLossy: operations.some((operation) => operation.kind === "lossy-payload"),
  });

  if (mode === "exact") assertExactModePolicy(plan);
  return plan;
}

/**
 * Exact mode permits only invertible operations or non-destructive masking
 * (spec §7.3). This is the gate that makes the exact-mode promise true.
 */
export function assertExactModePolicy(plan: CorruptionPlan): void {
  const violations = plan.operations.filter((operation) => operation.kind === "lossy-payload");
  if (violations.length > 0) {
    throw new PlateError(
      "EXACT_MODE_VIOLATION",
      `Exact mode cannot carry ${violations.length} destructive operation(s). ` +
        `Use stylized mode, or lower the corruption level.`,
      { operationIds: violations.map((operation) => operation.operationId) },
    );
  }

  const irreversible = plan.corruptionSites.filter((site) => !site.reversible);
  if (irreversible.length > 0) {
    throw new PlateError(
      "EXACT_MODE_VIOLATION",
      `Exact mode recorded ${irreversible.length} irreversible corruption site(s).`,
      { operationIds: irreversible.map((site) => site.operationId) },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decoys
// ─────────────────────────────────────────────────────────────────────────────

export type PlanDecoysInput = Readonly<{
  layout: LayoutPlan;
  density: number;
  level: number;
  /** Non-semantic geometry the decoy planner may borrow. */
  decoyGeometryIds: readonly GlyphGeometryId[];
  /** Ink bounds for each borrowable geometry, in its own viewBox space. */
  inkBoundsFor: (id: GlyphGeometryId) => Rect;
  rng: DeterministicStream;
}>;

/**
 * Place non-semantic marks in free field.
 *
 * Decoys resemble payload but carry none. They keep clear of payload bounds and
 * of the layout's protected negative space, so a denser field never destroys the
 * composition's hierarchy (spec §8.2).
 */
export function planDecoys(input: PlanDecoysInput): readonly DecoyNode[] {
  const { layout, density, level, decoyGeometryIds, inkBoundsFor, rng } = input;
  const profile = densityProfile(density);
  if (decoyGeometryIds.length === 0 || profile.decoyOccupancy <= 0) return Object.freeze([]);

  const area = layout.safeArea;
  const unit = Math.min(area.width, area.height);
  const cell = unit * 0.09;
  const capacity = Math.max(0, Math.floor((area.width * area.height) / (cell * cell * 2)));
  const wanted = Math.min(360, Math.round(capacity * profile.decoyOccupancy));
  if (wanted === 0) return Object.freeze([]);

  const blocked: Rect[] = [
    ...layout.placements.map((placement) => inflate(placement.bounds, unit * 0.012)),
    ...layout.protectedRegions,
  ];

  const decoys: DecoyNode[] = [];
  // Bounded rejection sampling: a fixed attempt budget means a crowded plate
  // simply yields fewer decoys instead of looping.
  const attempts = wanted * 12;
  for (let attempt = 0; attempt < attempts && decoys.length < wanted; attempt += 1) {
    const size = cell * (0.45 + rng.nextUnit() * 0.85);
    const x = area.x + rng.nextUnit() * Math.max(0, area.width - size);
    const y = area.y + rng.nextUnit() * Math.max(0, area.height - size);
    const bounds: Rect = Object.freeze({
      x: quantize(x),
      y: quantize(y),
      width: quantize(size),
      height: quantize(size),
    });

    if (blocked.some((region) => rectsOverlap(bounds, region))) continue;
    if (decoys.some((existing) => rectsOverlap(bounds, existing.bounds))) continue;

    const geometryId = rng.pick(decoyGeometryIds);
    const ink = inkBoundsFor(geometryId);
    const longest = Math.max(ink.width, ink.height, 1e-6);
    const scale = quantize(size / longest, 6);

    decoys.push(
      Object.freeze({
        decoyId: ordinalId("decoy", decoys.length + 1),
        geometryId,
        scale,
        rotation: quantize(rng.nextInt(8) * 45, 6),
        x: quantize(bounds.x - ink.x * scale),
        y: quantize(bounds.y - ink.y * scale),
        bounds,
        layer: rng.nextBool(0.25 + level * 0.35) ? ("front" as const) : ("behind" as const),
        weight: quantize(0.14 + rng.nextUnit() * (0.2 + level * 0.35), 4),
      }),
    );
  }

  return Object.freeze(decoys);
}

// ─────────────────────────────────────────────────────────────────────────────
// Atmosphere
// ─────────────────────────────────────────────────────────────────────────────

export type PlanAtmosphereInput = Readonly<{
  layout: LayoutPlan;
  density: number;
  level: number;
  rng: DeterministicStream;
}>;

/**
 * Surface atmosphere.
 *
 * Atmosphere is the outermost non-payload layer. Removing it must not alter
 * payload geometry, which verification Gate 7 checks by rendering with the layer
 * disabled and comparing canonical path hashes.
 */
export function planAtmosphere(input: PlanAtmosphereInput): AtmospherePlan {
  const { layout, density, level, rng } = input;
  const profile = densityProfile(density);
  const unit = Math.min(layout.bounds.width, layout.bounds.height);
  const count = Math.round(profile.atmosphericCoverage * (40 + level * 160));

  const marks = interferenceShapes(
    layout.bounds,
    count,
    rng.fork("atmosphere-marks"),
    0.1 + profile.atmosphericCoverage * 0.3,
  );

  const drift = unit * 0.004 * level;
  return Object.freeze({
    coverage: profile.atmosphericCoverage,
    marks,
    registrationOffsetX: quantize((rng.nextUnit() - 0.5) * 2 * drift),
    registrationOffsetY: quantize((rng.nextUnit() - 0.5) * 2 * drift),
  });
}

function inflate(rect: Rect, amount: number): Rect {
  return Object.freeze({
    x: rect.x - amount,
    y: rect.y - amount,
    width: rect.width + amount * 2,
    height: rect.height + amount * 2,
  });
}

export { rectPath };

/**
 * V1 layout solvers (spec §8.1).
 *
 * Two of the seven canon families are implemented in this build: Concentric
 * Rings (the Phase 4 requirement and the golden fixture's layout) and Clause
 * Columns. The remaining five are declared in the canon but have no solver yet
 * and fail loudly rather than silently substituting another family.
 */

import {
  densityProfile,
  diagnostic,
  insetRect,
  point,
  quantize,
  rectCenter,
  type Diagnostic,
  type LayoutFamilyId,
  type NodeId,
  type Point,
  type Rect,
} from "@studio137/plate-core";

import { enforceSafety, minimumSafeScale, placeGlyph } from "./placement.js";
import {
  LAYOUT_VERSION,
  type GlyphEnvelope,
  type LayoutInput,
  type LayoutPlan,
  type LayoutSolver,
  type PlacedGlyph,
} from "./types.js";

const TAU = Math.PI * 2;

/** Fraction of placements permitted to overlap, by density. */
export function collisionLimitFor(density: number): number {
  return 0.05 + density * 0.35;
}

const collisionLimit = collisionLimitFor;

function envelopeMap(nodes: readonly GlyphEnvelope[]): ReadonlyMap<string, GlyphEnvelope> {
  return new Map(nodes.map((node) => [node.nodeId, node]));
}

function groupByClause(
  nodes: readonly GlyphEnvelope[],
): readonly (readonly GlyphEnvelope[])[] {
  const clauses = new Map<number, GlyphEnvelope[]>();
  for (const node of nodes) {
    const bucket = clauses.get(node.clauseIndex);
    if (bucket === undefined) clauses.set(node.clauseIndex, [node]);
    else bucket.push(node);
  }
  return Object.freeze(
    [...clauses.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, bucket]) =>
        Object.freeze([...bucket].sort((a, b) => a.tokenIndex - b.tokenIndex)),
      ),
  );
}

/**
 * Angle of each substrate anchor about the field centre.
 *
 * This is how a ring layout genuinely couples to its substrate: the Alpha
 * Radial Lattice returns points on the 137-division lattice, and the ring
 * borrows their angles rather than dividing the circle on its own.
 */
function substrateAngles(input: LayoutInput, count: number, centre: Point): readonly number[] {
  const anchors = input.substrate.anchors(count);
  if (anchors.length < count) {
    return Object.freeze(Array.from({ length: count }, (_unused, index) => (TAU * index) / count));
  }
  return Object.freeze(
    anchors.slice(0, count).map((anchor) => Math.atan2(anchor.y - centre.y, anchor.x - centre.x)),
  );
}

function emptyPlan(id: LayoutFamilyId, input: LayoutInput, safeArea: Rect): LayoutPlan {
  return Object.freeze({
    layoutId: id,
    version: LAYOUT_VERSION,
    bounds: input.bounds,
    safeArea,
    placements: Object.freeze([]),
    protectedRegions: Object.freeze([]),
    readingOrder: Object.freeze([]),
    minimumStrokePt: 0,
    diagnostics: Object.freeze([
      diagnostic("warning", "EMPTY_LAYOUT", "The phrase produced no renderable nodes."),
    ]),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Concentric Rings
// ─────────────────────────────────────────────────────────────────────────────

class ConcentricRingsSolver implements LayoutSolver {
  public readonly id: LayoutFamilyId = "concentric-rings";
  public readonly version = LAYOUT_VERSION;
  public readonly description =
    "Primary semantic clause occupies central rings; later clauses occupy secondary rings.";

  public solve(input: LayoutInput): LayoutPlan {
    const profile = densityProfile(input.density);
    const safeArea = insetRect(input.bounds, Math.min(input.bounds.width, input.bounds.height) * 0.06);
    const clauses = groupByClause(input.nodes);
    if (clauses.length === 0) return emptyPlan(this.id, input, safeArea);

    const centre = rectCenter(safeArea);
    const maxRadius = Math.min(safeArea.width, safeArea.height) / 2;
    const innerRadius = maxRadius * 0.26;
    const outerRadius = maxRadius * 0.88;
    // The centre of a ring composition is load-bearing negative space; glyphs
    // must not encroach on it.
    const voidRadius = innerRadius * 0.72;

    const placements: PlacedGlyph[] = [];
    const readingOrder: NodeId[] = [];
    const diagnostics: Diagnostic[] = [];
    let readingIndex = 0;

    // Ring gap sets the ceiling on glyph size; clause spacing widens it.
    const ringSpan = outerRadius - innerRadius;
    const ringGap =
      clauses.length === 1 ? ringSpan : (ringSpan / (clauses.length - 1)) * (1 - profile.clauseSpacing * 0.5);

    clauses.forEach((clause, clauseIndex) => {
      const radius =
        clauses.length === 1
          ? (innerRadius + outerRadius) / 2
          : innerRadius + (ringSpan * clauseIndex) / (clauses.length - 1);

      const angles = substrateAngles(input, clause.length, centre);
      // Two independent bounds on glyph size: the arc between neighbouring
      // anchors, and the radial room available at this ring.
      const arcCell = (TAU * radius) / Math.max(clause.length, 1);
      // A lone ring is bounded by the field edge and the protected centre, not
      // by a neighbouring ring that does not exist.
      const radialCell =
        clauses.length === 1
          ? 2 * Math.min(maxRadius - radius, radius - voidRadius)
          : ringGap;
      const cell = Math.min(arcCell, radialCell);
      const baseSize = cell * (1 - profile.payloadSpacing);

      clause.forEach((envelope, index) => {
        const angle = angles[index]!;
        const position = point(
          centre.x + Math.cos(angle) * radius,
          centre.y + Math.sin(angle) * radius,
        );
        // Glyphs read around the ring: rotate to the ring tangent, then a
        // quarter turn so the glyph's own left-to-right axis follows it.
        const rotation = (angle * 180) / Math.PI + 90;

        const targetSize = baseSize * sizeFactor(envelope);
        const floor = minimumSafeScale(envelope, input.output) *
          Math.max(envelope.inkBounds.width, envelope.inkBounds.height);
        const placement = placeGlyph(
          envelope,
          position,
          Math.max(targetSize, floor),
          rotation,
          readingIndex,
        );
        readingIndex += 1;
        placements.push(placement);
        readingOrder.push(envelope.nodeId);
      });
    });

    const protectedRegions: Rect[] = [
      Object.freeze({
        x: quantize(centre.x - voidRadius),
        y: quantize(centre.y - voidRadius),
        width: quantize(voidRadius * 2),
        height: quantize(voidRadius * 2),
      }),
    ];

    const safety = enforceSafety(
      placements,
      envelopeMap(input.nodes),
      safeArea,
      input.output,
      collisionLimit(input.density),
    );
    diagnostics.push(...safety.diagnostics);

    return Object.freeze({
      layoutId: this.id,
      version: this.version,
      bounds: input.bounds,
      safeArea,
      placements: Object.freeze(placements),
      protectedRegions: Object.freeze(protectedRegions),
      readingOrder: Object.freeze(readingOrder),
      minimumStrokePt: safety.minimumStrokePt,
      diagnostics: Object.freeze(diagnostics),
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Clause Columns
// ─────────────────────────────────────────────────────────────────────────────

class ClauseColumnsSolver implements LayoutSolver {
  public readonly id: LayoutFamilyId = "clause-columns";
  public readonly version = LAYOUT_VERSION;
  public readonly description =
    "Vertical processional clauses, suited to garment backs, scrolls, and banners.";

  public solve(input: LayoutInput): LayoutPlan {
    const profile = densityProfile(input.density);
    const safeArea = insetRect(input.bounds, Math.min(input.bounds.width, input.bounds.height) * 0.08);
    const clauses = groupByClause(input.nodes);
    if (clauses.length === 0) return emptyPlan(this.id, input, safeArea);

    const placements: PlacedGlyph[] = [];
    const readingOrder: NodeId[] = [];
    const diagnostics: Diagnostic[] = [];
    let readingIndex = 0;

    const columnWidth = safeArea.width / clauses.length;
    const longestClause = Math.max(...clauses.map((clause) => clause.length));

    clauses.forEach((clause, clauseIndex) => {
      // Columns read right to left, so the first clause sits on the right edge
      // and the eye travels inward — the processional direction of the family.
      const columnCentreX =
        safeArea.x + safeArea.width - columnWidth * (clauseIndex + 0.5);
      const rowHeight = safeArea.height / longestClause;
      const cell = Math.min(columnWidth * (1 - profile.clauseSpacing * 0.5), rowHeight);
      const baseSize = cell * (1 - profile.payloadSpacing);
      // Short clauses are centred vertically rather than hanging from the top.
      const usedHeight = rowHeight * clause.length;
      const top = safeArea.y + (safeArea.height - usedHeight) / 2;

      clause.forEach((envelope, index) => {
        const position = point(columnCentreX, top + rowHeight * (index + 0.5));
        const targetSize = baseSize * sizeFactor(envelope);
        const floor = minimumSafeScale(envelope, input.output) *
          Math.max(envelope.inkBounds.width, envelope.inkBounds.height);
        const placement = placeGlyph(
          envelope,
          position,
          Math.max(targetSize, floor),
          0,
          readingIndex,
        );
        readingIndex += 1;
        placements.push(placement);
        readingOrder.push(envelope.nodeId);
      });
    });

    // The gutters between columns must stay open for the clauses to read apart.
    const protectedRegions: Rect[] = [];
    for (let index = 1; index < clauses.length; index += 1) {
      const gutter = columnWidth * profile.clauseSpacing * 0.5;
      protectedRegions.push(
        Object.freeze({
          x: quantize(safeArea.x + safeArea.width - columnWidth * index - gutter / 2),
          y: quantize(safeArea.y),
          width: quantize(Math.max(gutter, 1)),
          height: quantize(safeArea.height),
        }),
      );
    }

    const safety = enforceSafety(
      placements,
      envelopeMap(input.nodes),
      safeArea,
      input.output,
      collisionLimit(input.density),
    );
    diagnostics.push(...safety.diagnostics);

    return Object.freeze({
      layoutId: this.id,
      version: this.version,
      bounds: input.bounds,
      safeArea,
      placements: Object.freeze(placements),
      protectedRegions: Object.freeze(protectedRegions),
      readingOrder: Object.freeze(readingOrder),
      minimumStrokePt: safety.minimumStrokePt,
      diagnostics: Object.freeze(diagnostics),
    });
  }
}

/**
 * Relative size by node kind.
 *
 * Separators and literal escapes sit below root concepts in the visual
 * hierarchy — a cartouche that outweighs a root would misrepresent the reading.
 */
function sizeFactor(envelope: GlyphEnvelope): number {
  switch (envelope.kind) {
    case "glyph":
      return envelope.clauseAnchor ? 1 : 0.9;
    case "separator":
      return 0.55 * envelope.advance;
    case "literal-escape":
      // Cartouches grow slowly with payload length, capped so a long escape
      // cannot dominate the plate.
      return Math.min(0.95, 0.6 + (envelope.codePointCount ?? 1) * 0.02);
    default:
      return 0.8;
  }
}

export const LAYOUT_SOLVERS: readonly LayoutSolver[] = Object.freeze([
  new ConcentricRingsSolver(),
  new ClauseColumnsSolver(),
]);

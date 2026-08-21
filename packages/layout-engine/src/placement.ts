/**
 * Placement math and print-safety enforcement shared by every solver.
 *
 * Spec §6.2: if a requested density cannot fit the phrase at the selected
 * output size, the compiler must return a diagnostic rather than shrinking
 * glyphs below production safety. That rule is implemented here, once, so no
 * individual solver can quietly opt out of it.
 */

import {
  boundsOf,
  diagnostic,
  MATRIX_PRECISION,
  point,
  PlateError,
  quantize,
  rectsOverlap,
  type Diagnostic,
  type Point,
  type Rect,
  type ResolvedOutput,
} from "@studio137/plate-core";

import type { GlyphEnvelope, PlacedGlyph, PlacedModifier } from "./types.js";

/** Points per inch in the SVG/PDF coordinate convention. */
const POINTS_PER_INCH = 72;

export function strokePoints(
  strokeViewBoxUnits: number,
  scale: number,
  output: ResolvedOutput,
): number {
  // Plate space is pixels at the output DPI, so one point is dpi/72 units.
  return (strokeViewBoxUnits * scale * POINTS_PER_INCH) / output.dpi;
}

/** Scale at which a glyph's narrowest stroke exactly meets its print minimum. */
export function minimumSafeScale(envelope: GlyphEnvelope, output: ResolvedOutput): number {
  if (envelope.minStrokeViewBoxUnits <= 0) return 0;
  return (
    (envelope.minimumPrintStrokePt * output.dpi) /
    (POINTS_PER_INCH * envelope.minStrokeViewBoxUnits)
  );
}

function rotatePoint(p: Point, cosine: number, sine: number): Point {
  return point(p.x * cosine - p.y * sine, p.x * sine + p.y * cosine);
}

/**
 * Place one glyph so that its ink centre lands on `centre`, sized so its longest
 * ink dimension is `targetSize`.
 *
 * The emitted transform is canonical: `translate(x y) rotate(r) scale(s)`,
 * applied in that order. Every solver produces the same form so the serialized
 * matrix is stable (spec §14.1).
 */
export function placeGlyph(
  envelope: GlyphEnvelope,
  centre: Point,
  targetSize: number,
  rotationDegrees: number,
  readingIndex: number,
): PlacedGlyph {
  const longestInk = Math.max(envelope.inkBounds.width, envelope.inkBounds.height);
  if (longestInk <= 0) {
    throw new PlateError("GEOMETRY_INTEGRITY", `Glyph ${envelope.geometryId} has empty ink`, {
      geometryId: envelope.geometryId,
    });
  }

  const scale = quantize(targetSize / longestInk, MATRIX_PRECISION);
  const rotation = quantize(rotationDegrees, MATRIX_PRECISION);
  const radians = (rotation * Math.PI) / 180;
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);

  const inkCentre = point(
    envelope.inkBounds.x + envelope.inkBounds.width / 2,
    envelope.inkBounds.y + envelope.inkBounds.height / 2,
  );
  const rotatedCentre = rotatePoint(point(inkCentre.x * scale, inkCentre.y * scale), cosine, sine);
  const x = quantize(centre.x - rotatedCentre.x);
  const y = quantize(centre.y - rotatedCentre.y);

  const bounds = transformedBounds(envelope.inkBounds, scale, cosine, sine, x, y);

  const modifiers = envelope.modifiers.map((modifier): PlacedModifier => {
    const slot = envelope.anchors.modifierSlots[
      modifier.slotIndex % Math.max(1, envelope.anchors.modifierSlots.length)
    ] ?? inkCentre;

    const modifierLongest = Math.max(modifier.inkBounds.width, modifier.inkBounds.height);
    const modifierScale = quantize(
      (targetSize * modifier.scale) / Math.max(modifierLongest, 1e-6),
      MATRIX_PRECISION,
    );
    const modifierInkCentre = point(
      modifier.inkBounds.x + modifier.inkBounds.width / 2,
      modifier.inkBounds.y + modifier.inkBounds.height / 2,
    );

    // The slot is expressed in the host's viewBox, so it rides the host's own
    // scale and rotation. A modifier therefore stays attached under any layout.
    const slotInPlate = rotatePoint(point(slot.x * scale, slot.y * scale), cosine, sine);
    const slotCentre = point(x + slotInPlate.x, y + slotInPlate.y);
    const rotatedModifierCentre = rotatePoint(
      point(modifierInkCentre.x * modifierScale, modifierInkCentre.y * modifierScale),
      cosine,
      sine,
    );

    const mx = quantize(slotCentre.x - rotatedModifierCentre.x);
    const my = quantize(slotCentre.y - rotatedModifierCentre.y);

    return Object.freeze({
      modifierId: modifier.modifierId,
      geometryId: modifier.geometryId,
      scale: modifierScale,
      rotation,
      x: mx,
      y: my,
      bounds: transformedBounds(modifier.inkBounds, modifierScale, cosine, sine, mx, my),
    });
  });

  return Object.freeze({
    nodeId: envelope.nodeId,
    kind: envelope.kind,
    clauseIndex: envelope.clauseIndex,
    geometryId: envelope.geometryId,
    scale,
    rotation,
    x,
    y,
    bounds,
    centre: point(quantize(centre.x), quantize(centre.y)),
    readingIndex,
    modifiers: Object.freeze(modifiers),
  });
}

function transformedBounds(
  ink: Rect,
  scale: number,
  cosine: number,
  sine: number,
  tx: number,
  ty: number,
): Rect {
  const corners: Point[] = [
    point(ink.x, ink.y),
    point(ink.x + ink.width, ink.y),
    point(ink.x + ink.width, ink.y + ink.height),
    point(ink.x, ink.y + ink.height),
  ].map((corner) => {
    const scaled = point(corner.x * scale, corner.y * scale);
    const rotated = rotatePoint(scaled, cosine, sine);
    return point(quantize(rotated.x + tx), quantize(rotated.y + ty));
  });
  return boundsOf(corners);
}

export type SafetyReport = Readonly<{
  minimumStrokePt: number;
  collisions: number;
  outsideSafeArea: number;
  diagnostics: readonly Diagnostic[];
}>;

/**
 * Enforce the print-safety rules from spec §6.2 across a finished placement set.
 *
 * `collisionLimit` is expressed as a fraction of placements: dense bands accept
 * more overlap because the field is meant to be layered, but the payload must
 * never become unresolvable.
 */
export function enforceSafety(
  placements: readonly PlacedGlyph[],
  envelopes: ReadonlyMap<string, GlyphEnvelope>,
  safeArea: Rect,
  output: ResolvedOutput,
  collisionLimit: number,
): SafetyReport {
  const diagnostics: Diagnostic[] = [];
  let minimumStrokePt = Number.POSITIVE_INFINITY;
  const undersized: string[] = [];

  for (const placement of placements) {
    const envelope = envelopes.get(placement.nodeId);
    if (envelope === undefined) continue;
    const points = strokePoints(envelope.minStrokeViewBoxUnits, placement.scale, output);
    minimumStrokePt = Math.min(minimumStrokePt, points);
    if (points < envelope.minimumPrintStrokePt) {
      undersized.push(
        `${placement.nodeId} (${points.toFixed(3)}pt < ${envelope.minimumPrintStrokePt}pt)`,
      );
    }
    for (const modifier of placement.modifiers) {
      const modifierEnvelope = envelope.modifiers.find(
        (candidate) => candidate.modifierId === modifier.modifierId,
      );
      if (modifierEnvelope === undefined) continue;
      const modifierPoints = strokePoints(
        envelope.minStrokeViewBoxUnits,
        modifier.scale,
        output,
      );
      minimumStrokePt = Math.min(minimumStrokePt, modifierPoints);
      if (modifierPoints < envelope.minimumPrintStrokePt) {
        undersized.push(
          `${placement.nodeId}/${modifier.modifierId} ` +
            `(${modifierPoints.toFixed(3)}pt < ${envelope.minimumPrintStrokePt}pt)`,
        );
      }
    }
  }

  if (undersized.length > 0) {
    throw new PlateError(
      "PRINT_SAFETY",
      `${undersized.length} glyph${undersized.length === 1 ? "" : "s"} would print below the ` +
        `minimum safe stroke at this size and density. Reduce density, enlarge the output, ` +
        `or shorten the phrase. Offending: ${undersized.slice(0, 6).join("; ")}` +
        (undersized.length > 6 ? ` (+${undersized.length - 6} more)` : ""),
      { undersized },
    );
  }

  let collisions = 0;
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      if (rectsOverlap(placements[i]!.bounds, placements[j]!.bounds)) collisions += 1;
    }
  }

  const allowed = Math.floor(placements.length * collisionLimit);
  if (collisions > allowed) {
    throw new PlateError(
      "DENSITY_INFEASIBLE",
      `Layout produced ${collisions} payload collisions, above the ${allowed} permitted at this ` +
        `density. The phrase does not fit the selected layout at this output size.`,
      { collisions, allowed, placements: placements.length },
    );
  }
  if (collisions > 0) {
    diagnostics.push(
      diagnostic(
        "info",
        "PAYLOAD_OVERLAP",
        `${collisions} payload envelope overlap${collisions === 1 ? "" : "s"} within the ` +
          `permitted budget of ${allowed}.`,
      ),
    );
  }

  let outsideSafeArea = 0;
  for (const placement of placements) {
    const b = placement.bounds;
    if (
      b.x < safeArea.x ||
      b.y < safeArea.y ||
      b.x + b.width > safeArea.x + safeArea.width ||
      b.y + b.height > safeArea.y + safeArea.height
    ) {
      outsideSafeArea += 1;
    }
  }
  if (outsideSafeArea > 0) {
    diagnostics.push(
      diagnostic(
        "warning",
        "OUTSIDE_SAFE_AREA",
        `${outsideSafeArea} placement${outsideSafeArea === 1 ? "" : "s"} extend beyond the safe ` +
          `area and may be trimmed in production.`,
      ),
    );
  }

  return Object.freeze({
    minimumStrokePt: quantize(
      Number.isFinite(minimumStrokePt) ? minimumStrokePt : 0,
      MATRIX_PRECISION,
    ),
    collisions,
    outsideSafeArea,
    diagnostics: Object.freeze(diagnostics),
  });
}

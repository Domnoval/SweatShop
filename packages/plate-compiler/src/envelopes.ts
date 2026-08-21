/**
 * Canonical AST → layout envelopes.
 *
 * This is the boundary spec §8.2 describes: a solver "receives only glyph
 * envelopes, anchors, and immutable geometry references. It cannot edit path
 * commands." The translation happens here, and path data simply does not cross.
 */

import { PlateError, type Rect } from "@studio137/plate-core";
import type { ExtendedGrammarRegistry, GeometryRegistry } from "@studio137/glyph-registry";
import type { CanonicalPlateAST } from "@studio137/glyph-engine";
import { renderableNodes } from "@studio137/glyph-engine";
import type { GlyphEnvelope, ModifierEnvelope } from "@studio137/layout-engine";

/**
 * Narrowest stroke in a glyph, in its own viewBox units.
 *
 * A record made only of fills has no stroke to measure, so its thinnest
 * feature is approximated from its ink box. That keeps such glyphs inside the
 * same print-safety check rather than exempting them from it.
 */
function narrowestStroke(
  paths: readonly Readonly<{ role: "stroke" | "fill"; strokeWidth: number }>[],
  ink: Rect,
): number {
  const strokes = paths.filter((path) => path.role === "stroke").map((path) => path.strokeWidth);
  if (strokes.length > 0) return Math.min(...strokes);
  return Math.min(ink.width, ink.height) * 0.2;
}

export function buildEnvelopes(
  ast: CanonicalPlateAST,
  grammar: ExtendedGrammarRegistry,
  geometry: GeometryRegistry,
): readonly GlyphEnvelope[] {
  return Object.freeze(
    renderableNodes(ast).map((node): GlyphEnvelope => {
      const record = geometry.get(node.geometryId);
      const ink = geometry.inkBounds(node.geometryId);

      if (record.version !== node.geometryVersion) {
        throw new PlateError(
          "UNSUPPORTED_VERSION",
          `Node ${node.nodeId} pins ${node.geometryVersion} but the registry provides ` +
            `${record.version}. A released geometry version is immutable.`,
          { nodeId: node.nodeId, pinned: node.geometryVersion, available: record.version },
        );
      }

      const modifiers: ModifierEnvelope[] =
        node.kind === "glyph"
          ? node.modifierIds.map((modifierId) => {
              const modifierRecord = grammar.modifier(modifierId);
              const markRecord = geometry.get(modifierRecord.geometryId);
              const markInk = geometry.inkBounds(modifierRecord.geometryId);
              return Object.freeze({
                modifierId,
                geometryId: modifierRecord.geometryId,
                viewBox: markRecord.viewBox,
                inkBounds: markInk,
                slotIndex: modifierRecord.slotIndex,
                scale: modifierRecord.scale,
                // Measured from the mark's own paths. A modifier drawn at
                // stroke 5 in a 40-unit box is far finer, relative to the plate,
                // than its host drawn at stroke 8 in a 100-unit box.
                minStrokeViewBoxUnits: narrowestStroke(markRecord.paths, markInk),
                minimumPrintStrokePt: markRecord.minimumPrintStrokePt,
              });
            })
          : [];

      const advance =
        node.kind === "separator" ? grammar.separator(node.separatorId).advance : 1;

      return Object.freeze({
        nodeId: node.nodeId,
        kind: node.kind,
        clauseIndex: node.clauseIndex,
        tokenIndex: node.tokenIndex,
        geometryId: node.geometryId,
        viewBox: record.viewBox,
        inkBounds: ink,
        anchors: record.anchors,
        minStrokeViewBoxUnits: narrowestStroke(record.paths, ink),
        minimumPrintStrokePt: record.minimumPrintStrokePt,
        advance,
        modifiers: Object.freeze(modifiers),
        clauseAnchor: node.kind === "glyph" ? node.clauseAnchor : false,
        ...(node.kind === "literal-escape" ? { codePointCount: node.codePointCount } : {}),
      });
    }),
  );
}

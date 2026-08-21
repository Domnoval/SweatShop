/**
 * Decoded clause sheet (spec §16).
 *
 * Private by default, and generated from the AST plus the manifest data — never
 * by interpreting the rendered image.
 *
 * The collector-facing translation card is built by a *separate* function from a
 * *separate* set of fields. Spec §16.2 is explicit that it must not be produced
 * by hiding fields in the private sheet, because a hidden field is one
 * refactor away from an exposed one.
 */

import { densityBand } from "@studio137/plate-core";
import { grammarRegistry } from "@studio137/glyph-registry";
import { glyphNodes, isGlyphNode } from "@studio137/glyph-engine";

import type { CompiledPlate } from "./compile.js";

export type ClauseSheetClause = Readonly<{
  clauseIndex: number;
  kind: "clause" | "mirrored-sequence";
  reading: string;
  roots: readonly Readonly<{ nodeId: string; family: string; gloss: string }>[];
  modifierStacks: readonly Readonly<{ nodeId: string; root: string; modifiers: readonly string[] }>[];
  separators: readonly Readonly<{ nodeId: string; separator: string; gloss: string }>[];
  literalEscapes: readonly Readonly<{ nodeId: string; codePointCount: number; text: string }>[];
  readingOrder: readonly string[];
}>;

export type ClauseSheet = Readonly<{
  plateId: string;
  versions: Readonly<Record<string, string>>;
  sourcePhrase: string;
  normalizedSemanticView: string;
  clauses: readonly ClauseSheetClause[];
  rootFamiliesUsed: readonly string[];
  mirroredStructures: readonly number[];
  corruptionRecords: readonly Readonly<{
    operationId: string;
    kind: string;
    nodeIds: readonly string[];
    reversible: boolean;
  }>[];
  occlusionRecords: readonly Readonly<{
    maskId: string;
    nodeId: string;
    coverage: number;
    requiredInverse: string;
  }>[];
  reversibility: Readonly<{
    mode: "exact" | "stylized";
    sourceRecoverable: true;
    visualDecodingGuaranteed: boolean;
    irreversibleSiteCount: number;
  }>;
  artifactHashes: Readonly<Record<string, string>>;
  seedFingerprint: string;
}>;

export function buildClauseSheet(
  plate: CompiledPlate,
  artifactHashes: Readonly<Record<string, string>> = {},
): ClauseSheet {
  const grammar = grammarRegistry();
  const textByNode = new Map<string, string[]>();
  for (const mapping of plate.tokenMappings) {
    if (mapping.nodeId === null) continue;
    const bucket = textByNode.get(mapping.nodeId);
    if (bucket === undefined) textByNode.set(mapping.nodeId, [mapping.sourceText]);
    else bucket.push(mapping.sourceText);
  }

  const clauses: ClauseSheetClause[] = plate.ast.clauses.map((clause, index) => {
    const summary = plate.analysis.clauses[index];
    return Object.freeze({
      clauseIndex: clause.clauseIndex,
      kind: clause.kind,
      reading: summary?.reading ?? "",
      roots: Object.freeze(
        clause.nodes.filter(isGlyphNode).map((node) =>
          Object.freeze({
            nodeId: node.nodeId,
            family: grammar.root(node.rootFamilyId).label,
            gloss: grammar.root(node.rootFamilyId).gloss,
          }),
        ),
      ),
      modifierStacks: Object.freeze(
        clause.nodes
          .filter(isGlyphNode)
          .filter((node) => node.modifierIds.length > 0)
          .map((node) =>
            Object.freeze({
              nodeId: node.nodeId,
              root: grammar.root(node.rootFamilyId).label,
              modifiers: Object.freeze(
                node.modifierIds.map((id) => grammar.modifier(id).label),
              ),
            }),
          ),
      ),
      separators: Object.freeze(
        clause.nodes
          .filter((node) => node.kind === "separator")
          .map((node) =>
            Object.freeze({
              nodeId: node.nodeId,
              separator: grammar.separator(node.separatorId).label,
              gloss: grammar.separator(node.separatorId).gloss,
            }),
          ),
      ),
      literalEscapes: Object.freeze(
        clause.nodes
          .filter((node) => node.kind === "literal-escape")
          .map((node) =>
            Object.freeze({
              nodeId: node.nodeId,
              codePointCount: node.codePointCount,
              // Recovered from the token mappings, which is the only place the
              // escape's text exists — it is never stored on the node itself.
              text: (textByNode.get(node.nodeId) ?? []).join(" "),
            }),
          ),
      ),
      readingOrder: clause.readingOrder,
    });
  });

  const corruption = plate.presentation.corruption;

  return Object.freeze({
    plateId: plate.plateId,
    versions: plate.versions as unknown as Readonly<Record<string, string>>,
    sourcePhrase: plate.source.originalText,
    normalizedSemanticView: plate.source.normalizedSemanticView,
    clauses: Object.freeze(clauses),
    rootFamiliesUsed: Object.freeze(
      [...new Set(glyphNodes(plate.ast).map((node) => grammar.root(node.rootFamilyId).label))].sort(),
    ),
    mirroredStructures: Object.freeze(
      plate.ast.clauses
        .filter((clause) => clause.kind === "mirrored-sequence")
        .map((clause) => clause.clauseIndex),
    ),
    corruptionRecords: Object.freeze(
      corruption.corruptionSites.map((site) =>
        Object.freeze({
          operationId: site.operationId,
          kind: site.kind,
          nodeIds: site.nodeIds,
          reversible: site.reversible,
        }),
      ),
    ),
    occlusionRecords: Object.freeze(
      corruption.occlusionSites.map((site) =>
        Object.freeze({
          maskId: site.maskId,
          nodeId: site.nodeId,
          coverage: site.coverage,
          requiredInverse: site.requiredInverse,
        }),
      ),
    ),
    reversibility: Object.freeze({
      mode: plate.request.mode,
      sourceRecoverable: true as const,
      visualDecodingGuaranteed: plate.request.mode === "exact",
      irreversibleSiteCount: corruption.corruptionSites.filter((site) => !site.reversible).length,
    }),
    artifactHashes: Object.freeze({ ...artifactHashes }),
    seedFingerprint: plate.rng.fingerprint,
  });
}

/** Render the private clause sheet as Markdown. Contains the source phrase. */
export function renderClauseSheetMarkdown(sheet: ClauseSheet): string {
  const lines: string[] = [];
  const push = (line = ""): void => void lines.push(line);

  push(`# Decoded clause sheet — plate ${sheet.plateId}`);
  push();
  push("> PRIVATE ARTIFACT. Contains the source phrase. Never bundle with public exports.");
  push();

  push("## 1. Plate identifier");
  push();
  push(`- Plate id: \`${sheet.plateId}\``);
  push(`- Seed fingerprint: \`${sheet.seedFingerprint}\``);
  push();

  push("## 2. Grammar and geometry versions");
  push();
  for (const [key, value] of Object.entries(sheet.versions).sort()) {
    push(`- ${key}: \`${value}\``);
  }
  push();

  push("## 3. Exact source phrase");
  push();
  push("```text");
  push(sheet.sourcePhrase);
  push("```");
  push();

  push("## 4. Normalized semantic view");
  push();
  push("```text");
  push(sheet.normalizedSemanticView);
  push("```");
  push();

  push("## 5. Clause segmentation");
  push();
  if (sheet.clauses.length === 0) push("_No clauses._");
  for (const clause of sheet.clauses) {
    push(`### Clause ${clause.clauseIndex} — ${clause.kind}`);
    push();
    push(`Reading: \`${clause.reading}\``);
    push();
    if (clause.roots.length > 0) {
      push("| Node | Root family | Gloss |");
      push("| --- | --- | --- |");
      for (const root of clause.roots) {
        push(`| \`${root.nodeId}\` | ${root.family} | ${root.gloss} |`);
      }
      push();
    }
    if (clause.modifierStacks.length > 0) {
      push("Modifier stacks:");
      push();
      for (const stack of clause.modifierStacks) {
        push(`- \`${stack.nodeId}\` ${stack.root} + ${stack.modifiers.join(", ")}`);
      }
      push();
    }
    if (clause.separators.length > 0) {
      push("Separators:");
      push();
      for (const separator of clause.separators) {
        push(`- \`${separator.nodeId}\` ${separator.separator} — ${separator.gloss}`);
      }
      push();
    }
    if (clause.literalEscapes.length > 0) {
      push("Literal escape payloads:");
      push();
      for (const escape of clause.literalEscapes) {
        push(`- \`${escape.nodeId}\` (${escape.codePointCount} code points): \`${escape.text}\``);
      }
      push();
    }
    push(`Reading order: ${clause.readingOrder.map((id) => `\`${id}\``).join(" → ") || "_empty_"}`);
    push();
  }

  push("## 6. Root families used");
  push();
  push(sheet.rootFamiliesUsed.length === 0 ? "_None._" : sheet.rootFamiliesUsed.join(", "));
  push();

  push("## 9. Mirrored structures");
  push();
  push(
    sheet.mirroredStructures.length === 0
      ? "_None._"
      : sheet.mirroredStructures.map((index) => `Clause ${index}`).join(", "),
  );
  push();

  push("## 11. Corruption and occlusion records");
  push();
  if (sheet.corruptionRecords.length === 0) push("_No corruption applied._");
  else {
    push("| Operation | Kind | Nodes | Reversible |");
    push("| --- | --- | --- | --- |");
    for (const record of sheet.corruptionRecords) {
      push(
        `| \`${record.operationId}\` | ${record.kind} | ${
          record.nodeIds.length === 0 ? "—" : record.nodeIds.join(", ")
        } | ${record.reversible ? "yes" : "**no**"} |`,
      );
    }
  }
  push();
  if (sheet.occlusionRecords.length > 0) {
    push("| Mask | Node | Coverage | Required inverse |");
    push("| --- | --- | --- | --- |");
    for (const record of sheet.occlusionRecords) {
      push(
        `| \`${record.maskId}\` | \`${record.nodeId}\` | ${(record.coverage * 100).toFixed(1)}% | ${record.requiredInverse} |`,
      );
    }
    push();
  }

  push("## 13. Reversibility status");
  push();
  push(`- Mode: **${sheet.reversibility.mode}**`);
  push(`- Source recoverable from manifest: **yes**`);
  push(
    `- Visual decoding guaranteed: **${sheet.reversibility.visualDecodingGuaranteed ? "yes" : "no"}**`,
  );
  push(`- Irreversible sites: ${sheet.reversibility.irreversibleSiteCount}`);
  if (!sheet.reversibility.visualDecodingGuaranteed) {
    push();
    push("```text");
    push("Visual decoding is not guaranteed.");
    push("The source remains recoverable from the private encoding manifest.");
    push("```");
  }
  push();

  push("## 14. Public artifact hashes");
  push();
  const hashes = Object.entries(sheet.artifactHashes).sort();
  if (hashes.length === 0) push("_Not yet exported._");
  else for (const [name, hash] of hashes) push(`- ${name}: \`${hash}\``);
  push();

  return `${lines.join("\n")}\n`;
}

export type TranslationCard = Readonly<{
  plateId: string;
  seedFingerprint: string;
  grammarVersion: string;
  geometryVersion: string;
  /** Root families present, without the phrase or the clause order. */
  rootFamiliesUsed: readonly Readonly<{ family: string; gloss: string }>[];
  clauseCount: number;
  glyphCount: number;
  mode: "exact" | "stylized";
  corruptionBand: string;
  densityBand: string;
}>;

/**
 * Collector-facing translation card.
 *
 * Built from its own field list, not by redacting the private sheet. It never
 * touches `sourcePhrase`, token mappings, reading order, or occlusion geometry.
 */
export function buildTranslationCard(plate: CompiledPlate): TranslationCard {
  const grammar = grammarRegistry();
  const families = [...new Set(glyphNodes(plate.ast).map((node) => node.rootFamilyId))].sort();

  return Object.freeze({
    plateId: plate.plateId,
    seedFingerprint: plate.rng.fingerprint,
    grammarVersion: plate.versions.grammarVersion,
    geometryVersion: plate.versions.geometryVersion,
    rootFamiliesUsed: Object.freeze(
      families.map((id) =>
        Object.freeze({ family: grammar.root(id).label, gloss: grammar.root(id).gloss }),
      ),
    ),
    clauseCount: plate.ast.clauses.length,
    glyphCount: glyphNodes(plate.ast).length,
    mode: plate.request.mode,
    corruptionBand: plate.presentation.corruption.band.label,
    densityBand: densityBand(plate.request.density).label,
  });
}

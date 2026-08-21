/**
 * Interface-facing parse preview (spec §4.3, §22.1).
 *
 * Everything the source panel displays is derived here from the AST and the
 * token mappings, so the panel never re-parses the phrase itself and can never
 * disagree with what was actually compiled.
 *
 * This structure is safe to render in the browser: it contains the artist's own
 * phrase, which they are already looking at, but it is not an export artifact
 * and must never be written into a public SVG or PNG.
 */

import type { Diagnostic, SourcePayload } from "@studio137/plate-core";
import type { ExtendedGrammarRegistry, ModifierId, RootFamilyId } from "@studio137/glyph-registry";

import { isGlyphNode, type CanonicalPlateAST, type TokenMapping } from "./ast.js";

export type ClauseSummary = Readonly<{
  clauseIndex: number;
  kind: "clause" | "mirrored-sequence";
  /** Human-readable reading, e.g. `SIGNAL · PERSISTENCE · BODY`. */
  reading: string;
  roots: readonly RootFamilyId[];
  separatorCount: number;
  literalEscapeCount: number;
  elidedCount: number;
}>;

export type ModifierAssignment = Readonly<{
  nodeId: string;
  root: RootFamilyId;
  modifiers: readonly ModifierId[];
  sourceWords: readonly string[];
}>;

export type PhraseAnalysis = Readonly<{
  codePointCount: number;
  normalizedInterpretation: string;
  clauses: readonly ClauseSummary[];
  roots: readonly RootFamilyId[];
  modifierAssignments: readonly ModifierAssignment[];
  unsupportedTokens: readonly string[];
  elidedTokens: readonly string[];
  glyphCount: number;
  /**
   * Exact mode guarantees byte-for-byte recovery of the source. Stylized mode
   * does not guarantee *visual* decoding, but the source still survives in the
   * private manifest (spec §2.2).
   */
  reversibility: "exact-guaranteed" | "manifest-only";
  diagnostics: readonly Diagnostic[];
}>;

export function analysePhrase(
  input: Readonly<{
    source: SourcePayload;
    ast: CanonicalPlateAST;
    tokenMappings: readonly TokenMapping[];
    diagnostics: readonly Diagnostic[];
    grammar: ExtendedGrammarRegistry;
    mode: "exact" | "stylized";
  }>,
): PhraseAnalysis {
  const { source, ast, tokenMappings, diagnostics, grammar, mode } = input;

  const sourceWordsByNode = new Map<string, string[]>();
  for (const mapping of tokenMappings) {
    const key = mapping.boundTo ?? mapping.nodeId;
    if (key === null) continue;
    const bucket = sourceWordsByNode.get(key);
    if (bucket === undefined) sourceWordsByNode.set(key, [mapping.sourceText]);
    else bucket.push(mapping.sourceText);
  }

  const clauses: ClauseSummary[] = ast.clauses.map((clause) => {
    const roots = clause.nodes.filter(isGlyphNode).map((node) => node.rootFamilyId);
    const reading = clause.nodes
      .map((node) => {
        if (node.kind === "glyph") {
          const record = grammar.root(node.rootFamilyId);
          const marks = node.modifierIds
            .map((id) => grammar.modifier(id).label)
            .sort()
            .join("+");
          return marks.length === 0 ? record.label : `${record.label}(${marks})`;
        }
        if (node.kind === "separator") return grammar.separator(node.separatorId).id === "clause-break" ? "‖" : "·";
        if (node.kind === "literal-escape") return `⟦${node.codePointCount}⟧`;
        return "";
      })
      .filter((part) => part.length > 0)
      .join(" ");

    return Object.freeze({
      clauseIndex: clause.clauseIndex,
      kind: clause.kind,
      reading,
      roots: Object.freeze(roots),
      separatorCount: clause.nodes.filter((node) => node.kind === "separator").length,
      literalEscapeCount: clause.nodes.filter((node) => node.kind === "literal-escape").length,
      elidedCount: clause.nodes.filter((node) => node.kind === "elided").length,
    });
  });

  const modifierAssignments: ModifierAssignment[] = ast.clauses
    .flatMap((clause) => clause.nodes)
    .filter(isGlyphNode)
    .filter((node) => node.modifierIds.length > 0)
    .map((node) =>
      Object.freeze({
        nodeId: node.nodeId,
        root: node.rootFamilyId,
        modifiers: node.modifierIds,
        sourceWords: Object.freeze(sourceWordsByNode.get(node.nodeId) ?? []),
      }),
    );

  return Object.freeze({
    codePointCount: source.codePoints.length,
    normalizedInterpretation: source.normalizedSemanticView,
    clauses: Object.freeze(clauses),
    roots: Object.freeze(clauses.flatMap((clause) => [...clause.roots])),
    modifierAssignments: Object.freeze(modifierAssignments),
    unsupportedTokens: Object.freeze(
      tokenMappings
        .filter((mapping) => mapping.classification === "unsupported")
        .map((mapping) => mapping.sourceText),
    ),
    elidedTokens: Object.freeze(
      tokenMappings
        .filter((mapping) => mapping.classification === "elided")
        .map((mapping) => mapping.sourceText),
    ),
    glyphCount: clauses.reduce((sum, clause) => sum + clause.roots.length, 0),
    reversibility: mode === "exact" ? "exact-guaranteed" : "manifest-only",
    diagnostics,
  });
}

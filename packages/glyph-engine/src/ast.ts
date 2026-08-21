/**
 * Canonical plate AST (spec §11.2).
 *
 * The AST is the compiler's immutable record of *what the phrase means*. It is
 * built once and never destructively modified: layout, corruption, decoys, and
 * atmosphere all live in the separate presentation plan (spec §11.3).
 *
 * Two privacy properties are structural rather than conventional:
 *
 *   - No node carries source text. A literal escape node knows only how many
 *     code points it is holding, which is all layout needs to size a cartouche.
 *   - `payloadRef` is an opaque ordinal. The mapping from ref to source token
 *     lives only in the encrypted private manifest, and public exports strip
 *     the refs entirely.
 */

import type {
  GlyphGeometryId,
  NodeId,
  PlateId,
  VersionContract,
} from "@studio137/plate-core";
import type {
  CorruptionEligibility,
  MirrorEligibility,
  ModifierId,
  RootFamilyId,
  SeparatorId,
} from "@studio137/glyph-registry";

export const CANONICAL_SCHEMA = "studio137.canonical-plate" as const;
export const CANONICAL_SCHEMA_VERSION = 1 as const;

export type CanonicalNodeKind = "glyph" | "separator" | "literal-escape" | "elided";

type NodeBase = Readonly<{
  nodeId: NodeId;
  clauseIndex: number;
  /** Position within the clause, in reading order. */
  tokenIndex: number;
  /** Opaque private-manifest reference. Stripped from every public export. */
  payloadRef: string;
}>;

export type CanonicalGlyphNode = NodeBase &
  Readonly<{
    kind: "glyph";
    /** Stable identity of the semantic unit, e.g. `root:signal|mod:intensify`. */
    semanticUnitId: string;
    rootFamilyId: RootFamilyId;
    modifierIds: readonly ModifierId[];
    geometryId: GlyphGeometryId;
    geometryVersion: string;
    mirrorEligibility: MirrorEligibility;
    corruptionEligibility: CorruptionEligibility;
    /**
     * The first root of a clause carries its reading. Anchors are protected
     * from destructive corruption so compositional hierarchy survives an Event
     * Field plate (spec §7.5).
     */
    clauseAnchor: boolean;
  }>;

export type CanonicalSeparatorNode = NodeBase &
  Readonly<{
    kind: "separator";
    separatorId: SeparatorId;
    geometryId: GlyphGeometryId;
    geometryVersion: string;
  }>;

export type CanonicalLiteralEscapeNode = NodeBase &
  Readonly<{
    kind: "literal-escape";
    geometryId: GlyphGeometryId;
    geometryVersion: string;
    /** Code points carried by this escape. The text itself is manifest-only. */
    codePointCount: number;
  }>;

/**
 * Grammatical glue with no glyph — articles, copulas, auxiliaries.
 *
 * Elided nodes are recorded rather than discarded (spec §4.1). They occupy no
 * space on the plate and emit no geometry, but they appear in the clause sheet
 * and in the manifest's token mappings, so the reading is fully accounted for.
 */
export type CanonicalElidedNode = NodeBase & Readonly<{ kind: "elided" }>;

export type CanonicalNode =
  | CanonicalGlyphNode
  | CanonicalSeparatorNode
  | CanonicalLiteralEscapeNode
  | CanonicalElidedNode;

export type CanonicalClauseNode = Readonly<{
  clauseIndex: number;
  kind: "clause" | "mirrored-sequence";
  nodes: readonly CanonicalNode[];
  /** Present only on a mirrored sequence: the node the two halves reflect across. */
  mirrorAxisNodeId?: NodeId;
  /** Node ids in authored reading order, before any corruption permutation. */
  readingOrder: readonly NodeId[];
}>;

export type CanonicalPlateAST = Readonly<{
  schema: typeof CANONICAL_SCHEMA;
  schemaVersion: typeof CANONICAL_SCHEMA_VERSION;
  plateId: PlateId;
  versions: VersionContract;
  /** SHA-256 over the source payload. Never emitted into a public artifact. */
  sourceDigest: string;
  clauses: readonly CanonicalClauseNode[];
}>;

/** How a source token was classified by the grammar. */
export type TokenClassification =
  | "root"
  | "modifier"
  | "relation"
  | "elided"
  | "unsupported"
  | "punctuation"
  | "space";

/**
 * Source-token ↔ node mapping. Lives only in the encrypted manifest, and is the
 * record that makes exact decoding and clause-sheet generation possible.
 */
export type TokenMapping = Readonly<{
  payloadRef: string;
  nodeId: NodeId | null;
  clauseIndex: number;
  tokenIndex: number;
  /** Substring of the normalized semantic view. */
  sourceText: string;
  sourceStart: number;
  sourceEnd: number;
  classification: TokenClassification;
  /** For modifiers: the glyph node the mark was bound to, if any. */
  boundTo?: NodeId;
}>;

export function isGlyphNode(node: CanonicalNode): node is CanonicalGlyphNode {
  return node.kind === "glyph";
}

export function isRenderableNode(
  node: CanonicalNode,
): node is CanonicalGlyphNode | CanonicalSeparatorNode | CanonicalLiteralEscapeNode {
  return node.kind !== "elided";
}

/** Every node in the plate, in authored reading order. */
export function allNodes(ast: CanonicalPlateAST): readonly CanonicalNode[] {
  return ast.clauses.flatMap((clause) => clause.nodes);
}

export function glyphNodes(ast: CanonicalPlateAST): readonly CanonicalGlyphNode[] {
  return allNodes(ast).filter(isGlyphNode);
}

/** Nodes that produce geometry, in authored reading order. */
export function renderableNodes(
  ast: CanonicalPlateAST,
): readonly (CanonicalGlyphNode | CanonicalSeparatorNode | CanonicalLiteralEscapeNode)[] {
  return allNodes(ast).filter(isRenderableNode);
}

export function findNode(ast: CanonicalPlateAST, nodeId: NodeId): CanonicalNode | undefined {
  return allNodes(ast).find((node) => node.nodeId === nodeId);
}

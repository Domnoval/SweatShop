/**
 * Semantic compiler: lexemes → semantic units → canonical AST (spec §11, §25).
 *
 * The compiler does not reduce the grammar to one glyph per character. A phrase
 * becomes clauses of root concepts carrying modifier stacks, joined by
 * separators, with anything the lexicon does not claim preserved as a literal
 * escape. Exact source preservation and semantic interpretation are parallel
 * systems: nothing here is load-bearing for reversibility, which rests on the
 * manifest's copy of the original UTF-8.
 */

import {
  diagnostic,
  LONG_CLAUSE_WARNING_CODE_POINTS,
  ordinalId,
  sha256Hex,
  type Diagnostic,
  type NodeId,
  type PlateId,
  type SourcePayload,
  type VersionContract,
} from "@studio137/plate-core";
import {
  type ExtendedGrammarRegistry,
  type GeometryRegistry,
  type ModifierId,
  type SeparatorRecord,
} from "@studio137/glyph-registry";

import {
  CANONICAL_SCHEMA,
  CANONICAL_SCHEMA_VERSION,
  type CanonicalClauseNode,
  type CanonicalNode,
  type CanonicalPlateAST,
  type TokenClassification,
  type TokenMapping,
} from "./ast.js";
import { lexPhrase, type Lexeme } from "./lexer.js";

export type CompiledSemantics = Readonly<{
  ast: CanonicalPlateAST;
  /** Manifest-only. Never reaches a public artifact. */
  tokenMappings: readonly TokenMapping[];
  diagnostics: readonly Diagnostic[];
}>;

type PendingModifier = Readonly<{ modifier: ModifierId; lexeme: Lexeme }>;

type DraftNode = {
  node: CanonicalNode;
  /** Source lexemes that produced this node, for the token mapping. */
  lexemes: Lexeme[];
  classification: TokenClassification;
};

/**
 * Stable identity for a semantic unit.
 *
 * Modifiers are sorted by their registry slot so that "not all" and "all not"
 * resolve to the same unit — modifier order is not meaningful in this grammar,
 * and an order-sensitive identity would make the AST depend on typing order.
 */
function semanticUnitId(root: string, modifiers: readonly ModifierId[]): string {
  const sorted = [...modifiers].sort();
  return sorted.length === 0 ? `root:${root}` : `root:${root}|mod:${sorted.join(",")}`;
}

export type CompileSemanticsInput = Readonly<{
  source: SourcePayload;
  plateId: PlateId;
  versions: VersionContract;
  grammar: ExtendedGrammarRegistry;
  geometry: GeometryRegistry;
}>;

export function compileSemantics(input: CompileSemanticsInput): CompiledSemantics {
  const { source, plateId, versions, grammar, geometry } = input;
  const lexemes = lexPhrase(source.normalizedSemanticView);
  const diagnostics: Diagnostic[] = [];

  // ── Pass 1: classify lexemes into draft nodes, grouped into clauses ──────
  const clauses: DraftNode[][] = [];
  let current: DraftNode[] = [];
  let clauseIndex = 0;
  let pendingModifiers: PendingModifier[] = [];
  let mirrorAxisIn: Map<number, number> = new Map();

  const lastGlyphIndex = (): number => {
    for (let i = current.length - 1; i >= 0; i -= 1) {
      if (current[i]!.node.kind === "glyph") return i;
    }
    return -1;
  };

  const closeClause = (): void => {
    // Modifiers left with no host bind to the clause's last glyph rather than
    // vanishing; if the clause has no glyph at all they are reported and their
    // token mapping records them as unbound.
    if (pendingModifiers.length > 0) {
      const hostIndex = lastGlyphIndex();
      if (hostIndex >= 0) {
        const draft = current[hostIndex]!;
        const host = draft.node;
        if (host.kind === "glyph") {
          const merged = [...host.modifierIds, ...pendingModifiers.map((p) => p.modifier)];
          draft.node = Object.freeze({
            ...host,
            modifierIds: Object.freeze(merged),
            semanticUnitId: semanticUnitId(host.rootFamilyId, merged),
          });
          draft.lexemes.push(...pendingModifiers.map((p) => p.lexeme));
          diagnostics.push(
            diagnostic(
              "warning",
              "TRAILING_MODIFIER_REBOUND",
              `Modifier${pendingModifiers.length > 1 ? "s" : ""} ${pendingModifiers
                .map((p) => `"${p.lexeme.text}"`)
                .join(", ")} had no following root and bound to the preceding root instead.`,
              { clauseIndex },
            ),
          );
        }
      } else {
        for (const pending of pendingModifiers) {
          diagnostics.push(
            diagnostic(
              "warning",
              "UNBOUND_MODIFIER",
              `Modifier "${pending.lexeme.text}" has no root to attach to and carries no glyph.`,
              { clauseIndex },
            ),
          );
          current.push({
            node: Object.freeze({
              kind: "elided" as const,
              nodeId: "",
              clauseIndex,
              tokenIndex: 0,
              payloadRef: "",
            }),
            lexemes: [pending.lexeme],
            classification: "modifier",
          });
        }
      }
      pendingModifiers = [];
    }

    if (current.length > 0) {
      clauses.push(current);
      current = [];
      clauseIndex += 1;
    }
  };

  const pushSeparator = (separator: SeparatorRecord, lexeme: Lexeme): void => {
    current.push({
      node: Object.freeze({
        kind: "separator" as const,
        nodeId: "",
        clauseIndex,
        tokenIndex: 0,
        payloadRef: "",
        separatorId: separator.id,
        geometryId: separator.geometryId,
        geometryVersion: geometry.version,
      }),
      lexemes: [lexeme],
      classification: "punctuation",
    });
  };

  const pushLiteralEscape = (lexeme: Lexeme): void => {
    const previous = current[current.length - 1];
    // Merge adjacent unsupported runs into one cartouche rather than framing
    // every unknown word separately.
    if (
      previous !== undefined &&
      previous.node.kind === "literal-escape" &&
      previous.lexemes[previous.lexemes.length - 1]!.end >= lexeme.start - 1
    ) {
      previous.lexemes.push(lexeme);
      previous.node = Object.freeze({
        ...previous.node,
        codePointCount: previous.lexemes.reduce(
          (sum, entry) => sum + (entry.end - entry.start),
          0,
        ),
      });
      return;
    }
    current.push({
      node: Object.freeze({
        kind: "literal-escape" as const,
        nodeId: "",
        clauseIndex,
        tokenIndex: 0,
        payloadRef: "",
        geometryId: grammar.literalEscapeGeometryId,
        geometryVersion: geometry.version,
        codePointCount: lexeme.end - lexeme.start,
      }),
      lexemes: [lexeme],
      classification: "unsupported",
    });
    diagnostics.push(
      diagnostic(
        "info",
        "LITERAL_ESCAPE",
        `"${lexeme.text}" is not in grammar ${grammar.version} and is carried as a literal escape.`,
        { clauseIndex },
      ),
    );
  };

  for (const lexeme of lexemes) {
    if (lexeme.kind === "space") {
      continue;
    }

    if (lexeme.kind === "punctuation") {
      const matched = grammar.matchPunctuationPrefix(lexeme.text);
      if (matched === undefined || matched.token !== lexeme.text) {
        pushLiteralEscape(lexeme);
        continue;
      }
      if (matched.separator.id === "clause-break") {
        pushSeparator(matched.separator, lexeme);
        closeClause();
        continue;
      }
      if (matched.separator.id === "mirror-axis") {
        pushSeparator(matched.separator, lexeme);
        mirrorAxisIn.set(clauseIndex, current.length - 1);
        continue;
      }
      pushSeparator(matched.separator, lexeme);
      continue;
    }

    const classification = grammar.classify(lexeme.text);
    switch (classification.kind) {
      case "modifier":
        pendingModifiers.push({ modifier: classification.modifier, lexeme });
        break;

      case "root": {
        const record = grammar.root(classification.entry.root);
        const modifiers = [
          ...classification.entry.modifiers,
          ...pendingModifiers.map((p) => p.modifier),
        ];
        // Duplicated modifiers say nothing extra; collapse while preserving order.
        const unique = modifiers.filter((id, index) => modifiers.indexOf(id) === index);
        const hostLexemes = [lexeme, ...pendingModifiers.map((p) => p.lexeme)];
        pendingModifiers = [];
        current.push({
          node: Object.freeze({
            kind: "glyph" as const,
            nodeId: "",
            clauseIndex,
            tokenIndex: 0,
            payloadRef: "",
            semanticUnitId: semanticUnitId(record.id, unique),
            rootFamilyId: record.id,
            modifierIds: Object.freeze(unique),
            geometryId: record.geometryId,
            geometryVersion: geometry.version,
            mirrorEligibility: record.mirrorEligibility,
            corruptionEligibility: record.corruptionEligibility,
            clauseAnchor: false,
          }),
          lexemes: hostLexemes,
          classification: "root",
        });
        break;
      }

      case "relation":
        pushSeparator(classification.separator, lexeme);
        break;

      case "elided":
        current.push({
          node: Object.freeze({
            kind: "elided" as const,
            nodeId: "",
            clauseIndex,
            tokenIndex: 0,
            payloadRef: "",
          }),
          lexemes: [lexeme],
          classification: "elided",
        });
        break;

      case "unsupported":
        pushLiteralEscape(lexeme);
        break;

      default: {
        const exhaustive: never = classification;
        throw new Error(`Unhandled word class: ${JSON.stringify(exhaustive)}`);
      }
    }
  }

  closeClause();

  if (clauses.length === 0) {
    // A phrase of pure whitespace normalizes to nothing renderable. The source
    // is still preserved, so the plate is empty rather than the request invalid.
    diagnostics.push(
      diagnostic("warning", "NO_SEMANTIC_CONTENT", "The phrase produced no semantic units."),
    );
  }

  // ── Pass 2: assign ordinal identifiers and build the frozen AST ──────────
  const tokenMappings: TokenMapping[] = [];
  const canonicalClauses: CanonicalClauseNode[] = [];
  const counters = { glyph: 0, separator: 0, escape: 0, elided: 0, payload: 0 };

  clauses.forEach((draftNodes, index) => {
    const nodes: CanonicalNode[] = [];
    const readingOrder: NodeId[] = [];
    let seenGlyph = false;
    let mirrorAxisNodeId: NodeId | undefined;

    draftNodes.forEach((draft, tokenIndex) => {
      counters.payload += 1;
      const payloadRef = ordinalId("p", counters.payload);

      let nodeId: NodeId;
      switch (draft.node.kind) {
        case "glyph":
          counters.glyph += 1;
          nodeId = ordinalId("g", counters.glyph);
          break;
        case "separator":
          counters.separator += 1;
          nodeId = ordinalId("s", counters.separator);
          break;
        case "literal-escape":
          counters.escape += 1;
          nodeId = ordinalId("e", counters.escape);
          break;
        case "elided":
          counters.elided += 1;
          nodeId = ordinalId("x", counters.elided);
          break;
        default: {
          const exhaustive: never = draft.node;
          throw new Error(`Unhandled node kind: ${JSON.stringify(exhaustive)}`);
        }
      }

      let node: CanonicalNode = Object.freeze({
        ...draft.node,
        nodeId,
        clauseIndex: index,
        tokenIndex,
        payloadRef,
      });

      if (node.kind === "glyph" && !seenGlyph) {
        seenGlyph = true;
        node = Object.freeze({ ...node, clauseAnchor: true });
      }
      if (node.kind === "separator" && node.separatorId === "mirror-axis") {
        mirrorAxisNodeId = nodeId;
      }

      nodes.push(node);
      if (node.kind !== "elided") readingOrder.push(nodeId);

      // One mapping per source lexeme. The host lexeme carries the node; bound
      // modifier lexemes reference it through `boundTo`.
      draft.lexemes.forEach((lexeme, lexemeIndex) => {
        const isHost = lexemeIndex === 0;
        counters.payload += isHost ? 0 : 1;
        tokenMappings.push(
          Object.freeze({
            payloadRef: isHost ? payloadRef : ordinalId("p", counters.payload),
            nodeId: node.kind === "elided" && draft.classification === "modifier" ? null : nodeId,
            clauseIndex: index,
            tokenIndex,
            sourceText: lexeme.text,
            sourceStart: lexeme.start,
            sourceEnd: lexeme.end,
            classification: isHost ? draft.classification : "modifier",
            ...(isHost ? {} : { boundTo: nodeId }),
          }),
        );
      });
    });

    const clauseCodePoints = draftNodes
      .flatMap((draft) => draft.lexemes)
      .reduce((sum, lexeme) => sum + (lexeme.end - lexeme.start), 0);
    if (clauseCodePoints > LONG_CLAUSE_WARNING_CODE_POINTS) {
      diagnostics.push(
        diagnostic(
          "warning",
          "LONG_CLAUSE",
          `Clause ${index} spans ${clauseCodePoints} code points; long clauses compress layout.`,
          { clauseIndex: index },
        ),
      );
    }

    canonicalClauses.push(
      Object.freeze({
        clauseIndex: index,
        kind: mirrorAxisNodeId === undefined ? ("clause" as const) : ("mirrored-sequence" as const),
        nodes: Object.freeze(nodes),
        ...(mirrorAxisNodeId === undefined ? {} : { mirrorAxisNodeId }),
        readingOrder: Object.freeze(readingOrder),
      }),
    );
  });

  const ast: CanonicalPlateAST = Object.freeze({
    schema: CANONICAL_SCHEMA,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
    plateId,
    versions,
    sourceDigest: sha256Hex(source.utf8Base64),
    clauses: Object.freeze(canonicalClauses),
  });

  return Object.freeze({
    ast,
    tokenMappings: Object.freeze(tokenMappings),
    diagnostics: Object.freeze(diagnostics),
  });
}

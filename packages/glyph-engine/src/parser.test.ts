import { describe, expect, it } from "vitest";

import {
  CURRENT_VERSIONS,
  preserveSourcePayload,
  type SourcePayload,
} from "@studio137/plate-core";
import { geometryRegistry, grammarRegistry } from "@studio137/glyph-registry";

import { analysePhrase } from "./analysis.js";
import { glyphNodes, isGlyphNode, renderableNodes } from "./ast.js";
import { coveredCodePoints, lexPhrase } from "./lexer.js";
import { compileSemantics } from "./parser.js";

const grammar = grammarRegistry();
const geometry = geometryRegistry();

function compile(phrase: string) {
  const source: SourcePayload = preserveSourcePayload(phrase);
  return {
    source,
    ...compileSemantics({
      source,
      plateId: "test000000000000",
      versions: CURRENT_VERSIONS,
      grammar,
      geometry,
    }),
  };
}

describe("lexer", () => {
  it("covers every code point exactly once", () => {
    const samples = [
      "THE SIGNAL SURVIVES THE BODY",
      "we do not forget.  the void | the void",
      "don't  self-same … 線 مرحبا",
      "...",
      "\n\n",
    ];
    for (const sample of samples) {
      const lexemes = lexPhrase(sample);
      expect(coveredCodePoints(lexemes)).toBe(Array.from(sample).length);
      // Spans must tile the input with no gaps and no overlaps.
      let cursor = 0;
      for (const lexeme of lexemes) {
        expect(lexeme.start).toBe(cursor);
        cursor = lexeme.end;
      }
      expect(cursor).toBe(Array.from(sample).length);
    }
  });

  it("keeps apostrophes and hyphens inside words", () => {
    expect(lexPhrase("don't self-same").filter((l) => l.kind === "word").map((l) => l.text)).toEqual(
      ["don't", "self-same"],
    );
  });

  it("emits a trailing hyphen as punctuation rather than swallowing it", () => {
    const words = lexPhrase("signal- body").filter((l) => l.kind === "word").map((l) => l.text);
    expect(words).toEqual(["signal", "body"]);
  });

  it("separates newlines from other whitespace", () => {
    const kinds = lexPhrase("a\nb").map((l) => `${l.kind}:${l.text}`);
    expect(kinds).toEqual(["word:a", "punctuation:\n", "word:b"]);
  });
});

describe("semantic compiler", () => {
  it("compiles the golden fixture to three roots in one clause", () => {
    const { ast } = compile("THE SIGNAL SURVIVES THE BODY");
    expect(ast.clauses).toHaveLength(1);
    expect(glyphNodes(ast).map((node) => node.rootFamilyId)).toEqual([
      "signal",
      "persistence",
      "body",
    ]);
  });

  it("does not reduce the grammar to one glyph per character", () => {
    const { ast } = compile("THE SIGNAL SURVIVES THE BODY");
    expect(glyphNodes(ast).length).toBeLessThan("THE SIGNAL SURVIVES THE BODY".length);
  });

  it("marks the first root of each clause as the clause anchor", () => {
    const { ast } = compile("SIGNAL SURVIVES. BODY BURNS.");
    expect(ast.clauses).toHaveLength(2);
    for (const clause of ast.clauses) {
      const glyphs = clause.nodes.filter(isGlyphNode);
      expect(glyphs[0]?.clauseAnchor).toBe(true);
      expect(glyphs.slice(1).every((node) => !node.clauseAnchor)).toBe(true);
    }
  });

  it("binds a preceding modifier word to the following root", () => {
    const { ast } = compile("not the body");
    const glyphs = glyphNodes(ast);
    expect(glyphs).toHaveLength(1);
    expect(glyphs[0]!.rootFamilyId).toBe("body");
    expect(glyphs[0]!.modifierIds).toEqual(["negate"]);
    expect(glyphs[0]!.semanticUnitId).toBe("root:body|mod:negate");
  });

  it("collapses a repeated modifier and orders the unit identity stably", () => {
    const a = compile("not all not signal").ast;
    const b = compile("all not signal").ast;
    expect(glyphNodes(a)[0]!.semanticUnitId).toBe(glyphNodes(b)[0]!.semanticUnitId);
  });

  it("rebinds a trailing modifier to the preceding root and warns", () => {
    const { ast, diagnostics } = compile("the signal not");
    expect(glyphNodes(ast)[0]!.modifierIds).toEqual(["negate"]);
    expect(diagnostics.map((d) => d.code)).toContain("TRAILING_MODIFIER_REBOUND");
  });

  it("records elided glue instead of discarding it", () => {
    const { ast, tokenMappings } = compile("THE SIGNAL");
    const elided = ast.clauses[0]!.nodes.filter((node) => node.kind === "elided");
    expect(elided).toHaveLength(1);
    expect(tokenMappings.some((m) => m.classification === "elided" && m.sourceText === "THE")).toBe(
      true,
    );
    // Elided nodes carry no geometry and take no place in reading order.
    expect(ast.clauses[0]!.readingOrder).not.toContain(elided[0]!.nodeId);
  });

  it("carries unsupported words as literal escapes rather than dropping them", () => {
    const { ast, diagnostics } = compile("signal xyzzy body");
    const escapes = ast.clauses[0]!.nodes.filter((node) => node.kind === "literal-escape");
    expect(escapes).toHaveLength(1);
    expect(diagnostics.map((d) => d.code)).toContain("LITERAL_ESCAPE");
  });

  it("never places source text inside a literal escape node", () => {
    const { ast } = compile("signal zzzzqqq body");
    const escape = ast.clauses[0]!.nodes.find((node) => node.kind === "literal-escape")!;
    expect(JSON.stringify(escape)).not.toContain("zzzzqqq");
    expect(escape).toMatchObject({ codePointCount: 7 });
  });

  it("merges adjacent unsupported runs into one cartouche", () => {
    const { ast } = compile("xyzzy plugh");
    expect(ast.clauses[0]!.nodes.filter((n) => n.kind === "literal-escape")).toHaveLength(1);
  });

  it("recognizes a mirrored sequence and records its axis", () => {
    const { ast } = compile("the signal | the body");
    expect(ast.clauses[0]!.kind).toBe("mirrored-sequence");
    expect(ast.clauses[0]!.mirrorAxisNodeId).toBeDefined();
  });

  it("splits clauses on terminal punctuation and newlines", () => {
    expect(compile("signal. body. void.").ast.clauses).toHaveLength(3);
    expect(compile("signal\nbody").ast.clauses).toHaveLength(2);
  });

  it("maps relation words and commas to relation separators", () => {
    const { ast } = compile("signal of body, void");
    const separators = ast.clauses[0]!.nodes.filter((node) => node.kind === "separator");
    expect(separators.map((node) => (node.kind === "separator" ? node.separatorId : ""))).toEqual([
      "relation",
      "relation",
    ]);
  });

  it("assigns ordinal identifiers that are not derived from source text", () => {
    const { ast } = compile("signal body void");
    const ids = glyphNodes(ast).map((node) => node.nodeId);
    expect(ids).toEqual(["g000001", "g000002", "g000003"]);
  });

  it("gives every node a distinct id and payload ref", () => {
    const { ast } = compile("all signal survives. not the body | void, structure");
    const nodes = ast.clauses.flatMap((clause) => clause.nodes);
    expect(new Set(nodes.map((n) => n.nodeId)).size).toBe(nodes.length);
    expect(new Set(nodes.map((n) => n.payloadRef)).size).toBe(nodes.length);
  });

  it("resolves every referenced geometry id", () => {
    const { ast } = compile("all signal survives the ancient body | xyzzy, void");
    for (const node of renderableNodes(ast)) {
      expect(geometry.has(node.geometryId)).toBe(true);
      expect(node.geometryVersion).toBe(geometry.version);
    }
  });

  it("produces a frozen AST", () => {
    const { ast } = compile("signal");
    expect(Object.isFrozen(ast)).toBe(true);
    expect(Object.isFrozen(ast.clauses)).toBe(true);
    expect(Object.isFrozen(ast.clauses[0]!.nodes[0])).toBe(true);
  });

  it("is deterministic for the same phrase", () => {
    const a = compile("all signal survives the ancient body | xyzzy, void");
    const b = compile("all signal survives the ancient body | xyzzy, void");
    expect(JSON.stringify(a.ast)).toBe(JSON.stringify(b.ast));
    expect(JSON.stringify(a.tokenMappings)).toBe(JSON.stringify(b.tokenMappings));
  });

  it("warns rather than throwing on a phrase with no semantic content", () => {
    const { ast, diagnostics } = compile("   ");
    expect(ast.clauses).toHaveLength(0);
    expect(diagnostics.map((d) => d.code)).toContain("NO_SEMANTIC_CONTENT");
  });

  it("handles non-Latin source as literal escapes without failing", () => {
    const { ast, source } = compile("مرحبا 線");
    expect(ast.clauses[0]!.nodes.some((n) => n.kind === "literal-escape")).toBe(true);
    expect(source.originalText).toBe("مرحبا 線");
  });
});

describe("phrase analysis", () => {
  it("summarizes the golden fixture for the source panel", () => {
    const compiled = compile("THE SIGNAL SURVIVES THE BODY");
    const analysis = analysePhrase({ ...compiled, grammar, mode: "exact" });

    expect(analysis.codePointCount).toBe(28);
    expect(analysis.glyphCount).toBe(3);
    expect(analysis.clauses[0]!.reading).toBe("SIGNAL PERSISTENCE BODY");
    expect(analysis.elidedTokens).toEqual(["THE", "THE"]);
    expect(analysis.unsupportedTokens).toEqual([]);
    expect(analysis.reversibility).toBe("exact-guaranteed");
  });

  it("reports manifest-only reversibility in stylized mode", () => {
    const compiled = compile("signal");
    expect(analysePhrase({ ...compiled, grammar, mode: "stylized" }).reversibility).toBe(
      "manifest-only",
    );
  });

  it("lists modifier assignments with their source words", () => {
    const compiled = compile("all the ancient signal");
    const analysis = analysePhrase({ ...compiled, grammar, mode: "exact" });
    expect(analysis.modifierAssignments).toHaveLength(1);
    // Copy before sorting: the analysis structures are frozen.
    expect([...analysis.modifierAssignments[0]!.modifiers].sort()).toEqual([
      "anterior",
      "collective",
    ]);
    expect(analysis.modifierAssignments[0]!.sourceWords).toContain("all");
  });
});

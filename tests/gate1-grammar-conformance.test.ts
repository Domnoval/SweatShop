/**
 * Verification Gate 1 — grammar conformance (spec §26).
 *
 * A fixture must exercise all nine root families, all four modifiers, every
 * separator, clause boundaries, mirrored passages, every corruption rule, and
 * unsupported literal payloads.
 *
 * Artist approval is still required before grammar V1 can be published; these
 * checks establish that the *machinery* covers the whole canon, not that the
 * canon itself is final.
 */

import { describe, expect, it } from "vitest";

import { CURRENT_VERSIONS, preserveSourcePayload } from "@studio137/plate-core";
import {
  geometryRegistry,
  grammarRegistry,
  EXPECTED_MODIFIER_COUNT,
  EXPECTED_ROOT_FAMILY_COUNT,
} from "@studio137/glyph-registry";
import { compileSemantics, glyphNodes } from "@studio137/glyph-engine";

import { CONFORMANCE_PHRASE, compileFor } from "./helpers.js";

const grammar = grammarRegistry();
const geometry = geometryRegistry();

describe("Gate 1: grammar conformance", () => {
  it("reaches every one of the nine root families through the lexicon", () => {
    const unreachable = grammar.rootFamilies
      .filter((family) => grammar.wordsFor(family.id).length === 0)
      .map((family) => family.id);
    expect(unreachable).toEqual([]);
    expect(grammar.rootFamilies).toHaveLength(EXPECTED_ROOT_FAMILY_COUNT);
  });

  it("resolves a source word to every root family", () => {
    for (const family of grammar.rootFamilies) {
      const word = grammar.wordsFor(family.id)[0]!;
      expect(grammar.classify(word)).toMatchObject({ kind: "root" });
      expect(grammar.lookup(word)?.root).toBe(family.id);
    }
  });

  it("reaches every one of the four modifiers through the lexicon", () => {
    const reached = new Set(
      grammar.modifiers.map((modifier) => modifier.id).filter((id) =>
        ["not", "all", "very", "was"].some((word) => {
          const classified = grammar.classify(word);
          return classified.kind === "modifier" && classified.modifier === id;
        }),
      ),
    );
    expect(reached.size).toBe(EXPECTED_MODIFIER_COUNT);
  });

  it("reaches every separator from punctuation or a relation word", () => {
    const reached = new Set<string>();
    for (const run of [".", ",", "|", "...", ":", ";", "\n", "—"]) {
      const separator = grammar.separatorForPunctuation(run);
      if (separator !== undefined) reached.add(separator.id);
    }
    const relation = grammar.classify("of");
    if (relation.kind === "relation") reached.add(relation.separator.id);
    expect([...reached].sort()).toEqual(["clause-break", "mirror-axis", "relation", "void-gap"]);
  });

  it("compiles the conformance fixture without losing a code point", () => {
    const source = preserveSourcePayload(CONFORMANCE_PHRASE);
    const { ast, tokenMappings } = compileSemantics({
      source,
      plateId: "conformance00000",
      versions: CURRENT_VERSIONS,
      grammar,
      geometry,
    });

    // Every non-whitespace lexeme must appear in the token mappings.
    const covered = tokenMappings.reduce(
      (sum, mapping) => sum + (mapping.sourceEnd - mapping.sourceStart),
      0,
    );
    const nonSpace = Array.from(source.normalizedSemanticView).filter(
      (character) => !/[^\S\n]/u.test(character),
    ).length;
    expect(covered).toBeGreaterThanOrEqual(nonSpace);

    expect(ast.clauses.length).toBeGreaterThan(1);
    expect(ast.clauses.some((clause) => clause.kind === "mirrored-sequence")).toBe(true);
  });

  it("exercises clause boundaries, mirroring, and literal escapes together", () => {
    const source = preserveSourcePayload(CONFORMANCE_PHRASE);
    const { ast } = compileSemantics({
      source,
      plateId: "conformance00000",
      versions: CURRENT_VERSIONS,
      grammar,
      geometry,
    });

    const nodes = ast.clauses.flatMap((clause) => clause.nodes);
    expect(nodes.some((node) => node.kind === "literal-escape")).toBe(true);
    expect(nodes.some((node) => node.kind === "elided")).toBe(true);
    expect(
      nodes.some((node) => node.kind === "separator" && node.separatorId === "mirror-axis"),
    ).toBe(true);
    expect(glyphNodes(ast).some((node) => node.modifierIds.length > 0)).toBe(true);
  });

  it("exercises every corruption operation class across the level range", () => {
    const kinds = new Set<string>();
    for (const level of [10, 30, 45, 70, 95]) {
      for (const mode of ["exact", "stylized"] as const) {
        // Exact mode refuses destructive operations, so the lossy class is only
        // reachable in stylized mode — which is exactly the policy under test.
        // Interface scale: `level` is already 0–100.
        const plate = compileFor({
          phrase: CONFORMANCE_PHRASE,
          corruptionLevel: level,
          mode,
          density: 40,
        });
        for (const operation of plate.presentation.corruption.operations) {
          kinds.add(operation.kind);
        }
      }
    }

    expect([...kinds].sort()).toEqual([
      "decorative-interference",
      "lossy-payload",
      "payload-occlusion",
      "reversible-mirror",
      "reversible-permutation",
      "reversible-substitution",
    ]);
  });

  it("keeps a self-paired root out of substitution entirely", () => {
    const selfPaired = grammar.rootFamilies.filter(
      (family) => family.substitutionPartner === family.id,
    );
    expect(selfPaired.length).toBeGreaterThan(0);
    for (const family of selfPaired) {
      expect(family.corruptionEligibility.substitutable).toBe(false);
    }
  });
});

import { describe, expect, it } from "vitest";

import { createGeometryRegistry, geometryRegistry, pathDigest } from "./geometry-registry.js";
import { GEOMETRY_V1_SOURCE } from "./geometry.v1.js";
import {
  createGrammarRegistry,
  EXPECTED_MODIFIER_COUNT,
  EXPECTED_ROOT_FAMILY_COUNT,
  foldWord,
  grammarRegistry,
} from "./grammar-registry.js";

describe("geometry registry", () => {
  const registry = geometryRegistry();

  it("loads and self-verifies", () => {
    expect(() => createGeometryRegistry()).not.toThrow();
    expect(registry.version).toBe("geometry/v1");
    expect(registry.ids.length).toBe(GEOMETRY_V1_SOURCE.length);
  });

  it("is still flagged provisional until the artist approves a contact sheet", () => {
    expect(registry.provisional).toBe(true);
  });

  it("exposes ids in a stable sorted order", () => {
    expect([...registry.ids]).toEqual([...registry.ids].sort());
  });

  it("gives every record a distinct integrity hash", () => {
    const hashes = registry.ids.map((id) => registry.get(id).integritySha256);
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("detects an edited path", () => {
    const record = registry.get("root-signal");
    const tampered = pathDigest({
      viewBox: record.viewBox,
      paths: [...record.paths.slice(1), { d: "M0 0 L1 1", role: "stroke", strokeWidth: 8 }],
    });
    expect(tampered).not.toBe(record.integritySha256);
  });

  it("declares ink bounds that sit inside the viewBox", () => {
    for (const id of registry.ids) {
      const record = registry.get(id);
      const bounds = registry.inkBounds(id);
      const [vx, vy, vw, vh] = record.viewBox;
      expect(bounds.x).toBeGreaterThanOrEqual(vx);
      expect(bounds.y).toBeGreaterThanOrEqual(vy);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(vx + vw);
      expect(bounds.y + bounds.height).toBeLessThanOrEqual(vy + vh);
      expect(bounds.width).toBeGreaterThan(0);
      expect(bounds.height).toBeGreaterThan(0);
    }
  });

  it("declares a positive minimum print stroke for every record", () => {
    for (const id of registry.ids) {
      expect(registry.get(id).minimumPrintStrokePt).toBeGreaterThan(0);
    }
  });

  it("throws on an unknown id", () => {
    expect(() => registry.get("root-does-not-exist")).toThrowError(/No geometry record/u);
  });
});

describe("grammar registry", () => {
  const grammar = grammarRegistry();

  it("loads and passes conformance validation", () => {
    expect(() => createGrammarRegistry()).not.toThrow();
  });

  it("carries the canon shape the spec requires", () => {
    expect(grammar.rootFamilies).toHaveLength(EXPECTED_ROOT_FAMILY_COUNT);
    expect(grammar.modifiers).toHaveLength(EXPECTED_MODIFIER_COUNT);
    expect(grammar.separators.map((s) => s.id).sort()).toEqual([
      "clause-break",
      "mirror-axis",
      "relation",
      "void-gap",
    ]);
  });

  it("is still flagged provisional until grammar-v1.md is signed off", () => {
    expect(grammar.provisional).toBe(true);
  });

  it("keeps substitution an involution so exact decoding stays unambiguous", () => {
    for (const record of grammar.rootFamilies) {
      const partner = grammar.root(record.substitutionPartner);
      expect(partner.substitutionPartner).toBe(record.id);
      if (partner.id === record.id) {
        expect(record.corruptionEligibility.substitutable).toBe(false);
      }
    }
  });

  it("classifies roots, modifiers, relations, glue, and unsupported words", () => {
    expect(grammar.classify("SIGNAL")).toMatchObject({ kind: "root" });
    expect(grammar.classify("signal").kind).toBe("root");
    expect(grammar.classify("not")).toMatchObject({ kind: "modifier", modifier: "negate" });
    expect(grammar.classify("of")).toMatchObject({ kind: "relation" });
    expect(grammar.classify("the")).toMatchObject({ kind: "elided" });
    expect(grammar.classify("xyzzy")).toMatchObject({ kind: "unsupported" });
  });

  it("folds case without locale sensitivity", () => {
    // A Turkish locale would fold "I" to a dotless "ı" and change the plate.
    expect(foldWord("SIGNAL")).toBe("signal");
    expect(foldWord("I")).toBe("i");
  });

  it("resolves the golden fixture phrase to three roots", () => {
    const words = "THE SIGNAL SURVIVES THE BODY".split(" ");
    const kinds = words.map((word) => grammar.classify(word).kind);
    expect(kinds).toEqual(["elided", "root", "root", "elided", "root"]);
  });

  it("matches the longest punctuation run first", () => {
    expect(grammar.separatorForPunctuation("...")?.id).toBe("void-gap");
    expect(grammar.separatorForPunctuation(".")?.id).toBe("clause-break");
    expect(grammar.matchPunctuationPrefix("...rest")?.token).toBe("...");
    expect(grammar.matchPunctuationPrefix("word")).toBeUndefined();
  });

  it("resolves every referenced geometry id", () => {
    const geometry = geometryRegistry();
    for (const record of grammar.rootFamilies) expect(geometry.has(record.geometryId)).toBe(true);
    for (const record of grammar.modifiers) expect(geometry.has(record.geometryId)).toBe(true);
    for (const record of grammar.separators) expect(geometry.has(record.geometryId)).toBe(true);
    expect(geometry.has(grammar.literalEscapeGeometryId)).toBe(true);
  });
});

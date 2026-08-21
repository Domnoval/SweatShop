/**
 * Keep the encoding bible aligned with the registries it documents.
 *
 * The bible is meant to become the authority once the artist approves it, but
 * while it merely *describes* the code, a document that has silently drifted
 * from the registry is worse than no document. These checks fail when a family,
 * modifier, separator, glyph, or substrate exists in one and not the other.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { SUBSTRATE_IDS } from "@studio137/plate-core";
import { geometryRegistry, grammarRegistry } from "@studio137/glyph-registry";
import { CORRUPTION_BANDS } from "@studio137/corruption-engine";
import { implementedLayoutIds, PENDING_LAYOUT_FAMILIES } from "@studio137/layout-engine";

function bible(name: string): string {
  return readFileSync(new URL(`../bible/encoding/${name}`, import.meta.url), "utf8");
}

const grammar = grammarRegistry();
const geometry = geometryRegistry();

describe("encoding bible stays in sync with the registries", () => {
  it("documents every root family", () => {
    const doc = bible("grammar-v1.md");
    for (const family of grammar.rootFamilies) {
      expect(doc, `grammar-v1.md is missing ${family.label}`).toContain(family.label);
      expect(doc, `grammar-v1.md is missing ${family.geometryId}`).toContain(family.geometryId);
    }
  });

  it("documents every modifier and separator", () => {
    const doc = bible("grammar-v1.md");
    for (const modifier of grammar.modifiers) {
      expect(doc, `grammar-v1.md is missing ${modifier.label}`).toContain(modifier.label);
    }
    for (const separator of grammar.separators) {
      expect(doc, `grammar-v1.md is missing ${separator.label}`).toContain(separator.label);
    }
  });

  it("documents every locked geometry record", () => {
    const doc = bible("geometry-registry.md");
    for (const id of geometry.ids) {
      expect(doc, `geometry-registry.md is missing ${id}`).toContain(id);
    }
  });

  it("documents every substrate", () => {
    const doc = bible("substrate-registry.md");
    for (const id of SUBSTRATE_IDS) {
      expect(doc, `substrate-registry.md is missing ${id}`).toContain(id);
    }
  });

  it("documents every corruption band", () => {
    const doc = bible("corruption-classification.md");
    for (const band of CORRUPTION_BANDS) {
      expect(doc, `corruption-classification.md is missing ${band.label}`).toContain(band.label);
    }
  });

  it("states the provisional status the registries actually report", () => {
    // A document that dropped its warning while the code still says provisional
    // would be the most dangerous kind of drift.
    if (grammar.provisional) {
      expect(bible("grammar-v1.md")).toContain("PROVISIONAL");
    }
    if (geometry.provisional) {
      expect(bible("geometry-registry.md")).toContain("PROVISIONAL");
    }
  });

  it("keeps the README honest about which layout families exist", () => {
    const readme = readFileSync(new URL("../README.md", import.meta.url), "utf8");
    for (const id of implementedLayoutIds()) {
      expect(readme, `README does not mention implemented layout ${id}`).toContain(id);
    }
    // The README claims five families are declared but unimplemented.
    expect(PENDING_LAYOUT_FAMILIES).toHaveLength(5);
    expect(readme).toContain("Five of seven canon layout families");
  });
});

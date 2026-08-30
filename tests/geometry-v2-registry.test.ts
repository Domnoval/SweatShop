/**
 * `geometry/v2` — the studio's own marks, loaded as locked geometry.
 *
 * These are the first records in this project that are actually authored rather
 * than placeholder: fifty marks lowered out of the studio's draw registry into
 * path data. The tests below check the properties that make them safe to pin a
 * plate against — that the version they report is their own, that the integrity
 * tripwire fires, and that no mark's ink leaves the box it declares.
 *
 * That last one is not hypothetical. Four marks reached extraction relying on
 * the SVG viewport to crop what escaped their viewBox, which is invisible in a
 * browser and fatal to a compiler that reserves space by envelope. This suite
 * is what stops that class of defect coming back.
 */

import { describe, expect, it } from "vitest";

import { PlateError } from "@studio137/plate-core";
import {
  createGeometryRegistryV2,
  geometryRegistry,
  geometryRegistryV2,
  GEOMETRY_V2_INTEGRITY,
  GEOMETRY_V2_SOURCE,
  GEOMETRY_V2_VERSION,
  pathDigest,
} from "@studio137/glyph-registry";

const v2 = geometryRegistryV2();

describe("geometry/v2 loads as a locked registry", () => {
  it("reports its own version, not the version of another registry", () => {
    expect(v2.version).toBe("geometry/v2");
    expect(GEOMETRY_V2_VERSION).toBe("geometry/v2");
  });

  it("stamps every record with v2 rather than inheriting v1's version", () => {
    // `buildRecord` used to close over the v1 version constant, so every record
    // in any registry claimed to be geometry/v1 no matter which source built it.
    // The record's version is what a manifest reads back, so this must be true
    // per-record and not merely true of the registry object.
    for (const id of v2.ids) {
      expect(v2.get(id).version).toBe("geometry/v2");
    }
  });

  it("carries the fifty extracted marks", () => {
    expect(GEOMETRY_V2_SOURCE).toHaveLength(50);
    expect(Object.keys(GEOMETRY_V2_INTEGRITY)).toHaveLength(50);
    expect(v2.ids.filter((id) => id.startsWith("mark-"))).toHaveLength(50);
  });

  it("exposes ids in a sorted order that does not depend on insertion", () => {
    expect([...v2.ids]).toStrictEqual([...v2.ids].sort());
  });

  it("supersedes geometry/v1 rather than replacing it", () => {
    // This test asserted the opposite until the contract moved, and the old
    // assertion is what made the move impossible. The grammar names seventeen
    // structural records — root-signal, mod-negate, sep-relation and the rest —
    // that live only in v1. A disjoint v2 dangles every one of them, and the
    // compiler throws UNKNOWN_GEOMETRY on the first word of the first plate.
    const v1 = geometryRegistry();
    expect(v1.version).toBe("geometry/v1");
    expect(v1.ids).toHaveLength(18);
    for (const id of v1.ids) expect(v2.has(id)).toBe(true);
    expect(v2.ids).toHaveLength(68);
  });

  it("keeps every superseded record byte-identical to the version it came from", () => {
    // Superseding is not redrawing. A structural record carried into v2 must hash
    // exactly as it did in v1, or a plate sealed under v1 and re-verified under
    // v2 would fail integrity for a reason nobody changed.
    const v1 = geometryRegistry();
    for (const id of v1.ids) {
      expect(v2.get(id).integritySha256).toBe(v1.get(id).integritySha256);
    }
  });
});

describe("the integrity tripwire", () => {
  it("passes on the committed hashes", () => {
    expect(() => createGeometryRegistryV2().verifyIntegrity()).not.toThrow();
  });

  it("computes a different digest the moment a released path is edited", () => {
    // Counter-verification for the tripwire itself: reintroduce the defect it
    // exists to catch. `verifyIntegrity` compares exactly this digest against
    // the committed hash, so a digest that moved is a load that fails.
    const source = GEOMETRY_V2_SOURCE[0]!;
    const declared = GEOMETRY_V2_INTEGRITY[source.id];

    expect(pathDigest(source)).toBe(declared);

    const edited = pathDigest({
      viewBox: source.viewBox,
      paths: [{ ...source.paths[0]!, d: `${source.paths[0]!.d} L1 1` }, ...source.paths.slice(1)],
    });
    expect(edited).not.toBe(declared);
  });

  it("notices a viewBox change even when every path is untouched", () => {
    // The digest covers the coordinate space as well as the ink, because the
    // same path data in a different box is a different mark.
    const source = GEOMETRY_V2_SOURCE[0]!;
    const rescaled = pathDigest({ viewBox: [0, 0, 200, 200], paths: source.paths });
    expect(rescaled).not.toBe(GEOMETRY_V2_INTEGRITY[source.id]);
  });

  it("gives every mark a distinct hash", () => {
    const hashes = v2.ids.map((id) => v2.get(id).integritySha256);
    expect(new Set(hashes).size).toBe(hashes.length);
    for (const hash of hashes) expect(hash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("raises a typed error rather than a bare throw", () => {
    try {
      v2.get("mark-does-not-exist");
      expect.unreachable("resolved a mark that is not in the registry");
    } catch (error) {
      expect(error).toBeInstanceOf(PlateError);
      expect((error as PlateError).code).toBe("UNKNOWN_GEOMETRY");
    }
  });
});

describe("every mark stays inside the box it declares", () => {
  it("keeps ink bounds within the viewBox", () => {
    const escaped: string[] = [];
    for (const source of GEOMETRY_V2_SOURCE) {
      const [, , vw, vh] = source.viewBox;
      const [minX, minY, maxX, maxY] = source.inkBounds;
      if (minX < 0 || minY < 0 || maxX > vw || maxY > vh) escaped.push(source.id);
    }
    // A mark whose ink leaves its viewBox is legible in a browser only because
    // the viewport crops it. Layout reserves the whole declared extent.
    expect(escaped).toStrictEqual([]);
  });

  it("declares non-empty bounds for every mark", () => {
    for (const source of GEOMETRY_V2_SOURCE) {
      const [minX, minY, maxX, maxY] = source.inkBounds;
      expect(maxX).toBeGreaterThan(minX);
      expect(maxY).toBeGreaterThan(minY);
    }
  });

  it("gives every mark a collision envelope the layout engine can use", () => {
    for (const id of v2.ids) {
      const rect = v2.inkBounds(id);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
      expect(v2.get(id).collisionEnvelope).toHaveLength(4);
    }
  });
});

describe("every mark is authored geometry, not borrowed type", () => {
  it("carries at least one locked path and no empty path data", () => {
    for (const source of GEOMETRY_V2_SOURCE) {
      expect(source.paths.length).toBeGreaterThan(0);
      for (const path of source.paths) {
        expect(path.d.trim().length).toBeGreaterThan(0);
        expect(path.d).toMatch(/^[Mm]/);
      }
    }
  });

  it("gives every stroked path a positive width and every fill none", () => {
    for (const source of GEOMETRY_V2_SOURCE) {
      for (const path of source.paths) {
        if (path.role === "stroke") expect(path.strokeWidth).toBeGreaterThan(0);
        else expect(path.strokeWidth).toBe(0);
      }
    }
  });

  it("resolves no mark through a font", () => {
    // The two marks that did — their numerals and letters were <text> — were
    // refused at extraction rather than shipped as whatever font the rendering
    // machine happened to have. Nothing font-shaped may appear in path data.
    for (const source of GEOMETRY_V2_SOURCE) {
      for (const path of source.paths) {
        expect(path.d).not.toMatch(/[A-Za-z]{3,}/);
      }
    }
    expect(v2.has("mark-loshu")).toBe(false);
    expect(v2.has("mark-baphomet")).toBe(false);
  });
});

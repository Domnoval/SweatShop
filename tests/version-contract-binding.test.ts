/**
 * The version contract must describe the vocabulary a plate was actually
 * compiled from (spec §12.1, §19).
 *
 * `assertSupportedVersions` only asks whether this build can execute a requested
 * contract. It never inspects which registry was handed to the compiler, and
 * until now nothing else did either — so a caller could compile against
 * `geometry/v2` while the plate declared `geometry/v1`, and every artifact would
 * carry a version string that did not describe it. That mislabelling is worse
 * than a crash: the output is reproducible, passes integrity checks, and is
 * wrong. `derivePlateId` hashes the contract, the manifest seals it, and Gate 3
 * pins output against it, so the lie propagates into the plate's identity.
 *
 * These tests were counter-verified: with `assertRegistriesMatchContract`
 * removed from `compilePlate`, the four mismatch cases below compile happily and
 * the assertions fail. Restoring it turns them green again.
 */

import { describe, expect, it } from "vitest";

import { CURRENT_VERSIONS, PlateError, type VersionContract } from "@studio137/plate-core";
import { compilePlate, defaultRegistries } from "@studio137/plate-compiler";
import type { GeometryRegistry } from "@studio137/glyph-registry";

import { requestFor } from "./helpers.js";

const base = defaultRegistries();

/** The real registry, reporting a different version and nothing else changed. */
function geometryClaiming(version: string): GeometryRegistry {
  const real = base.geometry;
  return {
    version,
    provisional: real.provisional,
    ids: real.ids,
    get: (id) => real.get(id),
    has: (id) => real.has(id),
    inkBounds: (id) => real.inkBounds(id),
    verifyIntegrity: () => real.verifyIntegrity(),
  };
}

function grammarClaiming(version: string): typeof base.grammar {
  return Object.create(base.grammar, {
    version: { value: version, enumerable: true },
  }) as typeof base.grammar;
}

function contractWith(overrides: Partial<VersionContract>): VersionContract {
  return Object.freeze({ ...CURRENT_VERSIONS, ...overrides });
}

describe("the loaded registry must match the pinned contract", () => {
  it("compiles when the registries and the contract agree", () => {
    expect(() => compilePlate(requestFor(), base)).not.toThrow();
  });

  it("refuses a geometry registry that disagrees with the contract", () => {
    const registries = { ...base, geometry: geometryClaiming("geometry/v2") };
    expect(() => compilePlate(requestFor(), registries)).toThrowError(PlateError);
    try {
      compilePlate(requestFor(), registries);
      expect.unreachable("compiled a plate under a vocabulary it did not declare");
    } catch (error) {
      const err = error as PlateError;
      expect(err.code).toBe("UNSUPPORTED_VERSION");
      expect(err.message).toContain("geometryVersion");
      expect(err.message).toContain("geometry/v2");
    }
  });

  it("refuses a grammar registry that disagrees with the contract", () => {
    const registries = { ...base, grammar: grammarClaiming("grammar/v2") };
    try {
      compilePlate(requestFor(), registries);
      expect.unreachable("compiled a plate under a grammar it did not declare");
    } catch (error) {
      const err = error as PlateError;
      expect(err.code).toBe("UNSUPPORTED_VERSION");
      expect(err.message).toContain("grammarVersion");
    }
  });

  it("reports every disagreeing field at once rather than the first", () => {
    const registries = {
      grammar: grammarClaiming("grammar/v2"),
      geometry: geometryClaiming("geometry/v2"),
      versions: base.versions,
    };
    try {
      compilePlate(requestFor(), registries);
      expect.unreachable("compiled with two mismatched registries");
    } catch (error) {
      const err = error as PlateError;
      expect(err.message).toContain("grammarVersion");
      expect(err.message).toContain("geometryVersion");
      const details = err.detail as { mismatched: unknown[] };
      expect(details.mismatched).toHaveLength(2);
    }
  });

  it("still refuses when the contract moves and the registry stays put", () => {
    // The mirror image of the case above: here the plate asks for a vocabulary
    // this build genuinely cannot load. `assertSupportedVersions` catches it
    // first, which is correct — but it must not be the only thing standing
    // between a mislabelled contract and a sealed artifact.
    const registries = { ...base, versions: contractWith({ geometryVersion: "geometry/v2" }) };
    expect(() => compilePlate(requestFor(), registries)).toThrowError(PlateError);
  });

  it("names the loaded version and the contract version in the error", () => {
    const registries = { ...base, geometry: geometryClaiming("geometry/v99") };
    try {
      compilePlate(requestFor(), registries);
      expect.unreachable("compiled against geometry/v99");
    } catch (error) {
      const err = error as PlateError;
      // Diagnosing this requires knowing both halves, not just that they differ.
      expect(err.message).toContain("contract=geometry/v1");
      expect(err.message).toContain("loaded=geometry/v99");
    }
  });
});

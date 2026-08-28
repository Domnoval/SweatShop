/**
 * Verification Gate 4 — locked path integrity (spec §26).
 *
 * Path data is hashed at registry load, after semantic compilation, after
 * layout, after corruption planning, after atmosphere planning, and after
 * public export. Every canonical path hash must remain unchanged.
 *
 * This is the enforcement of the system's central invariant: layout, substrate,
 * corruption, decoys, and atmosphere may position, transform, mask, surround, or
 * obscure authored geometry, but may never redraw or mutate its path data.
 */

import { describe, expect, it } from "vitest";

import { OUTPUT_PRESETS, PlateError } from "@studio137/plate-core";
import { geometryRegistryV2, grammarRegistry, pathDigest } from "@studio137/glyph-registry";
import {
  buildEnvelopes,
  compilePlate,
  exportPublic,
  registryDigest,
} from "@studio137/plate-compiler";

import { requestFor } from "./helpers.js";

// The digest must be taken against whatever `defaultRegistries()` loads, not
// against v1 by name — otherwise this asserts which registry is current
// rather than that the paths survived the pipeline, which is Gate 4's job.
const geometry = geometryRegistryV2();

function heavilyCorrupted(mode: "exact" | "stylized") {
  return compilePlate(
    requestFor({
      phrase: "all the ancient signal survives | not the body of every void, xyzzy",
      seed: "integrity",
      outputSize: OUTPUT_PRESETS["poster-24x36"],
      density: 82,
      corruptionLevel: 94,
      mode,
    }),
  );
}

describe("Gate 4: locked path integrity", () => {
  it("records a snapshot at every required pipeline stage", () => {
    const plate = heavilyCorrupted("exact");
    expect(plate.pathIntegrity.map((snapshot) => snapshot.stage)).toEqual([
      "registry-load",
      "semantic-compilation",
      "layout",
      "corruption-planning",
      "atmosphere-planning",
    ]);
  });

  it("keeps every stage snapshot identical", () => {
    const plate = heavilyCorrupted("exact");
    const digests = new Set(plate.pathIntegrity.map((snapshot) => snapshot.digest));
    expect(digests.size).toBe(1);
  });

  it("keeps the registry unchanged through public export", () => {
    const plate = heavilyCorrupted("exact");
    const published = exportPublic(plate);
    expect(published.pathIntegrityAfterExport).toBe(plate.pathIntegrity[0]!.digest);
    expect(published.pathIntegrityAfterExport).toBe(registryDigest(geometry));
  });

  it("holds under destructive stylized corruption too", () => {
    const plate = heavilyCorrupted("stylized");
    const published = exportPublic(plate);
    expect(new Set(plate.pathIntegrity.map((s) => s.digest)).size).toBe(1);
    expect(published.pathIntegrityAfterExport).toBe(plate.pathIntegrity[0]!.digest);
    // Stylized mode may drop a glyph from the public surface; what it may never
    // do is alter the geometry of the glyphs that remain.
    expect(plate.presentation.corruption.visuallyLossy).toBe(true);
  });

  it("emits only unmodified registry paths into the payload layer", () => {
    const plate = heavilyCorrupted("exact");
    const svg = exportPublic(plate).canonicalSvg;
    const payload = svg.slice(
      svg.indexOf('<g id="canonical-payload">'),
      svg.indexOf('<g id="reversible-transforms">') === -1
        ? svg.length
        : svg.indexOf('<g id="reversible-transforms">'),
    );

    const emitted = [...payload.matchAll(/ d="([^"]+)"/gu)].map((match) => match[1]!);
    expect(emitted.length).toBeGreaterThan(0);

    const authored = new Set(
      geometry.ids.flatMap((id) =>
        geometry.get(id).paths.map((path) => path.d.trim().replace(/\s+/gu, " ")),
      ),
    );
    for (const d of emitted) {
      expect(authored.has(d)).toBe(true);
    }
  });

  it("detects an edited path through the declared integrity hash", () => {
    const record = geometry.get("root-structure");
    const edited = pathDigest({
      viewBox: record.viewBox,
      paths: [
        { d: `${record.paths[0]!.d} L1 1`, role: "stroke" as const, strokeWidth: 8 },
        ...record.paths.slice(1),
      ],
    });
    expect(edited).not.toBe(record.integritySha256);
  });

  it("refuses to build envelopes for a node pinned to an unavailable geometry version", () => {
    const plate = compilePlate(
      requestFor({ phrase: "signal", seed: "version", outputSize: OUTPUT_PRESETS["poster-18x24"] }),
    );

    // Rewrite the AST as if it had been compiled under a geometry version this
    // build no longer carries. Spec §19 requires failing closed rather than
    // rendering whatever the current registry happens to hold.
    const stale = {
      ...plate.ast,
      clauses: plate.ast.clauses.map((clause) => ({
        ...clause,
        nodes: clause.nodes.map((node) =>
          node.kind === "elided" ? node : { ...node, geometryVersion: "geometry/v99" },
        ),
      })),
    } as typeof plate.ast;

    expect(() => buildEnvelopes(stale, grammarRegistry(), geometry)).toThrowError(PlateError);
    try {
      buildEnvelopes(stale, grammarRegistry(), geometry);
    } catch (error) {
      expect((error as PlateError).code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("verifies the registry on demand and is safe to call repeatedly", () => {
    for (let call = 0; call < 3; call += 1) {
      expect(() => geometry.verifyIntegrity()).not.toThrow();
    }
  });
});

/**
 * Verification Gate 3 — cross-runtime determinism (spec §26).
 *
 * Fixed-fixture hashes for the canonical AST, the presentation plan, the SVG,
 * the print composition, and the PNG pixels.
 *
 * The pinned values in `fixtures/golden-hashes.json` are release gates. When one
 * of them changes, the artwork the golden fixture produces has changed — which
 * is sometimes intended and always deliberate. Regenerate with
 * `pnpm golden:hash` only when that is the case.
 */

import { describe, expect, it } from "vitest";

import { canonicalDigest, OUTPUT_PRESETS } from "@studio137/plate-core";
import { compilePlate, exportProductionPng, exportPublic } from "@studio137/plate-compiler";
import { RASTERIZER } from "@studio137/render-raster";

import golden from "./fixtures/golden-hashes.json" with { type: "json" };
import { GOLDEN_REQUEST, requestFor } from "./helpers.js";

describe("Gate 3: cross-runtime determinism", () => {
  const plate = compilePlate(GOLDEN_REQUEST);
  const published = exportPublic(plate);

  it("reproduces the golden plate identifier and request digest", () => {
    expect(plate.plateId).toBe(golden.plateId);
    expect(plate.requestDigest).toBe(golden.requestDigest);
  });

  it("reproduces the golden canonical AST hash", () => {
    expect(canonicalDigest(plate.ast)).toBe(golden.astSha256);
  });

  it("reproduces the golden presentation plan hash", () => {
    expect(canonicalDigest(plate.presentation)).toBe(golden.presentationSha256);
  });

  it("reproduces the golden SVG and print composition hashes", () => {
    expect(published.canonicalSvgSha256).toBe(golden.canonicalSvgSha256);
    expect(published.printSvgSha256).toBe(golden.printSvgSha256);
    // The print composition wraps the plate; it must not alter its geometry.
    expect(published.canonicalPathDigest).toBe(golden.canonicalPathDigest);
  });

  it("reproduces the golden PNG pixel hash under the pinned rasterizer", () => {
    expect(RASTERIZER).toBe(golden.rasterizer);
    const raster = exportProductionPng(plate, published.canonicalSvg, {
      widthPx: golden.productionPngWidthPx,
      background: "#ffffff",
    });
    expect(raster.sha256).toBe(golden.productionPngSha256);
  });

  it("produces byte-identical output on a second compile", () => {
    const again = compilePlate(GOLDEN_REQUEST);
    const republished = exportPublic(again);
    expect(canonicalDigest(again.ast)).toBe(canonicalDigest(plate.ast));
    expect(canonicalDigest(again.presentation)).toBe(canonicalDigest(plate.presentation));
    expect(republished.canonicalSvg).toBe(published.canonicalSvg);
    expect(republished.printSvg).toBe(published.printSvg);
  });

  it("rasterizes identically twice in a row", () => {
    const first = exportProductionPng(plate, published.canonicalSvg, {
      widthPx: 400,
      background: "#ffffff",
    });
    const second = exportProductionPng(plate, published.canonicalSvg, {
      widthPx: 400,
      background: "#ffffff",
    });
    expect(second.sha256).toBe(first.sha256);
  });

  it("changes the plate when the seed changes, and nothing else", () => {
    const other = compilePlate({ ...GOLDEN_REQUEST, seed: "different-seed" });
    expect(other.plateId).not.toBe(plate.plateId);
    // Meaning is a function of the phrase alone, so the AST is unchanged apart
    // from the plate id it carries.
    expect(canonicalDigest({ ...other.ast, plateId: "" })).toBe(
      canonicalDigest({ ...plate.ast, plateId: "" }),
    );
    expect(canonicalDigest(other.presentation)).not.toBe(canonicalDigest(plate.presentation));
  });

  it("isolates the named streams so one control does not reroll another", () => {
    // Spec §5.2: changing density may move decoys without moving corruption
    // sites. Anything else means the streams are not actually independent.
    const base = compilePlate(
      requestFor({
        phrase: "signal survives the body of structure",
        seed: "stream-isolation",
        outputSize: OUTPUT_PRESETS["poster-24x36"],
        density: 30,
        corruptionLevel: 55,
      }),
    );
    const denser = compilePlate(
      requestFor({
        phrase: "signal survives the body of structure",
        seed: "stream-isolation",
        outputSize: OUTPUT_PRESETS["poster-24x36"],
        density: 70,
        corruptionLevel: 55,
      }),
    );

    const siteIds = (plan: typeof base) =>
      plan.presentation.corruption.corruptionSites
        .filter((site) => site.kind !== "decorative-interference")
        .map((site) => `${site.kind}:${site.nodeIds.join(",")}`)
        .sort();

    expect(siteIds(denser)).toEqual(siteIds(base));
    expect(denser.presentation.decoys.length).not.toBe(base.presentation.decoys.length);
  });

  it("does not depend on object key iteration order in the request", () => {
    const reordered = {
      mode: GOLDEN_REQUEST.mode,
      outputSize: GOLDEN_REQUEST.outputSize,
      mathematicalSubstrate: GOLDEN_REQUEST.mathematicalSubstrate,
      layoutFamily: GOLDEN_REQUEST.layoutFamily,
      corruptionLevel: GOLDEN_REQUEST.corruptionLevel,
      density: GOLDEN_REQUEST.density,
      seed: GOLDEN_REQUEST.seed,
      phrase: GOLDEN_REQUEST.phrase,
    };
    expect(compilePlate(reordered).plateId).toBe(plate.plateId);
  });
});

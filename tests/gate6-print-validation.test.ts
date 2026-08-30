/**
 * Verification Gate 6 — print validation (spec §26).
 *
 * Dimensions, bleed, safe area, DPI-equivalent pixels, minimum stroke, alpha
 * policy, background extension, and file limits.
 *
 * Gate 6 also has a half this suite cannot reach: spec Phase 10 requires a
 * physical 24×36 proof to pass visual and production inspection. Until that
 * happens every print template reports `physicallyValidated: false`, and the
 * test below asserts that the code says so rather than implying otherwise.
 */

import { describe, expect, it } from "vitest";

import {
  MAX_PIXEL_AREA,
  OUTPUT_PRESETS,
  PlateError,
  resolveOutput,
  toInches,
  toPixels,
  type OutputSize,
} from "@studio137/plate-core";
import { PRINT_TEMPLATES, resolvePrintTemplate } from "@studio137/render-svg";
import { compilePlate, exportProductionPng, exportPublic } from "@studio137/plate-compiler";

import { requestFor } from "./helpers.js";

describe("Gate 6: print validation", () => {
  it("converts physical units to pixels exactly", () => {
    expect(toPixels(24, "in", 300)).toBe(7200);
    expect(toPixels(609.6, "mm", 300)).toBe(7200);
    expect(toPixels(7200, "px", 300)).toBe(7200);
    expect(toInches(25.4, "mm", 300)).toBeCloseTo(1, 10);
  });

  it("resolves the golden poster to its expected pixel dimensions", () => {
    const resolved = resolveOutput(OUTPUT_PRESETS["poster-24x36"]);
    expect(resolved.widthPx).toBe(7200);
    expect(resolved.heightPx).toBe(10800);
    expect(resolved.dpi).toBe(300);
    expect(resolved.bleedMm).toBeCloseTo(3.175, 6);
    expect(resolved.safeMarginMm).toBeCloseTo(12.7, 6);
  });

  it("rejects an unsupported DPI and a zero-area output", () => {
    expect(() => resolveOutput({ ...OUTPUT_PRESETS["poster-24x36"], dpi: 0 })).toThrowError(
      PlateError,
    );
    expect(() => resolveOutput({ ...OUTPUT_PRESETS["poster-24x36"], dpi: 9999 })).toThrowError(
      PlateError,
    );
  });

  it("refuses an output above the pixel-area guard", () => {
    const enormous: OutputSize = { width: 200, height: 200, unit: "in", dpi: 300 };
    try {
      resolveOutput(enormous);
      expect.unreachable("expected the area guard to reject a 200×200in plate at 300dpi");
    } catch (error) {
      expect((error as PlateError).code).toBe("OUTPUT_TOO_LARGE");
    }
    expect(MAX_PIXEL_AREA).toBeGreaterThan(7200 * 10800);
  });

  it("refuses a density that would print below the minimum safe stroke", () => {
    // A long phrase on a small plate at high density cannot satisfy the print
    // minimum. Spec §6.2 requires a diagnostic, not a shrunken glyph.
    try {
      compilePlate(
        requestFor({
          phrase:
            "all the ancient signal survives the body of every void and structure, " +
            "the witness knows each threshold; time burns the ancient pattern",
          seed: "too-dense",
          outputSize: { width: 3, height: 4, unit: "in", dpi: 300 },
          density: 99,
          corruptionLevel: 10,
        }),
      );
      expect.unreachable("expected a print-safety or density refusal");
    } catch (error) {
      expect(["PRINT_SAFETY", "DENSITY_INFEASIBLE"]).toContain((error as PlateError).code);
    }
  });

  it("keeps every placed glyph above its minimum print stroke when it does compile", () => {
    const plate = compilePlate(
      requestFor({
        phrase: "the signal survives the body",
        seed: "stroke-check",
        outputSize: OUTPUT_PRESETS["apparel-12x16"],
        density: 55,
        corruptionLevel: 20,
      }),
    );
    expect(plate.presentation.layout.minimumStrokePt).toBeGreaterThanOrEqual(0.75);
  });

  it("places the layout inside bleed and safe margin", () => {
    const plate = compilePlate(
      requestFor({
        phrase: "signal survives body",
        seed: "safe-area",
        outputSize: OUTPUT_PRESETS["poster-24x36"],
        density: 30,
        corruptionLevel: 10,
      }),
    );

    const bleedPx = Math.round((plate.output.bleedMm / 25.4) * plate.output.dpi);
    const safePx = Math.round((plate.output.safeMarginMm / 25.4) * plate.output.dpi);

    expect(plate.bounds.trim.x).toBe(bleedPx);
    expect(plate.bounds.layout.x).toBe(bleedPx + safePx);
    expect(plate.bounds.layout.width).toBe(plate.output.widthPx - (bleedPx + safePx) * 2);

    const safeArea = plate.presentation.layout.safeArea;
    for (const placement of plate.presentation.layout.placements) {
      expect(placement.bounds.x).toBeGreaterThanOrEqual(safeArea.x - 1);
      expect(placement.bounds.y).toBeGreaterThanOrEqual(safeArea.y - 1);
      expect(placement.bounds.x + placement.bounds.width).toBeLessThanOrEqual(
        safeArea.x + safeArea.width + 1,
      );
      // The bottom edge matters as much as the others: without it a glyph
      // pushed off the foot of the plate satisfies every remaining assertion.
      expect(placement.bounds.y + placement.bounds.height).toBeLessThanOrEqual(
        safeArea.y + safeArea.height + 1,
      );
    }
  });

  it("matches each poster preset to its registered print template", () => {
    for (const preset of ["poster-16x20", "poster-18x24", "poster-24x36"] as const) {
      const resolved = resolveOutput(OUTPUT_PRESETS[preset]);
      expect(resolvePrintTemplate(resolved).id).toBe(preset);
    }
  });

  it("falls back to a custom template for an unregistered size, flagged unvalidated", () => {
    const resolved = resolveOutput({ width: 9, height: 11, unit: "in", dpi: 300, bleed: 0.125 });
    const template = resolvePrintTemplate(resolved);
    expect(template.id).toMatch(/^custom-/u);
    expect(template.physicallyValidated).toBe(false);
  });

  it("reports every template as awaiting physical proofing", () => {
    // Phase 10 has not run. When a 24×36 proof passes inspection, that template
    // flips to true and this expectation changes with it.
    for (const template of PRINT_TEMPLATES) {
      expect(template.physicallyValidated).toBe(false);
      expect(template.colorPolicy).toBe("srgb-v1");
    }
  });

  it("adds bleed, trim, and safe boundaries only to the print composition", () => {
    const plate = compilePlate(
      requestFor({ phrase: "signal", seed: "boundaries", outputSize: OUTPUT_PRESETS["poster-18x24"] }),
    );
    const published = exportPublic(plate);
    expect(published.printSvg).toContain('<g id="print-boundaries">');
    expect(published.canonicalSvg).not.toContain('<g id="print-boundaries">');
    expect(published.printSvg).not.toBe(published.canonicalSvg);
    // ...without touching a single payload path.
    expect(published.canonicalPathDigest).toBeTruthy();
  });

  it("honours the background policy", () => {
    const plate = compilePlate(
      requestFor({ phrase: "signal", seed: "bg", outputSize: OUTPUT_PRESETS["poster-18x24"] }),
    );
    const solid = exportPublic(plate, { backgroundPolicy: "solid" });
    const transparent = exportPublic(plate, { backgroundPolicy: "transparent" });

    expect(solid.canonicalSvg).toContain('fill="#f2efe8"');
    const firstElement = transparent.canonicalSvg.split("\n")[1] ?? "";
    expect(firstElement).not.toContain('fill="#f2efe8"');
    // The print composition always extends its ground to bleed.
    expect(transparent.printSvg).toContain('fill="#f2efe8"');
  });

  it("preserves alpha when asked and fills when not", () => {
    const plate = compilePlate(
      requestFor({ phrase: "signal", seed: "alpha", outputSize: { width: 4, height: 5, unit: "in", dpi: 300 } }),
    );
    const published = exportPublic(plate, { backgroundPolicy: "transparent" });

    const opaque = exportProductionPng(plate, published.canonicalSvg, {
      widthPx: 200,
      background: "#ffffff",
    });
    const alpha = exportProductionPng(plate, published.canonicalSvg, { widthPx: 200 });
    expect(alpha.sha256).not.toBe(opaque.sha256);
  });

  it("stamps the PNG with the plate's physical resolution", () => {
    const plate = compilePlate(
      requestFor({ phrase: "signal", seed: "phys", outputSize: OUTPUT_PRESETS["poster-18x24"] }),
    );
    const published = exportPublic(plate);
    const raster = exportProductionPng(plate, published.canonicalSvg, { widthPx: 300 });

    const text = new TextDecoder("latin1").decode(raster.png);
    expect(text).toContain("pHYs");
    expect(raster.dpi).toBe(300);
    expect(raster.widthPx).toBe(300);
  });
});

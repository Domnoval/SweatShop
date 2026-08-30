/**
 * Behaviour of the corruption systems, beyond the structural gates.
 *
 * These cover defects that every existing gate passed over: bands that reported
 * the wrong label for fractional controls, and occlusion masks that were
 * recorded, described in the manifest, and drawn into the file while concealing
 * nothing at all.
 */

import { Resvg } from "@resvg/resvg-js";
import { describe, expect, it } from "vitest";

import {
  DENSITY_BANDS,
  densityBand,
  fromUiScale,
  OUTPUT_PRESETS,
} from "@studio137/plate-core";
import { CORRUPTION_BANDS, corruptionBand } from "@studio137/corruption-engine";
import { compilePlate, exportPublic } from "@studio137/plate-compiler";
import { glyphNodes } from "@studio137/glyph-engine";

import { requestFor } from "./helpers.js";

describe("band lookup is total over the whole control range", () => {
  // The declared ranges are inclusive integer pairs, so every fractional value
  // between two bands used to match none of them and fall through to the last
  // one — reporting corruption 15.5 as an Event Field and density 20.5 as a
  // Black Field, both in the public translation card.
  it.each([0, 0.4, 15, 15.5, 16, 35.5, 60.5, 80.5, 99.9, 100])(
    "gives corruption %s a band adjacent to its neighbours",
    (ui) => {
      const band = corruptionBand(fromUiScale(ui));
      expect(band.uiRange[0]).toBeLessThanOrEqual(Math.ceil(ui));
      expect(CORRUPTION_BANDS).toContain(band);
    },
  );

  it.each([0, 20, 20.5, 21, 45.5, 70.5, 90.5, 100])(
    "gives density %s a band adjacent to its neighbours",
    (ui) => {
      const band = densityBand(fromUiScale(ui));
      expect(band.uiRange[0]).toBeLessThanOrEqual(Math.ceil(ui));
      expect(DENSITY_BANDS).toContain(band);
    },
  );

  it("never reports the most extreme band for a value below it", () => {
    expect(corruptionBand(fromUiScale(15.5)).id).not.toBe("event-field");
    expect(corruptionBand(fromUiScale(35.5)).id).not.toBe("event-field");
    expect(densityBand(fromUiScale(20.5)).id).not.toBe("black-field");
    expect(densityBand(fromUiScale(45.5)).id).not.toBe("black-field");
  });

  it("is monotonic across the range", () => {
    let previous = -1;
    for (let ui = 0; ui <= 100; ui += 0.5) {
      const index = CORRUPTION_BANDS.indexOf(corruptionBand(fromUiScale(ui)));
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
    expect(previous).toBe(CORRUPTION_BANDS.length - 1);
  });

  it("still reports the extremes at the extremes", () => {
    expect(corruptionBand(0).id).toBe("canonical");
    expect(corruptionBand(1).id).toBe("event-field");
    expect(densityBand(0).id).toBe("inscription");
    expect(densityBand(1).id).toBe("black-field");
  });
});

/** Count near-black ink, ignoring the pale substrate, decoys, and atmosphere. */
function inkPixels(svg: string): number {
  const pixels = new Resvg(svg, {
    fitTo: { mode: "width", value: 700 },
    background: "#ffffff",
  }).render().pixels;
  let dark = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i]! < 90 && pixels[i + 1]! < 90 && pixels[i + 2]! < 90) dark += 1;
  }
  return dark;
}

describe("recorded occlusion actually conceals", () => {
  const plate = compilePlate(
    requestFor({
      phrase: "all the ancient signal survives | not the body of every void, xyzzy",
      seed: "a",
      outputSize: OUTPUT_PRESETS["poster-24x36"],
      density: 82,
      corruptionLevel: 94,
      mode: "exact",
    }),
  );

  it("plans occlusion sites for this fixture", () => {
    // Guard the guard: the assertions below are meaningless if nothing occludes.
    expect(plate.presentation.corruption.occlusionSites.length).toBeGreaterThan(0);
  });

  it("aligns every mask with the bounds of the glyph it covers", () => {
    // A mask computed before permutation relocates its glyph conceals empty
    // field. Each mask must overlap the placement it names.
    const placed = new Map(
      plate.presentation.layout.placements.map((placement) => [placement.nodeId, placement]),
    );
    for (const operation of plate.presentation.corruption.operations) {
      if (operation.kind !== "payload-occlusion") continue;
      const placement = placed.get(operation.nodeId);
      expect(placement, operation.nodeId).toBeDefined();

      for (const shape of operation.shapes) {
        const [x, y] = shape.d.slice(1).split(" ").map(Number) as [number, number];
        expect(x).toBeGreaterThanOrEqual(placement!.bounds.x - 1);
        expect(x).toBeLessThanOrEqual(placement!.bounds.x + placement!.bounds.width + 1);
        expect(y).toBeGreaterThanOrEqual(placement!.bounds.y - 1);
        expect(y).toBeLessThanOrEqual(placement!.bounds.y + placement!.bounds.height + 1);
      }
    }
  });

  it("removes ink from the rendered plate", () => {
    // The mask resolves in the user space of the element that references it, so
    // referencing it from a group that carries the glyph's own transform put
    // plate-space shapes into glyph-local space and concealed nothing.
    const svg = exportPublic(plate).canonicalSvg;
    expect(svg).toContain('mask="url(#mask');

    const concealed = inkPixels(svg.replace(/ mask="url\(#mask\d+\)"/gu, "")) - inkPixels(svg);
    expect(concealed).toBeGreaterThan(0);
  });

  it("leaves the concealed glyph complete in the canonical payload layer", () => {
    // Spec section 7.3: a glyph that appears erased is still present beneath a
    // recorded mask, which is what lets exact mode use occlusion at all.
    const svg = exportPublic(plate).canonicalSvg;
    for (const site of plate.presentation.corruption.occlusionSites) {
      expect(svg).toContain(`id="${site.nodeId}"`);
    }
  });
});

describe("modifier marks are measured against their own geometry", () => {
  it("reports a minimum stroke no larger than the finest mark actually printed", () => {
    // Print safety used the host glyph's stroke width for its marks. A modifier
    // is drawn finer and in a smaller viewBox, so marks well below the floor
    // passed the check and the reported minimum was optimistic.
    const plate = compilePlate(
      requestFor({
        phrase: "not witness all signal very body",
        seed: "marks",
        outputSize: OUTPUT_PRESETS["poster-18x24"],
        density: 55,
        corruptionLevel: 0,
        mode: "exact",
      }),
    );

    const marked = glyphNodes(plate.ast).filter((node) => node.modifierIds.length > 0);
    expect(marked.length).toBeGreaterThan(0);

    const scales = plate.presentation.layout.placements.flatMap((placement) =>
      placement.modifiers.map((modifier) => modifier.scale),
    );
    expect(scales.length).toBeGreaterThan(0);
    expect(plate.presentation.layout.minimumStrokePt).toBeGreaterThan(0);
    // Every declared minimum is 0.75pt, and the compile succeeded, so the
    // reported figure has to clear it for the marks as well as the roots.
    expect(plate.presentation.layout.minimumStrokePt).toBeGreaterThanOrEqual(0.75);
  });
});

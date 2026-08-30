/**
 * Production PNG export (spec §15).
 *
 * Kept in its own module because importing it pulls in a native rasterizer.
 * Anything that must stay isomorphic — the preview worker in particular —
 * imports `compile.js` and `export.js` and never this file.
 *
 * The PNG is rasterized from the already-serialized canonical SVG, so it cannot
 * disagree with the vector master, and it is scanned like every other public
 * artifact before release.
 */

import { rasterizePlate, type ProductionRaster } from "@studio137/render-raster";
import { assertPngHasNoLeaks } from "@studio137/artifact-security";

import type { CompiledPlate } from "./compile.js";
import { scanSecretsFor } from "./export.js";

export type ProductionRasterOptions = Readonly<{
  /** Solid background colour, or undefined to preserve alpha. */
  background?: string;
  /** Render smaller than the plate, for previews. Production uses full size. */
  widthPx?: number;
}>;

export function exportProductionPng(
  plate: CompiledPlate,
  canonicalSvg: string,
  options: ProductionRasterOptions = {},
): ProductionRaster {
  const raster = rasterizePlate(canonicalSvg, plate.output, options);

  // Spec §15.1 requires the metadata scrub; this proves it happened rather than
  // assuming the rasterizer emitted nothing. The PNG scan is structure-aware so
  // compressed pixel data cannot trip the text heuristics.
  assertPngHasNoLeaks("production PNG", raster.png, scanSecretsFor(plate));

  return raster;
}

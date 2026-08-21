/**
 * Production rasterization (spec §15).
 *
 * The PNG is rasterized from the serialized canonical SVG — not from a browser
 * screenshot, and not from independently reconstructed geometry. The rasterizer
 * is pinned in the lockfile so the pixel output is reproducible.
 *
 * Trusted-process only: this pulls in a native binary and must never reach a
 * browser bundle (spec §23).
 */

import { Resvg } from "@resvg/resvg-js";

import { PlateError, sha256Hex, type ResolvedOutput } from "@studio137/plate-core";

import { readPngDimensions, scrubPng } from "./png.js";

export const RASTERIZER = "@resvg/resvg-js";

export type RasterOptions = Readonly<{
  /** Solid background colour, or undefined to preserve alpha. */
  background?: string;
  /** Override the output width in pixels. Defaults to the plate's own width. */
  widthPx?: number;
}>;

export type ProductionRaster = Readonly<{
  png: Uint8Array;
  widthPx: number;
  heightPx: number;
  dpi: number;
  sha256: string;
  removedChunks: readonly string[];
}>;

export function rasterizePlate(
  svg: string,
  output: ResolvedOutput,
  options: RasterOptions = {},
): ProductionRaster {
  const widthPx = options.widthPx ?? output.widthPx;

  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: widthPx },
    ...(options.background === undefined ? {} : { background: options.background }),
  });

  const raw = new Uint8Array(resvg.render().asPng());
  const { png, removed } = scrubPng(raw, output.dpi);
  const dimensions = readPngDimensions(png);

  if (dimensions.width !== widthPx) {
    throw new PlateError(
      "INVALID_REQUEST",
      `Rasterizer produced ${dimensions.width}px, expected ${widthPx}px`,
      { expected: widthPx, actual: dimensions.width },
    );
  }

  return Object.freeze({
    png,
    widthPx: dimensions.width,
    heightPx: dimensions.height,
    dpi: output.dpi,
    sha256: sha256Hex(png),
    removedChunks: removed,
  });
}

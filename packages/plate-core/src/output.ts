/**
 * Output size, physical conversion, and output guards (spec §10).
 */

import { PlateError } from "./errors.js";
import { assertFinite } from "./numeric.js";

export type LengthUnit = "px" | "in" | "mm";

export type OutputSize = Readonly<{
  width: number;
  height: number;
  unit: LengthUnit;
  dpi: number;
  /** Bleed in the same unit as width/height. */
  bleed?: number;
  /** Safe margin in the same unit as width/height. */
  safeMargin?: number;
}>;

export const PRODUCTION_DPI = 300;
export const PREVIEW_DPI = 144;

/**
 * Total pixel guard. 4096² is the digital master; this allows a 24×36in plate
 * at 300 DPI (7200×10800 ≈ 78Mpx) with headroom, and refuses anything that
 * would exhaust memory during rasterization.
 */
export const MAX_PIXEL_AREA = 160_000_000;
export const MAX_PIXEL_DIMENSION = 24_000;

export function toInches(value: number, unit: LengthUnit, dpi: number): number {
  assertFinite(value, "toInches");
  if (unit === "in") return value;
  if (unit === "mm") return value / 25.4;
  return value / dpi;
}

export function toMillimetres(value: number, unit: LengthUnit, dpi: number): number {
  return toInches(value, unit, dpi) * 25.4;
}

/** `pixels = round(sizeInInches × DPI)` */
export function toPixels(value: number, unit: LengthUnit, dpi: number): number {
  return Math.round(toInches(value, unit, dpi) * dpi);
}

export type ResolvedOutput = Readonly<{
  widthPx: number;
  heightPx: number;
  widthIn: number;
  heightIn: number;
  widthMm: number;
  heightMm: number;
  bleedMm: number;
  safeMarginMm: number;
  dpi: number;
}>;

export function resolveOutput(size: OutputSize): ResolvedOutput {
  const { width, height, unit, dpi } = size;

  if (!Number.isFinite(dpi) || dpi <= 0 || dpi > 2400) {
    throw new PlateError("INVALID_REQUEST", `Unsupported DPI: ${dpi}`, { dpi });
  }

  const widthPx = toPixels(width, unit, dpi);
  const heightPx = toPixels(height, unit, dpi);

  if (widthPx <= 0 || heightPx <= 0) {
    throw new PlateError("INVALID_REQUEST", "Output size resolves to zero pixels", { size });
  }
  if (widthPx > MAX_PIXEL_DIMENSION || heightPx > MAX_PIXEL_DIMENSION) {
    throw new PlateError(
      "OUTPUT_TOO_LARGE",
      `Output dimension exceeds ${MAX_PIXEL_DIMENSION}px (${widthPx}×${heightPx})`,
      { widthPx, heightPx },
    );
  }
  if (widthPx * heightPx > MAX_PIXEL_AREA) {
    throw new PlateError(
      "OUTPUT_TOO_LARGE",
      `Output area ${widthPx * heightPx}px exceeds the ${MAX_PIXEL_AREA}px guard`,
      { widthPx, heightPx, area: widthPx * heightPx },
    );
  }

  return Object.freeze({
    widthPx,
    heightPx,
    widthIn: toInches(width, unit, dpi),
    heightIn: toInches(height, unit, dpi),
    widthMm: toMillimetres(width, unit, dpi),
    heightMm: toMillimetres(height, unit, dpi),
    bleedMm: size.bleed === undefined ? 0 : toMillimetres(size.bleed, unit, dpi),
    safeMarginMm: size.safeMargin === undefined ? 0 : toMillimetres(size.safeMargin, unit, dpi),
    dpi,
  });
}

export type OutputPresetId =
  | "digital-master-4096"
  | "apparel-12x16"
  | "poster-16x20"
  | "poster-18x24"
  | "poster-24x36"
  | "desk-mat-16x32"
  | "journal-cover-5.75x8";

export const OUTPUT_PRESETS: Readonly<Record<OutputPresetId, OutputSize>> = Object.freeze({
  "digital-master-4096": Object.freeze({
    width: 4096,
    height: 4096,
    unit: "px",
    dpi: PRODUCTION_DPI,
  }),
  "apparel-12x16": Object.freeze({
    width: 12,
    height: 16,
    unit: "in",
    dpi: PRODUCTION_DPI,
    safeMargin: 0.5,
  }),
  "poster-16x20": Object.freeze({
    width: 16,
    height: 20,
    unit: "in",
    dpi: PRODUCTION_DPI,
    bleed: 0.125,
    safeMargin: 0.25,
  }),
  "poster-18x24": Object.freeze({
    width: 18,
    height: 24,
    unit: "in",
    dpi: PRODUCTION_DPI,
    bleed: 0.125,
    safeMargin: 0.25,
  }),
  "poster-24x36": Object.freeze({
    width: 24,
    height: 36,
    unit: "in",
    dpi: PRODUCTION_DPI,
    bleed: 0.125,
    safeMargin: 0.5,
  }),
  "desk-mat-16x32": Object.freeze({
    width: 16,
    height: 32,
    unit: "in",
    dpi: PRODUCTION_DPI,
    bleed: 0.125,
  }),
  "journal-cover-5.75x8": Object.freeze({
    width: 5.75,
    height: 8,
    unit: "in",
    dpi: PRODUCTION_DPI,
    bleed: 0.125,
    safeMargin: 0.25,
  }),
});

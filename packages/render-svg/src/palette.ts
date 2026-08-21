/**
 * Plate palette and colour normalization (spec §14.1, §17).
 *
 * Colours are normalized to lowercase six-digit sRGB hex so that no two runs can
 * differ by `#FFF` versus `#ffffff`. The default palette is a working one; a
 * production palette is an artist decision, and is a parameter rather than a
 * constant for exactly that reason.
 */

import { PlateError } from "@studio137/plate-core";

export type PlatePalette = Readonly<{
  /** Plate ground. Ignored when the background policy is transparent. */
  paper: string;
  /** Canonical payload ink. */
  ink: string;
  substrate: string;
  decoy: string;
  atmosphere: string;
  /** Registration and trim marks. */
  registration: string;
}>;

export const DEFAULT_PALETTE: PlatePalette = Object.freeze({
  paper: "#f2efe8",
  ink: "#111111",
  substrate: "#8d8578",
  decoy: "#b9b2a5",
  atmosphere: "#6e675c",
  registration: "#b4231f",
});

const SHORT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/iu;
const LONG_HEX = /^#([0-9a-f]{6})$/iu;

export function normalizeColor(value: string): string {
  const short = SHORT_HEX.exec(value);
  if (short !== null) {
    return `#${short[1]!}${short[1]!}${short[2]!}${short[2]!}${short[3]!}${short[3]!}`.toLowerCase();
  }
  const long = LONG_HEX.exec(value);
  if (long !== null) return `#${long[1]!.toLowerCase()}`;
  throw new PlateError("INVALID_REQUEST", `Colour must be sRGB hex, received "${value}"`, {
    value,
  });
}

export function normalizePalette(palette: PlatePalette): PlatePalette {
  return Object.freeze({
    paper: normalizeColor(palette.paper),
    ink: normalizeColor(palette.ink),
    substrate: normalizeColor(palette.substrate),
    decoy: normalizeColor(palette.decoy),
    atmosphere: normalizeColor(palette.atmosphere),
    registration: normalizeColor(palette.registration),
  });
}

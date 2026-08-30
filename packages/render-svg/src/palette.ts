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
  /**
   * Ordered ramp a guide's `hue` indexes into. Absent by default, so a plate that
   * declares no spectrum renders exactly as it did before this existed.
   *
   * A fixed list of sRGB hex rather than a computed colour space: the same
   * indices must produce the same bytes on every machine, and interpolating in
   * floating point would put the determinism contract at the mercy of a
   * rounding mode.
   */
  spectrum?: readonly string[];
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

/** Pick a ramp entry for a 0–1 hue. Returns undefined when no ramp is declared. */
export function spectrumColor(
  palette: PlatePalette,
  hue: number | undefined,
): string | undefined {
  const ramp = palette.spectrum;
  if (ramp === undefined || ramp.length === 0 || hue === undefined) return undefined;
  const i = Math.min(ramp.length - 1, Math.max(0, Math.floor(hue * ramp.length)));
  return ramp[i];
}

export function normalizePalette(palette: PlatePalette): PlatePalette {
  return Object.freeze({
    paper: normalizeColor(palette.paper),
    ink: normalizeColor(palette.ink),
    substrate: normalizeColor(palette.substrate),
    decoy: normalizeColor(palette.decoy),
    atmosphere: normalizeColor(palette.atmosphere),
    registration: normalizeColor(palette.registration),
    ...(palette.spectrum === undefined
      ? {}
      : { spectrum: Object.freeze(palette.spectrum.map(normalizeColor)) }),
  });
}

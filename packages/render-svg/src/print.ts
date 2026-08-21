/**
 * Print composition templates (spec §17).
 *
 * A print template *wraps* the canonical plate. It never alters glyph paths, and
 * bleed, trim, safe area, and registration stay on their own layers so the
 * vector master remains available independently.
 *
 * Spec §17.1: V1 begins with one physically validated poster template. Every
 * other template here is declared but unvalidated, and says so — Phase 10
 * physical proofing is what promotes a template to validated.
 */

import { COORDINATE_PRECISION, formatFixed, type ResolvedOutput } from "@studio137/plate-core";

import type { PlatePalette } from "./palette.js";
import { selfClosing, type Attribute } from "./xml.js";

export const PRINT_TEMPLATE_VERSION = "print-template/v1";

export type PrintTemplate = Readonly<{
  id: string;
  version: string;
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  safeMarginMm: number;
  colorPolicy: "srgb-v1";
  backgroundPolicy: "extend-to-bleed" | "solid-to-bleed";
  /** False until a physical proof has passed inspection (spec Phase 10). */
  physicallyValidated: boolean;
}>;

const INCH_MM = 25.4;

const DEFAULT_BLEED_IN = 0.125;

/**
 * Declare a poster template from its **sheet** size.
 *
 * `OutputSize.width` is the full canvas (spec §10.3: `pixels = sizeInInches ×
 * DPI`), so bleed is inset from that edge and the trim line sits two bleeds
 * inside the sheet. Declaring templates the same way is what lets
 * `resolvePrintTemplate` match a preset instead of falling through to a custom
 * one.
 */
function poster(
  id: string,
  sheetWidthIn: number,
  sheetHeightIn: number,
  physicallyValidated: boolean,
): PrintTemplate {
  return Object.freeze({
    id,
    version: PRINT_TEMPLATE_VERSION,
    trimWidthMm: (sheetWidthIn - DEFAULT_BLEED_IN * 2) * INCH_MM,
    trimHeightMm: (sheetHeightIn - DEFAULT_BLEED_IN * 2) * INCH_MM,
    bleedMm: DEFAULT_BLEED_IN * INCH_MM,
    safeMarginMm: 12.7,
    colorPolicy: "srgb-v1" as const,
    backgroundPolicy: "extend-to-bleed" as const,
    physicallyValidated,
  });
}

export const PRINT_TEMPLATES: readonly PrintTemplate[] = Object.freeze([
  // The one template the roadmap starts with. `physicallyValidated` flips to
  // true only after a 24×36 proof passes inspection.
  poster("poster-24x36", 24, 36, false),
  poster("poster-18x24", 18, 24, false),
  poster("poster-16x20", 16, 20, false),
]);

/**
 * Match a resolved output to a registered template.
 *
 * Returns a generic template derived from the output when nothing matches, so an
 * unusual size still gets correct boundaries — flagged unvalidated, because it is.
 */
export function resolvePrintTemplate(output: ResolvedOutput): PrintTemplate {
  const tolerance = 0.5;
  const trimWidthMm = output.widthMm - output.bleedMm * 2;
  const trimHeightMm = output.heightMm - output.bleedMm * 2;

  const matched = PRINT_TEMPLATES.find(
    (template) =>
      Math.abs(template.trimWidthMm - trimWidthMm) < tolerance &&
      Math.abs(template.trimHeightMm - trimHeightMm) < tolerance,
  );
  if (matched !== undefined) return matched;

  return Object.freeze({
    id: `custom-${Math.round(trimWidthMm)}x${Math.round(trimHeightMm)}mm`,
    version: PRINT_TEMPLATE_VERSION,
    trimWidthMm,
    trimHeightMm,
    bleedMm: output.bleedMm,
    safeMarginMm: output.safeMarginMm,
    colorPolicy: "srgb-v1" as const,
    backgroundPolicy: "extend-to-bleed" as const,
    physicallyValidated: false,
  });
}

function mmToPx(mm: number, dpi: number): number {
  return (mm / INCH_MM) * dpi;
}

function boundaryRect(
  x: number,
  y: number,
  width: number,
  height: number,
  colour: string,
  strokeWidth: number,
  dash: string | undefined,
): string {
  const f = (value: number): string => formatFixed(value, COORDINATE_PRECISION);
  const attributes: Attribute[] = [
    ["d", `M${f(x)} ${f(y)} L${f(x + width)} ${f(y)} L${f(x + width)} ${f(y + height)} L${f(x)} ${f(y + height)} Z`],
    ["fill", "none"],
    ["stroke", colour],
    ["stroke-width", f(strokeWidth)],
  ];
  if (dash !== undefined) attributes.push(["stroke-dasharray", dash]);
  return selfClosing("path", attributes);
}

/**
 * Bleed, trim, and safe-area boundaries as their own layer.
 *
 * These are production guides, not artwork. A press operator reads them; the
 * canonical SVG has no equivalent layer.
 */
export function printBoundaryLayer(
  template: PrintTemplate,
  output: ResolvedOutput,
  palette: PlatePalette,
): readonly string[] {
  const bleedPx = mmToPx(template.bleedMm, output.dpi);
  const safePx = mmToPx(template.safeMarginMm, output.dpi);
  const stroke = Math.max(1, output.dpi / 150);
  const dash = `${formatFixed(stroke * 12, 2)} ${formatFixed(stroke * 8, 2)}`;

  const children: string[] = [
    // Bleed edge — the full canvas.
    boundaryRect(0, 0, output.widthPx, output.heightPx, palette.registration, stroke, dash),
    // Trim line — where the sheet is cut.
    boundaryRect(
      bleedPx,
      bleedPx,
      output.widthPx - bleedPx * 2,
      output.heightPx - bleedPx * 2,
      palette.registration,
      stroke * 1.5,
      undefined,
    ),
  ];

  if (safePx > 0) {
    // Safe area — nothing essential may sit outside this.
    children.push(
      boundaryRect(
        bleedPx + safePx,
        bleedPx + safePx,
        output.widthPx - (bleedPx + safePx) * 2,
        output.heightPx - (bleedPx + safePx) * 2,
        palette.registration,
        stroke,
        dash,
      ),
    );
  }

  return Object.freeze(children);
}

/**
 * Input contract (spec §3).
 *
 * All external input is validated with Zod. Non-finite values, unsupported
 * identifiers, excessive pixel dimensions, invalid DPI, malformed units, and
 * unknown version contracts are rejected rather than coerced.
 */

import { z } from "zod";

import { canonicalDigest } from "./canonical.js";
import { PlateError } from "./errors.js";
import {
  LAYOUT_FAMILY_IDS,
  SUBSTRATE_IDS,
  type LayoutFamilyId,
  type PlateId,
  type PlateMode,
  type SubstrateId,
} from "./identifiers.js";
import { fromUiScale, PARAMETER_PRECISION, quantize } from "./numeric.js";
import { MAX_CODE_POINTS, type SourcePayload } from "./source.js";
import type { OutputSize } from "./output.js";
import { CURRENT_VERSIONS, type VersionContract } from "./versions.js";

/** A fresh finite-number schema. Returned per call so the chained
 * constraints below stay independent. */
const finiteNumber = (): z.ZodNumber => z.number().finite();

export const OutputSizeSchema = z
  .object({
    width: finiteNumber().positive(),
    height: finiteNumber().positive(),
    unit: z.enum(["px", "in", "mm"]),
    dpi: finiteNumber().positive().max(2400),
    bleed: finiteNumber().nonnegative().optional(),
    safeMargin: finiteNumber().nonnegative().optional(),
  })
  .strict();

/** Compiler-facing request: density and corruption already normalized to 0–1. */
export const PlateRequestSchema = z
  .object({
    phrase: z.string().min(1).refine(
      (value) => Array.from(value).length <= MAX_CODE_POINTS,
      `phrase must be at most ${MAX_CODE_POINTS} code points`,
    ),
    seed: z.string().min(1).max(128),
    density: finiteNumber().min(0).max(1),
    corruptionLevel: finiteNumber().min(0).max(1),
    layoutFamily: z.enum(LAYOUT_FAMILY_IDS),
    mathematicalSubstrate: z.enum(SUBSTRATE_IDS),
    outputSize: OutputSizeSchema,
    mode: z.enum(["exact", "stylized"]),
  })
  .strict();

export type PlateRequest = Readonly<{
  phrase: string;
  seed: string;
  density: number;
  corruptionLevel: number;
  layoutFamily: LayoutFamilyId;
  mathematicalSubstrate: SubstrateId;
  outputSize: OutputSize;
  mode: PlateMode;
}>;

/** Interface-facing request: density and corruption on the 0–100 control scale. */
export const PlateRequestInputSchema = PlateRequestSchema.extend({
  density: finiteNumber().min(0).max(100),
  corruptionLevel: finiteNumber().min(0).max(100),
});

export function parsePlateRequest(input: unknown): PlateRequest {
  const result = PlateRequestSchema.safeParse(input);
  if (!result.success) {
    throw new PlateError("INVALID_REQUEST", "Plate request failed validation", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  const parsed = result.data;
  return Object.freeze({
    ...parsed,
    // Quantize the continuous controls so that a slider's floating-point drift
    // cannot produce a different plate for what the artist sees as one setting.
    density: quantize(parsed.density, PARAMETER_PRECISION),
    corruptionLevel: quantize(parsed.corruptionLevel, PARAMETER_PRECISION),
    outputSize: Object.freeze(parsed.outputSize),
  }) as PlateRequest;
}

/** Convert a 0–100 interface request into the normalized compiler request. */
export function normalizeUiRequest(input: unknown): PlateRequest {
  const result = PlateRequestInputSchema.safeParse(input);
  if (!result.success) {
    throw new PlateError("INVALID_REQUEST", "Plate request failed validation", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return parsePlateRequest({
    ...result.data,
    density: fromUiScale(result.data.density),
    corruptionLevel: fromUiScale(result.data.corruptionLevel),
  });
}

/**
 * Canonical request hash, used for caching and as the plate identifier source.
 *
 * The version contract is part of the hash: the same phrase compiled under
 * `geometry/v2` is a different plate, not a silent update of the old one.
 */
export function requestDigest(
  request: PlateRequest,
  versions: VersionContract = CURRENT_VERSIONS,
): string {
  return canonicalDigest({ request, versions });
}

/**
 * Deterministic plate identifier.
 *
 * Derived from the request rather than generated: spec §5.3 prohibits UUID v4
 * inside deterministic artifacts, and identical inputs must produce byte-
 * identical output including public identifiers.
 */
export function derivePlateId(
  request: PlateRequest,
  versions: VersionContract = CURRENT_VERSIONS,
): PlateId {
  return requestDigest(request, versions).slice(0, 16);
}

/** Convenience view of the source alongside its request, used by the manifest. */
export type RequestWithSource = Readonly<{
  request: PlateRequest;
  source: SourcePayload;
}>;

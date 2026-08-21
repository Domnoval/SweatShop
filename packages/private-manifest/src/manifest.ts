/**
 * Private encoding manifest (spec §18).
 *
 * The manifest carries everything required for exact reconstruction and
 * verification: the request, the exact source bytes, the token mappings, the
 * inverse of every corruption operation, and the digests of the public
 * artifacts it corresponds to.
 *
 * It is never a public artifact. Spec §13 forbids placing public and private
 * artifacts in the same automatic download bundle, and spec §23 confines
 * manifest handling to a trusted local or server process.
 */

import { z } from "zod";

import {
  canonicalJson,
  PlateError,
  RNG_STREAM_NAMES,
  type PlateRequest,
  type PlateId,
  type SourcePayload,
  type VersionContract,
} from "@studio137/plate-core";
import type { TokenMapping } from "@studio137/glyph-engine";
import type {
  CorruptionRecord,
  InverseOperation,
  OcclusionRecord,
} from "@studio137/corruption-engine";

export const MANIFEST_SCHEMA = "studio137.private-manifest" as const;
export const MANIFEST_VERSION = "manifest/v1";

export type ArtifactDigests = Readonly<{
  canonicalSvgSha256: string;
  productionPngSha256: string;
  printCompositionSha256: string;
  clauseSheetSha256: string;
}>;

export type PrivateEncodingManifest = Readonly<{
  schema: typeof MANIFEST_SCHEMA;
  manifestVersion: string;
  plateId: PlateId;
  versions: VersionContract;
  request: PlateRequest;
  source: SourcePayload;
  tokenMappings: readonly TokenMapping[];
  inverseOperations: readonly InverseOperation[];
  corruptionSites: readonly CorruptionRecord[];
  occlusionSites: readonly OcclusionRecord[];
  rng: Readonly<{
    seedDigest: string;
    streamDerivationVersion: string;
    streamDigests: Readonly<Record<string, string>>;
  }>;
  artifacts: ArtifactDigests;
}>;

const digest = z.string().regex(/^[0-9a-f]{64}$/u, "expected a lowercase SHA-256 hex digest");
const optionalDigest = z.union([digest, z.literal("")]);

/**
 * Structural validation for a decrypted manifest.
 *
 * Deliberately permissive about the *shape* of nested plan records and strict
 * about the fields exact decoding depends on. A manifest that survives
 * decryption but fails this check is corrupt, not merely unfamiliar.
 */
export const PrivateEncodingManifestSchema = z
  .object({
    schema: z.literal(MANIFEST_SCHEMA),
    manifestVersion: z.string().min(1),
    plateId: z.string().min(1),
    versions: z.record(z.string(), z.string()),
    request: z.object({
      phrase: z.string(),
      seed: z.string().min(1).max(128),
      density: z.number(),
      corruptionLevel: z.number(),
      layoutFamily: z.string(),
      mathematicalSubstrate: z.string(),
      outputSize: z.record(z.string(), z.union([z.number(), z.string()])),
      mode: z.enum(["exact", "stylized"]),
    }),
    source: z.object({
      originalText: z.string(),
      utf8Base64: z.string(),
      codePoints: z.array(z.number().int().nonnegative()),
      normalizedSemanticView: z.string(),
      normalizationPolicy: z.string(),
    }),
    tokenMappings: z.array(z.unknown()),
    inverseOperations: z.array(z.unknown()),
    corruptionSites: z.array(z.unknown()),
    occlusionSites: z.array(z.unknown()),
    rng: z.object({
      seedDigest: digest,
      streamDerivationVersion: z.string().min(1),
      streamDigests: z.record(z.string(), digest),
    }),
    artifacts: z.object({
      canonicalSvgSha256: optionalDigest,
      productionPngSha256: optionalDigest,
      printCompositionSha256: optionalDigest,
      clauseSheetSha256: optionalDigest,
    }),
  })
  .strict();

export function parseManifest(value: unknown): PrivateEncodingManifest {
  const result = PrivateEncodingManifestSchema.safeParse(value);
  if (!result.success) {
    throw new PlateError("MANIFEST_TAMPERED", "Decrypted manifest failed validation", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    });
  }
  return value as PrivateEncodingManifest;
}

/**
 * Serialize a manifest for encryption.
 *
 * Canonical JSON, so a manifest re-sealed from identical inputs produces
 * identical plaintext and the ciphertext differs only by salt and nonce.
 */
export function serializeManifest(manifest: PrivateEncodingManifest): string {
  return canonicalJson(manifest as unknown);
}

export function assertStreamCoverage(manifest: PrivateEncodingManifest): void {
  const missing = RNG_STREAM_NAMES.filter((name) => manifest.rng.streamDigests[name] === undefined);
  if (missing.length > 0) {
    throw new PlateError("MANIFEST_TAMPERED", "Manifest is missing named stream digests", {
      missing,
    });
  }
}

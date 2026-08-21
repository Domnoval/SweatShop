/**
 * Exact decoding (spec §2.1, verification Gate 2).
 *
 * The round trip the whole system is judged on:
 *
 *   decodeExact(openManifest(sealManifest(compilePlate(exactRequest)))) === originalUtf8Phrase
 *
 * Decoding reads the manifest, never the rendered image. Spec §16 is explicit
 * that the clause sheet is generated from the AST and manifest and never by
 * interpreting a raster.
 */

import {
  base64ToUtf8,
  PlateError,
  recoverSourceText,
  type NodeId,
} from "@studio137/plate-core";
import type { CorruptionRecord, InverseOperation } from "@studio137/corruption-engine";

import { assertStreamCoverage, type ArtifactDigests, type PrivateEncodingManifest } from "./manifest.js";

export type DecodeResult = Readonly<{
  /** The original UTF-8 phrase, byte-for-byte. */
  phrase: string;
  /** The parsing view. Exact decoding returns `phrase`, not this. */
  normalizedSemanticView: string;
  mode: "exact" | "stylized";
  /**
   * Whether the *public surface* is guaranteed to be visually decodable.
   * False in stylized mode; the source is recoverable from the manifest either
   * way (spec §2.2).
   */
  visualDecodingGuaranteed: boolean;
  /** Authored reading order per clause, after undoing any permutation. */
  readingOrder: Readonly<Record<number, readonly NodeId[]>>;
  irreversibleSites: readonly string[];
}>;

/**
 * Recover the exact source phrase.
 *
 * Throws rather than returning a best-effort reconstruction: a decoder that
 * quietly returns *nearly* the right phrase is worse than one that refuses.
 */
export function decodeExact(manifest: PrivateEncodingManifest): string {
  return decodePlate(manifest).phrase;
}

export function decodePlate(manifest: PrivateEncodingManifest): DecodeResult {
  assertStreamCoverage(manifest);

  const phrase = recoverSourceText(manifest.source);

  if (phrase !== manifest.source.originalText) {
    throw new PlateError(
      "MANIFEST_TAMPERED",
      "Manifest source bytes do not agree with the recorded original text",
    );
  }

  const codePoints = Array.from(phrase, (character) => character.codePointAt(0)!);
  if (
    codePoints.length !== manifest.source.codePoints.length ||
    codePoints.some((value, index) => value !== manifest.source.codePoints[index])
  ) {
    throw new PlateError(
      "MANIFEST_TAMPERED",
      "Manifest code points do not agree with the recovered phrase",
    );
  }

  // Independent second path to the same bytes: if the base64 and the stored
  // text ever disagreed, one of the two checks above would already have caught
  // it, but decoding is cheap and this is the guarantee the system sells.
  if (base64ToUtf8(manifest.source.utf8Base64) !== phrase) {
    throw new PlateError("MANIFEST_TAMPERED", "Manifest failed the UTF-8 round trip");
  }

  const irreversible = (manifest.corruptionSites as readonly CorruptionRecord[])
    .filter((site) => site.reversible === false)
    .map((site) => site.operationId);

  if (manifest.request.mode === "exact" && irreversible.length > 0) {
    throw new PlateError(
      "EXACT_MODE_VIOLATION",
      `Manifest claims exact mode but records ${irreversible.length} irreversible site(s)`,
      { operationIds: irreversible },
    );
  }

  return Object.freeze({
    phrase,
    normalizedSemanticView: manifest.source.normalizedSemanticView,
    mode: manifest.request.mode,
    visualDecodingGuaranteed: manifest.request.mode === "exact",
    readingOrder: reconstructReadingOrder(manifest),
    irreversibleSites: Object.freeze(irreversible),
  });
}

/**
 * Undo recorded permutations to recover the authored reading order.
 *
 * The plate may read out of sequence; the manifest records what the sequence
 * was, which is what makes the disorder recoverable rather than merely
 * decorative.
 */
export function reconstructReadingOrder(
  manifest: PrivateEncodingManifest,
): Readonly<Record<number, readonly NodeId[]>> {
  const order: Record<number, readonly NodeId[]> = {};
  for (const operation of manifest.inverseOperations as readonly InverseOperation[]) {
    if (operation.inverse.kind !== "restore-order") continue;
    order[operation.inverse.clauseIndex] = Object.freeze([...operation.inverse.originalOrder]);
  }
  return Object.freeze(order);
}

/**
 * Confirm the manifest describes the artifacts actually on disk.
 *
 * Only digests present in `actual` are compared, so a manifest sealed before a
 * later artifact class exists is not treated as a mismatch.
 */
export function verifyArtifactDigests(
  manifest: PrivateEncodingManifest,
  actual: Partial<ArtifactDigests>,
): void {
  const mismatched: { artifact: string; expected: string; actual: string }[] = [];

  for (const [artifact, value] of Object.entries(actual) as [keyof ArtifactDigests, string][]) {
    if (value === undefined || value === "") continue;
    const expected = manifest.artifacts[artifact];
    if (expected !== "" && expected !== value) {
      mismatched.push({ artifact, expected, actual: value });
    }
  }

  if (mismatched.length > 0) {
    throw new PlateError(
      "MANIFEST_TAMPERED",
      `${mismatched.length} artifact digest(s) do not match the manifest`,
      { mismatched },
    );
  }
}

/**
 * Version contract (spec §19).
 *
 * Every plate pins all behavior required to reproduce it later. Released
 * registries are never overwritten in place: a drawing revision creates
 * `geometry/v2`, it does not edit `geometry/v1`. When a pinned version is
 * unavailable, decoding fails with UNSUPPORTED_VERSION rather than performing a
 * best-effort reinterpretation.
 */

import { PlateError } from "./errors.js";

export type VersionContract = Readonly<{
  grammarVersion: string;
  geometryVersion: string;
  unicodePolicyVersion: string;
  rngVersion: string;
  layoutVersion: string;
  substrateVersion: string;
  corruptionVersion: string;
  rendererVersion: string;
  manifestVersion: string;
  printTemplateVersion: string;
}>;

export const CURRENT_VERSIONS: VersionContract = Object.freeze({
  grammarVersion: "grammar/v1",
  geometryVersion: "geometry/v2",
  unicodePolicyVersion: "unicode/none+semantic-nfc-v1",
  rngVersion: "rng/v1",
  layoutVersion: "layout/v1",
  substrateVersion: "substrate/v1",
  corruptionVersion: "corruption/v1",
  rendererVersion: "renderer-svg/v1",
  manifestVersion: "manifest/v1",
  printTemplateVersion: "print-template/v1",
});

/** Every version this build can actually execute. */
export const SUPPORTED_VERSIONS: Readonly<Record<keyof VersionContract, readonly string[]>> =
  Object.freeze({
    grammarVersion: Object.freeze(["grammar/v1"]),
    // v1 stays executable: a plate sealed under it must still verify.
    geometryVersion: Object.freeze(["geometry/v1", "geometry/v2"]),
    unicodePolicyVersion: Object.freeze(["unicode/none+semantic-nfc-v1"]),
    rngVersion: Object.freeze(["rng/v1"]),
    layoutVersion: Object.freeze(["layout/v1"]),
    substrateVersion: Object.freeze(["substrate/v1"]),
    corruptionVersion: Object.freeze(["corruption/v1"]),
    rendererVersion: Object.freeze(["renderer-svg/v1"]),
    manifestVersion: Object.freeze(["manifest/v1"]),
    printTemplateVersion: Object.freeze(["print-template/v1"]),
  });

/**
 * Fail closed on any pinned version this build cannot execute.
 *
 * Spec §19: "Do not perform best-effort reinterpretation."
 */
export function assertSupportedVersions(contract: VersionContract): void {
  const unsupported: { field: string; requested: string; supported: readonly string[] }[] = [];

  for (const key of Object.keys(SUPPORTED_VERSIONS) as (keyof VersionContract)[]) {
    const requested = contract[key];
    const supported = SUPPORTED_VERSIONS[key];
    if (!supported.includes(requested)) {
      unsupported.push({ field: key, requested, supported });
    }
  }

  if (unsupported.length > 0) {
    throw new PlateError(
      "UNSUPPORTED_VERSION",
      `This build cannot reproduce the pinned version contract: ${unsupported
        .map((entry) => `${entry.field}=${entry.requested}`)
        .join(", ")}`,
      { unsupported },
    );
  }
}

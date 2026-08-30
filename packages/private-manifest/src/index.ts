/**
 * @studio137/private-manifest
 *
 * The encrypted encoding manifest and the exact decoder.
 *
 * Trusted-process only (spec §23). Nothing in this package may be bundled into
 * browser code: it handles the artist's master key and the plaintext phrase.
 */

export * from "./manifest.js";
export * from "./container.js";
export * from "./decode.js";

/**
 * @studio137/plate-core
 *
 * Shared contracts for the Phrase-to-Plate compiler: identifiers, the input
 * contract, source preservation, the version contract, deterministic hashing
 * and randomness, and the numeric primitives every engine quantizes through.
 *
 * This package contains no rendering, no encryption, and no I/O, so that the
 * browser preview worker and the trusted Node export process share exactly the
 * same deterministic core (verification Gate 3).
 */

export * from "./base64.js";
export * from "./canonical.js";
export * from "./density.js";
export * from "./errors.js";
export * from "./freeze.js";
export * from "./identifiers.js";
export * from "./numeric.js";
export * from "./output.js";
export * from "./request.js";
export * from "./rng.js";
export * from "./sha256.js";
export * from "./source.js";
export * from "./versions.js";

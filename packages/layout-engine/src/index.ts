/**
 * @studio137/layout-engine
 *
 * Deterministic layout solvers. Solvers position glyph envelopes against a
 * mathematical substrate and enforce print safety; they never see or touch
 * path data (spec §8.2).
 */

export * from "./types.js";
export * from "./placement.js";
export * from "./solvers.js";
export * from "./registry.js";

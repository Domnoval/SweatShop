/**
 * @studio137/glyph-registry
 *
 * The two finite, versioned canons the compiler resolves everything through:
 * the grammar (root families, modifiers, separators, lexicon) and the locked
 * authored glyph geometry.
 *
 * Both are currently PROVISIONAL — see the banners in `grammar.v1.ts` and
 * `geometry.v1.ts`. Registry consumers never hard-code a root family or a path;
 * replacing the canon is a data edit in this package alone.
 */

export * from "./types.js";
export * from "./grammar-types.js";
export * from "./geometry.v1.js";
export {
  GEOMETRY_V2_IS_PROVISIONAL,
  GEOMETRY_V2_SOURCE,
  GEOMETRY_V2_VERSION,
} from "./geometry.v2.js";
export { GEOMETRY_V2_INTEGRITY } from "./geometry-integrity.v2.js";
export * from "./geometry-registry.js";
export {
  GRAMMAR_IS_PROVISIONAL,
  GRAMMAR_VERSION,
  LITERAL_ESCAPE_GEOMETRY_ID,
  MODIFIERS,
  ROOT_FAMILIES,
  SEPARATORS,
} from "./grammar.v1.js";
export * from "./grammar-registry.js";

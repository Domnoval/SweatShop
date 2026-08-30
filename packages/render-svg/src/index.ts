/**
 * @studio137/render-svg
 *
 * The deterministic canonical SVG serializer. Identical inputs produce
 * byte-identical output, and the canonical payload group always contains
 * unmodified authored path data (spec §14).
 */

export * from "./matrix.js";
export * from "./palette.js";
export * from "./print.js";
export * from "./xml.js";
export * from "./renderer.js";

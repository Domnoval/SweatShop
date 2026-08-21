/**
 * @studio137/glyph-engine
 *
 * Phrase → lexemes → semantic units → immutable canonical AST.
 *
 * This package produces meaning, not pictures. It never positions anything and
 * never touches path data; layout, substrate, corruption, and rendering all
 * operate on the frozen AST it returns.
 */

export * from "./ast.js";
export * from "./lexer.js";
export * from "./parser.js";
export * from "./analysis.js";

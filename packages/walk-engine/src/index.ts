/**
 * `@studio137/walk-engine` — stations 1 and 2 of the spine.
 *
 * The single surviving implementation of resolve and walk. Two others existed in
 * the HTML instruments and are deleted rather than deprecated; a second copy of a
 * cipher is a second answer to "what does this word mean".
 */

export { CIPHER_IDS, cipherValue, digitSum, isCipherId, reduceToCell, type CipherId } from "./cipher.js";
export { digitString, resolve, type ResolvedLetter, type Resolution } from "./resolve.js";
export {
  assertMagic,
  isSquareId,
  kamea,
  magicConstant,
  positions,
  SQUARE_IDS,
  type Kamea,
  type SquareId,
} from "./squares.js";
export {
  cellXY,
  TRACE_IDS,
  walk,
  type Point,
  type TraceId,
  type Walk,
  type WalkOptions,
  type WalkPath,
  type WalkPathRole,
  type WalkStep,
} from "./walk.js";

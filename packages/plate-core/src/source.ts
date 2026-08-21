/**
 * Source preservation (spec §4).
 *
 * Two parallel representations are kept for every phrase:
 *
 *   - `originalText` / `utf8Base64` — the exact bytes the artist typed. Exact
 *     decoding returns *this*, not the normalized view.
 *   - `normalizedSemanticView` — a parsing convenience only.
 *
 * Nothing is silently dropped. Unsupported words and characters survive as
 * literal escape nodes rather than disappearing (spec §4.1).
 */

import { base64ToUtf8, utf8ToBase64 } from "./base64.js";
import { PlateError } from "./errors.js";

export const NORMALIZATION_POLICY = "none+semantic-nfc-v1" as const;

/** V1 limit from spec §4.2. Counted in code points, not UTF-16 units. */
export const MAX_CODE_POINTS = 512;
/** Clauses longer than this produce a warning before compilation. */
export const LONG_CLAUSE_WARNING_CODE_POINTS = 160;

export type SourcePayload = Readonly<{
  originalText: string;
  utf8Base64: string;
  codePoints: readonly number[];
  normalizedSemanticView: string;
  normalizationPolicy: typeof NORMALIZATION_POLICY;
}>;

/**
 * Normalize for parsing only.
 *
 * NFC composition and line-ending normalization, and nothing else. Runs of
 * spaces and intentional punctuation are preserved because spec §4.1 forbids
 * collapsing them — spacing is authorial in this grammar.
 */
export function normalizeForSemantics(text: string): string {
  return text.replace(/\r\n?/gu, "\n").normalize("NFC");
}

export function preserveSourcePayload(phrase: string): SourcePayload {
  if (typeof phrase !== "string") {
    throw new PlateError("INVALID_REQUEST", "Phrase must be a string");
  }

  const codePoints = Array.from(phrase, (character) => character.codePointAt(0)!);

  if (codePoints.length === 0) {
    throw new PlateError("EMPTY_PHRASE", "Phrase must contain at least one code point");
  }
  if (codePoints.length > MAX_CODE_POINTS) {
    throw new PlateError(
      "PHRASE_TOO_LONG",
      `Phrase is ${codePoints.length} code points; the V1 limit is ${MAX_CODE_POINTS}`,
      { codePointCount: codePoints.length, limit: MAX_CODE_POINTS },
    );
  }

  const utf8Base64 = utf8ToBase64(phrase);

  // Fail here rather than at decode time: an unrepresentable phrase must never
  // reach an artifact that claims to be exactly reversible.
  if (base64ToUtf8(utf8Base64) !== phrase) {
    throw new PlateError("INVALID_REQUEST", "Phrase did not survive a UTF-8 round trip");
  }

  return Object.freeze({
    originalText: phrase,
    utf8Base64,
    codePoints: Object.freeze(codePoints),
    normalizedSemanticView: normalizeForSemantics(phrase),
    normalizationPolicy: NORMALIZATION_POLICY,
  });
}

/** Recover the exact original phrase. This is the target of verification Gate 2. */
export function recoverSourceText(payload: Pick<SourcePayload, "utf8Base64">): string {
  return base64ToUtf8(payload.utf8Base64);
}

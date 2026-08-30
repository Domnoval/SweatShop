/**
 * Phrase lexer (spec §4, §11.1).
 *
 * Operates on the *normalized semantic view*, never on the original bytes. The
 * original survives untouched in `SourcePayload.utf8Base64`, which is what exact
 * decoding returns.
 *
 * Every code point of the input lands in exactly one lexeme. Nothing is skipped:
 * spacing and punctuation are authorial in this grammar, and unsupported
 * characters must reach the parser so they can become literal escape nodes.
 */

export type LexemeKind = "word" | "punctuation" | "space";

export type Lexeme = Readonly<{
  kind: LexemeKind;
  /** Text as it appears in the normalized semantic view. */
  text: string;
  /** Inclusive start offset, in code points, into the normalized view. */
  start: number;
  /** Exclusive end offset, in code points. */
  end: number;
}>;

/**
 * Letters, marks, and digits form words. An apostrophe or hyphen between two
 * word characters stays inside the word, so "don't" and "self-same" lex as one
 * token rather than fragmenting into literal escapes.
 */
const WORD_CHARACTER = /[\p{L}\p{M}\p{N}]/u;
const INNER_WORD_JOINER = /[\u0027\u2019\u002D\u2010\u2011]/u;
/** Any whitespace except a newline; newlines are clause breaks, not spacing. */
const SPACE_CHARACTER = /[^\S\n]/u;

export function lexPhrase(normalizedView: string): readonly Lexeme[] {
  const characters = Array.from(normalizedView);
  const lexemes: Lexeme[] = [];
  let index = 0;

  const isWordChar = (offset: number): boolean => {
    const character = characters[offset];
    return character !== undefined && WORD_CHARACTER.test(character);
  };

  while (index < characters.length) {
    const character = characters[index]!;

    if (SPACE_CHARACTER.test(character)) {
      const start = index;
      while (index < characters.length && SPACE_CHARACTER.test(characters[index]!)) index += 1;
      lexemes.push(
        Object.freeze({
          kind: "space" as const,
          text: characters.slice(start, index).join(""),
          start,
          end: index,
        }),
      );
      continue;
    }

    if (WORD_CHARACTER.test(character)) {
      const start = index;
      index += 1;
      while (index < characters.length) {
        if (isWordChar(index)) {
          index += 1;
          continue;
        }
        // A joiner only stays inside the word when a word character follows it.
        if (INNER_WORD_JOINER.test(characters[index]!) && isWordChar(index + 1)) {
          index += 2;
          continue;
        }
        break;
      }
      lexemes.push(
        Object.freeze({
          kind: "word" as const,
          text: characters.slice(start, index).join(""),
          start,
          end: index,
        }),
      );
      continue;
    }

    // Everything else is punctuation or an unsupported symbol. A newline is
    // emitted alone so the parser can treat it as a clause break, while other
    // punctuation greedily runs together so "..." can match before ".".
    const start = index;
    if (character === "\n") {
      index += 1;
    } else {
      while (
        index < characters.length &&
        !SPACE_CHARACTER.test(characters[index]!) &&
        !WORD_CHARACTER.test(characters[index]!) &&
        characters[index] !== "\n"
      ) {
        index += 1;
      }
    }
    lexemes.push(
      Object.freeze({
        kind: "punctuation" as const,
        text: characters.slice(start, index).join(""),
        start,
        end: index,
      }),
    );
  }

  return Object.freeze(lexemes);
}

/** Total code points covered by a lexeme run. Used to assert lossless lexing. */
export function coveredCodePoints(lexemes: readonly Lexeme[]): number {
  return lexemes.reduce((sum, lexeme) => sum + (lexeme.end - lexeme.start), 0);
}

/**
 * Grammar registry loader and conformance checks (spec §26 Gate 1).
 *
 * Construction validates the canon itself: nine root families, four modifiers,
 * every separator present, every referenced geometry id resolvable, and every
 * substitution mapping a genuine involution. A grammar that fails these checks
 * cannot be loaded, so a malformed canon is caught at startup rather than
 * producing plates that will not decode.
 */

import { PlateError } from "@studio137/plate-core";

import { geometryRegistry } from "./geometry-registry.js";
import {
  GRAMMAR_IS_PROVISIONAL,
  GRAMMAR_V1_DATA,
  GRAMMAR_VERSION,
  LITERAL_ESCAPE_GEOMETRY_ID,
  MODIFIERS,
  ROOT_FAMILIES,
  SEPARATORS,
} from "./grammar.v1.js";
import type {
  GrammarRegistry,
  LexiconEntry,
  ModifierId,
  ModifierRecord,
  RootFamilyId,
  RootFamilyRecord,
  SeparatorId,
  SeparatorRecord,
  WordClass,
} from "./grammar-types.js";

export const EXPECTED_ROOT_FAMILY_COUNT = 9;
export const EXPECTED_MODIFIER_COUNT = 4;

const ELIDED: WordClass = Object.freeze({ kind: "elided" as const });
const UNSUPPORTED: WordClass = Object.freeze({ kind: "unsupported" as const });

/**
 * Fold a source word for lexicon lookup.
 *
 * `toLowerCase()` without a locale argument is deliberate: `toLocaleLowerCase`
 * would make the Turkish dotless-i locale produce a different plate for the
 * same phrase, which spec §5.3 forbids.
 */
export function foldWord(word: string): string {
  return word.normalize("NFC").toLowerCase();
}

class VersionedGrammarRegistry implements GrammarRegistry {
  public readonly version: string;
  public readonly provisional: boolean;
  public readonly rootFamilies: readonly RootFamilyRecord[];
  public readonly modifiers: readonly ModifierRecord[];
  public readonly separators: readonly SeparatorRecord[];
  public readonly literalEscapeGeometryId: string;

  private readonly rootsById: ReadonlyMap<RootFamilyId, RootFamilyRecord>;
  private readonly modifiersById: ReadonlyMap<ModifierId, ModifierRecord>;
  private readonly separatorsById: ReadonlyMap<SeparatorId, SeparatorRecord>;
  private readonly lexicon: ReadonlyMap<string, LexiconEntry>;
  private readonly modifierWords: ReadonlyMap<string, ModifierId>;
  private readonly relationWords: ReadonlySet<string>;
  private readonly elidedWords: ReadonlySet<string>;
  private readonly punctuation: readonly (readonly [string, SeparatorId])[];
  private readonly wordsByRoot: ReadonlyMap<RootFamilyId, readonly string[]>;

  public constructor() {
    this.version = GRAMMAR_VERSION;
    this.provisional = GRAMMAR_IS_PROVISIONAL;
    this.rootFamilies = ROOT_FAMILIES;
    this.modifiers = MODIFIERS;
    this.separators = SEPARATORS;
    this.literalEscapeGeometryId = LITERAL_ESCAPE_GEOMETRY_ID;

    this.rootsById = new Map(ROOT_FAMILIES.map((record) => [record.id, record]));
    this.modifiersById = new Map(MODIFIERS.map((record) => [record.id, record]));
    this.separatorsById = new Map(SEPARATORS.map((record) => [record.id, record]));

    const lexicon = new Map<string, LexiconEntry>();
    const wordsByRoot = new Map<RootFamilyId, readonly string[]>();

    for (const [rootId, words] of Object.entries(GRAMMAR_V1_DATA.rootWords) as [
      RootFamilyId,
      readonly string[],
    ][]) {
      const folded = words.map(foldWord);
      wordsByRoot.set(rootId, Object.freeze([...folded].sort()));
      for (const word of folded) {
        const existing = lexicon.get(word);
        if (existing !== undefined && existing.root !== rootId) {
          throw new PlateError(
            "INVALID_REQUEST",
            `Lexicon conflict: "${word}" is bound to both ${existing.root} and ${rootId}`,
            { word, roots: [existing.root, rootId] },
          );
        }
        lexicon.set(word, Object.freeze({ root: rootId, modifiers: Object.freeze([]) }));
      }
    }

    this.lexicon = lexicon;
    this.wordsByRoot = wordsByRoot;
    this.modifierWords = new Map(
      Object.entries(GRAMMAR_V1_DATA.modifierWords).map(([word, modifier]) => [
        foldWord(word),
        modifier,
      ]),
    );
    this.relationWords = new Set(GRAMMAR_V1_DATA.relationWords.map(foldWord));
    this.elidedWords = new Set(GRAMMAR_V1_DATA.elidedWords.map(foldWord));
    // Longest run first so that "..." wins over "." and "--" over "-".
    this.punctuation = Object.freeze(
      [...GRAMMAR_V1_DATA.punctuationSeparators].sort((a, b) => b[0].length - a[0].length),
    );

    this.validate();
  }

  private validate(): void {
    const problems: string[] = [];

    if (this.rootFamilies.length !== EXPECTED_ROOT_FAMILY_COUNT) {
      problems.push(
        `expected ${EXPECTED_ROOT_FAMILY_COUNT} root families, found ${this.rootFamilies.length}`,
      );
    }
    if (this.modifiers.length !== EXPECTED_MODIFIER_COUNT) {
      problems.push(
        `expected ${EXPECTED_MODIFIER_COUNT} modifiers, found ${this.modifiers.length}`,
      );
    }

    const geometry = geometryRegistry();
    const referenced = [
      ...this.rootFamilies.map((record) => record.geometryId),
      ...this.modifiers.map((record) => record.geometryId),
      ...this.separators.map((record) => record.geometryId),
      this.literalEscapeGeometryId,
    ];
    for (const id of referenced) {
      if (!geometry.has(id)) {
        problems.push(`geometry id "${id}" is referenced by the grammar but not in the registry`);
      }
    }

    // Modifier slots must be distinct, or two marks would stack on one anchor.
    const slots = new Set(this.modifiers.map((record) => record.slotIndex));
    if (slots.size !== this.modifiers.length) {
      problems.push("modifier slot indices are not distinct");
    }

    // Reversible substitution requires an involution: sub(sub(x)) === x.
    // Anything else is an ambiguous substitution, forbidden in exact mode.
    for (const record of this.rootFamilies) {
      const partner = this.rootsById.get(record.substitutionPartner);
      if (partner === undefined) {
        problems.push(`root ${record.id} names an unknown partner ${record.substitutionPartner}`);
        continue;
      }
      if (partner.substitutionPartner !== record.id) {
        problems.push(
          `substitution is not an involution: ${record.id} → ${partner.id} → ${partner.substitutionPartner}`,
        );
      }
      if (partner.id === record.id && record.corruptionEligibility.substitutable) {
        problems.push(
          `root ${record.id} is self-paired and must be marked non-substitutable`,
        );
      }
    }

    // A word may not be a root and a function word at once.
    for (const word of this.lexicon.keys()) {
      if (this.modifierWords.has(word)) problems.push(`"${word}" is both a root and a modifier`);
      if (this.relationWords.has(word)) problems.push(`"${word}" is both a root and a relation`);
      if (this.elidedWords.has(word)) problems.push(`"${word}" is both a root and elided`);
    }
    for (const word of this.modifierWords.keys()) {
      if (this.relationWords.has(word)) problems.push(`"${word}" is both a modifier and a relation`);
      if (this.elidedWords.has(word)) problems.push(`"${word}" is both a modifier and elided`);
    }
    for (const word of this.relationWords) {
      if (this.elidedWords.has(word)) problems.push(`"${word}" is both a relation and elided`);
    }

    if (problems.length > 0) {
      throw new PlateError(
        "INVALID_REQUEST",
        `Grammar ${this.version} failed conformance validation`,
        { problems },
      );
    }
  }

  public root(id: RootFamilyId): RootFamilyRecord {
    const record = this.rootsById.get(id);
    if (record === undefined) {
      throw new PlateError("INVALID_REQUEST", `Unknown root family "${id}"`, { id });
    }
    return record;
  }

  public modifier(id: ModifierId): ModifierRecord {
    const record = this.modifiersById.get(id);
    if (record === undefined) {
      throw new PlateError("INVALID_REQUEST", `Unknown modifier "${id}"`, { id });
    }
    return record;
  }

  public separator(id: SeparatorId): SeparatorRecord {
    const record = this.separatorsById.get(id);
    if (record === undefined) {
      throw new PlateError("INVALID_REQUEST", `Unknown separator "${id}"`, { id });
    }
    return record;
  }

  public lookup(word: string): LexiconEntry | undefined {
    return this.lexicon.get(foldWord(word));
  }

  public classify(word: string): WordClass {
    const folded = foldWord(word);

    const entry = this.lexicon.get(folded);
    if (entry !== undefined) return Object.freeze({ kind: "root" as const, entry });

    const modifier = this.modifierWords.get(folded);
    if (modifier !== undefined) return Object.freeze({ kind: "modifier" as const, modifier });

    if (this.relationWords.has(folded)) {
      return Object.freeze({ kind: "relation" as const, separator: this.separator("relation") });
    }
    if (this.elidedWords.has(folded)) return ELIDED;

    return UNSUPPORTED;
  }

  public wordsFor(root: RootFamilyId): readonly string[] {
    return this.wordsByRoot.get(root) ?? Object.freeze([]);
  }

  public separatorForPunctuation(run: string): SeparatorRecord | undefined {
    for (const [token, separatorId] of this.punctuation) {
      if (run === token) return this.separator(separatorId);
    }
    return undefined;
  }

  /** Longest punctuation token that prefixes the given text, if any. */
  public matchPunctuationPrefix(
    text: string,
  ): Readonly<{ token: string; separator: SeparatorRecord }> | undefined {
    for (const [token, separatorId] of this.punctuation) {
      if (text.startsWith(token)) {
        return Object.freeze({ token, separator: this.separator(separatorId) });
      }
    }
    return undefined;
  }
}

export type ExtendedGrammarRegistry = GrammarRegistry &
  Readonly<{
    matchPunctuationPrefix(
      text: string,
    ): Readonly<{ token: string; separator: SeparatorRecord }> | undefined;
  }>;

let cached: ExtendedGrammarRegistry | undefined;

export function grammarRegistry(): ExtendedGrammarRegistry {
  cached ??= new VersionedGrammarRegistry();
  return cached;
}

export function createGrammarRegistry(): ExtendedGrammarRegistry {
  return new VersionedGrammarRegistry();
}

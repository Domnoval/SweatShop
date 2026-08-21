/**
 * Grammar types (spec §11.1, §26 Gate 1).
 *
 * The grammar is a finite versioned registry: nine root families, four
 * modifiers, a closed separator set, and a lexicon that binds source words to
 * roots. Anything the lexicon does not recognize becomes a literal escape node
 * rather than being discarded (spec §4.1).
 */

import type { GlyphGeometryId } from "@studio137/plate-core";

export type RootFamilyId =
  | "signal"
  | "body"
  | "persistence"
  | "void"
  | "threshold"
  | "witness"
  | "structure"
  | "transformation"
  | "duration";

export type ModifierId = "intensify" | "negate" | "collective" | "anterior";

export type SeparatorId = "clause-break" | "relation" | "mirror-axis" | "void-gap";

/** Whether a node may take part in each reversible corruption operation (spec §7.5). */
export type CorruptionEligibility = Readonly<{
  substitutable: boolean;
  reorderable: boolean;
  occludable: boolean;
  duplicable: boolean;
  decoyAdjacent: boolean;
}>;

export type MirrorEligibility = "mirrorable" | "orientation-locked";

export type RootFamilyRecord = Readonly<{
  id: RootFamilyId;
  /** Display name in the interface and the clause sheet. */
  label: string;
  /** Plain-language gloss for the decoded clause sheet. */
  gloss: string;
  geometryId: GlyphGeometryId;
  /**
   * A core semantic anchor is protected from high corruption so that
   * compositional hierarchy survives an Event Field plate (spec §7.5).
   */
  coreAnchor: boolean;
  mirrorEligibility: MirrorEligibility;
  corruptionEligibility: CorruptionEligibility;
  /**
   * Reversible substitution partner. Substitution is only permitted in exact
   * mode when the mapping is an involution, so decoding is unambiguous.
   */
  substitutionPartner: RootFamilyId;
}>;

export type ModifierRecord = Readonly<{
  id: ModifierId;
  label: string;
  gloss: string;
  geometryId: GlyphGeometryId;
  /** Which modifier slot on the host root this mark occupies. */
  slotIndex: number;
  /** Relative size against the host root's viewBox. */
  scale: number;
}>;

export type SeparatorRecord = Readonly<{
  id: SeparatorId;
  label: string;
  gloss: string;
  geometryId: GlyphGeometryId;
  /** Advance width relative to a root glyph, used by layout spacing. */
  advance: number;
}>;

export type LexiconEntry = Readonly<{
  root: RootFamilyId;
  modifiers: readonly ModifierId[];
}>;

/**
 * How the lexer should treat one normalized source word.
 *
 * `unsupported` is not a failure — it routes the word into a literal escape
 * node so that nothing the artist typed is silently dropped (spec §4.1).
 */
export type WordClass =
  | Readonly<{ kind: "root"; entry: LexiconEntry }>
  | Readonly<{ kind: "modifier"; modifier: ModifierId }>
  | Readonly<{ kind: "relation"; separator: SeparatorRecord }>
  | Readonly<{ kind: "elided" }>
  | Readonly<{ kind: "unsupported" }>;

export interface GrammarRegistry {
  readonly version: string;
  /** True until `grammar-v1.md` is signed off by the artist (spec §26 Gate 1). */
  readonly provisional: boolean;
  readonly rootFamilies: readonly RootFamilyRecord[];
  readonly modifiers: readonly ModifierRecord[];
  readonly separators: readonly SeparatorRecord[];
  /** Geometry used to frame literal escape payloads. */
  readonly literalEscapeGeometryId: GlyphGeometryId;

  root(id: RootFamilyId): RootFamilyRecord;
  modifier(id: ModifierId): ModifierRecord;
  separator(id: SeparatorId): SeparatorRecord;
  /** Look up a normalized source word. Returns undefined for unsupported tokens. */
  lookup(word: string): LexiconEntry | undefined;
  /** Full lexical classification, including modifier, relation, and elided glue. */
  classify(word: string): WordClass;
  /** Every source word bound to a given root, for the clause sheet. */
  wordsFor(root: RootFamilyId): readonly string[];
  /** The separator a punctuation run maps to, if any. */
  separatorForPunctuation(run: string): SeparatorRecord | undefined;
}

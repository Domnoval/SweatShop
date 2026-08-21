/**
 * Studio 137 grammar, version `grammar/v1`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *  PROVISIONAL — NOT ARTIST-APPROVED
 *
 *  Spec Phase 0 requires the nine root families, four modifiers, separators,
 *  clause rules, and mirrored-sequence behavior to be gathered from the State
 *  Bible and signed off before `grammar-v1.md` is published. The canon below is
 *  a working reconstruction that exercises every structure the compiler must
 *  support, so that Phases 2–9 can be built and verified now.
 *
 *  The artist's canon replaces this file's *data*. No engine reads a root
 *  family by name; everything resolves through this registry.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import type {
  LexiconEntry,
  ModifierId,
  ModifierRecord,
  RootFamilyId,
  RootFamilyRecord,
  SeparatorId,
  SeparatorRecord,
} from "./grammar-types.js";

export const GRAMMAR_VERSION = "grammar/v1";
export const GRAMMAR_IS_PROVISIONAL = true;

const allCorruptible = Object.freeze({
  substitutable: true,
  reorderable: true,
  occludable: true,
  duplicable: true,
  decoyAdjacent: true,
});

export const ROOT_FAMILIES: readonly RootFamilyRecord[] = Object.freeze([
  {
    id: "signal",
    label: "SIGNAL",
    gloss: "transmission, message, that which is sent",
    geometryId: "root-signal",
    // A plate whose signal glyph is fully buried says nothing; the family
    // resists occlusion even in an Event Field.
    coreAnchor: true,
    // The radiating arcs carry direction. Mirroring them reverses the sense of
    // transmission, so orientation is locked.
    mirrorEligibility: "orientation-locked",
    corruptionEligibility: Object.freeze({ ...allCorruptible, occludable: false }),
    substitutionPartner: "witness",
  },
  {
    id: "body",
    label: "BODY",
    gloss: "vessel, flesh, the container that carries",
    geometryId: "root-body",
    coreAnchor: false,
    mirrorEligibility: "mirrorable",
    corruptionEligibility: allCorruptible,
    substitutionPartner: "threshold",
  },
  {
    id: "persistence",
    label: "PERSISTENCE",
    gloss: "survival, endurance, that which remains",
    geometryId: "root-persistence",
    coreAnchor: false,
    mirrorEligibility: "mirrorable",
    corruptionEligibility: allCorruptible,
    substitutionPartner: "duration",
  },
  {
    id: "void",
    label: "VOID",
    gloss: "absence, silence, the unwritten",
    geometryId: "root-void",
    coreAnchor: true,
    // The position of the ring's gap is the glyph's meaning.
    mirrorEligibility: "orientation-locked",
    // Duplicating an absence produces no additional reading.
    corruptionEligibility: Object.freeze({ ...allCorruptible, duplicable: false }),
    substitutionPartner: "structure",
  },
  {
    id: "threshold",
    label: "THRESHOLD",
    gloss: "boundary, gate, the place of crossing",
    geometryId: "root-threshold",
    coreAnchor: false,
    mirrorEligibility: "mirrorable",
    corruptionEligibility: allCorruptible,
    substitutionPartner: "body",
  },
  {
    id: "witness",
    label: "WITNESS",
    gloss: "observation, knowing, the one who receives",
    geometryId: "root-witness",
    coreAnchor: false,
    mirrorEligibility: "mirrorable",
    corruptionEligibility: allCorruptible,
    substitutionPartner: "signal",
  },
  {
    id: "structure",
    label: "STRUCTURE",
    gloss: "order, lattice, law, the arrangement of parts",
    geometryId: "root-structure",
    coreAnchor: false,
    mirrorEligibility: "mirrorable",
    corruptionEligibility: allCorruptible,
    substitutionPartner: "void",
  },
  {
    id: "transformation",
    label: "TRANSFORMATION",
    gloss: "becoming, burning, irreversible change",
    geometryId: "root-transformation",
    coreAnchor: true,
    mirrorEligibility: "mirrorable",
    // Nine families cannot pair off evenly. Transformation is the unpaired
    // family, so it has no involution and is never substituted — an ambiguous
    // substitution would break exact decoding (spec §2.1).
    corruptionEligibility: Object.freeze({ ...allCorruptible, substitutable: false }),
    substitutionPartner: "transformation",
  },
  {
    id: "duration",
    label: "DURATION",
    gloss: "time, cycle, return, the long interval",
    geometryId: "root-duration",
    coreAnchor: false,
    // The radii read as hands; mirroring reverses the direction of the cycle.
    mirrorEligibility: "orientation-locked",
    corruptionEligibility: allCorruptible,
    substitutionPartner: "persistence",
  },
] satisfies readonly RootFamilyRecord[]);

export const MODIFIERS: readonly ModifierRecord[] = Object.freeze([
  {
    id: "intensify",
    label: "INTENSIFY",
    gloss: "amplified, absolute, at full magnitude",
    geometryId: "mod-intensify",
    slotIndex: 0,
    scale: 0.34,
  },
  {
    id: "negate",
    label: "NEGATE",
    gloss: "inverted, denied, the root turned against itself",
    geometryId: "mod-negate",
    slotIndex: 1,
    scale: 0.34,
  },
  {
    id: "collective",
    label: "COLLECTIVE",
    gloss: "plural, many, the root held in common",
    geometryId: "mod-collective",
    slotIndex: 2,
    scale: 0.3,
  },
  {
    id: "anterior",
    label: "ANTERIOR",
    gloss: "prior, already elapsed, the root in the past",
    geometryId: "mod-anterior",
    slotIndex: 3,
    scale: 0.32,
  },
] satisfies readonly ModifierRecord[]);

export const SEPARATORS: readonly SeparatorRecord[] = Object.freeze([
  {
    id: "clause-break",
    label: "CLAUSE BREAK",
    gloss: "end of a clause",
    geometryId: "sep-clause-break",
    advance: 0.55,
  },
  {
    id: "relation",
    label: "RELATION",
    gloss: "binds two roots into one reading",
    geometryId: "sep-relation",
    advance: 0.7,
  },
  {
    id: "mirror-axis",
    label: "MIRROR AXIS",
    gloss: "the axis a mirrored passage reflects across",
    geometryId: "sep-mirror-axis",
    advance: 0.6,
  },
  {
    id: "void-gap",
    label: "VOID GAP",
    gloss: "an interval of deliberate silence",
    geometryId: "sep-void-gap",
    advance: 0.9,
  },
] satisfies readonly SeparatorRecord[]);

export const LITERAL_ESCAPE_GEOMETRY_ID = "frame-literal-escape";

/**
 * Source words bound to each root family.
 *
 * Lookup is case-folded and NFC-normalized by the lexer. A word absent from
 * every table below becomes a literal escape node — it is never dropped.
 */
const ROOT_WORDS: Readonly<Record<RootFamilyId, readonly string[]>> = Object.freeze({
  signal: Object.freeze([
    "signal", "signals", "message", "messages", "transmission", "broadcast", "wave",
    "waves", "voice", "voices", "word", "words", "call", "calls", "sound", "song",
    "frequency", "current", "pulse", "speak", "speaks", "spoke", "say", "says", "said",
    "tell", "tells", "told", "sends", "send", "sent", "cry", "name", "names",
  ]),
  body: Object.freeze([
    "body", "bodies", "flesh", "vessel", "vessels", "shell", "host", "skin", "bone",
    "bones", "blood", "heart", "hand", "hands", "mouth", "matter", "substance",
    "corpus", "form", "self", "machine", "meat", "husk", "torso",
  ]),
  persistence: Object.freeze([
    "survive", "survives", "survived", "endure", "endures", "endured", "remain",
    "remains", "remained", "persist", "persists", "hold", "holds", "held", "last",
    "lasts", "continue", "continues", "keep", "keeps", "kept", "stay", "stays",
    "outlive", "outlives", "carry", "carries", "carried", "withstand", "abide",
  ]),
  void: Object.freeze([
    "void", "nothing", "none", "absence", "empty", "emptiness", "silence", "silent",
    "gone", "lost", "dark", "darkness", "null", "without", "hollow", "blank", "erased",
    "missing", "vanish", "vanished", "unwritten",
  ]),
  threshold: Object.freeze([
    "threshold", "door", "doors", "gate", "gates", "edge", "edges", "border",
    "boundary", "passage", "crossing", "cross", "crosses", "crossed", "limit", "veil",
    "portal", "seam", "membrane", "wall", "walls", "opening", "breach", "enter",
    "enters", "leave", "leaves",
  ]),
  witness: Object.freeze([
    "witness", "witnesses", "see", "sees", "saw", "seen", "watch", "watches",
    "observe", "observes", "know", "knows", "knew", "known", "eye", "eyes", "look",
    "looks", "read", "reads", "remember", "remembers", "record", "records", "testify",
    "aware", "attend", "mark", "marks", "found", "find", "finds",
  ]),
  structure: Object.freeze([
    "structure", "order", "pattern", "patterns", "lattice", "system", "systems",
    "law", "laws", "grid", "architecture", "code", "rule", "rules", "frame",
    "framework", "geometry", "array", "scaffold", "arrangement", "constant",
  ]),
  transformation: Object.freeze([
    "transform", "transforms", "become", "becomes", "became", "change", "changes",
    "changed", "burn", "burns", "burned", "fire", "turn", "turns", "turned", "forge",
    "forges", "make", "makes", "made", "dissolve", "dissolves", "rise", "rises",
    "rose", "break", "breaks", "broke", "broken", "collapse", "ignite", "convert",
  ]),
  duration: Object.freeze([
    "time", "times", "always", "forever", "again", "cycle", "cycles", "return",
    "returns", "returned", "year", "years", "day", "days", "night", "nights",
    "moment", "moments", "still", "eternal", "duration", "age", "ages", "hour",
    "hours", "season", "seasons",
  ]),
});

/** Function words that bind a modifier to the root that follows them. */
const MODIFIER_WORDS: Readonly<Record<string, ModifierId>> = Object.freeze({
  not: "negate",
  no: "negate",
  never: "negate",
  nor: "negate",
  un: "negate",
  cannot: "negate",

  all: "collective",
  every: "collective",
  many: "collective",
  both: "collective",
  we: "collective",
  they: "collective",
  us: "collective",
  them: "collective",
  our: "collective",
  their: "collective",
  each: "collective",

  very: "intensify",
  more: "intensify",
  most: "intensify",
  deep: "intensify",
  deeper: "intensify",
  great: "intensify",
  utterly: "intensify",
  entirely: "intensify",
  wholly: "intensify",
  only: "intensify",

  was: "anterior",
  were: "anterior",
  had: "anterior",
  been: "anterior",
  once: "anterior",
  ancient: "anterior",
  old: "anterior",
  before: "anterior",
  already: "anterior",
  former: "anterior",
});

/** Function words that read as a relation separator between roots. */
const RELATION_WORDS: readonly string[] = Object.freeze([
  "of", "to", "into", "from", "with", "through", "between", "upon", "against",
  "toward", "towards", "and", "or", "for", "by", "in", "on", "at", "over", "under",
  "within", "beyond", "across", "beneath", "above", "after", "beside", "past",
]);

/**
 * Grammatical glue with no semantic glyph.
 *
 * These are elided from the *plate*, not discarded from the record: the lexer
 * emits an explicit elided token, the clause sheet lists them, and the exact
 * source is preserved verbatim in the manifest regardless (spec §4.1).
 */
const ELIDED_WORDS: readonly string[] = Object.freeze([
  "the", "a", "an", "is", "are", "am", "be", "being", "it", "its", "this", "that",
  "these", "those", "there", "here", "as", "so", "but", "if", "then", "than",
  "which", "who", "whom", "whose", "do", "does", "did", "has", "have", "will",
  "shall", "can", "may", "must", "would", "could", "should", "i", "you", "he",
  "she", "his", "her", "my", "your", "what", "when", "where", "why", "how",
]);

/** Punctuation runs that map to a separator. */
const PUNCTUATION_SEPARATORS: readonly (readonly [string, SeparatorId])[] = Object.freeze([
  ["...", "void-gap"],
  ["…", "void-gap"],
  ["--", "mirror-axis"],
  ["—", "mirror-axis"],
  ["|", "mirror-axis"],
  [".", "clause-break"],
  ["!", "clause-break"],
  ["?", "clause-break"],
  [";", "clause-break"],
  ["\n", "clause-break"],
  [",", "relation"],
  [":", "relation"],
  ["/", "relation"],
]);

export const GRAMMAR_V1_DATA = Object.freeze({
  rootWords: ROOT_WORDS,
  modifierWords: MODIFIER_WORDS,
  relationWords: RELATION_WORDS,
  elidedWords: ELIDED_WORDS,
  punctuationSeparators: PUNCTUATION_SEPARATORS,
});

export type { LexiconEntry };

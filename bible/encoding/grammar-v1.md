# Grammar v1

**Status: PROVISIONAL — not artist-approved.**
**Version identifier: `grammar/v1`**

> This document does not yet carry the authority the specification intends for
> it. Spec Phase 0 requires the nine root families, four modifiers, separators,
> clause rules, and mirrored-sequence behaviour to be gathered from the State
> Bible and signed off before `grammar-v1.md` is published.
>
> What follows describes the working canon currently encoded in
> `packages/glyph-registry/src/grammar.v1.ts`. It exists so that the compiler,
> the layout solvers, the corruption engine, and the verification gates could be
> built and tested against a complete grammar rather than a stub.
>
> **When the artist's canon arrives, this document becomes the authority and the
> registry data is updated to match it.** Because a released grammar version is
> immutable, a real canon lands as `grammar/v2`, not as an edit to v1.

---

## 1. Root families

Nine root families. Every phrase resolves to some sequence of these, or to
literal escapes for material the grammar does not claim.

| Family | Gloss | Geometry | Core anchor | Mirror | Substitution partner |
| --- | --- | --- | --- | --- | --- |
| SIGNAL | transmission, message, that which is sent | `root-signal` | yes | orientation-locked | WITNESS |
| BODY | vessel, flesh, the container that carries | `root-body` | no | mirrorable | THRESHOLD |
| PERSISTENCE | survival, endurance, that which remains | `root-persistence` | no | mirrorable | DURATION |
| VOID | absence, silence, the unwritten | `root-void` | yes | orientation-locked | STRUCTURE |
| THRESHOLD | boundary, gate, the place of crossing | `root-threshold` | no | mirrorable | BODY |
| WITNESS | observation, knowing, the one who receives | `root-witness` | no | mirrorable | SIGNAL |
| STRUCTURE | order, lattice, law, the arrangement of parts | `root-structure` | no | mirrorable | VOID |
| TRANSFORMATION | becoming, burning, irreversible change | `root-transformation` | yes | mirrorable | *(none — self-paired)* |
| DURATION | time, cycle, return, the long interval | `root-duration` | no | orientation-locked | PERSISTENCE |

### Core anchors

A core anchor resists occlusion even in an Event Field. A plate whose SIGNAL
glyph is fully buried says nothing, so hierarchy is protected structurally
rather than by taste (spec §7.5).

Separately, the **first root of every clause** is marked as that clause's
anchor by the parser, regardless of family.

### Orientation locking

`orientation-locked` families carry direction in their geometry and are never
mirrored:

- **SIGNAL** — the radiating arcs have a sense; mirroring reverses transmission.
- **VOID** — the position of the ring's gap *is* the glyph's meaning.
- **DURATION** — the radii read as hands; mirroring reverses the cycle.

### Substitution is an involution

Reversible substitution maps a family to its partner and back. Nine families
cannot pair off evenly, so **TRANSFORMATION** is the unpaired family: it has no
partner and is marked non-substitutable. An ambiguous substitution would make
exact decoding impossible, which spec §2.1 forbids outright.

The registry validates this at load: `substitutionPartner` must be symmetric,
and any self-paired family must be non-substitutable.

---

## 2. Modifiers

Four modifiers. Each occupies a distinct slot on its host root, so two marks
never stack on one anchor.

| Modifier | Gloss | Geometry | Slot | Scale |
| --- | --- | --- | --- | --- |
| INTENSIFY | amplified, absolute, at full magnitude | `mod-intensify` | 0 | 0.34 |
| NEGATE | inverted, denied, the root turned against itself | `mod-negate` | 1 | 0.34 |
| COLLECTIVE | plural, many, the root held in common | `mod-collective` | 2 | 0.30 |
| ANTERIOR | prior, already elapsed, the root in the past | `mod-anterior` | 3 | 0.32 |

### Binding

A modifier word binds to the **next** root in the clause. Modifiers still
pending when a clause closes bind backward to that clause's last root and raise
a `TRAILING_MODIFIER_REBOUND` warning; with no root at all in the clause they
are recorded as unbound and raise `UNBOUND_MODIFIER`.

Modifier order is not meaningful. `not all signal` and `all not signal` resolve
to the same semantic unit, because the unit's identity sorts its modifiers.
A repeated modifier collapses — saying NEGATE twice says nothing extra.

### Modifier words

- **NEGATE** — not, no, never, nor, un, cannot
- **COLLECTIVE** — all, every, many, both, we, they, us, them, our, their, each
- **INTENSIFY** — very, more, most, deep, deeper, great, utterly, entirely, wholly, only
- **ANTERIOR** — was, were, had, been, once, ancient, old, before, already, former

---

## 3. Separators

| Separator | Gloss | Geometry | Advance | Source |
| --- | --- | --- | --- | --- |
| CLAUSE BREAK | end of a clause | `sep-clause-break` | 0.55 | `.` `!` `?` `;` newline |
| RELATION | binds two roots into one reading | `sep-relation` | 0.70 | `,` `:` `/` and relation words |
| MIRROR AXIS | the axis a mirrored passage reflects across | `sep-mirror-axis` | 0.60 | `\|` `--` `—` |
| VOID GAP | an interval of deliberate silence | `sep-void-gap` | 0.90 | `...` `…` |

Punctuation runs match longest-first, so `...` resolves to VOID GAP rather than
three clause breaks.

### Relation words

of, to, into, from, with, through, between, upon, against, toward, towards,
and, or, for, by, in, on, at, over, under, within, beyond, across, beneath,
above, after, beside, past

---

## 4. Clause structure

A clause is a run of nodes terminated by a clause break. A clause containing a
mirror axis becomes a **mirrored sequence**: the two halves oppose each other
across the axis.

Each clause records its authored reading order before any corruption
permutation. That record is what makes a scrambled plate recoverable.

---

## 5. Elision and literal escape

Spec §4.1 forbids discarding unsupported words or characters. Two mechanisms
keep that promise without cluttering the plate:

**Elided glue** — articles, copulas, and auxiliaries carry no glyph. They are
recorded as elided nodes, appear in the clause sheet and the manifest's token
mappings, and occupy no space. `THE SIGNAL SURVIVES THE BODY` therefore
compiles to three glyphs, not five.

Elided words: the, a, an, is, are, am, be, being, it, its, this, that, these,
those, there, here, as, so, but, if, then, than, which, who, whom, whose, do,
does, did, has, have, will, shall, can, may, must, would, could, should, i,
you, he, she, his, her, my, your, what, when, where, why, how

**Literal escape** — anything the lexicon does not claim is framed in a
cartouche (`frame-literal-escape`). The escape node stores only a **code-point
count**; the text itself lives solely in the encrypted manifest, so a plate
containing an unknown word never displays it and never leaks it.

Adjacent unsupported runs merge into a single cartouche rather than framing
every unknown word separately.

---

## 6. Word folding

Lookup folds with `toLowerCase()` and NFC normalization. The locale-independent
form is deliberate: `toLocaleLowerCase` under a Turkish locale folds `I` to a
dotless `ı` and would produce a different plate for the same phrase, which spec
§5.3 forbids.

A word may belong to exactly one category. The registry refuses to load a
lexicon where a word is both a root and a function word, or appears under two
root families.

---

## 7. What the artist still owns

Everything above is a placeholder for a decision the artist has not yet made:

1. Which nine root families the State Bible actually names, and their glosses.
2. Which four modifiers, and what each one does to a root.
3. The real separator inventory and its punctuation mapping.
4. Which families are core anchors, and which are orientation-locked.
5. The substitution pairing — including which family is the unpaired one.
6. The lexicon: which source words map to which root.
7. Whether elision is acceptable at all, or whether glue should carry a glyph.

Until those are settled, `grammarRegistry().provisional` returns `true` and
every plate compiled by this build should be treated as a test print.

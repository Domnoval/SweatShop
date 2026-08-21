# Glossary

Plain definitions for every term this project uses. If a word in a spec, a
commit message, or a code comment isn't defined here, it should be.

---

## The three systems

### The Forge

`symbolpaintermk137.html` — a single-file working tool. You type a phrase, it
hashes the phrase deterministically, and composes a symbol from that hash. It
carries the real semantic vocabulary: **19 concepts** (solar, lunar, fire,
water, air, earth, chaos, order, union, descent, return, threshold, cosmos,
time, spirit, war, love, mind, shadow) and roughly 170 synonyms that resolve
into them. Unmatched input falls through to an honest
`uncharted · hashed correspondence`.

Not in this repository. Lives in `Domnoval/137-studio`.

### Phrase-to-Plate

This repository. Built from `studio137phrasetoplatetechnicalspec.md`. Same
premise as the Forge — phrase in, art out — with guarantees the Forge does not
make: byte-identical output across machines, encrypted recovery of the source
phrase, and verification gates that run in CI.

### The Canon

What is officially true about Studio 137, decided by the artist. Not inferred
by a tool, not invented by a spec.

As of this writing the canon is the **State Bible**: four binary levers
(SIGNAL, LUMEN, FLORA, DECAY), the sixteen states they produce
(0000 PRIMROSE … 1111 IT), and the signet system — a ring with four slots
(N·SIGNAL wave, E·LUMEN disc, S·FLORA sprout, W·DECAY crack), each mark solid
when its lever is 1 and hollow when it is 0.

---

## Terms

### Plate

One finished, printable art piece. The output of a compile. "Plate" is the
printing term for a single printed sheet — nothing more esoteric than that.

### Glyph

One drawn mark. A single symbol with authored vector geometry. The sixteen
signets are glyphs.

### Grammar

The rulebook mapping meaning to glyphs and defining how glyphs combine.

The Forge's grammar is canon (19 concepts, ~170 synonyms). The grammar
currently in `packages/glyph-registry/src/grammar.v1.ts` — nine root families
and four modifiers — **is not canon.** It appears in the technical spec, but it
appears nowhere in the State Bible and nowhere in the Forge. It was invented by
the spec. It reports `provisional: true` for exactly this reason.

Every engine in this repository is written so that no code reads a root family
by name or reasons about a glyph's shape. Replacing the grammar is a data edit
in one package.

### Engine

Used at two scales in conversation, which is a source of confusion. Prefer
these:

- **Package** (small) — one workspace package doing one job. This repo has
  eleven: `plate-core`, `glyph-registry`, `glyph-engine`, `substrate-engine`,
  `layout-engine`, `corruption-engine`, `render-svg`, `render-raster`,
  `private-manifest`, `artifact-security`, `plate-compiler`. Several are named
  `*-engine` for historical reasons; they are packages.
- **System** (large) — a complete phrase-to-artwork pipeline. There are two:
  the Forge and Phrase-to-Plate.

When a document says "the two engines," it means the two *systems*.

### Phase

A numbered step in the technical spec's build roadmap (§27).

| Phase | Name | State |
| --- | --- | --- |
| 0 | Canon audit | **Not done — requires the artist** |
| 1 | Canonical glyph registry | **Not done — requires the artist** |
| 2 | Semantic compiler core | Built |
| 3 | Deterministic random system | Built |
| 4 | First layout and substrate | Built |
| 5 | Canonical SVG renderer | Built |
| 6 | Corruption and decoys | Built |
| 7 | Artifact pipeline | Built |
| 8 | Interactive editor | Not started |
| 9 | Security and reproducibility | Built |
| 10 | Physical proof (real printing) | Not started |
| 11 | Expansion | Not started |

Phases 0 and 1 are the two the artist must decide. They were skipped and
placeholders were substituted. That is the central open problem in this
repository.

---

## Status words

Borrowed from the Derivation Codex legend so that project status is described
in the studio's own vocabulary.

| Word | Meaning |
| --- | --- |
| **Working** | Built, runs, covered by tests. |
| **Ported** | Exists as original standalone HTML; would need conversion to run here. |
| **Partial** | Some of it exists and some does not. Stated with the missing part named. |
| **Control** | Present on purpose with no rule behind it. The codex's own term for an honest exception. |
| **Proven** | A specific, narrow claim: an independent machine ran the code and produced byte-identical output. Not "looks right" — identical files. |

**Control** currently applies to exactly one thing: the nine root families.
Rule behind it: none. Traces to: nothing in canon.

---

## Terms of art in the code

### Central invariant

Canonical payload glyphs are authored vector geometry. Layout, substrate,
corruption, decoys, and atmosphere may position, transform, mask, surround, or
obscure them. They may **never** redraw or mutate path data.

The package dependency graph enforces this rather than documenting it: the
layout solver is never handed path commands, the substrate sampler has no
method returning a glyph, and the corruption engine receives node identifiers
only.

### Exact vs stylized mode

**Exact** guarantees the source phrase can be recovered byte-for-byte from the
sealed artifact; only invertible operations and non-destructive masking are
permitted. **Stylized** permits destructive corruption and makes no recovery
guarantee.

### Determinism

Identical phrase + seed + parameters + version contract produces byte-identical
artifacts, on any machine. Achieved with pure-TypeScript SHA-256 (so a browser
preview and a Node export agree bit for bit), `xoshiro128**` with committed
reference vectors, domain-separated seed derivation, and five isolated named
random streams. No `Math.random`, no clock, no UUIDs, no locale-dependent
ordering.

### Verification gates

The six automatable checks from spec §26, implemented in `tests/`. Gate 7 is a
human judgement and is not automatable.

### Public vs private artifacts

**Public** artifacts (SVG, print composition, PNG) must contain no trace of the
source phrase. **Private** artifacts (the `.s137` manifest, the clause sheet)
contain the phrase and are encrypted. `exportPublic` and `exportPrivate` are
separate functions with separate return types, so the public path structurally
cannot return a private artifact. The two must never travel in the same bundle.

### `.s137` container

The sealed private manifest. AES-256-GCM with HKDF-SHA-256 key derivation,
header-authenticated binding to its plate, and fail-closed decoding. The
phrase seed is never used as an encryption key.

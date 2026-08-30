# assets/

## `symbol-painter-claude-ultra-handoff.md`

A mobile redesign and interaction specification for **Symbol Painter / MK·137**,
prepared by an outside agent (Higgsfield). Committed here verbatim, unedited, as
the reference spec of record.

Read it as a **design and interaction reference, not a literal build order.** It
was written against an application that is not this repository, and several of
its assumptions do not hold here. Specifically:

### The application it describes has no source

The handoff targets `https://sigilpainter.netlify.app/` and assumes a browser
app with React-style UI state, routing, IndexedDB persistence, and URL state.

No such codebase was found. Searched and ruled out:

- This repository — every commit on every branch. No `.tsx`, `.jsx`, `.css`, or
  `.html` file has ever existed here; no UI framework is or was a dependency.
  None of the spec's distinctive vocabulary (`Phyllotaxis`, `Cymatic`,
  `COMPOSE FROM STORY`, `MK·137`, `IndexedDB`) appears anywhere in history.
- `Domnoval/137-studio` — named by [`bible/GLOSSARY.md`](../bible/GLOSSARY.md)
  as the home of `symbolpaintermk137.html`. It is a Next.js portfolio site with
  no Symbol Painter code. **That glossary reference is stale.**
- `Domnoval/Sigil-Jigglin` — unrelated.

Higgsfield independently confirmed they do not hold the source either. The
handoff document is the entire deliverable.

## `symbolpaintermk137.html`

The Forge itself, committed for reference. A single-file SVG instrument: 1,005
lines, no dependencies, no build step.

**Correction to an earlier claim in this file.** It previously stated that the
canon grammar would be "the Forge's 19 concepts," landing as `grammar/v2` and
resolving this project's Phase 0 blocker. That was wrong, and it was written
before the Forge's source was available. The source is now here, and it shows
the two systems are not the same kind of machine.

[`bible/GLOSSARY.md`](../bible/GLOSSARY.md) is accurate on the arithmetic —
there are exactly 19 concepts and exactly 170 synonyms. But those concepts do
not name glyphs. Each maps to a *composition recipe*:

```js
solar:{mode:"phyllotaxis",arch:"mandala",palette:"bone",
       brushes:["geometry","astro","alchemy"],planet:"sol",
       words:["SOL","LUX","SORATH"],fold:12}
```

Engine, architecture, palette, symbol families, kamea, magic words, symmetry
fold. No drawn mark anywhere in it.

| | Phrase-to-Plate (this repo) | The Forge |
| --- | --- | --- |
| Grammar maps a word to | one authored glyph | a whole composition recipe |
| Kind of system | logographic | correspondence (777-style) |
| Reversible | yes — exact mode decodes to the source phrase | no |
| Marks come from | authored vector geometry, locked and hashed | Unicode pools in Noto fonts, 16 procedural figures, kamea sigil paths |

So the Forge's correspondence table belongs in this project's **presentation**
layer, not its glyph registry — `mode` corresponds to a layout family,
`palette` to a palette, `fold` to symmetry. Dropping it into
`packages/glyph-registry` would be a category error.

**This project's glyph vocabulary remains unsolved.** The Forge does not supply
it. What the Forge does supply is the closest available seed geometry: 16
authored vector marks in its `GEO` table — `vesica`, `seed`, `flower`,
`metatron`, `merkaba`, `pentagram`, `hexagram`, `unicursal`, `triquetra`,
`triskele`, `vegvisir`, `valknut`, `eye`, `ankh`, `spiral`, `monad`. These are
sacred-geometry figures with no assigned meanings, not a logography.

One production hazard worth recording: the `alchemy`, `astro`, `runic`,
`hebrew`, `hiero`, and `trigram` pools are Unicode codepoints rendered through
Noto font families with Segoe fallbacks. Any print path must convert them to
outlines first, or output depends on which fonts the rendering machine happens
to have.

### Decisions that stand

| Decision | Consequence |
| --- | --- |
| **One rendering path — always `compilePlate()`** | No separate preview renderer. Nothing can drift from what prints. Live interaction is throttled rather than approximated. |
| **Canonical artwork state is the compiler's request contract** | The spec's canonical/UI state split maps onto the existing Zod `PlateRequest`, not a new parallel model. |
| **First physical product is garment** | DTG, DTF, and all-over print, across multiple garment base colours. The current 24×36 poster templates are not sufficient, and art may not assume a ground colour. See the README's Phase 10 gap: `minimumPrintStrokePt: 0.75` is unvalidated and no template is `physicallyValidated`. |

Where the handoff and this repository conflict, the conflict is documented and
the least destructive compliant approach is chosen — the spec is not followed
into changes that would break determinism, the verification gates, or the
public/private artifact separation.

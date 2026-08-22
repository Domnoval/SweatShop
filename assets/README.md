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

### Decisions taken that diverge from the spec

The interactive painter is being built here, as this repository's unstarted
Phase 8 editor, driving the existing deterministic compiler. Four decisions are
settled and take precedence over the handoff where they conflict:

| Decision | Consequence |
| --- | --- |
| **Canon grammar is the Forge's 19 concepts**, not the spec's 9 root families | Lands as `grammar/v2`. Resolves the Phase 0 blocker named in the README. Requires authored geometry for the full concept set. |
| **One rendering path — always `compilePlate()`** | No separate preview renderer. Nothing can drift from what prints. Live interaction is throttled rather than approximated. |
| **Canonical artwork state is the compiler's request contract** | The spec's canonical/UI state split maps onto the existing Zod `PlateRequest`, not a new parallel model. |
| **First physical product is garment (DTG/DTF)** | The current 24×36 poster templates are not sufficient. See the README's Phase 10 gap: `minimumPrintStrokePt: 0.75` is unvalidated and no template is `physicallyValidated`. |

Where the handoff and this repository conflict, the conflict is documented and
the least destructive compliant approach is chosen — the spec is not followed
into changes that would break determinism, the verification gates, or the
public/private artifact separation.

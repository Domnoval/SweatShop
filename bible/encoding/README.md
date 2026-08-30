# The encoding bible

Canon documents for the Phrase-to-Plate compiler.

| Document | Covers | Status |
| --- | --- | --- |
| [`grammar-v1.md`](./grammar-v1.md) | Root families, modifiers, separators, clause rules, lexicon | **Provisional** |
| [`geometry-registry.md`](./geometry-registry.md) | Locked glyph geometry, anchors, envelopes, print minimums | **Provisional** |
| [`substrate-registry.md`](./substrate-registry.md) | The six mathematical substrates | Stable |
| [`corruption-classification.md`](./corruption-classification.md) | Operation classes, bands, eligibility | **Provisional** |

A document marked provisional describes what the code currently does. When the
artist's canon arrives, the document becomes the authority and the registry data
is updated to match it — and because released versions are immutable, that lands
as a new version rather than an edit.

Spec Phase 0 exits when `grammar-v1.md` and `corruption-classification.md` are
artist-approved. Phase 1 exits when every semantic unit resolves to approved
immutable vector geometry.

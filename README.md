# Studio 137 — Phrase-to-Plate Generator

A deterministic semantic glyph compiler and production-art renderer.

**This is not an AI image generator and does not behave like one.** It is a
compiler:

```
Phrase + seed + parameters
        ↓
Versioned semantic/logographic grammar
        ↓
Immutable canonical glyph AST
        ↓
Deterministic layout and presentation plan
        ↓
Locked vector scene
        ↓
Public and private artifact pipelines
```

The same phrase, seed, parameters, and version contract always produce the same
plate, byte for byte. An exact-mode plate can always be decoded back to the
original UTF-8 phrase. And the authored glyph vectors are never redrawn —
layout, substrate, corruption, decoys, and atmosphere may position, transform,
mask, surround, or obscure them, but never edit their path data.

---

## ⚠ The canon is provisional

The specification names the real bottleneck plainly:

> The primary creative bottleneck is not React or file export. It is freezing
> the grammar and producing canonical authored glyph geometry. If those are
> rushed, the result becomes another decorative sigil generator regardless of
> technical sophistication.

The State Bible grammar and the artist-drawn glyph vectors are **not in this
repository**. What is here is everything that *isn't* canon: the compiler, the
registries, the solvers, the renderer, the encryption, and the verification
gates — built so the canon drops in as data.

- `grammarRegistry().provisional === true`
- `geometryRegistry().provisional === true`

Every plate this build produces should be treated as a test print. See
[`bible/encoding/`](./bible/encoding/) for exactly what the artist still owns.

New to the vocabulary? [`bible/GLOSSARY.md`](./bible/GLOSSARY.md) defines every
term this project uses — canon, plate, glyph, grammar, engine, phase — in plain
language.

---

## Quick start

```bash
pnpm install

# Generate the artist master key once. Back it up outside this repository —
# losing it makes every manifest permanently unreadable.
pnpm s137 keygen --out .keys/master.key

# Compile the permanent golden fixture (spec §29) to all five artifact classes.
pnpm golden --key .keys/master.key

# Recover the exact source phrase from the sealed manifest.
pnpm s137 decode --manifest artifacts/golden-signal.private.s137 --key .keys/master.key
```

Compile your own:

```bash
pnpm s137 compile \
  --phrase "THE SIGNAL SURVIVES THE BODY" \
  --seed "any-string" \
  --density 55 \
  --corruption 25 \
  --layout concentric-rings \
  --substrate alpha-radial-lattice \
  --preset poster-24x36 \
  --mode exact \
  --key .keys/master.key
```

`--density` and `--corruption` are on the 0–100 interface scale, like the
editor's sliders. Add `--no-png` to skip 300 DPI rasterization while iterating.

### Layouts

| `--layout` | Status | Behaviour |
| --- | :---: | --- |
| `concentric-rings` | ✅ | Primary clause on the central ring, later clauses outward |
| `clause-columns` | ✅ | Vertical processional clauses, reading right to left |
| `orthogonal-wall` | ❌ | Declared in the canon, no solver in this build |
| `alpha-radial` | ❌ | Declared in the canon, no solver in this build |
| `processional-spiral` | ❌ | Declared in the canon, no solver in this build |
| `mirrored-passage` | ❌ | Declared in the canon, no solver in this build |
| `reliquary-grid` | ❌ | Declared in the canon, no solver in this build |

An unimplemented family raises `UNKNOWN_LAYOUT`. Substituting a different family
would silently change the artwork.

### Substrates

| `--substrate` | Construction |
| --- | --- |
| `alpha-radial-lattice` | θₙ = 2πn / 137 |
| `modular-residue-field` | rₙ = n² mod 137 |
| `fine-structure-construction` | α ≈ 1/137, as declared proportion only |
| `golden-processional-spiral` | r = a·e^(bθ), b = ln(φ)/(π/2) |
| `lissajous-archive-field` | x = A sin(3t + π/7), y = B sin(7t) |
| `voronoi-reliquary` | Seeded cells by exact half-plane clipping |

---

## The five artifact classes

| File | Public | Contents |
| --- | :---: | --- |
| `plate-{id}.canonical.svg` | ✅ | The authoritative vector master |
| `plate-{id}.production.png` | ✅ | 300 DPI raster, rebuilt from a chunk allow-list |
| `plate-{id}.print.svg` | ✅ | The plate wrapped in a print template |
| `plate-{id}.translation-card.json` | ✅ | Collector-facing, built from its own field list |
| `plate-{id}.clause-sheet.md` | ❌ | Full decoding, **contains the source phrase** |
| `plate-{id}.private.s137` | ❌ | AES-256-GCM encrypted encoding manifest |

Public and private artifacts are never placed in the same bundle. `exportPublic`
and `exportPrivate` are separate functions with separate return types, so the
public path is structurally incapable of returning a manifest or a clause sheet.

---

## Architecture

```
packages/
  plate-core/         Types, Zod input contract, version contract, source
                      preservation, canonical JSON, pure-TS SHA-256,
                      xoshiro128** with domain-separated named streams
  glyph-registry/     Grammar and locked geometry canons, with integrity
                      hashes and load-time conformance validation
  glyph-engine/       Lexer → semantic parser → immutable canonical AST
  substrate-engine/   Six mathematical substrates
  layout-engine/      Layout solvers and central print-safety enforcement
  corruption-engine/  Corruption, occlusion, decoys, atmosphere
  render-svg/         Byte-stable SVG serializer and print templates
  render-raster/      Pinned rasterization and PNG metadata scrubbing
  private-manifest/   .s137 encrypted container and the exact decoder
  artifact-security/  Public artifact leakage scanning
  plate-compiler/     compilePlate, the two export paths, clause sheet
apps/cli/             The trusted local process
bible/GLOSSARY.md     Plain definitions for every term used here
bible/encoding/       Canon documents
tests/                Verification gates 1–6
```

The dependency graph is what enforces the invariants:

- A **layout solver** receives glyph envelopes — bounds, anchors, and an
  immutable geometry reference. It cannot edit path commands because it is
  never handed any.
- A **substrate** emits coordinates, frames, guides, and masks. Its interface
  has no way to express a glyph.
- The **corruption engine** receives node identifiers and eligibility flags. It
  never sees geometry or source text, so it cannot leak either.

---

## Determinism

Prohibited inside the pipeline, per spec §5.3: `Math.random()`, time-based
seeds, UUID v4 in deterministic artifacts, browser entropy after compilation
begins, locale-dependent ordering, and system-dependent object iteration.

- Seed derivation is `SHA-256("studio137:plate-seed:v1" ‖ NUL ‖ seed)`.
- Five named streams derive independently, so changing density can move decoys
  without rerolling corruption sites.
- The PRNG is `xoshiro128**` with committed reference test vectors.
- Object keys sort by UTF-16 code unit; case folding is locale-free.
- Coordinates quantize before serialization, rounding half **away from zero** so
  the two halves of a mirrored passage land symmetrically.
- SHA-256 is pure TypeScript, so a browser preview worker and the Node export
  process agree bit for bit.

This is verified rather than asserted: CI installs from a frozen lockfile on a
different machine and reproduces the golden fixture's canonical SVG, print
composition, and rasterized PNG pixel hashes byte for byte.

---

## Verification gates

`pnpm test` runs 200 tests, including spec §26's gates:

| Gate | Checks |
| --- | --- |
| 1 — Grammar conformance | Every root family, modifier, separator, and corruption class exercised |
| 2 — Exact round trip | 400 arbitrary-Unicode property runs + 120 full compile→seal→open→decode cycles |
| 3 — Cross-run determinism | Pinned AST, presentation, SVG, print, and PNG pixel hashes |
| 4 — Locked path integrity | Registry digest at six stages; every emitted payload path byte-identical to an authored one |
| 5 — Privacy scan | Real artifacts clean; every prohibited class caught when injected |
| 6 — Print validation | Units, area guards, safe area, templates, background and alpha policy |
| 7 — Authorship review | **Human. Not automatable.** |

A passing test is not evidence on its own. Every gate assertion added to
close a defect is **counter-verified**: the defect is reintroduced and the
test observed to fail, then the fix restored. Six original tests turned out
to pass without proving anything — a loop over an empty array, a leak check
that never went through the export path, a PNG scrub asserted against a file
that carried nothing to scrub — and were rewritten rather than trusted.

```bash
pnpm test        # the suite
pnpm typecheck   # strict TypeScript, no emit
pnpm golden:hash # regenerate the golden release gates — deliberately only
```

`pnpm golden:hash` and `pnpm geometry:hash` exist to *mint* a version, never to
quiet a failing check. A changed golden hash means the artwork changed.

---

## Security

- The artist master key is 32 bytes, read from a file (never an argument or an
  environment variable — both leak into shell history and process listings) and
  zeroed after use.
- The phrase seed is **not** an encryption key and is never used as one.
- Containers use AES-256-GCM with HKDF-SHA-256, a fresh salt and nonce per
  manifest, and a header authenticated as additional data. A wrong key and a
  tampered file are deliberately indistinguishable, and both fail closed.
- Public artifacts are scanned before release. A finding blocks the export and
  never echoes the secret it matched.
- `.keys/` and `artifacts/` are gitignored. Do not commit either.

---

## Status against the specification roadmap

| Phase | State |
| --- | --- |
| 0 — Canon audit | ⚠️ Provisional grammar in place; **artist approval outstanding** |
| 1 — Canonical glyph registry | ⚠️ 18 placeholder records with full contract; **artist redraw outstanding** |
| 2 — Semantic compiler core | ✅ |
| 3 — Deterministic random system | ✅ |
| 4 — First layout and substrate | ✅ Concentric Rings + Clause Columns; Alpha Radial Lattice + five more |
| 5 — Canonical SVG renderer | ✅ |
| 6 — Corruption and decoys | ✅ |
| 7 — Artifact pipeline | ✅ Five classes; clause sheet is Markdown, PDF adapter pending |
| 8 — Interactive editor | ❌ Not started — CLI only |
| 9 — Security and reproducibility | ✅ Gates 1–6, plus clean-install reproduction verified in CI |
| 10 — Physical proof | ❌ No template is `physicallyValidated` |
| 11 — Expansion | ❌ Five layout families declared but unimplemented; they fail loudly |

**Known gaps, stated plainly:**

- Five of seven canon layout families raise `UNKNOWN_LAYOUT` rather than
  silently substituting another family.
- The clause sheet is Markdown; spec §16.2 wants PDF as primary.
- `minimumPrintStrokePt: 0.75` is an assumption until Phase 10 measures it.
- No Next.js editor. The compiler is deliberately isomorphic so a preview worker
  can reuse it unchanged, but nothing consumes it yet.

---

## Definition of done (spec §30)

1. ⚠️ State Bible grammar encoded and artist-approved
2. ⚠️ All canonical glyphs exist as locked vector masters
3. ✅ Exact-mode phrases decode byte-for-byte
4. ✅ Same inputs reproduce identical outputs
5. ✅ Corruption cannot mutate canonical glyph paths
6. ✅ Public SVG and PNG contain no private payload or machine metadata
7. ✅ All five artifact classes export successfully
8. ⚠️ Interface communicates reversibility and print constraints — CLI does; no GUI
9. ✅ Clean environment reproduces the golden fixture — CI reproduces it from a frozen lockfile on different hardware, matching the pinned SVG, print, and PNG pixel hashes
10. ❌ Physical 24×36 proof passes inspection

Only after all ten pass should Printful automation, cloud hosting, or additional
generative layers be connected.

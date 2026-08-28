# workbench — THE RING

Live state for the MK·137 spine commission. Always current.
Build brief: "THE RING", drafted 2026-08-28. Branch `claude/sigil-painter-review-stx4s2`.

**State: PHASES 1-7 BUILT. Peer gate returned four defects, under repair. Annotation layer, page wrapper and correspondence tests in flight. Adversarial grade queued behind them.**

---

## Phase 0 — inventory & fixture verification

### Fixtures: all verify (re-derived, not trusted)

| word | expected | computed | |
|---|---|---|---|
| DESCENT | 4·5·1·3·5·5·2 | 4·5·1·3·5·5·2 | PASS |
| DECENT | 4·5·3·5·5·2 | 4·5·3·5·5·2 | PASS |
| FALL | 6·1·3·3 | 6·1·3·3 | PASS |
| ACE | 1·3·5 | 1·3·5 | PASS |

- **ACE / SUN collision is real** — both resolve to 1·3·5. The audit runner must report it.
- "The S plunges to cell 1" is literally true: S=1 sits at (3,3), reached from (1,0).
- The repeated 5 in DESCENT is E→N, consecutive — the loop glyph fires where the brief says.
- Dürer Jupiter square verified magic: rows, columns and both diagonals = 34; values 1–16 complete.

### The vocabulary exists — GO

`assets/symbolpaintermk137.html:899`, `const KEYS={…}`. Missed on first pass because the
identifier says nothing about synonyms and it sits one line past the `CONCEPTS` block.

- **170 pairs, 170 unique words, 19 concept targets, zero duplicates, zero orphans either direction.**
- Targets match `bible/GLOSSARY.md` verbatim.
- **19 of the 170 are identity self-references** (`solar:"solar"`). So: 151 true synonyms
  + 19 canonical names = 170 lookup keys. **The audit is ×170, not ×189** — 189 double-counts
  the concepts, which are already inside the 170.

### Correction to a claim this project has been repeating

"0 of 189 words resolve to a mark" was overstated. There are **two disjoint vocabularies**:

| table | location | size | resolves to |
|---|---|---|---|
| `ROOT_WORDS` | `packages/glyph-registry/src/grammar.v1.ts:216` | **248 words → 9 root families** | provisional placeholder geometry |
| `KEYS` | `assets/symbolpaintermk137.html:899` | 170 words → 19 concepts | composition recipes |

They overlap by only **29 words**. `solar`, `victory`, `sun`, `descent`, `fall` are all in
KEYS and none are in ROOT_WORDS — which is exactly why the `SOLAR VICTORY` test returned zero
payload glyphs. That test was right; the generalisation built on it was not.

**What survives:** no word resolves to an *authored* mark, because the compiler runs on
geometry/v1's 18 placeholders. That is Break 1, unchanged.

**Break 2's evidence re-verified:** `FALL` → KEYS gives `descent`, so concepts-primary cannot
return the spoken word. `ACE` is absent from KEYS entirely — refused. Letters resolve both.
Decision stands, now proven rather than asserted.

### The three kamea walks — esoterica survives

All three share the same core: theosophic reduction (repeated digit-sum, never modulo), `0 → n²`.

| | derivation | **esoterica (KEEP)** | symbolpainter |
|---|---|---|---|
| squares | 4 | **7** | 7 |
| ciphers | 3 selectable | **3 selectable** | 1, hardcoded HEB |
| trace modes | 5 | **5** | 0 (a bool) |
| start ○ / end bar | yes | **yes** | inconsistent across 3 call sites |
| dedupe (SPARE) | yes | **yes** | no |
| auto-select square from a name | no | **yes** | no |

Derivation is a strict subset of esoterica (missing Sol, Venus, Mercury). Both die.
**Port before deleting symbolpainter's:** the `{d, pts}` return shape (`:358`) and
`drawKameaCard`'s activated-cell rendering (`:789-803`).
**Coordinate convention:** esoterica's `M=26`. Symbolpainter uses `M=24`, so identical inputs
currently produce different coordinates between them. One margin survives.

### render-svg gap check

- **Palette is already a parameter** — `renderer.ts:164`, supplied through `export.ts:112,131`. No work.
- **Per-path colour is impossible today.** Colour is one value per scene layer; `LockedPath` is
  `{d, role, strokeWidth}` with no colour channel (`types.ts:21`). Adding one changes `pathDigest`
  and therefore **all 50 integrity hashes**.
- **`<text>` cannot be emitted at all.** The emitter's only tags are path/g/mask/defs/svg, and
  `element()` has no text-node branch. House rule 4 is structurally satisfied today and must stay so.
- **A new scene layer costs five touchpoints**, one of them in another package:
  `SCENE_LAYERS` entry · the generator · **`artifact-security/src/scanner.ts:50` ALLOWED_ID regex**
  · the call-site push · two test allowlists (`gate5-privacy`, `gate6-print-validation`).

### Break 1 is a four-part flip, not a one-liner

1. `plate-core/src/versions.ts:28` — the contract
2. `plate-core/src/versions.ts:43` — `SUPPORTED_VERSIONS` lists only `geometry/v1`; without this nothing compiles
3. `compile.ts` `defaultRegistries()` — still returns the v1 registry; v2 is deliberately unreachable
4. **The real blocker:** no grammar resolves a word to a `mark-*` id, so a v2 plate would load
   real geometry and find nothing to say with it (`geometry-registry.ts:193`).

**Blast radius:** all 12 pinned values in `tests/fixtures/golden-hashes.json` change, including
`plateId` and `requestDigest` (the contract is inside the request digest). Five tests in
`gate3-determinism.test.ts`, plus assertions in `geometry-v2-registry`, `version-contract-binding`,
`bible-sync`, and `registry.test.ts`. Regeneration script exists: `pnpm golden:hash`.

**The join that unblocks #4:** 48 of the 50 v2 marks match a codex `G()` entry by name.
So `word → KEYS → concept → codex entries → marks` is buildable from data that already exists.

### Corrections to the brief

- **"Ten placement engines" is wrong.** Layout is **7 canon ids / 2 implemented / 5 pending**
  (`identifiers.ts:11`, `registry.ts:19`), and a test enforces the count. The ten is
  `MODEKEYS` in `symbolpaintermk137.html:426` — ten *composition* modes, a different thing.
- **The Dürer "locked constants" are not locked anywhere.** "22 segments", "11 activated cells",
  "π anchors at cells 3 and 14" appear nowhere in the repo under any spelling. Open question below.

---

## Open questions — front-loaded, per the brief's planning exception

1. **The three Dürer constants have no source.** The four word fixtures verify perfectly;
   these three cannot be checked against anything. What figure are they hand-verified against?
   Until answered they are omitted from the fixture set rather than invented.
   *(Escalation item: touches Record content.)*
2. **×170 confirmed as the receipt number?** Proceeding on 170 unless told otherwise.
3. **Which "ten" was meant as fuel** — the painter's ten composition modes, or the layout families?
   Reading it as the composition modes.
4. **Proposed eighth house rule:** the receipt may never be produced from the private manifest.
   The CLI's existing `decode` recovers the phrase from an encrypted envelope using the master
   key — that proves only that a copy was kept. The Read station must recover the word from
   geometry alone. Confusing them would rig the audit.

## Calls made without asking (reversible, recorded per house rule 6)

- **Hue is computed at render time from the walk, not stored on `LockedPath`.**
  *Load-bearing — a colour field would change `pathDigest` and reset all 50 integrity hashes for
  a purely presentational channel. Render-time hue keyed on walk step gives identical determinism
  at zero hash cost.*
- **Browser verification runs on Chromium via Playwright, not the Chrome extension.**
  *Answerable — `studio-137-forge` requires the Claude-in-Chrome extension, absent in this remote
  container; its own fallback says to say so. Chromium is installed at `/opt/pw-browsers`. Same
  check (desktop + 375px, console clean), different mechanism.*
- **Read station is built third, not last.**
  *Load-bearing — it is the measuring stick. Nothing downstream can be graded until it exists, and
  the brief itself makes it the instrument that adjudicates Break 3.*

## Rulings received 2026-08-28

1. **Dürer constants struck.** Not hand-verified — transcribed from a prior session, belonging
   to the site's `<Square />` component (Televisor lineage), and describing one specific
   derivation from an unknown seed rather than constants of the system. If ever wanted back the
   path is: find the seed in the site repo, reproduce the walk, verify the counts, enter them in
   the Record with that provenance. Until then they are a memory of a claim.
   *Note: `walk()` now computes `activatedCells` and `segmentCount` per word, with provenance.
   The quantities the struck constants tried to assert are now derived, not declared.*
2. **×170 confirmed.** Recorded fact, per the ruling: **the vocabulary and the ride-table are
   currently coextensive** — the 170 audit words *are* the KEYS table. This is fine but temporary.
   The moment the vocabulary grows past the table, a word will resolve (letters always resolve)
   and ride nothing. Name the divergence now so it is not a surprise later.
3. **The ten = MODEKEYS**, the painter's composition modes. Layout families stay 7 canon /
   2 implemented / 5 pending, as `tests/bible-sync.test.ts:77` enforces. Never conflate them.
4. **House rule 8 adopted: the read is blind.** The receipt derives from the mark's geometry
   plus public rules alone, never from the manifest or the envelope. Enforced by ablation —
   the grader reruns the ×170 audit with the manifest out of reach and the receipt must come
   back byte-identical.

---

## PHASE 1 — the trunk (complete)

`packages/walk-engine` — the single surviving resolve and walk.

- `squares.ts` — all 7 kamea, **verified magic at load** rather than trusted. A transcription
  slip in a 9×9 grid is invisible to the eye and would silently relocate every mark walked on it.
- `cipher.ts` — 3 ciphers, theosophic reduction (never modulo).
- `resolve.ts` — station 1. Cannot refuse; drops non-letters and records what it dropped.
- `walk.ts` — station 2. Five traces, caps, and the **loop glyph** added per the brief's convention.

**26 new tests, 248 total passing, typecheck clean.**

### What the tests caught

**The viewBox defect class fired again.** `ZZZZZZZZZ` walks nine letters onto one Jupiter cell;
the nested loops grew unbounded and reached **246 in a 220 box**. Fixed by clamping loop radius
to half the distance to the nearest frame edge, so the figure fits by construction rather than by
luck. This is the fourth time this class has appeared in this repo.

### A claim in the test header that counter-verification falsified

The header asserted that switching `reduceToCell` to modulo would fail the DESCENT and FALL
fixtures. **It does not** — under Pythagorean every letter is 1–9 and Jupiter's ceiling is 16, so
no reduction ever runs on those words. Only the direct `reduceToCell(19, 16)` assertion fails.
The header has been corrected to say what is true. Removing the loop-glyph branch *does* fail
exactly three tests, all loop tests, while every digit test still passes — that half held.

## Open item deferred to Phase 7

House rule 1 says two of the three walks die here. The two dead walks are dead in the
**executable stack** — nothing in `packages/`, `apps/` or `scripts/` implements a second walk.
The three HTML instruments stay in `assets/` for now for a concrete reason: **delete
`symbolpaintermk137.html` today and the correspondence generator loses its only source for
`KEYS` and `CONCEPTS`**, which Phase 3 is reading right now. They go when their replacement
page ships in Phase 7, not before.

---

## PHASE 4 — Break 1, flipped

### The blocker the inventory found, and the brief did not

v1 and v2 shared **zero ids**. v1 holds the seventeen structural records the grammar
names — `root-signal`, `mod-negate`, `sep-relation` and the rest — plus the literal-escape
frame. v2 held only `mark-*`. Pointing the contract at a disjoint v2 dangles every grammar
reference at once: `UNKNOWN_GEOMETRY` on the first word of the first plate.

**A version that shares nothing with the version it replaces is not a version.** So v2 now
*supersedes* v1: 18 structural records + 50 authored marks = 68, every superseded record
byte-identical to its v1 hash (asserted, not assumed).

### What the flip does NOT do

It does not make a word draw an authored mark. The grammar still resolves roots to the
provisional structural records. What the union buys is that a plate may now pin, load and
hash authored geometry under a contract that names it — **the door, not the room.** Words
reach authored marks through the correspondence table, on the sheet, not through the root
families. The brief treats Break 1 as the win; it is the unlock.

### A real defect found on the way

`exportPublic` loaded `geometry/v1` unconditionally, ignoring what the plate declared.
Invisible while v1 was the only contract; the moment a plate could pin anything else, the
export rendered one vocabulary onto a plate sealed with the name of another — the exact
defect `assertRegistriesMatchContract` guards against on the compile side, reappearing on
the export side where nothing was checking. It now resolves the registry from the plate's
contract and fails closed on an unknown one.

### The hash-reset log — the audit trail

| field | |
|---|---|
| plateId | **moved** `76cc5f7e…` → `c6a0b279…` |
| requestDigest | **moved** (the contract is hashed into it) |
| astSha256 | **moved** (every node records its geometryVersion) |
| presentationSha256 | unchanged |
| canonicalSvgSha256 | **unchanged** `9e20a494…` |
| printSvgSha256 | **unchanged** `7fb5e8f3…` |
| canonicalPathDigest | unchanged |
| productionPngSha256 | **unchanged** |
| minimumStrokePt | unchanged |

Only identity moved. **Every pixel is byte-identical.** That is the proof the superset is
correct rather than merely green: the plate declares a different vocabulary and draws
exactly the same picture. Had the SVG moved, the union would have been wrong.

---

## PHASE 5 — paint (complete)

`packages/envelope-engine`. Chords from node `i` to `m·i mod N`; the envelope is an
epicycloid with `m − 1` cusps. `m` is the walk's cell sum, `N` is magic constant × order.
DESCENT → 24 cusps, FALL → 12, ACE → 8. **The cusp count is countable off the drawing**,
so a reader who distrusts the caption can check the picture against it.

Renderer gaps closed: palette was already a parameter; hue is a guide-level channel indexing
a palette ramp (inert unless both are present — Gate 3 unmoved proves it); envelope enters as
substrate guides; layers untouched.

---

## PHASE 7 — `ring <WORD>` (built)

One word in, four artifacts out: sheet, legend, census, receipt. They ship together
because a sheet alone is a picture, and a picture cannot be checked.

- `LONGING` — in the vocabulary, rides concept `love`, therefore walked on **Venus**.
- `SWEATSHOP` — in no vocabulary at all. Resolves, walks, draws, and reads its cells
  back **identically**; only the cells→word step returns nothing, because that is the
  only step a vocabulary is needed for. Letters resolve; concepts ride.

### What looking at the render changed

The first sheet was wrong, and only rendering it showed why. Magic-constant × order gave
Venus **1225 nodes**: at that density the chords fill the disc uniformly, the caustic
vanishes into texture, and the cusps cannot be counted. The sheet printed *"count the
cusps to check this against its caption"* above a figure where counting is impossible —
**a false claim on the artifact**, which is worse than a plain one.

- Nodes fixed at **137**: prime, so every multiplier below it is coprime and no family
  degenerates into a sparse sub-figure. That it is the studio's number is why this prime.
- Multiplier is now the cell sum **reduced theosophically** — the same operation that
  places a letter on a cell, applied once more, so the cusp count reports the word in the
  unit the system already counts in. DESCENT 7, LONGING 6, FALL 4, ACE 9.
- A test asserts the bound the printed claim depends on (cusps ≤ 9).

## PHASE 6 — the numeral set (built; one blemish)

33 glyphs, 50 locked paths, compass and rule, monospaced, worst-case ink **2.4 units
inside** its declared viewBox. It typesets `8.47 × 10⁻¹¹ LS` — the corrected exponent,
not the one on the reference sheet. **The S leans**; its tangency offset reads as italic
against the upright digits. Assigned.

---

## PEER GATE — correspondence

The adversarial reviewer could not break the joins. **Zero invented associations**, every
coverage number independently recounted with **zero disagreements**, the brush→tradition
join reads the right positional fields (`U(n,t,e,g,f,m)` — `e` is era, `g` is glyph), and
`sigil` left unmapped was verified honest rather than a dodge.

What it did break was the **extraction layer's robustness**. Two scanners fail open.

| # | severity | defect |
|---|---|---|
| 1 | **SEVERE** | `topLevelKeys` checks quotes, never comments — while `balancedFrom` in the same file handles them. `// Odin's knot` above `valknut` costs 5 stamps and the whole `egy` tradition; the apostrophe opens a "string" that swallows the block. Exit 0, no warning. The geometry branch has no empty-join floor check, unlike GLYPHS. |
| 2 | **SEVERE** | `norm()` — NFKD does not decompose `Æ Ø Þ ß Ł`; they survive and are then deleted. `norm("Ægishjálmur")` = `"gishjalmur"`. The mark unbinds **and the generator emits a note claiming the codex has no such row** — the row is at `codexdata.ts:178`. A miss that ships a paragraph explaining why the data does not exist is worse than a miss. |
| 3 | MODERATE | The file is written *before* `problems` sets a non-zero exit. A self-inconsistent artifact reaches disk. |
| 4 | MINOR | Unanchored containment makes the two-letter id `sa` match `unicur**sa**l`, producing a reason about a choice no binder faces. Violates house rule 6. |

Disclosed limitations worth carrying: `composition` is per-word and the painter unions
across matched concepts (overstated in the module header); `kamea: PlanetKey` is an
**unverified pointer** at walk-engine's `SquareId` — the house-rule-1 fix traded a
duplicate for a pointer nothing asserts; and correspondence had **zero test coverage**,
so its determinism claim was unenforced.

## Not yet delivered

- **The page wrapper.** The done bar requires browser verification at desktop and 375px
  with a clean console. There was no page to verify. In flight.
- **The annotation layer** — the actual Press station. In flight.
- Done-bar item 5 (dead copies *removed*) is only met in the executable stack; the three
  HTML instruments remain in `assets/` as data sources and provenance.

## Next move

Integrate the four in-flight streams, then act on the three-lens adversarial grade.

## Census — this build's own choices so far

LOAD-BEARING 5 · ANSWERABLE 1 · FREE 1 · ARBITRARY 0

- *Load-bearing* — hue at render time, not on `LockedPath` (would reset all 50 integrity hashes)
- *Load-bearing* — margin 26, not the painter's 24 (24 shifts every coordinate off the existing corpus)
- *Load-bearing* — squares verified magic at load (a silent transcription slip relocates every mark)
- *Load-bearing* — loop radius clamped (unclamped, ZZZZZZZZZ leaves its own frame at 246/220)
- *Load-bearing* — Read station built third, not fifth (it is the measuring stick)
- *Answerable* — Chromium via Playwright for browser checks (the Chrome extension is absent here)
- *Free, signed* — the loop glyph itself: a circle tangent at the node, Agrippa lineage. The
  alternative, the source engines' silent zero-length segment, loses information the walk contains.

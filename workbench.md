# workbench — THE RING

Live state for the MK·137 spine commission. Always current.
Build brief: "THE RING", drafted 2026-08-28. Branch `claude/sigil-painter-review-stx4s2`.

**State: ALL SEVEN STATIONS BUILT AND GRADED FOUR TIMES. 477 tests · `tsc` exit 0 ·
`pnpm verify:ring` exit 0. Six of seven done-bar items met; item 7 — "the grade comes
back empty" — has not been met, and every finding from all four grades is repaired.**

> This block has twice been flagged by graders as understating the build. It is now
> rewritten on every commit that changes the answer, because a status document that
> lags in the flattering direction is still lying.

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
epicycloid with `m − 1` cusps. **Superseded later in Phase 7 and left here as the log
it is:** `N` was magic constant × order and `m` the raw cell sum, giving DESCENT 24 cusps.
Venus's 1225 nodes made those cusps uncountable, so `N` is now fixed at 137 and `m` is the
cell sum reduced theosophically, plus one — DESCENT 8, FALL 5, ACE 10, drawing 7, 4 and 9
cusps respectively. See PHASE 7 below.
**The cusp count is countable off the drawing**,
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

## Delivered since this section was written

The page wrapper, the annotation layer and the four peer-gate repairs are all
delivered and verified. This block said otherwise for several hours; a grader
noted that reading the workbench would *understate* the build. Recorded rather
than silently swapped, because a status document that lies in the flattering
direction is still lying.

## Grading history — three rounds, and the one class that keeps returning

| round | found | outcome |
|---|---|---|
| 1 — three lenses | 6 defects, 2 severe | all repaired |
| 2 — two lenses | repairs held; **one repair made a census reason false** | repaired |
| 3 — one lens | 3 defects, incl. **a false derivation in the sentence written to fix the previous false derivation** | repaired |
| 4 — one lens | 4 defects: a **print-safety number the plate contradicted**, a "same 136 chords" claim about families that are pairwise disjoint, an undisclosed reading cap, and a counter-verification claim of mine that did not reproduce | repaired |

**The recurring class, stated plainly so it stops being a surprise:** *a sentence
printed on an artifact, or written in a comment or commit message, that states
something untrue about the system that printed it.* Four generations:

1. `census: "cusps are the walked cell sum minus one"` — false for every word; a fossil
   of the pre-Phase-7 multiplier. Legend was corrected, census was not.
2. `census: "read() hands back the same word with the cap deleted"` — true when written,
   falsified by the read-station repair that taught the reader to use the cap.
3. `"137 is prime, so every multiplier closes as a single cycle over all nodes"` —
   primality gives a bijection, not a single cycle. m=10 closes as 17 (or 18 counting
   node 0), not 1.
4. The correction to (3) **mixed both conventions in one sentence** — quoted
   `136/ord(m)` and then gave m=10 as eighteen while giving m=3 as one.

Every one was right in conclusion and wrong in stated reason. None was caught by a
test until a test was written for it; all four were caught by someone running the
experiment the sentence named.

### The countermeasure, and its limit

`tests/ring.test.ts` audits every numeric claim in the census, legend and receipt
against the engine, and refuses any claim no relation can evaluate. It has caught
three of my own rewrites mid-edit. **Its scope stops at the emitted text** — source
comments, README, this file and commit messages are outside the net, which is exactly
where generation four survived. That is the known hole, recorded rather than papered.

## Done bar — measured, not narrated

| # | item | state |
|---|---|---|
| 1 | `ring <WORD>` → 4 artifacts for ANY word | met — 16 adversarial inputs, incl. emoji, RTL, CJK, 200 chars, `""` |
| 2 | audit prints 170/170, unique count, collisions | met — 169 unique, `TIDE = TIME`, 0 unresolved |
| 3 | fixtures exact, ACE/SUN collides | met — asserted; ACE is not in the 170, so the collision is shown on a probe set and on ACE's own receipt |
| 4 | Break 1 through the golden-hash contract | met — only `plateId`/`requestDigest`/`astSha256` moved; every artwork hash unchanged |
| 5 | one walk, one resolve, one press path | met in the executable stack; three HTML instruments stay in `assets/` as a live build input (deleting `symbolpaintermk137.html` fails the correspondence generator — verified by a grader running it) |
| 6 | browser verification at desktop and 375px | met **and now reproducible**: `pnpm verify:ring`, committed, proven able to fail |
| 7 | the grade comes back empty | **not met** |

## The structural answer to the recurring class

Looping did not empty the grade and probably cannot: every repair writes new prose,
and prose about the system is what this system is worst at. Four rounds produced
four generations of one defect, twice *inside the correction to the previous
generation*. What actually improved is the machinery, and it is machinery rather
than vigilance:

- **The prose auditor** (`tests/ring.test.ts`) evaluates every numeric claim in the
  census, legend and receipt against the engine, and **refuses any claim no relation
  can evaluate** — so a new unverifiable sentence fails the build rather than
  shipping. It has caught four of my own rewrites mid-edit.
- **`assertGaugeIsMeasured`** (`packages/ring/src/annotate.ts`) re-measures the
  finished plate and throws if the printed stroke gauge disagrees with the ink.
  Reintroducing the old enumerated constant now fails at *plate-build* time:
  *"the gauge says 0.165 mm and the finished plate paints 0.090 mm; a plate may not
  carry a stroke it does not report."*
- **Measurement replaced enumeration** in the one place a list had gone stale. The
  list is deleted, not extended — extending it would have been the same defect
  waiting on the next block that sets its own size.

Known limit, recorded rather than papered: the auditor's scope stops at the emitted
text. Source comments, this file, `README.md` and commit messages are outside the
net, and that is exactly where generations three and four survived.

---

## PHASE 8 — the instrument, and what wiring the inert knob turned up

The gap the owner named: *"this is the symbol painter but where's the whole thing
that utilizes the entire everything."* Sharpest form of it — the concept table has
always carried `composition: { mode, arch, palette, fold, words }` on all nineteen
concepts, and `packages/ring/src/index.ts` read `planet` and `brushes`. `lunar`
asked for `cymatic`; `war` asked for `haring`; both drew the same figure.

**Built:** `packages/mode-engine` (the painter's ten constructions on the walk),
`packages/spine-browser` + `scripts/build-browser-bundle.ts` (one bundle, proven
identical to the CLI), `scripts/build-instrument.ts` → `artifacts/instrument/index.html`
(type a word, live redraw, SQUARE / CIPHER / TRACE / MODE / VIEW).

### Six defects graded, six closed

| | defect | closed by |
|---|---|---|
| D1 | `attractor` broke browser↔CLI parity: the de Jong map iterates `Math.sin` up to 12,600× and Node/Chromium disagree by 1 ULP on ~3.3% of arguments. **4 of 44 comparisons failed.** | `packages/mode-engine/src/trig.ts` — sine and cosine from `+ − × ÷` alone (Cody-Waite + fdlibm kernels), which IEEE-754 pins down. **52 of 52 pass.** |
| D2 | attractor's signature said "no vocabulary word needs more than **7** of its 24 draws"; the guard measured over 19 concept words while the sentence named 170. True max is **16**. | Guard widened to the population the sentence names; the burn-in claim now measures the one word it names instead of a max over a population it doesn't. |
| D3 | "count the colours and you have the activated set" — false for **190 of 1,700** word×mode pairs. | The true statement, plus a test that reads the paragraph out of the source and fails on any numeral it cannot produce. |
| D4 | `spine-browser` still said "`ring()` does not read either list today". It had for thirty commits. | Corrected, with the stale sentence quoted so the failure mode stays visible. |
| D5 | The instrument's masthead claimed unconditional CLI parity while attractor diverged. | Scoped to what the two checks actually re-measure; `CROSS_RUNTIME_DIVERGENT_MODES` is now `[]` **and still re-measured every build**. |
| D6 | `artifacts/browser/*` was stale against its own source. | Rebuilt; the build carries a source fingerprint taken before and after. |

### What the inert CIPHER knob was hiding

`RingOptions` had no `cipher` field, so the instrument's three-way picker moved
nothing. Wiring it turned up two things nobody could have seen while it was dead:

1. **`ring()` called the blind reader without the cipher**, so every plate was
   decoded as PYTH. Measured over all 170 vocabulary words: PYTH read back 170,
   **NAEQ read back 0**, HEB read back 114 — and the 114 was a coincidence, since
   HEB and PYTH agree on the cells of A–I. All three now read back **170 of 170**.
2. **`inverseCipher` keyed on the raw cipher value, not the cell.** A cell is
   `reduceToCell(value, order²)`; HEB assigns J = 10 and S = 100. The map held a
   `10` and a `100` no reading could ever contain, and a `1` holding only `A`.
   PYTH's values are already 1–9 and the smallest square has 9 cells, so nothing
   ever disagreed — the defect sat one option away from reachable for the life of
   the file.

And one theorem, which looks exactly like the dead knob it replaced: **on Saturn,
HEB and PYTH are the same cipher.** The digit root of Hebrew place value is the
Pythagorean value for all 26 letters — `(i mod 9) + 1` is `i+1`, `i−8`, `i−17` over
the three ranges, which is what `(i−8)·10` and `(i−17)·100` reduce to. They separate
on every larger square, from 1 letter on Jupiter to 8 on Luna. The page says so
under the knob rather than leaving the owner to conclude it is still broken.

`reduceToCell` also gained a guard: below 9 the loop cannot terminate, because the
digit sum of a one-digit number is itself. Passing an order where a cell count
belonged hung the process on the word SUN with no stack to read. A browser tab has
no timeout to save it, so the hang is now a sentence.

### The residual, measured rather than argued

`trig.ts` covers `mode-engine`. The committed packages still call the built-ins —
`envelope-engine` placing ring nodes, `walk-engine` drawing the cap bar,
`ring/annotate.ts` drawing ticks — and the argument for leaving them is that every
result is rounded before it reaches a path. That argument is now an experiment:
`scripts/measure-ulp-exposure.ts` replaces both built-ins with versions returning
the next representable double on **every** call — strictly worse than Chromium —
and compiles all 170 words on all 7 squares twice. **741,608 perturbed calls; 0 of
1,190 plates changed a byte.** Non-zero is the trigger to move `trig.ts` beneath
`walk-engine` and rebaseline.

The cross-runtime probe also now measures `Math.sqrt`, `Math.atan2` and
`Math.hypot` — **0 of 50,000 differ** — so "the disagreement is sine and cosine" is
a reading off a table rather than a guess about V8.

### Hash reset — `ringDigest` v1 → v2

`--cipher` changes the drawing, so it has to change the filename or `ring SUN` and
`ring SUN --cipher NAEQ` overwrite each other's four files. Every stem in
`tests/cli-ring-paths.test.ts` moved once, on purpose. Appending the cipher only
when non-default would have preserved all 30 strings, and that is precisely why it
was not done: a digest whose input depends on whether a field holds its default is
a digest nobody can reason about two options from now.

### Standing

- `pnpm exec vitest run` — **557 passing**, 24 files
- `scripts/build-browser-bundle.ts` — **52 of 52** comparisons byte-identical, both variants; 4 planted failures all caught
- `scripts/build-instrument.ts --verify` — **32 of 32** artifacts identical to the CLI; console silent and no overflow at 1440×900 and 375×812; all 11 modes 0/20 divergent

---

## Next move

Nothing outstanding on the build. What waits on a human:

1. **Sign or strike the 17 rows** in `bible/PROPOSED-ROOT-MARKS.md`. Six have any
   candidate at all; eleven would be signed on taste alone, which is allowed and
   should be signed *as* taste with a reason.
2. **Join coarseness**, output-driven: run a dozen words you care about through the
   page and author finer correspondence rows only where the plates read wrong.
3. **Break 3** (the cymatic chamber: quantise or cut) — deliberately deferred until
   the read station existed. It does now, so the instrument that adjudicates it is
   available.
4. **The garment profile**, still stubbed. Every plate currently reports a stroke
   gauge far below every garment floor, correctly marked ALARM.

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

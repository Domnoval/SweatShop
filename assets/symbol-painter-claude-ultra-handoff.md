# SYMBOL PAINTER / MK·137
## Mobile Redesign and Implementation Handoff

**Prepared for:** Claude Opus 5 — Ultra Code Mode  
**Application:** https://sigilpainter.netlify.app/  
**Product:** Studio 137 · Symbol Painter  
**Document status:** Implementation source of truth  
**Primary target:** Mobile web, with desktop behavior preserved and improved

---

# 0. Instructions to the Implementation Agent

You are implementing a mobile-first redesign of an existing generative-art instrument. Treat this document as the product and interaction source of truth.

Before changing code:

1. Inspect the repository, framework, routing, rendering pipeline, persistence, state management, component structure, CSS strategy, export implementation, and test setup.
2. Run the current application and record the existing behavior of seeds, layers, presets, rendering, SVG/PNG export, and URL state.
3. Preserve the existing generative algorithms and visual output unless this document explicitly changes their behavior.
4. Do not replace the application with a generic dashboard, component-library aesthetic, or simplified demo.
5. Implement in the phases defined below. Keep each phase independently testable and shippable.
6. Add automated tests for deterministic state, normalization, history, migration, and serialization. Add interaction tests for the major mobile workflows.
7. Report any conflict between this specification and the existing architecture before silently changing product semantics.

## Non-negotiable design principle

Symbol Painter is an artistic instrument, not a conventional SaaS editor. Preserve:

- The black void.
- Monospaced, terminal-like typography.
- Phosphor, bone, lavender, and spectral accents.
- Poetic terms such as `COMPOSE FROM STORY`, `LUNAR GRIEF`, and `CHAOS → ORDER`.
- The distinction between the composition engine and “what you pour through it.”
- Seeded reproducibility.
- Layered symbolic vocabularies.
- SVG/PNG and print-oriented output.
- Atelier, proof, collection, and derivation concepts.

Improve comprehension and control architecture without sanding away the mystery.

---

# 1. Product Objective

Make Symbol Painter feel like a portable artistic instrument rather than a desktop settings panel stacked into a phone. The artwork must remain visible during composition. Expert power must remain available, but the interface should reveal it contextually.

The target interaction model combines:

- Silk’s canvas dominance.
- Voanh’s explicit seed and reproducibility model.
- Rhythm’s parameter precision.
- Studio 137’s language, atmosphere, and conceptual depth.

## Success conditions

A user must be able to:

1. Generate a first composition without reading documentation.
2. Adjust core values while continuously seeing the artwork.
3. Enter exact parameter values.
4. Lock, reroll, share, and restore deterministic seeds.
5. Undo any meaningful artwork mutation.
6. Use advanced controls without navigating a giant exposed form.
7. Export a correct PNG or SVG quickly.
8. Save, version, collect, back up, and restore works without requiring an account.
9. Complete all core operations with touch, keyboard, or assistive technology.

---

# 2. Priority and Release Plan

| Priority | Workstream | Impact | Relative effort |
|---|---|---:|---:|
| P0 | Persistent mobile artwork stage | Critical | High |
| P0 | Mobile bottom-sheet control architecture | Critical | High |
| P0 | Accessible control names and touch targets | High | Medium |
| P0 | Persistent Export action | High | Low |
| P1 | Explicit seed lock, reroll, inheritance, and sharing | High | Medium |
| P1 | Numeric entry, scrubbing, and precision controls | High | Medium |
| P1 | Progressive disclosure | High | Medium |
| P1 | Undo, redo, and grouped history | High | Medium–high |
| P2 | Visual composition previews | Medium | Medium |
| P2 | First-run guided composition | Medium | Medium |
| P2 | Symbol provenance | Medium | Medium |
| P2 | Zen mode | Medium | Low–medium |
| P3 | Saved works, versions, collections, and archives | Medium–high | High |

## Recommended delivery order

1. Establish state-schema tests and deterministic baselines.
2. Build the mobile app shell and persistent stage.
3. Move controls into four working modes.
4. Repair labels, touch targets, focus, and live announcements.
5. Add precision parameter components.
6. Add the explicit seed system.
7. Add transactional undo/redo.
8. Promote Export.
9. Add composition previews and first-run flow.
10. Add provenance and Zen mode.
11. Add saved works, snapshots, collections, and portable archives.

---

# 3. Phase 1 — Repair the Core Mobile Loop

## 3.1 Persistent artwork preview

### Implementation outcome

Convert mobile into a `100dvh` application shell. The artwork stage remains visible above a draggable control sheet.

```css
.app-shell {
  height: 100dvh;
  min-height: 100svh;
  overflow: hidden;
  background: var(--void);
}
```

Recommended vertical structure:

| Region | Size |
|---|---:|
| Application bar | 48 px plus safe-area inset |
| Artwork stage | 38–48dvh |
| Sheet handle/summary | 36–44 px |
| Control viewport | Remaining height |

The document body must not be the primary scrolling container. Scroll only the control sheet.

### Stage behavior

- Fit the artwork within the stage while preserving output aspect ratio.
- Maintain at least 16 px breathing room where possible.
- Keep the current metadata strip inside the lower stage edge.
- Support pinch zoom, two-finger pan, and double-tap to fit.
- Tapping empty stage space collapses the sheet to Peek.
- Keep rendering indicators temporary and restrained.
- Do not regenerate, change seed, or enter history when zooming or panning.

### Acceptance criteria

- Any common parameter can be changed while artwork remains visible.
- At least 60% of the artwork remains visible at the default sheet position.
- No horizontal document scrolling occurs at 320 px width.
- Browser chrome changes do not jump or resize the composition unexpectedly.
- Orientation changes preserve work, active mode, and committed parameter state.
- Stage navigation never mutates artwork state or history.

## 3.2 Bottom-sheet control architecture

### Implementation outcome

Use three snap points:

1. **Peek:** about 56 px; current mode and state summary only.
2. **Working:** about 50–58% of viewport; default editing state.
3. **Expanded:** all available space below the app bar.

Persistent mode navigation:

```text
COMPOSE    FIELD    MARKS    FINISH
```

### Behavior

- Drag only from the sheet handle or header.
- Preserve mode scroll position during the current work session.
- Keep bottom navigation visible.
- Do not close one advanced accordion merely because another opens.
- Do not place nested scrolling regions inside the sheet unless unavoidable.
- The sheet must not capture slider or numeric-scrubbing gestures after those controls take horizontal ownership.

### Acceptance criteria

- Peek, Working, and Expanded positions are stable at common mobile viewport sizes.
- Slider gestures cannot accidentally drag the sheet.
- Sheet changes do not enter undo history.
- The artwork does not unexpectedly rescale between Working and Expanded states.

## 3.3 Application bar

### Layout

Left:

- Compact `MK·137` identity.
- Work title.
- Unsaved/modified indicator.

Center:

- Compact seed state, e.g. `137137 · LOCKED`.

Right:

- Undo.
- Redo.
- `[ EXPORT ]`.

### Acceptance criteria

- The bar remains visible and respects safe-area insets.
- The seed state remains understandable at 320 px width.
- Undo, Redo, and Export meet 44 × 44 px touch targets.
- The introductory paragraph is removed from the working editor and moved to onboarding/About.

## 3.4 Accessibility foundation

### Implementation outcome

- Add names to all symbol-only controls.
- Pair every slider with a programmatic label and formatted value.
- Use `aria-pressed` or equivalent for toggles.
- Add visible keyboard focus.
- Announce meaningful generated-state changes through a live region.
- Increase mobile secondary operational text to at least 12–13 px.
- Meet WCAG AA contrast for operational text.
- Respect `prefers-reduced-motion`.

### Acceptance criteria

- Every core action works using keyboard only.
- A screen reader can identify mode, active state, parameter, value, unit, bounds, and errors.
- Selection is never communicated by color alone.
- All primary touch targets meet the minimum target size.

## 3.5 Persistent Export

Export opens from the application bar rather than requiring users to find the bottom of Finish.

The export sheet must expose:

- 1:1 Sticker.
- 4:5 Tee.
- 2:3 Poster.
- 16:9 Banner.
- 9:16 Story.
- Custom dimensions.
- PNG and SVG.
- Transparent output.
- Seamless tile.
- Safe guide inclusion.
- 2K, 4K, and 5.4K Print.
- Copy reproducible link.
- Certificate of derivation.

Primary action example:

```text
[ EXPORT PNG ]
```

### Acceptance criteria

- A user can export a standard 9:16 PNG within two actions from the editor.
- The export summary states format, dimensions, transparency, and guide behavior.
- Exporting does not change seed or artwork state.
- A failed export preserves the work and offers retry.

---

# 4. Phase 2 — Make It a Precise Instrument

## 4.1 Explicit seed model

### Implementation outcome

Expose a persistent global seed control and optional independent layer seeds.

```text
SEED
[ 137137                    ]
[LOCK]  [REROLL ↻]  [COPY LINK]
```

Seed states:

- Global.
- Layer-inherited.
- Layer-independent.
- Locked.
- Unlocked.
- Story-derived.
- Manually entered.

### Global seed behavior

When locked:

- Engine, palette, finish, format, medium, and parameter changes preserve the seed.
- Story presets may not replace it silently.
- Reroll is disabled with explanation or requires explicit unlock-and-reroll.

When unlocked:

- Reroll creates one new seed.
- Story derivation may replace the seed.
- Unlocking alone does not alter the work.

### Layer seed behavior

Layers inherit global seed by default.

```text
SEED
● INHERIT GLOBAL · 137137
○ INDEPENDENT · 928144
```

Moving to Independent initially copies the current derived seed so the artwork does not jump until reroll or manual edit. Returning to inheritance removes the independent relationship rather than copying a number.

### Share state

A reproducible link must encode or resolve:

- Global and independent seeds.
- Lock and inheritance states.
- Layer order.
- Engines and parameter values.
- Active symbol families.
- Medium and type overrides.
- Palette and finish.
- Output format.
- Story text.
- State-schema version.

UI-only state such as sheet position and zoom is excluded.

### Edge states

- Invalid seed input preserves the previous state.
- Text seeds normalize deterministically.
- Older URL schemas migrate explicitly.
- Oversized share state uses a stored identifier rather than silent truncation.
- Copy failure reveals a selectable URL.
- Rapid tapping cannot trigger multiple rerolls.

### Acceptance criteria

- Locked seed survives all non-seed parameter changes.
- Unlocking does not immediately change the seed.
- One reroll creates one history transaction.
- Undo/redo restores exact deterministic artwork.
- Independent layer seeds survive global rerolls.
- Shared links restore identical artwork and seed relationships.
- Refresh and archive import preserve normalized seed state.
- Screen readers announce lock, reroll, validation, and inheritance changes.

## 4.2 Numeric slider entry and parameter precision

### Implementation outcome

Replace every raw range control with a shared parameter component containing label, value, unit, slider, direct entry, scrubbing, keyboard support, reset, validation, preview behavior, and source state.

```text
DENSITY                              235
[──────────────●────────────────────]
```

### Parameter definition contract

Every parameter declares:

- Stable ID and label.
- Minimum, maximum, and default.
- Standard, fine, and coarse steps.
- Decimal precision and unit.
- Signed/unsigned behavior.
- Direct-entry, scrubbing, and reset support.
- Continuous, throttled, or commit-only rendering.
- Throttle/debounce timing.
- Value source: factory, engine, preset, global, layer override, or manual.
- Parsing, validation, normalization, and formatting.
- Render invalidation scope.
- Preview, commit, and cancel callbacks.

No control may rely on implicit browser defaults.

### Direct entry

- Tapping the value opens inline entry.
- Select the numeric portion.
- Keep units outside the input.
- Preserve raw text until commit or cancellation.
- Do not render on every keystroke.
- Empty, sign-only, and partial decimal states remain editable but cannot commit.
- Commit through Apply, Enter, Done, or safe valid blur.
- Parse, validate, normalize, render, then commit.
- Cancel restores value, source, artwork, and focus.
- One successful entry creates one transaction.

### Scrubbing

- Tap opens entry; horizontal drag begins scrubbing after threshold.
- Drag right increases; left decreases.
- Support fine, standard, and coarse sensitivity.
- Capture prevents sheet movement and text selection.
- Bounds do not wrap or accumulate hidden movement.
- One gesture creates at most one transaction.
- Returning to the start creates none.

### Keyboard

- Arrow: standard step.
- Shift + Arrow: coarse.
- Alt/Option + Arrow: fine.
- Home/End: min/max.
- Enter: direct entry.
- Escape: cancel.
- Repeated keypresses group into one transaction by focus and debounce.

### Preview modes

**Continuous:** opacity, rotation, scale, stroke, palette interpolation. Keep only newest frame.

**Throttled:** density, fold, collapse, geometry coefficients. Show candidate immediately and render final exact value after release.

**Commit-only:** high-density or structural regeneration. Preserve old artwork until final render succeeds.

All asynchronous renders use interaction tokens so stale results cannot overwrite newer state.

### Reset

Reset destinations may include:

- Factory default.
- Engine default.
- Story/preset value.
- Saved value.
- Global inherited value.
- Layer default.

Ambiguous reset opens a destination menu. Resetting to global removes the override relationship. Reset is one transaction; resetting to the current state creates none.

### Edge states

- Empty input is not zero.
- Invalid syntax cannot mutate state.
- Out-of-range values are explicitly clamped or rejected.
- Quantization is relative to the minimum.
- Decimal rounding is deterministic and avoids floating-point artifacts.
- Unsafe device values offer a safe maximum or cancel.
- Failed final renders preserve the last successful artwork and create no successful transaction.
- Interrupted gestures restore the committed state.

### Acceptance criteria

- Every numeric control supports exact entry.
- Slider, typing, scrubbing, and keyboard normalize identically.
- Invalid and cancelled operations create no history.
- A gesture creates at most one transaction.
- Units, bounds, source, and validation are accessible.
- Values survive refresh, save/reopen, share, and archive import.
- Stale renders never replace newer values.
- The component remains usable at 320 px width.

## 4.3 Progressive disclosure

### Implementation outcome

Use four modes:

### COMPOSE

Primary:

- Story input and Derive.
- Story presets.
- Layer summary and Add Layer.

Contextual/advanced:

- Preset change breakdown.
- Full layer manager.
- Opacity, layer seed, rename, duplicate, reorder, delete.

### FIELD

Primary:

- Selected engine.
- Density.
- Scale.
- Stroke weight.

Advanced:

- Rotate X/Y/Z.
- Collapse and form.
- Sphere/shells/helix.
- Radial fold.
- Mirror axis.
- Planetary divisions.
- Ring-text geometry.
- Engine-specific coefficients.

### MARKS

Primary:

- Active symbol families.
- Global medium.
- Global type behavior.

Contextual:

- Only active families.
- Per-family medium/type overrides.
- Missing-glyph warnings.
- Provenance.

### FINISH

Primary:

- Palette.
- Surface.
- Background.

Advanced:

- Custom palette.
- Finish strength.
- Transparency/tile/safe guides.
- Atelier title, signature, collection, mockup, and proof metadata.

### Behavior

- Hidden incompatible controls retain values but stop affecting output.
- Returning to a compatible engine restores them.
- Collapsed groups summarize active values.
- Errors within collapsed groups appear at the header.
- Standard and Dense UI modes affect layout only.
- Optional control search navigates to and highlights any parameter without mutating it.

### Acceptance criteria

- Primary controls require no accordion expansion.
- Advanced controls are reachable within two actions from their mode.
- Inactive families do not produce repeated type rows.
- Hidden values survive temporary incompatibility.
- Disclosure state never enters artwork history or shared state.
- Default scrolling is materially reduced from the original mobile page.

## 4.4 Undo, redo, and transactional history

### Implementation outcome

Persistent app-bar actions plus optional recent-history view.

A transaction contains:

- ID and work ID.
- Timestamp and readable label.
- Forward and reverse patches.
- State-schema version.
- Change details.
- Rendering invalidation scope.

### History entries

Create one transaction for:

- Preset or story application.
- Engine change.
- Completed parameter interaction.
- Seed reroll.
- Layer add/delete/duplicate/reorder.
- Family, medium, palette, finish, or format change.
- Imported or restored state.

Do not create entries for mode switching, sheet movement, scrolling, preview zoom, provenance, export opening, invalid input, or cancelled previews.

### Grouping

A multi-property preset is one atomic transaction with a details view. Slider previews and repeated keys update one pending transaction. Deleting a layer uses non-blocking Undo and must restore every property.

### Persistence

- History survives the active session.
- Bounded recovery history may survive refresh.
- Saved-state pointer controls the Modified indicator.
- New changes after Undo clear the obsolete Redo branch.
- Named snapshots remain separate from transient history.

### Failure states

- A failed undo render preserves logical state and offers Retry.
- Corrupt patches stop at the last valid checkpoint.
- Memory pressure compacts older history without changing current artwork.
- Multiple tabs do not silently merge history or overwrite saves.

### Acceptance criteria

- Every meaningful artwork mutation is reversible.
- Presets undo atomically.
- Layer deletion restores exact layer state and order.
- History operations are deterministic after refresh and schema migration.
- `Cmd/Ctrl+Z` and `Cmd/Ctrl+Shift+Z` work.
- Screen readers announce the next undo/redo action and result.

---

# 5. Phase 3 — Improve Comprehension and Artistic Depth

## 5.1 Visual composition previews

### Implementation outcome

Replace text-only engine selection with monochrome field cards showing spatial behavior, name, and concise description.

- Use the same seed and sample marks across previews.
- Show the placement field, not decorative finished art.
- Keep the visual language diagrammatic and Studio 137-specific.
- Motion begins only on focus or deliberate preview and respects reduced motion.
- Candidate comparison uses the same seed, marks, palette, and bounds.

### Acceptance criteria

- Every engine has a recognizable preview.
- Users can distinguish major behaviors before application.
- Applying an engine creates one transaction.
- Compare does not mutate current state.
- Off-screen previews do not consume ongoing render resources.

## 5.2 First-run guided composition

### Entry state

```text
HOW WILL THE FIELD BEGIN?

[ COMPOSE FROM STORY ]
[ CHOOSE A FIELD ]
[ OPEN AN EXAMPLE ]

SKIP · ENTER THE INSTRUMENT
```

### Story path

1. Enter intention.
2. Derive initial conditions.
3. Explain Field, Vocabulary, Palette, and Seed in context.
4. Adjust one core parameter.
5. Lock the seed.
6. Enter the normal editor with work intact.

### Field path

Offer representative previews: Phyllotaxis, Organic, Cymatic, Chaos. Then choose vocabulary and palette.

### Example path

Open editable states: Solar Victory, Lunar Grief, Chaos → Order, and Union. Examples are state, never flattened pictures.

### Contextual teaching

Teach advanced ideas only when first encountered: seed lock, independent layer seed, certificates, provenance, and advanced field controls. Hints are dismissible and remembered.

### Acceptance criteria

- No account required.
- The shortest path completes in about one minute.
- Users can skip immediately.
- Onboarding results remain editable.
- Returning users are not forced through onboarding again.

## 5.3 Symbol provenance

### Implementation outcome

Every family receives a provenance panel including:

- System.
- Region and approximate period.
- Source set and font.
- Unicode or asset source.
- Character count.
- Technical fallback behavior.
- Licensing metadata.
- Context note and uncertainty.
- References.

Individual-symbol details appear only where mapping is reliable. Do not invent meanings. Distinguish historical linguistic identity from later symbolic interpretations.

Export should convert glyphs to paths or otherwise stabilize rendering where possible. Certificates may record family, font, and source-set versions.

### Acceptance criteria

- Every family has provenance.
- Unsupported interpretations are not presented as fact.
- Missing glyphs and fallback fonts are identified before export.
- Viewing provenance never changes state or history.

## 5.4 Zen mode

### Implementation outcome

One action hides the bar, sheet, navigation, guides, and editing metadata. Preserve artwork, void, and a quiet restore target.

Options:

- Artwork only.
- Artwork plus metadata.
- Artwork plus signature.
- Optional wake lock.
- Optional clean capture/share.

### Acceptance criteria

- Entry and exit do not regenerate or create history.
- Artwork scale remains stable.
- Touch, keyboard, and assistive exit paths exist.
- Clean capture contains no UI.
- Rotation and wake-lock failure are graceful.

---

# 6. Phase 4 — Saved Works and Collections

## 6.1 Local saved works

### Data model

A saved work contains:

- Stable work ID.
- Title.
- Created and modified timestamps.
- State-schema version.
- Complete seeds, layers, parameters, marks, finish, and output state.
- Thumbnail.
- Story text and notes.
- Collection membership.
- Save status and optional provenance hash.

Use IndexedDB or an equivalent durable local store.

### Save states

```text
UNTITLED · UNSAVED
DESCENT I · SAVED
DESCENT I · MODIFIED
```

Support Save, Save As, Duplicate, Rename, Revert, Delete, and Export Backup.

Maintain recovery state separately from intentional saves. Multiple tabs must not silently overwrite one another.

### Acceptance criteria

- Save/reopen restores exact deterministic output.
- Undoing to the saved pointer clears Modified.
- Recovery survives interruption where storage permits.
- Storage exhaustion never silently deletes works.

## 6.2 Works library

Provide grid and compact-list views with sort/filter by title, date, seed, engine, families, palette, format, lock status, certificate, and collection.

Work actions:

- Open.
- Duplicate.
- Rename.
- Add to collection.
- Export.
- Copy link.
- View derivation.
- Delete.

Thumbnails represent the saved version, not recovery state.

## 6.3 Collections

A work may belong to multiple collections without duplication. Collections store title, statement, cover, ordered work references, dates, and optional exhibition metadata.

Support manual ordering, cover selection, manifest export, contact sheet, certificate bundle, and selected render packaging where practical.

Deleting a collection does not delete its works by default.

## 6.4 Snapshots and lineage

Named snapshots preserve exact state within a work. Support restore, duplicate as new work, compare, and delete non-protected snapshots.

Derived works store parent work/snapshot, timestamp, changed-property summary, seed-preservation state, and state hash.

Compare using side-by-side, press-and-hold, or swipe divider with equal framing.

## 6.5 Backup and portability

Provide a versioned archive format such as `.symbol137`, or a documented ZIP manifest containing works, snapshots, collections, thumbnails, versions, provenance, and integrity hashes.

Import must validate, migrate, preview, detect duplicates, and never overwrite without approval.

Core saving, exporting, importing, sharing, and offline editing must not require an account.

---

# 7. Mobile Information Architecture

## App bar

- Identity and work title.
- Modified status.
- Seed status.
- Undo/Redo.
- Export.

## Stage

- Artwork.
- Fit/fullscreen controls.
- Optional guides.
- Metadata strip.

## COMPOSE

- Story.
- Presets.
- Derived summary.
- Layers.

## FIELD

- Engine.
- Density.
- Scale.
- Stroke.
- Advanced geometry.

## MARKS

- Families.
- Global medium/type.
- Per-family overrides.
- Provenance.

## FINISH

- Palette.
- Surface.
- Background.
- Metadata.

## Global overlays

- Export.
- Engine chooser.
- History.
- Provenance.
- Works library.
- Onboarding.

---

# 8. Visual System

## Typography

- Preserve monospaced identity.
- App title: 15–17 px.
- Section title: 12–13 px uppercase with tracking.
- Operational control: 14–16 px.
- Secondary text: at least 12 px.
- Use tabular numerals for parameters.

## Spacing

Use a 4 px base:

- 4 px micro.
- 8 px internal.
- 12 px compact row.
- 16 px standard.
- 24 px section.
- 32 px major separation.

## Color roles

- Void: background.
- Bone: primary text.
- Ash: secondary text.
- Phosphor: active state.
- Lavender: derived/generated state.
- Rust/red: destructive state.
- Hairline: boundaries.

Do not introduce conventional blue SaaS chrome or rounded friendly cards that dilute the identity.

## Motion

- Sheet: 180–240 ms.
- Parameter response: immediate.
- Changed-setting pulse: 350–500 ms.
- Preset application feedback: no longer than 500 ms total.
- Respect reduced motion.

---

# 9. Responsive Rules

## 320–479 px

- Bottom-sheet architecture.
- Compact app bar.
- Four modes.
- No persistent explanatory prose.

## 480–767 px

- Larger preview.
- Two-column controls where comfortable.
- Full seed state in app bar.

## 768–1023 px

- Optional side control drawer.
- Fixed artwork.
- Modes may become vertical navigation.

## 1024 px and above

- Fixed artwork stage.
- Independently scrolling resizable sidebar.
- Optional advanced inspector.

---

# 10. State and Architecture Requirements

## Canonical state

Maintain a serializable canonical artwork state separate from UI state.

Artwork state includes:

- Schema version.
- Work identity.
- Story.
- Global seed and lock state.
- Layers and order.
- Layer seed inheritance.
- Engine and parameters.
- Mark families and overrides.
- Palette, finish, background, and output format.
- Atelier metadata.

UI state includes:

- Active mode.
- Sheet position.
- Accordion state.
- Scroll positions.
- Preview zoom/pan.
- Open dialogs.
- Temporary numeric input.

Only artwork state participates in deterministic sharing, saving, certificates, and output.

## Transaction boundary

All mutations to canonical artwork state must flow through a transaction API. Preview state is temporary and cannot be serialized as committed state.

## Determinism

The same normalized canonical state must produce the same result across refresh, saved-work restoration, share-link restoration, and archive import on supported platforms.

## Migration

Every persisted or shared state contains a schema version. Migrations must be testable, deterministic, and able to report dropped or normalized fields.

---

# 11. Testing and Verification Plan

## Determinism tests

- Same state yields identical mark positions and symbol choices.
- Seed lock prevents unintended replacement.
- Independent layer seeds survive global reroll.
- Share link restores state.
- Save/reopen restores state.
- Archive round trip restores state.

## Parameter tests

- Parsing and formatting.
- Range validation.
- Empty and invalid input.
- Step quantization.
- Decimal rounding.
- Locale handling.
- Continuous/throttled/commit-only behavior.
- Stale render rejection.

## History tests

- One transaction per gesture.
- Atomic preset undo.
- Exact layer deletion restoration.
- Saved pointer and Modified status.
- Redo branch invalidation.
- Recovery checkpoint behavior.

## Mobile interaction tests

1. Change Density while seeing artwork.
2. Apply Chaos → Order and undo once.
3. Lock seed, change engine, confirm seed preservation.
4. Add, reorder, and delete a layer by touch.
5. Export 9:16 PNG from app bar.
6. Enter exact Rotate X value.
7. Navigate all primary controls by keyboard.
8. Complete core flow with screen reader.
9. Rotate device without losing state.
10. Enter/exit Zen mode without state mutation.

## Performance targets

- Input controls remain responsive during rendering.
- Continuous previews avoid stale queues.
- Off-screen engine previews stop rendering.
- Large histories compact without changing current state.
- Library remains responsive with several hundred local works.

## Final quality gate

Before marking a phase complete:

- Run unit, integration, accessibility, and interaction tests.
- Verify at 320 × 568, 390 × 844, tablet, and desktop.
- Verify light browser chrome changes and orientation.
- Verify keyboard and screen-reader paths.
- Verify old shared/saved states migrate.
- Compare representative generated outputs with pre-redesign deterministic baselines.

---

# 12. Definition of Done

The redesign is complete when:

- Mobile composition never requires scrolling away from the artwork to evaluate common changes.
- All core parameters support exact deterministic entry.
- Seeds are explicit, lockable, shareable, and layer-aware.
- Every meaningful mutation is reversible.
- Advanced controls remain present but contextually disclosed.
- Export is prominent and reliable.
- New users can create quickly without reducing expert power.
- Provenance treats symbolic systems seriously.
- Zen mode supports uninterrupted viewing and capture.
- Works can be saved, versioned, collected, backed up, and restored locally.
- The redesign unmistakably remains Symbol Painter / MK·137.

---

# 13. Recommended First Implementation Pass for Claude

Execute this sequence rather than attempting the entire redesign in one uncontrolled rewrite:

1. Produce a repository audit and architecture map.
2. Identify and test the current canonical generated-state shape.
3. Introduce schema versioning and serialization tests if absent.
4. Separate artwork state from UI state.
5. Build the mobile app shell, stage, sheet, and mode navigation behind a feature flag.
6. Migrate the three core parameters—Density, Scale, Stroke Weight—to the shared precision component.
7. Implement transactional history around those parameters.
8. Implement global seed lock/reroll/share with tests.
9. Move the remaining existing controls into Compose, Field, Marks, and Finish without deleting features.
10. Promote Export and perform mobile accessibility QA.
11. Stop and report screenshots, test results, architectural changes, and unresolved risks before beginning Phase 3.

The first pass should establish the architecture that later phases extend. Do not duplicate state systems or build one-off controls that will need replacement.

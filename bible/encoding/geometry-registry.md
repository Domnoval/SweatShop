# Geometry registry

**Status: PROVISIONAL — not artist-approved.**
**Version identifier: `geometry/v1`**

> Spec Phase 1 requires every canonical glyph to be redrawn by the artist as
> clean SVG, checked on a contact sheet, and then frozen. The eighteen records
> in `packages/glyph-registry/src/geometry.v1.ts` are constructed placeholders
> that satisfy the structural contract — distinct silhouettes, declared anchors,
> collision envelopes, print-stroke minimums, and integrity hashes — so that
> every downstream engine could be built and tested against real geometry.
>
> **Replacing them is a data edit, not a code change.** No engine reads a glyph
> by name or reasons about its shape.

---

## The central invariant

> Canonical payload glyphs are authored vector geometry. Layout, mathematical
> substrate, corruption, decoys, and atmosphere may position, transform, mask,
> surround, or partially obscure those vectors, but may never redraw or mutate
> their path data.

This is enforced structurally rather than by convention:

- A layout solver receives `GlyphEnvelope` values — bounds, anchors, and an
  immutable geometry reference. There is no path data in the type, so there is
  nothing for a solver to edit.
- A substrate emits coordinates, frames, guides, regions, and masks. The
  `SubstrateSampler` interface has no way to express a glyph.
- The corruption engine sees `CorruptibleNode` — identifiers and eligibility
  flags. It never receives geometry at all.
- The renderer copies `LockedPath.d` verbatim from the registry and reports a
  `canonicalPathDigest` over exactly what it emitted.

Verification Gate 4 samples the registry digest at six pipeline stages and
asserts every path emitted into the payload layer is byte-identical to an
authored registry path.

---

## Record shape

```ts
type GlyphGeometryRecord = {
  id: GlyphGeometryId;
  version: string;
  viewBox: [number, number, number, number];
  paths: LockedPath[];            // d, role ("stroke" | "fill"), strokeWidth
  anchors: {
    center: Point;
    entry?: Point;                // where a reading path enters
    exit?: Point;                 // where it leaves
    modifierSlots: Point[];       // attachment points, in stack order
  };
  collisionEnvelope: Point[];     // never used for painting
  minimumPrintStrokePt: number;
  integritySha256: string;
};
```

`integritySha256` covers the record's **viewBox and path data only**. Anchors,
envelopes, and print minimums are layout metadata a later revision may refine
without redrawing the glyph. What must never change is the ink.

---

## The eighteen records

### Root families — viewBox `0 0 100 100`

| Id | Family | Construction |
| --- | --- | --- |
| `root-signal` | SIGNAL | Vertical stem, two radiating arcs, solid core |
| `root-body` | BODY | Closed vessel with a lintel bar and an interior division |
| `root-persistence` | PERSISTENCE | Broken ring with descending feet, crossed by a through-line |
| `root-void` | VOID | Ring interrupted at the crown, flanked by two ticks |
| `root-threshold` | THRESHOLD | Two posts, a lintel, and a sill |
| `root-witness` | WITNESS | Lens formed of opposed curves, with a solid pupil |
| `root-structure` | STRUCTURE | Square, cross-axes, and an inscribed rotated square |
| `root-transformation` | TRANSFORMATION | Triangle crossed by a horizontal bar |
| `root-duration` | DURATION | Full circle with two radii at unequal angles |

### Modifiers — viewBox `0 0 40 40`

| Id | Modifier | Construction |
| --- | --- | --- |
| `mod-intensify` | INTENSIFY | Doubled chevron |
| `mod-negate` | NEGATE | Single rising slash |
| `mod-collective` | COLLECTIVE | Three solid points in triangular arrangement |
| `mod-anterior` | ANTERIOR | Leading arc with an inward tick |

### Separators — viewBox `0 0 60 100`

| Id | Separator | Construction |
| --- | --- | --- |
| `sep-clause-break` | CLAUSE BREAK | Vertical rule terminated by two points |
| `sep-relation` | RELATION | Horizontal link through an open diamond |
| `sep-mirror-axis` | MIRROR AXIS | Paired vertical rules |
| `sep-void-gap` | VOID GAP | Three interrupted vertical strokes |

### Frame — viewBox `0 0 100 100`

| Id | Purpose |
| --- | --- |
| `frame-literal-escape` | Cartouche holding source the grammar does not interpret |

---

## Anchors

All root families currently share one anchor set:

- **center** `(50, 50)`
- **entry** `(6, 50)`, **exit** `(94, 50)` — a left-to-right reading axis, which
  layout solvers rotate to follow a substrate curve
- **modifier slots** `(78, 20)`, `(80, 80)`, `(20, 80)`, `(20, 20)` — the four
  corners, matching the four modifier slot indices

Real authored geometry should give each glyph its own anchors. A shared set is
a placeholder convenience, not a design decision.

---

## Collision envelopes

Currently a rectangle derived from each record's declared ink bounds. This is
conservative — it reserves more space than the glyph occupies — which is the
safe direction for a placeholder. Authored geometry should carry a tighter
convex polygon so that dense layouts pack correctly.

---

## Print minimums

Every record declares `minimumPrintStrokePt: 0.75`. The layout engine converts
each glyph's narrowest stroke to points at the output DPI and refuses the
compile if any placement would fall below its declared minimum. A record made
only of fills has its thinnest feature approximated from its ink box, so filled
glyphs are covered by the same check rather than exempt from it.

**0.75pt is an assumption, not a measurement.** Phase 10 physical proofing is
what turns it into a validated number, and it may differ per substrate — DTG on
cotton and litho on coated stock do not survive the same hairline.

---

## Integrity hashes

Hashes live in `geometry-integrity.v1.ts`, generated by `pnpm geometry:hash` and
committed alongside the paths. The registry recomputes them at load and refuses
to start on a mismatch.

Running the generator to silence a failing check would defeat its purpose. A
released geometry version is immutable: a redraw lands as `geometry/v2`, which
lets every plate that pinned v1 still render exactly as it did.

---

## Approval checklist

Before geometry v1 can drop its provisional flag:

- [ ] Every canonical glyph redrawn by the artist as clean SVG
- [ ] Modifier attachments and separators drawn to match
- [ ] Per-glyph anchors and tight collision envelopes assigned
- [ ] Minimum print strokes measured, not assumed, per substrate
- [ ] Contact sheet produced and visually approved
- [ ] `pnpm geometry:hash` run once, into a new version
- [ ] `GEOMETRY_IS_PROVISIONAL` set to `false`

# Substrate registry

**Version identifier: `substrate/v1`**

Mathematical substrates organize space. Spec §9 is strict about two things:
they must use real, documented constructions rather than fake equations, and
V1 must accept identifiers from a finite versioned registry rather than
arbitrary formulas.

Both hold here. `createSubstrate` takes a `SubstrateId` from a closed union; an
unknown identifier raises `UNKNOWN_SUBSTRATE` rather than evaluating something
the artist has not approved.

---

## What a substrate may and may not do

A substrate may generate coordinates, tangents and normals, guide curves,
regions, masks, registration marks, and annotation geometry.

**A substrate may not generate or alter canonical glyph paths** (spec §9.2).
The `SubstrateSampler` interface has no method that returns a glyph, which is
how that restriction is enforced rather than merely stated.

```ts
interface SubstrateSampler {
  pointAt(tFixed: number): Point;              // position on the primary curve
  frameAt(tFixed: number): { tangent, normal }; // orientation at that position
  anchors(count: number): Point[];             // discrete positions to snap to
  guides(density: number): SubstrateGuide[];   // substrate-layer geometry
  maskRegion?(bounds, rng): DeterministicMask;
}
```

`tFixed` is an integer in `[0, 1_000_000]` rather than a float in `[0, 1]`, so
stepping along a curve accumulates no floating-point drift and two runs sample
exactly the same positions.

---

## The six constructions

### Alpha Radial Lattice — `alpha-radial-lattice`

```
θₙ = 2πn / 137
```

137 angular divisions. Anchors snap to the nearest division, so glyph positions
always land on the lattice rather than between its spokes. Guides draw
concentric rings and a density-selected subset of the 137 radial spokes, spread
evenly so the field never looks accidentally sampled.

This is the golden fixture's substrate.

### Modular Residue Field — `modular-residue-field`

```
rₙ = n² mod 137
```

137 is prime, so `n² mod 137` takes exactly 69 distinct values and the field is
symmetric about `n = 137/2` by construction. Residue drives radius while `n`
drives angle, giving a distribution that is fully deterministic yet visually
non-periodic.

### Fine-Structure Construction — `fine-structure-construction`

```
α = e² / (4πε₀ℏc) ≈ 1/137.036
```

Used as **declared proportion and annotation only**. Spec §9.1 is explicit that
the constant must not be presented as a magical proof or padded with fabricated
derivations, and it is not: the code carries

```ts
export const ALPHA_APPROX_V1 = Object.freeze({ numerator: 1, denominator: 137 });
```

as an **explicit approximation**, and uses it to step a processional axis in
exact multiples of 1/137 of the field. The true value is irrational and is not
what this system needs.

### Golden Processional Spiral — `golden-processional-spiral`

```
r = a·e^(bθ),  b = ln(φ) / (π/2)
```

A genuine golden spiral: it grows by φ every quarter turn. Guides draw the
spiral plus quarter-turn radii marking where that growth has occurred. Useful
for directional phrases and progressive revelation.

### Lissajous Archive Field — `lissajous-archive-field`

```
x = A sin(3t + π/7),  y = B sin(7t)
```

The 1:3:7 ratio connects the field to Studio 137. That is a naming choice, and
the code says so — it is not a claim that the relationship is physically
fundamental.

### Voronoi Reliquary — `voronoi-reliquary`

Seeded sites produce cells that can contain clauses, roots, annotations, and
corrupted remnants. Cells are computed exactly by clipping the field rectangle
against each perpendicular bisector — no approximation, no external library.

Sites are jittered over a coarse grid rather than placed uniformly at random,
which keeps cells from degenerating into slivers while staying fully determined
by the seed.

---

## Fitting

Radial constructions measure against **half the short side** of the field, not
the short side itself. A ring at `0.7 × shortSide` on a 2:3 plate lands well
outside the canvas and is silently clipped, which reads as an accident rather
than a decision.

---

## Adding a substrate

1. Implement `SubstrateSampler` in `packages/substrate-engine/src/samplers.ts`.
2. Add its id to `SUBSTRATE_IDS` in `@studio137/plate-core`.
3. Register a factory in `SUBSTRATE_FACTORIES`.
4. Document the actual construction here, including what it is *not* claiming.
5. Confirm the sampler emits no glyph geometry — the interface prevents it, but
   a review should confirm intent as well as type.

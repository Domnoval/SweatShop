# Corruption classification

**Status: PROVISIONAL — not artist-approved.**
**Version identifier: `corruption/v1`**

Corruption in this system is a grammatical and transmission-state system, not a
generic distress filter. Every operation is classified, and the class determines
whether exact mode may use it.

---

## The two modes

### Exact mode

Guarantees source recovery. Permits **only** invertible operations or
non-destructive masking.

A glyph that appears erased is still present, complete, in the canonical vector
layer beneath a recorded mask:

```xml
<g id="canonical-payload">
  <g id="g000018" mask="url(#mask000004)">
    <!-- unchanged authored glyph paths -->
  </g>
</g>
```

### Stylized mode

Permits destructive visual corruption. The canonical AST stays intact and the
manifest retains the source; only the *public presentation* becomes visually
lossy. The interface must state:

```
Visual decoding is not guaranteed.
The source remains recoverable from the private encoding manifest.
```

---

## Operation classes

| Class | Reversible | Exact mode | What it does |
| --- | --- | --- | --- |
| `reversible-substitution` | yes | permitted | Swaps a root for its involution partner |
| `reversible-mirror` | yes | permitted | Reflects a glyph across an axis |
| `reversible-permutation` | yes | permitted | Nodes exchange the layout slots they occupy |
| `payload-occlusion` | yes | permitted | Covers part of a glyph with a recorded mask |
| `decorative-interference` | yes | permitted | Marks on a non-payload layer |
| `lossy-payload` | **no** | **refused** | Abrasion, dropout, misregistration |

`assertExactModePolicy` refuses any plan containing a `lossy-payload` operation
or any corruption site marked irreversible. In exact mode this runs at plan
time, so an exact plate can never claim an exactness it cannot deliver.

### What each records

Every operation records exactly what an inverse would need:

- **Substitution** — the original family and its geometry, so the swap can be
  undone. Substitution is an involution, so applying it twice also restores.
- **Mirror** — the node and the axis.
- **Permutation** — the authored order and the permuted order, per clause.
- **Occlusion** — the mask id, the covered node, the coverage fraction, the
  named stream fork the mask geometry came from, and the reading index at the
  time the mask was applied.

Masks are replayable from their stream fork name, which is why the manifest
stores a seed name rather than a dump of every mask coordinate.

---

## Bands

| UI range | Band | Behaviour |
| ---: | --- | --- |
| 0–15 | Canonical | Clean archive state with negligible interference |
| 16–35 | Noise | Minor substitutions, registration drift, and surface interruption |
| 36–60 | Interrupted | Clause occlusion, false passages, and mirrored fragments |
| 61–80 | Degraded | Heavy masks, decoy dominance, repeated echoes, broken reading order |
| 81–100 | Event Field | Near-unreadable public surface with canonical payload retained privately |

Three thresholds gate which operations become available:

- **0.36 (Interrupted)** — mirroring and permutation begin. Below this the plate
  is a clean archive with at most substitution and light interference.
- **0.61 (Degraded)** — destructive operations become available, *in stylized
  mode only*.
- **0.81 (Event Field)** — protected anchors become touchable, at 35% of the
  normal rate.

---

## Eligibility

Each node declares whether it may be mirrored, reordered, substituted,
occluded, duplicated, or surrounded by decoys. The current canon sets:

- **SIGNAL** — not occludable. A buried signal glyph says nothing.
- **VOID** — not duplicable. Duplicating an absence produces no reading.
- **TRANSFORMATION** — not substitutable. It is the unpaired family, and an
  ambiguous substitution would break exact decoding.
- **SIGNAL, VOID, TRANSFORMATION** — core anchors, protected below Event Field.

Plus, from the parser: the **first root of every clause** is that clause's
anchor and carries the same protection.

Permutation additionally leaves anchors in their slots, so a scrambled clause
retains a fixed point to read from.

---

## Decoys

Non-semantic marks that resemble payload but carry none. They borrow separator
and modifier geometry — notation that reads as authored without ever standing in
for a root concept.

Decoys keep clear of payload bounds and of the layout's protected negative
space, so a denser field never destroys the composition's hierarchy. Placement
is bounded rejection sampling: a crowded plate yields fewer decoys rather than
looping.

Decoys live in `decoys-behind` and `decoys-front`, never inside
`canonical-payload`, so decoding is never confused about what is payload.

---

## Atmosphere

The outermost non-payload layer: surface interference and a whole-plate
registration offset. Removing atmosphere must not alter payload geometry, which
Gate 7's authorship review confirms by rendering with the layer disabled and
comparing canonical path hashes.

---

## What the artist still owns

1. Whether these six operation classes are the right taxonomy at all.
2. The band boundaries and what each band should *feel* like.
3. Which families are anchors and which eligibility flags they carry.
4. Whether decoys should borrow real notation or use a dedicated non-semantic
   registry of their own.
5. What corruption should look like — the current mask geometry is a grid-cell
   selection, which is honest and replayable but not yet authored.

Until those are settled, corruption reads as systematic rather than as
transmission damage with a history.

/**
 * `correspondence/v1` — the module's claims, pinned.
 *
 * The correspondence table shipped with zero tests. Its coverage numbers were
 * asserted nowhere, its determinism claim was enforced by nothing, and its
 * `kamea` field named a square owned by `@studio137/walk-engine` through a
 * `PlanetKey` union the painter's key list happens to spell the same way — a
 * pointer with no verification behind it. Removing the duplicated magic square
 * (house rule 1) was right, but it traded a duplicate for an unchecked
 * reference: rename a square in walk-engine and this module would typecheck
 * cleanly while naming a square that no longer exists.
 *
 * Everything counted here is RECOUNTED from the exported tables. Nothing reads
 * `CORRESPONDENCE_COVERAGE` to learn what to expect — a test that reads the
 * number it is checking proves only that a number can be read. The literals
 * below are measured facts about the committed data; `CORRESPONDENCE_COVERAGE`
 * is then checked *against* the recount, in that direction, so a generator that
 * emits stale summary numbers fails here rather than being believed.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  BRUSH_BINDINGS,
  CONCEPT_CORRESPONDENCE,
  CORRESPONDENCE_COVERAGE,
  CORRESPONDENCE_IS_PROVISIONAL,
  CORRESPONDENCE_SOURCES,
  CORRESPONDENCE_VERSION,
  MARK_BINDINGS,
  TRADITION_LABELS,
  UNMAPPED_BRUSHES,
  WORD_CORRESPONDENCE,
  correspondenceForConcept,
  correspondenceForWord,
  geometryRegistryV2,
  type BrushKey,
  type ConceptCorrespondence,
  type TraditionKey,
} from "@studio137/glyph-registry";
import { SQUARE_IDS, isSquareId, resolve, walk, type SquareId } from "@studio137/walk-engine";

/* ── derivations ───────────────────────────────────────────────────────────
   Every count in this file comes from one of these. They read the tables and
   nothing else, so the expected values below are properties of the committed
   data rather than restatements of the summary the data ships with. */

const conceptByName: ReadonlyMap<string, ConceptCorrespondence> = new Map(
  CONCEPT_CORRESPONDENCE.map((c) => [c.concept, c] as const),
);

const conceptOf = (word: string): ConceptCorrespondence | undefined => {
  const row = WORD_CORRESPONDENCE.find((w) => w.word === word);
  return row === undefined ? undefined : conceptByName.get(row.concept);
};

const marksReachable: ReadonlySet<string> = new Set(
  CONCEPT_CORRESPONDENCE.flatMap((c) => [...c.markCandidates]),
);

const wordsReachingAMark = WORD_CORRESPONDENCE.filter(
  (w) => (conceptByName.get(w.concept)?.markCandidates.length ?? 0) > 0,
);

const wordsReachingNoMark = WORD_CORRESPONDENCE.filter(
  (w) => (conceptByName.get(w.concept)?.markCandidates.length ?? 0) === 0,
);

const conceptsReachingAMark = CONCEPT_CORRESPONDENCE.filter((c) => c.markCandidates.length > 0);
const conceptsReachingNoMark = CONCEPT_CORRESPONDENCE.filter((c) => c.markCandidates.length === 0);
const marksBoundToATradition = MARK_BINDINGS.filter((m) => m.tradition !== null);

const isSorted = (values: readonly string[]): boolean =>
  values.every((v, i) => i === 0 || values[i - 1]! < v);

const registry = geometryRegistryV2();

/* ── house rule 1: the kamea pointer ───────────────────────────────────────
   `@studio137/walk-engine` owns the squares. This module names one; it must
   not be able to name one that is not there. */

describe("every kamea a concept names is a square walk-engine actually owns", () => {
  it("resolves every concept's kamea through walk-engine's own membership test", () => {
    // The runtime half of the check the type system cannot make on its own:
    // `PlanetKey` is derived from the painter's key list, not from `SquareId`,
    // so the two agreeing is a coincidence until something asserts it. Rename
    // "luna" to "moon" in walk-engine and this is what notices.
    for (const c of CONCEPT_CORRESPONDENCE) {
      expect(isSquareId(c.kamea), `concept "${c.concept}" names kamea "${c.kamea}"`).toBe(true);
      expect(SQUARE_IDS).toContain(c.kamea);
    }
  });

  it("keeps PlanetKey assignable to SquareId at compile time", () => {
    // This annotation is the assertion: `tsc --noEmit` fails here if the two
    // unions ever diverge, which catches the rename before any test runs.
    // `ring()` already passes `correspondence.kamea` straight into `walk()`,
    // so a divergence is a real break and not a stylistic one.
    const namedSquares: readonly SquareId[] = CONCEPT_CORRESPONDENCE.map((c) => c.kamea);
    expect(namedSquares).toHaveLength(19);
  });

  it("names all seven squares between the nineteen concepts", () => {
    // Measured, not required: the 19 concepts happen to cover the whole of
    // SQUARE_IDS. Pinned as a change-detector — an eighth square in walk-engine,
    // or a concept moved off a square that then goes unused, is a decision
    // somebody should make deliberately rather than discover later.
    expect([...new Set(CONCEPT_CORRESPONDENCE.map((c) => c.kamea))].sort()).toStrictEqual(
      [...SQUARE_IDS].sort(),
    );
  });

  it("walks every named kamea without the walk engine refusing it", () => {
    for (const c of CONCEPT_CORRESPONDENCE) {
      const figure = walk("SIGNAL", { square: c.kamea });
      expect(figure.square).toBe(c.kamea);
      expect(figure.steps.length).toBeGreaterThan(0);
    }
  });
});

describe("planet and kamea are the same field twice", () => {
  it("has planet === kamea on all nineteen concepts", () => {
    // The table records both because the painter records both; they are equal
    // for every concept today. If they ever diverge that is a real editorial
    // decision — a concept ruled by one planet but walked on another square —
    // and it should arrive as a failing test rather than as a silent drift.
    expect(CONCEPT_CORRESPONDENCE).toHaveLength(19);
    for (const c of CONCEPT_CORRESPONDENCE) {
      expect(c.planet, `concept "${c.concept}"`).toBe(c.kamea);
    }
  });
});

/* ── resolution ────────────────────────────────────────────────────────────*/

describe("all 170 words resolve", () => {
  it("carries 170 distinct words", () => {
    expect(WORD_CORRESPONDENCE).toHaveLength(170);
    expect(new Set(WORD_CORRESPONDENCE.map((w) => w.word)).size).toBe(170);
  });

  it("routes every word to a concept that exists", () => {
    for (const row of WORD_CORRESPONDENCE) {
      expect(
        conceptByName.has(row.concept),
        `word "${row.word}" routes to concept "${row.concept}"`,
      ).toBe(true);
      expect(correspondenceForConcept(row.concept)?.concept).toBe(row.concept);
    }
  });

  it("resolves every word through correspondenceForWord", () => {
    for (const row of WORD_CORRESPONDENCE) {
      const hit = correspondenceForWord(row.word);
      expect(hit, `word "${row.word}"`).toBeDefined();
      expect(hit?.concept).toBe(row.concept);
    }
  });

  it("resolves case-insensitively in every casing the painter could hand it", () => {
    for (const row of WORD_CORRESPONDENCE) {
      const upper = correspondenceForWord(row.word.toUpperCase());
      const title = correspondenceForWord(row.word[0]!.toUpperCase() + row.word.slice(1));
      expect(upper?.concept, `word "${row.word}" uppercased`).toBe(row.concept);
      expect(title?.concept, `word "${row.word}" title-cased`).toBe(row.concept);
    }
  });

  it("leaves every concept reachable from at least one word", () => {
    for (const c of CONCEPT_CORRESPONDENCE) {
      expect(c.words.length, `concept "${c.concept}"`).toBeGreaterThan(0);
      expect(WORD_CORRESPONDENCE.some((w) => w.concept === c.concept)).toBe(true);
    }
  });

  it("agrees with itself about which words route to each concept", () => {
    for (const c of CONCEPT_CORRESPONDENCE) {
      const routed = WORD_CORRESPONDENCE.filter((w) => w.concept === c.concept)
        .map((w) => w.word)
        .sort();
      expect([...c.words], `concept "${c.concept}"`).toStrictEqual(routed);
    }
    expect(CONCEPT_CORRESPONDENCE.flatMap((c) => [...c.words])).toHaveLength(170);
  });
});

/* ── coverage, recounted ───────────────────────────────────────────────────*/

describe("coverage numbers, recounted from the tables", () => {
  it("counts 170 words, 159 of them reaching at least one mark", () => {
    expect(WORD_CORRESPONDENCE.length).toBe(170);
    expect(wordsReachingAMark.length).toBe(159);
    expect(wordsReachingNoMark.length).toBe(11);
    expect(wordsReachingAMark.length + wordsReachingNoMark.length).toBe(170);
  });

  it("counts 19 concepts, 18 of them reaching at least one mark", () => {
    expect(CONCEPT_CORRESPONDENCE.length).toBe(19);
    expect(conceptsReachingAMark.length).toBe(18);
    expect(conceptsReachingNoMark.length).toBe(1);
  });

  it("counts 50 marks locked, 49 bound to a tradition, 33 reachable from a concept", () => {
    expect(MARK_BINDINGS.length).toBe(50);
    expect(marksBoundToATradition.length).toBe(49);
    expect(marksReachable.size).toBe(33);
    // "Locked" means locked in geometry/v2, so count it there too rather than
    // only in this module's own list — an independent source for the same 50.
    expect(registry.ids.filter((id) => id.startsWith("mark-"))).toHaveLength(50);
    expect(MARK_BINDINGS.map((m) => m.mark).sort()).toStrictEqual(
      registry.ids.filter((id) => id.startsWith("mark-")).sort(),
    );
  });

  it("names the exact 17 marks no concept reaches", () => {
    const unreached = MARK_BINDINGS.map((m) => m.mark)
      .filter((m) => !marksReachable.has(m))
      .sort();
    expect(unreached).toHaveLength(17);
    expect(unreached).toStrictEqual([
      "mark-abraxas",
      "mark-adinkrahene",
      "mark-akoma",
      "mark-baronsamedi",
      "mark-chaossphere",
      "mark-chaosstar",
      "mark-damballa",
      "mark-dwennimmen",
      "mark-eban",
      "mark-erzulie",
      "mark-gyenyame",
      "mark-legba",
      "mark-leviathancross",
      "mark-lucifersigil",
      "mark-nkyinkyim",
      "mark-sankofa",
      "mark-sigillumdei",
    ]);
    expect(unreached.length + marksReachable.size).toBe(50);
  });

  it("counts 8 brushes, 7 of them mapped to a tradition", () => {
    expect(BRUSH_BINDINGS).toHaveLength(7);
    expect(UNMAPPED_BRUSHES).toHaveLength(1);
    expect(UNMAPPED_BRUSHES[0]?.brush).toBe("sigil");
    const declared = new Set<BrushKey>([
      ...BRUSH_BINDINGS.map((b) => b.brush),
      ...UNMAPPED_BRUSHES.map((u) => u.brush),
    ]);
    expect(declared.size).toBe(8);
    // No brush may be both mapped and unmapped.
    expect(BRUSH_BINDINGS.length + UNMAPPED_BRUSHES.length).toBe(declared.size);
  });

  it("counts 13 codex traditions, 8 of them reached by some brush", () => {
    expect(Object.keys(TRADITION_LABELS)).toHaveLength(13);
    expect(new Set(BRUSH_BINDINGS.flatMap((b) => [...b.traditions])).size).toBe(8);
  });

  it("makes CORRESPONDENCE_COVERAGE answer to the recount, not the other way round", () => {
    // The summary object is generated. This is the only place it is read, and it
    // is read to be checked: a generator that recomputes the tables but forgets
    // to recompute the banner numbers is exactly the failure this catches.
    const cov = CORRESPONDENCE_COVERAGE;
    expect(cov.words).toBe(WORD_CORRESPONDENCE.length);
    expect(cov.wordsReachingAMark).toBe(wordsReachingAMark.length);
    expect(cov.wordsReachingNoMark).toBe(wordsReachingNoMark.length);
    expect([...cov.wordsReachingNoMarkList]).toStrictEqual(
      wordsReachingNoMark.map((w) => w.word).sort(),
    );
    expect(cov.concepts).toBe(CONCEPT_CORRESPONDENCE.length);
    expect(cov.conceptsReachingAMark).toBe(conceptsReachingAMark.length);
    expect(cov.conceptsReachingNoMark).toBe(conceptsReachingNoMark.length);
    expect([...cov.conceptsReachingNoMarkNames]).toStrictEqual(
      conceptsReachingNoMark.map((c) => c.concept).sort(),
    );
    expect(cov.marksLocked).toBe(MARK_BINDINGS.length);
    expect(cov.marksBoundToATradition).toBe(marksBoundToATradition.length);
    expect(cov.marksReachableFromAConcept).toBe(marksReachable.size);
    expect([...cov.marksReachableFromNoConcept]).toStrictEqual(
      MARK_BINDINGS.map((m) => m.mark)
        .filter((m) => !marksReachable.has(m))
        .sort(),
    );
    expect(cov.traditionsInCodex).toBe(Object.keys(TRADITION_LABELS).length);
    expect(cov.traditionsReachedByABrush).toBe(
      new Set(BRUSH_BINDINGS.flatMap((b) => [...b.traditions])).size,
    );
    expect(cov.brushesDefined).toBe(BRUSH_BINDINGS.length + UNMAPPED_BRUSHES.length);
    expect(cov.brushesMapped).toBe(BRUSH_BINDINGS.length);
    expect(cov.brushesUnmapped).toBe(UNMAPPED_BRUSHES.length);
    expect([...cov.brushesUsedByNoConcept]).toStrictEqual(
      [...new Set([...BRUSH_BINDINGS.map((b) => b.brush), ...UNMAPPED_BRUSHES.map((u) => u.brush)])]
        .filter((b) => !CONCEPT_CORRESPONDENCE.some((c) => c.brushes.includes(b)))
        .sort(),
    );

    const perPlanet = Object.fromEntries(
      [...new Set(CONCEPT_CORRESPONDENCE.map((c) => c.planet))]
        .sort()
        .map((p) => [p, CONCEPT_CORRESPONDENCE.filter((c) => c.planet === p).length] as const),
    );
    expect({ ...cov.conceptsPerPlanet }).toStrictEqual(perPlanet);
    expect(Object.values(perPlanet).reduce((a, b) => a + b, 0)).toBe(19);

    const perTradition = Object.fromEntries(
      (Object.keys(TRADITION_LABELS) as TraditionKey[])
        .sort()
        .map((t) => [t, MARK_BINDINGS.filter((m) => m.tradition === t).length] as const),
    );
    expect({ ...cov.marksPerTradition }).toStrictEqual(perTradition);
    expect(Object.values(perTradition).reduce((a, b) => a + b, 0)).toBe(49);

    expect([...cov.traditionsWithNoDrawnMark]).toStrictEqual(
      (Object.keys(TRADITION_LABELS) as TraditionKey[])
        .filter(
          (t) =>
            !MARK_BINDINGS.some((m) => m.tradition === t) &&
            BRUSH_BINDINGS.some((b) => b.traditions.includes(t)),
        )
        .sort(),
    );
    expect([...cov.traditionsReachedByNoBrush]).toStrictEqual(
      (Object.keys(TRADITION_LABELS) as TraditionKey[])
        .filter((t) => !BRUSH_BINDINGS.some((b) => b.traditions.includes(t)))
        .sort(),
    );
  });
});

/* ── the documented hole ───────────────────────────────────────────────────*/

describe("`mind` reaching zero marks is a finding, not a bug", () => {
  it("leaves `mind` with no mark candidates, on purpose", () => {
    /*
     * `mind` carries brushes hebrew + sigil + trigram, which reach traditions
     * "kab" and "ich". Both are traditions the extractor drew NO marks for
     * (marksPerTradition: kab 0, ich 0), and `sigil` maps to no tradition at all
     * — it walks a WORDS entry across a kamea and selects no codex row. So the
     * intersection is genuinely empty and the table records that rather than
     * inventing an edge.
     *
     * This assertion is here so that the day `mind` acquires candidates, someone
     * has to explain where they came from. The recorded prediction for the
     * tempting fix is explicit: bind `sigil` to "alch"+"ang" on the coincidence
     * that 5 painter WORDS share a spelling with a codex row, and `mind` jumps
     * from 0 candidates to 3 on the strength of a word list. That is precisely
     * the kind of edge this table refuses, and a green test suite must not be
     * what welcomes it in.
     */
    const mind = correspondenceForConcept("mind");
    expect(mind).toBeDefined();
    expect(mind?.markCandidates).toStrictEqual([]);
    expect(conceptsReachingNoMark.map((c) => c.concept)).toStrictEqual(["mind"]);
    expect([...(mind?.traditions ?? [])]).toStrictEqual(["ich", "kab"]);
    expect([...(mind?.brushesReachingNoMark ?? [])]).toStrictEqual(["hebrew", "sigil", "trigram"]);
    // Every one of its brushes is dark, which is why the concept is.
    expect(mind?.brushesReachingNoMark).toStrictEqual(mind?.brushes);
  });

  it("still resolves all eleven of `mind`'s words — a dark concept gates nothing", () => {
    const words = ["hermes", "idea", "intellect", "magic", "magick", "mercury", "mind", "thought", "thoughts", "word", "words"];
    expect(wordsReachingNoMark.map((w) => w.word).sort()).toStrictEqual([...words].sort());
    for (const w of words) {
      expect(correspondenceForWord(w)?.concept, `word "${w}"`).toBe("mind");
      expect(walk(w, { square: "mercury" }).steps.length).toBeGreaterThan(0);
    }
  });
});

/* ── marks resolve ─────────────────────────────────────────────────────────*/

describe("every mark id the table names resolves in the geometry registry", () => {
  it("resolves every concept's candidates to a real record with ink", () => {
    for (const c of CONCEPT_CORRESPONDENCE) {
      for (const mark of c.markCandidates) {
        expect(registry.has(mark), `concept "${c.concept}" candidate "${mark}"`).toBe(true);
        const record = registry.get(mark);
        expect(record.paths.length, `${mark} has paths`).toBeGreaterThan(0);
        const box = registry.inkBounds(mark);
        expect(box.width, `${mark} ink width`).toBeGreaterThan(0);
        expect(box.height, `${mark} ink height`).toBeGreaterThan(0);
      }
    }
  });

  it("resolves every MARK_BINDINGS entry, including the unbound one", () => {
    for (const binding of MARK_BINDINGS) {
      expect(registry.has(binding.mark), `binding "${binding.mark}"`).toBe(true);
      expect(binding.mark).toBe(`mark-${binding.stem}`);
    }
  });

  it("names no mark twice and leaves no locked mark unaccounted for", () => {
    expect(new Set(MARK_BINDINGS.map((m) => m.mark)).size).toBe(MARK_BINDINGS.length);
    for (const id of registry.ids.filter((i) => i.startsWith("mark-"))) {
      expect(MARK_BINDINGS.some((m) => m.mark === id), `locked mark "${id}"`).toBe(true);
    }
  });
});

/* ── the joins hold ────────────────────────────────────────────────────────*/

describe("every edge in the table is derivable from the edge before it", () => {
  it("derives each concept's traditions from its brushes and nothing else", () => {
    const traditionsOf = new Map(BRUSH_BINDINGS.map((b) => [b.brush, b.traditions] as const));
    for (const c of CONCEPT_CORRESPONDENCE) {
      const derived = [...new Set(c.brushes.flatMap((b) => [...(traditionsOf.get(b) ?? [])]))].sort();
      expect([...c.traditions], `concept "${c.concept}"`).toStrictEqual(derived);
    }
  });

  it("derives each concept's mark candidates from its traditions and nothing else", () => {
    for (const c of CONCEPT_CORRESPONDENCE) {
      const derived = MARK_BINDINGS.filter(
        (m) => m.tradition !== null && c.traditions.includes(m.tradition),
      )
        .map((m) => m.mark)
        .sort();
      expect([...c.markCandidates], `concept "${c.concept}"`).toStrictEqual(derived);
    }
  });

  it("derives each concept's dark brushes from which traditions have drawn marks", () => {
    const traditionsOf = new Map(BRUSH_BINDINGS.map((b) => [b.brush, b.traditions] as const));
    for (const c of CONCEPT_CORRESPONDENCE) {
      const derived = c.brushes
        .filter((b) => {
          const ts = traditionsOf.get(b);
          if (ts === undefined) return true; // unmapped brush reaches nothing
          return ts.every((t) => !MARK_BINDINGS.some((m) => m.tradition === t));
        })
        .sort();
      expect([...c.brushesReachingNoMark], `concept "${c.concept}"`).toStrictEqual(derived);
    }
  });

  it("uses only tradition keys the codex actually defines", () => {
    const known = new Set(Object.keys(TRADITION_LABELS));
    for (const c of CONCEPT_CORRESPONDENCE) {
      for (const t of c.traditions) expect(known.has(t), `concept "${c.concept}" → "${t}"`).toBe(true);
    }
    for (const b of BRUSH_BINDINGS) {
      for (const t of b.traditions) expect(known.has(t), `brush "${b.brush}" → "${t}"`).toBe(true);
    }
    for (const m of MARK_BINDINGS) {
      if (m.tradition !== null) expect(known.has(m.tradition), `mark "${m.mark}"`).toBe(true);
    }
  });

  it("uses only brush keys some binding declares", () => {
    const declared = new Set<BrushKey>([
      ...BRUSH_BINDINGS.map((b) => b.brush),
      ...UNMAPPED_BRUSHES.map((u) => u.brush),
    ]);
    for (const c of CONCEPT_CORRESPONDENCE) {
      for (const b of c.brushes) expect(declared.has(b), `concept "${c.concept}" → "${b}"`).toBe(true);
    }
  });

  it("carries a stated reason wherever no join was made (house rule 6)", () => {
    // Every gap is recorded as a PREDICTION — what would measurably differ if
    // the choice were flipped — never as an adjective.
    for (const b of BRUSH_BINDINGS) {
      expect(b.rule.length, `brush "${b.brush}" rule`).toBeGreaterThan(0);
      expect(b.evidence.length, `brush "${b.brush}" evidence`).toBeGreaterThan(0);
      for (const u of b.unresolved) {
        expect(u.reason, `brush "${b.brush}" token "${u.token}"`).toContain("PREDICTION IF FLIPPED");
      }
    }
    for (const u of UNMAPPED_BRUSHES) {
      expect(u.reason, `unmapped brush "${u.brush}"`).toContain("PREDICTION IF FLIPPED");
    }
    for (const m of MARK_BINDINGS) {
      // The ordinary id-join carries no note; anything else must account for itself.
      expect(m.note === "", `mark "${m.mark}" via "${m.via}"`).toBe(m.via === "codex-id");
      if (m.note !== "") expect(m.note, `mark "${m.mark}"`).toContain("PREDICTION IF FLIPPED");
    }
  });
});

/* ── shape ─────────────────────────────────────────────────────────────────*/

describe("the exported collections are sorted and deeply frozen", () => {
  it("sorts every collection by its own key", () => {
    // Iteration order must not depend on insertion order or on object-key order
    // anywhere in this pipeline (spec §5.3) — the emitted file is a build output
    // and a reordering would change bytes for no semantic reason.
    expect(isSorted(WORD_CORRESPONDENCE.map((w) => w.word))).toBe(true);
    expect(isSorted(CONCEPT_CORRESPONDENCE.map((c) => c.concept))).toBe(true);
    expect(isSorted(MARK_BINDINGS.map((m) => m.mark))).toBe(true);
    expect(isSorted(BRUSH_BINDINGS.map((b) => b.brush))).toBe(true);
    expect(isSorted(UNMAPPED_BRUSHES.map((u) => u.brush))).toBe(true);
  });

  it("sorts every nested list too", () => {
    for (const c of CONCEPT_CORRESPONDENCE) {
      expect(isSorted(c.words), `concept "${c.concept}" words`).toBe(true);
      expect(isSorted(c.brushes), `concept "${c.concept}" brushes`).toBe(true);
      expect(isSorted(c.traditions), `concept "${c.concept}" traditions`).toBe(true);
      expect(isSorted(c.markCandidates), `concept "${c.concept}" candidates`).toBe(true);
      expect(isSorted(c.brushesReachingNoMark), `concept "${c.concept}" dark brushes`).toBe(true);
    }
    for (const b of BRUSH_BINDINGS) {
      expect(isSorted(b.traditions), `brush "${b.brush}" traditions`).toBe(true);
      expect(isSorted(b.unresolved.map((u) => u.token)), `brush "${b.brush}" unresolved`).toBe(true);
    }
  });

  it("freezes every exported structure all the way down", () => {
    const seen = new Set<object>();
    const walkFrozen = (value: unknown, path: string): void => {
      if (value === null || typeof value !== "object") return;
      if (seen.has(value)) return;
      seen.add(value);
      expect(Object.isFrozen(value), `${path} is frozen`).toBe(true);
      if (Array.isArray(value)) {
        value.forEach((v, i) => { walkFrozen(v, `${path}[${i}]`); });
      } else {
        for (const [k, v] of Object.entries(value)) walkFrozen(v, `${path}.${k}`);
      }
    };
    walkFrozen(CONCEPT_CORRESPONDENCE, "CONCEPT_CORRESPONDENCE");
    walkFrozen(WORD_CORRESPONDENCE, "WORD_CORRESPONDENCE");
    walkFrozen(MARK_BINDINGS, "MARK_BINDINGS");
    walkFrozen(BRUSH_BINDINGS, "BRUSH_BINDINGS");
    walkFrozen(UNMAPPED_BRUSHES, "UNMAPPED_BRUSHES");
    walkFrozen(TRADITION_LABELS, "TRADITION_LABELS");
    walkFrozen(CORRESPONDENCE_COVERAGE, "CORRESPONDENCE_COVERAGE");
    walkFrozen(CORRESPONDENCE_SOURCES, "CORRESPONDENCE_SOURCES");
  });

  it("declares what it is and that it is provisional", () => {
    expect(CORRESPONDENCE_VERSION).toBe("correspondence/v1");
    expect(CORRESPONDENCE_IS_PROVISIONAL).toBe(true);
    expect(CORRESPONDENCE_SOURCES.geometry).toBe(registry.version);
  });
});

/* ── house rule 3 ──────────────────────────────────────────────────────────*/

describe("house rule 3: correspondence gates nothing", () => {
  const strangers = ["xyzzy", "ACE", "plugh", "qwertyuiop", "Zzyzx", "137"];

  it("has no entry for any of these words", () => {
    for (const w of strangers) {
      expect(correspondenceForWord(w), `word "${w}"`).toBeUndefined();
      expect(WORD_CORRESPONDENCE.some((row) => row.word === w.toLowerCase())).toBe(false);
    }
  });

  it("resolves and walks them anyway, through walk-engine, without refusal", () => {
    // The concept rides; it never gates. `ring()` reads this same lookup and
    // falls back to the house square on undefined, so a stranger must produce a
    // real walk rather than an exception or an empty figure.
    for (const w of strangers) {
      const resolution = resolve(w, 3);
      const figure = walk(w, { square: "jupiter" });
      const letters = [...w].filter((ch) => /[a-z]/iu.test(ch)).length;
      expect(resolution.letters, `resolve("${w}")`).toHaveLength(letters);
      expect(figure.steps, `walk("${w}")`).toHaveLength(letters);
      expect(figure.square).toBe("jupiter");
      if (letters > 0) expect(figure.points.length).toBeGreaterThan(0);
    }
  });

  it("resolves a word the table does know on exactly the same path", () => {
    // Membership must buy a concept, not permission. "fire" and "xyzzy" differ
    // in what rides along, never in whether the letters resolve.
    const known = walk("fire", { square: "jupiter" });
    const stranger = walk("xyzz", { square: "jupiter" });
    expect(known.steps).toHaveLength(4);
    expect(stranger.steps).toHaveLength(4);
    expect(correspondenceForWord("fire")).toBeDefined();
    expect(correspondenceForWord("xyzz")).toBeUndefined();
  });

  it("returns undefined rather than throwing on empty and non-letter input", () => {
    expect(correspondenceForWord("")).toBeUndefined();
    expect(correspondenceForWord("   ")).toBeUndefined();
    expect(correspondenceForConcept("no-such-concept")).toBeUndefined();
    expect(resolve("", 3).letters).toHaveLength(0);
    expect(walk("", { square: "jupiter" }).steps).toHaveLength(0);
  });
});

/* ── house rule 2: determinism is the product ──────────────────────────────*/

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const repoPath = (...parts: string[]): string => join(TEST_DIR, "..", ...parts);

const COMMITTED = repoPath("packages", "glyph-registry", "src", "correspondence.v1.ts");

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/**
 * SHA-256 of the committed `correspondence.v1.ts`, byte for byte.
 *
 * TO REGENERATE, when the table is meant to change:
 *   pnpm exec tsx scripts/build-correspondence.ts
 *   sha256sum packages/glyph-registry/src/correspondence.v1.ts
 * and paste the new digest here in the same commit as the regenerated file.
 *
 * The generator re-run below already proves the committed file is what the
 * generator produces. This pin catches the case that check cannot see: a table
 * regenerated from CHANGED sources, where generator and file still agree with
 * each other but the canon has moved. That must be a deliberate, reviewed edit
 * to this line, not a silent one.
 */
const COMMITTED_SHA256 = "a844db8b2e2638e73b0fd220036a69f50467e6a312b6147bcc9365613a1dfc90";

/** Everything `scripts/build-correspondence.ts` reads, by repo-relative path. */
const GENERATOR_INPUTS: readonly string[] = [
  join("assets", "symbolpaintermk137.html"),
  join("assets", "codexdata.ts"),
  join("packages", "glyph-registry", "src", "geometry.v2.ts"),
];

describe("house rule 2: the committed table is what the generator produces", () => {
  it("matches the pinned content hash of the committed file", () => {
    expect(sha256(readFileSync(COMMITTED))).toBe(COMMITTED_SHA256);
  });

  it("reproduces the committed file byte for byte, twice, from the same inputs", () => {
    /*
     * Run the real generator, in a throwaway tree, twice.
     *
     * The tree is a copy rather than the repo because the generator's output
     * path is fixed relative to its own location: pointing it at the checkout
     * would have a test rewriting a committed source file. Copying the script
     * and its inputs into a temp directory gives the same run with nothing at
     * stake, and running it twice is the actual house-rule-2 proof — same
     * input, same bytes — rather than a claim that it is deterministic.
     *
     * The temp tree needs its own package.json declaring `"type": "module"`:
     * without it tsx compiles the script as CJS and its top-level `await
     * import(...)` of the codex fails to transform.
     */
    const tsxBin = repoPath("node_modules", ".bin", "tsx");
    expect(existsSync(tsxBin), `tsx is a devDependency and must be installed: ${tsxBin}`).toBe(true);

    const sandbox = mkdtempSync(join(tmpdir(), "s137-correspondence-"));
    try {
      mkdirSync(join(sandbox, "scripts"), { recursive: true });
      mkdirSync(join(sandbox, "assets"), { recursive: true });
      mkdirSync(join(sandbox, "packages", "glyph-registry", "src"), { recursive: true });
      writeFileSync(join(sandbox, "package.json"), '{"type":"module"}\n', "utf8");

      for (const input of GENERATOR_INPUTS) {
        copyFileSync(repoPath(input), join(sandbox, input));
      }
      const script = join(sandbox, "scripts", "build-correspondence.ts");
      copyFileSync(repoPath("scripts", "build-correspondence.ts"), script);

      const emitted = join(sandbox, "packages", "glyph-registry", "src", "correspondence.v1.ts");
      const run = (): string => {
        // The generator refuses to write and exits non-zero when the table it
        // built disagrees with itself; execFileSync turns that into a throw.
        execFileSync(tsxBin, [script], { cwd: sandbox, stdio: "pipe" });
        return sha256(readFileSync(emitted));
      };

      const first = run();
      const second = run();

      expect(second, "two runs over identical inputs produced different bytes").toBe(first);
      expect(first, "the committed table is not what the generator produces").toBe(
        sha256(readFileSync(COMMITTED)),
      );
      expect(readFileSync(emitted, "utf8")).toBe(readFileSync(COMMITTED, "utf8"));
    } finally {
      rmSync(sandbox, { recursive: true, force: true });
    }
  });

  it("records where each edge came from", () => {
    expect(CORRESPONDENCE_SOURCES.painter).toBe("assets/symbolpaintermk137.html");
    expect(CORRESPONDENCE_SOURCES.codex).toBe("assets/codexdata.ts");
    for (const input of GENERATOR_INPUTS) {
      expect(existsSync(repoPath(input)), `generator input ${input}`).toBe(true);
    }
  });
});

/* ── the lookup itself ─────────────────────────────────────────────────────*/

describe("correspondenceForWord returns the same object the tables hold", () => {
  it("hands back the concept row, not a copy", () => {
    for (const c of CONCEPT_CORRESPONDENCE) {
      const viaWord = correspondenceForWord(c.words[0]!);
      expect(viaWord).toBe(c);
      expect(correspondenceForConcept(c.concept)).toBe(c);
    }
  });

  it("agrees with the recount for every word about whether a mark is reachable", () => {
    for (const row of WORD_CORRESPONDENCE) {
      const direct = conceptOf(row.word);
      expect(correspondenceForWord(row.word)).toBe(direct);
    }
  });
});

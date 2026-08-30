/**
 * Station 5 and the round-trip audit.
 *
 * The audit is the measuring stick, so these tests are mostly about proving it
 * can fail. A runner that reports success on everything measures nothing.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  auditVocabulary,
  formatReceipt,
  inferOrder,
  inverseCipher,
  read,
  walk,
} from "@studio137/walk-engine";

const VOCAB = ["ACE", "SUN", "DESCENT", "DECENT", "FALL", "MIRROR", "BETWEEN", "TIDE", "TIME"];

const roundTrip = (word: string, vocabulary: readonly string[] = VOCAB) =>
  read(walk(word, { square: "jupiter", trace: "AGRIPPA" }).paths, { vocabulary });

describe("the read is blind", () => {
  it("reaches no manifest, key, or envelope — structurally, not by promise", () => {
    // House rule 8. The CLI's `decode` recovers a phrase from an encrypted
    // manifest using the master key; that proves custody of a copy, never that a
    // mark carries a word. If this package could reach it, the audit would pass
    // while measuring nothing. The ablation is that there is nothing to ablate.
    const pkg = JSON.parse(
      readFileSync(new URL("../packages/walk-engine/package.json", import.meta.url), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(Object.keys(pkg.dependencies ?? {})).toStrictEqual(["@studio137/plate-core"]);

    const sources = ["cipher", "read", "resolve", "squares", "walk", "audit", "index"];
    for (const name of sources) {
      const src = readFileSync(
        new URL(`../packages/walk-engine/src/${name}.ts`, import.meta.url),
        "utf8",
      );
      expect(src).not.toMatch(/private-manifest|artifact-security|masterKey|openManifest|decodePlate/u);
    }
  });

  it("infers the square's order from the drawing rather than being told", () => {
    const figure = walk("DESCENT", { square: "jupiter" });
    // No `square` option: the order is measured off the lattice the points sit on.
    expect(read(figure.paths, { vocabulary: VOCAB }).order).toBe(4);
    expect(read(walk("DESCENT", { square: "saturn" }).paths).order).toBe(3);
    expect(read(walk("DESCENT", { square: "luna" }).paths).order).toBe(9);
  });

  it("returns nothing when the figure carries no node at all", () => {
    // This test used to read "returns nothing at all when handed no line", and
    // it was asserting a defect: a word whose letters all share a cell draws no
    // line — one point is not a segment — so `no line` was taken to mean `no
    // information` and A, AS, WE and every other one-cell word read back blank.
    // The boundary is a node, not a line. No paths, no node, nothing to read.
    const empty = read([], { vocabulary: VOCAB });
    expect(empty.cells).toStrictEqual([]);
    expect(empty.matches).toStrictEqual([]);
    expect(empty.order).toBeUndefined();
    expect(empty.orders).toStrictEqual([]);

    // The counter-case, so the assertion above cannot quietly widen again: the
    // same figure with no line but a cap reads back.
    const capOnly = walk("A", { square: "jupiter", trace: "AGRIPPA" });
    expect(capOnly.paths.map((p) => p.role)).toStrictEqual(["start-cap"]);
    expect(read(capOnly.paths, { vocabulary: ["A"] }).cells).toStrictEqual([1]);
  });

  it("rejects an order that does not explain the points", () => {
    expect(inferOrder([[0, 0]])).toBeUndefined();
  });

  it("reads back a word whose letters all land on one cell", () => {
    // The walk has no straight segment, so there is no line path — only a cap
    // and one loop per repeat. Everything below reads back from those alone.
    for (const [word, cells] of [
      ["A", [1]],
      ["AS", [1, 1]],
      ["WE", [5, 5]],
      ["AA", [1, 1]],
      ["ZZ", [8, 8]],
      ["QQQ", [8, 8, 8]],
      ["ZZZZZZZZZ", [8, 8, 8, 8, 8, 8, 8, 8, 8]],
    ] as const) {
      const figure = walk(word, { square: "jupiter", trace: "AGRIPPA" });
      expect(figure.paths.some((p) => p.role === "line")).toBe(false);
      const reading = read(figure.paths, { vocabulary: [word] });
      expect(`${word}: ${reading.cells.join("·")}`).toBe(`${word}: ${cells.join("·")}`);
      expect(reading.matches).toContain(word);
      expect(reading.order).toBe(4);
    }
  });

  it("takes the repeat count off the nested loops, not off a guess", () => {
    // ZZZZZZZZZ is nine letters on one Jupiter cell: one node, eight loops. The
    // outer four are clamped to the same radius so they cannot fit the frame
    // twice over, and the count survives that clamp because it is the number of
    // loop paths, not their sizes.
    const figure = walk("ZZZZZZZZZ", { square: "jupiter", trace: "AGRIPPA" });
    expect(figure.paths.filter((p) => p.role === "loop")).toHaveLength(8);
    expect(read(figure.paths).cells).toHaveLength(9);
    // Ablation: drop the loops and the drawing says one letter, not nine. That
    // is the census's own load-bearing claim for the loop glyph, measured.
    expect(read(figure.paths.filter((p) => p.role !== "loop")).cells).toHaveLength(1);
  });

  it("reads a capless one-cell figure from its loop nodes", () => {
    // LINEA draws no caps, so the loops are the only marks on the sheet. The
    // node is the loop's own start point, which is the cell centre exactly.
    const figure = walk("AS", { square: "jupiter", trace: "LINEA" });
    expect(figure.paths.map((p) => p.role)).toStrictEqual(["loop"]);
    expect(read(figure.paths, { vocabulary: ["AS"] }).matches).toStrictEqual(["AS"]);
  });

  it("reports every order one node admits rather than picking one", () => {
    // A single point cannot pin a lattice down the way six can. E on Saturn is
    // the centre cell, and every odd square puts a cell centre at 110 — so the
    // drawing names four squares, not one. Reporting only the coarsest would
    // print `order 3` with the confidence DESCENT's `order 4` is printed with.
    const reading = read(walk("E", { square: "saturn" }).paths, { vocabulary: ["E"] });
    expect(reading.orders).toStrictEqual([3, 5, 7, 9]);
    expect(reading.squares).toStrictEqual(["saturn", "mars", "venus", "luna"]);
    expect(reading.readings).toStrictEqual([[5], [13], [25], [41]]);
    // Only Saturn's cell 5 is a value any letter carries, so the word survives
    // the ambiguity — the reader narrows by the cipher, not by choosing early.
    expect(reading.matches).toStrictEqual(["E"]);

    // Six points on Jupiter admit exactly one order; the ambiguity is a property
    // of the figure, not a new hedge on every read.
    expect(read(walk("DESCENT").paths).orders).toStrictEqual([4]);
  });

  it("refuses to order two nodes with no line between them", () => {
    // A cap says which node is first; nothing says what follows it. `walk()`
    // never emits this figure, so refusing costs nothing on a real plate and
    // keeps a hand-made one from reading back a word it does not carry.
    const nodes = [
      walk("A", { trace: "AGRIPPA" }).paths[0]!,
      walk("B", { trace: "AGRIPPA" }).paths[0]!,
    ];
    const reading = read(nodes, { vocabulary: ["AB", "BA"] });
    expect(reading.cells).toStrictEqual([]);
    expect(reading.matches).toStrictEqual([]);
  });

  it("reads the same figure the same way twice, to the byte", () => {
    for (const word of ["A", "AS", "ZZZZZZZZZ", "DESCENT", "BETWEEN"]) {
      const paths = walk(word, { trace: "AGRIPPA" }).paths;
      const once = JSON.stringify(read(paths, { vocabulary: [word, ...VOCAB] }));
      const twice = JSON.stringify(read(paths, { vocabulary: [word, ...VOCAB] }));
      expect(once).toBe(twice);
    }
  });
});

describe("the inverse cipher", () => {
  it("gives every Pythagorean value its two or three letters", () => {
    const inv = inverseCipher("PYTH", 9);
    expect(inv.get(1)).toStrictEqual(["A", "J", "S"]);
    expect(inv.get(9)).toStrictEqual(["I", "R"]);
    expect([...inv.keys()].sort((a, b) => a - b)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  /**
   * The reason the second argument exists, stated as the experiment that used to
   * fail. The map is of CELLS, and a cell is `reduceToCell(value, order)`. PYTH
   * hides the distinction — its values are already 1 to 9 and every square in the
   * set has at least 9 cells — so keyed on the raw value it looked right for
   * years. HEB does not hide it: J is 10 and S is 100, and on a 3x3 both reduce
   * to cell 1 alongside A.
   */
  it("keys on the cell the plate carries, not the number the cipher assigns", () => {
    const heb = inverseCipher("HEB", 9);
    expect(heb.get(1)).toStrictEqual(["A", "J", "S"]);
    // The raw values are gone: no reading can contain a 10, so a bucket under 10
    // is a bucket no reader can ever reach.
    expect([...heb.keys()].every((k) => k >= 1 && k <= 9)).toBe(true);
    expect(heb.get(10)).toBeUndefined();
    expect(heb.get(100)).toBeUndefined();
    // Every letter still lands somewhere. A letter with no bucket is a letter the
    // reader can never propose, which is how a word stops being recoverable.
    const placed = [...heb.values()].flat().sort();
    expect(placed).toStrictEqual([..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"]);
  });

  it("gives a bigger square finer buckets, because fewer values need reducing", () => {
    // Luna is 9x9 = 81 cells, so HEB's tens survive unreduced and J is alone in
    // cell 10 — a cell PYTH can never reach, since its values stop at 9.
    const luna = inverseCipher("HEB", 81);
    expect(luna.get(10)).toStrictEqual(["J"]);
    // S is 100, still over 81, so it reduces to 1 and shares with A. T is 200,
    // which reduces to 2. The hundreds are the only letters still collapsing.
    expect(luna.get(1)).toStrictEqual(["A", "S"]);
    expect(luna.get(2)).toStrictEqual(["B", "T"]);
    // Strictly more buckets than on a 3x3: the same cipher, read at a finer
    // resolution, is a less ambiguous cipher.
    expect(luna.size).toBeGreaterThan(inverseCipher("HEB", 9).size);
  });
});

describe("the round trip", () => {
  it("recovers each fixture from its drawing alone", () => {
    for (const word of ["DESCENT", "DECENT", "FALL", "MIRROR"]) {
      expect(roundTrip(word).matches).toContain(word);
    }
  });

  it("returns both halves of a collision rather than choosing", () => {
    expect(roundTrip("ACE").matches).toStrictEqual(["ACE", "SUN"]);
    expect(roundTrip("SUN").matches).toStrictEqual(["ACE", "SUN"]);
  });

  it("keeps DESCENT and DECENT apart — near-marks, not the same mark", () => {
    expect(roundTrip("DESCENT").matches).toStrictEqual(["DESCENT"]);
    expect(roundTrip("DECENT").matches).toStrictEqual(["DECENT"]);
  });

  it("enumerates every reading when a figure is genuinely ambiguous", () => {
    // BETWEEN walks 2-5-2-5, so both visits to cell 5 arrive from the same
    // direction and the two drawings are point-for-point identical. The loop run
    // could hang on either. Guessing one would lose the word outright; the reader
    // reports both readings instead, and the word survives.
    const r = roundTrip("BETWEEN");
    expect(r.ambiguousLoops).toBe(true);
    expect(r.readings.length).toBeGreaterThan(1);
    expect(r.matches).toContain("BETWEEN");
  });

  it("is unambiguous when a repeated cell is arrived at only once", () => {
    expect(roundTrip("FALL").ambiguousLoops).toBe(false);
  });
});

describe("the audit runner", () => {
  it("finds the ACE/SUN collision", () => {
    // The Done Bar names this case, and it cannot come from the 170-word run —
    // ACE is not in the studio vocabulary, only SUN is. So the detector is proven
    // here, on a probe set that contains both. A runner that misses this is
    // broken by definition; a runner that never sees ACE simply never met it.
    const report = auditVocabulary(VOCAB);
    const collision = report.collisions.find((c) => c.digits === "1·3·5");
    expect(collision).toBeDefined();
    expect(collision!.words).toStrictEqual(["ACE", "SUN"]);
  });

  it("reports collisions as findings, with both words named", () => {
    const report = auditVocabulary(VOCAB);
    for (const c of report.collisions) expect(c.words.length).toBeGreaterThan(1);
    expect(formatReceipt(report)).toContain("ACE = SUN");
  });

  it("counts resolution separately from recovery", () => {
    // Resolution is 100% by construction — letters always resolve — so it is not
    // evidence of anything. Recovery is the number that can move.
    const report = auditVocabulary(VOCAB);
    expect(report.resolved).toBe(report.total);
    expect(report.uniquelyRecovered).toBeLessThan(report.total);
  });

  it("notices when a word walks out and does not come back", () => {
    // Counter-verification for the runner itself: a vocabulary of one word whose
    // drawing is ambiguous still recovers, but a word read against a vocabulary
    // that excludes it must be reported lost rather than quietly passed.
    const report = auditVocabulary(["DESCENT"], { square: "jupiter" });
    expect(report.lost).toStrictEqual([]);
    const reading = read(walk("DESCENT").paths, { vocabulary: ["FALL"] });
    expect(reading.matches).toStrictEqual([]);
  });

  it("prints a receipt that states what was not proven", () => {
    const receipt = formatReceipt(auditVocabulary(VOCAB));
    expect(receipt).toContain("The read is blind");
    expect(receipt).toContain("resolved");
    expect(receipt).toContain("uniquely recovered");
  });

  it("is deterministic — the same vocabulary prints a byte-identical receipt", () => {
    expect(formatReceipt(auditVocabulary(VOCAB))).toBe(formatReceipt(auditVocabulary([...VOCAB].reverse())));
  });
});

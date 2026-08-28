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

  it("returns nothing at all when handed no line", () => {
    const empty = read([], { vocabulary: VOCAB });
    expect(empty.cells).toStrictEqual([]);
    expect(empty.matches).toStrictEqual([]);
    expect(empty.order).toBeUndefined();
  });

  it("rejects an order that does not explain the points", () => {
    expect(inferOrder([[0, 0]])).toBeUndefined();
  });
});

describe("the inverse cipher", () => {
  it("gives every Pythagorean value its two or three letters", () => {
    const inv = inverseCipher("PYTH");
    expect(inv.get(1)).toStrictEqual(["A", "J", "S"]);
    expect(inv.get(9)).toStrictEqual(["I", "R"]);
    expect([...inv.keys()].sort((a, b) => a - b)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
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

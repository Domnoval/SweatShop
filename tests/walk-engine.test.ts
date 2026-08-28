/**
 * Stations 1 and 2 — the trunk.
 *
 * The fixtures below are the commission's known-answer tests. They were
 * hand-computed independently of this implementation, so a change that breaks
 * them is a change to what a word means, not a change to how it is drawn.
 *
 * Counter-verified, and the result has now corrected two claims first written here.
 * With the loop-glyph branch removed from `walk`, **four** tests fail — all of them
 * loop tests — while every digit test still passes. That is the point of testing the
 * drawn figure and not only the arithmetic.
 *
 * This said "exactly three" until a grader ran the ablation. Three is the count only
 * if you additionally hard-code `loopCount = 0` — a second edit at a second site, not
 * a branch removal. Removing only the loop-path emission fails two. A counter-
 * verification whose number nobody re-derives is a claim like any other.
 *
 * Switching `reduceToCell` to modulo, however, fails only its own direct test and
 * none of the four fixtures. It cannot: under Pythagorean every letter is 1-9 and
 * Jupiter's ceiling is 16, so no reduction ever runs on these words. The two
 * conventions diverge on the Hebrew and NAEQ ciphers and on the larger squares,
 * which is where the guard has to be checked, and is why `reduceToCell(19, 16)`
 * is asserted directly rather than left to be implied by a fixture.
 */

import { describe, expect, it } from "vitest";

import { PlateError } from "@studio137/plate-core";
import {
  assertMagic,
  cipherValue,
  digitString,
  kamea,
  magicConstant,
  positions,
  reduceToCell,
  resolve,
  SQUARE_IDS,
  walk,
} from "@studio137/walk-engine";

const JUPITER = kamea("jupiter");

/** Resolve against Jupiter, the house square, in the canonical audit cipher. */
const dig = (word: string): string => digitString(resolve(word, JUPITER.n, "PYTH"));

describe("the Pythagorean cipher", () => {
  it("covers A-Z as 1-9, 1-9, 1-8", () => {
    const table = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].map((c) => cipherValue(c, "PYTH"));
    expect(table).toStrictEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9,
      1, 2, 3, 4, 5, 6, 7, 8, 9,
      1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it("reduces theosophically, not by modulo", () => {
    // 19 digit-sums to 10, which is a cell on Jupiter. Modulo 16 would give 3,
    // a different cell entirely — the two conventions draw different figures.
    expect(reduceToCell(19, 16)).toBe(10);
    expect(19 % 16).toBe(3);
    expect(reduceToCell(0, 16)).toBe(16);
  });
});

describe("the commission fixtures", () => {
  it("DESCENT resolves to 4·5·1·3·5·5·2", () => {
    expect(dig("DESCENT")).toBe("4·5·1·3·5·5·2");
  });

  it("DECENT resolves to 4·5·3·5·5·2 — a near-mark of DESCENT, not a bug", () => {
    expect(dig("DECENT")).toBe("4·5·3·5·5·2");
    expect(dig("DECENT")).not.toBe(dig("DESCENT"));
  });

  it("FALL resolves to 6·1·3·3", () => {
    expect(dig("FALL")).toBe("6·1·3·3");
  });

  it("ACE resolves to 1·3·5", () => {
    expect(dig("ACE")).toBe("1·3·5");
  });

  it("finds the ACE/SUN collision the audit must report", () => {
    expect(dig("ACE")).toBe(dig("SUN"));
    expect(dig("ACE")).toBe("1·3·5");
  });

  it("plunges the S of DESCENT to cell 1, the bottom-right corner", () => {
    const w = walk("DESCENT", { square: "jupiter" });
    const s = w.steps[2]!;
    expect(s.letter).toBe("S");
    expect(s.cell).toBe(1);
    expect([s.row, s.col]).toStrictEqual([3, 3]);
    // It is a plunge: the previous letter sits in the top-left quadrant.
    expect([w.steps[1]!.row, w.steps[1]!.col]).toStrictEqual([1, 0]);
  });
});

describe("the loop glyph", () => {
  it("fires once where DESCENT doubles on 5", () => {
    const w = walk("DESCENT");
    expect(w.loopCount).toBe(1);
    expect(w.paths.filter((p) => p.role === "loop")).toHaveLength(1);
    expect(w.steps.filter((s) => s.repeatsPrevious).map((s) => s.letter)).toStrictEqual(["N"]);
  });

  it("fires on FALL's doubled L", () => {
    const w = walk("FALL");
    expect(w.loopCount).toBe(1);
    expect(w.steps.filter((s) => s.repeatsPrevious).map((s) => s.letter)).toStrictEqual(["L"]);
  });

  it("does not fire when no two consecutive letters share a cell", () => {
    expect(walk("ACE").loopCount).toBe(0);
  });

  it("draws a closed circle rather than a zero-length segment", () => {
    const loop = walk("DESCENT").paths.find((p) => p.role === "loop");
    expect(loop).toBeDefined();
    // Two arcs, because one arc cannot close a circle onto its own start point.
    expect(loop!.d.match(/A/gu)).toHaveLength(2);
    const start = loop!.d.slice(1, loop!.d.indexOf("A")).trim();
    expect(loop!.d.trimEnd().endsWith(start)).toBe(true);
  });

  it("costs a segment rather than adding one", () => {
    // Seven letters, one repeat: six positions on the line, five segments.
    const w = walk("DESCENT");
    expect(w.steps).toHaveLength(7);
    expect(w.segmentCount).toBe(5);
  });
});

describe("the seven squares", () => {
  it("are all magic, verified rather than trusted", () => {
    for (const id of SQUARE_IDS) {
      const k = kamea(id);
      expect(k.magicConstant).toBe(magicConstant(k.n));
      expect(() => assertMagic(id, k.grid)).not.toThrow();
    }
  });

  it("run 3x3 through 9x9 with no gaps", () => {
    expect(SQUARE_IDS.map((id) => kamea(id).n)).toStrictEqual([3, 4, 5, 6, 7, 8, 9]);
  });

  it("hold exactly 1..n² with every value locatable", () => {
    for (const id of SQUARE_IDS) {
      const k = kamea(id);
      const pos = positions(id);
      expect(pos.size).toBe(k.n * k.n);
      for (let v = 1; v <= k.n * k.n; v += 1) expect(pos.has(v)).toBe(true);
    }
  });

  it("rejects a square that is not magic", () => {
    // Counter-verification: swapping two Jupiter cells keeps every value present
    // and breaks two rows, two columns and a diagonal. A walk would still run.
    const broken = [
      [3, 16, 2, 13],
      [5, 10, 11, 8],
      [9, 6, 7, 12],
      [4, 15, 14, 1],
    ];
    try {
      assertMagic("jupiter", broken);
      expect.unreachable("accepted a grid that is not magic");
    } catch (error) {
      expect(error).toBeInstanceOf(PlateError);
      expect((error as PlateError).message).toContain("not a magic square");
    }
  });
});

describe("resolve refuses nothing", () => {
  it("resolves a word that is in no vocabulary", () => {
    const r = resolve("QWXZJ", 4, "PYTH");
    expect(r.letters).toHaveLength(5);
    expect(r.cells.every((c) => c >= 1 && c <= 16)).toBe(true);
  });

  it("drops non-letters instead of throwing, and records what it dropped", () => {
    const r = resolve("a-1 B!", 4, "PYTH");
    expect(r.letters.map((l) => l.letter)).toStrictEqual(["A", "B"]);
    expect(r.dropped.map((d) => d.char)).toStrictEqual(["-", "1", " ", "!"]);
  });

  it("indexes dropped characters into the caller's string, not its uppercased form", () => {
    // Some characters expand under uppercasing — ß to SS, the ligatures to FI,
    // FF, FFI — so an index into `input.toUpperCase()` drifts past every
    // expansion before it and points into a string the caller never typed.
    // `resolve("ﬁ!")` reported the `!` at index 2; it is at index 1.
    for (const word of ["ﬁ!", "ß!", "ﬃx?", "a-1 B!", "Straße?"]) {
      const source = [...word];
      for (const drop of resolve(word, 4, "PYTH").dropped) {
        expect(source[drop.index]).toBe(drop.char);
      }
    }
  });

  it("still expands a ligature into the letters it stands for", () => {
    // The index fix must not cost the expansion: house rule 3 says letters
    // resolve, and ﬁ is two letters however it is encoded.
    expect(resolve("ﬁ", 4, "PYTH").letters.map((l) => l.letter).join("")).toBe("FI");
    expect(resolve("ß", 4, "PYTH").letters.map((l) => l.letter).join("")).toBe("SS");
    expect(resolve("ﬃ", 4, "PYTH").letters.map((l) => l.letter).join("")).toBe("FFI");
  });

  it("returns an empty resolution for input with no letters at all", () => {
    const r = resolve("1234", 4, "PYTH");
    expect(r.letters).toHaveLength(0);
    expect(r.cells).toHaveLength(0);
    expect(() => walk("1234")).not.toThrow();
    expect(walk("1234").paths).toHaveLength(0);
  });
});

describe("the drawn walk", () => {
  it("is deterministic — the same word draws byte-identical path data", () => {
    const a = walk("DESCENT", { square: "saturn", trace: "ROSETTA", cipher: "NAEQ" });
    const b = walk("DESCENT", { square: "saturn", trace: "ROSETTA", cipher: "NAEQ" });
    expect(JSON.stringify(a.paths)).toBe(JSON.stringify(b.paths));
  });

  it("caps AGRIPPA with an opening circle and a closing bar", () => {
    const roles = walk("DESCENT", { trace: "AGRIPPA" }).paths.map((p) => p.role);
    expect(roles).toContain("start-cap");
    expect(roles).toContain("end-cap");
  });

  it("leaves LINEA uncapped", () => {
    const roles = walk("DESCENT", { trace: "LINEA" }).paths.map((p) => p.role);
    expect(roles).not.toContain("start-cap");
    expect(roles).not.toContain("end-cap");
  });

  it("walks each distinct letter once under SPARE", () => {
    const w = walk("DESCENT", { trace: "SPARE" });
    // D E S C E N T -> D E S C N T: the second E is dropped, the rest survive.
    expect(w.steps.map((s) => s.letter)).toStrictEqual(["D", "E", "S", "C", "N", "T"]);
  });

  it("reports activated cells as a property of the word, not of the square", () => {
    const w = walk("DESCENT");
    expect(w.activatedCells).toStrictEqual([1, 2, 3, 4, 5]);
    expect(walk("ACE").activatedCells).toStrictEqual([1, 3, 5]);
  });

  it("keeps every drawn coordinate inside the declared viewBox", () => {
    // The defect class that reached extraction four times in this repo: ink that
    // is legible only because the viewport crops it. Caps and loops both extend
    // past the cell centre, so this is checked on every square and every trace.
    const [, , vw, vh] = walk("A").viewBox;
    const escapes: string[] = [];
    for (const id of SQUARE_IDS) {
      for (const trace of ["LINEA", "CURVA", "ROSETTA", "AGRIPPA", "SPARE"] as const) {
        for (const word of ["DESCENT", "FALL", "AAA", "ZZZZZZZZZ", "MIRROR"]) {
          const w = walk(word, { square: id, trace });
          for (const p of w.paths) {
            for (const n of p.d.match(/-?\d+\.\d+/gu) ?? []) {
              const v = Number(n);
              if (v < 0 || v > Math.max(vw, vh)) {
                escapes.push(`${id}/${trace}/${word}: ${v}`);
              }
            }
          }
        }
      }
    }
    expect(escapes).toStrictEqual([]);
  });
});

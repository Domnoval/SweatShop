/**
 * The chord-family generator, and the hue channel it needs.
 *
 * The envelope construction was chosen for one property above any other: the
 * cusp count is *countable off the drawing*, and it derives from the word. A
 * reader who distrusts the caption can check the picture against it. A sixteen-
 * point star drawn because sixteen looked good cannot be checked at all.
 */

import { describe, expect, it } from "vitest";

import { NODES, cuspsForWalk, envelopeFromWalk, multiplierForWalk } from "@studio137/envelope-engine";
import { normalizePalette, spectrumColor, DEFAULT_PALETTE } from "@studio137/render-svg";
import { walk } from "@studio137/walk-engine";

const jupiter = (word: string) => walk(word, { square: "jupiter", trace: "AGRIPPA" });

describe("the envelope is derived, not styled", () => {
  it("uses a prime node count so no multiplier degenerates", () => {
    // 137 is prime, so every multiplier below it is coprime and the family closes
    // as one cycle over all nodes. A composite count would let some multipliers
    // collapse into a sparse sub-figure.
    expect(NODES).toBe(137);
    for (let d = 2; d * d <= NODES; d += 1) expect(NODES % d).not.toBe(0);
    expect(envelopeFromWalk(jupiter("DESCENT")).nodes).toBe(137);
  });

  it("reduces the cell sum theosophically — the same operation that places a letter", () => {
    // DESCENT sums to 25 -> 7; ACE to 9 -> 9; FALL to 13 -> 4. Taking the sum raw
    // put the multiplier in the forties, and forty crowded cusps are not
    // countable at any node density.
    expect(multiplierForWalk(jupiter("DESCENT"))).toBe(8);
    expect(multiplierForWalk(jupiter("ACE"))).toBe(10);
    expect(multiplierForWalk(jupiter("FALL"))).toBe(5);
  });

  it("draws a cusp count a reader can actually count", () => {
    expect(cuspsForWalk(jupiter("DESCENT"))).toBe(7);
    expect(cuspsForWalk(jupiter("ACE"))).toBe(9);
    expect(cuspsForWalk(jupiter("FALL"))).toBe(4);
    // The claim printed on every sheet is that cusps are countable by eye. That
    // is only true while the count stays small; assert the bound the claim needs.
    for (const w of ["DESCENT", "ACE", "FALL", "LONGING", "SWEATSHOP", "BETWEEN"]) {
      expect(cuspsForWalk(jupiter(w))).toBeLessThanOrEqual(9);
      expect(cuspsForWalk(jupiter(w))).toBeGreaterThanOrEqual(1);
    }
  });

  it("gives two words of equal weight the same envelope — a visible collision", () => {
    // ACE and SUN already collide in the audit; the figure collides too, rather
    // than papering over it with a difference the numbers do not support.
    expect(envelopeFromWalk(jupiter("ACE")).multiplier).toBe(
      envelopeFromWalk(jupiter("SUN")).multiplier,
    );
  });

  it("folds the degenerate multipliers onto the smallest real figure", () => {
    // m of 0 or 1 collapses every chord to a point or to the identity, drawing
    // an empty layer that reads as a bug rather than as a plate.
    // Cell sum 25 against 25 nodes gives m = 0 — every chord would collapse.
    const zero = envelopeFromWalk(jupiter("DESCENT"), { nodes: 25 });
    expect(zero.multiplier).toBeGreaterThanOrEqual(2);
    expect(zero.chordCount).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const a = envelopeFromWalk(jupiter("DESCENT"));
    const b = envelopeFromWalk(jupiter("DESCENT"));
    expect(JSON.stringify(a.bands)).toBe(JSON.stringify(b.bands));
  });

  it("keeps every chord inside the frame it declares", () => {
    // Same defect class as the walk: ink outside the box is legible only because
    // a viewport crops it, and layout reserves the declared extent regardless.
    for (const word of ["DESCENT", "ACE", "ZZZZZZZZZ", "A"]) {
      const family = envelopeFromWalk(jupiter(word));
      for (const band of family.bands) {
        for (const n of band.d.match(/-?\d+\.\d+/gu) ?? []) {
          expect(Number(n)).toBeGreaterThanOrEqual(0);
          expect(Number(n)).toBeLessThanOrEqual(220);
        }
      }
    }
  });

  it("advances hue with position in the family, not at random", () => {
    const bands = envelopeFromWalk(jupiter("DESCENT"), { bands: 12 }).bands;
    const hues = bands.map((b) => b.hue);
    expect(hues).toStrictEqual([...hues].sort((a, b) => a - b));
    expect(hues[0]).toBe(0);
    expect(Math.max(...hues)).toBeLessThan(1);
  });

  it("emits no zero-length chord", () => {
    for (const band of envelopeFromWalk(jupiter("DESCENT")).bands) {
      for (const seg of band.d.split("M").filter(Boolean)) {
        const [a, b] = seg.split("L").map((half) => half.trim().split(/\s+/u).map(Number));
        expect(`${a![0]},${a![1]}`).not.toBe(`${b![0]},${b![1]}`);
      }
    }
  });
});

describe("the hue channel", () => {
  it("does nothing at all when no ramp is declared", () => {
    // The whole point of the design: a plate that declares no spectrum renders
    // exactly as it did before this channel existed. Gate 3's golden hashes are
    // the real proof of this and they are unchanged; this is the unit statement.
    expect(spectrumColor(DEFAULT_PALETTE, 0.5)).toBeUndefined();
    expect(DEFAULT_PALETTE.spectrum).toBeUndefined();
  });

  it("does nothing when a guide carries no hue, even with a ramp present", () => {
    const palette = { ...DEFAULT_PALETTE, spectrum: ["#112233", "#445566"] };
    expect(spectrumColor(palette, undefined)).toBeUndefined();
  });

  it("indexes the ramp by hue", () => {
    const palette = { ...DEFAULT_PALETTE, spectrum: ["#111111", "#222222", "#333333", "#444444"] };
    expect(spectrumColor(palette, 0)).toBe("#111111");
    expect(spectrumColor(palette, 0.26)).toBe("#222222");
    expect(spectrumColor(palette, 0.99)).toBe("#444444");
  });

  it("clamps rather than reading off the end of the ramp", () => {
    const palette = { ...DEFAULT_PALETTE, spectrum: ["#111111", "#222222"] };
    expect(spectrumColor(palette, 1)).toBe("#222222");
    expect(spectrumColor(palette, -1)).toBe("#111111");
  });

  it("normalizes every ramp entry, so no two runs differ by #FFF versus #ffffff", () => {
    const normalized = normalizePalette({ ...DEFAULT_PALETTE, spectrum: ["#ABC", "#DDEEFF"] });
    expect(normalized.spectrum).toStrictEqual(["#aabbcc", "#ddeeff"]);
  });

  it("rejects a ramp entry that is not sRGB hex", () => {
    expect(() =>
      normalizePalette({ ...DEFAULT_PALETTE, spectrum: ["rgb(1,2,3)"] }),
    ).toThrowError();
  });
});

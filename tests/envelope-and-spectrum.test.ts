/**
 * The chord-family generator, and the hue channel it needs.
 *
 * The envelope construction was chosen for one property above any other: the
 * cusp count is *countable off the drawing*, and it derives from the word. A
 * reader who distrusts the caption can check the picture against it. A sixteen-
 * point star drawn because sixteen looked good cannot be checked at all.
 */

import { describe, expect, it } from "vitest";

import { envelopeFromWalk, multiplierForWalk, nodesForOrder } from "@studio137/envelope-engine";
import { normalizePalette, spectrumColor, DEFAULT_PALETTE } from "@studio137/render-svg";
import { walk } from "@studio137/walk-engine";

const jupiter = (word: string) => walk(word, { square: "jupiter", trace: "AGRIPPA" });

describe("the envelope is derived, not styled", () => {
  it("takes its node count from the square rather than from taste", () => {
    // Magic constant times order — both properties of the kamea, so the density
    // of the figure is a fact about which square was walked.
    expect(nodesForOrder(4, 34)).toBe(136);
    expect(envelopeFromWalk(jupiter("DESCENT")).nodes).toBe(136);
    expect(envelopeFromWalk(walk("DESCENT", { square: "saturn" })).nodes).toBe(45);
  });

  it("takes its multiplier from the walk's cell sum", () => {
    // DESCENT is 4+5+1+3+5+5+2 = 25; ACE is 1+3+5 = 9; FALL is 6+1+3+3 = 13.
    expect(multiplierForWalk(jupiter("DESCENT"), 136)).toBe(25);
    expect(multiplierForWalk(jupiter("ACE"), 136)).toBe(9);
    expect(multiplierForWalk(jupiter("FALL"), 136)).toBe(13);
  });

  it("draws a cusp count a reader can verify by counting", () => {
    expect(envelopeFromWalk(jupiter("DESCENT")).cusps).toBe(24);
    expect(envelopeFromWalk(jupiter("ACE")).cusps).toBe(8);
    expect(envelopeFromWalk(jupiter("FALL")).cusps).toBe(12);
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

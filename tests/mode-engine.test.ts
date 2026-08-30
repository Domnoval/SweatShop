/**
 * THE MODE ENGINE — the suite for the layer that was sitting in a table.
 *
 * `packages/mode-engine` ports the painter's ten composition modes onto the
 * walk, and `packages/ring` dispatches on the `composition.mode` every concept
 * has always carried and nothing has ever read. Both halves are checked here,
 * and the checks are written the way `tests/ring.test.ts` writes them, for the
 * same reason: this repository has shipped five false derivations, and the one
 * thing that has ever caught them is a suite that RECOMPUTES the claim instead
 * of matching the string.
 *
 * So there are two relation tables below, not one list of expected values:
 *
 *   1. Over the MODE CENSUS, per word — every number the ring prints about the
 *      field it painted, recomputed from the engine. Coverage is enforced: a
 *      sentence carrying a number that no relation can evaluate FAILS. That is
 *      what makes this table catch the next stale sentence and not merely the
 *      last one.
 *   2. Over the SIGNED CONSTANTS — the twenty-three magic numbers carried over
 *      from `assets/symbolpaintermk137.html`, each recorded with a prediction of
 *      what a reader would measure differently if it were flipped. Every one of
 *      those predictions is re-run here. They were all written from measurement,
 *      and three of them were wrong on the first draft and are in the git history
 *      as such: the golden-angle sentence claimed 720 rays where the arithmetic
 *      gives 144, the organic sentence claimed no word starves where 148 of 170
 *      do, and the attractor sentence claimed 6 concept words degenerate where 10
 *      do. A prediction nobody re-runs is an adjective with a number in it.
 *
 * The rest is house rules turned into exit codes: ink inside the viewBox over
 * ten modes, seven squares and hostile words; the same word twice byte for byte;
 * no input refused; no `<text>`; no `Math.random`; and the ten constructions
 * genuinely differing from each other rather than differing by a caption.
 */

import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { CONCEPT_CORRESPONDENCE, WORD_CORRESPONDENCE } from "@studio137/glyph-registry";
import {
  baseStampRadius,
  BOX,
  contextFromWalk,
  dcos,
  dsin,
  fieldFromWalk,
  MIN_STROKE,
  MODE_IDS,
  MODE_SPECS,
  mulberry32,
  requestedFor,
  SAFE_PAD,
  seedFromWalk,
  stampFor,
  type ModeField,
  type ModeId,
} from "@studio137/mode-engine";
import { ring, SPECTRUM, type RingArtifacts } from "@studio137/ring";
import { SQUARE_IDS, walk, type Walk } from "@studio137/walk-engine";

/* ── the battery ─────────────────────────────────────────────────────────── */

/**
 * Words chosen for what they break.
 *
 * The letterless input and the all-one-cell input are the two that have cost
 * this repository defects before; the CJK and emoji inputs are here because
 * house rule 3 says nothing may refuse an input; the 300-character input is here
 * because a field's count is derived from the walk and a long word is the one
 * that pushes the reduction around.
 */
const BATTERY: readonly string[] = Object.freeze([
  "",
  "   ",
  "A",
  "Z",
  "LUNAR",
  "WAR",
  "DESCENT",
  "ZZZZZZZZZ",
  "AAAAAAAAA",
  "日本語",
  "💀💀💀",
  "1234567890",
  "THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG",
  "x".repeat(300),
]);

const VOCABULARY: readonly string[] = Object.freeze(
  WORD_CORRESPONDENCE.map((w) => w.word.toUpperCase()),
);

const CONCEPT_WORDS: readonly string[] = Object.freeze(
  CONCEPT_CORRESPONDENCE.map((c) => c.words[0]!.toUpperCase()),
);

const PACKAGE_SOURCE = ["fields", "index", "render", "seed", "stamp", "types"].map((name) => ({
  name,
  text: readFileSync(new URL(`../packages/mode-engine/src/${name}.ts`, import.meta.url), "utf8"),
}));

/** `scripts/build-print-kit.ts`, so the garment floor a signature quotes is checked. */
const PRINT_KIT = readFileSync(new URL("../scripts/build-print-kit.ts", import.meta.url), "utf8");

/* ── an independent bound on the emitted ink ─────────────────────────────── */

type Box = readonly [number, number, number, number];

/**
 * The box the emitted path data actually occupies, parsed from the strings.
 *
 * Deliberately NOT `ModeField.inkBounds`. That field is the engine's own report,
 * and a containment test that trusts the report tests nothing — this reads the
 * `d` attributes the way a stranger with the file would, and the two are compared
 * against each other below.
 *
 * The engine emits absolute `M`/`L`/`Z` only, so that is all this parses, and
 * anything else stops the suite instead of being skipped: a bound that quietly
 * ignores half a figure is worse than no bound at all. If a mode ever starts
 * drawing curves, this fails loudly and gets taught to measure them.
 */
function inkBoxOf(paths: readonly { readonly d: string }[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of paths) {
    for (const command of p.d.matchAll(/([A-Za-z])([^A-Za-z]*)/gu)) {
      const letter = command[1]!;
      if (letter === "Z" || letter === "z") continue;
      if (letter !== "M" && letter !== "L") {
        throw new Error(`the mode engine emits a path command this bound cannot measure: ${letter}`);
      }
      const args = (command[2]!.match(/-?\d*\.?\d+(?:[eE][-+]?\d+)?/gu) ?? []).map(Number);
      if (args.length % 2 !== 0 || args.length === 0) {
        throw new Error(`${letter} with ${args.length} arguments is not a point`);
      }
      for (let i = 0; i + 1 < args.length; i += 2) {
        const x = args[i]!;
        const y = args[i + 1]!;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return Number.isFinite(minX) ? [minX, minY, maxX, maxY] : [0, 0, 0, 0];
}

/* ── 1. the ink is inside the viewBox, over the whole cross product ──────── */

describe("every mode keeps its ink inside the frame", () => {
  for (const mode of MODE_IDS) {
    it(`${mode} stays inside 0..${BOX} on all seven squares and every hostile word`, () => {
      const escapes: string[] = [];
      for (const square of SQUARE_IDS) {
        for (const word of BATTERY) {
          const field = fieldFromWalk(walk(word, { square }), mode);
          const box = inkBoxOf(field.paths);
          if (field.paths.length === 0) continue;
          const where = `${mode} · ${square} · ${JSON.stringify(word.slice(0, 12))}`;
          if (box[0] < 0 || box[1] < 0 || box[2] > BOX || box[3] > BOX) {
            escapes.push(`${where}: ink at ${box.map((v) => v.toFixed(3)).join(", ")}`);
          }
          // The contraction targets the SAFE BOX, not the frame, and it is
          // arithmetic rather than a clamp — so this is the tighter statement and
          // the one that would break first if the reach calculation missed a
          // layer. Haring's radiance ring, which sits outside the stamp it rings,
          // is exactly the layer a naive reach would have missed.
          if (
            box[0] < SAFE_PAD - 1e-6 ||
            box[1] < SAFE_PAD - 1e-6 ||
            box[2] > BOX - SAFE_PAD + 1e-6 ||
            box[3] > BOX - SAFE_PAD + 1e-6
          ) {
            escapes.push(
              `${where}: ink at ${box.map((v) => v.toFixed(3)).join(", ")} leaves the safe box`,
            );
          }
        }
      }
      expect(escapes.join("\n")).toBe("");
    });
  }

  it("reports the same box it drew — the engine's own measurement against an independent one", () => {
    const wrong: string[] = [];
    for (const mode of MODE_IDS) {
      for (const square of SQUARE_IDS) {
        const field = fieldFromWalk(walk("DESCENT", { square }), mode);
        const measured = inkBoxOf(field.paths);
        const reported = field.inkBounds;
        for (let i = 0; i < 4; i += 1) {
          if (Math.abs(measured[i]! - reported[i]!) > 1e-9) {
            wrong.push(
              `${mode}/${square} axis ${i}: reported ${reported[i]}, measured ${measured[i]}`,
            );
          }
        }
      }
    }
    expect(wrong.join("\n")).toBe("");
  });

  it("contracts only when the construction does not fit, and never expands", () => {
    for (const mode of MODE_IDS) {
      for (const word of BATTERY) {
        const field = fieldFromWalk(walk(word), mode);
        expect(field.contraction, `${mode} ${JSON.stringify(word)}`).toBeGreaterThan(0);
        expect(field.contraction, `${mode} ${JSON.stringify(word)}`).toBeLessThanOrEqual(1);
        expect(field.stampRadius).toBeCloseTo(baseStampRadius(mode) * field.contraction, 9);
      }
    }
  });

  it("puts the whole ring plate's ink inside the sheet, with a field on it", () => {
    // The mode layer is placed inside `<g id="figure">`, which is itself scaled
    // onto the sheet. Containment in figure units is necessary and not
    // sufficient, so the plate is checked too — in millimetres, on the sheet's
    // own declared viewBox.
    for (const mode of MODE_IDS) {
      const art = ring("LUNAR", { mode });
      const declared = art.sheetSvg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/u);
      expect(declared, mode).not.toBeNull();
      const place = art.sheetSvg.match(
        /<g id="figure" transform="translate\(([\d.]+) ([\d.]+)\) scale\(([\d.]+)\)">/u,
      );
      expect(place, mode).not.toBeNull();
      const [tx, ty, k] = [Number(place![1]), Number(place![2]), Number(place![3])];
      const box = inkBoxOf(art.mode!.paths);
      expect(tx + box[0] * k, `${mode} left`).toBeGreaterThanOrEqual(0);
      expect(ty + box[1] * k, `${mode} top`).toBeGreaterThanOrEqual(0);
      expect(tx + box[2] * k, `${mode} right`).toBeLessThanOrEqual(Number(declared![1]));
      expect(ty + box[3] * k, `${mode} bottom`).toBeLessThanOrEqual(Number(declared![2]));
    }
  });
});

/* ── 2. determinism is the product ───────────────────────────────────────── */

describe("determinism", () => {
  it("paints byte-identical fields for the same word twice, in every mode", () => {
    for (const mode of MODE_IDS) {
      for (const word of BATTERY) {
        const a = fieldFromWalk(walk(word), mode);
        const b = fieldFromWalk(walk(word), mode);
        expect(JSON.stringify(a), `${mode} ${JSON.stringify(word)}`).toBe(JSON.stringify(b));
      }
    }
  });

  it("emits byte-identical ring artifacts for the same word twice", () => {
    for (const word of ["LUNAR", "WAR", "DESCENT", "", "💀💀💀"]) {
      const a = ring(word);
      const b = ring(word);
      expect(a.sheetSvg, word).toBe(b.sheetSvg);
      expect(a.sheetId, word).toBe(b.sheetId);
      expect(a.modeCensus, word).toBe(b.modeCensus);
      expect(a.census, word).toBe(b.census);
    }
  });

  it("keys the field off the WALK, so whitespace cannot move it", () => {
    // The painter hashes the typed phrase, and a trailing space moves the whole
    // composition. `packages/ring` already records this exact failure for the
    // concept lookup; the seed is not allowed to reintroduce it.
    for (const mode of MODE_IDS) {
      const bare = ring("DESCENT", { mode });
      const padded = ring("  DESCENT  ", { mode });
      expect(padded.mode!.seed, mode).toBe(bare.mode!.seed);
      expect(padded.sheetId, mode).toBe(bare.sheetId);
    }
  });

  it("gives different words different fields", () => {
    const seen = new Map<string, string>();
    for (const word of ["LUNAR", "WAR", "DESCENT", "COSMOS", "SPIRIT"]) {
      const key = JSON.stringify(fieldFromWalk(walk(word, { square: "jupiter" }), "chaos").nodes);
      expect(seen.has(key), `${word} paints the same chaos field as ${seen.get(key) ?? ""}`).toBe(
        false,
      );
      seen.set(key, word);
    }
  });

  it("draws every random number from a walk-seeded generator", () => {
    for (const { name, text } of PACKAGE_SOURCE) {
      // A CALL, not the name: `fields.ts` says the words "Math.random" inside a
      // signature, predicting what would happen if one were used. Matching the
      // bare name failed on the sentence that exists to forbid the thing.
      expect(text, `${name}.ts calls Math.random`).not.toMatch(/Math\s*\.\s*random\s*\(/u);
      expect(text, `${name}.ts reads the clock`).not.toMatch(/Date\s*\.\s*now\s*\(|new\s+Date\s*\(/u);
      expect(text, `${name}.ts reads the environment`).not.toMatch(/process\s*\.\s*env/u);
    }
  });

  it("derives the seed from the walk by FNV-1a, recomputed here from the walk alone", () => {
    // A second implementation of the seed, written from the walk rather than from
    // `seed.ts`. If the two ever disagree the engine's derivation has drifted
    // from the one the mode census prints.
    const fnv = (figure: Walk, mode: ModeId): number => {
      let h = 2166136261 >>> 0;
      const fold = (v: number): void => {
        h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
      };
      for (const step of figure.steps) fold(step.cell + 1);
      fold(figure.order);
      fold(figure.steps.reduce((t, s) => t + s.cell, 0));
      for (const cell of figure.activatedCells) fold(cell);
      fold(figure.steps.length);
      fold(MODE_IDS.indexOf(mode) + 1);
      return h >>> 0;
    };
    for (const word of BATTERY) {
      for (const mode of MODE_IDS) {
        const figure = walk(word);
        expect(seedFromWalk(figure, mode), `${mode} ${JSON.stringify(word)}`).toBe(
          fnv(figure, mode),
        );
      }
    }
  });
});

/* ── 3. the concept's stated mode is the mode that paints ────────────────── */

describe("the composition table is finally read", () => {
  it("draws LUNAR in cymatic and WAR in haring, because their concepts say so", () => {
    const lunar = ring("LUNAR");
    expect(lunar.correspondence?.concept).toBe("lunar");
    expect(lunar.correspondence?.composition.mode).toBe("cymatic");
    expect(lunar.mode?.mode).toBe("cymatic");
    expect(lunar.sheetSvg).toContain('<g id="mode-cymatic"');

    const war = ring("WAR");
    expect(war.correspondence?.concept).toBe("war");
    expect(war.correspondence?.composition.mode).toBe("haring");
    expect(war.mode?.mode).toBe("haring");
    expect(war.sheetSvg).toContain('<g id="mode-haring"');
  });

  it("paints what every one of the nineteen concepts asks for, on every word that reaches it", () => {
    const wrong: string[] = [];
    for (const word of VOCABULARY) {
      const art = ring(word);
      const asked = art.correspondence?.composition.mode;
      const painted = art.mode?.mode;
      if (asked !== painted) wrong.push(`${word}: asks ${String(asked)}, paints ${String(painted)}`);
    }
    expect(wrong.join("\n")).toBe("");
    // Nine of the ten are reachable from the table; nothing asks for minimal.
    const asked = new Set(CONCEPT_CORRESPONDENCE.map((c) => c.composition.mode));
    expect([...asked].sort()).toEqual(
      MODE_IDS.filter((m) => m !== "minimal")
        .slice()
        .sort(),
    );
  });

  it("draws two different figures for two words whose concepts name different modes", () => {
    const lunar = ring("LUNAR");
    const war = ring("WAR");
    expect(lunar.sheetId).not.toBe(war.sheetId);
    // The point of the build: before it, both drew the same construction and
    // differed only in where the walk line went.
    expect(lunar.mode!.mode).not.toBe(war.mode!.mode);
    expect(lunar.mode!.paths.some((p) => p.role === "radiance")).toBe(false);
    expect(war.mode!.paths.some((p) => p.role === "radiance")).toBe(true);
  });

  it("falls back to the envelope for a word no concept rides", () => {
    const stranger = ring("SWEATSHOP");
    expect(stranger.correspondence).toBeUndefined();
    expect(stranger.mode).toBeUndefined();
    expect(stranger.sheetSvg).not.toMatch(/<g id="mode-/u);
    expect(stranger.sheetSvg).toContain('<g id="envelope"');
    expect(stranger.modeCensus).toContain("no field");
  });

  it("lets the caller override the concept, and lets the caller ask for nothing", () => {
    const forced = ring("LUNAR", { mode: "metatron" });
    expect(forced.mode!.mode).toBe("metatron");
    expect(forced.modeCensus).toContain("chosen by the caller");

    const bare = ring("LUNAR", { mode: "none" });
    expect(bare.mode).toBeUndefined();
    expect(bare.sheetSvg).not.toMatch(/<g id="mode-/u);
    // The control the contact sheet is read against: the same walk, the same
    // envelope, no field.
    expect(bare.walk.steps.map((s) => s.cell)).toEqual(ring("LUNAR").walk.steps.map((s) => s.cell));
    expect(bare.envelope.cusps).toBe(ring("LUNAR").envelope.cusps);
  });

  it("refuses nothing — every hostile input still resolves, walks and paints", () => {
    for (const word of BATTERY) {
      for (const mode of MODE_IDS) {
        const art = ring(word, { mode });
        expect(art.mode, `${mode} ${JSON.stringify(word)}`).toBeDefined();
        expect(art.mode!.nodes.length, `${mode} ${JSON.stringify(word)}`).toBeGreaterThan(0);
        expect(art.sheetSvg.length).toBeGreaterThan(0);
      }
    }
  });

  it("emits no <text> on a plate that carries a field", () => {
    for (const mode of MODE_IDS) {
      const art = ring("LUNAR", { mode });
      expect(art.sheetSvg, mode).not.toMatch(/<text[\s>]/u);
      expect(art.sheetSvg, mode).not.toMatch(/<tspan[\s>]/u);
    }
  });
});

/* ── 4. the ten are ten constructions, not ten captions ──────────────────── */

describe("the ten modes draw genuinely different geometry", () => {
  const fields = new Map<ModeId, ModeField>(
    MODE_IDS.map((m) => [m, fieldFromWalk(walk("LUNAR", { square: "luna" }), m)]),
  );

  it("shares almost no placements between any two modes", () => {
    const near = (a: ModeField, b: ModeField): number => {
      let hits = 0;
      for (const p of a.nodes) {
        if (b.nodes.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 2)) hits += 1;
      }
      return hits / Math.max(1, a.nodes.length);
    };
    const tooClose: string[] = [];
    for (const a of MODE_IDS) {
      for (const b of MODE_IDS) {
        if (a >= b) continue;
        const overlap = Math.max(near(fields.get(a)!, fields.get(b)!), near(fields.get(b)!, fields.get(a)!));
        if (overlap > 0.5) tooClose.push(`${a} vs ${b}: ${(overlap * 100).toFixed(1)}% of placements coincide`);
      }
    }
    expect(tooClose.join("\n")).toBe("");
  });

  it("gives every mode a distinct ink footprint", () => {
    const seen = new Map<string, ModeId>();
    for (const mode of MODE_IDS) {
      const field = fields.get(mode)!;
      const key = field.paths.map((p) => p.d).join("|");
      expect(seen.has(key), `${mode} draws exactly what ${seen.get(key) ?? ""} draws`).toBe(false);
      seen.set(key, mode);
    }
  });

  it("draws the structural ink only where the construction has some", () => {
    // Metatron's seventy-eight chords and Haring's radiance are the painter's
    // own mode-specific ink. Nothing else may quietly acquire either.
    for (const mode of MODE_IDS) {
      const field = fields.get(mode)!;
      const structure = field.paths.filter((p) => p.role === "structure").length;
      const radiance = field.paths.filter((p) => p.role === "radiance").length;
      expect(structure > 0, `${mode} structure`).toBe(mode === "metatron");
      expect(radiance > 0, `${mode} radiance`).toBe(mode === "haring");
      if (mode === "metatron") expect(structure).toBe((13 * 12) / 2);
      if (mode === "haring") expect(radiance).toBe(field.nodes.length);
    }
  });

  it("never paints ink thinner than the envelope's, so the plate's gauge does not move", () => {
    // The envelope is drawn at 0.22 figure units and is the finest ink in the
    // drawing field. If a mode went below it, the gauge the annotation measures
    // would be a mode's stroke and would change word to word.
    const ENVELOPE_STROKE = 0.22;
    expect(MIN_STROKE).toBeGreaterThan(ENVELOPE_STROKE);
    for (const mode of MODE_IDS) {
      for (const word of BATTERY) {
        for (const path of fieldFromWalk(walk(word), mode).paths) {
          expect(path.strokeWidth, `${mode} ${JSON.stringify(word)}`).toBeGreaterThanOrEqual(
            MIN_STROKE,
          );
        }
      }
    }
  });

  it("reports hue as the walked cell, not as a decoration", () => {
    // House rule 5. A stamp's hue is the position of its cell in the walk's
    // activated set, so the number of distinct hues in the field is the number
    // of distinct cells the word touched — countable off the plate.
    for (const word of ["LUNAR", "DESCENT", "COSMOS"]) {
      const figure = walk(word);
      for (const mode of MODE_IDS) {
        const field = fieldFromWalk(figure, mode);
        const stampHues = new Set(
          field.paths.filter((p) => p.role !== "structure").map((p) => p.hue),
        );
        // Not `min(activated, nodes)`: the stamps carry the walked STEPS in
        // order and wrap, and a word can walk one cell twice before it walks
        // another. LUNAR's cells are 3,3,5,1,9, so a two-mark Minimal field
        // carries cell 3 twice and shows one hue, not two.
        const carried = new Set(
          field.nodes.map((node) => node.cell),
        );
        expect(stampHues.size, `${word}/${mode}`).toBe(carried.size);
        expect(carried.size).toBeLessThanOrEqual(figure.activatedCells.length);
        for (const node of field.nodes) {
          expect(node.hue).toBeCloseTo(
            figure.activatedCells.indexOf(node.cell) / figure.activatedCells.length,
            12,
          );
        }
      }
    }
  });
});

/* ── 5. the stamp is a figure of the cell ────────────────────────────────── */

describe("the stamp reads back the cell it stands for", () => {
  it("derives p and q from the cell and closes in gcd(p, q) cycles", () => {
    const digitSum = (n: number): number =>
      String(n)
        .split("")
        .reduce((t, c) => t + Number(c), 0);
    const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
    for (let cell = 0; cell <= 81; cell += 1) {
      const spec = stampFor(cell);
      expect(spec.p, `cell ${cell}`).toBe(3 + (cell % 6));
      const qMax = Math.max(1, Math.floor((spec.p - 1) / 2));
      expect(spec.q, `cell ${cell}`).toBe(1 + (digitSum(cell) % qMax));
      expect(spec.cycles, `cell ${cell}`).toBe(gcd(spec.p, spec.q));
      expect(spec.q).toBeLessThan(spec.p / 2 + 1);
    }
  });

  it("draws every vertex on the circle that bounds it", () => {
    // The containment arithmetic bounds a stamp by its circumcircle. If a vertex
    // ever left that circle the reach calculation would be understating the ink
    // and the safe box would stop being a guarantee.
    for (const mode of MODE_IDS) {
      const field = fieldFromWalk(walk("DESCENT", { square: "luna" }), mode);
      // The field paths are emitted one per node, in node order, so the k-th of
      // them belongs to the k-th placement. Matching them by coordinate text
      // instead picked the wrong stamp and asserted nothing.
      const stamps = field.paths.filter((p) => p.role === "field");
      expect(stamps.length, mode).toBe(field.nodes.length);
      field.nodes.forEach((node, k) => {
        const r = field.stampRadius * node.s;
        for (const point of (stamps[k]!.d.match(/-?\d+\.\d+ -?\d+\.\d+/gu) ?? []).map((s) =>
          s.split(" ").map(Number),
        )) {
          expect(
            Math.hypot(point[0]! - node.x, point[1]! - node.y),
            `${mode} stamp ${k}`,
          ).toBeLessThanOrEqual(r + 1e-3);
        }
      });
    }
  });

  it("carries the walked steps in order and wraps", () => {
    const figure = walk("DESCENT", { square: "saturn" });
    const cells = figure.steps.map((s) => s.cell);
    for (const mode of MODE_IDS) {
      const field = fieldFromWalk(figure, mode);
      field.nodes.forEach((node, i) => {
        expect(node.step, `${mode} node ${i}`).toBe(i % cells.length);
        expect(node.cell, `${mode} node ${i}`).toBe(cells[i % cells.length]);
      });
    }
  });

  it("still draws a stamp for a walk with no letters at all", () => {
    for (const mode of MODE_IDS) {
      const field = fieldFromWalk(walk(""), mode);
      expect(field.nodes.length, mode).toBeGreaterThan(0);
      for (const node of field.nodes) {
        expect(node.step, mode).toBe(-1);
        expect(node.cell, mode).toBe(0);
        expect(node.hue, mode).toBe(0);
      }
    }
  });
});

/* ── 6. the painter's own arithmetic, checked against a second copy ──────── */

/**
 * Three of the ten fields, transcribed straight from `const MODES` in
 * `assets/symbolpaintermk137.html`, and compared placement for placement.
 *
 * Not a duplicate engine — an ORACLE, and it exists for one reason: `organic`
 * and `cymatic` are rejection samplers whose output depends on the exact order
 * of the `rng()` calls, and the obvious tidy-up (hoisting the two per-node draws
 * out of the accept branch) silently produces a different field from the same
 * seed. Nothing in the type system or in a containment test would catch that.
 * These three run the painter's source order and demand the same answer.
 */
const PAINTER = {
  phyllotaxis(W: number, H: number, n: number): readonly (readonly [number, number])[] {
    const GA = Math.PI * (3 - Math.sqrt(5));
    const out: [number, number][] = [];
    const k = (Math.min(W, H) * 0.47) / Math.sqrt(n);
    for (let i = 1; i <= n; i += 1) {
      out.push([W / 2 + k * Math.sqrt(i) * Math.cos(i * GA), H / 2 + k * Math.sqrt(i) * Math.sin(i * GA)]);
    }
    return out;
  },
  organic(W: number, H: number, n: number, rng: () => number): readonly (readonly [number, number])[] {
    const r = Math.sqrt((W * H) / Math.max(1, n)) * 0.86;
    const r2 = r * r;
    const out: [number, number][] = [];
    let att = 0;
    const cap = n * 40;
    while (out.length < n && att++ < cap) {
      const x = rng() * W;
      const y = rng() * H;
      let ok = true;
      for (let i = 0; i < out.length; i += 1) {
        const dx = out[i]![0] - x;
        const dy = out[i]![1] - y;
        if (dx * dx + dy * dy < r2) {
          ok = false;
          break;
        }
      }
      if (ok) {
        rng();
        rng();
        out.push([x, y]);
      }
    }
    return out;
  },
  cymatic(
    W: number,
    H: number,
    n: number,
    rng: () => number,
    kx: number,
    ky: number,
  ): readonly (readonly [number, number])[] {
    const out: [number, number][] = [];
    let att = 0;
    const cap = n * 220;
    const f = (X: number, Y: number): number =>
      Math.sin(kx * Math.PI * X) * Math.sin(ky * Math.PI * Y) +
      Math.sin(ky * Math.PI * X) * Math.sin(kx * Math.PI * Y);
    while (out.length < n && att++ < cap) {
      const X = rng();
      const Y = rng();
      if (Math.abs(f(X, Y)) < 0.05) {
        rng();
        out.push([X * W, Y * H]);
      }
    }
    return out;
  },
};

describe("the fields are the painter's, arithmetic for arithmetic", () => {
  const undo = (field: ModeField): readonly (readonly [number, number])[] =>
    field.nodes.map((node) => [
      BOX / 2 + (node.x - BOX / 2) / field.contraction,
      BOX / 2 + (node.y - BOX / 2) / field.contraction,
    ]);

  const agrees = (
    a: readonly (readonly [number, number])[],
    b: readonly (readonly [number, number])[],
    what: string,
  ): void => {
    expect(a.length, `${what}: placement count`).toBe(b.length);
    a.forEach((p, i) => {
      expect(p[0], `${what}: x of placement ${i}`).toBeCloseTo(b[i]![0], 6);
      expect(p[1], `${what}: y of placement ${i}`).toBeCloseTo(b[i]![1], 6);
    });
  };

  for (const word of ["LUNAR", "DESCENT", "ZZZZZZZZZ"]) {
    it(`places ${word} exactly where the painter's source would`, () => {
      const figure = walk(word);
      const ctx = contextFromWalk(figure);

      const phyl = fieldFromWalk(figure, "phyllotaxis");
      agrees(undo(phyl), PAINTER.phyllotaxis(BOX, BOX, phyl.requested), `${word} phyllotaxis`);

      const org = fieldFromWalk(figure, "organic");
      agrees(
        undo(org),
        PAINTER.organic(BOX, BOX, org.requested, mulberry32(seedFromWalk(figure, "organic"))),
        `${word} organic`,
      );

      const cym = fieldFromWalk(figure, "cymatic");
      agrees(
        undo(cym),
        PAINTER.cymatic(
          BOX,
          BOX,
          cym.requested,
          mulberry32(seedFromWalk(figure, "cymatic")),
          2 + (ctx.activated % 6),
          2 + (ctx.sum % 6),
        ),
        `${word} cymatic`,
      );
    });
  }

  it("keeps the painter's per-mode constants exactly as authored", () => {
    // `cap` and `base` are the mode's identity. A drift here is a mode quietly
    // becoming a different mode, which no other test in this file would notice.
    const AUTHORED: Readonly<Record<ModeId, readonly [number, number, number]>> = {
      phyllotaxis: [420, 46, 64],
      lattice: [340, 58, 54],
      metatron: [13, 84, 100],
      organic: [280, 56, 60],
      cymatic: [520, 30, 64],
      attractor: [700, 26, 70],
      mandelbrot: [520, 30, 64],
      chaos: [420, 54, 56],
      haring: [150, 70, 68],
      minimal: [3, 280, 100],
    };
    for (const mode of MODE_IDS) {
      const spec = MODE_SPECS[mode];
      expect([spec.cap, spec.base, spec.dens], mode).toEqual([...AUTHORED[mode]]);
    }
  });

  it("asks for the painter's own default field at the middle of the reduction", () => {
    for (const mode of MODE_IDS) {
      const spec = MODE_SPECS[mode];
      expect(requestedFor(mode, 5), mode).toBe(
        Math.max(1, Math.min(spec.cap, Math.round((spec.cap * spec.dens) / 100))),
      );
      expect(requestedFor(mode, 1), mode).toBeLessThanOrEqual(requestedFor(mode, 9));
    }
  });
});

/* ── 7. the mode census, sentence by sentence ────────────────────────────── */

/**
 * A sentence carrying a number makes a measurable claim.
 *
 * The same rule `tests/ring.test.ts` applies to the legend and the census,
 * applied here to the mode census — the fifth text, and the one where all the
 * numbers went. Coverage is the point: a sentence with a number that no relation
 * below can evaluate FAILS, so a new claim cannot be added to the ring without a
 * relation being added here to check it.
 */
function sentencesOf(text: string): readonly string[] {
  return text
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.;])\s+/u))
    .map((s) => s.trim())
    .filter((s) => s !== "");
}

const isQuantitative = (sentence: string): boolean => /\d/u.test(sentence);

type Verdict = true | string;

const eq = (claimed: unknown, actual: unknown, what: string): Verdict =>
  String(claimed) === String(actual)
    ? true
    : `${what}: the prose says ${JSON.stringify(String(claimed))}, the engine says ${JSON.stringify(String(actual))}`;

const all = (...verdicts: readonly Verdict[]): Verdict => {
  const failed = verdicts.filter((v): v is string => v !== true);
  return failed.length === 0 ? true : failed.join("; ");
};

type Facts = Readonly<{
  art: RingArtifacts;
  field: ModeField | undefined;
  reduced: number;
  measured: Box;
}>;

type Relation = Readonly<{
  id: string;
  pattern: RegExp;
  check: (m: RegExpMatchArray, f: Facts) => Verdict;
}>;

const CENSUS_RELATIONS: readonly Relation[] = Object.freeze([
  {
    id: "mode-header",
    pattern: /^mode ([a-z]+) · (.+?) · (.+)$/u,
    check: (m, f) =>
      all(
        eq(m[1], f.field?.mode, "the mode painted"),
        eq(m[2], MODE_SPECS[m[1] as ModeId].label, "the mode's label"),
        eq(m[3], MODE_SPECS[m[1] as ModeId].rule, "the mode's rule"),
      ),
  },
  {
    id: "seed",
    pattern: /^seed\s+(\d+)$/u,
    check: (m, f) =>
      all(
        eq(m[1], f.field?.seed, "the seed the field used"),
        eq(m[1], seedFromWalk(f.art.walk, f.field!.mode), "the seed the walk derives"),
      ),
  },
  {
    id: "the-reduction",
    pattern: /^the walk reduces to\s+(\d+)$/u,
    check: (m, f) => eq(m[1], f.reduced, "the theosophic reduction of the walked cell sum"),
  },
  {
    id: "stamps-asked-for",
    pattern: /^stamps asked for\s+(\d+)\s+\(this mode's ceiling is (\d+)\)$/u,
    check: (m, f) =>
      all(
        eq(m[1], f.field?.requested, "the stamps the construction was asked for"),
        eq(m[1], requestedFor(f.field!.mode, f.reduced), "the count the rule gives"),
        eq(m[2], MODE_SPECS[f.field!.mode].cap, "the mode's ceiling"),
        Number(m[1]) <= Number(m[2]) ? true : "the request exceeds the ceiling it is capped by",
      ),
  },
  {
    id: "stamps-placed",
    pattern: /^stamps placed\s+(\d+)$/u,
    check: (m, f) => eq(m[1], f.field?.nodes.length, "the stamps actually placed"),
  },
  {
    id: "paths-emitted",
    pattern: /^paths emitted\s+(\d+)\s+= (\d+) field · (\d+) structure · (\d+) radiance$/u,
    check: (m, f) => {
      const byRole = (role: string): number =>
        f.field!.paths.filter((p) => p.role === role).length;
      return all(
        eq(m[1], f.field?.paths.length, "the paths emitted"),
        eq(m[2], byRole("field"), "the field paths"),
        eq(m[3], byRole("structure"), "the structure paths"),
        eq(m[4], byRole("radiance"), "the radiance paths"),
        eq(Number(m[2]) + Number(m[3]) + Number(m[4]), Number(m[1]), "the three roles summed"),
      );
    },
  },
  {
    // House rule 5: a stamp's hue reports which of the walk's distinct cells it
    // stands for, so the field can never show more stamp hues than the walk has
    // cells to report. This line and the next were ONE line until a run of this
    // suite caught it: Metatron's chords carry a hue of their own, and summed in
    // they made LUNAR's plate claim 10 hues for a 4-cell walk.
    id: "stamp-hues",
    pattern: /^hues on the stamps\s+(\d+)\s+\(the walk activates (\d+) distinct cells\)$/u,
    check: (m, f) =>
      all(
        eq(
          m[1],
          new Set(f.field!.paths.filter((p) => p.role !== "structure").map((p) => p.hue)).size,
          "the hues on the stamps",
        ),
        eq(m[2], f.art.walk.activatedCells.length, "the cells the walk activates"),
        eq(
          m[1],
          new Set(f.field!.nodes.map((n) => n.cell)).size,
          "the distinct cells the stamps actually carry",
        ),
        Number(m[1]) <= Math.max(1, Number(m[2]))
          ? true
          : "more stamp hues than the walk has cells to report",
      ),
  },
  {
    // The structure's hue reports the construction, not the word: a chord's rank
    // among the distinct chord LENGTHS. Recomputed from the emitted endpoints.
    id: "structure-hues",
    pattern: /^hues on the structure\s+(\d+)\s+\(distinct chord lengths in the construction\)$/u,
    check: (m, f) => {
      const structure = f.field!.paths.filter((p) => p.role === "structure");
      // Clustered at a gap, not rounded to a place: Metatron's seven length
      // classes are several units apart and float noise is not, so rounding
      // splits a class and a gap cut does not. The engine clusters the same way
      // and this arrives at the count from the emitted endpoints alone.
      const sorted = structure
        .map((p) => {
          const n = (p.d.match(/-?\d+(?:\.\d+)?/gu) ?? []).map(Number);
          return Math.hypot(n[2]! - n[0]!, n[3]! - n[1]!);
        })
        .sort((a, b) => a - b);
      let classes = 0;
      sorted.forEach((v, i) => {
        if (i === 0 || v - sorted[i - 1]! > 0.01) classes += 1;
      });
      return all(
        eq(m[1], new Set(structure.map((p) => p.hue)).size, "the hues on the structure"),
        eq(m[1], classes, "the distinct chord lengths the structure draws"),
      );
    },
  },
  {
    id: "mark-radius",
    pattern: /^mark radius\s+([\d.]+)\s+\(this mode's base radius is ([\d.]+)\)$/u,
    check: (m, f) =>
      all(
        eq(m[1], f.field?.stampRadius.toFixed(4), "the stamp radius after contraction"),
        eq(m[2], baseStampRadius(f.field!.mode).toFixed(4), "the mode's base radius"),
        Math.abs(Number(m[1]) - Number(m[2]) * f.field!.contraction) < 5e-5
          ? true
          : "the radius is not the base radius times the contraction",
      ),
  },
  {
    id: "contraction",
    pattern: /^contraction\s+([\d.]+)$/u,
    check: (m, f) =>
      all(
        eq(m[1], f.field?.contraction.toFixed(6), "the contraction"),
        Number(m[1]) > 0 && Number(m[1]) <= 1 ? true : "a contraction outside (0, 1]",
      ),
  },
  {
    // The reach is what the contraction PREVENTED, and the census's contraction
    // reason branches on it. Recomputed here from the emitted ink and the
    // contraction, so the two cannot drift: contracting a reach of `R` about the
    // centre puts the furthest ink at `centre ± R·k`.
    id: "reach-before-contraction",
    pattern: /^reach before it\s+([\d.]+)\s+\(the frame's half-width is (\d+)\)$/u,
    check: (m, f) => {
      const centre = BOX / 2;
      const furthest = Math.max(
        ...f.measured.map((v, i) => Math.abs(v - centre) * (i < 2 ? 1 : 1)),
      );
      return all(
        eq(m[1], f.field?.reach.toFixed(3), "the reach before contraction"),
        eq(m[2], BOX / 2, "the frame's half-width"),
        // The reach includes half a stroke width, which the ink box does not, so
        // the emitted ink must land at or just inside the contracted reach.
        furthest <= f.field!.reach * f.field!.contraction + 1e-6
          ? true
          : `ink reaches ${furthest} but the contracted reach is ${f.field!.reach * f.field!.contraction}`,
        f.field!.contraction < 1
          ? Math.abs(f.field!.reach * f.field!.contraction - (centre - SAFE_PAD)) < 1e-6
            ? true
            : "a contracted field does not land exactly on the safe box"
          : f.field!.reach <= centre - SAFE_PAD + 1e-6
            ? true
            : "an uncontracted field reaches past the safe box",
      );
    },
  },
  {
    id: "ink-box",
    pattern: /^ink box\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)$/u,
    check: (m, f) =>
      all(
        // Against the ENGINE's report and against an independent parse of the
        // emitted path data, so the sheet cannot print a box it did not draw.
        ...[0, 1, 2, 3].map((i) =>
          eq(m[i + 1], f.field!.inkBounds[i]!.toFixed(3), `ink box axis ${i}, as reported`),
        ),
        ...[0, 1, 2, 3].map((i) =>
          eq(m[i + 1], f.measured[i]!.toFixed(3), `ink box axis ${i}, as measured off the paths`),
        ),
        Number(m[1]) >= 0 && Number(m[2]) >= 0 && Number(m[3]) <= BOX && Number(m[4]) <= BOX
          ? true
          : "the printed ink box is outside the frame",
      ),
  },
  {
    id: "the-frame",
    pattern: /^the frame it is in\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/u,
    check: (m, f) =>
      all(
        ...[0, 1, 2, 3].map((i) => eq(m[i + 1], f.art.walk.viewBox[i], `the frame's axis ${i}`)),
        eq(m[3], BOX, "the frame the mode engine draws in"),
      ),
  },
  {
    id: "seed-is-fnv",
    pattern: /^The seed is FNV-1a over the walk itself/u,
    check: (_m, f) => {
      let h = 2166136261 >>> 0;
      const fold = (v: number): void => {
        h = Math.imul(h ^ (v >>> 0), 16777619) >>> 0;
      };
      for (const step of f.art.walk.steps) fold(step.cell + 1);
      fold(f.art.walk.order);
      fold(f.art.walk.steps.reduce((t, s) => t + s.cell, 0));
      for (const cell of f.art.walk.activatedCells) fold(cell);
      fold(f.art.walk.steps.length);
      fold(MODE_IDS.indexOf(f.field!.mode) + 1);
      return eq(h >>> 0, f.field?.seed, "the seed, recomputed as FNV-1a over the walk");
    },
  },
  {
    id: "the-slider-sits-at-five",
    pattern: /^walk's reduction against (\d+) — the painter's own slider position\.$/u,
    check: (m, f) => {
      const spec = MODE_SPECS[f.field!.mode];
      return all(
        eq(
          requestedFor(f.field!.mode, Number(m[1])),
          Math.max(1, Math.min(spec.cap, Math.round((spec.cap * spec.dens) / 100))),
          "the count at the reduction the sentence names, against the painter's own default",
        ),
      );
    },
  },
  {
    id: "counterfactual-row",
    pattern: /^([a-z]+)\s+(\d+)\s+([\d.]+)(\s+<- this sheet)?$/u,
    check: (m, f) => {
      const mode = m[1] as ModeId;
      if (!(MODE_IDS as readonly string[]).includes(mode)) {
        return `the table names ${JSON.stringify(mode)}, which is not a mode`;
      }
      return all(
        eq(m[2], requestedFor(mode, f.reduced), `the stamps ${mode} would ask this word for`),
        eq(m[3], baseStampRadius(mode).toFixed(2), `${mode}'s mark radius`),
        eq(m[4] !== undefined, mode === f.field?.mode, `whether ${mode} is marked as this sheet's`),
      );
    },
  },
]);

/**
 * The signature block is audited separately, by experiment rather than by
 * pattern — see section 8. Its sentences are excluded here so the two audits do
 * not each half-cover the same text and call it covered.
 */
function measuredSection(census: string): string {
  const cut = census.indexOf("SIGNED CONSTANTS OF THIS CONSTRUCTION");
  return cut < 0 ? census : census.slice(0, cut);
}

describe("every number the mode census prints is true of the field it painted", () => {
  const WORDS = [...BATTERY, "LUNAR", "WAR", "SWEATSHOP", ...CONCEPT_WORDS.slice(0, 6)];

  for (const mode of MODE_IDS) {
    it(`holds for ${mode}, over the battery`, () => {
      const findings: string[] = [];
      for (const word of WORDS) {
        const art = ring(word, { mode });
        const facts: Facts = {
          art,
          field: art.mode,
          reduced: contextFromWalk(art.walk).reduced,
          measured: inkBoxOf(art.mode!.paths),
        };
        for (const sentence of sentencesOf(measuredSection(art.modeCensus))) {
          let matched = 0;
          for (const relation of CENSUS_RELATIONS) {
            const m = sentence.match(relation.pattern);
            if (m === null) continue;
            matched += 1;
            const verdict = relation.check(m, facts);
            if (verdict !== true) {
              findings.push(`${JSON.stringify(word)} [${relation.id}] ${verdict}\n    in: ${sentence}`);
            }
          }
          if (matched === 0 && isQuantitative(sentence)) {
            findings.push(
              `${JSON.stringify(word)} states a number no relation in this suite can evaluate.\n` +
                `    in: ${sentence}\n` +
                "    Either the claim is new and needs a relation here, or it is a derivation " +
                "nobody is checking — which is how the last false census reason shipped.",
            );
          }
        }
      }
      expect(findings.join("\n")).toBe("");
    });
  }

  it("holds for a sheet with no field at all", () => {
    const findings: string[] = [];
    for (const word of ["SWEATSHOP", "", "💀💀💀"]) {
      const art = ring(word, { mode: "none" });
      const facts: Facts = {
        art,
        field: undefined,
        reduced: contextFromWalk(art.walk).reduced,
        measured: [0, 0, 0, 0],
      };
      for (const sentence of sentencesOf(measuredSection(art.modeCensus))) {
        let matched = 0;
        for (const relation of CENSUS_RELATIONS) {
          const m = sentence.match(relation.pattern);
          if (m === null) continue;
          matched += 1;
          const verdict = relation.check(m, facts);
          if (verdict !== true) findings.push(`${JSON.stringify(word)} [${relation.id}] ${verdict}`);
        }
        if (matched === 0 && isQuantitative(sentence)) {
          findings.push(`${JSON.stringify(word)} unevaluable: ${sentence}`);
        }
      }
    }
    expect(findings.join("\n")).toBe("");
  });

  it("states the mode's derivation on every plate that has one", () => {
    // Deleting the sentence must not buy a green run — the same guard
    // `tests/ring.test.ts` puts on the cusp derivation.
    for (const mode of MODE_IDS) {
      const census = ring("LUNAR", { mode }).modeCensus;
      expect(census, mode).toMatch(/The seed is FNV-1a over the walk itself/u);
      expect(census, mode).toMatch(/walk's reduction against 5/u);
      expect(census, mode).toMatch(/^ {2}stamps asked for/mu);
      expect(census, mode).toMatch(/^ {2}ink box/mu);
    }
  });

  it("leaves the ring's own census free of any number, so the ring's suite still covers it", () => {
    // `tests/ring.test.ts` fails any sentence in the census or the legend that
    // carries a number no relation THERE can evaluate. The mode's contribution to
    // those two texts is therefore deliberately digit-free, and its numbers live
    // in the mode census, audited above. This asserts that split rather than
    // leaving it to a convention nobody rechecks.
    for (const mode of MODE_IDS) {
      const art = ring("LUNAR", { mode });
      for (const choice of art.choices) {
        if (!/^the (composition mode|mode's stamp|mode's contraction|field's place in the stack)$/u.test(choice.element)) {
          continue;
        }
        expect(choice.reason, `${mode} · ${choice.element}`).not.toMatch(/\d/u);
      }
      const legendMode = art.legend.slice(art.legend.indexOf("THE COMPOSITION MODE"));
      const section = legendMode.slice(0, legendMode.indexOf("\nMARKS"));
      expect(section, mode).not.toMatch(/\d/u);
    }
  });
});

/* ── 8. the signed constants, re-run ─────────────────────────────────────── */

/**
 * Twenty-three magic numbers, each carrying a prediction, each prediction re-run.
 *
 * The direction is deliberately inverted from a pattern table: the EXPERIMENT
 * runs first and produces the numbers, and the prose is then required to be made
 * of exactly those numbers. Nothing else may appear. So a sentence cannot drift
 * away from what the code does without either the experiment disagreeing or an
 * unaccounted-for figure turning up in the coverage check — and a new claim
 * cannot be smuggled in as prose, because a number with no experiment behind it
 * fails.
 *
 * This is the check that would have caught the first draft of these signatures.
 * It said 720 rays where the arithmetic gives 144, "no word in the vocabulary
 * hits the attempt budget" where 148 of 170 do, and "6 of the 19 concept words"
 * where 10 do. All three were written from plausible reasoning and none of them
 * survived being run.
 */

const num = (v: number, places?: number): string =>
  places === undefined ? String(v) : v.toFixed(places);

/** Every numeric token a mode's signature block contains. */
function tokensOf(mode: ModeId): readonly string[] {
  return MODE_SPECS[mode].signatures.flatMap((s) =>
    [...`${s.constant} | ${s.value} | ${s.reason}`.matchAll(/\d+(?:\.\d+)?/gu)].map((m) => m[0]!),
  );
}

/** Distinct rays a fixed angular step lands on, over `n` seeds. */
function raysOf(turnNumerator: number, turnDenominator: number, n: number): number {
  const seen = new Set<number>();
  for (let i = 1; i <= n; i += 1) seen.add((i * turnNumerator) % turnDenominator);
  return seen.size;
}

/** The painter's organic sampler, run at an arbitrary radius and budget. */
function organicYield(n: number, radiusFactor: number, budget: number, seed: number): number {
  const rng = mulberry32(seed);
  const r = Math.sqrt((BOX * BOX) / Math.max(1, n)) * radiusFactor;
  const r2 = r * r;
  const out: [number, number][] = [];
  let att = 0;
  while (out.length < n && att++ < n * budget) {
    const x = rng() * BOX;
    const y = rng() * BOX;
    let ok = true;
    for (const p of out) {
      const dx = p[0] - x;
      const dy = p[1] - y;
      if (dx * dx + dy * dy < r2) {
        ok = false;
        break;
      }
    }
    if (ok) {
      rng();
      rng();
      out.push([x, y]);
    }
  }
  return out.length;
}

/** The sampled-orbit score the attractor admits a parameter draw on. */
function orbitScore(
  a: number,
  b: number,
  c: number,
  d: number,
  n: number,
): Readonly<{ score: number; distinct: number; transientOff: number }> {
  const total = n * 16 + 1400;
  let x = 0;
  let y = 0;
  const early: [number, number][] = [];
  const orbit: [number, number][] = [];
  for (let i = 0; i < total; i += 1) {
    // `dsin`/`dcos`, not `Math.sin`/`Math.cos`, and importing them is not the
    // suite peeking at the answer. The de Jong map is `x' = sin(ay) − cos(bx)`
    // for a SPECIFIED sine, and since `packages/mode-engine/src/trig.ts` the
    // specified one is this — the built-ins are the ones that are unspecified,
    // and they differ from these on 3.3% of arguments. A reimplementation on
    // `Math.sin` would iterate a different map 12,600 times and report numbers
    // about a figure the engine never draws. This is the same import as
    // `mulberry32` two functions down: a definition, not a result.
    const nx = dsin(a * y) - dcos(b * x);
    const ny = dsin(c * x) - dcos(d * y);
    x = nx;
    y = ny;
    // The painter keeps `i > 600`, so the transient it would draw is the FIRST
    // 600 steps — `i < 600`. Counting `else` here instead put 601 points in the
    // transient and the experiment disagreed with the sentence by one.
    if (i > 600) orbit.push([x, y]);
    if (i < 600) early.push([x, y]);
  }
  const step = Math.max(1, Math.floor(orbit.length / n));
  const sample: [number, number][] = [];
  for (let i = 0; i < orbit.length && sample.length < n; i += step) sample.push(orbit[i]!);
  let lo0 = Infinity;
  let hi0 = -Infinity;
  let lo1 = Infinity;
  let hi1 = -Infinity;
  const distinct = new Set<string>();
  for (const p of sample) {
    lo0 = Math.min(lo0, p[0]);
    hi0 = Math.max(hi0, p[0]);
    lo1 = Math.min(lo1, p[1]);
    hi1 = Math.max(hi1, p[1]);
    distinct.add(`${p[0].toFixed(2)},${p[1].toFixed(2)}`);
  }
  const visited = new Set(orbit.map((p) => `${Math.round(p[0] / 0.02)},${Math.round(p[1] / 0.02)}`));
  const transientOff = early.filter(
    (p) => !visited.has(`${Math.round(p[0] / 0.02)},${Math.round(p[1] / 0.02)}`),
  ).length;
  return {
    score: (Math.min(hi0 - lo0, hi1 - lo1) / 4) * Math.min(1, distinct.size / Math.min(n, 64)),
    distinct: distinct.size,
    transientOff,
  };
}

function attractorDraws(word: string): Readonly<{
  first: ReturnType<typeof orbitScore>;
  drawsUsed: number;
  admitted: boolean;
  accepted: ReturnType<typeof orbitScore>;
}> {
  const figure = ring(word).walk;
  const reduced = contextFromWalk(figure).reduced;
  const n = requestedFor("attractor", reduced);
  const rng = mulberry32(seedFromWalk(figure, "attractor"));
  const threshold = 0.18 + 0.04 * reduced;
  let first: ReturnType<typeof orbitScore> | undefined;
  let accepted: ReturnType<typeof orbitScore> | undefined;
  let drawsUsed = 24;
  for (let t = 0; t < 24; t += 1) {
    const result = orbitScore(-3 + rng() * 6, -3 + rng() * 6, -3 + rng() * 6, -3 + rng() * 6, n);
    if (t === 0) first = result;
    accepted = result;
    if (result.score >= threshold) {
      drawsUsed = t + 1;
      break;
    }
  }
  return {
    first: first!,
    drawsUsed,
    admitted: accepted!.score >= threshold,
    accepted: accepted!,
  };
}

describe("every signed constant's prediction is re-run, not believed", () => {
  const FIG_SCALE = Number(
    ring("LUNAR").sheetSvg.match(/<g id="figure" transform="translate\([\d. ]+\) scale\(([\d.]+)\)">/u)![1],
  );

  /**
   * The numbers each mode's signatures are allowed to contain, produced by
   * running the experiment the sentence names.
   */
  const EXPERIMENTS: Readonly<Record<ModeId, () => readonly string[]>> = {
    phyllotaxis: () => {
      const r = baseStampRadius("phyllotaxis");
      const outer = 0.47 * BOX;
      expect(raysOf(275, 720, 100000)).toBe(144);
      expect(137.5 / 360).toBeCloseTo(275 / 720, 12);
      expect(raysOf(1, 5000, 5000)).toBe(5000);
      return [
        "3",
        "5",
        num(180 * (3 - Math.sqrt(5)), 5),
        "5000",
        "137.5",
        "275",
        "720",
        String(raysOf(275, 720, 100000)),
        "0.47",
        num(outer, 2),
        String(BOX),
        String(BOX / 2),
        num(BOX / 2 - outer, 2),
        num(outer + r, 2),
        "0.50",
        num(0.5 * BOX + r, 2),
      ];
    },
    lattice: () => {
      const grid = (mult: number, n: number): readonly [number, number] => {
        const sp = Math.sqrt((BOX * BOX) / n) * mult;
        let rows = 0;
        let cols = 0;
        for (let y = sp * 0.5; y < BOX - 1; y += sp * 0.5 * Math.sqrt(3)) {
          rows += 1;
          if (rows === 1) for (let x = sp * 0.5; x < BOX - 1; x += sp) cols += 1;
        }
        return [rows, cols];
      };
      const neighbours = (rowPitch: number): number => {
        const n = 184;
        const sp = Math.sqrt((BOX * BOX) / n) * 1.02;
        const pts: [number, number][] = [];
        let row = 0;
        for (let y = sp * 0.5; y < BOX - 1; y += sp * 0.5 * rowPitch, row += 1) {
          const off = row % 2 ? sp / 2 : 0;
          for (let x = sp * 0.5 + off; x < BOX - 1; x += sp) pts.push([x, y]);
        }
        const c = pts[Math.floor(pts.length / 2)]!;
        const ds = pts
          .filter((p) => p !== c)
          .map((p) => Math.hypot(p[0] - c[0], p[1] - c[1]))
          .sort((a, b) => a - b);
        return ds.filter((d) => d < ds[0]! * 1.02).length;
      };
      const asked = requestedFor("lattice", 5);
      const a = grid(1.02, asked);
      const b = grid(1.0, asked);
      expect(neighbours(Math.sqrt(3))).toBe(6);
      expect(neighbours(2)).toBe(2);
      expect(asked).toBe(184);
      return [
        "3",
        "2",
        num(Math.sqrt(3) / 2, 4),
        String(neighbours(Math.sqrt(3))),
        "1",
        String(neighbours(2)),
        "1.02",
        "1.00",
        num((1.02 - 1) * 100, 0),
        String(asked),
        "5",
        String(a[0]),
        String(a[1]),
        String(b[0]),
        String(b[1]),
        String(a[0] * a[1] - asked),
        String(b[0] * b[1] - asked),
      ];
    },
    metatron: () => {
      const choose2 = (k: number): number => (k * (k - 1)) / 2;
      const R = 0.235 * BOX;
      // The envelope's radius, taken from the engine that draws it rather than
      // restated: the signature claims a halved ring would sit inside it.
      const envelopeRadius = ring("LUNAR").envelope.radius;
      expect(choose2(13)).toBe(78);
      expect(choose2(7)).toBe(21);
      expect(R).toBeLessThan(envelopeRadius);
      return [
        "13",
        "2",
        String(choose2(13)),
        "7",
        String(choose2(7)),
        "0.235",
        num(R, 2),
        num(2 * R, 2),
        String(BOX),
        String(envelopeRadius),
      ];
    },
    organic: () => {
      const figure = ring("LUNAR").walk;
      const seed = seedFromWalk(figure, "organic");
      const n = requestedFor("organic", contextFromWalk(figure).reduced);
      let short = 0;
      let worst = 1;
      for (const word of VOCABULARY) {
        const field = ring(word, { mode: "organic" }).mode!;
        if (field.nodes.length < field.requested) {
          short += 1;
          worst = Math.min(worst, field.nodes.length / field.requested);
        }
      }
      expect(short).toBeGreaterThan(0);
      return [
        "0.86",
        "1.00",
        String(n),
        String(organicYield(n, 0.86, 40, seed)),
        String(organicYield(n, 1.0, 40, seed)),
        String(short),
        String(VOCABULARY.length),
        num(worst, 3),
        "40",
        "5",
        "10",
        "200",
        String(organicYield(n, 0.86, 5, seed)),
        String(organicYield(n, 0.86, 10, seed)),
        String(organicYield(n, 0.86, 200, seed)),
      ];
    },
    cymatic: () => {
      const figure = ring("LUNAR").walk;
      const ctx = contextFromWalk(figure);
      let short = 0;
      for (const word of VOCABULARY) {
        const field = ring(word, { mode: "cymatic" }).mode!;
        if (field.nodes.length < field.requested) short += 1;
      }
      expect(figure.square).toBe("luna");
      return [
        "2",
        "6",
        String(ctx.activated),
        String(ctx.sum),
        String(2 + (ctx.activated % 6)),
        String(2 + (ctx.sum % 6)),
        "0.05",
        "220",
        String(short),
        String(VOCABULARY.length),
      ];
    },
    attractor: () => {
      const lunar = attractorDraws("LUNAR");
      const lunarN = requestedFor("attractor", contextFromWalk(ring("LUNAR").walk).reduced);
      // THE SENTENCE NAMES TWO POPULATIONS AND THIS MEASURES BOTH OF THEM.
      // It used to measure one. `degenerate` is a claim about the nineteen
      // CONCEPT words; `maxDraws` and `unmet` are claims about all 170 in the
      // vocabulary — and both were being computed over the nineteen, so the
      // signature could say "0 of the 170" on the strength of nineteen words. It
      // said "no more than 7 of its 24 draws" on the same nineteen, and the true
      // figure over 170 is larger. That is the sixth false derivation this
      // repository has shipped and it is the same shape as the other five: a
      // sentence whose subject is wider than the experiment under it.
      let degenerate = 0;
      for (const word of CONCEPT_WORDS) {
        if (attractorDraws(word).first.score < 0.2) degenerate += 1;
      }
      let maxDraws = 0;
      let unmet = 0;
      for (const word of VOCABULARY) {
        const r = attractorDraws(word);
        maxDraws = Math.max(maxDraws, r.drawsUsed);
        if (!r.admitted) unmet += 1;
      }
      // The burn-in signature names ONE word, so this measures that one word.
      // It used to take a maximum over a population the sentence never mentions,
      // which agreed with the sentence only because the population's argmax
      // happened to be CROWN. A number that is right by coincidence is the thing
      // this table exists to stop.
      const crownTransient = attractorDraws("CROWN").accepted.transientOff;
      // The prediction the guard exists for: LUNAR's first draw degenerates, and
      // the painter's stride sampling would paint every one of its marks in one
      // place.
      expect(lunar.first.distinct).toBe(1);
      expect(lunar.admitted).toBe(true);
      return [
        "3",
        "0.18",
        "0.04",
        num(0.18 + 0.04 * 1, 2),
        num(0.18 + 0.04 * 9, 2),
        "1",
        "9",
        String(lunarN),
        String(lunar.first.distinct),
        String(degenerate),
        String(CONCEPT_WORDS.length),
        "0.20",
        String(maxDraws),
        "24",
        String(unmet),
        String(VOCABULARY.length),
        "600",
        String(crownTransient),
        num((crownTransient / 600) * 100, 1),
        "0.02",
        "0.08",
        "8",
        "2",
      ];
    },
    mandelbrot: () => {
      const N = 400;
      let inBand = 0;
      for (let i = 0; i < N; i += 1) {
        for (let j = 0; j < N; j += 1) {
          const cr = -2.2 + ((i + 0.5) / N) * 3;
          const ci = -1.25 + ((j + 0.5) / N) * 2.5;
          let zr = 0;
          let zi = 0;
          let it = 0;
          while (zr * zr + zi * zi <= 4 && it < 64) {
            const t = zr * zr - zi * zi + cr;
            zi = 2 * zr * zi + ci;
            zr = t;
            it += 1;
          }
          if (it > 9 && it < 58) inBand += 1;
        }
      }
      return [
        "2.2",
        "0.8",
        "1.25",
        num(0.8 - -2.2, 1),
        num(1.25 * 2, 1),
        "2",
        "0.25",
        "9",
        "58",
        "64",
        "10",
        String(N),
        String(inBand),
        String(N * N),
        "1",
        String(Math.round((N * N) / inBand)),
      ];
    },
    chaos: () => {
      const aboveCubed = 100 * (1 - Math.cbrt(0.4));
      const aboveLinear = 100 * (1 - 0.4);
      return [
        "0.2",
        "2",
        num(aboveCubed, 1),
        "1",
        num(0.2 + 2 * 0.25, 3),
        num(aboveLinear, 1),
        num(0.2 + 2 * 0.5, 3),
      ];
    },
    haring: () => {
      const r = baseStampRadius("haring");
      const move = (deg: number): number => r * Math.sin((deg * Math.PI) / 180);
      expect(PRINT_KIT).toContain("dtgDark: 1.0");
      return [
        "7",
        "16",
        num(r, 2),
        num(move(7), 2),
        num(move(7) * FIG_SCALE, 2),
        num(FIG_SCALE, 2),
        "4",
        num(move(4) * FIG_SCALE, 2),
        "1.0",
        "8",
        "0.58",
        "0.70",
        num(58 / 50, 2),
        num(70 / 50, 2),
        "1",
        "0.16",
        num(0.16 * 100 * 0.5, 0),
        "0",
        "50",
      ];
    },
    minimal: () => {
      const phi = (1 + Math.sqrt(5)) / 2;
      const r = baseStampRadius("minimal");
      const withSatellite = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((v) => requestedFor("minimal", v));
      const firstAppears = withSatellite.findIndex((v) => v >= 2) + 1;
      const secondAppears = withSatellite.findIndex((v) => v >= 3) + 1;
      expect(num(1 - 1 / phi, 3)).toBe("0.382");
      return [
        "0.382",
        "1",
        "0.5",
        "0.70",
        "0.66",
        "0.30",
        "0.74",
        "0.42",
        String(firstAppears),
        String(secondAppears),
        "280",
        "1000",
        num((280 / 1000) * 100, 0),
        num(r, 2),
        String(BOX),
        String(MODE_SPECS.phyllotaxis.base),
      ];
    },
  };

  /**
   * The same audit, pointed at a COMMENT rather than a signature block.
   *
   * `packages/ring/src/index.ts` explains, above the layer that draws the field,
   * exactly what a reader can conclude from the colours on it. That paragraph
   * used to end "count the colours and you have the activated set", which is
   * false for 190 of the 1700 word-by-mode pairs and false for almost every word
   * in `minimal`. It shipped because nothing audits prose in a `.ts` file the way
   * `tokensOf` audits prose in a signature — so this does. Every numeral in the
   * paragraph has to come out of the experiment below.
   */
  it("the sheet's own account of what its colours mean is recomputed, not believed", () => {
    const source = readFileSync(new URL("../packages/ring/src/index.ts", import.meta.url), "utf8");
    const paragraph = source.match(/  \/\/ HUE, and exactly what a reader can do with it\.[\s\S]*?fails on any numeral it cannot produce\./u);
    expect(
      paragraph,
      "the hue paragraph is gone from packages/ring/src/index.ts, or its first or last line was reworded. " +
        "It is audited by this test; if the layer no longer explains its colours, delete this test in the same commit.",
    ).not.toBeNull();

    const colourOf = (hue: number): string =>
      SPECTRUM[Math.min(SPECTRUM.length - 1, Math.floor(hue * SPECTRUM.length))]!;

    let pairs = 0;
    let injective = 0;
    let recovers = 0;
    let enoughStamps = 0;
    let enoughStampsRecovers = 0;
    let subsetNotWrong = 0;
    const failsIn = new Map<ModeId, number>();
    let largestActivated = 0;
    for (const word of VOCABULARY) {
      const figure = walk(word);
      const ctx = contextFromWalk(figure);
      largestActivated = Math.max(largestActivated, ctx.activated);
      for (const mode of MODE_IDS) {
        const field = fieldFromWalk(figure, mode);
        pairs += 1;
        const shown = new Set(field.nodes.map((n) => n.cell));
        const colours = new Set(field.nodes.map((n) => colourOf(n.hue)));
        // One swatch per stamped cell and no two cells sharing one.
        if (colours.size === shown.size) injective += 1;
        if (colours.size === ctx.activated) recovers += 1;
        else failsIn.set(mode, (failsIn.get(mode) ?? 0) + 1);
        if (field.nodes.length >= ctx.steps) {
          enoughStamps += 1;
          if (colours.size === ctx.activated) enoughStampsRecovers += 1;
        }
        // A proper subset, never a cell the walk did not touch.
        if ([...shown].every((c) => figure.activatedCells.includes(c))) subsetNotWrong += 1;
      }
    }
    // The claims, in the order the paragraph makes them.
    expect(injective).toBe(pairs);
    expect(subsetNotWrong).toBe(pairs);
    expect(largestActivated).toBeLessThanOrEqual(SPECTRUM.length);
    expect(enoughStampsRecovers).toBe(enoughStamps);

    const produced = new Set<string>([
      String(pairs),
      String(SPECTRUM.length),
      String(enoughStamps),
      String(recovers),
      String(pairs - recovers),
      String(VOCABULARY.length),
      String(MODE_SPECS.minimal.cap),
      String(MODE_SPECS.metatron.cap),
      String(failsIn.get("minimal") ?? -1),
      String(failsIn.get("metatron") ?? -1),
    ]);
    const unaccounted = [
      ...new Set([...paragraph![0].matchAll(/\d+(?:\.\d+)?/gu)].map((m) => m[0]!)),
    ].filter((t) => !produced.has(t));
    expect(
      unaccounted.join(", "),
      "the hue paragraph in packages/ring/src/index.ts states numbers this experiment did not produce. " +
        "Either the field changed and the paragraph is now stale, or the paragraph gained a claim nobody checks — " +
        "which is how it came to say `count the colours and you have the activated set` for 190 pairs where you cannot.",
    ).toBe("");
    // Named modes only. A third mode that starts failing must be named too.
    expect([...failsIn.keys()].sort()).toEqual(["metatron", "minimal"]);
  });

  for (const mode of MODE_IDS) {
    it(`${mode}: every number in its signatures comes from an experiment that was run`, () => {
      const produced = new Set(EXPERIMENTS[mode]());
      // A mode's own authored constants are legitimate in its own prose.
      const spec = MODE_SPECS[mode];
      for (const v of [spec.cap, spec.base, spec.dens]) produced.add(String(v));
      const unaccounted = [...new Set(tokensOf(mode))].filter((t) => !produced.has(t));
      expect(
        unaccounted.join(", "),
        `${mode} states ${unaccounted.length} number(s) no experiment in this suite produced. ` +
          "Either the claim is new and needs an experiment here, or it is a number nobody " +
          "is checking — which is how the first draft of these signatures shipped three false ones.",
      ).toBe("");
    });
  }

  it("keeps every signature a prediction and not an adjective", () => {
    for (const mode of MODE_IDS) {
      for (const signature of MODE_SPECS[mode].signatures) {
        expect(signature.origin === "walk" || signature.origin === "painter", mode).toBe(true);
        // A prediction says what a reader would find DIFFERENT. Every one of these
        // has to contain a counterfactual, not only a description.
        expect(
          /\b(and|Set|Move|Take|Push|Round|Drop|Bring|Widen|Narrow|Halve|Lower|Raise|Delete|Swap|Leave|Make|without|instead|would|stops|becomes)\b/u.test(
            signature.reason,
          ),
          `${mode} · ${signature.constant} states no counterfactual`,
        ).toBe(true);
        expect(signature.reason.length, `${mode} · ${signature.constant}`).toBeGreaterThan(120);
      }
    }
  });

  it("signs twenty-three constants across the ten constructions", () => {
    const total = MODE_IDS.reduce((n, m) => n + MODE_SPECS[m].signatures.length, 0);
    expect(total).toBe(23);
    // Two of them are the ones this port replaced with a walk quantity, and both
    // say so; the rest are the painter's, carried over and kept.
    const walkDerived = MODE_IDS.flatMap((m) =>
      MODE_SPECS[m].signatures.filter((s) => s.origin === "walk").map((s) => `${m}: ${s.constant}`),
    );
    expect(walkDerived).toEqual([
      "cymatic: mode numbers kx, ky",
      "attractor: minimum admission score, 0.18 + 0.04 × the walk's reduction",
    ]);
  });
});

/* ── 9. the layer costs the plate nothing it already had ─────────────────── */

describe("adding a field takes nothing away from the plate", () => {
  it("leaves the envelope as the finest ink on the sheet, so the gauge does not move", () => {
    // The gauge in the title block is the thinnest stroke the plate paints,
    // measured off the finished markup. If a mode's ink went below the envelope's
    // the printed gauge would become a property of the word's mode rather than of
    // the plate. Read off the EMITTED bytes, per group.
    const widths = (svg: string, group: RegExp): readonly number[] => {
      const start = svg.search(group);
      if (start < 0) return [];
      const slice = svg.slice(start, svg.indexOf("</g>", start) + 4);
      return (slice.match(/stroke-width="([\d.]+)"/gu) ?? []).map((m) =>
        Number(m.slice('stroke-width="'.length, -1)),
      );
    };
    for (const mode of MODE_IDS) {
      const svg = ring("WAR", { mode }).sheetSvg;
      const envelope = widths(svg, /<g id="envelope"/u);
      const field = widths(svg, /<g id="mode-[a-z]+"/u);
      expect(envelope.length, mode).toBeGreaterThan(0);
      expect(field.length, mode).toBeGreaterThan(0);
      expect(Math.min(...field), `${mode}: the field's thinnest stroke`).toBeGreaterThanOrEqual(
        MIN_STROKE,
      );
      expect(
        Math.min(...field),
        `${mode}: the field is finer than the envelope, so the plate's gauge would report the mode`,
      ).toBeGreaterThan(Math.min(...envelope));
    }
  });

  it("keeps the walk, the envelope and the receipt exactly where they were", () => {
    // A field is added ink and nothing else. The word the receipt hands back, the
    // cusp count a reader is told to check, and the cells the walk laid down are
    // all upstream of it and must not move when a mode is switched.
    const control = ring("LUNAR", { mode: "none", vocabulary: VOCABULARY });
    for (const mode of MODE_IDS) {
      const art = ring("LUNAR", { mode, vocabulary: VOCABULARY });
      expect(art.walk.paths.map((p) => p.d), mode).toEqual(control.walk.paths.map((p) => p.d));
      expect(art.envelope.cusps, mode).toBe(control.envelope.cusps);
      expect(art.envelope.bands.map((b) => b.d), mode).toEqual(control.envelope.bands.map((b) => b.d));
      expect(art.receipt, mode).toBe(control.receipt);
      // …and the sheet DOES change, or the layer would be doing nothing.
      expect(art.sheetId, mode).not.toBe(control.sheetId);
    }
  });

  it("is browser-safe, so the CLI and the instrument can run one engine", () => {
    // House rule 1: the browser must run the SAME engine as the CLI, bundled.
    // A node-only import in this package is what would make that impossible, so
    // it is an exit code rather than an intention.
    for (const { name, text } of PACKAGE_SOURCE) {
      expect(text, `${name}.ts imports a node builtin`).not.toMatch(/from "node:/u);
      expect(text, `${name}.ts uses require`).not.toMatch(/\brequire\s*\(/u);
    }
  });

  it("places its field under the envelope, the marks and the walk, in that order", () => {
    const svg = ring("WAR").sheetSvg;
    const at = (needle: string): number => svg.indexOf(needle);
    expect(at('<g id="envelope"')).toBeGreaterThan(at('<g id="mode-haring"'));
    expect(at('<g id="marks"')).toBeGreaterThan(at('<g id="envelope"'));
    expect(at('<g id="walk-line"')).toBeGreaterThan(at('<g id="marks"'));
  });

  it("says the order it actually emits, on the legend of every mode", () => {
    // The legend claimed the field was drawn OVER the envelope for as long as it
    // took to read one. The sentence and the markup are checked against each
    // other now, because a caption that describes the previous version of a
    // drawing is exactly the failure the whole plate exists against.
    for (const mode of MODE_IDS) {
      const art = ring("LUNAR", { mode });
      const svg = art.sheetSvg;
      const fieldAt = svg.indexOf(`<g id="mode-${mode}"`);
      const envelopeAt = svg.indexOf('<g id="envelope"');
      expect(fieldAt, mode).toBeGreaterThan(-1);
      const drawnUnder = fieldAt < envelopeAt;
      const section = art.legend.slice(art.legend.indexOf("THE COMPOSITION MODE"));
      expect(/Its field is drawn UNDER the envelope/u.test(section), mode).toBe(drawnUnder);
    }
  });
});

/* ── 10. the contraction's own account of itself ─────────────────────────── */

describe("the contraction says which of the two things it prevented", () => {
  it("splits the ten modes exactly the way types.ts records", () => {
    // The claim in `ModeField.reach`'s doc comment, measured over the whole
    // vocabulary rather than asserted: three groups, and the census's contraction
    // reason branches on which group a plate is in.
    const never: ModeId[] = [];
    const always: ModeId[] = [];
    const sometimes: ModeId[] = [];
    for (const mode of MODE_IDS) {
      let past = 0;
      for (const word of VOCABULARY) {
        if (ring(word, { mode }).mode!.reach > BOX / 2) past += 1;
      }
      (past === 0 ? never : past === VOCABULARY.length ? always : sometimes).push(mode);
    }
    expect(never).toEqual(["phyllotaxis", "attractor", "mandelbrot", "minimal"]);
    expect(always).toEqual(["organic", "cymatic"]);
    expect(sometimes).toEqual(["lattice", "metatron", "chaos", "haring"]);
  });

  it("tells each plate the truth about what its contraction prevented", () => {
    const CROSSES = "crosses the viewBox the sheet declares";
    const MARGIN = "no ink leaves the viewBox";
    const IDENTITY = "the contraction is the identity";
    for (const mode of MODE_IDS) {
      for (const word of ["LUNAR", "DESCENT", "ZZZZZZZZZ", ""]) {
        const art = ring(word, { mode });
        const field = art.mode!;
        const reason = art.choices.find((c) => c.element === "the mode's contraction")!.reason;
        const expected =
          field.contraction >= 1 ? IDENTITY : field.reach > BOX / 2 ? CROSSES : MARGIN;
        expect(reason, `${mode} ${JSON.stringify(word)}`).toContain(expected);
        for (const other of [CROSSES, MARGIN, IDENTITY].filter((v) => v !== expected)) {
          expect(reason, `${mode} ${JSON.stringify(word)} also claims the other case`).not.toContain(
            other,
          );
        }
      }
    }
  });
});

/**
 * The ten placement fields, ported from `const MODES` at
 * `assets/symbolpaintermk137.html:384`.
 *
 * These are the painter's constructions, not names for them. Each `place()` is
 * the source's `fn(W,H,n,rng)` with its arithmetic intact, including the order
 * of the `rng()` calls — `organic` and `cymatic` are rejection samplers, so a
 * draw moved across an `if` produces a different field from the same seed and
 * silently stops being the painter's mode. Where a line is changed at all it is
 * changed because the walk can say what the painter had to guess, and every such
 * line carries a signature in `spec.signatures` with the prediction that goes
 * with it.
 *
 * `cap`, `base` and `dens` are the painter's per-mode constants: how many stamps
 * the construction can carry, how large one is on a 1000-unit canvas, and where
 * the density slider sits by default. They are kept as authored. `cap` and
 * `base` are the mode's identity — Minimal is `cap: 3, base: 280`, and a Minimal
 * with a hundred small marks is not Minimal — so replacing them with a
 * derivation would delete the modes rather than drive them.
 */

import { mulberry32 } from "./seed.js";
import { dcos, dsin } from "./trig.js";
import type { ModeId, ModeSignature } from "./types.js";

/** A placement before the walk is attached to it. The painter's node, exactly. */
export type RawNode = {
  x: number;
  y: number;
  s: number;
  rot: number;
  op: number;
  radiant?: boolean;
};

/** A structural segment: the construction's own ink, in raw field coordinates. */
export type RawSegment = readonly [number, number, number, number];

/** What the walk tells a field, so no field has to reach for the walk itself. */
export type FieldContext = Readonly<{
  /** The walked cells, in order. One per letter station 1 kept. */
  cells: readonly number[];
  /** The distinct cells, ascending — `Walk.activatedCells`. */
  activatedCells: readonly number[];
  /** How many distinct cells this word touched on this square. */
  activated: number;
  /** Sum of the walked cells. */
  sum: number;
  /** That sum reduced theosophically to 1–9; `1` when there are no letters. */
  reduced: number;
  /** Order of the square: 3 for saturn, 9 for luna. */
  order: number;
  /** Letters actually walked. */
  steps: number;
}>;

export type FieldResult = Readonly<{
  nodes: readonly RawNode[];
  structure: readonly RawSegment[];
}>;

export type ModeSpec = Readonly<{
  id: ModeId;
  label: string;
  rule: string;
  /** Most stamps this construction carries. */
  cap: number;
  /** Stamp size on the painter's 1000-unit canvas. */
  base: number;
  /** The painter's default density slider position, 0–100. */
  dens: number;
  place: (W: number, H: number, n: number, rng: () => number, ctx: FieldContext) => FieldResult;
  signatures: readonly ModeSignature[];
}>;

const TAU = Math.PI * 2;
const R3 = Math.sqrt(3);

const plain = (nodes: readonly RawNode[]): FieldResult =>
  Object.freeze({ nodes, structure: Object.freeze([]) });

/* ── metatron's thirteen ──────────────────────────────────────────────────── */

/**
 * `metatronNodes()` from the painter, `symbolpaintermk137.html:379`.
 *
 * Centre, then two concentric hexagons at R and 2R — thirteen points. The
 * painter's `R = min(W,H) * 0.235` is kept: the outer ring lands at 2R = 0.47 of
 * the frame, which is exactly where `phyllotaxis` puts its outermost seed, so the
 * two modes fill the same disc and can be compared.
 */
function metatronNodes(W: number, H: number): readonly (readonly [number, number])[] {
  const cx = W / 2;
  const cy = H / 2;
  const R = Math.min(W, H) * 0.235;
  const out: [number, number][] = [[cx, cy]];
  for (let rg = 1; rg <= 2; rg += 1) {
    for (let i = 0; i < 6; i += 1) {
      const a = -Math.PI / 2 + (i * TAU) / 6;
      out.push([cx + dcos(a) * R * rg, cy + dsin(a) * R * rg]);
    }
  }
  return out;
}

/* ── the ten ──────────────────────────────────────────────────────────────── */

const spec = (s: ModeSpec): ModeSpec => Object.freeze(s);

export const MODE_SPECS: Readonly<Record<ModeId, ModeSpec>> = Object.freeze({
  phyllotaxis: spec({
    id: "phyllotaxis",
    label: "Phyllotaxis",
    rule: "golden angle · 137.5°",
    cap: 420,
    base: 46,
    dens: 64,
    place(W, H, n) {
      const GA = Math.PI * (3 - Math.sqrt(5));
      const cx = W / 2;
      const cy = H / 2;
      const k = (Math.min(W, H) * 0.47) / Math.sqrt(n);
      const out: RawNode[] = [];
      for (let i = 1; i <= n; i += 1) {
        const r = k * Math.sqrt(i);
        const a = i * GA;
        out.push({
          x: cx + r * dcos(a),
          y: cy + r * dsin(a),
          s: 0.45 + 0.55 * (i / n),
          rot: (a * 180) / Math.PI,
          op: 1,
        });
      }
      return plain(out);
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "golden angle π(3−√5)",
        value: "137.50776°",
        origin: "painter" as const,
        reason:
          "Not free and not arbitrary: it is irrational, so no two seeds ever share a ray — 5000 seeds give 5000 distinct rays — and that is why the spiral packs without gaps or spokes. Round it to 137.5° flat, which is exactly 275/720 of a turn, and the seeds fall onto 144 rays and then repeat forever: the field stops being a packing and becomes a spoked wheel. The studio is named after this number.",
      }),
      Object.freeze({
        constant: "outermost seed at 0.47 of the frame",
        value: "0.47",
        origin: "painter" as const,
        reason:
          "Free, signed. The last seed lands 103.40 from the centre of a 220-unit frame whose half-width is 110, so the construction clears the border by 6.60 and its outermost ink reaches 108.46 — inside the frame before this port's contraction touches it. Push the factor to 0.50 and that ink reaches 115.06, outside the frame, and the contraction has to pull the whole spiral in to compensate: the same construction, a smaller figure.",
      }),
    ]),
  }),

  lattice: spec({
    id: "lattice",
    label: "Lattice",
    rule: "hexagonal grid",
    cap: 340,
    base: 58,
    dens: 54,
    place(W, H, n) {
      const a = Math.sqrt((W * H) / Math.max(1, n));
      const sp = a * 1.02;
      const out: RawNode[] = [];
      let row = 0;
      for (let y = sp * 0.5; y < H - 1; y += sp * 0.5 * R3, row += 1) {
        const off = row % 2 ? sp / 2 : 0;
        for (let x = sp * 0.5 + off; x < W - 1; x += sp) {
          out.push({ x, y, s: 1, rot: 0, op: 1 });
        }
      }
      return plain(out.slice(0, n));
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "row pitch √3/2 × column pitch",
        value: "0.8660",
        origin: "painter" as const,
        reason:
          "Forced, not chosen: √3/2 is the only row spacing for which an offset row sits at equal distance from both of its neighbours above, and that is what makes this a hexagonal lattice rather than a stretched brick bond. Measured on an interior stamp, the √3/2 pitch gives it 6 nearest neighbours all at one distance; a row pitch of 1 gives it 2. Lattice would become a different mode.",
      }),
      Object.freeze({
        constant: "spacing multiplier 1.02",
        value: "1.02",
        origin: "painter" as const,
        reason:
          "Free, signed. The cell pitch is 2% wider than the square root of the area per stamp, so the last column clears the right edge instead of being cut by the `x < W − 1` guard. At the 184 stamps a word reducing to 5 asks for, 1.02 lays out 15 rows of 13 and 1.00 lays out 16 rows of 14, so the slice at the end discards 11 places instead of 40 — and which places it discards is decided by iteration order, not by the construction.",
      }),
    ]),
  }),

  metatron: spec({
    id: "metatron",
    label: "Metatron",
    rule: "the thirteen nodes",
    cap: 13,
    base: 84,
    dens: 100,
    place(W, H, n) {
      const nodes = metatronNodes(W, H);
      const placed = nodes.slice(0, Math.max(1, n)).map<RawNode>((p) => ({
        x: p[0],
        y: p[1],
        s: 1,
        rot: 0,
        op: 1,
      }));
      // The painter draws these chords only when no archetype is stacked on top
      // (`drawMetatronLines` is called under `arch === "none"`). No archetype is
      // wired here, so they are always drawn: without them the mode is thirteen
      // marks on a hexagon and nothing distinguishes it from a sparse Lattice.
      const structure: RawSegment[] = [];
      for (let i = 0; i < nodes.length; i += 1) {
        for (let j = i + 1; j < nodes.length; j += 1) {
          structure.push([nodes[i]![0], nodes[i]![1], nodes[j]![0], nodes[j]![1]]);
        }
      }
      return Object.freeze({ nodes: placed, structure });
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "thirteen nodes, all 78 chords",
        value: "13 nodes · 78 chords",
        origin: "painter" as const,
        reason:
          "Load-bearing for the mode: 13 nodes give C(13,2) = 78 chords, and that count is what a reader can check the figure against. Drop to the inner 7 and the count falls to 21 and the outer hexagon disappears; the Fruit of Life stops being a Fruit of Life. The stamp count varies with the word — the census prints it — and the thirteen do not.",
      }),
      Object.freeze({
        constant: "ring radius 0.235 of min(W,H)",
        value: "0.235",
        origin: "painter" as const,
        reason:
          "Free, signed. The two hexagons land 51.70 and 103.40 from the centre of a 220-unit frame, and the outer one reaches exactly the 103.40 the golden-angle packing reaches, so the two modes fill one disc and can be compared. Halve it and the whole construction sits inside the envelope's own radius of 78 and reads as a badge on the chords rather than as the field.",
      }),
    ]),
  }),

  organic: spec({
    id: "organic",
    label: "Organic",
    rule: "poisson spacing · even but alive",
    cap: 280,
    base: 56,
    dens: 60,
    place(W, H, n, rng) {
      const r = Math.sqrt((W * H) / Math.max(1, n)) * 0.86;
      const r2 = r * r;
      const out: RawNode[] = [];
      let att = 0;
      const cap = n * 40;
      while (out.length < n && att < cap) {
        att += 1;
        const x = rng() * W;
        const y = rng() * H;
        let ok = true;
        for (let i = 0; i < out.length; i += 1) {
          const dx = out[i]!.x - x;
          const dy = out[i]!.y - y;
          if (dx * dx + dy * dy < r2) {
            ok = false;
            break;
          }
        }
        // The two draws below are INSIDE the accept branch in the painter, so a
        // rejected candidate consumes exactly two numbers and an accepted one
        // consumes four. Hoisting them out of the `if` — the obvious tidy-up —
        // desynchronises the stream and produces a different field from the same
        // seed. It is the whole reason this loop is transcribed rather than
        // rewritten.
        if (ok) out.push({ x, y, s: 0.85 + rng() * 0.3, rot: (rng() - 0.5) * 20, op: 1 });
      }
      return plain(out);
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "exclusion radius 0.86 × √(area/n)",
        value: "0.86",
        origin: "painter" as const,
        reason:
          "Free, signed, and it is a floor on how many marks get placed rather than a guarantee. On LUNAR, which asks for 101, the sampler places 94 at 0.86 and 73 at 1.00 within the same attempt budget — the disc-packing bound means n discs at the full mean spacing do not fit the frame at all. 148 of the 170 vocabulary words already place fewer than they ask for at 0.86, the worst at 0.853 of its request, which is exactly why the mode census prints the count asked for and the count placed as two numbers instead of one.",
      }),
      Object.freeze({
        constant: "attempt budget 40n",
        value: "40",
        origin: "painter" as const,
        reason:
          "Free, signed. A rejection sampler needs a bound or it does not terminate, and on this construction the bound decides the yield outright: on LUNAR's 101 stamps, a budget of 5n places 78, 10n places 85, 40n places 94 and 200n places 100. The marks a smaller budget loses are the ones that have to thread the gaps, so the field thins toward the end of the sequence instead of staying even — which is the one property Organic exists to have.",
      }),
    ]),
  }),

  cymatic: spec({
    id: "cymatic",
    label: "Cymatic",
    rule: "standing-wave nodes",
    cap: 520,
    base: 30,
    dens: 64,
    place(W, H, n, rng, ctx) {
      // THE PAINTER DREW THESE TWO FROM THE RNG: `kx = 2 + ((rng()*6)|0)`.
      // They are the mode numbers of the standing wave — the whole shape of the
      // Chladni figure is (kx, ky) and nothing else — so leaving them to the
      // stream would have made the most legible quantity on the plate a
      // coincidence of the seed. Derived from the walk instead, the nodal
      // pattern is a readout: count the cells the word touched and the crossings
      // of the figure are determined.
      const kx = 2 + (ctx.activated % 6);
      const ky = 2 + (ctx.sum % 6);
      const out: RawNode[] = [];
      let att = 0;
      const cap = n * 220;
      const f = (X: number, Y: number): number =>
        dsin(kx * Math.PI * X) * dsin(ky * Math.PI * Y) +
        dsin(ky * Math.PI * X) * dsin(kx * Math.PI * Y);
      while (out.length < n && att < cap) {
        att += 1;
        const X = rng();
        const Y = rng();
        if (Math.abs(f(X, Y)) < 0.05) {
          out.push({ x: X * W, y: Y * H, s: 0.4 + rng() * 0.3, rot: 0, op: 0.82 });
        }
      }
      return plain(out);
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "mode numbers kx, ky",
        value: "kx = 2 + activated mod 6 · ky = 2 + cellSum mod 6",
        origin: "walk" as const,
        reason:
          "The painter drew both from the seeded stream, which made the most legible quantity on the plate a coincidence of the seed. Derived from the walk, the nodal figure reports the word: LUNAR walks luna, touches 4 distinct cells and sums to 21, so kx is 6 and ky is 5 and the plate is the nodal set of that standing wave. Leave them to the stream and the figure still varies word to word — but it reports the hash and not the walk, and two words with identical cells would draw different plates.",
      }),
      Object.freeze({
        constant: "nodal band |f| < 0.05",
        value: "0.05",
        origin: "painter" as const,
        reason:
          "Free, signed. The band is how thick the drawn nodal line is, and it trades directly against the attempt budget: at 0.05 with 220n attempts, 0 of the 170 vocabulary words place fewer marks than they ask for. Widen it and the lines thicken into bands and the figure stops resolving into curves; narrow it and the sampler starves instead, and the count on the plate stops matching the count asked for.",
      }),
    ]),
  }),

  attractor: spec({
    id: "attractor",
    label: "Strange Attractor",
    rule: "de Jong orbit · order in chaos",
    cap: 700,
    base: 26,
    dens: 70,
    place(W, H, n, rng, ctx) {
      const pad = W * 0.08;
      const total = n * 16 + 1400;

      // The painter takes the four de Jong parameters straight from the stream
      // and paints whatever comes out. Most of that space is degenerate — the
      // orbit settles onto a fixed point or a short cycle — and the painter's
      // own stride sampling makes it worse: `step = ⌊orbit/n⌋` over a periodic
      // orbit aliases down to gcd(period, step) distinct places, so a cycle of
      // 36 sampled every 18th step paints TWO dots and calls it an attractor.
      // That is not a hypothetical; it is what LUNAR did before this guard.
      //
      // So the draw is scored on the points that actually get DRAWN, not on the
      // orbit: how much of the box the sampled set spans, discounted by how many
      // distinct places it resolves to. The parameters stay stream-drawn — four
      // numbers in [−3,3] with no meaning outside the map is what de Jong is,
      // and binding them to cells would dress a coincidence as a reading — but
      // the ADMISSION threshold is a walk quantity.
      const threshold = 0.18 + 0.04 * ctx.reduced;
      const target = Math.min(n, 64);
      let best: RawNode[] = [];
      let bestScore = -1;
      for (let tries = 0; tries < 24; tries += 1) {
        const a = -3 + rng() * 6;
        const b = -3 + rng() * 6;
        const c = -3 + rng() * 6;
        const d = -3 + rng() * 6;
        let x = 0;
        let y = 0;
        const orbit: (readonly [number, number])[] = [];
        for (let i = 0; i < total; i += 1) {
          const nx = dsin(a * y) - dcos(b * x);
          const ny = dsin(c * x) - dcos(d * y);
          x = nx;
          y = ny;
          if (i > 600) orbit.push([x, y]);
        }
        const step = Math.max(1, Math.floor(orbit.length / n));
        const sample: (readonly [number, number])[] = [];
        for (let i = 0; i < orbit.length && sample.length < n; i += step) {
          sample.push(orbit[i]!);
        }
        let lo0 = Infinity;
        let hi0 = -Infinity;
        let lo1 = Infinity;
        let hi1 = -Infinity;
        const distinct = new Set<string>();
        for (const p of sample) {
          if (p[0] < lo0) lo0 = p[0];
          if (p[0] > hi0) hi0 = p[0];
          if (p[1] < lo1) lo1 = p[1];
          if (p[1] > hi1) hi1 = p[1];
          distinct.add(`${p[0].toFixed(2)},${p[1].toFixed(2)}`);
        }
        // The orbit lives in [−2,2]²; the score is the fraction of that box the
        // narrower axis covers, times the fraction of `target` distinct places
        // reached, capped at 1. A wide two-dot cycle scores near zero.
        const score =
          (Math.min(hi0 - lo0, hi1 - lo1) / 4) * Math.min(1, distinct.size / target);
        if (score > bestScore) {
          bestScore = score;
          best = sample.map((p) => ({
            x: pad + ((p[0] + 2) / 4) * (W - 2 * pad),
            y: pad + ((p[1] + 2) / 4) * (H - 2 * pad),
            // Placeholders: the two per-node draws are taken below, in one pass
            // over the accepted sample, so a rejected draw costs four numbers
            // and not 2n of them.
            s: 0,
            rot: 0,
            op: 0.72,
          }));
        }
        if (score >= threshold) break;
      }
      const out: RawNode[] = best.map((node) => ({
        ...node,
        s: 0.4 + rng() * 0.3,
        rot: rng() * 360,
      }));
      return plain(out);
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "de Jong parameters a,b,c,d ∈ [−3,3]",
        value: "four draws from the walk-seeded stream",
        origin: "painter" as const,
        reason:
          "Free, signed, and the one place this port did NOT derive from the walk. The map is x' = sin(ay) − cos(bx), y' = sin(cx) − cos(dy); its four parameters mean nothing outside it, so binding them to cells would dress a coincidence as a reading. Each is drawn uniformly from the interval −3 to 3 out of the walk-seeded stream, so the same word always draws the same orbit — swap in Math.random and LUNAR paints a different attractor on every run and the sheet's own drawing number stops being reproducible. The sine and cosine are trig.ts's dsin and dcos, not the built-ins: this is the one construction in the package that feeds its own output back into its next input, Node and Chromium do not agree to the last bit about Math.sin, and on the built-ins the browser and the CLI drew two different sheets for DESCENT. The disagreement rate is not quoted here because no test in this suite can produce it — scripts/build-browser-bundle.ts measures it in both runtimes on every run, and that is where the number lives.",
      }),
      Object.freeze({
        constant: "minimum admission score, 0.18 + 0.04 × the walk's reduction",
        value: "0.22 to 0.54, on a score of at most 1",
        origin: "walk" as const,
        reason:
          "Added by this port, not present in the painter, and it exists because the painter's own stride sampling has a failure mode: over a PERIODIC orbit, taking every ⌊orbit ÷ n⌋-th point aliases down to gcd(period, stride) distinct places. LUNAR's first draw settles to a fixed point, so all 294 of the marks the painter's sampling would place land in 1 spot. Scoring the sampled points — how much of the box they span, discounted by how many distinct places they reach — and taking the first draw unconditionally, 10 of the 19 concept words score below 0.20 and paint a smear or a handful of dots. With the threshold, the hungriest of the 170 vocabulary words needs 16 of its 24 draws and 0 of the 170 fails to meet it. The threshold rides the walk's reduction, so a word reducing to 9 is held to a wider orbit than one reducing to 1: the same construction, admitted at different strictness.",
      }),
      Object.freeze({
        constant: "burn-in 600 iterations, frame pad 0.08",
        value: "600 · 0.08",
        origin: "painter" as const,
        reason:
          "Free, signed. The first 600 steps are the transient from the origin onto the attractor, and they are genuinely not on it: on CROWN, 527 of those 600 points — 87.8% — land in a cell of a 0.02 grid that the settled orbit never visits once. Keep them and the plate gains a tail of stray marks that no part of the figure accounts for. The 8% pad is the margin the orbit's box, which runs from −2 to 2 on each axis, is mapped into.",
      }),
    ]),
  }),

  mandelbrot: spec({
    id: "mandelbrot",
    label: "Mandelbrot",
    rule: "escape-time boundary",
    cap: 520,
    base: 30,
    dens: 64,
    place(W, H, n, rng) {
      const re0 = -2.2;
      const re1 = 0.8;
      const im0 = -1.25;
      const im1 = 1.25;
      const out: RawNode[] = [];
      let att = 0;
      const cap = n * 260;
      while (out.length < n && att < cap) {
        att += 1;
        const cr = re0 + rng() * (re1 - re0);
        const ci = im0 + rng() * (im1 - im0);
        let zr = 0;
        let zi = 0;
        let it = 0;
        while (zr * zr + zi * zi <= 4 && it < 64) {
          const t = zr * zr - zi * zi + cr;
          zi = 2 * zr * zi + ci;
          zr = t;
          it += 1;
        }
        if (it > 9 && it < 58) {
          out.push({
            x: ((cr - re0) / (re1 - re0)) * W,
            y: ((ci - im0) / (im1 - im0)) * H,
            s: 0.3 + 0.6 * (it / 58),
            rot: rng() * 360,
            op: 0.6 + 0.35 * (it / 58),
          });
        }
      }
      return plain(out);
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "window [−2.2, 0.8] × [−1.25, 1.25]",
        value: "3.0 × 2.5 in the complex plane",
        origin: "painter" as const,
        reason:
          "Derived, not free: the Mandelbrot set is contained in the disc of radius 2 about the origin and its real extent runs from −2 to 0.25, so this 3.0 by 2.5 window is the set plus a margin. Narrow it and the sampler spends its budget on candidates outside the set; widen it and the figure shrinks inside the frame with nothing in the new area.",
      }),
      Object.freeze({
        constant: "escape band 9 < iterations < 58 of 64",
        value: "9 · 58 · 64",
        origin: "painter" as const,
        reason:
          "Free, signed, and it is what makes this mode draw a BOUNDARY rather than a filled disc. Points escaping in under 10 steps are the far exterior and points surviving 58 of the 64 iterations are the interior; the filaments are what is left between them. On a 400 by 400 grid over the window, 11116 of the 160000 cells fall in the band — about 1 in 14 — and with the band removed all 160000 are kept and the field fills the window uniformly. The mode becomes Chaos with a bias.",
      }),
    ]),
  }),

  chaos: spec({
    id: "chaos",
    label: "Chaos",
    rule: "pure entropy",
    cap: 420,
    base: 54,
    dens: 56,
    place(W, H, n, rng) {
      const out: RawNode[] = [];
      for (let i = 0; i < n; i += 1) {
        const t = rng();
        out.push({
          x: rng() * W,
          y: rng() * H,
          s: 0.2 + t * t * t * 2.0,
          rot: rng() * 360,
          op: 0.5 + rng() * 0.5,
        });
      }
      return plain(out);
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "size law s = 0.2 + t³ × 2",
        value: "cubed",
        origin: "painter" as const,
        reason:
          "Free, signed, and the size histogram is this mode's texture — its positions are uniform and carry nothing. Cubing a uniform draw puts 26.3% of the marks above s = 1 and leaves the mean at 0.700. Make it linear and 60.0% are above 1 and the mean rises to 1.200: the sizes bunch, the plate reads as even scatter, and Chaos and Organic then differ only by a minimum spacing.",
      }),
      Object.freeze({
        constant: "positions uniform on the frame",
        value: "rng()×W, rng()×H",
        origin: "painter" as const,
        reason:
          "Load-bearing for the mode and the one field where the walk deliberately does not reach past the seed: Chaos is the control. Its positions carry no structure by construction, so it is the field to compare the other nine against — anything a reader can see in a Chaos plate is something the eye put there.",
      }),
    ]),
  }),

  haring: spec({
    id: "haring",
    label: "Haring",
    rule: "rhythmic repetition + radiance",
    cap: 150,
    base: 70,
    dens: 68,
    place(W, H, n, rng) {
      const cols = Math.max(2, Math.round(Math.sqrt(n)));
      const rows = Math.max(1, Math.round(n / cols));
      const cw = W / cols;
      const ch = H / rows;
      const out: RawNode[] = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          const jx = (rng() - 0.5) * cw * 0.16;
          const jy = (rng() - 0.5) * ch * 0.16;
          const sign = (r + c) % 2 ? 1 : -1;
          out.push({
            x: cw * (c + 0.5) + jx,
            y: ch * (r + 0.5) + jy,
            s: 0.66 + rng() * 0.18,
            rot: sign * (7 + rng() * 9),
            op: 1,
            radiant: true,
          });
        }
      }
      return plain(out);
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "alternating tilt, sign = (row+col) odd",
        value: "±(7° to 16°)",
        origin: "painter" as const,
        reason:
          "Load-bearing for the mode. The checkerboard of tilts is what gives the grid its beat; make every sign positive and the field leans one way and reads as a skewed grid rather than as rhythm. The magnitude is free, and it is bounded from below by the print: at this mode's stamp radius of 7.70 units a 7° tilt moves a vertex 0.94 units, which is 0.70 mm at the plate's 0.75 mm to the unit, while a 4° tilt moves it 0.40 mm — less than the 1.0 mm stroke floor this repository prints against on a dark garment, so the alternation would be finer than the ink that carries it.",
      }),
      Object.freeze({
        constant: "radiance: 8 ticks from 0.58r to 0.70r",
        value: "8 · 0.58 · 0.70",
        origin: "painter" as const,
        reason:
          "Free, signed, and the only mode-specific ink besides Metatron's chords. 8 ticks ring each stamp, running from 1.16 to 1.40 of its radius — OUTSIDE the mark, which is why a Haring placement has to be bounded by 1.40 radii and not by 1, and why this is the one mode whose containment arithmetic differs. Delete them and the plate is a jittered grid: a reader could not tell this mode from Lattice by the figure alone.",
      }),
      Object.freeze({
        constant: "jitter ±8% of the cell",
        value: "0.16 peak-to-peak",
        origin: "painter" as const,
        reason:
          "Free, signed. Each mark is displaced by at most 8% of its cell in each direction — enough to break the mechanical grid, small enough that the rows still read as rows. Take it to 0 and Haring's field is exactly a square grid with radiance on it; take it past 50% and neighbouring marks trade places and the rows stop reading as rows at all.",
      }),
    ]),
  }),

  minimal: spec({
    id: "minimal",
    label: "Minimal",
    rule: "one mark · much void",
    cap: 3,
    base: 280,
    dens: 100,
    place(W, H, n) {
      const pts: readonly (readonly [number, number, number])[] = [
        [0.382, 0.382, 1.0],
        [0.7, 0.66, 0.42],
        [0.3, 0.74, 0.3],
      ];
      return plain(
        pts.slice(0, Math.max(1, Math.min(3, n))).map<RawNode>((p) => ({
          x: W * p[0],
          y: H * p[1],
          s: p[2],
          rot: 0,
          op: 1,
        })),
      );
    },
    signatures: Object.freeze([
      Object.freeze({
        constant: "primary mark at (0.382, 0.382)",
        value: "0.382 = 1 − 1/φ",
        origin: "painter" as const,
        reason:
          "Derived: 0.382 is 1 − 1/φ, the short arm of the golden section, so the mark sits on the section rather than on a third or in the middle. Move it to 0.5 and the composition centres and the void stops being directional — which is the whole content of a mode whose rule is one mark and much void.",
      }),
      Object.freeze({
        constant: "the two satellites at (0.70,0.66) and (0.30,0.74)",
        value: "0.42 and 0.30 of the primary",
        origin: "painter" as const,
        reason:
          "Free, signed. Two placements with no derivation, hand-set by eye to hang below and to the right of the primary at 0.42 and 0.30 of its size. Move either and nothing measurable changes except the drawing number; what changes is whether the three read as one composition or as three marks. The first appears only when the word's cells reduce to 3 or more and the second only from 5 — below that this mode draws the primary alone.",
      }),
      Object.freeze({
        constant: "base size 280 on a 1000-unit canvas",
        value: "280",
        origin: "painter" as const,
        reason:
          "Load-bearing for the mode: 280 on the painter's 1000-unit canvas is 28% of the frame, a radius of 30.80 in this 220-unit figure, and at that size one mark carries the plate. Bring it down to Phyllotaxis's 46 and three small marks on an empty ground is not Minimal, it is an unfinished Chaos.",
      }),
    ]),
  }),
});

/** Mulberry re-exported through the fields so a caller cannot seed one without the other. */
export { mulberry32 };

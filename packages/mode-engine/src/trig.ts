/**
 * Sine and cosine that cannot disagree with themselves.
 *
 * WHY THIS FILE EXISTS. House rule 1 says the browser and the CLI produce the
 * same bytes. `Math.sin` and `Math.cos` are the one place in this spine where
 * that is not a property of the code: ECMA-262 §21.3.2 permits an
 * implementation-approximated result, and Node 22 and Chromium 141 ship
 * different V8 builds whose approximations differ. `scripts/build-browser-bundle.ts`
 * measures it on 50,000 seeded arguments in both runtimes on every run: 3.31% of
 * `Math.sin` and 3.28% of `Math.cos` results differ, always by exactly one unit
 * in the last place. The same probe measures `Math.sqrt`, `Math.atan2` and
 * `Math.hypot` — the spine's other calls into `Math` — and finds them identical
 * on all 50,000, so "the disagreement is sine and cosine" is a reading off that
 * table and not a guess about V8.
 *
 * One ULP is nothing to a coordinate that gets rounded to four decimals before
 * it is drawn. It is unbounded to `attractor`, which feeds its own output back
 * into its next input up to 12,600 times: the de Jong map has a positive
 * Lyapunov exponent, so a difference of 2⁻⁵² at iteration 3 is a different
 * drawing by iteration 60. Before this file, `s137 ring DESCENT` and the same
 * word typed into the instrument produced two different sheets — 178,956 bytes
 * against 179,373 — and the parity check failed 4 of 44 comparisons on exactly
 * the two words whose concept asks for that mode.
 *
 * WHAT IT DOES NOT COVER, and why that is not a hole. The committed packages
 * still call the built-ins: `envelope-engine` placing nodes on the ring,
 * `walk-engine` drawing the cap bar, `ring/annotate.ts` drawing tick marks. Each
 * of those results is rounded before it reaches a path, and the claim that the
 * rounding absorbs a differing ULP is MEASURED rather than reasoned:
 * `scripts/measure-ulp-exposure.ts` replaces both built-ins with versions that
 * return the next representable double on EVERY call — strictly worse than the
 * 3.3% of arguments Chromium actually disagrees on — and compiles all 170 words
 * on all 7 squares twice. 741,608 perturbed calls; 0 of the 1,190 plates changed
 * a byte. If that number ever goes non-zero, this file moves underneath
 * `walk-engine` and the goldens get rebaselined; until then it stays here,
 * covering the one path where the rounding cannot help.
 *
 * WHY THIS FIXES IT. Everything below uses only `+`, `−`, `×`, `÷`, `%`,
 * comparison, `Math.round` and `Number.isFinite`. Those are not approximated:
 * IEEE-754 requires the arithmetic operations to be correctly rounded, and
 * ECMA-262 specifies the last two exactly. A conforming implementation has no
 * freedom left to spend. This is the same move `seedFromWalk` makes with `Math.imul` —
 * house rule 2 is not satisfied by "should be the same", it is satisfied by
 * using only operations that cannot differ.
 *
 * WHAT IT IS NOT. This is not `Math.sin`. It agrees with it to well under an
 * ULP (measured in `tests/mode-engine.test.ts`, and the measurement is printed
 * rather than merely asserted), but "under an ULP" over a chaotic map is still
 * a different orbit, so `attractor`'s figures moved when this landed. They moved
 * once, to a place they can now be held.
 *
 * THE CONSTRUCTION is the textbook one — Cody-Waite argument reduction onto
 * [−π/4, π/4] followed by the fdlibm kernel polynomials — with fdlibm's own
 * constants, which carry π/2 to about 90 bits across three doubles. Two things
 * about them are worth stating because they look like typos:
 *
 *   · `PIO2_1` is π/2 truncated to 33 significant bits. That is deliberate: its
 *     low 20 bits of mantissa are zero, so `k * PIO2_1` is EXACT for any integer
 *     |k| < 2²⁰ and the reduction loses nothing at the first subtraction.
 *   · `PIO2_2` is not `Math.PI/2 - PIO2_1`. It is (true π/2) − `PIO2_1`, which
 *     differs from that subtraction in the 11th significant digit, because
 *     `Math.PI/2` is itself a rounded value and reducing against a rounded π/2
 *     would inherit its error at every quadrant crossed.
 *
 * ACCURACY holds to under 1 ULP for |x| ≤ 2²⁰ ≈ 1.05e6, which is the range over
 * which `k * PIO2_1` stays exact. Measured against Node's own `Math.sin` on
 * 800,000 seeded arguments spread over four decades of magnitude: 99.1% of
 * results are BIT-IDENTICAL to it and the worst disagreement anywhere is exactly
 * one ULP. That headroom is not theoretical — the largest argument any field
 * hands it, over all 170 vocabulary words × 7 squares × 10 modes, is 1011.91
 * (`divine`, phyllotaxis, saturn, where the angle is `i · GA` for i up to the
 * mode's cap of 420). Three orders of magnitude of margin.
 *
 * Past 2²⁰ the two-step Cody-Waite runs out of bits and the error grows; a full
 * Payne-Hanek reduction would fix that and is not here because nothing asks for
 * it. DETERMINISM does not degrade with magnitude — the operations are exact at
 * every size, so a huge argument gets the same wrong answer in both runtimes —
 * and `MAX_EXACT_ARG` is exported so a caller that leaves the accurate range can
 * say so out loud rather than discovering it in a figure.
 */

/** π/2 in 33 significant bits: `k * PIO2_1` is exact for integer |k| < 2²⁰. */
const PIO2_1 = 1.57079632673412561417;
/** (true π/2) − PIO2_1, itself truncated to 33 bits: `k * PIO2_2` is exact too. */
const PIO2_2 = 6.07710050630396597660e-11;
/** The rest of it. PIO2_1 + PIO2_2 + PIO2_2T carries π/2 to about 90 bits. */
const PIO2_2T = 2.02226624879595063154e-21;
/** 2/π, correctly rounded. Only used to pick the integer k; a rounded 2/π is fine there. */
const INV_PIO2 = 6.36619772367581382433e-1;

/**
 * Above this, `k * PIO2_1` stops being exact and the accuracy claim above stops
 * holding. The results stay bit-identical across runtimes either way.
 */
export const MAX_EXACT_ARG = 1048576; // 2²⁰

/* fdlibm __kernel_sin, |x| ≤ π/4: x + x³·(S1 + x²·(S2 + … + x²·S6)) */
const S1 = -1.66666666666666324348e-01;
const S2 = 8.33333333332248946124e-03;
const S3 = -1.98412698298579493134e-04;
const S4 = 2.75573137070700676789e-06;
const S5 = -2.50507602534068634195e-08;
const S6 = 1.58969099521155010221e-10;

/* fdlibm __kernel_cos, |x| ≤ π/4: 1 − x²/2 + x⁴·(C1 + x²·(C2 + … + x²·C6)) */
const C1 = 4.16666666666666019037e-02;
const C2 = -1.38888888888741095749e-03;
const C3 = 2.48015872894767294178e-05;
const C4 = -2.75573143513906633035e-07;
const C5 = 2.08757232129817482790e-09;
const C6 = -1.13596475577881948265e-11;

/** sin on the reduced interval. `x` is the reduced argument, `y` its tail. */
function kernelSin(x: number, y: number): number {
  const z = x * x;
  const v = z * x;
  const r = S2 + z * (S3 + z * (S4 + z * (S5 + z * S6)));
  // The `y` correction is fdlibm's; it matters only when the reduction left a
  // tail, which for a k of 0 it does not.
  if (y === 0) return x + v * (S1 + z * r);
  return x - (z * (0.5 * y - v * r) - y - v * S1);
}

/** cos on the reduced interval, in fdlibm's form — the split of `1 − z/2` keeps
 *  the cancellation near x = ±π/4 out of the leading digits. */
function kernelCos(x: number, y: number): number {
  const z = x * x;
  const r = z * (C1 + z * (C2 + z * (C3 + z * (C4 + z * (C5 + z * C6)))));
  const hz = 0.5 * z;
  const w = 1.0 - hz;
  return w + (1.0 - w - hz + (z * r - x * y));
}

/**
 * Reduce `x` to `r ∈ [−π/4, π/4]` with a tail, and report `k mod 4` so the
 * caller knows which quadrant it landed in. Returns `[k & 3, r, tail]`.
 *
 * Non-finite input reduces to `[0, NaN, 0]`, which the kernels carry through as
 * NaN — the same answer `Math.sin(Infinity)` gives, arrived at without a branch
 * that could be wrong in one runtime.
 */
function reduce(x: number): readonly [number, number, number] {
  if (!Number.isFinite(x)) return [0, NaN, 0];
  const k = Math.round(x * INV_PIO2);
  // |x| < π/4 already. `Math.round` ties away from zero on the positive side and
  // toward it on the negative, but both tie cases sit outside this branch.
  if (k === 0) return [0, x, 0];
  // Take off the 33-bit head. Exact while |k| < 2²⁰, so `t` holds everything the
  // reduction has not accounted for, with no rounding of its own.
  const t = x - k * PIO2_1;
  // fdlibm runs the second step only when the first one cancelled; running it
  // unconditionally costs three multiplies and removes the branch, and a branch
  // on an exponent difference is exactly the kind of thing that is fine until
  // one of the two runtimes constant-folds it differently.
  let r = t - k * PIO2_2;
  const w = k * PIO2_2T - (t - r - k * PIO2_2);
  const hi = r - w;
  const lo = r - hi - w;
  r = hi;
  return [((k % 4) + 4) % 4, r, lo];
}

/**
 * `Math.sin`, minus the implementation freedom. Identical bits in Node and in
 * every browser; within an ULP of `Math.sin` for |x| ≤ `MAX_EXACT_ARG`.
 */
export function dsin(x: number): number {
  // `Math.sin(-0)` is `-0`; the polynomial below would hand back `+0`, since
  // `-0 + (-0 * S1)` is `+0`. Nothing downstream can see the difference — SVG
  // coordinates go through `toFixed`, which prints both as `0.0000` — but a
  // function documented as agreeing with `Math.sin` should agree with it here too.
  if (x === 0) return x;
  const [q, r, tail] = reduce(x);
  switch (q) {
    case 0:
      return kernelSin(r, tail);
    case 1:
      return kernelCos(r, tail);
    case 2:
      return -kernelSin(r, tail);
    default:
      return -kernelCos(r, tail);
  }
}

/**
 * `Math.cos`, minus the implementation freedom. Same guarantees as {@link dsin}.
 */
export function dcos(x: number): number {
  const [q, r, tail] = reduce(x);
  switch (q) {
    case 0:
      return kernelCos(r, tail);
    case 1:
      return -kernelSin(r, tail);
    case 2:
      return -kernelCos(r, tail);
    default:
      return kernelSin(r, tail);
  }
}

/// <reference lib="dom" />
/**
 * THE INSTRUMENT — build one self-contained page the owner can paint with.
 *
 * He has asked for this twice, in his own words: *"I want to create with the
 * sigil paintbrush"*, *"now I want the calculator to paint"*. What existed was a
 * command line and a static proof sheet over five hardcoded words. Neither has a
 * box he can type into. This script emits `artifacts/instrument/index.html`: one
 * file, no network, no CDN, that takes a typed word and compiles a plate on every
 * keystroke — with the legend, the census, the mode census and the receipt beside
 * it, because a sheet alone is a picture and a picture cannot be checked.
 *
 * ONE TRUNK (house rule 1). The page does not contain a walk, a cipher, an
 * envelope or a renderer. It contains `packages/spine-browser/src/index.ts`, put
 * through esbuild, which is the same module graph `s137` imports. The page's own
 * script is a user interface and nothing else: it reads controls, calls `ring()`,
 * and writes what came back into the DOM. Every list it offers — the seven
 * squares, the five traces, the ten modes — is read off the engine's own exported
 * arrays at run time, so a control cannot outlive or precede the thing it names.
 *
 * WHAT IS PROVEN BEFORE A BYTE IS WRITTEN (each by exit code, in this order):
 *
 *   1. THE BUNDLE IS DETERMINISTIC. Built twice in one process, compared
 *      byte-for-byte. Then `--check` compares the finished page against the file
 *      already on disk, which is the wider version of the same claim.
 *   2. THE BUNDLE IS INLINABLE. Scanned for `<script` and `</script`. A bundle
 *      carrying either would end the page's script element early and the failure
 *      would look like a blank screen rather than an error.
 *   3. NOTHING REFUSES (house rule 3). `ring()` is run over a battery of
 *      pathological inputs — empty, one emoji, 300 characters, CJK, digits,
 *      whitespace only, a literal `</script>` — and each must return a sheet.
 *   4. NO `<text>` REACHES A PLATE (house rule 4). Asserted on the emitted bytes
 *      of every sheet in a cross of words x squares x traces x modes, for
 *      `<text`, `<tspan`, `<textPath` and `<foreignObject`. Asserted again later
 *      in the live DOM by `--verify`, where the browser's own parser is the
 *      witness rather than a substring search.
 *   5. THE FIGURE IS FINDABLE. Every sheet in that cross carries exactly one
 *      `<g id="figure" ...>`. The page's FIGURE view crops to it, and a view that
 *      silently fell back to the whole sheet would be a control that does nothing.
 *   6. THE CUSP CHAIN IS TRUE. The page prints a derivation next to the cusp
 *      count: cells sum to S, S reduces theosophically to r, the multiplier is
 *      max(2, r + 1), and the cusps are m - 1. House rule 6 says a recorded
 *      reason is a prediction and that five false derivations have already
 *      shipped here. So the sentence is not written until the experiment it names
 *      has been run: 3759 walks (170 vocabulary words plus 9 pathological inputs,
 *      crossed with 7 squares and 3 ciphers) are checked against
 *      `multiplierForWalk` and `cuspsForWalk`, and a single mismatch fails the
 *      build. The `max(2, ...)` floor is in that sentence because the experiment
 *      put it there: an input with no letters sums to 0, reduces to 0, and the
 *      engine still returns m = 2. Without the floor 63 of those 3759 disagree.
 *   7. THE THREE-WAY LABELS ARE EXACT. The page says where the square and the
 *      mode came from — you, the concept, or the house. That mirrors a decision
 *      `packages/ring/src/index.ts` makes, so it is checked rather than trusted:
 *      over the cross, an unrequested square must equal the concept's kamea when
 *      a concept rides and the house square when none does, and likewise the mode.
 *
 * WHAT `--verify` PROVES, in a real browser, at 1440x900 and 375x812:
 *   - the console is silent on both, including page errors and failed requests;
 *   - nothing sticks out sideways, measured by walking element rectangles rather
 *     than by reading `scrollWidth` (this page does NOT set `overflow-x: hidden`
 *     on `body`, precisely so both measurements have to agree; the walk is kept
 *     because the clamp is one careless line away from returning);
 *   - typing changes the plate, and each of SQUARE, TRACE, MODE and VIEW changes
 *     it, recorded as a before/after drawing number per control;
 *   - no `<text>`, `<tspan>`, `<textPath>` or `<foreignObject>` in the live plate
 *     — read off `localName`, because `querySelectorAll("textPath")` matches
 *     nothing in an HTML document (type selectors are ASCII-lowercased there and
 *     the SVG local name is not) and would be a check that cannot fail;
 *   - DETERMINISM ACROSS RUNTIMES (house rule 2): for a set of (word, square)
 *     pairs the page is driven through its own controls, its four texts are read
 *     back, and each is compared byte-for-byte against the files `s137 ring` just
 *     wrote for the same request in Node. Not similar. Identical.
 *
 * THE CIPHER KNOB IS NOW WIRED, and this paragraph used to say the opposite.
 * `RingOptions` had no `cipher` field — `packages/ring/src/index.ts` called
 * `walk(word, { square, trace, cipher: "PYTH" })` — so no control here could move
 * the plate off PYTH, and rather than pretend, the knob drove a bench that walked
 * the same word under all three ciphers and showed what each did to the line.
 * `cipherDrivesThePlate()` below asks the engine rather than believing this
 * comment, and it now answers true: the option exists, the CLI has `--cipher` to
 * match, and `scripts/build-browser-bundle.ts` compares two non-PYTH cases
 * byte-for-byte against that CLI. So the knob moves the plate with the others and
 * the bench keeps its place as the thing that shows all three at once.
 *
 * ONE SURPRISE THE PAGE HAS TO EXPLAIN, because it looks exactly like the dead
 * knob it replaced: on SATURN, choosing HEB changes nothing, and that is a
 * theorem rather than a bug. Cells are `reduceToCell(value, order²)`, which on a
 * 3x3 is the digit root, and the digit root of Hebrew place value IS the
 * Pythagorean value for all 26 letters — 10 reduces to 1, 100 reduces to 1, and
 * `(i mod 9) + 1` is what both come to. The two ciphers separate on every larger
 * square, from one letter on Jupiter to eight on Luna. The page says so under the
 * knob; `tests/ring.test.ts` proves it rather than asserting it.
 *
 * Usage:
 *   pnpm exec tsx scripts/build-instrument.ts                # build + assert
 *   pnpm exec tsx scripts/build-instrument.ts --verify       # + drive a browser
 *   pnpm exec tsx scripts/build-instrument.ts --check        # byte-identical?
 *   pnpm exec tsx scripts/build-instrument.ts --out DIR
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium, type Browser } from "playwright";

import { cuspsForWalk, multiplierForWalk } from "@studio137/envelope-engine";
import {
  CONCEPT_CORRESPONDENCE,
  CORRESPONDENCE_COVERAGE,
  CORRESPONDENCE_VERSION,
  GEOMETRY_V2_VERSION,
  WORD_CORRESPONDENCE,
  correspondenceForWord,
} from "@studio137/glyph-registry";
import { MODE_IDS, type ModeId } from "@studio137/mode-engine";
import { sha256Hex } from "@studio137/plate-core";
import { ring } from "@studio137/ring";
import {
  CIPHER_IDS,
  SQUARE_IDS,
  TRACE_IDS,
  walk,
  type SquareId,
  type TraceId,
} from "@studio137/walk-engine";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const ENTRY = join(REPO, "packages", "spine-browser", "src", "index.ts");
const CLI = join(REPO, "apps", "cli", "src", "index.ts");
const TSX = join(REPO, "node_modules", ".bin", "tsx");
const GLOBAL = "S137";

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(`--${name}`);
const option = (name: string, fallback: string): string => {
  const at = argv.indexOf(`--${name}`);
  const value = at === -1 ? undefined : argv[at + 1];
  return value === undefined || value.startsWith("--") ? fallback : value;
};

const OUT_DIR = resolve(REPO, option("out", join("artifacts", "instrument")));
const PAGE_FILE = join(OUT_DIR, "index.html");
const DO_VERIFY = flag("verify");
const CHECK_ONLY = flag("check");

/**
 * The composition modes whose FIELD does not reproduce across runtimes. Empty,
 * and it was not always: this is the log of how it emptied.
 *
 * House rule 2 says determinism is the product, and the honest version of that
 * claim had an exception in it. `attractor` iterates the de Jong map — a chaotic
 * system — up to 12,600 times from stream-drawn parameters. `Math.sin` and
 * `Math.cos` are implementation-approximated in ECMA-262 §21.3.2, and Node 22's
 * V8 and Chromium 141's V8 do differ, on a few percent of arguments, always by
 * exactly one unit in the last place. In a chaotic map that is fatal: the orbits
 * part around iteration 10 and are unrelated well before the last one. Measured
 * over 20 words crossed with all ten modes and the no-mode control, `attractor`
 * differed on 20 of 20 while the other nine modes and the control were
 * byte-identical on all 20.
 *
 * THE FIX WAS THE ORBIT, NOT THE SENTENCE. `packages/mode-engine/src/trig.ts`
 * implements sine and cosine out of `+ - * /` alone — Cody-Waite reduction and
 * the fdlibm kernel polynomials — which IEEE-754 requires to be correctly
 * rounded, so a conforming implementation has no freedom left to spend. Every
 * field in the package goes through it. `scripts/build-browser-bundle.ts` runs
 * the pair on 50,000 arguments in both runtimes on every build and reports zero
 * disagreements against a few percent for the built-ins, and its parity check
 * went from 4 of 44 comparisons failing — both of them DESCENT, whose concept
 * asks for attractor — to 52 of 52 passing.
 *
 * The list stays because the check that reads it stays: `--verify` re-runs the
 * cross and fails if the measured set is not exactly this one. An empty list that
 * is re-measured every build is worth more than a fixed defect nobody watches —
 * it is what catches the eleventh mode, or a regression in `trig.ts`, on the
 * build that introduces it rather than in a plate somebody prints months later.
 */
const CROSS_RUNTIME_DIVERGENT_MODES: readonly string[] = Object.freeze([]);

/**
 * The words the cross-runtime measurement above is run over.
 *
 * Deliberately mixed: table words that reach a concept, words that reach none,
 * an empty string, an emoji, a repeated letter, and a long run. A divergence that
 * only showed up on awkward input would be missed by a list of pretty words.
 */
const CROSS_WORDS: readonly string[] = Object.freeze([
  "LUNAR", "WAR", "DESCENT", "SERPENT", "LOVE", "CHAOS", "TIME", "AIR", "SPIRIT", "COSMOS",
  "QUANTUM", "MISSISSIPPI", "A", "ZZZZ", "", "🙂", "x".repeat(60), "THRESHOLD", "SHADOW", "UNION",
]);

/**
 * Whether the CIPHER knob can move the plate.
 *
 * Read off the engine rather than declared: it is true exactly when `ring()`
 * accepts a `cipher` option, which is decided by calling it with one and asking
 * whether the resulting sheet differs from the sheet without it. `RingOptions` is
 * a `Readonly<{...}>` with no index signature, so the probe casts once, here,
 * with the cast named — a page that guessed wrong would either ship a dead knob
 * or hide a live one.
 *
 * PREDICTION IF THIS FLIPS: the page moves the cipher control out of the bench
 * and in beside SQUARE and TRACE, the amber note under it disappears, and the
 * `--verify` control sweep gains a fifth row whose before/after drawing numbers
 * differ. Nothing else in this file changes.
 */
function cipherDrivesThePlate(): boolean {
  const base = ring("DESCENT", { square: "saturn" });
  const forced = ring("DESCENT", {
    square: "saturn",
    ...({ cipher: "NAEQ" } as unknown as Record<string, never>),
  });
  return base.sheetId !== forced.sheetId;
}

/* ── the battery every assertion is run over ──────────────────────────────── */

/**
 * Inputs chosen to break things, not to pass.
 *
 * House rule 3 says no input is ever refused, which is a claim about the awkward
 * ones. `</script>` is in the list because this page inlines a bundle and echoes
 * the typed word; if either path ever used `innerHTML` for user text, this string
 * is what would end the document early.
 */
const PATHOLOGICAL: readonly string[] = Object.freeze([
  "",
  " ",
  "\t\n",
  "🙂",
  "日本語",
  "12345",
  "x".repeat(300),
  "</script><img src=x onerror=alert(1)>",
  "  DESCENT  ",
]);

/**
 * The example words the page offers as chips: one per composition mode the
 * concept table actually requests, so a click on each demonstrates a different
 * construction rather than a different spelling of the same one.
 *
 * The concept's own name is used because it is the shortest word that reaches
 * that concept — and that it reaches it is CHECKED here rather than assumed. A
 * chip that missed its concept would ride the house square, paint no field, and
 * quietly demonstrate the opposite of what it was put there for.
 */
function chipWords(): readonly string[] {
  const byMode = new Map<string, string>();
  const concepts = [...CONCEPT_CORRESPONDENCE].sort((a, b) => (a.concept < b.concept ? -1 : 1));
  for (const concept of concepts) {
    const mode = concept.composition.mode;
    if (byMode.has(mode)) continue;
    const reached = correspondenceForWord(concept.concept);
    if (reached === undefined || reached.concept !== concept.concept) {
      throw new Error(`the concept name ${JSON.stringify(concept.concept)} does not reach its own concept`);
    }
    if (reached.composition.mode !== mode) {
      throw new Error(`chip ${JSON.stringify(concept.concept)} would paint ${reached.composition.mode}, not ${mode}`);
    }
    byMode.set(mode, concept.concept.toUpperCase());
  }
  // `QUANTUM` reaches nothing, and that is why it is here: the honest empty state
  // is one click away rather than something the owner has to stumble into.
  if (correspondenceForWord("QUANTUM") !== undefined) {
    throw new Error("QUANTUM now reaches a concept; pick another word for the empty-state chip.");
  }
  return Object.freeze([...[...byMode.values()].sort(), "QUANTUM"]);
}

/** Theosophic reduction — digits summed until one digit remains. */
function theosophic(n: number): number {
  let x = Math.abs(n);
  while (x > 9) {
    let s = 0;
    for (const c of String(x)) s += Number(c);
    x = s;
  }
  return x;
}

type Assertion = Readonly<{ name: string; checked: number; detail: string }>;

/**
 * Run every pre-flight experiment. Throws on the first failure, with the case.
 *
 * These are experiments, not restatements: each one is a sentence the page will
 * print, run against the engine over a cross wide enough that a coincidence is
 * unlikely to survive it.
 */
function assertions(): readonly Assertion[] {
  const done: Assertion[] = [];
  const vocab = WORD_CORRESPONDENCE.map((w) => w.word);
  const words = [...vocab, ...PATHOLOGICAL];

  /* 3. NOTHING REFUSES. */
  for (const word of PATHOLOGICAL) {
    const out = ring(word, { vocabulary: vocab });
    if (out.sheetSvg.length === 0) throw new Error(`ring(${JSON.stringify(word)}) produced no sheet`);
  }
  done.push({
    name: "nothing refuses",
    checked: PATHOLOGICAL.length,
    detail: "every pathological input returned a sheet",
  });

  /* 6. THE CUSP CHAIN. */
  let chainChecked = 0;
  for (const word of words) {
    for (const square of SQUARE_IDS) {
      for (const cipher of CIPHER_IDS) {
        const figure = walk(word, { square, cipher, trace: "AGRIPPA" });
        const sum = figure.resolution.cells.reduce((a, b) => a + b, 0);
        const m = multiplierForWalk(figure);
        const cusps = cuspsForWalk(figure);
        if (Math.max(2, theosophic(sum) + 1) !== m || cusps !== m - 1) {
          throw new Error(
            `cusp chain broken: ${JSON.stringify(word)} ${square} ${cipher} — ` +
              `sum ${sum}, reduced ${theosophic(sum)}, engine m ${m}, engine cusps ${cusps}`,
          );
        }
        chainChecked += 1;
      }
    }
  }
  done.push({
    name: "cusp chain",
    checked: chainChecked,
    detail: "m = max(2, theosophic(cell sum) + 1) and cusps = m - 1, against the engine",
  });

  /* 4, 5, 7. The sheet cross. */
  const crossWords = ["LUNAR", "WAR", "DESCENT", "QUANTUM", "", "🙂", "x".repeat(300)];
  const modes: readonly (ModeId | "none" | undefined)[] = [undefined, "none", ...MODE_IDS];
  const forbidden = ["<text", "<tspan", "<textPath", "<foreignObject"] as const;
  const figureTag = /<g id="figure" transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(([-\d.]+)\)">/gu;
  let sheets = 0;
  let labels = 0;

  for (const word of crossWords) {
    for (const square of [undefined, ...SQUARE_IDS] as readonly (SquareId | undefined)[]) {
      for (const trace of TRACE_IDS as readonly TraceId[]) {
        for (const mode of modes) {
          // The full cross is 7 x 8 x 5 x 12 = 3360 sheets and several minutes of
          // mode fields. Trace and mode are varied against the default square and
          // the square against the default trace: every value of every control is
          // exercised, and the pairs that are not are pairs neither control reads.
          if (square !== undefined && (trace !== "AGRIPPA" || mode !== undefined)) continue;
          const out = ring(word, {
            vocabulary: vocab,
            trace,
            ...(square === undefined ? {} : { square }),
            ...(mode === undefined ? {} : { mode }),
          });
          sheets += 1;

          for (const needle of forbidden) {
            if (out.sheetSvg.includes(needle)) {
              throw new Error(`house rule 4: ${needle} in the sheet for ${JSON.stringify(word)} ${String(square)} ${trace} ${String(mode)}`);
            }
          }

          figureTag.lastIndex = 0;
          const hits = out.sheetSvg.match(/<g id="figure" transform="/gu) ?? [];
          if (hits.length !== 1) {
            throw new Error(`expected exactly one <g id="figure"> in ${JSON.stringify(word)}; found ${hits.length}`);
          }
          figureTag.lastIndex = 0;
          if (figureTag.exec(out.sheetSvg) === null) {
            throw new Error(`the figure group's transform did not parse for ${JSON.stringify(word)}`);
          }

          // 7. The three-way labels, checked against what the engine actually did.
          if (square === undefined) {
            const expected = out.correspondence?.kamea ?? "jupiter";
            if (out.walk.square !== expected) {
              throw new Error(`square label wrong: ${JSON.stringify(word)} walked ${out.walk.square}, label would say ${expected}`);
            }
            labels += 1;
          }
          if (mode === undefined) {
            const conceptMode = out.correspondence?.composition.mode;
            const expected =
              conceptMode !== undefined && (MODE_IDS as readonly string[]).includes(conceptMode)
                ? conceptMode
                : undefined;
            if ((out.mode?.mode ?? undefined) !== expected) {
              throw new Error(`mode label wrong: ${JSON.stringify(word)} painted ${String(out.mode?.mode)}, label would say ${String(expected)}`);
            }
            labels += 1;
          }
        }
      }
    }
  }

  done.push({
    name: "no <text> on a plate",
    checked: sheets,
    detail: `${forbidden.join(", ")} absent from every emitted sheet`,
  });
  done.push({
    name: "the figure is findable",
    checked: sheets,
    detail: "exactly one <g id=\"figure\"> per sheet, transform parses",
  });
  done.push({
    name: "square and mode labels",
    checked: labels,
    detail: "an unrequested square is the concept's kamea or the house square; likewise the mode",
  });

  return done;
}

/* ── esbuild, found the way the sibling build finds it ────────────────────── */

type OutputFile = Readonly<{ path: string; text: string }>;
type BuildResult = Readonly<{
  errors: readonly Readonly<{ text: string }>[];
  outputFiles?: readonly OutputFile[];
}>;
/**
 * esbuild, typed structurally.
 *
 * `import type { BuildOptions } from "esbuild"` does not resolve: esbuild is not
 * a root dependency, it is reached through `tsx`, and `tsc` would fail on the
 * specifier. The three members below are the whole surface this file touches.
 */
type Esbuild = Readonly<{ version: string; build(options: Record<string, unknown>): Promise<BuildResult> }>;

/**
 * Which esbuild.
 *
 * Two are in the store and the lockfile pins both — `tsx` carries 0.28.2 and
 * `vite`, under vitest, carries 0.21.5. Neither is a direct dependency, so a bare
 * `require("esbuild")` resolves by whatever hoisting the launcher happened to
 * arrange and would pick a different compiler under `pnpm exec` than under
 * `node_modules/.bin/tsx`. Two compilers is two sets of bundle bytes and the
 * determinism claim would be about the launcher instead of the source. The route
 * through `tsx` is asked for first because `tsx` is what runs this script.
 */
function loadEsbuild(): Readonly<{ module: Esbuild; path: string; via: string }> {
  const root = createRequire(join(REPO, "package.json"));
  const routes: readonly (readonly [string, () => string])[] = [
    ["tsx -> esbuild", (): string => createRequire(root.resolve("tsx")).resolve("esbuild")],
    ["esbuild (bare)", (): string => root.resolve("esbuild")],
  ];
  const attempts: string[] = [];
  for (const [via, locate] of routes) {
    try {
      const path = locate();
      return { module: root(path) as Esbuild, path, via };
    } catch (error) {
      attempts.push(`  ${via}: ${error instanceof Error ? (error.message.split("\n")[0] ?? "") : String(error)}`);
    }
  }
  throw new Error(`Could not load esbuild by any route:\n${attempts.join("\n")}`);
}

async function bundleOnce(esbuild: Esbuild): Promise<string> {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "iife",
    globalName: GLOBAL,
    // The bundle has to work pasted into a classic `<script>`, where `var S137`
    // is already global, and under a module script, where it would not be. The
    // footer assigns it either way, which is what the sibling bundle does too.
    footer: { js: `globalThis.${GLOBAL}=${GLOBAL};` },
    target: ["es2020"],
    platform: "browser",
    minify: true,
    legalComments: "none",
    charset: "utf8",
    write: false,
    sourcemap: false,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  if (result.errors.length > 0) {
    throw new Error(`esbuild: ${result.errors.map((e) => e.text).join("; ")}`);
  }
  const files = result.outputFiles ?? [];
  if (files.length !== 1) {
    throw new Error(`esbuild produced ${files.length} files; a page that inlines one bundle needs exactly one.`);
  }
  return files[0]!.text;
}

/** Built twice, compared. A bundle that is not reproducible is not evidence. */
async function bundle(esbuild: Esbuild): Promise<Readonly<{ text: string; sha256: string }>> {
  const first = await bundleOnce(esbuild);
  const second = await bundleOnce(esbuild);
  if (first !== second) {
    throw new Error("esbuild produced different bytes for the same input on two consecutive builds.");
  }
  assertInlinable(first, "bundle");
  return { text: first, sha256: sha256Hex(first) };
}

/**
 * Refuse anything that would end the page's script element early.
 *
 * `</script` is the fatal one and the failure mode is silent: the browser closes
 * the element, treats the rest of the bundle as markup, and shows a page that is
 * merely blank. `<script` is refused too, because it is one careless serializer
 * away from the other.
 */
function assertInlinable(text: string, what: string): void {
  for (const needle of ["</script", "<script"]) {
    const at = text.indexOf(needle);
    if (at !== -1) {
      throw new Error(`${what} contains ${needle} at offset ${at}: ${JSON.stringify(text.slice(at - 40, at + 40))}`);
    }
  }
}

/* ── the page ─────────────────────────────────────────────────────────────── */

const CSS = String.raw`
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
:root{
  --ground:#07090c; --panel:#0a0d11; --panel2:#0d1116; --sunk:#05070a;
  --line:#1b2129; --line2:#2a333d;
  --bone:#c9d2da; --dim:#7f8b98; --dimmer:#5c6773;
  --geo:#5ef2c4; --walk:#56c9ff; --partial:#f4b942; --control:#d2603a; --vio:#8a7ff0;
  --mono:"JetBrains Mono","JetBrainsMono Nerd Font",ui-monospace,SFMono-Regular,Menlo,Consolas,"DejaVu Sans Mono",monospace;
}
body{margin:0;background:var(--ground);color:var(--bone);font:13px/1.55 var(--mono);
  -webkit-font-smoothing:antialiased}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:.2em}
p{margin:0}
dl,dd{margin:0}
.wrap{max-width:1340px;margin:0 auto;padding:14px 14px 72px}
.dim{color:var(--dim)}
.hi{color:var(--bone)}
.num{font-variant-numeric:tabular-nums}

/* ── masthead ─────────────────────────────────────────────────────────── */
header.mast{border-bottom:1px solid var(--line);padding-bottom:10px}
.mast-row{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 16px}
h1{font-size:14px;color:var(--bone)}
h1 .tick{color:var(--geo)}
.mast-tag{font-size:10.5px;letter-spacing:.16em;color:var(--dimmer)}
.lede{margin-top:8px;color:var(--dim);font-size:11.5px;max-width:104ch}
@media(max-width:759px){.lede{font-size:11px;line-height:1.5}}
.lede b{color:var(--bone);font-weight:600}

/* ── bench ────────────────────────────────────────────────────────────── */
/* Not sticky. It was, and a scrolled screenshot showed the bar sitting over the
   plate's own annotation layer and over the CIPHER BENCH heading — a control
   panel that hides the artifact it controls. The cost of losing it is scrolling
   up to retype; the cost of keeping it was 100px of every screen, permanently. */
.bench{padding:11px 0 10px;border-bottom:1px solid var(--line);background:var(--ground)}
.wordrow{display:flex;gap:8px;align-items:stretch}
#word{flex:1 1 auto;min-width:0;background:var(--sunk);border:1px solid var(--line2);
  color:var(--bone);font:600 19px/1.25 var(--mono);letter-spacing:.16em;padding:10px 12px}
#word::placeholder{color:#3d4650;letter-spacing:.16em}
#word:focus{outline:none;border-color:var(--geo)}
.knobs{display:grid;gap:8px;margin-top:9px;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
.knob{display:grid;gap:3px;min-width:0;align-content:start}
.knob-k{font-size:9.5px;letter-spacing:.18em;color:var(--dim)}
select,button,textarea{font:12px/1.4 var(--mono);background:var(--panel);color:var(--bone);
  border:1px solid var(--line2);padding:7px 8px;min-width:0;width:100%}
select{appearance:none;-webkit-appearance:none;
  background-image:linear-gradient(45deg,transparent 50%,#5c6773 50%),linear-gradient(135deg,#5c6773 50%,transparent 50%);
  background-position:calc(100% - 14px) 12px,calc(100% - 9px) 12px;
  background-size:5px 5px,5px 5px;background-repeat:no-repeat;padding-right:26px}
button{cursor:pointer;letter-spacing:.12em;text-align:center}
button:hover{border-color:#44505d;color:#fff}
select:focus-visible,button:focus-visible,pre:focus-visible,textarea:focus-visible{
  outline:1px solid var(--geo);outline-offset:1px}
.btnpair{display:flex;gap:6px}
#rand{flex:0 0 auto;width:auto;padding:0 14px;letter-spacing:.16em;color:var(--dim)}
.chips{display:flex;gap:5px;margin-top:9px;flex-wrap:nowrap;overflow-x:auto;
  padding-bottom:3px;scrollbar-width:thin;scrollbar-color:#333d48 transparent}
.chips::-webkit-scrollbar{height:5px}
.chips::-webkit-scrollbar-thumb{background:#333d48}
.chip{flex:0 0 auto}
@media(min-width:760px){.chips{flex-wrap:wrap;overflow-x:visible}}
.chip{width:auto;padding:4px 8px;font-size:10.5px;letter-spacing:.14em;color:var(--dim);
  background:transparent;border-color:var(--line)}
.chip:hover{color:var(--geo);border-color:var(--geo)}
.knobnote{margin-top:9px;font-size:11px;color:var(--partial);
  border-left:2px solid var(--partial);padding-left:9px;max-width:118ch}
.knobnote b{color:#ffd77a}

/* ── console ──────────────────────────────────────────────────────────────
   One grid, two shapes. On a phone the plate comes straight after the word the
   owner just typed and the knobs sit under it, because a control panel he has to
   scroll past to reach his own drawing is a control panel in the wrong order. At
   1060px there is room for the readouts beside the plate, so the knobs go back on
   top where the eye already is. Both shapes are grid AREAS on one container
   rather than "order" on siblings, so the DOM order is the phone order and the
   reading order of a screen reader is never the desktop one by accident. */
.console{display:grid;gap:14px;margin-top:14px;
  grid-template-columns:minmax(0,1fr);
  grid-template-areas:"plate" "knobswrap" "reads"}
@media(min-width:1060px){
  .console{grid-template-columns:minmax(0,1fr) minmax(0,400px);gap:20px 22px;align-items:start;
    grid-template-areas:"knobswrap knobswrap" "plate reads"}
}
.platecol{grid-area:plate}
.knobswrap{grid-area:knobswrap}
.reads{grid-area:reads}
.platecol,.reads{min-width:0;display:grid;gap:10px;align-content:start}
/* The frame is on the SVG, not on a box around it: a plate clamped by height
   inside a bordered container sits in a large empty rectangle, and the border
   stops describing the artifact. Here it hugs the paper. */
.plate{line-height:0;display:flex;justify-content:center;align-items:flex-start}
/* THE SIZING RULE, and the two ways it has already been got wrong.
   "width:auto;height:auto" with the two caps is the only combination where the
   element box IS the paper: the CSS min/max algorithm shrinks a replaced element
   along both axes together, so nothing is letterboxed and the frame drawn round
   it describes the plate rather than the column. Setting a 100% width instead
   made the box 890x828 with the A4 content letterboxed inside it - the frame then
   described the column, and the crop maths below, which maps screen pixels back
   through the viewBox, was reading a scale 1.52x off and cropping the wrong
   window. The frame is an OUTLINE, not a border, for the same reason: an outline
   is painted outside the box without joining it, so getBoundingClientRect() on
   this element returns the SVG viewport exactly and the mapping needs no
   correction term that could go stale. */
.plate svg{display:block;width:auto;height:auto;max-width:100%;max-height:min(92vh,1100px);
  outline:1px solid var(--line);background:var(--ground)}
.status{font-size:11px;color:var(--dim);display:flex;flex-wrap:wrap;gap:3px 14px}
.status b{color:var(--bone);font-weight:400}
.warn{border:1px solid #4a3a1c;border-left:2px solid var(--partial);background:#100d07;
  padding:9px 11px;font-size:11px;color:#cdbb96;max-width:118ch}
.warn b{color:var(--partial);letter-spacing:.1em}
.oops{border:1px solid var(--control);background:#140a06;color:#f0b39a;padding:16px;font-size:12px}
.oops b{color:var(--control);display:block;letter-spacing:.16em;margin-bottom:6px}

/* ── cusp claim ───────────────────────────────────────────────────────── */
.cusp{border:1px solid var(--geo);background:linear-gradient(180deg,#0b1512,var(--panel));padding:13px}
.cusp-top{display:flex;align-items:center;gap:14px}
.cusp-n{font-size:52px;line-height:.85;font-weight:600;color:var(--geo);font-variant-numeric:tabular-nums}
.cusp-lab{font-size:10px;letter-spacing:.2em;color:var(--geo)}
.cusp-say{margin-top:3px;font-size:11.5px;color:var(--bone)}
.ticks{display:flex;gap:4px;margin-top:9px;flex-wrap:wrap;align-items:flex-end;min-height:15px}
.tick{width:6px;height:15px;background:var(--geo);opacity:.85}
.chain{margin-top:9px;font-size:11px;color:var(--dim);border-top:1px solid #14312a;padding-top:8px}
.chain b{color:var(--geo);font-weight:400}
.chain-alt{margin-top:5px;color:var(--walk)}

/* ── facts ────────────────────────────────────────────────────────────── */
.facts{display:grid;gap:1px;background:var(--line);border:1px solid var(--line);
  grid-template-columns:repeat(auto-fit,minmax(min(100%,124px),1fr))}
.fact{background:var(--panel);padding:6px 8px;min-width:0}
.fact dt{font-size:9.5px;letter-spacing:.14em;color:var(--dim)}
.fact dd{margin-top:2px;font-size:12.5px;overflow-wrap:anywhere}
.fact.wide{grid-column:1/-1}
.fact-note{font-size:10px;color:var(--dimmer);margin-top:1px;overflow-wrap:anywhere}
.v-geo{color:var(--geo)}.v-walk{color:var(--walk)}.v-part{color:var(--partial)}
.v-vio{color:var(--vio)}.v-ctl{color:var(--control)}.v-dim{color:var(--dim)}

/* ── cards ────────────────────────────────────────────────────────────── */
.card{border:1px solid var(--line);background:var(--panel);padding:12px}
.card h3{font-size:10px;letter-spacing:.2em;color:var(--dim);margin-bottom:9px}
.card h3 .acc{color:var(--vio)}
.rows{display:grid;gap:6px}
.row{display:grid;grid-template-columns:82px minmax(0,1fr);gap:9px;font-size:11.5px}
.row-k{color:var(--dim);font-size:10px;letter-spacing:.11em;padding-top:2px}
.row-v{overflow-wrap:anywhere}
.pill{display:inline-block;border:1px solid var(--line2);padding:1px 6px;margin:0 4px 4px 0;
  font-size:10.5px;color:var(--bone)}
.pill.vio{border-color:#3b3468;color:#b3aaf5}
.pill.geo{border-color:#1e4a3e;color:var(--geo)}
.pill.dim{border-color:#242b33;color:var(--dimmer)}
.empty{border-color:var(--control)}
.empty h3 .acc{color:var(--control)}
.empty-say{font-size:11.5px;color:#e0b9a6}
.empty-say b{color:var(--control);font-weight:600}

/* ── sections ─────────────────────────────────────────────────────────── */
.sec{margin-top:30px}
.sec h2{font-size:11px;letter-spacing:.24em;color:var(--bone);
  border-left:2px solid var(--walk);padding-left:9px}
.sec.texts h2{border-left-color:var(--geo)}
.secnote{margin:8px 0 11px 11px;font-size:11.5px;color:var(--dim);max-width:112ch}
.secnote b{color:var(--bone);font-weight:400}

/* ── cipher bench ─────────────────────────────────────────────────────── */
/* Capped, because these are previews of station 2 and not plates. Left to fill a
   1312px row they drew three 411px squares and outweighed the artifact above
   them. */
.ciphers{display:grid;gap:9px;max-width:900px;
  grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr))}
.cip{border:1px solid var(--line);background:var(--panel);padding:9px;display:grid;gap:7px;
  align-content:start;text-align:left;width:100%;cursor:pointer}
.cip:hover{border-color:#3c4855}
.cip.on{border-color:var(--walk);background:#0a1119}
.cip-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.cip-id{font-size:12px;letter-spacing:.2em;color:var(--dim)}
.cip.on .cip-id{color:var(--walk)}
.cip-tag{font-size:9.5px;letter-spacing:.12em;color:var(--dimmer)}
.cip.on .cip-tag{color:var(--walk)}
.cip svg{display:block;width:100%;height:auto;background:var(--sunk);border:1px solid var(--line)}
.cip-n{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:var(--line)}
.cip-n div{background:var(--panel2);padding:4px 6px;min-width:0}
.cip-n dt{font-size:9px;letter-spacing:.12em;color:var(--dim)}
.cip-n dd{margin-top:1px;font-size:13px;font-variant-numeric:tabular-nums}
.cip-cells{font-size:10.5px;color:var(--dim);overflow-wrap:anywhere}

/* ── the texts ────────────────────────────────────────────────────────── */
.tabs{display:flex;flex-wrap:wrap;gap:4px}
.tab{width:auto;padding:6px 11px;font-size:10px;letter-spacing:.16em;color:var(--dim);
  background:var(--panel);border-color:var(--line)}
.tab[aria-selected="true"]{color:var(--ground);background:var(--geo);border-color:var(--geo);font-weight:600}
pre.text{margin:8px 0 0;padding:13px;background:var(--panel2);border:1px solid var(--line);
  white-space:pre-wrap;overflow-wrap:break-word;font-size:11.5px;line-height:1.62;
  color:#aab5bf;max-height:min(70vh,760px);overflow:auto;font-family:var(--mono)}
.srcbox{margin-top:9px;height:150px;resize:vertical;background:var(--sunk);color:var(--dim);
  font-size:10.5px;white-space:pre;overflow:auto}
details.src summary{cursor:pointer;font-size:10.5px;letter-spacing:.14em;color:var(--dim);
  border:1px solid var(--line);background:var(--panel);padding:7px 10px;list-style:none}
details.src summary::-webkit-details-marker{display:none}
details.src summary:hover{color:var(--bone)}

footer{margin-top:34px;border-top:1px solid var(--line);padding-top:12px;
  font-size:10.5px;color:var(--dimmer);display:grid;gap:4px}
footer code{color:var(--dim);overflow-wrap:anywhere}
`;

/**
 * The page's own script. A user interface, and nothing else.
 *
 * Written in ES5-shaped JavaScript with no template literals, for one blunt
 * reason: it lives inside a TypeScript template literal, and a backtick or a
 * `${` here would either break this file or interpolate silently. String
 * concatenation costs nothing and removes the whole class of accident.
 *
 * Everything it knows about the system it asks the engine for. There is no list
 * of squares, traces or modes in this string — `S137.SQUARE_IDS`,
 * `S137.TRACE_IDS`, `S137.MODE_IDS` and `S137.modes.MODE_SPECS` fill the pickers
 * at run time. A control that named its own options would be a second answer to
 * what the system can do, and would go stale the day the engine gained an
 * eleventh mode.
 */
const PAGE_JS = String.raw`
(function () {
  "use strict";

  var S = window.S137;
  var SPECS = S.modes.MODE_SPECS;
  var VOCAB = S.HOUSE_VOCABULARY;
  var CHIPS = window.__S137_CHIPS;
  var CIPHER_LIVE = window.__S137_CIPHER_LIVE;
  var DIVERGENT = window.__S137_DIVERGENT_MODES;

  function $(id) { return document.getElementById(id); }
  function txt(s) { return document.createTextNode(s); }
  function tag(name, cls, text) {
    var n = document.createElement(name);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.appendChild(txt(String(text)));
    return n;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function num(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " "); }

  var state = {
    word: "LUNAR", square: "", trace: "AGRIPPA", mode: "", cipher: "PYTH",
    view: "sheet", tab: "legend"
  };
  var art = null, oops = null, renders = 0, ms = 0;

  /* ── controls ──────────────────────────────────────────────────────── */

  function fill(sel, entries) {
    clear(sel);
    for (var i = 0; i < entries.length; i++) {
      var o = document.createElement("option");
      o.value = entries[i][0];
      o.appendChild(txt(entries[i][1]));
      sel.appendChild(o);
    }
  }

  function buildControls() {
    var squares = [["", "— the concept chooses"]];
    for (var i = 0; i < S.SQUARE_IDS.length; i++) {
      var id = S.SQUARE_IDS[i];
      squares.push([id, id + "  " + S.kamea(id).n + "×" + S.kamea(id).n]);
    }
    fill($("square"), squares);

    var traces = [];
    for (var t = 0; t < S.TRACE_IDS.length; t++) traces.push([S.TRACE_IDS[t], S.TRACE_IDS[t]]);
    fill($("trace"), traces);
    $("trace").value = state.trace;

    var modes = [["", "— the concept chooses"], ["none", "none  ·  envelope only"]];
    for (var m = 0; m < S.MODE_IDS.length; m++) {
      var mid = S.MODE_IDS[m];
      var spec = SPECS[mid];
      modes.push([mid, mid + (spec ? "  ·  " + spec.rule : "")]);
    }
    fill($("mode"), modes);

    var ciphers = [];
    for (var c = 0; c < S.CIPHER_IDS.length; c++) ciphers.push([S.CIPHER_IDS[c], S.CIPHER_IDS[c]]);
    fill($("cipher"), ciphers);
    $("cipher").value = state.cipher;

    fill($("view"), [["sheet", "sheet  ·  the whole A4 plate"], ["figure", "figure  ·  zoom to the drawing"]]);

    var chips = $("chips");
    for (var k = 0; k < CHIPS.length; k++) {
      var b = tag("button", "chip", CHIPS[k]);
      b.type = "button";
      b.setAttribute("data-word", CHIPS[k]);
      chips.appendChild(b);
    }
    chips.addEventListener("click", function (ev) {
      var w = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-word") : null;
      if (w === null) return;
      state.word = w;
      $("word").value = w;
      run();
    });

    $("cipnote").textContent = CIPHER_LIVE
      ? "The cipher knob moves the plate. One exception, and it is arithmetic rather than a fault: on "
        + "SATURN, HEB and PYTH are the same cipher. A cell is the value reduced to fit the square, "
        + "which on a 3x3 is the digit root, and the digit root of Hebrew place value is the "
        + "Pythagorean value for all 26 letters — J is 10 and reduces to 1, S is 100 and reduces to 1. "
        + "They separate on every larger square: one letter on Jupiter, eight on Luna. So a saturn "
        + "word drawn under HEB is the same plate on purpose, and the bench below shows all three at "
        + "once so you can see which pairs coincide for the word you typed."
      : "ring() calls walk() with cipher PYTH fixed, so no control on this page can move the plate off it. "
        + "What the knob moves is this bench, which walks the same word under all three ciphers with the engine's "
        + "own walk() and draws the line each one produces. The numbers under each are what the plate would say "
        + "if RingOptions carried a cipher: that is a prediction, and these are the figures it predicts.";
    $("knobnote").hidden = CIPHER_LIVE;
  }

  /* ── compile ───────────────────────────────────────────────────────── */

  function now() {
    return (window.performance && performance.now) ? performance.now() : Date.now();
  }

  function options() {
    var o = { vocabulary: VOCAB, trace: state.trace };
    if (state.square !== "") o.square = state.square;
    if (state.mode !== "") o.mode = state.mode;
    if (CIPHER_LIVE) o.cipher = state.cipher;
    return o;
  }

  function run() {
    var t0 = now();
    try {
      art = S.ring(state.word, options());
      oops = null;
    } catch (e) {
      art = null;
      oops = (e && e.message) ? e.message : String(e);
    }
    ms = now() - t0;
    renders += 1;
    paint();
  }

  /* ── paint ─────────────────────────────────────────────────────────── */

  function paint() {
    if (oops !== null) {
      var box = $("plate");
      clear(box);
      var p = tag("div", "oops");
      p.appendChild(tag("b", null, "THE ENGINE REFUSED THIS INPUT"));
      p.appendChild(txt(oops));
      p.appendChild(tag("div", "dim", "House rule 3 says nothing refuses. This panel is here so a violation "
        + "is visible instead of silent — it is a defect in the engine, not in the word."));
      box.appendChild(p);
      $("status").textContent = "no sheet";
      return;
    }
    paintPlate();
    paintCusp();
    paintFacts();
    paintRide();
    paintCiphers();
    paintTexts();
    paintWarn();
    paintStatus();
  }

  function paintPlate() {
    var box = $("plate");
    box.innerHTML = art.sheetSvg;
    var svg = box.firstElementChild;
    if (!svg) return;
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", "plate for " + letters() + ", drawing number " + art.sheetId);
    if (state.view === "figure") cropToFigure(svg);
  }

  /*
   * Zoom to the drawing, measured rather than assumed.
   *
   * The crop is not computed from a copy of the ring's placement constants. It is
   * measured off the DOM the browser built: where the figure group's ink actually
   * lands on screen, mapped back through the sheet's own declared viewBox. A page
   * carrying its own idea of where the drawing sits would be a second answer to a
   * question the sheet already answers, and would drift the day the ring moved it.
   *
   * THE FIRST VERSION OF THIS WAS WRONG, and the way it was wrong is worth the
   * lines. It used getBBox() for the ink box and getCTM() for the placement, on
   * the assumption that getCTM() hands back the matrix into the sheet's viewBox
   * units. It does not: getCTM() maps to the nearest VIEWPORT coordinate system,
   * which is after the viewBox mapping — pixels, not millimetres. The crop came
   * out as "104.13 67.65 313.55 349.23" against a 210x297 sheet, so the zoom
   * showed the drawing shrunk into a corner of a box twice the size of the paper,
   * and the check at the time — "the viewBox changed" — passed on it happily.
   * scripts/build-instrument.ts now requires the crop to lie INSIDE the sheet and
   * to be meaningfully smaller than it, which is the check that fails on that
   * output.
   *
   * The width and height attributes move with the viewBox because the intrinsic
   * ratio of an <svg> comes from those attributes when they are present: leaving
   * 210mm x 297mm on a square crop letterboxes the zoom into a portrait box.
   */
  function cropToFigure(svg) {
    var g = svg.getElementById ? svg.getElementById("figure") : null;
    if (!g || typeof g.getBoundingClientRect !== "function") return;
    var vb = svg.viewBox && svg.viewBox.baseVal;
    if (!vb || !(vb.width > 0) || !(vb.height > 0)) return;
    var frame = svg.getBoundingClientRect();
    var ink = g.getBoundingClientRect();
    if (!(frame.width > 0) || !(frame.height > 0) || !(ink.width > 0) || !(ink.height > 0)) return;

    var sx = vb.width / frame.width, sy = vb.height / frame.height;
    var x0 = vb.x + (ink.left - frame.left) * sx;
    var y0 = vb.y + (ink.top - frame.top) * sy;
    var w = ink.width * sx, h = ink.height * sy;
    var pad = Math.max(w, h) * 0.035;
    x0 -= pad; y0 -= pad; w += pad * 2; h += pad * 2;
    if (!isFinite(x0) || !isFinite(y0) || !(w > 0) || !(h > 0)) return;

    svg.setAttribute("viewBox", x0.toFixed(4) + " " + y0.toFixed(4) + " " + w.toFixed(4) + " " + h.toFixed(4));
    // The width and height attributes here carry the RATIO and nothing else --
    // the CSS caps decide how big the zoom is drawn, and they can only shrink.
    // Written at the crop's own millimetres the element renders at its intrinsic
    // size, which for a 126mm crop is 475px inside an 890px column: a zoom that
    // came out smaller than the sheet it zoomed into. x10 puts the intrinsic size
    // past both caps for every crop the sheet can produce, so a cap is always
    // what binds and the ratio is always the crop's.
    svg.setAttribute("width", (w * 10).toFixed(4) + "mm");
    svg.setAttribute("height", (h * 10).toFixed(4) + "mm");
  }

  function letters() {
    var ls = art.walk.resolution.letters, out = "";
    for (var i = 0; i < ls.length; i++) out += ls[i].letter;
    return out === "" ? "(no letters)" : out;
  }

  function cellSum(w) {
    var c = w.resolution.cells, s = 0;
    for (var i = 0; i < c.length; i++) s += c[i];
    return s;
  }

  function theo(n) {
    var x = Math.abs(n);
    while (x > 9) { var s = 0, str = String(x); for (var i = 0; i < str.length; i++) s += Number(str[i]); x = s; }
    return x;
  }

  function paintCusp() {
    var box = $("cusp");
    clear(box);
    var cusps = art.envelope.cusps, m = art.envelope.multiplier;

    var top = tag("div", "cusp-top");
    top.appendChild(tag("div", "cusp-n", cusps));
    var right = tag("div");
    right.appendChild(tag("div", "cusp-lab", "CUSPS ON THE CAUSTIC"));
    right.appendChild(tag("div", "cusp-say",
      cusps === 1
        ? "One point. Find it on the plate — that single cusp is the whole readout."
        : "Count the points where the envelope turns back on itself. There are " + cusps
          + ". Switch the view to FIGURE and count them off the drawing."));
    top.appendChild(right);
    box.appendChild(top);

    var ticks = tag("div", "ticks");
    ticks.setAttribute("aria-hidden", "true");
    for (var i = 0; i < cusps; i++) ticks.appendChild(tag("span", "tick"));
    box.appendChild(ticks);

    var sum = cellSum(art.walk);
    var chain = tag("div", "chain");
    chain.appendChild(txt("cells sum to "));
    chain.appendChild(tag("b", null, sum));
    chain.appendChild(txt(" → reduces to "));
    chain.appendChild(tag("b", null, theo(sum)));
    chain.appendChild(txt(" → multiplier m = "));
    chain.appendChild(tag("b", null, m));
    chain.appendChild(txt(" → cusps = m − 1 = "));
    chain.appendChild(tag("b", null, cusps));
    chain.appendChild(txt(sum === 0
      ? ". (No letters resolved, so the sum is 0 and the engine floors m at 2.)"
      : ". The envelope is a chord family with " + num(art.envelope.chordCount)
        + " chords over " + num(art.envelope.nodes) + " nodes; its caustic has exactly m − 1 cusps."));
    box.appendChild(chain);

    if (!CIPHER_LIVE && state.cipher !== art.walk.cipher) {
      var alt = altWalk(state.cipher);
      var line = tag("div", "chain chain-alt");
      line.appendChild(txt("under " + state.cipher + " the same letters would draw "));
      line.appendChild(tag("b", null, S.cuspsForWalk(alt)));
      line.appendChild(txt(" — the plate above is PYTH."));
      box.appendChild(line);
    }
  }

  function altWalk(cipher) {
    return S.walk(state.word, { square: art.walk.square, trace: art.walk.trace, cipher: cipher });
  }

  function fact(dl, key, value, cls, note) {
    var d = tag("div", "fact" + (key === "CELLS WALKED" ? " wide" : ""));
    d.appendChild(tag("dt", null, key));
    d.appendChild(tag("dd", cls || null, value));
    if (note) d.appendChild(tag("div", "fact-note", note));
    dl.appendChild(d);
  }

  /*
   * Where the square and the mode came from.
   *
   * This mirrors the three-way "options.square ?? correspondence?.kamea ??
   * HOUSE_SQUARE" that packages/ring/src/index.ts makes, which makes it exactly
   * the kind of restatement that has shipped false here before. So it is not
   * trusted: scripts/build-instrument.ts runs the cross and requires that an
   * unrequested square IS the concept's kamea when a concept rides and the house
   * square when none does, and the same for the mode. The build fails otherwise.
   */
  function sourceOf(requested, hasConcept) {
    if (requested !== "") return "you asked";
    return hasConcept ? "the concept" : "the house";
  }

  function paintFacts() {
    var dl = $("facts");
    clear(dl);
    var w = art.walk, r = w.resolution, c = art.correspondence;
    var hasConcept = !!c;

    fact(dl, "SQUARE", w.square + " " + w.order + "×" + w.order, "v-vio",
      sourceOf(state.square, hasConcept) + " · " + (w.order * w.order) + " cells");
    fact(dl, "CIPHER", w.cipher, "v-dim", CIPHER_LIVE ? "you asked" : "fixed by ring()");
    fact(dl, "TRACE", w.trace, "v-walk", "you asked");
    var painted = art.mode ? art.mode.mode : "none";
    var shaky = DIVERGENT.indexOf(painted) !== -1;
    fact(dl, "MODE", painted, shaky ? "v-part" : (art.mode ? "v-geo" : "v-dim"),
      art.mode
        ? sourceOf(state.mode, hasConcept) + " · " + art.mode.paths.length + " paths"
          + (shaky ? " · does not reproduce in Node" : "")
        : (state.mode === "none" ? "you asked for none" : "no concept names one"));

    fact(dl, "LETTERS", letters(), null, r.letters.length + " kept");
    fact(dl, "DROPPED", r.dropped.length === 0 ? "—" : dropList(r.dropped),
      r.dropped.length === 0 ? "v-dim" : "v-part",
      r.dropped.length === 0
        ? "nothing was thrown away"
        : r.dropped.length + (r.dropped.length === 1 ? " character carries" : " characters carry") + " no value");
    fact(dl, "CELLS WALKED", r.cells.length === 0 ? "—" : r.cells.join("·"), "v-walk",
      "sum " + cellSum(w) + " · " + w.activatedCells.length + " distinct");
    fact(dl, "SEGMENTS", w.segmentCount, null, w.loopCount + " loop" + (w.loopCount === 1 ? "" : "s"));
    fact(dl, "NODES", num(art.envelope.nodes), null, num(art.envelope.chordCount) + " chords");
    fact(dl, "MARKS", art.marks.length, art.marks.length === 0 ? "v-dim" : "v-geo",
      art.marks.length === 0 ? "none reached" : "placed on the plate");
    fact(dl, "SHEET BYTES", num(art.sheetSvg.length), null, "A4 210×297 mm");
    fact(dl, "DRAWING No.", art.sheetId, "v-geo", "sha256 of the figure markup");
  }

  function dropList(dropped) {
    var out = [];
    for (var i = 0; i < dropped.length && i < 8; i++) out.push(dropped[i].char);
    return out.join(" ") + (dropped.length > 8 ? " …" : "");
  }

  function paintRide() {
    var box = $("ride");
    clear(box);
    var c = art.correspondence;

    if (!c) {
      box.className = "card ride empty";
      var h = tag("h3");
      h.appendChild(txt("THE CONCEPT RIDE · "));
      h.appendChild(tag("span", "acc", "NOTHING RODE"));
      box.appendChild(h);
      var p = tag("p", "empty-say");
      p.appendChild(txt("No concept rides these letters, and "));
      p.appendChild(tag("b", null, "most words do not"));
      p.appendChild(txt(" — the table holds " + num(S.CORRESPONDENCE_COVERAGE.words)
        + " words across " + S.CORRESPONDENCE_COVERAGE.concepts + " concepts, and that is all of them. "
        + "The plate is not diminished by it: the walk, the envelope, the cusp count, the drawing "
        + "number and the receipt are all downstream of the letters and none of them needs a concept. "
        + "What is missing is the ride — no planet chose the square, so it walks the house square "
        + "jupiter; no mode painted a field; no marks were reached."));
      box.appendChild(p);
      return;
    }

    box.className = "card ride";
    var head = tag("h3");
    head.appendChild(txt("THE CONCEPT RIDE · "));
    head.appendChild(tag("span", "acc", String(c.concept).toUpperCase()));
    box.appendChild(head);

    var rows = tag("div", "rows");
    rows.appendChild(row("PLANET", c.planet + "  →  kamea " + c.kamea));
    rows.appendChild(row("TRADITIONS", pills(traditionNames(c.traditions), "vio")));
    rows.appendChild(row("BRUSHES", pills(c.brushes, "dim")));
    rows.appendChild(row("MARKS", art.marks.length === 0
      ? dimSpan("none — every brush this concept carries reached no drawn mark")
      : pills(markNames(), "geo")));
    if (c.brushesReachingNoMark && c.brushesReachingNoMark.length > 0) {
      rows.appendChild(row("NO MARK", dimSpan(c.brushesReachingNoMark.join(", ")
        + " reached nothing in the codex")));
    }
    rows.appendChild(row("RECIPE", "mode " + c.composition.mode + " · arch " + c.composition.arch
      + " · palette " + c.composition.palette + " · fold " + c.composition.fold));
    rows.appendChild(row("ALSO SAYS", c.words.join(", ")));
    box.appendChild(rows);
  }

  function row(k, v) {
    var r = tag("div", "row");
    r.appendChild(tag("div", "row-k", k));
    var d = tag("div", "row-v");
    if (typeof v === "string") d.appendChild(txt(v)); else d.appendChild(v);
    r.appendChild(d);
    return r;
  }

  function dimSpan(s) { return tag("span", "dim", s); }

  function pills(list, kind) {
    var f = document.createDocumentFragment();
    for (var i = 0; i < list.length; i++) f.appendChild(tag("span", "pill " + kind, list[i]));
    return f;
  }

  function traditionNames(keys) {
    var out = [];
    for (var i = 0; i < keys.length; i++) {
      var label = S.TRADITION_LABELS[keys[i]];
      out.push(label ? label[0] : keys[i]);
    }
    return out;
  }

  function markNames() {
    var out = [];
    for (var i = 0; i < art.marks.length; i++) out.push(art.marks[i].name);
    return out;
  }

  /* ── cipher bench ──────────────────────────────────────────────────── */

  var ROLE_COLOUR = { "line": "#56c9ff", "loop": "#f4b942", "start-cap": "#5ef2c4", "end-cap": "#8a7ff0" };

  function paintCiphers() {
    var box = $("ciphers");
    clear(box);
    for (var i = 0; i < S.CIPHER_IDS.length; i++) {
      var id = S.CIPHER_IDS[i];
      var w = id === art.walk.cipher ? art.walk : altWalk(id);
      var e = S.envelopeFromWalk(w);
      var on = id === state.cipher;

      var card = tag("button", "cip" + (on ? " on" : ""));
      card.type = "button";
      card.setAttribute("data-cipher", id);
      card.setAttribute("aria-pressed", on ? "true" : "false");

      var h = tag("div", "cip-h");
      h.appendChild(tag("span", "cip-id", id));
      h.appendChild(tag("span", "cip-tag", id === art.walk.cipher ? "ON THE PLATE" : "would draw"));
      card.appendChild(h);

      card.appendChild(walkSvg(w));

      var n = tag("dl", "cip-n");
      n.appendChild(pair("CUSPS", e.cusps));
      n.appendChild(pair("SEGMENTS", w.segmentCount));
      n.appendChild(pair("LOOPS", w.loopCount));
      card.appendChild(n);

      card.appendChild(tag("div", "cip-cells",
        w.resolution.cells.length === 0 ? "no cells" : w.resolution.cells.join("·")));
      box.appendChild(card);
    }
  }

  function pair(k, v) {
    var d = tag("div");
    d.appendChild(tag("dt", null, k));
    d.appendChild(tag("dd", null, v));
    return d;
  }

  /*
   * The walked line, as the engine emitted it.
   *
   * Every d string here came out of S137.walk(); nothing on this bench computes
   * a coordinate. It is a preview of station 2 and it is labelled as one — the
   * plate is the artifact, and it is the only thing the save button will hand you.
   */
  function walkSvg(w) {
    var vb = w.viewBox;
    var ns = "http://www.w3.org/2000/svg";
    var svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", vb.join(" "));
    svg.setAttribute("width", "220");
    svg.setAttribute("height", "220");
    svg.setAttribute("aria-hidden", "true");
    for (var i = 0; i < w.paths.length; i++) {
      var p = document.createElementNS(ns, "path");
      p.setAttribute("d", w.paths[i].d);
      p.setAttribute("fill", "none");
      p.setAttribute("stroke", ROLE_COLOUR[w.paths[i].role] || "#56c9ff");
      p.setAttribute("stroke-width", "2");
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("stroke-linejoin", "round");
      svg.appendChild(p);
    }
    return svg;
  }

  /* ── the texts ─────────────────────────────────────────────────────── */

  var TABS = [
    ["legend", "LEGEND"], ["census", "CENSUS"],
    ["modeCensus", "MODE CENSUS"], ["receipt", "RECEIPT"]
  ];

  function buildTabs() {
    var box = $("tabs");
    for (var i = 0; i < TABS.length; i++) {
      var b = tag("button", "tab", TABS[i][1]);
      b.type = "button";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-controls", "text");
      b.setAttribute("data-tab", TABS[i][0]);
      box.appendChild(b);
    }
    box.addEventListener("click", function (ev) {
      var k = ev.target && ev.target.getAttribute ? ev.target.getAttribute("data-tab") : null;
      if (k === null) return;
      state.tab = k;
      paintTexts();
    });
  }

  function paintTexts() {
    var box = $("tabs");
    var buttons = box.getElementsByTagName("button");
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute("aria-selected",
        buttons[i].getAttribute("data-tab") === state.tab ? "true" : "false");
    }
    $("text").textContent = art[state.tab];
  }

  function paintWarn() {
    var w = $("warn");
    var painted = art.mode ? art.mode.mode : "none";
    if (DIVERGENT.indexOf(painted) === -1) { w.hidden = true; w.textContent = ""; return; }
    w.hidden = false;
    clear(w);
    w.appendChild(tag("b", null, painted.toUpperCase() + " DOES NOT REPRODUCE ACROSS RUNTIMES."));
    w.appendChild(txt(" This plate's field, and therefore its bytes and its drawing number, differ "
      + "from the one s137 ring writes for the same word. The list this warning is driven by is not "
      + "written by hand: build-instrument.ts --verify compiles every mode in both runtimes on every "
      + "build and names whichever ones disagree, so a mode appears here on the build that breaks it. "
      + "The walk, the cusp count, the census and the receipt are downstream of the letters and not "
      + "of the field — those stay identical either way, and the word still reads back. This banner "
      + "was last shown for attractor, whose de Jong orbit amplified a one-ulp Math.sin disagreement "
      + "without bound; packages/mode-engine/src/trig.ts replaced the built-ins with sine and cosine "
      + "built from arithmetic IEEE-754 pins down, and the list has been empty since."));
  }

  function paintStatus() {
    var s = $("status");
    clear(s);
    function bit(k, v) {
      var d = tag("span");
      d.appendChild(txt(k + " "));
      d.appendChild(tag("b", null, v));
      s.appendChild(d);
    }
    bit("drawing", art.sheetId);
    bit("bytes", num(art.sheetSvg.length));
    bit("compiled in", ms.toFixed(1) + " ms");
    bit("render", "#" + renders);
    if ($("srcwrap").open) $("src").value = art.sheetSvg;
  }

  /* ── saving ────────────────────────────────────────────────────────── */

  function filename() {
    var l = letters().replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 24);
    return "s137-" + (l === "" ? "plate" : l) + "-" + art.sheetId + ".svg";
  }

  function say(msg, good) {
    var n = $("savesay");
    n.textContent = msg;
    n.className = "fact-note " + (good ? "v-geo" : "v-part");
  }

  function download() {
    if (art === null) return;
    try {
      var blob = new Blob([art.sheetSvg], { type: "image/svg+xml;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      a.href = url;
      a.download = filename();
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.parentNode.removeChild(a); }, 4000);
      say("saved " + filename(), true);
    } catch (e) {
      say("this browser blocked the download — use COPY, or open the SOURCE panel below", false);
    }
  }

  function copy() {
    if (art === null) return;
    var text = art.sheetSvg;
    var ok = function () { say("copied " + num(text.length) + " bytes of SVG", true); };
    var no = function () {
      $("srcwrap").open = true;
      $("src").value = text;
      $("src").focus();
      $("src").select();
      say("the clipboard was refused — the SVG is selected in the SOURCE panel; press copy", false);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(ok, no);
    } else { no(); }
  }

  /* ── wiring ────────────────────────────────────────────────────────── */

  var timer = null;
  function debounced() {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(function () { timer = null; state.word = $("word").value; run(); }, 110);
  }

  function bindSelect(id, key) {
    $(id).addEventListener("change", function () {
      state[key] = $(id).value;
      if (key === "cipher" && !CIPHER_LIVE) { paintCusp(); paintCiphers(); return; }
      run();
    });
  }

  function boot() {
    buildControls();
    buildTabs();
    $("word").value = state.word;
    $("word").addEventListener("input", debounced);
    bindSelect("square", "square");
    bindSelect("trace", "trace");
    bindSelect("mode", "mode");
    bindSelect("cipher", "cipher");
    bindSelect("view", "view");
    $("rand").addEventListener("click", function () {
      var w = VOCAB[Math.floor(Math.random() * VOCAB.length)].toUpperCase();
      state.word = w;
      $("word").value = w;
      run();
    });
    $("dl").addEventListener("click", download);
    $("cp").addEventListener("click", copy);
    $("ciphers").addEventListener("click", function (ev) {
      var node = ev.target;
      while (node && node !== document.body && !node.getAttribute("data-cipher")) node = node.parentNode;
      var id = node && node.getAttribute ? node.getAttribute("data-cipher") : null;
      if (id === null) return;
      state.cipher = id;
      $("cipher").value = id;
      if (CIPHER_LIVE) { run(); } else { paintCusp(); paintCiphers(); }
    });
    $("srcwrap").addEventListener("toggle", function () {
      if ($("srcwrap").open && art !== null) $("src").value = art.sheetSvg;
    });
    run();
  }

  /*
   * The verification hook.
   *
   * scripts/build-instrument.ts drives this page through its real controls and
   * then reads the bytes back through here, so the strings it compares against
   * "s137 ring" are the ones the page actually compiled rather than a re-run. It
   * is a read-only view on purpose: a setter would let the check bypass the
   * controls it is supposed to be checking.
   */
  window.S137_INSTRUMENT = {
    read: function () {
      return {
        state: { word: state.word, square: state.square, trace: state.trace,
                 mode: state.mode, cipher: state.cipher, view: state.view, tab: state.tab },
        renders: renders,
        error: oops,
        mode: art ? (art.mode ? art.mode.mode : "none") : null,
        sheetId: art ? art.sheetId : null,
        sheetSvg: art ? art.sheetSvg : null,
        legend: art ? art.legend : null,
        census: art ? art.census : null,
        modeCensus: art ? art.modeCensus : null,
        receipt: art ? art.receipt : null
      };
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else { boot(); }
})();
`;

/** Escape for a text node inside HTML. The bundle is not escaped; it is checked. */
const esc = (s: string): string =>
  s.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;");

type PageInputs = Readonly<{
  bundle: string;
  bundleSha: string;
  esbuildVersion: string;
  chips: readonly string[];
  cipherLive: boolean;
}>;

function pageHtml(input: PageInputs): string {
  const coverage = CORRESPONDENCE_COVERAGE;
  const modeCount = MODE_IDS.length;
  const conceptModes = new Set(CONCEPT_CORRESPONDENCE.map((c) => c.composition.mode)).size;

  const html =
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>S137 · SIGIL INSTRUMENT</title>
<style>${CSS}</style>
</head>
<body>
<div class="wrap">

<header class="mast">
  <div class="mast-row">
    <h1>S137 <span class="tick">/</span> SIGIL INSTRUMENT</h1>
    <span class="mast-tag">${SQUARE_IDS.length} SQUARES · ${CIPHER_IDS.length} CIPHERS · ${TRACE_IDS.length} TRACES · ${modeCount} MODES</span>
  </div>
  <p class="lede">Type a word. Letters become digits, digits a walk across a planetary kamea, the walk a
    chord family whose envelope has <b>m − 1 cusps</b>. Compiled here by the same module graph
    <b>s137 ring</b> imports — not a port. Every request this page has been driven through gave the
    same bytes as the command line, compared artifact by artifact by <b>build-instrument.ts
    --verify</b> and again, case by case and cipher by cipher, by
    <b>build-browser-bundle.ts</b> — both of which re-measure on every build rather than trusting
    this sentence, and both of which are run against planted failures to prove they can still fail.
    Nothing is fetched; nothing is sent.</p>
</header>

<main>

<section class="bench" aria-label="the word">
  <div class="wordrow">
    <input id="word" type="text" spellcheck="false" autocomplete="off" autocapitalize="characters"
      placeholder="TYPE ANYTHING" aria-label="the word to compile">
    <button id="rand" type="button" title="a word from the house vocabulary">RANDOM</button>
  </div>
  <div class="chips" id="chips" aria-label="example words"></div>
</section>

<div class="console">

<section class="knobswrap" aria-label="controls">
  <div class="knobs">
    <label class="knob"><span class="knob-k">SQUARE</span><select id="square"></select></label>
    <label class="knob"><span class="knob-k">CIPHER</span><select id="cipher"></select></label>
    <label class="knob"><span class="knob-k">TRACE</span><select id="trace"></select></label>
    <label class="knob"><span class="knob-k">MODE</span><select id="mode"></select></label>
    <label class="knob"><span class="knob-k">VIEW</span><select id="view"></select></label>
    <div class="knob">
      <span class="knob-k">SAVE</span>
      <div class="btnpair"><button id="dl" type="button">SVG</button><button id="cp" type="button">COPY</button></div>
      <div class="fact-note" id="savesay">the plate is the artifact — A4, print ready</div>
    </div>
  </div>
  <p class="knobnote" id="knobnote"><b>CIPHER moves the bench below, not the plate</b> —
    <code>RingOptions</code> has no cipher field, so <code>ring()</code> fixes every plate at PYTH.</p>
</section>

  <section class="platecol">
    <p class="warn" id="warn" hidden></p>
    <div class="plate" id="plate"></div>
    <p class="status" id="status"></p>
  </section>
  <aside class="reads">
    <div class="cusp" id="cusp"></div>
    <dl class="facts" id="facts"></dl>
    <div class="card ride" id="ride"></div>
  </aside>

</div>

<section class="sec">
  <h2>CIPHER BENCH</h2>
  <p class="secnote" id="cipnote"></p>
  <div class="ciphers" id="ciphers"></div>
</section>

<section class="sec texts">
  <h2>THE THREE TEXTS, AND THE FOURTH</h2>
  <p class="secnote">A sheet on its own is a picture, and a picture cannot be checked. The
    <b>legend</b> says where every element came from; the <b>census</b> grades every choice the sheet
    made and states what would differ if it were flipped; the <b>receipt</b> reads the drawing back
    blind — path data and a vocabulary, nothing else — and returns the word. The <b>mode
    census</b> measures the composition field. They update with the plate.</p>
  <div class="tabs" id="tabs" role="tablist"></div>
  <pre class="text" id="text" tabindex="0" role="tabpanel"></pre>
  <details class="src" id="srcwrap">
    <summary>SOURCE · the SVG bytes, if the clipboard or the download is refused</summary>
    <textarea class="srcbox" id="src" readonly spellcheck="false" aria-label="sheet SVG source"></textarea>
  </details>
</section>

</main>

<footer>
  <div>correspondence ${esc(CORRESPONDENCE_VERSION)} · geometry ${esc(GEOMETRY_V2_VERSION)} ·
    ${coverage.words} words → ${coverage.concepts} concepts · ${coverage.marksLocked} locked marks ·
    ${coverage.wordsReachingNoMark} of the ${coverage.words} table words reach no mark at all ·
    ${conceptModes} of the ${modeCount} modes are requested by a concept</div>
  <div>engine bundled from <code>packages/spine-browser/src/index.ts</code> by esbuild ${esc(input.esbuildVersion)} ·
    sha256 <code>${esc(input.bundleSha)}</code></div>
  <div>built by <code>scripts/build-instrument.ts</code> · no network, no CDN, no analytics ·
    the plate you save is the plate <code>s137 ring</code> writes</div>
</footer>

</div>
<script>window.__S137_CHIPS=${JSON.stringify(input.chips)};window.__S137_CIPHER_LIVE=${String(input.cipherLive)};window.__S137_DIVERGENT_MODES=${JSON.stringify(CROSS_RUNTIME_DIVERGENT_MODES)};</script>
<script>${input.bundle}</script>
<script>${PAGE_JS}</script>
</body>
</html>
`;
  return html;
}

/* ── browser verification ─────────────────────────────────────────────────── */

/**
 * The sheet's declared size in millimetres, read off a sheet the engine just
 * emitted rather than copied from `annotate.ts`. It is the frame the FIGURE
 * crop has to stay inside, so taking it from anywhere but the artifact would be
 * one more constant to drift.
 */
const [SHEET_MM_W, SHEET_MM_H] = ((): readonly [number, number] => {
  const svg = ring("LUNAR").sheetSvg;
  const match = /viewBox="0 0 ([\d.]+) ([\d.]+)"/u.exec(svg);
  if (match === null) throw new Error("could not read the sheet viewBox off an emitted plate");
  return [Number(match[1]), Number(match[2])];
})();

type Viewport = Readonly<{ name: string; width: number; height: number }>;

const VIEWPORTS: readonly Viewport[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 375, height: 812 },
];

type Note = Readonly<{ channel: string; text: string; where: string }>;
type Offender = Readonly<{ path: string; left: number; right: number; width: number }>;
type OverflowProbe = Readonly<{
  limit: number;
  documentScrollWidth: number;
  bodyScrollWidth: number;
  widest: number;
  offenders: readonly Offender[];
}>;
type TextProbe = Readonly<{ svgs: number; elements: number; checked: readonly string[]; offenders: readonly Readonly<{ tag: string; count: number }>[] }>;

/**
 * Every element whose rectangle reaches past the viewport.
 *
 * Not `documentElement.scrollWidth`. This page deliberately does NOT set
 * `overflow-x: hidden` on `body` — the studio's other page does, which clamps
 * `scrollWidth` and lets a 3000px bar pass the obvious check — so here the two
 * measurements have to agree and both are recorded. An element that declares its
 * own horizontal scrolling is allowed to hold content wider than itself and the
 * walk stops there; the element itself is still measured on the way in.
 */
function probeOverflow(): OverflowProbe {
  const TOL = 0.5;
  const de = document.documentElement;
  const limit = de.clientWidth;
  const offenders: Offender[] = [];
  let widest = 0;

  const label = (el: Element): string => {
    const bits: string[] = [];
    let node: Element | null = el;
    while (node !== null && node !== de) {
      const id = node.id !== "" ? `#${node.id}` : "";
      const raw = typeof node.className === "string" ? node.className.trim() : "";
      bits.unshift(`${node.localName}${id}${raw === "" ? "" : `.${raw.split(/\s+/u).join(".")}`}`);
      node = node.parentElement;
    }
    return bits.join(" > ");
  };

  const measure = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.right > widest) widest = r.right;
    if (r.right > limit + TOL || r.left < -TOL) {
      offenders.push({ path: label(el), left: r.left, right: r.right, width: r.width });
      return true;
    }
    return false;
  };

  const clips = (el: Element): boolean => {
    const ox = getComputedStyle(el).overflowX;
    return ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip";
  };

  const walkTree = (el: Element): void => {
    for (const child of Array.from(el.children)) {
      const style = getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (measure(child)) continue;
      if (clips(child)) continue;
      walkTree(child);
    }
  };

  measure(document.body);
  walkTree(document.body);
  return {
    limit,
    documentScrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    widest,
    offenders: offenders.slice(0, 12),
  };
}

/**
 * House rule 4, read off the DOM the browser built.
 *
 * `querySelectorAll("textPath")` is a check that cannot fail: type selectors are
 * ASCII-lowercased in an HTML document and the SVG local name is not, so the
 * selector matches nothing and reports a clean plate whatever is in it. This
 * compares lowercased `localName` instead, and hands back how many elements it
 * actually looked at so a run that found no plate cannot be read as a pass.
 */
function probeText(): TextProbe {
  const forbidden = ["text", "tspan", "textpath", "foreignobject"];
  const plate = document.getElementById("plate");
  const roots = plate === null ? [] : Array.from(plate.getElementsByTagName("svg"));
  const tally = new Map<string, number>();
  let elements = 0;
  for (const root of roots) {
    for (const el of Array.from(root.getElementsByTagName("*"))) {
      elements += 1;
      const name = el.localName.toLowerCase();
      if (forbidden.includes(name)) tally.set(el.localName, (tally.get(el.localName) ?? 0) + 1);
    }
  }
  return {
    svgs: roots.length,
    elements,
    checked: forbidden,
    offenders: [...tally].map(([tag, count]) => ({ tag, count })),
  };
}

type Sweep = Readonly<{ control: string; from: string; to: string; changed: boolean }>;

type Inspection = Readonly<{
  viewport: Viewport;
  notes: readonly Note[];
  overflow: OverflowProbe;
  text: TextProbe;
  sweep: readonly Sweep[];
  download: string | null;
  screenshot: string;
  failures: readonly string[];
}>;

async function inspect(browser: Browser, viewport: Viewport, outDir: string): Promise<Inspection> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    acceptDownloads: true,
  });
  // Under tsx, esbuild's `keepNames` wraps every function declaration in
  // `__name(fn, "...")`. `page.evaluate` ships the function by taking its
  // `.toString()`, so the wrapper travels and the helper does not; without this
  // the page throws `ReferenceError: __name is not defined` before a single
  // rectangle is measured. Added as source text so it cannot itself need it.
  await context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });

  const page = await context.newPage();
  const notes: Note[] = [];
  page.on("console", (m) => {
    const loc = m.location();
    notes.push({
      channel: `console.${m.type()}`,
      text: m.text(),
      where: loc.url === "" ? "-" : `${loc.url}:${loc.lineNumber}:${loc.columnNumber}`,
    });
  });
  page.on("pageerror", (e) => notes.push({ channel: "pageerror", text: `${e.name}: ${e.message}`, where: "-" }));
  page.on("requestfailed", (r) =>
    notes.push({ channel: "requestfailed", text: `${r.failure()?.errorText ?? "failed"} ${r.url()}`, where: r.resourceType() }),
  );

  const failures: string[] = [];
  const tag = `[${viewport.name} ${viewport.width}x${viewport.height}]`;

  await page.goto(pathToFileURL(PAGE_FILE).href, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const w = window as unknown as { S137_INSTRUMENT?: { read: () => { sheetId: string | null } } };
    return w.S137_INSTRUMENT !== undefined && w.S137_INSTRUMENT.read().sheetId !== null;
  }, undefined, { timeout: 30_000 });

  const read = async (): Promise<{ sheetId: string; renders: number; error: string | null }> =>
    page.evaluate(() => {
      const w = window as unknown as {
        S137_INSTRUMENT: { read: () => { sheetId: string; renders: number; error: string | null } };
      };
      return w.S137_INSTRUMENT.read();
    });

  /* ── the word drives the plate ── */
  const sweep: Sweep[] = [];
  const before = await read();
  await page.fill("#word", "SERPENT");
  await page.waitForTimeout(320);
  const typed = await read();
  sweep.push({ control: "word", from: before.sheetId, to: typed.sheetId, changed: before.sheetId !== typed.sheetId });

  /* ── every knob drives the plate ── */
  const knobs: readonly (readonly [string, string])[] = [
    ["square", "mars"],
    ["trace", "ROSETTA"],
    ["mode", "metatron"],
    ["view", "figure"],
  ];
  for (const [id, value] of knobs) {
    const was = await read();
    await page.selectOption(`#${id}`, value);
    await page.waitForTimeout(220);
    const is = await read();
    // VIEW does not recompile — it re-crops the same bytes — so it is judged on
    // the rendered viewBox rather than on the drawing number, which must NOT move.
    if (id === "view") {
      const vb = await page.evaluate(() => {
        const svg = document.querySelector("#plate svg");
        return svg === null ? "" : (svg.getAttribute("viewBox") ?? "");
      });
      // "It changed" is not the claim. The claim is that the zoom shows the
      // DRAWING: a window that lies inside the sheet and is meaningfully smaller
      // than it. A crop computed in the wrong coordinate system changes the
      // viewBox too, and the first version of this check passed on one.
      const n = vb.trim().split(/\s+/u).map(Number);
      const inside =
        n.length === 4 && n.every((v) => Number.isFinite(v)) &&
        n[0]! >= -0.5 && n[1]! >= -0.5 &&
        n[0]! + n[2]! <= SHEET_MM_W + 0.5 && n[1]! + n[3]! <= SHEET_MM_H + 0.5 &&
        n[2]! < SHEET_MM_W * 0.95 && n[2]! > 1 && n[3]! > 1;
      const changed = vb !== `0 0 ${SHEET_MM_W} ${SHEET_MM_H}` && inside;
      sweep.push({ control: "view", from: `0 0 ${SHEET_MM_W} ${SHEET_MM_H}`, to: vb, changed });
      if (!changed) {
        failures.push(`${tag} VIEW=figure did not crop to a window inside the ${SHEET_MM_W}x${SHEET_MM_H} sheet (viewBox ${JSON.stringify(vb)})`);
      }
      if (is.sheetId !== was.sheetId) failures.push(`${tag} VIEW changed the drawing number; it must only change the crop`);
    } else {
      sweep.push({ control: id, from: was.sheetId, to: is.sheetId, changed: was.sheetId !== is.sheetId });
      if (was.sheetId === is.sheetId) failures.push(`${tag} ${id.toUpperCase()}=${value} did not change the plate`);
    }
  }
  if (!sweep[0]!.changed) failures.push(`${tag} typing did not change the plate`);

  /* ── the cipher knob, on whatever terms it actually has ── */
  const cipherLive = await page.evaluate(() => (window as unknown as { __S137_CIPHER_LIVE: boolean }).__S137_CIPHER_LIVE);
  // What the bench SAYS does not change when the selection moves — the three
  // cards are drawn for all three ciphers whatever is selected. What moves is
  // which card is marked, and the line the cusp card gains naming the cipher the
  // plate is NOT under. Reading `textContent` off the bench was a probe that
  // could not fail, and it reported a dead knob on a live one.
  const cipherMark = (): Promise<string> =>
    page.evaluate(() => {
      const on = document.querySelector("#ciphers .cip.on");
      const cusp = document.getElementById("cusp");
      return `${on === null ? "none" : on.getAttribute("data-cipher") ?? "?"}|${(cusp?.textContent ?? "").trim()}`;
    });
  const cipherBefore = await read();
  const benchBefore = await cipherMark();
  await page.selectOption("#cipher", "NAEQ");
  await page.waitForTimeout(200);
  const cipherAfter = await read();
  const benchAfter = await cipherMark();
  if (cipherLive) {
    sweep.push({ control: "cipher", from: cipherBefore.sheetId, to: cipherAfter.sheetId, changed: cipherBefore.sheetId !== cipherAfter.sheetId });
    if (cipherBefore.sheetId === cipherAfter.sheetId) failures.push(`${tag} CIPHER=NAEQ did not change the plate`);
  } else {
    const changed = benchBefore !== benchAfter;
    sweep.push({ control: "cipher (bench only)", from: "PYTH selected", to: "NAEQ selected", changed });
    if (!changed) failures.push(`${tag} CIPHER=NAEQ moved nothing at all — the knob is dead`);
    if (cipherBefore.sheetId !== cipherAfter.sheetId) {
      failures.push(`${tag} CIPHER moved the plate while the page says it cannot`);
    }
  }

  /* ── a hostile word must not become markup, and must not be refused ── */
  await page.fill("#word", "</script><img src=x onerror=alert(1)>");
  await page.waitForTimeout(320);
  const hostile = await read();
  if (hostile.error !== null) failures.push(`${tag} the engine refused a hostile word: ${hostile.error}`);
  const injected = await page.evaluate(() => document.querySelectorAll("img").length);
  if (injected !== 0) failures.push(`${tag} a typed word became ${injected} <img> element(s)`);

  /* ── back to a plate worth photographing ── */
  await page.fill("#word", "LUNAR");
  await page.selectOption("#square", "");
  await page.selectOption("#trace", "AGRIPPA");
  await page.selectOption("#mode", "");
  await page.selectOption("#view", "sheet");
  await page.selectOption("#cipher", "PYTH");
  await page.waitForTimeout(360);

  /* ── the probes ── */
  const overflow = await page.evaluate(probeOverflow);
  const text = await page.evaluate(probeText);

  if (overflow.offenders.length > 0) {
    failures.push(`${tag} ${overflow.offenders.length} element(s) reach past the viewport: ` +
      overflow.offenders.map((o) => `${o.path} [${o.left.toFixed(0)}..${o.right.toFixed(0)}]`).join("; "));
  }
  if (overflow.documentScrollWidth > overflow.limit + 0.5) {
    failures.push(`${tag} documentElement.scrollWidth ${overflow.documentScrollWidth} > ${overflow.limit}`);
  }
  if (text.svgs === 0 || text.elements === 0) failures.push(`${tag} the plate probe found no SVG to check`);
  if (text.offenders.length > 0) {
    failures.push(`${tag} house rule 4: ${text.offenders.map((o) => `${o.tag} x${o.count}`).join(", ")}`);
  }

  /* ── the save button ── */
  let download: string | null = null;
  try {
    const [event] = await Promise.all([
      page.waitForEvent("download", { timeout: 8000 }),
      page.click("#dl"),
    ]);
    download = event.suggestedFilename();
  } catch {
    download = null;
  }
  if (download === null) failures.push(`${tag} the SVG download button fired no download`);

  // The control sweep and the download click scroll elements into view, so the
  // page is put back to the top first. A screenshot of wherever the driving
  // happened to leave the scroll is evidence of nothing anybody will ever see.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(120);

  const screenshot = join(outDir, `instrument-${viewport.name}-${viewport.width}x${viewport.height}.png`);
  await page.screenshot({ path: screenshot, fullPage: false });
  const tall = join(outDir, `instrument-${viewport.name}-full.png`);
  await page.screenshot({ path: tall, fullPage: true });

  if (notes.length > 0) {
    failures.push(`${tag} the console was not silent: ${notes.length} message(s)`);
  }

  await context.close();
  return { viewport, notes, overflow, text, sweep, download, screenshot, failures };
}

/* ── determinism across runtimes ──────────────────────────────────────────── */

type Verdict = "same" | "declared-diff" | "UNEXPECTED-DIFF" | "UNEXPECTED-SAME";

type Parity = Readonly<{
  word: string;
  square: string;
  mode: string;
  artifact: string;
  cliSha: string;
  pageSha: string;
  same: boolean;
  verdict: Verdict;
}>;

/**
 * Which artifacts a divergent field is ALLOWED to move.
 *
 * The field is painted into the figure, so it moves the sheet bytes and the
 * drawing number the legend prints — and nothing else. The census grades choices
 * and the receipt reads the walk back, and neither is downstream of the field, so
 * both must still match to the byte. Listing the permitted casualties rather than
 * excusing the whole word is what keeps this a measurement: if a divergent mode
 * ever moved a receipt, that would be a different and much worse defect, and this
 * check would catch it.
 */
const FIELD_TOUCHES: readonly string[] = Object.freeze(["sheet.svg", "legend.txt"]);

/**
 * The same word and settings, compiled twice on two runtimes, compared as bytes.
 *
 * The page is driven through its OWN controls — the word is typed into the input
 * and the square is picked from the select — and only then are its four texts
 * read back. Calling a hidden entry point would prove the bundle deterministic
 * and prove nothing about the instrument. `s137 ring` is spawned with the same
 * word and square, and its four files are compared byte-for-byte.
 *
 * The CLI's `ring` subcommand takes only a word and a square, so the trace and
 * the mode are left at the page's defaults, which are the ring's defaults:
 * AGRIPPA, and whatever mode the concept names.
 */
async function parity(browser: Browser, pairs: readonly (readonly [string, string])[]): Promise<readonly Parity[]> {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(PAGE_FILE).href, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const w = window as unknown as { S137_INSTRUMENT?: { read: () => { sheetId: string | null } } };
    return w.S137_INSTRUMENT !== undefined && w.S137_INSTRUMENT.read().sheetId !== null;
  }, undefined, { timeout: 30_000 });

  const root = mkdtempSync(join(tmpdir(), "s137-instrument-parity-"));
  const rows: Parity[] = [];
  try {
    for (const [index, [word, square]] of pairs.entries()) {
      await page.fill("#word", word);
      await page.selectOption("#square", square);
      await page.waitForTimeout(300);
      const fromPage = await page.evaluate(() => {
        const w = window as unknown as {
          S137_INSTRUMENT: {
            read: () => Readonly<{
              sheetSvg: string; legend: string; census: string; receipt: string;
              mode: string; state: { word: string };
            }>;
          };
        };
        return w.S137_INSTRUMENT.read();
      });
      if (fromPage.state.word !== word) {
        throw new Error(`the page holds ${JSON.stringify(fromPage.state.word)} after typing ${JSON.stringify(word)}`);
      }

      const dir = join(root, `p${String(index).padStart(2, "0")}`);
      mkdirSync(dir, { recursive: true });
      execFileSync(
        TSX,
        [CLI, "ring", word, "--out", dir, ...(square === "" ? [] : ["--square", square])],
        { cwd: REPO, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
      );
      const names = readdirSync(dir).sort();
      const stems = new Set(names.map((n) => n.slice(0, n.indexOf("."))));
      if (stems.size !== 1) throw new Error(`s137 ring wrote ${stems.size} stems for ${JSON.stringify(word)}`);
      const stem = [...stems][0]!;
      const cli: Record<string, string> = {};
      for (const name of names) cli[name.slice(stem.length + 1)] = readFileSync(join(dir, name), "utf8");

      const compare: readonly (readonly [string, string])[] = [
        ["sheet.svg", fromPage.sheetSvg],
        ["legend.txt", fromPage.legend],
        ["census.txt", fromPage.census],
        ["receipt.txt", fromPage.receipt],
      ];
      const expectDiff = CROSS_RUNTIME_DIVERGENT_MODES.includes(fromPage.mode);
      for (const [suffix, pageText] of compare) {
        const cliText = cli[suffix];
        if (cliText === undefined) throw new Error(`s137 ring wrote no ${suffix} for ${JSON.stringify(word)}`);
        const same = cliText === pageText;
        const allowed = expectDiff && FIELD_TOUCHES.includes(suffix);
        const verdict: Verdict = same
          ? allowed ? "UNEXPECTED-SAME" : "same"
          : allowed ? "declared-diff" : "UNEXPECTED-DIFF";
        rows.push({
          word,
          square: square === "" ? "(concept)" : square,
          mode: fromPage.mode,
          artifact: suffix,
          cliSha: sha256Hex(cliText),
          pageSha: sha256Hex(pageText),
          same,
          verdict,
        });
      }
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
    await context.close();
  }
  if (errors.length > 0) throw new Error(`page errors during parity: ${errors.join("; ")}`);
  return rows;
}

/* ── the declared divergence, re-measured every verify ────────────────────── */

type CrossRow = Readonly<{ mode: string; total: number; differing: number; words: readonly string[] }>;

/**
 * Compile every word in `CROSS_WORDS` in every mode, in both runtimes, and
 * compare drawing numbers.
 *
 * The drawing number is SHA-256 of the figure markup, so two plates share one
 * only if every path in both is the same string. It is the cheapest complete
 * comparison available and it is the one the plate itself prints.
 *
 * Both sides are given the mode EXPLICITLY rather than letting the concept
 * choose, so every mode is exercised on every word — including the ones no
 * concept requests. A cross driven by concepts would never test `minimal`.
 */
async function crossRuntime(browser: Browser): Promise<Readonly<{ rows: readonly CrossRow[] }>> {
  const context = await browser.newContext({ viewport: { width: 1200, height: 800 } });
  await context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(pathToFileURL(PAGE_FILE).href, { waitUntil: "load" });
  await page.waitForFunction(() => {
    const w = window as unknown as { S137_INSTRUMENT?: { read: () => { sheetId: string | null } } };
    return w.S137_INSTRUMENT !== undefined && w.S137_INSTRUMENT.read().sheetId !== null;
  }, undefined, { timeout: 30_000 });

  const vocabulary = WORD_CORRESPONDENCE.map((w) => w.word);
  const modes: readonly string[] = [...MODE_IDS, "none"];
  const tally = new Map<string, { total: number; differing: number; words: string[] }>();
  for (const mode of modes) tally.set(mode, { total: 0, differing: 0, words: [] });

  try {
    for (const word of CROSS_WORDS) {
      const fromPage = await page.evaluate(
        ([w, vocab, list]: readonly [string, readonly string[], readonly string[]]) => {
          const S = (window as unknown as {
            S137: { ring: (word: string, options: Record<string, unknown>) => { sheetId: string } };
          }).S137;
          const ids: Record<string, string> = {};
          for (const m of list) ids[m] = S.ring(w, { vocabulary: vocab, trace: "AGRIPPA", mode: m }).sheetId;
          return ids;
        },
        [word, vocabulary, modes] as const,
      );
      for (const mode of modes) {
        const here = ring(word, { vocabulary, trace: "AGRIPPA", mode: mode as ModeId | "none" }).sheetId;
        const rec = tally.get(mode)!;
        rec.total += 1;
        if (here !== fromPage[mode]) rec.words.push(word === "" ? "(empty)" : word.slice(0, 14));
        if (here !== fromPage[mode]) rec.differing += 1;
      }
    }
  } finally {
    await context.close();
  }
  if (errors.length > 0) throw new Error(`page errors during the cross: ${errors.join("; ")}`);
  return {
    rows: modes.map((mode) => {
      const rec = tally.get(mode)!;
      return { mode, total: rec.total, differing: rec.differing, words: rec.words };
    }),
  };
}

/* ── main ─────────────────────────────────────────────────────────────────── */

const out = (s: string): void => void process.stdout.write(s);

async function main(): Promise<void> {
  const cipherLive = cipherDrivesThePlate();
  out(`ring() ${cipherLive ? "ACCEPTS" : "does not accept"} a cipher option — the CIPHER knob ${cipherLive ? "moves the plate" : "drives the bench"}\n\n`);

  out("pre-flight experiments\n");
  for (const a of assertions()) {
    out(`  ok  ${a.name.padEnd(26)} ${String(a.checked).padStart(6)} cases   ${a.detail}\n`);
  }

  const { module: esbuild, path: esbuildPath, via } = loadEsbuild();
  out(`\nesbuild ${esbuild.version} via ${via}\n        ${relative(REPO, esbuildPath)}\n`);
  const built = await bundle(esbuild);
  out(`bundle  ${String(built.text.length).padStart(7)} bytes  sha256 ${built.sha256.slice(0, 16)}  (identical across two builds; no <script or </script)\n`);

  const chips = chipWords();
  const inputs: PageInputs = {
    bundle: built.text,
    bundleSha: built.sha256,
    esbuildVersion: esbuild.version,
    chips,
    cipherLive,
  };
  const html = pageHtml(inputs);
  const htmlAgain = pageHtml(inputs);
  if (html !== htmlAgain) throw new Error("pageHtml is not a pure function of its inputs.");
  assertInlinable(PAGE_JS, "the page's own script");

  const scripts = (html.match(/<script/gu) ?? []).length;
  const closers = (html.match(/<\/script>/gu) ?? []).length;
  if (scripts !== 3 || closers !== 3) {
    throw new Error(`expected exactly 3 script elements; the document has ${scripts} openers and ${closers} closers`);
  }

  if (CHECK_ONLY) {
    let onDisk: string;
    try {
      onDisk = readFileSync(PAGE_FILE, "utf8");
    } catch {
      out(`\n--check: ${relative(REPO, PAGE_FILE)} does not exist yet.\n`);
      process.exitCode = 1;
      return;
    }
    const same = onDisk === html;
    out(`\n--check: regenerated page is ${same ? "BYTE-IDENTICAL" : "DIFFERENT"} to the file on disk\n`);
    out(`         on disk ${sha256Hex(onDisk)}\n         rebuilt ${sha256Hex(html)}\n`);
    if (!same) process.exitCode = 1;
    return;
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(PAGE_FILE, html, "utf8");
  out(`\nwrote   ${String(Buffer.byteLength(html, "utf8")).padStart(7)} bytes  ${relative(REPO, PAGE_FILE)}  sha256 ${sha256Hex(html).slice(0, 16)}\n`);
  out(`        ${chips.length} example words: ${chips.join(" ")}\n`);

  const report: Record<string, unknown> = {
    tool: "scripts/build-instrument.ts",
    page: relative(REPO, PAGE_FILE),
    pageBytes: Buffer.byteLength(html, "utf8"),
    pageSha256: sha256Hex(html),
    bundle: { entry: relative(REPO, ENTRY), bytes: built.text.length, sha256: built.sha256, esbuild: esbuild.version, via },
    cipherDrivesThePlate: cipherLive,
    crossRuntimeDivergentModes: CROSS_RUNTIME_DIVERGENT_MODES,
    engine: { correspondence: CORRESPONDENCE_VERSION, geometry: GEOMETRY_V2_VERSION },
    controls: { squares: SQUARE_IDS, ciphers: CIPHER_IDS, traces: TRACE_IDS, modes: MODE_IDS },
    chips,
    assertions: assertions().map((a) => ({ name: a.name, checked: a.checked, detail: a.detail })),
  };

  if (!DO_VERIFY) {
    writeFileSync(join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    out("\n--verify was not passed: the page is built and asserted, but no browser has opened it.\n");
    return;
  }

  const verifyDir = join(OUT_DIR, "verify");
  mkdirSync(verifyDir, { recursive: true });

  const browser = await chromium.launch();
  let failed = 0;
  try {
    const inspections: Inspection[] = [];
    for (const viewport of VIEWPORTS) {
      const result = await inspect(browser, viewport, verifyDir);
      inspections.push(result);
      out(`\n${viewport.name} ${viewport.width}x${viewport.height}\n`);
      out(`  console            ${result.notes.length === 0 ? "silent (0 messages, 0 page errors, 0 failed requests)" : `${result.notes.length} MESSAGE(S)`}\n`);
      for (const n of result.notes) out(`      ${n.channel}  ${n.text}  ${n.where}\n`);
      out(`  overflow           widest ${result.overflow.widest.toFixed(1)} of ${result.overflow.limit} · documentScrollWidth ${result.overflow.documentScrollWidth} · bodyScrollWidth ${result.overflow.bodyScrollWidth} · ${result.overflow.offenders.length} offender(s)\n`);
      for (const o of result.overflow.offenders) out(`      ${o.path}  [${o.left.toFixed(0)}..${o.right.toFixed(0)}]\n`);
      out(`  plate              ${result.text.svgs} svg · ${result.text.elements} elements checked for ${result.text.checked.join(", ")} · ${result.text.offenders.length} offender(s)\n`);
      for (const s of result.sweep) {
        out(`  ${s.control.padEnd(18)} ${s.changed ? "REDREW" : "no change"}  ${s.from} -> ${s.to}\n`);
      }
      out(`  download           ${result.download ?? "NONE"}\n`);
      out(`  screenshot         ${relative(REPO, result.screenshot)}\n`);
      for (const f of result.failures) out(`  FAIL  ${f}\n`);
      failed += result.failures.length;
    }

    const pairs: readonly (readonly [string, string])[] = [
      ["LUNAR", ""],
      ["DESCENT", ""],
      ["WAR", ""],
      ["QUANTUM", ""],
      ["SERPENT", "mars"],
      ["LUNAR", "venus"],
      ["", ""],
      ["  DESCENT  ", ""],
    ];
    /* ── the crop is a property of the sheet, not of the screen ──
       The FIGURE crop is computed by measuring the rendered plate and mapping
       back through the sheet's viewBox, so it must come out the same at every
       width. It did not: `width:100%` letterboxed the plate inside its element
       box on desktop and not on the phone, and the two viewports cropped windows
       85.9mm and 125.5mm wide out of the same drawing. Both passed the
       inside-the-sheet test on their own; only comparing them catches it. */
    const crops = inspections.map((i) => ({
      viewport: i.viewport.name,
      crop: i.sweep.find((sw) => sw.control === "view")?.to ?? "",
    }));
    const parsed = crops.map((c) => c.crop.trim().split(/\s+/u).map(Number));
    const spread = [0, 1, 2, 3].map((k) =>
      Math.max(...parsed.map((v) => v[k] ?? NaN)) - Math.min(...parsed.map((v) => v[k] ?? NaN)),
    );
    out(`\nfigure crop across viewports\n`);
    for (const c of crops) out(`  ${c.viewport.padEnd(9)} ${c.crop}\n`);
    const worst = Math.max(...spread);
    out(`  widest disagreement between viewports: ${worst.toFixed(4)} mm\n`);
    if (!(worst <= 0.5)) {
      out(`  FAIL  the crop differs by ${worst.toFixed(4)} mm between viewports; it is a property of the sheet and must not depend on the screen\n`);
      failed += 1;
    }
    report["figureCrop"] = { crops, worstDisagreementMm: worst };

    const rows = await parity(browser, pairs);
    const bad = rows.filter((r) => r.verdict === "UNEXPECTED-DIFF" || r.verdict === "UNEXPECTED-SAME");
    out(`\ndeterminism: the page's bytes vs the bytes s137 ring just wrote\n`);
    for (const r of rows) {
      out(`  ${r.verdict.padEnd(16)} ${JSON.stringify(r.word).padEnd(14)} ${r.square.padEnd(10)} ${r.mode.padEnd(12)} ${r.artifact.padEnd(11)} ${r.pageSha.slice(0, 16)}\n`);
    }
    out(`  ${rows.length} artifacts compared · ${rows.filter((r) => r.verdict === "same").length} identical · ` +
      `${rows.filter((r) => r.verdict === "declared-diff").length} differ as declared · ${bad.length} unexpected\n`);
    failed += bad.length;

    /* ── the declared divergence, re-measured ── */
    const measured = await crossRuntime(browser);
    out(`\ncross-runtime field parity — ${CROSS_WORDS.length} words x ${MODE_IDS.length + 1} modes, drawing numbers compared\n`);
    for (const row of measured.rows) {
      out(`  ${row.mode.padEnd(13)} ${String(row.differing).padStart(3)}/${row.total}  ${row.differing === 0 ? "identical" : "DIVERGES"}\n`);
    }
    const declared = [...CROSS_RUNTIME_DIVERGENT_MODES].sort().join(",");
    const observed = measured.rows.filter((r) => r.differing > 0).map((r) => r.mode).sort().join(",");
    if (declared !== observed) {
      out(`  FAIL  declared divergent modes [${declared}] but measured [${observed}]\n`);
      failed += 1;
    } else {
      out(`  the declared set [${declared === "" ? "none" : declared}] is exactly the measured set\n`);
    }
    report["crossRuntime"] = { words: CROSS_WORDS, declared: CROSS_RUNTIME_DIVERGENT_MODES, rows: measured.rows };

    report["verification"] = {
      viewports: inspections.map((i) => ({
        viewport: i.viewport,
        consoleMessages: i.notes,
        overflow: i.overflow,
        text: i.text,
        sweep: i.sweep,
        download: i.download,
        screenshot: relative(REPO, i.screenshot),
        failures: i.failures,
      })),
      parity: rows,
    };
  } finally {
    await browser.close();
  }

  writeFileSync(join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  out(`\nreport  ${relative(REPO, join(OUT_DIR, "report.json"))}\n`);
  if (failed > 0) {
    out(`\n${failed} FAILURE(S). The page is not verified.\n`);
    process.exitCode = 1;
    return;
  }
  out("\nAll checks passed.\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

/// <reference lib="dom" />
/**
 * Compile the spine into one self-contained browser bundle, and PROVE it is the
 * same engine.
 *
 * The instrument the owner has asked for twice needs a page that can run `ring()`
 * on a word he types. There are two ways to get one. The wrong way is to port the
 * walk into the page; that is how this repository ended up with three ciphers and
 * two answers to what a word means, and the surviving one only survived because
 * the other two were deleted rather than deprecated. The right way is to hand a
 * bundler the real packages and let it emit them. This script is the right way,
 * plus the evidence that it worked.
 *
 * WHAT IT EMITS (default `artifacts/browser/`):
 *   spine.iife.js      the bundle, readable — for a developer with a debugger
 *   spine.min.iife.js  the same graph minified — for inlining into one HTML file
 *   selftest.html      the EXACT page the parity check loaded for the minified
 *                      bundle, byte-for-byte, so a human can open it and see the
 *                      same digests without trusting this script
 *   report.json        sizes, hashes, and every parity comparison, word by word
 *
 * Both bundles define `S137` and also assign it to `globalThis`, so the same file
 * works pasted into a classic `<script>` and into `<script type="module">` (where
 * a bare `var` would stay module-scoped and the page would find nothing).
 *
 * WHAT IT PROVES, in this order, each by exit code:
 *
 *   1. DETERMINISM OF THE BUILD. Every variant is built twice in one process and
 *      the two outputs are compared byte-for-byte. Running this script twice from
 *      a shell and comparing the emitted files is the wider version of the same
 *      check and is the one the done bar names; both are cheap, so both are here.
 *
 *   2. INLINABILITY. The bundle is scanned for `</script` and `<script` before it
 *      is ever written. `<!--` is NOT banned: it occurs (twice, at the time of
 *      writing — the build counts them and `report.json` carries the number)
 *      inside the string literals that delimit `<g id="figure">` in an emitted
 *      plate, and in script data it opens an escaped state that `</script>` still
 *      closes. That last part is a prediction about an HTML tokenizer, so it is
 *      not asserted: the parity check below loads the bundle by INLINING it into
 *      a document, not through `addScriptTag`, so a tokenizer that disagreed
 *      would fail the run rather than pass it quietly.
 *
 *   3. PARITY WITH THE CLI. `s137 ring <WORD>` is run as a subprocess for each
 *      case in `PARITY_CASES` — a word and optionally a cipher — writing its artifacts
 *      to a temp directory. The same
 *      words are run through `ring()` inside headless Chromium. Everything the CLI
 *      wrote is compared as BYTES (`Buffer.compare` over the utf8 encodings), not
 *      as strings that looked similar. House rules 1 and 2 live or die here.
 *
 *      The set of artifacts is DISCOVERED, not listed: whatever files the CLI put
 *      on disk are what gets compared, and the page hands back every string field
 *      `ring()` returned rather than four named ones. That is deliberate — the ring
 *      is growing a fifth text (`modeCensus`) as this is written, and a check with
 *      four filenames baked into it would have gone on reporting a clean pass while
 *      covering four fifths of the artifact. A file whose property cannot be found
 *      on the engine's result is a hard error; a text the engine returns and the CLI
 *      does not write yet is reported and not compared.
 *
 *   4. NO NETWORK AT RUNTIME. Every request the page attempts is recorded and
 *      aborted. The claim is not "we saw none" — a blind recorder sees none too —
 *      so the self-test runs the same harness on a page carrying one external
 *      image and requires the recorder to catch it.
 *
 *   5. HOUSE RULE 4 IN THE BROWSER. The sheet the page produced is checked for
 *      `<text>`, `<tspan>`, `<textPath>` and `<foreignObject>`. `ring()` already
 *      asserts this in Node; asserting it again on the browser's own output costs
 *      nothing and covers the case where a bundler transform mangled the numeral
 *      table into a font fallback.
 *
 *   6. THE CHECKS CAN FAIL. Steps 3, 4 and 5 are each run once against planted
 *      evidence — a flipped byte, a page that does fetch, a sheet with `<text>`
 *      spliced in — and each must report a failure. `scripts/verify-ring-page.ts`
 *      established this house habit after a verification that could not fail sat
 *      in the tree for a week. `--no-self-test` skips it; nothing else should.
 *
 *   7. WHERE "SAME ENGINE" STOPS MEANING "SAME BYTES". `Math.sin` and `Math.cos`
 *      are measured in both runtimes on 50,000 seeded arguments before anything
 *      is compared. Node and Chromium are different V8 builds and their
 *      transcendental functions are not bit-stable across versions: a few percent
 *      of results differ, always by exactly one ULP. That is absorbed by any
 *      coordinate rounded before it is drawn, and amplified without bound by any
 *      value fed back into its own next iteration. The numbers go in
 *      `report.json` on every run, so a parity failure on one word and not on ten
 *      others can be diagnosed instead of guessed at. See `probeCrossRuntimeMath`.
 *
 *   8. THAT THE RUN SAW ONE TREE. More than one agent works this repository. The
 *      source files esbuild read are fingerprinted before the CLI is spawned and
 *      again after the last comparison; a run whose tree moved underneath it exits
 *      INCONCLUSIVE rather than reporting a parity verdict about two different
 *      programs. This has fired for real twice. See `fingerprintInputs`.
 *
 * AND ONE MEASUREMENT, not a claim: zod is roughly a third of the bundle and no
 * code path reachable from the entry calls it. It arrives because
 * `packages/ring/src/index.ts` imports `sha256Hex` from the `@studio137/plate-core`
 * BARREL, the barrel re-exports `request.ts`, and `request.ts` builds zod schemas
 * in top-level `const` initialisers, which a bundler cannot prove side-effect-free.
 * Step 7 builds a third variant with the barrel aliased to the same barrel minus
 * `./request.js`, runs the FULL parity check against it, and reports the measured
 * delta. Nothing in the spine graph imports a single name from `request.ts` —
 * checked by grep, and then checked properly by the parity run. That variant is
 * measured and thrown away; the shipped bundles are built from the tree as it is.
 *
 * Usage:
 *   pnpm exec tsx scripts/build-browser-bundle.ts
 *   pnpm exec tsx scripts/build-browser-bundle.ts --out artifacts/browser
 *   pnpm exec tsx scripts/build-browser-bundle.ts --no-verify        # build only
 *   pnpm exec tsx scripts/build-browser-bundle.ts --no-self-test     # skip step 6
 *   pnpm exec tsx scripts/build-browser-bundle.ts --no-trim-measurement
 *   pnpm exec tsx scripts/build-browser-bundle.ts --keep              # leave the CLI's
 *                                                                    # temp artifacts on disk
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { chromium, type Browser, type Page } from "playwright";

import { dcos, dsin } from "@studio137/mode-engine";
import { sha256Hex } from "@studio137/plate-core";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "..");
const ENTRY = join(REPO, "packages", "spine-browser", "src", "index.ts");
const CLI = join(REPO, "apps", "cli", "src", "index.ts");
const TSX = join(REPO, "node_modules", ".bin", "tsx");

/** The name the bundle publishes. One word, so a page can say `S137.ring(w)`. */
const GLOBAL = "S137";

/* ── the parity set ────────────────────────────────────────────────────────
   Eleven words, chosen so that a pass means something.

   Four of them have letters and take four different routes through the ride:
   `DESCENT` is in the concept table and is walked on saturn (3x3); `AWAKENING` is
   a second table word on a different square; `QZXJVW` has letters and no concept,
   so it must fall to the house square and still read back, which is the half of
   house rule 3 that a table lookup could quietly break; and `" DESCENT "` is the
   same seven letters with a space each side, the exact input hygiene that
   `packages/ring/src/index.ts` records as having moved 156 of the 170 table words
   onto the wrong square once already.

   `<script>alert('xss')</script>` is hostile at two levels at once. It is a word
   with letters, so it draws a real figure; and it is the string that breaks a
   generated HTML page, because this script embeds the word list inside an inline
   `<script>` block and a raw `</script>` there ends the element early. It did break
   it — see `jsonForInlineScript` for the failure that was measured, and for the one
   line that fixes it. It stays in the set as that line's regression test.

   `../../etc/passwd` is hostile in a different way and is NOT a degenerate input:
   station 1 keeps `ETCPASSWD` out of it, so it draws a figure of its own. What it tests is
   that a path separator reaches `ring()` unharmed and that nothing downstream builds
   a filename by concatenation.

   The remaining four have nothing to resolve at all: an empty string, three
   codepoints outside the BMP, five CJK ideographs, and ten ASCII digits that look
   like the digit string the walk itself produces. Measured, from `report.json`:
   those four produce ONE drawing between them (sheet `b4fd5189032fce36`), because
   they hold the same empty letter sequence. That is correct and is worth saying so
   nobody counts them as four independent cases. What they test is that nothing
   refuses them and that the browser still agrees with the CLI on all four artifacts.

   The last word is a 335-character paste, because a word processor will eventually
   produce one.

   Also measured, and the reason `" DESCENT "` earns a slot: its four artifacts are
   byte-identical to `DESCENT`'s — same sheet, same legend, same census, same
   receipt — while the CLI files them under a different stem, because the stem
   digests the exact input and the artifacts are of the letters. Eleven words, seven
   distinct drawings.

   THE LAST TWO ARE THE SAME WORD UNDER THE OTHER TWO CIPHERS, and they are here
   because a knob this check does not turn is a knob whose parity nobody has
   measured. `ring()` took no cipher until the instrument grew a CIPHER control
   that did nothing; the flag exists now on both sides, and a case set of eleven
   PYTH words would have gone on reporting a clean pass over one third of what
   the instrument can ask for. NAEQ and HEB are not cosmetic here — they change
   which cell every letter lands on, so they change the walk, the envelope
   multiplier, the mode seed and the field. */
type ParityCase = Readonly<{ word: string; cipher?: string }>;

const PARITY_CASES: readonly ParityCase[] = Object.freeze(
  [
    { word: "DESCENT" },
    { word: "AWAKENING" },
    { word: "QZXJVW" },
    { word: " DESCENT " },
    { word: "<script>alert('xss')</script>" },
    { word: "" },
    { word: "../../etc/passwd" },
    { word: "\u{1F642}\u{1F71B}\u{1D50A}" },
    { word: "火水木金土" },
    { word: "0123456789" },
    { word: "the unbearable weight of a paste that came out of a word processor ".repeat(5) },
    { word: "DESCENT", cipher: "NAEQ" },
    { word: "AWAKENING", cipher: "HEB" },
  ].map((c) => Object.freeze(c)),
);

/** How a case is named in output and in `report.json`. One word, one label. */
const labelOf = (c: ParityCase): string =>
  c.cipher === undefined ? c.word : `${c.word} [${c.cipher}]`;

/* ── argv ─────────────────────────────────────────────────────────────────── */

const argv = process.argv.slice(2);
const flag = (name: string): boolean => argv.includes(`--${name}`);
const option = (name: string, fallback: string): string => {
  const index = argv.indexOf(`--${name}`);
  const value = index >= 0 ? argv[index + 1] : undefined;
  return value === undefined || value.startsWith("--") ? fallback : value;
};

const OUT_DIR = resolve(REPO, option("out", join("artifacts", "browser")));
const DO_VERIFY = !flag("no-verify");
const DO_SELF_TEST = !flag("no-self-test");
const DO_TRIM = !flag("no-trim-measurement");

/* ── esbuild, found without a hard-coded path ─────────────────────────────── */

type OutputFile = Readonly<{ path: string; contents: Uint8Array; text: string }>;
type Metafile = Readonly<{
  outputs: Readonly<Record<string, Readonly<{ bytes: number; inputs: Readonly<Record<string, Readonly<{ bytesInOutput: number }>>> }>>>;
}>;
type BuildResult = Readonly<{
  outputFiles?: readonly OutputFile[];
  metafile?: Metafile;
  errors: readonly Readonly<{ text: string }>[];
  warnings: readonly Readonly<{ text: string }>[];
}>;
type Esbuild = Readonly<{ version: string; build(options: Record<string, unknown>): Promise<BuildResult> }>;

/**
 * Which esbuild, decided here rather than by how the script was launched.
 *
 * There are two in the store and the lockfile pins both: `tsx@4.23.12` carries
 * esbuild 0.28.2 and `vite@5.4.21`, underneath vitest, carries 0.21.5. Neither is
 * a direct dependency, and a bare `require("esbuild")` picks between them by
 * accident — `pnpm exec` puts pnpm's hoisted `node_modules/.pnpm/node_modules` on
 * NODE_PATH and finds 0.28.2, while the same file run through
 * `node_modules/.bin/tsx` directly does not and finds nothing. Two launchers, two
 * compilers, two different bundles from one source tree: determinism lost to an
 * environment variable, silently.
 *
 * So the order below is explicit and each step is anchored on a package that is a
 * REAL root devDependency, reachable from `package.json` with no NODE_PATH and no
 * cwd. `tsx` is first because tsx is what runs this script; if it is missing,
 * nothing here ran at all. `require("esbuild")` is last, not first, precisely
 * because it is the one whose answer depends on the launcher.
 *
 * Measured, not assumed: the emitted bundles are byte-identical under
 * `pnpm exec tsx …` and under `node_modules/.bin/tsx …`, which is the check that
 * this ordering is doing its job. The version and the resolved path go into
 * `report.json`, because "same bytes" is a claim about a fixed compiler and a
 * reader is entitled to know which one produced the file in front of them.
 */
function loadEsbuild(): Readonly<{ module: Esbuild; path: string; via: string }> {
  const attempts: string[] = [];
  const root = createRequire(join(REPO, "package.json"));

  const routes: readonly (readonly [string, () => string])[] = [
    ["tsx -> esbuild", () => createRequire(root.resolve("tsx")).resolve("esbuild")],
    ["vitest -> vite -> esbuild", () => createRequire(createRequire(root.resolve("vitest")).resolve("vite")).resolve("esbuild")],
    ["esbuild (bare; NODE_PATH-dependent)", () => root.resolve("esbuild")],
  ];

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

/* ── the build ────────────────────────────────────────────────────────────── */

type Variant = Readonly<{
  id: string;
  file: string;
  minify: boolean;
  /** Bare specifiers to redirect. Empty for everything that is shipped. */
  alias: Readonly<Record<string, string>>;
}>;

/**
 * A header that says what the file is and carries no timestamp, no commit and no
 * machine name. Anything that varied between two runs would put a byte of build
 * environment inside an artifact whose whole point is that it does not have one.
 */
const BANNER = [
  "/* @studio137/spine-browser — the compiler spine, bundled for a browser.",
  "   Generated by scripts/build-browser-bundle.ts. Do not edit: edit the packages.",
  `   Publishes globalThis.${GLOBAL}. No imports, no fetches, no network at runtime. */`,
].join("\n");

/**
 * `format: "iife"` gives `var S137 = (() => {...})()`, which is a global only at
 * the top level of a CLASSIC script. Inside `<script type="module">` that `var` is
 * module-scoped and a page looking for `window.S137` finds nothing — a failure with
 * no error message, which is the worst kind. The footer costs one line and removes
 * the distinction.
 */
const FOOTER = `globalThis.${GLOBAL} = ${GLOBAL};`;

async function buildOnce(esbuild: Esbuild, variant: Variant): Promise<Readonly<{ text: string; bytes: Buffer; metafile: Metafile }>> {
  const result = await esbuild.build({
    entryPoints: [ENTRY],
    bundle: true,
    format: "iife",
    globalName: GLOBAL,
    platform: "browser",
    target: ["es2022"],
    charset: "utf8",
    legalComments: "none",
    minify: variant.minify,
    banner: { js: BANNER },
    footer: { js: FOOTER },
    ...(Object.keys(variant.alias).length > 0 ? { alias: variant.alias } : {}),
    write: false,
    metafile: true,
    absWorkingDir: REPO,
  });

  if (result.errors.length > 0) {
    throw new Error(`esbuild reported ${result.errors.length} error(s):\n${result.errors.map((e) => `  ${e.text}`).join("\n")}`);
  }
  const output = result.outputFiles?.[0];
  const metafile = result.metafile;
  if (output === undefined || metafile === undefined) {
    throw new Error("esbuild produced no output file; expected exactly one.");
  }
  if (result.outputFiles !== undefined && result.outputFiles.length !== 1) {
    throw new Error(`esbuild produced ${result.outputFiles.length} files; a bundle that is inlined into one page must be one file.`);
  }
  return { text: output.text, bytes: Buffer.from(output.contents), metafile };
}

/**
 * Build twice and require the two to be identical.
 *
 * This is not ceremony. A bundler that walked a directory, or hashed a path, or
 * ordered a set by insertion into a shared cache, would produce two different
 * files here and every downstream claim about "same word, same bytes" would be
 * resting on a coincidence.
 */
async function buildDeterministic(esbuild: Esbuild, variant: Variant): Promise<Readonly<{ text: string; bytes: Buffer; metafile: Metafile; sha256: string }>> {
  const first = await buildOnce(esbuild, variant);
  const second = await buildOnce(esbuild, variant);
  if (Buffer.compare(first.bytes, second.bytes) !== 0) {
    throw new Error(
      `Variant "${variant.id}" is not deterministic: two builds in one process differ ` +
        `(${first.bytes.length} vs ${second.bytes.length} bytes, ` +
        `${sha256Hex(first.text).slice(0, 16)} vs ${sha256Hex(second.text).slice(0, 16)}).`,
    );
  }
  return { ...first, sha256: sha256Hex(first.text) };
}

/**
 * The two sequences that would end an inline `<script>` early, checked BEFORE the
 * file is written rather than after a page mysteriously stops working.
 *
 * `<!--` is deliberately NOT in this list. It appears twice today, inside the
 * string literals that delimit `<g id="figure">` in an emitted plate, and in
 * script data it opens an escaped state that `</script>` still closes — the
 * dangerous pair is `<!--` followed by `<script`, and `<script` is banned here.
 * That is a claim about a tokenizer, so the parity check inlines the bundle into a
 * real document instead of taking it on trust.
 */
function assertInlinable(text: string, id: string): number {
  for (const needle of ["</script", "<script"]) {
    const at = text.toLowerCase().indexOf(needle);
    if (at >= 0) {
      throw new Error(
        `Variant "${id}" contains ${JSON.stringify(needle)} at offset ${at}, which ends or opens a ` +
          `script element when this file is inlined into HTML:\n  ...${text.slice(Math.max(0, at - 60), at + 60)}...\n` +
          `Escape it at the source, or stop inlining and load the bundle from a file.`,
      );
    }
  }
  return text.split("<!--").length - 1;
}


/* ── the one thing "same engine" cannot promise ───────────────────────────── */

/**
 * WHICH ARITHMETIC AGREES BETWEEN NODE AND CHROMIUM, MEASURED RATHER THAN
 * ASSUMED — and the standing proof that `packages/mode-engine/src/trig.ts` earns
 * its place.
 *
 * Both runtimes are V8, but they are DIFFERENT V8s — Node 22 and Chromium 141
 * here — and ECMA-262 §21.3.2 lets an implementation approximate the
 * transcendental functions however it likes. It shows. On 50,000 arguments drawn
 * from one seeded stream, spanning the whole range the ten fields actually reach
 * (|x| up to 1024; the largest any field produces is 1011.91), a few percent of
 * `Math.sin` and `Math.cos` results differ, always by exactly 1 unit in the last
 * place.
 *
 * One ULP is nothing until something amplifies it. A coordinate that gets
 * `toFixed(4)` before it reaches a path absorbs it completely. A value fed back
 * into its own next iteration does not: `packages/mode-engine`'s `attractor` mode
 * iterates the de Jong map `x' = sin(ay) − cos(bx)` up to 12,600 times, which is
 * chaotic, and one ULP at iteration 3 is a different drawing by iteration 60. That
 * is not a hypothetical either — it is the failure this probe was written to
 * explain, and `DESCENT` failed 4 of 44 comparisons on it until `trig.ts` landed.
 *
 * So the probe measures FIVE things on the same arguments, in both runtimes:
 *
 *   · `Math.sin`, `Math.cos`   — the two known to disagree; the control.
 *   · `dsin`, `dcos`           — mode-engine's replacements, built from `+ − × ÷`
 *                              alone. `deterministicTrigAgrees` is the whole
 *                              claim of that file, and a run where it is false
 *                              with `sinDisagreements` non-zero says the fix has
 *                              stopped working, in one boolean.
 *   · `Math.sqrt`, `Math.atan2`, `Math.hypot`
 *                            — the other `Math` calls this spine makes. IEEE-754
 *                              requires `sqrt` to be correctly rounded and
 *                              ECMA-262 does not; `atan2` and `hypot` are
 *                              approximated outright. All three are measured so
 *                              "the residual is sin and cos" is a reading off
 *                              this table rather than a guess about V8.
 *
 * It runs on every verification, passing or failing, and its numbers go into
 * `report.json`. When parity breaks on one word and holds on ten, this is the
 * first thing to read.
 *
 * ONE source string, run in both runtimes — `new Function` here, `page.evaluate`
 * there. Two transcriptions of "the same probe" would be the same mistake this
 * whole script exists to rule out. Node reaches `dsin` through the SOURCE (this
 * script imports it, and so does the CLI); the page reaches it through the
 * BUNDLE. That asymmetry is deliberate: it is the pair the parity check is about.
 */
const MATH_PROBE_SOURCE = `(() => {
  function m32(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
  const rng = m32(0x5137);
  // \`dsin\` reaches Node through this script's own import and the page through the
  // bundle. Absent in either, the probe says so rather than silently comparing
  // two empty arrays and reporting agreement.
  const M = (globalThis.${GLOBAL} && globalThis.${GLOBAL}.modes) || null;
  const xs = [], ss = [], cs = [], ds = [], dc = [], qs = [], ts = [], hs = [];
  for (let i = 0; i < 50000; i += 1) {
    // The full range the ten fields reach. \`phyllotaxis\` hands \`dsin\` 1011.91 on
    // \`divine\`/saturn, so a probe capped at 6 would have measured a domain the
    // engine leaves on its second mode.
    const x = -1024 + rng() * 2048;
    xs.push(x);
    ss.push(Math.sin(x));
    cs.push(Math.cos(x));
    ds.push(M ? M.dsin(x) : null);
    dc.push(M ? M.dcos(x) : null);
    // Positive and bounded, which is how this spine calls them.
    qs.push(Math.sqrt(Math.abs(x)));
    ts.push(Math.atan2(x, 1 + Math.abs(x) / 7));
    hs.push(Math.hypot(x, x / 3));
  }
  return { xs: xs, ss: ss, cs: cs, ds: ds, dc: dc, qs: qs, ts: ts, hs: hs, deterministic: M !== null };
})()`;

type MathSamples = Readonly<{
  xs: readonly number[];
  ss: readonly number[];
  cs: readonly number[];
  ds: readonly (number | null)[];
  dc: readonly (number | null)[];
  qs: readonly number[];
  ts: readonly number[];
  hs: readonly number[];
  deterministic: boolean;
}>;
type MathProbe = Readonly<{
  samples: number;
  /** Sampling range, so a later reader can tell whether it covered their mode. */
  argumentRange: readonly [number, number];
  argumentsAgree: boolean;
  sinDisagreements: number;
  cosDisagreements: number;
  sqrtDisagreements: number;
  atan2Disagreements: number;
  hypotDisagreements: number;
  /**
   * `dsin`/`dcos` were reachable in BOTH runtimes and every one of the 50,000
   * pairs was bit-identical. False means either the pair was missing somewhere
   * (see `deterministicTrigReachable`) or it has stopped being deterministic —
   * the two are distinguished so a missing export cannot read as a pass.
   */
  deterministicTrigAgrees: boolean;
  deterministicTrigReachable: boolean;
  deterministicTrigDisagreements: number;
  worstUlp: number;
  note: string;
}>;

/** Distance in representable doubles. 1 means "adjacent", which is all we see. */
function ulpDistance(a: number, b: number): number {
  const view = new Float64Array([a, b]);
  const bits = new BigInt64Array(view.buffer);
  const delta = (bits[0] ?? 0n) - (bits[1] ?? 0n);
  return Number(delta < 0n ? -delta : delta);
}


/** Which side of the probe lost sight of `dsin`, for an error worth reading. */
function whichRuntimeLostTrig(math: MathProbe): string {
  return math.deterministicTrigReachable ? "neither runtime" : "at least one of Node (source) and Chromium (bundle)";
}

async function probeCrossRuntimeMath(browser: Browser, bundle: string): Promise<MathProbe> {
  // One probe, two runtimes, and the two runtimes want it delivered differently:
  // `page.evaluate` takes an EXPRESSION, `new Function` takes a BODY. The
  // expression is the shared thing; only the four characters that turn it into a
  // body differ, which is as close to one source as the two APIs allow.
  //
  // The Node side reaches `dsin` through this script's own import of the SOURCE,
  // which is what `s137 ring` runs; the page reaches it through the BUNDLE, which
  // is what the instrument runs. Installing it on `globalThis` under the same
  // name the bundle uses lets one probe string find it on both sides.
  const previous = (globalThis as Record<string, unknown>)[GLOBAL];
  (globalThis as Record<string, unknown>)[GLOBAL] = { modes: { dsin, dcos } };
  let here: MathSamples;
  try {
    here = (Function(`return ${MATH_PROBE_SOURCE}`) as () => MathSamples)();
  } finally {
    if (previous === undefined) delete (globalThis as Record<string, unknown>)[GLOBAL];
    else (globalThis as Record<string, unknown>)[GLOBAL] = previous;
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  // The bundle is inlined so the page's `dsin` is the COMPILED one. Loading it
  // any other way would measure the source twice and prove nothing about esbuild.
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><script>${bundle}</script>`,
    { waitUntil: "load" },
  );
  const there = (await page.evaluate(MATH_PROBE_SOURCE)) as MathSamples;
  await context.close();

  let argumentsAgree = true;
  let sinDisagreements = 0;
  let cosDisagreements = 0;
  let sqrtDisagreements = 0;
  let atan2Disagreements = 0;
  let hypotDisagreements = 0;
  let deterministicTrigDisagreements = 0;
  let worstUlp = 0;
  const count = (a: number, b: number): boolean => {
    if (a === b) return false;
    worstUlp = Math.max(worstUlp, ulpDistance(a, b));
    return true;
  };
  for (const [index, x] of here.xs.entries()) {
    if (there.xs[index] !== x) argumentsAgree = false;
    if (count(here.ss[index] ?? 0, there.ss[index] ?? 0)) sinDisagreements += 1;
    if (count(here.cs[index] ?? 0, there.cs[index] ?? 0)) cosDisagreements += 1;
    if (count(here.qs[index] ?? 0, there.qs[index] ?? 0)) sqrtDisagreements += 1;
    if (count(here.ts[index] ?? 0, there.ts[index] ?? 0)) atan2Disagreements += 1;
    if (count(here.hs[index] ?? 0, there.hs[index] ?? 0)) hypotDisagreements += 1;
    const [hd, td] = [here.ds[index] ?? null, there.ds[index] ?? null];
    const [hdc, tdc] = [here.dc[index] ?? null, there.dc[index] ?? null];
    if (hd !== null && td !== null && count(hd, td)) deterministicTrigDisagreements += 1;
    if (hdc !== null && tdc !== null && count(hdc, tdc)) deterministicTrigDisagreements += 1;
  }
  const reachable = here.deterministic && there.deterministic;
  return {
    samples: here.xs.length,
    argumentRange: [-1024, 1024],
    argumentsAgree,
    sinDisagreements,
    cosDisagreements,
    sqrtDisagreements,
    atan2Disagreements,
    hypotDisagreements,
    deterministicTrigAgrees: reachable && deterministicTrigDisagreements === 0,
    deterministicTrigReachable: reachable,
    deterministicTrigDisagreements,
    worstUlp,
    note:
      "Node and Chromium ship different V8 builds and ECMA-262 lets each approximate the transcendental " +
      "functions its own way. A disagreement is absorbed by any coordinate that is rounded before it is " +
      "drawn, and amplified without bound by any value fed back into its own next iteration — which is " +
      "why `attractor` goes through mode-engine's `dsin`/`dcos` instead. `deterministicTrigAgrees` is " +
      "the standing check on that: the same 50,000 arguments, both runtimes, every pair bit-identical.",
  };
}


/**
 * A fingerprint of every source file that went into the bundle.
 *
 * This tree has more than one agent in it. Twice while this script was being
 * written, a sibling saved `packages/mode-engine/src/fields.ts` BETWEEN the moment
 * the bundle was compiled and the moment `s137 ring` was spawned — and a
 * subprocess reads today's source while the bundle holds the source from ninety
 * seconds ago. The comparison then reports a parity failure that is nothing of the
 * sort: two different programs disagreeing about a drawing, exactly as they should.
 *
 * A wrong answer with a confident exit code is worse than no answer. So the inputs
 * esbuild actually read are fingerprinted by (path, size, mtime) before the CLI is
 * run and again after everything is compared, and a run whose tree moved underneath
 * it is reported INCONCLUSIVE and exits non-zero rather than passing or failing on
 * evidence it no longer has. Re-run on a quiet tree and the verdict means something.
 *
 * Measured, the same way everything else here is: with a run in flight, `touch`ing
 * `packages/spine-browser/src/index.ts` eight seconds in produces
 * `INCONCLUSIVE — not a pass and not a failure`, naming that one file, and exit 1.
 */
function fingerprintInputs(metafile: Metafile): Readonly<{ digest: string; files: readonly string[] }> {
  const output = Object.values(metafile.outputs)[0];
  const files = output === undefined ? [] : Object.keys(output.inputs).sort();
  const lines = files.map((file) => {
    try {
      const stat = statSync(join(REPO, file));
      return `${file}\u0000${stat.size}\u0000${stat.mtimeMs}`;
    } catch {
      return `${file}\u0000missing`;
    }
  });
  return { digest: sha256Hex(lines.join("\n")), files };
}

/** The files whose size or mtime moved between two fingerprints. */
function changedSince(files: readonly string[], before: string): readonly string[] {
  return files.filter((file) => {
    try {
      const stat = statSync(join(REPO, file));
      return !before.includes(`${file}\u0000${stat.size}\u0000${stat.mtimeMs}`);
    } catch {
      return true;
    }
  });
}

/* ── the page ─────────────────────────────────────────────────────────────── */

/**
 * The document the check loads: the bundle inlined, nothing fetched, nothing
 * imported. The display script at the bottom is for a human who opens
 * `selftest.html` by hand; the machine check reads `globalThis.S137` directly
 * through `page.evaluate` and does not depend on it.
 */
/**
 * JSON for a value that is about to be pasted between `<script>` and `</script>`.
 *
 * `JSON.stringify(["<script>alert(1)</script>"])` is valid JSON and valid
 * JavaScript and a broken HTML document: the HTML tokenizer sees the `</script>`
 * inside the string literal and closes the element there, leaving the rest of the
 * program as body text. Escaping every `<` as `\u003c` produces a string literal
 * with the identical value and no `<` for the tokenizer to find. `JSON.parse` is
 * not involved, so the escape survives as source and costs nothing.
 *
 * This is not hypothetical, and not a prediction either — it has been run. With
 * this function replaced by a bare `JSON.stringify`, the parity check fails on the
 * readable variant before it compares anything, with
 * `Failed to execute 'write' on 'Document': Invalid or unexpected token`. That is
 * the whole reason `<script>alert('xss')</script>` is in the parity set: it is the
 * regression test for this line.
 */
function jsonForInlineScript(value: unknown): string {
  return JSON.stringify(value).replace(/</gu, "\\u003c");
}

function pageHtml(bundle: string, cases: readonly ParityCase[]): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8">',
    "<title>s137 spine — browser self-test</title>",
    "<style>body{font:13px/1.5 ui-monospace,Menlo,monospace;margin:2rem;max-width:60rem}",
    "td,th{padding:.15rem .6rem;text-align:left;border-bottom:1px solid #ddd}",
    "caption{text-align:left;font-weight:700;padding-bottom:.6rem}</style>",
    "</head><body>",
    "<h1>s137 spine, bundled</h1>",
    "<p>Every digest below was computed in this page by the same engine <code>s137 ring</code> runs.",
    "Compare them with <code>report.json</code>.</p>",
    '<table id="out"><caption>ring(word, { vocabulary: HOUSE_VOCABULARY, cipher })</caption>',
    "<tr><th>word</th><th>cipher</th><th>sheetId</th><th>sheet</th><th>legend</th><th>census</th><th>receipt</th></tr>",
    "</table>",
    "<script>",
    bundle,
    "</script>",
    "<script>",
    `(function () {
  var cases = ${jsonForInlineScript(cases.map((c) => ({ word: c.word, cipher: c.cipher ?? null })))};
  var S = globalThis.${GLOBAL};
  var table = document.getElementById("out");
  for (var i = 0; i < cases.length; i += 1) {
    var opts = { vocabulary: S.HOUSE_VOCABULARY };
    if (cases[i].cipher) opts.cipher = cases[i].cipher;
    var a = S.ring(cases[i].word, opts);
    var row = document.createElement("tr");
    var cells = [
      JSON.stringify(cases[i].word).slice(0, 40),
      cases[i].cipher || "PYTH (default)",
      a.sheetId,
      S.sha256Hex(a.sheetSvg).slice(0, 12),
      S.sha256Hex(a.legend).slice(0, 12),
      S.sha256Hex(a.census).slice(0, 12),
      S.sha256Hex(a.receipt).slice(0, 12),
    ];
    for (var c = 0; c < cells.length; c += 1) {
      var td = document.createElement("td");
      td.textContent = cells[c];
      row.appendChild(td);
    }
    table.appendChild(row);
  }
})();`,
    "</script>",
    "</body></html>",
  ].join("\n");
}

type BrowserArtifacts = Readonly<{
  word: string;
  sheetId: string;
  /** Every string-valued field `ring()` returned, by its own property name. */
  texts: Readonly<Record<string, string>>;
}>;

type PageRun = Readonly<{
  artifacts: readonly BrowserArtifacts[];
  requests: readonly string[];
  consoleErrors: readonly string[];
  pageErrors: readonly string[];
}>;

/**
 * Load `html` in a fresh context, record and abort every request it attempts, and
 * run each word through the bundle's own `ring()`.
 *
 * `page.setContent` is used rather than `addScriptTag` on purpose: the deliverable
 * is a file to be pasted between `<script>` tags, so the check has to exercise the
 * HTML tokenizer that will actually see it, not a DOM API that side-steps it.
 */
async function runPage(browser: Browser, html: string, cases: readonly ParityCase[]): Promise<PageRun> {
  const context = await browser.newContext();
  const requests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  // Everything, aborted. A page that reached the network would have to get past
  // this first, so an empty list is a statement about the page and not about
  // whether this sandbox happens to have a route out.
  await context.route("**/*", async (route) => {
    const url = route.request().url();
    if (!url.startsWith("about:") && !url.startsWith("data:")) requests.push(url);
    await route.abort();
  });

  const page: Page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const url = request.url();
    if (!url.startsWith("about:") && !url.startsWith("data:") && !requests.includes(url)) requests.push(url);
  });

  await page.setContent(html, { waitUntil: "load" });

  const artifacts = await page.evaluate(
    ({ cases: list, global }: { cases: readonly { word: string; cipher?: string; label: string }[]; global: string }) => {
      const spine = (globalThis as unknown as Record<string, unknown>)[global] as
        | {
            ring(
              word: string,
              options: { vocabulary: readonly string[]; cipher?: string },
            ): Record<string, unknown>;
            HOUSE_VOCABULARY: readonly string[];
          }
        | undefined;
      if (spine === undefined) throw new Error(`globalThis.${global} is undefined: the bundle did not install itself`);
      return list.map((one) => {
        const a = spine.ring(one.word, {
          vocabulary: spine.HOUSE_VOCABULARY,
          ...(one.cipher === undefined ? {} : { cipher: one.cipher }),
        });
        // Every string field the engine returned, harvested rather than listed.
        // When a sixth text lands in `RingArtifacts` it arrives here on its own.
        const texts: Record<string, string> = {};
        for (const [key, value] of Object.entries(a)) {
          if (typeof value === "string" && key !== "word" && key !== "sheetId") texts[key] = value;
        }
        return { word: one.label, sheetId: String(a["sheetId"]), texts };
      });
    },
    {
      cases: cases.map((c) => ({
        word: c.word,
        ...(c.cipher === undefined ? {} : { cipher: c.cipher }),
        label: labelOf(c),
      })),
      global: GLOBAL,
    },
  );

  await context.close();
  return { artifacts, requests, consoleErrors, pageErrors };
}

/* ── the CLI, run for real ────────────────────────────────────────────────── */

type CliArtifacts = Readonly<{
  word: string;
  stem: string;
  /** Suffix as written on disk -> contents. Whatever the CLI emitted, all of it. */
  files: Readonly<Record<string, string>>;
}>;

/**
 * `sheet.svg` -> `sheetSvg`, `mode-census.txt` -> `modeCensus`.
 *
 * The CLI names files after the artifact; `RingArtifacts` names properties after
 * the same artifact in a different convention. Rather than a hand-kept table of
 * four that quietly covers three when a fifth text lands — and a fifth text IS
 * landing, `modeCensus` is already on `RingArtifacts` — the mapping is derived:
 * drop a `.txt`, keep a `.svg` as a capitalised suffix, and camel-case the rest.
 * A derived name that does not exist on what the browser returned is an ERROR,
 * not a skip, so this can under-cover the CLI only by failing loudly.
 */
function propertyForSuffix(suffix: string): string {
  const [stem = "", extension = ""] = [suffix.replace(/\.[^.]+$/u, ""), suffix.slice(suffix.lastIndexOf(".") + 1)];
  const camel = stem.replace(/-([a-z])/gu, (_m, c: string) => c.toUpperCase());
  return extension === "txt" ? camel : camel + extension.charAt(0).toUpperCase() + extension.slice(1);
}

/**
 * Run `s137 ring <WORD>` in a subprocess and read back what it wrote.
 *
 * A subprocess and not an in-process `ring()` call: the thing the browser has to
 * agree with is what a person gets when they type the command, wiring and all. The
 * CLI passes its own `vocabulary`, and if that ever stops matching
 * `HOUSE_VOCABULARY` the receipts diverge and this comparison is what says so.
 *
 * The word is passed as a positional through `execFileSync` with no shell, so
 * `../../etc/passwd`, an empty string and five astral codepoints arrive at
 * `process.argv` exactly as written. Each word gets its own directory, so the
 * CLI's refusal-to-overwrite path is never what is being tested here.
 */
function runCli(one: ParityCase, index: number, root: string): CliArtifacts {
  const dir = join(root, `w${String(index).padStart(2, "0")}`);
  mkdirSync(dir, { recursive: true });
  const word = one.word;
  execFileSync(
    TSX,
    [CLI, "ring", word, ...(one.cipher === undefined ? [] : ["--cipher", one.cipher]), "--out", dir],
    { cwd: REPO, stdio: ["ignore", "ignore", "pipe"], encoding: "utf8" },
  );

  // The stem is everything before the FIRST dot: `descent-5375f2….sheet.svg`. The
  // stem itself is `[a-z0-9-]` by construction in `apps/cli/src/ring-paths.ts`, so
  // the first dot is always the suffix boundary.
  const names = readdirSync(dir).sort();
  const stems = new Set(names.map((n) => n.slice(0, n.indexOf("."))));
  if (names.length === 0 || stems.size !== 1) {
    throw new Error(`s137 ring ${JSON.stringify(labelOf(one))} wrote ${names.length} file(s) under ${stems.size} stem(s): ${names.join(", ")}`);
  }
  const stem = [...stems][0] as string;
  const files: Record<string, string> = {};
  for (const name of names) files[name.slice(stem.length + 1)] = readFileSync(join(dir, name), "utf8");
  return { word: labelOf(one), stem, files };
}

/* ── the comparison ───────────────────────────────────────────────────────── */

type Mismatch = Readonly<{ word: string; artifact: string; cliSha256: string; browserSha256: string; detail: string }>;

/** Where two strings first differ, with enough either side to read. */
function firstDifference(a: string, b: string): string {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a.charCodeAt(i) === b.charCodeAt(i)) i += 1;
  if (i === limit && a.length === b.length) return "identical";
  const window = 48;
  return (
    `first differ at index ${i} (cli ${a.length} chars, browser ${b.length} chars)\n` +
    `    cli     ...${JSON.stringify(a.slice(Math.max(0, i - window), i + window))}\n` +
    `    browser ...${JSON.stringify(b.slice(Math.max(0, i - window), i + window))}`
  );
}

type Comparison = Readonly<{ mismatches: readonly Mismatch[]; compared: number; artifacts: readonly string[]; engineOnly: readonly string[] }>;

/**
 * Byte-for-byte, over the utf8 encodings — not `===` on two strings.
 *
 * The CLI wrote bytes to a file; the browser returned a UTF-16 string over the
 * DevTools protocol. Comparing the encodings is the comparison that matters, and
 * it is the one that would catch a lone surrogate surviving one path and being
 * replaced on the other, which is exactly what an astral-plane word is in the
 * parity set to provoke.
 *
 * The set of artifacts compared is the set the CLI WROTE, not a list kept here. A
 * text the engine returns and the CLI does not write yet is reported as
 * `engineOnly` and not compared — there is nothing on disk to compare it against —
 * and a file the CLI writes whose property cannot be found on the engine's result
 * is a hard error, because that is the shape of a check silently covering less
 * than it claims.
 */
function compare(cli: readonly CliArtifacts[], browser: readonly BrowserArtifacts[]): Comparison {
  const mismatches: Mismatch[] = [];
  if (cli.length !== browser.length) {
    throw new Error(`cli produced ${cli.length} results, browser ${browser.length}`);
  }
  let compared = 0;
  const artifacts = new Set<string>();
  const engineOnly = new Set<string>();

  for (const [index, cliOne] of cli.entries()) {
    const browserOne = browser[index];
    if (browserOne === undefined || browserOne.word !== cliOne.word) {
      throw new Error(`result ${index} is for different words: cli ${JSON.stringify(cliOne.word)}, browser ${JSON.stringify(browserOne?.word)}`);
    }
    const claimed = new Set<string>();
    for (const [suffix, cliText] of Object.entries(cliOne.files)) {
      const property = propertyForSuffix(suffix);
      const browserText = browserOne.texts[property];
      if (browserText === undefined) {
        throw new Error(
          `s137 ring wrote ${JSON.stringify(suffix)} but the bundle's ring() returned no string property ` +
            `${JSON.stringify(property)} for ${JSON.stringify(cliOne.word)}. It returned: ` +
            `${Object.keys(browserOne.texts).sort().join(", ")}.\n` +
            `Either the CLI's filename and the property have drifted apart, or \`propertyForSuffix\` needs to know ` +
            `about this suffix. Do not delete the file from the comparison — that is how a parity check ends up ` +
            `proving less than it says.`,
        );
      }
      claimed.add(property);
      artifacts.add(suffix);
      compared += 1;
      if (Buffer.compare(Buffer.from(cliText, "utf8"), Buffer.from(browserText, "utf8")) !== 0) {
        mismatches.push({
          word: cliOne.word,
          artifact: suffix,
          cliSha256: sha256Hex(cliText),
          browserSha256: sha256Hex(browserText),
          detail: firstDifference(cliText, browserText),
        });
      }
    }
    for (const property of Object.keys(browserOne.texts)) if (!claimed.has(property)) engineOnly.add(property);
  }
  return { mismatches, compared, artifacts: [...artifacts].sort(), engineOnly: [...engineOnly].sort() };
}

/** House rule 4, on the bytes the BROWSER produced. */
const TEXT_ELEMENTS = ["<text", "<tspan", "<textPath", "<foreignObject"] as const;
function textElementsIn(svg: string): readonly string[] {
  return TEXT_ELEMENTS.filter((needle) => svg.includes(needle));
}

/* ── reporting ────────────────────────────────────────────────────────────── */

type Contribution = Readonly<{ input: string; bytes: number }>;

/** What the bundle is made of, largest first, folded to one row per package. */
function contributions(metafile: Metafile, outputPath: string): readonly Contribution[] {
  const output = metafile.outputs[outputPath] ?? Object.values(metafile.outputs)[0];
  if (output === undefined) return [];
  const totals = new Map<string, number>();
  for (const [input, { bytesInOutput }] of Object.entries(output.inputs)) {
    const match = /node_modules\/\.pnpm\/([^/]+)\//u.exec(input);
    const key = match?.[1] !== undefined ? `npm:${match[1].split("@").slice(0, -1).join("@") || match[1]}` : input;
    totals.set(key, (totals.get(key) ?? 0) + bytesInOutput);
  }
  return [...totals].map(([input, bytes]) => ({ input, bytes })).sort((x, y) => y.bytes - x.bytes);
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KiB`;

/* ── main ─────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  const { module: esbuild, path: esbuildPath, via: esbuildVia } = loadEsbuild();
  process.stdout.write(`esbuild ${esbuild.version} via ${esbuildVia}\n         ${relative(REPO, esbuildPath)}\n`);

  const readable: Variant = { id: "readable", file: "spine.iife.js", minify: false, alias: {} };
  const minified: Variant = { id: "minified", file: "spine.min.iife.js", minify: true, alias: {} };

  const built = new Map<string, Awaited<ReturnType<typeof buildDeterministic>>>();
  const htmlComments = new Map<string, number>();
  for (const variant of [readable, minified]) {
    const result = await buildDeterministic(esbuild, variant);
    htmlComments.set(variant.id, assertInlinable(result.text, variant.id));
    built.set(variant.id, result);
    process.stdout.write(
      `built ${variant.id.padEnd(9)} ${String(result.bytes.length).padStart(7)} bytes  ` +
        `gzip ${String(gzipSync(result.bytes).length).padStart(6)}  sha256 ${result.sha256.slice(0, 16)}  ` +
        `(identical across two builds; no <script or </script; "<!--" x${htmlComments.get(variant.id) ?? 0})\n`,
    );
  }

  const readableBuilt = built.get("readable")!;
  const minifiedBuilt = built.get("minified")!;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, readable.file), readableBuilt.text, "utf8");
  writeFileSync(join(OUT_DIR, minified.file), minifiedBuilt.text, "utf8");

  const selftestHtml = pageHtml(minifiedBuilt.text, PARITY_CASES);
  writeFileSync(join(OUT_DIR, "selftest.html"), selftestHtml, "utf8");

  process.stdout.write("\nwhat dominates the readable bundle:\n");
  const rows = contributions(readableBuilt.metafile, join(OUT_DIR, readable.file));
  for (const { input, bytes } of rows.slice(0, 10)) {
    process.stdout.write(`  ${kb(bytes).padStart(10)}  ${input}\n`);
  }
  const zodBytes = rows.filter((r) => r.input.startsWith("npm:zod")).reduce((t, r) => t + r.bytes, 0);

  const report: Record<string, unknown> = {
    tool: "scripts/build-browser-bundle.ts",
    esbuild: { version: esbuild.version, via: esbuildVia, path: relative(REPO, esbuildPath) },
    global: GLOBAL,
    entry: relative(REPO, ENTRY),
    outputs: {
      [readable.file]: { bytes: readableBuilt.bytes.length, gzip: gzipSync(readableBuilt.bytes).length, sha256: readableBuilt.sha256 },
      [minified.file]: { bytes: minifiedBuilt.bytes.length, gzip: gzipSync(minifiedBuilt.bytes).length, sha256: minifiedBuilt.sha256 },
      "selftest.html": { bytes: Buffer.byteLength(selftestHtml, "utf8"), sha256: sha256Hex(selftestHtml) },
    },
    inlineSafety: {
      scriptOpenTags: 0,
      scriptCloseTags: 0,
      htmlCommentOpeners: Object.fromEntries(htmlComments),
      note: "`<!--` occurs only inside the string literals that delimit `<g id=\"figure\">` in an emitted plate. It is harmless in script data because no `<script` follows it, and the parity check loads the bundle by inlining it into a real document rather than taking that on trust.",
    },
    dominatedBy: rows.slice(0, 12),
    words: PARITY_CASES.map(labelOf),
  };

  if (!DO_VERIFY) {
    writeFileSync(join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`\n--no-verify: wrote ${relative(REPO, OUT_DIR)}/ without proving anything. The bundle is unverified.\n`);
    return;
  }

  /* ── run the CLI once; every variant is compared against the same bytes ── */

  const fingerprint = fingerprintInputs(readableBuilt.metafile);
  const detail = fingerprint.files
    .map((file) => {
      try {
        const stat = statSync(join(REPO, file));
        return `${file}\u0000${stat.size}\u0000${stat.mtimeMs}`;
      } catch {
        return `${file}\u0000missing`;
      }
    })
    .join("\n");
  report["sourceFingerprint"] = { digest: fingerprint.digest, inputs: fingerprint.files.length };

  const cliRoot = mkdtempSync(join(tmpdir(), "s137-parity-"));
  let browser: Browser | undefined;
  try {
    process.stdout.write(`\nrunning s137 ring for ${PARITY_CASES.length} cases...\n`);
    const cliResults = PARITY_CASES.map((one, index) => runCli(one, index, cliRoot));
    for (const r of cliResults) {
      process.stdout.write(`  ${JSON.stringify(r.word).slice(0, 42).padEnd(44)} -> ${r.stem}.{sheet.svg,legend.txt,census.txt,receipt.txt}\n`);
    }

    browser = await chromium.launch();

    // The READABLE bundle is the one the probe loads: it is built from the same
    // graph as the minified one and a `dsin` that survived minification but not
    // the source, or the reverse, would show up in the parity comparison below
    // rather than being hidden by whichever variant the probe happened to pick.
    const math = await probeCrossRuntimeMath(browser, built.get(readable.id)!.text);
    report["crossRuntimeMath"] = math;
    const pct = (k: number): string => `${k} (${((k / math.samples) * 100).toFixed(2)}%)`;
    process.stdout.write(
      `\ncross-runtime Math (Node vs Chromium), ${math.samples} seeded arguments in [${math.argumentRange[0]}, ${math.argumentRange[1]}]:\n` +
        `  arguments identical: ${math.argumentsAgree ? "yes" : "NO — the probe itself is broken"}\n` +
        `  Math.sin   results differing: ${pct(math.sinDisagreements)}\n` +
        `  Math.cos   results differing: ${pct(math.cosDisagreements)}\n` +
        `  Math.sqrt  results differing: ${pct(math.sqrtDisagreements)}\n` +
        `  Math.atan2 results differing: ${pct(math.atan2Disagreements)}\n` +
        `  Math.hypot results differing: ${pct(math.hypotDisagreements)}\n` +
        `  dsin/dcos (mode-engine, source in Node vs bundle in Chromium):\n` +
        `    reachable in both: ${math.deterministicTrigReachable ? "yes" : "NO — the claim below is vacuous"}\n` +
        `    results differing: ${math.deterministicTrigDisagreements} of ${math.samples * 2}` +
        ` — ${math.deterministicTrigAgrees ? "IDENTICAL, which is why attractor is reproducible" : "NOT IDENTICAL"}\n` +
        `  worst disagreement: ${math.worstUlp} ULP\n`,
    );
    // A probe that cannot see `dsin` reports zero disagreements, which reads
    // exactly like a pass. `trig.ts` is load-bearing for house rule 1, so the
    // check that it is being measured at all is an assertion and not a line of
    // output somebody has to notice.
    if (!math.deterministicTrigReachable) {
      throw new Error(
        "The cross-runtime probe could not reach `dsin`/`dcos` in " +
          `${whichRuntimeLostTrig(math)}. mode-engine's deterministic trig is what keeps ` +
          "`attractor` byte-identical between the CLI and the browser; a run that cannot " +
          "measure it cannot claim parity. Check that `packages/mode-engine/src/index.ts` " +
          "still exports them and that `spine-browser` still re-exports `* as modes`.",
      );
    }

    const parity: Record<string, unknown> = {};
    // Parity failures are COLLECTED, not thrown at. The exit code is still 1 and
    // nothing is forgiven; what changes is that one run reports every variant, the
    // self-test and the trim measurement instead of stopping at the first bad word.
    // A failing run whose evidence is complete is worth a great deal more than a
    // failing run that stops early, and the temptation to re-run with the check
    // loosened is exactly what an incomplete report creates.
    const parityFailures: string[] = [];
    /** `word\u0000artifact` for every comparison the SHIPPED bundle already fails. */
    let baseline: ReadonlySet<string> | undefined;

    for (const variant of [readable, minified]) {
      const bundle = built.get(variant.id)!;
      const html = variant.id === "minified" ? selftestHtml : pageHtml(bundle.text, PARITY_CASES);
      const run = await runPage(browser, html, PARITY_CASES);

      if (run.pageErrors.length > 0) throw new Error(`${variant.id}: the page threw:\n  ${run.pageErrors.join("\n  ")}`);
      if (run.consoleErrors.length > 0) throw new Error(`${variant.id}: console errors:\n  ${run.consoleErrors.join("\n  ")}`);
      if (run.requests.length > 0) {
        throw new Error(`${variant.id}: the page attempted ${run.requests.length} network request(s):\n  ${run.requests.join("\n  ")}`);
      }

      const result = compare(cliResults, run.artifacts);
      const failed = new Set(result.mismatches.map((m) => `${m.word}\u0000${m.artifact}`));
      if (variant.id === "readable") baseline = failed;
      if (result.mismatches.length > 0) {
        parity[variant.id] = {
          comparisons: result.compared,
          artifactsCompared: result.artifacts,
          returnedButNotWrittenByCli: result.engineOnly,
          mismatches: result.mismatches.length,
          mismatchDetail: result.mismatches.map((m) => ({ word: m.word, artifact: m.artifact, cliSha256: m.cliSha256, browserSha256: m.browserSha256 })),
          perWord: run.artifacts.map((a) => ({
            word: a.word,
            sheetId: a.sheetId,
            sha256: Object.fromEntries(Object.entries(a.texts).map(([k, v]) => [k, sha256Hex(v)])),
          })),
          wordsAffected: [...new Set(result.mismatches.map((m) => m.word))],
          wordsClean: PARITY_CASES.map(labelOf).filter((w) => !result.mismatches.some((m) => m.word === w)),
        };
        report["parity"] = parity;
        parityFailures.push(
          `${variant.id}: ${result.mismatches.length} of ${result.compared} artifact comparisons differ from the CLI.\n` +
            `Words affected: ${[...new Set(result.mismatches.map((m) => JSON.stringify(m.word)))].join(", ")}\n` +
            `Words clean:    ${PARITY_CASES.map(labelOf).filter((w) => !result.mismatches.some((m) => m.word === w)).map((w) => `${JSON.stringify(w).slice(0, 44)}${w.length > 42 ? "…" : ""}`).join(", ")}\n\n` +
            result.mismatches.map((m) => `  ${JSON.stringify(m.word)} ${m.artifact}\n    cli ${m.cliSha256.slice(0, 16)} browser ${m.browserSha256.slice(0, 16)}\n    ${m.detail}`).join("\n") +
            `\n\nBEFORE BLAMING THE BUNDLE: read \`crossRuntimeMath\` in ${relative(REPO, OUT_DIR)}/report.json. ` +
            `Node and Chromium disagree by 1 ULP on a few percent of Math.sin/Math.cos arguments. That is invisible ` +
            `in anything rounded before it is drawn and unbounded in anything fed back into its own next iteration. ` +
            `If the failing words are exactly the ones whose concept asks for such a mode, the divergence is in the ` +
            `engine's arithmetic and not in how it was compiled — bundling differently cannot fix it.`,
        );
        process.stderr.write(`\n${parityFailures[parityFailures.length - 1] ?? ""}\n`);
        continue;
      }

      const offending = run.artifacts.flatMap((a) =>
        textElementsIn(a.texts["sheetSvg"] ?? "").map((n) => `${JSON.stringify(a.word)} ${n}`),
      );
      if (offending.length > 0) throw new Error(`${variant.id}: house rule 4 broken in the browser's own sheet: ${offending.join(", ")}`);

      process.stdout.write(
        `\n${variant.id}: ${PARITY_CASES.length} cases x ${result.artifacts.length} artifacts = ${result.compared} byte-for-byte comparisons, all identical to the CLI\n` +
          `           compared: ${result.artifacts.join(", ")}\n` +
          (result.engineOnly.length > 0
            ? `           returned by ring() but not written by the CLI, so not compared: ${result.engineOnly.join(", ")}\n`
            : "") +
          `           network requests attempted: ${run.requests.length}\n` +
          `           page errors: ${run.pageErrors.length}   console errors: ${run.consoleErrors.length}\n` +
          `           <text>/<tspan>/<textPath>/<foreignObject> in browser sheets: 0\n`,
      );

      parity[variant.id] = {
        comparisons: result.compared,
        artifactsCompared: result.artifacts,
        returnedButNotWrittenByCli: result.engineOnly,
        mismatches: 0,
        networkRequests: run.requests.length,
        perWord: run.artifacts.map((a) => ({
          word: a.word,
          sheetId: a.sheetId,
          sha256: Object.fromEntries(Object.entries(a.texts).map(([k, v]) => [k, sha256Hex(v)])),
        })),
      };
    }
    report["parity"] = parity;

    /* ── step 6: prove the checks can fail ─────────────────────────────── */

    if (DO_SELF_TEST) {
      const controls: Record<string, string> = {};

      // (a) THE COMPARATOR. One space added to one artifact of one word, and the
      // comparator must report exactly that one and nothing else.
      //
      // The pair to sabotage is CHOSEN AT RUNTIME, from the comparisons that
      // currently pass. Hard-coding "DESCENT's legend" made this control depend on
      // the tree being healthy: the moment DESCENT's legend started failing for an
      // unrelated reason, the added mismatch was not new, the control reported
      // "caught 0", and a working comparator was declared blind. A control that
      // goes off when something ELSE breaks is not a control.
      const probeWords = PARITY_CASES.slice(0, 3);
      const probeCli = cliResults.slice(0, 3);
      const run = await runPage(browser, selftestHtml, probeWords);
      const key = (m: Mismatch): string => `${m.word}\u0000${m.artifact}`;
      const before = compare(probeCli, run.artifacts).mismatches;
      const dirty = new Set(before.map(key));

      let target: Readonly<{ index: number; word: string; suffix: string; property: string }> | undefined;
      for (const [index, one] of probeCli.entries()) {
        for (const suffix of Object.keys(one.files).sort()) {
          if (!dirty.has(`${one.word}\u0000${suffix}`)) {
            target = { index, word: one.word, suffix, property: propertyForSuffix(suffix) };
            break;
          }
        }
        if (target !== undefined) break;
      }
      if (target === undefined) {
        throw new Error(
          `self-test: every comparison among the first ${probeWords.length} words already fails, so there is ` +
            `nothing clean left to sabotage and the comparator cannot be shown to work. Fix the parity failures first.`,
        );
      }

      const chosen = target;
      const sabotagedArtifacts = run.artifacts.map((a, index) =>
        index === chosen.index ? { ...a, texts: { ...a.texts, [chosen.property]: `${a.texts[chosen.property] ?? ""} ` } } : a,
      );
      const after = compare(probeCli, sabotagedArtifacts).mismatches;
      const added = after.filter((m) => !dirty.has(key(m)));
      if (added.length !== 1 || added[0]?.artifact !== chosen.suffix || added[0]?.word !== chosen.word) {
        throw new Error(
          `self-test: a single trailing space added to ${JSON.stringify(chosen.word)}'s ${chosen.suffix} should add ` +
            `exactly that one mismatch. It added ${added.length}: ` +
            `${added.map((c) => `${JSON.stringify(c.word)} ${c.artifact}`).join(", ") || "none"}. The comparator is blind.`,
        );
      }
      controls["comparator"] =
        `caught a single trailing space added to ${JSON.stringify(chosen.word)}'s ${chosen.suffix} — one new ` +
        `mismatch, exactly the sabotaged one, against ${before.length} already failing for unrelated reasons`;

      // (b) the network recorder. Same page, plus one external image.
      const wired = selftestHtml.replace("</body>", '<img src="https://example.invalid/pixel.png" alt=""></body>');
      const wiredRun = await runPage(browser, wired, probeWords);
      if (wiredRun.requests.length === 0) {
        throw new Error("self-test: a page carrying an external <img> recorded ZERO requests. The recorder is blind and the no-network claim is worthless.");
      }
      controls["networkRecorder"] = `caught ${wiredRun.requests.length} request(s): ${wiredRun.requests.join(", ")}`;

      // (c) the house-rule-4 probe.
      const planted = textElementsIn('<svg><text x="0">7</text></svg>');
      if (planted.length !== 1 || planted[0] !== "<text") {
        throw new Error("self-test: the <text> probe did not find a planted <text> element.");
      }
      controls["textProbe"] = "caught a planted <text> element";

      // (d) the determinism check.
      const differ = Buffer.compare(Buffer.from("a"), Buffer.from("b")) !== 0;
      if (!differ) throw new Error("self-test: Buffer.compare reported two different buffers as equal.");
      controls["determinismCheck"] = "Buffer.compare distinguishes two different buffers";

      report["selfTest"] = controls;
      process.stdout.write(`\nself-test: every check above was made to fail on purpose and did.\n`);
      for (const [name, what] of Object.entries(controls)) process.stdout.write(`  ${name.padEnd(18)} ${what}\n`);
    }

    /* ── step 7: measure the trim, do not claim it ─────────────────────── */

    if (DO_TRIM) {
      const shimDir = mkdtempSync(join(tmpdir(), "s137-trim-"));
      const core = join(REPO, "packages", "plate-core", "src");
      // The plate-core barrel, minus `./request.js` — the only module in it that
      // touches zod. Nothing in the spine graph imports a name from request.ts;
      // the parity run below is what turns that grep into a measurement.
      const barrel = readFileSync(join(core, "index.ts"), "utf8")
        .split("\n")
        .filter((line) => !line.includes('"./request.js"'))
        .map((line) => line.replace(/from "\.\/(.+)\.js"/u, (_m, name: string) => `from ${JSON.stringify(join(core, `${name}.ts`))}`))
        .join("\n");
      const shim = join(shimDir, "plate-core-without-request.ts");
      writeFileSync(shim, barrel, "utf8");

      const trimmed = await buildDeterministic(esbuild, {
        id: "trimmed-measurement",
        file: "(not written)",
        minify: false,
        alias: { "@studio137/plate-core": shim },
      });
      const trimmedRun = await runPage(browser, pageHtml(trimmed.text, PARITY_CASES), PARITY_CASES);
      const trimmedComparison = compare(cliResults, trimmedRun.artifacts);
      // The question this measurement asks is "does dropping request.js change any
      // OUTPUT", not "is the tree healthy". Comparing the trimmed build's failures
      // against the shipped build's failures answers that even while some other
      // defect has both of them failing the same four comparisons; comparing raw
      // counts against zero would blame the trim for a divergence it did not cause.
      const trimmedFailed = new Set(trimmedComparison.mismatches.map((m) => `${m.word}\u0000${m.artifact}`));
      const base = baseline ?? new Set<string>();
      const newlyBroken = [...trimmedFailed].filter((k) => !base.has(k));
      const newlyFixed = [...base].filter((k) => !trimmedFailed.has(k));
      const sameAsShipped = newlyBroken.length === 0 && newlyFixed.length === 0;

      const saved = readableBuilt.bytes.length - trimmed.bytes.length;
      report["trimMeasurement"] = {
        what: "the @studio137/plate-core barrel aliased to the same barrel minus ./request.js",
        readableBytes: readableBuilt.bytes.length,
        trimmedBytes: trimmed.bytes.length,
        savedBytes: saved,
        savedPercent: Number(((saved / readableBuilt.bytes.length) * 100).toFixed(1)),
        zodBytesInReadableBundle: zodBytes,
        parityComparisons: trimmedComparison.compared,
        parityMismatches: trimmedComparison.mismatches.length,
        shippedBundleMismatches: base.size,
        comparisonsChangedByTheTrim: newlyBroken.length + newlyFixed.length,
        networkRequests: trimmedRun.requests.length,
        verdict: sameAsShipped
          ? base.size === 0
            ? "measured: every artifact stayed byte-identical to the CLI for every word in the parity set"
            : `measured: the trim changed no comparison — it fails exactly the ${base.size} the shipped bundle already fails, for a reason unrelated to it, and nothing else`
          : `measured: the trim CHANGED ${newlyBroken.length + newlyFixed.length} comparison(s) the shipped bundle did not — it is not behaviour-preserving`,
      };
      process.stdout.write(
        `\ntrim measurement (not shipped): dropping ./request.js from the plate-core barrel\n` +
          `  ${kb(readableBuilt.bytes.length)} -> ${kb(trimmed.bytes.length)}  (${kb(saved)} smaller, ${((saved / readableBuilt.bytes.length) * 100).toFixed(1)}%)\n` +
          `  comparisons this trim changed vs the shipped bundle: ${newlyBroken.length + newlyFixed.length}` +
            ` (it fails ${trimmedComparison.mismatches.length} of ${trimmedComparison.compared}; the shipped bundle fails ${base.size})\n`,
      );
      rmSync(shimDir, { recursive: true, force: true });
    }

    const moved = changedSince(fingerprint.files, detail);
    if (moved.length > 0) {
      report["inconclusive"] = {
        reason: "the source tree changed while this run was in progress",
        changed: moved,
      };
      throw new Error(
        `INCONCLUSIVE — not a pass and not a failure.\n\n` +
          `${moved.length} source file(s) that went into the bundle changed while this run was in progress:\n` +
          moved.map((f) => `  ${f}`).join("\n") +
          `\n\nThe bundle holds the source as it was when esbuild read it; every \`s137 ring\` subprocess read the ` +
          `source as it was a moment later. Any parity verdict from this run compares two different programs. ` +
          `Re-run on a quiet tree.` +
          (parityFailures.length > 0 ? `\n\nWhat it reported before the tree moved:\n\n${parityFailures.join("\n\n")}` : ""),
      );
    }

    if (parityFailures.length > 0) {
      throw new Error(
        `Parity with the CLI FAILED in ${parityFailures.length} variant(s). ` +
          `Everything else above ran to completion and is in report.json.\n\n${parityFailures.join("\n\n")}`,
      );
    }
  } catch (error) {
    // The report is the deliverable of a FAILED run too. A verification that
    // leaves nothing behind when it fails makes the next person start from the
    // beginning; this one leaves the mismatch table and the Math probe on disk.
    report["failure"] = error instanceof Error ? error.message : String(error);
    throw error;
  } finally {
    await browser?.close();
    if (!flag("keep")) rmSync(cliRoot, { recursive: true, force: true });
    else process.stdout.write(`\n--keep: CLI artifacts left in ${cliRoot}\n`);
    writeFileSync(join(OUT_DIR, "report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }

  process.stdout.write(`\nwrote ${relative(REPO, OUT_DIR)}/{${readable.file},${minified.file},selftest.html,report.json}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`\n${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});

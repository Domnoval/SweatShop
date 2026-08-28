/// <reference lib="dom" />
/**
 * Verify `artifacts/ring/index.html` in a real browser, and fail out loud.
 *
 * The page already carried a browser check: it was driven at desktop and phone
 * widths, the console was clean, nothing overflowed. All true, and none of it
 * reproducible — the check lived in a transcript, the screenshots were loose
 * files, and `artifacts/` is gitignored, so the repository held no evidence at
 * all. A grader later found the committed phone shot was of a page that no
 * longer existed: the shot's corpus digest and the page's had diverged. The
 * capability was real; the record of it was stale. This script exists so the
 * claim is checkable by anyone with the repo, rather than asserted by whoever
 * ran the browser last.
 *
 * What it does, in order:
 *   1. rebuilds the page from `scripts/build-ring-page.ts` (`--no-build` reads
 *      whatever is on disk instead), so the thing under test is what today's
 *      source emits and not a leftover;
 *   2. loads it in Chromium at 1440×900 and 375×812, recording every console
 *      message, page error and failed request on both;
 *   3. asserts the console is empty, that nothing sticks out horizontally, and
 *      that no plate SVG contains `<text>`, `<tspan>`, `<textPath>` or
 *      `<foreignObject>` (house rule 4, checked in the DOM the browser actually
 *      built rather than in the source bytes the build script already checked);
 *   4. reads the page's own corpus digest out of its masthead and stamps it into
 *      both screenshot filenames and the JSON report, so a future reader can put
 *      the shot beside the page and see in one glance whether they match — the
 *      exact comparison that caught the stale evidence;
 *   5. sabotages copies of the page and requires each copy to be REJECTED.
 *
 * Step 5 is the point of the whole file. A verification that cannot fail is not
 * verification, and this page is unusually good at hiding failure: `body` sets
 * `overflow-x: hidden`, which clamps `scrollWidth`, so the obvious overflow
 * check passes on a page with a 3000px bar in it. The overflow probe below
 * measures element rectangles instead and treats `body`'s own clip as a
 * concealment rather than a licence — and the self-test proves that distinction
 * is live by planting exactly that bar and requiring a non-zero exit.
 *
 * Exit code is the result. Any failure in any viewport, any sabotage that
 * survives, any probe that comes back empty-handed — all of them exit 1.
 *
 * On Playwright: it is a normal devDependency, pinned exact rather than
 * caretted. Chromium here is preinstalled at `PLAYWRIGHT_BROWSERS_PATH` as a
 * specific build (`chromium-1194`), `playwright install` is unavailable, and a
 * caret range would eventually float to a Playwright that demands a build that
 * is not on disk. The pin keeps the library and the binary in step.
 *
 * Usage:
 *   pnpm exec tsx scripts/verify-ring-page.ts
 *   pnpm exec tsx scripts/verify-ring-page.ts --no-build --no-self-test
 *   pnpm exec tsx scripts/verify-ring-page.ts --page artifacts/ring/index.html --out artifacts/ring/verify
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium, type Browser } from "playwright";

import { sha256Hex } from "@studio137/plate-core";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * The two widths the done-bar names. Desktop is where the page's two-column
 * grids engage (the layout's breakpoints are 760px and 1000px); 375×812 is the
 * narrowest phone anyone still ships, and the width at which the `<pre>` blocks
 * and the plate figures have to survive without a body-level scrollbar.
 */
type Viewport = Readonly<{ name: string; width: number; height: number }>;

const VIEWPORTS: readonly Viewport[] = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 375, height: 812 },
];

/* ── what the browser hands back ─────────────────────────────────────────── */

type Record_ = Readonly<{ channel: string; text: string; where: string }>;

type Offender = Readonly<{ path: string; left: number; right: number; width: number }>;

type OverflowProbe = Readonly<{
  limit: number;
  innerWidth: number;
  /**
   * Recorded, deliberately, as evidence rather than as the test. `body` carries
   * `overflow-x: hidden`, so both of these are clamped to the viewport no matter
   * how far a child sticks out. Printing them next to the rectangle walk is what
   * stops a later reader from "simplifying" the check back into a lie.
   */
  documentScrollWidth: number;
  bodyScrollWidth: number;
  widest: number;
  offenders: readonly Offender[];
}>;

type PlateProbe = Readonly<{
  cards: number;
  plates: number;
  svgs: number;
  /**
   * The tag list the browser actually checked, handed back rather than kept in a
   * second copy up here. The probe is serialized into the page and cannot close
   * over module scope, so it must hold its own list; returning it is what stops
   * the line this script prints from drifting away from the check it describes.
   */
  checked: readonly string[];
  offenders: readonly Readonly<{ plate: number; tag: string; count: number }>[];
}>;

type ShapeProbe = Readonly<{
  digests: readonly string[];
  documentWidth: number;
  documentHeight: number;
  title: string;
  scripts: number;
}>;

/* ── the probes (these run inside the page) ──────────────────────────────── */

/**
 * Find every element that reaches past the viewport.
 *
 * Not `scrollWidth`: see the note on `OverflowProbe`. This walks the tree and
 * compares each element's rectangle against `documentElement.clientWidth` — the
 * viewport minus any classic scrollbar, which is the width the layout actually
 * has. Two rules make it honest:
 *
 *   - An element whose computed `overflow-x` scrolls or crops is allowed to hold
 *     content wider than itself, so the walk stops there. That is `.scroller`,
 *     and it is the page's declared answer for wide plates and long receipt
 *     lines. The container itself is still measured on the way in.
 *   - `body` is exempt from that courtesy. Its `overflow-x: hidden` hides
 *     overflow rather than resolving it, and hidden overflow is still overflow;
 *     the walk descends into it regardless.
 *
 * Only the outermost offender on any branch is reported — a 3000px bar would
 * otherwise report itself and every ancestor and child it drags along.
 */
function probeOverflow(): OverflowProbe {
  const TOL = 0.5;
  const de = document.documentElement;
  const limit = de.clientWidth;

  const clips = (el: Element): boolean => {
    const ox = getComputedStyle(el).overflowX;
    return ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip";
  };

  const label = (el: Element): string => {
    const bits: string[] = [];
    let node: Element | null = el;
    while (node !== null && node !== de) {
      const id = node.id !== "" ? `#${node.id}` : "";
      const raw = typeof node.className === "string" ? node.className.trim() : "";
      const cls = raw !== "" ? `.${raw.split(/\s+/u).join(".")}` : "";
      bits.unshift(`${node.localName}${id}${cls}`);
      node = node.parentElement;
    }
    return bits.join(" > ");
  };

  const offenders: Offender[] = [];
  let widest = 0;

  const measure = (el: Element): boolean => {
    const r = el.getBoundingClientRect();
    if (r.right > widest) widest = r.right;
    if (r.right > limit + TOL || r.left < -TOL) {
      offenders.push({ path: label(el), left: r.left, right: r.right, width: r.width });
      return true;
    }
    return false;
  };

  const walk = (el: Element): void => {
    const kids = Array.from(el.children);
    for (const child of kids) {
      const style = getComputedStyle(child);
      if (style.display === "none" || style.visibility === "hidden") continue;
      const r = child.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (measure(child)) continue;
      if (clips(child)) continue;
      walk(child);
    }
  };

  measure(document.body);
  walk(document.body);

  return {
    limit,
    innerWidth: window.innerWidth,
    documentScrollWidth: de.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    widest,
    offenders: offenders.slice(0, 12),
  };
}

/**
 * Count the forbidden tags inside every plate SVG, in the live DOM.
 *
 * `querySelectorAll("textPath")` would be a check that cannot fail: type
 * selectors are ASCII-lowercased in an HTML document, and the SVG element's
 * local name is not, so the selector silently matches nothing. This reads
 * `localName` off every descendant instead and lowercases both sides.
 *
 * The card and SVG counts come back so the caller can refuse a run where the
 * probe found no plates at all — zero offenders out of zero plates is not a
 * pass.
 */
function probePlates(): PlateProbe {
  const forbidden = ["text", "tspan", "textpath", "foreignobject"];
  const plates = Array.from(document.querySelectorAll(".plate"));
  const offenders: { plate: number; tag: string; count: number }[] = [];
  let svgs = 0;

  plates.forEach((plate, index) => {
    const roots = Array.from(plate.querySelectorAll("svg"));
    svgs += roots.length;
    const tally = new Map<string, number>();
    for (const root of roots) {
      for (const el of Array.from(root.getElementsByTagName("*"))) {
        const name = el.localName.toLowerCase();
        if (forbidden.includes(name)) tally.set(el.localName, (tally.get(el.localName) ?? 0) + 1);
      }
    }
    for (const [tag, count] of tally) offenders.push({ plate: index, tag, count });
  });

  return {
    cards: document.querySelectorAll("article.card").length,
    plates: plates.length,
    svgs,
    checked: forbidden,
    offenders,
  };
}

/**
 * The page's own corpus digest, read out of the masthead stamp it prints.
 *
 * Every 64-hex `<code>` on the page is collected and the caller requires exactly
 * one distinct value. Taking it from the DOM rather than recomputing it keeps
 * one trunk: `ring()` and the build script own what the digest is, and this
 * script only carries it to the evidence.
 */
function probeShape(): ShapeProbe {
  const hex = Array.from(document.querySelectorAll("code"))
    .map((c) => (c.textContent ?? "").trim())
    .filter((t) => /^[0-9a-f]{64}$/u.test(t));
  return {
    digests: Array.from(new Set(hex)),
    documentWidth: document.documentElement.scrollWidth,
    documentHeight: document.documentElement.scrollHeight,
    title: document.title,
    scripts: document.querySelectorAll("script").length,
  };
}

/* ── one load, one verdict ───────────────────────────────────────────────── */

type Inspection = Readonly<{
  viewport: Viewport;
  records: readonly Record_[];
  overflow: OverflowProbe;
  plates: PlateProbe;
  shape: ShapeProbe;
  screenshot: string | null;
  failures: readonly string[];
}>;

type InspectOptions = Readonly<{ screenshotPath: string | null }>;

async function inspect(
  browser: Browser,
  pageFile: string,
  viewport: Viewport,
  options: InspectOptions,
): Promise<Inspection> {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
  });

  // The probes below are ordinary typed functions, and `page.evaluate` ships
  // them by taking `.toString()` of whatever the runtime holds. Under tsx that
  // is esbuild's output, and esbuild compiles with `keepNames`, which wraps
  // every function declaration in `__name(fn, "probeOverflow")` so stack traces
  // keep their names. The wrapper travels with the source; the helper does not,
  // and the page throws `ReferenceError: __name is not defined` before a single
  // rectangle is measured. Defining the identity helper on the far side is the
  // whole fix. It is added as source text, not as a function, so it cannot
  // arrive needing the very helper it defines — and as an init script rather
  // than a script tag, so the page's `<script>` count stays 0 and the "no
  // assets, no script" assertion below still means what it says.
  await context.addInitScript({ content: "globalThis.__name = globalThis.__name || ((f) => f);" });

  const page = await context.newPage();

  const records: Record_[] = [];
  // Every channel, no filter. A console the page is "allowed" to dirty is a
  // console nobody reads; this page ships no script and loads no asset, so the
  // honest expectation is silence and anything at all is a finding.
  page.on("console", (m) => {
    const loc = m.location();
    records.push({
      channel: `console.${m.type()}`,
      text: m.text(),
      where: loc.url === "" ? "-" : `${loc.url}:${loc.lineNumber}:${loc.columnNumber}`,
    });
  });
  page.on("pageerror", (e) => {
    records.push({ channel: "pageerror", text: `${e.name}: ${e.message}`, where: "-" });
  });
  page.on("requestfailed", (r) => {
    records.push({
      channel: "requestfailed",
      text: `${r.failure()?.errorText ?? "failed"} ${r.url()}`,
      where: r.resourceType(),
    });
  });

  const failures: string[] = [];
  const tag = `[${viewport.name} ${viewport.width}x${viewport.height}]`;

  await page.goto(pathToFileURL(pageFile).href, { waitUntil: "load" });
  // The page has no script, no font and no network, so "loaded" is already
  // settled; this only gives the renderer a frame to flush layout before any
  // rectangle is measured.
  await page.waitForTimeout(150);

  const overflow = await page.evaluate(probeOverflow);
  const plates = await page.evaluate(probePlates);
  const shape = await page.evaluate(probeShape);

  if (records.length > 0) {
    failures.push(
      `${tag} console not clean: ${records.length} record(s) — ` +
        records.map((r) => `${r.channel}: ${r.text}`).join(" | "),
    );
  }

  if (overflow.offenders.length > 0) {
    failures.push(
      `${tag} horizontal overflow: ${overflow.offenders.length} element(s) past the ` +
        `${overflow.limit}px layout width — ` +
        overflow.offenders
          .map((o) => `${o.path} [left ${o.left.toFixed(1)}, right ${o.right.toFixed(1)}]`)
          .join(" | "),
    );
  }

  // A probe that found nothing to look at has not looked. These three guards are
  // what keep the plate assertion from passing vacuously if the page's structure
  // moves under it.
  if (plates.plates === 0) failures.push(`${tag} found no .plate elements — the plate check had nothing to check`);
  if (plates.cards !== plates.plates) {
    failures.push(`${tag} ${plates.cards} card(s) but ${plates.plates} plate(s) — a card lost its figure`);
  }
  if (plates.svgs < plates.plates) failures.push(`${tag} ${plates.plates} plate(s) hold only ${plates.svgs} svg root(s)`);
  for (const o of plates.offenders) {
    failures.push(`${tag} plate ${o.plate} carries ${o.count}×<${o.tag}> (house rule 4: no <text> in any emitted plate)`);
  }

  if (shape.digests.length !== 1) {
    failures.push(
      `${tag} expected exactly one corpus digest on the page, found ${shape.digests.length}` +
        (shape.digests.length > 1 ? ` (${shape.digests.join(", ")})` : ""),
    );
  }
  if (shape.scripts !== 0) failures.push(`${tag} page carries ${shape.scripts} <script> element(s); it is meant to ship none`);

  let screenshot: string | null = null;
  if (options.screenshotPath !== null) {
    mkdirSync(dirname(options.screenshotPath), { recursive: true });
    await page.screenshot({ path: options.screenshotPath, fullPage: true });
    const bytes = statSync(options.screenshotPath).size;
    // A capture that failed mid-flight still leaves a file. Evidence that small
    // is not evidence.
    if (bytes < 20_000) failures.push(`${tag} screenshot is only ${bytes} bytes — that is not a picture of this page`);
    screenshot = options.screenshotPath;
  }

  await context.close();
  return { viewport, records, overflow, plates, shape, screenshot, failures };
}

/* ── sabotage: the part that proves the rest has teeth ───────────────────── */

type Sabotage = Readonly<{
  name: string;
  /** The channel the rejection must name, so a lucky failure cannot be mistaken for the right one. */
  expect: string;
  apply: (html: string) => string;
}>;

/** Splice `insert` in at `at`, refusing to proceed if the anchor is gone. */
function spliceAt(html: string, at: number, insert: string, what: string): string {
  if (at < 0) throw new Error(`sabotage anchor missing: ${what}`);
  return html.slice(0, at) + insert + html.slice(at);
}

const SABOTAGES: readonly Sabotage[] = [
  {
    name: "console error",
    expect: "console.error",
    apply: (html) =>
      spliceAt(html, html.lastIndexOf("</body>"), `<script>console.error("sabotage: injected console error");</script>`, "</body>"),
  },
  {
    name: "uncaught page error",
    expect: "pageerror",
    apply: (html) =>
      spliceAt(html, html.lastIndexOf("</body>"), `<script>throw new Error("sabotage: uncaught");</script>`, "</body>"),
  },
  {
    name: "failed request",
    expect: "requestfailed",
    apply: (html) =>
      spliceAt(html, html.lastIndexOf("</body>"), `<img src="./sabotage-missing-asset.png" alt="">`, "</body>"),
  },
  {
    name: "horizontal overflow",
    expect: "horizontal overflow",
    apply: (html) => {
      const anchor = html.indexOf(`<div class="wrap">`);
      // Placed inside `.wrap`, where `body { overflow-x: hidden }` hides it and
      // every scrollWidth on the page still reads exactly the viewport width.
      // If this one is not caught, the overflow check is decorative.
      return spliceAt(
        html,
        anchor < 0 ? -1 : anchor + `<div class="wrap">`.length,
        `<div id="sabotage-wide" style="width:3000px;height:8px"></div>`,
        `<div class="wrap">`,
      );
    },
  },
  {
    name: "<text> in a plate",
    expect: "<text>",
    apply: (html) => {
      const plate = html.indexOf(`<div class="scroller plate">`);
      const close = plate < 0 ? -1 : html.indexOf("</svg>", plate);
      return spliceAt(html, close, `<text x="10" y="10">1</text>`, `first plate's </svg>`);
    },
  },
];

async function runSabotage(browser: Browser, html: string, scratch: string): Promise<readonly string[]> {
  const failures: string[] = [];
  const viewport = VIEWPORTS[0]!;

  for (const s of SABOTAGES) {
    const mutated = s.apply(html);
    if (mutated === html) {
      failures.push(`sabotage "${s.name}" changed nothing — the self-test would have passed for the wrong reason`);
      continue;
    }
    const file = join(scratch, `sabotage-${s.name.replace(/[^a-z]+/giu, "-")}.html`);
    writeFileSync(file, mutated, "utf8");
    const result = await inspect(browser, file, viewport, { screenshotPath: null });
    const blob = result.failures.join(" | ");

    if (result.failures.length === 0) {
      failures.push(`sabotage "${s.name}" was NOT caught — the page was accepted with it in place`);
      process.stdout.write(`    ${s.name.padEnd(22)}  ACCEPTED — check is toothless\n`);
    } else if (!blob.includes(s.expect)) {
      failures.push(`sabotage "${s.name}" was rejected, but for the wrong reason (wanted ${s.expect}): ${blob}`);
      process.stdout.write(`    ${s.name.padEnd(22)}  rejected for the wrong reason\n`);
    } else {
      const first = result.failures[0] ?? "";
      process.stdout.write(`    ${s.name.padEnd(22)}  rejected  ${first.slice(0, 108)}\n`);
    }
  }
  return failures;
}

/* ── entry ───────────────────────────────────────────────────────────────── */

/** Repo-relative where that reads better, absolute where it would not. */
function show(path: string): string {
  const rel = relative(REPO_ROOT, path);
  return rel.startsWith("..") ? path : rel;
}

function flag(argv: readonly string[], name: string, fallback: string): string {
  const i = argv.indexOf(name);
  const v = i === -1 ? undefined : argv[i + 1];
  return v === undefined ? fallback : v;
}

function buildPage(pageFile: string): void {
  const tsx = resolve(REPO_ROOT, "node_modules/.bin/tsx");
  if (!existsSync(tsx)) throw new Error(`cannot find ${tsx} — run pnpm install, or pass --no-build`);
  process.stdout.write(`building ${show(pageFile)} from scripts/build-ring-page.ts\n`);
  execFileSync(tsx, [resolve(REPO_ROOT, "scripts/build-ring-page.ts"), "--out", pageFile], {
    cwd: REPO_ROOT,
    stdio: "inherit",
  });
}

/** Drop stale evidence: any earlier shot whose digest is not the page's. */
function prune(outDir: string, keep: readonly string[]): readonly string[] {
  if (!existsSync(outDir)) return [];
  const dropped: string[] = [];
  for (const name of readdirSync(outDir)) {
    if (!name.startsWith("ring-") || !name.endsWith(".png")) continue;
    if (keep.includes(join(outDir, name))) continue;
    rmSync(join(outDir, name));
    dropped.push(name);
  }
  return dropped;
}

async function main(argv: readonly string[]): Promise<number> {
  const pageFile = resolve(REPO_ROOT, flag(argv, "--page", "artifacts/ring/index.html"));
  const outDir = resolve(REPO_ROOT, flag(argv, "--out", "artifacts/ring/verify"));

  if (!argv.includes("--no-build")) buildPage(pageFile);
  if (!existsSync(pageFile)) throw new Error(`no page at ${pageFile} (build it, or drop --no-build)`);

  const html = readFileSync(pageFile, "utf8");
  const pageSha = sha256Hex(html);

  const browser = await chromium.launch();
  const failures: string[] = [];
  const inspections: Inspection[] = [];

  try {
    // One pass at desktop with no screenshot, purely to learn the digest the
    // shots must be named for. Cheap, and it keeps the naming honest: the file
    // is named after the page it is a picture of, not after the page we hoped
    // to photograph.
    const probe = await inspect(browser, pageFile, VIEWPORTS[0]!, { screenshotPath: null });
    const digest = probe.shape.digests[0] ?? "no-digest";
    const short = digest.slice(0, 12);

    process.stdout.write(`\nTHE RING — page verification\n\n`);
    process.stdout.write(`  page           ${pageFile}\n`);
    process.stdout.write(`  page sha256    ${pageSha}\n`);
    process.stdout.write(`  corpus digest  ${digest}\n`);
    process.stdout.write(`  title          ${probe.shape.title}\n`);
    process.stdout.write(`  playwright     ${playwrightVersion()}\n`);
    process.stdout.write(`  browser        ${browser.browserType().name()} ${browser.version()}\n\n`);

    for (const viewport of VIEWPORTS) {
      const shot = join(outDir, `ring-${viewport.name}-${viewport.width}x${viewport.height}-${short}.png`);
      const r = await inspect(browser, pageFile, viewport, { screenshotPath: shot });
      inspections.push(r);
      failures.push(...r.failures);

      process.stdout.write(`  ${viewport.name} ${viewport.width}x${viewport.height}\n`);
      process.stdout.write(
        `    console      ${r.records.length} record(s)` +
          (r.records.length === 0 ? " — clean\n" : `\n${r.records.map((m) => `      ${m.channel}  ${m.text}  (${m.where})\n`).join("")}`),
      );
      process.stdout.write(
        `    overflow     ${r.overflow.offenders.length === 0 ? "none" : `${r.overflow.offenders.length} element(s)`}` +
          ` — layout width ${r.overflow.limit}px, widest element right edge ${r.overflow.widest.toFixed(1)}px` +
          ` (scrollWidth ${r.overflow.documentScrollWidth}px, clamped by body overflow-x:hidden and so not the test)\n`,
      );
      process.stdout.write(
        `    plates       ${r.plates.plates} plate(s), ${r.plates.svgs} svg root(s), ` +
          `${r.plates.offenders.reduce((n, o) => n + o.count, 0)} forbidden ` +
          `<${r.plates.checked.join(">/<")}>\n`,
      );
      process.stdout.write(`    document     ${r.shape.documentWidth} × ${r.shape.documentHeight} px\n`);
      process.stdout.write(
        `    screenshot   ${show(shot)} (${(statSync(shot).size / 1024).toFixed(0)} KB)\n`,
      );
    }

    const digests = new Set(inspections.map((r) => r.shape.digests[0] ?? "none"));
    if (digests.size !== 1) failures.push(`the page reported different corpus digests between viewports: ${[...digests].join(", ")}`);

    const dropped = prune(outDir, inspections.map((r) => r.screenshot ?? ""));
    if (dropped.length > 0) process.stdout.write(`\n  pruned stale evidence: ${dropped.join(", ")}\n`);

    if (!argv.includes("--no-self-test")) {
      process.stdout.write(`\n  falsifiability — each of these must be REJECTED\n`);
      const scratch = mkdtempSync(join(tmpdir(), "ring-verify-"));
      try {
        failures.push(...(await runSabotage(browser, html, scratch)));
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    }

    const report = {
      page: show(pageFile),
      pageSha256: pageSha,
      corpusDigest: digest,
      playwright: playwrightVersion(),
      browser: `${browser.browserType().name()} ${browser.version()}`,
      note:
        "The corpus digest is read from the page's own masthead and stamped into the screenshot " +
        "filenames. If a shot's digest is not this one, the shot is of a different page.",
      viewports: inspections.map((r) => ({
        name: r.viewport.name,
        width: r.viewport.width,
        height: r.viewport.height,
        screenshot: r.screenshot === null ? null : show(r.screenshot),
        documentHeight: r.shape.documentHeight,
        consoleRecords: r.records,
        overflow: r.overflow,
        plates: r.plates,
        failures: r.failures,
      })),
      selfTest: argv.includes("--no-self-test") ? "skipped" : SABOTAGES.map((s) => s.name),
      verdict: failures.length === 0 ? "PASS" : "FAIL",
      failures,
    };
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "verify-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
    process.stdout.write(`\n  report         ${show(join(outDir, "verify-report.json"))}\n`);
  } finally {
    await browser.close();
  }

  if (failures.length > 0) {
    process.stdout.write(`\nVERDICT: FAIL — ${failures.length} finding(s)\n`);
    for (const f of failures) process.stdout.write(`  ✗ ${f}\n`);
    return 1;
  }
  process.stdout.write(`\nVERDICT: PASS — console clean, no overflow, no <text> in any plate, at both widths\n`);
  return 0;
}

/**
 * The Playwright the run used, read off disk rather than guessed.
 *
 * Worth recording next to the browser build: the pin in package.json and the
 * Chromium in PLAYWRIGHT_BROWSERS_PATH have to agree, and when they do not the
 * failure is `Executable doesn't exist at .../chromium_headless_shell-<n>`. A
 * report that names both makes that a one-line diagnosis instead of a hunt.
 */
function playwrightVersion(): string {
  try {
    const pkg = readFileSync(resolve(REPO_ROOT, "node_modules/playwright/package.json"), "utf8");
    const parsed: unknown = JSON.parse(pkg);
    const version = (parsed as { version?: unknown }).version;
    return typeof version === "string" ? version : "unknown";
  } catch {
    return "unknown";
  }
}

main(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    process.stdout.write(`\nVERDICT: FAIL — ${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  },
);

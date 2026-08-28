/**
 * THE CLI'S FILENAMES — the one repaired defect that had no regression test.
 *
 * `apps/cli/src/index.ts` decides where a ring run's four artifacts land. It used
 * to decide badly: the name was the word run through
 * `toLowerCase().replace(/[^a-z0-9]+/gu, "-")`, which is a 1-character hash over
 * most of its domain. `SUN DOG` and `SUN-DOG` both became `sun-dog`, so the second
 * run replaced all four files of the first and exited 0. `""` became the empty
 * string and wrote `.sheet.svg` — four dotfiles `ls` does not show. `ÆØÞ`, `🙂`, `ᛒ`
 * and `日本語` all became `-`: one filename for four unrelated words.
 *
 * What that cost is worth stating precisely, because the fix is sized to it. The
 * reader reads Latin letters, so today `SUN DOG` and `SUN-DOG` happen to produce
 * the same four files and the clobber rewrote identical bytes. Nothing guarantees
 * that — `CAFÉ` and `CAFE` already read differently, and the fold table exists
 * because non-ASCII letters are meant to carry meaning. What the old name lost for
 * certain, in every case, was IDENTITY: `sun-dog.sheet.svg` could not say which of
 * seven words made it, and the receipt inside does not say either.
 *
 * That was fixed. Nothing tested it. Until this file no test imported the CLI at
 * all, so the entire repair could be reverted by one careless edit and the suite
 * would stay green — which is precisely the shape of the bug it repaired.
 *
 * What is pinned here is not "the code as written". Four kinds of assertion, in
 * increasing order of how hard they are to satisfy by accident:
 *
 *   1. FROZEN STEMS. A table of exact `(word, square) -> stem` pairs captured from
 *      the shipped CLI. Determinism is the product (house rule 2): a stem is a
 *      published address, and changing the recipe moves every artifact ever made.
 *      Self-consistency alone would not catch that — a wholly new scheme is
 *      perfectly self-consistent — so the expected strings are written down.
 *   2. INJECTIVITY OVER A BATTERY. Every distinct request in a ~130-word battery,
 *      crossed with squares, gets its own stem. The battery is built out of the
 *      collisions that actually happened: pairs differing only in punctuation,
 *      case, whitespace, or diacritics.
 *   3. PROPERTIES OVER GENERATED INPUT. fast-check drives the same two properties
 *      — injective, deterministic — plus containment and the output alphabet, over
 *      full-Unicode strings nobody thought to list.
 *   4. THE REAL PROCESS. `s137 ring` is spawned for real and its EXIT CODE read,
 *      because "refused" means a non-zero exit, and only the process can say so.
 *
 * House rule 1 is checked mechanically too: `index.ts` must import these helpers
 * and must not carry a second copy of the fold table or the strip regex.
 */

import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";

import { PlateError } from "@studio137/plate-core";

import {
  RING_FOLD,
  ringDigest,
  ringSlug,
  ringStem,
  writeRingArtifacts,
} from "../apps/cli/src/ring-paths.js";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));
const CLI = join(REPO_ROOT, "apps/cli/src/index.ts");
const TSX = join(REPO_ROOT, "node_modules/.bin/tsx");

/* ── the battery ─────────────────────────────────────────────────────────────
   Every group is a collision the old name actually made, or a filename hazard the
   new one has to keep surviving. Nothing here is decorative. */

const BATTERY: readonly string[] = Object.freeze([
  // Nothing an ASCII-alphanumeric name can show: every one of these slugs to "",
  // so only the `word-<digest>` fallback separates them. Under the old name `""`
  // wrote four dotfiles and the rest all shared the single filename `-`.
  "",
  " ",
  "   ",
  "\t",
  "\n",
  "\u00a0",
  "\u200b",
  "🙂",
  "🙂🙂",
  "ᛒ",
  "ᚠᚢᚦ",
  "日本語",
  "Ελληνικά",
  "Кириллица",
  "עברית",
  "!!!,.?-",
  "-",
  "--",
  "---",

  // The headline collision. Each separator vanishes into the same slug,
  // `sun-dog`, so the digest is the only thing that separates these.
  "SUN DOG",
  "SUN-DOG",
  "SUN_DOG",
  "SUN.DOG",
  "SUN/DOG",
  "SUN\tDOG",
  "SUN  DOG",
  " SUN DOG",
  "SUN DOG ",
  "sun dog",
  "Sun Dog",
  "sun-dog",
  "SUNDOG",
  "sundog",
  "SUN",
  "sun",

  // Same shape, second word, so the fix cannot be a special case for SUN DOG.
  "well-being",
  "well being",
  "well_being",
  "wellbeing",
  "Well Being",
  "WELL-BEING",

  // Diacritics. All but `CAF!` strip to `cafe` — composed and decomposed forms
  // included — so again only the digest tells them apart.
  "CAFÉ",
  "CAFÈ",
  "CAFÊ",
  "CAFË",
  "CAFE",
  "CAF!",
  "café",
  "cafe\u0301",

  // The letters NFKD will not take apart, each beside its spelled-out twin.
  "ÆGISHJÁLMUR",
  "ægishjálmur",
  "AEGISHJALMUR",
  "Ægishjálmur",
  "ÆØÞ",
  "AEOTH",
  "ŒUVRE",
  "OEUVRE",
  "ØRSTED",
  "ORSTED",
  "ÅNGSTRÖM",
  "ANGSTROM",
  "ÞORN",
  "THORN",
  "ÐELTA",
  "DELTA",
  "ĐUNGLE",
  "DUNGLE",
  "STRAßE",
  "STRASSE",
  "ŁÓDŹ",
  "LODZ",
  "łódź",

  // Filesystem hazards. None of these may escape --out or hide a file.
  "../../../etc/passwd",
  "..",
  ".",
  "./x",
  "/etc/passwd",
  "C:\\Windows\\system32",
  "..\\..\\win.ini",
  ".sheet.svg",
  ".hidden",
  "~",
  "~root",
  "-LEAD",
  "TRAIL-",
  "-BOTH-",

  // Control characters, including the NUL the digest's separator uses.
  "NUL\u0000WORD",
  "BELL\u0007",
  "CR\rLF",
  "e\u0301",
  "\u00e9",
  "\uFF33\uFF35\uFF2E",

  // Past the 48-character slug cap, where only the digest separates them.
  "A".repeat(47),
  "A".repeat(48),
  "A".repeat(49),
  "A".repeat(200),
  `${"A".repeat(48)}B`,
  `${"A".repeat(48)}C`,
  `${"A".repeat(47)}-B`,
  `${"A".repeat(47)}-C`,

  // Ordinary words, so the battery is not made only of pathology.
  "a",
  "A",
  "aa",
  "aA",
  "Aa",
  "AA",
  "0",
  "00",
  "a0",
  "0a",
  "12345",
  "word",
  "word-",
  "-word",
  "word--",
  "w-o-r-d",
  "w o r d",
  "w.o.r.d",
  "THE SIGNAL SURVIVES THE BODY",
  "the signal survives the body",
  "THE-SIGNAL-SURVIVES-THE-BODY",
  "THE  SIGNAL  SURVIVES  THE  BODY",
  "MIXED-case Word_42",
  "MIXED case word 42",
  "mixed-case-word-42",
]);

/** `undefined` is "no --square"; `""` is `--square=` typed with nothing after it. */
const SQUARES: readonly (string | undefined)[] = Object.freeze([
  undefined,
  "sol",
  "mars",
  "venus",
  "luna",
  "",
  "MARS",
]);

const OUT = "artifacts/ring";

/**
 * Stems captured from the shipped CLI, written down so the recipe cannot drift.
 *
 * These are addresses. A plate made last year is filed under the stem the CLI
 * produced then, and every one of these changing is every one of those artifacts
 * becoming unfindable. A test that only checked internal consistency would let a
 * whole new naming scheme through in silence; this table will not.
 */
const FROZEN: readonly (readonly [word: string, square: string | undefined, stem: string])[] =
  Object.freeze([
    // The collision, resolved four ways.
    ["SUN DOG", undefined, "sun-dog-fe7b55c6e126bdf3"],
    ["SUN-DOG", undefined, "sun-dog-e67e12f2b3b140b7"],
    ["SUN_DOG", undefined, "sun-dog-af37a390d2502862"],
    ["SUN.DOG", undefined, "sun-dog-08a9f6df0b214573"],
    ["sun dog", undefined, "sun-dog-c2bae3384d939c15"],
    ["SUNDOG", undefined, "sundog-07a6f9d13c146308"],

    ["well-being", undefined, "well-being-85711bed9cbb321b"],
    ["well being", undefined, "well-being-71ae3530082c53b1"],
    ["well_being", undefined, "well-being-ed0cda467d429e9f"],

    ["CAFÉ", undefined, "cafe-f0713e5204e7eaa4"],
    ["CAFÈ", undefined, "cafe-f6b144fce1191b0b"],
    ["CAFE", undefined, "cafe-bd3fe43a65377efa"],

    // Folded, not deleted.
    ["ÆGISHJÁLMUR", undefined, "aegishjalmur-899e267f3feff375"],
    ["AEGISHJALMUR", undefined, "aegishjalmur-baf8b457f11d6441"],
    ["ÆØÞ", undefined, "aeoth-543ad96b02c2b36b"],
    ["STRAßE", undefined, "strasse-adada2654dba7767"],
    ["STRASSE", undefined, "strasse-80f5b33dd5548c48"],
    ["ŁÓDŹ", undefined, "lodz-fa23a821c7506acf"],
    ["LODZ", undefined, "lodz-7fd7e1e1edcbb5e4"],

    // Nothing to render: `word-`, never the empty string.
    ["", undefined, "word-d3111ac6a6141019"],
    ["   ", undefined, "word-1a32cfa7cec39e4a"],
    ["🙂", undefined, "word-d83223a286cf90dd"],
    ["ᛒ", undefined, "word-691036d0567c0777"],

    // Hazards, defused.
    ["../../../etc/passwd", undefined, "etc-passwd-57007bead2225421"],
    [".sheet.svg", undefined, "sheet-svg-8097e4c799193a57"],

    // The square is part of the address, because it is part of the request.
    ["SUN", undefined, "sun-91480aad13a13a1b"],
    ["SUN", "mars", "sun-7c3e02960d3b5145"],
    ["SUN", "venus", "sun-3e93dcbe24d2022a"],
    ["", "sol", "word-c389c43f58b35f1b"],
    ["", "", "word-35e2d4c5d75b811e"],
  ]);

/* ── scratch directories ─────────────────────────────────────────────────── */

const scratchDirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "s137-ring-paths-"));
  scratchDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of scratchDirs) rmSync(dir, { recursive: true, force: true });
});

const SHEET = "sheet.svg";
type Artifacts = readonly (readonly [suffix: string, contents: string])[];

function artifactsFor(tag: string): Artifacts {
  return [
    [SHEET, `<svg id="${tag}"/>`],
    ["legend.txt", `legend ${tag}`],
    ["census.txt", `census ${tag}`],
    ["receipt.txt", `receipt ${tag}`],
  ];
}

/* ── 1. frozen stems ─────────────────────────────────────────────────────── */

describe("the stem is a published address", () => {
  it("produces exactly the stems the shipped CLI produces", () => {
    for (const [word, square, expected] of FROZEN) {
      expect(ringStem(OUT, word, square), `stem for ${JSON.stringify(word)}`).toBe(
        `${OUT}/${expected}`,
      );
    }
  });

  it("is a pure function of (outDir, word, square) — 200 calls, one answer", () => {
    for (const [word, square, expected] of FROZEN) {
      const answers = new Set<string>();
      for (let i = 0; i < 200; i += 1) answers.add(ringStem(OUT, word, square));
      expect([...answers]).toEqual([`${OUT}/${expected}`]);
    }
  });

  it("puts the stem under whatever --out was given, and nowhere else", () => {
    for (const word of BATTERY) {
      for (const dir of ["artifacts/ring", "out", "/abs/out", "a/b/c"]) {
        expect(ringStem(dir, word, undefined).startsWith(`${dir}/`)).toBe(true);
      }
    }
  });
});

/* ── 2. injectivity ──────────────────────────────────────────────────────── */

describe("two different requests never share a stem", () => {
  it("gives each of the battery's words its own stem", () => {
    const seen = new Map<string, string>();
    for (const word of BATTERY) {
      const stem = ringStem(OUT, word, undefined);
      const previous = seen.get(stem);
      expect(
        previous,
        `${JSON.stringify(word)} collides with ${JSON.stringify(previous)} at ${stem}`,
      ).toBeUndefined();
      seen.set(stem, word);
    }
    expect(seen.size).toBe(BATTERY.length);
  });

  it("gives each (word, square) pair its own stem", () => {
    const seen = new Map<string, string>();
    for (const word of BATTERY) {
      for (const square of SQUARES) {
        const stem = ringStem(OUT, word, square);
        const key = `${JSON.stringify(word)} @ ${JSON.stringify(square ?? null)}`;
        const previous = seen.get(stem);
        expect(previous, `${key} collides with ${previous} at ${stem}`).toBeUndefined();
        seen.set(stem, key);
      }
    }
    expect(seen.size).toBe(BATTERY.length * SQUARES.length);
  });

  it("keeps apart pairs differing only in punctuation, case, whitespace or diacritics", () => {
    const pairs: readonly (readonly [string, string])[] = [
      ["SUN DOG", "SUN-DOG"],
      ["SUN DOG", "SUN_DOG"],
      ["SUN DOG", "sun dog"],
      ["SUN-DOG", "SUN.DOG"],
      ["SUN DOG", "SUN  DOG"],
      ["SUN DOG", " SUN DOG"],
      ["well-being", "well being"],
      ["well being", "well_being"],
      ["CAFÉ", "CAFÈ"],
      ["CAFÉ", "CAFE"],
      ["CAF!", "CAFE"],
      ["ÆØÞ", "🙂"],
      ["", "   "],
      ["", "🙂"],
      ["ᛒ", "🙂"],
      ["ÆGISHJÁLMUR", "AEGISHJALMUR"],
      ["STRAßE", "STRASSE"],
      [`${"A".repeat(48)}B`, `${"A".repeat(48)}C`],
      ["e\u0301", "\u00e9"],
    ];
    for (const [left, right] of pairs) {
      expect(left).not.toBe(right);
      expect(
        ringStem(OUT, left, undefined),
        `${JSON.stringify(left)} vs ${JSON.stringify(right)}`,
      ).not.toBe(ringStem(OUT, right, undefined));
    }
  });

  it("un-collides the pairs that provably shared one filename", () => {
    // The old name, kept here and nowhere else, so the historical claim above is
    // CHECKED rather than asserted in a comment: the first expectation fails if a
    // pair did not in fact land on one filename, which stops this list from
    // quietly filling up with pairs that were never the bug.
    const oldName = (word: string): string => word.toLowerCase().replace(/[^a-z0-9]+/gu, "-");
    const collided: readonly (readonly [string, string])[] = [
      ["SUN DOG", "SUN-DOG"],
      ["SUN DOG", "SUN_DOG"],
      ["SUN DOG", "SUN.DOG"],
      ["SUN DOG", "SUN/DOG"],
      ["SUN DOG", "SUN\tDOG"],
      ["SUN DOG", "SUN  DOG"],
      ["SUN DOG", "sun dog"],
      ["SUN DOG", "Sun Dog"],
      ["well-being", "well being"],
      ["well being", "well_being"],
      ["CAFÉ", "CAFÈ"],
      ["CAFÉ", "CAF!"],
      ["ÆØÞ", "🙂"],
      ["ᛒ", "🙂"],
      ["ᛒ", "日本語"],
      ["ᛒ", "עברית"],
      ["ÆGISHJÁLMUR", "ægishjálmur"],
    ];

    for (const [left, right] of collided) {
      const label = `${JSON.stringify(left)} vs ${JSON.stringify(right)}`;
      expect(oldName(left), `${label} never shared a filename`).toBe(oldName(right));
      expect(ringStem(OUT, left, undefined), label).not.toBe(ringStem(OUT, right, undefined));
    }
  });

  it("keeps a word's sheets apart when only the square differs", () => {
    const stems = SQUARES.map((square) => ringStem(OUT, "SUN", square));
    expect(new Set(stems).size).toBe(SQUARES.length);
  });

  it("cannot be forged: no word can spell another word's digest input", () => {
    // The fields are JSON-encoded before they are joined, so a NUL typed inside a
    // word comes back as the six characters \u0000 and never acts as a separator.
    expect(ringDigest('SUN\u0000"mars"', undefined)).not.toBe(ringDigest("SUN", "mars"));
    expect(ringDigest("SUN", 'DOG"\u0000"')).not.toBe(ringDigest('SUN"\u0000"DOG', undefined));
    expect(ringDigest("SUN\u0000null", undefined)).not.toBe(ringDigest("SUN", undefined));
  });
});

/* ── 3. the slug: readable, lossy, and safe ──────────────────────────────── */

describe("the slug is allowed to lose information, never to lose a file", () => {
  it("folds the Latin letters NFKD will not decompose", () => {
    // The named failure: ÆGISHJÁLMUR must not read as -gishj-lmur.
    expect(ringSlug("ÆGISHJÁLMUR")).toBe("aegishjalmur");
    expect(ringSlug("ÆØÞ")).toBe("aeoth");
    expect(ringSlug("ŒUVRE")).toBe("oeuvre");
    expect(ringSlug("STRAßE")).toBe("strasse");
    expect(ringSlug("ŁÓDŹ")).toBe("lodz");
    expect(ringSlug("ÅNGSTRÖM")).toBe("angstrom");
    expect(ringSlug("ÐELTA")).toBe("delta");
    expect(ringSlug("ĐUNGLE")).toBe("dungle");
  });

  it("folds every letter its own table names, in both cases, to letters", () => {
    for (const [from, to] of RING_FOLD) {
      expect(/^[a-z]+$/u.test(to), `${from} folds to ${to}`).toBe(true);
      // Sandwiched between ASCII so a dropped letter shows up as a dash.
      expect(ringSlug(`x${from}x`), `${from} inside a word`).toBe(`x${to}x`);
    }
  });

  it("never leaves a dash where a foldable letter stood", () => {
    for (const [from] of RING_FOLD) {
      expect(ringSlug(from).includes("-"), `${from} alone`).toBe(false);
      expect(ringSlug(from), `${from} alone`).not.toBe("");
    }
  });

  it("strips the combining marks NFKD does take off", () => {
    expect(ringSlug("CAFÉ")).toBe("cafe");
    expect(ringSlug("CAFÈ")).toBe("cafe");
    expect(ringSlug("cafe\u0301")).toBe("cafe");
    expect(ringSlug("Ελληνικά")).toBe("");
  });

  it("emits only [a-z0-9-], with no leading or trailing dash, capped at 48", () => {
    for (const word of BATTERY) {
      const slug = ringSlug(word);
      expect(/^[a-z0-9-]*$/u.test(slug), `slug of ${JSON.stringify(word)} is ${slug}`).toBe(true);
      expect(slug.startsWith("-"), `${JSON.stringify(word)} leads with a dash`).toBe(false);
      expect(slug.endsWith("-"), `${JSON.stringify(word)} trails a dash`).toBe(false);
      expect(slug.length).toBeLessThanOrEqual(48);
    }
  });
});

/* ── 4. the filename is a filename ───────────────────────────────────────── */

describe("no ring run can write outside --out or hide what it wrote", () => {
  it("keeps ../../../etc/passwd inside the output directory", () => {
    const out = scratch();
    for (const word of BATTERY) {
      for (const square of SQUARES) {
        const stem = resolve(ringStem(out, word, square));
        const inside = relative(resolve(out), stem);
        expect(isAbsolute(inside), `${JSON.stringify(word)} escaped to ${stem}`).toBe(false);
        expect(inside.startsWith(".."), `${JSON.stringify(word)} escaped to ${stem}`).toBe(false);
        expect(inside.includes(sep), `${JSON.stringify(word)} made a subdirectory`).toBe(false);
      }
    }
  });

  it("never names a dotfile, for any input", () => {
    // "" + ".sheet.svg" is ".sheet.svg": four hidden files the next empty-ish
    // word overwrites. The fallback stem is `word-<digest>` for exactly this.
    for (const word of BATTERY) {
      for (const square of SQUARES) {
        const name = basename(ringStem(OUT, word, square));
        expect(name, `${JSON.stringify(word)} named nothing`).not.toBe("");
        expect(name.startsWith("."), `${JSON.stringify(word)} named a dotfile`).toBe(false);
        expect(`${name}.${SHEET}`.startsWith("."), JSON.stringify(word)).toBe(false);
        expect(/^[a-z0-9][a-z0-9-]*$/u.test(name), `${JSON.stringify(word)} named ${name}`).toBe(
          true,
        );
      }
    }
  });

  it("keeps a pasted paragraph short enough to write", () => {
    const name = basename(ringStem(OUT, "WORD ".repeat(4000), undefined));
    // 48 slug + "-" + 16 digest, plus the longest suffix this CLI appends.
    expect(name.length).toBeLessThanOrEqual(65);
    expect(`${name}.legend.txt`.length).toBeLessThan(255);
  });
});

/* ── 5. properties over generated input ──────────────────────────────────── */

describe("the properties hold on words nobody listed", () => {
  const anyWord = fc.fullUnicodeString({ maxLength: 120 });
  const anySquare = fc.option(fc.fullUnicodeString({ maxLength: 20 }), { nil: undefined });

  it("is injective: distinct requests, distinct stems", () => {
    fc.assert(
      fc.property(anyWord, anyWord, anySquare, anySquare, (a, b, sa, sb) => {
        fc.pre(a !== b || sa !== sb);
        return ringStem(OUT, a, sa) !== ringStem(OUT, b, sb);
      }),
      { numRuns: 3000 },
    );
  });

  it("is deterministic: the same request, the same stem", () => {
    fc.assert(
      fc.property(anyWord, anySquare, (word, square) =>
        ringStem(OUT, word, square) === ringStem(OUT, word, square),
      ),
      { numRuns: 2000 },
    );
  });

  it("always names a visible file inside --out", () => {
    fc.assert(
      fc.property(anyWord, anySquare, (word, square) => {
        const name = basename(ringStem(OUT, word, square));
        return /^[a-z0-9][a-z0-9-]*$/u.test(name) && ringStem(OUT, word, square) === `${OUT}/${name}`;
      }),
      { numRuns: 2000 },
    );
  });

  it("refuses no input", () => {
    // House rule 3: letters resolve, concepts ride. A word the slug cannot render
    // costs legibility in a filename and never costs an error.
    fc.assert(
      fc.property(anyWord, anySquare, (word, square) => {
        ringStem(OUT, word, square);
        return true;
      }),
      { numRuns: 2000 },
    );
  });
});

/* ── 6. writing: refuse, don't replace ───────────────────────────────────── */

describe("an existing artifact is refused, never silently replaced", () => {
  it("writes all four on a clean run", () => {
    const out = scratch();
    const stem = ringStem(out, "SUN DOG", undefined);
    const written = writeRingArtifacts(stem, artifactsFor("one"), false);

    expect(written).toHaveLength(4);
    for (const path of written) expect(existsSync(path)).toBe(true);
    expect(readFileSync(`${stem}.${SHEET}`, "utf8")).toBe('<svg id="one"/>');
  });

  it("re-running the same word is a silent, clean rewrite", () => {
    const out = scratch();
    const stem = ringStem(out, "SUN DOG", undefined);
    const artifacts = artifactsFor("one");

    const first = writeRingArtifacts(stem, artifacts, false);
    // Same request, same bytes: the normal thing to do, and it must not throw.
    const second = writeRingArtifacts(stem, artifacts, false);
    const third = writeRingArtifacts(stem, artifacts, false);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
    for (const [suffix, contents] of artifacts) {
      expect(readFileSync(`${stem}.${suffix}`, "utf8")).toBe(contents);
    }
  });

  it("refuses when the bytes on disk differ, and names every file it refused", () => {
    const out = scratch();
    const stem = ringStem(out, "SUN DOG", undefined);
    writeRingArtifacts(stem, artifactsFor("one"), false);

    let thrown: unknown;
    try {
      writeRingArtifacts(stem, artifactsFor("two"), false);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(PlateError);
    const error = thrown as PlateError;
    expect(error.code).toBe("INVALID_REQUEST");
    expect(error.detail["conflicts"]).toEqual([
      `${stem}.${SHEET}`,
      `${stem}.legend.txt`,
      `${stem}.census.txt`,
      `${stem}.receipt.txt`,
    ]);
  });

  it("leaves all four of the earlier run intact when it refuses", () => {
    // Every target is checked BEFORE any is written, so a refusal cannot leave
    // half a sheet from one run and half from another on disk.
    const out = scratch();
    const stem = ringStem(out, "SUN DOG", undefined);
    const original = artifactsFor("one");
    writeRingArtifacts(stem, original, false);

    // Only the LAST artifact differs, so a naive writer would have replaced the
    // first three before noticing.
    const conflicting: Artifacts = [
      ...original.slice(0, 3),
      ["receipt.txt", "receipt CHANGED"] as const,
    ];
    expect(() => writeRingArtifacts(stem, conflicting, false)).toThrow(PlateError);

    for (const [suffix, contents] of original) {
      expect(readFileSync(`${stem}.${suffix}`, "utf8"), suffix).toBe(contents);
    }
  });

  it("replaces under --force", () => {
    const out = scratch();
    const stem = ringStem(out, "SUN DOG", undefined);
    writeRingArtifacts(stem, artifactsFor("one"), false);
    const written = writeRingArtifacts(stem, artifactsFor("two"), true);

    expect(written).toHaveLength(4);
    expect(readFileSync(`${stem}.${SHEET}`, "utf8")).toBe('<svg id="two"/>');
  });

  it("lets a different word write beside an existing one, never through it", () => {
    const out = scratch();
    const dog = ringStem(out, "SUN DOG", undefined);
    const dash = ringStem(out, "SUN-DOG", undefined);
    expect(dog).not.toBe(dash);

    writeRingArtifacts(dog, artifactsFor("space"), false);
    // No --force, no conflict: the second word was never in the first word's way.
    writeRingArtifacts(dash, artifactsFor("hyphen"), false);

    expect(readFileSync(`${dog}.${SHEET}`, "utf8")).toBe('<svg id="space"/>');
    expect(readFileSync(`${dash}.${SHEET}`, "utf8")).toBe('<svg id="hyphen"/>');
  });
});

/* ── 7. one trunk ────────────────────────────────────────────────────────── */

describe("the CLI has one implementation of this and imports it", () => {
  const source = readFileSync(CLI, "utf8");

  it("imports the helpers rather than carrying its own", () => {
    expect(source).toMatch(/import \{[^}]*\bringStem\b[^}]*\} from "\.\/ring-paths\.js"/u);
    expect(source).toMatch(/import \{[^}]*\bwriteRingArtifacts\b[^}]*\} from "\.\/ring-paths\.js"/u);
    expect(source).toMatch(/\bringStem\(outDir, word, square\)/u);
  });

  it("carries no second copy of the fold table or the strip regex", () => {
    expect(source).not.toMatch(/RING_FOLD\s*(:|=)/u);
    expect(source).not.toContain("[^a-z0-9]+");
    expect(source).not.toMatch(/function ring(Slug|Digest|Stem)\b/u);
    expect(source).not.toMatch(/function writeRingArtifacts\b/u);
  });
});

/* ── 8. the real process ─────────────────────────────────────────────────── */

describe("s137 ring, run for real", () => {
  function runRing(out: string, args: readonly string[]): { status: number; stderr: string } {
    const result = spawnSync(TSX, [CLI, "ring", ...args, "--out", out], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
    return { status: result.status ?? -1, stderr: result.stderr };
  }

  it("files SUN DOG and SUN-DOG as eight files, not four", () => {
    const out = scratch();
    expect(runRing(out, ["SUN DOG"]).status).toBe(0);
    // Second run, no --force, no error: the second word was never in the first's
    // way. Under the old name this call replaced all four files and exited 0.
    expect(runRing(out, ["SUN-DOG"]).status).toBe(0);

    const spaceStem = ringStem(out, "SUN DOG", undefined);
    const dashStem = ringStem(out, "SUN-DOG", undefined);
    expect(spaceStem).not.toBe(dashStem);
    for (const suffix of [SHEET, "legend.txt", "census.txt", "receipt.txt"]) {
      expect(existsSync(`${spaceStem}.${suffix}`), `SUN DOG ${suffix}`).toBe(true);
      expect(existsSync(`${dashStem}.${suffix}`), `SUN-DOG ${suffix}`).toBe(true);
    }
  });

  it("files two words whose ink genuinely differs at two addresses", () => {
    // The separator pairs above read the same, so their clobber rewrote identical
    // bytes. This pair does not: the reader drops É, so CAFÉ reads as CAF while
    // CAFE reads as CAFE, and the two sheets are different ink. Under the current
    // slug both words render "cafe" — only the digest keeps them apart, and if it
    // ever stopped doing so this is the pair that would lose a real sheet.
    const out = scratch();
    expect(runRing(out, ["CAFÉ"]).status).toBe(0);
    expect(runRing(out, ["CAFE"]).status).toBe(0);

    const accented = readFileSync(`${ringStem(out, "CAFÉ", undefined)}.${SHEET}`, "utf8");
    const plain = readFileSync(`${ringStem(out, "CAFE", undefined)}.${SHEET}`, "utf8");
    expect(accented).not.toBe(plain);
  });

  it("writes no dotfile for the empty word", () => {
    const out = scratch();
    expect(runRing(out, ["--word="]).status).toBe(0);
    for (const suffix of [SHEET, "legend.txt", "census.txt", "receipt.txt"]) {
      expect(existsSync(join(out, `.${suffix}`)), `.${suffix}`).toBe(false);
    }
    expect(existsSync(`${ringStem(out, "", undefined)}.${SHEET}`)).toBe(true);
  });

  it("keeps a traversal word inside --out", () => {
    const out = scratch();
    const guard = join(out, "..", "must-not-be-touched");
    writeFileSync(guard, "intact", "utf8");

    expect(runRing(out, ["../../../etc/passwd"]).status).toBe(0);

    expect(readFileSync(guard, "utf8")).toBe("intact");
    expect(existsSync(`${ringStem(out, "../../../etc/passwd", undefined)}.${SHEET}`)).toBe(true);
    rmSync(guard, { force: true });
  });

  it("exits 0 when the same word is run twice", () => {
    const out = scratch();
    expect(runRing(out, ["SUN DOG"]).status).toBe(0);
    // Determinism is the product: the second run reproduces the first's bytes,
    // so there is nothing to refuse.
    expect(runRing(out, ["SUN DOG"]).status).toBe(0);
  });

  it("exits non-zero rather than replacing bytes it did not write", () => {
    const out = scratch();
    expect(runRing(out, ["SUN DOG"]).status).toBe(0);

    const stem = ringStem(out, "SUN DOG", undefined);
    writeFileSync(`${stem}.${SHEET}`, "<svg>someone else's sheet</svg>", "utf8");

    const refused = runRing(out, ["SUN DOG"]);
    expect(refused.status).not.toBe(0);
    expect(refused.status).toBe(1);
    expect(refused.stderr).toContain("Refusing to overwrite");
    // Refused means untouched.
    expect(readFileSync(`${stem}.${SHEET}`, "utf8")).toBe("<svg>someone else's sheet</svg>");

    const forced = runRing(out, ["SUN DOG", "--force"]);
    expect(forced.status).toBe(0);
    expect(readFileSync(`${stem}.${SHEET}`, "utf8")).not.toBe("<svg>someone else's sheet</svg>");
  });

  it("emits no <text> in the sheet it writes", () => {
    // House rule 4, checked on the artifact the CLI actually put on disk.
    const out = scratch();
    expect(runRing(out, ["ÆGISHJÁLMUR"]).status).toBe(0);
    const svg = readFileSync(`${ringStem(out, "ÆGISHJÁLMUR", undefined)}.${SHEET}`, "utf8");
    expect(svg).not.toMatch(/<text[\s>]/u);
  });
});

/* ── 9. the CLI still runs ───────────────────────────────────────────────── */

describe("the extraction did not break the entry point", () => {
  it("still prints its help", () => {
    const help = execFileSync(TSX, [CLI, "help"], { cwd: REPO_ROOT, encoding: "utf8" });
    expect(help).toContain("s137 ring");
    expect(help).toContain("SUN-DOG and SUN DOG keep their own four files");
  });

  it("creates a nested --out that does not exist yet", () => {
    const out = join(scratch(), "nested", "ring");
    expect(existsSync(out)).toBe(false);

    const result = spawnSync(TSX, [CLI, "ring", "SUN DOG", "--out", out], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(existsSync(`${ringStem(out, "SUN DOG", undefined)}.${SHEET}`)).toBe(true);
  });
});

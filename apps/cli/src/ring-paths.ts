/**
 * Where a ring run's four artifacts go, and whether it is allowed to write them.
 *
 * This is the ONE implementation of ring artifact naming. `apps/cli/src/index.ts`
 * imports it; nothing re-derives a stem, and nothing else decides an overwrite.
 *
 * It is a module of its own for one reason: `index.ts` is an ENTRY POINT. Its last
 * statement calls `main()`, so importing it to reach these functions would parse
 * `process.argv`, write files, and set an exit code — a test cannot get at them
 * there without running the CLI. The naming rules below are the part of the CLI
 * that has been wrong before (`SUN DOG` and `SUN-DOG` overwrote each other, `""`
 * wrote `.sheet.svg`), so they are the part that most needs to be reachable from a
 * test. Splitting them out costs the CLI one import and buys the whole battery in
 * `tests/cli-ring-paths.test.ts`. The bodies moved here VERBATIM — the only edit
 * was the word `export` on five declarations — so this refactor changes which file
 * the code lives in and nothing else. Measured, not assumed: the stems for a
 * battery of 128 words crossed with 7 squares and 4 output directories are
 * byte-identical before and after the move, as are the four artifacts `s137 ring`
 * writes for each of nineteen inputs.
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PlateError, sha256Hex } from "@studio137/plate-core";

/* ── ring artifact naming ──────────────────────────────────────────────────
   The four ring artifacts are named after the word, and the name used to be the
   word run through `toLowerCase().replace(/[^a-z0-9]+/gu, "-")`. That is not a
   name, it is a lossy hash with a 1-character output for most of its domain, and
   the loss was silent: `SUN-DOG` and `SUN DOG` both landed on `sun-dog`, so the
   second run overwrote all four of the first's files and exited 0. `ÆØÞ` and `🙂`
   both landed on `-`. `well-being`, `well being` and `well_being` were one file.
   `CAFÉ`, `CAFÈ` and `CAF!` were one file. The empty word landed on the empty
   string and wrote four hidden dotfiles, `.sheet.svg` and friends.

   The fix separates the two jobs the old expression was doing badly at once.
   A filename here has a READABLE half and an IDENTITY half:

     readable   `ringSlug` — folded, lossy, decorative. Tells a human which sheet
                this is at a glance. It is allowed to lose information.
     identity   `ringDigest` — SHA-256 over the exact input, truncated to 16 hex.
                Loses nothing, so two different requests cannot land on one path.

   Because identity is carried by the digest and not by the slug, the slug is free
   to drop what it cannot render without that costing anybody a file. */

/**
 * The Latin letters Unicode will not take apart, and what each folds to.
 *
 * MIRRORED, deliberately, from the `FOLD` table in `scripts/build-correspondence.ts`.
 * It is copied rather than imported because it cannot be imported: the constant is
 * not exported, and the module holding it is a top-level side-effecting extractor
 * that reads four asset files and writes `packages/glyph-registry/src/correspondence.v1.ts`
 * as an import side effect. Importing it would run the codex build every time
 * somebody typed `s137 ring`. Seventeen pairs of authored data is the cheaper
 * duplicate. If a letter is added there, add it here.
 *
 * One thing about the original must NOT be mirrored, and it is the reason this is
 * a separate function rather than a copy of `norm`. The extractor REFUSES a Latin
 * letter it cannot fold, because it is asserting over data an author wrote and a
 * dropped letter there silently mis-joins a mark to the wrong codex row. Here the
 * input is the user's word, and house rule 3 says no input is ever refused. So an
 * unfoldable letter is dropped from the slug and nowhere else — the digest below
 * is taken over the exact input string, so a dropped letter costs legibility in a
 * filename and cannot cost a file.
 */
export const RING_FOLD: readonly (readonly [string, string])[] = Object.freeze([
  ["Æ", "ae"], ["æ", "ae"], ["Œ", "oe"], ["œ", "oe"],
  ["Ø", "o"], ["ø", "o"], ["Å", "a"], ["å", "a"],
  ["Þ", "th"], ["þ", "th"], ["Ð", "d"], ["ð", "d"], ["Đ", "d"], ["đ", "d"],
  ["ß", "ss"], ["Ł", "l"], ["ł", "l"],
] as const);

/**
 * The readable half of a ring filename. Lossy by design, and safe by construction.
 *
 * Folds what `RING_FOLD` names, then lets NFKD strip the combining marks off the
 * letters it does decompose (`É` → `E`), then keeps `[a-z0-9]` and collapses every
 * other run to one `-`. The output alphabet is exactly `[a-z0-9-]` with no leading
 * or trailing `-`, which is also what keeps `s137 ring "../../etc/passwd"` inside
 * the output directory: no `/`, no `.`, no `..` can survive the strip. Capped at
 * 48 characters so a pasted paragraph cannot produce ENAMETOOLONG — two words
 * sharing a 48-character prefix are separated by the digest, not by the slug.
 */
export function ringSlug(word: string): string {
  let folded = word;
  for (const [from, to] of RING_FOLD) folded = folded.split(from).join(to);
  return folded
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+/u, "")
    .slice(0, 48)
    .replace(/-+$/u, "");
}

/**
 * The identity half: the request, digested.
 *
 * Taken over the EXACT word — not the folded one, not a trimmed or normalised one
 * — so distinct inputs cannot share a path, which is the whole property the old
 * name failed to have. The square is in the digest too: `ring SUN --square mars`
 * and `ring SUN --square venus` are different requests that produce different
 * sheets, and naming both `sun` was the same silent clobber one rename away.
 *
 * Fields are JSON-encoded before they are joined, so no word can contain the
 * separator and forge another word's digest: a NUL typed inside a word
 * comes back from JSON.stringify as the six characters \u0000, never as a delimiter.
 */
export function ringDigest(word: string, square: string | undefined): string {
  return sha256Hex(
    `s137.ring.v1\u0000${JSON.stringify(word)}\u0000${JSON.stringify(square ?? null)}`,
  ).slice(0, 16);
}

/**
 * Where this request's four artifacts go.
 *
 * A pure function of `(outDir, word, square)` — same request, same path, every
 * run and every machine, which is the determinism half of house rule 2 applied to
 * the filename rather than to the bytes inside it.
 *
 * When the slug is empty — the word was `""`, or `🙂`, or `ᛒ`, none of which has an
 * ASCII-alphanumeric to show — the name falls back to `word-<digest>`. It must
 * never fall back to the empty string: `""` + `.sheet.svg` is `.sheet.svg`, a
 * dotfile that `ls` does not show and that the next empty-ish word overwrites.
 */
export function ringStem(outDir: string, word: string, square: string | undefined): string {
  const slug = ringSlug(word);
  const digest = ringDigest(word, square);
  return join(outDir, slug === "" ? `word-${digest}` : `${slug}-${digest}`);
}

/**
 * Write the four ring artifacts, or refuse — never silently replace.
 *
 * The digest already guarantees a different request gets a different stem, so the
 * only way an existing file is in the way is that it is an EARLIER run of this
 * same request whose bytes the pipeline no longer reproduces. That is worth
 * stopping for rather than papering over: it means either the sheet changed under
 * a fixed input (a determinism regression, house rule 2's failure mode) or two
 * inputs collided at 64 bits of digest. Both want a human, and neither wants exit
 * 0 and a destroyed file.
 *
 * Byte-identical is not an overwrite and is allowed through silently: re-running
 * the same word is the normal thing to do and it rewrites the same bytes.
 *
 * Every target is checked BEFORE any is written, so a refusal leaves all four of
 * the previous run intact rather than half-replaced.
 */
export function writeRingArtifacts(
  stem: string,
  artifacts: readonly (readonly [suffix: string, contents: string])[],
  force: boolean,
): readonly string[] {
  const paths = artifacts.map(([suffix]) => `${stem}.${suffix}`);

  if (!force) {
    const conflicts = artifacts
      .map(([, contents], index) => ({ path: paths[index]!, contents }))
      .filter(({ path, contents }) => existsSync(path) && readFileSync(path, "utf8") !== contents);

    if (conflicts.length > 0) {
      throw new PlateError(
        "INVALID_REQUEST",
        `Refusing to overwrite ${conflicts.length} existing ring artifact` +
          `${conflicts.length === 1 ? "" : "s"} whose bytes differ from this run:\n` +
          conflicts.map(({ path }) => `  ${path}`).join("\n") +
          "\n\nThe stem is a digest of the exact word and square, so a different word " +
          "cannot land here. These files are an earlier run of this same request that no " +
          "longer reproduces — the pipeline changed under a fixed input, or two inputs " +
          "collided.\nRe-run with --force to replace them, or --out <dir> to keep both.",
        { conflicts: conflicts.map(({ path }) => path) },
      );
    }
  }

  for (const [index, [, contents]] of artifacts.entries()) {
    writeFileSync(paths[index]!, contents, "utf8");
  }
  return paths;
}

#!/usr/bin/env -S node --enable-source-maps
/**
 * Studio 137 Phrase-to-Plate CLI.
 *
 * The trusted local process from spec §23: manifest encryption, private export,
 * clause-sheet generation, metadata scrubbing, and filesystem writes all happen
 * here, never in a browser context.
 *
 *   s137 golden [--out dir] [--key path]
 *   s137 compile --phrase "..." --seed "..." [options]
 *   s137 decode  --manifest file.s137 --key path
 *   s137 keygen  --out path
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  fromHex,
  normalizeUiRequest,
  OUTPUT_PRESETS,
  PlateError,
  sha256Hex,
  toHex,
  type OutputPresetId,
  type PlateRequest,
} from "@studio137/plate-core";
import { ring } from "@studio137/ring";
import { WORD_CORRESPONDENCE } from "@studio137/glyph-registry";
import {
  artifactFilenames,
  buildTranslationCard,
  compilePlate,
  exportPrivate,
  exportProductionPng,
  exportPublic,
} from "@studio137/plate-compiler";
import {
  decodePlate,
  generateMasterKey,
  openManifest,
  type MasterKey,
} from "@studio137/private-manifest";

import { GOLDEN_BASENAME, GOLDEN_REQUEST } from "./golden.js";

type Options = Readonly<Record<string, string | boolean>>;

/** Options that never take a value. Everything else requires one. */
const BOOLEAN_FLAGS: ReadonlySet<string> = new Set(["no-png", "help", "force"]);

/**
 * Parse `--name value`, `--name=value`, and boolean flags.
 *
 * A value is never inferred to be missing just because it begins with `--`: a
 * phrase is arbitrary text, and "--THE SIGNAL--" is a phrase a plate should be
 * able to carry. Treating it as a flag silently dropped both the value and the
 * option, so `--phrase "--THE SIGNAL--"` failed claiming no phrase was given.
 * A genuinely missing value is an explicit error rather than a silent default,
 * and `--name=value` is always available when a value is ambiguous.
 */
function parseArgs(
  argv: readonly string[],
): Readonly<{ command: string; options: Options; positionals: readonly string[] }> {
  const [command = "help", ...rest] = argv;
  const options: Record<string, string | boolean> = {};
  const positionals: string[] = [];
  // Tokens consumed as the value of a preceding `--flag` are not positionals.
  const consumed = new Set<number>();

  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]!;
    if (!token.startsWith("--")) {
      if (!consumed.has(index)) positionals.push(token);
      continue;
    }

    const body = token.slice(2);
    const equals = body.indexOf("=");
    if (equals >= 0) {
      options[body.slice(0, equals)] = body.slice(equals + 1);
      continue;
    }

    if (BOOLEAN_FLAGS.has(body)) {
      options[body] = true;
      continue;
    }

    const next = rest[index + 1];
    consumed.add(index + 1);
    if (next === undefined) {
      throw new PlateError("INVALID_REQUEST", `--${body} requires a value`);
    }
    // Only a token that names another known option is treated as a missing
    // value; anything else is taken literally, so values may start with "--".
    if (next.startsWith("--") && BOOLEAN_FLAGS.has(next.slice(2))) {
      throw new PlateError(
        "INVALID_REQUEST",
        `--${body} requires a value (use --${body}=<value> if the value begins with "--")`,
      );
    }
    options[body] = next;
    index += 1;
  }

  return { command, options, positionals };
}

function stringOption(options: Options, name: string): string | undefined {
  const value = options[name];
  return typeof value === "string" ? value : undefined;
}

function numberOption(options: Options, name: string, fallback: number): number {
  const value = stringOption(options, name);
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new PlateError("INVALID_REQUEST", `--${name} must be a number, received "${value}"`);
  }
  return parsed;
}

/**
 * Load the artist master key.
 *
 * Read from a file, never from an argument or an environment variable: both
 * leak into shell history and process listings. The key never reaches stdout.
 */
function loadMasterKey(path: string): MasterKey {
  const text = readFileSync(path, "utf8").trim();
  const key = fromHex(text);
  if (key.length !== 32) {
    throw new PlateError(
      "INVALID_REQUEST",
      `Key file must contain 64 hex characters (32 bytes), found ${key.length} bytes`,
    );
  }
  return key;
}

function writeArtifact(directory: string, name: string, data: string | Uint8Array): string {
  const target = join(directory, name);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, data);
  return target;
}

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
const RING_FOLD: readonly (readonly [string, string])[] = Object.freeze([
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
function ringSlug(word: string): string {
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
function ringDigest(word: string, square: string | undefined): string {
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
function ringStem(outDir: string, word: string, square: string | undefined): string {
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
function writeRingArtifacts(
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

function report(plate: ReturnType<typeof compilePlate>): void {
  const out = process.stdout;
  out.write(`plate id          ${plate.plateId}\n`);
  out.write(`seed fingerprint  ${plate.rng.fingerprint}\n`);
  out.write(`mode              ${plate.request.mode}\n`);
  out.write(`layout            ${plate.presentation.layout.layoutId}\n`);
  out.write(`substrate         ${plate.presentation.substrateId}\n`);
  out.write(`construction      ${plate.presentation.substrateConstruction}\n`);
  out.write(
    `output            ${plate.output.widthPx}×${plate.output.heightPx}px @ ${plate.output.dpi}dpi\n`,
  );
  out.write(`clauses           ${plate.ast.clauses.length}\n`);
  out.write(`payload glyphs    ${plate.analysis.glyphCount}\n`);
  out.write(`reading           ${plate.analysis.clauses.map((c) => c.reading).join("  ‖  ")}\n`);
  out.write(`corruption band   ${plate.presentation.corruption.band.label}\n`);
  out.write(`corruption ops    ${plate.presentation.corruption.operations.length}\n`);
  out.write(`decoys            ${plate.presentation.decoys.length}\n`);
  out.write(`min stroke        ${plate.presentation.layout.minimumStrokePt.toFixed(3)}pt\n`);
  out.write(`reversibility     ${plate.analysis.reversibility}\n`);

  for (const diagnostic of plate.diagnostics) {
    out.write(`  [${diagnostic.severity}] ${diagnostic.code}: ${diagnostic.message}\n`);
  }
}

function runCompile(request: PlateRequest, options: Options, basename?: string): void {
  const plate = compilePlate(request);
  report(plate);

  const directory = resolve(stringOption(options, "out") ?? "artifacts");
  const names = artifactFilenames(plate.plateId);
  const prefix = basename;
  const name = (key: keyof typeof names): string => {
    const filename = names[key];
    if (filename === undefined) throw new PlateError("INVALID_REQUEST", `Unknown artifact ${key}`);
    return prefix === undefined ? filename : filename.replace(`plate-${plate.plateId}`, prefix);
  };

  const publicExport = exportPublic(plate, {
    backgroundPolicy: stringOption(options, "background") === "transparent" ? "transparent" : "solid",
  });

  const written: string[] = [
    writeArtifact(directory, name("canonicalSvg"), publicExport.canonicalSvg),
    writeArtifact(directory, name("printSvg"), publicExport.printSvg),
  ];

  process.stdout.write(`\ncanonical svg     ${publicExport.canonicalSvgSha256}\n`);
  process.stdout.write(`print svg         ${publicExport.printSvgSha256}\n`);
  process.stdout.write(`canonical paths   ${publicExport.canonicalPathDigest}\n`);
  process.stdout.write(
    `print template    ${publicExport.printTemplateId}` +
      `${publicExport.printTemplateValidated ? "" : " (not yet physically validated)"}\n`,
  );

  // Rasterization is expensive at 300dpi; --no-png skips it for quick iteration.
  let productionPngSha256: string | undefined;
  if (options["no-png"] !== true) {
    const raster = exportProductionPng(plate, publicExport.canonicalSvg, {
      ...(stringOption(options, "background") === "transparent" ? {} : { background: "#ffffff" }),
      ...(stringOption(options, "preview-width") === undefined
        ? {}
        : { widthPx: numberOption(options, "preview-width", plate.output.widthPx) }),
    });
    productionPngSha256 = raster.sha256;
    written.push(writeArtifact(directory, name("productionPng"), raster.png));
    process.stdout.write(`production png    ${raster.sha256}\n`);
    process.stdout.write(
      `png              ${raster.widthPx}×${raster.heightPx}px @ ${raster.dpi}dpi` +
        `${raster.removedChunks.length === 0 ? "" : `, stripped ${raster.removedChunks.join(", ")}`}\n`,
    );
  }

  // The translation card is public-safe and is built from its own field list.
  writeArtifact(
    directory,
    name("canonicalSvg").replace(".canonical.svg", ".translation-card.json"),
    `${JSON.stringify(buildTranslationCard(plate), null, 2)}\n`,
  );

  const keyPath = stringOption(options, "key");
  if (keyPath === undefined) {
    process.stdout.write(
      "\nNo --key given: private artifacts were not written.\n" +
        "Run `s137 keygen --out <path>` once, then pass --key <path>.\n",
    );
  } else {
    const masterKey = loadMasterKey(keyPath);
    const privateExport = exportPrivate(plate, masterKey, {
      canonicalSvgSha256: publicExport.canonicalSvgSha256,
      printSvgSha256: publicExport.printSvgSha256,
      ...(productionPngSha256 === undefined ? {} : { productionPngSha256 }),
    });
    masterKey.fill(0);

    // Write the exact sheet the manifest digested, rather than rebuilding one.
    written.push(
      writeArtifact(directory, name("privateManifest"), privateExport.container),
      writeArtifact(directory, name("clauseSheet"), privateExport.clauseSheetMarkdown),
    );
  }

  process.stdout.write("\nwrote:\n");
  for (const path of written) process.stdout.write(`  ${path}\n`);
}

function main(): void {
  const { command, options, positionals } = parseArgs(process.argv.slice(2));

  switch (command) {
    case "keygen": {
      const target = stringOption(options, "out");
      if (target === undefined) throw new PlateError("INVALID_REQUEST", "keygen requires --out");
      const key = generateMasterKey();
      mkdirSync(dirname(resolve(target)), { recursive: true });
      writeFileSync(resolve(target), `${toHex(key)}\n`, { mode: 0o600 });
      key.fill(0);
      process.stdout.write(
        `Wrote a new 32-byte master key to ${resolve(target)} with mode 0600.\n` +
          `Back it up outside this repository. Losing it makes every manifest unreadable.\n`,
      );
      return;
    }

    case "golden":
      runCompile(GOLDEN_REQUEST, options, GOLDEN_BASENAME);
      return;

    case "compile": {
      const phrase = stringOption(options, "phrase");
      const seed = stringOption(options, "seed");
      if (phrase === undefined || seed === undefined) {
        throw new PlateError("INVALID_REQUEST", "compile requires --phrase and --seed");
      }
      const presetId = (stringOption(options, "preset") ?? "poster-24x36") as OutputPresetId;
      const preset = OUTPUT_PRESETS[presetId];
      if (preset === undefined) {
        throw new PlateError(
          "INVALID_REQUEST",
          `Unknown preset "${presetId}". Available: ${Object.keys(OUTPUT_PRESETS).join(", ")}`,
        );
      }
      // The CLI takes the 0–100 interface scale, like the editor does.
      const request = normalizeUiRequest({
        phrase,
        seed,
        density: numberOption(options, "density", 55),
        corruptionLevel: numberOption(options, "corruption", 25),
        layoutFamily: stringOption(options, "layout") ?? "concentric-rings",
        mathematicalSubstrate: stringOption(options, "substrate") ?? "alpha-radial-lattice",
        outputSize: preset,
        mode: stringOption(options, "mode") ?? "exact",
      });
      runCompile(request, options);
      return;
    }

    case "ring": {
      const word = positionals[0] ?? stringOption(options, "word");
      if (word === undefined) {
        throw new PlateError("INVALID_REQUEST", "ring needs a word: s137 ring <WORD>");
      }
      const outDir = stringOption(options, "out") ?? "artifacts/ring";
      mkdirSync(outDir, { recursive: true });

      // Read once and reuse: the square selects the sheet AND names the file, and
      // those two have to be the same string or the name stops identifying the run.
      const square = stringOption(options, "square");

      const artifacts = ring(word, {
        vocabulary: WORD_CORRESPONDENCE.map((w) => w.word),
        ...(square === undefined ? {} : { square: square as never }),
      });

      const stem = ringStem(outDir, word, square);
      const written = writeRingArtifacts(
        stem,
        [
          ["sheet.svg", artifacts.sheetSvg],
          ["legend.txt", artifacts.legend],
          ["census.txt", artifacts.census],
          ["receipt.txt", artifacts.receipt],
        ],
        options["force"] === true,
      );

      process.stdout.write(artifacts.legend);
      process.stdout.write(artifacts.census);
      process.stdout.write(artifacts.receipt);
      process.stdout.write(`\nWrote ${written.length} artifacts to ${stem}.*\n`);
      return;
    }

    case "decode": {
      const manifestPath = stringOption(options, "manifest");
      const keyPath = stringOption(options, "key");
      if (manifestPath === undefined || keyPath === undefined) {
        throw new PlateError("INVALID_REQUEST", "decode requires --manifest and --key");
      }
      const masterKey = loadMasterKey(keyPath);
      const manifest = openManifest(new Uint8Array(readFileSync(resolve(manifestPath))), masterKey);
      masterKey.fill(0);
      const decoded = decodePlate(manifest);

      process.stdout.write(`plate id          ${manifest.plateId}\n`);
      process.stdout.write(`mode              ${decoded.mode}\n`);
      process.stdout.write(`visual decoding   ${decoded.visualDecodingGuaranteed ? "guaranteed" : "not guaranteed"}\n`);
      process.stdout.write(`irreversible      ${decoded.irreversibleSites.length}\n`);
      process.stdout.write(`\nrecovered phrase:\n${decoded.phrase}\n`);
      return;
    }

    default:
      process.stdout.write(
        [
          "Studio 137 Phrase-to-Plate",
          "",
          "  s137 keygen  --out <path>",
          "      Generate the artist master key. Run once; back it up off-repo.",
          "",
          "  s137 golden  [--out <dir>] [--key <path>]",
          "      Compile the permanent golden fixture (spec §29).",
          "",
          "  s137 compile --phrase <text> --seed <text> [--density 0-100]",
          "               [--corruption 0-100] [--layout <id>] [--substrate <id>]",
          "               [--preset <id>] [--mode exact|stylized] [--out <dir>]",
          "               [--key <path>] [--background solid|transparent] [--no-png]",
          "",
          "  s137 ring    <WORD> [--square <planet>] [--out <dir>] [--force]",
          "      One word in, four artifacts out: the sheet, the legend, the",
          "      census, and the receipt that reads the mark back to the word.",
          "      Any word resolves - the concept table rides, it never gates.",
          "      Files are named <slug>-<digest of the exact word and square>, so",
          "      SUN-DOG and SUN DOG keep their own four files. An existing file",
          "      whose bytes differ is refused, not replaced; --force replaces it.",
          "",
          "  s137 decode  --manifest <file.s137> --key <path>",
          "      Recover the exact source phrase from a private manifest.",
          "",
        ].join("\n"),
      );
  }
}

try {
  main();
} catch (error) {
  if (error instanceof PlateError) {
    process.stderr.write(`${error.code}: ${error.message}\n`);
    if (Object.keys(error.detail).length > 0) {
      process.stderr.write(`${JSON.stringify(error.detail, null, 2)}\n`);
    }
    process.exitCode = 1;
  } else {
    throw error;
  }
}

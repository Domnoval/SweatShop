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

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import {
  fromHex,
  normalizeUiRequest,
  OUTPUT_PRESETS,
  PlateError,
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
import { ringStem, writeRingArtifacts } from "./ring-paths.js";

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

      // Read once and reuse: these select the sheet AND name the file, and the two
      // have to be the same strings or the name stops identifying the run.
      const square = stringOption(options, "square");
      // `--cipher` exists so the CLI can express what the instrument's CIPHER
      // control expresses. Without it the browser could draw a plate no CLI
      // invocation could produce, and `scripts/build-browser-bundle.ts` compares
      // the two by running this command — a knob only one side has is a hole in
      // the parity check, not a feature.
      const cipher = stringOption(options, "cipher");

      const artifacts = ring(word, {
        vocabulary: WORD_CORRESPONDENCE.map((w) => w.word),
        ...(square === undefined ? {} : { square: square as never }),
        ...(cipher === undefined ? {} : { cipher: cipher as never }),
      });

      const stem = ringStem(outDir, word, square, cipher);
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
          "  s137 ring    <WORD> [--square <planet>] [--cipher PYTH|NAEQ|HEB] [--out <dir>] [--force]",
          "      One word in, four artifacts out: the sheet, the legend, the",
          "      census, and the receipt that reads the mark back to the word.",
          "      Any word resolves - the concept table rides, it never gates.",
          "      Files are named <slug>-<digest of the word, square and cipher>, so",
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

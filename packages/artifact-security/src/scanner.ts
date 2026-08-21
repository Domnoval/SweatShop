/**
 * Public artifact leakage scanning (spec §24, verification Gate 5).
 *
 * Public metadata scrubbing is mandatory for SVG, PNG, and future PDF exports.
 * This scanner is the enforcement point: an artifact that fails it must not be
 * released, and the export path calls it rather than trusting the renderer.
 *
 * Findings never echo the secret they matched. Reporting a leak by quoting it
 * would move the phrase into logs and error reports — which is the same failure
 * one step further out.
 */

import { PlateError } from "@studio137/plate-core";

/**
 * The private material a public artifact must not contain.
 *
 * Assembled by the export path from the request, the source payload, and the
 * manifest, so the scanner checks against what this specific plate actually
 * knows rather than against a guess.
 */
export type ScanSecrets = Readonly<{
  phrase: string;
  normalizedPhrase: string;
  seed: string;
  seedDigest: string;
  sourceDigest: string;
  payloadRefs: readonly string[];
  /** Text held inside literal escape nodes. */
  literalPayloads: readonly string[];
}>;

export type LeakFinding = Readonly<{
  code: string;
  message: string;
  /** Byte offset of the match. The matched text itself is never included. */
  offset: number;
}>;

/** Substrings shorter than this are too collision-prone to scan for. */
const MINIMUM_SECRET_LENGTH = 4;

/**
 * Public identifiers a scrubbed artifact is allowed to carry.
 *
 * Ordinal node ids (spec §14.2) and the scene layer names. Anything else in an
 * `id` is a finding — which is what makes it safe to exclude id values from the
 * secret search below.
 */
const ALLOWED_ID = /^(?:(?:g|m|s|e|x|decoy|mask)\d{6}|substrate|decoys-behind|canonical-payload|reversible-transforms|payload-masks|decoys-front|atmosphere|registration|print-boundaries)$/u;

/**
 * Blank out markup structure, preserving byte offsets.
 *
 * Element names, attribute names, and the values of purely structural
 * attributes are vocabulary this renderer chooses — they cannot carry a secret,
 * but they *can* collide with one. A seed of "boundaries" is a real seed, and
 * refusing to export because the file contains `id="print-boundaries"` would be
 * a false positive that blocks legitimate work.
 *
 * Offsets are preserved by substituting spaces, so a finding still points at the
 * right place in the original artifact.
 */
function maskStructuralTokens(content: string): string {
  const blank = (length: number): string => " ".repeat(length);

  return content
    // Element names, opening and closing.
    .replace(/<\/?([a-zA-Z][\w:.-]*)/gu, (match) => blank(match.length))
    // Structural attribute values: identifiers this renderer generates itself.
    .replace(/\b(?:id|mask|xmlns|maskUnits|clip-path|shape-rendering)\s*=\s*"([^"]*)"/gu, (match) =>
      blank(match.length),
    )
    // Attribute names everywhere else; their values stay scannable.
    .replace(/\b([a-zA-Z][\w:.-]*)\s*=\s*"/gu, (match) => blank(match.length));
}

type PatternRule = Readonly<{ code: string; message: string; pattern: RegExp }>;

/**
 * Structural leak patterns.
 *
 * Each corresponds to a bullet in spec §24. They are deliberately broad: a false
 * positive costs one export cycle, a false negative ships the artist's phrase.
 */
const PATTERN_RULES: readonly PatternRule[] = Object.freeze([
  {
    code: "ABSOLUTE_POSIX_PATH",
    message: "Artifact contains an absolute filesystem path",
    pattern: /(?:^|[\s"'(=])\/(?:home|Users|var|tmp|opt|usr|root|mnt|srv|private|Volumes)\//u,
  },
  {
    code: "WINDOWS_PATH",
    message: "Artifact contains a Windows path or UNC share",
    pattern: /(?:[A-Za-z]:\\\\?|\\\\\\\\[A-Za-z0-9_-]+\\)/u,
  },
  {
    code: "FILE_URL",
    message: "Artifact contains a file:// URL",
    pattern: /file:\/\//iu,
  },
  {
    code: "ENVIRONMENT_VARIABLE",
    message: "Artifact contains an environment variable reference or credential name",
    pattern:
      /(?:process\.env|\bAWS_[A-Z_]+|\bAPI[_-]?KEY\b|\bSECRET[_-]?KEY\b|\bACCESS[_-]?TOKEN\b|\bPRIVATE[_-]?KEY\b)/iu,
  },
  {
    code: "TIMESTAMP",
    message: "Artifact contains a timestamp",
    pattern: /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?/u,
  },
  {
    code: "SOFTWARE_STRING",
    message: "Artifact contains an authoring-software string or editor namespace",
    pattern:
      /(?:sodipodi|inkscape|illustrator|adobe|coreldraw|sketchapp|\bfigma\b|generator=|created with|\bGIMP\b)/iu,
  },
  {
    code: "SOURCE_MAP",
    message: "Artifact references a source map",
    pattern: /sourceMappingURL/iu,
  },
  {
    code: "REPOSITORY_REFERENCE",
    message: "Artifact references a source repository",
    pattern: /(?:github\.com|gitlab\.com|bitbucket\.org|\.git\b)/iu,
  },
  {
    code: "HOSTNAME",
    message: "Artifact contains what looks like a machine hostname",
    pattern: /\b[a-z0-9][a-z0-9-]{1,62}\.(?:local|lan|internal|localdomain)\b/iu,
  },
  {
    code: "KEY_MATERIAL",
    message: "Artifact contains encryption key material",
    pattern: /-----BEGIN [A-Z ]*(?:PRIVATE KEY|CERTIFICATE)-----/u,
  },
  {
    code: "XML_COMMENT",
    message: "Artifact contains an XML comment, which may carry development evidence",
    pattern: /<!--/u,
  },
  {
    code: "XML_METADATA",
    message: "Artifact contains a metadata, title, or desc element",
    pattern: /<(?:metadata|title|desc)[\s>]/iu,
  },
  {
    code: "FOREIGN_NAMESPACE",
    message: "Artifact declares a namespace other than SVG or xlink",
    pattern: /xmlns:(?!xlink\b)[a-z0-9-]+\s*=/iu,
  },
  {
    code: "PNG_TEXT_CHUNK",
    message: "Artifact retains a PNG text chunk",
    pattern: /(?:tEXt|zTXt|iTXt|eXIf)/u,
  },
]);

/**
 * Every `id` in an SVG must be an ordinal node id or a known layer name.
 *
 * Spec §14.2 forbids deriving ids from source text hashes. Checking the shape of
 * each id is what lets the secret search skip id values without opening a hole.
 */
function scanIdentifiers(content: string): readonly LeakFinding[] {
  const findings: LeakFinding[] = [];
  for (const match of content.matchAll(/\bid\s*=\s*"([^"]*)"/gu)) {
    const value = match[1] ?? "";
    if (!ALLOWED_ID.test(value)) {
      findings.push(
        Object.freeze({
          code: "NON_ORDINAL_ID",
          message:
            "Artifact contains an id that is neither an ordinal node id nor a known layer name",
          offset: match.index,
        }),
      );
    }
  }
  return Object.freeze(findings);
}

function findSecret(haystack: string, secret: string, code: string, message: string): LeakFinding | undefined {
  if (secret.length < MINIMUM_SECRET_LENGTH) return undefined;
  const direct = haystack.indexOf(secret);
  if (direct >= 0) return Object.freeze({ code, message, offset: direct });
  const folded = haystack.toLowerCase().indexOf(secret.toLowerCase());
  if (folded >= 0) return Object.freeze({ code, message, offset: folded });
  return undefined;
}

export type ScanOptions = Readonly<{
  /**
   * Apply the structural pattern rules.
   *
   * Disabled when scanning compressed binary payloads: deflate output contains
   * arbitrary byte sequences, and a text heuristic like "letter, colon,
   * backslash" fires on it by chance several times per megabyte. Secret
   * substring checks still run over the whole stream.
   */
  patternRules?: boolean;
  /**
   * Blank markup structure before searching for secrets. On by default; set
   * false to scan raw content, as the injected-leak tests do.
   */
  maskStructure?: boolean;
}>;

/**
 * Scan public artifact text.
 *
 * `content` is the artifact decoded as text. For binary formats prefer
 * `scanPublicPng`, which understands chunk structure; `scanPublicBytes` is the
 * generic fallback.
 */
export function scanPublicArtifact(
  content: string,
  secrets: ScanSecrets,
  options: ScanOptions = {},
): readonly LeakFinding[] {
  const findings: LeakFinding[] = [];

  // Secrets are searched in the artifact minus its own markup vocabulary;
  // structural rules still run against the original text.
  const searchable =
    options.maskStructure === false ? content : maskStructuralTokens(content);

  const secretChecks: readonly (readonly [string, string, string])[] = [
    [secrets.phrase, "SOURCE_PHRASE", "Artifact contains the source phrase"],
    [secrets.normalizedPhrase, "NORMALIZED_PHRASE", "Artifact contains the normalized phrase"],
    [secrets.seed, "SEED", "Artifact contains the seed"],
    [secrets.seedDigest, "SEED_DIGEST", "Artifact contains the seed digest"],
    [secrets.sourceDigest, "SOURCE_DIGEST", "Artifact contains the source digest"],
  ];

  for (const [secret, code, message] of secretChecks) {
    const finding = findSecret(searchable, secret, code, message);
    if (finding !== undefined) findings.push(finding);
  }

  for (const payload of secrets.literalPayloads) {
    const finding = findSecret(
      searchable,
      payload,
      "LITERAL_PAYLOAD",
      "Artifact contains literal escape payload text",
    );
    if (finding !== undefined) {
      findings.push(finding);
      break;
    }
  }

  for (const ref of secrets.payloadRefs) {
    const finding = findSecret(
      searchable,
      ref,
      "PAYLOAD_REF",
      "Artifact contains a private manifest payload reference",
    );
    if (finding !== undefined) {
      findings.push(finding);
      break;
    }
  }

  if (options.patternRules !== false) {
    for (const rule of PATTERN_RULES) {
      const match = rule.pattern.exec(content);
      if (match !== null) {
        findings.push(
          Object.freeze({ code: rule.code, message: rule.message, offset: match.index }),
        );
      }
    }
    findings.push(...scanIdentifiers(content));
  }

  return Object.freeze(findings);
}

const latin1 = new TextDecoder("latin1");

export function scanPublicBytes(
  bytes: Uint8Array,
  secrets: ScanSecrets,
  options: ScanOptions = {},
): readonly LeakFinding[] {
  return scanPublicArtifact(latin1.decode(bytes), secrets, options);
}

const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** PNG chunk types a scrubbed production file is permitted to carry (spec §15.1). */
const PNG_ALLOWED_CHUNKS: ReadonlySet<string> = new Set([
  "IHDR",
  "PLTE",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "pHYs",
  "IDAT",
  "IEND",
]);

/**
 * Scan a production PNG.
 *
 * Structure-aware rather than byte-blind: chunk types are checked against the
 * allow-list, ancillary chunk payloads get the full pattern rules, and the
 * secret substring checks run across every byte. `IDAT` payloads are exempt
 * from the pattern rules only — a leak cannot hide there, because a phrase
 * written into a PNG lands in a text chunk, and any text chunk at all is a
 * finding.
 */
export function scanPublicPng(bytes: Uint8Array, secrets: ScanSecrets): readonly LeakFinding[] {
  // Chunk type fields are PNG's own vocabulary. Blanking them before the
  // whole-stream secret search stops a seed like "phys" from matching the
  // `pHYs` header — a collision, not a leak.
  const masked = bytes.slice();
  for (let offset = PNG_SIGNATURE.length; offset + 8 <= masked.length; ) {
    const chunkLength = new DataView(masked.buffer, masked.byteOffset, masked.byteLength).getUint32(
      offset,
      false,
    );
    masked.fill(0x20, offset + 4, offset + 8);
    const step = 12 + chunkLength;
    if (step <= 0 || offset + step > masked.length) break;
    offset += step;
  }

  const findings: LeakFinding[] = [
    ...scanPublicBytes(masked, secrets, { patternRules: false, maskStructure: false }),
  ];

  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (bytes[index] !== PNG_SIGNATURE[index]) {
      return Object.freeze([
        ...findings,
        Object.freeze({
          code: "NOT_A_PNG",
          message: "Artifact does not carry a PNG signature",
          offset: 0,
        }),
      ]);
    }
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = PNG_SIGNATURE.length;

  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = latin1.decode(bytes.subarray(offset + 4, offset + 8));
    const total = 12 + length;
    if (offset + total > bytes.length) {
      findings.push(
        Object.freeze({
          code: "PNG_TRUNCATED",
          message: `PNG chunk "${type}" is truncated`,
          offset,
        }),
      );
      break;
    }

    if (!PNG_ALLOWED_CHUNKS.has(type)) {
      findings.push(
        Object.freeze({
          code: "PNG_DISALLOWED_CHUNK",
          message: `PNG retains the "${type}" chunk, which is not on the production allow-list`,
          offset,
        }),
      );
    } else if (type !== "IDAT") {
      const payload = latin1.decode(bytes.subarray(offset + 8, offset + 8 + length));
      for (const finding of scanPublicArtifact(payload, secrets, { maskStructure: false })) {
        findings.push(Object.freeze({ ...finding, offset: offset + 8 + finding.offset }));
      }
    }

    offset += total;
    if (type === "IEND") break;
  }

  return Object.freeze(findings);
}

/**
 * Refuse to release an artifact that fails the scan.
 *
 * The thrown error carries codes and offsets only — never the matched text.
 */
export function assertNoLeaks(
  artifactName: string,
  content: string | Uint8Array,
  secrets: ScanSecrets,
  options: ScanOptions = {},
): void {
  const findings =
    typeof content === "string"
      ? scanPublicArtifact(content, secrets, options)
      : scanPublicBytes(content, secrets, options);

  if (findings.length > 0) {
    throw new PlateError(
      "PRIVACY_LEAK",
      `${artifactName} failed the public artifact scan with ${findings.length} finding(s): ` +
        findings.map((finding) => finding.code).join(", "),
      { artifactName, findings },
    );
  }
}

/** Refuse to release a production PNG that fails the structure-aware scan. */
export function assertPngHasNoLeaks(
  artifactName: string,
  png: Uint8Array,
  secrets: ScanSecrets,
): void {
  const findings = scanPublicPng(png, secrets);
  if (findings.length > 0) {
    throw new PlateError(
      "PRIVACY_LEAK",
      `${artifactName} failed the public artifact scan with ${findings.length} finding(s): ` +
        findings.map((finding) => finding.code).join(", "),
      { artifactName, findings },
    );
  }
}

/** The exclusion list from spec §14.2, exposed for documentation and tests. */
export const PUBLIC_METADATA_EXCLUSIONS: readonly string[] = Object.freeze([
  "source phrase",
  "normalized phrase",
  "seed",
  "semantic mapping",
  "private payload references",
  "local paths",
  "development machine filenames",
  "usernames",
  "hostnames",
  "repository locations",
  "timestamps",
  "software version strings",
  "editor namespaces",
  "source maps",
  "comments containing development evidence",
]);

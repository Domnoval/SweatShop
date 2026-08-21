/**
 * Verification Gate 5 — privacy scan (spec §26).
 *
 * Inspect decoded metadata and raw bytes for prohibited private or machine
 * information. Public metadata scrubbing is mandatory for SVG, PNG, and future
 * PDF exports (spec §24).
 */

import { describe, expect, it } from "vitest";

import { OUTPUT_PRESETS, PlateError } from "@studio137/plate-core";
import {
  assertNoLeaks,
  PUBLIC_METADATA_EXCLUSIONS,
  scanPublicArtifact,
  scanPublicPng,
} from "@studio137/artifact-security";
import {
  buildTranslationCard,
  compilePlate,
  exportPrivate,
  exportProductionPng,
  exportPublic,
  scanSecretsFor,
} from "@studio137/plate-compiler";

import { requestFor, testMasterKey } from "./helpers.js";

const SECRET_PHRASE = "THE UNSPOKEN NAME SURVIVES THE ARCHIVE";
const SECRET_SEED = "a-seed-nobody-should-see-9f3c";

const plate = compilePlate(
  requestFor({
    phrase: SECRET_PHRASE,
    seed: SECRET_SEED,
    outputSize: OUTPUT_PRESETS["poster-18x24"],
    density: 40,
    corruptionLevel: 35,
  }),
);
const published = exportPublic(plate);
const secrets = scanSecretsFor(plate);

describe("Gate 5: privacy scan", () => {
  it("keeps the phrase, seed, and digests out of the canonical SVG", () => {
    for (const artifact of [published.canonicalSvg, published.printSvg]) {
      expect(artifact).not.toContain(SECRET_PHRASE);
      expect(artifact).not.toContain(SECRET_SEED);
      expect(artifact).not.toContain(plate.rng.seedDigest);
      expect(artifact).not.toContain(plate.ast.sourceDigest);
      expect(artifact).not.toContain(plate.plateId);
    }
  });

  it("keeps payload references out of public artifacts", () => {
    for (const ref of secrets.payloadRefs) {
      expect(published.canonicalSvg).not.toContain(ref);
    }
  });

  it("emits ordinal ids that are not derived from source text", () => {
    const ids = [...published.canonicalSvg.matchAll(/ id="([^"]+)"/gu)].map((m) => m[1]!);
    const layerIds = new Set([
      "substrate",
      "decoys-behind",
      "canonical-payload",
      "reversible-transforms",
      "payload-masks",
      "decoys-front",
      "atmosphere",
      "registration",
      "print-boundaries",
    ]);
    for (const id of ids) {
      if (layerIds.has(id)) continue;
      expect(id).toMatch(/^(?:g|m|s|e|x|decoy|mask)\d{6}$/u);
    }
  });

  it("carries no comment, metadata element, or foreign namespace", () => {
    for (const artifact of [published.canonicalSvg, published.printSvg]) {
      expect(artifact).not.toContain("<!--");
      expect(artifact).not.toMatch(/<(?:metadata|title|desc)[\s>]/iu);
      expect(artifact).not.toMatch(/xmlns:(?!xlink)[a-z0-9-]+=/iu);
    }
  });

  it("carries no timestamp, path, hostname, or software string", () => {
    for (const artifact of [published.canonicalSvg, published.printSvg]) {
      expect(scanPublicArtifact(artifact, secrets)).toEqual([]);
    }
  });

  it("passes the structure-aware scan on the production PNG", () => {
    const raster = exportProductionPng(plate, published.canonicalSvg, {
      widthPx: 400,
      background: "#ffffff",
    });
    expect(scanPublicPng(raster.png, secrets)).toEqual([]);
  });

  it("strips every PNG chunk outside the production allow-list", () => {
    const raster = exportProductionPng(plate, published.canonicalSvg, { widthPx: 200 });
    const text = new TextDecoder("latin1").decode(raster.png);
    for (const chunk of ["tEXt", "zTXt", "iTXt", "eXIf", "tIME"]) {
      expect(text).not.toContain(chunk);
    }
  });

  it("keeps the collector translation card free of the phrase and reading order", () => {
    const card = JSON.stringify(buildTranslationCard(plate));
    expect(card).not.toContain(SECRET_PHRASE);
    expect(card).not.toContain(SECRET_SEED);
    expect(card).not.toContain(plate.rng.seedDigest);
    // The card names which families appear, never in what order they read.
    expect(card).not.toContain("readingOrder");
    expect(card).not.toContain("tokenMappings");
  });

  it("does keep the source inside the private artifacts, where it belongs", () => {
    const key = testMasterKey();
    const exported = exportPrivate(plate, key);
    expect(exported.clauseSheetMarkdown).toContain(SECRET_PHRASE);
    // ...but never in plaintext inside the sealed container.
    const container = new TextDecoder("latin1").decode(exported.container);
    expect(container).not.toContain(SECRET_PHRASE);
    expect(container).not.toContain(SECRET_SEED);
  });

  it("catches each prohibited class when it is deliberately injected", () => {
    const cases: readonly (readonly [string, string])[] = [
      ["SOURCE_PHRASE", `<svg>${SECRET_PHRASE}</svg>`],
      ["SEED", `<svg>${SECRET_SEED}</svg>`],
      ["ABSOLUTE_POSIX_PATH", '<svg d="/home/artist/plates/x.svg"/>'],
      ["WINDOWS_PATH", '<svg d="C:\\\\Users\\\\artist\\\\plate.svg"/>'],
      ["FILE_URL", '<svg><image href="file:///tmp/x.png"/></svg>'],
      ["ENVIRONMENT_VARIABLE", "<svg>AWS_SECRET_ACCESS_KEY</svg>"],
      ["TIMESTAMP", "<svg>2026-08-21T09:15:00Z</svg>"],
      ["SOFTWARE_STRING", '<svg xmlns:x="y" sodipodi:docname="plate"/>'],
      ["SOURCE_MAP", "<svg>/*# sourceMappingURL=a.map */</svg>"],
      ["REPOSITORY_REFERENCE", "<svg>github.com/studio137/plates</svg>"],
      ["HOSTNAME", "<svg>studio-mac.local</svg>"],
      ["KEY_MATERIAL", "<svg>-----BEGIN PRIVATE KEY-----</svg>"],
      ["XML_COMMENT", "<svg><!-- draft 3 --></svg>"],
      ["XML_METADATA", "<svg><metadata>x</metadata></svg>"],
    ];

    for (const [code, content] of cases) {
      const findings = scanPublicArtifact(content, secrets);
      expect(findings.map((finding) => finding.code)).toContain(code);
    }
  });

  it("never echoes the secret it matched", () => {
    const findings = scanPublicArtifact(`<svg>${SECRET_PHRASE}${SECRET_SEED}</svg>`, secrets);
    expect(findings.length).toBeGreaterThan(0);
    const serialized = JSON.stringify(findings);
    expect(serialized).not.toContain(SECRET_PHRASE);
    expect(serialized).not.toContain(SECRET_SEED);
  });

  it("blocks the export rather than warning", () => {
    expect(() => assertNoLeaks("test artifact", `<svg>${SECRET_PHRASE}</svg>`, secrets)).toThrowError(
      PlateError,
    );
    try {
      assertNoLeaks("test artifact", `<svg>${SECRET_PHRASE}</svg>`, secrets);
    } catch (error) {
      expect((error as PlateError).code).toBe("PRIVACY_LEAK");
      expect((error as PlateError).message).not.toContain(SECRET_PHRASE);
    }
  });

  it("documents every exclusion the spec lists", () => {
    expect(PUBLIC_METADATA_EXCLUSIONS).toHaveLength(15);
  });
});

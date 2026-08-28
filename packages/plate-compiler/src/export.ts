/**
 * Public and private export paths (spec §13, §23, §24).
 *
 * These are deliberately two functions with two return types. Spec §22.5 and
 * §13 both insist that public and private artifacts never travel together, and
 * §23 requires the public export endpoint to be incapable of returning a
 * manifest or a clause sheet. Keeping them separate at the type level is how
 * that stops being a convention someone can forget.
 */

import {
  PlateError,
  sha256Hex,
  type PlateId,
  type VersionContract,
} from "@studio137/plate-core";
import {
  geometryRegistry,
  geometryRegistryV2,
  type GeometryRegistry,
} from "@studio137/glyph-registry";
import {
  renderScene,
  resolvePrintTemplate,
  type PlatePalette,
  type PrintTemplate,
  type RenderedScene,
  type SceneLayer,
} from "@studio137/render-svg";
import { assertNoLeaks, type ScanSecrets } from "@studio137/artifact-security";
import {
  MANIFEST_SCHEMA,
  MANIFEST_VERSION,
  sealManifest,
  type MasterKey,
  type PrivateEncodingManifest,
} from "@studio137/private-manifest";

import type { CompiledPlate } from "./compile.js";
import { registryDigest } from "./compile.js";
import { buildClauseSheet, renderClauseSheetMarkdown, type ClauseSheet } from "./clause-sheet.js";

export type PublicExportOptions = Readonly<{
  palette?: PlatePalette;
  backgroundPolicy?: "transparent" | "solid";
  layers?: Partial<Record<SceneLayer, boolean>>;
  /** Overrides the template matched from the output size. */
  printTemplate?: PrintTemplate;
}>;

export type PublicExport = Readonly<{
  plateId: PlateId;
  versions: VersionContract;
  /** `plate-{plateId}.canonical.svg` */
  canonicalSvg: string;
  canonicalSvgSha256: string;
  /** `plate-{plateId}.print.svg` */
  printSvg: string;
  printSvgSha256: string;
  canonicalPathDigest: string;
  printTemplateId: string;
  /** False until a physical proof of this template has passed (spec Phase 10). */
  printTemplateValidated: boolean;
  renderedNodeIds: readonly string[];
  omittedNodeIds: readonly string[];
  /** Registry digest after export, closing verification Gate 4's sequence. */
  pathIntegrityAfterExport: string;
}>;

/**
 * Secrets this plate must not leak.
 *
 * Assembled from the compiled plate rather than guessed, so the scan checks the
 * actual phrase, seed, and payload references in play.
 */
export function scanSecretsFor(plate: CompiledPlate): ScanSecrets {
  return Object.freeze({
    phrase: plate.source.originalText,
    normalizedPhrase: plate.source.normalizedSemanticView,
    seed: plate.request.seed,
    seedDigest: plate.rng.seedDigest,
    sourceDigest: plate.ast.sourceDigest,
    payloadRefs: Object.freeze(plate.tokenMappings.map((mapping) => mapping.payloadRef)),
    literalPayloads: Object.freeze(
      plate.tokenMappings
        .filter((mapping) => mapping.classification === "unsupported")
        .map((mapping) => mapping.sourceText),
    ),
  });
}

/**
 * Export the public artifacts.
 *
 * Every artifact is scanned before it is returned. A failing scan raises
 * PRIVACY_LEAK and no artifact is released — spec §24 makes scrubbing mandatory,
 * not advisory.
 */
/**
 * The registry a plate declared, not whichever one this module was written with.
 *
 * `exportPublic` loaded `geometry/v1` unconditionally. While v1 was the only
 * contract that was invisible; the moment a plate could pin anything else, the
 * export rendered one vocabulary onto a plate sealed with the name of another —
 * the exact defect `assertRegistriesMatchContract` guards on the compile side,
 * reappearing on the export side where nothing was checking.
 *
 * It fails closed rather than falling back, because a silent fallback is how the
 * first version of this bug survived.
 */
function registryFor(versions: CompiledPlate["versions"]): GeometryRegistry {
  switch (versions.geometryVersion) {
    case "geometry/v1":
      return geometryRegistry();
    case "geometry/v2":
      return geometryRegistryV2();
    default:
      throw new PlateError(
        "UNSUPPORTED_VERSION",
        `No geometry registry is loadable for "${versions.geometryVersion}". ` +
          `An export must draw from the vocabulary its plate declares.`,
        { geometryVersion: versions.geometryVersion },
      );
  }
}

export function exportPublic(
  plate: CompiledPlate,
  options: PublicExportOptions = {},
): PublicExport {
  const geometry = registryFor(plate.versions);
  const secrets = scanSecretsFor(plate);

  const scene: RenderedScene = renderScene({
    plateId: plate.plateId,
    output: plate.output,
    layout: plate.presentation.layout,
    corruption: plate.presentation.corruption,
    decoys: plate.presentation.decoys,
    atmosphere: plate.presentation.atmosphere,
    substrateGuides: plate.presentation.substrateGuides,
    geometry,
    backgroundPolicy: options.backgroundPolicy ?? "solid",
    ...(options.palette === undefined ? {} : { palette: options.palette }),
    ...(options.layers === undefined ? {} : { layers: options.layers }),
  });

  // The print composition wraps the canonical plate in a product template. It
  // does not alter glyph paths; the vector master stays available independently
  // (spec §17.1). The digest comparison below proves that on every export.
  const printTemplate: PrintTemplate = options.printTemplate ?? resolvePrintTemplate(plate.output);
  const print: RenderedScene = renderScene({
    printTemplate,
    plateId: plate.plateId,
    output: plate.output,
    layout: plate.presentation.layout,
    corruption: plate.presentation.corruption,
    decoys: plate.presentation.decoys,
    atmosphere: plate.presentation.atmosphere,
    substrateGuides: plate.presentation.substrateGuides,
    geometry,
    backgroundPolicy: "solid",
    ...(options.palette === undefined ? {} : { palette: options.palette }),
    layers: { ...(options.layers ?? {}), registration: true },
  });

  if (print.canonicalPathDigest !== scene.canonicalPathDigest) {
    throw new PlateError(
      "CANONICAL_MUTATION",
      "The print composition altered canonical payload geometry. Print concerns must wrap the " +
        "plate, never modify it.",
      { canonical: scene.canonicalPathDigest, print: print.canonicalPathDigest },
    );
  }

  assertNoLeaks("canonical SVG", scene.svg, secrets);
  assertNoLeaks("print composition", print.svg, secrets);

  return Object.freeze({
    plateId: plate.plateId,
    versions: plate.versions,
    canonicalSvg: scene.svg,
    canonicalSvgSha256: sha256Hex(scene.svg),
    printSvg: print.svg,
    printSvgSha256: sha256Hex(print.svg),
    canonicalPathDigest: scene.canonicalPathDigest,
    printTemplateId: printTemplate.id,
    printTemplateValidated: printTemplate.physicallyValidated,
    renderedNodeIds: scene.renderedNodeIds,
    omittedNodeIds: scene.omittedNodeIds,
    pathIntegrityAfterExport: registryDigest(geometry),
  });
}

export type PrivateExport = Readonly<{
  plateId: PlateId;
  manifest: PrivateEncodingManifest;
  /** `plate-{plateId}.private.s137` */
  container: Uint8Array;
  clauseSheet: ClauseSheet;
  clauseSheetMarkdown: string;
}>;

/**
 * Export the private artifacts.
 *
 * Requires the artist's master key. The key is used here and nowhere else, and
 * is never written to a log, an artifact, or the returned structure.
 */
export function exportPrivate(
  plate: CompiledPlate,
  masterKey: MasterKey,
  publicArtifacts?: Readonly<{
    canonicalSvgSha256?: string;
    printSvgSha256?: string;
    productionPngSha256?: string;
  }>,
): PrivateExport {
  // Built with the public artifact hashes the caller supplied, so the sheet the
  // manifest digests is byte-identical to the sheet callers write. Digesting a
  // sheet built without them made `verifyArtifactDigests` report tampering on
  // an untampered pair.
  const clauseSheet = buildClauseSheet(plate, {
    ...(publicArtifacts?.canonicalSvgSha256 === undefined
      ? {}
      : { canonicalSvg: publicArtifacts.canonicalSvgSha256 }),
    ...(publicArtifacts?.printSvgSha256 === undefined
      ? {}
      : { printSvg: publicArtifacts.printSvgSha256 }),
    ...(publicArtifacts?.productionPngSha256 === undefined
      ? {}
      : { productionPng: publicArtifacts.productionPngSha256 }),
  });
  const clauseSheetMarkdown = renderClauseSheetMarkdown(clauseSheet);

  const manifest: PrivateEncodingManifest = Object.freeze({
    schema: MANIFEST_SCHEMA,
    manifestVersion: MANIFEST_VERSION,
    plateId: plate.plateId,
    versions: plate.versions,
    request: plate.request,
    source: plate.source,
    tokenMappings: plate.tokenMappings,
    inverseOperations: plate.presentation.corruption.inverseOperations,
    corruptionSites: plate.presentation.corruption.corruptionSites,
    occlusionSites: plate.presentation.corruption.occlusionSites,
    rng: Object.freeze({
      seedDigest: plate.rng.seedDigest,
      streamDerivationVersion: plate.rng.streamDerivationVersion,
      streamDigests: plate.rng.streamDigests,
    }),
    artifacts: Object.freeze({
      canonicalSvgSha256: publicArtifacts?.canonicalSvgSha256 ?? "",
      productionPngSha256: publicArtifacts?.productionPngSha256 ?? "",
      printCompositionSha256: publicArtifacts?.printSvgSha256 ?? "",
      clauseSheetSha256: sha256Hex(clauseSheetMarkdown),
    }),
  });

  return Object.freeze({
    plateId: plate.plateId,
    manifest,
    container: sealManifest(manifest, masterKey),
    clauseSheet,
    clauseSheetMarkdown,
  });
}

/** Canonical artifact filenames (spec §13). */
export function artifactFilenames(plateId: PlateId): Readonly<Record<string, string>> {
  return Object.freeze({
    canonicalSvg: `plate-${plateId}.canonical.svg`,
    productionPng: `plate-${plateId}.production.png`,
    clauseSheet: `plate-${plateId}.clause-sheet.md`,
    printSvg: `plate-${plateId}.print.svg`,
    privateManifest: `plate-${plateId}.private.s137`,
  });
}

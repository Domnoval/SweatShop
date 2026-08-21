/**
 * `compilePlate` — the core compiler flow (spec §25).
 *
 * Phrase and seed in, a frozen `CompiledPlate` out. The canonical AST and the
 * presentation plan are separate throughout: layout, corruption, decoys, and
 * atmosphere describe how the plate is *presented*, and none of them can reach
 * back into what it *means*.
 *
 * Path integrity is sampled at every stage, which is verification Gate 4's
 * required sequence: registry load, after semantic compilation, after layout,
 * after corruption planning, after atmosphere planning, and after public export.
 */

import {
  assertSupportedVersions,
  createNamedStreams,
  deepFreeze,
  densityProfile,
  deriveMasterSeed,
  derivePlateId,
  insetRect,
  parsePlateRequest,
  preserveSourcePayload,
  requestDigest,
  resolveOutput,
  sha256Hex,
  RNG_STREAM_NAMES,
  RNG_VERSION,
  STREAM_DERIVATION_VERSION,
  type Diagnostic,
  type PlateRequest,
  type Rect,
  type ResolvedOutput,
  type SourcePayload,
  type VersionContract,
} from "@studio137/plate-core";
import { CURRENT_VERSIONS } from "@studio137/plate-core";
import {
  geometryRegistry,
  grammarRegistry,
  type ExtendedGrammarRegistry,
  type GeometryRegistry,
} from "@studio137/glyph-registry";
import {
  analysePhrase,
  compileSemantics,
  glyphNodes,
  type CanonicalPlateAST,
  type PhraseAnalysis,
  type TokenMapping,
} from "@studio137/glyph-engine";
import { createSubstrate, type SubstrateGuide } from "@studio137/substrate-engine";
import {
  applyPermutations,
  collisionLimitFor,
  layoutSolver,
  type LayoutPlan,
} from "@studio137/layout-engine";
import {
  computePermutations,
  planAtmosphere,
  planCorruption,
  planDecoys,
  type AtmospherePlan,
  type CorruptibleNode,
  type CorruptionPlan,
  type DecoyNode,
} from "@studio137/corruption-engine";

import { buildEnvelopes } from "./envelopes.js";

export type PathIntegritySnapshot = Readonly<{ stage: string; digest: string }>;

export type PresentationPlan = Readonly<{
  substrateId: string;
  substrateConstruction: string;
  substrateGuides: readonly SubstrateGuide[];
  layout: LayoutPlan;
  corruption: CorruptionPlan;
  decoys: readonly DecoyNode[];
  atmosphere: AtmospherePlan;
}>;

export type CompiledPlate = Readonly<{
  plateId: string;
  versions: VersionContract;
  requestDigest: string;
  request: PlateRequest;
  /** Contains the artist's phrase. Never include this in a public artifact. */
  source: SourcePayload;
  ast: CanonicalPlateAST;
  /** Manifest-only. */
  tokenMappings: readonly TokenMapping[];
  analysis: PhraseAnalysis;
  presentation: PresentationPlan;
  output: ResolvedOutput;
  bounds: Readonly<{ full: Rect; trim: Rect; layout: Rect }>;
  rng: Readonly<{
    seedDigest: string;
    fingerprint: string;
    streamDerivationVersion: string;
    streamDigests: Readonly<Record<string, string>>;
  }>;
  pathIntegrity: readonly PathIntegritySnapshot[];
  diagnostics: readonly Diagnostic[];
}>;

export type CompilerRegistries = Readonly<{
  grammar: ExtendedGrammarRegistry;
  geometry: GeometryRegistry;
  versions: VersionContract;
}>;

export function defaultRegistries(): CompilerRegistries {
  return Object.freeze({
    grammar: grammarRegistry(),
    geometry: geometryRegistry(),
    versions: CURRENT_VERSIONS,
  });
}

/** Non-semantic geometry the decoy planner may borrow. */
function decoyGeometryIds(geometry: GeometryRegistry): readonly string[] {
  // Separator and modifier marks make good decoys: they read as authored
  // notation without ever standing in for a root concept.
  return Object.freeze(
    geometry.ids.filter((id) => id.startsWith("sep-") || id.startsWith("mod-")),
  );
}

export function compilePlate(
  input: unknown,
  registries: CompilerRegistries = defaultRegistries(),
): CompiledPlate {
  const { grammar, geometry, versions } = registries;

  assertSupportedVersions(versions);
  geometry.verifyIntegrity();
  const integrity: PathIntegritySnapshot[] = [
    { stage: "registry-load", digest: registryDigest(geometry) },
  ];

  const request = parsePlateRequest(input);
  const source = preserveSourcePayload(request.phrase);
  const plateId = derivePlateId(request, versions);

  const master = deriveMasterSeed(request.seed);
  const streams = createNamedStreams(master, RNG_VERSION);

  // ── Semantics ───────────────────────────────────────────────────────────
  const semantics = compileSemantics({ source, plateId, versions, grammar, geometry });
  geometry.verifyIntegrity();
  integrity.push({ stage: "semantic-compilation", digest: registryDigest(geometry) });

  const diagnostics: Diagnostic[] = [...semantics.diagnostics];

  // ── Geometry of the field ───────────────────────────────────────────────
  const output = resolveOutput(request.outputSize);
  const bleedPx = Math.round((output.bleedMm / 25.4) * output.dpi);
  const safeMarginPx = Math.round((output.safeMarginMm / 25.4) * output.dpi);

  const full: Rect = Object.freeze({
    x: 0,
    y: 0,
    width: output.widthPx,
    height: output.heightPx,
  });
  const trim = insetRect(full, bleedPx);
  const layoutBounds = insetRect(trim, safeMarginPx);

  // ── Substrate ───────────────────────────────────────────────────────────
  const substrate = createSubstrate(request.mathematicalSubstrate, trim, streams.substrate);
  const profile = densityProfile(request.density);
  const substrateGuides = substrate.guides(profile.substrateFrequency);

  // ── Layout ──────────────────────────────────────────────────────────────
  const envelopes = buildEnvelopes(semantics.ast, grammar, geometry);
  const solver = layoutSolver(request.layoutFamily);
  const authoredLayout = solver.solve({
    nodes: envelopes,
    bounds: layoutBounds,
    density: request.density,
    substrate,
    rng: streams.layout,
    output,
  });
  geometry.verifyIntegrity();
  integrity.push({ stage: "layout", digest: registryDigest(geometry) });

  // ── Corruption ──────────────────────────────────────────────────────────
  const corruptibleNodes: readonly CorruptibleNode[] = Object.freeze(
    envelopes.map((envelope): CorruptibleNode => {
      const node = glyphNodes(semantics.ast).find(
        (candidate) => candidate.nodeId === envelope.nodeId,
      );
      const family = node === undefined ? undefined : grammar.root(node.rootFamilyId);
      return Object.freeze({
        nodeId: envelope.nodeId,
        clauseIndex: envelope.clauseIndex,
        kind: envelope.kind,
        ...(node === undefined ? {} : { rootFamilyId: node.rootFamilyId }),
        ...(node === undefined ? {} : { mirrorEligibility: node.mirrorEligibility }),
        ...(node === undefined ? {} : { corruptionEligibility: node.corruptionEligibility }),
        clauseAnchor: envelope.clauseAnchor,
        coreAnchor: family?.coreAnchor ?? false,
      });
    }),
  );

  // Permutation is resolved into the layout before anything else is planned
  // against it. Occlusion masks, decoy exclusion zones, and atmosphere all read
  // placement bounds, and a glyph that moves afterwards leaves every one of
  // them pointing at the field it used to occupy.
  const permutations = computePermutations(
    corruptibleNodes,
    request.corruptionLevel,
    streams.corruption,
  );
  const layout = applyPermutations(
    authoredLayout,
    permutations,
    envelopes,
    output,
    collisionLimitFor(request.density),
  );

  const corruption = planCorruption({
    nodes: corruptibleNodes,
    layout,
    level: request.corruptionLevel,
    mode: request.mode,
    grammar,
    rng: streams.corruption,
  });
  geometry.verifyIntegrity();
  integrity.push({ stage: "corruption-planning", digest: registryDigest(geometry) });

  // ── Decoys and atmosphere ───────────────────────────────────────────────
  diagnostics.push(...layout.diagnostics);

  const decoys = planDecoys({
    layout,
    density: request.density,
    level: request.corruptionLevel,
    decoyGeometryIds: decoyGeometryIds(geometry),
    inkBoundsFor: (id) => geometry.inkBounds(id),
    rng: streams.decoys,
  });

  const atmosphere = planAtmosphere({
    layout,
    density: request.density,
    level: request.corruptionLevel,
    rng: streams.atmosphere,
  });
  geometry.verifyIntegrity();
  integrity.push({ stage: "atmosphere-planning", digest: registryDigest(geometry) });

  const analysis = analysePhrase({
    source,
    ast: semantics.ast,
    tokenMappings: semantics.tokenMappings,
    diagnostics: Object.freeze(diagnostics),
    grammar,
    mode: request.mode,
  });

  return deepFreeze({
    plateId,
    versions,
    requestDigest: requestDigest(request, versions),
    request,
    source,
    ast: semantics.ast,
    tokenMappings: semantics.tokenMappings,
    analysis,
    presentation: {
      substrateId: substrate.id,
      substrateConstruction: substrate.construction,
      substrateGuides,
      layout,
      corruption,
      decoys,
      atmosphere,
    },
    output,
    bounds: { full, trim, layout: layoutBounds },
    rng: {
      seedDigest: master.digestHex,
      fingerprint: master.fingerprint,
      streamDerivationVersion: STREAM_DERIVATION_VERSION,
      streamDigests: Object.fromEntries(
        RNG_STREAM_NAMES.map((name) => [name, streams.digests[name]]),
      ),
    },
    pathIntegrity: integrity,
    diagnostics,
  }) as CompiledPlate;
}

/** Digest over every locked path in the registry, in sorted id order. */
export function registryDigest(geometry: GeometryRegistry): string {
  return sha256Hex(geometry.ids.map((id) => `${id}:${geometry.get(id).integritySha256}`).join("|"));
}

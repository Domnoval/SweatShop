/**
 * Locked geometry registry and the path-integrity tripwire (spec §12.1, §26 Gate 4).
 *
 * Every record declares a SHA-256 over its own path data. The hashes live in a
 * generated file that is committed alongside the paths, so an accidental edit to
 * a released glyph fails the registry load rather than silently changing every
 * plate ever made from it.
 *
 * `verifyIntegrity()` is cheap and is called at each pipeline stage — registry
 * load, after semantic compilation, after layout, after corruption planning,
 * after atmosphere planning, and after public export — which is exactly the
 * sequence Gate 4 requires.
 */

import {
  canonicalDigest,
  PlateError,
  type GlyphGeometryId,
  type Rect,
} from "@studio137/plate-core";

import {
  GEOMETRY_IS_PROVISIONAL,
  GEOMETRY_V1_SOURCE,
  GEOMETRY_VERSION,
  MINIMUM_PRINT_STROKE_PT,
  type GeometrySource,
} from "./geometry.v1.js";
import {
  GEOMETRY_V2_IS_PROVISIONAL,
  GEOMETRY_V2_SOURCE,
  GEOMETRY_V2_VERSION,
} from "./geometry.v2.js";
import { GEOMETRY_V1_INTEGRITY } from "./geometry-integrity.v1.js";
import { GEOMETRY_V2_INTEGRITY } from "./geometry-integrity.v2.js";
import type { GeometryRegistry, GlyphGeometryRecord } from "./types.js";

/**
 * Digest of the immutable part of a record: its coordinate space and its paths.
 *
 * Anchors, envelopes, and print minimums are deliberately excluded — those are
 * layout metadata that a later revision may refine without redrawing the glyph.
 * What must never change is the ink.
 */
export function pathDigest(source: Pick<GeometrySource, "viewBox" | "paths">): string {
  return canonicalDigest({
    viewBox: [...source.viewBox],
    paths: source.paths.map((path) => ({
      d: path.d,
      role: path.role,
      strokeWidth: path.strokeWidth,
    })),
  });
}

function envelopeFromInkBounds(
  bounds: readonly [number, number, number, number],
): readonly { x: number; y: number }[] {
  const [minX, minY, maxX, maxY] = bounds;
  return Object.freeze([
    Object.freeze({ x: minX, y: minY }),
    Object.freeze({ x: maxX, y: minY }),
    Object.freeze({ x: maxX, y: maxY }),
    Object.freeze({ x: minX, y: maxY }),
  ]);
}

function buildRecord(source: GeometrySource, version: string): GlyphGeometryRecord {
  return Object.freeze({
    id: source.id,
    version,
    viewBox: source.viewBox,
    paths: source.paths,
    anchors: source.anchors,
    collisionEnvelope: envelopeFromInkBounds(source.inkBounds),
    minimumPrintStrokePt: source.minimumPrintStrokePt ?? MINIMUM_PRINT_STROKE_PT,
    integritySha256: pathDigest(source),
  });
}

class LockedGeometryRegistry implements GeometryRegistry {
  public readonly version: string;
  public readonly provisional: boolean;
  public readonly ids: readonly GlyphGeometryId[];

  private readonly records: ReadonlyMap<GlyphGeometryId, GlyphGeometryRecord>;
  private readonly declared: Readonly<Record<string, string>>;
  private readonly bounds: ReadonlyMap<GlyphGeometryId, Rect>;

  public constructor(
    version: string,
    provisional: boolean,
    sources: readonly GeometrySource[],
    declared: Readonly<Record<string, string>>,
  ) {
    this.version = version;
    this.provisional = provisional;
    this.declared = declared;

    const records = new Map<GlyphGeometryId, GlyphGeometryRecord>();
    const bounds = new Map<GlyphGeometryId, Rect>();

    for (const source of sources) {
      if (records.has(source.id)) {
        throw new PlateError("GEOMETRY_INTEGRITY", `Duplicate geometry id: ${source.id}`, {
          id: source.id,
        });
      }
      const [minX, minY, maxX, maxY] = source.inkBounds;
      if (maxX <= minX || maxY <= minY) {
        throw new PlateError(
          "GEOMETRY_INTEGRITY",
          `Geometry ${source.id} declares empty ink bounds`,
          { id: source.id, inkBounds: source.inkBounds },
        );
      }
      records.set(source.id, buildRecord(source, version));
      bounds.set(
        source.id,
        Object.freeze({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }),
      );
    }

    this.records = records;
    this.bounds = bounds;
    // Sorted so that registry iteration order never depends on insertion order
    // or object key iteration (spec §5.3).
    this.ids = Object.freeze([...records.keys()].sort());

    this.verifyIntegrity();
  }

  public has(id: GlyphGeometryId): boolean {
    return this.records.has(id);
  }

  public get(id: GlyphGeometryId): GlyphGeometryRecord {
    const record = this.records.get(id);
    if (record === undefined) {
      throw new PlateError("UNKNOWN_GEOMETRY", `No geometry record for id "${id}"`, { id });
    }
    return record;
  }

  public inkBounds(id: GlyphGeometryId): Rect {
    const rect = this.bounds.get(id);
    if (rect === undefined) {
      throw new PlateError("UNKNOWN_GEOMETRY", `No geometry record for id "${id}"`, { id });
    }
    return rect;
  }

  public verifyIntegrity(): void {
    const mismatched: { id: string; declared: string | undefined; actual: string }[] = [];

    for (const id of this.ids) {
      const record = this.records.get(id)!;
      const declared = this.declared[id];
      const actual = pathDigest(record);
      if (declared !== actual) {
        mismatched.push({ id, declared, actual });
      }
    }

    const orphaned = Object.keys(this.declared).filter((id) => !this.records.has(id));

    if (mismatched.length > 0 || orphaned.length > 0) {
      throw new PlateError(
        "GEOMETRY_INTEGRITY",
        `Geometry ${this.version} failed integrity verification. A released ` +
          `geometry version is immutable; a redraw must land as a new version. ` +
          `Run "pnpm geometry:hash" only when intentionally minting a version.`,
        { mismatched, orphaned },
      );
    }
  }
}

export function createGeometryRegistry(): GeometryRegistry {
  return new LockedGeometryRegistry(
    GEOMETRY_VERSION,
    GEOMETRY_IS_PROVISIONAL,
    GEOMETRY_V1_SOURCE,
    GEOMETRY_V1_INTEGRITY,
  );
}

/**
 * `geometry/v2` — the studio's own authored marks, extracted from the draw
 * registry into locked path data.
 *
 * Deliberately not reachable from `defaultRegistries()` and not listed in
 * `SUPPORTED_VERSIONS`. No grammar resolves a word to a `mark-*` id yet, so a
 * plate pinning v2 today would load real geometry and then find nothing to say
 * with it. Making it loadable and verifiable is a separate step from making it
 * compilable, and conflating the two is how a half-wired vocabulary ships.
 */
export function createGeometryRegistryV2(): GeometryRegistry {
  return new LockedGeometryRegistry(
    GEOMETRY_V2_VERSION,
    GEOMETRY_V2_IS_PROVISIONAL,
    GEOMETRY_V2_SOURCE,
    GEOMETRY_V2_INTEGRITY,
  );
}

/** Shared singletons. A registry is immutable, so one instance each suffices. */
let cached: GeometryRegistry | undefined;
let cachedV2: GeometryRegistry | undefined;

export function geometryRegistry(): GeometryRegistry {
  cached ??= createGeometryRegistry();
  return cached;
}

export function geometryRegistryV2(): GeometryRegistry {
  cachedV2 ??= createGeometryRegistryV2();
  return cachedV2;
}

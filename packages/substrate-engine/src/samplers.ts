/**
 * The V1 substrate registry (spec §9.1).
 *
 * Each construction below is a real, documented one. Where a construction
 * references the fine-structure constant, it uses it as *proportion logic and
 * annotation* only — spec §9.1 is explicit that it must not be dressed up as a
 * proof or padded with fabricated derivations.
 */

import {
  clamp01,
  point,
  quantize,
  rectCenter,
  type DeterministicStream,
  type Point,
  type Rect,
  type SubstrateId,
  type Vector,
} from "@studio137/plate-core";

import { circlePath, polylinePath, segmentPath } from "./path.js";
import {
  T_SCALE,
  type SubstrateFactory,
  type SubstrateFrame,
  type SubstrateGuide,
  type SubstrateSampler,
} from "./types.js";

export const SUBSTRATE_VERSION = "substrate/v1";

/** Studio 137's organizing integer. */
export const ALPHA_DIVISIONS = 137;

/**
 * Geometric approximation of the fine-structure constant.
 *
 * α = e² / (4πε₀ℏc) ≈ 1/137.036. The exact value is irrational and is not what
 * this system needs; the 1/137 approximation is used as a proportion, and is
 * declared here as an explicit approximation rather than an identity.
 */
export const ALPHA_APPROX_V1 = Object.freeze({ numerator: 1, denominator: 137 });

const TAU = Math.PI * 2;
const PHI = (1 + Math.sqrt(5)) / 2;

/** Normalize a fixed-point parameter into the unit interval. */
function unitOf(tFixed: number): number {
  if (!Number.isFinite(tFixed)) {
    throw new Error(`substrate: tFixed must be finite, received ${String(tFixed)}`);
  }
  return clamp01(Math.round(tFixed) / T_SCALE);
}

function frameFromDerivative(dx: number, dy: number): SubstrateFrame {
  const length = Math.hypot(dx, dy);
  const tangent: Vector = length === 0 ? point(1, 0) : point(dx / length, dy / length);
  // y-down space: rotating the tangent a quarter turn gives the outward normal.
  return Object.freeze({ tangent, normal: point(-tangent.y, tangent.x) });
}

function shortSide(bounds: Rect): number {
  return Math.min(bounds.width, bounds.height);
}

/**
 * Largest radius that still fits inside the field.
 *
 * Radial substrates measure against this rather than the short side: a ring at
 * `0.7 × shortSide` on a 2:3 plate lands well outside the canvas and is simply
 * clipped away.
 */
function maxRadius(bounds: Rect): number {
  return Math.min(bounds.width, bounds.height) / 2;
}

/** Numerically differentiate a parametric curve. Used where a closed form adds nothing. */
function numericFrame(
  sample: (t: number) => Point,
  t: number,
  step = 1 / T_SCALE,
): SubstrateFrame {
  const before = sample(Math.max(0, t - step));
  const after = sample(Math.min(1, t + step));
  return frameFromDerivative(after.x - before.x, after.y - before.y);
}

// ─────────────────────────────────────────────────────────────────────────────
// Alpha Radial Lattice — θₙ = 2πn / 137
// ─────────────────────────────────────────────────────────────────────────────

class AlphaRadialLattice implements SubstrateSampler {
  public readonly id: SubstrateId = "alpha-radial-lattice";
  public readonly version = SUBSTRATE_VERSION;
  public readonly construction = "θₙ = 2πn / 137";
  public readonly bounds: Rect;

  private readonly centre: Point;
  private readonly radius: number;

  public constructor(bounds: Rect) {
    this.bounds = bounds;
    this.centre = rectCenter(bounds);
    this.radius = maxRadius(bounds) * 0.66;
  }

  private at(unit: number): Point {
    // Snap to the nearest of the 137 divisions so glyph anchors always land on
    // the lattice rather than between its spokes.
    const division = Math.round(unit * ALPHA_DIVISIONS) % ALPHA_DIVISIONS;
    const theta = (TAU * division) / ALPHA_DIVISIONS;
    return point(
      quantize(this.centre.x + Math.cos(theta) * this.radius),
      quantize(this.centre.y + Math.sin(theta) * this.radius),
    );
  }

  public pointAt(tFixed: number): Point {
    return this.at(unitOf(tFixed));
  }

  public frameAt(tFixed: number): SubstrateFrame {
    const theta = (TAU * Math.round(unitOf(tFixed) * ALPHA_DIVISIONS)) / ALPHA_DIVISIONS;
    // Tangent to the ring at this angle.
    return frameFromDerivative(-Math.sin(theta), Math.cos(theta));
  }

  public anchors(count: number): readonly Point[] {
    if (count <= 0) return Object.freeze([]);
    return Object.freeze(
      Array.from({ length: count }, (_unused, index) => {
        const division = Math.round((index * ALPHA_DIVISIONS) / count) % ALPHA_DIVISIONS;
        const theta = (TAU * division) / ALPHA_DIVISIONS;
        return point(
          quantize(this.centre.x + Math.cos(theta) * this.radius),
          quantize(this.centre.y + Math.sin(theta) * this.radius),
        );
      }),
    );
  }

  public guides(density: number): readonly SubstrateGuide[] {
    const guides: SubstrateGuide[] = [];
    const unit = shortSide(this.bounds);
    const radius = maxRadius(this.bounds);

    for (const factor of [0.3, 0.52, 0.74, 0.96]) {
      guides.push(
        Object.freeze({
          d: circlePath(this.centre, radius * factor),
          role: "guide" as const,
          strokeWidth: quantize(unit * 0.0016),
          weight: quantize(0.3 + density * 0.35, 4),
        }),
      );
    }

    // Density selects how many of the 137 spokes are drawn, spread evenly
    // around the lattice so the field never looks accidentally sampled.
    const spokes = Math.max(0, Math.round(density * ALPHA_DIVISIONS));
    for (let index = 0; index < spokes; index += 1) {
      const division = Math.round((index * ALPHA_DIVISIONS) / spokes) % ALPHA_DIVISIONS;
      const theta = (TAU * division) / ALPHA_DIVISIONS;
      const inner = point(
        this.centre.x + Math.cos(theta) * radius * 0.3,
        this.centre.y + Math.sin(theta) * radius * 0.3,
      );
      const outer = point(
        this.centre.x + Math.cos(theta) * radius * 0.96,
        this.centre.y + Math.sin(theta) * radius * 0.96,
      );
      guides.push(
        Object.freeze({
          d: segmentPath(inner, outer),
          role: "guide" as const,
          strokeWidth: quantize(unit * 0.0011),
          weight: quantize(0.18 + density * 0.3, 4),
        }),
      );
    }

    return Object.freeze(guides);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modular Residue Field — rₙ = n² mod 137
// ─────────────────────────────────────────────────────────────────────────────

class ModularResidueField implements SubstrateSampler {
  public readonly id: SubstrateId = "modular-residue-field";
  public readonly version = SUBSTRATE_VERSION;
  public readonly construction = "rₙ = n² mod 137";
  public readonly bounds: Rect;

  private readonly centre: Point;
  private readonly residues: readonly number[];

  public constructor(bounds: Rect) {
    this.bounds = bounds;
    this.centre = rectCenter(bounds);
    // 137 is prime, so n² mod 137 takes exactly (137+1)/2 = 69 distinct values;
    // the field is symmetric about n = 137/2 by construction.
    this.residues = Object.freeze(
      Array.from({ length: ALPHA_DIVISIONS }, (_unused, n) => (n * n) % ALPHA_DIVISIONS),
    );
  }

  private at(index: number): Point {
    const n = ((Math.round(index) % ALPHA_DIVISIONS) + ALPHA_DIVISIONS) % ALPHA_DIVISIONS;
    const theta = (TAU * n) / ALPHA_DIVISIONS;
    // Residue drives radius; the quadratic-residue distribution gives a field
    // that is deterministic but visually non-periodic.
    const radius =
      maxRadius(this.bounds) * (0.2 + (this.residues[n]! / ALPHA_DIVISIONS) * 0.76);
    return point(
      quantize(this.centre.x + Math.cos(theta) * radius),
      quantize(this.centre.y + Math.sin(theta) * radius),
    );
  }

  public pointAt(tFixed: number): Point {
    return this.at(unitOf(tFixed) * (ALPHA_DIVISIONS - 1));
  }

  public frameAt(tFixed: number): SubstrateFrame {
    return numericFrame(
      (t) => this.at(t * (ALPHA_DIVISIONS - 1)),
      unitOf(tFixed),
      1 / ALPHA_DIVISIONS,
    );
  }

  public anchors(count: number): readonly Point[] {
    if (count <= 0) return Object.freeze([]);
    return Object.freeze(
      Array.from({ length: count }, (_unused, index) =>
        this.at((index * ALPHA_DIVISIONS) / count),
      ),
    );
  }

  public guides(density: number): readonly SubstrateGuide[] {
    const unit = shortSide(this.bounds);
    const sites = Math.max(8, Math.round(24 + density * (ALPHA_DIVISIONS - 24)));
    const guides: SubstrateGuide[] = [];

    for (let index = 0; index < sites; index += 1) {
      const site = this.at((index * ALPHA_DIVISIONS) / sites);
      const tick = unit * 0.012;
      guides.push(
        Object.freeze({
          d: segmentPath(point(site.x - tick, site.y), point(site.x + tick, site.y)),
          role: "guide" as const,
          strokeWidth: quantize(unit * 0.0013),
          weight: quantize(0.2 + density * 0.3, 4),
        }),
      );
    }

    guides.push(
      Object.freeze({
        d: circlePath(this.centre, maxRadius(this.bounds) * 0.2),
        role: "registration" as const,
        strokeWidth: quantize(unit * 0.0016),
        weight: 0.4,
      }),
    );

    return Object.freeze(guides);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Fine-Structure Construction — proportion logic from 1/137
// ─────────────────────────────────────────────────────────────────────────────

class FineStructureConstruction implements SubstrateSampler {
  public readonly id: SubstrateId = "fine-structure-construction";
  public readonly version = SUBSTRATE_VERSION;
  public readonly construction =
    "α = e² / (4πε₀ℏc) ≈ 1/137, used as declared proportion, not as derivation";
  public readonly bounds: Rect;

  public constructor(bounds: Rect) {
    this.bounds = bounds;
  }

  private at(unit: number): Point {
    // A processional axis down the plate's long dimension, stepped in units of
    // 1/137 of the field so every position is an exact multiple of α-approx.
    const steps = ALPHA_APPROX_V1.denominator;
    const step = Math.round(unit * steps) / steps;
    return point(
      quantize(this.bounds.x + this.bounds.width * 0.5),
      quantize(this.bounds.y + this.bounds.height * step),
    );
  }

  public pointAt(tFixed: number): Point {
    return this.at(unitOf(tFixed));
  }

  public frameAt(): SubstrateFrame {
    return frameFromDerivative(0, 1);
  }

  public anchors(count: number): readonly Point[] {
    if (count <= 0) return Object.freeze([]);
    return Object.freeze(
      Array.from({ length: count }, (_unused, index) =>
        this.at(count === 1 ? 0.5 : index / (count - 1)),
      ),
    );
  }

  public guides(density: number): readonly SubstrateGuide[] {
    const guides: SubstrateGuide[] = [];
    const unit = shortSide(this.bounds);
    // Division lines at multiples of 1/137 of the field height. Density selects
    // how coarse the measure is; each divisor divides 137's field evenly.
    const divisor = [137, 68, 34, 17, 8][Math.min(4, Math.round((1 - density) * 4))]!;
    for (let index = 0; index <= divisor; index += 1) {
      const y = this.bounds.y + (this.bounds.height * index) / divisor;
      const inset = index % 2 === 0 ? 0.06 : 0.18;
      guides.push(
        Object.freeze({
          d: segmentPath(
            point(this.bounds.x + this.bounds.width * inset, y),
            point(this.bounds.x + this.bounds.width * (1 - inset), y),
          ),
          role: "guide" as const,
          strokeWidth: quantize(unit * (index % 2 === 0 ? 0.0016 : 0.001)),
          weight: quantize(0.16 + density * 0.28, 4),
        }),
      );
    }
    guides.push(
      Object.freeze({
        d: segmentPath(
          point(this.bounds.x + this.bounds.width * 0.5, this.bounds.y),
          point(this.bounds.x + this.bounds.width * 0.5, this.bounds.y + this.bounds.height),
        ),
        role: "registration" as const,
        strokeWidth: quantize(unit * 0.0012),
        weight: 0.35,
      }),
    );
    return Object.freeze(guides);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Golden Processional Spiral — r = a·e^(bθ)
// ─────────────────────────────────────────────────────────────────────────────

class GoldenProcessionalSpiral implements SubstrateSampler {
  public readonly id: SubstrateId = "golden-processional-spiral";
  public readonly version = SUBSTRATE_VERSION;
  public readonly construction = "r = a·e^(bθ), b = ln(φ) / (π/2)";
  public readonly bounds: Rect;

  private readonly centre: Point;
  private readonly a: number;
  private readonly b: number;
  private readonly thetaMax: number;

  public constructor(bounds: Rect) {
    this.bounds = bounds;
    this.centre = rectCenter(bounds);
    // A golden spiral grows by φ every quarter turn.
    this.b = Math.log(PHI) / (Math.PI / 2);
    this.thetaMax = TAU * 1.75;
    // Scale `a` so the outermost turn lands inside the field.
    this.a = (maxRadius(bounds) * 0.9) / Math.exp(this.b * this.thetaMax);
  }

  private at(unit: number): Point {
    const theta = unit * this.thetaMax;
    const r = this.a * Math.exp(this.b * theta);
    return point(
      quantize(this.centre.x + Math.cos(theta) * r),
      quantize(this.centre.y + Math.sin(theta) * r),
    );
  }

  public pointAt(tFixed: number): Point {
    return this.at(unitOf(tFixed));
  }

  public frameAt(tFixed: number): SubstrateFrame {
    const theta = unitOf(tFixed) * this.thetaMax;
    const r = this.a * Math.exp(this.b * theta);
    // d/dθ of (r cos θ, r sin θ) with r = a·e^(bθ).
    return frameFromDerivative(
      r * (this.b * Math.cos(theta) - Math.sin(theta)),
      r * (this.b * Math.sin(theta) + Math.cos(theta)),
    );
  }

  public anchors(count: number): readonly Point[] {
    if (count <= 0) return Object.freeze([]);
    return Object.freeze(
      Array.from({ length: count }, (_unused, index) =>
        this.at(count === 1 ? 0.5 : index / (count - 1)),
      ),
    );
  }

  public guides(density: number): readonly SubstrateGuide[] {
    const unit = shortSide(this.bounds);
    const steps = Math.max(64, Math.round(96 + density * 320));
    const spiral = Array.from({ length: steps + 1 }, (_unused, index) => this.at(index / steps));
    const guides: SubstrateGuide[] = [
      Object.freeze({
        d: polylinePath(spiral),
        role: "guide" as const,
        strokeWidth: quantize(unit * 0.002),
        weight: quantize(0.35 + density * 0.3, 4),
      }),
    ];
    // Quarter-turn radii mark where the spiral has grown by exactly φ.
    for (let turn = 1; turn <= Math.round(this.thetaMax / (Math.PI / 2)); turn += 1) {
      const theta = turn * (Math.PI / 2);
      const r = this.a * Math.exp(this.b * theta);
      guides.push(
        Object.freeze({
          d: segmentPath(
            this.centre,
            point(this.centre.x + Math.cos(theta) * r, this.centre.y + Math.sin(theta) * r),
          ),
          role: "annotation" as const,
          strokeWidth: quantize(unit * 0.0011),
          weight: quantize(0.2 + density * 0.2, 4),
        }),
      );
    }
    return Object.freeze(guides);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Lissajous Archive Field — x = A sin(at + δ), y = B sin(bt)
// ─────────────────────────────────────────────────────────────────────────────

class LissajousArchiveField implements SubstrateSampler {
  public readonly id: SubstrateId = "lissajous-archive-field";
  public readonly version = SUBSTRATE_VERSION;
  public readonly construction = "x = A sin(3t + π/7), y = B sin(7t) — ratio 1:3:7";
  public readonly bounds: Rect;

  private readonly centre: Point;
  private readonly amplitudeX: number;
  private readonly amplitudeY: number;
  // The 1:3:7 ratio connects the field to Studio 137. It is a naming choice,
  // not a claim that the relationship is physically fundamental.
  private readonly a = 3;
  private readonly bFreq = 7;
  private readonly delta = Math.PI / 7;

  public constructor(bounds: Rect) {
    this.bounds = bounds;
    this.centre = rectCenter(bounds);
    this.amplitudeX = bounds.width * 0.42;
    this.amplitudeY = bounds.height * 0.42;
  }

  private at(unit: number): Point {
    const t = unit * TAU;
    return point(
      quantize(this.centre.x + this.amplitudeX * Math.sin(this.a * t + this.delta)),
      quantize(this.centre.y + this.amplitudeY * Math.sin(this.bFreq * t)),
    );
  }

  public pointAt(tFixed: number): Point {
    return this.at(unitOf(tFixed));
  }

  public frameAt(tFixed: number): SubstrateFrame {
    const t = unitOf(tFixed) * TAU;
    return frameFromDerivative(
      this.amplitudeX * this.a * Math.cos(this.a * t + this.delta),
      this.amplitudeY * this.bFreq * Math.cos(this.bFreq * t),
    );
  }

  public anchors(count: number): readonly Point[] {
    if (count <= 0) return Object.freeze([]);
    return Object.freeze(
      Array.from({ length: count }, (_unused, index) => this.at(index / count)),
    );
  }

  public guides(density: number): readonly SubstrateGuide[] {
    const unit = shortSide(this.bounds);
    const steps = Math.max(256, Math.round(384 + density * 768));
    const curve = Array.from({ length: steps + 1 }, (_unused, index) => this.at(index / steps));
    return Object.freeze([
      Object.freeze({
        d: polylinePath(curve, true),
        role: "guide" as const,
        strokeWidth: quantize(unit * 0.0018),
        weight: quantize(0.3 + density * 0.35, 4),
      }),
    ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Voronoi Reliquary — seeded sites and their cells
// ─────────────────────────────────────────────────────────────────────────────

/** Clip a convex polygon against the half-plane on the `inside` side of a bisector. */
function clipHalfPlane(
  polygon: readonly Point[],
  site: Point,
  other: Point,
): readonly Point[] {
  // Points closer to `site` than to `other` satisfy: (p - m)·(other - site) < 0
  const nx = other.x - site.x;
  const ny = other.y - site.y;
  const mx = (site.x + other.x) / 2;
  const my = (site.y + other.y) / 2;
  const signedDistance = (p: Point): number => (p.x - mx) * nx + (p.y - my) * ny;

  const output: Point[] = [];
  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index]!;
    const next = polygon[(index + 1) % polygon.length]!;
    const dCurrent = signedDistance(current);
    const dNext = signedDistance(next);

    if (dCurrent <= 0) output.push(current);
    if (dCurrent === 0 || dNext === 0) continue;
    if (dCurrent < 0 !== dNext < 0) {
      const t = dCurrent / (dCurrent - dNext);
      output.push(point(current.x + (next.x - current.x) * t, current.y + (next.y - current.y) * t));
    }
  }
  return output;
}

class VoronoiReliquary implements SubstrateSampler {
  public readonly id: SubstrateId = "voronoi-reliquary";
  public readonly version = SUBSTRATE_VERSION;
  public readonly construction = "seeded Voronoi cells by half-plane clipping";
  public readonly bounds: Rect;

  private readonly sites: readonly Point[];

  public constructor(bounds: Rect, rng: DeterministicStream) {
    this.bounds = bounds;
    const siteStream = rng.fork("voronoi-sites");
    const count = 28;
    // Poisson-ish jitter over a coarse grid keeps cells from degenerating into
    // slivers while staying fully determined by the seed.
    const columns = 7;
    const rows = 4;
    const sites: Point[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns && sites.length < count; column += 1) {
        const cellWidth = bounds.width / columns;
        const cellHeight = bounds.height / rows;
        sites.push(
          point(
            quantize(bounds.x + cellWidth * (column + 0.15 + siteStream.nextUnit() * 0.7)),
            quantize(bounds.y + cellHeight * (row + 0.15 + siteStream.nextUnit() * 0.7)),
          ),
        );
      }
    }
    this.sites = Object.freeze(sites);
  }

  private cell(index: number): readonly Point[] {
    const site = this.sites[index]!;
    let polygon: readonly Point[] = [
      point(this.bounds.x, this.bounds.y),
      point(this.bounds.x + this.bounds.width, this.bounds.y),
      point(this.bounds.x + this.bounds.width, this.bounds.y + this.bounds.height),
      point(this.bounds.x, this.bounds.y + this.bounds.height),
    ];
    for (let other = 0; other < this.sites.length; other += 1) {
      if (other === index) continue;
      polygon = clipHalfPlane(polygon, site, this.sites[other]!);
      if (polygon.length === 0) break;
    }
    return polygon;
  }

  public pointAt(tFixed: number): Point {
    const unit = unitOf(tFixed);
    const index = Math.min(this.sites.length - 1, Math.floor(unit * this.sites.length));
    return this.sites[index]!;
  }

  public frameAt(tFixed: number): SubstrateFrame {
    const unit = unitOf(tFixed);
    const index = Math.min(this.sites.length - 1, Math.floor(unit * this.sites.length));
    const next = this.sites[Math.min(this.sites.length - 1, index + 1)]!;
    const current = this.sites[index]!;
    return frameFromDerivative(next.x - current.x || 1, next.y - current.y);
  }

  public anchors(count: number): readonly Point[] {
    if (count <= 0) return Object.freeze([]);
    return Object.freeze(
      Array.from({ length: count }, (_unused, index) => this.sites[index % this.sites.length]!),
    );
  }

  public guides(density: number): readonly SubstrateGuide[] {
    const unit = shortSide(this.bounds);
    const shown = Math.max(4, Math.round(this.sites.length * (0.3 + density * 0.7)));
    const guides: SubstrateGuide[] = [];
    for (let index = 0; index < shown; index += 1) {
      const polygon = this.cell(index);
      if (polygon.length < 3) continue;
      guides.push(
        Object.freeze({
          d: polylinePath(polygon, true),
          role: "guide" as const,
          strokeWidth: quantize(unit * 0.0015),
          weight: quantize(0.22 + density * 0.32, 4),
        }),
      );
    }
    return Object.freeze(guides);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const SUBSTRATE_FACTORIES: readonly SubstrateFactory[] = Object.freeze([
  Object.freeze({
    id: "alpha-radial-lattice" as const,
    version: SUBSTRATE_VERSION,
    create: (bounds: Rect) => new AlphaRadialLattice(bounds),
  }),
  Object.freeze({
    id: "modular-residue-field" as const,
    version: SUBSTRATE_VERSION,
    create: (bounds: Rect) => new ModularResidueField(bounds),
  }),
  Object.freeze({
    id: "fine-structure-construction" as const,
    version: SUBSTRATE_VERSION,
    create: (bounds: Rect) => new FineStructureConstruction(bounds),
  }),
  Object.freeze({
    id: "golden-processional-spiral" as const,
    version: SUBSTRATE_VERSION,
    create: (bounds: Rect) => new GoldenProcessionalSpiral(bounds),
  }),
  Object.freeze({
    id: "lissajous-archive-field" as const,
    version: SUBSTRATE_VERSION,
    create: (bounds: Rect) => new LissajousArchiveField(bounds),
  }),
  Object.freeze({
    id: "voronoi-reliquary" as const,
    version: SUBSTRATE_VERSION,
    create: (bounds: Rect, rng: DeterministicStream) => new VoronoiReliquary(bounds, rng),
  }),
]);

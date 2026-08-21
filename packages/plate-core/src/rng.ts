/**
 * Deterministic random system (spec §5).
 *
 * The seed governs every non-authorial choice. It is NOT an encryption key and
 * is never used as one — see `@studio137/private-manifest` for the artist-held
 * master key that actually protects the source phrase.
 *
 * Prohibited inside this pipeline, per spec §5.3: `Math.random()`, time-based
 * seeds, UUID v4 in deterministic artifacts, browser entropy after compilation
 * begins, locale-dependent ordering, and system-dependent object iteration.
 */

import { sha256Domain, toHex } from "./sha256.js";

export const RNG_VERSION = "rng/v1";
export const STREAM_DERIVATION_VERSION = "stream-derivation/v1";
const SEED_DOMAIN = "studio137:plate-seed:v1";
const FORK_DOMAIN = "studio137:stream-fork:v1";

export const RNG_STREAM_NAMES = [
  "layout",
  "substrate",
  "corruption",
  "decoys",
  "atmosphere",
] as const;

export type RngStreamName = (typeof RNG_STREAM_NAMES)[number];

export interface DeterministicStream {
  readonly name: string;
  /** Uniform 32-bit unsigned integer. */
  nextUint32(): number;
  /** Uniform double in [0, 1). */
  nextUnit(): number;
  /** Uniform double in [min, max). */
  nextRange(min: number, max: number): number;
  /** Uniform integer in [0, boundExclusive), rejection-sampled so it is unbiased. */
  nextInt(boundExclusive: number): number;
  /** True with the given probability. */
  nextBool(probability: number): boolean;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates over a copy; the input is never mutated. */
  shuffle<T>(items: readonly T[]): T[];
  /**
   * An independent child stream. Sub-systems fork rather than share so that
   * adding a draw in one place cannot shift every later decision (spec §5.2).
   */
  fork(label: string): DeterministicStream;
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * xoshiro128** 1.1 — the checked-in PRNG the spec calls for. All arithmetic is
 * forced through `Math.imul` and `>>> 0` so the 32-bit behavior is explicit and
 * identical on every JavaScript engine.
 */
class Xoshiro128SS implements DeterministicStream {
  public readonly name: string;
  private s0: number;
  private s1: number;
  private s2: number;
  private s3: number;
  private readonly digest: Uint8Array;

  public constructor(name: string, digest: Uint8Array) {
    if (digest.length < 16) {
      throw new Error("Xoshiro128SS: seed digest must be at least 16 bytes");
    }
    this.name = name;
    this.digest = digest;
    const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength);
    this.s0 = view.getUint32(0, false) >>> 0;
    this.s1 = view.getUint32(4, false) >>> 0;
    this.s2 = view.getUint32(8, false) >>> 0;
    this.s3 = view.getUint32(12, false) >>> 0;

    // An all-zero state is a fixed point of the generator. A SHA-256 digest of
    // all zeros in its first 16 bytes is not reachable in practice, but the
    // generator must never be able to emit a constant stream.
    if ((this.s0 | this.s1 | this.s2 | this.s3) === 0) {
      this.s0 = 0x9e3779b9;
      this.s1 = 0x243f6a88;
      this.s2 = 0xb7e15162;
      this.s3 = 0x85ebca6b;
    }
  }

  public nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(this.s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (this.s1 << 9) >>> 0;

    this.s2 = (this.s2 ^ this.s0) >>> 0;
    this.s3 = (this.s3 ^ this.s1) >>> 0;
    this.s1 = (this.s1 ^ this.s2) >>> 0;
    this.s0 = (this.s0 ^ this.s3) >>> 0;
    this.s2 = (this.s2 ^ t) >>> 0;
    this.s3 = rotl(this.s3, 11);

    return result;
  }

  public nextUnit(): number {
    // Divide by 2^32 exactly; the quotient is representable, so this is
    // bit-for-bit reproducible under IEEE-754.
    return this.nextUint32() / 4294967296;
  }

  public nextRange(min: number, max: number): number {
    return min + this.nextUnit() * (max - min);
  }

  public nextInt(boundExclusive: number): number {
    if (!Number.isInteger(boundExclusive) || boundExclusive <= 0) {
      throw new Error(`nextInt: bound must be a positive integer, got ${boundExclusive}`);
    }
    if (boundExclusive > 0x100000000) {
      throw new Error("nextInt: bound exceeds the 32-bit generator range");
    }
    // Reject the incomplete final block so the result is exactly uniform.
    const limit = 0x100000000 - (0x100000000 % boundExclusive);
    let draw = this.nextUint32();
    while (draw >= limit) {
      draw = this.nextUint32();
    }
    return draw % boundExclusive;
  }

  public nextBool(probability: number): boolean {
    if (probability <= 0) return false;
    if (probability >= 1) return true;
    return this.nextUnit() < probability;
  }

  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error("pick: expected a non-empty array");
    }
    return items[this.nextInt(items.length)]!;
  }

  public shuffle<T>(items: readonly T[]): T[] {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = this.nextInt(i + 1);
      const a = copy[i]!;
      const b = copy[j]!;
      copy[i] = b;
      copy[j] = a;
    }
    return copy;
  }

  public fork(label: string): DeterministicStream {
    return new Xoshiro128SS(
      `${this.name}/${label}`,
      sha256Domain(this.digest, FORK_DOMAIN, label, RNG_VERSION),
    );
  }
}

export type MasterSeed = Readonly<{
  digest: Uint8Array;
  digestHex: string;
  /** Short public-facing identifier. The full digest stays internal (spec §5.1). */
  fingerprint: string;
}>;

/** `masterDigest = SHA-256("studio137:plate-seed:v1" + NUL + seed UTF-8 bytes)` */
export function deriveMasterSeed(seed: string): MasterSeed {
  if (seed.length === 0 || seed.length > 128) {
    throw new Error("deriveMasterSeed: seed must be 1–128 characters");
  }
  const digest = sha256Domain(SEED_DOMAIN, seed);
  const digestHex = toHex(digest);
  return Object.freeze({
    digest,
    digestHex,
    fingerprint: formatFingerprint(digestHex),
  });
}

/** A short, human-readable seed fingerprint for the interface, e.g. `137-4F2A-9C13`. */
export function formatFingerprint(digestHex: string): string {
  const upper = digestHex.slice(0, 8).toUpperCase();
  return `137-${upper.slice(0, 4)}-${upper.slice(4, 8)}`;
}

export type StreamSet = Readonly<Record<RngStreamName, DeterministicStream>> &
  Readonly<{ digests: Readonly<Record<RngStreamName, string>> }>;

/** `SHA-256(masterDigest + NUL + streamName + NUL + rngVersion)` for each named stream. */
export function createNamedStreams(
  master: MasterSeed,
  rngVersion: string = RNG_VERSION,
): StreamSet {
  const streams: Partial<Record<RngStreamName, DeterministicStream>> = {};
  const digests: Partial<Record<RngStreamName, string>> = {};

  for (const name of RNG_STREAM_NAMES) {
    const digest = sha256Domain(master.digest, name, rngVersion);
    digests[name] = toHex(digest);
    streams[name] = new Xoshiro128SS(name, digest);
  }

  return Object.freeze({
    ...(streams as Record<RngStreamName, DeterministicStream>),
    digests: Object.freeze(digests as Record<RngStreamName, string>),
  });
}

/**
 * A cryptographically random seed for the interface's **New Seed** action.
 *
 * This is the one place entropy is permitted, and it happens *before*
 * compilation begins. The resulting string is then treated as fixed input.
 */
export function generateSeed(randomBytes: (length: number) => Uint8Array): string {
  return toHex(randomBytes(16));
}

/** Construct a stream directly from a digest. Exposed for test vectors. */
export function streamFromDigest(name: string, digest: Uint8Array): DeterministicStream {
  return new Xoshiro128SS(name, digest);
}

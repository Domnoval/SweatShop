import { describe, expect, it } from "vitest";

import {
  createNamedStreams,
  deriveMasterSeed,
  RNG_STREAM_NAMES,
  streamFromDigest,
} from "./rng.js";
import { fromHex } from "./sha256.js";

const SEED_16 = fromHex("0102030405060708090a0b0c0d0e0f10");

describe("xoshiro128** test vectors", () => {
  it("reproduces the reference sequence for a known state", () => {
    // Cross-checked against a reference xoshiro128** 1.1 implementation seeded
    // with the same 16 bytes read big-endian. Spec §5.3 requires fixed vectors.
    const stream = streamFromDigest("vector", SEED_16);
    const draws = Array.from({ length: 8 }, () => stream.nextUint32());
    expect(draws).toEqual([
      127808620, 3159458080, 796377600, 4091517181, 2616180543, 1598767620, 3578622960,
      1621394963,
    ]);
  });

  it("emits unsigned 32-bit integers only", () => {
    const stream = streamFromDigest("range", SEED_16);
    for (let i = 0; i < 4096; i += 1) {
      const value = stream.nextUint32();
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(0xffffffff);
    }
  });

  it("keeps nextUnit inside [0, 1)", () => {
    const stream = streamFromDigest("unit", SEED_16);
    for (let i = 0; i < 4096; i += 1) {
      const value = stream.nextUnit();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it("produces unbiased integers below a bound", () => {
    const stream = streamFromDigest("int", SEED_16);
    const counts = new Array<number>(7).fill(0);
    for (let i = 0; i < 70_000; i += 1) {
      counts[stream.nextInt(7)]! += 1;
    }
    // Rejection sampling should hold every bucket close to 10,000.
    for (const count of counts) {
      expect(count).toBeGreaterThan(9_500);
      expect(count).toBeLessThan(10_500);
    }
  });

  it("never mutates the array it shuffles", () => {
    const source = Object.freeze([1, 2, 3, 4, 5]);
    const stream = streamFromDigest("shuffle", SEED_16);
    const shuffled = stream.shuffle(source);
    expect(source).toEqual([1, 2, 3, 4, 5]);
    expect([...shuffled].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it("rejects a zero-length pick and a non-positive bound", () => {
    const stream = streamFromDigest("guards", SEED_16);
    expect(() => stream.pick([])).toThrow();
    expect(() => stream.nextInt(0)).toThrow();
    expect(() => stream.nextInt(2.5)).toThrow();
  });
});

describe("seed derivation", () => {
  it("is stable for a given seed string", () => {
    const a = deriveMasterSeed("THE SIGNAL SURVIVES THE BODY");
    const b = deriveMasterSeed("THE SIGNAL SURVIVES THE BODY");
    expect(a.digestHex).toBe(b.digestHex);
    expect(a.digestHex).toHaveLength(64);
  });

  it("separates distinct seeds", () => {
    expect(deriveMasterSeed("a").digestHex).not.toBe(deriveMasterSeed("b").digestHex);
  });

  it("enforces the 1–128 character seed bound", () => {
    expect(() => deriveMasterSeed("")).toThrow();
    expect(() => deriveMasterSeed("x".repeat(129))).toThrow();
    expect(() => deriveMasterSeed("x".repeat(128))).not.toThrow();
  });

  it("exposes a short public fingerprint rather than the full digest", () => {
    const master = deriveMasterSeed("golden");
    expect(master.fingerprint).toMatch(/^137-[0-9A-F]{4}-[0-9A-F]{4}$/u);
    expect(master.fingerprint).not.toContain(master.digestHex);
  });
});

describe("named streams", () => {
  it("isolates the five systems from one another", () => {
    // Spec §5.2: changing density must not reroll corruption-site selection.
    // That only holds if the streams are genuinely independent.
    const streams = createNamedStreams(deriveMasterSeed("isolation"));
    const firstDraws = RNG_STREAM_NAMES.map((name) => streams[name].nextUint32());
    expect(new Set(firstDraws).size).toBe(RNG_STREAM_NAMES.length);
    expect(new Set(Object.values(streams.digests)).size).toBe(RNG_STREAM_NAMES.length);
  });

  it("reproduces identical draws across runs", () => {
    const draw = () => {
      const streams = createNamedStreams(deriveMasterSeed("repeat"));
      return RNG_STREAM_NAMES.flatMap((name) =>
        Array.from({ length: 16 }, () => streams[name].nextUint32()),
      );
    };
    expect(draw()).toEqual(draw());
  });

  it("forks independent child streams that do not disturb the parent", () => {
    const streams = createNamedStreams(deriveMasterSeed("fork"));
    const child = streams.layout.fork("clause-0");
    const sibling = streams.layout.fork("clause-1");
    expect(child.nextUint32()).not.toBe(sibling.nextUint32());
    expect(child.name).toBe("layout/clause-0");

    const rerun = createNamedStreams(deriveMasterSeed("fork")).layout.fork("clause-0");
    expect(rerun.nextUint32()).toBe(
      createNamedStreams(deriveMasterSeed("fork")).layout.fork("clause-0").nextUint32(),
    );
  });
});

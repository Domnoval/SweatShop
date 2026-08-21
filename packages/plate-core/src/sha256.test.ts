import { createHash, randomBytes } from "node:crypto";

import { describe, expect, it } from "vitest";

import { base64ToBytes, base64ToUtf8, bytesToBase64, utf8ToBase64 } from "./base64.js";
import { fromHex, sha256Bytes, sha256Domain, sha256Hex, toHex } from "./sha256.js";

/**
 * `node:crypto` as a differential oracle.
 *
 * The implementation deliberately avoids `node:crypto` so the browser preview
 * worker and the Node export process share one code path. A *test* is exactly
 * where the platform primitive earns its keep: hand-picked published vectors
 * only cover the lengths someone thought to pick, and the padding bug this
 * suite now guards against lived in a length class none of them touched.
 */
const nodeSha256 = (input: string | Uint8Array): string =>
  typeof input === "string"
    ? createHash("sha256").update(input, "utf8").digest("hex")
    : createHash("sha256").update(Buffer.from(input)).digest("hex");

describe("sha256", () => {
  // FIPS 180-4 published test vectors. These pin the pure-TS implementation the
  // whole deterministic pipeline hangs off.
  it.each([
    ["", "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"],
    ["abc", "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"],
  ])("matches the published vector for %j", (input, expected) => {
    expect(expected).toHaveLength(64);
    expect(sha256Hex(input)).toBe(expected);
  });

  it("matches the 448-bit and one-million-character vectors", () => {
    expect(sha256Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
    expect(sha256Hex("a".repeat(1_000_000))).toBe(
      "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0",
    );
  });

  it("agrees with node:crypto at every length across five block boundaries", () => {
    // The padding length is `ceil((len + 9) / 64)` blocks. The interesting case
    // is `len % 64 === 55`, where the message, its 0x80 terminator, and the
    // 8-byte length field fill the final block exactly. An off-by-one there
    // appends a spurious block and silently produces a non-SHA-256 digest.
    const mismatches: number[] = [];
    for (let length = 0; length <= 320; length += 1) {
      const input = "a".repeat(length);
      if (sha256Hex(input) !== nodeSha256(input)) mismatches.push(length);
    }
    expect(mismatches).toEqual([]);
  });

  it("agrees with node:crypto on the exact-fit boundary lengths", () => {
    for (const length of [55, 119, 183, 247, 311]) {
      expect(length % 64).toBe(55);
      const input = "a".repeat(length);
      expect(sha256Hex(input), `length ${length}`).toBe(nodeSha256(input));
    }
  });

  it("agrees with node:crypto on arbitrary binary input", () => {
    for (let length = 0; length <= 200; length += 1) {
      const bytes = new Uint8Array(randomBytes(length));
      expect(toHex(sha256Bytes(bytes)), `length ${length}`).toBe(nodeSha256(bytes));
    }
  });

  it("agrees with node:crypto on multi-byte and astral text", () => {
    for (const sample of ["", "مرحبا", "線 signal", "\u{1F701}".repeat(20), "é".repeat(37)]) {
      expect(sha256Hex(sample)).toBe(nodeSha256(sample));
    }
  });

  it("round trips hex", () => {
    const bytes = fromHex("00ff1042");
    expect(Array.from(bytes)).toEqual([0, 255, 16, 66]);
    expect(toHex(bytes)).toBe("00ff1042");
    expect(() => fromHex("0F")).toThrow();
  });

  it("separates domains with NUL so concatenations cannot collide", () => {
    // Without NUL separation, ("ab","c") and ("a","bc") would hash identically.
    expect(toHex(sha256Domain("ab", "c"))).not.toBe(toHex(sha256Domain("a", "bc")));
  });
});

describe("base64", () => {
  it("matches RFC 4648 vectors", () => {
    expect(utf8ToBase64("")).toBe("");
    expect(utf8ToBase64("f")).toBe("Zg==");
    expect(utf8ToBase64("fo")).toBe("Zm8=");
    expect(utf8ToBase64("foo")).toBe("Zm9v");
    expect(utf8ToBase64("foob")).toBe("Zm9vYg==");
    expect(utf8ToBase64("fooba")).toBe("Zm9vYmE=");
    expect(utf8ToBase64("foobar")).toBe("Zm9vYmFy");
  });

  it("round trips multi-byte and astral text", () => {
    const samples = ["مرحبا", "é́", "\u{1F701}\u{10FFFF}", "線\n\t  "];
    for (const sample of samples) {
      expect(base64ToUtf8(utf8ToBase64(sample))).toBe(sample);
    }
  });

  it("agrees with Buffer on arbitrary binary input", () => {
    // Same reasoning as the SHA-256 oracle: a hand-rolled codec's bugs live in
    // the remainder cases, and only exhaustive comparison finds them.
    for (let length = 0; length <= 200; length += 1) {
      const bytes = new Uint8Array(randomBytes(length));
      expect(bytesToBase64(bytes), `length ${length}`).toBe(Buffer.from(bytes).toString("base64"));
      expect(Array.from(base64ToBytes(Buffer.from(bytes).toString("base64")))).toEqual(
        Array.from(bytes),
      );
    }
  });

  it("round trips arbitrary bytes", () => {
    const bytes = new Uint8Array(257);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7) % 256;
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("rejects invalid input", () => {
    expect(() => base64ToBytes("!!!!")).toThrow();
  });
});

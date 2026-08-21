import { describe, expect, it } from "vitest";

import { base64ToBytes, base64ToUtf8, bytesToBase64, utf8ToBase64 } from "./base64.js";
import { fromHex, sha256Domain, sha256Hex, toHex } from "./sha256.js";

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

  it("round trips arbitrary bytes", () => {
    const bytes = new Uint8Array(257);
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = (i * 7) % 256;
    expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes));
  });

  it("rejects invalid input", () => {
    expect(() => base64ToBytes("!!!!")).toThrow();
  });
});

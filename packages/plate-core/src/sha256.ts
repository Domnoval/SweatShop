/**
 * Pure TypeScript SHA-256.
 *
 * The deterministic compiler core must not depend on `node:crypto`, because
 * spec §23 places preview compilation in a browser Web Worker while production
 * export runs in a trusted Node process. Both paths must agree byte-for-byte
 * (verification Gate 3, cross-runtime determinism), so the hash used for seed
 * derivation, geometry integrity, and artifact digests is implemented here with
 * nothing but integer arithmetic.
 *
 * Encryption deliberately does NOT live here — see @studio137/private-manifest,
 * which is trusted-process-only and may use `node:crypto`.
 */

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
  0x1f83d9ab, 0x5be0cd19,
]);

function rotr(x: number, n: number): number {
  return ((x >>> n) | (x << (32 - n))) >>> 0;
}

/** SHA-256 over raw bytes. Returns a 32-byte digest. */
export function sha256Bytes(input: Uint8Array): Uint8Array {
  const bitLength = input.length * 8;
  // message + 0x80 + zero padding + 8-byte big-endian length, to a 64-byte multiple
  const paddedLength = (((input.length + 9) >>> 6) + 1) << 6;
  const buffer = new Uint8Array(paddedLength);
  buffer.set(input);
  buffer[input.length] = 0x80;

  // Length is written as a 64-bit big-endian bit count. Inputs above 2^53 bits
  // are not reachable here, so the high word is derived by float division.
  const view = new DataView(buffer.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000), false);
  view.setUint32(paddedLength - 4, bitLength >>> 0, false);

  const h = INITIAL.slice();
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i += 1) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (let i = 16; i < 64; i += 1) {
      const w15 = w[i - 15]!;
      const w2 = w[i - 2]!;
      const s0 = (rotr(w15, 7) ^ rotr(w15, 18) ^ (w15 >>> 3)) >>> 0;
      const s1 = (rotr(w2, 17) ^ rotr(w2, 19) ^ (w2 >>> 10)) >>> 0;
      w[i] = (w[i - 16]! + s0 + w[i - 7]! + s1) >>> 0;
    }

    let a = h[0]!;
    let b = h[1]!;
    let c = h[2]!;
    let d = h[3]!;
    let e = h[4]!;
    let f = h[5]!;
    let g = h[6]!;
    let hh = h[7]!;

    for (let i = 0; i < 64; i += 1) {
      const S1 = (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (hh + S1 + ch + K[i]! + w[i]!) >>> 0;
      const S0 = (rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      hh = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h[0] = (h[0]! + a) >>> 0;
    h[1] = (h[1]! + b) >>> 0;
    h[2] = (h[2]! + c) >>> 0;
    h[3] = (h[3]! + d) >>> 0;
    h[4] = (h[4]! + e) >>> 0;
    h[5] = (h[5]! + f) >>> 0;
    h[6] = (h[6]! + g) >>> 0;
    h[7] = (h[7]! + hh) >>> 0;
  }

  const digest = new Uint8Array(32);
  const digestView = new DataView(digest.buffer);
  for (let i = 0; i < 8; i += 1) {
    digestView.setUint32(i * 4, h[i]!, false);
  }
  return digest;
}

const HEX = "0123456789abcdef";

export function toHex(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out += HEX[byte >>> 4]! + HEX[byte & 0x0f]!;
  }
  return out;
}

export function fromHex(hex: string): Uint8Array {
  if (hex.length % 2 !== 0 || /[^0-9a-f]/.test(hex)) {
    throw new Error("fromHex: expected an even-length lowercase hex string");
  }
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

const utf8Encoder = new TextEncoder();

export function utf8Bytes(text: string): Uint8Array {
  return utf8Encoder.encode(text);
}

/** SHA-256 of a UTF-8 string, lowercase hex. */
export function sha256Hex(input: string | Uint8Array): string {
  return toHex(sha256Bytes(typeof input === "string" ? utf8Bytes(input) : input));
}

/**
 * Domain-separated digest over an ordered list of parts, joined by NUL.
 * Used everywhere the spec writes `SHA-256(a + NUL + b + NUL + c)`.
 */
export function sha256Domain(...parts: readonly (string | Uint8Array)[]): Uint8Array {
  const encoded = parts.map((part) =>
    typeof part === "string" ? utf8Bytes(part) : part,
  );
  const total =
    encoded.reduce((sum, part) => sum + part.length, 0) + Math.max(0, encoded.length - 1);
  const buffer = new Uint8Array(total);
  let cursor = 0;
  encoded.forEach((part, index) => {
    if (index > 0) {
      buffer[cursor] = 0x00;
      cursor += 1;
    }
    buffer.set(part, cursor);
    cursor += part.length;
  });
  return sha256Bytes(buffer);
}

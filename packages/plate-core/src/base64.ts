/**
 * Isomorphic base64 for UTF-8 payloads.
 *
 * `Buffer` is deliberately avoided so that `SourcePayload.utf8Base64` is
 * produced identically in a browser worker and in the Node export process.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

const LOOKUP: readonly number[] = (() => {
  const table = new Array<number>(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i += 1) {
    table[ALPHABET.charCodeAt(i)] = i;
  }
  return table;
})();

export function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];

    out += ALPHABET[b0 >>> 2]!;
    if (b1 === undefined) {
      out += ALPHABET[(b0 & 0x03) << 4]! + "==";
      break;
    }
    out += ALPHABET[((b0 & 0x03) << 4) | (b1 >>> 4)]!;
    if (b2 === undefined) {
      out += ALPHABET[(b1 & 0x0f) << 2]! + "=";
      break;
    }
    out += ALPHABET[((b1 & 0x0f) << 2) | (b2 >>> 6)]!;
    out += ALPHABET[b2 & 0x3f]!;
  }
  return out;
}

export function base64ToBytes(text: string): Uint8Array {
  const clean = text.replace(/=+$/u, "");
  const out = new Uint8Array(Math.floor((clean.length * 6) / 8));
  let accumulator = 0;
  let bits = 0;
  let cursor = 0;

  for (let i = 0; i < clean.length; i += 1) {
    const code = clean.charCodeAt(i);
    const value = code < 128 ? LOOKUP[code]! : -1;
    if (value < 0) {
      throw new Error("base64ToBytes: invalid base64 character");
    }
    accumulator = (accumulator << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[cursor] = (accumulator >>> bits) & 0xff;
      cursor += 1;
    }
  }
  return out.subarray(0, cursor);
}

const utf8Decoder = new TextDecoder("utf-8", { fatal: true });

export function utf8ToBase64(text: string): string {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function base64ToUtf8(text: string): string {
  return utf8Decoder.decode(base64ToBytes(text));
}

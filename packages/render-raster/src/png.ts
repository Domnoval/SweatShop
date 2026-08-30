/**
 * PNG chunk surgery (spec §15.1).
 *
 * The production PNG must carry no `tEXt`, `zTXt`, `iTXt`, EXIF, XMP, software
 * string, or timestamp. Rather than trusting the rasterizer to emit none, the
 * file is parsed and rebuilt from an allow-list of chunks — anything not on the
 * list cannot survive, including chunk types that did not exist when this was
 * written.
 */

import { PlateError } from "@studio137/plate-core";

const PNG_SIGNATURE = Object.freeze([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * Chunks a production PNG is allowed to keep.
 *
 * `pHYs` stays because physical resolution is production data, not provenance:
 * a press needs it and it says nothing about the machine that made the file.
 */
const ALLOWED_CHUNKS: ReadonlySet<string> = new Set([
  "IHDR",
  "PLTE",
  "tRNS",
  "gAMA",
  "cHRM",
  "sRGB",
  "pHYs",
  "IDAT",
  "IEND",
]);

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = (CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8)) >>> 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function buildChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length, false);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return chunk;
}

/** `pHYs` carrying the plate's DPI, expressed as pixels per metre. */
function physChunk(dpi: number): Uint8Array {
  const pixelsPerMetre = Math.round((dpi / 25.4) * 1000);
  const data = new Uint8Array(9);
  const view = new DataView(data.buffer);
  view.setUint32(0, pixelsPerMetre, false);
  view.setUint32(4, pixelsPerMetre, false);
  view.setUint8(8, 1); // unit specifier: metre
  return buildChunk("pHYs", data).subarray(0);
}

export type ScrubResult = Readonly<{
  png: Uint8Array;
  /** Chunk types removed, for the export report. */
  removed: readonly string[];
}>;

/**
 * Rebuild a PNG from allowed chunks only, stamping the correct physical
 * resolution.
 */
export function scrubPng(input: Uint8Array, dpi: number): ScrubResult {
  for (let index = 0; index < PNG_SIGNATURE.length; index += 1) {
    if (input[index] !== PNG_SIGNATURE[index]) {
      throw new PlateError("INVALID_REQUEST", "Input is not a PNG");
    }
  }

  const view = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const decoder = new TextDecoder("latin1");
  const kept: Uint8Array[] = [new Uint8Array(PNG_SIGNATURE)];
  const removed: string[] = [];

  let offset = PNG_SIGNATURE.length;
  let sawPhys = false;
  let sawIend = false;

  while (offset + 8 <= input.length) {
    const length = view.getUint32(offset, false);
    const type = decoder.decode(input.subarray(offset + 4, offset + 8));
    const total = 12 + length;
    if (offset + total > input.length) {
      throw new PlateError("INVALID_REQUEST", `Truncated PNG chunk "${type}"`);
    }

    if (ALLOWED_CHUNKS.has(type)) {
      if (type === "pHYs") {
        // Replace rather than trust: the rasterizer's own pHYs may not match the
        // DPI the plate was compiled for.
        kept.push(physChunk(dpi));
        sawPhys = true;
      } else if (type === "IDAT" && !sawPhys) {
        kept.push(physChunk(dpi));
        sawPhys = true;
        kept.push(input.subarray(offset, offset + total));
      } else {
        kept.push(input.subarray(offset, offset + total));
      }
    } else {
      removed.push(type);
    }

    offset += total;
    if (type === "IEND") {
      sawIend = true;
      break;
    }
  }

  // A file truncated between chunk boundaries simply ends the loop, which would
  // otherwise emit a headless PNG as a production artifact. Requiring the
  // terminator makes truncation an error rather than a silently corrupt file.
  if (!sawIend) {
    throw new PlateError("INVALID_REQUEST", "PNG ended before its IEND chunk");
  }

  const size = kept.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(size);
  let cursor = 0;
  for (const part of kept) {
    png.set(part, cursor);
    cursor += part.length;
  }

  return Object.freeze({ png, removed: Object.freeze(removed) });
}

/** Read a PNG's declared pixel dimensions from its IHDR. */
export function readPngDimensions(png: Uint8Array): Readonly<{ width: number; height: number }> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return Object.freeze({
    width: view.getUint32(16, false),
    height: view.getUint32(20, false),
  });
}

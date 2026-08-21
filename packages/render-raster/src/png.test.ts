import { describe, expect, it } from "vitest";

import { readPngDimensions, scrubPng } from "./png.js";

/** CRC-32 as PNG defines it, so synthetic chunks are structurally valid. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) {
    c = c ^ byte;
    for (let bit = 0; bit < 8; bit += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    c >>>= 0;
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length, false);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput), false);
  return out;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width, false);
  view.setUint32(4, height, false);
  data[8] = 8; // bit depth
  data[9] = 6; // truecolour with alpha
  return chunk("IHDR", data);
}

function textChunk(type: string, keyword: string, value: string): Uint8Array {
  return chunk(type, new TextEncoder().encode(keyword + " " + value));
}

describe("scrubPng", () => {
  /**
   * Built by hand rather than taken from the rasterizer.
   *
   * Testing against a real resvg PNG proves nothing about stripping: resvg
   * emits no text chunk, so the assertion holds even with the allow-list
   * disabled. A future rasterizer version that starts writing provenance is
   * exactly the case spec section 15.1 guards against, so the input has to
   * contain the chunks the scrub is supposed to remove.
   */
  const withMetadata = concat([
    SIGNATURE,
    ihdr(4, 4),
    textChunk("tEXt", "Software", "some-rasterizer 1.2.3"),
    textChunk("iTXt", "XML:com.adobe.xmp", "xmpmeta artist machine"),
    textChunk("zTXt", "Comment", "draft"),
    chunk("tIME", new Uint8Array([0x07, 0xea, 1, 1, 1, 1, 1])),
    chunk("eXIf", new TextEncoder().encode("Exif MM")),
    chunk("IDAT", new Uint8Array([0x78, 0x9c, 0x63, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01])),
    chunk("IEND", new Uint8Array(0)),
  ]);

  it("removes every chunk outside the production allow-list", () => {
    const { png, removed } = scrubPng(withMetadata, 300);
    expect([...removed].sort()).toEqual(["eXIf", "iTXt", "tEXt", "tIME", "zTXt"]);

    const text = new TextDecoder("latin1").decode(png);
    for (const type of ["tEXt", "iTXt", "zTXt", "tIME", "eXIf"]) {
      expect(text, type + " survived the scrub").not.toContain(type);
    }
    expect(text).not.toContain("some-rasterizer");
    expect(text).not.toContain("artist machine");
  });

  it("keeps the image itself intact and stamps physical resolution", () => {
    const { png } = scrubPng(withMetadata, 300);
    const text = new TextDecoder("latin1").decode(png);
    expect(text).toContain("IHDR");
    expect(text).toContain("IDAT");
    expect(text).toContain("IEND");
    expect(text).toContain("pHYs");
    expect(readPngDimensions(png)).toEqual({ width: 4, height: 4 });
  });

  it("writes the DPI it was given as pixels per metre", () => {
    const { png } = scrubPng(withMetadata, 300);
    const index = new TextDecoder("latin1").decode(png).indexOf("pHYs");
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    // 300 dpi is about 11811 px/m, and the unit specifier must say "metre".
    expect(view.getUint32(index + 4, false)).toBe(Math.round((300 / 25.4) * 1000));
    expect(view.getUint8(index + 12)).toBe(1);
  });

  it("rejects input that is not a PNG", () => {
    expect(() => scrubPng(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9]), 300)).toThrow();
  });

  it("rejects a truncated chunk rather than reading past the buffer", () => {
    const truncated = withMetadata.subarray(0, withMetadata.length - 30);
    expect(() => scrubPng(truncated, 300)).toThrow();
  });
});

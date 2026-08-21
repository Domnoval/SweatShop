/**
 * Encrypted container security (spec §18.2, Phase 9 "manifest tamper tests").
 *
 * A tampered container must fail closed. There is no partial recovery, and a
 * wrong key is deliberately indistinguishable from a modified file.
 */

import { describe, expect, it } from "vitest";

import { OUTPUT_PRESETS, PlateError } from "@studio137/plate-core";
import { compilePlate, exportPrivate } from "@studio137/plate-compiler";
import {
  CONTAINER_CONSTANTS,
  decodeExact,
  generateMasterKey,
  openManifest,
  sealManifest,
} from "@studio137/private-manifest";

import { requestFor, testMasterKey } from "./helpers.js";

const key = testMasterKey();
const PHRASE = "THE ARCHIVE REMEMBERS WHAT THE BODY FORGETS";

const plate = compilePlate(
  requestFor({
    phrase: PHRASE,
    seed: "container-security",
    outputSize: OUTPUT_PRESETS["poster-18x24"],
    density: 30,
    corruptionLevel: 40,
  }),
);

function fresh(): Uint8Array {
  return exportPrivate(plate, key).container;
}

describe("private manifest container", () => {
  it("round trips through seal and open", () => {
    expect(decodeExact(openManifest(fresh(), key))).toBe(PHRASE);
  });

  it("carries the magic bytes and declared version", () => {
    const container = fresh();
    expect(new TextDecoder("latin1").decode(container.subarray(0, 8))).toBe(
      CONTAINER_CONSTANTS.magic,
    );
    const view = new DataView(container.buffer, container.byteOffset, container.byteLength);
    expect(view.getUint16(8, false)).toBe(CONTAINER_CONSTANTS.version);
  });

  it("uses a fresh salt and nonce on every seal", () => {
    // The manifest content is deterministic; the ciphertext must not be.
    const a = fresh();
    const b = fresh();
    expect(a.length).toBe(b.length);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
    expect(decodeExact(openManifest(a, key))).toBe(decodeExact(openManifest(b, key)));
  });

  it("never stores the phrase or seed in plaintext", () => {
    const text = new TextDecoder("latin1").decode(fresh());
    expect(text).not.toContain(PHRASE);
    expect(text).not.toContain("container-security");
  });

  it("refuses the wrong key", () => {
    const wrong = generateMasterKey();
    try {
      openManifest(fresh(), wrong);
      expect.unreachable("expected authentication to fail");
    } catch (error) {
      expect((error as PlateError).code).toBe("MANIFEST_TAMPERED");
      // The message must not reveal whether the key or the file was at fault.
      expect((error as PlateError).message).toContain("key is wrong or the file has been modified");
    }
  });

  it("refuses a flipped ciphertext byte", () => {
    const container = fresh();
    const target = container.length - CONTAINER_CONSTANTS.tagLength - 8;
    container[target] = container[target]! ^ 0xff;
    expect(() => openManifest(container, key)).toThrowError(PlateError);
  });

  it("refuses a flipped authentication tag byte", () => {
    const container = fresh();
    container[container.length - 1] = container[container.length - 1]! ^ 0x01;
    expect(() => openManifest(container, key)).toThrowError(PlateError);
  });

  it("refuses a modified header, which is authenticated as additional data", () => {
    const container = fresh();
    // Flip a bit inside the plate id, which participates in key derivation and
    // is covered by the GCM additional data.
    const idOffset = CONTAINER_CONSTANTS.fixedHeaderLength;
    container[idOffset] = container[idOffset]! ^ 0x01;
    expect(() => openManifest(container, key)).toThrowError(PlateError);
  });

  it("refuses altered magic bytes", () => {
    const container = fresh();
    container[0] = 0x00;
    try {
      openManifest(container, key);
      expect.unreachable("expected a magic byte rejection");
    } catch (error) {
      expect((error as PlateError).message).toContain("magic bytes");
    }
  });

  it("refuses an unsupported container version", () => {
    const container = fresh();
    new DataView(container.buffer, container.byteOffset, container.byteLength).setUint16(8, 99, false);
    try {
      openManifest(container, key);
      expect.unreachable("expected an unsupported-version rejection");
    } catch (error) {
      expect((error as PlateError).code).toBe("UNSUPPORTED_VERSION");
    }
  });

  it("refuses a truncated container", () => {
    const container = fresh();
    expect(() => openManifest(container.subarray(0, container.length - 4), key)).toThrowError(
      PlateError,
    );
    expect(() => openManifest(container.subarray(0, 4), key)).toThrowError(PlateError);
  });

  it("refuses a container whose declared length disagrees with its bytes", () => {
    const container = fresh();
    const view = new DataView(container.buffer, container.byteOffset, container.byteLength);
    view.setUint32(14, 999999, false);
    try {
      openManifest(container, key);
      expect.unreachable("expected a length mismatch rejection");
    } catch (error) {
      expect((error as PlateError).message).toContain("length does not match");
    }
  });

  it("enforces the key length", () => {
    expect(() => sealManifest(exportPrivate(plate, key).manifest, new Uint8Array(16))).toThrowError(
      PlateError,
    );
    expect(() => openManifest(fresh(), new Uint8Array(31))).toThrowError(PlateError);
  });

  it("binds a container to its plate, so one key cannot open another's ciphertext", () => {
    const other = compilePlate(
      requestFor({
        phrase: "A DIFFERENT SIGNAL ENTIRELY",
        seed: "container-security",
        outputSize: OUTPUT_PRESETS["poster-18x24"],
        density: 30,
        corruptionLevel: 40,
      }),
    );
    const a = fresh();
    const b = exportPrivate(other, key).container;

    // Splice the second plate's body under the first plate's header: key
    // derivation is bound to the header's plate id, so this cannot decrypt.
    const spliced = a.slice();
    const bodyStart = CONTAINER_CONSTANTS.fixedHeaderLength + plate.plateId.length;
    if (b.length - bodyStart === spliced.length - bodyStart) {
      spliced.set(b.subarray(bodyStart), bodyStart);
      expect(() => openManifest(spliced, key)).toThrowError(PlateError);
    }
    expect(decodeExact(openManifest(b, key))).toBe("A DIFFERENT SIGNAL ENTIRELY");
  });

  it("rejects a manifest whose recorded code points disagree with its text", () => {
    const exported = exportPrivate(plate, key);
    const forged = {
      ...exported.manifest,
      source: { ...exported.manifest.source, codePoints: [1, 2, 3] },
    };
    try {
      decodeExact(openManifest(sealManifest(forged, key), key));
      expect.unreachable("expected the decoder to reject inconsistent source fields");
    } catch (error) {
      expect((error as PlateError).code).toBe("MANIFEST_TAMPERED");
    }
  });
});

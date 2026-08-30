/**
 * The `.s137` encrypted container (spec §18.1, §18.2).
 *
 * Layout, all integers big-endian:
 *
 *   ┌────────────┬───────────────────────────────────────────────────────────┐
 *   │  8 bytes   │ magic "S137MFST"                                          │
 *   │  2 bytes   │ container version                                         │
 *   │  1 byte    │ salt length                                               │
 *   │  1 byte    │ nonce length                                              │
 *   │  1 byte    │ plate id length                                           │
 *   │  1 byte    │ reserved (0)                                              │
 *   │  4 bytes   │ ciphertext length                                         │
 *   │  P bytes   │ plate id (ASCII)                                          │
 *   ├────────────┼───────────────────────────────────────────────────────────┤
 *   │  N bytes   │ salt   — HKDF-SHA-256 salt, fresh per manifest            │
 *   │  M bytes   │ nonce  — AES-GCM IV, fresh per manifest                   │
 *   │  L bytes   │ ciphertext                                                │
 *   │ 16 bytes   │ GCM authentication tag                                    │
 *   └────────────┴───────────────────────────────────────────────────────────┘
 *
 * The whole header — including the plate id — is authenticated as GCM
 * additional data, so it can take part in key derivation while still being
 * tamper-evident. The plate id is not secret: spec §13 already names public
 * artifacts `plate-{plateId}.canonical.svg`.
 *
 * Any tamper fails closed with MANIFEST_TAMPERED. There is no partial recovery,
 * and a wrong key is deliberately indistinguishable from a modified file.
 *
 * The key is artist-held and arrives as raw bytes. It is never derived from the
 * phrase seed (spec §5.1: "The seed is not an encryption key"), never written
 * into a log or public artifact, and never bundled into browser code — this
 * module is trusted-process only (spec §23).
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

import { PlateError } from "@studio137/plate-core";

import { parseManifest, serializeManifest, type PrivateEncodingManifest } from "./manifest.js";

const MAGIC = Object.freeze([0x53, 0x31, 0x33, 0x37, 0x4d, 0x46, 0x53, 0x54]); // "S137MFST"
const CONTAINER_VERSION = 1;
const SALT_LENGTH = 32;
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const FIXED_HEADER_LENGTH = MAGIC.length + 2 + 1 + 1 + 1 + 1 + 4;

const HKDF_INFO_PREFIX = "studio137:manifest-key:v1";

/** A 32-byte artist-held master key. */
export type MasterKey = Uint8Array;

export function assertMasterKey(key: Uint8Array): MasterKey {
  if (key.length !== KEY_LENGTH) {
    throw new PlateError(
      "INVALID_REQUEST",
      `Master key must be exactly ${KEY_LENGTH} bytes, received ${key.length}`,
    );
  }
  return key;
}

/** Generate a fresh artist master key. Store it outside the repository. */
export function generateMasterKey(): MasterKey {
  return new Uint8Array(randomBytes(KEY_LENGTH));
}

function deriveKey(master: MasterKey, salt: Uint8Array, plateId: string): Uint8Array {
  // Per-manifest salt plus a plate-scoped info string: one container's key
  // cannot open another, even under the same master key.
  return new Uint8Array(
    hkdfSync("sha256", master, salt, `${HKDF_INFO_PREFIX}:${plateId}`, KEY_LENGTH),
  );
}

function buildHeader(plateId: string, ciphertextLength: number): Uint8Array {
  const plateIdBytes = new TextEncoder().encode(plateId);
  if (plateIdBytes.length === 0 || plateIdBytes.length > 255) {
    throw new PlateError("INVALID_REQUEST", "Plate id must be 1–255 bytes", {
      length: plateIdBytes.length,
    });
  }
  const header = new Uint8Array(FIXED_HEADER_LENGTH + plateIdBytes.length);
  header.set(MAGIC, 0);
  const view = new DataView(header.buffer);
  view.setUint16(MAGIC.length, CONTAINER_VERSION, false);
  view.setUint8(MAGIC.length + 2, SALT_LENGTH);
  view.setUint8(MAGIC.length + 3, NONCE_LENGTH);
  view.setUint8(MAGIC.length + 4, plateIdBytes.length);
  view.setUint8(MAGIC.length + 5, 0);
  view.setUint32(MAGIC.length + 6, ciphertextLength, false);
  header.set(plateIdBytes, FIXED_HEADER_LENGTH);
  return header;
}

export function sealManifest(
  manifest: PrivateEncodingManifest,
  masterKey: MasterKey,
): Uint8Array {
  assertMasterKey(masterKey);

  const plaintext = Buffer.from(serializeManifest(manifest), "utf8");
  const salt = new Uint8Array(randomBytes(SALT_LENGTH));
  const nonce = new Uint8Array(randomBytes(NONCE_LENGTH));
  const header = buildHeader(manifest.plateId, plaintext.length);
  const key = deriveKey(masterKey, salt, manifest.plateId);

  let ciphertext: Buffer;
  let tag: Buffer;
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_LENGTH });
    cipher.setAAD(header);
    ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    tag = cipher.getAuthTag();
  } finally {
    key.fill(0);
    plaintext.fill(0);
  }

  const container = new Uint8Array(
    header.length + salt.length + nonce.length + ciphertext.length + tag.length,
  );
  let offset = 0;
  container.set(header, offset);
  offset += header.length;
  container.set(salt, offset);
  offset += salt.length;
  container.set(nonce, offset);
  offset += nonce.length;
  container.set(ciphertext, offset);
  offset += ciphertext.length;
  container.set(tag, offset);

  return container;
}

export function openManifest(
  container: Uint8Array,
  masterKey: MasterKey,
): PrivateEncodingManifest {
  assertMasterKey(masterKey);

  if (container.length < FIXED_HEADER_LENGTH) {
    throw new PlateError("MANIFEST_TAMPERED", "Container is too short to be valid");
  }
  for (let index = 0; index < MAGIC.length; index += 1) {
    if (container[index] !== MAGIC[index]) {
      throw new PlateError("MANIFEST_TAMPERED", "Container magic bytes do not match");
    }
  }

  const view = new DataView(container.buffer, container.byteOffset, container.byteLength);
  const version = view.getUint16(MAGIC.length, false);
  if (version !== CONTAINER_VERSION) {
    throw new PlateError(
      "UNSUPPORTED_VERSION",
      `Container version ${version} is not supported by this build`,
      { version, supported: CONTAINER_VERSION },
    );
  }

  const saltLength = view.getUint8(MAGIC.length + 2);
  const nonceLength = view.getUint8(MAGIC.length + 3);
  const plateIdLength = view.getUint8(MAGIC.length + 4);
  const ciphertextLength = view.getUint32(MAGIC.length + 6, false);

  const headerLength = FIXED_HEADER_LENGTH + plateIdLength;
  const expected = headerLength + saltLength + nonceLength + ciphertextLength + TAG_LENGTH;
  if (expected !== container.length) {
    throw new PlateError("MANIFEST_TAMPERED", "Container length does not match its header", {
      declared: expected,
      actual: container.length,
    });
  }

  const header = container.subarray(0, headerLength);
  const plateId = new TextDecoder().decode(container.subarray(FIXED_HEADER_LENGTH, headerLength));

  let offset = headerLength;
  const salt = container.subarray(offset, offset + saltLength);
  offset += saltLength;
  const nonce = container.subarray(offset, offset + nonceLength);
  offset += nonceLength;
  const ciphertext = container.subarray(offset, offset + ciphertextLength);
  offset += ciphertextLength;
  const tag = container.subarray(offset, offset + TAG_LENGTH);

  const key = deriveKey(masterKey, salt, plateId);
  let plaintext: Uint8Array;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce, { authTagLength: TAG_LENGTH });
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    plaintext = new Uint8Array(Buffer.concat([decipher.update(ciphertext), decipher.final()]));
  } catch {
    throw new PlateError(
      "MANIFEST_TAMPERED",
      "Container failed authentication. The key is wrong or the file has been modified.",
    );
  } finally {
    key.fill(0);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext));
  } catch {
    throw new PlateError("MANIFEST_TAMPERED", "Decrypted manifest is not valid UTF-8 JSON");
  }

  const manifest = parseManifest(parsed);
  if (manifest.plateId !== plateId) {
    throw new PlateError("MANIFEST_TAMPERED", "Container plate id does not match its manifest");
  }
  return manifest;
}

export const CONTAINER_CONSTANTS = Object.freeze({
  magic: "S137MFST",
  version: CONTAINER_VERSION,
  saltLength: SALT_LENGTH,
  nonceLength: NONCE_LENGTH,
  tagLength: TAG_LENGTH,
  keyLength: KEY_LENGTH,
  fixedHeaderLength: FIXED_HEADER_LENGTH,
});

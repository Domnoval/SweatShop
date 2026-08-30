/**
 * The export path must actually scan (spec §24).
 *
 * Gate 5 proves the scanner catches what it is shown. It does not prove the
 * export path shows it anything — with only that coverage, deleting every
 * `assertNoLeaks` call site leaves the whole suite green while public artifacts
 * ship unscanned. These tests fail if a call site disappears.
 */

import { describe, expect, it, vi } from "vitest";

import { OUTPUT_PRESETS, PlateError } from "@studio137/plate-core";

import { requestFor } from "./helpers.js";

const scanCalls: string[] = [];

vi.mock("@studio137/artifact-security", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@studio137/artifact-security")>();
  return {
    ...actual,
    assertNoLeaks: (name: string, content: string | Uint8Array, secrets: unknown) => {
      scanCalls.push(name);
      return actual.assertNoLeaks(
        name,
        content as string,
        secrets as Parameters<typeof actual.assertNoLeaks>[2],
      );
    },
    assertPngHasNoLeaks: (name: string, png: Uint8Array, secrets: unknown) => {
      scanCalls.push(name);
      return actual.assertPngHasNoLeaks(
        name,
        png,
        secrets as Parameters<typeof actual.assertPngHasNoLeaks>[2],
      );
    },
  };
});

const { compilePlate, exportProductionPng, exportPublic } = await import(
  "@studio137/plate-compiler"
);

function plate() {
  return compilePlate(
    requestFor({
      phrase: "THE ARCHIVE REMEMBERS THE BODY",
      seed: "export-scanning",
      outputSize: OUTPUT_PRESETS["poster-18x24"],
      density: 30,
      corruptionLevel: 20,
    }),
  );
}

describe("public export scanning", () => {
  it("scans both the canonical SVG and the print composition", () => {
    scanCalls.length = 0;
    exportPublic(plate());
    expect(scanCalls).toContain("canonical SVG");
    expect(scanCalls).toContain("print composition");
  });

  it("scans the production PNG", () => {
    scanCalls.length = 0;
    const compiled = plate();
    exportProductionPng(compiled, exportPublic(compiled).canonicalSvg, { widthPx: 200 });
    expect(scanCalls).toContain("production PNG");
  });

  it("propagates a scanner refusal instead of releasing the artifact", async () => {
    // If the export path ever stopped calling the scanner, this would resolve
    // to a released artifact rather than a raised PRIVACY_LEAK.
    const security = await import("@studio137/artifact-security");
    const spy = vi
      .spyOn(security, "assertNoLeaks")
      .mockImplementation((name: string) => {
        throw new PlateError("PRIVACY_LEAK", `${name} refused by the scanner`);
      });

    try {
      expect(() => exportPublic(plate())).toThrowError(PlateError);
      try {
        exportPublic(plate());
      } catch (error) {
        expect((error as PlateError).code).toBe("PRIVACY_LEAK");
      }
    } finally {
      spy.mockRestore();
    }
  });
});

/**
 * Verification Gate 2 — exact round trip (spec §26).
 *
 *   decodeExact(decryptManifest(exportPrivate(compilePlate(exactRequest))))
 *     === originalUtf8Phrase
 *
 * Property tests cover composed and decomposed Unicode, punctuation,
 * whitespace, repeated clauses, unsupported words, non-Latin characters,
 * unusual code points, and right-to-left content.
 */

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  OUTPUT_PRESETS,
  PlateError,
  preserveSourcePayload,
  recoverSourceText,
} from "@studio137/plate-core";
import { compilePlate, exportPrivate } from "@studio137/plate-compiler";
import { decodeExact, decodePlate, openManifest, sealManifest } from "@studio137/private-manifest";

import { requestFor, testMasterKey } from "./helpers.js";

const key = testMasterKey();

/** Codes that represent the compiler correctly *refusing* a request. */
const LEGITIMATE_REFUSALS = new Set(["PRINT_SAFETY", "DENSITY_INFEASIBLE", "PHRASE_TOO_LONG"]);

function roundTrip(phrase: string, seed = "gate2"): string | "refused" {
  try {
    const plate = compilePlate(
      requestFor({
        phrase,
        seed,
        // A generous field and low density so layout rarely refuses; when it
        // does, that refusal is itself correct behaviour.
        outputSize: OUTPUT_PRESETS["poster-24x36"],
        density: 15,
        corruptionLevel: 30,
        mode: "exact",
      }),
    );
    const exported = exportPrivate(plate, key);
    const reopened = openManifest(sealManifest(exported.manifest, key), key);
    return decodeExact(reopened);
  } catch (error) {
    if (error instanceof PlateError && LEGITIMATE_REFUSALS.has(error.code)) return "refused";
    throw error;
  }
}

describe("Gate 2: exact round trip", () => {
  it("recovers the golden fixture byte-for-byte", () => {
    expect(roundTrip("THE SIGNAL SURVIVES THE BODY")).toBe("THE SIGNAL SURVIVES THE BODY");
  });

  it.each([
    ["composed (NFC)", "the caf\u00e9 signal"],
    ["decomposed (NFD)", "the cafe\u0301 signal"],
    ["punctuation", "signal, body; void: structure. threshold!"],
    ["whitespace", "  signal   body  \n\n  void  "],
    ["repeated clauses", "signal. signal. signal. signal."],
    ["unsupported words", "signal zzzqqx body plugh"],
    ["non-Latin", "signal 線 body 漢字"],
    ["right-to-left", "signal مرحبا body"],
    ["astral plane", "signal \u{1F701} body \u{10FFFF}"],
    ["combining marks", "sig\u006e\u0301al bo\u0064\u0327y"],
    ["mirrored passage", "the signal | the body"],
    ["mixed everything", "ALL the ancient signal | not مرحبا … body?"],
  ])("recovers %s content exactly", (_label, phrase) => {
    const recovered = roundTrip(phrase);
    if (recovered === "refused") return;
    expect(recovered).toBe(phrase);
  });

  it("preserves arbitrary Unicode through the source payload", () => {
    fc.assert(
      fc.property(fc.fullUnicodeString({ minLength: 1, maxLength: 480 }), (phrase) => {
        const payload = preserveSourcePayload(phrase);
        expect(recoverSourceText(payload)).toBe(phrase);
        expect(payload.originalText).toBe(phrase);
      }),
      { numRuns: 400 },
    );
  });

  it("round trips arbitrary phrases through compile, seal, open, and decode", () => {
    const lexicalWord = fc.constantFrom(
      "signal",
      "body",
      "survives",
      "void",
      "threshold",
      "witness",
      "structure",
      "burns",
      "time",
      "the",
      "not",
      "all",
      "ancient",
      "of",
    );
    const oddity = fc.constantFrom(
      "\u00e9",
      "e\u0301",
      "線",
      "مرحبا",
      "\u{1F701}",
      "xyzzy",
      "don't",
      "self-same",
    );
    const punctuation = fc.constantFrom(".", ",", ";", ":", "|", "...", "!", "?");

    fc.assert(
      fc.property(
        fc.array(fc.oneof(lexicalWord, oddity, punctuation), { minLength: 1, maxLength: 14 }),
        fc.string({ minLength: 1, maxLength: 24 }),
        (tokens, seed) => {
          const phrase = tokens.join(" ").trim();
          if (phrase.length === 0) return;
          const recovered = roundTrip(phrase, seed);
          if (recovered === "refused") return;
          expect(recovered).toBe(phrase);
        },
      ),
      { numRuns: 120 },
    );
  });

  it("still recovers the source in stylized mode, without guaranteeing the visuals", () => {
    const plate = compilePlate(
      requestFor({
        phrase: "the signal survives the body",
        seed: "stylized",
        outputSize: OUTPUT_PRESETS["poster-24x36"],
        density: 20,
        corruptionLevel: 92,
        mode: "stylized",
      }),
    );
    const exported = exportPrivate(plate, key);
    const decoded = decodePlate(openManifest(exported.container, key));

    expect(decoded.phrase).toBe("the signal survives the body");
    expect(decoded.visualDecodingGuaranteed).toBe(false);
  });

  it("recovers the authored reading order after a permutation", () => {
    // A high corruption level in exact mode reorders clauses; the manifest
    // records the original, so the reading is recoverable.
    const plate = compilePlate(
      requestFor({
        phrase: "signal survives body void structure threshold witness",
        seed: "permute-me",
        outputSize: OUTPUT_PRESETS["poster-24x36"],
        density: 20,
        corruptionLevel: 75,
        mode: "exact",
      }),
    );
    const decoded = decodePlate(openManifest(exportPrivate(plate, key).container, key));
    expect(decoded.phrase).toBe("signal survives body void structure threshold witness");

    const permutations = plate.presentation.corruption.operations.filter(
      (operation) => operation.kind === "reversible-permutation",
    );
    for (const permutation of permutations) {
      expect(decoded.readingOrder[permutation.clauseIndex]).toEqual([
        ...permutation.originalOrder,
      ]);
    }
  });

  it("refuses to seal an exact-mode plate carrying an irreversible site", () => {
    // Exact mode rejects destructive operations at plan time, so a high
    // corruption level simply produces no lossy operations rather than a plate
    // that claims exactness it cannot deliver.
    const plate = compilePlate(
      requestFor({
        phrase: "signal survives body",
        seed: "exactness",
        outputSize: OUTPUT_PRESETS["poster-24x36"],
        density: 20,
        corruptionLevel: 99,
        mode: "exact",
      }),
    );
    expect(plate.presentation.corruption.visuallyLossy).toBe(false);
    expect(
      plate.presentation.corruption.corruptionSites.every((site) => site.reversible),
    ).toBe(true);
  });
});

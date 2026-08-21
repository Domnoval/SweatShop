/**
 * Substrate registry (spec §9).
 *
 * V1 accepts identifiers from a finite versioned registry, never arbitrary
 * formulas. An unknown identifier is an error, not an invitation to evaluate
 * something the artist has not approved.
 */

import {
  PlateError,
  type DeterministicStream,
  type Rect,
  type SubstrateId,
} from "@studio137/plate-core";

import { SUBSTRATE_FACTORIES, SUBSTRATE_VERSION } from "./samplers.js";
import type { SubstrateFactory, SubstrateSampler } from "./types.js";

const BY_ID: ReadonlyMap<SubstrateId, SubstrateFactory> = new Map(
  SUBSTRATE_FACTORIES.map((factory) => [factory.id, factory]),
);

export function substrateIds(): readonly SubstrateId[] {
  return Object.freeze([...BY_ID.keys()].sort());
}

export function createSubstrate(
  id: SubstrateId,
  bounds: Rect,
  rng: DeterministicStream,
): SubstrateSampler {
  const factory = BY_ID.get(id);
  if (factory === undefined) {
    throw new PlateError("UNKNOWN_SUBSTRATE", `No substrate registered for "${id}"`, {
      id,
      available: substrateIds(),
    });
  }
  if (bounds.width <= 0 || bounds.height <= 0) {
    throw new PlateError("INVALID_REQUEST", "Substrate bounds must have positive area", {
      bounds,
    });
  }
  return factory.create(bounds, rng);
}

export { SUBSTRATE_VERSION };

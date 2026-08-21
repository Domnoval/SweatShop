/**
 * Layout registry (spec §8).
 *
 * Layouts are finite canon-approved solvers, not arbitrary presets. Requesting
 * a family the canon declares but this build has not implemented is an explicit
 * error — substituting a different family would silently change the artwork.
 */

import { PlateError, type LayoutFamilyId } from "@studio137/plate-core";

import { LAYOUT_SOLVERS } from "./solvers.js";
import { LAYOUT_VERSION, type LayoutSolver } from "./types.js";

const BY_ID: ReadonlyMap<LayoutFamilyId, LayoutSolver> = new Map(
  LAYOUT_SOLVERS.map((solver) => [solver.id, solver]),
);

/** Canon families that have no solver in this build yet. */
export const PENDING_LAYOUT_FAMILIES: readonly LayoutFamilyId[] = Object.freeze([
  "orthogonal-wall",
  "alpha-radial",
  "processional-spiral",
  "mirrored-passage",
  "reliquary-grid",
]);

export function implementedLayoutIds(): readonly LayoutFamilyId[] {
  return Object.freeze([...BY_ID.keys()].sort());
}

export function layoutSolver(id: LayoutFamilyId): LayoutSolver {
  const solver = BY_ID.get(id);
  if (solver === undefined) {
    const pending = PENDING_LAYOUT_FAMILIES.includes(id);
    throw new PlateError(
      "UNKNOWN_LAYOUT",
      pending
        ? `Layout family "${id}" is declared in the canon but has no solver in this build. ` +
          `Implemented families: ${implementedLayoutIds().join(", ")}.`
        : `No layout family registered for "${id}"`,
      { id, implemented: implementedLayoutIds(), pending },
    );
  }
  return solver;
}

export { LAYOUT_VERSION };

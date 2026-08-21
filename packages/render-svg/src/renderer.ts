/**
 * Deterministic canonical SVG renderer (spec §14).
 *
 * The exported SVG is the authoritative vector master. Two guarantees are load-
 * bearing here:
 *
 *  1. **Canonical payload is never redrawn.** Every path in the payload group is
 *     copied verbatim from the locked geometry registry. Substitution swaps one
 *     approved record for another; mirroring, occlusion, and misregistration are
 *     expressed as transforms and masks. `canonicalPathDigest` is the receipt.
 *
 *  2. **Nothing private reaches the file.** The emitter cannot write comments or
 *     metadata, ids are ordinal, and no phrase, seed, payload ref, path, host
 *     name, timestamp, or software string is ever passed to it.
 */

import {
  canonicalDigest,
  COORDINATE_PRECISION,
  formatFixed,
  ordinalId,
  PlateError,
  quantize,
  type NodeId,
  type PlateId,
  type ResolvedOutput,
} from "@studio137/plate-core";
import type { GeometryRegistry, LockedPath } from "@studio137/glyph-registry";
import type { LayoutPlan, PlacedGlyph } from "@studio137/layout-engine";
import type { AtmospherePlan, CorruptionPlan, DecoyNode } from "@studio137/corruption-engine";
import type { SubstrateGuide } from "@studio137/substrate-engine";

import {
  formatMatrix,
  mirrorHorizontal,
  mirrorVertical,
  multiply,
  rotateDegrees,
  scale as scaleMatrix,
  translate,
  type Matrix,
} from "./matrix.js";
import { DEFAULT_PALETTE, normalizePalette, type PlatePalette } from "./palette.js";
import { printBoundaryLayer, type PrintTemplate } from "./print.js";
import { element, group, normalizePathData, selfClosing, type Attribute } from "./xml.js";

export const RENDERER_VERSION = "renderer-svg/v1";

export const SCENE_LAYERS = [
  "substrate",
  "decoys-behind",
  "canonical-payload",
  "reversible-transforms",
  "payload-masks",
  "decoys-front",
  "atmosphere",
  "registration",
  // Extension beyond spec §12.2's list: present only in a print composition,
  // never in the canonical vector master.
  "print-boundaries",
] as const;

export type SceneLayer = (typeof SCENE_LAYERS)[number];

export type BackgroundPolicy = "transparent" | "solid";

export type SceneInput = Readonly<{
  plateId: PlateId;
  output: ResolvedOutput;
  layout: LayoutPlan;
  corruption: CorruptionPlan;
  decoys: readonly DecoyNode[];
  atmosphere: AtmospherePlan;
  substrateGuides: readonly SubstrateGuide[];
  geometry: GeometryRegistry;
  palette?: PlatePalette;
  backgroundPolicy: BackgroundPolicy;
  /** Disable non-canonical layers for a debug render (spec §12.2). */
  layers?: Partial<Record<SceneLayer, boolean>>;
  /**
   * When present, the render is a print composition: bleed, trim, and safe-area
   * boundaries are added on their own layer and the background extends to bleed.
   * The canonical payload is untouched either way (spec §17.1).
   */
  printTemplate?: PrintTemplate;
}>;

export type RenderedScene = Readonly<{
  svg: string;
  /**
   * Digest over the payload paths actually emitted, together with their registry
   * integrity hashes. Stable across stages unless a path was redrawn — which is
   * exactly what verification Gate 4 checks.
   */
  canonicalPathDigest: string;
  renderedNodeIds: readonly NodeId[];
  /** Nodes dropped by a destructive stylized operation. */
  omittedNodeIds: readonly NodeId[];
}>;

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

function fixed(value: number): string {
  return formatFixed(value, COORDINATE_PRECISION);
}

function opacityText(weight: number): string {
  return formatFixed(quantize(Math.min(1, Math.max(0, weight)), 4), 4);
}

function pathAttributes(path: LockedPath, colour: string): readonly Attribute[] {
  if (path.role === "fill") {
    return [
      ["d", normalizePathData(path.d)],
      ["fill", colour],
      ["stroke", "none"],
    ];
  }
  return [
    ["d", normalizePathData(path.d)],
    ["fill", "none"],
    ["stroke", colour],
    ["stroke-width", fixed(path.strokeWidth)],
    ["stroke-linecap", "round"],
    ["stroke-linejoin", "round"],
  ];
}

/** Compose the canonical glyph transform, mirror and misregistration included. */
function glyphMatrix(
  placement: PlacedGlyph,
  inkCentre: Readonly<{ x: number; y: number }>,
  mirrorAxis: "vertical" | "horizontal" | undefined,
  offsetX: number,
  offsetY: number,
): Matrix {
  let matrix = multiply(
    translate(placement.x + offsetX, placement.y + offsetY),
    multiply(rotateDegrees(placement.rotation), scaleMatrix(placement.scale)),
  );
  if (mirrorAxis === "vertical") {
    matrix = multiply(matrix, mirrorVertical(inkCentre.x));
  } else if (mirrorAxis === "horizontal") {
    matrix = multiply(matrix, mirrorHorizontal(inkCentre.y));
  }
  return matrix;
}

export function renderScene(input: SceneInput): RenderedScene {
  const {
    plateId,
    output,
    layout,
    corruption,
    decoys,
    atmosphere,
    substrateGuides,
    geometry,
    backgroundPolicy,
  } = input;

  void plateId; // The plate id is deliberately NOT written into the public file.

  const palette = normalizePalette(input.palette ?? DEFAULT_PALETTE);
  const enabled = (layer: SceneLayer): boolean => input.layers?.[layer] !== false;

  // Re-verify before emitting: Gate 4 checks integrity at every pipeline stage,
  // and export is the last one.
  geometry.verifyIntegrity();

  // ── Index the corruption plan ───────────────────────────────────────────
  const substitution = new Map<NodeId, string>();
  const mirrored = new Map<NodeId, "vertical" | "horizontal">();
  const occlusion = new Map<NodeId, Readonly<{ maskId: string; shapes: readonly { d: string }[] }>>();
  const misregistration = new Map<NodeId, Readonly<{ x: number; y: number }>>();
  const dropped = new Set<NodeId>();
  const abraded = new Set<NodeId>();

  for (const operation of corruption.operations) {
    switch (operation.kind) {
      case "reversible-substitution":
        substitution.set(operation.nodeId, operation.toGeometryId);
        break;
      case "reversible-mirror":
        mirrored.set(operation.nodeId, operation.axis);
        break;
      case "payload-occlusion":
        occlusion.set(operation.nodeId, { maskId: operation.maskId, shapes: operation.shapes });
        break;
      case "lossy-payload":
        if (operation.operation === "dropout") dropped.add(operation.nodeId);
        else if (operation.operation === "misregistration") {
          misregistration.set(operation.nodeId, { x: operation.offsetX, y: operation.offsetY });
        } else abraded.add(operation.nodeId);
        break;
      case "reversible-permutation":
      case "decorative-interference":
        break;
      default: {
        const exhaustive: never = operation;
        throw new PlateError("INVALID_REQUEST", `Unhandled corruption operation`, {
          operation: exhaustive,
        });
      }
    }
  }

  // Permutation: the node at `permutedOrder[i]` takes the layout slot that
  // `originalOrder[i]` authored. The canonical AST is untouched; only which
  // glyph sits where changes.
  const placementByNode = new Map(layout.placements.map((placement) => [placement.nodeId, placement]));
  const slotFor = new Map<NodeId, PlacedGlyph>(placementByNode);
  for (const operation of corruption.operations) {
    if (operation.kind !== "reversible-permutation") continue;
    operation.originalOrder.forEach((originalId, index) => {
      const occupant = operation.permutedOrder[index];
      const slot = placementByNode.get(originalId);
      if (occupant !== undefined && slot !== undefined) slotFor.set(occupant, slot);
    });
  }

  const renderList = layout.placements
    .map((placement) => ({ nodeId: placement.nodeId, slot: slotFor.get(placement.nodeId)! }))
    .filter((entry) => entry.slot !== undefined)
    .sort((a, b) => a.slot.readingIndex - b.slot.readingIndex || (a.nodeId < b.nodeId ? -1 : 1));

  // ── Canonical payload ───────────────────────────────────────────────────
  const payloadChildren: string[] = [];
  const maskDefinitions: string[] = [];
  const maskMarks: string[] = [];
  const digestParts: unknown[] = [];
  const renderedNodeIds: NodeId[] = [];
  const omittedNodeIds: NodeId[] = [];
  let modifierCounter = 0;

  for (const entry of renderList) {
    const { nodeId, slot } = entry;
    if (dropped.has(nodeId)) {
      omittedNodeIds.push(nodeId);
      continue;
    }

    const source = placementByNode.get(nodeId)!;
    const geometryId = substitution.get(nodeId) ?? source.geometryId;
    const record = geometry.get(geometryId);
    const ink = geometry.inkBounds(geometryId);
    const inkCentre = { x: ink.x + ink.width / 2, y: ink.y + ink.height / 2 };
    const offset = misregistration.get(nodeId) ?? { x: 0, y: 0 };

    const matrix = glyphMatrix(slot, inkCentre, mirrored.get(nodeId), offset.x, offset.y);
    const mask = occlusion.get(nodeId);

    const attributes: Attribute[] = [
      ["id", nodeId],
      ["transform", formatMatrix(matrix)],
    ];
    if (mask !== undefined) attributes.push(["mask", `url(#${mask.maskId})`]);

    payloadChildren.push(
      group(
        attributes,
        record.paths.map((path) => selfClosing("path", pathAttributes(path, palette.ink))),
        0,
      ),
    );
    renderedNodeIds.push(nodeId);

    // The receipt: which authored record was used, its registry integrity hash,
    // and the exact path data emitted.
    digestParts.push({
      nodeId,
      geometryId,
      integritySha256: record.integritySha256,
      paths: record.paths.map((path) => normalizePathData(path.d)),
    });

    for (const modifier of slot.modifiers) {
      modifierCounter += 1;
      const modifierRecord = geometry.get(modifier.geometryId);
      const modifierMatrix = multiply(
        translate(modifier.x + offset.x, modifier.y + offset.y),
        multiply(rotateDegrees(modifier.rotation), scaleMatrix(modifier.scale)),
      );
      payloadChildren.push(
        group(
          [
            ["id", ordinalId("m", modifierCounter)],
            ["transform", formatMatrix(modifierMatrix)],
          ],
          modifierRecord.paths.map((path) => selfClosing("path", pathAttributes(path, palette.ink))),
          0,
        ),
      );
      digestParts.push({
        nodeId: ordinalId("m", modifierCounter),
        geometryId: modifier.geometryId,
        integritySha256: modifierRecord.integritySha256,
        paths: modifierRecord.paths.map((path) => normalizePathData(path.d)),
      });
    }

    if (mask !== undefined) {
      // White reveals, black conceals: the glyph stays in the file, complete,
      // beneath a recorded mask (spec §7.3).
      maskDefinitions.push(
        element(
          "mask",
          [
            ["id", mask.maskId],
            ["maskUnits", "userSpaceOnUse"],
          ],
          [
            selfClosing("path", [
              ["d", plateRectPath(output)],
              ["fill", "#ffffff"],
            ]),
            ...mask.shapes.map((shape) =>
              selfClosing("path", [
                ["d", normalizePathData(shape.d)],
                ["fill", "#000000"],
              ]),
            ),
          ],
          0,
        ),
      );
      maskMarks.push(
        ...mask.shapes.map((shape) =>
          selfClosing("path", [
            ["d", normalizePathData(shape.d)],
            ["fill", palette.atmosphere],
            ["opacity", opacityText(0.16 + corruption.level * 0.24)],
          ]),
        ),
      );
    }

    if (abraded.has(nodeId)) {
      maskMarks.push(
        selfClosing("path", [
          ["d", rectPathFor(slot.bounds)],
          ["fill", "none"],
          ["stroke", palette.atmosphere],
          ["stroke-width", fixed(Math.max(1, slot.bounds.width * 0.02))],
          ["opacity", opacityText(0.3)],
        ]),
      );
    }
  }

  // ── Non-payload layers ──────────────────────────────────────────────────
  const substrateChildren = substrateGuides.map((guide) =>
    selfClosing("path", [
      ["d", normalizePathData(guide.d)],
      ["fill", "none"],
      ["stroke", guide.role === "registration" ? palette.registration : palette.substrate],
      ["stroke-width", fixed(guide.strokeWidth)],
      ["opacity", opacityText(guide.weight)],
    ]),
  );

  const decoyChild = (decoy: DecoyNode): string => {
    const record = geometry.get(decoy.geometryId);
    const matrix = multiply(
      translate(decoy.x, decoy.y),
      multiply(rotateDegrees(decoy.rotation), scaleMatrix(decoy.scale)),
    );
    return group(
      [
        ["id", decoy.decoyId],
        ["transform", formatMatrix(matrix)],
        ["opacity", opacityText(decoy.weight)],
      ],
      record.paths.map((path) => selfClosing("path", pathAttributes(path, palette.decoy))),
      0,
    );
  };

  const decoysBehind = decoys.filter((decoy) => decoy.layer === "behind").map(decoyChild);
  const decoysFront = decoys.filter((decoy) => decoy.layer === "front").map(decoyChild);

  // Mirror axes are drawn here so a debug render can isolate the reversible
  // transforms without disturbing the payload layer.
  const transformMarks: string[] = [];
  for (const [nodeId, axis] of [...mirrored.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const slot = slotFor.get(nodeId);
    if (slot === undefined) continue;
    const b = slot.bounds;
    const d =
      axis === "vertical"
        ? `M${fixed(b.x + b.width / 2)} ${fixed(b.y)} L${fixed(b.x + b.width / 2)} ${fixed(b.y + b.height)}`
        : `M${fixed(b.x)} ${fixed(b.y + b.height / 2)} L${fixed(b.x + b.width)} ${fixed(b.y + b.height / 2)}`;
    transformMarks.push(
      selfClosing("path", [
        ["d", d],
        ["fill", "none"],
        ["stroke", palette.registration],
        ["stroke-width", fixed(Math.max(1, Math.min(b.width, b.height) * 0.012))],
        ["opacity", opacityText(0.4)],
      ]),
    );
  }

  const interferenceMarks = corruption.operations
    .filter((operation) => operation.kind === "decorative-interference")
    .flatMap((operation) => operation.shapes);

  const atmosphereChildren = [
    ...interferenceMarks.map((shape) =>
      selfClosing("path", [
        ["d", normalizePathData(shape.d)],
        ["fill", "none"],
        ["stroke", palette.atmosphere],
        ["stroke-width", fixed(shape.strokeWidth)],
        ["opacity", opacityText(shape.weight)],
      ]),
    ),
    ...atmosphere.marks.map((mark) =>
      selfClosing("path", [
        ["d", normalizePathData(mark.d)],
        ["fill", "none"],
        ["stroke", palette.atmosphere],
        ["stroke-width", fixed(mark.strokeWidth)],
        ["opacity", opacityText(mark.weight)],
      ]),
    ),
  ];

  const registrationChildren = registrationMarks(output, palette.registration);

  // ── Assemble ────────────────────────────────────────────────────────────
  const layers: string[] = [];

  const template = input.printTemplate;
  if (backgroundPolicy === "solid" || template?.backgroundPolicy === "extend-to-bleed") {
    layers.push(selfClosing("path", [["d", plateRectPath(output)], ["fill", palette.paper]]));
  }

  const push = (layer: SceneLayer, children: readonly string[], extra?: Attribute[]): void => {
    if (!enabled(layer) || children.length === 0) return;
    layers.push(group([["id", layer], ...(extra ?? [])], children, 0));
  };

  push("substrate", substrateChildren);
  push("decoys-behind", decoysBehind);
  push("canonical-payload", payloadChildren);
  push("reversible-transforms", transformMarks);
  push("payload-masks", maskMarks);
  push("decoys-front", decoysFront);
  push("atmosphere", atmosphereChildren, [
    ["transform", formatMatrix(translate(atmosphere.registrationOffsetX, atmosphere.registrationOffsetY))],
  ]);
  push("registration", registrationChildren);
  if (template !== undefined) {
    push("print-boundaries", printBoundaryLayer(template, output, palette));
  }

  const defs = maskDefinitions.length === 0 ? [] : [element("defs", [], maskDefinitions, 0)];

  const svg = element(
    "svg",
    [
      ["xmlns", SVG_NAMESPACE],
      ["viewBox", `0 0 ${output.widthPx} ${output.heightPx}`],
      ["width", `${formatFixed(output.widthMm, 3)}mm`],
      ["height", `${formatFixed(output.heightMm, 3)}mm`],
      ["shape-rendering", "geometricPrecision"],
    ],
    [...defs, ...layers],
    0,
  );

  return Object.freeze({
    svg: `${svg}\n`,
    canonicalPathDigest: canonicalDigest(digestParts),
    renderedNodeIds: Object.freeze(renderedNodeIds),
    omittedNodeIds: Object.freeze(omittedNodeIds),
  });
}

function plateRectPath(output: ResolvedOutput): string {
  return `M0 0 L${output.widthPx} 0 L${output.widthPx} ${output.heightPx} L0 ${output.heightPx} Z`;
}

function rectPathFor(rect: Readonly<{ x: number; y: number; width: number; height: number }>): string {
  return (
    `M${fixed(rect.x)} ${fixed(rect.y)} ` +
    `L${fixed(rect.x + rect.width)} ${fixed(rect.y)} ` +
    `L${fixed(rect.x + rect.width)} ${fixed(rect.y + rect.height)} ` +
    `L${fixed(rect.x)} ${fixed(rect.y + rect.height)} Z`
  );
}

/** Corner crop marks sized against the declared bleed. */
function registrationMarks(output: ResolvedOutput, colour: string): readonly string[] {
  const bleedPx = Math.round((output.bleedMm / 25.4) * output.dpi);
  if (bleedPx <= 0) return [];
  const length = bleedPx * 0.8;
  const width = Math.max(1, bleedPx * 0.06);
  const corners: readonly (readonly [number, number, number, number])[] = [
    [0, bleedPx, length, bleedPx],
    [bleedPx, 0, bleedPx, length],
    [output.widthPx - length, bleedPx, output.widthPx, bleedPx],
    [output.widthPx - bleedPx, 0, output.widthPx - bleedPx, length],
    [0, output.heightPx - bleedPx, length, output.heightPx - bleedPx],
    [bleedPx, output.heightPx - length, bleedPx, output.heightPx],
    [output.widthPx - length, output.heightPx - bleedPx, output.widthPx, output.heightPx - bleedPx],
    [output.widthPx - bleedPx, output.heightPx - length, output.widthPx - bleedPx, output.heightPx],
  ];
  return corners.map(([x1, y1, x2, y2]) =>
    selfClosing("path", [
      ["d", `M${fixed(x1)} ${fixed(y1)} L${fixed(x2)} ${fixed(y2)}`],
      ["fill", "none"],
      ["stroke", colour],
      ["stroke-width", fixed(width)],
    ]),
  );
}

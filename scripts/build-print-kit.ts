/**
 * Build a garment print kit from locked geometry.
 *
 * Produces transparent, print-resolution artwork straight from `geometry/v2`,
 * bypassing the plate export path entirely — that path forces an opaque paper
 * rectangle and ships no colour profile, so it cannot dress a garment.
 *
 * The useful part is not the export, it is the refusal. Every mark is measured
 * at every size it would print at, and anything whose thinnest stroke falls
 * under the method's floor is dropped from that size with the reason recorded.
 * A stroke that is too fine does not fail visibly at the printer — it fails on
 * the garment, after it is paid for.
 *
 *   pnpm exec tsx scripts/build-print-kit.ts
 */

import { mkdirSync, writeFileSync } from "node:fs";

import { Resvg } from "@resvg/resvg-js";

import { GEOMETRY_V2_SOURCE } from "../packages/glyph-registry/src/geometry.v2.js";

const OUT = new URL("../artifacts/print-kit/", import.meta.url).pathname;
const DPI = 300;

/**
 * Minimum reliable stroke, in millimetres, by method.
 *
 * DTF carries its own white base on the film and holds a finer line than DTG,
 * which must register colour over a separately-laid underbase — on a dark
 * garment that registration is what eats thin strokes and returns a chalky
 * ghost. Light garments need no underbase at all, so the floor drops.
 */
const FLOOR_MM = { dtf: 0.5, dtgDark: 1.0, dtgLight: 0.6 } as const;

type Ink = Readonly<{ id: string; hex: string; on: string }>;

/** Bone rather than pure white: on dark fleece a true #fff reads harsh and cheap. */
const INKS: readonly Ink[] = [
  { id: "bone", hex: "#ece7dc", on: "dark garments" },
  { id: "ink", hex: "#141414", on: "light garments" },
];

type Placement = Readonly<{ id: string; inches: number; note: string }>;

const PLACEMENTS: readonly Placement[] = [
  { id: "back", inches: 14, note: "full back — the mark carries the garment" },
  { id: "chest", inches: 3.5, note: "left chest — companion to a back print" },
];

/**
 * The drop. Curated rather than exhaustive: fifty marks is a registry, eight is
 * a collection. These are the radial and rotational forms — wheels, stars,
 * staves — so the set reads as one line rather than a grab bag.
 */
const DROP = [
  "mark-aegishjalmur",
  "mark-vegvisir",
  "mark-valknut",
  "mark-chaosstar",
  "mark-unicursalhex",
  "mark-webofwyrd",
  "mark-merkaba",
  "mark-sigillumdei",
] as const;

type Row = {
  mark: string;
  placement: string;
  inches: number;
  thinnestMm: number;
  verdict: "any method" | "DTF only" | "REFUSED";
  reason?: string;
};

const rows: Row[] = [];
let written = 0;

mkdirSync(OUT, { recursive: true });

for (const id of DROP) {
  const rec = GEOMETRY_V2_SOURCE.find((r) => r.id === id);
  if (!rec) throw new Error(`not in geometry/v2: ${id}`);

  const name = id.replace("mark-", "");
  const [x0, y0, x1, y1] = rec.inkBounds;
  const w = x1 - x0, h = y1 - y0;
  const span = Math.max(w, h);

  const strokes = rec.paths.filter((p) => p.role === "stroke").map((p) => p.strokeWidth);
  const thinnestUnits = strokes.length > 0 ? Math.min(...strokes) : Infinity;

  for (const place of PLACEMENTS) {
    // Scale so the INK measures the target size. Print areas are quoted as
    // artwork dimensions, never as whatever empty margin a source box carried.
    const mmPerUnit = (place.inches * 25.4) / span;
    const thinnestMm = thinnestUnits * mmPerUnit;

    let verdict: Row["verdict"];
    let reason: string | undefined;
    if (thinnestMm < FLOOR_MM.dtf) {
      verdict = "REFUSED";
      reason = `thinnest stroke ${thinnestMm.toFixed(2)}mm is under the ${FLOOR_MM.dtf}mm DTF floor — it would break up or vanish on fabric`;
    } else if (thinnestMm < FLOOR_MM.dtgDark) {
      verdict = "DTF only";
      reason = `${thinnestMm.toFixed(2)}mm clears DTF but is under the ${FLOOR_MM.dtgDark}mm DTG-on-dark floor, where the underbase eats fine line`;
    } else {
      verdict = "any method";
    }

    // An "any method" row has no reason, and the absent key is the honest
    // record of that: spreading it in conditionally keeps `reason` genuinely
    // optional instead of widening `Row.reason` to `string | undefined`, which
    // would let a row claim a reason whose value is the absence of one.
    rows.push({
      mark: name,
      placement: place.id,
      inches: place.inches,
      thinnestMm,
      verdict,
      ...(reason === undefined ? {} : { reason }),
    });
    if (verdict === "REFUSED") continue;

    const px = Math.round(place.inches * DPI);
    const padX = (span - w) / 2, padY = (span - h) / 2;
    const vb = `${(x0 - padX).toFixed(4)} ${(y0 - padY).toFixed(4)} ${span.toFixed(4)} ${span.toFixed(4)}`;

    for (const ink of INKS) {
      const body = rec.paths
        .map((p) =>
          p.role === "fill"
            ? `<path d="${p.d}" fill="${ink.hex}"/>`
            : `<path d="${p.d}" fill="none" stroke="${ink.hex}" stroke-width="${p.strokeWidth}" stroke-linejoin="round" stroke-linecap="round"/>`,
        )
        .join("\n  ");

      // No background rect: transparency is the entire point of a garment file.
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="${px}" height="${px}">\n  ${body}\n</svg>`;
      const stem = `${OUT}${name}_${place.id}-${place.inches}in_${ink.id}`;
      writeFileSync(`${stem}.svg`, svg, "utf8");
      writeFileSync(`${stem}.png`, new Resvg(svg, { fitTo: { mode: "width", value: px } }).render().asPng());
      written += 2;
    }
  }
}

/* ── spec sheet ─────────────────────────────────────────────────────────── */

const pad = (s: string, n: number) => s.padEnd(n);
const lines: string[] = [
  "STUDIO 137 — GARMENT PRINT KIT",
  `geometry/v2 · ${DROP.length} marks · ${DPI} DPI · transparent RGBA`,
  "",
  "Artwork is sized so the INK measures the stated dimension, not the source box.",
  "Bone (#ece7dc) for dark garments; ink (#141414) for light. Pure white reads",
  "harsh on dark fleece, so the bone is deliberate.",
  "",
  `Stroke floors — DTF ${FLOOR_MM.dtf}mm · DTG on dark ${FLOOR_MM.dtgDark}mm · DTG on light ${FLOOR_MM.dtgLight}mm`,
  "",
  pad("MARK", 16) + pad("PLACE", 8) + pad("SIZE", 8) + pad("THINNEST", 11) + "VERDICT",
  "-".repeat(72),
];

for (const r of rows) {
  lines.push(
    pad(r.mark, 16) + pad(r.placement, 8) + pad(`${r.inches}"`, 8) +
    pad(`${r.thinnestMm.toFixed(2)}mm`, 11) + r.verdict,
  );
  if (r.reason) lines.push(`${" ".repeat(16)}└─ ${r.reason}`);
}

const refused = rows.filter((r) => r.verdict === "REFUSED");
const dtfOnly = rows.filter((r) => r.verdict === "DTF only");

lines.push(
  "",
  `${written} files written.`,
  `${rows.length - refused.length} of ${rows.length} mark/placement combinations are printable.`,
  refused.length ? `${refused.length} refused — see the reasons above; those files were not written.` : "Nothing refused.",
  dtfOnly.length ? `${dtfOnly.length} require DTF specifically. Ordering those as DTG on a dark garment will disappoint.` : "",
  "",
  "Order one sample of anything before listing it.",
);

const sheet = lines.filter((l) => l !== "").join("\n") + "\n";
writeFileSync(`${OUT}SPEC.txt`, sheet, "utf8");
process.stdout.write(sheet);

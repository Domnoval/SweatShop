/**
 * Render every locked mark in a geometry version onto one contact sheet.
 *
 * Spec Phase 1 requires a contact sheet the artist can approve before geometry
 * is frozen. This produces it from the locked path data itself — not from the
 * original draw code — so what you are looking at is exactly what the compiler
 * will emit, including the ink-bounds box it will reserve for layout.
 *
 *   pnpm exec tsx scripts/contact-sheet.ts [--bounds]
 */

import { writeFileSync } from "node:fs";

import { GEOMETRY_V2_SOURCE } from "../packages/glyph-registry/src/geometry.v2.js";

const showBounds = process.argv.includes("--bounds");

const CELL = 132;
const PAD = 15;
const COLS = 8;
const LABEL = 15;

const rows = Math.ceil(GEOMETRY_V2_SOURCE.length / COLS);
const W = COLS * CELL;
const H = rows * (CELL + LABEL);

const esc = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const parts: string[] = [
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`,
  `<rect width="${W}" height="${H}" fill="#07090c"/>`,
];

GEOMETRY_V2_SOURCE.forEach((rec, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const ox = col * CELL;
  const oy = row * (CELL + LABEL);
  const inner = CELL - PAD * 2;
  const scale = inner / 100;

  parts.push(
    `<g transform="translate(${ox + PAD} ${oy + PAD}) scale(${scale.toFixed(5)})">`,
  );

  if (showBounds) {
    const [x0, y0, x1, y1] = rec.inkBounds;
    parts.push(
      `<rect x="${x0}" y="${y0}" width="${(x1 - x0).toFixed(3)}" height="${(y1 - y0).toFixed(3)}" ` +
        `fill="none" stroke="#d2603a" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.75"/>`,
    );
    parts.push(
      `<rect x="0" y="0" width="100" height="100" fill="none" stroke="#243443" stroke-width="0.4"/>`,
    );
  }

  for (const p of rec.paths) {
    if (p.role === "fill") {
      parts.push(`<path d="${esc(p.d)}" fill="#5ef2c4" stroke="none"/>`);
    } else {
      parts.push(
        `<path d="${esc(p.d)}" fill="none" stroke="#c9d2da" stroke-width="${p.strokeWidth}" ` +
          `stroke-linejoin="round" stroke-linecap="round"/>`,
      );
    }
  }
  parts.push(`</g>`);

  const name = rec.id.replace(/^mark-/, "");
  parts.push(
    `<text x="${ox + CELL / 2}" y="${oy + CELL + 10}" fill="#76828f" font-size="9" ` +
      `font-family="monospace" text-anchor="middle" letter-spacing="0.5">${esc(name)}</text>`,
  );
});

parts.push(`</svg>`);

const out = new URL("../artifacts/contact-sheet-v2.svg", import.meta.url);
writeFileSync(out, parts.join("\n"), "utf8");
process.stdout.write(
  `Wrote artifacts/contact-sheet-v2.svg — ${GEOMETRY_V2_SOURCE.length} marks, ` +
    `${GEOMETRY_V2_SOURCE.reduce((n, r) => n + r.paths.length, 0)} locked paths\n`,
);

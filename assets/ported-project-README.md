# Esoterica Codex → `137-studio`

A filterable index of **201 esoteric marks across 13 traditions**, wired to a **live MK·137 kamea engine**. Select any planetary seal and it *derives* — walks the name across the correct magic square — instead of showing a static plate. Ported from the verified standalone (`esoterica-codex-mk137.html`); the data, the SVG draw registry, and the engine are the same code, re-expressed for React.

> Governance: this is a feature module. **Read `DESIGN.md` and `CLAUDE.md` before touching styles.** It ships with its own scoped `codex.css` so it won't fight the global system — but if the codex becomes first-class, promote its tradition tokens into the design system (see *Tokens* below) rather than letting two palettes drift.

---

## 1. File placement

Drop these into the repo, preserving structure. Paths assume the standard `@/*` → project-root alias (Next ships this; confirm `tsconfig.json` has `"paths": { "@/*": ["./*"] }` or `["./src/*"]` and adjust if your code lives under `src/`).

```
app/codex/page.tsx                     → the route  (/codex)
components/codex/EsotericaCodex.tsx     → main client component
components/codex/Glyph.tsx              → ref-based glyph renderer
components/codex/codex.css              → scoped styles + tradition tokens
lib/codex/kamea.ts                      → the engine (squares, ciphers, walk)
lib/codex/glyph-draws.ts               → imperative SVG draw registry  (@ts-nocheck)
lib/codex/codex-data.ts                → the 201-entry index           (@ts-nocheck)
```

The two `@ts-nocheck` modules are **intentional** — they're verbatim ports of imperative drawing/data code that's already runtime-verified. Type-checking the geometry adds noise, not safety. Everything hand-written (`kamea.ts`, both `.tsx`) is fully typed.

---

## 2. Fonts (load-bearing)

The Unicode blocks — Egyptian hieroglyphs, runic, alchemical operators, Hebrew, I-Ching — render through **Noto webfonts**. `codex.css` references them by family name via classes (`.u-sym`, `.u-sym2`, `.u-hiero`, `.u-runic`, `.u-heb`, `.u-tif`). Without them the esoterica is tofu. Two ways to supply them:

**A — quick: a link in `app/layout.tsx`** (`<head>`):

```tsx
<link
  href="https://fonts.googleapis.com/css2?family=Noto+Sans+Symbols&family=Noto+Sans+Symbols+2&family=Noto+Sans+Egyptian+Hieroglyphs&family=Noto+Sans+Runic&family=Noto+Sans+Hebrew:wght@500&family=Noto+Sans+Tifinagh&display=swap"
  rel="stylesheet"
/>
```

**B — optimized: `next/font/google`** in `app/layout.tsx`, exposing each as a CSS variable, then map the variables to the `.u-*` classes in `codex.css`. More work, no external request at runtime, self-hosted. Recommended once you're past first-light.

The geometric forms (Flower of Life, Metatron's Cube, the seals) are **drawn in code** — no font dependency.

---

## 3. Tokens

`codex.css` defines its own palette, including one CSS variable per tradition that doubles as its accent colour:

```
--geo --astro --alch --ang --goe --kab --rune --egy --herm --chaos --ich --adk --vod
```

The component reads `var(--<tradition>)` (e.g. `var(--ang)` for angelic) for glyph stroke, chip dots, and inspector tags. To unify with the **Transmission Codex 14-token palette**: keep these names but re-point their values at your DESIGN.md tokens (or alias them), so the codex breathes the same colour as the rest of the site. The structural tokens (`--void`, `--panel`, `--line`, `--bone*`, Fibonacci `--s2…--s55`) mirror the standalone and should be reconciled the same way.

---

## 4. Verify

```bash
npm run dev      # → http://localhost:3000/codex
```

Checklist:
- Grid renders 201 tiles; chips filter; search hits names **and** meanings.
- Hover/click a tile → inspector updates.
- Click a **planetary seal** (Zazel, Agiel, Aratron, Sorath, …) → the engine auto-loads the name + correct square + Agrippa trace and redraws. The derivation tape shows letter→value→cell.
- Switch cipher / kamea / trace; type any name; export SVG + 2K PNG.
- Console clean; fonts loaded (hieroglyphs/runes are real glyphs, not boxes).

If `@/` imports fail to resolve, your alias points at `src/` — move the folders under `src/` or adjust the imports.

---

## 5. Honest seams

- **Spirit & Intelligence seals are truly kamea-derived** — Agrippa's own method, name walked across the planet's square.
- **Archangel & Olympic seals are Studio-137 derivations** of the name on that planet's square — *not* the historical Heptameron / Arbatel plates. Same instrument, different provenance; framed as such in the UI.
- **Goetic seals stay generated** — deterministic stand-ins, since the Goetia aren't kamea-walks.
- This is **repo-ready but untested in your build** — it compiles against the contracts above, but I can't run your Next/Tailwind pipeline from here. The verify checklist is the handshake.

— derivation over decoration.

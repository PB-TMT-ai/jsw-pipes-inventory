# Application Architecture

> Read this before changing pipeline stages, tabs, or the project layout.

## Tech Stack
- **Framework:** React 18 (JSX, functional components, hooks)
- **Language:** JavaScript (JSX) — no TypeScript in current build
- **Styling:** Tailwind CSS 3.4 (dark mode via `class` strategy)
- **Charts:** Recharts 2.x (BarChart, PieChart)
- **Storage:** Supabase (Postgres) via `@supabase/supabase-js`. Data is fetched on mount and synced on every mutation through `useSupabaseStore` (`src/lib/db.js`). localStorage is used **only for UI preferences** (`jsw:dark`, `jsw:seeded`).
- **Build:** Vite 6.x + @vitejs/plugin-react
- **Font:** Inter (Google Fonts CDN)
- **Type:** Single-page application (SPA). Client-rendered, but **backed by Supabase** — requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`).

## The 4-Stage Pipeline
4-stage manufacturing pipeline tracking steel coil → finished tubes. **Slitting was
re-introduced (June 2026, later change)** so mother coils are slit into **baby coils** before
production; **Bundle Formation was removed**; **Dispatch is uploaded from Excel**. Production
no longer consumes mother coils — it FIFO-consumes **baby coils** on thickness:

1. **Coil Inward** — Mother coil registration (HR coils). Fields: date, **plant**, coil number/ID, grade (free text), thickness, width, invoice/actual weight, cost price, PO number. No chemistry fields. **Plant is set here and only here** — Hyderabad is the only choice until NPMD's own registration lands (phase 2 of the #117 spec) — and the field is **disabled once the coil exists**, because plant describes where a physical object sits.
2. **Slitting** — Manual: operator picks a mother coil and enters baby-coil widths. **Plant is inherited from the mother** (re-read on every save, never typed). Weight & cost split **proportionally by width** across that mother's baby coils (recalc all siblings on every add/edit/delete). Baby IDs are letter-suffixed (`HYD-0626-01-A`); thickness/PO inherited from the mother. Hard-delete (frees the letter); blocked once a production has consumed the baby coil. Table `baby_coils` (store `jsw:babyCoils`).
3. **Production** — Record date + SKU + No. of pieces. **This is the coil-consumption point.** The saved coil split is the **operator's explicit selection only** — it is **never** auto-seeded from FIFO. FIFO is shown as a **non-binding suggestion** (a "Use suggestion" button copies it into the editable rows); whatever rows the operator leaves are what `save()` persists. Stored as `coilAllocations: [{babyCoilId, hrCoilId, pieces, weight}]` (the baby coil **and** its mother) with a `status` of `allocated` / `partial` / `unallocated`. **Plant is inherited from the baby coils consumed** — one plant across every allocation, else `Unattributed`. **Suggestion eligibility = width within ±5 mm AND thickness within ±0.3 mm** of the SKU: a baby coil's slit width must be within ±5 mm of the tube's required strip width (`requiredStripWidth` in `calc.js` — `2×(H+B)` for SHS/RHS, `π×OD` for CHS; width filter skipped when unknown), and its thickness within ±0.3 mm (`coilFifoAllocate`). The SKU picker is searchable; the FIFO suggestion rows are displayed in **descending MT-available** order. The manual assigned-coil dropdown is also searchable and lists **all** baby coils with **more than 0.02 MT free** (not just spec-matched), width+thickness-matched ones flagged `✓` and sorted first by MT available, with thickness & width shown in each label, so the operator can always pick an off-spec coil. Baby coils manually flagged `consumed` are **excluded** from both the picker and the FIFO suggestion.
4. **Dispatch** — Uploaded from an Excel sheet (one row per dispatched line; columns matched case-insensitively). Rows are grouped into one dispatch per (date × vehicle); each entry's coil trace is inherited from **production FIFO** (`dispatchCoilTrace`), so cost reconciliation (mother-coil rate) still works. Invoice Reconciliation CSV export retained.

## Other Modules
Plus: **SKU Master** (232-entry tube catalog — SHS/RHS/CHS, loaded from `src/data/skus.js`), **Coil Tracker** (mother-coil inventory + journey; **also a baby-coil view** — an "All Baby Coils" table with weight/used/free/% used/status when no mother is selected, and that mother's baby coils inside its journey when one is selected), **Dashboard** (KPIs, pipeline, yield, alerts), **Orders & Invoice** (ONE daily "Upload Sales Excel" of the One Helix workbook — Orders tab → `orders` with per-line Confirmed/Non-confirmed; Invoice tab → `dispatches`), and **Sales** (Confirmed / Non-confirmed / Pending to Dispatch / MTD Invoice / Total Orders KPIs + distributor-wise and month-wise tables). The distributor table also carries the **Best Estimate** — a typed monthly target per distributor, edited inline and measured against MTD Invoice; the plant-level Best Estimate in the PB MTD Dashboard report is their sum, no longer typed on the Reports tab (`docs/adr/0001-…`). Its **drill-down** shows unreserved plant on-hand stock against the distributor's pending, per SKU (`docs/adr/0002-…`). **PO Master, Open Order Backlog, and SKU Demand vs Supply were removed (July 2026).**

## Project Structure
```
src/App.jsx          — Complete single-file application (~1700 lines)
src/main.jsx         — React entry point
src/index.css        — Tailwind directives + field color classes (field-manual, field-auto, field-warning)
src/lib/supabase.js  — Supabase client (reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)
src/lib/db.js        — useSupabaseStore hook + camelCase↔snake_case mapping + sync logic
src/lib/logger.ts    — Logging utility
src/data/skus.js     — DEFAULT_SKUS catalog (232 entries; SKU fallback when DB is empty)
src/data/seedData.js — Legacy seed arrays (all empty — no auto-seed of pipeline data)
src/components/      — (Available for future decomposition)
src/pages/           — (Available for future decomposition)
src/hooks/           — (Available for future decomposition)
src/types/           — (Available for future decomposition)
src/styles/          — (Available for future decomposition)
scripts/             — Automation scripts
scripts/region-mtd.mjs — Region split (Invoiced MTD + Pending to serve) for the daily reports.
                         Reads Supabase over plain fetch and computes through src/lib helpers,
                         so the message, the Sales tab and the workbook share one attribution.
blueprints/          — Task SOPs
.workspace/          — Temp files (gitignored)
```

## System Architecture (working model)
**Blueprints (/blueprints)** - Step-by-step instructions in markdown. Goal, inputs, scripts to use, output, edge cases. Check here FIRST.

**Scripts (/scripts)** - Tested, deterministic code. Call these instead of writing from scratch.

Scripts import `src/lib/*.js` directly under **plain Node**, which — unlike Vite and Vitest — does not
resolve extensionless relative paths. So every relative import inside `src/lib` and `src/data` must
carry its `.js` extension. Dropping one breaks every script while breaking no test; that is exactly
how `scripts/coil-realloc-dryrun.mjs` went dead unnoticed. `src/lib/module-resolution.test.js` spawns
a real Node process to guard it. Scripts must never import `db.js` or `supabase.js` — both are
browser-bound (React, `import.meta.env`) and throw under Node; talk to PostgREST over `fetch` instead.

**Workspace (/.workspace)** - Temp files. Never commit. Delete anytime.

## Seed Data
**No pipeline data is auto-seeded.** On first launch the pipeline tables (coils, baby_coils, productions, dispatches) load whatever is in Supabase — the re-enabled `baby_coils` rows reappear if still present. The only fallback is **`DEFAULT_SKUS`** (232-entry catalog in `src/data/skus.js`, SHS/RHS/CHS), used when the `skus` table returns no rows. "Reset Data" in the header clears all pipeline tables and restores `DEFAULT_SKUS`.

## Running the App
```bash
# Requires Supabase env vars first — copy and fill:
cp .env.example .env.local   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
# Fallback if a shell-special char in the path breaks the bin shim:
node node_modules/vite/bin/vite.js
```
Dev server runs on http://localhost:3000. Without valid Supabase env vars the client cannot reach the backend (reads error out → empty pipeline data, SKUs still fall back to `DEFAULT_SKUS`).

## Error Protocol
1. Stop and read the full error
2. Isolate - which component/stage failed
3. Fix and test in browser (check console for errors)
4. Document in LEARNINGS.md
5. Update relevant blueprint

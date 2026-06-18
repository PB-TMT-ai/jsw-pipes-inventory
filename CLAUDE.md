# Project: JSW Pipes & Tubes Inventory

## Core Principle
You operate as the decision-maker in a modular system. Your job is NOT to do everything yourself. Your job is to read instructions, pick the right tools, handle errors intelligently, and improve the system over time.

Why? 90% accuracy across 5 steps = 59% total success. Push repeatable work into tested scripts. You focus on decisions.

## System Architecture
**Blueprints (/blueprints)** - Step-by-step instructions in markdown. Goal, inputs, scripts to use, output, edge cases. Check here FIRST.

**Scripts (/scripts)** - Tested, deterministic code. Call these instead of writing from scratch.

**Workspace (/.workspace)** - Temp files. Never commit. Delete anytime.

## How You Operate
1. Check blueprints first - If one exists, follow it exactly
2. Use existing scripts - Only create new if nothing exists
3. Fail forward - Error -> Fix -> Test -> Update blueprint -> Add to LEARNINGS.md -> System smarter
4. Ask before creating - Don't overwrite blueprints without asking

## Tech Stack
- **Framework:** React 18 (JSX, functional components, hooks)
- **Language:** JavaScript (JSX) — no TypeScript in current build
- **Styling:** Tailwind CSS 3.4 (dark mode via `class` strategy)
- **Charts:** Recharts 2.x (BarChart, PieChart)
- **Storage:** Supabase (Postgres) via `@supabase/supabase-js`. Data is fetched on mount and synced on every mutation through `useSupabaseStore` (`src/lib/db.js`). localStorage is used **only for UI preferences** (`jsw:dark`, `jsw:seeded`).
- **Build:** Vite 6.x + @vitejs/plugin-react
- **Font:** Inter (Google Fonts CDN)
- **Type:** Single-page application (SPA). Client-rendered, but **backed by Supabase** — requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`).

## Application Architecture
4-stage manufacturing pipeline tracking steel coil → finished tube bundles. The slit/tube
stages were removed in June 2026; a **Production** stage and **FIFO coil attribution** were
added in the June 2026 (later) change — operators no longer pick a mother coil by hand at
any step; coils are attributed automatically by FIFO on thickness:
1. **Coil Inward** — Mother coil registration (HR coils). Fields: date, coil number/ID, grade (free text), thickness, width, invoice/actual weight, cost price, PO number. No chemistry fields.
2. **Production** — Record date + SKU + No. of tubes produced. **This is the coil-consumption point.** On save the produced weight is FIFO-allocated across mother coils (oldest `dateOfInward` first, eligible only when coil thickness is within ±5% of the SKU thickness); a batch may split across coils. The ±5% over-fill cap lives here. Stored as `coilAllocations: [{hrCoilId, pieces, weight}]` with a `status` of `allocated` / `partial` / `unallocated`.
3. **Bundle Formation** — Packs the **produced pool** (`produced − bundled` per SKU); you can't bundle more than produced. SKU is chosen manually; the coil split is **inherited from production FIFO** (`bundleCoilTrace`). One record per bundle; the accordion expands to show the derived coil split. (The old manual mother-coil dropdown and `addSource` multi-row flow were removed.)
4. **Dispatch** — Shipment recording; one truck (one weighbridge reading) may carry **multiple invoices** (per-entry `invoiceNo`, may span SKUs). Coil trace is inherited from bundles; cost reconciles weight-weighted across each entry's coil allocations.

Plus: **SKU Master** (232-entry tube catalog — SHS/RHS/CHS, loaded from `src/data/skus.js`), **PO Master**, **Coil Tracker**, **Dashboard** (KPIs, pipeline, yield, alerts)

## Key Algorithm: FIFO Coil Attribution, SKU Weight & Costing
Production consumes coils by FIFO; bundle/dispatch inherit the trace. **No density constants anywhere.**
Pure helpers live in `src/lib/calc.js`. Formulas:
- Weight per Piece = `SKU.weightPerTube / 1000` (kg → tonnes); Total Weight = `Pieces × Weight per Piece`.
- **FIFO allocation** (`coilFifoAllocate`): eligible coils are `!deleted`, `actualWeight>0`, thickness within ±5% of the SKU, sorted oldest `dateOfInward` first (tiebreak `hrCoilId`). Fill each coil to nominal `actualWeight`, spilling to the next; only if pieces remain do coils stretch into the ±5% over-fill band (`overTolerance`). Allocates whole **pieces** (no fractional tubes). Leftover pieces → `shortfall` (never blocks — **allow + warn**).
- Coil consumption (`coilConsumption`) = Σ production `coilAllocations`; a coil's free capacity = `actualWeight − consumed`.
- Bundle availability (`producedPool`) per SKU = `produced − bundled`; bundling is capped at it.
- Dispatch cost rate = `Mother Coil Cost Price / Mother Coil Actual Weight` (₹/MT), weight-weighted across each entry's `coilAllocations` (legacy fallback: single `traceHrCoilId`).
- ±5% tolerance on weight validations (via the shared `tolerance()` helper — returns `ok:true` on falsy args, so cap checks guard `actualWeight>0` explicitly).

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
blueprints/          — Task SOPs
.workspace/          — Temp files (gitignored)
```

## Data Model (Supabase)
All pipeline data lives in **Supabase Postgres**, accessed via `useSupabaseStore(localStorageKey, fallback)` in `src/lib/db.js`. The legacy `jsw:*` strings are now **store keys mapped to Postgres tables** (`TABLE_MAP` in `db.js`), not localStorage keys. Records are stored snake_case in Postgres and converted to/from camelCase on read/write (`toCamel`/`toSnake`; note: conversion is **top-level only** — nested arrays like `bundle_entries` keep camelCase inner keys).

| Store key | Postgres table | Stage / contents |
|-----------|---------------|------------------|
| `jsw:coils` | `coils` | Stage 1 mother coil records |
| `jsw:productions` | `productions` | Stage 2 production batches. Each carries `coil_allocations` (JSONB `[{hrCoilId,pieces,weight}]`, camelCase inner keys) — the FIFO coil split — and a `status` |
| `jsw:bundles` | `bundles` | Stage 3 bundle rows (one per bundle). `coil_allocations` (JSONB) is the inherited split; `hr_coil_id` = primary coil (back-compat) |
| `jsw:dispatches` | `dispatches` | Stage 4 dispatch records. `bundle_entries` carry per-entry `invoiceNo` (multi-invoice), `coilAllocations`, and legacy `traceHrCoilId` |
| `jsw:skus` | `skus` | SKU master (falls back to `DEFAULT_SKUS` when table is empty) |
| `jsw:purchaseOrders` | `purchase_orders` | PO Master |

The change is **additive/backward-compatible**: legacy bundles/dispatches without `coilAllocations` fall back to `hrCoilId`/`traceHrCoilId`. Run the new `productions` table DDL + `bundles.coil_allocations` column from `supabase-setup.sql` once in the Supabase SQL editor.

The `baby_coils` and `tubes` tables still exist in Postgres but are **legacy** — emptied by the June 2026 one-time wipe (see `supabase-setup.sql`) and no longer read/written by the app.

Mutations update React state optimistically, then sync to Supabase in the background; failures broadcast a `jsw:syncError` window event.

### localStorage (preferences only)
- `jsw:dark` — Dark mode preference (boolean)
- `jsw:seeded` — Legacy seed flag toggled by "Reset Data" (boolean)

## Seed Data
**No pipeline data is auto-seeded.** On first launch the pipeline tables (coils, productions, bundles, dispatches) load whatever is in Supabase — empty on a fresh project (`src/data/seedData.js` arrays are all empty). The only fallback is **`DEFAULT_SKUS`** (232-entry catalog in `src/data/skus.js`, SHS/RHS/CHS), used when the `skus` table returns no rows. "Reset Data" in the header clears all pipeline tables and restores `DEFAULT_SKUS`.

## Running the App
```bash
# Requires Supabase env vars first — copy and fill:
cp .env.example .env.local   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
# Fallback if a shell-special char in the path breaks the bin shim:
node node_modules/vite/bin/vite.js
```
Dev server runs on http://localhost:3000. Without valid Supabase env vars the client cannot reach the backend (reads error out → empty pipeline data, SKUs still fall back to `DEFAULT_SKUS`).

## Code Standards
- Functional components only
- `useSupabaseStore` custom hook for Supabase-backed state (returns `[data, setter, loading]`)
- `useCallback`/`useMemo` for derived calculations
- Soft-delete pattern (deleted: true flag, filter in display)
- Color-coded fields: blue (manual), green (auto-calc), yellow (warning)
- All IDs generated via `crypto.randomUUID()`

## UI Patterns
- Reusable components: `Field`, `Input`, `Select`, `Btn`, `Badge`, `YieldBadge`, `Card`, `Section`, `DataTable`, `SearchInput`
- DataTable supports: search/filter, column sorting, edit/delete actions, sticky headers
- Tolerance badges: green ✔ OK (≤100%) / yellow ⚠ (100-105%, within tolerance) / red ✘ (>105%, save blocked)
- Helper labels on key fields (small gray text below label)
- Responsive grid: 2-col mobile, 4-col desktop
- Dark mode: toggle in header, class-based via Tailwind

### Stage 2 Production — Form + Table UI
- Simple form (mirrors Coil Inward), not an accordion. Fields: Date, Production No., **SKU** (manual Select of published SKUs), No. of Pieces; auto fields Wt/Piece, Total Weight, **Assigned Coils** (live `coilFifoAllocate` preview rendered as green/amber chips), Allocated (pcs), # Source Coils.
- Badges are **informational, never block save** (`canSave = skuCode && pieces`): green "Fully allocated", amber "Within tolerance", amber/red "Shortfall", red "No eligible coil". Status column shows `Allocated` / `Partial` / `Unallocated`.
- Coil-delete guard: a coil consumed by any production cannot be deleted (Coil Inward blocks it).

### Stage 3 Bundle Formation — Accordion Table UI
- **No DataTable or summary cards** — a custom expandable accordion, **one row per bundle**.
- **Parent rows**: Bundle ID, SKU, Pieces, Total Weight, **# Coils**, Status (Edit/Del in the Status cell when not dispatched).
- **Expanded child rows**: the **auto-derived** coil split (`bundleCoilTrace`) — Mother Coil, Pieces, Wt/Piece, Total Wt — plus a totals row. (Read-only; coils are not chosen by hand.)
- **Single form** (no `addSource`/manual-coil dropdown): Date, Bundle No., **SKU** (only SKUs with `available > 0` from the produced pool), No. of Pieces (capped at available). `canSave` requires `coilAllocations.length > 0` (i.e. production exists). On save the bundle stores `coilAllocations` + `hrCoilId` (primary coil, back-compat).
- **Search & sort** on accordion: SearchInput filters by Bundle ID, SKU, or coil; clickable column headers for sorting.
- **State**: `expandedBundles` (Set), `accSearch`, `accSortCol`, `accSortDir`.
- Dispatched bundles show green `border-l-4` indicator and hide Edit/Del buttons.

### Stage 4 Dispatch — Multiple Invoices per Vehicle
- One truck = one weighbridge reading (`vehicleWeight`); variance checked against the whole-vehicle theoretical total.
- Bundles are grouped into invoices via a per-entry `invoiceNo`. The form has a **"Invoice No. (for bundles added below)"** input (`currentInvoiceNo`, not persisted) — set it, add bundles, change it, add more. The selected list is grouped by invoice with editable per-group invoice numbers and subtotals.
- Save requires `vehicleNo`, ≥1 bundle, and every entry to have an `invoiceNo`. Reconciliation CSV emits one row per (date × invoice × SKU).

## Error Protocol
1. Stop and read the full error
2. Isolate - which component/stage failed
3. Fix and test in browser (check console for errors)
4. Document in LEARNINGS.md
5. Update relevant blueprint

## What NOT To Do
- Don't skip blueprint check
- Don't ignore errors and retry blindly
- Don't create files outside structure
- Don't write from scratch when blueprint exists
- Don't use density constants for weight — derive from `SKU.weightPerTube`
- Don't reintroduce the slit/tube stages or `baby_coils`/`tubes` stores (removed June 2026)
- Don't reintroduce manual mother-coil selection — coils are attributed by FIFO (Production consumes; Bundle/Dispatch inherit). Production is the consumption point, not Bundle Formation.
- Don't break the single-file App.jsx pattern without explicit request

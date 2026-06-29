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
4-stage manufacturing pipeline tracking steel coil → finished tubes. **Slitting was
re-introduced (June 2026, later change)** so mother coils are slit into **baby coils** before
production; **Bundle Formation was removed**; **Dispatch is uploaded from Excel**. Production
no longer consumes mother coils — it FIFO-consumes **baby coils** on thickness:
1. **Coil Inward** — Mother coil registration (HR coils). Fields: date, coil number/ID, grade (free text), thickness, width, invoice/actual weight, cost price, PO number. No chemistry fields.
2. **Slitting** — Manual: operator picks a mother coil and enters baby-coil widths. Weight & cost split **proportionally by width** across that mother's baby coils (recalc all siblings on every add/edit/delete). Baby IDs are letter-suffixed (`HYD-0626-01-A`); thickness/PO inherited from the mother. Hard-delete (frees the letter); blocked once a production has consumed the baby coil. Table `baby_coils` (store `jsw:babyCoils`).
3. **Production** — Record date + SKU + No. of pieces. **This is the coil-consumption point.** The saved coil split is the **operator's explicit selection only** — it is **never** auto-seeded from FIFO. FIFO is shown as a **non-binding suggestion** (a "Use suggestion" button copies it into the editable rows); whatever rows the operator leaves are what `save()` persists. Stored as `coilAllocations: [{babyCoilId, hrCoilId, pieces, weight}]` (the baby coil **and** its mother) with a `status` of `allocated` / `partial` / `unallocated`. **Suggestion eligibility = width within ±5 mm AND thickness within ±0.3 mm** of the SKU: a baby coil's slit width must be within ±5 mm of the tube's required strip width (`requiredStripWidth` in `calc.js` — `2×(H+B)` for SHS/RHS, `π×OD` for CHS; width filter skipped when unknown), and its thickness within ±0.3 mm (`coilFifoAllocate`). The SKU picker is searchable; the FIFO suggestion rows are displayed in **descending MT-available** order. The manual assigned-coil dropdown is also searchable and lists **all** baby coils with **more than 0.02 MT free** (not just spec-matched), width+thickness-matched ones flagged `✓` and sorted first by MT available, with thickness & width shown in each label, so the operator can always pick an off-spec coil. Baby coils manually flagged `consumed` are **excluded** from both the picker and the FIFO suggestion.
4. **Dispatch** — Uploaded from an Excel sheet (one row per dispatched line; columns matched case-insensitively). Rows are grouped into one dispatch per (date × vehicle); each entry's coil trace is inherited from **production FIFO** (`dispatchCoilTrace`), so cost reconciliation (mother-coil rate) still works. Invoice Reconciliation CSV export retained.

Plus: **SKU Master** (232-entry tube catalog — SHS/RHS/CHS, loaded from `src/data/skus.js`), **PO Master**, **Coil Tracker** (mother-coil inventory + journey; **also a baby-coil view** — an "All Baby Coils" table with weight/used/free/% used/status when no mother is selected, and that mother's baby coils inside its journey when one is selected), **Dashboard** (KPIs, pipeline, yield, alerts)

## Key Algorithm: FIFO Coil Attribution, SKU Weight & Costing
Slitting splits mother→baby proportionally by width; Production FIFO-consumes **baby coils**; dispatch inherits the trace. **No density constants anywhere.**
Pure helpers live in `src/lib/calc.js`. Formulas:
- Weight per Piece = `SKU.weightPerTube / 1000` (kg → tonnes); Total Weight = `Pieces × Weight per Piece`.
- Baby coil weight/cost = `(baby width / Σ sibling widths) × mother actualWeight / costPrice` (so baby and mother cost-per-MT are identical).
- **FIFO allocation** (`coilFifoAllocate`): generic over `{hrCoilId, thickness, actualWeight, dateOfInward}`. Production feeds it **baby coils** via an adapter (`{hrCoilId: babyCoilId, actualWeight: baby weight, dateOfInward: dateOfConversion}`) — and **pre-filters** that adapter to coils whose slit width is within **±5 mm** of `requiredStripWidth(sku)` (skipped when the width is unknown) — then **enriches** each allocation with the mother `hrCoilId`. Eligible coils are `!deleted`, `actualWeight>0`, and thickness-matched to the SKU — within `thickTolMm` (absolute mm) when the caller passes it (Production passes **±0.3 mm**), else within ±`tol` relative (default ±5%) — sorted oldest first (tiebreak id). So Production eligibility is **width ±5 mm AND thickness ±0.3 mm**. Fill each to nominal capacity, spilling to the next; only if pieces remain do they stretch into the ±5% over-fill band (`overTolerance`). Whole **pieces** only. Leftover → `shortfall` (never blocks — **allow + warn**). **FIFO output is only a suggestion** — it is never auto-saved; the operator's explicit selection is what `save()` persists.
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
| `jsw:babyCoils` | `baby_coils` | Stage 2 slitting output. Width-proportional `weight`/`cost_price`, `hr_coil_id` = mother, letter-suffixed `baby_coil_id`. Carries a manual `consumed` boolean (hides the coil from the Production picker/FIFO; set per-row or via bulk edit). **Hard-delete** table |
| `jsw:productions` | `productions` | Stage 3 production batches. Each carries `coil_allocations` (JSONB `[{babyCoilId,hrCoilId,pieces,weight}]`, camelCase inner keys) — the baby-coil FIFO split (with mother id) — and a `status` |
| `jsw:dispatches` | `dispatches` | Stage 4 dispatch records (uploaded from Excel). `bundle_entries` carry per-entry `invoiceNo`, `coilAllocations` (`{babyCoilId,hrCoilId,…}`), and legacy `traceHrCoilId` |
| `jsw:skus` | `skus` | SKU master (falls back to `DEFAULT_SKUS` when table is empty) |
| `jsw:purchaseOrders` | `purchase_orders` | PO Master |

The change is **additive/backward-compatible**: production `coil_allocations` carry **both** `babyCoilId` (capacity/FIFO) and the mother `hrCoilId` (cost/tracker), and legacy mother-only/`traceHrCoilId` rows still resolve. The `baby_coils` table is **active again** — re-added to `TABLE_MAP`/`HARD_DELETE_TABLES` in `db.js`; the `delete from baby_coils;` wipe was removed from `supabase-setup.sql`.

The `bundles` and `tubes` tables still exist in Postgres but are **legacy** — Bundle Formation was removed and the tube stage stays removed; neither is read/written by the app.

Mutations update React state optimistically, then sync to Supabase in the background; failures broadcast a `jsw:syncError` window event.

### localStorage (preferences only)
- `jsw:dark` — Dark mode preference (boolean)
- `jsw:seeded` — Legacy seed flag toggled by "Reset Data" (boolean)

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

## Code Standards
- Functional components only
- `useSupabaseStore` custom hook for Supabase-backed state (returns `[data, setter, loading]`)
- `useCallback`/`useMemo` for derived calculations
- Soft-delete pattern (deleted: true flag, filter in display)
- Color-coded fields: blue (manual), green (auto-calc), yellow (warning)
- All IDs generated via `crypto.randomUUID()`

## UI Patterns
- Reusable components: `Field`, `Input`, `Select`, `Btn`, `Badge`, `YieldBadge`, `Card`, `Section`, `DataTable`, `SearchInput`
- DataTable supports: global search, **per-column search** (filter row under the headers), optional **multi-value dropdown `filters`** (tick several values at once via `MultiSelectFilter`; empty = all), column sorting, edit/delete actions, sticky headers, and optional **row multi-select** (`selectable` → checkbox column + select-all) with a **bulk-action bar** (`bulkActions=[{label,onClick(selectedRows),variant?}]`)
- Tolerance badges: green ✔ OK (≤100%) / yellow ⚠ (100-105%, within tolerance) / red ✘ (>105%, save blocked)
- Helper labels on key fields (small gray text below label)
- Responsive grid: 2-col mobile, 4-col desktop
- Dark mode: toggle in header, class-based via Tailwind

### Stage 2 Slitting — Form + Table UI
- Manual form (mirrors Coil Inward). Fields: Date of Conversion, **HR Coil ID** (Select of mother coils with remaining slit capacity), Width, optional Length; auto fields Baby Coil Entry (letter), Baby Coil ID, Thickness/PO (inherited), Weight & Cost Price (width-proportional).
- 3-color width check vs mother width: green (≤ mother−5mm), yellow (≤ mother), red (> mother → save blocked).
- On every add/edit/delete, **all sibling baby coils of that mother are recalculated** (proportional weight/cost). **Hard delete** frees the letter; blocked if a production has consumed the baby coil.
- Table also shows **% Used** (computed `coilConsumption` / weight; rows ≥97% flagged red) and a **Consumed** status. The edit form has a **Consumed** checkbox, and the table supports **multi-select + bulk "Mark consumed / Mark active"**. % used is display-only — there is **no automatic 97% hide**; a coil leaves the Production picker only when manually marked `consumed`.

### Stage 3 Production — Form + Table UI
- Simple form (mirrors Coil Inward). Fields: Date, **SKU** (Select of published SKUs), No. of Pieces; auto fields Wt/Piece, Total Weight, Allocated (pcs), # Source Coils. **Assigned Baby Coils** starts **empty** — the operator picks coils manually (or clicks **"Use suggestion"** to copy in the read-only FIFO suggestion). `manualAlloc` (`null`/`[]` ⇒ nothing assigned; never auto-FIFO) is the single source of truth that `save()` persists; each row carries a stable `_rid` so the picker reliably shows the chosen coil.
- Badges are **informational, never block save** (`canSave = skuCode && pieces`): green "Fully allocated", amber "Within tolerance", amber/red "Shortfall", red "No eligible baby coil". Status column shows `Allocated` / `Partial` / `Unallocated`.
- Baby-coil-delete guard: a baby coil consumed by any production cannot be deleted (Slitting blocks it). `coilAllocations` store `{babyCoilId, hrCoilId, pieces, weight}` (baby + mother).

### Stage 4 Dispatch — Excel Upload
- **No manual form** — click **Upload Dispatch Excel** (`.xlsx/.xls`). Mirrors the PO Master importer: dynamic `import('xlsx')`, `toISODate`, case-insensitive `pick()` header matching (`mapDispatchRow`).
- Recognised columns: Date of Dispatch, Vehicle No, Invoice No, SKU (code/description), Pieces and/or Weight (MT), Vehicle Weight. Rows group into one dispatch per (date × vehicle).
- Each entry's coil split is inherited from production FIFO (`dispatchCoilTrace`, carrying `{babyCoilId, hrCoilId}`), so the **persisted shape is unchanged** — `buildReconciliationRows`, the records table, and the Invoice Reconciliation CSV (one row per date × invoice × SKU) are untouched.

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
- Don't reintroduce the **tube** stage or the `tubes` store (the slitting/`baby_coils` stage is active again, but tubes stay removed)
- Don't reintroduce **Bundle Formation** or the `bundles` store (removed June 2026, later change) — dispatch draws straight from production
- Don't make Production consume mother coils — it FIFO-consumes **baby coils**; only **Slitting** is manual (operator picks the mother coil). Dispatch inherits the trace and is **uploaded from Excel**, not entered by hand.
- Don't store production `coilAllocations` without BOTH `babyCoilId` and the mother `hrCoilId` — the mother id keeps cost reconciliation & Coil Tracker working
- Don't let the FIFO/coil suggestion **auto-save** — in Production it is **guidance only**. The operator's explicit selection (`manualAlloc`) is the single source of truth for what's saved; FIFO is copied in only via "Use suggestion"
- Don't break the single-file App.jsx pattern without explicit request

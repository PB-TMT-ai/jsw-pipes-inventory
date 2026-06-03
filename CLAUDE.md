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
5-stage manufacturing pipeline tracking steel coil → finished tube bundles:
1. **Coil Inward** — Mother coil registration (HR coils). Fields: date, coil number/ID, grade (free text), thickness, width, invoice/actual weight, cost price, PO number. No chemistry fields.
2. **Coil to Slit** — Slitting into baby coils (proportionate weight & cost)
3. **Slit to Tube** — Tube manufacturing from baby coils (width is manual entry, validated against baby coil width)
4. **Bundle Formation** — Grouping tubes into dispatch bundles (multi-coil support, accordion table UI)
5. **Dispatch** — Shipment recording with vehicle/invoice details

Plus: **SKU Master** (232-entry tube catalog — SHS/RHS/CHS, loaded from `src/data/skus.js`), **PO Master**, **Coil Tracker**, **Dashboard** (KPIs, pipeline, yield, alerts)

## Key Algorithm: Proportionate Weight & Cost
Weight and cost cascade from mother coil through each stage by dimensional ratio.
**No density constants anywhere.** Formulas:
- Baby Coil Weight = `(Baby Width / Sum of All Baby Widths) × Mother Actual Weight`
- Baby Coil Cost Price = `(Baby Width / Sum of All Baby Widths) × Mother Cost Price`
- When any sibling is added/edited/deleted, ALL siblings recalculate (both weight and cost)
- ±5% tolerance on all width and weight validations
- Width sum validation: green (≤100%), yellow (100-105% — can save), red (>105% — save blocked)

## Project Structure
```
src/App.jsx          — Complete single-file application (~2100 lines)
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
| `jsw:babyCoils` | `baby_coils` | Stage 2 baby coil records |
| `jsw:tubes` | `tubes` | Stage 3 tube production records |
| `jsw:bundles` | `bundles` | Stage 4 bundle rows |
| `jsw:dispatches` | `dispatches` | Stage 5 dispatch records |
| `jsw:skus` | `skus` | SKU master (falls back to `DEFAULT_SKUS` when table is empty) |
| `jsw:purchaseOrders` | `purchase_orders` | PO Master |

Mutations update React state optimistically, then sync to Supabase in the background; failures broadcast a `jsw:syncError` window event.

### localStorage (preferences only)
- `jsw:dark` — Dark mode preference (boolean)
- `jsw:seeded` — Legacy seed flag toggled by "Reset Data" (boolean)

## Seed Data
**No pipeline data is auto-seeded.** On first launch the pipeline tables (coils, baby coils, tubes, bundles, dispatches) load whatever is in Supabase — empty on a fresh project (`src/data/seedData.js` arrays are all empty). The only fallback is **`DEFAULT_SKUS`** (232-entry catalog in `src/data/skus.js`, SHS/RHS/CHS), used when the `skus` table returns no rows. "Reset Data" in the header clears all pipeline tables and restores `DEFAULT_SKUS`.

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

### Stage 4 Bundle Formation — Accordion Table UI
- **No DataTable or summary cards** — uses a custom expandable accordion table
- **Parent rows**: one row per bundle (grouped by `bundleId`), showing Bundle ID, SKU, Total Pieces, Total Weight, # Sources, Status
- **Expanded child rows**: click a parent row to expand; shows individual coil source allocations (Baby Coil ID, Pieces, Wt/Piece, Total Wt) with Edit/Del actions and a totals row
- **Two-mode form**:
  - `formMode='new'`: "Create New Bundle" — 3-col bundle info (Date, Bundle No., Baby Coil ID), divider, then 5-col allocation details (SKU auto, Pieces, Remaining auto, Wt/Piece auto, Total Weight auto)
  - `formMode='addSource'`: "Add Source to BND-X" — context bar (Bundle ID, SKU, Current Pieces), then simplified fields (Date, Baby Coil ID, Pieces, Wt/Piece auto)
- **"+ Add Source"** button inside expanded accordion rows (hidden for dispatched bundles)
- **Search & sort** on accordion: SearchInput filters by Bundle ID, SKU, or Baby Coil ID; clickable column headers for sorting
- **State**: `formMode`, `targetBundleId`, `expandedBundles` (Set), `accSearch`, `accSortCol`, `accSortDir`
- Dispatched bundles show green `border-l-4` indicator and hide Edit/Del/Add Source buttons

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
- Don't use density constants for weight — always proportionate method
- Don't break the single-file App.jsx pattern without explicit request

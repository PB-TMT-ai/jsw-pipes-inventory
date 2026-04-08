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
- **Storage:** localStorage with JSON serialization (namespaced `jsw:` keys)
- **Build:** Vite 6.x + @vitejs/plugin-react
- **Font:** Inter (Google Fonts CDN)
- **Type:** Single-page application (SPA), client-side only, no backend

## Application Architecture
5-stage manufacturing pipeline tracking steel coil → finished tube bundles:
1. **Coil Inward** — Mother coil registration (HR coils). Fields: date, coil number/ID, grade (free text), thickness, width, invoice/actual weight, cost price, PO number. No chemistry fields.
2. **Coil to Slit** — Slitting into baby coils (proportionate weight & cost)
3. **Slit to Tube** — Tube manufacturing from baby coils (width is manual entry, validated against baby coil width)
4. **Bundle Formation** — Grouping tubes into dispatch bundles (multi-coil support, accordion table UI)
5. **Dispatch** — Shipment recording with vehicle/invoice details

Plus: **SKU Master** (8 SHS tube specs), **Dashboard** (KPIs, pipeline, yield, alerts)

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
src/App.jsx          — Complete single-file application (~900 lines)
src/main.jsx         — React entry point
src/index.css        — Tailwind directives + field color classes (field-manual, field-auto, field-warning)
src/lib/logger.ts    — Logging utility
src/components/      — (Available for future decomposition)
src/pages/           — (Available for future decomposition)
src/hooks/           — (Available for future decomposition)
src/types/           — (Available for future decomposition)
src/styles/          — (Available for future decomposition)
scripts/             — Automation scripts
blueprints/          — Task SOPs
.workspace/          — Temp files (gitignored)
```

## localStorage Keys
- `jsw:coils` — Stage 1 coil records (array)
- `jsw:babyCoils` — Stage 2 baby coil records (array)
- `jsw:tubes` — Stage 3 tube production records (array)
- `jsw:bundles` — Stage 4 bundle rows (array)
- `jsw:dispatches` — Stage 5 dispatch records (array)
- `jsw:skus` — SKU master data (array)
- `jsw:dark` — Dark mode preference (boolean)
- `jsw:seeded` — Whether seed data has been loaded (boolean)

## Seed Data
7 pre-loaded coils on first launch:
- HYD-0326-01 through HYD-0326-04 (March 2026, widths 1250/1500mm)
- HYD-0426-05 through HYD-0426-07 (April 2026, widths 930-1264mm)
- 8 SHS SKU specs pre-loaded in SKU Master
- Reset via "Reset Data" button in header

## Running the App
```bash
# Due to & in folder name, use node directly:
node node_modules/vite/bin/vite.js
# Or from a path without special chars:
npm run dev
```
Dev server runs on http://localhost:3000

## Code Standards
- Functional components only
- `useStore` custom hook for localStorage-backed state
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

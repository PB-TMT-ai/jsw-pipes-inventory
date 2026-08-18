# Code Standards & UI Patterns

> Read this before adding components, editing a stage form/table, or changing `DataTable`.

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

## Stage 2 Slitting — Form + Table UI
- Manual form (mirrors Coil Inward). Fields: Date of Conversion, **HR Coil ID** (Select of mother coils with remaining slit capacity), Width, optional Length; auto fields Baby Coil Entry (letter), Baby Coil ID, Thickness/PO (inherited), Weight & Cost Price (width-proportional).
- 3-color width check vs mother width: green (≤ mother−5mm), yellow (≤ mother), red (> mother → save blocked).
- On every add/edit/delete, **all sibling baby coils of that mother are recalculated** (proportional weight/cost). **Hard delete** frees the letter; blocked if a production has consumed the baby coil.
- Table also shows **% Used** (computed `coilConsumption` / weight; rows ≥97% flagged red) and a **Consumed** status. The edit form has a **Consumed** checkbox, and the table supports **multi-select + bulk "Mark consumed / Mark active"**. % used is display-only — there is **no automatic 97% hide**; a coil leaves the Production picker only when manually marked `consumed`.

## Stage 3 Production — Form + Table UI
- Simple form (mirrors Coil Inward). Fields: Date, **SKU** (Select of published SKUs), No. of Pieces; auto fields Wt/Piece, Total Weight, Allocated (pcs), # Source Coils. **Assigned Baby Coils** starts **empty** — the operator picks coils manually (or clicks **"Use suggestion"** to copy in the read-only FIFO suggestion). `manualAlloc` (`null`/`[]` ⇒ nothing assigned; never auto-FIFO) is the single source of truth that `save()` persists; each row carries a stable `_rid` so the picker reliably shows the chosen coil.
- Badges are **informational, never block save** (`canSave = skuCode && pieces`): green "Fully allocated", amber "Within tolerance", amber/red "Shortfall", red "No eligible baby coil". Status column shows `Allocated` / `Partial` / `Unallocated`.
- Baby-coil-delete guard: a baby coil consumed by any production cannot be deleted (Slitting blocks it). `coilAllocations` store `{babyCoilId, hrCoilId, pieces, weight}` (baby + mother).

## Stage 4 Dispatch — read-only view (data from the Sales upload)
- **No uploader on this tab** — dispatch (invoice) data now arrives via the daily **"Upload Sales Excel"** on the Orders tab (the workbook's **Invoice** sheet), processed by the shared module-level `buildDispatchRecords` (extracted from the former `Dispatch.onUpload`): dynamic `import('xlsx')`, `toISODate`, case-insensitive `pick()` header matching (`mapDispatchRow`), SKU self-heal, per-line dedup, FIFO coil trace. The Dispatch tab keeps the **Dispatch Records** table + the **Invoice Reconciliation** CSV.
- Recognised Invoice-tab columns: Invoice Date, Invoice Number, Distributor Name, MM ID, MM Description (Item Name), Invoiced qty (MT), **Ship From Code** (plant — `Ship from location` is the fallback; this sheet has no `CM name`). SKUs resolve via `skuImportResolver` (`calc.js`) — **MM ID → description → canonical key**, live master before `DEFAULT_SKUS`; the catalog self-heal adds a **copy with a fresh id** and only when code, canonical identity, and description are all absent (a twin under a second id violates `unique(sku_code)` and fails the whole SKU sync). Rows group into one dispatch per invoice. The combined upload **replaces** dispatches (soft-delete prior + rebuild) so a re-upload can't double-count.
- The records table and its CSV carry a **Plant** column (`dispatchPlantLabel`, ticket #119) — the **short** display name only, read off the record's entries because plant is stored per entry, not on the record. A record whose entries disagree shows both labels, sorted; a pre-#119 record reads `Unattributed`.
## Lazy chunks after a deploy (`src/lib/chunk.js`)
- The two on-demand imports — `import('./lib/reports')` (exceljs, Reports tab) and `import('xlsx')` (Orders upload) — both go through **`loadChunk(() => import(...))`**, never a bare `await import(...)`.
- Why: Vite names those chunks by hash (`/assets/reports-BjkJ5Jvy.js`) and Vercel serves only the **current** deploy's `/assets`. A tab left open across a deploy still runs the old bundle, so the click asks for a hash that is gone and the browser throws `Failed to fetch dynamically imported module` — which used to land in the operator's face as `Report failed: …`.
- `loadChunk` reloads the tab **once** (sessionStorage guard `jsw:chunkReloadAt`, 60 s window) so the new hashes load, then the click works. A second failure inside that window, blocked storage, or a missing `sessionStorage` yields `STALE_BUILD_MESSAGE` ("refresh the page") instead of another reload — an auto-reload that cannot remember itself is a reload loop. Offline gets its own message; a real error thrown *inside* the module is rethrown untouched and still shows inline.
- `main.jsx` also installs `installChunkReloadHandler()` for Vite's `vite:preloadError` (the modulepreload 404, which fires before the import does).
- Server side: `vercel.json` excludes `/assets` from the SPA rewrite (`/((?!assets/).*)`), so a vanished chunk returns a real **404** instead of `index.html` masquerading as JavaScript.

## Sales tab — State & Region columns
- The distributor table carries **State** and **Region** next to Distributor. Both come from `salesByDistributor` (via `opts.stateRegions` → `distributorRegionResolver`); the component derives nothing itself.
- **State is read-only** — derived from the distributor's own order/invoice lines, never typed. Blank renders `—`; a distributor whose lines span several states shows the most recent one plus an amber **`+N`** marker, with the full list in the `title`. That marker is the "don't silently collapse a multi-state party" requirement.
- **Region is editable in place** via `RegionCell`, a blue (manual) `<select>` of the four `REGIONS` plus a blank option labelled `Unmapped`. It commits on `change` — unlike `EstimateCell`, a select has no half-typed state to protect, so there is no blur/Enter/Escape dance.
- Both cells wrap in `<span onClick={e => e.stopPropagation()}>` — the distributor row is itself clickable (it opens the SKU drill-down), so without that, editing would also toggle the breakdown.
- The write is keyed by **state, not distributor**: one edit re-maps every distributor in that state. The cell's tooltip and the paragraph under the table both say so — a per-row-looking control with cross-row effect has to announce it. A distributor with no state has nothing to key on, so the select is **disabled** rather than writing nowhere.
- An unmapped state reads `Unmapped` and its row stays in the `DataTable` totals — never filter or merge rows on state/region.
- The Sales CSV gains **State**, **All States** (populated only for a multi-state distributor, so the resolved single State is auditable) and **Region**.

## Stage 4 Dispatch — coil split
- Each entry's coil split is inherited from production FIFO (`dispatchCoilTrace`, carrying `{babyCoilId, hrCoilId}`), so the **persisted shape is unchanged** — `buildReconciliationRows`, the records table, and the Invoice Reconciliation CSV (one row per date × invoice × SKU) are untouched.

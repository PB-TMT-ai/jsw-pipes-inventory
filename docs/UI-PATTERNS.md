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
- Recognised Invoice-tab columns: Invoice Date, Invoice Number, Distributor Name, MM ID, MM Description (Item Name), Invoiced qty (MT). SKUs resolve via `skuImportResolver` (`calc.js`) — **MM ID → description → canonical key**, live master before `DEFAULT_SKUS`; the catalog self-heal adds a **copy with a fresh id** and only when code, canonical identity, and description are all absent (a twin under a second id violates `unique(sku_code)` and fails the whole SKU sync). Rows group into one dispatch per invoice. The combined upload **replaces** dispatches (soft-delete prior + rebuild) so a re-upload can't double-count.
- Each entry's coil split is inherited from production FIFO (`dispatchCoilTrace`, carrying `{babyCoilId, hrCoilId}`), so the **persisted shape is unchanged** — `buildReconciliationRows`, the records table, and the Invoice Reconciliation CSV (one row per date × invoice × SKU) are untouched.

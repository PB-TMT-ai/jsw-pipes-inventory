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

## Plant across the pipeline stages (ticket #120)
- **Coil Inward is the only place plant is typed.** `<Field label="Plant">` holding a `<Select>` of
  `coilInwardPlants()` — Hyderabad and NPMD (ticket #123; Lepakshi and Tapi never appear, they
  don't manufacture) — with `emptyForm` pre-selecting `DEFAULT_COIL_PLANT` (still Hyderabad), so
  the ordinary path is one click.
- **On edit it becomes a read-only `<Input>` showing `plantLabel(form.plant)`, not a disabled
  `<Select>`.** A select must fall back to *some* option, and for a coil registered before #120 and
  never backfilled that fallback printed **Hyderabad** over a row storing blank, while the table
  column beside it read **Unattributed** — one row, two answers. The label reads what is stored.
  Reach for this pattern for any set-once field whose stored value may legitimately be empty.
- **Green ● (`auto`) here means "not typed on this screen", not "arithmetic".** That is the existing
  use — Slitting's inherited Thickness/PO are `auto` too — so plant-on-edit and the inherited stages
  carry it, and the manual select at registration does not.
- **An empty pick blocks the save on a NEW coil only** (`disabled={… || (!editId && !form.plant)}`).
  The `Select` always renders a blank placeholder option, so without the guard choosing it would
  save Hyderabad; guarding edits too would leave a pre-#120 coil uneditable forever.
- **Slitting and Production never render a plant control.** Plant is inherited
  (`babyCoilPlant` / `productionPlant`), so there is nothing to type and nothing to disable. Production
  *displays* its plant as a line of text ("Consuming baby coils from Hyderabad only") because it is the
  scope its two coil pickers are drawn from (ticket #124, below) — read, never typed.
- **All three stage tables and their CSVs carry a `Plant` column** — `plantLabel(r.plant)`, the
  short display name only, `Unattributed` when blank. Same rule as the Dispatch column below.
- **The header plant selector (ticket #121) is what filters Coil Tracker to one plant** — see below;
  there is no second, per-tab filter here.

## Header plant selector (ticket #121)
- One `<select>` in `InventoryApp`'s header, built from `plantFilterOptions()` — All Plants, the four
  plants, Unattributed, in that fixed order. `useState`, not persisted — a reload always comes back
  to All Plants.
- `InventoryApp` filters once, with `filterByPlant`/`filterDispatchesByPlant` (`calc.js`), and passes
  the scoped arrays down as ordinary props. **Dashboard, Coil Tracker, Dispatch, Orders, Sales and
  Reports** receive the scoped arrays; **Coil Inward, Slitting, Production and SKU Master** keep
  receiving the raw, unfiltered store arrays — nothing in those four components changed for this
  ticket, because they never see a filtered prop.
  - **Production is the one exception, added in #124.** It still receives the **raw** arrays, and it
    receives `selectedPlant` as a plain value so it can scope them **itself**. It has to: the scope of
    a batch being edited is *that record's* plant, not the header's, so a filtered prop would hide the
    very coils the record already consumed. See the ticket #124 section below.
  - Two exceptions inside the scoped tabs, both deliberate: Orders' `replaceOrders`/
    `replaceDispatches` (the upload write path) and the `productions` it passes into
    `buildDispatchRecords` for the invoice coil trace stay on the **raw** data — an upload made while
    scoped to one plant must still resolve every other plant's coil trace. Sales' `estimates` and
    `stateRegions` stay **raw** too — Best Estimate and Region are keyed by distributor/state, not
    plant, and the acceptance criterion is that scoping the header doesn't touch them.
- The header's former hardcoded "Inventory Management — Hyderabad" now reads
  `plantFilterOptions().find(o => o.id === selectedPlant)?.name` — "All Plants", a plant's short name,
  or "Unattributed".

### Two things a plant filter must change, because scoping changes their meaning
A filter is a way of **looking** at data. Where scoping would make an existing figure or action mean
something different, the tab is told it is scoped (`plantScoped` / `selectedPlant`) and withholds it
rather than quietly returning a different answer.

- **Sales withholds the Best Estimate comparisons.** A Best Estimate carries no plant (#117 puts a
  per-plant one out of scope), so `estimates` arrives unfiltered while `orders`/`dispatches` are
  scoped. Anything DIVIDING one by the other — **% of BE**, **Gap to BE**, and the Plant BE
  achievement line — would read one plant's invoiced against the whole company's plan: the exact
  four-plants-against-one mismatch #117 exists to expose. Scoped, those read `—` with the reason in
  a `title`, and the Plant BE line says the plan is company-wide. The Best Estimate column itself
  **stays** (a company-wide plan is a correct company-wide number) and stays editable. The Sales CSV
  blanks the same two columns — an exported mixed-basis figure outlives the screen that explained it.
- **Dispatch withholds Delete.** `deleted` lives on the **record** — one whole invoice — while plant
  lives on its entries, so there is no per-entry delete. Scoped, the operator sees only some of an
  invoice's lines, so deleting would remove lines they cannot see. `onDelete` is passed `undefined`
  (which drops DataTable's whole Actions column) and an amber note says to switch to All Plants.

- **Reports stamps the scope onto the file itself.** A workbook is the one scoped output READ
  SOMEWHERE ELSE — mailed, broadcast, opened next week by someone who never saw the header. So a
  scoped one says so three times: an amber banner on the tab (stops the mistake before the click),
  `— <Plant> only` in every sheet's title via `opts.companyName` (one string, and it reaches all 7
  title rows across the 3 workbooks), and a `-<plant>` suffix on the file name via `opts.fileSuffix`
  (the half that survives a rename, a mail client, or a download list). Unscoped output is byte-for-
  byte what it always was — both halves are asserted in `reports.test.js`.

Reach for this shape for any future filter: if a write or a ratio would change meaning under it,
disable it and say why; if the output leaves the screen, stamp the scope into the artefact. Never
let the filter silently redefine the answer.

## Production's coil pickers are plant-scoped (ticket #124)
The one place the header selector does more than filter a view: it says **which plant is producing**,
and Production's two coil pickers are drawn from that plant only. The algorithm and the reasoning are
in `docs/ALGORITHMS.md`; the UI rules are:

| | |
|---|---|
| **Scope value** | `targetPlant = editingProduction?.plant \|\| selectedPlant` — the record's **own stored `plant`** when **editing**, else the header's. Editing must not follow the header, or opening another plant's batch would hide the coils it already consumed and offer to re-allocate it onto this plant's. A record storing **blank** (an unallocated batch, a legacy row) has no plant to keep and falls through to the header — a blank is nothing to preserve, not a third scope |
| **Both pickers, one rule** | `coilFifoAllocate({… plant: targetPlant})` for the suggestion, `filterByPlant(babyCoils, targetPlant)` for the manual dropdown. Same value, so the two can never disagree about which plant's strip is on offer |
| **All Plants withholds the form** | `ALL_PLANTS` is the one value that is not a plant, so `needsPlantChoice` renders an amber "choose a plant in the header selector first" **instead of** the form body — for a new batch and for an edit that fell through to it alike. The app must not guess: defaulting to Hyderabad would show an NPMD operator Hyderabad's coils and let them pick one. Selecting **Unattributed** is by contrast a real scope (coils with no plant recorded) and is never gated |
| **Shown, never typed** | A line of text under the form fields: "Consuming baby coils from **Hyderabad** only". The FIFO suggestion's header names the plant in its rule list, and the "no baby coils available" badge names it too, so an empty picker reads as *this plant has none* rather than *the app is broken* |
| **Nothing else moved** | The off-spec override, the ✓ match flag and ordering, the 0.02 MT free threshold, `manualAlloc` as the only thing `save()` persists, "Use suggestion", "Fix split", the 97/105% capacity tiers and the 105% hard stop are all exactly as they were — inside one plant |

**Phase 3 replaces this.** The header selector is a stand-in for "which plant am I", and a poor one:
it is deliberately not persisted (#121), so every reload sends an operator back to the gate. When
logins carry a plant (#117 phase 3), `targetPlant` reads from the login and the gate disappears for a
plant user. That is why the scope is one derived value in one component and not threaded through props.

## Stage 4 Dispatch — read-only view (data from the Sales upload)
- **No uploader on this tab** — dispatch (invoice) data now arrives via the daily **"Upload Sales Excel"** on the Orders tab (the workbook's **Invoice** sheet), processed by the shared module-level `buildDispatchRecords` (extracted from the former `Dispatch.onUpload`): dynamic `import('xlsx')`, `toISODate`, case-insensitive `pick()` header matching (`mapDispatchRow`), SKU self-heal, per-line dedup, FIFO coil trace. The Dispatch tab keeps the **Dispatch Records** table + the **Invoice Reconciliation** CSV.
- Recognised Invoice-tab columns: Invoice Date, Invoice Number, Distributor Name, MM ID, MM Description (Item Name), Invoiced qty (MT), **Ship From Code** (plant — `Ship from location` is the fallback; this sheet has no `CM name`). SKUs resolve via `skuImportResolver` (`calc.js`) — **MM ID → description → canonical key**, live master before `DEFAULT_SKUS`; the catalog self-heal adds a **copy with a fresh id** and only when code, canonical identity, and description are all absent (a twin under a second id violates `unique(sku_code)` and fails the whole SKU sync). Rows group into one dispatch per invoice. The combined upload **replaces** dispatches (soft-delete prior + rebuild) so a re-upload can't double-count.
- The records table carries a **Plant** column; the CSV carries the column too (`dispatchPlantLabel`, ticket #119) — the **short** display name only, read off the record's entries because plant is stored per entry, not on the record. A record whose entries disagree shows both labels, sorted; a pre-#119 record reads `Unattributed`.
- **Neither this tab nor Orders carries a per-tab Plant dropdown any more.** #118/#119 gave each one;
  the header selector (#121) replaced both. Keeping them would be exactly the "reason about which
  view is scoped" that one global control exists to prevent — and under a scoped header a local
  dropdown can only offer plants that return nothing. The Plant **column** stays on both.

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

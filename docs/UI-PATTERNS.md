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
- Manual form (mirrors Coil Inward). Fields: Date of Conversion, **HR Coil ID** (Select of HR coils with remaining slit capacity), Width, optional Length; auto fields Slit Coil Entry (letter), Slit Coil ID, Thickness/PO (inherited), Weight & Cost Price (width-proportional).
- 3-color width check vs HR coil width: green (≤ HR coil−5mm), yellow (≤ HR coil), red (> HR coil → save blocked).
- On every add/edit/delete, **all sibling slit coils of that HR coil are recalculated** (proportional weight/cost). **Hard delete** frees the letter; blocked if a production has consumed the slit coil.
- Table also shows **% Used** (computed `coilConsumption` / weight; rows ≥97% flagged red) and a **Status**: **In stock** (no live production names the coil) or **Assigned** (one does). The **Consumed** checkbox and the bulk "Mark consumed / Mark active" were **removed** (ADR-0015) — a coil that is physically gone with no production is **deleted** here instead. % used is display-only.
- Coil Tracker's slit-coil status is **two** states (ADR-0015): **In stock** and **Assigned**. Only In stock counts, at full slit weight, and the same `babyCoilIsStock` decides it here, on the Dashboard card and in the Production picker. What is left on an assigned coil is **not shown** — there is no Free column and no "not counted" footer. Since ticket #241 the Coil Tracker lists **only** In-stock coils by default (the mixed "All Slit Coils" table is gone); see "The Coil Tracker stock view" below. See `docs/adr/0015-*`.

## Stage 3 Production — Form + Table UI
- Simple form (mirrors Coil Inward). Fields: Date, **SKU** (Select of published SKUs), No. of Pieces; auto fields Wt/Piece, Total Weight, Allocated (pcs), # Source Coils. **Assigned Slit Coils** starts **empty** — the operator picks coils manually (or clicks **"Use suggestion"** to copy in the read-only FIFO suggestion). `manualAlloc` (`null`/`[]` ⇒ nothing assigned; never auto-FIFO) is the single source of truth that `save()` persists; each row carries a stable `_rid` so the picker reliably shows the chosen coil.
- Badges are **informational, never block save** (`canSave = skuCode && pieces`): green "Fully allocated", amber "Within tolerance", amber/red "Shortfall", red "No eligible slit coil". Status column shows `Allocated` / `Partial` / `Unallocated`.
- Slit-coil-delete guard: a slit coil consumed by any production cannot be deleted (Slitting blocks it). `coilAllocations` store `{babyCoilId, hrCoilId, pieces, weight}` (slit + HR coil).

## Read-only tabs (ticket #126)
- **`readOnly` withholds the writing controls; it never hides the data.** `Masters` (which passes it
  down to all three of its sections) and `Orders` each take a `readOnly` prop. The catalog, the order book, every figure and the CSV exports all
  stay — a plant user looks SKUs up constantly. What goes is the add form, `onEdit`/`onDelete`
  (passing `undefined` drops DataTable's whole Actions column, the same move Dispatch makes above)
  and the upload button.
- **Withheld means unmounted, not disabled.** Including the things a button merely triggers: the
  Orders upload's hidden `<input type="file">` is rendered inside the same `!readOnly` branch as its
  button, because leaving it mounted keeps the whole write path one console line away from a user
  the app is withholding it from.
- **Say why, once, where the control was.** Each read-only tab carries a short note — the SKU
  catalog is central because `weightPerTube` sets every plant's tonnage; one upload replaces every
  plant's orders. A missing button with no explanation reads as a bug.
- **A disabled control is the right shape when the value explains the screen.** The Masters tab's
  two newer sections (#129) render their selects and checkboxes **disabled** rather than unmounted:
  a plant user needs to read which regions their plant serves, because that is what decides the
  stock figures on their own Sales tab. Unmounting is for a write path with nothing to read.

## The Plant-wise Tracker grid (ticket #174)
- **`DataTable` is neither used nor modified.** It is a flat column table with per-column search,
  sorting and totals; this is a **parent/sub-row grid** — a fixed set of ten KPI rows under each
  plant, no sorting, no filtering — a different shape rather than a variant. Bending `DataTable` into
  it would have cost every other table on the app. `PlantTrackerTable` is its own presentational
  component and it computes **nothing**: `plantTrackerGrid` (calc.js) hands it finished figures.
- **The two label columns are sticky; the day columns scroll.** `sticky left-0` for the plant name
  (`rowSpan` across its ten rows) and `sticky left-36` for the KPI label, each pinned to a fixed
  width so the second column lands exactly where the first ends. Both carry an **opaque background**
  — a transparent sticky cell lets the day columns scroll visibly underneath it. The scroll lives on
  the grid's own `overflow-x-auto` container, so the **page body never scrolls sideways**.
- **A flow cell with no activity is a faint dash; a stock cell always prints its number.** They are
  different facts. A blank flow cell means "nothing moved that day" and lets activity stand out from
  stillness at a glance. A blank stock cell would read as "we do not know" — the same unknown-vs-empty
  confusion the `Unmapped` rule forbids elsewhere — so a stock row prints `0.0`, or its unchanged
  figure, every single day.
- **Stock rows are shaded, flow rows are not**, throughout the grid. That is the visual cue for the
  MTD column carrying two kinds of arithmetic: a flow sums the month, a stock shows its latest close.
  The footnote states the rule; `Opening Inventory` is the one stock row whose MTD cell is the
  month's **opening**, and it says so.
- **A negative Current Inventory is shown in red, not floored at zero** — dispatch recorded against
  production that was never entered is visible on the day it happened, and the column keeps
  reconciling. Same treatment as the SKU table's negative free inventory below it.
- **All blocks are always expanded, and a plant that did nothing all month still renders ten rows of
  zeros.** Its silence is a finding, not a row to hide.

## The Inventory overview (ticket #232, part 2)
- **`FlatTable` + `flatCSV`, not `DataTable`.** Each column states the *text* it prints (`text: r =>`),
  and the CSV is that text row for row — the screen and the file cannot disagree. `render` only
  decorates the same text (the status dot, the drill link); `cls` colours; `wrap` lets a long
  Description wrap so 2g fits a 1366 px screen. No sorting: these are fixed reports.
- **Drill-panel filters are per tab** (`DrillFilters`, reusing `MultiSelectFilter`; empty = all). Each
  tab names its own filters and reads its options off the plant's rows; state is kept per tab and
  cleared when the panel moves plant. Totals are rebuilt from the rows kept, and the CSV is the
  filtered screen. 2b's FG grid opens a family into its thicknesses (click the row, or "Open all
  thicknesses"); the CSV prints the rows open on screen.
- **2g reads like the Planning master**: Section | Size | Thk (mm) rows, section and size printed once
  per group (`render` blanks the repeat, `text` keeps it, so the CSV is full), a darker rule between
  sizes. No SKU code or description column; hover a size for its codes.
- **A plant row opens the drill panel in place** — no modal, no new view. Under All Plants the panel
  waits for a click; under a header plant (or a plant login) it opens on that plant, and only rows the
  header scope holds are clickable, because the panel follows the header and would otherwise open empty.
- **Two scopes on one screen, captioned.** The stock table and movement say they ignore the header
  ("This table covers all plants regardless of the header…") or, for a plant login, "This table shows
  your plant only." The drill panel and trend name the header scope. File names: comparison blocks by
  the **login** plant, the drill by the **drilled** plant, the trend by the **header** plant.
- ~~**"More" folds the old Dashboard, unchanged.**~~ Superseded by #303 below: the old sections are
  the Plant-wise Tracker and Sales & activity screen tabs; `jsw:dashMore` is no longer read.
- Every block prints **"Thresholds: proposed"** until the pack's thresholds are signed off.

## Plant across the pipeline stages (ticket #120)
- **Coil Inward is the only place plant is typed** — and since ticket #126, only for an **admin**.
  `<Field label="Plant">` holding a `<Select>` of `coilInwardPlants()` — all four plants (Hyderabad
  and NPMD in ticket #123, Lepakshi and Tapi in #156) — with `emptyForm` pre-selecting
  `DEFAULT_COIL_PLANT` (still Hyderabad, still first on the list), so the ordinary path is one
  click. The scope-driven pre-selection reads `coilInwardPlants()`, never a list of plant names, so
  the only header scope left with no honest default is **Unattributed**, which blanks the field.
- **A plant user types nothing: the field is pinned.** `CoilInward` takes `operatingPlant`, non-null
  only for a plant user, and renders the same read-only `<Input>` the edit case uses. They are
  standing in one plant, so where an arriving coil sits is not a question to put to them. It changes
  only what is OFFERED — `emptyForm.plant` is that plant and the set-once rule below is untouched.
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
  *displays* its plant as a line of text ("Consuming slit coils from Hyderabad only") because it is the
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
  Reports** receive the scoped arrays. **Coil Inward, Slitting and Production follow the same
  scope but reach it the other way** — they keep receiving the raw, unfiltered store arrays and
  filter their own display. **Masters** is unscoped outright: a SKU catalog, a plant's service area
  and a distributor's region are company-wide masters, not rows that sit at a plant.
  - **The stages scope what they SHOW, and nothing else.** Each takes a `viewPlant` prop — which is
    simply `selectedPlant`, passed straight through, so one control means one thing on every tab —
    and filters only its own table, export and pickers. It is the `ALL_PLANTS` **sentinel**, never a
    nullable id: `filterByPlant` decides, `ALL_PLANTS` is its pass-through, and `''` (Unattributed)
    is a real scope that a truthiness test would silently widen back to every plant.
    - Originally the stages were exempt from the selector and `viewPlant` was `null` for an admin.
      That was wrong: picking NPMD scoped six tabs and left the three screens where a coil's plant
      is actually *recorded* listing every plant, so the header contradicted the table beneath it.
    - **Never filter the array you hand a stage** — the first cut of #126 did, and it was wrong
      twice over:
    - **Writes.** Slitting builds its next array from the `babyCoils` prop and calls
      `setBabyCoils(updated)` outright, not `setBabyCoils(prev => …)`. A filtered prop makes `next` a
      strict subset of `prev`, and `syncToSupabase` reads every id in prev-but-not-next as a
      deletion — on `baby_coils`, a **hard** one. One plant user saving one slit coil would have
      permanently deleted every other plant's. `e2e/roles.spec.js` now asserts no DELETE is ever
      issued on that flow.
    - **Guards.** "A slit coil consumed by **any** production cannot be deleted", the duplicate
      `hrCoilId` check and `nextCoilNumber` are only true against the WHOLE register. The sharpest
      case is a legacy blank-plant row: `genHRCoilId` gives it an `HYD-` id, so it is exactly what a
      new Hyderabad coil collides with — and exactly what a scoped array hides.
    - So: **display scopes, state and guards do not.** A prop that reaches a setter or a guard stays
      whole. `Unattributed` rows therefore still appear to an admin, which is who backfills them.
  - **Production was the first to work this way, in #124** — and all three stages do now. It
    receives the **raw** arrays plus TWO scopes, which answer different questions: `viewPlant`
    scopes the Production **Records table** (what this user is looking at), while `operatingPlant`
    scopes the allocation **pickers** (which plant's slit coils this batch may consume). The second
    is the stricter rule and outranks the first — the scope of a batch being edited is *that
    record's* plant, not the header's, so a filtered prop would hide the very coils the record
    already consumed. See the ticket #124 section below.
  - **A production saved with NO allocations** has no strip to inherit a plant from, so it takes the
    plant it was made at (`targetPlant`) rather than saving as Unattributed and vanishing from the
    table it was just added to. Zero allocations only, and never under All Plants — one allocation
    and the strip decides, as always.
  - **A scoped export names its scope in the file name** — `production-2026-08-21-npmd.csv`, via
    `plantFileSuffix`, the CSV counterpart of the Reports workbooks' `opts.fileSuffix`. Bare under
    All Plants, so the unscoped file name never moves. Each stage export also carries a Plant
    column, so the rows say it too.
  - **The upload path never sees the scoped data.** Everything the Orders tab feeds into an upload
    stays on the **raw** rows, because a filter on the SCREEN must never become an answer about what
    to STORE (`LEARNINGS.md`, #193). That is `replaceOrders`/`replaceDispatches` (the write path)
    plus three read inputs to `buildInvoiceDispatches`, each passed under its own name so the scoped
    prop of the same name cannot be reached for by mistake:

    | Prop | Raw because |
    |---|---|
    | `productions` | the invoice coil trace must resolve every plant's coils |
    | `allDispatches` | the FIFO trace and the "left alone" count must see every plant's records (#192) |
    | `allOrders` | attribution reads the order book — scoped, every OTHER plant's lines would be written with no distributor, no state and no order link (#193) |

    Sales' `estimates` and `stateRegions` stay **raw** too — Best Estimate and Region are keyed by
    distributor/state, not plant, and the acceptance criterion is that scoping the header doesn't
    touch them.
- The header's former hardcoded "Inventory Management — Hyderabad" now reads
  `plantFilterOptions().find(o => o.id === selectedPlant)?.name` — "All Plants", a plant's short name,
  or "Unattributed". Since #126 the **fallback** matters too: an admin's value always comes from the
  options, but a plant user's comes from their credential row and may match no plant master row, and
  falling back to "All Plants" there would tell someone scoped to nothing that they see everything.
  An unmatched pinned id shows **the id itself** — wrong-looking, which it is, and it names the value
  to correct.

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
  (which drops DataTable's whole Actions column) and an amber note explains why. Since #126 that
  note branches on `canWiden`: an admin is told to *switch to All Plants*, a plant user — who has no
  selector — is told only that deleting is done from that view. **Copy that tells a user to operate
  a control they do not have is a bug**; check any scope message against both roles.

- **Reports stamps the scope onto the file itself.** A workbook is the one scoped output READ
  SOMEWHERE ELSE — mailed, broadcast, opened next week by someone who never saw the header. So a
  scoped one says so three times: an amber banner on the tab (stops the mistake before the click),
  `— <Plant> only` in every sheet's title via `opts.companyName` (one string, and it reaches all 7
  title rows across the 3 workbooks), and a `-<plant>` suffix on the file name via `opts.fileSuffix`
  (the half that survives a rename, a mail client, or a download list). Unscoped output is byte-for-
  byte what it always was — both halves are asserted in `reports.test.js`.
- **Except the Inventory Snapshot, which is never scoped** (#214, user decision on #213). Reports
  takes four extra props for it — `allProductions`, `allDispatches`, `allCoils`, `allBabyCoils` —
  wired to the Plant-wise Tracker's `tracker*` arrays, and the snapshot reads only those. A
  scoped header adds one sentence to the amber banner ("The Inventory Snapshot still covers all
  plants"). Asserted in `e2e/inventory-snapshot.spec.js`: the file downloaded under NPMD is
  byte-for-byte the file downloaded under All Plants. The `.png` button reads the same arrays (it rasterises the
  same HTML), and the same spec checks it is a 1200 px PNG under either header.

Reach for this shape for any future filter: if a write or a ratio would change meaning under it,
disable it and say why; if the output leaves the screen, stamp the scope into the artefact. Never
let the filter silently redefine the answer.

## Production's coil pickers are plant-scoped (ticket #124)
The one place the header selector does more than filter a view: it says **which plant is producing**,
and Production's two coil pickers are drawn from that plant only. The algorithm and the reasoning are
in `docs/ALGORITHMS.md`; the UI rules are:

| | |
|---|---|
| **Scope value** | `targetPlant = editingProduction?.plant \|\| operatingPlant` — the record's **own stored `plant`** when **editing**, else the **operating plant** (CONTEXT.md: the plant you work *as*, passed in under that name rather than `selectedPlant`, because inside Production it answers "which plant am I working as" and not "which plant am I looking at"). Editing must not follow the header, or opening another plant's batch would hide the coils it already consumed and offer to re-allocate it onto this plant's. A record storing **blank** (an unallocated batch, a legacy row) has no plant to keep and falls through — a blank is nothing to preserve, not a third scope |
| **Both pickers, one list** | `babyCoilsAtPlant = filterByPlant(babyCoils, targetPlant)`, stated once and read by the FIFO adapter and the manual dropdown alike. The suggestion additionally passes `plant: targetPlant` into `coilFifoAllocate` — idempotent over an already-scoped list, and deliberately kept: the allocator's guarantee has to hold for **every** caller, not only one that pre-filtered |
| **All Plants withholds the form** | `ALL_PLANTS` is the one value that is not a plant, so `needsPlantChoice` renders an amber "choose a plant in the header selector first" **instead of** the form body — for a new batch and for an edit that fell through to it alike. The app must not guess: defaulting to Hyderabad would show an NPMD operator Hyderabad's coils and let them pick one. Selecting **Unattributed** is by contrast a real scope (coils with no plant recorded) and is never gated |
| **Shown, never typed** | A line of text under the form fields: "Consuming slit coils from **Hyderabad** only". The FIFO suggestion's header names the plant in its rule list, and the "no slit coils available" badge names it too, so an empty picker reads as *this plant has none* rather than *the app is broken* |
| **A second hard stop on save** | Scoping the pickers decides what can be **offered**; the rows outlive a change of plant, so what can be **saved** is checked separately — `crossPlantAllocationRows` (`calc.js`), a non-empty result blocking save with the offending coils named. Sits beside the 105% capacity stop and reads the same way: a red badge saying what to do, never a silent drop. See the note below on why this is not redundant |
| **Nothing else moved** | The off-spec override, the ✓ match flag and ordering, the 0.02 MT free threshold, `manualAlloc` as the only thing `save()` persists, "Use suggestion", "Fix split", the 97/105% capacity tiers and the 105% hard stop are all exactly as they were — inside one plant |

**Why the save guard is not redundant with the scoped pickers.** They constrain two different pieces
of state. The pickers constrain the *list* — recomputed from `targetPlant` on every render, so they
are always right. The rows are `manualAlloc`, which persists across a plant change and is not
recomputed from anything. Pick Hyderabad coils → switch the header to NPMD → add a row: both pickers
were correctly scoped at every moment, and the allocation still spans two plants. The general shape:
**when a filter guards a derived view and a separate piece of state can outlive the filter, the
invariant has to be re-asserted where that state is consumed**, not only where the view is built.

**Phase 3 replaces this.** The header selector is a stand-in for "which plant am I", and a poor one:
it is deliberately not persisted (#121), so every reload sends an operator back to the gate. When
logins carry a plant (#117 phase 3), `operatingPlant` is supplied by the login and the gate disappears
for a plant user — the prop name already says that, so nothing inside Production changes. That is why
the scope is one derived value in one component and not threaded through props.

## Stage 4 Dispatch — read-only view (data from the invoice upload)
- **No uploader on this tab** — dispatch (invoice) data arrives via the daily **"Upload Invoice Excel"** on the Orders tab, reading the **Zoho invoice register** (ticket #192; the ERP workbook's own `Invoice` sheet is no longer read). It is processed by `buildInvoiceDispatches` in **`src/lib/calc.js`** (ticket #190 put every import rule where a test can reach it; App.jsx reads the file, calls in, and renders the banner): case-insensitive `pick()` header matching (`mapInvoiceRow`), the warehouse filter that is also the plant resolution, the `Void` filter, SKU self-heal, per-line dedup, FIFO coil trace, and the **rebuild window** the caller hands to `replaceAll`. The dynamic `import('xlsx')` and the file reading stay in App.jsx. The Dispatch tab keeps the **Dispatch Records** table + the **Invoice Reconciliation** CSV.
- **The Scoreboard (ticket #232) sits above the records** — `DispatchOverview`, fed by
  `dispatchOverview` (calc.js). Status is a coloured dot; every block prints "Thresholds: proposed"
  until sign-off. Two scopes on one screen: the plant table ignores the header selector (admin) and
  says so in its caption, the rest follow it and name the scope in their titles. Each block has its own
  CSV of what is on screen; the plant table's file is suffixed by the **login** plant, the others by
  the header plant (`plantFileSuffix`). In the distributor `DataTable` the status dot rides inside the
  Distributor cell — as its own column it pushed "Oldest" off a 1280 px screen. `DataTable`'s `total`
  is a **formatter function** (`v => fmtT(v)`), not a boolean; `true` crashes the table.
- Recognised **Zoho register** columns: Invoice Date, Invoice Number, **Invoice Status**, Customer Name, **Warehouse Name**, Item Name, Quantity (MT unless a `Usage unit` column says NOS/PCS), PurchaseOrder. Plant comes from **`Warehouse Name`** — there is no `Ship From Code` on this file, and because the register is company-wide the name is the **filter** too: a row it cannot place is dropped and counted by name (`docs/adr/0013`). `Invoice Status` = `Void` is dropped and counted; the **e-Invoice Status column is never read**. Grade is lifted out of the item name (`gradeFromDescription`). SKUs resolve via `skuImportResolver` (`calc.js`) — **description → canonical key** (the register carries no MM ID), live master before `DEFAULT_SKUS`; the catalog self-heal adds a **copy with a fresh id** and only when code, canonical identity, and description are all absent (a twin under a second id violates `unique(sku_code)` and fails the whole SKU sync). Rows group into one dispatch per invoice. Each upload **rebuilds only its own date window** (`min`…`max` invoice date over the kept rows, handed to `replaceAll`), so a re-upload can't double-count and an earlier month is never deleted. A file that qualifies nothing clears nothing.
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

## Masters tab — three masters, one tab (ticket #129)
- The **SKU Master** tab is now **Masters** and carries three sections: **SKU Master**, **Plant
  Master**, **Distributor Master**. The tab **key stays `skuMaster`** — that is what `accessFor`
  grants and what `PLANT_READ_ONLY_TABS` names, so renaming it would silently move a permission.
  Only the label changed.
- They sit together because they are the same kind of thing: the few facts the ERP does not ship and
  a person therefore has to state. Order is by how often they are used — a SKU daily, a service area
  a few times a year, an override almost never.
- **Plant Master** shows all four plants with everything ERP-owned rendered and locked (Ship From
  Code, coil prefix, `manufactures`). The one editable cell is **Serves** — a checkbox per region
  (`PlantServesCell`), not a text field: the four regions are fixed, and a typed "Wesr" would
  silently mean *serves nowhere*. Commits on every click.
- A region **no plant serves** is called out under the table in amber, with what it means (those
  distributors are shown no stock and their full pending as Short by). Silence there would read as
  a bug on the distributor's screen rather than as a fact about the plant.
- **Distributor Master** lists every distributor from the same `salesByDistributor` the Sales tab
  reads — so the region shown here is the region the stock pool is actually built from. Columns:
  Distributor, State, **Region in use** (highlighted when it came from an override), **Override**.
- The override select's blank option reads **`(use state)`**, never `Unmapped`, and the inherited
  answer is printed beside it (`→ West`) so a blank cell still says what it resolves to. Clearing
  writes `region: ''` rather than deleting the row — a stored blank and no row must mean the same
  thing. `Show only overridden (N)` filters the list, because the exceptions are the point.
- `readOnly` (a plant login) withholds the writes on all three sections. The two new ones are
  **disabled, not hidden**: a plant user reads the service areas because they explain what their own
  screens show.

## Sales drill-down — whose stock it is (ticket #129)
- The stock columns are scoped to the open distributor's **service area**, so the tooltips and the
  caption name it (`Hyderabad + Lepakshi (South) stock for this SKU…`) via one `areaLabel` helper.
  "The plant's stock" is the sentence that let the workbook offer Hyderabad tonnage to West.
- `null` renders as an em dash and **never** as `0`. Two amber sentences sit under the table and are
  not decoration: one for a region no plant serves ("those dashes are the real position, not a
  loading error — they fill in the day a plant that serves it produces") and one for `Unmapped`
  ("we cannot tell which plants serve it… map the state in the Region column above"). A screen of
  dashes with no explanation reads as an outage.

## Stage 4 Dispatch — coil split
- Each entry's coil split is inherited from production FIFO (`dispatchCoilTrace`, carrying `{babyCoilId, hrCoilId}`), so the **persisted shape is unchanged** — `buildReconciliationRows`, the records table, and the Invoice Reconciliation CSV (one row per date × invoice × SKU) are untouched.

## The Coil Tracker as a Plant Register (design chosen 13-Nov-2026)
The tab is a **raw-material coil register**: light, printed-form look (boxed fields, small-caps labels,
mono figures), chosen from four mocked directions on live data. It replaced the stock-by-plant table
with toggles (#263, #265), the plant × age matrix (#242) and the two separate stock tables (#241).

```
Title block: Coil Tracker · Scope (header plant) · As of (viewer's date) · Source
Six fields:  Total stock · HR coil, unslit · Slit coil · Act, 61+ days · Avg age · Days of cover
[ Stock now ] [ Movement by month ] [ Coil ledger ]      ← one view at a time, Stock now first
Coil record (the trace) of the coil last clicked         ← under whichever view is on
```

- **The component sums nothing.** `coilTrackerView({ …, cell: null, selectedCoilId })` gives
  `stockByPlant`, `stockRows` and `trace`, all finished; `coilThicknessGrid` gives the month view and
  `coilInventoryRow` each ledger row. The six fields read `stockByPlant.all` (its `bands.Act`, `cover`,
  `produced30d`); no percentage or rate is worked out on screen.
- **Scope** is the header plant selector, passed in as `scopeLabel` (`ALL_PLANTS` reads "All plants" —
  the selector's "all" is that sentinel, not `null`). The arrays are already plant-scoped by the app.
- **Stock now — Stock by plant and thickness** (`CoilRegisterTable`). One row per plant, each followed by
  its standard-thickness rows, **always open** (no toggle, no Expand all); then All plants and its
  company-wide thickness rows. Columns: HR T · HR # · Slit T · Slit # · Total T · **Act T · Watch T ·
  Clear T** · Avg age d · Produced 30d T · Cover d. A **No date T** column appears only when some coil has
  no date, so Total always ties to the band columns. Band columns are coloured red / amber / green;
  Cover is **red under 7 days** (`cover.low`, `LOW_COVER_DAYS`), red at 0, amber for No use. Empty
  cells read "–". **⬇ CSV** exports `stockByPlantCsv` (band columns included). Rules:
  `docs/ALGORITHMS.md` "Days of cover", "Thickness buckets" and "Age bands per row".
- **Stock now — Coils in stock** — one `DataTable` over `stockRows`: HR coils (unslit) and slit coils
  together, oldest first (undated on top), each with **No.** = its place in that order, kept when the
  table is re-sorted. Columns No. · Band · Age (d) · Coil ID · Type (HR coil / Slit coil) · HR Coil ID ·
  Plant · Grade · Thk × Width · Weight (T) · Dated (inward for HR, slitting for slit) · PO; TOTAL weight
  row; Type / Band / Plant / Thickness (standard) dropdowns; search; **⬇ CSV** of the on-screen rows as
  each column's `text` (`coils-in-stock-<date>.csv`). Replaces the two CSVs `hr-coils-unslit-…` and
  `slit-coils-in-stock-…`.
- **Movement by month** — the thickness × month grid (`CoilThicknessTable`) and its CSV, unchanged; it
  used to be a collapsed section.
- **Coil ledger** — the old Inventory Summary / All coils ledger, unchanged: inward-date period filter,
  Grade / Thickness / Width / Status dropdowns, Stock CSV. It used to be a collapsed section.
- **Coil record.** Clicking any coil in any view opens its HR coil's record under the view and scrolls to
  it; the HR coil is highlighted in both tables. **Clear selection** closes it. Contents below.
- **`today` is passed in, on the viewer's calendar** (`localToday()` in App.jsx), not the app's UTC
  `today()` — that would read yesterday in India until 05:30 and age every coil a day short.
- **Band chip = colour + glyph** (■ Act red, ▲ Watch amber, ● Clear green, ? No date grey), so it reads
  without colour. An undated (or future-dated) coil is shown, on top, as "No date" — never dropped,
  never 0 days (ADR-0016). Its Age sorts as `Infinity`, with the oldest.
- **Still in calc, unused by this tab:** `coilTrackerView`'s `matrix`, `show`, `cellLabel` and the
  `cell` filter (the tab passes `cell: null`). Kept so this change touches no figure; removable later.

## The Coil Tracker trace (ticket #243) — the "Coil record"
Shown as the Plant Register's **Coil record**: a bordered block with Plant · Grade · Thk × width · PO ·
Invoice wt · Actual wt fields, then the four stages and the three tables below.
`coilTrackerView({ …, dispatches, selectedCoilId })` returns `trace` (null until a coil is picked, or if the
coil is not in the plant-scoped input): `{ header, stages, babies, runs, lines }`, all finished.
- **Header:** HR coil ID · plant · grade · thk × width · PO · invoice weight vs actual weight.
- **Four stage boxes, Inward → Slit → Produced → Dispatched**, each a tonnage and a count line:
  Inward = actual weight · Slit = Σ slit coil weight, slit coil count · Produced = Σ this coil's allocation
  weight, run count, pieces · Dispatched = Σ this coil's invoice-allocation weight, **distinct** invoice
  count, pieces. Each box is the sum of the table beneath it.
- **Three tables, each oldest first:** Slit coils (ID · slitting date · size · weight · In stock / Assigned ·
  run(s) used in) · Production runs (production no · date · slit coil · SKU · pieces · T from this coil) ·
  Invoice lines (invoice · date · customer · SKU · slit coil · pieces · T from this coil).
- **Every weight is this coil's share**, read from the `coilAllocations` entries that name this HR coil —
  never a production's `totalWeight` — so a run that drew on two HR coils is not counted in full against
  each. A dispatch line with no allocations falls back to its legacy `traceHrCoilId`, as `coilInventoryRow` does.
- **A "run" is one slit coil going into one production** (ADR-0015) — one row of the runs table. A
  production that ate three of this HR coil's strips is three runs, so the box count equals the row count.
  "Production no" is `productionPoNo`; where it is blank the run is named by its date.
- **Weights are rounded to the 3 decimals on screen before they are summed**, so a box always equals the
  figures printed in its table (22.778, not the raw 22.780).
- **Gone:** the Weight Flow bar chart and the "% Used" / "Used (T)" columns. No yield, leftover or
  free tonnage is shown anywhere (ADR-0015). The trace reads no stock rule of its own: the In stock /
  Assigned label is `babyCoilIsStock`.
- **Date out of order (ticket #244).** Every slit coil, run and line row carries a boolean `outOfOrder`, set in
  `coilTrackerView`, true when the row is dated **strictly before** the stage it came from:

  | Row | Flagged when its date is before… |
  |---|---|
  | Slit coil (slitting date) | the HR coil's inward date |
  | Production run | its slit coil's slitting date |
  | Invoice line | the **earliest** run of its slit coil · if that slit coil has no run, its slitting date · if the line names no slit coil (legacy `traceHrCoilId`), the HR coil's inward date |

  Same day is in order; a missing date on either side is never flagged. The UI (`TraceDate`) puts an
  **amber** "Date out of order" pill beside the row's date; an unflagged row renders the bare date as
  before. **Amber, not red, by decision:** on live data ~1,231 of 5,234 invoice allocation lines are
  dated before the production they are traced to, because the automatic invoice trace ignores dates —
  the operator cannot correct those, so the flag informs rather than alarms. Live check: HYD-0826-287
  flags exactly one row, invoice JODLTE0726/01066 (29 Jul) on slit coil -B, whose first run is 21 Aug.

## Production Planning: design rules (user, 13-Nov-2026)
Applies to all four planning screens: Planning master, Monthly campaign (Plan and Coil tabs), Week
plan, Monitoring. The look stays the app's own (Inter, Tailwind slate, indigo accent, design A #302:
12 px text, 28 px rows, thin rules, no fills). No DESIGN.md, by decision on #333. The rules that
#334–#337 set for the Monthly campaign sheet now hold on every planning screen. Preview with the #333
mock-up's South figures: https://claude.ai/artifact/GvQW9PYaDxuH6QMpFw2sra (private). Where a section
below disagrees, this one wins; it records layout only, no figure or rule moves.

**1 · Words.** No short form in any header or label: *Thickness (mm)* not Thk, *Section* not Sec,
*Run order* not #, *Planned (T)* not T, *Made %* not %, *Made to order* not MTO, *Hyderabad* /
*Lepakshi* not Hyd / Lep, *Baseline (T)* not Base or B. Tonnes are always **T**, never MT
(*Buffer (T)*, *3,020 T*). A planning-master row is a **line** on screen, as #334–#340 call it
(the e2e row and input names, `South 50x50 1.6`, do not change).

**2 · Numbers.**
- Measured tonnes: one decimal, a comma from 1,000 (`1,040.0`, `en-IN` grouping), right-aligned,
  `tabular-nums`.
- Typed figures (Indent, Planned, Buffer) and their subtotals: whole numbers (`60`, `580`).
- `–` means nothing is there; `0.0` is a real zero.
- Dates in words: `by Mon 16 Nov`, `1–8 Nov`, `needed now`.

**3 · Colour: one meaning each, the same fact the same colour on every screen.**

| Colour | Means | Examples |
|---|---|---|
| Red | Act today | `needed now` and its shortfall, Behind, a short closed week's `plan / made`, *No plant can make*, a split that does not add up, the Coil tab's `4 short` |
| Amber | Look later, or changed | `by Mon 16 Nov` and its shortfall, `W1 not made`, ◆ moved, `entered to 5 Nov` |
| Grey | Suggestion or quiet | the Planned suggestion, `0.7 short`, `not due yet`, a closed week's figure on the Week plan |
| Indigo | Click it, or tonnes added | links, the open step and tab, `+10` in Extra needed |
| Green | Done | `covered`, `made`, `final` |

- **Coil shortfall (risk 1, user 13-Nov):** red only when it bites a closed or running week
  (*needed now*); a later week's shortfall and its *by Mon …* are amber. A size line or plant ×
  thickness heading is red if any of its lines is needed now, else amber. This narrows #336's "in red".
- The step bar's master state (`41 no plant can make`) is red, as *No plant can make* is in the
  Check column. A line on Monitoring is still never red (#287).

**4 · Table shape.**
- Full width, one border (`.scroll`-style container), never a box inside a box. The Planning master's
  table drops its second panel; the Week plan and Monitoring tables run full width.
- A grouped heading row (10 px, caps, muted, centred over a rule) above the column names when a table
  has three or more groups: *Sold (T) · This month (T) · Coil (T)*, *Can be made at*.
- ALL CAPS only for group headings and section lines (`SHS`). Column names are normal case, 11 px
  semibold; a week's dates sit under its name in grey (`W1` / `1–8 Nov · closed`).
- Size (or Plant, or Line) pinned left; on a phone the table scrolls, the page never does.
- Order: section line → size line with subtotals → thickness lines → region total.

**Week plan overview coil (risk 2, user 13-Nov).** Once the Coil tab (#337) exists, the overview's
coil cell is one figure, *Coil shortfall (T)*, coloured as above, with a link `2 thicknesses on the
Coil tab` that opens the campaign's Coil tab. The per-band list in the cell and the
`Hyderabad coil by thickness` box above the plant table go; the Coil tab is where bands are read.
**Supersedes** in *Words on the planning and coil screens* below: the overview's one-band-per-line
*Coil short (T)*, the `Hyderabad coil by thickness` table, and the step bar's amber master gaps.
`e2e/week-plan.spec.js` asserts on those, so the ticket that builds this updates the spec with it.

**Not done here:** no code changed. The app header still breaks at phone width (`JSW One Pipes & Tubes`
wraps over the tab bar); that is app-wide, outside this tab.

## Planning master — edit, add, retire (ticket #279)
- **Row edit mode, not always-on inputs.** *Edit* turns one row into a Type select, a Buffer input
  (disabled for MTO) and one tick box per plant **of the row's region** — so the boxes never offer
  another region's plant. *Save* / *Cancel*. 236 rows of live inputs would invite slips.
- **Add** opens a strip above the table for the region on screen: Size, Thk, Type, Buffer, ticks.
  A refusal (unreadable size, a row the master already has in any spelling, bad Buffer) shows in red
  with `role="alert"` and writes nothing.
- **Retire** is one click and reversible: the row leaves the table, and *Show retired (N)* lists it
  with *Restore*. Nothing on this screen deletes.
- **Check column.** The amber note is plain text (`role="note"`), never a control, so clicking it
  ticks nothing. *No plant can make* shows in red — a real answer, not an error.
- **One id per click.** `write()` makes the uuid once and passes it in, because the store's updater
  can run twice (React StrictMode, development) and both runs must send the same row.
- **No upload control** on the tab, by decision (#249). `e2e/planning-master.spec.js` checks it.

## Monthly campaign sheet — layout A2 (ticket #280)
- **Light and dense, as chosen on #254**: 12 px text, 22 px rows, the table only as wide as its content
  (`w-max`), no panels. Dark-mode classes are kept so the app's own toggle still works.
- **Size once per group**, `·` on the rows below; the Size cell is `sticky left-0` with its own
  background, so it stays put when the sheet scrolls sideways on a phone.
- **Each row is named** `South 50x50 1.6` (`aria-label` on the `<tr>`), because the Size cell of all but
  the first row in a group reads `·`. `e2e/campaign.spec.js` finds rows by that name.
- **Hover, not columns**, for the per-plant split: the cell's `title` is built in calc.js
  (`planningSplitLabel`), every region plant named, a zero too.
- **Do not write "hidden" on a screen.** `e2e/roles.spec.js` fails any tab whose text has the word (it
  is on the privacy-claim list). The footer says "quiet rows not shown".

## Dashboard — overview + screen tabs, design A (ticket #303)
Layout only over #232; no figure, rule, plant-scoping or CSV changed. Same visual rules as #302.
- **One header** for every tab: title + "as of" line; **Region** switch (Overview only, not for a plant
  login); **Period** From–To (Overview, Plant drill, Stock movement — the tabs it scopes); **Export ▾**.
- **Screen tabs** (`group "Dashboard screen"`, `aria-pressed` buttons, the #302 underline tabs):
  Overview · Plant drill · Stock movement · Plant-wise Tracker · Sales & activity. The open tab is a UI
  preference (`jsw:dashScreen`). **Every screen stays mounted and is only `hidden`**, so the Export
  menu reads each screen's own state (drill tab + filters, SKU table sort/filter, tracker month) from
  any tab. Do not switch to conditional rendering: the SKU CSV reads the DataTable's `exportRef`.
- **Export menu** (`ExportMenu`, `role="menu"`): the seven old CSV buttons, each calling the function its old
  button called — Stock by plant, Month-end stock, Stock movement, Plant drill (the open drill tab;
  disabled until a plant is picked), Plant-wise Tracker, SKU-wise inventory, Coil stock report.
  File names keep the 2b–2g codes. Byte-identity with staging was checked for admin and a plant login.
- **Overview**: `KpiStrip` (coil · current inventory · coil > 30 d · FG > 75 d — the visible total row's
  own text); the stock table with `FlatTable` `groups` (Coil (MT) / Current inventory (MT)) and `rule`
  columns, status as **Act / Watch / OK** (`INVENTORY_STATUS_WORD`) with a red dot on Act only; the
  scope is a visible line under the title. **Screen columns ≠ CSV columns**: the screen regroups
  `stockCols`' own `text`, the CSV keeps the old order and the words red/amber/green.
- **Region switch** = plants whose `serves` names the region (`inventoryRegionStock`); the total is
  `inventoryStockTotal` on those rows, named "South total". Unattributed shows under All plants only.
  The month-end table does **not** follow it (it follows the header plant, as before) and says so.
- **Month-end stock** is a two-row table (Coil / Current inventory × six months); the trend CSV is
  unchanged. **Needs a look** (`inventoryNeedsLook`) lists the stock table's flagged tonnage
  (≥ 0.05 T), Act plants first, each linking to the drill tab; a plant the header does not hold is
  listed without a link.
- **Plant drill**: a plant segmented switch (under All Plants) and the drill tabs as a segmented
  `tablist`, renamed Coil & FG grid · Old coil · Slit waiting · FG ageing · SKU cover. Per-tab help
  in a `<details>`. A stock-table row click opens this tab.
- **No charts anywhere**: the production & dispatch trend is a two-row table of the same buckets.
  `recharts` is no longer imported by `App.jsx`. Sales & activity's cards are `KpiStrip`s with the
  same labels and values; alerts read Error / Warning as words; no tints, no shadows.
- Left as before (moved unchanged, an open question for the user): the drill grids' red/amber cell
  tints (`CELL_FLAG`), 2g's amber stock-out days, the movement's rose *Dispatched w/o production*, the
  SKU-wise table's red over-committed rows, and the Tracker grid.

## Monthly campaign — clean sheet, design A (ticket #302)
Layout only over A2; no figure, rule or save path changed. **Supersedes, in the A2 notes below:**
the `w-max` table and size-once-with-`·` (#280) → a full-width table with size group rows and an
empty Size cell on thickness rows; red / amber row tints (#281, #282) → `data-red` / `data-moved` only,
no fill; *Choose…* and the red `115 of 120` (#282) → *Choose plant* and a red dot with
`115 of 120 — does not add up`; the amber select border (#282) → dashed indigo; the green Finalised
status (#283) → a neutral bordered one; the run-on summary line and the footer paragraphs.
- **Screen tabs** (`group "Planning screen"`) are underline tabs, still `aria-pressed` buttons (the
  week-plan spec clicks them so). The campaign draws them itself (`tabs` prop) so Region and Plan
  month sit on the same line; *fix in master* switches to the Planning master (`onOpenMaster`).
- **Headline** `November 2026 · South`, Draft / Finalised, Finalise on the right with *Not yet: …*
  beside it. Headline + strip are the `Campaign summary` section.
- **Strip**: Planned production · Assigned to a plant (per-plant split as text) · Needs a plant
  (link sets the chip) · No plant can make (red dot). Plain numbers, thin rules, no fills.
- **Chips** (`group "Row filter"`): All rows · Needs a plant · No plant can make · Has stock, counts
  from `planningCampaignShown(…).counts` — each the rows that chip would show under the same search and
  quiet toggle. A chip other than All shows every row it names, quiet or not, so its count
  is what it shows; *Show quiet rows* only applies to All. Search narrows any chip.
- **Size groups**: `region.groups` (calc.js) — one per section × size with Open / last / three /
  Planned subtotals and *N to assign* or *No plant can make*. The group row is named `South 50x50`;
  its ▾ button collapses it. The jump to the first blocker clears search, chip and collapse.
- **Rows 28 px**, no tint. Inputs `bare`: no border until hover / focus. Planned grey = suggestion
  (placeholder), bold black = typed. A moved row shows `◆ moved use N` (not colour alone).
- **Plant**: plain name when assigned; a two-plant select is borderless until hover, dashed indigo
  *Choose plant* when it needs one; *No plant can make* behind a red dot (`aria-hidden`, so the
  amber unticked-plant dot stays the row's only `img`).
- **Help**: the rules, Outside the plan, Open sentence and Short history sit in one `<details>`
  *How this screen works*; the band note, provisional note, moved and quiet lines stay under the table.

## Indent and Planned on the A2 sheet (ticket #281)
- **`PlanningTonnesCell`**: keystrokes stay local, commit on blur / Enter, Escape reverts — so no
  per-character write reaches Supabase. Escape sets a **ref** before blurring: the blur handler runs
  synchronously with the old `draft` in its closure, so a `setDraft` there is too late to stop the write.
- **Faint suggestion = the placeholder** of the Planned box; the box's value is only ever the typed
  figure. Hover (`title`) gives the working, built in calc.js (`planningSuggestedLabel`).
- **Amber row**: `bg-amber-50` on the `<tr>` and on the pinned Size cell (which has its own
  background), `data-moved="true"` for the specs, and a `use N` button beside the box.
- A refused figure (negative, not a number) puts the box back and shows one red line above the sheet.
- Inputs are named `Indent South 50x50 1.6` / `Planned South 50x50 1.6`; `e2e/campaign.spec.js` finds them so.

## Plant on the A2 sheet (ticket #282)
- **`PlanningPlantCell`** lays out the view's `assign`; it computes nothing. One-plant rows: the plant's
  name, no control. No-plant rows: red *No plant can make*. Two-plant rows: one `<select>` named
  `Plant South 50x50 1.6` — *Choose…* · the ticked plants · *Split…*. Picking a plant ends a split.
- **Split** shows one `PlanningTonnesCell` per ticked plant (`Split South 50x50 1.6 Hyderabad`) and
  `= 120` or, in red, `115 of 120`.
- **Red row**: `bg-red-50` on the `<tr>` and the pinned Size cell, `data-red="true"`. Red wins over amber.
- **Blank needing a plant**: the select gets an amber border. A carried plant's select has the title
  *From last month's campaign*.
- **Amber dot**: `role="img"`, the plant and its figures in `title` / `aria-label`. Not a control.
- **Summary line** (`aria-label="Campaign summary"`) sits above the table, the whole region (search
  and quiet rows do not change it).

## Finalise on the A2 sheet (ticket #283)
- **Button** on the summary line: `Finalise November — South` (admin only; a read-only login sees the
  status but no button). Blocked, it greys out and the line reads *Not yet: 3 rows need a plant ·
  1 split does not add up to Planned*; clicking it clears the size search and puts the cursor in the
  first such row's Plant cell (`tr[data-row-key]`). It is **not** `disabled` / `aria-disabled` — it
  still acts. Ready, it asks *Finalise November — South? It cannot be undone.* · Yes, finalise · Cancel.
- **Finalised**: a green `role="status"` *Finalised 5 Nov, 09:00 by admin*. No control returns to Draft.
  A **Baseline** column appears between Planned and Plant (Plant stays the last cell). Untyped Planned
  boxes show `0` faintly, not the suggestion.
- **Reason dialog** (`PlanningReasonDialog`, `role="dialog"` *Reason for the change*): a change to
  Planned or Plant on a finalised month is held back, the box shows the stored figure, and the dialog
  names the change (`South 50x50 1.6: Planned 110 → 150`). *Save change* stays off until a reason is
  typed; Enter saves, Escape cancels. The last reason given on a row is pre-filled for its next change
  (a split's second part).
- **Revised row**: `↺ revised` beside Planned, the changes on hover, `data-revised="true"`.
- **Change log** (`aria-label="Change log"`) below the sheet: *Changes since Finalise (n)*, newest first,
  `12 Nov, 10:30 · admin · 50x50 1.6 · Planned 110 → 150 · reason`.

## Week plan screen — layout D + A (ticket #284)
- **Screen**: *Week plan* in the `Planning screen` group — `Planning master · Monthly campaign · Week
  plan · Monitoring`, flow order (12-Nov-2026). Region and Plan month are shared with the campaign and
  Monitoring; heading `Nov 2026 by week`.
- **Split from Monitoring (12-Nov-2026)**: `PlanningWeekPlan mode="plan"` shows the weeks, the Week
  column, coil and Week moves; `mode="monitor"` (heading `Nov 2026: plan against actual`) shows the
  #287 / #288 parts below and never a Week select or Week moves. Monitoring's plant view is `section
  "Hyderabad monitoring"`. On the Week plan a closed week stays grey with its current tonnes, and a
  row its closed week did not make stays amber — the cue to move it.
- **Not finalised**: a `role="note"` *South's November plan is not finalised yet…*, then `ol "South
  before Finalise"` — four steps (Type the Monthly Indent · Check Planned production · Give every
  planned row a plant · Press Finalise), ✓ when done — and a *Go to Monthly campaign — November,
  South* button. No tables.
- **Region overview** (`table aria-label="Region overview"`): Plant · W1…Wn · Month, then
  `<Region> total`. A week header reads `W1` over `1–8 Nov`; hover gives its working days, share and
  any day joined in. A plant name is a button (`aria-pressed`) that opens its plant view; the open
  plant's row is tinted. *Not in any plant's weeks:* names No plant can make / needs a plant tonnes.
- **Plant view** (`section aria-label="Hyderabad week plan"`): # · Sec · Size · Thk · T · W1…Wn,
  rows in run order, section and size printed once per group (`·` below, as on A2). The row's tonnes
  sit in its one week cell (tinted); the other weeks show a faint `·`. `tr[data-row-key]`,
  `data-week="W2"`. `ˢ` marks a split row (this plant's part; hover for the row's Planned), `↺` a row
  revised after Finalise. A last row totals each week; hover gives the working-day target.
- **Moves (#285, admin)**: a **Week** column after T — a select `Week 50x50 1.6` with W1…Wn and
  *Split…*. Split shows a `Week W1 50x50 1.6` box in every week cell and `25.0 of 40.0` in red until
  the parts add up (`= 40.0`); meanwhile the row keeps its weeks as they were. A kept split whose
  Planned was cut by more than its main week held reads `= 30.0 · check` in red. `data-week` lists the weeks
  holding tonnes (`W1 W2`). A cell a week move changed since its week's Monday adds `was 40.0 on Mon`
  in grey italic (hover names the day) — not amber, which ticket 10 keeps for unmade tonnes. Never a Plant control. Problems show in a `role="alert"` line.
- **Week moves** (`section aria-label="Week moves"`) below the plant view: *Week moves (n)*, newest
  first, `11 Nov, 10:30 · admin · Hyderabad · 50x50 1.6 · W1 → W2`. No reason column.
- **Coil (#286), plant view only**: four columns after the weeks — **Strip** (mm, grey; `?` when a
  CHS has no OD on the SKU master) · **Slit** · **HR** (T handed to the row, `–` for none) · **Coil**
  (`td aria-label="Coil 50x50 1.6"`): amber `needs 69.1 by Mon 9 Nov`, red `needs 6.0 now` (a closed
  week's leftover), green `✓` covered, grey `made` when the month's production already covers it.
  The total row ends `short 1,010.0`. Above the table, a box (`ul aria-label="Hyderabad coil by
  thickness"`) with one line per band (`li aria-label="Hyderabad 3.0 mm coil"`): `3.0 mm · need 310.0
  · slit 7.8 · HR 43.1 of 43.1 · short 259.1, first by Mon 9 Nov`, or green `covered`.
- **Coil short (#286), region overview**: a last column *Coil short (on hand only)* (`td aria-label=
  "Hyderabad coil short"`): `3.0 mm 259 T by Mon 9 Nov · …`, each band amber or red as above, wrapping
  inside the cell, or green `covered`. The total row leaves it blank. The A2 sheet has no coil column.
- **Monitoring (#287)** — on the *Monitoring* screen: a **closed** week's header is grey and reads `1–8 Nov · closed`.
  *Overview*: a closed week's cell (`td aria-label="Hyderabad W1"`) reads `260.0 / 40.0` (plan /
  made; the plan as it stood on the week's Monday, with a grey `now 220.0` under it once a week move has changed it), **red and bold** when the plant's week is short, with `entered to 5 Nov` (or `no production
  entered`) in amber beneath when the plant's production stops short of the week's last day. After
  Month (which adds a grey `Base 1,000.0` when the Baseline differs): **Made · % · Behind** (red when
  above 0, `td aria-label="Hyderabad behind"`) **· Off plan** (hover lists its lines). The total row
  sums plan / made, Made, %, Behind, Off plan, never red.
  *Plant view*: `Baseline 1040.0 = made 40.0 + plan changed 0.0 + behind 220.0 + still to come 780.0 T
  · made off plan 106.5 T, not credited` (`p aria-label="Hyderabad plan against made"`); `B 100.0` in
  grey after T when the row's Baseline differs; **Made · % · Status** after the weeks
  (`td aria-label="Status 50x50 1.6"`: green `made`, amber `W1 not made` / `due 60 more`, grey `on
  track` / `started` / `not due yet`, plus `· +10.0 off plan`). A closed week's cell of an amber row
  turns amber. **No row is ever red.** Below the table, `ul aria-label="Hyderabad made off plan"`:
  `Made off plan · 106.5 T · not credited…`, then `SHS 132x132 × 4.0 — 96.5 T (no master row)`.
- **Dispatched, Stock now, MTO served (#288)** — region figures, so both plants of a split row read
  the same. *Summary line* above the overview (`p aria-label="South dispatched and served"`):
  `Dispatched 191.6 T · MTO served 30% of 50.0 T indent · Buffer rows under buffer now 12 of 40`, the last two over the rows on the plant tables (a split row once)
  (grey `· n MTO rows dispatched with no indent`, amber `· n to check` when there are any).
  *Overview*: **Dispatched MTD** after Off plan, before Coil short (`td aria-label="Hyderabad
  dispatched"`; the total row `South dispatched`). *Plant view*: three columns after Status, before
  Strip, with a left rule — **Dispatched** (`td aria-label="Dispatched 50x50 1.6"`) · **Stock now /
  Buffer** (`Stock now 50x50 1.6`: `33.0 / 100.0`, the stock green at or above Buffer, a grey `by
  design` when under Buffer with Indent ≥ Buffer, amber `check` when dispatched exceeds Open + made)
  · **MTO served** (`MTO served 50x50 1.6`: `30%`, grey `no indent`, `–` for nothing, a grey `·` on a
  Buffer row). Strip is `td aria-label="Strip 50x50 1.6"`.

## Words on the planning and coil screens (user, 12-Nov-2026)
- **A screen is numbers and structure.** No sentence under a table. Rules live in one folded
  **Key** (`KeyPoints`: a `<details>` closed by default, one point per line, a few words each);
  long explanations stay in column hovers (`title`). Figures that sat in a sentence go in a
  **`FactStrip`** (`label value | label value`), e.g. `South dispatched and served`,
  `Hyderabad plan against made`, the master's *Stock outside the plan*, the campaign's *Open stock*.
- Campaign: *Outside the plan* is a folded table `Outside the plan · South` (Size · Open · last ·
  three); under the table one line each for provisional, ◆ moved and quiet rows.
- Week plan coil: `table "Hyderabad coil by thickness"` — Coil band · Need · Slit · HR · HR on hand ·
  Short · First (row `Hyderabad 3.0 mm coil`). Row cell *Coil short* reads `69.1 Mon 9 Nov` / `6.0 now`
  / ✓ / made; the overview's *Coil short (T)* one band per line, `3.0: 259.0 Mon 9 Nov`.
- **Step bar** (`group "Planning screen"`): four buttons, `aria-label` the step name, the state line
  under it (green final, amber master gaps, red behind, grey locked). 🔒 / ✓ between steps 2 and 3 is
  the Finalise gate. Region (`group "Region"`) and Plan month (hidden on the master) sit on the bar's
  right — the screens draw no picker of their own and no repeat heading.
- Locked (not finalised): `note "🔒 Finalise West · November first"`, a *Monthly campaign →* button,
  and `West before Finalise`: Planned · To assign · Indent typed.
- Week moves and the Change log appear only once they have an entry.
- Never the word **hidden** on screen (see `roles.spec.js` `FORBIDDEN`).

## Sales tab — Size × Thickness grid
- Sits between the distributor drill-down and **Month-wise Sales**. Laid out like the indent plan and
  the Inventory drill's 2g: one row per **section + size**, one column per **thickness** (mm) inside each
  block, a Total column per block and a Total row. Every number comes from `salesSizeLines` /
  `salesSizePivot` (calc.js); `SalesSizeGrid` only chooses which rows go in and which blocks show.
- **Eight blocks, in reading order** (12-Nov-2026): *Stock flow* — Opening stock, Production,
  Dispatch, Closing stock; *Sales* — Confirmed, Non-confirmed, **Pending to Serve**; then **Production
  required**, last. Pending to Serve is Confirmed + Non-confirmed, named by the glossary (ADR-0008);
  the rest of the Sales tab still calls that figure "Pending to Dispatch" — a known gap, left for a
  separate change. Invoiced was removed; Dispatch carries the window's invoicing out of the plants.
  A **Show** row picks All, one family, or a single block — the full grid is 8 × (thicknesses + 1)
  columns wide, so this is what keeps it readable.
- **Production required** is a CELL figure (`required`, a Map by `salesGridCellKey`), never a line's:
  the pivot sets it on each cell and only then sums rows and totals. The SKU list leaves it out and
  says so. Orders of an `Unmapped` distributor are not counted; an amber line names their tonnage and
  says to map the state. A picked `Unmapped` distributor reads `?`.
- **Two scopes, captioned.** Sales blocks follow the **Distributor** dropdown above, then the grid's
  **Region** filter. Stock blocks follow the plants that **serve** those regions (ADR-0006). A picked
  distributor replaces the Region filter with a read-only "Region: South (the distributor's)", because
  its region is a fact, not a choice. An `Unmapped` distributor reads **`?`** in every stock cell, with
  the amber "map the state" sentence; a region no plant serves reads 0 with its own amber sentence.
- **Its own From / To dates.** They start on the Month dropdown's month (1st → its last day, or today
  in the current month) and reset whenever the month changes; a date picked here moves only this
  table. Opening is stamped with From, Closing with To, Production / Dispatch with the range.
  Confirmed / Non-confirmed are today's undated order book and do not move with the dates.
- **Filters**: Region, Plant, Section, Size, Thickness (`MultiSelectFilter`, empty = all). Options are read off
  the unfiltered lines, so a dropdown never empties itself. Totals are rebuilt from the kept lines.
- **Plant** (12-Nov-2026) narrows **every** block, and only this table: stock from that plant's
  productions and invoices (`stockPlants`), sales rebuilt by `salesByDistributor` from the orders and
  invoices booked on it, for the same distributors (matched by id). It offers only the plants that
  serve the regions in view (all four with no region picked; none for `Unmapped`), and only the header's
  plant when the header is on one — it narrows the service area, never widens it. A plant that stops
  being offered drops out of the selection. The title, caption and CSV name carry the picked plants.
- **Standard thicknesses** (12-Nov-2026): columns are the eight standards of `thicknessBucket`
  (1.2 1.6 2.0 2.5 3.0 4.0 5.0 6.0, labelled to one decimal) — 2.2 counts in 2.0; 2.8, 2.9, 3.2 in 3.0.
  The Thickness filter offers the standards; the SKU list keeps the SKU's own `Thk (mm)` and adds `Std thk`.
- **Compact**: the grid is `text-xs` (12 px) with `px-1.5 py-0.5` cells, the Planning master's density.
- **Size × Thickness / SKU list** toggle: the list is one row per canonical SKU with its code and
  description, the same shown blocks as columns. Both scroll inside a 70vh box; the grid's Section
  and Size columns and its two header rows are sticky.
- **Production check view** (13-Nov-2026), the third view beside Size × Thickness and SKU list: one
  column group per standard thickness, each holding **Opening · Produced · Invoiced · Closing ·
  Invoiced 30 d · Invoiced avg / month (90 d) · Pending** (13-Nov-2026: Opening, Invoiced 30 d and Invoiced avg / month (90 d) added at
  the user's pick; Invoiced avg / month (90 d) = `invoicedMonthly`, the 90 days to To ÷ 3), plus a
  **Total group, placed first** (right after Size, so a size's whole answer is on the first screen;
  13-Nov-2026 design review): the stock chain, then demand. Its purpose is checking production went into the sizes
  that sell. Opening, Produced, Invoiced (= Dispatch), Closing and Pending (= Pending to Serve, today's
  undated order book, Distributor / Region scope) are the grid's own blocks; **Invoiced 30 d**
  (`invoiced30`) is the same plants' invoicing over To − 29 … To, whatever From is (the SKU cover
  window). Totals tie (Tapi 1–12 Nov: 839.4 + 203.6 − 105.1 = 937.8; 646.8; 114.0 — each checked by SQL). It obeys every filter and ignores
  Show (the Show buttons hide in this view). Own CSV name: `sales-size-production-check-….csv`.
- **FG ageing table** (12-Nov-2026) sits under the grid, inside the same section, in the same layout:
  one block per age band (0–30, 31–60, 61–75, 75+ d — green to red) plus **All ages**, standard-thickness
  columns and a Total per block. It obeys Region, Plant, Section, Size, Thickness and the To date (ages
  are counted to To); it ignores Show, the From date and the Grid / SKU list toggle. Its own ⬇ CSV
  (`sales-size-fg-ageing-<from>-to-<to>….csv`). Unknown stock reads `?` here too.
- Cells: blank for nothing, `?` for unknown, one decimal otherwise; a negative stock is red. The CSV is
  the screen's text, for the view and blocks on screen, named by month and scope
  (`sales-size-grid-2026-11-West.csv`).

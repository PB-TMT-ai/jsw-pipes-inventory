# Data Model (Supabase)

> Read this before touching `src/lib/db.js`, any store key, the Postgres schema, or auth.

All pipeline data lives in **Supabase Postgres**, accessed via `useSupabaseStore(localStorageKey, fallback)` in `src/lib/db.js`. The legacy `jsw:*` strings are now **store keys mapped to Postgres tables** (`TABLE_MAP` in `db.js`), not localStorage keys. Records are stored snake_case in Postgres and converted to/from camelCase on read/write (`toCamel`/`toSnake`; note: conversion is **top-level only** — nested arrays like `bundle_entries` keep camelCase inner keys).

| Store key | Postgres table | Stage / contents |
|-----------|---------------|------------------|
| `jsw:coils` | `coils` | Stage 1 mother coil records. Carries the `plant` — set once here, inherited by everything downstream (see below) |
| `jsw:babyCoils` | `baby_coils` | Stage 2 slitting output. Width-proportional `weight`/`cost_price`, `hr_coil_id` = mother, letter-suffixed `baby_coil_id`, `plant` inherited from the mother. Carries a manual `consumed` boolean (hides the coil from the Production picker/FIFO; set per-row or via bulk edit). **Hard-delete** table |
| `jsw:productions` | `productions` | Stage 3 production batches. Each carries `coil_allocations` (JSONB `[{babyCoilId,hrCoilId,pieces,weight}]`, camelCase inner keys) — the baby-coil FIFO split (with mother id) — a `plant` inherited from the baby coils consumed, and a `status` |
| `jsw:dispatches` | `dispatches` | Stage 4 dispatch **and invoice** records — now loaded from the daily "Upload Sales Excel" **Invoice** tab (via `buildDispatchRecords`, called from the Orders component); the Dispatch tab is a read-only records/reconciliation view. `bundle_entries` carry per-entry `invoiceNo`, `plant`, `shipToState`, `coilAllocations` (`{babyCoilId,hrCoilId,…}`), and legacy `traceHrCoilId` |
| `jsw:skus` | `skus` | SKU master (falls back to `DEFAULT_SKUS` when table is empty) |
| `jsw:distributorEstimates` | `distributor_estimates` | **Distributor Monthly Estimate** — the typed Best Estimate (planned invoiced MT) for one distributor in one month. `distributor_key` is the app's resolved distributor identity (ERP `distributor_code` when present, otherwise the normalised name — the same key `salesByDistributor` groups by), `month` is `'YYYY-MM'`. **Unique on `(distributor_key, month)`**, which is also the upsert arbiter. Written inline from the Sales tab; the plant Best Estimate is their sum, never typed (see `docs/adr/0001-…`) |
| `jsw:stateRegions` | `state_regions` | **State → Region master** — the one hand-mapped value in region reporting. Keyed by `state` (UPPER-CASE, **unique**, and the upsert arbiter), holding one of the four `region` values. Falls back to `DEFAULT_STATE_REGIONS` (`src/data/stateRegions.js`) when the table is empty, and that seed is **also layered under** the stored rows — see below. Edited inline from the Sales tab |
| `jsw:orders` | `orders` | Customer order book — Orders tab of the daily Sales upload. Per-line `confirmed` (ERP Release − Invoiced), `non_confirmed` (Ordered − Release − Cancelled), `distributor_code`, `ship_to_state` and `plant` (both see below). **PO Master was removed (July 2026)** — the `purchase_orders` table is left dormant |

The change is **additive/backward-compatible**: production `coil_allocations` carry **both** `babyCoilId` (capacity/FIFO) and the mother `hrCoilId` (cost/tracker), and legacy mother-only/`traceHrCoilId` rows still resolve. The `baby_coils` table is **active again** — re-added to `TABLE_MAP`/`HARD_DELETE_TABLES` in `db.js`; the `delete from baby_coils;` wipe was removed from `supabase-setup.sql`.

The `bundles` and `tubes` tables still exist in Postgres but are **legacy** — Bundle Formation was removed and the tube stage stays removed; neither is read/written by the app.

## Ship-to state (region reporting)
Every order line and every invoice line carries the state it shipped to, so sales can be grouped by
region. The two sheets of the One Helix workbook supply it differently — resolved by
`resolveShipToState()` / `gstStateName()` in `src/lib/calc.js` and stored **UPPER-CASE** on both
sides, so `TAMIL NADU` from an order and from an invoice group under one key:

| Source | Where it's stored | How the state is derived |
|---|---|---|
| **Orders** sheet | `orders.ship_to_state` (new column; `alter table … add column if not exists` in `supabase-setup.sql`) | The sheet's own **`Ship to State`** column, populated on every row. Its `Ship to GST` is the literal `0`, so the GSTIN fallback lands on **`Bill to - GST`** |
| **Invoice** sheet | per-entry `shipToState` **inside `dispatches.bundle_entries`** — `dispatches` has no such column, and a stray top-level key makes Supabase reject the whole upsert | The sheet has **no state column**: state = the first two digits of **`Ship to GST`** (the GST state code — 29 Karnataka, 33 Tamil Nadu, 36 Telangana, …), falling back to `Bill to - GST` |

`GST_STATE_CODES` in `calc.js` holds **every** state/UT code (01–38 plus 97/99), not only those seen
in today's file, so a first shipment to a new state resolves the day it happens. A line whose state
cannot be resolved (blank column, `0`, non-numeric or unknown prefix) stores **blank** and is counted
in the upload banner — it is **never** guessed from a customer name, city or pincode. Both stores are
replace-all on upload, so one "Upload Sales Excel" run backfills the whole history; there is no
separate migration of existing rows.

## Plant (ticket #118)
Four manufacturing companies ship the order book. Until #118 the app had no column to put them in,
so all four counted as Hyderabad's — 2615.441 MT of Pending to Dispatch where Hyderabad's own was
761.441 MT.

Plant is resolved from the ERP's **`Ship From Code`**, which is spelled identically in both sheets.
The ERP's own name string — `CM name` in Orders, `Ship from location` in Invoice — is a **fallback
only**. See `docs/adr/0004-plant-dimension-from-erp-ship-from-code.md` for why the code and not the
name.

| | |
|---|---|
| **Master** | `src/data/plants.js` — a **code constant, not a table**. Four rows, fixed literal ids, every field either an ERP identifier or a label; nothing for an operator to type, so nothing to store and sync |
| **Each plant carries** | `id` (stored on the row), `erpCode` (Ship From Code), `erpNames[]` (fallback matching), `name` (short display), `coilPrefix` (phase 2), `manufactures` |
| **The four** | `hyderabad` `V2482-2973-JODL-4144` → **Hyderabad** · `npmd` `V1865-2222-JODL-4081` → **NPMD** · `lepakshi` `V2732-3276-JODL-4606` → **Lepakshi** · `tapi` `V2744-3288-JODL-4631` → **Tapi**. Hyderabad and NPMD manufacture; the other two carry orders only |
| **Helpers** | `plantIndex()` / `resolvePlant({shipFromCode, name})` → plant id or `''` · `plantLabel(id)` → short name or `Unattributed` · `plantById(id)` · `plantForErpRow(row)` → a plant id from a raw ERP row (the only place the column names live) · `dispatchPlantLabel(record)` → a dispatch record's plant, read off its entries |
| **Stored where** | **Orders**: `orders.plant` — the **id**, never the label, so renaming a plant on screen orphans nothing. Blank ⇒ SQL NULL via `toSnake`, reading back as `Unattributed`. **Invoice**: per-entry `plant` **inside `dispatches.bundle_entries`** — same constraint as `shipToState`, `dispatches` has no per-line column and a stray top-level key makes Supabase reject the whole upsert |
| **Shown as** | The short display name only. `New Pashchim Maharashtra Patra Depot` never reaches a screen |

A line whose code matches no plant stores **blank**, displays **`Unattributed`**, and is counted in
the upload banner. `Unattributed` is **not a fifth plant** and never a "rest" bucket — its tonnage
stays inside every total, exactly as `Unmapped` does for region. An unrecognised code **imports**;
it never fails the upload, because a fifth company appearing in the ERP must not stop the daily file
loading. Orders are replace-all on upload, so one run backfills every historical row — there is no
separate migration.

### Invoice lines (ticket #119)
The Invoice sheet is shaped differently from Orders: it has **no `CM name` column at all**. It
carries `Ship From Code` and a `Ship from location` name. Because the resolver keys on the **code**,
one resolver serves both sheets and an order line and an invoice line for the same plant land on
**one id** — which is what makes this tie-out possible:

| Check | 18-Aug-2026 file |
|---|---|
| Invoice lines resolved | **599 stored** → Hyderabad, 0 Unattributed. The spec counts 600 rows in the sheet; `buildDispatchRecords` drops Freight and zero-quantity rows before storing, so one row carries no tonnage |
| Their tonnage | **3514.174 MT** |
| Ties to | Hyderabad's **`Invoiced Qty`** from the *Orders* sheet, which also totals 3514.174 MT. Note the two sides are **not independent measurements**: the Orders sheet's `Invoiced Qty` is derived from the invoices, so the same tonnage is being read twice. The tie confirms the ERP is self-consistent and that attribution moved no weight — it is not corroboration from a second source |

Plant is resolved from a **raw ERP row** by `plantForErpRow(row)` in `calc.js`, built on
`erpRowPicker(row)` (the header matching both row mappers use). It lives in `calc.js` rather than
`App.jsx` so the column aliases are testable: while it lived in `App.jsx` the suite could not import
it, and pointing the aliases at a non-existent column left every test passing while every line in
both sheets silently became `Unattributed`.

`dispatchPlantLabel(record)` in `calc.js` reads a record's plant back off its entries for the
Dispatch view — one invoice ships from one plant, but a record whose entries disagree shows **both**
labels rather than silently taking the first. Every dispatch entry written before #119 has no
`plant` key at all and reads `Unattributed`; nothing is backfilled, because dispatches are
replace-all on upload.

### Pipeline rows (ticket #120)
Orders and invoices get their plant from the ERP. Pipeline rows cannot — **the ERP has no view of the
shop floor**. So plant is typed **once, by an operator at Coil Inward**, and inherited from there. It
is never re-typed and never editable afterwards, because it describes where a physical object
physically sits.

```
Coil Inward ──plant chosen once──► coils.plant
                                      │  (mother)
                                      ▼
Slitting ──── baby coil takes its mother's ──► baby_coils.plant
                                      │  (consumed)
                                      ▼
Production ─ batch takes its baby coils' ───► productions.plant
```

| | |
|---|---|
| **Columns** | `coils.plant`, `baby_coils.plant`, `productions.plant` — all `text`, all holding the **id** |
| **Helpers** | `coilInwardPlants()` / `DEFAULT_COIL_PLANT` (what Coil Inward may offer) · `nextCoilNumber(coils, plant)` (each plant's own running number, ticket #122) · `genHRCoilId(dateStr, num, plant, master)` (id's prefix from the plant master, ticket #122) · `babyCoilPlant(motherCoil)` · `productionPlant(coilAllocations, babyCoils, coils)` |
| **Set where** | Coil Inward only. The form's Plant field is a select when registering and **disabled when editing** — an existing coil's plant is carried through untouched on save |
| **Inherited how** | Slitting re-reads the mother's plant on **every** save rather than carrying the stored value forward, so an edit can never move a baby coil off its mother's plant. Production derives its plant from the allocations it actually persists |
| **Offered** | **Hyderabad and NPMD** — `COIL_INWARD_PLANT_IDS` (ticket #123). Numbering was readied first (ticket #122): `nextCoilNumber` counts each plant's coils separately (NPMD starts at 01 whatever number Hyderabad is on) and `genHRCoilId` takes the plant's prefix (`NPM-` for NPMD, matching `HYD-`'s three letters), both defaulting to Hyderabad so no existing call or legacy row changed when the gate widened. Lepakshi and Tapi are never offered here — `coilInwardPlants()` still intersects the list with `manufactures`, so reclassifying either stays the one-line change ADR-0004 promised |
| **Backfill** | A one-off `update … set plant = 'hyderabad' where plant is null` on all three tables in `supabase-setup.sql`. **Unlike orders and dispatches, pipeline rows are not replace-all on upload** — nothing rewrites them, so the history needs an explicit statement. Idempotent, and safe to re-run after phase 2: a row the app wrote already carries its own plant |
| **Never touched** | Coil **ids**, weights, costs and `coil_allocations`. A coil id is printed on a physical tag and embedded inside stored production allocations |

`productionPlant` returns one plant only when **every** allocation agrees. A batch fed from two
plants belongs to neither and reads `Unattributed` — FIFO and the manual picker never cross plants,
so a disagreement is a fault to see, not one to resolve by taking whichever coil was listed first.
Each allocation resolves off its **baby coil first, its mother second**, which is what lets a legacy
mother-only allocation still land on a plant.

### Allocation never crosses plants (ticket #124)
The claim above — "FIFO and the manual picker never cross plants" — is enforced from #124, not
assumed, and it takes **two** checks rather than one:

1. **What can be offered.** `coilFifoAllocate` takes a **`plant`** argument and applies
   `filterByPlant` **ahead of every other eligibility rule** it applies; the manual dropdown applies
   the same filter to `babyCoils`.
2. **What can be saved.** `crossPlantAllocationRows(rows, babyCoils, plant)` re-checks the rows
   themselves at save time, and a non-empty result **blocks the save** with the offending coils
   named. Scoping the pickers alone is not enough: the rows **outlive a change of plant**, so an
   operator can pick Hyderabad's coils, change the selector to NPMD, add a row, and hold a
   two-plant allocation that both pickers were correctly scoped throughout. Nothing is dropped
   silently — the tonnage is the operator's to clear, not the app's to delete.

Only with both does a `productionPlant` of `Unattributed` on a multi-coil batch mean a **legacy**
record or an unbackfilled coil rather than a live mis-pick. Note what check 2 is *not*: it is not a
second opinion on eligibility, it is the same rule applied to a different object — the rows, not the
coil list — because those are two pieces of state that can drift apart.

| | |
|---|---|
| **Nothing is stored differently** | No new column, no migration. `productions.plant` is still derived by `productionPlant` from the allocations actually persisted, so plant remains a description of what the batch ate. `coil_allocations` still carry **both** `babyCoilId` and the mother `hrCoilId` |
| **Which plant a new batch draws from** | The header selector's value. Under **All Plants** Production withholds its form and asks, rather than defaulting to Hyderabad — the app does not know, and guessing would hand an NPMD operator Hyderabad's strip |
| **Which plant an edit draws from** | The **record's own** stored `plant`, never the header's. A batch already consuming Hyderabad coils must keep seeing them, whatever the header reads. A record storing **blank** has no plant to keep, so it falls through to the header — and is gated the same way if that reads All Plants |
| **A batch with no allocations** | Saves with `plant: ''` → `Unattributed`, unchanged from #120. There are no baby coils to inherit from, and the plant it was *composed* under is not evidence of where anything physically sat |
| **Default is unchanged behaviour** | `plant` defaults to `ALL_PLANTS`. `scripts/coil-realloc-dryrun.mjs` and every other `coilFifoAllocate` caller allocate across all coils exactly as before |

See `docs/ALGORITHMS.md` for why the filter's *position* is the load-bearing part, and
`docs/UI-PATTERNS.md` for the form rules. Phase 3 (#117) moves the plant from the header selector to
the operator's login, at which point the All Plants gate disappears for a plant user.

## Plant selector (ticket #121)
Every plant-carrying store above (`orders`, `coils`, `baby_coils`, `productions`, plus the per-entry
plant inside `dispatches.bundle_entries`) can be scoped to one plant by a single header control. It
is UI-level only — nothing is written, nothing is deleted, and no store gains a column here. The
selector's state (`selectedPlant` in `InventoryApp`) is a plain `useState`, not persisted to
`localStorage` or Supabase: a reload always comes back to **All Plants**, so a filter nobody meant to
leave on can never silently scope a report or a screenshot days later.

| | |
|---|---|
| **Sentinel** | `ALL_PLANTS` (`calc.js`) — a value no stored `plant` can ever equal, so "combine everything" and Unattributed (`''`) stay distinct selections of the same control |
| **Options** | `plantFilterOptions()` → All Plants, then the four plants in master order, then Unattributed last — the one stable order the selector is always shown in |
| **Row filter** | `filterByPlant(rows, selected)` — pass-through on `ALL_PLANTS`; else `rows.filter(r => storedPlant(r) === selected)`. Used for coils, baby coils, productions, orders |
| **Dispatch filter** | `filterDispatchesByPlant(dispatches, selected)` — plant lives per **entry**, not on the record (see Plant above), so this filters each record's `bundleEntries` rather than keeping/dropping the whole invoice. A record left with zero matching entries drops out entirely. The surviving entries go back through **`withDispatchEntries`** — the same helper the daily upload builds records with — so `theoreticalWeight`/`variance`/`selectedBundles` are re-derived by one shared piece of arithmetic and a filtered read can never disagree with an unfiltered one. `vehicleWeight` is a whole-vehicle measurement that cannot be split by plant and is left as recorded, so `variance` compares one plant's tonnage against the whole vehicle. Moot on today's data: every invoice line is Hyderabad's |
| **Applied to** | Dashboard, Coil Tracker, Dispatch, Orders, Sales, Reports — `InventoryApp` filters once and passes the scoped arrays down; no tab filters itself |
| **Scoped exports** | A Reports workbook is read away from the screen that scoped it, so a scoped one carries its scope in the file itself: `— <Plant> only` in **every** sheet title (`opts.companyName`, which reaches all 7 title rows across the 3 workbooks) and a `-<plant>` suffix on the file name (`opts.fileSuffix`), plus an amber banner on the tab. Both asserted in `reports.test.js` |
| **NOT applied to** | Coil Inward, Slitting, Production and SKU Master keep reading the raw, unfiltered store arrays. Orders' own upload path (`replaceOrders`/`replaceDispatches`, and the `productions` passed into `buildDispatchRecords` for the invoice coil trace) is also unfiltered — an upload made while the header is scoped to one plant must still resolve every other plant's coil trace correctly. Sales' `estimates` and `stateRegions` are unfiltered too — Best Estimate and Region stay exactly as documented above, keyed by distributor/state, not plant |
| **Read a second way by Production** | Production still gets the **raw** arrays, but from #124 it also gets the selector's value as `operatingPlant` and scopes them itself, because its scope is the *batch's* plant (the operating plant for a new one, the record's own when editing) rather than the header's — see below |
| **Where scoping changes meaning** | Two things are **withheld** under a filter rather than silently recomputed, because a filter may not redefine an answer: Sales' **% of BE / Gap to BE / Plant BE achievement** (a plant-scoped actual over a company-wide plan is the four-against-one mismatch #117 exists to expose) and Dispatch's **Delete** (`deleted` is on the record — one whole invoice — while plant is on its entries, so deleting while scoped would remove lines the operator cannot see). See `docs/UI-PATTERNS.md` |
| **Invariant** | Per-plant sums equal the All Plants total, Unattributed included — summing `filterByPlant`/`filterDispatchesByPlant` across every plant option (the four plants + `''`) reproduces the unfiltered figure exactly, the same guarantee `Unmapped` and `Unattributed` already carry elsewhere. Asserted in `calc.test.js` at the **unit level only**, over rows constructed to the #117 spec's *published* per-plant figures (761.441 / 1044.000 / 417.000 / 393.000 MT) — that proves the helpers compose, **not** that the deployed data sums to them. It has never been checked against the live database: `orders` there has no `plant` column yet (#118's `alter table` is unrun) and currently holds 0 rows. See the 2026-08-19 `LEARNINGS.md` entry |

## State → Region
Region is a business concept the ERP **never** exports — it exists nowhere in the One Helix workbook.
State does arrive with the data (above). So the master is keyed by **state, not distributor**: a human
types region-per-state, a new distributor in an already-mapped state inherits its region
automatically, and no state is ever hand-typed, so state cannot drift from what the ERP said.

```
order/invoice line ──ship-to state──┐
                                    ├─► distributorStateIndex ─► distributor's state
distributor identity ───────────────┘        (most recent line wins)
                                                     │
                     state_regions + seed ──► stateRegionIndex ─► region, else "Unmapped"
```

The four regions are **North / South / East / West** (`REGIONS` in `calc.js`). `Unmapped` is *not* a
fifth region — it is what a state with no mapping displays, and such a row **keeps its full tonnage in
every total**. A missing mapping is a labelling gap; it may never make weight vanish from a sum.

Three consumers read this one master, so a region cannot mean different things in different places:
the Sales tab, the PB MTD workbook's *Distributor by Region* sheet, and — via
`buildRegionMtdSummary` and `scripts/region-mtd.mjs` — the daily text and WhatsApp reports. Note the
table itself may not exist in a given database; the eight-row seed in `src/data/stateRegions.js` carries
it, which is why nothing may join to `state_regions` alone.

| Concern | Behaviour |
|---|---|
| **Seed** | The eight shipped mappings (Telangana / Andhra Pradesh / Karnataka / Tamil Nadu / Kerala / Puducherry → South; Maharashtra / Gujarat → West) live in `src/data/stateRegions.js` with **fixed literal ids**, so re-seeding is idempotent |
| **Seed vs stored** | `stateRegionIndex(rows)` starts from the seed and layers the stored rows **on top** — not "table if non-empty, else seed". Editing one state writes one row; the other five seeded states must not silently become `Unmapped` |
| **Un-mapping** | Clearing a region stores `region: ''` (an explicit un-mapping that overrides the seed), **not** a soft delete — a soft-deleted row would leave the seed in force |
| **Distributor's state** | `distributorStateIndex(orders, dispatches)` derives it from that distributor's own lines, keyed by the identity `resolveDistributorIdentity` produces. Where lines disagree the **most recent** wins (undated loses to dated; an exact tie keeps the first line seen — orders before invoices). Every distinct state is kept in `states`, and `multiState` flags the distributor so it is **visible, not silently resolved** |
| **Shared resolver** | `distributorRegionResolver(orders, dispatches, stateRegions)` → `key ⇒ { state, states, multiState, region }`. `salesByDistributor` calls it via `opts.stateRegions`; the report builders can call it directly, so a region on screen and a region in a report cannot diverge |

## Sync & upsert semantics
Mutations update React state optimistically, then sync to Supabase in the background; failures broadcast a `jsw:syncError` window event **and re-read the table** so state can't keep claiming rows Postgres refused. Upserts arbitrate on `id` except **`skus`, which arbitrates on `sku_code`**, **`distributor_estimates`, which arbitrates on the composite `distributor_key,month`**, and **`state_regions`, which arbitrates on `state`** (`conflictTargetFor` in `db.js`) — that column is UNIQUE, and Postgres resolves `ON CONFLICT` against only ONE index, so a conflict on a *non-arbiter* unique column is a hard error that fails the whole batch.

## localStorage (preferences only)
- `jsw:dark` — Dark mode preference (boolean)
- `jsw:seeded` — Legacy seed flag toggled by "Reset Data" (boolean)
- `jsw:auth` — Login-gate flag `{loginId, at}` set after a successful sign-in; ~30-day expiry, cleared by Logout

## Authentication (login gate)
A login ID + password gates the app (added July 2026). The credential lives in a
private Supabase table `app_credentials` (RLS on, **no anon policy**, privileges revoked from
anon/authenticated) and is checked by a `security definer` function
`verify_login(p_login_id, p_password) → boolean` (bcrypt via pgcrypto) — so the app can only ask "is this
password correct?" and **never reads the hash**. Client entry points: `verifyLogin()` in `src/lib/db.js`;
the `App` auth wrapper + `LoginGate` component + header **Logout** button in `src/App.jsx` (the main app
component was renamed `App` → `InventoryApp`). `app_credentials` is deliberately **not** in `TABLE_MAP`
(RPC-only, never synced through `useSupabaseStore`). This guards the **app UI**, not the raw database
(the anon key + open `using(true)` RLS still expose the data — a full lockdown via Supabase Auth is the
documented upgrade path). **To add or change a login, see `blueprints/manage-app-login.md`.**

### A login carries a plant and a role (ticket #125)
`app_credentials` gained `plant` and `role`, and a **second** verification function was added
**beside** the boolean one, which is untouched and still in use.

| | |
|---|---|
| **`plant`** | A plant **id** from `src/data/plants.js` (`hyderabad`, `npmd`, …), never a display name — renaming a plant on screen orphans nothing, the same rule `orders.plant` follows. **NULL = all plants**, which is what `admin` carries |
| **`role`** | `'admin'` or `'plant'`, `not null`, check-constrained, and with **no default** — a row written without a role fails loudly rather than quietly minting an admin |
| **Second function** | `verify_login_details(p_login_id, p_password) → (login_id, plant, role)`. Same promise as `verify_login`: the password goes in, the **hash never comes out**. A wrong password returns **no rows**, never a row with the fields blanked, so "who signed in" cannot be read as "nobody did" |
| **Client entry point** | `verifyLoginDetails()` in `src/lib/db.js` → `{loginId, plant, role}` or `null`. A blank `plant` means all plants. Returns `null` for a wrong password and **throws** on a network/RPC error, so the UI keeps telling those two apart |
| **Why additive** | Changing `verify_login` in place would break the deployed app the moment the SQL ran, before the new build shipped. Two functions means no window in which the live app cannot sign anyone in |
| **Backfill** | Gated on the `role` column not existing yet, the same rule the pipeline plant columns follow. It runs once, when a login can only be the shared `admin` that predates this ticket, and stamps it `role = 'admin'` with `plant` left NULL. No password is touched — the existing admin keeps working, not recreated, nobody locked out. Re-running `supabase-setup.sql` is a no-op |
| **Three logins** | `admin` (all plants), `hyderabad`, `npmd`. Lepakshi and Tapi get none — modelled for attribution only, credentials wait until someone there asks. Passwords are set by a **human** in the Supabase SQL editor; no password is in this repository |
| **Nothing reads it yet** | This is the credential model only. No screen, tab or store is gated on plant or role here — that is the next ticket in phase 3 of #117 |

**This is UI tidiness, NOT a security boundary.** Every table keeps its permissive `using (true)`
policy and the app's public key still reaches **all** data, every plant's, exactly as before. A
plant login keeps the wrong plant's screens out of an operator's way; it does **not** make a
plant's data private, and nobody may describe it that way to a plant team. Real enforcement is
Supabase Auth with per-plant policies — the documented upgrade path, deliberately out of scope.

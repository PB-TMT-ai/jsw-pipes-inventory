# Data Model (Supabase)

> Read this before touching `src/lib/db.js`, any store key, the Postgres schema, or auth.

All pipeline data lives in **Supabase Postgres**, accessed via `useSupabaseStore(localStorageKey, fallback)` in `src/lib/db.js`. The legacy `jsw:*` strings are now **store keys mapped to Postgres tables** (`TABLE_MAP` in `db.js`), not localStorage keys. Records are stored snake_case in Postgres and converted to/from camelCase on read/write (`toCamel`/`toSnake`; note: conversion is **top-level only** — nested arrays like `bundle_entries` keep camelCase inner keys).

| Store key | Postgres table | Stage / contents |
|-----------|---------------|------------------|
| `jsw:coils` | `coils` | Stage 1 mother coil records |
| `jsw:babyCoils` | `baby_coils` | Stage 2 slitting output. Width-proportional `weight`/`cost_price`, `hr_coil_id` = mother, letter-suffixed `baby_coil_id`. Carries a manual `consumed` boolean (hides the coil from the Production picker/FIFO; set per-row or via bulk edit). **Hard-delete** table |
| `jsw:productions` | `productions` | Stage 3 production batches. Each carries `coil_allocations` (JSONB `[{babyCoilId,hrCoilId,pieces,weight}]`, camelCase inner keys) — the baby-coil FIFO split (with mother id) — and a `status` |
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

The pipeline stages (coils, baby coils, productions) do **not** carry a plant yet; that is a sibling
ticket in the #117 spec.

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
A **single shared login ID + password** gates the app (added July 2026). The credential lives in a
private Supabase table `app_credentials` (RLS on, **no anon policy**, privileges revoked from
anon/authenticated) and is checked by a `security definer` function
`verify_login(p_login_id, p_password) → boolean` (bcrypt via pgcrypto) — so the app can only ask "is this
password correct?" and **never reads the hash**. Client entry points: `verifyLogin()` in `src/lib/db.js`;
the `App` auth wrapper + `LoginGate` component + header **Logout** button in `src/App.jsx` (the main app
component was renamed `App` → `InventoryApp`). `app_credentials` is deliberately **not** in `TABLE_MAP`
(RPC-only, never synced through `useSupabaseStore`). This guards the **app UI**, not the raw database
(the anon key + open `using(true)` RLS still expose the data — a full lockdown via Supabase Auth is the
documented upgrade path). **To change the login ID / password, see `blueprints/manage-app-login.md`.**

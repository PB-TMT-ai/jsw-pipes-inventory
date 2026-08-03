# Data Model (Supabase)

> Read this before touching `src/lib/db.js`, any store key, the Postgres schema, or auth.

All pipeline data lives in **Supabase Postgres**, accessed via `useSupabaseStore(localStorageKey, fallback)` in `src/lib/db.js`. The legacy `jsw:*` strings are now **store keys mapped to Postgres tables** (`TABLE_MAP` in `db.js`), not localStorage keys. Records are stored snake_case in Postgres and converted to/from camelCase on read/write (`toCamel`/`toSnake`; note: conversion is **top-level only** — nested arrays like `bundle_entries` keep camelCase inner keys).

| Store key | Postgres table | Stage / contents |
|-----------|---------------|------------------|
| `jsw:coils` | `coils` | Stage 1 mother coil records |
| `jsw:babyCoils` | `baby_coils` | Stage 2 slitting output. Width-proportional `weight`/`cost_price`, `hr_coil_id` = mother, letter-suffixed `baby_coil_id`. Carries a manual `consumed` boolean (hides the coil from the Production picker/FIFO; set per-row or via bulk edit). **Hard-delete** table |
| `jsw:productions` | `productions` | Stage 3 production batches. Each carries `coil_allocations` (JSONB `[{babyCoilId,hrCoilId,pieces,weight}]`, camelCase inner keys) — the baby-coil FIFO split (with mother id) — and a `status` |
| `jsw:dispatches` | `dispatches` | Stage 4 dispatch **and invoice** records — now loaded from the daily "Upload Sales Excel" **Invoice** tab (via `buildDispatchRecords`, called from the Orders component); the Dispatch tab is a read-only records/reconciliation view. `bundle_entries` carry per-entry `invoiceNo`, `coilAllocations` (`{babyCoilId,hrCoilId,…}`), and legacy `traceHrCoilId` |
| `jsw:skus` | `skus` | SKU master (falls back to `DEFAULT_SKUS` when table is empty) |
| `jsw:distributorEstimates` | `distributor_estimates` | **Distributor Monthly Estimate** — the typed Best Estimate (planned invoiced MT) for one distributor in one month. `distributor_key` is the app's resolved distributor identity (ERP `distributor_code` when present, otherwise the normalised name — the same key `salesByDistributor` groups by), `month` is `'YYYY-MM'`. **Unique on `(distributor_key, month)`**, which is also the upsert arbiter. Written inline from the Sales tab; the plant Best Estimate is their sum, never typed (see `docs/adr/0001-…`) |
| `jsw:orders` | `orders` | Customer order book — Orders tab of the daily Sales upload. Per-line `confirmed` (ERP Release − Invoiced), `non_confirmed` (Ordered − Release − Cancelled), and `distributor_code`. **PO Master was removed (July 2026)** — the `purchase_orders` table is left dormant |

The change is **additive/backward-compatible**: production `coil_allocations` carry **both** `babyCoilId` (capacity/FIFO) and the mother `hrCoilId` (cost/tracker), and legacy mother-only/`traceHrCoilId` rows still resolve. The `baby_coils` table is **active again** — re-added to `TABLE_MAP`/`HARD_DELETE_TABLES` in `db.js`; the `delete from baby_coils;` wipe was removed from `supabase-setup.sql`.

The `bundles` and `tubes` tables still exist in Postgres but are **legacy** — Bundle Formation was removed and the tube stage stays removed; neither is read/written by the app.

## Sync & upsert semantics
Mutations update React state optimistically, then sync to Supabase in the background; failures broadcast a `jsw:syncError` window event **and re-read the table** so state can't keep claiming rows Postgres refused. Upserts arbitrate on `id` except **`skus`, which arbitrates on `sku_code`**, and **`distributor_estimates`, which arbitrates on the composite `distributor_key,month`** (`conflictTargetFor` in `db.js`) — that column is UNIQUE, and Postgres resolves `ON CONFLICT` against only ONE index, so a conflict on a *non-arbiter* unique column is a hard error that fails the whole batch.

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

# Application Architecture

> Read this before changing pipeline stages, tabs, or the project layout.

## Tech Stack
- **Framework:** React 18 (JSX, functional components, hooks)
- **Language:** JavaScript (JSX) — no TypeScript in current build
- **Styling:** Tailwind CSS 3.4 (dark mode via `class` strategy)
- **Charts:** Recharts 2.x (BarChart, PieChart)
- **Storage:** Supabase (Postgres) via `@supabase/supabase-js`. Data is fetched on mount and synced on every mutation through `useSupabaseStore` (`src/lib/db.js`). localStorage is used **only for UI preferences** (`jsw:dark`, `jsw:seeded`).
- **Build:** Vite 6.x + @vitejs/plugin-react
- **Font:** Inter (Google Fonts CDN)
- **Type:** Single-page application (SPA). Client-rendered, but **backed by Supabase** — requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`).

## The 4-Stage Pipeline
4-stage manufacturing pipeline tracking steel coil → finished tubes. **Slitting was
re-introduced (June 2026, later change)** so mother coils are slit into **baby coils** before
production; **Bundle Formation was removed**; **Dispatch is uploaded from Excel**. Production
no longer consumes mother coils — it FIFO-consumes **baby coils** on thickness:

1. **Coil Inward** — Mother coil registration (HR coils). Fields: date, **plant**, coil number/ID, grade (free text), thickness, width, invoice/actual weight, cost price, PO number. No chemistry fields. **Plant is set here and only here** — Hyderabad and NPMD are the choices (NPMD's own registration landed in ticket #123, phase 2 of the #117 spec); Lepakshi and Tapi carry orders only and are never offered — and the field is **disabled once the coil exists**, because plant describes where a physical object sits.
2. **Slitting** — Manual: operator picks a mother coil and enters baby-coil widths. **Plant is inherited from the mother** (re-read on every save, never typed). Weight & cost split **proportionally by width** across that mother's baby coils (recalc all siblings on every add/edit/delete). Baby IDs are letter-suffixed (`HYD-0626-01-A`); thickness/PO inherited from the mother. Hard-delete (frees the letter); blocked once a production has consumed the baby coil. Table `baby_coils` (store `jsw:babyCoils`).
3. **Production** — Record date + SKU + No. of pieces. **This is the coil-consumption point.** The saved coil split is the **operator's explicit selection only** — it is **never** auto-seeded from FIFO. FIFO is shown as a **non-binding suggestion** (a "Use suggestion" button copies it into the editable rows); whatever rows the operator leaves are what `save()` persists. Stored as `coilAllocations: [{babyCoilId, hrCoilId, pieces, weight}]` (the baby coil **and** its mother) with a `status` of `allocated` / `partial` / `unallocated`. **Plant is inherited from the baby coils consumed** — one plant across every allocation, else `Unattributed`. **Suggestion eligibility = width within ±5 mm AND thickness within ±0.3 mm** of the SKU: a baby coil's slit width must be within ±5 mm of the tube's required strip width (`requiredStripWidth` in `calc.js` — `2×(H+B)` for SHS/RHS, `π×OD` for CHS; width filter skipped when unknown), and its thickness within ±0.3 mm (`coilFifoAllocate`). The SKU picker is searchable; the FIFO suggestion rows are displayed in **descending MT-available** order. The manual assigned-coil dropdown is also searchable and lists **all** baby coils with **more than 0.02 MT free** (not just spec-matched), width+thickness-matched ones flagged `✓` and sorted first by MT available, with thickness & width shown in each label, so the operator can always pick an off-spec coil. Baby coils manually flagged `consumed` are **excluded** from both the picker and the FIFO suggestion.
4. **Dispatch** — Uploaded from an Excel sheet (one row per dispatched line; columns matched case-insensitively). Rows are grouped into one dispatch per (date × vehicle); each entry's coil trace is inherited from **production FIFO** (`dispatchCoilTrace`), so cost reconciliation (mother-coil rate) still works. Invoice Reconciliation CSV export retained.

## Other Modules
Plus: **Masters** (tab key `skuMaster`) — three masters in one place: the **SKU Master** (232-entry tube catalog — SHS/RHS/CHS, loaded from `src/data/skus.js`), **Coil Tracker** (mother-coil inventory + journey; **also a baby-coil view** — an "All Baby Coils" table with weight/used/free/% used/status when no mother is selected, and that mother's baby coils inside its journey when one is selected), **Dashboard** (KPIs, pipeline, yield, alerts), **Orders & Invoice** (ONE daily "Upload Sales Excel" of the One Helix workbook — Orders tab → `orders` with per-line Confirmed/Non-confirmed; Invoice tab → `dispatches`), and **Sales** (Confirmed / Non-confirmed / Pending to Dispatch / MTD Invoice / Total Orders KPIs + distributor-wise and month-wise tables). The distributor table also carries the **Best Estimate** — a typed monthly target per distributor, edited inline and measured against MTD Invoice; the plant-level Best Estimate in the PB MTD Dashboard report is their sum, no longer typed on the Reports tab (`docs/adr/0001-…`). Its **drill-down** shows on-hand stock against the distributor's pending, per SKU — scoped to the distributor's **service area** and unreserved inside it (`docs/adr/0002-…`, `docs/adr/0006-…`). **PO Master, Open Order Backlog, and SKU Demand vs Supply were removed (July 2026).**

## Role and plant decide what you see (ticket #126)
Who signed in decides which tabs render, which of them can be edited, and whether the plant selector
appears at all. **One pure function** — `accessFor(session)` in `src/lib/calc.js` — answers all
three, so the rules are unit-tested without a browser and there is a single place to change them.
`APP_TABS` (the ordered tab list) lives beside it for the same reason: a second list in `App.jsx`
would eventually show a tab the rule had never heard of.

| Tab | Admin | Plant user |
|---|---|---|
| Dashboard, Coil Tracker, Dispatch, Sales | All plants + selector | Their plant only |
| Coil Inward, Slitting, Production | All plants + selector | Their plant, pinned — and only if their plant `manufactures`. Coil Inward additionally requires the plant to be on `COIL_INWARD_PLANT_IDS`, the separate rollout list an admin's picker already honours |
| Masters (SKU / Plant / Distributor) | View and **edit** | View only |
| Orders & Invoice | **Upload** and view | View, their plant |
| Reports | **Yes** | Hidden |

Three restrictions carry real weight, and each is admin-only for a stated reason: the **upload**
rebuilds the whole company's order book by superseding every live row, so a second uploader working
from a stale file would overwrite everyone; **Masters** drives `weightPerTube` and each plant's service area, which drive every
plant's tonnage and cost; **Reports** builds the company-wide workbooks.

How it is wired in `InventoryApp`:
- `access.tabs` renders the tab bar. A hidden tab has **no button**; the `{tab === '…' && <X/>}`
  render lines are unchanged, so this is unreachability by navigation, not a route guard. That is
  enough here — `tab` only ever comes from a rendered button — but it is not a claim to lean on if
  deep-linking or a URL router is ever added.
- `access.readOnly` is passed to `SKUMaster` and `Orders` as `readOnly`, which withholds the writing
  controls **from the DOM**, not merely disables them. The tables and exports stay.
- `access.plantSelector` decides whether the `<select>` is rendered. When it is not, `selectedPlant`
  is pinned to `access.plant` and there is no setter — a plant user's scope is not a control they
  could move.
- `plantPinned` (the same distinction) also gives the **pipeline** stages a `viewPlant`. They keep
  receiving the RAW stores — as #121 and #124 left them — and each scopes only what it puts on
  screen; Coil Inward additionally registers against the user's plant with nothing to pick. The
  arrays themselves are never filtered on the way in, and that is load-bearing rather than stylistic:
  Slitting writes by replacing the whole array (`setBabyCoils(updated)`, not the functional form), so
  a filtered prop would have made every unseen row look deleted to `syncToSupabase` — a **hard**
  delete on `baby_coils`; and the cross-stage guards ("consumed by *any* production", the duplicate
  `hrCoilId`, `nextCoilNumber`) are only true against the whole register. **Display scopes; state and
  guards do not.** A consequence: a legacy blank-plant row is `Unattributed` and so not listed for a
  plant user, which makes backfilling an admin's job — from the All Plants view where it still shows.

**This is not a data boundary.** Every table keeps its permissive row-level policy and the app's
public key still reaches every plant's rows. It hides another plant's screens from an operator who
has no use for them. No screen may tell a plant team their data is private, hidden or secure — an
E2E test asserts that copy never appears. See `blueprints/manage-app-login.md`.

**Sessions** are `{loginId, plant, role, at}` under `jsw:auth`, validated by `parseStoredSession`
(also in `calc.js`, also pure). A session stored before this ticket has no `role`, so it is rejected
and deleted — everyone signs in once more, a few seconds, no version stamp needed.

## Plant selector (ticket #121)
One `<select>` in the header, next to the dark-mode toggle. **Offered to an admin only** (#126).
It defaults to **All Plants**, so every
figure the app shows on load reads exactly as it did before this ticket. Switching it scopes
**every tab that shows rows belonging to a plant** — Dashboard, Coil Tracker, **Coil Inward,
Slitting, Production**, Dispatch, Orders, Sales and Reports — all following ONE control
(`InventoryApp` holds the `selectedPlant` state and no tab invents a scope of its own). It reaches
them two ways: the read-only tabs are handed arrays already filtered, and the three pipeline stages
are handed the RAW arrays plus the same `selectedPlant` as a `viewPlant` prop, and filter their own
display — they write through the store setter and guard across the whole register, so the filter
must not reach their state.

The three pipeline stages were **originally excluded** from the selector, on the reasoning that an
operator registers coils against the pipeline's own plant fields regardless of what the header
shows. That was wrong on the floor: picking NPMD scoped six tabs and left the three screens where a
coil's plant is actually *recorded* listing every plant, so the header contradicted the table
underneath it. They now follow the selector like everything else. **Masters stays unscoped** — a SKU
catalog, a plant's service area and a distributor's region are company-wide masters, not rows that
sit at a plant.

**Scope is display, never state.** The stages still receive the RAW store arrays and filter only
what they put on screen (`viewPlant`), because they write through the store setter and guard across
the whole register — see "Role and plant decide what you see" above for why a filtered prop would
hard-delete another plant's baby coils.

The scope is passed as the `ALL_PLANTS` **sentinel**, never as a nullable id, so `filterByPlant`
does the deciding: `ALL_PLANTS` is its pass-through and `''` (Unattributed) is a real scope. A
`viewPlant ? … : rows` test reads `''` as falsy and silently widens Unattributed back to every
plant. (For a **plant user** there is no selector; `selectedPlant` is their login's plant, so the
same one path scopes them structurally — see #126 above.) The header's former hardcoded "Inventory Management — Hyderabad" now reads the selection —
"All Plants", a plant's short name, or "Unattributed".

**Reports is scoped, and a scoped workbook says so three times over** — an amber banner on the tab,
`— <Plant> only` in every sheet's title (via `opts.companyName`), and a `-<plant>` suffix on the
file name (via `opts.fileSuffix`). These workbooks are mailed and broadcast, so the scope must
travel with the file rather than living on the screen that produced it. Scoping the whole workbook
is also what keeps the header and the export from contradicting each other.

**The unscoped workbook keeps every total and gains a per-plant split beneath it** (#117 phase 4,
#127). The Dashboard sheet's KPI cards are unchanged — company-wide Pending to Dispatch still reads
2615.441 MT — and a `BY PLANT` block underneath them says where that tonnage actually sits, closed
by an `ALL PLANTS` row that ties back to the cards. Invoiced is labelled **Hyderabad only** wherever
it sits beside multi-plant Pending, because only Hyderabad has ever invoiced: the workbook has always
compared four plants' Pending against one plant's Invoiced, and naming that is the deliverable, not
correcting it. See `docs/ALGORITHMS.md` → *PB MTD workbook — the BY PLANT split*.

`filterByPlant` (`calc.js`) scopes coils/baby coils/productions/orders (anything with a top-level
`plant`); `filterDispatchesByPlant` filters each dispatch record's `bundleEntries` (plant lives
per-entry, not on the record — see `docs/DATA-MODEL.md`) and re-derives `theoreticalWeight`, dropping
a record left with no matching entry. Both are pass-throughs on the `ALL_PLANTS` sentinel. See
`docs/DATA-MODEL.md` for the full behaviour, including what stays deliberately unfiltered (Orders'
upload path, Sales' Best Estimate / state-region master).

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
scripts/daily-splits.mjs — The two splits the daily reports print, per REGION and per PLANT
                         (Invoiced MTD + Pending to serve). One run, one read of the book. Reads
                         Supabase over plain fetch and computes through src/lib helpers, so the
                         message, the Sales tab and the workbook share one attribution.
scripts/servable-orders.mjs — "Orders we can serve today", distributor by distributor, naming the
                         plant whose floor the stock is on.
blueprints/          — Task SOPs
.workspace/          — Temp files (gitignored)
```

## System Architecture (working model)
**Blueprints (/blueprints)** - Step-by-step instructions in markdown. Goal, inputs, scripts to use, output, edge cases. Check here FIRST.

**Scripts (/scripts)** - Tested, deterministic code. Call these instead of writing from scratch.

Scripts import `src/lib/*.js` directly under **plain Node**, which — unlike Vite and Vitest — does not
resolve extensionless relative paths. So every relative import inside `src/lib` and `src/data` must
carry its `.js` extension. Dropping one breaks every script while breaking no test; that is exactly
how `scripts/coil-realloc-dryrun.mjs` went dead unnoticed. `src/lib/module-resolution.test.js` spawns
a real Node process to guard it. Scripts must never import `db.js` or `supabase.js` — both are
browser-bound (React, `import.meta.env`) and throw under Node; talk to PostgREST over `fetch` instead.

**Workspace (/.workspace)** - Temp files. Never commit. Delete anytime.

## Seed Data
**No pipeline data is auto-seeded.** On first launch the pipeline tables (coils, baby_coils, productions, dispatches) load whatever is in Supabase — the re-enabled `baby_coils` rows reappear if still present. The only fallback is **`DEFAULT_SKUS`** (232-entry catalog in `src/data/skus.js`, SHS/RHS/CHS), used when the `skus` table returns no rows. (This line used to go on to describe a **"Reset Data"** header button that cleared the pipeline tables. There is no such control in `src/App.jsx`, and no commit in this repository's history adds or removes one — so it either predates this history or was never built. Either way: nothing in the app clears the pipeline tables today.)

## Running the App
```bash
# Requires Supabase env vars first — copy and fill:
cp .env.example .env.local   # set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
# Fallback if a shell-special char in the path breaks the bin shim:
node node_modules/vite/bin/vite.js
```
Dev server runs on http://localhost:3000. Without valid Supabase env vars the client cannot reach the backend (reads error out → empty pipeline data, SKUs still fall back to `DEFAULT_SKUS`).

## Deploys (Vercel)
Every branch already deploys — `git.deploymentEnabled` in `vercel.json` names only `main`, but **an
unnamed branch defaults to enabled**, so that entry restricts nothing. Don't read it as a whitelist.

| Branch | URL | Changes when |
|---|---|---|
| `main` | production URL (what operators use) | **`staging` is merged in** — a batch at a time, on the operator's say-so |
| `staging` | `jsw-pipes-inventory-git-staging-pb-tmt-ais-projects.vercel.app` | any PR is merged into it |
| any work branch | `jsw-pipes-inventory-git-<branch>-pb-tmt-ais-projects.vercel.app` | that branch is pushed |

**Every PR targets `staging`.** Changes pile up there and are reviewed together on the one fixed
staging URL; merging `staging` → `main` is what puts them all live at once. A PR straight into
`main` skips that gate and ships alone.

The branch URL is stable per branch, but long names are shortened and hashed
(`claude/handoff-implementation-7lowne` → `…-git-claude-hando-ad3bbe-…`), so take the link from the
**Preview** column of the `vercel[bot]` comment on the PR rather than constructing it.

Previews run against the **live** Supabase project (`Pipes and Tubes Inventory System`) — it is the
only one, with no branches, and `VITE_SUPABASE_URL` is not scoped per environment. A preview is
isolated in code, never in data: anything saved there is saved for real.

## Error Protocol
1. Stop and read the full error
2. Isolate - which component/stage failed
3. Fix and test in browser (check console for errors)
4. Document in LEARNINGS.md
5. Update relevant blueprint

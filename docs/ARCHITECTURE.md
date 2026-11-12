# Application Architecture

> Read this before changing pipeline stages, tabs, or the project layout.

## Tech Stack
- **Framework:** React 18 (JSX, functional components, hooks)
- **Language:** JavaScript (JSX) — no TypeScript in current build
- **Styling:** Tailwind CSS 3.4 (dark mode via `class` strategy)
- **Charts:** Recharts 2.x (BarChart, PieChart)
- **Storage:** Supabase (Postgres) via `@supabase/supabase-js`. Data is fetched on mount and synced on every mutation through `useSupabaseStore` (`src/lib/db.js`). localStorage is used **only for UI preferences** (`jsw:dark`, `jsw:seeded`, `jsw:dashScreen` — which Dashboard screen tab is open).
- **Build:** Vite 6.x + @vitejs/plugin-react
- **Font:** Inter (Google Fonts CDN)
- **Type:** Single-page application (SPA). Client-rendered, but **backed by Supabase** — requires `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (see `.env.example`).

## The 4-Stage Pipeline
4-stage manufacturing pipeline tracking steel coil → finished tubes. **Slitting was
re-introduced (June 2026, later change)** so HR coils are slit into **slit coils** before
production; **Bundle Formation was removed**; **Dispatch is uploaded from Excel**. Production
no longer consumes HR coils — it FIFO-consumes **slit coils** on thickness:

1. **Coil Inward** — HR coil registration (HR coils). Fields: date, **plant**, coil number/ID, grade (free text), thickness, width, invoice/actual weight, cost price, PO number. No chemistry fields. **Plant is set here and only here** — all four plants are the choices (NPMD's own registration landed in ticket #123, phase 2 of the #117 spec; Lepakshi and Tapi joined in ticket #156, after which the only scope that cannot register a coil is **Unattributed**) — and the field is **disabled once the coil exists**, because plant describes where a physical object sits.
2. **Slitting** — Manual: operator picks an HR coil and enters slit-coil widths. **Plant is inherited from the HR coil** (re-read on every save, never typed). Weight & cost split **proportionally by width** across that HR coil's slit coils (recalc all siblings on every add/edit/delete). Slit coil IDs are letter-suffixed (`HYD-0626-01-A`); thickness/PO inherited from the HR coil. Hard-delete (frees the letter); blocked once a production has consumed the slit coil. Table `baby_coils` (store `jsw:babyCoils`).
3. **Production** — Record date + SKU + No. of pieces. **This is the coil-consumption point.** The saved coil split is the **operator's explicit selection only** — it is **never** auto-seeded from FIFO. FIFO is shown as a **non-binding suggestion** (a "Use suggestion" button copies it into the editable rows); whatever rows the operator leaves are what `save()` persists. Stored as `coilAllocations: [{babyCoilId, hrCoilId, pieces, weight}]` (the slit coil **and** its HR coil) with a `status` of `allocated` / `partial` / `unallocated`. **Plant is inherited from the slit coils consumed** — one plant across every allocation, else `Unattributed`. **Suggestion eligibility = width within ±5 mm AND thickness within ±0.3 mm** of the SKU: a slit coil's slit width must be within ±5 mm of the tube's required strip width (`requiredStripWidth` in `calc.js` — `2×(H+B)` for SHS/RHS, `π×OD` for CHS; width filter skipped when unknown), and its thickness within ±0.3 mm (`coilFifoAllocate`). The SKU picker is searchable; the FIFO suggestion rows are displayed in **descending MT-available** order. The manual assigned-coil dropdown is also searchable and lists **all** slit coils with **more than 0.02 MT free** (not just spec-matched), width+thickness-matched ones flagged `✓` and sorted first by MT available, with thickness & width shown in each label, so the operator can always pick an off-spec coil. Slit coils manually flagged `consumed` are **excluded** from both the picker and the FIFO suggestion.
4. **Dispatch** — Uploaded from the **Zoho invoice register** via "Upload Invoice Excel" on the Orders tab (one row per invoiced line; columns matched case-insensitively). Rows are kept only for warehouses the plant master carries and only where `Invoice Status` is not `Void`; the survivors are grouped into one dispatch **per invoice**, and each entry's coil trace is inherited from **production FIFO** (`dispatchCoilTrace`), so cost reconciliation (HR-coil rate) still works. Each upload rebuilds **only the date window its file covers** — a September file rebuilds September and leaves March–August untouched. Invoice Reconciliation CSV export retained.

## Other Modules
Plus: **Masters** (tab key `skuMaster`) — three masters in one place: the **SKU Master** (232-entry tube catalog — SHS/RHS/CHS, loaded from `src/data/skus.js`), **Coil Tracker** (opens on **raw-material stock by age** — two tables, **Unslit HR coils** aged from inward date and **Slit coils in stock** aged from slitting date, oldest first, banded Clear / Watch / Act, built by `coilTrackerView` in calc.js (`docs/adr/0016-…`), under a **plant × age-band matrix** (tonnes · coils per plant, stock type and Act / Watch / Clear) whose cells filter both tables, a stock-type cell hiding the other; a collapsed **Coil stock by thickness** section — standard thickness × month, latest first, HR coil and slit coil Opening / In / Out / Closing, built by `coilThicknessGrid` (see `docs/ALGORITHMS.md`); the old HR-coil Inventory Summary sits below as a collapsed **All coils ledger**, unchanged; clicking any coil opens its **trace** — Inward → Slit → Produced → Dispatched with slit-coil, production-run and invoice-line tables, this coil's share only — and a slit coil opens its HR coil's; also from `coilTrackerView`), **Dashboard** (KPIs, pipeline, yield, alerts), **Orders & Invoice** (TWO daily uploads since ticket #192, one file each: **"Upload Order Excel"** reads the One Helix workbook's `Orders` sheet → `orders` with per-line Confirmed/Non-confirmed, and writes no dispatches at all; **"Upload Invoice Excel"** reads the Zoho invoice register → `dispatches`, windowed to the dates that file covers. Both are withheld from plant logins by the same existing read-only grant), and **Sales** (Confirmed / Non-confirmed / Pending to Dispatch / MTD Invoice / Total Orders KPIs + distributor-wise and month-wise tables). The distributor table also carries the **Best Estimate** — a typed monthly target per distributor, edited inline and measured against MTD Invoice; the plant-level Best Estimate in the PB MTD Dashboard report is their sum, no longer typed on the Reports tab (`docs/adr/0001-…`). Its **drill-down** shows on-hand stock against the distributor's pending, per SKU — scoped to the distributor's **service area** and unreserved inside it (`docs/adr/0002-…`, `docs/adr/0006-…`). **PO Master, Open Order Backlog, and SKU Demand vs Supply were removed (July 2026).**

## Production Planning (ticket #278, map #248)
An **admin-only** tab (`productionPlanning` on `ADMIN_ONLY_TABS`, beside `reports` — #275). Stage 1 is
the **planning master**: one row per region × size × thickness band, 471 rows (South 236, West 235),
seeded from the user's table on #249 (`src/data/planningMaster.js`, expanded by `planningMaster` in
`calc.js`). Columns: Section · Size · Thk · Type (Buffer / MTO) · Buffer (MT) · *Can be made at* (one
tick per plant **of the row's region only**) · *Stock now* (`72.4 · Hyd 50.1 · Lep 22.3`). One pure
builder, `planningMasterView`, makes every figure; see `docs/ALGORITHMS.md`. Like Masters it ignores
the header plant selector — a region's plan spans its plants. It takes the raw stores
(`resolvedProductions`, as the Dashboard, and the raw `orders`).

**Edits (ticket #279).** The admin **edits** a row (Type, Buffer, ticks), **adds** one, or **retires**
one (hidden, not deleted; *Show retired* brings it back) — on screen only, no upload. Stored in
`planning_master` and layered over the seed (`docs/DATA-MODEL.md`). A **Check** column carries the
amber `Lepakshi: 20 T ordered, not ticked` note and a red *No plant can make* for a row with no tick.

**Monthly campaign, layout A2 (ticket #280).** The tab now opens on two screens, *Monthly campaign* |
*Planning master*, and starts on the campaign. The admin picks a **region** (South / West) and a **plan
month** (next month, this month, or an earlier month the data covers). One compact sheet, a row per
live master row, grouped SHS · RHS · CHS: Size (once per size group, `·` below, pinned left) · Thk ·
Buffer (MT, or **MTO**) · **Open** · **<last month>** · **<three months>** — headers name the months
(a December plan reads `Nov` and `Sep–Nov`). Hover gives the per-plant split. Quiet rows (no stock, no
sales, no buffer) are left out unless *Hide quiet rows* is unticked. One builder, `planningCampaignView`;
see `docs/ALGORITHMS.md`.

**Indent and Planned (ticket #281).** Two more columns, **Indent** · **Planned**. The admin types the
Monthly Indent; Planned shows the suggestion faintly (`max(Indent, Buffer) − Open` on Buffer rows,
`Indent − Open` on MTO, up to 10 MT) and may be typed over on any row. A typed figure is kept; when the
suggestion later moves the row turns amber with a "use N" button. Saved to `planning_campaigns`, one
row per region per month (`docs/DATA-MODEL.md`).

**Plant (ticket #282).** A ninth column, **Plant**. One ticked plant fills in; two start on last
month's plant (else *Choose…*) and offer *Split…* across them in any tonnage, red until the parts add
up to Planned; no ticked plant is a red *No plant can make* row, never assigned. Only the row's ticked
plants of its own region are offered. An amber dot marks an unticked plant with stock or sales on the
row. A summary line above the sheet: Planned T · T per plant · No plant can make T · rows needing a
plant. See `docs/ALGORITHMS.md`.

**Finalise (ticket #283).** A *Finalise November — South* button on the summary line, per region per
month. It waits until every row with Planned has a plant and every split adds up (a *No plant can
make* row does not hold it back), and jumps to the first row that needs one. Finalise keeps the
figures as the **Baseline** (its own column from then on). The plan stays editable: every change to
Planned or Plant needs a reason and is logged (who, when, old → new); a changed row shows ↺ revised
and the log sits below the sheet. Planned moves only when typed — an Indent edit moves the suggestion
and turns the row amber. No Un-finalise. Stored on the same `planning_campaigns` row
(`docs/DATA-MODEL.md`).

**Week plan, layout D + A (ticket #284).** A third screen, *Monthly campaign* | *Week plan* |
*Planning master*. For a **finalised** region and month: a **region overview** (each plant's W1–W4
tonnes side by side, a Month column equal to the campaign summary's T per plant, a region total) over
one **plant view** (that plant's rows in run order — section, size smallest first, thin → thick — each
whole row in one week column). A split row is in each of its plants with its own part (ˢ). A region not
yet finalised shows a note and no weeks. No capacity check. Built from the campaign by
`planningWeekPlanView`; see `docs/ALGORITHMS.md`.

**Moving and splitting rows (ticket #285).** On the plant view the admin picks a row's week, or
**Split…** to divide it (red until the weeks add up). Saved by `planningWeekSave` into the campaign's
own `lines`, logged in its `changes` with no reason, listed under **Week moves**. The weeks are stored
from Finalise on, so nothing moves by itself. A row's plant never changes on this screen.

**The coil each row needs (ticket #286).** The plant view adds **Strip · Slit · HR · Coil** and one
line per thickness band (need · slit · HR · short · first need-by); the overview adds **Coil short**
per plant. Coil on hand comes from the unscoped `coils` / `baby_coils` stores through `coilOnHand` —
the same list as the Inventory Snapshot's RM half — and is handed out by `planningCoilHandOut`.
Guidance only: it reads, never writes, and never touches Production's coil choice. The A2 sheet is
unchanged.

**Screens in flow order, Monitoring on its own (12-Nov-2026).** The screen tabs now read
*Planning master* · *Monthly campaign* · *Week plan* · *Monitoring* — the order the work runs; the tab
still opens on the Monthly campaign. The three plan screens share one **Region** and **Plan month**
(held by `ProductionPlanningTab`, `usePlanningPick`), so switching screens keeps South · November.
*Week plan* and *Monitoring* are one component, `PlanningWeekPlan`, in two modes over the same
`planningWeekPlanView`: **Week plan** keeps the weeks, moves / splits, coil and Week moves; **Monitoring**
carries everything below (#287, #288) and moves nothing. This reverses #274's "no new screen": the
figures are unchanged, only where they sit. While a region's month is a Draft both show a
**before-Finalise checklist** (Indent typed · Planned · every planned row has a plant · Finalise) from
the campaign's own counts, summary and Finalise state, with a *Go to Monthly campaign* button.

**Step bar (12-Nov-2026).** The screen tabs are a numbered step bar — `1 Planning master → 2 Monthly
campaign → 🔒/✓ → 3 Week plan → 4 Monitoring` — each step with its state as a figure for the picked
region and month (`236 rows · 41 no plant`, `2,880 T · 52 to assign` / `final`, `4 weeks` / `locked`,
`1% made · 650 T behind`). Region and Plan month sit once, on the bar's right; `ProductionPlanningTab`
builds `planningCampaignView` and `planningWeekPlanView` once and hands them to the screens, so the bar
and the screen read the same figures. A locked step shows `🔒 Finalise West · November first`, three
figures and a *Monthly campaign →* button. Empty logs (Week moves, Changes since Finalise) are not drawn.

**Monitoring: plan against actual (ticket #287).** On the Monitoring screen (it sat on the Week plan until 12-Nov-2026). The overview's closed weeks read
*plan / made* (red when the plant's week is short by more than 10 %, min 1 T) and gain **Made · % ·
Behind · Off plan**; each plant row gains **Made · % · Status** (amber, never red) and its Baseline
beside T; under the plant heading, *Baseline = made + plan changed + behind + still to come*, and a
**Made off plan** list below the table. All from `planningWeekPlanView`'s `monitor`; reads only.

## The Dashboard's Plant-wise Tracker (ticket #174)
A section on the **Dashboard** (since #303 its own **Plant-wise Tracker** screen tab): one grid, a **TOTAL** block then
the four plants in plant-master order, ten KPI sub-rows each, columns running **MTD first then the
days of the month newest to oldest** (the current month stops at today, a past month runs to its last
day). Every figure comes from **one pure function**, `plantTrackerGrid` in `calc.js`; the component
and the CSV export read the structure it returns and perform **no arithmetic**. See
`docs/ALGORITHMS.md` for the replay and the reconciliation identities, `docs/UI-PATTERNS.md` for the
grid itself, and `docs/adr/0011-*` / `docs/adr/0012-*` for the two decisions worth not re-litigating.

**It is the one block on the Dashboard that ignores the header plant selector**, because a plant
comparison scoped to one plant is not a comparison. It therefore takes the **unfiltered** stores
alongside the filtered ones the rest of the screen uses, under deliberately distinct names —
`trackerCoils`, `trackerBabyCoils`, `trackerProductions`, `trackerDispatches` — so no existing block
can read one by accident. A short line under the grid states that it covers all plants regardless of
the header, so the contradiction is explained rather than discovered.

**Ignoring the header is not ignoring the login.** `InventoryApp` passes those props the RAW stores
for an **admin** and the already-pinned `plantCoils`/`plantBabyCoils`/`plantProductions`/
`plantDispatches` for a **plant user**, plus `trackerPlant` (null, or their plant id) which collapses
the grid to their one block and drops TOTAL — a total that is one plant's numbers repeated is noise.
Both halves are driven by the same `access.plantSelector`, so nothing is widened: another plant's
tonnage never reaches the page at all, which `e2e/roles.spec.js` asserts against an admin control.

## The Dispatch tab's Scoreboard (ticket #232, part 1)
Above the unchanged Dispatch Records table: a **plant table** (four plants + Total), **Pending to
Dispatch by service area** tiles with a reconciliation line, and **Short** beside **Distributors**.
One pure builder, `dispatchOverview` in `calc.js`; see `docs/ALGORITHMS.md`. The plant table is a
comparison block and follows the Plant-wise Tracker's rule exactly: `InventoryApp` passes
`trackerOrders`/`trackerDispatches` (raw for an admin, pinned for a plant login) and `trackerPlant`,
which collapses it to one row with no Total. Every other block reads the header-scoped stores.
`buildPlantMtdSummary` and `buildServableSummary` moved into `calc.js` for it, so the Dispatch tab
does not pull the lazy `reports` chunk into the main bundle; `reports.js` re-exports both.

## The Dashboard's Inventory overview (ticket #232, part 2)
The Dashboard opens on **Inventory**: a From / To bar (1st of the month → today), **Stock as of To**
(four plants + Total), **Stock movement From → To**, an in-page **plant drill panel** (2b grid, 2c
coil > 30 d, 2d slit waiting, 2e FG ageing, 2g SKU cover) and a **month-end trend**. Every section
that was on the Dashboard before is kept, unchanged, inside one **More** area, collapsed by default.
**Since #303 (design A) the Dashboard is five screen tabs** — Overview · Plant drill · Stock movement ·
Plant-wise Tracker · Sales & activity — with one header (Region switch, Period, one **Export** menu
for the seven CSV buttons it replaced). The More area is gone: its sections are the last two tabs. Layout only; the
region switch's total is `inventoryRegionStock`, the same sum as the All total (`docs/UI-PATTERNS.md`).
One pure builder, `inventoryOverview` in `calc.js`; see `docs/ALGORITHMS.md`. The stock table and the
movement are comparison blocks and follow the Plant-wise Tracker's rule exactly (`tracker*` stores
and `trackerPlant`, under the same `access.plantSelector`); the drill panel and the trend read the
header-scoped stores. The movement does not replay anything itself: it sums `trackerEvents`, the
event list `plantTrackerGrid` is now built from.

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
| Production Planning | **Yes** | Hidden (#275 — not gated on `manufactures`) |
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
hard-delete another plant's slit coils.

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

**One Reports download ignores the selector on purpose: the Inventory Snapshot** (#213, first cut
#214). It is the plant-wise page management reads in Outlook, and a user decision makes it always
cover all four plants. The Reports tab hands it the same arrays the Plant-wise Tracker gets (raw for
an admin, still pinned for a plant login), it takes no scope options, and when the header is
filtered the tab's banner says this one button still covers all plants. It downloads a
self-contained `.html` file (tables and inline styles, images as base64), not a workbook. A second button, `⬇ Inventory Snapshot (.png)`, rasterises that exact HTML
(`generateInventorySnapshotPng`, via `html-to-image`, 1200 px wide at 1×) for an email that should
show the page as one picture; nothing is recomputed, so the two files cannot disagree. Figures
follow `docs/inventory-dashboard-rules.md`; see `docs/ALGORITHMS.md`.

**The unscoped workbook keeps every total and gains a per-plant split beneath it** (#117 phase 4,
#127). The Dashboard sheet's KPI cards are unchanged — company-wide Pending to Dispatch still reads
2615.441 MT — and a `BY PLANT` block underneath them says where that tonnage actually sits, closed
by an `ALL PLANTS` row that ties back to the cards. Invoiced is labelled **Hyderabad only** wherever
it sits beside multi-plant Pending, because only Hyderabad has ever invoiced: the workbook has always
compared four plants' Pending against one plant's Invoiced, and naming that is the deliverable, not
correcting it. See `docs/ALGORITHMS.md` → *PB MTD workbook — the BY PLANT split*.

`filterByPlant` (`calc.js`) scopes coils/slit coils/productions/orders (anything with a top-level
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
src/lib/calc.js      — pure business logic, incl. the invoice import pipeline (mapInvoiceRow / buildInvoiceDispatches)
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

---
name: pb-mtd-report
description: >-
  Generate the "PB MTD Update" order/invoice report for JSW Pipes & Tubes from
  the latest Supabase data, in one instruction. Fetches live numbers, computes
  only the lines that are relevant + possible for P&T, VERIFIES every figure by a
  second independent method, COMPARES against the previous report snapshot, and
  writes reports/PB-MTD-Update-<date>.md. Trigger phrases: "PB MTD update",
  "PB MTD report", "pipes MTD report", "generate the MTD report".
---

# PB MTD Update report (Pipes & Tubes)

Reproduce the JSW **PB MTD update** layout for this Pipes & Tubes system with **live**
Supabase numbers. This template originates from the JSW rebar/"PB" business — about a
third of its lines have **no analog** in P&T and are deliberately excluded (see
"Excluded lines"). The report leads with only the lines that are **relevant to P&T AND
computable**, and **must** end with a verification block.

## Inputs
- `report_date` — optional, `YYYY-MM-DD`. Default = **today**. Drives D / D-1 / D-2,
  current month, previous month.
- `best_estimate` — optional, monthly target in MT (e.g. `2500`). There is **no forecast
  field in the system**, so this is manual. If omitted, output `Revised Best Estimate`
  and `Daily Run Rate Required` as `⚠️ N/A`. If supplied, compute the run rate.

## Data source
Supabase project **"Pipes and Tubes Inventory System"**, ref **`hztblmccvvarmgxmunrp`**
(query via the Supabase MCP `execute_sql`). If that ref is wrong, resolve it with
`list_projects` by name — do not guess. All weights are **MT (T)**. Numbers are the
plant's own source of truth; do not invent or interpolate.

One exception to "everything via SQL": the **two splits** — region (§2d) and plant (§2e) — come from
`scripts/daily-splits.mjs`, which reads the same database but computes through the app's own tested
helpers. One run emits both, off one read of the book. Region is not a column at all; plant is one,
but the workbook already splits by it and a second implementation here would be a second answer —
see §2d and §2e.

## Source-of-truth alignment (must match the app)
These figures must reproduce the app's own KPIs (`src/lib/calc.js`, `src/lib/reports.js`):
- **Confirmed / Non-confirmed** = `salesKpis()` — Σ `orders.confirmed` / `orders.non_confirmed`
  over non-deleted lines whose `order_status` is **not** `delivered` (`isDeliveredStatus`).
- **Invoiced MTD** = Σ `dispatches.bundle_entries[].weight` for the month through `D` (== `theoretical_weight`).
- **Invoiced MTD (Previous Month)** = the **same day-of-month window** of the prior month
  (e.g. Jun 1..DAY), for a like-for-like pace comparison — **not** the full prior month.
- **Physical Inventory** = the Dashboard **FG Left Inventory** card = **produced − invoiced**, where
  produced is **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), NOT the
  stored `productions.total_weight`. The app does this on every view via `resolveProductionWeights`
  (`App.jsx:2758`) so a corrected master weight flows through. Summing stored `total_weight`
  overstates it whenever the master's `weightPerTube` changed after a production was saved.

## Steps

### 1 — Resolve dates
From `report_date`: `D` = report_date, `D-1`/`D-2` = minus 1/2 **calendar** days,
`DAY` = day-of-month of `D` (e.g. 10), `MONTH` = `YYYY-MM`, `PREV` = previous calendar month.

### 2 — Core metrics (substitute the date literals)
Filters use `deleted IS NOT TRUE` (not `deleted = false`) to match the app's `!deleted`, which also
keeps rows where `deleted` is NULL — so the skill can never diverge from the Dashboard.
```sql
SELECT 'max_order_date' AS metric, max(order_date)::text AS val FROM orders WHERE deleted IS NOT TRUE
UNION ALL SELECT 'max_dispatch_date', max(date_of_dispatch)::text FROM dispatches WHERE deleted IS NOT TRUE
UNION ALL SELECT 'invoiced_mtd',      coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted IS NOT TRUE AND to_char(date_of_dispatch,'YYYY-MM')='{{MONTH}}' AND date_of_dispatch <= '{{D}}'
-- Previous month MTD = same day-of-month window (Jun 1..DAY), NOT the full prior month — a like-for-like pace comparison.
UNION ALL SELECT 'invoiced_prev',     coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted IS NOT TRUE AND to_char(date_of_dispatch,'YYYY-MM')='{{PREV}}' AND extract(day from date_of_dispatch) <= {{DAY}}
UNION ALL SELECT 'dispatch_D',        coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted IS NOT TRUE AND date_of_dispatch='{{D}}'
UNION ALL SELECT 'dispatch_D1',       coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted IS NOT TRUE AND date_of_dispatch='{{D-1}}'
UNION ALL SELECT 'orders_month_intake', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted IS NOT TRUE AND to_char(order_date,'YYYY-MM')='{{MONTH}}'
UNION ALL SELECT 'orders_D',  coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted IS NOT TRUE AND order_date='{{D}}'
UNION ALL SELECT 'orders_D1', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted IS NOT TRUE AND order_date='{{D-1}}'
UNION ALL SELECT 'orders_D2', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted IS NOT TRUE AND order_date='{{D-2}}'
UNION ALL SELECT 'confirmed',     coalesce(round(sum(confirmed)::numeric,1),0)::text     FROM orders WHERE deleted IS NOT TRUE AND lower(trim(coalesce(order_status,'')))<>'delivered'
UNION ALL SELECT 'non_confirmed', coalesce(round(sum(non_confirmed)::numeric,1),0)::text FROM orders WHERE deleted IS NOT TRUE AND lower(trim(coalesce(order_status,'')))<>'delivered';
```

### 2b — Production slices (same live master recompute as §3, so Produced and FG agree)
```sql
WITH prod AS (
  SELECT p.date_of_production dt,
         CASE WHEN s.weight_per_tube > 0 THEN p.tube_count*s.weight_per_tube/1000.0 ELSE p.total_weight END AS w
  FROM productions p LEFT JOIN skus s ON s.sku_code = p.sku_code WHERE p.deleted IS NOT TRUE)
SELECT 'produced_mtd' k, round(coalesce(sum(w) FILTER (WHERE to_char(dt,'YYYY-MM')='{{MONTH}}' AND dt<='{{D}}'),0)::numeric,1)::text v FROM prod
UNION ALL SELECT 'produced_prev', round(coalesce(sum(w) FILTER (WHERE to_char(dt,'YYYY-MM')='{{PREV}}' AND extract(day from dt)<={{DAY}}),0)::numeric,1)::text FROM prod
UNION ALL SELECT 'produced_D',  round(coalesce(sum(w) FILTER (WHERE dt='{{D}}'),0)::numeric,1)::text FROM prod
UNION ALL SELECT 'produced_D1', round(coalesce(sum(w) FILTER (WHERE dt='{{D-1}}'),0)::numeric,1)::text FROM prod
UNION ALL SELECT 'produced_D2', round(coalesce(sum(w) FILTER (WHERE dt='{{D-2}}'),0)::numeric,1)::text FROM prod
UNION ALL SELECT 'max_production_date', max(dt)::text FROM prod;
```
Freshness applies here too: a 0 on a date later than `max_production_date` is "no data loaded yet",
not a stopped mill.

### 2c — RM inventory (raw material — mirrors the Dashboard "Coil" cards)
Reproduces the app's `coil` KPI memo (`App.jsx:1644`). **Full Coil Left** = mother coils with no
baby coil yet (whole, unslit). **Baby Coils Left** = Σ per-baby `weight − consumed`, floored at 0
per coil (the app's `Math.max(0, …)`) — never net the shortfall across coils.
```sql
WITH ab AS (SELECT * FROM baby_coils WHERE deleted IS NOT TRUE),
consumed AS (
  SELECT a->>'babyCoilId' bid, sum((a->>'weight')::numeric) w
  FROM productions p CROSS JOIN LATERAL jsonb_array_elements(coalesce(p.coil_allocations,'[]'::jsonb)) a
  WHERE p.deleted IS NOT TRUE AND coalesce(a->>'babyCoilId','') <> '' GROUP BY 1),
slit AS (SELECT DISTINCT hr_coil_id FROM ab),
c AS (SELECT * FROM coils WHERE deleted IS NOT TRUE)
SELECT 'total_inward' k, round(sum(actual_weight)::numeric,1)::text v FROM c
UNION ALL SELECT 'full_coil_left', round(coalesce(sum(actual_weight) FILTER (WHERE hr_coil_id NOT IN (SELECT hr_coil_id FROM slit)),0)::numeric,1)::text FROM c
UNION ALL SELECT 'baby_left', round((SELECT coalesce(sum(greatest(0, coalesce(ab.weight,0) - coalesce(cs.w,0))),0)
                                     FROM ab LEFT JOIN consumed cs ON cs.bid = ab.baby_coil_id)::numeric,1)::text
UNION ALL SELECT 'baby_total_wt', round(coalesce(sum(weight),0)::numeric,1)::text FROM ab
UNION ALL SELECT 'baby_consumed', round((SELECT coalesce(sum(w),0) FROM consumed)::numeric,1)::text;
```
- **RM Total** = `full_coil_left + baby_left`. Never add FG — different stage, would double-count.
- **Mass-balance check** (§5): `total_inward − full_coil_left` should ≈ `baby_total_wt` (slit
  mothers became baby coils). A gap is slitting loss or an unlinked baby coil.
- **Over-consumption flag** (§5): `baby_left` vs the unfloored `baby_total_wt − baby_consumed`.
  A positive gap = some baby coils consumed beyond their slit weight; report the delta.

### 2d — Region split (Invoiced MTD + Pending to serve, per region)
**Do not write SQL for this.** Region is not a column: attributing tonnage to one means resolving the
distributor's identity (dispatch lines resolve through their **order link** before their own code),
then its state (most recent line wins), then the state's region (with the six-row seed in
`src/data/stateRegions.js` layered **under** the `state_regions` table, which may not even exist).
All four already exist and are tested in `src/lib`. A SQL re-derivation gets a second answer that can
disagree with the Sales tab and the PB MTD workbook — and its failure mode is invisible: a distributor
mis-filed South→West still passes the Σ checks below. See `docs/adr/0003-…`.

Run the script instead — **once**, for both splits:
```bash
node scripts/daily-splits.mjs --date {{D}} --url <project url> --key <anon key>
```
Credentials come from `.env.local` if present; otherwise get them from the Supabase MCP
(`get_project_url` + `get_publishable_keys`). Parse the JSON on **stdout**: `{ date, month,
regionSplit, plantSplit, rows }`. From **`regionSplit`**:

- `regions[]` — `{ region, invoicedMtd, confirmed, nonConfirmed, pending, distributors }`, already in
  the fixed order (the four regions, off-list regions alphabetical, **`Unmapped` last**).
- `totals` — `{ invoicedMtd, confirmed, nonConfirmed, pending }`.
- `checks` — `invoicedTiesToPlant` / `pendingTiesToPlant`. The script exits 1 if either split fails
  its tie-out, so a zero exit already means both add up.
- `diagnostics` — `invoicedAfterD`, `unmappedShareInvoiced`, `unmappedSharePending`,
  `unmappedStates[]`, `multiStateDistributors`, `multiStateTonnage`.

#### If the fetch is blocked (`403 … Host not in allowlist`)
A remote agent session's egress policy often blocks `hztblmccvvarmgxmunrp.supabase.co`. **Do not
retry and do not route around it** — use the script's `--agg` mode, which exists for exactly this
and is the same mechanism `scripts/servable-orders.mjs` uses. Run this **one** query through the
Supabase MCP `execute_sql`:

```sql
with live_o as (select * from orders where deleted is not true),
open_o as (select * from live_o where lower(trim(coalesce(order_status,''))) <> 'delivered'),
e as (select d.date_of_dispatch dt, be from dispatches d, lateral jsonb_array_elements(d.bundle_entries) be
      where d.deleted is not true)
select json_build_object(
  'orders', (select coalesce(json_agg(json_build_array(
       id, created_at, order_date, order_id, child_order_id, line_id, customer, distributor_code,
       ship_to_state, order_status, confirmed, non_confirmed, plant) order by created_at, id), '[]'::json)
     from live_o),
  'disp', (select coalesce(json_agg(json_build_array(dt, oli, oid, cid, dc, cu, st, pl, w, cnt) order by dt), '[]'::json) from (
       select dt, be->>'orderLineId' oli, be->>'orderId' oid, be->>'childOrderId' cid,
              be->>'distributorCode' dc, be->>'customer' cu, be->>'shipToState' st, be->>'plant' pl,
              round(sum(coalesce((be->>'weight')::numeric,0)),6) w, count(*) cnt
       from e group by 1,2,3,4,5,6,7,8) g),
  'stateRegions', (select coalesce(json_agg(json_build_array(state, region) order by created_at, id), '[]'::json)
     from state_regions where deleted is not true),
  'checks', json_build_object(
     'invoicedMtd', (select round(coalesce(sum(coalesce((be->>'weight')::numeric,0)),0),4) from e
                     where to_char(dt,'YYYY-MM') = '{{MONTH}}' and dt <= '{{D}}'),
     'invoicedAll', (select round(coalesce(sum(coalesce((be->>'weight')::numeric,0)),0),4) from e),
     'confirmed', (select round(coalesce(sum(confirmed),0)::numeric,4) from open_o),
     'nonConfirmed', (select round(coalesce(sum(non_confirmed),0)::numeric,4) from open_o),
     'orderLines', (select count(*) from live_o),
     'dispatchLines', (select count(*) from e))
)::text as bundle;
```

Then:
```bash
node scripts/daily-splits.mjs --date {{D}} --agg .workspace/splits-agg.json
```

**Filter `deleted IS NOT TRUE` — it is not optional, and not only for correctness.** Re-imports
soft-delete heavily: the full `dispatches` table is ~20 MB of JSON, while the **live** rows are
~600 invoice lines. Sizing the payload without the filter makes this look impossible and it is not.

**The result will exceed the MCP output cap, and that is fine** — the harness spills an oversized
result to a file and prints its path. Take the path from that message and extract the bundle
**without ever reading it into context**:
```bash
node -e 'const fs=require("fs");
  const t=JSON.parse(fs.readFileSync(process.argv[1],"utf8")).result;
  const m=t.match(/<untrusted-data-[0-9a-f-]+>\n([\s\S]*?)\n<\/untrusted-data-/);
  fs.writeFileSync(".workspace/splits-agg.json", JSON.parse(m[1])[0].bundle)' <spilled-file-path>
```

What the bundle does and does not aggregate: dispatch entries collapse by a **plain Σ of weight**
over rows sharing a date, identity keys, ship-to state and plant (`cnt` restores the entry count);
orders are carried **verbatim**, because `distributorOrderIndex` resolves dispatch lines through
them and a collapsed order row destroys those links. No identity, state, region or plant rule is
aggregated — all four still run in `src/lib`. The script re-adds the expanded rows and **refuses to
report** if they disagree with the bundle's `checks` block, so a truncated payload fails loudly
rather than under-reporting a smaller, perfectly self-consistent book.

Notes that must survive into the report:
- **Region basis:** a distributor belongs to **one** region — its most recent line's state — exactly
  as the workbook's *Distributor by Region* sheet does. Its whole book sits there, even if it ships
  to several states.
- **Tonnage is day-capped at `D`; region assignment is not.** That is deliberate: the tonnage has to
  tie to `invoiced_mtd`, the assignment has to tie to the workbook. `diagnostics.invoicedAfterD` names
  any in-month tonnage dated after `D` that this excludes.
- **`Unmapped` keeps its tonnage.** It is a real block, never a bucket to filter out of a sum — an
  unmapped state is a labelling gap, not missing weight.
- Only **Invoiced MTD** and **Pending to serve** split by region. Production, RM and Physical
  Inventory carry no ship-to state; never invent a regional figure for them.

### 2e — Plant split (Invoiced MTD + Pending to serve, per plant)
Same run, same JSON: read **`plantSplit`**. **Do not write SQL for this either**, and do not
re-derive it from `orders.plant` yourself — `buildPlantMtdSummary` is what the PB MTD workbook's
BY PLANT block prints, so calling it is the only way the message and the workbook cannot disagree.

- `plants[]` — `{ plant, name, invoicedMtd, confirmed, nonConfirmed, pending, totalOrders,
  orderLines, invoiceLines }`, in master order (Hyderabad, NPMD, Lepakshi, Tapi) with
  **`Unattributed` last**. Only plants actually present get a row.
- `totals` — the All Plants figures the rows partition.
- `invoicing` — `{ plants[], onlyPlant, label, suffix, note }`. **Derived from the rows, never
  hardcoded**: today `suffix` is `· Hyderabad only` and `note` is the sentence explaining it. The day
  NPMD raises its first invoice, all of it changes by itself. An empty `suffix` means every plant
  with orders has also invoiced — say nothing.
- `checks` — `invoicedTiesToAllPlants` / `pendingTiesToAllPlants` (checks 7 and 8 below).
- `diagnostics` — `ordersWithoutInvoice[]`, `unattributedPending`, `unattributedInvoiced`,
  `plantsPresent`.

Notes that must survive into the report:
- **Two sources, both the ERP's own Ship From Code, neither typed.** Pending comes from the **order
  row's** plant; Invoiced from the **dispatch entry's** (`dispatches` has no plant column — one
  invoice could carry two plants' lines).
- **Nothing moves.** The All Plants figures are the same ones §2 reports; the per-plant rows are a
  partition of them, never a replacement. Scoping the report to Hyderabad would drop Pending by
  ~1854 MT overnight with nothing changed in the business.
- **Invoiced is labelled with `invoicing.suffix` wherever it sits beside multi-plant Pending**, the
  same rule and the same string the workbook uses. In this report that is three lines:
  `Invoiced Orders MTD`, `Invoiced MTD - {Region}` (its regions' pending is every plant's) and
  `Invoiced MTD by Plant`. Not `Dispatch D-1` / `Dispatch D Day` — single days with no pending beside
  them — and nothing in Production, RM or Physical Inventory. The report compares four plants' Pending
  against one plant's Invoiced — that is the ERP's shape, not an error, and the label is what stops a
  reader taking the ratio at face value.
- **`Unattributed` keeps its tonnage**, exactly as `Unmapped` does. A Ship From Code nobody has
  mapped is a labelling gap, never a fifth plant and never a reason for weight to leave a total.
- Only **Invoiced MTD** and **Pending to serve** split by plant here. Production, RM and Physical
  Inventory are pipeline figures — do not split them in this report.

### 3 — Physical inventory (finished pipe stock = Dashboard FG Left Inventory)
Produced is **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), mirroring
the app's `resolveProductionWeights`. Do NOT sum the stored `total_weight` — it overstates produced
whenever a master weight was edited after save (here by ~128 T). The CASE below is the passthrough
`resolveProductionWeights` uses when a SKU is unmatched or its master weight is null/0.
```sql
WITH prod_resolved AS (
  SELECT CASE WHEN s.weight_per_tube > 0
              THEN p.tube_count * s.weight_per_tube/1000.0
              ELSE p.total_weight END AS w
  FROM productions p LEFT JOIN skus s ON s.sku_code = p.sku_code
  WHERE p.deleted IS NOT TRUE
),
disp AS (
  SELECT sum((be->>'weight')::numeric) AS w
  FROM dispatches d CROSS JOIN LATERAL jsonb_array_elements(d.bundle_entries) be
  WHERE d.deleted IS NOT TRUE
)
SELECT
  round((SELECT sum(w) FROM prod_resolved)::numeric,1)                            AS produced_live,
  round((SELECT w FROM disp)::numeric,1)                                          AS invoiced,
  round(((SELECT sum(w) FROM prod_resolved) - (SELECT w FROM disp))::numeric,1)   AS phys_inventory;
```
Data-hygiene note: report `Σ stored total_weight − Σ live-recompute` — a large delta means many
master `weightPerTube` values were changed after production save (the app heals this at read time).

### 4 — Derived
- **Total Orders** = `invoiced_mtd + confirmed + non_confirmed` (app "Total Orders" KPI).
- **Daily Run Rate Required** (only if `best_estimate` given) =
  `(best_estimate − invoiced_mtd) / days_remaining`, where `days_remaining` =
  `(last calendar day of MONTH) − report_date` inclusive of remaining days.
  Note in output: **calendar** days, not working days (no holiday/Sunday calendar exists).
- **Pending to Serve (per region)** = `confirmed + non_confirmed` for that region, straight off
  §2d's `regions[].pending`. Same definition as the workbook's `PENDING TO SERVE (MT)` card
  (`Conf + Non-Conf`). Note the two time windows it blends: Invoiced MTD is this month, Confirmed /
  Non-confirmed are an all-time snapshot of undelivered orders — so a region can show a large pending
  against a small invoiced without anything having gone wrong this month.

### 5 — VERIFY (mandatory — never skip)
Run these independent cross-checks and render a **Verification** table (metric ·
method A · method B · verdict). Report **PASS/FAIL** and surface every flag:
```sql
-- Invoiced dual-method (day-capped slices): line-sum must equal theoretical_weight for each
WITH lines AS (SELECT d.date_of_dispatch dt, (e->>'weight')::numeric w
  FROM dispatches d CROSS JOIN LATERAL jsonb_array_elements(d.bundle_entries) e WHERE d.deleted IS NOT TRUE)
SELECT
  round(sum(w) FILTER (WHERE to_char(dt,'YYYY-MM')='{{MONTH}}' AND dt <= '{{D}}')::numeric,3)                   AS cur_lines,
  round(sum(w) FILTER (WHERE to_char(dt,'YYYY-MM')='{{PREV}}' AND extract(day from dt) <= {{DAY}})::numeric,3)  AS prev_lines
FROM lines;
-- Confirmed dual-method: stored bucket vs ERP formula (Release - Invoiced)
SELECT round(sum(confirmed)::numeric,3) stored, round(sum(release_qty-invoiced_qty)::numeric,3) derived
  FROM orders WHERE deleted IS NOT TRUE AND lower(trim(coalesce(order_status,'')))<>'delivered';
```
Checks that MUST hold (else FAIL and flag):
1. **Invoiced dual-method** — `cur_lines` == `invoiced_mtd` and `prev_lines` == `invoiced_prev` (diff ≤ 0.01).
2. **Partition** — `Σ daily dispatch in MONTH up to D` == `invoiced_mtd`; `Σ daily orders in MONTH` == `orders_month_intake`.
3. **Arithmetic** — `Total Orders` == `invoiced_mtd + confirmed + non_confirmed`.
4. **Freshness** — report `max_order_date` / `max_dispatch_date`; if a `D`/`D-1` value is 0 **and** that date is after the max, label it "no data loaded yet" (not zero activity).
5. **Region partition — invoiced** — `Σ regions[].invoicedMtd` (§2d, computed in JS from raw rows) == `invoiced_mtd` (§2, aggregated in Postgres). Diff ≤ 0.01.
6. **Region partition — pending** — `Σ regions[].pending` (§2d) == `confirmed + non_confirmed` (§2). Diff ≤ 0.01.

7. **Plant partition — invoiced** — `Σ plantSplit.plants[].invoicedMtd` (§2e) == `invoiced_mtd` (§2). Diff ≤ 0.01.
8. **Plant partition — pending** — `Σ plantSplit.plants[].pending` (§2e) == `confirmed + non_confirmed` (§2). Diff ≤ 0.01.

Checks 5–8 are genuinely dual-method — one side counts rows in JS through the app's helpers, the
other aggregates in Postgres — so neither can quietly adopt the other's bug. The script already
asserts all four and exits non-zero on failure; re-render them in the table so the report shows its
own work. Note what they cannot see: a Σ check passes just as happily when a distributor is filed in
the wrong region or a line under the wrong plant. They prove the split is a partition, not that it
is attributed correctly — which is why neither is re-derived here.

Advisory flags (report, do not fail):
- **Post-`D` dispatch** — `diagnostics.invoicedAfterD`. Non-zero means the region split (day-capped)
  and the workbook's *Distributor by Region* sheet (not day-capped) differ by exactly that tonnage.
  Name it rather than letting the two reports disagree silently.
- **Unmapped share** — `unmappedShareInvoiced` / `unmappedSharePending`. Above 20%, list the top
  `unmappedStates` by tonnage and say plainly that it is a labelling gap, not missing tonnage: those
  states need mapping on the Sales tab.
- **Plants with orders and no invoices** — `plantSplit.diagnostics.ordersWithoutInvoice`. Expected
  today (only Hyderabad has ever invoiced) and reported rather than flagged as a fault; it is the
  four-against-one comparison, named.
- **Unattributed tonnage** — `plantSplit.diagnostics.unattributedPending` / `unattributedInvoiced`.
  Non-zero means the ERP sent a Ship From Code the plant master does not carry: a labelling gap to
  fix, never tonnage to filter out.
- **Multi-state distributors** — `multiStateDistributors` / `multiStateTonnage`. Their whole book sits
  in one region by design; above 5% of the total, say how much tonnage that moved.
- **Confirmed variance** — `confirmed(stored)` vs `release−invoiced`; if they differ, note the delta. The report uses the **stored** bucket (app-consistent).
- **FG reconciliation** — `phys_inventory` == Dashboard FG Left Inventory (produced *live-recompute* − invoiced). It uses live master weights, NOT stored `total_weight`; report the stored-vs-live delta as a data-hygiene signal (master weight edited post-save).

### 6 — COMPARE against previous snapshot
Find the most recent `reports/PB-MTD-Update-*.md` (before this run), parse its values, and
render a **Change vs last report** table (per line: previous → current → Δ). If none exists,
say so.

### 7 — Emit
Write `reports/PB-MTD-Update-{{D}}.md` with: the report block (exact format below), the
Verification table, and the Change-vs-last table. Also print the report block in chat.

## Report block (exact format — tab-separated, `--->` then value + `T`)
```
PB MTD update as on --->	{{D}}
Revised Best Estimate --->	{best_estimate}T        (omit line's value → ⚠️ N/A if not supplied)
Total Orders --->	{total_orders}T
Current Month Orders --->	{orders_month_intake}T
Invoiced Orders MTD{invoicing_suffix} --->	{invoiced_mtd}T
Invoiced MTD (Previous Month) --->	{invoiced_prev}T
Dispatch D-1 (Current Month) --->	{dispatch_D1}T
Dispatch D Day --->	{dispatch_D}T
Confirmed Orders Pending to be Invoiced --->	{confirmed}T
Non-Confirmed Orders --->	{non_confirmed}T
Daily Run Rate Required --->	{run_rate}T       (⚠️ N/A if no best_estimate)
Physical Inventory --->	{phys_inventory}T
RM Full Coil Left --->	{full_coil_left}T
RM Baby Coil Left --->	{baby_left}T
RM Total --->	{rm_total}T
	
Invoiced MTD{invoicing_suffix} - {Region} --->	{region_invoiced}T   (one line per region, fixed order, Unmapped last)
Invoiced MTD{invoicing_suffix} - All Regions --->	{invoiced_mtd}T
	
Pending to Serve - {Region} --->	{region_pending}T     (same regions, same order)
Pending to Serve - All Regions --->	{pending}T
	
Invoiced MTD by Plant{invoicing_suffix} - {Plant} --->	{plant_invoiced}T   (one line per plant present, master order, Unattributed last)
Invoiced MTD by Plant{invoicing_suffix} - All Plants --->	{invoiced_mtd}T
	
Pending to Serve by Plant - {Plant} --->	{plant_pending}T  (same plants, same order)
Pending to Serve by Plant - All Plants --->	{pending}T
	
Produced MTD --->	{produced_mtd}T
Produced MTD (Previous Month) --->	{produced_prev}T
Production D-1 --->	{produced_D1}T
Production D Day --->	{produced_D}T
	
Orders Logged D Day --->	{orders_D}T
Orders Logged D-1 --->	{orders_D1}T
Orders Logged D-2 --->	{orders_D2}T
```

Region lines, worked example (2026-08-18 live data):
```
Invoiced MTD · Hyderabad only - South --->	463.5T
Invoiced MTD · Hyderabad only - West --->	0T
Invoiced MTD · Hyderabad only - All Regions --->	463.5T
	
Pending to Serve - South --->	1115.0T
Pending to Serve - West --->	1397.0T
Pending to Serve - All Regions --->	2512.0T
```
- Only regions actually present in the data get a line. With today's six-state seed that is normally
  South and West; North and East are **absent**, not zero.
- The `All Regions` lines duplicate `Invoiced Orders MTD` and `Confirmed + Non-Confirmed` on purpose —
  they put checks 5 and 6 on the face of the report.
- Values are rounded at print only, so the region lines can look 0.1 T off their own total. The exact
  values tie; never round before summing.

Plant lines, worked example (the #117 figures off the 18-Aug-2026 file):
```
Invoiced MTD by Plant · Hyderabad only - Hyderabad --->	463.5T
Invoiced MTD by Plant · Hyderabad only - All Plants --->	463.5T
	
Pending to Serve by Plant - Hyderabad --->	761.4T
Pending to Serve by Plant - NPMD --->	1044.0T
Pending to Serve by Plant - Lepakshi --->	417.0T
Pending to Serve by Plant - Tapi --->	393.0T
Pending to Serve by Plant - All Plants --->	2615.4T
```
- Add `invoicing.note` as a line beneath the Invoiced-by-Plant block whenever `invoicing.suffix` is
  non-empty. Three plants carrying orders and no invoices is the ERP's shape; unexplained, it reads
  as missing data.
- Same rounding rule as the regions, and the same `All Plants` duplication — it puts checks 7 and 8
  on the face of the report.

## Excluded lines (keep excluded — reason on request)
- **Retail / Distributor Through Project / Project Orders** (order & invoiced splits) —
  🚫 not relevant: `orders` has **no order-category dimension** (no such column in the schema).
- **Invoiced MTD-FE 550 / FE 550D - LRF**, **Physical Inventory · FE 550 / FE 550D** —
  🚫 not relevant: FE 550/550D are **TMT rebar** grades. P&T `coils.coil_grade` holds
  **IS 10748** HR-coil variants; finished pipe carries no grade at all.
- **Carry-forward Orders** — ⚠️ not tracked (prior-month open-book proxy computes to ~0).
- **SFDC Orders** — ⚠️ no SFDC flag; `distributor_code` values ARE Salesforce IDs, so all
  orders are effectively SFDC — no separable subset.

## Guardrails
- Never fabricate the excluded lines' numbers. If asked to include them, explain the missing
  field/dimension first.
- Keep decimals to 1 place for weights (Physical Inventory to whole T). `0T` stays `0T`.
- If a query errors or a check FAILs, stop and report it — do not emit a report with
  unverified numbers.
- **Never hand-roll either split in SQL.** The app's helpers are the only source that cannot
  disagree with the PB MTD workbook, and the Σ checks cannot catch a mis-attribution. A blocked
  fetch is **not** a reason to fall back to N/A — use `--agg` above first. Only if the script still
  will not run, emit the region lines as
  `⚠️ N/A (region split unavailable: <reason>)` and the plant lines as
  `⚠️ N/A (plant split unavailable: <reason>)`, and say so — an absent split beats a plausible
  wrong one.
- Never split Production, RM or Physical Inventory by region **or by plant** — the first two carry no
  ship-to state, and all three are pipeline figures this report does not break down.
- **Never scope this report to one plant.** The All Plants totals are the headline and do not move;
  the split explains them. A per-plant edition of the workbook is explicitly out of scope (#117).

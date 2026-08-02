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
c AS (SELECT * FROM coils WHERE deleted IS NOT TRUE)
SELECT 'total_inward' k, round(sum(actual_weight)::numeric,1)::text v FROM c
-- NOT EXISTS, never NOT IN: a single NULL hr_coil_id in baby_coils makes `NOT IN` return
-- no rows at all, silently reporting Full Coil Left as 0 T. Verified — do not "simplify" this.
UNION ALL SELECT 'full_coil_left', round(coalesce((SELECT sum(c2.actual_weight) FROM c c2
    WHERE NOT EXISTS (SELECT 1 FROM ab WHERE ab.hr_coil_id = c2.hr_coil_id)),0)::numeric,1)::text
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
Advisory flags (report, do not fail):
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
Invoiced Orders MTD --->	{invoiced_mtd}T
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
	
Produced MTD --->	{produced_mtd}T
Produced MTD (Previous Month) --->	{produced_prev}T
Production D-1 --->	{produced_D1}T
Production D Day --->	{produced_D}T
	
Orders Logged D Day --->	{orders_D}T
Orders Logged D-1 --->	{orders_D1}T
Orders Logged D-2 --->	{orders_D2}T
```

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
- **Anti-joins use `NOT EXISTS`, never `NOT IN`.** One NULL in the subquery column makes `NOT IN`
  match nothing and the figure silently reports 0 T. Applies to Full Coil Left and any future
  "X with no Y" line.
- **A dated report is a snapshot, not a derivation.** Re-running an old `report_date` after a late
  Excel load gives different MTD numbers (verified: replaying 2026-07-28 on 2026-08-02 moved
  Invoiced MTD 663.0 → 751.6 T). Never rewrite a past report file to "fix" it — note the drift in
  the Change-vs-last table instead. Closed prior months are stable and make a good control.
- **Rounding:** round once, at print. Summing already-rounded parts can shift a total by 0.1 T
  against the app, which rounds the total (`fmtT` = `toFixed(1)`) only for display.
- Never fabricate the excluded lines' numbers. If asked to include them, explain the missing
  field/dimension first.
- Keep decimals to 1 place for weights (Physical Inventory to whole T). `0T` stays `0T`.
- If a query errors or a check FAILs, stop and report it — do not emit a report with
  unverified numbers.

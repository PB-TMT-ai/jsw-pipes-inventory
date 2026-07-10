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
- **Invoiced MTD** = Σ `dispatches.bundle_entries[].weight` for the month (== `theoretical_weight`).
- **Physical Inventory** = finished pipe stock = per-SKU `max(0, produced − invoiced)`
  (`producedPool` / `buildFinishedStockData`, floored at 0).

## Steps

### 1 — Resolve dates
From `report_date`: `D` = report_date, `D-1`/`D-2` = minus 1/2 **calendar** days,
`MONTH` = `YYYY-MM`, `PREV` = previous calendar month.

### 2 — Core metrics (substitute the date literals)
```sql
SELECT 'max_order_date' AS metric, max(order_date)::text AS val FROM orders WHERE deleted=false
UNION ALL SELECT 'max_dispatch_date', max(date_of_dispatch)::text FROM dispatches WHERE deleted=false
UNION ALL SELECT 'invoiced_mtd',      coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted=false AND to_char(date_of_dispatch,'YYYY-MM')='{{MONTH}}'
UNION ALL SELECT 'invoiced_prev',     coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted=false AND to_char(date_of_dispatch,'YYYY-MM')='{{PREV}}'
UNION ALL SELECT 'dispatch_D',        coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted=false AND date_of_dispatch='{{D}}'
UNION ALL SELECT 'dispatch_D1',       coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted=false AND date_of_dispatch='{{D-1}}'
UNION ALL SELECT 'orders_month_intake', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted=false AND to_char(order_date,'YYYY-MM')='{{MONTH}}'
UNION ALL SELECT 'orders_D',  coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted=false AND order_date='{{D}}'
UNION ALL SELECT 'orders_D1', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted=false AND order_date='{{D-1}}'
UNION ALL SELECT 'orders_D2', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted=false AND order_date='{{D-2}}'
UNION ALL SELECT 'confirmed',     coalesce(round(sum(confirmed)::numeric,1),0)::text     FROM orders WHERE deleted=false AND lower(trim(coalesce(order_status,'')))<>'delivered'
UNION ALL SELECT 'non_confirmed', coalesce(round(sum(non_confirmed)::numeric,1),0)::text FROM orders WHERE deleted=false AND lower(trim(coalesce(order_status,'')))<>'delivered';
```

### 3 — Physical inventory (floored, per SKU)
```sql
WITH prod AS (SELECT sku_code, sum(total_weight) w FROM productions WHERE deleted=false GROUP BY sku_code),
disp AS (SELECT be->>'skuCode' AS sku_code, sum((be->>'weight')::numeric) w
         FROM dispatches d CROSS JOIN LATERAL jsonb_array_elements(d.bundle_entries) be
         WHERE d.deleted=false GROUP BY 1)
SELECT round(sum(greatest(0, coalesce(p.w,0)-coalesce(dp.w,0)))::numeric,0) AS phys_inventory,
       round(sum(coalesce(p.w,0)-coalesce(dp.w,0))::numeric,0)              AS fg_net_unfloored,
       count(*) FILTER (WHERE coalesce(p.w,0)-coalesce(dp.w,0) < -0.0005)    AS oversold_skus
FROM prod p FULL OUTER JOIN disp dp USING (sku_code);
```

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
-- Invoiced dual-method: line-sum vs theoretical_weight (must be ~0 diff)
WITH lines AS (SELECT to_char(d.date_of_dispatch,'YYYY-MM') ym, (e->>'weight')::numeric w
  FROM dispatches d CROSS JOIN LATERAL jsonb_array_elements(d.bundle_entries) e WHERE d.deleted=false)
SELECT ym, round(sum(w)::numeric,3) method_a FROM lines WHERE ym IN ('{{MONTH}}','{{PREV}}') GROUP BY ym;
-- Confirmed dual-method: stored bucket vs ERP formula (Release - Invoiced)
SELECT round(sum(confirmed)::numeric,3) stored, round(sum(release_qty-invoiced_qty)::numeric,3) derived
  FROM orders WHERE deleted=false AND lower(trim(coalesce(order_status,'')))<>'delivered';
```
Checks that MUST hold (else FAIL and flag):
1. **Invoiced dual-method** — `Σ line weights` == `Σ theoretical_weight` for MONTH and PREV (diff ≤ 0.01).
2. **Partition** — `Σ daily dispatch in MONTH` == `invoiced_mtd`; `Σ daily orders in MONTH` == `orders_month_intake`.
3. **Arithmetic** — `Total Orders` == `invoiced_mtd + confirmed + non_confirmed`.
4. **Freshness** — report `max_order_date` / `max_dispatch_date`; if a `D`/`D-1` value is 0 **and** that date is after the max, label it "no data loaded yet" (not zero activity).
Advisory flags (report, do not fail):
- **Confirmed variance** — `confirmed(stored)` vs `release−invoiced`; if they differ, note the delta. The report uses the **stored** bucket (app-consistent).
- **Oversold SKUs** — `oversold_skus` count and `fg_net_unfloored`; the report uses the **floored** figure (app-consistent).

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
- Never fabricate the excluded lines' numbers. If asked to include them, explain the missing
  field/dimension first.
- Keep decimals to 1 place for weights (Physical Inventory to whole T). `0T` stays `0T`.
- If a query errors or a check FAILs, stop and report it — do not emit a report with
  unverified numbers.

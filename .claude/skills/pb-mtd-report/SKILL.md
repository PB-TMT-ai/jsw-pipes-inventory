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
- **Physical Inventory** = finished pipe stock = **total produced − total invoiced** (plant-level
  net; `producedPool` nets and does NOT floor). Not floored per SKU — production logs short SKU
  codes (`SHS-75x75x2.00`) while dispatch logs ERP MM codes/descriptions, so per-SKU flooring
  over-counts already-shipped pipe.

## Steps

### 1 — Resolve dates
From `report_date`: `D` = report_date, `D-1`/`D-2` = minus 1/2 **calendar** days,
`DAY` = day-of-month of `D` (e.g. 10), `MONTH` = `YYYY-MM`, `PREV` = previous calendar month.

### 2 — Core metrics (substitute the date literals)
```sql
SELECT 'max_order_date' AS metric, max(order_date)::text AS val FROM orders WHERE deleted=false
UNION ALL SELECT 'max_dispatch_date', max(date_of_dispatch)::text FROM dispatches WHERE deleted=false
UNION ALL SELECT 'invoiced_mtd',      coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted=false AND to_char(date_of_dispatch,'YYYY-MM')='{{MONTH}}' AND date_of_dispatch <= '{{D}}'
-- Previous month MTD = same day-of-month window (Jun 1..DAY), NOT the full prior month — a like-for-like pace comparison.
UNION ALL SELECT 'invoiced_prev',     coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted=false AND to_char(date_of_dispatch,'YYYY-MM')='{{PREV}}' AND extract(day from date_of_dispatch) <= {{DAY}}
UNION ALL SELECT 'dispatch_D',        coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted=false AND date_of_dispatch='{{D}}'
UNION ALL SELECT 'dispatch_D1',       coalesce(round(sum(theoretical_weight)::numeric,1),0)::text FROM dispatches WHERE deleted=false AND date_of_dispatch='{{D-1}}'
UNION ALL SELECT 'orders_month_intake', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted=false AND to_char(order_date,'YYYY-MM')='{{MONTH}}'
UNION ALL SELECT 'orders_D',  coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted=false AND order_date='{{D}}'
UNION ALL SELECT 'orders_D1', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted=false AND order_date='{{D-1}}'
UNION ALL SELECT 'orders_D2', coalesce(round(sum(quantity)::numeric,1),0)::text FROM orders WHERE deleted=false AND order_date='{{D-2}}'
UNION ALL SELECT 'confirmed',     coalesce(round(sum(confirmed)::numeric,1),0)::text     FROM orders WHERE deleted=false AND lower(trim(coalesce(order_status,'')))<>'delivered'
UNION ALL SELECT 'non_confirmed', coalesce(round(sum(non_confirmed)::numeric,1),0)::text FROM orders WHERE deleted=false AND lower(trim(coalesce(order_status,'')))<>'delivered';
```

### 3 — Physical inventory (finished pipe stock = plant-level net)
Finished pipe on hand is a **tonnage** KPI: total produced − total invoiced, netted at the plant
level. **Do NOT floor per SKU** — production logs short SKU codes while dispatch logs ERP MM
codes/descriptions, so per-SKU flooring double-counts already-shipped pipe (it created 17 false
"oversold" SKUs, +~89 T). The plant-level net is SKU-code-agnostic and correct.
```sql
SELECT
  round((SELECT sum(total_weight) FROM productions WHERE deleted=false)::numeric,1) AS total_produced,
  round((SELECT sum((be->>'weight')::numeric)
         FROM dispatches d CROSS JOIN LATERAL jsonb_array_elements(d.bundle_entries) be
         WHERE d.deleted=false)::numeric,1)                                          AS total_invoiced,
  round(((SELECT sum(total_weight) FROM productions WHERE deleted=false)
       - (SELECT sum((be->>'weight')::numeric)
          FROM dispatches d CROSS JOIN LATERAL jsonb_array_elements(d.bundle_entries) be
          WHERE d.deleted=false))::numeric,0)                                        AS phys_inventory;
```
Advisory (optional data-hygiene check): count production `sku_code`s with no matching dispatch
`skuCode` and vice-versa; a growing gap means the SKU master needs deduping (short code vs MM code).

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
  FROM dispatches d CROSS JOIN LATERAL jsonb_array_elements(d.bundle_entries) e WHERE d.deleted=false)
SELECT
  round(sum(w) FILTER (WHERE to_char(dt,'YYYY-MM')='{{MONTH}}' AND dt <= '{{D}}')::numeric,3)                   AS cur_lines,
  round(sum(w) FILTER (WHERE to_char(dt,'YYYY-MM')='{{PREV}}' AND extract(day from dt) <= {{DAY}})::numeric,3)  AS prev_lines
FROM lines;
-- Confirmed dual-method: stored bucket vs ERP formula (Release - Invoiced)
SELECT round(sum(confirmed)::numeric,3) stored, round(sum(release_qty-invoiced_qty)::numeric,3) derived
  FROM orders WHERE deleted=false AND lower(trim(coalesce(order_status,'')))<>'delivered';
```
Checks that MUST hold (else FAIL and flag):
1. **Invoiced dual-method** — `cur_lines` == `invoiced_mtd` and `prev_lines` == `invoiced_prev` (diff ≤ 0.01).
2. **Partition** — `Σ daily dispatch in MONTH up to D` == `invoiced_mtd`; `Σ daily orders in MONTH` == `orders_month_intake`.
3. **Arithmetic** — `Total Orders` == `invoiced_mtd + confirmed + non_confirmed`.
4. **Freshness** — report `max_order_date` / `max_dispatch_date`; if a `D`/`D-1` value is 0 **and** that date is after the max, label it "no data loaded yet" (not zero activity).
Advisory flags (report, do not fail):
- **Confirmed variance** — `confirmed(stored)` vs `release−invoiced`; if they differ, note the delta. The report uses the **stored** bucket (app-consistent).
- **FG reconciliation** — `phys_inventory` == `total_produced − total_invoiced` (plant-level net, not per-SKU floored). Flag if SKU-code mismatches (short code vs ERP MM code) are growing.

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

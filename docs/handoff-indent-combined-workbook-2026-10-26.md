# Handoff — combined indent workbook (Truck Load · No Stock · SKU Inventory plant-wise · Ageing) + short mail

**Date:** 26 Oct 2026 · **Repo:** `PB-TMT-ai/jsw-pipes-inventory` · **Branch to start from:** `origin/staging`
(work branch per CLAUDE.md "Deploying"; PRs target `staging`, never `main`).

## 1. What the user wants (verbatim intent)
One Excel workbook with these tabs, for the **South + West indent ("Indent vs Billed")**, data to 25 Oct:

1. **Truck Load**: the 25 MT truck plan (as the `Truck Plan` tab of the indent output).
2. **No Stock**: Qty Left (Indent − Dispatch) in sizes the region's plants hold none of (as the
   `No Stock` tab of the `--split` output).
3. **SKU Inventory, plant-wise**: the PB MTD workbook's sheet *"JSW One Pipes & Tubes — SKUs WITH
   ON-HAND INVENTORY > 2 MT"* (`src/lib/reports.js:1698–1755`, columns: SKU · On-hand MT · 0–30 d ·
   31–60 d · 61–90 d · 90+ d · Oldest (d) · Wtd Avg Age (d)), but split **per plant** (Hyderabad,
   Lepakshi, NPMD, Tapi), with a subtotal per plant.
4. **Ageing**: per-plant ageing summary (on-hand of ALL SKUs, the four buckets, wtd avg age, total row).

Plus a **super-concise email** announcing the workbook (draft text only: the Gmail connector failed to
connect in this environment; nothing is sent).

Interpretation not yet confirmed with the user: tab 3 carries the ageing columns, as in the screenshot, and tab 4 is the
plant-level summary. If the user meant something else for "ageing tab", ask.

## 2. Where things stand
- **Skill is live on `main`** (PB-TMT-ai/jsw-pipes-inventory#210, #212 → #211). It covers 25 MT
  default, header-based layout reading, Billed refill (R14), R15, new R7, `--split` (R16), and 3-decimal
  bundles. Read `blueprints/indent-truck-plan.md` and `docs/indent-plan-rules.md` (R1–R16); don't
  re-derive them here.
- **Already delivered and verified (data-verifier PASS):** `SouthWest_Indent_vs_Billed_Oct26_v2.xlsx`
  (46 trucks, 793.47 MT) and `QtyLeft_Stock_vs_NoStock_Oct26.xlsx`. The combined workbook must reproduce
  those exact Truck Plan and No Stock figures.
- **Not started:** builder changes for the combined workbook. Nothing is uncommitted.

## 3. Inputs the new session needs
- **The indent file**: ask the user to re-upload `SouthWest_Indent_vs_Billed_Oct26_1.xlsx`.
  Scratchpad files from this session do not carry over.
- **Data**: re-pull via the Supabase MCP (project `hztblmccvvarmgxmunrp`; the sandbox cannot reach
  Supabase directly). Use queries 1 and 2 of `scripts/indent-plan.sql`: month_start `2026-10-01`, and
  query 2's IN list covering all 14 customers in `scripts/indent-plan-distributors.json`. Run query 4 (freshness) first.
  The state of the data at handoff was: productions 1656 rows / 629,924 tubes / last created_at
  2026-10-26 04:46:04 UTC; dispatches 404 rows / 9,510.74 MT / last 05:29:17 UTC; last dated rows
  25 Oct. **If those numbers moved, rebuild everything (all 4 tabs) at the new cut-off.** Don't mix
  the 25 Oct truck plan with newer stock.
- **Ageing bundle (new query 5)**: per plant + size, FIFO by weight, as-of = last data date. It was
  validated in this session: 166 rows, 2,664.739 MT. Every row's on-hand matched the floored plant stock
  from the flow bundle to ≤ 0.001 MT, and the buckets summed to on-hand. Add it to `scripts/indent-plan.sql`:

```sql
-- ── 5. AGEING (--ageing): per plant + size, FIFO on weight; on-hand = max(0, made − sent) per plant ──
-- Format: pt|size|thk|plant|onhand|d0_30|d31_60|d61_90|d90plus|oldest_days|wtd_avg_age ; …
with params as (select date '2026-10-25' as as_of),                 -- ← last data date
sku as (select sku_code, max(product_type) pt,
          max(coalesce(nullif(nominal_bore,''), trim(to_char(height,'FM999990.##'))||'x'||trim(to_char(breadth,'FM999990.##')))) size_part,
          max(thickness::numeric) thk, max(nullif(weight_per_tube,0)::numeric)/1000 wpp
        from skus group by sku_code),
prod as (select s.pt, s.size_part, s.thk, p.plant, p.date_of_production dt,
                sum(case when s.wpp > 0 then p.tube_count * s.wpp else p.total_weight::numeric end) mt
         from productions p join sku s on s.sku_code = p.sku_code where not p.deleted group by 1,2,3,4,5),
disp as (select s.pt, s.size_part, s.thk, e->>'plant' plant, sum((e->>'weight')::numeric) dmt
         from dispatches d cross join lateral jsonb_array_elements(d.bundle_entries) e
         join sku s on s.sku_code = e->>'skuCode' where not d.deleted group by 1,2,3,4),
layers as (select p.*, coalesce(d.dmt,0) dmt,
                  sum(p.mt) over (partition by p.pt,p.size_part,p.thk,p.plant order by p.dt
                                  rows between unbounded preceding and current row) cum
           from prod p left join disp d using (pt,size_part,thk,plant)),
surv as (select pt,size_part,thk,plant, greatest(0, least(mt, cum - dmt)) smt, (select as_of from params) - dt age
         from layers where cum - dmt > 0),
g as (select pt,size_part,thk,plant, sum(smt) onh,
             coalesce(sum(smt) filter (where age<=30),0) b1, coalesce(sum(smt) filter (where age between 31 and 60),0) b2,
             coalesce(sum(smt) filter (where age between 61 and 90),0) b3, coalesce(sum(smt) filter (where age>90),0) b4,
             max(age) oldest, sum(smt*age)/nullif(sum(smt),0) wavg
      from surv where smt > 0 group by 1,2,3,4 having sum(smt) > 0.0005)
select count(*) n, round(sum(onh),3) tot,
       string_agg(concat_ws('|',pt,size_part,thk::text,plant,round(onh,3),round(b1,3),round(b2,3),round(b3,3),round(b4,3),oldest,round(wavg,2)),
                  ';' order by plant,pt,size_part,thk) s
from g;
```

## 4. Decisions already made (don't reopen)
- **Weight basis = tubes × `weight_per_tube`** (CLAUDE.md non-negotiable; same as the truck plan),
  `total_weight` only as a fallback. The app's `skuAgeing` (`src/lib/calc.js:498`) uses `total_weight`.
  The gap is 2.66 MT, Hyderabad only (6,878.98 vs 6,876.32). Say so in a note on the SKU Inventory
  tab so nobody reconciles it against the PB MTD workbook and panics.
- Thickness in tab 3 = the SKU master's own (3.2 stays 3.2, as in the MTD sheet). The 3 ≡ 3.2 merge is an
  indent-matching rule (R2) only.
- Over-dispatched plant/size reads 0 (no row), consistent with R6. Those negatives are already on the
  indent output's Checks tab.
- Precision: carry 3 decimals and store exact values; round only via cell format (LEARNINGS 26 Oct:
  rounding flipped a 1 MT decision and made a total 0.045 MT short).
- Region facts: Khan Steel Centre = **West**; SLSS = Shri Lakshmi Steel Suppliers (South). Both are user-confirmed
  and already in the JSON.

## 5. Suggested implementation (fits the existing builder)
In `scripts/indent-plan.py` (TDD: add the tests to `scripts/indent-plan-test.py` first and see them fail):
1. `--ageing FILE` + `--combined OUT.xlsx`.
2. Move the `have_`/`none_` computation out of `if args.split:` so both outputs share it. Reuse
   `owed_grid()` for the No Stock tab.
3. Refactor the Truck Plan writer (the `tp = wb.create_sheet('Truck Plan')` block) into a function
   `write_truck_plan(ws)`, and call it for both workbooks. Same code means the same figures.
4. Tab 3: per-plant blocks, SKUs with on-hand **> 2 MT** sorted descending, MTD sheet columns, plant subtotal,
   and a "Other SKUs (≤ 2 MT)" line, so each block reconciles to that plant's total on-hand.
5. Tab 4: one row per plant (Hyderabad, Lepakshi, NPMD, Tapi) + total: on-hand, four buckets, % of plant,
   wtd avg age.
6. Self-check in the builder: per plant/key, ageing on-hand vs `max(0, plant_stock)` within 0.002 MT,
   else stop. Also add the matching checks to `scripts/indent-plan-audit.py`.
7. Docs: add R17 to `docs/indent-plan-rules.md`, then update the blueprint "What the output holds", the skill
   description and LEARNINGS (CLAUDE.md "fail forward").

Run the build per the blueprint (tests → build with `--split` and `--combined` → `soffice` recalc → format check →
audit). Then run the **`data-verifier` agent** on the combined file. The `SendUserFile` hook blocks any
.xlsx without a PASS stamp (`scripts/verify-stamp.py`). The verifier caught three real errors this
session; expect it to find something.

## 6. Email draft brief
≤ 6 lines. Subject like "Indent status & stock — 25 Oct". One line each:
- trucks ready (count, MT, by region);
- sizes owed with no stock (MT by region) → needs production;
- plant stock > 2 MT and how old it is (oldest band per plant);
- attachment name.

Use the verified figures only. No recipients are known; leave them blank.

## 7. Open questions still with the user (carry forward, don't decide)
- Row 657, Kisan Pipe "SHS 18x180": is it 180x180? No stock either way, so trucks are unaffected.
- R8 "sizes kept together": 15 sizes split across two trucks (e.g. VVN RHS 122x61 3: 4 MT + 1 MT). Allowed?
- Security: `backup_productions_20260805` / `backup_dispatches_20260805` have RLS disabled. Reported,
  not changed; the user decides.

## 8. Suggested skills
- **`indent-truck-plan`**: the workflow, rules and checks (`.claude/skills/indent-truck-plan/SKILL.md`).
- **`anthropic-skills:xlsx`**: openpyxl conventions and recalculation.
- **`tdd`**: the tests come first; every rule change in this project ships with a test (rules doc says so).
- **`data-verifier`** (agent, `.claude/agents/data-verifier.md`): mandatory before sending.
- **`resolving-merge-conflicts`**: only if `staging` moved under the work branch.

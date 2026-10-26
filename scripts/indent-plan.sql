-- ═══════════════════════════════════════════════════════════════════════════
-- INDENT PLAN — the two data bundles scripts/indent-plan.py reads.
-- Run each query via the Supabase MCP (execute_sql) or the SQL Editor, copy the
-- `s` value into a text file, and pass it as --flow / --disp. See
-- blueprints/indent-truck-plan.md.
--
-- Netting key = product type + size (HxB, or bare NB for CHS) + thickness, from the
-- `skus` master — the same key as scripts/sku-ageing.sql. Production weight =
-- tube_count × weight_per_tube (never density); total_weight only when the master
-- has no weight. Edit `month_start` in both queries.
-- Three decimals, not two: a pro-rata share sits right on the 1 MT line often enough that 0.01 MT of
-- rounding flips it (Oct-26: Tapi SHS 72x72 5 = 4.494 read as 4.50, so a 0.9987 share became 1.00 and loaded).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. FLOW (--flow): per plant + size: produced/dispatched before the month, and in the month ──
-- Format: pt|size|thk|plant|prodBefore|dispBefore|prodMonth|dispMonth ; …
with params as (select date '2026-10-01' as month_start),            -- ← first day of the month
sku as (
  select sku_code, max(product_type) pt,
         max(coalesce(nullif(nominal_bore,''), trim(to_char(height,'FM999990.##'))||'x'||trim(to_char(breadth,'FM999990.##')))) size_part,
         max(thickness::numeric) thk, max(nullif(weight_per_tube,0)::numeric)/1000 wpp
  from skus group by sku_code),
p as (select s.pt, s.size_part, s.thk, p.plant, p.date_of_production dt,
             case when s.wpp > 0 then p.tube_count * s.wpp else p.total_weight::numeric end mt
      from productions p join sku s on s.sku_code = p.sku_code where not p.deleted),
d as (select s.pt, s.size_part, s.thk, e->>'plant' plant, dd.date_of_dispatch dt, (e->>'weight')::numeric mt
      from dispatches dd cross join lateral jsonb_array_elements(dd.bundle_entries) e
      join sku s on s.sku_code = e->>'skuCode' where not dd.deleted),
u as (select pt,size_part,thk,plant, case when dt < (select month_start from params) then mt else 0 end a, 0 b,
             case when dt >= (select month_start from params) then mt else 0 end c, 0 e2 from p
      union all
      select pt,size_part,thk,plant, 0, case when dt < (select month_start from params) then mt else 0 end,
             0, case when dt >= (select month_start from params) then mt else 0 end from d),
g as (select pt,size_part,thk,plant, round(sum(a),3) a, round(sum(b),3) b, round(sum(c),3) c, round(sum(e2),3) e
      from u group by 1,2,3,4)
select count(*) n,
       string_agg(concat_ws('|',pt,size_part,thk::text,plant,a,b,c,e), ';' order by plant,pt,size_part,thk) s,
       (select max(date_of_dispatch)::text from dispatches where not deleted) last_disp,
       (select max(date_of_production)::text from productions where not deleted) last_prod
from g;

-- ── 2. DISPATCH BY CUSTOMER (--disp): month-to-date invoices per customer + plant + size ──
-- Format: pt|size|thk|plant|customer|MT ; …
-- The IN list = every "customer" value in scripts/indent-plan-distributors.json.
with sku as (
  select sku_code, max(product_type) pt,
         max(coalesce(nullif(nominal_bore,''), trim(to_char(height,'FM999990.##'))||'x'||trim(to_char(breadth,'FM999990.##')))) size_part,
         max(thickness::numeric) thk from skus group by sku_code),
g as (select s.pt, s.size_part, s.thk, e->>'plant' plant, e->>'customer' cust, round(sum((e->>'weight')::numeric),3) mt
      from dispatches dd cross join lateral jsonb_array_elements(dd.bundle_entries) e
      join sku s on s.sku_code = e->>'skuCode'
      where not dd.deleted and dd.date_of_dispatch >= date '2026-10-01'                -- ← first day of the month
        and e->>'customer' in ('SHIVAM PRIME STEELS PRIVATE LIMITED','SST STEEL CORPORATION','V V N STEELS P LTD',
          'KHAN STEEL CENTRE PRIVATE LIMITED','SHUBH M L SHAH & SONS STEEL PRIVATE LIMITED',
          'ARIHANT STEEL POINT PRIVATE LIMITED','VORA & CO','PROVACK STRUCTURAL STEELS PRIVATE LIMITED','MAHENDRA ISPAT')
      group by 1,2,3,4,5)
select count(*) n, round(sum(mt),2) tot,
       string_agg(concat_ws('|',pt,size_part,thk::text,plant,cust,mt), ';' order by cust,plant,pt,size_part,thk) s
from g;

-- ── 3. Finding a new distributor's invoice name and region ──
-- select distributor_name, region from distributors where not coalesce(deleted,false) and distributor_name ilike '%name%';
-- select e->>'customer', string_agg(distinct e->>'plant', ','), round(sum((e->>'weight')::numeric),2)
--   from dispatches d cross join lateral jsonb_array_elements(d.bundle_entries) e
--   where not d.deleted and d.date_of_dispatch >= date '2026-10-01' and e->>'customer' ilike '%name%' group by 1;

-- ── 4. FRESHNESS: run right before building AND right before sending — the numbers must not move ──
-- If any value differs between the two runs, data entry was still going on: pull again and rebuild.
select (select count(*) from productions where not deleted) prod_rows,
       (select round(sum(tube_count)::numeric, 0) from productions where not deleted) prod_tubes,
       (select max(created_at)::text from productions) prod_last_entry,
       (select count(*) from dispatches where not deleted) disp_rows,
       (select round(sum((e->>'weight')::numeric), 2) from dispatches d cross join lateral jsonb_array_elements(d.bundle_entries) e where not d.deleted) disp_mt,
       (select max(created_at)::text from dispatches) disp_last_entry;

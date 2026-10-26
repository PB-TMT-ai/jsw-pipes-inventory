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
        and e->>'customer' in ('SHIVAM PRIME STEELS PRIVATE LIMITED','V V N STEELS P LTD','SST STEEL CORPORATION','KHAN STEEL CENTRE PRIVATE LIMITED',
          'SHUBH M L SHAH & SONS STEEL PRIVATE LIMITED','ARIHANT STEEL POINT PRIVATE LIMITED','VORA & CO','PROVACK STRUCTURAL STEELS PRIVATE LIMITED',
          'MAHENDRA ISPAT','SHRI LAKSHMI STEEL SUPPLIERS','KISAN KIRAN ENTERPRISE PRIVATE LIMITED','AMIT PIPE & STEEL PRIVATE LIMITED',
          'KISAN PIPE AND STEEL','ARIHANT STEEL AGENCY')
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

-- ── 5. AGEING (--ageing, R17): per plant + size, FIFO on weight; on-hand = max(0, made − sent) per plant ──
-- Format: pt|size|thk|plant|onhand|d0_30|d31_60|d61_90|d90plus|oldest_days|wtd_avg_age ; …
-- Thickness is the SKU master's own (3.2 stays 3.2); the builder merges 3 = 3.2 only to compare with plant stock.
-- Run it in the same moment as queries 1 and 2: the builder stops if the two disagree.
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

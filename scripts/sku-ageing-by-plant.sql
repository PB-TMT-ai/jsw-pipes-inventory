-- ═══════════════════════════════════════════════════════════════════════════
-- SKU AGEING BY PLANT — finished-goods FIFO ageing, one stock pool PER PLANT.
--
-- Works to the approved rules of record in docs/inventory-dashboard-rules.md, so its figures
-- tie to the Inventory Snapshot ("Current inventory MT", "Inventory > 60 days"):
--
--   S1  Size key = section (product_type) + size (nominal bore "32 NB", else height x breadth)
--       + thickness to 2 decimals. ERP code, IS standard and length do NOT split a size.
--   S2  Production tonnage = tube_count × skus.weight_per_tube / 1000 (the SKU master), never a
--       density formula. Only when the master has no positive weight is the stored total_weight
--       used (the app's resolveProductionWeights does the same). Invoice tonnage = each
--       bundle_entries element's `weight`, at that ENTRY's `plant`. Soft-deleted rows excluded.
--   S10 Per plant and size key, invoices drain the OLDEST production first (FIFO by weight);
--       what survives is on hand, aged as_of − date_of_production.
--
-- Report buckets (blueprints/sku-ageing-report.md): 0–30, 31–60, 61–90, 90+ (= 91 or more).
-- "Over 60 days" = 61 or more (S10). An over-invoiced size (invoiced > produced at that plant)
-- has no surviving layer, so it is not a row; per plant Σ on hand − Σ over-invoiced = produced − invoiced.
--
-- Verified 2026-10-29: per-plant on hand and > 60 days equal the Inventory Snapshot of 29 Oct
-- (Nippon/Hyderabad 895.247 / 290.2, Lepakshi 350.187 / 0, NPMD 826.192 / 0, Tapi 742.197 / 4.5).
-- Run in Supabase → SQL Editor (or MCP execute_sql). Edit `as_of` below.
-- ═══════════════════════════════════════════════════════════════════════════

with params as (select date '2026-10-29' as as_of),        -- ← as-of date
sku_dim as (
  select sku_code,
         upper(trim(product_type))
           || '|' || coalesce(nullif(trim(nominal_bore), '') || ' NB', height || 'x' || breadth)
           || '|' || to_char(thickness::numeric, 'FM990.00')            as size_key,
         nullif(weight_per_tube::numeric, 0) / 1000                      as mt_per_tube
  from skus
),
prod as (
  select p.plant, coalesce(sd.size_key, 'code:' || p.sku_code) as size_key,
         p.date_of_production as dt,
         coalesce(p.tube_count * sd.mt_per_tube, p.total_weight::numeric) as mt
  from productions p left join sku_dim sd using (sku_code)
  where p.deleted is not true
),
disp as (
  select e->>'plant' as plant, coalesce(sd.size_key, 'code:' || (e->>'skuCode')) as size_key,
         sum((e->>'weight')::numeric) as dmt
  from dispatches d
  cross join lateral jsonb_array_elements(d.bundle_entries) e
  left join sku_dim sd on sd.sku_code = e->>'skuCode'
  where d.deleted is not true
  group by 1, 2
),
layers as (   -- oldest-first cumulative produced MT per (plant, size key)
  select p.*, coalesce(d.dmt, 0) as dmt,
         sum(p.mt) over (partition by p.plant, p.size_key
                         order by p.dt rows unbounded preceding) as cum
  from prod p
  left join disp d on d.plant = p.plant and d.size_key = p.size_key
),
surv as (
  select l.plant, l.size_key, l.dt,
         greatest(0, least(l.mt, l.cum - l.dmt)) as smt,
         (pa.as_of - l.dt) as age
  from layers l cross join params pa
  where greatest(0, least(l.mt, l.cum - l.dmt)) > 0
)
select plant, size_key,
       round(sum(smt), 3)                                         as onhand_mt,
       round(sum(smt) filter (where age <= 30), 3)                as mt_0_30,
       round(sum(smt) filter (where age between 31 and 60), 3)    as mt_31_60,
       round(sum(smt) filter (where age between 61 and 90), 3)    as mt_61_90,
       round(sum(smt) filter (where age > 90), 3)                 as mt_90plus,
       max(age)                                                   as oldest_age_days,
       round(sum(smt * age) / nullif(sum(smt), 0), 1)             as wtd_avg_age_days,
       max(dt)                                                    as newest_in_stock
from surv
group by plant, size_key
order by plant, onhand_mt desc;

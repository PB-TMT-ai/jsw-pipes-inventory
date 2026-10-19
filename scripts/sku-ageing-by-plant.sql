-- ═══════════════════════════════════════════════════════════════════════════
-- SKU AGEING BY PLANT — finished-goods FIFO ageing, one stock pool PER PLANT.
--
-- Same definition as scripts/sku-ageing.sql (on-hand = produced − invoiced, aged by
-- days-since-production of the FIFO remainder), with two differences:
--
--   1. Partitioned by plant. Production plant = `productions.plant`; invoice plant =
--      the per-entry `plant` inside `dispatches.bundle_entries` (ADR-0013). A Tapi
--      invoice drains only Tapi's batches — never Hyderabad's oldest.
--   2. Drained by WEIGHT, not pieces, so the surviving tonnage equals the app's
--      `skuAgeing` / `producedPool.availableWeight` (src/lib/calc.js) exactly.
--
-- Key = product type + IS standard + size + thickness (what canonicalSkuKey nets on).
-- Over-invoiced SKUs (invoiced > produced at that plant) floor to 0 and are not aged;
-- their tonnage is the plant's "unmatched dispatch".
--
-- Verified 2026-10-19: per-plant totals match `skuAgeing` run per plant to 0.1 MT.
-- Run in Supabase → SQL Editor (or MCP execute_sql). Edit `as_of` below.
-- ═══════════════════════════════════════════════════════════════════════════

with params as (select date '2026-10-19' as as_of),        -- ← as-of date
sku_dim as (
  select sku_code, product_type as pt,
         coalesce(nullif(nominal_bore,''), height||'x'||breadth) as size_part,
         thickness::numeric as thk,
         (regexp_match(lower(description), 'is\s*(\d+)'))[1] as std
  from skus
),
prod as (
  select p.plant, sd.pt, sd.std, sd.size_part, sd.thk,
         p.date_of_production as dt, p.total_weight::numeric as mt
  from productions p join sku_dim sd using (sku_code)
  where p.deleted is not true
),
disp as (
  select e->>'plant' as plant, sd.pt, sd.std, sd.size_part, sd.thk,
         sum((e->>'weight')::numeric) as dmt
  from dispatches d
  cross join lateral jsonb_array_elements(d.bundle_entries) e
  join sku_dim sd on sd.sku_code = e->>'skuCode'
  where d.deleted is not true
  group by 1, 2, 3, 4, 5
),
layers as (   -- oldest-first cumulative produced MT per (plant, key)
  select p.*, coalesce(d.dmt, 0) as dmt,
         sum(p.mt) over (partition by p.plant, p.pt, p.std, p.size_part, p.thk
                         order by p.dt rows unbounded preceding) as cum
  from prod p
  left join disp d on d.plant = p.plant and d.pt is not distinct from p.pt
                  and d.std is not distinct from p.std
                  and d.size_part = p.size_part and d.thk = p.thk
),
surv as (
  select l.plant, l.pt, l.std, l.size_part, l.thk, l.dt,
         greatest(0, least(l.mt, l.cum - l.dmt)) as smt,
         (pa.as_of - l.dt) as age
  from layers l cross join params pa
  where greatest(0, least(l.mt, l.cum - l.dmt)) > 0
)
select plant, pt as type, std, size_part, thk,
       round(sum(smt), 3)                                         as onhand_mt,
       round(sum(smt) filter (where age <= 30), 3)                as mt_0_30,
       round(sum(smt) filter (where age between 31 and 60), 3)    as mt_31_60,
       round(sum(smt) filter (where age between 61 and 90), 3)    as mt_61_90,
       round(sum(smt) filter (where age > 90), 3)                 as mt_90plus,
       max(age)                                                   as oldest_age_days,
       round(sum(smt * age) / nullif(sum(smt), 0), 1)             as wtd_avg_age_days,
       max(dt)                                                    as newest_in_stock
from surv
group by plant, pt, std, size_part, thk
order by plant, onhand_mt desc;

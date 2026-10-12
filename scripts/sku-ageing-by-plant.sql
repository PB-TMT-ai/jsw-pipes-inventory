-- ═══════════════════════════════════════════════════════════════════════════
-- SKU AGEING BY PLANT — finished-goods ageing (FIFO), split per plant.
--
-- Same definition as scripts/sku-ageing.sql, with PLANT added to the netting key:
--   on-hand  = produced at plant P − dispatched from plant P   (per size + thickness)
--   ageing   = <as_of> − date_of_production of the un-dispatched (FIFO) remainder
-- A plant's dispatches only drain that plant's production — stock never crosses
-- plants (productions.plant is inherited from the coil; dispatch plant is the
-- invoice's Zoho warehouse, bundle_entries[].plant).
--
-- Output 1 (default): one row per plant — totals + age buckets.
-- For the per-SKU table, swap the final SELECT for the commented one at the bottom.
-- Run in Supabase → SQL Editor (or MCP execute_sql). Edit `as_of` below.
-- ═══════════════════════════════════════════════════════════════════════════

with params as (select date '2026-10-12' as as_of),        -- ← as-of date
sku_dim as (
  select sku_code,
         coalesce(nullif(nominal_bore,''), height||'x'||breadth) as size_part,
         thickness::numeric as thk
  from skus
),
prod as (   -- one FIFO layer per (plant, key, production day)
  select p.plant, sd.size_part, sd.thk, p.date_of_production as dt,
         sum(p.tube_count)::numeric as pcs, sum(p.total_weight)::numeric as mt
  from productions p join sku_dim sd on sd.sku_code = p.sku_code
  where p.deleted = false and p.tube_count > 0
  group by p.plant, sd.size_part, sd.thk, p.date_of_production
),
disp as (   -- dispatched pieces per (plant, key)
  select e->>'plant' as plant, sd.size_part, sd.thk, sum((e->>'pieces')::numeric) as dpcs
  from dispatches d
  cross join lateral jsonb_array_elements(d.bundle_entries) e
  join sku_dim sd on sd.sku_code = e->>'skuCode'
  where d.deleted = false
  group by e->>'plant', sd.size_part, sd.thk
),
layers as (
  select p.*, coalesce(d.dpcs, 0) as dpcs,
         sum(p.pcs) over (partition by p.plant, p.size_part, p.thk
                          order by p.dt rows between unbounded preceding and current row) as cum
  from prod p
  left join disp d on d.plant = p.plant and d.size_part = p.size_part and d.thk = p.thk
),
surv as (
  select l.plant, l.size_part, l.thk, l.dt,
         greatest(0, least(l.pcs, l.cum - l.dpcs))                    as spcs,
         greatest(0, least(l.pcs, l.cum - l.dpcs)) * (l.mt / l.pcs)   as smt,
         (pp.as_of - l.dt)                                            as age
  from layers l cross join params pp
  where l.cum - l.dpcs > 0
)
select plant,
       count(distinct (size_part, thk))                                 as skus_in_stock,
       round(sum(spcs))                                                 as onhand_pcs,
       round(sum(smt), 1)                                               as onhand_mt,
       round(coalesce(sum(smt) filter (where age <= 30), 0), 1)         as mt_0_30,
       round(coalesce(sum(smt) filter (where age between 31 and 60), 0), 1) as mt_31_60,
       round(coalesce(sum(smt) filter (where age between 61 and 90), 0), 1) as mt_61_90,
       round(coalesce(sum(smt) filter (where age > 90), 0), 1)          as mt_90plus,
       max(age)                                                         as oldest_days,
       round(sum(smt * age) / nullif(sum(smt), 0), 1)                   as wtd_avg_age_days
from surv
group by plant
order by onhand_mt desc;

-- Per-SKU, per-plant table — replace the SELECT above with:
-- select plant, size_part, thk, round(sum(spcs)) onhand_pcs, round(sum(smt),3) onhand_mt,
--        round(coalesce(sum(smt) filter (where age <= 30),0),3)            mt_0_30,
--        round(coalesce(sum(smt) filter (where age between 31 and 60),0),3) mt_31_60,
--        round(coalesce(sum(smt) filter (where age between 61 and 90),0),3) mt_61_90,
--        round(coalesce(sum(smt) filter (where age > 90),0),3)             mt_90plus,
--        max(age) oldest_days, round(sum(smt*age)/nullif(sum(smt),0),1)     wtd_avg_age_days
-- from surv group by plant, size_part, thk order by plant, onhand_mt desc;

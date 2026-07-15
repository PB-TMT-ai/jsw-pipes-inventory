-- ═══════════════════════════════════════════════════════════════════════════
-- SKU AGEING — finished-goods inventory ageing (FIFO) for JSW Pipes & Tubes.
--
-- Definition:  on-hand stock = produced − dispatched (the app's inventory model),
--              aged by days-since-production of the un-dispatched (FIFO) remainder.
-- Netting key: physical size (height×breadth or NB) + thickness, resolved from the
--              `skus` master — so variant ERP codes for the SAME physical tube net
--              together (mirrors skuKeyResolver / dispatchCoilTrace in src/lib/calc.js).
-- FIFO:        dispatches drain the OLDEST production batches first; whatever remains
--              is on-hand and is aged `<as_of> − date_of_production`.
--
-- Run in Supabase → SQL Editor (or via the MCP execute_sql). Edit `as_of` below.
-- To scope to a specific SKU list, join the `agg` CTE to a VALUES list of
-- (size_part, thickness) — see reports/SKU-Ageing-2026-07-14.md for the 56-SKU cut.
-- ═══════════════════════════════════════════════════════════════════════════

with params as (select date '2026-07-14' as as_of),        -- ← as-of date
sku_dim as (
  select sku_code,
         coalesce(nullif(nominal_bore,''), height||'x'||breadth) as size_part,  -- '50x50' | '32' (NB)
         thickness::numeric as thk
  from skus
),
prod as (   -- every production batch, tagged with its physical-dimension key
  select sd.size_part, sd.thk, p.date_of_production as dt,
         p.tube_count::numeric as pcs, p.total_weight::numeric as mt
  from productions p
  join sku_dim sd on sd.sku_code = p.sku_code
  where p.deleted = false and p.tube_count > 0
),
disp as (   -- total dispatched pieces per key (from the dispatches bundle_entries JSONB)
  select sd.size_part, sd.thk, sum((e->>'pieces')::numeric) as dpcs
  from dispatches d
  cross join lateral jsonb_array_elements(d.bundle_entries) e
  join sku_dim sd on sd.sku_code = e->>'skuCode'
  where d.deleted = false
  group by sd.size_part, sd.thk
),
layers as (   -- oldest-first cumulative produced pieces per key
  select p.size_part, p.thk, p.dt, p.pcs, p.mt,
         coalesce(d.dpcs, 0) as dpcs,
         sum(p.pcs) over (partition by p.size_part, p.thk
                          order by p.dt asc, p.mt asc
                          rows between unbounded preceding and current row) as cum_incl
  from prod p
  left join disp d on d.size_part = p.size_part and d.thk = p.thk
),
survw as (    -- surviving (un-dispatched) pieces per batch = pieces beyond the FIFO drain
  select l.size_part, l.thk, l.dt,
         greatest(0, least(l.pcs, l.cum_incl - l.dpcs)) as spcs,
         greatest(0, least(l.pcs, l.cum_incl - l.dpcs)) * (l.mt / nullif(l.pcs, 0)) as smt,
         (p.as_of - l.dt) as age
  from layers l cross join params p
  where greatest(0, least(l.pcs, l.cum_incl - l.dpcs)) > 0
)
select size_part, thk,
       round(sum(spcs))                                                as onhand_pcs,
       round(sum(smt)::numeric, 3)                                     as onhand_mt,
       round(sum(smt) filter (where age <= 30)::numeric, 3)            as mt_0_30,
       round(sum(smt) filter (where age between 31 and 60)::numeric,3) as mt_31_60,
       round(sum(smt) filter (where age between 61 and 90)::numeric,3) as mt_61_90,
       round(sum(smt) filter (where age > 90)::numeric, 3)             as mt_90plus,
       max(age)                                                        as oldest_age_days,
       round((sum(smt * age) / nullif(sum(smt), 0))::numeric, 1)       as wtd_avg_age_days
from survw
group by size_part, thk
order by onhand_mt desc;

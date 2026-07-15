-- ═══════════════════════════════════════════════════════════════════════════
-- SKU AGEING — FIFO LAYER LEDGER (first produced, first out).
--
-- For each SKU, lists the production-date "layers" that REMAIN in stock after
-- dispatches drain the OLDEST batches first, each aged to <as_of>. This is the
-- transparent, auditable view behind scripts/sku-ageing.sql's per-SKU summary:
--   • dispatches consume oldest production first (FIFO);
--   • a layer is fully shipped / partially remaining / fully in stock;
--   • surviving pieces are aged `<as_of> - date_of_production`.
--
-- Netting key = physical size (height×breadth or NB) + thickness from `skus`,
-- so variant ERP codes for the same tube net together.
-- Run in Supabase → SQL Editor (or MCP execute_sql). Edit `as_of` below.
-- ═══════════════════════════════════════════════════════════════════════════

with params as (select date '2026-07-14' as as_of),        -- ← as-of date
sku_dim as (
  select sku_code, coalesce(nullif(nominal_bore,''), height||'x'||breadth) as size_part,
         thickness::numeric as thk
  from skus
),
prod as (   -- production aggregated per (key, date) = one FIFO layer per production day
  select sd.size_part, sd.thk, p.date_of_production as dt,
         sum(p.tube_count) as pcs, sum(p.total_weight) as mt
  from productions p join sku_dim sd on sd.sku_code = p.sku_code
  where p.deleted = false and p.tube_count > 0
  group by sd.size_part, sd.thk, p.date_of_production
),
disp as (   -- total dispatched pieces per key
  select sd.size_part, sd.thk, sum((e->>'pieces')::numeric) as dpcs
  from dispatches d
  cross join lateral jsonb_array_elements(d.bundle_entries) e
  join sku_dim sd on sd.sku_code = e->>'skuCode'
  where d.deleted = false
  group by sd.size_part, sd.thk
),
layers as (   -- cumulative produced pieces, oldest-first
  select p.size_part, p.thk, p.dt, p.pcs, p.mt, coalesce(d.dpcs,0) as dpcs,
         sum(p.pcs) over (partition by p.size_part, p.thk
                          order by p.dt rows between unbounded preceding and current row) as cum
  from prod p left join disp d on d.size_part = p.size_part and d.thk = p.thk
)
select l.size_part, l.thk, l.dt as produced_on,
       (pp.as_of - l.dt)                                       as age_days,
       greatest(0, least(l.pcs, l.cum - l.dpcs))               as onhand_pcs,
       round((greatest(0, least(l.pcs, l.cum - l.dpcs))
              * (l.mt / nullif(l.pcs,0)))::numeric, 3)         as onhand_mt,
       case when l.cum <= l.dpcs                then 'shipped (drained)'
            when l.cum - l.pcs >= l.dpcs        then 'in stock (full)'
            else 'in stock (partial)' end                      as fifo_status
from layers l cross join params pp
where greatest(0, least(l.pcs, l.cum - l.dpcs)) > 0            -- only surviving (on-hand) layers
order by l.size_part, l.thk, l.dt;

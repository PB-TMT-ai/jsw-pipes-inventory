-- ═══════════════════════════════════════════════════════════════════════════
-- SKU AGEING ADJUSTED TO ACTUAL — ages a plant's PHYSICAL stock count, not the book.
--
-- Input:  the plant team's stock sheet (plant, size, thickness, qty MT, reserve MT), pasted
--         into the `actual` VALUES list below. Size = 'HxB' for SHS/RHS, the bare NB for CHS.
-- Rule:   FIFO says the oldest pipes leave first, so what is still on the floor is the NEWEST
--         production. The counted MT is filled from that plant's production of that size +
--         thickness, newest day first, back in time until the count is used up. Each filled
--         slice is aged <as_of> − date_of_production.
-- Unknown age: counted MT beyond everything the plant ever recorded producing for that SKU
--         (pre-tracking stock, transfers in, or a production entry missing) — no date to age it by.
-- Book:   system stock at that plant = produced − invoiced (dispatch entries carry `plant`).
--         Shown beside the count so the adjustment is visible; it does not feed the ageing.
-- Plant:  production is scoped to the counting plant only (CLAUDE.md: never cross plants).
-- Run via Supabase MCP execute_sql. Returns one '|'-joined line per row: kind R = report row,
-- kind L = a surviving production layer.
-- ═══════════════════════════════════════════════════════════════════════════
with params as (select date '2026-11-23' as as_of),          -- ← count date
actual(plant, size_part, thk, qty, reserve, label) as (values  -- ← paste the stock sheet here
  ('tapi','50x50',2,6,0,'50x50x2'),('tapi','50x50',2.5,4,0,'50x50x2.5'),('tapi','50x50',4,4,0,'50x50x4'),
  ('tapi','50x50',5,9,0,'50x50x5'),('tapi','60x40',2,1,0,'60x40x2'),('tapi','60x40',4,2,2,'60x40x4'),
  ('tapi','60x60',4,13,0,'60x60x4'),('tapi','60x60',5,3,3,'60x60x5'),('tapi','80x40',2,10,6,'80x40x2'),
  ('tapi','80x40',2.5,8,0,'80x40x2.5'),('tapi','80x40',4,43,2,'80x40x4'),('tapi','80x40',5,38,0,'80x40x5'),
  ('tapi','96x48',2,42,0,'96x48x2'),('tapi','96x48',2.5,39,0,'96x48x2.5'),('tapi','96x48',3,9,0,'96x48x3'),
  ('tapi','96x48',4,1,0,'96x48x4'),('tapi','72x72',2,26,0,'72x72x2'),('tapi','72x72',2.5,25,4,'72x72x2.5'),
  ('tapi','72x72',4,8,0,'72x72x4'),('tapi','80x80',4,0.3,0,'80x80x4'),('tapi','100x100',2,4,2,'100x100x2'),
  ('tapi','100x100',3,20,0,'100x100x3'),('tapi','100x100',4,27,0,'100x100x4'),('tapi','100x100',5,19,0,'100x100x5'),
  ('tapi','122x61',2,12,0,'122x61x2'),('tapi','122x61',2.5,9,0,'122x61x2.5'),('tapi','122x61',3,36,0,'122x61x3'),
  ('tapi','122x61',4,11,1,'122x61x4'),('tapi','122x61',6,14,5,'122x61x6'),('tapi','145x82',3,8,10,'145x82x3'),
  ('tapi','145x82',4,22,12,'145x82x4'),('tapi','132x132',4,11,4,'132x132x4'),('tapi','132x132',5,33,0,'132x132x5'),
  ('tapi','132x132',6,17,0,'132x132x6'),('tapi','150x150',2.5,50,0,'150x150x2.5'),('tapi','150x150',3,29,0,'150x150x3'),
  ('tapi','150x150',4,13,0,'150x150x4'),('tapi','150x150',5,19,0,'150x150x5'),
  ('hyderabad','100x50',4,7.230,0,'100X50X4'),('hyderabad','15',1.6,4.783,0,'15NBX1.6'),
  ('hyderabad','15',2,8.035,0,'15NBX2'),('hyderabad','15',2.5,3.151,0,'15NBX2.5'),
  ('hyderabad','25.4OD',1.6,11.839,0,'25.4ODX1.6'),('hyderabad','25.4OD',2,7.389,0,'25.4ODX2'),
  ('hyderabad','25.4OD',2.5,10.592,0,'25.4ODX2.5'),('hyderabad','25.4OD',2.8,1.530,0,'25.4ODX2.8'),
  ('hyderabad','25.4OD',3,3.547,0,'25.4ODX3'),('hyderabad','25',1.6,4.788,0,'25NBX1.6'),
  ('hyderabad','25x25',2,19.953,0,'25X25X2'),('hyderabad','25x25',2.5,4.694,0,'25X25X2.5'),
  ('hyderabad','32',2,2.770,0,'32NBX2'),('hyderabad','32',2.5,10.578,0,'32NBX2.5'),
  ('hyderabad','38x38',1.6,13.506,0,'38X38X1.6'),('hyderabad','38x38',2,1.955,0,'38X38X2'),
  ('hyderabad','38x38',2.2,6.943,0,'38X38X2.2'),('hyderabad','38x38',2.5,11.852,0,'38X38X2.5'),
  ('hyderabad','38x38',2.8,3.130,0,'38X38X2.8'),('hyderabad','40',2,12.638,0,'40NBX2'),
  ('hyderabad','40',4,1.683,0,'40NBX4'),('hyderabad','40x20',2.5,1.693,0,'40X20X2.5'),
  ('hyderabad','40x20',2.8,6.990,0,'40X20X2.8'),('hyderabad','50',1.6,16.399,0,'50NBX1.6'),
  ('hyderabad','50',2,27.325,0,'50NBX2'),('hyderabad','50',2.5,3.069,0,'50NBX2.5'),
  ('hyderabad','50',3,14.998,0,'50NBX3'),('hyderabad','50',3.2,13.859,0,'50NBX3.2'),
  ('hyderabad','50x25',2,4.067,0,'50X25X2'),('hyderabad','50x50',1.6,65.466,0,'50X50X1.6'),
  ('hyderabad','50x50',2,14.702,0,'50X50X2'),('hyderabad','50x50',2.5,34.044,0,'50X50X2.5'),
  ('hyderabad','50x50',3,12.292,0,'50X50X3'),('hyderabad','50x50',3.2,5.757,0,'50X50X3.2'),
  ('hyderabad','50x50',4,4.185,0,'50X50X4'),('hyderabad','60x40',1.6,27.886,0,'60X40X1.6'),
  ('hyderabad','60x40',2.5,7.717,0,'60X40X2.5'),('hyderabad','60x40',2.8,7.501,0,'60X40X2.8'),
  ('hyderabad','65',2,3.116,0,'65NBX2'),('hyderabad','65',2.5,9.126,0,'65NBX2.5'),
  ('hyderabad','75x25',2.8,10.526,0,'75X25X2.8'),('hyderabad','80',1.6,15.096,0,'80NBX1.6'),
  ('hyderabad','80',2,17.065,0,'80NBX2'),('hyderabad','80',2.5,27.861,0,'80NBX2.5'),
  ('hyderabad','80x40',2,7.017,0,'80X40X2'),('hyderabad','80x40',2.5,7.453,0,'80X40X2.5'),
  ('hyderabad','80x40',3,2.070,0,'80X40X3')
),
sku_dim as (
  select sku_code, coalesce(nullif(nominal_bore,''), height||'x'||breadth) as size_part,
         thickness::numeric as thk
  from skus
),
prod as (   -- one layer per (plant, key, production day)
  select p.plant, sd.size_part, sd.thk, p.date_of_production as dt, sum(p.total_weight)::numeric as mt
  from productions p join sku_dim sd on sd.sku_code = p.sku_code
  where p.deleted = false and p.tube_count > 0 and p.plant in (select plant from actual)
  group by 1,2,3,4
),
disp as (   -- invoiced MT per (plant, key)
  select e->>'plant' as plant, sd.size_part, sd.thk, sum((e->>'weight')::numeric) as dmt
  from dispatches d cross join lateral jsonb_array_elements(d.bundle_entries) e
  join sku_dim sd on sd.sku_code = e->>'skuCode'
  where d.deleted = false and e->>'plant' in (select plant from actual)
  group by 1,2,3
),
layers as (  -- newest-first: MT produced strictly AFTER this layer
  select a.label, a.plant, pr.dt, pr.mt, a.qty,
         coalesce(sum(pr.mt) over (partition by a.plant, a.size_part, a.thk order by pr.dt desc
                                   rows between unbounded preceding and 1 preceding), 0) as newer
  from actual a join prod pr on pr.plant = a.plant and pr.size_part = a.size_part and pr.thk = a.thk
),
filled as (
  select l.*, least(l.mt, greatest(0, l.qty - l.newer)) as smt, (pp.as_of - l.dt) as age
  from layers l cross join params pp
),
agg as (
  select a.plant, a.label, a.qty, a.reserve, a.size_part, a.thk,
         coalesce((select sum(mt) from prod pr where pr.plant=a.plant and pr.size_part=a.size_part and pr.thk=a.thk),0) as produced,
         coalesce((select dmt from disp d where d.plant=a.plant and d.size_part=a.size_part and d.thk=a.thk),0) as dispatched,
         coalesce(sum(f.smt) filter (where f.age <= 30),0) as b0,
         coalesce(sum(f.smt) filter (where f.age between 31 and 60),0) as b31,
         coalesce(sum(f.smt) filter (where f.age between 61 and 90),0) as b61,
         coalesce(sum(f.smt) filter (where f.age > 90),0) as b90,
         max(f.age) filter (where f.smt > 0) as oldest,
         sum(f.smt*f.age)/nullif(sum(f.smt),0) as wavg,
         max(f.dt) as last_prod
  from actual a left join filled f on f.label = a.label and f.plant = a.plant
  group by 1,2,3,4,5,6
)
select 'R|'||plant||'|'||label||'|'||qty||'|'||reserve||'|'||round(produced,3)||'|'||round(dispatched,3)||'|'||
       round(b0,3)||'|'||round(b31,3)||'|'||round(b61,3)||'|'||round(b90,3)||'|'||
       round(greatest(0, qty - (b0+b31+b61+b90)),3)||'|'||coalesce(oldest::text,'')||'|'||
       coalesce(round(wavg,1)::text,'')||'|'||coalesce(last_prod::text,'') as line
from agg
union all
select 'L|'||plant||'|'||label||'|'||dt||'|'||age||'|'||round(mt,3)||'|'||round(smt,3)
from filled where smt > 0
order by 1;

-- ── Data for the plant-wise SKU ageing workbook, when the script cannot reach Supabase itself ──
-- Run each query on its own in the Supabase SQL Editor, "Download CSV", and paste the rows into the
-- matching sheet of the template (or upload the three CSVs as they are). Then:
--   node scripts/sku-ageing-plantwise.mjs --in <filled-template.xlsx | folder of the 3 CSVs>
-- Read-only: three SELECTs, nothing is written.

-- 1) Productions  → sheet "Productions"
select date_of_production, plant, sku_code, tube_count, total_weight
from productions
where not coalesce(deleted, false)
order by date_of_production, sku_code;

-- 2) Dispatches, one row per invoice LINE  → sheet "Dispatches"
--    Plant and SKU live on each line inside bundle_entries, not on the invoice row.
select d.date_of_dispatch, e->>'plant' as plant, e->>'skuCode' as sku_code,
       (e->>'pieces')::numeric as pieces, (e->>'weight')::numeric as weight
from dispatches d, jsonb_array_elements(coalesce(d.bundle_entries, '[]'::jsonb)) e
where not coalesce(d.deleted, false)
order by d.date_of_dispatch;

-- 3) SKU master  → sheet "SKUs"
select sku_code, description, product_type, height, breadth, nominal_bore, outside_diameter,
       thickness, length, weight_per_tube, status
from skus
order by sku_code;

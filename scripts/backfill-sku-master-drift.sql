-- ============================================================================
-- backfill-sku-master-drift.sql
-- Persists catalog SKUs that exist in src/data/skus.js but were never written to
-- the live `skus` table.
--
-- PROBLEM: a SKU lives in two layers joined on sku_code — the catalog
-- (src/data/skus.js, the fallback + skuImportResolver's self-heal source) and the
-- live `skus` table (what the running app actually reads). Batches added to the
-- catalog were not always backfilled, so 13 catalog codes had no live row: the app
-- fell back to resolving those orders by description instead of by code.
--
-- Codes covered (as of 2026-09-08):
--   SHS  20x20x1, 20x20x2.80, 50x50x3.20, 100x100x1.60
--   CHS  IS 1161  25/32/40/100 NB x 3.20, and 32 NB x 4
--   CHS  IS 3601  32 NB x 2, 32 NB x 2.50, 50 NB x 1.60, 50 NB x 2
--
-- SAFETY: every value is copied verbatim from src/data/skus.js — no weight is
-- recomputed here, per CLAUDE.md ("no density constants in app code"; the formula
-- is quarantined in scripts/generate-skus.mjs). Verified before running that none
-- of these 13 collides with an existing live row on canonicalSkuKey, so no new
-- duplicate physical identity is created and no netting changes.
--
-- This is additive and idempotent: `on conflict (sku_code) do nothing` means
-- re-running is a no-op, and no existing row is ever modified or deleted.
--
-- NOT addressed here: 23 live rows have no catalog counterpart, 19 of them created
-- through the UI "+ Add SKU" form with generated codes (SHS-25x25x3.20,
-- RHS-100x50x2.00, CHS-20NB-2.00) or with the whole description stored as the
-- sku_code. Those need their own decision — see the note at the end of this file.
-- ============================================================================

insert into skus (id, product_type, sku_code, description, height, breadth, thickness, length,
                  nominal_bore, outside_diameter, hsn_code, status,
                  weight_per_tube, base_conversion, thickness_extra, ladder_price, total_conversion)
values
  (gen_random_uuid()::text, 'SHS', '1139-13064-10078291', 'MS SHS One Helix IS 4923 YSt 210 Black 20x20x1x6000', 20, 20, 1, 6000, '', '', '72080000', 'published', 3.5796, 2900, 1000, 3900, 13.96044),
  (gen_random_uuid()::text, 'SHS', '1139-13064-10078310', 'MS SHS One Helix IS 4923 YSt 210 Black 100x100x1.60x6000', 100, 100, 1.6, 6000, '', '', '72080000', 'published', 29.661696, 2900, 750, 3650, 108.2651904),
  (gen_random_uuid()::text, 'CHS', '1141-13068-10078417', 'MS CHS One Helix IS 1161 YSt 210 Black 32 NBx3.20x6000', null, null, 3.2, 6000, '32', '42.4', '72080000', 'published', 18.561233114162903, 2900, 0, 2900, 53.82757603107241),
  (gen_random_uuid()::text, 'SHS', '1139-13064-10078288', 'MS SHS One Helix IS 4923 YSt 210 Black 20x20x2.80x6000', 20, 20, 2.8, 6000, '', '', '72080000', 'published', 9.073344, 2900, 0, 2900, 26.312697600000003),
  (gen_random_uuid()::text, 'CHS', '1141-13171-10074221', 'MS CHS One Helix IS 3601 YSt 210 Black 50 NBx1.60x6000', null, null, 1.6, 6000, '50', '60.3', '72080000', 'published', 13.897249793384724, 2900, 750, 3650, 50.724961745854245),
  (gen_random_uuid()::text, 'CHS', '1141-13171-10074222', 'MS CHS One Helix IS 3601 YSt 210 Black 50 NBx2x6000', null, null, 2, 6000, '50', '60.3', '72080000', 'published', 17.25318703054364, 2900, 500, 3400, 58.66083590384837),
  (gen_random_uuid()::text, 'CHS', '1141-13068-10078413', 'MS CHS One Helix IS 1161 YSt 210 Black 40 NBx3.20x6000', null, null, 3.2, 6000, '40', '48.3', '72080000', 'published', 21.354888098182318, 2900, 0, 2900, 61.929175484728724),
  (gen_random_uuid()::text, 'CHS', '1141-13068-10078407', 'MS CHS One Helix IS 1161 YSt 210 Black 25 NBx3.20x6000', null, null, 3.2, 6000, '25', '33.7', '72080000', 'published', 14.441775764846138, 2900, 0, 2900, 41.8811497180538),
  (gen_random_uuid()::text, 'CHS', '1141-13068-10078419', 'MS CHS One Helix IS 1161 YSt 210 Black 100 NBx3.20x6000', null, null, 3.2, 6000, '100', '114.3', '72080000', 'published', 52.605943851619855, 2900, 0, 2900, 152.5572371696976),
  (gen_random_uuid()::text, 'SHS', '1139-13064-10078304', 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x3.20x6000', 50, 50, 3.2, 6000, '', '', '72080000', 'published', 28.214784, 2900, 0, 2900, 81.82287360000001),
  (gen_random_uuid()::text, 'CHS', '1141-13171-10074211', 'MS CHS One Helix IS 3601 YSt 210 Black 32 NBx2.50x6000', null, null, 2.5, 6000, '32', '42.4', '72080000', 'published', 14.759909144911907, 2900, 0, 2900, 42.80373652024453),
  (gen_random_uuid()::text, 'CHS', '1141-13171-10074209', 'MS CHS One Helix IS 3601 YSt 210 Black 32 NBx2x6000', null, null, 2, 6000, '32', '42.4', '72080000', 'published', 11.955896329913603, 2900, 500, 3400, 40.65004752170625),
  (gen_random_uuid()::text, 'CHS', '1141-13068-10078416', 'MS CHS One Helix IS 1161 YSt 210 Black 32 NBx4x6000', null, null, 4, 6000, '32', '42.4', '72080000', 'published', 22.72804054795457, 2900, 0, 2900, 65.91131758906826)
on conflict (sku_code) do nothing;

-- ─────────────────────────────────────────────────────────────────────────
-- POST-CHECK (read-only). All 13 codes should now return a published row.
-- ─────────────────────────────────────────────────────────────────────────
select sku_code, description, status, weight_per_tube
from skus
where sku_code in (
  '1139-13064-10078288','1139-13064-10078291','1139-13064-10078304','1139-13064-10078310',
  '1141-13068-10078407','1141-13068-10078413','1141-13068-10078416','1141-13068-10078417',
  '1141-13068-10078419','1141-13171-10074209','1141-13171-10074211','1141-13171-10074221',
  '1141-13171-10074222')
order by sku_code;


-- ─────────────────────────────────────────────────────────────────────────
-- NOTE (manual review, NOT auto-fixed): live rows with no catalog counterpart.
-- Two are outright malformed and should be looked at first:
--   • 'MS CHS One Helix IS 1161 YSt 210 Black 25 NBx4x60000' — length typo in the
--     code AND the description (60000 instead of 6000); the row's length column
--     is correct at 6000.
--   • 'MS CHS One Helix IS 1161 YSt 210 Black 50 NBx4x6000' — description is NULL.
--   • 'MS CHS One Helix IS 1161 YSt 210 Black 65 NBx2.8x6000' — thickness is NULL.
-- Deleting or remapping any of these can move production tonnage (productions join
-- on sku_code), so they need the dedupe-sku-master.sql treatment — remap first,
-- retire second — not a delete. Left alone deliberately.
-- ─────────────────────────────────────────────────────────────────────────

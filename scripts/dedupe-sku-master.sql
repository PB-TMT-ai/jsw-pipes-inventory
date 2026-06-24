-- ============================================================================
-- dedupe-sku-master.sql
-- One-time cleanup for decimal-format duplicate SKUs (Reason #3 negative inventory).
--
-- PROBLEM: the `skus` table holds the same physical product under TWO codes whose
-- descriptions differ only by decimal formatting — a short form ("…1.6x6000") that
-- PRODUCTION was booked against, and a padded canonical form ("…1.60x6000") that
-- INVOICES/dispatch use. Inventory nets by sku_code, so the produced tonnage sits
-- stranded under the short-form code and never offsets the invoice → false negative
-- (e.g. RHS 100x50x1.60 shows −14.1 T while 15.0 T sits under the "1.6" code).
--
-- FIX: remap `productions.sku_code` from each short-form (duplicate) code onto the
-- canonical padded code, then retire the duplicate SKU from the picker (status=draft).
-- Dispatch already uses the canonical MM ID, and baby_coils carry no sku_code, so only
-- productions need remapping.
--
-- This migration is keyed by DESCRIPTION (so it finds the real codes in YOUR database),
-- is transactional, and is idempotent (re-running is a no-op once production is moved).
--
-- HOW TO RUN (Supabase SQL editor):
--   1. Run STEP 0 (pre-check) on its own and review the dup_code / canon_code / tonnage.
--   2. If it looks right, run STEP 1 (the BEGIN…COMMIT apply block).
--   3. Run STEP 2 (post-check) to confirm the duplicate codes now hold zero production.
--   4. Run STEP 3 (detector) to surface any OTHER decimal-format duplicates not listed here.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0 — PRE-CHECK (read-only). Confirms the duplicate↔canonical code pairs
-- actually present in the DB and how much production will move.
-- ─────────────────────────────────────────────────────────────────────────
with dedupe(short_desc, canon_desc) as (values
  ('MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.6x6000', 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.60x6000'),
  ('MS RHS One Helix IS 4923 YSt 210 Black 100x50x3.2x6000', 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x3.20x6000'),
  ('MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.5x6000',  'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.50x6000'),
  ('MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.8x6000',  'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.80x6000')
)
select d.short_desc,
       sd.sku_code                                                            as dup_code,
       sc.sku_code                                                            as canon_code,
       (select count(*)        from productions p where p.sku_code = sd.sku_code) as productions_to_move,
       (select coalesce(sum(p.total_weight), 0) from productions p where p.sku_code = sd.sku_code) as tonnage_to_move
from dedupe d
left join skus sd on lower(sd.description) = lower(d.short_desc)
left join skus sc on lower(sc.description) = lower(d.canon_desc)
order by d.short_desc;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 0.5 — BACKFILL missing canonical SKU(s). If STEP 0 shows canon_code = null
-- for a row, the canonical SKU is absent from the live `skus` table (it exists in
-- the app's DEFAULT_SKUS catalog but was never persisted), so STEP 1 would skip it.
-- This inserts it so STEP 1 can resolve and remap. Idempotent (inserts only when the
-- code is absent); a fresh UUID id avoids any primary-key collision. Values sourced
-- from src/data/skus.js (SKU-252, MM ID 1141-13068-10078406, 20 NB × 2.80).
-- ─────────────────────────────────────────────────────────────────────────
insert into skus (id, product_type, sku_code, description, thickness, length,
                  nominal_bore, outside_diameter, hsn_code, status,
                  weight_per_tube, base_conversion, thickness_extra, ladder_price, total_conversion)
select gen_random_uuid()::text, 'CHS', '1141-13068-10078406',
       'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.80x6000',
       2.8, 6000, '20', '26.9', '72080000', 'published',
       9.984949063645667, 2900, 0, 2900, 28.956352284572432
where not exists (select 1 from skus where sku_code = '1141-13068-10078406');


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 1 — APPLY (transactional). Remap production onto the canonical code and
-- retire the duplicate SKU. Pairs whose canonical code is missing are skipped
-- by the inner joins (no production is ever stranded under a non-existent code).
-- ─────────────────────────────────────────────────────────────────────────
begin;

with dedupe(short_desc, canon_desc) as (values
  ('MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.6x6000', 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.60x6000'),
  ('MS RHS One Helix IS 4923 YSt 210 Black 100x50x3.2x6000', 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x3.20x6000'),
  ('MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.5x6000',  'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.50x6000'),
  ('MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.8x6000',  'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.80x6000')
),
map as (
  select sd.sku_code as dup_code, sc.sku_code as canon_code
  from dedupe d
  join skus sd on lower(sd.description) = lower(d.short_desc)
  join skus sc on lower(sc.description) = lower(d.canon_desc)
)
update productions p
   set sku_code = m.canon_code
  from map m
 where p.sku_code = m.dup_code;

with dedupe(short_desc, canon_desc) as (values
  ('MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.6x6000', 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.60x6000'),
  ('MS RHS One Helix IS 4923 YSt 210 Black 100x50x3.2x6000', 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x3.20x6000'),
  ('MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.5x6000',  'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.50x6000'),
  ('MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.8x6000',  'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.80x6000')
),
map as (
  select sd.sku_code as dup_code
  from dedupe d
  join skus sd on lower(sd.description) = lower(d.short_desc)
  join skus sc on lower(sc.description) = lower(d.canon_desc)
)
update skus s
   set status = 'draft'
  from map m
 where s.sku_code = m.dup_code;

commit;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 2 — POST-CHECK (read-only). Each duplicate code should now hold 0 production.
-- ─────────────────────────────────────────────────────────────────────────
with dedupe(short_desc) as (values
  ('MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.6x6000'),
  ('MS RHS One Helix IS 4923 YSt 210 Black 100x50x3.2x6000'),
  ('MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.5x6000'),
  ('MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.8x6000')
)
select sd.sku_code as dup_code, sd.status,
       (select count(*) from productions p where p.sku_code = sd.sku_code) as productions_remaining
from dedupe d
join skus sd on lower(sd.description) = lower(d.short_desc)
order by dup_code;


-- ─────────────────────────────────────────────────────────────────────────
-- STEP 3 — DETECTOR (read-only). Surfaces OTHER decimal-format duplicate SKUs
-- (a thickness written "X.Y0" alongside the same product written "X.Y"). Review
-- any groups returned and extend STEP 1's VALUES list if needed. NOTE: this only
-- catches the trailing-zero pattern (e.g. 2.50/2.5), which is the one observed; it
-- does not catch "2.00" vs "2". The app-side guardrail (canonicalSkuKey) prevents
-- new duplicates going forward.
-- ─────────────────────────────────────────────────────────────────────────
select regexp_replace(lower(description), '(\.[0-9])0(x6000)\s*$', '\1\2') as canonical_form,
       count(*)              as code_count,
       array_agg(sku_code)   as codes,
       array_agg(description) as descriptions
from skus
group by 1
having count(*) > 1
order by 1;


-- ─────────────────────────────────────────────────────────────────────────
-- NOTE (manual review, not auto-fixed): production also exists under
-- 'MS RHS One Helix IS 4923 YSt 210 Black 40x20x3x6000' (~3.8 T), which has no
-- canonical counterpart in the SKU master and is not currently dispatched, so it
-- is NOT remapped here. Decide whether to add a canonical 40x20x3 SKU and remap,
-- or leave it as-is (it does not cause a negative-inventory row).
-- ─────────────────────────────────────────────────────────────────────────

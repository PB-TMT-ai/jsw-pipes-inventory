# Blueprint: Add a SKU to the SKU Master

## Goal
Add one or more tube SKUs to the SKU Master (the **Masters** tab).

## Read first
- `docs/DATA-MODEL.md` — `jsw:skus` → `skus`, and the `sku_code` upsert arbiter
- `docs/ALGORITHMS.md` — no density constants in app code

## The two places a SKU lives

| Layer | File / table | Role |
|---|---|---|
| Catalog | `src/data/skus.js` (`DEFAULT_SKUS`) | Fallback + the source `skuImportResolver` self-heals from |
| Live master | Supabase `skus` table | **What the running app actually reads** |

The table is populated, so **editing `src/data/skus.js` alone changes nothing in the live app.**
A new SKU goes in **both**, under the *same* `sku_code`.

`db.js:91` arbitrates the upsert on `sku_code`, not `id`, because `skus.sku_code` is UNIQUE — so the
two layers may hold different `id`s for one SKU without conflict. Catalog rows use `SKU-nnn`; live
rows use a UUID (`gen_random_uuid()::text`), which is what keeps an operator-created row from ever
colliding with a catalog id.

## Inputs required

- **The real ERP MM ID.** `skuCode` is the ERP material code (`1139-13064-10080504`), *not* a
  readable string. Invent one and the SKU will never match an ERP order or invoice line by code.
  Find it in the data you already have:

  ```sql
  select o.mm_id, o.description, count(*) lines, sum(o.quantity) qty
  from orders o left join skus s on s.sku_code = o.mm_id
  where s.sku_code is null
    and coalesce(o.deleted,false) = false
    and o.description not ilike '%freight%'
  group by 1,2 order by qty desc;
  ```

  If the size is not there, ask for the MM ID. Do not proceed without it.

## Steps

1. **Add the batch line** to the `MISSING` array in `scripts/generate-skus.mjs`, with a dated
   comment. Codes already in the catalog are skipped automatically, so past batches can stay.

   ```javascript
   // 2026-08-28 batch: 72x72x3 is ordered in ERP (8 order lines) but absent from the catalog.
   { mmId: '1139-13064-10080504', description: 'MS SHS One Helix IS 4923 YSt 210 Black 72x72x3x6000' },
   ```

2. **Run the generator.** Never hand-compute a weight — the density formula is quarantined in this
   script for a reason, and it self-checks against two known catalog rows before emitting.

   ```bash
   node scripts/generate-skus.mjs
   ```

3. **Paste the emitted objects** before the closing `]` of `DEFAULT_SKUS` in `src/data/skus.js`,
   and update the entry count in the header comment.

4. **Verify the canonical key does not shift.** This is the step that protects existing numbers.
   Orders for a SKU the master lacks already resolve through `skuKeyResolver`'s description
   fallback; adding the SKU must land on the *same* key, or reported tonnage moves.

   ```javascript
   canonicalSkuKey(orderDescription) === canonicalSkuKey(newSkuObject)   // must be true
   ```

   Then run the suite: `npx vitest run`.

5. **Backfill the live table** with the same values, guarded so it is idempotent:

   ```sql
   insert into skus (id, product_type, sku_code, description, height, breadth, thickness, length,
                     nominal_bore, outside_diameter, hsn_code, status,
                     weight_per_tube, base_conversion, thickness_extra, ladder_price, total_conversion)
   values (gen_random_uuid()::text, 'SHS', '1139-13064-10080504',
           'MS SHS One Helix IS 4923 YSt 210 Black 72x72x3x6000',
           72, 72, 3, 6000, '', '', '72080000', 'published',
           38.998799999999996, 2900, 0, 2900, 113.09651999999998)
   on conflict (sku_code) do nothing;
   ```

6. **Check** the Masters tab lists it and the Production SKU dropdown offers it.

## Conventions

- **Description**: `MS <TYPE> One Helix IS <std> YSt 210 Black <H>x<B>x<T>x<L>`. Thickness is padded
  to 2 decimals **only when fractional** — `72x72x3x6000` and `72x72x4x6000`, but `72x72x2.50x6000`.
- **Cost fields** (`scripts/generate-skus.mjs:19-22`):
  - `weightPerTube` — kg per tube
  - `thicknessExtra` ladder — t≤1.2→1000, t≤1.6→750, t≤2.0→500, else 0
  - `ladderPrice` = `baseConversion + thicknessExtra` (base is 2900)
  - `totalConversion` = `weightPerTube × ladderPrice / 1000`
- **CHS** uses `nominalBore` + `outsideDiameter` (both strings) with `height`/`breadth` `null`.

## Edge cases

- **CHS above 100 NB.** The script derives OD from NB using existing catalog rows only, and the
  catalog stops at 100 NB (114.3). For 125 NB / 150 NB it throws `No OD known for NB …` rather than
  guess — OD drives `weightPerTube`, so a wrong one silently corrupts costing. Get the OD from the
  ERP material master and add one catalog row for that NB first.
- **The UI "+ Add SKU" form** auto-generates `SHS-72x72x3.00`-style codes and a `3.00` description —
  both diverge from the catalog. Overwrite them before saving. Use the form for a one-off; use this
  blueprint for anything that must survive a fresh deploy.
- **A `published` SKU must have `weightPerTube > 0`** or the save is rejected (`App.jsx:1820`).
- **Delete is blocked** while any production references the code (`App.jsx:1834`).

## Known issues

- `src/data/skus.js` carries a pre-existing duplicate physical identity: `1141-13068-10072461` and
  `1141-13068-10079344` are both CHS 25 NB × 2.50 × 6000. `scripts/dedupe-sku-master.sql` is the
  tool for collapsing a pair like this; it has not been run for these two.

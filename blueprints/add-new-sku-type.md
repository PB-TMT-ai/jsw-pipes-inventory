# Blueprint: Add a New SKU Product Type

## Goal
Add a new product type (e.g., RHS, CHS, ERW) with SKU entries to the SKU Master.

## Inputs Required
- productType: string (e.g., "RHS", "CHS", "ERW")
- skuList: array of {height, breadth, thickness, length} specifications

## Steps
1. Open `src/App.jsx`
2. Find `DEFAULT_SKUS` array near the top of the file
3. Add new SKU objects following the existing pattern:
   ```javascript
   { id: 'SKU-XXX', productType: 'RHS', skuCode: 'RHS-40x20x2.00',
     description: 'MS RHS One Helix IS 4923 YSt 210 Black 40x20x2.00x6000',
     height: 40, breadth: 20, thickness: 2.0, length: 6000,
     nominalBore: '', outsideDiameter: '', hsnCode: '72080000', status: 'published',
     weightPerTube: 10.5504, baseConversion: 2900, thicknessExtra: 500,
     ladderPrice: 3400, totalConversion: 35.87136 }
   ```
   Cost fields (from Book 74.xlsx):
   - `weightPerTube` — kg per tube (computed per geometry/thickness)
   - `baseConversion` — ₹/MT base rate (typically 2900)
   - `thicknessExtra` — ₹/MT thickness premium
   - `ladderPrice` — `baseConversion + thicknessExtra`
   - `totalConversion` — `weightPerTube × ladderPrice / 1000`
4. If this is a CHS (circular) type, populate `outsideDiameter` and `nominalBore` instead of height/breadth
5. Verify the SKU auto-generation in the SKUMaster component handles the new type
6. Test: check SKU Master tab shows new entries, Stage 3 dropdown includes them

## Edge Cases
- CHS uses diameter instead of height×breadth — update description format
- ERW uses nominal bore — ensure form shows relevant fields
- If > 50 SKUs, consider adding pagination to the DataTable

## Known Issues
- `DEFAULT_SKUS` is only used as the React fallback when the `skus` Supabase table is empty; the canonical copy lives in the `skus` table (seeded once by `supabase-setup.sql`). To add SKUs to a live deployment, use the "+ Add SKU" form in the UI (writes straight to Supabase) or insert a row via the Supabase SQL editor. "Reset Data" re-pushes `DEFAULT_SKUS` to Supabase, overwriting anything added through the UI.

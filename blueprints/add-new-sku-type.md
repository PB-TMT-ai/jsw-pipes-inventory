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
     nominalBore: '', outsideDiameter: '', hsnCode: '7306', status: 'published' }
   ```
4. If this is a CHS (circular) type, populate `outsideDiameter` and `nominalBore` instead of height/breadth
5. Verify the SKU auto-generation in the SKUMaster component handles the new type
6. Test: check SKU Master tab shows new entries, Stage 3 dropdown includes them

## Edge Cases
- CHS uses diameter instead of height×breadth — update description format
- ERW uses nominal bore — ensure form shows relevant fields
- If > 50 SKUs, consider adding pagination to the DataTable

## Known Issues
- DEFAULT_SKUS only loads on first run (or after Reset Data). To add SKUs to an existing install, use the "+ Add SKU" form in the UI or update localStorage directly.

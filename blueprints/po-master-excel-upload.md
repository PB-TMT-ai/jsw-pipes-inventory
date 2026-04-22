# Blueprint: PO Master Excel Upload

## Goal
Import a monthly Zoho Books Purchase Order export into the PO Master tab, matching existing rows by (purchaseOrderNumber + itemName) and persisting to Supabase.

## Inputs Required
- file: `.xlsx` (Zoho Books PO export) with columns: Purchase Order Date, Purchase Order Number, Vendor Name, Item Name, QuantityOrdered, Item.CF.Updated Qty, Item Price, Item.CF.Updated Price, CF.PO end Date

## Code Touchpoints
1. `src/App.jsx` — `toISODate(v)` — date parser (Date object / ISO / MM-DD-YYYY / DD-MM-YYYY / YYYY/M/D)
2. `src/App.jsx` — `mapExcelRow(row)` — column normalization + value coercion (`num()`, `toISODate()`)
3. `src/App.jsx` — `POMaster.onUpload` — xlsx read + upsert-by-key merge
4. `src/lib/db.js` — `toSnake()` — converts `''` → `null` before Supabase upsert
5. `src/lib/db.js` — `emitSyncError()` — surfaces 400 errors into the UI banner

## Steps
1. User clicks "Upload Excel" in PO Master tab → file picker opens.
2. `XLSX.read(buf, { type: 'array', cellDates: true })` parses the workbook; date cells become JS Date objects.
3. `XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })` — **raw: true is required** so date cells stay as Date objects and route through `toISODate`'s Date branch cleanly.
4. Each row is normalized via `mapExcelRow` — header names are lowercased + punctuation-stripped for flexible matching.
5. Rows without `purchaseOrderNumber` AND `itemName` are dropped (header/blank rows).
6. Existing rows keyed by `${purchaseOrderNumber}||${itemName}` are merged; new rows get a fresh `uid()`.
7. `setPurchaseOrders` triggers `syncToSupabase`. `toSnake` maps `''` → `null` so nullable numeric/date columns accept blank cells.
8. On any 400 response, the red `SyncErrorBanner` shows the Postgres message.

## Edge Cases
- **Date in MM/DD/YYYY (US/Zoho default)**: `toISODate` detects when the second segment is > 12 and swaps to MM/DD/YYYY interpretation.
- **Date in DD/MM/YYYY (IN default)**: detected when the first segment is > 12; ambiguous cases (both ≤ 12) default to DD/MM/YYYY.
- **Empty numeric cells (updatedQty, updatedPrice, quantityOrdered)**: `num()` returns `''`, `toSnake` converts to `null`, Postgres accepts.
- **Empty `CF.PO end Date`**: `toISODate('')` returns `''`, becomes `null` on upsert.
- **Re-upload of same Excel**: matches by (PO# + Item Name) and merges via `{ ...existing, ...row }`. ⚠️ This overwrites any fields the user manually edited in the app with the Excel value. Known limitation — not yet fixed.
- **Invalid date that can't be parsed**: `toISODate` returns `''` → `null`. The row still saves but `purchase_order_date` / `po_end_date` will be NULL.
- **Mixed date formats in one file**: each cell parsed independently; heterogenous formats are OK.

## Known Issues
- **Re-upload clobbers manual edits** (`src/App.jsx:1877`): `{ ...existing, ...row }` means if the Excel doesn't have updatedQty/updatedPrice/poEndDate populated, those will overwrite manually-set values in the app. Fix would be to only overwrite when the Excel cell is non-empty.
- **No header validation**: if column headers are misspelled, rows silently become empty and get filtered out with a generic "No valid rows found" message.
- **Batch upsert is atomic**: if one row in the batch is rejected by Postgres, none of the rows persist. Per-row fallback not implemented.

## Related Learnings
- 2026-04-22 (Supabase sync): `'' → null` in toSnake
- 2026-04-22 (PO Master Excel upload): MM/DD vs DD/MM detection
- 2026-04-22 (xlsx 0.18.x): local-time Date objects need local getters

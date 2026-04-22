# Blueprint: Upload the Monthly PO Master Excel

## Goal
Import the Zoho Books monthly Purchase Order export into the PO Master tab so procurement data is visible inside the inventory app and can be cross-referenced against coils (Stage 1) and future bundles.

## Inputs Required
- **file:** `.xlsx` (or `.xls`) export from Zoho Books
- **sheet:** first sheet only — additional sheets are ignored
- **required columns** (any header case/spacing/punctuation is accepted; they map internally as follows):

| Excel header (Zoho)      | Internal field          | Required |
|--------------------------|-------------------------|----------|
| Purchase Order Date      | `purchaseOrderDate`     | No       |
| Purchase Order Number    | `purchaseOrderNumber`   | **Yes**  |
| Vendor Name              | `vendorName`            | No       |
| Item Name                | `itemName`              | **Yes**  |
| QuantityOrdered          | `quantityOrdered`       | No       |
| Item.CF.Updated Qty      | `updatedQty`            | No       |
| Item Price               | `itemPrice`             | No       |
| Item.CF.Updated Price    | `updatedPrice`          | No       |
| CF.PO end Date           | `poEndDate`             | No       |

Rows missing Purchase Order Number OR Item Name are silently skipped (they cannot be upserted).

## Steps
1. Open the app, click the **PO Master** tab (last in the nav).
2. Click **Upload Excel** and select this month's Zoho export.
3. A banner appears:
   - Green: `Imported: N new, M updated`
   - Red: error message — see "Edge Cases" below.
4. Spot-check a few rows in the table (search by PO number).
5. If a specific row needs correction, click the pencil icon, edit fields, Update.
6. To remove a row from view, click the trash icon (soft-delete — future uploads will NOT re-add it).

## Upsert Behaviour
- **Key:** `(Purchase Order Number + Item Name)`
- **Match found** → merge via `{...existing, ...newRow}`. Any manual edits on fields NOT present in the upload are preserved.
- **No match** → insert new row with a fresh UUID.
- **Soft-deleted rows** are kept aside during upsert so they are not resurrected.
- **Nothing is ever hard-deleted by upload.**

## Output
Rows persisted to Supabase table `purchase_orders`. `useSupabaseStore` writes happen in the background; a hard browser refresh reloads them.

## Edge Cases
- **`Workbook has no sheets`** — the file is corrupt or is not a real XLSX. Re-export from Zoho.
- **`No valid rows found (need Purchase Order Number + Item Name)`** — the header row doesn't include both required columns, or all data rows have one of them blank. Open the file, confirm the headers, re-save.
- **Date formats** — `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, and true Excel date cells are all accepted. If a date appears as a number in the table, the cell was text formatted as `General`; re-format the source column as Date and re-export.
- **Duplicate rows in one file** (same PO + Item appearing twice) — only the last occurrence wins.
- **Character encoding / ₹ symbol** — prices are parsed via `Number(String(v).replace(/[, ]/g, ''))`. Values like `"1,25,000"` parse correctly; values like `"₹1,25,000"` will NOT (the ₹ blocks `Number()`). Strip currency symbols in the source export.

## Known Issues
- The `xlsx` chunk (SheetJS, ~430 kB) is loaded on first click — the button may take ~1 s on slow networks before parsing starts. This is a one-time download per session.
- `xlsx@0.18.5` has open advisory CVE-2023-30533 (prototype pollution on `XLSX.read` with untrusted input). Acceptable because files come from an in-house source. If this changes, upgrade or switch to `@sheet/core`.

## Related Files
- Parser & UI: `src/App.jsx` — `POMaster`, `mapExcelRow`, `toISODate`
- Store binding: `src/lib/db.js` — `TABLE_MAP['jsw:purchaseOrders']`
- Table DDL: `supabase-setup.sql` — `create table purchase_orders`

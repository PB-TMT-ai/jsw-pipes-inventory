# Blueprint: Import the dispatch (One Helix invoice) Excel

## Goal
Load the "One Helix" invoice export into Stage 4 Dispatch so each invoice becomes a dispatch
record, SKUs are matched & costed, and re-uploads **can never double-count** (per-line idempotency).

## Input
The **One Helix** invoice `.xlsx` (Zoho-style, one row per invoice line, 13 columns). Columns used
(case/spacing-insensitive — matched by `pick()` in `mapDispatchRow`):

| App field | Excel column | Notes |
|-----------|--------------|-------|
| dateOfDispatch | **Invoice Date** | Excel serial or date → parsed via `toISODate` |
| invoiceNo | **Invoice Number** | grouping key (one dispatch per invoice) |
| SKU | **Item Name** | **== SKU master `description`** (resolves by description, then canonical key) |
| weight (MT) | **Quantity** | MT unless a `Usage unit` column says NOS/PCS → then pieces |
| customer | **Customer Name** | stored **per entry** (JSONB), shown in table + reconciliation CSV |
| childOrderId | **PurchaseOrder** | == the order's Child Order ID → preserves distributor/order linkage |
| poRef / branch | **CF.Purchase Bill Reference No** / **Branch Name** | stored per entry (reference only) |

There is **no MM ID, no Sku ID, no pieces** column → the SKU is matched by **Item Name**, and
pieces are derived from weight using `SKU.weightPerTube`. Any **Freight** line is skipped.

> **July 2026 — the entry point moved.** Dispatch/invoice data now loads from the **Orders &
> Invoice** tab's single **"Upload Sales Excel"** button (the One Helix workbook's **Invoice**
> sheet), NOT a Dispatch-tab uploader. The pipeline below is unchanged — it was extracted from
> `Dispatch.onUpload` into the module-level `buildDispatchRecords(rows, {skus, productions, existing})`
> reused by the combined upload. The combined upload **replaces** dispatches on every run (soft-delete
> prior + rebuild), so the separate "Replace existing" checkbox is gone. The Dispatch tab is now a
> read-only records + Invoice Reconciliation view.

## Steps
1. **Orders & Invoice tab → "Upload Sales Excel"** → pick the One Helix workbook. Its **Orders**
   sheet loads the order book (with Confirmed/Non-confirmed); its **Invoice** sheet loads dispatches.
2. The importer (`buildDispatchRecords` in `src/App.jsx`, called from the `Orders` component):
   - filters to product lines (`skuDescRaw && !Freight && (weight||pieces)`);
   - resolves each SKU by exact **description**, then **canonical identity** (`canonicalSkuKey`);
   - **self-heals** unknown-but-cataloged SKUs: if a `skuCode` is in `DEFAULT_SKUS` but not the
     live `skus` store, it's added via `setSkus` (persists to Supabase);
   - **de-duplicates per line** via `dedupeDispatchLines` (`src/lib/calc.js`) — a line is skipped
     when its key `invoiceNo | skuCode | weight` already exists among non-deleted dispatch entries,
     OR repeats within the same file. So a re-upload of the same/overlapping file is a no-op;
   - groups lines into one dispatch per invoice; coil trace inherited from production FIFO.
3. Read the result banner: `Imported N invoice(s), M new line(s) · skipped K duplicate line(s) · …`.
   A clean re-upload reads `0 new lines — K duplicate line(s) skipped (already imported)`.

## Replace mode (one-time rebuild)
Tick **Replace existing** before uploading to rebuild dispatch data from a clean full-period file:
the current non-deleted dispatch records are **soft-deleted** (recoverable) and the file is loaded
fresh. Use this once when switching source files or to clear historically double-counted data.
Because dedup is scoped to non-deleted records, the fresh import never collides with the replaced
rows. Leave it **unticked** for normal daily appends.

## Handling "unresolved SKU(s)" (a new size not yet in the catalog)
If the banner reports unresolved item names, those sizes aren't in `DEFAULT_SKUS` yet:
1. Add the unresolved `{mmId, description}` pairs to the `MISSING` array in
   `scripts/generate-skus.mjs`.
2. Run `node scripts/generate-skus.mjs` — it prints ready-to-paste SKU objects
   (continues the `SKU-NNN` id sequence) and self-checks two known weights.
3. Paste them before the closing `]` of `DEFAULT_SKUS` in `src/data/skus.js`.
4. Re-upload — the new SKUs resolve and self-heal into the DB.

## Weight model (lives ONLY in scripts/, never src/ — CLAUDE.md "no density constants")
- SHS/RHS: `weightPerTube = 7850 × (2·t·(H+B) − 4·t²) / 1e6 × (L/1000)`
- CHS: `weightPerTube = 7850 × π · t · (OD − t) / 1e6 × (L/1000)` (NB→OD from existing CHS rows)
- `thicknessExtra`: t≤1.2→1000, t≤1.6→750, t≤2.0→500, else 0;
  `ladderPrice = 2900 + thicknessExtra`; `totalConversion = weightPerTube × ladderPrice / 1000`.

## Edge cases
- **Re-upload of the same/overlapping file** → already-imported *lines* are skipped (no dupes),
  even for the same invoice re-exported with more lines (only the new lines import).
- **Duplicate line inside one file** → collapsed to one (within-file dedup).
- **Correcting an invoice** → soft-delete the existing dispatch record, then re-upload; the deleted
  record does NOT suppress the fresh import (dedup is scoped to non-deleted).
- **Order-line reconciliation** → the One Helix file has no per-line `Sku ID`, so the Sales
  Dashboard / Order Backlog reconcile at the **order (PurchaseOrder/childOrderId)** level, falling
  back to the order sheet's own `invoicedQty`. Customer-level and per-order totals stay correct;
  only the split within a multi-line order loses precision. Coil tracker, SKU inventory, KPIs, and
  the Invoice Reconciliation CSV are unaffected.
- **SKU with no production logged** → empty FIFO trace → that line shows weight but ₹0 cost
  (allow + warn), until production for that SKU exists.
- **New per-line field that isn't a real `dispatches` column** (customer, grade, childOrderId …)
  → store it **inside `bundleEntries[]`**, never on the record top level. `db.js` converts only
  top-level keys, so a stray top-level key makes Supabase reject the whole upsert with
  *"Could not find the 'X' column of 'dispatches'"* and the rows silently vanish on refresh.

## Verify
`npm test` (dispatchLineKey + dedupeDispatchLines suites pass) and `npm run build` (compiles).
End-to-end: **Replace existing** + upload → one record per invoice, 0 unresolved, ~1,931 MT for the
Mar–Jun file; re-upload (unticked) → `0 new lines — N duplicate line(s) skipped`; SKU inventory
shows no doubling-driven negative stock; Invoice Reconciliation CSV shows Customer + non-zero cost.

# Blueprint: Import the daily dispatch (ERP invoice) Excel

## Goal
Load the daily ERP invoice export into Stage 4 Dispatch so each invoice becomes a dispatch
record, SKUs are matched & costed, and re-uploads don't create duplicates.

## Input
The ERP invoice `.xlsx` (one row per invoice line, ~53 columns). Columns used
(case/spacing-insensitive — matched by `pick()` in `mapDispatchRow`):

| App field | Excel column | Notes |
|-----------|--------------|-------|
| dateOfDispatch | **Invoice date** _(or_ **order_date**_)_ | date-formatted → parsed via `toISODate` |
| invoiceNo | **Invoice number** _(or_ **Opportunity ID**_)_ | grouping key (one dispatch per invoice) |
| SKU | **MM ID** | **== SKU master `skuCode`** (exact match) |
| SKU (fallback) | **MM Description** | exact `description` match |
| weight (MT) | **Invoiced qty** | `DO qty` is a fallback |
| customer | **Distributor Name** | stored **per entry** (JSONB), shown in table + reconciliation CSV |
| grade / diameter | **Grade** / **Diameter mm** | stored per entry |

There is **no vehicle and no pieces** column → pieces are derived from weight using
`SKU.weightPerTube`. The **Freight** line (`MM ID 9000000`, qty 0) is skipped.

### Export variant: `JODL_ERP_private_brand` (no Invoice date / Invoice number columns)
This ERP export has **no "Invoice date" and no "Invoice number" column** at all. Its only
date is **`order_date`** and its natural per-shipment id is **`Opportunity ID`** (each
Opportunity ID maps 1:1 to a single date + distributor). `mapDispatchRow` therefore appends
`orderdate` to the date `pick()` and `opportunityid` to the invoiceNo/orderId `pick()`
(as **fallbacks after** the real columns, so a file that carries the true invoice columns
still wins). Effect on this export: dates populate from order_date, INVOICE NO(S) shows the
Opportunity ID, the ~289 lines group into ~79 dispatch records, and re-uploads dedupe.
Caveat: the displayed date is the **sales-order** date (only date present), not a separate
invoice/dispatch date.

## Steps
1. **Dispatch tab → "Upload Dispatch Excel"** → pick the file.
2. The importer (`onUpload` in `src/App.jsx`):
   - filters to product lines (`mmId && mmId!=='9000000' && !Freight && (weight||pieces)`);
   - **skips invoices already imported** (dedupe by invoice number);
   - resolves each SKU by MM ID → `skuCode`, then exact description;
   - **self-heals** unknown-but-cataloged SKUs: if a `skuCode` is in `DEFAULT_SKUS` but not
     the live `skus` store, it's added via `setSkus` (persists to Supabase);
   - groups lines into one dispatch per invoice; coil trace inherited from production FIFO.
3. Read the result banner: `Imported N invoice(s), M line(s) · skipped … · added … SKU(s) · … unresolved`.

## Handling "unresolved SKU(s)" (a new size not yet in the catalog)
If the banner reports unresolved MM IDs, those sizes aren't in `DEFAULT_SKUS` yet:
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
- **Re-upload of the same/overlapping file** → already-imported invoices are skipped (no dupes).
- **Correcting an invoice** → dedupe is *skip*, not upsert; delete the existing dispatch
  record first, then re-upload.
- **SKU with no production logged** → empty FIFO trace → that line shows weight but ₹0 cost
  (allow + warn), until production for that SKU exists.
- **New per-line field that isn't a real `dispatches` column** (customer, grade, diameter …)
  → store it **inside `bundleEntries[]`**, never on the record top level. `db.js` converts
  only top-level keys, so a stray top-level key makes Supabase reject the whole upsert with
  *"Could not find the 'X' column of 'dispatches'"* and the rows silently vanish on refresh.
  The Dispatch table can still surface it via `bundleEntries?.[0]?.field`.

## Verify
`node scripts/generate-skus.mjs` (self-checks pass) and `npm run build` (compiles).
End-to-end: upload → expect one record per invoice, Freight excluded, 0 unresolved;
re-upload → all skipped; Invoice Reconciliation CSV shows Customer + non-zero cost.

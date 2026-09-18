# Blueprint: Import the dispatch (Zoho invoice register) Excel

## Goal
Load the **Zoho invoice register** into Stage 4 Dispatch so each invoice becomes a dispatch record,
SKUs are matched & costed, and re-uploads **can never double-count** — since ticket #192 that
guarantee comes from rebuilding only the dates the file covers, not from per-line dedup alone.

> **September 2026 — the source file changed (ticket #192).** The invoice source is now the **Zoho
> invoice register**, uploaded from its own **"Upload Invoice Excel"** button on the Orders tab. The
> One Helix workbook's `Invoice` sheet is **no longer read at all**; "Upload Order Excel" reads only
> its `Orders` sheet and writes **no** dispatches. The rules live in `buildInvoiceDispatches`
> (`src/lib/calc.js`). Two things the register forces that the ERP sheet did not:
> **(a)** it is company-wide — 44 warehouses, every segment — so `Warehouse Name` is both the plant
> and the filter, and a row it cannot place is **dropped and named on the banner**, never stored as
> `Unattributed` (`docs/adr/0013`);
> **(b)** it carries **one month**, so the upload rebuilds only `min`…`max` invoice date across the
> kept rows. Pointed at an unwindowed replace it would delete 4,570.4 T across 790 Mar–Aug lines.

## Input
The **Zoho invoice register** `.xlsx`, one row per invoice line. Columns used (case/spacing-
insensitive — matched by `pick()` in `mapInvoiceRow`, which delegates the shared fields to
`mapDispatchRow` so one alias list serves both):

| App field | Excel column | Notes |
|-----------|--------------|-------|
| dateOfDispatch | **Invoice Date** | Excel serial or date → parsed via `toISODate` |
| invoiceNo | **Invoice Number** | grouping key (one dispatch per invoice) |
| invoiceStatus | **Invoice Status** | `Void` ⇒ row dropped and counted with its tonnage. The **e-Invoice Status column is never consulted** — every `Cancelled` row is already `Void`, and 53 `Void` rows are not `Cancelled`, so reading it could only ever miss rows. A status outside `Overdue`/`Open`/`Closed`/`Approved` is **imported anyway** and flagged separately |
| SKU (name) | **Item Name** | **== SKU master `description`**. The register carries no MM ID, so the description is the only key |
| grade | (read out of **Item Name**) | `YSt 210`, via `gradeFromDescription`. No grade column on this file; blank when the name carries none, never defaulted |
| weight (MT) | **Quantity** | MT unless a `Usage unit` column says NOS/PCS → then pieces |
| customer | **Customer Name** | stored **per entry** (JSONB), shown in table + reconciliation CSV. Replaced by the **order book's** name when the child order matches; otherwise the SFDC code glued to its end is split off into `distributorCode` and the remainder kept (#193) |
| distributorCode | — | no column on this file. Route 1: the matched order's `Distributor Code`. Route 2: the trailing **SFDC** id in `Customer Name` (#193) |
| orderLineId / orderId | — | no column on this file. From the order line matched on **`PurchaseOrder` + `Item Name`** — the pair, never the child order alone, or every size on one child order would net against the first line (#193) |
| childOrderId | **PurchaseOrder** | == the order's Child Order ID → the join key attribution runs on |
| poRef / branch | **CF.Purchase Bill Reference No** / **Branch Name** | stored per entry (reference only) |
| shipToState | — | the register carries **neither a state column nor a GSTIN**, so state comes off the **matched order** (#193). Route 2 and a no-match leave it **blank** — never guessed from a name, city or pincode — counted on the banner, and the distributor reads `Unmapped` / `?` |
| plant | **Warehouse Name** | resolved via `resolvePlant` (`calc.js`) against the plant master's `erpNames`. On this file it is also the **filter**: no match ⇒ the row is **dropped** and counted **by warehouse name**. `Wanaparthy_One Helix` is Hyderabad; the other three names already matched (`docs/adr/0013`) |

There is **no pieces** column → pieces are derived from weight using `SKU.weightPerTube`. Any
**Freight** line is skipped, as is a row with no invoice date (an undated row is inside no window,
so a later rebuild could never supersede it — it would double-count on the next upload).

> **September 2026 — the rules moved to `calc.js` (ticket #190).** The row mapper and the record
> builder live in `src/lib/calc.js`, not `App.jsx`, because no test in this repo can import
> `App.jsx` (`src/lib/module-resolution.test.js` records why `src/lib` is the boundary). `App.jsx`
> keeps the file reading, the call and the banner. Add any NEW import rule to
> `buildInvoiceDispatches`, with a test beside the others in `calc.test.js`.

> **July 2026 — the entry point moved.** Dispatch/invoice data loads from the **Orders & Invoice**
> tab, NOT a Dispatch-tab uploader, and the upload **rebuilds** rather than appends — so the
> separate "Replace existing" checkbox is gone. The Dispatch tab is a read-only records + Invoice
> Reconciliation view.

## Steps
1. **Orders & Invoice tab → "Upload Order Excel"** → pick the One Helix workbook; its **Orders**
   sheet replaces the order book (with Confirmed/Non-confirmed). Do this **first**: distributor,
   ship-to state AND the order-line link are all read off the order book (#193). Into a stale or
   empty order book the invoice upload still imports the right tonnage, but the lines read
   `Unmapped` — the banner warns below an 80% match rate and names this step as the fix. Fixing it
   is just re-uploading the invoice file after the orders; the window rebuild is idempotent.
2. **→ "Upload Invoice Excel"** → pick the Zoho invoice register.
3. The importer (`buildInvoiceDispatches` in `src/lib/calc.js`, called from the `Orders` component)
   applies, in order:
   - the **warehouse filter** — `Warehouse Name` → plant master; no match ⇒ dropped, counted by name;
   - the **Void filter** — `Invoice Status` = `Void` ⇒ dropped, counted with its tonnage;
   - **attribution** (#193) — distributor, ship-to state and the order-line link off the order book
     via `PurchaseOrder`, SFDC code in `Customer Name` as the fallback, blank (and counted) when
     neither resolves;
   - filters to product lines (`skuDescRaw && !Freight && (weight||pieces)`) and drops undated rows;
   - computes the **rebuild window** = `min`…`max` invoice date across exactly the rows it will
     write, and hands it to `replaceAll` — so dispatches outside it keep their rows, ids and
     coil allocations. **An empty or wrongly-picked file yields a null window and clears nothing**;
   - resolves each SKU via `skuImportResolver` (`src/lib/calc.js`): **MM ID** → exact
     **description** → **canonical identity** (`canonicalSkuKey`), live master before catalog;
   - **self-heals** unknown-but-cataloged SKUs: a product in `DEFAULT_SKUS` but not in the live
     `skus` store is added via `setSkus` (persists to Supabase) — as a **copy with a fresh id**,
     and only when its code, canonical identity, *and* description are all absent from the master.
     `skus.sku_code` is UNIQUE, so inserting a twin under a second id is rejected by Postgres and
     fails the entire SKU-master sync batch (see LEARNINGS 2026-07-27);
   - **de-duplicates per line** via `dedupeDispatchLines` (`src/lib/calc.js`) — a line is skipped
     when its key `invoiceNo | skuCode | weight` already exists among non-deleted dispatch entries,
     OR repeats within the same file. So a re-upload of the same/overlapping file is a no-op;
   - groups lines into one dispatch per invoice; coil trace inherited from production FIFO.
4. Read the result banner: `Rebuilt 2026-09-01 → 2026-09-16 · 58 invoice(s), 252 line(s), 1,453.5T ·
   790 line(s) / 4,570.4T outside the window left alone · skipped Salem_JSW Steel (204) · …`.
   The skipped-warehouse list is the detector for a warehouse renamed in Zoho — read it every day.

## Correcting an older month
Upload a file that **covers** it. The upload rebuilds only the dates inside its own file, so a
correction to an August invoice is not picked up by a September export; re-export from Zoho with a
date range that includes August and upload that. This is stated on the Dispatch tab too.

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
- **Correcting an invoice** → re-upload a register export whose date range covers it; the window
  rebuild replaces the whole period from the file, so a corrected or newly-voided invoice takes
  effect without any hand editing.
- **A warehouse renamed in Zoho** → its rows are dropped and the banner names it with a count. Add
  the new string to that plant's `erpNames` in `src/data/plants.js` and re-upload.
- **Order-line reconciliation** → the register has no per-line `Sku ID`, so the Sales Dashboard /
  Order Backlog reconcile at the **order (PurchaseOrder/childOrderId)** level, falling back to the
  order sheet's own `invoicedQty`. Customer-level and per-order totals stay correct; only the split
  within a multi-line order loses precision. Coil tracker, SKU inventory, KPIs, and the Invoice
  Reconciliation CSV are unaffected.
- **SKU with no production logged** → empty FIFO trace → that line shows weight but ₹0 cost
  (allow + warn), until production for that SKU exists.
- **New per-line field that isn't a real `dispatches` column** (customer, grade, childOrderId …)
  → store it **inside `bundleEntries[]`**, never on the record top level. `db.js` converts only
  top-level keys, so a stray top-level key makes Supabase reject the whole upsert with
  *"Could not find the 'X' column of 'dispatches'"* and the rows silently vanish on refresh.

## Verify
`npm test` (the `buildInvoiceDispatches`, `dispatchLinesOutsideWindow`, `rowsOutsideWindow`,
`dispatchLineKey` and `dedupeDispatchLines` suites pass) and `npm run build` (compiles).
End-to-end on the 17-Sep-2026 register (6,736 rows, 44 warehouses) — **verified 17-Sep-2026** against
the live 333-row SKU master: **58 invoices, 252 lines, 1,453.5 T**, window **2026-09-01 → 2026-09-16**
— Hyderabad 545.3, Tapi 520.5, NPMD 269.7, Lepakshi 118.1; 0 unresolved SKUs, 0 undated rows, 0
duplicate lines, 23 Void rows / 108.3 T dropped, 40 warehouses skipped by name. Upload the same file
twice → identical totals, no doubling. **790 lines / 4,570.4 T** (Mar–Aug) reported as left alone and
still on the Dispatch tab. Invoice Reconciliation CSV shows Customer + non-zero cost.

The register has **no `Usage unit` column**, so `Quantity` is read as MT. Nothing but the tonnage
tying to 1,453.5 confirms that — a pieces/MT mix-up fails no test and throws no error, so **check the
total against the file before trusting a register whose shape has changed.**

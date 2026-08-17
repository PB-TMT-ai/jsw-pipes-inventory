# Answers to the tech team's 11 questions

> Everything below is verified against the code in this repo (file:line given for each answer),
> not against the ticket text. Where the ticket assumes something the system doesn't do, that is
> called out explicitly.
>
> **Three of the eleven are genuinely open decisions** — Q2 (partly), Q8 (Contractor PO) and Q9
> ("Conversion Form"). The other eight are already settled in code; the answers just weren't
> written down in one place.

---

## 1. Mother Coil linkage — how do Dispatch/Invoice records trace back?

**Answer: through `coilAllocations`, which every dispatch line already carries. Nothing new is needed.**

Each dispatch (= invoice) line stores an array
`coilAllocations: [{ babyCoilId, hrCoilId, pieces, weight }]`, where **`hrCoilId` is the mother
coil**. It is inherited from the production batch that made those pieces
(`dispatchCoilTrace`, `src/lib/calc.js:1287`) — production is drained oldest-first for that SKU,
so an invoice line can legitimately point at several mother coils.

```
Mother HYD-0626-01  ──slit──►  HYD-0626-01-A ─┐
                    ──slit──►  HYD-0626-01-B ─┤
                                              ├─► Production (coilAllocations: baby + mother)
Mother HYD-0626-02  ──slit──►  HYD-0626-02-A ─┘        │
                                                       ▼
                                      Dispatch line inherits the same split → Invoice
```

**For reports, join on `coilAllocations[].hrCoilId` and sum `weight` per coil.** The helper
`allocFor` (`src/lib/calc.js:1367`) and `coilInventoryRow` (`:1384`) already do exactly this — reuse
them rather than writing a new join.

**Do not join on `traceHrCoilId`.** It is a legacy single-value field kept only so pre-June-2026 rows
still render, and for new rows it is set to `allocs[0].hrCoilId` (`src/App.jsx:1369`) — i.e. only the
*first* mother of a multi-coil line. See Q5 for a place where this is currently causing a wrong number.

---

## 2. Which PO is the reference?

**Answer: it depends which side of the plant the report is on — and the Contractor PO does not exist in the system at all.**

| PO the ticket names | Field in this system | Where it is set | Use it for |
|---|---|---|---|
| Vendor / Steel (JSW) PO | `coils.po_number` | Typed on Coil Inward (`src/App.jsx:540`); inherited by every baby coil (`:638`, `:649`) | Raw-material, Coil Inward, Coil Tracker, Baby Coil reports |
| Customer PO | dispatch entry `childOrderId` | Invoice sheet column **PurchaseOrder** (`mapDispatchRow`, `src/App.jsx:1313`) — equals the order book's **Child Order ID** | Dispatch ↔ order-book linkage, distributor reports |
| Contractor PO | **does not exist** | — | — |

Notes:
- `poRef` on a dispatch entry (`CF.Purchase Bill Reference No`, `src/App.jsx:1306`) is stored but is
  **reference text only** — nothing joins on it.
- **PO Master was removed in July 2026**; the `purchase_orders` table is dormant
  (`docs/DATA-MODEL.md:15`). There is no PO entity to link to.

**Recommendation:** RM-side reports key on `coils.po_number`; sales-side reports key on
`childOrderId`. A Contractor PO needs the decision in Q8 first.

---

## 3. Dispatch weight and invoice weight in the Inventory Summary

**Answer: invoice weight is taken verbatim from the Excel; dispatch weight per coil is the allocation-weighted share of it.**

The report is **Coil Tracker → "Inventory Summary — All Coils"** (`src/App.jsx:2205`), one row per
mother coil, computed by `coilInventoryRow` (`src/lib/calc.js:1384`):

| Column | Formula |
|---|---|
| Coil Wt (T) | mother `actualWeight` |
| Produced Wt (T) | Σ production `coilAllocations[].weight` where `hrCoilId` = this coil |
| **Dispatched Wt (T)** | Σ dispatch-entry `coilAllocations[].weight` where `hrCoilId` = this coil |
| Balance to Produce (T) | Coil Wt − Produced Wt |
| Produced Inv (T / #) | Produced − Dispatched |

**Invoice weight is not derived.** It is the **Quantity (MT)** cell on the Invoice sheet
(`mapDispatchRow`, `src/App.jsx:1293`). Pieces are the derived figure — `weight × 1000 ÷
SKU.weightPerTube` (`src/App.jsx:1347`) — because the One Helix file has no piece count. The one
exception: if a `Usage unit` column says NOS/PCS, Quantity is read as pieces and weight is derived
instead.

**Two traps worth naming for the team:**
1. The mother coil's **Invoice Weight** (supplier's invoice, `src/App.jsx:538`) is **display-only**.
   Every calculation in the app uses **Actual Weight** (plant weighbridge). It is unrelated to the
   sales invoice.
2. One invoice line legitimately splits across several mother coils, so "invoice weight" and
   "dispatch weight against coil X" are different grains. Do not expect them to reconcile row-for-row.

---

## 4. Baby Coil report — used weight, status, and >100% used

### (a) Used weight

```
used  = Σ production coilAllocations[].weight  where babyCoilId = this baby coil
free  = weight − used
%used = used / weight × 100
```

`coilConsumption(productions, null, 'babyCoilId')` — `src/lib/calc.js:320`, used at
`src/App.jsx:2073`.

One thing that surprises people: **`coilAllocations[].weight` is not stored state.** It is
recomputed on every read as `pieces × SKU.weightPerTube ÷ 1000` (`resolveProductionWeights`,
`src/lib/calc.js:86`). `pieces` is the only load-bearing field. Editing a SKU's weight in the master
therefore changes historic used-weight retroactively.

### (b) Confirmed vs Open

**Neither. A baby coil's status is `Active` or `Consumed`** (`src/App.jsx:796`, `:2079`), and it is
a **manual checkbox** (`baby_coils.consumed`) — nothing sets it automatically. A `Consumed` coil is
hidden from the Production picker and the FIFO suggestion; that is its only effect. There is
deliberately **no automatic hide at 97%** — that number is display-only red text.

**Confirmed / Non-confirmed is order-book vocabulary, not coil vocabulary** (`CONTEXT.md:30-36`):
Confirmed = ordered tonnage released but not invoiced; Non-confirmed = ordered but not released.
It never applies to a coil. If the ticket asks for Confirmed/Open on baby coils, that mapping needs
to be re-specified.

### (c) Why used quantity can exceed 100%

Four distinct causes — the sample records you saw are almost certainly cause 1:

1. **Historic warn-only saves.** Until Aug 2026 the Production form flagged ">105% of capacity —
   allowed, but review the split" and **saved anyway**. 445 baby coils ended up holding **123.3 T**
   more than physically possible (issue #99, `LEARNINGS.md:99`). **Now fixed**: `canSave` includes
   `!over105` (`src/App.jsx:1107`), plus a one-click **"Fix split"** that caps each row at real
   capacity and spills the excess into the operator's other rows.
2. **Sibling re-split.** Adding, editing or deleting any baby coil of a mother **re-splits weight
   across all its siblings** proportionally by width (`src/App.jsx:655-663`). A baby coil that was
   already consumed can shrink afterwards, pushing its % used past 100.
3. **Editing the mother's Actual Weight after slitting.** The proportional re-split only runs from
   the Slitting form. Changing `actualWeight` on Coil Inward later leaves every existing baby coil's
   weight stale — the denominator is wrong.
4. **Editing `weightPerTube` in SKU Master after production**, per (a).

**Is there a field that lets used quantity go beyond 100%?** Not a field — it was the manual
"Assigned Baby Coils" rows on the Production form. Today: ≤100% green, 100–105% amber (still saves,
this is the deliberate over-fill tolerance), **>105% blocked**.

---

## 5. Coil Inward vs Dispatch — tracking, and why there is an Edit button

**Dispatch is never entered against Coil Inward.** The attribution is derived end-to-end: Production
consumes baby coils → the dispatch line inherits that split (Q1). Dispatch itself is only ever
uploaded from the daily Sales Excel — hand-entering it is a documented non-negotiable
(`CLAUDE.md`).

**The Edit button on Coil Inward edits the mother coil's own master record — nothing else.** Fields:
Date of Inward, HR Coil No., Input Coil Number, Grade, Heat Number, Thickness, Width, Length,
Invoice Weight, Actual Weight, PO Number (`src/App.jsx:528-540`). Its purpose is correcting a
mis-keyed inward entry — a weighbridge weight, a grade, a PO number, a thickness. A user is **not**
expected to change anything dispatch-related through it. Deleting is guarded (blocked once the coil
is slit or consumed, `src/App.jsx:473-484`); editing is not — see the caveat in Q4(c)3.

**One real defect to flag, found while checking this.** The **"Dispatched Wt (T)" column on the Coil
Inward table** (`src/App.jsx:488-491`) matches on `be.traceHrCoilId` only and then adds the **whole**
line weight. Since `traceHrCoilId` holds only the first mother of a multi-coil line, that column
**over-attributes to the first coil and shows zero for the others**. Coil Tracker → Inventory Summary
uses `coilAllocations` and is correct. **Treat Coil Tracker as the source of truth; the Coil Inward
column should be repointed at `coilAllocations`.** (Not changed in this pass — see the end.)

---

## 6. Baby Coil width check

**It compares the total slit width of a mother's baby coils against the mother's own width, and it warns — it does not block.**

`widthStatus`, `src/App.jsx:594`. `sum` = widths of every existing sibling of that mother **plus**
every row currently being added.

```
sum ≤ motherWidth − 5      → green   "ok"     (5 mm slitting trim allowance intact)
motherWidth − 5 < sum ≤ motherWidth → yellow "warn"   (trim eaten into — review)
sum > motherWidth          → red     "over"   (physically impossible — flagged, still saves)
```

The label reads e.g. `1245.0 / 1245.0 mm (cap: 1250.0 mm)`.

**What actually blocks a Slitting save:** a duplicate Baby Coil ID (in the form or in the DB), and
more than 26 baby coils per mother (IDs are letter-suffixed A–Z). Width over the mother does **not**
block (`src/App.jsx:618`).

⚠️ **Two different ±5 mm rules — do not conflate them:**
- **Slitting width check** (this one): Σ baby widths vs **mother coil width**.
- **Production eligibility** (Q7): one baby coil's width vs the **tube's required strip width**.

⚠️ `docs/UI-PATTERNS.md:23` currently says "red → save blocked". The code says warn-only. **The code
is authoritative**; the doc is stale.

---

## 7. Baby Coil selection at Production (Stage 3)

**Confirm: the system auto-*suggests* but deliberately never auto-*selects*. That is a decision, not a gap.**

It is a hard rule in `CLAUDE.md`: *"Never auto-save the FIFO suggestion. It is guidance only; the
operator's `manualAlloc` is what `save()` persists."* The Assigned Baby Coils grid starts **empty**;
the operator either picks coils or clicks **"↧ Use suggestion"** to copy the FIFO rows in.

**The suggestion's exact matching logic** (`src/App.jsx:958-970` + `coilFifoAllocate`,
`src/lib/calc.js:242`):

1. **Width** — `|baby.width − requiredStripWidth(sku)| ≤ 5 mm`.
   `requiredStripWidth` = `2 × (Height + Breadth)` for SHS/RHS, `π × OD` for CHS
   (`src/lib/calc.js:112`). If the width can't be computed, the filter is skipped.
2. **Thickness** — the plant's **RM→FG rule sheet** (`RM_TO_FG_THICKNESS`, `src/lib/calc.js:199`),
   **not** a tolerance band. The relation is asymmetric and many-to-many: a 2.3 coil rolls 2.5 pipe
   but 2.5 never rolls 2.3; 3.0 rolls both 3.0 and 3.2; 2.2 rolls both 2.2 and 2.3. **An FG gauge
   absent from the sheet yields no eligible coil — it never falls back to a band.**
3. **Availability** — not deleted, not manually `consumed`, free weight > 0.
4. **Order** — oldest `dateOfConversion` first (FIFO), tiebreak on id. Fill each coil to **97%**,
   advance to the next, then top up to 100%, then into the 100–105% band. **Whole pieces only.**
   Leftover pieces become a `shortfall` warning — never a block.

The **manual dropdown is deliberately wider**: it lists **every** baby coil with more than 0.02 MT
free, spec-matched ones flagged `✓` and sorted first — so an operator can always pick an off-spec
coil when the floor requires it.

**Why not auto-select:** wrong suggestions from the old ±0.3 mm thickness band are precisely why
operators overrode the pick by hand, which caused the 123.3 T over-consumption in issue #99
(`LEARNINGS.md:97`). The fix was to correct the *rule* and hard-block the impossible case, while
keeping the human confirmation. **Recommendation: keep suggest-and-confirm.** Moving to full
auto-select reverses a documented decision and needs an explicit call.

⚠️ The suggestion box's on-screen label still reads "thickness ±0.3 mm" (`src/App.jsx:1173`). That
text is stale — the rule is the RM→FG sheet. Cosmetic, but it misleads exactly this question.

---

## 8. Dispatch ↔ Contractor PO linkage — **OPEN, needs a business decision**

**There is no Contractor PO anywhere in the data model.** Not on `coils`, `orders`, `dispatches`, or
the removed `purchase_orders` table.

What a dispatch line carries today (`src/App.jsx:1363-1370`): `invoiceNo`, `skuCode`, `pieces`,
`weight`, `customer`, `distributorCode`, `childOrderId`, `orderId`, `orderLineId`, `poRef`,
`coilAllocations`.

To link one, we first need to know **which entity the Contractor PO belongs to**:

| If the Contractor PO is… | It belongs on | Dispatch reaches it via |
|---|---|---|
| A conversion/job-work PO on the raw material | `coils` (like `po_number`) | `coilAllocations[].hrCoilId` → coil — **no new dispatch field needed** |
| A commercial PO on the customer order | `orders` | `childOrderId` — **no new dispatch field needed** |
| Its own document, independent of both | a new field on the dispatch entry + a source column in the Sales Excel | direct |

**Please confirm which of the three it is.** The first two need no schema change at all; only the
third does.

---

## 9. SKU Master fields — exact list, usage, and where the data comes from

**The exact column list** (`supabase-setup.sql:193-212`, form at `src/App.jsx:1566-1583`) — 17
columns, all of them:

| Column | Manual/Auto | Used for |
|---|---|---|
| `id` | auto | primary key |
| `product_type` | manual | **SHS / RHS / CHS / ERW.** Drives `requiredStripWidth` — `2×(H+B)` vs `π×OD` — so it **directly changes which baby coils are eligible in Production**. Also groups the Finished Stock report (CHS → "ROUND") |
| `sku_code` | auto-derived, editable; **locked on edit** | **== the ERP/One Helix "MM ID".** The join key for order & invoice imports. UNIQUE in Postgres |
| `description` | auto-derived | == One Helix "MM Description / Item Name" — fallback match when MM ID is absent |
| `height`, `breadth` | manual | SHS/RHS dimensions → strip width |
| `nominal_bore`, `outside_diameter` | manual | CHS dimensions → strip width |
| `thickness` | manual | matched against the coil via the RM→FG rule sheet |
| `length` | manual (default 6000) | reporting |
| `hsn_code` | manual | reporting only |
| `status` | manual | `published` / `draft`. Only published SKUs are selectable in Production |
| **`weight_per_tube`** | **manual — mandatory** | **The single source of all weight in the system.** Pieces↔MT everywhere. A published SKU with a blank/0 weight is **blocked from saving** |
| `base_conversion` | manual (default 2900) | ₹/MT conversion base |
| `thickness_extra` | manual (default 0) | ₹/MT gauge premium |
| `ladder_price` | **auto** | `base_conversion + thickness_extra` |
| `total_conversion` | **auto** | `weight_per_tube × ladder_price ÷ 1000` |
| `created_at` | auto | — |

**"Conversion Form" does not exist as a field.** The nearest thing is the four conversion columns
above (`base_conversion`, `thickness_extra`, `ladder_price`, `total_conversion`). If "Conversion
Form" means something else in your ticket, please define it — it is not in this system.

**Product Type is not optional decoration** — it is load-bearing for the Production match, which is
why it appears beyond your ticket's list.

**Where the data comes from:**
- **From Zoho / One Helix:** `sku_code` (MM ID) and `description` (MM Description) only. The importer
  even self-heals — a product present in the catalog but missing from the live master is added
  automatically during upload (`skuImportResolver`, `src/lib/calc.js:593`).
- **Maintained here, not in Zoho:** `weight_per_tube`, all four conversion/costing fields,
  `hsn_code`, `product_type`, and the dimensions. These were generated from **`Book 74.xlsx`**
  (232 SKUs) plus 15 added for ERP dispatch import — 247 in `src/data/skus.js`
  (`scripts/generate-skus.mjs`).

**So: the identity fields come from Zoho; the weight and costing fields must be set up and maintained
separately here.** `weight_per_tube` is the one that must never be missing — the system will not
derive it from a density constant (a hard non-negotiable in `CLAUDE.md`).

---

## 10. Sales Dashboard — why your test transactions don't appear

**Because the Sales Dashboard reads a completely different data source from the pipeline you're testing.** This is expected behaviour, not a bug.

```
LANE A — the pipeline you are testing
  Coil Inward → Slitting → Production → (coil/stock data)
        └─► feeds: Dashboard KPIs, Coil Tracker, Stock Reports
        └─► does NOT feed the Sales Dashboard

LANE B — sales
  "Upload Sales Excel" (One Helix workbook, Orders & Invoice tab)
        ├─ Orders sheet  → `orders`     ─┐
        └─ Invoice sheet → `dispatches` ─┴─► Sales Dashboard (the ONLY inputs)
```

`SalesDashboard` (`src/App.jsx:2592`) takes `orders` and `dispatches` and nothing else —
`salesKpis`, `salesByDistributor`, `salesByMonth`. No coil, baby-coil or production record can ever
move a Sales Dashboard number.

**Refresh logic — there is no job and no cache.** Data is read from Supabase on mount and updated in
React state on every mutation (`useSupabaseStore`, `src/lib/db.js`). The sales figures change **only**
when someone uploads a new Sales Excel. Each combined upload **replaces** dispatches (soft-deletes
the previous set and rebuilds) so a re-upload can never double-count.

**Two more things that commonly make a test invoice "not show up":**
- The month filter **defaults to the current calendar month** (`src/App.jsx:2600`). An invoice dated
  outside it is filtered out, not missing.
- Import is **idempotent per line** — key `invoiceNo | skuCode | weight` (`dedupeDispatchLines`). A
  re-uploaded line is silently skipped; the banner reports it as `N duplicate line(s) skipped`.

**To see test data on the Sales Dashboard, it has to enter through a Sales Excel upload.** There is
no manual sales entry path by design.

---

## 11. Production entry timing

**Answer: after production is complete. It is a completed-batch record, not a work order.**

The form has exactly three inputs — **Date of Production, SKU, No. of Pieces**
(`src/App.jsx:1147-1150`). There is no start date, no expected end date, no WIP or progress state.

**Why it can't be created up front:** saving a Production record is **the coil-consumption point**.
It immediately (a) debits baby coil capacity — which is what the >105% block and every free/used
figure are computed against, (b) adds tonnage to finished-goods stock (`producedPool`), and (c) makes
those pieces available for a dispatch line to inherit via FIFO. An entry made before the run would
consume steel that is still on the floor and create FG stock that doesn't exist.

The `status` column (`Allocated` / `Partial` / `Unallocated`) is **allocation** status — how many
pieces have a coil assigned — **not** production progress.

**If planned/in-progress production is genuinely needed**, that is a new concept (a planned-vs-actual
flag plus an expected-completion date, with consumption deferred to completion). It needs a schema
change and an explicit decision — not a config toggle.

---

## Doc-vs-code drift found while answering (code is authoritative)

| Where | Doc/UI says | Code actually does |
|---|---|---|
| `docs/UI-PATTERNS.md:23` | Slitting width over mother → save blocked | Warns only, saves (`src/App.jsx:618`) |
| `src/App.jsx:1173` (on-screen label) | "thickness ±0.3 mm" | RM→FG rule sheet, no band (Q7) |
| `docs/ALGORITHMS.md:15` | Dispatch cost rate = mother `costPrice / actualWeight` | `buildReconciliationRows` uses SKU `baseConversion` / `ladderPrice`; the Coil Inward form has **no** cost price field at all (the `cost_price` column is dormant) |
| `src/App.jsx:488-491` | — | Coil Inward "Dispatched Wt (T)" mis-attributes multi-coil lines (Q5) |

## What was NOT done in this pass

- **No code was changed.** The four drift items above are reported, not fixed — including the Coil
  Inward "Dispatched Wt" defect, which is a real wrong number on screen.
- **No Contractor PO field was added** (Q8) — it needs the business decision first.
- **No Sales Dashboard change** — the behaviour in Q10 is correct as designed.
- **No auto-select for baby coils** (Q7) — that would reverse a documented decision.

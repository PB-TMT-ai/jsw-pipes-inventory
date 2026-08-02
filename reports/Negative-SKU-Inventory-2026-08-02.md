# Negative SKU Inventory — Investigation, 2 Aug 2026

**Source:** live Supabase (`hztblmccvvarmgxmunrp`), all non-deleted `productions` (1,256 rows) and
`dispatches` (130 records) as of 2026-08-02. Netting reproduced with the app's own
`canonicalSkuKey` / `skuKeyResolver` from `src/lib/calc.js`.

---

## Answer first

The maths is fine. **The data is wrong, and 58% of the problem is one SKU.**

Negative inventory today is **−102.465 MT across 10 SKUs**. On 28 July it was **−36.183 MT across
8 SKUs** (the baseline logged in `LEARNINGS.md`). Everything that got worse in those five days is
accounted for:

| Change since 28-Jul | MT |
|---|---:|
| **NEW** — SHS 50x50x3.00 (`1139-13064-10080536`) | **−59.250** |
| SHS 38x38x4.00 — one more invoice on 29-Jul | −4.250 |
| CHS 50 NBx4.00 — more invoiced | −2.000 |
| **NEW** — RHS 60x40x2.00, rounding drift | −0.782 |
| | **−66.282** |

−36.183 − 66.282 = **−102.465**. Nothing unexplained.

The "abnormally huge" number you are seeing is almost entirely the single 50x50x3.00 row.

---

## The 59.25 MT row — what actually happened

The SKU master has **no SHS 50x50x3.00 entry at all**. The nearest published SKU is 50x50x**3.60**.
The chain:

```
SKU master missing SHS 50x50x3.00 (MM ID 1139-13064-10080536)
   └─► operator books the 25/27-Jul run under the nearest SKU: 50x50x3.60
         └─► 2,278 tubes costed at 31.47 kg/tube instead of ~26.56  →  +11.2 MT phantom stock on 3.60
   └─► ERP invoices arrive on the REAL code 1139-13064-10080536
         └─► zero production behind it  →  −59.250 MT
```

The tube counts are the proof:

| | Tubes | kg/tube | MT |
|---|---:|---:|---:|
| Booked as 50x50x**3.60** (25-Jul 1,708 + 27-Jul 570) | 2,278 | 31.470 | **71.689** |
| Same tubes if they were 50x50x**3.00** | 2,278 | 26.564 | **60.52** |
| Actually invoiced as 50x50x3.00 (28 & 30 Jul) | — | — | **59.250** |
| Ordered as 50x50x3.00 (27–28 Jul, 2 lines) | — | — | **60.00** |

60.52 produced vs 59.25 invoiced vs 60.00 ordered lines up. 71.689 MT does not — and that 3.60
tonnage has **never been dispatched, not one kilo**, despite being the third-largest single batch in
the system.

`weight_per_tube` on the 3.60 master row is 31.470336 kg, which is exactly
`(4×50 − 4×3.6) × 3.6 × 0.00785 × 6 m`. So the weight came from the SKU the operator picked, not from
anything weighed on the floor. Pick the wrong SKU, get the wrong tonnage.

**This needs plant confirmation before anyone touches it.** If the run was 3.00 mm, one re-key clears
−59.25 MT of negative stock *and* removes 71.69 MT of stock that isn't in the yard. If it genuinely
was 3.60 mm, then 59.25 MT was sold with no production ever recorded and 71.69 MT is real unsold
stock — two separate problems, both still worth chasing.

Also note: **both 50x50x3.00 invoice lines carry `pieces = 0`**. They are the only two such lines in
the entire dispatch table.

---

## The other 43.2 MT

Nine rows, all pre-dating the 28-Jul baseline except the two noted above. Five of them have **zero
recorded production** against a real invoice — stock sold from material that was never entered into
the app.

| SKU code | Description | Produced | Invoiced | Inventory |
|---|---|---:|---:|---:|
| `1139-13064-10080536` | SHS 50x50x3.00 | 0 | 59.250 | **−59.250** |
| `1139-13064-10059422` | SHS 50x50x2.90 | 0 | 12.002 | −12.002 |
| `SHS-38x38x4.00` | SHS 38x38x4.00 | 2.367 | 10.630 | −8.263 |
| `1139-13064-10078303` | SHS 60x60x4.00 | 0 | 6.868 | −6.868 |
| `1139-13064-10074092` | SHS 38x38x3.20 | 0 | 4.800 | −4.800 |
| `1139-13064-10059406` | SHS 38x38x2.90 | 0 | 4.150 | −4.150 |
| `1140-13075-10059487` | RHS 80x40x1.60 | 76.331 | 79.970 | −3.639 |
| `1141-13068-10078421` | CHS 50 NBx4.00 | 6.749 | 9.386 | −2.637 |
| `1140-13075-10059476` | RHS 60x40x2.00 | 134.943 | 135.725 | −0.782 |
| `…25 NBx4x60000` | CHS 25 NBx4.00 | 4.576 | 4.650 | −0.074 |
| | | | | **−102.465** |

The bottom four are ordinary drift — dispatched a fraction more than produced, well under 3%. Not
worth chasing.

For context: positive on-hand is **1,906.441 MT**, so net physical inventory is **1,484 MT** (raw
codes) / **1,804 MT** (canonical). Negative stock is ~5% of the book.

---

## Why you may be seeing 20 SKUs, not 10

Two different numbers exist depending on how the SKU is keyed:

```
netted by raw sku_code   →  20 negative SKUs, −422.347 MT
netted by canonical id   →  10 negative SKUs, −102.465 MT   ← what the Dashboard shows
```

The gap is **320 MT of SKU-master duplicates**, not missing steel. The master holds 274 rows that
collapse to only **259 real products** — 15 duplicate groups where the same tube exists under two
codes: an internal short code that production picked, and the ERP MM ID that invoices use.

| Canonical product | The two codes |
|---|---|
| RHS 100x50x2.00 | `RHS-100x50x2.00` ‖ `1140-13075-10074984` |
| RHS 100x50x2.50 | `RHS-100x50x2.50` ‖ `1140-13075-10074986` |
| RHS 100x50x2.80 | `RHS-100x50x2.80` ‖ `1140-13075-10074987` |
| RHS 100x50x4.00 | `RHS-100x50x4.00` ‖ `1140-13075-10074990` |
| RHS 100x50x3.20 | `RHS-100x50x3.20` ‖ `1140-13075-10074989` |
| RHS 100x50x1.60 | `RHS-100x50x1.60` ‖ `1140-13075-10074982` |
| RHS 50x25x2.80 | `1140-13075-10072129` ‖ `1140-13075-10072130` |
| SHS 30x30x2.50 | `SHS-30x30-2.50` ‖ `1139-13064-10074091` |
| SHS 75x75x2.50 | `SHS-75x75x2.50` ‖ `1139-13064-10078293` |
| CHS 20 NBx2.00 | `CHS-20NB-2.00` ‖ `1141-13068-10078411` |
| CHS 25 NBx2.50 | `1141-13068-10072461` ‖ `1141-13068-10079344` |
| CHS 40 NBx4.00 | `MS CHS…40 NBx4x6000` ‖ `1141-13068-10078410` |
| CHS 50 NBx4.00 | `1141-13068-10059606` ‖ `1141-13068-10078421` |
| CHS 65 NBx4.00 | `MS CHS…65 NBx4x6000` ‖ `1141-13068-10078425` |
| CHS 65 NBx2.80 | `1141-13068-10072472` ‖ `MS CHS…65 NBx2.8x6000` |

`skuKeyResolver` merges these at read time, so the Dashboard is already correct. But any view or
export that groups by raw `sku_code` will show the inflated −422 MT. If the screen you were looking
at showed roughly twenty red rows, that is the one to distrust — not the stock.

Four of these pairs are the decimal-format case that `scripts/dedupe-sku-master.sql` was written
for. The other eleven are the short-code-vs-MM-ID case, which that script does not cover.

---

## What this is not

- **Not a calculation bug.** `producedPool`, `skuAgeing` and `unmatchedDispatch` reconcile exactly:
  `Σ floored on-hand − unmatched === Σ produced − Σ dispatched`, verified on live data.
- **Not double-counted invoices.** Zero duplicate `invoiceNo | skuCode | weight` lines across all
  130 dispatch records. The July 2026 line-level dedupe is holding.
- **Not FIFO or costing.** Those run downstream of the same pool and inherit whatever it says.

---

## What I did not do

- **No data was changed.** No writes to Supabase, no SQL executed beyond read-only `select`.
- **Did not re-key the 50x50x3.60 batches** — that is the plant's call, and it moves 71.69 MT.
- **Did not add the missing SHS 50x50x3.00 SKU** to the master.
- **Did not dedupe the 15 duplicate master groups**, and did not extend
  `scripts/dedupe-sku-master.sql` to cover the eleven it misses.
- **Did not change any code.** The import path still lets an invoice line whose SKU is absent from
  the master strand on its raw code with no warning — that is the mechanism behind the worst row,
  and it is still open.

---

## If you want to move next

1. **Ask the plant** what thickness ran on 25 and 27 July on the 50x50 line. That one answer settles
   59.25 MT of negative and 71.69 MT of phantom positive.
2. **Add SHS 50x50x3.00** (MM ID `1139-13064-10080536`, ~26.56 kg/tube) to the SKU master so the next
   invoice has somewhere to land.
3. **Dedupe the 15 master groups** so raw-code views stop lying.
4. **Guard the import** — flag invoice lines whose SKU is not in the master instead of letting them
   fall through to a raw code.

Items 2–4 are ready to go whenever you want them; item 1 gates the big number.

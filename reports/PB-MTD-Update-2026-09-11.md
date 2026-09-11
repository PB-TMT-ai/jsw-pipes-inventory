# JSW Pipes & Tubes — PB MTD Update (2026-09-11)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-09-11
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	5642.7T
Current Month Orders --->	2700.0T
Invoiced Orders MTD --->	1072.9T
Invoiced MTD (Previous Month) --->	230.4T
Dispatch D-1 (Current Month) --->	210.1T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	239.6T
Non-Confirmed Orders --->	4330.1T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1309.7T
RM Full Coil Left --->	2028.9T
RM Baby Coil Left --->	1282.6T
RM Total --->	3311.5T
	
Invoiced MTD - South --->	213.7T
Invoiced MTD - West --->	859.2T
Invoiced MTD - All Regions --->	1072.9T
	
Pending to Serve - South --->	1382.3T
Pending to Serve - West --->	3187.5T
Pending to Serve - All Regions --->	4569.8T
	
Invoiced MTD by Plant - Hyderabad --->	419.2T
Invoiced MTD by Plant - NPMD --->	196.2T
Invoiced MTD by Plant - Lepakshi --->	93.2T
Invoiced MTD by Plant - Tapi --->	364.3T
Invoiced MTD by Plant - All Plants --->	1072.9T
	
Pending to Serve by Plant - Hyderabad --->	632.7T
Pending to Serve by Plant - NPMD --->	1381.4T
Pending to Serve by Plant - Lepakshi --->	818.8T
Pending to Serve by Plant - Tapi --->	1736.9T
Pending to Serve by Plant - All Plants --->	4569.8T
	
Produced MTD --->	1099.1T
Produced MTD (Previous Month) --->	245.3T
Production D-1 --->	59.0T
Production D Day --->	0T
	
Orders Logged D Day --->	15.0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	372.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no September target supplied. Give a best
  estimate and both lines compute (20 calendar days remain, Sep 11–30 inclusive).
- **Invoiced MTD carries no plant suffix this month, for the first time.** Every plant that holds
  orders has also invoiced in September — Hyderabad 419.2, NPMD 196.2, Lepakshi 93.2, Tapi 364.3 T.
  `plantSplit.invoicing.suffix` is empty and is *derived from the rows*, so the "· Hyderabad only"
  label the last reports carried disappeared by itself when NPMD, Lepakshi and Tapi started
  invoicing. The four-plants-against-one comparison that label existed to warn about is over.
- **Invoiced MTD (Previous Month)** = August invoiced **through the same day-of-month** (Aug 1–11)
  = 230.4 T, for a like-for-like pace comparison. September is far ahead: 1072.9 vs 230.4
  (**+842.5 T, +366%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 1072.9 + 239.6 + 4330.1 = 5642.7 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  6,953.0 − 5,643.3 = **1,309.7 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 6,952.8 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D and Production D read 0 because data is behind, not because the plant stopped.**
  Latest dispatch date loaded is **2026-09-10**; latest production date **2026-09-10**; latest
  order date **2026-09-11**. Treat every 0 on a later date as "not loaded yet".
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. September is at 1,099.1 T against August's 245.3 T over the same 11 days.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 2,028.9 T** + **Baby Coil Left 1,282.6 T** = **RM Total 3,311.5 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 10,470.2 T.
  Baby Coil Left applies the ADR-0007 scrap floor and the operator's `consumed` flag: a plain
  `Σ max(0, weight − consumed)` returns **1,685.7 T**, i.e. **403.0 T** of coil ends the Dashboard
  does not count as stock. The card's figure is the one printed here.
- **Region basis:** a distributor belongs to **one** region — its most recent line's state, unless
  the distributor master overrides it. Its whole book sits there even if it ships to several
  states. One distributor (220.8 T) ships to more than one state; that is 4.8% of the pending
  book, under the 5% threshold at which it would be worth naming.
- **Both splits are a partition, not a scope.** The All Regions / All Plants lines are the same
  figures the headline reports; nothing moves, and the report is never scoped to one plant.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 1072.9 | bundle-line sum = 1072.925 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 230.4 | bundle-line sum = 230.430 | ✅ PASS |
| 2 | Partition — dispatch | Σ 9 daily slices = 1072.925 | month aggregate = 1072.9 | ✅ PASS |
| 2 | Partition — orders logged | Σ 9 daily slices = 2700.000 | month aggregate = 2700.0 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 1072.9 + 239.6 + 4330.1 | 5642.7 | ✅ PASS |
| 4 | Freshness | max order 2026-09-11, max dispatch 2026-09-10, max production 2026-09-10 | Dispatch D / Production D = 0 → **not loaded yet** | ⚠️ NOTED |
| 5 | Region partition — invoiced | Σ regions (JS, app helpers) = 1072.925 | Postgres aggregate = 1072.9 | ✅ PASS |
| 6 | Region partition — pending | Σ regions (JS) = 4569.770 | Confirmed + Non-conf (Postgres) = 4569.8 | ✅ PASS |
| 7 | Plant partition — invoiced | Σ plants (JS) = 1072.925 | Postgres aggregate = 1072.9 | ✅ PASS |
| 8 | Plant partition — pending | Σ plants (JS) = 4569.770 | Confirmed + Non-conf (Postgres) = 4569.8 | ✅ PASS |
| 9 | Produced MTD | plant pipeline (JS) = 1099.1316 | Postgres live-recompute = 1099.132 | ✅ PASS |
| 9 | Produced prev (day-capped) | plant pipeline (JS) = 245.3344 | Postgres = 245.334 | ✅ PASS |
| 10 | FG reconciliation | plant pipeline `fgLeft` (JS) = 1309.6612 | produced − invoiced (Postgres) = 1309.661 | ✅ PASS |
| 11 | RM Full Coil Left | plant pipeline (JS) = 2028.858 | Postgres unslit-mother sum = 2028.858 | ✅ PASS |
| 12 | Servable within book | Σ regions servable ≤ unconfirmed, Confirmed/Unconfirmed tie to book | `confirmedTiesToBook` / `unconfirmedTiesToBook` true | ✅ PASS |

`scripts/daily-splits.mjs` exited 0, which by itself means all four of its own tie-outs
(region, plant, servable, pipeline) held; checks 5–12 re-render them so the report shows its work.
What they cannot see: a Σ check passes just as happily when a distributor is filed in the wrong
region or a line under the wrong plant. They prove each split is a partition, not that it is
attributed correctly — which is why neither is re-derived in SQL.

Advisory flags:
- **Confirmed variance** — stored bucket 239.6 T vs the ERP formula `release_qty − invoiced_qty`
  235.1 T, a **4.5 T** gap. The report uses the **stored** bucket, which is what the app reads.
- **Baby-coil scrap floor** — 403.0 T of coil ends excluded from RM (ADR-0007), as above.
- **Post-`D` dispatch** — 0 T. Region split and the workbook's *Distributor by Region* sheet agree.
- **Unmapped / Unattributed** — none. Every distributor resolves to a region and every line to a
  plant; there is no labelling gap in today's book.
- **Plants with orders and no invoices** — none (see the suffix note above).
- **Data staleness** — dispatch and production loaded only through 2026-09-10, so the two
  D-Day lines are "not loaded", not zero activity.

## Servable split (what the WhatsApp message prints)

Confirmed has first claim on the floor; Unconfirmed counts only against what Confirmed leaves.

| Region | Confirmed | Unconfirmed (book) | Servable – Unconfirmed | Pending to Dispatch |
|---|---|---|---|---|
| South | 11.9 T | 1370.3 T | 275.8 T | 287.8 T |
| West | 227.7 T | 2959.8 T | 196.9 T | 424.6 T |
| **Total** | **239.6 T** | **4330.1 T** | **472.7 T** | **712.4 T** |

Of the 4,330.1 T unconfirmed book, **3,857.4 T has no stock behind it** — that is the production
backlog, and it is deliberately not on the WhatsApp message. 226 of 283 (region, size) pools with
stock are short against their unconfirmed queue.

**This block read 0.0 T for every region until this run.** `scripts/daily-splits.mjs` never
fetched `orders.mm_id` / `orders.description`, and those are what `salesByDistributor` resolves an
order line's SKU from — so every `skuRows[].allPending` came back 0 and `buildServableSummary` had
no size to compare stock against. Confirmed and Non-confirmed are row-level and stayed correct, so
every Σ tie-out passed and the wrong figure looked exactly like a true one. Fixed in the SELECT
list, with a regression test on the fetch contract itself.

## Change vs last report (2026-08-05 → 2026-09-11)

Different months, so the MTD lines are not like-for-like; the stock lines are.

| Line | 2026-08-05 | 2026-09-11 | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 5642.7 T | +5380.7 T |
| Current Month Orders | 93.0 T | 2700.0 T | +2607.0 T |
| Invoiced Orders MTD | 129.2 T | 1072.9 T | +943.7 T |
| Invoiced MTD (Previous Month) | 104.5 T | 230.4 T | +125.9 T |
| Dispatch D-1 | 0 T | 210.1 T | +210.1 T |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending to be Invoiced | 56.5 T | 239.6 T | +183.1 T |
| Non-Confirmed Orders | 76.3 T | 4330.1 T | +4253.8 T |
| Physical Inventory | 1463.8 T | 1309.7 T | −154.1 T |
| RM Full Coil Left | 616.3 T | 2028.9 T | +1412.6 T |
| RM Baby Coil Left | 695.7 T | 1282.6 T | +586.9 T |
| RM Total | 1312.0 T | 3311.5 T | +1999.5 T |
| Produced MTD | 26.3 T | 1099.1 T | +1072.8 T |
| Produced MTD (Previous Month) | 197.8 T | 245.3 T | +47.5 T |
| Production D-1 | 0 T | 59.0 T | +59.0 T |
| Orders Logged D Day | 0 T | 15.0 T | +15.0 T |
| Orders Logged D-1 | 60.0 T | 0 T | −60.0 T |
| Orders Logged D-2 | 28.0 T | 372.0 T | +344.0 T |

The 2026-08-05 report predates the region, plant and servable blocks, so those have no previous
value to compare against. The **RM Baby Coil Left** line is comparable in name only: the ADR-0007
scrap floor landed after it, so August's 695.7 T was computed on a basis this report no longer uses.

## Excluded lines (unchanged)

- **Retail / Distributor Through Project / Project Orders** — 🚫 not relevant: `orders` has no
  order-category dimension.
- **Invoiced MTD-FE 550 / FE 550D - LRF**, **Physical Inventory · FE 550 / FE 550D** — 🚫 not
  relevant: those are TMT rebar grades; finished pipe carries no grade.
- **Carry-forward Orders** — ⚠️ not tracked.
- **SFDC Orders** — ⚠️ no SFDC flag; all `distributor_code` values are Salesforce IDs.

---

Source: Supabase project `hztblmccvvarmgxmunrp`. Splits computed by `scripts/daily-splits.mjs`
through the app's own `src/lib` helpers; headline figures aggregated independently in Postgres.

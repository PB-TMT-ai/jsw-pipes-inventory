# JSW Pipes & Tubes — PB MTD Update (2026-08-27)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-27
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	3900.0T
Current Month Orders --->	4222.0T
Invoiced Orders MTD · Hyderabad only --->	767.0T
Invoiced MTD (Previous Month) --->	700.8T
Dispatch D-1 (Current Month) --->	10.3T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	17.0T
Non-Confirmed Orders --->	3116.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1361.9T
RM Full Coil Left --->	861.9T
RM Baby Coil Left --->	738.8T
RM Total --->	1600.7T
	
Invoiced MTD · Hyderabad only - South --->	767.0T
Invoiced MTD · Hyderabad only - West --->	0T
Invoiced MTD · Hyderabad only - All Regions --->	767.0T
	
Pending to Serve - South --->	768.0T
Pending to Serve - West --->	2365.0T
Pending to Serve - All Regions --->	3133.0T
	
Invoiced MTD by Plant · Hyderabad only - Hyderabad --->	767.0T
Invoiced MTD by Plant · Hyderabad only - NPMD --->	0T
Invoiced MTD by Plant · Hyderabad only - Lepakshi --->	0T
Invoiced MTD by Plant · Hyderabad only - Tapi --->	0T
Invoiced MTD by Plant · Hyderabad only - All Plants --->	767.0T
	
Pending to Serve by Plant - Hyderabad --->	224.0T
Pending to Serve by Plant - NPMD --->	1079.0T
Pending to Serve by Plant - Lepakshi --->	504.0T
Pending to Serve by Plant - Tapi --->	1326.0T
Pending to Serve by Plant - All Plants --->	3133.0T
	
Produced MTD --->	587.6T
Produced MTD (Previous Month) --->	1287.9T
Production D-1 --->	54.5T
Production D Day --->	0T
	
Orders Logged D Day --->	253.0T
Orders Logged D-1 --->	21.0T
Orders Logged D-2 --->	39.0T
```

> `Invoiced MTD is Hyderabad-only — the other plants carry orders but have never invoiced. Pending is
> every plant's, so the two columns are not like for like.`

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (5 calendar days remain, Aug 27–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–27)
  = 700.8 T, for a like-for-like pace comparison. August is ahead: 767.0 vs 700.8
  (**+66.2 T, +9%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 767.0 + 17.0 + 3116.0 = **3900.0 T**.
  It blends two windows on purpose: Invoiced MTD is this month, Confirmed / Non-confirmed are an
  all-time snapshot of orders not yet delivered.
- **Current Month Orders (4222.0 T) exceeds Total Orders (3900.0 T)** and that is not an error: the
  intake line counts every August order line's `quantity`, including ones already delivered and so
  no longer in the open book.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  5,179.6 − 3,817.7 = **1,361.9 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 5,179.4 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D and Production D read 0 because data is behind, not because the plant stopped.**
  Latest dispatch date loaded is **2026-08-26**, latest production **2026-08-26**; latest order
  date **2026-08-27**. Treat every 0 on a later date as "not loaded yet".
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG can
  never disagree. August is at 587.6 T against July's 1,287.9 T over the same 27 days — **−700.3 T**,
  and with production loaded through Aug 26 that gap is real, not a loading lag.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 861.9 T** + **Baby Coil Left 738.8 T** = **RM Total 1,600.7 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 6,628.9 T.
- **Regions.** Only South and West are present — North and East are **absent**, not zero. Both
  region masters are applied: the state → region table (one stored row) **and** the per-distributor
  region override (15 stored rows), the latter winning over the former. See the flag below.
- **Plants.** All four carry orders; only Hyderabad has ever invoiced, hence the label on every
  Invoiced line that sits beside multi-plant Pending. Scoping this report to Hyderabad would drop
  Pending by 2,909 MT overnight with nothing changed in the business — the totals stay, the split
  explains them.
- **Region and plant splits both come from `scripts/daily-splits.mjs`** (one run, one read of the
  book) — never re-derived in SQL, so they cannot disagree with the Sales tab or the workbook.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 767.0 | bundle-line sum = 767.040 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 700.8 | bundle-line sum = 700.835 | ✅ PASS |
| 2 | Partition — orders | month intake = 4222.0 | Σ daily orders Aug = 4222.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 767.0 | Σ daily dispatch Aug ≤ D = 767.040 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 3900.0 | 767.0 + 17.0 + 3116.0 = 3900.0 | ✅ PASS |
| 4 | Freshness | report date 2026-08-27 | max order 08-27 · dispatch 08-26 · production 08-26 | ⚠️ Dispatch/production lag 1 day — D zeros are "not loaded yet" |
| 5 | Region partition — invoiced | Postgres Σ = 767.0 | Σ `regions[].invoicedMtd` (JS) = 767.040 | ✅ PASS (diff 3e-13) |
| 6 | Region partition — pending | Postgres conf+non-conf = 3133.0 | Σ `regions[].pending` (JS) = 3133.0 | ✅ PASS |
| 7 | Plant partition — invoiced | Postgres Σ = 767.0 | Σ `plants[].invoicedMtd` (JS) = 767.040 | ✅ PASS (diff 0) |
| 8 | Plant partition — pending | Postgres conf+non-conf = 3133.0 | Σ `plants[].pending` (JS) = 3133.0 | ✅ PASS |
| — | Mass balance (RM) | inward − full coil left = 6,628.9 − 861.9 = 5,767.0 | baby coil total = 5,767.0 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds. `scripts/daily-splits.mjs` exited 0, which is itself the
assertion for checks 5–8; they are re-rendered here so the report shows its own work.

What checks 5–8 cannot see: a Σ check passes just as happily when a distributor is filed in the
wrong region or a line under the wrong plant. They prove each split is a **partition**, not that it
is **attributed** correctly — which is why neither is re-derived here, and why the flag below
matters even though every check above is green.

Advisory flags (reported, do not fail):
- **KARNATAKA was re-mapped from South to East on 2026-08-25**, overriding the shipped seed. Two
  distributors ship there — SST STEEL CORPORATION and SHRI LAKSHMI STEEL SUPPLIERS. Both carry a
  per-distributor override back to **South** on the distributor master, and the override wins, so
  the regions above read South. **Clear those two overrides and 436.2 T invoiced + 234.0 T pending
  move to East, which no plant serves** — every one of their servable lines would go to zero. If the
  East mapping was a mis-type on the Masters tab, fix the state row rather than leaving two
  overrides to cancel it out.
- **Confirmed variance** — stored bucket 17.000 T vs ERP formula (`release_qty − invoiced_qty`)
  16.095 T, a **0.9 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,767.0 − 5,156.1 = 610.9 T,
  but the per-coil floored figure (what the Dashboard shows) is **738.8 T**. The **127.9 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on the
  affected productions; it does not change the Dashboard-aligned number reported above.
- **Plants with orders and no invoices** — NPMD, Lepakshi and Tapi. Expected today and reported
  rather than flagged as a fault: it is the four-against-one comparison, named.
- **Unattributed tonnage** — 0 T pending, 0 T invoiced. Every ERP Ship From Code is on the plant
  master.
- **Unmapped share** — 0% of invoiced, 0% of pending. No state is unmapped.
- **Multi-state distributors** — 1, carrying 297.3 T (7.6% of the 3,900.0 T book, above the 5%
  note-worthy line). Its whole book sits in one region by design, as the workbook does it.
- **Post-`D` dispatch** — 0 T. The day-capped region split and the workbook's uncapped
  *Distributor by Region* sheet agree exactly today.

## Data path for this run

The live PostgREST path (`hztblmccvvarmgxmunrp.supabase.co`) is **refused by this session's egress
policy** (`403 to CONNECT`), so it was not used and not retried. Instead:
- Core metrics, RM and FG — the skill's SQL, run through the Supabase MCP `execute_sql`.
- Region and plant splits — the real rows pulled through the same MCP and fed to
  `scripts/daily-splits.mjs --in`, so **the app's own tested builders still computed both splits**.
  Nothing was re-derived in SQL.
- Only non-deleted rows were fetched (1,156 orders / 160 dispatches / 669 dispatch entries). Every
  builder filters `!deleted` anyway, so the output is identical; only the script's `rows.*`
  diagnostic counts differ from a live run.

## Change vs last report (2026-08-05 → 2026-08-27)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0T | 3900.0T | **+3638.0T** |
| Current Month Orders | 93.0T | 4222.0T | **+4129.0T** |
| Invoiced Orders MTD | 129.2T | 767.0T | +637.8T |
| Invoiced MTD (Previous Month) | 104.5T | 700.8T | +596.3T |
| Dispatch D-1 | 0T | 10.3T | +10.3T |
| Dispatch D Day | 0T | 0T | — |
| Confirmed Orders Pending | 56.5T | 17.0T | −39.5T |
| Non-Confirmed Orders | 76.3T | 3116.0T | **+3039.7T** |
| Physical Inventory | 1463.8T | 1361.9T | −101.9T |
| RM Full Coil Left | 616.3T | 861.9T | +245.6T |
| RM Baby Coil Left | 695.7T | 738.8T | +43.1T |
| RM Total | 1312.0T | 1600.7T | +288.7T |
| Produced MTD | 26.3T | 587.6T | +561.3T |
| Produced MTD (Previous Month) | 197.8T | 1287.9T | +1090.1T |
| Production D-1 | 0T | 54.5T | +54.5T |
| Production D Day | 0T | 0T | — |
| Orders Logged D Day | 0T | 253.0T | +253.0T |
| Orders Logged D-1 | 60.0T | 21.0T | −39.0T |
| Orders Logged D-2 | 28.0T | 39.0T | +11.0T |

The two reports are **22 days apart**, and the 08-05 file was written against a part-loaded month
(orders through Aug 4, dispatch through Aug 3, production through Aug 1). Most of the movement above
is that backlog arriving, not a change in the business. The exception worth reading as real is
**Non-Confirmed +3,039.7 T**: the open order book has grown to 3,133.0 T against 767.0 T invoiced
this month, and 2,365.0 T of it sits in West, where no plant has yet invoiced anything.

The 08-05 report predates the region (#127) and plant (#128) blocks, so those lines have no previous
value to compare against. The nearest reference point is the 18-Aug WhatsApp message: South was
1,115.0 T pending / West 1,397.0 T, against 768.0 T / 2,365.0 T today. The two are comparable —
Karnataka's distributors sat in South then (via the seed) and sit in South now (via their
overrides), so no tonnage changed region between the two reports. South's pending falls as its book
is served; West's nearly doubles on new orders it cannot yet be served from.

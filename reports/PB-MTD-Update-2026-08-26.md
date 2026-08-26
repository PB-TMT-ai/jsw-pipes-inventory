# JSW Pipes & Tubes — PB MTD Update (2026-08-26)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-26
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	4269.0T
Current Month Orders --->	4194.0T
Invoiced Orders MTD · Hyderabad only --->	756.8T
Invoiced MTD (Previous Month) --->	667.2T
Dispatch D-1 (Current Month) --->	36.5T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	14.0T
Non-Confirmed Orders --->	3498.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1305.0T
RM Full Coil Left --->	775.3T
RM Baby Coil Left --->	754.2T
RM Total --->	1529.5T
	
Invoiced MTD · Hyderabad only - South --->	320.6T
Invoiced MTD · Hyderabad only - East --->	436.2T
Invoiced MTD · Hyderabad only - West --->	0T
Invoiced MTD · Hyderabad only - All Regions --->	756.8T
	
Pending to Serve - South --->	671.0T
Pending to Serve - East --->	699.2T
Pending to Serve - West --->	2142.0T
Pending to Serve - All Regions --->	3512.2T
	
Invoiced MTD by Plant · Hyderabad only - Hyderabad --->	756.8T
Invoiced MTD by Plant · Hyderabad only - All Plants --->	756.8T
	
Pending to Serve by Plant - Hyderabad --->	807.2T
Pending to Serve by Plant - NPMD --->	1084.0T
Pending to Serve by Plant - Lepakshi --->	518.0T
Pending to Serve by Plant - Tapi --->	1103.0T
Pending to Serve by Plant - All Plants --->	3512.2T
	
Produced MTD --->	520.5T
Produced MTD (Previous Month) --->	1272.7T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	18.0T
Orders Logged D-1 --->	39.0T
Orders Logged D-2 --->	52.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (5 calendar days remain, Aug 26–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–26)
  = 667.2 T, for a like-for-like pace comparison. August is ahead: 756.8 vs 667.2
  (**+89.6 T, +13%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 756.8 + 14.0 + 3498.2 = 4269.0 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced** (both all-time), produced
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  5,112.5 − 3,807.5 = **1,305.0 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 5,112.3 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D reads 0 because data is behind, not because the plant stopped.** Latest dispatch
  date loaded is **2026-08-25** (D-1); latest order date **2026-08-26** (D, live); latest
  production date **2026-08-24** (D-2). Treat every 0 on a later date as "not loaded yet" —
  that covers Dispatch D, and Production D and D-1.
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 775.3 T** + **Baby Coil Left 754.2 T** = **RM Total 1,529.5 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 6,490.8 T.
- **Regions and Plants** — both splits come from `scripts/daily-splits.mjs` (one run, two cuts of
  the same book), never re-derived in SQL. See the **flagged finding** below before trusting the
  Region split specifically — the Plant split is unaffected and ties out cleanly.

## ⚠️ Flagged finding — Region split "East" is a reporting-code gap, not a new region

The Region split above is exactly what `buildRegionMtdSummary` (`src/lib/reports.js`) computes
live today — it is not a data error on my part — but it **disagrees with the rest of the app** for
two distributors, and I do not believe the 436.2 T / 699.2 T shown against "East" is the right
place for that tonnage to sit.

**Why:** `buildRegionMtdSummary` resolves a distributor's region purely from its **most-recent
ship-to state** (state → region, via `state_regions`/the code seed). It does **not** accept or
consult the `distributors` master's per-distributor region override — the ticket #129 mechanism
that `salesByDistributor` (Sales tab, Free Stock sheet) and `buildMtdDashboardData` **do** honor.
Its function signature (`buildRegionMtdSummary(orders, dispatches, { date, stateRegions })`) has no
`distributors` parameter at all.

**What tripped it today:** the `state_regions` table gained a new row **yesterday (2026-08-25)**
mapping `KARNATAKA → East` (the code seed default is `KARNATAKA → South`). Two distributor
identities whose most-recent line ships to Karnataka pick up that new mapping in this split:

| Distributor | Distributor code | Masters-tab override (`distributors` table) | This split's region |
|---|---|---|---|
| SST STEEL CORPORATION | `0015g00001PqMSnAAN` | **South** (set 2026-08-20) | East |
| SHRI LAKSHMI STEEL SUPPLIERS | `0015g00001DiDwvAAF` (one of its two codes) | **South** (set 2026-08-20) | East |

Both overrides were set *before* the Karnataka→East state row existed, and both are still active
(`deleted: false`). The Sales tab, the Free Stock sheet, and today's **servable-orders WhatsApp
report** (generated alongside this one) all correctly keep both under **South** — that report's
top distributor, SST STEEL CORPORATION (329.8 T servable of 699.2 T pending), is the same
distributor sitting under "East" here.

**I have not corrected the numbers above** — hand-adjusting them here would be exactly the
"second implementation that can disagree" this report's own methodology forbids. The fix belongs
in `buildRegionMtdSummary` (accept and apply `distributors`, the same way `buildMtdDashboardData`
already does), which is a source change outside the scope of generating this report. Until that's
fixed, treat this Region split's South/East numbers as **understating South and overstating a
region no plant serves** — West is unaffected.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 756.8 | bundle-line sum = 756.780 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 667.2 | bundle-line sum = 667.170 | ✅ PASS |
| 2 | Partition — orders | month intake = 4194.0 | Σ daily orders Aug = 4194.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 756.8 | Σ daily dispatch Aug ≤ D = 756.780 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 4269.0 | 756.8 + 14.0 + 3498.2 = 4269.0 | ✅ PASS |
| 4 | Freshness | report date 2026-08-26 | max order 08-26 (live) · dispatch 08-25 · production 08-24 | ⚠️ Dispatch D, Production D/D-1 read 0 = "not loaded yet" |
| 5 | Region partition — invoiced | Σ regions = 320.61+436.17+0 = 756.78 | invoiced_mtd = 756.78 | ✅ PASS (partitions correctly — see flagged finding on *attribution*) |
| 6 | Region partition — pending | Σ regions = 671.0+699.23+2142.0 = 3512.23 | confirmed+non_confirmed = 3512.23 | ✅ PASS |
| 7 | Plant partition — invoiced | Σ plants = 756.78+0+0+0 = 756.78 | invoiced_mtd = 756.78 | ✅ PASS |
| 8 | Plant partition — pending | Σ plants = 807.2+1084.0+518.0+1103.0 = 3512.2 | confirmed+non_confirmed = 3512.23 | ✅ PASS |
| — | Mass balance (RM) | inward − full coil left = 6,490.8 − 775.3 = 5,715.5 | baby coil total = 5,715.5 | ✅ PASS (exact) |

**Overall: PASS on every hard check** — including both Σ-partition checks for the Region split.
Those checks prove the split *adds up*; they cannot see that two distributors are filed under the
wrong *bucket*, which is exactly the flagged finding above.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 14.000 T vs ERP formula (`release_qty − invoiced_qty`)
  9.090 T, a **4.9 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,715.5 − 5,089.0 = 626.5 T,
  but the per-coil floored figure (what the Dashboard shows) is **754.2 T**. The **127.7 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.
- **Plants with orders and no invoices** — NPMD, Lepakshi, Tapi. Expected today (only Hyderabad
  has ever invoiced); reported per `plantSplit.invoicing.note` rather than flagged as a fault.
- **Multi-state distributors** — 1 distributor, 277.3 T of tonnage spans more than one ship-to
  state across its order history and is filed under its most-recent state's region by design
  (separate from the East finding above, which is a same-state, wrong-bucket issue).
- **FG reconciliation** — 1,305.0 T = produced (live-recompute, 5,112.5 T) − invoiced (3,807.5 T).
  Stored-vs-live delta is 0.2 T (negligible master-weight drift).

## Change vs last report (2026-08-05 → 2026-08-26)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 4,269.0 T | **+4,007.0** |
| Current Month Orders | 93.0 T | 4,194.0 T | **+4,101.0** |
| Invoiced Orders MTD | 129.2 T | 756.8 T | **+627.6** |
| Invoiced MTD (Prev Month) | 104.5 T | 667.2 T | +562.7 (wider window: Jul 1–5 vs Jul 1–26) |
| Dispatch D-1 | 0 T | 36.5 T | +36.5 |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending Invoice | 56.5 T | 14.0 T | **−42.5** |
| Non-Confirmed Orders | 76.3 T | 3,498.2 T | **+3,421.9** |
| Physical Inventory | 1,463.8 T | 1,305.0 T | −158.8 |
| RM Full Coil Left | 616.3 T | 775.3 T | +159.0 |
| RM Baby Coil Left | 695.7 T | 754.2 T | +58.5 |
| RM Total | 1,312.0 T | 1,529.5 T | +217.5 |
| Produced MTD | 26.3 T | 520.5 T | +494.2 |
| Produced MTD (Prev Month) | 197.8 T | 1,272.7 T | +1,074.9 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — |
| Orders Logged D Day | 0 T | 18.0 T | +18.0 |
| Orders Logged D-1 | 60.0 T | 39.0 T | −21.0 |
| Orders Logged D-2 | 28.0 T | 52.0 T | +24.0 |

Region/Plant splits are not compared — the previous report (2026-08-05) predates tickets #128/#129
and carried no such lines.

Reading the move: three weeks added over 4,000 T of fresh order intake (mostly non-confirmed —
+3,422 T) while invoicing grew a more modest 628 T, so the pending book grew much faster than the
plant shipped against it. Raw material kept pace (+217.5 T RM Total) but Physical Inventory (FG)
actually **fell** 158.8 T — production (+494.2 T MTD) still trails the invoiced draw-down on hand.

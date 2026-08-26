# JSW Pipes & Tubes — PB MTD Update (2026-08-24)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-24
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	4464.9T
Current Month Orders --->	4371.0T
Invoiced Orders MTD --->	606.7T
Invoiced MTD (Previous Month) --->	589.3T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	85.0T
Non-Confirmed Orders --->	3773.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1393.6T
RM Full Coil Left --->	757.5T
RM Baby Coil Left --->	709.3T
RM Total --->	1466.8T
	
Invoiced MTD · Hyderabad only - South --->	606.7T
Invoiced MTD · Hyderabad only - West --->	0T
Invoiced MTD · Hyderabad only - All Regions --->	606.7T
	
Pending to Serve - South --->	1791.2T
Pending to Serve - West --->	2067.0T
Pending to Serve - All Regions --->	3858.2T
	
Invoiced MTD by Plant · Hyderabad only - Hyderabad --->	606.7T
Invoiced MTD by Plant · Hyderabad only - All Plants --->	606.7T
	
Pending to Serve by Plant - Hyderabad --->	803.1T
Pending to Serve by Plant - NPMD --->	1054.0T
Pending to Serve by Plant - Lepakshi --->	948.0T
Pending to Serve by Plant - Tapi --->	1053.0T
Pending to Serve by Plant - All Plants --->	3858.2T
	
Produced MTD --->	458.9T
Produced MTD (Previous Month) --->	1227.4T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	52.0T
Orders Logged D-2 --->	8.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied, so both are N/A.
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–24)
  = 589.3 T, for a like-for-like pace comparison. August is ahead: 606.7 vs 589.3 (**+17.4 T, +3%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 606.7 + 85.0 + 3773.2 = 4464.9 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced** (all-time), produced
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  5,050.9 − 3,657.4 = **1,393.6 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 5,050.7 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D / D-1 and Production D / D-1 / D-2 read 0 because data is behind, not because the
  plant stopped.** Latest dispatch date loaded is **2026-08-22**; latest order date **2026-08-23**;
  latest production date **2026-08-21**. Treat every 0 on a later date as "not loaded yet" — that
  covers Dispatch D (08-24) and D-1 (08-23), Production D (08-24), D-1 (08-23) and D-2 (08-22), and
  Orders Logged D Day (08-24).
- **Region and Plant splits: `scripts/daily-splits.mjs` ran offline, not live.** Its normal path
  needs raw HTTPS to `hztblmccvvarmgxmunrp.supabase.co`, and this session's network egress policy
  returns `403 Forbidden — Host not in allowlist` for that host — only the Supabase MCP tool can
  reach it from here. Rather than hand-roll the split in SQL (forbidden by the skill — a second
  implementation can silently disagree with the workbook), the exact `orders`/`dispatches`/
  `state_regions` rows the script would have fetched (same columns, same `created_at,id` order —
  load-bearing for distributor resolution) were pulled via the Supabase MCP tool instead and fed to
  the script's built-in `--in FILE.json` offline mode. From there it's the same tested
  `buildRegionMtdSummary` / `buildPlantMtdSummary` code computing the split, byte-identical to a live
  run on the same data — only the transport for getting rows into the script changed, not the split
  logic itself. The script's own tie-out checks (`invoicedTiesToPlant`, `pendingTiesToPlant`,
  `invoicedTiesToAllPlants`, `pendingTiesToAllPlants`) all passed with **zero** diff (`exit 0`); it
  refuses to emit otherwise. **South** and **West** are the only regions present — no North, East or
  Unmapped this run. One distributor's book (272.3 T) spans multiple states; by design its whole book
  sits under its most recent state's region — see the advisory flag below.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 757.5 T** + **Baby Coil Left 709.3 T** = **RM Total 1,466.8 T**. FG is a separate
  stage — never add it into RM. Total mother coil inward to date is 6,368.5 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 606.7 | bundle-line sum = 606.700 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 589.3 | bundle-line sum = 589.305 | ✅ PASS |
| 2 | Partition — orders | month intake = 4371.0 | Σ daily orders Aug ≤ D = 4371.0 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 606.7 | Σ daily dispatch Aug ≤ D = 606.7 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 4464.9 | 606.7 + 85.0 + 3773.2 = 4464.9 | ✅ PASS |
| 4 | Freshness | report date 2026-08-24 | max order 08-23 · dispatch 08-22 · production 08-21 | ⚠️ Data lags — zeros on D (and some D-1/D-2) are "not loaded yet" |
| 5 | Region partition — invoiced | Σ regions invoicedMtd = 606.7 + 0 = 606.7 | invoiced_mtd = 606.7 | ✅ PASS |
| 6 | Region partition — pending | Σ regions pending = 1791.15 + 2067.0 = 3858.15 | confirmed+non_confirmed = 85.0 + 3773.15 = 3858.15 | ✅ PASS |
| 7 | Plant partition — invoiced | Σ plants invoicedMtd = 606.7+0+0+0 = 606.7 | invoiced_mtd = 606.7 | ✅ PASS |
| 8 | Plant partition — pending | Σ plants pending = 803.15+1054+948+1053 = 3858.15 | confirmed+non_confirmed = 3858.15 | ✅ PASS |
| — | Mass balance (RM) | inward − full coil left = 6368.5 − 757.5 = 5611.0 | baby coil total = 5611.0 | ✅ PASS (exact) |

**Overall: PASS.** All 8 checks plus mass balance hold — including the region/plant partition
checks, run this session via the offline `--in` path described above rather than the script's live
network fetch. No figure in this report is unverified.

Advisory flags (reported, do not fail):
- **Confirmed variance** — stored bucket 85.000 T vs ERP formula (`release_qty − invoiced_qty`)
  83.125 T, a **1.9 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,611.0 − 5,027.5 = 583.5 T,
  but the per-coil floored figure (what the Dashboard shows) is **709.3 T**. The **125.8 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on the
  affected productions; it does not change the Dashboard-aligned number reported above.
- **Multi-state distributor** — 1 distributor's dispatches/orders span more than one state; its
  whole book (272.3 T combined) sits under its most recent line's region by design (same rule as the
  workbook's Distributor by Region sheet), **~6.1%** of the 4,464.9 T book. Not an error, just a
  reminder the region split is a per-distributor assignment, not a per-line one.
- **Plants with orders and no invoices** — NPMD, Lepakshi and Tapi all carry order book but have
  never invoiced; only Hyderabad has. Expected today (matches `invoicing.note`), not a fault.

## Change vs last report (2026-08-05 → 2026-08-24, 19 days)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 4,464.9 T | **+4,202.9** |
| Current Month Orders | 93.0 T | 4,371.0 T | **+4,278.0** |
| Invoiced Orders MTD | 129.2 T | 606.7 T | **+477.5** |
| Invoiced MTD (Prev Month) | 104.5 T | 589.3 T | +484.8 (different month baseline — Jul 1–5 vs Jul 1–24) |
| Dispatch D-1 | 0 T | 0 T | — |
| Dispatch D Day | 0 T | 0 T | — |
| Confirmed Pending Invoice | 56.5 T | 85.0 T | +28.5 |
| Non-Confirmed Orders | 76.3 T | 3,773.2 T | **+3,696.9** |
| Physical Inventory | 1,463.8 T | 1,393.6 T | −70.2 |
| RM Full Coil Left | 616.3 T | 757.5 T | +141.2 |
| RM Baby Coil Left | 695.7 T | 709.3 T | +13.6 |
| RM Total | 1,312.0 T | 1,466.8 T | +154.8 |
| Produced MTD | 26.3 T | 458.9 T | +432.6 |
| Produced MTD (Prev Month) | 197.8 T | 1,227.4 T | +1,029.6 |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — |
| Orders Logged D Day | 0 T | 0 T | — |
| Orders Logged D-1 | 60.0 T | 52.0 T | −8.0 |
| Orders Logged D-2 | 28.0 T | 8.0 T | −20.0 |

Reading the move: 19 days added **4,278 T** of fresh August order intake (a new month started
since the last snapshot) and **477.5 T** of invoicing. The order book is now overwhelmingly
non-confirmed (+3,696.9 T) against a much smaller confirmed bucket (+28.5 T) — most of the new
August book hasn't reached confirmed status yet. Physical Inventory dipped slightly (−70.2 T) even
as production ramped (+432.6 T MTD), because invoicing (all-time) grew faster over the same window.

# JSW Pipes & Tubes — PB MTD Update (2026-08-25)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-25
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	4271.4T
Current Month Orders --->	4193.0T
Invoiced Orders MTD · Hyderabad only --->	720.2T
Invoiced MTD (Previous Month) --->	667.2T
Dispatch D-1 (Current Month) --->	82.4T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	30.0T
Non-Confirmed Orders --->	3521.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1341.6T
RM Full Coil Left --->	860.8T
RM Baby Coil Left --->	668.7T
RM Total --->	1529.5T
	
Invoiced MTD · Hyderabad only - South --->	310.3T
Invoiced MTD · Hyderabad only - East --->	409.9T
Invoiced MTD · Hyderabad only - West --->	0T
Invoiced MTD · Hyderabad only - All Regions --->	720.2T
	
Pending to Serve - South --->	643.0T
Pending to Serve - East --->	766.2T
Pending to Serve - West --->	2142.0T
Pending to Serve - All Regions --->	3551.2T
	
Invoiced MTD by Plant · Hyderabad only - Hyderabad --->	720.2T
Invoiced MTD by Plant · Hyderabad only - NPMD --->	0T
Invoiced MTD by Plant · Hyderabad only - Lepakshi --->	0T
Invoiced MTD by Plant · Hyderabad only - Tapi --->	0T
Invoiced MTD by Plant · Hyderabad only - All Plants --->	720.2T
Invoiced MTD is Hyderabad-only — the other plants carry orders but have never invoiced. Pending is every plant's, so the two columns are not like for like.
	
Pending to Serve by Plant - Hyderabad --->	799.2T
Pending to Serve by Plant - NPMD --->	1084.0T
Pending to Serve by Plant - Lepakshi --->	565.0T
Pending to Serve by Plant - Tapi --->	1103.0T
Pending to Serve by Plant - All Plants --->	3551.2T
	
Produced MTD --->	520.5T
Produced MTD (Previous Month) --->	1272.7T
Production D-1 --->	19.0T
Production D Day --->	0T
	
Orders Logged D Day --->	19.0T
Orders Logged D-1 --->	52.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (7 calendar days remain, Aug 25–31 inclusive).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–25)
  = 667.2 T, for a like-for-like pace comparison. August is ahead: 720.2 vs 667.2
  (**+53.0 T, +7.9%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 720.2 + 30.0 + 3521.2 = 4271.4 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  5,112.5 − 3,770.9 = **1,341.6 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 5,112.3 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D and Production D read 0 because data is behind, not because the plant stopped.**
  Latest dispatch date loaded is **2026-08-24**, latest production **2026-08-24**, latest order
  **2026-08-25**. Orders Logged D-2 (Sun 23-Aug) is a **real** zero — it sits before the latest
  order date.
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August is at 520.5 T against July's 1,272.7 T over the same 25 days.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 860.8 T** + **Baby Coil Left 668.7 T** = **RM Total 1,529.5 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 6,490.8 T.
- **Region basis** — a distributor sits in exactly one region, its most recent line's state, and
  its whole book sits there. Tonnage is day-capped at D; region assignment is not.
- **Plant basis** — Pending comes from the **order row's** Ship From Code, Invoiced from the
  **dispatch entry's**. The All Plants figures are the headline; the rows partition them.
- **East is Karnataka.** The `state_regions` master carries a single row, `KARNATAKA → East`,
  which overrides the shipped seed (Karnataka = South). Two distributors ship to Karnataka, so
  409.9 T invoiced and 766.2 T pending report as East. See the advisory flags.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 720.2 | bundle-line sum = 720.240 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 667.2 | bundle-line sum = 667.170 | ✅ PASS |
| 2 | Partition — orders | month intake = 4193.0 | Σ daily orders Aug = 4193.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 720.2 | Σ daily dispatch Aug ≤ D = 720.240 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 4271.4 | 720.2 + 30.0 + 3521.2 = 4271.4 | ✅ PASS |
| 4 | Freshness | report date 2026-08-25 | max order 08-25 · dispatch 08-24 · production 08-24 | ⚠️ Dispatch/production lag one day — D zeros are "not loaded yet" |
| 5 | Region partition — invoiced | Postgres aggregate = 720.240 | Σ regions (JS, app helpers) = 720.240 | ✅ PASS |
| 6 | Region partition — pending | Postgres aggregate = 3551.195 | Σ regions (JS, app helpers) = 3551.195 | ✅ PASS |
| 7 | Plant partition — invoiced | Postgres aggregate = 720.240 | Σ plants (JS, app helpers) = 720.240 | ✅ PASS |
| 8 | Plant partition — pending | Postgres aggregate = 3551.195 | Σ plants (JS, app helpers) = 3551.195 | ✅ PASS |
| — | Mass balance (RM) | inward − full coil left = 6,490.8 − 860.8 = 5,630.0 | baby coil total = 5,630.0 | ✅ PASS (exact) |
| — | Row-set completeness | Postgres: confirmed 30.0 · non-conf 3521.2 · invoiced all-time 3770.9 | offline row set: 30.0 · 3521.2 · 3770.92 | ✅ PASS |

**Overall: PASS.** Every hard check holds.

Checks 5–8 are genuinely dual-method: one side aggregates in Postgres, the other counts rows in JS
through `buildRegionMtdSummary` / `buildPlantMtdSummary`. They prove each split is a partition of the
headline — not that every line is attributed to the right region or plant.

Advisory flags (reported, do not fail):
- **`KARNATAKA → East` in the state master** — the stored `state_regions` table holds exactly one row
  and it maps Karnataka to **East**, overriding the seed's South. That single row is what puts
  409.9 T of invoicing and 766.2 T of pending in East. If it is a typo on the Sales tab, fix it there
  and both this report and the daily message move together; nothing here is hand-adjusted.
- **The two reports disagree on those distributors** — `buildRegionMtdSummary` calls
  `distributorRegionResolver(orders, dispatches, stateRegions)` **without** the distributor master,
  so the region split reads state-derived regions only. `scripts/servable-orders.mjs` passes the
  master, whose rows mark both Karnataka distributors **South**, so the servable message lists them
  under South. Same data, two precedences — a code gap worth a ticket, not a number to patch.
- **Confirmed variance** — stored bucket 30.000 T vs ERP formula (`release_qty − invoiced_qty`)
  25.390 T, a **4.6 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,630.0 − 5,089.0 = 541.0 T,
  but the per-coil floored figure (what the Dashboard shows) is **668.7 T**. The **127.7 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on the
  affected productions; it does not change the Dashboard-aligned number reported above.
- **Plants with orders and no invoices** — NPMD, Lepakshi and Tapi. Expected: only Hyderabad has ever
  invoiced. That is why every Invoiced line beside multi-plant Pending carries `· Hyderabad only`.
- **Multi-state distributor** — 1 distributor (Karnataka + Andhra Pradesh) carrying **277.3 T**, 6.5%
  of the 4,271.4 T book. Its whole book sits in one region by design.
- **Post-D dispatch** — none (0 T). **Unmapped states** — none. **Unattributed plant tonnage** — none.

Data path note: this session's egress policy blocks `hztblmccvvarmgxmunrp.supabase.co`, so the split
scripts could not fetch over HTTP. The rows were exported through the Supabase MCP and replayed into
`scripts/daily-splits.mjs --in`, which runs the **same** `buildRegionMtdSummary` /
`buildPlantMtdSummary` on them — no SQL re-derivation of either split. The row-set completeness check
above ties the offline rows back to Postgres's own aggregates.

## Change vs last report (2026-08-05 → 2026-08-25)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 4271.4 T | **+4009.4** |
| Current Month Orders | 93.0 T | 4193.0 T | **+4100.0** |
| Invoiced Orders MTD | 129.2 T | 720.2 T | **+591.0** |
| Invoiced MTD (Prev Month) | 104.5 T | 667.2 T | +562.7 (5-day vs 25-day window) |
| Dispatch D-1 | 0 T | 82.4 T | +82.4 |
| Dispatch D Day | 0 T | 0 T | — (not loaded) |
| Confirmed Pending Invoice | 56.5 T | 30.0 T | **−26.5** |
| Non-Confirmed Orders | 76.3 T | 3521.2 T | **+3444.9** |
| Physical Inventory | 1463.8 T | 1341.6 T | **−122.2** |
| RM Full Coil Left | 616.3 T | 860.8 T | **+244.5** |
| RM Baby Coil Left | 695.7 T | 668.7 T | −27.0 |
| RM Total | 1312.0 T | 1529.5 T | **+217.5** |
| Produced MTD | 26.3 T | 520.5 T | **+494.2** |
| Produced MTD (Prev Month) | 197.8 T | 1272.7 T | +1074.9 (window) |
| Production D-1 | 0 T | 19.0 T | +19.0 |
| Production D Day | 0 T | 0 T | — (not loaded) |
| Orders Logged D Day | 0 T | 19.0 T | +19.0 |
| Orders Logged D-1 | 60.0 T | 52.0 T | −8.0 |
| Orders Logged D-2 | 28.0 T | 0 T | −28.0 (Sunday) |
| Region / Plant splits | not in that report | South / East / West · 4 plants | new lines |

Reading the move: the August book was largely uploaded after the 5th — 4,100 T of fresh orders, of
which 3,521 T is still non-confirmed. Invoicing ran 591 T further and production 494 T, so FG fell
122 T while raw material rose 218 T. The order book is now four plants wide; invoicing is still
Hyderabad's alone.

# JSW Pipes & Tubes — PB MTD Update (2026-08-20)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-20
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	4272.5T
Current Month Orders --->	4193.0T
Invoiced Orders MTD · Hyderabad only --->	463.5T
Invoiced MTD (Previous Month) --->	454.4T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	25.0T
Non-Confirmed Orders --->	3784.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1407.6T
RM Full Coil Left --->	600.7T
RM Baby Coil Left --->	688.9T
RM Total --->	1289.6T

Invoiced MTD · Hyderabad only - South --->	463.5T
Invoiced MTD · Hyderabad only - West --->	0T
Invoiced MTD · Hyderabad only - All Regions --->	463.5T

Pending to Serve - South --->	1693.0T
Pending to Serve - West --->	2116.0T
Pending to Serve - All Regions --->	3809.0T

Invoiced MTD by Plant · Hyderabad only - Hyderabad --->	463.5T
Invoiced MTD by Plant · Hyderabad only - NPMD --->	0T
Invoiced MTD by Plant · Hyderabad only - Lepakshi --->	0T
Invoiced MTD by Plant · Hyderabad only - Tapi --->	0T
Invoiced MTD by Plant · Hyderabad only - All Plants --->	463.5T
(Invoiced MTD is Hyderabad-only — the other plants carry orders but have never invoiced.
 Pending is every plant's, so the two columns are not like for like.)

Pending to Serve by Plant - Hyderabad --->	768.0T
Pending to Serve by Plant - NPMD --->	1082.0T
Pending to Serve by Plant - Lepakshi --->	885.0T
Pending to Serve by Plant - Tapi --->	1074.0T
Pending to Serve by Plant - All Plants --->	3809.0T

Produced MTD --->	329.8T
Produced MTD (Previous Month) --->	1057.3T
Production D-1 --->	0T
Production D Day --->	0T

Orders Logged D Day --->	0T
Orders Logged D-1 --->	1028.0T
Orders Logged D-2 --->	385.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied. Give a best
  estimate and both lines compute (**12 calendar** days remain, Aug 20–31 inclusive; there is no
  holiday/Sunday calendar in the system, so it is calendar days, not working days).
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–20)
  = 454.4 T, for a like-for-like pace comparison. August is marginally ahead: 463.5 vs 454.4
  (**+9.1 T, +2%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 463.5 + 25.0 + 3784.0 = 4272.5 T.
- **The order book roughly doubled in two days.** Non-confirmed was 2,512.0 T on 18-Aug and is
  3,784.0 T now, with 1,028.0 T logged on the 19th alone. That is real intake, not a restatement —
  `Current Month Orders` (4,193.0 T) is the month's own logging.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,921.8 − 3,514.2 = **1,407.6 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,921.6 T (Δ 0.2 T vs live) — negligible master-weight drift.
- **Dispatch D / D-1 and Production D / D-1 read 0 because data is behind, not because the plant
  stopped.** Latest dispatch date loaded is **2026-08-17**; latest production date **2026-08-17**;
  latest order date **2026-08-19**. Treat every 0 on a later date as "not loaded yet".
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August is at 329.8 T against July's 1,057.3 T over the same 20 days — with
  production loaded only through Aug 17, part of that gap is unloaded data, but not all of it.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 600.7 T** + **Baby Coil Left 688.9 T** = **RM Total 1,289.6 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 6,062.3 T.
- **Region basis** — a distributor sits in **one** region (its most recent line's state), exactly as
  the workbook's *Distributor by Region* sheet does. Its whole book sits there even when it ships to
  several states. Only Invoiced MTD and Pending to Serve split by region; Production, RM and
  Physical Inventory carry no ship-to state and are never split.
- **Plant basis** — Pending comes from the **order row's** own Ship From Code, Invoiced from the
  **dispatch entry's**; neither is typed. The All Plants figures are the headline ones above — the
  per-plant rows are a partition of them, never a replacement.
- **North and East are absent, not zero.** No distributor currently resolves to either region.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 463.5 | bundle-line sum = 463.490 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 454.4 | bundle-line sum = 454.440 | ✅ PASS |
| 2 | Partition — dispatch | headline `invoiced_mtd` = 463.5 | Σ daily slices = 463.490 | ✅ PASS |
| 2 | Partition — orders | headline `orders_month_intake` = 4193.0 | Σ daily slices = 4193.000 | ✅ PASS |
| 3 | Arithmetic — Total Orders | stated = 4272.5 | 463.5 + 25.0 + 3784.0 = 4272.5 | ✅ PASS |
| 4 | Freshness | max order 2026-08-19 / dispatch 2026-08-17 / production 2026-08-17 | D and D-1 zeros all post-date their max | ✅ PASS (data behind, not idle) |
| 5 | Region partition — invoiced | Σ regions (JS, app helpers) = 463.490 | Postgres aggregate = 463.49 | ✅ PASS (Δ 5.7e-14) |
| 6 | Region partition — pending | Σ regions (JS) = 3809.0 | Postgres `confirmed + non_confirmed` = 3809.0 | ✅ PASS |
| 7 | Plant partition — invoiced | Σ plants (JS) = 463.490 | Postgres aggregate = 463.49 | ✅ PASS (Δ 0) |
| 8 | Plant partition — pending | Σ plants (JS) = 3809.0 | Postgres = 3809.0 | ✅ PASS |
| 9 | RM mass balance | inward − full coil left = 6062.3 − 600.7 = 5461.6 | Σ baby coil weight = 5461.6 | ✅ PASS (exact) |

**Overall: PASS.** Checks 5–8 are genuinely dual-method — one side counts rows in JS through the
app's own helpers (`buildRegionMtdSummary` / `buildPlantMtdSummary`), the other aggregates in
Postgres — so neither can quietly adopt the other's bug. What they cannot see: a Σ check passes just
as happily when a distributor is filed in the wrong region or a line under the wrong plant. They
prove the split is a **partition**, not that it is **attributed** correctly.

### Advisory flags (reported, not failures)

- **Baby-coil over-consumption — 125.6 T.** Floored `baby_left` is 688.9 T; the unfloored
  `baby_total_wt − baby_consumed` is 563.3 T (5461.6 − 4898.3). The 125.6 T gap means some baby
  coils have production allocated beyond their slit weight. The Dashboard floors per coil (the app's
  `Math.max(0, …)`), so the card is right; the allocations behind it need a look.
- **Confirmed variance — 0.9 T.** Stored `confirmed` = 25.000; the ERP formula
  `release_qty − invoiced_qty` = 24.090. The report uses the **stored** bucket, app-consistent.
- **Production master-weight drift — 0.2 T.** Σ stored `total_weight` = 4,921.6 vs live recompute
  4,921.8. Negligible; the app heals this at read time.
- **Multi-state distributor — 1, carrying 271.7 T (7.1% of pending).** Its whole book sits in one
  region by design. Above the 5% notice threshold, so it is named here rather than left implicit.
- **Plants with orders and no invoices — NPMD, Lepakshi, Tapi.** Expected: only Hyderabad has ever
  invoiced. This is the four-plants-against-one comparison, labelled rather than hidden.
- **Unmapped / Unattributed — none.** 0 T of pending or invoiced tonnage sits outside a mapped
  region or a known plant.
- **Post-D dispatch — none.** No in-month tonnage is dated after 2026-08-20, so the day-capped
  region split and the workbook's *Distributor by Region* sheet agree exactly.

### Data-path note

This session's egress policy blocks `hztblmccvvarmgxmunrp.supabase.co` (403 at the agent proxy), so
`scripts/daily-splits.mjs` could not use its PostgREST path. It was run through its `--in` mode on a
bundle rebuilt from the Supabase MCP: orders verbatim, and dispatch entries collapsed by a **plain Σ
of weight** over rows sharing the same date, identity keys, ship-to state and plant (original entry
counts restored, so line counts stay truthful). No identity, region, plant or stock rule was
aggregated — all of those still ran inside `src/lib`, per ADR-0003. The reconstruction is verified by
checks 5–8: the JS split totals tie to Postgres's own aggregates to 5.7e-14.

## Change vs last report (2026-08-05 → 2026-08-20)

| Line | 2026-08-05 | 2026-08-20 | Δ |
|---|---|---|---|
| Total Orders | 262.0T | 4272.5T | **+4010.5** |
| Current Month Orders | 93.0T | 4193.0T | **+4100.0** |
| Invoiced Orders MTD | 129.2T | 463.5T | +334.3 |
| Invoiced MTD (Previous Month) | 104.5T | 454.4T | +349.9 (different window: Jul 1–5 → Jul 1–20) |
| Dispatch D-1 | 0T | 0T | — |
| Dispatch D Day | 0T | 0T | — |
| Confirmed Orders Pending | 56.5T | 25.0T | −31.5 |
| Non-Confirmed Orders | 76.3T | 3784.0T | **+3707.7** |
| Physical Inventory | 1463.8T | 1407.6T | −56.2 |
| RM Full Coil Left | 616.3T | 600.7T | −15.6 |
| RM Baby Coil Left | 695.7T | 688.9T | −6.8 |
| RM Total | 1312.0T | 1289.6T | −22.4 |
| Produced MTD | 26.3T | 329.8T | +303.5 |
| Produced MTD (Previous Month) | 197.8T | 1057.3T | +859.5 (different window) |
| Orders Logged D Day | 0T | 0T | — |
| Orders Logged D-1 | 60.0T | 1028.0T | +968.0 |
| Orders Logged D-2 | 28.0T | 385.0T | +357.0 |
| Region split | — | South / West | **new** — absent from the 05-Aug report |
| Plant split | — | 4 plants | **new** — absent from the 05-Aug report |

Both MTD figures moved because 15 more days of the month have elapsed, not only because the
business changed. The line that is genuinely a step change is **Non-Confirmed (+3,707.7 T)**: the
open order book grew from 76.3 T to 3,784.0 T over the fortnight, with 1,028.0 T logged on 19-Aug
alone. Stock moved the other way — FG down 56.2 T and RM down 22.4 T — so the plant is drawing
down inventory against a book that is growing much faster than it.

## Excluded lines (unchanged, and why)

- **Retail / Distributor Through Project / Project Orders** — 🚫 not relevant: `orders` carries no
  order-category dimension.
- **Invoiced MTD-FE 550 / FE 550D - LRF**, **Physical Inventory · FE 550 / FE 550D** — 🚫 not
  relevant: those are TMT rebar grades. P&T coils carry IS 10748 HR variants; finished pipe carries
  no grade at all.
- **Carry-forward Orders** — ⚠️ not tracked.
- **SFDC Orders** — ⚠️ no SFDC flag; `distributor_code` values *are* Salesforce IDs, so there is no
  separable subset.

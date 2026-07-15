# JSW Pipes & Tubes — PB MTD Update (2026-07-15)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-15
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	903.4T
Current Month Orders --->	827.0T
Invoiced Orders MTD --->	348.4T
Invoiced MTD (Previous Month) --->	429.1T
Dispatch D-1 (Current Month) --->	25.2T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	0.0T
Non-Confirmed Orders --->	555.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1623.2T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	25.0T
Orders Logged D-2 --->	552.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no monthly target was supplied for this
  run, so both read ⚠️ N/A. (The 2026-07-10 snapshot used a manual **2500 T** July estimate; rerun
  the `pb-mtd-report` skill with `best_estimate=2500` to restore the run-rate line.)
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–15), for a like-for-like pace comparison — not the full June total. July is pacing behind:
  **348.4 T vs 429.1 T** over the same 15 days (~80.7 T behind June's pace).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI) = 348.4 + 0.0 + 555.0.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  3,903.1 − 2,279.9 = **1,623.2 T**. This is the Dashboard → **Finished Goods → FG Left Inventory**
  card. The app recomputes production weight from the master on every view (`resolveProductionWeights`,
  `App.jsx:2758`) rather than trusting each production row's stored `total_weight` snapshot. Here the
  stored-basis sum (3,902.9 T) sits just **0.2 T below** the live recompute — master `weightPerTube`
  values are essentially in sync (no meaningful post-save drift this run).
- **Dispatch D Day / Orders Logged D Day** read 0 because the latest data loaded is order_date and
  dispatch date **2026-07-14** — 2026-07-15 has no data loaded yet, not necessarily zero activity.
  D-1 (2026-07-14) is the freshest day: 25.2 T dispatched, 25.0 T ordered.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-15)

Every ✅ figure was reproduced by a second independent method — all headline values match, **zero drift**.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul) | 348.4 T | Σ line weights = Σ theoretical_weight = 348.445 | ✅ exact |
| Invoiced MTD prev month (Jun 1–15) | 429.1 T | dual-method = 429.134 (same day-of-month) | ✅ exact |
| Dispatch month total | 348.4 T | = Invoiced MTD (partition check) = 348.445 | ✅ |
| Current-month orders | 827.0 T | Σ daily order intake = 827.000 (partition check) | ✅ |
| Total Orders | 903.4 T | 348.4 + 0.0 + 555.0 | ✅ arithmetic |
| Confirmed | 0.0 T | stored bucket, app-consistent (`salesKpis`); ERP Release−Invoiced = 0.0 T | ✅ no variance |
| Physical Inventory | 1,623.2 T | produced (live master recompute) 3,903.1 − invoiced 2,279.9 = Dashboard FG Left Inventory | ✅ matches Dashboard |

**Data freshness:** latest `order_date` = 2026-07-14, latest `date_of_dispatch` = 2026-07-14 — so
Dispatch D-day and Orders Logged D-day are 0 for lack of loaded data, not zero activity.

## Change vs last report (2026-07-10 → 2026-07-15)

Cumulative/MTD lines are comparable within July; **daily lines refer to different calendar days**
(the two reports are 5 days apart, not consecutive) so their deltas are shown for reference only.

| Line | 2026-07-10 | 2026-07-15 | Δ |
|---|---|---|---|
| Total Orders | 300.7 T | 903.4 T | +602.7 |
| Current Month Orders | 226.0 T | 827.0 T | +601.0 |
| Invoiced Orders MTD | 249.4 T | 348.4 T | +99.0 |
| Invoiced MTD (Prev Month, same window) | 257.9 T | 429.1 T | +171.2 |
| Confirmed | 26.0 T | 0.0 T | −26.0 |
| Non-Confirmed | 25.3 T | 555.0 T | +529.7 |
| Physical Inventory | 1,559.3 T | 1,623.2 T | +63.9 |
| Best Estimate | 2,500 T | ⚠️ N/A | (not supplied this run) |

The big Current-Month-Orders / Non-Confirmed jump is driven by a large intake logged on **2026-07-13
(552 T)**. Confirmed fell to 0 T (prior 26 T cleared through to invoicing). Invoiced MTD added +99.0 T
over the 5 days but July still trails June's same-window pace (348.4 vs 429.1 T).

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._

# JSW Pipes & Tubes — PB MTD Update (2026-07-22)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-22
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	560.4T
Current Month Orders --->	482.0T
Invoiced Orders MTD --->	454.4T
Invoiced MTD (Previous Month) --->	642.6T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	47.0T
Non-Confirmed Orders --->	59.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1888.0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	47.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — ⚠️ N/A: no monthly target was supplied
  for this run (there is no forecast field in the system; it must be entered manually).
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–22 = 642.6 T), for a like-for-like pace comparison — not the full June total.
  July is pacing behind June: 454.4 T vs 642.6 T over the same 22 days.
- **Total Orders** = Invoiced MTD + Confirmed + Non-confirmed = 454.4 + 47.0 + 59.0 (app Sales KPI).
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,273.9 − 2,385.9 = **1,888.0 T**. This is the Dashboard → **Finished Goods → FG Left Inventory**
  card. The stored-`total_weight` basis (4,273.7 T) differs by only −0.2 T here, so master weights
  were essentially unchanged after production save this cycle.
- **Dispatch D / D-1 and Orders Logged D Day** read 0 because the latest data loaded is
  order_date 2026-07-21 and dispatch date 2026-07-20 — **no data loaded yet** for 22-Jul (and
  21-Jul dispatch), not necessarily zero activity. Orders Logged D-2 (20-Jul) = 0 is a genuine
  zero (that date is within the loaded window).

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-22)

Every ✅ figure was reproduced by a second independent method — all headline values match, **zero drift**.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul 1–22) | 454.4 T | Σ line weights = Σ theoretical_weight = 454.440 | ✅ exact |
| Invoiced MTD prev month (Jun 1–22) | 642.6 T | dual-method = 642.574 (same day-of-month window) | ✅ exact |
| Dispatch month total | 454.4 T | = Invoiced MTD (partition check) | ✅ |
| Total Orders | 560.4 T | 454.4 + 47.0 + 59.0 | ✅ arithmetic |
| Confirmed | 47.0 T | stored bucket (`salesKpis`) vs ERP Release−Invoiced = 47.0 | ✅ exact (no variance) |
| Physical Inventory | 1,888.0 T | produced (live master recompute) 4,273.9 − invoiced 2,385.9 = Dashboard FG Left Inventory | ✅ matches Dashboard |

**Data freshness:** latest `order_date` = 2026-07-21, latest `date_of_dispatch` = 2026-07-20 — so
Dispatch D / D-1 and Orders Logged D-day are 0 for lack of loaded data, not zero activity.

## Change vs last report (2026-07-10 → 2026-07-22)

| Line | 2026-07-10 | 2026-07-22 | Δ |
|---|---|---|---|
| Total Orders | 300.7 T | 560.4 T | +259.7 |
| Current Month Orders | 226.0 T | 482.0 T | +256.0 |
| Invoiced Orders MTD | 249.4 T | 454.4 T | +205.0 |
| Invoiced MTD (Prev Month) | 257.9 T (Jun 1–10) | 642.6 T (Jun 1–22) | +384.7 (wider window) |
| Dispatch D-1 | 35.9 T | 0 T | −35.9 |
| Dispatch D Day | 0 T | 0 T | 0 |
| Confirmed | 26.0 T | 47.0 T | +21.0 |
| Non-Confirmed | 25.3 T | 59.0 T | +33.7 |
| Physical Inventory | 1,559.3 T | 1,888.0 T | +328.7 |
| Orders Logged D Day | 0 T | 0 T | 0 |
| Orders Logged D-1 | 0 T | 47.0 T | +47.0 |
| Orders Logged D-2 | 51.0 T | 0 T | −51.0 |

Note: the 2026-07-10 report was run with a manual Best Estimate of 2500 T (run rate 102.3 T/day);
this run had no target supplied, so those two lines are ⚠️ N/A. The previous-month comparison
windows differ (1–10 vs 1–22), so that Δ reflects the wider window, not a like-for-like jump.

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._

# JSW Pipes & Tubes — PB MTD Update (2026-07-20)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-20
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	524.8T
Current Month Orders --->	447.0T
Invoiced Orders MTD --->	423.8T
Invoiced MTD (Previous Month) --->	642.6T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	25.0T
Non-Confirmed Orders --->	76.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1807.2T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	64.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no monthly target was supplied for this run,
  so both read ⚠️ N/A (there is no forecast field in the system). For reference, the 2026-07-10 report
  used 2500 T for July; supply `best_estimate` to recompute the run rate (with 12 calendar days left,
  2500 T would imply ~173.0 T/day).
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–20 = 642.6 T), for a like-for-like pace comparison — not the full June total. July is pacing
  behind June over the same 20 days: 423.8 T vs 642.6 T.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 423.8 + 25.0 + 76.0 = **524.8 T** (app Sales KPI).
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,162.4 − 2,355.2 = **1,807.2 T**. This is the Dashboard → **Finished Goods → FG Left Inventory**
  card. Stored-basis produced (4,162.2 T) sits only 0.2 T off the live recompute this run, so master
  `weightPerTube` values are effectively unchanged since production save — data is clean.
- **Dispatch D / D-1 and Orders Logged D / D-1** read 0 because the latest data loaded is order_date
  2026-07-18 and dispatch date 2026-07-18 — the 19th and 20th are not loaded yet, **not** zero activity.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-20)

Every ✅ figure was reproduced by a second independent method — all headline values match, **zero drift**.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul 1–20) | 423.8 T | Σ line weights = Σ theoretical_weight = 423.775 | ✅ exact |
| Invoiced MTD prev month (Jun 1–20) | 642.6 T | dual-method = 642.574 (same day-of-month) | ✅ exact |
| Dispatch month total | 423.8 T | = Invoiced MTD (partition check) | ✅ |
| Current-month orders | 447.0 T | Σ daily order intake = 447.0 (partition check) | ✅ |
| Total Orders | 524.8 T | 423.8 + 25.0 + 76.0 | ✅ arithmetic |
| Confirmed | 25.0 T | stored bucket (`salesKpis`) vs ERP Release−Invoiced = 25.0 | ✅ no variance |
| Physical Inventory | 1,807.2 T | produced (live master recompute) 4,162.4 − invoiced 2,355.2 = Dashboard FG Left Inventory | ✅ matches Dashboard |

**Data freshness:** latest `order_date` = 2026-07-18, latest `date_of_dispatch` = 2026-07-18 — so
Dispatch D / D-1 and Orders Logged D / D-1 are 0 for lack of loaded data, not zero activity.

## Change vs last report (2026-07-10 → 2026-07-20)

| Line | 2026-07-10 | 2026-07-20 | Δ |
|---|---|---|---|
| Total Orders | 300.7 T | 524.8 T | +224.1 |
| Current Month Orders | 226.0 T | 447.0 T | +221.0 |
| Invoiced Orders MTD | 249.4 T | 423.8 T | +174.4 |
| Invoiced MTD (Previous Month)* | 257.9 T | 642.6 T | +384.7 |
| Dispatch D-1 | 35.9 T | 0 T | −35.9 |
| Dispatch D Day | 0 T | 0 T | 0 |
| Confirmed | 26.0 T | 25.0 T | −1.0 |
| Non-Confirmed | 25.3 T | 76.0 T | +50.7 |
| Physical Inventory | 1,559.3 T | 1,807.2 T | +247.9 |
| Orders Logged D-2 | 51.0 T | 64.0 T | +13.0 |

*Prev-month windows differ by design (Jun 1–10 for the 07-10 report vs Jun 1–20 here), so this Δ is
not a like-for-like comparison — each report compares against the same day-of-month in June.

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._

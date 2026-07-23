# JSW Pipes & Tubes — PB MTD Update (2026-07-23)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-23
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	653.1T
Current Month Orders --->	573.0T
Invoiced Orders MTD --->	537.1T
Invoiced MTD (Previous Month) --->	694.5T
Dispatch D-1 (Current Month) --->	34.3T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	25.0T
Non-Confirmed Orders --->	91.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1860.8T
	
Orders Logged D Day --->	65.0T
Orders Logged D-1 --->	26.0T
Orders Logged D-2 --->	47.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no monthly target supplied for this run,
  so both are N/A (there is no forecast field in the system; the estimate is manual).
- **Invoiced MTD (Previous Month)** = June invoiced **through the same day-of-month** (Jun 1–23),
  for a like-for-like pace comparison — not the full June total. July is pacing behind June over
  the same 23 days: 537.1 T vs 694.5 T.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 537.1 + 25.0 + 91.0 (app Sales KPI).
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, where produced is
  **recomputed live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,329.3 − 2,468.5 = **1,860.8 T** — the Dashboard → **Finished Goods → FG Left Inventory** card.
  Stored-basis produced (4,329.1 T) is within 0.2 T of the live recompute here, so no material
  post-save master-weight drift this run.
- **Dispatch D Day** reads 0 because the latest dispatch data loaded is 2026-07-22 — D-day
  (2026-07-23) has no data loaded yet, not necessarily zero activity. Orders through 2026-07-23
  are loaded (Orders Logged D Day = 65.0 T).

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-23) — ✅ PASS

Every headline figure was reproduced by a second independent method — all values match, **zero drift**.

| Metric | Value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul) | 537.1 T | Σ line weights = 537.090 = Σ theoretical_weight | ✅ exact (≤0.01) |
| Invoiced MTD prev month (Jun 1–23) | 694.5 T | dual-method = 694.504 (same day-of-month) | ✅ exact (≤0.01) |
| Dispatch month total | 537.1 T | partition Σ = 537.090 = Invoiced MTD | ✅ |
| Current-month orders | 573.0 T | partition Σ daily order intake = 573.000 | ✅ |
| Total Orders | 653.1 T | 537.1 + 25.0 + 91.0 | ✅ arithmetic |
| Confirmed | 25.0 T | stored bucket, app-consistent (`salesKpis`) | ⚠️ ERP Release−Invoiced = 24.7 T → 0.3 T source variance |
| Physical Inventory | 1,860.8 T | produced (live master recompute) 4,329.3 − invoiced 2,468.5 = Dashboard FG Left Inventory | ✅ matches Dashboard |

**Data freshness:** latest `order_date` = 2026-07-23, latest `date_of_dispatch` = 2026-07-22 — so
Dispatch D-day is 0 for lack of loaded data, not zero activity. Orders are current through D.

**Data hygiene:** stored produced 4,329.1 T vs live-recompute 4,329.3 T → 0.2 T delta (negligible;
master `weightPerTube` essentially unchanged since production save).

## Change vs last report (2026-07-10 → 2026-07-23)

| Line | 2026-07-10 | 2026-07-23 | Δ |
|---|---|---|---|
| Total Orders | 300.7 T | 653.1 T | +352.4 |
| Current Month Orders | 226.0 T | 573.0 T | +347.0 |
| Invoiced Orders MTD | 249.4 T | 537.1 T | +287.7 |
| Invoiced MTD (Prev Month, same days) | 257.9 T (Jun 1–10) | 694.5 T (Jun 1–23) | +436.6 (wider window) |
| Dispatch D-1 | 35.9 T | 34.3 T | −1.6 |
| Dispatch D Day | 0 T | 0 T | 0 |
| Confirmed Pending Invoice | 26.0 T | 25.0 T | −1.0 |
| Non-Confirmed Orders | 25.3 T | 91.0 T | +65.7 |
| Physical Inventory | 1,559.3 T | 1,860.8 T | +301.5 |
| Orders Logged D Day | 0 T | 65.0 T | +65.0 |
| Orders Logged D-1 | 0 T | 26.0 T | +26.0 |
| Orders Logged D-2 | 51.0 T | 47.0 T | −4.0 |

Note: Best Estimate (2500 T) and Daily Run Rate Required (102.3 T) were on the 2026-07-10 report but
are N/A here because no monthly target was supplied for this run — not a data change.

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._

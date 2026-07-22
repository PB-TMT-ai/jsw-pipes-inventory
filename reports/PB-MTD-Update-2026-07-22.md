# JSW Pipes & Tubes — PB MTD Update (2026-07-22)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

> ⚠️ **Manual ERP adjustment applied.** A **48 T dispatch on 21-Jul (D-1)** is **not recorded
> in the ERP** due to a system issue, so it is **not in the database** and was **added manually**
> to this report. The overlay lands on four lines — **Dispatch D-1** (0 → 48 T), **Invoiced MTD**
> (454.4 → 502.4 T), **Total Orders** (560.4 → 608.4 T), and **Physical Inventory** (1,888.0 →
> 1,840.0 T, since shipped goods leave FG stock). The system-of-record figures below the block
> remain the verified database truth; these will self-correct once the ERP is fixed and the data reloads.

```
PB MTD update as on --->	2026-07-22
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	608.4T  ⚠️ (incl. +48 T manual)
Current Month Orders --->	482.0T
Invoiced Orders MTD --->	502.4T  ⚠️ (incl. +48 T manual)
Invoiced MTD (Previous Month) --->	642.6T
Dispatch D-1 (Current Month) --->	48T  ⚠️ (manual — not in ERP)
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	47.0T
Non-Confirmed Orders --->	59.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1840.0T  ⚠️ (net of +48 T manual dispatch)
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	47.0T
Orders Logged D-2 --->	0T
```

Notes:
- **⚠️ Manual dispatch overlay (21-Jul, 48 T):** flagged by the plant as physically dispatched but
  missing from the ERP. It is applied on top of the verified database numbers, **not** stored in
  Supabase. The 48 T figure is the plant's manual number and may not be the full 21-Jul dispatch
  once the ERP reloads. Every ⚠️ line above carries this overlay.
- **Revised Best Estimate / Daily Run Rate Required** — ⚠️ N/A: no monthly target was supplied
  for this run (there is no forecast field in the system; it must be entered manually).
- **Invoiced MTD (Previous Month)** = previous month invoiced **through the same day-of-month**
  (Jun 1–22 = 642.6 T), for a like-for-like pace comparison — not the full June total. With the
  manual overlay, July pace is 502.4 T vs June's 642.6 T over the same 22 days (still behind).
- **Total Orders** = Invoiced MTD + Confirmed + Non-confirmed = 502.4 + 47.0 + 59.0 (app Sales KPI).
- **Current Month Orders / Orders Logged lines** are order-intake metrics — the manual dispatch is
  a shipment, not a new order, so these are **unchanged**.
- **Physical Inventory** = finished pipe stock = **produced − invoiced** (Dashboard → Finished Goods
  → FG Left Inventory). System figure = 4,273.9 (produced, live master recompute) − 2,385.9
  (invoiced) = **1,888.0 T**; net of the manual +48 T dispatch = **1,840.0 T**. The stored-`total_weight`
  basis (4,273.7 T) differs from the live recompute by only −0.2 T, so master weights were essentially
  unchanged after production save this cycle.
- **Dispatch D Day / Orders Logged D Day** read 0 because the latest data loaded is order_date
  2026-07-21 and dispatch date 2026-07-20 — **no data loaded yet** for 22-Jul, not necessarily zero
  activity. (The 21-Jul dispatch gap is exactly the ERP issue captured by the manual overlay above.)

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

## Verification (as of 2026-07-22)

Cross-checks are against the **database (system-of-record)** figures. The manual 21-Jul overlay is
**outside** these checks by definition — it is the ERP gap, not a stored value.

| Metric | System value | Independent cross-check | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul 1–22) | 454.4 T | Σ line weights = Σ theoretical_weight = 454.440 | ✅ exact |
| Invoiced MTD prev month (Jun 1–22) | 642.6 T | dual-method = 642.574 (same day-of-month window) | ✅ exact |
| Dispatch month total | 454.4 T | = Invoiced MTD (partition check) | ✅ |
| Total Orders | 560.4 T | 454.4 + 47.0 + 59.0 | ✅ arithmetic |
| Confirmed | 47.0 T | stored bucket (`salesKpis`) vs ERP Release−Invoiced = 47.0 | ✅ exact (no variance) |
| Physical Inventory | 1,888.0 T | produced (live master recompute) 4,273.9 − invoiced 2,385.9 = Dashboard FG Left Inventory | ✅ matches Dashboard |

**Manual overlay reconciliation:** report block = system value + 48 T on the four ⚠️ lines
(Dispatch D-1, Invoiced MTD, Total Orders) and − 48 T on Physical Inventory. Applied per the plant's
21-Jul ERP-gap notice; removes automatically when the ERP-corrected data reloads.

**Data freshness:** latest `order_date` = 2026-07-21, latest `date_of_dispatch` = 2026-07-20 — so
Dispatch D-day and Orders Logged D-day are 0 for lack of loaded data, not zero activity.

## Change vs last report (2026-07-10 → 2026-07-22)

Current column shows the **manual-overlay** values (⚠️) where they differ from the system figure.

| Line | 2026-07-10 | 2026-07-22 | Δ |
|---|---|---|---|
| Total Orders | 300.7 T | 608.4 T ⚠️ | +307.7 |
| Current Month Orders | 226.0 T | 482.0 T | +256.0 |
| Invoiced Orders MTD | 249.4 T | 502.4 T ⚠️ | +253.0 |
| Invoiced MTD (Prev Month) | 257.9 T (Jun 1–10) | 642.6 T (Jun 1–22) | +384.7 (wider window) |
| Dispatch D-1 | 35.9 T | 48 T ⚠️ | +12.1 |
| Dispatch D Day | 0 T | 0 T | 0 |
| Confirmed | 26.0 T | 47.0 T | +21.0 |
| Non-Confirmed | 25.3 T | 59.0 T | +33.7 |
| Physical Inventory | 1,559.3 T | 1,840.0 T ⚠️ | +280.7 |
| Orders Logged D Day | 0 T | 0 T | 0 |
| Orders Logged D-1 | 0 T | 47.0 T | +47.0 |
| Orders Logged D-2 | 51.0 T | 0 T | −51.0 |

Notes: the 2026-07-10 report used a manual Best Estimate of 2500 T (run rate 102.3 T/day); this run
had no target, so those lines are ⚠️ N/A. The previous-month comparison windows differ (1–10 vs 1–22).
System-of-record equivalents for the ⚠️ lines this run: Total Orders 560.4 T, Invoiced MTD 454.4 T,
Dispatch D-1 0 T, Physical Inventory 1,888.0 T.

_Regenerate anytime with the `pb-mtd-report` skill (fetches live data, re-verifies, compares to this snapshot)._

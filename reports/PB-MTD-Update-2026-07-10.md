# JSW Pipes & Tubes — PB MTD Update (2026-07-10)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-07-10
Revised Best Estimate --->	2500T
Total Orders --->	300.7T
Current Month Orders --->	226.0T
Invoiced Orders MTD --->	249.4T
Invoiced MTD (Previous Month) --->	1014.0T
Dispatch D-1 (Current Month) --->	35.9T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	26.0T
Non-Confirmed Orders --->	25.3T
Daily Run Rate Required --->	102.3T
Physical Inventory --->	1776T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	51.0T
```

Notes:
- **Revised Best Estimate** — manually supplied (2500 T for July), not in Supabase.
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed (app Sales KPI).
- **Daily Run Rate Required** = (Best Estimate − Invoiced MTD) ÷ calendar days remaining
  in July = (2500 − 249.4) ÷ 22 (Jul 10–31 inclusive) = **102.3 T/day**. Uses *calendar*
  days, not working days — the system has no holiday/Sunday calendar to exclude non-working
  days, so this will run slightly low if Sundays/holidays are excluded in the plant's own convention.
- **Physical Inventory** = finished pipe stock, produced − invoiced, netted per SKU.
- **Dispatch D Day / Orders Logged D Day / D-1** read 0 because the latest data loaded
  is order_date 2026-07-08 and dispatch date 2026-07-09 — not necessarily zero activity.

## Excluded from this report (not relevant / not possible)

| Line | Why excluded |
|---|---|
| Retail / Distributor Through Project / Project Orders (all instances) | 🚫 Not relevant — P&T has no order-category dimension |
| Carry-forward Orders | ⚠️ Not possible — not tracked (prior-month open-book proxy = 0 T) |
| SFDC Orders | ⚠️ Not possible — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC with no separable subset |
| Invoiced MTD-FE 550 / FE 550D - LRF | 🚫 Not relevant — FE 550/550D are TMT rebar grades; P&T runs IS 10748 HR coil |
| FE 550 / FE 550D (under Physical Inventory) | 🚫 Not relevant — finished pipe carries no grade dimension |

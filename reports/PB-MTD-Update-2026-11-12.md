# JSW Pipes & Tubes — PB MTD Update (2026-11-12)

Live Supabase data (`hztblmccvvarmgxmunrp`) after the **07:03 UTC upload** of 12-Nov. Targets: **Best
Estimate 4000 T** (November) and **Production 5000 T**.

> ⚠️ **Invoices: one new day only.** 11-Nov adds 26.6 T; **7–10 Nov still has no invoices** in the
> system. **Production** now runs to 11-Nov; **6 and 9 Nov have no production for any plant** (8-Nov is
> a Sunday). Lepakshi's 5, 7 and 10 Nov (52.3 T) were added since yesterday.

```
PB MTD update as on --->	2026-11-12
Revised Best Estimate --->	4000.0T
Total Orders --->	1063.5T
Current Month Orders --->	559.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	323.3T
Invoiced MTD (Previous Month) --->	1037.3T
Dispatch D-1 (Current Month) --->	26.6T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	84.9T
Non-Confirmed Orders --->	655.4T
Daily Run Rate Required --->	193.5T
Physical Inventory --->	2586T
RM Full Coil Left --->	531.1T
RM Baby Coil Left --->	998.8T
RM Total --->	1529.9T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	244.8T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	78.4T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	323.3T
	
Pending to Serve - South --->	409.9T
Pending to Serve - West --->	330.3T
Pending to Serve - All Regions --->	740.3T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	123.9T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	94.2T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	105.1T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	323.3T
(Invoiced MTD is limited to Hyderabad, Lepakshi, Tapi — NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	73.8T
Pending to Serve by Plant - NPMD --->	230.0T
Pending to Serve by Plant - Lepakshi --->	322.4T
Pending to Serve by Plant - Tapi --->	114.0T
Pending to Serve by Plant - All Plants --->	740.3T
	
Produced MTD --->	436.4T
Produced MTD (Previous Month) --->	1674.8T
Production D-1 --->	58.0T
Production D Day --->	0T
	
Orders Logged D Day --->	20.0T
Orders Logged D-1 --->	167.0T
Orders Logged D-2 --->	28.0T
```

Notes:
- **Run rates** use 19 days left (30 − 12 + 1). Invoicing (4000 − 323.3) ÷ 19 = 193.5 T/day;
  production (5000 − 436.4) ÷ 19 = 240.2 T/day. Both are overstated by the days not yet loaded.
- **Previous month same days** = 1–12 Oct: invoiced 1037.3 T, produced 1674.8 T.
- **Confirmed 84.9 T is the netted figure** (ADR-0014). The stored ERP bucket reads 111.5 T. The
  26.6 T gap is exactly the 11-Nov invoice, which the ERP's Invoiced Qty has not picked up yet
  (111.485 − 26.590 = 84.895).
- **Current Month Orders fell 575.0 → 559.0 T.** Today's upload replaced the whole order book at
  07:03. It adds 20 T dated 12-Nov, but **5-Nov dropped from 159 T to 123 T (−36 T)**. Every other
  day is unchanged. Which lines left can't be named: yesterday's rows were not kept.
- **Production D-1 (11-Nov)** = Hyderabad 11.0 + NPMD 6.9 + Tapi 40.1 = 58.0 T. This is **NPMD's first
  November production**.
- **Regional BE** still not shown: November's only distributor estimate is SST STEEL = 0 T.
- **Unmapped** empty · **Unattributed** 0 · stored − live production weight 2.5 T (hygiene, small).

## How the splits were run
Direct Supabase access is still blocked here (agent proxy 403 on `*.supabase.co`). Raw rows were
pulled through the Supabase MCP (non-deleted, ordered `created_at, id`, orders with all columns) and fed
to `scripts/daily-splits.mjs --in`. Row counts matched the database: 2226 orders, 466 dispatches, 1776
productions, 343 SKUs, 679 coils, 4216 baby coils, 19 distributors, 1 state-region row, 0 plant rows.
Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 323.265 | 323.265 | PASS |
| 1 | Invoiced prev month, 1–12 Oct | 1037.345 | 1037.345 | PASS |
| 2 | Σ daily dispatch (28.7+81.0+112.0+75.0+26.6) = Invoiced MTD | 323.3 | 323.265 | PASS |
| 2 | Σ daily orders = Current Month Orders | 559.0 | 559.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 323.265 + 84.895 + 655.355 | 1063.515 | PASS |
| 4 | Freshness | orders 12-Nov, invoices 11-Nov | production 11-Nov (6, 9 Nov empty) | **gaps named** |
| 5 | Σ region invoiced = Invoiced MTD | 323.265 (JS) | 323.265 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 740.250 (JS) | 84.895 (stored 111.485 − 26.590) + 655.355 | PASS |
| 7–8 | Σ plant invoiced / pending | 323.265 / 740.250 | 323.265 / 740.250 | PASS |
| — | Servable split ties to book | conf 84.895 / unconf 655.355 | book 84.895 / 655.355 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2586.094 (JS) | 2586.094 (SQL) | PASS |
| — | Produced MTD / prev / D-1 | 436.385 / 1674.787 / 57.980 (JS) | 436.385 / 1674.787 / 57.980 (SQL) | PASS |
| — | Full Coil Left | 531.093 (JS) | 531.093 (SQL) | PASS |
| — | Confirmed variance (advisory) | stored 111.485 | release − invoiced 107.505 | reported |

## Change vs last report (11-Nov, 12:36 upload)
| Line | 11-Nov | 12-Nov | Δ |
|---|---|---|---|
| Invoiced MTD | 296.7 | 323.3 | +26.6 (11-Nov invoice) |
| Produced MTD | 326.1 | 436.4 | +110.3 (Lepakshi 5, 7 & 10 Nov 52.3; 11-Nov 58.0) |
| Current Month Orders | 575.0 | 559.0 | −16.0 (+20 on 12-Nov, −36 on 5-Nov) |
| Total Orders | 1043.5 | 1063.5 | +20.0 |
| Confirmed (netted) | 111.5 | 84.9 | −26.6 (invoiced) |
| Non-Confirmed | 635.4 | 655.4 | +20.0 |
| Servable – Unconfirmed | 190.0 | 211.5 | +21.5 |
| Pending to Dispatch | 301.5 | 296.4 | −5.1 |
| Physical Inventory | 2497.0 | 2586.1 | +89.1 (Nov production +110.3, an **August** Hyderabad production back-entered today +5.8, invoiced −26.6, ≈0.4 other) |
| RM Total | 1646.6 | 1529.9 | −116.7 |

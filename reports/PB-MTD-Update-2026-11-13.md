# JSW Pipes & Tubes — PB MTD Update (2026-11-13)

Live Supabase data (`hztblmccvvarmgxmunrp`) after the **06:21 UTC upload** of 13-Nov. Targets: **Best
Estimate 4000 T** (November) and **Production 5000 T**. First run on the fixed `daily-splits.mjs`
(PB-TMT-ai/jsw-pipes-inventory#327): per-plant FG is the Dashboard's FG stock.

> ⚠️ **Gaps still open:** no invoices dated **7–10 Nov**; no production dated **9 Nov** (8-Nov is a
> Sunday). Today's order file carries nothing dated 13-Nov yet.

```
PB MTD update as on --->	2026-11-13
Revised Best Estimate --->	4000.0T
Total Orders --->	1083.7T
Current Month Orders --->	595.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	432.9T
Invoiced MTD (Previous Month) --->	1217.9T
Dispatch D-1 (Current Month) --->	70.7T
Dispatch D Day --->	38.9T
Confirmed Orders Pending to be Invoiced --->	10.5T
Non-Confirmed Orders --->	640.4T
Daily Run Rate Required --->	198.2T
Physical Inventory --->	2516T
RM Full Coil Left --->	531.1T
RM Slit Coil Left --->	463.8T
RM Total --->	994.9T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	354.5T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	78.4T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	432.9T
	
Pending to Serve - South --->	320.5T
Pending to Serve - West --->	330.3T
Pending to Serve - All Regions --->	650.8T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	183.9T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	94.2T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	154.8T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	432.9T
(Invoiced MTD is limited to Hyderabad, Lepakshi, Tapi — NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	45.8T
Pending to Serve by Plant - NPMD --->	230.0T
Pending to Serve by Plant - Lepakshi --->	307.4T
Pending to Serve by Plant - Tapi --->	67.6T
Pending to Serve by Plant - All Plants --->	650.8T
	
Produced MTD --->	476.3T
Produced MTD (Previous Month) --->	1758.7T
Production D-1 --->	31.5T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	20.0T
Orders Logged D-2 --->	167.0T
```

Notes:
- **Run rates** use 18 days left (30 − 13 + 1). Invoicing (4000 − 432.9) ÷ 18 = 198.2 T/day; production
  (5000 − 476.3) ÷ 18 = 251.3 T/day.
- **Confirmed 10.5 T is the netted figure** (ADR-0014). The ERP's stored bucket still reads 111.5 T
  (release − invoiced 107.5 T): the 11–13 Nov invoices against confirmed lines have not reached the
  ERP's Invoiced Qty yet.
- **5-Nov orders are back to 159 T.** Yesterday's file had dropped them to 123 T; today's restores the
  36 T, so Current Month Orders is 595.0 T (559.0 yesterday + 36).
- **Production changes since yesterday:** Hyderabad 12-Nov 31.5 T (two runs). Lepakshi corrected by the
  operator: a 5-Nov run (6.0 T) deleted and re-entered dated 6-Nov, 4-Nov trimmed 20.9 → 18.4 T, and
  10-Nov raised 20.0 → 30.9 T. Net Lepakshi +8.4 T.
- **Physical Inventory 2516 T is the company-wide FG Left card** (produced − invoiced). The WhatsApp
  Inventory block prints each plant's **FG stock** (Hyderabad 634.8, NPMD 733.4, Lepakshi 375.1, Tapi
  900.1 = 2643.4 T). The 127.0 T between them is Dispatched w/o production. The script now emits both,
  and both match the live Dashboard's own `inventoryOverview` on these rows.
- **Regional BE** still not shown: November's only distributor estimate is SST STEEL = 0 T.
- **Unmapped** empty · **Unattributed** 0.

## How the splits were run
Direct Supabase access is still blocked here (proxy 403). Rows were pulled through the Supabase MCP
(non-deleted, ordered `created_at, id`) and fed to `scripts/daily-splits.mjs --in`. Counts match the
database: 2226 orders, 471 dispatches, 1779 productions, 343 SKUs, 679 coils, 4216 slit coils,
19 distributors, 1 state-region row, 0 plant rows. Exit 0: every tie-out passed, including the new
FG stock bridge.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 432.910 | 432.910 | PASS |
| 1 | Invoiced prev month, 1–13 Oct | 1217.910 | 1217.910 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 28.7+81.0+112.0+75.0+26.6+70.7+38.9 | 432.910 | PASS |
| 2 | Σ daily orders = Current Month Orders | 595.0 | 595.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 432.910 + 10.461 + 640.355 | 1083.726 | PASS |
| 4 | Freshness | orders to 12-Nov, invoices to 13-Nov | production to 12-Nov (9-Nov empty) | gaps named |
| 5 | Σ region invoiced = Invoiced MTD | 432.910 (JS) | 432.910 (SQL) | PASS |
| 6 | Σ region pending = Conf (netted) + Non-conf | 650.816 (JS) | 10.461 + 640.355 | PASS |
| 7–8 | Σ plant invoiced / pending | 432.910 / 650.816 | 432.910 / 650.816 | PASS |
| — | FG Left = produced (live) − invoiced | 2516.391 (JS) | 2516.391 (SQL) | PASS |
| — | FG stock per plant = Dashboard | 634.8 / 733.4 / 375.1 / 900.1 (daily-splits) | same (`inventoryOverview`, `main` code) | PASS |
| — | RM per plant = Dashboard Total coil | 233.2 / 396.6 / 178.9 / 186.3 (daily-splits) | same (`inventoryOverview`, `main` code) | PASS |
| — | Produced MTD / prev / D-1 | 476.327 / 1758.709 / 31.515 (JS) | same (SQL) | PASS |
| — | Full Coil Left | 531.093 (JS) | 531.093 (SQL) | PASS |
| — | Confirmed variance (advisory) | stored 111.485 | release − invoiced 107.505 | reported |

## Change vs last report (12-Nov)
| Line | 12-Nov | 13-Nov | Δ |
|---|---|---|---|
| Invoiced MTD | 323.3 | 432.9 | +109.6 (12-Nov 70.7, 13-Nov 38.9) |
| Produced MTD | 436.4 | 476.3 | +39.9 (Hyderabad 12-Nov 31.5, Lepakshi corrections +8.4) |
| Current Month Orders | 559.0 | 595.0 | +36.0 (5-Nov restored) |
| Total Orders | 1063.5 | 1083.7 | +20.2 |
| Confirmed (netted) | 84.9 | 10.5 | −74.4 (invoiced) |
| Non-Confirmed | 655.4 | 640.4 | −15.0 |
| Servable – Unconfirmed | 211.5 | 215.1 | +3.6 |
| Pending to Dispatch | 296.4 | 225.6 | −70.8 |
| FG stock (WhatsApp) | 2712.9 | 2643.4 | −69.5 |
| Physical Inventory (FG Left) | 2586.1 | 2516.4 | −69.7 (produced +39.9, invoiced −109.6) |
| RM Total | 1039.1 | 994.9 | −44.2 (slit coils used by 12-Nov production) |

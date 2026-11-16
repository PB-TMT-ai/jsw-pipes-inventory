# JSW Pipes & Tubes — PB MTD Update (2026-11-16)

Live Supabase data (`hztblmccvvarmgxmunrp`) after the **06:56 UTC upload** of 16-Nov. Targets: **Best
Estimate 4000 T** (November) and **Production 5000 T**. Branch merged with `origin/staging` before the
run (1318 tests pass). First report on the ADR-0017 names: **Total Orders**, **Confirmed**,
**Dispatchable from Inventory**, **Current inventory**; *Pending to Dispatch* is now the whole open book.

> ⚠️ **Gaps:** no invoices dated **7–10 Nov**; no production dated **9 Nov** (8 and 15 Nov are Sundays).
> Today's order file carries nothing dated 16-Nov yet.

```
PB MTD update as on --->	2026-11-16
Revised Best Estimate --->	4000.0T
Total Orders --->	1383.5T
Current Month Orders --->	905.0T
Invoiced MTD --->	569.2T
Invoiced MTD (Previous Month) --->	1507.7T
Dispatch D-1 (Current Month) --->	53.6T
Dispatch D Day --->	0T
Confirmed --->	60.2T
Non-confirmed --->	754.1T
Daily Run Rate Required --->	228.7T
Current inventory --->	2487T
RM HR coil (unslit) --->	810.8T
RM Slit Coil Left --->	449.5T
RM Total --->	1260.3T
	
Invoiced MTD - South --->	415.7T
Invoiced MTD - West --->	153.5T
Invoiced MTD - All Regions --->	569.2T
	
Pending to Dispatch - South --->	326.2T
Pending to Dispatch - West --->	488.1T
Pending to Dispatch - All Regions --->	814.2T
	
Invoiced MTD by Plant - Hyderabad --->	225.2T
Invoiced MTD by Plant - NPMD --->	24.5T
Invoiced MTD by Plant - Lepakshi --->	164.8T
Invoiced MTD by Plant - Tapi --->	154.8T
Invoiced MTD by Plant - All Plants --->	569.2T
	
Pending to Dispatch by Plant - Hyderabad --->	95.8T
Pending to Dispatch by Plant - NPMD --->	286.7T
Pending to Dispatch by Plant - Lepakshi --->	317.7T
Pending to Dispatch by Plant - Tapi --->	114.0T
Pending to Dispatch by Plant - All Plants --->	814.2T
	
Produced MTD --->	583.2T
Produced MTD (Previous Month) --->	2064.8T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	25.0T
Orders Logged D-2 --->	216.0T
```

Notes:
- **NPMD has invoiced for the first time this month:** 24.45 T to KISAN KIRAN on 15-Nov. Every plant with orders has now invoiced, so the "· Hyderabad, Lepakshi, Tapi" suffix drops off every Invoiced line. The script derives it, so nothing was hard-coded.
- **Run rates** use 15 days left (30 − 16 + 1):
  - Invoicing: (4000 − 569.2) ÷ 15 = 228.7 T/day.
  - Production: (5000 − 583.2) ÷ 15 = 294.5 T/day.
- **15-Nov invoices, 53.6 T:** PROVACK 29.1 T (Maharashtra, West, from Lepakshi, a South plant; it crossed regions again) and KISAN KIRAN 24.5 T from NPMD.
- **Confirmed 60.2 T is the netted figure** (ADR-0014). The ERP bucket still reads 111.4 T, because the 15-Nov invoices against confirmed lines haven't reached its Invoiced Qty yet.
- **23 HR coils received this morning:** Hyderabad 419.7 T and Lepakshi 31.4 T. Hyderabad's RM goes from 158.5 to 565.4 T. Tapi slit 25.9 T of HR coil.
- **Production since yesterday:**
  - Tapi 14-Nov: 20.5 T.
  - Hyderabad 14-Nov: 11.1 T over three runs.
  - Lepakshi 13-Nov: 27.6 T, back-entered.
- **Orders:** 5-Nov flipped back to 159 T. It has alternated between 123 and 159 T across the last four uploads.
- **Current inventory 2487 T** is the company-wide netted figure. The WhatsApp block prints each plant's Current inventory summed per size, **2626.9 T**. The 140.0 T difference is Dispatched w/o production.
- **Regional BE** is still not shown (only SST STEEL = 0). **Unmapped:** empty. **Unattributed:** 0.

## How the splits were run
Supabase MCP dump → `scripts/daily-splits.mjs --in`; counts re-checked after the dump: 2300 orders,
478 dispatches, 1789 productions, 343 SKUs, 698 coils, 4236 slit coils, 19 distributors, 2 state-region
rows, 0 plant rows. Exit 0, every tie-out passed including the FG stock bridge.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 569.230 | 569.230 | PASS |
| 1 | Invoiced prev month, 1–16 Oct | 1507.685 | 1507.685 | PASS |
| 2 | Σ daily orders = Current Month Orders | 145+51+159+25+28+155+36+65+216+25 | 905.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 569.230 + 60.171 + 754.065 | 1383.466 | PASS |
| 4 | Freshness | orders to 15-Nov, invoices to 15-Nov | production to 14-Nov | gaps named |
| 5 | Σ region invoiced = Invoiced MTD | 569.230 (JS) | 569.230 (SQL) | PASS |
| 6 | Σ region Pending to Dispatch = Conf + Non-conf | 814.236 (JS) | 60.171 + 754.065 | PASS |
| 7–8 | Σ plant invoiced / pending | 569.230 / 814.236 | 569.230 / 814.236 | PASS |
| — | Current inventory = produced (live) − invoiced | 2486.905 (JS) | 2486.905 (SQL) | PASS |
| — | FG per plant = Dashboard | 609.3 / 734.4 / 362.6 / 920.6 | same (`inventoryOverview`, `main` ec351f4) | PASS |
| — | RM per plant = Dashboard Total coil | 565.4 / 369.7 / 159.3 / 165.9 | same (`inventoryOverview`, `main` ec351f4) | PASS |
| — | Produced MTD / prev | 583.160 / 2064.836 (JS) | same (SQL) | PASS |
| — | HR coil (unslit) | 810.800 (JS) | 810.800 (SQL) | PASS |
| — | Confirmed variance (advisory) | stored 111.445 | release − invoiced 105.785 | reported |

## Change vs last report (15-Nov)
| Line | 15-Nov | 16-Nov | Δ |
|---|---|---|---|
| Invoiced MTD | 515.6 | 569.2 | +53.6 (15-Nov invoices) |
| Produced MTD | 524.0 | 583.2 | +59.2 (Lepakshi 13-Nov 27.6, Tapi 20.5 + Hyderabad 11.1 on 14-Nov) |
| Current Month Orders | 869.0 | 905.0 | +36.0 (5-Nov back to 159) |
| Total Orders | 1376.2 | 1383.5 | +7.3 |
| Confirmed (netted) | 111.4 | 60.2 | −51.2 (invoiced) |
| Non-confirmed | 749.1 | 754.1 | +5.0 |
| Servable – Unconfirmed | 275.0 | 299.5 | +24.5 |
| Dispatchable from Inventory | 386.4 | 359.7 | −26.7 |
| FG per plant (WhatsApp) | 2619.9 | 2626.9 | +7.0 |
| Current inventory (netted) | 2481.3 | 2486.9 | +5.6 (produced +59.2, invoiced −53.6) |
| RM Total | 873.1 | 1260.3 | +387.2 (451.1 T coil inward, less slit coils used) |

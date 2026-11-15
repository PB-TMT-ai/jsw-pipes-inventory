# JSW Pipes & Tubes — PB MTD Update (2026-11-15)

Live Supabase data (`hztblmccvvarmgxmunrp`) after the **06:55 UTC upload** of 15-Nov (a Sunday).
Targets: **Best Estimate 4000 T** (November) and **Production 5000 T**. Branch merged with
`origin/staging` before the run (1306 tests pass). FG and RM per plant match the live site's Dashboard
code (`main` ec351f4) exactly.

> ⚠️ **Gaps:** no invoices dated **7–10 Nov**. **No production entered since 14-Nov 04:01 UTC** —
> nothing dated 14-Nov, and 9-Nov still empty.

```
PB MTD update as on --->	2026-11-15
Revised Best Estimate --->	4000.0T
Total Orders --->	1376.2T
Current Month Orders --->	869.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	515.6T
Invoiced MTD (Previous Month) --->	1447.4T
Dispatch D-1 (Current Month) --->	82.7T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	111.4T
Non-Confirmed Orders --->	749.1T
Daily Run Rate Required --->	217.8T
Physical Inventory --->	2481T
RM Full Coil Left --->	385.6T
RM Slit Coil Left --->	487.5T
RM Total --->	873.1T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	415.7T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	100.0T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	515.6T
	
Pending to Serve - South --->	326.2T
Pending to Serve - West --->	534.3T
Pending to Serve - All Regions --->	860.5T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	225.2T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	135.7T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	154.8T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	515.6T
(Invoiced MTD is limited to Hyderabad, Lepakshi, Tapi — NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	95.8T
Pending to Serve by Plant - NPMD --->	305.0T
Pending to Serve by Plant - Lepakshi --->	345.7T
Pending to Serve by Plant - Tapi --->	114.0T
Pending to Serve by Plant - All Plants --->	860.5T
	
Produced MTD --->	524.0T
Produced MTD (Previous Month) --->	1952.9T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	25.0T
Orders Logged D-1 --->	216.0T
Orders Logged D-2 --->	65.0T
```

Notes:
- **Run rates** use 16 days left (30 − 15 + 1). Invoicing (4000 − 515.6) ÷ 16 = 217.8 T/day; production
  (5000 − 524.0) ÷ 16 = 279.8 T/day.
- **14-Nov invoices (82.7 T):** Hyderabad 41.3 T (SRI SHAKTHI 25.3, VVN 16.0), Lepakshi 41.4 T
  (PROVACK 21.5, SST 19.9).
- **PROVACK (Maharashtra, West) was invoiced 21.5 T from Lepakshi, a South plant.** That is why West's
  Invoiced rose 21.5 T with no West plant invoicing. It is a cross-region shipment, not an error in the
  split. Same pattern as VIKAS PIPES (Karnataka, South) from Tapi on 13-Nov.
- **SRI SHAKTHI STEEL & PIPE** is a new invoiced distributor; its invoice lines carry no ship-to state
  and resolve through the order link.
- **Confirmed 111.4 T** — netted equals the ERP bucket again (release − invoiced 105.8 T).
- **Orders:** 14-Nov 216 T (was 100 T in yesterday's file), 13-Nov 81 → 65 T, 15-Nov 25 T new.
  Current Month +125 T.
- **No production since yesterday** — every plant shows 0 for 14-Nov. Either the plants did not run or
  the entries are not in yet.
- **Physical Inventory 2481 T** is the company-wide FG Left; the WhatsApp block prints per-plant FG stock,
  **2619.9 T**. The 138.6 T between them is Dispatched w/o production (up from 127.0 T: 14-Nov invoices
  went against sizes with no recorded production at that plant).
- **Regional BE** still not shown (only SST STEEL = 0). **Unmapped** empty · **Unattributed** 0.

## How the splits were run
Supabase MCP dump fed to `scripts/daily-splits.mjs --in`; counts re-checked after the dump: 2261
orders, 475 dispatches, 1783 productions, 343 SKUs, 675 coils, 4233 slit coils, 19 distributors,
2 state-region rows, 0 plant rows. Exit 0, every tie-out passed including the FG stock bridge.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 515.640 | 515.640 | PASS |
| 1 | Invoiced prev month, 1–15 Oct | 1447.355 | 1447.355 | PASS |
| 2 | Σ daily orders = Current Month Orders | 145+51+123+25+28+155+36+65+216+25 | 869.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 515.640 + 111.445 + 749.065 | 1376.150 | PASS |
| 4 | Freshness | orders to 15-Nov, invoices to 14-Nov | production to 13-Nov | gaps named |
| 5 | Σ region invoiced = Invoiced MTD | 515.640 (JS) | 515.640 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 860.510 (JS) | 111.445 + 749.065 | PASS |
| 7–8 | Σ plant invoiced / pending | 515.640 / 860.510 | 515.640 / 860.510 | PASS |
| — | FG Left = produced (live) − invoiced | 2481.311 (JS) | 2481.311 (SQL) | PASS |
| — | FG stock per plant = Dashboard | 598.2 / 758.9 / 362.7 / 900.1 | same (`inventoryOverview`, `main` code) | PASS |
| — | RM per plant = Dashboard Total coil | 158.5 / 369.7 / 158.6 / 186.3 | same (`inventoryOverview`, `main` code) | PASS |
| — | Produced MTD / prev | 523.977 / 1952.855 (JS) | same (SQL) | PASS |
| — | Full Coil Left | 385.648 (JS) | 385.648 (SQL) | PASS |

## Change vs last report (14-Nov)
| Line | 14-Nov | 15-Nov | Δ |
|---|---|---|---|
| Invoiced MTD | 432.9 | 515.6 | +82.7 (14-Nov invoices) |
| Produced MTD | 524.0 | 524.0 | 0 (nothing entered) |
| Current Month Orders | 744.0 | 869.0 | +125.0 |
| Total Orders | 1264.2 | 1376.2 | +112.0 |
| Confirmed (netted) | 91.2 | 111.4 | +20.2 |
| Non-Confirmed | 740.1 | 749.1 | +9.0 |
| Servable – Unconfirmed | 280.7 | 275.0 | −5.7 |
| Pending to Dispatch | 371.9 | 386.4 | +14.5 |
| FG stock (WhatsApp) | 2691.1 | 2619.9 | −71.2 |
| Physical Inventory (FG Left) | 2564.0 | 2481.3 | −82.7 (invoiced) |
| RM Total | 873.1 | 873.1 | 0 |

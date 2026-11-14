# JSW Pipes & Tubes — PB MTD Update (2026-11-14)

Live Supabase data (`hztblmccvvarmgxmunrp`) after the **07:34 UTC upload** of 14-Nov. Targets: **Best
Estimate 4000 T** (November) and **Production 5000 T**. Branch merged with `origin/staging` before the
run (1172 tests pass).

> ⚠️ **No new invoices.** The 07:34 invoice upload re-wrote the window but added nothing: invoices still
> end at 13-Nov, and **7–10 Nov** is still empty. Production runs to 13-Nov; **9 Nov** is still empty.

```
PB MTD update as on --->	2026-11-14
Revised Best Estimate --->	4000.0T
Total Orders --->	1264.2T
Current Month Orders --->	744.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	432.9T
Invoiced MTD (Previous Month) --->	1312.9T
Dispatch D-1 (Current Month) --->	38.9T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	91.2T
Non-Confirmed Orders --->	740.1T
Daily Run Rate Required --->	209.8T
Physical Inventory --->	2564T
RM Full Coil Left --->	385.6T
RM Slit Coil Left --->	487.5T
RM Total --->	873.1T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	354.5T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	78.4T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	432.9T
	
Pending to Serve - South --->	400.9T
Pending to Serve - West --->	430.3T
Pending to Serve - All Regions --->	831.3T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	183.9T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	94.2T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	154.8T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	432.9T
(Invoiced MTD is limited to Hyderabad, Lepakshi, Tapi — NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	85.8T
Pending to Serve by Plant - NPMD --->	255.0T
Pending to Serve by Plant - Lepakshi --->	426.4T
Pending to Serve by Plant - Tapi --->	64.0T
Pending to Serve by Plant - All Plants --->	831.3T
	
Produced MTD --->	524.0T
Produced MTD (Previous Month) --->	1877.9T
Production D-1 --->	25.4T
Production D Day --->	0T
	
Orders Logged D Day --->	100.0T
Orders Logged D-1 --->	81.0T
Orders Logged D-2 --->	36.0T
```

Notes:
- **Run rates** use 17 days left (30 − 14 + 1): invoicing (4000 − 432.9) ÷ 17 = 209.8 T/day,
  production (5000 − 524.0) ÷ 17 = 263.3 T/day.
- **Four Hyderabad HR coils were removed from the register**, not soft-deleted:
  - The coils are HYD-0526-72 (18.88 T), HYD-0826-271 (18.70 T), HYD-0826-279 (18.645 T) and HYD-0826-280 (18.47 T), **74.7 T** in all. None had been slit.
  - The table went from 679 rows to 675, and no row carries `deleted`.
  - Hyderabad's remaining whole coils (43.1 T) were slit this morning, so Hyderabad now has **no whole HR coil**. Its RM is 158.5 T, all slit coil.
  - Worth confirming with the plant. If the coils are still physically there, Hyderabad RM is understated by 74.7 T.
- **Order book reshuffled again.** The 07:34 file has:
  - 13-Nov 81 T and 14-Nov 100 T, both new.
  - 5-Nov back to 123 T: it was 159 T yesterday and 123 T the day before.
  - 11-Nov 167 → 155 T and 12-Nov 20 → 36 T.
  - Net Current Month +149 T.
- **Confirmed 91.2 T**: the netted figure now equals the ERP bucket. The ERP's Invoiced Qty has caught up with the 11–13 Nov invoices.
- **Production since yesterday:** NPMD 13-Nov 25.4 T, and Lepakshi 12-Nov back-entered (23.1 T over three runs).
- **GOA is now mapped to West** in `state_regions`. This closes the gap flagged yesterday, where HISSARIA STEEL was West only by distributor override.
- **Physical Inventory 2564 T** is the company-wide FG Left. The WhatsApp block prints per-plant FG stock, **2691.1 T**; the 127.0 T between them is Dispatched w/o production.
- **Regional BE** still not shown: November's only distributor estimate is SST STEEL = 0 T.
- **Unmapped** empty · **Unattributed** 0.

## How the splits were run
Supabase MCP dump (proxy still blocks direct access) fed to `scripts/daily-splits.mjs --in`. Counts
match the database, re-counted after the dump to confirm the upload had finished: 2261 orders, 471
dispatches, 1783 productions, 343 SKUs, 675 coils, 4233 slit coils, 19 distributors, 2 state-region
rows, 0 plant rows. Exit 0, every tie-out passed including the FG stock bridge.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 432.910 | 432.910 | PASS |
| 1 | Invoiced prev month, 1–14 Oct | 1312.905 | 1312.905 | PASS |
| 2 | Σ daily orders = Current Month Orders | 145+51+123+25+28+155+36+81+100 | 744.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 432.910 + 91.185 + 740.065 | 1264.160 | PASS |
| 4 | Freshness | orders to 14-Nov, invoices to 13-Nov | production to 13-Nov (9-Nov empty) | gaps named |
| 5 | Σ region invoiced = Invoiced MTD | 432.910 (JS) | 432.910 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 831.250 (JS) | 91.185 + 740.065 | PASS |
| 7–8 | Σ plant invoiced / pending | 432.910 / 831.250 | 432.910 / 831.250 | PASS |
| — | FG Left = produced (live) − invoiced | 2564.041 (JS) | 2564.041 (SQL) | PASS |
| — | FG stock per plant = Dashboard | 634.8 / 758.9 / 397.3 / 900.1 (daily-splits) | same (`inventoryOverview`, `main` code) | PASS |
| — | RM per plant = Dashboard Total coil | 158.5 / 369.7 / 158.6 / 186.3 (daily-splits) | same (`inventoryOverview`, `main` code) | PASS |
| — | Produced MTD / prev / D-1 | 523.977 / 1877.949 / 25.431 (JS) | same (SQL) | PASS |
| — | Full Coil Left | 385.648 (JS) | 385.648 (SQL) | PASS |
| — | Confirmed variance (advisory) | stored 91.185 | release − invoiced 87.205 | reported |

## Change vs last report (13-Nov)
| Line | 13-Nov | 14-Nov | Δ |
|---|---|---|---|
| Invoiced MTD | 432.9 | 432.9 | 0 (no new invoices) |
| Produced MTD | 476.3 | 524.0 | +47.7 (NPMD 13-Nov 25.4, Lepakshi 12-Nov 23.1, rounding) |
| Current Month Orders | 595.0 | 744.0 | +149.0 |
| Total Orders | 1083.7 | 1264.2 | +180.5 |
| Confirmed (netted) | 10.5 | 91.2 | +80.7 (ERP caught up; new confirmations) |
| Non-Confirmed | 640.4 | 740.1 | +99.7 |
| Servable – Unconfirmed | 215.1 | 280.7 | +65.6 |
| Pending to Dispatch | 225.6 | 371.9 | +146.3 |
| FG stock (WhatsApp) | 2643.4 | 2691.1 | +47.7 |
| RM Total | 994.9 | 873.1 | −121.8 (74.7 coils removed, 47.1 used by production) |

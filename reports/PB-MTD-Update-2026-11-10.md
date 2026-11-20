# JSW Pipes & Tubes — PB MTD Update (2026-11-10)

Live Supabase data (`hztblmccvvarmgxmunrp`) as of 05:36 UTC, 10-Nov. Targets: **Best Estimate 4000 T**
(November) and **Production 5000 T**.

> ⚠️ **No new data since 7-Nov.** The orders and dispatches tables were re-written at 05:35 UTC today,
> but the content is identical to the 7-Nov 07:28 upload — every total, row count and daily figure
> matches (invoices 10901.465 T, order qty 12364 T, confirmed 53.176, non-confirmed 1748.458, invoiced
> qty 10851.665; production 13344.391 T; coils 15018.478 T). Latest dates: **orders 7-Nov, invoices
> 6-Nov, production 5-Nov**; production has not been written to since 7-Nov 03:53 UTC. Every November
> flow therefore reads as on 7-Nov, and every "D-1 / D-2 / today" figure is **not loaded**, not zero.
> The one-day order-date shift reported on 7-Nov is still present (same file).

```
PB MTD update as on --->	2026-11-10
Revised Best Estimate --->	4000.0T
Total Orders --->	878.1T
Current Month Orders --->	408.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	296.7T
Invoiced MTD (Previous Month) --->	831.1T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	5.1T
Non-Confirmed Orders --->	576.4T
Daily Run Rate Required --->	176.3T
Physical Inventory --->	2441T
RM Full Coil Left --->	781.2T
RM Baby Coil Left --->	921.8T
RM Total --->	1703.1T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	218.3T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	78.4T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	296.7T
	
Pending to Serve - South --->	249.5T
Pending to Serve - West --->	331.9T
Pending to Serve - All Regions --->	581.4T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	123.9T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	67.7T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	105.1T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	296.7T
(NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	45.8T
Pending to Serve by Plant - NPMD --->	230.0T
Pending to Serve by Plant - Lepakshi --->	240.0T
Pending to Serve by Plant - Tapi --->	65.6T
Pending to Serve by Plant - All Plants --->	581.4T
	
Produced MTD --->	269.9T
Produced MTD (Previous Month) --->	1412.9T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	0T
```

Notes:
- **Run rates** use 21 days left (30 − 10 + 1). Invoicing (4000 − 296.7) ÷ 21 = 176.3 T/day;
  production (5000 − 269.9) ÷ 21 = 225.2 T/day. Both are overstated by however much of 6–10 Nov
  happened but is not yet loaded.
- **Previous month same days** = 1–10 Oct: invoiced 831.1 T, produced 1412.9 T. The comparison widens
  every day the November data stays frozen, so the gap in the message is not a like-for-like pace.
- **Confirmed** (netted, ADR-0014) 5.1 T vs stored ERP bucket 28.5 T; release − invoiced 24.5 T.
- **Regional BE** still not shown: November's only distributor estimate is SST STEEL = 0 T.
- Splits were run with `--date 2026-11-10` on the rows pulled 7-Nov 07:28, which match the database
  now total-for-total. Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 296.675 | 296.675 | PASS |
| 1 | Invoiced prev month, 1–10 Oct | 831.125 | 831.125 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 296.675 | 296.675 | PASS |
| 2 | Σ daily orders = Current Month Orders | 408.0 | 408.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 296.675 + 5.052 + 576.355 | 878.082 | PASS |
| 4 | Freshness | orders 7-Nov, invoices 6-Nov, production 5-Nov | report day 10-Nov | **3–5 days not loaded** |
| 5–8 | Region / plant partitions | 296.675 / 581.407 | 296.675 / 581.407 | PASS |
| — | Produced prev month (1–10 Oct) | 1412.918 (JS) | 1412.918 (SQL) | PASS |
| — | FG = produced (live) − invoiced | 2440.799 (JS) | 2440.799 (SQL) | PASS |
| — | Full Coil Left | 781.218 (JS) | 781.218 (SQL) | PASS |

## Change vs last report (7-Nov)
No figure changed except the date-driven ones: Prev Month same days (invoiced 467.9 → 831.1,
produced 983.9 → 1412.9) and the run rates (154.3 → 176.3, 197.1 → 225.2), because the window
moved from 7 to 10 days and the days left from 24 to 21.

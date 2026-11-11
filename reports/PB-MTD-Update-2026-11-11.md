# JSW Pipes & Tubes — PB MTD Update (2026-11-11)

Live Supabase data (`hztblmccvvarmgxmunrp`) after the **06:28 UTC upload** of 11-Nov. Targets: **Best
Estimate 4000 T** (November) and **Production 5000 T**.

> ⚠️ **Invoices are still only to 6-Nov and production only to 5-Nov.** Today's upload re-wrote the
> orders and dispatches tables, but added no invoice after 6-Nov (invoiced total unchanged at
> 10901.465 T) and production has not been written to since 7-Nov 03:53 UTC. Five days of invoicing
> (7–11 Nov) and six of production (6–11 Nov) are missing; every November flow is understated by
> whatever happened in them.

```
PB MTD update as on --->	2026-11-11
Revised Best Estimate --->	4000.0T
Total Orders --->	876.5T
Current Month Orders --->	408.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	296.7T
Invoiced MTD (Previous Month) --->	881.1T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	31.5T
Non-Confirmed Orders --->	548.4T
Daily Run Rate Required --->	185.2T
Physical Inventory --->	2441T
RM Full Coil Left --->	781.2T
RM Baby Coil Left --->	921.8T
RM Total --->	1703.1T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	218.3T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	78.4T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	296.7T
	
Pending to Serve - South --->	249.5T
Pending to Serve - West --->	330.3T
Pending to Serve - All Regions --->	579.8T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	123.9T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	67.7T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	105.1T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	296.7T
(NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	73.8T
Pending to Serve by Plant - NPMD --->	230.0T
Pending to Serve by Plant - Lepakshi --->	212.0T
Pending to Serve by Plant - Tapi --->	64.0T
Pending to Serve by Plant - All Plants --->	579.8T
	
Produced MTD --->	269.9T
Produced MTD (Previous Month) --->	1506.1T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	28.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Run rates** use 20 days left (30 − 11 + 1). Invoicing (4000 − 296.7) ÷ 20 = 185.2 T/day;
  production (5000 − 269.9) ÷ 20 = 236.5 T/day — both overstated by the unloaded days.
- **Previous month same days** = 1–11 Oct: invoiced 881.1 T, produced 1506.1 T. Not like-for-like
  while November's data stops at 5–6 Nov.
- **What did change in today's upload (orders only):**
  - 4 SHRI LAKSHMI STEEL lines (28 T) dated 7-Nov were replaced by 4 new lines dated **10-Nov** —
    hence Orders Logged D-1 = 28 T and 7-Nov now 0. Same tonnage, new line ids; November intake
    unchanged at 408 T.
  - 1 PROVACK line moved Confirmed → **Delivered** (ERP invoiced qty +24.6 T). No matching invoice
    is in the Zoho register yet, which is consistent with invoices after 6-Nov not being uploaded.
  - 6 dispatch entries were re-linked to different order lines (order id / line id / ship-to state
    changed, tonnage not). Confirmed (netted, ADR-0014) is **31.5 T**, equal to the stored ERP bucket;
    release − invoiced 27.5 T.
  - One new SKU in the master: RHS-122x61x6.00 (96.65 kg per tube).
- **The one-day order-date shift from 7-Nov is still present** (probe lines unchanged).
- **Regional BE** still not shown: November's only distributor estimate is SST STEEL = 0 T.
- Bundle: today's orders, SKUs, coils and dispatches pulled fresh; productions and baby coils reused
  from 7-Nov 07:28 (not written since). Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 296.675 | 296.675 | PASS |
| 1 | Invoiced prev month, 1–11 Oct | 881.115 | 881.115 | PASS |
| 2 | Σ daily orders = Current Month Orders | 408.0 | 408.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 296.675 + 31.485 + 548.355 | 876.515 | PASS |
| 4 | Freshness | orders 10-Nov, invoices 6-Nov, production 5-Nov | report day 11-Nov | **not loaded** |
| 5–8 | Region / plant partitions | 296.675 / 579.840 | 296.675 / 579.840 | PASS |
| — | Servable split ties to book | conf 31.485 / unconf 548.355 | book 31.485 / 548.355 | PASS |
| — | Produced prev month (1–11 Oct) | 1506.130 (JS) | 1506.130 (SQL) | PASS |
| — | FG = produced (live) − invoiced | 2440.799 | unchanged since 7-Nov | PASS |

## Change vs last report (10-Nov)
| Line | 10-Nov | 11-Nov | Δ |
|---|---|---|---|
| Confirmed (netted) | 5.1 | 31.5 | +26.4 (dispatch re-linking changed the netting) |
| Non-Confirmed | 576.4 | 548.4 | −28.0 |
| Servable – Unconfirmed | 197.0 | 175.0 | −22.0 |
| Pending to Dispatch | 202.1 | 206.5 | +4.4 |
| Prev Month (same days) invoiced / produced | 831.1 / 1412.9 | 881.1 / 1506.1 | window 10 → 11 days |
| Run rates | 176.3 / 225.2 | 185.2 / 236.5 | 21 → 20 days left |
Everything else (Invoiced MTD, Produced MTD, Inventory, RM) unchanged.

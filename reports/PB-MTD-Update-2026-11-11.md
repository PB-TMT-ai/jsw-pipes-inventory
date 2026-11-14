# JSW Pipes & Tubes — PB MTD Update (2026-11-11)

Live Supabase data (`hztblmccvvarmgxmunrp`) after the **12:36 UTC upload** of 11-Nov. Targets: **Best
Estimate 4000 T** (November) and **Production 5000 T**.

> ⚠️ **Invoices are still only to 6-Nov.** The invoice total has not changed since 7-Nov
> (10901.465 T all-time); 7–11 Nov invoicing is not in the system. Production now runs to 10-Nov but
> **6–9 Nov is missing** (only Tapi's 10-Nov, 56.2 T, was added). Invoiced MTD and Produced MTD are
> both understated by whatever happened on those days.

```
PB MTD update as on --->	2026-11-11
Revised Best Estimate --->	4000.0T
Total Orders --->	1043.5T
Current Month Orders --->	575.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	296.7T
Invoiced MTD (Previous Month) --->	881.1T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	111.5T
Non-Confirmed Orders --->	635.4T
Daily Run Rate Required --->	185.2T
Physical Inventory --->	2497T
RM Full Coil Left --->	658.7T
RM Baby Coil Left --->	987.9T
RM Total --->	1646.6T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	218.3T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	78.4T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	296.7T
	
Pending to Serve - South --->	416.5T
Pending to Serve - West --->	330.3T
Pending to Serve - All Regions --->	746.8T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	123.9T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	67.7T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	105.1T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	296.7T
(NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	73.8T
Pending to Serve by Plant - NPMD --->	230.0T
Pending to Serve by Plant - Lepakshi --->	329.0T
Pending to Serve by Plant - Tapi --->	114.0T
Pending to Serve by Plant - All Plants --->	746.8T
	
Produced MTD --->	326.1T
Produced MTD (Previous Month) --->	1506.1T
Production D-1 --->	56.2T
Production D Day --->	0T
	
Orders Logged D Day --->	167.0T
Orders Logged D-1 --->	28.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Run rates** use 20 days left (30 − 11 + 1). Invoicing (4000 − 296.7) ÷ 20 = 185.2 T/day;
  production (5000 − 326.1) ÷ 20 = 233.7 T/day — both overstated by the unloaded days.
- **Previous month same days** = 1–11 Oct: invoiced 881.1 T, produced 1506.1 T. Not like-for-like
  while November's invoicing stops at 6-Nov and production skips 6–9 Nov.
- **Order-date shift resolved.** Against the 6-Nov book (before the shift) **no order line now carries
  a different date** — the 709 lines moved back a day on 7-Nov are back on their original dates
  (4-Nov 51 T, 5-Nov 159 T as before). Whatever caused it on 7-Nov did not recur in this file.
- **New in this upload:** 33 order lines (167 T dated 11-Nov), Tapi production 10-Nov 56.2 T, 16 baby
  coils slit (Full Coil Left 781.2 → 658.7 T).
- **Production D-1 (10-Nov)** = Tapi 56.2 T only. NPMD still has no November production.
- **Confirmed** (netted, ADR-0014) 111.5 T equals the stored ERP bucket; release − invoiced 107.5 T.
- **Regional BE** still not shown: November's only distributor estimate is SST STEEL = 0 T.
- **Unmapped** empty · **Unattributed** 0.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled fresh through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script with
`--in`. Row counts matched the database: 2223 orders, 465 dispatches (1992 entries), 1766 productions,
343 SKUs, 679 coils, 4179 baby coils, 19 distributors, 1 state-region row, 0 plant rows. Distributor
master unchanged. Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 296.675 | 296.675 | PASS |
| 1 | Invoiced prev month, 1–11 Oct | 881.115 | 881.115 | PASS |
| 2 | Σ daily orders = Current Month Orders | 575.0 | 575.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 296.675 + 111.485 + 635.355 | 1043.515 | PASS |
| 4 | Freshness | orders 11-Nov, invoices 6-Nov | production 10-Nov (6–9 missing) | **not loaded** |
| 5 | Σ region invoiced = Invoiced MTD | 296.675 (JS) | 296.675 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 746.840 (JS) | 746.840 (SQL; stored = netted) | PASS |
| 7–8 | Σ plant invoiced / pending | 296.675 / 746.840 | 296.675 / 746.840 | PASS |
| — | Servable split ties to book | conf 111.485 / unconf 635.355 | book 111.485 / 635.355 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2496.973 (JS) | 2496.973 (SQL) | PASS |
| — | Produced MTD | 326.069 (JS) | 326.069 (SQL) | PASS |
| — | Full Coil Left | 658.678 (JS) | 658.678 (SQL) | PASS |

## Change vs this morning's report (11-Nov, 06:28 upload)
| Line | Morning | Now | Δ |
|---|---|---|---|
| Produced MTD | 269.9 | 326.1 | +56.2 (Tapi 10-Nov) |
| Current Month Orders | 408.0 | 575.0 | +167.0 (11-Nov orders) |
| Confirmed (netted) | 31.5 | 111.5 | +80.0 |
| Non-Confirmed | 548.4 | 635.4 | +87.0 |
| Servable – Unconfirmed | 175.0 | 190.0 | +15.0 |
| Pending to Dispatch | 206.5 | 301.5 | +95.0 |
| Physical Inventory | 2440.8 | 2497.0 | +56.2 (production, no new invoices) |
| RM Total | 1703.1 | 1646.6 | −56.5 (consumed by 10-Nov production) |
| Orders logged 4-Nov / 5-Nov | 167 / 43 | 51 / 159 | date shift reverted |

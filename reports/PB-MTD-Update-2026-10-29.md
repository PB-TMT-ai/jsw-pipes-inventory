# JSW Pipes & Tubes — PB MTD Update (2026-10-29)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **12:36 UTC upload** of 29-Oct (today's
invoices are in). Targets reused from September at the user's request: Best Estimate **5550 T**
(September's 17 distributor estimates, carried to October in memory; no October estimates exist in
`distributor_estimates`, and none were written) and Production **5000 T**.

```
PB MTD update as on --->	2026-10-29
Revised Best Estimate --->	5550.0T
Total Orders --->	3357.0T
Current Month Orders --->	3216.0T
Invoiced Orders MTD --->	2471.3T
Invoiced MTD (Previous Month) --->	2710.8T
Dispatch D-1 (Current Month) --->	30.1T
Dispatch D Day --->	53.5T
Confirmed Orders Pending to be Invoiced --->	243.0T
Non-Confirmed Orders --->	642.7T
Daily Run Rate Required --->	1026.2T
Physical Inventory --->	2422T
RM Full Coil Left --->	1033.1T
RM Baby Coil Left --->	1269.8T
RM Total --->	2302.9T
	
Invoiced MTD - South --->	1021.0T
Invoiced MTD - West --->	1430.1T
Invoiced MTD - Unmapped --->	20.2T
Invoiced MTD - All Regions --->	2471.3T
	
Pending to Serve - South --->	537.2T
Pending to Serve - West --->	348.6T
Pending to Serve - Unmapped --->	0T
Pending to Serve - All Regions --->	885.8T
	
Invoiced MTD by Plant - Hyderabad --->	801.7T
Invoiced MTD by Plant - NPMD --->	279.0T
Invoiced MTD by Plant - Lepakshi --->	497.4T
Invoiced MTD by Plant - Tapi --->	893.3T
Invoiced MTD by Plant - All Plants --->	2471.3T
	
Pending to Serve by Plant - Hyderabad --->	230.0T
Pending to Serve by Plant - NPMD --->	191.2T
Pending to Serve by Plant - Lepakshi --->	383.9T
Pending to Serve by Plant - Tapi --->	80.6T
Pending to Serve by Plant - All Plants --->	885.8T
	
Produced MTD --->	2958.6T
Produced MTD (Previous Month) --->	3402.9T
Production D-1 --->	125.2T
Production D Day --->	0T
	
Orders Logged D Day --->	249.0T
Orders Logged D-1 --->	182.0T
Orders Logged D-2 --->	75.0T
```

Notes:
- **Run rates** use 3 days left (31 − 29 + 1, calendar days). Invoicing (5550 − 2471.3) ÷ 3 = 1026.2 T/day;
  production (5000 − 2958.6) ÷ 3 = 680.5 T/day.
- **Confirmed** is the app's netted figure (`liveConfirmed`, ADR-0014): 243.0 T. The stored ERP bucket
  reads 266.9 T; the 23.8 T gap is invoicing already raised in Zoho that the ERP snapshot has not caught up with.
- **RM Baby Coil Left** is the Dashboard's figure (scrap floor + `consumed` flag, ADR-0007): 1269.8 T.
  194.1 T of ends are excluded.
- All four plants invoice now, so the Invoiced lines carry no "Hyderabad only" suffix.
- **Production D Day = 0** means "not loaded yet": the latest production date is 28-Oct.

## Physical Inventory fell 274 T today — explained
The 12:36 upload re-imported invoices for 1-Sep to 29-Oct (a windowed replace) and added **30-Sep
invoices (296.1 T) that were missing before**: Hyderabad 190.0, NPMD 48.4, Lepakshi 25.0, Tapi 32.8.
That stock was already gone, so FG now reads correctly lower. Every other day's total is unchanged:
1–29 Sep still 2710.8 T, and October changes only by today's 53.5 T. Net FG move since this
morning's run: −296.1 (30-Sep) − 53.5 (today's invoices) + 75.3 (Tapi production added for 28-Oct) = −274.2 T.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2056 orders, 428 dispatches (1807 entries), 1685
productions, 335 SKUs, 667 coils, 4020 baby coils, 17 distributors, 1 state-region row, 0 plant rows.
Exit code 0: every tie-out in all four cuts passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 2471.270 | 2471.270 | PASS |
| 1 | Invoiced prev month, 1–29 Sep | 2710.836 | 2710.836 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 2471.270 | 2471.270 | PASS |
| 2 | Σ daily orders = Current Month Orders | 3216.0 | 3216.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 2471.27 + 243.033 + 642.728 | 3357.031 | PASS |
| 4 | Freshness | max order / dispatch 29-Oct | max production 28-Oct | Production D-day 0 = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 2471.270 (JS) | 2471.270 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 885.761 (JS) | 885.761 app `salesKpis` · 909.6 stored-bucket SQL | PASS vs app · see note |
| 7 | Σ plant invoiced = Invoiced MTD | 2471.270 | 2471.270 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 885.761 | 885.761 app `salesKpis` | PASS vs app · see note |
| — | Servable split ties to book | conf 243.033 / unconf 642.728 | book 243.033 / 642.728 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2422.157 (JS) | 2422.157 (SQL) | PASS |
| — | Full Coil Left | 1033.125 (JS) | 1033.125 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Checks 6 & 8 against the skill's SQL**: the skill's SQL sums the *stored* `confirmed` (266.9 T),
  but every app surface nets it against matched invoices (ADR-0014, 243.0 T). The JS splits agree
  with the app's own `salesKpis` exactly. The skill's SQL check predates ADR-0014.
- **Confirmed variance**: stored 266.9 · release − invoiced 238.9 · netted (used) 243.0.
- **Unmapped**: 20.2 T invoiced (0.8%), one distributor with no state on its line (ARIHANT STEEL
  POINT, under a name key). Below the 20% flag threshold.
- **Post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** plant tonnage 0.
- **Stored vs live production weight**: +2.1 T (minor master-weight drift).
- **Script defect found**: `scripts/daily-splits.mjs` fetches orders with a fixed column list
  (`ORDER_COLS`) that omits `invoiced_qty` and the SKU fields. Run that way, Confirmed is under-netted
  (region and plant splits even disagree) and Servable – Unconfirmed reads 0. This report uses full
  order rows, which reproduce the app.

## Change vs earlier run today (pre-12:36 upload)
| Line | Earlier | Now | Δ |
|---|---|---|---|
| Invoiced MTD | 2417.8 | 2471.3 | +53.5 (today's invoices) |
| Dispatch D Day | 0 | 53.5 | +53.5 |
| Produced MTD | 2883.2 | 2958.6 | +75.3 (Tapi, 28-Oct) |
| Production D-1 | 49.9 | 125.2 | +75.3 |
| Confirmed (netted) | 234.8 | 243.0 | +8.2 |
| Non-Confirmed | 608.1 | 642.7 | +34.6 |
| Current Month Orders | 3101.0 | 3216.0 | +115.0 |
| Servable – Unconfirmed | 260.6 | 263.1 | +2.5 |
| Physical Inventory | 2696.4 | 2422.2 | −274.2 (see above) |
| RM Total | 2338.5 | 2302.9 | −35.6 |

October still trails September's same-day pace on invoicing (2471.3 vs 2710.8, −239.6 T, −9%) and
production (2958.6 vs 3402.9, −444.3 T, −13%).

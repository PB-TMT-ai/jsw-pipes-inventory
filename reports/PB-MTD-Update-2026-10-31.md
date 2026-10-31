# JSW Pipes & Tubes — PB MTD Update (2026-10-31)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **06:02 UTC upload** of 31-Oct. Orders run
to 31-Oct; invoices and production to 30-Oct. Targets reused from September at the user's request:
Best Estimate **5550 T** (September's 17 distributor estimates, re-checked line for line against the
database and carried to October in memory; no October estimates exist and none were written) and
Production **5000 T**.

> ⚠️ **Order book shrank overnight: 88 lines / 586.0 T gone, all from three distributors.**
> See "Order-book anomaly" below. Invoiced, Production and Inventory are unaffected; the Orders
> block reads lower than it did yesterday for that reason.

```
PB MTD update as on --->	2026-10-31
Revised Best Estimate --->	5550.0T
Total Orders --->	3517.8T
Current Month Orders --->	3272.0T
Invoiced Orders MTD --->	2740.7T
Invoiced MTD (Previous Month) --->	3007.0T
Dispatch D-1 (Current Month) --->	219.7T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	260.4T
Non-Confirmed Orders --->	516.7T
Daily Run Rate Required --->	2809.3T
Physical Inventory --->	2380T
RM Full Coil Left --->	926.6T
RM Baby Coil Left --->	1169.0T
RM Total --->	2095.5T
	
Invoiced MTD - South --->	1199.3T
Invoiced MTD - West --->	1495.3T
Invoiced MTD - Unmapped --->	46.1T
Invoiced MTD - All Regions --->	2740.7T
	
Pending to Serve - South --->	430.4T
Pending to Serve - West --->	344.6T
Pending to Serve - Unmapped --->	2.1T
Pending to Serve - All Regions --->	777.1T
	
Invoiced MTD by Plant - Hyderabad --->	936.3T
Invoiced MTD by Plant - NPMD --->	279.0T
Invoiced MTD by Plant - Lepakshi --->	597.4T
Invoiced MTD by Plant - Tapi --->	928.1T
Invoiced MTD by Plant - All Plants --->	2740.7T
	
Pending to Serve by Plant - Hyderabad --->	140.8T
Pending to Serve by Plant - NPMD --->	175.1T
Pending to Serve by Plant - Lepakshi --->	348.9T
Pending to Serve by Plant - Tapi --->	112.3T
Pending to Serve by Plant - All Plants --->	777.1T
	
Produced MTD --->	3186.3T
Produced MTD (Previous Month) --->	3664.1T
Production D-1 --->	73.2T
Production D Day --->	0T
	
Orders Logged D Day --->	20.0T
Orders Logged D-1 --->	215.0T
Orders Logged D-2 --->	211.0T
```

Notes:
- **Last day of the month**: 1 day left (31 − 31 + 1). Invoicing needs 5550 − 2740.7 = 2809.3 T today;
  production needs 5000 − 3186.3 = 1813.7 T.
- **Previous month same days** = all of September.
- **Confirmed** is the app's netted figure (`liveConfirmed`, ADR-0014): 260.4 T. Stored ERP bucket
  367.0 T; release − invoiced 340.4 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 1169.0 T; 197.5 T of ends excluded.
- **D Day = 0** for dispatch and production means "not loaded yet": both run to 30-Oct.
- **Production D-1 (30-Oct)** = Hyderabad 20.6 + Tapi 52.6. NPMD and Lepakshi have no 30-Oct rows
  (their MTD has not moved since the 29-Oct report: NPMD 691.5 T, Lepakshi 430.0 T).
- **GOA (HISSARIA STEEL)** is still unmapped. 25.9 T of its order was invoiced on 30-Oct (now in
  Unmapped invoicing, 46.1 T total with ARIHANT STEEL POINT's 20.2 T); 2.1 T remains confirmed, left
  out of the Pending to Dispatch total by design (servable share `?`).

## Order-book anomaly
Compared with yesterday's 13:09 book, today's upload **hard-removed 88 order lines (586.0 T)**. Every
one belongs to **V V N STEELS P LTD, SST STEEL CORPORATION or PROVACK STRUCTURAL STEELS PRIVATE
LIMITED**, dated 14-Aug to 30-Oct, most of them already Delivered. The order upload replaces the
book, so these lines are simply absent from today's ERP file. Real cancellations would not take
delivered lines back to August, so this reads like an incomplete ERP export for those three
distributors, but the data cannot prove it.

What it moves in this report (relative to the same lines still being present):
| Line | Effect |
|---|---|
| Current Month Orders | −194.0 T of October lines missing |
| Orders Logged D-1 (30-Oct) / D-2 (29-Oct) | −18.0 T / −17.0 T |
| Confirmed (netted) / Non-confirmed | −40.6 T / −36.6 T of open lines missing |
| Indent | −77.2 T (open book only; invoiced is unaffected) |
| Invoices pointing at a vanished order line | 480.9 T (139.7 T in October) — still counted in Invoiced |

Invoiced MTD, Production, Physical Inventory and RM do not read the order book and are unaffected.
Recommended: check the ERP order export for those three distributors and re-upload if lines are missing.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2027 orders, 439 dispatches (1880 entries), 1698
productions, 335 SKUs, 668 coils, 4050 baby coils, 17 distributors, 1 state-region row, 0 plant rows.
Exit code 0: every tie-out in all four cuts passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 2740.715 | 2740.715 | PASS |
| 1 | Invoiced prev month (all Sep) | 3006.971 | 3006.971 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 2740.715 | 2740.715 | PASS |
| 2 | Σ daily orders = Current Month Orders | 3272.0 | 3272.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 2740.715 + 260.378 + 516.703 | 3517.796 | PASS |
| 4 | Freshness | max order 31-Oct | max dispatch / production 30-Oct | D-day 0s = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 2740.715 (JS) | 2740.715 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 777.081 (JS) | 777.081 app `salesKpis` · 883.7 stored-bucket SQL | PASS vs app (ADR-0014) |
| 7 | Σ plant invoiced = Invoiced MTD | 2740.715 | 2740.715 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 777.081 | 777.081 app `salesKpis` | PASS vs app (ADR-0014) |
| — | Servable split ties to book | conf 260.378 / unconf 516.703 | book 260.378 / 516.703 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2380.451 (JS) | 2380.451 (SQL) | PASS |
| — | Produced MTD | 3186.336 (JS) | 3186.336 (SQL) | PASS |
| — | Full Coil Left | 926.575 (JS) | 926.575 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Order-book anomaly** above — the checks prove the numbers are internally consistent with
  today's book, not that today's book is complete.
- **Unmapped**: invoiced 46.1 T (1.7%), pending 2.1 T (0.3%). Below the 20% flag threshold.
- **Post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** plant tonnage 0.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs last report (30-Oct, 13:09 upload)
| Line | 30-Oct | 31-Oct | Δ |
|---|---|---|---|
| Invoiced MTD | 2664.7 | 2740.7 | +76.0 (more 30-Oct invoices loaded) |
| Dispatch for 30-Oct | 143.7 | 219.7 | +76.0 |
| Produced MTD | 3113.2 | 3186.3 | +73.1 (30-Oct: Hyderabad 20.6, Tapi 52.6) |
| Confirmed (netted) | 366.8 | 260.4 | −106.4 |
| Non-Confirmed | 521.1 | 516.7 | −4.4 |
| Current Month Orders | 3403.0 | 3272.0 | −131.0 (anomaly −194 + new lines) |
| Orders logged 30-Oct | 233.0 | 215.0 | −18.0 (anomaly) |
| Orders logged 29-Oct | 228.0 | 211.0 | −17.0 (anomaly) |
| Servable – Unconfirmed | 207.0 | 204.2 | −2.8 |
| Pending to Dispatch | 548.8 | 462.5 | −86.3 |
| Physical Inventory | 2383.3 | 2380.5 | −2.8 (= +73.1 made − 76.0 invoiced) |
| RM Total | 2168.8 | 2095.5 | −73.3 |

Month-end pace vs September (all 30 days): invoicing 2740.7 vs 3007.0 (−266.3 T, −9%); production
3186.3 vs 3664.1 (−477.8 T, −13%).

# JSW Pipes & Tubes — PB MTD Update (2026-10-31)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **12:08 UTC upload** of 31-Oct (today's
invoices are in). Orders and invoices run to 31-Oct; production to 30-Oct. Targets reused from
September at the user's request: Best Estimate **5550 T** (September's 17 distributor estimates,
carried to October in memory; no October estimates exist and none were written) and Production **5000 T**.

> ⚠️ **Three distributors' order history keeps shrinking.** See "Order-book anomaly" below.
> Invoiced, Production and Inventory are unaffected; the Orders block is probably understated.

```
PB MTD update as on --->	2026-10-31
Revised Best Estimate --->	5550.0T
Total Orders --->	3579.0T
Current Month Orders --->	3178.0T
Invoiced Orders MTD --->	2893.0T
Invoiced MTD (Previous Month) --->	3007.0T
Dispatch D-1 (Current Month) --->	219.7T
Dispatch D Day --->	152.3T
Confirmed Orders Pending to be Invoiced --->	226.9T
Non-Confirmed Orders --->	459.1T
Daily Run Rate Required --->	2657.0T
Physical Inventory --->	2228T
RM Full Coil Left --->	926.6T
RM Baby Coil Left --->	1169.5T
RM Total --->	2096.0T
	
Invoiced MTD - South --->	1316.8T
Invoiced MTD - West --->	1530.0T
Invoiced MTD - Unmapped --->	46.1T
Invoiced MTD - All Regions --->	2893.0T
	
Pending to Serve - South --->	367.2T
Pending to Serve - West --->	317.8T
Pending to Serve - Unmapped --->	1.1T
Pending to Serve - All Regions --->	686.0T
	
Invoiced MTD by Plant - Hyderabad --->	1006.9T
Invoiced MTD by Plant - NPMD --->	330.3T
Invoiced MTD by Plant - Lepakshi --->	617.7T
Invoiced MTD by Plant - Tapi --->	938.1T
Invoiced MTD by Plant - All Plants --->	2893.0T
	
Pending to Serve by Plant - Hyderabad --->	87.2T
Pending to Serve by Plant - NPMD --->	181.8T
Pending to Serve by Plant - Lepakshi --->	290.2T
Pending to Serve by Plant - Tapi --->	126.8T
Pending to Serve by Plant - All Plants --->	686.0T
	
Produced MTD --->	3186.3T
Produced MTD (Previous Month) --->	3664.1T
Production D-1 --->	73.2T
Production D Day --->	0T
	
Orders Logged D Day --->	48.0T
Orders Logged D-1 --->	227.0T
Orders Logged D-2 --->	220.0T
```

Notes:
- **Last day of the month**: 1 day left. Invoicing needs 5550 − 2893.0 = 2657.0 T today; production
  needs 5000 − 3186.3 = 1813.7 T.
- **Previous month same days** = all of September.
- **Confirmed** is the app's netted figure (`liveConfirmed`, ADR-0014): 226.9 T. Stored ERP bucket
  257.5 T; release − invoiced 228.2 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 1169.5 T; 197.1 T of ends excluded.
- **Production D Day = 0** means "not loaded yet": production runs to 30-Oct.
- **Production D-1 (30-Oct)** = Hyderabad 20.6 + Tapi 52.6. NPMD and Lepakshi MTD have not moved
  since the 29-Oct report (691.5 T, 430.0 T).
- **GOA (HISSARIA STEEL)** is still unmapped: 25.9 T invoiced (in Unmapped invoicing with ARIHANT
  STEEL POINT's 20.2 T), 1.1 T still confirmed and left out of the Pending to Dispatch total by design.

## Order-book anomaly
The ERP order upload replaces the whole book. Across the last two uploads (31-Oct 06:02 and 12:08),
three distributors lost order history while every other distributor's history is unchanged:

| Distributor | Lines (30-Oct → now) | All lines, T | Lines dated before 29-Oct, T |
|---|---|---|---|
| PROVACK STRUCTURAL STEELS PRIVATE LIMITED | 76 → 47 | 695 → 416 | 695 → 416 (−279) |
| SST STEEL CORPORATION | 498 → 462 | 3078 → 2863 | 2969 → 2730 (−239) |
| V V N STEELS P LTD | 261 → 228 | 1574 → 1397 | 1531 → 1354 (−177) |

So **695 T of order lines dated before 29-Oct have vanished**, going back to April, mostly already
Delivered. Invoicing cannot remove an order line, so this is not explained by today's invoices; it
looks like the ERP export dropping lines for these three, but the data cannot prove it.

Effect on this report: these three distributors' **October-dated** lines fell from 1012 T to 777 T
(−235 T), which flows into Current Month Orders and Indent. Their open book (Confirmed 162.0 → 90.1,
Non-confirmed 163.0 → 125.7) mixes real invoicing with missing lines and cannot be split cleanly.
**596.7 T of invoices (200.3 T in October) now point at order lines that are no longer in the book**;
they are still counted in Invoiced. Invoiced, Production, Physical Inventory and RM are unaffected.
Recommended: check the ERP order export for these three distributors before trusting the Orders block.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2005 orders, 447 dispatches (1912 entries), 1698
productions, 335 SKUs, 668 coils, 4050 baby coils, 17 distributors, 1 state-region row, 0 plant rows.
Distributor-master regions re-checked: unchanged. Exit code 0: every tie-out in all four cuts passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 2892.965 | 2892.965 | PASS |
| 1 | Invoiced prev month (all Sep) | 3006.971 | 3006.971 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 2892.965 | 2892.965 | PASS |
| 2 | Σ daily orders = Current Month Orders | 3178.0 | 3178.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 2892.965 + 226.919 + 459.123 | 3579.007 | PASS |
| 4 | Freshness | max order / dispatch 31-Oct | max production 30-Oct | Production D-day 0 = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 2892.965 (JS) | 2892.965 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 686.042 (JS) | 686.042 app `salesKpis` · 716.6 stored-bucket SQL | PASS vs app (ADR-0014) |
| 7 | Σ plant invoiced = Invoiced MTD | 2892.965 | 2892.965 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 686.042 | 686.042 app `salesKpis` | PASS vs app (ADR-0014) |
| — | Servable split ties to book | conf 226.919 / unconf 459.123 | book 226.919 / 459.123 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2228.201 (JS) | 2228.201 (SQL) | PASS |
| — | Produced MTD | 3186.336 (JS) | 3186.336 (SQL) | PASS |
| — | Full Coil Left | 926.575 (JS) | 926.575 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Order-book anomaly** above — the checks prove the numbers are consistent with today's book,
  not that today's book is complete.
- **Unmapped**: invoiced 46.1 T (1.6%), pending 1.1 T (0.2%). Below the 20% flag threshold.
- **Post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** plant tonnage 0.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs this morning's report (31-Oct, 06:02 upload)
| Line | Morning | Now | Δ |
|---|---|---|---|
| Invoiced MTD | 2740.7 | 2893.0 | +152.3 (today's invoices) |
| Dispatch D Day | 0 | 152.3 | +152.3 |
| Produced MTD | 3186.3 | 3186.3 | 0 |
| Confirmed (netted) | 260.4 | 226.9 | −33.5 |
| Non-Confirmed | 516.7 | 459.1 | −57.6 |
| Current Month Orders | 3272.0 | 3178.0 | −94.0 |
| Orders logged 31-Oct / 30-Oct / 29-Oct | 20 / 215 / 211 | 48 / 227 / 220 | +28 / +12 / +9 |
| Servable – Unconfirmed | 204.2 | 166.2 | −38.0 |
| Pending to Dispatch | 462.5 | 392.1 | −70.4 |
| Physical Inventory | 2380.5 | 2228.2 | −152.3 (= today's invoices) |
| RM Total | 2095.5 | 2096.0 | +0.5 |

Month-end pace vs September (all 30 days): invoicing 2893.0 vs 3007.0 (−114.0 T, −4%); production
3186.3 vs 3664.1 (−477.8 T, −13%).

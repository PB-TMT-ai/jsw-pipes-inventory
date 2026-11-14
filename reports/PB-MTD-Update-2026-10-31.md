# JSW Pipes & Tubes — PB MTD Update (2026-10-31) — October month-end

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **17:26 UTC upload** of 31-Oct, the last
report of October. Orders and invoices run to 31-Oct; production to 30-Oct (31-Oct production not
yet entered). Targets reused from September at the user's request: Best Estimate **5550 T**
(September's 17 distributor estimates, carried to October in memory; no October estimates exist and
none were written) and Production **5000 T**.

```
PB MTD update as on --->	2026-10-31
Revised Best Estimate --->	5550.0T
Total Orders --->	3633.1T
Current Month Orders --->	3465.0T
Invoiced Orders MTD --->	3027.4T
Invoiced MTD (Previous Month) --->	3007.0T
Dispatch D-1 (Current Month) --->	219.7T
Dispatch D Day --->	286.7T
Confirmed Orders Pending to be Invoiced --->	108.9T
Non-Confirmed Orders --->	496.8T
Daily Run Rate Required --->	2522.6T
Physical Inventory --->	2094T
RM Full Coil Left --->	965.6T
RM Baby Coil Left --->	1169.5T
RM Total --->	2135.1T
	
Invoiced MTD - South --->	1413.3T
Invoiced MTD - West --->	1568.0T
Invoiced MTD - Unmapped --->	46.1T
Invoiced MTD - All Regions --->	3027.4T
	
Pending to Serve - South --->	309.6T
Pending to Serve - West --->	295.0T
Pending to Serve - Unmapped --->	1.1T
Pending to Serve - All Regions --->	605.7T
	
Invoiced MTD by Plant - Hyderabad --->	1006.9T
Invoiced MTD by Plant - NPMD --->	330.3T
Invoiced MTD by Plant - Lepakshi --->	687.8T
Invoiced MTD by Plant - Tapi --->	1002.4T
Invoiced MTD by Plant - All Plants --->	3027.4T
	
Pending to Serve by Plant - Hyderabad --->	86.2T
Pending to Serve by Plant - NPMD --->	181.0T
Pending to Serve by Plant - Lepakshi --->	241.5T
Pending to Serve by Plant - Tapi --->	97.0T
Pending to Serve by Plant - All Plants --->	605.7T
	
Produced MTD --->	3186.3T
Produced MTD (Previous Month) --->	3664.1T
Production D-1 --->	73.2T
Production D Day --->	0T
	
Orders Logged D Day --->	62.0T
Orders Logged D-1 --->	233.0T
Orders Logged D-2 --->	228.0T
```

## October close
| | October | September | Δ | Target | Achieved |
|---|---|---|---|---|---|
| Invoiced | 3027.4 T | 3007.0 T | +20.4 T (+0.7%) | 5550 T | 55% (gap 2522.6 T) |
| — South | 1413.3 T | | | 2350 T | 60% |
| — West | 1568.0 T | | | 3200 T | 49% |
| Produced (to 30-Oct) | 3186.3 T | 3664.1 T | −477.8 T (−13.0%) | 5000 T | 64% (gap 1813.7 T) |

Production by plant, October vs September: Hyderabad 767.0 vs 1011.8 · NPMD 691.5 vs 742.7 ·
Lepakshi 430.0 vs 629.6 · Tapi 1297.8 vs 1280.0. Invoicing by plant, October: Hyderabad 1006.9 ·
NPMD 330.3 · Lepakshi 687.8 · Tapi 1002.4.

October production is provisional: 31-Oct production has not been entered, and NPMD and Lepakshi
have not moved since the 29-Oct report.

Notes:
- **Run rates** on the last day equal the month's remaining gap (1 day left).
- **Previous month same days** = all of September.
- **Confirmed** is the app's netted figure (`liveConfirmed`, ADR-0014): 108.9 T. Stored ERP bucket
  234.8 T; release − invoiced 203.2 T. The gap is today's Zoho invoicing that the ERP snapshot has
  not caught up with.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 1169.5 T; 197.1 T of ends excluded.
- **GOA (HISSARIA STEEL)** is still unmapped: 25.9 T invoiced, 1.1 T confirmed and left out of the
  Pending to Dispatch total by design.

## Order-book anomaly — resolved
The 06:02 and 12:08 uploads had dropped up to 695 T of history for PROVACK STRUCTURAL STEELS, SST
STEEL CORPORATION and V V N STEELS. The 17:26 upload restores it: against the 30-Oct 13:09 book,
**no line is missing**, their pre-29-Oct history matches exactly (695 / 2969 / 1531 T), and **no
invoice points at a vanished order line**. The two earlier 31-Oct reports' Orders blocks were
understated for that reason; this one is not.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2114 orders, 453 dispatches (1938 entries), 1698
productions, 335 SKUs, 670 coils, 4050 baby coils, 17 distributors, 1 state-region row, 0 plant rows.
Distributor-master regions re-checked: unchanged. Exit code 0: every tie-out in all four cuts passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 3027.395 | 3027.395 | PASS |
| 1 | Invoiced prev month (all Sep) | 3006.971 | 3006.971 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 3027.395 | 3027.395 | PASS |
| 2 | Σ daily orders = Current Month Orders | 3465.0 | 3465.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 3027.395 + 108.915 + 496.755 | 3633.065 | PASS |
| 4 | Freshness | max order / dispatch 31-Oct | max production 30-Oct | Production D-day 0 = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 3027.395 (JS) | 3027.395 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 605.670 (JS) | 605.670 app `salesKpis` · 731.6 stored-bucket SQL | PASS vs app (ADR-0014) |
| 7 | Σ plant invoiced = Invoiced MTD | 3027.395 | 3027.395 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 605.670 | 605.670 app `salesKpis` | PASS vs app (ADR-0014) |
| — | Servable split ties to book | conf 108.915 / unconf 496.755 | book 108.915 / 496.755 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2093.771 (JS) | 2093.771 (SQL) | PASS |
| — | Produced MTD | 3186.336 (JS) | 3186.336 (SQL) | PASS |
| — | Full Coil Left | 965.620 (JS) | 965.620 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |
| — | Order book vs last good book (30-Oct 13:09) | 0 lines missing | 0 T orphaned invoices | PASS |

Advisory:
- **Unmapped**: invoiced 46.1 T (1.5%), pending 1.1 T (0.2%). Below the 20% flag threshold.
- **Post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** plant tonnage 0.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs the 12:08 report
| Line | 12:08 | 17:26 | Δ |
|---|---|---|---|
| Invoiced MTD | 2893.0 | 3027.4 | +134.4 (more 31-Oct invoices) |
| Dispatch D Day | 152.3 | 286.7 | +134.4 |
| Confirmed (netted) | 226.9 | 108.9 | −118.0 |
| Non-Confirmed | 459.1 | 496.8 | +37.6 |
| Current Month Orders | 3178.0 | 3465.0 | +287.0 (book restored + new lines) |
| Orders logged 31-Oct / 30-Oct / 29-Oct | 48 / 227 / 220 | 62 / 233 / 228 | +14 / +6 / +8 |
| Servable – Unconfirmed | 166.2 | 191.3 | +25.1 |
| Pending to Dispatch | 392.1 | 299.1 | −93.0 |
| Physical Inventory | 2228.2 | 2093.8 | −134.4 (= extra invoices) |
| RM Total | 2096.0 | 2135.1 | +39.0 (2 coils received) |

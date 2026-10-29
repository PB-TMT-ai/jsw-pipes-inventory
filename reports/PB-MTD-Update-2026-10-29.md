# JSW Pipes & Tubes — PB MTD Update (2026-10-29)

Live Supabase data (`hztblmccvvarmgxmunrp`). Targets reused from September at the user's request:
Best Estimate **5550 T** (September's 17 distributor estimates, carried to October in memory — no
October estimates exist in `distributor_estimates`, and none were written) and Production **5000 T**.

```
PB MTD update as on --->	2026-10-29
Revised Best Estimate --->	5550.0T
Total Orders --->	3260.8T
Current Month Orders --->	3101.0T
Invoiced Orders MTD --->	2417.8T
Invoiced MTD (Previous Month) --->	2710.8T
Dispatch D-1 (Current Month) --->	30.1T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	234.8T
Non-Confirmed Orders --->	608.1T
Daily Run Rate Required --->	1044.1T
Physical Inventory --->	2696T
RM Full Coil Left --->	1018.4T
RM Baby Coil Left --->	1320.1T
RM Total --->	2338.5T
	
Invoiced MTD - South --->	992.7T
Invoiced MTD - West --->	1404.9T
Invoiced MTD - Unmapped --->	20.2T
Invoiced MTD - All Regions --->	2417.8T
	
Pending to Serve - South --->	476.2T
Pending to Serve - West --->	366.7T
Pending to Serve - Unmapped --->	0T
Pending to Serve - All Regions --->	842.9T
	
Invoiced MTD by Plant - Hyderabad --->	773.4T
Invoiced MTD by Plant - NPMD --->	279.0T
Invoiced MTD by Plant - Lepakshi --->	497.4T
Invoiced MTD by Plant - Tapi --->	868.1T
Invoiced MTD by Plant - All Plants --->	2417.8T
	
Pending to Serve by Plant - Hyderabad --->	191.2T
Pending to Serve by Plant - NPMD --->	207.6T
Pending to Serve by Plant - Lepakshi --->	322.1T
Pending to Serve by Plant - Tapi --->	122.0T
Pending to Serve by Plant - All Plants --->	842.9T
	
Produced MTD --->	2883.2T
Produced MTD (Previous Month) --->	3402.9T
Production D-1 --->	49.9T
Production D Day --->	0T
	
Orders Logged D Day --->	134.0T
Orders Logged D-1 --->	182.0T
Orders Logged D-2 --->	75.0T
```

Notes:
- **Run rates** use 3 days left (31 − 29 + 1, calendar days). Invoicing (5550 − 2417.8) ÷ 3 = 1044.1 T/day;
  production (5000 − 2883.2) ÷ 3 = 705.6 T/day.
- **Confirmed** is the app's netted figure (`liveConfirmed`, ADR-0014): 234.8 T. The stored ERP bucket
  reads 263.0 T; the 28.2 T gap is invoicing already raised in Zoho that the ERP snapshot has not caught up with.
- **RM Baby Coil Left** is the Dashboard's figure (scrap floor + `consumed` flag, ADR-0007): 1320.1 T.
  The plain Σ max(0, weight − consumed) reads 1513.2 T; 194.1 T of ends are excluded.
- All four plants invoice now, so the Invoiced lines carry no "Hyderabad only" suffix.
- **Dispatch D Day / Production D Day = 0** are "no data loaded yet": the latest dispatch and production dates are 28-Oct.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2032 orders, 412 dispatches (1728 entries), 1682
productions, 335 SKUs, 665 coils, 4017 baby coils, 17 distributors, 1 state-region row, 0 plant rows.
Exit code 0: every tie-out in all four cuts passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 2417.820 | 2417.8 | PASS |
| 1 | Invoiced prev month, 1–29 Sep | 2710.836 | 2710.8 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 2417.820 | 2417.8 | PASS |
| 2 | Σ daily orders = Current Month Orders | 3101.000 | 3101.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 2417.82 + 234.818 + 608.117 | 3260.755 | PASS |
| 4 | Freshness | max order 29-Oct | max dispatch / production 28-Oct | D-day 0s = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 2417.820 (JS) | 2417.8 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 842.935 (JS) | 842.935 app `salesKpis` · 871.1 stored-bucket SQL | PASS vs app · see note |
| 7 | Σ plant invoiced = Invoiced MTD | 2417.820 | 2417.8 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 842.935 | 842.935 app `salesKpis` | PASS vs app · see note |
| — | Servable split ties to book | conf 234.818 / unconf 608.117 | book 234.818 / 608.117 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2696.4 | 2696.4 | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Checks 6 & 8 against the skill's SQL**: the skill's SQL sums the *stored* `confirmed` (263.0 T),
  but every app surface nets it against matched invoices (ADR-0014, 234.8 T). The JS splits agree
  with the app's own `salesKpis` to the gram; the 28.2 T gap is the ERP lag, not a split error.
  The skill's SQL check predates ADR-0014.
- **Confirmed variance**: stored 263.0 · release − invoiced 229.9 · netted (used) 234.8.
- **Unmapped**: 20.2 T invoiced (0.8%), one distributor with no state on its line (ARIHANT STEEL
  POINT, under a name key). Below the 20% flag threshold.
- **Post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** plant tonnage 0.
- **Stored vs live production weight**: +2.1 T (minor master-weight drift).
- **Script defect found**: `scripts/daily-splits.mjs` fetches orders with a fixed column list
  (`ORDER_COLS`) that omits `invoiced_qty` and the SKU fields. Run that way, Confirmed nets to
  175.7 / 192.1 T (region / plant splits disagree) and Servable – Unconfirmed reads 0. This report
  uses full order rows, which reproduce the app.

## Change vs last report
The last PB MTD report on file is 2026-08-05, from another month, so a line-by-line Δ means nothing.
Against the last daily message (18-Sep-2026): Invoiced MTD 1453.5 → 2417.8 (day 18 vs day 29), and
BE achievement 26% → 44% on the same 5550 T.
October trails September's same-day pace on both invoicing (2417.8 vs 2710.8, −293.0 T, −11%) and
production (2883.2 vs 3402.9, −519.7 T, −15%).

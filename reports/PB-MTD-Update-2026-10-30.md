# JSW Pipes & Tubes — PB MTD Update (2026-10-30)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **13:09 UTC upload** of 30-Oct (today's
invoices are in). Orders and invoices run to 30-Oct; production to 29-Oct. Targets reused from
September at the user's request: Best Estimate **5550 T** (September's 17 distributor estimates,
carried to October in memory; no October estimates exist and none were written) and Production **5000 T**.

```
PB MTD update as on --->	2026-10-30
Revised Best Estimate --->	5550.0T
Total Orders --->	3552.6T
Current Month Orders --->	3403.0T
Invoiced Orders MTD --->	2664.7T
Invoiced MTD (Previous Month) --->	3007.0T
Dispatch D-1 (Current Month) --->	103.2T
Dispatch D Day --->	143.7T
Confirmed Orders Pending to be Invoiced --->	366.8T
Non-Confirmed Orders --->	521.1T
Daily Run Rate Required --->	1442.6T
Physical Inventory --->	2383T
RM Full Coil Left --->	973.7T
RM Baby Coil Left --->	1195.1T
RM Total --->	2168.8T
	
Invoiced MTD - South --->	1149.2T
Invoiced MTD - West --->	1495.3T
Invoiced MTD - Unmapped --->	20.2T
Invoiced MTD - All Regions --->	2664.7T
	
Pending to Serve - South --->	498.1T
Pending to Serve - West --->	364.8T
Pending to Serve - Unmapped --->	25.0T
Pending to Serve - All Regions --->	887.9T
	
Invoiced MTD by Plant - Hyderabad --->	911.0T
Invoiced MTD by Plant - NPMD --->	279.0T
Invoiced MTD by Plant - Lepakshi --->	546.8T
Invoiced MTD by Plant - Tapi --->	928.1T
Invoiced MTD by Plant - All Plants --->	2664.7T
	
Pending to Serve by Plant - Hyderabad --->	181.2T
Pending to Serve by Plant - NPMD --->	200.1T
Pending to Serve by Plant - Lepakshi --->	379.8T
Pending to Serve by Plant - Tapi --->	126.8T
Pending to Serve by Plant - All Plants --->	887.9T
	
Produced MTD --->	3113.2T
Produced MTD (Previous Month) --->	3664.1T
Production D-1 --->	102.3T
Production D Day --->	0T
	
Orders Logged D Day --->	233.0T
Orders Logged D-1 --->	228.0T
Orders Logged D-2 --->	157.0T
```

Notes:
- **Run rates** use 2 days left (31 − 30 + 1, calendar days). Invoicing (5550 − 2664.7) ÷ 2 = 1442.6 T/day;
  production (5000 − 3113.2) ÷ 2 = 943.4 T/day.
- **Previous month same days** = 1–30 Sep, which is all of September.
- **Confirmed** is the app's netted figure (`liveConfirmed`, ADR-0014): 366.8 T. The stored ERP bucket
  reads 468.3 T; the 101.5 T gap is invoicing already raised in Zoho that the ERP snapshot has not caught up with.
- **RM Baby Coil Left** is the Dashboard's figure (scrap floor + `consumed` flag, ADR-0007): 1195.1 T.
  197.3 T of ends are excluded.
- **Production D Day = 0** means "not loaded yet": the latest production date is 29-Oct.
- **Production D-1 (29-Oct) is Hyderabad 72.4 + Tapi 29.8.** NPMD and Lepakshi have no 29-Oct rows.

## Pending to Dispatch leaves out GOA (25.0 T)
HISSARIA STEEL (`0015g00001EDs0EAAT`, ship-to **GOA**) now has its 25.0 T **confirmed**. GOA has no
region in the state → region master, so that distributor sits in **Unmapped**. By design
(`buildServableSummary`), an unmapped region's servable share and Pending to Dispatch read `?`, and
the Pending to Dispatch total counts only the regions it can answer for. So:
Confirmed 366.8 + Servable 207.0 = 573.8, but **Pending to Dispatch reads 548.8**, the 25.0 T gap
being exactly GOA's confirmed tonnage. The WhatsApp footnote says this in one line.
Fix: map GOA to a region on the Sales tab, or give HISSARIA STEEL a region override. Not done here:
it is a business decision.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2098 orders, 436 dispatches (1858 entries), 1694
productions, 335 SKUs, 668 coils, 4041 baby coils, 17 distributors, 1 state-region row, 0 plant rows.
Distributor-master regions re-checked against the database: unchanged. Exit code 0: every tie-out in
all four cuts passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 2664.730 | 2664.730 | PASS |
| 1 | Invoiced prev month, 1–30 Sep | 3006.971 | 3006.971 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 2664.730 | 2664.730 | PASS |
| 2 | Σ daily orders = Current Month Orders | 3403.0 | 3403.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 2664.73 + 366.82 + 521.065 | 3552.615 | PASS |
| 4 | Freshness | max order / dispatch 30-Oct | max production 29-Oct | Production D-day 0 = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 2664.730 (JS) | 2664.730 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 887.885 (JS) | 887.885 app `salesKpis` · 989.4 stored-bucket SQL | PASS vs app · see note |
| 7 | Σ plant invoiced = Invoiced MTD | 2664.730 | 2664.730 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 887.885 | 887.885 app `salesKpis` | PASS vs app · see note |
| — | Servable split ties to book | conf 366.820 / unconf 521.065 | book 366.820 / 521.065 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2383.296 (JS) | 2383.296 (SQL) | PASS |
| — | Produced MTD | 3113.195 (JS) | 3113.195 (SQL) | PASS |
| — | Full Coil Left | 973.680 (JS) | 973.680 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Checks 6 & 8 against the skill's SQL**: the skill's SQL sums the *stored* `confirmed` (468.3 T),
  but every app surface nets it against matched invoices (ADR-0014, 366.8 T). The JS splits agree
  with the app's own `salesKpis` exactly. The skill's SQL check predates ADR-0014.
- **Confirmed variance**: stored 468.3 · release − invoiced 440.4 · netted (used) 366.8.
- **Unmapped**: invoiced 20.2 T (0.8%, ARIHANT STEEL POINT under a name key, no state); pending 25.0 T
  (2.8%, GOA). Both below the 20% flag threshold.
- **Back-dated production**: 52.3 T of Tapi production dated **22-Oct** was entered today (05:53 UTC).
- **Post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** plant tonnage 0.
- **Script defect (still open)**: `scripts/daily-splits.mjs` fetches orders with a fixed column list
  (`ORDER_COLS`) that omits `invoiced_qty` and the SKU fields, so a direct run under-nets Confirmed and
  reads Servable – Unconfirmed as 0. This report uses full order rows, which reproduce the app.

## Change vs this morning's report (30-Oct, 05:06 upload)
| Line | Morning | Now | Δ |
|---|---|---|---|
| Invoiced MTD | 2521.0 | 2664.7 | +143.7 (today's invoices) |
| Dispatch D Day | 0 | 143.7 | +143.7 |
| Produced MTD | 2988.4 | 3113.2 | +124.8 (Hyderabad 29-Oct 72.4, Tapi 22-Oct 52.3) |
| Production D-1 | 29.8 | 102.3 | +72.4 |
| Confirmed (netted) | 308.1 | 366.8 | +58.8 |
| Non-Confirmed | 605.3 | 521.1 | −84.3 |
| Current Month Orders | 3293.0 | 3403.0 | +110.0 |
| Orders logged 30-Oct | 107.0 | 233.0 | +126.0 |
| Orders logged 29-Oct | 244.0 | 228.0 | −16.0 (book re-uploaded) |
| Servable – Unconfirmed | 212.8 | 207.0 | −5.8 |
| Pending to Dispatch | 520.8 | 548.8 | +28.0 |
| Physical Inventory | 2402.2 | 2383.3 | −18.9 (= +124.8 made − 143.7 invoiced) |
| RM Total | 2296.3 | 2168.8 | −127.5 |

Pace vs September (all 30 days): invoicing 2664.7 vs 3007.0 (−342.2 T, −11%); production 3113.2
vs 3664.1 (−550.9 T, −15%).

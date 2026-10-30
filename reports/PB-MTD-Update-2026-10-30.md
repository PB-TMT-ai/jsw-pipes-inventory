# JSW Pipes & Tubes — PB MTD Update (2026-10-30)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **05:06 UTC upload** of 30-Oct. Orders run
to 30-Oct; invoices and production to 29-Oct. Targets reused from September at the user's request:
Best Estimate **5550 T** (September's 17 distributor estimates, re-checked line for line against the
database and carried to October in memory; no October estimates exist and none were written) and
Production **5000 T**.

```
PB MTD update as on --->	2026-10-30
Revised Best Estimate --->	5550.0T
Total Orders --->	3434.4T
Current Month Orders --->	3293.0T
Invoiced Orders MTD --->	2521.0T
Invoiced MTD (Previous Month) --->	3007.0T
Dispatch D-1 (Current Month) --->	103.2T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	308.1T
Non-Confirmed Orders --->	605.3T
Daily Run Rate Required --->	1514.5T
Physical Inventory --->	2402T
RM Full Coil Left --->	973.7T
RM Baby Coil Left --->	1322.6T
RM Total --->	2296.3T
	
Invoiced MTD - South --->	1070.7T
Invoiced MTD - West --->	1430.1T
Invoiced MTD - Unmapped --->	20.2T
Invoiced MTD - All Regions --->	2521.0T
	
Pending to Serve - South --->	516.3T
Pending to Serve - West --->	372.1T
Pending to Serve - Unmapped --->	25.0T
Pending to Serve - All Regions --->	913.4T
	
Invoiced MTD by Plant - Hyderabad --->	826.9T
Invoiced MTD by Plant - NPMD --->	279.0T
Invoiced MTD by Plant - Lepakshi --->	521.9T
Invoiced MTD by Plant - Tapi --->	893.3T
Invoiced MTD by Plant - All Plants --->	2521.0T
	
Pending to Serve by Plant - Hyderabad --->	269.0T
Pending to Serve by Plant - NPMD --->	177.2T
Pending to Serve by Plant - Lepakshi --->	363.1T
Pending to Serve by Plant - Tapi --->	104.1T
Pending to Serve by Plant - All Plants --->	913.4T
	
Produced MTD --->	2988.4T
Produced MTD (Previous Month) --->	3664.1T
Production D-1 --->	29.8T
Production D Day --->	0T
	
Orders Logged D Day --->	107.0T
Orders Logged D-1 --->	244.0T
Orders Logged D-2 --->	157.0T
```

Notes:
- **Run rates** use 2 days left (31 − 30 + 1, calendar days). Invoicing (5550 − 2521.0) ÷ 2 = 1514.5 T/day;
  production (5000 − 2988.4) ÷ 2 = 1005.8 T/day.
- **Previous month same days** = 1–30 Sep, which is all of September (30 days).
- **Confirmed** is the app's netted figure (`liveConfirmed`, ADR-0014): 308.1 T. The stored ERP bucket
  reads 379.8 T; the 71.7 T gap is invoicing already raised in Zoho that the ERP snapshot has not caught up with.
- **RM Baby Coil Left** is the Dashboard's figure (scrap floor + `consumed` flag, ADR-0007): 1322.6 T.
  194.4 T of ends are excluded.
- All four plants invoice now, so the Invoiced lines carry no "Hyderabad only" suffix.
- **Dispatch D Day / Production D Day = 0** are "not loaded yet": the latest dispatch and production dates are 29-Oct.
- **Production D-1 (29-Oct) is Tapi only.** Hyderabad, NPMD and Lepakshi have no 29-Oct rows; it is
  not possible to tell from the data whether those mills were idle or not yet entered.

## New: GOA is not mapped to a region
HISSARIA STEEL (`0015g00001EDs0EAAT`, ship-to **GOA**) placed 9 lines, 25.0 T, on 30-Oct, all
non-confirmed, plant Hyderabad. GOA has no region in the state → region master, so those 25.0 T sit
in **Unmapped**: Pending to Serve counts them, but their servable share reads **?** (no service
area can be derived). Fix: map GOA to a region on the Sales tab, or give HISSARIA STEEL a region
override in the distributor master. Not done here: it is a business decision.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2078 orders, 430 dispatches (1818 entries), 1688
productions, 335 SKUs, 668 coils, 4041 baby coils, 17 distributors, 1 state-region row, 0 plant rows.
Distributor-master regions re-checked against the database: unchanged. Exit code 0: every tie-out in
all four cuts passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 2521.015 | 2521.015 | PASS |
| 1 | Invoiced prev month, 1–30 Sep | 3006.971 | 3006.971 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 2521.015 | 2521.015 | PASS |
| 2 | Σ daily orders = Current Month Orders | 3293.0 | 3293.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 2521.015 + 308.059 + 605.315 | 3434.389 | PASS |
| 4 | Freshness | max order 30-Oct | max dispatch / production 29-Oct | D-day 0s = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 2521.015 (JS) | 2521.015 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 913.374 (JS) | 913.374 app `salesKpis` · 985.1 stored-bucket SQL | PASS vs app · see note |
| 7 | Σ plant invoiced = Invoiced MTD | 2521.015 | 2521.015 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 913.374 | 913.374 app `salesKpis` | PASS vs app · see note |
| — | Servable split ties to book | conf 308.059 / unconf 605.315 | book 308.059 / 605.315 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2402.244 (JS) | 2402.244 (SQL) | PASS |
| — | Produced MTD | 2988.428 (JS) | 2988.428 (SQL) | PASS |
| — | Full Coil Left | 973.680 (JS) | 973.680 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Checks 6 & 8 against the skill's SQL**: the skill's SQL sums the *stored* `confirmed` (379.8 T),
  but every app surface nets it against matched invoices (ADR-0014, 308.1 T). The JS splits agree
  with the app's own `salesKpis` exactly. The skill's SQL check predates ADR-0014.
- **Confirmed variance**: stored 379.8 · release − invoiced 353.5 · netted (used) 308.1.
- **Unmapped**: invoiced 20.2 T (0.8%, ARIHANT STEEL POINT under a name key, no state); pending 25.0 T
  (2.7%, GOA, above). Both below the 20% flag threshold.
- **Post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** plant tonnage 0.
- **Stored vs live production weight**: +2.1 T (minor master-weight drift).
- **Script defect (still open)**: `scripts/daily-splits.mjs` fetches orders with a fixed column list
  (`ORDER_COLS`) that omits `invoiced_qty` and the SKU fields, so a direct run under-nets Confirmed and
  reads Servable – Unconfirmed as 0. This report uses full order rows, which reproduce the app.

## Change vs last report (29-Oct, after the 12:36 upload)
| Line | 29-Oct | 30-Oct | Δ |
|---|---|---|---|
| Invoiced MTD | 2471.3 | 2521.0 | +49.7 (more 29-Oct invoices loaded) |
| Dispatch for 29-Oct | 53.5 | 103.2 | +49.7 |
| Produced MTD | 2958.6 | 2988.4 | +29.8 (Tapi, 29-Oct) |
| Confirmed (netted) | 243.0 | 308.1 | +65.0 |
| Non-Confirmed | 642.7 | 605.3 | −37.4 |
| Current Month Orders | 3216.0 | 3293.0 | +77.0 |
| Orders logged 29-Oct | 249.0 | 244.0 | −5.0 (book re-uploaded) |
| Orders logged 28-Oct | 182.0 | 157.0 | −25.0 (book re-uploaded) |
| Servable – Unconfirmed | 263.1 | 212.8 | −50.3 |
| Pending to Dispatch | 506.2 | 520.8 | +14.6 |
| Physical Inventory | 2422.2 | 2402.2 | −19.9 (= +29.8 made − 49.7 invoiced) |
| RM Total | 2302.9 | 2296.3 | −6.6 |

Pace vs September (same days, which is now the whole of September): invoicing 2521.0 vs 3007.0
(−486.0 T, −16%); production 2988.4 vs 3664.1 (−675.7 T, −18%).

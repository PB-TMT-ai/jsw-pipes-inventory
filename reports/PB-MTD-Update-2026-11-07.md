# JSW Pipes & Tubes — PB MTD Update (2026-11-07)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **07:28 UTC upload** of 7-Nov. Orders run to
7-Nov, invoices to 6-Nov, production to 5-Nov. Targets: **Best Estimate 4000 T** (November) and
**Production 5000 T**.

> ⚠️ **709 order lines were re-dated one day earlier in this upload** — see "Order-date shift".
> Orders Logged by day is affected; Current Month (November) is not.

```
PB MTD update as on --->	2026-11-07
Revised Best Estimate --->	4000.0T
Total Orders --->	878.1T
Current Month Orders --->	408.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	296.7T
Invoiced MTD (Previous Month) --->	467.9T
Dispatch D-1 (Current Month) --->	75.0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	5.1T
Non-Confirmed Orders --->	576.4T
Daily Run Rate Required --->	154.3T
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
Produced MTD (Previous Month) --->	983.9T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	28.0T
Orders Logged D-1 --->	25.0T
Orders Logged D-2 --->	43.0T
```

Notes:
- **Run rates** use 24 days left (30 − 7 + 1). Invoicing (4000 − 296.7) ÷ 24 = 154.3 T/day;
  production (5000 − 269.9) ÷ 24 = 197.1 T/day.
- **Previous month same days** = 1–7 Oct: invoiced 467.9 T, produced 983.9 T.
- **Freshness**: invoices to 6-Nov, production to 5-Nov. Dispatch D Day and both Production D-1
  (6-Nov) and D Day read 0 because they are **not loaded yet**, not because nothing happened.
- **5-Nov production grew 35.0 → 76.7 T** (Tapi 41.6 T added).
- **September and October production did not move** in this upload (3764.6 / 3459.7 T) — the
  back-dating seen in the previous four uploads has stopped.
- **Confirmed** (netted, ADR-0014) 5.1 T vs the stored ERP bucket 28.5 T: 23.4 T already invoiced in
  Zoho that the ERP snapshot has not caught up with. Release − invoiced 24.5 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 921.8 T; 208.8 T of ends excluded.
- **Regional BE** is still not shown: November's only distributor estimate is SST STEEL = 0 T.
- **Unmapped** is empty.

## Order-date shift
The whole order book was re-imported at 07:28 UTC. Against yesterday's book, **709 of 2190 lines
(32%) now carry an order date exactly one day earlier**; the other 1471 are unchanged, no line was
added at a different date or removed, and the shifted lines' **expected delivery dates did not
move**. The shift spans every plant (Hyderabad 471, Tapi 141, Lepakshi 58, NPMD 39) and every month
back to April — e.g. SST STEEL 15-Aug → 14-Aug (444 T), PROVACK 5-Nov → 4-Nov (50 T).

Effect on this report:
| Line | As stored now | On yesterday's dating |
|---|---|---|
| Current Month Orders (Nov) | 408.0 T | 408.0 T — no line moved out of November |
| Orders Logged 5-Nov (D-2) | 43.0 T | 159.0 T (116 T moved to 4-Nov) |
| Orders Logged 4-Nov | 167.0 T | 51.0 T |
| Orders Logged 6-Nov / 7-Nov | 25.0 / 28.0 T | cannot tell — new lines, no earlier date to compare |

Likely cause, **not verified**: `toISODate` in `src/lib/calc.js` snaps a parsed date to the nearest
UTC midnight. If today's ERP file carries order dates with a time of day, or was read in a different
timezone, part of the column would round back a day. A stable book that shifts by exactly one day for
a third of its lines points at the import, not at the business. Worth checking the ERP file's date
column and re-uploading; nothing was changed here.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2190 orders, 465 dispatches (1992 entries), 1764
productions, 342 SKUs, 679 coils, 4163 baby coils, 19 distributors, 1 state-region row, 0 plant rows.
Distributor-master regions re-checked: unchanged. Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 296.675 | 296.675 | PASS |
| 1 | Invoiced prev month, 1–7 Oct | 467.910 | 467.910 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 296.675 | 296.675 | PASS |
| 2 | Σ daily orders = Current Month Orders | 408.0 | 408.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 296.675 + 5.052 + 576.355 | 878.082 | PASS |
| 4 | Freshness | orders to 7-Nov, invoices to 6-Nov | production to 5-Nov | D-day 0s = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 296.675 (JS) | 296.675 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 581.407 (JS) | 581.407 app `salesKpis` · 604.8 stored-bucket SQL | PASS vs app (ADR-0014) |
| 7 | Σ plant invoiced = Invoiced MTD | 296.675 | 296.675 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 581.407 | 581.407 app `salesKpis` | PASS vs app (ADR-0014) |
| — | Servable split ties to book | conf 5.052 / unconf 576.355 | book 5.052 / 576.355 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2440.799 (JS) | 2440.799 (SQL) | PASS |
| — | Produced MTD | 269.895 (JS) | 269.895 (SQL) | PASS |
| — | Full Coil Left | 781.218 (JS) | 781.218 (SQL) | PASS |

Advisory:
- **Order-date shift** (above) — every check passes; they test partitions, not dates.
- **Unmapped** 0 · **post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** 0 ·
  productions with no master weight 0.
- **Stored vs live production weight**: +2.1 T.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs last report (6-Nov)
| Line | 6-Nov | 7-Nov | Δ |
|---|---|---|---|
| Invoiced MTD | 221.7 | 296.7 | +75.0 (6-Nov invoices) |
| Produced MTD | 228.3 | 269.9 | +41.6 (Tapi 5-Nov) |
| Confirmed (netted) | 78.1 | 5.1 | −73.0 |
| Non-Confirmed | 523.2 | 576.4 | +53.2 |
| Current Month Orders | 355.0 | 408.0 | +53.0 |
| Servable – Unconfirmed | 166.5 | 197.0 | +30.5 |
| Pending to Dispatch | 244.6 | 202.1 | −42.5 |
| Physical Inventory | 2474.1 | 2440.8 | −33.3 (= +41.6 made − 75.0 invoiced) |
| RM Total | 1657.7 | 1703.1 | +45.4 (+87.2 three Tapi coils received, rest consumed) |

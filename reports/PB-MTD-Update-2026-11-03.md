# JSW Pipes & Tubes — PB MTD Update (2026-11-03)

Live Supabase data (`hztblmccvvarmgxmunrp`) as of 05:01 UTC, 3-Nov. Targets: the user said "same
target", so September's again — Best Estimate **5550 T** (September's 17 distributor estimates,
re-checked line for line against the database and carried to November in memory; no October or
November estimates exist and none were written) and Production **5000 T**.

> ⚠️ **No November data is loaded.** The latest order, invoice and production dates are all
> **31-Oct**. Invoices were last uploaded 31-Oct 17:26 UTC; the order book was re-uploaded 3-Nov
> 05:00 UTC but contains no line dated in November; production rows entered 2-Nov are all dated
> 30/31-Oct. Every November flow below therefore reads 0 because it is **not loaded**, not because
> nothing happened. Stock and open-book figures (Confirmed, Servable, Inventory, RM) are current.

```
PB MTD update as on --->	2026-11-03
Revised Best Estimate --->	5550.0T
Total Orders --->	578.9T
Current Month Orders --->	0T
Invoiced Orders MTD --->	0T
Invoiced MTD (Previous Month) --->	210.1T
Dispatch D-1 (Current Month) --->	0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	79.1T
Non-Confirmed Orders --->	499.8T
Daily Run Rate Required --->	198.2T
Physical Inventory --->	2279T
RM Full Coil Left --->	852.6T
RM Baby Coil Left --->	1114.2T
RM Total --->	1966.8T
	
Invoiced MTD - South --->	0T
Invoiced MTD - West --->	0T
Invoiced MTD - All Regions --->	0T
	
Pending to Serve - South --->	286.9T
Pending to Serve - West --->	291.9T
Pending to Serve - All Regions --->	578.9T
	
Invoiced MTD by Plant - All Plants --->	0T
	
Pending to Serve by Plant - Hyderabad --->	84.2T
Pending to Serve by Plant - NPMD --->	174.4T
Pending to Serve by Plant - Lepakshi --->	239.1T
Pending to Serve by Plant - Tapi --->	81.1T
Pending to Serve by Plant - All Plants --->	578.9T
	
Produced MTD --->	0T
Produced MTD (Previous Month) --->	242.4T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	0T
Orders Logged D-2 --->	0T
```

Notes:
- **Run rates** use 28 days left (30 − 3 + 1). Invoicing 5550 ÷ 28 = 198.2 T/day; production
  5000 ÷ 28 = 178.6 T/day.
- **Previous month same days** = 1–3 Oct: invoiced 210.1 T, produced 242.4 T.
- **Confirmed** (netted, ADR-0014) 79.1 T equals the stored ERP bucket today; release − invoiced 48.4 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 1114.2 T; 201.7 T of ends excluded.
- **Invoicing label**: with no November invoices, `plantSplit.invoicing` returns the suffix
  "· Hyderabad, NPMD, Lepakshi, Tapi" and a note saying "the other plants carry orders but have never
  invoiced" — an edge case of the builder when nothing has been invoiced in the month (it names every
  plant as both invoicing and not invoicing). It carries no information at 0 T, so it is left off.
  Not fixed here.
- **Region overrides added 2-Nov**: the distributor master now carries HISSARIA STEEL → West and
  ARIHANT STEEL POINT PRIVATE LIMITED (name key) → West. **Unmapped is empty** for the first time this
  week; the GOA gap is closed.

## October final (revised after late production entries)
| | October final | Reported 31-Oct | Target | Achieved |
|---|---|---|---|---|
| Invoiced | 3027.4 T | 3027.4 T | 5550 T | 55% |
| Produced | **3369.2 T** | 3186.3 T | 5000 T | **67%** |

Production rows entered on 2-Nov added 30/31-Oct output: Lepakshi 430.0 → 573.0 T (+143.0),
Hyderabad 767.0 → 806.9 T (+39.9). NPMD 691.5 and Tapi 1297.8 unchanged. Against September
(3664.1 T) October production finishes −294.9 T (−8.0%), not −13% as reported on 31-Oct.
Invoicing by plant, October: Hyderabad 1006.9 · NPMD 330.3 · Lepakshi 687.8 · Tapi 1002.4.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2113 orders, 453 dispatches (1938 entries), 1714
productions, 335 SKUs, 674 coils, 4099 baby coils, 19 distributors, 1 state-region row, 0 plant rows.
Masters re-pulled from the database (two new distributor rows). Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 0 | 0 | PASS |
| 1 | Invoiced prev month, 1–3 Oct | 210.100 | 210.100 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 0 | 0 | PASS |
| 2 | Σ daily orders = Current Month Orders | 0 | 0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 0 + 79.084 + 499.779 | 578.863 | PASS |
| 4 | Freshness | max order / dispatch / production all 31-Oct | report day 3-Nov | **November not loaded** |
| 5 | Σ region invoiced = Invoiced MTD | 0 (JS) | 0 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 578.863 (JS) | 578.863 (SQL, stored = netted today) | PASS |
| 7 | Σ plant invoiced = Invoiced MTD | 0 | 0 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 578.863 | 578.863 | PASS |
| — | Servable split ties to book | conf 79.084 / unconf 499.779 | book 79.084 / 499.779 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2278.806 (JS) | 2278.806 (SQL) | PASS |
| — | Full Coil Left | 852.585 (JS) | 852.585 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Unmapped** 0 · **post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** 0.
- **Stored vs live production weight**: +2.1 T.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs last report (31-Oct 17:26)
| Line | 31-Oct | 3-Nov | Δ |
|---|---|---|---|
| Confirmed (netted) | 108.9 | 79.1 | −29.8 |
| Non-Confirmed | 496.8 | 499.8 | +3.0 |
| Servable – Unconfirmed | 191.3 | 205.9 | +14.6 |
| Pending to Dispatch | 299.1 | 284.9 | −14.2 |
| Physical Inventory | 2093.8 | 2278.8 | +185.0 (late production entries; 182.9 T of it dated October) |
| RM Total | 2135.1 | 1966.8 | −168.3 (consumed by that production, net of 4 coils received) |

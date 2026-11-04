# JSW Pipes & Tubes — PB MTD Update (2026-11-04)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **05:14 UTC upload** of 4-Nov. Orders and
invoices run to 3-Nov; production to 2-Nov. Targets: "same target" — Best Estimate **5550 T**
(September's 17 distributor estimates, re-checked against the database and carried to November in
memory; no October or November estimates exist and none were written) and Production **5000 T**.

```
PB MTD update as on --->	2026-11-04
Revised Best Estimate --->	5550.0T
Total Orders --->	751.5T
Current Month Orders --->	170.0T
Invoiced Orders MTD · Hyderabad only --->	28.7T
Invoiced MTD (Previous Month) --->	268.4T
Dispatch D-1 (Current Month) --->	28.7T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	138.0T
Non-Confirmed Orders --->	584.8T
Daily Run Rate Required --->	204.5T
Physical Inventory --->	2337T
RM Full Coil Left --->	785.3T
RM Baby Coil Left --->	1095.8T
RM Total --->	1881.1T
	
Invoiced MTD · Hyderabad only - South --->	0T
Invoiced MTD · Hyderabad only - West --->	28.7T
Invoiced MTD · Hyderabad only - All Regions --->	28.7T
	
Pending to Serve - South --->	366.9T
Pending to Serve - West --->	355.8T
Pending to Serve - All Regions --->	722.8T
	
Invoiced MTD by Plant · Hyderabad only - Hyderabad --->	28.7T
Invoiced MTD by Plant · Hyderabad only - All Plants --->	28.7T
(November invoicing so far is Hyderabad's only; NPMD, Lepakshi and Tapi carry orders but have not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	113.1T
Pending to Serve by Plant - NPMD --->	234.4T
Pending to Serve by Plant - Lepakshi --->	264.1T
Pending to Serve by Plant - Tapi --->	111.1T
Pending to Serve by Plant - All Plants --->	722.8T
	
Produced MTD --->	19.9T
Produced MTD (Previous Month) --->	313.8T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	170.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Run rates** use 27 days left (30 − 4 + 1). Invoicing (5550 − 28.7) ÷ 27 = 204.5 T/day;
  production (5000 − 19.9) ÷ 27 = 184.4 T/day.
- **Previous month same days** = 1–4 Oct: invoiced 268.4 T, produced 313.8 T.
- **Freshness**: invoices and orders run to 3-Nov, production to 2-Nov. Dispatch D Day, Orders Logged
  D Day and Production D-1 / D Day are "not loaded yet". The first November data arrived today:
  3-Nov invoices (28.7 T, all KHAN STEEL CENTRE, Hyderabad), 3-Nov orders (170 T), and Hyderabad
  production for 1-Nov (7.2 T) and 2-Nov (12.6 T). No orders or invoices are dated 1–2 Nov.
- **Invoicing label**: `plantSplit.invoicing.suffix` is "· Hyderabad only" — true for November so
  far. The builder's own note says the other plants "have never invoiced"; they invoiced in October,
  so the note above is reworded to "this month".
- **Confirmed** (netted, ADR-0014) 138.0 T equals the stored ERP bucket; release − invoiced 104.7 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 1095.8 T; 203.3 T of ends excluded.
- **Unmapped** is empty; the region overrides added 2-Nov hold.

## Back-dated production in this upload
Production entered today revised two closed months: **September 3666.3 → 3710.3 T (+44.0)** and
**October 3369.2 → 3392.0 T (+22.8)** — Hyderabad October +25.5 T at earlier October dates, and
Lepakshi's 31-Oct entry cut 57.4 → 38.4 T with +16.2 T added elsewhere in October. October final
is now **3392.0 T, 68% of the 5000 T target**. Physical Inventory rises +58.0 T for the same reason:
+44.0 (Sep) + 22.8 (Oct) + 19.9 (Nov) − 28.7 invoiced.

October final by plant: Hyderabad 832.4 · NPMD 691.5 · Lepakshi 570.2 · Tapi 1297.8 (produced);
Hyderabad 1006.9 · NPMD 330.3 · Lepakshi 687.8 · Tapi 1002.4 (invoiced, 3027.4 T, 55% of BE).

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2148 orders, 454 dispatches (1944 entries), 1731
productions, 335 SKUs, 674 coils, 4119 baby coils, 19 distributors, 1 state-region row, 0 plant rows.
Masters and September estimates re-checked against the database: unchanged. Exit code 0: every
tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 28.725 | 28.725 | PASS |
| 1 | Invoiced prev month, 1–4 Oct | 268.390 | 268.390 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 28.725 | 28.725 | PASS |
| 2 | Σ daily orders = Current Month Orders | 170.0 | 170.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 28.725 + 137.984 + 584.779 | 751.488 | PASS |
| 4 | Freshness | orders / invoices to 3-Nov | production to 2-Nov | D-day 0s = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 28.725 (JS) | 28.725 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 722.763 (JS) | 722.763 (SQL; stored = netted) | PASS |
| 7 | Σ plant invoiced = Invoiced MTD | 28.725 | 28.725 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 722.763 | 722.763 | PASS |
| — | Servable split ties to book | conf 137.984 / unconf 584.779 | book 137.984 / 584.779 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2336.729 (JS) | 2336.729 (SQL) | PASS |
| — | Produced MTD | 19.879 (JS) | 19.879 (SQL) | PASS |
| — | Full Coil Left | 785.335 (JS) | 785.335 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Back-dated production** into September and October (above).
- **Unmapped** 0 · **post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** 0.
- **Stored vs live production weight**: +2.1 T.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs last report (3-Nov)
| Line | 3-Nov | 4-Nov | Δ |
|---|---|---|---|
| Invoiced MTD | 0 | 28.7 | +28.7 (first November invoices) |
| Current Month Orders | 0 | 170.0 | +170.0 |
| Produced MTD | 0 | 19.9 | +19.9 |
| Confirmed (netted) | 79.1 | 138.0 | +58.9 |
| Non-Confirmed | 499.8 | 584.8 | +85.0 |
| Servable – Unconfirmed | 205.9 | 208.3 | +2.4 |
| Pending to Dispatch | 284.9 | 346.3 | +61.3 |
| Physical Inventory | 2278.8 | 2336.7 | +57.9 (see back-dated production) |
| RM Total | 1966.8 | 1881.1 | −85.6 |

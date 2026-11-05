# JSW Pipes & Tubes — PB MTD Update (2026-11-05)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **12:27 UTC upload** of 5-Nov (today's
invoices are in). Orders and invoices run to 5-Nov; production to 4-Nov. Targets: **Best Estimate
4000 T for November** (set by the user 5-Nov) and **Production 5000 T**.

```
PB MTD update as on --->	2026-11-05
Revised Best Estimate --->	4000.0T
Total Orders --->	798.6T
Current Month Orders --->	355.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	179.3T
Invoiced MTD (Previous Month) --->	268.4T
Dispatch D-1 (Current Month) --->	81.0T
Dispatch D Day --->	69.6T
Confirmed Orders Pending to be Invoiced --->	96.1T
Non-Confirmed Orders --->	523.2T
Daily Run Rate Required --->	146.9T
Physical Inventory --->	2402T
RM Full Coil Left --->	791.3T
RM Baby Coil Left --->	982.7T
RM Total --->	1774.0T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	150.6T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	28.7T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	179.3T
	
Pending to Serve - South --->	264.1T
Pending to Serve - West --->	355.1T
Pending to Serve - All Regions --->	619.3T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	105.8T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	43.3T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	30.1T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	179.3T
(NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	63.8T
Pending to Serve by Plant - NPMD --->	230.0T
Pending to Serve by Plant - Lepakshi --->	213.1T
Pending to Serve by Plant - Tapi --->	112.3T
Pending to Serve by Plant - All Plants --->	619.3T
	
Produced MTD --->	193.2T
Produced MTD (Previous Month) --->	521.1T
Production D-1 --->	75.8T
Production D Day --->	0T
	
Orders Logged D Day --->	159.0T
Orders Logged D-1 --->	51.0T
Orders Logged D-2 --->	145.0T
```

Notes:
- **Run rates** use 26 days left (30 − 5 + 1). Invoicing (4000 − 179.3) ÷ 26 = 146.9 T/day;
  production (5000 − 193.2) ÷ 26 = 184.9 T/day.
- **Previous month same days** = 1–5 Oct: invoiced 268.4 T, produced 521.1 T (was 515.8 this
  morning — October was back-dated again, below).
- **Production D-1 (4-Nov)** = Hyderabad 16.9 + Lepakshi 20.9 + Tapi 38.0 = 75.8 T. NPMD has no
  November production. Production D Day = 0 means "not loaded yet".
- **Confirmed** (netted, ADR-0014) 96.1 T equals the stored ERP bucket; release − invoiced 91.4 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 982.7 T; 206.3 T of ends excluded.
- **Unmapped** is empty.

## Regional Best Estimate — not shown
Unchanged from this morning: November's distributor estimates hold one row (SST STEEL CORPORATION =
0 T), which cannot support the 4000 T headline, so *Invoiced by Region* prints the Invoiced column
only. Enter November estimates per distributor on the Sales tab (summing to 4000) to restore BE and %.

## Back-dated production (again)
This upload added production to closed months: **September 3710.3 → 3731.8 T (+21.6)** and
**October 3392.0 → 3413.1 T (+21.1)**. October final is now **3413.1 T, 68% of target**. Three
uploads in a row have back-dated production; the October figure has moved 3186.3 → 3369.2 → 3392.0
→ 3413.1 T since month-end.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2180 orders, 460 dispatches (1971 entries), 1751
productions, 337 SKUs, 676 coils, 4136 baby coils, 19 distributors, 1 state-region row, 0 plant rows.
Distributor-master regions re-checked: unchanged. Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 179.305 | 179.305 | PASS |
| 1 | Invoiced prev month, 1–5 Oct | 268.390 | 268.390 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 179.305 | 179.305 | PASS |
| 2 | Σ daily orders = Current Month Orders | 355.0 | 355.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 179.305 + 96.050 + 523.205 | 798.560 | PASS |
| 4 | Freshness | orders / invoices to 5-Nov | production to 4-Nov | Production D-day 0 = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 179.305 (JS) | 179.305 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 619.255 (JS) | 619.255 (SQL; stored = netted) | PASS |
| 7 | Σ plant invoiced = Invoiced MTD | 179.305 | 179.305 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 619.255 | 619.255 | PASS |
| — | Servable split ties to book | conf 96.050 / unconf 523.205 | book 96.050 / 523.205 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2402.133 (JS) | 2402.133 (SQL) | PASS |
| — | Produced MTD | 193.231 (JS) | 193.231 (SQL) | PASS |
| — | Full Coil Left | 791.310 (JS) | 791.310 (SQL) | PASS |

Advisory:
- **Regional BE unavailable**; **back-dated production** (above).
- **Unmapped** 0 · **post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** 0 ·
  productions with no master weight 0.
- **Stored vs live production weight**: +2.1 T.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs this morning's report (5-Nov, 07:01 upload)
| Line | Morning | Now | Δ |
|---|---|---|---|
| Invoiced MTD | 136.0 | 179.3 | +43.3 (more 5-Nov invoices; Lepakshi's first) |
| Dispatch D Day | 26.3 | 69.6 | +43.3 |
| Produced MTD | 155.2 | 193.2 | +38.0 (Tapi 4-Nov) |
| Confirmed (netted) | 161.8 | 96.1 | −65.8 |
| Non-Confirmed | 584.3 | 523.2 | −61.1 |
| Current Month Orders | 312.0 | 355.0 | +43.0 |
| Servable – Unconfirmed | 208.6 | 163.7 | −44.9 |
| Pending to Dispatch | 370.5 | 259.8 | −110.7 |
| Physical Inventory | 2364.8 | 2402.1 | +37.3 (+38.0 Nov, +42.7 back-dated Sep/Oct, −43.3 invoiced) |
| RM Total | 1676.1 | 1774.0 | +97.9 (+179.1 six Tapi coils received, rest consumed) |

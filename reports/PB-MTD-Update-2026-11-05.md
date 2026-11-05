# JSW Pipes & Tubes — PB MTD Update (2026-11-05)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **07:01 UTC upload** of 5-Nov. Orders and
invoices run to 5-Nov; production to 4-Nov. Targets: **Best Estimate 4000 T for November** (set by
the user today, "from now" — replaces the 5550 T carried from September) and **Production 5000 T**
(unchanged).

```
PB MTD update as on --->	2026-11-05
Revised Best Estimate --->	4000.0T
Total Orders --->	882.1T
Current Month Orders --->	312.0T
Invoiced Orders MTD · Hyderabad, Tapi --->	136.0T
Invoiced MTD (Previous Month) --->	268.4T
Dispatch D-1 (Current Month) --->	81.0T
Dispatch D Day --->	26.3T
Confirmed Orders Pending to be Invoiced --->	161.8T
Non-Confirmed Orders --->	584.3T
Daily Run Rate Required --->	148.6T
Physical Inventory --->	2365T
RM Full Coil Left --->	642.8T
RM Baby Coil Left --->	1033.4T
RM Total --->	1676.1T
	
Invoiced MTD · Hyderabad, Tapi - South --->	107.2T
Invoiced MTD · Hyderabad, Tapi - West --->	28.7T
Invoiced MTD · Hyderabad, Tapi - All Regions --->	136.0T
	
Pending to Serve - South --->	352.9T
Pending to Serve - West --->	393.2T
Pending to Serve - All Regions --->	746.1T
	
Invoiced MTD by Plant · Hyderabad, Tapi - Hyderabad --->	105.8T
Invoiced MTD by Plant · Hyderabad, Tapi - Tapi --->	30.1T
Invoiced MTD by Plant · Hyderabad, Tapi - All Plants --->	136.0T
(November invoicing so far is Hyderabad's and Tapi's; NPMD and Lepakshi carry orders but have not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	85.9T
Pending to Serve by Plant - NPMD --->	234.4T
Pending to Serve by Plant - Lepakshi --->	301.8T
Pending to Serve by Plant - Tapi --->	123.9T
Pending to Serve by Plant - All Plants --->	746.1T
	
Produced MTD --->	155.2T
Produced MTD (Previous Month) --->	515.8T
Production D-1 --->	37.8T
Production D Day --->	0T
	
Orders Logged D Day --->	116.0T
Orders Logged D-1 --->	51.0T
Orders Logged D-2 --->	145.0T
```

Notes:
- **Run rates** use 26 days left (30 − 5 + 1). Invoicing (4000 − 136.0) ÷ 26 = 148.6 T/day;
  production (5000 − 155.2) ÷ 26 = 186.3 T/day.
- **Previous month same days** = 1–5 Oct: invoiced 268.4 T (no invoices on 5-Oct), produced 515.8 T.
- **Production D-1 (4-Nov)** = Hyderabad 16.9 + Lepakshi 20.9 = 37.8 T. Tapi has no 4-Nov rows and
  NPMD has no November production at all. Production D Day = 0 means "not loaded yet".
- **4-Nov invoicing grew 55.8 → 81.0 T** in this upload (more 4-Nov invoices loaded).
- **Confirmed** (netted, ADR-0014) 161.8 T equals the stored ERP bucket; release − invoiced 126.3 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 1033.4 T; 205.5 T of ends excluded.
- **Unmapped** is empty.

## Regional Best Estimate — not shown
The skill's BE column is Σ the distributor master's `plan` for the month, never a split of the
headline invented by the report. For November the distributor estimates hold **one row: SST STEEL
CORPORATION = 0 T** (entered 4-Nov 13:12 UTC), so they cannot support a 4000 T headline, and
September's estimates (5550 T) no longer match the target. *Invoiced by Region* therefore prints the
Invoiced column only. Enter November estimates per distributor on the Sales tab (summing to 4000) and
the BE and % columns come back automatically.

Two estimate rows look like accidental edits and are worth checking on the Sales tab:
- **2026-11, SST STEEL CORPORATION = 0** — a plan of zero for the South's largest distributor.
- **2026-09, NEW MAHARASHTRA STEEL AND TIMBERS = 0.007** (entered 4-Nov 13:53 UTC) — September's
  total now reads 5550.007.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2173 orders, 458 dispatches (1965 entries), 1742
productions, 336 SKUs, 670 coils, 4133 baby coils, 19 distributors, 1 state-region row, 0 plant rows.
Distributor-master regions re-checked: unchanged. Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 135.965 | 135.965 | PASS |
| 1 | Invoiced prev month, 1–5 Oct | 268.390 | 268.390 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 135.965 | 135.965 | PASS |
| 2 | Σ daily orders = Current Month Orders | 312.0 | 312.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 135.965 + 161.844 + 584.269 | 882.078 | PASS |
| 4 | Freshness | orders / invoices to 5-Nov | production to 4-Nov | Production D-day 0 = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 135.965 (JS) | 135.965 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 746.113 (JS) | 746.113 (SQL; stored = netted) | PASS |
| 7 | Σ plant invoiced = Invoiced MTD | 135.965 | 135.965 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 746.113 | 746.113 | PASS |
| — | Servable split ties to book | conf 161.844 / unconf 584.269 | book 161.844 / 584.269 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2364.835 (JS) | 2364.835 (SQL) | PASS |
| — | Produced MTD | 155.226 (JS) | 155.226 (SQL) | PASS |
| — | Full Coil Left | 642.765 (JS) | 642.765 (SQL) | PASS |

Advisory:
- **Regional BE unavailable** and **two stray estimate rows** (above).
- **Unmapped** 0 · **post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** 0 ·
  productions with no master weight 0.
- **Stored vs live production weight**: +2.1 T.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs last report (4-Nov, 12:36 upload)
| Line | 4-Nov | 5-Nov | Δ |
|---|---|---|---|
| Best Estimate | 5550 | 4000 | −1550 (user-set) |
| Invoiced MTD | 84.6 | 136.0 | +51.4 (4-Nov +25.1, 5-Nov 26.3) |
| Produced MTD | 117.4 | 155.2 | +37.8 (4-Nov) |
| Confirmed (netted) | 134.0 | 161.8 | +27.9 |
| Non-Confirmed | 559.8 | 584.3 | +24.4 |
| Current Month Orders | 196.0 | 312.0 | +116.0 |
| Servable – Unconfirmed | 188.8 | 208.6 | +19.9 |
| Pending to Dispatch | 322.8 | 370.5 | +47.7 |
| Physical Inventory | 2378.4 | 2364.8 | −13.6 (= +37.8 made − 51.4 invoiced) |
| RM Total | 1674.6 | 1676.1 | +1.6 (+39.4 two Hyderabad coils received, rest consumed) |

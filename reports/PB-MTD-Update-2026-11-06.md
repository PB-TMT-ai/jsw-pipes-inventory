# JSW Pipes & Tubes — PB MTD Update (2026-11-06)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **04:50 UTC upload** of 6-Nov. Orders,
invoices and production all run to **5-Nov**; nothing dated 6-Nov is loaded yet. Targets: **Best
Estimate 4000 T** (November, set by the user 5-Nov) and **Production 5000 T**.

```
PB MTD update as on --->	2026-11-06
Revised Best Estimate --->	4000.0T
Total Orders --->	823.0T
Current Month Orders --->	355.0T
Invoiced Orders MTD · Hyderabad, Lepakshi, Tapi --->	221.7T
Invoiced MTD (Previous Month) --->	353.5T
Dispatch D-1 (Current Month) --->	112.0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	78.1T
Non-Confirmed Orders --->	523.2T
Daily Run Rate Required --->	151.1T
Physical Inventory --->	2474T
RM Full Coil Left --->	751.9T
RM Baby Coil Left --->	905.7T
RM Total --->	1657.7T
	
Invoiced MTD · Hyderabad, Lepakshi, Tapi - South --->	193.0T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - West --->	28.7T
Invoiced MTD · Hyderabad, Lepakshi, Tapi - All Regions --->	221.7T
	
Pending to Serve - South --->	246.1T
Pending to Serve - West --->	355.1T
Pending to Serve - All Regions --->	601.3T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Hyderabad --->	123.9T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Lepakshi --->	67.7T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - Tapi --->	30.1T
Invoiced MTD by Plant · Hyderabad, Lepakshi, Tapi - All Plants --->	221.7T
(NPMD carries orders but has not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	45.8T
Pending to Serve by Plant - NPMD --->	230.0T
Pending to Serve by Plant - Lepakshi --->	213.1T
Pending to Serve by Plant - Tapi --->	112.3T
Pending to Serve by Plant - All Plants --->	601.3T
	
Produced MTD --->	228.3T
Produced MTD (Previous Month) --->	786.8T
Production D-1 --->	35.0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	159.0T
Orders Logged D-2 --->	51.0T
```

Notes:
- **Run rates** use 25 days left (30 − 6 + 1). Invoicing (4000 − 221.7) ÷ 25 = 151.1 T/day;
  production (5000 − 228.3) ÷ 25 = 190.9 T/day.
- **Previous month same days** = 1–6 Oct: invoiced 353.5 T, produced 786.8 T (5 and 6 Oct were
  big production days — 207.3 and 265.7 T; unchanged since yesterday, not a revision).
- **Freshness**: everything runs to 5-Nov. Dispatch D Day, Orders Logged D Day and Production D Day
  read 0 because 6-Nov is not loaded yet.
- **Production D-1 (5-Nov)** = Hyderabad 35.0 T only; Lepakshi and Tapi have no 5-Nov rows yet, and
  NPMD has no November production at all.
- **5-Nov invoicing grew 69.6 → 112.0 T** in this upload (more 5-Nov invoices loaded).
- **Confirmed** (netted, ADR-0014) 78.1 T equals the stored ERP bucket; release − invoiced 73.3 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 905.7 T; 208.6 T of ends excluded.
- **Unmapped** is empty.

## Regional Best Estimate — not shown
Unchanged: November's distributor estimates still hold only SST STEEL CORPORATION = 0 T, which cannot
support the 4000 T headline, so *Invoiced by Region* prints the Invoiced column only.

## Back-dated production (fourth upload running)
This upload again added production to closed months: **September 3731.8 → 3764.6 T (+32.8)** and
**October 3413.1 → 3459.7 T (+46.6)**. October final is now **3459.7 T, 69% of target** — it has moved
3186.3 → 3369.2 → 3392.0 → 3413.1 → 3459.7 T since month-end. The +79.4 T also lifts Physical
Inventory (and, consumed from coils, lowers RM) without any November activity behind it.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2180 orders, 462 dispatches (1977 entries), 1763
productions, 337 SKUs, 676 coils, 4153 baby coils, 19 distributors, 1 state-region row, 0 plant rows.
Distributor-master regions re-checked: unchanged. Exit code 0: every tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 221.715 | 221.715 | PASS |
| 1 | Invoiced prev month, 1–6 Oct | 353.500 | 353.500 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 221.715 | 221.715 | PASS |
| 2 | Σ daily orders = Current Month Orders | 355.0 | 355.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 221.715 + 78.050 + 523.205 | 822.970 | PASS |
| 4 | Freshness | orders / invoices / production to 5-Nov | report day 6-Nov | D-day 0s = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 221.715 (JS) | 221.715 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 601.255 (JS) | 601.255 (SQL; stored = netted) | PASS |
| 7 | Σ plant invoiced = Invoiced MTD | 221.715 | 221.715 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 601.255 | 601.255 | PASS |
| — | Servable split ties to book | conf 78.050 / unconf 523.205 | book 78.050 / 523.205 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2474.126 (JS) | 2474.126 (SQL) | PASS |
| — | Produced MTD | 228.263 (JS) | 228.263 (SQL) | PASS |
| — | Full Coil Left | 751.940 (JS) | 751.940 (SQL) | PASS |

Advisory:
- **Regional BE unavailable**; **back-dated production** (above).
- **Unmapped** 0 · **post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** 0 ·
  productions with no master weight 0.
- **Stored vs live production weight**: +2.1 T.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs last report (5-Nov, 12:27 upload)
| Line | 5-Nov | 6-Nov | Δ |
|---|---|---|---|
| Invoiced MTD | 179.3 | 221.7 | +42.4 (more 5-Nov invoices) |
| Produced MTD | 193.2 | 228.3 | +35.0 (Hyderabad 5-Nov) |
| Confirmed (netted) | 96.1 | 78.1 | −18.0 |
| Non-Confirmed | 523.2 | 523.2 | 0 |
| Current Month Orders | 355.0 | 355.0 | 0 |
| Servable – Unconfirmed | 163.7 | 166.5 | +2.8 |
| Pending to Dispatch | 259.8 | 244.6 | −15.2 |
| Physical Inventory | 2402.1 | 2474.1 | +72.0 (+35.0 Nov, +79.4 back-dated Sep/Oct, −42.4 invoiced) |
| RM Total | 1774.0 | 1657.7 | −116.3 (consumed by that production; no coils received) |

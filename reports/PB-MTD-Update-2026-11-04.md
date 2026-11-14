# JSW Pipes & Tubes — PB MTD Update (2026-11-04)

Live Supabase data (`hztblmccvvarmgxmunrp`), after the **12:36 UTC upload** of 4-Nov (today's
invoices are in). Orders and invoices run to 4-Nov; production to 3-Nov. Targets: "same target" —
Best Estimate **5550 T** (September's 17 distributor estimates, re-checked against the database and
carried to November in memory; no October or November estimates exist and none were written) and
Production **5000 T**.

> ⚠️ **Eight Tapi coils (162.4 T) were removed from the coil register today.** Tapi RM reads lower
> for that reason. See "Removed coils" below.

```
PB MTD update as on --->	2026-11-04
Revised Best Estimate --->	5550.0T
Total Orders --->	778.4T
Current Month Orders --->	196.0T
Invoiced Orders MTD · Hyderabad, Tapi --->	84.6T
Invoiced MTD (Previous Month) --->	268.4T
Dispatch D-1 (Current Month) --->	28.7T
Dispatch D Day --->	55.8T
Confirmed Orders Pending to be Invoiced --->	134.0T
Non-Confirmed Orders --->	559.8T
Daily Run Rate Required --->	202.4T
Physical Inventory --->	2378T
RM Full Coil Left --->	622.9T
RM Baby Coil Left --->	1051.7T
RM Total --->	1674.6T
	
Invoiced MTD · Hyderabad, Tapi - South --->	55.8T
Invoiced MTD · Hyderabad, Tapi - West --->	28.7T
Invoiced MTD · Hyderabad, Tapi - All Regions --->	84.6T
	
Pending to Serve - South --->	338.0T
Pending to Serve - West --->	355.8T
Pending to Serve - All Regions --->	693.8T
	
Invoiced MTD by Plant · Hyderabad, Tapi - Hyderabad --->	54.4T
Invoiced MTD by Plant · Hyderabad, Tapi - Tapi --->	30.1T
Invoiced MTD by Plant · Hyderabad, Tapi - All Plants --->	84.6T
(November invoicing so far is Hyderabad's and Tapi's; NPMD and Lepakshi carry orders but have not invoiced this month. Pending is every plant's, so the two are not like for like.)
	
Pending to Serve by Plant - Hyderabad --->	139.2T
Pending to Serve by Plant - NPMD --->	234.4T
Pending to Serve by Plant - Lepakshi --->	239.1T
Pending to Serve by Plant - Tapi --->	81.1T
Pending to Serve by Plant - All Plants --->	693.8T
	
Produced MTD --->	117.4T
Produced MTD (Previous Month) --->	313.8T
Production D-1 --->	78.5T
Production D Day --->	0T
	
Orders Logged D Day --->	51.0T
Orders Logged D-1 --->	145.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Run rates** use 27 days left (30 − 4 + 1). Invoicing (5550 − 84.6) ÷ 27 = 202.4 T/day;
  production (5000 − 117.4) ÷ 27 = 180.8 T/day.
- **Previous month same days** = 1–4 Oct: invoiced 268.4 T, produced 313.8 T.
- **Production D-1 (3-Nov)** = Hyderabad 30.7 + Lepakshi 20.1 + Tapi 27.7 = 78.5 T. Production D Day
  = 0 means "not loaded yet" (production runs to 3-Nov). NPMD has no November production yet.
- **Hyderabad 2-Nov production revised 12.6 → 31.7 T** in this upload.
- **Orders logged 3-Nov revised 170 → 145 T** (order book re-uploaded).
- **Invoicing label**: `plantSplit.invoicing.suffix` is "· Hyderabad, Tapi" — true for November so far.
- **Confirmed** (netted, ADR-0014) 134.0 T equals the stored ERP bucket; release − invoiced 99.8 T.
- **RM Baby Coil Left** is the Dashboard's figure (ADR-0007): 1051.7 T; 205.5 T of ends excluded.
- **Unmapped** is empty.

## Removed coils
Compared with this morning's data, these Tapi mother coils are **no longer in `coils` at all** (not
soft-deleted — there are no `deleted = true` rows):

TAP-0926-96 (19.94) · TAP-0926-103 (20.40) · TAP-0926-108 (20.31) · TAP-0926-109 (20.35) ·
TAP-0926-110 (20.33) · TAP-0926-111 (20.37) · TAP-1026-112 (20.35) · TAP-1026-117 (20.41) = **162.4 T**.

None had been slit into baby coils and none is referenced by any production or dispatch allocation,
so no downstream figure breaks — they simply leave RM Full Coil Left. Two new Tapi coils arrived
(TAP-1126-132 30.7 T, TAP-1126-133 24.9 T), both already slit. Tapi now holds **no unslit coil**.
This is either a correction of coils that were never really received, or a deletion outside the app's
soft-delete rule; the data cannot tell which. Worth confirming with the Tapi team.

## How the splits were run
`scripts/daily-splits.mjs` cannot reach Supabase from this session (agent proxy 403 on
`*.supabase.co`). Raw rows were pulled through the Supabase MCP (non-deleted, ordered
`created_at, id`, orders with **all** columns, as `db.js` fetches them) and fed to the script
with `--in`. Row counts matched the database: 2153 orders, 456 dispatches (1956 entries), 1739
productions, 336 SKUs, 668 coils, 4127 baby coils, 19 distributors, 1 state-region row, 0 plant rows.
Masters and September estimates re-checked against the database: unchanged. Exit code 0: every
tie-out passed.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (line sum vs theoretical_weight) | 84.555 | 84.555 | PASS |
| 1 | Invoiced prev month, 1–4 Oct | 268.390 | 268.390 | PASS |
| 2 | Σ daily dispatch = Invoiced MTD | 84.555 | 84.555 | PASS |
| 2 | Σ daily orders = Current Month Orders | 196.0 | 196.0 | PASS |
| 3 | Total Orders = Inv + Conf + Non-conf | 84.555 + 133.984 + 559.839 | 778.378 | PASS |
| 4 | Freshness | orders / invoices to 4-Nov | production to 3-Nov | Production D-day 0 = not loaded |
| 5 | Σ region invoiced = Invoiced MTD | 84.555 (JS) | 84.555 (SQL) | PASS |
| 6 | Σ region pending = Conf + Non-conf | 693.823 (JS) | 693.823 (SQL; stored = netted) | PASS |
| 7 | Σ plant invoiced = Invoiced MTD | 84.555 | 84.555 | PASS |
| 8 | Σ plant pending = Conf + Non-conf | 693.823 | 693.823 | PASS |
| — | Servable split ties to book | conf 133.984 / unconf 559.839 | book 133.984 / 559.839 | PASS |
| — | Plant pipeline ties (produced, FG, RM, movement) | all true | — | PASS |
| — | FG = produced (live) − invoiced | 2378.438 (JS) | 2378.438 (SQL) | PASS |
| — | Produced MTD | 117.418 (JS) | 117.418 (SQL) | PASS |
| — | Full Coil Left | 622.890 (JS) | 622.890 (SQL) | PASS |
| — | Regional BE ties to headline | 2350 + 3200 | 5550 | PASS |

Advisory:
- **Removed coils** (above).
- **Unmapped** 0 · **post-D dispatch** 0 · **multi-state distributors** 0 · **Unattributed** 0 ·
  productions with no master weight 0.
- **Stored vs live production weight**: +2.1 T.
- **Script defect (still open)**: `scripts/daily-splits.mjs` `ORDER_COLS` omits `invoiced_qty` and
  the SKU fields; this report uses full order rows, which reproduce the app.

## Change vs this morning's report (4-Nov, 05:14 upload)
| Line | Morning | Now | Δ |
|---|---|---|---|
| Invoiced MTD | 28.7 | 84.6 | +55.8 (today's invoices) |
| Produced MTD | 19.9 | 117.4 | +97.5 (3-Nov 78.5; Hyderabad 2-Nov +19.1) |
| Confirmed (netted) | 138.0 | 134.0 | −4.0 |
| Non-Confirmed | 584.8 | 559.8 | −24.9 |
| Current Month Orders | 170.0 | 196.0 | +26.0 |
| Servable – Unconfirmed | 208.3 | 188.8 | −19.5 |
| Pending to Dispatch | 346.3 | 322.8 | −23.5 |
| Physical Inventory | 2336.7 | 2378.4 | +41.7 (= +97.5 made − 55.8 invoiced) |
| RM Total | 1881.1 | 1674.6 | −206.6 (−162.4 removed Tapi coils, +55.5 new coils, rest consumed) |

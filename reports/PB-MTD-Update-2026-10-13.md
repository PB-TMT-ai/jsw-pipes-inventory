# JSW Pipes & Tubes — PB MTD Update (2026-10-13)

Live Supabase numbers (project `hztblmccvvarmgxmunrp`). Region / plant / servable / pipeline cuts
from `scripts/daily-splits.mjs --in` (rows pulled through the Supabase MCP — the agent proxy blocks
PostgREST from Node; orders pulled **with `mm_id` + `description`**, see Flags).

```
PB MTD update as on --->	2026-10-13
Revised Best Estimate --->	5000.0T
Total Orders --->	2052.0T
Current Month Orders --->	1559.0T
Invoiced Orders MTD --->	1062.4T
Invoiced MTD (Previous Month) --->	1271.2T
Dispatch D-1 (Current Month) --->	156.2T
Dispatch D Day --->	25.1T
Confirmed Orders Pending to be Invoiced --->	276.6T
Non-Confirmed Orders --->	712.9T
Daily Run Rate Required --->	207.2T
Physical Inventory --->	2629T
RM Full Coil Left --->	1211.1T
RM Baby Coil Left --->	1665.3T
RM Total --->	2876.4T
	
Invoiced MTD - South --->	460.7T
Invoiced MTD - West --->	601.8T
Invoiced MTD - All Regions --->	1062.4T
	
Pending to Serve - South --->	309.5T
Pending to Serve - West --->	680.1T
Pending to Serve - All Regions --->	989.6T
	
Invoiced MTD by Plant - Hyderabad --->	348.3T
Invoiced MTD by Plant - NPMD --->	71.0T
Invoiced MTD by Plant - Lepakshi --->	260.8T
Invoiced MTD by Plant - Tapi --->	382.3T
Invoiced MTD by Plant - All Plants --->	1062.4T
	
Pending to Serve by Plant - Hyderabad --->	212.8T
Pending to Serve by Plant - NPMD --->	415.4T
Pending to Serve by Plant - Lepakshi --->	222.1T
Pending to Serve by Plant - Tapi --->	157.2T
Pending to Serve by Plant - All Plants --->	1007.4T
	
Produced MTD --->	1460.1T
Produced MTD (Previous Month) --->	1425.3T
Production D-1 --->	31.8T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	375.0T
Orders Logged D-2 --->	0T
```

Notes:
- **Best Estimate 5000 T** (invoicing) and **Production target 5000 T**, both confirmed by the user
  for Oct-2026. Days left = 31 − 13 + 1 = 19 (calendar days).
  Invoicing run rate = (5000 − 1062.4) ÷ 19 = **207.2 T/day**, 21% achieved.
  Production run rate = (5000 − 1460.1) ÷ 19 = **186.3 T/day**, 29% achieved.
- **Confirmed** is the app's `salesKpis` live-netted figure (276.6 T), not the stored column (436.4 T).
- **Total Orders** (the message's *Indent*) = 1062.4 + 276.6 + 712.9 = 2052.0 T.
- Invoicing suffix is empty: all four plants have invoiced this month.
- RM Baby Coil Left is the Dashboard figure (ADR-0007 scrap floor + `consumed` flag); 172.9 T of ends excluded.

## Verification

| Metric | Method A | Method B | Verdict |
|---|---|---|---|
| Invoiced MTD | `theoretical_weight` 1062.435 | Σ bundle-entry lines 1062.435 | PASS |
| Invoiced prev (Sep 1–13) | 1271.171 | lines 1271.171 | PASS |
| Daily dispatch partition | Σ Oct 1–13 days = 1062.435 | invoiced_mtd 1062.435 | PASS |
| Orders intake partition | Σ per-day 1559.0 | month 1559.0 | PASS |
| Total Orders arithmetic | 1062.4 + 276.6 + 712.9 | 2052.0 | PASS |
| Region partition — invoiced | Σ regions 1062.435 | SQL 1062.435 | PASS |
| Region partition — pending | Σ regions 989.577 | `salesKpis` 989.577 | PASS |
| Plant partition — invoiced | Σ plants 1062.435 | SQL 1062.435 | PASS |
| Plant partition — pending | Σ plants 1007.441 | All Plants 1007.441 | PASS (see flag) |
| Servable ties to book | confirmed 276.632 / unconf 712.945 | book 276.632 / 712.945 | PASS |
| Produced MTD | SQL live recompute 1460.104 | script 1460.104 | PASS |
| Physical Inventory (FG) | SQL produced − invoiced 10972.330 − 8343.695 = 2628.635 | script Σ plants 2628.635 | PASS |
| RM Σ plants | 2876.411 | totals 2876.411 | PASS |

Freshness: `max_dispatch_date` = 2026-10-13; `max_order_date` = `max_production_date` = 2026-10-12.
**Orders Logged D Day and Production D Day (13-Oct) are "no data loaded yet"**, not zero activity.

### Flags (advisory)
- **Orders Logged D-2 (11-Oct) now reads 0 T**; yesterday's report showed 126.0 T for that date and
  0 T for 12-Oct (not yet loaded). The order book was re-uploaded since, and its dates moved — 375.0 T
  is now dated 12-Oct. Reported as the data stands.
- **Produced MTD rose 264.9 T overnight but Production D-1 (12-Oct) is only 31.8 T** — about 233 T
  of production was entered for dates on or before 11-Oct since yesterday (late entries / backfill),
  which is also why RM Total fell 266.0 T. Prev-month same-days figure moved too (1396.2 → 1425.3, one more day).
- **Split script misses `mm_id`.** Still unfixed in `scripts/daily-splits.mjs` `ORDER_COLS`; worked
  around by supplying the columns via `--in`. Without it Servable – Unconfirmed would read 0.0 T.
- **Confirmed has four values:** stored 436.4 · ERP `release − invoiced` 413.6 · plant split 294.5 ·
  `salesKpis` live-netted 276.6. Report uses 276.6 (app-consistent). The plant split's pending
  (1007.4) is 17.9 T above the region/servable book (989.6) for the same reason.
- **Unmapped:** none today (yesterday's 25.0 T GOA line is no longer open).
- **No Oct distributor estimates** in `distributor_estimates`. 5000 T is the user's headline figure;
  no regional BE could be derived, so the BE / % columns are left off *Invoiced by Region*.
- Stored vs live produced: 10975.0 − 10972.3 = 2.7 T (master weights edited after save; minor).

## Change vs last report (2026-10-12)

| Line | 2026-10-12 | 2026-10-13 | Δ |
|---|---|---|---|
| Total Orders | 2074.0 | 2052.0 | −22.0 |
| Current Month Orders | 1326.0 | 1559.0 | +233.0 |
| Invoiced Orders MTD | 881.1 | 1062.4 | +181.3 |
| Confirmed | 262.0 | 276.6 | +14.6 |
| Non-Confirmed | 931.0 | 712.9 | −218.1 |
| Physical Inventory | 2540 | 2629 | +89 |
| RM Total | 3142.4 | 2876.4 | −266.0 |
| Produced MTD | 1195.2 | 1460.1 | +264.9 |
| Daily Run Rate Required | 205.9 | 207.2 | +1.3 |

# JSW Pipes & Tubes — PB MTD Update (2026-10-12)

Live Supabase numbers (project `hztblmccvvarmgxmunrp`). Region / plant / servable / pipeline cuts
from `scripts/daily-splits.mjs --in` (rows pulled through the Supabase MCP — the agent proxy blocks
PostgREST from Node; orders pulled **with `mm_id` + `description`**, see Flags).

```
PB MTD update as on --->	2026-10-12
Revised Best Estimate --->	5000.0T
Total Orders --->	2074.0T
Current Month Orders --->	1326.0T
Invoiced Orders MTD --->	881.1T
Invoiced MTD (Previous Month) --->	1246.5T
Dispatch D-1 (Current Month) --->	50.0T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	262.0T
Non-Confirmed Orders --->	931.0T
Daily Run Rate Required --->	205.9T
Physical Inventory --->	2540T
RM Full Coil Left --->	1265.6T
RM Baby Coil Left --->	1876.8T
RM Total --->	3142.4T
	
Invoiced MTD - South --->	418.0T
Invoiced MTD - West --->	463.2T
Invoiced MTD - Unmapped --->	0T
Invoiced MTD - All Regions --->	881.1T
	
Pending to Serve - South --->	251.9T
Pending to Serve - West --->	916.0T
Pending to Serve - Unmapped --->	25.0T
Pending to Serve - All Regions --->	1192.9T
	
Invoiced MTD by Plant - Hyderabad --->	305.6T
Invoiced MTD by Plant - NPMD --->	45.8T
Invoiced MTD by Plant - Lepakshi --->	236.0T
Invoiced MTD by Plant - Tapi --->	293.7T
Invoiced MTD by Plant - All Plants --->	881.1T
	
Pending to Serve by Plant - Hyderabad --->	112.8T
Pending to Serve by Plant - NPMD --->	619.3T
Pending to Serve by Plant - Lepakshi --->	240.1T
Pending to Serve by Plant - Tapi --->	238.7T
Pending to Serve by Plant - All Plants --->	1210.8T
	
Produced MTD --->	1195.2T
Produced MTD (Previous Month) --->	1396.2T
Production D-1 --->	48.5T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	126.0T
Orders Logged D-2 --->	144.0T
```

Notes:
- **Best Estimate 5000 T** supplied by the user for Oct-2026. Run rate = (5000 − 881.1) ÷ 20 days left
  (31 − 12 + 1, calendar days) = **205.9 T/day**. 18% achieved.
- **Confirmed** is the app's `salesKpis` live-netted figure (262.0 T), not the stored column (310.0 T).
- **Total Orders** = 881.1 + 262.0 + 931.0 = 2074.0 T.
- Invoicing suffix is empty: all four plants have invoiced this month.
- RM Baby Coil Left is the Dashboard figure (ADR-0007 scrap floor + `consumed` flag); 172.2 T of ends excluded.

## Verification

| Metric | Method A | Method B | Verdict |
|---|---|---|---|
| Invoiced MTD | `theoretical_weight` 881.1 | Σ bundle-entry lines 881.115 | PASS |
| Invoiced prev (Sep 1–12) | 1246.5 | lines 1246.451 | PASS |
| Daily dispatch partition | Σ Oct 1–11 days = 881.1 | invoiced_mtd 881.1 | PASS |
| Orders intake partition | Σ per-day 1326.0 | month 1326.0 | PASS |
| Total Orders arithmetic | 881.1 + 262.0 + 931.0 | 2074.0 | PASS |
| Region partition — invoiced | Σ regions 881.115 | SQL 881.1 | PASS |
| Region partition — pending | Σ regions 1192.921 | `salesKpis` 1192.921 | PASS |
| Plant partition — invoiced | Σ plants 881.115 | SQL 881.1 | PASS |
| Plant partition — pending | Σ plants 1210.785 | All Plants 1210.785 | PASS (see flag) |
| Servable ties to book | confirmed 261.961 / unconf 930.96 | book 261.961 / 930.96 | PASS |
| Produced MTD | SQL live recompute 1195.2 | script 1195.2 | PASS |
| Physical Inventory (FG) | SQL produced − invoiced 2539.8 | script Σ plants 2539.8 | PASS |
| RM Σ plants | 3142.4 | totals 3142.4 | PASS |

Freshness: `max_order_date` = `max_dispatch_date` = `max_production_date` = 2026-10-11. All **D-day
zeros (12-Oct) are "no data loaded yet"**, not zero activity.

### Flags (advisory)
- **Split script misses `mm_id`.** `scripts/daily-splits.mjs` `ORDER_COLS` does not fetch `mm_id`/
  `description`; on a live fetch Servable – Unconfirmed reads **0.0 T instead of 326.5 T**. Known
  (LEARNINGS.md); worked around here by supplying the columns via `--in`. Not fixed in code.
- **Confirmed has four values:** stored 310.0 · ERP `release − invoiced` 289.5 · plant split 279.8 ·
  `salesKpis` live-netted 262.0. Report uses 262.0 (app-consistent). The plant split's pending
  (1210.8) is 17.9 T above the region/servable book (1192.9) for the same reason.
- **Unmapped:** GOA (25.0 T unconfirmed, 1 distributor) — map the state on the Sales tab.
- **No Oct distributor estimates** in `distributor_estimates` (Sep had 17 rows = 5550). The 5000 T is
  the user's headline figure; no regional BE could be derived, so none is shown.
- Stored vs live produced: 10704.8 − 10702.1 = 2.7 T (master weights edited after save; minor).

## Change vs last report (2026-08-05)

| Line | 2026-08-05 | 2026-10-12 | Δ |
|---|---|---|---|
| Total Orders | 262.0 | 2074.0 | +1812.0 |
| Current Month Orders | 93.0 | 1326.0 | +1233.0 |
| Invoiced Orders MTD | 129.2 | 881.1 | +751.9 |
| Confirmed | 56.5 | 262.0 | +205.5 |
| Non-Confirmed | 76.3 | 931.0 | +854.7 |
| Physical Inventory | 1463.8 | 2539.8 | +1076.0 |
| RM Total | 1312.0 | 3142.4 | +1830.4 |
| Produced MTD | 26.3 | 1195.2 | +1168.9 |

The last PB MTD snapshot is two months old (day 5 vs day 12, one plant vs four), so Δs are not like-for-like.

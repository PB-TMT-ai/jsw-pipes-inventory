# JSW Pipes & Tubes — PB MTD Update (2026-10-03)

Live numbers from Supabase (`hztblmccvvarmgxmunrp`). Region, plant, servable and pipeline cuts from
`scripts/daily-splits.mjs`, run offline (`--in`) on the full book carried through the Supabase MCP —
the container's egress to Supabase is blocked (LEARNINGS 2026-09-08). Every table carried an `md5()`
from Postgres, re-checked after writing: all matched.

```
PB MTD update as on --->	2026-10-03
Revised Best Estimate --->	5000.0T
Total Orders --->	1029.0T
Current Month Orders --->	202.0T
Invoiced Orders MTD · Hyderabad, Lepakshi --->	80.0T
Invoiced MTD (Previous Month) --->	129.9T
Dispatch D-1 (Current Month) --->	0T   (no data loaded yet — last invoice 01-Oct)
Dispatch D Day --->	0T   (no data loaded yet)
Confirmed Orders Pending to be Invoiced --->	182.7T
Non-Confirmed Orders --->	766.3T
Daily Run Rate Required --->	169.7T
Physical Inventory --->	2115T
RM Full Coil Left --->	1582.9T
RM Baby Coil Left --->	2013.0T
RM Total --->	3595.8T
	
Invoiced MTD · Hyderabad, Lepakshi - South --->	80.0T
Invoiced MTD · Hyderabad, Lepakshi - West --->	0T
Invoiced MTD · Hyderabad, Lepakshi - All Regions --->	80.0T
	
Pending to Serve - South --->	181.0T
Pending to Serve - West --->	768.0T
Pending to Serve - All Regions --->	949.0T
	
Invoiced MTD by Plant · Hyderabad, Lepakshi - Hyderabad --->	50.7T
Invoiced MTD by Plant · Hyderabad, Lepakshi - Lepakshi --->	29.3T
Invoiced MTD by Plant · Hyderabad, Lepakshi - All Plants --->	80.0T
Invoiced MTD is limited to Hyderabad, Lepakshi — the other plants carry orders but have never invoiced. Pending is every plant’s, so the two columns are not like for like.
	
Pending to Serve by Plant - Hyderabad --->	140.0T
Pending to Serve by Plant - NPMD --->	539.2T
Pending to Serve by Plant - Lepakshi --->	130.1T
Pending to Serve by Plant - Tapi --->	139.7T
Pending to Serve by Plant - All Plants --->	949.0T
	
Produced MTD --->	0T   (no data loaded yet — last production 30-Sep)
Produced MTD (Previous Month) --->	444.2T
Production D-1 --->	0T   (no data loaded yet)
Production D Day --->	0T   (no data loaded yet)
	
Orders Logged D Day --->	0T   (no data loaded yet — last order 02-Oct)
Orders Logged D-1 --->	74.0T
Orders Logged D-2 --->	128.0T
```

Notes:
- **Best Estimate 5000 T** is the user-supplied October target. Run rate = (5000 − 80.0) ÷ 29 days
  left (31 − 3 + 1, calendar days) = **169.7 T/day**.
- **No October distributor plans are entered** (`distributor_estimates` has none for 2026-10;
  September had 17 summing to 5550). The region BE column therefore reads `—`; the 5000 T headline
  is not split across regions by hand.
- **Confirmed = 182.7 T is the netted figure** (`salesKpis` → `liveConfirmed`, ADR-0014) — the
  Dashboard's number. The stored ERP bucket is 207.0 T; the 24.3 T gap is tonnage Zoho has already
  invoiced that the ERP's `Invoiced Qty` has not caught up with.
- **Physical Inventory** = produced (live master recompute 9,476.6 T) − invoiced (7,361.3 T).
  Stored-vs-live production delta is 1.5 T (9,478.1 stored) — small.
- **RM Baby Coil Left** is the Dashboard's figure (scrap floor + `consumed` flag, ADR-0007); 150.7 T
  of baby-coil ends is excluded.

## Verification

| Check | Method A | Method B | Verdict |
|---|---|---|---|
| 1. Invoiced MTD dual-method | `theoretical_weight` 80.0 | bundle-line sum 80.035 | PASS |
| 1. Invoiced prev-month dual-method | 129.9 | 129.910 | PASS |
| 2. Partition — dispatch | Σ daily Oct (01-Oct 80.0) | 80.0 | PASS |
| 2. Partition — orders | Σ daily Oct (128.0 + 74.0) | 202.0 | PASS |
| 3. Total Orders arithmetic | 80.035 + 182.722 + 766.288 | 1029.045 (`plantSplit.totals.totalOrders`) | PASS |
| 4. Freshness | max order 02-Oct, max dispatch 01-Oct, max production 30-Sep | D / D-1 zeros labelled "not loaded" | FLAG |
| 5. Region partition — invoiced | Σ regions 80.035 | 80.035 | PASS |
| 6. Region partition — pending | Σ regions 949.010 | `salesKpis` 182.722 + 766.288 = 949.010 | PASS |
| 7. Plant partition — invoiced | Σ plants 80.035 | 80.035 | PASS |
| 8. Plant partition — pending | Σ plants 949.010 | 949.010 | PASS |
| FG reconciliation | `plantPipeline` 2115.3 | SQL produced-live − invoiced 2115.3 | PASS |
| RM full coil | `plantPipeline` 1582.881 | SQL 1582.9 | PASS |
| Coil mass balance | inward 12,959.8 − full coil 1,582.9 = 11,376.9 | baby coil total 11,376.9 | PASS |

Advisory:
- **Confirmed variance** — stored 207.017, ERP `release − invoiced` 194.406, netted (reported) 182.722.
- **Plants with orders and no invoices** — NPMD, Tapi.
- **Unmapped / Unattributed** — none. Multi-state distributors — none. Post-D dispatch — 0.
- **`scripts/daily-splits.mjs` was under-fetching orders.** Its column list lacked `invoiced_qty`,
  `mm_id` and `description`. Run as-is it reported Confirmed 150.1 T (not 182.7) and Servable –
  Unconfirmed 0 T (not 237.2). Fixed in this commit; a full-column order load gives byte-identical
  output to the fixed column list.

## Change vs last report

The last `PB-MTD-Update-*.md` is 2026-08-05, two months back. A line-by-line delta against it is not
meaningful. The nearest comparable is the 18-Sep WhatsApp message, which is mid-month and a different
month, so it is not compared either.

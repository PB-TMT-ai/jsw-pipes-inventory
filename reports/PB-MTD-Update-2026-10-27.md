# JSW Pipes & Tubes — PB MTD Update (2026-10-27)

Live Supabase data, loaded through **26-Oct-2026** (orders, dispatches and production all stop
there). Best Estimate is **September's 5,550 T carried to October** at the user's request — no
October distributor estimates exist in `distributor_estimates`.

```
PB MTD update as on --->	2026-10-27
Revised Best Estimate --->	5550.0T
Total Orders --->	2941.8T
Current Month Orders --->	2687.0T
Invoiced Orders MTD --->	2342.9T
Invoiced MTD (Previous Month) --->	2549.2T
Dispatch D-1 (Current Month) --->	113.4T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	102.9T
Non-Confirmed Orders --->	496.1T
Daily Run Rate Required --->	641.4T
Physical Inventory --->	2501T
RM Full Coil Left --->	877.2T
RM Baby Coil Left --->	1236.5T
RM Total --->	2113.7T
	
Invoiced MTD - South --->	962.6T
Invoiced MTD - West --->	1360.0T
Invoiced MTD - Unmapped --->	20.2T
Invoiced MTD - All Regions --->	2342.9T
	
Pending to Serve - South --->	213.4T
Pending to Serve - West --->	385.6T
Pending to Serve - Unmapped --->	0T
Pending to Serve - All Regions --->	599.0T
	
Invoiced MTD by Plant - Hyderabad --->	773.4T
Invoiced MTD by Plant - NPMD --->	259.1T
Invoiced MTD by Plant - Lepakshi --->	497.3T
Invoiced MTD by Plant - Tapi --->	813.0T
Invoiced MTD by Plant - All Plants --->	2342.9T
	
Pending to Serve by Plant - Hyderabad --->	87.3T
Pending to Serve by Plant - NPMD --->	248.7T
Pending to Serve by Plant - Lepakshi --->	165.1T
Pending to Serve by Plant - Tapi --->	97.9T
Pending to Serve by Plant - All Plants --->	599.0T
	
Produced MTD --->	2613.4T
Produced MTD (Previous Month) --->	3070.0T
Production D-1 --->	30.6T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	127.0T
Orders Logged D-2 --->	0T
```

Notes:
- **D Day zeros are "no data loaded yet"**, not a stopped plant — the latest order, dispatch and
  production are all dated 26-Oct. Orders D-2 (25-Oct, a Sunday) is before that date: a true 0.
- **Daily Run Rate** = (5550 − 2342.9) ÷ 5 calendar days left (27–31 Oct, report day included).
- **Confirmed is the app's netted figure, 102.9 T** (`liveConfirmed`, ADR-0014), not the stored
  ERP bucket of 211.0 T. The stored bucket still counts 108.1 T already billed in Zoho but not yet
  reflected in the ERP's `Invoiced Qty`.
- **All four plants now invoice**, so the "· Hyderabad only" suffix is gone (`invoicing.suffix` is empty).
- **RM Baby Coil Left** is the Dashboard's 1236.5 T (scrap floor + `consumed` flag, ADR-0007). The
  plain `Σ max(0, weight − consumed)` in this skill's §2c returns 1422.8 T; 187.7 T of the gap is
  baby-coil ends under the scrap floor or marked consumed.
- **Unmapped** = one distributor with no state on file, 20.2 T invoiced and nothing pending. Its
  tonnage stays in every total.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced dual-method (Oct 1–27) | theoretical_weight 2342.9 | line Σ 2342.860 | PASS |
| 1 | Invoiced dual-method (Sep 1–27) | theoretical_weight 2549.2 | line Σ 2549.151 | PASS |
| 2 | Partition — dispatch | Σ daily 2342.860 | MTD 2342.9 | PASS |
| 2 | Partition — orders | Σ daily 2687.000 | month 2687.0 | PASS |
| 3 | Arithmetic — Total Orders | 2342.86 + 102.862 + 496.117 = 2941.839 | workbook `orderPipeline` 2941.839 | PASS |
| 4 | Freshness | max order / dispatch / production = 26-Oct | D = 27-Oct | D zeros = not loaded |
| 5 | Region partition — invoiced | Σ regions 2342.86 (JS) | SQL 2342.9 | PASS |
| 6 | Region partition — pending | Σ regions 598.979 (JS) | SQL netted 102.862 + 496.117 | PASS |
| 7 | Plant partition — invoiced | Σ plants 2342.86 (JS) | SQL 2342.9 | PASS |
| 8 | Plant partition — pending | Σ plants 598.979 (JS) | SQL netted 598.979 | PASS |
| — | Confirmed netted | JS `liveConfirmed` 102.862 | SQL re-derivation 102.862 | PASS |
| — | FG reconciliation | pipeline FG 2501.47 | SQL produced live 12125.6 − invoiced 9624.1 = 2501.5 | PASS |
| — | Region BE | South 2350 + West 3200 | headline 5550 | PASS |

Advisory: stored-vs-live produced weight differs by 2.6 T (12128.2 vs 12125.6) — small master
weight edits after save. Confirmed variance: stored 211.0 vs netted 102.9 (see note above).
`invoicedAfterD` = 0, no Unattributed tonnage, no multi-state distributors.

**How the splits were run:** the container's egress policy blocks `*.supabase.co` (proxy 403), so
`scripts/daily-splits.mjs` ran with `--in` on a copy of every table pulled through the Supabase
MCP; each table's md5 was computed in Postgres and re-checked after writing (all 9 matched).

**Script defect found and fixed this run:** `daily-splits.mjs` did not fetch `orders.invoiced_qty`,
`mm_id` or `description`. Without them Confirmed read 43.7 T (should be 102.9 T) and Servable –
Unconfirmed read 0 T (should be 203.8 T). See LEARNINGS.md, 2026-10-27.

## Change vs last report

The last snapshot is `PB-MTD-Update-2026-08-05.md` — a different month, 12 weeks back, before
three plants started invoicing. A line-by-line Δ against it would not mean anything, so none is shown.

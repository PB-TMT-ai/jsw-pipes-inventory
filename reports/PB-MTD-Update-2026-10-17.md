# JSW Pipes & Tubes — PB MTD Update (2026-10-17)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-10-17
Revised Best Estimate --->	5550.0T
Total Orders --->	2294.8T
Current Month Orders --->	1844.0T
Invoiced Orders MTD --->	1572.2T
Invoiced MTD (Previous Month) --->	1453.5T
Dispatch D-1 (Current Month) --->	60.3T
Dispatch D Day --->	64.5T
Confirmed Orders Pending to be Invoiced --->	55.5T
Non-Confirmed Orders --->	667.1T
Daily Run Rate Required --->	265.2T
Physical Inventory --->	2621T
RM Full Coil Left --->	977.3T
RM Baby Coil Left --->	1437.7T
RM Total --->	2415.0T
	
Invoiced MTD - South --->	660.4T
Invoiced MTD - West --->	891.6T
Invoiced MTD - Unmapped --->	20.2T
Invoiced MTD - All Regions --->	1572.2T
	
Pending to Serve - South --->	262.6T
Pending to Serve - West --->	460.1T
Pending to Serve - Unmapped --->	0T
Pending to Serve - All Regions --->	722.6T
	
Invoiced MTD by Plant - Hyderabad --->	578.8T
Invoiced MTD by Plant - NPMD --->	96.1T
Invoiced MTD by Plant - Lepakshi --->	364.4T
Invoiced MTD by Plant - Tapi --->	532.9T
Invoiced MTD by Plant - All Plants --->	1572.2T
	
Pending to Serve by Plant - Hyderabad --->	110.1T   ⚠️ see note
Pending to Serve by Plant - NPMD --->	360.3T
Pending to Serve by Plant - Lepakshi --->	200.8T
Pending to Serve by Plant - Tapi --->	69.3T
Pending to Serve by Plant - All Plants --->	740.5T   ⚠️ 17.9T above All Regions — see note
	
Produced MTD --->	1962.3T
Produced MTD (Previous Month) --->	1744.0T
Production D-1 --->	112.0T
Production D Day --->	0T   (no data loaded yet)
	
Orders Logged D Day --->	0T   (no data loaded yet)
Orders Logged D-1 --->	0T   (no data loaded yet)
Orders Logged D-2 --->	159.0T
```

Notes:
- **Revised Best Estimate** = 5,550 T, reused from September on the user's instruction. No
  October Best Estimates are entered in the app (`distributor_estimates` holds Aug and Sep only),
  so there is no per-region BE for October.
- **Daily Run Rate Required** = (5,550 − 1,572.2) ÷ 15 = **265.2 T/day**. 15 = calendar days left
  in October counting today (31 − 17 + 1). Calendar days, not working days.
- **Invoiced MTD (Previous Month)** = September 1–17 = 1,453.5 T. October is ahead by
  **+118.7 T (+8%)**.
- **Invoicing suffix is empty**: all four plants raised invoices this month, so Invoiced and
  Pending compare like with like.
- **Confirmed = 55.5 T, not the 293.5 T stored in `orders.confirmed`.** Since 21-Sep the app nets
  each line's Confirmed against invoices already raised on it (`liveConfirmed`) — the ERP's
  `Invoiced Qty` only fills once a line reaches Delivered. 55.5 T is what the Dashboard and Sales
  tab show (`salesKpis` over all dispatches). Stored 293.5 T; ERP `Release − Invoiced` 268.1 T.
- **Total Orders** = 1,572.2 + 55.5 + 667.1 = 2,294.8 T.
- **Physical Inventory** = produced (live master recompute) − invoiced = 11,474.5 − 8,853.4 =
  **2,621 T**. Stored-basis production is 11,477.1 T (Δ 2.6 T — negligible master-weight drift).
- **RM** is the Dashboard Coil cards: Full Coil 977.3 T + Baby Coil Left 1,437.7 T = 2,415.0 T.
  Baby Coil Left excludes 179.1 T of ends under the scrap floor or marked consumed (ADR-0007).
- **Unmapped (20.2 T invoiced)** is one distributor with no state on its lines — a labelling gap,
  not missing tonnage. It has no open book.
- **⚠️ Pending to Serve by Plant does not tie to Confirmed + Non-Confirmed.** It reads 740.5 T
  against 722.6 T. `buildPlantMtdSummary` hands `salesKpis` only **this month's** dispatches, so
  `liveConfirmed` nets each line only against October's invoices; the Dashboard, the region split
  and the servable split net against **all** invoices. The 17.9 T gap is Confirmed tonnage already
  invoiced before October. The script's own tie-out passes because it compares the plant rows to
  the same month-only All Plants total. Non-Confirmed per plant is unaffected.
- **Data freshness**: dispatches loaded to 17-Oct, production to 16-Oct, orders to 15-Oct. Every
  0 on a later date is "not loaded yet", not zero activity.
- **How this was run**: the session's network policy blocks `*.supabase.co`, so
  `scripts/daily-splits.mjs` ran with `--in` on rows pulled through the Supabase connector — same
  columns, same `created_at, id` order. Soft-deleted dispatches (11,239 rows) were left out of the
  pull; every builder drops them anyway (`notDeleted`).

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` = 1,572.185 | bundle-line sum = 1,572.185 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` = 1,453.5 | bundle-line sum = 1,453.516 | ✅ PASS |
| 2 | Dispatch partition | Σ daily dispatch Oct 1–17 = 1,572.185 | Invoiced MTD = 1,572.185 | ✅ PASS |
| 2 | Order-intake partition | Σ daily orders Oct = 1,844.0 | Current Month Orders = 1,844.0 | ✅ PASS |
| 3 | Total Orders arithmetic | 1,572.185 + 55.547 + 667.087 | `salesKpis.totalOrders` = 2,294.819 | ✅ PASS |
| 4 | Freshness | max dispatch 17-Oct · production 16-Oct · orders 15-Oct | D / D-1 orders and D production flagged | ✅ flagged |
| 5 | Region partition — invoiced | Σ regions (JS) = 1,572.185 | Postgres = 1,572.185 | ✅ PASS |
| 6 | Region partition — pending | Σ regions (JS) = 722.634 | `salesKpis` all dispatches = 722.634 | ✅ PASS |
| 7 | Plant partition — invoiced | Σ plants (JS) = 1,572.185 | Postgres = 1,572.185 | ✅ PASS |
| 8 | Plant partition — pending | Σ plants = 740.498 | Confirmed + Non-Confirmed = 722.634 | ⚠️ 17.9 T gap — builder nets month-only (see note) |
| — | Plant pipeline ties | produced / FG / RM per plant | All Plants totals | ✅ PASS |
| — | Servable split ties | Confirmed 55.547 · Unconfirmed 667.087 | book | ✅ PASS |
| — | FG reconciliation | SQL produced − invoiced = 2,621.0 | builder FG = 2,621.05 | ✅ PASS |

Advisory flags:
- **Confirmed variance** — stored 293.5 T vs ERP `Release − Invoiced` 268.1 T vs live 55.5 T.
  The report uses the live figure (app-consistent).
- **Post-D dispatch** — 0 T. **Multi-state distributors** — 0. **Unattributed plant** — 0 T.
- **Unmapped share** — 1.3% of invoiced, 0% of pending. Below the 20% threshold.
- **Servable – Unconfirmed is 0 T**: none of the 667.1 T unconfirmed book has matching finished
  stock in its region, although 2,621 T of FG is on hand. The stock and the open book are in
  different sizes.

## Change vs last report (2026-08-05)

| Line | 05-Aug | 17-Oct | Δ |
|---|---|---|---|
| Revised Best Estimate | N/A | 5,550.0 | — |
| Total Orders | 262.0 | 2,294.8 | +2,032.8 |
| Current Month Orders | 93.0 | 1,844.0 | +1,751.0 |
| Invoiced Orders MTD | 129.2 | 1,572.2 | +1,443.0 |
| Invoiced MTD (Prev Month) | 104.5 | 1,453.5 | +1,349.0 |
| Confirmed Orders | 56.5 | 55.5 | −1.0 |
| Non-Confirmed Orders | 76.3 | 667.1 | +590.8 |
| Physical Inventory | 1,463.8 | 2,621.0 | +1,157.2 |
| RM Full Coil Left | 616.3 | 977.3 | +361.0 |
| RM Baby Coil Left | 695.7 | 1,437.7 | +742.0 |
| RM Total | 1,312.0 | 2,415.0 | +1,103.0 |
| Produced MTD | 26.3 | 1,962.3 | +1,936.0 |

The last snapshot is 73 days old and from a different month — read the deltas as scale, not pace.
Since August the book has gone from one plant to four.

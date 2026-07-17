# PB MTD Update — 2026-07-17

```
PB MTD update as on --->	2026-07-17
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	755.5T
Current Month Orders --->	714.0T
Invoiced Orders MTD --->	387.5T
Invoiced MTD (Previous Month) --->	528.9T
Dispatch D-1 (Current Month) --->	39.1T
Dispatch D Day --->	0T
Confirmed Orders Pending to be Invoiced --->	12.0T
Non-Confirmed Orders --->	356.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1731T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	37.0T
Orders Logged D-2 --->	25.0T
```

Notes:
- `best_estimate` not supplied → Revised Best Estimate and Daily Run Rate Required are N/A.
- Dispatch D Day / Orders Logged D Day are 0 with max loaded dates = 2026-07-16 → **no data loaded yet for 17-Jul**, not zero activity.
- Invoiced MTD (Previous Month) = June invoiced through day 17 (like-for-like window).
- Physical Inventory = Dashboard FG Left Inventory = Σ per-SKU max(0, produced − invoiced), grouped by canonical SKU (master description) = **1731 T**. (A naive global produced − invoiced = 4016.5 − 2319.0 = 1697.6 T understates by 33.7 T because it lets 10 over-dispatched SKUs subtract below zero; the Dashboard floors each SKU at zero.)

## Verification

| Metric | Method A | Method B | Verdict |
|---|---|---|---|
| Invoiced MTD (Jul ≤ 17) | 387.5 (theoretical_weight) | 387.505 (bundle-entry line sum) | ✅ PASS |
| Invoiced Prev Month (Jun ≤ day 17) | 528.9 (theoretical_weight) | 528.889 (bundle-entry line sum) | ✅ PASS |
| Partition — Σ daily dispatch (Jul ≤ 17) | 387.5 | 387.505 | ✅ PASS |
| Partition — Σ daily orders (Jul) | 714.0 | 714.000 | ✅ PASS |
| Arithmetic — Total Orders | 755.5 | 387.5 + 12.0 + 356.0 = 755.5 | ✅ PASS |
| FG floor — Physical Inventory | 1731.3 (Σ per-SKU floored) | 1697.6 global + 33.7 over-dispatch = 1731.3 | ✅ PASS (= Dashboard 1731.3) |
| Freshness | max_order_date = 2026-07-16 | max_dispatch_date = 2026-07-16 | ℹ️ D-day (17-Jul) data not loaded yet |

Advisory flags (non-failing):
- **Confirmed variance** — stored bucket 12.000 vs derived (release − invoiced) 11.775, Δ 0.225 T. Report uses the stored bucket (app-consistent).
- **FG reconciliation** — floored per-SKU 1731.3 == global 1697.6 + |over-dispatch| 33.7 ✅; matches Dashboard FG Left Inventory (1731.3 T) exactly.
- **Over-dispatch** — 10 SKUs invoiced beyond production, totalling −33.7 T (floored away by the Dashboard). Data/timing artifact worth surfacing to the plant, not a report failure.
- **FG data hygiene** — Σ stored production `total_weight` 4016.3 vs live recompute 4016.5, Δ 0.2 T (negligible; master weights essentially in sync).

**Overall: PASS** — all mandatory checks hold.

## Change vs last report

No previous `reports/PB-MTD-Update-*.md` snapshot exists — this is the first saved report; no comparison possible.

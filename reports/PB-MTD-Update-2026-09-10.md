# PB MTD Update — 2026-09-10 (Pipes & Tubes)

> **Splits unavailable this run.** `scripts/daily-splits.mjs` reaches the DB only by a direct
> `fetch` to `hztblmccvvarmgxmunrp.supabase.co`, and this environment's network egress policy
> denies that host (agent proxy returns **403**). The offline `--in` path was not feasible either —
> the full row set is **~31 MB** (9,120 dispatches / 35,012 entries), too large to move through the
> MCP channel. Every **core number below is live and verified** via the Supabase MCP; only the
> **region split (§2d)**, **plant split (§2e)** and **verification checks 5–8** are `N/A`. Fix:
> allowlist `hztblmccvvarmgxmunrp.supabase.co` in the environment's egress settings, then re-run.

```
PB MTD update as on --->	2026-09-10
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	5623.7T
Current Month Orders --->	2695.0T
Invoiced Orders MTD --->	862.8T
Invoiced MTD (Previous Month) --->	200.4T
Dispatch D-1 (Current Month) --->	128.3T
Dispatch D Day --->	0T   (no data loaded yet — 2026-09-10 > max dispatch 2026-09-09)
Confirmed Orders Pending to be Invoiced --->	445.9T
Non-Confirmed Orders --->	4315.0T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1369.3T
RM Full Coil Left --->	2171.6T
RM Baby Coil Left --->	1630.3T
RM Total --->	3801.9T

Invoiced MTD by Region --->	⚠️ N/A (region split unavailable: Supabase host blocked by egress policy; 31 MB set too large for --in)
Pending to Serve by Region --->	⚠️ N/A (region split unavailable — see above)

Invoiced MTD by Plant --->	⚠️ N/A (plant split unavailable: Supabase host blocked by egress policy; 31 MB set too large for --in)
Pending to Serve by Plant --->	⚠️ N/A (plant split unavailable — see above)

Produced MTD --->	948.6T
Produced MTD (Previous Month) --->	245.3T
Production D-1 --->	0T   (no data loaded yet — 2026-09-09 > max production 2026-09-08)
Production D Day --->	0T   (no data loaded yet — 2026-09-10 > max production 2026-09-08)

Orders Logged D Day --->	0T   (no data loaded yet — 2026-09-10 > max order 2026-09-09)
Orders Logged D-1 --->	372.0T
Orders Logged D-2 --->	276.0T
```

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` Σ = 862.8 | bundle-line Σ = 862.825 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` Σ = 200.4 | bundle-line Σ = 200.355 | ✅ PASS |
| 2 | Partition — dispatch | Σ month dispatch ≤ D = 862.8 | invoiced_mtd = 862.8 | ✅ PASS |
| 2 | Partition — orders | Σ month orders = 2695.0 | orders_month_intake = 2695.0 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 862.8 + 445.9 + 4315.0 | = 5623.7 | ✅ PASS |
| 4 | Freshness | max order/dispatch = 2026-09-09; max production = 2026-09-08 | D-day + D-1 production read 0 = "no data loaded yet", not zero activity | ⚠️ FLAG |
| 5 | Region partition — invoiced | — | — | ⚠️ N/A (script blocked) |
| 6 | Region partition — pending | — | — | ⚠️ N/A (script blocked) |
| 7 | Plant partition — invoiced | — | — | ⚠️ N/A (script blocked) |
| 8 | Plant partition — pending | — | — | ⚠️ N/A (script blocked) |

**Advisory flags**
- **Confirmed variance** — stored bucket 445.906 vs `release − invoiced` 442.682 → **+3.224 T**. Report uses the stored bucket (app-consistent).
- **FG reconciliation** — Physical Inventory 1369.3 = produced_live 6802.5 − invoiced 5433.2 ✅. Stored-vs-live produced delta = **−0.2 T** (negligible; masters essentially unchanged post-save).
- **RM mass-balance** — total inward 10408.4 − full coil left 2171.6 = 8236.8 vs baby total 8258.3 → gap **21.5 T** (slitting loss or an unlinked baby coil).
- **RM over-consumption** — floored Baby Coil Left 1630.3 vs unfloored (baby total − consumed) 1472.6 → **157.7 T** of baby coil consumed beyond slit weight on some coils (the per-coil floor hides the net).

## Change vs last report (2026-08-05)

| Line | 2026-08-05 | 2026-09-10 | Δ |
|---|---|---|---|
| Total Orders | 262.0 | 5623.7 | +5361.7 |
| Current Month Orders | 93.0 | 2695.0 | +2602.0 |
| Invoiced Orders MTD | 129.2 | 862.8 | +733.6 |
| Invoiced MTD (Prev Month) | 104.5 | 200.4 | +95.9 |
| Confirmed Pending | 56.5 | 445.9 | +389.4 |
| Non-Confirmed | 76.3 | 4315.0 | +4238.7 |
| Physical Inventory | 1463.8 | 1369.3 | −94.5 |
| RM Full Coil Left | 616.3 | 2171.6 | +1555.3 |
| RM Baby Coil Left | 695.7 | 1630.3 | +934.6 |
| RM Total | 1312.0 | 3801.9 | +2489.9 |
| Produced MTD | 26.3 | 948.6 | +922.3 |

_Last snapshot is 2026-08-05 (~5 weeks back), so Δ spans more than a day — MTD lines reset with the month._

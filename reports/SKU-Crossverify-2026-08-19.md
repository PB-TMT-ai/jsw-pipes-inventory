# SKU Cross-Verification — CM sheet vs system

**Source:** `JSW_One_Production_30.06.26_Dispatch_upto_31.07.26.xlsx` (CM)
**Question:** which SKUs have finished stock older than one month?
**Basis:** production ≤ 30-Jun-2026 minus dispatch ≤ 31-Jul-2026, FIFO. As-of 19-Aug-2026.

## Verdict

The CM's **759.82 MT** was inflated by thickness mis-keying. Corrected: **703 MT**.
After applying the thickness map to both sources they agree within **4.5%**.

| | CM sheet | System |
|---|---|---|
| Aged stock (>1 month) | 40,733 pcs / 46 SKUs | **38,901 pcs / 48 SKUs / 703 MT** |
| Residual shortfall | −405 pcs / 6 SKUs | −590 pcs / 5 SKUs / −12 MT |
| Total on-hand 31-Jul | — | 1,541 MT |

Aged MT verified two ways: stored `total_weight` and pieces × `SKU.weightPerTube` (718.83 / 718.98 pre-map).

## Root cause — thickness convention

Actual thickness is booked at production; the sold thickness is invoiced. The two never netted.

| Actual | Sold as | Confirmed by |
|---|---|---|
| 2.3 | 2.5 | user |
| 2.6 | 2.8 | user |
| 2.9 | 2.8 | user |
| 3.2 | 3.0 | user |
| 3.7 | 4.0 | user |

Effect of applying it:

| | Before | After |
|---|---|---|
| Aged stock | 719 MT | **703 MT** |
| Unexplained shortfall | 28 MT / 7 SKUs | **12 MT / 5 SKUs** |
| Total on-hand | 1,541 MT | 1,541 MT (unchanged — correct) |

Clean confirmations: 60X40 `232 + 2,559 = 2,791`; 80X40 `2,454 + 211 = 2,665`; 75X25 `935 + 160 = 1,095`.

## Watchlist — top aged SKUs

| SKU | Pcs | MT |
|---|---|---|
| 25X25 × 2.0 | 6,369 | 55.20 |
| 75X25 × 2.0 | 2,793 | 50.49 |
| 60X40 × 2.8 | 1,954 | 48.65 |
| 50X50 × 2.5 | 1,819 | 40.69 |
| 75X25 × 1.6 | 2,723 | 39.70 |
| 50X25 × 2.8 | 1,799 | 32.93 |
| 40 NB × 4.0 | 1,147 | 28.11 |

**75X25 carries 125 MT** across four thicknesses — the largest single problem size.

## Open items

| # | Item | Impact |
|---|---|---|
| 1 | `38X38 × 3.0` — 229 pcs invoiced, zero production at 3.0 or 3.2. Mis-coded invoices, or made as 2.8. | 4.80 MT |
| 2 | CM's kg/piece runs **3.1% heavier** than `SKU.weightPerTube` (16 SKUs compared). Worst: `38X38×4.0` 27.88 vs 24.33 kg (+14.6%). Weigh one pipe to settle. | ~22 MT |
| 3 | SKU master still holds the un-mapped thicknesses — 21 codes at 2.9, 12 at 3.2, 4 at 2.6. App screens still show pre-map numbers. | all reports |
| 4 | `80X40×1.6` −3.64 MT, `50 NB×4.0` −2.64, `60X40×2.0` −0.78, `25 NB×4.0` −0.07 | 7 MT |

Item 3 is the one that matters: fix the master, or map in `skuKeyResolver` (`src/lib/calc.js:575`).

## Corrections to earlier analysis

An initial pass reported a 595 MT stock hole. That was wrong — it cut production at 30-Jun but
dispatch at 31-Jul, so every SKU whose production began in July looked short. 15 NB first produced
23-Jul, 25 NB 1-Jul, 80 NB 7-Jul, and 100X50 made 7,881 pcs in July. Under FIFO a negative there
means aged stock is zero, not that inventory is missing. Real shortfall was 28 MT, now 12 MT.

## Notes

- CM's `Summery` tab does not reconcile with its own `Daily Report` tab: 50 rows vs 106 combos,
  production total 136,028 pcs vs 206,864 from its own daily rows. Rows were last refreshed on
  scattered dates across April–June. **Use the daily tab, not the summary.**
- Aggregates tie well: production ≤30-Jun 206,864 (CM) vs 203,374 (system), 1.7% apart.
  Dispatch ≤31-Jul 209,817 vs 208,920, 0.4% apart.
- Single plant (Hyderabad) — no plant split applicable.
- The thickness map is applied in query only. **No database change was made.**

## Method

`productions` / `dispatches.bundle_entries` / `skus` via Supabase, project `hztblmccvvarmgxmunrp`.
Netting key = nominal bore (CHS) or `height x breadth` (SHS/RHS) + mapped thickness, per
`scripts/sku-ageing.sql`. Age buckets: see that script for 0–30 / 31–60 / 61–90 / 90+.

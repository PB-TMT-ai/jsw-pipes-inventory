# SKU Ageing Report — 56 requested SKUs

**As-of date:** 2026-07-14  ·  **Source:** Supabase live data (`productions` + `dispatches`)  ·  **Scope:** the 56 SKUs requested.

## What "ageing" means here
Finished-goods **on-hand stock = produced − dispatched** (the app's inventory definition), aged by **how long the un-shipped pipes have been sitting since they were produced**:

1. For each SKU (matched by physical size **height×breadth / NB · thickness**, so variant ERP codes for the same tube are netted together), all production batches are laid out **oldest-first**.
2. Dispatches are consumed off the **oldest** batches first (**FIFO** — the same oldest-first logic the app uses in `dispatchCoilTrace`).
3. Whatever production remains un-dispatched is the **on-hand stock**; each surviving batch is aged `2026-07-14 − date_of_production` and dropped into a bucket.

Weight is each batch's actual produced tonnage. Age buckets: **0–30 / 31–60 / 61–90 / 90+ days**.

## FIFO worked example (first produced, first out)
`50X50X2` — 13,671 pcs produced across many dates, 9,447 pcs dispatched. Dispatches consume the **oldest** batches first:

| Produced on | Age | Pcs made | Cumulative | FIFO status |
|---|--:|--:|--:|---|
| Apr 6 → May 20 (8 batches) | 55–99 d | 9,019 | 9,019 | **shipped** — oldest out first |
| May 21 | 54 d | 1,084 | 10,103 | **partial** — 656 left (the 9,447 drain lands mid-batch) |
| Jun 18 | 26 d | 960 | 11,063 | in stock |
| Jun 19 | 25 d | 512 | 11,575 | in stock |
| Jun 22 | 22 d | 695 | 12,270 | in stock |
| Jul 13 | 1 d | 1,401 | 13,671 | in stock |

On-hand = 656 + 960 + 512 + 695 + 1,401 = **4,224 pcs**; oldest surviving layer is the partial May-21 batch (54 d), the rest is recent → weighted-avg age 21 d. The per-SKU surviving layers for all 56 SKUs are in **`SKU-Ageing-FIFO-layers-2026-07-14.csv`**.

## Headline
| Metric | Value |
|---|---:|
| SKUs with on-hand stock | **54 of 56** |
| Total on-hand | **≈ 83,545 pcs · 1,270.6 MT** |
| Weighted-avg age (by MT) | **29.7 days** |
| Fresh (≤30 days) | **835.2 MT — 65.7%** |
| 31–60 days | 244.8 MT — 19.3% |
| 61–90 days | 181.8 MT — 14.3% |
| **90+ days (aged)** | **8.8 MT — 0.7%** |

Inventory is young overall — two-thirds is under a month old. Ageing is concentrated in a handful of RHS/SHS sizes (see watchlist).

## Watchlist — oldest stock (61+ days)
| SKU | On-hand MT | Oldest (days) | Note |
|---|---:|---:|---|
| 38X38X2.2 | 6.78 | **104** | Whole balance is 90+ days (last produced 2026-04-01). Slow mover. |
| 50X50X2.2 | 1.98 | **104** | Whole balance is 90+ days (last produced 2026-04-01). Slow mover. |
| 60X40X2.8 | 48.65 | 83 | All 61–90 days. |
| 75X25X2.8 | 25.12 | 82 | All 61–90 days. |
| 75X25X2 | 50.52 | 80 | All 61–90 days. |
| 75X25X2.5 | 9.29 | 78 | All 61–90 days. |
| 80X40X2.8 | 8.48 (of 31.5) | 73 | Part of the balance is 61–90 days. |
| 75X25X1.6 | 39.73 | 67 | All 61–90 days. |

> **Flag — net over-dispatched (0 on-hand):** **38X38X4** (produced 97 < dispatched 261) and **50NBX4** (produced 274 < dispatched 300). Dispatched more than in-system production over the period — likely pre-tracking opening stock or a data gap; shown as 0 on-hand.

## Full ageing table (all 56, in requested order)
On-hand split by age bucket, in **MT**.

| # | SKU | On-hand pcs | On-hand MT | 0–30d | 31–60d | 61–90d | 90+d | Oldest (d) | Wtd-avg age (d) |
|--:|---|--:|--:|--:|--:|--:|--:|--:|--:|
| 1 | 50X50X2 | 4,224 | 76.397 | 64.532 | 11.865 | 0 | 0 | 54 | 21 |
| 2 | 25X25X2 | 7,970 | 69.071 | 4.541 | 64.530 | 0 | 0 | 46 | 44 |
| 3 | 50X50X2.5 | 2,796 | 62.554 | 6.578 | 55.976 | 0 | 0 | 55 | 51 |
| 4 | 75X25X2 | 2,793 | 50.515 | 0 | 0 | 50.515 | 0 | 80 | 80 |
| 5 | 32NBX2.5 | 3,404 | 50.243 | 50.243 | 0 | 0 | 0 | 28 | 10 |
| 6 | 25X25X1.6 | 6,675 | 47.083 | 39.677 | 7.406 | 0 | 0 | 43 | 16 |
| 7 | 60X40X2.8 | 1,954 | 48.653 | 0 | 0 | 48.653 | 0 | 83 | 81 |
| 8 | 75X25X1.6 | 2,723 | 39.728 | 0 | 0 | 39.728 | 0 | 67 | 67 |
| 9 | 100X50X2.8 | 1,022 | 38.925 | 38.925 | 0 | 0 | 0 | 8 | 8 |
| 10 | 32NBX2 | 3,204 | 38.307 | 32.245 | 6.062 | 0 | 0 | 32 | 9 |
| 11 | 40X20X2 | 3,201 | 33.772 | 33.044 | 0.728 | 0 | 0 | 35 | 6 |
| 12 | 50X25X2.8 | 1,799 | 32.931 | 0 | 32.931 | 0 | 0 | 60 | 59 |
| 13 | 100X50X1.6 | 1,412 | 31.241 | 31.087 | 0.155 | 0 | 0 | 60 | 3 |
| 14 | 30X30X1.6 | 3,689 | 31.581 | 31.573 | 0.009 | 0 | 0 | 38 | 6 |
| 15 | 40NBX4 | 1,147 | 28.102 | 28.102 | 0 | 0 | 0 | 21 | 21 |
| 16 | 38X38X1.6 | 2,505 | 27.486 | 0 | 27.486 | 0 | 0 | 50 | 50 |
| 17 | 100X50X2.5 | 852 | 29.094 | 29.094 | 0 | 0 | 0 | 8 | 8 |
| 18 | 40X20X1.6 | 2,708 | 23.183 | 23.183 | 0 | 0 | 0 | 6 | 5 |
| 19 | 30X30X2 | 2,406 | 25.384 | 25.384 | 0 | 0 | 0 | 8 | 7 |
| 20 | 75X25X2.8 | 1,009 | 25.123 | 0 | 0 | 25.123 | 0 | 82 | 81 |
| 21 | 25X25X2.8 | 1,652 | 19.346 | 19.346 | 0 | 0 | 0 | 11 | 11 |
| 22 | 32NBX1.6 | 2,311 | 22.323 | 22.323 | 0 | 0 | 0 | 5 | 4 |
| 23 | 50X50X4 | 664 | 23.018 | 23.018 | 0 | 0 | 0 | 24 | 23 |
| 24 | 80X40X2.8 | 1,043 | 31.472 | 22.993 | 0 | 8.479 | 0 | 73 | 32 |
| 25 | 30X30X2.5 | 1,716 | 22.226 | 20.866 | 1.360 | 0 | 0 | 38 | 10 |
| 26 | 40NBX2.5 | 1,321 | 22.381 | 22.381 | 0 | 0 | 0 | 24 | 24 |
| 27 | 60X60X2.8 | 251 | 7.574 | 7.574 | 0 | 0 | 0 | 15 | 15 |
| 28 | 80X40X4 | 445 | 18.780 | 18.780 | 0 | 0 | 0 | 17 | 16 |
| 29 | 80NBX1.6 | 900 | 18.450 | 18.450 | 0 | 0 | 0 | 6 | 6 |
| 30 | 50NBX2.8 | 792 | 18.868 | 18.868 | 0 | 0 | 0 | 21 | 19 |
| 31 | 40NBX2.8 | 984 | 18.550 | 18.550 | 0 | 0 | 0 | 22 | 22 |
| 32 | 25X25X2.5 | 2,011 | 21.312 | 18.800 | 2.512 | 0 | 0 | 41 | 15 |
| 33 | 20NBX2.8 | 1,647 | 16.445 | 16.445 | 0 | 0 | 0 | 29 | 29 |
| 34 | 65NBX2.5 | 425 | 11.571 | 11.571 | 0 | 0 | 0 | 16 | 16 |
| 35 | 25NBX2.8 | 666 | 8.526 | 8.526 | 0 | 0 | 0 | 12 | 12 |
| 36 | 50X50X1.6 | 957 | 13.962 | 13.962 | 0 | 0 | 0 | 1 | 1 |
| 37 | 40NBX2 | 981 | 13.442 | 13.442 | 0 | 0 | 0 | 24 | 24 |
| 38 | 60X40X1.6 | 977 | 14.254 | 14.254 | 0 | 0 | 0 | 26 | 26 |
| 39 | 50X50X2.8 | 1,084 | 26.990 | 26.990 | 0 | 0 | 0 | 25 | 25 |
| 40 | 50NBX2.5 | 650 | 13.898 | 13.898 | 0 | 0 | 0 | 20 | 20 |
| 41 | 65NBX2.8 | 420 | 12.755 | 12.755 | 0 | 0 | 0 | 16 | 16 |
| 42 | 65NBX2 | 488 | 10.701 | 10.701 | 0 | 0 | 0 | 16 | 16 |
| 43 | 38X38X4 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| 44 | 100X50X3.2 | 234 | 10.129 | 0 | 10.129 | 0 | 0 | 59 | 59 |
| 45 | 75X25X2.5 | 415 | 9.285 | 0 | 0 | 9.285 | 0 | 78 | 78 |
| 46 | 38X38X2.2 | 457 | 6.781 | 0 | 0 | 0 | 6.781 | 104 | 104 |
| 47 | 65NBX4 | 295 | 12.729 | 12.729 | 0 | 0 | 0 | 17 | 16 |
| 48 | 40X20X2.8 | 508 | 7.289 | 0 | 7.289 | 0 | 0 | 38 | 37 |
| 49 | 40X20X2.5 | 319 | 4.132 | 0 | 4.132 | 0 | 0 | 34 | 34 |
| 50 | 75X75X2.5 | 135 | 4.658 | 4.658 | 0 | 0 | 0 | 14 | 14 |
| 51 | 40X20X3 | 248 | 3.785 | 0 | 3.785 | 0 | 0 | 34 | 34 |
| 52 | 32NBX2.8 | 493 | 8.089 | 2.084 | 6.005 | 0 | 0 | 31 | 24 |
| 53 | 25X25X3.2 | 248 | 3.063 | 3.063 | 0 | 0 | 0 | 11 | 11 |
| 54 | 40X20X2.2 | 215 | 2.477 | 0 | 2.477 | 0 | 0 | 34 | 34 |
| 55 | 50X50X2.2 | 100 | 1.981 | 0 | 0 | 0 | 1.981 | 104 | 104 |
| 56 | 50NBX4 | 0 | 0 | 0 | 0 | 0 | 0 | — | — |
| | **TOTAL** | **≈83,545** | **1,270.610** | **835.230** | **244.840** | **181.780** | **8.760** | | **29.7** |

## Notes & assumptions
- **On-hand = produced − dispatched**, netted by physical size+thickness (variant ERP codes for the same tube are merged; IS-standard is not split, since the request is by size). This matches the app's Finished-Stock netting.
- **Ageing anchor is the production date.** The system tracks production from **2026-03-28** onward, so the maximum possible age is ~108 days; a "90+ days" figure means the batch dates to the very start of tracking.
- Two SKUs (**38X38X4**, **50NBX4**) show **more dispatched than produced** in-system → 0 on-hand and no age (pre-tracking opening stock or a data gap).
- Reproducible via `scripts/sku-ageing.sql` (per-SKU summary) and `scripts/sku-ageing-fifo-layers.sql` (the layer-level FIFO ledger) — see `blueprints/sku-ageing-report.md`.

# Rolling plan — no-stock SKUs vs available coil: rules of record

Output: `reports/Rolling-Plan-NoStock-2026-10-26.xlsx`, one tab `Rolling Plan`.
As-on date 26 Oct 2026. Status: PROPOSED (thresholds not signed off by the business).

## Inputs

1. **Demand** — the `No Stock` sheet of `QtyLeft_Stock_vs_NoStock_Oct26.xlsx`: "QTY LEFT WITH
   NO STOCK" (Indent − Dispatch, 1–25 Oct) per Section × Size × gauge, SOUTH block then WEST
   block. Blank = 0. Region totals in the file: SOUTH 983 MT, WEST 1155 MT, together 2138 MT.
   Every demand cell must appear exactly once in the tab; the tab's Qty-left total must be 2138.
2. **Coil in the yard (slit)** — `baby_coils` where `deleted` is not true, `consumed` is not true,
   and the `baby_coil_id` appears in no live production's `coil_allocations`. Weight is in MT.
   Expected: 242 coils, 904.5 MT — hyderabad 257.81, lepakshi 254.02, npmd 119.56, tapi 273.15.
3. **Mother coil (unslit)** — `coils` where `deleted` is not true and no live `baby_coils` row
   carries that `hr_coil_id`; weight = `coalesce(actual_weight, invoice_weight)`.
   Expected: SOUTH 368.98 MT, WEST 531.74 MT.
4. **Coil spec per cell** — the thickness and slit width these mills have *actually* used for that
   Section × Size × gauge, taken from live productions joined through `coil_allocations.babyCoilId`
   to `baby_coils`; the most-used (thickness, width) pair wins. Fallbacks, both labelled in the
   "Width basis" column: nearest gauge at the same size; else "size never run here".
   Widths are NOT computed from π(OD−t) — the weld allowance is mill-specific master data.

## Scoping (non-negotiables)

- Region service area: Hyderabad + Lepakshi serve SOUTH, NPMD + Tapi serve WEST. A SOUTH cell may
  only consume SOUTH coil.
- **Allocation never crosses plants.** The plant filter runs ahead of every eligibility rule.
- Coil is a shared pool: a MT of coil consumed by one cell is not available to another.

## Rules applied (PT Operating System Pack)

| # | Rule | Value here |
|---|---|---|
| R2 | coil needed = tube MT ÷ yield | yield 0.96 |
| R3 | Level 1 — run or defer per family, on SIZE | family qty-left ≥ **20 MT** min campaign |
| R4 | Level 2 — which gauges run inside a running family | cell ≥ **8 MT** gauge floor |
| R4b | T/D outside 3–8% is a band-edge cell, higher floor | floor × **1.5** = 12 MT |
| R5 | gauge ladder thin → thick inside a family | column/row order |
| R6 | family sequence: rounds then shapes, diameter ascending | CHS → SHS → RHS |
| R7.1 | coil in the yard beats coil to be slit beats coil on order | slit pool first, then mother |
| ADR-0001 | all gauges of one family run in one campaign window | one slot per family |
| — | a planned lot below the gauge floor does not earn a mill setup | coil released back to pool |
| — | coil cut-off = campaign start − 14 d coil − 2 d slitting − 1 d buffer | next cycle 24 Nov → **7 Nov** |

Thickness match tolerance ±0.35 mm, width ±3 mm. Mother coil is matched on thickness only
(it is slit to the width needed) and cannot serve W1 (slitting takes 2 days).
Weekly cap: SOUTH 300 MT, WEST 450 MT (median weekly output, last 10 weeks) — it never binds.

## The identity that must hold (nothing netted)

```
qty left = planned + deferred(min campaign) + deferred(gauge floor) + blocked(no coil) + run-short
2138.0   = 487.8   + 313.0                 + 529.0                 + 767.0            + 41.2
```

## Out of scope — stated on the tab

Demand is the no-stock back order only: not the rest of the order book, not the best estimate,
not stock cover. Mill-level sequencing, changeover hours and roll-set capability are not modelled
(the plant/mill capability matrix does not exist — design ticket 04).

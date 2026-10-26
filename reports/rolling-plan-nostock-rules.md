# Rolling plan — no-stock SKUs vs available coil: rules of record

Output: `reports/Rolling-Plan-NoStock-2026-10-26.xlsx`, one tab `Rolling Plan`.
As-on date 26 Oct 2026. Status: PROPOSED (thresholds not signed off by the business).
**v2** — rebuilt after the data-verifier FAILED v1 on 26 Oct. The four findings and the two rule
decisions they forced are worked through in "Rule decisions" below.

## Inputs

1. **Demand** — the `No Stock` sheet of `QtyLeft_Stock_vs_NoStock_Oct26.xlsx`: "QTY LEFT WITH
   NO STOCK" (Indent − Dispatch, 1–25 Oct) per Section × Size × gauge, SOUTH block then WEST
   block. Blank = 0. **171 cells**; SOUTH 983 MT, WEST 1155 MT, together **2138 MT**.
   Every demand cell appears exactly once in the tab.
2. **Coil in the yard (slit)** — `baby_coils` where `deleted` is not true, `consumed` is not true,
   and the `baby_coil_id` appears in no live production's `coil_allocations`. Weight in MT.
   **242 coils, 904.5215 MT** — hyderabad 257.79, lepakshi 254.01, npmd 119.56, tapi 273.16.
3. **Mother coil (unslit)** — `coils` where `deleted` is not true and no live `baby_coils` row
   carries that `hr_coil_id`; weight = `coalesce(actual_weight, invoice_weight)`.
   **SOUTH 368.965, WEST 531.720, total 900.685 MT.** Coil on hand = **1805.2065 MT**.
4. **Coil spec per cell** — the thickness and slit width taken from live productions joined through
   `coil_allocations.babyCoilId` to `baby_coils`. **Region-scoped**: the region's own most-used
   (thickness, width) wins; then the region's nearest gauge at that size; then the company-wide
   mode; then company-wide nearest gauge. Every row's "Width basis" column names which applied.
   Widths are NOT computed from π(OD−t) — the weld allowance is mill-specific master data.
5. **SKU master** — `skus`, keyed (product_type, size, thickness). 311 keys.

## Scoping (non-negotiables)

- Service area: Hyderabad + Lepakshi serve SOUTH, NPMD + Tapi serve WEST. A SOUTH cell may only
  consume SOUTH coil. **Taken from CLAUDE.md — the `plants` table is empty, so nothing in the data
  enforces it.**
- **Allocation never crosses plants.** The plant filter runs ahead of every eligibility rule.
- Coil is a shared pool: a MT consumed by one cell is not available to another.

## Rules applied (PT Operating System Pack)

| # | Rule | Value here |
|---|---|---|
| — | nothing rolls for a SKU the catalog lacks, or a width never established | BLOCKED, coil released |
| R2 | coil needed = tube MT ÷ yield | yield 0.96 |
| R3 | Level 1 — run or defer per family, on SIZE | family qty-left ≥ **20 MT** |
| R4 | Level 2 — which gauges run inside a running family | cell ≥ **8 MT** |
| R4b | T/D outside 3–8% is a band-edge cell, higher floor | floor × **1.5** = 12 MT |
| R5 | gauge ladder thin → thick inside a family | row order |
| R6 | family sequence: rounds then shapes, diameter ascending | CHS → SHS → RHS |
| R7.1 | coil in the yard beats coil to be slit beats coil on order | yard pool first, then mother |
| ADR-0001 | all gauges of one family run in **one** window | one slot per family, enforced |
| — | a planned lot below the gauge floor does not earn a setup | coil released back to the pool |
| — | weekly ceiling | MT: SOUTH 300 / WEST 450 (median weekly output, last 10 weeks)<br>Families: SOUTH 12 / WEST 5 (the most either has run in one week, last 13 / 9 weeks) |
| — | coil cut-off for coil that must be BOUGHT | start − 14 d − 2 d − 1 d; next cycle 24 Nov → **7 Nov** |

Thickness match tolerance ±0.35 mm, width ±3 mm. Mother coil is matched on thickness only
(it is slit to the width needed).

## Rule decisions — the two questions v1 got wrong

**1. Can mother coil serve W1?  YES, from 29 Oct.**
v1's rule said "mother coil cannot serve W1 (slitting takes 2 days)" and then planned 59.15 MT of
W1 on mother coil anyway — the verifier caught both halves. The rule itself was wrong: the 14-day
lead applies to coil that must be **bought**. Mother coil is already on site, so it needs slitting
+ buffer only.
*Worked example:* 26 Oct + 2 d slitting + 1 d buffer = **29 Oct**, which is inside W1
(27 Oct – 1 Nov). So SOUTH SHS 20×20 1.6 mm, fed by Hyderabad's 18.88 MT mother coil, runs in W1
with "Runs from 29 Oct". A yard-fed lot in the same week reads "Runs from 27 Oct".

**2. Is the coil spec region-scoped or company-wide?  REGION-scoped, with a labelled fallback.**
v1 used the company-wide mode silently, so 44 rows claimed "slit N of M times at this size+gauge"
for sizes their own region has never run.
*Worked example:* WEST SHS 25×25 2.5 mm. v1 quoted "2.5 × 94 mm, slit 21 of 50 times" — that is
Hyderabad/Lepakshi history; WEST has never produced SHS 25×25 at all. v2 quotes the company-wide
width and says so: *"company-wide width — West has never run this size"*.
Where the region has its own history the width can differ: SOUTH SHS 100×100 4 mm is **391 mm**
South-only versus 395 mm company-wide, and SOUTH RHS 80×40 3 mm is **2.6 × 235** versus 3 × 238.

## The identity that must hold (nothing netted)

```
qty left = planned + deferred(min campaign) + deferred(gauge floor) + blocked(no coil)
           + run-short + blocked(no SKU row) + blocked(no slitting spec)
2138.0   = 509.21  + ...                     (see the tab's reconciliation block)
```
The tab prints every component and they sum to 2138.00. Coil: 1805.2065 on hand,
530.43 consumed, **1274.78 MT left unused** — the wrong thickness or width for what is owed.

## Out of scope — stated on the tab

Demand is the no-stock back order only: not the rest of the order book, not the best estimate,
not stock cover. Mill-level sequencing and changeover hours are not modelled (the plant/mill
capability matrix does not exist — design ticket 04); the families-per-week ceiling is a crude
stand-in taken from observed behaviour. WEST "RHS 18x180" in the source sheet is almost certainly
a transposed 180x18 and is carried through as given.

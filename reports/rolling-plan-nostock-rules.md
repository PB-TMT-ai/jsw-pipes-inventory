# Rolling plan — no-stock SKUs vs available coil: rules of record

Output: `reports/Rolling-Plan-NoStock-2026-10-26.xlsx`, one tab `Rolling Plan`.
As-on date 26 Oct 2026. Status: PROPOSED (thresholds not signed off by the business).
**v3** — rebuilt twice after the data-verifier FAILED v1 and then v2 on 26 Oct. v2 fixed all four
v1 findings; v3 fixes what v2's check could not re-derive: the T/D diameter for square and
rectangular sections (a real defect, see Rule decisions 3), two columns that were a running
remainder, and one wrong worked example in this file. "Rule decisions" below carries all of it.

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
5. **SKU master** — `skus`, keyed (product_type, size, thickness). **311 distinct keys.** A raw
   `count(distinct …)` returns 312: `skus` holds 22 duplicated keys, several mixing `draft` and
   `published`, and one *published* row with a NULL thickness
   (`MS CHS One Helix IS 1161 YSt 210 Black 65 NBx2.8x6000`). That NULL row is the difference. None
   of it changes a figure here, but the catalog needs a clean-up.

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
| R4b | T/D outside 3–8% is a band-edge cell, higher floor | floor × **1.5** = 12 MT; **D defined in Rule decisions 3** |
| R5 | gauge ladder thin → thick inside a family | row order |
| R6 | family sequence: rounds then shapes, diameter ascending | CHS → SHS → RHS |
| R7.1 | coil in the yard beats coil to be slit beats coil on order | yard pool first, then mother |
| ADR-0001 | all gauges of one family run in **one** window | one slot per family, enforced |
| — | a planned lot below the gauge floor does not earn a setup | coil released back to the pool |
| — | weekly ceiling | MT: SOUTH 300 / WEST 450 (median weekly output, last 10 weeks)<br>Families: SOUTH 12 / WEST 5 (the most either has run in one week, last 13 / 9 weeks) |
| — | coil cut-off for coil that must be BOUGHT | start − 14 d − 2 d − 1 d; next cycle 24 Nov → **7 Nov** |

Thickness match tolerance ±0.35 mm, width ±3 mm. Mother coil is matched on thickness only
(it is slit to the width needed).

**A demand cell may be served by more than one lot, including lots at both plants of its region.**
`Plant (coil sits here) + MT` names the tonnage per plant — e.g. SOUTH SHS 20×20 2 mm reads
"Lepakshi 27.2 + Hyderabad 4.0". The non-negotiable is that **no single production crosses plants**:
each lot eats coil where it sits. One row is a demand cell, not one production.

**The two "Coil … (gross)" columns are GROSS regional availability at the start of the cycle**, not a
running remainder: coil of that spec the region held before any of this plan was allocated. They can
be re-derived from the database without replaying the allocation order. What each row actually
consumes is in the two "Coil used" columns, and those are what must not exceed the pools.

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
South-only versus 395 mm company-wide.

**The nearest-gauge fallback carries the WIDTH only.** The thickness stays the demand gauge — you
buy 3 mm coil for a 3 mm tube. *Worked example:* SOUTH RHS 80×40 3 mm has no South 3 mm history, so
the width comes from South's own 2.8 mm run (235 mm) and the spec reads **3 × 235 mm**, with the
basis "South width from its own 2.8mm run (3mm never run here)". (The v2 copy of this file wrongly
printed 2.6 × 235, carrying the historical thickness through as well; the tab was right and this
file was wrong. Quoting 2.6 mm would have widened that row's yard pool from 4.12 to 8.15 MT.)
*Tie-break:* where the demand gauge sits equidistant between two historical gauges, the **thinner**
wins — WEST SHS 25×25 3 mm takes the 2.8 mm width over the 3.2 mm one. The two widths differ by
1 mm, inside the ±3 mm tolerance, so nothing turns on it today.

**3. What is D for a square or rectangular section?  The MOTHER-ROUND OD.**
R4b says "T/D outside 3–8%" but never defined D for a shape, and v2 computed it as
perimeter ÷ π **+ a constant 2 mm** — which is why no size-proportional definition reproduced the
labels, and why SOUTH SHS 30×30 @1.2 and WEST SHS 40×40 @1.6 came out with opposite labels on an
identical t/side of 4.0%. That was a defect, not an ambiguity. v3 uses the formula
`campaign-planning-parameters.md` §2.1 actually gives, against the round the mill rolls:

```
mid-corner r = 1.5t
P    = 2((a − t) + (b − t)) − 8r + 2πr
OD_m = P / π + t          T/D = t / OD_m
```

*Worked example (the doc's own):* SHS 100×100 × 4.0 → r = 6, P = 373.7 mm, OD_m = **122.9 mm**,
T/D = 3.3% — in band. And the two rows above now agree: SHS 30×30 @1.2 → OD_m 36.9, and SHS 40×40
@1.6 → OD_m 49.2, both **3.25%, both in band**. For a round, D is the IS 1161 outside diameter.
*Regression note:* the one row this definition moves is **SOUTH RHS 40×20 1.2 mm (10 MT)** — in band
under the correct formula, so its floor is 8 MT not 12 and it passes Level 2; it is still not planned,
because there is no 1.2 × 117 mm coil in South, so it reads "NO COIL" instead of "under gauge floor".

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

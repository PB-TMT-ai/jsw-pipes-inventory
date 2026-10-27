# Rolling plan — no-stock SKUs vs available coil: rules of record

Output: `reports/Rolling-Plan-NoStock-2026-10-26.xlsx`, one tab `Rolling Plan`.
**Coil position as at 27 Oct 2026 05:19 UTC** (the snapshot both workbooks were cut from).
Status: PROPOSED (thresholds not signed off by the business).
Companion output: `reports/Make-List-NoStock-2026-10-26.xlsx` — the makeable lines only, plus a
plant × thickness grid, both derived from this plan.
**v4** — v3 PASSED on the 26 Oct coil position, then went stale: overnight a mother coil was slit
and several productions were booked, so v4 is rebuilt on a fresh 27 Oct 05:19 UTC snapshot. See
"Rule decisions 5". v1→v3 history: v2 fixed all four v1 findings; v3 fixed what v2's check could
not re-derive — the T/D diameter for shapes (a real defect, Rule decisions 3), two columns that
were a running remainder, and one wrong worked example in this file.

## Inputs

1. **Demand** — the `No Stock` sheet of `QtyLeft_Stock_vs_NoStock_Oct26.xlsx`: "QTY LEFT WITH
   NO STOCK" (Indent − Dispatch, 1–25 Oct) per Section × Size × gauge, SOUTH block then WEST
   block. Blank = 0. **171 cells**; SOUTH 983 MT, WEST 1155 MT, together **2138 MT**.
   Every demand cell appears exactly once in the tab.
2. **Coil in the yard (slit)** — `baby_coils` where `deleted` is not true, `consumed` is not true,
   and the `baby_coil_id` appears in no live production's `coil_allocations`. Weight in MT.
   **239 coils, 890.2331 MT** — hyderabad 268.255, lepakshi 254.015, npmd 94.805, tapi 273.158.
3. **Mother coil (unslit)** — `coils` where `deleted` is not true and no live `baby_coils` row
   carries that `hr_coil_id`; weight = `coalesce(actual_weight, invoice_weight)`.
   **SOUTH 345.455, WEST 531.720, total 877.175 MT.** Coil on hand = **1767.4081 MT**.
   Hyderabad holds mother coil at 1.6 / 2.5 / 3.2 / 5 mm only — **its 3 mm mother coil was slit
   on 27 Oct at 04:32** and is now baby coil at 235 mm and 96 mm.
4. **Coil spec per cell** — the thickness and slit width taken from live productions joined through
   `coil_allocations.babyCoilId` to `baby_coils`. **Region-scoped**: the region's own most-used
   (thickness, width) wins; then the region's nearest gauge at that size; then the company-wide
   mode; then company-wide nearest gauge. Every row's "Width basis" column names which applied.
   Widths are NOT computed from π(OD−t) — the weld allowance is mill-specific master data.
   Both the region map and the company-wide map are read **from the database directly**; v3 inferred
   the company-wide mode by summing the per-region modes, which happened to agree on every cell
   used but is not the same computation.
5. **SKU master** — `skus`, keyed **(product_type, size, thickness)**, where size is
   `<nominal_bore> NB` for CHS and `<height>x<breadth>` for a shape. Counts under exactly that key:
   **335 rows** (322 `published`, 13 `draft`) carrying **312 distinct keys**. One of those keys has a
   NULL thickness — the *published* row `MS CHS One Helix IS 1161 YSt 210 Black 65 NBx2.8x6000` —
   so **311 keys are usable**, and that is the set the tab's "SKU master" column tests against.
   335 − 312 = **23 rows duplicate a key already present**, several of them mixing `draft` and
   `published`. None of this changes a figure here (the 39 NO SKU ROW flags reproduce exactly), but
   the catalog needs a clean-up. *(v2 of this file said 311 / 312 / 22 keys without stating the key
   definition; the counts above are the verified ones.)*

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

**1. Can mother coil serve W1?  YES, from snapshot + 3 days.**
v1's rule said "mother coil cannot serve W1 (slitting takes 2 days)" and then planned 59.15 MT of
W1 on mother coil anyway — the verifier caught both halves. The rule itself was wrong: the 14-day
lead applies to coil that must be **bought**. Mother coil is already on site, so it needs slitting
+ buffer only.
*Worked example, on the current snapshot:* 27 Oct + 2 d slitting + 1 d buffer = **30 Oct**, inside
W1 (27 Oct – 1 Nov). So SOUTH SHS 20×20 1.6 mm, fed by Hyderabad's 18.88 MT of 1.6 mm mother coil,
runs in W1 and reads "Runs from **30 Oct**". A yard-fed lot in the same week reads "Runs from
27 Oct". The date is derived from the snapshot, never written in — v4 fixed it on the tab and left
29 Oct standing in this file, which is how the same defect failed verification twice.

**2. Is the coil spec region-scoped or company-wide?  REGION-scoped, with a labelled fallback.**
v1 used the company-wide mode silently, so 44 rows claimed "slit N of M times at this size+gauge"
for sizes their own region has never run.
*Worked example:* WEST SHS 25×25 2.5 mm. v1 quoted "2.5 × 94 mm, slit 21 of 50 times" — that is
Hyderabad/Lepakshi history; WEST has never produced SHS 25×25 at all. v2 quotes the company-wide
width and says so: *"company-wide width — West has never run this size"*.
Where the region has its own history the width can differ: SOUTH SHS 100×100 4 mm is **391 mm**
South-only versus 395 mm company-wide.

**The nearest-gauge fallback carries the WIDTH only.** The thickness stays the demand gauge — you
buy 2.8 mm coil for a 2.8 mm tube. *Worked example, on the current snapshot:* SOUTH SHS 100×100
2.8 mm has no South 2.8 mm history at that size, so the width comes from South's own 3 mm run
(395 mm) and the spec reads **2.8 × 395 mm**, basis "South width from its own 3mm run (2.8mm never
run here)" — against a South pool of 27.72 MT yard and 173.00 MT mother at that tolerance.

*Two earlier versions of this example were wrong, both worth remembering.* v2 printed SOUTH RHS
80×40 3 mm as "2.6 × 235", carrying the historical thickness through as well — the tab was right and
this file was wrong. v4 kept that row as the example, but by then it had **stopped being a fallback
case at all**: the productions booked overnight on 27 Oct created South 3 mm history at that size,
so it now reads "South has slit this 3 of 3 times" with a 12.82 MT yard pool. **A worked example
built on production history expires when the mills run.** Re-check every example against the tab on
each rebuild.
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
@1.6 → OD_m 49.2, both **3.25%, both in band**. (The doc's example is OD_m **122.95**; the research
brief prints 122.9, truncated. No cell in the tab carries OD_m, and T/D rounds to 3.3% either way.)

For a round, D is the **IS 1161 outside diameter** — and for 125 and 150 NB that is a constant taken
**from the standard, not from the database**: `skus.outside_diameter` stops at 114.3 mm (100 NB), so
139.7 and 165.1 mm are supplied here. The choice is load-bearing and the margin is thin:
**SOUTH CHS 150 NB 5 mm is 5 / 165.1 = 3.03%**, only 0.03pp inside the band. On the ASME/DN value of
168.3 mm it is 2.97%, band-edge, and its floor becomes 12 MT instead of 8. No tonnage moves either
way today — that cell is blocked for having no SKU master row — but if 150 NB is ever planned, the
diameter source decides its floor.

**The band test is inclusive, `3% ≤ T/D ≤ 8%`, evaluated at full double precision with π to 15
figures.** One cell sits on the knife edge: **WEST SHS 32×32 3.0 mm computes to 8.0075%**, so it is
BAND EDGE and carries a 12 MT floor against 11 MT of demand. Coarser arithmetic — π as 3.14, or
OD_m rounded to 37.5 — flips it to in-band, floor 8, and the cell would pass Level 2. It is blocked
for having no SKU master row, so **0 MT is at risk today**; if that SKU is created, 11 MT changes
bucket on a 0.0075pp margin. Worth a business decision on the band's precision before then.
*Regression note:* the one row this definition moves is **SOUTH RHS 40×20 1.2 mm (10 MT)** — in band
under the correct formula, so its floor is 8 MT not 12 and it passes Level 2; it is still not planned,
because there is no 1.2 × 117 mm coil in South, so it reads "NO COIL" instead of "under gauge floor".

## The identity that must hold (nothing netted)

```
qty left = planned + deferred(min campaign) + deferred(gauge floor) + blocked(no coil)
           + run-short + blocked(no SKU row) + blocked(no slitting spec)
2138.0   = 509.21  + ...                     (see the tab's reconciliation block)
```
The tab prints every component and they sum to 2138.00. Coil: **1767.4081** on hand, 530.43 consumed, **1236.98 MT left unused** — the wrong thickness or
width for what is owed.

**5. A plan is a snapshot, and it expires.**
v3 passed on the 26 Oct position and was stale by the next morning: `HYD-1026-370` (Hyderabad,
3 mm, 23.51 MT mother coil) was **slit at 27 Oct 04:32** into 235 mm and 96 mm baby coil, and
productions booked at 04:33, 04:35 and 05:15 consumed nine yard coils. Coil on hand fell
1805.21 → 1767.41 MT. Two consequences now written into the rules:

- **Every output states the snapshot it was cut from**, and says that anything slit or produced
  after it is not reflected. A cosmetic rebuild must re-pull the data or it silently re-publishes
  stale figures as current — which is exactly what happened when a presentation grid was added.
- **Slitting destroys width optionality.** While a coil is unslit the plan may slit it to whatever
  width a cell needs; the moment the slitter runs, the width is fixed. So any lot fed by mother coil
  is a plan that expires when that coil is slit. Both SHS 72×72 3 mm and SHS 100×100 2.8 mm had been
  planned on `HYD-1026-370`, and both re-sourced in v4 **without leaving Hyderabad**: 72×72 3 mm runs
  entirely on Hyderabad's **3.2 mm** mother coil (14.58 coil MT; 3.2 mm is 0.20 mm away from 3.0, inside the 0.35 mm band), and
  100×100 2.8 mm splits **Lepakshi 7.92 MT (3 mm mother) + Hyderabad 4.58 MT (2.5 mm mother)**.
  The tonnage survived; the coil behind it changed. Mother-coil-fed lines should be dated against
  the slitting schedule.

**The ±0.35 mm thickness tolerance is load-bearing and nobody has signed it off.** It decides which
coil may feed a cell at all: SHS 100×100 2.8 mm accepts 2.45–3.15 mm, which admits Hyderabad's
2.5 mm mother coil (0.30 mm away) and excludes its 3.2 mm (0.40 mm away, 0.05 mm outside). Tighten
the band and lots lose their coil; widen it and they gain options. The rules do not say who decides,
and it is a bigger swing than any single figure in these workbooks.

## Open, and decided by nobody yet

1. **No tie-break between mother coils.** Yard-before-mother is fixed (R7.1) and plants cannot be
   crossed by one production, but when two mother coils are both in tolerance and both ample the
   rules are silent. SHS 72×72 3 mm could legally have run on Hyderabad's 3.2 mm or Lepakshi's
   exact 3.0 mm; the build picks Hyderabad. **So this output is one of several legal plans**, and a
   rebuild could move a lot between plants without any figure being wrong. The tie-break decides
   which plant does the setup, so it is worth writing down.
2. **The ±0.35 mm thickness tolerance is unsigned and is the biggest single lever.** It is what
   admits Hyderabad's 2.5 mm mother coil to SHS 100×100 2.8 mm and excludes its 3.2 mm by 0.05 mm.
   Named as a risk here; nobody owns the decision.
3. **`coils`, `baby_coils` and `productions` carry no `updated_at`.** Freshness can only be judged
   from `created_at`, so an in-place edit to an existing row is invisible to the staleness check.
   Worth adding if these plans keep expiring overnight.

## Presentation, so it is not read as a rule breach

R5/R6 sequencing applies to the **production windows** (W1–W4). The sections below them are sorted
for their own purpose and not by R6: **Order coil** is grouped by coil spec so one purchase order
covers a run of rows, and **Fix master** is grouped by what is missing. A reader applying R6 to
those sections will think they are out of order; they are not in a window at all.

## Out of scope — stated on the tab

Demand is the no-stock back order only: not the rest of the order book, not the best estimate,
not stock cover. Mill-level sequencing and changeover hours are not modelled (the plant/mill
capability matrix does not exist — design ticket 04); the families-per-week ceiling is a crude
stand-in taken from observed behaviour. WEST "RHS 18x180" in the source sheet is almost certainly
a transposed 180x18 and is carried through as given.

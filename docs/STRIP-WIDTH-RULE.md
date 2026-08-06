# Strip Width Rule

> Read this before changing `requiredStripWidth`, the width filter in Production, or the width
> input in Slitting. Companion to `docs/ALGORITHMS.md`, which covers FIFO, weight and costing.
>
> The rule described here is **proposed, not yet in the code** — see
> `docs/strip-width-rule-plan.md` for the change plan and its open decisions.

## What a strip width is

A pipe starts as a flat strip of steel. The mill bends it into shape and welds the seam. So every
pipe size needs a strip of a particular width, and Slitting is the stage that cuts a 1250 mm mother
coil into strips of that width.

Get the width wrong and the app cannot tell which baby coil in the yard can make which pipe. That
matters because width is half of Production's eligibility test:

```
  operator picks a SKU
        │
        ├─ requiredStripWidth(sku) ──► keep coils within ±5 mm      ← this document
        │
        └─ rmRollsFg(coil, sku)    ──► keep legal RM→FG pairings    ← docs/ALGORITHMS.md
                    │
                    ▼
            coilFifoAllocate  ──►  suggestion only, never auto-saved
```

Both filters must pass. A coil failing either is not suggested, though the operator can still pick
it by hand — the manual picker is deliberately never spec-filtered.

## The rule is a lookup, not a formula

**The plant slits to a fixed set of mill widths, and one width feeds several pipe sections.**

That second half is the part no formula can express:

| Strip | Feeds | Outer perimeter would say |
|---|---|---|
| 76 mm | CHS 26.9 | π × 26.9 = **84.5** |
| | SHS 20x20 | 2 × (20+20) = **80.0** |
| 148 mm | CHS 48.3 | 151.7 |
| | SHS 38x38 | 152.0 |
| | RHS 50x25 | 150.0 |

One strip, two shapes, one correct answer — and any function of the finished pipe's geometry
necessarily returns two different numbers. The physical reason is that the strip is formed into a
round tube first and squeezed square afterwards if a square is wanted, so both come off the same
setting. That mechanism is inference; the width sharing is measured.

This is the same shape of problem as `RM_TO_FG_THICKNESS`, which replaced a ±0.3 mm thickness band
for the same underlying reason: a real mill constraint is a table of what the plant actually runs,
not a tolerance around a computed ideal.

## The table

Nominal slit width per section. Tolerance is `WIDTH_TOL_MM` = ±5 mm, unchanged.

| Strip | Sections it feeds | Stock band |
|---|---|---|
| 64 | CHS 21.3 | 64–65 |
| 76 | CHS 26.9, SHS 20x20 | 74–78 |
| 96 | CHS 33.7, SHS 25x25 | 94–97 |
| 116 | RHS 40x20, SHS 30x30 | 114–118 |
| 129 | CHS 42.4 | 126–131 |
| 148 | CHS 48.3, RHS 50x25, SHS 38x38 | 146–150 |
| 185 | CHS 60.3 | 182–187 |
| 196 | RHS 60x40, RHS 75x25, SHS 50x50 | 194–198 |
| 235 | CHS 76.1, RHS 80x40, SHS 60x60 | 232–237 |
| 272 | CHS 88.9 | 270–275 |
| 295 | RHS 100x50, SHS 75x75 | 292–297 |

Sections are keyed `CHS <outsideDiameter>` for round and `<type> <height>x<breadth>` for
rectangular — `CHS 48.3`, `SHS 38x38`, `RHS 100x50`.

## Invariants

Three properties the table must keep. Break any one and the rule stops meaning what it says.

**1. No two ±5 mm windows may overlap.** If they did, a single slit width would be eligible for two
unrelated sections and the filter would stop discriminating. The tightest neighbours are 185 and 196
— their windows end at 190 and start at 191. One millimetre of clearance, so any new width must be
checked, not assumed.

**2. Every section appears exactly once.** A section in two rows would make `requiredStripWidth`
depend on table order.

**3. Every width in stock should fall inside some window.** Today two baby coils (398 mm, 14.6 T)
do not, and they can feed nothing. A rising count here means either the table is stale or Slitting
is cutting widths the mill cannot use.

## Why ±5 mm, and why the table has no thickness column

The cut tightens slightly as gauge rises — SHS 50x50 runs 198 mm at 1.6 mm thickness down to 194 mm
at 4.0 mm. That is a 2–4 mm spread across the full gauge range, which sits inside ±5 mm.

A thickness column would capture it, and should still be resisted. The widths here are read off
historical attribution data that issue #99 shows is partly wrong, so a second dimension would be
fitting noise. One dimension plus a tolerance is the honest resolution of this evidence.

## When a section has no rule

`requiredStripWidth` returns **0** for a section absent from the table, and 0 means *no rule* — the
caller drops the width filter, matches on thickness alone, and must say so on screen.

This deliberately differs from `allowedRmThickness`, where an FG gauge missing from the sheet yields
no eligible coil at all and never falls back.

The asymmetry is intentional:

| | Missing thickness rule | Missing width rule |
|---|---|---|
| Behaviour | No coil offered | Thickness-only match, warned |
| Why | A wrong pairing actively misled the operator into an impossible coil | A missing width only widens the suggestion |

Production **records a run that already happened on the floor**. It is not permission to run it.
Refusing to record real output because a newly added size is missing from a table is the worse
failure of the two. Warn loudly; never block.

## Adding a new size

1. Confirm the slit width with the plant. Do not derive it from geometry — that is the defect this
   rule exists to fix.
2. If the width already exists, add the section to that row. If it does not, add a row and check
   invariant 1 against both neighbours.
3. Add a case to the `requiredStripWidth` tests.

## How the table was derived, and how far to trust it

Read off 1,914 historical production allocations: the modal slit width per section, snapped to the
centre of its stock band. Measured against that history:

| | Outer-perimeter formula | This table |
|---|---|---|
| Allocations matching within ±5 mm | 1,489 / 1,914 (77.8%) | 1,817 / 1,914 (**94.9%**) |
| Productions with no spec-matching coil | **94** of 1,263 | **0** |
| Baby coils on hand left unexplained | — | 2 of 1,949 |

**The 94 → 0 is the point.** Under the old formula 94 production runs had no eligible coil at all,
so the operator overrode the suggestion by hand and — before `capAllocationRows` shipped — nothing
checked the pick fitted. That is the front half of the 123.3 T over-consumption in issue #99.

**The residual 97 mismatches are not a wrong nominal.** They fall in only three sections (CHS 48.3,
SHS 50x50, CHS 60.3) and their widths scatter from 64 mm to 297 mm. A wrong nominal would show a
tight cluster somewhere else. A 64 mm coil recorded against a 148 mm section is a mis-attribution,
which is what #99 is about — so that 5% is a measurement of the known data quality problem, not a
gap in the table.

**Not yet confirmed by the plant.** The evidence is strong and self-consistent, but it is read from
records the same issue says are partly wrong. Treat the table as a well-supported draft.

## What this rule does not govern

- **The Slitting width-sum check.** Σ baby widths versus mother width is a separate validation. It
  warns and does not block, correctly — of 251 mothers slit, the worst overshoot is 10 mm on a
  1250 mm coil (0.8%) and the average mother is left 1.3 mm unslit. That is kerf and rounding, not
  the physically impossible over-fill that Production's capacity cap blocks.
- **Baby coil weight.** Still `(baby width ÷ Σ sibling widths) × mother weight`. Width feeds that
  split, but this rule changes no weight.
- **Any headline tonnage.** Produced, FG Left Inventory, Invoiced and Total Orders derive from
  `tubeCount × weightPerTube` and never read `coilAllocations`. This rule changes which coils get
  suggested, and therefore attribution quality and `RM Baby Coil Left` over time — nothing else.

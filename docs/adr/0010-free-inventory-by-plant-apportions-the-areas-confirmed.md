# Free inventory by plant apportions the area's Confirmed pro-rata

The `FREE INVENTORY, BY PLANT` columns on the workbook's Distributor × SKU sheet show, for one named
plant and one size, **what that plant holds less its share of what the service area has already
promised**. They replace the `ON FLOOR, BY PLANT` columns of ADR-0009, which showed the holding
alone. Nothing else on the sheet moved: `Free Stock (area)` was renamed `Free Inventory (area)` and
`Short by` is unchanged.

## Why an apportionment is unavoidable here

Confirmed tonnage belongs to a **region**, not to a plant. An order line names a distributor; any
plant whose `serves` covers that distributor's region can fill it (ADR-0006). So there is no
plant-level Confirmed to subtract, and asking for a per-plant free figure is asking for one to be
invented. The rule is the least arbitrary one available — **pro-rata by holding**, which collapses
to a single factor every plant in the area is scaled by:

```
H = Σ onhandByPlant                                    the area's floored holding of that size
freeStockByPlant[p] = onhandByPlant[p] × (1 − allConfirmed / H)       H > 0
                    = 0                                                H = 0
```

The plant with more steel carries more of the claim, the proportions between plants are the plants'
own, and no plant is charged for a commitment it cannot fill.

## What this gives up, and what survives

ADR-0009's argument against an apportioned column was that *a stock figure which reacts to somebody
else's demand is not a stock figure*, and it shipped a test multiplying one distributor's pending by
a thousand to prove the cells sat still. Free inventory cannot honour that: "free" **means** "less
what is promised".

Only **Confirmed** is netted, so exactly half of the promise survives, and both halves are asserted:

| Another distributor's… | ON FLOOR (ADR-0009) | FREE INVENTORY (this ADR) |
|---|---|---|
| Non-confirmed changes | cells sit still | **cells sit still** |
| Confirmed changes | cells sit still | cells move — correctly |

Non-confirmed has no claim on the floor until the ERP releases it, so a cell moves only when tonnage
is actually released for dispatch. What is genuinely lost is countability: a cell is no longer steel
someone can walk out and count, and the caption no longer says it is.

`onhandByPlant` therefore **stays on the row** even though nothing prints it. It is the only figure a
plant manager can measure against a floor, and it is the term ADR-0009's identity is asserted
against. The printed cells are derived from it, so deleting it would leave the printed figure with
nothing to check it against.

## How it reconciles

Two identities, each simple, composing to the whole. Both are asserted in `calc.test.js`, and both
were run over the live book:

```
Σ freeStockByPlant  ===  Σ onhandByPlant − allConfirmed        H > 0        (this ADR)
max(0, Σ onhandByPlant − onhandByPlantUnmatched)  ===  onhand               (ADR-0009, unchanged)
```

The cells therefore **add up to** `Free Inventory (area)` wherever the area holds any of the size —
which is what the old columns could not do: on-floor cells summed to the area's floor, deliberately
*more* than the Free Stock beside them.

**Where they do not add up, and it is not a corner case.** When the whole area holds NONE of a size
(`H = 0`) but distributors there have Confirmed tonnage against it, every cell reads `0.0` while the
area column reads `−allConfirmed`. Splitting that shortfall across plants holding nothing would
invent a plant-level claim on steel that is not there, so the area column carries it alone.

Run against the live book at **D = 08-Sep-2026** — 1,633 orders, 214 dispatches, 1,365 productions:

| | rows |
|---|---|
| Distributor × SKU rows the sheet prints | **674** |
| of which the area holds none of the size (`H = 0`) | 459 |
| of which the area is committed beyond its floor (`allConfirmed > H`) | 110 |
| with per-plant unmatched dispatch above zero | 55 |
| **where the cells do not add up to the area column** | **75** — every one `H = 0` |

75 of 674 is 11% of the sheet. A caption claiming the columns always add up would be wrong on one row
in nine, so it states the condition in the same breath as the claim. This is the same failure
ADR-0009 recorded a day earlier, caught the same way: by running the builder over real rows rather
than reasoning about it.

The guard is also load-bearing in code, not just prose. `allConfirmed / 0` is `Infinity` and
`0 * Infinity` is `NaN`, which exceljs writes as an **empty cell** — the one mark this sheet reserves
for "that plant does not serve you". A test pins every cell finite on the `H = 0` row.

## Consequences

- The four marks keep their jobs, with one widened: `0.0` now means "serves this region and has
  nothing free" — it holds none of the size, **or** all of it is already promised. `—` (does not
  serve) and `?` (no region) are untouched, and still must never share a value with it.
- A cell may be **negative**, in proportion to the holding, when the area is committed beyond its
  floor. It is not floored: that is the signal.
- Still **no total row**, for the reason it never had one (ADR-0002) — inside a service area stock is
  reserved to nobody, so the same tonnage repeats down the sheet and a column sum would invent steel.
- ADR-0009 is superseded on what the columns show, and stands on how the per-plant pools are built
  and reconciled.

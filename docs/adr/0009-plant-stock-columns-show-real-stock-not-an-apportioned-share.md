# Plant stock columns show real stock, not an apportioned share

> **Superseded by [ADR-0010](0010-free-inventory-by-plant-apportions-the-areas-confirmed.md)**
> on *what the columns show*. The sheet now prints FREE inventory per plant — the holding less
> the area's Confirmed, shared out pro-rata — so the cells DO move when the area's Confirmed
> moves, and the countability argument below no longer applies to the printed figure. It still
> applies to `onhandByPlant`, which stays on the row as the base the free cells are derived
> from, and everything below about building and reconciling the per-plant pools stands
> unchanged — ADR-0010's identity sits on top of this one.

The `ON FLOOR, BY PLANT` columns on the workbook's Distributor × SKU sheet show **what each plant
actually holds** of that size. They are never the service-area pool divided among the distributors
queued against it.

## The alternative we rejected

An apportioned column is tempting because it makes the arithmetic tidy: give each distributor its
"share" of the area's stock and the numbers stop repeating down the sheet. It fails on two counts.

**It is not checkable.** The promise a stock column makes is that someone can walk onto the floor and
count it. An apportioned figure corresponds to nothing physical, so a plant manager disputing it has
nothing to measure against.

**It moves when somebody else orders.** A share is a function of demand, so a distributor's stock
column would change because a *different* distributor placed an order — nothing physical having
happened. A stock figure that reacts to somebody else's demand is not a stock figure. The test for
this multiplies one distributor's pending by a thousand and asserts both cells sit still.

## What the cells mean

Four marks, four different facts. They must never share a value:

```
54.7   this plant holds that much of this size
0.0    it serves the region and holds NONE of it        — a real, countable answer
—      it does not serve the region at all              — it cannot ship to you
?      the distributor has no region                    — nobody can say which plants serve it
```

The `0.0` / `—` distinction is the one that bites. The sheet's existing `dash` helper renders a real
zero as `-`, which is exactly the mark a non-serving plant must own — so the plant columns needed
their own renderer. "We have none of it here" and "we cannot ship it to you at all" are opposite
instructions to whoever reads the sheet, and ADR-0006 already forbids showing a plant's stock outside
its service area. `?` follows the same rule as every other stock cell: unknown is not empty.

## How it reconciles

`producedPool` is `produced − dispatched`, and the serving plants partition the same rows the area
pool reads, so the unfloored per-plant weights sum to the area's unfloored weight exactly. What sits
between that and `onhand` is **two different floorings**: each cell floors its own plant (so a plant
that invoiced beyond what it recorded producing is carried out into `onhandByPlantUnmatched`), and
`onhand` floors the **combined** pool. The identity therefore carries a floor of its own:

```
max(0,  Σ onhandByPlant  −  onhandByPlantUnmatched )  ===  onhand
```

Asserted, and it holds on every row. **The floor is not decoration.** While the area holds stock the
two sides agree and the cells simply add up to the floor total. When the WHOLE AREA is over-invoiced
for a size, the left-hand side is negative while `onhand` is 0 — and on the live book at 07-Sep-2026
that was **54 of 667 rows**. The un-floored form, which is what this ADR first claimed, would have
failed the renderer's tie-out on real data the first time it ran. It was caught by running the
builders against the live book rather than by reasoning about them.

## Consequences

- The cells sum to the area's **floor**, which is **more** than the Free Stock beside them: Free Stock
  is that floor less what the area has already promised. The caption says so, because a reader who
  assumes the two should match will think the sheet is broken.
- There is still **no total row** on the sheet. Inside a service area stock is shared and reserved to
  nobody, so summing a column would report more steel than the plants hold (ADR-0002).
- Column order groups the plants by the region they serve, so a distributor's real cells sit together
  rather than straddling dashes.

# A slit coil goes into one production run

**Supersedes ADR-0007.** A slit coil counts as stock only while **no live production has been
assigned to it**, and then at its **full slit weight**. The moment a production names it in
`coilAllocations`, the whole coil is out of stock, including what is left on it. The coil is
then **used whole**, at its slit weight, on the date of the first production that names it.

Decided with the business owner on 02-Nov-2026: *"slit/slit coils which have not been assigned to
production yet will be considered as the inventory of the slit coils. Coils which have been assigned
will not be considered, even the residual MT."*

## What the rule is

```
slit coil, not deleted
 ├─ no live production names it → STOCK, at its full slit weight
 └─ a live production names it  → NOT stock, used whole on that production's date
```

| Question | Answer |
|---|---|
| What makes a coil "assigned"? | It appears in `coilAllocations` of a production that is not deleted. This is read live, never stamped on the coil. |
| Production deleted, or the coil removed from it? | The coil comes back into stock. |
| Editing a production | Its own coils stay pickable in its own form (`coilConsumption(…, editId)` excludes it). |
| Can an assigned coil go into a second run? | No. FIFO does not suggest it and the manual picker does not list it, whatever is left on it. |
| A coil that is physically gone with no production | **Delete it on Slitting.** `baby_coils` is hard-delete, so the row is gone for good. |
| The operator's **Consumed** flag | **Retired.** The per-row checkbox, the bulk "Mark consumed / active" and the Status filter were removed. `baby_coils.consumed` stays in the database, unread, and an edit carries its stored value unchanged. |
| The 0.2 T scrap floor (`SCRAP_FREE_MT`) | **Removed.** An unassigned coil carries its whole slit weight, so there is nothing left for a floor to judge. |
| What is left on an assigned coil | **Not shown anywhere.** There's no Dashboard sub-line, no Coil Tracker "Free" column or "not counted" footer, and no bridge line on the Inventory movement table. |
| "Used by production" / RM Consumed | The **whole coil**: its full slit weight, on the date of the first live production naming it, at the slit coil's plant. |

One helper decides it: `babyCoilIsStock(baby, consumed)` (with `babyCoilIsAssigned`), over a
`coilConsumption(…, 'babyCoilId')` map. The Dashboard card, Coil Tracker, Production FIFO and picker,
Raw Material report, PB MTD workbook, daily message, Inventory Snapshot and Inventory overview all
read it. `trackerEvents` is the one place RM Consumed is dated, and the Plant-wise Tracker and the
Inventory movement table both read it.

## Effect on the live database (02-Nov-2026)

"Slit Coils Left" goes from **≈1,191.1 T to 768.408 T**, all of it coils no production has touched:

| Plant | Coils | T |
|---|---|---|
| Hyderabad | 68 | 178.423 |
| Lepakshi | 77 | 368.416 |
| NPMD | 21 | 73.258 |
| Tapi | 29 | 148.311 |
| **Total** | **195** | **768.408** |

What leaves the count is **784 assigned coils holding 422.692 T** on paper, which ADR-0007 still
counted because each had at least 0.2 T left. 346.266 T of that is Hyderabad (630 coils).

The Consumed flag was worth nothing by the time it was removed: all **695** flagged coils are already
assigned to a production, so they are out either way.

## History this rule does not rewrite

**164 slit coils** are already named by 2 to 4 productions (all at one plant, 153 of them on
different days). They stay exactly as saved. Their costing and the Coil Tracker trace don't move.
Under this rule each one leaves stock once, on its first production's date, and its later runs add
nothing to RM Consumed. No report was raised on them; the owner chose to leave them as history.

## What this gives up

- **"Used by production" no longer equals what the productions recorded.** On the slit-coil
  movement table and the tracker's RM Consumed row, an assigned coil counts at its slit weight,
  not at the allocation weight. Comparing slit tonnage out against finished-pipe tonnage in now
  shows the true yield loss **plus** the leftover counted as used.
- **Over-use is no longer visible on the slit book.** ADR-0007 kept `babyCoilFree` unfloored so that a
  coil consumed past its own weight (the 445 coils / 123.3 T) showed up. Under this rule an
  assigned coil leaves at its slit weight, so the slit book can't go negative. `babyCoilFree`
  still exists (the Production picker's "free" label reads it), and the 105% capacity cap still
  blocks a save.
- **A deleted coil leaves no trace.** That's the accepted cost of deleting rather than flagging a coil
  that isn't there.

## What it gains

- **Slit Stock is exact on every day.** ADR-0011's constant "undated fact" offset (the Consumed flag
  and the scrap ends) is gone. Every coil leaves stock on a real date, so past columns of the
  Plant-wise Tracker and a past To on the Inventory overview no longer read low.
- **The slit-coil movement needs no bridge.** Opening + Slit − Used by production (whole coil) =
  Slit coil stock.
- **FIFO can't create scrap.** ADR-0007 had to keep the allocator away from 0.12 T ends. With one run
  per coil, no end is ever offered.

# Daily stock is replayed from dated events, not snapshotted

The Plant-wise Tracker's five stock rows are rebuilt from **dated events** — coil inward dates,
baby-coil conversion dates, production dates and invoice dates — so a column headed 4-Sep shows the
position on 4-Sep. Every other stock figure in the app is computed "as of now" and would have
printed today's number in all thirty-one columns.

## Why it had to be a replay

The Dashboard already answers "how is the company doing" and "how is this SKU doing". It could not
answer **"how is each plant doing, day by day"**, and a daily grid whose stock rows all read today's
snapshot is not that answer — it is today's answer, repeated, wearing thirty dates. You could not
see stock building through the month, you could not see the day a plant stopped rolling, and you
could not see raw material draining before it ran out.

## The five identities, and why they are the design

Each column reconciles on its own, so a wrong cell shows itself:

```
Coil Stock(d)  = Coil Stock(d-1) + Coil Inward(d) - Slitting(d)
Slit Stock(d)  = Slit Stock(d-1) + Slitting(d)    - RM Consumed(d)
RM Avail(d)    = Coil Stock(d)   + Slit Stock(d)
Current Inv(d) = Opening Inv(d)  + Production(d)  - Dispatch(d)
Opening Inv(d) = Current Inv(d-1)
```

They are not assertions bolted on afterwards — they are how the rows are **built**. Each stock row
is a running balance over the flow rows printed beside it, so the identity holds by construction and
the unit tests re-check it on **every** column of **every** block rather than spot-checking. That is
what stops a future change to slitting or costing quietly breaking the ledger.

Two consequences worth stating, because both were deliberate:

- **Coil Stock is mother weight less baby weight created to date**, not the all-or-nothing "has any
  baby coil" test the Dashboard's Full Coil Left card uses. Exactly **1 mother coil out of ~474** has
  ever been slit across more than one date, and the all-or-nothing test drops its whole weight on the
  first cut. Baby weights sum **exactly** to their mother's (0.0 T residual across all four plants
  and ~2,700 baby coils), so at today's date the two definitions agree and the last column still ties
  to the card above it.
- **Opening Inventory is a daily opening, not a month constant.** That is what makes each column
  self-reconciling. The month's opening — the figure originally asked for — is recovered as the MTD
  cell of that row.

## The edge of `today` (#176)

A row dated after the grid's last shown day is unplaceable on a **past** month's view, and rightly
dropped — it hadn't happened yet by that month's close, and belongs to a later month's own opening
balance instead. On the **current** month, though, the last shown day IS today, so "after it" is
never a later month arriving on schedule; it can only be a clock-skew or data-entry date that is
itself past today. Dropping that tonnage would repeat the exact hazard the undated case below exists
to avoid — the last column quietly disagreeing with the Dashboard cards, which count it now regardless
of what date is on it — so it folds into the **last** day instead. Checked against the live database
(9-Sep-2026): 0 future-dated rows across 483 coils, 2,773 baby coils, 1,378 productions and 214
dispatches — latent today, not visible on any current screenshot, and now handled rather than merely
absent.

## What the reconstruction cannot know

**`consumed` on a baby coil is a boolean with no date.** An operator marking a coil Consumed says the
floor finished it; the app records the judgement and not the day. The same is true of the scrap floor
(ADR-0007) — a coil worn below 0.2 T carries no date for when it crossed.

So both are applied as a **constant offset** on every column. Two things follow, and they are why
this is a recorded decision rather than a bug:

- Being a constant, it **cancels in the day-to-day difference**, so every identity above still
  closes. The *level* of past Slit Stock is off; the *shape* is not.
- The **latest** column therefore lands exactly on `babyCoilStock` — the Dashboard's "Baby Coils
  Left" card — so the two halves of one screen agree.

Measured on 9-Sep-2026: the residual free weight sitting on flagged coils is **19.2 T at Hyderabad
and 0 at NPMD, Lepakshi and Tapi**, against live Slit Stock of 665.5 / 302.3 / 233.9 / 255.2 T. Past
Slit Stock therefore reads at most **2.9% low at Hyderabad** and is exact elsewhere. The section
states this in a footnote on screen; a reader must not trust a past cell further than its accuracy.

**Soft-deletes carry no date either.** Deleting an old record rewrites history for every past column,
because the row simply stops existing in the replay rather than stopping on the day it was deleted.

Neither is fixed here. Dating the flag means a schema change and a backfill of a judgement nobody
recorded; dating soft-deletes means the same for every store. Both are worth doing and neither is
worth doing inside a reporting ticket.

## What this is not

It is **not** a new stock definition competing with the existing ones. The tracker's last column is
`babyCoilStock`, `Full Coil Left` and `FG Left Inventory` — the same three figures the Dashboard
cards already print. What is new is every column to the left of it.

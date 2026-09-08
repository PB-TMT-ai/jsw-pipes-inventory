# In the workbook, "Pending to Dispatch" is the stock-backed figure

The PB MTD workbook's **Pending to Dispatch** is **Confirmed + Servable – Unconfirmed** — the part of
the open book the floor can actually cover today. The whole open book (**Confirmed + Non-confirmed**)
keeps the name it already had elsewhere: **Pending to Serve**. **Total Orders** becomes **Indent**
throughout the workbook.

## What was happening

One phrase meant two things, in two places a reader holds side by side.

```
                          04-Sep-2026, the same order book
  workbook  "Pending to Dispatch"   4,550.7 T   Confirmed + Non-confirmed
  WhatsApp  "Pending to Dispatch"     805.3 T   Confirmed + Servable – Unconfirmed
```

The daily message was reshaped in `8d5de14` to answer a question a plant can act on today — *is the
steel already on the floor?* — and took the existing name with it. The workbook kept the old meaning.
`CONTEXT.md` had recorded the collision and asked for it to be settled "before either spreads
further"; it then spread further.

Nothing was wrong with either figure. Both are useful and both are still printed. The fault was that
one name carried both, so a manager quoting "pending to dispatch" in a meeting could be off by a
factor of five and nobody in the room could tell which number they were holding.

## The decision

The name goes to the **smaller, stock-backed** figure, because that is the one someone acts on: it
answers what can be shipped, and it is the figure the daily message has printed since Sep-2026 and
that people already read every morning.

This was contested. A design pass argued the opposite — leave the name on the wide figure, rename the
message instead, roughly a tenth of the blast radius. That trade-off was put explicitly, with a
mock-up showing the collision *moving* rather than closing, and the wider change was chosen anyway.

## What this costs, and why it was accepted

**The app screens are out of scope.** They still say "Pending to Dispatch" for the wide figure, so
after this the same phrase means **819 T in the workbook and 4,542 T on screen**. That is worse
before it is better, and it was accepted knowingly: the screens are ~20 places including CSV headers
other spreadsheets may already consume, and moving them is its own change with its own risk.

Two things make it survivable in the meantime:

- **Every workbook block prints its own formula.** The KPI card's caption reads
  `Conf + Servable–Unconf`; the `SERVABLE BY REGION` note names both figures and gives the wide one
  in tonnes; the `BY PLANT` note says outright that its Pending to Serve column is the whole book and
  **not** the card above it. A reader can always tell which figure they hold without knowing this ADR
  exists.
- **Both figures appear together** on the Order Status Summary — Servable – Unconfirmed, Pending to
  Serve and Pending to Dispatch on three consecutive lines. The relationship is visible, not implied.

## The third name we nearly created

A grep for every occurrence found a third name already in play, and one broken definition behind it.
The `pb-mtd-report` skill has been printing **Pending to Serve** for the wide figure in nine places —
which this decision makes exactly right, so that skill needs no change. But `CONTEXT.md` *defined*
*Pending to serve* as "the same tonnage as Pending to Dispatch" and called two names for one number
"a wart". Left alone, the glossary would have asserted the two figures were equal on the very day
they stopped being. The definition is corrected here; the usage was already correct.

That grep was the one piece of work the handoff into this change flagged as never done. Worth noting
that the answer it produced was not the one expected — the risk was in the glossary, not in the skill
everyone assumed would need rewriting.

## Consequences

- `salesKpis` and the app's own field names are **unchanged**. This is a naming decision about what
  the workbook prints, not a change to how anything is computed.
- The workbook's KPI card reads **N/A**, never 0, when no region can answer the servable question —
  the totals sum only regions that have an answer, so a plain sum of none is a confident zero meaning
  the opposite of "nobody has mapped these states yet".
- `scripts/daily-messages.test.mjs` now builds the workbook data and the message data from one set of
  rows and asserts they are deep-equal, so the two cannot drift apart again by accident.
- Renaming the app screens remains open, and is the thing that actually closes this.

# Campaign planning, explained simply

*Plain-English companion to the technical brief at [`02-research/campaign-planning-parameters.md`](../02-research/campaign-planning-parameters.md). No jargon. Read this first if you're new to the domain; read the brief when you need the formulas and sources.*

## The whole thing in three sentences

The machine makes **round pipe only**. If you want square pipe, it makes a round one and squashes it flat at the very end.

Changing the **size** of the pipe means stopping the machine and swapping heavy metal parts — about an hour. Changing the **thickness** of the pipe wall just means turning a few screws — a few minutes.

So: do all your thickness changes in a row, then swap the parts once. That's campaign planning.

## The pasta machine analogy

A hand-cranked pasta machine:

- **Which shape it cuts** — spaghetti, tagliatelle — you swap an attachment. Fiddly.
- **How thick the sheet is** — you turn a dial. Instant.

A tube mill is the same. Pipe size = the attachment. Wall thickness = the dial.

Nobody swaps the attachment between every single piece of pasta. You do all your spaghetti, then switch.

## A week on the mill

```
Mon–Wed   40 NB pipe, three thicknesses    ← just turning the dial
Wed noon  ONE HOUR STOP, swap the parts
Thu–Fri   100×100 square, two thicknesses  ← dial again
```

One stop. Jumping back and forth between sizes would have cost five hours instead of one.

## Squares are secretly round

The mill can't form a square directly. It always makes a round tube first, then squashes it into a square in the last few metres of the line.

```
flat strip → rolled into ROUND tube → welded → squashed into SQUARE
             ↑                                  ↑
        the expensive parts               cheap, at the very end
```

So when you run 100×100 square tube, the machine is really running a round tube of roughly 127 mm and flattening it. That hidden round is called the **mother round**.

**Two consequences:**

1. A plant that mostly sells square tube still describes its capability as a round-diameter range — because the round is the real constraint.
2. Two products that look totally different to a customer may share the same mother round, which means they belong in the same campaign. Group by mother round, not by what the product looks like on the invoice.

*(The 127 mm figure: a 100×100 square has a 400 mm perimeter, and 400 ÷ π ≈ 127. Real mills adjust slightly for corner rounding — this is illustrative, not a formula to code.)*

## The catch: extremes are harder

Very thin walls and very thick walls are both harder for the machine than middling ones — like the extreme settings on the pasta dial not working as nicely as the middle.

Roughly, one set of parts is comfortable while the wall thickness is between **3% and 8% of the diameter**. Run your own products through that:

| Product | Thickness vs diameter | Comfortable? |
|---|---|---|
| 40 NB × 2.6 | 5.4% | Yes |
| 40 NB × 3.2 | 6.7% | Yes |
| **40 NB × 4.0** | **8.3%** | **No — too thick for its size** |
| 100×100 square × 2.0 | 2.0% | No — too thin for its size |
| 100×100 square × 4.0 | 3.1% | Yes |

Small pipe struggles at the **thick** end. Big pipe struggles at the **thin** end. The easy zone runs diagonally across the matrix.

**This explains a real prototype behaviour.** The campaign matrix kept flagging that *40 NB × 4.0 misses its floor*. That was read as a data quirk. It isn't — that product is genuinely awkward to make. The matrix was reporting something physical.

## Three things this changes in planning

**1. Order coil per cell, not per family.**
Different wall thickness needs a different strip width, because the strip has to match the tube's circumference:

- 40 NB × 2.6 → 145.6 mm strip
- 40 NB × 3.2 → 143.7 mm strip
- 40 NB × 4.0 → 141.2 mm strip

Same pipe size, three different coils. With ~14 days of coil lead time, deciding "we'll run 40 NB × 4.0 in three weeks" really means "order 141.2 mm strip this week." Miss that date and the campaign simply can't run — and unlike a chase list, it can't be recovered inside the lead time.

**2. Step gauges in a ladder.**
Within one set of parts, run 2.6 → 3.2 → 4.0 (or the reverse). Each step is a small adjustment. Jumping 2.6 → 4.0 → 3.2 means two big adjustments and more scrap for the same output.

**3. Show the awkward cells as expensive.**
The matrix currently treats every cell in a row as equally available. The 3–8% rule says otherwise. Cells outside the band should carry a visible cost — probably a change to how cells are scored, not a redesign.

## Why the matrix shape looks right

Atlas Tube — a real competitor — publishes its availability as a **size × wall-thickness grid with a frequency band in each cell**. That is the same shape as the gauge matrix, in print, for a competitor's whole product range. Good external validation for ADR-0001.

Nucor-Yamato publishes something different: a **section × week calendar** with status codes and cut-off dates. Those two artifacts do different jobs and you'd probably want both — one answers *"can I get it?"*, the other answers *"when?"*.

## The one open question

Some mills are built so that **one set of parts covers several sizes, as long as the wall thickness stays the same.** On a mill like that, the logic flips: you'd hold thickness steady and sweep through sizes.

One question to the plant, in plain words:

> **"When we go from 40 NB to 50 NB, do we have to stop and change parts?"**

- **Yes** → everything above holds. ADR-0001 stands as written.
- **No** → the mill is more flexible than assumed, and campaign planning should work down the columns of the matrix rather than along the rows. ADR-0001 would need a successor, not an amendment.

This is cheap to ask and expensive to get wrong. Worth answering before building further on the matrix.

## Where the numbers came from

- Cost ordering of changes, the 3–8% rule, and the published-calendar structures: sourced, cited in [`02-research/campaign-planning-parameters.md`](../02-research/campaign-planning-parameters.md) §11.
- The mother-round arithmetic and the "why extremes are hard" explanation: plain-language reasoning laid over those sourced facts, not separately sourced.
- Strip widths and the T/D percentages: computed against this project's own SKU families.

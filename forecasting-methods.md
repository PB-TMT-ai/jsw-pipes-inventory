# Campaign planning screen — layout resolved, and the pattern the other screens inherit

Type: prototype
Status: resolved (2026-08-02)
Follows: [07-visual-language-prototype.md](07-visual-language-prototype.md), [12-campaign-planning-logic.md](12-campaign-planning-logic.md)

## What was decided

Eight layouts were built for Campaign planning against one canonical dataset, with the console visual language from [07](07-visual-language-prototype.md) held fixed throughout. **Variant A — stacked tables in logic order — was chosen.**

Rejected, with the reason worth keeping:

| | Layout | Why not |
|---|---|---|
| B | Calendar / gantt, one row per mill | Time is not the organising question here. Surfaced a real finding though — see below. |
| C | Mill-as-column board | Load per mill is useful, but the missing per-mill capacity makes the columns half-blind. |
| D | Decision-first hero, plan collapsed below | Inverts the hierarchy for a screen that is read, not decided. May suit Sales & chase or Coils. |
| E | Two-column balance sheet | Elegant on the reconciliation constraint, weak on the thickness detail. |
| F | Master–detail rail | Loses cross-family comparison, which is most of the value. |
| G | Chain band on a shared axis | Good at the leak, thin everywhere else. |
| H | Plan over constraint | Strong second. Its threshold bars are worth grafting into A later. |

Artefacts: `~/.gstack/projects/PTOperatingsystem/designs/campaign-planning-20260801/` — `index.html` is the comparison board, `variant-a.html` the chosen screen, `approved.json` the record. Run `serve.cmd` if the board's preview tiles are blank.

## The pattern the other seven screens should inherit

1. **Reading order equals decision order.** The screen is stacked in the sequence the decision is actually taken, not grouped by data type.
2. **Name the planning levels on screen.** Campaign planning carries two: *Level 1 — run or defer, per family, decided on SIZE* and *Level 2 — the thickness ladder, decided on GAUGE*. Labelling them is what made the screen legible. Any screen with more than one decision tier should do the same.
3. **Every threshold is shown as a test, not a verdict.** Not "deferred" but `145 / 220, short by 75`. Not "run" but `+380 vs the 40 t floor`.
4. **One canonical dataset, totals derived.** No figure is typed twice. `shared.js` holds the data and every screen renders from it, which is what lets Coils derive its requirement from the same planned tonnes the campaign screen shows.
5. **The reconciliation constraint is enforced in the artefact.** Each page asserts the chain on load and prints a pass/fail banner. This caught a real error (below).
6. **Unverified figures are labelled unverified.** Where an input contradicts another input, the screen says so rather than dropping the figure or smoothing it.

## Findings this raised

- **Deferral and yield uplift must never be netted.** The self-check first failed on `deferred (233) ≠ demand − planned (170)`. The 63 MT difference is deliberate cushion planned above demand on the running families. The correct identity is `deferred − uplift = demand − planned`. One is a choice, the other is demand with nowhere to go.
- **70 MT is dropped at gauge level, invisible at family level.** 40 NB Round plans 800 t against 780 t demand and looks healthy, but its 2.0 mm (38 t) and 4.0 mm (32 t) lots both fall under the 40 t per-thickness floor and are never made. **Real unmet demand is 303 MT, not 233.** This answers the open question in [12](12-campaign-planning-logic.md): a thickness does *not* get made just because its family is running. It has its own floor. The 2.0 mm lot misses by 2 t, which is inside the noise of the estimate that produced it.
- **25–29 Aug is empty across all six mills.** The plan front-loads the month and then stops. Found by variant B.
- **Mill 2 alone carries 800 MT**, more than Bhiwadi's two mills combined. Found by variant C.

## Still open

- **Per-mill capacity is absent from the dataset** — plant totals only. This decides whether Mill 6's deferral is real or permanent: its two families carry minimums of 220 and 200 MT, and if Mill 6's monthly capacity is below those, September will defer them again and "Deferred to Sept" is a fiction.
- **The mill rate contradicts the capacity figures by roughly 12×.** At the research's 12 t/h ([01-planning-flow.md](../../pt-os-research/briefs/01-planning-flow.md), worked example), the month's 2,320 MT needs about 215 mill-hours across six mills, roughly 36 h each. The capacity table reports the plants at 89.2% used. Both cannot be true. Either these mills are far slower than the research example, or "capacity" here means committed planning tonnage rather than available mill time. The changeover ratio and the lot floor do not depend on this; every hour figure on the screen does, and is labelled unverified until it is settled.
- **The thickness split within each family is illustrative.** Family totals are real and all eight reconciliation checks pass, but the distribution across 2.0 / 2.6 / 3.2 / 4.0 mm was authored for the design. Replace with real SKU-level data before trusting any individual lot.

## Handoff — where the next session picks up

Coils to order was started and **not finished**. `DATA.coil` in `shared.js` is populated and correct but nothing renders it yet; it is inert and breaks nothing. It carries the eight coil specs, one per running lot, with yard and on-order stock, placing dates, 96% yield, 14-day lead time and ₹46,500/MT.

Two things were established before stopping:

- **The coil requirement derives from the same planned tonnes** the campaign screen uses (`coil = tube ÷ 0.96`), which is what makes the two screens reconcile rather than restate. Verified: the eight specs sum to 2,418 MT of coil against 2,320 MT of tube.
- **A defect in the sample data, not yet resolved.** The prototype's Read line says *two* orders are past their placing date; the table has *four* rows with a past date; the summary says *three overdue*. The fourth (92 × 3.2, short by only 2 MT) was called "Marginal" rather than overdue, which implies a materiality threshold that has never been stated. `DATA.coil.materialityFloor` proposes 5 MT as a placeholder — **proposed by the design, not confirmed by the business**, the same status as the movement-classification thresholds. Needs a decision on which of the three counts is right and what the floor should be. Related to [16-june-baseline-defect.md](16-june-baseline-defect.md).

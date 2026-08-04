# Campaign planning screen — layout resolved, and the pattern the other screens inherit

Type: prototype
Status: resolved (2026-08-02) · **findings partly retracted 2026-08-04**
Follows: [07-visual-language-prototype.md](07-visual-language-prototype.md), [12-campaign-planning-logic.md](12-campaign-planning-logic.md)

> **Read the [Correction](#correction--the-dataset-was-wrong-in-every-parameter-2026-08-04) before the findings.** The layout decision and the inherited pattern stand. The canonical dataset they were built on was wrong in every parameter, and two of the four findings below are withdrawn.

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

## Correction — the dataset was wrong in every parameter (2026-08-04)

The three blockers below were closed by [04](04-plant-mill-configuration.md), using the real plant configuration and real production history from the Pipes and Tubes Inventory System. **The layout decision stands. Two of the four findings above do not.**

Every parameter the canonical dataset was built on is wrong, and all in the same direction:

| Parameter | Dataset assumed | Actual | Off by |
|---|---|---|---|
| Mill rate | 12 t/h | **4.32 t/h** | 2.8× high |
| Mills | 6 | **1** | 6× |
| Plants | 3 (Raipur / Bhiwadi / Hosur) | **1 (Hyderabad)** | 3× |
| Family floor | 200–220 MT | **20 MT** | 10–11× high |
| Gauge floor | 40 MT | **3 MT** | 13× high |
| Monthly tonnage | 2,320 MT | **1,400 MT** | 1.7× high |

### Findings retracted

- **"70 MT is dropped at gauge level. Real unmet demand is 303 MT, not 233."** — **Withdrawn.** The real gauge floor is 3 MT, not 40. The 40 NB Round lots this finding rests on, 2.0 mm at 38 t and 4.0 mm at 32 t, clear the real floor by 12.7× and 10.7×. Nothing is dropped at gauge level. Unmet demand is 233 MT. The entire 70 MT was an artefact of a floor 13× too high.

  What survives is the *shape* of the claim, and it is still worth the block on screen: a gauge does have its own floor, it is 3 MT, and it drops roughly one lot a month. In July 2026, 50 of 51 gauges cleared it — the exception a CHS 42.4 lot at 2.1 MT, made anyway.
- **"Mill 2 alone carries 800 MT" and "25–29 Aug is empty across all six mills."** — **Withdrawn.** There is one mill. Both findings are properties of an invented estate. The mill column comes off the screen, and variants B and C were rejected for the right reason but on fictional evidence.

### Finding that survives

- **Deferral and yield uplift must never be netted.** `deferred − uplift = demand − planned` is an identity, independent of what the numbers are. The self-check that caught `233 ≠ 170` is the most valuable thing the artefact does and should be kept as-is.

### The finding that replaces the retracted ones

**Level 1 must test hours, not tonnage.** At a 20 MT family floor, Level 1 defers *nothing* — all 16 families produced in July 2026 cleared it, the smallest by 9.5 MT. As a run-or-defer gate the tonnage floor is close to vacuous.

```
July 2026   demand    1,400.3 MT ÷ 4.32 t/h  =  324.1 h needed
            available 27 days × 12 h         =  324.0 h

                       THE MILL IS EXACTLY FULL
```

The Level 1 block needs a running **cumulative-hours** column, and that column is where a family falls out. The tonnage floor stays as a sanity check that rarely fires. This changes the block's structure, not just its numbers — the threshold-as-a-test rule from the pattern above now reads `296.3 / 324 h` rather than `145 / 220, short by 75`.

Consequence for the pattern list: rule 6, *unverified figures are labelled unverified*, worked exactly as intended. It is what made these numbers cheap to retract instead of expensive to discover. Keep it.

## Still open

- **The canonical dataset must be rebuilt.** `shared.js` carries 2,320 MT across six mills and is now known-wrong in every parameter. Rebuild it from real production: 16 families, 51 gauges, 1,400.3 MT, 324 h, one mill. Until then every figure on `variant-a.html` is fiction, including the ones that reconcile.
- **Changeover cost was never gathered.** The 4.32 t/h rate absorbs changeover, so capacity reconciles, but rolling time cannot be split from changeover time. July ran 15 size changes and roughly 35 gauge changes. Without minutes per size change and per gauge change, sequencing can be ordered but not optimised, and the thickness-ladder direction stays unverified.
- **The second shift is unmodelled.** The mill uses 12 of 24 hours; a second shift takes capacity to roughly 2,800 MT/month and would change every deferral the screen produces. The largest lever in the business appears on no screen.
- **Coils to order is still unrendered**, and its defect is unchanged — see Handoff below. Note its 96% yield assumption was never verified either.

## Handoff — where the next session picks up

Coils to order was started and **not finished**. `DATA.coil` in `shared.js` is populated and correct but nothing renders it yet; it is inert and breaks nothing. It carries the eight coil specs, one per running lot, with yard and on-order stock, placing dates, 96% yield, 14-day lead time and ₹46,500/MT.

Two things were established before stopping:

- **The coil requirement derives from the same planned tonnes** the campaign screen uses (`coil = tube ÷ 0.96`), which is what makes the two screens reconcile rather than restate. Verified: the eight specs sum to 2,418 MT of coil against 2,320 MT of tube.
- **A defect in the sample data, not yet resolved.** The prototype's Read line says *two* orders are past their placing date; the table has *four* rows with a past date; the summary says *three overdue*. The fourth (92 × 3.2, short by only 2 MT) was called "Marginal" rather than overdue, which implies a materiality threshold that has never been stated. `DATA.coil.materialityFloor` proposes 5 MT as a placeholder — **proposed by the design, not confirmed by the business**, the same status as the movement-classification thresholds. Needs a decision on which of the three counts is right and what the floor should be. Related to [16-june-baseline-defect.md](16-june-baseline-defect.md).

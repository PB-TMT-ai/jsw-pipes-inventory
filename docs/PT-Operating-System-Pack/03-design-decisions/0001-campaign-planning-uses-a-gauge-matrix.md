# Campaign planning uses a family × gauge matrix, superseding Variant A

Campaign planning was previously settled as **Variant A — stacked tables in logic order**, chosen on 2026-08-02 after building and comparing eight layouts against one canonical dataset, and adopted as the pattern the other six screens inherit. We are replacing it, for that screen only, with a **matrix: SKU Family down the side, gauge across the top, planned MT in the cell, one plant at a time**. The reason is that the screen has changed job — it was a thing you read, and it is now a thing you edit. Variant A puts a family and its own gauge lots in two separate tables a scroll apart, which is workable when reading and hostile when typing.

## Consequences

- **Variant A's principles survive.** Reading order still equals decision order (the gauge columns run 2.0 → 4.0, which is the thin-to-thick ladder, so sequence is carried by column order). Thresholds are still shown as tests, not verdicts. The canonical dataset is still single-source.
- **Level 1 loses its own control.** Run-or-defer is no longer a field; a family is deferred when its row totals zero. This was chosen deliberately over a Run/Defer switch, at the cost of the change log recording tonnage changes rather than decisions.
- **Per-cell demand leaves the screen.** Variant A's Level 2 table showed demand and planned side by side per lot (40 NB × 2.6: demand 455, planned 470). The matrix cell shows planned only; demand moves into the Basis rail, one click away. Row totals still test against Minimum Campaign Size on screen.
- **Campaign windows move to the row header.** A gauge matrix has no axis for time. Each family row header carries its window as secondary text. This is honest only because every gauge in a family runs inside the same campaign window.
- **The other six screens are unaffected.** They continue to inherit Variant A. This ADR narrows that pattern to "screens that are read", not "all screens".
- **Mandatory plant scoping introduces blindness**, mitigated by a state marker per plant on the plant switcher, computed across all three plants rather than only the selected one.
- **The screen carries three blocks, not eight.** Plant control, matrix, one status line. The reconciliation identity collapses to a single ✓ that expands on click; the change log collapses to a count; the basis appears only while a cell has focus. The cost is real and accepted: a failing check is now one click from invisible. It was taken because a matrix earns its keep by being scannable, and every additional block competed with the grid for attention.
- **The identity needed a fourth term.** `deferred − uplift − stock = demand − planned` breaks as soon as a family is run *short* rather than deferred outright. The asserted identity is `deferred + short − uplift − stock = demand − planned`. Four quantities, none netted — the same rule this project already applied to deferral and yield uplift.

## Families can be added to a plant, as build-ahead only

A family absent from a plant can be added as a new row. **No demand moves with it** — demand stays wherever it was raised, so everything planned on an added row is Planned Stock by construction. Deliberately *not* implemented: moving a family's demand between plants, which is the "aggregate across plants" answer to the min-tonnage problem listed in [12-campaign-planning-logic.md](design-tickets/12-campaign-planning-logic.md). That would let Hosur's stranded 233 MT be made at Bhiwadi, where 120 MT sits idle. It remains available and unbuilt.

- **An added row carries no Minimum Campaign Size test.** Nobody knows what that family's minimum would be at a plant that does not currently run it, and borrowing the figure from its home mill would dress a guess as a fact. The Gauge Floor still applies — a 30 t lot is not rolled whoever it is for.
- **Capability is unverified and labelled so.** Nothing checks whether the plant's mills can physically roll the family, because the capability matrix does not exist: [04-plant-mill-configuration.md](design-tickets/04-plant-mill-configuration.md) is open and explicitly cannot be sourced by an agent. Until it exists, an added row is an assertion by the planner, not a validated plan.

## Considered and rejected

- **Family × week** — the Rolling Program shape from the research, and the one term already in the glossary that names a matrix. Rejected because with the plant already fixed, the useful question narrows to *what* is made rather than *when*, and because the mill-rate figure that any time axis depends on contradicts the capacity table by roughly 12× and is unresolved.
- **Family × mill** — only two mills per plant, so a two-column matrix.
- **Keeping Variant A and adding an eighth tab** — rejected because two screens would describe the same plan and neither would be authoritative.

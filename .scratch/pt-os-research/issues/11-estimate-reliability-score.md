# Research: making the logic visible without drowning the reader

Type: research
Status: resolved
Blocked by: —

## Question

The user's hardest requirement is "logics clear visible for each decision" — every number and every recommendation must be able to show the rule that produced it, while the screen stays visually simple. Those two pull against each other, and the resolution is a set of interaction patterns rather than a layout.

Survey how strong decision-support and analytics interfaces solve this. For each pattern, give: what it is good for, how it fails, and a concrete rendering worth copying.

Patterns to cover:

- **Drill-to-formula** — click a number, see the expression with live operands substituted in.
- **Contribution breakdown** — waterfall or decomposition showing what moved a total and by how much.
- **"Why am I seeing this"** — the affordance on an alert or a ranked item that justifies its presence and its position.
- **Assumption panels** — surfacing the inputs a projection depends on, and letting them be seen (and possibly changed) without leaving the screen.
- **What-if / counterfactual** — "this would clear if X changed by Y". What makes this useful rather than a toy.
- **Confidence and provenance** — showing how fresh the data is, where it came from, and how sure a number is, without a wall of caveats.
- **Audit trail** — how a past decision and the state it was made under are reconstructed later.

Also cover the anti-patterns: what makes explanation UI get switched off and ignored, and the evidence on progressive disclosure versus always-visible reasoning in operational tools where the reader is expert in the domain.

Give particular attention to **dense-but-calm** operational interfaces — trading, logistics and network-operations consoles — rather than consumer dashboards, since the user is an expert operator wanting high information density.

**Output**: write findings to `.scratch/pt-command-centre/research/explainability-patterns.md` and link it back from this ticket.

## Answer

Adopt one reusable component — **`Basis`** — used for every figure on every screen. Full brief: [research/explainability-patterns.md](../research/explainability-patterns.md).

- **Resolution of the density tension**: disclose by *cost of the content*, not by expertise of the reader. Arithmetic is one line and is always visible; lineage, thresholds, contribution and counterfactuals are exactly one interaction deep, in one place.
- **Three tiers.** T0 — a 1px dotted underline marking a figure as derived (zero layout cost, one meaning, system-wide). T1 — a **basis line** carrying the substituted arithmetic (`173 / 270 MT in window · floor 85.0%`), always visible, replacing today's prose subtitles. T2/T3 — the **Basis rail**, right-docked and resizable (not a tooltip, not a modal), up to 3 pinned cards for side-by-side comparison.
- **Trigger**: click or `Enter`/`b` on a focused figure; roving tabindex so a dense table is one Tab stop; `p` pins, `Esc` closes, `Ctrl+C` copies a plain-text derivation. Hover opens nothing — it only thickens the mark, which sidesteps WCAG 1.4.13 and stops accidental firing while scanning.
- **Formula rendering**: one CSS grid, one column per token, three rows — rule term / live value / source+age — so operands are always dead-centre under the term they substitute. Each operand is itself a trigger, recursing until it hits a raw record. Above four operands it switches to stacked long-division mode, which renders fair-share allocation *and its override* as one expression.
- **States**: dormant, marked, open, pinned, stale, degraded, superseded, historical (as-of), scratch, unavailable.
- **Non-negotiable prerequisite**: the derivation-object contract (tokens, operands with `class`/`source`/`as_of`/`actionable`/`locked`, threshold, contribution, counterfactual, `rule_version` stamped on the value) must be fixed before any screen is built.
- **Also flagged**: the mockup's `--ink-3` token fails AA in *both* themes (3.68:1 light, 4.27:1 dark), not just dark — and it carries every label, tick and provenance string.

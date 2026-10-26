# The derivation-object contract

Type: grilling
Status: open
Blocked by: 07

## Question

Surfaced by [Research: making the logic visible without drowning the reader](06-research-explainability-patterns.md), which named this a non-negotiable prerequisite: the data contract behind the `Basis` component must be frozen **before any screen is built**, or every screen will invent its own shape and the component stops being reusable.

Decide the schema every computed figure carries with it:

- **Tokens and operands** — how a rule is decomposed so it can be rendered as a formula with live values substituted under each term. Per operand: its class, its source, its as-of timestamp, whether it is itself drillable, whether it is user-actionable, whether it is locked.
- **Termination** — recursion continues until an operand is a raw record. Define what counts as raw here: an invoice line, a production entry, a master-data row. This is what stops explanations bottoming out in prose, which the research identifies as the main failure mode.
- **Threshold and band** — how a figure carries the rule that decides its RAG state, so the state and the number explain themselves together.
- **Contribution and counterfactual** — the shape of "what moved this" and "this would clear if X changed by Y", and which figures are required to carry them versus which may omit them.
- **`rule_version`** — the research is specific that the version must be **stamped on the computed value at compute time**, never looked up at render time, or historical figures silently re-explain themselves under today's rules. Decide where versions live and what happens to stored figures when a rule changes.
- **Degradation** — what the contract carries when data is stale, partial or missing, so the component can render honestly rather than blank.

**Done when**: the JSON shape is written down with every field, an example instance exists for at least three genuinely different figures (a simple ratio, an allocation with a manual override, a forecast), and it is agreed that no screen ticket starts before this is fixed.

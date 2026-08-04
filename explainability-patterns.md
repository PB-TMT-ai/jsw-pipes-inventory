# The June baseline does not reconcile

Type: task
Status: open
Blocked by: —

## Problem

The prototype's sample data breaks the effort's own hard rule that figures must reconcile across views. Three parts of the dataset imply three different Junes, and therefore three different answers to "how is July doing against last month".

Found 2026-08-01 while building the fast-moving-sizes section, which needed a June baseline and could not get a consistent one.

| Source | Implied June total | Implied change into July |
|---|---|---|
| Stated total, shown in three tfoots and the `ordered` Basis | 2,550 MT | **+2.8%** |
| Reverse-computed from the 6 rows of *Intake by family* | 2,646 MT | **−0.9%** |
| Reverse-computed from the 9 rows of *Intake by SKU* | 2,648 MT | **−0.9%** |
| Reverse-computed from the 9 rows of *Distributors this month* | 2,559 MT | **+2.5%** |

July intake is 2,622 MT everywhere and is not in question. Only June is.

The row-level percentages disagree with the total that sits directly beneath them in the same table. A user who checks the arithmetic on any one of these tables finds it wrong — which is precisely the failure mode ticket `06` warned about, where an explanation must terminate in an operand that survives scrutiny.

## Why it was not fixed on the spot

Repairing it means choosing which source is authoritative and rewriting the others. Both candidate repairs change accepted content:

- **Make the total right (+2.8%)** — June must fall to about 2,550, pushing most families' month-on-month figures upward. This rewrites findings already stated in prose across several views: "80 NB is down 22%", "40×40 −15.7%", "25×25 has fallen a third since May", and the Read band on Distributors.
- **Make the rows right (−0.9%)** — one number changes in three tfoots and the `ordered` Basis card, but the headline flips from *July is ahead of June* to *July is behind June*, which is a different story for the owner and contradicts `ordered`'s counterfactual text: "intake is not the problem this month."

Either way the change is a judgement about what the sample is meant to say, not a typo fix. Left for the user.

## Contained for now

The **fast-moving sizes** table added to the Distributors view deliberately publishes **no June-derived aggregate**. Its per-row `vs June` figures are copied verbatim from *Intake by SKU*, so it agrees exactly with that table; its section rows and total show only tonnes, order lines and buyer counts, all of which reconcile. The defect is not propagated, but it is also not hidden — the section rows show a dash where a group-level `vs June` would naturally sit.

**Done when**: one source is declared authoritative, the other three are brought into line, and the `ordered` Basis counterfactual is rewritten to match whichever direction survives.

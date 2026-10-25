# A Campaign keeps its Baseline across revisions

A Campaign may be revised mid-month, but the first committed version — the Baseline — is kept and
never overwritten. The month's gap is reported against the Baseline and decomposed into three named
causes: demand changed (Baseline − latest revision), never fit the hours (latest revision − what the
Hour budget allows), and the mill missed (what the budget allows − what was made). Without a kept
Baseline the plant can revise its way to a perfect score every month, which is the whole failure
this design exists to prevent.

## Considered options

**Score against the latest revision only.** One number, no versioning, no extra table. Rejected: a
plan that moves whenever reality moves is not a commitment, and "98% of plan" would mean nothing by
the 20th.

**Score against the Baseline only.** Also one number, and brutally honest. Rejected because it is
unfair in the other direction — a distributor cancelling 50 MT would read as the plant's failure,
and after two months of undeserved red nobody looks at the screen.

## Consequences

- `campaigns` cannot hold the targets directly. Targets hang off `campaign_revisions`, and revision
  1 is the Baseline by definition.
- Revising is an explicit act with a stored reason, not a side effect of editing a cell. The Plan
  side is read-only once a Campaign is Active until **Revise** is pressed.
- Attribution is first-versus-latest only. Intermediate revisions are kept but are not separately
  attributed — a per-revision ledger is a document nobody reads.
- Unplanned production is reported beside the gap, never inside it. It explains a shortfall and
  never reduces one, which is the same rule the campaign-planning research reached independently
  for deferral versus yield uplift: an explanation and a deduction are different things.

# Plant Best Estimate is derived from the distributor estimates, with no unallocated bucket

The Best Estimate used to be a single number typed on the Reports tab each time a PB MTD Dashboard
was generated. It is now held per distributor per month, and the plant figure is simply their sum —
the typed field is gone, so there is one place a target can come from and it is always attributable
to a named distributor.

We deliberately did **not** add an "Others" or "Unallocated" estimate row to absorb tonnage from
distributors nobody set a target for. That tonnage is still invoiced and still counted in the actual,
so `Invoice % of BE` will read above 100% whenever an unplanned distributor buys, without the plan
having been beaten. This is accepted: the alternative was a catch-all bucket whose number would
itself be a guess, and the over-achievement is a visible prompt to give that distributor a real
estimate rather than a figure to be quietly absorbed.

## Consequences

- A month with no distributor estimates has a plant Best Estimate of nothing at all, and
  `Invoice % of BE` and `Daily Run Rate Required` report N/A — the same behaviour the blank typed
  field used to produce.
- Estimates do not roll forward. Each new month starts empty and reports N/A until somebody types
  the plan, which is intended: a target nobody entered is not a commitment.
- Because the plant figure is a sum, deleting or orphaning one distributor's estimate silently
  lowers the plant target rather than raising an error.

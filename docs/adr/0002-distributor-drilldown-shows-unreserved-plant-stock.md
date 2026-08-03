# The distributor drill-down shows unreserved plant stock, not an allocation

The drill-down under a distributor now shows, per SKU, that distributor's Pending to Dispatch beside
the plant's On-hand stock and the resulting Short by. The On-hand figure is the whole plant's stock
for that SKU — it is **not** divided between distributors, and nothing is reserved.

The consequence is deliberate and needs stating plainly: if two distributors are each waiting on 40 T
of the same size and the plant holds 45 T, both drill-downs show 45 T On-hand and neither shows a
shortfall, even though only one of them can be served. To show a per-distributor figure honestly we
would have to allocate the pool by a priority rule (order date, Confirmed ahead of Non-confirmed,
largest order first), and that rule is a commercial policy nobody has set. Showing the true shared
pool and naming it as shared is the truthful option available today; the drill-down carries a caption
saying so.

This is also why the per-distributor stock view stays out of the PB MTD Dashboard report. That
workbook's inventory figures reconcile to the plant total, and a distributor × SKU sheet would repeat
the same tonnage on every distributor's rows — a column that, summed, would exceed the stock the
plant physically holds and contradict the sheet's own reconciliation.

## Consequences

- The drill-down answers "is there stock for this size?", not "can I promise it to this distributor?"
- If an allocation rule is agreed later, it replaces the On-hand column here rather than adding to
  it, and the caption comes off.

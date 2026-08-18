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

This was also, originally, why the per-distributor stock view stayed **out** of the PB MTD Dashboard
report: that workbook's inventory figures reconcile to the plant total, and a distributor × SKU sheet
would repeat the same tonnage on every distributor's rows — a column that, summed, would exceed the
stock the plant physically holds and contradict the sheet's own reconciliation.

**That part is amended below.** The sheet now exists; the reconciliation objection is answered by
suppressing the total rather than by withholding the sheet.

## Consequences

- The drill-down answers "is there stock for this size?", not "can I promise it to this distributor?"
- If an allocation rule is agreed later, it replaces the On-hand column here rather than adding to
  it, and the caption comes off.

## Amendment — the sheet ships anyway (issue #105)

The PB MTD Dashboard workbook now carries a fourth sheet, **Distributor × SKU**: one row per
distributor × SKU pair that is live (Pending above zero or invoiced this month), columns
`Region | State | Distributor | SKU | Invoiced MTD | Confirmed | Non-Conf | Pending | On-hand (plant) | Short by`,
sorted region → distributor → pending descending. It reads the same `salesByDistributor` call the
Sales tab drill-down reads, so the screen and the workbook cannot disagree.

**Why the reversal.** Withholding the sheet did not remove the question — it moved it offline, into
hand-built spreadsheets pasted together from two exports, which is exactly where the screen and the
workbook start to disagree. The original objection was about a *total*, not about the *rows*. The
rows are true; only their sum is a fiction. So the sum is what got removed.

**What shipped knowingly.** `Short by` stays ambiguous, and the ambiguity is accepted, not fixed. In
current data, SKU `50x50x2.0` SHS has 39.3 T on the floor and 78 T queued against it across five
distributors:

```
NEW PASHCHIM MAHARASHTRA   pending 40.0   on-hand 39.3   short by 0.7
VORA & CO                  pending 10.0   on-hand 39.3   short by 0.0   ← reads "covered"
S G ENTERPRISES            pending 10.0   on-hand 39.3   short by 0.0
ARIHANT STEEL POINT        pending 10.0   on-hand 39.3   short by 0.0
MAHENDRA ISPAT             pending  8.0   on-hand 39.3   short by 0.0
```

Vora's row reads covered while the size is oversubscribed twice over. Disambiguating it would take an
eleventh column ("other distributors' pending" — the drill-down's `All Distr. Pending`), and the
decision was to keep the sheet at ten columns. The mitigations are:

1. **The On-hand column is totalled nowhere** — no grand total, no region subtotal. In fact the sheet
   carries no total row at all: its rows only exist where an order line named a SKU, so a Pending or
   Invoiced total would not tie to the Dashboard either. Totals live on the Dashboard sheet.
2. **A caption** states plainly that On-hand is the whole plant's stock, is reserved to nobody, and is
   repeated on every distributor's row waiting on that size — and that `Short by` therefore says the
   plant has the tonnage, not that this distributor will get it.

If an allocation rule is ever agreed, it replaces On-hand and `Short by` on this sheet too, and both
the caption and the suppressed total come off together.

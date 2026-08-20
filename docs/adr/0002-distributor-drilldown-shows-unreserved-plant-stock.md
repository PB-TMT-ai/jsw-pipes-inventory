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

## Amendment 2 — the column is Free Stock, and it nets Confirmed off

The column reads **Free Stock**, not On-hand, and its value is `plant on-hand − Confirmed across
every distributor`. Both terms stay plant-wide, so the figure is still identical on every
distributor's row for a size — the sharing this ADR is about is unchanged. What changed is that the
number now answers "how much of this size is promised to nobody yet" instead of "how much exists".

**Why plant-wide Confirmed, not the row's own.** Netting only one distributor's Confirmed against a
shared pool would print a different "free" tonnage per distributor for one physical pile — a worse
lie than the shared figure this ADR already accepts.

**It is not floored.** A size committed beyond what is on the floor reads negative, and that is the
signal. On-hand keeps its floor at zero (an over-dispatched SKU cannot hold negative stock), so the
two are not the same number with a different name.

**`Short by` is unchanged** — still `max(0, pending − on-hand)`, still measured against what the
plant physically holds. A row can therefore show no shortfall beside a negative Free Stock: the
plant has the tonnage, it is just already spoken for. The caption says so.

**Known limit, accepted.** Confirmed is the ERP's `Release Qty − Invoiced Qty`, and the ERP does not
release an order until dispatch — so on the order book as it stands today Confirmed is **0 T across
all 318 open lines** while 2,512 T sits in Non-confirmed. Free Stock therefore reads exactly as
On-hand did, and only starts to move as orders are released. This was raised and accepted: the
definition is written for the order book the plant is moving towards, not the one in front of it.
Whether Confirmed should instead follow the ERP's *Order Status* column (2,098 T of lines are marked
"Confirmed" there) is a separate, larger question — it feeds the Dashboard KPIs, the Best Estimate %
and three sheets of the workbook — and is deliberately not settled here.

## Amendment 3 — the pool is a service area's, not the company's (issue #129)

Everything above is about how a pool is **divided** between the distributors queued against it: it
is not divided at all, and the sheet says so. That still holds and is unchanged.

What was wrong was **whose pool a row reads**. `producedPool` summed every plant's stock into one
number and every distributor's row read that number, whatever region the distributor was in. On
20-Aug-2026 all 1,279 production rows were Hyderabad's — a **South** plant — and the workbook was
offering that tonnage to West distributors: 50 of 270 West rows carried a Free Stock figure
(310.61 MT of distinct Hyderabad tonnage), and West's `Short by` printed **1,755.35 MT** against a
true **2,116 MT**, the whole West order book.

Since #129 a distributor is shown the stock of the plants that serve **its** region and of no
others — see ADR-0006, which records that decision and the two masters behind it. The consequences
for this sheet:

- The column is **`Free Stock (area)`**. Its caption names who serves whom and says what an empty
  West column means, because a screen of dashes otherwise reads as a loading bug.
- The **sharing this ADR is about is unchanged inside an area**: two South distributors waiting on
  one size still both see its full tonnage, `Short by` still reads 0 on a size oversubscribed
  several times over, and the column is still totalled nowhere.
- Across areas nothing repeats. A West row and a South row for the same size are now two different
  figures, which is the first time this sheet has held two.
- A distributor whose region is `Unmapped` has no derivable service area, so its stock cells read
  **`?`** — unknown, never `0`.

The eleventh column this ADR declined to add is still not added. The disambiguation it would have
provided is now partly free: much of what looked like contention was West demand competing for South
stock, and that demand is no longer in the same pool at all.

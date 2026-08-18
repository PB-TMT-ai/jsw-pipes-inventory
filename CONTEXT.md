# JSW Pipes & Tubes Inventory

The language of the pipe plant's order book, its finished-goods stock, and the monthly sales plan
that the two are measured against.

## Sales plan

**Best Estimate**:
The tonnage a distributor is planned to be invoiced in a given month. A commitment somebody typed,
never a figure the app forecast.
_Avoid_: Target, forecast, budget, BE plan

**Plant Best Estimate**:
The whole plant's monthly commitment, being the sum of every distributor's Best Estimate for that
month. It has no separate existence — nobody types it.
_Avoid_: Overall target, company BE, monthly budget

**Unallocated tonnage**:
Invoiced tonnage belonging to a distributor who carries no Best Estimate for that month. It is not
planned for and has no bucket of its own, so it pushes achievement above the plan.
_Avoid_: Others, unplanned sales, miscellaneous

## Order book

**Distributor**:
The trading customer an order and its invoices belong to. Identified by the ERP's distributor code
where one exists, otherwise by their name.
_Avoid_: Customer, client, buyer, account, party

**Confirmed**:
Ordered tonnage the ERP has released for dispatch but has not yet invoiced.
_Avoid_: Released, approved, allocated orders

**Non-confirmed**:
Ordered tonnage neither released nor cancelled — the order book behind Confirmed.
_Avoid_: Unconfirmed, provisional, tentative

**Pending to Dispatch**:
Confirmed plus Non-confirmed. Everything owed to a distributor that has not left the plant.
_Avoid_: Backlog, outstanding, open orders, unshipped

**Invoiced**:
Tonnage billed to a distributor, taken from the daily sales file. The only actual a Best Estimate is
measured against.
_Avoid_: Dispatched, shipped, sold, billed

**Pending to serve**:
The same tonnage as **Pending to Dispatch**, under the name the PB MTD workbook's KPI card and the
daily reports use. Two names for one number is a wart, not a distinction — `Pending to Dispatch` is
the preferred term and the one to use in new work; this entry exists so nobody reads them as two
different figures. Worth settling on one before either spreads further.
_Avoid_: treating it as anything other than Confirmed + Non-confirmed

## Plant

**Service area**:
The set of regions a plant will actually ship to. **South** for the plant this database describes.
It exists nowhere in the data — there is no plant column, one unnamed "the plant" throughout the
app, and no distributor carries a plant — so it is a business rule passed into a report, never a
figure read off a row. A report that ignores it will tell the sales team it can serve a West
distributor out of southern stock: on 18-Aug-2026 that was 275.7 T of the 638.6 T it claimed.
_Avoid_: Territory, catchment, coverage, allocation

**Out of area**:
Pending tonnage belonging to a distributor this plant does not ship to. It is **not** cancelled and
not someone else's problem to hide — it stays in the order book and in the plant-wide pending total,
and a service-area report states it rather than dropping it. 1,397 T on 18-Aug-2026, all West.
_Avoid_: Excluded, filtered out, other region, not our orders

**Servable**:
`min(pending, on-hand)` for one distributor and one size — the part of what they are waiting on that
is physically on the floor today. Like the On-hand it derives from, it is **shared and unreserved**:
two distributors waiting on the same size are each shown its full tonnage, so servable figures are
real per distributor and meaningless when summed across them.
_Avoid_: Available to promise, ATP, allocatable, committed

## Region

**Region**:
One of North, South, East or West — the sales grouping a distributor's tonnage rolls up to. It is
derived, never typed on a distributor: a distributor belongs to the region of its most recent order or
invoice line's ship-to state. The only thing a human types is the region for a *state*, so a new
distributor in an already-mapped state inherits it, and a distributor's state can never drift from
what the ERP said. A distributor sits in exactly one region even when it ships to several states.
_Avoid_: Zone, territory, area, cluster, branch

**Unmapped**:
What a distributor reads as when its state has no region mapping, or when it has no lines to derive a
state from at all. It is **not** a fifth region and never a "rest" bucket: it is a labelling gap, and
its tonnage stays inside every total. Fix it by mapping the state on the Sales tab, never by filtering
it out of a sum.
_Avoid_: Others, unknown, misc, N/A, unassigned

## Stock

**Physical Stock**:
Finished pipe the plant holds for a SKU, being everything produced less everything invoiced. It
belongs to the plant, never to a distributor. It is the input to Free Stock, not a figure shown on
the distributor views. Labelled **Physical Stock** on the PB MTD workbook's SKU Ageing sheet and
**Physical Inventory** as a Dashboard KPI — the same number under a headline name.
_Avoid_: On-hand, available, in stock, inventory on hand

**Free Stock**:
Physical Stock less the Confirmed tonnage of every distributor — the pipe the plant holds that is promised
to nobody yet. Goes negative when a size is committed beyond what is on the floor. Like Physical Stock it is
plant-wide and reserved to no one, so every distributor sees the same figure. Shown on the Sales SKU
Breakdown and the PB MTD workbook's Distributor × SKU sheet; the Dashboard's Free FG is the same idea
at plant level.
_Avoid_: Available stock, uncommitted stock, ATP, sellable stock

**Reservation**:
A claim by one distributor on specific stock. **The plant has none** — the term exists here only to
name what Free Stock is not. Every distributor sees the same Free Stock tonnage.
_Avoid_: Allocation, earmark, blocked stock

**Short by**:
The part of a distributor's Pending to Dispatch that the plant's Physical Stock cannot cover for that
SKU. Measured against Physical Stock, not Free Stock — it answers "does the plant physically hold it", so a row
can read no shortfall beside a negative Free Stock. Because stock is unreserved, two distributors can
each be shown as covered by the same tonnage.
_Avoid_: Shortfall, gap, deficit, unfulfillable

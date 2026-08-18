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

**On-hand**:
Finished pipe the plant holds for a SKU, being everything produced less everything invoiced. It
belongs to the plant, never to a distributor. It is the input to Free Stock, not a figure shown on
the distributor views.
_Avoid_: Available, in stock, inventory on hand

**Free Stock**:
On-hand less the Confirmed tonnage of every distributor — the pipe the plant holds that is promised
to nobody yet. Goes negative when a size is committed beyond what is on the floor. Like On-hand it is
plant-wide and reserved to no one, so every distributor sees the same figure. Shown on the Sales SKU
Breakdown and the PB MTD workbook's Distributor × SKU sheet; the Dashboard's Free FG is the same idea
at plant level.
_Avoid_: Available stock, uncommitted stock, ATP, sellable stock

**Reservation**:
A claim by one distributor on specific stock. **The plant has none** — the term exists here only to
name what On-hand is not. Every distributor sees the same On-hand tonnage.
_Avoid_: Allocation, earmark, blocked stock

**Short by**:
The part of a distributor's Pending to Dispatch that the plant's On-hand cannot cover for that SKU.
Measured against On-hand, not Free Stock — it answers "does the plant physically hold it", so a row
can read no shortfall beside a negative Free Stock. Because stock is unreserved, two distributors can
each be shown as covered by the same tonnage.
_Avoid_: Shortfall, gap, deficit, unfulfillable

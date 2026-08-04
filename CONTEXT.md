# JSW Pipes & Tubes Inventory

The language of the pipe plant's order book, its finished-goods stock, the monthly sales plan
that the two are measured against, and the monthly production plan the mill is held to.

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

## Stock

**On-hand**:
Finished pipe the plant holds for a SKU, being everything produced less everything invoiced. It
belongs to the plant, never to a distributor.
_Avoid_: Available, in stock, free stock, inventory on hand

**Reservation**:
A claim by one distributor on specific stock. **The plant has none** — the term exists here only to
name what On-hand is not. Every distributor sees the same On-hand tonnage.
_Avoid_: Allocation, earmark, blocked stock

**Short by**:
The part of a distributor's Pending to Dispatch that the plant's On-hand cannot cover for that SKU.
Because stock is unreserved, two distributors can each be shown as covered by the same tonnage.
_Avoid_: Shortfall, gap, deficit, unfulfillable

## Production plan

**Campaign**:
The set of sizes the mill will roll this month and how much of each. Fixed when committed; what
actually gets rolled is measured against it.
_Avoid_: Production plan, schedule, run plan, batch, campaign plan

**Family**:
A tube size with its wall thickness set aside — `RHS 100x50`, `40 NB`. The level a Campaign is
committed at.
_Avoid_: Size band, section, group, SKU family, product group

**Gauge**:
A Family at one wall thickness. The level the mill makes a lot at, and the finest level a Campaign
carries.
_Avoid_: Thickness, wall, variant, gauge band

**Hour budget**:
The mill time a month holds, being its working days times twelve hours. The constraint a Campaign is
planned against — not tonnage.
_Avoid_: Capacity, availability, mill hours, utilisation

**Baseline**:
The first committed version of a Campaign. It survives every later revision, so revising cannot
improve the month's score.
_Avoid_: Original plan, v1, frozen plan, snapshot

**Unplanned production**:
Tonnage made against a Family or Gauge the Campaign never committed to. It sits beside the shortfall
it helps explain and is never deducted from the Hour budget.
_Avoid_: Extra, ad-hoc, unscheduled, overrun, off-plan

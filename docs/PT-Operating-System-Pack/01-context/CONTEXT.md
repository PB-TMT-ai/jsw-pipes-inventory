# P&T Operating System

A visibility, monitoring, and planning system for a steel pipes & tubes business — plants, distributors, and sales teams — that highlights deviations along the flow from distributor demand estimates to SKU-level production campaign planning.

## Language

**Distributor**:
A channel partner who buys from the company and submits periodic demand estimates/orders. Distinct from a Dealer, who buys from a Distributor — they are different tiers, not synonyms.
_Avoid_: Stockist, channel partner

**Campaign**:
A production run on a tube mill that groups similar sizes/specifications together to minimize changeovers. Campaign planning decides which SKUs run when, and therefore when each SKU is next available.
_Avoid_: Batch, production run

**Deviation**:
A measured gap between a planned or committed value and the actual value, large enough to be surfaced for action. The specific deviation pairs tracked by the system are still being catalogued.
_Avoid_: Variance, exception

**Primary Sale**:
A sale from the company to a Distributor. What the company's own billing sees.
_Avoid_: Sales (unqualified)

**Secondary Sale**:
A sale from a Distributor onward to a dealer, retailer, or fabricator. The company cannot see this without the Distributor reporting it.
_Avoid_: Offtake (unqualified), sell-through

**SKU Family**:
A group of sellable SKUs sharing the same section shape and size (e.g., all 40 NB round pipes). Estimates, schemes, and campaign planning operate at family level; stock and dispatch operate at SKU level.
_Avoid_: Product group, category

**Price Circular**:
The company-issued price list with an effective timestamp, re-issued when input costs move. The unit of pricing truth; distributor prices and price-protection claims are derived from it.
_Avoid_: Rate card, price list (unqualified)

**Rolling Program**:
The published size-by-week campaign calendar per mill, with order cut-off dates and open/closed status per SKU family. Tells distributors when each family is next made.
_Avoid_: Production schedule (unqualified)

**Minimum Campaign Size**:
The smallest tonnage that justifies running a campaign for a SKU Family, set by the cost of changing rolls between sizes. Demand below it is deferred rather than run short.
_Avoid_: MOQ, minimum order quantity, minimum lot

**Gauge Floor**:
The smallest tonnage that justifies making a single thickness inside a campaign that is already running. A family clearing its Minimum Campaign Size does not mean every thickness within it clears the Gauge Floor.
_Avoid_: Minimum lot (unqualified), min run

**Override**:
A human decision that replaces a computed one, recorded with the value it displaced and the reason it was made. An Override does not assert that the computed value was wrong — only that it is not what will happen.
_Avoid_: Manual adjustment, exception, edit

**Planned Stock**:
Tonnes planned for production against no order and no estimate — made ahead of demand by choice. Distinct from yield uplift, which is cushion on a lot that already has demand behind it. Planned Stock, yield uplift and deferred demand are three different things and are never netted against one another.
_Avoid_: Build-ahead, buffer, excess production

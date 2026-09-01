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

**Pending to serve**:
The same tonnage as **Pending to Dispatch**, under the name the PB MTD workbook's KPI card and the
daily reports use. Two names for one number is a wart, not a distinction — `Pending to Dispatch` is
the preferred term and the one to use in new work; this entry exists so nobody reads them as two
different figures. Worth settling on one before either spreads further.
_Avoid_: treating it as anything other than Confirmed + Non-confirmed

## Plant

**Plant**:
The works that makes an order line. Four are modelled — **Hyderabad**, **NPMD**, **Lepakshi** and
**Tapi** — and a line's plant is resolved from the ERP's own Ship From Code, never typed. **All four
run the pipeline**; Lepakshi and Tapi carried orders and had never produced until ticket #156
activated them, so a "has produced nothing yet" reading of either is about their *stock*, not their
*capability*. Always named by the short name: "NPMD", never "New Pashchim Maharashtra Patra Depot".
_Avoid_: CM, company, unit, works, location, site

**Plant inheritance**:
How a mother coil, baby coil or production batch comes to know its plant. It is typed **once**, by an
operator at Coil Inward — the ERP has no view of the shop floor — and inherited from there: a baby
coil takes its mother's, a production batch takes the plant of the baby coils it consumes. Never
re-typed, never editable afterwards, because it describes where a physical object physically sits.
_Avoid_: Plant tagging, assigning a plant, re-assigning a plant

**Unattributed**:
An order **or invoice** line whose Ship From Code matched no plant, **or** a production batch whose
coils do not agree on one. It is **not a fifth plant** and not a "rest" bucket: its tonnage stays
inside every total, and the upload banner counts it so the gap gets fixed rather than filtered away.
The same rule `Unmapped` follows for region.
_Avoid_: Unknown, other, unassigned, misc, rest

**Plant selector**:
The one control, in the header, that scopes Dashboard, Coil Tracker, Dispatch, Orders and Sales to a
single plant at once — never a per-tab filter, so nobody has to reason about which view is scoped.
Defaults to **All Plants** on every load, so nothing a person already relies on moves unless they
touch it. Unattributed is one of its choices, so unresolved tonnage can be found rather than hunted
for. It does not scope Coil Inward, Slitting or SKU Master. **Production is the one screen where it
does more than filter a view**: it names the plant a new batch consumes coils from, so under All
Plants that form is withheld until a plant is chosen rather than guessing one (see _Operating
plant_). Because a Best Estimate
carries no plant, selecting one plant **withholds** the achievement figures (% of BE, Gap to BE)
rather than dividing one plant's invoiced by the whole company's plan. Reports follows it too, and a
scoped workbook says so in every sheet title and in its file name — it is not the company report.
The **unscoped** workbook is not filtered at all: it keeps every company-wide total and prints a
per-plant split beneath them (see _Plant split_).
_Avoid_: Plant filter (as a per-tab concept), plant view, plant toggle

**Plant split**:
The `BY PLANT` block beneath the PB MTD workbook's Dashboard KPIs: where the company-wide tonnage
above it actually sits, one row per plant, closed by an `ALL PLANTS` row equal to the cards. It is a
**breakdown, never a filter** — no headline number moves because of it, and the rows sum back to the
total including `Unattributed`. Beside it, **Invoiced** is labelled `Hyderabad only`, because only
Hyderabad has ever invoiced: the reports have always compared four plants' Pending to Dispatch
against one plant's Invoiced, and the split makes that visible rather than correcting it.
The daily text and WhatsApp messages carry the **same** split under the same headline — the same
figures from the same builder, reached through `scripts/daily-splits.mjs`, so a number on a phone and
a number in the spreadsheet are the same number and not two answers that agree today.
_Avoid_: per-plant report, plant-wise report, splitting the workbook

**Operating plant**:
The plant an operator is working **as** — as distinct from the plant they are looking **at**. It is
what Production's coil pickers are drawn from, and it is why a batch can never consume strip from
two plants: a coil in another state is not off-spec, it is not there. Today it is read off the plant
selector for a new batch, and off the record's own plant when editing one. That is a stand-in: the
selector answers "what am I looking at", resets to All Plants on every load, and so has to be
re-chosen. The credential store carries a plant from ticket #125, but nothing reads it yet — the
selector is still where the operating plant comes from until the login gating ships, at which point
the question stops being asked. Distinct from **Plant inheritance**, which is how a saved row got
its plant — the operating plant chooses what may be consumed, the inherited plant records what was.
_Avoid_: Current plant, active plant, my plant, plant context, default plant

**Login role**:
What a login is allowed to be, stored on the credential beside its plant and reported by sign-in
(ticket #125). Two values, and there is no third: **admin** — every plant, the whole app, the role
the pre-existing shared login already had in all but name — and **plant** — one plant's own screens.
A plant login carries that plant's id; an admin carries none, which is read as **all plants** and
never as **Unattributed**. It is **UI tidiness, not confidentiality**: every table keeps its
permissive policy and the public key still reaches all data, so a role decides what a screen shows,
never what is reachable. Since ticket #126 it decides which tabs render, which are read-only, and
whether the plant selector is offered — one pure function, `accessFor` in `src/lib/calc.js`.
_Avoid_: Permission, access level, privilege, user type, admin rights, security role

**Service area**:
The set of regions a plant will actually ship to. **Hyderabad and Lepakshi serve South; NPMD and
Tapi serve West.** It is a commercial decision, not an ERP field — it appears in no export — so it
is **stored on the plant master** (`plants.serves`, editable on the Masters tab) rather than passed
into a report. It is what decides which stock a distributor is offered: the plants that serve **its**
region, and no others. A report that ignores it tells the sales team it can serve a West distributor
out of southern stock — on 20-Aug-2026 that was 310.6 T of Hyderabad tonnage offered across 50 West
rows, with West's shortfall understated by 361 T.
_Avoid_: Territory, catchment, coverage, allocation

**Plant master**:
The four plants and, per plant, the one thing about it a person decides: its **service area**.
Everything else — Ship From Code, ERP names, coil prefix, whether it runs the pipeline — comes from
the ERP and is read-only. Ships as a code seed (`src/data/plants.js`) with the `plants` table
layered on top, per plant, so editing one plant cannot un-serve the other three.
_Avoid_: Plant table, plant config, factory list

**Distributor master**:
A **region override** per distributor, and nothing else. A distributor's region normally comes from
its ship-to state; the override exists for the exception that rule cannot express — a border depot,
a group buying through one billing state. **Blank means "use the state's region"**, which is what
almost every distributor stays on; blank is not a region and is not `Unmapped`.
_Avoid_: Distributor table, customer master, account settings

**Out of area**:
Pending tonnage belonging to a distributor this plant does not ship to. It is **not** cancelled and
not someone else's problem to hide — it stays in the order book and in the plant-wide pending total,
and a service-area report states it rather than dropping it. 1,397 T on 18-Aug-2026, all West. It is
the *audience* half of the rule: `--serves` chooses whose message this is, while the plant master
chooses whose stock they may be shown. Those were one control by accident and are now two on purpose.
_Avoid_: Excluded, filtered out, other region, not our orders

**Servable**:
`min(pending, on-hand)` for one distributor and one size — the part of what they are waiting on that
is physically on the floor today, where "the floor" is the **plants that serve that distributor's
region**. Inside a service area it is **shared and unreserved**: two distributors there waiting on
the same size are each shown its full tonnage, so servable figures are real per distributor and
meaningless when summed across them. Across service areas nothing is shared at all — a West
distributor's servable tonnage is zero while every plant serving West produces nothing, and that
zero is the true position, not a missing figure. The message **names each floor with the region it
serves** (`Stock made at: Hyderabad (South)`), read off the production rows' own plant. It says
*made at* because on-hand is produced − invoiced and nothing attributes what survives back to a
floor; where two plants serve one region their floors are summed, which is said plainly per region.
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

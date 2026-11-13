# Key Algorithm: FIFO Coil Attribution, SKU Weight & Costing

> Read this before touching `src/lib/calc.js` or anything that allocates, weighs, or costs coils.

Slitting splits HR coil→slit coils proportionally by width; Production FIFO-consumes **slit coils**; dispatch inherits the trace. **No density constants anywhere.**

Pure helpers live in `src/lib/calc.js`. Formulas:

- Weight per Piece = `SKU.weightPerTube / 1000` (kg → tonnes); Total Weight = `Pieces × Weight per Piece`.
- Slit coil weight/cost = `(slit width / Σ sibling widths) × HR coil actualWeight / costPrice` (so slit and HR coil cost-per-MT are identical).
- **FIFO allocation** (`coilFifoAllocate`): generic over `{hrCoilId, thickness, actualWeight, dateOfInward, plant}`. Production feeds it **slit coils** via an adapter (`{hrCoilId: babyCoilId, actualWeight: slit coil weight, dateOfInward: dateOfConversion, plant}`) — and **pre-filters** that adapter to coils whose slit width is within **±5 mm** of `requiredStripWidth(sku)` (skipped when the width is unknown) — then **enriches** each allocation with the HR coil `hrCoilId`. The **`plant` filter runs first, ahead of every other rule** (see below). Eligible coils are `!deleted`, `actualWeight>0`, and thickness-matched to the SKU. Production passes **`thicknessRule: true`**, which matches on the plant's **RM→FG rule sheet** (`RM_TO_FG_THICKNESS` / `rmRollsFg`) instead of a tolerance band; other callers keep the legacy symmetric band (`thickTolMm` absolute, else ±`tol` relative). Sorted oldest first (tiebreak id). So Production eligibility is **width ±5 mm AND a legal RM→FG pairing**. The relation is asymmetric and many-to-many (2.3 coil rolls 2.5 pipe but not the reverse; 3.0 coil rolls both 3.0 and 3.2; 2.2 coil rolls both 2.2 and 2.3), which is why a ±band cannot express it — the old ±0.3 mm band both admitted pairings the mill never runs (2.6 coil → 2.5 pipe) and rejected ones it does. An FG gauge absent from the sheet yields **no** eligible coil; it never falls back to a band. The sheet describes what the mill runs, so a gauge missing from it is a gap in the DESCRIPTION, not a limit on the plant: 1.2 / 3.2 / 5.0 / 6.0 were added 2026-09-18 after 508 T of coil at those gauges matched nothing while 729 T of orders stood open against pipe the master already carries and the plant had already produced. Each maps to its own gauge only — no cross-pairing was inferred. **1.4 remains absent on purpose**: one 21.3 T coil carries it, but no SKU, no order and no production ever has, so it stays a visible exception rather than being mapped to a pipe nobody sells. Fill each to nominal capacity, spilling to the next; only if pieces remain do they stretch into the ±5% over-fill band (`overTolerance`). Whole **pieces** only. Leftover → `shortfall` (never blocks — **allow + warn**). **FIFO output is only a suggestion** — it is never auto-saved; the operator's explicit selection is what `save()` persists.
- **Capacity cap** (`capAllocationRows`): a manual row filled past **105%** of its coil's remaining weight now **blocks save** (it was warn-and-save, which is how 445 slit coils came to hold 123.3 T more than they physically could). The **Fix split** action caps each row at its coil's real capacity and spills the excess down the operator's own rows, then into eligible coils they had not used. It preserves their coil choices and row order, so it is a cap on their pick — **not** the FIFO suggestion, which stays non-binding. Whole pieces only; anything that still will not fit is returned as `leftoverPieces` for the caller to surface. Under-allocating is unaffected and still saves as `partial`.
- Coil consumption (`coilConsumption`) = Σ production `coilAllocations`; a coil's free capacity = `actualWeight − consumed`.
- **Slit-coil stock: one coil, one production run** (`babyCoilIsAssigned` / `babyCoilIsStock` / `babyCoilStock`, ADR-0015, superseding ADR-0007). A slit coil is stock only while it is **not deleted** and **no live production names it** in `coilAllocations`, and it counts at its **full slit weight**. Once assigned it is out whole — what is left on it is not stock, not suggested by FIFO, not listed in the manual picker, and **not shown anywhere**. "Assigned" is read live from productions (presence in the `coilConsumption(…, 'babyCoilId')` map, not weight), so deleting or editing the production gives the coil back; the production being edited is excluded, so its own coils stay pickable. The **0.2 T scrap floor and the operator's `consumed` flag are retired** (the `baby_coils.consumed` column stays, unread). `babyCoilFree` is still unfloored and still feeds the picker label. Every screen that counts, offers or reports slit-coil stock reads these — Dashboard "Slit Coils Left", Coil Tracker, the Production FIFO adapter and manual picker, the Raw Material report, the PB MTD workbook, the daily message, the Inventory Snapshot and the Inventory overview. See `docs/adr/0015-*`.
- Bundle availability (`producedPool`) per SKU = `produced − bundled`; bundling is capped at it.
- Dispatch cost rate = `HR Coil Cost Price / HR Coil Actual Weight` (₹/MT), weight-weighted across each entry's `coilAllocations` (legacy fallback: single `traceHrCoilId`).
- **A dispatch record's weight is a function of its entries, never an independent fact** (`withDispatchEntries`): `theoreticalWeight = Σ entry weight`, `selectedBundles = entries`, and `variance = vehicleWeight − theoreticalWeight` (0 when nothing was weighed — no weighbridge reading is *no measurement*, not a variance of the whole load). Anything that changes which entries a record holds goes through this one helper — the daily upload building a record (`assembleDispatchRecords`, which both `buildInvoiceDispatches` and the legacy `buildDispatchRecords` end at) and the plant filter narrowing one (`filterDispatchesByPlant`). They previously each carried their own copy of the arithmetic in two different files, which is how the two would eventually have disagreed about what one invoice weighs. `vehicleWeight` is deliberately **not** derived: it is a whole-vehicle weighbridge figure and cannot be split when the entries are.
- **Distributor × SKU stock** (`salesByDistributor` with `opts.productions`) — per distributor and canonical SKU, scoped to the distributor's **service area** (ticket #129): its region → the plants whose `serves` includes it → the pool. `pending = confirmed + nonConfirmed`; `onhand = max(0, producedPool.availableWeight)` over **those plants'** productions less **those plants'** dispatch entries; `allConfirmed` = Σ Confirmed across every distributor **in that area**; **`freeStock = onhand − allConfirmed`** — the displayed figure, area stock promised to nobody yet, **not floored** so an over-committed size reads negative; `allPending` = Σ pending across every distributor **in that area** for that SKU; `freeStockByPlant` = that free tonnage split across the serving plants pro-rata by holding, which is what the workbook prints (ADR-0010); `shortBy = max(0, pending − onhand)` — still measured against on-hand, so a row can show no shortfall beside a negative Free Stock. All four halves move **together**: scoping only the productions would subtract South's invoices from West's empty pool and read every West SKU as negative, and would net South's Confirmed off West's zero. Inside an area the pool is still divided between nobody, so the identical tonnage repeats on every row there for that size and `shortBy` can read 0 on an oversubscribed size (ADR-0002 — 39.3 T of `50x50x2.0` against 78 T queued). **Across** areas nothing repeats: on 20-Aug-2026 every production row is Hyderabad's, so West rows read 0 Free Stock and their full pending as `Short by`, and they fill in by themselves the day NPMD produces (ADR-0006). A distributor whose region is `Unmapped` has **no known service area**, so every stock field is `null` — `?` in the workbook, an em dash on screen, **never 0**. Both the Sales tab drill-down and the PB MTD workbook's **Distributor × SKU** sheet read this one function, so screen and workbook cannot disagree (the sheet names the same figure `Free Inventory (area)`, which is not the app Dashboard's company-wide `Free Inventory (T)` — see CONTEXT.md); the sheet lists only live pairs (pending or invoiced MTD above zero), sorts region → distributor → pending desc, and **never totals `onhand`** — summing it reports more stock than the area holds. Each SKU row also carries its own **`description`** — the SKU master's when it has a row for the code, else the **order line's own** description. 37 of the ERP codes on the order book have no master row at all (ordered, never produced), and for those the order line is the only place the tube's name exists; without it both the screen and the workbook printed the raw MM ID (`1140-13075-10078295`) where the description belongs. The workbook's SKU label is derived from that description in the same `size x thickness` shape the SKU Ageing sheet uses, so the two sheets still join.
- ±5% tolerance on weight validations (via the shared `tolerance()` helper — returns `ok:true` on falsy args, so cap checks guard `actualWeight>0` explicitly).

## Daily stock is replayed from dated events (ticket #174)

`plantTrackerGrid` builds the Dashboard's Plant-wise Tracker: plant x KPI x date, in MT, and nothing
else. It takes the raw stores, the plant master, a month and today's date, and returns the whole
finished grid — blocks, rows, day columns and MTD cells, already reconciled and already ordered. The
component and the CSV export read that structure and compute nothing, which is what keeps **one**
tested seam behind every figure on that section.

Five **flow** rows are dated events bucketed into day columns:

| Row | Summed from | Dated by | Plant from |
|---|---|---|---|
| Coil Inward | `coils.actualWeight` | `dateOfInward` | `coils.plant` |
| Slitting | `babyCoils.weight` | `dateOfConversion` | `babyCoils.plant` (its HR coil's) |
| RM Consumed | Σ `productions.coilAllocations[].weight` | `dateOfProduction` | `productions.plant` |
| Production | `productions.totalWeight` | `dateOfProduction` | `productions.plant` |
| Dispatch | `dispatches.bundleEntries[].weight` | `dateOfDispatch` | the **entry's** plant, not the record's |

Five **stock** rows are running balances over them, so every column reconciles on its own:

```
Coil Stock(d)  = Coil Stock(d-1) + Coil Inward(d) - Slitting(d)     ← HR coil wt less slit coil wt to date
Slit Stock(d)  = Slit Stock(d-1) + Slitting(d)    - RM Consumed(d)
RM Avail(d)    = Coil Stock(d)   + Slit Stock(d)                    ← MT, deliberately not days-of-cover
Current Inv(d) = Opening Inv(d)  + Production(d)  - Dispatch(d)     ← the glossary's On-hand
Opening Inv(d) = Current Inv(d-1)
```

The identities hold **by construction**, not by assertion — each stock row IS the running balance —
and `calc.test.js` re-checks all five on **every** column of **every** block. Events before the month
land in the opening balances and in no day column. An event after the last shown day is dropped on a
**past** month's grid — it hadn't happened yet by that month's close, and belongs to a later month's
own opening instead. On the **current** month, though, the last shown day IS today, so "after it" is
never a later month arriving on schedule — it is a clock-skew or data-entry date past today (ticket
#176). That tonnage still exists and the Dashboard cards count it now, so it folds into the **last**
day rather than vanishing, the same tie the undated case below rests on.

**MTD:** a flow sums the month; a stock takes its **latest close** (today for the current month,
month-end for a past one), because a month of closing balances added together means nothing.
`Opening Inventory` is the exception on purpose — its MTD cell is the month's **opening**, which is
the "opening inventory of the month" figure the feature was asked for.

**RM Consumed is the whole coil (ADR-0015).** A slit coil leaves Slit Stock **whole** — its full slit
weight — on the date of the first live production that names it, at the slit coil's plant. What was
left on it is counted as used. So Slit Stock is exactly the unassigned coils on every day, past ones
included, and the latest column lands on `babyCoilStock` with no offset. (Until 02-Nov-2026 RM
Consumed was the allocation weight and the Consumed flag / scrap floor were netted as an undated
constant — ADR-0011.) A coil several productions name (164 of them, history) leaves once, on the
first.

**TOTAL is the sum of the four plant blocks**, with no Unattributed block — a knowing departure from
the DATA-MODEL rule, with an amber tripwire attached. See `docs/adr/0012-*`.

## Confirmed is netted against invoices already raised (ADR-0014)

`confirmed` is **not computed by this app**. It is read straight off the One Helix Orders workbook's
column **BE, "Release − Invoiced Qty"** (`mapOrderRow`). The ERP's own `Invoiced Qty` only fills up
once a line reaches **`Delivered`** — while it sits at `Delivery in progress` the goods are billed
but the ERP still reports 0 (or partial) invoiced, so `Release − Invoiced` never falls and the line
goes on claiming tonnage that has already shipped. On 21-Sep-2026 that was **335.8 T of a 559.9 T
Confirmed**, across 62 of 914 open lines.

One exported helper in `calc.js` nets it, on read, per order line:

```
shipped       = shippedByOrderLine(dispatches)              // orderLineId → Σ invoiced MT
surplus       = orderLineInvoiced(o, shipped) − o.invoicedQty    // ≥ 0 by construction
liveConfirmed = max(0, o.confirmed − surplus)
```

`orderLineInvoiced` takes the **larger** of the Zoho tonnage matched to the line and the order
sheet's own `invoicedQty`, so `surplus` is exactly what Zoho has billed that the ERP snapshot did
not know about. It is **self-cancelling**: once the ERP catches up the two agree, surplus is 0, and
Confirmed passes through untouched. A surplus larger than the line's own Confirmed is **clamped at
zero and never spilled into `nonConfirmed`** (16.4 T across the live book).

**Every surface that totals Confirmed calls it** — `salesKpis`, `salesByDistributor`, `salesByMonth`
and `skuInventoryRows`, and through them `reports.js` and `scripts/servable-orders.mjs`, which
consume those rows and inherit it. Netting some and not others would put the Sales tab and the
WhatsApp report on different numbers, which is worse than the bug. Two tallies in
`scripts/servable-orders.mjs` stay **raw** on purpose (`assertBundleTies`, which must tie to the
stored values, and the out-of-scope side note beside it); both carry a comment saying so.

**Knock-on, and it is not a regression:** free stock is `onhand − allConfirmed`, so lowering
Confirmed **raises** free stock by the same tonnage — it was understated while Confirmed was
overstated. ADR-0010's identity still holds exactly, because both sides read the same
`allConfirmed`. `Servable – Unconfirmed` and the workbook's `Pending to Dispatch` move with it.

**Fragility:** the Zoho→line match is a string join on item name (`attributeInvoiceLine`). If the
item text drifts, lines stop matching, `surplus` silently goes to 0 and the phantom tonnage returns.
`unmatchedOrderLines` on the upload banner is the detector. See `docs/adr/0014-*`.

## Stock is pooled per service area (ticket #129)

A distributor is only ever offered the stock of the plants that serve **its** region. The chain has
three links and every one of them is a stored fact, not a rule in prose:

```
distributor ─► region ────────────────► plants ─────────────► pool
  its most      state → region map,      plants.serves        productions AND dispatch
  recent line   or the distributor       (plant master)       entries at those plants
  's state      master's override
```

`salesByDistributor` resolves `regionOf` **before** the stock block (it used to run after, which is
one reason the pool could only ever be one global number), then builds one pool per region present:

```js
plants = plantsServingRegion(region, plantMaster(opts.plants))   // Set of plant ids
pool   = producedPool(filterByPlants(productions, plants),
                      filterDispatchesByPlants(dispatches, plants), null, keyOf)
```

**Four things move together, and must.** Scope only the productions and the numbers get *worse* than
before: dispatches unscoped subtracts South's invoices from West's empty pool (every West SKU reads
negative), `allConfirmed` unscoped nets South's Confirmed off West's zero, and `allPending` unscoped
answers "who else is queued" with distributors these plants cannot serve.

**`filterByPlants` / `filterDispatchesByPlants` are set-based siblings of `filterByPlant` /
`filterDispatchesByPlant`, and they differ on exactly one case:**

| call | result | meaning |
|---|---|---|
| `filterByPlant(rows, ALL_PLANTS)` | every row | no filter |
| `filterByPlants(rows, null)` | every row | no filter |
| `filterByPlants(rows, new Set())` | **no rows** | no plant serves here |

An empty set is an **answer**, not a missing argument. A region nobody ships to shows no stock;
falling back to "everything" there is the bug ticket #129 exists to fix, at the exact moment it
matters most. A row with **no plant** belongs to no service area — it counts toward none, exactly as
it counts toward neither plant under the header selector.

**`Unmapped` is unknown, not empty.** A distributor whose state carries no region has no derivable
service area, so it gets **no pool** and every stock field is `null`. That renders as `?` in the
workbook and an em dash on screen — never `0`, because "we hold nothing for you" and "we cannot tell
which plants serve you" are opposite instructions to whoever reads it.

## The plant filter sits ahead of the eligibility rules (ticket #124)

Allocation never crosses plants. `coilFifoAllocate` takes a **`plant`** argument and applies
`filterByPlant` to `coils` **before** any other rule runs, so width, the RM→FG thickness rule, the
already-assigned rule, prior consumption and the capacity bands are all evaluated **within one plant's
coils only**.

```
App.jsx  babyCoils ─► babyCoilIsStock, width ±5 mm ─┐   (the adapter: babyAsCoils)
                      (!deleted, not assigned)       ▼
calc.js                       plant filter ─► RM→FG thickness ─► weight>0, FIFO order
                             (filterByPlant)  (thicknessRule)
                             ▲ inside coilFifoAllocate, ahead of every rule IT applies
```

The already-assigned rule sits in the **adapter**, not in `coilFifoAllocate`: it is a fact about
slit coils, and the allocator stays generic over any coil. It belongs ahead of the allocator rather
than only on the report that counts stock, because FIFO stretching pieces onto a part-used coil is
the mechanism that *creates* scrap — 234.478 T of stock was spread over 1,430 barely-touched coils
that way (ADR-0007). With one run per coil (ADR-0015) no part-used coil is ever offered.

Two hops, and the diagram is drawn the way the code runs rather than the way the rule reads: the
width filter and the already-assigned rule are applied by Production's adapter **before** the allocator is
called at all, so `filterByPlant` is first inside `coilFifoAllocate` but not first overall. The
distinction is invisible in the result — both are pure filters over the same set, and intersection
does not care about order — but the claim below is about `coilFifoAllocate`'s own rules, so it is
worth being exact rather than letting a tidy diagram imply the app filters plant before anything.

Within the allocator, order is the point and not an implementation detail:

- **It is not a tie-breaker.** A legal RM→FG pairing sitting at another plant is not second choice,
  it is absent. An off-spec coil at my plant and a perfect one in another state both yield
  `noEligibleCoil` — which is the honest answer, because the perfect one is 700 km away.
- **FIFO never spills across plants.** Short of stock, the batch reports a `shortfall` (allow + warn,
  unchanged) rather than reaching into the other plant. The oldest coil *overall* is skipped when it
  belongs elsewhere — so the filter changes *which* coil is suggested, not merely how many.
- **Which plant.** A new production takes it from the header plant selector; editing an existing one
  uses **that record's own stored plant**, so opening another plant's batch never hides the coils it
  already consumed. Under **All Plants** the app does not know which plant is producing, so
  Production **withholds the form and asks** rather than defaulting to Hyderabad and showing an NPMD
  operator someone else's strip. Phase 3 (#117) replaces this with the plant on the operator's login.
- **The default is unchanged behaviour.** `plant` defaults to `ALL_PLANTS`, the pass-through sentinel
  `filterByPlant` already uses, so `scripts/coil-realloc-dryrun.mjs` and every other caller allocate
  across all coils exactly as before.

The **manual assigned-coil dropdown** is filtered the same way and for the same reason — plant is
the one narrowing an operator cannot override, because a coil in another state is not off-spec, it
is not there. Everything else about that dropdown is untouched: it still lists **all** of that
plant's slit coils that no other production is assigned to (ADR-0015), including off-spec ones, with the ✓ match flag and
match-then-MT-available ordering, so the operator's override survives inside their own plant.

**Still never auto-saved.** The plant filter narrows the suggestion; it does not make it binding.
`manualAlloc` is what `save()` persists, allocations still carry **both** `babyCoilId` and the HR coil
`hrCoilId`, and the saved `plant` is re-derived by `productionPlant` from the allocations themselves —
so a batch's plant describes what it actually ate, never what a form said.

## PB MTD workbook — the Distributor by Region sheet

`buildDistributorRegionData` (`src/lib/reports.js`) turns `salesByDistributor` rows into region blocks:
`Region | State | Distributor | Plan | Total Orders | Invoiced MTD | % of Plan | Gap to Plan`.

- **Region** comes from the state → region master (`distributorRegionResolver`), **State** from the
  distributor's own order and invoice lines. Neither is typed on this sheet, so a region shown in Excel
  and one shown on the Sales tab cannot diverge — `App.jsx` passes the same `stateRegions` rows in.
- **Blocks and totals.** Rows group under their region, each block closed by a region total, with a
  grand total at the foot. Region order is fixed: the four `REGIONS`, any off-list region a stored
  mapping holds, then `Unmapped` last. **State is a column only** — it gets no subtotal row. Within a
  region: biggest Plan first, then biggest invoiced, then name.
- **Plan** is the typed monthly Best Estimate, so Σ Plan **is** the Dashboard's Best Estimate KPI (both
  are Σ of the same estimates). `null` means no plan — never a plan of zero, which would read as a
  target that was then missed.
- **% of Plan** = invoiced ÷ plan, held as a **fraction** because the cell carries a percentage number
  format (`0.0%`). Measured against invoiced only, matching the plant-level Invoice % of BE.
- **One decimal, format-only.** Every tonnage cell holds the exact value and carries `#,##0.0`; nothing
  is rounded before it reaches the sheet, or the region totals and grand total would stop tying to the
  KPIs. The visible cost: displayed region totals can look a decimal off the displayed grand total
  (51.3 + 50.8 + 0.0 reads 102.1 against a grand total of 102.0). The exact values do add up. Unlike
  the SKU Ageing sheet, no `-` placeholder is used — every tonnage cell stays numeric so the sheet can
  be sorted, filtered and charted.
- **Two roads into `Unmapped`:** a state nobody has mapped, and a distributor with no order or invoice
  lines at all to derive a state from — a Plan set before its first order lands there, carrying real
  target tonnage. Both keep their full weight in the grand total.
- **Row filter:** listed if it has a Plan **or** any tonnage (invoiced or on the order book). Wider than
  the flat sheet this replaced, which dropped a distributor holding orders but no plan and no invoice —
  an omission that understated its region once Total Orders became a headline column.
- **Total Orders blends two time windows** — Invoiced MTD is this month, Confirmed / Non-Confirmed are
  an all-time snapshot of undelivered orders — so an old unserved backlog reads as heavy ordering. The
  sheet's footnote says so.

## PB MTD workbook — the BY PLANT split

`buildPlantMtdSummary` (`src/lib/calc.js` since #232, re-exported by `src/lib/reports.js`) breaks the Dashboard sheet's headline tonnage down per
plant, in a block rendered **beneath** the KPI cards — `Plant | Invoiced MTD | Confirmed | Non-Conf |
Pending to Serve | Indent`, closed by an `ALL PLANTS` row (renamed Sep-2026, ADR-0008 — the columns
are the same figures under the names that no longer collide with the KPI card above them). It is reached as
`buildMtdDashboardData(...).plantSplit`, so the workbook and anything else reporting the split read
one object.

- **No headline moves.** Every KPI above the block is computed exactly as before; the block is a
  *partition* of those figures, never a replacement. Company-wide Pending to Serve stays at the
  2615.441 MT it reads today — scoping the report to Hyderabad instead would drop it to 761.441 MT
  overnight with nothing changed in the business (#117 phase 4).
- **Two axes, two sources, neither typed.** Pending comes from the **order row's** `plant` (#118);
  Invoiced from the **dispatch entry's** `plant` (#119) — `dispatches` has no plant column, so the
  invoice side can only be per-entry. Both are the ERP's own Ship From Code (`docs/adr/0004-…`).
- **No new arithmetic.** Each row is `salesKpis(filterByPlant(orders, p), filterDispatchesByPlant(
  upToD, p), MONTH)` — the same composition the header's plant selector uses, so a plant's row and
  the same plant selected in the header cannot disagree. The group keys come from `plantKeysIn`
  (`calc.js`), which reads the field through the same `storedPlant` normalisation `filterByPlant`
  compares with — a grouping that disagreed with the filter would be a per-plant total that no
  longer sums to the All Plants one.
- **Invoiced carries its scope, derived.** `invoicing.label` reads `Hyderabad only` because Hyderabad
  is the only plant with invoiced tonnage — not because it is hardcoded. It is stamped **wherever one
  plant's Invoiced sits beside four plants' Pending**: the block's own column header, the Dashboard's
  INVOICED MTD card caption, the Invoiced lines *inside* the ORDER STATUS SUMMARY and ORDER PIPELINE
  tables, and the Invoiced column of both distributor sheets. The day a second plant invoices, every
  one of those labels changes by itself. **Labelling the four-against-one comparison is the
  deliverable — correcting it is a decision for whoever reads the report.**
- **The label is about who invoices, not about this month.** The month's own rows answer first; if
  none of them has tonnage — the 1st, before the first dispatch, when the comparison is at its widest
  (0 invoiced against 2615 MT pending) — every live dispatch answers instead. Only **named** plants
  can be a scope: `Unattributed` is a labelling gap, so a pre-#119 invoice line carrying no plant is
  still counted in the rows but can never caption the column it appears in.
- **One decision, six sites.** Whether the column needs naming is decided once in the builder and
  handed to the renderer as `invoicing.suffix` (`' · Hyderabad only'`, or empty). The renderer only
  appends it, so the card, the two Dashboard tables, the block header and the two distributor sheets
  cannot drift into saying different things about whose tonnage a column holds. The condition is not
  "one plant invoices" but the thing that actually misleads a reader — **Invoiced covers fewer plants
  than Pending does**, i.e. some plant carries pending tonnage it has invoiced none of. That also
  catches two plants of four invoicing, which a one-plant test would let through unlabelled.
- **A scoped workbook does not say ALL PLANTS.** When #121's header filter scopes the download
  (`opts.fileSuffix` set, sheet titles reading `— <Plant> only`), the block's total row reads
  `TOTAL (this workbook's plant only)`. One plant's tonnage under an `ALL PLANTS` heading, in a file
  that gets mailed on, is the mis-attribution this whole spec exists to end.
- **A plant with orders and no invoices is a row with a 0**, never a dropped row; a plant with
  neither orders nor invoices gets no row at all. The difference is `orderLines` / `invoiceLines`.
- **`Unattributed` keeps its tonnage**, exactly as `Unmapped` does on the region sheet. A plant id the
  master does not know **folds into** that one row rather than opening a second row with the same
  label — two rows reading "Unattributed" would add up and read wrong.
- **Day-capped at `D`** and filtered to the month, the same predicate `invoicedMtd` uses, so the
  `ALL PLANTS` row ties to the INVOICED MTD card.
- **`checks.invoicedTiesToAllPlants` / `pendingTiesToAllPlants`** compare the exact row sums against
  `salesKpis` run ungrouped over the same rows — **not** against `buildMtdDashboardData`'s KPI cards,
  which are derived their own way and which this builder is never shown. That cross-builder identity
  is asserted in `reports.test.js` instead, where both sides are in scope. If either check fails the
  sheet **still renders** and says so in red on its own face (a workbook that refuses to download
  tells the reader nothing).
- **One decimal, format-only**, same rule as the distributor sheets: the cells hold exact values, so
  the `ALL PLANTS` row keeps tying to the (whole-number) KPI cards above it.
- **Region, Best Estimate, Free Stock, on-hand and Short by ignore the ORDER LINE's plant.** They
  are keyed by distributor, state and SKU, and `reports.test.js` asserts that re-attributing every
  order line to a different plant leaves all of them byte-identical. Since ticket #129 the stock
  three of them DO follow a plant — the **production row's**, through the service area (ADR-0006) —
  which is a different column on a different table. The distinction is the point: where an order was
  booked never moves stock; where the stock was made decides who may be offered it.

## Daily report — the region split

`buildRegionMtdSummary` (`src/lib/reports.js`) produces the region block in the daily PB MTD text and
WhatsApp reports: **Invoiced MTD** and **Pending to serve** (Confirmed + Non-confirmed) per region,
and nothing else. It is fed to the skills by `scripts/daily-splits.mjs`, never by SQL — region is not a
column, and re-deriving the attribution in SQL produces a second answer whose failure mode (a
distributor filed under the wrong region) is invisible to the Σ checks (`docs/adr/0003-…`).

- **Two helpers, no new logic.** `salesByDistributor` gives per-distributor `mtdInvoice` and `pending`;
  `distributorRegionResolver` gives the region. Both are the same calls the Sales tab and the workbook
  make, so all three read one attribution.
- **The one asymmetry, deliberate:** tonnage is **day-capped at `D`** (so the region lines sum to the
  plant's `invoicedMtd`, which the message prints directly above them), while **region assignment is
  not** (so a distributor lands where the *Distributor by Region* sheet puts it). The two diverge only
  when a dispatch inside the month is dated after `D`; `diagnostics.invoicedAfterD` names that tonnage
  rather than letting the reports quietly disagree. Sheet 3's own invoiced column is not day-capped at
  all — a pre-existing inconsistency, not addressed here.
- **Order** is the same fixed rule as the workbook: the four `REGIONS`, then any off-list stored
  region alphabetically, then `Unmapped` **last**.
- **`Unmapped` keeps its tonnage** — a real block with real totals, never filtered out of a sum. Both
  roads in apply (a state nobody mapped; a distributor with no lines to derive a state from), though
  the daily block passes no estimates, so the plan-only road produces no phantom row here.
- **The WhatsApp message's Regions block no longer renders this split.** Since Sep-2026 it carries
  `buildServableSummary`'s columns instead (Servable – Unconfirmed | Pending to Dispatch). This
  builder still backs the PB MTD text report and the workbook, and both splits still ship from one
  run of `scripts/daily-splits.mjs`.
- **Round at print only.** `checks.invoicedTiesToPlant` / `pendingTiesToPlant` compare the exact
  region sums against the plant figures — computed here a second way, in JS from raw rows, against the
  skill's Postgres aggregate — and the script exits non-zero if either misses by more than 0.01 T. The
  printed `Total` line carries the plant figure, not the sum of the rounded region lines, so displayed
  lines can look 0.1 T off while the exact values tie.
- **Only these two metrics split.** Production, RM and Physical Inventory carry no ship-to state.

## Daily report — the plant split (ticket #128)

The same two metrics, cut the other way: **Invoiced MTD** and **Pending to Serve** per plant (the
wide book — since ADR-0008 this is NOT the workbook's *Pending to Dispatch* card, which is the
smaller stock-backed figure), in the daily PB MTD text and WhatsApp messages,
from `buildPlantMtdSummary` — the identical function the
workbook's `BY PLANT` block renders (above). `scripts/daily-splits.mjs` emits it alongside the region
split, off one fetch and one `D`.

- **No new arithmetic anywhere.** The message calls the workbook's builder. Plant *is* a column, so a
  `GROUP BY` in the report SQL would have added up — and would have been a second implementation of a
  number that already exists, which is the one thing a message read on a phone must not be
  (`docs/adr/0003-…`).
- **Two sources, both the ERP's own Ship From Code.** Pending from the order row's `plant`; Invoiced
  from the dispatch **entry's** — `dispatches` has no plant column.
- **The headline does not move.** The rows partition the same All Plants totals the message already
  printed. `checks.invoicedTiesToAllPlants` / `pendingTiesToAllPlants` assert it, and the script exits
  non-zero rather than print a split that does not add up.
- **The Invoiced label is derived, not typed.** `invoicing.suffix` (` · Hyderabad only`) and
  `invoicing.note` come from which plants actually invoiced, so the day NPMD raises its first invoice
  every message changes by itself. The skills are forbidden from hardcoding a plant name.
- **`Unattributed` keeps its tonnage**, exactly as `Unmapped` does on the region split.
- **Both splits sum to one headline**, and `reports.test.js` asserts region totals == plant totals
  over the same rows — the two blocks a reader sees under one number cannot disagree.

## Daily report — Servable – Unconfirmed

`buildServableSummary` (`src/lib/calc.js` since #232, re-exported by `src/lib/reports.js`) splits the Non-confirmed half of the open book on one
question: **is the steel already on the floor?** It produces, per region, `confirmed`,
`unconfirmed`, `servableUnconfirmed` and `pendingToDispatch` (= the first + the third).

- **Per (region, size), counted ONCE — never per distributor.** Inside a service area stock is
  shared and reserved to nobody (ADR-0002), so two South distributors queued on one size each read
  its full tonnage as servable, correctly, and adding those columns invents steel. That is the total
  `scripts/servable-orders.mjs` refuses to print, and this builder must never reconstruct it. Asking
  the question per pool instead makes the answer additive: each floor is compared with its own
  demand exactly once.
- **Confirmed has first claim.** `freeStock` (`onhand − allConfirmed`) already encodes that, so
  Non-confirmed counts only against what is left: `min(unconfirmed, max(0, freeStock))`. Netting
  Confirmed again here would subtract it twice.
- **No new stock arithmetic.** `onhand`, `allPending` and `freeStock` are read off
  `salesByDistributor`, where the service-area pooling (#129) lives and is tested. They are
  region-level constants written onto every distributor row in the region, so the builder dedupes
  rather than rebuilding a pool — a second pool builder is a second answer.
- **`Unmapped` is `null`, not `0`.** No region ⇒ no service area ⇒ the question has no answer, and
  `0` would be a false one. Its Confirmed and Non-confirmed tonnage stays on the book;
  `diagnostics.unmappedUnconfirmed` names what cannot be answered.
- **`checks.servableWithinUnconfirmed`** asserts the carve-out never exceeds what it came from. A
  breach means a pool was counted twice, and `scripts/daily-splits.mjs` exits non-zero rather than
  print tonnage the plant does not hold.

## Daily report — production and stock by plant

`buildPlantPipelineSummary` splits the production slices, FG and RM per plant. This **supersedes**
the older rule that pipeline figures are never broken down: that rule is about **region** — a coil
has no ship-to state — and it still holds. It never applied to **plant**, because a coil, a slit
coil and a finished tube each sit on exactly one floor and every row carries the `plant` it was set
at (#118, ADR-0005). So the split is a plain partition on a stored column, no identity resolution.

- **FG per plant is "made at", not "held at"** — produced − invoiced at that plant. Nothing in the
  data follows tonnage that physically moves between plants, so this is not a warehouse count.
- **RM reads `babyCoilStock`** — slit coils not yet assigned to a production, at full slit weight
  (ADR-0015) — the Dashboard's own Slit Coils Left card. A plain `Σ max(0, weight − consumed)` is a
  different and larger number.
- **Consumption and slitting are resolved over the whole register first**, then grouped. Computing
  either inside a plant filter would let a production stop counting against the coil it consumed.
- **`Unattributed` keeps its tonnage**, exactly as on the other splits, and every column ties back
  to its ungrouped figure or the script refuses to emit.


## PB MTD workbook — the Sep-2026 parity blocks

The workbook was brought level with the daily WhatsApp message, which `8d5de14` had reshaped. Four
blocks were added to the Dashboard sheet and one column group to Distributor × SKU. Every figure
comes from a builder the message already calls — there is no arithmetic here that exists twice.

**Naming (ADR-0008).** `Total Orders` → **Indent** everywhere; the wide open book → **Pending to
Serve**; **Pending to Dispatch** is now `Confirmed + Servable – Unconfirmed`. The app screens are
knowingly out of scope, so the phrase means one thing in the file and another on screen — which is
why every block prints its own formula.

**SERVABLE BY REGION** (`buildServableSummary`). Counted once per `(region, size)`, never per
distributor: inside a service area stock is shared and reserved to nobody, so summing per-distributor
servable figures invents steel the plant does not hold (ADR-0002). Reads `?` for a region with no
service area, and the total sums only regions that HAVE an answer — with none at all the card reads
`N/A`, because a plain sum of nothing is a confident zero meaning the opposite.

**STOCK MOVEMENT** (`buildPlantPipelineSummary`). Finished pipe only:

```
openingFg + producedMtd − invoicedMtd + producedAfterD − invoicedAfterD  ===  fgLeft
```

- `openingFg` is a **complement** (`producedAll − produced(≥MONTH)`), not a `date < 1st` filter. An
  undated production row is a data fault, and a date test would drop it from Opening while `fgLeft`
  kept it — the movement columns would quietly lose steel.
- The two **after-D** terms close the rest: `fgLeft` has no date cap while Opening and both MTD
  columns stop at D, so tonnage dated later sits in Current and in neither. It is reported in the
  caption, not absorbed.
- `checks.movementTiesToFgLeft` asserts it on **every row and the total**, and the block prints
  `⚠ … do not circulate this sheet` on breach.
- **Current is the Physical Inventory headline**, reached a completely different way (Σ produced −
  Σ invoiced per plant, against Σ positive on-hand less over-shipment). That makes it a genuine
  cross-check rather than arithmetic checking itself.

**BY PLANT — RAW MATERIAL.** A **position, not a movement**: a coil is not dispatched, so
`Opening + In − Out` has nothing to measure and none is implied. Slit coil reads `babyCoilStock` —
slit coils not yet assigned to a production (ADR-0015) — which is the Dashboard's own card. A
plain `Σ max(0, weight − consumed)` is a different and larger number,
and having both in circulation is how a card and a workbook start disagreeing about the same steel.

**RM is `?`, never 0, when the coil registers were not supplied.** `notDeleted(null)` returns `[]`, so
an unsupplied register computes a perfectly confident zero. `pipelineScope.rmKnown` carries the
absence and every RM cell renders `?`. An **empty** register is still a real zero — only a **missing**
one is unknown. Both registers or neither: the full-coil figure excludes HR coils that were slit and
the slit set is read off `babyCoils`, so coils alone would re-report already-cut steel as whole.

**FREE INVENTORY, BY PLANT** on Distributor × SKU (`salesByDistributor.freeStockByPlant`,
ADR-0010). What each serving plant holds of the size **less its share of the area's Confirmed**,
shared out pro-rata by holding — one factor for the whole area:

```
H = Σ onhandByPlant
freeStockByPlant[p] = onhandByPlant[p] × (1 − allConfirmed / H)   H > 0     (0 when H = 0)

Σ freeStockByPlant  ===  Σ onhandByPlant − allConfirmed           H > 0     ADR-0010
max(0, Σ onhandByPlant − onhandByPlantUnmatched)  ===  onhand               ADR-0009
```

The `H > 0` guard is load-bearing: `allConfirmed / 0` is `Infinity` and `0 * Infinity` is `NaN`,
which exceljs writes as an **empty cell** — the mark reserved for "that plant does not serve you".

So the cells **add up to** `Free Inventory (area)` wherever the area holds any of the size, and where
it holds none they read `0.0` while the area column alone carries the shortfall. At D = 08-Sep-2026
that second case was **75 of the 674 rows** the sheet prints, so the caption states the condition
beside the claim rather than after it. `onhandByPlant` stays on the row unprinted — it is the
countable base and the term ADR-0009's identity is asserted against. See the ADRs for the four cell
marks, why `0.0` and `—` must never share a symbol, and which half of "a stock figure must not react
to somebody else's demand" survives netting Confirmed.

**They cannot drift apart.** `scripts/daily-messages.test.mjs` builds the workbook data and the
message data from one set of rows and asserts the whole servable split and the whole plant pipeline
are deep-equal. Comparing whole objects is the point — a test asserting each side's own totals would
pass while the two printed different Hyderabads.

## Inventory Snapshot — RM and FG per plant (#213, first cut #214; finished-goods detail #215; RM #216)

The rules are not restated here: **`docs/inventory-dashboard-rules.md` is the rules of record** (S1
to S16) and the `data-verifier` works from it. Where this builder differs from neighbouring code:

```
                 key                       netted          floored          window
producedPool     raw code / keyOf          company or      no (caller)      —
                                           scoped pool
snapshot         section|size|thickness    per plant       per size, at 0   30 days to as-of, incl.
```

- **The size key is looser than `canonicalSkuKey`.** It drops the IS standard and the length, so
  `RHS-100x50x4.00` and `1140-13075-10074990` are one size (14.671 MT at Nippon on 28 Oct, where a
  per-code pool would read 100.965). `snapshotSizeKeyResolver` is the only place it is built.
- **It partitions once, by the stored plant**, trimmed exactly as `filterByPlant` compares it; any
  value that is not a master plant id is Unattributed. Productions by `plant`, invoices by each
  **entry's** `plant`. That is why All plants (the sum of the four rows) can leave Unattributed out
  and name it (ADR-0012) without a second pass.
- **Builder and renderer are split** (`buildInventorySnapshotData` → `renderInventorySnapshotHtml`).
  The renderer only rounds and lays out; the band colour of each row is decided in the builder.
- **Every #215 figure is read off one per-plant, per-size table** (net, sold 30d, sold 90d, ever
  sold, first made), built in the same pass as S2. Class (S8), band (S9), A-class out (S11), Excess
  (S12) and the three lists (S13) are filters over it, so they cannot disagree about a size. Excess
  is exactly the Amber MT, and the class table's plant total is exactly the plant's FG.
- **FG > 60 days reuses `skuAgeing`, one plant at a time** (S10). It is company-wide by design, so the
  builder hands it only that plant's productions and only that plant's invoice entries, keyed by the
  snapshot size key. `checks.ageingTiesToFg` asserts its surviving tonnage equals S2's FG per plant.
- **Every banded Plant summary cell gets a colour.** A-class out is Green < 10% / Amber 10 to 20% / Red above; Excess
  is Green < 30% / Amber / Red. Only a cell with nothing to divide by (`-`) is plain.
- **RM reuses the slit-coil stock helpers, it does not re-derive them** (S14). Both halves are
  `coilOnHand` (calc.js, since #286 — the week plan's coil columns read the same list): `babyCoilIsStock`
  over a `coilConsumption(…, 'babyCoilId')` map, so "not yet assigned" means here exactly what it
  means on the Dashboard card (ADR-0015). The HR coil half is wider than
  `buildRawMaterialData`'s "unslit" section on purpose: a partly slit HR coil counts what is left on
  it (weight − Σ live slit coil weight, floored per coil), where the Raw Material report drops any HR coil
  with a slit coil. Every coil sits at its own stored plant, partitioned with the same `bucketOf` as
  FG, so Unattributed RM joins the same footer line. Slit coils age by their own conversion date
  (S16), not the HR coil's inward date.

## Dispatch overview — the 10 am Scoreboard (ticket #232, part 1)

`dispatchOverview` (`src/lib/calc.js`) builds every figure above the Dispatch Records table; the
component and its four CSVs only read what it returns. No new meanings — each column is a
`CONTEXT.md` term computed by the function that already owns it:

| Screen | Rule | Computed by |
|---|---|---|
| Indent | Invoiced MTD + Confirmed + Non-confirmed | `salesKpis` |
| Invoiced MTD | the month's invoice entries **of that plant**, dated ≤ D | `salesKpis` over `filterDispatchesByPlant` |
| Confirmed | netted against **every** invoice ≤ D (ADR-0014) | `salesKpis` over `filterByPlant` |
| of which out of area | Confirmed on lines whose distributor's region the plant does not serve | `distributorRegionResolver` + `plants.serves` |
| Pending to Serve | Confirmed + Non-confirmed (the wide figure) | — |
| Oldest pending | days from `order_date` to D, oldest line with netted Confirmed > 0 | `liveConfirmed` |
| Pending to Dispatch (tiles) | Confirmed + Servable – Unconfirmed, per region (ADR-0008) | `buildServableSummary` |
| Short | area pending − area on-hand, per (region, size), region pool (ADR-0006) | `salesByDistributor` SKU rows |

**Why the plant rows do not call `buildPlantMtdSummary`.** It feeds `salesKpis` only the month's
invoices, so it nets Confirmed against this month's invoices alone. The Dashboard headline, the Sales
tab and `buildServableSummary` net against all of them. On a line Zoho billed last month while the
ERP still lags, the two differ — and the screen's whole point is that plant Confirmed equals the sum
of the region tiles. So the plant rows use the same primitives with the full netting; a test asserts
their Invoiced MTD still equals `buildPlantMtdSummary`'s, and their Total equals the headline.

**Status** (proposed thresholds, #225): red if oldest pending > 3 d; else amber if Invoiced ÷ Indent
< 90%; else green. A null (no Confirmed line, no Indent) never colours. Exactly 3 days is not late.

**Identities the tests assert:** Σ plant rows = an ungrouped Total; Total Confirmed = the Dashboard
headline; plant Confirmed = Σ region Confirmed (incl. Unmapped), with out-of-area stated; Short never
reads another region's stock; an Unmapped tile reads `?` and hides when it holds nothing.

**Worked example** (the fixture in `calc.test.js`, D = 30-Oct-2026, one size S1):

```
Order lines (Confirmed / Non-confirmed, order date)
  Hyderabad  SOUTH ONE  100 / 20   20-Oct      Hyderabad  WEST ONE   30 / 0   28-Oct  ← out of area
  NPMD       WEST ONE    40 / 10   29-Oct      NPMD       SOUTH ONE  6.8 / 0  27-Oct  ← out of area
  Lepakshi   SOUTH ONE   12 / 0    15-Sep  — Zoho billed all 12 T → netted Confirmed 0, not late
Plant Confirmed: Hyderabad 135 (incl. 5 Unmapped) · NPMD 46.8 · Total 181.8
Region Confirmed: South 100 + 6.8 = 106.8 · West 30 + 40 = 70 · Unmapped 5      → 181.8 ✓
Out of area: 30 + 6.8 = 36.8 T on 2 lines
South pool: Hyderabad 200 produced − 77 invoiced = 123 on hand; pending 126.8 → Short 3.8
            Confirmed 106.8 first, 16.2 free for 20 Non-confirmed → Pending to Dispatch 123.0
Oldest pending: Hyderabad 30-Oct − 20-Oct = 10 d → red · NPMD 3 d, 0% invoiced → amber
```

On live data (30-Oct-2026, #229): plant Confirmed 308.1 = South 180.6 + West 127.5, with 77.3 T out
of area; Pending to Dispatch South 340.3, West 213.4.

**Known limits.** A line with no `order_date` has no age and is skipped for Oldest pending (counted in
`diagnostics.undatedConfirmedLines`). Short is per SKU, not per nominal size, the same grain as
Servable – Unconfirmed.


## Inventory overview — the Dashboard's screens 2a–2g (ticket #232, part 2)

`inventoryOverview` (`src/lib/calc.js`) builds every figure on the Dashboard's Overview, Plant drill and Stock movement tabs
(#303); a region's total on Overview is `inventoryRegionStock` → `inventoryStockTotal`, the same function as the All Total. The
component and its CSVs only read what it returns. No new meanings — each figure is a rule the app
already has, now read **as of To**:

| Screen | Rule | Computed by |
|---|---|---|
| HR coil | unslit HR coils, whole — the "Full Coil Left" card (#224) | `coilAgeRows` |
| Slit coil | slit coils `babyCoilIsStock` calls stock — not assigned to any production dated ≤ To — at full slit weight (ADR-0015) | `coilAgeRows` |
| Coil > 30 d, Avg coil age | days from the **HR coil's** inward date to To, never reset by slitting; average tonnage-weighted | `coilAgeRows` |
| Slit waiting 8+ d | slit-coil stock with To − conversion date ≥ 8 | `coilAgeRows` |
| FG | produced − invoiced **per plant, per canonical SKU**, positive part | `producedPool` |
| FG > 75 d, 2e batches | FIFO by batch: invoices drain the oldest production first | `skuAgeing(…, { bands, lots })` |
| Cover | FG ÷ (Invoiced in the 30 days ending To ÷ 30); none invoiced → no cover, never 0 | — |
| Movement | the Plant-wise Tracker's dated events, summed over From → To | `trackerEvents` |
| Trend | `plantTrackerGrid` once per month; a stock row's MTD cell is its close | `plantTrackerGrid` |

**Movement reconciles on the book, then bridges to stock.** `trackerEvents` is the replay's own
event list, pulled out of `plantTrackerGrid` so both read it — not a second replay. Opening = every
event before From (undated ones included, as the tracker does). Then, per plant and stage:

```
HR coil  opening + Coil Inward − Slitting     = closing book   − left on slit HR coils           = HR coil stock
Slit     opening + Slitting − RM Consumed (whole coil)                                    = Slit stock
FG       opening + Production − Invoiced      = closing book   + Dispatched w/o production       = FG stock
```

`coilAgeRows` names every tonne of not-stock with its reason, so Σ stock + Σ not-stock = the
tracker's Coil Stock + Slit Stock exactly. `checks.movementTiesToStock` asserts the bridge on every
row; the screen prints a red line if it ever fails. A test asserts the movement's closing equals the
tracker's own close for To.

**Per-plant FG nets more than the company card.** FG is pooled per plant, so an SKU over-invoiced at
one plant cannot hide behind another plant's stock of it. Σ positive FG is therefore larger than the
company-wide figure, and Dispatched w/o production larger by the same amount (#231: 83.7 T
company-wide, 120.7 T per plant). Their difference — produced − invoiced — is the "FG Left Inventory"
card either way.

**A date after To.** Ignored for a past To. When To is today, a row dated later still counts — the
tracker's rule for a clock-skewed entry (#176) — so the latest figures tie to the Dashboard cards.

**Status** (proposed thresholds, #225): red if coil > 30 d ≥ 100 MT or FG > 75 d ≥ 25 MT; amber if
any of either; Total = worst plant. 2b cells: red past 30 d (coil) or 75 d (FG), amber 61–75 d (FG);
an empty cell is never coloured.

**2g, two rules the pack left open.** *Stock-out days* = days of To's month, up to To, on which the
row's produced − invoiced at this plant closed at or below zero (since 10-Nov-2026 a row is a size, see
below). *ABC* = the Inventory Snapshot's S8
cut-offs on MT invoiced over the last 90 days: A while the share ranked above is under 70%, B under
90%, else C; no sale is C. (The Pieces column of #226 was dropped on user request, 10-Nov-2026.)

**2g, laid out as the Planning master** (10-Nov-2026, user's pick). One row per **section × size ×
thickness** — the Inventory Snapshot's size key (S1): ERP code, IS standard and length do not split
a row. Rows run SHS, RHS, CHS, then size ascending, then thin → thick; section and size are printed
once per group on screen, in full on every CSV row. Each canonical SKU is floored at 0 before its
size adds it up. FG age is the FG-weighted mean of its SKUs' ages. *Stock-out days* = days this month
on which **no** SKU of the size had stock — a code over-invoiced never cancels another code's tubes
on the floor. *ABC* ranks the sizes, not the codes, on 90-day MT invoiced. Thickness = `skuThickness`
(the master's `thickness`, else the description's dimension tail, else "—"); section = `skuSection`.
No thickness banding: a 2.2 mm tube is its own row here, unlike the Planning master's bands.

**2b, split and drilled** (10-Nov-2026). HR coil and slit coil are **two** thickness × age grids
(`hrGrid`, `slitGrid`), both aged from the HR coil's inward date; their totals add to the 2a Total
coil less any undated coil. Each FG family row carries `thicknesses` — the same bands and Pending to
Serve per thickness — which add up to the family; the screen opens a family into them on click.

**Drill filters.** Every tab has its own (2b: Thickness across all three grids, FG section / family;
2c: Kind, Thickness, Width; 2d: Days since slit, Thickness, Width; 2e: Section, Family, Thickness,
Flag; 2g: Section, Size, Thickness, ABC). A filter is a way of looking: totals are rebuilt from the
rows kept (`sumGridRows`), and under a Thickness filter a family is the sum of the thicknesses kept.
The CSV is the filtered screen.

**Worked example** (the fixture in `calc.test.js`, To = 27-Oct-2026, From = 1-Oct):

```
Coil age        HYD-S inward 24-Aug, slit 16-Oct → its slit coil is 64 d old, waiting 11 d   (8+ band)
Hyderabad coil  HYD-OLD 120 (64 d) + HYD-NEW 30 (7 d) + two slit coils 4 + 4 (64 d) = 158; > 30 d = 128 → red
Slit movement   0 + 15 slit − 7 used (HYD-S-C 2 + HYD-E-A 5, whole coils) = 8.0 stock
FG movement     65 + 14 produced − 28 invoiced = 51 book + 3 w/o production (S2) = 54 stock
FG ageing       S1: July 30 T drained to 5 (118 d, Breach), 10-Aug 20 (78 d, Auction list) → FG > 75 d = 25
Cover           Lepakshi 310 T ÷ (663 T ÷ 30) = 310 ÷ 22.1 = 14 d
```

**Known limits.** A coil with no inward date has no age: it
counts in stock but in no age band; the drill panel names that tonnage under the 2b coil grids.

**Live tie-out, 31-Oct-2026, by independent SQL** (the session's container could not reach Supabase
from the app or Node, so the builder itself was not run on live rows — do that on the preview):

| Figure | SQL, 31-Oct | Ticket (30-Oct) |
|---|---:|---:|
| HR coil = Full Coil Left | **926.6** (H 159.0 · N 369.3 · L 235.9 · T 162.4) | 926.6 ✓ |
| Slit coil = Slit Coils Left (`babyCoilStock` rule, allocations at pieces × `weightPerTube`) | **1,169.5** | 1,242.2 |
| FG produced − invoiced = FG Left Inventory | **2,380.5** | 2,527.0 |

Slit and FG moved with the day's uploads: each invoice upload rebuilds October (436 dispatch rows
soft-deleted and re-created since 29-Oct), so the 30-Oct snapshot cannot be re-read. The positive /
w/o-production split needs the canonical SKU key, which SQL does not reproduce; it is held by the
unit identity Σ positive − w/o production = produced − invoiced.

## Days of cover — Coil Tracker stock by plant (ticket #264)
`coilTrackerView().stockByPlant` gives each plant row, and All plants, two more figures.

- **Produced 30d (T)** = Σ `coilAllocations[].weight` of every **live** production dated
  `today − 29 … today` (inclusive; `today` passed in, the viewer's calendar). Each allocation counts on
  the plant of the **slit coil** it names (`babyCoilId`), never the run's `totalWeight`. A slit coil no
  longer on file (`baby_coils` is hard-delete) falls back to the run's own stored plant, which it
  inherited from its slit coils (ADR-0005). An undated or future-dated run is left out.
- **Days of cover** = Total T ÷ (Produced 30d ÷ 30), rounded half-up to whole days.

| Stock | Produced 30d | Shows |
|---|---|---|
| > 0 | > 0 | whole days |
| > 0 | 0 | **No use** (amber) — sorts last |
| 0 | > 0 | **0** (red) — the plant has run dry |
| 0 | 0 | "–" (a bucket row in this state is hidden — see "Thickness buckets" below) |

- **All plants** Produced 30d = Σ plant rows; its cover is worked from the company totals, never an
  average of plant covers. Worked: Hyderabad 10 T / 30 T used → 10; NPMD 20 T / none → No use;
  All plants 30 T ÷ (30 ÷ 30) = **30**.
- Spec example (Tapi): 176.0 T ÷ (1,110.8 ÷ 30) = 4.75 → **5 days**.
- A plant with production but no stock gets a row in this table only; the age matrix keeps its
  stock-only rows.

## Thickness buckets — Coil Tracker stock by plant (ticket #265)
Every plant row of `coilTrackerView().stockByPlant`, and All plants, opens into **bucket rows**
(`row.buckets`), each with every column of the plant row (HR T · #, Slit T · #, Total T, Avg age,
Produced 30d, Days of cover) worked by the same rule over that bucket's coils.

- **The rule — `thicknessBucket(t)`** (calc.js): the **nearest** of `THICKNESS_BUCKETS`
  1.2 · 1.6 · 2.0 · 2.5 · 3.0 · 4.0 · 5.0 · 6.0 mm. An exact tie goes **up** to the heavier standard
  (half-up, as Excel `ROUND`), judged within 1e-6 so float noise (1.4 − 1.2 = 0.19999…) cannot tip a
  true tie down. Below 1.2 → 1.2; above 6.0 → 6.0. Blank, zero, or unreadable ("abc", "2.5 mm") →
  `null` = the **No thickness** row, listed last and only when such a coil exists.

  ```
  1.2 ← 1.0, 1.2            2.5 ← 2.3, 2.5, 2.6         ties up: 1.4→1.6  1.8→2.0  2.25→2.5
  1.6 ← 1.6                 3.0 ← 2.8, 2.9, 3.0, 3.2             2.75→3.0 3.5→4.0  4.5→5.0
  2.0 ← 1.8, 2.0, 2.1, 2.2  4.0 ← 3.6, 3.7, 4.0         5.5→6.0
                            5.0 ← 4.8, 5.0, 5.4
                            6.0 ← 6.0
  ```
  **Worked example — 6.0 is its own standard (10-Nov-2026).** The list used to stop at 5.0, so the
  3 live 6.0 mm coils (79.2 T) were counted as 5.0 stock. A 6 mm coil cannot roll a 5 mm pipe, so
  that overstated 5.0 by 79.2 T; the user caught it. 6.0 was added to the list (not to one screen),
  so the stock-by-plant table and the thickness × month grid below still agree. Pinned in
  `calc.test.js` → `thicknessBucket`.
- **Whose thickness.** Always the **coil's own**, never a pipe's. HR coil: `thickness` as typed at Coil
  Inward. Slit coil: its stored `thickness` (copied from its HR coil at slitting), else its HR coil's.
  A production allocation: the thickness of the **slit coil it names** (`babyCoilId`); if that slit
  coil is no longer on file (hard-delete), its HR coil's (`hrCoilId`). So a 2.2 mm slit coil rolled
  into a 2.3 mm pipe (allowed by the RM→FG sheet) counts in **2.0**, not 2.5 — stock, production and
  cover on one bucket row are the same steel.
- **Sums.** Every stock coil and every allocation lands in exactly one bucket, so a plant row = the sum
  of its bucket rows. All plants buckets are built over every plant's coils and allocations, so an All
  plants bucket = that bucket summed across plants. Avg age and Days of cover are re-worked from the
  bucket's own coils and totals — never averaged from other rows.
- **Hidden rows.** A bucket with **no stock and no Produced 30d** is left out for that plant. A bucket
  with stock but nothing produced stays and reads **No use** — that is the dead-stock signal.
- **CSV** — `stockByPlantCsv(stockByPlant)`: each plant's row ("All thicknesses") then its bucket rows,
  then All plants and its buckets. Every row, whatever is expanded on screen. Weights at 3 decimals; a
  "–" on screen is an empty cell.

## Coil stock by thickness × month — Coil Tracker
`coilThicknessGrid({ coils, babyCoils, productions, today })` (calc.js) builds the Coil Tracker's
collapsed **Coil stock by thickness** section; the component and `coilThicknessCsv` read it and do no
arithmetic. Raw material only — no finished pipe, no dispatch. Per thickness bucket, per month:

```
HR coil   Opening + Inward  − Slit out = Closing     Inward   = coils.actualWeight, dateOfInward
Slit coil Opening + Slit in − Consumed = Closing     Slit out = Slit in = baby weight, dateOfConversion
Opening(month) = Closing(previous month); the first month opens at 0      Consumed = ADR-0015
```

- **Events** are `trackerEvents` (the Plant-wise Tracker's one definition), called twice: once keyed
  by the **HR coil's** thickness (Inward, Slit out), once by the **slit coil's** own, else its HR
  coil's (Slit in, Consumed). Consumed = the whole slit coil, at its slit weight, in the month of the
  first live production naming it — once, however many runs name it.
- **Buckets** are `thicknessBucket` (above), so a bucket's latest Closing is the stock-by-plant
  table's bucket. TOTAL first, then thinnest → thickest, only buckets that ever had a coil event,
  then **No thickness** only if a coil carries none.
- **Months** run from the earliest event to today, newest first (`dataMonthKeys`); the current month
  is labelled `(to date)`. An event dated after today folds into the current month; an undated one
  (an undated production) goes into the first month's opening. No Total column.
- **Scope** is the header plant selector — the same scoped stores as every Coil Tracker table.
- **Known gap.** HR Closing is Inward − Slit out, so an HR coil whose slit weights do not add up to
  its own weight leaves the difference in HR stock, where the stock table (unslit = no slit coils at
  all) shows 0. On 10-Nov-2026 that is **0.083 T on 2 coils** (3.0 mm 0.075 T, 2.5 mm 0.008 T) — the
  same gap the Plant-wise Tracker's Coil Stock carries. Slit Closing matches exactly.
- Live, 10-Nov-2026, All Plants: HR Closing 781.301 T, Slit Closing 456.339 T.

## Planning master — Stock now and thickness bands (ticket #278)
`planningMasterView` (calc.js) gives each planning-master row its **Stock now**, region total plus
each region plant's share. Nothing new is counted: it is the Dashboard's FG rule (`inventoryOverview`,
To = today) — produced − invoiced **per plant, per canonical SKU**, positive part, every live row —
read through the same `fgPartition` the Dashboard uses. `thicknessBucket` (#265) is `thicknessBand`
over the fixed Coil Tracker buckets, so the two share one tie rule.

Each (plant, SKU) holding lands on **one row per region the plant serves**: same section and size,
and the band `thicknessBand(thk, bands)` picks from the bands **that size has in that region** —
nearest band, a tie going **heavier**, within 1e-6 (#258). The SKU master is read, never edited.

```
3.0 band ← 2.8, 2.9, 3.0, 3.2        2.0 band ← 1.8, 2.2 (1.8 is a tie with 1.6: heavier wins)
size     40NB ↔ nominal bore 40      91x91 ↔ 91.5x91.5      RHS 20x40 ↔ 40x20 (larger side first)
section  read from the size's shape (NB → CHS, equal → SHS, else RHS), never from productType
```

**Nothing is lost.** A holding that lands on no row (a size the master lacks, e.g. SHS 132x132, or
a code whose size cannot be read) is listed under its region's **Outside the plan**; one at an
Unattributed plant, or a plant serving no region the master carries, under `noRegion`.
`totals.fg = totals.inRows + totals.outside`, and `calc.test.js` ties `totals.fg` to
`inventoryOverview(…).stock.total.fg`. A plant serving two regions would show on both regions' rows
(one stock pool per region, as `salesByDistributor`); `totals` still counts its holding once.

*Can be made at* is keyed by `plantsServingRegion(region)` only, so a South row can never offer NPMD
or Tapi, even if a seed letter or a later edit named one.

## Planning master — edits, retired rows and the "not ticked" note (ticket #279)
`planningMasterView` now takes the stored edits (`stored`) and the order book (`orders`) too.

- **Rows** are `planningMaster(stored)` (see `docs/DATA-MODEL.md`). A **retired** row leaves the
  master — its counts, Buffer total and bands — and is listed under the region's `retired`. A tube
  in a retired band counts in the nearest live band of its size, as any odd thickness does.
- **The amber note** (#250): the ticks are the rule; data that disagrees is flagged, never obeyed.
  For each of the row's region plants that is **not** ticked, it sums that plant's live order lines
  that are not cancelled or rejected (ordered `quantity`, MT — the Sales tab's valid demand) and live productions (`totalWeight`) landing on the row by **the same
  rule as Stock now** — size key, then `thicknessBand` over the size's live bands. A plant's lines
  land only on its own region's rows, so a West order can never flag a South row; a line with no
  known plant flags nothing. Any figure above 0.05 T shows, e.g.
  `Lepakshi: 20 T ordered, not ticked` or `Lepakshi: 29 T ordered, 6 T produced, not ticked`.
  Nothing is ticked automatically. The window is all live rows, not a month.

```
order / production at plant P, SKU S
  └ P serves region R? ─no→ nothing
        └ S lands on a live R row? ─no→ nothing
              └ row ticks P? ─yes→ nothing   ─no→ add to the row's note for P
```

## Monthly campaign — Open and sales on the A2 sheet (ticket #280)
`planningCampaignView({ …stores, stored, month, today })` gives every **live** master row of each
region, for plan month `month`, three figures — each a region total plus a per-plant split. It lands
them on rows by the master's own rule (`planningRowIn`: size key, then `thicknessBand` over the size's
live bands), shared with `planningMasterView`, so Stock now and the campaign cannot band differently.

| Figure | Rule |
|---|---|
| **Open** | The Dashboard's FG (`inventoryOverview`, To = the day **before** the 1st): produced − invoiced per plant per canonical SKU, positive part, through the same `fgPartition`. **Not netted** against orders. The cut-off is in the past once the month starts, so Open does not move as the month runs |
| **last** (`Oct` for a November plan) | Σ invoice-entry `weight` dated in the calendar month before, at each **entry's** plant — the shipping plant (ADR-0013) |
| **three** (`Aug–Oct`) | the same over the three whole calendar months before |

- **By shipping plant.** A region's sales are its own plants' invoices, wherever the customer is: 21.9 T
  of SHS 50x50 1.6 shipped from NPMD to a Telangana customer counts in **West**, not South (#260).
  An entry with no known plant counts nowhere. Orders are never read.
- **Outside the plan.** What lands on no row (a size with no master row, an unreadable code) goes to the
  region's `outside.lines`, one per size × the tube's own thickness, with Open and both sales:
  `SHS 132x132 × 3.2`. So per region, `Σ rows.open + outside.open = totals.open.fg`, and a test ties
  `totals.open.fg` to `inventoryOverview(to = day before the 1st)` summed over the region's plants.
- **Short history** (`starts`). Each region plant's first dated invoice ever. A window it starts inside
  gets `from 30 Aug`; one it starts after gets `none until 30 Aug`; a plant with no invoices,
  `no invoices yet`. Shown after the plant's figure on hover (`Hyd 50.5 · Lep 4.0 (from 30 Aug)`) and
  once under the sheet. Lepakshi, NPMD and Tapi start 30–31 Aug 2026.
- **Quiet** = Open, last and three all ≤ 0.05 T **and** no Buffer above 0.
- **Planned before the 1st** (`month.provisional`): the 1st has not come, so Open uses the Dashboard's
  today rule (every dated row, a future-dated one too) and the last month is that month so far. The
  screen says so in amber.

```
invoice entry at plant P, SKU S, dated d
  └ d in the window? ─no→ nothing
        └ P serves region R? ─no→ nothing
              └ S lands on a live R row? ─yes→ that row's figure for P   ─no→ R's outside line
```

## Monthly campaign — Indent, Suggested and Planned (ticket #281, decision #252)
Per row, in MT. *Open* is the row's Open above (stock on the 1st, the region's plants, not netted).

| Row type | Suggested (`planningSuggested`) |
|---|---|
| Buffer | `max(Indent, Buffer) − Open`, floored at 0 |
| MTO | `Indent − Open`, floored at 0 |

- **Rounding** (`planningRoundUp10`): always **up** to the next 10 MT, an exact 0 stays 0 — 3.2 → 10,
  27.1 → 30, 94.4 → 100, 100 → 100. Read at 3 decimals first so float noise cannot step it up.
- A blank Indent or Buffer reads as 0. `max`, **not** `+`, by the user's choice: sales are served out
  of the buffer, so a month can end below Buffer by design. Monitoring shows it; nothing corrects it.
- Worked examples (openings are examples): South SHS 50x50 1.6, Buffer 100, Open 5.6, Indent 60 →
  94.4 → **100**. South RHS 100x50 2.0, MTO, Open 12.9, Indent 40 → 27.1 → **30**.
- **Planned** = the typed figure if there is one, else the suggestion. A typed figure is kept, never
  overwritten. It is stored with the suggestion it was typed against (`basis`); when Indent or stock
  later moves the suggestion off `basis`, the row is `moved` (amber) and offers "use N".
- Rows with an Indent or a typed Planned are never quiet.
- Units are tonnes. Pieces, if ever shown, come from `SKU.weightPerTube`, never a density constant.

```
typed Planned?  ─no→  Planned = Suggested (faint), follows it
   └ yes → basis = Suggested now? ─yes→ plain   ─no→ amber, "use <Suggested>"
```

## Sales tab — Size × Thickness stock flow
`salesSizeLines` (calc.js). Per canonical SKU (`skuKeyResolver`), for a From…To window (inclusive):
- **Opening** = Σ production weight dated before From (or undated) − Σ invoice-line weight dated
  before From. **Production** / **Dispatch** = the same, dated From…To. Rows dated after To are not
  counted — unless To is today, when a future-dated row still counts (#176, as `inventoryOverview`).
  **Closing** = Opening + Production − Dispatch, i.e. the book as of To.
- `salesByDistributor` takes `opts.from` / `opts.to` as an invoice window in place of its month (the
  grid builds its rows with it). Confirmed / Non-confirmed are not dated and are not windowed.
- **Book figures, not floored**, so the identity holds in every cell, row and total. This differs from
  the Inventory overview's FG figure, which keeps the positive part per SKU and bridges the rest as
  "Dispatched w/o production" — a negative cell here is that same tonnage, shown where it sits.
- Weight is `totalWeight` after `resolveProductionWeights` (`SKU.weightPerTube` × tubes), never a stored
  or density figure — which is why it can differ by a couple of tonnes from the raw `total_weight`
  column (2.2 T across South on 10-Nov-2026).
- **Service area**: productions AND invoice lines are both cut to the serving plants
  (`filterByPlants` / `filterDispatchesByPlants`) — never one without the other. `stockRegions` null =
  every plant in the stores passed in (already cut by the header plant selector); only `Unmapped` =
  every stock figure `null`.
- **Sales blocks** are Σ the `salesByDistributor` rows' own `skuRows` — no second computation — so the
  grid's totals equal the Distributor-wise Sales table's for the same distributors.
- **Production required** (decided in a grilling session, 12-Nov-2026), per standard-thickness cell:
  `max(0, Pending to Serve − max(0, Closing))`, Pending to Serve = Confirmed + Non-confirmed.
  - **Per cell, not per SKU**: the plants ship any tube of a standard thickness against an order for
    another (2.2 mm against 2.0, 3.2 against 3.0), so the cell's SKUs net together. Live 1–10 Nov:
    RHS 50×25 at 2.0 held 2.0 mm (16.0 pending, −0.5 closing) and 2.2 mm (0, 5.9) → 16.0 − 5.4 = 10.6.
  - **A negative cell closing counts as 0**: a recording gap never asks for more production.
  - **Per region, then added**: each mapped region's orders net only against the closing stock of the
    plants serving it (∩ the Plant filter). So under All regions the figure is NOT the cell's Pending
    to Serve − Closing (the Closing block shows every plant's stock).
  - **Unmapped orders are left out** and returned as `unmappedPending` for the amber line; only
    `Unmapped` in view (a picked Unmapped distributor) → `required` null → `?`.
  - Exact to 0.1 T, never rounded — rounding to a campaign is **Suggested production**'s job.
- **Shape**: section / size / thickness are read off the canonical key; size as `skuFamily` writes it
  ("40 NB", HxB larger side first); section is the product type, else the shape (NB → CHS, square →
  SHS). An unreadable tube keeps its own line under "—" rather than losing its tonnage.
- **Standard thickness**: each line also carries `stdThickness = thicknessBucket(thickness)` — the
  Coil Tracker's eight (nearest standard, a tie going heavier). The pivot, the Thickness filter and its
  options read `stdThickness`, so 2.2 → 2.0 and 2.8 / 2.9 / 3.2 → 3.0 in one cell; a row's total is
  unchanged by the fold. `thickness` (the SKU's own) is kept for the SKU list.
- **Plant filter**: `stockPlants` (null = no narrowing) intersects the serving plants, so it can only
  narrow the service area — NPMD picked under South reads no stock. With no region, the plants alone
  decide. Productions and invoice lines are cut by the same set, as for the region.

## Monthly campaign — Plant (ticket #282, decisions #253, #250)
A region's need comes first (Planned, above); then each row's Planned goes to a plant. **A plant's
campaign is the set of rows assigned to it.** Offered plants are the row's **ticked** plants, out of
the region's own (`plantsServingRegion`) — another region's plant is never one, whatever a stored
master row says. Built per row by `planningAssignView`, saved by `planningCampaignSave`.

```
ticked plants on the row
 ├─ 0 → 'none'    red "No plant can make", never assigned (its Planned counts in that total)
 ├─ 1 → 'auto'    that plant, whatever is stored
 └─ 2 → stored split?          → 'split'   parts per plant, any tonnage, red until Σ = Planned
        stored plant, ticked?  → 'chosen'  (a stored plant since unticked → 'blank')
        stored '' (Choose…)    → 'blank'
        last month's plant?    → 'carried'
        else                   → 'blank'   needs a plant when Planned > 0
```

- **Carry** (`planningCarriedPlant`): last month's stored plant, if still ticked. Last month split →
  blank. Last month's plant since unticked → blank. A month that chose nothing on the row showed what
  it carried, so the walk looks one month further back; it **stops at the first month with no stored
  campaign** for the region — the first month has no last month.
- **Split**: parts are kept at 3 decimals, equal within 0.0005 T. If Planned changes after a split
  the parts stay as typed and the row goes red again. A part at a plant since unticked is dropped.
- **Amber dot**: a region plant **not** ticked on the row with Open, or sales in the three months before the plan month,
  above 0.05 T on it. Flag only — it is never offered.
- **Summary** (`planningCampaignSummary`), each the plain sum of the rows over every live row of the
  region: Planned · T per plant (`assigned`: a single plant takes the whole Planned, a split its
  parts as typed) · "No plant can make" T · rows needing a plant (and their T) · splits that do not
  add up. When every split adds up: Σ per plant + No plant can make + needing a plant = Planned.
- Check figures (seed, no data): South 72 two-plant / 123 one-plant / 41 no-plant rows; West
  131 / 97 / 7 — as #253 states.

## Monthly campaign — Finalise and Baseline (ticket #283, decision #255)
Finalise closes **one region's** campaign for **one month** ("Finalise November — South"); South and
West finalise on their own days. `planningCampaignFinalise` (pure) writes it; `planningFinaliseState`
gives the button its state; `planningCampaignSave` logs every later change.

```
Draft ── Finalise ──► Finalised   (no way back: there is no Un-finalise)
  │ refused while planningFinaliseBlockers names a row:
  │   a row with Planned > 0 and no plant (needsPlant), or a split ≠ Planned
  │   — a "No plant can make" row is NOT a blocker (#250: never assigned, stays red)
  └ at Finalise: Baseline = the rows as shown; untyped Planned > 0 written in as typed;
                 carried plants written in as chosen
```

- **Baseline** (`campaign.baseline`): every row with Planned > 0 or an Indent, as on screen —
  `{ planned, suggested, indent, plant, split }`. Never written again. A row absent from it had
  Planned 0 at Finalise.
- **After Finalise, Planned moves only when typed.** Finalise writes each untyped row's Planned > 0
  into its line with that suggestion as `basis`; a row typed before keeps its own figure and basis.
  A finalised row with nothing in its line reads **Planned 0, basis 0** (not the suggestion). So an
  Indent edit moves Suggested only and the row turns the #281 amber; "use N" moves Planned and is a
  logged change. Blank Planned is refused (type 0).
- **Plants freeze too.** Carried plants are written in as chosen, and a finalised month never carries
  again — an edit of last month cannot move this month's plant.
- **The logged change** (`campaign.changes`, append-only): a change to Planned or Plant on a finalised
  month is refused without a `reason`; with one it appends `{ id, at, by, rowKey, field, from, to,
  reason }`, `from` being the row as the view showed it. A Plant value is a plant id (`''` = none) or a
  split's typed parts. Indent edits are not logged. A change that moves nothing logs nothing.
- **Revised** = the row has at least one logged change (`r.revised`, `r.changes`), even if a later
  change brought it back to the Baseline figure — the log says it was revised.
- Example: South SHS 50x50 1.6, Baseline 110, revised to 150 on 12 Nov → the row reads Planned 150,
  Baseline 110, ↺ revised; the log reads `50x50 1.6 · Planned 110 → 150 · <reason>`.

## Week plan — the app's proposal per plant (ticket #284, decision #273)
Once a region's month is **finalised**, each of its plants gets a week plan; an unfinalised region
has none (West's plants wait for West's own Finalise). `planningWeekPlanView(planningCampaignView(…))`
— pure. Since #285 the proposal is **stored at Finalise** (see the next section); the run and the
placement below are how each row's first week is chosen.

```
finalised region ─► each region plant p
   rows with r.assigned[p] > 0        (a split row's part on each plant; never crosses plants)
   ─► planningRunOrder                section SHS·RHS·CHS → size smallest first → thin → thick
   ─► planningProposeWeeks            each WHOLE row → the week its tonnes' middle falls in
   ─► byWeek · target (by days) · sizeChanges
```

- **Weeks** (`planningWeeks`, a default, not a rule): Mon–Sun inside the month; a part week of
  **under 3 working days** joins its neighbour (first → the week after, last → the week before);
  working days are Mon–Sat; a week's **share** = its working days ÷ the month's. Four or five weeks.
  Nov 2026: W1 1–8 (Sun 1 joined) · W2 9–15 · W3 16–22 · W4 23–30 (Mon 30 joined) = 6/6/6/7 of 25.
  Dec 2026 has five (Tue 1–Sun 6 is 5 days, Mon 28–Thu 31 is 4). No per-plant calendar.
- **Run order**: size is read through `planningSizeKey` — CHS by NB as a number (25NB before 100NB),
  SHS/RHS by the larger side then the smaller. `sizeChanges` counts steps to a different section or
  size along the run.
- **Placement**: walk the run; cumulative midpoint ÷ plant total, against the cumulative week shares.
  Whole rows only, so a week sits near its share (`target`), not on it; the weeks always add up to
  the plant's `summary.byPlant` — the same figure the campaign summary shows.
- **Not in any week** (`unplaced`): "No plant can make" rows and any row left needing a plant.
- **No capacity check** (#272 is out of scope).

## Week plan — moving and splitting rows (ticket #285, decisions #273 Q2/Q9/Q10, #274, #275)
"Nothing moves by itself." The weeks are **stored** per row per plant in the row's line
(`lines[rowKey].weeks[plant] = { week, split? }`), and every change that moves a week's figures is
logged in `changes` as `field: 'week'`, with **no reason** (Planned and Plant still need one, #283).

```
Finalise ─► each plant's proposal stored (whole rows)
   │
   ├─ Week W3      ─► the whole row in W3 (ends a split)               ─► logged W2 → W3
   ├─ Split…       ─► parts per week, untyped, RED                      ─► nothing logged yet
   │     Σ parts ≠ row's T  → red; the row keeps its plan as it was (not taken as the plan)
   │     Σ parts = row's T  → kept; main week = biggest part            ─► logged W2 → W2 60 · W3 40
   └─ a Planned change (#283) ─► a whole row follows its tonnes in the same week;
         a kept split: the MAIN week takes the difference (option B, user 11-Nov-2026)
         60 · 40, Planned 100 → 120 → 80 · 40;  → 50 → 10 · 40;  → 30 → 0 · 30, red "check"
```

- **A cut bigger than the main week's part** empties it and takes the rest off the **latest** weeks
  first (W1 10 · W2 50 · W3 20 · W4 20, Planned 100 → 40 → 10 · 0 · 20 · 10), and the row is red to be
  checked. The weeks still add up to the row. Typing a part starts from the figures on screen.
- **Stored**: `{ week, split }` = a kept split, `{ week, draft }` = parts being typed (with the kept
  `split` beside it while a kept split is retyped).

- **Admin only**: the tab is (#275). `planningWeekSave` takes `week` / `split` / `part` and nothing
  else: a `plant` in the change is refused, and a row not on the plant cannot go in its weeks — a row
  never moves plant from this screen. Refused on an unfinalised month, an unknown week, a bad part, no login.
- **First move on a legacy month** (finalised before #285, no stored weeks): every row of that plant is
  kept where the screen showed it, then the one row moves. A row that came onto a plant after Finalise
  (a plant change) has no stored week and follows the proposal until a move on that plant keeps it.
  A plant change drops the row's week on any plant it left, so coming back it is placed afresh.
- **"was X on Mon"** (#274): a week cell shows its figure as it stood on **that week's Monday**
  (`planningWeeks(…).monday` — its first Monday, or its first day if it has none) when a week move since
  then changed it. Read off the first week move of the row on that plant dated on or after the Monday
  (its `from`), so a week whose Monday is still to come has none. A `from` with one week = the whole row,
  at today's tonnes, and a `from` with several weeks is set to today's tonnes by the same main-week
  rule, so a Planned change rewrites the Monday figure too and "was" only ever means a move.
  Example: 50x50 1.6, 100 T in W1 since Sun 1 Nov, moved W1 → W2 on Wed 11 Nov → W1 "was 100.0 on Mon",
  W2 "was 0.0 on Mon". Days are UTC, as the app's `today` is.
- **Tonnes a closed week did not make stay in that week** until moved (#273 Q9). Their amber marking is
  #287 (*Week plan — monitoring*, below).

## Week plan — the coil each row needs (ticket #286, decision #276)
Guidance only: nothing is reserved, nothing is written, Production's coil choice is untouched.
`planningWeekPlanView(view, { onHand: coilOnHand(…), skus, today })` gives each plant row `coil` and
each plant `coil: { bands, short, shortBands }`, by `planningCoilHandOut` over **that plant's coil only**.

```
coil on hand at the plant ── coilOnHand: slit coil not yet used (full weight, ADR-0015)
                                       + HR coil not yet slit (weight − Σ live slit, floored at 0)
tonnes still to make ─────── row's week figures − made this month (earliest weeks first)
hand out W1 → W2 → … (each week in run order), 1 T coil per 1 T tube:
  1. slit coil that FITS   same plant · same band · |width − strip| ≤ 5 mm   oldest slit first
                           WHOLE to one row (one coil, one run); its spare stays with that row
  2. HR coil of the band   any width (still to be slit)
  3. the rest is SHORT     week closed (its last day < today) → red "now"
                           else amber "needs X by <its Monday>"   e.g. Mon 9 Nov
```

- **Strip width** (`planningStripWidth`): SHS / RHS = 2 × (a + b) − 4 → 50x50 = **196**, 80x40 = **236**.
  CHS = π × (OD − t) + 2, the OD read from the SKU master by NB (`planningOdByNb`: 40 NB = 48.3 →
  40NB 3.2 ≈ 144). No OD on file → `?`, and no slit coil fits (HR still can).
- **Bands** are `thicknessBucket` (#265) for coil and row alike: 3.2 mm coil is 3.0 coil, and a 2.5 mm
  slit coil never fits a 2.0 row whatever its width. A coil's thickness is its own, a slit coil's
  falling back to its HR coil's.
- **Made** = `planningCampaignView` row `made.byPlant` — live production dated from the 1st of the
  plan month to today, at its stored plant, landed by the master's row rule. Capped at the row's
  tonnes on the plant. Its coil has already left coil on hand, so those tonnes ask for none; counting
  them would ask for the same steel twice. (Ticket 10's *credited* is the same idea; this is not its
  Made-off-plan rule.)
- **One slit coil, one run** (ADR-0015, user 12-Nov-2026): a fitting coil is given whole to the first
  row that needs it; what that row does not need can cover the same row's later week, never another
  row. HR coil is still to be slit, so it is shared in tonnes. Only coil booked at Coil Inward
  counts — no typed or estimated arrival (`purchase_orders` is empty). Never another plant's coil, and
  an Unattributed coil is nobody's.
- **Band line**: need · slit · HR (of HR on hand) · short · first need-by — the earliest week any
  of the band's tonnes run out. **Coil short** on the overview lists the short bands, earliest first.

**Example (live coil, 10–12 Nov 2026).** Hyderabad 3.0 band on hand: slit 74 mm 1.209 T, 96 mm 1.776
T, two 193 mm 3.2 mm coils 3.013 T each; HR two 3.2 mm coils 21.525 + 21.555 = 43.080 T. With 310 T
to make in the band from W2 (25x25 20 T, 50x50 100 T in W2; 100x50 90 T in W3; 50NB 100 T in W4):
fitting slit = 1.776 (96 → 25x25) + 6.026 (193 → 50x50) = **7.802**; HR **43.080**; short **259.118 T,
first by Mon 9 Nov** (W2, still running on 10 Nov, so amber). The 74 mm coil fits only a 20x20.
There is no finalised campaign in the live database yet, so the 310 T is the #276 example plan;
`calc.test.js` pins it.

## Week plan — monitoring: plan against actual (ticket #287, decision #274)
On the weekly screen itself — no new screen, no columns on A2. `planningWeekPlanView` gives each plant
row `monitor`, each plant `monitor` (`planningMonitorPlant`) and each region `monitor` (the plain sum
of its plants). Production is the campaign view's **Made**: live production dated from the 1st to
today at its stored plant, landed on rows by the master's rule (size key, then `thicknessBand`), now
also kept by day (`madeDays`) so it can be credited in date order.

```
week closes ─► the plant's credited tonnes vs the week's plan ─► short > 10 % (min 1 T)? ─► plant's week RED
                                                              └► rows not made ─► AMBER until moved (never red)
Baseline = made (credited) + plan changed + behind + still to come      ← holds on every row, plant, region
```

| Measure | Rule |
|---|---|
| **Credited** (Made) | the row's production at the plant, in date order, counted up to the row's tonnes there (latest plan) — **whatever week it was made in** |
| **Made off plan** | production past a row's plan (`past its plan`), on a region row with no plan at the plant (`no plan at this plant`), or on a size with no master row (`no master row`, the campaign's *outside* lines). Listed beside the gap, **never credited**, not in any week's tonnes |
| **Week made** | credited tonnes **dated in** that week. A W1 row made on 11 Nov credits the row, and counts as W2's tonnes |
| **Red** (`planningWeekShort`) | a **closed** week (last day before today) whose made is short of its plan **as it stood on its Monday** (the #285 `was` figure, else the week's plan) by **more than** 10 %, min 1 T: 100 → 89 red, 100 → 90 or 91 not; 5 → 4.2 not (0.8 < 1 T). Moving an unmade row out of a closed week clears the row's amber, never the week's red |
| **Row status** | `made` (green) within **1 T or 5 %** of its plan · amber `W1 not made` / `due 43 more` when its closed weeks' tonnes (latest plan) are short of credited by more than that same tolerance **of its plan** · else `on track`, `started`, `not due yet`. **Never red.** |
| **Behind** | row: an amber row's closed-week tonnes not yet credited. Plant: the closed weeks' plan (latest) less **everything** credited so far, once a closed week is red **and** that total breaks the same rule — so a short W1 made up later (even in the running week) is behind no more, though W1 stays red. The rows' Behind (1 T / 5 %) need not add up to the plant's (10 %, 1 T): each level holds its own identity |
| **%** | credited ÷ the **latest** plan; the Baseline shows beside it when it differs |
| **Baseline** | the row's Baseline on this plant — its split part, else its Planned when the Baseline's plant is this one. A row moved off the plant since Finalise still counts in the plant's Baseline, as plan changed |
| **"entered to 5 Nov"** | a closed week whose last **working** day (Mon–Sat; a Sunday end reads the Saturday) is after the plant's latest production day (any tube, `view.entered`): shown amber, and the week is **still judged** |

- **Region** = the plain sum of its plants; a "No plant can make" row is in no plant's plan or Baseline.
- **Still to come** = plan − credited − behind, so the identity holds by construction; the unit test
  checks it on every row of both South plants, each plant and the region.
- **Live check (12-Nov-2026, West finalised in memory):** Tapi's SHS 132x132 — 4.0 mm 38.0 T (4 Nov),
  5.0 mm 41.6 T (5 Nov), 6.0 mm 20.5 T (3 Nov) — reads **100.1 T made off plan**, `no master row`.
  No campaign is finalised in the live database yet, so this was run, not seen on screen.
- Dispatched, Stock now / Buffer and MTO served (the #274 addendum) are ticket #288, below.

## Week plan — Dispatched, Stock now / Buffer, MTO served (ticket #288, the #274 addendum)
Region figures on a plant's row (Buffer and Indent are set per region), so both plants of a split row
show the same figure. None of the three touches red — red is still a plant's week short on tonnes.

```
invoice entry (Zoho register) ─► its shipping plant ─► a region's own plant? ─no─► not this region's
     dated 1st … today                                      └yes─► lands on the row (size key, band)
                                                                    else the region's outside line
Stock now = Open + made − dispatched   < −0.05 T ─► "check"   (never a negative number)
MTO served = dispatched ÷ Indent        no indent + dispatch ─► "no indent"   (never 0 %)
```

| Measure | Rule |
|---|---|
| **Dispatched** | `planningCampaignView` row/outside `dispatched` — the Oct / Aug–Oct rule (by `bundleEntries[].plant`, region's own plants only), dated from the 1st of the plan month to today. Region `dispatched.byPlant` = rows + outside lines: the overview's per-plant figure. Called *Dispatched*, never *Sold* |
| **Stock now / Buffer** (`planningStockNow`) | region pool. Green at or above Buffer, plain below; **by design** when under Buffer and Indent ≥ Buffer (#252). A row "has a Buffer" when it is a Buffer row with a Buffer typed |
| **MTO served** (`planningMtoServed`) | rows with no Buffer — MTO rows, and a Buffer row left blank (it plans like MTO, as in the prototype). Indent blank or 0 with a dispatch → "no indent" |
| **Summary line** (`region.sales`) | adds up from the screen: Dispatched T = Σ plants' Dispatched (overview) · MTO served = Σ dispatched ÷ Σ indent over the MTO rows **on the plant tables** that have an indent (`noIndent` counts the rest), a split row once · Buffer rows under Buffer now *n of m* over the same rows, a "check" row in neither. A row with no tonnes this month is on no plant table, so it is in none of these |
| **Green** | judged at the one decimal shown: 99.96 reads `100.0 / 100` and is green |

- **Live check (12-Nov-2026, invoice register 1–12 Nov):** Hyderabad **123.925 T**, Lepakshi
  **67.650 T** (South 191.575), Tapi **105.100 T** (of which SHS 132x132 4.0, 3.436 T, has no master
  row: counted in Tapi's figure, on no row), NPMD 0 — equal to a direct SQL sum by entry plant.
  No campaign is finalised in the live database, so this was run, not seen on screen.

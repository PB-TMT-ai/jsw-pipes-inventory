# Key Algorithm: FIFO Coil Attribution, SKU Weight & Costing

> Read this before touching `src/lib/calc.js` or anything that allocates, weighs, or costs coils.

Slitting splits mother→baby proportionally by width; Production FIFO-consumes **baby coils**; dispatch inherits the trace. **No density constants anywhere.**

Pure helpers live in `src/lib/calc.js`. Formulas:

- Weight per Piece = `SKU.weightPerTube / 1000` (kg → tonnes); Total Weight = `Pieces × Weight per Piece`.
- Baby coil weight/cost = `(baby width / Σ sibling widths) × mother actualWeight / costPrice` (so baby and mother cost-per-MT are identical).
- **FIFO allocation** (`coilFifoAllocate`): generic over `{hrCoilId, thickness, actualWeight, dateOfInward, plant}`. Production feeds it **baby coils** via an adapter (`{hrCoilId: babyCoilId, actualWeight: baby weight, dateOfInward: dateOfConversion, plant}`) — and **pre-filters** that adapter to coils whose slit width is within **±5 mm** of `requiredStripWidth(sku)` (skipped when the width is unknown) — then **enriches** each allocation with the mother `hrCoilId`. The **`plant` filter runs first, ahead of every other rule** (see below). Eligible coils are `!deleted`, `actualWeight>0`, and thickness-matched to the SKU. Production passes **`thicknessRule: true`**, which matches on the plant's **RM→FG rule sheet** (`RM_TO_FG_THICKNESS` / `rmRollsFg`) instead of a tolerance band; other callers keep the legacy symmetric band (`thickTolMm` absolute, else ±`tol` relative). Sorted oldest first (tiebreak id). So Production eligibility is **width ±5 mm AND a legal RM→FG pairing**. The relation is asymmetric and many-to-many (2.3 coil rolls 2.5 pipe but not the reverse; 3.0 coil rolls both 3.0 and 3.2; 2.2 coil rolls both 2.2 and 2.3), which is why a ±band cannot express it — the old ±0.3 mm band both admitted pairings the mill never runs (2.6 coil → 2.5 pipe) and rejected ones it does. An FG gauge absent from the sheet yields **no** eligible coil; it never falls back to a band. Fill each to nominal capacity, spilling to the next; only if pieces remain do they stretch into the ±5% over-fill band (`overTolerance`). Whole **pieces** only. Leftover → `shortfall` (never blocks — **allow + warn**). **FIFO output is only a suggestion** — it is never auto-saved; the operator's explicit selection is what `save()` persists.
- **Capacity cap** (`capAllocationRows`): a manual row filled past **105%** of its coil's remaining weight now **blocks save** (it was warn-and-save, which is how 445 baby coils came to hold 123.3 T more than they physically could). The **Fix split** action caps each row at its coil's real capacity and spills the excess down the operator's own rows, then into eligible coils they had not used. It preserves their coil choices and row order, so it is a cap on their pick — **not** the FIFO suggestion, which stays non-binding. Whole pieces only; anything that still will not fit is returned as `leftoverPieces` for the caller to surface. Under-allocating is unaffected and still saves as `partial`.
- Coil consumption (`coilConsumption`) = Σ production `coilAllocations`; a coil's free capacity = `actualWeight − consumed`.
- Bundle availability (`producedPool`) per SKU = `produced − bundled`; bundling is capped at it.
- Dispatch cost rate = `Mother Coil Cost Price / Mother Coil Actual Weight` (₹/MT), weight-weighted across each entry's `coilAllocations` (legacy fallback: single `traceHrCoilId`).
- **A dispatch record's weight is a function of its entries, never an independent fact** (`withDispatchEntries`): `theoreticalWeight = Σ entry weight`, `selectedBundles = entries`, and `variance = vehicleWeight − theoreticalWeight` (0 when nothing was weighed — no weighbridge reading is *no measurement*, not a variance of the whole load). Anything that changes which entries a record holds goes through this one helper — the daily upload building a record (`buildDispatchRecords`) and the plant filter narrowing one (`filterDispatchesByPlant`). They previously each carried their own copy of the arithmetic in two different files, which is how the two would eventually have disagreed about what one invoice weighs. `vehicleWeight` is deliberately **not** derived: it is a whole-vehicle weighbridge figure and cannot be split when the entries are.
- **Distributor × SKU stock** (`salesByDistributor` with `opts.productions`) — per distributor and canonical SKU, scoped to the distributor's **service area** (ticket #129): its region → the plants whose `serves` includes it → the pool. `pending = confirmed + nonConfirmed`; `onhand = max(0, producedPool.availableWeight)` over **those plants'** productions less **those plants'** dispatch entries; `allConfirmed` = Σ Confirmed across every distributor **in that area**; **`freeStock = onhand − allConfirmed`** — the displayed figure, area stock promised to nobody yet, **not floored** so an over-committed size reads negative; `allPending` = Σ pending across every distributor **in that area** for that SKU; `shortBy = max(0, pending − onhand)` — still measured against on-hand, so a row can show no shortfall beside a negative Free Stock. All four halves move **together**: scoping only the productions would subtract South's invoices from West's empty pool and read every West SKU as negative, and would net South's Confirmed off West's zero. Inside an area the pool is still divided between nobody, so the identical tonnage repeats on every row there for that size and `shortBy` can read 0 on an oversubscribed size (ADR-0002 — 39.3 T of `50x50x2.0` against 78 T queued). **Across** areas nothing repeats: on 20-Aug-2026 every production row is Hyderabad's, so West rows read 0 Free Stock and their full pending as `Short by`, and they fill in by themselves the day NPMD produces (ADR-0006). A distributor whose region is `Unmapped` has **no known service area**, so every stock field is `null` — `?` in the workbook, an em dash on screen, **never 0**. Both the Sales tab drill-down and the PB MTD workbook's **Distributor × SKU** sheet read this one function, so screen and workbook cannot disagree; the sheet lists only live pairs (pending or invoiced MTD above zero), sorts region → distributor → pending desc, and **never totals `onhand`** — summing it reports more stock than the area holds. Each SKU row also carries its own **`description`** — the SKU master's when it has a row for the code, else the **order line's own** description. 37 of the ERP codes on the order book have no master row at all (ordered, never produced), and for those the order line is the only place the tube's name exists; without it both the screen and the workbook printed the raw MM ID (`1140-13075-10078295`) where the description belongs. The workbook's SKU label is derived from that description in the same `size x thickness` shape the SKU Ageing sheet uses, so the two sheets still join.
- ±5% tolerance on weight validations (via the shared `tolerance()` helper — returns `ok:true` on falsy args, so cap checks guard `actualWeight>0` explicitly).

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
`consumed` flag, prior consumption and the capacity bands are all evaluated **within one plant's
coils only**.

```
App.jsx  babyCoils ─► !deleted, !consumed, width ±5 mm ─┐   (the adapter: babyAsCoils)
                                                        ▼
calc.js                       plant filter ─► RM→FG thickness ─► weight>0, FIFO order
                             (filterByPlant)  (thicknessRule)
                             ▲ inside coilFifoAllocate, ahead of every rule IT applies
```

Two hops, and the diagram is drawn the way the code runs rather than the way the rule reads: the
width filter and the `consumed` flag are applied by Production's adapter **before** the allocator is
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
plant's baby coils above **0.02 MT free**, including off-spec ones, with the ✓ match flag and
match-then-MT-available ordering, so the operator's override survives inside their own plant.

**Still never auto-saved.** The plant filter narrows the suggestion; it does not make it binding.
`manualAlloc` is what `save()` persists, allocations still carry **both** `babyCoilId` and the mother
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

`buildPlantMtdSummary` (`src/lib/reports.js`) breaks the Dashboard sheet's headline tonnage down per
plant, in a block rendered **beneath** the KPI cards — `Plant | Invoiced MTD | Confirmed | Non-Conf |
Pending to Dispatch | Total Orders`, closed by an `ALL PLANTS` row. It is reached as
`buildMtdDashboardData(...).plantSplit`, so the workbook and anything else reporting the split read
one object.

- **No headline moves.** Every KPI above the block is computed exactly as before; the block is a
  *partition* of those figures, never a replacement. Company-wide Pending to Dispatch stays at the
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
- **Round at print only.** `checks.invoicedTiesToPlant` / `pendingTiesToPlant` compare the exact
  region sums against the plant figures — computed here a second way, in JS from raw rows, against the
  skill's Postgres aggregate — and the script exits non-zero if either misses by more than 0.01 T. The
  printed `Total` line carries the plant figure, not the sum of the rounded region lines, so displayed
  lines can look 0.1 T off while the exact values tie.
- **Only these two metrics split.** Production, RM and Physical Inventory carry no ship-to state.

## Daily report — the plant split (ticket #128)

The same two metrics, cut the other way: **Invoiced MTD** and **Pending to Dispatch** per plant (the
card the daily reports label *Pending to serve*), in the daily PB MTD text and WhatsApp messages,
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
- **Only these two metrics split.** Production, RM and Physical Inventory are pipeline figures; the
  daily messages do not break them down by plant.
# Campaign Planner — the rules the month is committed under

> Read this before touching the `campaign*` helpers in `src/lib/calc.js` or the Campaign tab's Plan side.

Locked decisions live in `.planning/phases/03-campaign-planner/03-CONTEXT.md`; the Baseline rule is `docs/adr/0003`.

The six pointers rendered above the Initiate button are these:

1. **Where the numbers come from** (`campaignSuggestion`) — Plant Best Estimate for VOLUME, trailing-month sales for the MIX, plus open orders, less family on-hand. No Best Estimate typed for the month → volume falls back to trailing sales and the screen says which source it used.
2. **Nothing computes on render** — Initiate snapshots demand when pressed (orders arrive late, so *when* is the operator's call). Re-pressing refreshes every suggestion and leaves every typed target alone.
3. **Over the Hour budget is a test, never a verdict** — the plan saves anyway and shows `336 / 312 h, over by 24 h ≈ 102 T`. No family is auto-deferred, nothing is trimmed pro-rata.
4. **The family target is the commitment** (`gaugeReconciliation`) — Σ gauge targets must equal it. The mismatch shows while Draft and blocks only Draft → Active; the family number is never silently rewritten to match an edited gauge.
5. **Revision 1 is the Baseline** — never overwritten. Revise writes revision n+1 with a mandatory one-line reason; the month is still scored against the first commitment.
6. **Unplanned production is reported, never deducted** (`campaignUnplanned`) — its hours are stated beside the gap and charged against neither the Hour budget nor any shortfall.

Constants, defined once: `MILL_RATE_TPH` 4.32 (measured — Jul 2026's 1,400.3 MT ÷ 27 days ÷ 12 h; the research corpus's 12 t/h is a large-mill figure, 2.8× too high, and appears nowhere), `SHIFT_HOURS` 12, `FAMILY_FLOOR_MT` 20, `GAUGE_FLOOR_MT` 3.

- Hour budget = `(calendar days − Sundays − operator exceptions) × 12 h`, then overridable by working days or outright hours. A Sunday typed as an exception is ignored — it is already not a working day.
- Feasible = `Hour budget × MILL_RATE_TPH`. Hours ↔ tonnes go through `mtToHours` / `hoursToMt` only, so a rate change cannot leave the two halves disagreeing. **Tonnage only — no `weightPerTube` and no density constant is involved.**
- The gap decomposes into exactly three causes that sum to it, asserted on load (`campaignDecomposition`): `Baseline − Achieved = (Baseline − Revised) + (Revised − Feasible) + (Feasible − Achieved)`. Causes are returned **signed**; a month committed under Feasible really did have hours going spare.

## Commit gate — unresolvable grid cells

Commit has **two** gates. The first is reconciliation (rule 4). The second is resolvability.

The grid lets any cell be typed, including a family + thickness the trailing month never saw. A freely-typed cell has to answer "which SKU is this?", and `gaugeIdentity(family, thickness, skus)` answers it from the master. When the master carries no such product, the cell gets a synthetic `unresolved|…` key that no production can ever match:

```
free-typed cell  →  campaign_gauges.sku_key = unresolved|SHS 50x50|6.00
                         │
   plant produces it ────┤
                         ├─► campaignProgress: skuOf(code) ≠ sku_key → not found
                         │      → gauge reads 0 achieved, forever
                         │      → family shows permanently behind
                         └─► campaignUnplanned: not in the planned-gauge set
                                → lands in the HIGHLIGHTED unplanned block
```

That inverts the Monitor: the three-cause decomposition blames "the mill missed" for tonnage the mill actually rolled. So — **type anything while Draft; Commit stays disabled until every typed cell resolves to a real SKU** (`unresolvedGauges`), surfaced the same way unreconciled families are. Only typed, positive cells count: a suggestion always came from a real SKU, and a typed 0 needs nothing to match it.

Two master SKUs sharing a family and thickness (different IS standard or length) are two gauges in one cell. That cell is read-only and shows their total, rather than the app picking one.

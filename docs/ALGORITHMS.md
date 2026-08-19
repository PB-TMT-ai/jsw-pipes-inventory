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
- **Distributor × SKU stock** (`salesByDistributor` with `opts.productions`) — per distributor and canonical SKU: `pending = confirmed + nonConfirmed`; `onhand = max(0, producedPool.availableWeight)`; `allConfirmed` = Σ Confirmed across **every** distributor; **`freeStock = onhand − allConfirmed`** — the displayed figure, plant stock promised to nobody yet, **not floored** so an over-committed size reads negative; `allPending` = Σ pending across **every** distributor for that SKU; `shortBy = max(0, pending − onhand)` — still measured against on-hand, so a row can show no shortfall beside a negative Free Stock. `onhand` is the **whole plant's** stock and is divided between nobody, so the identical tonnage repeats on every distributor's row for that size and `shortBy` can read 0 on a size that is oversubscribed several times over (ADR-0002 — 39.3 T of `50x50x2.0` against 78 T queued across five distributors). Both the Sales tab drill-down and the PB MTD workbook's **Distributor × SKU** sheet read this one function, so screen and workbook cannot disagree; the sheet lists only live pairs (pending or invoiced MTD above zero), sorts region → distributor → pending desc, and **never totals `onhand`** — summing it reports more stock than the plant holds. Each SKU row also carries its own **`description`** — the SKU master's when it has a row for the code, else the **order line's own** description. 37 of the ERP codes on the order book have no master row at all (ordered, never produced), and for those the order line is the only place the tube's name exists; without it both the screen and the workbook printed the raw MM ID (`1140-13075-10078295`) where the description belongs. The workbook's SKU label is derived from that description in the same `size x thickness` shape the SKU Ageing sheet uses, so the two sheets still join.
- ±5% tolerance on weight validations (via the shared `tolerance()` helper — returns `ok:true` on falsy args, so cap checks guard `actualWeight>0` explicitly).

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

## Daily report — the region split

`buildRegionMtdSummary` (`src/lib/reports.js`) produces the region block in the daily PB MTD text and
WhatsApp reports: **Invoiced MTD** and **Pending to serve** (Confirmed + Non-confirmed) per region,
and nothing else. It is fed to the skills by `scripts/region-mtd.mjs`, never by SQL — region is not a
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

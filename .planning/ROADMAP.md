# JSW Pipes & Tubes Inventory — Roadmap

> Planning bootstrapped for a brownfield single-file React app (`src/App.jsx`).
> GSD SDK orchestration (`gsd-sdk`) is not installed in this repo; phases are
> tracked here manually and executed with the standard plan → execute → verify flow.

## Phase 1: Slit-to-Tube Capacity Fix & Invoice Cost Reconciliation

**Status:** Complete (executed 2026-06-03 — see phases/01-slit-tube-recon/01-01-SUMMARY.md)
**Goal:** Fix Stage 3 tube-capacity accounting so already-produced tubes reduce a
baby coil's remaining capacity, reorder the Slit-to-Tube form to pick the coil
first and filter SKUs by the coil's thickness (±5%), and add a per-SKU/per-date
Invoice Reconciliation CSV export on the Dispatch tab.

**Requirements:**
- R1 — Stage 3 (Slit to Tube) must subtract tubes already produced from a baby
  coil when computing remaining capacity, and block over-production.
- R2 — Stage 3 form: select Baby Coil first; SKU options filtered to SKUs whose
  thickness is within ±5% of the baby coil's thickness.
- R3 — Invoice Reconciliation CSV download with columns: Date of dispatch,
  Invoice no., SKU, Quantity (MT), Mother coil, Cost price/MT, Conversion cost/MT,
  Ladder cost/MT, Total cost of invoice quantity.

**Success criteria:**
- Recording a second tube batch from the same baby coil shows reduced remaining
  capacity and blocks exceeding it.
- Selecting a baby coil filters the SKU dropdown to thickness-compatible SKUs.
- The Dispatch tab exports a CSV with one row per (dispatch date × invoice × SKU)
  and the 9 specified columns, costs computed per the locked cost model.

## Phase 2: Coil Tracker Excel-Style Summary

**Status:** Complete (executed 2026-06-10, UAT passed 6/6 — see
phases/02-coil-tracker-summary/02-UAT.md)
**Plans:** 1 plan — 02-PLAN.md (plan committed 2026-06-10)

**Goal:** Rebuild the Coil Tracker inventory summary as an Excel-style coil
summary report: 14 fixed columns tracing each mother coil from inward through
slitting, conversion, tube production, and dispatch to tube inventory; compact
Excel-density rows; a subtotals row pinned at the top; and a date-based time
period (From/To) filter.

**Requirements:**
- R4 — Summary table with exactly these 14 columns per mother coil: Coil ID,
  Grade, Coil Wt (T), # Baby Coils, Baby Coil Wt (T), # Converted,
  Converted Wt (T), # Tubes, Tubes Wt (T), # Dispatched, Dispatched Wt (T),
  Balance to Roll (T), Tube Inventory (T), Tube Inventory (#). Derived columns:
  Balance to Roll = Coil Wt − Baby Coil Wt; Tube Inventory (T) = Tubes Wt −
  Dispatched Wt; Tube Inventory (#) = # Tubes − # Dispatched.
- R5 — Date-based time period filter (From/To) on the summary.
- R6 — Subtotals row pinned at the top of the table (above all coil rows),
  summing every numeric column.
- R7 — Excel-standard presentation: compact row height/density, gridlines,
  right-aligned numerics, weights to 2 decimals, counts with thousands
  separators, zero/empty cells rendered as "-".

**Success criteria:**
- The Coil Tracker shows one row per mother coil with all 14 columns and values
  that reconcile (sample-verified formulas above).
- Changing the From/To dates narrows the rows and the subtotals recompute.
- The subtotal row stays at the top in all states (filtered, sorted, scrolled).
- Rows render at Excel-like density and the table matches the formatting rules
  in R7.

## Phase 3: Campaign Planner & Monitor

**Status:** Planned (context + plan committed 2026-08-04 — see
phases/03-campaign-planner/03-PLAN.md)
**Plans:** 1 plan — 03-PLAN.md

**Goal:** Add one Campaign tab carrying the monthly production plan behind a
Plan / Track switch. The Planner builds a month's commitment from the Plant Best
Estimate (volume) and trailing sales (family and gauge mix), tested against the
mill's Hour budget rather than a tonnage floor. The Monitor scores actual
production against the committed Baseline and splits the gap into three named
causes, with unplanned production highlighted beside it and never deducted.

Built on plant facts established 2026-08-04: one plant, one mill, 12 h/day,
**4.32 t/h** measured from production history, floors of 20 MT per family and
3 MT per SKU. See `.scratch/pt-os-research/issues/04-plant-mill-configuration.md`.

**Requirements:**
- R1 — Four tables (`campaigns` with `month` UNIQUE, `campaign_revisions`,
  `campaign_lines`, `campaign_gauges`), wired into `TABLE_MAP` with composite
  `CONFLICT_TARGET` arbiters.
- R2 — `calc.js` helpers: `MILL_RATE_TPH`, `familyKey`, `campaignWorkingDays`,
  `campaignHourBudget`, `campaignSuggestion`, `campaignProgress`,
  `campaignUnplanned`.
- R3 — Planner: Initiate snapshots demand, family targets typed, gauge split
  suggested and editable, hour test and gauge-reconciliation test shown as tests
  not verdicts, Commit gated on reconciliation.
- R4 — Monitor: the three-cause decomposition as an asserted identity, family
  and gauge progress, and a visually distinct unplanned block.
- R5 — One tab, Plan / Track switch defaulting to Track once Active, Plan side
  read-only until Revise.
- R6 — Six `CONTEXT.md` terms and ADR-0003 (Baseline survives revision).

**Success criteria:**
- Aug 2026 initiates to ~1,450 MT and reports over budget by ~24 h before any
  editing.
- An unbalanced gauge split blocks Commit and shows the shortfall as a test.
- Production against an unplanned family appears in the unplanned block and
  leaves Hours used against the budget unchanged.
- Revising keeps the Baseline and attributes the difference to "demand changed".
- Re-saving a line under a fresh id updates rather than erroring (proves the
  composite conflict targets).

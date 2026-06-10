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

**Status:** Planned

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

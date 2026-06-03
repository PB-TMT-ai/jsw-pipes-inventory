# JSW Pipes & Tubes Inventory — Roadmap

> Planning bootstrapped for a brownfield single-file React app (`src/App.jsx`).
> GSD SDK orchestration (`gsd-sdk`) is not installed in this repo; phases are
> tracked here manually and executed with the standard plan → execute → verify flow.

## Phase 1: Slit-to-Tube Capacity Fix & Invoice Cost Reconciliation

**Status:** Planned
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

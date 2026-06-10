---
status: testing
phase: 02-coil-tracker-summary
source: 02-01-SUMMARY.md
started: 2026-06-10T06:28:21Z
updated: 2026-06-10T06:28:21Z
---

## Current Test

number: 1
name: 14-Column Excel-Style Summary Renders
expected: |
  Open the Coil Tracker tab. The "Inventory Summary — All Coils" section shows
  a compact Excel-style table with one row per mother coil and exactly 14
  columns in this order: Coil ID, Grade, Coil Wt (T), # Baby Coils,
  Baby Coil Wt (T), # Converted, Converted Wt (T), # Tubes, Tubes Wt (T),
  # Dispatched, Dispatched Wt (T), Balance to Roll (T), Tube Inventory (T),
  Tube Inventory (#). Rows are Excel-dense with gridlines on every cell,
  numeric columns right-aligned, weights to 2 decimals, counts with thousands
  separators (e.g. 1,011), and zero/blank cells rendered as "-".
awaiting: user response

## Tests

### 1. 14-Column Excel-Style Summary Renders
expected: Coil Tracker tab shows the Excel-style table — one row per mother coil, 14 columns in the locked order, gridlines, right-aligned numerics, 2-dp weights, thousands-separated counts, "-" for zero/blank.
result: [pending]

### 2. Subtotal Row Pinned at Top
expected: The first row of the table reads "Total (N)" (N = number of coils shown), bold and shaded, summing every numeric column. Scrolling the table body keeps BOTH the header and the Total row pinned at the top, with gridlines persisting and no data rows bleeding through behind them.
result: [pending]

### 3. Date Period Filter
expected: From/To date inputs sit in the section header. Setting them narrows rows to coils whose inward date falls in the range (inclusive) and the Total (N) row recomputes. Clearing both brings all coils back. A single bound works alone (open-ended).
result: [pending]

### 4. Row Click Opens Coil Journey
expected: Clicking a coil row highlights it (indigo) and opens the Coil Journey detail below, exactly as before. Clicking the Total row does nothing (not clickable).
result: [pending]

### 5. Formulas Reconcile for a Sample Coil
expected: Pick one coil with downstream activity. Its cells reconcile — Balance to Roll = Coil Wt − Baby Coil Wt; Tube Inventory (T) = Tubes Wt − Dispatched Wt; Tube Inventory (#) = # Tubes − # Dispatched — and match manual sums of its Stage 2 (baby coils), Stage 3 (tubes), and Stage 5 (dispatch) records. Negatives show a minus sign.
result: [pending]

### 6. Dark Mode Rendering
expected: Toggling dark mode keeps the table fully styled — dark header and subtotal backgrounds, readable text, visible gridlines, no white patches behind sticky cells.
result: [pending]

## Summary

total: 6
passed: 0
issues: 0
pending: 6
skipped: 0
blocked: 0

## Gaps

[none yet]

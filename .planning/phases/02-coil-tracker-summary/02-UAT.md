---
status: complete
phase: 02-coil-tracker-summary
source: 02-01-SUMMARY.md
started: 2026-06-10T06:28:21Z
updated: 2026-06-10T07:55:00Z
---

## Current Test

[testing complete]

> **Method note:** Tests 2–6 verified by Claude via headless-browser run
> (puppeteer + @sparticuz/chromium) against the live dev server, with a local
> fake Supabase REST server serving a 14-coil dataset mirroring the user's
> sample sheet (incl. unslit coil, undispatched coil, fully-dispatched coil,
> null-weight coil). 21/21 automated checks passed; screenshots reviewed and
> sent to user. Test 1 also confirmed by user.

## Tests

### 1. 14-Column Excel-Style Summary Renders
expected: Coil Tracker tab shows the Excel-style table — one row per mother coil, 14 columns in the locked order, gridlines, right-aligned numerics, 2-dp weights, thousands-separated counts, "-" for zero/blank.
result: pass

### 2. Subtotal Row Pinned at Top
expected: The first row of the table reads "Total (N)" (N = number of coils shown), bold and shaded, summing every numeric column. Scrolling the table body keeps BOTH the header and the Total row pinned at the top, with gridlines persisting and no data rows bleeding through behind them.
result: pass

### 3. Date Period Filter
expected: From/To date inputs sit in the section header. Setting them narrows rows to coils whose inward date falls in the range (inclusive) and the Total (N) row recomputes. Clearing both brings all coils back. A single bound works alone (open-ended).
result: pass

### 4. Row Click Opens Coil Journey
expected: Clicking a coil row highlights it (indigo) and opens the Coil Journey detail below, exactly as before. Clicking the Total row does nothing (not clickable).
result: pass

### 5. Formulas Reconcile for a Sample Coil
expected: Pick one coil with downstream activity. Its cells reconcile — Balance to Roll = Coil Wt − Baby Coil Wt; Tube Inventory (T) = Tubes Wt − Dispatched Wt; Tube Inventory (#) = # Tubes − # Dispatched — and match manual sums of its Stage 2 (baby coils), Stage 3 (tubes), and Stage 5 (dispatch) records. Negatives show a minus sign.
result: pass

### 6. Dark Mode Rendering
expected: Toggling dark mode keeps the table fully styled — dark header and subtotal backgrounds, readable text, visible gridlines, no white patches behind sticky cells.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

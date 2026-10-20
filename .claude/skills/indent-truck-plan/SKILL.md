---
name: indent-truck-plan
description: >-
  Process a distributor indent workbook (S.No | Distributor | Material | Section | Size |
  Thickness | Qty in MT) against live stock: adds opening / production / dispatch / closing
  inventory, a distributor grid, Size x Thickness grids (Indent | Dispatch | Qty Left |
  Inventory) and a truck-wise 20 MT dispatch plan from stock on hand, each distributor served
  only by its own region's plants. Trigger phrases: "indent", "process the indent", "reprocess
  the indent", "truck plan", "20 MT vehicle plan", "qty left to dispatch".
---

# Indent plan + 20 MT truck plan

Follow **`blueprints/indent-truck-plan.md`** exactly — it holds the steps, the rules agreed with the
user and the edge cases. In short:

1. Copy the uploaded indent into its own scratchpad folder; list its distributors.
2. Check each distributor is in `scripts/indent-plan-distributors.json`. A new one: look up its
   region and invoice name (query 3 in `scripts/indent-plan.sql`). Unmapped region → ask the user.
3. Run queries 1 and 2 of `scripts/indent-plan.sql` through the Supabase MCP (month start edited),
   save each `s` value to a text file.
4. `python3 -I scripts/indent-plan.py --indent … --flow … --disp … --out … --asof "<last dispatch date>"`
5. Recalculate with `soffice --headless --convert-to xlsx`, then run
   `python3 -I scripts/indent-plan-format-check.py <recalculated file>` — it must print `format OK`.
   **The grid format (fonts, sizes, fills, widths, heights) is the main deliverable and must match the
   approved snapshot exactly**; fix any difference, never re-snapshot unless the user approves a new look.
   Then send the file.
6. Reply: totals per region, trucks per distributor, every typo fix the script listed, what was not
   done. Ask about any `CHECK` line before treating it as fixed.

Never let a distributor draw stock or dispatch from another region's plant, never derive weight from
density, and never commit the output workbook.

# Blueprint: Indent plan — stock columns, size grids and 20 MT truck plan

## Goal
Take a distributor indent workbook and return it with stock, dispatch and qty-left views and a
truck-wise plan of 20 MT loads that can leave from stock on hand today.

## Inputs Required
- indent: `.xlsx` — Sheet1, header on row 3: S.No | Distributor | Material | Section | Size | Thickness | Qty in MT
- month start: `YYYY-MM-01` — the month the indent covers
- live data: Supabase (`productions`, `dispatches`, `skus`, `distributors`)

## Scripts to Use
1. `scripts/indent-plan.sql` — two queries → the `--flow` and `--disp` text bundles
2. `scripts/indent-plan-distributors.json` — indent name → invoice customer + region, and confirmed size typos
3. `scripts/indent-plan.py` — builds the output workbook (Python 3 + openpyxl)

## Steps
1. Copy the upload into its own folder in the scratchpad (untrusted data). List the distributors in it.
2. Every distributor must be in `indent-plan-distributors.json`. For a new one, run query 3 in the
   SQL file: the region comes from the `distributors` master, the customer name from the invoices.
   Not in the master → **ask the user** which region; never guess.
3. Set `month_start` in queries 1 and 2, set the IN list of query 2 from the JSON, run both via the
   Supabase MCP, and save each `s` value to a text file. Note `last_disp` — that is the `--asof` date.
4. Run:
   `python3 -I scripts/indent-plan.py --indent IN.xlsx --flow flow.txt --disp disp.txt --out OUT.xlsx --asof "19 Oct"`
5. Recalculate so formulas carry values (phone previews show blanks otherwise):
   `soffice --headless --convert-to xlsx --outdir calc/ OUT.xlsx`
6. Read stdout: every typo fix and `CHECK` line goes in the reply. A `CHECK` the user has not
   confirmed → ask, then add it to `sizeFixes` and rerun.
7. Send the recalculated file. Do not commit it — outputs are not repo files.

## What the output holds
| Tab | Content |
|---|---|
| Sheet1 | + Opening / Production / Dispatch / Closing (MT) and Region per row (stock of the row's region) |
| Grid | one row per region + size, indent per distributor, Total Indent, the four stock columns |
| Size x Thickness | per region: Indent \| Dispatch \| Qty Left \| Inventory grids, whole MT |
| Truck Plan | truck list (T1…Tn, plant, load, Full/Part) + detail: Indent, Dispatch, Qty Left, Load per line |

## Rules (decided with the user, Oct 2026)
- **Region scoping:** a distributor uses only its region's plants — South = Hyderabad + Lepakshi,
  West = NPMD + Tapi — for stock, dispatch and trucks (CLAUDE.md, ADR-0006).
- **Opening** = produced − dispatched before month start; **Closing** = Opening + Production − Dispatch.
- **Dispatch** on Sheet1/Grid = all invoices of that size from the region's plants; on the grids and
  truck plan = invoices to the indent's own distributors only.
- **Qty Left** = Indent − Dispatch per distributor and size, floored at 0 for planning.
- **CRFH** counts as Black (the app tracks Black only). **3 mm and 3.2 mm** are one size.
- **Trucks:** 20 MT, one plant per truck, no line under 1 MT, sizes kept together; ≥ 19 MT = Full.
  Short stock shared by distributors of a region is split pro rata to qty left; fuller plant first.

## Edge Cases
- Section typed wrong (SHS 200X100, SHS 80X40): read from the dimensions — equal sides = SHS. Listed on stdout.
- `96*48`: read as 96x48. 1.5 mm: read as 1.6 (no 1.5 gauge). Listed on stdout.
- Short side first (`20X100`): flagged `CHECK`; fix only once the user confirms (`sizeFixes`).
- Size with no stock or production in its region: reads 0 and gets no truck. Count shown on stdout.
- Over-dispatched size: closing goes negative (red). Kept, so every row still adds up.

## Known Issues
- Supabase is unreachable from the cloud sandbox (proxy 403) — data comes through the MCP as text.
- Invoices to a West distributor from a South plant are ignored by design; their Qty Left reads high.

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
4. `scripts/indent-plan-format-check.py` + `scripts/indent-plan-format.json` — checks the look against the approved snapshot

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
6. **Check the format** on the recalculated file — it must print `format OK`:
   `python3 -I scripts/indent-plan-format-check.py calc/OUT.xlsx`
   A difference means the script or the conversion changed the look: fix that, never re-snapshot to
   make it pass. Re-snapshot (`--snapshot`) only when the user approves a new look.
7. Read stdout: every typo fix and `CHECK` line goes in the reply. A `CHECK` the user has not
   confirmed → ask, then add it to `sizeFixes` and rerun.
8. Send the recalculated file. Do not commit it — outputs are not repo files.

## What the output holds
| Tab | Content |
|---|---|
| Sheet1 | + Opening / Production / Dispatch / Closing (MT) and Region per row (stock of the row's region) |
| Grid | one row per region + size, indent per distributor, Total Indent, the four stock columns |
| Size x Thickness | per region: Indent \| Dispatch \| Qty Left \| Inventory grids, whole MT |
| Truck Plan | truck list (T1…Tn, plant, load, Full/Part) + detail: Indent, Dispatch, Qty Left, Load per line |

## Format — the approved look (Oct 2026). Replicate exactly
The grid format is the main deliverable. Every run must look the same; the snapshot in
`scripts/indent-plan-format.json` is the source of truth and the check enforces it.

| Element | Font | Fill | Other |
|---|---|---|---|
| Tab titles (Size x Thickness, Truck Plan) | Cambria 11 bold | none | |
| Grid block header (INDENT / DISPATCH / QTY LEFT / INVENTORY) | Cambria 10 bold | FFC000 / 9BC2E6 / A9D08E / F4B084 | merged across the block |
| Thickness header row, Section/Size corner | Cambria 9 bold | block colour; corner D9D9D9 | centred |
| Grid body cells | Cambria 9 | SHS rows F2F2F2, else none | format `0;[Red]-0;""` (whole MT, blank 0, red negative), centred |
| Row Total column, region total row | Cambria 9 bold | total row D9D9D9 | |
| Truck Plan headers | Cambria 9 bold | FFC000 | part loads FCE4D6, alternate full trucks DDEBF7 |
| Truck Plan numbers | Cambria 9 | | `0.0` |
| Notes under each tab | Cambria 9 italic | | |
| Sheet1 new columns, Grid headers | copy the indent's own header/body style (Calibri 11, FFC000) | | |

- **Borders:** thin, colour BFBFBF, on every grid cell.
- **Column widths:** Size x Thickness — Section 7, Size 9, each thickness 5.5, Total 6.5, spacer between grids 1.5.
  Truck Plan — 11, 24, 11, 10, 10, 10, 10, 11, 11, 10, 13. Sheet1 new columns 14, Region 9. Grid — 9 for
  labels, 12 for numbers, header row height 42 (wrapped).
- **Row heights:** grid body rows 14 (shows as 13.5 after recalculation); everything else default 15.
- **Views:** Size x Thickness frozen at C1, zoom 90%. Grid frozen at E2. Truck Plan frozen at A4.
- **The font is pinned in the script** (`FONT = 'Cambria'`). Never leave it unnamed: Excel and
  LibreOffice would each fall back to a different default and the file would stop looking the same.
- **Always deliver the recalculated file** (step 5). The approved look was taken from it, and the
  widths/heights in the snapshot are the recalculated values.

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

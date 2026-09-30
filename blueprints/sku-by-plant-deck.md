# Blueprint: SKU-by-plant deck

## Goal
A JSW One–branded .pptx showing which SKUs each plant **produced**, where plants overlap and what only
one plant makes — in the heatmap format of the "Market requirement vs plant capability" deck.

## Inputs Required
- Window (optional): `--from` / `--to`, YYYY-MM-DD, production date, inclusive.
  Default `from` = the day the **last** manufacturing plant produced its first batch (first day all
  plants were live); default `to` = latest production date.
- Rows: live Supabase (`productions`, `skus`) via `.env.local` / `--url --key`, **or** `--in FILE.json`.

## Scripts to Use
1. `scripts/sku-by-plant/sku-by-plant-deck.mjs` — fetches rows, writes the deck. `--json` prints the numbers instead.
2. `scripts/sku-by-plant/build.mjs` — the pure numbers (tested in `build.test.mjs`). Change a definition here, never in the renderer.
3. `scripts/sku-by-plant/jsw_template.cjs` + `assets/` — vendored copy of the jsw-one-pptx skill template.

## Steps
1. On a laptop with `.env.local`: `node scripts/sku-by-plant/sku-by-plant-deck.mjs` → `reports/SKU-by-Plant-<today>.pptx`.
2. In an agent session (sandbox blocks the Supabase host): dump rows with the Supabase MCP `execute_sql`
   (project `hztblmccvvarmgxmunrp`), one query returning
   `json_build_object('productions', json_agg(plant, sku_code, date_of_production, total_weight — non-deleted), 'skus', json_agg(sku_code, product_type, description, nominal_bore, height, breadth, thickness))`.
   The result is too large for the context, so the tool saves it to a file — extract the `bundle`
   object to JSON and pass it with `--in`.
3. Check the stderr summary line (window, SKUs, shared, MT, per-plant made/unique) against a SQL
   count of distinct `plant, sku_code` in the window before sending the deck.

## Decisions (agreed 2026-09-30 — don't change without asking)
- **Produced, not capable.** Actual JSW One production; a blank cell means "no order came through", never "cannot make".
- **Common window** by default, so Hyderabad's head start since March does not read as "unique".
- **Grid = SKUs any plant made in the window**, not the SKU master. A SKU = section × size × thickness cell (length ignored; duplicate master codes collapse).
- **Cells:** navy = made here only; mid-blue = shared (letters = which other plants); light amber = made elsewhere only (letters = who); grey = no plant.
- **No % column** on the heatmaps. MT appears in text (subtitle, summary table), never in cells.
- **Slide order:** cover → summary (overlap matrix, SKUs/MT table, takeaways) → one slide per plant, most SKUs first.

## Edge Cases
- Production whose `sku_code` is not in the master, or with no manufacturing plant: left out and **counted on the footer**, never silently dropped.
- A plant that made nothing in a section: that table is drawn with only amber/grey cells ("0 of N").
- A plant with no production in the window gets no slide.

## Known Issues
- LibreOffice is only needed to preview; the Claude sandbox ships `libreoffice-core` without Impress — `apt-get install libreoffice-impress` before rendering to PDF.

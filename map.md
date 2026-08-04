# Trend visuals: SKU-family and thickness movement

Type: prototype
Status: open
Blocked by: 07, 08

## Question

The user asked specifically for "trends of the distributors — SKU wise and thickness — visuals". That is distributor × family × thickness × time: four dimensions competing for a two-dimensional screen. Picking the wrong form here makes the most-requested feature unreadable.

Prototype and compare:

- **Heatmap** — family × thickness, cell coloured by change. Dense, shows the whole surface at once, weak at magnitude.
- **Small multiples** — a sparkline grid, one per family. Preserves shape, scales badly past ~40 cells.
- **Ranked movers** — drop the surface, show only the largest changes with their context. Fastest to act on, hides the pattern.
- **Slope chart** — two periods, one line per family. Very readable, only two points in time.

Decide against a real question, not in the abstract: *"which distributor is drifting, in what, and since when"* should be answerable in seconds. Test each form against that.

Also settle:

- **Absolute versus relative** — tonnes moved versus percentage change, and how a small family with a big percentage swing is stopped from dominating.
- **Seasonality** — whether trends are shown raw or deseasonalised, given the monsoon trough and Q4 peak will otherwise read as drift.
- **Thickness as an axis** — whether thickness is a real analytical dimension here or a nesting level under family. This is a domain question, not only a chart question; resolve it before drawing.
- **Entry point** — whether you arrive at this from a distributor, from a family, or from an alert.

Consult `dataviz` before drawing. Inherit the visual language and the logic-reveal component from [Visual language and the logic-reveal component](07-visual-language-prototype.md) rather than inventing new styling.

**Done when**: one primary form is chosen with a stated reason, secondary forms are assigned to their drill positions, and the raw-versus-deseasonalised call is made.

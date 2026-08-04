# Research: forecasting methods for campaign-constrained tube demand

Type: research
Status: resolved
Blocked by: —

## Question

What forecasting approach suits family-level demand for a multi-plant tube maker with ~40 size families, 2+ years of clean SKU-level history, strong seasonality, and supply that is campaign-constrained rather than continuous?

Cover:

- **Candidate methods and when each wins** — naive/seasonal-naive baselines, exponential smoothing family (including Croston-type for intermittent SKUs), simple regression with seasonal terms, and gradient-boosted approaches. Be explicit about which are worth the complexity at 40 families and which are not.
- **Combining a statistical baseline with distributor estimates** — override, blend, or bias-correct? What the evidence says about each, and how Forecast Value Added is used to prove the estimate layer is earning its place rather than degrading the baseline.
- **Honest backtesting** — rolling-origin evaluation, how to avoid leakage, how much history to hold out with only 2 years, and how to report accuracy so it is not flattering.
- **Realistic accuracy** — what MAPE/WMAPE is actually achievable at family grain versus SKU grain in this kind of business, so screen targets are set from reality not hope.
- **Intermittent and new SKUs** — how runner/repeater/stranger classification changes the method chosen per family.
- **Expressing uncertainty to a non-technical decision maker** — prediction intervals, scenario bands, or a plain confidence label. What actually gets trusted and acted on, and what gets ignored.
- **Constraint-awareness** — how a forecast should be presented when supply is lumpy by design, so the reader does not confuse "we won't sell it" with "we won't make it that week".

Bias strongly toward methods implementable without an ML platform. Cite sources; label synthesized rules as such.

**Output**: write findings to `.scratch/pt-command-centre/research/forecasting-methods.md` and link it back from this ticket.

## Answer

Full brief: [`research/forecasting-methods.md`](../research/forecasting-methods.md)

- **Forecast at SKU Family × month, never at SKU or weekly grain.** Weekly saw-tooth in tube sales is a campaign artefact, not demand; disaggregate family → SKU by shrunk 6/12-month mix share instead.
- **Fix the demand signal before choosing any method.** Campaign constraints censor sales downward, which sizes the next campaign short and perpetuates the shortage. Use `max(orders, sales)` with an availability-ratio scale-up fallback — the order history the business already has makes the sophisticated unconstraining literature unnecessary.
- **Primary method: shrunk-seasonal decomposition simple-averaged with seasonal-naive-with-drift.** The 2-year problem is that each family has only 2 observations per calendar month; solve it by pooling the seasonal index at group level and shrinking the family's own index 50% toward it. Add `AutoETS` only where it beats seasonal naive per family. SBA for the intermittent cell (outputs a *rate*, not a monthly point). **Reject gradient boosting and ARIMA** — M5's ML win came from cross-learning across 42,840 daily series; here there are ~1,120 rows total. Explicit revisit trigger at 4 years + SKU-week grain.
- **Estimates: bias-correct at group level, then inverse-error blend — never silent override.** Block manual overrides under ±15% (Fildes et al.: small adjustments waste time or damage accuracy) and force the estimate layer's blend weight to zero unless it shows positive FVA over 12 months. The FVA stairstep is the artefact that proves the layer earns its place.
- **Backtest with an expanding-window rolling origin**, 18-month minimum train, 8 origins × h=1..3 (960 pairs). The likeliest leak is computing the *group* seasonal index once on all history and reusing it across folds — it feels like master data and is not.
- **Set the screen target at 15–22% family-grain h=1 WMAPE, not 10%.** Seasonal naive will land 22–28%; a good baseline beats it by 4–8 points, and that gap is the entire value of the layer. If the gap is under 2 points, ship seasonal naive and spend the effort on the Rolling Program.
- **Do not ship prediction-interval bands.** Goodwin/Önkal/Thomson found intervals did *not* improve production planning decisions and reduced responsiveness to loss asymmetry. Ship *Expected* + *Plan* (a newsvendor critical-ratio quantile from empirical backtest error) + a three-word confidence label.
- **Keep "won't sell" and "won't make" structurally separate:** monthly demand rate, next campaign window, required campaign quantity, and a three-way flag (SUPPLY-CONSTRAINED / SEASONAL-LOW / CENSORED-SIGNAL) — three causes, three owners, three messages.

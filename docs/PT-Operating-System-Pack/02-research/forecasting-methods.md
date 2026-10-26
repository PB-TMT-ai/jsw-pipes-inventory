# Forecasting methods for campaign-constrained tube demand

*Research brief for the P&T Command Centre. Answers ticket `05-research-forecasting-methods`. Compiled 2026-08-01.*

**Scope note:** per-Distributor reliability scoring / per-Distributor bias correction is **out of scope** by instruction. Everything here about bias correction operates at **aggregate (family-group) level**, and FVA is applied to the estimate layer **as a whole**.

**Labelling convention:** claims backed by a cited source carry an inline citation. Rules, thresholds, and numbers I derived are marked **[synthesized]**. All worked-example numbers are illustrative tube-industry figures, not company data.

---

## 0. The recommendation in one page

| Decision | Recommendation |
|---|---|
| **Forecast grain** | **SKU Family × month.** Never fit statistics at SKU grain or at weekly grain. Disaggregate family → SKU by shrunk mix share (§9). |
| **Demand signal** | `max(orders received, primary sales dispatched)` per family-month, plus a censoring flag. Sales alone is a censored signal and biases every forecast downward (§2). |
| **Primary method** | **Shrunk-seasonal decomposition** (pooled seasonal index + damped-drift level), simple-averaged with **seasonal-naive-with-drift** (§4.1, §4.2). Two methods, ~60 lines of Python, no fitting library required. |
| **Third member** | `AutoETS` from `statsforecast`, admitted to the average **only if it beats seasonal naive in that family's backtest** (§4.3). |
| **Intermittent families** | **SBA** (Croston with the `1 − α/2` correction) — outputs a *demand rate*, not a monthly point (§4.4). Lumpy families get no forecast at all: firm indent only. |
| **Gradient boosting** | **No.** 40 families × ~28 monthly points = ~1,120 rows. Revisit only at ≥ 4 years of history and only at SKU-week grain (§4.6). |
| **ARIMA** | **No.** Unstable at 28 monthly observations with s=12, and unexplainable to the user (§4.6). |
| **Estimate layer** | **Blend, not override.** Aggregate bias-correct → inverse-error-weighted blend → block manual overrides below ±15% → publish an FVA stairstep monthly (§5). |
| **Backtesting** | Expanding-window rolling origin, 18-month minimum train, 8 origins × h=1..3, hyperparameters fixed a priori (§6). |
| **Realistic target** | Family-grain h=1 portfolio WMAPE **15–22%**. Anything promising <10% at family grain is not achievable here (§7). |
| **Uncertainty** | Do **not** ship symmetric ± bands. Ship *Expected* + *Plan* (a critical-ratio quantile) + a three-word confidence label (§8). |
| **Constraint-awareness** | Never render a weekly demand series. Render monthly demand + next campaign window + required campaign quantity, so "won't sell" and "won't make" are structurally different fields (§10). |

---

## 1. What is being forecast, and why the grain matters

The forecast has exactly one customer: **campaign planning**. The question it answers is *"how much of this SKU Family must the next campaign produce, and when must the campaign after it run?"* That fixes the grain:

- **Unit:** tonnes (mills and pricing work in tonnes; trade transacts in pieces/bundles — convert at the presentation layer only).
- **Object:** SKU Family (per `CONTEXT.md`: estimates, schemes and campaign planning all operate at family level). ~40 series.
- **Period:** calendar month. Not week.
- **Horizon:** h = 1 to 6 months. h=1..3 is the decision-relevant band (a campaign cycle is 2–6 weeks); h=4..6 exists only to feed HRC coil booking, which has 4–8+ week lead times.
- **Split:** by plant only if a family is genuinely multi-sourced and allocation is plant-fixed; otherwise forecast national and allocate. Splitting 40 series into 40 × 3 plants triples the noise for no decision benefit. **[synthesized]**

### Why monthly, not weekly

Two independent reasons, and the second is the one that matters most here:

1. **Statistical.** ~28 months of history gives 28 observations per family. At weekly grain you get ~120 observations but the signal is dominated by ordering lumpiness and dispatch timing, not demand.
2. **Campaign artefact.** A family produced every 2–6 weeks produces a saw-tooth in the *sales* series that is a supply artefact, not demand. At weekly grain you would be modelling the Rolling Program. At monthly grain a 6-week cycle (≈1.4 months) largely washes out. **[synthesized]**

Weekly numbers still appear in the Command Centre — but as *derived coverage arithmetic* off a monthly rate (§10), never as a fitted weekly forecast.

---

## 2. The demand signal: fixing censoring before any method is chosen

This is the highest-leverage item in the brief and it costs almost nothing to implement.

**The problem.** When supply is campaign-constrained, a family is periodically unavailable. Sales in those months understate demand. Fitting anything to sales gives a downward-biased forecast, which sizes the next campaign short, which causes the next shortage. Sales-based forecasts are biased downwards relative to forecasts based on unobservable actual demand ([Demand forecasting under lost sales stock policies, IJF 2023](https://www.sciencedirect.com/science/article/abs/pii/S0169207023000961)); the effect has been documented since [Wecker (1978)](https://www.researchgate.net/publication/268209485_Demand_Estimation_and_Ordering_Under_Censoring_Stock-Out_Timing_Is_Almost_All_You_Need), and modern work describes the resulting "self-reinforcing cycle" where models trained on censored sales perpetuate stockouts ([FreshRetailNet, arXiv 2505.16319](https://arxiv.org/html/2505.16319v3)).

**The fix, in priority order.** The business already has clean order history — that is the uncensored signal, and it makes the sophisticated statistical unconstraining methods (Tobit, product-limit, Kalman) unnecessary here. **[synthesized]**

```
demand_signal(family, month) =
    if orders_received is complete for that family-month:
        max(orders_received_tonnes, primary_sales_tonnes)
    else if availability_ratio >= 0.80:
        primary_sales_tonnes                        # effectively uncensored
    else:
        min(primary_sales_tonnes / availability_ratio,
            1.50 * primary_sales_tonnes)            # scale-up, hard-capped
```

Where:

```
availability_ratio = (days in month with closing FG stock > 0 for ANY SKU in the family
                      AND the family not blocked for credit/quality)
                     / days in month
```

The `1.50 ×` cap prevents an explosion when `availability_ratio` is near zero (a month with 3 days of availability would otherwise be scaled 10×). **[synthesized]**

**Store three columns, not one:** `demand_signal`, `signal_source` (`order` / `sales` / `scaled`), `availability_ratio`. The backtest (§6) must report accuracy separately for months where `signal_source = 'scaled'`, because those are estimates being scored against estimates.

**A second cleaning step — Price Circular pull-forward.** Brief 03 established that month-to-month primary sales movement is substantially price-anticipation (restock before a hike, destock on a fall), not consumption. This *cannot* be a forecast driver (you rarely know the next circular date in advance) but it *must* be a history cleaner:

```
For each month with a circular effective date, compute
    pullforward_t = demand_signal_t - median(demand_signal over the 3 months either side, circular-free)
Cap the correction at ±20% of the month's value; subtract half of pullforward_t
from month t and add it back to month t+1 (hike) or t-1 (cut).
Store as `demand_signal_cleaned`; fit on cleaned, score against raw.
```
**[synthesized]** — the direction is evidence-based (brief 03), the specific ±20% cap and half-share split are my choices, deliberately conservative. Fit on cleaned, **score on raw**, so the reported accuracy is not flattered by the cleaning.

---

## 3. Classification: which method each family gets

Two classification lenses are needed and they answer different questions. Compute both from the **cleaned monthly demand signal, last 24 months**, recomputed **quarterly** (not monthly — see §11).

**Lens A — Runner/Repeater/Stranger** (already in brief 01 §5): sets campaign *policy* (MTS / fixed cycle / indent-only).

**Lens B — Syntetos-Boylan-Croston (SBC)**: sets *forecast method*. The SBC scheme uses Average Demand Interval (ADI) and squared coefficient of variation of demand size (CV²), with cut-offs **ADI = 1.32** and **CV² = 0.49**, defining four cells — smooth, intermittent, erratic, lumpy. Syntetos, Boylan & Croston recommend Croston for the erratic cell and SBA for the other three ([Open Forecast, 2024](https://openforecast.org/2024/07/16/intermittent-demand-classifications-is-that-what-you-need/); [Syntetos & Boylan cut-off values](https://www.researchgate.net/figure/Cutoff-values-Crostons-method-Syntetos-and-Boylan-method_fig1_222105798)).

```python
# per family, on the last 24 cleaned monthly values
nz      = [v for v in series if v > 0]
ADI     = len(series) / max(len(nz), 1)
cv2     = (statistics.stdev(nz) / statistics.mean(nz)) ** 2   # needs len(nz) >= 2
```

### The method-assignment table

| Cell | Test | Method (§4) | Output | Cadence |
|---|---|---|---|---|
| **Smooth** (runners) | ADI ≤ 1.32 **and** CV² < 0.49 | Decomposition + SNaive-drift **+ ETS if it earns it**, simple average | Monthly tonnage, h=1..6 | Monthly forecast; weekly coverage refresh |
| **Erratic** (repeaters) | ADI ≤ 1.32 **and** CV² ≥ 0.49 | Same two methods, but seasonal index **fully pooled** from the group (own index is unreliable at this CV) | Monthly tonnage, h=1..3 only | Monthly |
| **Intermittent** (strangers) | ADI > 1.32 **and** CV² < 0.49 | **SBA** | Demand **rate** (t/month) + expected months to reach minimum campaign lot | Monthly |
| **Lumpy** | ADI > 1.32 **and** CV² ≥ 0.49 | **None.** TSB rate for stock-obsolescence detection only; flag `order-driven` | Firm indent only; no plan number | Monthly review |
| **New** | < 6 months of history | Attribute analogue (§4.5) | Analogue-scaled tonnage, forced `Rough` label | On creation; monthly until 12 months |

Note the honest position on the Lumpy cell: **[synthesized]** a family whose demand arrives every ~4 months in unpredictable sizes cannot be forecast usefully at monthly grain from 24 points. Producing a number there is worse than producing a blank, because a number invites the planner to size a campaign on it. The correct system behaviour is to show the field as *"Indent-driven — 62 t booked, next window W37"* rather than a forecast.

Kostenko & Hyndman (2006) showed the SBC boundary should really be non-linear rather than four rectangles, but the simpler rectangular version "has not gained as much popularity as SBC because it is more complicated" ([Open Forecast](https://openforecast.org/2024/07/16/intermittent-demand-classifications-is-that-what-you-need/)) — for 40 families the rectangles are fine.

---

## 4. The methods

### 4.1 Seasonal naive with drift — the benchmark that must always be computed

**Data needed:** 13+ months of cleaned demand per family.

**Formula.**
```
drift = sum(demand[t-11 .. t]) / sum(demand[t-23 .. t-12])
F(t+h) = demand[t+h-12] * drift
```

**Why it is non-negotiable:** this is the FVA placebo. Every other number in the system is judged against it ([SAS, *Forecast Value Added Analysis: Step by Step*](https://www.sas.com/content/dam/SAS/en_us/doc/whitepaper1/forecast-value-added-analysis-106186.pdf)). It is also a genuinely competitive forecaster for smooth seasonal series and belongs in the combination, not just the benchmark row.

**Decision output:** the floor. If nothing beats it by ≥ 2 WMAPE points across the portfolio, ship it and spend the engineering effort on the campaign calendar instead. **[synthesized]**

**Worked example — family F40R (40 NB round, black, IS 1239 medium), forecasting Aug-2026.**

Illustrative history (tonnes/month):

| | Apr | May | Jun | Jul | Aug | Sep | Oct | Nov | Dec | Jan | Feb | Mar |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **FY24-25** | 1032 | 1145 | 878 | 812 | 726 | 869 | 1010 | 1022 | 1084 | 1096 | 1178 | 1188 |
| **FY25-26** | 1140 | 1235 | 954 | 902 | 810 | 948 | 1128 | 1130 | 1180 | 1225 | 1240 | 1355 |
| **FY26-27** | 1195 | 1290 | 1002 | 940 | *?* | | | | | | | |

```
last 12 (Aug-25 .. Jul-26)  = 810+948+1128+1130+1180+1225+1240+1355+1195+1290+1002+940 = 13,443
prior 12 (Aug-24 .. Jul-25) =  726+869+1010+1022+1084+1096+1178+1188+1140+1235+ 954+902 = 12,404
drift = 13,443 / 12,404 = 1.0838
F(Aug-26) = demand[Aug-25] × drift = 810 × 1.0838 = 878 t
```

### 4.2 Shrunk-seasonal decomposition — the recommended primary

This is classical multiplicative decomposition with one modification that specifically solves the 2-years-of-history problem.

**The problem it solves.** With 2 complete fiscal years, each family has exactly **2 observations per calendar month**. A seasonal index estimated from n=2 is extremely noisy — a single stockout or a single large project order permanently distorts one month of the seasonal shape. fpp3 is explicit that rule-of-thumb minimum sample sizes are "misleading and unsubstantiated"; what matters is observations per parameter ([fpp3 §13.7](https://otexts.com/fpp3/long-short-ts.html)). Twelve free seasonal parameters on 24 observations is 2 obs/parameter — unusable.

**The fix: pool the seasonal shape, shrink toward it.** Seasonal indices of short series can be estimated using a collection of series of the same category ([Formation of seasonal groups and application of seasonal indices](https://www.researchgate.net/publication/263195020_Formation_of_seasonal_groups_and_application_of_seasonal_indices)). The company-level (or section-shape-group-level) index has 40× the support and is far more stable. Seasonality here is macro anyway — monsoon and fiscal-year-end drive all families in the same direction.

**Procedure.**

```
STEP 1 — group index (one per calendar month, per group)
  For group G (recommended: {black round, black square/rect, GI} — 3 groups):
    total_G[month]  = sum of cleaned demand across all families in G
    for each fiscal year y with complete data:
        raw[m, y] = total_G[m, y] / (annual mean of total_G in y)
    index_G[m] = mean over y of raw[m, y]
    normalise so sum(index_G) = 12

STEP 2 — family's own index (same arithmetic, one family)
    index_own[m], normalised to sum 12

STEP 3 — shrink
    w = n / (n + k)         where n = complete fiscal years available, k = 2
    index[m] = w * index_own[m] + (1 - w) * index_G[m]
    renormalise to sum 12
    # at n=2 → w=0.50; at n=3 → w=0.60; at n=5 → w=0.71
    # Erratic-cell families (§3): force w = 0

STEP 4 — level (deseasonalised, last 3 months)
    L = mean over last 3 months of ( demand[t] / index[month(t)] )

STEP 5 — damped drift
    L_prior = mean over the same 3 calendar months one year earlier of ( demand / index )
    g       = (L / L_prior) ** (1/12) - 1          # monthly growth rate
    g       = clip(g, -0.02, +0.02)                # ±2%/month hard cap

STEP 6 — forecast
    F(t+h) = L * (1 + g * sum_{i=1..h} phi**i) * index[month(t+h)]
    with phi = 0.90 (damping)
```

`k = 2`, `phi = 0.90`, the 3-month level window and the ±2%/month growth cap are **[synthesized]** choices — chosen a priori, deliberately *not* tuned on the backtest (see §6 leakage rules). `phi ≈ 0.9` is the conventional damped-trend range and damped trend is one of the most robust methods on short series.

**Worked example — same family F40R, Aug-2026.**

Own August index: `726 / 1003 = 0.724` (FY24-25 mean 1003) and `810 / 1104 = 0.734` (FY25-26 mean 1104) → `index_own[Aug] = 0.729`.
Group index for August (black round group, illustrative): `index_G[Aug] = 0.750`.
Shrunk (n=2, k=2, w=0.50): `index[Aug] = 0.5(0.729) + 0.5(0.750) = 0.740`.

Same arithmetic gives `index[May] = 1.115`, `index[Jun] = 0.875`, `index[Jul] = 0.807`, `index[Sep] = 0.855`.

```
STEP 4 — level from last 3 months
  May-26: 1290 / 1.115 = 1157
  Jun-26: 1002 / 0.875 = 1145
  Jul-26:  940 / 0.807 = 1165
  L = (1157 + 1145 + 1165) / 3 = 1156

STEP 5 — drift
  May-25: 1235 / 1.115 = 1108
  Jun-25:  954 / 0.875 = 1090
  Jul-25:  902 / 0.807 = 1118
  L_prior = 1105
  g = (1156/1105)^(1/12) - 1 = 1.0461^(0.0833) - 1 = +0.00376/month   (within cap)

STEP 6 — forecast h=1 (Aug-26)
  F = 1156 × (1 + 0.00376 × 0.90) × 0.740 = 1156 × 1.00338 × 0.740 = 858 t
```

### 4.3 ETS / Holt-Winters — admitted only on evidence

**Verdict: run it, gate it.** `AutoETS` in `statsforecast` is one call and costs nothing; the library also ships `seasonal_naive`, `croston_sba`, `tsb`, `theta` and compiles hot paths with numba, fitting 10 models on 1,000,000 series in under 5 minutes ([Nixtla StatsForecast](https://github.com/Nixtla/statsforecast)) — irrelevant at 40 series, but it means zero performance engineering.

**Gate [synthesized]:** admit `AutoETS` into a family's combination only if, in that family's rolling-origin backtest, it beats seasonal-naive-with-drift on h=1..3 WMAPE. Multiplicative Holt-Winters needs at least 2 full cycles and is genuinely unstable at 24–28 points; without the gate you will silently ship a diverging trend on some families.

**Do not** use Theta as a core method: THETA is excellent on non-seasonal data but "does not model seasonality, so it is limited for strongly seasonal data" ([Unmasking the Theta method, Hyndman & Billah](https://robjhyndman.com/papers/Theta.pdf)) — and this business is defined by its seasonality. If you want it, apply it to the *deseasonalised* series in place of Step 5–6 above.

### 4.4 Combination — take the simple average

**Do not estimate combination weights across methods.** The forecast combination puzzle is that "a simple equally weighted pooling of forecasts performs quite well in practice, relative to other approaches that rely on estimated combination weights" ([Lee & Lee](https://economics.ucr.edu/repec/ucr/wpaper/202514.pdf)); Green & Armstrong reviewed 32 papers comparing complex and simple combination and concluded that "in most cases, complexity harms forecast accuracy" ([survey](https://economics.ucr.edu/repec/ucr/wpaper/202514.pdf)). Estimated weights are unstable precisely when the training sample is small — which is exactly this situation.

```
F_baseline(t+h) = mean of the admitted methods
```

Worked, F40R Aug-26: SNaive-drift `878`, decomposition `858`, ETS *not admitted for this family*.
→ **`F_baseline(Aug-26) = 868 t`**

*(Note the two methods agree within 2.3% here. On erratic families they will diverge by 15–30%, and the disagreement is itself a useful signal — see the confidence label in §8.)*

### 4.5 SBA for intermittent families

**Croston** smooths demand size `Z` and inter-demand interval `P` separately, updating only when demand occurs. **SBA** applies a bias-correction factor:

```
when demand occurs (Z_t > 0):
    Z' = alpha*Z_t + (1-alpha)*Z'          # demand size
    P' = alpha*P_t + (1-alpha)*P'          # interval since previous demand
when Z_t == 0:  Z', P' unchanged

Croston: rate = Z'/P'
SBA:     rate = (1 - alpha/2) * Z'/P'
```

Croston "often will present a considerable positive bias, whereas in SBA the bias is reduced" ([Nixtla CrostonSBA docs](https://nixtlaverse.nixtla.io/statsforecast/docs/models/crostonsba.html)). Use `alpha = 0.10` — the classical Croston range is 0.05–0.20 and low alpha is right when you have 6 demand events, not 60. **[synthesized]**

**Critical implementation note:** SBA returns a **rate**, not a monthly point forecast. Writing `10.5 t` into an August cell implies the family sells 10.5 t in August, which it almost certainly will not — it will sell 0 t for three months and 44 t in the fourth. The system must render this as a rate and a lot-accumulation date.

**Worked example — family S150SQ (150 × 150 × 6.0 mm SHS, black), 24 months.**

Demand (t): `0, 0, 45, 0, 0, 0, 60, 0, 0, 38, 0, 0, 0, 0, 52, 0, 0, 0, 0, 44, 0, 0, 0, 40`

```
Classification:
  non-zero months = 6      ADI = 24/6 = 4.00        (> 1.32)
  sizes = 45,60,38,52,44,40   mean = 46.5   sd = 8.19
  CV = 8.19/46.5 = 0.176   CV² = 0.031               (< 0.49)
  → INTERMITTENT cell → SBA
```

SBA update trace, `alpha = 0.10`, initialised `Z' = 45`, `P' = 4`:

| Event | Month | Demand | Interval | Z' | P' |
|---|---|---|---|---|---|
| init | 3 | 45 | — | 45.00 | 4.00 |
| 2 | 7 | 60 | 4 | 0.1(60)+0.9(45.00) = **46.50** | 0.1(4)+0.9(4.00) = **4.00** |
| 3 | 10 | 38 | 3 | 0.1(38)+0.9(46.50) = **45.65** | 0.1(3)+0.9(4.00) = **3.90** |
| 4 | 15 | 52 | 5 | 0.1(52)+0.9(45.65) = **46.29** | 0.1(5)+0.9(3.90) = **4.01** |
| 5 | 20 | 44 | 5 | 0.1(44)+0.9(46.29) = **46.06** | 0.1(5)+0.9(4.01) = **4.11** |
| 6 | 24 | 40 | 4 | 0.1(40)+0.9(46.06) = **45.45** | 0.1(4)+0.9(4.11) = **4.10** |

```
Croston rate = 45.45 / 4.10                = 11.09 t/month
SBA rate     = (1 - 0.10/2) × 11.09
             = 0.95 × 11.09                = 10.53 t/month   ← use this
```

**Decision output** (this is what goes on screen, not a monthly tonnage):

```
Annualised rate                 = 10.53 × 12 = 126 t/yr
Minimum campaign lot            = 40 t         (mill master data)
Expected months to accumulate   = 40 / 10.53   = 3.8 months
Expected typical order size     = Z' = 45 t
→ Campaign slot policy: schedule S150SQ roughly every 4th cycle,
  OR run on firm indent once booked tonnage >= 40 t, whichever comes first.
→ Screen renders: "Rate 10.5 t/mo · typical lot 45 t · next viable window W37"
```

### 4.6 What to reject, and the trigger to revisit

**Gradient boosting / LightGBM / XGBoost — reject.**

- M5 was the first competition where all top methods were pure ML and beat every statistical benchmark ([M5 accuracy competition results, IJF](https://www.sciencedirect.com/science/article/pii/S0169207021001874)) — but the mechanism was **cross-learning across 42,840 series of daily data**. "Machine learning methods are data hungry, so unless you have many time series at hand (like Walmart) to enable effective cross-learning, it is not clear how the M5 result is relevant to a typical researcher or application" ([Forecasting Strategy commentary on M5](https://forecasting-strategy.ch/2024/05/16/machine-learning-in-retail-forecasting-results-from-the-m5-competition/)).
- The same competition found that the **univariate** ML methods tested (neural network, random forest) "performed quite poorly compared to univariate statistical models," and that "simple, local statistical methods may still be competitive."
- This dataset is **40 series × ~28 monthly points = ~1,120 rows total.** A GBM with 12 month-dummies, 3 lags, a trend and a couple of drivers has more effective degrees of freedom than there is signal.
- Operationally: a GBM adds a feature pipeline, a retraining schedule, model versioning and a debugging surface — on one local machine, for one user, that is a liability with no accuracy upside.

**Revisit trigger [synthesized]:** re-evaluate GBM when *all three* hold — (a) ≥ 4 years of history, (b) the forecast is genuinely wanted at SKU × week grain across 250–300 SKUs (≈ 50,000+ rows, enough for cross-learning), and (c) real exogenous drivers are available as clean series (HRC landed price, zinc LME, Price Circular calendar, regional construction/infra indices). Until then it is a strict downgrade.

**ARIMA / auto_arima — reject.** SARIMA with `s=12` on 28 observations will fit differencing and seasonal AR terms it cannot support, and the output is unexplainable to a non-technical decision maker. fpp3's guidance for short series points to ETS or differenced ARIMA precisely because they let components evolve rather than estimating many fixed parameters ([fpp3 §13.7](https://otexts.com/fpp3/long-short-ts.html)); the decomposition in §4.2 already is that, with the seasonality pinned down by pooling. There is no justification for the "magic number of 30" minimum often quoted for ARIMA, but that cuts both ways — 28 points is not a licence, it is a warning.

**Multi-parameter seasonal-dummy regression — reject as specified in the ticket, accept in reduced form.** `y_t = β0 + β1·t + Σ_{m=2..12} β_m·Month_m + ε` has 13 parameters on 28 observations (2.2 obs/parameter). Instead, use the pooled index as a fixed **offset** and regress only level and trend:
```
log(demand_t) - log(index[month(t)]) = b0 + b1*t + eps        # 2 parameters
```
That *is* §4.2 in regression clothing, and it is the form to reach for if you want confidence intervals on the trend or want to add a driver later.

### 4.7 Method summary table

| Method | Data needed | Fits in | Output | Cadence | Verdict at 40 families |
|---|---|---|---|---|---|
| Seasonal naive + drift | 25 months | 5 lines SQL | Monthly t | Monthly | **Ship.** Benchmark *and* combination member |
| Shrunk-seasonal decomposition | 25 months + group totals | ~60 lines Python | Monthly t, h=1..6 | Monthly (index quarterly) | **Ship as primary** |
| AutoETS | 24 months | `statsforecast` 1 call | Monthly t | Monthly | **Ship gated** — only if it beats SNaive per family |
| Simple average combination | the above | 1 line | Monthly t | Monthly | **Ship** |
| SBA (Croston + 1−α/2) | 24 months, ≥ 4 demand events | ~20 lines Python | Demand **rate** + lot-accumulation months | Monthly | **Ship for intermittent cell** |
| TSB | 24 months | `statsforecast` | Demand probability | Quarterly | Obsolescence detection only |
| Theta | 24 months | `statsforecast` | Monthly t | — | Skip (no seasonality) |
| Seasonal-dummy regression | 28 months | `numpy.linalg.lstsq` | Monthly t | — | Reject full form; use offset form |
| ARIMA / auto_arima | 40+ months | `statsforecast` | Monthly t | — | **Reject** — unstable, unexplainable |
| Gradient boosting | 4+ yrs, SKU-week | pipeline | Monthly/weekly t | — | **Reject** until revisit trigger |

---

## 5. Combining the baseline with Distributor estimates

The ticket asks: override, blend, or bias-correct? **All three, in a fixed order, with the estimate layer on probation.**

### 5.1 What the evidence says

- **Judgmental adjustments are net-positive but structurally wasteful.** Across 60,000+ forecasts from four supply-chain companies, judgmental adjustment improved accuracy on average in three of four — but "relatively larger adjustments tended to lead to greater average improvements in accuracy, [while] smaller adjustments often damaged accuracy. Small adjustments, by definition, can do relatively little harm to accuracy, but are generally a waste of time." Further, "positive adjustments... were much less likely to improve accuracy than negative adjustments and were made in the wrong direction more frequently, suggesting a general bias towards optimism" ([Fildes, Goodwin, Lawrence & Nikolopoulos, IJF 2009](https://www.sciencedirect.com/science/article/abs/pii/S0169207008001362)).
- **A large fraction of manual forecasting effort destroys value.** FVA practice reports that 40–50% of low-level forecasts perform worse than the naive forecast, and one study of 300,000+ forecasts found 52% worse than a random walk ([Brightwork on naive forecasts](https://www.brightworkresearch.com/naive-forecast/); [SAS FVA white paper](https://www.sas.com/content/dam/SAS/en_us/doc/whitepaper1/forecast-value-added-analysis-106186.pdf)).
- **Directional bias is the known failure mode of estimate layers in shortage regimes** — sales teams over-forecast when estimates feed supply allocation (brief 01 §3).

### 5.2 The design that follows

**[synthesized, from the above evidence]** — five rules:

1. **Never allow a silent override.** The Distributor estimate is a separate stored layer, not an edit to the baseline. This requires the immutable estimate snapshot the synthesis already identified as the most load-bearing data-model decision.
2. **Bias-correct at aggregate level, before blending.** (§5.3)
3. **Blend by inverse historical error, not 50/50.** (§5.4)
4. **Block small manual overrides.** The UI refuses any planner override where `|override − blend| / blend < 15%`. Larger overrides require a reason code from a fixed list. Directly implements Fildes et al.: small adjustments are waste, large ones carry the value.
5. **Put the estimate layer on probation.** Its blend weight is forced to **zero** unless it showed positive FVA over the trailing 12 months at group level. (§5.5)

### 5.3 Aggregate bias correction

**Grain: family-group × trailing 6 months.** Not per-Distributor (out of scope), and not per-family (a single family's 6 estimate-actual pairs is too thin to estimate a ratio from). Three groups — black round, black square/rect, GI — give ~240 family-months of support each.

```
bias_ratio(G) = sum(estimates for group G, last 6 complete months)
              / sum(cleaned demand for group G, same months)

require >= 4 of 6 months present, else bias_ratio = 1.0
clip bias_ratio to [0.70, 1.40]

estimate_corrected(family, month) = estimate_raw(family, month) / bias_ratio(G)
```
The `[0.70, 1.40]` clip and the 4-of-6 completeness rule are **[synthesized]** guards against a single anomalous month flipping the whole group's correction.

**Worked example — black-round group, Feb–Jul 2026:**

| Month | Group estimates (t) | Group cleaned demand (t) |
|---|---|---|
| Feb-26 | 1,420 | 1,240 |
| Mar-26 | 1,530 | 1,355 |
| Apr-26 | 1,330 | 1,195 |
| May-26 | 1,410 | 1,290 |
| Jun-26 | 1,120 | 1,002 |
| Jul-26 | 1,070 | 940 |
| **Total** | **7,880** | **7,022** |

```
bias_ratio = 7,880 / 7,022 = 1.122      (estimates run ~12% hot — the classic
                                         over-forecast-when-estimates-drive-allocation pattern)
Raw Aug-26 estimate for F40R            = 1,010 t
estimate_corrected = 1,010 / 1.122      =   900 t
```

### 5.4 The blend

```
w_stat = (1 / WMAPE_stat) / (1 / WMAPE_stat + 1 / WMAPE_est)
w_est  = 1 - w_stat
```
where both WMAPEs come from the **rolling-origin backtest at h=1** over the trailing 12 months, computed at group level. Inverse-error weighting is the one weighting scheme simple enough to survive the small-sample instability warning in §4.4, and it degrades gracefully to 50/50 when the two are equally accurate. **[synthesized]**

**Worked example, continued:**
```
WMAPE_stat (group, h=1, trailing 12 mo) = 18.5%
WMAPE_est  (group, corrected estimates)  = 22.1%
w_stat = (1/0.185) / (1/0.185 + 1/0.221) = 5.405 / 9.930 = 0.544
w_est  = 0.456

F_consensus(F40R, Aug-26) = 0.544 × 868 + 0.456 × 900
                          = 472 + 410
                          = 882 t
```

Traceable chain on screen: `Baseline 868 → Estimates (raw 1,010, corrected 900) → Consensus 882`. Every arrow is one number and one rule.

### 5.5 Forecast Value Added — proving the estimate layer earns its place

FVA is "the application of basic scientific method to the business forecasting process, involving comparison of a treatment (such as a statistical forecast) to a placebo"; it "can be either positive or negative, telling you whether your efforts are adding value by making the forecast better, or whether you are just making things worse" ([SAS FVA white paper](https://www.sas.com/content/dam/SAS/en_us/doc/whitepaper1/forecast-value-added-analysis-106186.pdf)). Lokad's five-step framing: define the process, generate a naive benchmark *and* a statistical forecast, collect contributor inputs, compute FVA per contributor, then preserve positive contributions and remove negative ones ([Lokad](https://www.lokad.com/forecast-value-added/)).

**The stairstep report — this is the artefact to build.** One table, refreshed monthly, scored on the trailing 12 months at family-month grain (40 families × 12 = 480 observations, tonnage-weighted).

**Worked example [synthesized, illustrative]:**

| # | Process step | WMAPE | FVA vs previous step | FVA vs naive | Bias | Verdict |
|---|---|---|---|---|---|---|
| 1 | Seasonal naive (placebo) | 24.0% | — | — | +1.2% | benchmark |
| 2 | Statistical baseline (combination) | 18.5% | **+5.5 pts** | +5.5 pts | +0.4% | **keep** |
| 3 | + Distributor estimates, uncorrected | 20.3% | −1.8 pts | +3.7 pts | +8.9% | *bias is the problem* |
| 3b | + Distributor estimates, bias-corrected & blended | 17.2% | **+1.3 pts** | +6.8 pts | +1.1% | **keep — earns its place** |
| 4 | + Planner manual override | 18.9% | **−1.7 pts** | +5.1 pts | +4.6% | **restrict** |

Read the table: the estimate layer *raw* destroys 1.8 points because of an 8.9% upward bias; **corrected**, the same layer adds 1.3 points. That is the whole argument for bias-correct-then-blend rather than override, in one row pair. And the planner override step is destroying 1.7 points — which is what triggers the ±15% override gate from §5.2.

**Governance rules [synthesized]:**
- Compute FVA on **at least 6 complete months** (≥ 240 family-months) before acting on it; below that, sampling noise dominates.
- Act on it at the **quarterly** review, not monthly — monthly FVA will oscillate and invite whipsaw.
- The rule: `if FVA(estimate layer, trailing 12 mo) <= 0: w_est = 0` and the screen shows *"Estimates suspended — not adding value this quarter."* That is the mechanism the ticket asks for.
- **Lokad's criticisms are worth knowing and are mostly not binding here:** they argue FVA ignores uncertainty, adds bureaucracy, and that accuracy ≠ profitability ([Lokad](https://www.lokad.com/forecast-value-added/)). Fair — but their proposed alternative is full probabilistic forecasting with financial risk optimisation, which is exactly the ML-platform complexity this project is excluding. The manipulation-vulnerability criticism *is* binding and is answered by the pre-existing anti-gaming design: allocation keys to trailing offtake, not to estimates (synthesis §2), so there is nothing to gain by gaming the estimate.

---

## 6. Honest backtesting

### 6.1 The protocol

**Expanding-window rolling origin.** The training set consists exclusively of "observations that occurred *prior* to the observation that forms the test set" — no future observations can be used in constructing the forecast ([Hyndman, *Cross-validation for time series*](https://robjhyndman.com/hyndsight/tscv/)). Use **expanding**, not sliding, window: with 28 months you cannot afford to throw away early history.

**Fold layout for ~28 months of history (Apr-2024 … Jul-2026):**

```
Minimum training length : 18 months
                          (12 for one full seasonal cycle + 6 so the second
                          year's index has any support at all)
Horizons scored         : h = 1, 2, 3   (the campaign-decision band)
Origins                 : end of month 18 (Sep-25) .. end of month 25 (Apr-26)
                          → 8 origins, stepping 1 month
Forecasts per family    : 8 origins × 3 horizons = 24
Portfolio total         : 24 × 40 families = 960 forecast/actual pairs
```

960 pairs is enough for a stable *portfolio* WMAPE per horizon. It is **not** enough for a stable per-family WMAPE (24 pairs each) — so per-family accuracy drives *labels and gates*, never headline claims. **[synthesized]**

Hyndman's `tsCV` "will silently fit models beginning with a single observation, and return a missing value whenever the model cannot be estimated" — do not replicate that leniency here; enforce the 18-month floor explicitly, because a decomposition fitted on 6 months will return a plausible-looking number that is meaningless.

### 6.2 Leakage rules — the five that actually bite here

1. **Everything derived must be recomputed inside the fold.** Seasonal indices (including the *group* index), the shrinkage weight `w`, `bias_ratio`, blend weights, and the SBC/RRS classification must all be recomputed from data ≤ origin. Computing the group seasonal index once on all 28 months and reusing it across folds is the single most likely leak in this design, because the group index feels like "master data." It is not.
2. **Estimate snapshots must be as-submitted.** Score against the Distributor estimate frozen at the cutoff *before* the origin, never a later revision. If the system only stores the latest revision, the estimate layer cannot be honestly backtested at all — which is another argument for immutable snapshots.
3. **Actuals must be vintage-correct.** If history is retrospectively cleaned (returns, credit notes, reclassification), the entire backtest must be re-run; do not mix cleaned late months with uncleaned early ones.
4. **No hyperparameter tuning on the reported folds.** `alpha`, `phi`, `k`, the level window, the clip bounds — fix these a priori (values given in §4). If you must tune, tune on folds 1–4 and report only folds 5–8, and say so. With 8 folds, tuning and reporting on the same folds will manufacture a 3–6 point WMAPE improvement that does not exist. **[synthesized]**
5. **Censoring correction is part of the model.** `availability_ratio` uses within-month stock data — fine, that is contemporaneous. But if you scale a *test* month's actual by its availability ratio you are scoring against a partly-modelled number; report those months separately (§2).

Residual-based error always understates true forecast error, because residuals come from full-sample fitting whereas cross-validation produces true out-of-sample forecasts ([Hyndman](https://robjhyndman.com/hyndsight/tscv/)) — never quote in-sample fit statistics anywhere in this system.

### 6.3 Metrics and the anti-flattery reporting rules

**Primary: WMAPE**, per horizon, tonnage-weighted:
```
WMAPE(h) = sum over all (family, origin) of |Actual - Forecast|
         / sum over all (family, origin) of Actual
```
WMAPE over MAPE, because MAPE explodes on zero and near-zero months (every intermittent family) and over-weights small families. "WAPE aggregates absolute errors and divides by total demand, so larger-volume observations matter more, and can produce very different results than MAPE when a portfolio contains a mix of high-volume products and low-volume items" ([Umbrex supply-chain playbook](https://umbrex.com/resources/company-analysis/supply-chain-logistics/forecast-accuracy-by-product/)).

**Secondary, all mandatory on the same page [synthesized]:**

| Metric | Formula | Why it stops flattery |
|---|---|---|
| Bias | `(ΣF − ΣA) / ΣA` | WMAPE is blind to direction; direction is what breaks inventory |
| FVA vs seasonal naive | `WMAPE_naive − WMAPE_model`, in points | The only number that says whether the layer is worth its existence |
| Hit rate | % of family-months where the model beat seasonal naive | A good average can hide 45% of families being worse |
| Unweighted MAE-ratio | same as WMAPE but each family weighted equally | The gap between this and WMAPE *is* the long-tail story |
| Tail WMAPE | WMAPE over the bottom 50% of families by volume | Where the system will actually embarrass itself |
| Scaled-month share | % of scored months where `signal_source = 'scaled'` | Flags where you are scoring estimates against estimates |

**Reporting rules:**
- **Never report a single averaged accuracy number.** Always `grain × horizon`. "Company A has 90% accuracy measured monthly at family level versus company B's 70% measured daily at SKU level means nothing" ([Umbrex](https://umbrex.com/resources/company-analysis/supply-chain-logistics/forecast-accuracy-by-product/)).
- **Always print the seasonal-naive row next to the model row.** If they are shown separately, no one compares them.
- **Report h=1, h=2, h=3 as three rows, never averaged.** Each additional month ahead typically adds 2–5 WMAPE points ([Umbrex](https://umbrex.com/resources/company-analysis/supply-chain-logistics/forecast-accuracy-by-product/)); averaging horizons lets a good h=1 hide a useless h=3.
- **Report runners, repeaters and intermittent families as three blocks.** A portfolio WMAPE dominated by three runner families is not evidence the system works.

---

## 7. Realistic accuracy — what to put on the screen as a target

The published benchmark for **Industrial/B2B is 20–40% MAPE at SKU level**, with better accuracy at family aggregation; WAPE "under 20% is generally good; 10–15% is strong; best-in-class A/X items can be under 10%"; bias "within ±5% at aggregated levels is a common target" ([Umbrex](https://umbrex.com/resources/company-analysis/supply-chain-logistics/forecast-accuracy-by-product/)).

Adjusting that benchmark for this specific business — strong seasonality (helps), only 2 years of history (hurts), campaign censoring (hurts), Price Circular demand noise (hurts materially), distributor channel rather than direct OEM (hurts) — here are targets I would defend:

**[synthesized from the benchmark above + the business specifics]**

| Grain | Horizon | Expect (WMAPE) | Good | Red flag |
|---|---|---|---|---|
| Total company, all families | 1 mo | 7–11% | < 7% | > 16% |
| Total company | 3 mo | 11–16% | < 11% | > 22% |
| **Family, portfolio-weighted** | **1 mo** | **15–22%** | **< 15%** | **> 28%** |
| Family, portfolio-weighted | 3 mo | 22–30% | < 22% | > 38% |
| Family — top-10 runners only | 1 mo | 12–18% | < 12% | > 25% |
| Family — repeaters | 1 mo | 22–32% | < 22% | > 42% |
| Family — intermittent | 1 mo | 45–75% | — | — *(don't score as a point forecast; score the rate over 6 months)* |
| SKU (family × mix share) | 1 mo | 26–40% | < 26% | > 50% |
| Bias, any aggregate level | any | −3% … +3% | ±1% | beyond ±6% |

**The two numbers to hold the design to:**
- **Seasonal naive on this data will land around 22–28% at family h=1.** That is the bar.
- **A good baseline should beat it by 4–8 points.** That gap is the entire value of the forecasting layer. If backtesting shows a gap under 2 points, the honest recommendation is to ship seasonal naive, put the saved effort into the Rolling Program, and revisit forecasting at 4 years of history.

**Set the screen target at 20% family h=1 WMAPE, not 10%.** A target the system misses every month teaches the user to ignore the screen — which is the exact failure mode the synthesis warns about ("dashboards decay into wallpaper").

---

## 8. Expressing uncertainty to a non-technical decision maker

### 8.1 The uncomfortable evidence

The most directly relevant experiment: participants decided production levels for the following week's demand, supplied with either a point forecast, a 50% prediction interval, or a 95% prediction interval. **"The prediction intervals did not improve the quality of the decisions and also reduced the propensity of the decision makers to respond appropriately to the asymmetry in the loss function."** However, a simple heuristic applied to **85% prediction intervals** would lead to nearly optimal decisions ([Goodwin, Önkal & Thomson, *Do forecasts expressed as prediction intervals improve production planning decisions?*, EJOR](https://nrl.northumbria.ac.uk/id/eprint/13823/)).

That is a strong result and it should shape the UI: **a symmetric band around a point forecast makes production decisions worse, not better** — it centres the decision maker's attention on the midpoint and away from the asymmetry (being short costs more than being long).

Meanwhile, **"linguistic expressions of forecaster confidence have a larger impact on trust ratings than direct quantitative uncertainty"** ([Frontiers in Psychology, 2020](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.579267/full)), and uncertainty information "actually reassures people they are being dealt with honestly" ([WMO](https://wmo.int/media/magazine-article/communicating-forecast-uncertainty-service-providers)).

### 8.2 What to build instead

**[synthesized from the above]** Three fields per family, and no chart band:

**(a) Expected — the demand number.** `882 t`. Labelled "expected primary sale". This is what the S&OP consensus number is.

**(b) Plan — a quantile chosen by economics, not by convention.** Replace the prediction interval with a single asymmetry-aware number, computed by newsvendor critical ratio:

```
CR = Cu / (Cu + Co)
  Cu = cost of being short  = lost contribution margin per tonne
                              (+ any distributor-defection allowance)
  Co = cost of being long   = one cycle's carrying cost + price-fall exposure per tonne
```

Then take the **empirical** quantile of `Actual / Forecast` from the backtest — no normality assumption, no distributional fitting. This is conformal-style calibration: the empirical distribution of out-of-sample errors, with the appropriate quantile selected for the target coverage, is distribution-free and needs no i.i.d. assumption ([skforecast probabilistic forecasting](https://skforecast.org/0.14.0/user_guides/probabilistic-forecasting.html); [Conformal Time-Series Forecasting, NeurIPS 2021](https://proceedings.neurips.cc/paper/2021/file/312f1ba2a72318edaaa995a67835fad5-Paper.pdf)).

**Worked example — F40R:**
```
Cu = 4,500 INR/t   (lost contribution on a missed primary sale)
Co = 1,500 INR/t   (1 month carrying + price-fall exposure)
CR = 4,500 / (4,500 + 1,500) = 0.75

Backtest, h=1, all smooth-cell families, ratio A/F sorted:
   75th percentile of (Actual / Forecast) = 1.14

Plan quantity = 882 × 1.14 = 1,005 t
```
Screen: **`Expected 882 t · Plan 1,005 t`**, with the tooltip *"Plan covers 3 shortfalls in 4 — short costs 3× more than long on this family."*

Pool the `A/F` quantiles **by SBC cell, not per family** (24 backtest points per family cannot support a 75th percentile; ~300 per cell can). **[synthesized]**

**(c) Confidence — three words, from measured accuracy.**

```
label = "Firm"    if family h=1 backtest WMAPE < 15%
        "Usable"  if 15% <= WMAPE <= 28%
        "Rough"   if WMAPE > 28%
        "Rough"   always, if history < 12 months or SBC cell is Lumpy
```
Plus one automatic downgrade: **if the two combination members disagree by more than 20%, downgrade one level and show *"methods disagree."*** The disagreement between seasonal-naive-drift and decomposition is free information about regime instability. **[synthesized]**

### 8.3 What to avoid

- **Symmetric ± bands on a chart.** Evidence above: they do not improve decisions and suppress asymmetry-awareness.
- **Percentage confidence numbers ("87% confident").** Not calibrated, not interpretable, and will be argued with.
- **Fan charts.** Beautiful, and read as decoration.
- **Multi-scenario bands (optimistic/base/pessimistic) as the primary view.** Scenarios have their place — "the next most likely scenario as well as the expected one, allowing users to make back-up plans" ([WMO](https://wmo.int/media/magazine-article/communicating-forecast-uncertainty-service-providers)) — but as a *drill-down for the S&OP meeting*, not on the operational screen. On the screen, one plan number beats three scenarios, because a campaign has one tonnage.

---

## 9. Family → SKU disaggregation

Do **not** run statistics at SKU grain. Bottom-level retail/industrial series have low signal-to-noise, and bottom-up requires a separate model per series with worse aggregate accuracy; top-down loses lower-level information; **middle-out** starting "from a middle level where forecasts are reliable" is the compromise ([Towards Data Science, hierarchical forecasting](https://towardsdatascience.com/introduction-to-hierarchical-time-series-forecasting-part-i-88a116f2e2/); [Opex Analytics](https://medium.com/opex-analytics/hierarchical-time-series-101-734a3da15426)). Here the middle level is *given* by the domain — `CONTEXT.md` says estimates, schemes and campaign planning all operate at SKU Family level.

**Disaggregation rule [synthesized]:**
```
share_6(sku)  = sku tonnage last 6 months  / family tonnage last 6 months
share_12(sku) = sku tonnage last 12 months / family tonnage last 12 months
share(sku)    = 0.5 * share_6 + 0.5 * share_12      # damps mix churn
renormalise shares within the family to sum to 1
SKU_forecast = family_forecast * share(sku)
```
The 50/50 shrink toward the 12-month share exists because month-to-month mix is dominated by which SKUs were in stock — i.e. it is another censoring artefact.

**Worked example — F40R Aug-26, family plan 1,005 t:**

| SKU | share_6 | share_12 | blended | renorm | Plan (t) |
|---|---|---|---|---|---|
| 40 NB × 3.2 medium, black | 0.46 | 0.44 | 0.450 | 0.450 | 452 |
| 40 NB × 2.9 light, black | 0.22 | 0.24 | 0.230 | 0.230 | 231 |
| 40 NB × 4.0 heavy, black | 0.12 | 0.11 | 0.115 | 0.115 | 116 |
| 40 NB × 3.2 medium, GI | 0.15 | 0.16 | 0.155 | 0.155 | 156 |
| 40 NB × 2.9 light, GI | 0.05 | 0.05 | 0.050 | 0.050 | 50 |
| | | | 1.000 | 1.000 | **1,005** |

Then apply the minimum per-thickness lot rule from brief 01 (40 t): every line clears it here; had the GI light line come to 28 t it would roll to the next cycle and its tonnage redistribute across the family.

**Do not report SKU-level accuracy as a headline.** Report it, expect 26–40% (§7), and explain it as `family error × mix error` — because that is what it is.

---

## 10. Constraint-awareness: keeping "won't sell" apart from "won't make"

This is a presentation-layer problem with a data-model answer. The failure to avoid: a weekly grid showing `0 t` for F40R in week 35, which the reader interprets as "no demand" when it means "family not in campaign that week."

**Rule [synthesized]: the system never renders a weekly demand forecast.** Demand is a monthly rate. Everything weekly is *derived coverage arithmetic* against the Rolling Program, and lives in visually distinct fields.

**The four fields per family, and their sources:**

| Field | Source | Example |
|---|---|---|
| **Expected demand** | forecast, monthly | `882 t in Aug-26` |
| **Next run / cut-off** | Rolling Program (campaign calendar) | `W33 (10–11 Aug) · cut-off W31 · then W37` |
| **Required campaign quantity** | derived (below) | `921 t → mill lot 925 t` |
| **Coverage verdict** | derived, RAG | `Amber — 6 days short at W37` |

**Required-campaign-quantity formula:**
```
interval        = days from this campaign start to the NEXT campaign start
demand_interval = sum over those days of (monthly forecast / days in that month)
                  — computed day by day so it crosses month boundaries correctly
target_closing  = cover_days × daily rate at the next campaign start
required        = demand_interval + target_closing - opening_stock_at_campaign_start
round up to the mill's lot increment
```

**Worked example — F40R:**
```
Campaign C1 runs W33: 10–11 Aug 2026.  Next run W37: 7–8 Sep 2026.  Interval = 28 days.
Aug-26 forecast 882 t / 31 days = 28.5 t/day
Sep-26 forecast: index[Sep] = 0.855, level ≈ 1,163 → 995 t / 30 days = 33.2 t/day

demand_interval = 21 days of Aug × 28.5  +  7 days of Sep × 33.2
                = 598 + 232 = 830 t
target_closing  = 10 cover-days × 33.2  = 332 t
opening_stock at 10 Aug (projected)     = 260 t
required        = 830 + 332 - 260       = 902 t   → mill lot 905 t
```

**The separation rule that answers the ticket's question directly [synthesized]:**

```
if required_quantity > campaign capacity available in the slot:
        flag = SUPPLY-CONSTRAINED         (owner: production planning)
        message: "Demand 902 t, slot capacity 700 t — 202 t rolls to W37 or needs a slot extension"
elif forecast is low because the seasonal index is low:
        flag = SEASONAL-LOW               (owner: none — informational)
        message: "Aug is the monsoon trough (index 0.74). Normal."
elif forecast is low AND availability_ratio was < 0.8 in recent months:
        flag = CENSORED-SIGNAL            (owner: demand planning)
        message: "Recent sales suppressed by availability — demand estimated from orders."
```

Three distinct causes, three distinct messages, three distinct owners. A single "low number" cell cannot carry that; three fields can. This is also why the censoring flag from §2 must survive all the way to the presentation layer rather than being consumed silently in the model.

---

## 11. Implementation shape

### 11.1 Dependencies

```
pandas, numpy         — everything in §4.1, §4.2, §4.5, §9 is arithmetic
statsforecast         — AutoETS, CrostonSBA, TSB, SeasonalNaive (numba-compiled,
                        scikit-learn style .fit()/.predict())
sqlite (or the existing store) — history, snapshots, backtest results
```
No ML platform, no scheduler beyond a monthly cron, no GPU, no model registry. Total surface: roughly 400–600 lines of Python plus SQL views.

### 11.2 Tables the design requires

| Table | Grain | Notes |
|---|---|---|
| `demand_signal` | family × month | `raw_sales`, `orders`, `availability_ratio`, `signal_source`, `cleaned` |
| `estimate_snapshot` | distributor × family × month × cutoff_ts | **immutable**; backtest impossible without it |
| `seasonal_index` | family × month × as_of_quarter | store the vintage — needed for fold-correct backtesting |
| `forecast_run` | family × month × horizon × run_date × method | one row per method, plus the combination and the consensus |
| `backtest_result` | family × origin × horizon | actual, forecast per layer; feeds WMAPE, FVA, A/F quantiles |
| `fva_stairstep` | group × step × trailing_period | the §5.5 table |

### 11.3 Cadence

| When | Job | Output |
|---|---|---|
| Weekly (Mon) | Refresh actuals, recompute days-of-cover and required campaign quantity against the standing forecast | Updated coverage RAG. **No re-forecast.** |
| Monthly, day 1–2 (S&OP step 1) | Rebuild cleaned demand signal; run all methods; combination | `F_baseline` h=1..6 |
| Monthly, day 3–5 (demand review) | Apply `bias_ratio`, blend estimates, apply override gate | `F_consensus` — the S&OP demand number |
| Monthly, day 25+ | Score the month just closed; update bias ratios, FVA stairstep, tracking signals | Accuracy page |
| **Quarterly** | Re-run the full rolling-origin backtest; recompute seasonal indices, shrinkage, blend weights, A/F quantiles; re-run SBC + RRS classification; refresh confidence labels | Method assignments, targets, labels |
| Annually | Re-evaluate the GBM revisit trigger; re-derive accuracy targets from realised performance | Design review |

**Why seasonal indices refresh quarterly, not monthly [synthesized]:** with 2 observations per calendar month, adding one month materially moves an index and produces forecast churn the user will read as instability. Quarterly is frequent enough to track a genuine seasonal shift and slow enough not to whipsaw.

### 11.4 The continuous-monitoring metric worth adding

**Tracking signal**, per family, as an early-warning that a family's regime has shifted:
```
CFE = Σ (Forecast − Actual)  over the trailing 6 months
MAD = Σ |Forecast − Actual| / 6
TS  = CFE / MAD
```
The standard control limit is **±4** ([Value Chain Planning](https://valuechainplanning.com/blog-details/7); [WFM Labs](https://wiki.wfmlabs.org/wiki/Forecast_Bias_Detection_and_Correction)); a positive TS means persistent over-forecasting, negative means under-forecasting. Trip the alert when `|TS| > 4` for **two consecutive cycles** — this is the deviation-catalog-compatible trigger for a manual family review. It costs three SQL columns and catches the failure that WMAPE is structurally blind to.

---

## 12. What not to do — the short list

1. **Do not fit statistics at SKU grain.** Family × month, then mix share (§9).
2. **Do not produce weekly demand forecasts.** They will be read as campaign schedules (§10).
3. **Do not fit on raw primary sales.** Censoring bias compounds into recurring shortages (§2).
4. **Do not use MAPE as the headline metric.** WMAPE, per horizon, per grain (§6.3).
5. **Do not report accuracy averaged across horizons or across SBC cells.**
6. **Do not tune `alpha`/`phi`/`k` on the folds you report.** Fix them a priori (§6.2).
7. **Do not estimate combination weights across methods.** Simple average (§4.4).
8. **Do not build a per-Distributor bias model.** Out of scope by instruction — and 24 observations per distributor-family with heavy zeros would not support one anyway.
9. **Do not add a gradient-boosted model.** Not until the §4.6 revisit trigger fires.
10. **Do not put a symmetric ± band on the operational screen.** It measurably worsens production decisions (§8.1).
11. **Do not forecast the Lumpy cell.** Show booked indents and the next window (§3).
12. **Do not set the accuracy target below 15% at family grain.** A target the system misses monthly trains the user to ignore it (§7).

---

## Sources

- [M5 accuracy competition: Results, findings, and conclusions — *International Journal of Forecasting*](https://www.sciencedirect.com/science/article/pii/S0169207021001874) — ML dominance in M5; univariate ML (NN, RF) performed poorly vs univariate statistical models; cross-learning as the mechanism.
- [Machine Learning in Retail Forecasting — Results from the M5 Competition](https://forecasting-strategy.ch/2024/05/16/machine-learning-in-retail-forecasting-results-from-the-m5-competition/) — "ML methods are data hungry... unless you have many time series at hand (like Walmart)... not clear how the M5 result is relevant"; simple local statistical methods still competitive at high granularity.
- [Intermittent demand classifications: is that what you need? — Open Forecast](https://openforecast.org/2024/07/16/intermittent-demand-classifications-is-that-what-you-need/) — SBC scheme, ADI=1.32 / CV²=0.49 cut-offs, four cells; Croston for erratic and SBA for the rest; Kostenko & Hyndman non-linear boundary refinement.
- [Syntetos & Boylan cut-off values diagram](https://www.researchgate.net/figure/Cutoff-values-Crostons-method-Syntetos-and-Boylan-method_fig1_222105798) — the ADI/CV² classification grid.
- [Nixtla StatsForecast — CrostonSBA model docs](https://nixtlaverse.nixtla.io/statsforecast/docs/models/crostonsba.html) — exact Croston and SBA smoothing equations and the `(1 − α/2)` bias correction.
- [Nixtla StatsForecast (GitHub)](https://github.com/Nixtla/statsforecast) — model inventory (AutoETS, seasonal_naive, croston_sba, tsb, theta, adida, imapa), numba compilation, sklearn-style API.
- [SAS — *Forecast Value Added Analysis: Step by Step* (white paper)](https://www.sas.com/content/dam/SAS/en_us/doc/whitepaper1/forecast-value-added-analysis-106186.pdf) — FVA as scientific method with a placebo; naive and seasonal-naive baselines; stairstep report; the 40–50%-worse-than-naive finding.
- [Lokad — Forecast Value Added](https://www.lokad.com/forecast-value-added/) — five-step FVA procedure; six criticisms (uncertainty blindness, bureaucracy, accuracy≠profitability, manipulability, local optimisation).
- [Brightwork Research — How to Best Understand the Naive Forecast](https://www.brightworkresearch.com/naive-forecast/) — 300,000+ forecasts studied, 52% worse than a random walk.
- [Fildes, Goodwin, Lawrence & Nikolopoulos (2009), *Effective forecasting and judgmental adjustments* — IJF](https://www.sciencedirect.com/science/article/abs/pii/S0169207008001362) — 60,000+ forecasts, four companies: large adjustments help, small adjustments damage or waste; positive adjustments much less likely to help (optimism bias).
- [Goodwin, Önkal & Thomson — *Do forecasts expressed as prediction intervals improve production planning decisions?* (EJOR)](https://nrl.northumbria.ac.uk/id/eprint/13823/) — prediction intervals did **not** improve decisions and reduced appropriate response to loss asymmetry; 85% intervals + a simple heuristic → near-optimal.
- [Uncertain About Uncertainty: How Qualitative Expressions of Forecaster Confidence Impact Decision-Making — *Frontiers in Psychology* (2020)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.579267/full) — linguistic confidence expressions affect trust more than quantitative uncertainty.
- [WMO — Communicating Forecast Uncertainty for Service Providers](https://wmo.int/media/magazine-article/communicating-forecast-uncertainty-service-providers) — uncertainty reassures rather than undermines; next-most-likely scenario as a back-up-plan device.
- [Hyndman — Cross-validation for time series](https://robjhyndman.com/hyndsight/tscv/) — rolling-origin construction; training strictly prior to test; residual RMSE understates true forecast error.
- [Hyndman & Athanasopoulos, *Forecasting: Principles and Practice* (3rd ed) §13.7 — Very long and very short time series](https://otexts.com/fpp3/long-short-ts.html) — minimum-sample rules-of-thumb are "misleading and unsubstantiated"; no justification for the "magic number of 30"; observations-per-parameter is what matters; short series defeat even cross-validation.
- [Solving the Forecast Combination Puzzle — Lee & Lee](https://economics.ucr.edu/repec/ucr/wpaper/202514.pdf) — equal-weight pooling beats estimated weights; Green & Armstrong review of 32 papers: complexity harms accuracy in most cases; instability of weights estimated on small samples.
- [Hyndman & Billah — *Unmasking the Theta method*](https://robjhyndman.com/papers/Theta.pdf) — Theta ≡ SES with drift equal to half the fitted linear slope; does not model seasonality.
- [Umbrex — Forecast Accuracy by Product (supply chain playbook)](https://umbrex.com/resources/company-analysis/supply-chain-logistics/forecast-accuracy-by-product/) — Industrial/B2B 20–40% MAPE at SKU level, better at family; WAPE <20% good / 10–15% strong; bias ±5% at aggregate; +2–5 WAPE points per additional month of horizon; the "90% vs 70% means nothing" caution.
- [Demand forecasting under lost sales stock policies — *IJF* (2023)](https://www.sciencedirect.com/science/article/abs/pii/S0169207023000961) — sales forecasts biased downward vs true demand; censored estimation.
- [FreshRetailNet: a stockout-annotated censored demand dataset — arXiv 2505.16319](https://arxiv.org/html/2505.16319v3) — the self-reinforcing censoring cycle; latent demand recovery.
- [Demand Estimation and Ordering Under Censoring (NUS)](https://www.researchgate.net/publication/268209485_Demand_Estimation_and_Ordering_Under_Censoring_Stock-Out_Timing_Is_Almost_All_You_Need) — Wecker (1978), Nahmias (1994), Agrawal & Smith (1996), Lau & Lau (1996) product-limit, Queenan et al. (2007) unconstraining.
- [Formation of seasonal groups and application of seasonal indices](https://www.researchgate.net/publication/263195020_Formation_of_seasonal_groups_and_application_of_seasonal_indices) — seasonal indices of short series estimated from a collection of series in the same category.
- [Introduction to hierarchical time series forecasting — Towards Data Science](https://towardsdatascience.com/introduction-to-hierarchical-time-series-forecasting-part-i-88a116f2e2/) and [Hierarchical Time Series 101 — Opex Analytics](https://medium.com/opex-analytics/hierarchical-time-series-101-734a3da15426) — bottom-up noise vs top-down information loss; middle-out as the compromise starting "from a middle level where forecasts are reliable."
- [skforecast — Probabilistic forecasting](https://skforecast.org/0.14.0/user_guides/probabilistic-forecasting.html) and [Conformal Time-Series Forecasting — NeurIPS 2021](https://proceedings.neurips.cc/paper/2021/file/312f1ba2a72318edaaa995a67835fad5-Paper.pdf) — distribution-free intervals from empirical out-of-sample error quantiles.
- [Tracking Signal — Example & Formula (Value Chain Planning)](https://valuechainplanning.com/blog-details/7) and [Forecast Bias Detection and Correction — WFM Labs](https://wiki.wfmlabs.org/wiki/Forecast_Bias_Detection_and_Correction) — `TS = CFE / MAD`; ±4 control limit; two-consecutive-cycles rule; sign interpretation.

### Prior internal context relied on (not re-researched)

- `.scratch/pt-os-research/briefs/01-planning-flow.md` — five-layer planning flow; campaign mechanics and 2–6 week cycles; Nucor-style published Rolling Program; runner/repeater/stranger cut-offs and minimum lot sizes; fair-share allocation keyed to trailing offtake; FVA-disciplined rollup.
- `.scratch/pt-os-research/synthesis.md` — immutable estimate snapshots as the load-bearing data-model decision; allocation keyed to trailing offtake as the anti-gaming rule; Price Circulars as a driver of demand noise.
- `CONTEXT.md` — SKU Family, Primary Sale, Rolling Program, Price Circular, Campaign, Deviation definitions used throughout.

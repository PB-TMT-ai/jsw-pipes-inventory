# Deviation Monitoring, Exception Management & KPIs for a Manufacturing + Distribution Business
*Research brief for the P&T (Pipes & Tubes) Operating System — exploratory, sources cited at end. Compiled 2026-08-01.*

## TL;DR

- **A deviation only exists relative to a committed baseline.** The OS must first force clean baselines (distributor estimate → confirmed order → allocation → production plan → dispatch plan → collection plan); the deviation layer is then just paired comparisons with tolerance bands.
- **Bias matters more than accuracy.** MAPE tells you how wrong forecasts are; bias/tracking signal tells you *who is systematically gaming* (distributor over-estimation to hoard allocation, sales sandbagging targets). Studies cited in FVA literature found ~52% of human-touched forecasts were worse than a naive forecast — measure Forecast Value Added per touchpoint.
- **The primary–secondary sales gap is the single most diagnostic deviation** in Indian channel businesses: healthy distributor stock is ~18–28 days for fast movers; >35 days for 2 consecutive months = channel stuffing in progress (practitioner heuristic, weakly sourced but widely repeated).
- **Schedule adherence is a leading indicator; OTIF is a lagging one.** World-class plan adherence is ~90–98%; below 80% means the plan is fiction. In a campaign-based tube mill (roll changes, strip-width families), adherence should be measured at campaign level, not just tonnage level.
- **Management-by-exception fails through alert fatigue, not lack of alerts.** Design: few thresholds, tiered RAG bands, one named owner per exception type, and dynamic thresholds by SKU class — a generic "every miss is an exception" rule drowns the system.
- **Cadence beats dashboards.** Lean tiered meetings (Tier 1 daily shift → Tier 2 daily plant → Tier 3 weekly leadership) plus a monthly S&OP cycle (demand review → supply review → reconciliation → executive) are the institutional mechanism that makes deviations get *acted on*, not just displayed.
- **Control towers are 5 elements — people, process, data, organization, technology — not a screen.** Gartner's explicit warning: don't build one before cross-functional integration exists; the transferable core for a mid-size manufacturer is the sense → analyze → solve → execute → learn loop, not real-time telematics.

---

## 1. Which deviations matter along the flow

**Distributor estimate vs actual order (forecast gaming).** Two failure modes: *over-estimation* (to secure allocation of scarce SKUs, then order less) and *sandbagging* (understating to keep targets soft — driven by incentive schemes tied to target achievement). Leading practice: measure per-distributor bias over a rolling 3–6 months, not single-month error; publish an "estimate reliability score" per distributor; tie allocation priority and scheme eligibility to estimate accuracy, not just volume. FVA analysis extends this: track whether each override (distributor input, sales head adjustment) improves or worsens accuracy vs a naive forecast, and strip out steps that subtract value (SAS/Gilliland).

**Order vs allocation.** In capacity-constrained months this is a *policy* deviation: was allocation done per the stated rule (e.g., pro-rata on trailing offtake) or overridden? Measure allocation fill % per distributor and log every manual override with reason — the override log is itself a deviation report on the sales organization.

**Plan vs actual production (campaign adherence).** Two distinct metrics: *schedule adherence* (did we run the jobs we planned, in the planned window) and *schedule attainment* (did we produce the planned quantity, regardless of what jobs). Tube-mill scheduling literature emphasizes sequencing by strip-width/diameter families to minimize roll changeovers; the key deviations are (a) campaign broken mid-run for an "urgent" order (measure interruptions/month with reason codes), and (b) tonnage attainment per campaign. Schedule adherence is the best *leading* indicator of future delivery failure — if today's schedule slips, next week's OTIF is already at risk (MachineMetrics/SCW).

**Production vs dispatch.** FG produced but not dispatched shows up as plant FG stock aging and dispatch-plan attainment. Deviations: dispatch plan vs actual (daily), FG aging beyond X days per SKU, and loading/vehicle non-availability reason codes.

**Dispatch vs distributor receipt.** In-transit deviation: quantity/damage disputes and transit-time breaches. Measured as GRN-confirmed receipt vs dispatch note, and transit days vs lane standard. This is where logistics exception management applies (project44/Beacon-type practice): flag only breaches beyond lane-specific tolerance, not every late truck.

**Primary vs secondary sales.** Primary = company → distributor; secondary = distributor → dealer/retailer. Persistent primary > secondary = channel stuffing; the documented early-warning triad (Indian FMCG practice, transferable to building materials): distributor stock-days above norm (>35 days vs healthy 18–28 for fast movers), credit-note volume rising faster than primary sales, and field-captured secondary lagging primary — any signal 2 months running is an amber-to-red event. Requires a DMS or field-sales app capturing secondary at SKU level; monthly manual reconciliation is too slow.

**Inventory vs norms.** Two stock pools: plant FG (vs SKU-level norm in days-of-cover, set by demand class and campaign cycle length — a SKU made once per 3-week campaign needs ~3+ weeks cover) and distributor stock (vs the 18–28/35-day band above). Deviations both directions matter: under-norm on A-class SKUs = imminent stockout; over-norm = working capital and dead-stock risk.

**Receivables / credit-limit breaches.** Standard credit-control practice: hard block or documented-exception workflow at limit breach; monitor DSO monthly and aging buckets weekly; every override of a credit block is a logged, owned exception. Rising overdue % at a distributor is also an early stuffing signal (they can't pay because they can't sell).

---

## 2. Standard metrics with formulas

| Metric | Formula | Benchmark / notes |
|---|---|---|
| **MAPE** | (Σ \|F − A\| / A) ÷ n × 100 | No universal target; explodes on low-volume SKUs. Segment by SKU class. |
| **WMAPE** | Σ\|F − A\| ÷ ΣA × 100 | Preferred for portfolio/SKU-mix reporting (volume-weighted). 20–30% WMAPE at SKU-month level is common in practice for industrial goods *(weakly sourced — vendor blogs)*. |
| **Forecast Bias (ME%)** | Σ(F − A) ÷ ΣA × 100 | Should oscillate around 0; persistent sign = gaming or process bias. |
| **Tracking Signal** | Cumulative Σ(F − A) ÷ MAD | Alert when \|TS\| > 4 (classic rule of thumb from forecasting texts). |
| **Forecast Value Added** | Accuracy(process step) − Accuracy(naive forecast), per step ("stairstep report") | Negative FVA = that touchpoint makes forecasts worse; ~half of judgmental overrides do (SAS/Gilliland). |
| **Schedule adherence** | Units (or orders) produced as scheduled ÷ units scheduled × 100 | World-class 92–98%; typical without finite scheduling 70–85%; <80% = urgent *(vendor-sourced ranges: SCW, UserSolutions, KPI Depot)*. |
| **Schedule attainment** | All output in period ÷ planned output × 100 | Can exceed adherence (includes unplanned jobs); track both to expose plan churn. |
| **OTIF** | Orders delivered on time AND complete ÷ total orders × 100 | Definition varies (order vs line vs case level) — fix the definition contractually. Retail programs demand 90–98%; ~85–90% order-level is a realistic industrial starting point *(weakly sourced)*. |
| **Line fill rate** | Order lines shipped complete ÷ total lines × 100 | More forgiving than OTIF; use for SKU-availability diagnosis. |
| **DIO** | Avg inventory ÷ COGS × 365 | Steel sector ≈ 50 days; manufacturing broadly 60–120 (Cin7/CFI compilations — directional only). |
| **Stock cover (days)** | Current stock ÷ avg daily offtake | Distributor healthy band 18–28 days fast movers; >35 = red *(practitioner heuristic)*. |
| **Capacity utilization** | Actual output ÷ maximum feasible output × 100 | Measure per mill; note "maximum" must net out planned maintenance/changeover to be honest. |
| **Yield / FPY** | Good units (or tonnes) first pass ÷ total input × 100 | For ERW: prime tonnes out ÷ coil tonnes in; track scrap + downgrade separately. |
| **Order-to-dispatch lead time** | Dispatch date − order confirmation date (days) | Benchmark internally by SKU class (made-to-stock vs campaign-wait); trend matters more than absolute. |
| **DSO** | AR ÷ credit sales × period days | Compare to stated credit terms; gap = hidden extension of credit. |

---

## 3. Exception-management practice

**Design principles (management by exception).** (1) *Tolerance bands, not point targets* — a deviation is only an exception outside the band; bands differ by SKU class/customer/lane. (2) *RAG statuses with defined transitions* — green (in band), amber (out of band, owner acts), red (escalated, next tier acts); every red has a named owner and a due date. (3) *Alert-fatigue avoidance* — generic rules ("every late shipment is an exception") flood the system and get ignored; use custom thresholds by SKU/customer/region, suppress duplicates, and cap the daily exception list to what a human can actually work (GAINS, Infios, Log-hub). (4) *Root-cause drilldown* — every exception must open into its transaction detail (which SKU, which order, which mill, which reason code) within two clicks; reason-code taxonomies are what turn deviations into Pareto-able improvement work.

**Tiered cadence (lean daily management).** Tier 1: shift/daily, operators + supervisor at an SQDC(P) board (Safety, Quality, Delivery, Cost, People) — yesterday's deviations, today's plan, escalate what can't be solved. Tier 2: daily plant leadership — cross-functional deviations, escalations from Tier 1. Tier 3: weekly/monthly senior leadership — trends, systemic issues, resources. The escalation path is explicit: an item unresolved at one tier auto-populates the next tier's board with timestamp and owner (DigiLEAN, TeamAssurance, iObeya). This structure is directly reusable for the commercial side (branch → region → national daily/weekly sales huddles on the same deviation data).

**S&OP as the monthly deviation institution.** The classic 5-step cycle — data gathering → demand review → supply review → pre-S&OP reconciliation → executive S&OP — is where the *plan-vs-plan* deviations are formally reviewed: demand review confronts forecast vs actual and forces a consensus number; supply review confronts plan vs capacity; reconciliation resolves gaps and frames trade-offs; the executive meeting decides and commits, with tracked follow-ups. The discipline is that deviations are reviewed on a fixed calendar with decision rights defined — not ad hoc when someone notices.

---

## 4. Supply-chain control towers

Gartner defines a control tower as **five elements — people, process, data, organization, and technology-enabled capabilities — for transparency and coordination**, and pointedly notes "everyone wants one, nobody quite knows how it works." Real capabilities in mature deployments: a normalized data hub (gather/cleanse/distribute one version of the truth), near-real-time visibility, exception alerting with prioritization, root-cause/self-service analytics, and increasingly predictive/scenario-response ("sense → analyze → predict → solve → execute → learn").

**Lessons that transfer to a mid-size manufacturer building its own:**
1. **Don't start before cross-functional integration exists** (Gartner's explicit caution) — if sales, plants, and dispatch don't share master data and definitions, the tower has no signals worth watching.
2. **The data layer is 80% of the work**: one SKU master, one distributor master, one calendar, agreed metric definitions (e.g., whose OTIF?).
3. **Visibility without a response mechanism is decoration** — the value is in the exception → owner → action → learn loop, which is exactly the tiered-meeting structure in §3, digitized.
4. **Build narrow and deep**: one flow (order → dispatch → receipt → secondary sale) end-to-end beats broad shallow telemetry.

---

## 5. Why deviation dashboards fail — and success factors

Documented failure modes: **stale/contested data** (meetings degenerate into reconciling "which number is right" — the dashboard has already failed); **no owner per exception** (visibility without accountability; "most supply chains don't fail because risks were invisible — they fail because decisions came too late"); **wrong thresholds** (too tight → alert flood and desensitization; too loose → misses; a Gartner figure cited in trade press: ~70% of logistics managers name data overload as a reason for dashboard abandonment *(secondhand citation — treat as directional)*); **measuring what's easy, not what matters** (tonnage shipped is easy; secondary offtake and campaign interruptions are hard but diagnostic); **plan-execution disconnect** (plans built on assumptions operations can't meet, so deviations are structural, not behavioral).

Success factors from the same literature: fewer signals with clearer ownership; every metric has one definition, one source system, one owner; exceptions expire (aging unactioned alerts are a metric in themselves); thresholds reviewed quarterly; the dashboard is the *agenda* of a standing meeting, not a passive artifact; and leadership reviews the deviation process (are reds getting closed?) not just the deviations.

---

## Implications for the P&T Operating System — candidate deviation catalog

| # | Deviation | Comparison pair | Cadence | Owner role |
|---|---|---|---|---|
| D1 | Distributor estimate reliability | Monthly estimate vs confirmed orders (bias + WMAPE, rolling 3M, per distributor) | Monthly (demand review) | Area Sales Manager |
| D2 | Forecast value added | Each forecast touchpoint vs naive forecast (stairstep) | Monthly | Demand Planner |
| D3 | Allocation fairness | Confirmed order vs allocated qty; overrides logged w/ reason | Weekly in constrained months | Sales Head |
| D4 | Campaign adherence | Planned campaign (SKUs, sequence, window) vs actual run; interruptions w/ reason codes | Daily (Tier 1/2) | Plant PPC Head |
| D5 | Plan attainment | Planned tonnes vs actual tonnes, per mill per campaign | Daily/weekly | Plant Head |
| D6 | Yield & downgrade | Coil input vs prime output (FPY), scrap %, downgrade % | Daily (SQDC board) | Mill Supervisor / Quality |
| D7 | Dispatch attainment | Dispatch plan vs actual dispatches; FG aging > norm per SKU | Daily | Logistics Manager |
| D8 | Transit & receipt | Dispatch note vs distributor GRN (qty, damage, transit days vs lane std) | Weekly | Logistics Manager |
| D9 | OTIF / line fill | Promised date+qty vs delivered, order- and line-level | Weekly | Supply Chain Head |
| D10 | Order-to-dispatch lead time | Confirmation date vs dispatch date, by SKU class | Weekly trend | Supply Chain Head |
| D11 | Primary–secondary gap | Primary billing vs DMS-captured secondary, per distributor per SKU family | Weekly amber scan; monthly formal | Regional Sales Manager |
| D12 | Distributor stock vs norm | DMS stock-days vs 18–28 day band (red > 35 sustained) | Weekly | ASM + Distributor |
| D13 | Plant FG vs norm | FG days-cover vs SKU-class norm (both under and over) | Weekly | PPC + Supply Chain |
| D14 | Credit-limit breach | Outstanding vs sanctioned limit; every override logged | Real-time block + weekly review | Credit Controller (Finance) |
| D15 | Receivables aging / DSO | DSO vs credit terms; aging buckets vs last period | Weekly aging; monthly DSO | Finance Head + Sales Head |
| D16 | Capacity utilization | Actual output vs demonstrated capacity per mill | Monthly (supply review) | Operations Head |

**Design notes for this business:** start with D1, D4, D11, D12, D14 — they cover the three chronic failure modes (gamed estimates, broken campaigns, stuffed channel) and the cash risk. Wire D4–D7 into plant tier meetings and D1–D3, D11–D15 into a monthly S&OP calendar from day one; a deviation without a standing meeting that reviews it will decay into wallpaper. Fix metric definitions (especially OTIF level and "secondary sale" capture point) before building anything.

---

## Sources

- https://www.supliichain.io/blog/forecast-accuracy-mape-bias-tracking-signal — MAPE/bias/tracking-signal formulas and usage.
- https://demandplanning.net/mape-wmape-and-forecast-bias/ — WMAPE vs MAPE and bias definitions.
- https://www.easyreplenish.com/blog/demand-forecast-accuracy-metrics-tools-industry-benchmarks — forecast accuracy benchmark discussion (vendor; directional).
- https://www.sas.com/content/dam/SAS/en_us/doc/whitepaper1/forecast-value-added-analysis-106186.pdf — SAS/Gilliland FVA whitepaper: definition, naive baseline, stairstep report.
- https://www.lokad.com/forecast-value-added/ — FVA critique and the "52% worse than random walk" finding.
- https://scw.ai/blog/schedule-adherence/ — schedule adherence definition, leading-indicator argument, 92–98% world-class range (vendor).
- https://www.machinemetrics.com/blog/schedule-attainment — schedule attainment vs adherence distinction.
- https://kpidepot.com/kpi/production-schedule-adherence — adherence formula and ~90% typical target.
- https://redstagfulfillment.com/on-time-and-in-full-otif/ — OTIF definition, Walmart origin, measurement-level ambiguity.
- https://abcsupplychain.com/otif-fill-rate-difot/ — OTIF/fill-rate calculation variants.
- https://www.cin7.com/blog/days-inventory-outstanding/ — DIO formula and sector benchmarks incl. steel ≈ 50 days.
- https://corporatefinanceinstitute.com/resources/accounting/days-inventory-outstanding-dio/ — DIO formula reference.
- https://www.projectmanager.com/blog/manufacturing-kpis — capacity utilization and FPY formulas.
- https://sortstring.com/blogs/primary-vs-secondary-sales-explained — primary/secondary definitions, channel-stuffing triad, 18–28/35 stock-day heuristics (India practitioner source).
- https://blog.massistcrm.com/primary-secondary-tertiary-sales-fmcg — primary/secondary/tertiary sales definitions.
- https://www.pedowitzgroup.com/how-do-you-avoid-sandbagging-in-sales-forecasts — sandbagging causes and countermeasures.
- https://tbmcg.com/resources/blog/sop-eliminate-bias-from-demand-planning/ — incentive-driven forecast bias in S&OP.
- https://www.digilean.com/tier-meetings-in-manufacturing-explained/ — tier meeting structure and escalation.
- https://teamassurance.com/blog/tiered-daily-management — tiered daily management levels and cadence.
- https://www.orcalean.com/article/importance-of-daily-sqdc-meetings-how-sqdc-meetings-drive-daily-performance-on-the-shop-floor — SQDC board practice.
- https://www.anaplan.com/blog/sales-operations-planning-sop-guide/ — S&OP 5-step cycle.
- https://ori.io/ori-blog-posts/specific-steps-in-an-effective-monthly-s-op-process — monthly S&OP meeting mechanics.
- https://www.supplychaindive.com/news/gartner-what-supply-chain-managers-should-know-about-control-towers/574098/ — Gartner five-element control-tower definition and readiness caution.
- https://www.supplychain247.com/article/what_is_a_supply_chain_control_tower_and_whats_needed_to_deploy_one — control-tower data-hub capabilities.
- https://gainsystems.com/blog/how-leading-teams-stay-ahead-of-supply-chain-exceptions/ — exception thresholds and alert-fatigue avoidance.
- https://log-hub.com/why-most-supply-chain-risk-dashboards-become-noise/ — dashboard noise, "fewer signals, clearer ownership" argument.
- https://www.scmr.com/article/why-supply-chains-fail-at-launch-its-not-the-plan-its-the-execution — visibility-to-decision gap.
- https://dzone.com/articles/supply-chain-planning-breaks-even-with-advanced-forecasting — planning–execution disconnect.
- https://www.thefabricator.com/tubepipejournal/article/tubepipeproduction/tips-for-maximizing-tube-pipe-mill-efficiency-part-ii — tube-mill changeover grouping practice.
- https://macsphere.mcmaster.ca/bitstreams/565712a4-d4dc-4a60-8376-058d96bcd25f/download — steel tube mill campaign/family scheduling (academic).

*Benchmarks marked "(weakly sourced)" or "(vendor)" come from practitioner/vendor content rather than audited studies — treat as directional starting points and calibrate against this business's own history.*

---

## Addendum: worked examples and encoding specs

### 1. Worked numeric examples

**D1 — Distributor estimate reliability (Distributor: "Sharma Steels", GI square tubes, rolling 3M)**

| Month | Estimate (MT) | Confirmed orders (MT) | Error (E−A) | \|Error\| |
|---|---|---|---|---|
| Apr | 220 | 180 | +40 | 40 |
| May | 250 | 195 | +55 | 55 |
| Jun | 240 | 210 | +30 | 30 |
| **Σ** | 710 | **585** | **+125** | **125** |

- **Bias %** = Σ(E−A) ÷ ΣA = 125 ÷ 585 = **+21.4%** (systematic over-estimation)
- **WMAPE** = Σ\|E−A\| ÷ ΣA = 125 ÷ 585 = **21.4%**
- Note: WMAPE = \|bias\| here because all errors are one-sided — itself a gaming fingerprint (allocation hoarding), vs. noisy-but-unbiased error.
- **Reliability score** = 100 − WMAPE = **78.6**. Recommended RAG (judgment-based): Green WMAPE ≤10% and \|bias\| ≤5%; Amber ≤25%; **Red** if WMAPE >25% *or* \|bias\| >15% over 3M → this distributor is **Red on bias**. Action: ASM conversation + estimate discounted in allocation logic.

**D4 — Campaign adherence (Mill 2, planned window 5–7 Jun, 270 MT)**

| SKU | Planned (MT) | Actual in window (MT) | Notes |
|---|---|---|---|
| 40×40×2.0 GI | 120 | 118 | ran as planned |
| 40×40×2.6 GI | 90 | 55 | **interrupted** — mill switched to unplanned export SKU (30 MT), reason code: sales override |
| 50×50×2.0 GI | 60 | 0 | pushed to 8 Jun (out of window) |

- **Adherence** = as-scheduled, in-window tonnes ÷ planned = (118+55+0) ÷ 270 = **64.1%**
- **Attainment** = all output in window ÷ planned = (118+55+30) ÷ 270 = **75.2%**
- Interruptions = 1 (logged with reason). Definitional choice to fix upfront: whether out-of-window completion counts partially or zero — recommend zero for adherence, captured in attainment.

**D11 — Primary–secondary gap (Distributor: "Verma Tubes", all-SKU MT)**

| Month | Primary | Secondary | Closing stock | Daily offtake (sec.÷30) | Stock-days | RAG |
|---|---|---|---|---|---|---|
| Apr | 200 | 185 | 160 | 6.17 | 26 | Green |
| May | 220 | 170 | 210 | 5.67 | 37 | Amber (1st month >35) |
| Jun | 190 | 150 | 250 | 5.00 | 50 | **Red** (2nd consecutive >35, secondary falling while primary sustained) |

Closing stock = opening + primary − secondary. Action at Red: halt primary push, joint liquidation plan, physical stock audit.

### 2. Encoding specs for the 5 priority deviations

| Dev | Left side (fields → source) | Right side (fields → source) | Compute | Trigger / escalation |
|---|---|---|---|---|
| **D1** | `distributor_id, month, sku_family, estimate_qty` → DMS/portal estimate module, **locked at cutoff date** (immutable snapshot) | `confirmed_order_qty` net of cancellations → ERP sales orders (order date in month) | Monthly at month-close; rolling 3M | Red per bands above → ASM commentary due in 7 days, else RSM; 2 consecutive Red cycles → allocation-priority downgrade (policy, logged) |
| **D4** | `campaign_id, mill_id, sku, planned_start/end, planned_tonnes` → PPC schedule (APS/ERP or controlled Excel master, versioned) | `actual_start/end, actual_tonnes, interruption_flag, reason_code` → shift production log / DPR / MES | Daily at shift close; final at campaign close | Adherence <85% (rec.) or >1 unplanned interruption/week → Tier 2 daily meeting; unresolved 3 days → Plant Head at Tier 3 weekly |
| **D11** | `primary_billed_qty` → ERP invoices to distributor | `secondary_qty` → DMS field-app dealer orders; `closing_stock` → DMS stock (computed, reconciled by monthly physical/photo audit) | Weekly scan; formal monthly | Stock-days >35 × 2 consecutive months OR secondary −15% while primary flat → Red; RSM action in 7 days; standing item at monthly demand review |
| **D12** | `closing_stock` per SKU family → DMS | 13-week avg daily secondary → DMS | Weekly | Bands (rec., calibrate): 18–28 Green, 28–35 Amber, >35 Red; also <10 days on A-class = stockout Amber. Amber → ASM action 14 days; Red → stop-primary flag review |
| **D14** | `sanctioned_limit` → ERP credit master (Finance-owned) | `outstanding` = open AR **+ in-transit unbilled dispatches** → ERP AR + dispatch notes; overdue aging buckets | Real-time at order entry; daily batch report | ≥90% limit = Amber warn; ≥100% = auto order block. Override only by Credit Controller, logged with expiry date. Override open >7 days → Finance Head; >2 overrides/quarter → formal limit review |

### 3. Edge-case coding notes (MAPE/WMAPE)

- **Zero-actual months**: per-period MAPE is undefined (÷0) — exclude that period from MAPE; WMAPE is safe as long as ΣA > 0 for the slice. If ΣA = 0, report "no demand — unrated," never 0% or 100%. Never substitute A = 1.
- **New SKUs / new distributors (<3 data points)**: exclude from bias/reliability scoring; report as "unrated" bucket; track launch-plan vs actual separately.
- **Partial months** (mid-month onboarding, plant shutdown): exclude or pro-rate with an explicit data-quality flag; never let a partial month enter a rolling 3M window silently.
- **One-sided errors**: when WMAPE ≈ \|bias\|, the problem is gaming, not forecasting skill — route to sales management, not planner coaching.
- **Cancellations/returns**: net them out of confirmed orders before comparison; count cancellation rate as its own (secondary) deviation.
- **Denominator discipline**: WMAPE denominator is Σ actuals, never Σ forecast; flag slices where one bulk order dominates ΣA (report with and without, or cap at P95) so a single project order doesn't mask chronic error.

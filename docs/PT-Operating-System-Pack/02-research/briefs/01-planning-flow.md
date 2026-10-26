# Industry Planning Flow & Planning Logics for Steel Tube Manufacturers
### Research brief — exploratory input for a P&T (Pipes & Tubes) Business Operating System

## TL;DR

- The industry-standard flow is: distributor estimates/indents → consensus demand plan → monthly S&OP with capacity check → master schedule expressed as **size campaigns per mill** → slitting plan and HR coil procurement → dispatch/allocation. Metals APS vendors (PSI Metals, DELMIA Quintiq) productize exactly this chain.
- Campaigns exist because tube-mill roll changeovers are expensive: conventional fixed-tooling changeovers can take up to a full day; quick roll-change systems bring it to 30–90 minutes; the economics force grouping of similar diameters and running each size in batches on a cycle.
- The most instructive real-world mechanism is the **published rolling schedule**: Nucor-Yamato updates a public size-by-week schedule every Friday (6–7-week roll cycles, order cut-offs ~2 weeks before rolling, Open/Closed/Inquire status per size); Atlas Tube runs 2–4-week cycles on common HSS sizes. Distributors book against these calendars.
- Demand input in practice is a blend: statistical baseline + sales/distributor overrides, disciplined with **Forecast Value Added (FVA)** measurement, because sales inputs carry systematic bias (sandbagging or optimism).
- When capacity-constrained, allocation to distributors uses **fair-share (proportional)**, **priority/tier**, or **rules-based** logic; metals APS systems generate **sales quotas** by product family/region out of the S&OP plan and promise orders against them (ATP/CTP).
- SKU proliferation is managed by segmentation — runner/repeater/stranger or ABC-XYZ — mapping runners to make-to-stock replenishment, repeaters to fixed campaign cycles, strangers to make-to-order slots inside campaigns.
- APL Apollo is the domestic benchmark: 800+ distributors, ~2,500–3,000 SKUs, warehouses in ~29 cities, 48-hour order-to-delivery, cash-and-carry with working capital cut from 40 days (FY18) to ~8 days (FY21) — a stock-and-replenish model rather than an order-book model.

---

## 1. End-to-end demand-to-production planning flow

The canonical flow in metals businesses, as reflected in metals-specific APS architecture, has five layers:

1. **Demand capture.** Distributor monthly estimates/indents plus direct/OEM/project orders. In the Indian pipes trade this is typically a monthly indent per distributor at SKU level, though public documentation of the indent mechanics is thin (SAIL/Tata Steel disclose the dealer network structure and rate-contract/forward-booking mechanisms, not the monthly indent workflow). In APL Apollo's model, the demand signal is largely a *replenishment pull*: distributors buy cash-and-carry against stock held in ~29 city warehouses with a 48-hour order-to-delivery promise, so the planning signal is warehouse depletion plus distributor estimates rather than a long order book.
2. **Demand consensus / S&OP.** PSI Metals describes the standard metals stack explicitly: "Demand Planning, where forecasts and available capacity are assessed" feeds "Sales and Operations Planning (S&OP), incorporating production plans, constraints, and **quota generation**," concluding with automated Available-to-Promise due-date quoting. The quota output is important: the S&OP plan is decomposed into sales quotas by product family/region against which incoming orders are accepted.
3. **Master schedule → campaign plan.** PSImetals "Flow and Order Planning" computes capacity plans and target material flows at product-family and order level, then **campaign planning aligned with the S&OP plan**, plus Capable-to-Promise checks confirming due dates. Line scheduling then sequences within campaigns (casting, rolling, galvanizing) with throughput optimization. DELMIA Quintiq claims metals deployments average ~20% inventory reduction and ~75% reduction in late orders from this kind of integrated planning.
4. **Raw material and slitting plan.** SKU demand is translated into strip widths; strips of common material spec are pooled onto mother HR coils via a cutting-stock/trim-loss optimization (see §2). This drives HRC width-wise procurement. Scale matters here — APL Apollo, as reportedly the largest HRC buyer in India (~10% of industry output), procures ~2% cheaper than competitors.
5. **Dispatch/allocation.** Finished goods flow to plant yards and regional warehouses; when supply is short, allocation rules (§3) decide who gets what; the promise date given to a distributor comes from ATP against stock or CTP against the campaign calendar.

The best publicly visible instance of layers 3–5 working together is the **published rolling schedule** used by North American long-product and HSS mills. Nucor-Yamato publishes a size-by-week schedule updated every Friday: a typical roll cycle is 6–7 weeks; steel is cast ~2 weeks (cast dates ~10 days) before rolling; each size carries a status code — **O** (open for orders), **C** (closed), **I** (inquire — nearly full), **PS** (planned stock may be available); a "projected next roll" column tells customers when a size comes around again. Distributors literally plan their buying against this calendar. This is the cleanest template for a distributor-facing campaign calendar in a tube business.

## 2. Campaign planning logic on tube mills

**Why campaigns exist.** An ERW tube mill uses a dedicated set of forming/sizing rolls per size. With conventional fixed tooling, a size change means physically removing and installing roll sets and re-tuning — the background of a US patent on automated-changeover tube mills notes a changeover "may often require a full day," which historically pushed mills to "run large quantities of material and overstock on single sizes." Modern quick roll-change systems take **30–90 minutes**; cassette tooling with servo-driven stands can reach ~45 minutes, and multi-function/"no-roll-change" stands under 15 minutes. Every changeover also produces scrap during dial-in. Xiris (weld-monitoring vendor) states the core scheduling rule plainly: *"schedule similar products or product diameters in groups to reduce the frequency of roll and roll-stand changes,"* and document mill settings per size to cut re-tuning time.

**Grouping logic.** Campaign construction in a tube plant is hierarchical:
- **By strip width / slit-coil size first** — each tube OD (or square/rect section) maps to a specific strip width; sizes sharing a strip width or requiring only minor stand adjustments are natural neighbors. This also couples the mill campaign directly to the slitting plan: combining orders of the same material spec on one mother coil lets orders "share trim," and slit-plan optimizers (a well-studied cutting-stock/trim-loss MILP class) minimize edge scrap subject to minimum edge-trim and knife limits.
- **Thickness within size** — thickness changes within a size are cheap (re-gauging), so a campaign runs a size across its thickness ladder before changing size.
- **Size ladder across campaigns** — sequencing adjacent sizes minimizes stand swaps; this is the tube-mill analogue of the hot-mill "rolling program."

**Campaign cycle frequency.** Real published numbers: Atlas Tube rolls common HSS sizes on **2–4 week cycles** (some sizes 2–6 weeks; slower movers less frequently), enabled by quick-change tooling; Nucor's availability charts explicitly categorize each size by rolling frequency. Nucor-Yamato beam cycles run 6–7 weeks. For a domestic ERW/structural business the practical equivalent is: runners near-continuously or weekly, repeaters each fortnight/month, strangers only when accumulated indents justify a minimum campaign quantity. One vendor source claims flexible mills make lots as small as ~5 tons economical (45-minute changeovers) — treat that figure as vendor marketing, but the direction (changeover time sets minimum lot size) is sound.

**Galvanizing campaigns.** For sheet CGLs, the academic literature is explicit: campaigns group coils "according to their due dates and their required galvanizing types within stated campaign sizes," with sequencing constrained by width, thickness, thermal-cycle and coating transitions, and campaign-boundary (linking) constraints. For **GI tubes**, galvanizing is either in-line (continuous, seconds between flux and bath) or batch hot-dip (racks of ~50+ cut lengths dipped together); batch HDG naturally batches by length/bundle and coating spec. Direct public evidence on GI *tube* campaign rules is thin — the transferable logic is: black-pipe campaigns feed a galvanizing queue batched by pipe size/length and coating class, and zinc-bath economics (bath maintenance is tracked on ~14-day/tonnage-based campaign cycles per maintenance literature) reward long steady runs.

## 3. Forecasting, demand inputs, and constrained allocation

**Collecting and reconciling distributor estimates.** Best practice is a layered forecast: a statistical baseline (from history at SKU × region level), overlaid with sales/distributor inputs, converging in a consensus meeting. Consensus platforms explicitly ingest external inputs from "partners, retailers, distributors" as adjustments to the baseline. The discipline that keeps this honest is **Forecast Value Added (FVA)**: measure whether each override step (salesperson, branch, distributor) actually improves accuracy versus the naive/statistical baseline, and weight or discard inputs accordingly. Documented bias patterns: sales teams under-forecast when estimates feed targets (sandbagging) and over-forecast when estimates feed supply allocation — the classic distortion in shortage regimes. Practical antidotes: track bias (signed error) per contributor, publish it, and tie allocation to *shipment history* rather than raw estimates (see below).

**Cadence.** Rolling monthly forecast, re-planned every cycle, with weekly granularity near-term; the S&OP horizon is typically 18–36 months at family level, while the tube-mill campaign horizon is the next 2–8 weeks at SKU level.

**Allocation when capacity-constrained.** Standard mechanisms (implemented in Oracle ASCP, Infor M3, Logility, etc.):
- **Fair share (proportional):** triggered when demand exceeds capacity in an allocation bucket; each distributor gets supply pro-rata to demand (or, better, to historical offtake — which neutralizes inflated indents).
- **Priority/tier-based:** rank customers/channels; fill top-down until supply exhausts. Used when tiers exist or margins differ.
- **Rules-based hybrids:** sequential criteria (e.g., contract customers first, then fair-share the trade channel), with planner review.
- **Quota systems (metals-specific):** the S&OP plan is cut into sales quotas by product family × region; order desks book orders only within quota, and ATP/CTP promises dates against the campaign calendar. This is PSI Metals' explicit design and is the most "steel-native" allocation mechanism.

Evidence on how Indian tube makers specifically allocate in shortage is not public; the quota + fair-share combination above is the defensible industry-standard synthesis.

## 4. The monthly S&OP cadence in metals

The standard five-step monthly cycle (SAPinsider, Logility, ori.io and others agree on the structure; six-step variants add a Product Review first):

| Step (week of month) | Meeting | Key inputs | Key outputs/decisions |
|---|---|---|---|
| 1. Data gathering (Wk 1) | — | Actual sales, inventory, open orders, production vs plan | Cleaned history, statistical baseline forecast |
| 2. Demand review (Wk 1–2) | Demand consensus meeting | Baseline + sales/distributor inputs, market intel | **Unconstrained consensus demand plan** (bookings/shipments by family & region) |
| 3. Supply review (Wk 2–3) | Supply/capacity meeting | Mill capacities, campaign calendars, maintenance, HRC supply | **Constrained supply plan by family & site**; recommended constrained shipping plan if short |
| 4. Pre-S&OP (Wk 3–4) | Reconciliation meeting (mid-level, cross-functional) | Demand vs supply gaps, financials | Recommended plan; unresolved trade-offs packaged for executives |
| 5. Executive S&OP (Wk 4) | Executive meeting | Recommended plan, scenarios | **Approved single plan**: volumes by family, inventory targets, capex/shift decisions, allocation policy |

Metals-specific colorations: the supply review is dominated by **campaign feasibility** (can the size mix demanded actually be sequenced on the mills?) and **HRC procurement** (width-wise coil booking lead times of 4–8+ weeks mean the S&OP volume plan effectively commits coil purchases); the output feeds **quota generation and ATP** rather than just a production number. Below the monthly cycle sits a weekly scheduling refresh — exactly what Nucor's Friday schedule update institutionalizes.

## 5. SKU proliferation and planning segmentation

A 250+ SKU portfolio (size × thickness × grade × finish × length) — and APL Apollo's ~2,500–3,000 SKUs at the extreme — cannot be planned uniformly. Two standard lenses:

- **Runner / Repeater / Stranger** (Slack's classification): *runners* have regular, predictable demand → dedicated capacity/MTS; *repeaters* have periodic demand → "scheduled at regular, frequent intervals" — i.e., they define the campaign cycle; *strangers* are erratic/one-off → "slotted in around the regular repeaters," lower priority, effectively MTO. This maps one-to-one onto tube-mill campaign design: repeaters set the fortnightly/monthly size calendar; strangers ride along when their size runs and must meet minimum campaign quantities.
- **ABC-XYZ / MTS-MTO split:** the academic consensus is that MTO items are identified by **low average demand + high coefficient of variation**; hybrid MTS/MTO systems are the norm in steel. An MIT-documented integrated steel case used an optimization model to choose which items to stock, deliberately *reducing the number of stocked designs* while increasing the share of orders covered by them — the same move as standardizing on preferred sizes/lengths and making odd lengths/grades order-only.

Practical splits this implies for a tube maker: A-class runners (common OD × 2–3 thicknesses, standard 6 m lengths, standard grade, black + GI) are stocked at plant/warehouse and replenished; B repeaters are made each cycle against distributor indents plus a small buffer; C strangers (odd thicknesses, non-standard lengths, special grades/finishes) are accepted only against firm indents with a minimum quantity and quoted against the next campaign window. APL Apollo's 48-hour delivery promise is only possible because the runner set is aggressively stocked forward in 29 warehouse cities while the long tail is not.

---

## Implications for the P&T Operating System

Concrete logics worth borrowing:

1. **Publish an internal (later distributor-facing) rolling program per mill**, Nucor-style: a size × week calendar with order cut-off dates and Open/Inquire/Closed status per SKU-family, refreshed weekly. This single artifact operationalizes campaign planning *and* gives distributors a booking discipline.
2. **Segment the 250+ SKUs into runner/repeater/stranger** (volume × demand CV), and hard-code the policy: runners = MTS with warehouse replenishment; repeaters = every-cycle campaign items; strangers = indent-only with minimum campaign tonnage and next-window promise dates.
3. **Structure the demand intake as baseline + override with FVA scoring.** Statistical SKU × region baseline; distributor monthly estimates captured as structured overrides; per-distributor bias and accuracy tracked and published; allocation keyed to historical offtake, not raw estimates, to kill indent inflation.
4. **Build campaigns bottom-up from strip width.** Demand → strip-width buckets → slit-plan (trim-loss pooling across SKUs of the same spec) → HRC width-wise procurement; then sequence sizes within a campaign across the thickness ladder, minimizing roll changes. Track changeover time per size-pair as master data — it is the objective function.
5. **Treat galvanizing as a second campaign stage**: batch the GI queue by pipe size/length/coating class downstream of black-pipe campaigns; keep zinc-line runs long and steady.
6. **Run a five-step monthly S&OP** with metals-specific outputs: constrained plan by family × plant, **sales quotas by region/family**, and ATP/CTP promising against the campaign calendar. Weekly schedule refresh underneath.
7. **Codify shortage allocation** up front: fair-share pro-rata to trailing offtake as default, priority tiers for contract/OEM demand, planner override with audit trail.

**Evidence gaps to validate with practitioners:** the exact mechanics of monthly distributor indents at Indian tube makers (not publicly documented), GI-tube-specific campaign rules, and true minimum campaign tonnages on Indian mills (the ~5 t "flexible mill" figure is vendor-sourced; incumbent mills likely run far larger minimums).

---

## Sources

- https://nucor.com/article/how-to-read-the-nucor-yamato-steel-rolling-schedule/ — How a published rolling schedule works: weekly updates, 6–7-week cycles, cast-date cut-offs, O/C/I/PS status codes.
- https://www.atlastube.com/products/ (via search) and https://www.atlastube.com/wp-content/uploads/2018/02/HSS-Availability-Chart.pdf — Atlas Tube HSS 2–4-week rolling cycles and size-availability categorization.
- https://assets.ctfassets.net/aax1cfbwhqog/3hl4EnMisSSthmdZ0ByjpX/e8dfd43917b6c8c0f00c90f33c209638/2024_Nucor_Hollow_Structural_Steel_HSS_Availability_Tables.pdf — Nucor HSS availability tables categorizing sizes by rolling frequency.
- https://blog.xiris.com/blog/3-ways-to-improve-tube-and-pipe-mill-changeover — Group similar diameters into campaigns; document settings; changeover scrap/setup cost.
- https://www.aistubemill.com/news/how-to-choose-the-right-erw-tube-mill-for-your-business-in-2025.html — Quick roll-change 30–90 min; no-roll-change stands <15 min; fixed vs replaceable tooling.
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5461896 — Automated-changeover tube mill patent; background on full-day changeovers driving single-size overstocking.
- https://www.hangaotech.com/Tube-Milling-Process-A-Complete-B2B-Guide-To-Modern-Pipe-And-Tube-Manufacturing-id44174475.html — Vendor claim: cassette tooling cuts changeover 6 h → 45 min, ~5 t lots economical.
- https://www.psi.de/en/solutions/products/psimetals/module/psimetals-planning — PSImetals: demand planning → S&OP with quota generation → ATP quoting; campaign planning aligned to S&OP; CTP; line sequencing incl. galvanizing.
- https://www.3ds.com/products/delmia/quintiq and https://www.quintiq.com/?pageID=metals-planning-en — DELMIA Quintiq metals planning; ~20% inventory and ~75% late-order reduction claims.
- https://pressbooks.pub/cioxxv/chapter/a-mathematical-methodology-for-planning-the-slitting-process-in-the-steel-industry-37/ and https://www.sciencedirect.com/science/article/abs/pii/S0377221721001612 — Slitting as cutting-stock/trim-loss MILP; pooling orders of same spec; minimum edge trim.
- https://www.sciencedirect.com/science/article/abs/pii/S0305054807001761 and https://www.sciencedirect.com/science/article/pii/S0360835224003279 — CGL scheduling: campaigns grouped by due date and galvanizing type; width/thickness/thermal transitions; campaign-boundary constraints.
- https://www.thefabricator.com/tubepipejournal/article/tubepipefabrication/batch-hot-dip-and-inline-galvanizing — Batch HDG (racks of ~50+ cut lengths) vs in-line galvanizing for tubes (accessed via search excerpt).
- https://sapinsider.org/five-essential-steps-of-sales-and-operations-planning-to-achieve-an-integrated-business-plan/ and https://ori.io/ori-blog-posts/specific-steps-in-an-effective-monthly-s-op-process — Five-step monthly S&OP: inputs/outputs per meeting; unconstrained demand plan; constrained supply plan by family/site.
- https://www.lokad.com/forecast-value-added/ and https://www.toolsgroup.com/blog/supply-chain-innovation-improving-forecast-value-added/ — FVA measurement of sales/distributor overrides; weighting data streams by accuracy.
- https://www.logility.com/blog/4-ways-to-optimize-allocation-of-constrained-supply/ — Fair-share, priority, rules-based, and custom allocation methods and when to use each.
- https://docs.infor.com/m3udi/16.x/en-us/m3beud/scexechs/gdd1567529734675.html and https://docs.oracle.com/cd/E18727_01/doc.121/e13358/T309464T471624.htm — Fair-share triggers and allocation-priority implementations in enterprise planning systems.
- https://onlinelibrary.wiley.com/doi/abs/10.1002/9781118785317.weom100169 and http://leanmanufacturingtools.org/wp-content/uploads/2015/05/Runners-Repeaters-and-Strangers.pdf — Runner/repeater/stranger definitions and scheduling policy (repeaters at regular frequent intervals).
- https://dspace.mit.edu/bitstream/handle/1721.1/121289/Guo_2019.pdf and https://arxiv.org/pdf/1504.03594 — Steel MTS/MTO segmentation; MTO identified by low demand + high CV; stocked-design rationalization.
- https://stalwartvalue.com/apl-apollo-a-5-bagger-in-2-5-years/ — APL Apollo model: 800+ distributors, 1,500+ products, 29 warehouse cities, 48-hour delivery, cash-and-carry, working capital 40→8 days, 10 plants, largest HRC buyer (~2% procurement advantage), DFT.
- https://aplapollo.com/downloads (investor presentations, via search) — ~2,500–3,000 SKUs, 50,000+ retailers, 48-hour distributor lead time, ~55% organized structural-tube share.
- https://sail.co.in/en/dealer-network and https://blog.tatanexarc.com/da/sail-vs-tata-steel/ — Indian mill 2-tier distributor-dealer networks; rate contracts/forward booking (indent mechanics not publicly detailed).

---

## Addendum: worked examples

*All numbers below are illustrative assumptions for mechanics demonstration, not benchmarks.*

### 1. Forecast rollup: baseline + distributor override + bias adjustment

Rule: bias factor = trailing-6-month (distributor estimate ÷ actual offtake). Adjusted estimate = estimate ÷ bias factor. Consensus = 50/50 blend of statistical baseline and adjusted estimate (in practice, weight by each input's FVA track record instead of a flat 50/50).

**SKU S1 — 40 NB × 3.2 mm Medium, black (IS 1239), tonnes/month:**

| Distributor | Stat. baseline | Estimate | Bias factor | Adjusted est. | Consensus |
|---|---|---|---|---|---|
| D1 | 120 | 150 | 1.25 (over) | 150÷1.25 = 120 | 0.5×120 + 0.5×120 = **120** |
| D2 | 80 | 70 | 0.93 (under) | 70÷0.93 ≈ 75 | 0.5×80 + 0.5×75 ≈ **78** |
| D3 | 60 | 90 | 1.50 (over) | 90÷1.50 = 60 | 0.5×60 + 0.5×60 = **60** |
| **Total S1** | 260 | 310 | — | 255 | **258** |

**SKU S4 — 50 NB × 3.6 mm Medium, black:**

| Distributor | Baseline | Estimate | Bias | Adjusted | Consensus |
|---|---|---|---|---|---|
| D1 | 90 | 100 | 1.11 | 90 | **90** |
| D2 | 50 | 65 | 1.00 | 65 | **58** |
| D3 | 40 | 30 | 0.75 | 40 | **40** |
| **Total S4** | 180 | 195 | — | 195 | **188** |

Note the effect: D3's habitual 50% inflation on S1 is neutralized (90 → 60), while D2's sandbagging is corrected upward. Raw estimates (310 t) would have overbuilt S1 by ~20%.

### 2. Fair-share allocation pro-rata to trailing offtake

Assumptions: SKU-family capacity this month = 5,000 t; requested (indented) = 6,500 t. Allocation basis = trailing-3-month average offtake (not the indent), share × 5,000, capped at the request (any surplus re-distributed pro-rata among still-unfilled distributors — not triggered here).

| Distributor | Indent (t) | Trailing 3-mo offtake (t/mo) | Offtake share | Allocation (t) | Fill vs indent |
|---|---|---|---|---|---|
| D1 | 2,600 | 1,800 | 45% | 0.45×5,000 = **2,250** | 87% |
| D2 | 1,900 | 1,200 | 30% | **1,500** | 79% |
| D3 | 1,300 | 600 | 15% | **750** | 58% |
| D4 | 700 | 400 | 10% | **500** | 71% |
| **Total** | 6,500 | 4,000 | 100% | **5,000** | 77% |

D3 inflated its indent (1,300 requested vs 600 run-rate) and gains nothing — the anti-gaming property that raw-estimate allocation lacks.

### 3. Campaign grouping and 2-week rolling program

Six SKUs, one ERW mill. Grouping key = **strip width → size; thickness ladder (thin→thick) within campaign; GI SKUs are black pipe from the same campaign routed to the galvanizing queue** (GI creates a zinc-line batch, not a separate mill campaign).

| SKU | Spec | Strip width* | Finish | Fortnight demand (t) | Campaign |
|---|---|---|---|---|---|
| S1 | 40 NB × 3.2 Medium (IS 1239) | 146 mm | Black | 180 | C1 |
| S3 | 40 NB × 3.2 Medium | 146 mm | GI | 90 | C1 → galv |
| S2 | 40 NB × 4.0 Heavy | 146 mm | Black | 60 | C1 |
| S4 | 50 NB × 3.6 Medium | 183 mm | Black | 150 | C2 |
| S6 | 50 NB × 3.6 Medium | 183 mm | GI | 80 | C2 → galv |
| S5 | 50 NB × 4.5 Heavy | 183 mm | Black | 50 | C2 |

*Illustrative slit widths ≈ OD×π less weld allowance.

Assumptions: mill net rate 12 t/h ≈ 250 t/day (3 shifts); size changeover 4 h; gauge-only change 30 min; **minimum size-campaign 150 t, minimum per-thickness lot 40 t** (below 40 t, the SKU waits for the next cycle).

- **C1 (146 mm, 330 t):** run 3.2 mm black 180 t → 3.2 mm for GI 90 t (same setup) → gauge change → 4.0 mm 60 t. ≈1.5 days.
- **C2 (183 mm, 280 t):** 3.6 mm black 150 t → 3.6 mm for GI 80 t → 4.5 mm 50 t. ≈1.3 days.
- Galvanizing queue: S3 (90 t) + S6 (80 t) batched by size after black production; adds ~3 days to GI lead time.

**Rolling program (published weekly, Nucor-style status per size):**

| Mill slot | Wk 1 Mon–Tue | Wk 1 Wed–Thu | Wk 1 Fri | Wk 2 Mon–Tue | Wk 2 Wed–Thu | Wk 2 Fri |
|---|---|---|---|---|---|---|
| Campaign | C1 (40 NB) | C2 (50 NB) | Stranger slot / catch-up | C1 (40 NB) | C2 (50 NB) | Stranger slot |
| Order cut-off | Fri Wk 0 | Mon Wk 1 | — | Fri Wk 1 | Mon Wk 2 | — |
| Status today (Mon Wk 1) | **C** Closed | **I** Inquire | — | **O** Open | **O** Open | **O** Open |

Each size runs once per fortnight; a distributor missing Friday's cut-off is quoted the next cycle's slot (CTP against the calendar).

### 4. Runner / repeater / stranger classification rule

Illustrative cutoffs: compute monthly volume and coefficient of variation (CV = σ/μ of last 12 monthly demands) per SKU.

- **Runner:** volume ≥ 300 t/mo (≈ top quartile) **and** CV ≤ 0.5 → MTS; produced every cycle; safety stock ≈ 2 weeks at warehouses.
- **Repeater:** volume ≥ 80 t/mo (≥ 2× the 40 t min lot) **and** CV ≤ 1.0 → fixed fortnightly campaign; small buffer (≈ 1 week); indents refine quantity.
- **Stranger:** volume < 80 t/mo **or** CV > 1.0 → indent-only MTO; 40 t minimum lot; promised against next open campaign or Friday stranger slot; no stock.

| SKU | Vol (t/mo) | CV | Class | Policy |
|---|---|---|---|---|
| S1 40NB×3.2 Blk | 360 | 0.30 | Runner | MTS, every cycle, 2-wk safety stock |
| S4 50NB×3.6 Blk | 300 | 0.45 | Runner | MTS, every cycle |
| S3 40NB×3.2 GI | 180 | 0.60 | Repeater | Fortnightly campaign + galv batch, 1-wk buffer |
| S6 50NB×3.6 GI | 160 | 0.70 | Repeater | Fortnightly campaign + galv batch |
| S2 40NB×4.0 Blk | 120 | 0.90 | Repeater | Fortnightly, quantity = indents + small buffer |
| S5 50NB×4.5 Blk | 100 | 1.20 | Stranger | Indent-only; ran in C2 only because indents (50 t) cleared the 40 t minimum |

Re-classify quarterly; SKUs migrating stranger→repeater earn a calendar slot, repeater→stranger lose it.

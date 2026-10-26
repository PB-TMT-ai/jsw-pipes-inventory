# Campaign Planning Parameters for Steel Pipes & Tubes
### Research brief — which physical and commercial parameters drive Campaign sequencing and grouping on coil-fed ERW tube mills

**Scope:** the parameter set that decides what runs when on a tube mill, the changeover cost of each parameter transition, and the sequencing rules that follow. Extends [01-planning-flow.md](briefs/01-planning-flow.md) (which established *that* campaigns exist and *how often* they recur) and [03-domain-expertise.md](briefs/03-domain-expertise.md) (which established the SKU attribute tuple). This brief goes down one level: *inside* the campaign, on the parameters.

**Convention:** every claim is either **sourced** (cited inline, URL in §11) or **[synthesized]** — my own rule, derived from sourced mechanics but not itself published. Vocabulary follows `CONTEXT.md` exactly: Campaign, SKU Family, Rolling Program, Minimum Campaign Size, Gauge Floor, Planned Stock, Estimate, Order, Distributor.

**Out of scope by standing constraint:** finish/GI. Everything below is black ERW. Raw material (coil width, coil spec, order-by dates) is in scope and is treated as a first-class campaign parameter, not an afterthought.

---

## 1. Summary — the answer in 10 lines

1. A Campaign is defined by a **roll set**, and a roll set is defined primarily by **section geometry** (OD for round; the mother-round OD for square/rectangular). Everything else is set inside that tooling.
2. **Gauge is the sequencing axis inside a Campaign, not because it is free, but because it is adjustable** — "threading a new strip with a different thickness often uses the same rolls with some adjustments" ([Xiris](https://blog.xiris.com/blog/3-ways-to-improve-tube-and-pipe-mill-changeover)), whereas a section change is a physical tooling swap.
3. But gauge is not unbounded inside a family. One breakdown design covers a **T/D (thickness ÷ diameter) band of roughly 3–8%** ([Roll-Kraft](https://www.roll-kraft.com/technical-resources/the-importance-of-tube-size-to-gauge-thickness-ratio)); outside it, the top breakdown rolls change — "most breakdown sets, regardless of design, will have several top rolls to cover the range of material gauges" ([Roll-Kraft](https://roll-kraft.com/roll-kraft-resources/technical-resources/profit-pointer-for-design-analysis-of-tube-roll-tooling)). **Some gauge steps inside a family row are cheap; the ones that cross the T/D band edge are not.**
4. There is a counter-current worth knowing: on a **versatile edgeform** breakdown, "you can make multiple sizes if the material gauge of each size is the same" and "this tooling design does not require any roll changes" ([Roll-Kraft](https://roll-kraft.com/roll-kraft-resources/technical-resources/profit-pointer-for-design-analysis-of-tube-roll-tooling)). On such a mill the cheap axis is size-at-constant-gauge — the transpose of the assumed rule.
5. **Strip width is a function of both OD and gauge**: `W ≈ π(OD − t) + weld allowance`. So every family × gauge cell has its own slit width and therefore its own coil requirement. Gauge is not a free variable upstream even when it is cheap on the mill.
6. **Grade costs nothing in tooling and something in the coil**: a grade change is a welder/speed re-tune, but it is a different mother coil, so it changes the coil order, not the roll change.
7. Changeover anchors, sourced: conventional fixed tooling **up to a full day**; conventional roll change with a good crew **~60 min**; rafted/quick-change **≤15 min**; OTO automatic on-line tooling change **under 5 min**; APL Apollo DFT reportedly **10 h → 0.5 h** and no roll change for size within the mill range.
8. The published Campaign calendar in this industry is literally a **size × wall-thickness matrix with a frequency band per cell** (Atlas Tube) plus a **section × week grid with a status code and a close date per cell** (Nucor-Yamato). Both artifacts exist and are current; §5 reproduces their structure.
9. **The 2–6 week cycle assumption is confirmed for the runner set and wrong for the tail.** Atlas: 2–6 weeks (regular), 6–12 weeks (subject to accumulation), not-on-schedule (minimum order, inquire). Nucor HSS: 2–4 / 2–6 / 6–8 / 6–10 weeks depending on section.
10. The cut-off that makes a Campaign closeable is **upstream material commitment**, not mill loading: Nucor closes a rolling when "the beam blank casting for that rolling volume has already been placed." The tube analogue is the coil order-by date, which is already in the prototype's `DATA.coil` at 14 days.

---

## 2. The parameter set

Ordered by how much it costs to change. "Changeover cost" is the cost of *transitioning* on this parameter with everything else held constant.

| # | Parameter | Values / range (Indian mid-market ERW) | What physically changes on the mill | Changeover cost | Source |
|---|---|---|---|---|---|
| 1 | **Section shape** | Round / Square / Rectangular | On a conventional mill, the round is made first and then re-formed: the sizing section carries "a series of precision sizing and forming rolls" through "pre-forming, transitional forming, and final shaping". Shape change = sizing/Turks-head tooling swap. On DFT it is a setting. | **Highest** on conventional; near-zero on DFT | [AIS round-to-square](https://www.aistubemill.com/round-to-square-forming-and-sizing-section.html); [US 7,921,688](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7921688) |
| 2 | **Size (OD / section size)** | Round: 15–150 NB (IS 1239). SHS 25×25–150×150, RHS 40×20–200×100 (IS 4923) | Full roll set: breakdown, fin pass, weld box, sizing, Turks head | **Highest** — full day (fixed tooling) to 15 min (rafted) to <5 min (auto cassette) | [US 5,461,896](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5461896); [Formtek](https://blog.formtekgroup.com/tube-mills-quick-change-timing-everything); [Fives/OTO](https://www.fivesgroup.com/steel/tube-mills/oto-tube-mills) |
| 3 | **Gauge / wall thickness** | IS 1239 A/B/C (e.g. 40 NB = 2.6 / 3.2 / 4.0 mm); IS 4923 explicit walls 1.6–4.8+ mm | Roll gaps, fin-pass depth, welder power, mill speed. Top breakdown roll swaps **only** when the new gauge leaves the tooling's T/D band | **Low inside the band; medium across it** | [Xiris](https://blog.xiris.com/blog/3-ways-to-improve-tube-and-pipe-mill-changeover); [Roll-Kraft T/D](https://www.roll-kraft.com/technical-resources/the-importance-of-tube-size-to-gauge-thickness-ratio); [Roll-Kraft profit pointer](https://roll-kraft.com/roll-kraft-resources/technical-resources/profit-pointer-for-design-analysis-of-tube-roll-tooling) |
| 4 | **Strip / slit width** | Derived, not chosen: `π(OD − t) + weld allowance`; ERW weld allowance 1–3 mm | Nothing on the mill — but it must already be slit. A wrong slit width stops the Campaign dead. | **Zero on the mill, high upstream** — it drives the slitting plan and the coil order | [Roll-Kraft calculator inputs](https://www.roll-kraft.com/roll-kraft-resources/strip-width-calculator-for-tube-mills-pipe-mills-and-tube-and-pipe-equipment); [SteelOnTheNet planner](https://www.steelonthenet.com/tools/large-diameter-pipe-planner.php) |
| 5 | **Mother coil width & spec** | HR coil to ~1500 mm wide, 2–10 mm; Indian slitting lines quoted 1250–2000 mm, 1.6–6 mm, 25–35 MT coils | Nothing on the mill. Determines how many strips share a coil and the trim loss. | **Zero on the mill; sets the procurement lead time** | [Hertz Group](https://www.hertzgroup.in/hr-coil-slitting-machines.html); [SRJ Steel](https://srjsteel.in/hr-coil-seo/) |
| 6 | **Steel grade** | YSt 210 / 240 / 310 (IS 4923); IS 1239 nominal; Fe 330/410/490 (IS 3589) | No tooling. Welder settings, forming pressure, speed, springback compensation re-tune. Different coil. | **Low on the mill; changes the coil** | [Roll-Kraft mill configuration](https://www.roll-kraft.com/roll-tooling/tubespipes/tube-and-pipe-roll-tooling-design-tube-roll-design-pipe-roll-design/mill-configuration-comparison) |
| 7 | **Standard / specification** | IS 1239 Pt 1, IS 4923, IS 3601, IS 3589; ASTM A500 / A513 / A1085 | Usually nothing physical — same geometry, different acceptance criteria, marking and BIS licence. Occasionally forces a grade or tolerance change. | **Near zero physically; a compliance gate** | [Atlas availability chart](https://www.atlastube.com/wp-content/uploads/2018/02/HSS-Availability-Chart.pdf) (one chart covers A513/A1085/A500/A252/G40); brief 03 §1.1 |
| 8 | **Length** | 6.0 m standard; 5.8 / 6.1 / 12 m; custom cut | Flying cut-off length setting | **Near zero** — a setpoint | [synthesized] from cut-off being an inline programmable stage |
| 9 | **End finish / downstream ops** | Plain / bevelled / threaded+socketed (IS 1239 screwed), swaged | Nothing on the mill — a separate downstream queue | **Zero on the mill; a second queue** | brief 03 §1.2 |
| 10 | **Weld-seam position (RHS only)** | Which of the two dimensions carries the seam | Orientation through the shaping section | Low, but it is a real SKU attribute: "For rectangular sections, the weld seam is located on the first dimension listed for each size" | [Atlas](https://www.atlastube.com/wp-content/uploads/2018/02/HSS-Availability-Chart.pdf) |

### 2.1 The strip-width formula, worked

`W = π × (OD − t) + a`, where `a` = weld/edge allowance, 1–3 mm for ERW. Mid-wall neutral axis, so **the same OD at a different gauge needs a different slit width**.

| SKU | OD (mm) | t (mm) | π(OD − t) | + a = 2 mm | Slit width |
|---|---|---|---|---|---|
| 40 NB × 2.6 | 48.3 | 2.6 | 143.6 | | **145.6 mm** |
| 40 NB × 3.2 | 48.3 | 3.2 | 141.7 | | **143.7 mm** |
| 40 NB × 4.0 | 48.3 | 4.0 | 139.2 | | **141.2 mm** |
| 50 NB × 3.2 | 60.3 | 3.2 | 179.4 | | **181.4 mm** |
| 50 NB × 3.6 | 60.3 | 3.6 | 178.1 | | **180.1 mm** |

*(Brief 01's worked example used 146 mm and 183 mm for 40 NB and 50 NB. The formula gives 143.7 and 181.4 at Medium class. The difference is the weld allowance assumption — 146 implies a ≈ 4.3 mm. Flag for the client: **the actual allowance is mill-specific master data and must be captured, not calculated.**)*

For square/rectangular on a conventional mill, the strip is formed to a **mother round** first. Neutral-line perimeter of an SHS of side `B`, wall `t`, mid-corner radius `r`:

`P = 4(B − t) − 8r + 2πr`, and mother-round `OD_m = P/π + t`.

**SHS 100×100 × 4.0, outer corner radius 8 mm (2t), r = 8 − 2 = 6 mm:**
`P = 4(96) − 48 + 37.7 = 373.7 mm` → strip width ≈ **375.7 mm**, mother round OD ≈ **122.9 mm**.

This is why a plant's mill capability is stated in **round OD range** even for a plant that sells mostly hollow sections — the mill limit is the mother round. Mill designations follow this: ERW60 (19–63 mm OD, 0.8–3.5 mm), ERW76 (22–76, 0.9–4.0), ERW127 (48–127, 0.7–3.0), ERW219 (89–219, 3.0–8.0), ERW325 (140–325, 5.0–12.0) ([PipeTubeMill](https://www.pipetubemill.com/product/erw-219-tube-mill-machine/)); Danieli quotes 12–660 mm OD and 0.5–25.4 mm wall across its ERW line range ([Danieli](https://www.danieli.com/en/products/processes-technologies/product-lines/erw-electric-resistance-welded-tube-mills_26_38.htm)).

### 2.2 The T/D band — the constraint that bounds a gauge ladder

Roll-Kraft: *"The 'normal' and easy range of a T/D ratio is between 3% and 8% for any style of breakdown design."* Below 2% the failure mode is **edge buckling** and needs a "W" or versatile-edgeform design; above 8–10% the failure modes are **edge damage, flat spots, and faster fin-pass wear** because "the thicker strip requires a lot of forming pressure."

Computed for the families this project already uses:

| Family | Reference OD | 2.0 | 2.6 | 3.2 | 3.6 | 4.0 | 4.8 |
|---|---|---|---|---|---|---|---|
| 40 NB Round | 48.3 | 4.1% | 5.4% | 6.6% | 7.5% | **8.3%** | — |
| 50 NB Round | 60.3 | 3.3% | 4.3% | 5.3% | 6.0% | 6.6% | 8.0% |
| 100×100 SHS | 122.9 (mother) | **1.6%** | **2.1%** | **2.6%** | 2.9% | 3.3% | 3.9% |
| 50×50 SHS | ~62 (mother) | 3.2% | 4.2% | 5.2% | 5.8% | 6.5% | 7.7% |

**Read:** 40 NB × 4.0 sits *above* the easy band; the whole light-gauge end of 100×100 SHS sits *below* it. Cells in bold are the ones where a top-breakdown-roll swap is plausible. **[synthesized rule]:** flag any family × gauge cell whose T/D falls outside 3–8% as a **band-edge cell** and give it a higher changeover cost than an in-band gauge step, and a higher Gauge Floor.

---

## 3. The changeover cost matrix

Sourced anchors first, then the matrix built on them.

| Mechanism | Time | Source |
|---|---|---|
| Conventional fixed tooling, full size change | *"may often require a full day"* — historically pushed mills to "run large quantities of material and overstock on single sizes" | [US 5,461,896](https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5461896) |
| Conventional roll change, experienced crew, ≤2″ roll shafts | *"can be done in less than an hour"* / *"about 60 minutes"* | [Formtek — conventional vs rafted](https://blog.formtekgroup.com/conventional-vs.-rafted-changeovers-in-tube-mills); [Formtek — quick change](https://blog.formtekgroup.com/tube-mills-quick-change-timing-everything) |
| Rafted mill with automated universal shaft disconnects | *"changeover times of 15 minutes or less are possible"* | [Formtek](https://blog.formtekgroup.com/tube-mills-quick-change-timing-everything) |
| OTO / Abbey automatic on-line tooling change & adjustment | *"under 5 minutes"*; cassettes prepared and adjusted **offline** without interrupting production | [Fives / OTO](https://www.fivesgroup.com/steel/tube-mills/oto-tube-mills) |
| Quick roll-change generally; "no-roll-change" stands | 30–90 min; multi-function stands <15 min | brief 01, [AIS](https://www.aistubemill.com/news/how-to-choose-the-right-erw-tube-mill-for-your-business-in-2025.html) |
| APL Apollo DFT | *"any size, included in the mill range, without roll change"*; line changeover reported **10 h → 0.5 h**; direct material saving 2–10% | [APL Apollo DFT blog](https://new.aplapollo.com/resource-center/blogs/apollo-direct-forming-technology-dft-bringing-the-cutting-edge-italian-technology-for-the-first-time-in-india) (roll-change claim); 10 h→0.5 h and 2–10% via [Trade Brains](https://tradebrains.in/apl-apollo-tubes-how-product-innovation-made-it-indias-structural-steel-leader/) — **secondary, verify** |
| Gauge change at constant OD | *"threading a new strip with a different thickness often uses the same rolls with some adjustments"* | [Xiris](https://blog.xiris.com/blog/3-ways-to-improve-tube-and-pipe-mill-changeover) |
| Setup/tuning time reduction from weld monitoring | *"more than half"* | [Xiris](https://blog.xiris.com/blog/3-ways-to-improve-tube-and-pipe-mill-changeover) |

**The matrix.** Times are **[synthesized]** midpoints for a conventional Indian mid-market mill with partial quick-change, calibrated to the anchors above. They are placeholders to be replaced by the client's own changeover log — the *structure* is the deliverable, not the numbers.

| From → To | What changes | Mill time | Setup scrap | Class |
|---|---|---|---|---|
| Nothing (same SKU, next coil) | Coil join | 2–5 min | ~1 coil-end | **Free** |
| Length only | Cut-off setpoint | 0–5 min | nil | **Free** |
| Standard only (IS 1239 → IS 3601, same geometry & grade) | Marking, paperwork, BIS lot | 0–10 min | nil | **Free** |
| Grade only (YSt 210 → YSt 310, same size & gauge) | Welder power, speed, springback; **different coil** | 15–30 min | 1 tube length + weld dial-in | **Cheap** |
| Gauge, in-band (40 NB 2.6 → 3.2) | Roll gaps, fin depth, welder, speed; **different slit width** | 20–45 min | 2–5 tube lengths | **Cheap** |
| Gauge, band-edge (40 NB 3.2 → 4.0, T/D 8.3%) | As above **+ top breakdown roll swap** | 60–120 min | 5–10 lengths | **Medium** |
| Size within the same tooling family (50×50 → 60×60 on a range-tooled mill) | Sizing / Turks head only | 60–120 min | 5–10 lengths | **Medium** |
| Size, full roll set (40 NB → 80 NB) | Breakdown + fin + weld box + sizing | 3–8 h conventional; 15–60 min rafted | 10–25 lengths | **Expensive** |
| Shape (round → SHS at same mother OD) | Sizing/Turks-head section re-tooled | 2–6 h conventional; setpoint on DFT | 10–20 lengths | **Expensive** |
| Mill class (move family to a different mill) | Everything, plus re-qualification | Half shift+ | — | **Expensive** |

**The decision rule this yields [synthesized]:** rank the transition classes Free < Cheap < Medium < Expensive and sequence so that the number of Expensive transitions per cycle equals the number of families run, and no more. Everything else is ordering *within* a family.

---

## 4. Sequencing rules — stated as implementable logic

### 4.0 The shape of the problem

Formally this is a **capacitated lot-sizing and scheduling problem with sequence-dependent setups** (GLSP class) — lot size and sequence cannot be decided separately because "the close relationship between lot sizing and scheduling — mainly due to significant sequence-dependent setups — forces both decisions to be made simultaneously" ([Copil/Gicquel literature](https://www.sciencedirect.com/science/article/abs/pii/S0377221714004251)). We are not solving it optimally; we are encoding the greedy heuristic the industry actually uses.

### R1 — Eligibility (per plant, per mill)

```
eligible(mill, family, gauge) :=
     family.mother_OD    ∈ [mill.OD_min,    mill.OD_max]
 AND gauge               ∈ [mill.wall_min,  mill.wall_max]
 AND family.shape        ∈ mill.shapes            -- round-only mills exist
 AND family.standard     ∈ plant.bis_licences     -- compliance gate, not physics
```
**Input:** mill capability master (OD range, wall range, shapes, max speed, t/h by gauge). **Output:** the eligible (mill × family × gauge) set. **Cadence:** master data; changes on capex.
> This is the `04-plant-mill-configuration.md` matrix that ADR-0001 records as missing. **Nothing in §4 runs without it.** The ADR is right that an added family row is "an assertion by the planner, not a validated plan."

### R2 — Demand aggregation to the cell

```
demand(family, gauge) := Σ confirmed Orders + Σ Estimates,   both at face value
cell_qty  := demand(family, gauge) × (1 + yield_uplift)  + Planned Stock
row_qty   := Σ over gauges of cell_qty
```
Yield uplift, Planned Stock and deferred demand are **never netted** (CONTEXT.md; ADR-0001 identity `deferred + short − uplift − stock = demand − planned`).

### R3 — Level 1: run or defer the family (decided on SIZE)

```
IF row_qty ≥ MinimumCampaignSize(family, plant)  → RUN
ELSE                                              → DEFER to next cycle
```
Rationale, sourced: the Minimum Campaign Size exists because the size change is the Expensive transition. Nucor formalises exactly this as **SA — Subject to Accumulation**: *"Typically, this is only used for sections that are rolled less frequently. If the mill doesn't get orders over a certain threshold, that rolling may be skipped."* Atlas's amber band carries **minimum orders of 15–30 tons**.

### R4 — Level 2: which gauges run inside the running family (decided on GAUGE)

```
FOR each gauge g in family:
    floor := GaugeFloor(family, g)
    IF T/D(family, g) ∉ [3%, 8%]:  floor := floor × band_edge_multiplier   -- [synthesized]
    IF cell_qty(g) ≥ floor → make;  ELSE → drop to next cycle
```
This is the rule the prototype already discovered empirically: 40 NB Round plans 800 t against 780 t of demand and looks healthy, but its 2.0 mm (38 t) and 4.0 mm (32 t) lots fall under the 40 t floor and are never made — **real unmet demand 303 MT, not 233** (`17-campaign-planning-screen.md`). The T/D refinement above says the 4.0 mm miss is *structurally* likelier than the 2.0 mm miss, because 4.0 mm on 48.3 OD is a band-edge cell.

### R5 — Gauge ladder direction

**Sourced fact:** the fin passes "will have more work to do with heavier gauges … and will wear much faster than with lighter gauges" ([Roll-Kraft T/D](https://www.roll-kraft.com/technical-resources/the-importance-of-tube-size-to-gauge-thickness-ratio)).

**[synthesized rule]:** run the ladder **thin → thick** within a family. Two reasons: (a) tooling wear accumulates monotonically, so the heavy pass is last before the tooling comes out anyway; (b) the light gauges are the ones at risk of edge buckling and want the tooling at its cleanest. This is *not* a published rule and directly answers the open question in `12-campaign-planning-logic.md` ("is the ladder always one-directional?") — **answer: prefer thin→thick, allow the planner to reverse it, log the reversal as an Override.** ADR-0001 already encodes thin→thick as column order (2.0 → 4.0); the research supports keeping it.

### R6 — Family sequencing across the cycle

```
sort families by (mother_OD)  ascending, within shape blocks
```
"Schedule similar products or product diameters in groups to reduce the frequency of roll and roll-stand changes" ([Xiris](https://blog.xiris.com/blog/3-ways-to-improve-tube-and-pipe-mill-changeover)). Adjacent ODs share more of the roll set and more of the setup knowledge. **[synthesized addition]:** run all rounds, then all shapes, on a conventional mill — the round→shape re-tooling of the sizing section should happen once per cycle, not once per family.

### R7 — The tie-break stack, in order [synthesized]

When two families are both eligible for the same slot:
1. **Coil availability** — a family whose slit coil is in the yard beats one whose coil is on order. This is the hard constraint; the rest are preferences.
2. **Stock cover** — days-of-cover at the depot, ascending. The family closest to stockout goes first.
3. **Cycle age** — weeks since this family last ran, descending. Prevents permanent deferral (see §10).
4. **Changeover distance** — nearest OD to the previous family.
5. **Order vs Estimate mix** — a family backed mostly by confirmed Orders beats one backed mostly by Estimates.

Note the ordering: changeover distance is *fourth*, not first. Pure changeover minimisation starves the tail; the cycle-age term is what makes the Rolling Program a *program* rather than a greedy queue.

### R8 — Runner / repeater / stranger overrides the rules

| Class | Definition (brief 01 §5) | Campaign rule | Sourced analogue |
|---|---|---|---|
| **Runner** | high volume, low CV | Gets a slot **every cycle**. R3 is not evaluated — the family runs whether or not it clears Minimum Campaign Size, because it always does. Gauge Floor still applies per cell. | Atlas green: "rolled every 2–6 weeks" |
| **Repeater** | periodic demand | R3 evaluated every cycle. Defers when short. | Nucor HSS "rolled every 6–8 weeks" |
| **Stranger** | erratic / low volume | R3 replaced by **accumulate**: the family does not enter the calendar at all until accumulated demand clears Minimum Campaign Size, then it is inserted into the next open cycle. | Nucor **SA**; Atlas amber "subject to accumulation", 15–30 t minimum orders |

This is a real structural difference, not a label: a Stranger has **no scheduled window** and therefore no promise date until it accumulates. The Rolling Program must be able to show a family with no date.

---

## 5. The Campaign calendar as a published artifact

Two published artifacts exist and they are **different shapes doing different jobs**. Both were read directly.

### 5.1 Atlas Tube — the availability matrix (*what exists and how often*)

Structure, from the current chart: **three separate tables — Squares, Rectangles, Rounds.** Rows = size (`4 x 2`, `6 x 6`, OD `2.375`). Columns = **nominal wall thickness** (.065 .083 .100 .120 .125 .134 .188 .238 .250 .313 .375 .500 .625 .750 .875 1.000 in.). Cell = weight per foot if the SKU exists, `—` if it does not. Cell colour = frequency band.

Legend, verbatim:
- *"Rolled every 2–6 weeks."*
- *"Rolled every 6–12 weeks; some sizes may be subject to accumulation."*
- *"Not rolled regularly; sizes subject to minimum orders. Inquire."*

Plus two notes that are pure master data: *"Includes ASTM A513, ASTM A1085, ASTM A500, ASTM A252 and CSA G40"* (one geometry serves several standards) and *"For rectangular sections, the weld seam is located on the first dimension listed for each size."*

Example rows (squares, in., weight lb/ft):

| Size | .120 | .125 | .134 | .188 | .250 | .313 | .375 |
|---|---|---|---|---|---|---|---|
| 2 × 2 | 3.068 | 3.060 | 3.401 | 4.320 | 5.410 | — | — |
| 3 × 3 | 4.580 | 4.750 | 5.222 | 6.870 | 8.810 | 10.580 | 12.170 |
| 4 × 4 | 6.330 | 6.460 | 6.890 | 9.420 | 12.210 | 14.830 | 17.270 |
| 6 × 6 | — | 9.860 | — | 14.530 | 19.020 | 23.334 | 27.480 |
| 12 × 12 | — | — | — | — | 39.430 | 48.860 | 58.100 |

**This is a size × gauge matrix with a frequency band per cell.** It is the closest published thing to ADR-0001's screen, and it validates the axes. Note what it does *not* have: a time axis.

### 5.2 Nucor-Yamato — the roll/cast schedule (*what runs which week*)

Structure, read from the live file dated **7/30/2026 4:00 PM**: rows = **section grouping**, columns = **week beginning** (10 weeks: 2-Aug … 4-Oct) with a fiscal-week number, plus a `Mill #` column and a `Projected Next Weeks` column. Cell content = fiscal week + status code + close date.

Verbatim legend: *"Status: C - Closed; E - Controlled; I - Inquire; O - Open; PS - Planned Stock; SA - Subject to Accumulation"*, *"Close Dates for all items, if available, are shown immediately behind the status of the book week"*, *"All sections close at 4 PM CST on the date indicated. Inquire items can close at any time without notice."*

Example rows as they actually appear:

```
W14x8x43-53      1   39  C  8/31   39  C  8/31   ...   12/27-1/3 Wks   I
W18x7 1/2x41-71  1   40  C  8/31                 ...   1/3-1/10 Wks    I
HP12x12x53-84    1   37  I  8/17   37  I  8/17   ...   12/27-1/3 Wks   SA
W8x6 1/2x24-28   1   30  C        30  C         ...   11/22-11/29 Wks SA
W12x4x16-22      1                                     TBA
```

Four things to steal:

1. **The row is a tooling group, not a SKU.** `W14x8x43-53` is one depth × flange width covering weights 43 to 53 lb/ft — i.e. **one roll set spanning a ladder of thicknesses**. This is the structural-steel form of exactly the family × gauge relationship this project models. It is the strongest external evidence that the family row is the right unit.
2. **`Mill #` is on the row.** Capability allocation is published, per family, in the same artifact.
3. **`Projected Next Weeks` is a first-class column.** For a family with no slot, the answer is `TBA` — and it is shown, not hidden.
4. **Shutdowns are inline** (`SHUTDOWN 11/29-12/6`) and inter-plant moves are footnoted: *"W12x4, W8x5.25, W6x6, C15, and C12 tons will shift temporarily from NYS to Nucor Steel Berkeley."*

### 5.3 Cadence and cut-off logic

- Roll cycle: *"a typical roll cycle takes six to seven weeks"* for beams; schedule horizon 8–10 weeks; updated weekly.
- **Why a rolling closes:** *"C stands for CLOSED. This means that rolling is no longer accepting new orders. Either the rolling is full or the beam blank casting for that rolling volume has already been placed."* Steel is cast *"approximately two weeks prior to rolling."*
- `I` = *"approaching its limit"*; `PS` = *"the mill is planning to roll extra stock for inventory"* — so a closed rolling with PS may still yield material; `E` = controlled, *"rare and typically only occurs during the highest-demand markets."*

**The transferable cut-off formula [synthesized, structurally sourced]:**

```
cut_off_date(family, cycle)
   = campaign_start_date
   − coil_lead_time            -- prototype: 14 days
   − slitting_and_transit      -- assume 2 days
   − order_desk_buffer         -- assume 1 day
```
With the prototype's own `DATA.coil` figures (14-day lead time, 96% yield, ₹46,500/MT), a Campaign starting Monday 7 Sept closes to new Orders on **Friday 21 Aug**. After that the cell is `C`. If the planner deliberately built Planned Stock into the cell, it shows `C PS` and the order desk can still sell against it — which is precisely the CONTEXT.md definition of Planned Stock ("tonnes planned for production against no order and no estimate"). **Nucor's `PS` and this project's Planned Stock are the same object; the status code is free.**

**Status mapping for the P&T Rolling Program [synthesized]:**

| Status | Condition | Distributor-facing meaning |
|---|---|---|
| `O` Open | cell planned, today < cut-off, booked < planned | Order now |
| `I` Inquire | booked ≥ 85% of planned, or < 3 days to cut-off | Call the desk |
| `C` Closed | today ≥ cut-off **or** coil ordered against this cell | Next cycle |
| `C PS` | closed, but Planned Stock in the cell | Ask — stock exists |
| `SA` Accumulating | family below Minimum Campaign Size | No date yet |
| `—` | cell not eligible on any mill at this plant | Does not exist here |

---

## 6. Demand and inventory inputs to the Campaign

Per `12-campaign-planning-logic.md`, estimate reliability scoring is out of scope, so **Estimates enter at face value**. That removes the bias correction in brief 01's addendum §1 but not the need for an aggregate guard.

| Input | Grain | Source | Cadence | Feeds |
|---|---|---|---|---|
| Confirmed Orders | SKU | order book | continuous | `cell_qty`, and the R7 tie-break |
| Estimates | SKU Family | Distributor, monthly | D22–D27 (brief 03 §2.4) | `row_qty`, Level 1 |
| Depot / plant closing stock | SKU | plant + depot | weekly | stock cover in R7 |
| Target days of cover | Family × class | policy | quarterly | Planned Stock quantity |
| Coil stock by spec | grade × width × gauge | yard + on-order | daily | R7 tie-break 1, hard constraint |
| Coil lead time | supplier | contract | — | cut-off date |
| Mill capability & rate | mill | master | — | R1, capacity |
| Changeover matrix | (from-cell, to-cell) | mill log | — | §3, sequence cost |
| Minimum Campaign Size | family × plant | policy | quarterly | R3 |
| Gauge Floor | family × gauge | policy | quarterly | R4 |

**Inventory target → Planned Stock [synthesized]:**

```
target_stock(family,gauge) = forecast_daily_offtake × (cycle_length_days + safety_days)
Planned Stock             = max(0, target_stock − projected_stock_at_campaign_start)
```
Because the family only runs once per cycle, safety stock must cover **the whole inter-Campaign gap plus lead time**, not a replenishment lead time. This is the single biggest inventory consequence of campaign production and the reason a 2-week cycle and a 6-week cycle are not marginally different — they are 3× different in working capital on that family.

**Aggregate guard on face-value Estimates [synthesized, proposed]:** at plant level, if `Σ Estimates > 1.25 × trailing-3-month Primary Sale`, do not silently plan to it. Surface the excess as a single Deviation on the Campaign screen with the implied coil spend, and let the planner accept it as Planned Stock or trim it as an Override. This is an aggregate plausibility band, not a per-Distributor reliability score, so it stays inside the scope decision.

---

## 7. Multi-plant / multi-mill allocation

**The sourced principle: mills differ by capability, and capability is published per row.** Nucor-Yamato puts `Mill #` (1 or 2) on every section row; Atlas colour-codes availability without naming the plant but notes green sizes are rolled "at one of their North American production facilities."

**Allocation rule [synthesized]:**

```
1. eligibility  : R1 filters mills by OD range, wall range, shape
2. if exactly one eligible mill        → assign
3. if several:
     a. prefer the mill that ran this family last cycle   (setup knowledge, tooling in stores)
     b. else prefer the mill whose current campaign OD is nearest  (R6 distance)
     c. else prefer the least-loaded mill by committed hours
4. if no mill at the home plant is eligible or free:
     → the family is a candidate for inter-plant move, which is a PLANNER DECISION, not automatic
```

Step 4 is where the ADR's known gap lives. ADR-0001 records the "aggregate across plants" answer as *"available and unbuilt"*, with Hosur's stranded 233 MT and Bhiwadi's idle 120 MT as the motivating case. Nucor's footnote shows the industry's answer is **a published, explicit, temporary move** — *"tons will shift temporarily from NYS to Nucor Steel Berkeley"* — not a silent optimiser. **Recommendation: if this is ever built, build it as an Override with the displaced value recorded, exactly as CONTEXT.md defines Override, and publish it as a note on the Rolling Program.** Do not build it as an automatic pooling rule.

**A freight caveat.** Brief 03 puts freight at 4–8% of product value. Moving a 233 MT campaign from Hosur to Bhiwadi is not free — at ~₹60,000/MT that is ₹1.4 crore of goods carrying perhaps ₹6–11 lakh of extra freight if the market is Hosur's. The min-tonnage saving must be netted against that before the move is offered.

---

## 8. Worked example — one plant, one cycle

**Setup.** Plant Bhiwadi. Two mills. Fortnightly cycle, 10 working days, 2 shifts.

- **Mill 1 — ERW76 class:** mother OD 22–76 mm, wall 0.9–4.0 mm, round + square. Net 8 t/h.
- **Mill 2 — ERW127 class:** mother OD 48–127 mm, wall 1.6–4.8 mm, round + square + rect. Net 12 t/h.
- Minimum Campaign Size 220 MT (Mill 2 families), 150 MT (Mill 1 families). Gauge Floor 40 MT; band-edge multiplier 1.5× → 60 MT.
- Changeover: full size change 4 h; in-band gauge change 0.5 h; band-edge gauge change 1.5 h; round→shape re-tool 3 h.
- Coil lead time 14 days, slitting + transit 2 days, desk buffer 1 day. Cycle starts **Mon 7 Sept** → **cut-off Fri 21 Aug**.

**Demand into cells (Orders + Estimates at face value, +uplift):**

| Family | Mother OD | 2.0 | 2.6 | 3.2 | 4.0 | 4.8 | Row MT | Min | Level 1 |
|---|---|---|---|---|---|---|---|---|---|
| 40 NB Round | 48.3 | 38 | 210 | 455 | 32 | — | **735** | 220 | RUN |
| 50 NB Round | 60.3 | — | 95 | 180 | 120 | 45 | **440** | 220 | RUN |
| 50×50 SHS | 62 | 85 | 130 | 70 | — | — | **285** | 150 | RUN (Mill 1) |
| 100×100 SHS | 122.9 | 34 | 96 | 145 | 88 | — | **363** | 220 | RUN |
| 80×40 RHS | 76 | 42 | 55 | 38 | — | — | **135** | 150 | **DEFER — short by 15** |

**Level 2 — Gauge Floor with the T/D refinement:**

| Cell | MT | T/D | In band? | Floor | Verdict |
|---|---|---|---|---|---|
| 40 NB × 2.0 | 38 | 4.1% | yes | 40 | **drop, short by 2** |
| 40 NB × 2.6 | 210 | 5.4% | yes | 40 | make |
| 40 NB × 3.2 | 455 | 6.6% | yes | 40 | make |
| 40 NB × 4.0 | 32 | 8.3% | **no** | **60** | **drop, short by 28** |
| 50 NB × 4.8 | 45 | 8.0% | edge | 60 | **drop, short by 15** |
| 100×100 × 2.0 | 34 | 1.6% | **no** | **60** | **drop, short by 26** |
| 100×100 × 2.6 | 96 | 2.1% | **no** | **60** | make |
| all others | — | — | — | 40 | make |

**Unmet demand this cycle:** 15 (deferred family) + 38 + 32 + 45 + 34 = **164 MT**, of which **111 MT is invisible at family level** — the families it sits in all "ran". This reproduces the prototype's finding at a different scale and is the single most important number on the screen.

**Sequence — Mill 2 (ERW127), rounds then shapes, OD ascending, gauge thin→thick:**

| # | Cell | MT | Slit width | Run h @12 t/h | Changeover before | Cum. h |
|---|---|---|---|---|---|---|
| 1 | 40 NB × 2.6 | 210 | 145.6 | 17.5 | 4.0 (size-in) | 21.5 |
| 2 | 40 NB × 3.2 | 455 | 143.7 | 37.9 | 0.5 (in-band) | 59.9 |
| 3 | 50 NB × 2.6 | 95 | 181.4 | 7.9 | 4.0 (size) | 71.8 |
| 4 | 50 NB × 3.2 | 180 | 179.4 | 15.0 | 0.5 | 87.3 |
| 5 | 50 NB × 4.0 | 120 | 176.8 | 10.0 | 0.5 | 97.8 |
| 6 | 100×100 × 2.6 | 96 | ~377 | 8.0 | 3.0 (round→shape) + 4.0 (size) | 112.8 |
| 7 | 100×100 × 3.2 | 145 | ~376 | 12.1 | 0.5 | 125.4 |
| 8 | 100×100 × 4.0 | 88 | ~376 | 7.3 | 0.5 | 133.2 |

**Mill 2 totals: 1,389 MT of tube, 115.7 running hours, 17.5 changeover hours — changeover ratio 13.1%.**

Sanity checks that matter:
- **Coil:** 1,389 ÷ 0.96 = **1,447 MT** of slit coil across **8 slit widths** — one per cell, exactly as the prototype's `DATA.coil` assumes. Six distinct mother-coil specs if 40 NB and 50 NB gauges share grade and coil gauge.
- **Cut-off:** all eight cells close **Fri 21 Aug**. Cells 1–2 (40 NB, the Runner) may already show `C PS` because Planned Stock was planned in.
- **Where the sequence pays:** running all rounds before the shape block spends the 3 h round→shape re-tool **once**. Interleaving 100×100 between the two round families would have cost 6 h and pushed the changeover ratio to 17%.
- **Where it costs:** 40 NB × 4.0 (32 MT) is dropped *and* 40 NB is running. A distributor will call about this. The screen must show `32 / 60, short by 28 — band-edge gauge`, not "deferred".

**Rolling Program row published from this** (one plant, two mills, six-week view):

| Family | Mill | Wk 37 (7 Sep) | Wk 38 | Wk 39 | Wk 40 | Wk 41 | Wk 42 | Next |
|---|---|---|---|---|---|---|---|---|
| 40 NB Round | 2 | `C` 21-Aug | | `O` 4-Sep | | `O` 18-Sep | | 21-Sep |
| 50 NB Round | 2 | `C` 21-Aug | | `I` 4-Sep | | `O` 18-Sep | | 21-Sep |
| 100×100 SHS | 2 | `C` 21-Aug | | | `O` 11-Sep | | `O` 25-Sep | 28-Sep |
| 50×50 SHS | 1 | `C` 21-Aug | | `O` 4-Sep | | `O` 18-Sep | | 21-Sep |
| 80×40 RHS | 1 | — | | `SA` | | `SA` | | **TBA** |

---

## 9. What this means for ADR-0001 (family × gauge matrix)

**Verdict: the research supports the matrix, and refines three of its cells.**

**Supported**
- The axes are the industry's own. Atlas publishes size (rows) × wall thickness (columns) with a frequency band per cell — a family × gauge matrix, in print, for a competitor's whole portfolio. Nucor's row `W14x8x43-53` is one roll set spanning a weight ladder: the same object.
- Thin→thick column order is right. Fin passes wear faster on heavy gauge, so heavy last is defensible on tooling grounds (R5), and the ADR's "sequence is carried by column order" survives.
- "Every gauge in a family runs inside the same campaign window" — the ADR's justification for putting the window in the row header — is exactly what the Atlas chart asserts by giving one frequency band to a whole row.
- Cell = planned MT is the right payload. The coil requirement derives per cell (§8: 8 cells → 8 slit widths), which is what makes the Coils screen reconcile rather than restate.

**Refined**
1. **Gauge steps are not uniform in cost.** The ADR treats the row as a flat ladder. The T/D band (§2.2) says the outer columns of a row can cost 2–4× the inner ones and can require a top-breakdown-roll swap. **Proposal: mark band-edge cells visually and give them a higher Gauge Floor.** This is a per-cell attribute the matrix has room for and currently does not carry.
2. **The Gauge Floor question the prototype raised now has a physical explanation.** 40 NB × 4.0 missing its floor is not bad luck — it is a T/D 8.3% cell that a mill would rather not run in a short lot anyway. That is a better sentence to put on screen than "short by 28".
3. **Strip width is per cell, not per row.** 40 NB needs 145.6 / 143.7 / 141.2 mm at 2.6 / 3.2 / 4.0. The matrix should be able to surface slit width in the Basis rail alongside demand, because **the coil order-by date is what actually closes the cell** (§5.3), and it is a cell-level fact.

**Challenged — one thing, and it is conditional**
- If any of the client's mills use a **versatile edgeform** breakdown, the cheap axis inverts: "you can make multiple sizes if the material gauge of each size is the same … this tooling design does not require any roll changes" (Roll-Kraft). On such a mill the natural campaign is **a gauge across several sizes** — a matrix *column*, not a row. The matrix shape still works (it is the same grid) but the **grouping and the minimum-tonnage tests would attach to columns**. **This is a discovery question for the client's mill engineers, and it is cheap to ask: "does a size change at constant gauge require a breakdown roll change on this mill?"** If the answer is no on any mill, ADR-0001 needs a follow-up ADR, not an amendment.
- Same caveat for **DFT-type mills** if any exist in the fleet: with "any size in the mill range without roll change", the family row stops being a tooling boundary and the Minimum Campaign Size for that mill collapses toward the Gauge Floor.

**Not challenged:** ADR-0001's rejection of family × week. §5 shows the industry publishes *both* shapes — Atlas's matrix (no time axis) and Nucor's grid (time axis) — as separate artifacts serving separate audiences. The ADR's screen is the Atlas artifact; the Rolling Program in CONTEXT.md is the Nucor artifact. **They are not competitors and both should exist.**

---

## 10. Open questions and gaps

| # | Question | Why it matters | Who answers |
|---|---|---|---|
| 1 | Does a size change at constant gauge need a breakdown roll change on each mill? | Decides whether campaigns are rows or columns (§9) | Client mill engineers |
| 2 | Actual changeover times by transition class, from the mill log | §3's matrix is calibrated to published anchors, not this plant | Client — one month of shift logs |
| 3 | Actual weld/edge allowance per mill | §2.1 gives 143.7 mm where brief 01 assumed 146 mm; the coil order depends on it | Client — slitting master data |
| 4 | The mill-rate contradiction (~12×) flagged in `17-campaign-planning-screen.md` | Every hour figure in §8 is unverified until settled | Client — mill nameplate + actuals |
| 5 | Per-mill capacity and the `04-plant-mill-configuration.md` capability matrix | R1 does not run without it; ADR-0001 already labels added rows unvalidated | Client — cannot be sourced by an agent |
| 6 | Real Minimum Campaign Size and Gauge Floor per family per plant | The 220/200/40 MT figures are prototype placeholders | Client — plant heads |
| 7 | Is there a **maximum** campaign length (tooling wear, coil-stock cash)? | Nothing found. A very large runner cell may need splitting across cycles | Client |
| 8 | Anti-starvation policy for `SA` families | Without a cycle-age forcing term (R7.3), a Stranger can accumulate forever and no rule says when it is finally run at a loss | Product decision |
| 9 | Whether the Rolling Program is internal-only | `12-campaign-planning-logic.md` leaves this open; the distributor portal is out of scope | Product decision |
| 10 | Grade change cost in practice | No published figure for grade-only transition on an ERW mill; §3 shows an estimate | Client mill engineers |

**Could not source at all:** any Indian tube maker's published rolling programme or campaign calendar — the artifact does not appear to exist publicly in India. The Nucor/Atlas structure is the only readable template, and both are North American structural mills, not IS-standard ERW plants. Treat the *structure* as transferable and every *number* in it as not.

---

## 11. Sources

**Tooling, roll design, and the T/D constraint**
- https://www.roll-kraft.com/technical-resources/the-importance-of-tube-size-to-gauge-thickness-ratio — T/D 3–8% "normal and easy range"; edge buckling below 2%; edge damage, flat spots and faster fin-pass wear above 8–10%.
- https://roll-kraft.com/roll-kraft-resources/technical-resources/profit-pointer-for-design-analysis-of-tube-roll-tooling — versatile edgeform: "multiple sizes if the material gauge of each size is the same", "does not require any roll changes"; "most breakdown sets… will have several top rolls to cover the range of material gauges"; "a limited range of sizes can be made from one set of rolls".
- https://www.roll-kraft.com/roll-tooling/tubespipes/tube-and-pipe-roll-designs/conventional-method — conventional design used "when running multiple tube and pipe sizes… with a T/D ratio between 3-8%".
- https://www.roll-kraft.com/roll-tooling/tubespipes/tube-and-pipe-roll-tooling-design-tube-roll-design-pipe-roll-design/mill-configuration-comparison — fin-pass designs (round, flat oval, high oval, finless) and high-strength material handling.
- https://www.roll-kraft.com/roll-kraft-resources/strip-width-calculator-for-tube-mills-pipe-mills-and-tube-and-pipe-equipment — strip-width calculator inputs: material type, weld diameter, **gage thickness**, design type, number of fin passes — i.e. strip width is gauge-dependent.

**Changeover mechanics and times**
- https://blog.formtekgroup.com/tube-mills-quick-change-timing-everything — "The conventional method takes about 60 minutes"; "changeover times of 15 minutes or less are possible" with rafted/automated shaft disconnects; changeover frequency from monthly to once a shift.
- https://blog.formtekgroup.com/conventional-vs.-rafted-changeovers-in-tube-mills — conventional "less than an hour" with an experienced crew on ≤2″ roll shafts; raft = removable subplate prepared offline.
- https://www.fivesgroup.com/steel/tube-mills/oto-tube-mills — OTO/Abbey quick-change; automatic on-line tooling change and adjustment "under 5 minutes"; cassette rolls prepared, installed and adjusted offline; ERW range 4–460 mm OD, 0.4–18 mm wall.
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/5461896 — changeover "may often require a full day", forcing mills to overstock single sizes/thicknesses.
- https://blog.xiris.com/blog/3-ways-to-improve-tube-and-pipe-mill-changeover — "Schedule similar products or product diameters in groups to reduce the frequency of roll and roll-stand changes"; "threading a new strip with a different thickness often uses the same rolls with some adjustments"; document mill settings per stand/drive/welder; setup and tuning time cut "more than half" with weld monitoring.
- https://www.aistubemill.com/news/how-to-choose-the-right-erw-tube-mill-for-your-business-in-2025.html — quick roll change 30–90 min; no-roll-change stands <15 min.

**Forming route, shapes, and mill capability**
- https://www.aistubemill.com/round-to-square-forming-and-sizing-section.html — round-to-square via pre-forming, transitional forming, final shaping under cold forming.
- https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/7921688 — square-tube forming rolls: upper-lower and left-right pairs, differential shoulder vs side-centre curvature.
- https://www.pipetubemill.com/product/erw-219-tube-mill-machine/ — ERW mill class designations and their OD/wall ranges (ERW60/76/127/219/325).
- https://www.danieli.com/en/products/processes-technologies/product-lines/erw-electric-resistance-welded-tube-mills_26_38.htm — ERW line range 12–660 mm OD, 0.5–25.4 mm wall.
- https://new.aplapollo.com/resource-center/blogs/apollo-direct-forming-technology-dft-bringing-the-cutting-edge-italian-technology-for-the-first-time-in-india — DFT: square/rectangular sections "without any roll changes". *(Company primary source; the 10 h→0.5 h and 2–10% material-saving figures come from secondary coverage — https://tradebrains.in/apl-apollo-tubes-how-product-innovation-made-it-indias-structural-steel-leader/ — and are flagged unverified.)*
- https://aplapollo.com/products/structural-steel-tubes-apollo-dft — DFT product range.

**Strip width and slitting**
- https://www.steelonthenet.com/tools/large-diameter-pipe-planner.php — strip width at mid-wall neutral axis, π(OD − t), weld allowance ERW 1–3 mm.
- https://www.roll-kraft.com/technical-resources/calculating-estimated-strip-widths-roll-formed-cross-sections — blank width = arc length of bends (neutral line) + flats, for roll-formed sections.
- https://www.hertzgroup.in/hr-coil-slitting-machines.html — Indian HR slitting line: 1250–2000 mm strip width, 1.6–6 mm thickness, 25–35 MT coils.
- https://srjsteel.in/hr-coil-seo/ — HR slit coil for ERW pipe & tube mills; HR coil widths to 1500 mm, 2–10 mm.
- https://www.aistubemill.com/news/slitting-line-complete-guide-to-coil-slitting-machines-and-applications.html — ERW mills require accurate strip width, consistent edge quality, stable tension.

**Published rolling programmes (read directly)**
- https://www.atlastube.com/wp-content/uploads/2018/02/HSS-Availability-Chart.pdf — size × wall-thickness matrix, three tables (squares / rectangles / rounds); legend "Rolled every 2–6 weeks" / "Rolled every 6–12 weeks; some sizes may be subject to accumulation" / "Not rolled regularly; sizes subject to minimum orders. Inquire."; multi-standard note; RHS weld-seam-on-first-dimension note.
- https://nucoryamato.com/staticdata/RollCastSchedule.pdf — live roll/cast schedule (read at 7/30/2026 4:00 PM): section rows × 10 week columns, `Mill #`, `Projected Next Weeks`, inline shutdowns, inter-plant shift footnote; status legend "C - Closed; E - Controlled; I - Inquire; O - Open; PS - Planned Stock; SA - Subject to Accumulation"; "All sections close at 4 PM CST on the date indicated. Inquire items can close at any time without notice."
- http://nucor.com/newsroom/how-to-read-the-nucor-yamato-steel-Rolling-schedule — 6–7 week roll cycle; casting ~2 weeks before rolling; "Either the rolling is full or the beam blank casting for that rolling volume has already been placed"; definitions of O / I / C / PS / E / SA including "If the mill doesn't get orders over a certain threshold, that rolling may be skipped".
- https://assets.ctfassets.net/aax1cfbwhqog/3hl4EnMisSSthmdZ0ByjpX/e8dfd43917b6c8c0f00c90f33c209638/2024_Nucor_Hollow_Structural_Steel_HSS_Availability_Tables.pdf — Nucor HSS availability tables (link live; the file would not fetch on this run — frequency bands 2–4 / 2–6 / 6–8 / 6–10 weeks are from Nucor search excerpts and should be re-read directly before being relied on).
- https://www.atlastube.com/atlas-observer/designing-with-hss-a-corporate-overview-of-atlas-tube/ — "shortest rolling cycles in the industry: 2–3 weeks on most items"; Quick Change mill, 2–4 week delivery lead times.

**Quality / yield**
- https://www.thefabricator.com/tubepipejournal/article/tubepipeproduction/inline-gauge-control-in-welded-tube-production--reducing-conversion-losses — "tube wall thickness is almost always over tolerance"; overweight accepted as unavoidable; ASTM A513-85 permitted variation ranges.

**Scheduling theory**
- https://www.sciencedirect.com/science/article/abs/pii/S0377221714004251 — lot-sizing and scheduling with sequence-dependent setups; why lot size and sequence must be decided together.

**Internal**
- `briefs/01-planning-flow.md`, `briefs/03-domain-expertise.md`
- `../03-design-decisions/design-tickets/12-campaign-planning-logic.md`, `17-campaign-planning-screen.md`, `04-plant-mill-configuration.md`
- `../03-design-decisions/0001-campaign-planning-uses-a-gauge-matrix.md`, `CONTEXT.md`

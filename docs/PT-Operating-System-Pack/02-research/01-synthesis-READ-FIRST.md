# Synthesis: What the Research Says the P&T Operating System Should Be

*Ties together the four briefs in `briefs/`. Read this first; go to the briefs for evidence, sources, and worked examples. Compiled 2026-08-01.*

## The one-paragraph verdict

Nothing off-the-shelf does what this OS intends — "distributor estimates → SKU-level demand plan → tube-mill campaign plan → dispatch → deviation flags" for a 250-SKU, multi-plant Indian tube maker at mid-market cost. The evidence supports a **buy-the-edges, build-the-brain** architecture: rent or thinly build the distributor-facing data capture (a DMS-class app; APL Apollo's Sarathi proves the pattern in this exact industry), keep the ERP as the transactional system of record, and **build the middle** — the estimate cycle, forecast rollup with bias correction, campaign calendar, allocation rules, and the deviation engine. Treat the whole thing as a **data-integration project first** (one SKU master, one distributor master, agreed metric definitions), because that is where every studied control-tower build succeeds or dies.

## Where each brief fits

| Brief | What it gives the OS |
|---|---|
| [01-planning-flow](briefs/01-planning-flow.md) | The planning logics: five-layer flow, campaign mechanics and cycle frequency, Nucor-style published rolling program, FVA-disciplined forecast rollup, fair-share/quota allocation, runner/repeater/stranger policy — each with worked numeric examples in the addendum |
| [02-systems-landscape](briefs/02-systems-landscape.md) | Build-vs-buy verdict per layer; what to copy from S&OP suites, metals APS, Indian DMS platforms; what APL Apollo / Tata Steel / JSW actually built |
| [03-domain-expertise](briefs/03-domain-expertise.md) | The domain model: SKU attribute tuple + coding scheme, price-circular decomposition, scheme/claim mechanics, the monthly indent calendar, seasonality, the visibility problem and the distributor data fields that solve it |
| [04-deviations-kpis](briefs/04-deviations-kpis.md) | The monitoring engine: 16-deviation catalog with owners/cadences, exact metric formulas with edge-case coding notes, encoding specs for the 5 priority deviations, threshold and escalation logic |

## Cross-brief convergences (independent agreement — high confidence)

1. **Estimates must be split from orders, and both must be immutable snapshots.** Brief 01 (FVA discipline), 03 (indent calendar, estimate gaming), and 04 (D1 encoding spec: "locked at cutoff date") all require a forward *Estimate* captured and frozen per distributor per SKU-family per month, separate from confirmed *Orders*. This is the single most load-bearing data-model decision.
2. **Allocation must key to trailing offtake, not raw estimates.** Briefs 01 and 04 independently converge on the same anti-gaming rule: fair-share pro-rata to trailing 3-month actual offtake neutralizes indent inflation (worked example in 01's addendum shows a distributor inflating 2.2× and gaining nothing).
3. **The campaign calendar should be a published artifact.** Brief 01's strongest find — Nucor/Atlas Tube publish size-by-week rolling schedules with order cut-offs and Open/Closed status, and distributors book against them. Brief 03 confirms the domain need (an SKU is only made every 2–6 weeks). One artifact operationalizes campaign planning *and* disciplines distributor ordering.
4. **Secondary sales and distributor stock are the visibility crux.** Brief 03 (the industry's chronic blind spot, and the scheme-linked mechanisms that buy the data), brief 04 (D11/D12 are the most diagnostic deviations: >35 stock-days × 2 months = channel stuffing), brief 02 (DMS is the commodity tool that captures it).
5. **Deviations need owners and standing meetings, not dashboards.** Brief 04's central warning (dashboards decay into wallpaper without a named owner and a meeting whose agenda they are) matches brief 02's control-tower finding (visibility without a response mechanism is decoration).
6. **Price circulars drive demand noise.** Brief 03: month-to-month primary sales movement is substantially price-anticipation (restock before hikes, destock on falls), not consumption. Any deviation logic that ignores the circular calendar will misread gaming as demand and vice versa.

## The OS in one flow (with the logic per stage)

```
Distributor estimates (by SKU family, locked at cutoff, D22–27)
  → Forecast rollup: statistical baseline + bias-corrected estimate overrides, FVA-scored   [01 §3, addendum ex.1]
  → Monthly S&OP: demand consensus → constrained supply plan → quotas per region/family    [01 §4]
  → Campaign plan: strip-width grouping, thickness ladder, min campaign tonnage,
    published rolling program with cut-offs; GI as downstream galvanizing batch             [01 §2, addendum ex.3]
  → Allocation & promising: fair-share to trailing offtake; ATP/CTP against the calendar    [01 §3, addendum ex.2]
  → Dispatch → distributor receipt → secondary sales & stock via DMS                        [02 §3, 03 §5]
  → Deviation engine over every arrow above: D1–D16, RAG bands, owners, tiered meetings     [04]
```

## What the domain forces the system to model (non-negotiables)

- **SKU = attribute tuple, never a flat list**: shape × size × wall/class × grade × finish × length × standard, with weight/m and pieces/bundle master data (trade transacts in pieces/bundles; mills and pricing work in tonnes). ~40 size families → 280–300 SKUs is normal math. [03 §1]
- **Pricing is circular-native**: versioned price lists with effective timestamps; base + extras; separate HRC-linked (black) and zinc-linked (GI/GP) drivers; price-protection keyed to stock declarations at the effective time. [03 §2]
- **Scheme/claim ledger**: slabs, target rebates, TOD, non-cash schemes (194R TDS), protection claims — schemes are also the lever that *buys* secondary-sales data. [03 §2, §5]
- **Campaign-aware availability**: promise dates come from the campaign calendar, not naive stock math. [01 §2, 03 §4]
- **Seasonality baked in**: monsoon trough (Jun–Sep), Q4 fiscal-end peak, GI/agri cycle, regional splits. [03 §3]

## Recommended starting set (from the deviation catalog)

Start with five deviations covering the three chronic failure modes plus cash risk: **D1** estimate reliability (gamed estimates), **D4** campaign adherence (broken campaigns), **D11** primary–secondary gap and **D12** distributor stock-days (stuffed channel), **D14** credit-limit breach. Full encoding specs — fields, sources, thresholds, escalation — are in 04's addendum.

## Open questions (flagged for the next grilling/discovery session)

1. **Estimate vs Order vs Indent** — the glossary must split these before any flow design (all four briefs assume the split; the user's phrasing currently conflates them).
2. **SKU vs SKU family** — "250+ SKUs / 75–80 different SKUs" maps cleanly to the family-vs-variant model in brief 03; confirm the company's actual hierarchy.
3. **Practitioner facts research could not verify** (first discovery questions for the client's own teams): the company's real indent calendar days; its price-circular and price-protection policy text; distributor margin structure; minimum campaign tonnages and changeover times per mill; which ERP/DMS (if any) is incumbent.
4. **Scope boundary of "OS v1"** — the research supports starting with the estimate cycle + campaign calendar + 5 deviations; whether v1 also includes pricing/scheme ledger is a user decision.

# Landscape Scan: Systems That Overlap a "Business OS" for an Indian Steel Pipes & Tubes Manufacturer

**Scope note:** This survey maps five categories of existing software against the target flow — *distributor estimate capture → demand planning → SKU-level campaign/production planning → dispatch → deviation monitoring* — for an ERW/structural/GI tubes maker with multiple plants, a distributor network, and 250+ SKUs. Peer set: APL Apollo, Tata Steel Tubes, JSW, Surya Roshni, Hi-Tech Pipes.

## TL;DR

- **No single product covers the full flow.** S&OP suites cover the middle (demand → supply planning), DMS/SFA tools cover the front (distributor orders/secondary sales), metals APS covers the back (mill scheduling), and BI control towers cover the monitoring layer. The "OS" vision is a stitching problem, not a single-vendor purchase.
- **S&OP/IBP suites (SAP IBP, o9, Kinaxis, Blue Yonder, Anaplan)** are proven in metals (o9 has steel and voestalpine deployments) but are enterprise-priced, multi-month-to-year implementations aimed at companies with dedicated planning organizations — likely overweight for a first version.
- **Metals-specific APS (PSI Metals, DELMIA Quintiq)** is the only category that natively understands casting/rolling/galvanizing campaign sequencing — but it is plant-scheduling software, not a demand-capture or channel system, and is used by integrated steelmakers (ArcelorMittal, ThyssenKrupp, voestalpine-class), not typically tube converters.
- **Indian DMS/SFA (Bizom, Botree, FieldAssist, Ivy, Channelkonnect)** is the cheapest, fastest way to digitize distributor order booking, secondary sales, distributor stock, and schemes — but is FMCG-native; none of them do demand planning or production planning, and data quality depends on distributor compliance.
- **The Indian peers have already built the front end themselves:** APL Apollo's Sarathi (dealer/distributor app) and Aalishaan (fabricator app), Tata Steel's Aashiyana (₹2,380 cr GMV in Q3 FY26), DigECA (MSME e-commerce), and COMPASS (B2B supply-chain visibility portal), and JSW One (₹12,567 cr GMV FY25). The competitive pattern is *proprietary channel platforms on top of SAP ERP*.
- **Control-tower-on-BI is the dominant mid-market pattern:** Power BI/Tableau over ERP + planning + distributor data for deviation monitoring. Practitioner consensus: a control tower is "a data integration project with a visualization layer on top" — the data engineering, not the dashboard, is where builds fail.
- **Implication:** buy/rent a DMS for channel data capture, keep ERP as the transactional backbone, *build* the planning + deviation "brain" (estimate vs. actual, campaign planning at SKU level) — that middle layer is where nothing off-the-shelf fits a 250-SKU tube business well.

---

## 1. S&OP / IBP Suites

**What they are.** Enterprise platforms that unify demand forecasting, supply/capacity planning, inventory, and financial reconciliation into one monthly-to-weekly planning cadence, increasingly with AI agents (all major vendors shipped agentic features in 2025–26).

| Product | Positioning | Metals relevance | Cost/complexity reputation |
|---|---|---|---|
| **SAP IBP** | Best for SAP S/4HANA-centric programs; connects demand, supply, inventory, finance directly to S/4HANA | Natural fit where SAP ERP is incumbent (as at APL Apollo, JSW, Surya Roshni) | High TCO; enterprise implementation effort |
| **o9 Solutions** | "Digital Brain" — IBP connecting commercial + supply plans; fastest-growing platform | Published steel-producer case study (demand planning, master planning with BOM/capacity constraints); voestalpine High Performance Metals runs o9 globally | Upper-segment pricing; heavy modeling effort |
| **Kinaxis** | Concurrent planning + scenario speed; strongest in volatile industries (electronics, auto) | Generic manufacturing fit; no prominent Indian steel reference found (unverified) | Faster implementations (months to ~1 year); still enterprise SaaS pricing |
| **Blue Yonder** | AI-driven planning + execution; strongest in retail/CPG and large multi-geo manufacturers | Used in Indian CPG (Tata Consumer, via Accenture) rather than Indian steel | Large-enterprise scale and cost |
| **Anaplan** | Flexible modeling platform (planning "spreadsheet on steroids"); S&OP/IBP apps for supply, demand, capacity | Process-manufacturing S&OP references (e.g., AGC glass: 7–10x faster scenario analysis); not metals-specialized | Cheaper entry than o9/Kinaxis but modeling is DIY; needs model builders |

**Covers:** demand planning, consensus S&OP, rough-cut capacity, inventory targets, scenario planning, and (partially) deviation alerts at plan level.
**Does not cover:** distributor estimate/order capture (no DMS layer), retail/secondary sales, mill-level campaign sequencing, dispatch execution.
**Who it's for:** enterprises with a dedicated planning org and clean master data. For a mid-market tube maker, these are ₹ multi-crore, multi-year programs; the K3 Analytics selection guide and comparison literature consistently flag that value depends on planning-process maturity that must already exist.

**Verdict: emulate, don't buy (yet).** The concepts — one demand signal, constrained supply plan, plan-vs-actual variance — are exactly the OS vision; the platforms are oversized for a first build with 250 SKUs and a known distributor base.

## 2. Metals-Specific APS / Production Planning

**PSI Metals (PSImetals).** Combines supply chain management, advanced planning & scheduling, and MES (including order dressing and quality control) on one platform, built specifically for metals. Metals-specific content: cross-plant order-book scheduling with throughput optimization for casting, hot/cold rolling and **galvanizing** lines based on metal-specific models; hot-charging and direct-rolling sequence optimization; AI-based "Online Heat Scheduler." Customer base is top global steel/aluminum/copper producers. Indian installed base: not verified in this research.

**DELMIA Quintiq (Dassault Systèmes).** Constraint-based planning/scheduling with explicit hot & cold rolling mill scheduling solutions; lets planners encode sequencing and setup rules unique to a specific mill. Named metals customers: ArcelorMittal, ThyssenKrupp Steel, Ruukki, NatSteel, SIJ Acroni, Symetal. Vendor-claimed results: ~20% inventory reduction, 75% reduction in late orders on average in metals.

**What makes them metals-specific:** campaign logic (width/gauge/grade sequencing, roll-change and tooling constraints, coil genealogy, galvanizing bath scheduling) is modeled natively — the exact logic an ERW tube maker faces when batching slit-coil sizes and tube OD/thickness changeovers into campaigns.

**Covers:** the "campaign/production planning" and plant-scheduling slice of the flow, with deviation handling at schedule level.
**Does not cover:** distributor estimates, secondary sales, scheme management, channel dispatch visibility, or business-level S&OP (PSImetals reaches into SCM, but as a mill-centric system).
**Who it's for:** integrated steelmakers and large rolling operations; implementation and licensing are heavy-industry enterprise grade. A tube converter's scheduling problem (slitting + tube mills + galvanizing) is real but far simpler than a caster–hot mill complex.

**Verdict: emulate the concepts.** Study campaign-sequencing logic from this category, but for 250 SKUs across tube mills a custom or lightweight scheduling model (even solver-based) is more proportionate than PSImetals/Quintiq.

## 3. Indian DMS / SFA (Secondary Sales Systems)

| Product | Strengths | Notable facts |
|---|---|---|
| **Bizom (Mobisy)** | Distribution management + retail execution; primary & secondary order automation, distributor-level analytics | Strong in FMCG with complex distributor hierarchies; secondary-sales data quality depends on distributor entry / integration with distributor accounting software |
| **Botree** | DMS with direct secondary-sales dashboards; integrates with distributor accounting (Tally, Busy) | Used by Nestlé, Dabur, Parle; claims 95,000+ distributors on network |
| **FieldAssist** | Premium enterprise SFA; strong analytics/reporting; online distributor claims processing | Serves large FMCG/consumer companies with structured field sales orgs |
| **Ivy Mobility** | Cloud "distribution ERP": route-to-market, DSD, DMS unified; pricing control, trade promotions, claims, field-force automation | Consumer-goods focused; on AWS/Azure marketplaces |
| **Channelkonnect** | Secondary sales + channel loyalty; connects brand → distributor → dealer → retailer → influencer | Explicitly supports influencer programs (e.g., plumbers) relevant to building materials; stock-in-channel visibility positioning |

**What they capture:** primary sales (company → distributor), secondary sales (distributor → dealer/retailer), distributor stock, order booking via rep or distributor app, schemes/trade promotions, claims, field-force activity (beat plans, visits), and loyalty — Channelkonnect and adjacent platforms (ChannelLoyalty-type tools) extend this to fabricator/plumber influencer loyalty, which is the building-materials analogue of APL Apollo's own Sarathi/Aalishaan apps.

**Industry fit caveat:** these are FMCG-native (high-frequency, small-ticket, van-sales patterns). Steel tube channels differ: fewer, larger distributors; tonnage and credit-limit driven ordering; price volatility; SKU = section×thickness×length×finish. No search evidence surfaced of steel-pipe brands as named DMS clients (unverified either way), though building-materials use of channel-loyalty platforms is documented.

**Covers:** the front of the flow — distributor order/estimate capture, distributor stock, secondary movement, schemes — i.e., the raw signal the OS needs for demand planning.
**Does not cover:** demand forecasting beyond basic analytics, production/campaign planning, dispatch planning, plan-vs-actual deviation logic.
**Who it's for:** mid-market to enterprise consumer brands; subscription-priced and deployable in weeks–months (far cheaper than category 1).

**Verdict: integrate or rent.** This is the one category worth buying rather than building first — distributor apps, order capture, and scheme engines are commodity. The risk is FMCG assumptions baked into workflows; pilot with one region before committing.

## 4. What Indian Steel/Tube Players Publicly Run

- **APL Apollo:** Runs SAP (early adopter per its annual reports; a 2023 SAP S/4HANA ERP-financial selection is recorded by AppsRunTheWorld — plausible but third-party-sourced). Channel digital: **Sarathi Loyalty** — official app "exclusively for its Distributors and Dealers" with business insights, loyalty management, sales-activity monitoring, and loyalty-point transfers; **Aalishaan** — fabricator/customer app with a material-quantity calculator feeding orders to dealers; **APL World** portal. Scale context: 800+ distributors, ~55% structural-tube market share, 3,000+ products, 4.5 MT capacity. This is the closest peer analogue to the "distributor estimate capture" front end.
- **Tata Steel:** Three-platform stack — **Aashiyana** (D2C/home-builder commerce; ₹2,380 cr GMV in Q3 FY26, 110,000+ users), **DigECA** (2025-launched "Digital solutions for Emerging Corporates" e-commerce for MSME buyers of Astrum/Steelium/Galvano), and **COMPASS** ("Comprehensive Online Material Planning and Support System") — a B2B supply-chain visibility portal giving customers order-supply visibility, dispatch reports, invoices/test certificates, and stock-movement data for working-capital planning; Tata Steel credits it with increasing B2B sales. Channel scale: 25,000+ dealers/distributors. COMPASS is effectively a customer-facing control tower — a strong reference design.
- **JSW:** **JSW One Platforms** (founded 2021) — B2B commerce for construction/manufacturing materials with JSW One MSME marketplace and JSW One Finance; FY25 GMV ₹12,567 cr (2.4x YoY), 84,000+ MSMEs, ~₹3,800 cr credit enabled, ₹575 cr raise backed by SBI. JSW Steel internally runs SAP (HANA, Ariba procurement) and reports broad Industry 4.0/digital supply-chain programs in its integrated reports.
- **Surya Roshni:** Publicly discussed "ERP reset"/SAP transformation in 2025 (CIO&Leader coverage of its SAP program; trade press confirms recent SAP implementation to integrate and automate key processes). No public dealer-app or DMS disclosure found. Scope/modules unverified.
- **Hi-Tech Pipes:** Investor materials emphasize capacity (≈1.05 MT installed, 2 MT target by FY29), 550+ dealer outlets, Tier-2/3 depth, and value-added product mix (39% in FY26) — **no significant public digital-platform or planning-system disclosure found**. Suggests mid-market tube players have not yet built this layer, i.e., white space.

**Pattern:** leaders pair a **standard ERP backbone (SAP)** with **proprietary channel-facing platforms** (loyalty/ordering apps, e-commerce, visibility portals). None publicly discloses an off-the-shelf S&OP suite for tubes; the differentiation investment goes into the channel front end and visibility, exactly where the proposed OS starts.

## 5. Control-Tower / BI Approaches (Build-on-ERP)

The common mid-market alternative to buying a planning suite: assemble a "control tower" — near-real-time view of purchase orders, production schedules, inventory positions, shipments, and delivery performance — over existing ERP data, monitoring deviations against thresholds and triggering corrective workflows. Power BI is the default Indian stack choice: it integrates directly with ERP systems, planning tools, and distributor portals, combining (for example) SAP order data, planner forecast adjustments, and channel sell-through in one model. Vendors themselves now ship control-tower templates (SAP Supply Chain Control Tower; Epicor Grow BI; Priority ERP control tower).

Two practitioner findings worth internalizing:
1. **"Control towers are actually a data integration project with a visualization layer on top."** Implementations that work do the data engineering first; those that fail "skip straight to the dashboard."
2. ERP/MRP snapshots alone are insufficient — the value is consolidating dispersed data across silos and encoding *deviation logic* (lead-time deviations, fulfillment risk, order-vs-dispatch gaps), not charts.

**Covers:** deviation monitoring and visibility across the whole flow — but only for data that already exists somewhere.
**Does not cover:** data capture (needs a DMS/portal feeding it) and decision-making (planning/optimization must be modeled separately or manually).
**Who it's for:** exactly the mid-market profile in question — companies with an ERP, Excel-based planning, and a BI team or partner. Cost is 1–2 orders of magnitude below category 1.

**Verdict: this is the pragmatic skeleton of the OS**, provided it is treated as a data platform (clean SKU/distributor/plant master data, an integration layer, a deviation-rule engine) rather than a dashboard project.

---

## Implications for the P&T Operating System

1. **Buy/rent the edges, build the brain.**
   - *Front (distributor estimates, orders, schemes, secondary sales):* rent an Indian DMS/loyalty platform (Bizom/Botree/FieldAssist/Channelkonnect class) or build a thin distributor app — APL Apollo's Sarathi proves the thin-app route works in this exact industry. Do not build scheme/claims plumbing from scratch.
   - *Middle (demand plan → SKU campaign plan, plan-vs-actual):* **build.** Nothing off-the-shelf does "distributor estimates → SKU-level monthly plan → tube-mill campaign grouping → deviation flags" for a 250-SKU, multi-plant tube maker at mid-market cost. Borrow S&OP-suite concepts (single demand signal, constrained plan, scenario compare) and metals-APS concepts (changeover-aware campaign sequencing).
   - *Back (execution/dispatch data):* keep the ERP (SAP or otherwise) as the system of record; the OS reads from it, never replaces it.
2. **Treat the OS as a data-integration project first** (the control-tower lesson): SKU master, distributor master, estimate/order/dispatch events into one model before any planning logic or UI.
3. **Reference designs to study:** Tata Steel COMPASS (customer-facing visibility + working-capital view), APL Apollo Sarathi (distributor engagement + insights), o9's steel case (demand/master planning structure), Quintiq mill scheduling (campaign constraints).
4. **Defer suites, revisit at scale.** If the company later reaches enterprise planning maturity (dedicated planners, multi-year horizon), SAP IBP (if on S/4HANA) or o9 becomes the graduation path; the home-built OS's clean data layer is precisely what makes that migration cheap.
5. **Unverified items to validate directly with vendors/peers:** which ERP Hi-Tech Pipes runs; whether any Indian tube maker uses a commercial DMS; PSI Metals/Quintiq presence in Indian mills; exact scope of Surya Roshni's SAP program.

## Sources

- https://www.demystifyingplm.com/best-scm-software-2026 — 2026 comparison of Kinaxis, SAP IBP, o9, Blue Yonder positioning.
- https://k3analytics.com/insights/sop-software-selection-guide/ — S&OP software selection guide (Blue Yonder, Kinaxis, o9, Microsoft Fabric).
- https://datup.ai/en/alternatives/blue-yonder — Blue Yonder alternatives; pricing/TCO reputation notes.
- https://superkind.ai/blog/ai-supply-chain-tools — 2026 buyer comparison; agentic AI trend across planning vendors.
- https://o9solutions.com/case-studies/steel-producer/ — o9 demand planning & IBP case study for a global steel manufacturer (page gated; summary via search).
- https://www.businesswire.com/news/home/20221031005392/en/ — voestalpine High Performance Metals deploys o9 Digital Brain.
- https://www.anaplan.com/solutions/supply-chain-management/ — Anaplan S&OP/supply planning capabilities and AGC scenario-speed claim.
- https://www.psi.de/en/solutions/products/psimetals — PSImetals product (SCM + APS + MES for metals).
- https://www.psi.de/en/solutions/products/psimetals/module/psimetals-planning — PSImetals planning module: cross-plant order scheduling, casting/rolling/galvanizing models.
- https://www.psi.de/en/trends/article/direct-rolling-scheduling-the-tight-rope-binding-steel-casting-and-rolling — PSImetals direct-rolling scheduling.
- https://blog.3ds.com/brands/delmia/achieve-planning-accuracy-production-efficiency-for-hot-cold-mill-scheduling/ — DELMIA Quintiq hot/cold mill scheduling.
- https://en.wikipedia.org/wiki/Quintiq — Quintiq history and named steel customers (ArcelorMittal, ThyssenKrupp, Ruukki).
- https://www.quintiq.com/?pageID=metals-planning-en — Quintiq metals planning; inventory/late-order reduction claims.
- https://www.salestrendz.com/salestrendz-vs-fieldassist-vs-bizom-which-wins/ — Bizom vs FieldAssist positioning, secondary-sales data caveats.
- https://botreesoftware.com/best-distribution-management-software/ and https://www.botree.ai/dms/botree-dms — Botree DMS capabilities, Nestlé/Dabur/Parle clients, Tally/Busy integration.
- https://ivymobility.com/distribution-management-system/ — Ivy Mobility cloud DMS/route-to-market for consumer goods.
- https://channelkonnect.com/ and https://www.channelkonnect.com/pages/channel-loyalty-management.php — Channelkonnect secondary sales + channel/influencer loyalty.
- https://play.google.com/store/apps/details?id=com.appolo.sarthi — APL Apollo "Saarthi Loyalty" distributor/dealer app description.
- https://aplapollo.com/blogs/get-in-touch-with-apl-apollo-via-aalishaan-our-brand-new-mobile-app — APL Apollo Aalishaan fabricator app.
- https://aplapollo.com/images/others/Investor_Presentations_July%202025.pdf — APL Apollo scale (distributors, market share, capacity, products).
- https://www.appsruntheworld.com/customers-database/purchases/view/apl-apollo-tubes-india-selects-sap-s-4-hana-for-erp-financial — APL Apollo SAP S/4HANA selection (third-party record).
- https://www.tatasteel.com/newsroom/press-releases/india/2025/tata-steel-unveils-digeca-a-one-stop-digital-steel-buying-platform-for-msme-customers/ — DigECA launch.
- https://compass.tatasteel.com/ — Tata Steel COMPASS portal (material planning & supply-chain visibility description).
- https://www.tatasteel.com/investors/integrated-report-2020-21r/social-and-relationship-capital.html — COMPASS B2B benefits, dealer network scale.
- https://iide.co/case-studies/marketing-strategy-of-tata-steel/ — Aashiyana 3.0 GMV and platform overview.
- https://www.jsw.in/news/jsw-one-posts-record-growth-becomes-indias-largest-steel-selling-platform-2/ — JSW One FY25 GMV, MSME base, credit figures.
- https://www.jsw.in/jsw-one-platform/ — JSW One Platforms structure (Distribution + Finance).
- https://www.cioandleader.com/how-erp-reset-is-transforming-surya-roshni/ — Surya Roshni ERP reset/SAP transformation (article body gated; title/date verified).
- https://tubepipeindia.com/surya-roshni-shaping-the-future-of-steel-pipes/ — Surya Roshni SAP implementation mention, capacity figures.
- https://hitechpipes.in/investor-presentation/ — Hi-Tech Pipes investor materials (dealer network, capacity roadmap).
- https://mydatainsightspvtltd.com/blog/supply-chain-control-tower-implementation — control tower = data integration project insight.
- https://powerbiconsulting.com/blog/power-bi-supply-chain-logistics-analytics-enterprise-2026 — Power BI over ERP/planning/distributor data for control-tower use.
- https://www.priority-software.com/resources/erp-control-tower/ — ERP-based control tower concept and deviation monitoring.

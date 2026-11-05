# Plant Order & Inventory summary — rules of record

**Status: columns and BE treatment chosen by the user on 5 Nov 2026** (BE by region = option A; order
in hand = Confirmed + Non-confirmed; four ageing buckets beside physical inventory; Excel file). Every
other rule reuses a rule already signed off elsewhere and says where. The builder
(`scripts/plant-order-inventory.mjs`) and the independent checker (`.claude/agents/data-verifier.md`)
both work to this file. A rule changes here first, then in code.

Examples are live data **as of 4 Nov 2026** (latest invoice and order dated 4 Nov). They explain a rule;
they are not expected values for another day.

| # | Rule | Real example (4 Nov 2026) |
|---|---|---|
| P1 | **Rows.** Nippon (S), Lepakshi (S), NPMD (W), Tapi (W), then **All plants**. Plant id `hyderabad` shows as **Nippon** (Inventory Snapshot S5). The letter is the plant's service area off the plant master (`serves`): S = South, W = West. | — |
| P2 | **BE (region)** = Σ live (`deleted` not true) `distributor_estimates.best_estimate` for the **month of the as-of date**, each estimate placed on its distributor's region by the app's distributor region rule (most recent ship-to state → state region, distributor-master override wins). A region's BE is printed **once, across the plants that serve it** (South over Nippon + Lepakshi, West over NPMD + Tapi), never split between them. **All plants** BE = Σ of every live estimate for the month. BE for a region no plant serves, or for `Unmapped`, is named in a note under the table, not dropped. | Nov 2026: 1 estimate, 0 MT, South. South BE **0**, West BE **0**, All plants **0**. |
| P3 | **Confirmed** = Σ over **open** order lines (order status not *Delivered*) of Confirmed **netted against invoices already matched to the line** (`liveConfirmed`, ADR-0014), grouped by the order line's own `plant`. The whole open book, not this month only. | Nippon 67.4 MT (raw column 69.7 MT; 2.4 MT of it sits on Delivered lines). |
| P4 | **Non-confirmed** = Σ over the same open lines of `non_confirmed` as stored. Lines with status *Delivered* are **out**, whatever their Non-confirmed column says. | Nippon **71.8 MT**. The raw column reads 622.6 MT; 550.7 MT of it sits on 326 Delivered lines and is not open book. |
| P5 | **Order in hand** = Confirmed + Non-confirmed (P3 + P4): the app's *Pending to Serve*. | Nippon 139.2; All plants **693.8 MT**. |
| P6 | **Physical inventory** = Inventory Snapshot **S2**: produced − invoiced per plant per size key, floored at 0 per size, summed. Production weight = tubes × SKU `weightPerTube`. | All plants **2,535.2 MT**. |
| P7 | **Days of inventory** = Inventory Snapshot **S3**: inventory ÷ (MT invoiced in the 30 days ending on the as-of date, inclusive ÷ 30). Nothing invoiced in the window → `-`. All plants uses the summed inventory and summed sales. | All plants 2,535.2 ÷ (2,843.6 ÷ 30) = **27 days**; NPMD 66. |
| P8 | **Ageing 0–30 / 31–60 / 61–90 / 90+ days** = Inventory Snapshot **S10** method with four buckets: per plant and size key, invoices drain the **oldest** production first; each surviving layer is aged as-of date − production date. 0–30 means 0 to 30 days inclusive, 31–60, 61–90, and 90+ is 91 or more. The four buckets of a plant **sum to its physical inventory** (P6). | Nippon: 391.9 / 106.8 / 12.2 / 158.9 = 669.8 MT. |
| P9 | **Unattributed** (an order line or stock with no plant on the master) is left out of the plant rows and All plants and named in a note under the table. A file with none says so. | None on 4 Nov. |
| P10 | **Freshness.** The file states its as-of date and the latest invoice / order date it read. | Invoices and orders to 4 Nov 2026. |

## SKU wise sheet (user, 5 Nov 2026: "make it SKU wise")

| # | Rule | Real example (4 Nov 2026) |
|---|---|---|
| P11 | **SKU = size key**, Inventory Snapshot **S1**: section + size + thickness off the SKU master. ERP code, IS standard and length do not split a SKU. An order line's SKU is its `mm_id` resolved through the master. A code the master does not carry is its own row, shown by the order line's description with Section and Thickness printed `-`, listed after the plant's mapped SKUs. | 5 open lines, 55.0 MT order in hand, carry codes not on the master (e.g. Lepakshi `1140-13075-10097151`, RHS 25x12x1.60, 25.0 MT). |
| P12 | **Rows** = every plant × SKU with order in hand, physical inventory or opening inventory (P17) above 0.0005 MT. Plant order as P1, then SHS, RHS, CHS, then size and thickness ascending. **Each plant's SKU rows sum exactly to its plant row** on Confirmed, Non-confirmed, Order in hand, Physical inventory and all four ageing buckets. A bottom row carries the sum of all SKU rows (= All plants). | 242 rows: Nippon 85, Lepakshi 52, NPMD 55, Tapi 50. Two rows print 0.0 / 0.0 (0.05 MT together) and are kept so the sums stay exact. |
| P13 | **Columns** = the plant sheet's, **without BE**: a Best Estimate is typed per distributor in MT and carries no SKU. Confirmed / Non-confirmed / Order in hand as P3–P5, per line, on the line's SKU. Confirmed netting uses the plant's invoices of the month up to the as-of date, the same rows the plant row uses. Physical inventory and ageing as P6 and P8 at SKU level. **Days of inventory** = the SKU's inventory ÷ (the SKU's MT invoiced from that plant in the 30 days ending on the as-of date ÷ 30); no sale in the window → `-`. | Nippon SHS 25x25 × 2: 23.4 MT, **20 days**. Nippon SHS 25x25 × 2.5: 17.7 MT, no sale in 30 days → `-`. |

## Available, WIP, Coil not available, Opening (user, 5 Nov 2026)

Placed after Non-confirmed on both sheets, in this order. The user chose each definition on 5 Nov
2026 from the options offered. Examples are live data **as of 5 Nov 2026** (invoices and orders to
5 Nov, production to 4 Nov).

| # | Rule | Real example (5 Nov 2026) |
|---|---|---|
| P14 | **Available inventory** = Physical inventory (P6) − Confirmed (P3), per plant and per SKU. The app's *Free Stock*. **Can be negative**: a negative is a size promised beyond what is on the floor, and it is shown, not floored. Plant row = Σ of its SKU rows = plant physical − plant Confirmed. | Nippon 631.6 − 14.3 = **617.3 MT**. |
| P15 | **WIP (Coil + Slit)** = Inventory Snapshot **S14** RM: mother coil not yet slit (actual weight, else invoice weight, − Σ its live baby coils, floored at 0 per coil) + baby coil not assigned to any live production, at full slit weight. Each coil at its own stored plant. **Plant sheet**: the plant's whole WIP. **SKU sheet**: the plant's WIP in every coil gauge that **can roll the SKU's thickness** under the plant's RM→FG thickness sheet (`RM_TO_FG_THICKNESS`: e.g. 2.0 mm pipe ← 2.0 or 2.1 mm coil; 3.2 mm pipe ← 3.0 or 3.2 mm coil). Width is **not** matched (user chose thickness only). The same coil repeats on every SKU of that thickness, so **the SKU column does not add up** and its total row is blank. A SKU not on the master has no known thickness: `?`. | Nippon 331.2 MT = 216.8 mother + 114.4 baby; Tapi 176.0 MT, all baby (no unslit mother). Nippon SHS 25x25 × 2 shows 39.0 MT (all Nippon 2.0 + 2.1 mm coil). |
| P16 | **Coil not available** = order in hand that neither finished stock nor coil can cover. Per SKU, **need** = max(0, Order in hand − Physical inventory). Per plant, pipe thicknesses in **ascending** order each draw coil from the gauges P15 allows, **own gauge first**, then the others ascending; coil one thickness takes is gone for the next. What a thickness still lacks is split across its SKUs **in proportion to their need**. Coil tonnage converts to pipe 1:1 (no yield loss assumed). Plant row = Σ SKU rows. A SKU not on the master: `?`, not counted, and its order in hand named in the notes. | Lepakshi 2.0 mm: 12 SKUs need 81.28 MT, 2.0 + 2.1 mm coil 21.93 MT → **59.35 MT** short; RHS 100x50 × 2 (need 20.0) carries 14.60 of it. NPMD SHS 150x150 × 5: 15.0 MT ordered, no stock, no 5.0 mm coil → 15.0. |
| P17 | **Opening inventory** = finished stock at the close of the day before the 1st of the as-of month: per plant × size, produced dated before the 1st − invoiced dated before the 1st, **floored at 0 per size** (as P6), summed. Production weight = tubes × `weightPerTube`. A size with opening stock but nothing now (no stock, no order) still gets a SKU row, so SKU openings sum to the plant's. | Nippon **642.5 MT** opening on 1 Nov against 631.6 MT physical now. |

## Plant summary counts only SKUs with a Non-confirmed order (user, 5 Nov 2026)

| # | Rule | Real example (5 Nov 2026) |
|---|---|---|
| P18 | On the **Plant summary** only, **Available inventory**, **WIP** and **Coil not available** cover just the plant's SKUs (P11) with **Non-confirmed > 0.0005 MT**. Available = Σ of those SKUs' P14. Coil not available = Σ of those SKUs' P16 share, with P16's placement unchanged (every open order, confirmed included, draws coil). WIP = the plant's P15 coil in every gauge that can roll **at least one** of those SKUs' thicknesses, each coil counted once. A SKU not on the master has no thickness, so it adds to Available but not to WIP or Coil not available; its Non-confirmed is named in the notes. The plant's whole WIP is named in the notes. The **SKU wise** sheet is unchanged: every SKU, every column. All plants = Σ plant rows. | Nippon: 21 SKUs with Non-confirmed. Available **145.0** (all SKUs: 617.3), WIP **220.6** of 331.2 (no Non-confirmed SKU at Nippon is rolled from the other 110.6 MT of coil), Coil not available **18.5** of 20.2. Lepakshi: 36 SKUs, 45.0 MT of their Non-confirmed on codes not on the master. |

## Display
- MT to 1 decimal, days as whole numbers, `en-IN` grouping. One row per plant, All plants bold.
- Column order: Plant · BE (region) · Order in hand · Confirmed · Non-confirmed · Available inventory ·
  WIP (Coil + Slit) · Coil not available · Opening inventory · Physical inventory · Days of inventory ·
  0–30 · 31–60 · 61–90 · 90+ days. The SKU sheet has Section · Size · Thickness in place of BE.
- A notes block under the table carries each column's definition and the P2/P4/P9 notes.

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
| P4 | **Non-confirmed** = Σ over the same open lines of `non_confirmed` as stored. Lines with status *Delivered* are **out**, whatever their Non-confirmed column says. | Nippon **71.8 MT**. The raw column reads 622.6 MT; 550.7 MT of it sits on 328 Delivered lines and is not open book. |
| P5 | **Order in hand** = Confirmed + Non-confirmed (P3 + P4): the app's *Pending to Serve*. | Nippon 139.2; All plants **693.8 MT**. |
| P6 | **Physical inventory** = Inventory Snapshot **S2**: produced − invoiced per plant per size key, floored at 0 per size, summed. Production weight = tubes × SKU `weightPerTube`. | All plants **2,535.2 MT**. |
| P7 | **Days of inventory** = Inventory Snapshot **S3**: inventory ÷ (MT invoiced in the 30 days ending on the as-of date, inclusive ÷ 30). Nothing invoiced in the window → `-`. All plants uses the summed inventory and summed sales. | All plants 2,535.2 ÷ (2,843.6 ÷ 30) = **27 days**; NPMD 66. |
| P8 | **Ageing 0–30 / 31–60 / 61–90 / 90+ days** = Inventory Snapshot **S10** method with four buckets: per plant and size key, invoices drain the **oldest** production first; each surviving layer is aged as-of date − production date. 0–30 means 0 to 30 days inclusive, 31–60, 61–90, and 90+ is 91 or more. The four buckets of a plant **sum to its physical inventory** (P6). | Nippon: 391.9 / 106.8 / 12.2 / 158.9 = 669.8 MT. |
| P9 | **Unattributed** (an order line or stock with no plant on the master) is left out of the plant rows and All plants and named in a note under the table. A file with none says so. | None on 4 Nov. |
| P10 | **Freshness.** The file states its as-of date and the latest invoice / order date it read. | Invoices and orders to 4 Nov 2026. |

## Display
- MT to 1 decimal, days as whole numbers, `en-IN` grouping. One row per plant, All plants bold.
- Column order: Plant · BE (region) · Order in hand · Confirmed · Non-confirmed · Physical inventory ·
  Days of inventory · 0–30 · 31–60 · 61–90 · 90+ days.
- A notes block under the table carries each column's definition and the P2/P4/P9 notes.

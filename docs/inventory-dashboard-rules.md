# Inventory Snapshot — rules of record

**Status: rules approved by the user on #213; the page still carries "Mock · figures unverified".**
The chip comes off only once a real download has passed the `data-verifier` against this file.
These rules are what the builder (`buildInventorySnapshotData`, `src/lib/reports.js`), its tests
(`src/lib/reports.test.js`, "Inventory Snapshot" blocks) and the independent checker
(`.claude/agents/data-verifier.md`) all work to. A rule changes here first, then in code. Every
mistake the user or the checker catches becomes a worked example here and a test **before** it is
fixed.

Examples are live data as of **28 Oct 2026** (stock moves daily; they explain a rule, they are not
expected values).

| # | Rule | Real example (28 Oct 2026) | Test |
|---|---|---|---|
| S1 | **Size key** = section + size + thickness, from the SKU master. Section is `productType` (SHS / RHS / CHS). Size is the nominal bore (`32 NB`), else height × breadth (`100x50`), else parsed from the description. Thickness to 2 decimals. ERP code, IS standard and length do **not** split a size: two codes for one tube net together. A code the master does not carry keys as itself, so it still counts but cannot net with anything. | Nippon RHS 100x50 4.0: produced 100.965 MT under `RHS-100x50x4.00`, invoiced 86.294 MT under `1140-13075-10074990`. One size, **14.671 MT** on hand. Keyed by code it would read 100.965. | "nets two ERP codes for one tube" |
| S2 | **FG on hand per plant** = produced at the plant − invoiced from the plant, **per size key, floored at 0**, then summed. Produced = the production's plant; invoiced = each invoice **entry's** plant (plant lives per entry, not per invoice). Production tonnage is tubes × `weightPerTube` from the SKU master, never a density formula. Soft-deleted productions and invoices are excluded. | Nippon SHS 50x50 3.0: produced 60.514, invoiced 71.700 → counts as **0**, not −11.186. 41 sizes across the four plants are over-invoiced (112.1 MT); each counts as 0 and never reduces another size. | "floors each size at 0", "nets per plant", "excludes soft-deleted" |
| S3 | **Days cover** = on hand ÷ (MT invoiced in the last 30 days ÷ 30). The 30 days **end on the as-of date, inclusive**: as of 28 Oct that is 29 Sep to 28 Oct. A dispatch dated after the as-of date is outside the window (but still netted in S2). Nothing invoiced in the window → cover is blank (`-`), never 0 or infinite. | All plants: 2,781 MT ÷ (2,486 MT ÷ 30) = **34 days**. Nippon: 882 ÷ (822 ÷ 30) = 32. | "counts the 30 days ending on the as-of date", "days cover = …" |
| S4 | **All plants** = the sum of the plant rows (MT on hand and MT sold); its cover is computed from those sums. Tonnage with no resolved plant (blank, or an id the plant master does not carry) is **Unattributed**: it is left out of All plants and its MT is named in a line under the table (ADR-0012). A report with none says nothing. | 0 MT Unattributed on 28 Oct, so no line shows. | "All plants is the sum…", "names nothing when…" |
| S5 | **Plants and names.** Rows in the order Nippon, Lepakshi, NPMD, Tapi, then any plant the master gains. Plant id `hyderabad` is shown as **Nippon** whatever the plant master says (user decision, #213). The region letter is read off the plant master's service area (`serves`): S = South, W = West. | Nippon (S), Lepakshi (S), NPMD (W), Tapi (W) | "lists Nippon…", "shows hyderabad as Nippon…" |
| S6 | **FG cover band, plant row.** Red < 7 days, Green 7 to 45 (both edges Green), Amber > 45. Stock with no sale in 30 days is Amber. A plant with no stock and no sale is not coloured. | NPMD 87 days → Amber; Lepakshi 18 → Green | "bands the cover…" |
| S7 | **Always all plants.** The snapshot ignores the header plant filter (user decision, #213). The Reports tab hands it the unfiltered stores; when the header is filtered, the tab's banner says this one button still covers all plants. | — | e2e `inventory-snapshot.spec.js` |
| S8 | **Sales class**, per plant. Rank the plant's sizes by MT invoiced in the **last 90 days** (ending on the as-of date, inclusive: 31 Jul to 28 Oct), largest first, ties by size key. The share compared is the share of the plant's 90-day sales ranked **above** the size: A if under 70%, B if under 90%, otherwise C. So the best seller is always A, a size that crosses 70% is still A, and a size sitting exactly on 70% is B (exactly on 90% is C). Sizes with no sale in 90 days are C. **Drop rule:** a size with no sale in 90 days **and** no stock is left out everywhere, a data gap and not inventory. Each plant is ranked on its own sales. | All plants: A 77 sizes / 1,258 MT, B 50 / 432 MT, C 78 / 1,092 MT. Sizes are plant × size pairs, so a size held at two plants counts twice. | "cuts at 70% and 90%…", "a size that crosses 70%…", "ranks each plant…", "drops a size…" |
| S9 | **Size band.** Red = on hand 0 or cover < 7 days. Amber = no sale in 30 days, or cover > 45. Green = 7 to 45, both edges Green. **Red is tested first**, so a size with no stock is Red even when it also had no sale in 30 days. Cover is S3 at size level. | All plants: Red 64 sizes / 63 MT, Green 56 / 751 MT, Amber 85 / 1,967 MT. | "Red = cover under 7…", "no stock is Red even when…" |
| S10 | **FG > 60 days** = FIFO age of each plant's unshipped production. Per plant and size key, invoices drain the **oldest** production first; what survives is aged as-of date − production date, and **over 60 days** (61 or more) counts. Shown as MT and % of that plant's FG. Run on one plant's rows at a time (the existing `skuAgeing`), so its surviving tonnage **equals** S2's FG on hand. Band: Green < 10%, Amber 10 to 25% (both edges), Red > 25%. | Nippon 290.2 of 882.3 MT (**33%**, Red); NPMD 0; All plants 294.7 MT (**11%**, Amber). Surviving tonnage ties to FG on every plant (gap < 0.000001 MT). | "drains the oldest batches first…", "ties to each plant's FG", "bands: Green under 10%…" |
| S11 | **A-class out** = A-class sizes that are Red (cover < 7 or no stock), shown as `n / A-sizes`. All plants adds the counts. Band: **Green < 10%**, **Amber 10 to 20%** (both edges), **Red > 20%**. Green and Amber added by the user on 28 Oct 2026; the #213 rule named only Red. | Nippon 13 / 36 (Red); Lepakshi 9 / 13 (Red); NPMD 1 / 6 (17%, Amber); All plants **32 / 77**. | "A-class out = A sizes Red…", "Red only over 20%…" |
| S12 | **Excess** = on hand in sizes with cover > 45 days, plus on hand in sizes with no sale in 30 days. This is exactly the Amber MT of S9. Shown as MT and % of FG. Band: **Green < 30%**, Amber 30 to 60% (both edges), **Red > 60%**. Green added by the user on 28 Oct 2026; the #213 rule named only Amber and Red. | All plants **1,967 MT (71%)**, Red; Lepakshi 167 MT (52%), Amber; NPMD 756 MT (93%), Red. | "Excess = stock in sizes over 45 days…", "Excess bands…" |
| S13 | **Three action lists**, across all plants, top 7 each. Plant column reads NIPPON, LEP, NPMD, TAPI. Ties fall back to plant order, then size. **Replenish now**: A-class, sold in the last 30 days, Red; by sold 30d, largest first. **Slow production**: A-class, cover > 45; by on hand, largest first. **Slow movers**: C-class, Amber (no sale in 30 days or cover > 45), on hand > 0, **excluding a size never invoiced from that plant whose first production there is inside the 30-day window**; by on hand, largest first. | Replenish top: NIPPON RHS 100x50 × 2, 1.7 MT on hand, 74.7 sold, 0.7 days. Slow production top: NPMD RHS 60x40 × 1.6, 109.5 MT, 83 days. Slow movers top: NPMD SHS 50x50 × 2.5, 71 MT, 308 days. Left out as fresh: NIPPON RHS 80x40 × 3 (first made 26 Oct, 20.6 MT, never sold) and three others. | "Replenish…", "Slow production…", "Slow movers…", "cut to 7" |
| S14 | **RM per plant** = mother coil not yet slit + baby coil not yet used. **Mother** = `actualWeight` (else `invoiceWeight` when actual is 0 or blank) − Σ `weight` of its live (not deleted) baby coils, **floored at 0 per coil**, so a partly slit coil counts only what is still on it and an over-slit one never eats another coil. A baby coil marked `consumed` still counts as slit off its mother. **Baby** = slit weight − production allocations against it (`babyCoilFree`), counted only where `babyCoilIsStock` says so: not deleted, not `consumed`, and **at least 0.2 T** left (ADR-0007; compared to the kilo, so exactly 0.2 T is stock). Each coil sits at **its own stored plant** (set at Coil Inward, inherited by baby coils, ADR-0005). Nothing is re-attributed: a coil with a blank or off-master plant is Unattributed, left out of All plants and named under the table with the FG figure (S4). | Nippon 711.8 MT = 195.9 MT unslit mothers + 515.9 MT baby coils. 1,592 baby-coil ends under 0.2 T (167.4 MT) and 342 consumed coils (25.2 MT) are left out. No live mother is partly slit today; the test builds one (100 T, 50 T slit, 12 T used → 88 T). | "a partly slit mother…", "takes the invoice weight…", "scrap…", "consumed…", "reads each coil's own plant…" |
| S15 | **RM days cover** = RM ÷ (coil weight allocated in productions dated in the last 30 days ÷ 30), the same 30 days as S3 (ending on the as-of date, inclusive). Used weight = Σ `coilAllocations[].weight` of live productions, at the production's plant. Nothing used in the window → blank (`-`), not coloured. Band: **Amber < 15 days**, **Green 15 or more**. Green added with this ticket: #213 named only Amber, and the page colours every cell with a value. | All plants 2,323 MT ÷ (3,282 MT ÷ 30) = **21 days**, Green. Tapi 529 ÷ (1,261 ÷ 30) = **13 days**, Amber. | "counts coil weight allocated…", "bands: under 15 days Amber…" |
| S16 | **RM > 60 days** = RM older than 60 days (61 or more, as S10). A **mother** is aged by its **inward date**, a **baby** coil by its **own conversion date**, never its mother's inward date (user decision, #213). Shown as MT and % of that plant's RM; bands as S10: Green < 10%, Amber 10 to 25%, Red > 25%. | Nippon 460.0 of 711.8 MT (**65%**, Red): 117.8 MT unslit mothers + 342.2 MT in 483 baby coils, the oldest slit 6 Apr 2026. All plants 501.2 MT (**22%**, Amber). | "ages a mother by its inward date…", "ages a baby coil by its own conversion date…", "bands like FG > 60 days…" |

## Display
- MT and days are printed as whole numbers (`en-IN` grouping); percentages as whole numbers. Each
  cell is rounded on its own, so the plant rows can differ from the All plants row by rounding.
- Plant summary columns: Plant, RM MT (S14), RM days cover (S15), RM > 60 days (`MT · %`, S16), Current inventory MT (S2's FG), Days cover (S3), Inventory > 60 days (`MT · %`, S10), A-class out
  (`n / A-sizes`), Excess MT (> 45 days cover, `MT · %`). A cell with nothing to divide by reads `-`.
- RAG cells: Red #C62828 white text, Amber #F2B705 black text, Green #2E7D32 white text. Every
  Plant summary cell with a value is coloured; only `-` (nothing to divide by) is left plain.
- The page says **Current inventory**, never "FG" or "On hand", in every heading, the footer and the
  Unattributed line (user wording, 28 Oct 2026). Only the approved page title keeps "RM and FG". The rules above still call the same figure on hand: S2's FG per size.
- Class labels: A (fast · top 70% of sales), B (medium · next 20%), C (slow · last 10%).
- One footer line carries the definitions and every RAG threshold.
- Never the words "Liquidate" or "+ no sale"; no explanatory paragraphs; no em dashes as connectors.

## Check of 28 Oct 2026 (independent SQL, not the builder)
| Plant | FG MT | Sold 30d MT | Days cover |
|---|---:|---:|---:|
| Nippon (S) | 882.293 | 821.830 | 32.2 |
| Lepakshi (S) | 321.409 | 524.010 | 18.4 |
| NPMD (W) | 810.644 | 278.950 | 87.2 |
| Tapi (W) | 766.924 | 861.390 | 26.7 |
| **All plants** | **2,781.269** | **2,486.180** | **33.6** |

The hand-built page published the same day read FG 2,783 MT and 34 days cover. The 2 MT gap is
within a day's entries; the source of that page was lost, so it cannot be reconciled line by line.

## Check of 28 Oct 2026, finished-goods detail (#215)
Independent SQL written from S8 to S13 (not the builder), then the builder run on the same rows.
They agree on every figure below and on all 21 list lines.

| Plant | FG > 60 days | A-class out | Excess |
|---|---:|---:|---:|
| Nippon (S) | 290.2 MT · 33% | 13 / 36 | 625.0 MT · 71% |
| Lepakshi (S) | 0 · 0% | 9 / 13 | 167.3 MT · 52% |
| NPMD (W) | 0 · 0% | 1 / 6 | 755.6 MT · 93% |
| Tapi (W) | 4.5 MT · 1% | 9 / 22 | 419.3 MT · 55% |
| **All plants** | **294.7 MT · 11%** | **32 / 77** | **1,967.2 MT · 71%** |

The hand-built page of the same day read 296 MT (11%), 32 / 77 and 1,969 MT (71%).

## Check of 28 Oct 2026, raw material (#216)
Independent SQL written from S14 to S16 (not the builder), then the builder run on the same live
rows (663 coils, 4,003 baby coils, 1,721 productions). They agree to the kilogram on every figure.

| Plant | RM MT | Used 30d MT | RM days cover | RM > 60 days |
|---|---:|---:|---:|---:|
| Nippon (S) | 711.783 | 704.455 | 30.3 | 459.960 MT · 65% |
| Lepakshi (S) | 622.360 | 537.349 | 34.7 | 32.632 MT · 5% |
| NPMD (W) | 460.166 | 779.665 | 17.7 | 0.627 MT · 0% |
| Tapi (W) | 528.930 | 1,260.938 | 12.6 | 7.991 MT · 2% |
| **All plants** | **2,323.239** | **3,282.407** | **21.2** | **501.210 MT · 22%** |

No RM was Unattributed. The hand-built page of the same day read RM 2,272 MT, 21 days cover and
501 MT (22%) over 60 days; its source was lost, so the 51 MT RM gap cannot be reconciled line by line.

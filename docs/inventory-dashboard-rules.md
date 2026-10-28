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

## Display
- MT and days are printed as whole numbers (`en-IN` grouping). Each cell is rounded on its own, so
  the plant rows can differ from the All plants row by rounding.
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

## Added by later tickets (approved on #213, not yet built)
Sales class (A / B / C on last-90-day sales, 70% / 90% cut-offs) and the drop rule; size-level bands;
FG > 60 days (per-plant FIFO ageing tying to S2); RM on hand, RM days cover and RM > 60 days; A-class
out; Excess > 45 days cover; the three top-7 lists; the full footer of RAG thresholds. Each lands
here with its worked example and test when its ticket is built.

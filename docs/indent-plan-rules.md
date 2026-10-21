# Indent plan — rules of record

**Status: awaiting sign-off by the user.** Once signed, these rules are what both the builder
(`scripts/indent-plan.py`) and the independent checker (`.claude/agents/data-verifier.md`) work to.
A rule changes only when the user changes it here. Every rule has a worked example from real data
and a test case in `scripts/indent-plan-test.py` (R-number). Every mistake the user catches becomes
a new example and a new test **before** it is fixed.

| # | Rule | Real example (Oct 2026) | Test |
|---|---|---|---|
| R1 | **Stock columns.** Opening = made − sent before the 1st of the month. Production and Dispatch = this month. Closing = stock now. All in MT, from the plants of the row's region, all customers. | SHS 50x50 2 at Hyderabad: production 37.04, dispatch 47.50 in Oct | R1 |
| R2 | **CRFH counts as Black.** **3 mm and 3.2 mm are one size.** | Shivam CRFH SHS 20x20 1.2 uses Black 20x20 1.2 stock | R2 |
| R3 | **Typos are corrected for the maths only and listed.** Section comes from the sides (equal = SHS, unequal = RHS); `*` = x; 1.5 mm = 1.6 mm; `20X100` = 200x100 (confirmed by the user). The indent cells are never changed. | Arihant "SHS 200X100" → RHS; Mahendra "SHS 80X40" → RHS | R3, R10 |
| R4 | **What a distributor received counts against its indent, whichever plant it came from.** Qty Left = Indent − this month's invoices to that distributor, from ANY plant. | VVN SHS 150x150 4 mm: indent 6, got 6.68 from **Tapi** → left 0, not on a truck | R4 |
| R5 | **Trucks load only from the distributor's own region.** South = Hyderabad + Lepakshi, West = NPMD + Tapi. Region comes from the distributor master; Khan Steel Centre = South (user-confirmed). | Mahendra (West) is never loaded from Lepakshi, even though it was invoiced from there | R5 |
| R6 | **A plant never holds less than zero.** Each plant's opening and closing are floored at 0 before adding up a region; every negative is listed on the Checks tab as a data-entry gap to fix. Closing can therefore differ from Opening + Production − Dispatch. | SHS 25x25 2: Lepakshi −3.21 (invoiced, never recorded made) must not cancel Hyderabad's 1.61 | R6 |
| R7 | **Short stock is shared in proportion to qty left — but never stranded.** If a share would be under 1 MT, the lot goes to the largest qty left first. | Lepakshi RHS 96x48 2.5: 1.79 MT goes whole to one distributor, not dropped | R7 |
| R8 | **Trucks:** 20 MT each, one distributor and one plant per truck, no line under 1 MT, sizes kept together. 19 MT or more = Full; less = Part load. | South A, 31.61 MT at Hyderabad → trucks of 20 + 11.61 | R8 |
| R9 | **Inventory grid shows ALL stock** the region holds, ordered or not. | South SHS 38x38 2.2 shows although nobody ordered it | R9 |
| R10 | **Data must be current.** Build only after the day's entries are done; the checker compares the file with the live database and fails it if anything moved. | 21 Oct: 3 Hyderabad entries (38 MT) arrived after the pull → FAILED | checker |
| R11 | **Weight comes from the SKU master** (tubes × weight per tube), never from a density formula. | — | — |

## Two "Dispatch" figures — never compare them
- **Sheet1 / Grid "Dispatch"** = everything that left the region's plants in that size, to all customers (stock movement).
- **Size x Thickness / Truck Plan "Dispatch"** = invoices to the indent's own distributors, from any plant (what reduces the indent).

## Open questions (not yet rules)
- Very small trucks (e.g. a single 1 MT truck) are legal under R8. Should a truck under some minimum be held back?
- Indented sizes that are not in the SKU master at all (CHS 125 NB, 150 NB) always read 0 — listed on the Checks tab.

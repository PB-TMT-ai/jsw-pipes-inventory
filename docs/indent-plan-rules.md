# Indent plan — rules of record

**Status: awaiting sign-off by the user.** Once signed, these rules are what both the builder
(`scripts/indent-plan.py`) and the independent checker (`.claude/agents/data-verifier.md`) work to.
A rule changes only when the user changes it here. Every rule has a worked example from real data
(dated — stock moves daily) and a test case in `scripts/indent-plan-test.py` (R-number). Every mistake the user catches becomes
a new example and a new test **before** it is fixed.

| # | Rule | Real example (Oct 2026) | Test |
|---|---|---|---|
| R1 | **Stock columns.** Opening = made − sent before the 1st of the month. Production and Dispatch = this month. Closing = stock now. All in MT, from the plants of the row's region, all customers. | SHS 50x50 2 at Hyderabad: production 37.04, dispatch 47.50 in Oct | R1 |
| R2 | **CRFH counts as Black.** **3 mm and 3.2 mm are one size.** | Shivam CRFH SHS 20x20 1.2 uses Black 20x20 1.2 stock | R2 |
| R3 | **Typos are corrected for the maths only and listed.** The size decides the section, never the Section cell: a size with NB is CHS, a W×H size is SHS when the sides are equal and RHS when not; `*` = x; 1.5 mm = 1.6 mm; `20X100` = 200x100 (confirmed by the user). A short side first (`18x180`) is flagged `CHECK` and not fixed until the user confirms. The indent cells are never changed. | Arihant "SHS 200X100" → RHS; Mahendra "SHS 80X40" → RHS; Amit "CHS 172x92" → RHS; Arihant "RHS 20nb" → CHS 20 NB (26 Oct) | R3, R10 |
| R4 | **What a distributor received counts against its indent, whichever plant it came from.** Qty Left = Indent − this month's invoices to that distributor, from ANY plant. | VVN SHS 150x150 4 mm: indent 6, got 6.68 from **Tapi** → left 0, not on a truck | R4 |
| R5 | **Trucks load only from the distributor's own region.** South = Hyderabad + Lepakshi, West = NPMD + Tapi. Region comes from the distributor master; Khan Steel Centre = **West** (user-confirmed 26 Oct, its invoices ship to Maharashtra; it was South before). When the file has its own Region column it must agree with the master, or the run stops and the user is asked. | Mahendra (West) is never loaded from Lepakshi, even though it was invoiced from there | R5, R14 |
| R6 | **A plant never holds less than zero.** Each plant's opening and closing are floored at 0 before adding up a region; every negative is listed on the Checks tab as a data-entry gap to fix. Closing can therefore differ from Opening + Production − Dispatch. | SHS 25x25 2 (21 Oct): Lepakshi −3.21 (invoiced, never recorded made) counts as 0; South closing = Hyderabad's 12.31, not 9.10 | R6 |
| R7 | **Short stock is shared in proportion to qty left — and every share must be a loadable line.** If a share would be under 1 MT, the smallest such share is dropped and the lot is re-split pro rata among the rest, until every share is 1 MT or more (user, 26 Oct; it replaced "largest qty left takes it all"). | 13.01 MT for SST 10 / Khan 5 / VVN 0.95 left: VVN's 0.77 share dropped → SST 8.67, Khan 4.33 (was 10 / 3.01). 1.79 MT for A 10 / B 5 → B's 0.59 dropped → A 1.79 | R7 |
| R8 | **Trucks:** 25 MT each (user, 26 Oct; was 20 — any other capacity via `--truck-mt`), one distributor and one plant per truck, no line under 1 MT, sizes kept together. 24 MT or more = Full (1 MT under capacity); less = Part load. Each truck's Load is its lines' exact sum, so the Total row adds real loads. | South A, 31.61 MT at Hyderabad → trucks of 25 + 6.61. 25-Oct indent: 628.82 MT on 33 trucks (38 at 20 MT); Total reads 628.8, not the 628.9 that rounded cells gave | R8 |
| R9 | **Show ALL stock** the region holds, ordered or not — on the Size x Thickness Inventory grid AND as extra rows on the Grid tab (no indent, stock columns filled). | South SHS 38x38 2.2 shows on both tabs although nobody ordered it | R9 |
| R10 | **Data must be current.** Build only after the day's entries are done; the checker compares the file with the live database and fails it if anything moved. | 21 Oct: 3 Hyderabad entries (38 MT) arrived after the pull → FAILED | checker |
| R11 | **Weight comes from the SKU master** (tubes × weight per tube), never from a density formula. | — | — |
| R12 | **Size x Thickness counts dispatch against the indent, per distributor.** Dispatch = each distributor's own invoices for that size (any plant), counted only up to its own indent. Qty Left = Indent − Dispatch = still owed, never below 0 — the same figure the Truck Plan uses. Invoices beyond the indent, or in sizes not indented, are listed on the Checks tab and never cancel another distributor's need. | South SHS 40x40 2.5 (21 Oct): VVN's 40.77 MT over-delivery used to show −30; Khan is still owed 5 → Qty Left 5 | R12 |
| R13 | **Distributor names are matched to the invoice customer** (case and repeated spaces ignored) in `scripts/indent-plan-distributors.json`. ARIHANT STEEL AGENCY is a different distributor from ARIHANT STEEL POINT and is never counted against it (user-confirmed); since 26 Oct it has its own indent rows. SLSS = SHRI LAKSHMI STEEL SUPPLIERS (user-confirmed 26 Oct). | Arihant Steel Agency's 187.64 MT in Oct is not netted | checker |
| R14 | **Billed Qty = this month's invoices** to that distributor for that size, from ANY plant (the file's own note: "Billed Qty should be same as the MTD Invoiced Qty"). Typed values are replaced and every change is listed on the Checks tab. A size invoiced with no indent row gets one (green, Indent 0) after the distributor's last row; S.No, Pending and SUBTOTAL formulas follow. Applies when the file has a Billed Qty column. | 26 Oct file: 172 values changed, 73 rows added (429.76 MT); Billed total 1,850.815 MT = invoices to the 14 distributors, exact to the kg | R14 |
| R15 | **A row with no distributor belongs to the distributor above it**, and takes its section and size when those are blank too. Listed on stdout. | Row 777: 80x40 5, billed 30.12 → Arihant Steel Agency RHS 80x40 5 (invoiced 40.24) | R15 |
| R16 | **Split workbook (`--split`)**: what is still owed (Qty Left, as on the Size x Thickness tab) in two tabs — *Stock Available* (sizes the region holds: Qty Left, Inventory, Short = Qty Left − Inventory where stock does not cover it) and *No Stock* (sizes the region holds none of). Whole MT; per region the two Qty Left totals add up to the Size x Thickness Qty Left total. | 26 Oct: South 718 + 983 = 1,701 MT; West 732 + 1,155 = 1,887 MT | R16 |

## Two "Dispatch" figures — never compare them
- **Sheet1 / Grid "Dispatch"** = everything that left the region's plants in that size, to all customers (stock movement).
- **Size x Thickness / Truck Plan "Dispatch"** = each distributor's own invoices, from any plant, up to its own indent (what reduces the indent — R12).

## Order-book truck plan — rules of record (user, 05/06-Nov-2026)

A second truck plan, built from the **open order book** instead of an indent workbook: which open
orders can leave today on full trucks from finished stock. Set by the user on 05-Nov ("truck-fill
first") and 06-Nov ("update the rules to 25T"). Every rule above that is not overridden here still
applies — R5 regions, R6 plant floor at 0, R11 weight from the SKU master. **R7 (pro rata) does not
apply to this plan; OB4–OB5 replace it.** Builder: one-off script outside the repo for now; checker:
`data-verifier`, against this section.

| # | Rule | Real example | Test |
|---|---|---|---|
| OB1 | **Demand = the open order book.** `orders` not deleted, status not Delivered, Confirmed + Non-confirmed > 0, per distributor and size. Confirmed is the netted figure (ADR-0014). No indent, no Billed Qty. | 06-Nov (data to 05-Nov): 601.255 MT = 78.05 Confirmed + 523.205 Non-confirmed, 14 distributors | checker |
| OB2 | **Confirmed takes stock first.** Non-confirmed orders only get what Confirmed orders leave. | 06-Nov, West 150x150x5 SHS: 5.50 MT at Tapi. Provack's 5 MT Confirmed takes 5; the 0.50 left is under 1 MT, so Shubh (9 MT Non-confirmed, oldest order 13-Aug) gets none. On 05-Nov, before that Confirmed order, Shubh got all 5.50 | checker |
| OB3 | **A size with enough stock for everyone is given in full**, from the distributor's home plant first (the region plant holding most of what that distributor wants), then the other plant of its region. | — | checker |
| OB4 | **Short stock goes truck-fill first.** Where a region's stock of a size is less than what its distributors want, it goes first to the distributor whose next truck it makes Full (OB6), the one needing the least to reach Full first; that truck is then filled up to 25 MT (capped by what the distributor wants and the stock); tie → oldest open order. Repeated until no truck can be completed. In the Truck Plan a line is labelled truck-fill only if it sits on a Full truck. | 06-Nov, West 72x72x4 SHS: 13.58 MT at Tapi, Provack wants 10, Amit 4. Amit's first Tapi truck needs only 1 MT to be Full (23.00 → 24), so Amit is served first; then Provack gets all 10, as 3 + 7 MT, making its Tapi trucks 18 and 19 Full (25.00 and 24.50). Amit ends with 3.57 (1 by truck-fill, 2.57 by OB5) | checker |
| OB5 | **What is left of a short size goes to the oldest open order** (min order date of the distributor's open lines), home plant first, no piece under 1 MT. | 06-Nov, West 150x150x4 SHS: 2.47 MT at Tapi, wanted by Shubh (13-Aug), Amit, Arihant Agency, Provack → all 2.47 to Shubh | checker |
| OB6 | **Trucks: 25 MT** (user, 06-Nov; 05-Nov ran at 20), one distributor and one plant per truck, no line under 1 MT. **24 MT or more = Full**; less = Part load, to be held, topped up or combined by a transfer between the two plants of the same region — never across regions. Within a line, Confirmed is loaded before Non-confirmed. | 06-Nov: 19 trucks, 239.33 MT — 5 Full (123.50), 14 part loads (115.83) | checker |
| OB7 | **A line under 1 MT is not loaded** and is listed as such ("Not loaded (under 1 MT)"); it stays in stock and is not re-offered. | 06-Nov: 1.4 MT in such lines | checker |
| OB8 | **Non-confirmed tonnage on a Full truck must be released in the ERP before invoicing**; the file says how much, per truck. | 06-Nov: SST's Hyderabad truck is 25 MT, all Non-confirmed | checker |

## Open questions (not yet rules)
- Very small trucks (e.g. a single 1 MT truck) are legal under R8. Should a truck under some minimum be held back?
- Should indent plans also share short stock truck-fill first (OB4–OB5) instead of pro rata (R7)?
  Today they differ: R7 for indent workbooks, OB4–OB5 for the order-book plan.
- Order-book plan: 3 mm and 3.2 mm are one size under R2 but not yet in the order-book plan
  (06-Nov check flagged 100x50x3 vs 100x50x3.2 RHS at Hyderabad).
- Indented sizes that are not in the SKU master at all (CHS 125 NB, 150 NB) always read 0 — listed on the Checks tab.

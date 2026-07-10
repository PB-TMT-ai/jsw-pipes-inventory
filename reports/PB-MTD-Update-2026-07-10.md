# JSW Pipes & Tubes — PB MTD Update (2026-07-10)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled from Supabase. Lines that have no analog in P&T are flagged rather
than guessed. The template's own printed numbers (27,500 T / 6,589 T / 12,613 T …) are
example values from the larger PB/rebar operation and are **not** used here.

```
JSW Pipes & Tubes — PB MTD Update
As on: 2026-07-10   |   Current month: Jul-2026   |   Units: MT (T)
Legend:  ✅ value from system   ⚠️ not possible (data not captured)   🚫 not relevant to P&T

PB MTD update as on ---------------------> 2026-07-10
Revised Best Estimate -------------------> ⚠️ N/A — no forecast/target field in the system (manual input)
Total Orders ----------------------------> ✅ 300.7 T   (Sales KPI = MTD Invoice + Confirmed + Non-confirmed; all-time ordered qty = 2,223 T)
  Retail Orders -------------------------> 🚫 N/A — no order-category dimension in P&T
  Distributor Through Project -----------> 🚫 N/A — no order-category dimension in P&T
  Project Orders ------------------------> 🚫 N/A — no order-category dimension in P&T
Carry-forward Orders --------------------> ⚠️ N/A — not tracked; prior-month open-book proxy = 0 T (all open orders are current-month)
Current Month Orders --------------------> ✅ 226.0 T   (Jul order intake, 41 lines)
SFDC Orders -----------------------------> ⚠️ N/A — no SFDC flag; distributor_code values ARE Salesforce IDs, so all orders are effectively SFDC (no separable subset)
Invoiced Orders MTD ---------------------> ✅ 249.4 T   (Jul, by invoice date)
  Retail Orders -------------------------> 🚫 N/A — no order-category dimension
  Distributor Through Project -----------> 🚫 N/A — no order-category dimension
  Project Orders ------------------------> 🚫 N/A — no order-category dimension
Invoiced MTD-FE 550 ---------------------> 🚫 N/A — FE 550 is a rebar grade; P&T grades are IS 10748
Invoiced MTD-FE 550D - LRF --------------> 🚫 N/A — FE 550D/LRF is a rebar grade; not used in P&T
Invoiced MTD (Previous Month) -----------> ✅ 1,014.0 T (Jun 2026, by invoice date)
Dispatch D-1 (Current Month) ------------> ✅ 35.9 T    (2026-07-09)
Dispatch D Day --------------------------> ✅ 0 T       (2026-07-10; latest dispatch data = 2026-07-09)
Confirmed Orders Pending to be Invoiced -> ✅ 26.0 T
Non-Confirmed Orders --------------------> ✅ 25.3 T
Daily Run Rate Required -----------------> ⚠️ N/A — depends on Revised Best Estimate; = (target − MTD invoiced) / remaining working days if a target is supplied
Physical Inventory ----------------------> ✅ ~1,776 T  (finished pipe stock = produced − invoiced, per SKU)
  FE 550 --------------------------------> 🚫 N/A — finished pipe carries no grade dimension
  FE 550D -------------------------------> 🚫 N/A — finished pipe carries no grade dimension

Orders Logged D Day ---------------------> ✅ 0 T       (2026-07-10; no orders loaded yet)
Orders Logged D-1 -----------------------> ✅ 0 T       (2026-07-09; no orders loaded)
Orders Logged D-2 -----------------------> ✅ 51.0 T    (2026-07-08, 11 lines)

Why the N/A lines:
  • No order-category field in the system → all Retail / Distributor-Through-Project / Project splits are 🚫 not relevant.
  • FE 550 / FE 550D are TMT rebar grades; P&T runs IS 10748 HR coil → all FE-550 lines are 🚫 not relevant.
  • No forecast/target, run-rate, SFDC flag, or carry-forward fields exist → those lines are ⚠️ not possible today.
```

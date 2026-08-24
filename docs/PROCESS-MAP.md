# End-to-End Process Map

Main steps from Campaign Planning through RM opportunity creation (SFDC), the in-app pipeline, and
weekly Campaign Monitoring. **Person** and **System / Software** are left blank on purpose — for
process owners to fill in — except where a system is already known.

An Excel version of this table is at [`PROCESS-MAP.xlsx`](./PROCESS-MAP.xlsx).

## Flow

```
Campaign Planning (orders + Best Estimate → what to make & what coil to order)
        ↓
SFDC: RM Opportunity → SLO → SO (plant order)
        ↓
Category + Supply team confirm material readiness & invoice amount   [no system today]
        ↓
Invoice raised
        ↓
Coil Inward → Slitting → Production → Dispatch → Sales/Reporting
        └────────── runs in this app today; future: Zoho Creator ──────────┘
        ↓
Campaign Monitoring (weekly: planned vs produced, distributors to chase)
```

## Steps

| Step | Sub-step | Person | System / Software |
|---|---|---|---|
| 1. Campaign Planning | Demand for the cycle is derived from confirmed orders and distributors' Best Estimate, family by family | | |
| 1. Campaign Planning | SKU families are grouped into a shared campaign by coil width, size band, thickness ladder and grade | | |
| 1. Campaign Planning | Run-or-defer decided per family (Level 1 — by size); thickness ladder planned inside the campaign (Level 2 — by gauge) | | |
| 1. Campaign Planning | Mill assigned per family; campaign sequence set (changeover time, due dates, stock cover) | | |
| 1. Campaign Planning | Coil requirement derived from the planned tonnes — what raw material to order and by when | | |
| 1. Campaign Planning | Published as a rolling size-by-week program with per-family open/closed status and order cut-offs | | |
| 2. RM Opportunity | RM opportunity created in SFDC | | |
| 2. RM Opportunity | SLO created | | |
| 3. Order Creation | Supply chain reviews the SLO and identifies the plant that will fulfil it | | |
| 3. Order Creation | Order is created against that plant | | |
| 3. Order Creation | SO generated in SFDC, linked back to the SLO and the RM opportunity | | |
| 4. Material Readiness & Invoice Amount Check | Category team checks whether the ordered material is ready/available against the SO | | |
| 4. Material Readiness & Invoice Amount Check | Supply team works out the amount to be collected for the invoice, based on the SO and material readiness | | |
| 4. Material Readiness & Invoice Amount Check | Category and Supply teams coordinate manually (call/email) — no dedicated system today; this is the main gap in the process | | |
| 4. Material Readiness & Invoice Amount Check | Order becomes eligible for invoicing once both readiness and invoice amount are confirmed | | |
| 5. Invoicing | Invoice raised; invoice visibility available | | |
| 6. Coil Inward | Coil inwarded once invoiced — pipeline process begins | | Zoho Creator (future) |
| 6. Coil Inward | Mother HR coil registered: date, plant, coil ID, grade, thickness, width, weight, cost price, PO number | | Zoho Creator (future) |
| 7. Slitting | Mother coil picked; baby-coil widths entered | | Zoho Creator (future) |
| 7. Slitting | Weight & cost split proportionally across baby coils | | Zoho Creator (future) |
| 8. Production | Date, SKU and pieces recorded | | Zoho Creator (future) |
| 8. Production | FIFO suggestion reviewed; actual coil allocation confirmed/edited manually | | Zoho Creator (future) |
| 9. Dispatch | Daily Sales Excel uploaded | | Zoho Creator (future) |
| 9. Dispatch | Rows grouped into one dispatch per date × vehicle; coil trace inherited from Production | | Zoho Creator (future) |
| 10. Sales / Reporting | Confirmed / Non-confirmed / Pending to Dispatch / Invoiced tracked per distributor | | Zoho Creator (future) |
| 10. Sales / Reporting | Best Estimate maintained; MTD & daily reports generated | | Zoho Creator (future) |
| 11. Campaign Monitoring | Campaign progress tracked weekly — planned vs produced, by SKU | | |
| 11. Campaign Monitoring | Deferred families and idle mill-days flagged | | |
| 11. Campaign Monitoring | Distributors to chase decided — confirmed orders where payment hasn't come in | | |

## Notes

- **Step 4 is the main gap**: no system exists today for the Category/Supply team's material-readiness and invoice-amount check — it is coordinated manually.
- **Steps 6–10 run in this app** (the JSW Pipes & Tubes Inventory system) today. `System / Software` shows the planned future system, **Zoho Creator**.
- **Campaign Planning and Campaign Monitoring** reflect the P&T Command Centre design research (`.scratch/pt-os-research/`) — a screen-level design/prototype, not yet built as live software.
- **SLO** and **SO** are used as given; not expanded here since their exact meaning wasn't specified.
- Person and System / Software columns are blank except where noted, per instruction — for your team to complete.

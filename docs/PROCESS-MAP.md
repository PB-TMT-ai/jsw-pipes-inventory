# End-to-End Process Map

Main steps from RM opportunity creation (SFDC) through to dispatch and sales reporting.
**Person** and **System / Software** are left blank on purpose — for process owners to fill in.

## Flow

```
SFDC: RM Opportunity → SLO → SO (plant order)
        ↓
Category + Supply team confirm material readiness & invoice amount   [no system today]
        ↓
Invoice raised
        ↓
Coil Inward → Slitting → Production → Dispatch → Sales/Reporting
        └────────── runs in this app today; future: Zoho Creator ──────────┘
```

## Steps

| Step | Sub-step | Person | System / Software |
|---|---|---|---|
| 1. RM Opportunity | RM opportunity created in SFDC | | |
| 1. RM Opportunity | SLO created | | |
| 2. Order Creation | Supply chain creates the order at the relevant plant | | |
| 2. Order Creation | SO generated | | |
| 3. Material Readiness & Invoice Amount Check | Category team confirms material is ready | | |
| 3. Material Readiness & Invoice Amount Check | Supply team confirms the amount to be collected for the invoice | | |
| 4. Invoicing | Invoice raised; invoice visibility available | | |
| 5. Coil Inward | Coil inwarded once invoiced — pipeline process begins | | |
| 5. Coil Inward | Mother HR coil registered: date, plant, coil ID, grade, thickness, width, weight, cost price, PO number | | |
| 6. Slitting | Mother coil picked; baby-coil widths entered | | |
| 6. Slitting | Weight & cost split proportionally across baby coils | | |
| 7. Production | Date, SKU and pieces recorded | | |
| 7. Production | FIFO suggestion reviewed; actual coil allocation confirmed/edited manually | | |
| 8. Dispatch | Daily Sales Excel uploaded | | |
| 8. Dispatch | Rows grouped into one dispatch per date × vehicle; coil trace inherited from Production | | |
| 9. Sales / Reporting | Confirmed / Non-confirmed / Pending to Dispatch / Invoiced tracked per distributor | | |
| 9. Sales / Reporting | Best Estimate maintained; MTD & daily reports generated | | |

## Notes

- **Step 3 is the main gap**: no system exists today for the Category/Supply team's material-readiness and invoice-amount check — it is coordinated manually.
- **Steps 5–9 run in this app** (the JSW Pipes & Tubes Inventory system) today. This is planned to be replaced by **Zoho Creator** in future.
- **SLO** and **SO** are used as given; not expanded here since their exact meaning wasn't specified.
- Person and System / Software columns are intentionally blank, per instruction.

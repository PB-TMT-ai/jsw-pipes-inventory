# End-to-End Process Map

Main steps from Campaign Planning through RM opportunity creation (SFDC), quality/source approval,
CM (contract manufacturing) plant contracting, the in-app pipeline, weekly Campaign Monitoring, and
month-end close. **Person** and **System / Software** are left blank except where a name or system
is already known.

An Excel version of this table is at [`PROCESS-MAP.xlsx`](./PROCESS-MAP.xlsx).

## Flow

```
Campaign Planning → Quality & Source Approval
        ↓
RM Opportunity → Order Creation → CM Plant Contracting & Payment
        ↓
Material Readiness & Invoice Amount Check   [no system today]
        ↓
Invoicing → Coil Inward → Slitting → Production   [in this app; future: Zoho Creator]
        ↓
Dispatch → Sales/Reporting → Campaign Monitoring (weekly)
        ↓
Month-End Reconciliation (Excel) → Settlement / Net CN-DN (Zoho Books)
```

## Steps

| Step | Sub-step | Person | System / Software |
|---|---|---|---|
| 1. Campaign Planning | Requirement collected plant-wise; demand derived from confirmed orders and distributors' Best Estimate, family by family | Siddharth - Planning (dedicated resource needed) | |
| 1. Campaign Planning | SKU families are grouped into a shared campaign by coil width, size band, thickness ladder and grade | | |
| 1. Campaign Planning | Run-or-defer decided per family (Level 1 — by size); thickness ladder planned inside the campaign (Level 2 — by gauge) | | |
| 1. Campaign Planning | Mill assigned per family; campaign sequence set (changeover time, due dates, stock cover) | | |
| 1. Campaign Planning | Coil requirement derived from the planned tonnes — what raw material to order and by when | | |
| 1. Campaign Planning | Schedule planned and material ageing tracked against the plan | | |
| 1. Campaign Planning | Published as a rolling size-by-week program with per-family open/closed status and order cut-offs | | |
| 2. Quality & Source Approval | Incoming quality process set up | Arijit - Quality (associate role needed) | |
| 2. Quality & Source Approval | New TDC (technical delivery condition) and source approval for material sources | Arijit - Quality | |
| 3. RM Opportunity | RM opportunity created in SFDC | Atul - Sales | |
| 3. RM Opportunity | SLO created | Atul - Sales | |
| 4. Order Creation | Supply chain reviews the SLO and identifies the plant that will fulfil it | Sanjay Jha - Operations | |
| 4. Order Creation | Order is created against that plant | Sanjay Jha - Operations | |
| 4. Order Creation | SO generated in SFDC, linked back to the SLO and the RM opportunity | Sanjay Jha - Operations | |
| 5. CM Plant Contracting & Payment | Contracting and payment terms agreed with CM (contract manufacturing) plants | Vinay (interview done, confirmation pending) | |
| 6. Material Readiness & Invoice Amount Check | Category team checks whether the ordered material is ready/available against the SO | Debdeep - Planning & Sanjay Jha (CM side) (dedicated resource needed) | |
| 6. Material Readiness & Invoice Amount Check | Supply team works out the amount to be collected for the invoice, based on the SO and material readiness | Debdeep - Planning & Sanjay Jha (CM side) (dedicated resource needed) | |
| 6. Material Readiness & Invoice Amount Check | Category and Supply teams coordinate manually (call/email) — no dedicated tracker or system today; this is the main gap in the process | Debdeep - Planning & Sanjay Jha (CM side) (dedicated resource needed) | |
| 6. Material Readiness & Invoice Amount Check | Order becomes eligible for invoicing once both readiness and invoice amount are confirmed | | |
| 7. Invoicing → Production | Invoicing — invoice raised; invoice visibility available | | |
| 7. Invoicing → Production | Coil Inward — coil inwarded once invoiced; pipeline process begins | | Zoho Creator (future) |
| 7. Invoicing → Production | Coil Inward — mother HR coil registered: date, plant, coil ID, grade, thickness, width, weight, cost price, PO number | | Zoho Creator (future) |
| 7. Invoicing → Production | Slitting — mother coil picked; baby-coil widths entered | | Zoho Creator (future) |
| 7. Invoicing → Production | Slitting — weight & cost split proportionally across baby coils | | Zoho Creator (future) |
| 7. Invoicing → Production | Production — date, SKU and pieces recorded | | Zoho Creator (future) |
| 7. Invoicing → Production | Production — FIFO suggestion reviewed; actual coil allocation confirmed/edited manually | | Zoho Creator (future) |
| 8. Dispatch | Daily Sales Excel uploaded | | Zoho Creator (future) |
| 8. Dispatch | Rows grouped into one dispatch per date × vehicle; coil trace inherited from Production | | Zoho Creator (future) |
| 9. Sales / Reporting | Confirmed / Non-confirmed / Pending to Dispatch / Invoiced tracked per distributor | | Zoho Creator (future) |
| 9. Sales / Reporting | Best Estimate maintained; MTD & daily reports generated | | Zoho Creator (future) |
| 10. Campaign Monitoring | Campaign progress tracked weekly — planned vs produced, by SKU | | |
| 10. Campaign Monitoring | Deferred families and idle mill-days flagged | | |
| 10. Campaign Monitoring | Distributors to chase decided — confirmed orders where payment hasn't come in | | |
| 11. Month-End Reconciliation & Settlement | Reconcile the month — pull One Helix exports, run FIFO/Thickness close, commit to masters | Siddharth | Excel |
| 11. Month-End Reconciliation & Settlement | Book the settlement — record Net CN/DN | Siddharth | Zoho Books |

## Notes

- **Step 6 is the main gap**: no system exists today for the Category/Supply team's material-readiness and invoice-amount check — it is coordinated manually and needs "a proper tracker and mechanism." It requires coordination with plants, category team and supply team; the role also needs an understanding of credit and finance, and depends on fund availability.
- **Step 1's "material ageing" sub-step has no owner named** — a second, smaller gap alongside step 6.
- **Steps 2, 3, 4, 5, 6 and 11 carry named owners**, taken as given from the team's responsibility sheet — including two pending items: the Quality associate role in step 2 is not yet filled, and Vinay's role in step 5 is pending confirmation (interview done, status to be checked).
- **Steps 2 (Quality & Source Approval) and 5 (CM Plant Contracting & Payment) are new steps inferred from that responsibility sheet** — positioned here as the most logical fit (quality/source clearance before an opportunity is raised; CM contracting alongside order creation). Reposition if they sit elsewhere in the actual flow.
- **Step 7's Coil Inward / Slitting / Production sub-steps, plus steps 8 (Dispatch) and 9 (Sales / Reporting), run in this app** (the JSW Pipes & Tubes Inventory system) today. `System / Software` shows the planned future system, **Zoho Creator**. The Invoicing sub-step itself is SFDC-side, not this app, so it is left blank.
- **Campaign Planning and Campaign Monitoring** reflect the P&T Command Centre design research (`.scratch/pt-os-research/`) — a screen-level design/prototype, not yet built as live software.
- **SLO**, **SO** and **TDC** are used as given; not expanded beyond "technical delivery condition" for TDC, since exact meanings weren't specified.
- Person and System / Software columns are blank except where noted — for your team to complete.

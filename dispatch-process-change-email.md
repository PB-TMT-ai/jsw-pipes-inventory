**Subject:** Proposed change to material tracking & dispatch — for your input

Hi [Name],

I'd like to flag a proposed change to how we track material and record dispatch, aimed at **speeding up dispatch and improving visibility**. This is an early heads-up — I'd value your input on the trade-offs before we finalize anything.

**What we're proposing to change**

1. **Discontinue coil-to-finished-goods tracking.** Today we trace each mother coil through to the finished tube. We'd stop that detailed trace and instead rely on the **FIFO consumption model** to account for coil usage.
2. **Remove the Bundle Formation stage.** Finished goods would move directly from Production to Dispatch, removing one manual step.
3. **Capture dispatch from Salesforce.** Dispatch details would flow directly from Salesforce rather than being keyed again into the inventory system — making Salesforce the single source of truth for dispatch.

**Why** — this should shorten the dispatch cycle, remove duplicate data entry, and give us cleaner, near real-time visibility of dispatch.

**Key impacts to weigh**

- **Test certificates / quality traceability** — Without coil-to-FG tracking, we can't tie a dispatched tube back to a specific mother coil or heat, so **coil-specific test certificates will no longer be applicable**. If a quality issue arises, traceability becomes approximate (the likely coils by FIFO and date) rather than exact.
- **Costing basis** — Today we cost dispatch from the actual mother-coil cost. Without the coil link, costing would move to a **FIFO weighted-average (or standard) cost per SKU**. We'd need Finance to agree the new basis; per-invoice, per-coil margin visibility will reduce.
- **Salesforce as the source of dispatch** — This is new integration work. We'll need to agree which fields flow from Salesforce, how often they sync, and how dispatch reconciles against plant production and stock.
- **Inventory & yield visibility** — Stock and yield would be tracked at **SKU/plant level** (produced vs dispatched) rather than per coil.

**Points I'd like to align on**

- Does any customer or contract require coil-/heat-level test certificates? *(Quality)*
- Agreement on the revised costing basis. *(Finance)*
- Salesforce-to-inventory data scope, sync frequency, and who owns reconciliation. *(Sales / IT)*
- Cutover timing and how we treat existing coil-traced history (retained for reference).

Happy to walk through this in a short call. Please share any concerns or "must-keeps" so we can factor them in before finalizing.

Thanks,
[Your name]
Private Brand – Data, JSW

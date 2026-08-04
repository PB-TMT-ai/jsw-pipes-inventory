# Order lifecycle: the real states from receipt to invoice

Type: task
Status: open
Blocked by: —

## Question

The user wants "progress of the order and invoice" visible. A progress bar is a lie unless the underlying states are real and reliably stamped.

This is fact-gathering from the incumbent systems, not a design decision. It is HITL — the agent cannot see the ERP.

Produce:

- **The state list** — every state an order actually passes through from receipt to dispatch and invoice, in order. Include the unhappy paths: held, short-closed, partially dispatched, rejected, returned.
- **Where each state is stamped** — the table and field in the ERP that carries the timestamp, and whether it is set automatically or by a person.
- **Reliability per state** — which timestamps are trustworthy and which are entered late, in bulk, or backdated. A state stamped at month-end for the whole month is useless for a progress view and must be known as such.
- **Grain** — does an order carry line items per SKU, and can a line be partially fulfilled?
- **The link to production** — is an order tied to a campaign or production batch anywhere, or is that connection only in someone's head? This determines whether "inventory against the orders" can be computed at all.
- **Payment received against the order** — raised to a hard requirement by [Decision inventory](01-decision-inventory.md): "confirmed" in this business means **the money has arrived**, and that is the trigger for the owner's single most important decision. Establish where payment-against-order is recorded, at what grain (per order, per distributor, on account), how quickly it is posted, and whether a part-payment is distinguishable from a full one. Note this is *not* credit ageing, which is out of scope — it is payment matched to an expected order.

**Done when**: the state list exists with source fields and an honest reliability note per state, and the order↔production link is either found or confirmed absent.

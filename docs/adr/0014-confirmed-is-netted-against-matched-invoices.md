# Confirmed is netted against matched invoices, not taken raw from ERP column BE

Every surface that totals **Confirmed** — the Sales tab, the factory Dashboard, the per-month table,
the SKU Inventory table, and through them the PB MTD workbook and the daily WhatsApp message — now
reads `liveConfirmed(order, shippedByOrderLine(dispatches))` instead of the stored `order.confirmed`.

```
surplus       = orderLineInvoiced(o, shipped) − o.invoicedQty      // ≥ 0 by construction
liveConfirmed = max(0, o.confirmed − surplus)
```

The stored column is untouched. The netting happens on read, in one exported helper in
`src/lib/calc.js`, and the upload path is unchanged.

## The problem: the ERP's invoiced figure lags until Delivered

`confirmed` is not computed by this app. It is read straight off the One Helix Orders workbook's
column **BE, "Release − Invoiced Qty"** (`mapOrderRow` in `src/App.jsx`). The defect is in the ERP's
own `Invoiced Qty`: **it only fills up properly once an order line reaches `Delivered`.** While a
line sits at `Delivery in progress` the goods have been billed but the ERP still reports 0 (or
partial) invoiced — so `Release − Invoiced` never falls, and the line goes on claiming tonnage that
has already left the yard.

Measured on the live book, 21-Sep-2026:

| Order status | Zoho invoiced | ERP `invoiced_qty` | ERP short by |
|---|---|---|---|
| Delivered | 5,053.46 T | 5,053.47 T | **0.01 T** |
| Delivery in progress | 1,322.69 T | 1,008.87 T | **313.8 T** |
| Confirmed | 86.87 T | 49.65 T | **37.2 T** |

Confirmed read **559.9 T**, of which **335.8 T had already been invoiced** — 62 of 914 open lines.
The correct figure is **224.1 T**.

**It is not an upload-timing lag.** Both files were uploaded on 21-Sep at 04:56, twenty seconds
apart, and the gap still stood. It persists from invoicing until delivery confirmation — days or
weeks — so no upload discipline fixes it. "Upload the Orders file last each morning" was considered
and solves a problem that does not exist.

One line, to make it concrete: `JOO-JOPL-1147-9RL6VEI0W-474507` — 20 T ordered, 20 T released,
status `Delivery in progress`, ERP invoiced **0**, Zoho invoiced **20.035 T**. It reads as 20 T
still owed. It has shipped.

## Why netting per order line, and why it is safe

`orderLineInvoiced` takes the **larger** of (a) the Zoho tonnage matched to this line and (b) the
order sheet's own `invoicedQty`, so `surplus` is exactly the tonnage Zoho has billed that the ERP
snapshot did not know about. Two properties follow:

- **Self-cancelling.** Once the ERP catches up, `orderLineInvoiced === invoicedQty`, surplus is 0,
  and `liveConfirmed === o.confirmed`. The correction exists only while it is needed, and disappears
  by itself — there is nothing to switch off later.
- **Per line, never per SKU.** A same-SKU invoice raised against a *different* order can never
  reduce this line's Confirmed. That is the cross-month / cross-order confusion the older SKU-
  aggregate maths caused, and the reason the link is recovered per line at all.

### The matching is trustworthy

The Zoho register carries no order id. The link is recovered in `attributeInvoiceLine` via
`PurchaseOrder → child order → (child order, item name) → the order line's lineId`, stored as
`orderLineId` on each dispatch bundle entry. Across the **869 Delivered lines** — the ones where the
ERP's own figure is reliable — Zoho totals **5,053.46 T** against the ERP's **5,053.47 T**. 0.01 T of
disagreement over 5,000 T. The join is sound.

**Known fragility.** That line match is a string join on item name. If Zoho's item text ever drifts
from the ERP description, lines stop matching, `surplus` silently goes to 0, and the phantom tonnage
returns — quietly, with no error. `unmatchedOrderLines` on the invoice upload banner is the existing
detector, and deliberately remains the only one: a second detector for the same failure is a second
thing to keep true.

## Decision: clamp at zero, do not spill into Non-confirmed

Where `surplus` exceeds a line's own `confirmed`, the excess is **dropped**, not pushed into
`nonConfirmed`. Live exposure is **16.4 T** (352.2 T of total surplus against 335.8 T absorbed by
Confirmed). Nothing can go negative, and Non-confirmed keeps meaning one thing — ordered but never
released — rather than becoming a bucket that also holds over-invoicing.

## Rejected: treating `Delivery in progress` as closed, like `Delivered`

The blunt alternative — exclude those lines the way `Delivered` lines are already excluded — was
priced on the live book and is worse:

- It erases **441 T of real order book** to remove **301 T of phantom**, and still misses 35 T of
  phantom sitting on `Confirmed`-status lines.
- Of the 424.9 T Confirmed on those 258 lines, only 300.7 T is genuinely invoiced — **124.2 T is
  still genuinely owed** and would be deleted.
- All **317.1 T of Non-confirmed** on those lines goes too. That is ordered-but-never-released
  tonnage with nothing invoiced against it: live future business.
- Net effect: it swaps a 336 T **overstatement** for a 406 T **understatement** of Pending to
  Dispatch. Under-reporting the open book hides demand production is meant to be building against,
  which is the more expensive error of the two.

`Delivered` means closed. `Delivery in progress` means *part of a live order has shipped* — and the
blunt fix cannot tell the shipped part from the unshipped part. The netting can, because it works
per line and per invoice.

## Consequences

- **Free stock rises by what Confirmed loses.** `salesByDistributor` derives free stock as
  `onhand − allConfirmed`, and the per-plant cells as `onhandByPlant × (1 − allConfirmed / H)`.
  Lowering Confirmed by ~336 T raises region free stock by the same amount. This is a more accurate
  number, not a regression — Confirmed was overstated, so free stock was understated. ADR-0010's
  invariant is unaffected: both sides read the same `allConfirmed`, so the plant cells still sum to
  the area's Free Stock exactly, and a test now asserts that with netting active.
- **Servable – Unconfirmed and Pending to Dispatch (workbook sense) both move**, since both depend
  on what Confirmed claims off the floor. Expected, not a defect.
- **All four surfaces are netted together.** Netting some and not others would put the Sales tab and
  the WhatsApp report on different numbers — worse than the bug being fixed.
- **Two tallies in `scripts/servable-orders.mjs` stay raw on purpose**: `assertBundleTies`, an
  integrity check that must sum the raw stored values to tie against Postgres, and the out-of-scope
  tally beside it, a side note about excluded demand rather than a headline figure. Both are
  commented so neither is "fixed" later.
- **Nothing is netted at write time.** The stored `confirmed` remains the raw ERP column, so a
  re-upload, a re-read, or a future change of mind all start from the file as it was delivered.

## Open, not blocking

Do `Delivery in progress` lines ever get stuck in that status permanently? If some never reach
`Delivered`, part of the 124.2 T counted above as "genuinely still owed" may be stale for an
unrelated reason. It does not change this decision — the netting is per line and per invoice either
way — but it is worth a separate look.

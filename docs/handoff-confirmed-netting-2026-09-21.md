# Handoff — net Confirmed against invoices already raised

**Date:** 2026-09-21 · **Branch:** `claude/amazing-mayer-bvtm69` (off `origin/staging`) · **PR target:** `staging`
**Status:** investigated and sized, not built. Approach agreed, one decision taken (see §4).

This is a one-off work order, not a blueprint. If the fix lands and the approach proves reusable,
propose a blueprint then — `CLAUDE.md` requires asking before creating one.

---

## 1. Goal

`Confirmed` on every screen currently includes tonnage that has already been invoiced.
Net it out, per order line, against the invoices the app has already matched to that line.

**Live impact (21-Sep-2026):** Confirmed reads **559.9 T**; **335.8 T of that is already invoiced**.
Correct figure is **224.1 T**. 62 of 914 open order lines affected.

---

## 2. Why it happens — read this before touching code

Two files feed the app (`docs/adr/0013`): the One Helix **Orders** workbook and the Zoho **invoice
register**. They are separate uploads into separate stores.

`Confirmed` is not computed by the app. It is read straight off ERP column **BE, "Release −
Invoiced Qty"** (`src/App.jsx:2887`, via `mapOrderRow`).

The defect is in the ERP's own `Invoiced Qty`: **it only fills up properly once an order reaches
`Delivered`.** While a line sits at `Delivery in progress`, the goods have been billed but the ERP
still reports 0 (or partial) invoiced — so `Release − Invoiced` never falls.

Proven on live data, 21-Sep-2026:

| Order status | Zoho invoiced | ERP `invoiced_qty` | ERP short by |
|---|---|---|---|
| Delivered | 5,053.46 T | 5,053.47 T | **0.01 T** |
| Delivery in progress | 1,322.69 T | 1,008.87 T | **313.8 T** |
| Confirmed | 86.87 T | 49.65 T | **37.2 T** |

This is **not** an upload-timing lag. Both files were uploaded 21-Sep at 04:56, 20 seconds apart,
and the gap was still 335.8 T. It persists from invoicing until delivery confirmation — days or
weeks. No upload discipline fixes it.

**Example line:** `JOO-JOPL-1147-9RL6VEI0W-474507` — 20 T ordered, 20 T released, status
`Delivery in progress`, ERP invoiced **0**, Zoho invoiced **20.035 T**. Reads as 20 T still owed.
It has shipped.

---

## 3. The fix

Per order line:

```
surplus       = orderLineInvoiced(o, shipped) − o.invoicedQty      // ≥ 0 by construction
liveConfirmed = max(0, o.confirmed − surplus)
```

`orderLineInvoiced` (`src/lib/calc.js:750`) returns `max(Zoho tonnage matched to this line,
o.invoicedQty)`, so `surplus` is exactly the tonnage Zoho has billed that the ERP snapshot did not
know about. `shipped = shippedByOrderLine(dispatches)` (`src/lib/calc.js:735`).

**Self-cancelling by design:** once the ERP catches up, `orderLineInvoiced === invoicedQty`,
surplus is 0, and `liveConfirmed === o.confirmed`. The correction exists only while it is needed.

### The matching is trustworthy — do not re-litigate this

The Zoho register carries no order id. The link is recovered in `attributeInvoiceLine`
(`src/lib/calc.js` §"WHO A ZOHO LINE SHIPPED TO (ticket #193)", ~line 2483) via
`PurchaseOrder → child order → (child order, item name) → order line's lineId`, stored as
`orderLineId` on each dispatch bundle entry.

Validation: across the **869 Delivered lines**, Zoho totals **5,053.46 T** against the ERP's
**5,053.47 T** — 0.01 T of disagreement. The join is sound.

**Known fragility (already documented in that block):** the line match is a string join on item
name. If Zoho's item text ever drifts from the ERP description, lines stop matching, `surplus`
silently goes to 0, and the phantom tonnage returns. `unmatchedOrderLines` on the upload banner is
the existing detector. Do not add a second one; do mention this in the ADR.

---

## 4. Decision already taken

**When `surplus` exceeds the line's `confirmed`, clamp at zero. Do not spill the excess into
`nonConfirmed`.** Live exposure is **16.4 T** (352.2 T total surplus vs 335.8 T absorbed by
Confirmed). Simpler, and nothing can go negative.

---

## 5. Change surface

All four call sites **already receive `dispatches`**. No signature changes.

| File | Line | What to change |
|---|---|---|
| `src/lib/calc.js` | 1832 | `salesKpis` — `confirmed += salesNum(o.confirmed)` |
| `src/lib/calc.js` | 1944 | `salesByDistributor` — `const c = salesNum(o.confirmed)` |
| `src/lib/calc.js` | 2133 | `salesByMonth` — `r.confirmed += salesNum(o.confirmed)` |
| `src/lib/calc.js` | 1568 | `skuInventoryRows` — `pendingBySku[k] += salesNum(o.confirmed) + …` |

Add one shared exported helper next to `orderLineInvoiced` (~`calc.js:760`) and call it from all
four. Netting in some and not others puts the Sales tab and the WhatsApp report on different
numbers — worse than the bug.

### Inherits the fix automatically — do NOT edit

- **`src/lib/reports.js`** — consumes `r.confirmed` off `salesByDistributor` rows (`:344`, `:473`,
  `:640`) and `kpi.confirmed` off `salesKpis` (`:376`). `buildPlantMtdSummary` and the PB MTD
  workbook pick the fix up for free.
- **`scripts/servable-orders.mjs:425`** — its rows come from `salesByDistributor`.

### Leave alone deliberately

- **`scripts/servable-orders.mjs:244`** (`assertBundleTies`) — an integrity tie-out that must sum
  the **raw** stored values. Netting it would make the check compare a derived figure against a raw
  one and it would fail on every run.
- **`scripts/servable-orders.mjs:301`** — the out-of-scope tally. Netting is arguably more correct,
  but it is a side note about excluded demand, not a headline figure. Match whatever you do to
  `:244`'s reasoning and say so in the PR.

---

## 6. Downstream consequence you must check — free stock moves

`salesByDistributor` uses `allConfirmed` to derive free stock (`src/lib/calc.js:2085-2095`):

```
freeStock         = onhand − allConfirmed
confirmedFactor   = 1 − allConfirmed / H          // H = total on-hand across plants
freeStockByPlant  = onhandByPlant × confirmedFactor
```

Lowering Confirmed by ~336 T **raises region free stock by the same amount.** This is a more
accurate number, not a regression — Confirmed was overstated, so free stock was understated. But it
moves figures governed by `docs/adr/0002`, `0009` and `0010`, and it changes the Sales drill-down's
Free Stock column and the Distributor × SKU sheet's per-plant cells.

**Required:** confirm the plant cells still sum to the area figure (the invariant ADR-0010 rests
on), and note the shift in the PR body so nobody reads it as a bug.

Knock-on: `Servable – Unconfirmed` and `Pending to Dispatch` (workbook sense) both depend on what
Confirmed claims off the floor (`reports.js:585-613`), so both move too. Expected, not a defect.

---

## 7. Tests

`src/lib/calc.test.js` — 89 existing references to `confirmed`. Most pass unchanged (they supply no
matching dispatch, so surplus is 0). Expect breakage only where a fixture pairs a `confirmed` value
with a dispatch carrying the same `orderLineId`.

New cases to add:

1. Fresh snapshot — Zoho matched == `invoicedQty` → Confirmed unchanged (the self-cancelling case).
2. Stale snapshot — `invoicedQty: 0`, Zoho 20.035 against `confirmed: 20` → Confirmed 0.
3. Partial — `confirmed: 20`, `invoicedQty: 5`, Zoho 12 → Confirmed 13.
4. Overflow clamp — surplus > confirmed → Confirmed 0, `nonConfirmed` untouched (§4).
5. No `orderLineId` on the dispatch → no netting, Confirmed unchanged.
6. Delivered lines still excluded entirely (existing behaviour, `isDeliveredStatus`).
7. All four call sites agree on the same fixture — one test asserting `salesKpis`,
   `salesByDistributor` and `skuInventoryRows` return the same Confirmed total.

`src/lib/reports.test.js` — 70 references. Should pass untouched; if any fail, the fix leaked
somewhere it shouldn't have.

---

## 8. Verification against live data

Supabase project `hztblmccvvarmgxmunrp` ("Pipes and Tubes Inventory System"). Re-run this and
compare to the app after the change:

```sql
with zoho as (
  select trim(be->>'orderLineId') as line_id, sum((be->>'weight')::numeric) as zoho_wt
  from dispatches d, lateral jsonb_array_elements(coalesce(d.bundle_entries,'[]'::jsonb)) be
  where coalesce(d.deleted,false)=false and coalesce(trim(be->>'orderLineId'),'') <> ''
  group by 1
),
o as (
  select coalesce(o.confirmed,0) c, coalesce(o.invoiced_qty,0) inv, coalesce(z.zoho_wt,0) zoho
  from orders o left join zoho z on z.line_id = trim(o.line_id)
  where coalesce(o.deleted,false)=false and lower(coalesce(o.order_status,'')) <> 'delivered'
)
select round(sum(c),3)                                   as confirmed_before,
       round(sum(greatest(0, c - greatest(0, zoho - inv))),3) as confirmed_after,
       round(sum(least(c, greatest(0, zoho - inv))),3)    as removed
from o;
```

**Expected on 21-Sep-2026 data:** before 559.886 · after 224.061 · removed 335.825.
These will drift as new files are uploaded — re-run for the current figure, don't assert the
constants.

Whole-picture numbers on the same day, for the PR body:

| | Before | After |
|---|---|---|
| Confirmed | 559.9 T | 224.1 T |
| Non-confirmed | 4,257.7 T | unchanged |
| Pending to Dispatch (app's wide sense) | 4,817.5 T | 4,481.7 T |
| Indent / Total Orders (Sep MTD invoice 1,915.7 T) | 6,733.2 T | 6,397.4 T |

---

## 9. Rejected alternative — do not revisit without new evidence

**Treating `Delivery in progress` as closed, like `Delivered`.** Priced on live data and it is worse:

- Erases **441 T of real order book** to remove **301 T of phantom**, and still misses 35 T of
  phantom sitting on `Confirmed`-status lines.
- Of the 424.9 T Confirmed on those 258 lines, only 300.7 T is genuinely invoiced — **124.2 T is
  still genuinely owed** and would be deleted.
- All **317.1 T of Non-confirmed** on those lines would be deleted. That is ordered-but-never-
  released tonnage with nothing invoiced against it — live future business.
- Net: swaps a 336 T overstatement for a 406 T understatement on Pending to Dispatch. Under-
  reporting the open book hides demand production is meant to be building against.

`Delivered` means closed; `Delivery in progress` means part of a live order has shipped. The blunt
fix cannot tell the shipped part from the unshipped part.

Also rejected: **"upload the Orders file last each morning."** Solves a timing problem that does not
exist (see §2).

---

## 10. Docs to update with the change

- `CONTEXT.md` — the **Confirmed** entry. It currently reads "Ordered tonnage the ERP has released
  for dispatch but has not yet invoiced." That is the intent; say that the ERP's own figure does not
  deliver it until Delivered, and that the app nets the difference.
- `docs/ALGORITHMS.md` — the netting rule belongs with the weight/costing maths.
- `docs/adr/0014-*.md` — new ADR. Subject: Confirmed is netted against matched invoices, not taken
  raw from ERP column BE. Record the rejected alternative (§9) and the string-join fragility (§3).
- `LEARNINGS.md` — `CLAUDE.md` requires a log entry.
- The Sales tab footnote (`src/App.jsx:3520`) still reads
  `Confirmed = Release − Invoiced (orders confirmed, pending dispatch)`. It will be wrong. Update it.

---

## 11. Rules for this branch

From `CLAUDE.md`:

- Branch from `origin/staging`, **never** `main`:
  `git fetch origin staging && git checkout -B claude/amazing-mayer-bvtm69 origin/staging`
- **PR targets `staging`.** A PR raised from the Claude Code UI defaults to `main` — retarget it
  before anything else. This already went wrong once, on
  [PB-TMT-ai/jsw-pipes-inventory#180](https://github.com/PB-TMT-ai/jsw-pipes-inventory/pull/180).
- Keep the single-file `App.jsx` pattern.
- `.workspace/` is temp and never committed.

---

## 12. Open question, not blocking

Do `Delivery in progress` lines ever get stuck in that status permanently? If some never reach
`Delivered`, part of the 124.2 T counted above as "genuinely still owed" may be stale for an
unrelated reason. It does not change this fix — the netting is per line and per invoice either way —
but it is worth a separate look afterwards.

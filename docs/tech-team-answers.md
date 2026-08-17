# Pipes & Tubes — system logic

Business rules and entity connections for the new build. All eleven questions are answered and
nothing is open. Sales Dashboard is parked; its spec follows once production and dispatch are done.

---

## The chain

Everything else hangs off this. One object — the **allocation row** — carries traceability end to end.

```
Mother Coil ──slit──► Baby Coil ──consumed by──► Production Batch ──drawn by──► Invoice Line
  (bought)             (strip)                     (pipes made)                   (sold)

ALLOCATION ROW = { baby coil, mother coil, pieces, weight }
   created at Production · inherited unchanged by the Invoice Line
```

**Six rules that govern the whole model:**

1. Weight comes from the SKU master's **weight-per-tube**. The system never recalculates it at runtime.
2. **Pieces are stored; weight is derived** (`pieces × weight-per-tube`). Storing both lets them drift.
3. Every allocation row carries **both** the baby coil and its mother. Baby drives capacity, mother drives costing.
4. **Production consumes baby coils, never mother coils.** Counting both double-counts the steel.
5. Allocation is **many-to-many both ways** — one invoice line can span coils, one coil feeds many lines. Never store "the coil" as a single field.
6. **Impossible states block. Unusual states warn.** A warning that saves anyway is not a validation.

---

## 1. Invoice → Mother Coil traceability

The invoice line does not choose coils. It **inherits** them from production, oldest batch first.

```
1. Queue every allocation row for this SKU, oldest production date first.
2. Discard from the head the pieces already taken by earlier invoice lines of the same SKU.
3. Take the next N pieces off the head; split a row when only part of it is needed
   (weight-per-piece within a row = row weight ÷ row pieces).
4. Store the resulting rows on the invoice line.
```

A line for 500 pieces may carry three allocation rows across two mother coils. That is correct.

**To report "how much of coil X was dispatched":** sum allocation-row weights where mother = X. Never
sum the invoice line's total weight — that dumps a multi-coil line onto one coil.

---

## 2. The three POs — one per stage

```
  Vendor PO          Contractor PO           Customer PO
 (we buy steel)   (we buy manufacturing)   (they buy pipe)
       │                   │                     │
       ▼                   ▼                     ▼
 Mother Coil ─► Baby Coil ─► Production Batch ─► Invoice Line
```

| PO | Attaches to | Answers |
|---|---|---|
| **Vendor / Steel PO** | The mother coil; inherited by its baby coils | Which purchase did this steel arrive on |
| **Contractor PO** | The production batch | Which pipes a contractor made, and how much of that PO is still open |
| **Customer PO** | The customer order; the invoice line carries the order reference | Which customer commitment this shipment settles |

**Never merge them into one "PO" column.** The invoice line reaches all three by following the chain —
no PO field on dispatch is needed:

```
Invoice line ─► allocation rows ─► mother coil       ─► Vendor PO
Invoice line ─► allocation rows ─► production batch  ─► Contractor PO
Invoice line ─► order reference ─► customer order    ─► Customer PO
```

---

## 3. Weights

```
Invoice weight  = the billed quantity, taken as-is from the sales document. Never derived.
Pieces          = invoice weight ÷ weight-per-tube   (reverse it if the document's unit is pieces)
Dispatch weight = Σ allocation-row weights on that line where mother coil = X
  for coil X
```

**Coil-level summary:**

| Figure | Definition |
|---|---|
| Coil weight | The coil's plant-measured **actual** weight |
| Produced weight | Σ allocation weights on production batches for this coil |
| Dispatched weight | Σ allocation weights on invoice lines for this coil |
| Balance to produce | Coil weight − Produced weight |
| Produced inventory | Produced weight − Dispatched weight |

**A coil has two weights; only one is used for calculation.** The *supplier invoice weight* (what we
were billed) and the *plant actual weight* (weighbridge). **All calculations use the actual weight** —
the invoice weight is a procurement variance reference only, unrelated to the sales invoice.

**Invoice weight and coil-attributed weight are different grains** and will only reconcile in total,
never row-for-row.

---

## 4. Baby coil — capacity, usage, status

```
capacity = (this baby's width ÷ Σ widths of all babies from this mother) × mother's actual weight
used     = Σ allocation weights where baby coil = this one
free     = capacity − used
% used   = used ÷ capacity × 100
```

Cost splits the same way, so cost-per-MT is identical for a mother and every baby cut from it. That
identity is what lets costing key on the mother.

**`used` is derived, not stored** — compute it from pieces at read time.

### Status: Active or Consumed

- **Active** — selectable in production
- **Consumed** — manually flagged as finished or unusable; hidden from selection

The flag is **manual**, and hiding the coil is its only effect. A coil at 97% or 100% used is **not**
auto-hidden — a scrap end is a real object and only the operator knows if it is usable.

**There is no Confirmed/Open on a baby coil.** Confirmed and Non-confirmed belong to the order book:
Confirmed = released for dispatch but not invoiced; Non-confirmed = ordered but not released; the two
together are Pending to Dispatch.

### The freeze rule

**A baby coil's weight freezes the moment production consumes it, and never re-splits again.**

```
Before any baby of this mother is consumed
    each baby = (its width ÷ Σ all baby widths) × mother's actual weight
    re-splits freely as siblings are added, edited or deleted

After the first baby is consumed
    frozen babies      keep their weight permanently
    unfrozen remainder = mother's actual weight − Σ frozen weights
    unfrozen babies    = (its width ÷ Σ unfrozen widths) × unfrozen remainder
```

A frozen weight stays correct even if the mother's weight is later corrected — the correction moves
only the unfrozen remainder. **If that remainder would go negative, refuse the edit** and show what is
already committed; it is a data error, not a split to compute.

### Why % used can exceed 100

| Cause | Rule for the new build |
|---|---|
| Manual allocation with no capacity check at write time | **Hard-block above 105%.** Pair it with a one-click "redistribute the excess" so the operator is not stuck |
| Weight re-split after consumption | Solved by the freeze rule above |
| Mother's weight edited after slitting without re-splitting | Re-split the unfrozen babies in the same transaction |
| Weight-per-tube edited after production | Self-consistent with derived weights; log it, and never allow a published SKU without a weight |

**100–105% is a deliberate over-fill tolerance** — saveable with a warning. Above 105% is physically
impossible and must be refused.

---

## 5. Coil inward vs dispatch

```
Entered by hand:  coil inward → slitting → production (SKU, pieces, coil selection)
Imported:         invoices, from the sales document
Derived:          the invoice→coil linkage. Nobody types it, ever.
```

**Dispatch must not be hand-enterable.** It is the billing record and the ERP owns it; manual entry
means two systems disagreeing about revenue.

**Editing a coil record** covers only its own master data — inward date, coil number, grade, heat
number, thickness, width, supplier invoice weight, actual weight, vendor PO. It is not a route to
adjust dispatch. Guards:

- Changing **actual weight** must re-split the unfrozen baby coils in the same transaction.
- Changing **thickness or width** after slitting invalidates every downstream match — block it once babies exist.
- **Deleting** is blocked once the coil is slit or consumed.

---

## 6. Slitting width check

Do the strips being cut actually fit across the mother coil?

```
sum = Σ widths of all baby coils from this mother (saved + being entered now)

sum ≤ motherWidth − trim                →  OK          (trim allowance intact, trim ≈ 5 mm)
motherWidth − trim < sum ≤ motherWidth  →  WARN        (trim eaten into — verify)
sum > motherWidth                       →  BLOCK       (more strip than steel exists)
```

Also blocking: duplicate baby coil identifiers. *(Use a numeric sequence for baby IDs, not a letter
suffix — a letter suffix silently caps a mother at 26 babies.)*

> This is **not** the production width match in Q7. Here: Σ baby widths vs **mother width**. There:
> one baby's width vs **the strip a pipe needs**. Name them differently.

---

## 7. Which baby coils fulfil a SKU (Production)

**The system suggests. A human confirms.** It must never auto-commit a coil selection.

### Strip width — the width a pipe consumes

```
Strip width = perimeter − 2t          t = wall thickness (mm)

   SHS / RHS   →  2 × (Height + Breadth) − 2t
   CHS / ERW   →  π × Outside Diameter  − 2t

Example: 50 × 50 × 4.0  →  200 − 8  =  192 mm

Match tolerance: ±1 mm
```

### Eligibility — three filters, then an order

```
ELIGIBLE = a baby coil passing all three:

  1. WIDTH      |baby width − strip width| ≤ 1 mm
  2. THICKNESS  the plant's RM→FG rule table — NOT a tolerance band
  3. AVAILABLE  not scrapped, not flagged Consumed, free capacity > 0

ORDER    oldest slit date first (FIFO), then:
           fill each coil to 97% → move to the next
           then top up to 100%
           then, only if pieces remain, into the 100–105% over-fill band
         Whole pieces only. Any remainder is a shortfall warning, never a block.
```

**±1 mm is tight by design** — a coil is either the right strip or it is not. The consequence is that
slitting must be planned to hit the target widths; it cannot rely on a wide band to absorb error.

### Thickness is a lookup table, not a band

Which coil gauge rolls which pipe gauge is a plant rule sheet. The relation is **asymmetric and
many-to-many**:

- A **2.3 coil rolls 2.5 pipe — but 2.5 never rolls 2.3.**
- A **3.0 coil rolls both 3.0 and 3.2.**
- A **2.2 coil rolls both 2.2 and 2.3.**

A ±band fails in both directions: it admits pairings the mill never runs and cannot express the
one-to-many rows at all. **If a finished gauge is absent from the sheet, the answer is "no eligible
coil" — never a fallback to a band.**

### Suggest, don't commit

Wrong suggestions make operators override by hand, and unvalidated overrides are what put steel on
coils that could not hold it. Fix the rule, hard-block the impossible case, keep the confirmation step.

**The manual override list must be wider than the suggestion** — show every coil with meaningful free
capacity, spec-matched ones flagged and sorted first. The floor sometimes must run an off-spec coil,
and a picker that hides them forces a workaround nobody can see.

---

## 8. Contractor PO

**Definition: the PO we issue to a contract manufacturer to produce pipes for us.** It attaches to the
**production batch** — the event it buys.

**It is job work on our own coil.** We supply the steel, already in our system; the contractor only
converts it. The traceability chain is therefore **fully intact** — a contractor batch consumes our
baby coils and carries the same allocation rows as an in-house one. The only difference is where the
machine stood.

**The production batch gains:**

| Attribute | Values |
|---|---|
| Made by | Own plant / Contractor |
| Contractor | which contractor |
| Contractor PO | which PO it was made against |

**The Contractor PO document:**

```
Header : contractor, PO date, agreed conversion rate, status, job-work flag
Lines  : SKU, ordered quantity, delivery date
```

**What the linkage gives:**

| Question | Answer |
|---|---|
| Produced against PO X? | Σ pieces on batches referencing X |
| Still open on X? | ordered − produced, per SKU line |
| Dispatched / invoiced against X? | inherited through the allocation chain |
| Cost of contractor-made stock? | coil cost (via mother) + **the PO's** conversion rate |

**Costing note:** the SKU master's conversion fields are our own plant's rates. For a contractor batch
the rate comes from the Contractor PO. Build it as: own plant → SKU ladder; contractor → PO rate.

**Two things to build because the steel physically leaves the plant:**

1. **Material issue / return movement** against the PO — coil sent out, pipe received back. Without it
   nobody can see what steel is sitting at a contractor's premises.
2. **Yield per Contractor PO** — steel issued vs finished weight received. On job work this is the
   number that matters commercially, and the chain already holds both halves.

---

## 9. SKU master

**Source: the SKU master maintained by Shubham Narwane. None of these fields are in Zoho Books** — the
ERP carries only the item code and description that appear on transactions. Everything below is master
data to be set up and maintained in the new system.

### Weight of one tube

Used **once**, to build the master value. The running system then reads the master and never
recalculates. **Steel density = 7.85 g/cm³.** Dimensions in mm, result in kg.

```
SHS / RHS      Area (mm²) = 2 × t × (H + B) − 4 × t²
CHS / ERW      Area (mm²) = π × (OD − t) × t

Weight (kg)  =  Area × Length × 7.85 ÷ 1,000,000

  H = height   B = breadth   t = wall thickness   OD = outside diameter   L = length
  SHS is simply the case where H = B.
```

| Example | Working | Weight/tube |
|---|---|---|
| SHS 25×25×2.50×6000 | `2(2.5)(50) − 4(2.5²) = 225` | **10.5975 kg** |
| RHS 200×100×2.20×6000 | `2(2.2)(300) − 4(4.84) = 1300.64` | **61.260144 kg** |
| CHS 32 NB (OD 42.4) ×2.20×6000 | `π(42.4 − 2.2)(2.2) = 277.8425` | **13.086380 kg** |

**Two conventions to hold to:**
- **Sharp corners** — no radius deduction. Real sections are marginally lighter; stay consistent.
- **Nominal Bore is a label, not a dimension.** "32 NB" means OD 42.4 mm; only OD is calculated with.

### Required fields

| # | Field | Set by | Purpose |
|---|---|---|---|
| 1 | SKU code | Derived; **immutable once used** | The join key to the ERP. Renaming it orphans all history |
| 2 | Description | Derived | Fallback match when a document omits the code |
| 3 | **Product type** — SHS/RHS/CHS/ERW | Manual | Selects both the weight formula and the strip-width formula, so it decides coil eligibility |
| 4–5 | Height, Breadth (mm) | Manual | SHS/RHS geometry → weight and strip width |
| 6 | Nominal bore | Manual | CHS label only — never calculated with |
| 7 | Outside diameter (mm) | Manual | CHS geometry → weight and strip width |
| 8 | Thickness (mm) | Manual | Weight, strip width, and the coil-gauge match |
| 9 | Length (mm) | Manual | Weight and reporting |
| 10 | HSN code | Manual | Statutory reporting |
| 11 | Status — published / draft | Manual | Only published SKUs are selectable in production |
| 12 | **Weight per tube (kg)** | **Manual, mandatory** | The single source of every weight. **Refuse to publish a SKU without it** — otherwise its batches and invoices record zero tonnes |
| 13 | Base conversion (₹/MT) | Manual | In-house conversion base rate |
| 14 | Thickness extra (₹/MT) | Manual | In-house gauge premium |
| 15 | Ladder price (₹/MT) | **Derived** | base conversion + thickness extra |
| 16 | Total conversion (₹) | **Derived** | weight per tube × ladder price ÷ 1000 |

**"Conversion Form" is not required** — do not build it. Fields 13–16 are the whole conversion model.

**Two data-integrity rules:** enforce SKU code uniqueness in the database, not just the UI; and match
on a normalised identity before allowing a new SKU, so `1.6×6000` and `1.60×6000` cannot both exist and
fragment inventory across two codes.

---

## 10. Sales Dashboard — parked

Spec to follow once production and dispatch are complete. One structural rule to hold to meanwhile:

```
Physical    coil inward → slitting → production   →  stock, coil tracking, RM and FG reports
Commercial  imported sales documents               →  order book, invoices, all sales figures
```

**Production data must never feed sales figures.** Producing 500 tonnes changes stock; it does not
change sales until those tonnes are invoiced. Merging the lanes counts tonnage as revenue before it is
billed, and unwinding that later is expensive.

---

## 11. Production entry timing

**Created after production completes.** It is a completion record, not a work order: date, SKU, pieces
made, coils consumed, plus made-by and Contractor PO where applicable.

It cannot be created up front because **the production entry is the consumption event**:

```
1. debits capacity from the baby coils it names   → drives every free/used figure and the 105% block
2. adds tonnage to finished-goods stock            → makes it sellable
3. makes those pieces available to invoice lines   → the FIFO queue in Q1
```

An entry made before the run consumes steel still on the floor and creates stock that does not exist.

**Status on a production record describes allocation** — all pieces assigned to a coil, partially, or
not at all. Not manufacturing progress. Don't overload one field with both.

**If planned production is ever needed**, model it as a separate entity — a plan with a target quantity
and expected date — and keep the consumption event distinct, created only on completion. A Contractor
PO line is already exactly this shape; follow it rather than inventing a second pattern.

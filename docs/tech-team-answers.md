# Pipes & Tubes — system logic

Business rules and entity connections for the new build. Nothing is open. The Sales Dashboard is
parked; its spec follows once production and dispatch are done.

---

## The chain

One object — the **allocation row** — carries traceability end to end. Everything else follows from it.

```
Mother Coil ──slit──► Baby Coil ──consumed by──► Production Batch ──drawn by──► Invoice Line
  (bought)             (strip)                     (pipes made)                   (sold)

ALLOCATION ROW = { baby coil, mother coil, pieces, weight }
   created at Production · inherited unchanged by the Invoice Line
```

**Six rules govern the whole model:**

1. Weight comes from the SKU master's **weight-per-tube**. Never recalculated at runtime.
2. **Store pieces; derive weight** (`pieces × weight-per-tube`). Store both and they drift apart.
3. Every allocation row carries **both** coils. Baby drives capacity, mother drives costing.
4. **Production consumes baby coils, never mother coils.** Counting both double-counts the steel.
5. Allocation is **many-to-many both ways** — a line can span coils, a coil feeds many lines. Never store "the coil" as one field.
6. **Impossible states block. Unusual states warn.** A warning that saves anyway is not a validation.

---

## 1. Invoice → Mother Coil traceability

The invoice line does not choose coils. It **inherits** them from production, oldest batch first.

```
1. Queue every allocation row for this SKU, oldest production date first.
2. Drop from the head the pieces already taken by earlier invoice lines of the same SKU.
3. Take the next N pieces off the head; split a row when only part of it is needed
   (weight per piece within a row = row weight ÷ row pieces).
4. Store the resulting rows on the invoice line.
```

One line can carry several rows across more than one mother coil. That is correct.

---

## 2. The three POs — one per stage

```
  Vendor PO          Contractor PO           Customer PO
 (we buy steel)   (we buy manufacturing)   (they buy pipe)
       │                   │                     │
       ▼                   ▼                     ▼
 Mother Coil ─► Baby Coil ─► Production Batch ─► Invoice Line
```

| PO | Sits on | Invoice line reaches it via |
|---|---|---|
| **Vendor / Steel PO** | The mother coil; inherited by its babies | allocation rows → mother coil |
| **Contractor PO** | The production batch | allocation rows → batch |
| **Customer PO** | The customer order | order reference → order |

**Never merge them into one "PO" column** — they sit at three stages and answer three questions.
**No PO field is needed on dispatch:** all three are reached by following the chain.

---

## 3. Weights

```
Invoice weight   = the billed quantity, taken as-is from the sales document. Never derived.
Pieces           = invoice weight ÷ weight-per-tube   (reverse it if the document's unit is pieces)
```

**Coil-level summary:**

| Figure | Definition |
|---|---|
| Coil weight | The coil's plant-measured **actual** weight |
| Produced weight | Σ allocation weights on production batches for this coil |
| Dispatched weight | Σ allocation weights on invoice lines for this coil |
| Balance to produce | Coil weight − Produced weight |
| Produced inventory | Produced weight − Dispatched weight |

**A coil has two weights, and only one is used.** Supplier invoice weight is what we were billed;
actual weight is what the weighbridge says. **All calculations use the actual weight** — the invoice
weight is a purchase variance reference, nothing to do with the sales invoice.

**Never attribute a whole invoice line to one coil.** Line weight and coil weight reconcile only in
total, never row for row.

---

## 4. Baby coil — capacity, usage, status

```
capacity = (this baby's width ÷ Σ widths of all babies from this mother) × mother's actual weight
used     = Σ allocation weights where baby coil = this one
free     = capacity − used
% used   = used ÷ capacity × 100
```

Cost splits by width too, so cost per MT is the same for a mother and its babies — which is what lets
costing key on the mother.

### Status: Active or Consumed

- **Active** — selectable in production
- **Consumed** — manually flagged as finished or unusable; hidden from selection, and that is its only effect

Nothing sets this automatically. A coil at 97% or even 100% used is **not** auto-hidden — a scrap end
is a real object, and only the operator knows whether it can still be run.

**A baby coil has no Confirmed/Open status.** Those belong to the order book: Confirmed = released but
not invoiced, Non-confirmed = ordered but not released, and the two together are Pending to Dispatch.

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

A frozen weight stays correct even if the mother's weight is corrected later — the correction moves
only the unfrozen remainder. **If that remainder would go negative, refuse the edit** and show what is
already committed. That is a data error, not a split to compute.

### Why % used can exceed 100

Two causes, both preventable:

- **Allocation saved without a capacity check.** Block anything above 105% at the point of save, and
  give the operator one click to redistribute the excess.
- **Weight moving after the fact** — a sibling re-split, a corrected mother weight, an edited
  weight-per-tube. The freeze rule handles the first two; for the third, never allow a published SKU
  without a weight.

**100–105% is a genuine over-fill tolerance** — warn and save. **Above 105% is impossible** — refuse.

---

## 5. Coil inward vs dispatch

```
Entered by hand :  coil inward → slitting → production
Imported        :  invoices, from the sales document
Derived         :  the invoice → coil link
```

**Dispatch must not be hand-enterable.** It is the billing record and the ERP owns it. Hand entry
means two systems disagreeing about revenue.

**Editing a coil changes only its own master data** — inward date, coil number, grade, heat number,
thickness, width, invoice weight, actual weight, vendor PO. It is not a route to adjust dispatch.
Three guards:

- **Actual weight** — re-split the unfrozen babies in the same transaction.
- **Thickness or width** — block once babies exist; every downstream match depends on them.
- **Delete** — blocked once the coil is slit or consumed.

---

## 6. Slitting width check

Do the strips being cut fit across the mother coil?

```
sum = Σ widths of all babies from this mother (saved + being entered now)

sum ≤ motherWidth − trim                →  OK      (trim allowance intact, trim ≈ 5 mm)
motherWidth − trim < sum ≤ motherWidth  →  WARN    (trim eaten into — verify)
sum > motherWidth                       →  BLOCK   (more strip than steel exists)
```

Duplicate baby coil identifiers also block. *(Number baby IDs in sequence — a letter suffix silently
caps a mother at 26 babies.)*

> Not the same as the production width match in Q7. **Here:** Σ baby widths vs mother width.
> **There:** one baby's width vs the strip a pipe needs. Give them different names.

---

## 7. Which baby coils fulfil a SKU (Production)

**The system suggests, a human confirms.** It must never commit a coil selection on its own — wrong
suggestions make operators override by hand, and unchecked overrides are what put more steel on a coil
than it could hold.

### Strip width — what a pipe consumes

```
Strip width = perimeter − 2t          t = wall thickness (mm)

   SHS / RHS   →  2 × (Height + Breadth) − 2t
   CHS / ERW   →  π × Outside Diameter  − 2t

Example: 50 × 50 × 4.0  →  200 − 8  =  192 mm
```

### Eligibility — three filters, then an order

```
ELIGIBLE = a baby coil passing all three:

  1. WIDTH      |baby width − strip width| ≤ 1 mm
  2. THICKNESS  the plant's RM→FG rule table — not a tolerance band
  3. AVAILABLE  not scrapped, not flagged Consumed, free capacity > 0

ORDER    oldest slit date first (FIFO), then:
           fill each coil to 97% → move to the next
           then top up to 100%
           then, only if pieces remain, into the 100–105% band
         Whole pieces only. Any remainder is a shortfall warning, never a block.
```

**±1 mm is tight on purpose** — a coil is either the right strip or it is not. So slitting has to be
planned to hit target widths; there is no wide band to absorb error.

**The manual override list must be wider than the suggestion** — show every coil with real free
capacity, matched ones flagged and sorted first. The floor sometimes has to run an off-spec coil, and
hiding them only forces a workaround nobody can see.

### Thickness is a lookup table, not a band

Which coil gauge rolls which pipe gauge is a plant rule sheet, and the relation is **asymmetric and
many-to-many**: a 2.3 coil rolls 2.5 pipe but 2.5 never rolls 2.3; a 3.0 coil rolls both 3.0 and 3.2.

A ±band fails both ways — it allows pairings the mill never runs, and cannot express the one-to-many
rows at all. **If a finished gauge is not on the sheet, the answer is "no eligible coil" — never fall
back to a band.**

---

## 8. Contractor PO

**The PO we issue to a contract manufacturer to produce pipes for us.** It sits on the **production
batch** — the event it buys.

**It is job work on our own coil.** We supply steel that is already in our system; the contractor only
converts it. So the chain stays intact — a contractor batch consumes our baby coils and carries the
same allocation rows as an in-house one. The only difference is where the machine stood.

**The production batch gains three attributes:** made by (own plant / contractor), which contractor,
and which Contractor PO.

**The Contractor PO document:**

```
Header : contractor, PO date, agreed conversion rate, status
Lines  : SKU, ordered quantity, delivery date
```

**What the linkage answers:**

| Question | Answer |
|---|---|
| Produced against PO X? | Σ pieces on batches referencing X |
| Still open on X? | ordered − produced, per SKU line |
| Dispatched or invoiced against X? | inherited through the allocation chain |
| Cost of contractor-made stock? | coil cost (via the mother) + **the PO's** conversion rate, not the SKU's |

**Two things to build, because the steel physically leaves the plant:**

1. **Material issue and return** against the PO — coil sent out, pipe received back. Without it nobody
   can see what steel is sitting at a contractor's premises.
2. **Yield per Contractor PO** — steel issued vs finished weight received. The allocation chain already
   holds both halves.

---

## 9. SKU master

**Source: the SKU master maintained by Shubham Narwane. None of these fields are in Zoho Books** — the
ERP carries only the item code and description that appear on transactions. All of it is master data
to be set up and maintained in the new system.

### Weight of one tube

This builds the master value. **Steel density = 7.85 g/cm³.** Dimensions in mm, result in kg.

```
SHS / RHS      Area (mm²) = 2 × t × (H + B) − 4 × t²
CHS / ERW      Area (mm²) = π × (OD − t) × t

Weight (kg)  =  Area × Length × 7.85 ÷ 1,000,000

  H = height   B = breadth   t = wall thickness   OD = outside diameter
  SHS is the case where H = B.
```

| Example | Working | Weight/tube |
|---|---|---|
| SHS 25×25×2.50×6000 | `2(2.5)(50) − 4(2.5²) = 225` | **10.5975 kg** |
| CHS 32 NB (OD 42.4) ×2.20×6000 | `π(42.4 − 2.2)(2.2) = 277.8425` | **13.086380 kg** |

Two conventions: **sharp corners**, no radius deduction — real sections are marginally lighter, so
stay consistent. And **Nominal Bore is a label, not a dimension** — "32 NB" means OD 42.4 mm, and only
OD is calculated with.

### Required fields

| # | Field | Set by | Purpose |
|---|---|---|---|
| 1 | SKU code | Derived; **immutable once used** | The join key to the ERP. Renaming it orphans all history |
| 2 | Description | Derived | Fallback match when a document omits the code |
| 3 | **Product type** — SHS/RHS/CHS/ERW | Manual | Picks the weight and strip-width formulas, so it decides coil eligibility |
| 4–5 | Height, Breadth (mm) | Manual | SHS/RHS geometry |
| 6 | Nominal bore | Manual | CHS label only — never calculated with |
| 7 | Outside diameter (mm) | Manual | CHS geometry |
| 8 | Thickness (mm) | Manual | Weight, strip width, and the coil-gauge match |
| 9 | Length (mm) | Manual | Weight and reporting |
| 10 | HSN code | Manual | Statutory reporting |
| 11 | Status — published / draft | Manual | Only published SKUs are selectable in production |
| 12 | **Weight per tube (kg)** | **Manual, mandatory** | The single source of every weight. **Refuse to publish without it** — otherwise its batches and invoices record zero tonnes |
| 13 | Base conversion (₹/MT) | Manual | In-house rate, base |
| 14 | Thickness extra (₹/MT) | Manual | In-house gauge premium |
| 15 | Ladder price (₹/MT) | **Derived** | base conversion + thickness extra |
| 16 | Total conversion (₹) | **Derived** | weight per tube × ladder price ÷ 1000 |

**"Conversion Form" is not required** — do not build it. Fields 13–16 are the whole conversion model.

**Two integrity rules:** enforce SKU code uniqueness in the database, not just the screen; and match on
a normalised identity before creating a SKU, so `1.6×6000` and `1.60×6000` cannot both exist and split
one product across two codes.

---

## 10. Sales Dashboard — parked

Spec to follow once production and dispatch are complete. One rule to hold to meanwhile:

```
Physical    coil inward → slitting → production   →  stock, coil tracking, RM and FG reports
Commercial  imported sales documents              →  order book, invoices, all sales figures
```

**Production data must never feed sales figures.** Producing 500 tonnes changes stock; it changes
sales only once those tonnes are invoiced. Merge the lanes and tonnage counts as revenue before it is
billed.

---

## 11. Production entry timing

**Created after production finishes.** It is a completion record, not a work order: date, SKU, pieces
made, coils consumed, plus made-by and Contractor PO where they apply.

It cannot be created up front, because **the production entry is the consumption event.** Saving it
debits the baby coils it names, adds tonnage to finished stock, and releases those pieces to the
invoice queue in Q1. Create it before the run and it consumes steel still sitting on the floor.

**Status here means allocation** — all pieces assigned to a coil, some, or none. Not manufacturing
progress. Don't overload one field with both.

**If planned production is ever needed**, model it separately: a plan with a target quantity and
expected date, with consumption still recorded only on completion. A Contractor PO line is already
this shape — follow it rather than inventing a second pattern.

# Pipes & Tubes — business logic and entity connections

> For a **new build**. This describes *what the system must do and how the entities connect* —
> not how the current app does it. No screens, no tables, no code. Every rule below is stated so it
> can be implemented on any stack.
>
> **8 of the 11 questions have a definite answer.** Three need a decision from the business before
> anyone can build them: the Contractor PO (Q2/Q8) and "Conversion Form" (Q9).

---

## 0. The spine — read this before the individual answers

Six of the eleven questions are the same question asked from different ends: *how does a finished
invoice line get back to the steel it was made from?* The answer is one chain, and everything else
hangs off it.

```
Mother Coil ──slit──► Baby Coil ──consumed by──► Production Batch ──drawn by──► Invoice Line
  (bought)             (strip)                    (pipes made)                  (sold)

Linkage carrier:  ALLOCATION ROW = { baby coil, mother coil, pieces, weight }
                  created at Production, inherited unchanged by the Invoice Line
```

**Seven principles the whole model rests on:**

1. **Weight always comes from the SKU's weight-per-tube.** Never from a density formula, never from a
   thickness×area calculation. One number per SKU, mastered by hand.
2. **Pieces are load-bearing; weight is derived.** Store pieces, compute `weight = pieces ×
   weight-per-tube`. If you store weight too, the two drift the moment a master value is corrected.
3. **Every allocation row carries both the baby coil and its mother.** The baby drives capacity; the
   mother drives costing and all coil-level reporting. Storing only one of them breaks half the reports.
4. **Production consumes baby coils, never mother coils.** Once a mother is slit, its steel lives in
   its babies. Counting both double-counts.
5. **Allocation is many-to-many in both directions.** One invoice line can come from several mother
   coils; one mother coil feeds many invoice lines. Never model "the coil" as a single field on a
   line — it will silently be wrong the first time a batch spans two coils.
6. **Impossible states block; unusual states warn.** A warning that can be clicked past will be
   clicked past, every shift, for months. (We learned this the expensive way — see Q4.)
7. **Suggest ≠ commit.** The system proposes the coil selection; a human confirms it. See Q7.

---

## 1. How Dispatch/Invoice records link back to the Mother Coil

**Through the allocation rows, which the invoice line inherits from production. Not through a coil field on the invoice.**

**The rule:** when an invoice line is created, it does not choose coils. It *inherits* them by
draining the production ledger for that SKU, oldest batch first.

**The drain algorithm:**

```
1. Build a FIFO queue of every allocation row for this SKU,
   ordered by production date (oldest first):
        [ {baby, mother, pieces, weight}, {…}, … ]
2. Discard from the head the pieces already taken by
   previously-invoiced lines of the same SKU.
3. Take the next N pieces off the head for this line,
   splitting a row when the line needs only part of it
   (weight-per-piece within a row = row weight ÷ row pieces).
4. Store the resulting rows on the invoice line — unchanged.
```

So an invoice line for 500 pieces may end up carrying three allocation rows across two mother coils.
That is correct and expected.

**Reporting rule:** to answer "how much of mother coil X was dispatched", sum the allocation-row
weights where `mother = X` across all invoice lines. Do **not** sum the invoice line's total weight —
that over-attributes the whole line to one coil.

**Design warning from our current system:** we also kept a single scalar "trace coil" field on each
line for backward compatibility. One report still joins on it, and it silently reports multi-coil
lines wrong — the whole line lands on the first coil and the others show zero. **Do not build that
field.** The array is the only truth.

---

## 2. Which PO is the reference?

**There are two different POs doing two different jobs, and a third that has never existed.**

| PO | What it is | Belongs to | Used by |
|---|---|---|---|
| **Vendor / Steel PO** | The PO we raised to buy the HR coil | The **mother coil**; inherited by every baby coil slit from it | Everything on the raw-material side: coil inward, slitting, coil tracker, RM stock |
| **Customer PO** | The customer's order reference | The **customer order**; the invoice line carries the order reference that points to it | Everything on the sales side: order book, dispatch, distributor reports |
| **Contractor PO** | — | **Undefined. Does not exist in the model.** | — |

**The rule: never merge these into one "PO" column.** They sit on opposite ends of the chain and
answer different questions. A report about steel keys on the Vendor PO; a report about sales keys on
the customer order reference.

**How the invoice line reaches the customer PO:** the sales document carries an order reference on
every line. That reference is the join key back to the order book, which holds the customer PO. The
invoice line does not need its own copy of the PO — one join hop is enough, and it can't go stale.

**The Contractor PO is an open decision — see Q8.**

---

## 3. Dispatch weight and invoice weight

**Invoice weight is a fact, taken as-is from the sales document. Dispatch weight per coil is a derived share of it.**

```
Invoice weight   = the billed quantity, straight from the sales document. NEVER derived.
Pieces           = invoice weight ÷ weight-per-tube      (when the document has no piece count)
   …or reversed, if the document's unit column says pieces rather than MT — read the unit,
     don't assume.
Dispatch weight
  attributed to  = Σ allocation-row weights on that line where mother coil = X
  coil X
```

**The coil-level summary row — five figures, all derived from the same chain:**

| Figure | Definition |
|---|---|
| Coil weight | The coil's **plant-measured actual weight** |
| Produced weight | Σ allocation weights on production batches for this coil |
| Dispatched weight | Σ allocation weights on invoice lines for this coil |
| Balance to produce | Coil weight − Produced weight |
| Produced inventory | Produced weight − Dispatched weight |

**Two traps to design around:**

1. **A coil has two weights and only one of them is real for calculation.** The *supplier invoice
   weight* (what we were billed) and the *plant actual weight* (weighbridge). **Every calculation
   uses the actual weight.** Keep the invoice weight purely as a variance reference — it is a
   procurement figure, and it has nothing to do with the sales invoice despite the shared word.
2. **Invoice weight and coil-attributed weight are different grains.** One invoice line splits across
   coils; one coil spans many lines. They will never reconcile row-for-row, only in total. Don't
   design a report that implies they should.

---

## 4. Baby Coil report — used weight, status, and >100%

### (a) How the numbers are built

```
capacity  = (this baby's width ÷ Σ widths of all babies from the same mother)
              × mother's actual weight
used      = Σ allocation weights where baby coil = this one
free      = capacity − used
% used    = used ÷ capacity × 100
```

The same proportional split applies to cost, which is what makes cost-per-MT identical for a mother
and every baby cut from it — that identity is what lets costing key on the mother.

**`used` must be derived, not stored.** Compute it as `pieces × weight-per-tube` at read time. If you
store the weight, correcting a SKU's weight-per-tube later leaves every historic allocation frozen at
the old figure, and the coil's used weight stops matching its production.

### (b) Confirmed vs Open — the wrong vocabulary

**A baby coil has no Confirmed/Open state.** Its status is:

- **Active** — available for selection in production
- **Consumed** — manually flagged by the operator as finished/unusable; excluded from selection

That flag is **manual and has exactly one effect**: hiding the coil from production selection. Nothing
sets it automatically. Notably, a coil at 97% or even 100% used is **not** auto-hidden — a scrap end
is still a real physical object, and only the operator knows if it's usable.

**Confirmed / Non-confirmed belongs to the order book, not to coils:**
- **Confirmed** — ordered tonnage released for dispatch but not yet invoiced
- **Non-confirmed** — ordered but not yet released
- **Pending to dispatch** = Confirmed + Non-confirmed

If the new spec wants Confirmed/Open on a baby coil, that mapping has to be defined from scratch —
it isn't a rename of anything that exists.

### (c) Why used quantity exceeds 100% — four causes

This is the single most expensive lesson in the current system. **445 baby coils ended up holding
123.3 tonnes more steel than physically existed.**

| # | Cause | Fix in the new build |
|---|---|---|
| 1 | **No capacity validation on manual allocation.** The form warned ">105% of capacity — allowed, but review" and saved anyway. Every shift, for months. | **Hard-block** any allocation past 105% of remaining capacity. Pair the block with a one-click "redistribute the excess" action so the operator isn't stuck at a dead end. |
| 2 | **Re-split after consumption.** Adding/editing/deleting a sibling re-splits weight by width across *all* babies of that mother. A baby already consumed can shrink underneath its own usage. | Either freeze a baby's capacity once it has been consumed, or block sibling edits after first consumption. Decide this explicitly — it cannot be left implicit. |
| 3 | **Mother's actual weight edited after slitting**, without re-splitting the babies — every denominator goes stale. | Any change to a mother's actual weight must re-split its babies in the same transaction. |
| 4 | **SKU weight-per-tube edited after production** — historic usage silently changes. | Accept it (with derived weights this is self-consistent) but log it, and never let a published SKU exist without a weight. |

**"Is there a field that allows it?"** Not a field — it was the manual coil-assignment grid with no
write-time capacity check. **The 100–105% band is deliberate** (real over-fill tolerance) and should
stay saveable with a warning. Above 105% is physically impossible and must be refused.

---

## 5. Coil Inward vs Dispatch — and what Edit is for

**Dispatch is never recorded against a coil. The connection is derived, never entered.**

```
What a user enters:   coil inward → slitting → production (SKU + pieces + coil selection)
What is imported:     invoices, from the sales document
What is derived:      the invoice→coil linkage (Q1). Nobody types it, ever.
```

**Dispatch/invoice data must not be hand-enterable at all.** It is the billing record — the ERP owns
it. Manual entry means two systems disagreeing about revenue.

**So what is Edit on the coil record for?** Correcting the coil's *own* master data after a keying
error: inward date, coil number, grade, heat number, thickness, width, supplier invoice weight, plant
actual weight, vendor PO. That is the entire scope. **It is not a route to adjust dispatch, and
nothing on it should imply it is.**

**Guards the edit path needs:**
- Changing **actual weight** must re-split the baby coils (cause 3 above).
- Changing **thickness or width** after slitting invalidates every downstream eligibility decision —
  warn loudly, or block once babies exist.
- **Deleting** must be blocked once the coil is slit or consumed.

---

## 6. The Baby Coil width check

**It answers one question: do the strips we're cutting actually fit across the mother coil?**

```
sum = Σ widths of ALL baby coils from this mother
      (already saved + the ones being entered right now)

sum ≤ motherWidth − trim   →  OK        (trim allowance intact; trim ≈ 5 mm)
motherWidth − trim < sum ≤ motherWidth  →  WARN  (trim eaten into — verify)
sum > motherWidth          →  IMPOSSIBLE (more strip than steel)
```

**Recommendation for the new build: make the third tier a hard block.** Our current system only warns
there, which is the same mistake as Q4 cause 1 — it describes a physically impossible object and
saves it anyway.

**Other slitting rules that must block:** duplicate baby coil identifiers, and any cap you place on
babies per mother. *(If you generate baby IDs as a letter suffix, you cap silently at 26 — use a
numeric sequence instead and avoid the artificial limit.)*

⚠️ **Name this check distinctly from the production one.** There are two different ±5 mm rules and
they get confused constantly:
- **Slitting width check** (this one): Σ baby widths vs **the mother coil's width**.
- **Production width match** (Q7): *one* baby coil's width vs **the tube's required strip width**.

---

## 7. Which Baby Coils fulfil a given SKU (Production)

**The system must auto-*suggest*. It must not auto-*commit*. That is a deliberate rule, not a missing feature.**

### The matching logic — three filters, then an order

```
ELIGIBLE = a baby coil that passes all three:

  1. WIDTH     |baby width − required strip width| ≤ 5 mm
               required strip width comes from the SKU's geometry:
                 SHS / RHS  →  2 × (Height + Breadth)
                 CHS        →  π × Outside Diameter
               If it can't be computed, skip this filter rather than guessing.

  2. THICKNESS the plant's RM→FG rule table — NOT a tolerance band.  ← critical
  3. AVAILABLE not scrapped, not flagged Consumed, free capacity > 0

ORDER    oldest slit date first (FIFO), then:
           fill each coil to 97% → move to the next
           then top up to 100%
           then, only if pieces remain, into the 100–105% over-fill band
         Whole pieces only. Any remainder = a shortfall warning, never a block.
```

### Why thickness must be a lookup table, not a ±band

This is the part most likely to be got wrong in a rebuild. **Which coil gauge can roll which pipe
gauge is a plant rule sheet. The relation is asymmetric and many-to-many:**

- A **2.3 mm coil rolls 2.5 mm pipe — but a 2.5 coil never rolls 2.3 pipe.** Not symmetric.
- A **3.0 coil rolls both 3.0 and 3.2.** One-to-many.
- A **2.2 coil rolls both 2.2 and 2.3.**

A ±0.3 mm band — which is what we originally built — fails in **both** directions: it admits pairings
the mill never runs (2.6 coil → 2.5 pipe) and it cannot express the one-to-many rows at all.

**And: if a finished gauge isn't in the rule sheet, the answer is "no eligible coil" — never a
fallback to a band.** A silent fallback is what hid this bug for months.

### Why not auto-select

Because wrong suggestions are what cause operators to override by hand, and unvalidated manual
overrides are exactly what produced the 123.3 T over-consumption in Q4. The fix was to correct the
*rule* and hard-block the impossible case while **keeping the human confirmation step**.

**Recommendation: suggest, then require an explicit "accept".** If the business wants full
auto-commit, it's implementable — but only on top of the write-time capacity block, and it is a
reversal of a decision made for a concrete reason.

**One more rule that matters:** the **manual override list must be wider than the suggestion.** Show
*every* coil with meaningful free capacity, flagging the spec-matched ones and sorting them first.
The floor sometimes has to run an off-spec coil, and a picker that only offers eligible coils forces
the operator into a workaround you can't see.

---

## 8. Dispatch ↔ Contractor PO — **OPEN, needs a business decision**

**No Contractor PO exists anywhere in the current model** — not on the coil, the order, or the
invoice. Before this can be built, one question has to be answered:

**Which entity does the Contractor PO belong to?**

| If it is… | It belongs on | Dispatch reaches it via | New field on dispatch? |
|---|---|---|---|
| A **conversion / job-work PO** against the raw material | The mother coil (alongside the vendor PO) | allocation row → mother coil → PO | **No** |
| A **commercial PO** against the customer order | The customer order (alongside the customer PO) | invoice line → order reference → PO | **No** |
| **Its own document**, tied to neither | A new entity, plus a source column in the sales document | direct reference on the line | **Yes** |

**Two of the three options need no new field on the dispatch record at all** — the chain already
reaches them. Please confirm which one it is; the answer changes the schema materially.

---

## 9. SKU Master — the fields, what each is for, and where the data comes from

### The complete field list

| Field | Set by | Why it exists |
|---|---|---|
| SKU code | Derived from dimensions; **immutable once used** | **The join key to the ERP.** Every imported order and invoice line matches on it |
| Description | Derived | Fallback match for documents that omit the code |
| **Product type** (SHS/RHS/CHS/ERW) | Manual | **Load-bearing, not a label.** It selects the strip-width formula — `2×(H+B)` vs `π×OD` — so it directly determines **which baby coils are eligible** in production. It also groups the stock reports |
| Height, Breadth | Manual | SHS/RHS geometry → strip width |
| Nominal bore, Outside diameter | Manual | CHS geometry → strip width |
| Thickness | Manual | Matched to coil gauge via the RM→FG rule table (Q7) |
| Length | Manual | Reporting |
| HSN code | Manual | Statutory reporting only |
| Status (published/draft) | Manual | Only published SKUs are selectable in production |
| **Weight per tube (kg)** | **Manual — mandatory** | **The single source of every weight in the system.** Pieces↔tonnes, everywhere. **A published SKU with no weight must be refused at save** — otherwise every batch and invoice of it silently records zero tonnes |
| Base conversion (₹/MT) | Manual | Conversion charge base |
| Thickness extra (₹/MT) | Manual | Gauge premium |
| Ladder price (₹/MT) | **Derived** | `base conversion + thickness extra` |
| Total conversion (₹) | **Derived** | `weight per tube × ladder price ÷ 1000` |

### On "Conversion Form" — **needs definition**

**There is no such field.** The four conversion fields above are the whole conversion model. If
"Conversion Form" means something else — a form of conversion (black/galvanised?), a process route,
a document — it has to be defined before it can be built. It is not a rename of anything existing.

### Zoho / ERP vs mastered locally

```
FROM the ERP (arrives on every order and invoice line):
    SKU code  ·  description
    → these are identity only. They tell you WHICH product, nothing about it.

MASTERED IN THIS SYSTEM (the ERP does not carry them):
    weight per tube          ← the critical one; nothing works without it
    product type             ← drives coil eligibility
    all dimensions           ← drive strip width
    all four conversion/costing fields
    HSN code
```

**So: identity comes from the ERP; weight, geometry and costing must be set up and maintained here.**
Plan for it as a real master-data exercise, not an import. Our catalogue is ~247 SKUs, originally
built from a plant spreadsheet.

**A useful pattern worth keeping:** when an import hits a SKU code that isn't in the master yet but is
in the reference catalogue, create it automatically rather than rejecting the line. But make the
identity fields unique and enforce it in the database — a duplicate under a second identifier will
fail the whole batch, and that failure is confusing to diagnose.

---

## 10. Sales Dashboard — why the transactions you're testing don't appear

**Because sales figures and production figures come from two completely separate lanes. This is correct behaviour, not a data bug.**

```
LANE A — the physical pipeline (what you enter by hand)
   Coil inward → slitting → production
   feeds:  stock on hand, coil tracker, raw-material and finished-goods reports
   feeds:  NOTHING on the sales dashboard

LANE B — commercial (what you import)
   Sales document upload
     ├─ order sheet    → the order book   ─┐
     └─ invoice sheet  → invoices          ─┴─►  the ONLY inputs to the sales dashboard
```

**No coil, baby coil or production record can ever move a sales number.** The sales dashboard is
built purely from the order book and the invoice records. Producing 500 tonnes changes stock; it does
not change sales until those tonnes are invoiced through the imported document.

**Refresh logic — there is no scheduled job and no cache.** Figures change only when a new sales
document is imported. Three rules that go with that:

1. **Import must be idempotent per line**, keyed on something like `invoice number + SKU + quantity`.
   A re-uploaded or overlapping file must be a no-op. *(We double-counted an entire month's invoices
   once because dedup was per-invoice and a blank invoice number bypassed it — ~1,257 tonnes of
   phantom negative stock across 50 SKUs.)*
2. **A full re-import should replace, not append** — soft-delete the previous set and rebuild.
3. **Watch the default period filter.** A dashboard defaulting to the current month will hide a test
   invoice dated outside it, which reads as "missing data".

**There is deliberately no manual sales entry.** To see data on the sales dashboard, it must arrive
through the document import.

---

## 11. Production entry timing

**After production completes. It is a completion record, not a work order.**

A production entry captures: **date, SKU, pieces made, and the coils consumed.** Nothing else.

**Why it cannot be created up front:** the production entry *is* the consumption event. Saving it
immediately:

```
1. debits capacity from the baby coils it names   → drives every free/used figure and the >105% block
2. adds tonnage to finished-goods stock            → makes it sellable
3. makes those pieces available to invoice lines   → the FIFO queue in Q1
```

An entry created before the run consumes steel still sitting on the floor and creates finished stock
that doesn't exist. Everything downstream inherits the lie.

**Note on status:** any status on a production record should describe **allocation** (are all pieces
assigned to a coil? fully / partially / not at all) — **not** manufacturing progress. Don't overload
one field with both.

**If planned production is genuinely needed**, model it as a **separate entity** — a production plan
with an expected date and a target quantity — and keep the consumption event distinct, created only
on completion. Do not add a "planned" flag to the consumption record; the moment consumption is
conditional, every stock figure needs to know which flag it's looking at.

---

## Summary — what needs a decision before building

| # | Decision | Options |
|---|---|---|
| 2 / 8 | **What is the Contractor PO attached to?** | Raw material (goes on the coil) · Customer order (goes on the order) · Standalone document (new entity + new source column) |
| 9 | **What is "Conversion Form"?** | Not in the current model. Needs a definition |
| 4 | **Is a baby coil's weight frozen once consumed, or does it keep re-splitting?** | Freeze on first consumption · Block sibling edits after consumption |
| 7 | **Suggest-and-confirm, or full auto-select?** | Recommended: keep confirmation. Auto-select only on top of a write-time capacity block |

## The four rules worth carrying over unchanged

1. Weight comes from the SKU master's weight-per-tube — **never** a density constant.
2. Production consumes **baby** coils, and every allocation carries **both** the baby and its mother.
3. **Block** physically impossible states at write time. A warning that saves anyway is not a validation.
4. Coil-to-pipe thickness is a **lookup table**, not a tolerance band — asymmetric and many-to-many.

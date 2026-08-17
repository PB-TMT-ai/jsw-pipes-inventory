# Pipes & Tubes — business logic and entity connections

> For a **new build**. This describes *what the system must do and how the entities connect* —
> not how the current app does it. No screens, no tables, no code. Every rule below is stated so it
> can be implemented on any stack.
>
> **Status:** all eleven are answered. **Q10 (Sales Dashboard) is parked** at the business's
> instruction; details to follow once the production and dispatch modules are complete.
>
> **One question remains for the plant, not for the tech team** — the exact strip width a pipe
> consumes (Q7). It is written out in plain language there, ready to ask as-is.

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

1. **Weight always comes from the SKU master's weight-per-tube.** The running system never
   recalculates it from dimensions or density. The formula in Q9 builds the master value **once**;
   after that the master is the only source. (Why: real mill weights drift from theory, and a system
   that recomputes silently rewrites historic tonnage.)
2. **Pieces are load-bearing; weight is derived.** Store pieces, compute `weight = pieces ×
   weight-per-tube`. If you store both, they drift the moment a master value is corrected.
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

## 2. Which PO is the reference? — **three POs, one per stage of the chain**

Now that the Contractor PO is defined (*the PO we issue to a contract manufacturer to produce pipes
for us*), the three POs line up cleanly — each attaches to a different stage, and each answers a
different question.

```
  Vendor PO          Contractor PO           Customer PO
 (we buy steel)   (we buy manufacturing)   (they buy pipe)
      │                    │                     │
      ▼                    ▼                     ▼
 Mother Coil ─► Baby Coil ─► Production Batch ─► Invoice Line
```

| PO | What it buys | Attaches to | Answers |
|---|---|---|---|
| **Vendor / Steel PO** | HR coil from the steel supplier | The **mother coil**; inherited by every baby coil slit from it | "What did this steel cost, and against which purchase did it arrive?" |
| **Contractor PO** | Manufacturing capacity from a contract manufacturer | The **production batch** (see Q8) | "Which pipes were made by a contractor, under which PO, and how much of that PO is still open?" |
| **Customer PO** | Nothing — it's *their* PO on us | The **customer order**; the invoice line carries the order reference that points to it | "Which customer commitment does this shipment settle?" |

**The rule: never merge these into one "PO" column.** They sit at three different stages and answer
three different questions. A steel report keys on the Vendor PO; a manufacturing report keys on the
Contractor PO; a sales report keys on the customer order reference.

**How the invoice line reaches each one — all three by following the chain, none by a direct field:**

```
Invoice line ─► allocation rows ─► mother coil      ─► Vendor PO
Invoice line ─► allocation rows ─► production batch ─► Contractor PO
Invoice line ─► order reference ─► customer order   ─► Customer PO
```

This is why principle 3 matters. Get the allocation row right and all three PO linkages come free.

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
| 2 | **Re-split after consumption.** Adding/editing/deleting a sibling re-splits weight by width across *all* babies of that mother. A baby already consumed can shrink underneath its own usage. | **DECIDED — a baby coil's weight freezes the moment production consumes it, and never re-splits again.** See the rule below. |
| 3 | **Mother's actual weight edited after slitting**, without re-splitting the babies — every denominator goes stale. | Any change to a mother's actual weight must re-split its babies in the same transaction. |
| 4 | **SKU weight-per-tube edited after production** — historic usage silently changes. | Accept it (with derived weights this is self-consistent) but log it, and never let a published SKU exist without a weight. |

### (d) The freeze rule — **decided by the business**

**A baby coil's weight is frozen the moment production consumes it. It never re-splits again.**

This closes cause 2 above, and it changes how the proportional split works from that point on:

```
Before any production consumes a baby coil of this mother
    every baby's weight = (its width ÷ Σ all baby widths) × mother's actual weight
    → re-splits freely whenever a sibling is added, edited or deleted

After the first baby of this mother has been consumed
    frozen babies      keep their weight, permanently, whatever else changes
    unfrozen remainder = mother's actual weight − Σ frozen baby weights
    unfrozen babies    = (its width ÷ Σ unfrozen baby widths) × unfrozen remainder
```

Two consequences to build in deliberately:

- **A frozen baby's weight is now historical fact.** It stays right even if the mother's actual weight
  is later corrected — that correction can only move the *unfrozen* remainder.
- **If the unfrozen remainder goes negative** (someone corrects a mother's weight downward below what
  is already frozen), that is a data error, not a split to compute. Refuse it and show what is
  already committed.

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

### ⚠️ One question for the plant before this rule is coded

The width formulas above are a working approximation inherited from practice — they add up the
*outside* faces of the pipe. The strip that actually goes into the mill is slightly narrower, because
the steel bends around the corners. **Ask the plant this, in these words:**

> **"When we roll a pipe, how wide is the steel strip that actually goes into the mill?**
>
> **Take a 50 × 50 × 2.0 mm square pipe as the example. Is the strip:**
>
> **(a) 200 mm — the four sides simply added up (50 × 4), or**
> **(b) about 192 mm — a little less, because the steel bends around the corners, or**
> **(c) some other number, once you allow for the trim and the weld?**
>
> **Please give us the real strip width you use on the floor for 4–5 common sizes — square,
> rectangular and round."**

**Why it matters:** whatever number comes back is what a slit coil's width gets matched against. The
two candidates differ by roughly **8 mm** on a 2 mm wall — **wider than the ±5 mm matching tolerance
itself**. Pick the wrong one and the system quietly offers the wrong coils on every single batch,
which is exactly the failure mode that made operators stop trusting the suggestion before.

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

## 8. Dispatch ↔ Contractor PO

**Definition (confirmed by the business): the Contractor PO is the PO we issue to a contract
manufacturer to produce pipes for us.**

**It attaches to the production batch — because that is the event it buys.** Not to the coil (that's
the steel purchase) and not to the customer order (that's the sale).

### What this adds to the model

**The production batch gains three attributes:**

| Attribute | Values | Purpose |
|---|---|---|
| Made by | `Own plant` / `Contractor` | Every production and stock report can split in-house vs outsourced |
| Contractor | reference to the contractor | Who made it |
| Contractor PO | reference to the PO | Which commitment it was made against |

**The Contractor PO itself is a new document with a header and lines:**

```
Header  : contractor, PO date, agreed conversion rate, status
Lines   : SKU, ordered quantity (pieces and/or MT), delivery date
```

### How Dispatch links to it — **no new field on dispatch**

The chain already reaches it:

```
Invoice line ─► allocation rows ─► production batch ─► Contractor PO
```

This is the same inheritance as Q1. Any dispatch report can be sliced by Contractor PO for free.

### What the linkage makes possible

| Question | How it's answered |
|---|---|
| How much of Contractor PO X has been produced? | Σ pieces on production batches referencing X |
| What's still open on X? | ordered − produced, per SKU line |
| How much of X has been dispatched / invoiced? | inherited through the allocation chain |
| What did contractor-made stock cost? | coil cost (via mother) + the **PO's** conversion rate |

**Note the costing consequence:** for a contractor batch the conversion rate comes from the
**Contractor PO**, not from the SKU master's in-house conversion ladder. The SKU master's
base-conversion/thickness-extra fields describe *our* plant's rates. Don't apply them to outsourced
production — build the rate lookup as "own plant → SKU ladder; contractor → PO rate".

### Whose steel? — **confirmed: it is job work, on our own coil**

**The contractor converts coil that we supply and that we have already brought into our system.** They
do not bring their own steel.

**This is the good case: the traceability chain stays completely intact.**

```
Our mother coil → our baby coil → production batch (made by: Contractor, under Contractor PO X)
                                        │
                                        └─► normal allocation rows, exactly as in-house
```

Everything in Q1–Q5 applies unchanged. A contractor batch consumes our baby coils and carries the
same allocation rows as an in-house batch. **The only difference is where the machine stood.**

That gives three things for free:
- Full mother-coil traceability on contractor-made pipe, same as in-house.
- Coil capacity is debited correctly — the >105% block works identically.
- In-house vs outsourced is a **reporting split**, not a separate flow to build.

**Two things worth building because the steel physically leaves the plant:**

1. **A material issue / return movement** against the Contractor PO — coil sent out, pipe received
   back. It doesn't change the costing chain, but without it nobody can see what steel is currently
   sitting at a contractor's premises.
2. **A yield check per Contractor PO** — steel issued vs finished weight received. On job work this is
   the number that matters commercially, and the allocation chain already contains both halves of it.

*(If the business ever buys finished pipe outright from a contractor — their steel, not ours — that is
a genuinely different flow with no coil chain behind it. It is out of scope here; raise it as a change
rather than bending this one to fit.)*

---

## 9. SKU Master — source, fields, and the weight formula

**Source: the SKU master maintained by Shubham Narwane. None of these fields exist in Zoho Books** —
Zoho carries only the transactional identity (the item code and description that appear on order and
invoice lines). **Everything below has to be set up and maintained as master data in the new system.**

### (a) Weight of one tube — the formula, for all types

This is what produces the `weight per tube` value. **It is used once, to build the master. The running
system then reads the master and never recalculates** (principle 1).

**Constant: steel density = 7.85 g/cm³.** All dimensions in **mm**, result in **kg**.

**Square and Rectangular Hollow Section (SHS, RHS)**

```
             ┌────────────────────────────────────────┐
 Area (mm²)  │  A = 2 × t × (H + B)  −  4 × t²        │
             └────────────────────────────────────────┘
 Weight (kg) =  A × L × 7.85 ÷ 1,000,000

   H = height (mm)   B = breadth (mm)   t = wall thickness (mm)   L = length (mm)
   SHS is simply the case where H = B — one formula covers both.
```

**Circular Hollow Section (CHS) — and ERW round pipe, which is geometrically identical**

```
             ┌────────────────────────────────────────┐
 Area (mm²)  │  A = π × (OD − t) × t                  │
             └────────────────────────────────────────┘
 Weight (kg) =  A × L × 7.85 ÷ 1,000,000

   OD = outside diameter (mm)   t = wall thickness (mm)   L = length (mm)
   Note it is (OD − t), i.e. the MEAN diameter — not OD, and not the bore.
```

**Worked examples, verified against the existing master (exact to every decimal):**

| SKU | Working | Weight/tube |
|---|---|---|
| SHS 25×25×2.50×6000 | `A = 2(2.5)(50) − 4(2.5²) = 250 − 25 = 225` → `225 × 6000 × 7.85 ÷ 10⁶` | **10.5975 kg** |
| RHS 40×20×1.20×6000 | `A = 2(1.2)(60) − 4(1.44) = 144 − 5.76 = 138.24` | **6.511104 kg** |
| RHS 200×100×2.20×6000 | `A = 2(2.2)(300) − 4(4.84) = 1320 − 19.36 = 1300.64` | **61.260144 kg** |
| CHS 32 NB (OD 42.4) ×2.20×6000 | `A = π(42.4 − 2.2)(2.2) = π(88.44) = 277.8425` | **13.086380 kg** |
| CHS 15 NB (OD 21.3) ×1.60×6000 | `A = π(21.3 − 1.6)(1.6) = π(31.52) = 99.0230` | **4.663983 kg** |

**Two conventions to reproduce exactly, or the numbers won't match:**

1. **Sharp corners.** The hollow-section formula assumes square corners with no radius deduction.
   Real sections have rounded corners and are marginally lighter — the master does **not** deduct for
   this. Be consistent; don't mix a rounded-corner formula into the same catalogue.
2. **Nominal Bore is a label, not a dimension.** "32 NB" is a naming convention — the calculation uses
   the **outside diameter** (32 NB → OD 42.4 mm). Both must be stored; only OD is calculated with.

### (b) The required fields

| # | Field | Set by | Why it exists |
|---|---|---|---|
| 1 | **SKU code** | Derived from dimensions; **immutable once used** | **The join key to the ERP** — every imported order and invoice line matches on it. Renaming it orphans all history |
| 2 | **Description** | Derived from dimensions | Fallback match for documents that omit the code |
| 3 | **Product type** — SHS / RHS / CHS / ERW | Manual | **Load-bearing, not a label.** Selects the weight formula *and* the strip-width formula, so it directly determines which baby coils are eligible in production. Also groups the stock reports |
| 4 | **Height (mm)** | Manual | SHS/RHS geometry → weight + strip width |
| 5 | **Breadth (mm)** | Manual | SHS/RHS geometry → weight + strip width |
| 6 | **Nominal bore** | Manual | CHS naming ("32 NB"). Label only — never calculated with |
| 7 | **Outside diameter (mm)** | Manual | CHS geometry → weight + strip width |
| 8 | **Thickness (mm)** | Manual | Weight, and the coil-gauge match via the RM→FG rule table (Q7) |
| 9 | **Length (mm)** | Manual (typically 6000) | Weight, and reporting |
| 10 | **HSN code** | Manual | Statutory reporting only |
| 11 | **Status** — published / draft | Manual | Only published SKUs are selectable in production |
| 12 | **Weight per tube (kg)** | **Manual — mandatory**, built with (a) | **The single source of every weight in the system.** Pieces↔tonnes, everywhere. **A published SKU with no weight must be refused at save** — otherwise every batch and invoice of it silently records zero tonnes |
| 13 | **Base conversion (₹/MT)** | Manual | In-house conversion charge, base rate |
| 14 | **Thickness extra (₹/MT)** | Manual | In-house gauge premium |
| 15 | **Ladder price (₹/MT)** | **Derived** | `base conversion + thickness extra` |
| 16 | **Total conversion (₹)** | **Derived** | `weight per tube × ladder price ÷ 1000` |

**Fields 13–16 describe our own plant's rates.** For contractor-made stock the conversion rate comes
from the Contractor PO instead — see Q8.

### (c) On "Conversion Form" — **not required**

The business has confirmed this field is **not needed**. Do not build it. Fields 13–16 above are the
entire conversion model for in-house production; contractor conversion is priced from the Contractor
PO instead (Q8).

### (d) Practical notes for the build

- **Enforce uniqueness on the SKU code in the database**, not just in the UI. A duplicate under a
  second identifier is the kind of thing that fails an entire import batch and is painful to diagnose.
- **Guard against decimal-format duplicates** — `…1.6×6000` and `…1.60×6000` are the same physical
  product and will fragment inventory across two codes. Match on a canonical (normalised) identity
  before allowing a new SKU.
- Our current catalogue is ~247 SKUs. Treat the load as a real master-data exercise, not an import.

---

## 10. Sales Dashboard — **parked**

At the business's instruction, the Sales Dashboard is deferred: **the detailed specification will be
shared once the production and dispatch modules are complete.** Don't design against the current one.

**One structural point to carry forward now, so nothing gets wired the wrong way in the meantime:**

```
LANE A — physical    coil inward → slitting → production
                     feeds: stock on hand, coil tracker, RM and FG reports

LANE B — commercial  imported sales documents → order book + invoices
                     feeds: everything on the sales side
```

**Production data must never feed sales figures directly.** Producing 500 tonnes changes stock; it
does not change sales until those tonnes are invoiced. If the two lanes get merged, tonnage gets
counted as revenue before it is billed, and unwinding that later is expensive.

*(This is also why test transactions entered through production never appeared on the sales
dashboard — the lanes are separate by design, not by fault.)*

---

## 11. Production entry timing

**After production completes. It is a completion record, not a work order.**

A production entry captures: **date, SKU, pieces made, and the coils consumed** (plus the made-by /
Contractor PO attributes from Q8).

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

*(Note: a Contractor PO line is effectively an outsourced production plan already — ordered quantity
with a delivery date, against which batches are booked. If in-house planning is wanted later, model it
the same way rather than inventing a second pattern.)*

---

## Summary — all eleven, settled

| # | Answer |
|---|---|
| 1, 3, 5 | Traceability runs on allocation rows (baby + mother), inherited by invoice lines via FIFO. Dispatch is never entered against a coil |
| 2, 8 | Three POs, one per stage: Vendor→coil, **Contractor→production batch**, Customer→order. Contractor work is **job work on our own coil**, so the chain stays intact |
| 4 | Used = Σ allocation weights; status is Active/Consumed (manual); >105% must hard-block; **a baby coil's weight freezes once produced** |
| 6 | Width check = Σ baby widths vs mother width, three tiers; over-width should block |
| 7 | Suggest-and-confirm; width ±5 mm + RM→FG lookup table; FIFO on slit date |
| 9 | 16 fields and the weight formulas above. Source is the maintained SKU master, **not** Zoho. **"Conversion Form" is not required** |
| 10 | Parked — spec to follow once production and dispatch are complete |
| 11 | Production is a completion record; model planning separately if it is ever needed |

**Nothing is blocked on the tech team.** The one outstanding item is a question **for the plant** —
the real strip width a pipe consumes (Q7), written out ready to ask. Until it comes back, build the
matching rule so the formula is a **configurable value, not a hard-coded one**, and swapping it later
is a settings change rather than a code change.

## The four rules worth carrying over unchanged

1. Weight comes from the SKU master's weight-per-tube — the running system never recalculates it.
2. Production consumes **baby** coils, and every allocation carries **both** the baby and its mother.
3. **Block** physically impossible states at write time. A warning that saves anyway is not a validation.
4. Coil-to-pipe thickness is a **lookup table**, not a tolerance band — asymmetric and many-to-many.

# A pipeline row's plant is operator-set once, at Coil Inward, then inherited

ADR-0004 settled how an **order or invoice** line gets its plant: from the ERP's `Ship From Code`,
never from a typed field, because "nothing an operator does can make a line's plant drift". Ticket
#120 extends the plant dimension to mother coils, baby coils and production batches — and those
rows are typed by an operator. That is not a reversal of ADR-0004; it is the same principle meeting
a different source.

**The ERP has no view of the shop floor.** There is no Ship From Code on a coil, because the coil
never appears in the One Helix workbook at all. It appears on a weighbridge slip and a paper tag.
So there is nothing to resolve from, and the choice is not "ERP or operator" — it is "operator, or
nothing".

## Decision

**Plant is typed once, at Coil Inward, and inherited from there. It is never re-typed and never
editable afterwards.**

```
Coil Inward ── operator chooses, once ──► coils.plant
                                             │
Slitting ─── baby coil takes its mother's ──► baby_coils.plant
                                             │
Production ─ batch takes its baby coils' ───► productions.plant
```

The discipline ADR-0004 protects — a value that cannot drift — is preserved by making it
**immutable and derived** rather than ERP-supplied. There is exactly one keystroke of human
judgement in the whole pipeline, and everything downstream is computed from it.

Two things follow from "it describes where a physical object physically sits":

1. **The field is not editable once the coil exists.** A coil does not move plant because someone
   re-opened a form. The Coil Inward form renders it as a read-only label on edit — deliberately
   not a disabled select, because a select must fall back to some option and would show *Hyderabad*
   over a legacy row that stores blank.
2. **Slitting re-reads the mother on every save** rather than carrying the stored value forward, so
   there is no code path at all by which a baby coil ends up on a plant its mother is not on.

## A production whose coils disagree is `Unattributed`

`productionPlant` returns a plant only when **every** allocation agrees. A batch fed from two
plants belongs to neither, and filing it under whichever coil happened to be listed first would
attribute the whole batch to a plant that made half of it. FIFO and the manual picker never cross
plants (phase 2), so a disagreement here is a data fault to **see**, not one to resolve silently —
the same reasoning `dispatchPlantLabel` follows when an invoice's entries disagree.

## Consequences

- Each allocation resolves off its **baby coil first, its mother second**, so a legacy mother-only
  allocation still lands on a plant. Allocations keep carrying **both** ids; costing and the Coil
  Tracker are untouched.
- **The history is backfilled by SQL, not by an upload.** Orders and dispatches are replace-all on
  upload, so #118/#119 needed no migration. Pipeline rows are not — nothing rewrites them — so
  `supabase-setup.sql` carries an idempotent `update … where plant is null`. It touches the `plant`
  column and nothing else: a coil id is printed on a physical tag and embedded inside stored
  production allocations.
- **Only Hyderabad is offered**, via `COIL_INWARD_PLANT_IDS`. NPMD manufactures, but until phase 2
  gives it the `NPM-` prefix and its own running number, a coil registered against it would be
  handed a Hyderabad-shaped id. `coilInwardPlants()` intersects that list with `manufactures`, so
  ADR-0004's promise — reclassifying a plant is one flipped boolean — still holds.
- **Plant is a save-time snapshot on a production**, like `weightPerPiece` and `totalWeight` beside
  it. It is not re-derived on read. Since plant is immutable by design, a stored batch and its
  coils cannot drift apart; the one way they could is a backfill that reached the baby coils but
  not the productions, which the migration does in one run.

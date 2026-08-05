# Plan: correct the strip-width rule in Slitting and Production

Step 2 of issue [#99](https://github.com/PB-TMT-ai/jsw-pipes-inventory/issues/99). Steps 1 (RM→FG
thickness rule, `0df5993`) and 3 (cap-and-spill at save, #100) are done; this is the last open
technical step, and step 4 (backfill) depends on it.

## Answer first

**The width rule is a lookup table, not a formula** — the same shape as the RM→FG thickness sheet,
and for the same reason: the plant slits to a fixed set of mill widths, and one width serves several
pipe sections. No perimeter formula can express that, which is why both `π × OD` and the mean-line
correction failed.

Reading it off the live data gives **11 standard widths covering 1,947 of the 1,949 baby coils in
inventory** (5,167.0 T). Against that table:

| Measure | `requiredStripWidth` today | Proposed table |
|---|---|---|
| Historical allocations matching within ±5 mm | 1,489 / 1,914 (**77.8%**) | 1,817 / 1,914 (**94.9%**) |
| Productions with **no** spec-matching coil in inventory | **94** of 1,263 | **0** |

The 94 → 0 is the number that matters: that was the blocker. The residual 97 mismatched allocations
are not a wrong nominal — they sit in only three sections and their widths scatter from 64 mm to
297 mm, which is the mis-attribution issue #99 is about, measured directly.

The table still needs the plant to confirm it. The difference from last time is that they get a
filled-in draft to correct, not a blank ask.

## Why the formula could not work

`requiredStripWidth` computes an outer perimeter: `π × OD` for CHS, `2 × (H + B)` for SHS/RHS. The
data says the plant slits to a shared width instead:

```
  strip 76 mm ──┬── CHS 26.9   (π×OD = 84.5, off by 8.5)
                └── SHS 20x20  (2(H+B) = 80.0, off by 4.0)

  strip 96 mm ──┬── CHS 33.7   (105.9, off by 8.9)
                └── SHS 25x25  (100.0, off by 3.0)

  strip 148 mm ─┬── CHS 48.3   (151.7, off by 1.7)
                ├── SHS 38x38  (152.0, off by 3.0)
                └── RHS 50x25  (150.0, off by 3.0)
```

For SHS/RHS the error is a near-constant 3–5 mm, so ±5 mm scraped by. For CHS it ranges 1.7 to
8.9 mm, so round sections fell out of the window — `CHS-20NB` being the case already known.

Widths being shared between a round and a square section is consistent with the strip being formed
round and then squared on the mill, but the rule to encode is the sharing itself, not a mechanism we
should assume.

## The proposed table

Nominal width per section, from the modal slit width actually used, snapped to the centre of its
stock band. `WIDTH_TOL_MM` stays at ±5 mm.

| Strip | Sections it feeds | Stock band |
|---|---|---|
| 64 | CHS 21.3 | 64–65 |
| 76 | CHS 26.9, SHS 20x20 | 74–78 |
| 96 | CHS 33.7, SHS 25x25 | 94–97 |
| 116 | RHS 40x20, SHS 30x30 | 114–118 |
| 129 | CHS 42.4 | 126–131 |
| 148 | CHS 48.3, RHS 50x25, SHS 38x38 | 146–150 |
| 185 | CHS 60.3 | 182–187 |
| 196 | RHS 60x40, RHS 75x25, SHS 50x50 | 194–198 |
| 235 | CHS 76.1, SHS 60x60, RHS 80x40 | 232–237 |
| 272 | CHS 88.9 | 270–275 |
| 295 | SHS 75x75, RHS 100x50 | 292–297 |

Two properties worth checking before this ships:

- **±5 mm covers every band and never bridges two.** The tightest neighbours are 185 and 196 — their
  windows end at 190 and start at 191. One millimetre of clearance, but clear.
- **Thickness shifts the width 2–4 mm** across the gauge range (SHS 50x50 runs 198 mm at 1.6 mm down
  to 194 mm at 4.0 mm — thicker strip, narrower cut). That fits inside ±5 mm, so the table stays
  one-dimensional. Adding a thickness column would fit the noise in attribution data we already know
  is unreliable.

## What to change

### 1. Confirm the table with the plant — blocking

One page, 21 sections, 11 widths. Ask specifically about the two widths no section shares
(129 for CHS 42.4, 272 for CHS 88.9) and about the two 398 mm baby coils (14.6 T), which match no
section at all.

### 2. Production — replace the formula with the table

In `src/lib/calc.js`, `SECTION_TO_STRIP_WIDTH` + `stripWidthFor(sku)` replacing the geometry in
`requiredStripWidth`. `WIDTH_TOL_MM` and the `babyAsCoils` pre-filter in `src/App.jsx:959` are
unchanged — only the centre of the window moves. The picker's ✓ tick at `App.jsx:1011` reads the
same helper, so dropdown and FIFO suggestion cannot disagree, exactly as `rmRollsFg` did.

**Decision needed: what an unmapped section should do.** The thickness rule blocks — an FG gauge
absent from the sheet yields no eligible coil, no silent fallback. Width should *not* copy that.
Recommend: an unmapped section keeps the current degrade-to-thickness-only behaviour but shows an
explicit "no width rule for this section" badge, so it is visible instead of silent.

The reason to differ: Production is a **record of a run that already happened on the floor**, not
permission to run it. Blocking entry for a newly added size would mean the app refuses to record
real output until someone updates a table. A wide suggestion with a visible warning is the lesser
failure. Thickness had no such cost — a wrong pairing there was actively misleading the operator.

### 3. Slitting — constrain widths to the producible set

This is where the wrong widths originate. `Slitting` (`src/App.jsx:559`) takes width as free text and
validates only the **sum** against the mother coil. Nothing checks that a slit width corresponds to
any pipe the mill can make. Two consequences visible in the data:

- **Orphans.** The two 398 mm coils feed nothing.
- **Drift.** The 148 mm band holds five distinct widths (146, 147, 148, 149, 150) across 338 coils
  for what should be one mill setting. That drift is what forces Production's window to stay wide.

Change: offer the 11 standard widths on the width input, labelled with the sections each feeds, and
flag — not block — a non-standard entry. Same principle as the picker's ✓ tick.

Worth adding alongside it: show strips-per-mother and the remnant, since the numbers are already on
the form. A 1250 mm mother cut to 148 mm gives 8 strips and 66 mm left over.

**Not proposed:** a slit-plan optimiser that picks widths to minimise remnant. That is a scheduling
tool, it needs the order book as input, and it is not what this issue is about.

### 4. What the width-sum check should *not* change

Worth stating because it looks like a defect and is not. Of 251 mothers slit, 46 have baby widths
summing to more than the mother — but the worst is 10 mm on a 1250 mm coil (0.8%), and the average
mother is left 1.3 mm unslit. That is kerf and rounding. The existing three-colour badge is right to
warn and not block; it should stay as it is.

This is deliberately unlike the Production capacity cap, which now hard-blocks (`f7736d3`). There,
over-filling was physically impossible and cost 123.3 T. Here it is measurement noise.

### 5. Backfill — still no

The recommendation not to replay history is unchanged, and this work strengthens it rather than
unblocking it. The replay would now *complete* — 0 productions lack an eligible coil — but the same
data that fixed the table also measures how wrong the recorded attribution is: 97 allocations sit up
to 150 mm away from any width their SKU could use. Replaying overwrites recorded-and-wrong with
computed-and-also-wrong, and reassigns 957 of 1,251 productions on the way.

Prefer a one-time stock-correction entry, as already proposed on #99. Backups
`backup_productions_20260805` and `backup_dispatches_20260805` remain in place.

## Sequence

```
  [1] plant confirms table  ──> [2] Production reads table ──┐
                            └─> [3] Slitting offers widths ──┴─> stop new drift
                                                              [5] backfill: still no
```

2 and 3 are independent once 1 lands and can ship together. Nothing here is blocked on 5.

## What this does and does not move

**Changes:** which coils Production suggests, the ✓ tick, and therefore the quality of attribution
from deploy onward. Over time, `RM Baby Coil Left`.

**Does not change any headline tonnage.** Produced, FG Left Inventory, Invoiced and Total Orders all
derive from `tubeCount × weightPerTube` and never read `coilAllocations`. As with cap-and-spill, the
existing 123.3 T does not shrink — it stops growing, and works itself out as those coils clear.

## Verification before merge

- Per-section fit ≥ 90% of historical allocations within ±5 mm (currently 94.9% overall).
- Zero productions left with no spec-matching coil.
- Every existing baby coil width falls within ±5 mm of some nominal, or is reported (today: 2 coils,
  14.6 T).
- Unit tests on `stripWidthFor` covering a shared width, a section unique to one width, an unmapped
  section, and the CHS 26.9 / SHS 20x20 pair the old formula split.

## What has not been done

- **No code changed.** This is a plan only.
- **`scripts/coil-realloc-dryrun.mjs` was not re-run.** The 94 → 0 figure is a SQL check that a
  spec-matching coil *exists* in inventory; it ignores FIFO date order and remaining capacity. It is
  the right measure for "is the width rule the blocker", and it is not a claim that the replay places
  every production.
- **The plant has not confirmed anything.** The table is read off historical data, and that data is
  the same data issue #99 says is partly wrong.
- The original `handoff-width-rule-2026-08-05` document was written to a temp directory and is gone
  with its container. This was reconstructed from issue #99, commits `0df5993` / `f7736d3`, and the
  live database.

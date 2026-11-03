# Raw-material stock is aged on two clocks, in three bands

The Coil Tracker opens on raw-material stock sorted oldest first (ticket #241, parent #240). Each
coil carries an **age in whole days** and a **band**. The age is read from a different date for
each kind of stock, and the band edges are fixed.

## The two clocks

| Stock | Aged from | Why |
|---|---|---|
| **Unslit mother coil** — a live mother with no live baby coil | its **inward date** (`dateOfInward`) | How long it has waited to be slit. |
| **Baby coil stock** — `babyCoilIsStock`, ADR-0015, unchanged | its **slitting date** (`dateOfConversion`) | How long the slit coil has been available to produce from. **Never** its mother's inward date: a coil slit last week is not 180 days old because its mother is. |

Age = calendar days from that date to **today**, on the viewer's own calendar (local midnight).
`today` is an **input** to the view function, never read inside it, so a test is fixed in time.

## The three bands

```
age = null   → No date   (grey — kept and shown, never dropped)
age ≤ 30     → Clear
31 … 60      → Watch
age ≥ 61     → Act
```

The edges are inclusive on the lower band: **30 is Clear, 31 is Watch, 60 is Watch, 61 is Act.**
A coil with no date — or one that does not read as a date — is **No date**, not 0 days: unknown is
not new. It sorts **above** every dated row, where bad data is seen. None exist on live data today.

## What this decides, and what it does not

- **One function decides it:** `coilTrackerView` in `src/lib/calc.js`. The tables, and the matrix
  and trace that follow (#242, #243), read the same rows, so they cannot drift.
- **No new stock rule.** Baby coil stock is ADR-0015's `babyCoilIsStock`, read, never re-derived.
  An Assigned coil never appears; deleting its production brings it back.
- **No plant logic.** The app scopes the stores once (header selector / plant login) and every row
  carries the plant stored on its own record.
- **The edges are a display rule, not a policy.** They decide colour and order. Nothing is blocked,
  moved or costed by band.

## Live position (03-Nov-2026)

| Stock | Coils | T | Act | Watch | Clear | Oldest |
|---|---|---|---|---|---|---|
| Unslit mother | 39 | 824.9 | 6 · 117.8 T | 21 · 435.3 T | 12 · 271.8 T | 181 d |
| Baby in stock | 166 | 668.5 | 35 · 130.9 T | 60 · 235.6 T | 71 · 302.0 T | 169 d |

The ticket's 02-Nov figures (36 / 774.9 T and 171 / 675.1 T, oldest 180 d and 168 d) moved with a
day of inward, slitting and production; the oldest coils aged by exactly one day.

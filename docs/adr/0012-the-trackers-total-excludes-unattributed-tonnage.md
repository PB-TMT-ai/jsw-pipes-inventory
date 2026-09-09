# The Plant-wise Tracker's TOTAL excludes unattributed tonnage, and says so when it bites

The tracker's **TOTAL block is the sum of the four plant blocks only**. There is no Unattributed
block. This departs from the rule in `docs/DATA-MODEL.md` that `Unattributed` tonnage **stays inside
every total** and is never a "rest" bucket to be dropped, and the departure is knowing.

## Why

Unattributed is **0 T today** — every coil, baby coil, production and dispatch entry in the live
database resolves to one of the four plants. A permanent Unattributed block costs **ten rows** on a
grid that is already fifty, to show ten rows of zeros, forever.

## Why that is not enough on its own

The rule exists because the daily sales upload **imports an unrecognised `Ship From Code` rather than
failing** — by design, so a fifth company appearing in the ERP cannot stop the file loading. The day
that happens, this section's TOTAL silently stops agreeing with the Dashboard cards above it, and
nothing on screen would say why. "It is zero today" is an argument with an expiry date on it.

## The tripwire

`plantTrackerGrid` computes the unattributed block whether or not it renders one, and returns
`excluded` — **which KPI rows carry orphaned tonnage and how much** — or `null` when there is none.

It names the **flow rows only, by their month sum**, and that is load-bearing rather than tidy:

- A **stock** row's MTD is its *latest close*, which carries in from earlier months. Reporting one
  would raise the alarm on a perfectly clean September over an orphan inwarded in August — and the
  criterion is "a month with unattributed tonnage shows it, **a clean month does not**".
- The stock rows are **derived** from the flows, so naming them as well announces one orphaned 7 T
  coil three times over (Coil Inward, Coil Stock, RM Availability) and reads as **21 T**.

The flows are the events, they are what the month actually excluded, and they add up.

- Nothing renders on a clean month: no empty banner, no placeholder, no zero.
- When there is orphaned tonnage, an **amber line** appears under the section naming the rows and the
  amounts, and pointing at where the plant is fixed (Coil Inward, or the Ship From Code on the
  upload).
- It follows the section's own month dropdown, so a clean month stays quiet while a bad one speaks.

The exclusion from TOTAL is the decision. The amber line is what stops it being a silent one.

## What this is not

It is **not** a licence to drop Unattributed elsewhere. Every other total in the app still carries it,
and `Unattributed` is still not a fifth plant. This is one grid, with one stated reason, and one
alarm attached.

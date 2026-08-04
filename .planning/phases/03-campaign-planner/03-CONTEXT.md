# Phase 3: Campaign Planner & Monitor — Context

**Gathered:** 2026-08-04
**Status:** Ready for planning
**Source:** `/grill-with-docs` session (grilling + domain-modeling), 10 questions, all answered by the user

<domain>
## Phase Boundary

One new tab in `src/App.jsx` carrying both halves of the monthly production plan behind a
**Plan / Track** switch. The Planner builds a Campaign from the Best Estimate and trailing sales;
the Monitor scores actual production against the committed Campaign.

In scope: the new tab, two `calc.js` helper families, four new Supabase tables, six `CONTEXT.md`
terms, ADR-0003.

Out of scope: run sequencing (needs changeover cost, never gathered), the second shift, coil
requirement derivation, campaigns in `reports.js`, any change to Production, Slitting, Dispatch,
Orders, Sales or the FIFO logic.
</domain>

<plant>
## Plant configuration (established this session, recorded in `.scratch/pt-os-research/issues/04`)

| Fact | Value | Source |
|---|---|---|
| Plants / mills | one plant (Hyderabad), one mill | user, 2026-08-04 |
| Shift | 12 h/day | user, 2026-08-04 |
| Effective rate | **4.32 t/h** | measured: Jul 1,400.3 MT ÷ 27 days ÷ 12 h |
| Rate stability | May 4.21, Jun 4.24, Jul 4.32 | `productions` |
| Working days rule | calendar days − Sundays | matches Jul exactly (27 = 27) |
| Family floor | 20 MT | user, 2026-08-04 |
| Gauge floor | 3 MT | user, 2026-08-04 |

The research's 12 t/h is a large-mill figure and is **2.8× too high** for 12.5–100 mm sections. It
must not appear anywhere in this phase.

### Numbers this phase was designed against

```
Jul 2026 production     1,400.3 MT   16 families   51 gauges   324.1 h
Jul unplanned families  3 of 16      289.1 MT      66.9 h      (21% of the month)
Aug 2026 hour budget    26 non-Sundays × 12 h = 312 h
Aug 2026 Best Estimate  1,450.0 MT across 5 distributors = 335.6 h
Aug 2026 verdict        over budget by 23.6 h ≈ 102 MT, before anyone types anything
Open order book          58.0 MT (16 lines) = 13.4 h = 4% of the mill
```

The order book cannot drive this plan. 478 of 547 order lines are already Delivered; the forward
book is about one day of mill time.
</plant>

<decisions>
## Implementation decisions (LOCKED)

### D1 — A Campaign is persisted, not recomputed
The operator commits a plan; the Monitor measures the commitment. A live-recomputed plan gives the
Monitor no referent — "62% of plan" is meaningless if the plan silently rewrites itself.

### D2 — Two levels, one typed
Family targets are typed by the operator. Gauge targets are suggested from trailing sales and are
editable. Both persist. Family-only would let the mill hit its tonnes in the wrong thicknesses and
report 100%.

### D3 — Demand is Best Estimate for volume, trailing sales for mix
```
VOLUME    Plant Best Estimate for the month      1,450 MT for Aug 2026
  ×
MIX       trailing sales by family and gauge     last month only
  +
OVERLAY   open orders                            58 MT, named and dated
  −
STOCK     On-hand by family                      produced − invoiced
```
**Fallback:** no Best Estimate typed for the month → volume comes from trailing sales.

### D4 — Planning is human-initiated, in two acts
The Planner does **not** compute on render. **Initiate** snapshots demand at that moment (orders
arrive late, so when to snapshot is the operator's call). **Commit** saves. Two distinct presses.

### D5 — A Campaign spans a calendar month; one Campaign per month
`month` is UNIQUE on `campaigns`. Revisions live inside the Campaign. A September Draft may coexist
with a running August — different months.

### D6 — Hour budget is derived then editable
```
budget_h = (calendar days − Sundays − operator exceptions) × 12 h
```
Exceptions cover maintenance, holidays and shutdown. The computed value matched July exactly and
missed May by two days, so it must be overridable.

### D7 — Over budget warns, never blocks
Shown as a test, never a verdict: `336 / 312, over by 24 h ≈ 102 t`. No auto-defer, no pro-rata
trim. Deferring a family is a commercial act and the software does not make it quietly — the same
rule as "never auto-save the FIFO suggestion".

### D8 — The Baseline survives revision; the gap decomposes three ways
```
Baseline − Achieved = (Baseline − Revised) + (Revised − Feasible) + (Feasible − Achieved)
                       demand changed        never fit the hours    the mill missed
```
`Feasible = budget_h × 4.32`. Attribution is **first-versus-latest only**. See ADR-0003.

### D9 — Family is the commitment; the gauge split must reconcile to it
Σ gauge targets must equal the family target. The mismatch shows as a test while drafting and
blocks only the Draft → Active transition. The family number is never silently rewritten to match
an edited gauge.

### D10 — Plan / Track switch, not stacked blocks
One tab, one switch. Opens on **Track** once the Campaign is Active. The Plan side is read-only
until **Revise** is pressed, which is what creates the revision and asks for its one-line reason.

### D11 — Unplanned production is highlighted and never deducted
A Family with no plan row, or a planned Family made at an uncommitted Gauge. Both are listed in
their own highlighted block with their hours stated. **Those hours are not charged against the Hour
budget** — the plant honours the full commitment regardless of what else it ran. The block explains
a shortfall; it never reduces one.

```
Plan asks for       312 h
Unplanned took       67 h  of the same mill        (July's real figure)
──────────────────────────
Mill asked for      379 h  in a 324 h month
```

### D12 — Draft → Active → Closed, every transition by hand
Nothing auto-commits and nothing auto-closes. An uncommitted Draft at month start leaves the
Monitor stating "no Campaign committed for this month", with the Draft still openable.
</decisions>

<defaults>
## Defaults taken unattended (user: "ok")

- The switch opens on **Track** once Active; Plan is read-only until Revise.
- "On pace" = working days elapsed ÷ working days in month, straight line.
- Trailing window for the mix = **last month only**.
- Revision attribution = first-versus-latest only.
</defaults>

<risks>
## Recorded risks, not open questions

- **The plan is structurally ~80% of reality.** Mix comes from trailing sales, so a Family not sold
  last month cannot be planned. July would have shown 289 MT and 67 h unplanned. Under D11 that is
  highlighted but never forgiven, so the Monitor will read red most months even when the plant did
  well. This is the design behaving as specified. If the red becomes wallpaper, the fix is a
  reserve line in the Hour budget.
- **One month has a Best Estimate.** Aug 2026 only. Miss a month and D3's fallback silently drops
  to trailing sales, which can never plan for a month expected to be bigger than the last.
- **Best Estimate enters at face value.** Distributor reliability scoring is out of scope, so an
  inflated estimate becomes an inflated production commitment with nothing to catch it.
</risks>

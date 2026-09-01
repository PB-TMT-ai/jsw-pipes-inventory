---
phase: 03-campaign-planner
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [supabase-setup.sql, src/lib/db.js, src/lib/calc.js, src/lib/calc.test.js, src/App.jsx, CONTEXT.md, docs/adr/0003-campaign-baseline-survives-revision.md]
autonomous: false
requirements: [R1, R2, R3, R4, R5, R6]

must_haves:
  truths:
    - "A Campaign is one row per calendar month (month UNIQUE); its targets hang off campaign_revisions, and revision 1 is the Baseline and is never overwritten."
    - "The Hour budget derives as (calendar days − Sundays − operator exceptions) × 12 h and is editable; Jul 2026 computes 324 h and Aug 2026 computes 312 h."
    - "Demand suggestion = Plant Best Estimate for the month for volume, trailing-month sales for the family and gauge mix, plus open orders, less On-hand; with no Best Estimate typed the volume falls back to trailing sales."
    - "Nothing computes on render: Initiate snapshots the demand inputs, Commit persists them, and both are separate operator presses."
    - "A plan over the Hour budget saves and shows a test, never a verdict — '336 / 312, over by 24 h ≈ 102 t' — and no family is ever auto-deferred or pro-rata trimmed."
    - "Σ gauge targets must equal the family target; the mismatch renders as a test while Draft and blocks only the Draft → Active transition, and the family target is never silently rewritten."
    - "The Monitor decomposes Baseline − Achieved into exactly three named causes that sum to it: demand changed, never fit the hours, the mill missed."
    - "Unplanned production is listed in its own highlighted block at both family and gauge level with its hours stated, and those hours are never deducted from the Hour budget nor from any shortfall."
    - "The tab carries a Plan / Track switch, opens on Track once the Campaign is Active, and the Plan side is read-only until Revise is pressed, which creates the revision and stores its one-line reason."
    - "Draft → Active → Closed are all operator presses; nothing auto-commits or auto-closes, and an uncommitted Draft at month start leaves the Monitor stating no Campaign is committed."
  artifacts:
    - path: "supabase-setup.sql"
      provides: "campaigns / campaign_revisions / campaign_lines / campaign_gauges tables with RLS, month UNIQUE, and the composite unique keys the upserts arbitrate on"
      contains: "campaign_revisions"
    - path: "src/lib/db.js"
      provides: "TABLE_MAP entries for the four stores and CONFLICT_TARGET entries for the composite arbiters"
      contains: "campaign_gauges"
    - path: "src/lib/calc.js"
      provides: "MILL_RATE_TPH, campaignWorkingDays, campaignHourBudget, campaignSuggestion, campaignProgress, campaignUnplanned, familyKey"
      contains: "MILL_RATE_TPH"
    - path: "src/App.jsx"
      provides: "Campaign tab with Plan / Track switch, Initiate + Commit + Revise + Close actions, family table with editable targets, expandable gauge split, hour-budget test, three-cause decomposition, highlighted unplanned block"
      contains: "campaignProgress"
  key_links:
    - from: "family target cell"
      to: "gauge split reconciliation test"
      via: "Σ campaign_gauges.target_mt compared to campaign_lines.target_mt, gating the Commit button"
      pattern: "gaugeReconciled"
    - from: "Revise button"
      to: "a new campaign_revisions row"
      via: "revision_no increments, reason stored, revision 1 left untouched as the Baseline"
      pattern: "revision_no"
    - from: "productions in the campaign month"
      to: "achieved MT per family and gauge"
      via: "resolveProductionWeights then familyKey / canonicalSkuKey, never a raw skuCode compare"
      pattern: "familyKey"
    - from: "unplanned block hours"
      to: "the Hour budget"
      via: "reported alongside, deliberately NOT subtracted"
      pattern: "campaignUnplanned"
---

<objective>
Add a **Campaign** tab to `src/App.jsx` carrying the monthly production plan behind a Plan / Track
switch, backed by four new Supabase tables and six new `calc.js` helpers.

All twelve locked decisions are in `03-CONTEXT.md`. The plant configuration this is built on —
one mill, 12 h/day, 4.32 t/h, floors of 20 MT and 3 MT — is recorded in
`.scratch/pt-os-research/issues/04-plant-mill-configuration.md`.
</objective>

<requirements>
## R1 — Data model

Four tables, following the `distributor_estimates` pattern (`supabase-setup.sql:178`).

```
campaigns            id, month UNIQUE, status, budget_h, days_override,
                     day_exceptions jsonb, notes, deleted, created_at
campaign_revisions   id, campaign_id, revision_no, committed_at, reason,
                     deleted, created_at            UNIQUE (campaign_id, revision_no)
campaign_lines       id, revision_id, family_key, target_mt, suggested_mt,
                     deleted, created_at            UNIQUE (revision_id, family_key)
campaign_gauges      id, line_id, sku_key, target_mt, suggested_mt, was_suggested,
                     deleted, created_at            UNIQUE (line_id, sku_key)
```

`status` ∈ `draft` | `active` | `closed`. Revision 1 is the Baseline.

**`db.js` wiring** — store keys `jsw:campaigns`, `jsw:campaignRevisions`, `jsw:campaignLines`,
`jsw:campaignGauges` into `TABLE_MAP` (`db.js:50`). Soft-delete, so **not** in
`HARD_DELETE_TABLES`.

**`CONFLICT_TARGET` (`db.js:73`) — the trap that already burned `distributor_estimates`.** Each of
the three child tables has a composite unique index; upserting on `id` makes a conflict on that
index a hard error rather than an update. Add:

```js
campaign_revisions: 'campaign_id,revision_no',
campaign_lines:     'revision_id,family_key',
campaign_gauges:    'line_id,sku_key',
```

## R2 — `calc.js` helpers

```js
export const MILL_RATE_TPH = 4.32        // measured, one mill, 12 h/day — see 03-CONTEXT
export const FAMILY_FLOOR_MT = 20
export const GAUGE_FLOOR_MT = 3

familyKey(sku)                            // `${productType} ${skuSizeLabel(sku)}` — the Family key
campaignWorkingDays(month, exceptions)    // calendar days − Sundays − exceptions
campaignHourBudget(campaign)              // workingDays × 12, honouring days_override
campaignSuggestion(month, ctx)            // → family rows { familyKey, suggestedMt, gauges[] }
campaignProgress(campaign, revs, lines, gauges, productions, skus)
campaignUnplanned(campaign, lines, gauges, productions, skus)
```

**`campaignSuggestion`** implements D3. Volume from `plantBestEstimate(estimates, month)`; mix from
the trailing month's dispatches by `familyKey` then `canonicalSkuKey`; plus open-order quantity by
family; less `producedPool` availableWeight. Falls back to trailing-month sales for volume when
`plantBestEstimate` is null. Returns suggestions only — **never persists**, same rule as the FIFO
suggestion.

**`campaignProgress`** returns per-family `{ target, achieved, hours, pct, onPace }` plus the
month totals and the D8 decomposition. The decomposition must be asserted as an identity, not
computed independently:

```
baseline − achieved === (baseline − revised) + (revised − feasible) + (feasible − achieved)
feasible = campaignHourBudget(campaign) × MILL_RATE_TPH
```

**`campaignUnplanned`** returns families produced with no `campaign_lines` row, and gauges produced
under a planned family with no `campaign_gauges` row. Each carries MT and `MT ÷ MILL_RATE_TPH`
hours. **These hours are returned for display only and must not be subtracted from the budget or
from any shortfall** (D11).

Join keys throughout: `familyKey` for family, `canonicalSkuKey` for gauge, weights from
`resolveProductionWeights`. Never a raw `skuCode` string compare — ERP twin codes would split one
physical size into two rows.

## R3 — Planner (Plan side)

`Section` + `DataTable`, reusing `Field` / `Input` / `Select` / `Btn` / `Badge` / `Card`.

- Month selector; **Initiate** button (snapshots demand, D4); family table with editable
  `target_mt`; expandable gauge split per family.
- Header carries the hour test: `336 / 312, over by 24 h ≈ 102 t`. Red, non-blocking (D7).
- Gauge reconciliation test per family: `245 / 240, over by 5 t`. Non-blocking while Draft;
  **Commit disabled until every family reconciles** (D9).
- Colour convention per `docs/UI-PATTERNS.md`: blue = manual (`target_mt`), green = auto
  (`suggested_mt`, hours), yellow = warning (over budget, unreconciled).
- **Commit** (Draft → Active) writes revision 1. **Revise** on an Active campaign opens a one-line
  reason box and writes revision *n+1*, leaving revision 1 untouched.

## R4 — Monitor (Track side)

- KPI cards: Committed / Feasible / Achieved / Hours used / Days elapsed.
- The D8 decomposition, rendered as the identity with all four numbers visible.
- Family table: target, achieved, left, %, on-pace badge. Expandable to gauge.
- **Unplanned block, visually distinct**, listing unplanned families and unplanned gauges with MT
  and hours, captioned that its hours are not charged against the budget (D11).
- Recharts bar: planned vs achieved per family.

## R5 — Tab integration

- `TABS` (`App.jsx:2815`): insert `{ key: 'campaign', label: 'Campaign' }` after `dispatch`.
- `TABLE_LABELS` (`App.jsx:2828`): four entries so `SyncErrorBanner` names them.
- Four `useSupabaseStore` calls alongside the existing seven (`App.jsx:2922`).
- Render switch (`App.jsx:3008`): one line, passing `resolvedProductions`, `dispatches`, `orders`,
  `skus`, `distributorEstimates`.
- Plan / Track switch defaults to Track when `status === 'active'` (D10).

## R6 — Glossary and decision record

Both already written:
- `CONTEXT.md` — Campaign, Family, Gauge, Hour budget, Baseline, Unplanned production.
- `docs/adr/0003-campaign-baseline-survives-revision.md`.
</requirements>

<verification>
## Tests — `src/lib/calc.test.js`

| Case | Expected |
|---|---|
| `campaignWorkingDays('2026-07')` | 27 — matches the 27 actual production days exactly |
| `campaignWorkingDays('2026-08')` | 26 |
| `campaignHourBudget` for Aug 2026 | 312 |
| Feasible for Aug 2026 | 312 × 4.32 = 1347.84 MT |
| Aug Best Estimate 1,450 MT | 335.65 h needed, over budget by 23.65 h |
| Decomposition | the three causes sum to `baseline − achieved`, exactly |
| Gauge reconciliation | family 240 with gauges 23/45/92/85 → over by 5, Commit blocked |
| No Best Estimate for the month | volume falls back to trailing sales, not zero |
| Unplanned family | a family produced with no line appears in `campaignUnplanned` |
| Unplanned gauge | a planned family made at an uncommitted thickness appears too |
| **Unplanned hours** | budget and shortfall are **unchanged** by unplanned production |
| ERP twin codes | two `skuCode`s for one physical size collapse to one family row |

## Manual

1. `npm run dev`, open Campaign, select Aug 2026, press Initiate. Expect a suggestion summing near
   1,450 MT and the header reading over budget by ~24 h.
2. Edit a gauge so the split no longer balances — Commit must disable and the test must show.
3. Commit, hard-refresh — all four tables persist. Re-save a line under a fresh id: must UPDATE,
   not error. That proves the composite conflict targets.
4. Record a production against a planned family inside the month — Achieved moves by exactly that
   tonnage.
5. Record a production against a family **not** in the plan — it appears in the unplanned block,
   and Hours used against the budget does **not** move.
6. Press Revise, give a reason, change a target. Baseline stays at its original value and the
   decomposition attributes the difference to "demand changed".

## Playwright

Extend `e2e/` with initiate → commit → produce → track, asserting the unplanned block appears and
the budget is untouched by it.
</verification>

<notes>
## Explicitly not built

Sequencing (needs changeover cost, never gathered), the second shift, coil requirement derivation,
campaigns in `reports.js`, any reserve line in the budget. All recorded in `03-CONTEXT.md` under
risks and scope.
</notes>

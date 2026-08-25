# Blueprint: Add a New Field to a Stage

## Goal
Add a new data field to one of the 4 pipeline stages (Coil Inward, Production, Bundle Formation, Dispatch).

## Inputs Required
- stage: number (1-4, which stage to modify)
- fieldName: string (camelCase name for the field)
- fieldLabel: string (display label)
- fieldType: string (text | number | date | dropdown)
- source: string (manual | auto-calculated | auto-fetched | **set-once-then-inherited**)
- calcLogic: string (if auto-calculated, the formula)

## Steps
1. Open `src/App.jsx`
2. Find the stage component (search for `// STAGE {n}:`)
3. Add field to `emptyForm` object with default value
4. Add `<Field>` + `<Input>` or `<Select>` in the form grid
   - Manual fields: `<Field label="...">` (blue, `○` prefix)
   - Auto-calc fields: `<Field label="..." auto>` with `disabled` input (green, `●` prefix)
5. If auto-calculated: add `useMemo` for the calculation
6. Add field to the `save()` function's record construction
7. Add column to the `columns` array for the DataTable
8. If **set-once-then-inherited** (see the edge case below): render the control only on the create
   path, a read-only `<Input>` of the resolved label on edit, and re-derive it in the downstream
   stages' `save()` rather than adding a control there
9. Test: add a record, verify field appears in form and table

## Edge Cases
- If field depends on cross-stage data: add it to the component's props and pass from `App()`
- If field affects weight calculations: recalculate all sibling weights after save
- If field needs validation: use `tolerance()` helper with `<Badge>` display
- **If the field is set once and then inherited** (plant, ticket #120): it is typed at ONE stage and
  derived everywhere downstream, so there are four rules, not one. (1) The create form gets the
  control; the edit form gets a read-only `<Input>` of the *label*, never a disabled `<Select>` — a
  select falls back to an option and will show a value over a row that stores blank. (2) Guard the
  save on the create path only, or existing rows that predate the field become uneditable. (3) The
  downstream stages re-derive it inside `save()` from the row they inherit from, every time — never
  carry the stored value forward, or an edit can move the child off its parent. (4) Existing rows
  need a real SQL backfill **gated on the column not existing yet**; a bare `where … is null` will
  later re-stamp rows the app deliberately left empty. Pure resolvers go in `src/lib/calc.js`.

## Field Component Features
- `<Field label="..." helper="...">` — adds small gray helper text below the label
- `<Field label="..." auto>` — green label (●) for auto-calculated fields
- `<Field label="..." warn>` — yellow label (▲) for warning fields

## Known Issues
- The single-file architecture means all changes are in App.jsx — use section comments to navigate
- Adding many columns may require horizontal scroll on mobile — test responsive layout

## Recent Field Changes
- **2026-08, Stage 3: `productionPoNo` — a MANDATORY field that is mandatory on ONE path.** The PO
  issued to the contract manufacturer for a batch. Two things worth reusing. (1) **Mandatory means
  create-only, by default.** 1,286 production rows predated the field; adding it to `canSave`
  unconditionally would have frozen every one of them behind a PO nobody can supply — the same trap
  the `plant` edge case above was written for, arrived at from the opposite direction (there the
  control had to disappear on edit; here the *guard* does). The guard reads `!editId && !poNo`, and
  blank stays a legitimate stored value forever. (2) **Check whether the name is already taken.**
  `poNumber` already existed on coils and baby coils meaning something else entirely, and
  `childOrderId` is the customer's PO — so this became `productionPoNo`, and the three are now
  tabulated in `docs/DATA-MODEL.md` ("The three POs"). Free text with a `<datalist>` of prior POs
  (`productionPoOptions`) and `.trim().toUpperCase()` on save (`normalizeProductionPoNo`) — both in
  `calc.js` with tests, because a stamp with no master behind it is only worth what its spelling
  consistency is worth. Live DDL was applied BEFORE the app code shipped: `toSnake` sends every key
  to PostgREST, so a missing column fails EVERY save on the stage, not just the ones using the field.
- **2026-08 (#124), Stage 3: `plant` became a SCOPE, not just an inherited value** — the first time
  a set-once field also decides what a later stage may *consume*. Production's two coil pickers are
  drawn from one plant (`babyCoilsAtPlant`, one `filterByPlant` read by the FIFO adapter and the
  manual dropdown alike), `coilFifoAllocate` gained a `plant` argument it applies ahead of its own
  rules, and `crossPlantAllocationRows` re-checks the operator's rows at save time — because the
  rows outlive a change of plant, so scoping the pickers alone does not constrain what is written.
  The stored value is still never typed: `productionPlant` re-derives it from the allocations. The
  operating plant (which plant you work *as*) comes from the header selector until phase 3 puts it
  on the login — see CONTEXT.md for that term. **If you add a field that gates which rows a later
  stage may consume, budget for both checks:** the one over the list you render, and the one over
  the state the operator has been holding while the list changed underneath them.
- **2026-08 (#123), Stage 1: `plant` widened to NPMD** — `COIL_INWARD_PLANT_IDS` (`calc.js`) grew
  from `['hyderabad']` to `['hyderabad', 'npmd']`, the one line the #120 entry below called out as
  outstanding. Nothing else in the field changed: Slitting/Production inheritance and the
  `NPM-` numbering `coilInwardPlants()` was gated in front of were already plant-agnostic (readied
  in #122), so widening the gate was sufficient on its own. Lepakshi and Tapi still never appear —
  `coilInwardPlants()` keeps intersecting the list with `manufactures`.
- **2026-08 (#120), Stages 1-3: `plant`** — the first *set-once-then-inherited* field, and the shape
  the Edge Case above was written from. Typed at Coil Inward only (`coilInwardPlants()`, Hyderabad
  alone until phase 2); Slitting takes the mother's via `babyCoilPlant`, Production takes its baby
  coils' via `productionPlant` (one plant across every allocation, else `Unattributed`). Helpers and
  their tests live in `src/lib/calc.js` / `calc.test.js`; `supabase-setup.sql` adds the column and
  backfills to `hyderabad` in one gated block. See `docs/adr/0005-…` and `docs/UI-PATTERNS.md`.
- **2026-06 process change (Slitting back + baby-coil FIFO; Bundle removed; Excel Dispatch)**: pipeline is now Coil Inward → **Slitting** → **Production** → **Dispatch (Excel)**. Slitting (`jsw:babyCoils` → `baby_coils`, re-enabled) splits mother→baby proportionally by width (manual mother pick). Production FIFO-consumes **baby coils** — `coilFifoAllocate` is fed baby coils via an adapter and allocations are enriched to `{babyCoilId, hrCoilId(mother), pieces, weight}`. Bundle Formation was **removed**; `bundleCoilTrace`→`dispatchCoilTrace`, `producedPool` = produced − dispatched, `coilInventoryRow(coil, dispatches, productions)` drops the bundled stage. Dispatch is **uploaded from Excel** (`mapDispatchRow`, mirrors PO Master). When adding a field that affects coil attribution, change the calc helper, not inline UI math.
- **2026-06 process change (Production + FIFO)**: added the **Production** stage + **FIFO coil attribution** (`coilFifoAllocate`); `coilAllocations` JSONB; helpers in `src/lib/calc.js` (unit-tested).
- **2026-06 (superseded)**: the slit/tube stages were briefly removed, then Slitting was re-introduced (see top entry). The **tube** stage stays removed; `tubes` is legacy.
- 2026-04-08, Stage 1: Carbon, Mn, YS, Elongation fields **removed** — chemistry specs managed outside system
- 2026-04-08, Stage 1: Coil Grade changed from `<Select>` dropdown to free text `<Input>`

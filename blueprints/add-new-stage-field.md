# Blueprint: Add a New Field to a Stage

## Goal
Add a new data field to one of the 4 pipeline stages (Coil Inward, Production, Bundle Formation, Dispatch).

## Inputs Required
- stage: number (1-4, which stage to modify)
- fieldName: string (camelCase name for the field)
- fieldLabel: string (display label)
- fieldType: string (text | number | date | dropdown)
- source: string (manual | auto-calculated | auto-fetched)
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
8. Test: add a record, verify field appears in form and table

## Edge Cases
- If field depends on cross-stage data: add it to the component's props and pass from `App()`
- If field affects weight calculations: recalculate all sibling weights after save
- If field needs validation: use `tolerance()` helper with `<Badge>` display

## Field Component Features
- `<Field label="..." helper="...">` — adds small gray helper text below the label
- `<Field label="..." auto>` — green label (●) for auto-calculated fields
- `<Field label="..." warn>` — yellow label (▲) for warning fields

## Known Issues
- The single-file architecture means all changes are in App.jsx — use section comments to navigate
- Adding many columns may require horizontal scroll on mobile — test responsive layout

## Recent Field Changes
- **2026-06 process change (Slitting back + baby-coil FIFO; Bundle removed; Excel Dispatch)**: pipeline is now Coil Inward → **Slitting** → **Production** → **Dispatch (Excel)**. Slitting (`jsw:babyCoils` → `baby_coils`, re-enabled) splits mother→baby proportionally by width (manual mother pick). Production FIFO-consumes **baby coils** — `coilFifoAllocate` is fed baby coils via an adapter and allocations are enriched to `{babyCoilId, hrCoilId(mother), pieces, weight}`. Bundle Formation was **removed**; `bundleCoilTrace`→`dispatchCoilTrace`, `producedPool` = produced − dispatched, `coilInventoryRow(coil, dispatches, productions)` drops the bundled stage. Dispatch is **uploaded from Excel** (`mapDispatchRow`, mirrors PO Master). When adding a field that affects coil attribution, change the calc helper, not inline UI math.
- **2026-06 process change (Production + FIFO)**: added the **Production** stage + **FIFO coil attribution** (`coilFifoAllocate`); `coilAllocations` JSONB; helpers in `src/lib/calc.js` (unit-tested).
- **2026-06 (superseded)**: the slit/tube stages were briefly removed, then Slitting was re-introduced (see top entry). The **tube** stage stays removed; `tubes` is legacy.
- 2026-04-08, Stage 1: Carbon, Mn, YS, Elongation fields **removed** — chemistry specs managed outside system
- 2026-04-08, Stage 1: Coil Grade changed from `<Select>` dropdown to free text `<Input>`

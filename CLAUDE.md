# JSW Pipes & Tubes Inventory

React 18 + Vite SPA (JSX, Tailwind 3.4, Recharts) backed by Supabase Postgres.
Single-file app: `src/App.jsx`. Pure helpers: `src/lib/calc.js`. Data layer: `src/lib/db.js`.

## How you operate
1. **Check `blueprints/` first.** If a blueprint covers the task, follow it exactly.
2. **Use `scripts/`** — don't rewrite tested code. `.workspace/` is temp; never commit it.
3. **Fail forward:** error → fix → test in browser → update the blueprint → log in `LEARNINGS.md`.
4. **Ask before** creating or overwriting a blueprint.

90% accuracy across 5 steps = 59% success. Push repeatable work into tested scripts;
you make the decisions. Don't create files outside the existing structure.

## Read before you change these areas

| Area | Read first |
|---|---|
| Pipeline stages, tabs, project layout, how to run | `docs/ARCHITECTURE.md` |
| Supabase tables, store keys, sync, auth | `docs/DATA-MODEL.md` |
| FIFO coil allocation, weight & costing | `docs/ALGORITHMS.md` |
| Components, DataTable, per-stage forms | `docs/UI-PATTERNS.md` |

Read the matching doc **before** editing that area. Skipping it causes regressions.

## Run
```bash
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3000
```

## Non-negotiables
- **Never** derive tube weight from a density constant — use `SKU.weightPerTube`.
- **Never** make Production consume mother coils. It consumes **baby coils** (Stage 2 slitting output).
- **Never** auto-save the FIFO suggestion. In Production it is guidance only; the operator's
  explicit selection (`manualAlloc`) is what `save()` persists.
- **Never** write production `coilAllocations` without **both** `babyCoilId` and the mother
  `hrCoilId` — the mother id drives cost reconciliation and Coil Tracker.
- **Never** reintroduce the **tube** stage / `tubes` store or **Bundle Formation** / `bundles`
  store. Both removed; the tables are legacy.
- **Never** hand-enter Dispatch — it is uploaded from the daily Sales Excel.
- **Never** break the single-file `App.jsx` pattern without an explicit request.
- **Never** ignore an error and retry blindly — read it, isolate the stage, fix, test,
  then log it in `LEARNINGS.md` and update the blueprint.
- Soft-delete (`deleted: true` + filter on display); IDs via `crypto.randomUUID()`;
  functional components only.

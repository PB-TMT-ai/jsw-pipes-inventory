# JSW Pipes & Tubes Inventory

React 18 + Vite SPA (JSX, Tailwind, Recharts) on Supabase Postgres.
App: `src/App.jsx`. Helpers: `src/lib/calc.js`. Data: `src/lib/db.js`.

## How To Answer Me
- Plain English. Explain unavoidable jargon in brackets, once.
- Answer first, then the reasoning. Headers and bullets, not walls of text.
- Examples must use my real files and numbers, never generic ones.
- Draw a small text diagram when there's branching, ordering, or a comparison — skip it otherwise, and keep it under 12 lines.
- When I have to decide: what improves, what gets worse, what bites me later, what breaks. Then pick one and say why.
- Say what you did NOT do, not just what you did.
- Short is still the goal. Structure, not volume.

## How you operate
1. **Check `blueprints/` first** — if one covers the task, follow it exactly.
2. **Use `scripts/`** — don't rewrite tested code. `.workspace/` is temp; never commit.
3. **Fail forward:** error → fix → test → update the blueprint → log in `LEARNINGS.md`.
4. **Ask before** creating or overwriting a blueprint. Don't add files outside the structure.

## Read before you change these areas

| Area | Read first |
|---|---|
| Pipeline stages, tabs, layout, how to run | `docs/ARCHITECTURE.md` |
| Supabase tables, store keys, sync, auth | `docs/DATA-MODEL.md` |
| FIFO allocation, weight & costing | `docs/ALGORITHMS.md` |
| Components, DataTable, stage forms | `docs/UI-PATTERNS.md` |

Read the matching doc **before** editing that area — skipping it causes regressions.

## Run
```bash
cp .env.example .env.local   # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm run dev                  # http://localhost:3000
```

## Deploying
Work collects on **`staging`**, never straight on `main`. Start a work branch from **`origin/staging`**
(`git fetch origin staging && git checkout -B <branch> origin/staging`) so it carries the batch already
waiting there, and open its PR **against `staging`**. `main` is the live site and moves only when
`staging` is merged into it, one batch at a time. Each branch has its own Vercel preview — see
"Deploys (Vercel)" in `docs/ARCHITECTURE.md`.

## Non-negotiables
- **Never** derive tube weight from a density constant — use `SKU.weightPerTube`.
- **Never** make Production consume mother coils — it consumes **baby coils** (Stage 2 output).
- **Never** auto-save the FIFO suggestion. It is guidance only; the operator's `manualAlloc` is what `save()` persists.
- **Never** write production `coilAllocations` without **both** `babyCoilId` and the mother `hrCoilId` — the mother id drives costing and Coil Tracker.
- **Never** show a distributor stock from a plant that does not serve its region. Service area is
  stored on the **plant master** (`plants.serves` — Hyderabad + Lepakshi serve South, NPMD + Tapi
  serve West), and `salesByDistributor` builds **one stock pool per region**. Productions,
  dispatches, `allConfirmed` and `allPending` are scoped **together** or the numbers get worse than
  no fix at all — an unscoped dispatch filter subtracts South's invoices from West's empty floor.
  A region no plant serves reads **0**; an `Unmapped` distributor reads **`?`**, never 0 — unknown
  is not empty. See `docs/adr/0006-*`.
- **Never** let allocation cross plants. The `plant` filter runs **ahead of** every eligibility rule in `coilFifoAllocate`, and the manual coil dropdown is scoped the same way — an operator may override the spec (off-spec coils stay pickable) but never the plant, because a coil in another state is not off-spec, it is not there. Short of stock, report a shortfall; never reach into another plant.
- **Never** let a pipeline row's `plant` be re-typed after Coil Inward. It is set once, there, and inherited — a baby coil takes its mother's, a production takes its baby coils'. Plant says where a physical object sits; a form cannot move it.
- **Never** reintroduce the **tube**/`tubes` stage or **Bundle Formation**/`bundles`. Both removed; tables are legacy.
- **Never** hand-enter Dispatch — it uploads from the daily Sales Excel.
- **Never** break the single-file `App.jsx` pattern without an explicit request.
- **Never** retry blindly on error — read it, isolate the stage, fix, test, then log in `LEARNINGS.md`.
- Soft-delete (`deleted: true` + filter on display); IDs via `crypto.randomUUID()`; functional components only.

## Agent skills

### Issue tracker

GitHub Issues on `PB-TMT-ai/jsw-pipes-inventory` — via the GitHub MCP tools in remote sessions (no `gh` CLI there), via `gh` on a local machine. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, each label string equal to its name: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Masters tab

Three masters on one tab (SKU, Plant, Distributor) under the tab key `skuMaster` — the key is what
`accessFor` grants, so it does not move when the label does.

### Domain docs

Single-context — one `CONTEXT.md` and `docs/adr/` at the repo root. Both now exist: `CONTEXT.md` is the glossary (sales plan, order book, stock), `docs/adr/` holds the recorded decisions. See `docs/agents/domain.md`.

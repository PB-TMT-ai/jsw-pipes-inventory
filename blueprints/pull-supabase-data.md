# Blueprint: Pull (dump) all Supabase data

## Goal
Get a complete, raw snapshot of everything in the Supabase backend — every row of
every table, exactly as stored — without touching the running app. Use it for
inspection, backups, debugging, or handing data to someone offline.

## Input
Supabase credentials, resolved in this order (first match wins):
1. `--url=` / `--key=` CLI flags
2. `process.env` — `SUPABASE_URL`|`VITE_SUPABASE_URL` + `SUPABASE_ANON_KEY`|`VITE_SUPABASE_ANON_KEY`
3. `.env.local` — same keys (`VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, see `.env.example`)

Easiest setup: `cp .env.example .env.local` and fill in the project URL + anon key.

## Script
`scripts/pull-data.mjs` — read-only (SELECT only). It pages every table 1000 rows
at a time (PostgREST silently caps a plain select at 1000), and dumps the rows raw
(snake_case, as stored — no shaping).

```bash
node scripts/pull-data.mjs                # dump all tables → .workspace/ + console summary
node scripts/pull-data.mjs --stdout       # also print all raw rows to the console
node scripts/pull-data.mjs --active       # only the six app tables (skip legacy bundles/tubes/orders)
node scripts/pull-data.mjs --tables=coils,skus   # only the named tables
node scripts/pull-data.mjs --ndjson       # also write per-table .ndjson (one row per line)
node scripts/pull-data.mjs --out=dump.json       # override the combined output path
```

Default table set: `coils, baby_coils, productions, dispatches, skus,
purchase_orders` (the six the app uses, per `TABLE_MAP` in `src/lib/db.js`) plus
legacy `bundles, tubes, orders`.

## Output
`.workspace/` is gitignored, so dumps never get committed.
- `.workspace/db-dump.json` — combined `{ table: [...rows] }` (`--out` overrides)
- `.workspace/dump/<table>.json` — one file per table
- `.workspace/dump/<table>.ndjson` — one row per line (only with `--ndjson`)
- Console — a per-table summary (`N rows` / `missing (skipped)` / `error: …`)

## Edge cases
- **Run it LOCALLY.** The Claude Code remote environment's network policy blocks
  `supabase.co` — the agent proxy rejects the CONNECT tunnel with `403`
  (`curl: (56) CONNECT tunnel failed, response 403`), so the script can't reach
  Supabase from a web/remote session. Run it on a machine that can reach Supabase
  (or allowlist `*.supabase.co` in the environment's network policy first).
- **>1000 rows** → handled: the script pages with `.range()` until a short page
  returns. Do **not** "simplify" it to a single `select('*')` — that truncates
  silently at 1000 (`baby_coils` alone can exceed this).
- **Legacy/missing table** → `bundles`, `tubes`, `orders` may not exist in every
  project; those are reported as `missing (skipped)`, not a failure. Use
  `--active` to dump only the six live tables.
- **No `id` column on a table** → paging falls back to unordered with a printed
  warning (order across pages is then not guaranteed deterministic).
- **anon key + RLS** → the anon key only returns rows the table's Row-Level
  Security policy permits. If a table reads as `0 rows` but you expect data,
  check RLS / use a key with the right access.

## Verify
- Offline (no network): `node --check scripts/pull-data.mjs` — confirms it parses.
- Live (local): `node scripts/pull-data.mjs --stdout` — expect a per-table summary,
  full raw rows printed, and `.workspace/db-dump.json` written. Sanity check: `skus`
  is ~232 rows and the pipeline tables match what you see in the app.

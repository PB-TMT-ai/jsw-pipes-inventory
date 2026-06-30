// ═══════════════════════════════════════════════════════════════
// Read-only Supabase dump — pull every row from every table, RAW.
//
// Fetches all rows (snake_case, exactly as stored in Postgres — no shaping) from
// every known table and writes them to `.workspace/` for inspection. Read-only:
// it only ever SELECTs.
//
// IMPORTANT — run this LOCALLY (or in any environment that can reach Supabase).
// The Claude Code remote environment's network policy blocks `supabase.co`
// (the agent proxy rejects the CONNECT tunnel with 403), so this script cannot
// pull live data from there.
//
// USAGE
//   node scripts/pull-data.mjs                 # dump all tables → .workspace/ (+ console summary)
//   node scripts/pull-data.mjs --stdout        # also pretty-print all raw rows to the console
//   node scripts/pull-data.mjs --active        # only the six app tables (skip legacy bundles/tubes/orders)
//   node scripts/pull-data.mjs --tables=coils,skus   # only the named tables
//   node scripts/pull-data.mjs --ndjson        # also write per-table .ndjson (one row per line)
//   node scripts/pull-data.mjs --out=dump.json # override the combined output path
//   node scripts/pull-data.mjs --url=... --key=...   # override creds from the CLI
//
// INPUTS (creds — first match wins)
//   --url= / --key= flags
//   process.env  SUPABASE_URL|VITE_SUPABASE_URL  +  SUPABASE_ANON_KEY|VITE_SUPABASE_ANON_KEY
//   .env.local   same keys (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — see .env.example)
//
// OUTPUT (.workspace/ is gitignored — dumps never get committed)
//   .workspace/db-dump.json        combined { table: [...rows] }   (--out overrides)
//   .workspace/dump/<table>.json   one file per table
//   .workspace/dump/<table>.ndjson one row per line                (only with --ndjson)
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WS = path.join(ROOT, '.workspace')
const DUMP_DIR = path.join(WS, 'dump')

// ── CLI flags ───────────────────────────────────────────────────
const argv = process.argv.slice(2)
const hasFlag = (name) => argv.includes(`--${name}`)
const flagVal = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : null
}
const STDOUT = hasFlag('stdout')
const ACTIVE_ONLY = hasFlag('active')
const NDJSON = hasFlag('ndjson')
const OUT = flagVal('out') ? path.resolve(ROOT, flagVal('out')) : path.join(WS, 'db-dump.json')

// The six tables the app actively reads/writes (TABLE_MAP in src/lib/db.js) plus the
// legacy tables that still exist in Postgres (bundles, tubes, orders). Missing tables
// are skipped with a note, not treated as a failure.
const ACTIVE_TABLES = ['coils', 'baby_coils', 'productions', 'dispatches', 'skus', 'purchase_orders']
const LEGACY_TABLES = ['bundles', 'tubes', 'orders']
const DEFAULT_TABLES = ACTIVE_ONLY ? ACTIVE_TABLES : [...ACTIVE_TABLES, ...LEGACY_TABLES]
const TABLES_ARG = flagVal('tables')
const TABLES = TABLES_ARG ? TABLES_ARG.split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_TABLES

// ── creds (mirrors loadEnv() in scripts/import-excel.mjs) ────────
function loadEnv() {
  const f = path.join(ROOT, '.env.local')
  const env = { ...process.env }
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
  const url = flagVal('url') || env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = flagVal('key') || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  return { url, key }
}

// PostgREST is a relation-missing (42P01) / undefined-table error → table doesn't exist.
const isMissingTable = (error) =>
  error?.code === '42P01' || /does not exist|find the table|not exist/i.test(error?.message || '')

// Page through a table 1000 rows at a time — a plain select('*') is silently capped at
// 1000 by PostgREST, and baby_coils alone can exceed that (same loop as src/lib/db.js).
// Order by `id` for deterministic paging; fall back to unordered if the table has no id.
async function fetchAll(supabase, table) {
  const PAGE = 1000
  const rows = []
  let ordered = true
  for (let from = 0; ; from += PAGE) {
    let q = supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (ordered) q = q.order('id', { ascending: true })
    let { data: page, error } = await q

    // Retry the very first page without ordering if `id` isn't a column on this table.
    if (error && ordered && from === 0 && /column .*id.* does not exist|order/i.test(error.message || '')) {
      console.warn(`   ! ${table}: no usable 'id' column — paging without a stable order`)
      ordered = false
      ;({ data: page, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1))
    }

    if (error) {
      const err = new Error(error.message)
      err.missing = isMissingTable(error)
      throw err
    }

    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

async function main() {
  const { url, key } = loadEnv()
  if (!url || !key) {
    console.error('\nx Missing Supabase creds. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY in')
    console.error('  .env.local (see .env.example), or pass --url=... --key=...\n')
    process.exit(1)
  }

  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  mkdirSync(DUMP_DIR, { recursive: true })
  console.log(`\n▶ Pulling ${TABLES.length} table(s) from ${url}\n`)

  const combined = {}
  const summary = []
  for (const table of TABLES) {
    try {
      const rows = await fetchAll(supabase, table)
      combined[table] = rows
      writeFileSync(path.join(DUMP_DIR, `${table}.json`), JSON.stringify(rows, null, 2))
      if (NDJSON) {
        writeFileSync(path.join(DUMP_DIR, `${table}.ndjson`), rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : ''))
      }
      summary.push({ table, status: `${rows.length} rows` })
    } catch (err) {
      summary.push({ table, status: err.missing ? 'missing (skipped)' : `error: ${err.message}` })
    }
  }

  writeFileSync(OUT, JSON.stringify(combined, null, 2))

  // ── summary ──
  const pad = Math.max(...summary.map((s) => s.table.length))
  console.log('  Table'.padEnd(pad + 4) + 'Result')
  console.log('  ' + '─'.repeat(pad + 2 + 24))
  for (const s of summary) console.log('  ' + s.table.padEnd(pad + 2) + s.status)
  console.log(`\n✓ Combined dump → ${path.relative(ROOT, OUT)}`)
  console.log(`✓ Per-table     → ${path.relative(ROOT, DUMP_DIR)}/<table>.json${NDJSON ? ' (+ .ndjson)' : ''}\n`)

  if (STDOUT) {
    console.log('───────────── RAW ROWS ─────────────')
    console.log(JSON.stringify(combined, null, 2))
  }
}

main().catch((err) => {
  console.error('\nx Pull failed:', err.message)
  console.error('  (If this is a network/CONNECT error, the environment may be blocking supabase.co — run locally.)\n')
  process.exit(1)
})

// ── Daily report: the region split (Invoiced MTD + Pending to serve, per region) ────────────────
//
// Why a script and not SQL: attributing tonnage to a region means resolving the distributor's
// identity (dispatch lines resolve through their ORDER LINK before their own code), then its state
// (most recent line wins), then the state's region (with the six-row seed layered UNDER the stored
// master). All four already exist and are tested in src/lib. Re-deriving them in SQL buys a second
// answer that can disagree with the Sales tab and the PB MTD workbook — and its failure mode is
// invisible: a distributor mis-filed South→West still passes `Σ regions == plant total`.
//
// So this file is deliberately thin. Every number comes from `buildRegionMtdSummary`; all this does
// is fetch rows and print JSON. See docs/adr/0003-daily-report-region-split-computed-in-js-not-sql.md
//
// No npm dependency on purpose — calc.js/reports.js have zero runtime deps and PostgREST is plain
// HTTP, so this runs without `npm install`. src/lib/db.js cannot be reused: it imports React and
// reads `import.meta.env`, both of which throw under Node.
//
// Usage:
//   node scripts/region-mtd.mjs [--date YYYY-MM-DD] [--url URL] [--key ANON_KEY]
//                               [--in FILE.json] [--dump FILE.json] [--pretty]
//
//   --date   report day D (default: today). Drives the month and the `<= D` tonnage cap.
//   --url    Supabase project URL     ) else SUPABASE_URL / VITE_SUPABASE_URL
//   --key    anon key                 ) else SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY, then .env.local
//   --in     read rows from a dumped JSON instead of the network (offline / reproduce a past day)
//   --dump   write the fetched rows to a JSON file for --in
//   --pretty indent the output
//
// stdout: the JSON summary (so the skill can parse it, and `| jq` works)
// stderr: a short human summary
// exit 1: missing creds, failed fetch, or a failed tie-out — never print a split that does not add up.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegionMtdSummary } from '../src/lib/reports.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── args ──
const argv = process.argv.slice(2)
const flag = (name) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : undefined }
const has = (name) => argv.includes(`--${name}`)
const DATE = flag('date') || new Date().toISOString().slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) die(`--date must be YYYY-MM-DD, got "${DATE}"`)

function die(msg) { console.error(`\nx ${msg}\n`); process.exit(1) }

// ── creds: flags, then env, then .env.local (same shape as scripts/import-excel.mjs) ──
function loadEnv() {
  const f = path.join(ROOT, '.env.local')
  const env = { ...process.env }
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
  return {
    url: flag('url') || env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    key: flag('key') || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
  }
}

// ── snake_case → camelCase, TOP LEVEL ONLY. The keys inside dispatches.bundle_entries are already
// camelCase (shipToState, orderLineId, …) — recursing would rename them into something calc.js
// cannot read. ──
const camel = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const toCamel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v]))

// ── PostgREST paging. `order=created_at.asc,id.asc` mirrors db.js:156 and is LOAD-BEARING:
// distributorOrderIndex takes the first non-blank row per link key, so a different row order can
// silently change which distributor a dispatch line is attributed to. ──
async function fetchAll(url, key, table, select) {
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.asc,id.asc`
    const res = await fetch(q, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}` },
    })
    // state_regions does not exist in every database — the master is optional, the seed carries it.
    if (res.status === 404 && table === 'state_regions') return null
    if (!res.ok) die(`fetch ${table} failed: ${res.status} ${res.statusText} — ${(await res.text()).slice(0, 300)}`)
    const page = await res.json()
    rows.push(...page.map(toCamel))
    if (page.length < PAGE) break
  }
  return rows
}

const ORDER_COLS = 'id,deleted,created_at,order_date,order_id,child_order_id,line_id,customer,' +
  'distributor_code,ship_to_state,order_status,confirmed,non_confirmed'
const DISPATCH_COLS = 'id,deleted,created_at,date_of_dispatch,bundle_entries'
const REGION_COLS = 'id,created_at,state,region,deleted'

async function loadRows() {
  const inFile = flag('in')
  if (inFile) {
    const raw = JSON.parse(readFileSync(path.resolve(inFile), 'utf8'))
    return { orders: raw.orders || [], dispatches: raw.dispatches || [], stateRegions: raw.stateRegions ?? null }
  }
  const { url, key } = loadEnv()
  if (!url || !key) {
    die('Missing Supabase credentials. Pass --url/--key, set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY,\n' +
        '  or create .env.local. In an agent session, get them from the Supabase MCP:\n' +
        '  get_project_url + get_publishable_keys (project ref hztblmccvvarmgxmunrp).')
  }
  const base = url.replace(/\/+$/, '')
  const [orders, dispatches, stateRegions] = await Promise.all([
    fetchAll(base, key, 'orders', ORDER_COLS),
    fetchAll(base, key, 'dispatches', DISPATCH_COLS),
    fetchAll(base, key, 'state_regions', REGION_COLS),
  ])
  return { orders, dispatches, stateRegions }
}

// ── main ──
const { orders, dispatches, stateRegions } = await loadRows()

const dumpFile = flag('dump')
if (dumpFile) {
  const p = path.resolve(dumpFile)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ orders, dispatches, stateRegions }, null, 2))
  console.error(`   dumped ${orders.length} orders / ${dispatches.length} dispatches → ${p}`)
}

const summary = buildRegionMtdSummary(orders, dispatches, { date: DATE, stateRegions })
summary.diagnostics.rows = {
  orders: orders.length,
  dispatches: dispatches.length,
  dispatchEntries: dispatches.reduce((t, d) => t + (d.bundleEntries || []).length, 0),
  stateRegions: stateRegions == null ? 'table absent (seed only)' : stateRegions.length,
}

// ── human summary on stderr, JSON on stdout ──
const T = (v) => `${Number(v).toFixed(1)} T`
console.error(`\n  Region split — ${summary.month}, as on ${summary.date}\n`)
for (const g of summary.regions) {
  const n = g.distributors
  console.error(`   ${g.region.padEnd(10)} invoiced ${T(g.invoicedMtd).padStart(10)}   pending ${T(g.pending).padStart(10)}   (${n} distributor${n === 1 ? '' : 's'})`)
}
console.error(`   ${'TOTAL'.padEnd(10)} invoiced ${T(summary.totals.invoicedMtd).padStart(10)}   pending ${T(summary.totals.pending).padStart(10)}`)
if (summary.diagnostics.invoicedAfterD > 0.005) {
  console.error(`\n   ! ${T(summary.diagnostics.invoicedAfterD)} dispatched later in the month than ${summary.date} — excluded from the tonnage, still counted for region assignment.`)
}
if (summary.diagnostics.unmappedStates.length) {
  const top = summary.diagnostics.unmappedStates.slice(0, 5).map(s => `${s.state} (${T(s.tonnage)})`).join(', ')
  console.error(`\n   ! Unmapped states: ${top}`)
}

const { invoicedTiesToPlant, pendingTiesToPlant, maxAbsDiff } = summary.checks
if (!invoicedTiesToPlant || !pendingTiesToPlant) {
  console.error(`\n   region totals: invoiced ${T(summary.totals.invoicedMtd)} / pending ${T(summary.totals.pending)}`)
  console.error(`   plant totals:  invoiced ${T(summary.checks.plantInvoicedMtd)} / pending ${T(summary.checks.plantPending)}`)
  die(`Region split does not tie to the plant totals (max diff ${maxAbsDiff.toFixed(3)} T). Refusing to emit.`)
}
console.error('')

process.stdout.write(JSON.stringify(summary, null, has('pretty') ? 2 : 0) + '\n')

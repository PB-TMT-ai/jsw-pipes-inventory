// ── Daily report: the four cuts the daily messages print ────────────────────────────────────────
//
//   regionSplit    Invoiced MTD + Pending to serve, per region
//   plantSplit     the same two, per plant
//   servableSplit  Confirmed, Unconfirmed, Servable – Unconfirmed and Pending to Dispatch, per region
//   plantPipeline  production slices, FG and RM, per plant
//
// One script, four cuts of the SAME book, fetched once and dated once — so the region lines and the
// plant lines a reader sees under one headline cannot have come from two different reads of the
// database. The stock registers are fetched here for the same reason: a servable figure computed a
// minute later is a figure about a different floor.
//
// Why a script and not SQL: attributing tonnage to a region means resolving the distributor's
// identity (dispatch lines resolve through their ORDER LINK before their own code), then its state
// (most recent line wins), then the state's region (with the eight-row seed layered UNDER the stored
// master). All four already exist and are tested in src/lib. Re-deriving them in SQL buys a second
// answer that can disagree with the Sales tab and the PB MTD workbook — and its failure mode is
// invisible: a distributor mis-filed South→West still passes `Σ regions == plant total`.
//
// The plant split (ticket #128) is here for the same reason and one more: the workbook already
// prints it, from `buildPlantMtdSummary`. The daily message calls that identical function, so a
// figure on a phone and a figure in a spreadsheet cannot disagree — there is only one implementation
// to disagree with. Pending comes from the ORDER row's plant, Invoiced from the DISPATCH ENTRY's,
// both the ERP's own Ship From Code and neither typed.
//
// So this file is deliberately thin. Every number comes from those two builders; all this does is
// fetch rows and print JSON. See docs/adr/0003-daily-report-region-split-computed-in-js-not-sql.md
//
// No npm dependency on purpose — calc.js/reports.js have zero runtime deps and PostgREST is plain
// HTTP, so this runs without `npm install`. src/lib/db.js cannot be reused: it imports React and
// reads `import.meta.env`, both of which throw under Node.
//
// Usage:
//   node scripts/daily-splits.mjs [--date YYYY-MM-DD] [--url URL] [--key ANON_KEY]
//                                 [--in FILE.json] [--dump FILE.json] [--pretty]
//
//   --date   report day D (default: today). Drives the month and the `<= D` tonnage cap.
//   --url    Supabase project URL     ) else SUPABASE_URL / VITE_SUPABASE_URL
//   --key    anon key                 ) else SUPABASE_ANON_KEY / VITE_SUPABASE_ANON_KEY, then .env.local
//   --in     read rows from a dumped JSON instead of the network (offline / reproduce a past day)
//   --dump   write the fetched rows to a JSON file for --in
//   --pretty indent the output
//
// stdout: the JSON summary — { date, month, regionSplit, plantSplit, servableSplit, plantPipeline,
//         rows } (so the skill can parse it, and `| jq` works)
// stderr: a short human summary of all four cuts
// exit 1: missing creds, failed fetch, or a failed tie-out in ANY cut — never print a split that
//         does not add up to the headline printed above it.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRegionMtdSummary, buildPlantMtdSummary, buildServableSummary,
         buildPlantPipelineSummary } from '../src/lib/reports.js'
import { resolveProductionWeights } from '../src/lib/calc.js'

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
    // None of the three masters exists in every database — all optional, the seeds carry them.
    if (res.status === 404 && (table === 'state_regions' || table === 'distributors' || table === 'plants')) return null
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      // A database that predates ticket #118 has no `orders.plant`, and PostgREST says so by name.
      // Better to stop here than to emit a plant split reading 100% Unattributed, which looks like
      // the ERP broke rather than like the column is missing.
      const hint = /plant/.test(body)
        ? '\n  `orders.plant` is missing — apply supabase-setup.sql (ticket #118) before the daily split can group by plant.'
        : ''
      die(`fetch ${table} failed: ${res.status} ${res.statusText} — ${body}${hint}`)
    }
    const page = await res.json()
    rows.push(...page.map(toCamel))
    if (page.length < PAGE) break
  }
  return rows
}

// `plant` (ticket #118) is what the plant split groups by. A database that predates it fails the
// fetch outright rather than quietly reporting every line as Unattributed — see loadRows().
const ORDER_COLS = 'id,deleted,created_at,order_date,order_id,child_order_id,line_id,customer,' +
  'distributor_code,ship_to_state,order_status,confirmed,non_confirmed,plant'
const DISPATCH_COLS = 'id,deleted,created_at,date_of_dispatch,bundle_entries'
const REGION_COLS = 'id,created_at,state,region,deleted'
// The distributor master (ticket #129) carries a per-distributor region OVERRIDE, and an override
// beats the state-derived region. The Sales tab and servable-orders both read it, so the region
// block has to as well or it prints a different answer for the same book — see ADR-0003.
const DISTRIBUTOR_COLS = 'id,created_at,distributor_key,distributor_name,region,deleted'
// The pipeline registers, for the servable split (#…) and the by-plant production/stock block.
// `skus` carries NO `deleted` column in this schema — asking for one 400s the whole fetch.
const PRODUCTION_COLS = 'id,deleted,created_at,date_of_production,sku_code,tube_count,total_weight,coil_allocations,plant'
const SKU_COLS = 'id,created_at,sku_code,description,product_type,height,breadth,nominal_bore,outside_diameter,thickness,length,weight_per_tube,status'
const COIL_COLS = 'id,deleted,created_at,hr_coil_id,actual_weight,plant'
const BABY_COIL_COLS = 'id,deleted,created_at,baby_coil_id,hr_coil_id,weight,consumed,plant'
const PLANT_COLS = 'id,created_at,plant_id,serves,deleted'

async function loadRows() {
  const inFile = flag('in')
  if (inFile) {
    const raw = JSON.parse(readFileSync(path.resolve(inFile), 'utf8'))
    return { orders: raw.orders || [], dispatches: raw.dispatches || [],
      productions: raw.productions || [], skus: raw.skus || [],
      coils: raw.coils || [], babyCoils: raw.babyCoils || [],
      stateRegions: raw.stateRegions ?? null, distributors: raw.distributors ?? null,
      plants: raw.plants ?? null }
  }
  const { url, key } = loadEnv()
  if (!url || !key) {
    die('Missing Supabase credentials. Pass --url/--key, set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY,\n' +
        '  or create .env.local. In an agent session, get them from the Supabase MCP:\n' +
        '  get_project_url + get_publishable_keys (project ref hztblmccvvarmgxmunrp).')
  }
  const base = url.replace(/\/+$/, '')
  const [orders, dispatches, stateRegions, distributors, productions, skus, coils, babyCoils, plants] =
    await Promise.all([
      fetchAll(base, key, 'orders', ORDER_COLS),
      fetchAll(base, key, 'dispatches', DISPATCH_COLS),
      fetchAll(base, key, 'state_regions', REGION_COLS),
      fetchAll(base, key, 'distributors', DISTRIBUTOR_COLS),
      fetchAll(base, key, 'productions', PRODUCTION_COLS),
      fetchAll(base, key, 'skus', SKU_COLS),
      fetchAll(base, key, 'coils', COIL_COLS),
      fetchAll(base, key, 'baby_coils', BABY_COIL_COLS),
      fetchAll(base, key, 'plants', PLANT_COLS),
    ])
  return { orders, dispatches, stateRegions, distributors, productions, skus, coils, babyCoils, plants }
}

// ── main ──
const { orders, dispatches, stateRegions, distributors, productions, skus, coils, babyCoils, plants } =
  await loadRows()

const dumpFile = flag('dump')
if (dumpFile) {
  const p = path.resolve(dumpFile)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ orders, dispatches, stateRegions, distributors,
    productions, skus, coils, babyCoils, plants }, null, 2))
  console.error(`   dumped ${orders.length} orders / ${dispatches.length} dispatches → ${p}`)
}

// Two cuts, one read of the book. Both take the same `orders` / `dispatches` arrays and the same D,
// which is the whole reason they are computed together: two scripts run a minute apart could each be
// right and still print region lines and plant lines that do not describe the same book.
const regionSplit = buildRegionMtdSummary(orders, dispatches, { date: DATE, stateRegions, distributors })
const plantSplit = buildPlantMtdSummary(orders, dispatches, { date: DATE })

// Live weight recompute BEFORE anything reads production tonnage — `tubeCount × weightPerTube`, the
// same resolve the Dashboard and the workbook do, so Produced, FG and Physical Inventory cannot
// disagree. NEVER a density constant: weightPerTube is the only source (CLAUDE.md non-negotiable).
const resolvedProductions = resolveProductionWeights(productions, skus, babyCoils)

// The third and fourth cuts, off the SAME read of the book and the SAME D as the two above. The
// servable split needs the stock registers, which is why they are fetched here rather than in a
// second script running a minute later against a floor that has moved.
const servableSplit = buildServableSummary(orders, dispatches, skus,
  { date: DATE, productions: resolvedProductions, stateRegions, plants, distributors })
const plantPipeline = buildPlantPipelineSummary(resolvedProductions, dispatches, coils, babyCoils,
  { date: DATE })

const summary = {
  date: DATE,
  month: regionSplit.month,
  regionSplit,
  plantSplit,
  servableSplit,
  plantPipeline,
  rows: {
    orders: orders.length,
    dispatches: dispatches.length,
    dispatchEntries: dispatches.reduce((t, d) => t + (d.bundleEntries || []).length, 0),
    productions: productions.length,
    skus: skus.length,
    coils: coils.length,
    babyCoils: babyCoils.length,
    stateRegions: stateRegions == null ? 'table absent (seed only)' : stateRegions.length,
    distributors: distributors == null ? 'table absent (seed only)' : distributors.length,
    plants: plants == null ? 'table absent (seed only)' : plants.length,
  },
}

// ── human summary on stderr, JSON on stdout ──
const T = (v) => `${Number(v).toFixed(1)} T`
const line = (label, invoiced, pending, extra = '') =>
  console.error(`   ${label.padEnd(14)} invoiced ${T(invoiced).padStart(10)}   pending ${T(pending).padStart(10)}   ${extra}`)

console.error(`\n  Region split — ${summary.month}, as on ${summary.date}\n`)
for (const g of regionSplit.regions) {
  const n = g.distributors
  line(g.region, g.invoicedMtd, g.pending, `(${n} distributor${n === 1 ? '' : 's'})`)
}
line('TOTAL', regionSplit.totals.invoicedMtd, regionSplit.totals.pending)

console.error(`\n  Plant split — ${summary.month}, as on ${summary.date}\n`)
for (const p of plantSplit.plants) {
  line(p.name, p.invoicedMtd, p.pending, `(${p.orderLines} order line${p.orderLines === 1 ? '' : 's'})`)
}
line('ALL PLANTS', plantSplit.totals.invoicedMtd, plantSplit.totals.pending)
if (plantSplit.invoicing.suffix) console.error(`\n   ${plantSplit.invoicing.note}`)

if (regionSplit.diagnostics.invoicedAfterD > 0.005) {
  console.error(`\n   ! ${T(regionSplit.diagnostics.invoicedAfterD)} dispatched later in the month than ${summary.date} — excluded from the tonnage, still counted for region assignment.`)
}
if (regionSplit.diagnostics.unmappedStates.length) {
  const top = regionSplit.diagnostics.unmappedStates.slice(0, 5).map(s => `${s.state} (${T(s.tonnage)})`).join(', ')
  console.error(`\n   ! Unmapped states: ${top}`)
}
if (plantSplit.diagnostics.unattributedPending > 0.005 || plantSplit.diagnostics.unattributedInvoiced > 0.005) {
  console.error(`\n   ! Unattributed: ${T(plantSplit.diagnostics.unattributedPending)} pending / ${T(plantSplit.diagnostics.unattributedInvoiced)} invoiced — a Ship From Code nobody has mapped. The tonnage stays in every total; the label is the gap.`)
}

// `?`, never 0, wherever the servable question has no answer — an Unmapped region has no service
// area, so how much of its book the plant can cover is unknown, not nothing.
const Q = (v) => (v == null ? '     ?    ' : T(v).padStart(10))
console.error(`\n  Servable split — as on ${summary.date}\n`)
for (const g of servableSplit.regions) {
  console.error(`   ${g.region.padEnd(14)} confirmed ${T(g.confirmed).padStart(10)}   servable-unconf ${Q(g.servableUnconfirmed)}   pending-to-dispatch ${Q(g.pendingToDispatch)}`)
}
console.error(`   ${'TOTAL'.padEnd(14)} confirmed ${T(servableSplit.totals.confirmed).padStart(10)}   servable-unconf ${T(servableSplit.totals.servableUnconfirmed).padStart(10)}   pending-to-dispatch ${T(servableSplit.totals.pendingToDispatch).padStart(10)}`)
console.error(`   ${'(unconfirmed book '}${T(servableSplit.totals.unconfirmed)}, of which ${T(servableSplit.totals.unconfirmed - servableSplit.totals.servableUnconfirmed)} has no stock behind it)`)
if (servableSplit.diagnostics.unmappedUnconfirmed > 0.005) {
  console.error(`\n   ! ${T(servableSplit.diagnostics.unmappedUnconfirmed)} unconfirmed sits with ${servableSplit.diagnostics.unmappedDistributors} distributor(s) whose state is not mapped to a region — their servable share reads ?, not 0. Map the state on the Sales tab.`)
}

console.error(`\n  Plant pipeline — ${summary.month}, as on ${summary.date}\n`)
for (const p of plantPipeline.plants) {
  console.error(`   ${p.name.padEnd(14)} produced-MTD ${T(p.producedMtd).padStart(10)}   FG ${T(p.fgLeft).padStart(10)}   RM ${T(p.rmTotal).padStart(10)}`)
}
console.error(`   ${'ALL PLANTS'.padEnd(14)} produced-MTD ${T(plantPipeline.totals.producedMtd).padStart(10)}   FG ${T(plantPipeline.totals.fgLeft).padStart(10)}   RM ${T(plantPipeline.totals.rmTotal).padStart(10)}`)
if (plantPipeline.diagnostics.babyNotCounted > 0.005) {
  console.error(`   (RM excludes ${T(plantPipeline.diagnostics.babyNotCounted)} of baby-coil ends under the scrap floor or marked consumed — ADR-0007, same as the Dashboard card)`)
}
if (plantPipeline.diagnostics.unattributedProducedMtd > 0.005 || plantPipeline.diagnostics.unattributedRmTotal > 0.005) {
  console.error(`\n   ! Unattributed pipeline: ${T(plantPipeline.diagnostics.unattributedProducedMtd)} produced MTD / ${T(plantPipeline.diagnostics.unattributedRmTotal)} RM — rows carrying no plant. Fix the plant on those rows; the tonnage stays counted.`)
}

// Neither split may be printed unless it adds up to the headline it sits beneath. A breakdown that
// does not partition its own total is worse than no breakdown — it invites arithmetic that is wrong.
if (!regionSplit.checks.invoicedTiesToPlant || !regionSplit.checks.pendingTiesToPlant) {
  console.error(`\n   region totals: invoiced ${T(regionSplit.totals.invoicedMtd)} / pending ${T(regionSplit.totals.pending)}`)
  console.error(`   plant totals:  invoiced ${T(regionSplit.checks.plantInvoicedMtd)} / pending ${T(regionSplit.checks.plantPending)}`)
  die(`Region split does not tie to the plant totals (max diff ${regionSplit.checks.maxAbsDiff.toFixed(3)} T). Refusing to emit.`)
}
if (!plantSplit.checks.invoicedTiesToAllPlants || !plantSplit.checks.pendingTiesToAllPlants) {
  console.error(`\n   per-plant totals: invoiced ${T(plantSplit.totals.invoicedMtd)} / pending ${T(plantSplit.totals.pending)}`)
  console.error(`   all-plants totals: invoiced ${T(plantSplit.checks.allPlantsInvoicedMtd)} / pending ${T(plantSplit.checks.allPlantsPending)}`)
  die(`Plant split does not tie to the All Plants totals (max diff ${plantSplit.checks.maxAbsDiff.toFixed(3)} T). Refusing to emit.`)
}
if (!servableSplit.checks.confirmedTiesToBook || !servableSplit.checks.unconfirmedTiesToBook) {
  console.error(`\n   servable regions: confirmed ${T(servableSplit.totals.confirmed)} / unconfirmed ${T(servableSplit.totals.unconfirmed)}`)
  console.error(`   ungrouped book:   confirmed ${T(servableSplit.checks.bookConfirmed)} / unconfirmed ${T(servableSplit.checks.bookUnconfirmed)}`)
  die(`Servable split does not tie to the open book (max diff ${servableSplit.checks.maxAbsDiff.toFixed(3)} T). Refusing to emit.`)
}
// Servable is carved OUT of Unconfirmed and can never exceed it. A breach means a stock pool was
// counted more than once — the ADR-0002 fiction — so it stops the run rather than printing tonnage
// the plant does not hold.
if (!servableSplit.checks.servableWithinUnconfirmed) {
  die(`Servable – Unconfirmed (${T(servableSplit.totals.servableUnconfirmed)}) exceeds the Unconfirmed book it comes from (${T(servableSplit.totals.unconfirmed)}) — a pool was counted twice. Refusing to emit.`)
}
if (!plantPipeline.checks.producedTiesToAllPlants || !plantPipeline.checks.fgTiesToAllPlants
    || !plantPipeline.checks.rmTiesToAllPlants) {
  console.error(`\n   per-plant: produced ${T(plantPipeline.totals.producedMtd)} / FG ${T(plantPipeline.totals.fgLeft)} / full coil ${T(plantPipeline.totals.fullCoilLeft)} / baby ${T(plantPipeline.totals.babyLeft)}`)
  console.error(`   ungrouped: produced ${T(plantPipeline.checks.allPlantsProducedMtd)} / FG ${T(plantPipeline.checks.allPlantsFgLeft)} / full coil ${T(plantPipeline.checks.allPlantsFullCoilLeft)} / baby ${T(plantPipeline.checks.allPlantsBabyLeft)}`)
  die(`Plant pipeline does not tie to the company figures (max diff ${plantPipeline.checks.maxAbsDiff.toFixed(3)} T). Refusing to emit.`)
}
console.error('')

process.stdout.write(JSON.stringify(summary, null, has('pretty') ? 2 : 0) + '\n')

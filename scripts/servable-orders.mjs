// ── Servable orders: the part of each distributor's Pending to Dispatch the plant can cover today ──
//
// Answers one question, per distributor and size: "of what this distributor is waiting on, how much
// is sitting on the floor right now?"  Servable = min(pending, plant on-hand).
//
// ON-HAND IS THE SERVICE AREA'S (ticket #129, docs/adr/0006-…). A distributor is only ever offered
// stock made at the plants that ship to its region — Hyderabad and Lepakshi serve South, NPMD and
// Tapi serve West, and the answer is stored on the plant master, not assumed here.
//
// INSIDE an area THE FIGURE IS SHARED, NOT RESERVED (docs/adr/0002-…): nothing is earmarked for
// anybody. Two distributors in the same area each waiting on 40 T of a size the area holds 45 T of
// will BOTH read 40 T servable, though only one can actually be served. So:
//   - every SKU line carries the area's on-hand beside the servable tonnage
//   - a size queued for more than the area holds is flagged as CONTESTED
//   - there is NO plant total of servable tonnage — summing shared stock is a fiction, exactly the
//     total ADR-0002 suppressed on the Distributor x SKU sheet. Per-distributor totals are real.
//
// Every number comes from `salesByDistributor` — the same call (and the same options) the Sales tab
// drill-down and the PB MTD workbook read, so this report cannot disagree with the screen.
//
// No npm dependency on purpose, same as scripts/daily-splits.mjs: calc.js has zero runtime deps and
// PostgREST is plain HTTP. src/lib/db.js can't be reused (it imports React and import.meta.env).
//
// Usage:
//   node scripts/servable-orders.mjs [--date YYYY-MM-DD] [--url URL] [--key ANON_KEY]
//                                    [--in FILE.json] [--agg FILE.json] [--dump FILE.json]
//                                    [--min MT] [--json]
//
//   --date  report day D (default: today). Scopes the "invoiced this month" column only.
//   --agg   build from a PRE-AGGREGATED bundle instead of the network. See loadAggregated() —
//           this exists because the session's egress policy can block the Supabase host, and
//           pulling 6k dispatch rows through an MCP tool is not viable. The bundle carries
//           per-SKU sums, which this expands back into rows so the SAME calc.js runs on them.
//   --min   hide SKU lines below this servable tonnage (default 0.5 T) — keeps the message pasteable.
//   --serves REGION[,REGION]  restrict the report to distributors in these regions — WHOSE message
//           this is, not which stock they may be served from. Since ticket #129 the stock scoping is
//           automatic and unconditional: every distributor reads only the stock of the plants that
//           serve its own region, whether or not this flag is passed. What the flag still does is
//           narrow the LIST, so the South sales team gets a South message; it filters the ORDER BOOK
//           before any stock maths, so `allPending` and the contested flag are computed over the
//           demand shown. Omit for every region — the figures do not change, only the audience.
//   --top   at most this many SKU lines per distributor (default 5). The rest collapse into one
//           "+N more sizes" line that still carries their tonnage, so nothing vanishes from a
//           distributor's total. Use --top 0 for every size.
//   --json  emit the JSON summary on stdout instead of the WhatsApp text.
//
// stdout: the WhatsApp message (or JSON with --json)
// stderr: a short human summary
// exit 1: missing creds or a failed fetch — never print a half-loaded book.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { salesByDistributor, resolveProductionWeights, skuKeyResolver, canonicalSkuKey, skuSizeLabel,
         distributorRegionResolver, distributorOrderIndex, resolveDistributorIdentity,
         plantNamesIn, UNMAPPED_REGION,
         plantMaster, plantsServingRegion, filterByPlants } from '../src/lib/calc.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// ── args ──
const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined }
const has = (n) => argv.includes(`--${n}`)
const DATE = flag('date') || new Date().toISOString().slice(0, 10)
if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) die(`--date must be YYYY-MM-DD, got "${DATE}"`)
const MIN = flag('min') != null ? Number(flag('min')) : 0.5
if (!Number.isFinite(MIN) || MIN < 0) die(`--min must be a non-negative number, got "${flag('min')}"`)
const TOP = flag('top') != null ? Number(flag('top')) : 5
if (!Number.isInteger(TOP) || TOP < 0) die(`--top must be a non-negative integer, got "${flag('top')}"`)
const SERVES = (flag('serves') || '').split(',').map(r => r.trim()).filter(Boolean)

function die(msg) { console.error(`\nx ${msg}\n`); process.exit(1) }

// ── creds: flags, then env, then .env.local (same shape as scripts/daily-splits.mjs) ──
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

// snake_case → camelCase, TOP LEVEL ONLY — bundle_entries' inner keys are already camelCase.
const camel = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const toCamel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v]))

// `order=created_at.asc,id.asc` mirrors db.js and is LOAD-BEARING — distributorOrderIndex takes the
// first non-blank row per link key, so a different row order re-attributes dispatch lines.
async function fetchAll(url, key, table, select, { optional = false } = {}) {
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.asc,id.asc`
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}` } })
    if (res.status === 404 && optional) return null
    if (!res.ok) die(`fetch ${table} failed: ${res.status} ${res.statusText} — ${(await res.text()).slice(0, 300)}`)
    const page = await res.json()
    rows.push(...page.map(toCamel))
    if (page.length < PAGE) break
  }
  return rows
}

const COLS = {
  orders: 'id,deleted,created_at,order_date,order_id,child_order_id,line_id,customer,distributor_code,ship_to_state,order_status,mm_id,description,confirmed,non_confirmed',
  dispatches: 'id,deleted,created_at,date_of_dispatch,bundle_entries',
  productions: 'id,deleted,created_at,date_of_production,sku_code,tube_count,total_weight,coil_allocations,plant',
  skus: 'id,deleted,created_at,sku_code,description,type,height,breadth,outside_diameter,thickness,length,weight_per_tube',
  baby_coils: 'id,created_at,baby_coil_id,hr_coil_id',
  state_regions: 'id,created_at,state,region,deleted',
  plants: 'id,created_at,plant_id,serves,deleted',
  distributors: 'id,created_at,distributor_key,distributor_name,region,deleted',
}

async function loadRows() {
  const aggFile = flag('agg')
  if (aggFile) return loadAggregated(aggFile)
  const inFile = flag('in')
  if (inFile) {
    const raw = JSON.parse(readFileSync(path.resolve(inFile), 'utf8'))
    return { orders: raw.orders || [], dispatches: raw.dispatches || [], productions: raw.productions || [],
      skus: raw.skus || [], babyCoils: raw.babyCoils || [], stateRegions: raw.stateRegions ?? null,
      plants: raw.plants ?? null, distributors: raw.distributors ?? null }
  }
  const { url, key } = loadEnv()
  if (!url || !key) {
    die('Missing Supabase credentials. Pass --url/--key, set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY,\n' +
        '  or create .env.local. In an agent session, get them from the Supabase MCP:\n' +
        '  get_project_url + get_publishable_keys (project ref hztblmccvvarmgxmunrp).')
  }
  const base = url.replace(/\/+$/, '')
  const [orders, dispatches, productions, skus, babyCoils, stateRegions, plants, distributors] = await Promise.all([
    fetchAll(base, key, 'orders', COLS.orders),
    fetchAll(base, key, 'dispatches', COLS.dispatches),
    fetchAll(base, key, 'productions', COLS.productions),
    fetchAll(base, key, 'skus', COLS.skus),
    fetchAll(base, key, 'baby_coils', COLS.baby_coils, { optional: true }),
    fetchAll(base, key, 'state_regions', COLS.state_regions, { optional: true }),
    // Both optional: the two masters (ticket #129) layer over their code seeds, so a database whose
    // DDL has not been run yet reports the shipped service areas rather than refusing to run.
    fetchAll(base, key, 'plants', COLS.plants, { optional: true }),
    fetchAll(base, key, 'distributors', COLS.distributors, { optional: true }),
  ])
  return { orders, dispatches, productions, skus, babyCoils: babyCoils || [], stateRegions, plants, distributors }
}


// ── Pre-aggregated input (--agg) ─────────────────────────────────────────────────────────────────
// Expands a bundle of per-SKU / per-distributor SUMS back into the row shapes calc.js expects, so
// the report path below is byte-identical whether the rows came from PostgREST or from here. What
// is aggregated is only ever a plain Σ — never an identity, a SKU key or a stock rule; every one of
// those still runs in calc.js (the ADR-0003 principle: don't grow a second answer that can disagree).
//
// Bundle shape (all arrays of tuples):
//   skus        [code, productType, height, breadth, nominalBore, thickness, length, isStd, weightPerTube]
//   prod        [code, Σtube_count, Σtotal_weight, plant]   — grouped per SKU *and* plant (#128)
//   disp        [code, Σweight, Σpieces, plant]              — grouped per SKU *and* plant (#129)
//   orders      [{ code, name, lines: [[mmId, Σconfirmed, Σnon_confirmed], …] }]
//   missingDesc [mmId, description]   — only for order codes the SKU master does not carry
//   masters     { stateRegions: [[state, region, deleted]], plants: [[plantId, serves, deleted]],
//                 distributors: [[distributorKey, region, deleted]] } — the three tables the LIVE
//               path fetches. NOT aggregated: they are the masters themselves, copied row for row,
//               because between them they decide which region a distributor is in and which floors
//               serve it — the exact question this report answers. See assertBundleMasters().
//   checks      { pendingMt, producedMt, invoicedMt } — Postgres's OWN totals, computed straight off
//               the base tables rather than off the aggregates. assertBundleTies() re-adds the
//               expanded rows and refuses to run if they disagree, so a bundle that was truncated,
//               half-pasted or built from a stale query cannot quietly produce a smaller report.
//
// Two notes on faithfulness:
//   1. Σ tube_count THEN × weightPerTube == Σ (tube_count × weightPerTube). resolveProductionWeights
//      does the multiply, so collapsing production rows per SKU first is exact, not an approximation.
//   2. `description` on a master row is rebuilt as just "IS <std>". canonicalSkuKey reads ONLY the
//      IS standard off the description when the object carries productType + size + thickness +
//      length — which every master row here does. assertStructuredKeys() below PROVES that held:
//      any row that fell back to description-parsing yields a key with no '|' and fails the run.
function loadAggregated(file) {
  const b = JSON.parse(readFileSync(path.resolve(file), 'utf8'))
  const num = (v) => (v == null || v === '' ? null : Number(v))

  const skus = (b.skus || []).map(([code, type, h, br, nb, thk, len, std, wpt], i) => ({
    id: `sku-${i}`, skuCode: code,
    description: `IS ${std || ''}`.trim(),      // sole job: carry the IS standard into canonicalSkuKey
    productType: type, height: num(h), breadth: num(br), nominalBore: nb || '',
    thickness: num(thk), length: num(len), weightPerTube: num(wpt),
  }))

  // Grouped per SKU AND per plant, so the aggregate can still say whose floor the stock is on
  // (ticket #128). A bundle built before that carries three-element tuples: `plant` reads undefined,
  // the report names no plant rather than naming Unattributed, and says why.
  const productions = (b.prod || []).map(([code, tubeCount, totalWeight, plant], i) => ({
    id: `prod-${i}`, deleted: false, dateOfProduction: '1900-01-01',
    skuCode: code, tubeCount: Number(tubeCount || 0), totalWeight: Number(totalWeight || 0),
    ...(plant == null ? {} : { plant }),
  }))

  // ONE synthetic dispatch holding every SKU's invoiced total. Its date is deliberately outside any
  // real month: producedPool nets it regardless of month (so on-hand is right), while
  // salesByDistributor's month filter drops it before the per-distributor attribution — which the
  // aggregate cannot carry anyway. This report prints no invoiced figure, so nothing is lost; if one
  // is ever added here, it must come from the live path, not from --agg.
  // Grouped per SKU AND per plant for the same reason production is (#129): on-hand is
  // produced − invoiced *within a service area*, and the two halves have to be scoped by the same
  // plants or the subtraction is between different things. A bundle whose tuples carry no plant is
  // rejected outright below rather than reported on.
  const dispatches = [{
    id: 'disp-agg', deleted: false, dateOfDispatch: '1900-01-01',
    bundleEntries: (b.disp || []).map(([code, weight, pieces, plant]) => ({
      skuCode: code, weight: Number(weight || 0), pieces: Number(pieces || 0),
      ...(plant == null ? {} : { plant }),
    })),
  }]

  const descOf = new Map(b.missingDesc || [])
  const orders = []
  ;(b.orders || []).forEach((d, di) => (d.lines || []).forEach(([mmId, cf, nc], li) => {
    orders.push({
      id: `ord-${di}-${li}`, deleted: false, orderDate: '1900-01-01', orderStatus: '',
      distributorCode: d.code || '', customer: d.name || '',
      shipToState: d.state || '',      // drives the region, hence the --serves service-area filter
      mmId, description: descOf.get(mmId) || '',
      confirmed: Number(cf || 0), nonConfirmed: Number(nc || 0),
    })
  }))

  assertBundleTies(b.checks, { orders, productions, dispatches })
  const masters = assertBundleMasters(b.masters)
  return { orders, dispatches, productions, skus, babyCoils: [], ...masters, aggregated: true }
}

// The three masters, copied out of the bundle. They are the one part of `--agg` that is NOT a Σ,
// and they cannot be: `state_regions` decides which region a distributor is in, `plants.serves`
// decides which floors serve that region, and `distributors.region` overrides the first for the
// exceptions the state rule cannot express. Between them they answer this report's whole question —
// who may be offered what — so a bundle that omits them is not missing a detail, it is answering a
// different question with the code seeds.
//
// The failure this exists to stop was real and silent. On 27-Aug-2026 `state_regions` held one
// stored row, KARNATAKA -> East, typed two days earlier over the seed's KARNATAKA -> South. The
// live path saw it; the bundle did not. So the aggregate filed SST STEEL CORPORATION in South and
// offered it 32.4 T of Hyderabad stock, while the same database through daily-splits.mjs put it in
// East, which no plant serves at all. Two reports, one book, opposite answers about who can be
// served — the failure ADR-0006 and ticket #129 exist to prevent, re-entering through the back door.
//
// An ABSENT `masters` key means the bundle predates this and cannot be told apart from three empty
// tables, so it is refused outright — the same call the missing-plant tuples get, and for the same
// reason: reporting from it would state a service area nobody chose. PRESENT-BUT-EMPTY arrays are a
// real answer ("the tables hold nothing"), and the code seeds carry it exactly as the live path's
// optional fetches do.
function assertBundleMasters(m) {
  if (!m || typeof m !== 'object') {
    die('the aggregated bundle carries no `masters` block.\n' +
        '  The state -> region, plant and distributor masters decide which region each distributor is\n' +
        '  in and which floors serve it, so without them this report answers with the code seeds and\n' +
        '  can contradict the Sales tab, the workbook and daily-splits.mjs about who can be served.\n' +
        '  An absent block cannot be told apart from three empty tables, so it is refused rather than\n' +
        '  guessed. Rebuild the bundle with the query in the servable-orders-whatsapp skill, adding:\n' +
        "    masters { stateRegions [state, region, deleted], plants [plantId, serves, deleted],\n" +
        '              distributors [distributorKey, region, deleted] }')
  }
  const rows = (arr, keys) => (arr || []).map((t, i) => ({
    id: `${keys[0]}-${i}`, ...Object.fromEntries(keys.map((k, j) => [k, t[j]])),
  }))
  const stateRegions = rows(m.stateRegions, ['state', 'region', 'deleted'])
  const plants = rows(m.plants, ['plantId', 'serves', 'deleted'])
  const distributors = rows(m.distributors, ['distributorKey', 'region', 'deleted'])
  console.error(`   bundle masters: ${stateRegions.length} state->region, ${plants.length} plant, ` +
    `${distributors.length} distributor row(s) stored over the seeds`)
  return { stateRegions, plants, distributors }
}

// Re-add the expanded rows and compare with the totals Postgres reported off the base tables. A
// mismatch means the bundle and the database are not describing the same book — which is exactly
// the failure a hand-copied payload produces, and exactly the one a plausible-looking report hides.
function assertBundleTies(checks, { orders, productions, dispatches }) {
  if (!checks) {
    console.error('   ! bundle carries no `checks` block — cannot verify it is complete.')
    return
  }
  const near = (a, b) => Math.abs(Number(a || 0) - Number(b || 0)) <= 0.01
  const got = {
    pendingMt: orders.reduce((t, o) => t + o.confirmed + o.nonConfirmed, 0),
    producedMt: productions.reduce((t, p) => t + Number(p.totalWeight || 0), 0),
    invoicedMt: dispatches.reduce((t, d) => t + (d.bundleEntries || []).reduce((u, e) => u + Number(e.weight || 0), 0), 0),
  }
  const bad = Object.keys(got).filter(k => !near(checks[k], got[k]))
  if (bad.length) {
    die(`aggregated bundle does not tie to its own \`checks\` block:\n` +
        bad.map(k => `    ${k}: bundle rows sum to ${got[k].toFixed(4)}, Postgres reported ${Number(checks[k] || 0).toFixed(4)}`).join('\n') +
        `\n  The bundle is incomplete or stale — re-run the query and rebuild it. Refusing to report.`)
  }
  console.error(`   bundle ties: pending ${got.pendingMt.toFixed(1)} T / produced ${got.producedMt.toFixed(1)} T / invoiced ${got.invoicedMt.toFixed(1)} T`)
}

// ── build ──
// `distributorMaster`, not `distributors` — the latter is the per-distributor REPORT rows further
// down, and two different things under one name in one module is a bug waiting to be written.
const { orders, dispatches, productions, skus, babyCoils, stateRegions, plants,
        distributors: distributorMaster, aggregated } = await loadRows()

const dumpFile = flag('dump')
if (dumpFile) {
  const p = path.resolve(dumpFile)
  mkdirSync(path.dirname(p), { recursive: true })
  writeFileSync(p, JSON.stringify({ orders, dispatches, productions, skus, babyCoils, stateRegions }, null, 2))
  console.error(`   dumped → ${p}`)
}

const MONTH = DATE.slice(0, 7)

// ── Service area ────────────────────────────────────────────────────────────────────────────────
// Which distributors THIS PLANT can actually ship to. Resolved with the app's own
// distributorRegionResolver, so a distributor's region here is the one the Sales tab shows: derived
// from its most recent line's ship-to state, one region per distributor even when it ships to
// several states, and layered over the six-row state→region seed.
//
// The filter lands on the ORDER BOOK, before salesByDistributor, so `allPending` and the contested
// flag are computed over exactly the demand the message lists.
//
// Since #129 it is no longer what keeps West orders out of South's stock — salesByDistributor pools
// per service area itself, so a South size can no longer read "contested" because of West demand
// whether or not this flag is passed. The flag chooses the AUDIENCE; the plant master chooses the
// stock. Those were one control by accident and are now two on purpose.
const regionResolver = distributorRegionResolver(orders, dispatches, stateRegions, null, distributorMaster)
const orderIdx = distributorOrderIndex(orders)
const regionOfOrder = (o) => regionResolver(resolveDistributorIdentity(o, orderIdx, false).key).region || 'Unmapped'

let ordersInScope = orders
const outOfScope = new Map()          // distributor name → { region, pending }
if (SERVES.length) {
  const want = new Set(SERVES.map(r => r.toLowerCase()))
  ordersInScope = orders.filter(o => {
    const region = regionOfOrder(o)
    if (want.has(region.toLowerCase())) return true
    // Never let excluded demand disappear silently — an out-of-area distributor is a real order the
    // plant owes, just not one THIS plant fills. Counted and reported, never deleted from the books.
    const name = String(o.customer || '').trim() || '(unnamed)'
    const e = outOfScope.get(name) || { region, pending: 0 }
    e.pending += Number(o.confirmed || 0) + Number(o.nonConfirmed || 0)
    outOfScope.set(name, e)
    return false
  })
  if (!ordersInScope.length) {
    die(`--serves ${SERVES.join(',')} matched no distributor. Regions present: ` +
        `${[...new Set(orders.map(regionOfOrder))].sort().join(', ') || '(none)'}`)
  }
}
const outOfScopeMt = [...outOfScope.values()].reduce((t, e) => t + e.pending, 0)

// An `Unmapped` distributor is a LABELLING GAP, not a region (CONTEXT.md), so --serves can never
// legitimately exclude one: it means that state has no region mapping yet, and the report would be
// quietly dropping a distributor this plant may well serve. Shout about it — the fix is to map the
// state on the Sales tab, never to let the filter swallow the row.
const unmappedDropped = [...outOfScope].filter(([, e]) => e.region === 'Unmapped')
if (unmappedDropped.length) {
  console.error(`\n   ! ${unmappedDropped.length} distributor(s) excluded only because their state is not mapped to a region:`)
  for (const [name, e] of unmappedDropped) console.error(`       ${name} — ${e.pending.toFixed(1)} T pending`)
  console.error(`     Map the state on the Sales tab; until then this report cannot tell whether the plant serves them.`)
}
// Live weight recompute (tubeCount x weightPerTube) before anything reads production tonnage — the
// same resolve the Dashboard and the workbook do, so on-hand here matches Physical Inventory there.
// NEVER a density constant: weightPerTube is the only source (CLAUDE.md non-negotiable).
const resolvedProductions = resolveProductionWeights(productions, skus, babyCoils)

// ── Whose floor this is (tickets #128, #129) ────────────────────────────────────────────────────
// The message advises what can be served from stock ON HAND, and since #129 on-hand is scoped to
// the SERVICE AREA of each distributor — the plants that ship to its region. So the header names
// the plants that serve the regions in this report, and nothing else: naming a floor whose stock no
// distributor here can be served from would be worse than naming none.
//
// Read off the rows rather than passed in: an assumed plant name is exactly the kind of thing that
// stays right until it isn't. `Unattributed` is never called a plant (CONTEXT.md: it is not a fifth
// plant) and belongs to no service area either, so it cannot appear here at all — a production row
// with no plant is a labelling gap on the shop floor, and it is reported as one below.
//
// It says "made at", not "held at", because that is what the rows support: on-hand is produced
// minus invoiced at those plants, and nothing attributes the surviving tonnage back to one floor. A
// plant that made stock and has since shipped every tonne of it is still named.
const master = plantMaster(plants)
const regionsInScope = [...new Set(ordersInScope.map(regionOfOrder))]
const servingPlantIds = new Set()
regionsInScope.forEach(r => plantsServingRegion(r, master).forEach(id => servingPlantIds.add(id)))

const areaLabel = regionsInScope.length ? regionsInScope.join(' + ') : 'this area'

// Off the LIVE-RESOLVED rows, not the stored ones — the tonnage reported below has to be the same
// tonnage salesByDistributor pooled, or the "carries no plant" warning would quote a figure nothing
// on screen holds (CLAUDE.md: weight comes from weightPerTube, never from a frozen total_weight).
const allLivePlantRows = (resolvedProductions || []).filter(p => !p.deleted)
// The stock this report can actually offer: rows made at a plant that serves a region in scope.
const livePlantRows = filterByPlants(allLivePlantRows, servingPlantIds)
const stockPlantIds = new Set(livePlantRows.map(p => String(p.plant ?? '').trim()))

// An aggregated bundle built before #128/#129 carries no `plant` key on its production or dispatch
// tuples. Since #129 that is not a cosmetic gap: with no plant, stock belongs to no service area,
// every distributor reads zero on-hand, and the message would announce that the plant can serve
// nothing at all. Refuse, and say what to rebuild.
const aggProdLacksPlant = Boolean(aggregated) && allLivePlantRows.length > 0 && !allLivePlantRows.some(p => 'plant' in p)
const aggDispLacksPlant = Boolean(aggregated) && (dispatches || []).some(d =>
  (d.bundleEntries || []).length > 0 && !(d.bundleEntries || []).some(e => 'plant' in e))
if (aggProdLacksPlant || aggDispLacksPlant) {
  die(`the aggregated bundle carries no plant on its ${aggProdLacksPlant ? 'production' : 'dispatch'} tuples.\n` +
      `  Since ticket #129 stock is pooled per SERVICE AREA, so a row with no plant belongs to no\n` +
      `  area and reads as zero on-hand everywhere — the report would claim nothing can be served.\n` +
      `  Rebuild the bundle grouping BOTH prod and disp per SKU *and* plant:\n` +
      `    prod [code, \u03a3tube_count, \u03a3total_weight, plant]   disp [code, \u03a3weight, \u03a3pieces, plant]`)
}

// A production row with a BLANK plant is a different fault: the query was fine, the shop floor
// labelling is not. It belongs to no service area and so serves nobody — say so rather than let the
// tonnage quietly disappear from the report.
const unlabelledMt = allLivePlantRows.filter(p => !String(p.plant ?? '').trim())
  .reduce((t, p) => t + Number(p.totalWeight || 0), 0)
if (unlabelledMt > 0.05) {
  console.error(`\n   ! ${unlabelledMt.toFixed(1)} T of production carries no plant, so it belongs to no service area`)
  console.error(`     and is offered to nobody in this report. Fix the plant on those production rows.`)
}

// What the header says about the floor, decided ONCE — the header line, the footer warning and the
// stderr summary all read it, and three sites re-deriving "whose stock is this?" is three chances
// to tell the reader a different story about the same tonnage.
//
// Each plant is named WITH the regions it serves in this report ("Hyderabad (South)"), because the
// two facts are only useful together: a reader who knows the stock was made at Hyderabad still
// cannot tell whether their distributor may have any of it. `Unattributed` cannot appear — it is
// not a plant and serves no region, so `filterByPlants` has already dropped it.
const inScope = (r) => regionsInScope.some(x => x.toLowerCase() === String(r).toLowerCase())
const stockPlants = master.filter(p => stockPlantIds.has(p.id))
  .map(p => ({ name: p.name, regions: (p.serves || []).filter(inScope) }))
const stockPlantNames = plantNamesIn(livePlantRows)
// Regions in this report that no plant with stock serves — every distributor there reads zero, and
// a message that did not say so would look like an outage.
const dryRegions = regionsInScope.filter(r => r !== UNMAPPED_REGION
  && !stockPlants.some(p => p.regions.some(x => x.toLowerCase() === r.toLowerCase())))

// A region in this report served by MORE THAN ONE plant with stock: their floors are summed into
// one on-hand, which inside a service area is the intended behaviour — an order there can be filled
// from either — but a size may still be sitting at the further of the two. Named per region, because
// "combines Hyderabad, NPMD" would be false the moment those two serve different areas, which is
// exactly what they do today.
const sharedAreas = regionsInScope
  .map(r => ({ region: r, names: stockPlants.filter(p => p.regions.some(x => x.toLowerCase() === r.toLowerCase())).map(p => p.name) }))
  .filter(g => g.names.length > 1)

const stockScope = () => {
  if (!allLivePlantRows.length) return { header: '', footer: '' }
  const named = stockPlants.map(p => `${p.name} (${p.regions.join(', ') || 'no region in this report'})`).join(' + ')
  const lines = []
  if (dryRegions.length) {
    lines.push(`_\u26a0\ufe0f No stock for ${dryRegions.join(', ')} \u2014 no plant serving ${dryRegions.length === 1 ? 'it' : 'them'} has produced any. Those distributors show their full pending, which is the true position._`)
  }
  sharedAreas.forEach(g => lines.push(
    `_\u26a0\ufe0f On-hand for ${g.region} combines ${g.names.join(' and ')} \u2014 a size may be sitting at the further plant from the distributor waiting on it._`))
  if (!stockPlants.length) {
    return {
      header: `\ud83c\udfed Stock: no plant serving ${areaLabel} has produced anything`,
      footer: lines.join('\n') || `_\u26a0\ufe0f Nothing on this list can be served from stock: the plants that serve ${areaLabel} hold none. Check the service areas on the Masters tab if that is wrong._`,
    }
  }
  return { header: `\ud83c\udfed Stock made at: ${named}`, footer: lines.join('\n') }
}
const stock = stockScope()
const rows = salesByDistributor(ordersInScope, dispatches, MONTH, skus,
  { productions: resolvedProductions, stateRegions, plants, distributors: distributorMaster })

const EPS = 0.005

// ── Short, phone-readable size label per canonical SKU key: "50x50x2.5 SHS", "50 NBx2.9 CHS".
// The ERP description ("MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.50x6000") is 50 characters
// of boilerplate on a WhatsApp line, so the report names the size, not the catalog string.
// Built off the SAME keyOf the report groups by, so a label can never land on the wrong row. ──
const keyOf = skuKeyResolver(skus)
const shortLabel = (type, sizeLabel, thickness) => {
  const t = Number(thickness)
  const thk = Number.isFinite(t) ? String(Number(t.toFixed(2))) : ''
  return [[sizeLabel, thk].filter(Boolean).join('x'), type].filter(Boolean).join(' ').trim()
}
const labelByKey = new Map()
skus.forEach(s => {
  const k = keyOf(s.skuCode)
  if (!labelByKey.has(k)) labelByKey.set(k, shortLabel(s.productType, skuSizeLabel(s, s.description), s.thickness))
})
// Order lines for codes the master lacks resolve through their OWN description — label them from it.
ordersInScope.forEach(o => {
  const code = String(o.mmId || '').trim(); if (!code) return
  const k = keyOf(code, o.description)
  if (labelByKey.get(k)) return
  const d = String(o.description || '')
  const type = d.match(/\b(SHS|RHS|CHS|ERW)\b/i)?.[1]?.toUpperCase() || ''
  const nums = (d.split(/black/i)[1] || d).match(/\d+(?:\.\d+)?/g) || []
  labelByKey.set(k, shortLabel(type, skuSizeLabel(null, d), nums.length >= 2 ? nums[nums.length - 2] : '') || d.trim() || code)
})
const skuLabel = (s) => labelByKey.get(s.id) || (s.description || '').trim() || s.skuCode || s.id

// The aggregated bundle rebuilds each master row's description as just "IS <std>" (see
// loadAggregated). That is only sound while canonicalSkuKey takes its type/size/thickness/length
// from the OBJECT — which it signals by returning a structured key containing '|'. A key without
// one means it fell back to parsing that stub description, and the SKU identity is then wrong.
// Fail loudly rather than print a report built on silently mismatched sizes.
if (aggregated) {
  const unstructured = skus.filter(s => !keyOf(s.skuCode).includes('|')).map(s => s.skuCode)
  if (unstructured.length) {
    die(`${unstructured.length} SKU master row(s) did not yield a structured canonical key — the\n` +
        `  aggregated bundle lacks the fields canonicalSkuKey needs, so sizes cannot be merged safely.\n` +
        `  First few: ${unstructured.slice(0, 5).join(', ')}`)
  }
}

const distributors = rows.map(r => {
  const lines = (r.skuRows || [])
    .filter(s => s.pending > EPS && (s.onhand ?? 0) > EPS)
    .map(s => ({
      sku: skuLabel(s), skuKey: s.id,
      pending: s.pending, confirmed: s.confirmed, nonConfirmed: s.nonConfirmed,
      onhand: s.onhand, allPending: s.allPending, freeStock: s.freeStock,
      // What the floor can cover of THIS distributor's pending. Capped at pending — stock beyond
      // what they asked for is not theirs to be served.
      servable: Math.min(s.pending, s.onhand),
      shortBy: s.shortBy,
      // The size is queued for more than exists across every distributor. This row's servable
      // tonnage is real but CONTESTED — it cannot be promised.
      contested: s.allPending > s.onhand + EPS,
    }))
    .sort((a, b) => b.servable - a.servable)
  // Two cuts, in this order: drop the sizes too small to be worth a line, then keep only the
  // biggest TOP of what is left. Everything cut is still counted in `servable` and reported as a
  // "+N more sizes" line carrying its tonnage — the distributor's total is never quietly trimmed.
  const big = lines.filter(l => l.servable >= MIN)
  // A distributor that only has sub-MIN sizes still names its largest one — a block whose only
  // content is "+1 more size" tells the reader nothing they can act on.
  const pick = big.length ? big : lines.slice(0, 1)
  const shown = TOP > 0 ? pick.slice(0, TOP) : pick
  const rest = lines.filter(l => !shown.includes(l))
  const servable = lines.reduce((t, l) => t + l.servable, 0)
  return {
    customer: r.customer, key: r.id, region: r.region, state: r.state,
    pending: r.pending, servable,
    // Pending that has NO stock behind it at all - the pending on sizes with nothing on the floor,
    // plus the uncovered part of the sizes that do. r.pending - servable, by construction.
    notServable: r.pending - servable,
    lines, shown, hiddenLines: rest.length,
    hiddenServable: rest.reduce((t, l) => t + l.servable, 0),
    contestedServable: lines.filter(l => l.contested).reduce((t, l) => t + l.servable, 0),
  }
}).filter(d => d.servable > EPS).sort((a, b) => b.servable - a.servable)

const T = (v) => `${Number(v).toFixed(1)} T`
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const prettyDate = (d) => `${d.slice(8, 10)}-${MONTHS[Number(d.slice(5, 7)) - 1]}-${d.slice(0, 4)}`

// Distributors whose whole pending book has nothing on the floor behind it. Naming the COUNT (not
// the names) keeps the message short while stopping the report from reading as "everyone is covered".
const nothingServable = rows.filter(r => r.pending > EPS && !distributors.some(d => d.key === r.id)).length

const totals = {
  distributors: distributors.length,
  nothingServable,
  servesRegions: SERVES,
  stockPlants: stockPlantNames,
  stockPlantAreas: stockPlants,
  dryRegions,
  outOfScopeDistributors: outOfScope.size,
  outOfScopeMt,
  // Pending across the whole book, servable or not — this one IS additive (each distributor's own
  // orders are theirs alone).
  pendingAll: rows.reduce((t, r) => t + r.pending, 0),
  // DELIBERATELY ABSENT: a plant "servable" total. Shared stock counted once per distributor would
  // exceed what the plant holds — the fiction ADR-0002 suppressed. Do not add one.
  anyContested: distributors.some(d => d.contestedServable > EPS),
}

const summary = { date: DATE, month: MONTH, minMt: MIN, topPerDistributor: TOP, distributors, totals,
  outOfScope: [...outOfScope].map(([customer, e]) => ({ customer, region: e.region, pending: e.pending })),
  diagnostics: { orders: orders.length, dispatches: dispatches.length, productions: productions.length,
    skus: skus.length, stateRegions: stateRegions == null ? 'table absent (seed only)' : stateRegions.length,
    plants: plants == null ? 'table absent (seed only)' : plants.length,
    distributorMaster: distributorMaster == null ? 'table absent (seed only)' : distributorMaster.length,
    servingPlants: [...servingPlantIds] } }

// ── WhatsApp text ──
function whatsapp() {
  const L = []
  L.push('*JSW Pipes & Tubes — Orders We Can Serve Today*')
  L.push(`📅 ${prettyDate(DATE)}`)
  // Whose stock, before where it can go: the reader has to know which floor is being counted before
  // a service area means anything.
  if (stock.header) L.push(stock.header)
  if (SERVES.length) L.push(`📍 ${SERVES.join(' + ')} only — this plant's service area`)
  L.push('')
  L.push(`_Pending orders with finished stock on the floor, distributor-wise._`)
  L.push('')
  for (const d of distributors) {
    L.push(`*${d.customer}*${d.region && d.region !== 'Unmapped' ? ` _(${d.region})_` : ''}`)
    L.push(`✅ Can serve: *${T(d.servable)}* of ${T(d.pending)} pending`)
    for (const l of d.shown) {
      L.push(`   • ${l.sku} — ${T(l.servable)}${l.contested ? ' ⚠️' : ''}`)
    }
    if (d.hiddenLines > 0) L.push(`   • +${d.hiddenLines} more size${d.hiddenLines === 1 ? '' : 's'} — ${T(d.hiddenServable)}`)
    L.push('')
  }
  if (!distributors.length) L.push('_No pending order has stock against it today._', '')
  L.push(`*Distributors we can serve: ${distributors.length}*`)
  if (nothingServable > 0) L.push(`_${nothingServable} more ${nothingServable === 1 ? 'has' : 'have'} pending orders with no stock against any of their sizes._`)
  // The out-of-area book is stated, never dropped in silence: it is real tonnage the plant owes,
  // just not from this floor, and a reader who cannot see it will think the book is smaller.
  if (outOfScope.size > 0) {
    L.push(`_${T(outOfScopeMt)} pending sits with ${outOfScope.size} distributor${outOfScope.size === 1 ? '' : 's'} outside ${SERVES.join(' + ')} — not served from this plant, not counted above._`)
  }
  if (unmappedDropped.length) {
    const mt = unmappedDropped.reduce((t, [, e]) => t + e.pending, 0)
    L.push(`_⚠️ ${unmappedDropped.length} distributor${unmappedDropped.length === 1 ? '' : 's'} (${T(mt)}) left out only because their state is not mapped to a region — map it on the Sales tab._`)
  }
  L.push('')
  L.push('_Each distributor is offered only the stock of the plants that serve its region. Inside a region that stock is reserved to nobody — the same tonnage can appear against two distributors, so these lines do not add up to a plant total._')
  // More than one floor counted as one is a real limit of this report — named where the figures are,
  // not in a doc nobody has open at 8am.
  if (stock.footer) L.push(stock.footer)
  if (totals.anyContested) L.push('_⚠️ = that size is ordered for more than the plant holds; first-come, first-served._')
  L.push(`_Live data · generated ${prettyDate(DATE)}_`)
  return L.join('\n')
}

// ── output ──
console.error(`\n  Servable orders — as on ${DATE}\n`)
for (const d of distributors.slice(0, 15)) {
  console.error(`   ${d.customer.slice(0, 30).padEnd(30)} servable ${T(d.servable).padStart(10)}   of pending ${T(d.pending).padStart(10)}   (${d.lines.length} size${d.lines.length === 1 ? '' : 's'})`)
}
if (distributors.length > 15) console.error(`   … and ${distributors.length - 15} more`)
console.error(`\n   ${distributors.length} distributor(s) with servable stock; in-scope book pending ${T(totals.pendingAll)}`)
console.error(`   stock on hand: ${stock.header.replace('🏭 Stock', '').replace(/^ ?(made at)?:? ?/, '') || 'no production rows'}`)
if (outOfScope.size) {
  console.error(`   excluded by --serves ${SERVES.join(',')}: ${outOfScope.size} distributor(s), ${T(outOfScopeMt)} pending`)
  for (const [name, e] of outOfScope) console.error(`      ${name.slice(0, 42).padEnd(42)} ${e.region.padEnd(9)} ${T(e.pending).padStart(9)}`)
}
console.error(`   (no plant servable total by design — see ADR-0002)\n`)

process.stdout.write((has('json') ? JSON.stringify(summary, null, 2) : whatsapp()) + '\n')

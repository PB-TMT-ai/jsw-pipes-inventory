// ── Servable orders: the part of each distributor's Pending to Dispatch the plant can cover today ──
//
// Answers one question, per distributor and size: "of what this distributor is waiting on, how much
// is sitting on the floor right now?"  Servable = min(pending, plant on-hand).
//
// THE FIGURE IS SHARED, NOT RESERVED (docs/adr/0002-…). On-hand is the WHOLE PLANT's stock for a
// size; nothing is earmarked for anybody. Two distributors each waiting on 40 T of a size the plant
// holds 45 T of will BOTH read 40 T servable, though only one can actually be served. So:
//   - every SKU line carries the plant on-hand beside the servable tonnage
//   - a size queued for more than the plant holds is flagged as CONTESTED
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
//   --serves REGION[,REGION]  restrict the report to distributors in these regions, because THIS
//           PLANT CANNOT SHIP EVERYWHERE. Service area is a business rule, not a column — plants are
//           attributed (ticket #118) but nothing records where each one ships — so it has to be
//           passed in. It filters the ORDER BOOK before any stock maths, so
//           `allPending`, Free Stock and the contested flag all recompute over servable demand
//           only; a size queued 40 T by a distributor this plant cannot ship is not competing for
//           the stock and must not be shown as if it were. Omit for every region (plant-wide).
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
         plantNamesIn, UNATTRIBUTED_PLANT } from '../src/lib/calc.js'

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
}

async function loadRows() {
  const aggFile = flag('agg')
  if (aggFile) return loadAggregated(aggFile)
  const inFile = flag('in')
  if (inFile) {
    const raw = JSON.parse(readFileSync(path.resolve(inFile), 'utf8'))
    return { orders: raw.orders || [], dispatches: raw.dispatches || [], productions: raw.productions || [],
      skus: raw.skus || [], babyCoils: raw.babyCoils || [], stateRegions: raw.stateRegions ?? null }
  }
  const { url, key } = loadEnv()
  if (!url || !key) {
    die('Missing Supabase credentials. Pass --url/--key, set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY,\n' +
        '  or create .env.local. In an agent session, get them from the Supabase MCP:\n' +
        '  get_project_url + get_publishable_keys (project ref hztblmccvvarmgxmunrp).')
  }
  const base = url.replace(/\/+$/, '')
  const [orders, dispatches, productions, skus, babyCoils, stateRegions] = await Promise.all([
    fetchAll(base, key, 'orders', COLS.orders),
    fetchAll(base, key, 'dispatches', COLS.dispatches),
    fetchAll(base, key, 'productions', COLS.productions),
    fetchAll(base, key, 'skus', COLS.skus),
    fetchAll(base, key, 'baby_coils', COLS.baby_coils, { optional: true }),
    fetchAll(base, key, 'state_regions', COLS.state_regions, { optional: true }),
  ])
  return { orders, dispatches, productions, skus, babyCoils: babyCoils || [], stateRegions }
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
//   disp        [code, Σweight, Σpieces]
//   orders      [{ code, name, lines: [[mmId, Σconfirmed, Σnon_confirmed], …] }]
//   missingDesc [mmId, description]   — only for order codes the SKU master does not carry
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
  const dispatches = [{
    id: 'disp-agg', deleted: false, dateOfDispatch: '1900-01-01',
    bundleEntries: (b.disp || []).map(([code, weight, pieces]) => ({
      skuCode: code, weight: Number(weight || 0), pieces: Number(pieces || 0),
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
  return { orders, dispatches, productions, skus, babyCoils: [], stateRegions: null, aggregated: true }
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
const { orders, dispatches, productions, skus, babyCoils, stateRegions, aggregated } = await loadRows()

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
// The filter lands on the ORDER BOOK, before salesByDistributor — deliberately, and this is the
// whole point. salesByDistributor derives `allPending`, Free Stock and (here) the contested flag by
// summing across every distributor it is given. Feeding it the national book and filtering the
// OUTPUT would leave a South size reading "contested" because of West orders this plant cannot
// ship — demand that is not competing for this stock at all. Filtering the input makes those three
// figures mean "against the demand this plant can actually serve".
const regionResolver = distributorRegionResolver(orders, dispatches, stateRegions)
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

// ── Whose floor this is (ticket #128) ───────────────────────────────────────────────────────────
// The message advises what can be served from stock ON HAND, and on-hand is produced − invoiced —
// so the plants that produced it are the plants whose stock this is. Read off the rows rather than
// passed in: an assumed plant name is exactly the kind of thing that stays right until it isn't.
//
// Until #118 there was one unnamed "the plant" and the message could leave it unnamed without
// lying. With four plants attributed and two of them manufacturing, an unnamed floor implies a
// single plant that is no longer a given — so the header names it, and names BOTH if the stock
// spans two. It does not scope the figures to one plant: what `--serves` means for NPMD is an open
// business question (#117), and answering it by filtering here would be inventing the answer.
const livePlantRows = (productions || []).filter(p => !p.deleted)
const stockPlants = plantNamesIn(livePlantRows)
const namedPlants = stockPlants.filter(n => n !== UNATTRIBUTED_PLANT)

// What this report says about the floor, decided ONCE and handed over as three ready-made strings:
// the WhatsApp header, the WhatsApp footer warning, and the plain line stderr prints. Three sites
// re-deriving "how many plants is this, and what do we call them?" is three chances to tell the
// reader a different story about the same stock — and deriving the plain one by stripping the emoji
// off the header is the same mistake wearing a disguise: it would keep working until the wording
// changed, then quietly print rubbish.
//
// Three rules, each learned somewhere in this repo:
//   • `Unattributed` is never called a plant (CONTEXT.md: it is not a fifth plant). A production row
//     with no plant is a labelling gap on the shop floor, and it says so.
//   • A stale aggregated bundle is a DIFFERENT fact from an unlabelled row. One predates #128 and
//     has no `plant` key at all; the other carries an empty one. Reporting the second as the first
//     sends an operator off to rebuild a query that was fine.
//   • It says "made at", not "held at". On-hand is produced minus invoiced across ALL plants for a
//     size, and nothing attributes the surviving tonnage back to a floor — a plant that made stock
//     and has since shipped every tonne is still named. Naming who made what this report counts is
//     true; claiming to know where each tonne now sits is not, and per-plant stock is out of scope
//     by #117.
const aggBundleLacksPlant = Boolean(aggregated) && livePlantRows.length > 0 && !livePlantRows.some(p => 'plant' in p)
const say = (plain, footer = '') => ({ header: `🏭 ${plain}`, plain, footer })
const stockScope = () => {
  if (!livePlantRows.length) return { header: '', plain: 'no production rows', footer: '' }
  if (aggBundleLacksPlant) return say('Stock: plant not identified — aggregated bundle carries no plant')
  if (!namedPlants.length) return say('Stock: made at a plant nobody has labelled')
  if (stockPlants.length === 1) return say(`Stock made at: ${stockPlants[0]}`)
  // Two or more: the floors are summed into one on-hand, which is a real limit of this report and
  // the reader is the one who can act on it. State it where the figures are.
  return say(
    `Stock made at: ${stockPlants.join(' + ')} — combined, not split by plant`,
    `_⚠️ On-hand combines ${stockPlants.join(', ')} — a size may be sitting at a different plant from the distributor waiting on it._`,
  )
}
const stock = stockScope()
const rows = salesByDistributor(ordersInScope, dispatches, MONTH, skus, { productions: resolvedProductions, stateRegions })

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
  stockPlants,
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
    skus: skus.length, stateRegions: stateRegions == null ? 'table absent (seed only)' : stateRegions.length } }

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
  L.push('_Stock is the plant\'s and is reserved to nobody — the same tonnage can appear against two distributors, so these lines do not add up to a plant total._')
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
console.error(`   ${stock.plain}`)
if (outOfScope.size) {
  console.error(`   excluded by --serves ${SERVES.join(',')}: ${outOfScope.size} distributor(s), ${T(outOfScopeMt)} pending`)
  for (const [name, e] of outOfScope) console.error(`      ${name.slice(0, 42).padEnd(42)} ${e.region.padEnd(9)} ${T(e.pending).padStart(9)}`)
}
console.error(`   (no plant servable total by design — see ADR-0002)\n`)

process.stdout.write((has('json') ? JSON.stringify(summary, null, 2) : whatsapp()) + '\n')

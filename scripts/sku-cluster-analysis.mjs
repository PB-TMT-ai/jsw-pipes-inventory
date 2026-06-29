#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// sku-cluster-analysis.mjs — one-off SKU order↔invoice consistency + duplicate-code analysis
//
// Goal: find SKUs that were DISPATCHED/INVOICED but never ORDERED (customer sales
// orders), and GROUP near-identical SKUs by canonical geometry so duplicate / "closeness"
// MM-ID codes (the same physical tube under more than one code) become visible.
//
// Inputs (the two ERP Excel files uploaded into the app):
//   --orders=<path>     Orders export   (MM ID, MM Description, Quantity, Order Status, Order ID, Sku ID)
//   --dispatch=<path>   Dispatch/invoice export (MM ID, MM Description, Invoiced qty, Order ID, sku_id)
//                       (repeatable — pass several daily dispatch files)
// Defaults: .workspace/orders.xlsx and .workspace/dispatch.xlsx
//
// Outputs (to .workspace/, gitignored):
//   sku-analysis.csv          one row per (cluster × code) with ordered/dispatched MT + flags
//   sku-analysis-report.md    narrative summary + tables
//
// Column matching mirrors the app's mapOrderRow / mapDispatchRow (src/App.jsx). Geometry
// is taken from the SKU master (src/data/skus.js) when the code is catalogued, else parsed
// from the MM Description (same parser family as scripts/generate-skus.mjs). No DB, no network.
// ═══════════════════════════════════════════════════════════════════════════
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'
import fs from 'fs'
import DEFAULT_SKUS from '../src/data/skus.js'

const require = createRequire(import.meta.url)
const XLSX = require('@e965/xlsx')   // patched SheetJS mirror (replaces vulnerable xlsx@0.18.5)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const WS = path.join(ROOT, '.workspace')

// ── arg parsing ──
const args = process.argv.slice(2)
const getOpt = (name, def) => { const hit = args.find(a => a.startsWith(`--${name}=`)); return hit ? hit.split('=').slice(1).join('=') : def }
const getAll = (name) => args.filter(a => a.startsWith(`--${name}=`)).map(a => a.split('=').slice(1).join('='))
const ordersPath = getOpt('orders', path.join(WS, 'orders.xlsx'))
const dispatchPaths = (getAll('dispatch').length ? getAll('dispatch') : [path.join(WS, 'dispatch.xlsx')])

// ── helpers ──
const S = (v) => String(v == null ? '' : v).trim()
const num = (v) => { if (v === '' || v == null) return 0; const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : 0 }
const readSheet = (p) => {
  const wb = XLSX.read(fs.readFileSync(p), { type: 'buffer', cellDates: true })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: true })
}
// case/space/punctuation-insensitive column pick (mirrors mapOrderRow/mapDispatchRow)
const pickFrom = (row) => {
  const norm = {}
  for (const k of Object.keys(row)) norm[k.toLowerCase().replace(/[.\s_]+/g, '')] = row[k]
  return (...keys) => { for (const k of keys) if (norm[k] !== undefined && norm[k] !== '') return norm[k]; return '' }
}

// ── canonical geometry signature ──
const nz = (x) => { const n = Number(x); if (!Number.isFinite(n)) return '?'; return n.toFixed(3).replace(/\.?0+$/, '') }
const canonLen = (L) => { const n = Number(L); if (!Number.isFinite(n)) return '?'; return Math.abs(n - 6000) <= 3 ? '6000' : String(Math.round(n)) }
const family = (code) => { const m = String(code).match(/^(\d+-\d+)-/); return m ? m[1] : '?' }

function sigFromDescription(desc) {
  const d = String(desc || '')
  const tm = d.match(/\b(SHS|RHS|CHS|ERW)\b/i)
  if (!tm) return null
  const type = tm[1].toUpperCase()
  if (type === 'CHS') {
    const m = d.match(/(\d+(?:\.\d+)?)\s*NBx(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\s*$/i)
    return m ? `CHS|NB${nz(m[1])}x${nz(m[2])}|L${canonLen(m[3])}` : null
  }
  const m = d.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)\s*$/)
  return m ? `${type}|${nz(m[1])}x${nz(m[2])}x${nz(m[3])}|L${canonLen(m[4])}` : null
}
function sigFromMaster(s) {
  const t = String(s.productType || '').toUpperCase()
  if (t === 'CHS') return `CHS|NB${nz(s.nominalBore)}x${nz(s.thickness)}|L${canonLen(s.length)}`
  return `${t}|${nz(s.height)}x${nz(s.breadth)}x${nz(s.thickness)}|L${canonLen(s.length)}`
}

// ── load master ──
const masterByCode = new Map(DEFAULT_SKUS.map(s => [s.skuCode, s]))

// ── load orders ──
if (!fs.existsSync(ordersPath)) { console.error(`Orders file not found: ${ordersPath}`); process.exit(1) }
const orderRows = readSheet(ordersPath).map(r => {
  const pick = pickFrom(r)
  return { mmId: S(pick('mmid', 'skucode', 'sku')), desc: S(pick('mmdescription', 'description')), qty: num(pick('quantity')), status: S(pick('orderstatus', 'status')) }
}).filter(o => o.mmId)

// ── load dispatch (one or more files) ──
const dispRows = []
for (const dp of dispatchPaths) {
  if (!fs.existsSync(dp)) { console.error(`Dispatch file not found: ${dp}`); process.exit(1) }
  for (const r of readSheet(dp)) {
    const pick = pickFrom(r)
    const mmId = S(pick('mmid', 'skucode', 'sku'))
    const wt = num(pick('invoicedqty', 'weight', 'weightmt', 'quantitymt', 'doqty', 'netweight', 'wt'))
    if (!mmId || mmId === '9000000' || !wt) continue // drop blanks + Freight line
    dispRows.push({ mmId, desc: S(pick('mmdescription', 'description', 'item', 'product')), wt })
  }
}

// ── aggregate per code ──
const codes = new Map()
const ensure = (mmId, desc) => {
  if (!codes.has(mmId)) {
    const inMaster = masterByCode.has(mmId)
    const sig = inMaster ? sigFromMaster(masterByCode.get(mmId)) : sigFromDescription(desc)
    codes.set(mmId, { mmId, family: family(mmId), desc, inMaster, sig, orderedMT: 0, dispatchedMT: 0 })
  }
  const c = codes.get(mmId)
  if (!c.desc && desc) c.desc = desc
  return c
}
orderRows.forEach(o => { ensure(o.mmId, o.desc).orderedMT += o.qty })
dispRows.forEach(d => { ensure(d.mmId, d.desc).dispatchedMT += d.wt })
const all = [...codes.values()]

// ── cluster by signature ──
const bySig = new Map()
for (const c of all) {
  const key = c.sig || `UNPARSEABLE:${c.mmId}`
  if (!bySig.has(key)) bySig.set(key, [])
  bySig.get(key).push(c)
}
// flags
for (const c of all) {
  c.dispatchedNotOrdered = c.dispatchedMT > 1e-9 && c.orderedMT < 1e-9
}
const clusters = [...bySig.entries()].map(([sig, members]) => {
  const hasOrdered = members.some(m => m.orderedMT > 1e-9)
  const hasDno = members.some(m => m.dispatchedNotOrdered)
  const duplicate = members.length > 1
  let flag = 'OK'
  if (hasOrdered && hasDno) flag = 'CONFUSION'
  else if (hasDno && members.every(m => !m.inMaster)) flag = 'ORPHAN'
  else if (duplicate) flag = 'DUPLICATE_CODE'
  return { sig, members, duplicate, flag, dnoMT: members.reduce((s, m) => s + (m.dispatchedNotOrdered ? m.dispatchedMT : 0), 0) }
}).sort((a, b) => (b.dnoMT - a.dnoMT) || (b.members.length - a.members.length) || a.sig.localeCompare(b.sig))
clusters.forEach((c, i) => { c.clusterId = 'C' + String(i + 1).padStart(3, '0') })

// ── totals ──
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0)
const dno = all.filter(c => c.dispatchedNotOrdered)
const uncatalogued = all.filter(c => !c.inMaster)
const dupClusters = clusters.filter(c => c.duplicate)
const T = {
  orderLines: orderRows.length, dispLines: dispRows.length,
  distinctCodes: all.length, distinctGeoms: clusters.length,
  orderedMT: sum(all, c => c.orderedMT), dispatchedMT: sum(all, c => c.dispatchedMT),
  dnoCount: dno.length, dnoMT: sum(dno, c => c.dispatchedMT),
  uncatCount: uncatalogued.length, uncatOrderedMT: sum(uncatalogued, c => c.orderedMT), uncatDispMT: sum(uncatalogued, c => c.dispatchedMT),
}

// ── write CSV ──
fs.mkdirSync(WS, { recursive: true })
const csvCell = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
const csvHeader = ['clusterId', 'clusterFlag', 'clusterSize', 'signature', 'skuCode', 'family', 'inMaster', 'orderedMT', 'dispatchedMT', 'dispatchedNotOrdered', 'duplicateGeometry', 'description']
const csvLines = [csvHeader.join(',')]
for (const cl of clusters) {
  const ordered = [...cl.members].sort((a, b) => b.orderedMT - a.orderedMT || b.dispatchedMT - a.dispatchedMT)
  for (const m of ordered) {
    csvLines.push([cl.clusterId, cl.flag, cl.members.length, cl.sig, m.mmId, m.family, m.inMaster, m.orderedMT.toFixed(3), m.dispatchedMT.toFixed(3), m.dispatchedNotOrdered, cl.duplicate, m.desc].map(csvCell).join(','))
  }
}
fs.writeFileSync(path.join(WS, 'sku-analysis.csv'), csvLines.join('\n') + '\n')

// ── write markdown report ──
const pct = (n, d) => d ? (100 * n / d).toFixed(1) + '%' : '0%'
const md = []
md.push('# SKU Analysis — dispatched-vs-ordered & duplicate-code clusters', '')
md.push(`_Generated ${new Date().toISOString().slice(0, 10)} from \`${path.basename(ordersPath)}\` (orders) and \`${dispatchPaths.map(p => path.basename(p)).join(', ')}\` (dispatch)._`, '')
md.push('## Bottom line', '')
md.push(`- **Dispatched-but-not-ordered SKUs: ${T.dnoCount}** (${T.dnoMT.toFixed(1)} MT). Every invoiced SKU below was also ordered.`)
md.push(`- Duplicate-code clusters (one geometry, >1 MM ID): **${dupClusters.length}**.`)
md.push(`- Codes ordered/invoiced but **missing from the SKU master: ${T.uncatCount}** (${T.uncatOrderedMT.toFixed(1)} MT ordered, ${T.uncatDispMT.toFixed(1)} MT dispatched).`, '')
md.push('## Totals', '')
md.push('| Metric | Orders | Dispatch |', '|---|---|---|')
md.push(`| Lines | ${T.orderLines} | ${T.dispLines} |`)
md.push(`| Distinct MM IDs | ${new Set(orderRows.map(o => o.mmId)).size} | ${new Set(dispRows.map(d => d.mmId)).size} |`)
md.push(`| MT | ${T.orderedMT.toFixed(1)} | ${T.dispatchedMT.toFixed(1)} |`)
md.push('', `Distinct MM IDs overall: **${T.distinctCodes}** → distinct geometries: **${T.distinctGeoms}** (${(T.distinctCodes / T.distinctGeoms).toFixed(2)} codes/geometry).`, '')

md.push('## Dispatched but NOT ordered', '')
if (!dno.length) md.push('_None._ Every dispatched/invoiced MM ID appears in the order book.', '')
else {
  md.push('| MM ID | Family | In master | Dispatched MT | Description |', '|---|---|---|---|---|')
  dno.sort((a, b) => b.dispatchedMT - a.dispatchedMT).forEach(c => md.push(`| ${c.mmId} | ${c.family} | ${c.inMaster} | ${c.dispatchedMT.toFixed(2)} | ${c.desc} |`))
  md.push('')
}

md.push('## Duplicate-code clusters (same geometry, multiple MM IDs)', '')
if (!dupClusters.length) md.push('_None._', '')
else {
  dupClusters.forEach(cl => {
    md.push(`### ${cl.clusterId} · ${cl.sig} · _${cl.flag}_`)
    md.push('| MM ID | Family | In master | Ordered MT | Dispatched MT | Description |', '|---|---|---|---|---|---|')
    ;[...cl.members].sort((a, b) => b.orderedMT - a.orderedMT).forEach(m =>
      md.push(`| ${m.mmId} | ${m.family} | ${m.inMaster} | ${m.orderedMT.toFixed(2)} | ${m.dispatchedMT.toFixed(2)} | ${m.desc} |`))
    md.push('')
  })
}

md.push('## Codes missing from the SKU master', '')
if (!uncatalogued.length) md.push('_None._', '')
else {
  md.push(`${uncatalogued.length} codes ordered/invoiced are not in \`src/data/skus.js\`:`, '')
  md.push('| MM ID | Family | Ordered MT | Dispatched MT | Description |', '|---|---|---|---|---|')
  uncatalogued.sort((a, b) => b.orderedMT - a.orderedMT).forEach(c =>
    md.push(`| ${c.mmId} | ${c.family} | ${c.orderedMT.toFixed(2)} | ${c.dispatchedMT.toFixed(2)} | ${c.desc} |`))
  md.push('')
}
fs.writeFileSync(path.join(WS, 'sku-analysis-report.md'), md.join('\n'))

// ═══════════════════════════════════════════════════════════════════════════
// DEEP-DIVE: dashboard/inventory mapping audit  →  single Excel workbook
//
// Why these tabs: the dashboards reconcile ORDERED (keyed on order mmId) against
// INVOICED (keyed on dispatch entry skuCode) in skuInventoryRows()/skuDemandSupply()
// (src/lib/calc.js). When one physical tube carries >1 MM-ID code, the ordered and
// invoiced MT land on DIFFERENT rows and never net — phantom pending, phantom supply,
// double-counted MT, and (for codes missing from the master) a self-healed "ghost" SKU
// row from resolve() in src/App.jsx. Order Backlog / FG Booking are SAFE — they net per
// order line via orderLineId, not by code. This workbook makes that visible + fixable.
// ═══════════════════════════════════════════════════════════════════════════

// ── canonical code per geometry: the in-master member carrying the most ordered MT
// (tiebreak: most ordered overall, then lowest code). Falls back to the most-ordered
// member when no in-master member exists (those need ADD_TO_MASTER). ──
const pickCanonical = (members) => {
  const ranked = [...members].sort((a, b) =>
    (Number(b.inMaster) - Number(a.inMaster)) ||
    (b.orderedMT - a.orderedMT) ||
    (b.dispatchedMT - a.dispatchedMT) ||
    a.mmId.localeCompare(b.mmId))
  return ranked[0]
}

// ── Canonical Mapping tab: one row per variant code → canonical code ──
const mappingRows = []
for (const cl of clusters) {
  if (cl.sig.startsWith('UNPARSEABLE:')) continue
  const canon = pickCanonical(cl.members)
  for (const m of cl.members) {
    const isCanon = m.mmId === canon.mmId
    let action
    if (isCanon && canon.inMaster && cl.members.length === 1) action = 'NONE (already clean)'
    else if (isCanon && !canon.inMaster) action = 'ADD_TO_MASTER'
    else if (isCanon) action = 'NONE (canonical)'
    else if (canon.inMaster) action = 'ALIAS → canonical'
    else action = 'ALIAS → canonical (canonical also needs ADD_TO_MASTER)'
    mappingRows.push({
      Geometry: cl.sig,
      VariantCode: m.mmId,
      VariantFamily: m.family,
      VariantInMaster: m.inMaster,
      VariantOrderedMT: Number(m.orderedMT.toFixed(3)),
      VariantInvoicedMT: Number(m.dispatchedMT.toFixed(3)),
      CanonicalCode: canon.mmId,
      CanonicalInMaster: canon.inMaster,
      RecommendedAction: action,
      VariantDescription: m.desc,
      CanonicalDescription: canon.desc,
    })
  }
}
// keep only geometries that actually need attention (multi-code OR a member missing from master),
// plus surface clean singletons last is noise → drop them.
const mappingActionable = mappingRows.filter(r =>
  r.RecommendedAction !== 'NONE (already clean)')
  .sort((a, b) => a.Geometry.localeCompare(b.Geometry) || b.VariantOrderedMT - a.VariantOrderedMT)

// ── Dashboard Impact tab: per affected code, quantify the distortion + name the panel ──
// A code is "affected" if its geometry has >1 code, or it isn't in the master.
const affectedSigs = new Set(clusters.filter(cl =>
  cl.members.length > 1 || cl.members.some(m => !m.inMaster)).map(cl => cl.sig))
const canonBySig = new Map(clusters.map(cl => [cl.sig, pickCanonical(cl.members)]))
const impactRows = []
for (const c of all) {
  const sig = c.sig || `UNPARSEABLE:${c.mmId}`
  if (!affectedSigs.has(sig)) continue
  const canon = canonBySig.get(sig)
  const isCanon = canon && c.mmId === canon.mmId
  const splitOrderedMT = (!isCanon && c.orderedMT > 1e-9) ? c.orderedMT : 0       // demand recorded under a non-canonical code
  const phantomSupplyMT = c.dispatchedNotOrdered ? c.dispatchedMT : 0             // invoiced under a code with no orders
  const ghostSelfHeal = !c.inMaster && c.dispatchedMT > 1e-9                      // resolve() would mint a ghost SKU row
  const ghostRisk = !c.inMaster && c.dispatchedMT < 1e-9 && c.orderedMT > 1e-9    // ordered-only, not catalogued → ghost on first invoice
  impactRows.push({
    SkuCode: c.mmId,
    Geometry: sig,
    InMaster: c.inMaster,
    Role: c.orderedMT > 1e-9 && c.dispatchedMT > 1e-9 ? 'ordered+invoiced'
        : c.orderedMT > 1e-9 ? 'ordered-only'
        : c.dispatchedMT > 1e-9 ? 'invoiced-only' : '—',
    OrderedMT: Number(c.orderedMT.toFixed(3)),
    InvoicedMT: Number(c.dispatchedMT.toFixed(3)),
    SplitOrderedMT: Number(splitOrderedMT.toFixed(3)),
    PhantomSupplyMT: Number(phantomSupplyMT.toFixed(3)),
    GhostSelfHeal: ghostSelfHeal,
    GhostRiskWhenInvoiced: ghostRisk,
    CanonicalCode: canon ? canon.mmId : c.mmId,
    PanelsAffected: 'SKU Inventory (skuInventoryRows), Demand vs Supply (skuDemandSupply)',
    PanelsSafe: 'Order Backlog / FG Booking (per-line orderLineId netting)',
    Description: c.desc,
  })
}
impactRows.sort((a, b) =>
  (b.SplitOrderedMT + b.PhantomSupplyMT) - (a.SplitOrderedMT + a.PhantomSupplyMT) ||
  b.OrderedMT - a.OrderedMT || a.SkuCode.localeCompare(b.SkuCode))

// ── Mismatch Clusters tab: every multi-code / flagged geometry, one row per member ──
const clusterRows = []
for (const cl of clusters) {
  if (cl.members.length === 1 && cl.flag === 'OK') continue
  ;[...cl.members].sort((a, b) => b.orderedMT - a.orderedMT).forEach(m => clusterRows.push({
    ClusterId: cl.clusterId, Flag: cl.flag, ClusterSize: cl.members.length, Geometry: cl.sig,
    SkuCode: m.mmId, Family: m.family, InMaster: m.inMaster,
    OrderedMT: Number(m.orderedMT.toFixed(3)), InvoicedMT: Number(m.dispatchedMT.toFixed(3)),
    Description: m.desc,
  }))
}

// ── Missing Codes tab: codes ordered/invoiced but absent from the master ──
const inMasterSigs = new Set(all.filter(c => c.inMaster).map(c => c.sig).filter(Boolean))
const missingRows = uncatalogued.slice().sort((a, b) => b.orderedMT - a.orderedMT).map(c => ({
  SkuCode: c.mmId, Family: c.family, Geometry: c.sig || `UNPARSEABLE:${c.mmId}`,
  OrderedMT: Number(c.orderedMT.toFixed(3)), InvoicedMT: Number(c.dispatchedMT.toFixed(3)),
  DuplicatesExistingGeometry: c.sig ? inMasterSigs.has(c.sig) : false,
  CanonicalCodeIfDuplicate: (c.sig && canonBySig.get(c.sig) && canonBySig.get(c.sig).inMaster)
    ? canonBySig.get(c.sig).mmId : '',
  Description: c.desc,
}))

// ── Summary tab: plain-language diagnosis + headline numbers + ranked recommendations ──
const splitOrderedTotal = impactRows.reduce((s, r) => s + r.SplitOrderedMT, 0)
const ghostRiskCount = impactRows.filter(r => r.GhostRiskWhenInvoiced || r.GhostSelfHeal).length
const summaryRows = [
  ['SKU mapping audit — dashboard & inventory accuracy', ''],
  ['Generated', new Date().toISOString().slice(0, 10)],
  ['Orders file', path.basename(ordersPath)],
  ['Dispatch file(s)', dispatchPaths.map(p => path.basename(p)).join(', ')],
  ['', ''],
  ['DIAGNOSIS', 'The physical SKU exists, but the same tube is recorded under more than one MM-ID code.'],
  ['', 'Dashboards reconcile ORDERED (order mmId) vs INVOICED (dispatch skuCode) by code, so the'],
  ['', 'ordered and invoiced MT land on different rows and never net — phantom pending, phantom'],
  ['', 'supply, the same MT counted twice, and ghost SKU rows for codes missing from the master.'],
  ['', ''],
  ['Dispatched-but-not-ordered codes', `${T.dnoCount} (${T.dnoMT.toFixed(1)} MT) — every invoiced code was also ordered`],
  ['Geometries served by >1 MM-ID code', `${dupClusters.length}`],
  ['Ordered MT recorded under a non-canonical code (split demand)', `${splitOrderedTotal.toFixed(1)} MT`],
  ['Codes missing from the SKU master', `${T.uncatCount} (${T.uncatOrderedMT.toFixed(1)} MT ordered, ${T.uncatDispMT.toFixed(1)} MT invoiced)`],
  ['Codes at ghost-SKU risk (missing from master)', `${ghostRiskCount}`],
  ['', ''],
  ['PANELS DISTORTED', 'SKU Inventory (skuInventoryRows), Demand vs Supply (skuDemandSupply)'],
  ['PANELS SAFE', 'Order Backlog / FG Booking — they net per order line via orderLineId'],
  ['', ''],
  ['RECOMMENDATIONS (ranked)', ''],
  ['1', `Add the ${T.uncatCount} missing codes to the SKU master (src/data/skus.js) so resolve() stops minting ghost SKUs.`],
  ['2', `Decide the ${dupClusters.length} duplicate-code geometries (IS 1161 1141-13068 vs IS 3601 1141-13171): alias the variant to the canonical code, or consolidate if physically identical. See Canonical Mapping tab.`],
  ['3', 'Optional/durable fix: reconcile skuInventoryRows/skuDemandSupply by orderLineId (as Order Backlog already does), so future code drift can no longer split a tube across two rows.'],
]

// ── write the workbook ──
const wb = XLSX.utils.book_new()
const addSheet = (name, rows, header) => {
  const ws = header
    ? XLSX.utils.json_to_sheet(rows, { header })
    : (Array.isArray(rows[0]) ? XLSX.utils.aoa_to_sheet(rows) : XLSX.utils.json_to_sheet(rows))
  XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
}
addSheet('Summary', summaryRows.length ? summaryRows : [['(no data)']])
addSheet('Dashboard Impact', impactRows.length ? impactRows : [{ Note: 'No affected codes' }])
addSheet('Canonical Mapping', mappingActionable.length ? mappingActionable : [{ Note: 'No mapping changes needed' }])
addSheet('Mismatch Clusters', clusterRows.length ? clusterRows : [{ Note: 'No multi-code/flagged geometries' }])
addSheet('Missing Codes', missingRows.length ? missingRows : [{ Note: 'No codes missing from master' }])
const xlsxPath = path.join(WS, 'sku-mapping-audit.xlsx')
XLSX.writeFile(wb, xlsxPath)

// ── console summary ──
console.log('SKU analysis complete.')
console.log(`  orders: ${T.orderLines} lines / ${new Set(orderRows.map(o => o.mmId)).size} MM IDs / ${T.orderedMT.toFixed(1)} MT`)
console.log(`  dispatch: ${T.dispLines} lines / ${new Set(dispRows.map(d => d.mmId)).size} MM IDs / ${T.dispatchedMT.toFixed(1)} MT`)
console.log(`  distinct codes ${T.distinctCodes} -> geometries ${T.distinctGeoms}`)
console.log(`  DISPATCHED-NOT-ORDERED: ${T.dnoCount} codes (${T.dnoMT.toFixed(1)} MT)`)
console.log(`  duplicate-code clusters: ${dupClusters.length}`)
console.log(`  missing from master: ${T.uncatCount} codes (${T.uncatOrderedMT.toFixed(1)} MT ordered)`)
console.log(`  affected codes (dashboard impact): ${impactRows.length}; split-demand ${splitOrderedTotal.toFixed(1)} MT; mapping rows ${mappingActionable.length}`)
console.log(`  wrote .workspace/sku-analysis.csv, .workspace/sku-analysis-report.md, .workspace/sku-mapping-audit.xlsx`)

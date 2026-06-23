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
const XLSX = require('xlsx')

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

// ── console summary ──
console.log('SKU analysis complete.')
console.log(`  orders: ${T.orderLines} lines / ${new Set(orderRows.map(o => o.mmId)).size} MM IDs / ${T.orderedMT.toFixed(1)} MT`)
console.log(`  dispatch: ${T.dispLines} lines / ${new Set(dispRows.map(d => d.mmId)).size} MM IDs / ${T.dispatchedMT.toFixed(1)} MT`)
console.log(`  distinct codes ${T.distinctCodes} -> geometries ${T.distinctGeoms}`)
console.log(`  DISPATCHED-NOT-ORDERED: ${T.dnoCount} codes (${T.dnoMT.toFixed(1)} MT)`)
console.log(`  duplicate-code clusters: ${dupClusters.length}`)
console.log(`  missing from master: ${T.uncatCount} codes (${T.uncatOrderedMT.toFixed(1)} MT ordered)`)
console.log(`  wrote .workspace/sku-analysis.csv and .workspace/sku-analysis-report.md`)

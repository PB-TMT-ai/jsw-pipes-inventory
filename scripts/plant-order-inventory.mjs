// ── Plant order & inventory summary — one row per plant ─────────────────────────────────────────
//
//   Plant | BE (region) | Order in hand | Confirmed | Non-confirmed | Physical inventory |
//   Days of inventory | Ageing 0–30 | 31–60 | 61–90 | 90+
//
// Rules of record: docs/plant-order-inventory-rules.md. Every figure comes from a builder the app
// already ships and tests — nothing is re-derived here:
//   • Confirmed / Non-confirmed / Order in hand  → buildPlantMtdSummary  (the PB MTD BY PLANT block)
//   • Physical inventory / Days of inventory     → buildInventorySnapshotData (Inventory Snapshot S2/S3)
//   • Ageing buckets                             → skuAgeing, per plant, keyed by the snapshot size key (S10)
//   • BE by region                               → distributorRegionResolver over the month's estimates
//
// The Supabase host is blocked from cloud containers, so rows arrive as a JSON dump pulled through
// the Supabase MCP (see LEARNINGS.md 2026-09-08). Same camelCase shape db.js produces.
//
// Usage: node scripts/plant-order-inventory.mjs --in rows.json --date YYYY-MM-DD [--out summary.json]
// exit 1 on a failed tie-out — never print a table whose rows do not add up.

import { readFileSync, writeFileSync } from 'node:fs'
import { buildPlantMtdSummary, buildInventorySnapshotData, snapshotSizeKeyResolver } from '../src/lib/reports.js'
import { resolveProductionWeights, skuAgeing, plantMaster, distributorRegionResolver,
  filterByPlant, filterDispatchesByPlant, shippedByOrderLine, liveConfirmed, isDeliveredStatus } from '../src/lib/calc.js'

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined }
const die = (m) => { console.error(`x ${m}`); process.exit(1) }
const DATE = flag('date') || die('--date YYYY-MM-DD is required')
const raw = JSON.parse(readFileSync(flag('in') || die('--in rows.json is required'), 'utf8'))
const { orders, dispatches, productions, skus, coils, babyCoils, estimates, stateRegions, distributors } = raw
const plants = raw.plants?.length ? raw.plants : null
const MONTH = DATE.slice(0, 7)
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

const master = plantMaster(plants)
const ORDER = ['hyderabad', 'lepakshi', 'npmd', 'tapi']
const ordered = [...ORDER.map(id => master.find(p => p.id === id)).filter(Boolean),
  ...master.filter(p => !ORDER.includes(p.id))]
const NAME = { hyderabad: 'Nippon' }      // Inventory Snapshot naming (user decision, #213)

// ── Orders ──
const split = buildPlantMtdSummary(orders, dispatches, { date: DATE, master })
const orderRow = (id) => split.plants.find(r => r.plant === id) || { confirmed: 0, nonConfirmed: 0, pending: 0 }

// ── Stock ──
const snap = buildInventorySnapshotData(skus, productions, dispatches, coils, babyCoils, { date: DATE, plants })
const snapRow = (id) => snap.plantSummary.rows.find(r => r.plantId === id)

// Ageing buckets: the same per-plant partition the snapshot's S10 uses — production by its plant,
// invoice ENTRY by its plant — FIFO-drained per size key.
const resolved = resolveProductionWeights(productions, skus, babyCoils)
const keyOf = snapshotSizeKeyResolver(skus)
const known = new Set(master.map(p => p.id))
const bucketOf = (row) => { const id = String(row?.plant ?? '').trim(); return known.has(id) ? id : '' }
const prodBy = {}, dispBy = {}
resolved.filter(p => !p.deleted).forEach(p => (prodBy[bucketOf(p)] = prodBy[bucketOf(p)] || []).push(p))
dispatches.filter(d => !d.deleted).forEach(d => {
  const by = {}
  ;(d.bundleEntries || []).forEach(e => (by[bucketOf(e)] = by[bucketOf(e)] || []).push(e))
  Object.entries(by).forEach(([pl, entries]) =>
    (dispBy[pl] = dispBy[pl] || []).push({ dateOfDispatch: d.dateOfDispatch, bundleEntries: entries }))
})
const ageingOf = (id) => Object.values(skuAgeing(prodBy[id] || [], dispBy[id] || [], keyOf, DATE)).reduce((t, a) => ({
  d0_30: t.d0_30 + a.buckets.d0_30, d31_60: t.d31_60 + a.buckets.d31_60,
  d61_90: t.d61_90 + a.buckets.d61_90, d90plus: t.d90plus + a.buckets.d90plus,
}), { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 })

// ── BE by region (month of D): each live estimate lands on its distributor's region ──
const regionOf = distributorRegionResolver(orders, dispatches, stateRegions, null, distributors)
const monthEst = (estimates || []).filter(e => !e.deleted && e.month === MONTH)
const beByRegion = {}
monthEst.forEach(e => {
  const r = regionOf(e.distributorKey).region
  beByRegion[r] = (beByRegion[r] || 0) + num(e.bestEstimate)
})
const regionOfPlant = (p) => (p.serves || [])[0] || ''
const servedRegions = new Set(ordered.flatMap(p => p.serves || []))

// ── Rows ──
const rows = ordered.map(p => {
  const o = orderRow(p.id), s = snapRow(p.id), a = ageingOf(p.id)
  const ageSum = a.d0_30 + a.d31_60 + a.d61_90 + a.d90plus
  if (Math.abs(ageSum - s.fgMt) > 0.001) die(`${p.id}: ageing ${ageSum} does not tie to inventory ${s.fgMt}`)
  return {
    plantId: p.id, plant: `${NAME[p.id] || p.name} (${regionOfPlant(p).charAt(0)})`, region: regionOfPlant(p),
    confirmed: o.confirmed, nonConfirmed: o.nonConfirmed, orderInHand: o.confirmed + o.nonConfirmed,
    inventory: s.fgMt, sold30: s.sold30Mt, daysCover: s.fgCoverDays ?? null, ...a,
  }
})
const unattributed = split.plants.find(r => r.plant === '') || null
const sum = (k) => rows.reduce((t, r) => t + r[k], 0)
const total = {
  plant: 'All plants', confirmed: sum('confirmed'), nonConfirmed: sum('nonConfirmed'), orderInHand: sum('orderInHand'),
  inventory: sum('inventory'), sold30: sum('sold30'),
  daysCover: sum('sold30') > 0 ? sum('inventory') / (sum('sold30') / 30) : null,
  d0_30: sum('d0_30'), d31_60: sum('d31_60'), d61_90: sum('d61_90'), d90plus: sum('d90plus'),
  be: monthEst.reduce((t, e) => t + num(e.bestEstimate), 0),
}
// Tie-outs: inventory to the snapshot's own total, orders to the split's ALL PLANTS (less Unattributed).
if (Math.abs(total.inventory - snap.plantSummary.total.fgMt) > 0.001) die('inventory does not tie to the snapshot total')
if (Math.abs(total.orderInHand + num(unattributed?.pending) - split.totals.pending) > 0.001) die('order in hand does not tie')

// ── SKU wise (rules P11–P13): the same figures per plant × size key ──────────────────────────────
// Orders: the composition buildPlantMtdSummary uses — the plant's orders, the plant's dispatches of
// the month up to D for the netting — so each plant's SKU rows sum to its plant row exactly.
const monthUpToD = dispatches.filter(d => !d.deleted && String(d.dateOfDispatch).slice(0, 7) === MONTH && d.dateOfDispatch <= DATE)
const dayNo = (iso) => Math.floor(Date.parse(String(iso || '').slice(0, 10)) / 86400000)
const asOfDay = dayNo(DATE), windowFrom = asOfDay - 29
const descByKey = {}
orders.filter(o => !o.deleted && o.mmId && o.description).forEach(o => { descByKey[keyOf(String(o.mmId).trim())] ??= o.description })
const labelOf = (k) => {
  if (!k.startsWith('code:')) { const [section, size, thk] = k.split('|'); return { section, size, thickness: Number(thk), mapped: true } }
  return { section: '', size: descByKey[k] || k.slice(5), thickness: null, mapped: false, code: k.slice(5) }
}
const skuRows = []
for (const p of ordered) {
  const by = {}
  const at = (k) => (by[k] = by[k] || { key: k, confirmed: 0, nonConfirmed: 0, inventory: 0, sold30: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 })
  const shipped = shippedByOrderLine(filterDispatchesByPlant(monthUpToD, p.id))
  filterByPlant(orders.filter(o => !o.deleted), p.id).filter(o => !isDeliveredStatus(o.orderStatus)).forEach(o => {
    const c = liveConfirmed(o, shipped), n = num(o.nonConfirmed)
    if (c === 0 && n === 0) return
    const r = at(keyOf(String(o.mmId || '').trim()))
    r.confirmed += c; r.nonConfirmed += n
  })
  Object.entries(skuAgeing(prodBy[p.id] || [], dispBy[p.id] || [], keyOf, DATE)).forEach(([k, a]) => {
    const r = at(k)
    r.inventory += a.onhandWeight
    r.d0_30 += a.buckets.d0_30; r.d31_60 += a.buckets.d31_60; r.d61_90 += a.buckets.d61_90; r.d90plus += a.buckets.d90plus
  })
  ;(dispBy[p.id] || []).forEach(d => {
    const day = dayNo(d.dateOfDispatch)
    if (day < windowFrom || day > asOfDay) return
    d.bundleEntries.forEach(e => { if (by[keyOf(e.skuCode)]) by[keyOf(e.skuCode)].sold30 += num(e.weight) })
  })
  const plantRow = rows.find(r => r.plantId === p.id)
  const list = Object.values(by).filter(r => r.confirmed + r.nonConfirmed > 0.0005 || r.inventory > 0.0005)
  // A SKU row's sales count only when the row is kept, so the plant's 30-day sales are recomputed
  // over all its sizes for the tie-out, not over the kept rows.
  for (const [k, field] of [['confirmed', 'confirmed'], ['nonConfirmed', 'nonConfirmed'], ['inventory', 'inventory'],
    ['d0_30', 'd0_30'], ['d31_60', 'd31_60'], ['d61_90', 'd61_90'], ['d90plus', 'd90plus']]) {
    const s = list.reduce((t, r) => t + r[k], 0)
    if (Math.abs(s - plantRow[field]) > 0.001) die(`${p.id}: SKU ${k} ${s} does not tie to plant ${plantRow[field]}`)
  }
  list.forEach(r => skuRows.push({
    plantId: p.id, plant: plantRow.plant, ...labelOf(r.key), key: r.key,
    orderInHand: r.confirmed + r.nonConfirmed, confirmed: r.confirmed, nonConfirmed: r.nonConfirmed,
    inventory: r.inventory, sold30: r.sold30, daysCover: r.sold30 > 0.0005 ? r.inventory / (r.sold30 / 30) : null,
    d0_30: r.d0_30, d31_60: r.d31_60, d61_90: r.d61_90, d90plus: r.d90plus,
  }))
}
const SECTION_RANK = { SHS: 0, RHS: 1, CHS: 2 }
const sizeNums = (s) => String(s).match(/\d+(\.\d+)?/g)?.map(Number) || [Infinity]
skuRows.sort((a, b) => {
  const pa = ordered.findIndex(p => p.id === a.plantId) - ordered.findIndex(p => p.id === b.plantId)
  if (pa) return pa
  if (a.mapped !== b.mapped) return a.mapped ? -1 : 1
  const sa = (SECTION_RANK[a.section] ?? 9) - (SECTION_RANK[b.section] ?? 9)
  if (sa) return sa
  const na = sizeNums(a.size), nb = sizeNums(b.size)
  for (let i = 0; i < Math.max(na.length, nb.length); i++) if ((na[i] ?? 0) !== (nb[i] ?? 0)) return (na[i] ?? 0) - (nb[i] ?? 0)
  return (a.thickness ?? 0) - (b.thickness ?? 0) || String(a.size).localeCompare(String(b.size))
})

const out = {
  date: DATE, month: MONTH, rows, total, skuRows,
  beByRegion, beEntries: monthEst.length,
  beOutsideServedRegions: Object.entries(beByRegion).filter(([r]) => !servedRegions.has(r)),
  unattributedOrders: unattributed && unattributed.pending > 0.0005
    ? { confirmed: unattributed.confirmed, nonConfirmed: unattributed.nonConfirmed, pending: unattributed.pending } : null,
  unattributedStock: snap.excluded,
}
const dest = flag('out')
if (dest) writeFileSync(dest, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))

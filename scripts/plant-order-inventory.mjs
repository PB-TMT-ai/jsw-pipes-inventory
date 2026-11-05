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
import { resolveProductionWeights, skuAgeing, plantMaster, distributorRegionResolver } from '../src/lib/calc.js'

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

const out = {
  date: DATE, month: MONTH, rows, total,
  beByRegion, beEntries: monthEst.length,
  beOutsideServedRegions: Object.entries(beByRegion).filter(([r]) => !servedRegions.has(r)),
  unattributedOrders: unattributed && unattributed.pending > 0.0005
    ? { confirmed: unattributed.confirmed, nonConfirmed: unattributed.nonConfirmed, pending: unattributed.pending } : null,
  unattributedStock: snap.excluded,
}
const dest = flag('out')
if (dest) writeFileSync(dest, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))

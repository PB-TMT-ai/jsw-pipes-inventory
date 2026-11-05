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
  filterByPlant, filterDispatchesByPlant, shippedByOrderLine, liveConfirmed, isDeliveredStatus,
  coilConsumption, babyCoilIsStock, rmRollsFg, allowedRmThickness, RM_TO_FG_THICKNESS } from '../src/lib/calc.js'

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
// Opening = finished stock at close of the day before the 1st of the month: per plant × size,
// produced dated before the 1st − invoiced dated before the 1st, floored at 0 per size.
const monthStart = `${MONTH}-01`
const openingBy = {}                                 // plant → key → net
const addOpen = (plant, k, mt) => { const p = (openingBy[plant] = openingBy[plant] || {}); p[k] = (p[k] || 0) + mt }
resolved.filter(p => !p.deleted && String(p.dateOfProduction).slice(0, 10) < monthStart)
  .forEach(p => addOpen(bucketOf(p), keyOf(p.skuCode), num(p.totalWeight)))
dispatches.filter(d => !d.deleted && String(d.dateOfDispatch).slice(0, 10) < monthStart)
  .forEach(d => (d.bundleEntries || []).forEach(e => addOpen(bucketOf(e), keyOf(e.skuCode), -num(e.weight))))
const openingOf = (plant, k) => Math.max(0, openingBy[plant]?.[k] || 0)

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
  Object.keys(openingBy[p.id] || {}).forEach(k => { if (openingOf(p.id, k) > 0.0005) at(k) })
  const plantRow = rows.find(r => r.plantId === p.id)
  const list = Object.values(by).filter(r => r.confirmed + r.nonConfirmed > 0.0005 || r.inventory > 0.0005 || openingOf(p.id, r.key) > 0.0005)
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
// ── P14–P17: Available, WIP (Coil + Slit), Coil not available, Opening ─────────────────────────
// WIP coil pools per plant × coil gauge, Inventory Snapshot S14 exactly: mother = weight (actual,
// else invoice) − Σ live baby slit weight, floored at 0 per coil; baby = not assigned to any live
// production, at full slit weight. Each coil at its own stored plant.
const wipPool = {}                                   // plant → { gauge(2dp) → MT }
const addWip = (plant, thk, mt) => {
  const g = Number(thk).toFixed(2)
  const p = (wipPool[plant] = wipPool[plant] || {}); p[g] = (p[g] || 0) + mt
}
const liveBabies = babyCoils.filter(b => !b.deleted)
const slitOff = {}
liveBabies.forEach(b => { slitOff[b.hrCoilId] = (slitOff[b.hrCoilId] || 0) + num(b.weight) })
coils.filter(c => !c.deleted).forEach(c => {
  const w = num(c.actualWeight) > 0 ? num(c.actualWeight) : num(c.invoiceWeight)
  const mt = Math.max(0, w - (slitOff[c.hrCoilId] || 0))
  if (mt > 0.0005) addWip(bucketOf(c), c.thickness, mt)
})
const consumedByBaby = coilConsumption(resolved, null, 'babyCoilId')
liveBabies.filter(b => babyCoilIsStock(b, consumedByBaby)).forEach(b => addWip(bucketOf(b), b.thickness, num(b.weight)))
const wipTotal = (plant) => Object.values(wipPool[plant] || {}).reduce((t, v) => t + v, 0)
const wipFor = (plant, fgThk) => Object.entries(wipPool[plant] || {})
  .filter(([g]) => rmRollsFg(Number(g), fgThk)).reduce((t, [, v]) => t + v, 0)


// Need = order in hand finished stock cannot cover. Coil is placed per plant: pipe thicknesses in
// ascending order, each drawing its OWN gauge first, then the other gauges the RM→FG sheet allows
// (ascending). What a thickness cannot get is shared across its SKUs in proportion to their need.
const gaugesFor = (fg) => allowedRmThickness(fg).map(g => g.toFixed(2))
  .sort((a, b) => (Math.abs(a - fg) < 0.01 ? -1 : 0) - (Math.abs(b - fg) < 0.01 ? -1 : 0) || a - b)
for (const p of ordered) {
  const mine = skuRows.filter(r => r.plantId === p.id)
  mine.forEach(r => {
    r.available = r.inventory - r.confirmed
    r.opening = openingOf(p.id, r.key)
    r.need = Math.max(0, r.orderInHand - r.inventory)
    r.wip = r.mapped ? wipFor(p.id, r.thickness) : null
    r.coilShort = null
  })
  const left = { ...(wipPool[p.id] || {}) }
  const thks = [...new Set(mine.filter(r => r.mapped).map(r => r.thickness))].sort((a, b) => a - b)
  for (const t of thks) {
    const group = mine.filter(r => r.mapped && r.thickness === t)
    const need = group.reduce((s, r) => s + r.need, 0)
    let got = 0
    for (const g of gaugesFor(t)) {
      if (got >= need) break
      const take = Math.min(need - got, left[g] || 0); left[g] = (left[g] || 0) - take; got += take
    }
    const short = need - got
    group.forEach(r => { r.coilShort = need > 0 ? short * r.need / need : 0 })
  }
  // A code not on the SKU master has no known thickness: its coil match is unknown ('?'), never 0.
  // Its tonnage is named in the notes rather than counted as short or as covered.
}
// The opening of a size that has NO row now (nothing on hand, nothing ordered) still belongs to
// the plant's opening — so the plant opening is summed over every size, not over kept rows.
const openingTotal = (plant) => Object.values(openingBy[plant] || {}).reduce((t, v) => t + Math.max(0, v), 0)
const extra = {}
for (const p of ordered) {
  const mine = skuRows.filter(r => r.plantId === p.id)
  const row = rows.find(r => r.plantId === p.id)
  // P18: on the plant row, Available / WIP / Coil not available cover ONLY the SKUs carrying a
  // Non-confirmed order (user, 5 Nov 2026). WIP counts each coil gauge once if it can roll ANY of
  // those SKUs' thicknesses, so coil shared by two thicknesses is not counted twice. Coil not
  // available keeps P16's placement (confirmed orders draw coil too) and sums those SKUs' share.
  const nc = mine.filter(r => r.nonConfirmed > 0.0005)
  const ncThk = [...new Set(nc.filter(r => r.mapped).map(r => r.thickness))]
  row.wipAll = wipTotal(p.id)
  row.available = nc.reduce((t, r) => t + r.available, 0)
  row.wip = Object.entries(wipPool[p.id] || {})
    .filter(([g]) => ncThk.some(t => rmRollsFg(Number(g), t))).reduce((t, [, v]) => t + v, 0)
  row.coilShort = nc.reduce((t, r) => t + (r.coilShort || 0), 0)
  row.ncSkus = nc.length
  row.opening = openingTotal(p.id)
  extra[p.id] = {
    ncUnknownThk: nc.filter(r => !r.mapped).reduce((t, r) => t + r.nonConfirmed, 0),
    openingNoRow: row.opening - mine.reduce((t, r) => t + r.opening, 0),
    unknownThk: mine.filter(r => !r.mapped).reduce((t, r) => t + r.orderInHand, 0),
    noGauge: mine.filter(r => r.mapped && !allowedRmThickness(r.thickness).length && r.need > 0)
      .map(r => ({ sku: `${r.section} ${r.size} × ${r.thickness}`, need: r.need })),
    wipNoFg: Object.entries(wipPool[p.id] || {}).filter(([g]) => !RM_TO_FG_THICKNESS.some(x => Math.abs(x.rm - g) < 0.01))
      .map(([g, v]) => ({ gauge: Number(g), mt: v })),
  }
}
for (const k of ['available', 'wip', 'wipAll', 'coilShort', 'opening', 'ncSkus']) total[k] = sum(k)
// Tie-out: WIP to the Inventory Snapshot's own RM figure (S14).
for (const p of ordered) {
  const rm = snapRow(p.id).rmMt
  if (Math.abs(rm - rows.find(r => r.plantId === p.id).wipAll) > 0.001) die(`${p.id}: WIP ${rows.find(r => r.plantId === p.id).wipAll} does not tie to RM ${rm}`)
}
if (wipPool['']) die('coil with no plant — Unattributed WIP is not handled')

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
  date: DATE, month: MONTH, rows, total, skuRows, extra, monthStart,
  beByRegion, beEntries: monthEst.length,
  beOutsideServedRegions: Object.entries(beByRegion).filter(([r]) => !servedRegions.has(r)),
  unattributedOrders: unattributed && unattributed.pending > 0.0005
    ? { confirmed: unattributed.confirmed, nonConfirmed: unattributed.nonConfirmed, pending: unattributed.pending } : null,
  unattributedStock: snap.excluded,
}
const dest = flag('out')
if (dest) writeFileSync(dest, JSON.stringify(out, null, 1))
console.log(JSON.stringify(out, null, 1))

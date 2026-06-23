// ═══════════════════════════════════════════════════════════════
// CALC — pure helpers & business logic extracted from App.jsx for testability.
// No React, no DOM, no Supabase imports here. Keep these functions side-effect free.
// ═══════════════════════════════════════════════════════════════

// ── Formatting ──
export const fmtT = (v) => v != null ? Number(v).toFixed(1) : '—'
export const fmtPct = (v) => v != null ? Number(v).toFixed(1) + '%' : '—'
export const fmtINR = (v) => v != null && !isNaN(v) ? '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'

// ── Dashboard period filter. `periodRange` maps a preset to an inclusive ISO {from,to}
// window (empty string ⇒ open-ended on that side). period ∈
// 'all' | '7d' | 'mtd' | 'month' | 'custom'. `today` is 'YYYY-MM-DD', `monthSel` is 'YYYY-MM'.
// All date math in UTC so month boundaries / leap years don't drift with the local TZ. ──
const isoShiftDays = (iso, days) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function periodRange(period, { today, monthSel = '', customFrom = '', customTo = '' } = {}) {
  const t = today || new Date().toISOString().slice(0, 10)
  if (period === '7d') return { from: isoShiftDays(t, -6), to: '' }       // last 7 days incl. today
  if (period === 'mtd') return { from: t.slice(0, 7) + '-01', to: '' }    // month-to-date
  if (period === 'month') {
    if (!monthSel) return { from: '', to: '' }
    const end = new Date(monthSel + '-01T00:00:00Z')
    end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0)             // last day of monthSel
    return { from: monthSel + '-01', to: end.toISOString().slice(0, 10) }
  }
  if (period === 'custom') return { from: customFrom || '', to: customTo || '' }
  return { from: '', to: '' }                                            // 'all'
}
export const inDateRange = (d, range) => {
  const { from, to } = range || {}
  if (!from && !to) return true
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

// ── HR coil ID generator: HYD-MMYY-NN ──
export function genHRCoilId(dateStr, num) {
  const d = new Date(dateStr)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `HYD-${mm}${yy}-${String(num).padStart(2, '0')}`
}

// ── ±tolerance check. NOTE: returns ok:true when either arg is falsy — callers
// that must block on an over-value (e.g. the weight cap) compare explicitly. ──
export function tolerance(actual, expected, tol = 0.05) {
  if (!expected || !actual) return { ok: true, pct: 0, label: '—' }
  const pct = (actual / expected) * 100
  const ok = pct >= (1 - tol) * 100 && pct <= (1 + tol) * 100
  return { ok, pct, label: `${actual.toFixed(1)} / ${expected.toFixed(1)} (${pct.toFixed(1)}%)` }
}

// ── Bundle weight-per-piece from the chosen SKU (kg → tonnes) ──
export const weightPerPieceFromSku = (sku) =>
  sku?.weightPerTube ? Number(sku.weightPerTube) / 1000 : 0

// ── Per-coil weight cap. Bundling weight from a mother coil must stay ≤ its actual
// weight, with a ±tol over-fill ceiling. Guards coilWeight>0 so a zero-weight coil
// never allows unlimited bundling (the tolerance() helper would say ok for 0). ──
export function bundleWeightCap({ coilWeight, allocatedWeight, weightPerPiece, pieces, tol = 0.05 }) {
  const cw = Number(coilWeight || 0)
  const alloc = Number(allocatedWeight || 0)
  const wpp = Number(weightPerPiece || 0)
  const prospectiveWeight = alloc + wpp * Number(pieces || 0)
  const weightCeiling = cw * (1 + tol)
  const remainingWeight = cw - prospectiveWeight
  const overFilled = cw > 0 && prospectiveWeight > weightCeiling
  const overTolerance = cw > 0 && prospectiveWeight > cw && prospectiveWeight <= weightCeiling
  const maxPieces = wpp > 0 && cw > 0 ? Math.max(0, Math.floor((weightCeiling - alloc) / wpp)) : 0
  return { prospectiveWeight, weightCeiling, remainingWeight, overFilled, overTolerance, maxPieces }
}

// ── FIFO mother-coil allocation (Production stage). Allocates a produced quantity
// across eligible mother coils: oldest dateOfInward first, eligible only when the
// coil thickness is within ±tol of the SKU thickness. Fills each coil to its nominal
// actualWeight (oldest first); only if pieces still remain does it stretch coils into
// the ±tol over-fill band (pass 2). Allocates whole PIECES (no fractional tubes);
// weight per allocation = pieces × weightPerPiece. Never exceeds 105% of any coil —
// leftover pieces are reported as a shortfall (caller decides whether to block). ──
export function coilFifoAllocate({ coils, consumedByCoil = {}, skuThickness, weightPerPiece, pieces, tol = 0.05, softFill = 1 }) {
  const wpp = Number(weightPerPiece || 0)
  const reqPieces = Math.max(0, Math.floor(Number(pieces || 0)))
  const st = Number(skuThickness || 0)
  // Auto-advance fraction: fill each coil only to softFill×capacity before moving to the next
  // (e.g. 0.97 = advance at 97%). soft=1 ⇒ classic fill-to-nominal. The 97→100% and 100→105%
  // bands stay reachable as later passes (and for manual top-up in the UI).
  const soft = Math.min(1, Math.max(0, Number(softFill) || 1))
  // consumedByCoil values may be a number (weight) or a rich { weight } object.
  const consumedWt = (id) => {
    const v = consumedByCoil[id]
    return v && typeof v === 'object' ? Number(v.weight || 0) : Number(v || 0)
  }

  const eligible = (coils || [])
    .filter(c => !c.deleted && Number(c.actualWeight) > 0 && st > 0 &&
      Math.abs(Number(c.thickness) - st) <= tol * st)
    .sort((a, b) => {
      const da = String(a.dateOfInward || ''), db = String(b.dateOfInward || '')
      if (da !== db) return da < db ? -1 : 1
      return String(a.hrCoilId || '').localeCompare(String(b.hrCoilId || ''))
    })

  const placed = new Map() // hrCoilId → pieces placed by this allocation
  let remaining = reqPieces
  const fill = (capacityFor) => {
    if (wpp <= 0) return
    for (const c of eligible) {
      if (remaining <= 0) break
      const already = placed.get(c.hrCoilId) || 0
      const used = consumedWt(c.hrCoilId) + already * wpp
      const headroom = capacityFor(c) - used
      if (headroom <= 0) continue
      const fit = Math.min(remaining, Math.floor(headroom / wpp))
      if (fit <= 0) continue
      placed.set(c.hrCoilId, already + fit)
      remaining -= fit
    }
  }
  fill(c => Number(c.actualWeight) * soft)        // pass 1: advance at softFill (oldest first)
  if (remaining > 0 && soft < 1) fill(c => Number(c.actualWeight))  // pass 2: top up to nominal 100%
  if (remaining > 0) fill(c => Number(c.actualWeight) * (1 + tol)) // pass 3: ±tol over-fill band

  const allocations = eligible
    .filter(c => placed.has(c.hrCoilId))
    .map(c => {
      const pcs = placed.get(c.hrCoilId)
      const weight = pcs * wpp
      return { hrCoilId: c.hrCoilId, pieces: pcs, weight,
        overTolerance: (consumedWt(c.hrCoilId) + weight) > Number(c.actualWeight) }
    })

  const allocatedPieces = reqPieces - remaining
  return {
    allocations,
    allocatedPieces,
    allocatedWeight: allocatedPieces * wpp,
    requestedPieces: reqPieces,
    requestedWeight: reqPieces * wpp,
    shortfallPieces: remaining,
    shortfall: remaining > 0,
    overTolerance: allocations.some(a => a.overTolerance),
    noEligibleCoil: eligible.length === 0,
    fullyAllocated: reqPieces > 0 && remaining === 0,
  }
}

// ── Weight & pieces consumed from each coil by all production records.
// Keyed by `key` — 'babyCoilId' for baby-coil FIFO capacity (Production consumes baby
// coils), or 'hrCoilId' (default, mother) for mother-level rollups / legacy allocations.
// Allocations missing the chosen key are skipped (legacy mother-only rows don't consume
// baby capacity). Returns { [id]: { weight, pieces } }. Pass excludeId to ignore the
// production currently being edited (so it re-allocates as if released). ──
export function coilConsumption(productions, excludeId = null, key = 'hrCoilId') {
  const out = {}
  ;(productions || []).filter(p => !p.deleted && p.id !== excludeId).forEach(p =>
    (p.coilAllocations || []).forEach(a => {
      const id = a[key]
      if (id == null || id === '') return
      const cur = out[id] || { weight: 0, pieces: 0 }
      cur.weight += Number(a.weight || 0)
      cur.pieces += Number(a.pieces || 0)
      out[id] = cur
    }))
  return out
}

// ── Per-SKU produced pool: produced (from productions) minus dispatched (from each
// dispatch's bundleEntries). Bundle Formation was removed (June 2026 later change);
// dispatch now draws straight from production. availablePieces/Weight = produced −
// dispatched. Pass excludeDispatchId to ignore the dispatch being edited/re-imported. ──
export function producedPool(productions, dispatches, excludeDispatchId = null) {
  const out = {}
  const ensure = (sku) => (out[sku] = out[sku] ||
    { producedPieces: 0, producedWeight: 0, dispatchedPieces: 0, dispatchedWeight: 0 })
  ;(productions || []).filter(p => !p.deleted).forEach(p => {
    const e = ensure(p.skuCode)
    e.producedPieces += Number(p.tubeCount || 0)
    e.producedWeight += Number(p.totalWeight || 0)
  })
  ;(dispatches || []).filter(d => !d.deleted && d.id !== excludeDispatchId)
    .flatMap(d => d.bundleEntries || []).forEach(be => {
      const e = ensure(be.skuCode)
      e.dispatchedPieces += Number(be.pieces || 0)
      e.dispatchedWeight += Number(be.weight || 0)
    })
  Object.values(out).forEach(e => {
    e.availablePieces = e.producedPieces - e.dispatchedPieces
    e.availableWeight = e.producedWeight - e.dispatchedWeight
  })
  return out
}

// ── Customer-order booking (FG Booked / Free FG). An order line is "open" (still committed
// against inventory) when its Order Status is not a terminal one. Delivered/Cancelled/Rejected
// (and blank) are excluded — delivered demand is already reflected in dispatched FG. ──
export const isOpenOrderStatus = (status) => {
  const s = String(status || '').trim().toLowerCase()
  return s !== '' && !['delivered', 'cancelled', 'canceled', 'rejected'].includes(s)
}

// ── Open ordered quantity (MT) per SKU, keyed by mmId (== SKU master skuCode). Sums the
// Quantity of non-deleted, open-status order lines. ──
export function openOrderQtyBySku(orders) {
  const out = {}
  ;(orders || []).filter(o => !o.deleted && isOpenOrderStatus(o.orderStatus)).forEach(o => {
    const code = String(o.mmId || '').trim()
    if (!code) return
    out[code] = (out[code] || 0) + Number(o.quantity || 0)
  })
  return out
}

// ── Shipped (invoiced) weight per order line, from dispatch entries' orderLineId
// (== orders `lineId`, the ERP "Sku ID"). Lets us net an order line by exactly the
// shipments made against it, rather than aggregating dispatch per SKU. ──
export function shippedByOrderLine(dispatches) {
  const out = {}
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const lid = String(be.orderLineId || '').trim()
    if (lid) out[lid] = (out[lid] || 0) + Number(be.weight || 0)
  })
  return out
}

// ── SKU-wise inventory / booked / free rows for the dashboard. Union of SKUs with
// production/dispatch activity AND SKUs with open orders. All weights in MT:
//   inventory = produced − dispatched                       (producedPool.availableWeight)
//   booked    = Σ over open order lines of max(0, ordered − shipped-for-that-line)
//               (open = Order Status not Delivered/Cancelled/Rejected; shipped is matched
//                per order line via orderLineId, so already-delivered demand doesn't subtract
//                from a *different* SKU's still-open orders)
//   free      = inventory − booked                          (negative ⇒ over-committed, red)
// Rows are sorted negative-free first (most-negative on top), then by SKU code. ──
export function skuBookingRows(productions, dispatches, orders, skus) {
  const pool = producedPool(productions, dispatches)
  const shipped = shippedByOrderLine(dispatches)
  const bookedBySku = {}
  const descByCode = {}
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const code = String(o.mmId || '').trim()
    if (!code) return
    if (!descByCode[code]) descByCode[code] = o.description || ''
    if (!isOpenOrderStatus(o.orderStatus)) return
    const lineShipped = shipped[String(o.lineId || '').trim()] || 0
    bookedBySku[code] = (bookedBySku[code] || 0) + Math.max(0, Number(o.quantity || 0) - lineShipped)
  })
  const codes = new Set([...Object.keys(pool), ...Object.keys(bookedBySku)])
  const rows = [...codes].filter(Boolean).map(code => {
    const inventory = pool[code]?.availableWeight || 0
    const booked = bookedBySku[code] || 0
    const sku = (skus || []).find(s => s.skuCode === code)
    return {
      skuCode: code,
      description: sku?.description || descByCode[code] || code,
      inventory, reserved: booked, free: inventory - booked,
    }
  })
  rows.sort((a, b) => (a.free < 0) !== (b.free < 0)
    ? (a.free < 0 ? -1 : 1)
    : (a.free < 0 ? a.free - b.free : a.skuCode.localeCompare(b.skuCode)))
  return rows
}

// ── SKU-wise inventory table (dashboard). Per SKU, all MT:
//   totalOrders      = Σ ordered quantity over non-deleted, non-cancelled order lines
//   totalInvoiced    = Σ dispatched (= invoiced) weight                (producedPool.dispatchedWeight)
//   pendingToInvoice = max(0, totalOrders − totalInvoiced)             (ordered but not yet invoiced)
//   inventory        = produced − invoiced                            (producedPool.availableWeight)
//   free             = inventory − pendingToInvoice                    (negative ⇒ over-committed, red)
// Union of stocked ∪ ordered SKUs; negative-free first, then by SKU code. ──
export function skuInventoryRows(productions, dispatches, orders, skus) {
  const pool = producedPool(productions, dispatches)
  const orderedBySku = {}, descByCode = {}
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const code = String(o.mmId || '').trim(); if (!code) return
    if (!descByCode[code]) descByCode[code] = o.description || ''
    if (/cancel|reject/i.test(o.orderStatus || '')) return
    orderedBySku[code] = (orderedBySku[code] || 0) + Number(o.quantity || 0)
  })
  const codes = new Set([...Object.keys(pool), ...Object.keys(orderedBySku)])
  const rows = [...codes].filter(Boolean).map(code => {
    const totalInvoiced = pool[code]?.dispatchedWeight || 0
    const inventory = pool[code]?.availableWeight || 0
    const totalOrders = orderedBySku[code] || 0
    const pendingToInvoice = Math.max(0, totalOrders - totalInvoiced)
    const sku = (skus || []).find(s => s.skuCode === code)
    return {
      skuCode: code, description: sku?.description || descByCode[code] || code,
      totalOrders, totalInvoiced, pendingToInvoice, inventory, free: inventory - pendingToInvoice,
    }
  })
  rows.sort((a, b) => (a.free < 0) !== (b.free < 0)
    ? (a.free < 0 ? -1 : 1)
    : (a.free < 0 ? a.free - b.free : a.skuCode.localeCompare(b.skuCode)))
  return rows
}

// ── Per-customer fulfilment (orders ↔ dispatch joined by Distributor Name). All MT:
// ordered = Σ ordered (all order lines), shipped = Σ dispatched, outstanding = ordered − shipped.
// Sorted by outstanding desc. ──
export function customerFulfilment(orders, dispatches) {
  const out = {}
  const ensure = (c) => (out[c] = out[c] || { customer: c, ordered: 0, shipped: 0, openOrders: 0 })
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const e = ensure(String(o.customer || '').trim() || '—')
    e.ordered += Number(o.quantity || 0)
    if (isOpenOrderStatus(o.orderStatus)) e.openOrders += 1
  })
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    ensure(String(be.customer || '').trim() || '—').shipped += Number(be.weight || 0)
  })
  return Object.values(out)
    .map(e => ({ ...e, outstanding: e.ordered - e.shipped }))
    .sort((a, b) => b.outstanding - a.outstanding)
}

// ── Open order backlog — one row per still-open order line, netted by its own per-line
// shipped (orderLineId). Only lines with open > 0 are returned, oldest expected-delivery first. ──
export function orderBacklog(orders, dispatches) {
  const shipped = shippedByOrderLine(dispatches)
  return (orders || [])
    .filter(o => !o.deleted && isOpenOrderStatus(o.orderStatus))
    .map(o => {
      const ordered = Number(o.quantity || 0)
      const ship = shipped[String(o.lineId || '').trim()] || 0
      const open = Math.max(0, ordered - ship)
      return {
        orderId: o.orderId || o.childOrderId || '', customer: o.customer || '',
        skuCode: o.mmId || '', description: o.description || o.mmId || '',
        ordered, shipped: ship, open,
        fulfilmentPct: ordered > 0 ? (ship / ordered) * 100 : 0,
        orderStatus: o.orderStatus || '', expectedDeliveryDate: o.expectedDeliveryDate || '',
      }
    })
    .filter(r => r.open > 0)
    .sort((a, b) => String(a.expectedDeliveryDate).localeCompare(String(b.expectedDeliveryDate)))
}

// ── Per-SKU demand vs supply: ordered (all order lines) · produced · shipped · inventory
// (produced − shipped) · booked (open, per-line) · free. Union of SKUs seen in any pipeline.
// Sorted negative-free first, then by SKU code. ──
export function skuDemandSupply(productions, dispatches, orders, skus) {
  const booking = skuBookingRows(productions, dispatches, orders, skus) // inventory, reserved(=booked), free, description
  const byCode = Object.fromEntries(booking.map(r => [r.skuCode, r]))
  const sumBy = (rows, keyFn, valFn) => {
    const m = {}
    ;(rows || []).forEach(r => { const k = keyFn(r); if (k) m[k] = (m[k] || 0) + valFn(r) })
    return m
  }
  const ordered = sumBy((orders || []).filter(o => !o.deleted), o => String(o.mmId || '').trim(), o => Number(o.quantity || 0))
  const produced = sumBy((productions || []).filter(p => !p.deleted), p => String(p.skuCode || '').trim(), p => Number(p.totalWeight || 0))
  const shipped = sumBy((dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []), e => String(e.skuCode || '').trim(), e => Number(e.weight || 0))
  const codes = new Set([...booking.map(r => r.skuCode), ...Object.keys(ordered)])
  return [...codes].filter(Boolean).map(code => {
    const b = byCode[code] || { inventory: 0, reserved: 0, free: 0, description: null }
    const sku = (skus || []).find(s => s.skuCode === code)
    return {
      skuCode: code, description: b.description || sku?.description || code,
      ordered: ordered[code] || 0, produced: produced[code] || 0, shipped: shipped[code] || 0,
      inventory: b.inventory, booked: b.reserved, free: b.free,
    }
  }).sort((a, b) => (a.free < 0) !== (b.free < 0)
    ? (a.free < 0 ? -1 : 1)
    : (a.free < 0 ? a.free - b.free : a.skuCode.localeCompare(b.skuCode)))
}

// ── Per-distributor sales matrix (Sales dashboard). Joins the Orders upload (demand) and the
// Dispatch upload (invoiced shipments) by Distributor Name, with a nested per-SKU breakdown for
// drill-down. Customers are unioned from BOTH orders and dispatches, so a customer shipped
// against a now-closed order still appears (pending goes negative). All weights in MT:
//   validOrders = Σ quantity of open-status order lines (isOpenOrderStatus)
//   dispatched  = Σ dispatch bundleEntries weight
//   pending     = validOrders − dispatched   (simple subtraction; negative ⇒ over-shipped)
// inventory/free are looked up from invByCode (a skuCode → skuDemandSupply row map the caller
// builds from UNFILTERED data, so they stay live snapshots). Distributor-level inventory/free is
// the Σ of the global pool over that customer's open-ordered SKUs — a SHARED pool that overlaps
// across customers, so callers must NOT total those two columns. Per-SKU rows carry the exact
// global value. Sorted by pending desc at both levels; rows carry `id` for DataTable/drill-down. ──
export function distributorSalesRows(orders, dispatches, invByCode = {}) {
  const key = (c) => String(c || '').trim() || '—'
  const map = {}
  const cust = (c) => (map[c] = map[c] || { id: c, customer: c, validOrders: 0, dispatched: 0, openOrders: 0, _sku: {} })
  const sku = (c, code) => (c._sku[code] = c._sku[code] || { id: code, skuCode: code, description: '', validOrders: 0, dispatched: 0 })

  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const c = cust(key(o.customer))
    if (!isOpenOrderStatus(o.orderStatus)) return
    const code = String(o.mmId || '').trim()
    const q = Number(o.quantity || 0)
    c.validOrders += q
    c.openOrders += 1
    if (code) { const s = sku(c, code); s.validOrders += q; if (!s.description) s.description = o.description || '' }
  })
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const c = cust(key(be.customer))
    const code = String(be.skuCode || '').trim()
    const w = Number(be.weight || 0)
    c.dispatched += w
    if (code) sku(c, code).dispatched += w
  })

  return Object.values(map).map(c => {
    const skuRows = Object.values(c._sku).map(s => {
      const inv = invByCode[s.skuCode] || {}
      return {
        id: s.id, skuCode: s.skuCode,
        description: inv.description || s.description || s.skuCode,
        validOrders: s.validOrders, dispatched: s.dispatched,
        pending: s.validOrders - s.dispatched,
        inventory: Number(inv.inventory || 0), free: Number(inv.free || 0),
      }
    }).sort((a, b) => b.pending - a.pending)
    const orderedCodes = Object.values(c._sku).filter(s => s.validOrders > 0).map(s => s.skuCode)
    const inventory = orderedCodes.reduce((t, code) => t + Number(invByCode[code]?.inventory || 0), 0)
    const free = orderedCodes.reduce((t, code) => t + Number(invByCode[code]?.free || 0), 0)
    const { _sku, ...rest } = c
    return { ...rest, pending: c.validOrders - c.dispatched, inventory, free, skuRows }
  }).sort((a, b) => b.pending - a.pending)
}

// ── Inherit a dispatch entry's coil attribution from production FIFO. Maps `pieces` of an
// SKU onto that SKU's production coilAllocations (oldest production first), skipping pieces
// already taken by other (non-deleted) dispatches of the SKU. Carries BOTH babyCoilId and
// the mother hrCoilId through, so cost reconciliation (mother rate) and the Coil Tracker
// keep working. Returns [{babyCoilId, hrCoilId, pieces, weight}]. ──
export function dispatchCoilTrace(skuCode, pieces, productions, dispatches, excludeDispatchId = null) {
  const need = Math.max(0, Math.floor(Number(pieces || 0)))
  const ledger = []
  ;(productions || []).filter(p => !p.deleted && p.skuCode === skuCode)
    .sort((a, b) => String(a.dateOfProduction || '').localeCompare(String(b.dateOfProduction || '')))
    .forEach(p => (p.coilAllocations || []).forEach(a =>
      ledger.push({ babyCoilId: a.babyCoilId, hrCoilId: a.hrCoilId, pieces: Number(a.pieces || 0), weight: Number(a.weight || 0) })))

  // Consume pieces already taken by other (non-deleted) dispatch entries of this SKU off the head.
  const alreadyDispatched = (dispatches || [])
    .filter(d => !d.deleted && d.id !== excludeDispatchId)
    .flatMap(d => d.bundleEntries || [])
    .filter(e => e.skuCode === skuCode)
    .reduce((s, e) => s + Number(e.pieces || 0), 0)
  const drain = (qty, sink) => {
    let q = qty
    while (q > 0 && ledger.length) {
      const head = ledger[0]
      const wpp = head.pieces ? head.weight / head.pieces : 0
      const take = Math.min(q, head.pieces)
      if (sink) sink.push({ babyCoilId: head.babyCoilId, hrCoilId: head.hrCoilId, pieces: take, weight: take * wpp })
      head.pieces -= take; head.weight -= take * wpp; q -= take
      if (head.pieces <= 0) ledger.shift()
    }
    return q
  }
  drain(alreadyDispatched, null)
  const out = []
  drain(need, out)
  return out
}

// ── Dispatch invoice reconciliation. One row per (dispatch × invoice × SKU). A truck
// may carry several invoices (entry-level invoiceNo, falling back to the dispatch-level
// one for legacy records). Cost rate = mother-coil costPrice/actualWeight (₹/MT),
// weight-weighted over each entry's coilAllocations (a bundle may span multiple coils);
// legacy entries fall back to a single traceHrCoilId. Unresolved coils contribute 0
// (graceful degrade). total = (costPrice/MT + ladder/MT) × quantityMT. ──
export function buildReconciliationRows(dispatches, coils, skus) {
  const rows = []
  dispatches.filter(d => !d.deleted).forEach(d => {
    const groups = {}
    ;(d.bundleEntries || []).forEach(e => {
      const invoiceNo = e.invoiceNo || d.invoiceNo || ''
      const skuCode = e.skuCode || '—'
      const key = invoiceNo + ' ' + skuCode
      ;(groups[key] = groups[key] || { invoiceNo, skuCode, entries: [] }).entries.push(e)
    })
    Object.values(groups).forEach(({ invoiceNo, skuCode, entries }) => {
      const quantityMT = entries.reduce((s, e) => s + Number(e.weight || 0), 0)
      const motherSet = new Set()
      let costNum = 0, costDen = 0 // separate denominator so unresolved coils don't dilute toward 0
      entries.forEach(e => {
        const allocs = Array.isArray(e.coilAllocations) && e.coilAllocations.length
          ? e.coilAllocations
          : [{ hrCoilId: e.traceHrCoilId, weight: e.weight }]
        allocs.forEach(a => {
          const coil = coils.find(c => c.hrCoilId === a.hrCoilId)
          if (coil?.hrCoilId) motherSet.add(coil.hrCoilId)
          const aw = Number(coil?.actualWeight || 0)
          if (coil && aw > 0) {
            const rate = Number(coil.costPrice || 0) / aw // ₹ per MT
            costNum += Number(a.weight || 0) * rate
            costDen += Number(a.weight || 0)
          }
        })
      })
      const costPricePerMT = costDen > 0 ? costNum / costDen : 0
      const sku = skus.find(s => s.skuCode === skuCode)
      const conversionPerMT = Number(sku?.baseConversion || 0)
      const ladderPerMT = Number(sku?.ladderPrice || 0)
      const totalCost = (costPricePerMT + ladderPerMT) * quantityMT
      rows.push({
        dateOfDispatch: d.dateOfDispatch || '',
        invoiceNo,
        customer: entries[0]?.customer || d.customer || '',
        sku: sku?.description || skuCode,
        grade: entries[0]?.grade || '',
        quantityMT, motherCoil: [...motherSet].join('; '),
        costPricePerMT, conversionPerMT, ladderPerMT, totalCost,
      })
    })
  })
  return rows
}

// ── Weight/pieces of a record (bundle or dispatch entry) attributed to a given coil.
// Prefers coilAllocations[]; falls back to a single (fallbackCoilId) match for legacy rows. ──
function allocFor(rec, hrCoilId, fallbackCoilId, fallbackWeight, fallbackPieces) {
  if (Array.isArray(rec.coilAllocations) && rec.coilAllocations.length) {
    return rec.coilAllocations.filter(a => a.hrCoilId === hrCoilId).reduce(
      (s, a) => ({ weight: s.weight + Number(a.weight || 0), pieces: s.pieces + Number(a.pieces || 0) }),
      { weight: 0, pieces: 0 })
  }
  return fallbackCoilId === hrCoilId
    ? { weight: Number(fallbackWeight || 0), pieces: Number(fallbackPieces || 0) }
    : { weight: 0, pieces: 0 }
}

// ── Coil Tracker per-coil inventory row (Inward → Produced → Dispatched). Bundle Formation
// was removed; dispatch draws straight from production. Pure: filters !deleted internally.
// Production is the coil consumption point; produced/dispatched attribute to the MOTHER
// coil via coilAllocations[] (production rows carry the mother hrCoilId; dispatch rows fall
// back to traceHrCoilId for legacy entries). ──
export function coilInventoryRow(coil, dispatches, productions = []) {
  const coilWt = Number(coil.actualWeight || 0)

  let producedPcs = 0, producedWt = 0
  ;(productions || []).filter(p => !p.deleted).forEach(p =>
    (p.coilAllocations || []).filter(a => a.hrCoilId === coil.hrCoilId).forEach(a => {
      producedPcs += Number(a.pieces || 0); producedWt += Number(a.weight || 0)
    }))

  let dispatchedPcs = 0, dispatchedWt = 0
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const a = allocFor(be, coil.hrCoilId, be.traceHrCoilId, be.weight, be.pieces)
    dispatchedPcs += a.pieces; dispatchedWt += a.weight
  })

  return {
    hrCoilId: coil.hrCoilId, grade: coil.coilGrade,
    coilWt, producedPcs, producedWt, dispatchedPcs, dispatchedWt,
    balanceToProduce: coilWt - producedWt,
    producedInvWt: producedWt - dispatchedWt,
    producedInvPcs: producedPcs - dispatchedPcs,
  }
}

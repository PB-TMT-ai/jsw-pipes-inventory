// ═══════════════════════════════════════════════════════════════
// CALC — pure helpers & business logic extracted from App.jsx for testability.
// No React, no DOM, no Supabase imports here. Keep these functions side-effect free.
// ═══════════════════════════════════════════════════════════════

// ── Formatting ──
export const fmtT = (v) => v != null ? Number(v).toFixed(1) : '—'
// Full-precision tonnage (3 decimals) — used for raw coil-stage records (Coil Inward, Slitting)
// where operators need exact entered/derived weights, not the dashboard's 1-decimal rounding.
export const fmtT3 = (v) => v != null ? Number(v).toFixed(3) : '—'
export const fmtPct = (v) => v != null ? Number(v).toFixed(1) + '%' : '—'
export const fmtINR = (v) => v != null && !isNaN(v) ? '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'

// ── Short distributor code = first N words of the name, uppercased. Used for compact
// display in the Sales views (the full name is kept in CSV exports). Blank / '—' pass
// through unchanged, so the existing blank-distributor bucket label is preserved. ──
export function distributorCode(name, words = 2) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return parts.length ? parts.slice(0, words).join(' ').toUpperCase() : ''
}

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

// ── Bundle weight-per-piece from the chosen SKU (kg → tonnes). Explicitly guards NaN/negative: a
// truthy-but-non-numeric weightPerTube (bad Excel/DB value) must resolve to 0, not NaN, so it can't
// poison totalWeight or render "NaN" downstream. ──
export const weightPerPieceFromSku = (sku) => {
  const n = Number(sku?.weightPerTube)
  return Number.isFinite(n) && n > 0 ? n / 1000 : 0
}

// ── Recompute each production's weight LIVE from the current SKU master, so a value frozen onto the
// record at save-time (0 when the SKU had no weight yet, or was created later) is never displayed
// stale. Rewrites weightPerPiece, totalWeight AND every coilAllocations[].weight (so Coil Tracker /
// baby-coil "% used" is correct too) — but ONLY when the SKU resolves to a POSITIVE weight, so an
// unknown / unpublished / weightless SKU (wpp of 0 or NaN) leaves the stored values untouched and
// never zeroes a previously-good row. Also re-derives a blank mother `hrCoilId` from the baby coil
// (when babyCoils is supplied) so per-mother coil rollups don't silently drop the allocation. On a
// duplicate skuCode in the master, the POSITIVE-weight row wins (a weightless twin never shadows a
// good one). Pure + non-destructive: nothing is written back. ──
export function resolveProductionWeights(productions, skus, babyCoils) {
  const byCode = new Map()
  ;(skus || []).forEach(s => {
    const cur = byCode.get(s.skuCode)
    if (!cur || (!weightPerPieceFromSku(cur) && weightPerPieceFromSku(s))) byCode.set(s.skuCode, s)
  })
  const motherOf = new Map((babyCoils || []).map(b => [b.babyCoilId, b.hrCoilId]))
  return (productions || []).map(p => {
    const wpp = weightPerPieceFromSku(byCode.get(p.skuCode))
    if (!(wpp > 0)) return p
    const coilAllocations = (p.coilAllocations || []).map(a => ({
      ...a,
      hrCoilId: a.hrCoilId || motherOf.get(a.babyCoilId) || a.hrCoilId,
      weight: Number(a.pieces || 0) * wpp,
    }))
    return { ...p, weightPerPiece: wpp, totalWeight: wpp * Number(p.tubeCount || 0), coilAllocations }
  })
}

// ── Strip (blank) width a tube needs, in mm — the slit width a baby coil must have to
// roll-form this SKU. Pure geometry (a perimeter), NO density constants: SHS/RHS use the
// outer perimeter 2×(height+breadth) (e.g. 25×25 → 100 mm); CHS uses π×outsideDiameter.
// Returns 0 when the dimensions aren't known, in which case the caller skips the width
// filter (degrades to thickness-only, as before). Used by the Production stage to suggest
// coils whose slit width is within ±WIDTH_TOL_MM of this value. ──
export const WIDTH_TOL_MM = 5
export function requiredStripWidth(sku) {
  if (!sku) return 0
  const type = String(sku.productType || '').toUpperCase()
  const od = Number(sku.outsideDiameter || 0)
  if (type === 'CHS' || od > 0) return od > 0 ? Math.PI * od : 0
  const h = Number(sku.height || 0), b = Number(sku.breadth || 0)
  return h > 0 && b > 0 ? 2 * (h + b) : 0
}

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

// Absolute thickness eligibility band (mm) used by the Production stage — a baby coil
// is eligible for an SKU when |coil thickness − SKU thickness| ≤ THICKNESS_TOL_MM.
export const THICKNESS_TOL_MM = 0.3

// ── FIFO mother-coil allocation (Production stage). Allocates a produced quantity
// across eligible mother coils: oldest dateOfInward first, eligible only when the
// coil thickness matches the SKU thickness — within ±thickTolMm (absolute mm) when
// provided, else within ±tol of the SKU thickness (relative). Fills each coil to its
// nominal actualWeight (oldest first); only if pieces still remain does it stretch
// coils into the ±tol over-fill band (pass 2). Allocates whole PIECES (no fractional
// tubes); weight per allocation = pieces × weightPerPiece. Never exceeds 105% of any
// coil — leftover pieces are reported as a shortfall (caller decides whether to block).
// NOTE: `tol` governs the weight over-fill band (and overTolerance) — keep it separate
// from the thickness band, which is controlled by `thickTolMm`. ──
export function coilFifoAllocate({ coils, consumedByCoil = {}, skuThickness, weightPerPiece, pieces, tol = 0.05, thickTolMm = null, softFill = 1 }) {
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
      Math.abs(Number(c.thickness) - st) <= (thickTolMm != null ? thickTolMm : tol * st))
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
// `keyOf` (default identity) maps a raw skuCode to the canonical join identity so produced and
// dispatched net by physical pipe, not by an exact code string. Callers that pass
// `skuKeyResolver(skus)` get canonical netting; existing callers (and tests) keep raw-code behavior.
export function producedPool(productions, dispatches, excludeDispatchId = null, keyOf = (c) => c) {
  const out = {}
  const ensure = (sku) => (out[sku] = out[sku] ||
    { producedPieces: 0, producedWeight: 0, dispatchedPieces: 0, dispatchedWeight: 0 })
  ;(productions || []).filter(p => !p.deleted).forEach(p => {
    const e = ensure(keyOf(p.skuCode))
    e.producedPieces += Number(p.tubeCount || 0)
    e.producedWeight += Number(p.totalWeight || 0)
  })
  ;(dispatches || []).filter(d => !d.deleted && d.id !== excludeDispatchId)
    .flatMap(d => d.bundleEntries || []).forEach(be => {
      const e = ensure(keyOf(be.skuCode))
      e.dispatchedPieces += Number(be.pieces || 0)
      e.dispatchedWeight += Number(be.weight || 0)
    })
  Object.values(out).forEach(e => {
    e.availablePieces = e.producedPieces - e.dispatchedPieces
    e.availableWeight = e.producedWeight - e.dispatchedWeight
  })
  return out
}

// ── FIFO stock ageing per canonical SKU. On-hand = produced − dispatched (same netting as
// producedPool); dispatches drain the OLDEST production first (first produced, first out — the
// same oldest-first order as dispatchCoilTrace), so the tonnes still in stock are the most-recent
// batches. Each surviving batch is aged `asOf − dateOfProduction`; we return the tonnage-weighted
// average (and oldest) age. Draining is by WEIGHT so the surviving weight equals producedPool's
// availableWeight — i.e. it ties exactly to the "Inventory (T)" column. `keyOf` should be the same
// skuKeyResolver used by the caller so ageing joins to the same rows. `asOf` is 'YYYY-MM-DD'.
// Returns { [key]: { onhandWeight, avgAgeDays, oldestAgeDays } } (only keys with positive stock). ──
export function skuAgeing(productions, dispatches, keyOf = (c) => c, asOf = new Date().toISOString().slice(0, 10)) {
  const dayOf = (iso) => Math.floor(Date.parse(String(iso)) / 86400000)
  const asOfDay = dayOf(asOf)
  // Total dispatched WEIGHT per key (matches producedPool's dispatchedWeight netting).
  const dispByKey = {}
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(e => {
    const k = keyOf(e.skuCode)
    dispByKey[k] = (dispByKey[k] || 0) + Number(e.weight || 0)
  })
  // Production layers per key, tagged with date + weight.
  const layersByKey = {}
  ;(productions || []).filter(p => !p.deleted).forEach(p => {
    const k = keyOf(p.skuCode)
    ;(layersByKey[k] = layersByKey[k] || []).push({ date: p.dateOfProduction, weight: Number(p.totalWeight || 0) })
  })
  const out = {}
  for (const k of Object.keys(layersByKey)) {
    const layers = layersByKey[k].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    let drain = dispByKey[k] || 0, onhand = 0, ageWt = 0, oldest = null
    for (const L of layers) {
      let surv = L.weight
      if (drain > 0) { const take = Math.min(drain, L.weight); surv -= take; drain -= take }   // FIFO: oldest shipped first
      if (surv <= 1e-9) continue
      const d = dayOf(L.date)
      const age = Number.isFinite(d) ? asOfDay - d : 0
      onhand += surv; ageWt += surv * age
      if (oldest == null || age > oldest) oldest = age
    }
    if (onhand > 1e-9) out[k] = { onhandWeight: onhand, avgAgeDays: ageWt / onhand, oldestAgeDays: oldest }
  }
  return out
}

// ── Customer-order booking (FG Booked / Free FG). An order line is "open" (still committed
// against inventory) when its Order Status is not a terminal one. Delivered/Cancelled/Rejected
// (and blank) are excluded — delivered demand is already reflected in dispatched FG. ──
export const isOpenOrderStatus = (status) => {
  const s = String(status || '').trim().toLowerCase()
  return s !== '' && !['delivered', 'cancelled', 'canceled', 'rejected'].includes(s)
}

// ── A line's Confirmed / Non-confirmed stop counting toward "Pending to Dispatch" once the
// order is Delivered (closed) — a delivered order can still carry a non-confirmed remainder
// (ordered qty never released) that must NOT show as pending. Only 'Delivered' is treated as
// closed here (deliberately narrower than isOpenOrderStatus): Cancelled/Rejected are already
// netted to ~0 inside nonConfirmed, and blank stays counted. ──
export const isDeliveredStatus = (status) =>
  String(status || '').trim().toLowerCase() === 'delivered'

// ── Derived order-line stage for the Orders table badge. The raw ERP "Order Status" overloads
// "Confirmed" (an order-lifecycle state) against the Confirmed/Non-confirmed (MT) quantity buckets,
// so a freshly-accepted order shows Status=Confirmed with ALL its volume in Non-confirmed. This
// derives ONE stage from the row's own numbers so the badge always agrees with the columns.
// Cancelled/Rejected are preserved verbatim (the quantity math nets them to ~0, so the stage can't
// be re-derived). `invoiced` = orderLineInvoiced(order, shippedByOrderLine(dispatches)). ──
export function orderLineStage(order, invoiced = 0) {
  const st = String(order?.orderStatus || '').trim().toLowerCase()
  if (['cancelled', 'canceled', 'rejected'].includes(st)) return order.orderStatus   // preserve ERP terminal
  const qty = Number(order?.quantity || 0)
  const inv = Number(invoiced || 0)
  if (qty > 0 && inv >= qty * 0.95) return 'Delivered'              // fully invoiced (±5%)
  if (inv > 0) return 'Partially invoiced'                          // some shipped
  if (Number(order?.confirmed || 0) > 0) return 'Confirmed'         // released, pending dispatch
  if (Number(order?.nonConfirmed || 0) > 0) return 'Non-confirmed'  // ordered, not yet released
  if (qty > inv) return 'Pending'
  return order?.orderStatus || ''                                   // fallback to raw ERP text
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

// ── Reserved (committed) inventory per SKU, keyed by mmId. An order line reserves stock once
// it has been RELEASED but not yet INVOICED, and only while the order is still active (open
// status — i.e. not Delivered / Cancelled / Rejected / blank-nan, via isOpenOrderStatus).
//   reserved (per line) = max(0, releaseQty − invoicedQty)
// Both quantities are MT, sourced from the ERP Orders upload ("Release Qty" / "Invoiced Qty"). ──
export function reservedBySku(orders, keyOf = (c) => c) {
  const out = {}
  ;(orders || []).filter(o => !o.deleted && isOpenOrderStatus(o.orderStatus)).forEach(o => {
    const code = String(o.mmId || '').trim()
    if (!code) return
    const k = keyOf(code, o.description)   // bridge an ERP code the master lacks via its description
    out[k] = (out[k] || 0) + Math.max(0, Number(o.releaseQty || 0) - Number(o.invoicedQty || 0))
  })
  return out
}

// ── Cross-section size label for SKU filtering. Prefers the SKU master fields:
//   CHS → "<nominalBore> NB" (e.g. "32 NB"); SHS/RHS → "<height>x<breadth>" (e.g. "150x150").
// Falls back to parsing the description (NB form first, then a WxH section). Returns '' when
// nothing parses. ──
export function skuSizeLabel(sku, desc) {
  if (sku) {
    if (sku.nominalBore) return `${sku.nominalBore} NB`
    if (sku.height && sku.breadth) return `${sku.height}x${sku.breadth}`
  }
  const s = String(desc || '')
  const nb = s.match(/(\d+(?:\.\d+)?)\s*NB/i)
  if (nb) return `${nb[1]} NB`
  const sec = s.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/)
  if (sec) return `${sec[1]}x${sec[2]}`
  return ''
}

// ── Canonical physical-product identity for a SKU. Two SKU master entries that describe the
// SAME tube but differ only in decimal formatting (e.g. "…1.6x6000" vs "…1.60x6000") collapse
// to ONE key, while genuinely different products stay distinct — the IS standard is included so
// IS 1161 vs IS 3601 (or IS 4923) never merge. Accepts a SKU object or a raw description string;
// the same physical product yields the same key from either form. Used to dedupe the SKU master
// and to block creating duplicate SKUs — deliberately NOT used by the inventory netting
// (producedPool keys by real code, which becomes correct once the master is deduped). Returns the
// normalised description as a safe fallback when the structured parts don't parse. ──
export function canonicalSkuKey(skuOrDesc) {
  const isObj = skuOrDesc && typeof skuOrDesc === 'object'
  const desc = String((isObj ? skuOrDesc.description : skuOrDesc) || '')
  const s = desc.toLowerCase().replace(/×/g, 'x')
  const type = String(
    (isObj && skuOrDesc.productType) || (desc.match(/\b(SHS|RHS|CHS|ERW)\b/i)?.[1]) || ''
  ).toUpperCase()
  const std = s.match(/is\s*(\d+)/)?.[1] || ''                 // IS standard (1161 / 3601 / 4923 …)
  const sizeLabel = skuSizeLabel(isObj ? skuOrDesc : null, desc)
  // thickness & length are the last two numbers of the dimension tail ("…x<thickness>x<length>").
  const tail = s.split('black')[1] || s
  const nums = (tail.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite)
  const thickness = isObj && skuOrDesc.thickness !== '' && skuOrDesc.thickness != null
    ? Number(skuOrDesc.thickness)
    : (nums.length >= 2 ? nums[nums.length - 2] : NaN)
  const length = isObj && skuOrDesc.length
    ? Number(skuOrDesc.length)
    : (nums.length >= 1 ? nums[nums.length - 1] : 6000)
  if (!type || !sizeLabel || !Number.isFinite(thickness)) {
    return s.replace(/\s+/g, ' ').trim()                       // fallback: normalised description
  }
  return `${type}|${std}|${sizeLabel}|${thickness.toFixed(2)}|${length || 6000}`.toLowerCase()
}

// ── Build a code → canonical-physical-identity resolver from the SKU master. This is the SINGLE
// join key for netting/lookup: it collapses the same physical pipe carried under different code
// strings (ERP code vs description vs "1.6"/"1.60") into ONE identity, and bridges the two id
// systems (productions/dispatches use `skuCode`; orders use `mmId` == skuCode). Keys are computed
// ONLY from full master OBJECTS — satisfying canonicalSkuKey's invariant (needs productType + size +
// thickness + an IS-token description) — so object-form and description-form always agree.
// The returned resolver is `(code, desc?) => key`:
//   • a code IN the master resolves to that master row's canonical key (byCode wins first, so
//     production/dispatch/tests keep exact-code netting and are never affected by the desc arg);
//   • a code ABSENT from the master falls back to canonicalising the SUPPLIED `desc`, but ONLY when
//     that yields a structured physical key (contains '|'). This is what lets an order/invoice line
//     whose ERP code the SKU catalog doesn't carry yet still collapse onto the same identity as
//     production, instead of stranding on its raw code and showing 0 production — the SKU-master gap
//     that split one tube into a produced row PLUS a phantom "negative-free" order row. An
//     unparsable desc (canonicalSkuKey returns a normalised-desc fallback, no '|') is NOT used as a
//     bridge, so two unrelated lines can never accidentally merge;
//   • otherwise the code keys as ITSELF (raw-string behavior — never wrongly merged).
// Read-time + non-destructive: nothing is stored; callers pass the live `skus`. ──
export function skuKeyResolver(skus) {
  const byCode = new Map((skus || []).map(s => [s.skuCode, canonicalSkuKey(s)]))
  return (code, desc = '') => {
    const hit = byCode.get(code)
    if (hit) return hit
    if (desc) { const k = canonicalSkuKey(desc); if (k.includes('|')) return k }
    return String(code || '')
  }
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

// ── Invoiced (MT) actually raised against ONE order line. Takes the larger of (a) the live
// invoice/dispatch match by the line's id (orderLineId == orders `lineId` == ERP "Sku ID", via
// `shippedByLine`) and (b) the order sheet's own cumulative `invoicedQty`, so neither a stale
// order snapshot nor a missing dispatch row under-counts. This is the key to netting pending
// PER ORDER LINE: a same-SKU invoice raised against a *different* order can never reduce this
// line's pending (the cross-month / cross-order confusion the SKU-aggregate math caused). ──
export function orderLineInvoiced(order, shippedByLine = {}) {
  const matched = Number(shippedByLine[String(order?.lineId || '').trim()] || 0)
  return Math.max(matched, Number(order?.invoicedQty || 0))
}

// ── Idempotent dispatch de-duplication. Every dispatch LINE gets a stable natural key so the
// importer can skip lines it has already stored (a re-upload of the same/overlapping invoice
// file) AND lines repeated within one upload — the fix for the double-count that drove SKU
// inventory negative. The key is the normalised composite invoiceNo | skuCode | weight. That
// triple is unique per line in the "One Helix" invoice export (one row per invoice × item) and,
// being format-independent, it also matches a line imported earlier from a differently-shaped
// ERP sheet (same invoice + same resolved SKU + same MT) — so it dedups across formats, unlike a
// per-line "Sku ID" that only the ERP file carries. Normalisation collapses whitespace and
// upper-cases the text parts; weight is fixed to 3 dp to kill float noise between two exports of
// the same line. Parts are joined with U+0001 so a value can never straddle the delimiter. ──
const normKeyPart = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
export function dispatchLineKey(line) {
  const inv = normKeyPart(line?.invoiceNo)
  const sku = normKeyPart(line?.skuCode)
  const wt = Number(line?.weight || 0).toFixed(3)
  return `${inv}${sku}${wt}`
}

// ── Split a batch of parsed dispatch LINES into the ones to import vs. the duplicates to skip.
// A line is a duplicate when its key already exists among the NON-deleted dispatch entries
// (scoped to non-deleted so the "soft-delete a record, then re-upload to correct it" workflow
// still works) OR when an earlier line in THIS same batch already carried that key (kills
// within-file duplicates). Returns the lines to import, the skipped duplicate lines, and the set
// of invoice numbers that had at least one line skipped (for the summary banner). Pure. ──
export function dedupeDispatchLines(existingDispatches, parsedLines) {
  const existingKeys = new Set()
  ;(existingDispatches || []).filter(d => !d.deleted)
    .flatMap(d => d.bundleEntries || [])
    .forEach(be => existingKeys.add(dispatchLineKey(be)))
  const seenThisBatch = new Set()
  const toImport = [], skippedDuplicateLines = []
  const skippedInvoices = new Set()
  for (const line of parsedLines || []) {
    const k = dispatchLineKey(line)
    if (existingKeys.has(k) || seenThisBatch.has(k)) {
      skippedDuplicateLines.push(line)
      const inv = String(line?.invoiceNo || '').trim()
      if (inv) skippedInvoices.add(inv)
      continue
    }
    seenThisBatch.add(k)
    toImport.push(line)
  }
  return { toImport, skippedDuplicateLines, skippedInvoices }
}

// ── Normalise any Excel/ERP date value to a `YYYY-MM-DD` string. Shared by every importer
// (dispatch, PO, orders). Handles: a JS Date (from `XLSX.read(..., {cellDates:true})`), a bare
// Excel serial number (date column not date-formatted), and common string forms (ISO,
// DD/MM/YYYY, MM/DD/YYYY). Returns '' for empty/unparseable input.
//
// Date-object timezone fix: for a date-ONLY cell, SheetJS aims for the viewer's LOCAL midnight
// but the serial→date float rounding can land a few seconds SHORT of it — e.g. in IST the June-30
// cell comes back as 2026-06-29T18:29:50Z, which reads as the 29th with BOTH local and UTC getters,
// shifting every date back a day. Snapping the instant to the nearest whole UTC day recovers the
// intended calendar date in any timezone within ±12 h of UTC (all real business zones incl. IST).
export function toISODate(v) {
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date) {
    if (isNaN(v)) return ''
    const d = new Date(Math.round(v.getTime() / 86400000) * 86400000) // snap to nearest UTC day
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  // Bare Excel serial date (insurance for exports whose date column isn't date-formatted).
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000)) // 25569 = 1899-12-30 → 1970-01-01
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const ymdSlash = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymdSlash) {
    const [, y, m, d] = ymdSlash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parts = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (parts) {
    let [, a, b, y] = parts
    if (y.length === 2) y = '20' + y
    const an = Number(a), bn = Number(b)
    let d, m
    if (an > 12) { d = a; m = b }          // unambiguous DD/MM/YYYY
    else if (bn > 12) { d = b; m = a }     // unambiguous MM/DD/YYYY
    else { d = a; m = b }                  // ambiguous — default to DD/MM/YYYY (IN)
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Last resort: let the JS engine parse it, then snap to nearest UTC day (same TZ fix as above).
  const d = new Date(s)
  if (isNaN(d)) return ''
  const snapped = new Date(Math.round(d.getTime() / 86400000) * 86400000)
  return `${snapped.getUTCFullYear()}-${String(snapped.getUTCMonth() + 1).padStart(2, '0')}-${String(snapped.getUTCDate()).padStart(2, '0')}`
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
//   production       = Σ produced weight                              (producedPool.producedWeight, all-time)
//   totalOrders      = Σ ordered quantity over non-deleted, non-cancelled order lines
//   totalInvoiced    = Σ dispatched (= invoiced) weight                (period-scoped by dispatch date)
//                      → the "Invoiced (this period)" flow: ALL shipments this month for the SKU,
//                        whatever order they belong to.
//   invoicedVsOrders = Σ min(ordered, invoiced-against-that-line) over these order lines
//                      → how much of THESE orders has actually been invoiced (period-proof, per line).
//   pendingDispatch  = Σ (confirmed + nonConfirmed) over that SKU's NON-delivered orders — the SAME
//                      "Pending to Dispatch" as the Dashboard / Sales cards (salesKpis); Delivered lines
//                      excluded (cancellations are already netted inside nonConfirmed). Blank-mmId orders are
//                      bucketed under a "(Unmapped)" row so this total ties out to the Dashboard card.
//   reserved         = Σ max(0, releaseQty − invoicedQty) over open order lines (reservedBySku, all-time)
//   inventory        = produced − invoiced                            (producedPool.availableWeight, all-time)
//   free             = inventory − reserved                           (negative ⇒ over-committed, red)
// Optional `inRange(dateStr)` scopes the order-driven figures (by orderDate) and totalInvoiced (by
// dispatch date) to a period; production / reserved / inventory / free stay the live all-time snapshot.
// Per-line invoiced (`orderLineInvoiced`) is matched against ALL dispatches (cumulative), so prior-period
// invoicing is still counted. Union of stocked ∪ ordered ∪ invoiced SKUs; negative-free first, then SKU code. ──
export function skuInventoryRows(productions, dispatches, orders, skus, inRange = null, asOf = new Date().toISOString().slice(0, 10)) {
  const pass = inRange || (() => true)
  const keyOf = skuKeyResolver(skus)                 // canonical physical identity — the single join key
  const pool = producedPool(productions, dispatches, null, keyOf) // all-time, netted by identity
  const ageing = skuAgeing(productions, dispatches, keyOf, asOf)  // FIFO stock age, all-time + same key ⇒ ties to inventory
  const reserved = reservedBySku(orders, keyOf)      // live (all orders), by identity
  const shipped = shippedByOrderLine(dispatches)     // cumulative invoiced per order line (all dispatches)
  const invoicedBySku = {}                            // period-scoped dispatch flow ("Invoiced this period")
  ;(dispatches || []).filter(d => !d.deleted && pass(d.dateOfDispatch))
    .flatMap(d => d.bundleEntries || []).forEach(be => {
      const code = String(be.skuCode || '').trim(); if (!code) return
      const k = keyOf(code)
      invoicedBySku[k] = (invoicedBySku[k] || 0) + Number(be.weight || 0)
    })
  // Order-driven accumulations (period-scoped by order date).
  // Pending to Dispatch = Σ(confirmed + nonConfirmed) per SKU over NON-delivered orders —
  // identical to the Dashboard / Sales "Pending to Dispatch" (salesKpis), so this column
  // reconciles with that card. Delivered lines are excluded (a closed order is no longer
  // pending); cancellations are already netted inside nonConfirmed; blank-mmId orders bucket
  // under UNMAPPED so the total still ties out. totalOrders / invoicedVsOrders keep the per-line,
  // non-cancelled accounting (delivered demand still counts as committed) used by the rest of the table.
  const UNMAPPED = '(Unmapped)'
  const orderedBySku = {}, invoicedVsOrdersBySku = {}, pendingBySku = {}, descByKey = {}
  // Description is resolved from ALL orders (period-independent), so a row kept visible by all-time
  // Production/Reserved still shows its tube name instead of falling back to the raw SKU code.
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const code = String(o.mmId || '').trim()
    if (code && o.description) { const k = keyOf(code, o.description); if (!descByKey[k]) descByKey[k] = o.description }
  })
  ;(orders || []).filter(o => !o.deleted && pass(o.orderDate)).forEach(o => {
    const raw = String(o.mmId || '').trim()
    const k = raw ? keyOf(raw, o.description) : UNMAPPED
    if (!isDeliveredStatus(o.orderStatus))
      pendingBySku[k] = (pendingBySku[k] || 0) + salesNum(o.confirmed) + salesNum(o.nonConfirmed)
    if (k === UNMAPPED) return
    if (/cancel|reject/i.test(o.orderStatus || '')) return
    const qty = Number(o.quantity || 0)
    const inv = orderLineInvoiced(o, shipped)
    orderedBySku[k] = (orderedBySku[k] || 0) + qty
    invoicedVsOrdersBySku[k] = (invoicedVsOrdersBySku[k] || 0) + Math.min(qty, inv)
  })
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s]))  // canonical key → representative SKU (for display)
  const keys = new Set([...Object.keys(pool), ...Object.keys(orderedBySku),
    ...Object.keys(invoicedBySku), ...Object.keys(reserved), ...Object.keys(pendingBySku)])
  const rows = [...keys].filter(Boolean).map(k => {
    const totalInvoiced = invoicedBySku[k] || 0
    const invoicedVsOrders = invoicedVsOrdersBySku[k] || 0
    const inventory = pool[k]?.availableWeight || 0
    const production = pool[k]?.producedWeight || 0
    const totalOrders = orderedBySku[k] || 0
    const pendingDispatch = pendingBySku[k] || 0
    const reservedV = reserved[k] || 0
    const sku = skuByKey.get(k)
    const description = k === UNMAPPED
      ? 'Orders with no SKU (MM ID)'
      : (sku?.description || descByKey[k] || k)
    return {
      skuCode: sku?.skuCode || k, description,
      production, totalOrders, totalInvoiced, invoicedVsOrders, pendingDispatch, reserved: reservedV,
      inventory, free: inventory - reservedV,
      ageDays: ageing[k]?.avgAgeDays ?? null, oldestAgeDays: ageing[k]?.oldestAgeDays ?? null,
    }
  })
  rows.sort((a, b) => (a.free < 0) !== (b.free < 0)
    ? (a.free < 0 ? -1 : 1)
    : (a.free < 0 ? a.free - b.free : a.skuCode.localeCompare(b.skuCode)))
  return rows
}

// ── Distributor identity. Free-text distributor names are spelled inconsistently between the
// Orders and Invoice ERP exports, which splits one party into several dashboard rows. Both
// exports carry a stable `Distributor Code`, and every invoice line links to its order (Sku ID /
// Order ID), so we resolve ONE identity per distributor instead of trusting the name text. The
// GROUPING key is resolved as:
//   • dispatch line → its linked order's identity (order code if present, else the order's
//     normalised name) via orderLineId→orderId→childOrderId — so a shipment groups with the
//     order it fulfils regardless of how the invoice spells the party;
//   • else the record's own `distributorCode` (dispatch entries carry it inside bundle_entries);
//   • else the normalised name (internal whitespace collapsed + upper-cased).
// The DISPLAY name stays the real (first non-blank) name seen — only the key is normalised. ──
export const normDistributorName = (name) =>
  String(name || '').replace(/\s+/g, ' ').trim().toUpperCase() || '—'

// Index orders by their link keys → { code, name } for resolving a dispatch line's distributor
// from the order it fulfils (order lineId == dispatch orderLineId; orderId; childOrderId). First
// non-blank wins. `distributorCode` is read when present (future-proof) but orders need not carry it.
export function distributorOrderIndex(orders) {
  const byLine = {}, byOrder = {}, byChild = {}
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const ident = { code: String(o.distributorCode || '').trim(), name: String(o.customer || '').trim() }
    const lid = String(o.lineId || '').trim();       if (lid && !byLine[lid]) byLine[lid] = ident
    const oid = String(o.orderId || '').trim();      if (oid && !byOrder[oid]) byOrder[oid] = ident
    const cid = String(o.childOrderId || '').trim(); if (cid && !byChild[cid]) byChild[cid] = ident
  })
  return { byLine, byOrder, byChild }
}

// Resolve { key, name } for an order or dispatch entry. `idx` = distributorOrderIndex(orders).
// Dispatch entries resolve through the order link FIRST so they always adopt the order's identity
// (keeping orders and their shipments in one group); their own code is only a fallback for
// shipments with no matching order.
export function resolveDistributorIdentity(rec, idx = null, isDispatch = false) {
  const ownCode = String(rec?.distributorCode || '').trim()
  const ownName = String(rec?.customer || '').trim()
  if (isDispatch && idx) {
    const hit = idx.byLine[String(rec?.orderLineId || '').trim()]
      || idx.byOrder[String(rec?.orderId || '').trim()]
      || idx.byChild[String(rec?.childOrderId || '').trim()]
    if (hit) return { key: hit.code || normDistributorName(hit.name), name: hit.name || ownName }
  }
  if (ownCode) return { key: ownCode, name: ownName }
  return { key: normDistributorName(ownName), name: ownName }
}

// ── Per-customer fulfilment (orders ↔ dispatch joined by distributor identity, not raw name). All
// MT: ordered = Σ ordered (all order lines), shipped = Σ dispatched, outstanding = ordered − shipped.
// Sorted by outstanding desc. ──
export function customerFulfilment(orders, dispatches) {
  const idx = distributorOrderIndex(orders)
  const out = {}
  const ensure = (id, name) => {
    const e = out[id] = out[id] || { id, customer: '', ordered: 0, shipped: 0, openOrders: 0 }
    if (name && (!e.customer || e.customer === '—')) e.customer = name
    return e
  }
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const { key, name } = resolveDistributorIdentity(o, idx, false)
    const e = ensure(key, name)
    e.ordered += Number(o.quantity || 0)
    if (isOpenOrderStatus(o.orderStatus)) e.openOrders += 1
  })
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const { key, name } = resolveDistributorIdentity(be, idx, true)
    ensure(key, name).shipped += Number(be.weight || 0)
  })
  return Object.values(out)
    .map(e => ({ ...e, customer: e.customer || '—', outstanding: e.ordered - e.shipped }))
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
  // Reserved (released − invoiced, open orders) and the resulting available stock (inventory −
  // reserved). `available` is the per-SKU "Available (Most Relevant)" surfaced in the Sales breakup.
  const reserved = reservedBySku(orders)
  const codes = new Set([...booking.map(r => r.skuCode), ...Object.keys(ordered)])
  return [...codes].filter(Boolean).map(code => {
    const b = byCode[code] || { inventory: 0, reserved: 0, free: 0, description: null }
    const sku = (skus || []).find(s => s.skuCode === code)
    const reservedV = reserved[code] || 0
    return {
      skuCode: code, description: b.description || sku?.description || code,
      ordered: ordered[code] || 0, produced: produced[code] || 0, shipped: shipped[code] || 0,
      inventory: b.inventory, booked: b.reserved, free: b.free,
      reserved: reservedV, available: b.inventory - reservedV,
    }
  }).sort((a, b) => (a.free < 0) !== (b.free < 0)
    ? (a.free < 0 ? -1 : 1)
    : (a.free < 0 ? a.free - b.free : a.skuCode.localeCompare(b.skuCode)))
}

// ── Per-distributor sales matrix (Sales dashboard). Joins the Orders upload (demand) and the
// Dispatch upload (invoiced shipments) by Distributor Name, with a nested per-SKU breakdown for
// drill-down. Customers are unioned from BOTH orders and dispatches, so a customer shipped
// against a now-closed order still appears (pending goes negative). All weights in MT:
//   validOrders      = Σ quantity of order lines that are NOT cancelled/rejected (Delivered + blank
//                      status included — total committed demand, matching skuInventoryRows.totalOrders)
//   openOrders       = count of order lines still open (isOpenOrderStatus) — stays strict
//   dispatched       = Σ dispatch bundleEntries weight  → "Invoiced (this period)" flow (caller passes
//                      period-filtered dispatches): everything shipped to the customer this period.
//   invoicedVsOrders = Σ min(ordered, invoiced-against-that-line) over the customer's order lines
//   pending          = Σ max(0, ordered − invoiced-against-that-line) over the customer's OPEN order
//                      lines — matched PER ORDER LINE, so a same-SKU invoice for a different order
//                      never hides this one's pending. Always ≥ 0 (a line can't be "negative pending").
// Per-line invoiced (`orderLineInvoiced`) uses `allDispatches` (defaults to `dispatches`) so cumulative
// prior-period invoicing is counted even when `dispatches` is period-filtered for the flow column.
// inventory/free are looked up from invByCode (a skuCode → skuDemandSupply row map the caller builds from
// UNFILTERED data, so they stay live snapshots). Distributor-level inventory/free is the Σ of the global
// pool over that customer's valid-ordered SKUs — a SHARED pool that overlaps across customers, so callers
// must NOT total those two columns. Per-SKU rows carry the exact global value. Sorted by pending desc at
// both levels; rows carry `id` for DataTable/drill-down. ──
export function distributorSalesRows(orders, dispatches, invByCode = {}, allDispatches = null) {
  const shipped = shippedByOrderLine(allDispatches || dispatches)  // cumulative invoiced per order line
  const idx = distributorOrderIndex(orders)                        // resolve shipments to their order's distributor
  const map = {}
  const cust = (id, name) => {
    const c = map[id] = map[id] || { id, customer: '', validOrders: 0, dispatched: 0, invoicedVsOrders: 0, pending: 0, openOrders: 0, _sku: {} }
    if (name && (!c.customer || c.customer === '—')) c.customer = name
    return c
  }
  const sku = (c, code) => (c._sku[code] = c._sku[code] || { id: code, skuCode: code, description: '', validOrders: 0, dispatched: 0, invoicedVsOrders: 0, pending: 0 })

  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const { key, name } = resolveDistributorIdentity(o, idx, false)
    const c = cust(key, name)
    if (/cancel|reject/i.test(o.orderStatus || '')) return  // valid demand = everything except cancelled/rejected
    const code = String(o.mmId || '').trim()
    const q = Number(o.quantity || 0)
    const inv = Math.min(q, orderLineInvoiced(o, shipped))                       // invoiced against THIS line, capped
    const pend = isOpenOrderStatus(o.orderStatus) ? Math.max(0, q - orderLineInvoiced(o, shipped)) : 0
    c.validOrders += q; c.invoicedVsOrders += inv; c.pending += pend
    if (isOpenOrderStatus(o.orderStatus)) c.openOrders += 1  // "Open Orders" stays strictly open
    if (code) {
      const s = sku(c, code)
      s.validOrders += q; s.invoicedVsOrders += inv; s.pending += pend
      if (!s.description) s.description = o.description || ''
    }
  })
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const { key, name } = resolveDistributorIdentity(be, idx, true)
    const c = cust(key, name)
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
        invoicedVsOrders: s.invoicedVsOrders, pending: s.pending,
        inventory: Number(inv.inventory || 0), free: Number(inv.free || 0),
        // Reserved (released − invoiced) and "Available (Most Relevant)" = global free stock for
        // the SKU (inventory − reserved), both inherited from the live invByCode snapshot.
        reserved: Number(inv.reserved || 0), available: Number(inv.available || 0),
      }
    }).sort((a, b) => b.pending - a.pending)
    const orderedCodes = Object.values(c._sku).filter(s => s.validOrders > 0).map(s => s.skuCode)
    const inventory = orderedCodes.reduce((t, code) => t + Number(invByCode[code]?.inventory || 0), 0)
    const free = orderedCodes.reduce((t, code) => t + Number(invByCode[code]?.free || 0), 0)
    const { _sku, ...rest } = c
    return { ...rest, customer: rest.customer || '—', inventory, free, skuRows }
  }).sort((a, b) => b.pending - a.pending)
}

// ═══════════════════════════════════════════════════════════════
// SALES DASHBOARD — Confirmed / Non-confirmed / Invoiced model (all MT).
// The daily One Helix upload feeds Orders → `orders` (each line carries `confirmed` = ERP
// "Release − Invoiced Qty" and `nonConfirmed` = "Ordered − Release Qty" − "total cancelled qty")
// and Invoice → `dispatches` (the single invoice source of truth). So the sales KPIs read
// Confirmed / Non-confirmed off the ORDER book — a carried-forward snapshot, NOT month-scoped —
// counting only NON-delivered lines (a Delivered order is closed, so its leftover confirmed /
// non-confirmed no longer counts as pending), and invoiced tonnage off DISPATCHES:
//   Confirmed           = Σ orders.confirmed       (excluding Delivered lines)
//   Non-confirmed       = Σ orders.nonConfirmed    (excluding Delivered lines)
//   Pending to Dispatch = Confirmed + Non-confirmed
//   MTD Invoice         = Σ dispatch bundleEntries.weight in `month` (YYYY-MM; '' ⇒ all months)
//   Total Orders        = MTD Invoice + Confirmed + Non-confirmed
// ═══════════════════════════════════════════════════════════════
const salesMonthKey = (d) => String(d || '').slice(0, 7)
const salesNum = (v) => { const n = Number(v); return isFinite(n) ? n : 0 }

// Aggregate KPI totals for the sales cards. Used by BOTH the Sales dashboard and the factory
// Dashboard so the two screens can never diverge. `month` ('' = all months) scopes the invoiced
// tonnage only; Confirmed / Non-confirmed are the live order-book snapshot of NON-delivered
// orders — Delivered lines are excluded (a closed order is no longer pending to dispatch).
export function salesKpis(orders, dispatches, month = '') {
  let confirmed = 0, nonConfirmed = 0
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    confirmed += salesNum(o.confirmed)
    nonConfirmed += salesNum(o.nonConfirmed)
  })
  let mtdInvoice = 0
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    if (month && salesMonthKey(d.dateOfDispatch) !== month) return
    ;(d.bundleEntries || []).forEach(be => { mtdInvoice += salesNum(be.weight) })
  })
  return {
    confirmed, nonConfirmed,
    pending: confirmed + nonConfirmed,
    mtdInvoice,
    totalOrders: mtdInvoice + confirmed + nonConfirmed,
  }
}

// Per-distributor sales rows (same five metrics as the KPI cards), grouped by the resolved
// distributor identity so inconsistent name spellings between Orders and Invoice collapse to one
// row (see resolveDistributorIdentity — the "V V shows twice" fix). `month` scopes only invoiced.
// Each row also carries `skuRows` (the same metrics per MM ID) for the drill-down.
export function salesByDistributor(orders, dispatches, month = '', skus = []) {
  const idx = distributorOrderIndex(orders)
  const keyOf = skuKeyResolver(skus)                                    // canonical identity for the SKU drill-down
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s])) // so an order (mmId) and its invoice merge
  const map = {}
  const row = (key, name) => {
    const r = map[key] = map[key] || { id: key, customer: '', confirmed: 0, nonConfirmed: 0, mtdInvoice: 0, _sku: {} }
    if (name && (!r.customer || r.customer === '—')) r.customer = name
    return r
  }
  const skuOf = (r, code, desc = '') => {
    const k = keyOf(code, desc)   // orders pass their description so an ERP code the master lacks still merges
    return r._sku[k] = r._sku[k] || { id: k, skuCode: skuByKey.get(k)?.skuCode || code, confirmed: 0, nonConfirmed: 0, mtdInvoice: 0 }
  }
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    const { key, name } = resolveDistributorIdentity(o, idx, false)
    const r = row(key, name)
    const c = salesNum(o.confirmed), nc = salesNum(o.nonConfirmed)
    r.confirmed += c; r.nonConfirmed += nc
    const code = String(o.mmId || '').trim()
    if (code) { const s = skuOf(r, code, o.description); s.confirmed += c; s.nonConfirmed += nc }
  })
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    if (month && salesMonthKey(d.dateOfDispatch) !== month) return
    ;(d.bundleEntries || []).forEach(be => {
      const { key, name } = resolveDistributorIdentity(be, idx, true)
      const r = row(key, name)
      const w = salesNum(be.weight)
      r.mtdInvoice += w
      const code = String(be.skuCode || '').trim()
      if (code) skuOf(r, code).mtdInvoice += w
    })
  })
  const finish = (o) => ({ ...o, pending: o.confirmed + o.nonConfirmed, totalOrders: o.mtdInvoice + o.confirmed + o.nonConfirmed })
  return Object.values(map).map(r => {
    const { _sku, ...rest } = r
    const skuRows = Object.values(_sku).map(finish).sort((a, b) => b.totalOrders - a.totalOrders)
    return { ...finish(rest), customer: rest.customer || '—', skuRows }
  }).sort((a, b) => b.totalOrders - a.totalOrders)
}

// Per-month sales rows. Confirmed / Non-confirmed bucket by ORDER month (orderDate); invoiced
// buckets by INVOICE month (dateOfDispatch). Newest month first. Column totals reconcile to the
// all-time Confirmed / Non-confirmed and all-time invoiced for rows with a parseable date (a
// date-less order/invoice — none in the ERP export — has no month bucket and is omitted here).
export function salesByMonth(orders, dispatches) {
  const map = {}
  const row = (m) => (map[m] = map[m] || { month: m, confirmed: 0, nonConfirmed: 0, invoiced: 0 })
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    const m = salesMonthKey(o.orderDate); if (!m) return
    const r = row(m)
    r.confirmed += salesNum(o.confirmed)
    r.nonConfirmed += salesNum(o.nonConfirmed)
  })
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    const m = salesMonthKey(d.dateOfDispatch); if (!m) return
    const r = row(m)
    ;(d.bundleEntries || []).forEach(be => { r.invoiced += salesNum(be.weight) })
  })
  return Object.values(map).map(r => ({
    ...r,
    pending: r.confirmed + r.nonConfirmed,
    totalOrders: r.invoiced + r.confirmed + r.nonConfirmed,
  })).sort((a, b) => (a.month < b.month ? 1 : -1))
}

// ── Inherit a dispatch entry's coil attribution from production FIFO. Maps `pieces` of an
// SKU onto that SKU's production coilAllocations (oldest production first), skipping pieces
// already taken by other (non-deleted) dispatches of the SKU. Carries BOTH babyCoilId and
// the mother hrCoilId through, so cost reconciliation (mother rate) and the Coil Tracker
// keep working. Returns [{babyCoilId, hrCoilId, pieces, weight}]. ──
// `keyOf` (default identity) lets the production↔dispatch match key on the canonical physical
// identity rather than an exact code string — so a dispatch coded differently from its production
// still inherits the right coil trace. Callers pass skuKeyResolver(skus) to enable it.
export function dispatchCoilTrace(skuCode, pieces, productions, dispatches, excludeDispatchId = null, keyOf = (c) => c) {
  const need = Math.max(0, Math.floor(Number(pieces || 0)))
  const wantKey = keyOf(skuCode)
  const ledger = []
  ;(productions || []).filter(p => !p.deleted && keyOf(p.skuCode) === wantKey)
    .sort((a, b) => String(a.dateOfProduction || '').localeCompare(String(b.dateOfProduction || '')))
    .forEach(p => (p.coilAllocations || []).forEach(a =>
      ledger.push({ babyCoilId: a.babyCoilId, hrCoilId: a.hrCoilId, pieces: Number(a.pieces || 0), weight: Number(a.weight || 0) })))

  // Consume pieces already taken by other (non-deleted) dispatch entries of this SKU off the head.
  const alreadyDispatched = (dispatches || [])
    .filter(d => !d.deleted && d.id !== excludeDispatchId)
    .flatMap(d => d.bundleEntries || [])
    .filter(e => keyOf(e.skuCode) === wantKey)
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
// one for legacy records). Coil cost was removed — the row carries the resolved Mother
// Coil trace plus the SKU's conversion/ladder rates (Rs/MT). `coils` resolves the mother-
// coil set from each entry's coilAllocations; legacy entries fall back to traceHrCoilId. --
export function buildReconciliationRows(dispatches, coils, skus) {
  const rows = []
  const keyOf = skuKeyResolver(skus)                                    // resolve the SKU by canonical identity
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s])) // so a variant code still finds its master
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
      entries.forEach(e => {
        const allocs = Array.isArray(e.coilAllocations) && e.coilAllocations.length
          ? e.coilAllocations
          : [{ hrCoilId: e.traceHrCoilId, weight: e.weight }]
        allocs.forEach(a => {
          const coil = coils.find(c => c.hrCoilId === a.hrCoilId)
          if (coil?.hrCoilId) motherSet.add(coil.hrCoilId)
        })
      })
      const sku = skuByKey.get(keyOf(skuCode)) || skus.find(s => s.skuCode === skuCode)
      const conversionPerMT = Number(sku?.baseConversion || 0)
      const ladderPerMT = Number(sku?.ladderPrice || 0)
      rows.push({
        dateOfDispatch: d.dateOfDispatch || '',
        invoiceNo,
        customer: entries[0]?.customer || d.customer || '',
        sku: sku?.description || skuCode,
        grade: entries[0]?.grade || '',
        quantityMT, motherCoil: [...motherSet].join('; '),
        conversionPerMT, ladderPerMT,
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

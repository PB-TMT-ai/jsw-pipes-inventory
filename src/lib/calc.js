// ═══════════════════════════════════════════════════════════════
// CALC — pure helpers & business logic extracted from App.jsx for testability.
// No React, no DOM, no Supabase imports here. Keep these functions side-effect free.
// ═══════════════════════════════════════════════════════════════

// ── Formatting ──
export const fmtT = (v) => v != null ? Number(v).toFixed(3) : '—'
export const fmtPct = (v) => v != null ? Number(v).toFixed(1) + '%' : '—'
export const fmtINR = (v) => v != null && !isNaN(v) ? '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'

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
        sku: sku?.description || skuCode,
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

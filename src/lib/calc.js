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

// ── Dispatch invoice reconciliation. One row per (dispatch × invoice × SKU). Cost
// rate = mother-coil costPrice/actualWeight (₹/MT), weight-weighted over the entries
// whose mother coil resolves; unresolved coils contribute 0 (legacy graceful degrade).
// total = (costPrice/MT + ladder/MT) × quantityMT. ──
export function buildReconciliationRows(dispatches, coils, skus) {
  const rows = []
  dispatches.filter(d => !d.deleted).forEach(d => {
    const bySku = {}
    ;(d.bundleEntries || []).forEach(e => {
      const k = e.skuCode || '—'
      ;(bySku[k] = bySku[k] || []).push(e)
    })
    Object.entries(bySku).forEach(([skuCode, entries]) => {
      const quantityMT = entries.reduce((s, e) => s + Number(e.weight || 0), 0)
      const motherSet = new Set()
      let costNum = 0, costDen = 0 // separate denominator so unresolved coils don't dilute toward 0
      entries.forEach(e => {
        const coil = coils.find(c => c.hrCoilId === e.traceHrCoilId)
        if (coil?.hrCoilId) motherSet.add(coil.hrCoilId)
        const aw = Number(coil?.actualWeight || 0)
        if (coil && aw > 0) {
          const rate = Number(coil.costPrice || 0) / aw // ₹ per MT
          costNum += Number(e.weight || 0) * rate
          costDen += Number(e.weight || 0)
        }
      })
      const costPricePerMT = costDen > 0 ? costNum / costDen : 0
      const sku = skus.find(s => s.skuCode === skuCode)
      const conversionPerMT = Number(sku?.baseConversion || 0)
      const ladderPerMT = Number(sku?.ladderPrice || 0)
      const totalCost = (costPricePerMT + ladderPerMT) * quantityMT
      rows.push({
        dateOfDispatch: d.dateOfDispatch || '',
        invoiceNo: d.invoiceNo || '',
        sku: sku?.description || skuCode,
        quantityMT, motherCoil: [...motherSet].join('; '),
        costPricePerMT, conversionPerMT, ladderPerMT, totalCost,
      })
    })
  })
  return rows
}

// ── Coil Tracker per-coil inventory row (Inward → Bundled → Dispatched). Pure:
// filters !deleted internally so it can be fed raw arrays. ──
export function coilInventoryRow(coil, bundles, dispatches) {
  const coilBundles = bundles.filter(b => !b.deleted && b.hrCoilId === coil.hrCoilId)
  const coilWt = Number(coil.actualWeight || 0)
  const bundledPcs = coilBundles.reduce((s, b) => s + Number(b.tubeCount || 0), 0)
  const bundledWt = coilBundles.reduce((s, b) => s + Number(b.totalWeight || 0), 0)
  const dispEntries = dispatches.filter(d => !d.deleted)
    .flatMap(d => (d.bundleEntries || []))
    .filter(be => be.traceHrCoilId === coil.hrCoilId)
  const dispatchedPcs = dispEntries.reduce((s, be) => s + Number(be.pieces || 0), 0)
  const dispatchedWt = dispEntries.reduce((s, be) => s + Number(be.weight || 0), 0)

  return {
    hrCoilId: coil.hrCoilId, grade: coil.coilGrade,
    coilWt, bundledPcs, bundledWt, dispatchedPcs, dispatchedWt,
    balanceToBundle: coilWt - bundledWt,
    bundledInvWt: bundledWt - dispatchedWt,
    bundledInvPcs: bundledPcs - dispatchedPcs,
  }
}

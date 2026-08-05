import { describe, it, expect } from 'vitest'
import {
  fmtT, fmtT3, fmtPct, fmtINR, genHRCoilId, tolerance, periodRange, inDateRange,
  weightPerPieceFromSku, resolveProductionWeights, bundleWeightCap, buildReconciliationRows, coilInventoryRow,
  coilFifoAllocate, coilConsumption, producedPool, unmatchedDispatch, skuAgeing, dispatchCoilTrace, THICKNESS_TOL_MM,
  isOpenOrderStatus, isDeliveredStatus, orderLineStage, openOrderQtyBySku, shippedByOrderLine, orderLineInvoiced, skuBookingRows,
  customerFulfilment, orderBacklog, skuDemandSupply, skuInventoryRows, distributorSalesRows,
  reservedBySku, skuSizeLabel, canonicalSkuKey, skuKeyResolver, skuImportResolver, requiredStripWidth, WIDTH_TOL_MM,
  distributorCode, normDistributorName, distributorOrderIndex, resolveDistributorIdentity,
  dispatchLineKey, dedupeDispatchLines, toISODate,
  salesKpis, salesByDistributor, salesByMonth,
  estimateNum, distributorEstimateIndex, plantBestEstimate,
  MILL_RATE_TPH, SHIFT_HOURS, FAMILY_FLOOR_MT, GAUGE_FLOOR_MT, mtToHours, hoursToMt,
  familyKey, familyKeyResolver, campaignWorkingDays, campaignHourBudget, campaignFeasibleMt,
  prevMonth, gaugeLabel, campaignSuggestion, gaugeReconciliation,
  campaignWorkingDaysElapsed, campaignProgress, campaignUnplanned, campaignDecomposition,
  campaignGaugeColumns, gaugeIdentity, unresolvedGauges, effectiveTargetMt, hasTypedTarget,
} from './calc'

describe('format helpers', () => {
  it('fmtT renders 1 decimal, em-dash for null/undefined', () => {
    expect(fmtT(1.5)).toBe('1.5')
    expect(fmtT(0)).toBe('0.0')
    expect(fmtT(7.295)).toBe('7.3')
    expect(fmtT(null)).toBe('—')
    expect(fmtT(undefined)).toBe('—')
  })

  it('fmtT3 renders 3 decimals, em-dash for null/undefined', () => {
    expect(fmtT3(1.5)).toBe('1.500')
    expect(fmtT3(0)).toBe('0.000')
    expect(fmtT3(7.295)).toBe('7.295')
    expect(fmtT3(null)).toBe('—')
    expect(fmtT3(undefined)).toBe('—')
  })

  it('fmtPct renders 1 decimal + %, em-dash for null', () => {
    expect(fmtPct(95.25)).toBe('95.3%')
    expect(fmtPct(null)).toBe('—')
  })

  it('fmtINR renders ₹ + grouped integer, em-dash for null/NaN', () => {
    expect(fmtINR(1234567)).toBe('₹12,34,567') // en-IN grouping
    expect(fmtINR(null)).toBe('—')
    expect(fmtINR(NaN)).toBe('—')
  })
})

describe('periodRange', () => {
  const today = '2026-06-23'
  it('all → open range', () => {
    expect(periodRange('all', { today })).toEqual({ from: '', to: '' })
  })
  it('7d → last 7 days inclusive of today', () => {
    expect(periodRange('7d', { today })).toEqual({ from: '2026-06-17', to: '' })
  })
  it('mtd → first of current month, open end', () => {
    expect(periodRange('mtd', { today })).toEqual({ from: '2026-06-01', to: '' })
  })
  it('month → full calendar month (last day correct)', () => {
    expect(periodRange('month', { today, monthSel: '2026-05' })).toEqual({ from: '2026-05-01', to: '2026-05-31' })
    expect(periodRange('month', { today, monthSel: '2026-02' })).toEqual({ from: '2026-02-01', to: '2026-02-28' })
    expect(periodRange('month', { today, monthSel: '2024-02' })).toEqual({ from: '2024-02-01', to: '2024-02-29' }) // leap
  })
  it('custom → passes through from/to', () => {
    expect(periodRange('custom', { today, customFrom: '2026-01-10', customTo: '2026-03-04' }))
      .toEqual({ from: '2026-01-10', to: '2026-03-04' })
  })
})

describe('inDateRange', () => {
  it('open range matches everything (incl. only-from / only-to)', () => {
    expect(inDateRange('2026-06-01', { from: '', to: '' })).toBe(true)
    expect(inDateRange('2026-06-01', { from: '2026-06-01', to: '' })).toBe(true)
    expect(inDateRange('2026-05-31', { from: '2026-06-01', to: '' })).toBe(false)
    expect(inDateRange('2026-06-30', { from: '', to: '2026-06-30' })).toBe(true)
    expect(inDateRange('2026-07-01', { from: '', to: '2026-06-30' })).toBe(false)
  })
  it('bounded range is inclusive; empty date never matches a bounded range', () => {
    const r = { from: '2026-06-01', to: '2026-06-30' }
    expect(inDateRange('2026-06-15', r)).toBe(true)
    expect(inDateRange('2026-06-01', r)).toBe(true)
    expect(inDateRange('2026-06-30', r)).toBe(true)
    expect(inDateRange('2026-05-31', r)).toBe(false)
    expect(inDateRange('', r)).toBe(false)
  })
})

describe('genHRCoilId', () => {
  it('formats HYD-MMYY-NN with zero-padded month and number', () => {
    expect(genHRCoilId('2026-06-15', 3)).toBe('HYD-0626-03')
    expect(genHRCoilId('2026-12-01', 12)).toBe('HYD-1226-12')
  })
})

describe('tolerance', () => {
  it('passes within ±5%', () => {
    expect(tolerance(100, 100).ok).toBe(true)
    expect(tolerance(104, 100).ok).toBe(true)
    expect(tolerance(96, 100).ok).toBe(true)
  })

  it('fails outside ±5%', () => {
    expect(tolerance(106, 100).ok).toBe(false)
    expect(tolerance(94, 100).ok).toBe(false)
  })

  it('returns ok:true when an argument is falsy (documented quirk)', () => {
    expect(tolerance(0, 100).ok).toBe(true)
    expect(tolerance(100, 0).ok).toBe(true)
  })
})

describe('weightPerPieceFromSku', () => {
  it('converts kg → tonnes', () => {
    expect(weightPerPieceFromSku({ weightPerTube: 12.5 })).toBe(0.0125)
  })
  it('returns 0 when weightPerTube missing or sku undefined', () => {
    expect(weightPerPieceFromSku({})).toBe(0)
    expect(weightPerPieceFromSku(undefined)).toBe(0)
  })
})

describe('resolveProductionWeights', () => {
  const sku = { skuCode: 'C-40NB', weightPerTube: 24.5 }
  it('heals a frozen-zero record from the current SKU master (header + allocation weights)', () => {
    const frozen = { id: 'p1', skuCode: 'C-40NB', tubeCount: 100, weightPerPiece: 0, totalWeight: 0,
      coilAllocations: [{ babyCoilId: 'B-A', hrCoilId: 'M-1', pieces: 60, weight: 0 },
                        { babyCoilId: 'B-B', hrCoilId: 'M-1', pieces: 40, weight: 0 }] }
    const [r] = resolveProductionWeights([frozen], [sku])
    expect(r.weightPerPiece).toBe(0.0245)
    expect(r.totalWeight).toBeCloseTo(2.45, 10)
    expect(r.coilAllocations.map(a => a.weight)).toEqual([1.47, 0.98])
    expect(r.coilAllocations[0].babyCoilId).toBe('B-A') // other fields preserved
  })
  it('reflects a CHANGED master weight (SKU master is the source of truth)', () => {
    const rec = { skuCode: 'C-40NB', tubeCount: 10, weightPerPiece: 0.026, totalWeight: 0.26, coilAllocations: [] }
    const [r] = resolveProductionWeights([rec], [{ skuCode: 'C-40NB', weightPerTube: 24.5 }])
    expect(r.weightPerPiece).toBe(0.0245)
    expect(r.totalWeight).toBeCloseTo(0.245, 10)
  })
  it('leaves a record untouched when the SKU cannot be resolved (unknown / unpublished code)', () => {
    const rec = { skuCode: 'GHOST', tubeCount: 100, weightPerPiece: 0, totalWeight: 0, coilAllocations: [{ pieces: 100, weight: 0 }] }
    const [r] = resolveProductionWeights([rec], [sku])
    expect(r).toBe(rec) // same reference — passthrough, never zeroed or cloned
  })
  it('leaves a record untouched when the matched SKU has null/zero weight (never invents weight)', () => {
    const rec = { skuCode: 'C-40NB', tubeCount: 100, weightPerPiece: 0, totalWeight: 0, coilAllocations: [] }
    expect(resolveProductionWeights([rec], [{ skuCode: 'C-40NB', weightPerTube: null }])[0]).toBe(rec)
    expect(resolveProductionWeights([rec], [{ skuCode: 'C-40NB', weightPerTube: 0 }])[0]).toBe(rec)
    expect(resolveProductionWeights([rec], [{ skuCode: 'C-40NB', weightPerTube: '' }])[0]).toBe(rec)
  })
  it('does not choke on a non-numeric master weight (NaN never > 0 → passthrough)', () => {
    const rec = { skuCode: 'C-40NB', tubeCount: 100, weightPerPiece: 5, totalWeight: 500, coilAllocations: [] }
    expect(resolveProductionWeights([rec], [{ skuCode: 'C-40NB', weightPerTube: 'oops' }])[0]).toBe(rec)
  })
  it('re-derives a blank mother hrCoilId from the baby coil (keeps per-mother rollups whole)', () => {
    const rec = { skuCode: 'C-40NB', tubeCount: 50, coilAllocations: [{ babyCoilId: 'B-A', hrCoilId: '', pieces: 50, weight: 0 }] }
    const [r] = resolveProductionWeights([rec], [sku], [{ babyCoilId: 'B-A', hrCoilId: 'M-9' }])
    expect(r.coilAllocations[0].hrCoilId).toBe('M-9')
    expect(r.coilAllocations[0].weight).toBeCloseTo(1.225, 10)
    // an existing mother id is preserved, and it works with no babyCoils arg
    const [r2] = resolveProductionWeights([{ ...rec, coilAllocations: [{ babyCoilId: 'B-A', hrCoilId: 'M-1', pieces: 50 }] }], [sku])
    expect(r2.coilAllocations[0].hrCoilId).toBe('M-1')
  })
  it('prefers the positive-weight row when the master has a duplicate skuCode (order-independent)', () => {
    const rec = { skuCode: 'DUP', tubeCount: 10, coilAllocations: [] }
    const masters = [{ skuCode: 'DUP', weightPerTube: 0 }, { skuCode: 'DUP', weightPerTube: 20 }]
    expect(resolveProductionWeights([rec], masters)[0].weightPerPiece).toBe(0.02)
    expect(resolveProductionWeights([rec], [...masters].reverse())[0].weightPerPiece).toBe(0.02)
  })
  it('handles empty / null inputs and missing allocations', () => {
    expect(resolveProductionWeights([], [])).toEqual([])
    expect(resolveProductionWeights(null, null)).toEqual([])
    const [r] = resolveProductionWeights([{ skuCode: 'C-40NB', tubeCount: 5 }], [sku])
    expect(r.totalWeight).toBeCloseTo(0.1225, 10)
    expect(r.coilAllocations).toEqual([])
  })
})

describe('requiredStripWidth', () => {
  it('SHS/RHS → 2×(height+breadth)', () => {
    expect(requiredStripWidth({ productType: 'SHS', height: 25, breadth: 25 })).toBe(100)
    expect(requiredStripWidth({ productType: 'RHS', height: 100, breadth: 50 })).toBe(300)
  })
  it('CHS → π×outsideDiameter (string OD tolerated)', () => {
    expect(requiredStripWidth({ productType: 'CHS', outsideDiameter: '42.4' })).toBeCloseTo(Math.PI * 42.4, 6)
  })
  it('returns 0 when dimensions are unknown (caller then skips the width filter)', () => {
    expect(requiredStripWidth({ productType: 'SHS' })).toBe(0)
    expect(requiredStripWidth({ productType: 'CHS' })).toBe(0)
    expect(requiredStripWidth(null)).toBe(0)
  })
  it('exposes a ±5 mm tolerance constant', () => {
    expect(WIDTH_TOL_MM).toBe(5)
  })
})

describe('bundleWeightCap', () => {
  const base = { coilWeight: 10, allocatedWeight: 0, weightPerPiece: 0.001 } // 0.001 T/pc

  it('under coil weight: neither flag set', () => {
    const r = bundleWeightCap({ ...base, pieces: 5000 }) // 5 T
    expect(r.prospectiveWeight).toBeCloseTo(5)
    expect(r.overFilled).toBe(false)
    expect(r.overTolerance).toBe(false)
    expect(r.remainingWeight).toBeCloseTo(5)
  })

  it('between 100% and 105%: overTolerance only (warning, still saveable)', () => {
    const r = bundleWeightCap({ ...base, pieces: 10300 }) // 10.3 T, ceiling 10.5
    expect(r.overTolerance).toBe(true)
    expect(r.overFilled).toBe(false)
  })

  it('above 105%: overFilled (blocks save)', () => {
    const r = bundleWeightCap({ ...base, pieces: 10600 }) // 10.6 T > 10.5
    expect(r.overFilled).toBe(true)
    expect(r.overTolerance).toBe(false)
  })

  it('accounts for already-allocated weight in maxPieces', () => {
    const r = bundleWeightCap({ ...base, allocatedWeight: 6, pieces: 0 })
    // ceiling 10.5 − 6 already = 4.5 T remaining / 0.001 = 4500 pcs
    expect(r.maxPieces).toBe(4500)
  })

  it('zero-weight coil never allows bundling (guards tolerance() quirk)', () => {
    const r = bundleWeightCap({ coilWeight: 0, allocatedWeight: 0, weightPerPiece: 0.001, pieces: 9999 })
    expect(r.overFilled).toBe(false)
    expect(r.overTolerance).toBe(false)
    expect(r.maxPieces).toBe(0)
  })
})

describe('buildReconciliationRows', () => {
  const coils = [
    { hrCoilId: 'HYD-0626-01', actualWeight: 10, costPrice: 500000 }, // 50,000 ₹/MT
    { hrCoilId: 'HYD-0626-02', actualWeight: 20, costPrice: 800000 }, // 40,000 ₹/MT
  ]
  const skus = [
    { skuCode: 'SHS-50', description: 'SHS 50x50', baseConversion: 2900, ladderPrice: 3000 },
  ]

  it('groups by SKU and carries conversion/ladder rates + mother coil trace', () => {
    const dispatches = [{
      deleted: false, dateOfDispatch: '2026-06-10', invoiceNo: 'INV-1',
      bundleEntries: [
        { skuCode: 'SHS-50', weight: 4, traceHrCoilId: 'HYD-0626-01' },
        { skuCode: 'SHS-50', weight: 6, traceHrCoilId: 'HYD-0626-02' },
      ],
    }]
    const rows = buildReconciliationRows(dispatches, coils, skus)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.quantityMT).toBe(10)
    expect(r.motherCoil).toBe('HYD-0626-01; HYD-0626-02')
    expect(r.conversionPerMT).toBe(2900)
    expect(r.ladderPerMT).toBe(3000)
    // coil cost was removed — no cost columns on the row
    expect(r.costPricePerMT).toBeUndefined()
    expect(r.totalCost).toBeUndefined()
  })

  it('emits one row per SKU within a dispatch', () => {
    const dispatches = [{
      deleted: false, dateOfDispatch: '2026-06-10', invoiceNo: 'INV-2',
      bundleEntries: [
        { skuCode: 'SHS-50', weight: 2, traceHrCoilId: 'HYD-0626-01' },
        { skuCode: 'RHS-99', weight: 3, traceHrCoilId: 'HYD-0626-01' },
      ],
    }]
    const rows = buildReconciliationRows(dispatches, coils, skus)
    expect(rows).toHaveLength(2)
  })

  it('legacy/unresolved coil yields blank mother coil (no crash)', () => {
    const dispatches = [{
      deleted: false, dateOfDispatch: '2026-05-01', invoiceNo: 'OLD-1',
      bundleEntries: [
        { skuCode: 'SHS-50', weight: 5, traceBabyCoilId: 'HYD-0626-01-A' }, // pre-refactor key, no traceHrCoilId
      ],
    }]
    const rows = buildReconciliationRows(dispatches, coils, skus)
    expect(rows).toHaveLength(1)
    expect(rows[0].motherCoil).toBe('')
    expect(rows[0].quantityMT).toBe(5)
    expect(rows[0].ladderPerMT).toBe(3000)
  })

  it('skips soft-deleted dispatches', () => {
    const dispatches = [{ deleted: true, bundleEntries: [{ skuCode: 'SHS-50', weight: 1, traceHrCoilId: 'HYD-0626-01' }] }]
    expect(buildReconciliationRows(dispatches, coils, skus)).toHaveLength(0)
  })
})

describe('coilFifoAllocate', () => {
  // Two coils, same thickness (2.5), oldest first by dateOfInward. 1 T/pc.
  const coils = [
    { hrCoilId: 'C2', dateOfInward: '2026-06-05', thickness: 2.5, actualWeight: 5 },
    { hrCoilId: 'C1', dateOfInward: '2026-06-01', thickness: 2.5, actualWeight: 3 },
    { hrCoilId: 'CX', dateOfInward: '2026-06-02', thickness: 4.0, actualWeight: 99 }, // wrong thickness
  ]
  const base = { coils, skuThickness: 2.5, weightPerPiece: 1 }

  it('allocates entirely to the oldest coil when it fits', () => {
    const r = coilFifoAllocate({ ...base, pieces: 3 })
    expect(r.allocations).toEqual([{ hrCoilId: 'C1', pieces: 3, weight: 3, overTolerance: false }])
    expect(r.fullyAllocated).toBe(true)
    expect(r.shortfall).toBe(false)
  })

  it('splits across coils oldest-first when the first is exhausted', () => {
    const r = coilFifoAllocate({ ...base, pieces: 5 }) // 3 → C1, 2 → C2
    expect(r.allocations.map(a => [a.hrCoilId, a.pieces])).toEqual([['C1', 3], ['C2', 2]])
    expect(r.fullyAllocated).toBe(true)
    expect(r.overTolerance).toBe(false)
  })

  it('ignores coils outside ±5% thickness', () => {
    const r = coilFifoAllocate({ ...base, pieces: 8 }) // only C1(3)+C2(5)=8 eligible, CX excluded
    expect(r.allocatedPieces).toBe(8)
    expect(r.allocations.some(a => a.hrCoilId === 'CX')).toBe(false)
  })

  it('uses the ±5% over-fill band only when nominal capacity is exhausted', () => {
    // total nominal = 8; request 8.2 (rounds to 8 pcs at 1 T/pc)… use finer pieces:
    const fine = { coils, skuThickness: 2.5, weightPerPiece: 0.1 }
    // nominal 8 T = 80 pcs; ceiling adds 5% → C1 3.15, C2 5.25 ⇒ +4 pcs headroom
    const r = coilFifoAllocate({ ...fine, pieces: 83 })
    expect(r.allocatedPieces).toBe(83)
    expect(r.fullyAllocated).toBe(true)
    expect(r.overTolerance).toBe(true) // tail coil stretched past 100%
  })

  it('reports shortfall beyond the ±5% ceiling without blocking', () => {
    const r = coilFifoAllocate({ ...base, pieces: 100 })
    expect(r.shortfall).toBe(true)
    expect(r.allocatedPieces).toBeLessThan(100)
    expect(r.allocatedPieces).toBeGreaterThan(0)
  })

  it('flags noEligibleCoil when nothing matches the thickness', () => {
    const r = coilFifoAllocate({ coils, skuThickness: 10, weightPerPiece: 1, pieces: 1 })
    expect(r.noEligibleCoil).toBe(true)
    expect(r.allocations).toHaveLength(0)
  })

  it('subtracts prior consumption (consumedByCoil) before allocating', () => {
    const r = coilFifoAllocate({ ...base, pieces: 3, consumedByCoil: { C1: 3 } }) // C1 full → spill to C2
    expect(r.allocations.map(a => a.hrCoilId)).toEqual(['C2'])
  })

  it('never allocates into a zero-weight coil (guards tolerance() quirk)', () => {
    const zero = [{ hrCoilId: 'Z', dateOfInward: '2026-06-01', thickness: 2.5, actualWeight: 0 }]
    const r = coilFifoAllocate({ coils: zero, skuThickness: 2.5, weightPerPiece: 1, pieces: 10 })
    expect(r.allocations).toHaveLength(0)
    expect(r.noEligibleCoil).toBe(true)
  })

  it('softFill advances to the next coil at 97% before topping up', () => {
    // C1 cap 3T, 97% = 2.91 ⇒ only 2 pcs fit in pass 1; the 3rd would reach 100%.
    const r = coilFifoAllocate({ ...base, pieces: 5, softFill: 0.97 })
    expect(r.allocations.map(a => [a.hrCoilId, a.pieces])).toEqual([['C1', 2], ['C2', 3]])
    expect(r.fullyAllocated).toBe(true)
    expect(r.overTolerance).toBe(false)
  })

  it('softFill tops coils up to 100% once the 97% band is exhausted', () => {
    const r = coilFifoAllocate({ ...base, pieces: 8, softFill: 0.97 })
    expect(r.allocations.map(a => [a.hrCoilId, a.pieces])).toEqual([['C1', 3], ['C2', 5]])
    expect(r.fullyAllocated).toBe(true)
    expect(r.overTolerance).toBe(false) // exactly 100%, not over
  })

  it('default softFill=1 keeps the classic fill-to-nominal split', () => {
    const r = coilFifoAllocate({ ...base, pieces: 5 })
    expect(r.allocations.map(a => [a.hrCoilId, a.pieces])).toEqual([['C1', 3], ['C2', 2]])
  })

  it('thickTolMm applies an absolute (mm) thickness band instead of relative tol', () => {
    // 2.7 is outside ±5% of 2.5 (2.375–2.625) but inside ±0.3 mm (2.2–2.8).
    const c = [{ hrCoilId: 'B1', dateOfInward: '2026-06-01', thickness: 2.7, actualWeight: 5 }]
    const abs = coilFifoAllocate({ coils: c, skuThickness: 2.5, weightPerPiece: 1, pieces: 2, thickTolMm: 0.3 })
    expect(abs.allocations.map(a => a.hrCoilId)).toEqual(['B1'])
    // Omitting thickTolMm falls back to the relative ±5% band → excluded.
    const rel = coilFifoAllocate({ coils: c, skuThickness: 2.5, weightPerPiece: 1, pieces: 2 })
    expect(rel.noEligibleCoil).toBe(true)
  })

  it('thickTolMm excludes coils beyond the absolute band', () => {
    // 2.9 is outside ±0.3 mm of 2.5 (2.2–2.8).
    const c = [{ hrCoilId: 'B1', dateOfInward: '2026-06-01', thickness: 2.9, actualWeight: 5 }]
    const r = coilFifoAllocate({ coils: c, skuThickness: 2.5, weightPerPiece: 1, pieces: 2, thickTolMm: 0.3 })
    expect(r.noEligibleCoil).toBe(true)
  })

  it('exports THICKNESS_TOL_MM = 0.3 (Production absolute thickness band)', () => {
    expect(THICKNESS_TOL_MM).toBe(0.3)
  })
})

describe('coilConsumption', () => {
  const productions = [
    { deleted: false, coilAllocations: [{ hrCoilId: 'C1', pieces: 3, weight: 3 }, { hrCoilId: 'C2', pieces: 2, weight: 2 }] },
    { id: 'P2', deleted: false, coilAllocations: [{ hrCoilId: 'C1', pieces: 1, weight: 1 }] },
    { deleted: true, coilAllocations: [{ hrCoilId: 'C1', pieces: 99, weight: 99 }] }, // ignored
  ]
  it('sums weight & pieces per coil over non-deleted productions', () => {
    expect(coilConsumption(productions)).toEqual({ C1: { weight: 4, pieces: 4 }, C2: { weight: 2, pieces: 2 } })
  })
  it('excludes the edited production when excludeId given', () => {
    expect(coilConsumption(productions, 'P2')).toEqual({ C1: { weight: 3, pieces: 3 }, C2: { weight: 2, pieces: 2 } })
  })
  it('keys by babyCoilId when requested, skipping legacy mother-only allocations', () => {
    const prods = [
      { deleted: false, coilAllocations: [{ babyCoilId: 'C1-A', hrCoilId: 'C1', pieces: 3, weight: 3 }] },
      { deleted: false, coilAllocations: [{ hrCoilId: 'C1', pieces: 2, weight: 2 }] }, // legacy, no babyCoilId
    ]
    expect(coilConsumption(prods, null, 'babyCoilId')).toEqual({ 'C1-A': { weight: 3, pieces: 3 } })
  })
})

describe('producedPool', () => {
  const productions = [{ deleted: false, skuCode: 'A', tubeCount: 100, totalWeight: 5 }]
  const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', pieces: 30, weight: 1.5 }] }]
  it('computes available = produced − dispatched per SKU', () => {
    const p = producedPool(productions, dispatches)
    expect(p.A.availablePieces).toBe(70)
    expect(p.A.availableWeight).toBeCloseTo(3.5)
  })
})

describe('unmatchedDispatch', () => {
  it('is zero when every SKU has production behind its dispatch', () => {
    const pool = producedPool(
      [{ skuCode: 'A', tubeCount: 100, totalWeight: 5 }],
      [{ bundleEntries: [{ skuCode: 'A', pieces: 30, weight: 1.5 }] }])
    expect(unmatchedDispatch(pool)).toEqual({ weight: 0, pieces: 0, skus: 0 })
  })

  it('returns the magnitude of over-dispatch, counting only the negative SKUs', () => {
    const pool = producedPool(
      [{ skuCode: 'A', tubeCount: 100, totalWeight: 5 }, { skuCode: 'B', tubeCount: 10, totalWeight: 1 }],
      [{ bundleEntries: [{ skuCode: 'A', pieces: 30, weight: 1.5 }, { skuCode: 'B', pieces: 25, weight: 3 }] }])
    const u = unmatchedDispatch(pool)
    expect(u.weight).toBeCloseTo(2)   // B: 3 shipped − 1 produced; A is positive and ignored
    expect(u.pieces).toBe(15)         // B: 25 − 10
    expect(u.skus).toBe(1)
  })

  it('closes the identity: Σ floored on-hand − unmatched === Σ produced − Σ dispatched', () => {
    const productions = [
      { skuCode: 'A', tubeCount: 100, totalWeight: 5 },
      { skuCode: 'B', tubeCount: 10, totalWeight: 1 },
      { skuCode: 'C', tubeCount: 40, totalWeight: 2 },
    ]
    const dispatches = [{ bundleEntries: [
      { skuCode: 'A', pieces: 30, weight: 1.5 },
      { skuCode: 'B', pieces: 25, weight: 3 },     // over-dispatched
      { skuCode: 'C', pieces: 60, weight: 3.25 },  // over-dispatched
    ] }]
    const pool = producedPool(productions, dispatches)
    const floored = Object.values(pool).reduce((t, e) => t + Math.max(0, e.availableWeight), 0)
    const net = Object.values(pool).reduce((t, e) => t + e.availableWeight, 0)
    expect(floored - unmatchedDispatch(pool).weight).toBeCloseTo(net, 9)
  })

  it('tolerates an empty / missing pool', () => {
    expect(unmatchedDispatch({})).toEqual({ weight: 0, pieces: 0, skus: 0 })
    expect(unmatchedDispatch(null)).toEqual({ weight: 0, pieces: 0, skus: 0 })
  })
})

describe('skuKeyResolver + canonical-identity netting (Pillar 1)', () => {
  // Two master rows for the SAME physical pipe carried under different code strings.
  const skus = [
    { skuCode: 'ERP-100', productType: 'RHS', height: 100, breadth: 50, thickness: 1.6, length: 6000,
      description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.6x6000' },
    { skuCode: 'RHS-100x50x1.60', productType: 'RHS', height: 100, breadth: 50, thickness: 1.60, length: 6000,
      description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.60x6000' },
  ]
  it('resolves a code to its master canonical key; an unknown code keys as itself', () => {
    const keyOf = skuKeyResolver(skus)
    expect(keyOf('ERP-100')).toBe(keyOf('RHS-100x50x1.60'))  // same physical pipe → one identity
    expect(keyOf('ghost-code')).toBe('ghost-code')           // unmatched → itself, never wrongly merged
  })
  it('producedPool nets produced (code A) vs dispatched (code B) into ONE bucket', () => {
    const keyOf = skuKeyResolver(skus)
    const productions = [{ deleted: false, skuCode: 'ERP-100', tubeCount: 100, totalWeight: 5 }]
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'RHS-100x50x1.60', pieces: 30, weight: 1.5 }] }]
    const merged = producedPool(productions, dispatches, null, keyOf)
    expect(Object.keys(merged)).toHaveLength(1)              // one physical pipe, one row
    expect(Object.values(merged)[0].availablePieces).toBe(70)
    expect(Object.values(merged)[0].availableWeight).toBeCloseTo(3.5)
    // raw-string netting (default identity) WRONGLY splits the same pipe into two buckets:
    expect(Object.keys(producedPool(productions, dispatches))).toHaveLength(2)
  })
  it('skuInventoryRows merges a production (code A) and an order (mmId = code B) into one row', () => {
    const productions = [{ deleted: false, skuCode: 'ERP-100', tubeCount: 100, totalWeight: 5, dateOfProduction: '2026-06-01' }]
    const orders = [{ deleted: false, mmId: 'RHS-100x50x1.60', orderStatus: 'Confirmed', quantity: 2,
      releaseQty: 2, invoicedQty: 0, confirmed: 2, nonConfirmed: 0, orderDate: '2026-06-01',
      description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.60x6000' }]
    const rows = skuInventoryRows(productions, [], orders, skus)
    expect(rows).toHaveLength(1)                             // NOT two rows for the same pipe
    expect(rows[0].production).toBeCloseTo(5)
    expect(rows[0].reserved).toBeCloseTo(2)                  // order's reserved MT lands on the same row
    expect(rows[0].free).toBeCloseTo(3)                      // 5 − 2
  })
  it('bridges an order whose ERP code is ABSENT from the master onto production via its description', () => {
    const keyOf = skuKeyResolver(skus)
    // 'ghost-erp' is in NO master row, but its description is the same physical pipe as RHS-100x50x1.60:
    expect(keyOf('ghost-erp', 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.6x6000'))
      .toBe(keyOf('RHS-100x50x1.60'))
    // an absent code with an UNPARSABLE description still keys as ITSELF (never wrongly merged):
    expect(keyOf('ghost-erp', 'freight charge')).toBe('ghost-erp')
    // …and a code that IS in the master ignores the desc arg entirely (exact-code netting unchanged):
    expect(keyOf('ERP-100', 'anything at all')).toBe(keyOf('ERP-100'))
  })
  it('skuInventoryRows: an order coded with an ERP number the master lacks lands on the produced row (not a phantom −free split)', () => {
    const productions = [{ deleted: false, skuCode: 'RHS-100x50x1.60', tubeCount: 100, totalWeight: 5, dateOfProduction: '2026-06-01' }]
    // mmId is an ERP code that does NOT exist in `skus`; only its description identifies the pipe:
    const orders = [{ deleted: false, mmId: '1140-13075-99999999', orderStatus: 'Confirmed', quantity: 2,
      releaseQty: 2, invoicedQty: 0, confirmed: 2, nonConfirmed: 0, orderDate: '2026-06-01',
      description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.60x6000' }]
    const rows = skuInventoryRows(productions, [], orders, skus)
    expect(rows).toHaveLength(1)                             // one physical pipe → one row, not two
    expect(rows[0].production).toBeCloseTo(5)                // production shows (was 0 before the fix)
    expect(rows[0].reserved).toBeCloseTo(2)
    expect(rows[0].free).toBeCloseTo(3)                      // 5 − 2, positive (was −2, stranded)
  })
})

describe('dispatchCoilTrace', () => {
  const productions = [
    { deleted: false, skuCode: 'A', dateOfProduction: '2026-06-01', coilAllocations: [{ babyCoilId: 'C1-A', hrCoilId: 'C1', pieces: 3, weight: 3 }, { babyCoilId: 'C2-A', hrCoilId: 'C2', pieces: 2, weight: 2 }] },
  ]
  it('maps a new dispatch onto production FIFO, skipping already-dispatched pieces, carrying baby+mother ids', () => {
    const existing = [{ deleted: false, bundleEntries: [{ skuCode: 'A', pieces: 2 }] }] // first 2 pcs taken from C1
    const trace = dispatchCoilTrace('A', 2, productions, existing) // next 2 pcs → 1 C1, 1 C2
    expect(trace).toEqual([
      { babyCoilId: 'C1-A', hrCoilId: 'C1', pieces: 1, weight: 1 },
      { babyCoilId: 'C2-A', hrCoilId: 'C2', pieces: 1, weight: 1 },
    ])
  })
  it('matches production ↔ dispatch by canonical identity when keyOf is provided (variant codes)', () => {
    const prod = [{ deleted: false, skuCode: 'ERP-A', dateOfProduction: '2026-06-01',
      coilAllocations: [{ babyCoilId: 'C1-A', hrCoilId: 'C1', pieces: 5, weight: 5 }] }]
    const skus = [
      { skuCode: 'ERP-A', productType: 'CHS', nominalBore: '20', thickness: 2, length: 6000, description: 'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2x6000' },
      { skuCode: 'DESC-A', productType: 'CHS', nominalBore: '20', thickness: 2, length: 6000, description: 'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2x6000' },
    ]
    const keyOf = skuKeyResolver(skus)
    // dispatch line coded DESC-A (different string, same pipe) inherits ERP-A's production coils:
    expect(dispatchCoilTrace('DESC-A', 2, prod, [], null, keyOf))
      .toEqual([{ babyCoilId: 'C1-A', hrCoilId: 'C1', pieces: 2, weight: 2 }])
    // without keyOf (raw match) the variant code finds NO production → empty trace:
    expect(dispatchCoilTrace('DESC-A', 2, prod, [])).toEqual([])
  })
})

describe('skuAgeing — FIFO stock ageing (first produced, first out)', () => {
  const keyOf = (c) => c
  it('drains dispatches off the OLDEST production first, then weights surviving ages by weight', () => {
    const productions = [
      { deleted: false, skuCode: 'A', dateOfProduction: '2026-06-01', totalWeight: 6 }, // oldest → aged 30d @ asOf
      { deleted: false, skuCode: 'A', dateOfProduction: '2026-06-21', totalWeight: 4 }, // newer  → aged 10d
    ]
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', weight: 3 }] }] // 3 T drains off the oldest
    const out = skuAgeing(productions, dispatches, keyOf, '2026-07-01')
    // surviving: 3 T @ 30d (2026-06-01) + 4 T @ 10d (2026-06-21) → weighted avg = 130/7 ≈ 18.57
    expect(out.A.onhandWeight).toBeCloseTo(7)                       // = produced(10) − dispatched(3)
    expect(out.A.avgAgeDays).toBeCloseTo((3 * 30 + 4 * 10) / 7)
    expect(out.A.oldestAgeDays).toBe(30)
  })
  it('surviving weight ties exactly to producedPool availableWeight (the Inventory column)', () => {
    const productions = [{ deleted: false, skuCode: 'A', dateOfProduction: '2026-06-01', totalWeight: 10 }]
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', weight: 3 }] }]
    const out = skuAgeing(productions, dispatches, keyOf, '2026-07-01')
    expect(out.A.onhandWeight).toBeCloseTo(producedPool(productions, dispatches).A.availableWeight) // both 7
  })
  it('over-dispatched SKU (dispatched > produced) has 0 on-hand → no ageing entry', () => {
    const productions = [{ deleted: false, skuCode: 'A', dateOfProduction: '2026-06-01', totalWeight: 5 }]
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', weight: 8 }] }]
    expect(skuAgeing(productions, dispatches, keyOf, '2026-07-01').A).toBeUndefined()
  })
  it('skuInventoryRows attaches ageDays (weighted-avg) to each row, honouring asOf', () => {
    const skus = [{ skuCode: 'A', productType: 'SHS', height: 25, breadth: 25, thickness: 2, length: 6000,
      description: 'MS SHS One Helix IS 4923 YSt 210 Black 25x25x2x6000' }]
    const productions = [
      { deleted: false, skuCode: 'A', dateOfProduction: '2026-06-01', tubeCount: 100, totalWeight: 6 },
      { deleted: false, skuCode: 'A', dateOfProduction: '2026-06-21', tubeCount: 100, totalWeight: 4 },
    ]
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', pieces: 50, weight: 3 }] }]
    const [row] = skuInventoryRows(productions, dispatches, [], skus, null, '2026-07-01')
    expect(row.inventory).toBeCloseTo(7)
    expect(row.ageDays).toBeCloseTo((3 * 30 + 4 * 10) / 7)
  })
})

describe('salesByDistributor — canonical SKU drill-down (Pillar 1, Phase 2)', () => {
  const skus = [
    { skuCode: 'ERP-A', productType: 'CHS', nominalBore: '20', thickness: 2, length: 6000, description: 'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2x6000' },
    { skuCode: 'DESC-A', productType: 'CHS', nominalBore: '20', thickness: 2, length: 6000, description: 'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2x6000' },
  ]
  // same distributor, two order lines for the SAME physical pipe under different codes.
  const orders = [
    { deleted: false, mmId: 'ERP-A', distributorCode: 'D1', orderStatus: 'Confirmed', confirmed: 5, nonConfirmed: 0 },
    { deleted: false, mmId: 'DESC-A', distributorCode: 'D1', orderStatus: 'Confirmed', confirmed: 3, nonConfirmed: 0 },
  ]
  const countSkuRows = (rows) => rows.reduce((n, r) => n + r.skuRows.length, 0)
  it('merges variant SKU codes into one drill-down row when skus is provided', () => {
    const withSkus = salesByDistributor(orders, [], '', skus)
    expect(countSkuRows(withSkus)).toBe(1)                    // ERP-A + DESC-A → ONE sku row
    const merged = withSkus.flatMap(r => r.skuRows).find(Boolean)
    expect(merged.confirmed).toBeCloseTo(8)                   // 5 + 3
  })
  it('keeps them split without skus (raw-code behavior, unchanged)', () => {
    expect(countSkuRows(salesByDistributor(orders, []))).toBe(2)
  })
})

describe('buildReconciliationRows — multi-invoice & multi-coil', () => {
  const coils = [
    { hrCoilId: 'HYD-0626-01', actualWeight: 10, costPrice: 500000 }, // 50,000 ₹/MT
    { hrCoilId: 'HYD-0626-02', actualWeight: 20, costPrice: 800000 }, // 40,000 ₹/MT
  ]
  const skus = [{ skuCode: 'SHS-50', description: 'SHS 50x50', baseConversion: 2900, ladderPrice: 3000 }]

  it('splits one truck into separate rows per entry-level invoiceNo', () => {
    const dispatches = [{
      deleted: false, dateOfDispatch: '2026-06-10',
      bundleEntries: [
        { skuCode: 'SHS-50', weight: 4, invoiceNo: 'INV-A', traceHrCoilId: 'HYD-0626-01' },
        { skuCode: 'SHS-50', weight: 6, invoiceNo: 'INV-B', traceHrCoilId: 'HYD-0626-02' },
      ],
    }]
    const rows = buildReconciliationRows(dispatches, coils, skus)
    expect(rows).toHaveLength(2)
    expect(rows.map(r => r.invoiceNo).sort()).toEqual(['INV-A', 'INV-B'])
  })

  it('resolves the mother-coil trace across a bundle entry that spans multiple coils', () => {
    const dispatches = [{
      deleted: false, dateOfDispatch: '2026-06-10',
      bundleEntries: [
        { skuCode: 'SHS-50', weight: 10, invoiceNo: 'INV-A', coilAllocations: [
          { hrCoilId: 'HYD-0626-01', weight: 4 }, { hrCoilId: 'HYD-0626-02', weight: 6 },
        ] },
      ],
    }]
    const rows = buildReconciliationRows(dispatches, coils, skus)
    expect(rows).toHaveLength(1)
    expect(rows[0].motherCoil).toBe('HYD-0626-01; HYD-0626-02')
    expect(rows[0].quantityMT).toBe(10)
    expect(rows[0].costPricePerMT).toBeUndefined()
  })
})

describe('coilInventoryRow — produced dimension', () => {
  const coil = { hrCoilId: 'C1', coilGrade: 'E250', actualWeight: 10 }
  const productions = [{ deleted: false, coilAllocations: [{ babyCoilId: 'C1-A', hrCoilId: 'C1', pieces: 200, weight: 8 }] }]
  it('derives produced/balance-to-produce; produced is 0 without productions', () => {
    const r = coilInventoryRow(coil, [], productions)
    expect(r.producedWt).toBeCloseTo(8)
    expect(r.producedPcs).toBe(200)
    expect(r.balanceToProduce).toBeCloseTo(2)   // 10 − 8
    expect(coilInventoryRow(coil, []).producedWt).toBe(0) // no productions arg
  })
})

describe('coilInventoryRow', () => {
  const coil = { hrCoilId: 'HYD-0626-01', coilGrade: 'E250', actualWeight: 10 }
  const productions = [{ deleted: false, coilAllocations: [
    { babyCoilId: 'HYD-0626-01-A', hrCoilId: 'HYD-0626-01', pieces: 150, weight: 6 },
    { babyCoilId: 'OTHER-A', hrCoilId: 'OTHER', pieces: 7, weight: 1 }, // ignored for this coil
  ] }]
  const dispatches = [{
    deleted: false,
    bundleEntries: [
      { traceHrCoilId: 'HYD-0626-01', pieces: 60, weight: 2.4 },
      { traceHrCoilId: 'OTHER', pieces: 7, weight: 1 },
    ],
  }]

  it('aggregates produced/dispatched and derives balances for this coil only', () => {
    const r = coilInventoryRow(coil, dispatches, productions)
    expect(r.hrCoilId).toBe('HYD-0626-01')
    expect(r.grade).toBe('E250')
    expect(r.coilWt).toBe(10)
    expect(r.producedPcs).toBe(150)
    expect(r.producedWt).toBeCloseTo(6)
    expect(r.dispatchedPcs).toBe(60)
    expect(r.dispatchedWt).toBeCloseTo(2.4)
    expect(r.balanceToProduce).toBeCloseTo(4)  // 10 − 6
    expect(r.producedInvWt).toBeCloseTo(3.6)   // 6 − 2.4
    expect(r.producedInvPcs).toBe(90)          // 150 − 60
  })
})

describe('isOpenOrderStatus', () => {
  it('treats Confirmed / Delivery in progress as open', () => {
    expect(isOpenOrderStatus('Confirmed')).toBe(true)
    expect(isOpenOrderStatus('Delivery in progress')).toBe(true)
  })
  it('treats Delivered / Cancelled / Rejected / blank as closed', () => {
    expect(isOpenOrderStatus('Delivered')).toBe(false)
    expect(isOpenOrderStatus('CANCELLED')).toBe(false)
    expect(isOpenOrderStatus('Rejected')).toBe(false)
    expect(isOpenOrderStatus('')).toBe(false)
    expect(isOpenOrderStatus(null)).toBe(false)
  })
})

describe('isDeliveredStatus', () => {
  it('is true only for a Delivered status (case/space-insensitive)', () => {
    expect(isDeliveredStatus('Delivered')).toBe(true)
    expect(isDeliveredStatus(' delivered ')).toBe(true)
    expect(isDeliveredStatus('DELIVERED')).toBe(true)
  })
  it('is false for every non-delivered status, including blank (Delivered-only scope)', () => {
    expect(isDeliveredStatus('Confirmed')).toBe(false)
    expect(isDeliveredStatus('Delivery in progress')).toBe(false)  // NOT yet delivered → still counts
    expect(isDeliveredStatus('Cancelled')).toBe(false)             // netted in nonConfirmed, still counts
    expect(isDeliveredStatus('Rejected')).toBe(false)
    expect(isDeliveredStatus('')).toBe(false)
    expect(isDeliveredStatus(null)).toBe(false)
    expect(isDeliveredStatus(undefined)).toBe(false)
  })
})

describe('orderLineStage', () => {
  it('derives Non-confirmed when all volume sits in the non-confirmed bucket (the reported bug)', () => {
    // Raw ERP status is "Confirmed" but 100% of the qty is non-confirmed → badge must NOT say Confirmed.
    expect(orderLineStage({ orderStatus: 'Confirmed', quantity: 12, confirmed: 0, nonConfirmed: 12 }, 0)).toBe('Non-confirmed')
  })
  it('derives Confirmed when volume is released (confirmed MT > 0, nothing invoiced)', () => {
    expect(orderLineStage({ orderStatus: 'Confirmed', quantity: 10, confirmed: 6, nonConfirmed: 0 }, 0)).toBe('Confirmed')
  })
  it('derives Delivered when invoiced covers the qty within ±5%', () => {
    expect(orderLineStage({ orderStatus: 'Delivered', quantity: 3, confirmed: 0, nonConfirmed: 0.1 }, 2.9)).toBe('Delivered')
    expect(orderLineStage({ orderStatus: 'Open', quantity: 10, confirmed: 0, nonConfirmed: 0 }, 10)).toBe('Delivered')
  })
  it('derives Partially invoiced when some (but < 95%) is shipped', () => {
    expect(orderLineStage({ orderStatus: 'Open', quantity: 10, confirmed: 3, nonConfirmed: 2 }, 1)).toBe('Partially invoiced')
  })
  it('preserves terminal ERP statuses verbatim (quantity math nets them to ~0)', () => {
    expect(orderLineStage({ orderStatus: 'Cancelled', quantity: 5, confirmed: 0, nonConfirmed: 0 }, 0)).toBe('Cancelled')
    expect(orderLineStage({ orderStatus: 'Rejected', quantity: 5, confirmed: 0, nonConfirmed: 0 }, 0)).toBe('Rejected')
  })
  it('falls back to Pending / raw status when no bucket applies', () => {
    expect(orderLineStage({ orderStatus: '', quantity: 4, confirmed: 0, nonConfirmed: 0 }, 0)).toBe('Pending')
    expect(orderLineStage({ orderStatus: '', quantity: 0, confirmed: 0, nonConfirmed: 0 }, 0)).toBe('')
  })
  it('defaults invoiced to 0 and tolerates missing/blank fields', () => {
    expect(orderLineStage({ orderStatus: 'Confirmed', quantity: 8, nonConfirmed: 8 })).toBe('Non-confirmed')
    expect(orderLineStage({})).toBe('')
  })
})

describe('openOrderQtyBySku', () => {
  it('sums Quantity of open, non-deleted lines per mmId', () => {
    const orders = [
      { mmId: 'A', quantity: 6, orderStatus: 'Confirmed' },
      { mmId: 'A', quantity: 4, orderStatus: 'Delivery in progress' },
      { mmId: 'A', quantity: 9, orderStatus: 'Delivered' },        // closed → ignored
      { mmId: 'B', quantity: 3, orderStatus: 'Confirmed' },
      { mmId: 'B', quantity: 5, orderStatus: 'Confirmed', deleted: true }, // deleted → ignored
    ]
    expect(openOrderQtyBySku(orders)).toEqual({ A: 10, B: 3 })
  })
})

describe('shippedByOrderLine', () => {
  it('sums dispatch entry weight by orderLineId; ignores entries without one and deleted dispatches', () => {
    const dispatches = [
      { deleted: false, bundleEntries: [{ orderLineId: 'L1', weight: 1.5 }, { orderLineId: 'L1', weight: 0.5 }] },
      { deleted: false, bundleEntries: [{ skuCode: 'A', weight: 9 }] },        // no orderLineId → ignored
      { deleted: true, bundleEntries: [{ orderLineId: 'L1', weight: 99 }] },   // deleted → ignored
    ]
    expect(shippedByOrderLine(dispatches)).toEqual({ L1: 2 })
  })
})

describe('dispatchLineKey', () => {
  it('keys on invoiceNo | skuCode | weight (weight to 3dp)', () => {
    const a = dispatchLineKey({ invoiceNo: 'INV-1', skuCode: 'SHS-50', weight: 2 })
    const b = dispatchLineKey({ invoiceNo: 'INV-1', skuCode: 'SHS-50', weight: 2.000 })
    expect(a).toBe(b)                                                     // 2 ≡ 2.000
  })

  it('is case- and whitespace-insensitive on the text parts', () => {
    const a = dispatchLineKey({ invoiceNo: ' inv-1 ', skuCode: 'shs-50', weight: 1 })
    const b = dispatchLineKey({ invoiceNo: 'INV-1', skuCode: 'SHS-50', weight: 1 })
    expect(a).toBe(b)
  })

  it('distinguishes different SKUs on the same invoice, and different weights', () => {
    const base = { invoiceNo: 'INV-1', skuCode: 'SHS-50', weight: 2 }
    expect(dispatchLineKey(base)).not.toBe(dispatchLineKey({ ...base, skuCode: 'RHS-60' }))
    expect(dispatchLineKey(base)).not.toBe(dispatchLineKey({ ...base, weight: 3 }))
  })
})

describe('dedupeDispatchLines', () => {
  const L1 = { invoiceNo: 'INV-1', skuCode: 'SHS-50', weight: 2 }
  const L2 = { invoiceNo: 'INV-1', skuCode: 'RHS-60', weight: 3 }
  const disp = (entries, deleted = false) => ({ deleted, bundleEntries: entries })

  it('re-upload of stored lines imports nothing', () => {
    const existing = [disp([L1, L2])]
    const { toImport, skippedDuplicateLines } = dedupeDispatchLines(existing, [{ ...L1 }, { ...L2 }])
    expect(toImport).toHaveLength(0)
    expect(skippedDuplicateLines).toHaveLength(2)
  })

  it('partial overlap imports only the new line', () => {
    const existing = [disp([L1])]
    const { toImport } = dedupeDispatchLines(existing, [{ ...L1 }, { ...L2 }])
    expect(toImport.map(l => l.skuCode)).toEqual(['RHS-60'])
  })

  it('collapses a line duplicated within the same upload to one', () => {
    const { toImport, skippedDuplicateLines } = dedupeDispatchLines([], [{ ...L1 }, { ...L1 }])
    expect(toImport).toHaveLength(1)
    expect(skippedDuplicateLines).toHaveLength(1)
  })

  it('a soft-deleted dispatch does NOT suppress a fresh re-import (correction/replace workflow)', () => {
    const existing = [disp([L1], true)]   // deleted
    const { toImport } = dedupeDispatchLines(existing, [{ ...L1 }])
    expect(toImport).toHaveLength(1)
  })

  it('reports the invoice numbers that had a skipped line', () => {
    const existing = [disp([L1])]
    const { skippedInvoices } = dedupeDispatchLines(existing, [{ ...L1 }])
    expect([...skippedInvoices]).toEqual(['INV-1'])
  })
})

describe('toISODate', () => {
  it('recovers the intended day from SheetJS\'s near-midnight IST instant (the June-30 bug)', () => {
    // Under IST the June-30 date-only cell comes back 10s before local midnight; naive getters
    // read the 29th. Snapping to the nearest UTC day must restore 2026-06-30.
    expect(toISODate(new Date('2026-06-29T18:29:50.000Z'))).toBe('2026-06-30')
  })

  it('handles exact UTC midnight and a US-evening instant for the same calendar day', () => {
    expect(toISODate(new Date('2026-06-30T00:00:00.000Z'))).toBe('2026-06-30')
    expect(toISODate(new Date('2026-06-30T07:00:00.000Z'))).toBe('2026-06-30')  // e.g. PDT-constructed
  })

  it('parses a bare Excel serial (TZ-independent)', () => {
    expect(toISODate(46203)).toBe('2026-06-30')
  })

  it('passes through common string forms and blanks', () => {
    expect(toISODate('2026-06-30')).toBe('2026-06-30')
    expect(toISODate('30-06-2026')).toBe('2026-06-30')   // DD-MM-YYYY (IN default)
    expect(toISODate('')).toBe('')
    expect(toISODate(null)).toBe('')
    expect(toISODate(undefined)).toBe('')
  })
})

describe('skuBookingRows', () => {
  const skus = [{ skuCode: 'A', description: 'SKU A' }]
  // A: produced 5 MT
  const productions = [{ deleted: false, skuCode: 'A', tubeCount: 100, totalWeight: 5 }]

  it('nets each open order line by its own shipped (orderLineId); free = inventory − booked', () => {
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', orderLineId: 'L1', weight: 1.5 }] }]
    const orders = [{ mmId: 'A', lineId: 'L1', quantity: 4, orderStatus: 'Confirmed' }] // 4 − 1.5 shipped = 2.5
    const [a] = skuBookingRows(productions, dispatches, orders, skus)
    expect(a.inventory).toBeCloseTo(3.5)   // produced 5 − dispatched 1.5
    expect(a.reserved).toBeCloseTo(2.5)
    expect(a.free).toBeCloseTo(1.0)
  })

  it('does NOT subtract a delivered shipment from a different open line of the same SKU', () => {
    // Delivered line L1 (shipped 5) + still-open line L2 (ordered 4, unshipped).
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', orderLineId: 'L1', weight: 5 }] }]
    const orders = [
      { mmId: 'A', lineId: 'L1', quantity: 5, orderStatus: 'Delivered' },  // closed → excluded
      { mmId: 'A', lineId: 'L2', quantity: 4, orderStatus: 'Confirmed' },  // open, unshipped → booked 4
    ]
    const [a] = skuBookingRows(productions, dispatches, orders, skus)
    expect(a.inventory).toBeCloseTo(0)    // produced 5 − dispatched 5
    expect(a.reserved).toBeCloseTo(4)     // NOT reduced by L1's delivered 5
    expect(a.free).toBeCloseTo(-4)
  })

  it('includes ordered-but-unstocked SKUs and sorts negative free first', () => {
    const orders = [
      { mmId: 'A', lineId: 'La', quantity: 1, orderStatus: 'Confirmed' },                      // stocked, free positive
      { mmId: 'Z', lineId: 'Lz', quantity: 8, orderStatus: 'Confirmed', description: 'SKU Z' }, // never produced → free −8
    ]
    const rows = skuBookingRows(productions, [], orders, skus)
    expect(rows[0].skuCode).toBe('Z')          // most-negative free on top
    expect(rows[0].inventory).toBe(0)
    expect(rows[0].reserved).toBe(8)
    expect(rows[0].free).toBe(-8)
    expect(rows[0].description).toBe('SKU Z')   // falls back to order description
  })
})

describe('customerFulfilment', () => {
  it('rolls up ordered vs shipped per customer; outstanding = ordered − shipped', () => {
    const orders = [
      { customer: 'Acme', mmId: 'A', quantity: 10, orderStatus: 'Confirmed' },
      { customer: 'Acme', mmId: 'B', quantity: 5, orderStatus: 'Delivered' },
      { customer: 'Bolt', mmId: 'A', quantity: 4, orderStatus: 'Confirmed' },
    ]
    const dispatches = [{ deleted: false, bundleEntries: [
      { customer: 'Acme', skuCode: 'B', weight: 5 },   // Acme shipped 5
    ] }]
    const rows = customerFulfilment(orders, dispatches)
    expect(rows[0].customer).toBe('Acme')              // highest outstanding first
    expect(rows[0].ordered).toBe(15)
    expect(rows[0].shipped).toBe(5)
    expect(rows[0].outstanding).toBe(10)
    expect(rows[0].openOrders).toBe(1)
    const bolt = rows.find(r => r.customer === 'Bolt')
    expect(bolt.outstanding).toBe(4)
  })
})

describe('orderBacklog', () => {
  it('returns open lines only, netted per line, oldest expected-delivery first', () => {
    const orders = [
      { orderId: 'O1', customer: 'Acme', mmId: 'A', lineId: 'L1', quantity: 10, orderStatus: 'Confirmed', expectedDeliveryDate: '2026-06-30' },
      { orderId: 'O2', customer: 'Bolt', mmId: 'B', lineId: 'L2', quantity: 6, orderStatus: 'Confirmed', expectedDeliveryDate: '2026-06-10' },
      { orderId: 'O3', customer: 'Acme', mmId: 'C', lineId: 'L3', quantity: 3, orderStatus: 'Delivered', expectedDeliveryDate: '2026-06-01' }, // closed → excluded
      { orderId: 'O4', customer: 'Bolt', mmId: 'D', lineId: 'L4', quantity: 2, orderStatus: 'Confirmed', expectedDeliveryDate: '2026-06-20' }, // fully shipped → open 0 → excluded
    ]
    const dispatches = [{ deleted: false, bundleEntries: [
      { orderLineId: 'L1', weight: 4 },   // L1 partially shipped
      { orderLineId: 'L4', weight: 2 },   // L4 fully shipped
    ] }]
    const rows = orderBacklog(orders, dispatches)
    expect(rows.map(r => r.orderId)).toEqual(['O2', 'O1']) // L4/L3 excluded; sorted by exp delivery
    expect(rows[1].open).toBe(6)          // L1: 10 − 4
    expect(rows[1].fulfilmentPct).toBeCloseTo(40)
  })
})

describe('skuDemandSupply', () => {
  it('combines ordered / produced / shipped / inventory / booked / free per SKU', () => {
    const skus = [{ skuCode: 'A', description: 'SKU A' }]
    const productions = [{ deleted: false, skuCode: 'A', tubeCount: 100, totalWeight: 12 }]
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', orderLineId: 'L1', weight: 5 }] }]
    const orders = [
      { mmId: 'A', lineId: 'L1', quantity: 5, releaseQty: 5, invoicedQty: 5, orderStatus: 'Delivered' },   // shipped via L1
      { mmId: 'A', lineId: 'L2', quantity: 4, releaseQty: 4, invoicedQty: 1, orderStatus: 'Confirmed' },   // open, reserves 3
    ]
    const [a] = skuDemandSupply(productions, dispatches, orders, skus)
    expect(a.ordered).toBe(9)             // 5 + 4
    expect(a.produced).toBe(12)
    expect(a.shipped).toBe(5)
    expect(a.inventory).toBeCloseTo(7)    // 12 − 5
    expect(a.booked).toBeCloseTo(4)       // open L2 (L1 delivered, excluded)
    expect(a.free).toBeCloseTo(3)         // 7 − 4 (booked)
    expect(a.reserved).toBeCloseTo(3)     // open L2: max(0, 4 − 1)
    expect(a.available).toBeCloseTo(4)    // inventory 7 − reserved 3
  })
})

describe('distributorSalesRows', () => {
  const invByCode = {
    A: { skuCode: 'A', description: 'SKU A', inventory: 7, free: 3, reserved: 4, available: 3 },
    B: { skuCode: 'B', description: 'SKU B', inventory: 4, free: -2, reserved: 6, available: -2 },
  }

  it('per-distributor validOrders / invoiced·period / invoiced-vs-orders / per-line pending, with nested per-SKU rows + live inventory/free', () => {
    const orders = [
      { customer: 'Acme', mmId: 'A', lineId: 'LA1', quantity: 10, invoicedQty: 0, orderStatus: 'Confirmed', description: 'SKU A' },
      { customer: 'Acme', mmId: 'B', lineId: 'LB1', quantity: 5, invoicedQty: 5, orderStatus: 'Delivered', description: 'SKU B' }, // delivered → valid demand, fully invoiced
      { customer: 'Acme', mmId: 'A', lineId: 'LA2', quantity: 9, orderStatus: 'Cancelled' }, // cancelled → excluded
      { customer: 'Bolt', mmId: 'A', lineId: 'LBolt', quantity: 4, invoicedQty: 0, orderStatus: 'Confirmed' },
    ]
    const dispatches = [{ deleted: false, bundleEntries: [
      { customer: 'Acme', skuCode: 'A', orderLineId: 'LA1', weight: 6 },   // 6 MT invoiced against Acme's order line LA1
    ] }]
    const rows = distributorSalesRows(orders, dispatches, invByCode)
    const acme = rows.find(r => r.customer === 'Acme')
    expect(acme.id).toBe('ACME')   // id is now the normalised identity key; display name stays 'Acme'
    expect(acme.validOrders).toBe(15)        // 10 (A) + 5 (delivered B); cancelled A excluded
    expect(acme.dispatched).toBe(6)          // invoiced this period (flow)
    expect(acme.invoicedVsOrders).toBe(11)   // LA1 6 + LB1 5 (each capped at ordered)
    expect(acme.pending).toBe(4)             // per line: LA1 max(0,10−6)=4; delivered LB1 → 0
    expect(acme.openOrders).toBe(1)          // only the Confirmed line is open
    expect(acme.inventory).toBe(11)          // Σ over valid-ordered SKUs (A:7 + B:4)
    expect(acme.free).toBe(1)                // A:3 + B:-2
    const skuA = acme.skuRows.find(s => s.skuCode === 'A')
    expect(skuA.id).toBe('A')
    expect(skuA.validOrders).toBe(10)
    expect(skuA.dispatched).toBe(6)
    expect(skuA.invoicedVsOrders).toBe(6)
    expect(skuA.pending).toBe(4)             // LA1 only (LA2 cancelled)
    expect(skuA.inventory).toBe(7)           // exact global per-SKU value
    expect(skuA.free).toBe(3)
    expect(skuA.reserved).toBe(4)            // from invByCode
    expect(skuA.available).toBe(3)           // inventory − reserved (Most Relevant)
    expect(skuA.description).toBe('SKU A')
    const skuB = acme.skuRows.find(s => s.skuCode === 'B')
    expect(skuB).toBeTruthy()                // delivered order now creates a SKU row
    expect(skuB.validOrders).toBe(5)
    expect(skuB.invoicedVsOrders).toBe(5)
    expect(skuB.pending).toBe(0)             // delivered & fully invoiced → 0
  })

  it('includes customers shipped with no order (per-line pending floors at 0); unions orders ∪ dispatches', () => {
    const dispatches = [{ deleted: false, bundleEntries: [
      { customer: 'Ghost', skuCode: 'A', weight: 5 },
    ] }]
    const rows = distributorSalesRows([], dispatches, invByCode)
    const ghost = rows.find(r => r.customer === 'Ghost')
    expect(ghost.validOrders).toBe(0)
    expect(ghost.dispatched).toBe(5)         // shipped this period
    expect(ghost.pending).toBe(0)            // no order line to owe against → 0 (never negative)
    expect(ghost.inventory).toBe(0)          // no open-ordered SKUs → 0
    expect(ghost.free).toBe(0)
  })

  it('buckets blank customer names under "—"', () => {
    const orders = [{ customer: '', mmId: 'A', lineId: 'LZ', quantity: 3, invoicedQty: 1, orderStatus: 'Confirmed' }]
    const dispatches = [{ deleted: false, bundleEntries: [{ customer: '   ', skuCode: 'A', orderLineId: 'LZ', weight: 1 }] }]
    const dash = distributorSalesRows(orders, dispatches, invByCode).find(r => r.customer === '—')
    expect(dash).toBeTruthy()
    expect(dash.id).toBe('—')
    expect(dash.validOrders).toBe(3)
    expect(dash.dispatched).toBe(1)
    expect(dash.invoicedVsOrders).toBe(1)    // max(dispatch match 1, invoicedQty 1)
    expect(dash.pending).toBe(2)             // max(0, 3 − 1)
  })

  it('sorts distributors by pending desc and ignores deleted orders/dispatches', () => {
    const orders = [
      { customer: 'Low', mmId: 'A', quantity: 2, orderStatus: 'Confirmed' },
      { customer: 'High', mmId: 'A', quantity: 20, orderStatus: 'Confirmed' },
      { customer: 'Del', mmId: 'A', quantity: 99, orderStatus: 'Confirmed', deleted: true }, // ignored
    ]
    const dispatches = [{ deleted: true, bundleEntries: [{ customer: 'High', skuCode: 'A', weight: 100 }] }] // ignored
    const rows = distributorSalesRows(orders, dispatches, invByCode)
    expect(rows.map(r => r.customer)).toEqual(['High', 'Low'])
    expect(rows.find(r => r.customer === 'Del')).toBeFalsy()
    expect(rows.find(r => r.customer === 'High').dispatched).toBe(0)
  })
})

describe('skuInventoryRows', () => {
  const skus = [{ skuCode: 'A', description: 'SKU A' }]
  const productions = [{ deleted: false, skuCode: 'A', tubeCount: 100, totalWeight: 12 }]

  it('computes production / pending (Confirmed + Non-confirmed) / reserved / inventory / free per SKU', () => {
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', weight: 5 }] }]  // invoiced 5
    const orders = [
      { mmId: 'A', quantity: 5, releaseQty: 5, invoicedQty: 5, orderStatus: 'Delivered', confirmed: 0, nonConfirmed: 0 }, // delivered → no reserve
      { mmId: 'A', quantity: 4, releaseQty: 3, invoicedQty: 1, orderStatus: 'Confirmed', confirmed: 2, nonConfirmed: 1 }, // reserves 2
      { mmId: 'A', quantity: 3, releaseQty: 3, invoicedQty: 0, orderStatus: 'Cancelled', confirmed: 0, nonConfirmed: 0 }, // excluded from orders/reserve
    ]
    const [a] = skuInventoryRows(productions, dispatches, orders, skus)
    expect(a.production).toBe(12)               // all-time produced
    expect(a.totalOrders).toBe(9)               // 5 + 4 (cancelled excluded)
    expect(a.totalInvoiced).toBe(5)             // invoiced this period (dispatch flow)
    expect(a.invoicedVsOrders).toBeCloseTo(6)   // per line: delivered min(5,5)=5 + confirmed min(4,1)=1
    expect(a.pendingDispatch).toBeCloseTo(3)    // Σ(confirmed + nonConfirmed) = (0+0)+(2+1)+(0+0)
    expect(a.reserved).toBeCloseTo(2)           // open Confirmed: max(0, 3 − 1); delivered & cancelled excluded
    expect(a.inventory).toBeCloseTo(7)          // produced 12 − invoiced 5
    expect(a.free).toBeCloseTo(5)               // inventory 7 − reserved 2
  })

  it('pending to dispatch excludes Delivered lines (a closed order is no longer pending)', () => {
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', weight: 10 }] }]
    const orders = [{ mmId: 'A', quantity: 6, releaseQty: 6, invoicedQty: 6, orderStatus: 'Delivered', confirmed: 1.5, nonConfirmed: 0.5 }]
    const [a] = skuInventoryRows(productions, dispatches, orders, skus)
    expect(a.pendingDispatch).toBeCloseTo(0)    // 1.5 + 0.5 NOT counted — the line is Delivered (closed)
    expect(a.reserved).toBe(0)                  // only a delivered line → excluded
    expect(a.inventory).toBeCloseTo(2)          // 12 − 10
    expect(a.free).toBeCloseTo(2)               // inventory − reserved 0
  })

  it('includes ordered-but-unstocked SKUs and sorts negative free first', () => {
    const orders = [
      { mmId: 'A', quantity: 1, orderStatus: 'Confirmed', confirmed: 1, nonConfirmed: 0 },                       // stocked, free positive
      { mmId: 'Z', quantity: 8, releaseQty: 8, invoicedQty: 0, orderStatus: 'Confirmed', description: 'SKU Z', confirmed: 3, nonConfirmed: 5 }, // never produced → reserved 8, free −8
    ]
    const rows = skuInventoryRows(productions, [], orders, skus)
    expect(rows[0].skuCode).toBe('Z')
    expect(rows[0].production).toBe(0)
    expect(rows[0].inventory).toBe(0)
    expect(rows[0].reserved).toBe(8)
    expect(rows[0].pendingDispatch).toBe(8)     // 3 + 5
    expect(rows[0].free).toBe(-8)               // 0 − 8
    expect(rows[0].description).toBe('SKU Z')
  })

  it('scopes totalOrders / invoiced·period AND pending to the period (by order date)', () => {
    const dispatches = [
      { deleted: false, dateOfDispatch: '2026-05-10', bundleEntries: [{ skuCode: 'A', orderLineId: 'M1', weight: 3 }] }, // out of period (flow), against May line
      { deleted: false, dateOfDispatch: '2026-06-10', bundleEntries: [{ skuCode: 'A', orderLineId: 'J1', weight: 2 }] }, // in period, against June line
    ]
    const orders = [
      { mmId: 'A', lineId: 'M1', quantity: 5, releaseQty: 5, invoicedQty: 2, orderStatus: 'Confirmed', orderDate: '2026-05-01', confirmed: 3, nonConfirmed: 0 }, // out of period
      { mmId: 'A', lineId: 'J1', quantity: 4, releaseQty: 1, invoicedQty: 0, orderStatus: 'Confirmed', orderDate: '2026-06-05', confirmed: 1, nonConfirmed: 3 }, // in period
    ]
    const inRange = (d) => d >= '2026-06-01' && d <= '2026-06-30'
    const [a] = skuInventoryRows(productions, dispatches, orders, skus, inRange)
    expect(a.totalOrders).toBe(4)               // only the June order line
    expect(a.totalInvoiced).toBe(2)             // only the June dispatch (flow)
    expect(a.invoicedVsOrders).toBeCloseTo(2)   // June line J1 invoiced 2 (cumulative, matched per line)
    expect(a.production).toBe(12)               // all-time
    expect(a.reserved).toBeCloseTo(4)           // live over all orders: (5−2) + (1−0)
    expect(a.inventory).toBeCloseTo(7)          // all-time: produced 12 − all dispatched (3+2)
    expect(a.pendingDispatch).toBeCloseTo(4)    // in-period order J1 only: confirmed 1 + nonConfirmed 3 (May order excluded)
    expect(a.free).toBeCloseTo(3)               // inventory 7 − reserved 4
  })

  // Pending to Dispatch ties out to the Dashboard/Sales "Pending to Dispatch" (salesKpis): the
  // per-SKU rows sum back to salesKpis().pending, and orders with a blank mmId land in "(Unmapped)"
  // so nothing is dropped from the total.
  it('reconciles with salesKpis and buckets blank-mmId orders under "(Unmapped)"', () => {
    const orders = [
      { mmId: 'A', orderStatus: 'Confirmed', confirmed: 2, nonConfirmed: 3 },
      { mmId: 'A', orderStatus: 'Cancelled', confirmed: 0, nonConfirmed: 1 }, // still counts in pending (no status filter)
      { mmId: '',  orderStatus: 'Confirmed', confirmed: 4, nonConfirmed: 0 }, // no SKU → "(Unmapped)"
    ]
    const rows = skuInventoryRows(productions, [], orders, skus)
    const total = rows.reduce((s, r) => s + r.pendingDispatch, 0)
    expect(total).toBeCloseTo(salesKpis(orders, []).pending) // 10 — ties out with the Dashboard card
    expect(rows.find(r => r.skuCode === 'A').pendingDispatch).toBeCloseTo(6)          // (2+3) + (0+1)
    expect(rows.find(r => r.skuCode === '(Unmapped)').pendingDispatch).toBeCloseTo(4) // 4 + 0
  })

  it('resolves the description from all orders even when the period filter excludes them', () => {
    const orders = [{ mmId: 'A', releaseQty: 5, invoicedQty: 0, orderStatus: 'Confirmed',
      orderDate: '2026-05-01', description: 'MS RHS 100x50x2', confirmed: 5, nonConfirmed: 0 }]
    const inRange = (d) => d >= '2026-06-01' && d <= '2026-06-30' // excludes the May order
    const [a] = skuInventoryRows(productions, [], orders, [], inRange) // empty SKU master
    expect(a.description).toBe('MS RHS 100x50x2') // from the order, despite being out of period
    expect(a.pendingDispatch).toBe(0)             // out of period → not counted
    expect(a.reserved).toBe(5)                    // all-time (5 − 0)
  })
})

describe('orderLineInvoiced', () => {
  it('takes the larger of the dispatch-file line match and the order sheet invoicedQty', () => {
    expect(orderLineInvoiced({ lineId: 'L1', invoicedQty: 2 }, { L1: 5 })).toBe(5) // dispatch match larger
    expect(orderLineInvoiced({ lineId: 'L1', invoicedQty: 7 }, { L1: 5 })).toBe(7) // ERP figure larger
    expect(orderLineInvoiced({ lineId: '', invoicedQty: 3 }, {})).toBe(3)          // blank line id → falls back to ERP
    expect(orderLineInvoiced({ lineId: 'X' }, {})).toBe(0)                         // nothing known → 0
  })
})

describe('reservedBySku', () => {
  it('sums max(0, releaseQty − invoicedQty) over open-status order lines per SKU', () => {
    const orders = [
      { mmId: 'A', releaseQty: 5, invoicedQty: 2, orderStatus: 'Confirmed' },          // 3
      { mmId: 'A', releaseQty: 4, invoicedQty: 0, orderStatus: 'Delivery in progress' }, // 4
      { mmId: 'A', releaseQty: 9, invoicedQty: 9, orderStatus: 'Delivered' },           // excluded (delivered)
      { mmId: 'A', releaseQty: 5, invoicedQty: 0, orderStatus: 'Cancelled' },           // excluded (cancelled)
      { mmId: 'A', releaseQty: 1, invoicedQty: 0, orderStatus: '' },                    // excluded (nan/blank)
      { mmId: 'B', releaseQty: 2, invoicedQty: 5, orderStatus: 'Confirmed' },           // clamps to 0
    ]
    const out = reservedBySku(orders)
    expect(out.A).toBeCloseTo(7)   // 3 + 4
    expect(out.B).toBeCloseTo(0)   // max(0, 2 − 5)
  })

  it('ignores deleted lines and blank SKU codes', () => {
    const orders = [
      { mmId: 'A', releaseQty: 5, invoicedQty: 0, orderStatus: 'Confirmed', deleted: true },
      { mmId: '', releaseQty: 5, invoicedQty: 0, orderStatus: 'Confirmed' },
    ]
    expect(reservedBySku(orders)).toEqual({})
  })
})

describe('skuSizeLabel', () => {
  it('uses nominalBore for CHS and height×breadth for SHS/RHS from the SKU master', () => {
    expect(skuSizeLabel({ nominalBore: '32', outsideDiameter: '42.4' }, 'x')).toBe('32 NB')
    expect(skuSizeLabel({ height: 150, breadth: 150 }, 'x')).toBe('150x150')
    expect(skuSizeLabel({ height: 40, breadth: 20 }, 'x')).toBe('40x20')
  })

  it('falls back to parsing the description', () => {
    expect(skuSizeLabel(null, 'MS CHS One Helix ... 25 NBx2x6000')).toBe('25 NB')
    expect(skuSizeLabel(null, 'MS SHS One Helix ... 38x38x2.80x6000')).toBe('38x38')
    expect(skuSizeLabel(undefined, 'no size here')).toBe('')
  })
})

describe('canonicalSkuKey', () => {
  const D = (s) => `MS ${s}x6000`

  it('collapses decimal-format duplicates of the same physical product to one key', () => {
    const pairs = [
      ['RHS One Helix IS 4923 YSt 210 Black 100x50x1.6', 'RHS One Helix IS 4923 YSt 210 Black 100x50x1.60'],
      ['RHS One Helix IS 4923 YSt 210 Black 100x50x3.2', 'RHS One Helix IS 4923 YSt 210 Black 100x50x3.20'],
      ['CHS One Helix IS 1161 YSt 210 Black 20 NBx2.5',  'CHS One Helix IS 1161 YSt 210 Black 20 NBx2.50'],
      ['CHS One Helix IS 1161 YSt 210 Black 20 NBx2.8',  'CHS One Helix IS 1161 YSt 210 Black 20 NBx2.80'],
    ]
    for (const [short, padded] of pairs) {
      expect(canonicalSkuKey(D(short))).toBe(canonicalSkuKey(D(padded)))
    }
  })

  it('keeps genuinely different products distinct (IS standard and thickness)', () => {
    expect(canonicalSkuKey(D('CHS One Helix IS 1161 YSt 210 Black 32 NBx2')))
      .not.toBe(canonicalSkuKey(D('CHS One Helix IS 3601 YSt 210 Black 32 NBx2')))
    expect(canonicalSkuKey(D('SHS One Helix IS 4923 YSt 210 Black 60x60x2')))
      .not.toBe(canonicalSkuKey(D('SHS One Helix IS 4923 YSt 210 Black 60x60x2.50')))
  })

  it('yields the same key from a SKU object and from its description string', () => {
    const sku = { productType: 'CHS', nominalBore: '20', thickness: 2.5, length: 6000,
      description: D('CHS One Helix IS 1161 YSt 210 Black 20 NBx2.50') }
    expect(canonicalSkuKey(sku)).toBe(canonicalSkuKey(D('CHS One Helix IS 1161 YSt 210 Black 20 NBx2.5')))
  })

  it('falls back to the normalised description when parts do not parse', () => {
    expect(canonicalSkuKey('no parseable size here')).toBe('no parseable size here')
  })
  it('matches SHS object ⇄ description and normalises integer thickness (2 → 2.00)', () => {
    const shs = { productType: 'SHS', height: 25, breadth: 25, thickness: 2, length: 6000,
      description: D('SHS One Helix IS 4923 YSt 210 Black 25x25x2') }
    expect(canonicalSkuKey(shs)).toBe(canonicalSkuKey(D('SHS One Helix IS 4923 YSt 210 Black 25x25x2.00')))
    expect(canonicalSkuKey(shs)).toContain('|2.00|')
  })
  it('keeps different LENGTHS distinct', () => {
    expect(canonicalSkuKey('MS SHS One Helix IS 4923 YSt 210 Black 25x25x2x6000'))
      .not.toBe(canonicalSkuKey('MS SHS One Helix IS 4923 YSt 210 Black 25x25x2x4000'))
  })
  it('KNOWN LIMIT: grade/finish are NOT in the key (documents the single-grade assumption)', () => {
    // If graded/galvanized variants are ever introduced, add grade+finish segments to the key.
    expect(canonicalSkuKey(D('SHS One Helix IS 4923 YSt 310 Black 25x25x2.50')))
      .toBe(canonicalSkuKey(D('SHS One Helix IS 4923 YSt 210 Black 25x25x2.50')))
  })
})

describe('distributorCode', () => {
  it('takes the first two words, uppercased', () => {
    expect(distributorCode('JSW STEEL COATED PRODUCTS LTD')).toBe('JSW STEEL')
    expect(distributorCode('jsw steel coated')).toBe('JSW STEEL')
  })
  it('falls back to fewer words when the name is shorter', () => {
    expect(distributorCode('Acme')).toBe('ACME')
  })
  it('honours a custom word count', () => {
    expect(distributorCode('JSW STEEL COATED PRODUCTS LTD', 1)).toBe('JSW')
    expect(distributorCode('JSW STEEL COATED PRODUCTS LTD', 3)).toBe('JSW STEEL COATED')
  })
  it('collapses extra/leading/trailing whitespace', () => {
    expect(distributorCode('  JSW   STEEL   LTD ')).toBe('JSW STEEL')
  })
  it('returns empty string for blank input', () => {
    expect(distributorCode('')).toBe('')
    expect(distributorCode(null)).toBe('')
    expect(distributorCode(undefined)).toBe('')
    expect(distributorCode('   ')).toBe('')
  })
  it('passes the blank-bucket dash through unchanged', () => {
    expect(distributorCode('—')).toBe('—')
  })
})

describe('distributor identity (stable grouping)', () => {
  it('normDistributorName collapses internal whitespace + upper-cases; blank → —', () => {
    expect(normDistributorName('V V N STEELS  P  LTD')).toBe('V V N STEELS P LTD')
    expect(normDistributorName('v v n steels p ltd')).toBe('V V N STEELS P LTD')
    expect(normDistributorName('  Acme   Corp ')).toBe('ACME CORP')
    expect(normDistributorName('')).toBe('—')
    expect(normDistributorName(null)).toBe('—')
  })

  it('resolveDistributorIdentity prefers a dispatch entry’s linked order over its own name', () => {
    const orders = [{ lineId: 'L1', orderId: 'O1', customer: 'V V N STEELS  P  LTD' }]
    const idx = distributorOrderIndex(orders)
    // order resolves by its (normalised) name
    expect(resolveDistributorIdentity(orders[0], idx, false)).toEqual({ key: 'V V N STEELS P LTD', name: 'V V N STEELS  P  LTD' })
    // a dispatch line spelled differently but linked to that order adopts the order's identity
    const be = { customer: 'V V N STEELS P LTD', orderLineId: 'L1', weight: 5 }
    expect(resolveDistributorIdentity(be, idx, true)).toEqual({ key: 'V V N STEELS P LTD', name: 'V V N STEELS  P  LTD' })
  })

  it('prefers a stable distributorCode when present (both sides)', () => {
    const orders = [{ lineId: 'L1', distributorCode: '0015xyz', customer: 'V V N STEELS P LTD' }]
    const idx = distributorOrderIndex(orders)
    const be = { customer: 'literally anything', orderLineId: 'L1' }
    expect(resolveDistributorIdentity(be, idx, true).key).toBe('0015xyz')
    expect(resolveDistributorIdentity({ distributorCode: '0015xyz', customer: 'X' }, idx, false).key).toBe('0015xyz')
  })
})

describe('distributorSalesRows — identity merging (the V V case)', () => {
  const invByCode = { A: { skuCode: 'A', description: 'SKU A', inventory: 10, free: 4, reserved: 6, available: 4 } }

  it('merges an order and its differently-spelled shipment into ONE row via the order link', () => {
    const orders = [
      { customer: 'V V N STEELS  P  LTD', mmId: 'A', lineId: 'L1', quantity: 100, invoicedQty: 0, orderStatus: 'Confirmed' },
    ]
    // invoice spells the party differently AND has no usable code, but links to order line L1
    const dispatches = [{ deleted: false, bundleEntries: [
      { customer: 'V V N STEELS P LTD', skuCode: 'A', orderLineId: 'L1', weight: 40 },
    ] }]
    const rows = distributorSalesRows(orders, dispatches, invByCode)
    expect(rows).toHaveLength(1)                       // not two "V V" rows
    expect(rows[0].validOrders).toBe(100)
    expect(rows[0].dispatched).toBe(40)
    expect(rows[0].customer).toBe('V V N STEELS  P  LTD') // display = the order's real name
  })

  it('merges by shared distributorCode even when the shipment has no order link', () => {
    const orders = [
      { customer: 'V V N STEELS  P  LTD', distributorCode: 'VVCODE', mmId: 'A', lineId: 'L9', quantity: 20, orderStatus: 'Confirmed' },
    ]
    const dispatches = [{ deleted: false, bundleEntries: [
      { customer: 'v v n steels', distributorCode: 'VVCODE', skuCode: 'A', weight: 7 },  // no orderLineId
    ] }]
    const rows = distributorSalesRows(orders, dispatches, invByCode)
    expect(rows).toHaveLength(1)
    expect(rows[0].dispatched).toBe(7)
    expect(rows[0].validOrders).toBe(20)
  })

  it('keeps genuinely different parties (different codes) as separate rows', () => {
    const orders = [
      { customer: 'V V STEEL', distributorCode: 'C1', mmId: 'A', lineId: 'L1', quantity: 10, orderStatus: 'Confirmed' },
      { customer: 'V V PIPES', distributorCode: 'C2', mmId: 'A', lineId: 'L2', quantity: 5, orderStatus: 'Confirmed' },
    ]
    const rows = distributorSalesRows(orders, [], invByCode)
    expect(rows).toHaveLength(2)                        // same 2-word display code "V V", different identities
    expect(rows.map(r => r.id).sort()).toEqual(['C1', 'C2'])
  })

  it('falls back to the normalised name for an unlinked, code-less shipment', () => {
    const dispatches = [{ deleted: false, bundleEntries: [
      { customer: 'Ghost  Trader', skuCode: 'A', weight: 3 },
    ] }]
    const rows = distributorSalesRows([], dispatches, invByCode)
    expect(rows).toHaveLength(1)
    expect(rows[0].id).toBe('GHOST TRADER')
    expect(rows[0].customer).toBe('Ghost  Trader')
  })
})

describe('salesKpis / salesByDistributor / salesByMonth (Confirmed / Non-confirmed / Invoiced)', () => {
  const orders = [
    { id: 'o1', deleted: false, orderDate: '2026-07-02', customer: 'Alpha Steel', distributorCode: 'A1', orderId: 'ORD1', lineId: 'L1', mmId: 'SKU-1', confirmed: 10, nonConfirmed: 4 },
    { id: 'o2', deleted: false, orderDate: '2026-06-20', customer: 'Alpha Steel', distributorCode: 'A1', orderId: 'ORD2', lineId: 'L2', mmId: 'SKU-2', confirmed: 5, nonConfirmed: 1 },
    { id: 'o3', deleted: false, orderDate: '2026-07-10', customer: 'Beta Tubes', distributorCode: 'B1', orderId: 'ORD3', lineId: 'L3', mmId: 'SKU-1', confirmed: 8, nonConfirmed: 2 },
    { id: 'o4', deleted: true,  orderDate: '2026-07-10', customer: 'Alpha Steel', distributorCode: 'A1', mmId: 'SKU-1', confirmed: 99, nonConfirmed: 99 }, // deleted → ignored
  ]
  const dispatches = [
    { id: 'd1', deleted: false, dateOfDispatch: '2026-07-05', bundleEntries: [
      { skuCode: 'SKU-1', weight: 3, distributorCode: 'A1', orderLineId: 'L1' },
      { skuCode: 'SKU-2', weight: 2, distributorCode: 'A1', orderLineId: 'L2' },
    ] },
    { id: 'd2', deleted: false, dateOfDispatch: '2026-07-08', bundleEntries: [
      { skuCode: 'SKU-1', weight: 6, distributorCode: 'B1', orderLineId: 'L3' },
    ] },
    { id: 'd3', deleted: false, dateOfDispatch: '2026-06-15', bundleEntries: [
      { skuCode: 'SKU-1', weight: 7, distributorCode: 'A1', orderLineId: 'L1' },
    ] },
    { id: 'd4', deleted: true, dateOfDispatch: '2026-07-05', bundleEntries: [
      { skuCode: 'SKU-1', weight: 100, distributorCode: 'A1' },
    ] }, // deleted → ignored
  ]

  it('salesKpis: Confirmed=ΣBE, Non-confirmed=Σ(BF−BK), MTD Invoice scoped to month, Total=Inv+Conf+NonConf', () => {
    const k = salesKpis(orders, dispatches, '2026-07')
    expect(k.confirmed).toBe(23)            // 10 + 5 + 8
    expect(k.nonConfirmed).toBe(7)          // 4 + 1 + 2
    expect(k.pending).toBe(30)              // 23 + 7
    expect(k.mtdInvoice).toBeCloseTo(11)    // July only: 3 + 2 + 6 (June d3 excluded)
    expect(k.totalOrders).toBeCloseTo(41)   // 11 + 23 + 7
  })

  it('salesKpis: month "" sums invoiced across all months; deleted rows excluded', () => {
    const k = salesKpis(orders, dispatches, '')
    expect(k.mtdInvoice).toBeCloseTo(18)    // 3 + 2 + 6 + 7 (d4 deleted excluded)
    expect(k.confirmed).toBe(23)            // o4 (deleted, 99) excluded
  })

  it('salesByDistributor: groups by resolved identity, invoiced scoped to month, sorted by totalOrders desc', () => {
    const rows = salesByDistributor(orders, dispatches, '2026-07')
    const a = rows.find(r => r.id === 'A1')
    const b = rows.find(r => r.id === 'B1')
    expect(a.confirmed).toBe(15)            // 10 + 5
    expect(a.nonConfirmed).toBe(5)          // 4 + 1
    expect(a.mtdInvoice).toBeCloseTo(5)     // July A1: 3 + 2 (June excluded)
    expect(a.totalOrders).toBeCloseTo(25)   // 5 + 15 + 5
    expect(b.confirmed).toBe(8)
    expect(b.mtdInvoice).toBeCloseTo(6)
    expect(b.totalOrders).toBeCloseTo(16)   // 6 + 8 + 2
    expect(rows[0].id).toBe('A1')           // 25 > 16
    const aSku1 = a.skuRows.find(s => s.skuCode === 'SKU-1')
    expect(aSku1.confirmed).toBe(10)
    expect(aSku1.mtdInvoice).toBeCloseTo(3)
  })

  it('salesByMonth: Confirmed/NonConf by order month, Invoiced by invoice month, newest first', () => {
    const rows = salesByMonth(orders, dispatches)
    expect(rows[0].month).toBe('2026-07')   // newest first
    const jul = rows.find(r => r.month === '2026-07')
    const jun = rows.find(r => r.month === '2026-06')
    expect(jul.confirmed).toBe(18)          // o1 (10) + o3 (8)
    expect(jul.nonConfirmed).toBe(6)        // 4 + 2
    expect(jul.invoiced).toBeCloseTo(11)    // d1 (5) + d2 (6)
    expect(jul.totalOrders).toBeCloseTo(35) // 11 + 18 + 6
    expect(jun.confirmed).toBe(5)           // o2
    expect(jun.invoiced).toBeCloseTo(7)     // d3
  })

  it('excludes Delivered lines from Confirmed / Non-confirmed (Delivered-only; Cancelled still counts)', () => {
    const withDelivered = [
      { id: 'k1', deleted: false, orderDate: '2026-07-02', customer: 'Alpha Steel', distributorCode: 'A1', mmId: 'SKU-1', orderStatus: 'Confirmed', confirmed: 10, nonConfirmed: 4 },
      { id: 'k2', deleted: false, orderDate: '2026-07-03', customer: 'Alpha Steel', distributorCode: 'A1', mmId: 'SKU-1', orderStatus: 'Delivered', confirmed: 1.5, nonConfirmed: 3 },   // closed → excluded
      { id: 'k3', deleted: false, orderDate: '2026-07-04', customer: 'Alpha Steel', distributorCode: 'A1', mmId: 'SKU-1', orderStatus: 'Cancelled', confirmed: 0, nonConfirmed: 0.5 }, // not delivered → still counted
    ]
    const k = salesKpis(withDelivered, [])
    expect(k.confirmed).toBe(10)        // 10 only; delivered 1.5 dropped
    expect(k.nonConfirmed).toBe(4.5)    // 4 + cancelled 0.5; delivered 3 dropped
    expect(k.pending).toBe(14.5)        // 4.5 MT of delivered demand excluded

    const [dist] = salesByDistributor(withDelivered, [])
    expect(dist.confirmed).toBe(10)
    expect(dist.nonConfirmed).toBe(4.5)

    const jul = salesByMonth(withDelivered, []).find(r => r.month === '2026-07')
    expect(jul.confirmed).toBe(10)
    expect(jul.nonConfirmed).toBe(4.5)
  })
})

// ── Regression: the ERP invoice import used to re-insert a SKU the master already carried under a
// different id (catalog id 'SKU-nnn' vs a uuid created by hand in SKU Master). `skus.sku_code` is
// UNIQUE, so Postgres rejected the row — and the rejection failed the WHOLE SKU-master sync batch
// ("upsert rejected for 1 row. duplicate key value violates unique constraint skus_sku_code_key").
describe('skuImportResolver (invoice SKU matching + catalog self-heal)', () => {
  const CATALOG = [
    { id: 'SKU-255', productType: 'CHS', skuCode: '1141-13068-10078401', description: 'MS CHS One Helix IS 1161 YSt 210 Black 15 NBx2x6000', nominalBore: '15', thickness: 2, length: 6000, weightPerTube: 5.7116 },
    { id: 'SKU-900', productType: 'SHS', skuCode: 'NEW-CODE-1', description: 'MS SHS One Helix IS 4923 YSt 210 Black 40x40x2x6000', height: 40, breadth: 40, thickness: 2, length: 6000, weightPerTube: 14 },
  ]
  // Same product as SKU-255, entered by hand in SKU Master → uuid id, same code.
  const HAND_ENTERED = { id: '42fea9a1-uuid', productType: 'CHS', skuCode: '1141-13068-10078401', description: 'MS CHS One Helix IS 1161 YSt 210 Black 15 NBx2x6000', nominalBore: '15', thickness: 2, length: 6000, weightPerTube: 5.7 }
  const ids = () => { let n = 0; return () => `gen-${++n}` }

  it('does NOT re-add a SKU the master already has under a different id', () => {
    const { resolve, newCatalogSkus } = skuImportResolver([HAND_ENTERED], CATALOG, ids())
    const hit = resolve('1141-13068-10078401', 'MS CHS One Helix IS 1161 YSt 210 Black 15 NBx2x6000')
    expect(hit.id).toBe('42fea9a1-uuid')       // the LIVE row wins, not the catalog twin
    expect(newCatalogSkus).toHaveLength(0)     // nothing to insert → no unique-constraint violation
  })

  it('blocks the duplicate even when the live row drifted on code (matches on identity/description)', () => {
    const drifted = { ...HAND_ENTERED, skuCode: 'CHS-15NB-2.00' }
    const { resolve, newCatalogSkus } = skuImportResolver([drifted], CATALOG, ids())
    const hit = resolve('1141-13068-10078401', 'MS CHS One Helix IS 1161 YSt 210 Black 15 NBx2x6000')
    expect(hit.skuCode).toBe('CHS-15NB-2.00')  // keeps the master's real code
    expect(newCatalogSkus).toHaveLength(0)
  })

  it('self-heals a genuinely new SKU with a FRESH id, never the catalog id', () => {
    const { resolve, newCatalogSkus } = skuImportResolver([HAND_ENTERED], CATALOG, ids())
    const hit = resolve('NEW-CODE-1', 'MS SHS One Helix IS 4923 YSt 210 Black 40x40x2x6000')
    expect(newCatalogSkus).toHaveLength(1)
    expect(newCatalogSkus[0].skuCode).toBe('NEW-CODE-1')
    expect(newCatalogSkus[0].id).toBe('gen-1')   // NOT 'SKU-900' — a catalog id can collide with a live uuid row
    expect(hit.id).toBe('gen-1')
  })

  it('adds a new SKU only once across repeated lines', () => {
    const { resolve, newCatalogSkus } = skuImportResolver([], CATALOG, ids())
    resolve('NEW-CODE-1', 'MS SHS One Helix IS 4923 YSt 210 Black 40x40x2x6000')
    resolve('NEW-CODE-1', 'MS SHS One Helix IS 4923 YSt 210 Black 40x40x2x6000')
    expect(newCatalogSkus).toHaveLength(1)
  })

  it('matches on MM ID first, so a drifted description still lands on the right SKU', () => {
    const live = { id: 'u1', productType: 'CHS', skuCode: '1141-13068-10078401', description: 'CHS 15NB 2mm (short name)', nominalBore: '15', thickness: 2, length: 6000 }
    const { resolve, newCatalogSkus } = skuImportResolver([live], CATALOG, ids())
    const hit = resolve('1141-13068-10078401', 'MS CHS One Helix IS 1161 YSt 210 Black 15 NBx2x6000')
    expect(hit.id).toBe('u1')
    expect(newCatalogSkus).toHaveLength(0)
  })

  it('falls back to description when the sheet has no MM ID (older exports)', () => {
    const { resolve } = skuImportResolver([HAND_ENTERED], CATALOG, ids())
    expect(resolve('', 'MS CHS One Helix IS 1161 YSt 210 Black 15 NBx2x6000').id).toBe('42fea9a1-uuid')
  })

  it('returns null for a SKU neither the master nor the catalog knows', () => {
    const { resolve, newCatalogSkus } = skuImportResolver([HAND_ENTERED], CATALOG, ids())
    expect(resolve('UNKNOWN-99', 'MS XYZ Some Unlisted Pipe 999x999')).toBeNull()
    expect(newCatalogSkus).toHaveLength(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// DISTRIBUTOR MONTHLY ESTIMATE (Best Estimate) — see CONTEXT.md + ADR-0001 / ADR-0002
// ═══════════════════════════════════════════════════════════════
describe('estimateNum — a target is a typed commitment, absent is not zero', () => {
  it('parses a positive number', () => {
    expect(estimateNum(250)).toBe(250)
    expect(estimateNum('250.5')).toBe(250.5)
  })
  it('treats missing / blank / unparseable / non-positive as no target at all', () => {
    ;[null, undefined, '', '  x  ', NaN, 0, -5].forEach(v => expect(estimateNum(v)).toBeNull())
  })
})

describe('plantBestEstimate — derived, never typed (ADR-0001)', () => {
  const est = [
    { distributorKey: 'D1', month: '2026-08', bestEstimate: 300 },
    { distributorKey: 'D2', month: '2026-08', bestEstimate: 200 },
    { distributorKey: 'D3', month: '2026-07', bestEstimate: 999 },
  ]
  it('sums only the requested month', () => {
    expect(plantBestEstimate(est, '2026-08')).toBe(500)
    expect(plantBestEstimate(est, '2026-07')).toBe(999)
  })
  it('is null when nobody set a target — so % of BE reports N/A rather than dividing by zero', () => {
    expect(plantBestEstimate(est, '2026-09')).toBeNull()
    expect(plantBestEstimate([], '2026-08')).toBeNull()
    expect(plantBestEstimate(null, '2026-08')).toBeNull()
  })
  it('ignores soft-deleted rows and rows whose estimate was cleared', () => {
    expect(plantBestEstimate([
      { distributorKey: 'D1', month: '2026-08', bestEstimate: 300 },
      { distributorKey: 'D2', month: '2026-08', bestEstimate: 200, deleted: true },
      { distributorKey: 'D3', month: '2026-08', bestEstimate: '' },
    ], '2026-08')).toBe(300)
  })
})

describe('distributorEstimateIndex', () => {
  it('keys by distributor identity and drops keyless rows', () => {
    const idx = distributorEstimateIndex([
      { distributorKey: 'D1', distributorName: 'PATEL STEEL', month: '2026-08', bestEstimate: 300 },
      { distributorKey: '   ', month: '2026-08', bestEstimate: 50 },
    ], '2026-08')
    expect(idx.size).toBe(1)
    expect(idx.get('D1')).toMatchObject({ estimate: 300, name: 'PATEL STEEL' })
  })
})

describe('salesByDistributor — Best Estimate columns', () => {
  const orders = [
    { deleted: false, mmId: 'S1', distributorCode: 'D1', customer: 'PATEL STEEL', orderStatus: 'Confirmed', confirmed: 10, nonConfirmed: 5 },
  ]
  const dispatches = [
    { deleted: false, dateOfDispatch: '2026-08-10', distributorCode: 'D1', customer: 'PATEL STEEL',
      bundleEntries: [{ skuCode: 'S1', weight: 120, distributorCode: 'D1', customer: 'PATEL STEEL' }] },
  ]
  const estimates = [{ distributorKey: 'D1', distributorName: 'PATEL STEEL', month: '2026-08', bestEstimate: 300 }]

  it('attaches the month’s estimate, % of BE and gap to the distributor row', () => {
    const [row] = salesByDistributor(orders, dispatches, '2026-08', [], { estimates })
    expect(row.bestEstimate).toBe(300)
    expect(row.pctOfBe).toBeCloseTo(40, 6)     // 120 / 300
    expect(row.gapToBe).toBeCloseTo(180, 6)    // 300 − 120
  })

  it('measures against INVOICED only — the all-time order book must not inflate achievement', () => {
    const [row] = salesByDistributor(orders, dispatches, '2026-08', [], { estimates })
    expect(row.pending).toBeCloseTo(15)         // confirmed + non-confirmed exist...
    expect(row.pctOfBe).toBeCloseTo(40, 6)      // ...but do not move % of BE
  })

  it('reports null (not zero) for a distributor with no estimate, so the row reads N/A', () => {
    const [row] = salesByDistributor(orders, dispatches, '2026-08', [], { estimates: [] })
    expect(row.bestEstimate).toBeNull()
    expect(row.pctOfBe).toBeNull()
    expect(row.gapToBe).toBeNull()
  })

  it('an estimate for another month does not attach to this month’s row', () => {
    const [row] = salesByDistributor(orders, dispatches, '2026-08', [],
      { estimates: [{ distributorKey: 'D1', month: '2026-07', bestEstimate: 300 }] })
    expect(row.bestEstimate).toBeNull()
  })

  it('a distributor with an estimate but no activity still gets a row, so the miss stays visible', () => {
    const rows = salesByDistributor([], [], '2026-08', [], {
      estimates: [{ distributorKey: 'D9', distributorName: 'QUIET TRADERS', month: '2026-08', bestEstimate: 250 }],
    })
    const quiet = rows.find(r => r.id === 'D9')
    expect(quiet).toBeTruthy()
    expect(quiet.customer).toBe('QUIET TRADERS')
    expect(quiet.mtdInvoice).toBe(0)
    expect(quiet.bestEstimate).toBe(250)
    expect(quiet.pctOfBe).toBe(0)
    expect(quiet.gapToBe).toBe(250)             // the whole target missed
  })
})

describe('salesByDistributor — unreserved plant stock in the drill-down (ADR-0002)', () => {
  const skus = [{ skuCode: 'S1', productType: 'SHS', height: 50, breadth: 50, thickness: 2, length: 6000 }]
  const orders = [
    { deleted: false, mmId: 'S1', distributorCode: 'D1', customer: 'PATEL', orderStatus: 'Confirmed', confirmed: 40, nonConfirmed: 0 },
    { deleted: false, mmId: 'S1', distributorCode: 'D2', customer: 'SHREE', orderStatus: 'Confirmed', confirmed: 30, nonConfirmed: 0 },
  ]
  const productions = [{ deleted: false, skuCode: 'S1', dateOfProduction: '2026-08-01', tubeCount: 100, totalWeight: 45 }]

  it('shows the SAME plant on-hand to every distributor waiting on the SKU — nothing is reserved', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus, { productions })
    const patel = rows.find(r => r.id === 'D1').skuRows[0]
    const shree = rows.find(r => r.id === 'D2').skuRows[0]
    expect(patel.onhand).toBeCloseTo(45)
    expect(shree.onhand).toBeCloseTo(45)        // the very same 45 T — this is the accepted trade-off
  })

  it('allPending exposes the sharing: 45 T on hand against 70 T wanted across distributors', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus, { productions })
    const patel = rows.find(r => r.id === 'D1').skuRows[0]
    expect(patel.allPending).toBeCloseTo(70)    // 40 + 30
    expect(patel.shortBy).toBe(0)               // this distributor alone looks covered...
    expect(patel.allPending).toBeGreaterThan(patel.onhand) // ...though the size is oversubscribed
  })

  it('shortBy is this distributor’s uncovered pending, floored at zero', () => {
    const rows = salesByDistributor(
      [{ deleted: false, mmId: 'S1', distributorCode: 'D1', orderStatus: 'Confirmed', confirmed: 60, nonConfirmed: 0 }],
      [], '2026-08', skus, { productions })
    expect(rows[0].skuRows[0].shortBy).toBeCloseTo(15)  // 60 pending − 45 on hand
  })

  it('floors an over-dispatched SKU at zero on-hand rather than showing negative stock', () => {
    const overDispatched = [{ deleted: false, dateOfDispatch: '2026-08-05', bundleEntries: [{ skuCode: 'S1', weight: 60 }] }]
    const rows = salesByDistributor(orders, overDispatched, '2026-08', skus, { productions })
    const patel = rows.find(r => r.id === 'D1').skuRows[0]
    expect(patel.onhand).toBe(0)                // 45 produced − 60 invoiced = −15, floored
    expect(patel.shortBy).toBeCloseTo(40)       // the full pending is uncovered
  })

  it('omits the stock columns entirely when no productions are supplied (existing callers unchanged)', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus)
    expect(rows[0].skuRows[0].onhand).toBeUndefined()
    expect(rows[0].skuRows[0].shortBy).toBeUndefined()
  })
})

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN — Hour budget, working days, family identity
// ═══════════════════════════════════════════════════════════════
describe('campaign — plant constants', () => {
  it('carries the MEASURED mill rate, not the research 12 t/h large-mill figure', () => {
    expect(MILL_RATE_TPH).toBe(4.32)
    expect(SHIFT_HOURS).toBe(12)
    expect(FAMILY_FLOOR_MT).toBe(20)
    expect(GAUGE_FLOOR_MT).toBe(3)
  })

  it('mtToHours and hoursToMt are exact inverses of the one rate', () => {
    expect(mtToHours(432)).toBeCloseTo(100, 6)
    expect(hoursToMt(100)).toBeCloseTo(432, 6)
    expect(hoursToMt(mtToHours(1450))).toBeCloseTo(1450, 6)
  })
})

describe('campaignWorkingDays', () => {
  it('July 2026 gives 27 — exactly the days the mill actually ran', () => {
    expect(campaignWorkingDays('2026-07')).toBe(27)
  })

  it('August 2026 gives 26', () => {
    expect(campaignWorkingDays('2026-08')).toBe(26)
  })

  it('subtracts operator exceptions, as dates or as a plain count', () => {
    expect(campaignWorkingDays('2026-08', [{ date: '2026-08-05', reason: 'Maintenance' }])).toBe(25)
    expect(campaignWorkingDays('2026-08', ['2026-08-05', '2026-08-06'])).toBe(24)
    expect(campaignWorkingDays('2026-08', 3)).toBe(23)
  })

  it('ignores a Sunday exception — it is already not a working day', () => {
    expect(campaignWorkingDays('2026-08', ['2026-08-02'])).toBe(26)   // 2026-08-02 is a Sunday
  })

  it('ignores duplicates and dates outside the month', () => {
    expect(campaignWorkingDays('2026-08', ['2026-08-05', '2026-08-05'])).toBe(25)
    expect(campaignWorkingDays('2026-08', ['2026-09-05'])).toBe(26)
  })

  it('returns 0 rather than NaN for an unparseable month', () => {
    expect(campaignWorkingDays('')).toBe(0)
    expect(campaignWorkingDays('nonsense')).toBe(0)
  })
})

describe('campaignHourBudget', () => {
  it('August 2026 budgets 312 h — 26 working days x 12 h', () => {
    expect(campaignHourBudget({ month: '2026-08' })).toBe(312)
  })

  it('July 2026 budgets 324 h, matching the 27 days the mill ran', () => {
    expect(campaignHourBudget({ month: '2026-07' })).toBe(324)
  })

  it('recomputes when the operator types a day exception', () => {
    expect(campaignHourBudget({ month: '2026-08', dayExceptions: [{ date: '2026-08-05' }] })).toBe(300)
  })

  it('honours a working-day override', () => {
    expect(campaignHourBudget({ month: '2026-08', daysOverride: 24 })).toBe(288)
  })

  it('an outright hours override wins over everything', () => {
    expect(campaignHourBudget({ month: '2026-08', daysOverride: 24, budgetH: 350 })).toBe(350)
  })

  it('Feasible for August 2026 is 312 x 4.32 = 1347.84 MT', () => {
    expect(campaignFeasibleMt({ month: '2026-08' })).toBeCloseTo(1347.84, 2)
  })
})

describe('familyKey', () => {
  const shs = { productType: 'SHS', height: 50, breadth: 50, thickness: 2.5, skuCode: 'SHS-50x50x2.50',
    description: 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.50x6000' }
  const shsThick = { ...shs, thickness: 3.2, skuCode: 'SHS-50x50x3.20',
    description: 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x3.20x6000' }
  const chs = { productType: 'CHS', nominalBore: '32', thickness: 2.9, skuCode: 'CHS-32NBx2.90',
    description: 'MS CHS One Helix IS 1239 Black 32 NB x2.90x6000' }

  it('sets the wall thickness aside — two gauges of one size are one family', () => {
    expect(familyKey(shs)).toBe('SHS 50x50')
    expect(familyKey(shsThick)).toBe('SHS 50x50')
  })

  it('keeps genuinely different sizes and types apart', () => {
    expect(familyKey(chs)).toBe('CHS 32 NB')
    expect(familyKey(chs)).not.toBe(familyKey(shs))
  })

  it('reads a description string the same way it reads a SKU object', () => {
    expect(familyKey(shs.description)).toBe('SHS 50x50')
  })

  it('falls back to the normalised description rather than merging unparseable rows', () => {
    expect(familyKey('mystery item')).toBe('mystery item')
    expect(familyKey('mystery item')).not.toBe(familyKey('other item'))
  })

  it('collapses two ERP codes for one physical size onto a single family row', () => {
    const twinA = { ...shs, skuCode: 'ERP-A', description: 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.5x6000' }
    const twinB = { ...shs, skuCode: 'ERP-B', description: 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.50x6000' }
    const keyOf = familyKeyResolver([twinA, twinB])
    expect(keyOf('ERP-A')).toBe('SHS 50x50')
    expect(keyOf('ERP-B')).toBe('SHS 50x50')
  })

  it('bridges a code the master lacks through its description, and never merges an unparseable one', () => {
    const keyOf = familyKeyResolver([shs])
    expect(keyOf('UNKNOWN-1', chs.description)).toBe('CHS 32 NB')
    expect(keyOf('UNKNOWN-2', '')).toBe('UNKNOWN-2')
  })
})

describe('campaignSuggestion', () => {
  const sku = (code, productType, dims, thickness, desc) =>
    ({ skuCode: code, productType, thickness, length: 6000, ...dims, description: desc })

  const A1 = sku('A1', 'SHS', { height: 50, breadth: 50 }, 2.5, 'MS SHS One Helix IS 4923 Black 50x50x2.50x6000')
  const A2 = sku('A2', 'SHS', { height: 50, breadth: 50 }, 3.2, 'MS SHS One Helix IS 4923 Black 50x50x3.20x6000')
  const B1 = sku('B1', 'RHS', { height: 100, breadth: 50 }, 2.0, 'MS RHS One Helix IS 4923 Black 100x50x2.00x6000')
  const C1 = sku('C1', 'CHS', { nominalBore: '32' }, 2.9, 'MS CHS One Helix IS 1239 Black 32 NB x2.90x6000')
  const skus = [A1, A2, B1, C1]

  // July 2026 sales: 100 T of SHS 50x50 (60 at 2.50, 40 at 3.20) and 100 T of RHS 100x50.
  const dispatches = [{
    id: 'D1', dateOfDispatch: '2026-07-15', bundleEntries: [
      { skuCode: 'A1', weight: 60 }, { skuCode: 'A2', weight: 40 }, { skuCode: 'B1', weight: 100 },
    ],
  }]
  const estimates = [
    { distributorKey: 'D-A', month: '2026-08', bestEstimate: 900 },
    { distributorKey: 'D-B', month: '2026-08', bestEstimate: 550 },
  ]

  it('prevMonth walks back across a year boundary', () => {
    expect(prevMonth('2026-08')).toBe('2026-07')
    expect(prevMonth('2026-01')).toBe('2025-12')
    expect(prevMonth('')).toBe('')
  })

  it('gaugeLabel names the wall thickness to two decimals, so 1.6 and 1.60 read alike', () => {
    expect(gaugeLabel({ thickness: 1.6 })).toBe('1.60 mm')
    expect(gaugeLabel({ thickness: '1.60' })).toBe('1.60 mm')
    expect(gaugeLabel({})).toBe('—')
  })

  it('sizes volume from the month Best Estimate and takes the mix from trailing sales', () => {
    const s = campaignSuggestion('2026-08', { dispatches, skus, estimates })
    expect(s.source).toBe('estimate')
    expect(s.volumeMt).toBe(1450)
    expect(s.trailingMonth).toBe('2026-07')
    const shs = s.families.find(f => f.familyKey === 'SHS 50x50')
    const rhs = s.families.find(f => f.familyKey === 'RHS 100x50')
    expect(shs.suggestedMt).toBeCloseTo(725, 6)     // 50% of the mix
    expect(rhs.suggestedMt).toBeCloseTo(725, 6)
    expect(s.suggestedMt).toBeCloseTo(1450, 6)
  })

  it('August 2026 at 1,450 T needs 335.6 h — 23.6 h over the 312 h budget', () => {
    const s = campaignSuggestion('2026-08', { dispatches, skus, estimates })
    const budget = campaignHourBudget({ month: '2026-08' })
    expect(s.hours).toBeCloseTo(335.65, 2)
    expect(s.hours - budget).toBeCloseTo(23.65, 2)
  })

  it('falls back to trailing sales when no Best Estimate is typed, and says which source it used', () => {
    const s = campaignSuggestion('2026-08', { dispatches, skus })
    expect(s.source).toBe('trailing')
    expect(s.volumeMt).toBe(200)
    expect(s.bestEstimateMt).toBeNull()
    expect(s.suggestedMt).toBeCloseTo(200, 6)
  })

  it('adds open orders on top of the mix, so a family with no trailing sales still appears', () => {
    const orders = [{ mmId: 'C1', quantity: 25, orderStatus: 'Confirmed' }]
    const s = campaignSuggestion('2026-08', { dispatches, skus, estimates, orders })
    const chs = s.families.find(f => f.familyKey === 'CHS 32 NB')
    expect(chs).toBeTruthy()
    expect(chs.suggestedMt).toBeCloseTo(25, 6)
    expect(s.suggestedMt).toBeCloseTo(1475, 6)      // 1,450 of mix plus 25 of named demand
  })

  it('ignores delivered order lines — that demand is already invoiced', () => {
    const orders = [{ mmId: 'C1', quantity: 25, orderStatus: 'Delivered' }]
    const s = campaignSuggestion('2026-08', { dispatches, skus, estimates, orders })
    expect(s.families.find(f => f.familyKey === 'CHS 32 NB')).toBeUndefined()
  })

  it('deducts family on-hand — pipe already in the yard is not worth making again', () => {
    const productions = [{ dateOfProduction: '2026-06-10', skuCode: 'A1', totalWeight: 300 }]
    const s = campaignSuggestion('2026-08', { dispatches, productions, skus, estimates })
    const shs = s.families.find(f => f.familyKey === 'SHS 50x50')
    expect(shs.onhand).toBeCloseTo(240, 6)          // 300 produced − 60 invoiced in July
    expect(shs.suggestedMt).toBeCloseTo(485, 6)     // 725 − 240
  })

  it('never suggests a negative tonnage when on-hand exceeds demand', () => {
    const productions = [{ dateOfProduction: '2026-06-10', skuCode: 'A1', totalWeight: 5000 }]
    const s = campaignSuggestion('2026-08', { dispatches, productions, skus, estimates })
    const shs = s.families.find(f => f.familyKey === 'SHS 50x50')
    expect(shs.suggestedMt).toBe(0)                 // floored, not carried as a credit
    expect(shs).toBeTruthy()                        // and the row survives — the operator decides
  })

  it('keeps a family the mill MADE last month but has not invoiced', () => {
    const productions = [{ dateOfProduction: '2026-07-20', skuCode: 'C1', totalWeight: 80 }]
    const s = campaignSuggestion('2026-08', { dispatches, productions, skus, estimates })
    const chs = s.families.find(f => f.familyKey === 'CHS 32 NB')
    expect(chs).toBeTruthy()
    expect(chs.fromProduction).toBe(true)
  })

  it('splits each family into gauges that reconcile to it exactly', () => {
    const s = campaignSuggestion('2026-08', { dispatches, skus, estimates })
    const shs = s.families.find(f => f.familyKey === 'SHS 50x50')
    expect(shs.gauges.map(g => g.label)).toEqual(['2.50 mm', '3.20 mm'])
    expect(shs.gauges.reduce((t, g) => t + g.suggestedMt, 0)).toBeCloseTo(shs.suggestedMt, 6)
    expect(shs.gauges[0].suggestedMt).toBeCloseTo(725 * 0.6, 6)   // 60 of the family's 100 T sold
  })

  it('collapses two ERP codes for one physical size into a single family row', () => {
    const twin = { ...A1, skuCode: 'A1-DUP', description: 'MS SHS One Helix IS 4923 Black 50x50x2.5x6000' }
    const twinDispatches = [{
      id: 'D1', dateOfDispatch: '2026-07-15',
      bundleEntries: [{ skuCode: 'A1', weight: 60 }, { skuCode: 'A1-DUP', weight: 40 }],
    }]
    const s = campaignSuggestion('2026-08', { dispatches: twinDispatches, skus: [...skus, twin] })
    expect(s.families.filter(f => f.familyKey === 'SHS 50x50')).toHaveLength(1)
    expect(s.families.find(f => f.familyKey === 'SHS 50x50').suggestedMt).toBeCloseTo(100, 6)
  })

  it('returns an empty plan rather than throwing when the trailing month is empty', () => {
    const s = campaignSuggestion('2026-08', { skus })
    expect(s.families).toEqual([])
    expect(s.suggestedMt).toBe(0)
    expect(s.source).toBe('trailing')
  })
})

describe('gaugeReconciliation', () => {
  it('the ticket case: family 240 with gauges 23/45/92/85 is over by 5 and blocks Commit', () => {
    const r = gaugeReconciliation(240, [
      { targetMt: 23 }, { targetMt: 45 }, { targetMt: 92 }, { targetMt: 85 },
    ])
    expect(r.sum).toBe(245)
    expect(r.diff).toBe(5)
    expect(r.ok).toBe(false)
    expect(r.label).toBe('245.0 / 240.0, over by 5.0 T')
  })

  it('names a short split as short, not as a negative overage', () => {
    const r = gaugeReconciliation(240, [{ targetMt: 100 }, { targetMt: 100 }])
    expect(r.diff).toBe(-40)
    expect(r.label).toBe('200.0 / 240.0, short by 40.0 T')
  })

  it('counts a gauge suggestion until the operator types over it', () => {
    const r = gaugeReconciliation(100, [{ suggestedMt: 60 }, { suggestedMt: 40 }])
    expect(r.ok).toBe(true)
    expect(r.sum).toBe(100)
  })

  it('a typed 0 counts as zero, not as "use the suggestion"', () => {
    const r = gaugeReconciliation(100, [{ targetMt: 0, suggestedMt: 60 }, { suggestedMt: 40 }])
    expect(r.sum).toBe(40)
    expect(r.ok).toBe(false)
  })

  it('tolerates rounding dust rather than blocking a month on 0.01 T', () => {
    expect(gaugeReconciliation(240, [{ targetMt: 240.01 }]).ok).toBe(true)
    expect(gaugeReconciliation(240, [{ targetMt: 240.2 }]).ok).toBe(false)
  })

  it('a family with no gauge rows reconciles — there is no split to disagree with', () => {
    expect(gaugeReconciliation(240, []).ok).toBe(true)
  })

  it('the suggestion produced by Initiate reconciles by construction', () => {
    const A1 = { skuCode: 'A1', productType: 'SHS', height: 50, breadth: 50, thickness: 2.5,
      description: 'MS SHS One Helix IS 4923 Black 50x50x2.50x6000' }
    const A2 = { ...A1, skuCode: 'A2', thickness: 3.2, description: 'MS SHS One Helix IS 4923 Black 50x50x3.20x6000' }
    const dispatches = [{ dateOfDispatch: '2026-07-15', bundleEntries: [{ skuCode: 'A1', weight: 60 }, { skuCode: 'A2', weight: 40 }] }]
    const s = campaignSuggestion('2026-08', { dispatches, skus: [A1, A2] })
    const f = s.families[0]
    expect(gaugeReconciliation(f.suggestedMt, f.gauges.map(g => ({ suggestedMt: g.suggestedMt }))).ok).toBe(true)
  })
})

// ── Shared campaign fixture: August 2026, one committed revision, two families. ──
const A1 = { skuCode: 'A1', productType: 'SHS', height: 50, breadth: 50, thickness: 2.5, length: 6000,
  description: 'MS SHS One Helix IS 4923 Black 50x50x2.50x6000' }
const A2 = { ...A1, skuCode: 'A2', thickness: 3.2, description: 'MS SHS One Helix IS 4923 Black 50x50x3.20x6000' }
const B1 = { skuCode: 'B1', productType: 'RHS', height: 100, breadth: 50, thickness: 2.0, length: 6000,
  description: 'MS RHS One Helix IS 4923 Black 100x50x2.00x6000' }
const CAMP_SKUS = [A1, A2, B1]
const keyOfA1 = canonicalSkuKey(A1), keyOfA2 = canonicalSkuKey(A2), keyOfB1 = canonicalSkuKey(B1)

const campaign = { id: 'C1', month: '2026-08', status: 'active', dayExceptions: [] }
const rev1 = { id: 'R1', campaignId: 'C1', revisionNo: 1, committedAt: '2026-08-01T00:00:00Z' }
const campLines = [
  { id: 'L1', revisionId: 'R1', familyKey: 'SHS 50x50', targetMt: 300 },
  { id: 'L2', revisionId: 'R1', familyKey: 'RHS 100x50', targetMt: 200 },
]
const campGauges = [
  { id: 'G1', lineId: 'L1', skuKey: keyOfA1, label: '2.50 mm', thickness: 2.5, targetMt: 180 },
  { id: 'G2', lineId: 'L1', skuKey: keyOfA2, label: '3.20 mm', thickness: 3.2, targetMt: 120 },
  { id: 'G3', lineId: 'L2', skuKey: keyOfB1, label: '2.00 mm', thickness: 2.0, targetMt: 200 },
]

describe('campaignWorkingDaysElapsed', () => {
  it('counts only the working days already gone, not the calendar', () => {
    // 2026-08-10 is a Monday; Sundays 2 and 9 have passed, so 10 calendar days = 8 working days.
    expect(campaignWorkingDaysElapsed(campaign, '2026-08-10')).toBe(8)
  })

  it('reads zero before the month and fully elapsed after it', () => {
    expect(campaignWorkingDaysElapsed(campaign, '2026-07-31')).toBe(0)
    expect(campaignWorkingDaysElapsed(campaign, '2026-09-01')).toBe(26)
  })

  it('a day exception is not an elapsed working day', () => {
    const c = { ...campaign, dayExceptions: [{ date: '2026-08-05', reason: 'Maintenance' }] }
    expect(campaignWorkingDaysElapsed(c, '2026-08-10')).toBe(7)
  })
})

describe('campaignProgress', () => {
  const prod = (date, skuCode, totalWeight) => ({ dateOfProduction: date, skuCode, totalWeight })

  it('says plainly that no campaign is committed rather than rendering an empty plan', () => {
    const draft = { ...campaign, status: 'draft' }
    const p = campaignProgress(draft, [{ ...rev1, committedAt: null }], campLines, campGauges, [], CAMP_SKUS)
    expect(p.committed).toBe(false)
    expect(p.committedMt).toBe(0)
    expect(p.families).toEqual([])
  })

  it('moves Made by exactly the tonnage recorded inside the month', () => {
    const p = campaignProgress(campaign, [rev1], campLines, campGauges,
      [prod('2026-08-04', 'A1', 96)], CAMP_SKUS, '2026-08-12')
    const shs = p.families.find(f => f.familyKey === 'SHS 50x50')
    expect(shs.achieved).toBe(96)
    expect(shs.left).toBe(204)
    expect(p.achievedMt).toBe(96)
  })

  it('ignores production dated outside the campaign month', () => {
    const p = campaignProgress(campaign, [rev1], campLines, campGauges,
      [prod('2026-07-31', 'A1', 96), prod('2026-09-01', 'A1', 50)], CAMP_SKUS)
    expect(p.achievedMt).toBe(0)
  })

  it('does not credit a planned family for production at an uncommitted gauge', () => {
    const A3 = { ...A1, skuCode: 'A3', thickness: 4.0, description: 'MS SHS One Helix IS 4923 Black 50x50x4.00x6000' }
    const p = campaignProgress(campaign, [rev1], campLines, campGauges,
      [prod('2026-08-04', 'A3', 60)], [...CAMP_SKUS, A3])
    expect(p.families.find(f => f.familyKey === 'SHS 50x50').achieved).toBe(0)
    expect(p.achievedMt).toBe(0)
  })

  it('Feasible is the Hour budget at the mill rate — 1,347.84 T for August 2026', () => {
    const p = campaignProgress(campaign, [rev1], campLines, campGauges, [], CAMP_SKUS)
    expect(p.budgetH).toBe(312)
    expect(p.feasibleMt).toBeCloseTo(1347.84, 2)
  })

  it('on pace is a straight line — behind is measured against days elapsed, not against zero', () => {
    // 2026-08-15 is the 13th working day of 26: exactly half the month, so a 300 T target
    // expects 150 T by now.
    const p = campaignProgress(campaign, [rev1], campLines, campGauges,
      [prod('2026-08-04', 'A1', 100)], CAMP_SKUS, '2026-08-15')
    expect(p.pace).toBeCloseTo(0.5, 6)
    const shs = p.families.find(f => f.familyKey === 'SHS 50x50')
    expect(shs.expected).toBeCloseTo(150, 6)
    expect(shs.onPace).toBeCloseTo(-50, 6)      // behind by 50 T
  })

  it('rolls achieved up from the gauges it was recorded against', () => {
    const p = campaignProgress(campaign, [rev1], campLines, campGauges,
      [prod('2026-08-04', 'A1', 90), prod('2026-08-05', 'A2', 30)], CAMP_SKUS)
    const shs = p.families.find(f => f.familyKey === 'SHS 50x50')
    expect(shs.achieved).toBe(120)
    expect(shs.gauges.find(g => g.label === '2.50 mm').achieved).toBe(90)
    expect(shs.gauges.find(g => g.label === '3.20 mm').achieved).toBe(30)
  })

  it('uses the weight it is handed, so live SKU weights flow through to the score', () => {
    // resolveProductionWeights rewrites totalWeight from the current master before this is called.
    const stale = [{ dateOfProduction: '2026-08-04', skuCode: 'A1', tubeCount: 1000, totalWeight: 0 }]
    const live = resolveProductionWeights(stale, [{ ...A1, weightPerTube: 25 }], [])
    const p = campaignProgress(campaign, [rev1], campLines, campGauges, live, CAMP_SKUS)
    expect(p.achievedMt).toBe(25)               // 1000 pieces x 25 kg, not the stored 0
  })

  it('scores against the latest committed revision and remembers the Baseline', () => {
    const rev2 = { id: 'R2', campaignId: 'C1', revisionNo: 2, committedAt: '2026-08-12T00:00:00Z', reason: 'Order cancelled' }
    const withRev2 = [...campLines, { id: 'L3', revisionId: 'R2', familyKey: 'SHS 50x50', targetMt: 250 }]
    const p = campaignProgress(campaign, [rev1, rev2], withRev2, campGauges, [], CAMP_SKUS)
    expect(p.baselineMt).toBe(500)              // 300 + 200 as first committed
    expect(p.committedMt).toBe(250)             // revision 2 is what the month now promises
    expect(p.baselineRevision.id).toBe('R1')
  })
})

describe('campaignUnplanned', () => {
  const prod = (date, skuCode, totalWeight) => ({ dateOfProduction: date, skuCode, totalWeight })
  // A size the campaign never mentions, and a fourth thickness of a family it does.
  const C1 = { skuCode: 'C1', productType: 'CHS', nominalBore: '114.3', thickness: 3.6, length: 6000,
    description: 'MS CHS One Helix IS 1239 Black 114.3 NB x3.60x6000' }
  const A3 = { ...A1, skuCode: 'A3', thickness: 4.0, description: 'MS SHS One Helix IS 4923 Black 50x50x4.00x6000' }
  const skus = [...CAMP_SKUS, C1, A3]

  it('lists a family with no plan row', () => {
    const u = campaignUnplanned(campaign, [rev1], campLines, campGauges, [prod('2026-08-04', 'C1', 48)], skus)
    expect(u.families).toHaveLength(1)
    expect(u.families[0].familyKey).toBe('CHS 114.3 NB')
    expect(u.families[0].mt).toBe(48)
    expect(u.families[0].hours).toBeCloseTo(48 / 4.32, 6)
  })

  it('lists a planned family made at an uncommitted gauge separately', () => {
    const u = campaignUnplanned(campaign, [rev1], campLines, campGauges, [prod('2026-08-04', 'A3', 8)], skus)
    expect(u.families).toHaveLength(0)
    expect(u.gauges).toHaveLength(1)
    expect(u.gauges[0].label).toBe('SHS 50x50 · 4.00 mm')
    expect(u.gauges[0].mt).toBe(8)
  })

  it('leaves committed production alone — it belongs to the score, not to this block', () => {
    const u = campaignUnplanned(campaign, [rev1], campLines, campGauges, [prod('2026-08-04', 'A1', 96)], skus)
    expect(u.mt).toBe(0)
    expect(u.families).toEqual([])
    expect(u.gauges).toEqual([])
  })

  it('does NOT move the Hour budget, and does NOT reduce any shortfall', () => {
    const planned = [prod('2026-08-04', 'A1', 96)]
    const withUnplanned = [...planned, prod('2026-08-06', 'C1', 48), prod('2026-08-07', 'A3', 8)]

    const before = campaignProgress(campaign, [rev1], campLines, campGauges, planned, skus, '2026-08-15')
    const after = campaignProgress(campaign, [rev1], campLines, campGauges, withUnplanned, skus, '2026-08-15')

    expect(after.budgetH).toBe(before.budgetH)          // budget untouched
    expect(after.hoursUsed).toBe(before.hoursUsed)      // hours used untouched
    expect(after.achievedMt).toBe(before.achievedMt)    // the month's score untouched
    const shsBefore = before.families.find(f => f.familyKey === 'SHS 50x50')
    const shsAfter = after.families.find(f => f.familyKey === 'SHS 50x50')
    expect(shsAfter.left).toBe(shsBefore.left)          // the shortfall is not forgiven
    expect(shsAfter.onPace).toBe(shsBefore.onPace)
  })

  it('reports the mill asking for more hours than the month holds, rather than clamping', () => {
    // The plan alone commits 500 T = 115.7 h; 1,200 T unplanned adds 277.8 h on the same mill.
    const u = campaignUnplanned(campaign, [rev1], campLines, campGauges, [prod('2026-08-04', 'C1', 1200)], skus)
    expect(u.planHours).toBeCloseTo(500 / 4.32, 6)
    expect(u.hours).toBeCloseTo(1200 / 4.32, 6)
    expect(u.millHours).toBeCloseTo(1700 / 4.32, 6)
    expect(u.millHours).toBeGreaterThan(u.budgetH)
    expect(u.overBudgetH).toBeCloseTo(1700 / 4.32 - 312, 6)
  })

  it('ignores production outside the campaign month', () => {
    const u = campaignUnplanned(campaign, [rev1], campLines, campGauges, [prod('2026-07-31', 'C1', 48)], skus)
    expect(u.mt).toBe(0)
  })

  it('with nothing unplanned it returns empty lists rather than throwing', () => {
    const u = campaignUnplanned(campaign, [rev1], campLines, campGauges, [], skus)
    expect(u.mt).toBe(0)
    expect(u.hours).toBe(0)
    expect(u.families).toEqual([])
  })
})

describe('campaignDecomposition', () => {
  // The ticket's worked example: promised 1,450, revised to 1,400, feasible 1,348, made 1,290.
  const d = campaignDecomposition({ baselineMt: 1450, committedMt: 1400, feasibleMt: 1348, achievedMt: 1290 })

  it('names the three causes in plain language, not as formulae', () => {
    expect(d.causes.map(c => c.label)).toEqual(['demand changed', 'never fit the hours', 'the mill missed'])
  })

  it('splits the gap the way the ticket says: 50 / 52 / 58 of 160', () => {
    expect(d.causes.map(c => c.mt)).toEqual([50, 52, 58])
    expect(d.gap).toBe(160)
  })

  it('asserts the identity and reports that it passed', () => {
    expect(d.sum).toBe(d.gap)
    expect(d.identityHolds).toBe(true)
  })

  it('holds for real-valued figures too, not just round test numbers', () => {
    const r = campaignDecomposition({ baselineMt: 1450, committedMt: 1400, feasibleMt: 1347.84, achievedMt: 1290.37 })
    expect(r.sum).toBeCloseTo(r.gap, 9)
    expect(r.identityHolds).toBe(true)
  })

  it('reads zero for demand changed when nothing has been revised', () => {
    const r = campaignDecomposition({ baselineMt: 1450, committedMt: 1450, feasibleMt: 1348, achievedMt: 1290 })
    expect(r.causes[0].mt).toBe(0)
    expect(r.identityHolds).toBe(true)
  })

  it('keeps a cause negative rather than presenting it as a positive', () => {
    // Committed 1,200 against a mill that could make 1,348: 148 T of hours went spare.
    const r = campaignDecomposition({ baselineMt: 1200, committedMt: 1200, feasibleMt: 1348, achievedMt: 1150 })
    expect(r.causes[1].mt).toBe(-148)
    expect(r.gap).toBe(50)
    expect(r.identityHolds).toBe(true)
  })

  it('can show the arithmetic behind every derived figure', () => {
    expect(d.causes[0].arithmetic).toBe('1450.0 promised − 1400.0 revised to')
    expect(d.causes[2].arithmetic).toBe('1348.0 the mill could ever make − 1290.0 actually made')
  })

  it('rides along on campaignProgress, computed from the campaign the Monitor is showing', () => {
    const p = campaignProgress(campaign, [rev1], campLines, campGauges,
      [{ dateOfProduction: '2026-08-04', skuCode: 'A1', totalWeight: 180 }], CAMP_SKUS)
    expect(p.decomposition.baseline).toBe(500)
    expect(p.decomposition.achieved).toBe(180)
    expect(p.decomposition.feasible).toBeCloseTo(1347.84, 2)
    expect(p.decomposition.identityHolds).toBe(true)
    expect(p.decomposition.sum).toBeCloseTo(p.decomposition.gap, 9)
  })
})

// ═══════════════════════════════════════════════════════════════
// CAMPAIGN GRID — columns, cell identity, and the Commit gate
// ═══════════════════════════════════════════════════════════════
describe('campaignGaugeColumns', () => {
  it('derives columns from the campaign, thin to thick, one per thickness', () => {
    expect(campaignGaugeColumns([
      { thickness: 3.2 }, { thickness: 1.6 }, { thickness: 2.5 }, { thickness: 1.6 },
    ])).toEqual([1.6, 2.5, 3.2])
  })

  it('ignores deleted rows and rows with no usable thickness', () => {
    expect(campaignGaugeColumns([
      { thickness: 2.5 }, { thickness: 3.2, deleted: true }, { thickness: 0 }, { thickness: null },
    ])).toEqual([2.5])
  })

  it('returns nothing rather than throwing on an empty campaign', () => {
    expect(campaignGaugeColumns()).toEqual([])
  })
})

describe('gaugeIdentity', () => {
  it('inherits the canonical key of the master SKU at that family and thickness', () => {
    const id = gaugeIdentity('SHS 50x50', 2.5, CAMP_SKUS)
    expect(id.resolvable).toBe(true)
    expect(id.skuKey).toBe(canonicalSkuKey(A1))
    expect(id.label).toBe('2.50 mm')
  })

  it('hands back a deliberately unmatchable key when the master has no such product', () => {
    const id = gaugeIdentity('SHS 50x50', 6.0, CAMP_SKUS)
    expect(id.resolvable).toBe(false)
    expect(id.skuKey).toBe('unresolved|SHS 50x50|6.00')
    expect(id.label).toBe('6.00 mm')
  })

  it('does not cross families — the same thickness on another size is a different cell', () => {
    expect(gaugeIdentity('RHS 100x50', 2.5, CAMP_SKUS).resolvable).toBe(false)
    expect(gaugeIdentity('RHS 100x50', 2.0, CAMP_SKUS).resolvable).toBe(true)
  })

  it('reports ambiguity instead of silently picking one of two matching SKUs', () => {
    const twin = { ...A1, skuCode: 'A1-IS3601', length: 7000,
      description: 'MS SHS One Helix IS 3601 Black 50x50x2.50x7000' }
    const id = gaugeIdentity('SHS 50x50', 2.5, [...CAMP_SKUS, twin])
    expect(id.matches).toHaveLength(2)
  })
})

describe('unresolvedGauges — the second Commit gate', () => {
  const resolvable = { id: 'g1', skuKey: canonicalSkuKey(A1), targetMt: 100, label: '2.50 mm' }
  const typedGhost = { id: 'g2', skuKey: 'unresolved|SHS 50x50|6.00', targetMt: 40, label: '6.00 mm' }

  it('catches a typed cell the SKU master cannot name', () => {
    const bad = unresolvedGauges([resolvable, typedGhost], CAMP_SKUS)
    expect(bad).toHaveLength(1)
    expect(bad[0].id).toBe('g2')
  })

  it('lets a plan through when every typed cell resolves', () => {
    expect(unresolvedGauges([resolvable], CAMP_SKUS)).toEqual([])
  })

  it('ignores an untyped cell — a suggestion always came from a real SKU', () => {
    expect(unresolvedGauges([{ skuKey: 'unresolved|X|1.00', targetMt: null, suggestedMt: 20 }], CAMP_SKUS)).toEqual([])
  })

  it('ignores a typed 0 — a decision to make none needs nothing to match it', () => {
    expect(unresolvedGauges([{ ...typedGhost, targetMt: 0 }], CAMP_SKUS)).toEqual([])
  })

  it('ignores a soft-deleted row', () => {
    expect(unresolvedGauges([{ ...typedGhost, deleted: true }], CAMP_SKUS)).toEqual([])
  })

  it('proves the consequence the gate exists to prevent', () => {
    // Commit an unresolvable gauge, then have the mill actually make that pipe. The Monitor cannot
    // join the two, so the family reads 0 achieved AND the tonnage lands in the unplanned block.
    const A6 = { ...A1, skuCode: 'A6', thickness: 6.0, description: 'MS SHS One Helix IS 4923 Black 50x50x6.00x6000' }
    const ghostGauges = [...campGauges, { id: 'G9', lineId: 'L1', skuKey: 'unresolved|SHS 50x50|6.00', label: '6.00 mm', thickness: 6, targetMt: 40 }]
    const made = [{ dateOfProduction: '2026-08-04', skuCode: 'A6', totalWeight: 40 }]
    const skus = [...CAMP_SKUS, A6]

    const p = campaignProgress(campaign, [rev1], campLines, ghostGauges, made, skus)
    const u = campaignUnplanned(campaign, [rev1], campLines, ghostGauges, made, skus)

    expect(p.families.find(f => f.familyKey === 'SHS 50x50').achieved).toBe(0)
    expect(u.gauges).toHaveLength(1)               // 40 T the mill really made, filed as unplanned
    expect(u.gauges[0].mt).toBe(40)
    // ...and the decomposition blames the mill for it. Hence: block this at Commit.
    expect(p.decomposition.causes.find(c => c.key === 'mill').mt).toBeGreaterThan(0)
  })
})

// ═══════════════════════════════════════════════════════════════
// A NULL TARGET IS NOT A TARGET OF ZERO
//
// Initiate writes `targetMt: null`, and that is what Postgres hands back. `Number(null)` is 0, not
// NaN, so a Number.isFinite test alone read every untyped row as a deliberate zero: the whole plan
// showed 0.0 T and the hour test read "0 / 312 h" with the suggestion silently discarded. Caught
// by driving the real screen; every case below uses an EXPLICIT null, which is what the earlier
// tests missed by leaving the key undefined.
// ═══════════════════════════════════════════════════════════════
describe('effectiveTargetMt — null is untyped, 0 is a decision', () => {
  it('lets the suggestion stand when targetMt is explicitly null', () => {
    expect(effectiveTargetMt({ targetMt: null, suggestedMt: 236.4 })).toBe(236.4)
  })

  it('treats a missing key and an empty string the same way', () => {
    expect(effectiveTargetMt({ suggestedMt: 236.4 })).toBe(236.4)
    expect(effectiveTargetMt({ targetMt: '', suggestedMt: 236.4 })).toBe(236.4)
  })

  it('honours a typed 0 as "make none of this"', () => {
    expect(effectiveTargetMt({ targetMt: 0, suggestedMt: 236.4 })).toBe(0)
  })

  it('honours a typed number over the suggestion', () => {
    expect(effectiveTargetMt({ targetMt: 240, suggestedMt: 236.4 })).toBe(240)
  })

  it('hasTypedTarget separates the two', () => {
    expect(hasTypedTarget({ targetMt: null })).toBe(false)
    expect(hasTypedTarget({ targetMt: '' })).toBe(false)
    expect(hasTypedTarget({})).toBe(false)
    expect(hasTypedTarget({ targetMt: 0 })).toBe(true)
    expect(hasTypedTarget({ targetMt: 240 })).toBe(true)
  })

  it('a freshly-initiated plan totals its suggestions, not zero', () => {
    const fresh = [
      { familyKey: 'RHS 100x50', targetMt: null, suggestedMt: 236.4 },
      { familyKey: 'CHS 88.9', targetMt: null, suggestedMt: 153.1 },
    ]
    expect(fresh.reduce((t, l) => t + effectiveTargetMt(l), 0)).toBeCloseTo(389.5, 6)
  })

  it('a gauge split of untyped suggestions reconciles to its family', () => {
    const r = gaugeReconciliation(240, [
      { targetMt: null, suggestedMt: 100 }, { targetMt: null, suggestedMt: 140 },
    ])
    expect(r.sum).toBe(240)
    expect(r.ok).toBe(true)
  })

  it('campaignProgress scores an untyped committed plan against its suggestions', () => {
    const nullLines = [
      { id: 'L1', revisionId: 'R1', familyKey: 'SHS 50x50', targetMt: null, suggestedMt: 300 },
      { id: 'L2', revisionId: 'R1', familyKey: 'RHS 100x50', targetMt: null, suggestedMt: 200 },
    ]
    const nullGauges = campGauges.map(g => ({ ...g, targetMt: null, suggestedMt: g.targetMt }))
    const p = campaignProgress(campaign, [rev1], nullLines, nullGauges, [], CAMP_SKUS)
    expect(p.committedMt).toBe(500)
    expect(p.baselineMt).toBe(500)
  })
})

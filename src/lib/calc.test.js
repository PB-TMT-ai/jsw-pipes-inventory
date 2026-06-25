import { describe, it, expect } from 'vitest'
import {
  fmtT, fmtT3, fmtPct, fmtINR, genHRCoilId, tolerance, periodRange, inDateRange,
  weightPerPieceFromSku, bundleWeightCap, buildReconciliationRows, coilInventoryRow,
  coilFifoAllocate, coilConsumption, producedPool, dispatchCoilTrace, THICKNESS_TOL_MM,
  isOpenOrderStatus, openOrderQtyBySku, shippedByOrderLine, orderLineInvoiced, skuBookingRows,
  customerFulfilment, orderBacklog, skuDemandSupply, skuInventoryRows, distributorSalesRows,
  reservedBySku, skuSizeLabel,
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

  it('groups by SKU and computes weight-weighted cost rate + total', () => {
    const dispatches = [{
      deleted: false, dateOfDispatch: '2026-06-10', invoiceNo: 'INV-1',
      bundleEntries: [
        { skuCode: 'SHS-50', weight: 4, traceHrCoilId: 'HYD-0626-01' }, // rate 50000
        { skuCode: 'SHS-50', weight: 6, traceHrCoilId: 'HYD-0626-02' }, // rate 40000
      ],
    }]
    const rows = buildReconciliationRows(dispatches, coils, skus)
    expect(rows).toHaveLength(1)
    const r = rows[0]
    expect(r.quantityMT).toBe(10)
    // weight-weighted: (4*50000 + 6*40000) / 10 = 44000
    expect(r.costPricePerMT).toBeCloseTo(44000)
    expect(r.motherCoil).toBe('HYD-0626-01; HYD-0626-02')
    expect(r.ladderPerMT).toBe(3000)
    // total = (44000 + 3000) * 10 = 470000
    expect(r.totalCost).toBeCloseTo(470000)
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

  it('legacy/unresolved coil degrades to 0 cost and blank mother coil (no crash)', () => {
    const dispatches = [{
      deleted: false, dateOfDispatch: '2026-05-01', invoiceNo: 'OLD-1',
      bundleEntries: [
        { skuCode: 'SHS-50', weight: 5, traceBabyCoilId: 'HYD-0626-01-A' }, // pre-refactor key, no traceHrCoilId
      ],
    }]
    const rows = buildReconciliationRows(dispatches, coils, skus)
    expect(rows).toHaveLength(1)
    expect(rows[0].costPricePerMT).toBe(0)
    expect(rows[0].motherCoil).toBe('')
    expect(rows[0].quantityMT).toBe(5)
    expect(rows[0].totalCost).toBeCloseTo(3000 * 5) // only ladder applies
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

  it('weight-weights cost across a bundle entry that spans multiple coils', () => {
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
    expect(rows[0].costPricePerMT).toBeCloseTo(44000) // (4*50000 + 6*40000)/10
    expect(rows[0].motherCoil).toBe('HYD-0626-01; HYD-0626-02')
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
    expect(acme.id).toBe('Acme')
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

  it('computes production / pending / reserved / inventory / free (= inventory − reserved) per SKU', () => {
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', weight: 5 }] }]  // invoiced 5
    const orders = [
      { mmId: 'A', quantity: 5, releaseQty: 5, invoicedQty: 5, orderStatus: 'Delivered' }, // delivered → no reserve
      { mmId: 'A', quantity: 4, releaseQty: 3, invoicedQty: 1, orderStatus: 'Confirmed' }, // reserves 2
      { mmId: 'A', quantity: 3, releaseQty: 3, invoicedQty: 0, orderStatus: 'Cancelled' }, // excluded entirely
    ]
    const [a] = skuInventoryRows(productions, dispatches, orders, skus)
    expect(a.production).toBe(12)               // all-time produced
    expect(a.totalOrders).toBe(9)               // 5 + 4 (cancelled excluded)
    expect(a.totalInvoiced).toBe(5)             // invoiced this period (dispatch flow)
    expect(a.invoicedVsOrders).toBeCloseTo(6)   // per line: delivered min(5,5)=5 + confirmed min(4,1)=1
    expect(a.pendingToInvoice).toBeCloseTo(3)   // open Confirmed only: max(0, 4 − 1); delivered/cancelled don't count
    expect(a.reserved).toBeCloseTo(2)           // open Confirmed: max(0, 3 − 1); delivered & cancelled excluded
    expect(a.inventory).toBeCloseTo(7)          // produced 12 − invoiced 5
    expect(a.free).toBeCloseTo(5)               // inventory 7 − reserved 2
  })

  it('floors pendingToInvoice at 0 when invoiced exceeds orders; free = inventory − reserved', () => {
    const dispatches = [{ deleted: false, bundleEntries: [{ skuCode: 'A', weight: 10 }] }]
    const orders = [{ mmId: 'A', quantity: 6, releaseQty: 6, invoicedQty: 6, orderStatus: 'Delivered' }]
    const [a] = skuInventoryRows(productions, dispatches, orders, skus)
    expect(a.pendingToInvoice).toBe(0)          // max(0, 6 − 10)
    expect(a.reserved).toBe(0)                  // only a delivered line → excluded
    expect(a.inventory).toBeCloseTo(2)          // 12 − 10
    expect(a.free).toBeCloseTo(2)               // inventory − reserved 0
  })

  it('includes ordered-but-unstocked SKUs and sorts negative free first', () => {
    const orders = [
      { mmId: 'A', quantity: 1, orderStatus: 'Confirmed' },                       // stocked, free positive
      { mmId: 'Z', quantity: 8, releaseQty: 8, invoicedQty: 0, orderStatus: 'Confirmed', description: 'SKU Z' }, // never produced → reserved 8, free −8
    ]
    const rows = skuInventoryRows(productions, [], orders, skus)
    expect(rows[0].skuCode).toBe('Z')
    expect(rows[0].production).toBe(0)
    expect(rows[0].inventory).toBe(0)
    expect(rows[0].reserved).toBe(8)
    expect(rows[0].pendingToInvoice).toBe(8)
    expect(rows[0].free).toBe(-8)               // 0 − 8
    expect(rows[0].description).toBe('SKU Z')
  })

  it('scopes totalOrders / invoiced·period to the period; per-line pending nets each order by its own invoices', () => {
    const dispatches = [
      { deleted: false, dateOfDispatch: '2026-05-10', bundleEntries: [{ skuCode: 'A', orderLineId: 'M1', weight: 3 }] }, // out of period (flow), against May line
      { deleted: false, dateOfDispatch: '2026-06-10', bundleEntries: [{ skuCode: 'A', orderLineId: 'J1', weight: 2 }] }, // in period, against June line
    ]
    const orders = [
      { mmId: 'A', lineId: 'M1', quantity: 5, releaseQty: 5, invoicedQty: 2, orderStatus: 'Confirmed', orderDate: '2026-05-01' }, // out of period, reserves 3 live
      { mmId: 'A', lineId: 'J1', quantity: 4, releaseQty: 1, invoicedQty: 0, orderStatus: 'Confirmed', orderDate: '2026-06-05' }, // in period, reserves 1 live
    ]
    const inRange = (d) => d >= '2026-06-01' && d <= '2026-06-30'
    const [a] = skuInventoryRows(productions, dispatches, orders, skus, inRange)
    expect(a.totalOrders).toBe(4)               // only the June order line
    expect(a.totalInvoiced).toBe(2)             // only the June dispatch (flow)
    expect(a.invoicedVsOrders).toBeCloseTo(2)   // June line J1 invoiced 2 (cumulative, matched per line)
    expect(a.production).toBe(12)               // all-time
    expect(a.reserved).toBeCloseTo(4)           // live over all orders: (5−2) + (1−0)
    expect(a.inventory).toBeCloseTo(7)          // all-time: produced 12 − all dispatched (3+2)
    expect(a.pendingToInvoice).toBeCloseTo(2)   // per line: J1 max(0, 4 − 2)
    expect(a.free).toBeCloseTo(3)               // inventory 7 − reserved 4
  })

  // Regression for the cross-month bug: a same-SKU invoice raised against a *previous* (delivered)
  // order must NOT reduce a new open order's pending. Old SKU-aggregate math returned 2; per-line is 8.
  it('does not let a previous order’s invoice hide a new same-SKU order’s pending', () => {
    const dispatches = [
      // 6 MT invoiced in June, but against the OLD (delivered) order line OLD1
      { deleted: false, dateOfDispatch: '2026-06-10', bundleEntries: [{ skuCode: 'A', orderLineId: 'OLD1', weight: 6 }] },
    ]
    const orders = [
      { mmId: 'A', lineId: 'OLD1', quantity: 6, invoicedQty: 6, orderStatus: 'Delivered', orderDate: '2026-05-20' },
      { mmId: 'A', lineId: 'NEW1', quantity: 8, invoicedQty: 0, orderStatus: 'Confirmed', orderDate: '2026-06-22' },
    ]
    const inRange = (d) => d >= '2026-06-01' && d <= '2026-06-30'
    const [a] = skuInventoryRows(productions, dispatches, orders, skus, inRange)
    expect(a.totalInvoiced).toBe(6)             // June dispatch flow (the OLD order's invoice)
    expect(a.totalOrders).toBe(8)               // only the June (NEW) order line is in-period
    expect(a.invoicedVsOrders).toBe(0)          // nothing invoiced against the NEW order
    expect(a.pendingToInvoice).toBe(8)          // NEW order fully pending — NOT reduced by OLD1's 6 MT invoice
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

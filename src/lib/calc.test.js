import { describe, it, expect } from 'vitest'
import {
  fmtT, fmtPct, fmtINR, genHRCoilId, tolerance,
  weightPerPieceFromSku, bundleWeightCap, buildReconciliationRows, coilInventoryRow,
} from './calc'

describe('format helpers', () => {
  it('fmtT renders 3 decimals, em-dash for null/undefined', () => {
    expect(fmtT(1.5)).toBe('1.500')
    expect(fmtT(0)).toBe('0.000')
    expect(fmtT(null)).toBe('—')
    expect(fmtT(undefined)).toBe('—')
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

describe('coilInventoryRow', () => {
  const coil = { hrCoilId: 'HYD-0626-01', coilGrade: 'E250', actualWeight: 10 }
  const bundles = [
    { hrCoilId: 'HYD-0626-01', tubeCount: 100, totalWeight: 4, deleted: false },
    { hrCoilId: 'HYD-0626-01', tubeCount: 50, totalWeight: 2, deleted: false },
    { hrCoilId: 'HYD-0626-01', tubeCount: 999, totalWeight: 99, deleted: true }, // ignored
    { hrCoilId: 'OTHER', tubeCount: 7, totalWeight: 1, deleted: false },         // ignored
    { hrCoilId: null, tubeCount: 5, totalWeight: 1, deleted: false },            // legacy, ignored
  ]
  const dispatches = [{
    deleted: false,
    bundleEntries: [
      { traceHrCoilId: 'HYD-0626-01', pieces: 60, weight: 2.4 },
      { traceHrCoilId: 'OTHER', pieces: 7, weight: 1 },
    ],
  }]

  it('aggregates bundled/dispatched and derives balances for this coil only', () => {
    const r = coilInventoryRow(coil, bundles, dispatches)
    expect(r.hrCoilId).toBe('HYD-0626-01')
    expect(r.grade).toBe('E250')
    expect(r.coilWt).toBe(10)
    expect(r.bundledPcs).toBe(150)
    expect(r.bundledWt).toBeCloseTo(6)
    expect(r.dispatchedPcs).toBe(60)
    expect(r.dispatchedWt).toBeCloseTo(2.4)
    expect(r.balanceToBundle).toBeCloseTo(4)   // 10 − 6
    expect(r.bundledInvWt).toBeCloseTo(3.6)    // 6 − 2.4
    expect(r.bundledInvPcs).toBe(90)           // 150 − 60
  })
})

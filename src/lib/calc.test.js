import { describe, it, expect } from 'vitest'
import {
  fmtT, fmtT3, fmtPct, fmtINR, genHRCoilId, nextCoilNumber, tolerance, periodRange, inDateRange,
  weightPerPieceFromSku, resolveProductionWeights, bundleWeightCap, buildReconciliationRows, coilInventoryRow,
  coilFifoAllocate, coilConsumption, producedPool, unmatchedDispatch, skuAgeing, dispatchCoilTrace, THICKNESS_TOL_MM,
  RM_TO_FG_THICKNESS, allowedRmThickness, rmRollsFg, capAllocationRows,
  isOpenOrderStatus, isDeliveredStatus, orderLineStage, openOrderQtyBySku, shippedByOrderLine, orderLineInvoiced, skuBookingRows,
  customerFulfilment, orderBacklog, skuDemandSupply, skuInventoryRows, distributorSalesRows,
  reservedBySku, skuSizeLabel, canonicalSkuKey, skuKeyResolver, skuImportResolver, requiredStripWidth, WIDTH_TOL_MM,
  distributorCode, normDistributorName, distributorOrderIndex, resolveDistributorIdentity,
  dispatchLineKey, dedupeDispatchLines, toISODate,
  GST_STATE_CODES, gstStateName, resolveShipToState,
  REGIONS, UNMAPPED_REGION, normStateName, stateRegionIndex, regionForState,
  PLANTS, PLANT_IDS, UNATTRIBUTED_PLANT, normPlantKey, plantIndex, resolvePlant, plantById, plantLabel,
  dispatchPlantLabel, plantForErpRow, erpRowPicker,
  coilInwardPlants, COIL_INWARD_PLANT_IDS, DEFAULT_COIL_PLANT, babyCoilPlant, productionPlant,
  normalizeProductionPoNo, productionPoOptions,
  ALL_PLANTS, plantFilterOptions, plantKeysIn, plantNamesIn, filterByPlant, filterDispatchesByPlant, withDispatchEntries,
  crossPlantAllocationRows,
  plantMaster, plantsServingRegion, servedRegions, filterByPlants, filterDispatchesByPlants,
  distributorStateIndex, distributorRegionResolver, distributorRegionIndex,
  salesKpis, salesByDistributor, salesByMonth,
  estimateNum, distributorEstimateIndex, plantBestEstimate,
  APP_TABS, accessFor, parseStoredSession, ROLE_ADMIN, ROLE_PLANT, SESSION_TTL_MS,
  MILL_RATE_TPH, SHIFT_HOURS, FAMILY_FLOOR_MT, GAUGE_FLOOR_MT, mtToHours, hoursToMt,
  familyKey, familyKeyResolver, campaignWorkingDays, campaignHourBudget, campaignFeasibleMt,
  prevMonth, gaugeLabel, campaignSuggestion, gaugeReconciliation,
  campaignWorkingDaysElapsed, campaignProgress, campaignUnplanned, campaignDecomposition,
  campaignGaugeColumns, gaugeIdentity, unresolvedGauges, effectiveTargetMt, hasTypedTarget,
} from './calc'
import DEFAULT_STATE_REGIONS from '../data/stateRegions'
import DEFAULT_PLANTS from '../data/plants'

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

describe('nextCoilNumber (ticket #122 — per plant)', () => {
  it("is one past the highest hrCoilNo among that plant's own coils — with only Hyderabad coils present, the same number the old unfiltered global-max hook computed", () => {
    const coils = [
      { hrCoilNo: 1, plant: 'hyderabad' },
      { hrCoilNo: 5, plant: 'hyderabad' },
      { hrCoilNo: 3, plant: 'hyderabad' },
    ]
    expect(nextCoilNumber(coils, 'hyderabad')).toBe(6)
    expect(nextCoilNumber(coils)).toBe(6) // defaults to Hyderabad
  })

  it('starts at 1 for a plant with no coils yet', () => {
    expect(nextCoilNumber([])).toBe(1)
    expect(nextCoilNumber(undefined)).toBe(1)
    expect(nextCoilNumber([{ hrCoilNo: 40, plant: 'hyderabad' }], 'npmd')).toBe(1)
  })

  it("one plant's next number is unaffected by how many coils the other plant holds, and vice versa", () => {
    const coils = [
      { hrCoilNo: 1, plant: 'hyderabad' },
      { hrCoilNo: 2, plant: 'hyderabad' },
      { hrCoilNo: 340, plant: 'hyderabad' },
      { hrCoilNo: 1, plant: 'npmd' },
    ]
    // NPMD's single coil never pushes Hyderabad's count past its own 340.
    expect(nextCoilNumber(coils, 'hyderabad')).toBe(341)
    // Hyderabad's 340 coils never push NPMD's register past its own 1.
    expect(nextCoilNumber(coils, 'npmd')).toBe(2)
  })

  it('ignores a coil with no plant recorded (a pre-#120 row never backfilled) — it counts toward no plant, so it can never inflate one', () => {
    const coils = [{ hrCoilNo: 99 }, { hrCoilNo: 5, plant: 'hyderabad' }]
    expect(nextCoilNumber(coils, 'hyderabad')).toBe(6)
  })
})

describe('genHRCoilId', () => {
  it('formats HYD-MMYY-NN with zero-padded month and number', () => {
    expect(genHRCoilId('2026-06-15', 3)).toBe('HYD-0626-03')
    expect(genHRCoilId('2026-12-01', 12)).toBe('HYD-1226-12')
  })

  it("takes the prefix from the plant's own master row (ticket #122) — NPMD reads NPM-, three letters matching Hyderabad's", () => {
    expect(genHRCoilId('2026-08-26', 1, 'npmd')).toBe('NPM-0826-01')
    expect(genHRCoilId('2026-08-26', 1, 'hyderabad')).toBe('HYD-0826-01')
  })

  it('falls back to the Hyderabad prefix for a blank or unknown plant, so nothing breaks mid-change', () => {
    expect(genHRCoilId('2026-06-15', 3, '')).toBe('HYD-0626-03')
    expect(genHRCoilId('2026-06-15', 3, 'not-a-real-plant')).toBe('HYD-0626-03')
  })

  it('falls back to the Hyderabad prefix even if a known plant\'s own master row has none set', () => {
    const brokenMaster = PLANTS.map(p => p.id === 'npmd' ? { ...p, coilPrefix: '' } : p)
    expect(genHRCoilId('2026-08-26', 1, 'npmd', brokenMaster)).toBe('HYD-0826-01')
  })

  it('never collides across plants for the same date and number — full ids stay unique, so duplicate-ID detection (a plain string match in App.jsx) still works per plant with no new logic', () => {
    expect(genHRCoilId('2026-08-26', 1, 'hyderabad')).not.toBe(genHRCoilId('2026-08-26', 1, 'npmd'))
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

describe('capAllocationRows', () => {
  // Free capacity in tonnes per baby coil; 1 piece = 0.5 T throughout for easy arithmetic.
  const cap = { A: 2, B: 2, C: 5 }
  const capacityOf = (id) => cap[id] ?? 0
  const base = { capacityOf, weightPerPiece: 0.5, fillPct: 1 }

  it('caps a row at its coil capacity and spills the excess to the next row', () => {
    // The real defect: 10 pieces (5 T) dumped on coil A, which holds 2 T (4 pieces).
    const r = capAllocationRows({ ...base, rows: [{ babyCoilId: 'A', pieces: 10 }, { babyCoilId: 'C', pieces: 0 }] })
    expect(r.rows.map(x => [x.babyCoilId, x.pieces])).toEqual([['A', 4], ['C', 6]])
    expect(r.leftoverPieces).toBe(0)
  })

  it('leaves an already-physical split untouched', () => {
    const rows = [{ babyCoilId: 'A', pieces: 4 }, { babyCoilId: 'B', pieces: 3 }]
    const r = capAllocationRows({ ...base, rows })
    expect(r.rows.map(x => x.pieces)).toEqual([4, 3])
    expect(r.leftoverPieces).toBe(0)
  })

  it('spills into spare coils only after the operator rows are full', () => {
    const r = capAllocationRows({ ...base, rows: [{ babyCoilId: 'A', pieces: 12 }], spare: ['B', 'C'] })
    expect(r.rows.map(x => [x.babyCoilId, x.pieces])).toEqual([['A', 4], ['B', 4], ['C', 4]])
    expect(r.leftoverPieces).toBe(0)
  })

  it('never invents a coil when no spare is offered — reports leftover instead', () => {
    const r = capAllocationRows({ ...base, rows: [{ babyCoilId: 'A', pieces: 12 }] })
    expect(r.rows).toEqual([{ babyCoilId: 'A', pieces: 4 }])
    expect(r.leftoverPieces).toBe(8)
  })

  it('respects the +-5% band when fillPct is 1.05', () => {
    // A holds 2 T = 4 pieces nominal; 1.05 x 2 T = 2.1 T = 4.2 -> 4 whole pieces.
    expect(capAllocationRows({ ...base, fillPct: 1.05, rows: [{ babyCoilId: 'A', pieces: 9 }] }).rows[0].pieces).toBe(4)
    // C holds 5 T = 10 pieces nominal; 1.05 x 5 T = 5.25 T = 10.5 -> 10 whole pieces.
    expect(capAllocationRows({ ...base, fillPct: 1.05, rows: [{ babyCoilId: 'C', pieces: 20 }] }).rows[0].pieces).toBe(10)
  })

  it('accumulates capacity across duplicate rows on the same coil', () => {
    const r = capAllocationRows({ ...base, rows: [{ babyCoilId: 'A', pieces: 3 }, { babyCoilId: 'A', pieces: 3 }] })
    expect(r.rows.map(x => x.pieces)).toEqual([3, 1]) // A holds 4 pieces total, not 4 per row
    expect(r.leftoverPieces).toBe(2)
  })

  it('carries pieces past a row with no coil picked rather than dropping them', () => {
    const r = capAllocationRows({ ...base, rows: [{ babyCoilId: '', pieces: 5 }, { babyCoilId: 'C', pieces: 0 }] })
    expect(r.rows.map(x => [x.babyCoilId, x.pieces])).toEqual([['', 0], ['C', 5]])
    expect(r.leftoverPieces).toBe(0)
  })

  it('is a no-op without a per-piece weight', () => {
    const rows = [{ babyCoilId: 'A', pieces: 10 }]
    expect(capAllocationRows({ capacityOf, weightPerPiece: 0, rows })).toEqual({ rows, leftoverPieces: 0 })
  })

  it('treats a coil with no remaining capacity as unusable', () => {
    const r = capAllocationRows({ ...base, capacityOf: () => 0, rows: [{ babyCoilId: 'A', pieces: 5 }] })
    expect(r.rows[0].pieces).toBe(0)
    expect(r.leftoverPieces).toBe(5)
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

  it('thicknessRule uses the plant RM→FG sheet, not a symmetric band', () => {
    // 2.3 coil rolls 2.5 pipe (+0.2), but 2.5 coil never rolls 2.3 pipe — the old ±0.3 mm
    // band admitted both directions. Asymmetry is the whole point of the sheet.
    const c = [{ hrCoilId: 'RM23', thickness: 2.3, actualWeight: 10, dateOfInward: '2026-01-01' }]
    const ok = coilFifoAllocate({ coils: c, skuThickness: 2.5, weightPerPiece: 1, pieces: 2, thicknessRule: true })
    expect(ok.allocations.map(a => a.hrCoilId)).toEqual(['RM23'])
    const c25 = [{ hrCoilId: 'RM25', thickness: 2.5, actualWeight: 10, dateOfInward: '2026-01-01' }]
    const no = coilFifoAllocate({ coils: c25, skuThickness: 2.3, weightPerPiece: 1, pieces: 2, thicknessRule: true })
    expect(no.noEligibleCoil).toBe(true)
  })

  it('thicknessRule rejects a pairing the old ±0.3 mm band allowed', () => {
    // 2.6 coil is within 0.3 mm of 2.5 pipe, so the band passed it. The sheet says 2.6 rolls
    // 2.8 only — this is a pairing the mill does not run.
    const c = [{ hrCoilId: 'RM26', thickness: 2.6, actualWeight: 10, dateOfInward: '2026-01-01' }]
    expect(coilFifoAllocate({ coils: c, skuThickness: 2.5, weightPerPiece: 1, pieces: 2, thickTolMm: 0.3 }).allocations).toHaveLength(1)
    expect(coilFifoAllocate({ coils: c, skuThickness: 2.5, weightPerPiece: 1, pieces: 2, thicknessRule: true }).noEligibleCoil).toBe(true)
  })

  it('thicknessRule spans one-to-many rows (3.0 rolls 3.0 and 3.2; 2.2 rolls 2.2 and 2.3)', () => {
    const c30 = [{ hrCoilId: 'RM30', thickness: 3.0, actualWeight: 10, dateOfInward: '2026-01-01' }]
    for (const fg of [3.0, 3.2]) {
      expect(coilFifoAllocate({ coils: c30, skuThickness: fg, weightPerPiece: 1, pieces: 2, thicknessRule: true }).allocations).toHaveLength(1)
    }
    expect(allowedRmThickness(2.2)).toEqual([2.2])
    expect(allowedRmThickness(2.3)).toEqual([2.2])
    expect(allowedRmThickness(4.0)).toEqual([3.7, 4.0])
  })

  it('rmRollsFg tolerates float noise from spreadsheet imports', () => {
    expect(rmRollsFg(2.2000000000000002, 2.3)).toBe(true)
    expect(rmRollsFg(2.5, 2.3)).toBe(false)
  })

  it('an FG gauge absent from the sheet has no eligible coil (never falls back to a band)', () => {
    expect(allowedRmThickness(2.9)).toEqual([])
    const c = [{ hrCoilId: 'RM30', thickness: 3.0, actualWeight: 10, dateOfInward: '2026-01-01' }]
    expect(coilFifoAllocate({ coils: c, skuThickness: 2.9, weightPerPiece: 1, pieces: 2, thicknessRule: true }).noEligibleCoil).toBe(true)
  })

  it('every RM_TO_FG_THICKNESS row is one-decimal and non-empty', () => {
    for (const r of RM_TO_FG_THICKNESS) {
      expect(r.fg.length).toBeGreaterThan(0)
      expect(Math.round(r.rm * 10) / 10).toBe(r.rm)
      r.fg.forEach(f => expect(Math.round(f * 10) / 10).toBe(f))
    }
  })

  it('exports THICKNESS_TOL_MM = 0.3 (Production absolute thickness band)', () => {
    expect(THICKNESS_TOL_MM).toBe(0.3)
  })

  // ── The plant filter (ticket #124). Added here rather than as a new suite because it is one
  // more eligibility rule on the same function, and the interesting cases are how it COMPOSES
  // with the rules already above — not the filter in isolation.
  //
  // Production feeds this baby coils through an adapter, so `hrCoilId` here is a babyCoilId and
  // `plant` is the baby coil's inherited plant. Two plants' coils, same thickness and both
  // eligible on every other rule, so anything that crosses shows up as a wrong allocation
  // rather than as an empty one.
  const twoPlantCoils = [
    { hrCoilId: 'HYD-0826-01-A', plant: 'hyderabad', dateOfInward: '2026-08-05', thickness: 2.3, actualWeight: 5 },
    { hrCoilId: 'NPM-0826-01-A', plant: 'npmd', dateOfInward: '2026-08-01', thickness: 2.3, actualWeight: 5 },
  ]
  const twoPlant = { coils: twoPlantCoils, skuThickness: 2.5, weightPerPiece: 1, thicknessRule: true }

  it('offers only the named plant’s coils — the OLDEST coil overall is skipped when it belongs to another plant', () => {
    // NPMD's is the oldest by date, so unfiltered FIFO would pick it first. This is the case that
    // fails loudly if the filter is missing: it is not "fewer coils", it is a DIFFERENT coil.
    const hyd = coilFifoAllocate({ ...twoPlant, pieces: 3, plant: 'hyderabad' })
    expect(hyd.allocations.map(a => a.hrCoilId)).toEqual(['HYD-0826-01-A'])
    const npm = coilFifoAllocate({ ...twoPlant, pieces: 3, plant: 'npmd' })
    expect(npm.allocations.map(a => a.hrCoilId)).toEqual(['NPM-0826-01-A'])
  })

  it('never spills across plants — a shortfall is reported rather than the other plant’s coil taken', () => {
    // 8 pieces against Hyderabad's 5 T. The 3 T it is short sit in NPMD's coil, in another state.
    // Allow + warn is unchanged: the batch still allocates what it can and reports the rest.
    const r = coilFifoAllocate({ ...twoPlant, pieces: 8, plant: 'hyderabad' })
    expect(r.allocations.map(a => a.hrCoilId)).toEqual(['HYD-0826-01-A'])
    expect(r.allocatedPieces).toBe(5)
    expect(r.shortfallPieces).toBe(3)
    expect(r.shortfall).toBe(true)
    // Unfiltered, those same 8 pieces DO fill from both — which is exactly what must never happen.
    expect(coilFifoAllocate({ ...twoPlant, pieces: 8 }).allocations).toHaveLength(2)
  })

  it('a plant with no coils of its own has no eligible coil — never another plant’s', () => {
    const r = coilFifoAllocate({ ...twoPlant, pieces: 3, plant: 'lepakshi' })
    expect(r.noEligibleCoil).toBe(true)
    expect(r.allocations).toHaveLength(0)
    // NPMD's opening state before it slits anything (#123): zero stock is correct, not a fault.
    const npmdEmpty = [{ hrCoilId: 'HYD-0826-01-A', plant: 'hyderabad', dateOfInward: '2026-08-05', thickness: 2.3, actualWeight: 5 }]
    expect(coilFifoAllocate({ ...twoPlant, coils: npmdEmpty, pieces: 3, plant: 'npmd' }).noEligibleCoil).toBe(true)
  })

  it('applies AHEAD of the thickness rule — an off-spec coil at my plant and a perfect one elsewhere both yield nothing', () => {
    // The plant filter is not a tie-breaker among eligible coils; it decides which coils are even
    // looked at. So a legal RM→FG pairing sitting in another plant is not "second choice", it is absent.
    const coils = [
      { hrCoilId: 'HYD-0826-02-A', plant: 'hyderabad', dateOfInward: '2026-08-01', thickness: 2.6, actualWeight: 9 }, // 2.6 rolls 2.8, not 2.5
      { hrCoilId: 'NPM-0826-02-A', plant: 'npmd', dateOfInward: '2026-08-01', thickness: 2.3, actualWeight: 9 },      // legal, wrong plant
    ]
    const r = coilFifoAllocate({ coils, skuThickness: 2.5, weightPerPiece: 1, pieces: 2, thicknessRule: true, plant: 'hyderabad' })
    expect(r.noEligibleCoil).toBe(true)
  })

  it('composes with prior consumption and the over-fill band inside one plant', () => {
    // Every rule above still applies, and applies only within the plant: Hyderabad's coil is
    // already 4 T consumed, so 1 T remains at nominal and the ±5% band adds 0.25 T on top.
    const consumedByCoil = { 'HYD-0826-01-A': 4 }
    const fine = { ...twoPlant, weightPerPiece: 0.1, consumedByCoil, plant: 'hyderabad' }
    const nominal = coilFifoAllocate({ ...fine, pieces: 10 })
    expect(nominal.allocatedPieces).toBe(10)
    expect(nominal.overTolerance).toBe(false)
    const stretched = coilFifoAllocate({ ...fine, pieces: 12 })
    expect(stretched.allocatedPieces).toBe(12)          // 1.2 T ≤ 5.25 T ceiling
    expect(stretched.overTolerance).toBe(true)
    // …and it still never reaches past the band into NPMD's untouched 5 T.
    const beyond = coilFifoAllocate({ ...fine, pieces: 40 })
    expect(beyond.allocations.map(a => a.hrCoilId)).toEqual(['HYD-0826-01-A'])
    expect(beyond.shortfall).toBe(true)
  })

  it('a deleted or weightless coil at my own plant is still ineligible', () => {
    const coils = [
      { hrCoilId: 'HYD-0826-03-A', plant: 'hyderabad', dateOfInward: '2026-08-01', thickness: 2.3, actualWeight: 5, deleted: true },
      { hrCoilId: 'HYD-0826-04-A', plant: 'hyderabad', dateOfInward: '2026-08-02', thickness: 2.3, actualWeight: 0 },
    ]
    expect(coilFifoAllocate({ coils, skuThickness: 2.5, weightPerPiece: 1, pieces: 2, thicknessRule: true, plant: 'hyderabad' }).noEligibleCoil).toBe(true)
  })

  it('selecting Unattributed offers only coils with no plant recorded', () => {
    // A pre-#120 baby coil never backfilled. It is reachable, but only by asking for it — it is
    // never swept in beside a real plant's coils, the same rule Unattributed carries everywhere.
    const coils = [...twoPlantCoils, { hrCoilId: 'HYD-0625-07-A', dateOfInward: '2025-06-01', thickness: 2.3, actualWeight: 5 }]
    expect(coilFifoAllocate({ ...twoPlant, coils, pieces: 3, plant: '' }).allocations.map(a => a.hrCoilId))
      .toEqual(['HYD-0625-07-A'])
    // …and it is absent from both real plants, despite being the oldest coil in the list.
    expect(coilFifoAllocate({ ...twoPlant, coils, pieces: 3, plant: 'hyderabad' }).allocations.map(a => a.hrCoilId))
      .toEqual(['HYD-0826-01-A'])
  })

  it('omitting plant allocates across every coil exactly as before — no existing caller changed', () => {
    // The default is ALL_PLANTS, the same pass-through sentinel filterByPlant already uses, so
    // `scripts/coil-realloc-dryrun.mjs` and every legacy call keep their behaviour. Plant-less
    // rows (every coil in the cases above this block) are included, not filtered out.
    const r = coilFifoAllocate({ ...twoPlant, pieces: 8 })
    expect(r.allocations.map(a => a.hrCoilId)).toEqual(['NPM-0826-01-A', 'HYD-0826-01-A'])  // oldest first
    expect(coilFifoAllocate({ ...twoPlant, pieces: 8, plant: ALL_PLANTS })).toEqual(r)
  })

  it('per-plant allocations sum to the unfiltered total when each plant is asked for its own', () => {
    // The same invariant the plant filter carries everywhere else (#121): scoping never makes
    // tonnage vanish. 5 pieces from each plant is the 10 the unfiltered call places across both.
    const each = ['hyderabad', 'npmd'].map(p => coilFifoAllocate({ ...twoPlant, pieces: 5, plant: p }))
    expect(each.map(r => r.allocatedPieces)).toEqual([5, 5])
    expect(each.reduce((s, r) => s + r.allocatedWeight, 0))
      .toBeCloseTo(coilFifoAllocate({ ...twoPlant, pieces: 10 }).allocatedWeight, 10)
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

// 37 of the ERP codes on the live order book have NO row in the SKU master (ordered, never
// produced). Their tube name exists only on the order line, so every SKU row has to carry its own
// description — without it the Sales drill-down and the PB MTD workbook printed the MM ID
// ('1140-13075-10078295') where the description belongs.
describe('salesByDistributor — description on the SKU drill-down row', () => {
  const desc = 'MS RHS One Helix IS 4923 YSt 210 Black 60x40x1.20x6000'
  const orders = [{ deleted: false, mmId: '1140-13075-10078295', description: desc,
    distributorCode: 'D1', orderStatus: 'Confirmed', confirmed: 5, nonConfirmed: 0 }]

  it('falls back to the order line when the SKU master has no row for the code', () => {
    const [row] = salesByDistributor(orders, [], '', [])
    expect(row.skuRows[0].description).toBe(desc)
    expect(row.skuRows[0].skuCode).toBe('1140-13075-10078295')  // ERP code still identifies the row
  })

  it('prefers the SKU master description when the master does carry the code', () => {
    const skus = [{ skuCode: '1140-13075-10078295', productType: 'RHS', height: 60, breadth: 40,
      thickness: 1.2, length: 6000, description: 'RHS 60x40x1.2 (master)' }]
    const [row] = salesByDistributor(orders, [], '', skus)
    expect(row.skuRows[0].description).toBe('RHS 60x40x1.2 (master)')
  })

  it('an invoice-only SKU (dispatch lines carry no description) is left blank, not filled with the code', () => {
    const dispatches = [{ deleted: false, dateOfDispatch: '2026-08-01',
      bundleEntries: [{ skuCode: 'NO-MASTER', weight: 3, distributorCode: 'D1' }] }]
    const [row] = salesByDistributor([], dispatches, '2026-08', [])
    expect(row.skuRows[0].description).toBe('')
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

describe('ship-to state (GST state codes)', () => {
  it('reads the state straight from the Orders sheet column, upper-cased', () => {
    // Orders sheet: "Ship to State" is filled on every row, "Ship to GST" is the literal 0.
    expect(resolveShipToState({ state: 'TELANGANA', shipToGst: 0, billToGst: '36AACCV0269P1ZU' })).toBe('TELANGANA')
    expect(resolveShipToState({ state: ' Tamil  Nadu ' })).toBe('TAMIL NADU')
  })

  it('decodes the state from the ship-to GSTIN prefix when no state column exists (Invoice sheet)', () => {
    expect(resolveShipToState({ shipToGst: '33AAACO6811C1Z0' })).toBe('TAMIL NADU')
    expect(resolveShipToState({ shipToGst: '29ABDCS6950L1Z0' })).toBe('KARNATAKA')
    expect(gstStateName('36AACCV0269P1ZU')).toBe('TELANGANA')
    expect(gstStateName('27AAACO6811C1Z0')).toBe('MAHARASHTRA')
  })

  it('covers every state/UT code, not just the ones in today\'s data', () => {
    expect(gstStateName('24AAAAA0000A1Z5')).toBe('GUJARAT')       // never shipped to yet
    expect(gstStateName('38AAAAA0000A1Z5')).toBe('LADAKH')
    expect(Object.keys(GST_STATE_CODES).length).toBeGreaterThanOrEqual(36)
  })

  it('falls back to the bill-to GSTIN when ship-to GST is the Orders sheet\'s literal 0 (or blank)', () => {
    expect(resolveShipToState({ state: '', shipToGst: 0, billToGst: '33AAACO6811C1Z0' })).toBe('TAMIL NADU')
    expect(resolveShipToState({ state: '', shipToGst: '0', billToGst: '29AAACO6811C1Z0' })).toBe('KARNATAKA')
    expect(resolveShipToState({ shipToGst: '', billToGst: '36AACCV0269P1ZU' })).toBe('TELANGANA')
  })

  it('stores blank for an unknown/unparseable prefix — never a guess', () => {
    expect(resolveShipToState({ shipToGst: '88AAACO6811C1Z0' })).toBe('')   // no such state code
    expect(resolveShipToState({ shipToGst: 'XXAAACO6811C1Z0' })).toBe('')   // non-numeric prefix
    expect(resolveShipToState({})).toBe('')
    expect(resolveShipToState({ state: '0', shipToGst: 0, billToGst: 0 })).toBe('')
    expect(gstStateName(null)).toBe('')
    // A pincode/city is never a source — 600019 must not resolve to Tamil Nadu.
    expect(resolveShipToState({ shipToGst: 600019 })).toBe('')
  })
})

describe('state → region master (ticket #102)', () => {
  it('ships the eight seed mappings and looks them up with no stored rows at all', () => {
    const idx = stateRegionIndex([])
    expect(regionForState('TELANGANA', idx)).toBe('South')
    expect(regionForState('ANDHRA PRADESH', idx)).toBe('South')
    expect(regionForState('KARNATAKA', idx)).toBe('South')
    expect(regionForState('TAMIL NADU', idx)).toBe('South')
    expect(regionForState('MAHARASHTRA', idx)).toBe('West')
    expect(regionForState('GUJARAT', idx)).toBe('West')
    expect(regionForState('KERALA', idx)).toBe('South')
    expect(regionForState('PUDUCHERRY', idx)).toBe('South')
    expect(DEFAULT_STATE_REGIONS).toHaveLength(8)
    // Every seeded region is one of the four; every seeded state is stored the way a line is.
    DEFAULT_STATE_REGIONS.forEach(r => {
      expect(REGIONS).toContain(r.region)
      expect(r.state).toBe(normStateName(r.state))
    })
    // Case / spacing can't miss a mapping: a line and its mapping normalise to one key.
    expect(regionForState(' tamil  nadu ', idx)).toBe('South')
  })

  it('an edited row overrides the seed, and the other seeded states survive the edit', () => {
    // The real half-populated case: the table holds ONLY the one state a human re-mapped.
    const idx = stateRegionIndex([{ id: 'x', state: 'TELANGANA', region: 'North', deleted: false }])
    expect(regionForState('TELANGANA', idx)).toBe('North')      // stored wins over the seed
    expect(regionForState('KARNATAKA', idx)).toBe('South')      // seed still in force
    expect(regionForState('GUJARAT', idx)).toBe('West')
  })

  it('maps a state the seed never had, and an explicit blank un-maps a seeded one', () => {
    const idx = stateRegionIndex([
      { id: 'a', state: 'WEST BENGAL', region: 'East', deleted: false },
      { id: 'b', state: 'GUJARAT', region: '', deleted: false },   // deliberately un-mapped
    ])
    expect(regionForState('WEST BENGAL', idx)).toBe('East')
    expect(regionForState('GUJARAT', idx)).toBe(UNMAPPED_REGION)
  })

  it('an un-mapping survives the Postgres round trip (toSnake writes the blank as NULL)', () => {
    const idx = stateRegionIndex([{ id: 'b', state: 'GUJARAT', region: null, deleted: false }])
    expect(regionForState('GUJARAT', idx)).toBe(UNMAPPED_REGION)   // not back to the seeded 'West'
  })

  it('an unmapped or missing state reads Unmapped, never blank and never a guess', () => {
    const idx = stateRegionIndex([])
    expect(regionForState('ODISHA', idx)).toBe(UNMAPPED_REGION)   // real state, no mapping
    expect(regionForState('', idx)).toBe(UNMAPPED_REGION)         // no state on the lines at all
    expect(regionForState(null, idx)).toBe(UNMAPPED_REGION)
    expect(REGIONS).not.toContain(UNMAPPED_REGION)                // Unmapped is not a fifth region
  })
})

describe('plant master + resolver (ticket #118)', () => {
  // The four Ship From Codes as they appear in the 18-Aug-2026 One Helix workbook.
  const HYD = 'V2482-2973-JODL-4144'
  const NPMD = 'V1865-2222-JODL-4081'
  const LEP = 'V2732-3276-JODL-4606'
  const TAPI = 'V2744-3288-JODL-4631'

  it('ships the four plants, each carrying everything a plant needs to be one', () => {
    expect(DEFAULT_PLANTS).toHaveLength(4)
    expect(PLANT_IDS).toEqual(['hyderabad', 'npmd', 'lepakshi', 'tapi'])
    expect(PLANTS.map(p => p.name)).toEqual(['Hyderabad', 'NPMD', 'Lepakshi', 'Tapi'])
    expect(PLANTS.map(p => p.erpCode)).toEqual([HYD, NPMD, LEP, TAPI])
    expect(PLANTS.map(p => p.coilPrefix)).toEqual(['HYD', 'NPM', 'LEP', 'TAP'])
    // All four run the pipeline (#156). Lepakshi and Tapi carried orders and had never produced
    // until then, and activating them was the one flipped boolean ADR-0004 promised.
    expect(PLANTS.filter(p => p.manufactures).map(p => p.id)).toEqual(['hyderabad', 'npmd', 'lepakshi', 'tapi'])
    PLANTS.forEach(p => {
      expect(p.erpNames.length).toBeGreaterThan(0)
      expect(p.id).toBe(p.id.trim())
    })
    // Ids and ERP codes are both unique — two plants sharing either would silently merge tonnage.
    expect(new Set(PLANT_IDS).size).toBe(4)
    expect(new Set(PLANTS.map(p => p.erpCode)).size).toBe(4)
  })

  it('resolves each of the four Ship From Codes to its plant', () => {
    const idx = plantIndex()
    expect(resolvePlant({ shipFromCode: HYD }, idx)).toBe('hyderabad')
    expect(resolvePlant({ shipFromCode: NPMD }, idx)).toBe('npmd')
    expect(resolvePlant({ shipFromCode: LEP }, idx)).toBe('lepakshi')
    expect(resolvePlant({ shipFromCode: TAPI }, idx)).toBe('tapi')
    // The index is optional — a caller that resolves one row need not build one.
    expect(resolvePlant({ shipFromCode: HYD })).toBe('hyderabad')
    // Case / spacing can't miss a mapping: an ERP row and its plant normalise to one key.
    expect(resolvePlant({ shipFromCode: ` ${HYD.toLowerCase()} ` }, idx)).toBe('hyderabad')
    expect(normPlantKey(' v2482-2973-jodl-4144 ')).toBe(HYD)
  })

  it('falls back to the ERP name only when the code is missing, never over it', () => {
    const idx = plantIndex()
    // Orders sheet calls it "CM name"; the Invoice sheet "Ship from location". Same strings.
    expect(resolvePlant({ name: 'NIPPON PIPES PRIVATE LIMITED' }, idx)).toBe('hyderabad')
    expect(resolvePlant({ name: 'New Pashchim Maharashtra Patra Depot' }, idx)).toBe('npmd')
    expect(resolvePlant({ name: 'lepakshi tubes private limited' }, idx)).toBe('lepakshi')
    // The code wins whenever it resolves. If the ERP ever ships a row whose name and code disagree,
    // the code is what the plant is — that is the whole point of keying on it.
    expect(resolvePlant({ shipFromCode: TAPI, name: 'NIPPON PIPES PRIVATE LIMITED' }, idx)).toBe('tapi')
  })

  it('both sheets resolve Hyderabad to one identity', () => {
    const idx = plantIndex()
    const fromOrders = resolvePlant({ shipFromCode: HYD, name: 'NIPPON PIPES PRIVATE LIMITED' }, idx)
    const fromInvoice = resolvePlant({ shipFromCode: HYD, name: 'NIPPON PIPES PRIVATE LIMITED' }, idx)
    expect(fromOrders).toBe(fromInvoice)
    expect(fromOrders).toBe('hyderabad')
  })

  it('an unrecognised or missing code resolves blank and reads Unattributed — never a guess', () => {
    const idx = plantIndex()
    expect(resolvePlant({ shipFromCode: 'V9999-0000-JODL-0001' }, idx)).toBe('')  // a fifth company
    expect(resolvePlant({ shipFromCode: '', name: 'SOME OTHER TUBES LTD' }, idx)).toBe('')
    expect(resolvePlant({}, idx)).toBe('')
    expect(resolvePlant(undefined, idx)).toBe('')
    expect(resolvePlant({ shipFromCode: null, name: null }, idx)).toBe('')
    // A near-miss name is not a match: plant is never inferred from a company it resembles.
    expect(resolvePlant({ name: 'NIPPON PIPES' }, idx)).toBe('')
    // All of those display as Unattributed, and Unattributed is not a fifth plant.
    expect(plantLabel('')).toBe(UNATTRIBUTED_PLANT)
    expect(plantLabel(null)).toBe(UNATTRIBUTED_PLANT)
    expect(plantLabel('no-such-plant')).toBe(UNATTRIBUTED_PLANT)
    expect(PLANT_IDS).not.toContain(UNATTRIBUTED_PLANT)
    expect(PLANTS.map(p => p.name)).not.toContain(UNATTRIBUTED_PLANT)
    expect(plantById('')).toBeNull()
    expect(plantById('no-such-plant')).toBeNull()
  })

  it('shows the SHORT display name, never the ERP’s own long one', () => {
    expect(plantLabel('npmd')).toBe('NPMD')
    expect(plantLabel('npmd')).not.toBe('New Pashchim Maharashtra Patra Depot')
    expect(plantLabel('hyderabad')).toBe('Hyderabad')
    expect(plantLabel('lepakshi')).toBe('Lepakshi')
    expect(plantLabel('tapi')).toBe('Tapi')
  })

  it('a blank plant survives the Postgres round trip (toSnake writes it as NULL)', () => {
    // orders.plant is text; toSnake turns '' into NULL on the way out, and it reads back as null.
    expect(plantLabel(null)).toBe(UNATTRIBUTED_PLANT)
    expect(plantLabel(undefined)).toBe(UNATTRIBUTED_PLANT)
  })

  it('resolves the 18-Aug-2026 order book: 670 / 138 / 55 / 52 and 0 Unattributed', () => {
    // The line counts the spec read off the file, rebuilt as rows the way mapOrderRow stores them.
    const idx = plantIndex()
    const sheet = [
      ...Array(670).fill({ shipFromCode: HYD, name: 'NIPPON PIPES PRIVATE LIMITED' }),
      ...Array(138).fill({ shipFromCode: NPMD, name: 'New Pashchim Maharashtra Patra Depot' }),
      ...Array(55).fill({ shipFromCode: LEP, name: 'LEPAKSHI TUBES PRIVATE LIMITED' }),
      ...Array(52).fill({ shipFromCode: TAPI, name: 'TAPI PIPES AND TUBES PRIVATE LIMITED' }),
    ]
    expect(sheet).toHaveLength(915)
    const byPlant = {}
    sheet.forEach(r => {
      const label = plantLabel(resolvePlant(r, idx))
      byPlant[label] = (byPlant[label] || 0) + 1
    })
    expect(byPlant).toEqual({ Hyderabad: 670, NPMD: 138, Lepakshi: 55, Tapi: 52 })
    expect(byPlant[UNATTRIBUTED_PLANT]).toBeUndefined()
    // Every line landed in exactly one plant — none dropped, none double-counted.
    expect(Object.values(byPlant).reduce((a, b) => a + b, 0)).toBe(915)
  })

  it('Unattributed tonnage stays inside the company total — it is never a "rest" bucket', () => {
    // Hyderabad's own 761.441 MT plus the three other plants' 1854.000 MT is the 2615.441 MT
    // Pending to Dispatch reads today. Add a line the ERP labelled with a fifth company: its
    // tonnage must still be in the total, sitting under Unattributed rather than outside the sum.
    const idx = plantIndex()
    const lines = [
      { shipFromCode: HYD, pending: 761.441 },
      { shipFromCode: NPMD, pending: 1044.000 },
      { shipFromCode: LEP, pending: 417.000 },
      { shipFromCode: TAPI, pending: 393.000 },
      { shipFromCode: 'V9999-0000-JODL-0001', pending: 12.500 },   // a company nobody mapped
    ]
    const byPlant = {}
    lines.forEach(l => {
      const label = plantLabel(resolvePlant(l, idx))
      byPlant[label] = (byPlant[label] || 0) + l.pending
    })
    expect(byPlant.Hyderabad).toBeCloseTo(761.441, 3)
    expect(byPlant[UNATTRIBUTED_PLANT]).toBeCloseTo(12.5, 3)
    // Per-plant sums equal the company total, Unattributed included.
    const company = lines.reduce((s, l) => s + l.pending, 0)
    expect(Object.values(byPlant).reduce((a, b) => a + b, 0)).toBeCloseTo(company, 3)
    expect(company).toBeCloseTo(2615.441 + 12.5, 3)
  })
})

describe('plant resolution off a RAW ERP row (follow-up to #118/#119)', () => {
  // The gap this closes: plant resolution used to live in App.jsx, which the suite cannot import,
  // so `pickPlant` could be rewritten to read a column that does not exist and all 323 tests still
  // passed. Every line in both sheets would have silently become Unattributed. These tests take the
  // RAW row — keys spelled exactly as the One Helix workbook spells them — so the header aliases
  // are what is under test, not a hand-made {shipFromCode, name} object that assumes them away.
  const ORDERS_HEADERS = { 'Ship From Code': 'V1865-2222-JODL-4081', 'CM name': 'New Pashchim Maharashtra Patra Depot' }
  const INVOICE_HEADERS = { 'Ship From Code': 'V2482-2973-JODL-4144', 'Ship from location': 'NIPPON PIPES PRIVATE LIMITED' }

  it('reads the Orders sheet\'s own header spelling', () => {
    expect(plantForErpRow(ORDERS_HEADERS)).toBe('npmd')
  })

  it('reads the Invoice sheet\'s own header spelling — no CM name column exists there', () => {
    expect(plantForErpRow(INVOICE_HEADERS)).toBe('hyderabad')
    // Prove the Invoice sheet really has no CM name: strip the code and the location name alone
    // must still carry it, or the fallback is dead code.
    expect(plantForErpRow({ 'Ship from location': 'NIPPON PIPES PRIVATE LIMITED' })).toBe('hyderabad')
  })

  it('matches headers however the ERP cases and spaces them', () => {
    // The picker lower-cases and strips . _ and spaces, so a re-cased export cannot drop a plant.
    expect(plantForErpRow({ 'SHIP_FROM_CODE': 'V2732-3276-JODL-4606' })).toBe('lepakshi')
    expect(plantForErpRow({ 'ship from code': 'V2744-3288-JODL-4631' })).toBe('tapi')
    expect(plantForErpRow({ 'Ship.From.Code': 'V2482-2973-JODL-4144' })).toBe('hyderabad')
  })

  it('the CODE wins over the name, on a raw row as much as anywhere', () => {
    expect(plantForErpRow({ 'Ship From Code': 'V2744-3288-JODL-4631', 'CM name': 'NIPPON PIPES PRIVATE LIMITED' })).toBe('tapi')
  })

  it('a row with no plant columns at all resolves blank, never throws', () => {
    expect(plantForErpRow({ 'Invoice number': 'INV-1', 'MM ID': 'SHS-50x50x2.00' })).toBe('')
    expect(plantForErpRow({})).toBe('')
    expect(plantForErpRow(undefined)).toBe('')
    expect(plantForErpRow({ 'Ship From Code': 'V9999-0000-JODL-0001' })).toBe('')
    expect(plantLabel(plantForErpRow({}))).toBe(UNATTRIBUTED_PLANT)
  })

  it('erpRowPicker normalises headers and skips blanks', () => {
    const pick = erpRowPicker({ 'Invoice Number': 'INV-1', 'Ship From Code': '', 'Ship from location': 'X' })
    expect(pick('invoicenumber')).toBe('INV-1')
    // A blank cell is not an answer — the picker falls through to the next alias.
    expect(pick('shipfromcode', 'shipfromlocation')).toBe('X')
    expect(pick('nosuchcolumn')).toBe('')
  })
})

describe('invoice lines carry their plant (ticket #119)', () => {
  // The Invoice sheet is shaped differently from Orders: it has NO "CM name" column at all. It
  // carries `Ship From Code` and a `Ship from location` name. The resolver keys on the code, so one
  // resolver serves both sheets — that is what makes an order line and an invoice line for the same
  // plant land on ONE id, and therefore what makes the tie-out below possible at all.
  const HYD = 'V2482-2973-JODL-4144'
  const NPMD = 'V1865-2222-JODL-4081'

  it('resolves an invoice-shaped row — no CM name, ship-from location instead', () => {
    const idx = plantIndex()
    // How mapDispatchRow reads the Invoice sheet: code first, "Ship from location" as the fallback.
    expect(resolvePlant({ shipFromCode: HYD, name: 'NIPPON PIPES PRIVATE LIMITED' }, idx)).toBe('hyderabad')
    // A sheet that dropped the code still resolves off the location name alone.
    expect(resolvePlant({ shipFromCode: '', name: 'NIPPON PIPES PRIVATE LIMITED' }, idx)).toBe('hyderabad')
    // An order line and an invoice line for the same plant are the SAME id — not two spellings of
    // one plant, which is what would silently split a plant's ordered and invoiced tonnage. The two
    // rows below are shaped as their OWN sheets are: Orders passes its `CM name`, Invoice has no
    // such column and passes `Ship from location` — genuinely different inputs, one answer.
    const orderLine = resolvePlant({ shipFromCode: NPMD, name: 'New Pashchim Maharashtra Patra Depot' }, idx)
    const invoiceLine = resolvePlant({ shipFromCode: NPMD, name: '' }, idx)
    expect(invoiceLine).toBe(orderLine)
    expect(orderLine).toBe('npmd')
    // An unrecognised ship-from imports as Unattributed; it never fails the upload and is counted.
    expect(resolvePlant({ shipFromCode: 'V9999-0000-JODL-0001', name: 'A FIFTH COMPANY LTD' }, idx)).toBe('')
  })

  it("shows a dispatch record's plant by short display name", () => {
    // The Dispatch view groups one record per invoice; plant lives on the ENTRIES, so the view
    // reads it back off them.
    expect(dispatchPlantLabel({ bundleEntries: [{ plant: 'hyderabad' }, { plant: 'hyderabad' }] })).toBe('Hyderabad')
    expect(dispatchPlantLabel({ bundleEntries: [{ plant: 'npmd' }] })).toBe('NPMD')
    // Never the ERP's own long name.
    expect(dispatchPlantLabel({ bundleEntries: [{ plant: 'npmd' }] })).not.toBe('New Pashchim Maharashtra Patra Depot')
    // One invoice ships from one plant, but if the ERP ever disagreed within an invoice the record
    // shows BOTH — visible, not silently resolved to whichever line came first.
    // Sorted, so the same record reads and exports identically whichever line came first.
    expect(dispatchPlantLabel({ bundleEntries: [{ plant: 'hyderabad' }, { plant: 'npmd' }] })).toBe('Hyderabad, NPMD')
    expect(dispatchPlantLabel({ bundleEntries: [{ plant: 'npmd' }, { plant: 'hyderabad' }] })).toBe('Hyderabad, NPMD')
  })

  it('a legacy dispatch entry with no stored plant loads and displays without error', () => {
    // Every dispatch entry written before this ticket has no `plant` key at all. It must read
    // Unattributed, exactly as an unresolved new line does — not blank, not a crash.
    expect(dispatchPlantLabel({ bundleEntries: [{ invoiceNo: 'INV-1', skuCode: 'SHS-50x50x2.00' }] })).toBe(UNATTRIBUTED_PLANT)
    expect(dispatchPlantLabel({ bundleEntries: [{ plant: '' }] })).toBe(UNATTRIBUTED_PLANT)
    expect(dispatchPlantLabel({ bundleEntries: [] })).toBe(UNATTRIBUTED_PLANT)
    expect(dispatchPlantLabel({})).toBe(UNATTRIBUTED_PLANT)
    expect(dispatchPlantLabel(undefined)).toBe(UNATTRIBUTED_PLANT)
    // A record half-migrated (one legacy entry, one new) shows both rather than hiding either.
    expect(dispatchPlantLabel({ bundleEntries: [{ plant: 'hyderabad' }, {}] })).toBe(`Hyderabad, ${UNATTRIBUTED_PLANT}`)
  })

  // The REAL per-line figures from the 18-Aug-2026 upload, read back out of the live store: the
  // invoice side is the `weight` of every stored dispatch entry, the orders side every non-zero
  // `Invoiced Qty` from the Orders sheet.
  //
  // Be honest about what this does and does not prove. The two arrays are NOT independent
  // measurements — the Orders sheet's `Invoiced Qty` is derived from the invoices, and the arrays
  // are in fact the same multiset apart from one order line (10.029) that shipped as two invoice
  // lines (6.028 + 4.001). So the sums agreeing is not corroboration from a second source. What it
  // does pin down is that attribution moves no weight: every line lands under exactly one plant and
  // the per-plant totals still add up to what came in. The column-level check that resolution is
  // actually right lives in the raw-ERP-row tests above.
  //
  // NOTE on the count: the spec says 600 invoice lines; 599 are stored. buildDispatchRecords drops
  // Freight and zero-quantity rows before storing, so the file's 600th row carries no tonnage —
  // which is why both totals still come out at exactly 3514.174 MT.
  const INVOICE_LINE_WEIGHTS = [
    7.386,6.041,5.021,4.161,5.011,2,5.985,20.6,0.985,15.265,1.15,10.45,7.295,9.734,10.218,12.873,6.158,6.15,
    10.264,2.008,5.96,7.97,8.14,14.01,6.39,4.1,10.3,6.15,3.85,8.25,6.203,4.074,4.038,3.828,5.433,3.96,2.4,
    7.972,6.16,3.925,5.96,4.245,1,4.25,5.975,5.98,10.1,5,5.05,5.1,10.2,9.815,5.7,7.9,10.035,2.08,3.22,1.98,
    3.4,5.38,8.15,1.95,2,3.965,1.97,2,4.3,4.08,2.03,2.1,2,4.07,4.05,4.255,4.05,3.75,2,4,3.9,11.003,13.737,
    6.868,6.044,3.6,6.86,3.878,2.05,14,8.03,6.05,5.95,4.04,6.38,1.7,17.265,4.1,2.16,6.25,5.95,3.95,1.95,3,
    4.105,6.3,4.25,2.04,4.1,4.4,4.05,4.06,6.1,1,4.9,4,4.05,6.115,4.8,6.75,2,9.948,2.096,1.976,2.128,4.06,3.97,
    2.22,4.005,3.99,2.05,2.015,1.935,3.967,2.988,4.075,1.2,3.18,6.105,2.995,4.181,5.8,6.14,2.33,4.07,2.01,
    4.07,4.235,0.75,2.985,4.87,6.4,5.02,5.07,3.96,4.15,4.185,4.1,6.1,2.15,3,2.05,1.85,2,4.15,2,6.15,2.095,3.9,
    2.1,2.05,4.05,4.95,4.73,5.83,5,5.25,4.9,4.15,6.026,18.974,5.973,6.012,4.1,4.115,4.25,4.1,6.105,3.05,6.5,6,
    7.13,4.91,2.14,1.98,7.103,5.112,2.06,6.3,1.74,4.04,6.175,5.98,20.06,15.95,8.3,6,2,4.9,7.98,5.18,11.97,
    4.07,8.557,8.122,4.836,13.035,4.18,7.15,8.05,6.07,4.105,7.16,10,5.98,1.965,5.995,7.155,6.385,6.235,3.95,
    3.05,5.625,2.85,5,5.09,5.05,5.1,4.75,5.5,5.25,4.73,5.55,2.15,6.09,5.94,1.99,5.925,6.12,6.27,10.59,8.18,
    6.08,3.97,5.98,8.79,5.92,9.45,9.98,6.88,7.9,4.4,5,8.05,5.104,2,16.25,2.13,6.015,3.75,1.96,9.8,4.1,4.05,
    3.335,4.05,3.98,6,6,6.065,4.22,2,6.05,6.725,7.971,6.028,9.912,16.917,4.03,6.16,6.1,2,4.015,6.2,4.22,3.9,
    2.025,2.15,2,2,4.1,4.05,4.1,2.3,2.05,4.68,9.2,5.26,16.663,6.25,10.1,6.15,5.815,2.27,4.1,5.25,1.2,5.63,
    5.86,18.33,6.04,5.2,9.9,2.05,6.05,4,4.05,3.75,4.2,4.1,1.96,4.18,3.95,8.1,3.87,9.8,17.475,4.85,3,3.08,5.15,
    4.35,5.1,5,8.6,6.25,0.9,5.05,4.05,5.3,10.1,5.055,4.06,3.2,6.07,4.06,2.96,5.05,3.95,2.9,5.05,4.15,5.05,
    4.055,3.1,2.055,1.99,9.73,3.1,3.95,4.17,5.13,2.085,3.945,2.03,2.03,2.2,2.07,4.09,2.16,2.115,4.025,5.23,
    14.44,3.29,2.1,2.91,4.02,15.2,3.23,19.44,10.31,5.45,5.15,5.1,3.04,2.95,5.05,2,2,2.02,1.55,8.5,4.96,7.05,
    5.15,9.97,4.275,2.08,2.05,5.43,4.045,4.25,4.05,4.1,4,5.455,5.85,5.1,5.4,3.5,5.05,5.7,7.086,7.674,10.15,
    6.04,6,6.06,4,6,2.2,3.915,2,2.15,6.3,4.1,5.63,16.07,4.22,8.15,8.28,4.435,4.05,8.15,2.76,10.05,5.815,2,6,
    9.5,8.02,6.1,7.85,2.1,6.25,20.58,4.01,6.13,5.985,6.18,8.46,5.2,10.3,4.98,5.94,4.135,22.43,3.29,5.1,5.6,
    5.05,4.99,5.385,3.85,10.4,6.9,6,4.093,25.857,5.1,10.05,5.2,11.88,2.97,6.955,3,8,15.15,5.02,5.21,6,6.2,
    5.918,12.2,6.086,5.166,9.975,14.345,22.18,4.65,6.55,5.915,5.75,2.23,2.065,4.6,1.95,4.87,5.7,2.05,2.05,5,
    4.3,5.4,4.95,3.05,10.18,3.24,4.14,21.345,8,17.14,5.156,4.946,6.413,5,12.37,30.4,19.44,8.24,8.48,5.83,
    4.058,4.148,4.338,7.587,4.222,5.682,5.7,4.64,6.35,2.9,2.1,18.465,2.1,6.6,7.252,8.05,7.17,4.001,9.964,3.3,
    2.025,2,6.05,10.31,6.005,6.05,6.35,6.75,1.05,6.135,2.68,6.235,5.115,3.66,4.25,5.985,14.946,10.345,6.115,
    7.948,7.316,2,9.94,6.05,5.1,6.26,5.2,6.9,2.19,20.46,16.145,8.11,3.475,4.57,29.775,4.258,4.15,4.105,3.972,
    20.035,10.03,4.8,2.185,5.6,8.24,29.475,8.05,8.35
  ]
  const ORDERS_INVOICED_QTY = [
    5,0.985,6.09,1.965,3,6.1,2.06,9.8,5.85,4.87,2.85,4.05,7.98,3.2,2.22,5.5,6.015,5.25,1.2,4.258,4.87,4.04,
    5.05,4.07,4.005,7.16,10.2,5.05,6.35,6.041,4,4.1,9.964,7.155,6.16,5.6,5.02,4.946,4.05,5.1,6,20.6,4.1,4.05,
    4.105,4.73,2,3.828,20.06,7.386,3.6,3,4.65,5,2.27,4.058,4.038,6.012,8.14,2.05,4.06,4.1,2.08,2.1,4.17,8.35,
    6.203,3.972,5.021,2.97,3.9,8.5,10.345,1.98,2,5,5.682,5.985,4.185,8.15,5.8,3.75,6.135,6,3.22,6.115,6.55,
    9.912,1.935,2.055,4.01,9.5,29.475,7.13,7.587,8.24,8.25,15.265,6,6.065,4.05,3.9,2.096,6,4.05,5.1,5.3,4.05,
    22.18,16.145,1,6.235,1.99,6.955,6.25,5.815,7.316,4.2,2.05,2.1,4.05,3.4,6.15,3.97,8.05,8.24,10.15,1.15,
    9.94,4.3,4.95,4.25,2,6.04,6.16,5.1,5.05,4.1,1,5.05,2.05,2,2.185,20.035,5.815,5.1,5.21,6.05,4.25,7.971,7.9,
    4.836,5.166,5.385,7.086,2.03,4.85,3.08,2.14,6.04,10.45,4.3,1.85,6.15,2,3.18,9.8,6.3,4.07,3.99,4.09,4.025,
    3.3,6.25,5.13,5.15,7.252,2.988,1.99,8.79,6.88,3.5,6.413,6.38,3.24,4.15,4.8,4.275,10.4,6.14,9.734,2.07,
    2.15,16.25,4.1,4.161,6.6,2,3.925,10.029,5.05,8.05,13.737,4.57,3.98,5.95,4,3,8.48,2.03,4.075,4.8,2.08,3.1,
    3.29,7.295,2,6.105,4.06,10.31,29.775,8,5.433,5.1,4.15,6.044,2,10.05,6.26,7.97,3.66,3.75,4.9,2.2,5.915,
    0.75,6.105,5.92,2.115,4.18,30.4,2.008,2,15.95,5.455,8.15,2.96,2.015,6.385,2,2,10.264,16.917,4.68,5.011,
    2.15,5.973,4.181,2.1,4.73,19.44,5.2,5.055,5,4,5.43,5.75,4.07,3.945,4.4,4.15,1.74,4.22,1.05,14,4.9,2.128,
    5.55,1.55,4.148,3.475,5.02,2.1,6.05,2.995,2.23,4.14,2,5.38,1.95,2.9,2.05,2.3,5.985,5.15,6.35,1.96,2,4.25,
    3.85,5,8.02,2.085,2.02,4.1,15.15,5.07,4.08,5,2.095,2.065,3.29,2.68,8.15,4.05,1.976,5.25,6.25,4.105,4.91,
    5.4,5.98,6,4.435,5.985,8,3.915,2,2,15.2,3.04,8.46,12.37,1.2,8.03,6.3,21.345,5.83,6.07,2.01,5.1,7.17,5.05,
    4.75,4.05,6.158,7.948,2.1,2.05,4.22,6,5.4,2.9,10.3,20.46,4.4,5.918,6.5,6.08,4.99,3.96,6.026,8.6,11.88,
    6.05,5.2,3.05,5.15,18.465,4.1,4.115,6.9,6.1,8.18,3.87,17.265,6.1,6.27,1.95,2.05,4.04,10.035,5.7,6.12,3.95,
    9.9,20.58,6.13,22.43,2.025,5.112,9.975,14.946,4.1,3.23,1.7,4.06,5.98,10.59,2.985,10.05,5.18,6,3.95,4.222,
    10.18,14.01,6.05,17.14,4.9,7.674,2.16,2.03,13.035,6.725,2,10,6.05,4.96,5.925,8.3,5.98,4.95,4.055,4.05,
    19.44,6,6.3,10.1,5.83,5.05,4.98,6.05,2.05,9.815,4.015,10.1,2.15,6,5.104,18.33,10.218,5.995,4.02,2.13,0.9,
    6.86,14.345,6.39,2,6.25,3.97,3.967,7.103,2.16,5.2,5.09,3.95,8.122,5.25,16.663,1.98,4.05,10.3,5.625,4.22,2,
    9.948,5.05,4,4.25,5.63,3.05,2.2,2.4,4.135,5.45,4.1,6.1,3.96,4.15,3.05,5.115,4.15,2.33,7.85,10.03,3.1,5.94,
    5.26,10.31,4.1,5.7,5.23,4.25,11.97,2.025,3,1.96,6.15,8.1,5.7,6.2,6.005,2.76,4,2.04,6.2,5.05,5.96,4.245,
    7.15,4.35,4.338,8.11,2.95,6.18,5.156,4.18,1.95,8.28,3.335,4.07,5.95,3.95,3.85,2.05,12.873,2.15,6.07,6.15,
    6.868,6.75,2,2.19,14.44,6.06,4.045,4.255,8.05,12.2,9.45,3.95,5.6,5.86,8.557,4.235,9.73,2.05,11.003,2.91,
    5.1,3.878,1.97,6.175,4.03,5.96,3.75,17.475,5.7,4.64,6.4,3.965,5.2,6.9,4.6,7.9,6.235,4.1,5.98,4.093,4.06,2,
    3.9,7.972,8.05,9.2,4.074,9.97,5.63,5,2.1,5.94,6.115,10.1,4.05,6.75,6.086,9.98,25.857,5.1,4.1,18.974,4.105,
    16.07,7.05,5.975,4.1
  ]

  it('resolves every 18-Aug-2026 invoice line to Hyderabad, totalling 3514.174 MT', () => {
    const idx = plantIndex()
    // Every stored line, carrying the ship-from the Invoice sheet actually holds on all of them.
    const lines = INVOICE_LINE_WEIGHTS.map(weight => ({
      shipFromCode: HYD, name: 'NIPPON PIPES PRIVATE LIMITED', weight,
    }))
    expect(lines).toHaveLength(599)
    const byPlant = {}
    lines.forEach(l => {
      const label = plantLabel(resolvePlant(l, idx))
      byPlant[label] = (byPlant[label] || 0) + l.weight
    })
    // One plant, no leakage: not a single line fell out to Unattributed.
    expect(Object.keys(byPlant)).toEqual(['Hyderabad'])
    expect(byPlant[UNATTRIBUTED_PLANT]).toBeUndefined()
    expect(byPlant.Hyderabad).toBeCloseTo(3514.174, 3)
    // Attribution moves no weight: what went in is what came out.
    const rawTotal = INVOICE_LINE_WEIGHTS.reduce((a, b) => a + b, 0)
    expect(byPlant.Hyderabad).toBeCloseTo(rawTotal, 6)
  })

  it("ties Hyderabad's invoiced tonnage to the Orders sheet's Invoiced Qty", () => {
    // If plant resolution ever split Hyderabad across two ids, or swept a line into Unattributed,
    // these two stop matching. See the note on the fixtures above for what this does not prove.
    const idx = plantIndex()
    const invoiceSide = INVOICE_LINE_WEIGHTS
      .map(weight => ({ shipFromCode: HYD, weight }))
      .filter(l => resolvePlant(l, idx) === 'hyderabad')
      .reduce((s, l) => s + l.weight, 0)
    const ordersSide = ORDERS_INVOICED_QTY.reduce((a, b) => a + b, 0)
    expect(invoiceSide).toBeCloseTo(ordersSide, 3)
    expect(invoiceSide).toBeCloseTo(3514.174, 3)
  })
})

describe('pipeline rows carry their plant (ticket #120)', () => {
  it('offers all four plants at Coil Inward, and still defaults a new coil to Hyderabad (ticket #156)', () => {
    // Plant is typed ONCE, here, and inherited downstream. NPMD's own `NPM-` prefix and running
    // number were readied in #122 (see 'nextCoilNumber' / 'genHRCoilId' above); #123 is the one
    // line — COIL_INWARD_PLANT_IDS — that actually offered it alongside Hyderabad. #156 put
    // Lepakshi and Tapi on that same line, on the same plant-aware numbering, which is why their
    // activation needed no numbering work of its own.
    expect(coilInwardPlants().map(p => p.id)).toEqual(['hyderabad', 'npmd', 'lepakshi', 'tapi'])
    expect(coilInwardPlants().map(p => p.name)).toEqual(['Hyderabad', 'NPMD', 'Lepakshi', 'Tapi'])
    // Hyderabad is still FIRST, which is the whole of why the default did not move: an ordinary
    // Hyderabad coil is one click now exactly as it was before three plants joined the list.
    expect(DEFAULT_COIL_PLANT).toBe('hyderabad')
    // Whatever is offered is a real plant that manufactures — never a label, never Unattributed.
    coilInwardPlants().forEach(p => {
      expect(plantById(p.id)).not.toBeNull()
      expect(p.manufactures).toBe(true)
    })
    expect(coilInwardPlants().some(p => p.id === DEFAULT_COIL_PLANT)).toBe(true)
    // `manufactures` stays the one-line switch ADR-0004 promised: flip ANY plant off and it alone
    // stops being offered here, without anyone remembering this second list exists. Checked for
    // every plant independently — a rule that holds only for whichever one the test happened to
    // pick is not the rule.
    PLANT_IDS.forEach(id => {
      const off = DEFAULT_PLANTS.map(p => p.id === id ? { ...p, manufactures: false } : p)
      expect(coilInwardPlants(off).map(p => p.id)).toEqual(PLANT_IDS.filter(x => x !== id))
    })
    // And the other half of the intersection, which every plant on the master now satisfies and so
    // no real plant can demonstrate: manufacturing on the master but ABSENT from the rollout list
    // is still not offered. The plant is fictional and must stay fictional — the same hostage
    // problem #155 fixed, and the reason activating four plants could not quietly empty this half.
    const extra = { id: 'fictional-not-rolled-out', erpCode: '', erpNames: [], name: 'Fictional Works', coilPrefix: 'FNR', manufactures: true, serves: [] }
    expect(COIL_INWARD_PLANT_IDS).not.toContain(extra.id)
    expect(coilInwardPlants([...DEFAULT_PLANTS, extra]).map(p => p.id)).toEqual(PLANT_IDS)
  })

  it("takes a baby coil's plant from its mother, never from the form", () => {
    // Slitting picks a mother coil and types widths. Plant is not among the things it types —
    // it is read off the mother every time the row is saved, so an edit cannot move a baby coil
    // to another plant and a mis-slit cannot be corrected into one.
    expect(babyCoilPlant({ hrCoilId: 'HYD-0826-01', plant: 'hyderabad' })).toBe('hyderabad')
    expect(babyCoilPlant({ hrCoilId: 'NPM-0826-01', plant: 'npmd' })).toBe('npmd')
    // No mother in hand (a baby coil whose mother was deleted, or a form with nothing picked yet)
    // stores blank rather than guessing at Hyderabad — the same discipline as an unresolved line.
    expect(babyCoilPlant(null)).toBe('')
    expect(babyCoilPlant(undefined)).toBe('')
    expect(babyCoilPlant({})).toBe('')
    // A mother registered before this ticket and not yet backfilled reads blank, not a crash.
    expect(babyCoilPlant({ hrCoilId: 'HYD-0625-07' })).toBe('')
    expect(plantLabel(babyCoilPlant({ hrCoilId: 'HYD-0625-07' }))).toBe(UNATTRIBUTED_PLANT)
  })

  it("takes a production's plant from the baby coils it consumes", () => {
    // Production types a date, an SKU and a piece count — never a plant. Its plant is wherever the
    // strip it ate was sitting.
    const babyCoils = [
      { babyCoilId: 'HYD-0826-01-A', hrCoilId: 'HYD-0826-01', plant: 'hyderabad' },
      { babyCoilId: 'HYD-0826-01-B', hrCoilId: 'HYD-0826-01', plant: 'hyderabad' },
      { babyCoilId: 'NPM-0826-01-A', hrCoilId: 'NPM-0826-01', plant: 'npmd' },
    ]
    const coils = [
      { hrCoilId: 'HYD-0826-01', plant: 'hyderabad' },
      { hrCoilId: 'NPM-0826-01', plant: 'npmd' },
      { hrCoilId: 'HYD-0625-07' },
    ]
    const alloc = (babyCoilId, hrCoilId) => ({ babyCoilId, hrCoilId, pieces: 100, weight: 1.2 })

    expect(productionPlant([alloc('HYD-0826-01-A', 'HYD-0826-01')], babyCoils, coils)).toBe('hyderabad')
    // Several baby coils off the same floor are still one plant.
    expect(productionPlant(
      [alloc('HYD-0826-01-A', 'HYD-0826-01'), alloc('HYD-0826-01-B', 'HYD-0826-01')], babyCoils, coils,
    )).toBe('hyderabad')
    expect(productionPlant([alloc('NPM-0826-01-A', 'NPM-0826-01')], babyCoils, coils)).toBe('npmd')
  })

  it('leaves a production unattributed when its coils disagree or say nothing', () => {
    const babyCoils = [
      { babyCoilId: 'HYD-0826-01-A', hrCoilId: 'HYD-0826-01', plant: 'hyderabad' },
      { babyCoilId: 'NPM-0826-01-A', hrCoilId: 'NPM-0826-01', plant: 'npmd' },
    ]
    const coils = [
      { hrCoilId: 'HYD-0826-01', plant: 'hyderabad' },
      { hrCoilId: 'NPM-0826-01', plant: 'npmd' },
    ]
    const alloc = (babyCoilId, hrCoilId) => ({ babyCoilId, hrCoilId, pieces: 100, weight: 1.2 })

    // A batch fed from two plants is not one plant's, so it is filed under neither. FIFO and the
    // manual picker never cross plants, so this is a data fault to SEE — not one to resolve by
    // taking whichever coil happened to be listed first.
    const crossPlant = productionPlant(
      [alloc('HYD-0826-01-A', 'HYD-0826-01'), alloc('NPM-0826-01-A', 'NPM-0826-01')], babyCoils, coils,
    )
    expect(crossPlant).toBe('')
    expect(plantLabel(crossPlant)).toBe(UNATTRIBUTED_PLANT)
    // An unallocated batch has eaten nothing, so there is nothing to inherit from.
    expect(productionPlant([], babyCoils, coils)).toBe('')
    expect(productionPlant(undefined, babyCoils, coils)).toBe('')
    // A production saved before this ticket carries mother-only allocations and a `traceHrCoilId`
    // shape with no baby coil at all — it still resolves, off the mother.
    expect(productionPlant([{ hrCoilId: 'HYD-0826-01', pieces: 40 }], babyCoils, coils)).toBe('hyderabad')
    // A baby coil not yet backfilled falls back to its mother rather than reading Unattributed.
    expect(productionPlant(
      [alloc('HYD-0826-01-C', 'HYD-0826-01')],
      [...babyCoils, { babyCoilId: 'HYD-0826-01-C', hrCoilId: 'HYD-0826-01' }],
      coils,
    )).toBe('hyderabad')
    // Neither side knows: blank, never a guess.
    expect(productionPlant([alloc('X-1', 'X')], [], [])).toBe('')
  })
})

describe('normalizeProductionPoNo — the CM PO is stamped in one canonical shape', () => {
  // A stamp with no master behind it is only as useful as it is consistent. Trim + uppercase is
  // the whole rule: enough that the same PO typed on two shifts collapses to one datalist entry,
  // not so much that it reformats a number whose format belongs to the contract manufacturer.
  it('trims and uppercases, leaving inner formatting alone', () => {
    expect(normalizeProductionPoNo('  po/2026/114 ')).toBe('PO/2026/114')
    expect(normalizeProductionPoNo('PO-2026-114')).toBe('PO-2026-114')
    expect(normalizeProductionPoNo('po 2026 114')).toBe('PO 2026 114')   // inner spacing kept
  })

  it('treats blank-ish input as blank, never as a value', () => {
    // Blank is a real state here: every production row predating this field has one, and the
    // create-path guard must read all of these as "no PO given".
    expect(normalizeProductionPoNo('')).toBe('')
    expect(normalizeProductionPoNo('   ')).toBe('')
    expect(normalizeProductionPoNo(null)).toBe('')
    expect(normalizeProductionPoNo(undefined)).toBe('')
  })

  it('is idempotent — re-saving a row cannot drift its PO', () => {
    const once = normalizeProductionPoNo(' po/2026/114 ')
    expect(normalizeProductionPoNo(once)).toBe(once)
  })
})

describe('productionPoOptions — the datalist behind the PO box', () => {
  const rows = [
    { productionPoNo: 'PO/2026/114' },
    { productionPoNo: 'po/2026/114 ' },              // same PO, typed differently → one entry
    { productionPoNo: 'PO/2026/113' },
    { productionPoNo: '' },                          // pre-PO row: contributes nothing
    { productionPoNo: 'PO/2026/999', deleted: true },// soft-deleted batch is not a record
    {},                                              // legacy row with no field at all
  ]

  it('collapses case/whitespace variants and drops blanks, deleted and legacy rows', () => {
    expect(productionPoOptions(rows)).toEqual(['PO/2026/113', 'PO/2026/114'])
  })

  it('survives an empty or missing register', () => {
    expect(productionPoOptions([])).toEqual([])
    expect(productionPoOptions()).toEqual([])
  })
})

describe('withDispatchEntries — a dispatch record derives its weight from its entries', () => {
  // The invariant both the daily upload and the plant filter go through, so one invoice can never
  // weigh two different things depending on which code path last touched it.
  it('derives theoreticalWeight, selectedBundles and variance from the entries', () => {
    const entries = [{ weight: 4 }, { weight: 3 }]
    const r = withDispatchEntries({ id: 'd1', vehicleWeight: 10, invoiceNo: 'INV-1' }, entries)
    expect(r.theoreticalWeight).toBeCloseTo(7, 6)
    expect(r.bundleEntries).toBe(entries)
    expect(r.selectedBundles).toBe(entries)
    expect(r.variance).toBeCloseTo(3, 6)          // 10 T vehicle − 7 T of pipe
    expect(r.invoiceNo).toBe('INV-1')             // everything else carries through untouched
  })

  it('reports no variance when nothing was weighed, and survives empty/blank input', () => {
    // No weighbridge reading is NOT a variance of the whole load — it is no measurement at all.
    expect(withDispatchEntries({ id: 'd1' }, [{ weight: 4 }]).variance).toBe(0)
    expect(withDispatchEntries({ id: 'd1', vehicleWeight: 0 }, [{ weight: 4 }]).variance).toBe(0)
    expect(withDispatchEntries({ id: 'd1' }, []).theoreticalWeight).toBe(0)
    expect(withDispatchEntries({ id: 'd1' }, undefined).bundleEntries).toEqual([])
    expect(withDispatchEntries(undefined, [{ weight: 2 }]).theoreticalWeight).toBeCloseTo(2, 6)
    // A blank/absent weight is 0, never NaN — one bad line may not poison an invoice's total.
    expect(withDispatchEntries({ id: 'd1' }, [{ weight: '' }, { weight: 2 }]).theoreticalWeight).toBeCloseTo(2, 6)
  })

  it('is the same arithmetic the plant filter applies, so a filtered read cannot disagree', () => {
    const record = { id: 'd1', vehicleWeight: 10, bundleEntries: [
      { plant: 'hyderabad', weight: 4 }, { plant: 'hyderabad', weight: 3 }, { plant: 'npmd', weight: 3 },
    ] }
    const viaFilter = filterDispatchesByPlant([record], 'hyderabad')[0]
    const viaHelper = withDispatchEntries(record, record.bundleEntries.filter(e => e.plant === 'hyderabad'))
    expect(viaFilter.theoreticalWeight).toBeCloseTo(viaHelper.theoreticalWeight, 6)
    expect(viaFilter.variance).toBeCloseTo(viaHelper.variance, 6)
  })
})

describe('plant filter — the header selector (ticket #121)', () => {
  it('lists All Plants first, the four plants in master order, then Unattributed last', () => {
    const opts = plantFilterOptions()
    expect(opts.map(o => o.id)).toEqual([ALL_PLANTS, 'hyderabad', 'npmd', 'lepakshi', 'tapi', ''])
    expect(opts.map(o => o.name)).toEqual(['All Plants', 'Hyderabad', 'NPMD', 'Lepakshi', 'Tapi', UNATTRIBUTED_PLANT])
  })

  it('All Plants is a pass-through — filtering never runs, so nothing on screen may move', () => {
    const orders = [{ plant: 'hyderabad' }, { plant: 'npmd' }, { plant: '' }, {}]
    expect(filterByPlant(orders, ALL_PLANTS)).toBe(orders)
    expect(filterDispatchesByPlant([{ bundleEntries: [{ plant: 'hyderabad', weight: 1 }] }], ALL_PLANTS))
      .toEqual([{ bundleEntries: [{ plant: 'hyderabad', weight: 1 }] }])
  })

  it('scopes any plant-carrying row array to one plant, Unattributed included', () => {
    const coils = [
      { hrCoilId: 'HYD-1', plant: 'hyderabad' },
      { hrCoilId: 'HYD-2', plant: 'hyderabad' },
      { hrCoilId: 'NPM-1', plant: 'npmd' },
      { hrCoilId: 'OLD-1' },            // pre-#120, never backfilled — blank, not a guess
    ]
    expect(filterByPlant(coils, 'hyderabad').map(c => c.hrCoilId)).toEqual(['HYD-1', 'HYD-2'])
    expect(filterByPlant(coils, 'npmd').map(c => c.hrCoilId)).toEqual(['NPM-1'])
    expect(filterByPlant(coils, 'lepakshi')).toEqual([])
    expect(filterByPlant(coils, '').map(c => c.hrCoilId)).toEqual(['OLD-1'])
    // Every row lands in exactly one selection — filtering can only partition, never drop or double.
    const total = ['hyderabad', 'npmd', 'lepakshi', 'tapi', ''].reduce((n, p) => n + filterByPlant(coils, p).length, 0)
    expect(total).toBe(coils.length)
  })

  it('Hyderabad alone reads 761.441 MT of the 2615.441 MT All Plants Pending to Dispatch (#117)', () => {
    // Rows CONSTRUCTED to the per-plant tonnages #117 published off the 18-Aug-2026 file —
    // Hyderabad's own 761.441 MT plus the 1854.000 MT of NPMD/Lepakshi/Tapi that was counted as
    // Hyderabad's before #118. This is a fixture, not a measurement: it proves `filterByPlant` and
    // `salesKpis` compose to the right split, NOT that the deployed data sums to these figures.
    // Confirming that needs #118's `orders.plant` column (unrun in production) and a daily upload.
    // The 5th row below is an extra Unattributed line, so the grand total here is 2627.941, not
    // 2615.441 — the four real plants are what sum to the spec's figure.
    const orders = [
      { plant: 'hyderabad', confirmed: 400, nonConfirmed: 361.441, deleted: false },
      { plant: 'npmd', confirmed: 0, nonConfirmed: 1044.000, deleted: false },
      { plant: 'lepakshi', confirmed: 0, nonConfirmed: 417.000, deleted: false },
      { plant: 'tapi', confirmed: 0, nonConfirmed: 393.000, deleted: false },
      { plant: '', confirmed: 0, nonConfirmed: 12.5, deleted: false },   // a fifth company nobody mapped
    ]
    expect(salesKpis(orders, []).pending).toBeCloseTo(2615.441 + 12.5, 3)
    expect(salesKpis(filterByPlant(orders, 'hyderabad'), []).pending).toBeCloseTo(761.441, 3)
    expect(salesKpis(filterByPlant(orders, 'npmd'), []).pending).toBeCloseTo(1044.000, 3)
    expect(salesKpis(filterByPlant(orders, 'lepakshi'), []).pending).toBeCloseTo(417.000, 3)
    expect(salesKpis(filterByPlant(orders, 'tapi'), []).pending).toBeCloseTo(393.000, 3)
    expect(salesKpis(filterByPlant(orders, ''), []).pending).toBeCloseTo(12.5, 3)
    // Per-plant sums equal the All Plants total — filtering never makes weight vanish.
    const summed = ['hyderabad', 'npmd', 'lepakshi', 'tapi', ''].reduce(
      (s, p) => s + salesKpis(filterByPlant(orders, p), []).pending, 0)
    expect(summed).toBeCloseTo(salesKpis(orders, []).pending, 3)
  })

  it('filters a dispatch record down to one plant\'s entries and re-derives theoreticalWeight', () => {
    const dispatches = [{
      id: 'd1', vehicleWeight: 10,
      bundleEntries: [
        { plant: 'hyderabad', weight: 4, skuCode: 'A' },
        { plant: 'hyderabad', weight: 3, skuCode: 'B' },
        { plant: 'npmd', weight: 3, skuCode: 'C' },
      ],
    }]
    const hyd = filterDispatchesByPlant(dispatches, 'hyderabad')
    expect(hyd).toHaveLength(1)
    expect(hyd[0].bundleEntries).toHaveLength(2)
    expect(hyd[0].theoreticalWeight).toBeCloseTo(7, 3)
    expect(hyd[0].selectedBundles).toEqual(hyd[0].bundleEntries)

    const npm = filterDispatchesByPlant(dispatches, 'npmd')
    expect(npm[0].theoreticalWeight).toBeCloseTo(3, 3)

    // A plant with no matching entry on this invoice drops the record entirely.
    expect(filterDispatchesByPlant(dispatches, 'lepakshi')).toEqual([])
    expect(filterDispatchesByPlant(dispatches, '')).toEqual([])
  })

  it('per-plant dispatch tonnage sums to the All Plants total, Unattributed included', () => {
    const dispatches = [
      { id: 'd1', bundleEntries: [{ plant: 'hyderabad', weight: 4 }, { plant: 'npmd', weight: 3 }] },
      { id: 'd2', bundleEntries: [{ plant: 'lepakshi', weight: 2 }] },
      { id: 'd3', bundleEntries: [{ weight: 1.5 }] },                         // legacy pre-#119, no plant key
    ]
    const totalWeight = (arr) => arr.flatMap(d => d.bundleEntries).reduce((s, e) => s + Number(e.weight || 0), 0)
    const allTotal = totalWeight(dispatches)
    const summed = ['hyderabad', 'npmd', 'lepakshi', 'tapi', ''].reduce(
      (s, p) => s + totalWeight(filterDispatchesByPlant(dispatches, p)), 0)
    expect(allTotal).toBeCloseTo(10.5, 3)
    expect(summed).toBeCloseTo(allTotal, 3)
  })
})

describe('crossPlantAllocationRows — the save guard (ticket #124)', () => {
  // Scoping the two pickers decides what an operator can be SHOWN. This decides what they can
  // PERSIST — and the two are not the same check, because the rows outlive a change of plant.
  const babyCoils = [
    { babyCoilId: 'HYD-0826-01-A', plant: 'hyderabad' },
    { babyCoilId: 'HYD-0826-01-B', plant: 'hyderabad' },
    { babyCoilId: 'NPM-0826-01-A', plant: 'npmd' },
    { babyCoilId: 'OLD-0625-07-A' },                       // pre-#120, never backfilled ⇒ Unattributed
  ]

  it('catches the rows a change of plant leaves behind — the hole scoping the pickers alone leaves', () => {
    // Pick Hyderabad coils, switch the header to NPMD, add an NPMD row. Both pickers are correctly
    // scoped to NPMD throughout, and the allocation still spans two plants. Without this the batch
    // saved, and `productionPlant` filed it under Unattributed rather than refusing it.
    const rows = [
      { babyCoilId: 'HYD-0826-01-A', pieces: 3 },
      { babyCoilId: 'NPM-0826-01-A', pieces: 2 },
    ]
    expect(crossPlantAllocationRows(rows, babyCoils, 'npmd').map(r => r.babyCoilId)).toEqual(['HYD-0826-01-A'])
    expect(crossPlantAllocationRows(rows, babyCoils, 'hyderabad').map(r => r.babyCoilId)).toEqual(['NPM-0826-01-A'])
  })

  it('passes a single-plant allocation, however many coils it spans', () => {
    const rows = [{ babyCoilId: 'HYD-0826-01-A', pieces: 3 }, { babyCoilId: 'HYD-0826-01-B', pieces: 4 }]
    expect(crossPlantAllocationRows(rows, babyCoils, 'hyderabad')).toEqual([])
  })

  it('returns the offending rows, not a boolean — the caller names the coils on screen', () => {
    // Naming them is the difference between a stop an operator can act on and one they can only
    // stare at. Nothing is dropped: the tonnage is theirs to clear, not the app's to delete.
    const rows = [
      { _rid: 'r1', babyCoilId: 'HYD-0826-01-A', pieces: 3 },
      { _rid: 'r2', babyCoilId: 'HYD-0826-01-B', pieces: 1 },
      { _rid: 'r3', babyCoilId: 'NPM-0826-01-A', pieces: 2 },
    ]
    const offending = crossPlantAllocationRows(rows, babyCoils, 'npmd')
    expect(offending).toHaveLength(2)
    expect(offending.map(r => r._rid)).toEqual(['r1', 'r2'])
    expect(offending[0].pieces).toBe(3)                    // the row itself, intact
  })

  it('an empty row is not a cross-plant row', () => {
    // A row with pieces but no coil picked yet is a different fault, with its own badge.
    expect(crossPlantAllocationRows([{ babyCoilId: '', pieces: 5 }, { pieces: 2 }], babyCoils, 'hyderabad')).toEqual([])
  })

  it('scopes Unattributed like any other selection', () => {
    const rows = [{ babyCoilId: 'OLD-0625-07-A', pieces: 1 }, { babyCoilId: 'HYD-0826-01-A', pieces: 1 }]
    expect(crossPlantAllocationRows(rows, babyCoils, '').map(r => r.babyCoilId)).toEqual(['HYD-0826-01-A'])
  })

  it('flags a coil that does not exist at all, so a stale row can never be persisted', () => {
    // A coil deleted (hard-delete table) while the form was open. It is at no plant, so it is at
    // not-this-plant — the guard refuses it rather than writing an allocation pointing nowhere.
    expect(crossPlantAllocationRows([{ babyCoilId: 'GONE-A', pieces: 1 }], babyCoils, 'hyderabad')
      .map(r => r.babyCoilId)).toEqual(['GONE-A'])
  })

  it('under ALL_PLANTS nothing is cross-plant — the guard never blocks a caller that did not scope', () => {
    // filterByPlant passes everything through on the sentinel, so this composes with the default
    // exactly as the rest of the plant helpers do. Production never reaches here under All Plants
    // (the form is withheld), but the helper stays honest on its own terms.
    const rows = [{ babyCoilId: 'HYD-0826-01-A', pieces: 1 }, { babyCoilId: 'NPM-0826-01-A', pieces: 1 }]
    expect(crossPlantAllocationRows(rows, babyCoils, ALL_PLANTS)).toEqual([])
  })

  it('handles missing inputs without throwing', () => {
    expect(crossPlantAllocationRows(null, babyCoils, 'hyderabad')).toEqual([])
    expect(crossPlantAllocationRows([{ babyCoilId: 'HYD-0826-01-A' }], null, 'hyderabad').map(r => r.babyCoilId))
      .toEqual(['HYD-0826-01-A'])          // no coils in hand ⇒ nothing is at this plant
  })
})

describe('distributorStateIndex — a distributor\'s own state', () => {
  it('takes the state from the distributor\'s order and invoice lines', () => {
    const orders = [{ deleted: false, distributorCode: 'D1', orderDate: '2026-08-01', shipToState: 'TELANGANA' }]
    const dispatches = [{ deleted: false, dateOfDispatch: '2026-08-05', bundleEntries: [{ distributorCode: 'D2', shipToState: 'GUJARAT' }] }]
    const idx = distributorStateIndex(orders, dispatches)
    expect(idx.get('D1')).toMatchObject({ state: 'TELANGANA', multiState: false })
    expect(idx.get('D2')).toMatchObject({ state: 'GUJARAT', multiState: false })
  })

  it('resolves a multi-state distributor to its MOST RECENT line, keeping every state visible', () => {
    const orders = [
      { deleted: false, distributorCode: 'D1', orderDate: '2026-06-10', shipToState: 'KARNATAKA' },
      { deleted: false, distributorCode: 'D1', orderDate: '2026-08-01', shipToState: 'TELANGANA' },
    ]
    // A later INVOICE line beats both orders — recency spans both stores, not just one.
    const dispatches = [{ deleted: false, dateOfDispatch: '2026-08-09', bundleEntries: [{ distributorCode: 'D1', shipToState: 'MAHARASHTRA' }] }]
    const e = distributorStateIndex(orders, dispatches).get('D1')
    expect(e.state).toBe('MAHARASHTRA')
    expect(e.multiState).toBe(true)
    expect(e.states).toEqual(['KARNATAKA', 'MAHARASHTRA', 'TELANGANA'])   // sorted, all three kept

    // Drop the invoice and the most recent ORDER wins instead.
    expect(distributorStateIndex(orders, []).get('D1').state).toBe('TELANGANA')
  })

  it('a dated line beats an undated one, and a blank state never overwrites a real one', () => {
    const orders = [
      { deleted: false, distributorCode: 'D1', orderDate: '', shipToState: 'GUJARAT' },
      { deleted: false, distributorCode: 'D1', orderDate: '2026-08-01', shipToState: 'KARNATAKA' },
      { deleted: false, distributorCode: 'D1', orderDate: '2026-09-01', shipToState: '' },   // unresolved state
    ]
    const e = distributorStateIndex(orders, []).get('D1')
    expect(e.state).toBe('KARNATAKA')
    expect(e.states).toEqual(['GUJARAT', 'KARNATAKA'])   // the blank is not a state
  })

  it('a distributor with no resolvable state on any line resolves blank + Unmapped', () => {
    const orders = [{ deleted: false, distributorCode: 'D1', orderDate: '2026-08-01', shipToState: '' }]
    const resolve = distributorRegionResolver(orders, [])
    expect(resolve('D1')).toMatchObject({ state: '', states: [], multiState: false, region: UNMAPPED_REGION })
    expect(resolve('NOBODY')).toMatchObject({ state: '', region: UNMAPPED_REGION })   // unknown key, no throw
  })

  it('groups a shipment under the order it fulfils, so state follows one distributor identity', () => {
    // Same party, invoice spells the name differently — the order link keeps them one row (and one state).
    const orders = [{ deleted: false, distributorCode: 'D1', lineId: 'L1', orderDate: '2026-08-01', shipToState: 'TELANGANA' }]
    const dispatches = [{ deleted: false, dateOfDispatch: '2026-08-02', bundleEntries: [{ customer: 'V V Traders', orderLineId: 'L1', shipToState: 'TELANGANA' }] }]
    const idx = distributorStateIndex(orders, dispatches)
    expect(idx.size).toBe(1)
    expect(idx.get('D1').multiState).toBe(false)
  })
})

describe('salesByDistributor — state & region columns (ticket #102)', () => {
  // Three distributors: a seeded state, a state nobody has mapped, and a multi-state party.
  const orders = [
    { deleted: false, distributorCode: 'D1', customer: 'South Co', orderDate: '2026-08-01', shipToState: 'TELANGANA', mmId: 'A', confirmed: 4, nonConfirmed: 1 },
    { deleted: false, distributorCode: 'D2', customer: 'Odisha Co', orderDate: '2026-08-01', shipToState: 'ODISHA', mmId: 'A', confirmed: 2, nonConfirmed: 0 },
    { deleted: false, distributorCode: 'D3', customer: 'Roaming Co', orderDate: '2026-07-01', shipToState: 'KARNATAKA', mmId: 'A', confirmed: 3, nonConfirmed: 0 },
    { deleted: false, distributorCode: 'D3', customer: 'Roaming Co', orderDate: '2026-08-02', shipToState: 'MAHARASHTRA', mmId: 'A', confirmed: 0, nonConfirmed: 0 },
  ]
  const dispatches = [{
    deleted: false, dateOfDispatch: '2026-08-10', bundleEntries: [
      { distributorCode: 'D1', skuCode: 'A', weight: 10 },
      { distributorCode: 'D2', skuCode: 'A', weight: 6 },        // unmapped state — must still be counted
      { distributorCode: 'D3', skuCode: 'A', weight: 4 },
    ],
  }]
  const byId = (rows) => Object.fromEntries(rows.map(r => [r.id, r]))

  it('adds the derived state and its region to every row', () => {
    const rows = byId(salesByDistributor(orders, dispatches, '2026-08', [], { stateRegions: [] }))
    expect(rows.D1).toMatchObject({ state: 'TELANGANA', region: 'South', multiState: false })
    expect(rows.D3).toMatchObject({ state: 'MAHARASHTRA', region: 'West', multiState: true })
    expect(rows.D3.states).toEqual(['KARNATAKA', 'MAHARASHTRA'])
  })

  it('an edited region shows on every distributor in that state', () => {
    const stateRegions = [{ id: 'x', state: 'TELANGANA', region: 'North', deleted: false }]
    const extra = [...orders, { deleted: false, distributorCode: 'D4', customer: 'New Co', orderDate: '2026-08-03', shipToState: 'TELANGANA', mmId: 'A', confirmed: 1, nonConfirmed: 0 }]
    const rows = byId(salesByDistributor(extra, dispatches, '2026-08', [], { stateRegions }))
    expect(rows.D1.region).toBe('North')
    expect(rows.D4.region).toBe('North')      // a distributor added later inherits the state's region
    expect(rows.D3.region).toBe('West')       // untouched states keep their seeded region
  })

  it('an unmapped state reads Unmapped and its tonnage still lands in every total', () => {
    const rows = salesByDistributor(orders, dispatches, '2026-08', [], { stateRegions: [] })
    const kerala = rows.find(r => r.id === 'D2')
    expect(kerala.region).toBe(UNMAPPED_REGION)
    expect(kerala.mtdInvoice).toBeCloseTo(6)

    // The load-bearing guarantee: grouping by region must not drop or double-count a gram. The
    // Unmapped bucket is a bucket like any other, so its tonnage reconciles to the plant figure.
    const kpis = salesKpis(orders, dispatches, '2026-08')
    const sum = (rs, f) => rs.reduce((t, r) => t + f(r), 0)
    const byRegion = {}
    rows.forEach(r => {
      const b = byRegion[r.region] = byRegion[r.region] || { mtdInvoice: 0, pending: 0 }
      b.mtdInvoice += r.mtdInvoice; b.pending += r.pending
    })
    expect(byRegion[UNMAPPED_REGION].mtdInvoice).toBeCloseTo(6)
    expect(sum(Object.values(byRegion), b => b.mtdInvoice)).toBeCloseTo(kpis.mtdInvoice)
    expect(sum(Object.values(byRegion), b => b.pending)).toBeCloseTo(kpis.pending)
    expect(sum(rows, r => r.mtdInvoice)).toBeCloseTo(20)   // 10 + 6 + 4, nothing lost to a gap
  })

  it('rows still resolve when no state master is passed at all (seed only)', () => {
    const rows = byId(salesByDistributor(orders, dispatches, '2026-08'))
    expect(rows.D1.region).toBe('South')
    expect(rows.D2.region).toBe(UNMAPPED_REGION)
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

// Both distributors ship to TELANGANA and the stock is made at Hyderabad, so all three sit in ONE
// service area — which is what makes this block about sharing WITHIN an area (ADR-0002) and not
// about the area boundary (ticket #129, the block below). Without the state and the plant every
// test here would pass for the wrong reason: an unmapped distributor reads null stock, and
// unattributed stock belongs to no area at all.
describe('salesByDistributor — unreserved stock inside one service area (ADR-0002)', () => {
  const skus = [{ skuCode: 'S1', productType: 'SHS', height: 50, breadth: 50, thickness: 2, length: 6000 }]
  const orders = [
    { deleted: false, mmId: 'S1', distributorCode: 'D1', customer: 'PATEL', shipToState: 'TELANGANA', orderStatus: 'Confirmed', confirmed: 40, nonConfirmed: 0 },
    { deleted: false, mmId: 'S1', distributorCode: 'D2', customer: 'SHREE', shipToState: 'TELANGANA', orderStatus: 'Confirmed', confirmed: 30, nonConfirmed: 0 },
  ]
  const productions = [{ deleted: false, skuCode: 'S1', plant: 'hyderabad', dateOfProduction: '2026-08-01', tubeCount: 100, totalWeight: 45 }]

  it('shows the SAME on-hand to every distributor in the area waiting on the SKU — nothing is reserved', () => {
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
      [{ deleted: false, mmId: 'S1', distributorCode: 'D1', shipToState: 'TELANGANA', orderStatus: 'Confirmed', confirmed: 60, nonConfirmed: 0 }],
      [], '2026-08', skus, { productions })
    expect(rows[0].skuRows[0].shortBy).toBeCloseTo(15)  // 60 pending − 45 on hand
  })

  it('floors an over-dispatched SKU at zero on-hand rather than showing negative stock', () => {
    // The entry carries `plant` for the same reason the productions do: the dispatch filter drops
    // an unattributed entry, and without it the 60 T never reaches the pool and the floor is never
    // exercised — the test would pass on 45 T of untouched stock.
    const overDispatched = [{ deleted: false, dateOfDispatch: '2026-08-05', bundleEntries: [{ skuCode: 'S1', plant: 'hyderabad', weight: 60 }] }]
    const rows = salesByDistributor(orders, overDispatched, '2026-08', skus, { productions })
    const patel = rows.find(r => r.id === 'D1').skuRows[0]
    expect(patel.onhand).toBe(0)                // 45 produced − 60 invoiced = −15, floored
    expect(patel.shortBy).toBeCloseTo(40)       // the full pending is uncovered
  })

  it('omits the stock columns entirely when no productions are supplied (existing callers unchanged)', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus)
    expect(rows[0].skuRows[0].onhand).toBeUndefined()
    expect(rows[0].skuRows[0].shortBy).toBeUndefined()
    expect(rows[0].skuRows[0].freeStock).toBeUndefined()
  })

  // Free Stock — the displayed figure. On-hand less what is already promised, where "promised" is
  // Confirmed (released, not yet invoiced) across EVERY distributor, because the stock itself is
  // plant-wide. Same shape as the Dashboard's Free FG (Inventory − Reserved).
  it('nets the Confirmed tonnage of ALL distributors off the plant stock, not just this row’s', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus, { productions })
    const patel = rows.find(r => r.id === 'D1').skuRows[0]
    const shree = rows.find(r => r.id === 'D2').skuRows[0]
    expect(patel.allConfirmed).toBeCloseTo(70)   // 40 (Patel) + 30 (Shree) — both South
    expect(patel.freeStock).toBeCloseTo(-25)     // 45 on hand − 70 confirmed
    expect(shree.freeStock).toBeCloseTo(-25)     // identical on both rows — the pool is shared
    expect(patel.onhand).toBeCloseTo(45)         // on-hand itself is untouched, still floored at 0
  })

  it('goes negative rather than flooring — an over-committed size is the signal, not an error', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus, { productions })
    expect(rows[0].skuRows[0].freeStock).toBeLessThan(0)
  })

  it('equals on-hand while nothing is Confirmed — today’s order book, where Confirmed is 0 T', () => {
    // Every live order line sits in Non-confirmed until the ERP releases it, so Free Stock reads
    // exactly as On-hand did. It starts moving the day Confirmed tonnage appears.
    const nonConfirmedOnly = orders.map(o => ({ ...o, confirmed: 0, nonConfirmed: 40 }))
    const rows = salesByDistributor(nonConfirmedOnly, [], '2026-08', skus, { productions })
    const row = rows[0].skuRows[0]
    expect(row.allConfirmed).toBe(0)
    expect(row.freeStock).toBeCloseTo(45)
    expect(row.freeStock).toBeCloseTo(row.onhand)
  })
})

// ── SERVICE AREA: a distributor is only shown the stock of plants that serve its region (#129) ──
// The bug this replaces, on live 20-Aug-2026 data: every one of the 1,279 production rows was
// Hyderabad's (South), and the workbook still offered 310.6 T of it to West distributors, printing
// West's shortfall as 1,755.35 MT against a true 2,116 MT.
describe('plantMaster / plantsServingRegion — the service area master', () => {
  it('ships Hyderabad + Lepakshi serving South, NPMD + Tapi serving West', () => {
    expect([...plantsServingRegion('South')].sort()).toEqual(['hyderabad', 'lepakshi'])
    expect([...plantsServingRegion('West')].sort()).toEqual(['npmd', 'tapi'])
    expect(servedRegions()).toEqual(['South', 'West'])
  })

  it('matches a region case-insensitively, so a hand-typed "south" is the seeded South', () => {
    expect([...plantsServingRegion('  south ')].sort()).toEqual(['hyderabad', 'lepakshi'])
  })

  it('returns the EMPTY set for a region nobody ships to — an answer, not a missing filter', () => {
    expect(plantsServingRegion('North').size).toBe(0)
    expect(plantsServingRegion(UNMAPPED_REGION).size).toBe(0)   // Unmapped is not a region
    expect(plantsServingRegion('').size).toBe(0)
  })

  it('layers a stored row over the seed, per plant, leaving the other three alone', () => {
    const master = plantMaster([{ plantId: 'npmd', serves: ['South'] }])
    expect([...plantsServingRegion('South', master)].sort()).toEqual(['hyderabad', 'lepakshi', 'npmd'])
    expect([...plantsServingRegion('West', master)]).toEqual(['tapi'])          // Hyderabad untouched
    expect(master.find(p => p.id === 'npmd').erpCode).toBe('V1865-2222-JODL-4081') // ERP fields read-only
  })

  it('reads an empty / null / blank stored service area as "serves nowhere", not as the seed', () => {
    ;[[], null, ''].forEach(serves => {
      const master = plantMaster([{ plantId: 'hyderabad', serves }])
      expect([...plantsServingRegion('South', master)]).toEqual(['lepakshi'])
    })
  })

  it('ignores a soft-deleted row, and a row naming a plant the seed does not carry', () => {
    const master = plantMaster([
      { plantId: 'hyderabad', serves: ['West'], deleted: true },
      { plantId: 'ghaziabad', serves: ['North'] },
    ])
    expect([...plantsServingRegion('South', master)].sort()).toEqual(['hyderabad', 'lepakshi'])
    expect(plantsServingRegion('North', master).size).toBe(0)
    expect(master).toHaveLength(4)
  })
})

describe('filterByPlants / filterDispatchesByPlants — an empty set is not "no filter"', () => {
  const rows = [{ id: 'a', plant: 'hyderabad' }, { id: 'b', plant: 'npmd' }, { id: 'c' }]
  const disp = [
    { id: 'd1', bundleEntries: [{ skuCode: 'S1', plant: 'hyderabad', weight: 10 }, { skuCode: 'S1', plant: 'npmd', weight: 4 }] },
    { id: 'd2', bundleEntries: [{ skuCode: 'S1', weight: 3 }] },
  ]

  it('keeps only the named plants', () => {
    expect(filterByPlants(rows, new Set(['hyderabad', 'lepakshi'])).map(r => r.id)).toEqual(['a'])
    expect(filterByPlants(rows, ['hyderabad', 'npmd']).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('returns NO rows for an empty set and EVERY row for null — opposite instructions', () => {
    expect(filterByPlants(rows, new Set())).toEqual([])
    expect(filterByPlants(rows, null)).toHaveLength(3)
    expect(filterDispatchesByPlants(disp, new Set())).toEqual([])
    expect(filterDispatchesByPlants(disp, null)).toHaveLength(2)
  })

  it('drops an unattributed row from every service area — it belongs to none', () => {
    expect(filterByPlants(rows, new Set(['hyderabad', 'npmd', 'lepakshi', 'tapi'])).map(r => r.id)).toEqual(['a', 'b'])
  })

  it('re-derives a filtered dispatch record\u2019s weight from the entries that survived', () => {
    const [rec] = filterDispatchesByPlants(disp, new Set(['hyderabad']))
    expect(rec.id).toBe('d1')
    expect(rec.bundleEntries).toHaveLength(1)
    expect(rec.theoreticalWeight).toBeCloseTo(10)     // not 14 — the NPMD line is not South's
  })
})

describe('distributorRegionIndex — the distributor master overrides the state\u2019s region', () => {
  it('is empty as shipped, so every distributor follows its state', () => {
    expect(distributorRegionIndex().size).toBe(0)
  })

  it('lets a stored override beat the state map, and a blank fall back to it', () => {
    const orders = [{ deleted: false, distributorCode: 'D1', customer: 'BORDER DEPOT', shipToState: 'MAHARASHTRA', orderDate: '2026-08-01' }]
    const plain = distributorRegionResolver(orders, [])('D1')
    expect(plain.region).toBe('West')                                   // MAHARASHTRA → West

    const overridden = distributorRegionResolver(orders, [], null, null, [{ distributorKey: 'D1', region: 'South' }])('D1')
    expect(overridden.region).toBe('South')
    expect(overridden.state).toBe('MAHARASHTRA')                        // the state itself never moves
    expect(overridden.regionOverride).toBe('South')

    const cleared = distributorRegionResolver(orders, [], null, null, [{ distributorKey: 'D1', region: '' }])('D1')
    expect(cleared.region).toBe('West')                                 // blank ⇒ use the state
    expect(cleared.regionOverride).toBe('')
  })

  it('can pull a distributor OUT of Unmapped when its lines carry no state at all', () => {
    const orders = [{ deleted: false, distributorCode: 'D9', customer: 'NO STATE', shipToState: '', orderDate: '2026-08-01' }]
    expect(distributorRegionResolver(orders, [])('D9').region).toBe(UNMAPPED_REGION)
    expect(distributorRegionResolver(orders, [], null, null, [{ distributorKey: 'D9', region: 'South' }])('D9').region).toBe('South')
  })
})

describe('salesByDistributor — stock is pooled per service area (ticket #129)', () => {
  const skus = [{ skuCode: 'S1', productType: 'SHS', height: 50, breadth: 50, thickness: 2, length: 6000 }]
  // The live shape on 20-Aug-2026: one South plant holding everything, a West order book holding
  // nothing but demand, and one distributor whose state nobody has mapped.
  const orders = [
    { deleted: false, mmId: 'S1', distributorCode: 'S', customer: 'ARIHANT', shipToState: 'KARNATAKA', orderStatus: 'Confirmed', confirmed: 10, nonConfirmed: 0 },
    { deleted: false, mmId: 'S1', distributorCode: 'W', customer: 'VORA', shipToState: 'MAHARASHTRA', orderStatus: 'Confirmed', confirmed: 40, nonConfirmed: 0 },
    { deleted: false, mmId: 'S1', distributorCode: 'U', customer: 'MAHENDRA', shipToState: '', orderStatus: 'Confirmed', confirmed: 8, nonConfirmed: 0 },
  ]
  const hyd = [{ deleted: false, skuCode: 'S1', plant: 'hyderabad', dateOfProduction: '2026-08-01', tubeCount: 100, totalWeight: 45 }]
  const skuOf = (rows, id) => rows.find(r => r.id === id).skuRows[0]

  it('shows West nothing while Hyderabad holds 45 T — the bug this ticket exists for', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus, { productions: hyd })
    expect(skuOf(rows, 'S').onhand).toBeCloseTo(45)
    expect(skuOf(rows, 'W').onhand).toBe(0)
    expect(skuOf(rows, 'W').freeStock).toBeCloseTo(-40)   // 0 on hand − West's own 40 T Confirmed
  })

  it('gives a West distributor its FULL pending as Short by, not a South-cushioned figure', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus, { productions: hyd })
    expect(skuOf(rows, 'W').shortBy).toBeCloseTo(40)      // the whole order book, not 0
    expect(skuOf(rows, 'S').shortBy).toBe(0)              // 10 T against 45 T on the floor
  })

  it('nets Confirmed and pending PER AREA — South\u2019s demand is not charged to West', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus, { productions: hyd })
    expect(skuOf(rows, 'S').allConfirmed).toBeCloseTo(10) // South sees only ARIHANT's 10 T…
    expect(skuOf(rows, 'W').allConfirmed).toBeCloseTo(40) // …and West only VORA's 40 T
    expect(skuOf(rows, 'S').allPending).toBeCloseTo(10)
    expect(skuOf(rows, 'W').allPending).toBeCloseTo(40)
  })

  it('does not let a South invoice push West negative', () => {
    // Hyderabad invoices a West distributor — which is what actually happens today. The tonnage
    // leaves the SOUTH floor; West's empty pool must not be reduced by it.
    const southInvoice = [{ deleted: false, dateOfDispatch: '2026-08-05',
      bundleEntries: [{ skuCode: 'S1', plant: 'hyderabad', weight: 6, distributorCode: 'W', customer: 'VORA', shipToState: 'MAHARASHTRA' }] }]
    const rows = salesByDistributor(orders, southInvoice, '2026-08', skus, { productions: hyd })
    expect(skuOf(rows, 'S').onhand).toBeCloseTo(39)       // 45 − 6, off the floor it left
    expect(skuOf(rows, 'W').onhand).toBe(0)               // floored, and never −6
    expect(skuOf(rows, 'W').freeStock).toBeCloseTo(-40)   // still just West's own Confirmed
  })

  it('reads "?" — null, never 0 — for a distributor with no known service area', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus, { productions: hyd })
    const unmapped = skuOf(rows, 'U')
    expect(rows.find(r => r.id === 'U').region).toBe(UNMAPPED_REGION)
    ;['onhand', 'freeStock', 'allPending', 'allConfirmed', 'shortBy'].forEach(f =>
      expect(unmapped[f]).toBeNull())
  })

  it('fills West the day an NPMD row appears, and leaves South exactly where it was', () => {
    const before = salesByDistributor(orders, [], '2026-08', skus, { productions: hyd })
    const after = salesByDistributor(orders, [], '2026-08', skus, {
      productions: [...hyd, { deleted: false, skuCode: 'S1', plant: 'npmd', dateOfProduction: '2026-08-10', tubeCount: 100, totalWeight: 50 }],
    })
    expect(skuOf(after, 'W').onhand).toBeCloseTo(50)
    expect(skuOf(after, 'W').shortBy).toBe(0)
    expect(skuOf(after, 'S')).toEqual(skuOf(before, 'S'))   // not by a kilo
  })

  it('follows the plant master: re-point NPMD at South and West goes dark again', () => {
    const productions = [...hyd, { deleted: false, skuCode: 'S1', plant: 'npmd', dateOfProduction: '2026-08-10', tubeCount: 100, totalWeight: 50 }]
    const rows = salesByDistributor(orders, [], '2026-08', skus,
      { productions, plants: [{ plantId: 'npmd', serves: ['South'] }] })
    expect(skuOf(rows, 'S').onhand).toBeCloseTo(95)   // 45 Hyderabad + 50 NPMD, one area now
    expect(skuOf(rows, 'W').onhand).toBe(0)
  })

  it('follows the distributor master: an override moves which pool a row reads', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus,
      { productions: hyd, distributors: [{ distributorKey: 'W', region: 'South' }] })
    expect(rows.find(r => r.id === 'W').region).toBe('South')
    expect(skuOf(rows, 'W').onhand).toBeCloseTo(45)
    expect(skuOf(rows, 'W').allConfirmed).toBeCloseTo(50)  // now sharing South's pool with ARIHANT
    expect(skuOf(rows, 'S').allConfirmed).toBeCloseTo(50)
  })

  it('shows a region nobody serves NO stock — never every plant\u2019s', () => {
    const north = [{ deleted: false, mmId: 'S1', distributorCode: 'N', customer: 'DELHI TUBES', shipToState: 'DELHI', orderStatus: 'Confirmed', confirmed: 20, nonConfirmed: 0 }]
    const rows = salesByDistributor([...orders, ...north], [], '2026-08', skus,
      { productions: hyd, stateRegions: [{ state: 'DELHI', region: 'North' }] })
    expect(rows.find(r => r.id === 'N').region).toBe('North')
    expect(skuOf(rows, 'N').onhand).toBe(0)          // not 45 — no plant serves North
    expect(skuOf(rows, 'N').shortBy).toBeCloseTo(20)
  })

  it('leaves every existing caller untouched when no productions are passed', () => {
    const rows = salesByDistributor(orders, [], '2026-08', skus)
    rows.forEach(r => r.skuRows.forEach(s => {
      ;['onhand', 'freeStock', 'allPending', 'allConfirmed', 'shortBy'].forEach(f =>
        expect(s[f]).toBeUndefined())
    }))
  })
})

// ── ACCESS: what role + plant may see (ticket #126) ────────────────────────────────────────────
describe('APP_TABS', () => {
  it('is the one ordered list of tabs, keys unique', () => {
    const keys = APP_TABS.map(t => t.key)
    expect(new Set(keys).size).toBe(keys.length)
    expect(keys[0]).toBe('dashboard')          // the landing tab; every role sees it
    expect(keys).toContain('reports')
  })

  it('carries no tab for the stages ticket #117 removed', () => {
    const keys = APP_TABS.map(t => t.key)
    expect(keys).not.toContain('tubes')
    expect(keys).not.toContain('bundles')
  })
})

describe('accessFor', () => {
  const keysOf = (a) => a.tabs.map(t => t.key)
  const admin = { role: 'admin', plant: ALL_PLANTS }
  const hyd = { role: 'plant', plant: 'hyderabad' }
  const npmd = { role: 'plant', plant: 'npmd' }

  // ── Two plants that cannot register a mother coil, both FICTIONAL on purpose ──────────────────
  // `accessFor` refuses Coil Inward for two different reasons, and they are not the same rule:
  //   manufactures: false             → the three shop-floor tabs are hidden outright.
  //   manufactures, off the rollout   → Slitting and Production are offered, Coil Inward is not.
  // Both used to be illustrated by Lepakshi, a REAL plant that carried orders and had never
  // produced — so the day Lepakshi is activated, those tests assert the opposite of the truth.
  // LEARNINGS.md already names the trap: when a test needs an example of an unmapped thing, that
  // example is a hostage to the next mapping. It was KERALA in the state→region seed; it was
  // Lepakshi in the plant master.
  //
  // These two ids are invented and must STAY invented. They are on no ERP sheet, in no workbook
  // and on no rollout plan; they exist only in this file; and nothing may ever add them to
  // `src/data/plants.js` or to `COIL_INWARD_PLANT_IDS`. Being permanently fictional is the whole
  // point — it is what stops the next plant activation from silently inverting these assertions.
  //
  // `accessFor` reads only `id` and `manufactures` off a master row; the remaining fields are here
  // so each row reads as the plant master row it is standing in for. A plant that does not exist
  // has no ERP code and serves no region, so those stay empty rather than being invented too.
  const NEVER_MANUFACTURES = {
    id: 'fictional-never-manufactures', erpCode: '', erpNames: [],
    name: 'Fictional Non-Manufacturing Works', coilPrefix: 'FNM', manufactures: false, serves: [],
  }
  const NEVER_ROLLED_OUT = {
    id: 'fictional-never-rolled-out', erpCode: '', erpNames: [],
    name: 'Fictional Not-Rolled-Out Works', coilPrefix: 'FNR', manufactures: true, serves: [],
  }
  // Both are handed to `accessFor` ON this constructed master. A plant merely ABSENT from the
  // master proves something else entirely — that is the unknown-id case, and it has its own test
  // at the end of this block.
  const MASTER_WITH_FICTIONAL_PLANTS = [...PLANTS, NEVER_MANUFACTURES, NEVER_ROLLED_OUT]
  const nonManufacturing = { role: 'plant', plant: NEVER_MANUFACTURES.id }
  const notRolledOut = { role: 'plant', plant: NEVER_ROLLED_OUT.id }

  it('gives an admin every tab, nothing read-only, and the plant selector', () => {
    const a = accessFor(admin)
    expect(keysOf(a)).toEqual(APP_TABS.map(t => t.key))
    expect(a.readOnly).toEqual([])
    expect(a.plantSelector).toBe(true)
    expect(a.plant).toBe(ALL_PLANTS)
  })

  it('scopes a plant user to their own plant and offers no selector', () => {
    expect(accessFor(hyd).plant).toBe('hyderabad')
    expect(accessFor(hyd).plantSelector).toBe(false)
    expect(accessFor(npmd).plant).toBe('npmd')
    expect(accessFor(npmd).plantSelector).toBe(false)
  })

  it('hides Reports from a plant user and keeps it for an admin', () => {
    expect(keysOf(accessFor(hyd))).not.toContain('reports')
    expect(keysOf(accessFor(admin))).toContain('reports')
  })

  it('gives a plant user the four viewing tabs', () => {
    const keys = keysOf(accessFor(hyd))
    expect(keys).toEqual(expect.arrayContaining(['dashboard', 'coilTracker', 'dispatch', 'sales']))
  })

  it('offers the manufacturing tabs only to a plant that manufactures', () => {
    const mfg = ['coilInward', 'slitting', 'production']
    expect(keysOf(accessFor(hyd))).toEqual(expect.arrayContaining(mfg))
    expect(keysOf(accessFor(npmd))).toEqual(expect.arrayContaining(mfg))
    // Non-vacuous: the fictional plant is genuinely ON this master and genuinely says
    // `manufactures: false`, so the stages are hidden by THAT flag — not by the unknown-id path,
    // which hides them too and would let this pass while proving nothing.
    expect(plantById(NEVER_MANUFACTURES.id, MASTER_WITH_FICTIONAL_PLANTS)?.manufactures).toBe(false)
    mfg.forEach(k => expect(keysOf(accessFor(nonManufacturing, MASTER_WITH_FICTIONAL_PLANTS))).not.toContain(k))
    // …but it keeps everything that is not a shop-floor stage.
    expect(keysOf(accessFor(nonManufacturing, MASTER_WITH_FICTIONAL_PLANTS))).toEqual(expect.arrayContaining(['dashboard', 'sales', 'orders']))
  })

  it('offers Campaign to a plant that manufactures and hides it from one that does not', () => {
    // Campaign plans the mill's month, so it is gated on the SAME flag as the three stages it
    // plans for: a plant with no mill has no month to plan. It is not gated on the Coil Inward
    // rollout list — planning a month needs no coil registered to plan it.
    expect(keysOf(accessFor(hyd))).toContain('campaign')
    expect(keysOf(accessFor(npmd))).toContain('campaign')
    expect(keysOf(accessFor(notRolledOut, MASTER_WITH_FICTIONAL_PLANTS))).toContain('campaign')
    // Non-vacuous, the same way the stages above are: the fictional plant is genuinely on this
    // master and genuinely says `manufactures: false`.
    expect(plantById(NEVER_MANUFACTURES.id, MASTER_WITH_FICTIONAL_PLANTS)?.manufactures).toBe(false)
    expect(keysOf(accessFor(nonManufacturing, MASTER_WITH_FICTIONAL_PLANTS))).not.toContain('campaign')
  })

  it('leaves Campaign writable for a plant user — the operator is who commits the plan', () => {
    // SKU Master and Orders are read-only for a plant user because both are company-wide. A
    // Campaign is the opposite: it belongs to ONE plant and the person who commits it is the
    // operator standing at that mill. Making it read-only would leave nobody able to plan.
    expect(accessFor(hyd).readOnly).not.toContain('campaign')
    expect(accessFor(npmd).readOnly).not.toContain('campaign')
  })

  it('keeps an admin’s manufacturing tabs regardless of the selected plant', () => {
    // The selector is a VIEW, not an identity — an admin looking at a plant that could not run a
    // single stage still has all three.
    expect(keysOf(accessFor({ role: 'admin', plant: NEVER_MANUFACTURES.id }, MASTER_WITH_FICTIONAL_PLANTS))).toContain('coilInward')
  })

  it('makes SKU Master and Orders read-only for a plant user, and neither for an admin', () => {
    expect(accessFor(hyd).readOnly).toEqual(expect.arrayContaining(['skuMaster', 'orders']))
    expect(accessFor(admin).readOnly).toEqual([])
  })

  it('never marks a tab read-only that it also hides', () => {
    // Every shape of session, including both plants that cannot register a coil — the two whose
    // tab sets are the ones actually cut down, and so the two where a stale readOnly key could
    // survive its tab. One master for all five: it is a SUPERSET of PLANTS, so the three real
    // sessions resolve to exactly the rows they would have on the default.
    ;[admin, hyd, npmd, nonManufacturing, notRolledOut].forEach(s => {
      const a = accessFor(s, MASTER_WITH_FICTIONAL_PLANTS)
      const visible = new Set(a.tabs.map(t => t.key))
      a.readOnly.forEach(k => expect(visible.has(k)).toBe(true))
    })
  })

  it('returns tabs in APP_TABS order, never the order the rules happened to run in', () => {
    const order = APP_TABS.map(t => t.key)
    const keys = keysOf(accessFor(hyd))
    expect(keys).toEqual(order.filter(k => keys.includes(k)))
  })

  it('grants nothing to a plant role carrying no plant of its own', () => {
    // A `plant` credential with a NULL plant column arrives as ALL_PLANTS (db.js). Reading that as
    // "every plant" would hand a plant login the whole company — the one failure worth refusing.
    ;[ALL_PLANTS, '', null, undefined].forEach(p => {
      const a = accessFor({ role: 'plant', plant: p })
      expect(a.tabs).toEqual([])
      expect(a.plantSelector).toBe(false)
    })
  })

  it('grants nothing for an unknown, missing or empty role', () => {
    ;[{ role: 'superuser', plant: 'hyderabad' }, { role: '', plant: 'hyderabad' }, {}, null, undefined]
      .forEach(s => expect(accessFor(s).tabs).toEqual([]))
  })

  it('offers Coil Inward only to a plant on the rollout list, not merely one that manufactures', () => {
    // COIL_INWARD_PLANT_IDS and `manufactures` are deliberately separate mechanisms (see the
    // comment on coilInwardPlants): a plant can land on the master as manufacturing before Coil
    // Inward is ready to offer it. An admin's picker already honours the rollout list, so gating
    // the TAB on `manufactures` alone would let a plant user register coils the admin cannot.
    //
    // Non-vacuous, and it is the whole reason this plant is fictional: it DOES manufacture on this
    // master, so `manufactures` cannot be what hides Coil Inward — and the rollout list, a module
    // constant that cannot be injected, has never heard of it and never will.
    expect(plantById(NEVER_ROLLED_OUT.id, MASTER_WITH_FICTIONAL_PLANTS)?.manufactures).toBe(true)
    expect(COIL_INWARD_PLANT_IDS).not.toContain(NEVER_ROLLED_OUT.id)
    const keys = accessFor(notRolledOut, MASTER_WITH_FICTIONAL_PLANTS).tabs.map(t => t.key)
    expect(keys).not.toContain('coilInward')
    // Slitting and Production follow `manufactures` — they consume what Coil Inward registered,
    // so they are useless without it but never wrong, and the rollout list does not govern them.
    expect(keys).toEqual(expect.arrayContaining(['slitting', 'production']))
  })

  it('still scopes a plant id no plant master row matches, showing empty rather than everything', () => {
    // Documented in blueprints/manage-app-login.md: fix the credential row, don't work around it
    // here. What must NOT happen is the unknown id widening into All Plants.
    const a = accessFor({ role: 'plant', plant: 'not-a-plant' })
    expect(a.plant).toBe('not-a-plant')
    expect(a.plantSelector).toBe(false)
    expect(a.tabs.map(t => t.key)).not.toContain('coilInward')   // unknown ⇒ does not manufacture
  })
})

describe('parseStoredSession', () => {
  const now = Date.UTC(2026, 7, 19)
  const day = 24 * 60 * 60 * 1000
  const fresh = { loginId: 'hyderabad', plant: 'hyderabad', role: 'plant', at: now - day }

  it('accepts a session carrying a login, a role and a plant', () => {
    expect(parseStoredSession(fresh, now)).toEqual({ loginId: 'hyderabad', plant: 'hyderabad', role: 'plant', at: now - day })
  })

  it('accepts an admin session, whose plant is the All Plants sentinel', () => {
    const s = parseStoredSession({ loginId: 'admin', plant: ALL_PLANTS, role: 'admin', at: now }, now)
    expect(s.role).toBe('admin')
    expect(s.plant).toBe(ALL_PLANTS)
  })

  it('rejects a session stored before roles existed, so it is signed in once more', () => {
    // Every pre-#126 session is exactly this shape: a login id and a timestamp, no role.
    expect(parseStoredSession({ loginId: 'admin', at: now }, now)).toBe(null)
  })

  it('rejects a role it does not recognise rather than treating it as a plant user', () => {
    expect(parseStoredSession({ loginId: 'x', plant: 'hyderabad', role: 'superuser', at: now }, now)).toBe(null)
  })

  it('rejects a plant session with no plant, and an admin session with no plant', () => {
    expect(parseStoredSession({ loginId: 'x', role: 'plant', at: now }, now)).toBe(null)
    expect(parseStoredSession({ loginId: 'admin', role: 'admin', at: now }, now)).toBe(null)
  })

  it('expires after the 30-day window, and holds inside it', () => {
    expect(parseStoredSession({ ...fresh, at: now - 29 * day }, now)).not.toBe(null)
    expect(parseStoredSession({ ...fresh, at: now - 31 * day }, now)).toBe(null)
  })

  it('rejects junk, a missing timestamp and nothing at all', () => {
    ;[null, undefined, 'admin', 42, {}, { ...fresh, at: undefined }, { ...fresh, at: 'yesterday' }]
      .forEach(v => expect(parseStoredSession(v, now)).toBe(null))
  })

  it('rejects a session with no login id — a session names WHO signed in', () => {
    expect(parseStoredSession({ ...fresh, loginId: '' }, now)).toBe(null)
  })
})

describe('parseStoredSession + accessFor together', () => {
  // The two answer different questions and a credential can pass one and fail the other. This is
  // the case that matters: a `plant` role whose plant column is NULL reaches the app as ALL_PLANTS
  // (db.js), which is a WELL-FORMED session — and must still grant nothing.
  it('parses a plant session with no plant of its own, and grants it nothing', () => {
    const session = parseStoredSession({ loginId: 'broken', plant: ALL_PLANTS, role: 'plant', at: Date.now() })
    expect(session).not.toBe(null)
    expect(accessFor(session).tabs).toEqual([])
  })

  it('grants tabs to every session the three real logins produce', () => {
    ;[{ loginId: 'admin', plant: ALL_PLANTS, role: 'admin' },
      { loginId: 'hyderabad', plant: 'hyderabad', role: 'plant' },
      { loginId: 'npmd', plant: 'npmd', role: 'plant' }].forEach(row => {
      const session = parseStoredSession({ ...row, at: Date.now() })
      expect(session, row.loginId).not.toBe(null)
      expect(accessFor(session).tabs.length, row.loginId).toBeGreaterThan(0)
    })
  })
})

describe('plantKeysIn — the plant values present in a set of rows (#127 tidy)', () => {
  // It exists so grouping BY plant reads the field the same way `filterByPlant` compares it. If the
  // two ever disagree, per-plant totals stop summing to the All Plants one — so they are asserted
  // together here rather than apart.
  const rows = [
    { plant: 'hyderabad' }, { plant: 'npmd' }, { plant: 'hyderabad' },
    { plant: '' }, { plant: '  ' }, { plant: null }, {},
  ]

  it('collapses blank, whitespace, null and missing to one Unattributed key', () => {
    expect([...plantKeysIn(rows)].sort()).toEqual(['', 'hyderabad', 'npmd'])
    expect(plantKeysIn([])).toEqual(new Set())
    expect(plantKeysIn(null)).toEqual(new Set())
  })

  it('produces keys that partition the rows through filterByPlant, losing none', () => {
    const total = [...plantKeysIn(rows)].reduce((n, k) => n + filterByPlant(rows, k).length, 0)
    expect(total).toBe(rows.length)
  })
})

describe('plantNamesIn — whose rows these are, in words (ticket #128)', () => {
  // The servable-orders message has to say WHOSE stock it is serving from, and the only honest
  // answer is the plants the stock rows actually carry. Names, not ids: the message is read on a
  // phone, and `hyderabad` is not a thing anybody calls the plant.
  it('names the plants present, in master order', () => {
    expect(plantNamesIn([{ plant: 'npmd' }, { plant: 'hyderabad' }, { plant: 'npmd' }]))
      .toEqual(['Hyderabad', 'NPMD'])
  })

  it('says nothing about plants with no rows', () => {
    expect(plantNamesIn([{ plant: 'hyderabad' }])).toEqual(['Hyderabad'])
    expect(plantNamesIn([])).toEqual([])
    expect(plantNamesIn(null)).toEqual([])
  })

  // Same rule as everywhere else: a row nobody mapped is a labelling gap, never a fifth plant, and
  // never dropped — a message that quietly omitted it would name the wrong floor.
  it('folds blank, missing and off-master rows into one Unattributed, last', () => {
    expect(plantNamesIn([{ plant: 'hyderabad' }, { plant: '' }, {}, { plant: 'atlantis' }]))
      .toEqual(['Hyderabad', 'Unattributed'])
    expect(plantNamesIn([{ plant: null }])).toEqual(['Unattributed'])
  })

  // The names come from the master, so renaming a plant on screen renames it in the message too.
  it('reads its labels from the master it is given', () => {
    const master = [{ id: 'hyderabad', name: 'Hyd Works' }, { id: 'npmd', name: 'Pune Works' }]
    expect(plantNamesIn([{ plant: 'npmd' }, { plant: 'hyderabad' }], master)).toEqual(['Hyd Works', 'Pune Works'])
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

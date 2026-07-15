import { describe, it, expect } from 'vitest'
import { buildFinishedStockData, buildRawMaterialData, buildMtdDashboardData } from './reports'

// ── Report A fixture ──
const skus = [
  { skuCode: 'A', productType: 'CHS', nominalBore: '32', outsideDiameter: '42.4', thickness: 2, length: 6000, weightPerTube: 12, status: 'published' },
  { skuCode: 'B', productType: 'SHS', height: 25, breadth: 25, thickness: 2, length: 6000, weightPerTube: 8.81, status: 'published' },
  { skuCode: 'C', productType: 'RHS', height: 50, breadth: 25, thickness: 1.6, length: 6000, weightPerTube: 11.36, status: 'published' },
  { skuCode: 'D', productType: 'SHS', height: 38, breadth: 38, thickness: 2, length: 6000, weightPerTube: 12.82, status: 'draft' }, // unpublished
  { skuCode: 'E', productType: 'SHS', height: 20, breadth: 20, thickness: 2, length: 6000, weightPerTube: 6.78, status: 'published' }, // zero stock
]
const productions = [
  { id: 'p1', skuCode: 'A', tubeCount: 100, totalWeight: 1.2 },
  { id: 'p2', skuCode: 'B', tubeCount: 200, totalWeight: 1.762 },
  { id: 'p3', skuCode: 'C', tubeCount: 50, totalWeight: 0.568 },
]
const dispatches = [
  { id: 'd1', bundleEntries: [
    { skuCode: 'A', pieces: 40, weight: 0.48 }, // A → 60 pcs / 0.72 MT left
    { skuCode: 'C', pieces: 50, weight: 0.568 }, // C → fully dispatched (0 left)
  ] },
]

describe('buildFinishedStockData', () => {
  it('buckets CHS→ROUND, SHS, RHS and lists only stocked sizes by default', () => {
    const { sections, grand } = buildFinishedStockData(skus, productions, dispatches)
    expect(sections.map(s => s.name)).toEqual(['ROUND', 'SHS']) // C fully dispatched, E never produced → dropped
    const round = sections.find(s => s.name === 'ROUND')
    expect(round.rows).toHaveLength(1)
    expect(round.rows[0].size).toBe('32 NB')
    expect(round.rows[0].pcs).toBe(60)
    expect(round.rows[0].mt).toBeCloseTo(0.72, 6)
    expect(round.rows[0].kgPerPcs).toBe(12)
    expect(round.subtotal.pcs).toBe(60)
    const shs = sections.find(s => s.name === 'SHS')
    expect(shs.rows[0].size).toBe('25x25')
    expect(shs.rows[0].pcs).toBe(200)
  })

  it('excludes unpublished SKUs and sums the grand total', () => {
    const { sections, grand } = buildFinishedStockData(skus, productions, dispatches)
    const allSizes = sections.flatMap(s => s.rows.map(r => r.size))
    expect(allSizes).not.toContain('38x38') // SKU D is draft
    expect(grand.pcs).toBe(260)
    expect(grand.mt).toBeCloseTo(2.482, 6)
  })

  it('nonZeroOnly:false keeps zero-stock published SKUs (RHS reappears)', () => {
    const { sections } = buildFinishedStockData(skus, productions, dispatches, { nonZeroOnly: false })
    expect(sections.map(s => s.name)).toEqual(['ROUND', 'SHS', 'RHS'])
    const rhs = sections.find(s => s.name === 'RHS')
    expect(rhs.rows[0].size).toBe('50x25')
    expect(rhs.rows[0].pcs).toBe(0)
  })
})

// ── Report B fixture ──
const coils = [
  { id: 'c1', hrCoilId: 'M1', width: 1250, thickness: 2.5, coilGrade: 'GR2', actualWeight: 72, deleted: false }, // unslit
  { id: 'c2', hrCoilId: 'M2', width: 1220, thickness: 3.0, coilGrade: 'GR2', actualWeight: 64, deleted: false }, // slit → excluded
  { id: 'c3', hrCoilId: 'M3', width: 1250, thickness: 2.5, coilGrade: 'GR2', actualWeight: 8, deleted: false }, // unslit, same group as M1
  { id: 'c4', hrCoilId: 'M4', width: 1000, thickness: 2.0, coilGrade: 'GR1', actualWeight: 50, deleted: true }, // deleted → excluded
]
const babyCoils = [
  { id: 'b1', babyCoilId: 'M2-A', hrCoilId: 'M2', width: 150, thickness: 3.0, weight: 30, consumed: false, deleted: false },
  { id: 'b2', babyCoilId: 'M2-B', hrCoilId: 'M2', width: 150, thickness: 3.0, weight: 34, consumed: false, deleted: false },
  { id: 'b3', babyCoilId: 'M2-C', hrCoilId: 'M2', width: 100, thickness: 3.0, weight: 0, consumed: false, deleted: false }, // zero → skip
  { id: 'b4', babyCoilId: 'M2-D', hrCoilId: 'M2', width: 200, thickness: 3.0, weight: 10, consumed: true, deleted: false }, // consumed → excluded
]
const rmProductions = [
  { id: 'rp1', coilAllocations: [{ babyCoilId: 'M2-A', hrCoilId: 'M2', pieces: 10, weight: 5 }] }, // b1 free → 25
]

describe('buildRawMaterialData', () => {
  it('HR Coil Stock = unslit mother coils only, grouped width×thick×grade', () => {
    const { hrCoil } = buildRawMaterialData(coils, babyCoils, rmProductions)
    expect(hrCoil.groups).toHaveLength(1) // M1 + M3 collapse; M2 slit, M4 deleted
    expect(hrCoil.groups[0]).toMatchObject({ width: 1250, thick: 2.5, grade: 'GR2' })
    expect(hrCoil.groups[0].mt).toBeCloseTo(80, 6) // 72 + 8
    expect(hrCoil.total).toBeCloseTo(80, 6)
  })

  it('Strip = baby-coil free weight (weight − consumed), excludes manually-consumed coils', () => {
    const { strip } = buildRawMaterialData(coils, babyCoils, rmProductions)
    expect(strip.groups).toHaveLength(1) // b1+b2 group; b3 zero, b4 consumed dropped
    expect(strip.groups[0]).toMatchObject({ width: 150, thick: 3.0 })
    expect(strip.groups[0].mt).toBeCloseTo(59, 6) // (30−5) + 34
    expect(strip.total).toBeCloseTo(59, 6)
  })

  it('grand total = HR coil + strip', () => {
    const { grand } = buildRawMaterialData(coils, babyCoils, rmProductions)
    expect(grand).toBeCloseTo(139, 6) // 80 + 59
  })

  it('handles empty inputs without throwing', () => {
    const { hrCoil, strip, grand } = buildRawMaterialData([], [], [])
    expect(hrCoil.groups).toEqual([])
    expect(strip.groups).toEqual([])
    expect(grand).toBe(0)
  })
})

// ── Report C fixture — PB MTD Dashboard. D = 2026-07-15 (DAY 15, MONTH 2026-07, PREV 2026-06). ──
const dSkus = [
  { skuCode: 'S1', productType: 'SHS', height: 50, breadth: 50, thickness: 2.0, length: 6000, weightPerTube: 10 },
  { skuCode: 'S2', productType: 'SHS', height: 40, breadth: 40, thickness: 2.5, length: 6000, weightPerTube: 8 },
]
const dOrders = [
  { orderDate: '2026-07-15', quantity: 20, confirmed: 5, nonConfirmed: 3, orderStatus: 'Confirmed' }, // D
  { orderDate: '2026-07-14', quantity: 10, confirmed: 2, nonConfirmed: 1, orderStatus: '' },          // D-1
  { orderDate: '2026-07-13', quantity: 8,  confirmed: 0, nonConfirmed: 4, orderStatus: '' },          // D-2
  { orderDate: '2026-07-02', quantity: 12, confirmed: 1, nonConfirmed: 2, orderStatus: '' },          // earlier this month
  { orderDate: '2026-06-20', quantity: 30, confirmed: 9, nonConfirmed: 9, orderStatus: 'Delivered' }, // prev month + delivered → excluded from conf/non-conf & intake
  { orderDate: '2026-07-05', quantity: 5,  confirmed: 4, nonConfirmed: 0, orderStatus: 'Delivered' }, // delivered → excluded from conf/non-conf, still counts in month intake
]
const dDispatches = [
  { dateOfDispatch: '2026-07-15', bundleEntries: [{ skuCode: 'S1', weight: 12 }] }, // D
  { dateOfDispatch: '2026-07-14', bundleEntries: [{ skuCode: 'S1', weight: 8 }] },  // D-1
  { dateOfDispatch: '2026-07-03', bundleEntries: [{ skuCode: 'S2', weight: 10 }] }, // this month
  { dateOfDispatch: '2026-06-10', bundleEntries: [{ skuCode: 'S1', weight: 7 }] },  // prev month, day 10 ≤ 15 → prev window
  { dateOfDispatch: '2026-06-20', bundleEntries: [{ skuCode: 'S1', weight: 5 }] },  // prev month, day 20 > 15 → NOT in prev window
]
const dProductions = [ // already live-weight-resolved (totalWeight is authoritative)
  { skuCode: 'S1', dateOfProduction: '2026-07-10', tubeCount: 100, totalWeight: 40 },
  { skuCode: 'S1', dateOfProduction: '2026-05-01', tubeCount: 50,  totalWeight: 20 },
  { skuCode: 'S2', dateOfProduction: '2026-07-12', tubeCount: 60,  totalWeight: 25 },
  { skuCode: 'S2', dateOfProduction: '2026-06-01', tubeCount: 30,  totalWeight: 15 },
]

describe('buildMtdDashboardData', () => {
  const D = '2026-07-15'
  it('derives dates: month / prev-month / day / calendar days remaining (inclusive)', () => {
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D })
    expect(r.month).toBe('2026-07')
    expect(r.prevMonth).toBe('2026-06')
    expect(r.day).toBe(15)
    expect(r.daysRemaining).toBe(17) // Jul 15..31 inclusive
  })

  it('computes order/invoice KPIs (confirmed & non-confirmed exclude Delivered lines)', () => {
    const { kpis, orderStatus } = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D })
    expect(orderStatus.confirmed).toBe(8)       // 5+2+0+1 (two Delivered lines excluded)
    expect(orderStatus.nonConfirmed).toBe(10)   // 3+1+4+2
    expect(kpis.pending).toBe(18)
    expect(kpis.invoicedMtd).toBe(30)           // July ≤ D: 12+8+10
    expect(kpis.orderPipeline).toBe(48)         // 30 + 8 + 10
    expect(kpis.invoicedPctPipeline).toBeCloseTo(62.5, 4)
  })

  it('computes the Order Pipeline — MTD lines (prev-month same-days, D / D-1, orders logged)', () => {
    const { orderPipelineMtd } = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D })
    expect(orderPipelineMtd.totalOrders).toBe(48)
    expect(orderPipelineMtd.ordersMonthIntake).toBe(55)  // 20+10+8+12+5 (July, incl. Delivered qty; June excluded)
    expect(orderPipelineMtd.invoicedPrev).toBe(7)        // June day ≤ 15 only (06-20 excluded)
    expect(orderPipelineMtd.dispatchD).toBe(12)
    expect(orderPipelineMtd.dispatchD1).toBe(8)
    expect(orderPipelineMtd.ordersD).toBe(20)
    expect(orderPipelineMtd.ordersD1).toBe(10)
    expect(orderPipelineMtd.ordersD2).toBe(8)
  })

  it('computes production + physical inventory from live weights', () => {
    const { inventoryProduction } = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D })
    expect(inventoryProduction.freshProductionMtd).toBe(65) // July: 40 + 25
    expect(inventoryProduction.physicalInventory).toBe(58)  // positive on-hand only: S1 28 + S2 30
  })

  it('FIFO ageing: buckets tie to on-hand, weighted-avg age, and Σ buckets == physical inventory (no over-dispatch)', () => {
    const { inventoryProduction, kpis } = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D })
    const b = inventoryProduction.buckets
    expect(b.d0_30).toBeCloseTo(53, 6)   // S1 28 @5d + S2 25 @3d
    expect(b.d31_60).toBeCloseTo(5, 6)   // S2 5 @44d
    expect(b.d61_90).toBeCloseTo(0, 6)
    expect(b.d90plus).toBeCloseTo(0, 6)
    expect(b.d0_30 + b.d31_60 + b.d61_90 + b.d90plus).toBeCloseTo(58, 6)
    expect(kpis.invAgeingDaysAvg).toBeCloseTo(7.5, 4) // (28*5 + 30*9.8333)/58
  })

  it('SKU ageing (>2 MT): sorted by on-hand MT desc, labelled size × thickness, with subtotal', () => {
    const { skuAgeingRows } = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D })
    expect(skuAgeingRows.rows).toHaveLength(2) // S1 (28) and S2 (30) both exceed 2 MT
    expect(skuAgeingRows.rows[0].onhandMt).toBeCloseTo(30, 6) // S2 first (bigger)
    expect(skuAgeingRows.rows[0].label).toBe('40x40 x 2.5')
    expect(skuAgeingRows.rows[1].onhandMt).toBeCloseTo(28, 6) // S1
    expect(skuAgeingRows.rows[1].label).toBe('50x50 x 2')
    expect(skuAgeingRows.total.onhandMt).toBeCloseTo(58, 6)
    expect(skuAgeingRows.total.avgAgeDays).toBeCloseTo(7.5, 4)
  })

  it('SKU ageing (>2 MT): excludes SKUs with 2 MT or less on-hand', () => {
    const skus = [
      { skuCode: 'BIG', productType: 'SHS', height: 50, breadth: 50, thickness: 2.0, length: 6000, weightPerTube: 10 },
      { skuCode: 'SMALL', productType: 'SHS', height: 40, breadth: 40, thickness: 2.5, length: 6000, weightPerTube: 8 },
    ]
    const productions = [
      { skuCode: 'BIG', dateOfProduction: '2026-07-10', tubeCount: 10, totalWeight: 10 },   // on-hand 9 (>2 → kept)
      { skuCode: 'SMALL', dateOfProduction: '2026-07-10', tubeCount: 5, totalWeight: 5 },    // on-hand 1.5 (≤2 → dropped)
    ]
    const dispatches = [
      { dateOfDispatch: '2026-07-12', bundleEntries: [{ skuCode: 'BIG', weight: 1 }, { skuCode: 'SMALL', weight: 3.5 }] },
    ]
    const { skuAgeingRows } = buildMtdDashboardData([], dispatches, productions, skus, { date: '2026-07-15' })
    expect(skuAgeingRows.rows.map(r => r.label)).toEqual(['50x50 x 2']) // only BIG (9 MT); SMALL (1.5 MT) excluded
    expect(skuAgeingRows.total.onhandMt).toBeCloseTo(9, 6)
  })

  it('Best Estimate blank ⇒ Invoice % of BE and Daily Run Rate are null (render N/A)', () => {
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D })
    expect(r.orderStatus.invoicePctOfBe).toBeNull()
    expect(r.orderPipelineMtd.dailyRunRate).toBeNull()
  })

  it('Best Estimate supplied ⇒ Invoice % of BE and Daily Run Rate computed', () => {
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D, bestEstimate: 2500 })
    expect(r.orderStatus.invoicePctOfBe).toBeCloseTo(1.2, 4)      // 30 / 2500
    expect(r.orderPipelineMtd.dailyRunRate).toBeCloseTo(145.2941, 3) // (2500 − 30) / 17
  })

  it('handles empty inputs without throwing', () => {
    const r = buildMtdDashboardData([], [], [], [], { date: D })
    expect(r.kpis.physicalInventory).toBe(0)
    expect(r.kpis.invAgeingDaysAvg).toBeNull()
    expect(r.skuAgeingRows.rows).toEqual([])
  })

  it('Physical Inventory counts positive on-hand only (over-shipped SKUs floored to 0, not netted)', () => {
    const skus = [
      { skuCode: 'BIG', productType: 'SHS', height: 50, breadth: 50, thickness: 2.0, length: 6000, weightPerTube: 10 },
      { skuCode: 'OVER', productType: 'SHS', height: 30, breadth: 30, thickness: 2.0, length: 6000, weightPerTube: 8 },
    ]
    const productions = [
      { skuCode: 'BIG', dateOfProduction: '2026-07-10', tubeCount: 10, totalWeight: 10 },  // on-hand 9
      { skuCode: 'OVER', dateOfProduction: '2026-07-10', tubeCount: 3, totalWeight: 3 },    // dispatched 5 → floored to 0
    ]
    const dispatches = [
      { dateOfDispatch: '2026-07-12', bundleEntries: [{ skuCode: 'BIG', weight: 1 }, { skuCode: 'OVER', weight: 5 }] },
    ]
    const r = buildMtdDashboardData([], dispatches, productions, skus, { date: '2026-07-15' })
    expect(r.kpis.physicalInventory).toBeCloseTo(9, 6)          // BIG 9 only; OVER floored to 0 (NOT the net 13−6=7)
    const b = r.inventoryProduction.buckets
    expect(b.d0_30 + b.d31_60 + b.d61_90 + b.d90plus).toBeCloseTo(9, 6) // ageing buckets tie to Physical Inventory
    expect(r.skuAgeingRows.total.onhandMt).toBeCloseTo(9, 6)    // only BIG (>2 MT); OVER at 0 excluded
    expect(r.reconciliation.otherLe2).toBeCloseTo(0, 6)
    // the sheet's >2 MT list plus the ≤2 MT others reconcile exactly to Physical Inventory
    expect(r.skuAgeingRows.total.onhandMt + r.reconciliation.otherLe2).toBeCloseTo(r.kpis.physicalInventory, 6)
  })
})

describe('generateMtdDashboardReport (render smoke test)', () => {
  it('renders a valid 2-sheet workbook with the expected colour bands and cell values', async () => {
    const { generateMtdDashboardReport } = await import('./reports')
    // Capture the workbook bytes by stubbing the browser download path (downloadWorkbook uses Blob/URL/document).
    let buf = null
    const origDoc = globalThis.document, origURL = globalThis.URL, origBlob = globalThis.Blob
    globalThis.Blob = class { constructor(parts) { this._buf = parts[0] } }
    globalThis.URL = { createObjectURL: (b) => { buf = b._buf; return 'blob:x' }, revokeObjectURL() {} }
    globalThis.document = { createElement: () => ({ click() {}, style: {} }), body: { appendChild() {}, removeChild() {} } }
    try {
      await generateMtdDashboardReport(dOrders, dDispatches, dProductions, dSkus, { date: '2026-07-15', bestEstimate: 2500 })
    } finally {
      globalThis.document = origDoc; globalThis.URL = origURL; globalThis.Blob = origBlob
    }
    expect(buf).toBeTruthy()

    const mod = await import('exceljs')
    const ExcelJS = mod.Workbook ? mod : (mod.default ?? mod)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf)
    expect(wb.worksheets.map(w => w.name)).toEqual(['Dashboard', 'SKU Ageing (>2 MT)'])

    const ws = wb.getWorksheet('Dashboard')
    expect(String(ws.getCell('A1').value)).toContain('PB MTD DASHBOARD')
    expect(ws.getCell('A8').value).toBe('ORDER STATUS SUMMARY')
    expect(ws.getCell('G8').value).toBe('ORDER PIPELINE — MTD')
    expect(Number(ws.getCell(5, 9).value)).toBeCloseTo(58, 6)   // Physical Inventory KPI card (card 5 → col 9, value row 5)
    expect(Number(ws.getCell('E13').value)).toBe(8)             // Order Status → Confirmed Pending Invoice
    expect(ws.getCell('E15').value).toBe('1%')                  // Order Status → Invoice % of BE (30/2500, whole number)
    expect(Number(ws.getCell('K18').value)).toBeCloseTo(145.2941, 3) // Order Pipeline → Daily Run Rate Required

    const ws2 = wb.getWorksheet('SKU Ageing (>2 MT)')
    expect(ws2.getCell('A4').value).toBe('40x40 x 2.5')         // highest-inventory SKU
    expect(ws2.getCell('A6').value).toBe('TOTAL (>2 MT)')
    expect(Number(ws2.getCell('B6').value)).toBeCloseTo(58, 6)  // >2 MT on-hand total
  })
})

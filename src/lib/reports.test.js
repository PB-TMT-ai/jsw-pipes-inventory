import { describe, it, expect } from 'vitest'
import { buildFinishedStockData, buildRawMaterialData, buildMtdDashboardData, buildDistributorRegionData, buildRegionMtdSummary, buildPlantMtdSummary } from './reports'
import { salesKpis } from './calc'

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

  it('excludes over-dispatched SKUs from the rows, but keeps their tonnage in `unmatched` / `net`', () => {
    // SKU A produced 0.12 MT / 10 pcs but dispatched 0.36 MT / 30 pcs → −0.24 MT on-hand.
    // A size with no stock has no place on a stock sheet, so it isn't listed and can't drag the
    // listed grand total down — but the 0.24 MT DID leave the plant, so `net` must still carry it.
    const odSkus = [{ skuCode: 'A', productType: 'CHS', nominalBore: '32', outsideDiameter: '42.4', thickness: 2, length: 6000, weightPerTube: 12, status: 'published' }]
    const odProd = [{ id: 'p1', skuCode: 'A', tubeCount: 10, totalWeight: 0.12 }]
    const odDisp = [{ id: 'd1', bundleEntries: [{ skuCode: 'A', pieces: 30, weight: 0.36 }] }]
    const { sections, grand, unmatched, net } = buildFinishedStockData(odSkus, odProd, odDisp)
    expect(sections).toHaveLength(0) // no positive stock → not listed
    expect(grand.pcs).toBe(0)        // listed rows only
    expect(grand.mt).toBe(0)
    expect(unmatched.mt).toBeCloseTo(0.24, 6)  // 0.36 shipped − 0.12 produced
    expect(unmatched.pcs).toBe(20)
    expect(unmatched.skus).toBe(1)
    expect(net.mt).toBeCloseTo(-0.24, 6)       // the plant genuinely owes this tonnage
  })

  it('clean data leaves `unmatched` at zero and `net` equal to `grand`', () => {
    const { grand, unmatched, net } = buildFinishedStockData(skus, productions, dispatches)
    expect(unmatched.mt).toBe(0)
    expect(unmatched.skus).toBe(0)
    expect(net.mt).toBeCloseTo(grand.mt, 6)
    expect(net.pcs).toBe(grand.pcs)
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
// Distributor Best Estimates — the plant BE is their sum for the report month, never a typed figure.
const dEstimates = [
  { distributorKey: 'D1', distributorName: 'PATEL STEEL', month: '2026-07', bestEstimate: 1500 },
  { distributorKey: 'D2', distributorName: 'SHREE TRADERS', month: '2026-07', bestEstimate: 1000 },
  { distributorKey: 'D3', distributorName: 'OLD PLAN', month: '2026-06', bestEstimate: 900 }, // other month → excluded
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

  it('Best Estimate is Σ the month’s distributor estimates ⇒ Invoice % of BE and Daily Run Rate computed', () => {
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D, estimates: dEstimates })
    expect(r.kpis.bestEstimate).toBe(2500)                        // 1500 + 1000; June's 900 excluded
    expect(r.orderStatus.invoicePctOfBe).toBeCloseTo(1.2, 4)      // 30 / 2500
    expect(r.orderPipelineMtd.dailyRunRate).toBeCloseTo(145.2941, 3) // (2500 − 30) / 17
  })

  it('estimates from another month never leak into the plant BE', () => {
    const juneOnly = dEstimates.filter(e => e.month === '2026-06')
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D, estimates: juneOnly })
    expect(r.kpis.bestEstimate).toBeNull()
    expect(r.orderStatus.invoicePctOfBe).toBeNull()
  })

  it('a soft-deleted or blank estimate drops out of the plant BE rather than counting as zero', () => {
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, {
      date: D,
      estimates: [
        { distributorKey: 'D1', month: '2026-07', bestEstimate: 1500 },
        { distributorKey: 'D2', month: '2026-07', bestEstimate: 1000, deleted: true },
        { distributorKey: 'D4', month: '2026-07', bestEstimate: '' },
      ],
    })
    expect(r.kpis.bestEstimate).toBe(1500)
  })

  it('distributor sheet Plan column sums to exactly the plant BE KPI', () => {
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D, estimates: dEstimates })
    expect(r.distributorRegions.grand.plan).toBe(r.kpis.bestEstimate)
  })

  it('invoiced tonnage from distributors with no estimate is reported as unallocated, not absorbed', () => {
    // The fixture's invoices carry no distributor at all, so every invoiced MT is unallocated.
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D, estimates: dEstimates })
    expect(r.distributorRegions.unallocatedInvoiced).toBeCloseTo(30, 6)  // 12 + 8 + 10 in July
    expect(r.orderStatus.invoicePctOfBe).toBeCloseTo(1.2, 4)               // and it still counts in the actual
  })

  it('handles empty inputs without throwing', () => {
    const r = buildMtdDashboardData([], [], [], [], { date: D })
    expect(r.kpis.physicalInventory).toBe(0)
    expect(r.kpis.invAgeingDaysAvg).toBeNull()
    expect(r.skuAgeingRows.rows).toEqual([])
  })

  it('Physical Inventory = Σ produced − Σ invoiced: over-shipped SKUs hold no stock but stay deducted', () => {
    const skus = [
      { skuCode: 'BIG', productType: 'SHS', height: 50, breadth: 50, thickness: 2.0, length: 6000, weightPerTube: 10 },
      { skuCode: 'OVER', productType: 'SHS', height: 30, breadth: 30, thickness: 2.0, length: 6000, weightPerTube: 8 },
    ]
    const productions = [
      { skuCode: 'BIG', dateOfProduction: '2026-07-10', tubeCount: 10, totalWeight: 10 },  // on-hand 9
      { skuCode: 'OVER', dateOfProduction: '2026-07-10', tubeCount: 3, totalWeight: 3 },    // dispatched 5 → holds 0, owes 2
    ]
    const dispatches = [
      { dateOfDispatch: '2026-07-12', bundleEntries: [{ skuCode: 'BIG', weight: 1 }, { skuCode: 'OVER', weight: 5 }] },
    ]
    const r = buildMtdDashboardData([], dispatches, productions, skus, { date: '2026-07-15' })
    // OVER shipped 5 against 3 produced. It can't hold −2, but those 2 MT left the plant, so the
    // total is the true net 13 − 6 = 7 — NOT 9 (which would silently un-ship the 2 MT).
    expect(r.kpis.physicalInventory).toBeCloseTo(7, 6)
    expect(r.kpis.unmatchedDispatch).toBeCloseTo(2, 6)
    const b = r.inventoryProduction.buckets
    // Ageing stays over positive stock only — you can't age tonnage that isn't on the floor.
    expect(b.d0_30 + b.d31_60 + b.d61_90 + b.d90plus).toBeCloseTo(9, 6)
    expect(r.skuAgeingRows.total.onhandMt).toBeCloseTo(9, 6)    // only BIG (>2 MT); OVER at 0 excluded
    expect(r.reconciliation.otherLe2).toBeCloseTo(0, 6)
    // Ladder closes: listed (>2 MT) + small (≤2 MT) − unmatched == Physical Inventory
    expect(r.skuAgeingRows.total.onhandMt + r.reconciliation.otherLe2 - r.reconciliation.unmatchedDispatch)
      .toBeCloseTo(r.kpis.physicalInventory, 6)
  })

  it('Physical Inventory equals Σ produced − Σ dispatched on clean data (no unmatched term)', () => {
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D })
    expect(r.kpis.unmatchedDispatch).toBeCloseTo(0, 6)
    expect(r.kpis.physicalInventory).toBeCloseTo(r.skuAgeingRows.total.onhandMt + r.reconciliation.otherLe2, 6)
  })
})

// Render the MTD workbook and read it back. Captures the bytes by stubbing the browser download
// path (downloadWorkbook uses Blob/URL/document), then re-parses them with exceljs.
async function renderMtdWorkbook(orders, dispatches, prods, skuList, opts) {
  const { generateMtdDashboardReport } = await import('./reports')
  let buf = null
  // The <a download="…"> the browser would save as. Captured so the plant-scope suffix (#121) is
  // testable — a scoped workbook that keeps the company file name is the whole hazard.
  const anchor = { click() {}, style: {} }
  const origDoc = globalThis.document, origURL = globalThis.URL, origBlob = globalThis.Blob
  globalThis.Blob = class { constructor(parts) { this._buf = parts[0] } }
  globalThis.URL = { createObjectURL: (b) => { buf = b._buf; return 'blob:x' }, revokeObjectURL() {} }
  globalThis.document = { createElement: () => anchor, body: { appendChild() {}, removeChild() {} } }
  let data
  try {
    data = await generateMtdDashboardReport(orders, dispatches, prods, skuList, opts)
  } finally {
    globalThis.document = origDoc; globalThis.URL = origURL; globalThis.Blob = origBlob
  }
  expect(buf).toBeTruthy()
  const mod = await import('exceljs')
  const ExcelJS = mod.Workbook ? mod : (mod.default ?? mod)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(buf)
  return { wb, data, filename: anchor.download }
}

describe('a plant-scoped workbook announces its scope (ticket #121)', () => {
  // These files are mailed and broadcast — read by people who never saw the header that scoped
  // them. So the scope has to travel with the file, in BOTH channels, or Hyderabad's tonnage gets
  // circulated as the company's.
  it('stamps the plant into every sheet title and into the file name', async () => {
    const { wb, filename } = await renderMtdWorkbook(dOrders, dDispatches, dProductions, dSkus, {
      date: '2026-07-15', estimates: dEstimates,
      companyName: 'JSW One Pipes & Tubes — Hyderabad only', fileSuffix: 'hyderabad',
    })
    expect(filename).toBe('PB-MTD-Dashboard-2026-07-15-hyderabad.xlsx')
    // Every sheet, not just the first — a reader may open on any tab.
    for (const ws of wb.worksheets) {
      expect(String(ws.getCell('A1').value)).toContain('Hyderabad only')
    }
  })

  it('leaves the company report untouched when nothing is scoped', async () => {
    const { wb, filename } = await renderMtdWorkbook(dOrders, dDispatches, dProductions, dSkus,
      { date: '2026-07-15', estimates: dEstimates })
    expect(filename).toBe('PB-MTD-Dashboard-2026-07-15.xlsx')
    for (const ws of wb.worksheets) {
      expect(String(ws.getCell('A1').value)).not.toContain('only')
    }
  })
})

// Row number of the first row whose column A starts with `prefix` (sheets grow, so never hard-code).
const rowStartingWith = (ws, prefix) =>
  ws.getColumn(1).values.findIndex(v => String(v ?? '').startsWith(prefix))

describe('generateMtdDashboardReport (render smoke test)', () => {
  it('renders a valid 2-sheet workbook with the expected colour bands and cell values', async () => {
    const { wb } = await renderMtdWorkbook(dOrders, dDispatches, dProductions, dSkus,
      { date: '2026-07-15', estimates: dEstimates })
    expect(wb.worksheets.map(w => w.name))
      .toEqual(['Dashboard', 'SKU Ageing (>2 MT)', 'Distributor by Region', 'Distributor × SKU'])

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

    // Sheet 3 — the distributor targets behind the Dashboard's derived Best Estimate KPI.
    const ws3 = wb.getWorksheet('Distributor by Region')
    expect(String(ws3.getCell('A1').value)).toContain('DISTRIBUTOR ORDERS & INVOICING BY REGION')
    expect(ws3.getCell('A3').value).toBe('Region')
    expect(ws3.getCell('D3').value).toBe('Plan (MT)')
    const grandRow = ws3.getColumn(1).values.findIndex(v => String(v || '').startsWith('GRAND TOTAL'))
    expect(Number(ws3.getCell(grandRow, 4).value)).toBeCloseTo(2500, 6) // ties to the Dashboard KPI
  })
})

// ── SKU Ageing sheet — one-decimal display (issue #103) ──
// Fixture with deliberately fractional tonnage, so a whole-number format would hide the decimals:
//   T1  produced 40.25, dispatched 12.05 → on hand 28.2   (> 2 MT → listed on the sheet)
//   T2  produced  2.40, dispatched  2.00 → on hand  0.4   (≤ 2 MT → the "Other SKUs" rec line)
//   T3  produced  0,    dispatched  0.02 → over-shipped   (the "Dispatched w/o production" line)
// Physical Inventory = 42.65 produced − 14.07 invoiced = 28.58.
const rSkus = [
  { skuCode: 'T1', productType: 'SHS', height: 50, breadth: 50, thickness: 2.0, length: 6000, weightPerTube: 10 },
  { skuCode: 'T2', productType: 'SHS', height: 40, breadth: 40, thickness: 2.5, length: 6000, weightPerTube: 8 },
  { skuCode: 'T3', productType: 'SHS', height: 30, breadth: 30, thickness: 2.0, length: 6000, weightPerTube: 6 },
]
const rProductions = [
  { skuCode: 'T1', dateOfProduction: '2026-07-10', tubeCount: 100, totalWeight: 40.25 },
  { skuCode: 'T2', dateOfProduction: '2026-07-12', tubeCount: 10, totalWeight: 2.4 },
]
const rDispatches = [
  { dateOfDispatch: '2026-07-14', bundleEntries: [{ skuCode: 'T1', weight: 12.05 }, { skuCode: 'T2', weight: 2 }, { skuCode: 'T3', weight: 0.02 }] },
]

describe('SKU Ageing sheet — one-decimal rendering', () => {
  const opts = { date: '2026-07-15', estimates: [] }

  it('formats tonnage and weighted-average age to one decimal, day counts whole', async () => {
    const { wb } = await renderMtdWorkbook([], rDispatches, rProductions, rSkus, opts)
    const ws2 = wb.getWorksheet('SKU Ageing (>2 MT)')
    const r = 4 // first data row (title 1–2, header 3)
    expect(ws2.getCell(r, 1).value).toBe('50x50 x 2')
    ;[2, 3, 4, 5, 6].forEach(c => expect(ws2.getCell(r, c).numFmt).toBe('#,##0.0')) // on-hand + 4 buckets
    expect(ws2.getCell(r, 8).numFmt).toBe('#,##0.0')                                 // wtd avg age
    expect(ws2.getCell(r, 7).numFmt).toBe('#,##0')                                   // oldest (d) stays whole
    // The subtotal and the reconciliation block carry the same tonnage format.
    const tot = rowStartingWith(ws2, 'TOTAL (>2 MT)')
    expect(ws2.getCell(tot, 2).numFmt).toBe('#,##0.0')
    expect(ws2.getCell(rowStartingWith(ws2, '= Physical Inventory'), 2).numFmt).toBe('#,##0.0')
  })

  it('writes exact values — the rounding is the number format, nothing is pre-rounded', async () => {
    const { wb } = await renderMtdWorkbook([], rDispatches, rProductions, rSkus, opts)
    const ws2 = wb.getWorksheet('SKU Ageing (>2 MT)')
    expect(Number(ws2.getCell(4, 2).value)).toBeCloseTo(28.2, 6)   // 40.25 − 12.05, not 28
    expect(Number(ws2.getCell(4, 3).value)).toBeCloseTo(28.2, 6)   // all of it in the 0–30 d bucket
    expect(Number(ws2.getCell(4, 7).value)).toBe(5)                // produced 07-10, as-on 07-15
  })

  it('keeps the "-" placeholder, re-based on the one-decimal threshold', async () => {
    const { wb } = await renderMtdWorkbook([], rDispatches, rProductions, rSkus, opts)
    const ws2 = wb.getWorksheet('SKU Ageing (>2 MT)')
    // 0.4 MT rounded to whole was 0 and used to print "-"; at one decimal it is a real number.
    expect(Number(ws2.getCell(rowStartingWith(ws2, 'Other SKUs'), 2).value)).toBeCloseTo(0.4, 6)
    // 0.02 MT still rounds to 0.0, so it stays dashed out.
    expect(ws2.getCell(rowStartingWith(ws2, '− Dispatched w/o'), 2).value).toBe('-')
  })

  it('reconciliation identity holds in the rendered cells and ties to the Dashboard KPI', async () => {
    const { wb, data } = await renderMtdWorkbook([], rDispatches, rProductions, rSkus, opts)
    const ws2 = wb.getWorksheet('SKU Ageing (>2 MT)')
    const listed = Number(ws2.getCell(rowStartingWith(ws2, 'TOTAL (>2 MT)'), 2).value)
    const other = Number(ws2.getCell(rowStartingWith(ws2, 'Other SKUs'), 2).value)
    const phys = Number(ws2.getCell(rowStartingWith(ws2, '= Physical Inventory'), 2).value)
    // The unmatched cell prints "-", so take that term from the data the report was built from.
    const unmatched = data.reconciliation.unmatchedDispatch
    expect(unmatched).toBeCloseTo(0.02, 6)
    expect(listed + other - unmatched).toBeCloseTo(phys, 6)   // 28.2 + 0.4 − 0.02 = 28.58
    expect(phys).toBeCloseTo(28.58, 6)
    // …and the same figure sits in the Dashboard's Physical Inventory KPI card, still whole-formatted.
    const kpi = wb.getWorksheet('Dashboard').getCell(5, 9)
    expect(Number(kpi.value)).toBeCloseTo(phys, 6)
    expect(kpi.numFmt).toBe('#,##0')
  })
})

// ── Distributor sheet, region-grouped (issue #104) ──────────────────────────────────────────────
// Six distributors across three region blocks, with deliberately fractional tonnage so a
// whole-number format would hide the decimals. Seeded state → region mapping (src/data/stateRegions):
// TELANGANA + TAMIL NADU → South, MAHARASHTRA + GUJARAT → West, ODISHA → nothing (Unmapped).
//
//   D1 PATEL STEEL     TELANGANA   South     Plan 100   inv 40.5   conf 5 + nonConf 3 → Total 48.5
//   D6 KAVERI PIPES    TAMIL NADU  South     Plan  20   inv 10.75                     → Total 10.75
//   D2 SHREE TRADERS   MAHARASHTRA West      Plan  60   inv 30.25                     → Total 30.25
//   D3 NO PLAN TRADING GUJARAT     West      no Plan    inv 20.5                      → Total 20.5
//                      (also ordered into RAJASTHAN earlier — multi-state, most recent wins)
//   D5 PLAN ONLY       (none)      Unmapped  Plan  40   inv  0                        → Total  0
//   D4 BACKLOG STEEL   ODISHA      Unmapped  no Plan    inv  0     conf 12            → Total 12
//
// D5 is the second road into Unmapped: state is derived from a distributor's own order and invoice
// lines, so one that has neither has no state at all — not an unmapped state, no state. Its Plan
// still has to reach the grand total, which is exactly why Unmapped is a block and not a filter.
//
// Plan Σ = 220 (= the plant BE KPI). Invoiced Σ = 102. Total Orders Σ = 122.
const gOrders = [
  { distributorCode: 'D1', customer: 'PATEL STEEL', orderDate: '2026-07-10', shipToState: 'TELANGANA', quantity: 8, confirmed: 5, nonConfirmed: 3 },
  { distributorCode: 'D3', customer: 'NO PLAN TRADING', orderDate: '2026-07-02', shipToState: 'RAJASTHAN', quantity: 0, confirmed: 0, nonConfirmed: 0 },
  { distributorCode: 'D3', customer: 'NO PLAN TRADING', orderDate: '2026-07-09', shipToState: 'GUJARAT', quantity: 0, confirmed: 0, nonConfirmed: 0 },
  // Orders but nothing invoiced this month — the old sheet dropped this row entirely.
  { distributorCode: 'D4', customer: 'BACKLOG STEEL', orderDate: '2026-07-04', shipToState: 'ODISHA', quantity: 12, confirmed: 12, nonConfirmed: 0 },
]
const gDispatches = [
  { dateOfDispatch: '2026-07-11', bundleEntries: [
    { distributorCode: 'D1', customer: 'PATEL STEEL', shipToState: 'TELANGANA', skuCode: 'S1', weight: 40.5 },
    { distributorCode: 'D2', customer: 'SHREE TRADERS', shipToState: 'MAHARASHTRA', skuCode: 'S1', weight: 30.25 },
    { distributorCode: 'D3', customer: 'NO PLAN TRADING', shipToState: 'GUJARAT', skuCode: 'S1', weight: 20.5 },
    { distributorCode: 'D6', customer: 'KAVERI PIPES', shipToState: 'TAMIL NADU', skuCode: 'S1', weight: 10.75 },
  ] },
  // Previous month — must not reach the sheet at all.
  { dateOfDispatch: '2026-06-11', bundleEntries: [{ distributorCode: 'D1', customer: 'PATEL STEEL', shipToState: 'TELANGANA', skuCode: 'S1', weight: 99 }] },
]
const gEstimates = [
  { distributorKey: 'D1', distributorName: 'PATEL STEEL', month: '2026-07', bestEstimate: 100 },
  { distributorKey: 'D2', distributorName: 'SHREE TRADERS', month: '2026-07', bestEstimate: 60 },
  { distributorKey: 'D6', distributorName: 'KAVERI PIPES', month: '2026-07', bestEstimate: 20 },
  { distributorKey: 'D5', distributorName: 'PLAN ONLY', month: '2026-07', bestEstimate: 40 },
]
const gOpts = { date: '2026-07-15', estimates: gEstimates }
const gData = () => buildMtdDashboardData(gOrders, gDispatches, [], [], gOpts).distributorRegions

describe('distributor sheet — region grouping (issue #104)', () => {
  it('groups rows into region blocks, in fixed region order with Unmapped last', () => {
    const dr = gData()
    expect(dr.regions.map(g => g.region)).toEqual(['South', 'West', 'Unmapped'])
    // Distributors sort within their region: biggest Plan first, then biggest invoiced.
    expect(dr.regions[0].rows.map(r => r.customer)).toEqual(['PATEL STEEL', 'KAVERI PIPES'])
    expect(dr.regions[1].rows.map(r => r.customer)).toEqual(['SHREE TRADERS', 'NO PLAN TRADING'])
    // State rides along as a plain column — it never splits or merges a row.
    expect(dr.regions[0].rows.map(r => r.state)).toEqual(['TELANGANA', 'TAMIL NADU'])
    expect(dr.regions[1].rows[1]).toMatchObject({ state: 'GUJARAT', multiState: true }) // most recent state wins
  })

  it('carries the eight columns worth of figures per row, % of Plan as a fraction of invoiced', () => {
    const d1 = gData().regions[0].rows[0]
    expect(d1).toMatchObject({ region: 'South', state: 'TELANGANA', customer: 'PATEL STEEL', plan: 100 })
    expect(d1.invoiced).toBeCloseTo(40.5, 6)
    expect(d1.totalOrders).toBeCloseTo(48.5, 6)   // 40.5 invoiced + 5 confirmed + 3 non-confirmed
    expect(d1.pctOfPlan).toBeCloseTo(0.405, 6)    // invoiced ÷ plan, a FRACTION (the cell format renders %)
    expect(d1.gapToPlan).toBeCloseTo(59.5, 6)
  })

  it('a distributor with no Plan reads N/A rather than a plan of zero it then missed', () => {
    const noPlan = gData().regions[1].rows[1]
    expect(noPlan).toMatchObject({ customer: 'NO PLAN TRADING', plan: null, pctOfPlan: null, gapToPlan: null })
    expect(noPlan.invoiced).toBeCloseTo(20.5, 6)  // …but its tonnage is still on the sheet
  })

  it('region totals sum to the grand total, on every column', () => {
    const dr = gData()
    const sum = (f) => dr.regions.reduce((t, g) => t + (g.total[f] ?? 0), 0)
    expect(sum('plan')).toBeCloseTo(dr.grand.plan, 6)
    expect(sum('totalOrders')).toBeCloseTo(dr.grand.totalOrders, 6)
    expect(sum('invoiced')).toBeCloseTo(dr.grand.invoiced, 6)
    expect(dr.grand.plan).toBe(220)
    expect(dr.grand.invoiced).toBeCloseTo(102, 6)   // 40.5 + 30.25 + 20.5 + 10.75 (June's 99 excluded)
    expect(dr.grand.totalOrders).toBeCloseTo(122, 6) // + 5 + 3 confirmed/non-conf + 12 backlog
  })

  it('the Plan column still sums to the Dashboard Best Estimate KPI', () => {
    const r = buildMtdDashboardData(gOrders, gDispatches, [], [], gOpts)
    expect(r.distributorRegions.grand.plan).toBe(r.kpis.bestEstimate)
    expect(r.kpis.bestEstimate).toBe(220)
    // …and each region's plan is a real slice of it, not a re-derived figure.
    expect(r.distributorRegions.regions[0].total.plan).toBe(120) // South: 100 + 20
    expect(r.distributorRegions.regions[1].total.plan).toBe(60)  // West:  60 (+ one distributor with no plan)
    expect(r.distributorRegions.regions[2].total.plan).toBe(40)  // Unmapped carries a real plan too
  })

  it('an unmapped state groups under Unmapped and its tonnage still counts in the grand total', () => {
    const dr = gData()
    const un = dr.regions.find(g => g.region === 'Unmapped')
    // Two ways in: a state nobody has mapped (ODISHA), and a distributor with no state at all.
    expect(un.rows.map(r => r.customer)).toEqual(['PLAN ONLY', 'BACKLOG STEEL'])
    expect(un.rows.map(r => r.state)).toEqual(['', 'ODISHA'])
    expect(un.total.totalOrders).toBeCloseTo(12, 6)
    expect(un.total.plan).toBe(40)                   // a planned distributor here still holds its target
    expect(un.total.pctOfPlan).toBeCloseTo(0, 6)     // nothing invoiced against it
    // The grand total includes it — a labelling gap must never make weight vanish from a sum.
    expect(dr.grand.totalOrders).toBeCloseTo(122, 6)
    expect(dr.grand.plan).toBe(220)
  })

  it('a region nobody planned reads N/A rather than a target of zero it then missed', () => {
    const dr = buildDistributorRegionData([
      { customer: 'A', region: 'East', state: 'ODISHA', bestEstimate: null, mtdInvoice: 9, totalOrders: 9 },
    ])
    expect(dr.regions[0].total).toMatchObject({ plan: null, pctOfPlan: null, gapToPlan: null })
    expect(dr.regions[0].total.invoiced).toBeCloseTo(9, 6)
  })

  it('an edited region master moves the block, and can un-map a seeded state', () => {
    const stateRegions = [
      { id: 'a', state: 'ODISHA', region: 'East' },    // newly mapped → leaves Unmapped
      { id: 'b', state: 'GUJARAT', region: '' },       // explicitly un-mapped → joins Unmapped
    ]
    const dr = buildMtdDashboardData(gOrders, gDispatches, [], [], { ...gOpts, stateRegions }).distributorRegions
    expect(dr.regions.find(g => g.region === 'East').rows.map(r => r.customer))
      .toContain('BACKLOG STEEL')
    expect(dr.regions.find(g => g.region === 'Unmapped').rows.map(r => r.customer))
      .toEqual(['PLAN ONLY', 'NO PLAN TRADING'])
    expect(dr.grand.totalOrders).toBeCloseTo(122, 6) // regrouping never changes the total
    expect(dr.grand.plan).toBe(220)
  })

  it('lists a distributor with orders but no Plan and no invoice — the widened row filter', () => {
    // BACKLOG STEEL has only an all-time order-book position; the sheet it replaces dropped it,
    // which understated its region now that Total Orders is a headline column.
    const listed = gData().regions.flatMap(g => g.rows.map(r => r.customer))
    expect(listed).toContain('BACKLOG STEEL')
    expect(listed).toContain('PLAN ONLY')     // and a plan nobody has started serving
    expect(listed).toHaveLength(6)
  })

  it('is empty, not broken, when there is nothing to report', () => {
    const dr = buildDistributorRegionData([])
    expect(dr.regions).toEqual([])
    expect(dr.grand).toMatchObject({ plan: null, totalOrders: 0, invoiced: 0, pctOfPlan: null, gapToPlan: null })
    expect(buildDistributorRegionData(null).regions).toEqual([])
  })

  it('puts an off-list region before Unmapped rather than dropping its rows', () => {
    const dr = buildDistributorRegionData([
      { customer: 'A', region: 'Central', state: 'X', bestEstimate: 10, mtdInvoice: 4, totalOrders: 4 },
      { customer: 'B', region: '', state: '', bestEstimate: null, mtdInvoice: 6, totalOrders: 6 },
      { customer: 'C', region: 'North', state: 'DELHI', bestEstimate: 5, mtdInvoice: 1, totalOrders: 1 },
    ])
    expect(dr.regions.map(g => g.region)).toEqual(['North', 'Central', 'Unmapped'])
    expect(dr.grand.invoiced).toBeCloseTo(11, 6)
  })
})

describe('distributor sheet — rendered layout (issue #104)', () => {
  const render = () => renderMtdWorkbook(gOrders, gDispatches, [], [], gOpts)

  it('carries the eight columns, in order', async () => {
    const { wb } = await render()
    const ws3 = wb.getWorksheet('Distributor by Region')
    expect(String(ws3.getCell('A1').value)).toContain('DISTRIBUTOR ORDERS & INVOICING BY REGION')
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(c => ws3.getCell(3, c).value)).toEqual([
      'Region', 'State', 'Distributor', 'Plan (MT)', 'Total Orders (MT)',
      'Invoiced MTD (MT)', '% of Plan', 'Gap to Plan (MT)',
    ])
  })

  it('lays out region blocks with a region total each and a grand total at the foot, and no state subtotals', async () => {
    const { wb } = await render()
    const ws3 = wb.getWorksheet('Distributor by Region')
    const colA = ws3.getColumn(1).values.map(v => String(v ?? ''))
    // South block (2 rows) → SOUTH TOTAL → West (2) → WEST TOTAL → Unmapped (2) → UNMAPPED TOTAL → grand.
    expect(colA.slice(4, 13)).toEqual([
      'South', 'South', 'SOUTH TOTAL',
      'West', 'West', 'WEST TOTAL',
      'Unmapped', 'Unmapped', 'UNMAPPED TOTAL',
    ])
    expect(colA.filter(v => v.startsWith('GRAND TOTAL'))).toHaveLength(1)
    // State is a column only: no row is a state's subtotal.
    expect(colA.some(v => /TELANGANA|GUJARAT|ODISHA/.test(v))).toBe(false)
    // The multi-state distributor keeps its "+N" marker instead of one state standing for all.
    expect(ws3.getCell(8, 2).value).toBe('GUJARAT +1')
  })

  it('renders % of Plan as a numeric cell with a percentage format, not a text string', async () => {
    const { wb } = await render()
    const ws3 = wb.getWorksheet('Distributor by Region')
    const pct = ws3.getCell(4, 7)                       // PATEL STEEL — 40.5 invoiced against a 100 plan
    expect(typeof pct.value).toBe('number')
    expect(pct.value).toBeCloseTo(0.405, 6)             // a fraction; Excel renders 40.5%
    expect(pct.numFmt).toBe('0.0%')
    // A distributor with no Plan has no percentage to state — that stays N/A rather than 0%.
    expect(ws3.getCell(8, 7).value).toBe('N/A')
    expect(ws3.getCell(8, 4).value).toBe('N/A')         // …and so does its Plan
  })

  it('formats every tonnage to one decimal without rounding any value first', async () => {
    const { wb, data } = await render()
    const ws3 = wb.getWorksheet('Distributor by Region')
    const rowOf = (prefix) => rowStartingWith(ws3, prefix)
    ;[4, 5, 6, 8].forEach(c => expect(ws3.getCell(4, c).numFmt).toBe('#,##0.0'))
    // SHREE TRADERS invoiced 30.25 — the cell renders 30.3 but must HOLD 30.25, or the totals
    // below it would stop tying to the KPIs.
    expect(Number(ws3.getCell(7, 6).value)).toBeCloseTo(30.25, 6)
    const west = rowOf('WEST TOTAL'), grand = rowOf('GRAND TOTAL')
    expect(Number(ws3.getCell(west, 6).value)).toBeCloseTo(50.75, 6)   // 30.25 + 20.5
    expect(ws3.getCell(west, 6).numFmt).toBe('#,##0.0')
    expect(Number(ws3.getCell(grand, 6).value)).toBeCloseTo(102, 6)
    // The rendered region totals still add up to the rendered grand total…
    const sumCol = (c) => ['SOUTH TOTAL', 'WEST TOTAL', 'UNMAPPED TOTAL']
      .reduce((t, p) => t + Number(ws3.getCell(rowOf(p), c).value || 0), 0)
    expect(sumCol(6)).toBeCloseTo(Number(ws3.getCell(grand, 6).value), 6)
    expect(sumCol(5)).toBeCloseTo(Number(ws3.getCell(grand, 5).value), 6)
    // …and the Plan grand total is still the Dashboard's Best Estimate KPI, to the cent.
    expect(Number(ws3.getCell(grand, 4).value)).toBe(data.kpis.bestEstimate)
    expect(Number(wb.getWorksheet('Dashboard').getCell(5, 1).value)).toBe(data.kpis.bestEstimate)
  })

  it('footnotes that Total Orders blends two time windows, and keeps the no-Plan note', async () => {
    const { wb } = await render()
    const ws3 = wb.getWorksheet('Distributor by Region')
    const notes = ws3.getColumn(1).values.map(v => String(v ?? '')).join(' ')
    expect(notes).toContain('Total Orders blends two time windows')
    expect(notes).toContain('all-time order-book snapshot')
    expect(notes).toContain('old unserved backlog')
    expect(notes).toContain('% of Plan can exceed 100% without the plan having been beaten')
    expect(notes).toContain('Of which invoiced by distributors with no Plan: 20.5 MT')
  })
})

// ── Distributor × SKU sheet (issues #105, #129) ─────────────────────────────────────────────────
// The live shape on 20-Aug-2026: every tonne of stock made at Hyderabad, a South plant, and most of
// the queue for it standing in West. SKU 50x50 x 2 SHS, 39.3 T on the Hyderabad floor, five
// distributors queued against it for 78 T in total.
//
//   produced 45.3 − invoiced 6.0 (VORA)  = 39.3 T on hand IN SOUTH, shared there, reserved to nobody
//   NEW PASHCHIM MAHARASHTRA  pending 40.0   MAHARASHTRA → West → no West plant produces → short 40.0
//   VORA & CO                 pending 10.0   MAHARASHTRA → West → short 10.0
//   S G ENTERPRISES           pending 10.0   GUJARAT     → West → short 10.0
//   ARIHANT STEEL POINT       pending 10.0   KARNATAKA   → South → covered out of the 39.3 T
//   MAHENDRA ISPAT            pending  8.0   ← no ship-to state → Unmapped → stock reads "?"
//
// `plant` on the productions and on every dispatch entry is what makes this fixture mean anything:
// without it the stock belongs to no service area, every row reads zero, and each assertion below
// passes for the wrong reason.
//
// A second SKU (40x40 x 2.5) carries the two edge cases: KIRTI TUBES has an invoice but no pending
// (must still appear), and VORA has an order line with neither (must NOT appear).
const dsSkus = [
  { skuCode: 'X1', productType: 'SHS', height: 50, breadth: 50, thickness: 2.0, length: 6000, weightPerTube: 10 },
  { skuCode: 'X2', productType: 'SHS', height: 40, breadth: 40, thickness: 2.5, length: 6000, weightPerTube: 8 },
]
const dsProductions = [
  { skuCode: 'X1', plant: 'hyderabad', dateOfProduction: '2026-07-05', tubeCount: 100, totalWeight: 45.3 },
  { skuCode: 'X2', plant: 'hyderabad', dateOfProduction: '2026-07-05', tubeCount: 50, totalWeight: 12 },
]
// Both invoices ship OUT OF HYDERABAD — including the one to a West distributor, which is exactly
// what happens today. The tonnage comes off the South floor it left, and off no other.
const dsDispatches = [
  { dateOfDispatch: '2026-07-12', bundleEntries: [{ skuCode: 'X1', plant: 'hyderabad', weight: 6, customer: 'VORA & CO', shipToState: 'MAHARASHTRA' }] },
  { dateOfDispatch: '2026-07-13', bundleEntries: [{ skuCode: 'X2', plant: 'hyderabad', weight: 3, customer: 'KIRTI TUBES', shipToState: 'TAMIL NADU' }] },
]
const dsOrders = [
  { orderDate: '2026-07-01', customer: 'NEW PASHCHIM MAHARASHTRA', shipToState: 'MAHARASHTRA', mmId: 'X1', quantity: 40, confirmed: 40, nonConfirmed: 0, orderStatus: '' },
  { orderDate: '2026-07-02', customer: 'VORA & CO', shipToState: 'MAHARASHTRA', mmId: 'X1', quantity: 16, confirmed: 6, nonConfirmed: 4, orderStatus: '' },
  { orderDate: '2026-07-03', customer: 'S G ENTERPRISES', shipToState: 'GUJARAT', mmId: 'X1', quantity: 10, confirmed: 10, nonConfirmed: 0, orderStatus: '' },
  { orderDate: '2026-07-04', customer: 'ARIHANT STEEL POINT', shipToState: 'KARNATAKA', mmId: 'X1', quantity: 10, confirmed: 10, nonConfirmed: 0, orderStatus: '' },
  { orderDate: '2026-07-05', customer: 'MAHENDRA ISPAT', shipToState: '', mmId: 'X1', quantity: 8, confirmed: 8, nonConfirmed: 0, orderStatus: '' },
  // Fully served: nothing pending, nothing invoiced this month → no row on the sheet.
  { orderDate: '2026-07-06', customer: 'VORA & CO', shipToState: 'MAHARASHTRA', mmId: 'X2', quantity: 5, confirmed: 0, nonConfirmed: 0, orderStatus: '' },
]
const dsOpts = { date: '2026-07-15' }

describe('buildMtdDashboardData — distributor × SKU rows', () => {
  const rowsOf = (opts = dsOpts) =>
    buildMtdDashboardData(dsOrders, dsDispatches, dsProductions, dsSkus, opts).distributorSku.rows

  it('lists only live pairs — pending above zero OR invoiced this month', () => {
    const rows = rowsOf()
    expect(rows).toHaveLength(6) // 5 × X1 + KIRTI's invoice-only X2; VORA's spent X2 line dropped
    expect(rows.some(r => r.customer === 'VORA & CO' && r.sku === '40x40 x 2.5')).toBe(false)
    // Invoiced with nothing pending still earns a row — otherwise the month's sales vanish off it.
    const kirti = rows.find(r => r.customer === 'KIRTI TUBES')
    expect(kirti).toMatchObject({ sku: '40x40 x 2.5', pending: 0 })
    expect(kirti.invoicedMtd).toBeCloseTo(3, 6)
  })

  it('sorts region → distributor → pending descending', () => {
    // Region order is the canonical North/South/East/West, then Unmapped — never alphabetical,
    // which would bury Unmapped between South and West.
    expect(rowsOf().map(r => [r.region, r.customer])).toEqual([
      ['South', 'ARIHANT STEEL POINT'],
      ['South', 'KIRTI TUBES'],
      ['West', 'NEW PASHCHIM MAHARASHTRA'],
      ['West', 'S G ENTERPRISES'],
      ['West', 'VORA & CO'],
      ['Unmapped', 'MAHENDRA ISPAT'],
    ])
  })

  it('orders one distributor’s several sizes by pending descending', () => {
    // Give ARIHANT a second, smaller pending line so the third sort key is actually exercised.
    const orders = [...dsOrders,
      { orderDate: '2026-07-07', customer: 'ARIHANT STEEL POINT', shipToState: 'KARNATAKA', mmId: 'X2', quantity: 4, confirmed: 4, nonConfirmed: 0, orderStatus: '' }]
    const rows = buildMtdDashboardData(orders, dsDispatches, dsProductions, dsSkus, dsOpts).distributorSku.rows
    expect(rows.filter(r => r.customer === 'ARIHANT STEEL POINT').map(r => [r.sku, r.pending]))
      .toEqual([['50x50 x 2', 10], ['40x40 x 2.5', 4]])
  })

  // An ERP code the SKU master doesn't carry used to print raw on this sheet ('1140-13075-10078295')
  // because the label could only be built from a master row. It is now derived from the order line's
  // own description, in the SAME "size x thickness" shape, so it joins to the SKU Ageing sheet.
  it('labels a SKU the master does not carry from its order description, not the MM ID', () => {
    const orders = [...dsOrders, {
      orderDate: '2026-07-08', customer: 'ARIHANT STEEL POINT', shipToState: 'KARNATAKA',
      mmId: '1140-13075-10078295', description: 'MS RHS One Helix IS 4923 YSt 210 Black 60x40x1.20x6000',
      quantity: 7, confirmed: 7, nonConfirmed: 0, orderStatus: '',
    }]
    const rows = buildMtdDashboardData(orders, dsDispatches, dsProductions, dsSkus, dsOpts).distributorSku.rows
    const row = rows.find(r => r.pending === 7)
    expect(row.sku).toBe('60x40 x 1.2')
    expect(rows.some(r => /\d{4}-\d{5}-\d{8}/.test(r.sku))).toBe(false)   // no MM ID anywhere
    expect(rows.some(r => r.sku.includes('|'))).toBe(false)                // no canonical key either
  })

  it('spells a derived bore the same way the SKU master does, so the two sheets join', () => {
    const orders = [...dsOrders, {
      orderDate: '2026-07-08', customer: 'ARIHANT STEEL POINT', shipToState: 'KARNATAKA',
      mmId: '1141-13068-10078414', description: 'MS CHS One Helix IS 1161 YSt 210 Black 100 NBx4x6000',
      quantity: 7, confirmed: 7, nonConfirmed: 0, orderStatus: '',
    }]
    const rows = buildMtdDashboardData(orders, dsDispatches, dsProductions, dsSkus, dsOpts).distributorSku.rows
    expect(rows.find(r => r.pending === 7).sku).toBe('100 NB x 4')   // not the key's lower-cased '100 nb'
  })

  it('a distributor whose state has no region mapping lands under Unmapped, keeping its tonnage', () => {
    const unmapped = rowsOf().find(r => r.customer === 'MAHENDRA ISPAT')
    expect(unmapped.region).toBe('Unmapped')
    expect(unmapped.state).toBe('')
    expect(unmapped.pending).toBe(8) // still a live row — an unmapped state is a labelling gap only
  })

  it('honours an edited state → region mapping instead of the static seed', () => {
    // Same master the Sales tab edits: re-map Maharashtra and the sheet must follow it.
    const rows = rowsOf({ ...dsOpts, stateRegions: [{ state: 'MAHARASHTRA', region: 'North' }] })
    expect(rows.find(r => r.customer === 'VORA & CO').region).toBe('North')
    expect(rows.find(r => r.customer === 'S G ENTERPRISES').region).toBe('West') // Gujarat, untouched
  })

  it('offers Hyderabad stock to South only — West reads zero while 39.3 T sits on the floor', () => {
    const x1 = Object.fromEntries(rowsOf().filter(r => r.sku === '50x50 x 2').map(r => [r.customer, r]))
    expect(Object.keys(x1)).toHaveLength(5)
    expect(x1['ARIHANT STEEL POINT'].onhand).toBeCloseTo(39.3, 6)  // 45.3 produced − 6.0 invoiced
    ;['NEW PASHCHIM MAHARASHTRA', 'VORA & CO', 'S G ENTERPRISES']
      .forEach(w => expect(x1[w].onhand).toBe(0))                  // West: no West plant produces
    expect(x1['MAHENDRA ISPAT'].onhand).toBeNull()                 // Unmapped: unknown, not zero
  })

  it('still shares one tonnage between distributors INSIDE a service area (ADR-0002 unchanged)', () => {
    // A second South distributor queued on the same size reads the identical 39.3 T — the sharing
    // this sheet has always carried a caption about. Narrowing WHOSE pool a row reads did not
    // divide the pool.
    const orders = [...dsOrders,
      { orderDate: '2026-07-09', customer: 'KIRTI TUBES', shipToState: 'TAMIL NADU', mmId: 'X1', quantity: 30, confirmed: 30, nonConfirmed: 0, orderStatus: '' }]
    const south = buildMtdDashboardData(orders, dsDispatches, dsProductions, dsSkus, dsOpts)
      .distributorSku.rows.filter(r => r.sku === '50x50 x 2' && r.region === 'South')
    expect(south).toHaveLength(2)
    south.forEach(r => expect(r.onhand).toBeCloseTo(39.3, 6))
    // …and that is still why the column is never summed: 40 T is queued against those 39.3 T.
    expect(south.reduce((t, r) => t + r.pending, 0)).toBeCloseTo(40, 6)
    expect(south.reduce((t, r) => t + r.onhand, 0)).toBeCloseTo(78.6, 6) // 2 × 39.3 — a fiction
  })

  it('Short by is Pending − On-hand in the DISTRIBUTOR\u2019S OWN area, floored at zero', () => {
    const by = Object.fromEntries(rowsOf().map(r => [r.customer, r]))
    expect(by['NEW PASHCHIM MAHARASHTRA'].shortBy).toBeCloseTo(40, 6) // the whole order book, not 0.7
    expect(by['VORA & CO'].shortBy).toBeCloseTo(10, 6)                // West too — not "covered"
    expect(by['ARIHANT STEEL POINT'].shortBy).toBe(0)  // 10 ≤ 39.3 in South — ADR-0002's ambiguity
    expect(by['MAHENDRA ISPAT'].shortBy).toBeNull()    // unknown area ⇒ unknown shortfall
  })

  it('never subtracts a South invoice from West\u2019s empty stock', () => {
    // VORA is a West distributor invoiced 6.0 T out of Hyderabad. That tonnage left the SOUTH floor.
    // Charging it to West would read as −6 T, floored to 0 and every West free-stock figure wrong.
    const by = Object.fromEntries(rowsOf().map(r => [r.customer, r]))
    expect(by['VORA & CO'].invoicedMtd).toBeCloseTo(6, 6)
    expect(by['VORA & CO'].onhand).toBe(0)
    expect(by['ARIHANT STEEL POINT'].onhand).toBeCloseTo(39.3, 6)     // 45.3 − 6.0, in South
  })

  it('nets Confirmed and pending per area, so South is not charged with West\u2019s queue', () => {
    const by = Object.fromEntries(rowsOf().map(r => [r.customer, r]))
    expect(by['ARIHANT STEEL POINT'].allConfirmed).toBeCloseTo(10, 6)  // ARIHANT alone
    expect(by['ARIHANT STEEL POINT'].freeStock).toBeCloseTo(29.3, 6)   // 39.3 − 10
    expect(by['NEW PASHCHIM MAHARASHTRA'].allConfirmed).toBeCloseTo(56, 6) // 40 + 6 + 10, West only
    expect(by['NEW PASHCHIM MAHARASHTRA'].freeStock).toBeCloseTo(-56, 6)
  })

  it('fills West the day an NPMD row appears, and moves South by not one kilo', () => {
    const withNpmd = [...dsProductions,
      { skuCode: 'X1', plant: 'npmd', dateOfProduction: '2026-07-14', tubeCount: 100, totalWeight: 60 }]
    const after = Object.fromEntries(buildMtdDashboardData(dsOrders, dsDispatches, withNpmd, dsSkus, dsOpts)
      .distributorSku.rows.map(r => [r.customer, r]))
    const before = Object.fromEntries(rowsOf().map(r => [r.customer, r]))
    expect(after['NEW PASHCHIM MAHARASHTRA'].onhand).toBeCloseTo(60, 6)
    expect(after['NEW PASHCHIM MAHARASHTRA'].shortBy).toBe(0)
    expect(after['ARIHANT STEEL POINT']).toEqual(before['ARIHANT STEEL POINT'])
    expect(after['KIRTI TUBES']).toEqual(before['KIRTI TUBES'])
  })

  it('follows the plant master — re-point Hyderabad at West and the two swap', () => {
    const rows = rowsOf({ ...dsOpts, plants: [{ plantId: 'hyderabad', serves: ['West'] }] })
    const by = Object.fromEntries(rows.map(r => [r.customer, r]))
    expect(by['NEW PASHCHIM MAHARASHTRA'].onhand).toBeCloseTo(39.3, 6)
    expect(by['ARIHANT STEEL POINT'].onhand).toBe(0)   // Lepakshi still serves South and produces nothing
  })

  it('follows the distributor master — an override moves one row\u2019s pool without moving its state', () => {
    const rows = rowsOf({ ...dsOpts, distributors: [{ distributorKey: 'VORA & CO', region: 'South' }] })
    const vora = rows.find(r => r.customer === 'VORA & CO')
    expect(vora.region).toBe('South')
    expect(vora.state).toBe('MAHARASHTRA')             // the ERP's own answer, never overwritten
    expect(vora.onhand).toBeCloseTo(39.3, 6)
  })

  it('carries the order-book split and the month’s invoiced tonnage per pair', () => {
    const vora = rowsOf().find(r => r.customer === 'VORA & CO')
    expect(vora).toMatchObject({ confirmed: 6, nonConfirmed: 4, pending: 10 })
    expect(vora.invoicedMtd).toBeCloseTo(6, 6)
  })

  it('is the same calculation the Sales tab drill-down uses — no second implementation', async () => {
    const { salesByDistributor } = await import('./calc')
    const screen = salesByDistributor(dsOrders, dsDispatches, '2026-07', dsSkus, { productions: dsProductions })
    const drill = screen.find(r => r.customer === 'NEW PASHCHIM MAHARASHTRA').skuRows[0]
    const sheet = rowsOf().find(r => r.customer === 'NEW PASHCHIM MAHARASHTRA')
    ;['confirmed', 'nonConfirmed', 'pending', 'onhand', 'shortBy'].forEach(f =>
      expect(sheet[f]).toBeCloseTo(drill[f], 9))
    expect(sheet.invoicedMtd).toBeCloseTo(drill.mtdInvoice, 9)
  })

  it('handles empty inputs without throwing', () => {
    expect(buildMtdDashboardData([], [], [], [], dsOpts).distributorSku.rows).toEqual([])
  })
})

// Column-A text of every populated row. `getColumn().values` is SPARSE (holes for blank rows), so
// filter before mapping — a bare .map leaves the holes and .find then trips over undefined.
const labelsOf = (ws) => ws.getColumn(1).values.filter(v => v != null).map(v => String(v))

describe('Distributor × SKU sheet — rendering', () => {
  it('renders the ten columns in order, one row per live pair, in sort order', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus, dsOpts)
    expect(wb.worksheets.map(w => w.name))
      .toEqual(['Dashboard', 'SKU Ageing (>2 MT)', 'Distributor by Region', 'Distributor × SKU'])
    const ws = wb.getWorksheet('Distributor × SKU')
    // The Invoiced header carries the #127 scope label: every invoice in this fixture is now
    // attributed to Hyderabad (it has to be, or the stock filter has nothing to read).
    expect(ws.getRow(3).values.slice(1)).toEqual(['Region', 'State', 'Distributor', 'SKU',
      'Invoiced MTD · Hyderabad only', 'Confirmed', 'Non-Conf', 'Pending', 'Free Stock (area)', 'Short by'])
    expect(ws.getRow(4).values.slice(1, 5))
      .toEqual(['South', 'KARNATAKA', 'ARIHANT STEEL POINT', '50x50 x 2'])
    expect(ws.getRow(9).values.slice(1, 4)).toEqual(['Unmapped', '—', 'MAHENDRA ISPAT'])
  })

  it('writes exact tonnage with a one-decimal cell format — nothing pre-rounded', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus, dsOpts)
    const ws = wb.getWorksheet('Distributor × SKU')
    ;[5, 6, 7, 8, 9, 10].forEach(c => expect(ws.getCell(4, c).numFmt).toBe('#,##0.0'))
    const npm = rowStartingWith(ws, 'West') // first West row = NEW PASHCHIM MAHARASHTRA
    // West holds nothing, so Free Stock = 0 on-hand − 56.0 Confirmed across the three WEST
    // distributors = −56.0, and Short by is the full 40 T pending. Neither figure is softened by
    // the 39.3 T sitting in Hyderabad, which no West lorry is going to load.
    expect(Number(ws.getCell(npm, 9).value)).toBeCloseTo(-56, 6)   // not -34.7, not 39.3
    expect(Number(ws.getCell(npm, 10).value)).toBeCloseTo(40, 6)   // not 0.7
    expect(ws.getCell(npm, 5).value).toBe('-')                     // nothing invoiced → dashed, not 0.0
  })

  it('prints "?" — not "-" and not 0 — where the service area is unknown', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus, dsOpts)
    const ws = wb.getWorksheet('Distributor × SKU')
    const un = rowStartingWith(ws, 'Unmapped')     // MAHENDRA ISPAT — no ship-to state
    expect(ws.getCell(un, 9).value).toBe('?')      // Free Stock
    expect(ws.getCell(un, 10).value).toBe('?')     // Short by
    expect(Number(ws.getCell(un, 8).value)).toBeCloseTo(8, 6)  // its pending is a fact and still prints
  })

  it('never totals Free Stock — no total row of any kind sits on the sheet', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus, dsOpts)
    const ws = wb.getWorksheet('Distributor × SKU')
    // No totals/subtotals label anywhere in the body (the closing caption is checked separately,
    // and does mention the word — to say the column is deliberately NOT totalled).
    labelsOf(ws).filter(v => !v.includes('SERVE THIS DISTRIBUTOR'))
      .forEach(v => expect(v).not.toMatch(/total/i))
    // …and no cell in the Free Stock column holds a sum of it — not the whole column, and not the
    // per-region West subtotal (3 × −56) either.
    const free = ws.getColumn(9).values.filter(v => typeof v === 'number')
    expect(free).toHaveLength(5) // the five data rows that HAVE an area; MAHENDRA's cell is "?"
    const colSum = free.reduce((t, v) => t + v, 0)
    ;[colSum, 3 * -56].forEach(sum => free.forEach(v => expect(Math.abs(v - sum)).toBeGreaterThan(0.05)))
  })

  it('captions the sheet: service-area scoped, unreserved inside an area, repeated there', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus, dsOpts)
    const captions = labelsOf(wb.getWorksheet('Distributor × SKU'))
    const caption = captions.find(v => v.includes('SERVE THIS DISTRIBUTOR'))
    expect(caption).toBeTruthy()
    expect(caption).toMatch(/NOT reserved/)
    expect(caption).toMatch(/repeated on every distributor/)
    expect(caption).toMatch(/NOT totalled/)
    expect(caption).toMatch(/LESS the Confirmed tonnage of every distributor in that same service area/)
    // It has to name who serves whom, and say what an empty West column and a "?" each mean —
    // a screen of blanks otherwise reads as a loading bug.
    // Who serves whom is read off the plant master, not spelled out in the caption — a literal here
    // is what let the old sentence outlive the rule it described.
    expect(caption).toMatch(/Hyderabad and Lepakshi serve South; NPMD and Tapi serve West/)
    expect(caption).toMatch(/A region whose plants have produced nothing therefore shows no Free Stock/)
    expect(caption).toMatch(/"\?" means the distributor's service area is unknown/)
    // The old sentence said the opposite of the rule and must be gone from the whole sheet.
    captions.forEach(v => expect(v).not.toMatch(/WHOLE PLANT/))
    captions.forEach(v => expect(v).not.toMatch(/every plant's finished stock combined/))
    captions.forEach(v => expect(v).not.toMatch(/the plant column is not applied to it/))
  })

  it('follows the plant master into the caption, so the sentence cannot outlive the rule', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus,
      { ...dsOpts, plants: [{ plantId: 'npmd', serves: ['South'] }] })
    const caption = labelsOf(wb.getWorksheet('Distributor × SKU')).find(v => v.includes('SERVE THIS DISTRIBUTOR'))
    expect(caption).toMatch(/Hyderabad, NPMD and Lepakshi serve South; Tapi serves West/)
  })

  it('renders an empty sheet without throwing when nothing is live', async () => {
    const { wb } = await renderMtdWorkbook([], [], [], [], dsOpts)
    const ws = wb.getWorksheet('Distributor × SKU')
    expect(String(ws.getCell('A4').value)).toContain('No distributor has pending')
  })
})

// ── Daily report region split (region-format branch) ────────────────────────────────────────────
// Reuses the issue #104 fixture above, so the daily message and the workbook are asserted against
// ONE set of distributors. Expected at D = 2026-07-15:
//   South  D1 40.5 + D6 10.75 = 51.25 invoiced,  D1 conf 5 + nonConf 3 = 8 pending
//   West   D2 30.25 + D3 20.5 = 50.75 invoiced,  0 pending
//   Unmapped  D4 (ODISHA) 0 invoiced, 12 pending
// Σ invoiced 102.0 — the same total the sheet test asserts. Σ pending 20.0.
const rData = (orders = gOrders, dispatches = gDispatches, opts = {}) =>
  buildRegionMtdSummary(orders, dispatches, { date: '2026-07-15', ...opts })

describe('buildRegionMtdSummary — daily report region block', () => {
  it('orders regions North→South→East→West with Unmapped last', () => {
    expect(rData().regions.map(g => g.region)).toEqual(['South', 'West', 'Unmapped'])
  })

  it('splits invoiced and pending per region, excluding the previous month', () => {
    const [south, west, unmapped] = rData().regions
    expect(south).toMatchObject({ invoicedMtd: 51.25, confirmed: 5, nonConfirmed: 3, pending: 8, distributors: 2 })
    expect(west).toMatchObject({ invoicedMtd: 50.75, pending: 0, distributors: 2 })
    expect(unmapped).toMatchObject({ invoicedMtd: 0, pending: 12, distributors: 1 })
    // June's 99 T never reaches the block.
    expect(rData().totals.invoicedMtd).toBeCloseTo(102, 6)
  })

  // The invariant the whole feature rests on: the region lines must add up to the plant headline
  // printed above them in the same message. Cross-builder, so drift on EITHER side breaks it.
  it('ties back to the plant KPIs computed by buildMtdDashboardData', () => {
    const r = rData()
    const { kpis } = buildMtdDashboardData(gOrders, gDispatches, [], [], gOpts)
    expect(r.totals.invoicedMtd).toBeCloseTo(kpis.invoicedMtd, 6)
    expect(r.totals.pending).toBeCloseTo(kpis.pending, 6)
    expect(r.checks).toMatchObject({ invoicedTiesToPlant: true, pendingTiesToPlant: true })
  })

  it('keeps an unmapped state carrying its full tonnage inside the total', () => {
    const r = rData()
    const unmapped = r.regions.find(g => g.region === 'Unmapped')
    expect(unmapped.pending).toBe(12)                                   // D4's ODISHA tonnage, not dropped
    expect(r.totals.pending).toBe(20)                                   // 8 + 0 + 12 — it is inside the sum
    expect(r.diagnostics.unmappedStates).toEqual([{ state: 'ODISHA', tonnage: 12 }])
  })

  // The deliberate asymmetry: tonnage is capped at D so it ties to the plant figure, region
  // assignment is not so it ties to the workbook.
  it('day-caps tonnage at D but still resolves the region from later lines', () => {
    const later = [...gDispatches, { dateOfDispatch: '2026-07-20', bundleEntries: [
      { distributorCode: 'D1', customer: 'PATEL STEEL', shipToState: 'RAJASTHAN', skuCode: 'S1', weight: 7 },
    ] }]
    const r = rData(gOrders, later)
    expect(r.totals.invoicedMtd).toBeCloseTo(102, 6)                    // the 7 T is NOT counted
    expect(r.diagnostics.invoicedAfterD).toBeCloseTo(7, 6)              // but it is named
    // D1's most recent line is now RAJASTHAN (unmapped), so it moves — exactly as the workbook does.
    expect(r.regions.find(g => g.region === 'South').invoicedMtd).toBeCloseTo(10.75, 6)
    expect(r.regions.find(g => g.region === 'Unmapped').invoicedMtd).toBeCloseTo(40.5, 6)
  })

  it('puts a multi-state distributor wholly in one region and reports the tonnage it moved', () => {
    const r = rData()
    // D3 ordered into RAJASTHAN then GUJARAT — all 20.5 T sits in West, none in Unmapped.
    expect(r.regions.find(g => g.region === 'West').invoicedMtd).toBeCloseTo(50.75, 6)
    expect(r.diagnostics.multiStateDistributors).toBe(1)
    expect(r.diagnostics.multiStateTonnage).toBeCloseTo(20.5, 6)
  })

  // The seed-layering trap: a stored row must override the seed WITHOUT the other five seeded
  // states falling back to Unmapped.
  it('layers a stored mapping over the seed without unmapping the rest', () => {
    const r = rData(gOrders, gDispatches, {
      stateRegions: [{ id: 'x', state: 'TELANGANA', region: 'North', deleted: false }],
    })
    expect(r.regions.map(g => g.region)).toEqual(['North', 'South', 'West', 'Unmapped'])
    expect(r.regions[0].invoicedMtd).toBeCloseTo(40.5, 6)               // D1 moved to North
    expect(r.regions[1].invoicedMtd).toBeCloseTo(10.75, 6)              // D6 stayed South (TAMIL NADU seed)
    expect(r.regions[2].invoicedMtd).toBeCloseTo(50.75, 6)              // GUJARAT/MAHARASHTRA seeds intact
    expect(r.totals.invoicedMtd).toBeCloseTo(102, 6)                    // total unchanged
  })

  it('returns no regions and zeroed totals for empty input', () => {
    const r = buildRegionMtdSummary([], [], { date: '2026-07-15' })
    expect(r.regions).toEqual([])
    expect(r.totals).toMatchObject({ invoicedMtd: 0, pending: 0 })
    expect(r.checks).toMatchObject({ invoicedTiesToPlant: true, pendingTiesToPlant: true })
  })
})

// ── THE PER-PLANT SPLIT (ticket #127) ───────────────────────────────────────────────────────────
// Rows CONSTRUCTED to the per-plant tonnages #117 published off the 18-Aug-2026 One Helix file —
// Hyderabad 761.441, NPMD 1044.000, Lepakshi 417.000, Tapi 393.000, summing to the 2615.441 MT
// Pending to Dispatch the reports print today. Same discipline as the #118 fixtures in
// calc.test.js: this is a fixture, not a measurement. It proves the split partitions the headline
// correctly, NOT that the deployed data sums to these figures (production `orders` currently holds
// no rows and no `plant` column — see the 2026-08-19 LEARNINGS entry).
//
// A fifth row carries a Ship From Code nobody has mapped, so every case also exercises the rule
// that Unattributed tonnage stays INSIDE the total. Company Pending is therefore 2627.941, not
// 2615.441 — the four real plants are what sum to the spec's figure.
const pD = '2026-08-18'
const pOrders = [
  { plant: 'hyderabad', orderDate: '2026-08-10', quantity: 800, confirmed: 400, nonConfirmed: 361.441, distributorCode: 'D1', customer: 'PATEL STEEL', shipToState: 'TELANGANA' },
  { plant: 'npmd', orderDate: '2026-08-10', quantity: 1044, confirmed: 0, nonConfirmed: 1044, distributorCode: 'D2', customer: 'PUNE STEEL', shipToState: 'MAHARASHTRA' },
  { plant: 'lepakshi', orderDate: '2026-08-10', quantity: 417, confirmed: 0, nonConfirmed: 417, distributorCode: 'D3', customer: 'LEPAKSHI DIST', shipToState: 'KARNATAKA' },
  { plant: 'tapi', orderDate: '2026-08-10', quantity: 393, confirmed: 0, nonConfirmed: 393, distributorCode: 'D4', customer: 'TAPI DIST', shipToState: 'GUJARAT' },
  { plant: '', orderDate: '2026-08-10', quantity: 12.5, confirmed: 0, nonConfirmed: 12.5, distributorCode: 'D5', customer: 'MYSTERY TRADING', shipToState: 'TELANGANA' },
]
// Only Hyderabad has ever invoiced — the Invoice sheet has no plant column of its own and its
// lines are Nippon's. The two extra records are the day cap and the month filter.
const pDispatches = [
  { dateOfDispatch: '2026-08-12', bundleEntries: [{ plant: 'hyderabad', distributorCode: 'D1', customer: 'PATEL STEEL', shipToState: 'TELANGANA', skuCode: 'S1', weight: 463.5 }] },
  { dateOfDispatch: '2026-08-19', bundleEntries: [{ plant: 'hyderabad', distributorCode: 'D1', customer: 'PATEL STEEL', shipToState: 'TELANGANA', skuCode: 'S1', weight: 40 }] },   // after D
  { dateOfDispatch: '2026-07-31', bundleEntries: [{ plant: 'hyderabad', distributorCode: 'D1', customer: 'PATEL STEEL', shipToState: 'TELANGANA', skuCode: 'S1', weight: 99 }] },   // previous month
]
const pData = (orders = pOrders, dispatches = pDispatches, opts = {}) =>
  buildPlantMtdSummary(orders, dispatches, { date: pD, ...opts })

describe('buildPlantMtdSummary — the per-plant split (#127)', () => {
  it('lists the plants present in master order, Unattributed last', () => {
    expect(pData().plants.map(p => p.name)).toEqual(['Hyderabad', 'NPMD', 'Lepakshi', 'Tapi', 'Unattributed'])
  })

  // The point of the whole ticket: no headline number moves. Scoping the report to Hyderabad would
  // drop this by 1854 MT overnight with nothing changed in the business.
  it('leaves the company Pending to Dispatch at 2615.441 MT (+ the unattributed line)', () => {
    expect(pData().checks.allPlantsPending).toBeCloseTo(2615.441 + 12.5, 3)
    expect(salesKpis(pOrders, []).pending).toBeCloseTo(2615.441 + 12.5, 3)   // second method: the app's own KPI
  })

  it('splits that total per plant, and the rows sum back to it', () => {
    const r = pData()
    const by = Object.fromEntries(r.plants.map(p => [p.name, p.pending]))
    expect(by.Hyderabad).toBeCloseTo(761.441, 3)
    expect(by.NPMD).toBeCloseTo(1044.000, 3)
    expect(by.Lepakshi).toBeCloseTo(417.000, 3)
    expect(by.Tapi).toBeCloseTo(393.000, 3)
    expect(by.Unattributed).toBeCloseTo(12.5, 3)
    expect(r.totals.pending).toBeCloseTo(r.checks.allPlantsPending, 6)
    expect(r.checks).toMatchObject({ invoicedTiesToAllPlants: true, pendingTiesToAllPlants: true })
  })

  it('labels Invoiced as Hyderabad-only, derived from the rows rather than hardcoded', () => {
    expect(pData().invoicing).toMatchObject({
      plants: ['Hyderabad'], onlyPlant: 'Hyderabad', label: 'Hyderabad only', suffix: ' · Hyderabad only',
    })
    expect(pData().invoicing.note).toContain('Hyderabad-only')
    // The day NPMD raises its first invoice the label says so by itself — nothing to remember.
    const withNpmd = [...pDispatches, { dateOfDispatch: '2026-08-13', bundleEntries: [{ plant: 'npmd', skuCode: 'S1', weight: 20 }] }]
    expect(pData(pOrders, withNpmd).invoicing).toMatchObject({ onlyPlant: null, label: 'Hyderabad, NPMD', suffix: ' · Hyderabad, NPMD' })
  })

  // The rule is not "one plant invoices" — it is "Invoiced covers fewer plants than Pending does".
  // Two plants of four invoicing is still a column that means something different from the one
  // beside it, and the reader is still owed the label.
  it('names the scope whenever a plant carries pending it has not invoiced against', () => {
    const withNpmd = [...pDispatches, { dateOfDispatch: '2026-08-13', bundleEntries: [{ plant: 'npmd', skuCode: 'S1', weight: 20 }] }]
    expect(pData(pOrders, withNpmd).invoicing.note).toContain('limited to Hyderabad, NPMD')  // Lepakshi and Tapi still owed
  })

  it('says nothing once Invoiced covers every plant that carries pending', () => {
    const hydOnly = pOrders.filter(o => o.plant === 'hyderabad')
    expect(pData(hydOnly, pDispatches).invoicing).toMatchObject({ suffix: '', note: '' })
  })

  it('keeps a plant that has orders and no invoices as its own row, not a dropped or zero-filled one', () => {
    const npmd = pData().plants.find(p => p.name === 'NPMD')
    expect(npmd).toMatchObject({ invoicedMtd: 0, invoiceLines: 0 })
    expect(npmd.orderLines).toBe(1)                     // the row exists because the ORDERS do
    expect(npmd.pending).toBeCloseTo(1044, 3)
    expect(pData().diagnostics.ordersWithoutInvoice).toEqual(['NPMD', 'Lepakshi', 'Tapi', 'Unattributed'])
  })

  it('gives a plant with neither orders nor invoices no row at all', () => {
    const hydOnly = pData(pOrders.filter(o => o.plant === 'hyderabad'), pDispatches)
    expect(hydOnly.plants.map(p => p.name)).toEqual(['Hyderabad'])
  })

  it('folds a ship-from code nobody has mapped into Unattributed, tonnage still inside the total', () => {
    // A fifth company appearing in the ERP resolves to '' — but an id off the master must not open
    // a second row that also reads "Unattributed" and then adds up wrong.
    const fifth = [...pOrders, { plant: 'V9999-0000-JODL-0001', orderDate: '2026-08-10', quantity: 8, confirmed: 8, nonConfirmed: 0 }]
    const r = pData(fifth)
    expect(r.plants.filter(p => p.name === 'Unattributed')).toHaveLength(1)
    expect(r.plants.find(p => p.name === 'Unattributed').pending).toBeCloseTo(20.5, 3)   // 12.5 + 8
    expect(r.totals.pending).toBeCloseTo(2615.441 + 20.5, 3)
    expect(r.checks.pendingTiesToAllPlants).toBe(true)
  })

  it('day-caps Invoiced at D and excludes the previous month, so it ties to the Dashboard card', () => {
    const r = pData()
    expect(r.totals.invoicedMtd).toBeCloseTo(463.5, 3)          // not 503.5 (19-Aug) and not 562.5 (July)
    expect(r.checks.allPlantsInvoicedMtd).toBeCloseTo(463.5, 3)
    expect(buildMtdDashboardData(pOrders, pDispatches, [], [], { date: pD }).kpis.invoicedMtd).toBeCloseTo(463.5, 3)
  })

  it('returns no plants and zeroed totals for empty input', () => {
    const r = buildPlantMtdSummary([], [], { date: pD })
    expect(r.plants).toEqual([])
    expect(r.totals).toMatchObject({ invoicedMtd: 0, pending: 0 })
    expect(r.checks).toMatchObject({ invoicedTiesToAllPlants: true, pendingTiesToAllPlants: true })
    expect(r.invoicing).toMatchObject({ onlyPlant: null, label: '', suffix: '', note: '' })
  })
})

describe('the split changes nothing else about the workbook (#127)', () => {
  const opts = { date: pD, estimates: [{ distributorKey: 'D1', distributorName: 'PATEL STEEL', month: '2026-08', bestEstimate: 900 }] }
  // The same order book with every line re-attributed to a different plant. Region, Best Estimate,
  // Free Stock, On-hand and Short by are keyed by distributor, state and SKU — never by the ORDER
  // LINE's plant — so moving every line to another plant may not move ONE of these figures.
  // (Since #129 stock IS keyed by plant — the PRODUCTION row's, through the service area. That is a
  // different column on a different table, and this test is what keeps the two from being confused.)
  const reattributed = pOrders.map(o => ({ ...o, plant: o.plant === 'hyderabad' ? 'tapi' : 'hyderabad' }))

  it('keeps the company KPIs exactly where they were', () => {
    const a = buildMtdDashboardData(pOrders, pDispatches, [], [], opts).kpis
    const b = buildMtdDashboardData(reattributed, pDispatches, [], [], opts).kpis
    expect(a).toEqual(b)
    expect(a.pending).toBeCloseTo(2615.441 + 12.5, 3)
    expect(a.bestEstimate).toBe(900)                     // Plant Best Estimate = Σ distributor estimates, unchanged
  })

  it('keeps the region grouping reading from the one state → region master', () => {
    const a = buildMtdDashboardData(pOrders, pDispatches, [], [], opts).distributorRegions
    const b = buildMtdDashboardData(reattributed, pDispatches, [], [], opts).distributorRegions
    expect(a.regions.map(g => g.region)).toEqual(['South', 'West'])   // TELANGANA/KARNATAKA south, MAHARASHTRA/GUJARAT west
    expect(b).toEqual(a)
  })

  it('keeps stock deaf to the ORDER LINE\u2019s plant — it follows the service area instead', () => {
    const skus = [{ skuCode: 'S1', productType: 'SHS', height: 50, breadth: 50, thickness: 2, length: 6000, weightPerTube: 10 }]
    const prods = [{ skuCode: 'S1', plant: 'hyderabad', dateOfProduction: '2026-08-01', tubeCount: 180, totalWeight: 900 }]
    const withSku = pOrders.map(o => ({ ...o, mmId: 'S1' }))
    const a = buildMtdDashboardData(withSku, pDispatches, prods, skus, opts).distributorSku.rows
    const b = buildMtdDashboardData(withSku.map(o => ({ ...o, plant: 'tapi' })), pDispatches, prods, skus, opts).distributorSku.rows
    expect(a).toEqual(b)   // re-attributing every order line moves nothing — still true

    // …but the figure itself is no longer one number for everybody. The 900 T was made at
    // Hyderabad, less 602.5 T invoiced off that same floor, so South reads 297.5 T and West — which
    // has no producing plant — reads zero and its full pending as Short by.
    const by = Object.fromEntries(a.map(r => [r.customer, r]))
    expect(by['PATEL STEEL'].onhand).toBeCloseTo(297.5, 6)      // TELANGANA → South
    expect(by['LEPAKSHI DIST'].onhand).toBeCloseTo(297.5, 6)    // KARNATAKA → South, the same tonnage
    expect(by['PUNE STEEL'].onhand).toBe(0)                     // MAHARASHTRA → West
    expect(by['PUNE STEEL'].shortBy).toBeCloseTo(1044, 6)
    expect(new Set(a.map(r => r.freeStock)).size).toBeGreaterThan(1)
  })

  it('keeps the region split tying to the company totals', () => {
    const r = buildRegionMtdSummary(pOrders, pDispatches, { date: pD })
    expect(r.checks).toMatchObject({ invoicedTiesToPlant: true, pendingTiesToPlant: true })
    expect(r.totals.pending).toBeCloseTo(2615.441 + 12.5, 3)
    // Region and plant are independent cuts of the same tonnage: both sum to the same headline.
    expect(r.totals.pending).toBeCloseTo(pData().totals.pending, 6)
    expect(r.totals.invoicedMtd).toBeCloseTo(pData().totals.invoicedMtd, 6)
  })
})

describe('BY PLANT block — rendering (#127)', () => {
  const opts = { date: pD, estimates: [{ distributorKey: 'D1', distributorName: 'PATEL STEEL', month: '2026-08', bestEstimate: 900 }] }

  it('renders the split beneath the Dashboard totals, with an ALL PLANTS row that ties to the cards', async () => {
    const { wb, data } = await renderMtdWorkbook(pOrders, pDispatches, [], [], opts)
    const ws = wb.getWorksheet('Dashboard')
    const band = rowStartingWith(ws, 'BY PLANT')
    expect(band).toBeGreaterThan(6)                                    // BELOW the KPI cards, never instead of them
    expect(ws.getCell(band + 1, 3).value).toBe('Invoiced MTD · Hyderabad only')
    const names = [1, 2, 3, 4, 5].map(i => ws.getCell(band + 1 + i, 1).value)
    expect(names).toEqual(['Hyderabad', 'NPMD', 'Lepakshi', 'Tapi', 'Unattributed'])
    // Pending (column 9) per plant, then the ALL PLANTS row against the KPI card itself.
    expect(Number(ws.getCell(band + 2, 9).value)).toBeCloseTo(761.441, 3)
    expect(Number(ws.getCell(band + 3, 9).value)).toBeCloseTo(1044, 3)
    const totalRow = rowStartingWith(ws, 'ALL PLANTS')
    expect(Number(ws.getCell(totalRow, 9).value)).toBeCloseTo(data.kpis.pending, 6)
    expect(Number(ws.getCell(totalRow, 3).value)).toBeCloseTo(data.kpis.invoicedMtd, 6)
    // The four real plants are the 2615.441 MT; Unattributed is the rest of the headline, inside it.
    expect(Number(ws.getCell(band + 6, 9).value)).toBeCloseTo(12.5, 3)
  })

  it('labels Invoiced as Hyderabad-only wherever it sits beside multi-plant pending', async () => {
    const { wb } = await renderMtdWorkbook(pOrders, pDispatches, [], [], opts)
    // The Dashboard KPI card caption, and the Invoiced column on both distributor sheets.
    expect(String(wb.getWorksheet('Dashboard').getCell(6, 5).value)).toContain('Hyderabad only')
    expect(wb.getWorksheet('Distributor by Region').getCell(3, 6).value).toBe('Invoiced MTD (MT) · Hyderabad only')
    expect(wb.getWorksheet('Distributor × SKU').getCell(3, 5).value).toBe('Invoiced MTD · Hyderabad only')
  })

  it('names both plants everywhere once two of them invoice, in one voice', async () => {
    const both = [...pDispatches, { dateOfDispatch: '2026-08-13', bundleEntries: [{ plant: 'npmd', skuCode: 'S1', weight: 20 }] }]
    const { wb } = await renderMtdWorkbook(pOrders, both, [], [], opts)
    const ws = wb.getWorksheet('Dashboard')
    // One decision in the builder, so all six sites carry the identical string.
    expect(wb.getWorksheet('Distributor by Region').getCell(3, 6).value).toBe('Invoiced MTD (MT) · Hyderabad, NPMD')
    expect(ws.getCell(rowStartingWith(ws, 'BY PLANT') + 1, 3).value).toBe('Invoiced MTD · Hyderabad, NPMD')
    expect(String(ws.getCell(6, 5).value)).toContain('Hyderabad, NPMD')
  })

  it('drops the label from every site at once when there is nothing to name', async () => {
    const hydOnly = pOrders.filter(o => o.plant === 'hyderabad')
    const { wb } = await renderMtdWorkbook(hydOnly, pDispatches, [], [], opts)
    const ws = wb.getWorksheet('Dashboard')
    expect(wb.getWorksheet('Distributor by Region').getCell(3, 6).value).toBe('Invoiced MTD (MT)')
    expect(ws.getCell(rowStartingWith(ws, 'BY PLANT') + 1, 3).value).toBe('Invoiced MTD')
    expect(String(ws.getCell(6, 5).value)).not.toContain('·')
  })
})

// ── The #127 review's findings, each with the test that was missing ─────────────────────────────
describe('the Hyderabad-only label holds up where it was found not to (#127 review)', () => {
  const opts = { date: pD, estimates: [{ distributorKey: 'D1', distributorName: 'PATEL STEEL', month: '2026-08', bestEstimate: 900 }] }

  // AC3 is "wherever they appear beside multi-plant pending" — and the two tables in the middle of
  // the Dashboard sheet are where Invoiced literally sits one row above Confirmed / Non-Confirmed.
  it('labels the Invoiced lines inside the Dashboard tables, not only the cards and the sheets', async () => {
    const { wb } = await renderMtdWorkbook(pOrders, pDispatches, [], [], opts)
    const ws = wb.getWorksheet('Dashboard')
    const labels = ws.getColumn(1).values.map(v => String(v ?? ''))
    expect(labels).toContain('Invoiced MTD · Hyderabad only')                    // ORDER STATUS SUMMARY
    expect(ws.getColumn(7).values.map(v => String(v ?? '')))
      .toContain('Invoiced Orders MTD · Hyderabad only')                         // ORDER PIPELINE — MTD
  })

  // The month has not started invoicing yet: every plant row reads 0, which is the moment the
  // four-against-one comparison is at its widest and the least excusable one to go quiet.
  it('still names Hyderabad on a day nobody has invoiced this month', () => {
    const lastMonthOnly = [{ dateOfDispatch: '2026-07-31', bundleEntries: [{ plant: 'hyderabad', skuCode: 'S1', weight: 463.5 }] }]
    const r = buildPlantMtdSummary(pOrders, lastMonthOnly, { date: '2026-08-01' })
    expect(r.totals.invoicedMtd).toBe(0)                       // nothing invoiced in the month...
    expect(r.invoicing).toMatchObject({ onlyPlant: 'Hyderabad', label: 'Hyderabad only' })  // ...and it still says whose column this is
    expect(r.plants.find(p => p.name === 'Hyderabad').invoicedMtd).toBe(0)
  })

  // Every invoice line written before #119 carries no plant. Those may not caption a column:
  // Unattributed is a labelling gap, never the scope of anything.
  it('never lets Unattributed become the scope of the Invoiced column', () => {
    const legacy = [{ dateOfDispatch: '2026-08-12', bundleEntries: [{ skuCode: 'S1', weight: 463.5 }] }]   // no plant key at all
    const r = buildPlantMtdSummary(pOrders, legacy, { date: pD })
    expect(r.plants.find(p => p.name === 'Unattributed').invoicedMtd).toBeCloseTo(463.5, 3)   // the tonnage is still counted
    expect(r.invoicing).toMatchObject({ plants: [], onlyPlant: null, label: '', suffix: '', note: '' }) // but it captions nothing
  })
})

describe('a plant-scoped workbook never calls one plant ALL PLANTS (#127 review)', () => {
  const opts = { date: pD, companyName: 'JSW One Pipes & Tubes — Hyderabad only', fileSuffix: 'hyderabad' }

  it('totals a scoped split as this workbook’s plant, not as the company', async () => {
    // What the Reports tab passes when the header is scoped: already-filtered rows AND the scope.
    const hyd = pOrders.filter(o => o.plant === 'hyderabad')
    const { wb } = await renderMtdWorkbook(hyd, pDispatches, [], [], opts)
    const ws = wb.getWorksheet('Dashboard')
    expect(rowStartingWith(ws, 'ALL PLANTS')).toBe(-1)
    const totalRow = rowStartingWith(ws, 'TOTAL (this workbook')
    expect(Number(ws.getCell(totalRow, 9).value)).toBeCloseTo(761.441, 3)
  })

  it('keeps saying ALL PLANTS on the company workbook', async () => {
    const { wb } = await renderMtdWorkbook(pOrders, pDispatches, [], [], { date: pD })
    expect(rowStartingWith(wb.getWorksheet('Dashboard'), 'ALL PLANTS')).toBeGreaterThan(0)
  })
})

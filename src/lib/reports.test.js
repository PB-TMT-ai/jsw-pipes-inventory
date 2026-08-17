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

  it('distributor sheet BE column sums to exactly the plant BE KPI', () => {
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D, estimates: dEstimates })
    expect(r.distributorEstimates.total.bestEstimate).toBe(r.kpis.bestEstimate)
  })

  it('invoiced tonnage from distributors with no estimate is reported as unallocated, not absorbed', () => {
    // The fixture's invoices carry no distributor at all, so every invoiced MT is unallocated.
    const r = buildMtdDashboardData(dOrders, dDispatches, dProductions, dSkus, { date: D, estimates: dEstimates })
    expect(r.distributorEstimates.unallocatedInvoiced).toBeCloseTo(30, 6)  // 12 + 8 + 10 in July
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
  const origDoc = globalThis.document, origURL = globalThis.URL, origBlob = globalThis.Blob
  globalThis.Blob = class { constructor(parts) { this._buf = parts[0] } }
  globalThis.URL = { createObjectURL: (b) => { buf = b._buf; return 'blob:x' }, revokeObjectURL() {} }
  globalThis.document = { createElement: () => ({ click() {}, style: {} }), body: { appendChild() {}, removeChild() {} } }
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
  return { wb, data }
}

// Row number of the first row whose column A starts with `prefix` (sheets grow, so never hard-code).
const rowStartingWith = (ws, prefix) =>
  ws.getColumn(1).values.findIndex(v => String(v ?? '').startsWith(prefix))

describe('generateMtdDashboardReport (render smoke test)', () => {
  it('renders a valid 2-sheet workbook with the expected colour bands and cell values', async () => {
    const { wb } = await renderMtdWorkbook(dOrders, dDispatches, dProductions, dSkus,
      { date: '2026-07-15', estimates: dEstimates })
    expect(wb.worksheets.map(w => w.name))
      .toEqual(['Dashboard', 'SKU Ageing (>2 MT)', 'Distributor BE', 'Distributor × SKU'])

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
    const ws3 = wb.getWorksheet('Distributor BE')
    expect(String(ws3.getCell('A1').value)).toContain('DISTRIBUTOR BEST ESTIMATE vs INVOICED')
    expect(ws3.getCell('A3').value).toBe('Distributor')
    expect(ws3.getCell('B3').value).toBe('Best Estimate (MT)')
    const totalRow = ws3.getColumn(1).values.findIndex(v => String(v || '').startsWith('TOTAL'))
    expect(Number(ws3.getCell(totalRow, 2).value)).toBeCloseTo(2500, 6) // ties to the Dashboard KPI
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

// ── Distributor × SKU sheet (issue #105) ────────────────────────────────────────────────────────
// Fixture reproducing the oversubscription the ticket documents from live data: SKU 50x50 x 2 SHS,
// plant holding 39.3 T, five distributors queued against it for 78 T in total.
//
//   produced 45.3 − invoiced 6.0 (VORA)  = 39.3 T on hand, plant-wide, reserved to nobody
//   NEW PASHCHIM MAHARASHTRA  pending 40.0   ← the only row that shows a shortfall (0.7)
//   VORA & CO                 pending 10.0   ← reads "covered", though 78 T is queued against 39.3
//   S G ENTERPRISES           pending 10.0
//   ARIHANT STEEL POINT       pending 10.0
//   MAHENDRA ISPAT            pending  8.0   ← no ship-to state → Unmapped
//
// A second SKU (40x40 x 2.5) carries the two edge cases: KIRTI TUBES has an invoice but no pending
// (must still appear), and VORA has an order line with neither (must NOT appear).
const dsSkus = [
  { skuCode: 'X1', productType: 'SHS', height: 50, breadth: 50, thickness: 2.0, length: 6000, weightPerTube: 10 },
  { skuCode: 'X2', productType: 'SHS', height: 40, breadth: 40, thickness: 2.5, length: 6000, weightPerTube: 8 },
]
const dsProductions = [
  { skuCode: 'X1', dateOfProduction: '2026-07-05', tubeCount: 100, totalWeight: 45.3 },
  { skuCode: 'X2', dateOfProduction: '2026-07-05', tubeCount: 50, totalWeight: 12 },
]
const dsDispatches = [
  { dateOfDispatch: '2026-07-12', bundleEntries: [{ skuCode: 'X1', weight: 6, customer: 'VORA & CO', shipToState: 'MAHARASHTRA' }] },
  { dateOfDispatch: '2026-07-13', bundleEntries: [{ skuCode: 'X2', weight: 3, customer: 'KIRTI TUBES', shipToState: 'TAMIL NADU' }] },
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

  it('repeats ONE plant-wide on-hand tonnage identically on every distributor waiting on that size', () => {
    const x1 = rowsOf().filter(r => r.sku === '50x50 x 2')
    expect(x1).toHaveLength(5)
    x1.forEach(r => expect(r.onhand).toBeCloseTo(39.3, 6)) // 45.3 produced − 6.0 invoiced, undivided
    // …and that is exactly why the column is never summed: 78 T is queued against those 39.3 T.
    expect(x1.reduce((t, r) => t + r.pending, 0)).toBeCloseTo(78, 6)
    expect(x1.reduce((t, r) => t + r.onhand, 0)).toBeCloseTo(196.5, 6) // 5 × 39.3 — a fiction
  })

  it('Short by is Pending − On-hand floored at zero, so an oversubscribed size can read covered', () => {
    const by = Object.fromEntries(rowsOf().map(r => [r.customer, r]))
    expect(by['NEW PASHCHIM MAHARASHTRA'].shortBy).toBeCloseTo(0.7, 6) // 40 − 39.3
    expect(by['VORA & CO'].shortBy).toBe(0)          // 10 ≤ 39.3 — the ambiguity ADR-0002 accepts
    expect(by['MAHENDRA ISPAT'].shortBy).toBe(0)
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
      .toEqual(['Dashboard', 'SKU Ageing (>2 MT)', 'Distributor BE', 'Distributor × SKU'])
    const ws = wb.getWorksheet('Distributor × SKU')
    expect(ws.getRow(3).values.slice(1)).toEqual(['Region', 'State', 'Distributor', 'SKU',
      'Invoiced MTD', 'Confirmed', 'Non-Conf', 'Pending', 'On-hand (plant)', 'Short by'])
    expect(ws.getRow(4).values.slice(1, 5))
      .toEqual(['South', 'KARNATAKA', 'ARIHANT STEEL POINT', '50x50 x 2'])
    expect(ws.getRow(9).values.slice(1, 4)).toEqual(['Unmapped', '—', 'MAHENDRA ISPAT'])
  })

  it('writes exact tonnage with a one-decimal cell format — nothing pre-rounded', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus, dsOpts)
    const ws = wb.getWorksheet('Distributor × SKU')
    ;[5, 6, 7, 8, 9, 10].forEach(c => expect(ws.getCell(4, c).numFmt).toBe('#,##0.0'))
    const npm = rowStartingWith(ws, 'West') // first West row = NEW PASHCHIM MAHARASHTRA
    expect(Number(ws.getCell(npm, 9).value)).toBeCloseTo(39.3, 6)  // not 39
    expect(Number(ws.getCell(npm, 10).value)).toBeCloseTo(0.7, 6)  // not 1
    expect(ws.getCell(npm, 5).value).toBe('-')                     // nothing invoiced → dashed, not 0.0
  })

  it('never totals On-hand — no total row of any kind sits on the sheet', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus, dsOpts)
    const ws = wb.getWorksheet('Distributor × SKU')
    // No totals/subtotals label anywhere in the body (the closing caption is checked separately,
    // and does mention the word — to say the column is deliberately NOT totalled).
    labelsOf(ws).filter(v => !v.includes('WHOLE PLANT'))
      .forEach(v => expect(v).not.toMatch(/total/i))
    // …and no cell in the On-hand column holds a sum of it — not the whole column (196.5 + 9),
    // and not the per-region West subtotal (3 × 39.3) either.
    const onhand = ws.getColumn(9).values.filter(v => typeof v === 'number')
    expect(onhand).toHaveLength(6) // exactly the six data rows, nothing more
    ;[205.5, 117.9].forEach(sum => onhand.forEach(v => expect(Math.abs(v - sum)).toBeGreaterThan(0.05)))
  })

  it('captions the sheet: plant-wide, unreserved, repeated across distributors', async () => {
    const { wb } = await renderMtdWorkbook(dsOrders, dsDispatches, dsProductions, dsSkus, dsOpts)
    const caption = labelsOf(wb.getWorksheet('Distributor × SKU')).find(v => v.includes('WHOLE PLANT'))
    expect(caption).toBeTruthy()
    expect(caption).toMatch(/NOT reserved/)
    expect(caption).toMatch(/repeated on every distributor/)
    expect(caption).toMatch(/NOT totalled/)
  })

  it('renders an empty sheet without throwing when nothing is live', async () => {
    const { wb } = await renderMtdWorkbook([], [], [], [], dsOpts)
    const ws = wb.getWorksheet('Distributor × SKU')
    expect(String(ws.getCell('A4').value)).toContain('No distributor has pending')
  })
})

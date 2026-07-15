// ═══════════════════════════════════════════════════════════════
// REPORTS — downloadable formatted .xlsx stock reports.
//
// Two sheets, modelled on the plant's hand-built Excel stock reports but populated
// from the app's own data and adapted to JSW's data model:
//   A) Finished Pipe Stock  — on-hand pipes grouped ROUND / SHS / RHS.
//   B) Raw Material Stock    — unslit HR coils + free baby-coil strip.
//
// Pure aggregators (buildFinishedStockData / buildRawMaterialData) hold NO exceljs /
// DOM dependency so they're unit-testable; the generate* builders lazy-import exceljs
// (a styled-write library — the app's `xlsx` is read-only for our purposes) and trigger
// the download. Mirrors the Blob+anchor pattern of downloadCSV in App.jsx.
// ═══════════════════════════════════════════════════════════════
import { producedPool, coilConsumption, skuSizeLabel, skuKeyResolver, skuAgeing, salesKpis } from './calc'

const EPS = 0.0005 // MT — treat anything below as zero (rounding noise)

// Map a SKU productType to a finished-report section. CHS rolls up to "ROUND" (matching
// the plant report's "BLACK PIPE ( ROUND )" header); anything unexpected lands in OTHER
// so a stray product type is never silently dropped.
const sectionForType = (productType) => {
  const t = String(productType || '').toUpperCase()
  if (t === 'CHS') return 'ROUND'
  if (t === 'SHS') return 'SHS'
  if (t === 'RHS') return 'RHS'
  return 'OTHER'
}
const FINISHED_SECTION_ORDER = ['ROUND', 'SHS', 'RHS', 'OTHER']

// Leading numeric dimension of a size label ("25x25" → 25, "32 NB" → 32) for in-section sort.
const leadingDim = (size) => {
  const m = String(size || '').match(/\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER
}

// ── Report A data: per published SKU, on-hand stock = produced − dispatched
// (producedPool availablePieces / availableWeight), grouped by shape. With nonZeroOnly
// (default), only sizes that actually have stock are listed — a warehouse stock sheet,
// not the full catalogue. Returns { sections:[{name, rows, subtotal}], grand }. ──
export function buildFinishedStockData(skus, productions, dispatches, { nonZeroOnly = true } = {}) {
  const keyOf = skuKeyResolver(skus)                 // net by canonical identity (same as the Dashboard SKU table)
  const pool = producedPool(productions, dispatches, null, keyOf)
  const buckets = {}
  ;(skus || [])
    .filter(s => String(s.status || '').toLowerCase() === 'published')
    .forEach(s => {
      const p = pool[keyOf(s.skuCode)] || { availablePieces: 0, availableWeight: 0 }
      const pcs = Number(p.availablePieces || 0)
      const mt = Number(p.availableWeight || 0)
      if (nonZeroOnly && !(pcs > 0 || Math.abs(mt) > EPS)) return
      const name = sectionForType(s.productType)
      ;(buckets[name] = buckets[name] || []).push({
        size: skuSizeLabel(s) || s.description || s.skuCode,
        thick: Number(s.thickness || 0),
        len: Number(s.length || 0),
        kgPerPcs: Number(s.weightPerTube || 0),
        pcs,
        mt,
        remarks: '',
      })
    })

  const sections = []
  let grandPcs = 0, grandMt = 0
  FINISHED_SECTION_ORDER.forEach(name => {
    const rows = buckets[name]
    if (!rows || !rows.length) return
    rows.sort((a, b) => (leadingDim(a.size) - leadingDim(b.size)) || (a.thick - b.thick))
    const subPcs = rows.reduce((t, r) => t + r.pcs, 0)
    const subMt = rows.reduce((t, r) => t + r.mt, 0)
    grandPcs += subPcs
    grandMt += subMt
    sections.push({ name, rows, subtotal: { pcs: subPcs, mt: subMt } })
  })
  return { sections, grand: { pcs: grandPcs, mt: grandMt } }
}

// ── Report B data: raw-material stock, adapted to JSW.
//   HR Coil Stock  — whole, UNSLIT mother coils only (a slit coil's steel now lives in
//                    its baby coils, so counting both would double-count). Mirrors the
//                    Dashboard "Full Coil Left" rule (App.jsx). Grouped width×thick×grade.
//   Strip / Baby   — baby-coil free weight = weight − production-consumed (the Coil
//                    Tracker / Dashboard "Baby Coils Left" formula). Excludes manually
//                    "consumed" coils (operator marked them unavailable), so the section
//                    total may trail the Dashboard card by the free weight of any such
//                    coil — intentional for an available-stock sheet. Grouped width×thick.
// Returns { hrCoil:{groups,total}, strip:{groups,total}, grand }. ──
export function buildRawMaterialData(coils, babyCoils, productions) {
  const activeBabies = (babyCoils || []).filter(b => !b.deleted)
  const slitMotherIds = new Set(activeBabies.map(b => b.hrCoilId))
  const consumedByBaby = coilConsumption(productions, null, 'babyCoilId')

  // Section 1 — unslit mother coils. Unslit ⇒ never consumed by production (which consumes
  // baby coils), so remaining weight is the coil's actualWeight (matches Dashboard fullCoilLeft).
  const hrGroups = {}
  ;(coils || [])
    .filter(c => !c.deleted && !slitMotherIds.has(c.hrCoilId))
    .forEach(c => {
      const mt = Number(c.actualWeight || 0)
      if (mt <= EPS) return
      const width = Number(c.width || 0)
      const thick = Number(c.thickness || 0)
      const grade = String(c.coilGrade || '').trim() || '—'
      const key = `${width}|${thick}|${grade}`
      const g = hrGroups[key] || { width, thick, grade, mt: 0 }
      g.mt += mt
      hrGroups[key] = g
    })

  // Section 2 — baby-coil strip free weight.
  const stripGroups = {}
  activeBabies
    .filter(b => b.consumed !== true)
    .forEach(b => {
      const free = Number(b.weight || 0) - Number(consumedByBaby[b.babyCoilId]?.weight || 0)
      const mt = Math.max(0, free)
      if (mt <= EPS) return
      const width = Number(b.width || 0)
      const thick = Number(b.thickness || 0)
      const key = `${width}|${thick}`
      const g = stripGroups[key] || { width, thick, mt: 0 }
      g.mt += mt
      stripGroups[key] = g
    })

  const sortGroups = (arr) => arr.sort((a, b) => (a.width - b.width) || (a.thick - b.thick))
  const hrCoil = sortGroups(Object.values(hrGroups))
  const strip = sortGroups(Object.values(stripGroups))
  const hrTotal = hrCoil.reduce((t, g) => t + g.mt, 0)
  const stripTotal = strip.reduce((t, g) => t + g.mt, 0)
  return {
    hrCoil: { groups: hrCoil, total: hrTotal },
    strip: { groups: strip, total: stripTotal },
    grand: hrTotal + stripTotal,
  }
}

// ── Report C data: PB MTD Dashboard. Reproduces the app's Sales/Dashboard KPIs (salesKpis) +
// FIFO stock ageing (skuAgeing) for the monthly management report, mirroring the `pb-mtd-report`
// skill so the two never diverge. Only P&T-possible lines are computed — segments, plants,
// FE550/FE550D grades, order categories, SFDC, carry-forward, opening/closing balances and DSI
// have no analog in this system and are deliberately absent.
//   `date` = report day D (default today), drives MTD / prev-month-same-days / D / D-1 / D-2.
//   `productions` MUST be live-weight-resolved by the caller (resolveProductionWeights) so produced
//     tonnage matches the app's FG Left Inventory (a stored total_weight overstates once a master
//     weightPerTube is edited post-save).
//   `bestEstimate` = manual monthly target MT (no forecast field exists); null ⇒ Invoice % of BE and
//     Daily Run Rate render N/A.
// Pure + DOM-free (no exceljs) so it's unit-testable. ──
const dashMonthKey = (d) => String(d || '').slice(0, 7)
const dashDay = (d) => Number(String(d || '').slice(8, 10))
const dashShift = (iso, days) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const dashPrevMonth = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) }
const dashDaysRemaining = (iso) => { const d = new Date(iso + 'T00:00:00Z'); const day = d.getUTCDate(); d.setUTCMonth(d.getUTCMonth() + 1, 0); return d.getUTCDate() - day + 1 } // report day → month end, inclusive

export function buildMtdDashboardData(orders, dispatches, productions, skus, { date = today(), bestEstimate = null } = {}) {
  const D = date, D1 = dashShift(D, -1), D2 = dashShift(D, -2)
  const MONTH = dashMonthKey(D), PREV = dashPrevMonth(D), DAY = dashDay(D)
  const beNum = Number(bestEstimate)
  const BE = (bestEstimate == null || bestEstimate === '' || !Number.isFinite(beNum) || beNum <= 0) ? null : beNum
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

  // Invoiced tonnage from dispatches (Σ bundleEntries weight over non-deleted rows matching a predicate).
  const dispLines = (dispatches || []).filter(d => !d.deleted)
  const sumDisp = (pred) => dispLines.reduce((t, d) =>
    pred(d) ? t + (d.bundleEntries || []).reduce((s, be) => s + num(be.weight), 0) : t, 0)
  const invoicedMtd = sumDisp(d => dashMonthKey(d.dateOfDispatch) === MONTH && d.dateOfDispatch <= D) // MTD capped at ≤ D
  const invoicedPrev = sumDisp(d => dashMonthKey(d.dateOfDispatch) === PREV && dashDay(d.dateOfDispatch) <= DAY) // prev month, same day-of-month window
  const dispatchD = sumDisp(d => d.dateOfDispatch === D)
  const dispatchD1 = sumDisp(d => d.dateOfDispatch === D1)
  const invoicedAll = sumDisp(() => true)

  // Order-book snapshot (Confirmed / Non-confirmed are all-time non-delivered; salesKpis is the app's own KPI).
  const kpi = salesKpis(orders, dispatches, MONTH)
  const confirmed = kpi.confirmed, nonConfirmed = kpi.nonConfirmed
  const pending = confirmed + nonConfirmed
  const totalOrders = invoicedMtd + confirmed + nonConfirmed
  const invoicedPctPipeline = totalOrders > 0 ? (invoicedMtd / totalOrders) * 100 : null

  // Orders intake (Σ quantity).
  const ordLines = (orders || []).filter(o => !o.deleted)
  const sumOrd = (pred) => ordLines.reduce((t, o) => pred(o) ? t + num(o.quantity) : t, 0)
  const ordersMonthIntake = sumOrd(o => dashMonthKey(o.orderDate) === MONTH)
  const ordersD = sumOrd(o => o.orderDate === D)
  const ordersD1 = sumOrd(o => o.orderDate === D1)
  const ordersD2 = sumOrd(o => o.orderDate === D2)

  // Production + physical inventory (productions already live-resolved by caller).
  const prodLines = (productions || []).filter(p => !p.deleted)
  const producedLive = prodLines.reduce((t, p) => t + num(p.totalWeight), 0)
  const freshProductionMtd = prodLines.reduce((t, p) => dashMonthKey(p.dateOfProduction) === MONTH ? t + num(p.totalWeight) : t, 0)
  const physicalInventory = producedLive - invoicedAll

  // Targets (only when a Best Estimate is supplied).
  const invoicePctOfBe = BE != null ? (invoicedMtd / BE) * 100 : null
  const remaining = dashDaysRemaining(D)
  const dailyRunRate = BE != null && remaining > 0 ? Math.max(0, BE - invoicedMtd) / remaining : null

  // FIFO ageing per canonical SKU (buckets + weighted-avg age), joined for the top-5 detail sheet.
  const keyOf = skuKeyResolver(skus)
  const ageing = skuAgeing(productions, dispatches, keyOf, D)
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s]))
  const zeroBkt = () => ({ d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 })
  const addBkt = (acc, b) => { acc.d0_30 += b.d0_30; acc.d31_60 += b.d31_60; acc.d61_90 += b.d61_90; acc.d90plus += b.d90plus }
  const allBuckets = zeroBkt()
  let onhandTot = 0, ageWtTot = 0
  const ageingRows = Object.entries(ageing).map(([k, v]) => {
    onhandTot += v.onhandWeight; ageWtTot += v.onhandWeight * v.avgAgeDays; addBkt(allBuckets, v.buckets)
    const sku = skuByKey.get(k)
    const size = skuSizeLabel(sku)
    const label = size ? (sku?.thickness ? `${size} x ${sku.thickness}` : size) : (sku?.description || k)
    return { key: k, label, onhandMt: v.onhandWeight, buckets: v.buckets, oldestAgeDays: v.oldestAgeDays, avgAgeDays: v.avgAgeDays }
  })
  const invAgeingDaysAvg = onhandTot > 0 ? ageWtTot / onhandTot : null

  // Top 5 SKUs by on-hand inventory (MT), descending — with their combined subtotal.
  const top5 = ageingRows.slice().sort((a, b) => b.onhandMt - a.onhandMt).slice(0, 5)
  const t5 = top5.reduce((acc, r) => { acc.onhandMt += r.onhandMt; addBkt(acc.buckets, r.buckets); acc.ageWt += r.onhandMt * r.avgAgeDays; return acc },
    { onhandMt: 0, buckets: zeroBkt(), ageWt: 0 })
  const top5Total = { onhandMt: t5.onhandMt, buckets: t5.buckets, avgAgeDays: t5.onhandMt > 0 ? t5.ageWt / t5.onhandMt : null }

  return {
    date: D, month: MONTH, prevMonth: PREV, day: DAY, daysRemaining: remaining, bestEstimate: BE,
    kpis: { bestEstimate: BE, orderPipeline: totalOrders, invoicedMtd, invoicedPctPipeline, pending, physicalInventory, invAgeingDaysAvg },
    orderStatus: { bestEstimate: BE, ordersReceived: totalOrders, invoicedMtd, confirmed, nonConfirmed, invoicePctOfBe },
    orderPipelineMtd: { totalOrders, ordersMonthIntake, invoicedMtd, invoicedPrev, dispatchD1, dispatchD, confirmed, nonConfirmed, dailyRunRate, ordersD, ordersD1, ordersD2 },
    inventoryProduction: { freshProductionMtd, physicalInventory, invAgeingDaysAvg, buckets: allBuckets },
    skuAgeingTop5: { rows: top5, total: top5Total },
  }
}

// ═══════════════════════════════════════════════════════════════
// EXCEL RENDERING (exceljs, lazy-loaded)
// ═══════════════════════════════════════════════════════════════
const ALL_BORDERS = {
  top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  right: { style: 'thin', color: { argb: 'FF9CA3AF' } },
}
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const COLOR = {
  title: 'FFBDD7EE', head: 'FFD9E1F2', sub: 'FFFFF2CC', grand: 'FFFFE699',
  ROUND: 'FFC55A11', SHS: 'FF2E7D32', RHS: 'FF1565C0', OTHER: 'FF6B7280',
  coil: 'FF7030A0', strip: 'FF0F766E',
}
const today = () => new Date().toISOString().slice(0, 10)
const ddmmyyyy = (iso) => { const [y, m, d] = String(iso).split('-'); return d ? `${d}.${m}.${y}` : iso }

// Shared download — mirrors downloadCSV (App.jsx): Blob + anchor click + revoke.
export async function downloadWorkbook(workbook, filename) {
  const buf = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const loadExcelJS = async () => {
  const mod = await import('exceljs')
  // Vite resolves exceljs to its browser build; the ExcelJS object (with .Workbook) sits on
  // the default export — but harden against a bundler that surfaces the named export instead.
  return mod.Workbook ? mod : (mod.default ?? mod)
}

// Set a numeric cell's format + right-align it. Module-level so both report builders share it.
const numCell = (row, idx, fmt) => { const c = row.getCell(idx); c.numFmt = fmt; c.alignment = { horizontal: 'right' } }

// Title (merged, banded) + right-aligned date sub-title across `cols` columns. Returns
// the next free row number.
const writeTitle = (ws, cols, title, dateIso) => {
  const last = String.fromCharCode(64 + cols) // 1→A, 7→G
  ws.mergeCells(`A1:${last}1`)
  const t = ws.getCell('A1')
  t.value = title
  t.font = { bold: true, size: 14, color: { argb: 'FF1F3864' } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  t.fill = fill(COLOR.title)
  ws.getRow(1).height = 24
  ws.mergeCells(`A2:${last}2`)
  const s = ws.getCell('A2')
  s.value = `As on: ${ddmmyyyy(dateIso)}`
  s.font = { bold: true, size: 11, color: { argb: 'FF1F3864' } }
  s.alignment = { horizontal: 'right' }
  s.fill = fill(COLOR.title)
  return 3
}

const styleHeaderRow = (row) => row.eachCell(c => {
  c.font = { bold: true }
  c.fill = fill(COLOR.head)
  c.border = ALL_BORDERS
  c.alignment = { horizontal: 'center' }
})

const sectionBand = (ws, cols, rowNum, text, argb) => {
  const last = String.fromCharCode(64 + cols)
  ws.mergeCells(`A${rowNum}:${last}${rowNum}`)
  const c = ws.getCell(`A${rowNum}`)
  c.value = text
  c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  c.fill = fill(argb)
  c.alignment = { horizontal: 'left' }
}

// ── Report A — Finished Pipe Stock ──
export async function generateFinishedStockReport(skus, productions, dispatches, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const data = buildFinishedStockData(skus, productions, dispatches, opts)
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Finished Stock', { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.columns = [
    { width: 16 }, { width: 9 }, { width: 9 }, { width: 11 },
    { width: 11 }, { width: 13 }, { width: 18 },
  ]
  const COLS = ['SIZE', 'THICK', 'LEN', 'KG/PCS', 'PCS', 'QTY (MT)', 'REMARKS']

  writeTitle(ws, 7, `${company} — FINISHED PIPE STOCK REPORT`, date)
  styleHeaderRow(ws.addRow(COLS))

  if (!data.sections.length) {
    const r = ws.addRow(['No stock on hand', '', '', '', 0, 0, ''])
    r.eachCell(c => { c.border = ALL_BORDERS })
  }
  data.sections.forEach(section => {
    sectionBand(ws, 7, ws.addRow([]).number, `BLACK PIPE ( ${section.name} )`, COLOR[section.name] || COLOR.OTHER)
    section.rows.forEach(r => {
      const row = ws.addRow([r.size, r.thick, r.len, r.kgPerPcs, r.pcs, r.mt, r.remarks])
      numCell(row, 4, '0.00'); numCell(row, 5, '0'); numCell(row, 6, '0.000')
      row.eachCell(c => { c.border = ALL_BORDERS })
    })
    const sub = ws.addRow([`${section.name} TOTAL`, '', '', '', section.subtotal.pcs, section.subtotal.mt, ''])
    sub.font = { bold: true }
    numCell(sub, 5, '0'); numCell(sub, 6, '0.000')
    sub.eachCell(c => { c.fill = fill(COLOR.sub); c.border = ALL_BORDERS })
  })

  const gt = ws.addRow(['GRAND TOTAL', '', '', '', data.grand.pcs, data.grand.mt, 'MT'])
  gt.font = { bold: true, size: 12 }
  numCell(gt, 5, '0'); numCell(gt, 6, '0.000')
  gt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })

  await downloadWorkbook(wb, `finished-stock-${date}.xlsx`)
}

// ── Report B — Raw Material Stock ──
export async function generateRawMaterialReport(coils, babyCoils, productions, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const data = buildRawMaterialData(coils, babyCoils, productions)
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Raw Material Stock')
  ws.columns = [{ width: 12 }, { width: 10 }, { width: 18 }, { width: 14 }]

  writeTitle(ws, 4, `${company} — TUBE MILL RAW MATERIAL STOCK`, date)

  const col = (n) => String.fromCharCode(64 + n)
  // Total row: label merged across cols 1..labelSpan; the MT value lands in `valueCol`,
  // optionally merged out to `valueMergeTo` — so a total sits in the same column (and merge
  // span) as the data rows it sums, instead of drifting one column over.
  const totalRow = (label, labelSpan, valueCol, mt, valueMergeTo = 0) => {
    const cells = Array(4).fill('')
    cells[0] = label
    cells[valueCol - 1] = mt
    const row = ws.addRow(cells)
    if (labelSpan > 1) ws.mergeCells(`A${row.number}:${col(labelSpan)}${row.number}`)
    if (valueMergeTo > valueCol) ws.mergeCells(`${col(valueCol)}${row.number}:${col(valueMergeTo)}${row.number}`)
    row.font = { bold: true }
    numCell(row, valueCol, '0.000')
    row.eachCell(c => { c.fill = fill(COLOR.sub); c.border = ALL_BORDERS })
    return row
  }

  // Section 1 — HR Coil Stock
  sectionBand(ws, 4, ws.addRow([]).number, 'HR COIL STOCK  (whole, unslit mother coils)', COLOR.coil)
  styleHeaderRow(ws.addRow(['WIDTH', 'THICK', 'GRADE', 'WT (MT)']))
  if (!data.hrCoil.groups.length) {
    const r = ws.addRow(['No unslit coils', '', '', 0]); r.eachCell(c => { c.border = ALL_BORDERS })
  }
  data.hrCoil.groups.forEach(g => {
    const row = ws.addRow([g.width, g.thick, g.grade, g.mt])
    numCell(row, 2, '0.00'); numCell(row, 4, '0.000')
    row.eachCell(c => { c.border = ALL_BORDERS })
  })
  totalRow('HR COIL TOTAL', 3, 4, data.hrCoil.total)

  // Section 2 — HR Strip / Baby Coil Stock
  sectionBand(ws, 4, ws.addRow([]).number, 'HR STRIP / BABY-COIL STOCK  (slit strip, free weight)', COLOR.strip)
  styleHeaderRow(ws.addRow(['WIDTH', 'THICK', 'WT FREE (MT)', '']))
  ws.mergeCells(`C${ws.lastRow.number}:D${ws.lastRow.number}`)
  if (!data.strip.groups.length) {
    const r = ws.addRow(['No strip stock', '', 0, '']); r.eachCell(c => { c.border = ALL_BORDERS })
  }
  data.strip.groups.forEach(g => {
    const row = ws.addRow([g.width, g.thick, g.mt, ''])
    ws.mergeCells(`C${row.number}:D${row.number}`)
    numCell(row, 2, '0.00'); numCell(row, 3, '0.000')
    row.eachCell(c => { c.border = ALL_BORDERS })
  })
  totalRow('STRIP TOTAL', 2, 3, data.strip.total, 4)

  const gt = ws.addRow(['GRAND TOTAL', '', '', data.grand])
  ws.mergeCells(`A${gt.number}:C${gt.number}`)
  gt.font = { bold: true, size: 12 }
  numCell(gt, 4, '0.000')
  gt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })

  await downloadWorkbook(wb, `raw-material-${date}.xlsx`)
}

// ── Report C — PB MTD Dashboard (2 sheets) ──
// Sheet 1 "Dashboard": a 6-card KPI band + three colour-banded tables (Order Status Summary,
// Order Pipeline — MTD, Inventory & Production). Sheet 2: Top-5 SKUs by on-hand inventory (MT)
// with FIFO age buckets. Numbers come from buildMtdDashboardData (which mirrors pb-mtd-report),
// so pass live-weight-resolved productions. `opts.bestEstimate` (MT) is the manual monthly target.
const DASH = {
  be: 'FFBF8F00', pipeline: 'FF2E75B6', invoiced: 'FF548235', pending: 'FFC55A11',
  physinv: 'FF7030A0', ageing: 'FF1F7A72',
  bandStatus: 'FF2E75B6', bandPipeline: 'FF548235', bandInv: 'FFC55A11',
}
const naMt = (v) => (v == null ? 'N/A' : Number(v))                       // MT cell: number → numFmt, null → "N/A"
const naPct = (v) => (v == null ? 'N/A' : `${Number(v).toFixed(1)}%`)      // percentage cell as text

export async function generateMtdDashboardReport(orders, dispatches, productions, skus, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const data = buildMtdDashboardData(orders, dispatches, productions, skus, { date, bestEstimate: opts.bestEstimate ?? null })
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  const cL = (n) => String.fromCharCode(64 + n)

  // ── Sheet 1 — Dashboard (12-column grid: 6 KPI cards × 2 cols; left table cols 1–6, right 7–12) ──
  const ws = wb.addWorksheet('Dashboard', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  const N = 12
  ws.columns = Array.from({ length: N }, () => ({ width: 11 }))
  const monthLabel = new Date(date + 'T00:00:00Z')
    .toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()
  writeTitle(ws, N, `${company} — PB MTD DASHBOARD — ${monthLabel}`, date)

  const setBorders = (r, c1, c2) => { for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = ALL_BORDERS }

  // KPI band — headers (row 4), values (row 5), captions (row 6).
  const k = data.kpis
  const cards = [
    { h: 'BEST ESTIMATE (MT)', v: naMt(k.bestEstimate), s: 'manual target', c: DASH.be },
    { h: 'ORDER PIPELINE (MT)', v: naMt(k.orderPipeline), s: 'Invoiced + Conf + Non-Conf', c: DASH.pipeline },
    { h: 'INVOICED MTD (MT)', v: naMt(k.invoicedMtd), s: k.invoicedPctPipeline == null ? '' : `${k.invoicedPctPipeline.toFixed(1)}% of pipeline`, c: DASH.invoiced },
    { h: 'PENDING TO SERVE (MT)', v: naMt(k.pending), s: 'Conf + Non-Conf', c: DASH.pending },
    { h: 'PHYSICAL INVENTORY (MT)', v: naMt(k.physicalInventory), s: 'produced − invoiced', c: DASH.physinv },
    { h: 'INV. AGEING (DAYS AVG)', v: naMt(k.invAgeingDaysAvg), s: 'FIFO, tonnage-wtd', c: DASH.ageing },
  ]
  const HR = 4, VR = 5, SR = 6
  ws.getRow(HR).height = 30; ws.getRow(VR).height = 22
  cards.forEach((card, i) => {
    const c1 = i * 2 + 1, c2 = c1 + 1
    ws.mergeCells(`${cL(c1)}${HR}:${cL(c2)}${HR}`)
    const h = ws.getCell(HR, c1)
    h.value = card.h; h.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
    h.fill = fill(card.c); h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    ws.mergeCells(`${cL(c1)}${VR}:${cL(c2)}${VR}`)
    const v = ws.getCell(VR, c1)
    v.value = card.v; v.font = { bold: true, size: 15 }
    if (typeof card.v === 'number') v.numFmt = '#,##0.0'
    v.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.mergeCells(`${cL(c1)}${SR}:${cL(c2)}${SR}`)
    const s = ws.getCell(SR, c1)
    s.value = card.s; s.font = { size: 8, color: { argb: 'FF6B7280' } }
    s.alignment = { horizontal: 'center' }
    setBorders(HR, c1, c2); setBorders(VR, c1, c2); setBorders(SR, c1, c2)
  })

  // A colour-banded label|value table. label spans lc1..lc2, value spans vc1..vc2; band spans the lot.
  const table = (startRow, lc1, lc2, vc1, vc2, title, argb, headerLabel, rows) => {
    ws.mergeCells(`${cL(lc1)}${startRow}:${cL(vc2)}${startRow}`)
    const band = ws.getCell(startRow, lc1)
    band.value = title; band.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    band.fill = fill(argb); band.alignment = { horizontal: 'left', vertical: 'middle' }
    const hrow = startRow + 1
    ws.mergeCells(`${cL(lc1)}${hrow}:${cL(lc2)}${hrow}`)
    ws.mergeCells(`${cL(vc1)}${hrow}:${cL(vc2)}${hrow}`)
    const hl = ws.getCell(hrow, lc1); hl.value = headerLabel; hl.font = { bold: true }; hl.fill = fill(COLOR.head); hl.alignment = { horizontal: 'left' }
    const hv = ws.getCell(hrow, vc1); hv.value = 'MT'; hv.font = { bold: true }; hv.fill = fill(COLOR.head); hv.alignment = { horizontal: 'right' }
    setBorders(hrow, lc1, vc2)
    let r = hrow + 1
    rows.forEach(row => {
      ws.mergeCells(`${cL(lc1)}${r}:${cL(lc2)}${r}`)
      ws.mergeCells(`${cL(vc1)}${r}:${cL(vc2)}${r}`)
      const lcell = ws.getCell(r, lc1); lcell.value = (row.indent ? '     ' : '') + row.label; lcell.alignment = { horizontal: 'left' }
      const vcell = ws.getCell(r, vc1); vcell.value = row.value; vcell.alignment = { horizontal: 'right' }
      if (typeof row.value === 'number') vcell.numFmt = '#,##0.0'
      if (row.strong) { lcell.font = { bold: true }; vcell.font = { bold: true }; lcell.fill = fill(COLOR.grand); vcell.fill = fill(COLOR.grand) }
      setBorders(r, lc1, vc2)
      r++
    })
    return r
  }

  const os = data.orderStatus, op = data.orderPipelineMtd, ip = data.inventoryProduction
  let leftRow = table(8, 1, 4, 5, 6, 'ORDER STATUS SUMMARY', DASH.bandStatus, 'Metric', [
    { label: 'Best Estimate (BE)', value: naMt(os.bestEstimate) },
    { label: 'Orders Received (Total Orders)', value: os.ordersReceived },
    { label: 'Invoiced MTD', value: os.invoicedMtd },
    { label: 'Confirmed Pending Invoice', value: os.confirmed },
    { label: 'Non-Confirmed Orders', value: os.nonConfirmed },
    { label: 'Invoice % of BE', value: naPct(os.invoicePctOfBe), strong: true },
  ])
  leftRow += 1 // spacer between the two stacked left-hand tables
  table(leftRow, 1, 4, 5, 6, 'INVENTORY & PRODUCTION', DASH.bandInv, 'Metric', [
    { label: 'Fresh Production MTD', value: ip.freshProductionMtd },
    { label: 'Physical Inventory', value: ip.physicalInventory },
    { label: 'Inventory Ageing (Days Avg)', value: naMt(ip.invAgeingDaysAvg) },
    { label: 'Ageing 0–30 d', value: ip.buckets.d0_30, indent: true },
    { label: 'Ageing 31–60 d', value: ip.buckets.d31_60, indent: true },
    { label: 'Ageing 61–90 d', value: ip.buckets.d61_90, indent: true },
    { label: 'Ageing 90+ d', value: ip.buckets.d90plus, indent: true },
  ])
  table(8, 7, 10, 11, 12, 'ORDER PIPELINE — MTD', DASH.bandPipeline, 'Line', [
    { label: 'Total Orders', value: op.totalOrders },
    { label: 'Current Month Orders', value: op.ordersMonthIntake },
    { label: 'Invoiced Orders MTD', value: op.invoicedMtd },
    { label: 'Invoiced MTD (Prev Month, same days)', value: op.invoicedPrev },
    { label: 'Dispatch D-1', value: op.dispatchD1 },
    { label: 'Dispatch D Day', value: op.dispatchD },
    { label: 'Confirmed Pending Invoice', value: op.confirmed },
    { label: 'Non-Confirmed Orders', value: op.nonConfirmed },
    { label: 'Daily Run Rate Required', value: naMt(op.dailyRunRate), strong: true },
    { label: 'Orders Logged — D Day', value: op.ordersD },
    { label: 'Orders Logged — D-1', value: op.ordersD1 },
    { label: 'Orders Logged — D-2', value: op.ordersD2 },
  ])

  // ── Sheet 2 — Top-5 SKUs by on-hand inventory (MT) + FIFO age buckets ──
  const ws2 = wb.addWorksheet('SKU Ageing (Top 5)', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  ws2.columns = [{ width: 24 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 15 }]
  writeTitle(ws2, 8, `${company} — TOP 5 SKUs BY ON-HAND INVENTORY (MT)`, date)
  styleHeaderRow(ws2.addRow(['SKU', 'On-hand MT', '0–30 d', '31–60 d', '61–90 d', '90+ d', 'Oldest (d)', 'Wtd Avg Age (d)']))
  const t5 = data.skuAgeingTop5
  if (!t5.rows.length) {
    const r = ws2.addRow(['No finished stock on hand', '', '', '', '', '', '', '']); r.eachCell(c => { c.border = ALL_BORDERS })
  }
  t5.rows.forEach(row => {
    const r = ws2.addRow([row.label, row.onhandMt, row.buckets.d0_30, row.buckets.d31_60, row.buckets.d61_90, row.buckets.d90plus,
      row.oldestAgeDays == null ? '' : Math.round(row.oldestAgeDays), row.avgAgeDays == null ? '' : row.avgAgeDays])
    ;[2, 3, 4, 5, 6].forEach(i => numCell(r, i, '#,##0.0'))
    numCell(r, 7, '0'); numCell(r, 8, '0.0')
    r.eachCell(c => { c.border = ALL_BORDERS })
  })
  if (t5.rows.length) {
    const tr = ws2.addRow(['TOTAL (top 5)', t5.total.onhandMt, t5.total.buckets.d0_30, t5.total.buckets.d31_60,
      t5.total.buckets.d61_90, t5.total.buckets.d90plus, '', t5.total.avgAgeDays == null ? '' : t5.total.avgAgeDays])
    tr.font = { bold: true }
    ;[2, 3, 4, 5, 6].forEach(i => numCell(tr, i, '#,##0.0')); numCell(tr, 8, '0.0')
    tr.eachCell(c => { c.fill = fill(COLOR.sub); c.border = ALL_BORDERS })
  }
  const note = ws2.addRow(['Top 5 by on-hand MT. Full-stock ageing totals are on the Dashboard sheet (Inventory & Production).'])
  ws2.mergeCells(`A${note.number}:H${note.number}`)
  note.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }

  await downloadWorkbook(wb, `PB-MTD-Dashboard-${date}.xlsx`)
  return data
}

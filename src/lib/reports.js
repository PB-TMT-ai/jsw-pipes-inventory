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
import { producedPool, unmatchedDispatch, coilConsumption, skuSizeLabel, skuKeyResolver, skuAgeing, salesKpis,
  plantBestEstimate, salesByDistributor, distributorCode, REGIONS, UNMAPPED_REGION } from './calc'

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
// not the full catalogue. Returns { sections:[{name, rows, subtotal}], grand, unmatched, net } —
// `grand` sums the listed rows, `unmatched` is over-dispatched tonnage with no row, `net` = the two
// netted (the plant total, matching the Dashboard's FG Left Inventory). ──
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
      // Negative stock = over-dispatched (dispatched > produced). A size with no stock has no place
      // on a warehouse stock sheet, so it isn't listed — but the tonnage is NOT discarded: it comes
      // back as `unmatched` below and is deducted from the net, so the sheet still ties to the
      // Dashboard's FG Left Inventory.
      if (nonZeroOnly && !(pcs > 0 || mt > EPS)) return
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
    const subPcs = rows.reduce((t, r) => t + Math.max(0, r.pcs), 0)
    const subMt = rows.reduce((t, r) => t + Math.max(0, r.mt), 0)
    grandPcs += subPcs
    grandMt += subMt
    sections.push({ name, rows, subtotal: { pcs: subPcs, mt: subMt } })
  })
  // `grand` stays the sum of the LISTED rows, so the sheet adds up internally. `unmatched` is the
  // over-dispatched tonnage that has no row to sit on; `net` = grand − unmatched is the plant total
  // and matches the Dashboard's FG Left Inventory card.
  const unmatched = unmatchedDispatch(pool)
  return {
    sections,
    grand: { pcs: grandPcs, mt: grandMt },
    unmatched: { pcs: unmatched.pieces, mt: unmatched.weight, skus: unmatched.skus },
    net: { pcs: grandPcs - unmatched.pieces, mt: grandMt - unmatched.weight },
  }
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
const MIN_ONHAND_MT = 2 // Sheet 2 lists every SKU with more than this much on-hand finished stock (MT)

// SKU display label — "size x thickness" where the SKU master knows the code, else its description,
// else the raw key. Shared by the SKU Ageing and Distributor × SKU sheets so a size reads identically
// on both and the two sheets can be joined on it.
const skuLabel = (sku, fallback) => {
  const size = skuSizeLabel(sku)
  if (size) return sku?.thickness ? `${size} x ${sku.thickness}` : size
  return sku?.description || fallback
}

// Region sort order for the Distributor × SKU sheet: the four fixed regions in their canonical order,
// then Unmapped, then anything unexpected. Alphabetical would bury Unmapped between South and West.
const REGION_ORDER = [...REGIONS, UNMAPPED_REGION]
const regionRank = (r) => { const i = REGION_ORDER.indexOf(r); return i < 0 ? REGION_ORDER.length : i }

export function buildMtdDashboardData(orders, dispatches, productions, skus, { date = today(), estimates = [], stateRegions = null } = {}) {
  const D = date, D1 = dashShift(D, -1), D2 = dashShift(D, -2)
  const MONTH = dashMonthKey(D), PREV = dashPrevMonth(D), DAY = dashDay(D)
  // The plant Best Estimate is DERIVED — Σ of the month's distributor estimates, never typed
  // (ADR-0001). Null when nobody set a target, so % of BE and the run rate report N/A.
  const BE = plantBestEstimate(estimates, MONTH)
  const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

  // Invoiced tonnage from dispatches (Σ bundleEntries weight over non-deleted rows matching a predicate).
  const dispLines = (dispatches || []).filter(d => !d.deleted)
  const sumDisp = (pred) => dispLines.reduce((t, d) =>
    pred(d) ? t + (d.bundleEntries || []).reduce((s, be) => s + num(be.weight), 0) : t, 0)
  const invoicedMtd = sumDisp(d => dashMonthKey(d.dateOfDispatch) === MONTH && d.dateOfDispatch <= D) // MTD capped at ≤ D
  const invoicedPrev = sumDisp(d => dashMonthKey(d.dateOfDispatch) === PREV && dashDay(d.dateOfDispatch) <= DAY) // prev month, same day-of-month window
  const dispatchD = sumDisp(d => d.dateOfDispatch === D)
  const dispatchD1 = sumDisp(d => d.dateOfDispatch === D1)

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

  // Fresh production MTD (productions already live-resolved by caller). Physical Inventory is derived
  // below as the sum of POSITIVE per-SKU on-hand (a SKU can't hold negative stock; SKUs shipped beyond
  // their tracked production are floored to 0), so it ties to the SKU ageing sheet and its buckets.
  const prodLines = (productions || []).filter(p => !p.deleted)
  const freshProductionMtd = prodLines.reduce((t, p) => dashMonthKey(p.dateOfProduction) === MONTH ? t + num(p.totalWeight) : t, 0)

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
    const label = skuLabel(skuByKey.get(k), k)
    return { key: k, label, onhandMt: v.onhandWeight, buckets: v.buckets, oldestAgeDays: v.oldestAgeDays, avgAgeDays: v.avgAgeDays }
  })
  const invAgeingDaysAvg = onhandTot > 0 ? ageWtTot / onhandTot : null
  // skuAgeing only emits keys with surviving POSITIVE layers, so over-dispatched SKUs vanish from
  // onhandTot entirely. That pipe still left the plant, so recover the dropped tonnage from
  // producedPool and take it off the total — Physical Inventory is Σ produced − Σ invoiced, exactly
  // as its KPI caption claims. Ageing stays over positive stock only (you can't age what isn't there).
  const unmatched = unmatchedDispatch(producedPool(productions, dispatches, null, keyOf)).weight
  const physicalInventory = onhandTot - unmatched

  // Every SKU with on-hand inventory above MIN_ONHAND_MT, descending — with their combined subtotal.
  const stockRows = ageingRows.filter(r => r.onhandMt > MIN_ONHAND_MT).sort((a, b) => b.onhandMt - a.onhandMt)
  const st = stockRows.reduce((acc, r) => { acc.onhandMt += r.onhandMt; addBkt(acc.buckets, r.buckets); acc.ageWt += r.onhandMt * r.avgAgeDays; return acc },
    { onhandMt: 0, buckets: zeroBkt(), ageWt: 0 })
  const stockTotal = { onhandMt: st.onhandMt, buckets: st.buckets, avgAgeDays: st.onhandMt > 0 ? st.ageWt / st.onhandMt : null }

  // The SKUs with 0 < on-hand ≤ MIN_ONHAND_MT are excluded from the sheet's list. Together with the
  // unmatched dispatch (over-shipped SKUs, which the list also can't show) they close the ladder:
  // stockTotal(>MIN) + otherLe2(≤MIN) − unmatched == physicalInventory.
  const otherLe2 = onhandTot - stockTotal.onhandMt

  // ── Distributor sheets. ONE call to salesByDistributor — the same function (and the same options)
  // the Sales tab drill-down uses — feeds both, so the screen and the workbook cannot disagree.
  // `productions` adds unreserved plant stock to every SKU row; `stateRegions` adds state + region.
  const distRowsAll = salesByDistributor(orders, dispatches, MONTH, skus, { estimates, productions, stateRegions })

  // Sheet 3 — the month's target-vs-invoiced by distributor. Only the BE columns and the invoiced
  // actual are carried: this sheet's job is explaining the derived plant BE above, and its BE column
  // sums to exactly that KPI. It stays inventory-free — its columns are all totalled, and an
  // unreserved stock column cannot be (ADR-0002); the per-SKU stock lives on Sheet 4, which is
  // totalled nowhere.
  const distRows = distRowsAll
    .filter(r => r.bestEstimate != null || r.mtdInvoice > EPS)
    .sort((a, b) => (b.bestEstimate ?? 0) - (a.bestEstimate ?? 0) || b.mtdInvoice - a.mtdInvoice)
  const distTotal = distRows.reduce((acc, r) => {
    acc.bestEstimate += r.bestEstimate ?? 0
    acc.mtdInvoice += r.mtdInvoice
    return acc
  }, { bestEstimate: 0, mtdInvoice: 0 })
  distTotal.pctOfBe = distTotal.bestEstimate > 0 ? (distTotal.mtdInvoice / distTotal.bestEstimate) * 100 : null
  distTotal.gapToBe = distTotal.bestEstimate > 0 ? distTotal.bestEstimate - distTotal.mtdInvoice : null
  // Invoiced tonnage from distributors nobody set a target for. It is counted in the actual but not
  // in the plan, so it is what pushes % of BE past 100 without the plan having been beaten
  // (ADR-0001: no "Others" bucket absorbs it).
  const unallocatedInvoiced = distRows.reduce((t, r) => r.bestEstimate == null ? t + r.mtdInvoice : t, 0)

  // ── Sheet 4 — distributor × SKU: what is pending, what was invoiced this month, and how much of
  // that size the plant is holding. One row per pair that is LIVE (pending or invoiced MTD above
  // zero) — not every possible pair. Region → distributor → pending desc, with the SKU label as a
  // stable tiebreak.
  //
  // `onhand` is the WHOLE PLANT's stock for the size and nothing is reserved, so the identical
  // tonnage repeats on every distributor's row for that size and `shortBy` can read 0 on a row whose
  // size is oversubscribed several times over. That is why the rendered sheet carries no total on
  // on-hand — in fact no total row at all — and a caption naming the sharing (ADR-0002).
  const distSkuRows = []
  distRowsAll.forEach(r => {
    ;(r.skuRows || []).forEach(s => {
      if (!(s.pending > EPS || s.mtdInvoice > EPS)) return
      distSkuRows.push({
        region: r.region, state: r.state || '', customer: r.customer,
        skuKey: s.id, sku: skuLabel(skuByKey.get(s.id), s.skuCode || s.id),
        invoicedMtd: s.mtdInvoice, confirmed: s.confirmed, nonConfirmed: s.nonConfirmed,
        pending: s.pending, onhand: s.onhand ?? 0, shortBy: s.shortBy ?? 0,
      })
    })
  })
  distSkuRows.sort((a, b) =>
    (regionRank(a.region) - regionRank(b.region))
    || a.customer.localeCompare(b.customer)
    || (b.pending - a.pending)
    || a.sku.localeCompare(b.sku))

  return {
    date: D, month: MONTH, prevMonth: PREV, day: DAY, daysRemaining: remaining, bestEstimate: BE,
    distributorEstimates: { rows: distRows, total: distTotal, unallocatedInvoiced },
    distributorSku: { rows: distSkuRows },
    kpis: { bestEstimate: BE, orderPipeline: totalOrders, invoicedMtd, invoicedPctPipeline, pending, physicalInventory, invAgeingDaysAvg, unmatchedDispatch: unmatched },
    orderStatus: { bestEstimate: BE, ordersReceived: totalOrders, invoicedMtd, confirmed, nonConfirmed, invoicePctOfBe },
    orderPipelineMtd: { totalOrders, ordersMonthIntake, invoicedMtd, invoicedPrev, dispatchD1, dispatchD, confirmed, nonConfirmed, dailyRunRate, ordersD, ordersD1, ordersD2 },
    inventoryProduction: { freshProductionMtd, physicalInventory, invAgeingDaysAvg, buckets: allBuckets, unmatchedDispatch: unmatched },
    skuAgeingRows: { rows: stockRows, total: stockTotal },
    reconciliation: { otherLe2, unmatchedDispatch: unmatched, physicalInventory },
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

  const gt = ws.addRow(['GRAND TOTAL (listed sizes)', '', '', '', data.grand.pcs, data.grand.mt, 'MT'])
  gt.font = { bold: true, size: 12 }
  numCell(gt, 5, '0'); numCell(gt, 6, '0.000')
  gt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })

  // Over-dispatched sizes hold no stock so they have no row above, but the pipe left the plant.
  // Deduct it here so the sheet's net ties to the Dashboard's FG Left Inventory card.
  if (data.unmatched.mt > EPS) {
    const um = ws.addRow([`Less: dispatched w/o recorded production (${data.unmatched.skus} SKU)`, '', '', '',
      data.unmatched.pcs, data.unmatched.mt, 'MT'])
    numCell(um, 5, '0'); numCell(um, 6, '0.000')
    um.eachCell(c => { c.border = ALL_BORDERS })

    const nt = ws.addRow(['NET FINISHED STOCK', '', '', '', data.net.pcs, data.net.mt, 'MT'])
    nt.font = { bold: true, size: 12 }
    numCell(nt, 5, '0'); numCell(nt, 6, '0.000')
    nt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })
  }

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

// ── Report C — PB MTD Dashboard (4 sheets) ──
// Sheet 1 "Dashboard": a 6-card KPI band + three colour-banded tables (Order Status Summary,
// Order Pipeline — MTD, Inventory & Production). Sheet 2: every SKU with on-hand inventory over
// MIN_ONHAND_MT with FIFO age buckets. Sheet 3: distributor Best Estimate vs invoiced. Sheet 4:
// distributor × SKU pending / invoiced against unreserved plant stock. Numbers come from
// buildMtdDashboardData (which mirrors pb-mtd-report), so pass live-weight-resolved productions.
// `opts.estimates` are the per-distributor monthly targets; `opts.stateRegions` the state → region
// master (both come straight off the Sales tab).
const DASH = {
  be: 'FFBF8F00', pipeline: 'FF2E75B6', invoiced: 'FF548235', pending: 'FFC55A11',
  physinv: 'FF7030A0', ageing: 'FF1F7A72',
  bandStatus: 'FF2E75B6', bandPipeline: 'FF548235', bandInv: 'FFC55A11',
}
const naMt = (v) => (v == null ? 'N/A' : Number(v))                       // MT cell: number → numFmt, null → "N/A"
const naPct = (v) => (v == null ? 'N/A' : `${Math.round(Number(v))}%`)      // percentage cell as text (whole number)

export async function generateMtdDashboardReport(orders, dispatches, productions, skus, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const data = buildMtdDashboardData(orders, dispatches, productions, skus,
    { date, estimates: opts.estimates ?? [], stateRegions: opts.stateRegions ?? null })
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
    { h: 'BEST ESTIMATE (MT)', v: naMt(k.bestEstimate), s: 'Σ distributor estimates', c: DASH.be },
    { h: 'ORDER PIPELINE (MT)', v: naMt(k.orderPipeline), s: 'Invoiced + Conf + Non-Conf', c: DASH.pipeline },
    { h: 'INVOICED MTD (MT)', v: naMt(k.invoicedMtd), s: k.invoicedPctPipeline == null ? '' : `${Math.round(k.invoicedPctPipeline)}% of pipeline`, c: DASH.invoiced },
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
    if (typeof card.v === 'number') v.numFmt = '#,##0'
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
      if (typeof row.value === 'number') vcell.numFmt = '#,##0'
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

  // ── Sheet 2 — every SKU with on-hand inventory > MIN_ONHAND_MT (MT) + FIFO age buckets ──
  const ws2 = wb.addWorksheet(`SKU Ageing (>${MIN_ONHAND_MT} MT)`, {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  ws2.columns = [{ width: 24 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 15 }]
  writeTitle(ws2, 8, `${company} — SKUs WITH ON-HAND INVENTORY > ${MIN_ONHAND_MT} MT`, date)
  styleHeaderRow(ws2.addRow(['SKU', 'On-hand MT', '0–30 d', '31–60 d', '61–90 d', '90+ d', 'Oldest (d)', 'Wtd Avg Age (d)']))
  // Tonnage and the weighted-average age read to one decimal here so a small position doesn't
  // render as a bare 0; day counts stay whole (a day to one decimal is fake precision). The
  // rounding is the cell FORMAT only — the exact value goes into the cell, so this sheet's
  // subtotal and its reconciliation block keep tying to the Dashboard's Physical Inventory KPI.
  const MT1 = '#,##0.0', DAYS0 = '#,##0'
  // Any value that would render as 0 at the cell's precision shows "-" instead. `dp` matches the
  // format the cell carries: 1 for tonnage / wtd avg age, 0 for whole-day counts.
  const dash = (v, dp = 1) =>
    (v == null || v === '' ? '' : (Math.round(Number(v) * 10 ** dp) === 0 ? '-' : Number(v)))
  const stock = data.skuAgeingRows
  if (!stock.rows.length) {
    const r = ws2.addRow([`No SKU with more than ${MIN_ONHAND_MT} MT on hand`, '', '', '', '', '', '', '']); r.eachCell(c => { c.border = ALL_BORDERS })
  }
  stock.rows.forEach(row => {
    const r = ws2.addRow([row.label, dash(row.onhandMt), dash(row.buckets.d0_30), dash(row.buckets.d31_60), dash(row.buckets.d61_90),
      dash(row.buckets.d90plus), dash(row.oldestAgeDays, 0), dash(row.avgAgeDays)])
    ;[2, 3, 4, 5, 6, 8].forEach(i => numCell(r, i, MT1))
    numCell(r, 7, DAYS0)
    r.eachCell(c => { c.border = ALL_BORDERS })
  })
  if (stock.rows.length) {
    const tr = ws2.addRow([`TOTAL (>${MIN_ONHAND_MT} MT)`, dash(stock.total.onhandMt), dash(stock.total.buckets.d0_30), dash(stock.total.buckets.d31_60),
      dash(stock.total.buckets.d61_90), dash(stock.total.buckets.d90plus), '', dash(stock.total.avgAgeDays)])
    tr.font = { bold: true }
    ;[2, 3, 4, 5, 6, 8].forEach(i => numCell(tr, i, MT1))
    tr.eachCell(c => { c.fill = fill(COLOR.sub); c.border = ALL_BORDERS })
  }
  // Reconciliation to the Dashboard's Physical Inventory KPI: the sheet lists only >MIN SKUs, so the
  // small (≤MIN) ones are added back and the over-dispatched tonnage (which has no row to sit on) is
  // taken off — leaving Σ produced − Σ invoiced.
  const rec = data.reconciliation
  ws2.addRow([])
  const recRow = (label, val, strong) => {
    const r = ws2.addRow([label, dash(val), '', '', '', '', '', ''])
    numCell(r, 2, MT1)
    if (strong) { r.getCell(1).font = { bold: true }; r.getCell(2).font = { bold: true } }
    ;[1, 2].forEach(i => { const c = r.getCell(i); c.border = ALL_BORDERS; if (strong) c.fill = fill(COLOR.grand) })
    return r
  }
  recRow(`Other SKUs (≤${MIN_ONHAND_MT} MT)`, rec.otherLe2, false)
  recRow('− Dispatched w/o recorded production', rec.unmatchedDispatch, false)
  recRow('= Physical Inventory', rec.physicalInventory, true)
  const note = ws2.addRow([`Listed rows are positive on-hand stock over ${MIN_ONHAND_MT} MT (a SKU can't hold negative stock). "Dispatched w/o recorded production" is tonnage invoiced beyond what was booked as produced — it has no SKU row to sit on, but the pipe left the plant, so it is deducted. The "= Physical Inventory" line matches the Dashboard KPI.`])
  ws2.mergeCells(`A${note.number}:H${note.number}`)
  note.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }

  // ── Sheet 3 — Distributor Best Estimate vs invoiced for the month. The BE column sums to the
  // Dashboard's BEST ESTIMATE KPI by construction (both are Σ of the same estimates), so this sheet
  // is the audit trail for that headline number. ──
  const ws3 = wb.addWorksheet('Distributor BE', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  ws3.columns = [{ width: 34 }, { width: 16 }, { width: 16 }, { width: 14 }, { width: 16 }]
  writeTitle(ws3, 5, `${company} — DISTRIBUTOR BEST ESTIMATE vs INVOICED — ${monthLabel}`, date)
  styleHeaderRow(ws3.addRow(['Distributor', 'Best Estimate (MT)', 'Invoiced MTD (MT)', '% of BE', 'Gap to BE (MT)']))
  const de = data.distributorEstimates
  if (!de.rows.length) {
    const r = ws3.addRow(['No distributor estimate set, and nothing invoiced this month', '', '', '', ''])
    r.eachCell(c => { c.border = ALL_BORDERS })
  }
  de.rows.forEach(row => {
    const r = ws3.addRow([
      distributorCode(row.customer, 4) || row.customer || '—',
      naMt(row.bestEstimate), row.mtdInvoice, naPct(row.pctOfBe), naMt(row.gapToBe),
    ])
    ;[2, 3, 5].forEach(i => numCell(r, i, '#,##0.000'))
    r.getCell(4).alignment = { horizontal: 'right' }
    r.eachCell(c => { c.border = ALL_BORDERS })
  })
  if (de.rows.length) {
    const tr = ws3.addRow(['TOTAL (= Dashboard Best Estimate)', de.total.bestEstimate, de.total.mtdInvoice,
      naPct(de.total.pctOfBe), naMt(de.total.gapToBe)])
    tr.font = { bold: true }
    ;[2, 3, 5].forEach(i => numCell(tr, i, '#,##0.000'))
    tr.getCell(4).alignment = { horizontal: 'right' }
    tr.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })
  }
  ws3.addRow([])
  const unalloc = ws3.addRow([`Of which invoiced by distributors with no estimate: ${de.unallocatedInvoiced.toFixed(3)} MT`])
  ws3.mergeCells(`A${unalloc.number}:E${unalloc.number}`)
  unalloc.getCell(1).font = { bold: true, size: 9, color: { argb: 'FF92400E' } }
  const note3 = ws3.addRow(['Best Estimate is a typed monthly target per distributor; the Dashboard KPI is their sum, not a separate figure. It is measured against INVOICED tonnage only — Confirmed / Non-confirmed are an all-time order-book snapshot, not a monthly actual. A distributor with no estimate still shows its invoiced tonnage, and that tonnage is counted in the actual but not in the plan, so % of BE can exceed 100% without the plan having been beaten.'])
  ws3.mergeCells(`A${note3.number}:E${note3.number}`)
  note3.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  note3.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  ws3.getRow(note3.number).height = 44

  // ── Sheet 4 — Distributor × SKU: pending / invoiced MTD against the plant's stock of that size.
  // Rows come from the same salesByDistributor call the Sales tab drill-down uses.
  //
  // NO TOTAL ROW, deliberately. On-hand is plant-wide and unreserved, so summing it would report more
  // stock than the plant physically holds; and the sheet's rows only exist where an order line
  // carried a SKU code, so a Pending / Invoiced total would not tie to the Dashboard either. It is a
  // detail listing — the totals live on the Dashboard sheet (ADR-0002). ──
  const ws4 = wb.addWorksheet('Distributor × SKU', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  ws4.columns = [{ width: 11 }, { width: 20 }, { width: 34 }, { width: 18 },
    { width: 13 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 17 }, { width: 11 }]
  writeTitle(ws4, 10, `${company} — DISTRIBUTOR × SKU — PENDING vs INVOICED vs PLANT STOCK — ${monthLabel}`, date)
  styleHeaderRow(ws4.addRow(['Region', 'State', 'Distributor', 'SKU',
    'Invoiced MTD', 'Confirmed', 'Non-Conf', 'Pending', 'On-hand (plant)', 'Short by']))
  const dsk = data.distributorSku
  const ds4HeaderRow = ws4.lastRow.number
  if (!dsk.rows.length) {
    const r = ws4.addRow(['No distributor has pending or month-to-date invoiced tonnage', '', '', '', '', '', '', '', '', ''])
    r.eachCell(c => { c.border = ALL_BORDERS })
  }
  dsk.rows.forEach(row => {
    const r = ws4.addRow([row.region, row.state || '—', row.customer, row.sku,
      dash(row.invoicedMtd), dash(row.confirmed), dash(row.nonConfirmed), dash(row.pending),
      dash(row.onhand), dash(row.shortBy)])
    ;[5, 6, 7, 8, 9, 10].forEach(i => numCell(r, i, MT1))
    r.eachCell(c => { c.border = ALL_BORDERS })
  })
  if (dsk.rows.length) {
    ws4.autoFilter = { from: { row: ds4HeaderRow, column: 1 }, to: { row: ws4.lastRow.number, column: 10 } }
  }
  ws4.addRow([])
  const note4 = ws4.addRow([`On-hand (plant) is the WHOLE PLANT's stock of that size — produced minus invoiced. It is NOT reserved for anyone, so the same tonnage is repeated on every distributor's row waiting on that size, and it is deliberately NOT totalled anywhere on this sheet: adding the column up would report more stock than the plant holds. For the same reason "Short by" (Pending − On-hand, floored at zero) can read "-" on a row whose size several distributors are queued against — it says the plant has the tonnage, not that this distributor will get it. Rows are the live pairs only (Pending or Invoiced MTD above zero), sorted Region → Distributor → Pending. A distributor whose state carries no region mapping reads ${UNMAPPED_REGION}.`])
  ws4.mergeCells(`A${note4.number}:J${note4.number}`)
  note4.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  note4.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  ws4.getRow(note4.number).height = 62

  await downloadWorkbook(wb, `PB-MTD-Dashboard-${date}.xlsx`)
  return data
}

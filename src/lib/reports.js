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
import { producedPool, coilConsumption, skuSizeLabel } from './calc'

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
  const pool = producedPool(productions, dispatches)
  const buckets = {}
  ;(skus || [])
    .filter(s => String(s.status || '').toLowerCase() === 'published')
    .forEach(s => {
      const p = pool[s.skuCode] || { availablePieces: 0, availableWeight: 0 }
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
  return mod.default ?? mod
}

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

  const numCell = (row, idx, fmt) => { const c = row.getCell(idx); c.numFmt = fmt; c.alignment = { horizontal: 'right' } }

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

  const numCell = (row, idx, fmt) => { const c = row.getCell(idx); c.numFmt = fmt; c.alignment = { horizontal: 'right' } }
  const totalRow = (label, span, mt) => {
    const cells = Array(4).fill('')
    cells[0] = label
    cells[3] = mt
    const row = ws.addRow(cells)
    if (span > 1) ws.mergeCells(`A${row.number}:${String.fromCharCode(64 + span)}${row.number}`)
    row.font = { bold: true }
    numCell(row, 4, '0.000')
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
  totalRow('HR COIL TOTAL', 3, data.hrCoil.total)

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
  totalRow('STRIP TOTAL', 2, data.strip.total)

  const gt = ws.addRow(['GRAND TOTAL', '', '', data.grand])
  ws.mergeCells(`A${gt.number}:C${gt.number}`)
  gt.font = { bold: true, size: 12 }
  numCell(gt, 4, '0.000')
  gt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })

  await downloadWorkbook(wb, `raw-material-${date}.xlsx`)
}

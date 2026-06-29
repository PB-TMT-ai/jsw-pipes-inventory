// ═══════════════════════════════════════════════════════════════
// One-time historical importer — Pipes_and_TubesOperations_v3.xlsx → Supabase.
//
// Loads the "relevant tabs" (Coil Inward, Slitting, Production, SKU Master) into the
// Supabase tables that back the app. Bundle Formation, Dispatch and PO Master are OUT
// OF SCOPE (PO source is all #REF!).
//
// It REUSES the app's real `weightPerPieceFromSku` from src/lib/calc.js so per-piece weight
// matches the Production form. Per the locked decision, each production is attributed to the
// EXACT "Baby Coil ID" named in its row (preserve the sheet — no FIFO recompute); the baby
// coil is the consumed unit and its mother (looked up in baby_coils) rides along for costing.
//
// USAGE
//   node scripts/import-excel.mjs --dry-run     # parse + compute + stage JSON, print report, NO DB writes
//   node scripts/import-excel.mjs --write        # everything above, then upsert to Supabase
//
// INPUTS
//   .workspace/source.xlsx        the uploaded workbook (EXCEL_PATH overrides)
//   .workspace/extra-skus.json    OPTIONAL — user-provided specs for SKUs missing from the
//                                  SKU Master sheet. Array of objects, e.g.:
//                                  [{ "productType":"CHS", "skuCode":"CHS-20NB-2.80",
//                                     "description":"MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.8x6000",
//                                     "height":26.9,"breadth":26.9,"thickness":2.8,"length":6000,
//                                     "weightPerTube":4.123,"baseConversion":2900,"thicknessExtra":0,
//                                     "hsnCode":"7306","status":"published",
//                                     "mapsFrom":["MS CHS ... 20 NBx2.8x6000"] }]
//                                  `mapsFrom` (optional) lists extra sheet descriptions this SKU
//                                  should also resolve (use for the x6001/x6002 length typos).
//   .env.local                    SUPABASE creds for --write (VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY
//                                  or SUPABASE_URL/SUPABASE_ANON_KEY)
// ═══════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import * as XLSX from '@e965/xlsx'   // patched SheetJS mirror (replaces vulnerable xlsx@0.18.5)
import { weightPerPieceFromSku } from '../src/lib/calc.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const WS = path.join(ROOT, '.workspace')
const EXCEL = process.env.EXCEL_PATH || path.join(WS, 'source.xlsx')
const MODE = process.argv.includes('--write') ? 'write'
  : process.argv.includes('--sql') ? 'sql' : 'dry-run'
// --tables=baby_coils,productions limits the SQL to those sections (default: all four).
// --rebuild-productions prefixes `delete from productions;` (clean rebuild — productions are
// keyed by sheet row position, so a partial re-import after mid-sheet edits would duplicate).
const TABLES_ARG = (process.argv.find(a => a.startsWith('--tables=')) || '').slice('--tables='.length)
const TABLES = new Set(TABLES_ARG ? TABLES_ARG.split(',').map(s => s.trim()).filter(Boolean) : ['skus', 'coils', 'baby_coils', 'productions'])
const REBUILD_PRODUCTIONS = process.argv.includes('--rebuild-productions')

// ── tiny value helpers ──────────────────────────────────────────
const str = (v) => (v == null ? '' : String(v).trim())
const num = (v) => {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) ? n : null
}
const intNum = (v) => { const n = num(v); return n == null ? null : Math.round(n) }
// Excel serial (1899-12-30 epoch) → 'YYYY-MM-DD'. Handles Date objects and ISO strings too.
const isoDate = (v) => {
  if (v == null || v === '') return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000)
    return new Date(ms).toISOString().slice(0, 10)
  }
  const s = String(v).trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)            // ISO YYYY-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)      // Indian DD-MM-YYYY (day first)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}
const normDesc = (s) => str(s).replace(/\s+/g, ' ').toLowerCase()
// ── weight-per-tube from steel density. User-approved, and used ONLY to fill MISSING
// SKU-master weights (the app runtime still reads weightPerTube — the "no density in the
// app" rule stands). Reproduces the master's own method exactly (verified to ~1e-15):
//   ρ = 7850 kg/m³ ; SHS/RHS A = 2t(H+B) − 4t² ; CHS A = π·t·(OD − t) ;
//   weight(kg) = A(mm²) × L(mm) × 7.85e-6.
const RHO = 7.85e-6
function weightFromDensity({ productType, height, breadth, thickness, outsideDiameter, length = 6000 }) {
  const t = Number(thickness || 0), L = Number(length || 6000)
  if (t <= 0) return null
  const OD = Number(outsideDiameter || 0)
  let A
  if (String(productType || '').toUpperCase() === 'CHS' || OD > 0) {
    if (OD <= 0) return null
    A = Math.PI * t * (OD - t)                  // circular hollow section (annulus)
  } else {
    const H = Number(height || 0), B = Number(breadth || 0)
    if (H <= 0 || B <= 0) return null
    A = 2 * t * (H + B) - 4 * t * t             // square/rect hollow section (sharp corners)
  }
  return A * L * RHO
}
// deterministic uuid (v5-shaped) from a seed → idempotent re-runs
const detUuid = (seed) => {
  const h = createHash('sha1').update(seed).digest('hex').slice(0, 32).split('')
  h[12] = '5'; h[16] = '89ab'[parseInt(h[16], 16) % 4]
  const s = h.join('')
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`
}
// camelCase → snake_case, '' → null (mirrors src/lib/db.js toSnake; TOP-LEVEL ONLY so
// JSONB values like coil_allocations keep their camelCase inner keys).
const toSnake = (obj) => {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const sk = k.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase())
    out[sk] = v === '' ? null : v
  }
  return out
}

// ── read workbook as arrays-of-arrays (raw values, nulls for blanks) ──
// (the xlsx ESM build omits fs-based readFile; read the buffer ourselves)
const wb = XLSX.read(readFileSync(EXCEL), { type: 'buffer', cellDates: false })
const grid = (name) => {
  const ws = wb.Sheets[name]
  if (!ws) throw new Error(`Sheet not found: ${name}`)
  return XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: false })
}
const hasData = (row) => Array.isArray(row) && row.some((c) => c != null && String(c).trim() !== '')

// ════════════════════════════ SKU MASTER ════════════════════════════
// header row index 0; data from index 1. The sheet has a few descriptions that SHARE a
// sku_code (and one code repeated 3×); sku_code is UNIQUE in Postgres, so the insert list
// is deduped by code — but EVERY description still resolves (multiple descriptions can map
// to the same code/SKU), so production lookups never break.
function buildSkus() {
  const rows = grid('SKU Master').slice(1).filter(hasData)
  const byCode = new Map()       // skuCode → sku object (first occurrence)
  const order = []               // unique codes in sheet order
  const descToCode = []          // [normDesc, skuCode] for ALL rows
  for (const r of rows) {
    const desc = str(r[2])
    // a few rows (RHS 100x50…) have full specs but a BLANK code — synthesize the app's
    // TYPE-HxBxT.tt auto-code so they remain valid, unique SKUs that descriptions resolve to.
    let skuCode = str(r[1])
    if (!skuCode && desc && num(r[5]) != null) {
      skuCode = `${str(r[0])}-${num(r[3])}x${num(r[4])}x${Number(num(r[5])).toFixed(2)}`
    }
    if (!skuCode) continue
    if (!byCode.has(skuCode)) {
      order.push(skuCode)
      byCode.set(skuCode, {
        productType: str(r[0]), skuCode, description: desc,
        height: num(r[3]), breadth: num(r[4]), thickness: num(r[5]), length: num(r[6]) ?? 6000,
        nominalBore: str(r[7]), outsideDiameter: str(r[8]), hsnCode: str(r[9]),
        status: str(r[10]) || 'published', weightPerTube: num(r[11]),
        baseConversion: num(r[12]) ?? 2900, thicknessExtra: num(r[13]) ?? 0,
        ladderPrice: num(r[14]), totalConversion: num(r[15]),
      })
    }
    if (desc) descToCode.push([normDesc(desc), skuCode])
  }

  // merge user-provided specs for SKUs missing from the sheet (+ mapsFrom aliases)
  const extraPath = path.join(WS, 'extra-skus.json')
  const extraMaps = []
  if (existsSync(extraPath)) {
    for (const e of JSON.parse(readFileSync(extraPath, 'utf8'))) {
      const skuCode = str(e.skuCode)
      if (!skuCode) continue
      if (!byCode.has(skuCode)) {
        const length = num(e.length) ?? 6000
        const baseConversion = num(e.baseConversion) ?? 2900
        const thicknessExtra = num(e.thicknessExtra) ?? 0
        // fill weight from density when not supplied (the missing-SKU case)
        const weightPerTube = num(e.weightPerTube) ?? weightFromDensity({
          productType: e.productType, height: e.height, breadth: e.breadth,
          thickness: e.thickness, outsideDiameter: e.outsideDiameter, length,
        })
        const ladderPrice = num(e.ladderPrice) ?? (baseConversion + thicknessExtra)
        const totalConversion = num(e.totalConversion) ??
          (weightPerTube != null ? (weightPerTube / 1000) * ladderPrice : null)
        order.push(skuCode)
        byCode.set(skuCode, {
          productType: str(e.productType), skuCode, description: str(e.description),
          height: num(e.height), breadth: num(e.breadth), thickness: num(e.thickness),
          length, nominalBore: str(e.nominalBore), outsideDiameter: str(e.outsideDiameter),
          hsnCode: str(e.hsnCode) || '7306', status: str(e.status) || 'published',
          weightPerTube, baseConversion, thicknessExtra, ladderPrice, totalConversion,
        })
      }
      if (e.description) descToCode.push([normDesc(e.description), skuCode])
      for (const fd of (e.mapsFrom || [])) extraMaps.push([normDesc(fd), skuCode])
    }
  }

  // deterministic uuid PK keyed by sku_code — avoids colliding with any existing SKU-NNN
  // ids in the live table (upsert conflicts on sku_code, so id is never the match key).
  const skus = order.map((code) => ({ id: detUuid('sku:' + code), ...byCode.get(code) }))
  const skuByCode = new Map(skus.map((s) => [s.skuCode, s]))
  // description → SKU (every sheet description + extra aliases)
  const byDesc = new Map()
  for (const [d, code] of [...descToCode, ...extraMaps]) if (skuByCode.has(code)) byDesc.set(d, skuByCode.get(code))
  // length-typo fallback: index by description minus the trailing length token (…x6000),
  // but only where that key is UNAMBIGUOUS — lets …x6001/…x6002 resolve to the …x6000 SKU.
  const stripLen = (d) => d.replace(/x\d+(\.\d+)?$/, '')
  const cnt = new Map()
  for (const d of byDesc.keys()) { const k = stripLen(d); cnt.set(k, (cnt.get(k) || 0) + 1) }
  const byDescNoLen = new Map()
  for (const [d, s] of byDesc) { const k = stripLen(d); if (cnt.get(k) === 1) byDescNoLen.set(k, s) }
  return { skus, byDesc, byDescNoLen, stripLen }
}

// ════════════════════════════ COIL INWARD ════════════════════════════
// header row index 2; data from index 3. Cols: 0 date,1 no,2 id,3 batch,4 grade,5 heat,
// 6 thick,7 len,8 width,9 invWt,10 actWt,11 cost,12 po,13 supplySource(drop),14 status
function buildCoils() {
  const rows = grid('Coil Sheet at Plant').slice(3).filter(hasData)
  const coils = []
  let voided = 0
  for (const r of rows) {
    const hrCoilId = str(r[2])
    if (!hrCoilId) continue
    if (str(r[14]).toLowerCase() === 'void') { voided += 1; continue }   // exclude Void coils
    coils.push({
      id: detUuid('coil:' + hrCoilId),
      hrCoilNo: intNum(r[1]), hrCoilId,
      dateOfInward: isoDate(r[0]), inputCoilNumber: str(r[3]), coilGrade: str(r[4]),
      heatNumber: str(r[5]), thickness: num(r[6]), length: num(r[7]) ?? 0, width: num(r[8]),
      invoiceWeight: num(r[9]), actualWeight: num(r[10]), costPrice: num(r[11]),
      poNumber: str(r[12]), deleted: false,
    })
  }
  return { coils, voided }
}

// ════════════════════════════ SLITTING (baby coils) ════════════════════════════
// header row index 1; data from index 2. Cols: 0 date,1 mother,2 entry,3 babyId,
// 4 thick,5 len,6 width,7 weight(sheet — ignored, recomputed)
function buildBabyCoils(coilByMother) {
  const rows = grid('Coil to Slit').slice(2).filter(hasData)
  const seen = new Set()
  const babies = []
  let skipped = 0, dateFixed = 0
  for (const r of rows) {
    const babyCoilId = str(r[3])
    const hrCoilId = str(r[1])
    if (!babyCoilId || !hrCoilId || seen.has(babyCoilId)) { skipped += 1; continue }
    seen.add(babyCoilId)
    const mother = coilByMother.get(hrCoilId)
    // year-typo correction (confirmed): 2027 → 2026 (mother coils are all 2026)
    let dateOfConversion = isoDate(r[0])
    if (dateOfConversion && dateOfConversion.startsWith('2027-')) { dateOfConversion = '2026-' + dateOfConversion.slice(5); dateFixed += 1 }
    babies.push({
      id: detUuid('baby:' + babyCoilId),
      hrCoilId, babyCoilEntry: str(r[2]), babyCoilId,
      dateOfConversion,
      thickness: mother ? mother.thickness : num(r[4]),   // inherit from mother
      width: num(r[6]), length: num(r[5]) ?? 0,
      weight: 0, costPrice: 0,                              // recomputed below (proportional)
      poNumber: mother ? mother.poNumber : '',             // inherit from mother
      deleted: false,
      _hasMother: !!mother,
    })
  }
  // proportional weight & cost by width across each mother's babies (App.jsx:382-394)
  const byMother = new Map()
  for (const b of babies) { if (!byMother.has(b.hrCoilId)) byMother.set(b.hrCoilId, []); byMother.get(b.hrCoilId).push(b) }
  for (const [mid, sibs] of byMother) {
    const mother = coilByMother.get(mid)
    const total = sibs.reduce((s, b) => s + Number(b.width || 0), 0)
    if (!mother || total <= 0) continue
    for (const b of sibs) {
      const frac = Number(b.width || 0) / total
      b.weight = frac * Number(mother.actualWeight || 0)
      b.costPrice = frac * Number(mother.costPrice || 0)
    }
  }
  const orphans = babies.filter((b) => !b._hasMother).length
  babies.forEach((b) => delete b._hasMother)
  return { babies, skipped, orphans, dateFixed }
}

// ════════════════════════════ PRODUCTION (preserve the sheet's baby coil) ════════════════════════════
// header row index 1; data from index 2. Cols: 0 date,1 skuDesc,2 babyId,3 pieces,
// 4 fgPo,5 len,6 width,7 thick,8 theoW(ignore),9 wt/pc(ignore),10 status(ignore)
// Each production is attributed to EXACTLY the Baby Coil ID in its row (no FIFO, no spill);
// the baby coil is the consumed unit and its mother (looked up in baby_coils) rides along
// for costing. weight = pieces × (SKU weightPerTube/1000).
function buildProductions(skuByDesc, babies, skuByDescNoLen, stripLen) {
  const raw = grid('Slit to Tube Conversion').slice(2)
  const rows = raw.map((r, i) => ({ r, i })).filter((x) => hasData(x.r))
  const babyById = new Map(babies.map((b) => [b.babyCoilId, b]))

  // date correction (confirmed): the lone 2026-01-06 row is really 1 June 2026
  let dateFixed = 0
  const prodDate = (r) => { const d = isoDate(r[0]); return d === '2026-01-06' ? '2026-06-01' : d }

  const productions = []
  const unmatched = new Map()          // desc → count
  let seq = 0, lengthTypo = 0
  const statusCount = { allocated: 0, unallocated: 0 }

  for (const { r, i } of rows) {
    const desc = str(r[1])
    const pieces = intNum(r[3]) || 0
    const nd = normDesc(desc)
    let sku = skuByDesc.get(nd)
    if (!sku) { const m = skuByDescNoLen.get(stripLen(nd)); if (m) { sku = m; lengthTypo += 1 } }
    if (!sku) { unmatched.set(desc, (unmatched.get(desc) || 0) + 1); continue }   // blank/unknown SKU → skip

    const weightPerPiece = weightPerPieceFromSku(sku)
    const totalWeight = weightPerPiece * pieces
    // preserve the sheet's baby coil exactly; carry its mother (from baby_coils) for costing
    const babyCoilId = str(r[2])
    const baby = babyCoilId ? babyById.get(babyCoilId) : null
    const coilAllocations = baby
      ? [{ babyCoilId, hrCoilId: baby.hrCoilId, pieces, weight: totalWeight }]
      : []
    const status = baby ? 'allocated' : 'unallocated'
    statusCount[status] += 1
    if (isoDate(r[0]) === '2026-01-06') dateFixed += 1
    seq += 1
    productions.push({
      id: detUuid('prod:' + i),
      productionNo: seq, dateOfProduction: prodDate(r), skuCode: sku.skuCode,
      tubeCount: pieces, weightPerPiece, totalWeight,
      coilAllocations, status, deleted: false,
    })
  }
  return { productions, unmatched, statusCount, lengthTypo, dateFixed }
}

// ════════════════════════════ SQL EMIT (egress-blocked fallback) ════════════════════════════
// Emits idempotent INSERT … ON CONFLICT DO UPDATE so the load runs inside Supabase's SQL
// Editor (server-side) — no outbound network needed from this container.
const sqlStr = (s) => `'${String(s).replace(/'/g, "''")}'`
const sqlVal = (v) => {
  if (v === null || v === undefined || v === '') return 'NULL'
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL'
  if (Array.isArray(v) || typeof v === 'object') return `${sqlStr(JSON.stringify(v))}::jsonb`
  return sqlStr(v)
}
function buildInsertSql(table, rows, conflictCol, excludeUpdate = []) {
  if (!rows.length) return `-- ${table}: (no rows)\n\n`
  const recs = rows.map(toSnake)
  const cols = Object.keys(recs[0])
  const updCols = cols.filter((c) => c !== conflictCol && !excludeUpdate.includes(c))
  const CHUNK = 500
  let out = `-- ${table}: ${recs.length} rows\n`
  for (let i = 0; i < recs.length; i += CHUNK) {
    const batch = recs.slice(i, i + CHUNK)
    out += `insert into ${table} (${cols.join(', ')}) values\n`
    out += batch.map((r) => '  (' + cols.map((c) => sqlVal(r[c])).join(', ') + ')').join(',\n')
    out += `\non conflict (${conflictCol}) do update set\n  `
    out += updCols.map((c) => `${c} = excluded.${c}`).join(', ') + ';\n'
  }
  return out + '\n'
}
// Idempotent schema bootstrap (lifted verbatim from supabase-setup.sql) so this one file
// works even on a deployment that predates a table (e.g. `productions`). Every statement is a
// no-op when the object already exists. Runs inside the same transaction, before the inserts.
const SCHEMA_PREAMBLE = `-- ── schema bootstrap (idempotent; from supabase-setup.sql) ──
create table if not exists skus (
  id text primary key, product_type text, sku_code text unique, description text,
  height numeric, breadth numeric, thickness numeric, length numeric default 6000,
  nominal_bore text default '', outside_diameter text default '', hsn_code text,
  status text default 'published', weight_per_tube numeric, base_conversion numeric default 2900,
  thickness_extra numeric default 0, ladder_price numeric, total_conversion numeric,
  created_at timestamptz default now()
);
alter table skus add column if not exists weight_per_tube numeric;
alter table skus add column if not exists base_conversion numeric default 2900;
alter table skus add column if not exists thickness_extra numeric default 0;
alter table skus add column if not exists ladder_price numeric;
alter table skus add column if not exists total_conversion numeric;
create table if not exists coils (
  id uuid primary key default gen_random_uuid(), hr_coil_no integer, hr_coil_id text unique,
  date_of_inward date, input_coil_number text, coil_grade text, heat_number text,
  thickness numeric, width numeric, length numeric default 0, invoice_weight numeric,
  actual_weight numeric, cost_price numeric, po_number text, deleted boolean default false,
  created_at timestamptz default now()
);
create table if not exists baby_coils (
  id uuid primary key default gen_random_uuid(), hr_coil_id text, baby_coil_entry text,
  baby_coil_id text unique, date_of_conversion date, thickness numeric, width numeric,
  length numeric, weight numeric, cost_price numeric, po_number text,
  deleted boolean default false, created_at timestamptz default now()
);
create table if not exists productions (
  id uuid primary key default gen_random_uuid(), production_no integer, date_of_production date,
  sku_code text, tube_count integer, weight_per_piece numeric, total_weight numeric,
  coil_allocations jsonb default '[]', status text, deleted boolean default false,
  created_at timestamptz default now()
);
alter table skus enable row level security;
alter table coils enable row level security;
alter table baby_coils enable row level security;
alter table productions enable row level security;
drop policy if exists "Allow all access" on skus;
drop policy if exists "Allow all access" on coils;
drop policy if exists "Allow all access" on baby_coils;
drop policy if exists "Allow all access" on productions;
create policy "Allow all access" on skus for all using (true) with check (true);
create policy "Allow all access" on coils for all using (true) with check (true);
create policy "Allow all access" on baby_coils for all using (true) with check (true);
create policy "Allow all access" on productions for all using (true) with check (true);

`
function writeSqlFile(skus, coils, babies, productions) {
  const counts = { skus: skus.length, coils: coils.length, baby_coils: babies.length, productions: productions.length }
  const loads = [...TABLES].map(t => `${t}=${counts[t]}`).join(', ')
  const head =
    `-- ═══════════════════════════════════════════════════════════════\n` +
    `-- JSW Pipes & Tubes — data import (generated ${new Date().toISOString()})\n` +
    `-- Paste into Supabase → SQL Editor → Run. Idempotent (ON CONFLICT upsert); safe to re-run.\n` +
    `-- Loads: ${loads}${REBUILD_PRODUCTIONS && TABLES.has('productions') ? '  [productions table is REBUILT: delete + re-insert]' : ''}\n` +
    `-- (Bundle Formation, Dispatch, PO Master are intentionally NOT touched.)\n` +
    `-- ═══════════════════════════════════════════════════════════════\n\nbegin;\n\n`
  const section = {
    skus: () => buildInsertSql('skus', skus, 'sku_code', ['id']),
    coils: () => buildInsertSql('coils', coils, 'hr_coil_id', ['id']),
    baby_coils: () => buildInsertSql('baby_coils', babies, 'baby_coil_id', ['id']),
    productions: () => (REBUILD_PRODUCTIONS ? 'delete from productions;\n\n' : '') + buildInsertSql('productions', productions, 'id', []),
  }
  const body = ['skus', 'coils', 'baby_coils', 'productions']
    .filter(t => TABLES.has(t)).map(t => section[t]()).join('')
  const out = head + SCHEMA_PREAMBLE + body + 'commit;\n'
  const p = path.join(WS, 'jsw-import.sql')
  writeFileSync(p, out)
  return { path: p, bytes: Buffer.byteLength(out) }
}

// ════════════════════════════ SUPABASE WRITE ════════════════════════════
function loadEnv() {
  const f = path.join(ROOT, '.env.local')
  const env = { ...process.env }
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  return { url, key }
}

async function writeTable(supabase, table, rows, onConflict) {
  const snake = rows.map(toSnake)
  const CHUNK = 500
  let done = 0
  for (let i = 0; i < snake.length; i += CHUNK) {
    const batch = snake.slice(i, i + CHUNK)
    const { error } = await supabase.from(table).upsert(batch, { onConflict, defaultToNull: false })
    if (error) throw new Error(`upsert ${table} [${i}..]: ${error.message}`)
    done += batch.length
    process.stdout.write(`   ${table}: ${done}/${snake.length}\r`)
  }
  console.log(`   ${table}: ${done}/${snake.length} ✓            `)
}

// ════════════════════════════ MAIN ════════════════════════════
async function main() {
  console.log(`\n▶ Import mode: ${MODE}   source: ${EXCEL}\n`)

  const { skus, byDesc, byDescNoLen, stripLen } = buildSkus()
  const { coils, voided } = buildCoils()
  const coilByMother = new Map(coils.map((c) => [c.hrCoilId, c]))
  const { babies, skipped, orphans, dateFixed: babyDateFixed } = buildBabyCoils(coilByMother)
  const { productions, unmatched, statusCount, lengthTypo, dateFixed: prodDateFixed } =
    buildProductions(byDesc, babies, byDescNoLen, stripLen)

  // stage intermediate JSON for inspection
  writeFileSync(path.join(WS, 'skus.json'), JSON.stringify(skus, null, 2))
  writeFileSync(path.join(WS, 'coils.json'), JSON.stringify(coils, null, 2))
  writeFileSync(path.join(WS, 'baby_coils.json'), JSON.stringify(babies, null, 2))
  writeFileSync(path.join(WS, 'productions.json'), JSON.stringify(productions, null, 2))

  // report
  const sumW = (arr, k) => arr.reduce((s, x) => s + Number(x[k] || 0), 0)
  console.log('── PARSED ──────────────────────────────────────────')
  console.log(`SKUs            : ${skus.length}`)
  console.log(`Coils           : ${coils.length}   (excluded ${voided} Void)`)
  console.log(`Baby coils      : ${babies.length}   (skipped ${skipped} blank/dup, ${orphans} orphan-mother, ${babyDateFixed} date 2027→2026)`)
  console.log(`   mother actualWeight Σ = ${sumW(coils, 'actualWeight').toFixed(3)} T   baby weight Σ = ${sumW(babies, 'weight').toFixed(3)} T`)
  console.log(`Productions     : ${productions.length}   pieces Σ = ${productions.reduce((s, p) => s + p.tubeCount, 0)}   (${prodDateFixed} date 2026-01-06→2026-06-01)`)
  console.log(`   Allocation (sheet's baby coil): allocated=${statusCount.allocated}  unallocated=${statusCount.unallocated} (unallocated = blank baby cell in sheet)`)
  console.log(`   allocated weight Σ = ${sumW(productions, 'totalWeight').toFixed(3)} T`)
  const blankRows = unmatched.get('') || 0
  const realMissing = [...unmatched.entries()].filter(([d]) => d !== '').sort((a, b) => b[1] - a[1])
  if (realMissing.length) {
    const total = realMissing.reduce((s, [, n]) => s + n, 0)
    console.log(`\n⚠ UNMATCHED production SKUs (${total} rows, ${realMissing.length} descriptions) — provide via .workspace/extra-skus.json:`)
    for (const [d, n] of realMissing) console.log(`   ${String(n).padStart(3)} rows | ${d}`)
  } else {
    console.log(`\n✓ All named production SKUs resolved.`)
  }
  if (lengthTypo) console.log(`\nℹ ${lengthTypo} production rows matched via length-typo fallback (…x6001/…x6002 → …x6000).`)
  if (blankRows) console.log(`ℹ ${blankRows} production rows have a BLANK SKU (incomplete sheet rows) — skipped.`)
  console.log(`\nStaged JSON → .workspace/{skus,coils,baby_coils,productions}.json`)

  if (MODE === 'sql') {
    const { path: p, bytes } = writeSqlFile(skus, coils, babies, productions)
    console.log(`\n✓ SQL written → ${p}  (${(bytes / 1024).toFixed(0)} KB)`)
    console.log('  Run it in Supabase → SQL Editor (idempotent upsert).\n')
    return
  }
  if (MODE !== 'write') { console.log('\n(dry-run — no database writes)\n'); return }

  const { url, key } = loadEnv()
  if (!url || !key) { console.error('\nx Missing Supabase creds in .env.local (need VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY)\n'); process.exit(1) }
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key, { auth: { persistSession: false } })

  // safety: warn if pipeline tables already populated
  for (const t of ['coils', 'baby_coils', 'productions']) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
    if (count) console.log(`   note: table "${t}" already has ${count} rows (upsert may update/extend).`)
  }

  console.log('\n── WRITING (skus → coils → baby_coils → productions) ──')
  await writeTable(supabase, 'skus', skus, 'sku_code')
  await writeTable(supabase, 'coils', coils, 'hr_coil_id')
  await writeTable(supabase, 'baby_coils', babies, 'baby_coil_id')
  await writeTable(supabase, 'productions', productions, 'id')

  // verify counts back
  console.log('\n── VERIFY (live row counts) ──')
  for (const t of ['skus', 'coils', 'baby_coils', 'productions']) {
    const { count } = await supabase.from(t).select('*', { count: 'exact', head: true })
    console.log(`   ${t}: ${count}`)
  }
  console.log('\n✓ Done.\n')
}

main().catch((e) => { console.error('\n✘ Import failed:', e.message, '\n'); process.exit(1) })

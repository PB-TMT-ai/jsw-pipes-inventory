// ── SKU Ageing, plant-wise — the Reports tab's "SKU Ageing by Plant" workbook, built from live data ──
//
// Same builder as the button (buildPlantSkuAgeingWorkbook in src/lib/reports.js), same inputs the
// app hands it: productions are live-weight-resolved against the SKU master (resolveProductionWeights,
// exactly as App.jsx does), so the tonnage here ties to the app's FG Left Inventory.
// Read-only: GETs against PostgREST, nothing is written back.
//
// Usage:
//   node scripts/sku-ageing-plantwise.mjs [--date YYYY-MM-DD] [--url URL] [--key ANON_KEY] [--out DIR]
//   Credentials: --url/--key, else VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY from env or .env.local.
//   Writes <out>/sku-ageing-plantwise-<date>.xlsx (default out: reports/) and prints the Summary.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { resolveProductionWeights } from '../src/lib/calc.js'
import { buildPlantSkuAgeingWorkbook } from '../src/lib/reports.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const flag = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined }
const die = (msg) => { console.error(msg); process.exit(1) }

function loadEnv() {
  const env = { ...process.env }
  for (const f of ['.env.local', '.env'].map(n => path.join(ROOT, n)).filter(existsSync)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && !(m[1] in env)) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
  return { url: flag('url') || env.VITE_SUPABASE_URL || env.SUPABASE_URL, key: flag('key') || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY }
}

const camel = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const toCamel = (row) => Object.fromEntries(Object.entries(row).map(([k, v]) => [camel(k), v]))

async function fetchAll(url, key, table, select, { optional = false } = {}) {
  const PAGE = 1000, rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.asc,id.asc`
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}` } })
    if (res.status === 404 && optional) return null
    if (!res.ok) die(`fetch ${table} failed: ${res.status} ${res.statusText} — ${(await res.text()).slice(0, 300)}`)
    const page = await res.json()
    rows.push(...page.map(toCamel))
    if (page.length < PAGE) break
  }
  return rows
}

const { url, key } = loadEnv()
if (!url || !key) die('Missing Supabase credentials. Pass --url/--key or set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (.env.local).')
const base = url.replace(/\/+$/, '')
const [skus, productions, dispatches, babyCoils, plants] = await Promise.all([
  fetchAll(base, key, 'skus', 'id,deleted,created_at,sku_code,description,product_type,height,breadth,nominal_bore,outside_diameter,thickness,length,weight_per_tube,status'),
  fetchAll(base, key, 'productions', 'id,deleted,created_at,date_of_production,sku_code,tube_count,total_weight,coil_allocations,plant'),
  fetchAll(base, key, 'dispatches', 'id,deleted,created_at,date_of_dispatch,bundle_entries'),
  fetchAll(base, key, 'baby_coils', 'id,created_at,baby_coil_id,hr_coil_id', { optional: true }),
  fetchAll(base, key, 'plants', 'id,created_at,plant_id,serves,deleted', { optional: true }),
])
const liveSkus = skus.filter(s => !s.deleted)
const resolved = resolveProductionWeights(productions, liveSkus, babyCoils || [])
const date = flag('date') || new Date().toISOString().slice(0, 10)

const { wb, data, filename } = await buildPlantSkuAgeingWorkbook(liveSkus, resolved, dispatches, { date, plants })
const outDir = path.resolve(flag('out') || path.join(ROOT, 'reports'))
mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, filename)
writeFileSync(outFile, Buffer.from(await wb.xlsx.writeBuffer()))

const f = (v, d = 1) => (v == null ? '—' : Number(v).toFixed(d))
console.error(`rows: ${skus.length} skus, ${productions.length} productions, ${dispatches.length} dispatches`)
console.log(`SKU ageing by plant — as on ${date}`)
console.log('Plant          On-hand   0-30  31-60  61-90    90+  AvgAge  Oldest  SKUs  DispW/oProd')
for (const p of [...data.plants, { name: 'TOTAL', total: data.grand, unmatchedMt: data.plants.reduce((t, x) => t + x.unmatchedMt, 0) }]) {
  const t = p.total, b = t.buckets
  console.log(`${p.name.padEnd(13)} ${f(t.onhandMt).padStart(8)} ${f(b.d0_30).padStart(6)} ${f(b.d31_60).padStart(6)} ${f(b.d61_90).padStart(6)} ${f(b.d90plus).padStart(6)} ${f(t.avgAgeDays, 0).padStart(7)} ${f(t.oldestAgeDays, 0).padStart(7)} ${String(t.skuCount).padStart(5)} ${f(p.unmatchedMt).padStart(12)}`)
}
console.log(`\nWrote ${path.relative(ROOT, outFile)}`)

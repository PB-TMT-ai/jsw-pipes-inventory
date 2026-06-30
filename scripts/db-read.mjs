#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// db-read.mjs — READ-ONLY Supabase reader (GET only; NEVER mutates).
//
// Lets this dev session read the live pipeline data via Supabase's REST API
// (PostgREST) using the project's public anon key. By construction it only ever
// issues GET requests, so it cannot insert/update/delete anything.
//
// Usage:
//   node scripts/db-read.mjs <table> [--limit N] [--csv] [--stdout]
//   node scripts/db-read.mjs orders --limit 5 --stdout
//
// Reads VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY from env or .env.local.
// Writes JSON (or CSV) to .workspace/db/<table>.{json,csv} (gitignored).
// ═══════════════════════════════════════════════════════════════
import { readFileSync, mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const TABLES = ['coils', 'baby_coils', 'productions', 'dispatches', 'orders', 'skus', 'purchase_orders']

// Load env from process.env, with .env.local as fallback (no dependency).
export function loadEnv() {
  const env = { ...process.env }
  const f = path.join(ROOT, '.env.local')
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/)
      if (m && (env[m[1]] === undefined || env[m[1]] === '')) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

export function resolveCreds(env = loadEnv()) {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing Supabase creds. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local or the environment.')
  }
  return { url: url.replace(/\/$/, ''), key }
}

// Route through the environment's outbound HTTPS proxy when present (undici is
// bundled with Node ≥18). Returns undefined when no proxy is configured.
export async function getProxyDispatcher(env = process.env) {
  const proxy = env.HTTPS_PROXY || env.https_proxy
  if (!proxy) return undefined
  try {
    const { ProxyAgent } = await import('undici')
    return new ProxyAgent(proxy)
  } catch {
    return undefined
  }
}

// GET rows for one table. Paginates with limit/offset (PostgREST caps page size).
export async function readTable({ url, key, table, limit = null, csv = false, dispatcher }) {
  const base = `${url}/rest/v1/${encodeURIComponent(table)}`
  const headers = { apikey: key, Authorization: `Bearer ${key}`, Accept: csv ? 'text/csv' : 'application/json' }
  const opts = dispatcher ? { method: 'GET', headers, dispatcher } : { method: 'GET', headers }

  if (csv) {
    const u = `${base}?select=*${limit ? `&limit=${limit}` : ''}`
    const res = await fetch(u, opts)
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`)
    return await res.text()
  }

  const PAGE = 1000
  let offset = 0
  let out = []
  for (;;) {
    const want = limit ? Math.min(PAGE, limit - out.length) : PAGE
    if (want <= 0) break
    const u = `${base}?select=*&limit=${want}&offset=${offset}`
    const res = await fetch(u, opts)
    if (!res.ok) throw new Error(`${res.status} ${(await res.text()).slice(0, 300)}`)
    const rows = await res.json()
    out = out.concat(rows)
    if (rows.length < want) break
    offset += rows.length
    if (limit && out.length >= limit) break
  }
  return out
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const out = { table: null, limit: null, csv: false, stdout: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    if (a === '--csv') out.csv = true
    else if (a === '--stdout') out.stdout = true
    else if (a.startsWith('--limit=')) out.limit = Number(a.split('=')[1])
    else if (a === '--limit') out.limit = Number(args[++i])
    else if (!a.startsWith('--') && !out.table) out.table = a
  }
  return out
}

async function main() {
  const { table, limit, csv, stdout } = parseArgs(process.argv)
  if (!table) {
    console.error('Usage: node scripts/db-read.mjs <table> [--limit N] [--csv] [--stdout]')
    console.error('Tables:', TABLES.join(', '))
    process.exit(1)
  }
  const { url, key } = resolveCreds()
  const dispatcher = await getProxyDispatcher()
  const data = await readTable({ url, key, table, limit, csv, dispatcher })

  const outDir = path.join(ROOT, '.workspace', 'db')
  mkdirSync(outDir, { recursive: true })
  const ext = csv ? 'csv' : 'json'
  const outFile = path.join(outDir, `${table}.${ext}`)
  const body = csv ? data : JSON.stringify(data, null, 2)
  writeFileSync(outFile, body)
  const count = csv ? (data.split('\n').filter(Boolean).length - 1) : data.length
  console.log(`${table}: ${count} row(s) → ${path.relative(ROOT, outFile)}`)
  if (stdout) console.log(body)
}

// Run as CLI only when invoked directly (db-snapshot.mjs imports the helpers).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })
}

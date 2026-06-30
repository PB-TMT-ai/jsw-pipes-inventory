#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════
// db-snapshot.mjs — pull ALL pipeline tables at once (READ-ONLY) into
// .workspace/db/<table>.json for offline analysis with src/lib/calc.js.
// Reuses the GET-only reader in db-read.mjs.
//
// Usage: node scripts/db-snapshot.mjs
// ═══════════════════════════════════════════════════════════════
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT, TABLES, resolveCreds, getProxyDispatcher, readTable } from './db-read.mjs'

async function main() {
  const { url, key } = resolveCreds()
  const dispatcher = await getProxyDispatcher()
  const outDir = path.join(ROOT, '.workspace', 'db')
  mkdirSync(outDir, { recursive: true })

  const summary = {}
  for (const table of TABLES) {
    try {
      const rows = await readTable({ url, key, table, dispatcher })
      writeFileSync(path.join(outDir, `${table}.json`), JSON.stringify(rows, null, 2))
      summary[table] = rows.length
      console.log(`✓ ${table}: ${rows.length} rows`)
    } catch (e) {
      summary[table] = `ERROR: ${e.message}`
      console.error(`✗ ${table}: ${e.message}`)
    }
  }
  writeFileSync(path.join(outDir, '_snapshot.json'), JSON.stringify({ at: new Date().toISOString(), summary }, null, 2))
  console.log(`\nSnapshot → ${path.relative(ROOT, outDir)}/`)
}

main().catch((e) => { console.error('ERROR:', e.message); process.exit(1) })

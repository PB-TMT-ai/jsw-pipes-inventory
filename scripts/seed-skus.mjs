// scripts/seed-skus.mjs
//
// One-shot, idempotent, NON-destructive seed of the Supabase `skus` table from the
// app's canonical 232-entry catalog (src/data/skus.js → DEFAULT_SKUS).
//
// Why this exists:
//   The app shows SKUs from the client-side DEFAULT_SKUS *fallback* (used when the
//   `skus` table returns 0 rows — see src/lib/db.js). That fallback is read-only and
//   is never written back, so a fresh Supabase project keeps an empty `skus` table.
//   This script uploads the catalog so the table becomes the source of truth.
//
// It touches ONLY the `skus` table — coils / baby_coils / tubes / bundles / dispatches
// are never referenced. Safe to re-run (upsert on primary key `id`).
//
// Usage (run locally — needs network access to your Supabase project):
//   1. Put real creds in .env.local:  VITE_SUPABASE_URL=...  VITE_SUPABASE_ANON_KEY=...
//   2. npm run seed:skus
//   (If your creds live in .env instead of .env.local:
//        node --env-file=.env scripts/seed-skus.mjs )
//   Add --dry-run to validate the mapping without writing anything.

import { createClient } from '@supabase/supabase-js'
import DEFAULT_SKUS from '../src/data/skus.js'

const DRY_RUN = process.argv.includes('--dry-run')
const EXPECTED = 232
const CHUNK = 500

// camelCase → snake_case. Canonical copy lives in src/lib/db.js (toSnake); keep in sync.
// The empty-string → null rule is load-bearing: SHS/RHS rows have nominalBore:'' and
// outsideDiameter:'' which Postgres rejects on non-text/typed columns.
function toSnake(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    out[snakeKey] = v === '' ? null : v
  }
  return out
}

const rows = DEFAULT_SKUS.map(toSnake)

console.log(`Preparing to seed ${rows.length} SKUs into "skus"${DRY_RUN ? ' (dry run)' : ''}...`)
if (rows.length !== EXPECTED) {
  console.warn(`⚠ Expected ${EXPECTED} SKUs but found ${rows.length} — proceeding anyway.`)
}

if (DRY_RUN) {
  console.log('Sample mapped row (snake_case):')
  console.log(JSON.stringify(rows[0], null, 2))
  console.log(`✓ Dry run OK — ${rows.length} rows would be upserted. No writes performed.`)
  process.exit(0)
}

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_ANON_KEY
if (!url || !key) {
  console.error('✗ Missing Supabase credentials.')
  console.error('  Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local')
  console.error('  (same values the app uses), then re-run: npm run seed:skus')
  process.exit(1)
}

const supabase = createClient(url, key)

let upserted = 0
for (let i = 0; i < rows.length; i += CHUNK) {
  const batch = rows.slice(i, i + CHUNK)
  const { error } = await supabase
    .from('skus')
    .upsert(batch, { onConflict: 'id', ignoreDuplicates: false })

  if (error) {
    console.error(`✗ Upsert failed on batch starting at row ${i}:`)
    console.error(`  message: ${error.message}`)
    if (error.details) console.error(`  details: ${error.details}`)
    if (error.hint) console.error(`  hint:    ${error.hint}`)
    if (error.code) console.error(`  code:    ${error.code}`)
    console.error('  sample row:', JSON.stringify(batch[0]))
    if (error.code === '23505' && /sku_code/.test(`${error.message} ${error.details || ''}`)) {
      console.error(
        '\n  This is a sku_code UNIQUE violation: the table already has rows with the same\n' +
        '  sku_code but a different id (likely the 8-row seed from supabase-setup.sql).\n' +
        '  Clear just those conflicting sku_code rows in Supabase, then re-run. This does\n' +
        '  NOT require touching any pipeline tables.'
      )
    }
    process.exit(1)
  }
  upserted += batch.length
}

console.log(`✓ Upserted ${upserted} SKUs into "skus". Re-open the app — SKUs now load from Supabase.`)
process.exit(0)

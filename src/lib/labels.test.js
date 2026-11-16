// Guard: one name per domain concept on every screen and workbook (CONTEXT.md is the glossary).
// Each retired label below printed the same figure under a second name. The test reads the source
// of the user-facing files, drops comments, and fails if a retired label is still printed anywhere.
// Labels only — no figure changes with them. Code names (babyCoilId, physicalInventory, …) are
// identifiers, not labels, and are not matched.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8')

// Drop /* … */ blocks (JSX {/* … */} too) and whole-line // comments; labels live in what is left.
const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n')

// retired → the one name that replaced it
export const RETIRED = {
  'FG Left Inventory': 'Current inventory', 'Physical Inventory': 'Current inventory', 'Total FG': 'Current inventory',
  "'Inventory (T)'": 'Current inventory (T)', 'Finished Pipe Stock': 'Current inventory', 'NET FINISHED STOCK': 'NET CURRENT INVENTORY',
  'Produced Inv': 'Current inventory', 'FG on hand': 'current inventory', 'MT on hand': 'current inventory', 'On-hand MT': 'Current inventory MT',
  'MTD Invoice': 'Invoiced MTD', 'Invoiced Orders MTD': 'Invoiced MTD', 'Sold 30d': 'Invoiced 30d',
  'Full Coil Left': 'HR coil (unslit)', "'Full Coil'": 'HR coil (unslit)', 'RM — Full Coil': 'RM — HR coil (unslit)', 'HR COIL STOCK': 'HR COIL (UNSLIT)', "'Coil Stock'": 'HR coil (unslit)',
  'Slit Coils Left': 'Slit coil stock', 'Slit Stock': 'Slit coil stock',
  'SKU cover': 'FG days of cover', 'Cover d<': 'Days of cover', 'days cover': 'days of cover',
  "'Customer'": 'Distributor', 'Customer Orders': 'Distributor Orders',
  'Ageing (days)': 'Age (days)', 'FG age (d)': 'Age (d)', 'Days since slit': 'Age (d)', 'Inventory Ageing': 'Avg age (d)',
  'Wtd Avg Age': 'Avg age (d)', "'Ageing ": 'Age', 'SKU Ageing': 'Age by SKU', 'FG ageing': 'FG age',
  'RM Consumed': 'Used by production',
}

const FILES = ['../App.jsx', './reports.js', './calc.js']

describe('one name per concept — retired labels are not printed (CONTEXT.md)', () => {
  for (const f of FILES) {
    it(`${f} prints no retired label`, () => {
      const src = code(read(f))
      const found = Object.keys(RETIRED).filter(k => src.includes(k)).map(k => `${k} → use "${RETIRED[k]}"`)
      expect(found).toEqual([])
    })
  }
  it('keeps the ERP column it reads: "Customer Name" is an input header, not a label', () => {
    expect(read('./calc.js')).toContain('Customer Name')
  })
})

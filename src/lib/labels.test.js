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
  '>Sales rate</th>': 'FM / MM / SM',
  // The Sales tab's FM / MM / SM sub-tab (#384; UI-PATTERNS "Words, standard only"). "ABC" and "run rate"
  // cannot be listed: ABC is 2g's own 90-day class and "Daily Run Rate Required" is the MTD figure.
  'Movement class': 'FM / MM / SM', 'movement class': 'FM / MM / SM', '>Moves<': 'FM / MM / SM', "'Moves'": 'FM / MM / SM',
  'Monthly run rate': 'Blended monthly rate', 'Hidden SKUs': 'SKUs not shown in the grid',
  // #379, the Status key tab: stock with no sales is "No use", the key's boxes are the "Status key".
  'Dead stock': 'No use', 'Status boxes': 'Status key',
  // #381, By FM / MM / SM tab
  '>Untagged<': 'Not tagged / Outside the plan', "'Untagged'": 'Not tagged / Outside the plan', 'All metrics': 'All measures',
  // #382, Raw material on the sub-tab ("Coil shortfall" stays: it is Planning's own figure)
  'RM gap': 'Raw material required', 'Coil share': 'Raw material available',
  // Whole book: the user chose Total Orders (Nov-2026). Planning's typed Monthly Indent is a different figure and keeps its name.
  'INDENT (MT)': 'TOTAL ORDERS (MT)', "'Indent (MT)'": 'Total Orders (MT)', 'Invoiced ÷ Indent': 'Invoiced ÷ Total Orders', "label: 'Indent'": 'Total Orders', "'Pending to Serve', 'Indent'": 'Total Orders',
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

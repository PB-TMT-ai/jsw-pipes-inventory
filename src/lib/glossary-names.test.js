// ── Glossary guard: one name per figure (ADR-0017) ───────────────────────────────────────────────
// "Pending to Dispatch" once meant 855 T on the Dashboard and 106 T on the phone, on the same day.
// The names below were retired so that cannot happen again. This test reads the files a reader sees
// the words from — the screens, the workbook builder, the daily scripts and the report skills'
// templates — and fails if a retired name comes back. Code comments are skipped: a comment may quote
// an old name to explain history. Code identifiers (`pendingToDispatch`, `freeStock`) are legacy
// names the glossary allows and are not checked.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const SURFACES = [
  'src/App.jsx',
  'src/lib/reports.js',
  'src/lib/calc.js',
  'scripts/daily-splits.mjs',
  'scripts/servable-orders.mjs',
  'scripts/servable-by-plant.mjs',
  '.claude/skills/pb-mtd-report/SKILL.md',
  '.claude/skills/daily-report-pt-whatsapp/SKILL.md',
  '.claude/skills/servable-orders-whatsapp/SKILL.md',
]

// Lines a reader can see: drop `//` comment lines and `/* … */` / `{/* … */}` blocks in code files.
function visibleLines(file) {
  const text = readFileSync(path.join(ROOT, file), 'utf8')
  const lines = text.split('\n').map((t, i) => ({ n: i + 1, t }))
  if (file.endsWith('.md')) return lines
  let inBlock = false
  return lines.filter(({ t }) => {
    const s = t.trim()
    if (inBlock) { if (s.includes('*/')) inBlock = false; return false }
    if (s.startsWith('/*') || s.startsWith('{/*')) { if (!s.includes('*/')) inBlock = true; return false }
    return !s.startsWith('//') && !s.startsWith('*')
  })
}

const hits = (re) => SURFACES.flatMap(f => visibleLines(f).filter(l => re.test(l.t)).map(l => `${f}:${l.n}`))

describe('glossary guard — retired names stay retired (ADR-0017)', () => {
  it.each([
    ['Pending to Serve', /pending to serve/i],                        // the wide book is Pending to Dispatch
    ['PENDING TO DISPATCH card on the stock-backed figure', /PENDING TO DISPATCH \(MT\)/],
    ['Confirmed Pending Invoice', /Confirmed Pending Invoice|Confirmed Orders Pending to be Invoiced|Confirmed \(pending invoice\)/],
    ['Non-Confirmed Orders', /Non-Confirmed Orders/],
    ['Free Stock (the figure is Free Inventory)', /Free Stock/],
    ['bare "Indent typed" on the planning screen', /'Indent typed'/],
    // #384, the Sales tab's FM / MM / SM sub-tab: the tag is FM / MM / SM, and a SKU the grid has no
    // cell for is "not shown", never "hidden" (roles.spec bans that word on screen).
    ['movement class (the tag is FM / MM / SM)', /movement class/i],
    ['a bare "Moves" label (the tag is FM / MM / SM)', /['">]Moves['"<]/],
    ['hidden SKUs (say "SKUs not shown in the grid")', /hidden SKUs|SKUs hidden/i],
    // #379, the Status key tab: stock with no sales is "No use" on every screen.
    ['dead stock (say "No use")', /dead stock/i],
    // #381, the By FM / MM / SM tab: the remainder section is "Not tagged / Outside the plan", never a bare
    // "Untagged"; the five-figure chip is "All measures", never "All metrics".
    ['a bare "Untagged" label (say "Not tagged / Outside the plan")', /['">]Untagged\b/],
    ['All metrics (the chip is "All measures")', /All metrics/i],
  ])('%s appears on no surface', (_name, re) => {
    expect(hits(re)).toEqual([])
  })

  it('the FM / MM / SM sub-tab’s words are printed — its guards are not passing on an empty sweep (#384)', () => {
    for (const re of [/Blended monthly rate/, /FG days of cover/, /Current inventory/, /SKUs not shown in the grid/, /Not tagged \/ Outside the plan/,
      /'All measures'/, /Status key/, /No use/]) {                                                    // #381's chip
      expect(hits(re).length).toBeGreaterThan(0)
    }
  })

  it('"Pending to Dispatch" is never defined as the stock-backed figure', () => {
    // Confirmed + Servable – Unconfirmed is Dispatchable from Inventory. Pending to Dispatch is
    // Confirmed + Non-confirmed. A line that equates the first name with the second formula is the
    // exact collision this file exists to stop.
    expect(hits(/Pending to Dispatch\*{0,2}\s*=\s*Confirmed \+ Servable/)).toEqual([])
  })

  it('both figures are still named somewhere — the guard is not passing on an empty sweep', () => {
    expect(hits(/Pending to Dispatch/).length).toBeGreaterThan(5)
    expect(hits(/Dispatchable from Inventory/i).length).toBeGreaterThan(5)
  })
})

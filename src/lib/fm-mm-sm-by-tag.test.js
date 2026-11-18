// Sales tab FM / MM / SM sub-tab, By FM / MM / SM tab (ticket #381): a region's grid split into four
// sections by tag — FM, MM, SM, No sales — plus the Not tagged / Outside the plan section, so the sections
// add up to the region's whole grid. The rows are the INVENTED fixture of #383
// (src/lib/__fixtures__/fm-mm-sm-join-invented.json); the frozen 16-Nov-2026 live fixture is not built (it
// needs the live database), so the live counts South 47 / 32 / 38 / 128 and West 24 / 17 / 22 / 177 are
// NOT checked here.
import { describe, it, expect } from 'vitest'
import fixture from './__fixtures__/fm-mm-sm-join-invented.json'
import { fmMmSmRows, fmMmSmJoin, fmMmSmCut, fmMmSmTagSections, salesSizeLines, salesSizePivot, canonicalSkuKey,
  FM_MM_SM_SECTIONS, FM_MM_SM_OUTSIDE } from './calc'

const { stored, skus, productions, dispatches, today } = fixture
const feed = { productions, dispatches, skus, stored, today }
const keyOfCode = Object.fromEntries(skus.map(s => [s.skuCode, canonicalSkuKey(s)]))
const distRows = ['South', 'West'].map(region => ({
  region,
  skuRows: fixture.pending.filter(p => p.region === region).map(p => ({
    id: keyOfCode[p.skuCode], skuCode: p.skuCode, description: '',
    confirmed: p.confirmed, nonConfirmed: p.nonConfirmed, pending: p.confirmed + p.nonConfirmed,
  })),
}))
const gridOf = (region) => salesSizeLines({ distRows: distRows.filter(r => r.region === region), productions, dispatches, skus,
  from: '2026-11-01', to: today, today, stockRegions: [region] })
const run = (region, over = {}) => {
  const rows = fmMmSmRows({ ...feed, region, ...over })
  const grid = gridOf(region)
  const join = fmMmSmJoin(rows, grid.lines)
  return { rows, grid, join, sections: fmMmSmTagSections({ rows, join, lines: grid.lines, required: grid.required }) }
}
const byKey = (sections) => Object.fromEntries(sections.map(s => [s.key, s]))
const cellKeys = (s) => [...new Set(s.lines.map(l => `${l.section}|${l.size}|${l.stdThickness ?? ''}`))].sort()

describe('fmMmSmTagSections — the region grid split by tag', () => {
  it('is FM, MM, SM, No sales, then Not tagged / Outside the plan, in that order', () => {
    expect(FM_MM_SM_SECTIONS).toEqual(['FM', 'MM', 'SM', 'No sales'])
    expect(FM_MM_SM_OUTSIDE).toBe('Not tagged / Outside the plan')
    expect(run('South').sections.map(s => s.label)).toEqual(['FM', 'MM', 'SM', 'No sales', 'Not tagged / Outside the plan'])
  })

  it('files each cell under the tag of the SKU on it; a cell with no SKU of the plan goes to Not tagged / Outside the plan', () => {
    const s = byKey(run('South').sections)
    expect(cellKeys(s.FM)).toContain('SHS|50x50|3')
    expect(cellKeys(s.MM)).toContain('SHS|91.5x91.5|3')
    // stock and no sales (No use), and orders with no sales: both No sales
    expect(cellKeys(s['No sales'])).toEqual(expect.arrayContaining(['SHS|65x65|2', 'SHS|70x70|3', 'CHS|40 NB|3']))
    expect(cellKeys(s.outside)).toEqual(expect.arrayContaining(['SHS|77x77|2', 'CHS|150 NB|4']))
  })

  it('within a region each SKU on the grid appears in exactly one section, and each cell in exactly one', () => {
    ;['South', 'West'].forEach(region => {
      const { join, sections } = run(region)
      const landed = Object.values(join.landed).flat().map(r => r.id).sort()
      const listed = sections.flatMap(s => s.skus.map(r => r.id)).sort()
      expect(listed).toEqual(landed)
      const cells = sections.flatMap(cellKeys)
      expect(new Set(cells).size).toBe(cells.length)
    })
  })

  it('the section totals sum to the region’s whole grid — tagged plus the Not tagged / Outside the plan row', () => {
    ;['South', 'West'].forEach(region => {
      const { grid, join, sections } = run(region)
      const whole = salesSizePivot(grid.lines, grid.required).total.total
      ;['closing', 'dispatch', 'pending', 'required'].forEach(k => {
        const sum = sections.reduce((t, s) => t + s.totals[k], 0)
        expect(sum).toBeCloseTo(whole[k], 6)
        // and each section's total is its own grid's Total row
        sections.forEach(s => expect(salesSizePivot(s.lines, grid.required).total.total[k]).toBeCloseTo(s.totals[k], 6))
      })
      ;['closing', 'dispatch', 'pending'].forEach(k => {
        expect(sections.filter(s => s.key !== 'outside').reduce((t, s) => t + s.totals[k], 0)).toBeCloseTo(join.totals.tagged[k], 6)
        expect(byKey(sections).outside.totals[k]).toBeCloseTo(join.totals.untagged[k], 6)
      })
    })
    // the invented South grid, worked by hand (fm-mm-sm-join.test.js): closing 164, dispatch 10, pending 25 + 12 + 8 = 45
    const south = run('South').sections.reduce((t, s) => ({ closing: t.closing + s.totals.closing, pending: t.pending + s.totals.pending }), { closing: 0, pending: 0 })
    expect(south.closing).toBeCloseTo(164); expect(south.pending).toBeCloseTo(45)
    // the two untagged South cells are 9 T (77x77, a size outside the plan) and 25 T (the 150NB 4.0 tube)
    expect(byKey(run('South').sections).outside.totals.closing).toBeCloseTo(34)
  })

  it('counts every SKU of the region under its tag — on the grid or not — so the four counts are the card’s', () => {
    ;['South', 'West'].forEach(region => {
      const { rows, sections } = run(region)
      const counts = Object.fromEntries(sections.map(s => [s.key, s.count]))
      FM_MM_SM_SECTIONS.forEach(t => expect(counts[t]).toBe(rows.filter(r => r.tag === t).length))
      expect(counts.outside).toBe(0)
      FM_MM_SM_SECTIONS.forEach(t => expect(byKey(sections)[t].count).toBe(byKey(sections)[t].skus.length + byKey(sections)[t].notShown))
    })
  })

  it('the No sales section shows no days and no rate, but keeps its orders and its Production required', () => {
    const s = byKey(run('South').sections)
    expect(s['No sales']).toMatchObject({ days: false, rate: false })
    ;['FM', 'MM', 'SM', 'outside'].forEach(k => expect(s[k]).toMatchObject({ days: true, rate: true }))
    // 70x70 2.8 has orders only (South's invented pending) — they are on the No sales section's grid
    expect(s['No sales'].totals.pending).toBeGreaterThan(0)
    expect(s['No sales'].totals.required).toBeGreaterThan(0)
    expect(s['No sales'].totals.required).toBeCloseTo(salesSizePivot(s['No sales'].lines, gridOf('South').required).total.total.required, 6)
  })

  it('Blended monthly rate and Current inventory per cell are the SKU’s own, and add up to the section', () => {
    const { rows, sections } = run('South')
    const fm = byKey(sections).FM
    const sku = rows.find(r => r.id === 'South|50x50|3.0')
    expect(fm.figures['SHS|50x50|3']).toEqual({ rate: sku.rate, inventory: sku.inventory })
    // 20 T now (fm-mm-sm-subtab.test.js)
    expect(fm.figures['SHS|50x50|3'].inventory).toBeCloseTo(20)
    expect(fm.totals.inventory).toBeCloseTo(fm.skus.reduce((t, r) => t + r.inventory, 0), 6)
    expect(fm.totals.rate).toBeCloseTo(fm.skus.reduce((t, r) => t + r.rate, 0), 6)
    expect(fm.sizeTotals['SHS|50x50'].inventory).toBeCloseTo(fm.skus.filter(r => r.cellKey.startsWith('SHS|50x50|')).reduce((t, r) => t + r.inventory, 0), 6)
  })

  it('a cell holding two SKUs of different tags picks no tag: it goes to Not tagged / Outside the plan with both SKUs', () => {
    // South 50x50 3.0 is FM; an added 2.8 band folds into the same 3.0 column. With no sales of its own it is No sales.
    const two = [...stored, { rowKey: 'South|50x50|2.8', region: 'South', size: '50x50', thickness: 2.8, type: 'MTO', buffer: null, plants: [], retired: false }]
    const { sections } = run('South', { stored: two })
    const s = byKey(sections)
    expect(cellKeys(s.outside)).toContain('SHS|50x50|3')
    expect(cellKeys(s.FM)).not.toContain('SHS|50x50|3')
    expect(s.outside.skus.map(r => r.id).sort()).toEqual(['South|50x50|2.8', 'South|50x50|3.0'])
    // still counted under their own tags
    expect(s.FM.count + s['No sales'].count).toBeGreaterThan(0)
  })

  it('the grid’s own filters cut the sections the same way they cut the rows and lines', () => {
    const { grid } = run('South')
    const rows = fmMmSmCut(fmMmSmRows({ ...feed, region: 'South' }), { sections: ['CHS'] })
    const lines = grid.lines.filter(l => l.section === 'CHS')
    const sections = fmMmSmTagSections({ rows, join: fmMmSmJoin(rows, lines), lines, required: grid.required })
    sections.forEach(s => s.lines.forEach(l => expect(l.section).toBe('CHS')))
    expect(sections.flatMap(s => s.skus).every(r => r.section === 'CHS')).toBe(true)
  })

  it('unknown Production required (null) stays unknown in every section', () => {
    const { rows, grid, join } = run('South')
    fmMmSmTagSections({ rows, join, lines: grid.lines, required: null }).forEach(s => expect(s.totals.required).toBeNull())
  })
})

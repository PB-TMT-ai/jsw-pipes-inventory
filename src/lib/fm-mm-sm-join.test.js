// Sales tab FM / MM / SM sub-tab, part A (ticket #383): the join of planning SKUs to Sales-grid cells.
// Pure calc, no screen. The rows below are INVENTED (src/lib/__fixtures__/fm-mm-sm-join-invented.json);
// the frozen 16-Nov-2026 live fixture is NOT built yet (no database access when this was written), so the
// 16-Nov figures (South 245 SKUs, West 240, 47/32/38 …) are not checked here.
import { describe, it, expect } from 'vitest'
import fixture from './__fixtures__/fm-mm-sm-join-invented.json'
import {
  fmMmSmRows, fmMmSmJoin, planningMovesCover, planningMaster, planningSizeKey, salesGridShape,
  salesSizeLines, salesSizePivot, canonicalSkuKey,
} from './calc'

const { stored, skus, productions, dispatches, today } = fixture
const feed = { productions, dispatches, skus, stored, today }

// Sales rows the way `salesByDistributor` hands them to the grid: one row per distributor, its SKU rows
// keyed by canonical SKU key. Built by hand from the fixture's `pending` list.
const keyOfCode = Object.fromEntries(skus.map(s => [s.skuCode, canonicalSkuKey(s)]))
const distRows = ['South', 'West'].map(region => ({
  region,
  skuRows: fixture.pending.filter(p => p.region === region).map(p => ({
    id: keyOfCode[p.skuCode], skuCode: p.skuCode, description: '',
    confirmed: p.confirmed, nonConfirmed: p.nonConfirmed, pending: p.confirmed + p.nonConfirmed,
  })),
}))
// One region per run: that region's sales rows and that region's stock pool, nothing else.
const gridOf = (region, over = {}) => salesSizeLines({
  distRows: distRows.filter(r => r.region === region), productions, dispatches, skus,
  from: '2026-11-01', to: today, today, stockRegions: [region], ...over,
})
const run = (region, over = {}) => {
  const rows = fmMmSmRows({ ...feed, region, ...over })
  const grid = gridOf(region)
  return { rows, grid, join: fmMmSmJoin(rows, grid.lines) }
}
const rowOf = (rows, id) => rows.find(r => r.id === id)
const ids = (rows) => rows.map(r => r.id).sort()

describe('the two helpers the join shares', () => {
  it('salesGridShape is exported and spells a tube the way the grid does', () => {
    expect(salesGridShape('shs|4923|91.5x91.5|2.90|6000')).toMatchObject({ section: 'SHS', size: '91.5x91.5', thickness: 2.9, stdThickness: 3 })
    expect(salesGridShape('chs|1161|40 nb|2.20|6000')).toMatchObject({ section: 'CHS', size: '40 NB', stdThickness: 2 })
  })
  it('planningSizeKey is exported and bridges the master spelling', () => {
    expect(planningSizeKey('40NB')).toBe('CHS 40')
    expect(planningSizeKey('91x91')).toBe('SHS 91.5x91.5')
    expect(planningSizeKey('40x80')).toBe('RHS 80x40')
    expect(planningSizeKey('nonsense')).toBe('')
  })
})

describe('fmMmSmRows — one entry per live master row of the region, read from planningMovesCover', () => {
  it('has one entry per live master row of that region, and no retired row', () => {
    const live = (region, st) => planningMaster(st).filter(r => r.region === region && !r.retired)
    expect(fmMmSmRows({ ...feed, region: 'South' })).toHaveLength(live('South', stored).length)
    expect(fmMmSmRows({ ...feed, region: 'West' })).toHaveLength(live('West', stored).length)
    const retire = [...stored, { rowKey: 'South|50x50|1.2', region: 'South', size: '50x50', thickness: 1.2, type: 'MTO', buffer: null, plants: [], retired: true }]
    const south = fmMmSmRows({ ...feed, stored: retire, region: 'South' })
    expect(south).toHaveLength(live('South', retire).length)
    expect(rowOf(south, 'South|50x50|1.2')).toBeUndefined()
    expect(fmMmSmRows({ ...feed, region: 'North' })).toEqual([])
  })

  it('the seed master is 236 South and 235 West rows; the stored rows add the rest (live 245 / 240 not checked here)', () => {
    const seed = planningMaster([])
    expect(seed.filter(r => r.region === 'South')).toHaveLength(236)
    expect(seed.filter(r => r.region === 'West')).toHaveLength(235)
  })

  it('tag, rate, cover and Current inventory are planningMovesCover’s own, never recomputed', () => {
    const { byRow } = planningMovesCover(feed)
    ;['South', 'West'].forEach(region => fmMmSmRows({ ...feed, region }).forEach(r => {
      const m = byRow[r.id]
      expect(r.region).toBe(region)
      expect(r.tag).toBe(m.tag)
      expect(r.rate).toBe(m.rate)
      expect(r.inventory).toBe(m.stock)
      expect(r.coverKind).toBe(m.cover.kind)
      expect(r.coverDays).toBe(m.cover.kind === 'days' ? m.cover.days : null)
      expect(r.bracket).toBe(m.cover.word)
    }))
  })

  it('carries section, size as the master spells it, and the thickness band', () => {
    const south = fmMmSmRows({ ...feed, region: 'South' })
    expect(rowOf(south, 'South|40NB|3.0')).toMatchObject({ section: 'CHS', size: '40NB', thickness: 3 })
    expect(rowOf(south, 'South|91x91|3.0')).toMatchObject({ section: 'SHS', size: '91x91', thickness: 3 })
    expect(rowOf(south, 'South|65x65|2.2')).toMatchObject({ section: 'SHS', thickness: 2.2 })
  })

  it('every row has a cell key, built by the shared helpers — the master sizes and bands that need the bridge', () => {
    const cell = (region, id) => rowOf(fmMmSmRows({ ...feed, region }), id).cellKey
    expect(cell('South', 'South|40NB|3.0')).toBe('CHS|40 NB|3')                 // 40NB → "40 NB"
    expect(cell('South', 'South|91x91|3.0')).toBe('SHS|91.5x91.5|3')            // 91x91 → 91.5x91.5
    expect(cell('South', 'South|65x65|2.2')).toBe('SHS|65x65|2')                // 2.2 → the 2.0 column
    expect(cell('South', 'South|70x70|2.8')).toBe('SHS|70x70|3')                // 2.8 → 3.0
    expect(cell('South', 'South|65x65|2.9')).toBe('SHS|65x65|3')                // 2.9 → 3.0
    expect(cell('South', 'South|50x50|3.0')).toBe('SHS|50x50|3')                // 3.0 → 3.0
    expect(cell('West', 'West|65x65|3.2')).toBe('SHS|65x65|3')                  // 3.2 → 3.0
    expect(cell('South', 'South|40x20|2.0')).toBe('RHS|40x20|2')                // larger side first, as the grid
    fmMmSmRows({ ...feed, region: 'South' }).forEach(r => expect(r.cellKey).toMatch(/^(SHS|RHS|CHS)\|[^|]+\|\d/))
  })

  it('a master row whose cell cannot be built has a null cell key, not a made-up one', () => {
    const odd = [{ rowKey: 'South|weird|2.0', region: 'South', size: 'weird', thickness: 2, type: 'MTO', buffer: null, plants: [], retired: false }]
    expect(rowOf(fmMmSmRows({ ...feed, stored: odd, region: 'South' }), 'South|weird|2.0').cellKey).toBeNull()
  })

  it('the feed is unfiltered: a plant filter on the screen changes no tag, rate or count', () => {
    const base = fmMmSmRows({ ...feed, region: 'South' })
    expect(fmMmSmRows({ ...feed, region: 'South', selectedPlant: 'hyderabad', plant: 'hyderabad', stockPlants: ['hyderabad'] })).toEqual(base)
  })
})

describe('fmMmSmJoin — landed, notShown, multi, untagged', () => {
  it('every master row of a region is in landed or in notShown, once; the counts add up to the region’s SKU count', () => {
    ;['South', 'West'].forEach(region => {
      const { rows, join } = run(region)
      const landedRows = Object.values(join.landed).flat()
      expect(landedRows.length + join.notShown.length).toBe(rows.length)
      expect(ids([...landedRows, ...join.notShown])).toEqual(ids(rows))
      expect(join.region).toBe(region)
    })
  })

  it('lands each invented case on the cell the bridge names', () => {
    const { join } = run('South')
    const at = (cell) => (join.landed[cell] || []).map(r => r.id).sort()
    expect(at('SHS|91.5x91.5|3')).toEqual(['South|91x91|3.0'])        // orders only, no stock; 91x91 ↔ 91.5x91.5
    expect(at('CHS|40 NB|3')).toEqual(['South|40NB|3.0'])             // stock and no sales
    expect(at('SHS|65x65|2')).toEqual(['South|65x65|2.2'])
    expect(at('SHS|65x65|3')).toEqual(['South|65x65|2.9'])
    expect(at('SHS|70x70|3')).toEqual(['South|70x70|2.8'])            // orders only
    expect(at('SHS|50x50|3')).toEqual(['South|50x50|3.0'])
  })

  it('a SKU with no stock and no orders is named, with that reason, never dropped', () => {
    const { join } = run('South')
    const quiet = join.notShown.find(r => r.id === 'South|60x60|2.0')
    expect(quiet).toMatchObject({ reason: 'no stock and no orders', cellKey: 'SHS|60x60|2' })
    expect(join.notShown.filter(r => r.reason === 'no stock and no orders').length).toBeGreaterThan(100)
  })

  it('a row holding stock whose cell is not on the grid is named: no cell for this size or thickness', () => {
    // 150NB has only a 5.0 and a 6.0 band in South: a 4.0 tube counts on the 5.0 line (nearest band, heavier on a
    // tie) but the grid files it under its own standard thickness, 4.0 — so the 5.0 row has stock and no cell.
    const { rows, join } = run('South')
    const r = rowOf(rows, 'South|150NB|5.0')
    expect(r.inventory).toBeCloseTo(25)
    expect(join.notShown.find(x => x.id === r.id)).toMatchObject({ reason: 'no cell for this size or thickness', cellKey: 'CHS|150 NB|5' })
  })

  it('a grid cell with stock but no tagged SKU goes to untagged, with its three figures', () => {
    const { join } = run('South')
    const u = (key) => join.untagged.find(c => c.key === key)
    expect(u('SHS|77x77|2')).toMatchObject({ section: 'SHS', size: '77x77', thickness: 2, closing: 9, dispatch: 0, pending: 0 })   // size outside the plan
    expect(u('CHS|150 NB|4')).toMatchObject({ closing: 25 })                                                                      // the 4.0 tube of the 150NB case
    expect(join.untagged.map(c => c.key)).not.toContain('SHS|50x50|3')                                                            // a tagged cell is not untagged
  })

  it('tagged tonnes plus untagged tonnes equal the grid total for Closing stock, Dispatch and Pending to Dispatch, per region', () => {
    ;['South', 'West'].forEach(region => {
      const { grid, join } = run(region)
      const t = salesSizePivot(grid.lines).total.total
      ;['closing', 'dispatch', 'pending'].forEach(k => {
        expect(join.totals.tagged[k] + join.totals.untagged[k]).toBeCloseTo(t[k], 6)
        expect(join.totals.grid[k]).toBeCloseTo(t[k], 6)
      })
      // and the same sums, taken straight from the cells
      const cellSum = (k) => join.untagged.reduce((s, c) => s + c[k], 0)
      expect(cellSum('closing')).toBeCloseTo(join.totals.untagged.closing, 6)
    })
    // the invented South grid, worked by hand: closing 50+20+30+0+20+10+25+9 = 164, dispatch 10 (2-Nov), pending 25+12+8 = 45
    const south = run('South').join.totals.grid
    expect(south.closing).toBeCloseTo(164); expect(south.dispatch).toBeCloseTo(10); expect(south.pending).toBeCloseTo(45)
  })

  it('multi is empty here; two master rows that fold to one cell are listed in multi, and both still land', () => {
    expect(run('South').join.multi).toEqual([])
    expect(run('West').join.multi).toEqual([])
    // South 50x50 carries a 3.0 band; an added 2.8 band folds into the same 3.0 column → one cell, two SKUs
    const two = [...stored, { rowKey: 'South|50x50|2.8', region: 'South', size: '50x50', thickness: 2.8, type: 'MTO', buffer: null, plants: [], retired: false }]
    const rows = fmMmSmRows({ ...feed, stored: two, region: 'South' })
    const join = fmMmSmJoin(rows, gridOf('South').lines)
    expect(join.multi).toEqual(['SHS|50x50|3'])
    expect(join.landed['SHS|50x50|3'].map(r => r.id).sort()).toEqual(['South|50x50|2.8', 'South|50x50|3.0'])
    expect(join.notShown.map(r => r.id)).not.toContain('South|50x50|2.8')
  })

  it('one region per run: a size both regions carry keeps two separate cells, and neither run reads the other’s stock', () => {
    const south = run('South'), west = run('West')
    // 65x65 in the 3.0 column exists in both regions: South's 2.9 row (10 T at Hyderabad), West's 3.2 row (25 T at NPMD)
    expect(Object.keys(south.join.landed)).toContain('SHS|65x65|3')
    expect(Object.keys(west.join.landed)).toContain('SHS|65x65|3')
    expect(south.join.landed['SHS|65x65|3'].map(r => r.id)).toEqual(['South|65x65|2.9'])
    expect(west.join.landed['SHS|65x65|3'].map(r => r.id)).toEqual(['West|65x65|3.2'])
    const cellClosing = (grid, key) => grid.lines.filter(l => `${l.section}|${l.size}|${l.stdThickness}` === key).reduce((s, l) => s + l.closing, 0)
    expect(cellClosing(south.grid, 'SHS|65x65|3')).toBeCloseTo(10)
    expect(cellClosing(west.grid, 'SHS|65x65|3')).toBeCloseTo(25)
    expect(rowOf(south.rows, 'South|65x65|2.9').inventory).toBeCloseTo(10)
    expect(rowOf(west.rows, 'West|65x65|3.2').inventory).toBeCloseTo(25)
  })

  it('refuses a run that mixes regions, rather than blend two stock pools in one cell', () => {
    const mixed = [...fmMmSmRows({ ...feed, region: 'South' }), ...fmMmSmRows({ ...feed, region: 'West' })]
    expect(() => fmMmSmJoin(mixed, gridOf('South').lines)).toThrow(/one region/i)
  })

  it('reasons, on hand-made rows: an unbuildable cell, a stocked row with no cell, a quiet row with no cell', () => {
    const row = (over) => ({ id: 'X', region: 'South', cellKey: 'SHS|10x10|2', inventory: 0, ...over })
    const join = fmMmSmJoin([
      row({ id: 'a', cellKey: null }),
      row({ id: 'b', inventory: 4 }),
      row({ id: 'c', inventory: 0 }),
    ], [])
    expect(join.notShown.map(r => [r.id, r.reason])).toEqual([
      ['a', 'no cell for this size or thickness'],
      ['b', 'no cell for this size or thickness'],
      ['c', 'no stock and no orders'],
    ])
    expect(join.landed).toEqual({})
    expect(join.multi).toEqual([])
  })

  it('an empty run joins to nothing', () => {
    expect(fmMmSmJoin([], [])).toMatchObject({ region: null, landed: {}, notShown: [], multi: [], untagged: [] })
  })
})

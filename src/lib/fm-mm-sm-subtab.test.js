// Sales tab FM / MM / SM sub-tab, part B (ticket #384): the calc behind the screen — the cards of a region
// block, the cut of the region's SKUs by the grid's own filters, and the text a tagged cell prints.
// The rows are the INVENTED fixture of part A (src/lib/__fixtures__/fm-mm-sm-join-invented.json); the
// frozen 16-Nov-2026 live fixture is not built (it needs the live database), so the live card figures
// (South 245 SKUs, 1,305.6 T a month, 973.5 T …) are NOT checked here.
import { describe, it, expect } from 'vitest'
import fixture from './__fixtures__/fm-mm-sm-join-invented.json'
import { fmMmSmRows, fmMmSmCards, fmMmSmFeed, fmMmSmCut, fmMmSmCellLabel, fmMmSmNotShownReason,
  FM_MM_SM_NO_CELL, FM_MM_SM_NO_STOCK, FM_MM_SM_NOT_AT_PLANT, planningMovesCover, filterByPlant } from './calc'

const { stored, skus, productions, dispatches, today } = fixture
const feed = { productions, dispatches, skus, stored, today }

describe('fmMmSmCards — the three cards of a region block', () => {
  it('counts every SKU of the region once, split FM / MM / SM / No sales, as the Planning columns rank them', () => {
    const { byRegion } = planningMovesCover(feed)
    ;['South', 'West'].forEach(region => {
      const cards = fmMmSmCards(fmMmSmRows({ ...feed, region }))
      expect(cards.counts).toEqual(byRegion[region].counts)
      expect(cards.skus).toBe(Object.values(byRegion[region].counts).reduce((t, n) => t + n, 0))
    })
  })

  it('Blended monthly rate and Current inventory are the region’s sums (the invented fixture’s own tonnes)', () => {
    const south = fmMmSmCards(fmMmSmRows({ ...feed, region: 'South' }))
    const west = fmMmSmCards(fmMmSmRows({ ...feed, region: 'West' }))
    // Current inventory now = produced − invoiced at the serving plants, all dates:
    //   South (Hyderabad + Lepakshi): 100+80+30+10+20+15+25+9 = 289 produced, 40+10+60+10+5 = 125 invoiced → 164
    //   West (NPMD + Tapi): 40+60 = 100 produced, 15+20 = 35 invoiced → 65
    // Only stock that lands on a master row counts; the planning columns say how much of it does.
    const { byRegion } = planningMovesCover(feed)
    expect(south.inventory).toBeCloseTo(byRegion.South.stock, 6)
    expect(west.inventory).toBeCloseTo(byRegion.West.stock, 6)
    expect(south.rate).toBeCloseTo(byRegion.South.rate, 6)
    expect(west.rate).toBeCloseTo(byRegion.West.rate, 6)
    expect(south.inventory).toBeLessThanOrEqual(164 + 1e-9)
    expect(west.inventory).toBeLessThanOrEqual(65 + 1e-9)
    expect(south.rate).toBeGreaterThan(0)
  })

  it('an empty region reads 0 SKUs, 0 T a month and 0 T — not blank', () => {
    expect(fmMmSmCards([])).toEqual({ skus: 0, counts: { FM: 0, MM: 0, SM: 0, 'No sales': 0 }, rate: 0, inventory: 0 })
  })
})

describe('fmMmSmFeed — the sub-tab’s tag feed: South then West, from the UNFILTERED stores', () => {
  it('has a South block then a West block, each that region’s rows and cards', () => {
    const f = fmMmSmFeed(feed)
    expect(f.map(b => b.region)).toEqual(['South', 'West'])
    f.forEach(b => {
      expect(b.rows).toEqual(fmMmSmRows({ ...feed, region: b.region }))
      expect(b.cards).toEqual(fmMmSmCards(b.rows))
    })
  })

  it('the header plant selector moves no tag, rate or SKU count: the feed reads every plant, as the Planning columns do', () => {
    // App hands Sales plant-filtered stores for the Dashboard; the feed must not get them. Fed the
    // whole stores, every card equals the Planning columns’ region figures …
    const { byRegion } = planningMovesCover(feed)
    fmMmSmFeed(feed).forEach(b => {
      expect(b.cards.counts).toEqual(byRegion[b.region].counts)
      expect(b.cards.rate).toBeCloseTo(byRegion[b.region].rate, 6)
      expect(b.cards.inventory).toBeCloseTo(byRegion[b.region].stock, 6)
    })
    // … while the Dashboard’s plant-filtered stores (header = Hyderabad) would move them — South’s
    // Lepakshi stock drops out and West reads empty. That is why App passes `allProductions` and
    // `allDispatches` to the sub-tab, never `plantProductions`.
    const [south, west] = fmMmSmFeed({ ...feed, productions: filterByPlant(productions, 'hyderabad'),
      dispatches: dispatches.filter(d => d.bundleEntries.every(e => e.plant === 'hyderabad')) })
    expect(south.cards.inventory).toBeLessThan(byRegion.South.stock - 1)
    expect(west.cards.inventory).toBe(0)
  })
})

describe('fmMmSmCut — a region’s SKUs under the grid’s own Section / Size / Thickness filters', () => {
  const south = fmMmSmRows({ ...feed, region: 'South' })
  const idsOf = (rows) => rows.map(r => r.id)

  it('no filter keeps every SKU, a cell-less one included', () => {
    const odd = [...south, { ...south[0], id: 'South|weird|2.0', cellKey: null }]
    expect(fmMmSmCut(odd, {})).toEqual(odd)
    expect(fmMmSmCut(odd)).toEqual(odd)
  })

  it('cuts by the grid’s spelling — section, grid size and STANDARD thickness — as the grid’s lines are cut', () => {
    const cut = fmMmSmCut(south, { sections: ['SHS'], sizes: ['65x65', '91.5x91.5'], thicknesses: [2, 3] })
    expect(idsOf(cut).sort()).toEqual(['South|65x65|2.2', 'South|65x65|2.9', 'South|91x91|2.0', 'South|91x91|3.0'])
    // 40NB is CHS and spelt "40 NB" on the grid
    expect(idsOf(fmMmSmCut(south, { sizes: ['40 NB'], thicknesses: [3] }))).toEqual(['South|40NB|3.0'])
    expect(fmMmSmCut(south, { sections: ['CHS'] }).length).toBeGreaterThan(0)
    expect(fmMmSmCut(south, { sections: ['CHS'] }).every(r => r.section === 'CHS')).toBe(true)
  })

  it('a SKU with no cell cannot sit inside a filter, so any filter leaves it out', () => {
    const odd = [{ ...south[0], id: 'South|weird|2.0', cellKey: null }]
    expect(fmMmSmCut(odd, { thicknesses: [2] })).toEqual([])
  })
})

describe('fmMmSmNotShownReason — why a SKU has no cell, said for the grid as filtered', () => {
  const south = fmMmSmRows({ ...feed, region: 'South' })
  const row = (id, reason) => ({ ...south.find(r => r.id === id), reason })

  it('with every plant in view, the join’s own reason stands', () => {
    expect(fmMmSmNotShownReason(row('South|50x50|3.0', FM_MM_SM_NO_CELL), false)).toBe(FM_MM_SM_NO_CELL)
    expect(fmMmSmNotShownReason(row('South|70x70|2.8', FM_MM_SM_NO_STOCK), false)).toBe(FM_MM_SM_NO_STOCK)
  })

  it('under a plant filter, a SKU whose cell exists elsewhere has nothing at the plant picked — not "no cell"', () => {
    expect(fmMmSmNotShownReason(row('South|50x50|3.0', FM_MM_SM_NO_CELL), true)).toBe(FM_MM_SM_NOT_AT_PLANT)
    expect(fmMmSmNotShownReason(row('South|70x70|2.8', FM_MM_SM_NO_STOCK), true)).toBe(FM_MM_SM_NOT_AT_PLANT)
    // a cell that cannot be built is still that, whatever the filter
    expect(fmMmSmNotShownReason({ ...row('South|50x50|3.0', FM_MM_SM_NO_CELL), cellKey: null }, true)).toBe(FM_MM_SM_NO_CELL)
  })
})

describe('fmMmSmCellLabel —what a tagged cell prints: whole days and the tag, the bracket word on hover', () => {
  const south = fmMmSmRows({ ...feed, region: 'South' })
  const on = (id) => [south.find(r => r.id === id)]

  it('days of cover print as a whole number then the tag (7 d FM); the bracket is the one chosen on that number', () => {
    // SHS 50x50 3.0: FM, 20 T now, ~68.9 T a month → 8.7 → 9 d, Thin (FM Thin is 7–14 d)
    expect(fmMmSmCellLabel(on('South|50x50|3.0'))).toMatchObject({ kind: 'days', text: '9 d FM', bracket: 1, word: 'Thin' })
    // SHS 50x50 2.0: FM, 50 T now, ~45.9 T a month → 33 d, Healthy
    expect(fmMmSmCellLabel(on('South|50x50|2.0'))).toMatchObject({ kind: 'days', text: '33 d FM', bracket: 2, word: 'Healthy' })
    // sales and no stock: 0 d, Running out
    expect(fmMmSmCellLabel(on('South|91x91|3.0'))).toMatchObject({ kind: 'days', text: '0 d MM', bracket: 0, word: 'Running out' })
  })

  it('the hover names the bracket, both figures behind the days, and that it is as of today', () => {
    const { title } = fmMmSmCellLabel(on('South|50x50|3.0'))
    expect(title).toContain('Thin')
    expect(title).toContain('FM')
    expect(title).toContain('9 d')
    expect(title).toContain('Current inventory 20.0 T')
    expect(title).toContain('Blended monthly rate 68.9 T a month')
    expect(title).toContain('as of today')
  })

  it('stock with no sales prints No use; no stock and no sales prints No sales', () => {
    expect(fmMmSmCellLabel(on('South|65x65|2.2'))).toMatchObject({ kind: 'noUse', text: 'No use', bracket: null })
    expect(fmMmSmCellLabel(on('South|65x65|2.2')).title).toContain('Current inventory 20.0 T')
    expect(fmMmSmCellLabel(on('South|70x70|2.8'))).toMatchObject({ kind: 'none', text: 'No sales', bracket: null })
  })

  it('a cell with no SKU of the plan is Not tagged / Outside the plan; one with two SKUs names both and picks no tag', () => {
    expect(fmMmSmCellLabel([])).toMatchObject({ kind: 'untagged', text: '—' })
    expect(fmMmSmCellLabel([]).title).toContain('Not tagged / Outside the plan')
    const two = fmMmSmCellLabel([...on('South|65x65|2.9'), ...on('South|50x50|3.0')])
    expect(two).toMatchObject({ kind: 'multi', text: '2 SKUs', bracket: null })
    expect(two.title).toContain('65x65')
    expect(two.title).toContain('50x50')
  })
})

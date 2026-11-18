// Sales tab FM / MM / SM sub-tab, Status key tab (ticket #379): the boxes of the key — per region, per
// FM / MM / SM and cover bracket, plus No use and No sales — and the cut a clicked box puts on that
// region's grid. The rows are the INVENTED fixture of #383 (src/lib/__fixtures__/fm-mm-sm-join-invented.json,
// "today" 16-Nov-2026). The frozen live 16-Nov fixture is not built (it needs the live database), so the
// live figures (South 245 SKUs / 973.5 T, West 240 / 1,655.0 T, South FM Running out 17 SKUs) are NOT
// checked here.
//
// What the invented fixture holds (read off `fmMmSmRows`, worked by hand in fm-mm-sm-subtab.test.js):
//   South  SHS 50x50 2.0  FM  33 d Healthy      50 T now, 45.9 T a month
//          SHS 50x50 3.0  FM   9 d Thin         20 T now, 68.9 T a month
//          SHS 91x91 3.0  MM   0 d Running out   0 T now, 11.5 T a month
//          SHS 65x65 2.9  SM  52 d Healthy      10 T now,  5.7 T a month
//          No use (stock, no sales): CHS 40NB 3.0 30 T, CHS 150NB 5.0 25 T, SHS 65x65 2.2 20 T = 75 T
//          every other South row: No sales, no stock
//   West   SHS 65x65 3.2  FM  27 d Healthy      25 T now, 27.3 T a month
//          No use: SHS 50x50 2.0 40 T;  every other West row: No sales, no stock
import { describe, it, expect } from 'vitest'
import fixture from './__fixtures__/fm-mm-sm-join-invented.json'
import { fmMmSmRows, fmMmSmCards, fmMmSmStatusOf, fmMmSmStatusBoxes, fmMmSmBracketLimits, fmMmSmStatusCut,
  fmMmSmStatusLines, fmMmSmStatusTagRows, FM_MM_SM_STATUS_NO_USE, FM_MM_SM_STATUS_NO_SALES, salesGridCellKey } from './calc'

const { stored, skus, productions, dispatches, today } = fixture
const feed = { productions, dispatches, skus, stored, today }
const south = fmMmSmRows({ ...feed, region: 'South' })
const west = fmMmSmRows({ ...feed, region: 'West' })
const box = (boxes, key) => boxes.groups.flatMap(g => g.boxes).find(b => b.key === key)

describe('fmMmSmBracketLimits — the day limits of the key, from PLANNING_COVER_BRACKETS', () => {
  it('reads as CONTEXT.md (Cover bracket) writes them, per FM / MM / SM', () => {
    expect(fmMmSmBracketLimits('FM')).toEqual(['under 7 d', '7–14 d', '15–45 d', '46–75 d', 'over 75 d'])
    expect(fmMmSmBracketLimits('MM')).toEqual(['under 10 d', '10–20 d', '21–60 d', '61–90 d', 'over 90 d'])
    expect(fmMmSmBracketLimits('SM')).toEqual(['under 5 d', '5–14 d', '15–90 d', '91–180 d', 'over 180 d'])
  })
})

describe('fmMmSmStatusOf — the one box a SKU sits in', () => {
  const on = (rows, id) => fmMmSmStatusOf(rows.find(r => r.id === id))
  it('a SKU with sales sits in its tag and bracket', () => {
    expect(on(south, 'South|50x50|2.0')).toBe('FM|Healthy')
    expect(on(south, 'South|50x50|3.0')).toBe('FM|Thin')
    expect(on(south, 'South|91x91|3.0')).toBe('MM|Running out')
    expect(on(south, 'South|65x65|2.9')).toBe('SM|Healthy')
  })
  it('stock with no sales is No use, and only No use — never also No sales', () => {
    expect(on(south, 'South|40NB|3.0')).toBe(FM_MM_SM_STATUS_NO_USE)
    expect(on(west, 'West|50x50|2.0')).toBe(FM_MM_SM_STATUS_NO_USE)
  })
  it('no stock and no sales is No sales', () => {
    expect(on(south, 'South|15NB|1.2')).toBe(FM_MM_SM_STATUS_NO_SALES)
  })
})

describe('fmMmSmStatusBoxes — the boxes of one region', () => {
  it('South: SKU count, Current inventory and Blended monthly rate per box (the fixture’s own tonnes)', () => {
    const b = fmMmSmStatusBoxes(south)
    expect(box(b, 'FM|Healthy')).toMatchObject({ count: 1, word: 'Healthy', limit: '15–45 d' })
    expect(box(b, 'FM|Healthy').inventory).toBeCloseTo(50, 6)
    expect(box(b, 'FM|Thin')).toMatchObject({ count: 1 })
    expect(box(b, 'FM|Thin').inventory).toBeCloseTo(20, 6)
    expect(box(b, 'FM|Thin').rate).toBeCloseTo(68.89, 1)
    expect(box(b, 'FM|Running out')).toMatchObject({ count: 0, inventory: 0, rate: 0 })
    expect(box(b, 'MM|Running out')).toMatchObject({ count: 1, inventory: 0 })
    expect(box(b, 'MM|Running out').rate).toBeCloseTo(11.48, 1)
    expect(box(b, 'SM|Healthy').inventory).toBeCloseTo(10, 6)
    expect(box(b, FM_MM_SM_STATUS_NO_USE).count).toBe(3)
    expect(box(b, FM_MM_SM_STATUS_NO_USE).inventory).toBeCloseTo(75, 6)
    expect(box(b, FM_MM_SM_STATUS_NO_SALES).count).toBe(south.length - 7)
    expect(box(b, FM_MM_SM_STATUS_NO_SALES).inventory).toBe(0)
  })

  it('West reads its own: never summed with South', () => {
    const b = fmMmSmStatusBoxes(west)
    expect(box(b, 'FM|Healthy').count).toBe(1)
    expect(box(b, 'FM|Healthy').inventory).toBeCloseTo(25, 6)
    expect(box(b, 'FM|Thin').count).toBe(0)
    expect(box(b, FM_MM_SM_STATUS_NO_USE).count).toBe(1)
    expect(box(b, FM_MM_SM_STATUS_NO_USE).inventory).toBeCloseTo(40, 6)
    expect(b.total.inventory).toBeCloseTo(65, 6)
  })

  it('every box’s count and tonnes add up to the region’s cards; each group to the Planning column’s count', () => {
    ;[south, west].forEach(rows => {
      const b = fmMmSmStatusBoxes(rows)
      const cards = fmMmSmCards(rows)
      const all = b.groups.flatMap(g => g.boxes)
      expect(all.reduce((t, x) => t + x.count, 0)).toBe(cards.skus)
      expect(all.reduce((t, x) => t + x.inventory, 0)).toBeCloseTo(cards.inventory, 6)
      expect(all.reduce((t, x) => t + x.rate, 0)).toBeCloseTo(cards.rate, 6)
      expect(b.total).toMatchObject({ count: cards.skus })
      expect(b.groups.map(g => g.tag)).toEqual(['FM', 'MM', 'SM', 'No sales'])
      b.groups.forEach(g => expect(g.count).toBe(cards.counts[g.tag]))
    })
    // South by hand: 155 T = 50 + 20 + 0 + 10 + 75; FM / MM / SM 2 / 1 / 1
    expect(fmMmSmStatusBoxes(south).total.inventory).toBeCloseTo(155, 6)
    expect(fmMmSmStatusBoxes(south).groups.slice(0, 3).map(g => g.count)).toEqual([2, 1, 1])
  })

  it('five bracket boxes per FM / MM / SM, in order, then No use and No sales', () => {
    const b = fmMmSmStatusBoxes(south)
    expect(b.groups[0].boxes.map(x => x.key)).toEqual(['FM|Running out', 'FM|Thin', 'FM|Healthy', 'FM|Heavy', 'FM|Too much'])
    expect(b.groups[3].boxes.map(x => x.key)).toEqual([FM_MM_SM_STATUS_NO_USE, FM_MM_SM_STATUS_NO_SALES])
  })

  it('an empty region reads 0 in every box', () => {
    const b = fmMmSmStatusBoxes([])
    expect(b.total).toEqual({ count: 0, inventory: 0, rate: 0 })
    expect(b.groups.flatMap(g => g.boxes).every(x => x.count === 0)).toBe(true)
  })
})

describe('fmMmSmStatusCut / fmMmSmStatusLines — a clicked box narrows that region’s grid', () => {
  it('keeps the box’s SKUs only; no box keeps all', () => {
    expect(fmMmSmStatusCut(south, 'FM|Thin').map(r => r.id)).toEqual(['South|50x50|3.0'])
    expect(fmMmSmStatusCut(south, FM_MM_SM_STATUS_NO_USE).map(r => r.id).sort())
      .toEqual(['South|150NB|5.0', 'South|40NB|3.0', 'South|65x65|2.2'])
    expect(fmMmSmStatusCut(south, null)).toBe(south)
  })

  it('keeps only the grid lines on those SKUs’ cells (the grid’s own cell key)', () => {
    const lines = [
      { section: 'SHS', size: '50x50', stdThickness: 3, closing: 5 },
      { section: 'SHS', size: '50x50', stdThickness: 2, closing: 7 },
      { section: 'CHS', size: '40 NB', stdThickness: 3, closing: 1 },
    ]
    expect(salesGridCellKey(lines[0])).toBe('SHS|50x50|3')
    expect(fmMmSmStatusLines(lines, fmMmSmStatusCut(south, 'FM|Thin'))).toEqual([lines[0]])
    expect(fmMmSmStatusLines(lines, fmMmSmStatusCut(south, FM_MM_SM_STATUS_NO_USE))).toEqual([lines[2]])
    expect(fmMmSmStatusLines(lines, null)).toBe(lines)
  })
})

describe('fmMmSmStatusTagRows — the SKUs a narrowed grid tags', () => {
  it('the box’s SKUs plus any other SKU on a kept cell, so a shared cell still reads "2 SKUs", never a guessed tag', () => {
    // An invented FM Thin row on the SM row's cell (SHS 65x65 2.9 → "SHS|65x65|3"): the FM Thin box keeps
    // the SM row too, for that cell's label.
    const extra = { ...south.find(r => r.id === 'South|50x50|3.0'), id: 'South|65x65|3.1', cellKey: 'SHS|65x65|3' }
    const ids = fmMmSmStatusTagRows([...south, extra], 'FM|Thin').map(r => r.id).sort()
    expect(ids).toEqual(['South|50x50|3.0', 'South|65x65|2.9', 'South|65x65|3.1'])
  })
  it('a box SKU with no cell is kept (it is listed as not shown); no box keeps every row', () => {
    const odd = { ...south.find(r => r.id === 'South|50x50|3.0'), id: 'South|weird|3.0', cellKey: null }
    expect(fmMmSmStatusTagRows([...south, odd], 'FM|Thin').map(r => r.id).sort()).toEqual(['South|50x50|3.0', 'South|weird|3.0'])
    expect(fmMmSmStatusTagRows(south, null)).toBe(south)
  })
})

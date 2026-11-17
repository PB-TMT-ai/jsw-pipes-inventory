// Sales tab FM / MM / SM sub-tab, Make next · Stock stuck (ticket #380). The two worklists of a region block,
// read off that region's `fmMmSmRows` (the tag, FG days of cover and Current inventory are planningMovesCover's,
// never recomputed) and the region grid's own lines (Production required per cell, FG age 75+ d per cell).
// Rows below are INVENTED, shaped like `fmMmSmRows` output. The frozen 16-Nov-2026 live fixture does not exist
// (it needs the live database), so the live counts (South Make next 28 / 22 / 15 = 65; 31 South and 12 West
// "sales, no stock" rows; Stock stuck 4 / 7 / 8) are NOT checked here and stay open on the ticket.
import { describe, it, expect } from 'vitest'
import fixture from './__fixtures__/fm-mm-sm-join-invented.json'
import { fmMmSmRows, fmMmSmWorklists, FM_MM_SM_NO_STOCK_MARK } from './calc'

// One invented South region. Bracket limits (whole days) FM 6/14/45/75, MM 9/20/60/90, SM 4/14/90/180.
const row = (id, section, size, thickness, std, tag, bracket, coverDays, inventory, rate) => ({
  id: `South|${id}`, region: 'South', section, size, thickness,
  cellKey: `${section}|${section === 'CHS' ? size.replace('NB', ' NB') : size}|${std}`,
  tag, coverDays, coverKind: bracket === 'No use' ? 'noUse' : bracket ? 'days' : 'none', bracket, inventory, rate,
})
const A = row('70x70|2.0', 'SHS', '70x70', 2, '2', 'FM', 'Running out', 3, 2, 20)
const B = row('50x50|2.0', 'SHS', '50x50', 2, '2', 'MM', 'Running out', 0, 0, 30)        // sales, no stock
const C = row('60x60|3.0', 'SHS', '60x60', 3, '3', 'FM', 'Thin', 10, 10, 30)
const D = row('38x38|1.6', 'SHS', '38x38', 1.6, '1.6', 'FM', 'Running out', 0, 0, 50)     // sales, no stock
const E = row('80x40|2.0', 'RHS', '80x40', 2, '2', 'SM', 'Thin', 10, 1, 3)
const F = row('25NB|2.0', 'CHS', '25NB', 2, '2', 'FM', 'Healthy', 30, 30, 30)
const G = row('72x72|3.0', 'SHS', '72x72', 3, '3', 'MM', 'Heavy', 70, 40, 17)
const H = row('100x100|4.0', 'SHS', '100x100', 4, '4', 'SM', 'Too much', 200, 60, 9)
const I = row('40NB|3.0', 'CHS', '40NB', 3, '3', 'No sales', 'No use', null, 30, 0)
const J = row('65x65|2.0', 'SHS', '65x65', 2, '2', 'No sales', 'No use', null, 20, 0)
const K = row('25x25|1.2', 'SHS', '25x25', 1.2, '1.2', 'No sales', '', null, 0, 0)       // no stock, no sales
const L = row('96x48|2.0', 'RHS', '96x48', 2, '2', 'FM', 'Heavy', 50, 50, 30)
const ROWS = [A, B, C, D, E, F, G, H, I, J, K, L]

const ids = (sections) => sections.map(s => [s.section, s.rows.map(r => r.id.slice(6))])

describe('fmMmSmWorklists — Make next', () => {
  it('holds the Running out and Thin SKUs, section by section (SHS, RHS, CHS), no section left empty', () => {
    const { makeNext } = fmMmSmWorklists(ROWS)
    expect(makeNext.groups).toHaveLength(1)
    expect(ids(makeNext.groups[0].sections)).toEqual([
      ['SHS', ['38x38|1.6', '70x70|2.0', '50x50|2.0', '60x60|3.0']],
      ['RHS', ['80x40|2.0']],
    ])
  })

  it('Priority order: Running out before Thin, then FM before MM before SM, then the biggest Blended monthly rate', () => {
    // SHS: D (Running out, FM, 50 T a month) · A (Running out, FM, 20) · B (Running out, MM, 30) · C (Thin, FM, 30)
    const { makeNext } = fmMmSmWorklists(ROWS)
    expect(makeNext.groups[0].sections[0].rows.map(r => r.id)).toEqual([D.id, A.id, B.id, C.id])
  })

  it('a SKU with sales and no stock stays in Make next and carries the marker; no other row does', () => {
    const { makeNext, stockStuck } = fmMmSmWorklists(ROWS)
    const marked = makeNext.groups.flatMap(g => g.sections.flatMap(s => s.rows)).filter(r => r.noStock).map(r => r.id)
    expect(marked.sort()).toEqual([B.id, D.id].sort())
    expect(stockStuck.groups.flatMap(g => g.sections.flatMap(s => s.rows)).some(r => r.noStock)).toBe(false)
    expect(FM_MM_SM_NO_STOCK_MARK).toBe('No stock')
  })
})

describe('fmMmSmWorklists — the Priority / Size switch', () => {
  it('Size re-sorts inside every section (smallest size, then thickness) and nothing leaves or enters a list', () => {
    const priority = fmMmSmWorklists(ROWS)
    const size = fmMmSmWorklists(ROWS, { order: 'size' })
    expect(ids(size.makeNext.groups[0].sections)).toEqual([
      ['SHS', ['38x38|1.6', '50x50|2.0', '60x60|3.0', '70x70|2.0']],
      ['RHS', ['80x40|2.0']],
    ])
    expect(ids(size.stockStuck.groups[0].sections)).toEqual([['SHS', ['72x72|3.0', '100x100|4.0']], ['RHS', ['96x48|2.0']]])
    ;['makeNext', 'stockStuck'].forEach(k => {
      priority[k].groups.forEach((g, gi) => {
        const other = size[k].groups[gi]
        expect([other.count, other.inventory]).toEqual([g.count, g.inventory])
        g.sections.forEach((s, si) => {
          expect(other.sections[si].section).toBe(s.section)
          expect(other.sections[si].rows.map(r => r.id).sort()).toEqual(s.rows.map(r => r.id).sort())
        })
      })
    })
  })
})

describe('fmMmSmWorklists — the grid’s own cell figures on each row', () => {
  // Two SKU lines on H's cell (SHS 100x100, 4.0 mm) and one on G's: the FG age grid's 75+ d band (`age3`)
  // is the cell's sum, the same figure the FG age grid prints for that cell.
  const gridLines = [
    { section: 'SHS', size: '100x100', stdThickness: 4, age0: 1, age1: 2, age2: 0, age3: 7, aged: 10 },
    { section: 'SHS', size: '100x100', stdThickness: 4, age0: 0, age1: 0, age2: 0, age3: 4.5, aged: 4.5 },
    { section: 'SHS', size: '72x72', stdThickness: 3, age0: 40, age1: 0, age2: 0, age3: 0, aged: 40 },
    { section: 'RHS', size: '96x48', stdThickness: 2, age0: null, age1: null, age2: null, age3: null, aged: null },
  ]
  const required = new Map([['SHS|38x38|1.6', 12.5], ['SHS|70x70|2', 3]])
  const find = (l, id) => l.groups.flatMap(g => g.sections.flatMap(s => s.rows)).find(r => r.id === id)

  it('FG age 75+ d is the cell’s 75+ d band; a cell with no line reads 0, an unknown stock reads null ("?")', () => {
    const { stockStuck } = fmMmSmWorklists(ROWS, { gridLines, required })
    expect(find(stockStuck, H.id).age75).toBeCloseTo(11.5, 9)
    expect(find(stockStuck, G.id).age75).toBe(0)
    expect(find(stockStuck, L.id).age75).toBeNull()
    expect(find(stockStuck, J.id).age75).toBe(0)
  })

  it('Production required is the cell’s (Pending to Dispatch less Closing stock); none on the grid reads 0, unknown reads null', () => {
    const { makeNext } = fmMmSmWorklists(ROWS, { gridLines, required })
    expect(find(makeNext, D.id).required).toBe(12.5)
    expect(find(makeNext, A.id).required).toBe(3)
    expect(find(makeNext, C.id).required).toBe(0)
    expect(find(fmMmSmWorklists(ROWS, { gridLines, required: null }).makeNext, D.id).required).toBeNull()
  })

  it('without the grid’s lines both figures are null, never a guessed 0', () => {
    const { makeNext } = fmMmSmWorklists(ROWS)
    expect(find(makeNext, D.id).required).toBeNull()
    expect(find(makeNext, D.id).age75).toBeNull()
  })
})

describe('fmMmSmWorklists — Stock stuck', () => {
  it('holds Heavy and Too much, most Current inventory first, then No use as its own group', () => {
    const { stockStuck } = fmMmSmWorklists(ROWS)
    expect(stockStuck.groups.map(g => g.key)).toEqual(['over', 'noUse'])
    // Heavy / Too much: SHS H (60 T) · G (40 T); RHS L (50 T)
    expect(ids(stockStuck.groups[0].sections)).toEqual([['SHS', ['100x100|4.0', '72x72|3.0']], ['RHS', ['96x48|2.0']]])
    // No use: SHS J (20 T); CHS I (30 T)
    expect(ids(stockStuck.groups[1].sections)).toEqual([['SHS', ['65x65|2.0']], ['CHS', ['40NB|3.0']]])
  })

  it('a Healthy SKU and a No sales SKU with no stock are in neither list', () => {
    const { makeNext, stockStuck } = fmMmSmWorklists(ROWS)
    const all = [makeNext, stockStuck].flatMap(l => l.groups.flatMap(g => g.sections.flatMap(s => s.rows))).map(r => r.id)
    expect(all).not.toContain(F.id)
    expect(all).not.toContain(K.id)
    expect(all).toHaveLength(ROWS.length - 2)
  })

  it('section headings add up to their group, and the groups to the list heading (SKUs and tonnes)', () => {
    const { makeNext, stockStuck } = fmMmSmWorklists(ROWS)
    // Worked: Make next 5 SKUs, 0 + 2 + 0 + 10 + 1 = 13 T. Stock stuck 3 SKUs 150 T + No use 2 SKUs 50 T = 5 SKUs, 200 T.
    expect([makeNext.count, makeNext.inventory]).toEqual([5, 13])
    expect([stockStuck.count, stockStuck.inventory]).toEqual([5, 200])
    expect(stockStuck.groups.map(g => [g.count, g.inventory])).toEqual([[3, 150], [2, 50]])
    ;[makeNext, stockStuck].forEach(l => {
      l.groups.forEach(g => {
        expect(g.sections.reduce((t, s) => t + s.count, 0)).toBe(g.count)
        expect(g.sections.reduce((t, s) => t + s.inventory, 0)).toBeCloseTo(g.inventory, 9)
      })
    })
  })
})

describe('fmMmSmWorklists — per region, from the invented #383 fixture', () => {
  const { stored, skus, productions, dispatches, today } = fixture
  const feed = { productions, dispatches, skus, stored, today }
  const flat = (l) => l.groups.flatMap(g => g.sections.flatMap(s => s.rows.map(r => [g.key, s.section, r.id, r.noStock])))

  it('South: Make next is 91x91 3.0 (MM, 0 d, sales and no stock: marked) then 50x50 3.0 (FM, Thin); Stock stuck is No use only', () => {
    const { makeNext, stockStuck } = fmMmSmWorklists(fmMmSmRows({ ...feed, region: 'South' }))
    expect(flat(makeNext)).toEqual([['short', 'SHS', 'South|91x91|3.0', true], ['short', 'SHS', 'South|50x50|3.0', false]])
    expect(flat(stockStuck)).toEqual([
      ['noUse', 'SHS', 'South|65x65|2.2', false],
      ['noUse', 'CHS', 'South|40NB|3.0', false], ['noUse', 'CHS', 'South|150NB|5.0', false],
    ])
    expect([stockStuck.groups[0].count, stockStuck.groups[1].count, stockStuck.groups[1].inventory]).toEqual([0, 3, 75])
  })

  it('West: nothing to make; its 40 T of 50x50 2.0 with no sales is No use', () => {
    const { makeNext, stockStuck } = fmMmSmWorklists(fmMmSmRows({ ...feed, region: 'West' }))
    expect(makeNext.count).toBe(0)
    expect(flat(stockStuck)).toEqual([['noUse', 'SHS', 'West|50x50|2.0', false]])
  })

  it('never mixes regions: rows of two regions in one call are refused', () => {
    const both = [...fmMmSmRows({ ...feed, region: 'South' }), ...fmMmSmRows({ ...feed, region: 'West' })]
    expect(() => fmMmSmWorklists(both)).toThrow(/one region/)
  })
})

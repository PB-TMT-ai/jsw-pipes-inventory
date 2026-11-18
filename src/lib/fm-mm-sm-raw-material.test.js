// #382 Raw material available and required on the FM / MM / SM sub-tab. Every expected figure is the
// worked example in docs/ALGORITHMS.md ("Raw material split"), done by hand on the invented fixture —
// never recomputed the way the code does it.
import { describe, it, expect } from 'vitest'
import { fmMmSmRawMaterial, fmMmSmRawRows, fmMmSmWorklists, fmMmSmRequiredByPlant, salesCoilBlocks, salesSizeLines,
  salesByDistributor, fmMmSmRawBySection, FM_MM_SM_OUTSIDE, DEFAULT_PLANTS, DEFAULT_STATE_REGIONS } from './calc'
import fx from './__fixtures__/fm-mm-sm-raw-material-invented.json'

// Production required per plant: { plant: { cellKey: T } } → Map(plant → Map(cellKey → T)).
const byPlant = (o) => new Map(Object.entries(o).map(([p, m]) => [p, new Map(Object.entries(m))]))
const run = (over = {}) => fmMmSmRawMaterial({
  coils: fx.coils, babyCoils: fx.babyCoils, productions: [], skus: fx.skus, plants: DEFAULT_PLANTS,
  to: fx.to, today: fx.today, region: fx.region, gridKeys: fx.gridKeys,
  requiredByPlant: byPlant(fx.requiredByPlant), ...over,
})
const withoutE = { babyCoils: fx.babyCoils.filter(b => b.babyCoilId !== 'LEP-201-A'),
  coils: fx.coils.filter(c => c.hrCoilId !== 'LEP-201') }

describe('fmMmSmRawMaterial — the written split, on the invented South fixture', () => {
  it('step 1: a coil that fits one size goes whole to it, even beyond its need', () => {
    const r = run(withoutE)
    expect(r.cells['SHS|50x50|2'].available).toBeCloseTo(3.0, 6)      // B: 3.0 against 1.0 needed
    expect(r.cells['SHS|50x50|2'].rawRequired).toBeCloseTo(0, 6)
    expect(r.cells['SHS|50x50|2'].shared).toBe(false)
  })

  it('step 2: shared coils split in proportion to what each size still needs (C then D)', () => {
    const r = run(withoutE)
    Object.entries(fx.expected.withoutE).forEach(([k, e]) => {
      expect(r.cells[k].available).toBeCloseTo(e.available, 6)
      expect(r.cells[k].rawRequired).toBeCloseTo(e.rawRequired, 6)
    })
    expect(r.totals.available).toBeCloseTo(9.5 + 1.0, 6)             // A+B+C+D, plus the 2.5 mm coil
    expect(r.totals.rawRequired).toBeCloseTo(2.8 + 0.2 + 0.4, 6)     // Lepakshi's 0.4 has no coil without E
  })

  it('the cap and the surplus, inside one plant: E covers Lepakshi’s 0.4, its 3.0 T extra goes 1.5 / 1.5', () => {
    const r = run()
    Object.entries(fx.expected.all).forEach(([k, e]) => {
      expect(r.cells[k].available).toBeCloseTo(e.available, 6)
      expect(r.cells[k].rawRequired).toBeCloseTo(e.rawRequired, 6)
    })
  })

  it('a shared coil nothing needs is all surplus, shared equally (2.5 mm band, 1.0 T → 0.5 / 0.5)', () => {
    const r = run()
    expect(r.cells['SHS|38x38|2.5'].available).toBeCloseTo(0.5, 6)
    expect(r.cells['RHS|50x25|2.5'].available).toBeCloseTo(0.5, 6)
    expect(r.cells['SHS|38x38|2.5'].required).toBe(0)
  })

  it('cells add up to the coil counted once; the by-plant table holds the rest', () => {
    const r = run()
    const sum = Object.values(r.cells).reduce((s, c) => s + c.available, 0)
    expect(sum).toBeCloseTo(fx.expected.fitsTotal, 6)
    expect(r.totals.fits).toBeCloseTo(fx.expected.fitsTotal, 6)
    expect(r.totals.coils).toBe(6)
    expect(r.totals.shared).toBe(4)
    Object.entries(fx.expected.byPlant).forEach(([id, e]) => {
      const p = r.plants.find(x => x.id === id)
      expect(p.hr).toBeCloseTo(e.hr, 6); expect(p.fits).toBeCloseTo(e.fits, 6)
      expect(p.coils).toBe(e.coils); expect(p.shared).toBe(e.shared)
      expect(p.noSize).toBeCloseTo(e.noSize, 6); expect(p.offGrid).toBeCloseTo(e.offGrid, 6)
    })
  })

  it('never crosses into a plant that does not serve the region: NPMD’s 9 T is not South’s', () => {
    const r = run()
    expect(r.plants.map(p => p.id).sort()).toEqual(['hyderabad', 'lepakshi'])
    const w = run({ region: 'West', requiredByPlant: new Map() })            // West's own grid, needing nothing here
    expect(w.plants.map(p => p.id)).toEqual(['npmd'])
    expect(w.cells['SHS|38x38|2'].available).toBeCloseTo(4.5, 6)      // NPMD's 9 T, all surplus, half each
    expect(w.totals.fits).toBeCloseTo(9, 6)
  })

  it('never crosses plants: Hyderabad’s spare coil does not cover Lepakshi’s need in the same South cell', () => {
    const r = run({ ...withoutE, requiredByPlant: byPlant({ lepakshi: { 'SHS|38x38|2': 4 } }) })
    const c = r.cells['SHS|38x38|2']
    expect(c.available).toBeCloseTo(4.25, 6)                          // Hyderabad, needing nothing: A 2.0 + half of C and D (0.75 + 1.5)
    expect(c.required).toBeCloseTo(4, 6)
    expect(c.rawRequired).toBeCloseTo(4, 6)                          // Lepakshi has no coil: its 4 T stays uncovered
    expect(r.totals.rawRequired).toBeCloseTo(4, 6)
  })

  it('a cell can show more coil than it needs and still need coil: 50x25 holds 2.2 T against 0.9 T, Hyderabad still short 0.2', () => {
    const c = run().cells['RHS|50x25|2']
    expect(c.available).toBeCloseTo(2.2, 6)                           // Hyderabad 0.3, Lepakshi 1.9
    expect(c.required).toBeCloseTo(0.9, 6)                            // Hyderabad 0.5 + Lepakshi 0.4
    expect(c.rawRequired).toBeCloseTo(0.2, 6)                         // pooled it would read 0
    expect(c.byPlant.hyderabad).toMatchObject({ required: 0.5 })
    expect(c.byPlant.hyderabad.available).toBeCloseTo(0.3, 6)
    expect(c.byPlant.lepakshi.rawRequired).toBe(0)
  })

  it('the Plant filter narrows the coil, never widens it: Hyderabad alone loses E', () => {
    const r = run({ stockPlants: ['hyderabad'] })
    expect(r.plants.map(p => p.id)).toEqual(['hyderabad'])
    expect(r.cells['SHS|38x38|2'].available).toBeCloseTo(6.2, 6)
    expect(r.cells['SHS|38x38|2'].rawRequired).toBeCloseTo(2.8, 6)
  })

  it('a shared cell names its sizes and the plant each share comes from', () => {
    const c = run().cells['SHS|38x38|2']
    expect(c.shared).toBe(true)
    const hyd = c.shares.find(s => s.plant === 'hyderabad'), lep = c.shares.find(s => s.plant === 'lepakshi')
    expect(hyd.sizes).toEqual(['38x38', '50x25'])
    expect(hyd.weight).toBeCloseTo(1.4 + 2.8, 6)                     // C and D
    expect(lep.weight).toBeCloseTo(1.5, 6)                           // E: no Lepakshi need here, half its 3.0 surplus
    expect(lep.name).toBe('Lepakshi')
  })

  it('a cell needing production with no coil keeps a row, all of it still required', () => {
    const r = run({ requiredByPlant: byPlant({ ...fx.requiredByPlant, hyderabad: { ...fx.requiredByPlant.hyderabad, 'SHS|60x60|2': 4 } }) })
    expect(r.cells['SHS|60x60|2'].available).toBe(0)
    expect(r.cells['SHS|60x60|2'].rawRequired).toBe(4)
  })

  it('Production required unknown → Raw material required unknown, never 0', () => {
    const r = run({ requiredByPlant: null })
    expect(r.cells['SHS|38x38|2'].rawRequired).toBeNull()
    expect(r.totals.rawRequired).toBeNull()
  })

  it('Make next rows carry their cell’s Raw material available and required (#380 list, #382 columns)', () => {
    const raw = run(withoutE)
    const row = (id, cellKey, bracket) => ({ id, region: 'South', section: cellKey.split('|')[0], size: cellKey.split('|')[1],
      thickness: 2, cellKey, tag: 'FM', coverKind: 'days', coverDays: 3, bracket, inventory: 1, rate: 10 })
    const required = new Map(Object.entries(fx.requiredByPlant.hyderabad))
    const l = fmMmSmWorklists([row('a', 'SHS|38x38|2', 'Running out'), row('b', 'SHS|40x40|2', 'Thin')], { required, raw })
    const rows = l.makeNext.groups.flatMap(g => g.sections.flatMap(s => s.rows))
    const a = rows.find(r => r.id === 'a'), b = rows.find(r => r.id === 'b')
    expect(a.rawAvailable).toBeCloseTo(6.2, 6)
    expect(a.rawRequired).toBeCloseTo(2.8, 6)
    expect(b.rawAvailable).toBe(0)                                    // no coil, no need on that cell
    expect(b.rawRequired).toBe(0)
    const none = fmMmSmWorklists([row('a', 'SHS|38x38|2', 'Running out')], { required })
    expect(none.makeNext.groups.flatMap(g => g.sections.flatMap(s => s.rows))[0].rawAvailable).toBeNull()
  })

  it('grid rows: one per section and size, a cell per band, cut by the filters; totals of what is shown', () => {
    const g = fmMmSmRawRows(run())
    expect(g.rows.map(r => `${r.section} ${r.size}`)).toEqual(['SHS 38x38', 'SHS 50x50', 'RHS 50x25'])
    expect(g.thicknesses).toEqual(['2', '2.5'])
    expect(g.total.available).toBeCloseTo(13.9, 6)
    expect(g.total.required).toBeCloseTo(10.9, 6)                    // Hyderabad 10.5 + Lepakshi 0.4
    expect(g.total.rawRequired).toBeCloseTo(3.0, 6)                  // Hyderabad's 2.8 + 0.2, uncovered
    expect(g.rows[0].total.available).toBeCloseTo(8.2, 6)            // 7.7 at 2.0 + 0.5 at 2.5
    const cut = fmMmSmRawRows(run(withoutE), { thicknesses: [2], sizes: ['38x38'] })
    expect(cut.rows.map(r => r.size)).toEqual(['38x38'])
    expect(cut.total.available).toBeCloseTo(6.2, 6)
    expect(cut.total.rawRequired).toBeCloseTo(2.8, 6)
  })

  it('the Dashboard’s Slit coil that fits is unchanged: a shared coil still sits in every size', () => {
    const d = salesCoilBlocks({ coils: fx.coils, babyCoils: fx.babyCoils, productions: [], skus: fx.skus, plants: DEFAULT_PLANTS,
      to: fx.to, today: fx.today, stockRegions: ['South'], gridKeys: fx.gridKeys })
    const at = (k) => d.plants.reduce((s, p) => s + (p.rows[k]?.cells['2']?.weight || 0), 0)
    expect(at('SHS|38x38')).toBeCloseTo(9.9, 6)                      // A + C + D + E
    expect(at('RHS|50x25')).toBeCloseTo(7.9, 6)                      // C + D + E
    expect(at('SHS|50x50')).toBeCloseTo(3.0, 6)
  })
})

describe('fmMmSmRequiredByPlant — each plant’s own Production required, as the Plant filter shows it', () => {
  const skus = [{ skuCode: 'SHS38x38x2', productType: 'SHS', height: 38, breadth: 38, thickness: 2, length: 6000, weightPerTube: 10 }]
  const order = (id, plant, c) => ({ id, mmId: 'SHS38x38x2', distributorCode: 'S-1', shipToState: 'TELANGANA', orderStatus: 'Confirmed', confirmed: c, nonConfirmed: 0, plant })
  const orders = [order('o1', 'hyderabad', 5), order('o2', 'lepakshi', 3), order('o3', 'npmd', 7)]
  const productions = [{ id: 'p1', skuCode: 'SHS38x38x2', totalWeight: 2, dateOfProduction: '2026-11-01', plant: 'hyderabad' }]
  const base = { orders, dispatches: [], productions, skus, plants: DEFAULT_PLANTS, stateRegions: DEFAULT_STATE_REGIONS,
    from: '2026-11-01', to: '2026-11-16', today: '2026-11-16', region: 'South' }

  it('one map per plant serving the region: its own orders less its own stock', () => {
    const m = fmMmSmRequiredByPlant(base)
    expect([...m.keys()].sort()).toEqual(['hyderabad', 'lepakshi'])     // NPMD serves West
    expect(m.get('hyderabad').get('SHS|38x38|2')).toBeCloseTo(3, 6)      // 5 ordered − 2 made there
    expect(m.get('lepakshi').get('SHS|38x38|2')).toBeCloseTo(3, 6)       // 3 ordered, nothing made there
  })

  it('equals the grid run on that plant alone (the Plant filter’s figure)', () => {
    const rows = salesByDistributor(orders.filter(o => o.plant === 'lepakshi'), [], '', skus, { stateRegions: DEFAULT_STATE_REGIONS, plants: DEFAULT_PLANTS, from: base.from, to: base.to })
    const grid = salesSizeLines({ distRows: rows.filter(r => r.region === 'South'), productions, dispatches: [], skus, plants: DEFAULT_PLANTS,
      from: base.from, to: base.to, today: base.today, stockRegions: ['South'], stockPlants: ['lepakshi'] })
    expect(fmMmSmRequiredByPlant(base).get('lepakshi')).toEqual(grid.required)
  })

  it('the Plant filter narrows the plants; an unknown region gives null (unknown, not 0)', () => {
    expect([...fmMmSmRequiredByPlant({ ...base, stockPlants: ['lepakshi'] }).keys()]).toEqual(['lepakshi'])
    expect(fmMmSmRequiredByPlant({ ...base, region: 'Unmapped' })).toBeNull()
  })
})

describe('fmMmSmRawBySection — the Raw material chip on the By FM / MM / SM tab, split into the tag sections', () => {
  const line = (section, size, t) => ({ section, size, stdThickness: t })
  const tagSections = [
    { key: 'FM', label: 'FM', lines: [line('SHS', '38x38', 2)] },
    { key: 'MM', label: 'MM', lines: [] },
    { key: 'SM', label: 'SM', lines: [] },
    { key: 'No sales', label: 'No sales', lines: [line('SHS', '50x50', 2)] },
    { key: 'outside', label: FM_MM_SM_OUTSIDE, lines: [line('RHS', '50x25', 2)] },
  ]

  it('each cell goes to the section its grid cell sits in; one no section holds goes to Not tagged / Outside the plan', () => {
    const out = fmMmSmRawBySection(run(), tagSections)
    expect(out.map(s => s.key)).toEqual(['FM', 'MM', 'SM', 'No sales', 'outside'])
    const keys = (k) => Object.keys(out.find(s => s.key === k).raw.cells).sort()
    expect(keys('FM')).toEqual(['SHS|38x38|2'])
    expect(keys('MM')).toEqual([])
    expect(keys('outside')).toEqual(['RHS|50x25|2', 'RHS|50x25|2.5', 'SHS|38x38|2.5'])
  })

  it('the No sales section keeps its raw material figures (an order can exist for a SKU that never sells)', () => {
    const ns = fmMmSmRawBySection(run(), tagSections).find(s => s.key === 'No sales')
    expect(ns.raw.cells['SHS|50x50|2'].available).toBeCloseTo(3.0, 6)
    expect(ns.raw.cells['SHS|50x50|2'].required).toBeCloseTo(1.0, 6)
  })

  it('the sections add up to the whole split, each cell once', () => {
    const out = fmMmSmRawBySection(run(), tagSections)
    const sum = out.reduce((t, s) => t + Object.values(s.raw.cells).reduce((a, c) => a + c.available, 0), 0)
    expect(sum).toBeCloseTo(fx.expected.fitsTotal, 6)
  })
})

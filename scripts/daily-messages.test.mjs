// ── Guard: the daily messages say what the workbook says (ticket #128) ──────────────────────────
// The PB MTD workbook and the two daily WhatsApp messages describe the same book. The workbook is
// covered by reports.test.js; the messages are rendered from what these scripts print, and nothing
// covered that — a script is where "computed through the same helper" quietly stops being true.
//
// So these tests run the real scripts, in a real Node process, offline via `--in`. That makes them
// also the module-resolution guard for the scripts themselves: an extensionless import inside
// either one fails here rather than at 8am.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { buildPlantMtdSummary, buildRegionMtdSummary } from '../src/lib/reports.js'

const D = '2026-08-18'

// The same shape as the #127 fixtures in reports.test.js, reduced to what the two splits read:
// Hyderabad's 761.441 MT against NPMD's 1044.000 MT, and only Hyderabad has ever invoiced.
const orders = [
  { id: 'o1', deleted: false, plant: 'hyderabad', orderDate: '2026-08-10', customer: 'PATEL STEEL', distributorCode: 'D1', shipToState: 'TELANGANA', orderStatus: '', mmId: 'S1', description: 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.00x6000', confirmed: 400, nonConfirmed: 361.441 },
  { id: 'o2', deleted: false, plant: 'npmd', orderDate: '2026-08-10', customer: 'PUNE STEEL', distributorCode: 'D2', shipToState: 'MAHARASHTRA', orderStatus: '', mmId: 'S1', description: 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.00x6000', confirmed: 0, nonConfirmed: 1044 },
]
const dispatches = [
  { id: 'd1', deleted: false, dateOfDispatch: '2026-08-12', bundleEntries: [{ plant: 'hyderabad', distributorCode: 'D1', customer: 'PATEL STEEL', shipToState: 'TELANGANA', skuCode: 'S1', weight: 463.5, pieces: 100 }] },
]
const skus = [
  { id: 's1', deleted: false, skuCode: 'S1', description: 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.00x6000', productType: 'SHS', height: 50, breadth: 50, thickness: 2, length: 6000, weightPerTube: 18.5 },
]
const productions = [
  { id: 'p1', deleted: false, plant: 'hyderabad', dateOfProduction: '2026-08-05', skuCode: 'S1', tubeCount: 1000, totalWeight: 18.5 },
]

let dir
const fixture = (name, obj) => { const p = join(dir, `${name}.json`); writeFileSync(p, JSON.stringify(obj)); return p }
const run = (script, args) =>
  execFileSync(process.execPath, [resolve(process.cwd(), 'scripts', script), ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'jsw-daily-')) })
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('scripts/daily-splits.mjs — what the daily message prints (#128)', () => {
  const split = () => JSON.parse(run('daily-splits.mjs', ['--date', D, '--in', fixture('rows', { orders, dispatches, stateRegions: null })]))

  // The whole acceptance criterion in one assertion: the message's plant figures ARE the workbook's,
  // because there is one implementation of them. A second one added here would pass every Σ check
  // and still print a different Hyderabad.
  it('emits the same plant split the workbook builds, field for field', () => {
    expect(split().plantSplit).toEqual(JSON.parse(JSON.stringify(buildPlantMtdSummary(orders, dispatches, { date: D }))))
  })

  it('emits the region split unchanged alongside it, from one read of the book', () => {
    const s = split()
    expect(s.regionSplit).toEqual(JSON.parse(JSON.stringify(buildRegionMtdSummary(orders, dispatches, { date: D, stateRegions: null }))))
    // Two cuts of one book: whatever the message prints under either heading adds to one headline.
    expect(s.plantSplit.totals.pending).toBeCloseTo(s.regionSplit.totals.pending, 6)
    expect(s.plantSplit.totals.invoicedMtd).toBeCloseTo(s.regionSplit.totals.invoicedMtd, 6)
  })

  it('splits the headline per plant and names whose the Invoiced column is', () => {
    const s = split()
    const by = Object.fromEntries(s.plantSplit.plants.map(p => [p.name, p.pending]))
    expect(by.Hyderabad).toBeCloseTo(761.441, 3)
    expect(by.NPMD).toBeCloseTo(1044, 3)
    expect(s.plantSplit.totals.pending).toBeCloseTo(1805.441, 3)
    expect(s.plantSplit.invoicing).toMatchObject({ onlyPlant: 'Hyderabad', suffix: ' · Hyderabad only' })
    expect(s.plantSplit.checks).toMatchObject({ invoicedTiesToAllPlants: true, pendingTiesToAllPlants: true })
  })
})

describe('scripts/servable-orders.mjs — the message names whose floor it is (#128)', () => {
  // Named per case, never derived from the rows: two cases hashing to one filename would silently
  // feed one test the other's book.
  const message = (name, rows) => run('servable-orders.mjs', ['--date', D, '--in', fixture(name, rows)])
  const rows = { orders, dispatches, productions, skus, babyCoils: [], stateRegions: null }

  it('names the plant the stock is standing on', () => {
    expect(message('one-floor', rows)).toContain('🏭 Stock made at: Hyderabad')
  })

  // The message used to say "the plant" and mean it — there was only one. With two floors in the
  // same tables an unnamed floor is a claim, and a wrong one.
  it('names both floors, and says they are combined, once a second plant produces', () => {
    const twoFloors = { ...rows, productions: [...productions, { id: 'p2', deleted: false, plant: 'npmd', dateOfProduction: '2026-08-06', skuCode: 'S1', tubeCount: 500, totalWeight: 9.25 }] }
    const out = message('two-floors', twoFloors)
    expect(out).toContain('🏭 Stock made at: Hyderabad + NPMD — combined, not split by plant')
    expect(out).toContain('On-hand combines Hyderabad, NPMD')
  })

  // `Unattributed` is not a plant (CONTEXT.md), so it may never be printed as one — on either path.
  // Two causes, two sentences: a production row nobody labelled, and an aggregated bundle too old to
  // carry the column at all.
  it('never calls the labelling gap a plant', () => {
    const unlabelled = { ...rows, productions: [{ ...productions[0], plant: '' }] }
    const out = message('no-plant-on-rows', unlabelled)
    expect(out).toContain('🏭 Stock: made at a plant nobody has labelled')
    expect(out).not.toContain('Unattributed plant')
  })

  // Three plants producing must not read "both floors" — the message has four to choose from.
  it('names every floor it counted, however many there are', () => {
    const three = { ...rows, productions: [
      productions[0],
      { ...productions[0], id: 'p2', plant: 'npmd' },
      { ...productions[0], id: 'p3', plant: 'lepakshi' },
    ] }
    expect(message('three-floors', three)).toContain('🏭 Stock made at: Hyderabad + NPMD + Lepakshi — combined, not split by plant')
  })

  // The aggregated path (the one an agent uses when the egress policy blocks Supabase) has two ways
  // to have no plant, and they are not the same fact: a bundle built before #128 never carried the
  // column, while a current bundle can carry a row nobody labelled. Reporting the second as the
  // first sends an operator off to rebuild a query that was fine.
  it('tells a stale bundle apart from an unlabelled production row', () => {
    const bundle = (prod) => ({
      skus: [['S1', 'SHS', 50, 50, null, 2, 6000, '4923', 18.5]],
      prod, disp: [['S1', 10, 100]],
      orders: [{ code: 'D1', name: 'PATEL STEEL', state: 'TELANGANA', lines: [['S1', 30, 10]] }],
      missingDesc: [],
      checks: { pendingMt: 40, producedMt: 18.5, invoicedMt: 10 },
    })
    const agg = (name, prod) => run('servable-orders.mjs', ['--date', D, '--agg', fixture(name, bundle(prod))])
    expect(agg('agg-old', [['S1', 1000, 18.5]])).toContain('aggregated bundle carries no plant')
    expect(agg('agg-unlabelled', [['S1', 1000, 18.5, '']])).toContain('🏭 Stock: made at a plant nobody has labelled')
    expect(agg('agg-current', [['S1', 1000, 18.5, 'hyderabad']])).toContain('🏭 Stock made at: Hyderabad')
  })

  // Unchanged meanings are half of this ticket: the service area still filters the order book, and
  // the tonnage it excludes is still stated rather than dropped.
  it('keeps the service-area filter and still states the out-of-area book', () => {
    const out = run('servable-orders.mjs', ['--date', D, '--serves', 'South', '--in', fixture('serves-south', rows)])
    expect(out).toContain('📍 South only')
    expect(out).toMatch(/1044\.0 T pending sits with 1 distributor outside South/)
    expect(out).not.toContain('PUNE STEEL')
  })
})

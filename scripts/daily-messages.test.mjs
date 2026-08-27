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

describe('scripts/servable-orders.mjs — whose floor it is, and who may have it (#128, #129)', () => {
  // Named per case, never derived from the rows: two cases hashing to one filename would silently
  // feed one test the other's book.
  const message = (name, rows) => run('servable-orders.mjs', ['--date', D, '--in', fixture(name, rows)])
  const rows = { orders, dispatches, productions, skus, babyCoils: [], stateRegions: null }

  // PATEL STEEL is TELANGANA (South) and PUNE STEEL is MAHARASHTRA (West), so this one book spans
  // both service areas — which is what makes the assertions below about the boundary and not about
  // an empty report.
  it('names the plant the stock is standing on, and the region it serves', () => {
    expect(message('one-floor', rows)).toContain('🏭 Stock made at: Hyderabad (South)')
  })

  // The heart of #129: Hyderabad's 18.5 T is South's, and PUNE STEEL is in West. It may not be
  // offered a kilo of it, and the message has to say why rather than look like an outage.
  it('offers Hyderabad stock to South and says plainly that West has none', () => {
    // Enough Hyderabad production to survive the 463.5 T already invoiced off it, so South has a
    // real floor to be served from — otherwise both distributors read zero for the same reason and
    // the assertion would not be about the service area at all.
    const stocked = { ...rows, productions: [{ ...productions[0], tubeCount: 40000 }] }
    const out = message('south-only-stock', stocked)
    expect(out).toContain('PATEL STEEL')
    expect(out).not.toContain('PUNE STEEL')          // West: no West plant has produced
    expect(out).toContain('No stock for West — no plant serving it has produced any')
  })

  // Two floors serving two DIFFERENT areas are not combined and must not say they are — that
  // sentence was true when the pool was one and is the thing this ticket removed.
  it('names two floors separately when they serve different areas — never "combined"', () => {
    const twoFloors = { ...rows, productions: [...productions, { id: 'p2', deleted: false, plant: 'npmd', dateOfProduction: '2026-08-06', skuCode: 'S1', tubeCount: 500, totalWeight: 9.25 }] }
    const out = message('two-floors', twoFloors)
    expect(out).toContain('🏭 Stock made at: Hyderabad (South) + NPMD (West)')
    expect(out).not.toContain('combined, not split by plant')
    expect(out).not.toContain('On-hand for')          // they share no region, so nothing is summed
    expect(out).toContain('PUNE STEEL')                // West now has a floor of its own
  })

  // Two floors serving the SAME area ARE summed, and that is the case the warning is for.
  it('warns per region when two plants serving one area are summed into one on-hand', () => {
    const sameArea = { ...rows, productions: [...productions, { id: 'p2', deleted: false, plant: 'lepakshi', dateOfProduction: '2026-08-06', skuCode: 'S1', tubeCount: 500, totalWeight: 9.25 }] }
    const out = message('same-area', sameArea)
    expect(out).toContain('🏭 Stock made at: Hyderabad (South) + Lepakshi (South)')
    expect(out).toContain('On-hand for South combines Hyderabad and Lepakshi')
  })

  // `Unattributed` is not a plant (CONTEXT.md) and serves no region, so it can never be printed as
  // one — and since #129 its tonnage is offered to nobody, which the message must state outright
  // rather than quietly report an empty floor.
  it('never calls the labelling gap a plant, and says its stock reaches nobody', () => {
    const unlabelled = { ...rows, productions: [{ ...productions[0], plant: '' }] }
    const out = message('no-plant-on-rows', unlabelled)
    expect(out).toContain('🏭 Stock: no plant serving South + West has produced anything')
    expect(out).not.toContain('Unattributed')
  })

  // Three plants producing must not read "both floors" — the message has four to choose from.
  it('names every floor it counted, however many there are', () => {
    const three = { ...rows, productions: [
      productions[0],
      { ...productions[0], id: 'p2', plant: 'npmd' },
      { ...productions[0], id: 'p3', plant: 'lepakshi' },
    ] }
    expect(message('three-floors', three))
      .toContain('🏭 Stock made at: Hyderabad (South) + NPMD (West) + Lepakshi (South)')
  })

  // The plant master is what decides all of this, and it is a table — so re-pointing NPMD at South
  // has to move the message, not just the app.
  it('follows the plant master: re-point NPMD at South and West goes dark', () => {
    const repointed = {
      ...rows,
      productions: [...productions, { id: 'p2', deleted: false, plant: 'npmd', dateOfProduction: '2026-08-06', skuCode: 'S1', tubeCount: 500, totalWeight: 9.25 }],
      plants: [{ id: 'pl1', plantId: 'npmd', serves: ['South'], deleted: false }],
    }
    const out = message('repointed', repointed)
    expect(out).toContain('🏭 Stock made at: Hyderabad (South) + NPMD (South)')
    expect(out).toContain('No stock for West')
    expect(out).not.toContain('PUNE STEEL')
  })

  // The aggregated path (the one an agent uses when the egress policy blocks Supabase) cannot pool
  // per service area without a plant on BOTH halves of produced − invoiced. A bundle missing either
  // is refused outright: reporting from it would announce that nothing can be served at all.
  it('refuses an aggregated bundle that carries no plant on production or on dispatch', () => {
    const bundle = (prod, disp, masters = { stateRegions: [], plants: [], distributors: [] }) => ({
      skus: [['S1', 'SHS', 50, 50, null, 2, 6000, '4923', 18.5]],
      prod, disp,
      orders: [{ code: 'D1', name: 'PATEL STEEL', state: 'TELANGANA', lines: [['S1', 30, 10]] }],
      missingDesc: [],
      masters,
      checks: { pendingMt: 40, producedMt: 18.5, invoicedMt: 10 },
    })
    const agg = (name, prod, disp) => {
      try { return run('servable-orders.mjs', ['--date', D, '--agg', fixture(name, bundle(prod, disp))]) }
      catch (e) { return String(e.stdout || '') + String(e.stderr || '') }
    }
    expect(agg('agg-old', [['S1', 1000, 18.5]], [['S1', 10, 100]]))
      .toContain('carries no plant on its production tuples')
    expect(agg('agg-old-disp', [['S1', 1000, 18.5, 'hyderabad']], [['S1', 10, 100]]))
      .toContain('carries no plant on its dispatch tuples')
    expect(agg('agg-unlabelled', [['S1', 1000, 18.5, '']], [['S1', 10, 100, '']]))
      .toContain('🏭 Stock: no plant serving South has produced anything')
    expect(agg('agg-current', [['S1', 1000, 18.5, 'hyderabad']], [['S1', 10, 100, 'hyderabad']]))
      .toContain('🏭 Stock made at: Hyderabad (South)')
  })

  // The bundle's `masters` block is the one part of --agg that is not a Σ, because between them the
  // three masters decide which region a distributor is in and which floors serve it. A bundle
  // without them answers from the code seeds, and can contradict the Sales tab, the workbook and
  // daily-splits.mjs about who can be served — which is exactly what happened on 27-Aug-2026.
  it('refuses an aggregated bundle with no masters block, and follows one that has them', () => {
    const bundle = (masters) => {
      const b = {
        skus: [['S1', 'SHS', 50, 50, null, 2, 6000, '4923', 18.5]],
        prod: [['S1', 1000, 18.5, 'hyderabad']], disp: [['S1', 10, 100, 'hyderabad']],
        orders: [{ code: 'D1', name: 'PATEL STEEL', state: 'TELANGANA', lines: [['S1', 30, 10]] }],
        missingDesc: [], masters,
        checks: { pendingMt: 40, producedMt: 18.5, invoicedMt: 10 },
      }
      if (masters === undefined) delete b.masters
      return b
    }
    const agg = (name, masters, args = []) => {
      try { return run('servable-orders.mjs', ['--date', D, ...args, '--agg', fixture(name, bundle(masters))]) }
      catch (e) { return String(e.stdout || '') + String(e.stderr || '') }
    }
    // Absent: refused — it cannot be told apart from three empty tables.
    expect(agg('agg-no-masters', undefined)).toContain('carries no `masters` block')
    // Present but empty is a real answer: the tables hold nothing, so the seeds carry it.
    expect(agg('agg-empty-masters', { stateRegions: [], plants: [], distributors: [] }))
      .toContain('🏭 Stock made at: Hyderabad (South)')
    // A stored state→region row moves the message: Telangana typed to East leaves PATEL STEEL in a
    // region no plant serves, so --serves South must no longer match it.
    expect(agg('agg-state-master', { stateRegions: [['TELANGANA', 'East', false]], plants: [], distributors: [] },
      ['--serves', 'South'])).toContain('matched no distributor')
    // …and the per-distributor override wins over that state row, putting it back in South.
    expect(agg('agg-dist-override', {
      stateRegions: [['TELANGANA', 'East', false]], plants: [], distributors: [['D1', 'South', false]],
    }, ['--serves', 'South'])).toContain('🏭 Stock made at: Hyderabad (South)')
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

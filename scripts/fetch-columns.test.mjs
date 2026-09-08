// ── The fetch must ask for exactly what the figures read ────────────────────────────────────────
//
// scripts/daily-splits.mjs and scripts/servable-orders.mjs each hand-write a PostgREST `select=`
// list. Nothing tied those lists to what src/lib actually reads off a row, and that cost a headline:
// `orders` was fetched without `mm_id`, so salesByDistributor (calc.js, `const code = String(o.mmId
// || '').trim()`) built no per-SKU row for any order, and Servable – Unconfirmed printed 0.0 T
// against a real 591.6 T on 08-Sep-2026 while Pending to Dispatch fell from 909.0 T to 317.4 T.
// Every tie-out in the script still passed: servableWithinUnconfirmed is trivially true when
// servable is 0, so the run exited 0 and the daily broadcast went out understating the floor.
//
// Two guards, catching DIFFERENT faults. Neither subsumes the other:
//
//   (a) existence    every column a select NAMES is a real column   → catches a select that 400s
//   (b) sufficiency  every column the code READS is in the select   → catches a figure reading 0
//
// (a) cannot see a missing column. (b) cannot see a column that does not exist, because a fixture
// happily carries a key no table has — which is how servable-orders.mjs asked `skus` for `deleted`
// and `type` for months without a single test noticing that its live path could not run at all.
//
// Both read the select lists from `--cols` rather than regexing the sources. ORDER_COLS is two
// concatenated strings, and a regex that quietly matched a SUPERSET would turn (b) into a no-op.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

const D = '2026-08-31'
const run = (script, args) =>
  execFileSync(process.execPath, [resolve(process.cwd(), 'scripts', script), ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

// ── (a) The schema, read from the file that creates it ──────────────────────────────────────────
// Both DDL shapes count: half of what these scripts select (orders.plant, orders.confirmed,
// skus.weight_per_tube) arrived as an idempotent `alter table … add column`, not in a create block.
const sql = readFileSync(resolve(process.cwd(), 'supabase-setup.sql'), 'utf8')
  .replace(/--[^\n]*/g, '')                        // `plant text,   -- ticket #118`
const NOT_A_COLUMN = /^(unique|primary|foreign|constraint|check|exclude|like|partition)$/i

// Split on commas at paren depth 0 — `unique (distributor_key, month)` is ONE part, not two.
const topLevelParts = (body) => {
  const out = []
  let depth = 0, cur = ''
  for (const ch of body) {
    if (ch === '(') depth++
    else if (ch === ')') depth--
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  return out.concat(cur)
}

const schema = new Map()
const addCol = (t, c) => { if (!schema.has(t)) schema.set(t, new Set()); schema.get(t).add(c) }
for (const [, table, body] of sql.matchAll(/create table (?:if not exists )?(\w+)\s*\(([\s\S]*?)\n\s*\);/gi)) {
  if (!schema.has(table)) schema.set(table, new Set())
  for (const part of topLevelParts(body)) {
    const name = part.trim().split(/\s+/)[0]
    if (name && !NOT_A_COLUMN.test(name)) addCol(table, name)
  }
}
for (const [, t, c] of sql.matchAll(/alter table (\w+)\s+add column\s+(?:if not exists\s+)?(\w+)/gi)) addCol(t, c)

describe('(a) every column these scripts select exists in supabase-setup.sql', () => {
  // The parser's own control. A regex that over-matched — swallowing the file as one table body —
  // would make every assertion below pass while checking nothing. These pin that it discriminates:
  // the column that IS there, the one named differently, and the two that are not there at all.
  it('reads the DDL precisely enough to be worth trusting', () => {
    expect([...schema.keys()]).toEqual(expect.arrayContaining(
      ['orders', 'dispatches', 'productions', 'skus', 'coils', 'baby_coils', 'plants', 'distributors', 'state_regions']))
    expect(schema.get('orders')).toContain('mm_id')          // the column this whole file exists for
    expect(schema.get('orders')).toContain('plant')          // arrives via `alter table … add column`
    expect(schema.get('skus')).toContain('product_type')
    expect(schema.get('skus')).toContain('nominal_bore')
    expect(schema.get('skus')).not.toContain('type')         // servable-orders.mjs asked for this
    expect(schema.get('skus')).not.toContain('deleted')      // …and this; both 400 the whole fetch
    expect(schema.get('orders')).not.toContain('unique')     // constraint lines are not columns
  })

  it.each(['daily-splits.mjs', 'servable-orders.mjs'])('%s names no column the schema lacks', (script) => {
    const selects = JSON.parse(run(script, ['--cols']))
    const bad = []
    for (const [table, select] of Object.entries(selects)) {
      if (!schema.has(table)) { bad.push(`${table} — no such table`); continue }
      for (const col of select.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!schema.get(table).has(col)) bad.push(`${table}.${col}`)
      }
    }
    expect(bad).toEqual([])
  })
})

// ── (b) A book built so that dropping a column changes a printed number ─────────────────────────
// It cannot reuse scripts/daily-messages.test.mjs's fixture: that one produces 18.5 T at Hyderabad
// against a 463.5 T dispatch, so its South pool is floored at zero and servable is 0 whether or not
// `mm_id` is fetched. A round trip over it would have passed all through the outage it exists to
// catch. 60 000 tubes puts 1110 T on the floor, so the figure is real and CAN collapse — and South
// still ends short, so the partial case is exercised rather than the saturated one.
//
// Every feature below is here to make one named column load-bearing. Measured by dropping each
// column from the select in turn: 30 of them change the output, including all of `mm_id`,
// `description`, `nominal_bore`, `weight_per_tube`, `plants.serves` and `distributors.region`.
const SHS = 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.00x6000'
const CHS = 'MS CHS One Helix IS 1239 YSt 210 Black 33.7x2.9x6000'

const book = {
  skus: [
    { id: 's1', skuCode: 'S1', description: SHS, productType: 'SHS', height: 50, breadth: 50,
      nominalBore: '', outsideDiameter: '', thickness: 2, length: 6000, weightPerTube: 18.5, status: 'published' },
    // A CHS master row keys on its NOMINAL BORE ("25 NB"); an order that reaches it only through a
    // description keys on the section ("33.7x2.9"). Drop nominal_bore and the two wrongly merge.
    { id: 's2', skuCode: 'C1', description: CHS, productType: 'CHS', height: '', breadth: '',
      nominalBore: '25', outsideDiameter: 33.7, thickness: 2.9, length: 6000, weightPerTube: 4.4, status: 'published' },
  ],
  // `totalWeight` is deliberately stale: tonnage must come from tubeCount x weightPerTube
  // (CLAUDE.md non-negotiable), so dropping weight_per_tube has to change the answer, not fall back
  // to a frozen total that happens to agree.
  productions: [
    { id: 'p1', deleted: false, plant: 'hyderabad', dateOfProduction: '2026-08-05', skuCode: 'S1', tubeCount: 60000, totalWeight: 1 },
    { id: 'p2', deleted: false, plant: 'hyderabad', dateOfProduction: '2026-08-06', skuCode: 'C1', tubeCount: 20000, totalWeight: 1 },
  ],
  orders: [
    // South, the SHS book — the servable figure lives here.
    { id: 'o1', deleted: false, plant: 'hyderabad', orderDate: '2026-08-10', customer: 'PATEL STEEL', distributorCode: 'D1',
      lineId: 'L1', orderId: 'PO-1', childOrderId: 'CO-1', shipToState: 'TELANGANA', orderStatus: '',
      mmId: 'S1', description: SHS, confirmed: 400, nonConfirmed: 361.441 },
    // West by state, but the distributor master overrides it to South (ticket #129 / ADR-0003).
    { id: 'o2', deleted: false, plant: 'npmd', orderDate: '2026-08-10', customer: 'PUNE STEEL', distributorCode: 'D2',
      lineId: 'L2', orderId: 'PO-2', childOrderId: 'CO-2', shipToState: 'MAHARASHTRA', orderStatus: '',
      mmId: 'S1', description: SHS, confirmed: 0, nonConfirmed: 1044 },
    // An ERP code the SKU master does not carry — it reaches a physical identity ONLY through the
    // order line's own description, which is the other column that went missing.
    { id: 'o3', deleted: false, plant: 'hyderabad', orderDate: '2026-08-11', customer: 'ARIHANT STEEL', distributorCode: 'D3',
      lineId: 'L3', orderId: 'PO-3', childOrderId: 'CO-3', shipToState: 'KARNATAKA', orderStatus: '',
      mmId: 'C-ERP-9', description: CHS, confirmed: 0, nonConfirmed: 50 },
    // One distributor, two states, EARLIER line first — the most recent line decides its region.
    { id: 'o4', deleted: false, plant: 'npmd', orderDate: '2026-08-01', customer: 'KIRTI TUBES', distributorCode: 'D4',
      lineId: 'L4', orderId: 'PO-4', childOrderId: 'CO-4', shipToState: 'GUJARAT', orderStatus: '',
      mmId: 'S1', description: SHS, confirmed: 0, nonConfirmed: 20 },
    { id: 'o5', deleted: false, plant: 'hyderabad', orderDate: '2026-08-20', customer: 'KIRTI TUBES', distributorCode: 'D4',
      lineId: 'L5', orderId: 'PO-5', childOrderId: 'CO-5', shipToState: 'TAMIL NADU', orderStatus: '',
      mmId: 'S1', description: SHS, confirmed: 30, nonConfirmed: 60 },
    // Soft-deleted, carrying tonnage nobody may count.
    { id: 'o6', deleted: true, plant: 'hyderabad', orderDate: '2026-08-12', customer: 'PATEL STEEL', distributorCode: 'D1',
      lineId: 'L6', orderId: 'PO-6', childOrderId: 'CO-6', shipToState: 'TELANGANA', orderStatus: '',
      mmId: 'S1', description: SHS, confirmed: 999, nonConfirmed: 999 },
    // Delivered — off the open book.
    { id: 'o7', deleted: false, plant: 'hyderabad', orderDate: '2026-08-13', customer: 'PATEL STEEL', distributorCode: 'D1',
      lineId: 'L7', orderId: 'PO-7', childOrderId: 'CO-7', shipToState: 'TELANGANA', orderStatus: 'Delivered',
      mmId: 'S1', description: SHS, confirmed: 888, nonConfirmed: 888 },
  ],
  // Three bundle entries carrying NO code and NO customer of their own — each resolves to D1 through
  // a different link key, which is what makes line_id / order_id / child_order_id load-bearing.
  dispatches: [
    { id: 'd1', deleted: false, dateOfDispatch: '2026-08-12', bundleEntries: [
      { plant: 'hyderabad', orderLineId: 'L1', skuCode: 'S1', weight: 200, pieces: 10 },
      { plant: 'hyderabad', orderId: 'PO-1', skuCode: 'S1', weight: 150, pieces: 8 },
      { plant: 'hyderabad', childOrderId: 'CO-1', skuCode: 'S1', weight: 113.5, pieces: 6 },
    ] },
  ],
  coils: [{ id: 'c1', deleted: false, hrCoilId: 'H1', plant: 'hyderabad', actualWeight: 260 }],
  babyCoils: [{ id: 'b1', deleted: false, babyCoilId: 'B1', hrCoilId: 'H9', plant: 'hyderabad', weight: 44 }],
  stateRegions: null,
  plants: [
    { id: 'pl1', deleted: false, plantId: 'hyderabad', serves: 'South' },
    { id: 'pl2', deleted: false, plantId: 'npmd', serves: 'West' },
  ],
  distributors: [
    { id: 'dm1', deleted: false, distributorKey: 'D2', distributorName: 'PUNE STEEL', region: 'South' },
  ],
}

// snake_case → camelCase, TOP LEVEL ONLY. The keys inside dispatches.bundleEntries are already
// camelCase and no select list covers them; recursing would strip every entry to {}.
const camel = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
const project = (bundle, selects) => {
  const out = { ...bundle }
  for (const [table, select] of Object.entries(selects)) {
    const keep = new Set(select.split(',').map(s => camel(s.trim())).filter(Boolean))
    const key = camel(table)                       // baby_coils → babyCoils, state_regions → stateRegions
    // `null` is meaningful here — "this master is absent, use the code seed" — so it is left alone.
    if (Array.isArray(out[key])) out[key] = out[key].map(r => Object.fromEntries(
      Object.entries(r).filter(([k]) => keep.has(k))))
  }
  return out
}

describe('(b) every column these scripts read is in the select they send', () => {
  let dir
  beforeAll(() => { dir = mkdtempSync(join(tmpdir(), 'jsw-cols-')) })
  afterAll(() => rmSync(dir, { recursive: true, force: true }))
  const fixture = (name, obj) => {
    const p = join(dir, `${name}.json`); writeFileSync(p, JSON.stringify(obj)); return p
  }

  it('daily-splits.mjs — the servable split survives the round trip', () => {
    const selects = JSON.parse(run('daily-splits.mjs', ['--cols']))
    const whole = JSON.parse(run('daily-splits.mjs', ['--date', D, '--in', fixture('whole', book)]))

    // The line that keeps this test honest. If the book cannot produce a servable figure, the round
    // trip compares 0 with 0 and proves nothing — which is exactly how this bug survived the
    // existing suite. Assert the figure is real BEFORE asserting it is unchanged.
    expect(whole.servableSplit.totals.servableUnconfirmed).toBeGreaterThan(1)

    const thin = JSON.parse(run('daily-splits.mjs', ['--date', D, '--in', fixture('thin', project(book, selects))]))
    expect(thin).toEqual(whole)
  })

  it('servable-orders.mjs — the per-distributor report survives the round trip', () => {
    const selects = JSON.parse(run('servable-orders.mjs', ['--cols']))
    const whole = JSON.parse(run('servable-orders.mjs', ['--date', D, '--json', '--in', fixture('so-whole', book)]))

    // Same precondition, in this script's own terms: distributors on the list, with stock behind
    // them. Compared as JSON, not as the WhatsApp text — a text diff hides a figure that still
    // rounds to the same 0.1 T.
    expect(whole.totals.distributors).toBeGreaterThan(1)
    expect(whole.distributors.reduce((a, r) => a + r.servable, 0)).toBeGreaterThan(1)

    const thin = JSON.parse(run('servable-orders.mjs', ['--date', D, '--json', '--in', fixture('so-thin', project(book, selects))]))
    expect(thin).toEqual(whole)
  })
})

// What (b) cannot prove, so that nobody reads more into a green run than is there:
//   • `created_at` is load-bearing only as the SERVER-SIDE sort key (`order=created_at.asc,id.asc`,
//     which distributorOrderIndex depends on — it takes the first non-blank row per link key). No
//     --in fixture reaches that ordering; (a) covers the column's existence and nothing covers the
//     ORDER BY, which is why both scripts carry it in a comment instead.
//   • sufficiency, never minimality. It will never tell you a column is fetched and read by nobody.

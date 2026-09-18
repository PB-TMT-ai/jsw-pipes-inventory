import { describe, it, expect, vi } from 'vitest'

// db.js imports ./supabase, which calls createClient() at module load with the
// VITE_SUPABASE_* env vars (undefined in unit tests → would throw). Stub it so we
// can import the pure toCamel/toSnake helpers.
vi.mock('./supabase', () => ({ supabase: {} }))

import { toCamel, toSnake, conflictTargetFor, replaceAllRows, rowsOutsideWindow, verifyLoginDetails } from './db'
import { ALL_PLANTS, filterByPlant } from './calc'

// Minimal PostgREST-shaped stub. Records every call so a test can assert on WHAT was sent
// (predicate vs. id list), in WHAT ORDER, and on how many batches it took. `live` seeds the rows
// the table already holds, so a test can prove what survives a failure.
function stubClient({ failSelect = null, failInsert = null, failInsertAfter = null, failSupersede = null, live = [] } = {}) {
  const calls = { select: [], update: [], delete: [], insert: [] }
  const order = []                     // every op in the order it was issued
  let inserts = 0                      // `failInsertAfter: 2` = chunks 2 onward are rejected
  const client = {
    from: (table) => ({
      select: () => {
        // Date filters are recorded AND applied, so a windowed test proves what the server would
        // have returned rather than what the caller hoped for.
        const filters = []
        const eqs = []                 // recorded, not applied — the rows here carry no `deleted`
        const builder = {
          eq: (col, value) => { eqs.push({ col, value }); return builder },
          gte: (col, value) => { filters.push({ op: 'gte', col, value }); return builder },
          lte: (col, value) => { filters.push({ op: 'lte', col, value }); return builder },
          order: () => builder,
          range: (from, to) => {
            calls.select.push({ table, from, to, filters, eqs })
            order.push('select')
            if (failSelect) return Promise.resolve({ data: null, error: failSelect })
            // A NULL date satisfies neither bound in Postgres, so an undated row is inside no
            // window — the stub has to be as unforgiving as PostgREST or the test proves nothing.
            const visible = live.filter(r => filters.every(f => r[f.col] != null &&
              (f.op === 'gte' ? r[f.col] >= f.value : r[f.col] <= f.value)))
            return Promise.resolve({ data: visible.slice(from, to + 1), error: null })
          },
        }
        return builder
      },
      update: (patch) => ({
        in: (col, ids) => {
          calls.update.push({ table, patch, col, ids })
          order.push('update')
          return Promise.resolve({ error: failSupersede })
        },
      }),
      delete: () => ({
        in: (col, ids) => {
          calls.delete.push({ table, col, ids })
          order.push('delete')
          return Promise.resolve({ error: failSupersede })
        },
      }),
      insert: (rows) => {
        calls.insert.push({ table, rows })
        order.push('insert')
        inserts += 1
        const rejected = failInsert || (failInsertAfter && inserts >= failInsertAfter ? { message: 'bad row' } : null)
        return Promise.resolve({ error: rejected })
      },
    }),
  }
  return { client, calls, order }
}

const rows = (n, prefix = 'r') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, invoiceNo: `INV${i}` }))

describe('replaceAllRows', () => {
  it('supersedes the ids that are live SERVER-SIDE, not the caller\'s snapshot', async () => {
    // The July 2026 2x bug: this tab never loaded the rows another upload created, so a
    // snapshot-driven replace left them live and appended on top. The id list must come from
    // the server read inside the write — note the caller passes rows that share none of them.
    const { client, calls } = stubClient({ live: rows(3, 'server') })
    await replaceAllRows('dispatches', rows(1, 'fresh'), client)
    expect(calls.update).toHaveLength(1)
    expect(calls.update[0].patch).toEqual({ deleted: true })
    expect(calls.update[0].ids).toEqual(['server0', 'server1', 'server2'])
  })

  it('inserts the new rows BEFORE superseding the old ones', async () => {
    // The 2026-08-20 emptied order book: supersede-then-insert leaves the table empty whenever
    // the insert is rejected. Order is the fix, so order is the assertion.
    const { client, order: seq } = stubClient({ live: rows(2, 'old') })
    await replaceAllRows('orders', rows(2), client)
    expect(seq).toEqual(['select', 'insert', 'delete'])
  })

  it('hard-deletes for orders and soft-deletes for dispatches', async () => {
    const hard = stubClient({ live: rows(2, 'old') })
    await replaceAllRows('orders', rows(1), hard.client)
    expect(hard.calls.delete).toHaveLength(1)
    expect(hard.calls.update).toHaveLength(0)

    const soft = stubClient({ live: rows(2, 'old') })
    await replaceAllRows('dispatches', rows(1), soft.client)
    expect(soft.calls.update).toHaveLength(1)
    expect(soft.calls.delete).toHaveLength(0)
  })

  it('writes rows snake_cased', async () => {
    const { client, calls } = stubClient()
    await replaceAllRows('orders', [{ id: 'a', invoiceNo: 'INV1' }], client)
    expect(calls.insert[0].rows).toEqual([{ id: 'a', invoice_no: 'INV1' }])
  })

  it('chunks a large rebuild instead of sending one oversized request', async () => {
    const { client, calls } = stubClient()
    await replaceAllRows('orders', rows(429), client)   // the real daily order-line count
    expect(calls.insert.length).toBeGreaterThan(1)
    expect(Math.max(...calls.insert.map(c => c.rows.length))).toBeLessThanOrEqual(200)
    expect(calls.insert.flatMap(c => c.rows)).toHaveLength(429)
  })

  it('chunks the id filter smaller than the body, because it rides in the URL', async () => {
    // 200 UUIDs in a query string is ~7.8 KB — on the limit that made `.in()` fail by payload
    // size rather than by code. Anything above 100 here is that bug coming back.
    const { client, calls } = stubClient({ live: rows(429, 'old') })
    await replaceAllRows('orders', rows(1), client)
    expect(Math.max(...calls.delete.map(c => c.ids.length))).toBeLessThanOrEqual(100)
    expect(calls.delete.flatMap(c => c.ids)).toHaveLength(429)
  })

  // ── The invariant: a failed rebuild never leaves fewer rows than it started with ──────────────

  it('leaves the old rows in place when the insert is rejected', async () => {
    // THE REGRESSION. `orders` had no `plant` column, the insert was rejected, and because the
    // delete had already committed the order book was left EMPTY. Nothing may supersede now.
    const { client, calls } = stubClient({ live: rows(3, 'old'), failInsert: { message: 'no plant column' } })
    await expect(replaceAllRows('orders', rows(2), client)).rejects.toMatchObject({ message: 'no plant column' })
    expect(calls.update).toHaveLength(0)
    expect(calls.delete.flatMap(c => c.ids)).not.toContain('old0')
  })

  it('rolls back the rows it already inserted when a later chunk is rejected', async () => {
    // A mid-rebuild rejection must not leave half an upload sitting on top of the old data.
    // 429 rows = 3 body chunks; the stub fails all of them, so chunk 1 is the one to undo.
    const { client, calls } = stubClient({ live: [], failInsertAfter: 2 })
    await expect(replaceAllRows('orders', rows(429), client)).rejects.toMatchObject({ message: 'bad row' })
    // Everything the first chunk wrote is deleted again — and nothing else is.
    expect(calls.delete.flatMap(c => c.ids)).toEqual(rows(200).map(r => r.id))
  })

  it('does NOT roll the new rows back when the supersede step fails', async () => {
    // Deliberate: the new data is already safely in. Undoing it to tidy up duplicates would
    // trade the healable failure for the one this function exists to prevent.
    const { client, calls } = stubClient({ live: rows(2, 'old'), failSupersede: { message: 'conn reset' } })
    await expect(replaceAllRows('orders', rows(2), client)).rejects.toMatchObject({ message: 'conn reset' })
    expect(calls.insert.flatMap(c => c.rows)).toHaveLength(2)
    // The only delete issued is the failed supersede of the OLD ids — never the new ones.
    expect(calls.delete.flatMap(c => c.ids)).toEqual(['old0', 'old1'])
  })

  it('never supersedes an id it just inserted', async () => {
    // Guards the one move that would defeat the whole function: step 3 removing step 2's work.
    // The stub lets the reused id through (a real primary key would not) so the filter is what
    // is under test, not PostgREST.
    const { client, calls } = stubClient({ live: [{ id: 'old0' }, { id: 'shared' }] })
    await replaceAllRows('orders', [{ id: 'shared' }, { id: 'brandnew' }], client)
    expect(calls.delete.flatMap(c => c.ids)).toEqual(['old0'])
  })

  it('touches nothing when the live-id read fails', async () => {
    const { client, calls } = stubClient({ failSelect: { message: 'offline' } })
    await expect(replaceAllRows('orders', rows(2), client)).rejects.toMatchObject({ message: 'offline' })
    expect(calls.insert).toHaveLength(0)
    expect(calls.delete).toHaveLength(0)
    expect(calls.update).toHaveLength(0)
  })

  it('rebuilds a table that starts empty', async () => {
    const { client, calls } = stubClient({ live: [] })
    await replaceAllRows('orders', rows(2), client)
    expect(calls.insert.flatMap(c => c.rows)).toHaveLength(2)
    expect(calls.delete).toHaveLength(0)   // nothing to supersede — and no all-rows predicate
  })
})

// ═══════════════════════════════════════════════════════════════
// WINDOWED REPLACE (#191) — the same rebuild, told to mind one date range
//
// The ERP workbook carried full history, so replacing the whole table was right. The Zoho invoice
// register carries one month: pointed at the same path it would delete 4,570.4 T of Mar–Aug
// dispatches. A window says "supersede only what is dated in here" — and may buy that with NONE of
// the protections below, which is why most of these tests re-assert the untouched ones.
// ═══════════════════════════════════════════════════════════════

// The live rows a windowed read filters on. `dispatches` dates by `date_of_dispatch`, `orders` by
// `order_date` — snake_case, because this is what the table holds, not what the caller passes.
const dated = (id, date, col = 'date_of_dispatch') => ({ id, [col]: date })
const SEPTEMBER = { from: '2026-09-01', to: '2026-09-17' }

describe('replaceAllRows with a date window', () => {
  it('sends no date filter and supersedes everything when no window is given', async () => {
    // The whole-table behaviour is the default and must survive this feature untouched.
    const { client, calls } = stubClient({ live: [dated('aug', '2026-08-31'), dated('sep', '2026-09-10')] })
    await replaceAllRows('dispatches', rows(1, 'fresh'), client)
    expect(calls.select[0].filters).toEqual([])
    expect(calls.update.flatMap(c => c.ids)).toEqual(['aug', 'sep'])
  })

  it('supersedes only the live rows dated inside the window, both ends included', async () => {
    const { client, calls } = stubClient({ live: [
      dated('aug-last', '2026-08-31'),
      dated('sep-first', '2026-09-01'),   // exactly the `from` end — inside
      dated('sep-mid', '2026-09-10'),
      dated('sep-last', '2026-09-17'),    // exactly the `to` end — inside
      dated('oct-first', '2026-10-01'),
    ] })
    await replaceAllRows('dispatches', rows(2, 'new'), client, { window: SEPTEMBER })
    expect(calls.update.flatMap(c => c.ids)).toEqual(['sep-first', 'sep-mid', 'sep-last'])
  })

  it('leaves the rows outside the window completely alone', async () => {
    // Not superseded, not re-inserted, not renumbered: the 790 Mar–Aug lines this ticket exists
    // to protect never appear in ANY call the write issues.
    const { client, calls } = stubClient({ live: [dated('march', '2026-03-31'), dated('sep', '2026-09-10')] })
    await replaceAllRows('dispatches', rows(1, 'new'), client, { window: SEPTEMBER })
    const everyId = [
      ...calls.update.flatMap(c => c.ids),
      ...calls.delete.flatMap(c => c.ids),
      ...calls.insert.flatMap(c => c.rows.map(r => r.id)),
    ]
    expect(everyId).not.toContain('march')
  })

  it('filters server-side, on the table\'s own date column', async () => {
    // Decided inside the write like the id list itself — never by handing the caller's rows in.
    const { client, calls } = stubClient({ live: [] })
    await replaceAllRows('orders', rows(1), client, { window: SEPTEMBER })
    expect(calls.select[0].filters).toEqual([
      { op: 'gte', col: 'order_date', value: '2026-09-01' },
      { op: 'lte', col: 'order_date', value: '2026-09-17' },
    ])
  })

  it('keeps the soft-delete liveness rule alongside the window', async () => {
    // The window narrows what is stale; it must not become the ONLY thing asked for. A soft
    // table's already-superseded history is not live, window or no window, so both filters ride
    // the same read.
    const { client, calls } = stubClient({ live: [dated('sep', '2026-09-10')] })
    await replaceAllRows('dispatches', rows(1, 'new'), client, { window: SEPTEMBER })
    expect(calls.select[0].eqs).toEqual([{ col: 'deleted', value: false }])
    expect(calls.select[0].filters).toEqual([
      { op: 'gte', col: 'date_of_dispatch', value: '2026-09-01' },
      { op: 'lte', col: 'date_of_dispatch', value: '2026-09-17' },
    ])
  })

  it('never supersedes an undated row, which belongs to no window', async () => {
    const { client, calls } = stubClient({ live: [{ id: 'nodate' }, dated('sep', '2026-09-10')] })
    await replaceAllRows('dispatches', rows(1, 'new'), client, { window: SEPTEMBER })
    expect(calls.update.flatMap(c => c.ids)).toEqual(['sep'])
  })

  it('supersedes NOTHING when the record set is empty', async () => {
    // A wrong or empty file must never clear a period. Without a window an empty set is a
    // deliberate "clear the table"; with one it is a mistake, and this is where they part.
    const { client, calls } = stubClient({ live: [dated('sep', '2026-09-10')] })
    await replaceAllRows('dispatches', [], client, { window: SEPTEMBER })
    expect(calls.update).toHaveLength(0)
    expect(calls.delete).toHaveLength(0)
    expect(calls.insert).toHaveLength(0)
  })

  it('still clears the table on an empty set when there is no window', async () => {
    const { client, calls } = stubClient({ live: [dated('sep', '2026-09-10')] })
    await replaceAllRows('dispatches', [], client)
    expect(calls.update.flatMap(c => c.ids)).toEqual(['sep'])
  })

  // ── Everything the window is NOT allowed to cost ─────────────────────────────────────────────

  it('still inserts the new rows BEFORE superseding the old ones', async () => {
    const { client, order: seq } = stubClient({ live: [dated('sep', '2026-09-10')] })
    await replaceAllRows('dispatches', rows(2, 'new'), client, { window: SEPTEMBER })
    expect(seq).toEqual(['select', 'insert', 'update'])
  })

  it('still rolls back the rows it already inserted when a later chunk is rejected', async () => {
    const { client, calls } = stubClient({ live: [], failInsertAfter: 2 })
    await expect(replaceAllRows('dispatches', rows(429), client, { window: SEPTEMBER }))
      .rejects.toMatchObject({ message: 'bad row' })
    expect(calls.delete.flatMap(c => c.ids)).toEqual(rows(200).map(r => r.id))
  })

  it('still does NOT roll the new rows back when the supersede step fails', async () => {
    const { client, calls } = stubClient({
      live: [dated('sep', '2026-09-10')],
      failSupersede: { message: 'conn reset' },
    })
    await expect(replaceAllRows('dispatches', rows(2, 'new'), client, { window: SEPTEMBER }))
      .rejects.toMatchObject({ message: 'conn reset' })
    expect(calls.insert.flatMap(c => c.rows)).toHaveLength(2)
    expect(calls.delete).toHaveLength(0)              // the new rows are left safely in
    expect(calls.update.flatMap(c => c.ids)).toEqual(['sep'])
  })

  it('still chunks the id filter at 100 and the insert body at 200', async () => {
    const live = Array.from({ length: 429 }, (_, i) => dated(`sep${i}`, '2026-09-10'))
    const { client, calls } = stubClient({ live })
    await replaceAllRows('dispatches', rows(429, 'new'), client, { window: SEPTEMBER })
    expect(Math.max(...calls.update.map(c => c.ids.length))).toBeLessThanOrEqual(100)
    expect(calls.update.flatMap(c => c.ids)).toHaveLength(429)
    expect(Math.max(...calls.insert.map(c => c.rows.length))).toBeLessThanOrEqual(200)
    expect(calls.insert.flatMap(c => c.rows)).toHaveLength(429)
  })

  it('still soft-deletes dispatches and hard-deletes orders', async () => {
    const soft = stubClient({ live: [dated('sep', '2026-09-10')] })
    await replaceAllRows('dispatches', rows(1, 'new'), soft.client, { window: SEPTEMBER })
    expect(soft.calls.update).toHaveLength(1)
    expect(soft.calls.delete).toHaveLength(0)

    const hard = stubClient({ live: [dated('sep', '2026-09-10', 'order_date')] })
    await replaceAllRows('orders', rows(1, 'new'), hard.client, { window: SEPTEMBER })
    expect(hard.calls.delete).toHaveLength(1)
    expect(hard.calls.update).toHaveLength(0)
  })

  // ── A window that cannot be honoured is refused before anything is written ────────────────────

  it('refuses a half-open window, and writes nothing', async () => {
    // Silently dropping the missing end would widen the rebuild to every date on that side —
    // the exact deletion the window exists to prevent.
    const { client, calls } = stubClient({ live: [dated('sep', '2026-09-10')] })
    await expect(replaceAllRows('dispatches', rows(1, 'new'), client, { window: { from: '2026-09-01', to: null } }))
      .rejects.toThrow(/both ends/)
    expect(calls.insert).toHaveLength(0)
    expect(calls.select).toHaveLength(0)
  })

  it('reports a refused window through the sync-error banner, not a silent throw', async () => {
    // These tests run in the `node` environment (vitest.config.js), where `emitSyncError` bails on
    // `typeof window === 'undefined'` — so the listener IS a stand-in window for this one test.
    const events = []
    globalThis.window = { dispatchEvent: (e) => { events.push(e.detail); return true } }
    try {
      const { client } = stubClient({ live: [dated('sep', '2026-09-10')] })
      await expect(replaceAllRows('dispatches', rows(1, 'new'), client, { window: { from: '2026-09-01', to: null } }))
        .rejects.toThrow(/both ends/)
    } finally {
      delete globalThis.window
    }
    expect(events).toHaveLength(1)
    expect(events[0].op).toBe('replace')
    expect(events[0].recovery).toMatch(/Nothing was changed/)
  })

  it('refuses a backwards window, and writes nothing', async () => {
    const { client, calls } = stubClient({ live: [dated('sep', '2026-09-10')] })
    await expect(replaceAllRows('dispatches', rows(1, 'new'), client, { window: { from: '2026-09-17', to: '2026-09-01' } }))
      .rejects.toThrow(/ends before/)
    expect(calls.insert).toHaveLength(0)
  })

  it('refuses a window on a table that has no date column, and writes nothing', async () => {
    const { client, calls } = stubClient({ live: [{ id: 'sku1' }] })
    await expect(replaceAllRows('skus', rows(1, 'new'), client, { window: SEPTEMBER }))
      .rejects.toThrow(/no date column/)
    expect(calls.insert).toHaveLength(0)
  })
})

describe('toSnake', () => {
  it('converts camelCase keys to snake_case', () => {
    expect(toSnake({ hrCoilId: 'X', actualWeight: 10 })).toEqual({ hr_coil_id: 'X', actual_weight: 10 })
  })

  it('maps empty strings to null (Postgres-safe for numeric/date columns)', () => {
    expect(toSnake({ costPrice: '', poNumber: 'PO1' })).toEqual({ cost_price: null, po_number: 'PO1' })
  })

  it('leaves 0 and false intact (only "" becomes null)', () => {
    expect(toSnake({ tubeCount: 0, dispatched: false })).toEqual({ tube_count: 0, dispatched: false })
  })
})

describe('toCamel', () => {
  it('converts snake_case keys to camelCase', () => {
    expect(toCamel({ hr_coil_id: 'X', actual_weight: 10 })).toEqual({ hrCoilId: 'X', actualWeight: 10 })
  })
})

describe('round-trip', () => {
  it('toCamel(toSnake(x)) preserves non-empty values', () => {
    const camel = { bundleId: 'BND-1', tubeCount: 12, totalWeight: 1.5, dispatched: true }
    expect(toCamel(toSnake(camel))).toEqual(camel)
  })
})

// ── Postgres arbitrates ON CONFLICT against ONE index; a conflict on any other unique index is a
// hard error that fails the whole batch. `skus.sku_code` is UNIQUE, so upserting SKUs on `id` broke
// the Sales-Excel upload whenever a code already existed under a different id.
describe('conflictTargetFor', () => {
  it('arbitrates skus on sku_code (its second UNIQUE column)', () => {
    expect(conflictTargetFor('skus')).toBe('sku_code')
  })

  it('arbitrates every other table on id', () => {
    for (const t of ['coils', 'baby_coils', 'productions', 'dispatches', 'orders', 'bundles']) {
      expect(conflictTargetFor(t)).toBe('id')
    }
  })
})

// ── Sign-in returns a plant and a role (ticket #125) ────────────────────────────────────────────
// `verify_login_details` is a SECOND database function beside the boolean `verify_login`, which is
// left exactly as it was. It answers with the signer's plant and role instead of yes/no. A wrong
// password returns NO ROWS — never a row with the fields blanked — so "who signed in" and "nobody
// did" can never be confused. The hash is not in the result and never reaches the browser.
function stubRpc(result) {
  const calls = []
  const client = {
    rpc: (fn, params) => {
      calls.push({ fn, params })
      return Promise.resolve(result)
    },
  }
  return { client, calls }
}

describe('verifyLoginDetails', () => {
  it('returns the plant and the role for a correct password', async () => {
    const { client, calls } = stubRpc({ data: [{ login_id: 'npmd', plant: 'npmd', role: 'plant' }], error: null })
    expect(await verifyLoginDetails('npmd', 'a-password', client)).toEqual({
      loginId: 'npmd', plant: 'npmd', role: 'plant',
    })
    // The password goes to the database as a parameter and comes back nowhere.
    expect(calls).toEqual([
      { fn: 'verify_login_details', params: { p_login_id: 'npmd', p_password: 'a-password' } },
    ])
  })

  it('reads the admin login as the admin role over all plants', async () => {
    // The login that predates this ticket carries no plant. That is ALL_PLANTS — NOT blank:
    // blank is the `Unattributed` option in plantFilterOptions, a labelling gap, the opposite
    // concept. Handing '' to filterByPlant would show the admin only the rows nobody attributed.
    const { client } = stubRpc({ data: [{ login_id: 'admin', plant: null, role: 'admin' }], error: null })
    expect(await verifyLoginDetails('admin', 'pw', client)).toEqual({
      loginId: 'admin', plant: ALL_PLANTS, role: 'admin',
    })
  })

  it("gives the admin every plant's rows, and a plant login only its own", async () => {
    // The returned plant is fed straight to filterByPlant, so assert on what it selects rather
    // than on the sentinel's spelling.
    const rows = [{ plant: 'hyderabad' }, { plant: 'npmd' }, { plant: '' }]
    const admin = await verifyLoginDetails('admin', 'pw',
      stubRpc({ data: [{ login_id: 'admin', plant: null, role: 'admin' }], error: null }).client)
    const npmd = await verifyLoginDetails('npmd', 'pw',
      stubRpc({ data: [{ login_id: 'npmd', plant: 'npmd', role: 'plant' }], error: null }).client)
    expect(filterByPlant(rows, admin.plant)).toEqual(rows)
    expect(filterByPlant(rows, npmd.plant)).toEqual([{ plant: 'npmd' }])
  })

  it('returns null for a wrong password, which the function answers with no rows', async () => {
    const { client } = stubRpc({ data: [], error: null })
    expect(await verifyLoginDetails('hyderabad', 'wrong', client)).toBeNull()
  })

  it('trims the login id so a stray space is not a failed sign-in', async () => {
    const { client, calls } = stubRpc({ data: [{ login_id: 'hyderabad', plant: 'hyderabad', role: 'plant' }], error: null })
    await verifyLoginDetails('  hyderabad ', 'pw', client)
    expect(calls[0].params.p_login_id).toBe('hyderabad')
  })

  it('throws on an RPC error so the UI can tell "cannot connect" from "wrong password"', async () => {
    const { client } = stubRpc({ data: null, error: { message: 'network down' } })
    await expect(verifyLoginDetails('admin', 'pw', client)).rejects.toMatchObject({ message: 'network down' })
  })
})

// ── The screen's half of the window (ticket #192) ──────────────────────────────────────────────
// `replaceAllRows` leaves the rows outside the window in the table. This is what stops the TAB from
// claiming otherwise: without it, re-seeding state from the uploaded rows alone would blank every
// surviving row on screen — the app would display exactly the loss the window exists to prevent.
describe('rowsOutsideWindow', () => {
  const store = [
    { id: 'aug', dateOfDispatch: '2026-08-31' },
    { id: 'sep-first', dateOfDispatch: '2026-09-01' },
    { id: 'sep-last', dateOfDispatch: '2026-09-16' },
    { id: 'oct', dateOfDispatch: '2026-10-01' },
  ]

  it('keeps the rows the window does not cover, both ends inclusive', () => {
    expect(rowsOutsideWindow('dispatches', store, { from: '2026-09-01', to: '2026-09-16' }).map(r => r.id))
      .toEqual(['aug', 'oct'])
  })

  it('keeps an undated row — it is inside no window, exactly as the server-side filter treats it', () => {
    const withBlank = [...store, { id: 'nodate', dateOfDispatch: null }, { id: 'empty', dateOfDispatch: '' }]
    expect(rowsOutsideWindow('dispatches', withBlank, { from: '2026-09-01', to: '2026-09-16' }).map(r => r.id))
      .toEqual(['aug', 'oct', 'nodate', 'empty'])
  })

  it('drops soft-deleted rows — they are not history that survives', () => {
    const withDead = [...store, { id: 'dead', dateOfDispatch: '2026-07-01', deleted: true }]
    expect(rowsOutsideWindow('dispatches', withDead, { from: '2026-09-01', to: '2026-09-16' }).map(r => r.id))
      .toEqual(['aug', 'oct'])
  })

  it('keeps nothing without a window — an unwindowed replace rebuilds the whole table', () => {
    expect(rowsOutsideWindow('dispatches', store, null)).toEqual([])
    expect(rowsOutsideWindow('dispatches', store, { from: '2026-09-01' })).toEqual([])
  })

  it('keeps nothing for a table with no date column, matching the refusal in replaceAllRows', () => {
    expect(rowsOutsideWindow('skus', store, { from: '2026-09-01', to: '2026-09-16' })).toEqual([])
  })

  it('dates an order row by its own column, not by the dispatch one', () => {
    const orders = [{ id: 'o1', orderDate: '2026-08-01' }, { id: 'o2', orderDate: '2026-09-05' }]
    expect(rowsOutsideWindow('orders', orders, { from: '2026-09-01', to: '2026-09-16' }).map(r => r.id))
      .toEqual(['o1'])
  })
})

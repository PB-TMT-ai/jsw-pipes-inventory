import { describe, it, expect, vi } from 'vitest'

// db.js imports ./supabase, which calls createClient() at module load with the
// VITE_SUPABASE_* env vars (undefined in unit tests → would throw). Stub it so we
// can import the pure toCamel/toSnake helpers.
vi.mock('./supabase', () => ({ supabase: {} }))

import { toCamel, toSnake, conflictTargetFor, replaceAllRows, verifyLoginDetails, fetchAllRows } from './db'
import { ALL_PLANTS, filterByPlant } from './calc'

// Minimal PostgREST-shaped stub. Records every call so a test can assert on WHAT was sent
// (predicate vs. id list), in WHAT ORDER, and on how many batches it took. `live` seeds the rows
// the table already holds, so a test can prove what survives a failure.
function stubClient({ failSelect = null, failInsert = null, failSupersede = null, live = [] } = {}) {
  const calls = { select: [], update: [], delete: [], insert: [] }
  const order = []                     // every op in the order it was issued
  const client = {
    from: (table) => ({
      select: () => {
        const builder = {
          eq: () => builder,
          order: () => builder,
          range: (from, to) => {
            calls.select.push({ table, from, to })
            order.push('select')
            if (failSelect) return Promise.resolve({ data: null, error: failSelect })
            return Promise.resolve({ data: live.slice(from, to + 1), error: null })
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
        return Promise.resolve({ error: failInsert })
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
    let seen = 0
    const { calls } = stubClient()
    const client = {
      from: (table) => ({
        select: () => { const b = { eq: () => b, order: () => b, range: () => Promise.resolve({ data: [], error: null }) }; return b },
        insert: (r) => { calls.insert.push({ table, rows: r }); seen += 1; return Promise.resolve({ error: seen >= 2 ? { message: 'bad row' } : null }) },
        delete: () => ({ in: (col, ids) => { calls.delete.push({ table, col, ids }); return Promise.resolve({ error: null }) } }),
      }),
    }
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

// ── The read every screen waits on ───────────────────────────────────────────────────────────────
// Two failures of this function put the app on its spinner and left it there (2026-08-28):
//   1. `dispatches` is superseded SOFTLY and rebuilt daily, so it accumulates a full copy of itself
//      per upload. It held 7,167 rows of which 160 were live — 44 MB of JSON fetched to use 1.1 MB.
//   2. A read that REJECTED (dropped connection, DNS) escaped as a throw rather than returning null
//      as documented, so the caller's `setLoading(false)` never ran.
// A stub that records what was asked for, and can fail either way.
function stubReader({ rows = [], failWith = null, throwWith = null } = {}) {
  const asked = []
  const client = {
    from: (table) => ({
      select: () => {
        const q = { filters: [] }
        const builder = {
          eq: (col, val) => { q.filters.push([col, val]); return builder },
          order: () => builder,
          range: (from, to) => {
            asked.push({ table, from, to, filters: q.filters })
            if (throwWith) return Promise.reject(throwWith)
            if (failWith) return Promise.resolve({ data: null, error: failWith })
            const visible = q.filters.some(([c, v]) => c === 'deleted' && v === false)
              ? rows.filter(r => !r.deleted)
              : rows
            return Promise.resolve({ data: visible.slice(from, to + 1), error: null })
          },
        }
        return builder
      },
    }),
  }
  return { client, asked }
}

describe('fetchAllRows', () => {
  it('leaves soft-superseded history in Postgres — dispatches asks for the live rows only', async () => {
    const live = [{ id: 'd1', deleted: false }, { id: 'd2', deleted: false }]
    const history = Array.from({ length: 50 }, (_, i) => ({ id: `old${i}`, deleted: true }))
    const { client, asked } = stubReader({ rows: [...history, ...live] })

    expect(await fetchAllRows('dispatches', client)).toEqual(live)
    expect(asked[0].filters).toEqual([['deleted', false]])
  })

  it('does NOT filter skus, which has no `deleted` column at all', async () => {
    // A blanket filter would make this read fail outright and drop the app back to DEFAULT_SKUS —
    // the wrong weight on every tube, which is the one thing CLAUDE.md forbids.
    const { client, asked } = stubReader({ rows: [{ id: 's1', skuCode: 'SHS 72x72x3' }] })
    await fetchAllRows('skus', client)
    expect(asked[0].filters).toEqual([])
  })

  it('does NOT filter the hard-delete tables, which must SEE a deleted row to purge it', async () => {
    for (const t of ['coils', 'baby_coils']) {
      const { client, asked } = stubReader({ rows: [{ id: 'c1', deleted: true }] })
      const got = await fetchAllRows(t, client)
      expect(asked[0].filters).toEqual([])
      expect(got).toEqual([{ id: 'c1', deleted: true }])   // handed to the purge, not hidden from it
    }
  })

  it('returns null — never throws — when the read is REJECTED rather than answered', async () => {
    // The spinner is cleared by the caller reading null. An escaping throw skipped that and parked
    // the app on "Loading inventory data..." for ever.
    const { client } = stubReader({ throwWith: new TypeError('Failed to fetch') })
    await expect(fetchAllRows('dispatches', client)).resolves.toBeNull()
  })

  it('returns null when PostgREST answers with an error', async () => {
    const { client } = stubReader({ failWith: { message: 'permission denied' } })
    expect(await fetchAllRows('orders', client)).toBeNull()
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

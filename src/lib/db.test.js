import { describe, it, expect, vi } from 'vitest'

// db.js imports ./supabase, which calls createClient() at module load with the
// VITE_SUPABASE_* env vars (undefined in unit tests → would throw). Stub it so we
// can import the pure toCamel/toSnake helpers.
vi.mock('./supabase', () => ({ supabase: {} }))

import { toCamel, toSnake, conflictTargetFor, replaceAllRows } from './db'

// Minimal PostgREST-shaped stub. Records every call so a test can assert on WHAT was sent
// (predicate vs. id list) and on how many batches it took.
function stubClient({ failSupersede = null, failInsert = null } = {}) {
  const calls = { update: [], delete: [], insert: [] }
  const client = {
    from: (table) => ({
      update: (patch) => ({
        eq: (col, val) => {
          calls.update.push({ table, patch, col, val })
          return Promise.resolve({ error: failSupersede })
        },
      }),
      delete: () => ({
        neq: (col, val) => {
          calls.delete.push({ table, col, val })
          return Promise.resolve({ error: failSupersede })
        },
      }),
      insert: (rows) => {
        calls.insert.push({ table, rows })
        return Promise.resolve({ error: failInsert })
      },
    }),
  }
  return { client, calls }
}

const rows = (n, prefix = 'r') =>
  Array.from({ length: n }, (_, i) => ({ id: `${prefix}${i}`, invoiceNo: `INV${i}` }))

describe('replaceAllRows', () => {
  it('supersedes dispatches by predicate, not by ids from local state', async () => {
    const { client, calls } = stubClient()
    await replaceAllRows('dispatches', rows(3), client)
    // Soft-delete every live row in one statement — no id list means a stale tab
    // cannot omit rows it never loaded (the 2x-duplication bug).
    expect(calls.update).toEqual([
      { table: 'dispatches', patch: { deleted: true }, col: 'deleted', val: false },
    ])
    expect(calls.delete).toHaveLength(0)
  })

  it('hard-deletes orders before inserting the rebuilt set', async () => {
    const { client, calls } = stubClient()
    await replaceAllRows('orders', rows(2), client)
    expect(calls.delete).toHaveLength(1)
    expect(calls.delete[0].table).toBe('orders')
    expect(calls.update).toHaveLength(0)
  })

  it('supersedes existing rows even when the caller passes a stale/empty snapshot', async () => {
    // The regression: this tab never loaded the rows another upload created. The replace
    // must still clear them, because the predicate runs server-side.
    const { client, calls } = stubClient()
    await replaceAllRows('dispatches', rows(1), client)
    expect(calls.update).toHaveLength(1)
    expect(calls.insert.flatMap(c => c.rows)).toHaveLength(1)
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

  it('aborts without inserting when the supersede step fails', async () => {
    // Inserting after a failed supersede is precisely what doubles the data.
    const { client, calls } = stubClient({ failSupersede: { message: 'boom' } })
    await expect(replaceAllRows('dispatches', rows(3), client)).rejects.toMatchObject({ message: 'boom' })
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

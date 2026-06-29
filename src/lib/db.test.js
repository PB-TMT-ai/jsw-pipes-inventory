import { describe, it, expect, vi, beforeEach } from 'vitest'

// db.js imports ./supabase, which calls createClient() at module load with the
// VITE_SUPABASE_* env vars (undefined in unit tests → would throw). Stub it with a
// controllable query builder so we can also drive syncToSupabase's success/error paths.
const { upsertMock, inMock } = vi.hoisted(() => ({ upsertMock: vi.fn(), inMock: vi.fn() }))
vi.mock('./supabase', () => ({
  supabase: {
    from: () => ({
      upsert: (...args) => upsertMock(...args),
      delete: () => ({ in: (...args) => inMock(...args) }),
    }),
  },
}))

import { toCamel, toSnake, syncToSupabase } from './db'

beforeEach(() => {
  upsertMock.mockReset(); inMock.mockReset()
  upsertMock.mockResolvedValue({ error: null })
  inMock.mockResolvedValue({ error: null })
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

describe('syncToSupabase — rollback semantics', () => {
  it('returns ok:true and advances the id baseline on success', async () => {
    const prev = [{ id: '1', name: 'a' }]
    const next = [{ id: '1', name: 'b' }, { id: '2', name: 'c' }]
    const ref = { current: new Set(['1']) }
    const res = await syncToSupabase('coils', prev, next, ref)
    expect(res).toEqual({ ok: true })
    expect(upsertMock).toHaveBeenCalledTimes(1)
    expect([...ref.current].sort()).toEqual(['1', '2']) // baseline advanced
  })

  it('returns ok:false and does NOT advance the baseline when the upsert fails', async () => {
    upsertMock.mockResolvedValue({ error: { message: 'permission denied' } })
    const prev = [{ id: '1', name: 'a' }]
    const next = [{ id: '1', name: 'b' }]
    const ref = { current: new Set(['1']) }
    const res = await syncToSupabase('coils', prev, next, ref)
    expect(res).toEqual({ ok: false })
    expect([...ref.current]).toEqual(['1']) // unchanged → reverted state stays consistent with DB
  })

  it('returns ok:false when a delete fails, leaving the baseline intact', async () => {
    inMock.mockResolvedValue({ error: { message: 'fk violation' } })
    const prev = [{ id: '1' }, { id: '2' }]
    const next = [{ id: '1' }]                 // id 2 removed → exercises the delete path
    const ref = { current: new Set(['1', '2']) }
    const res = await syncToSupabase('skus', prev, next, ref)
    expect(res).toEqual({ ok: false })
    expect(inMock).toHaveBeenCalled()
    expect([...ref.current].sort()).toEqual(['1', '2'])
  })

  it('no-ops cleanly (ok:true, no network) when nothing changed', async () => {
    const rows = [{ id: '1', name: 'a' }]
    const ref = { current: new Set(['1']) }
    const res = await syncToSupabase('coils', rows, rows, ref)
    expect(res).toEqual({ ok: true })
    expect(upsertMock).not.toHaveBeenCalled()
    expect(inMock).not.toHaveBeenCalled()
  })
})

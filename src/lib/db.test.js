import { describe, it, expect, vi } from 'vitest'

// db.js imports ./supabase, which calls createClient() at module load with the
// VITE_SUPABASE_* env vars (undefined in unit tests → would throw). Stub it so we
// can import the pure toCamel/toSnake helpers.
vi.mock('./supabase', () => ({ supabase: {} }))

import { toCamel, toSnake } from './db'

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

// ── Guard: the SKU-by-plant deck's numbers (scripts/sku-by-plant/build.mjs) ──────────────────────
// The deck's claims are "unique", "shared" and "this pair overlaps by N". These tests pin the
// definitions: a SKU is a size × thickness cell, the window starts when the last plant went live,
// and the exact combinations partition the total — no SKU counted twice, none dropped.
import { describe, it, expect } from 'vitest'
import { buildSkuByPlant, skuCell, takeaways } from './build.mjs'

const plantMaster = [
  { id: 'hyderabad', name: 'Hyderabad', manufactures: true },
  { id: 'npmd', name: 'NPMD', manufactures: true },
  { id: 'lepakshi', name: 'Lepakshi', manufactures: true },
]
const skus = [
  { skuCode: 'A', productType: 'SHS', height: 50, breadth: 50, thickness: '2', description: 'SHS 50x50x2x6000' },
  { skuCode: 'A2', productType: 'SHS', height: 50, breadth: 50, thickness: '2.00', description: 'SHS 50x50x2.00x6000' }, // same tube
  { skuCode: 'B', productType: 'RHS', height: 80, breadth: 40, thickness: '1.6', description: 'RHS 80x40x1.6x6000' },
  { skuCode: 'C', productType: 'CHS', nominalBore: '15', thickness: '2', description: 'CHS 15 NBx2x6000' },
]
const prod = (plant, skuCode, date, totalWeight, extra = {}) =>
  ({ plant, skuCode, dateOfProduction: date, totalWeight, deleted: false, ...extra })

const productions = [
  prod('hyderabad', 'C', '2026-03-01', 50),       // before the window — all-time only
  prod('hyderabad', 'A', '2026-09-02', 10),
  prod('npmd', 'A2', '2026-09-03', 20),           // same cell as A → shared, not a new SKU
  prod('npmd', 'B', '2026-08-25', 5),             // NPMD's first batch
  prod('lepakshi', 'C', '2026-09-01', 7),         // Lepakshi's first batch = window start
  prod('lepakshi', 'B', '2026-09-05', 3, { deleted: true }), // soft-deleted: ignored
]

describe('buildSkuByPlant', () => {
  const r = buildSkuByPlant({ productions, skus, plantMaster })

  it('starts the default window on the day the last plant produced its first batch', () => {
    expect(r.from).toBe('2026-09-01')
    expect(r.to).toBe('2026-09-03')                 // the 5-Sep batch is soft-deleted
  })

  it('counts a SKU as a size × thickness cell, so duplicate master codes are one SKU', () => {
    expect(r.total).toBe(2)                        // SHS 50x50x2 and CHS 15 x 2; B (Aug) is outside
    expect(r.allTime.total).toBe(3)
    expect(skuCell(skus[0]).key).toBe(skuCell(skus[1]).key)
  })

  it('splits each plant into unique and shared, with tonnes to match', () => {
    const by = Object.fromEntries(r.plants.map(p => [p.id, p]))
    expect(by.hyderabad).toMatchObject({ made: 1, unique: 0, shared: 1, mt: 10 })
    expect(by.npmd).toMatchObject({ made: 1, unique: 0, shared: 1, mt: 20 })
    expect(by.lepakshi).toMatchObject({ made: 1, unique: 1, shared: 0, mtUnique: 7 })
    expect(r.pair.hyderabad.npmd).toBe(1)
    expect(r.pair.npmd.hyderabad).toBe(1)
    expect(r.pair.hyderabad.lepakshi).toBe(0)
  })

  it('partitions the total into exact plant combinations', () => {
    expect(r.combos.reduce((s, c) => s + c.count, 0)).toBe(r.total)
    expect(r.total - r.sharedTotal).toBe(r.plants.reduce((s, p) => s + p.unique, 0))
  })

  it('honours an explicit window and skips unplaceable rows by count, not silently', () => {
    const w = buildSkuByPlant({ productions: [...productions, prod('npmd', 'ZZZ', '2026-09-04', 1)], skus, plantMaster,
      from: '2026-08-01', to: '2026-09-30' })
    expect(w.total).toBe(3)
    expect(w.skipped.noSku).toBe(1)
    expect(w.skipped.noSkuCodes).toEqual(['ZZZ'])
  })

  it('writes the takeaways from the numbers', () => {
    const t = takeaways(r)
    expect(t[0]).toBe('1 of 2 SKUs (50%) are made at one plant only; 1 are made at two or more.')
    expect(t.some(l => l.startsWith('Largest overlap: Hyderabad and NPMD share 1 SKU.'))).toBe(true)
  })
})

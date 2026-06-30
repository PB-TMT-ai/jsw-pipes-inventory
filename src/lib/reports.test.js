import { describe, it, expect } from 'vitest'
import { buildFinishedStockData, buildRawMaterialData } from './reports'

// ── Report A fixture ──
const skus = [
  { skuCode: 'A', productType: 'CHS', nominalBore: '32', outsideDiameter: '42.4', thickness: 2, length: 6000, weightPerTube: 12, status: 'published' },
  { skuCode: 'B', productType: 'SHS', height: 25, breadth: 25, thickness: 2, length: 6000, weightPerTube: 8.81, status: 'published' },
  { skuCode: 'C', productType: 'RHS', height: 50, breadth: 25, thickness: 1.6, length: 6000, weightPerTube: 11.36, status: 'published' },
  { skuCode: 'D', productType: 'SHS', height: 38, breadth: 38, thickness: 2, length: 6000, weightPerTube: 12.82, status: 'draft' }, // unpublished
  { skuCode: 'E', productType: 'SHS', height: 20, breadth: 20, thickness: 2, length: 6000, weightPerTube: 6.78, status: 'published' }, // zero stock
]
const productions = [
  { id: 'p1', skuCode: 'A', tubeCount: 100, totalWeight: 1.2 },
  { id: 'p2', skuCode: 'B', tubeCount: 200, totalWeight: 1.762 },
  { id: 'p3', skuCode: 'C', tubeCount: 50, totalWeight: 0.568 },
]
const dispatches = [
  { id: 'd1', bundleEntries: [
    { skuCode: 'A', pieces: 40, weight: 0.48 }, // A → 60 pcs / 0.72 MT left
    { skuCode: 'C', pieces: 50, weight: 0.568 }, // C → fully dispatched (0 left)
  ] },
]

describe('buildFinishedStockData', () => {
  it('buckets CHS→ROUND, SHS, RHS and lists only stocked sizes by default', () => {
    const { sections, grand } = buildFinishedStockData(skus, productions, dispatches)
    expect(sections.map(s => s.name)).toEqual(['ROUND', 'SHS']) // C fully dispatched, E never produced → dropped
    const round = sections.find(s => s.name === 'ROUND')
    expect(round.rows).toHaveLength(1)
    expect(round.rows[0].size).toBe('32 NB')
    expect(round.rows[0].pcs).toBe(60)
    expect(round.rows[0].mt).toBeCloseTo(0.72, 6)
    expect(round.rows[0].kgPerPcs).toBe(12)
    expect(round.subtotal.pcs).toBe(60)
    const shs = sections.find(s => s.name === 'SHS')
    expect(shs.rows[0].size).toBe('25x25')
    expect(shs.rows[0].pcs).toBe(200)
  })

  it('excludes unpublished SKUs and sums the grand total', () => {
    const { sections, grand } = buildFinishedStockData(skus, productions, dispatches)
    const allSizes = sections.flatMap(s => s.rows.map(r => r.size))
    expect(allSizes).not.toContain('38x38') // SKU D is draft
    expect(grand.pcs).toBe(260)
    expect(grand.mt).toBeCloseTo(2.482, 6)
  })

  it('nonZeroOnly:false keeps zero-stock published SKUs (RHS reappears)', () => {
    const { sections } = buildFinishedStockData(skus, productions, dispatches, { nonZeroOnly: false })
    expect(sections.map(s => s.name)).toEqual(['ROUND', 'SHS', 'RHS'])
    const rhs = sections.find(s => s.name === 'RHS')
    expect(rhs.rows[0].size).toBe('50x25')
    expect(rhs.rows[0].pcs).toBe(0)
  })
})

// ── Report B fixture ──
const coils = [
  { id: 'c1', hrCoilId: 'M1', width: 1250, thickness: 2.5, coilGrade: 'GR2', actualWeight: 72, deleted: false }, // unslit
  { id: 'c2', hrCoilId: 'M2', width: 1220, thickness: 3.0, coilGrade: 'GR2', actualWeight: 64, deleted: false }, // slit → excluded
  { id: 'c3', hrCoilId: 'M3', width: 1250, thickness: 2.5, coilGrade: 'GR2', actualWeight: 8, deleted: false }, // unslit, same group as M1
  { id: 'c4', hrCoilId: 'M4', width: 1000, thickness: 2.0, coilGrade: 'GR1', actualWeight: 50, deleted: true }, // deleted → excluded
]
const babyCoils = [
  { id: 'b1', babyCoilId: 'M2-A', hrCoilId: 'M2', width: 150, thickness: 3.0, weight: 30, consumed: false, deleted: false },
  { id: 'b2', babyCoilId: 'M2-B', hrCoilId: 'M2', width: 150, thickness: 3.0, weight: 34, consumed: false, deleted: false },
  { id: 'b3', babyCoilId: 'M2-C', hrCoilId: 'M2', width: 100, thickness: 3.0, weight: 0, consumed: false, deleted: false }, // zero → skip
  { id: 'b4', babyCoilId: 'M2-D', hrCoilId: 'M2', width: 200, thickness: 3.0, weight: 10, consumed: true, deleted: false }, // consumed → excluded
]
const rmProductions = [
  { id: 'rp1', coilAllocations: [{ babyCoilId: 'M2-A', hrCoilId: 'M2', pieces: 10, weight: 5 }] }, // b1 free → 25
]

describe('buildRawMaterialData', () => {
  it('HR Coil Stock = unslit mother coils only, grouped width×thick×grade', () => {
    const { hrCoil } = buildRawMaterialData(coils, babyCoils, rmProductions)
    expect(hrCoil.groups).toHaveLength(1) // M1 + M3 collapse; M2 slit, M4 deleted
    expect(hrCoil.groups[0]).toMatchObject({ width: 1250, thick: 2.5, grade: 'GR2' })
    expect(hrCoil.groups[0].mt).toBeCloseTo(80, 6) // 72 + 8
    expect(hrCoil.total).toBeCloseTo(80, 6)
  })

  it('Strip = baby-coil free weight (weight − consumed), excludes manually-consumed coils', () => {
    const { strip } = buildRawMaterialData(coils, babyCoils, rmProductions)
    expect(strip.groups).toHaveLength(1) // b1+b2 group; b3 zero, b4 consumed dropped
    expect(strip.groups[0]).toMatchObject({ width: 150, thick: 3.0 })
    expect(strip.groups[0].mt).toBeCloseTo(59, 6) // (30−5) + 34
    expect(strip.total).toBeCloseTo(59, 6)
  })

  it('grand total = HR coil + strip', () => {
    const { grand } = buildRawMaterialData(coils, babyCoils, rmProductions)
    expect(grand).toBeCloseTo(139, 6) // 80 + 59
  })

  it('handles empty inputs without throwing', () => {
    const { hrCoil, strip, grand } = buildRawMaterialData([], [], [])
    expect(hrCoil.groups).toEqual([])
    expect(strip.groups).toEqual([])
    expect(grand).toBe(0)
  })
})

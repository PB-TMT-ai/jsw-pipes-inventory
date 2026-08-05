// ── Dry run: replay production coil allocation over baby coils, chronologically. ──
//
// Why: `coil_allocations[].pieces` was saved as the operator's manual pick without any
// cap at the coil's remaining capacity, so 445 baby coils carry more consumption than
// they physically hold (123.3 T total, issue #99). Weight is NOT the stored value that
// matters — `resolveProductionWeights` (calc.js:99) recomputes it as pieces × wpp on
// every read, so `pieces` is the only field to correct.
//
// This script REPLAYS the app's own `coilFifoAllocate` over every production in date
// order, carrying consumption forward exactly as the Production stage does live. It
// WRITES NOTHING — it emits a diff report for review.
//
// Usage: node scripts/coil-realloc-dryrun.mjs
// Inputs:  .workspace/{skus,babycoils,productions}.json  (pulled from Supabase)
// Output:  .workspace/coil-realloc-dryrun.json + a summary on stdout

import fs from 'node:fs'
import {
  coilFifoAllocate, requiredStripWidth, WIDTH_TOL_MM, THICKNESS_TOL_MM,
} from '../src/lib/calc.js'

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../.workspace/${f}.json`, import.meta.url), 'utf-8'))
const skus = read('skus')
const babyCoils = read('babycoils')
const productions = read('productions')

// Mirror App.jsx's SKU pick: prefer an entry that actually carries a weight per tube.
const skuByCode = new Map()
for (const s of skus) {
  const cur = skuByCode.get(s.skuCode)
  if (!cur || (!(Number(cur.weightPerTube) > 0) && Number(s.weightPerTube) > 0)) skuByCode.set(s.skuCode, s)
}
const babyById = new Map(babyCoils.map(b => [b.babyCoilId, b]))
const motherOf = (id) => babyById.get(id)?.hrCoilId || ''

// Running consumption keyed by babyCoilId — the same shape `coilConsumption` produces,
// carried forward across the replay so each production sees what earlier ones consumed.
const consumedByCoil = {}
const bump = (id, pieces, weight) => {
  const cur = consumedByCoil[id] || { weight: 0, pieces: 0 }
  cur.pieces += pieces; cur.weight += weight
  consumedByCoil[id] = cur
}

const changed = []
const shortfalls = []
const unchanged = []
const skipped = []

for (const p of productions) {
  const sku = skuByCode.get(p.skuCode)
  const wpp = Number(sku?.weightPerTube || 0) / 1000
  const pieces = Number(p.tubeCount || 0)
  const before = (p.coilAllocations || []).map(a => ({
    babyCoilId: a.babyCoilId || '', hrCoilId: a.hrCoilId || '', pieces: Number(a.pieces || 0),
  }))

  // No SKU master weight, or nothing produced — the app can't resolve these either. Leave alone.
  if (!(wpp > 0) || pieces <= 0) {
    skipped.push({ id: p.id, date: p.dateOfProduction, sku: p.skuCode, reason: !(wpp > 0) ? 'no weightPerTube in SKU master' : 'tubeCount is 0' })
    for (const a of before) bump(a.babyCoilId, a.pieces, a.pieces * wpp)
    continue
  }

  // Eligibility mirrors App.jsx `babyAsCoils`: width ±5 mm (when the SKU's strip width is
  // known), then coilFifoAllocate applies thickness ±0.3 mm on top. `consumed` is NOT
  // filtered out here — the replay recomputes consumption from scratch, so the stored flag
  // (itself derived from the bad allocations) must not gate eligibility.
  const reqWidth = requiredStripWidth(sku)
  const asCoils = babyCoils
    .filter(b => !b.deleted && (reqWidth <= 0 || Math.abs(Number(b.width || 0) - reqWidth) <= WIDTH_TOL_MM))
    .map(b => ({ hrCoilId: b.babyCoilId, thickness: b.thickness, actualWeight: b.weight, dateOfInward: b.dateOfConversion }))

  const raw = coilFifoAllocate({
    coils: asCoils, consumedByCoil, skuThickness: Number(sku?.thickness || 0),
    weightPerPiece: wpp, pieces, thickTolMm: THICKNESS_TOL_MM, softFill: 0.97,
  })

  const after = raw.allocations.map(a => ({
    babyCoilId: a.hrCoilId, hrCoilId: motherOf(a.hrCoilId), pieces: a.pieces,
  }))
  for (const a of after) bump(a.babyCoilId, a.pieces, a.pieces * wpp)

  // A production the replay cannot fully place keeps its remainder unassigned. Surface it —
  // never silently drop pieces.
  if (raw.shortfallPieces > 0) {
    shortfalls.push({
      id: p.id, date: p.dateOfProduction, sku: p.skuCode, tubeCount: pieces,
      placedPieces: raw.allocatedPieces, shortfallPieces: raw.shortfallPieces,
      shortfallWeightT: +(raw.shortfallPieces * wpp).toFixed(3),
      noEligibleCoil: raw.noEligibleCoil,
    })
  }

  const key = (rows) => rows.map(r => `${r.babyCoilId}:${r.pieces}`).sort().join('|')
  const rec = {
    id: p.id, date: p.dateOfProduction, sku: p.skuCode, tubeCount: pieces,
    weightT: +(pieces * wpp).toFixed(3), before, after,
    beforeCoils: before.length, afterCoils: after.length,
  }
  if (key(before) === key(after)) unchanged.push(rec); else changed.push(rec)
}

// ── Over-consumption before vs after, the number issue #99 is about ──
const overOf = (cons) => {
  let coils = 0, excess = 0
  for (const b of babyCoils) {
    const used = cons[b.babyCoilId]?.weight || 0
    if (used > Number(b.weight || 0)) { coils++; excess += used - Number(b.weight || 0) }
  }
  return { coils, excessT: +excess.toFixed(2) }
}
const consBefore = {}
for (const p of productions) {
  const wpp = Number(skuByCode.get(p.skuCode)?.weightPerTube || 0) / 1000
  for (const a of (p.coilAllocations || [])) {
    if (!a.babyCoilId) continue
    bumpInto(consBefore, a.babyCoilId, Number(a.pieces || 0) * wpp)
  }
}
function bumpInto(map, id, w) { map[id] = { weight: (map[id]?.weight || 0) + w } }

const babyLeft = (cons) => +babyCoils
  .reduce((s, b) => s + Math.max(0, Number(b.weight || 0) - (cons[b.babyCoilId]?.weight || 0)), 0).toFixed(1)

const out = {
  generatedFor: '2026-08-05',
  totals: {
    productions: productions.length,
    changed: changed.length, unchanged: unchanged.length, skipped: skipped.length,
    shortfallProductions: shortfalls.length,
    shortfallPieces: shortfalls.reduce((s, r) => s + r.shortfallPieces, 0),
    shortfallWeightT: +shortfalls.reduce((s, r) => s + r.shortfallWeightT, 0).toFixed(2),
    overConsumedBefore: overOf(consBefore),
    overConsumedAfter: overOf(consumedByCoil),
    babyCoilLeftBeforeT: babyLeft(consBefore),
    babyCoilLeftAfterT: babyLeft(consumedByCoil),
  },
  shortfalls, changed, skipped,
}
fs.writeFileSync(new URL('../.workspace/coil-realloc-dryrun.json', import.meta.url), JSON.stringify(out, null, 2))

const t = out.totals
console.log(`
DRY RUN — no database writes

  Productions replayed        ${t.productions}
    would change              ${t.changed}
    identical                 ${t.unchanged}
    skipped (no SKU weight)   ${t.skipped}

  Over-consumed baby coils    ${t.overConsumedBefore.coils} (${t.overConsumedBefore.excessT} T)  ->  ${t.overConsumedAfter.coils} (${t.overConsumedAfter.excessT} T)
  Baby coil left (Dashboard)  ${t.babyCoilLeftBeforeT} T  ->  ${t.babyCoilLeftAfterT} T

  Productions that do NOT fully place  ${t.shortfallProductions}
    unplaced pieces                    ${t.shortfallPieces}  (${t.shortfallWeightT} T)

  Detail: .workspace/coil-realloc-dryrun.json
`)

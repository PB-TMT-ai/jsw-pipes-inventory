// ── Dry run: re-trace every live dispatch entry's coil link, oldest invoice first. ──
//
// Why: the 31-Oct-2026 invoice upload traced October as if no earlier dispatch existed (the
// browser's dispatch store had not loaded), so FIFO restarted at the oldest tubes and claimed
// ones April–September invoices already held — 180 coils read more dispatched than they weigh.
//
// This script REPLAYS the app's own `dispatchCoilTrace` over every live dispatch entry in
// invoice-date order, each line draining everything traced before it AT ITS OWN PLANT, against today's live
// productions (weights resolved exactly as App.jsx does). It WRITES NOTHING — it reports the
// before/after per coil and writes the changed records for review.
//
// Usage:   node scripts/dispatch-retrace-dryrun.mjs
// Inputs:  .workspace/{skus,babycoils,coils,productions,dispatches}.json  (live rows, camelCase,
//          dispatches already filtered to deleted = false)
// Output:  .workspace/dispatch-retrace-dryrun.json  (summary + per-coil diff)
//          .workspace/dispatch-retrace-apply.json   ([{ id, bundleEntries }] — changed records only)

import fs from 'node:fs'
import { dispatchCoilTrace, resolveProductionWeights, skuKeyResolver } from '../src/lib/calc.js'

const read = (f) => JSON.parse(fs.readFileSync(new URL(`../.workspace/${f}.json`, import.meta.url), 'utf-8'))
const write = (f, v) => fs.writeFileSync(new URL(`../.workspace/${f}.json`, import.meta.url), JSON.stringify(v, null, 1))
const skus = read('skus'), babyCoils = read('babycoils'), coils = read('coils').filter(c => !c.deleted)
const productions = resolveProductionWeights(read('productions').filter(p => !p.deleted), skus, babyCoils)
const dispatches = read('dispatches').filter(d => !d.deleted)
const keyOf = skuKeyResolver(skus)

// Oldest invoice first; ties by invoice number, then the entry's own order on the invoice.
const lines = dispatches.flatMap(d => (d.bundleEntries || []).map((e, i) => ({ d, e, i })))
  .sort((a, b) => String(a.d.dateOfDispatch).localeCompare(String(b.d.dateOfDispatch))
    || String(a.e.invoiceNo || a.d.invoiceNo).localeCompare(String(b.e.invoiceNo || b.d.invoiceNo)) || a.i - b.i)

const done = []                                   // entries traced so far — what the next line drains
const ctx = [{ id: '__replay__', deleted: false, bundleEntries: done }]
const newAllocs = new Map()                       // entry object → its re-traced allocations
for (const { e } of lines) {
  newAllocs.set(e, dispatchCoilTrace(e.skuCode, e.pieces, productions, ctx, null, keyOf, e.plant || null))
  done.push(e)
}

// Per-coil tonnage before (stored) and after (replay).
const plantOf = new Map(coils.map(c => [c.hrCoilId, c.plant]))
const sum = (pick) => {
  const m = new Map()
  for (const { e } of lines) for (const a of pick(e)) m.set(a.hrCoilId, (m.get(a.hrCoilId) || 0) + Number(a.weight || 0))
  return m
}
const before = sum(e => e.coilAllocations || []), after = sum(e => newAllocs.get(e))
const over = (m) => coils.reduce((s, c) => {
  const x = (m.get(c.hrCoilId) || 0) - Number(c.actualWeight || 0)
  return x > 0.05 ? { n: s.n + 1, t: s.t + x } : s
}, { n: 0, t: 0 })
const crossPlant = (pick) => lines.reduce((s, { e }) => s + pick(e)
  .filter(a => e.plant && plantOf.get(a.hrCoilId) && plantOf.get(a.hrCoilId) !== e.plant)
  .reduce((w, a) => w + Number(a.weight || 0), 0), 0)
const tracedT = (m) => [...m.values()].reduce((s, v) => s + v, 0)
const pcs = (pick) => lines.reduce((s, { e }) => s + pick(e).reduce((p, a) => p + Number(a.pieces || 0), 0), 0)

// Records whose allocations changed — only these would be written.
const sig = (allocs) => JSON.stringify((allocs || []).map(a => [a.babyCoilId, a.hrCoilId, Number(a.pieces || 0)]))
const apply = dispatches.flatMap(d => {
  const entries = (d.bundleEntries || []).map(e => {
    const allocs = newAllocs.get(e)
    return sig(allocs) === sig(e.coilAllocations) ? e : { ...e, coilAllocations: allocs, traceHrCoilId: allocs[0]?.hrCoilId || '' }
  })
  return entries.some((e, i) => e !== d.bundleEntries[i]) ? [{ id: d.id, bundleEntries: entries }] : []
})
const changedLines = lines.filter(({ e }) => sig(newAllocs.get(e)) !== sig(e.coilAllocations)).length

const r1 = (n) => Number(n.toFixed(1))
const ob = over(before), oa = over(after)
const summary = {
  liveDispatches: dispatches.length, liveLines: lines.length,
  linesChanged: changedLines, recordsChanged: apply.length,
  coilsOver: { before: ob.n, after: oa.n }, tonnesOver: { before: r1(ob.t), after: r1(oa.t) },
  tracedTonnes: { before: r1(tracedT(before)), after: r1(tracedT(after)) },
  tracedPieces: { before: pcs(e => e.coilAllocations || []), after: pcs(e => newAllocs.get(e)) },
  invoicedTonnes: r1(lines.reduce((s, { e }) => s + Number(e.weight || 0), 0)),
  crossPlantTonnes: { before: r1(crossPlant(e => e.coilAllocations || [])), after: r1(crossPlant(e => newAllocs.get(e))) },
}
const perCoil = coils.map(c => ({
  hrCoilId: c.hrCoilId, plant: c.plant, coilT: Number(c.actualWeight || 0),
  beforeT: r1(before.get(c.hrCoilId) || 0), afterT: r1(after.get(c.hrCoilId) || 0),
})).filter(r => Math.abs(r.beforeT - r.afterT) >= 0.05).sort((a, b) => (b.beforeT - b.afterT) - (a.beforeT - a.afterT))

// Self-check: the replay must never put more tubes on a production allocation than it holds.
const held = new Map(), taken = new Map()
productions.forEach(p => (p.coilAllocations || []).forEach(a => held.set(a.babyCoilId, (held.get(a.babyCoilId) || 0) + Number(a.pieces || 0))))
for (const allocs of newAllocs.values()) allocs.forEach(a => taken.set(a.babyCoilId, (taken.get(a.babyCoilId) || 0) + a.pieces))
const overTaken = [...taken].filter(([id, n]) => n > (held.get(id) || 0))
if (overTaken.length) throw new Error(`replay over-claims ${overTaken.length} slit coils, e.g. ${overTaken[0]}`)

write('dispatch-retrace-dryrun', { summary, perCoil })
write('dispatch-retrace-apply', apply)
console.log(JSON.stringify(summary, null, 1))
console.log('largest moves (T):')
for (const r of [...perCoil.slice(0, 5), ...perCoil.slice(-5)]) console.log(`  ${r.hrCoilId.padEnd(14)} ${r.plant.padEnd(10)} coil ${r.coilT}  ${r.beforeT} → ${r.afterT}`)

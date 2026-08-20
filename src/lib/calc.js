// ═══════════════════════════════════════════════════════════════
// CALC — pure helpers & business logic extracted from App.jsx for testability.
// No React, no DOM, no Supabase imports here. Keep these functions side-effect free.
// ═══════════════════════════════════════════════════════════════

// Static state→region seed. A plain data module (no React/DOM/Supabase), imported as the DEFAULT
// seed so every caller gets the six shipped mappings without threading them through; tests and the
// report builders can still inject their own.
// The `.js` extension is load-bearing — see the note on the same import in src/lib/reports.js.
import DEFAULT_STATE_REGIONS from '../data/stateRegions.js'
// Static plant master — the four companies the ERP ships the order book under. Same shape of
// dependency as the state→region seed above, and the same load-bearing `.js` extension.
import DEFAULT_PLANTS from '../data/plants.js'
// Static distributor master — region overrides only, and empty as shipped. Same dependency shape
// and the same load-bearing `.js` extension as the two seeds above.
import DEFAULT_DISTRIBUTORS from '../data/distributors.js'

// ── Formatting ──
export const fmtT = (v) => v != null ? Number(v).toFixed(1) : '—'
// Full-precision tonnage (3 decimals) — used for raw coil-stage records (Coil Inward, Slitting)
// where operators need exact entered/derived weights, not the dashboard's 1-decimal rounding.
export const fmtT3 = (v) => v != null ? Number(v).toFixed(3) : '—'
export const fmtPct = (v) => v != null ? Number(v).toFixed(1) + '%' : '—'
export const fmtINR = (v) => v != null && !isNaN(v) ? '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'

// ── Short distributor code = first N words of the name, uppercased. Used for compact
// display in the Sales views (the full name is kept in CSV exports). Blank / '—' pass
// through unchanged, so the existing blank-distributor bucket label is preserved. ──
export function distributorCode(name, words = 2) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  return parts.length ? parts.slice(0, words).join(' ').toUpperCase() : ''
}

// ── Dashboard period filter. `periodRange` maps a preset to an inclusive ISO {from,to}
// window (empty string ⇒ open-ended on that side). period ∈
// 'all' | '7d' | 'mtd' | 'month' | 'custom'. `today` is 'YYYY-MM-DD', `monthSel` is 'YYYY-MM'.
// All date math in UTC so month boundaries / leap years don't drift with the local TZ. ──
const isoShiftDays = (iso, days) => {
  const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
export function periodRange(period, { today, monthSel = '', customFrom = '', customTo = '' } = {}) {
  const t = today || new Date().toISOString().slice(0, 10)
  if (period === '7d') return { from: isoShiftDays(t, -6), to: '' }       // last 7 days incl. today
  if (period === 'mtd') return { from: t.slice(0, 7) + '-01', to: '' }    // month-to-date
  if (period === 'month') {
    if (!monthSel) return { from: '', to: '' }
    const end = new Date(monthSel + '-01T00:00:00Z')
    end.setUTCMonth(end.getUTCMonth() + 1); end.setUTCDate(0)             // last day of monthSel
    return { from: monthSel + '-01', to: end.toISOString().slice(0, 10) }
  }
  if (period === 'custom') return { from: customFrom || '', to: customTo || '' }
  return { from: '', to: '' }                                            // 'all'
}
export const inDateRange = (d, range) => {
  const { from, to } = range || {}
  if (!from && !to) return true
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

// ── Coil Inward's running number: the next hrCoilNo to suggest. Extracted from an inline React
// hook (ticket #122) so it can be reached by a test. Scoped to ONE plant's own coils — the max
// among only that plant's rows, plus one — so NPMD's first coil starts at 01 whatever number
// Hyderabad is on, and Hyderabad's is never disturbed by how many coils NPMD holds. A coil with
// no plant recorded (a pre-#120 row never backfilled) counts toward NEITHER plant — it is
// filtered out by the same `filterByPlant` a real plant id always takes the non-ALL_PLANTS
// branch of, so it can never inflate a real plant's next number.
// `plant` defaults to Hyderabad, the same default every other plant-aware helper here uses. ──
export function nextCoilNumber(coils, plant = DEFAULT_COIL_PLANT) {
  const nums = filterByPlant(coils, plant).map(c => c?.hrCoilNo)
  return nums.length ? Math.max(...nums) + 1 : 1
}

// ── HR coil ID generator: <PREFIX>-MMYY-NN. The prefix comes from the plant's own master row
// (ticket #122) instead of a hardcoded 'HYD', so a mother coil's id says which plant's register
// it belongs to — Hyderabad keeps HYD-, NPMD gets NPM-. `plant` defaults to Hyderabad, and a
// blank/unknown plant or a master row missing its prefix falls back to it too, so an old 2-arg
// call and a coil not yet backfilled both keep generating exactly the id they always have. ──
export function genHRCoilId(dateStr, num, plant = DEFAULT_COIL_PLANT, master = DEFAULT_PLANTS) {
  const d = new Date(dateStr)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  const prefix = plantById(plant, master)?.coilPrefix || 'HYD'
  return `${prefix}-${mm}${yy}-${String(num).padStart(2, '0')}`
}

// ── ±tolerance check. NOTE: returns ok:true when either arg is falsy — callers
// that must block on an over-value (e.g. the weight cap) compare explicitly. ──
export function tolerance(actual, expected, tol = 0.05) {
  if (!expected || !actual) return { ok: true, pct: 0, label: '—' }
  const pct = (actual / expected) * 100
  const ok = pct >= (1 - tol) * 100 && pct <= (1 + tol) * 100
  return { ok, pct, label: `${actual.toFixed(1)} / ${expected.toFixed(1)} (${pct.toFixed(1)}%)` }
}

// ── Bundle weight-per-piece from the chosen SKU (kg → tonnes). Explicitly guards NaN/negative: a
// truthy-but-non-numeric weightPerTube (bad Excel/DB value) must resolve to 0, not NaN, so it can't
// poison totalWeight or render "NaN" downstream. ──
export const weightPerPieceFromSku = (sku) => {
  const n = Number(sku?.weightPerTube)
  return Number.isFinite(n) && n > 0 ? n / 1000 : 0
}

// ── Recompute each production's weight LIVE from the current SKU master, so a value frozen onto the
// record at save-time (0 when the SKU had no weight yet, or was created later) is never displayed
// stale. Rewrites weightPerPiece, totalWeight AND every coilAllocations[].weight (so Coil Tracker /
// baby-coil "% used" is correct too) — but ONLY when the SKU resolves to a POSITIVE weight, so an
// unknown / unpublished / weightless SKU (wpp of 0 or NaN) leaves the stored values untouched and
// never zeroes a previously-good row. Also re-derives a blank mother `hrCoilId` from the baby coil
// (when babyCoils is supplied) so per-mother coil rollups don't silently drop the allocation. On a
// duplicate skuCode in the master, the POSITIVE-weight row wins (a weightless twin never shadows a
// good one). Pure + non-destructive: nothing is written back. ──
export function resolveProductionWeights(productions, skus, babyCoils) {
  const byCode = new Map()
  ;(skus || []).forEach(s => {
    const cur = byCode.get(s.skuCode)
    if (!cur || (!weightPerPieceFromSku(cur) && weightPerPieceFromSku(s))) byCode.set(s.skuCode, s)
  })
  const motherOf = new Map((babyCoils || []).map(b => [b.babyCoilId, b.hrCoilId]))
  return (productions || []).map(p => {
    const wpp = weightPerPieceFromSku(byCode.get(p.skuCode))
    if (!(wpp > 0)) return p
    const coilAllocations = (p.coilAllocations || []).map(a => ({
      ...a,
      hrCoilId: a.hrCoilId || motherOf.get(a.babyCoilId) || a.hrCoilId,
      weight: Number(a.pieces || 0) * wpp,
    }))
    return { ...p, weightPerPiece: wpp, totalWeight: wpp * Number(p.tubeCount || 0), coilAllocations }
  })
}

// ── Strip (blank) width a tube needs, in mm — the slit width a baby coil must have to
// roll-form this SKU. Pure geometry (a perimeter), NO density constants: SHS/RHS use the
// outer perimeter 2×(height+breadth) (e.g. 25×25 → 100 mm); CHS uses π×outsideDiameter.
// Returns 0 when the dimensions aren't known, in which case the caller skips the width
// filter (degrades to thickness-only, as before). Used by the Production stage to suggest
// coils whose slit width is within ±WIDTH_TOL_MM of this value. ──
export const WIDTH_TOL_MM = 5
export function requiredStripWidth(sku) {
  if (!sku) return 0
  const type = String(sku.productType || '').toUpperCase()
  const od = Number(sku.outsideDiameter || 0)
  if (type === 'CHS' || od > 0) return od > 0 ? Math.PI * od : 0
  const h = Number(sku.height || 0), b = Number(sku.breadth || 0)
  return h > 0 && b > 0 ? 2 * (h + b) : 0
}

// ── Per-coil weight cap. Bundling weight from a mother coil must stay ≤ its actual
// weight, with a ±tol over-fill ceiling. Guards coilWeight>0 so a zero-weight coil
// never allows unlimited bundling (the tolerance() helper would say ok for 0). ──
export function bundleWeightCap({ coilWeight, allocatedWeight, weightPerPiece, pieces, tol = 0.05 }) {
  const cw = Number(coilWeight || 0)
  const alloc = Number(allocatedWeight || 0)
  const wpp = Number(weightPerPiece || 0)
  const prospectiveWeight = alloc + wpp * Number(pieces || 0)
  const weightCeiling = cw * (1 + tol)
  const remainingWeight = cw - prospectiveWeight
  const overFilled = cw > 0 && prospectiveWeight > weightCeiling
  const overTolerance = cw > 0 && prospectiveWeight > cw && prospectiveWeight <= weightCeiling
  const maxPieces = wpp > 0 && cw > 0 ? Math.max(0, Math.floor((weightCeiling - alloc) / wpp)) : 0
  return { prospectiveWeight, weightCeiling, remainingWeight, overFilled, overTolerance, maxPieces }
}

// ── Cap an operator's manual coil split at each coil's real capacity, spilling the excess
// into their own later rows (and, if `spare` is supplied, into further eligible coils).
//
// Production over-consumed 445 baby coils by 123.3 T because nothing capped the manual pick:
// a whole production's pieces could land on one coil holding a fraction of them. This is the
// guard. It is NOT the FIFO suggestion — it never introduces a coil the operator did not
// choose unless `spare` is passed, and it preserves their row order, so the operator's intent
// survives. Whole pieces only.
//
// `capacityOf(babyCoilId)` returns the coil's REMAINING weight (slit weight − consumed
// elsewhere). `fillPct` is the fraction of capacity a row may reach (1.05 = the app's
// universal ±5% band). Returns `{ rows, leftoverPieces }`; leftover means the operator's
// chosen coils genuinely cannot hold the run — the caller decides (save partial, or pick
// another coil). ──
export function capAllocationRows({ rows, capacityOf, weightPerPiece, fillPct = 1.05, spare = [] }) {
  const wpp = Number(weightPerPiece || 0)
  if (!(wpp > 0)) return { rows: rows || [], leftoverPieces: 0 }

  // Room left on a coil, in whole pieces, accounting for what earlier rows already placed.
  const placed = new Map()
  const roomPieces = (id) => {
    const cap = Number(capacityOf(id) || 0) * fillPct
    const used = (placed.get(id) || 0) * wpp
    return Math.max(0, Math.floor((cap - used) / wpp))
  }

  const out = []
  let carry = 0
  for (const r of (rows || [])) {
    const want = Math.max(0, Math.floor(Number(r.pieces || 0))) + carry
    carry = 0
    if (!r.babyCoilId) { out.push({ ...r, pieces: 0 }); carry = want; continue }
    const take = Math.min(want, roomPieces(r.babyCoilId))
    placed.set(r.babyCoilId, (placed.get(r.babyCoilId) || 0) + take)
    out.push({ ...r, pieces: take })
    carry = want - take
  }

  // Anything still carried spills into spare coils, in the order given (caller sorts them).
  for (const id of spare) {
    if (carry <= 0) break
    if (!id || placed.has(id)) continue
    const take = Math.min(carry, roomPieces(id))
    if (take <= 0) continue
    placed.set(id, take)
    out.push({ babyCoilId: id, pieces: take })
    carry -= take
  }

  return { rows: out, leftoverPieces: carry }
}

// Absolute thickness eligibility band (mm). Retained for callers that still want a
// symmetric band; the Production stage no longer uses it — see RM_TO_FG_THICKNESS.
export const THICKNESS_TOL_MM = 0.3

// ── RM (coil) thickness → FG (pipe) thickness the mill can roll from it. The plant's rule
// sheet, confirmed 2026-08-05. This replaces the old symmetric ±0.3 mm band for Production,
// which was wrong in BOTH directions: it admitted pairings the mill never runs (2.5 coil →
// 2.3 pipe) and rejected ones it does (2.6 coil → 2.8 pipe is 0.2 mm, but 3.7 coil → 4.0
// pipe is 0.3 mm and 2.2 coil → 2.2 AND 2.3 pipe is a one-to-many the band cannot express).
// The relation is asymmetric and many-to-many, so it is a lookup, not a tolerance. ──
export const RM_TO_FG_THICKNESS = [
  { rm: 1.6, fg: [1.6] },
  { rm: 2.0, fg: [2.0] },
  { rm: 2.1, fg: [2.0] },
  { rm: 2.2, fg: [2.2, 2.3] },
  { rm: 2.3, fg: [2.5] },
  { rm: 2.5, fg: [2.5] },
  { rm: 2.6, fg: [2.8] },
  { rm: 2.8, fg: [2.8] },
  { rm: 3.0, fg: [3.0, 3.2] },
  { rm: 3.7, fg: [3.8, 4.0] },
  { rm: 4.0, fg: [4.0] },
]

// Gauge values are one-decimal mill sizes; compare with a small epsilon so 2.2 from the SKU
// master and 2.2000000000000002 from a spreadsheet import are the same gauge.
const GAUGE_EPS = 0.01
const sameGauge = (a, b) => Math.abs(Number(a) - Number(b)) < GAUGE_EPS

// Baby coil thicknesses that can legally roll this FG thickness. Empty ⇒ the FG gauge is not
// in the sheet; callers must surface that rather than silently falling back to a band.
export function allowedRmThickness(fgThickness) {
  return RM_TO_FG_THICKNESS
    .filter(r => r.fg.some(f => sameGauge(f, fgThickness)))
    .map(r => r.rm)
}

// True when a coil of `rmThickness` may roll a pipe of `fgThickness`.
export function rmRollsFg(rmThickness, fgThickness) {
  return allowedRmThickness(fgThickness).some(rm => sameGauge(rm, rmThickness))
}

// ── FIFO mother-coil allocation (Production stage). Allocates a produced quantity
// across eligible mother coils: oldest dateOfInward first, eligible only when the
// coil thickness can roll the SKU thickness. Pass `thicknessRule: true` to use the
// plant's RM→FG rule sheet (what Production does); otherwise the legacy symmetric
// band applies — ±thickTolMm (absolute mm) when provided, else ±tol (relative). Fills each coil to its
// nominal actualWeight (oldest first); only if pieces still remain does it stretch
// coils into the ±tol over-fill band (pass 2). Allocates whole PIECES (no fractional
// tubes); weight per allocation = pieces × weightPerPiece. Never exceeds 105% of any
// coil — leftover pieces are reported as a shortfall (caller decides whether to block).
// NOTE: `tol` governs the weight over-fill band (and overTolerance) — keep it separate
// from the thickness band, which is controlled by `thickTolMm`.
// `plant` (ticket #124) filters `coils` to one plant's own rows via `filterByPlant`
// BEFORE any other eligibility rule runs — width/thickness/consumed/capacity are all
// applied only within that plant's coils, never across plants. Defaults to `ALL_PLANTS`,
// the same pass-through sentinel `filterByPlant` already uses, so every existing caller
// that omits it keeps allocating across all coils exactly as before. ──
export function coilFifoAllocate({ coils, consumedByCoil = {}, skuThickness, weightPerPiece, pieces, tol = 0.05, thickTolMm = null, softFill = 1, thicknessRule = false, plant = ALL_PLANTS }) {
  const wpp = Number(weightPerPiece || 0)
  const reqPieces = Math.max(0, Math.floor(Number(pieces || 0)))
  const st = Number(skuThickness || 0)
  // Auto-advance fraction: fill each coil only to softFill×capacity before moving to the next
  // (e.g. 0.97 = advance at 97%). soft=1 ⇒ classic fill-to-nominal. The 97→100% and 100→105%
  // bands stay reachable as later passes (and for manual top-up in the UI).
  const soft = Math.min(1, Math.max(0, Number(softFill) || 1))
  // consumedByCoil values may be a number (weight) or a rich { weight } object.
  const consumedWt = (id) => {
    const v = consumedByCoil[id]
    return v && typeof v === 'object' ? Number(v.weight || 0) : Number(v || 0)
  }

  // Thickness eligibility: the plant's RM→FG rule sheet when `thicknessRule` is set
  // (Production), else the legacy symmetric band — absolute `thickTolMm` if the caller
  // passes one, otherwise ±tol relative.
  const thicknessOk = (c) => thicknessRule
    ? rmRollsFg(c.thickness, st)
    : Math.abs(Number(c.thickness) - st) <= (thickTolMm != null ? thickTolMm : tol * st)
  const eligible = filterByPlant(coils, plant)
    .filter(c => !c.deleted && Number(c.actualWeight) > 0 && st > 0 && thicknessOk(c))
    .sort((a, b) => {
      const da = String(a.dateOfInward || ''), db = String(b.dateOfInward || '')
      if (da !== db) return da < db ? -1 : 1
      return String(a.hrCoilId || '').localeCompare(String(b.hrCoilId || ''))
    })

  const placed = new Map() // hrCoilId → pieces placed by this allocation
  let remaining = reqPieces
  const fill = (capacityFor) => {
    if (wpp <= 0) return
    for (const c of eligible) {
      if (remaining <= 0) break
      const already = placed.get(c.hrCoilId) || 0
      const used = consumedWt(c.hrCoilId) + already * wpp
      const headroom = capacityFor(c) - used
      if (headroom <= 0) continue
      const fit = Math.min(remaining, Math.floor(headroom / wpp))
      if (fit <= 0) continue
      placed.set(c.hrCoilId, already + fit)
      remaining -= fit
    }
  }
  fill(c => Number(c.actualWeight) * soft)        // pass 1: advance at softFill (oldest first)
  if (remaining > 0 && soft < 1) fill(c => Number(c.actualWeight))  // pass 2: top up to nominal 100%
  if (remaining > 0) fill(c => Number(c.actualWeight) * (1 + tol)) // pass 3: ±tol over-fill band

  const allocations = eligible
    .filter(c => placed.has(c.hrCoilId))
    .map(c => {
      const pcs = placed.get(c.hrCoilId)
      const weight = pcs * wpp
      return { hrCoilId: c.hrCoilId, pieces: pcs, weight,
        overTolerance: (consumedWt(c.hrCoilId) + weight) > Number(c.actualWeight) }
    })

  const allocatedPieces = reqPieces - remaining
  return {
    allocations,
    allocatedPieces,
    allocatedWeight: allocatedPieces * wpp,
    requestedPieces: reqPieces,
    requestedWeight: reqPieces * wpp,
    shortfallPieces: remaining,
    shortfall: remaining > 0,
    overTolerance: allocations.some(a => a.overTolerance),
    noEligibleCoil: eligible.length === 0,
    fullyAllocated: reqPieces > 0 && remaining === 0,
  }
}

// ── Weight & pieces consumed from each coil by all production records.
// Keyed by `key` — 'babyCoilId' for baby-coil FIFO capacity (Production consumes baby
// coils), or 'hrCoilId' (default, mother) for mother-level rollups / legacy allocations.
// Allocations missing the chosen key are skipped (legacy mother-only rows don't consume
// baby capacity). Returns { [id]: { weight, pieces } }. Pass excludeId to ignore the
// production currently being edited (so it re-allocates as if released). ──
export function coilConsumption(productions, excludeId = null, key = 'hrCoilId') {
  const out = {}
  ;(productions || []).filter(p => !p.deleted && p.id !== excludeId).forEach(p =>
    (p.coilAllocations || []).forEach(a => {
      const id = a[key]
      if (id == null || id === '') return
      const cur = out[id] || { weight: 0, pieces: 0 }
      cur.weight += Number(a.weight || 0)
      cur.pieces += Number(a.pieces || 0)
      out[id] = cur
    }))
  return out
}

// ── Per-SKU produced pool: produced (from productions) minus dispatched (from each
// dispatch's bundleEntries). Bundle Formation was removed (June 2026 later change);
// dispatch now draws straight from production. availablePieces/Weight = produced −
// dispatched. Pass excludeDispatchId to ignore the dispatch being edited/re-imported. ──
// `keyOf` (default identity) maps a raw skuCode to the canonical join identity so produced and
// dispatched net by physical pipe, not by an exact code string. Callers that pass
// `skuKeyResolver(skus)` get canonical netting; existing callers (and tests) keep raw-code behavior.
export function producedPool(productions, dispatches, excludeDispatchId = null, keyOf = (c) => c) {
  const out = {}
  const ensure = (sku) => (out[sku] = out[sku] ||
    { producedPieces: 0, producedWeight: 0, dispatchedPieces: 0, dispatchedWeight: 0 })
  ;(productions || []).filter(p => !p.deleted).forEach(p => {
    const e = ensure(keyOf(p.skuCode))
    e.producedPieces += Number(p.tubeCount || 0)
    e.producedWeight += Number(p.totalWeight || 0)
  })
  ;(dispatches || []).filter(d => !d.deleted && d.id !== excludeDispatchId)
    .flatMap(d => d.bundleEntries || []).forEach(be => {
      const e = ensure(keyOf(be.skuCode))
      e.dispatchedPieces += Number(be.pieces || 0)
      e.dispatchedWeight += Number(be.weight || 0)
    })
  Object.values(out).forEach(e => {
    e.availablePieces = e.producedPieces - e.dispatchedPieces
    e.availableWeight = e.producedWeight - e.dispatchedWeight
  })
  return out
}

// ── Dispatch that has no production behind it. A SKU whose availableWeight is negative was
// invoiced beyond what we recorded producing — the pipe physically left the plant, so the tonnage
// is real, but the SKU itself cannot hold negative stock.
//
// Every stock total must therefore show BOTH terms of this identity:
//
//   Σ(produced − dispatched)  =  Σ positive on-hand  −  unmatched dispatch
//        1857.643 (28-07-26)  =        1893.826      −        36.183
//
// Flooring each SKU at 0 and summing yields only the first term, which silently deletes the
// unmatched tonnage from the books. Callers floor rows for DISPLAY and subtract this for TOTALS.
// Returns the magnitude (positive MT) plus the SKU count, so the two can never drift apart.
// Takes a producedPool result, so it inherits whatever canonical netting the caller used. ──
export function unmatchedDispatch(pool) {
  let weight = 0, pieces = 0, skus = 0
  Object.values(pool || {}).forEach(e => {
    const w = Number(e.availableWeight || 0)
    if (w >= 0) return
    weight -= w                                        // magnitude, not the signed value
    pieces -= Math.min(0, Number(e.availablePieces || 0))
    skus += 1
  })
  return { weight, pieces, skus }
}

// ── FIFO stock ageing per canonical SKU. On-hand = produced − dispatched (same netting as
// producedPool); dispatches drain the OLDEST production first (first produced, first out — the
// same oldest-first order as dispatchCoilTrace), so the tonnes still in stock are the most-recent
// batches. Each surviving batch is aged `asOf − dateOfProduction`; we return the tonnage-weighted
// average (and oldest) age. Draining is by WEIGHT so the surviving weight equals producedPool's
// availableWeight — i.e. it ties exactly to the "Inventory (T)" column. `keyOf` should be the same
// skuKeyResolver used by the caller so ageing joins to the same rows. `asOf` is 'YYYY-MM-DD'.
// Returns { [key]: { onhandWeight, avgAgeDays, oldestAgeDays, buckets:{d0_30,d31_60,d61_90,d90plus} } }
// (only keys with positive stock). `buckets` split the surviving weight by age band (Σ buckets ==
// onhandWeight); the field is additive — earlier callers that read only the scalar ages ignore it. ──
export function skuAgeing(productions, dispatches, keyOf = (c) => c, asOf = new Date().toISOString().slice(0, 10)) {
  const dayOf = (iso) => Math.floor(Date.parse(String(iso)) / 86400000)
  const asOfDay = dayOf(asOf)
  // Total dispatched WEIGHT per key (matches producedPool's dispatchedWeight netting).
  const dispByKey = {}
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(e => {
    const k = keyOf(e.skuCode)
    dispByKey[k] = (dispByKey[k] || 0) + Number(e.weight || 0)
  })
  // Production layers per key, tagged with date + weight.
  const layersByKey = {}
  ;(productions || []).filter(p => !p.deleted).forEach(p => {
    const k = keyOf(p.skuCode)
    ;(layersByKey[k] = layersByKey[k] || []).push({ date: p.dateOfProduction, weight: Number(p.totalWeight || 0) })
  })
  const out = {}
  for (const k of Object.keys(layersByKey)) {
    const layers = layersByKey[k].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    let drain = dispByKey[k] || 0, onhand = 0, ageWt = 0, oldest = null
    const bkt = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }  // surviving weight by age band
    for (const L of layers) {
      let surv = L.weight
      if (drain > 0) { const take = Math.min(drain, L.weight); surv -= take; drain -= take }   // FIFO: oldest shipped first
      if (surv <= 1e-9) continue
      const d = dayOf(L.date)
      const age = Number.isFinite(d) ? asOfDay - d : 0
      onhand += surv; ageWt += surv * age
      if (oldest == null || age > oldest) oldest = age
      if (age <= 30) bkt.d0_30 += surv
      else if (age <= 60) bkt.d31_60 += surv
      else if (age <= 90) bkt.d61_90 += surv
      else bkt.d90plus += surv
    }
    if (onhand > 1e-9) out[k] = { onhandWeight: onhand, avgAgeDays: ageWt / onhand, oldestAgeDays: oldest, buckets: bkt }
  }
  return out
}

// ── Customer-order booking (FG Booked / Free FG). An order line is "open" (still committed
// against inventory) when its Order Status is not a terminal one. Delivered/Cancelled/Rejected
// (and blank) are excluded — delivered demand is already reflected in dispatched FG. ──
export const isOpenOrderStatus = (status) => {
  const s = String(status || '').trim().toLowerCase()
  return s !== '' && !['delivered', 'cancelled', 'canceled', 'rejected'].includes(s)
}

// ── A line's Confirmed / Non-confirmed stop counting toward "Pending to Dispatch" once the
// order is Delivered (closed) — a delivered order can still carry a non-confirmed remainder
// (ordered qty never released) that must NOT show as pending. Only 'Delivered' is treated as
// closed here (deliberately narrower than isOpenOrderStatus): Cancelled/Rejected are already
// netted to ~0 inside nonConfirmed, and blank stays counted. ──
export const isDeliveredStatus = (status) =>
  String(status || '').trim().toLowerCase() === 'delivered'

// ── Derived order-line stage for the Orders table badge. The raw ERP "Order Status" overloads
// "Confirmed" (an order-lifecycle state) against the Confirmed/Non-confirmed (MT) quantity buckets,
// so a freshly-accepted order shows Status=Confirmed with ALL its volume in Non-confirmed. This
// derives ONE stage from the row's own numbers so the badge always agrees with the columns.
// Cancelled/Rejected are preserved verbatim (the quantity math nets them to ~0, so the stage can't
// be re-derived). `invoiced` = orderLineInvoiced(order, shippedByOrderLine(dispatches)). ──
export function orderLineStage(order, invoiced = 0) {
  const st = String(order?.orderStatus || '').trim().toLowerCase()
  if (['cancelled', 'canceled', 'rejected'].includes(st)) return order.orderStatus   // preserve ERP terminal
  const qty = Number(order?.quantity || 0)
  const inv = Number(invoiced || 0)
  if (qty > 0 && inv >= qty * 0.95) return 'Delivered'              // fully invoiced (±5%)
  if (inv > 0) return 'Partially invoiced'                          // some shipped
  if (Number(order?.confirmed || 0) > 0) return 'Confirmed'         // released, pending dispatch
  if (Number(order?.nonConfirmed || 0) > 0) return 'Non-confirmed'  // ordered, not yet released
  if (qty > inv) return 'Pending'
  return order?.orderStatus || ''                                   // fallback to raw ERP text
}

// ── Open ordered quantity (MT) per SKU, keyed by mmId (== SKU master skuCode). Sums the
// Quantity of non-deleted, open-status order lines. ──
export function openOrderQtyBySku(orders) {
  const out = {}
  ;(orders || []).filter(o => !o.deleted && isOpenOrderStatus(o.orderStatus)).forEach(o => {
    const code = String(o.mmId || '').trim()
    if (!code) return
    out[code] = (out[code] || 0) + Number(o.quantity || 0)
  })
  return out
}

// ── Reserved (committed) inventory per SKU, keyed by mmId. An order line reserves stock once
// it has been RELEASED but not yet INVOICED, and only while the order is still active (open
// status — i.e. not Delivered / Cancelled / Rejected / blank-nan, via isOpenOrderStatus).
//   reserved (per line) = max(0, releaseQty − invoicedQty)
// Both quantities are MT, sourced from the ERP Orders upload ("Release Qty" / "Invoiced Qty"). ──
export function reservedBySku(orders, keyOf = (c) => c) {
  const out = {}
  ;(orders || []).filter(o => !o.deleted && isOpenOrderStatus(o.orderStatus)).forEach(o => {
    const code = String(o.mmId || '').trim()
    if (!code) return
    const k = keyOf(code, o.description)   // bridge an ERP code the master lacks via its description
    out[k] = (out[k] || 0) + Math.max(0, Number(o.releaseQty || 0) - Number(o.invoicedQty || 0))
  })
  return out
}

// ── Cross-section size label for SKU filtering. Prefers the SKU master fields:
//   CHS → "<nominalBore> NB" (e.g. "32 NB"); SHS/RHS → "<height>x<breadth>" (e.g. "150x150").
// Falls back to parsing the description (NB form first, then a WxH section). Returns '' when
// nothing parses. ──
export function skuSizeLabel(sku, desc) {
  if (sku) {
    if (sku.nominalBore) return `${sku.nominalBore} NB`
    if (sku.height && sku.breadth) return `${sku.height}x${sku.breadth}`
  }
  const s = String(desc || '')
  const nb = s.match(/(\d+(?:\.\d+)?)\s*NB/i)
  if (nb) return `${nb[1]} NB`
  const sec = s.match(/(\d+(?:\.\d+)?)\s*[xX*]\s*(\d+(?:\.\d+)?)/)
  if (sec) return `${sec[1]}x${sec[2]}`
  return ''
}

// ── Canonical physical-product identity for a SKU. Two SKU master entries that describe the
// SAME tube but differ only in decimal formatting (e.g. "…1.6x6000" vs "…1.60x6000") collapse
// to ONE key, while genuinely different products stay distinct — the IS standard is included so
// IS 1161 vs IS 3601 (or IS 4923) never merge. Accepts a SKU object or a raw description string;
// the same physical product yields the same key from either form. Used to dedupe the SKU master
// and to block creating duplicate SKUs — deliberately NOT used by the inventory netting
// (producedPool keys by real code, which becomes correct once the master is deduped). Returns the
// normalised description as a safe fallback when the structured parts don't parse. ──
export function canonicalSkuKey(skuOrDesc) {
  const isObj = skuOrDesc && typeof skuOrDesc === 'object'
  const desc = String((isObj ? skuOrDesc.description : skuOrDesc) || '')
  const s = desc.toLowerCase().replace(/×/g, 'x')
  const type = String(
    (isObj && skuOrDesc.productType) || (desc.match(/\b(SHS|RHS|CHS|ERW)\b/i)?.[1]) || ''
  ).toUpperCase()
  const std = s.match(/is\s*(\d+)/)?.[1] || ''                 // IS standard (1161 / 3601 / 4923 …)
  const sizeLabel = skuSizeLabel(isObj ? skuOrDesc : null, desc)
  // thickness & length are the last two numbers of the dimension tail ("…x<thickness>x<length>").
  const tail = s.split('black')[1] || s
  const nums = (tail.match(/\d+(?:\.\d+)?/g) || []).map(Number).filter(Number.isFinite)
  const thickness = isObj && skuOrDesc.thickness !== '' && skuOrDesc.thickness != null
    ? Number(skuOrDesc.thickness)
    : (nums.length >= 2 ? nums[nums.length - 2] : NaN)
  const length = isObj && skuOrDesc.length
    ? Number(skuOrDesc.length)
    : (nums.length >= 1 ? nums[nums.length - 1] : 6000)
  if (!type || !sizeLabel || !Number.isFinite(thickness)) {
    return s.replace(/\s+/g, ' ').trim()                       // fallback: normalised description
  }
  return `${type}|${std}|${sizeLabel}|${thickness.toFixed(2)}|${length || 6000}`.toLowerCase()
}

// ── Build a code → canonical-physical-identity resolver from the SKU master. This is the SINGLE
// join key for netting/lookup: it collapses the same physical pipe carried under different code
// strings (ERP code vs description vs "1.6"/"1.60") into ONE identity, and bridges the two id
// systems (productions/dispatches use `skuCode`; orders use `mmId` == skuCode). Keys are computed
// ONLY from full master OBJECTS — satisfying canonicalSkuKey's invariant (needs productType + size +
// thickness + an IS-token description) — so object-form and description-form always agree.
// The returned resolver is `(code, desc?) => key`:
//   • a code IN the master resolves to that master row's canonical key (byCode wins first, so
//     production/dispatch/tests keep exact-code netting and are never affected by the desc arg);
//   • a code ABSENT from the master falls back to canonicalising the SUPPLIED `desc`, but ONLY when
//     that yields a structured physical key (contains '|'). This is what lets an order/invoice line
//     whose ERP code the SKU catalog doesn't carry yet still collapse onto the same identity as
//     production, instead of stranding on its raw code and showing 0 production — the SKU-master gap
//     that split one tube into a produced row PLUS a phantom "negative-free" order row. An
//     unparsable desc (canonicalSkuKey returns a normalised-desc fallback, no '|') is NOT used as a
//     bridge, so two unrelated lines can never accidentally merge;
//   • otherwise the code keys as ITSELF (raw-string behavior — never wrongly merged).
// Read-time + non-destructive: nothing is stored; callers pass the live `skus`. ──
export function skuKeyResolver(skus) {
  const byCode = new Map((skus || []).map(s => [s.skuCode, canonicalSkuKey(s)]))
  return (code, desc = '') => {
    const hit = byCode.get(code)
    if (hit) return hit
    if (desc) { const k = canonicalSkuKey(desc); if (k.includes('|')) return k }
    return String(code || '')
  }
}

// ── SKU resolver for the ERP invoice import, with catalog self-heal.
// Returns `{ resolve(mmId, descRaw), newCatalogSkus }`.
//
// Match order is MOST to LEAST authoritative: ERP code (MM ID == skuCode) → exact description →
// canonical physical identity. The live master wins outright; only when nothing there matches do
// we fall back to the static catalog and "self-heal" the missing SKU into the master.
//
// The self-heal is the delicate part, because `skus.sku_code` is UNIQUE in Postgres. Adding a
// catalog row for a product the master ALREADY carries under a different id gets the write
// rejected — and a rejected row fails the entire SKU-master sync batch, not just itself. So
// `adopt` treats code, canonical identity, AND description as evidence the product is already
// there, and returns the LIVE row when any of them hits (which also keeps the dispatch line on the
// master's real code rather than the catalog's variant). Only a genuinely new product is added,
// and it is added as a COPY with a fresh id, so a catalog id ('SKU-nnn') can never collide with a
// row an operator created by hand.
//
// Pure: nothing is written; the caller persists `newCatalogSkus`. ──
export function skuImportResolver(skus, catalog, makeId = () => crypto.randomUUID()) {
  const live = skus || []
  const byCode = new Map(live.map(s => [s.skuCode, s]))
  const byKey = new Map(live.map(s => [canonicalSkuKey(s), s]))
  const byDesc = new Map(live.map(s => [(s.description || '').toLowerCase(), s]))
  const cat = catalog || []
  const catByCode = new Map(cat.map(s => [s.skuCode, s]))
  const catByKey = new Map(cat.map(s => [canonicalSkuKey(s), s]))
  const catByDesc = new Map(cat.map(s => [(s.description || '').toLowerCase(), s]))
  const newCatalogSkus = []

  const adopt = (s) => {
    const key = canonicalSkuKey(s)
    const desc = (s.description || '').toLowerCase()
    const hit = byCode.get(s.skuCode) || (key && byKey.get(key)) || (desc && byDesc.get(desc))
    if (hit) return hit
    const fresh = { ...s, id: makeId() }
    newCatalogSkus.push(fresh)
    byCode.set(fresh.skuCode, fresh)
    if (key) byKey.set(key, fresh)
    if (desc) byDesc.set(desc, fresh)
    return fresh
  }

  const resolve = (mmId, descRaw) => {
    const key = canonicalSkuKey(descRaw)
    const hit = (mmId && byCode.get(mmId))
      || byDesc.get((descRaw || '').toLowerCase())
      || (key && byKey.get(key))
    if (hit) return hit
    const fromCatalog = (mmId && catByCode.get(mmId))
      || catByDesc.get((descRaw || '').toLowerCase())
      || (key && catByKey.get(key))
    return fromCatalog ? adopt(fromCatalog) : null
  }

  return { resolve, newCatalogSkus }
}

// ── Shipped (invoiced) weight per order line, from dispatch entries' orderLineId
// (== orders `lineId`, the ERP "Sku ID"). Lets us net an order line by exactly the
// shipments made against it, rather than aggregating dispatch per SKU. ──
export function shippedByOrderLine(dispatches) {
  const out = {}
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const lid = String(be.orderLineId || '').trim()
    if (lid) out[lid] = (out[lid] || 0) + Number(be.weight || 0)
  })
  return out
}

// ── Invoiced (MT) actually raised against ONE order line. Takes the larger of (a) the live
// invoice/dispatch match by the line's id (orderLineId == orders `lineId` == ERP "Sku ID", via
// `shippedByLine`) and (b) the order sheet's own cumulative `invoicedQty`, so neither a stale
// order snapshot nor a missing dispatch row under-counts. This is the key to netting pending
// PER ORDER LINE: a same-SKU invoice raised against a *different* order can never reduce this
// line's pending (the cross-month / cross-order confusion the SKU-aggregate math caused). ──
export function orderLineInvoiced(order, shippedByLine = {}) {
  const matched = Number(shippedByLine[String(order?.lineId || '').trim()] || 0)
  return Math.max(matched, Number(order?.invoicedQty || 0))
}

// ── Idempotent dispatch de-duplication. Every dispatch LINE gets a stable natural key so the
// importer can skip lines it has already stored (a re-upload of the same/overlapping invoice
// file) AND lines repeated within one upload — the fix for the double-count that drove SKU
// inventory negative. The key is the normalised composite invoiceNo | skuCode | weight. That
// triple is unique per line in the "One Helix" invoice export (one row per invoice × item) and,
// being format-independent, it also matches a line imported earlier from a differently-shaped
// ERP sheet (same invoice + same resolved SKU + same MT) — so it dedups across formats, unlike a
// per-line "Sku ID" that only the ERP file carries. Normalisation collapses whitespace and
// upper-cases the text parts; weight is fixed to 3 dp to kill float noise between two exports of
// the same line. Parts are joined with U+0001 so a value can never straddle the delimiter. ──
const normKeyPart = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
export function dispatchLineKey(line) {
  const inv = normKeyPart(line?.invoiceNo)
  const sku = normKeyPart(line?.skuCode)
  const wt = Number(line?.weight || 0).toFixed(3)
  return `${inv}${sku}${wt}`
}

// ── Split a batch of parsed dispatch LINES into the ones to import vs. the duplicates to skip.
// A line is a duplicate when its key already exists among the NON-deleted dispatch entries
// (scoped to non-deleted so the "soft-delete a record, then re-upload to correct it" workflow
// still works) OR when an earlier line in THIS same batch already carried that key (kills
// within-file duplicates). Returns the lines to import, the skipped duplicate lines, and the set
// of invoice numbers that had at least one line skipped (for the summary banner). Pure. ──
export function dedupeDispatchLines(existingDispatches, parsedLines) {
  const existingKeys = new Set()
  ;(existingDispatches || []).filter(d => !d.deleted)
    .flatMap(d => d.bundleEntries || [])
    .forEach(be => existingKeys.add(dispatchLineKey(be)))
  const seenThisBatch = new Set()
  const toImport = [], skippedDuplicateLines = []
  const skippedInvoices = new Set()
  for (const line of parsedLines || []) {
    const k = dispatchLineKey(line)
    if (existingKeys.has(k) || seenThisBatch.has(k)) {
      skippedDuplicateLines.push(line)
      const inv = String(line?.invoiceNo || '').trim()
      if (inv) skippedInvoices.add(inv)
      continue
    }
    seenThisBatch.add(k)
    toImport.push(line)
  }
  return { toImport, skippedDuplicateLines, skippedInvoices }
}

// ── Normalise any Excel/ERP date value to a `YYYY-MM-DD` string. Shared by every importer
// (dispatch, PO, orders). Handles: a JS Date (from `XLSX.read(..., {cellDates:true})`), a bare
// Excel serial number (date column not date-formatted), and common string forms (ISO,
// DD/MM/YYYY, MM/DD/YYYY). Returns '' for empty/unparseable input.
//
// Date-object timezone fix: for a date-ONLY cell, SheetJS aims for the viewer's LOCAL midnight
// but the serial→date float rounding can land a few seconds SHORT of it — e.g. in IST the June-30
// cell comes back as 2026-06-29T18:29:50Z, which reads as the 29th with BOTH local and UTC getters,
// shifting every date back a day. Snapping the instant to the nearest whole UTC day recovers the
// intended calendar date in any timezone within ±12 h of UTC (all real business zones incl. IST).
export function toISODate(v) {
  if (v === null || v === undefined || v === '') return ''
  if (v instanceof Date) {
    if (isNaN(v)) return ''
    const d = new Date(Math.round(v.getTime() / 86400000) * 86400000) // snap to nearest UTC day
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  // Bare Excel serial date (insurance for exports whose date column isn't date-formatted).
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000)) // 25569 = 1899-12-30 → 1970-01-01
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
  }
  const s = String(v).trim()
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const [, y, m, d] = iso
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const ymdSlash = s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/)
  if (ymdSlash) {
    const [, y, m, d] = ymdSlash
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  const parts = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (parts) {
    let [, a, b, y] = parts
    if (y.length === 2) y = '20' + y
    const an = Number(a), bn = Number(b)
    let d, m
    if (an > 12) { d = a; m = b }          // unambiguous DD/MM/YYYY
    else if (bn > 12) { d = b; m = a }     // unambiguous MM/DD/YYYY
    else { d = a; m = b }                  // ambiguous — default to DD/MM/YYYY (IN)
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  // Last resort: let the JS engine parse it, then snap to nearest UTC day (same TZ fix as above).
  const d = new Date(s)
  if (isNaN(d)) return ''
  const snapped = new Date(Math.round(d.getTime() / 86400000) * 86400000)
  return `${snapped.getUTCFullYear()}-${String(snapped.getUTCMonth() + 1).padStart(2, '0')}-${String(snapped.getUTCDate()).padStart(2, '0')}`
}

// ── Ship-to STATE for the daily Sales upload (orders + invoice lines). ──────────────────────
// The two sheets of the One Helix workbook carry state differently:
//   • Orders sheet  — has a populated "Ship to State" column (its "Ship to GST" is the literal 0).
//   • Invoice sheet — has NO state column; state comes from the first two digits of the ship-to
//                     GSTIN (the statutory GST state code), falling back to the bill-to GSTIN.
// The full state/UT table is here, not just the codes seen in today's file, so a first shipment
// to a new state resolves on the day it happens instead of importing blank.
// Names are stored UPPER-CASE because that is how the Orders sheet writes them ("TAMIL NADU"), so
// an order line and an invoice line for the same state group under one identical key.
export const GST_STATE_CODES = {
  '01': 'JAMMU AND KASHMIR', '02': 'HIMACHAL PRADESH', '03': 'PUNJAB', '04': 'CHANDIGARH',
  '05': 'UTTARAKHAND', '06': 'HARYANA', '07': 'DELHI', '08': 'RAJASTHAN', '09': 'UTTAR PRADESH',
  '10': 'BIHAR', '11': 'SIKKIM', '12': 'ARUNACHAL PRADESH', '13': 'NAGALAND', '14': 'MANIPUR',
  '15': 'MIZORAM', '16': 'TRIPURA', '17': 'MEGHALAYA', '18': 'ASSAM', '19': 'WEST BENGAL',
  '20': 'JHARKHAND', '21': 'ODISHA', '22': 'CHHATTISGARH', '23': 'MADHYA PRADESH', '24': 'GUJARAT',
  '25': 'DAMAN AND DIU',                                  // legacy — merged into 26 in 2020
  '26': 'DADRA AND NAGAR HAVELI AND DAMAN AND DIU',
  '27': 'MAHARASHTRA',
  '28': 'ANDHRA PRADESH',                                 // legacy pre-bifurcation code; live code is 37
  '29': 'KARNATAKA', '30': 'GOA', '31': 'LAKSHADWEEP', '32': 'KERALA', '33': 'TAMIL NADU',
  '34': 'PUDUCHERRY', '35': 'ANDAMAN AND NICOBAR ISLANDS', '36': 'TELANGANA',
  '37': 'ANDHRA PRADESH', '38': 'LADAKH',
  '97': 'OTHER TERRITORY', '99': 'CENTRE JURISDICTION',
}

// State name from a GSTIN's first two digits. '' for blank, the Orders sheet's literal `0`, a
// non-numeric prefix, or a code outside the table — an unknown prefix is never guessed at. ──
export function gstStateName(gst) {
  const digits = String(gst ?? '').trim().slice(0, 2)
  if (!/^\d{2}$/.test(digits)) return ''
  return GST_STATE_CODES[digits] || ''
}

// Resolve one line's ship-to state: the sheet's own state column first (Orders), else the ship-to
// GSTIN prefix, else the bill-to GSTIN prefix (the Orders sheet stores `0` in "Ship to GST", and a
// stray invoice line can miss it too). Unresolvable ⇒ '' — the caller counts those and reports
// them; state is NEVER inferred from a customer name, city or pincode. ──
export function resolveShipToState({ state = '', shipToGst = '', billToGst = '' } = {}) {
  const named = normStateName(state)
  if (named && named !== '0') return named
  return gstStateName(shipToGst) || gstStateName(billToGst)
}

// ── STATE → REGION ──────────────────────────────────────────────────────────────────────────────
// Region is the one thing here a human types. State arrives with the ERP data (orders.shipToState /
// the per-entry shipToState inside bundleEntries), so the master is keyed by STATE, not distributor:
// map a state once and every distributor shipping there — including ones onboarded later — inherits
// the region. Nothing can make a distributor's state drift, because nothing hand-types a state.
//
// The four regions are fixed. `Unmapped` is deliberately NOT one of them: it is what an
// un-mapped (or state-less) row displays, and such a row still carries its full tonnage into every
// total. A missing mapping is a labelling gap, never a reason for weight to vanish from a sum.
export const REGIONS = ['North', 'South', 'East', 'West']
export const UNMAPPED_REGION = 'Unmapped'

// States are compared UPPER-CASE with internal whitespace collapsed — the same normalisation
// resolveShipToState stores them under, so "Tamil Nadu", "TAMIL  NADU" and the ERP's "TAMIL NADU"
// are one key.
export const normStateName = (state) => String(state ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

// state → region, built from the static seed with the stored rows layered ON TOP. Layering (rather
// than "table if non-empty, else seed") is what keeps a half-populated table safe: editing one
// state writes one row, and the other five seeded states must not silently become Unmapped.
// A stored row with a BLANK region is an explicit un-mapping and overrides the seed — that is why
// clearing a region writes `region: ''` instead of soft-deleting the row. (`toSnake` in db.js turns
// that '' into SQL NULL on the way out; both read back as blank here, so the round trip holds.)
export function stateRegionIndex(rows = null, seed = DEFAULT_STATE_REGIONS) {
  const out = new Map()
  const put = (r) => {
    const state = normStateName(r?.state)
    if (state) out.set(state, String(r?.region || '').trim())
  }
  ;(seed || []).filter(r => !r?.deleted).forEach(put)
  ;(rows || []).filter(r => !r?.deleted).forEach(put)
  return out
}

// The region label for one state. Blank state, unknown state, and mapped-to-blank all read
// `Unmapped` — the caller still counts the row.
export function regionForState(state, index) {
  const s = normStateName(state)
  if (!s) return UNMAPPED_REGION
  return (index?.get?.(s) || '') || UNMAPPED_REGION
}

// ── PLANT (ticket #118) ─────────────────────────────────────────────────────────────────────────
// Four manufacturing companies ship the order book; until now every line was counted as
// Hyderabad's. Plant is resolved from the ERP's own **Ship From Code**, never from a typed field —
// the same discipline state → region follows, and for the same reason: nothing hand-types it, so it
// can never drift from what the ERP said.
//
// The two-step is deliberate and mirrors state/region exactly:
//   resolvePlant(row)  → the plant id, or '' when the row matched nothing (STORED)
//   plantLabel(id)     → the short display name, or `Unattributed` (SHOWN)
// A blank stores as SQL NULL and reads back blank, so the round trip holds either way.
//
// `Unattributed` is deliberately NOT a fifth plant — exactly as `Unmapped` is not a fifth region.
// It is what an unresolved line displays, and such a line still carries its full tonnage into every
// total. A missing mapping is a labelling gap, never a reason for weight to vanish from a sum.
export const PLANTS = DEFAULT_PLANTS
export const PLANT_IDS = DEFAULT_PLANTS.map(p => p.id)
export const UNATTRIBUTED_PLANT = 'Unattributed'

// ERP codes and names are compared UPPER-CASE with internal whitespace collapsed. The codes are
// already uniform ("V2482-2973-JODL-4144"); the names are not — the ERP writes NPMD's in mixed case
// while the other three are upper — so one normalisation covers both and a re-cased ERP export
// cannot silently drop a plant into Unattributed.
export const normPlantKey = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

// Ship From Code → plant id, and (fallback only) ERP name → plant id, in ONE index. The two key
// spaces cannot collide: a code is `Vnnnn-nnnn-JODL-nnnn`, a name is words.
export function plantIndex(master = DEFAULT_PLANTS) {
  const out = new Map()
  ;(master || []).forEach(p => {
    const code = normPlantKey(p?.erpCode)
    if (code) out.set(code, p.id)
    ;(p?.erpNames || []).forEach(n => {
      const key = normPlantKey(n)
      if (key) out.set(key, p.id)
    })
  })
  return out
}

// Built once. The plant master is a static constant, so this index can never go stale — and the
// uploader resolves a plant for every row of both sheets (~1500 on the 18-Aug file), which used to
// rebuild this Map that many times per upload.
const DEFAULT_PLANT_INDEX = plantIndex()

// Resolve one ERP row to a plant id. Ship From Code first; the ERP's name string second and only
// as a fallback; '' when neither matches. An unrecognised code is NEVER guessed at from the name of
// a company it resembles, and never dropped — the caller counts the blanks and reports them, which
// is what turns a fifth company appearing in the ERP into a banner line rather than a silent
// re-attribution of its tonnage to Hyderabad.
export function resolvePlant({ shipFromCode = '', name = '' } = {}, index) {
  const idx = index || DEFAULT_PLANT_INDEX
  const code = normPlantKey(shipFromCode)
  if (code && idx.get(code)) return idx.get(code)
  const named = normPlantKey(name)
  return (named && idx.get(named)) || ''
}

// The plant master row for an id. `null` for blank/unknown — Unattributed has no row, because it is
// not a plant.
export function plantById(id, master = DEFAULT_PLANTS) {
  const key = String(id ?? '').trim()
  if (!key) return null
  return (master || []).find(p => p.id === key) || null
}

// The short display name for a stored plant id. Blank, unknown and unresolved all read
// `Unattributed` — a screen never shows an id, and never shows the ERP's own long name
// ("New Pashchim Maharashtra Patra Depot").
export function plantLabel(id, master = DEFAULT_PLANTS) {
  return plantById(id, master)?.name || UNATTRIBUTED_PLANT
}

// ── SERVICE AREA — which regions a plant ships to (ticket #129) ─────────────────────────────────
// The rule was written in CONTEXT.md and implemented nowhere: `producedPool` summed every plant's
// stock into one number and `salesByDistributor` wrote that number onto every distributor's row,
// so on 20-Aug-2026 the workbook offered West distributors 310.6 T of Hyderabad stock and printed
// their shortfall as 1,755 T instead of the true 2,116 T. Service area is now a stored fact.
//
// It is the ONE editable field on the plant master, so it follows the state → region master
// exactly: the shipped answers live in src/data/plants.js and the `plants` table is layered ON TOP
// of them, per plant. A table holding one edited plant therefore cannot un-serve the other three.
//
// Region names are compared case-insensitively and with internal whitespace collapsed — the same
// shape `REGIONS` and the state master store them in — so 'south' typed into the table and 'South'
// shipped in the seed are one region.
export const normRegionName = (r) => String(r ?? '').replace(/\s+/g, ' ').trim()
const regionKey = (r) => normRegionName(r).toLowerCase()

// A stored row's service area as a list. NULL, absent, a blank string and an empty array all read
// as the EMPTY list, because "serves nowhere" is a real answer here and not a fallback: a plant
// whose service area was cleared and one that never had one are the same fact. Restoring the
// shipped default means deleting the row, not blanking it — which is the opposite of the state
// master, where a blank region is an explicit un-mapping. The difference is deliberate: an
// un-mapped STATE still carries its tonnage into every total under `Unmapped`, whereas a plant
// serving nowhere has a concrete, checkable consequence (its stock shows on no distributor's row).
const servesList = (v) => {
  if (Array.isArray(v)) return v.map(normRegionName).filter(Boolean)
  const s = normRegionName(v)
  return s ? s.split(',').map(normRegionName).filter(Boolean) : []
}

// The plant master as the app should read it: the code seed with the stored rows layered on top,
// in the seed's order, every field but `serves` untouched. A stored row for a plant the seed does
// not carry is IGNORED rather than appended — a plant is an ERP company with a Ship From Code and a
// coil prefix, and a row holding only an id and a region list is not one; inventing a fifth plant
// from it would give it no way to ever match an ERP line.
export function plantMaster(rows = null, seed = DEFAULT_PLANTS) {
  const stored = new Map()
  ;(rows || []).filter(r => !r?.deleted).forEach(r => {
    const id = String(r?.plantId ?? '').trim()
    if (id) stored.set(id, servesList(r?.serves))
  })
  return (seed || []).map(p => ({
    ...p,
    serves: stored.has(p.id) ? stored.get(p.id) : servesList(p?.serves),
  }))
}

// The plants that serve one region, as a Set of stored plant ids — exactly the shape
// `filterByPlants` takes. An EMPTY set is a real answer and means what it says: nobody ships there,
// so that region's distributors are shown no stock at all. It must never be read as "no filter" —
// that is the bug this ticket exists to fix, and why the set-based filters below treat an empty set
// and a missing one as opposite instructions.
//
// `Unmapped` is not a region (CONTEXT.md), so no plant can serve it and this returns the empty set
// for it. Callers do NOT use that emptiness: an unmapped distributor's service area is UNKNOWN, not
// empty, and its stock columns must read `?` rather than 0. `salesByDistributor` checks for
// `UNMAPPED_REGION` before it ever gets here.
export function plantsServingRegion(region, master = DEFAULT_PLANTS) {
  const want = regionKey(region)
  const out = new Set()
  if (!want) return out
  ;(master || []).forEach(p => {
    if ((p?.serves || []).some(r => regionKey(r) === want)) out.add(p.id)
  })
  return out
}

// The regions that have at least one plant shipping to them — the answer to "where can we serve
// from stock at all today". In REGIONS order, then any off-list region a stored row names.
export function servedRegions(master = DEFAULT_PLANTS) {
  const seen = new Set()
  ;(master || []).forEach(p => (p?.serves || []).forEach(r => { const n = normRegionName(r); if (n) seen.add(n) }))
  const known = REGIONS.filter(r => [...seen].some(s => regionKey(s) === regionKey(r)))
  const extra = [...seen].filter(s => !REGIONS.some(r => regionKey(r) === regionKey(s))).sort()
  return [...known, ...extra]
}

// ── Reading a plant off a RAW ERP row ───────────────────────────────────────────────────────────
// `erpRowPicker` is the header-matching the two row mappers in App.jsx both do: lower-case the
// header, drop `.` `_` and spaces, then take the first alias that holds a non-blank cell.
//
// It lives here, with `plantForErpRow` on top of it, for one reason: App.jsx cannot be imported by
// the test suite, so while plant resolution lived there the column names were untestable — the
// aliases could be pointed at a column that does not exist and the whole suite still passed, with
// every line in both sheets silently becoming Unattributed. Resolution moved to where a test can
// reach it; the mappers call in.
export function erpRowPicker(row) {
  const norm = {}
  for (const k of Object.keys(row || {})) norm[String(k).toLowerCase().replace(/[.\s_]+/g, '')] = row[k]
  return (...keys) => {
    for (const k of keys) if (norm[k] !== undefined && norm[k] !== '') return norm[k]
    return ''
  }
}

// The ONE place either sheet's plant columns are named (tickets #118/#119). Orders spells the name
// column `CM name`; the Invoice sheet has no such column and spells it `Ship from location`. Both
// are a FALLBACK only — `Ship From Code` is what a plant IS (see docs/adr/0004) — so one alias list
// serves both sheets and the two mappers cannot drift into recognising different columns.
export function plantForErpRow(row, index = DEFAULT_PLANT_INDEX) {
  const pick = erpRowPicker(row)
  return resolvePlant({
    shipFromCode: pick('shipfromcode', 'shipfrom', 'shipfromcodeid'),
    name:         pick('cmname', 'shipfromlocation', 'cmnames'),
  }, index)
}

// A dispatch record's plant, for the Dispatch view (ticket #119). Plant lives on the ENTRIES —
// `dispatches` has no per-line column, so it sits inside the nested `bundleEntries` structure and a
// stray top-level key makes the whole upsert fail (see docs/DATA-MODEL.md). One invoice ships from
// one plant, but a record whose entries disagree shows BOTH labels rather than silently taking the
// first: a disagreement inside an invoice is something to see, not something to resolve here.
// Sorted, so one record reads and exports the same string whichever of its lines happened to come
// first — an unsorted join makes a table sort and a CSV diff wobble on nothing.
// Legacy entries — every dispatch entry written before this ticket — carry no `plant` key at all
// and read `Unattributed`, exactly as an unresolved new line does.
export function dispatchPlantLabel(record, master = DEFAULT_PLANTS) {
  const entries = record?.bundleEntries || []
  const labels = [...new Set(entries.map(e => plantLabel(e?.plant, master)))].sort()
  return labels.length ? labels.join(', ') : UNATTRIBUTED_PLANT
}

// ── PLANT ON THE PIPELINE (ticket #120) ────────────────────────────────────────────────────────
// Orders and invoices get their plant from the ERP. Pipeline rows cannot — the ERP has no view of
// the shop floor — so plant is set ONCE, by an operator at Coil Inward, and inherited from there:
// a baby coil takes its mother's, a production batch takes the plant of the baby coils it consumes.
// It is never re-typed and never editable afterwards, because it describes where a physical object
// physically sits, and a coil does not move plant because someone corrected a form.

// Which plants may register a mother coil TODAY. `manufactures` says a plant *can* run the
// pipeline; this says which one actually does right now. Hyderabad and NPMD both do — NPMD's
// numbering was readied first, in ticket #122 (`nextCoilNumber`/`genHRCoilId` above are both
// plant-aware), then offered here in ticket #123, so an NPMD coil gets a correctly-shaped
// `NPM-` id from its very first save. Order matters: Hyderabad stays first, so
// DEFAULT_COIL_PLANT below is unchanged and the ordinary path is still one click.
// A stored `plant` as the helpers below compare it: the id, or '' for a row written before this
// ticket (SQL NULL reads back as null, and a half-filled form as ''). Deliberately NOT exported —
// reading a row's plant field raw is never the interesting operation; the named rules below are.
const storedPlant = (row) => String(row?.plant ?? '').trim()

export const COIL_INWARD_PLANT_IDS = ['hyderabad', 'npmd']
export const DEFAULT_COIL_PLANT = COIL_INWARD_PLANT_IDS[0]

// The plant master rows Coil Inward offers, in master order. Two conditions, and they are not the
// same thing: `manufactures` is the master's own answer to "does this plant run the pipeline at
// all" — flipping it to false still removes a plant from here in one line, as ADR-0004 promised —
// while COIL_INWARD_PLANT_IDS is a separate, manually-maintained rollout list on top of it. The two
// happen to match exactly as of #123 (both manufacturing plants are now offered), but they're not
// the same mechanism: they'd diverge again the day a plant lands on the master with
// `manufactures: true` before Coil Inward is actually ready to offer it.
export function coilInwardPlants(master = DEFAULT_PLANTS) {
  return COIL_INWARD_PLANT_IDS.map(id => plantById(id, master)).filter(p => p?.manufactures)
}

// A baby coil's plant IS its mother's — the one and only rule. Slitting re-reads it off the mother
// on every save rather than carrying the stored value forward, so a baby coil can never be given a
// different plant from the coil it was cut out of. No mother in hand yields '' (Unattributed)
// rather than a guess at Hyderabad, which is what a mother registered before this ticket and not
// yet backfilled would otherwise become.
//
// It reads as a one-line pass-through and is meant to: `storedPlant` is private, so this IS the
// interface, and the rule it names is an acceptance criterion with its own tests. Inlining it
// would delete the only place the inheritance is stated.
export function babyCoilPlant(motherCoil) {
  return storedPlant(motherCoil)
}

// A production batch's plant is the plant of the baby coils it consumed. Each allocation carries
// BOTH the baby coil id and its mother's (see docs/DATA-MODEL.md), so each one resolves off the
// baby coil first and falls back to the mother — which is what lets a legacy mother-only allocation
// and a baby coil not yet backfilled still land on a plant.
//
// One plant across every allocation ⇒ that plant. Anything else ⇒ '' (Unattributed): a batch fed
// from two plants belongs to neither, and taking whichever coil happened to be listed first would
// file it under a plant that only made half of it. FIFO and the manual picker never cross plants,
// so a disagreement here is a fault to see rather than one to resolve silently.
export function productionPlant(coilAllocations, babyCoils = [], coils = []) {
  const babyPlant = new Map((babyCoils || []).map(b => [b?.babyCoilId, storedPlant(b)]))
  const motherPlant = new Map((coils || []).map(c => [c?.hrCoilId, storedPlant(c)]))
  const found = new Set()
  ;(coilAllocations || []).forEach(a => {
    const plant = babyPlant.get(a?.babyCoilId) || motherPlant.get(a?.hrCoilId) || ''
    if (plant) found.add(plant)
  })
  return found.size === 1 ? [...found][0] : ''
}

// ── PLANT FILTER (ticket #121) ─────────────────────────────────────────────────────────────────
// One selector, offered in the header and applied globally — never a per-tab filter, so nobody has
// to reason about which view is scoped and which is not. It scopes Dashboard, Coil Tracker,
// Dispatch, Orders and Sales; Coil Inward/Slitting/Production/SKU Master/Reports are untouched
// (an operator registers a coil, and Reports keeps its company-wide total, regardless of what the
// selector shows).
//
// The sentinel is a value no stored `plant` can ever equal (a real plant id, or '' for
// Unattributed), so "combine everything" and "show only what nothing resolved to" stay distinct
// selections of the same control.
export const ALL_PLANTS = '__all__'

// Options for the selector, in the one stable order it is always shown in: All Plants first (the
// default — nothing on screen may move on deploy day), then the plant master's own order, then
// Unattributed last — the same "real things, then the labelling gap" order REGIONS already ends on.
export function plantFilterOptions(master = DEFAULT_PLANTS) {
  return [
    { id: ALL_PLANTS, name: 'All Plants' },
    ...(master || []).map(p => ({ id: p.id, name: p.name })),
    { id: '', name: UNATTRIBUTED_PLANT },
  ]
}

// Filters any array of rows carrying a top-level `plant` — coils, baby coils, productions, orders —
// to one selection. `ALL_PLANTS` is a pass-through (filtering never runs), which is what keeps that
// default reading exactly what the app showed before this ticket. Comparison is against the STORED
// value, never `plantLabel`, so an Unattributed row (blank/missing `plant`) matches selecting ''
// and nothing else.
// The distinct plant values PRESENT in a set of rows — order lines, coils, or the entries inside one
// dispatch record, anything carrying a top-level `plant`. Blank, missing and an id off the master all
// come back as '', because that is how they are stored and how `filterByPlant` matches them.
//
// It exists so that code grouping rows BY plant (the reports' per-plant split) reads the field
// through the same `storedPlant` normalisation `filterByPlant` compares with. Re-typing
// `String(r.plant ?? '').trim()` at the call site works today and silently stops agreeing with the
// filter the day either side changes — and a grouping that disagrees with the filter is a per-plant
// total that no longer sums to the All Plants one.
export function plantKeysIn(rows) {
  return new Set((rows || []).map(storedPlant))
}

// The same set, said in words: the display names of the plants a set of rows belongs to, in the
// master's order, `Unattributed` last. Ticket #128 — the servable-orders message has to name WHOSE
// stock it is serving from, and the only truthful answer is the plants the stock rows carry.
//
// Names rather than ids because the answer is read on a phone; from the master rather than a
// literal because renaming a plant on screen must rename it in the message too. An id the master
// does not know folds into `Unattributed` exactly as `plantLabel` resolves it — one row for the
// labelling gap, never a fifth plant, and never dropped: a message that quietly omitted it would
// name the wrong floor.
export function plantNamesIn(rows, master = DEFAULT_PLANTS) {
  const names = new Set([...plantKeysIn(rows)].map(k => plantLabel(k, master)))
  const known = (master || []).map(p => p?.name).filter(n => names.has(n))
  return names.has(UNATTRIBUTED_PLANT) ? [...known, UNATTRIBUTED_PLANT] : known
}

export function filterByPlant(rows, selected = ALL_PLANTS) {
  if (selected === ALL_PLANTS) return rows || []
  return (rows || []).filter(r => storedPlant(r) === selected)
}

// ── SET-BASED SIBLINGS (ticket #129) ───────────────────────────────────────────────────────────
// `filterByPlant` answers "the one plant a person picked in the header". A SERVICE AREA is not one
// plant — South is Hyderabad and Lepakshi, and it grows the day a plant is re-pointed — so the
// stock pool behind a distributor's row needs "these plants", not "this plant".
//
// The two differ on one case, and it is the whole reason this is a separate function rather than a
// looser `filterByPlant`:
//
//   filterByPlant(rows, ALL_PLANTS)  → every row      "no filter"
//   filterByPlants(rows, null)       → every row      "no filter"
//   filterByPlants(rows, new Set())  → NO rows        "no plant serves here"
//
// An empty set is an ANSWER, not a missing argument. A region nobody ships to must show no stock;
// falling back to "everything" there is exactly the bug this ticket fixes, at the exact moment it
// matters most. So the sentinel for "do not filter" is `null`, which cannot be confused with a set
// that happens to be empty.
//
// Comparison is against the STORED value via the same `storedPlant` normalisation `filterByPlant`
// uses, so a row with no plant (a legacy row never backfilled) belongs to NO service area — it
// counts toward neither, exactly as it counts toward neither plant under the header selector.
export function filterByPlants(rows, plants = null) {
  if (plants == null) return rows || []
  const want = plants instanceof Set ? plants : new Set(plants)
  return (rows || []).filter(r => want.has(storedPlant(r)))
}

// The allocation rows that reference a baby coil which is NOT at `plant` — the guard that makes
// "allocation never crosses plants" true of what is SAVED, not only of what was offered.
//
// Scoping the two pickers (ticket #124) decides what an operator can be shown; it does not by
// itself decide what they can persist. The rows outlive a change of plant — an operator can pick
// this plant's coils, change plant, and still be holding the first plant's rows — so the rule has
// to be re-checked against the rows themselves at save time. Returns the offending rows rather
// than a boolean so the caller can name the coils on screen, and drops nothing: silently removing
// an operator's row would lose tonnage they entered, which is worse than refusing the save.
//
// A row with no coil picked yet is not a cross-plant row (it is an empty row, handled elsewhere).
export function crossPlantAllocationRows(rows, babyCoils, plant) {
  const atPlant = new Set(filterByPlant(babyCoils, plant).map(b => b?.babyCoilId).filter(Boolean))
  return (rows || []).filter(r => r?.babyCoilId && !atPlant.has(r.babyCoilId))
}

// A dispatch record carrying `entries`, with everything DERIVED from them re-derived. This is the
// dispatch record's one invariant: `theoreticalWeight`, `variance` and `selectedBundles` are
// functions of the entries and never independent facts, so any code that changes which entries a
// record holds must come through here. Two callers do — `buildDispatchRecords` building a record
// from the daily upload, and `filterDispatchesByPlant` below narrowing one to a plant — and they
// previously carried their own copy of this arithmetic in two files, which is how the two would
// eventually have drifted into disagreeing about what one invoice weighs.
//
// `vehicleWeight` is deliberately NOT derived: it is a whole-vehicle weighbridge measurement, so it
// cannot be split when the entries are. Under a plant filter that leaves `variance` comparing one
// plant's tonnage against the whole vehicle's — a real limitation, moot on today's data where every
// invoice line is Hyderabad's, and called out in docs/DATA-MODEL.md.
export function withDispatchEntries(record, entries) {
  const bundleEntries = entries || []
  const theoreticalWeight = bundleEntries.reduce((s, e) => s + Number(e.weight || 0), 0)
  return {
    ...record,
    bundleEntries,
    selectedBundles: bundleEntries,
    theoreticalWeight,
    variance: record?.vehicleWeight ? Number(record.vehicleWeight) - theoreticalWeight : 0,
  }
}

// Dispatches carry plant per ENTRY, not on the record (see dispatchPlantLabel above), so filtering
// means filtering each record's bundleEntries rather than keeping or dropping the whole invoice. A
// record left with no matching entry drops out entirely — nothing of the selection dispatched on
// it. Re-deriving through `withDispatchEntries` is what keeps per-plant tonnages summing back to
// the All Plants total: the weight is recomputed from the surviving entries by the same arithmetic
// that produced it, so a filtered read can never disagree with an unfiltered one.
export function filterDispatchesByPlant(dispatches, selected = ALL_PLANTS) {
  if (selected === ALL_PLANTS) return dispatches || []
  return (dispatches || [])
    .map(d => {
      const bundleEntries = (d.bundleEntries || []).filter(e => storedPlant(e) === selected)
      return bundleEntries.length ? withDispatchEntries(d, bundleEntries) : null
    })
    .filter(Boolean)
}

// The set-based sibling, same contract as `filterByPlants` above: `null` means no filter, an EMPTY
// set means no plant — so a region nobody ships to subtracts NO invoices, rather than every plant's.
//
// This one is load-bearing in a way that is easy to miss. Stock is `produced − invoiced`, and the
// two halves have to be scoped by the SAME plants or the subtraction is between different things.
// Filter productions to West (nothing) and leave dispatches national and every West SKU reads
// Hyderabad's invoiced tonnage as negative stock — a screen full of red where the truth is a blank.
export function filterDispatchesByPlants(dispatches, plants = null) {
  if (plants == null) return dispatches || []
  const want = plants instanceof Set ? plants : new Set(plants)
  return (dispatches || [])
    .map(d => {
      const bundleEntries = (d.bundleEntries || []).filter(e => want.has(storedPlant(e)))
      return bundleEntries.length ? withDispatchEntries(d, bundleEntries) : null
    })
    .filter(Boolean)
}

// ── A distributor's own state, derived from its order and invoice lines ──
// Keyed by the SAME identity resolveDistributorIdentity produces, so the answer lands on the
// distributor's sales row. Where a distributor's lines disagree, the MOST RECENT line wins (ISO
// dates compare lexically; a line with no date loses to any dated line, and an exact date tie keeps
// the first line encountered — orders before invoices, then array order, so the result is stable for
// a given input). Every distinct state seen is kept in `states` so a genuinely multi-state
// distributor is visible as such rather than silently resolved to one.
export function distributorStateIndex(orders, dispatches, idx = null) {
  const index = idx || distributorOrderIndex(orders)
  const out = new Map()
  const note = (key, state, date) => {
    let e = out.get(key)
    if (!e) { e = { state: '', states: [], _date: '' }; out.set(key, e) }
    const s = normStateName(state)
    if (!s) return
    if (!e.states.includes(s)) e.states.push(s)
    if (!e.state || String(date || '') > e._date) { e.state = s; e._date = String(date || '') }
  }
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    note(resolveDistributorIdentity(o, index, false).key, o.shipToState, o.orderDate)
  })
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    ;(d.bundleEntries || []).forEach(be => {
      note(resolveDistributorIdentity(be, index, true).key, be.shipToState, d.dateOfDispatch)
    })
  })
  const final = new Map()
  out.forEach(({ state, states }, key) => {
    final.set(key, { state, states: states.slice().sort(), multiState: states.length > 1 })
  })
  return final
}

// ── The shared resolver: distributor identity key → { state, states, multiState, region } ──
// Built once, called per row. Used by the Sales tab (through salesByDistributor) and available to
// the report builders, so a region shown on screen and a region in a report cannot diverge.
// An unknown key resolves to a blank state and `Unmapped` rather than throwing.
export function distributorRegionResolver(orders, dispatches, stateRegions = null, idx = null, distributors = null) {
  const states = distributorStateIndex(orders, dispatches, idx)
  const regions = stateRegionIndex(stateRegions)
  const overrides = distributorRegionIndex(distributors)
  return (key) => {
    const k = String(key ?? '').trim()
    const e = states.get(k) || { state: '', states: [], multiState: false }
    const override = overrides.get(k) || ''
    return {
      ...e,
      region: override || regionForState(e.state, regions),
      regionOverride: override,
    }
  }
}

// ── DISTRIBUTOR MASTER — the region override (ticket #129) ─────────────────────────────────────
// Distributor identity key → the region typed against it, '' when none. Same layered shape as the
// state master: a static seed (empty today) with the stored rows on top, so the two masters are
// read the same way and neither can be half-applied.
//
// A BLANK override is not `Unmapped` and not a region — it means "use the state's region", which is
// what almost every distributor does. That is why the Masters tab writes `region: ''` to clear one
// rather than deleting the row: a stored blank and no row at all have to mean the same thing, or
// clearing an override would strand the distributor instead of returning it to its state's answer.
export function distributorRegionIndex(rows = null, seed = DEFAULT_DISTRIBUTORS) {
  const out = new Map()
  const put = (r) => {
    const key = String(r?.distributorKey ?? '').trim()
    if (key) out.set(key, normRegionName(r?.region))
  }
  ;(seed || []).filter(r => !r?.deleted).forEach(put)
  ;(rows || []).filter(r => !r?.deleted).forEach(put)
  return out
}

// ── SKU-wise inventory / booked / free rows for the dashboard. Union of SKUs with
// production/dispatch activity AND SKUs with open orders. All weights in MT:
//   inventory = produced − dispatched                       (producedPool.availableWeight)
//   booked    = Σ over open order lines of max(0, ordered − shipped-for-that-line)
//               (open = Order Status not Delivered/Cancelled/Rejected; shipped is matched
//                per order line via orderLineId, so already-delivered demand doesn't subtract
//                from a *different* SKU's still-open orders)
//   free      = inventory − booked                          (negative ⇒ over-committed, red)
// Rows are sorted negative-free first (most-negative on top), then by SKU code. ──
export function skuBookingRows(productions, dispatches, orders, skus) {
  const pool = producedPool(productions, dispatches)
  const shipped = shippedByOrderLine(dispatches)
  const bookedBySku = {}
  const descByCode = {}
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const code = String(o.mmId || '').trim()
    if (!code) return
    if (!descByCode[code]) descByCode[code] = o.description || ''
    if (!isOpenOrderStatus(o.orderStatus)) return
    const lineShipped = shipped[String(o.lineId || '').trim()] || 0
    bookedBySku[code] = (bookedBySku[code] || 0) + Math.max(0, Number(o.quantity || 0) - lineShipped)
  })
  const codes = new Set([...Object.keys(pool), ...Object.keys(bookedBySku)])
  const rows = [...codes].filter(Boolean).map(code => {
    const inventory = pool[code]?.availableWeight || 0
    const booked = bookedBySku[code] || 0
    const sku = (skus || []).find(s => s.skuCode === code)
    return {
      skuCode: code,
      description: sku?.description || descByCode[code] || code,
      inventory, reserved: booked, free: inventory - booked,
    }
  })
  rows.sort((a, b) => (a.free < 0) !== (b.free < 0)
    ? (a.free < 0 ? -1 : 1)
    : (a.free < 0 ? a.free - b.free : a.skuCode.localeCompare(b.skuCode)))
  return rows
}

// ── SKU-wise inventory table (dashboard). Per SKU, all MT:
//   production       = Σ produced weight                              (producedPool.producedWeight, all-time)
//   totalOrders      = Σ ordered quantity over non-deleted, non-cancelled order lines
//   totalInvoiced    = Σ dispatched (= invoiced) weight                (period-scoped by dispatch date)
//                      → the "Invoiced (this period)" flow: ALL shipments this month for the SKU,
//                        whatever order they belong to.
//   invoicedVsOrders = Σ min(ordered, invoiced-against-that-line) over these order lines
//                      → how much of THESE orders has actually been invoiced (period-proof, per line).
//   pendingDispatch  = Σ (confirmed + nonConfirmed) over that SKU's NON-delivered orders — the SAME
//                      "Pending to Dispatch" as the Dashboard / Sales cards (salesKpis); Delivered lines
//                      excluded (cancellations are already netted inside nonConfirmed). Blank-mmId orders are
//                      bucketed under a "(Unmapped)" row so this total ties out to the Dashboard card.
//   reserved         = Σ max(0, releaseQty − invoicedQty) over open order lines (reservedBySku, all-time)
//   inventory        = produced − invoiced                            (producedPool.availableWeight, all-time)
//   free             = inventory − reserved                           (negative ⇒ over-committed, red)
// Optional `inRange(dateStr)` scopes the order-driven figures (by orderDate) and totalInvoiced (by
// dispatch date) to a period; production / reserved / inventory / free stay the live all-time snapshot.
// Per-line invoiced (`orderLineInvoiced`) is matched against ALL dispatches (cumulative), so prior-period
// invoicing is still counted. Union of stocked ∪ ordered ∪ invoiced SKUs; negative-free first, then SKU code. ──
export function skuInventoryRows(productions, dispatches, orders, skus, inRange = null, asOf = new Date().toISOString().slice(0, 10)) {
  const pass = inRange || (() => true)
  const keyOf = skuKeyResolver(skus)                 // canonical physical identity — the single join key
  const pool = producedPool(productions, dispatches, null, keyOf) // all-time, netted by identity
  const ageing = skuAgeing(productions, dispatches, keyOf, asOf)  // FIFO stock age, all-time + same key ⇒ ties to inventory
  const reserved = reservedBySku(orders, keyOf)      // live (all orders), by identity
  const shipped = shippedByOrderLine(dispatches)     // cumulative invoiced per order line (all dispatches)
  const invoicedBySku = {}                            // period-scoped dispatch flow ("Invoiced this period")
  ;(dispatches || []).filter(d => !d.deleted && pass(d.dateOfDispatch))
    .flatMap(d => d.bundleEntries || []).forEach(be => {
      const code = String(be.skuCode || '').trim(); if (!code) return
      const k = keyOf(code)
      invoicedBySku[k] = (invoicedBySku[k] || 0) + Number(be.weight || 0)
    })
  // Order-driven accumulations (period-scoped by order date).
  // Pending to Dispatch = Σ(confirmed + nonConfirmed) per SKU over NON-delivered orders —
  // identical to the Dashboard / Sales "Pending to Dispatch" (salesKpis), so this column
  // reconciles with that card. Delivered lines are excluded (a closed order is no longer
  // pending); cancellations are already netted inside nonConfirmed; blank-mmId orders bucket
  // under UNMAPPED so the total still ties out. totalOrders / invoicedVsOrders keep the per-line,
  // non-cancelled accounting (delivered demand still counts as committed) used by the rest of the table.
  const UNMAPPED = '(Unmapped)'
  const orderedBySku = {}, invoicedVsOrdersBySku = {}, pendingBySku = {}, descByKey = {}, codeByKey = {}
  // Description AND the ERP code are resolved from ALL orders (period-independent), so a row kept
  // visible by all-time Production/Reserved still shows its tube name instead of falling back to the
  // raw SKU code. `codeByKey` is the reverse: a SKU the master doesn't carry keys on its canonical
  // identity ('rhs|4923|60x40|1.20|6000'), which must never reach the SKU Code column — it shows the
  // order line's own MM ID instead.
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const code = String(o.mmId || '').trim()
    if (code && o.description) {
      const k = keyOf(code, o.description)
      if (!descByKey[k]) descByKey[k] = o.description
      if (!codeByKey[k]) codeByKey[k] = code
    }
  })
  ;(orders || []).filter(o => !o.deleted && pass(o.orderDate)).forEach(o => {
    const raw = String(o.mmId || '').trim()
    const k = raw ? keyOf(raw, o.description) : UNMAPPED
    if (!isDeliveredStatus(o.orderStatus))
      pendingBySku[k] = (pendingBySku[k] || 0) + salesNum(o.confirmed) + salesNum(o.nonConfirmed)
    if (k === UNMAPPED) return
    if (/cancel|reject/i.test(o.orderStatus || '')) return
    const qty = Number(o.quantity || 0)
    const inv = orderLineInvoiced(o, shipped)
    orderedBySku[k] = (orderedBySku[k] || 0) + qty
    invoicedVsOrdersBySku[k] = (invoicedVsOrdersBySku[k] || 0) + Math.min(qty, inv)
  })
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s]))  // canonical key → representative SKU (for display)
  const keys = new Set([...Object.keys(pool), ...Object.keys(orderedBySku),
    ...Object.keys(invoicedBySku), ...Object.keys(reserved), ...Object.keys(pendingBySku)])
  const rows = [...keys].filter(Boolean).map(k => {
    const totalInvoiced = invoicedBySku[k] || 0
    const invoicedVsOrders = invoicedVsOrdersBySku[k] || 0
    const inventory = pool[k]?.availableWeight || 0
    const production = pool[k]?.producedWeight || 0
    const totalOrders = orderedBySku[k] || 0
    const pendingDispatch = pendingBySku[k] || 0
    const reservedV = reserved[k] || 0
    const sku = skuByKey.get(k)
    const description = k === UNMAPPED
      ? 'Orders with no SKU (MM ID)'
      : (sku?.description || descByKey[k] || k)
    return {
      skuCode: sku?.skuCode || codeByKey[k] || k, description,
      production, totalOrders, totalInvoiced, invoicedVsOrders, pendingDispatch, reserved: reservedV,
      inventory, free: inventory - reservedV,
      ageDays: ageing[k]?.avgAgeDays ?? null, oldestAgeDays: ageing[k]?.oldestAgeDays ?? null,
    }
  })
  rows.sort((a, b) => (a.free < 0) !== (b.free < 0)
    ? (a.free < 0 ? -1 : 1)
    : (a.free < 0 ? a.free - b.free : a.skuCode.localeCompare(b.skuCode)))
  return rows
}

// ── Distributor identity. Free-text distributor names are spelled inconsistently between the
// Orders and Invoice ERP exports, which splits one party into several dashboard rows. Both
// exports carry a stable `Distributor Code`, and every invoice line links to its order (Sku ID /
// Order ID), so we resolve ONE identity per distributor instead of trusting the name text. The
// GROUPING key is resolved as:
//   • dispatch line → its linked order's identity (order code if present, else the order's
//     normalised name) via orderLineId→orderId→childOrderId — so a shipment groups with the
//     order it fulfils regardless of how the invoice spells the party;
//   • else the record's own `distributorCode` (dispatch entries carry it inside bundle_entries);
//   • else the normalised name (internal whitespace collapsed + upper-cased).
// The DISPLAY name stays the real (first non-blank) name seen — only the key is normalised. ──
export const normDistributorName = (name) =>
  String(name || '').replace(/\s+/g, ' ').trim().toUpperCase() || '—'

// Index orders by their link keys → { code, name } for resolving a dispatch line's distributor
// from the order it fulfils (order lineId == dispatch orderLineId; orderId; childOrderId). First
// non-blank wins. `distributorCode` is read when present (future-proof) but orders need not carry it.
export function distributorOrderIndex(orders) {
  const byLine = {}, byOrder = {}, byChild = {}
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const ident = { code: String(o.distributorCode || '').trim(), name: String(o.customer || '').trim() }
    const lid = String(o.lineId || '').trim();       if (lid && !byLine[lid]) byLine[lid] = ident
    const oid = String(o.orderId || '').trim();      if (oid && !byOrder[oid]) byOrder[oid] = ident
    const cid = String(o.childOrderId || '').trim(); if (cid && !byChild[cid]) byChild[cid] = ident
  })
  return { byLine, byOrder, byChild }
}

// Resolve { key, name } for an order or dispatch entry. `idx` = distributorOrderIndex(orders).
// Dispatch entries resolve through the order link FIRST so they always adopt the order's identity
// (keeping orders and their shipments in one group); their own code is only a fallback for
// shipments with no matching order.
export function resolveDistributorIdentity(rec, idx = null, isDispatch = false) {
  const ownCode = String(rec?.distributorCode || '').trim()
  const ownName = String(rec?.customer || '').trim()
  if (isDispatch && idx) {
    const hit = idx.byLine[String(rec?.orderLineId || '').trim()]
      || idx.byOrder[String(rec?.orderId || '').trim()]
      || idx.byChild[String(rec?.childOrderId || '').trim()]
    if (hit) return { key: hit.code || normDistributorName(hit.name), name: hit.name || ownName }
  }
  if (ownCode) return { key: ownCode, name: ownName }
  return { key: normDistributorName(ownName), name: ownName }
}

// ── Per-customer fulfilment (orders ↔ dispatch joined by distributor identity, not raw name). All
// MT: ordered = Σ ordered (all order lines), shipped = Σ dispatched, outstanding = ordered − shipped.
// Sorted by outstanding desc. ──
export function customerFulfilment(orders, dispatches) {
  const idx = distributorOrderIndex(orders)
  const out = {}
  const ensure = (id, name) => {
    const e = out[id] = out[id] || { id, customer: '', ordered: 0, shipped: 0, openOrders: 0 }
    if (name && (!e.customer || e.customer === '—')) e.customer = name
    return e
  }
  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const { key, name } = resolveDistributorIdentity(o, idx, false)
    const e = ensure(key, name)
    e.ordered += Number(o.quantity || 0)
    if (isOpenOrderStatus(o.orderStatus)) e.openOrders += 1
  })
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const { key, name } = resolveDistributorIdentity(be, idx, true)
    ensure(key, name).shipped += Number(be.weight || 0)
  })
  return Object.values(out)
    .map(e => ({ ...e, customer: e.customer || '—', outstanding: e.ordered - e.shipped }))
    .sort((a, b) => b.outstanding - a.outstanding)
}

// ── Open order backlog — one row per still-open order line, netted by its own per-line
// shipped (orderLineId). Only lines with open > 0 are returned, oldest expected-delivery first. ──
export function orderBacklog(orders, dispatches) {
  const shipped = shippedByOrderLine(dispatches)
  return (orders || [])
    .filter(o => !o.deleted && isOpenOrderStatus(o.orderStatus))
    .map(o => {
      const ordered = Number(o.quantity || 0)
      const ship = shipped[String(o.lineId || '').trim()] || 0
      const open = Math.max(0, ordered - ship)
      return {
        orderId: o.orderId || o.childOrderId || '', customer: o.customer || '',
        skuCode: o.mmId || '', description: o.description || o.mmId || '',
        ordered, shipped: ship, open,
        fulfilmentPct: ordered > 0 ? (ship / ordered) * 100 : 0,
        orderStatus: o.orderStatus || '', expectedDeliveryDate: o.expectedDeliveryDate || '',
      }
    })
    .filter(r => r.open > 0)
    .sort((a, b) => String(a.expectedDeliveryDate).localeCompare(String(b.expectedDeliveryDate)))
}

// ── Per-SKU demand vs supply: ordered (all order lines) · produced · shipped · inventory
// (produced − shipped) · booked (open, per-line) · free. Union of SKUs seen in any pipeline.
// Sorted negative-free first, then by SKU code. ──
export function skuDemandSupply(productions, dispatches, orders, skus) {
  const booking = skuBookingRows(productions, dispatches, orders, skus) // inventory, reserved(=booked), free, description
  const byCode = Object.fromEntries(booking.map(r => [r.skuCode, r]))
  const sumBy = (rows, keyFn, valFn) => {
    const m = {}
    ;(rows || []).forEach(r => { const k = keyFn(r); if (k) m[k] = (m[k] || 0) + valFn(r) })
    return m
  }
  const ordered = sumBy((orders || []).filter(o => !o.deleted), o => String(o.mmId || '').trim(), o => Number(o.quantity || 0))
  const produced = sumBy((productions || []).filter(p => !p.deleted), p => String(p.skuCode || '').trim(), p => Number(p.totalWeight || 0))
  const shipped = sumBy((dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []), e => String(e.skuCode || '').trim(), e => Number(e.weight || 0))
  // Reserved (released − invoiced, open orders) and the resulting available stock (inventory −
  // reserved). `available` is the per-SKU "Available (Most Relevant)" surfaced in the Sales breakup.
  const reserved = reservedBySku(orders)
  const codes = new Set([...booking.map(r => r.skuCode), ...Object.keys(ordered)])
  return [...codes].filter(Boolean).map(code => {
    const b = byCode[code] || { inventory: 0, reserved: 0, free: 0, description: null }
    const sku = (skus || []).find(s => s.skuCode === code)
    const reservedV = reserved[code] || 0
    return {
      skuCode: code, description: b.description || sku?.description || code,
      ordered: ordered[code] || 0, produced: produced[code] || 0, shipped: shipped[code] || 0,
      inventory: b.inventory, booked: b.reserved, free: b.free,
      reserved: reservedV, available: b.inventory - reservedV,
    }
  }).sort((a, b) => (a.free < 0) !== (b.free < 0)
    ? (a.free < 0 ? -1 : 1)
    : (a.free < 0 ? a.free - b.free : a.skuCode.localeCompare(b.skuCode)))
}

// ── Per-distributor sales matrix (Sales dashboard). Joins the Orders upload (demand) and the
// Dispatch upload (invoiced shipments) by Distributor Name, with a nested per-SKU breakdown for
// drill-down. Customers are unioned from BOTH orders and dispatches, so a customer shipped
// against a now-closed order still appears (pending goes negative). All weights in MT:
//   validOrders      = Σ quantity of order lines that are NOT cancelled/rejected (Delivered + blank
//                      status included — total committed demand, matching skuInventoryRows.totalOrders)
//   openOrders       = count of order lines still open (isOpenOrderStatus) — stays strict
//   dispatched       = Σ dispatch bundleEntries weight  → "Invoiced (this period)" flow (caller passes
//                      period-filtered dispatches): everything shipped to the customer this period.
//   invoicedVsOrders = Σ min(ordered, invoiced-against-that-line) over the customer's order lines
//   pending          = Σ max(0, ordered − invoiced-against-that-line) over the customer's OPEN order
//                      lines — matched PER ORDER LINE, so a same-SKU invoice for a different order
//                      never hides this one's pending. Always ≥ 0 (a line can't be "negative pending").
// Per-line invoiced (`orderLineInvoiced`) uses `allDispatches` (defaults to `dispatches`) so cumulative
// prior-period invoicing is counted even when `dispatches` is period-filtered for the flow column.
// inventory/free are looked up from invByCode (a skuCode → skuDemandSupply row map the caller builds from
// UNFILTERED data, so they stay live snapshots). Distributor-level inventory/free is the Σ of the global
// pool over that customer's valid-ordered SKUs — a SHARED pool that overlaps across customers, so callers
// must NOT total those two columns. Per-SKU rows carry the exact global value. Sorted by pending desc at
// both levels; rows carry `id` for DataTable/drill-down. ──
export function distributorSalesRows(orders, dispatches, invByCode = {}, allDispatches = null) {
  const shipped = shippedByOrderLine(allDispatches || dispatches)  // cumulative invoiced per order line
  const idx = distributorOrderIndex(orders)                        // resolve shipments to their order's distributor
  const map = {}
  const cust = (id, name) => {
    const c = map[id] = map[id] || { id, customer: '', validOrders: 0, dispatched: 0, invoicedVsOrders: 0, pending: 0, openOrders: 0, _sku: {} }
    if (name && (!c.customer || c.customer === '—')) c.customer = name
    return c
  }
  const sku = (c, code) => (c._sku[code] = c._sku[code] || { id: code, skuCode: code, description: '', validOrders: 0, dispatched: 0, invoicedVsOrders: 0, pending: 0 })

  ;(orders || []).filter(o => !o.deleted).forEach(o => {
    const { key, name } = resolveDistributorIdentity(o, idx, false)
    const c = cust(key, name)
    if (/cancel|reject/i.test(o.orderStatus || '')) return  // valid demand = everything except cancelled/rejected
    const code = String(o.mmId || '').trim()
    const q = Number(o.quantity || 0)
    const inv = Math.min(q, orderLineInvoiced(o, shipped))                       // invoiced against THIS line, capped
    const pend = isOpenOrderStatus(o.orderStatus) ? Math.max(0, q - orderLineInvoiced(o, shipped)) : 0
    c.validOrders += q; c.invoicedVsOrders += inv; c.pending += pend
    if (isOpenOrderStatus(o.orderStatus)) c.openOrders += 1  // "Open Orders" stays strictly open
    if (code) {
      const s = sku(c, code)
      s.validOrders += q; s.invoicedVsOrders += inv; s.pending += pend
      if (!s.description) s.description = o.description || ''
    }
  })
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const { key, name } = resolveDistributorIdentity(be, idx, true)
    const c = cust(key, name)
    const code = String(be.skuCode || '').trim()
    const w = Number(be.weight || 0)
    c.dispatched += w
    if (code) sku(c, code).dispatched += w
  })

  return Object.values(map).map(c => {
    const skuRows = Object.values(c._sku).map(s => {
      const inv = invByCode[s.skuCode] || {}
      return {
        id: s.id, skuCode: s.skuCode,
        description: inv.description || s.description || s.skuCode,
        validOrders: s.validOrders, dispatched: s.dispatched,
        invoicedVsOrders: s.invoicedVsOrders, pending: s.pending,
        inventory: Number(inv.inventory || 0), free: Number(inv.free || 0),
        // Reserved (released − invoiced) and "Available (Most Relevant)" = global free stock for
        // the SKU (inventory − reserved), both inherited from the live invByCode snapshot.
        reserved: Number(inv.reserved || 0), available: Number(inv.available || 0),
      }
    }).sort((a, b) => b.pending - a.pending)
    const orderedCodes = Object.values(c._sku).filter(s => s.validOrders > 0).map(s => s.skuCode)
    const inventory = orderedCodes.reduce((t, code) => t + Number(invByCode[code]?.inventory || 0), 0)
    const free = orderedCodes.reduce((t, code) => t + Number(invByCode[code]?.free || 0), 0)
    const { _sku, ...rest } = c
    return { ...rest, customer: rest.customer || '—', inventory, free, skuRows }
  }).sort((a, b) => b.pending - a.pending)
}

// ═══════════════════════════════════════════════════════════════
// SALES DASHBOARD — Confirmed / Non-confirmed / Invoiced model (all MT).
// The daily One Helix upload feeds Orders → `orders` (each line carries `confirmed` = ERP
// "Release − Invoiced Qty" and `nonConfirmed` = "Ordered − Release Qty" − "total cancelled qty")
// and Invoice → `dispatches` (the single invoice source of truth). So the sales KPIs read
// Confirmed / Non-confirmed off the ORDER book — a carried-forward snapshot, NOT month-scoped —
// counting only NON-delivered lines (a Delivered order is closed, so its leftover confirmed /
// non-confirmed no longer counts as pending), and invoiced tonnage off DISPATCHES:
//   Confirmed           = Σ orders.confirmed       (excluding Delivered lines)
//   Non-confirmed       = Σ orders.nonConfirmed    (excluding Delivered lines)
//   Pending to Dispatch = Confirmed + Non-confirmed
//   MTD Invoice         = Σ dispatch bundleEntries.weight in `month` (YYYY-MM; '' ⇒ all months)
//   Total Orders        = MTD Invoice + Confirmed + Non-confirmed
// ═══════════════════════════════════════════════════════════════
const salesMonthKey = (d) => String(d || '').slice(0, 7)
const salesNum = (v) => { const n = Number(v); return isFinite(n) ? n : 0 }

// Aggregate KPI totals for the sales cards. Used by BOTH the Sales dashboard and the factory
// Dashboard so the two screens can never diverge. `month` ('' = all months) scopes the invoiced
// tonnage only; Confirmed / Non-confirmed are the live order-book snapshot of NON-delivered
// orders — Delivered lines are excluded (a closed order is no longer pending to dispatch).
export function salesKpis(orders, dispatches, month = '') {
  let confirmed = 0, nonConfirmed = 0
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    confirmed += salesNum(o.confirmed)
    nonConfirmed += salesNum(o.nonConfirmed)
  })
  let mtdInvoice = 0
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    if (month && salesMonthKey(d.dateOfDispatch) !== month) return
    ;(d.bundleEntries || []).forEach(be => { mtdInvoice += salesNum(be.weight) })
  })
  return {
    confirmed, nonConfirmed,
    pending: confirmed + nonConfirmed,
    mtdInvoice,
    totalOrders: mtdInvoice + confirmed + nonConfirmed,
  }
}

// ── DISTRIBUTOR MONTHLY ESTIMATE (Best Estimate) ────────────────────────────────────────────────
// One typed target in MT per (distributor identity, 'YYYY-MM'). Keyed on the SAME identity
// resolveDistributorIdentity produces, so an estimate lands on the distributor's sales row.
//
// A distributor with no ERP distributor code is keyed by normalised name: re-spell that name in the
// sales file and the estimate orphans (it keys to the old spelling) while the sales row splits. There
// is no automatic repair — the orphan shows as a zero-activity row, which is at least visible.

// Index estimates for one month: distributor key → { estimate, name, id }. Later rows win, so a
// duplicate pair (only reachable if the unique index is missing) resolves deterministically.
export function distributorEstimateIndex(estimates, month = '') {
  const out = new Map()
  ;(estimates || []).filter(e => !e.deleted).forEach(e => {
    if (month && String(e.month || '') !== month) return
    const key = String(e.distributorKey || '').trim()
    if (!key) return
    out.set(key, { id: e.id, name: String(e.distributorName || '').trim(), estimate: estimateNum(e.bestEstimate) })
  })
  return out
}

// A Best Estimate is a typed commitment: absent, blank, unparseable, or ≤ 0 all mean "no target",
// which reads as N/A downstream rather than as a target of zero.
export function estimateNum(v) {
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

// The plant Best Estimate — Σ of every distributor estimate for the month (ADR-0001: it is derived,
// never typed). Returns null when nobody has set a target, so % of BE / run rate report N/A exactly
// as the old blank typed field did.
export function plantBestEstimate(estimates, month = '') {
  let total = 0, any = false
  distributorEstimateIndex(estimates, month).forEach(({ estimate }) => {
    if (estimate == null) return
    total += estimate; any = true
  })
  return any ? total : null
}

// Per-distributor sales rows (same five metrics as the KPI cards), grouped by the resolved
// distributor identity so inconsistent name spellings between Orders and Invoice collapse to one
// row (see resolveDistributorIdentity — the "V V shows twice" fix). `month` scopes only invoiced.
// Each row also carries `skuRows` (the same metrics per MM ID) for the drill-down.
//
// `opts.estimates` adds the month's Best Estimate to every row: `bestEstimate`, `pctOfBe`
// (mtdInvoice ÷ BE — invoiced ONLY, matching the plant-level Invoice % of BE) and `gapToBe`
// (BE − mtdInvoice). A distributor holding an estimate but no orders/invoices still gets a row, with
// zeroed actuals, so a total that was completely missed cannot vanish off the screen.
//
// `opts.productions` adds unreserved stock to each SKU drill-down row, scoped to the distributor's
// SERVICE AREA (ticket #129): `onhand` (produced − invoiced across the plants that serve this
// distributor's region, floored at 0), `allConfirmed` (Confirmed across every distributor IN THAT
// AREA), `freeStock` (onhand − allConfirmed — the displayed figure, negative when the size is
// over-committed), `allPending` (pending across every distributor in that area for that SKU) and
// `shortBy` (max(0, pending − onhand)). Inside an area the stock is still shared and reserved to
// nobody, so two distributors there can both be shown covered by one tonnage (ADR-0002); across
// areas it is not shared at all, because a coil at another plant is not stock this distributor can
// be served from. A distributor whose region is `Unmapped` has no known service area, so every one
// of these reads `null` — "?" on screen and in the workbook, never 0.
//
// `opts.plants` are the stored plant-master rows (service area per plant); `opts.distributors` the
// stored region overrides. Both are layered over their code seeds, so omitting them is the shipped
// answer rather than a blank one.
//
// `opts.stateRegions` adds `state`, `states`, `multiState` and `region` to every row via the shared
// distributorRegionResolver. Rows are never filtered or merged on either — an unmapped state reads
// `Unmapped` and keeps its full tonnage in the column totals.
export function salesByDistributor(orders, dispatches, month = '', skus = [], opts = {}) {
  const idx = distributorOrderIndex(orders)
  const keyOf = skuKeyResolver(skus)                                    // canonical identity for the SKU drill-down
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s])) // so an order (mmId) and its invoice merge
  const map = {}
  const row = (key, name) => {
    const r = map[key] = map[key] || { id: key, customer: '', confirmed: 0, nonConfirmed: 0, mtdInvoice: 0, _sku: {} }
    if (name && (!r.customer || r.customer === '—')) r.customer = name
    return r
  }
  // Every SKU row carries its own `description`. The master is preferred, but 37 of the ERP codes on
  // the order book have no master row at all (they are ordered, never produced), and for those the
  // ORDER LINE's own description is the only place the tube's name exists. Without it the screen and
  // the workbook fell back to printing the raw MM ID ('1140-13075-10078295') as the description.
  const skuOf = (r, code, desc = '') => {
    const k = keyOf(code, desc)   // orders pass their description so an ERP code the master lacks still merges
    const s = r._sku[k] = r._sku[k] || {
      id: k, skuCode: skuByKey.get(k)?.skuCode || code,
      description: skuByKey.get(k)?.description || '',
      confirmed: 0, nonConfirmed: 0, mtdInvoice: 0,
    }
    if (!s.description && desc) s.description = String(desc).trim()   // dispatch lines carry none — first order line wins
    return s
  }
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    const { key, name } = resolveDistributorIdentity(o, idx, false)
    const r = row(key, name)
    const c = salesNum(o.confirmed), nc = salesNum(o.nonConfirmed)
    r.confirmed += c; r.nonConfirmed += nc
    const code = String(o.mmId || '').trim()
    if (code) { const s = skuOf(r, code, o.description); s.confirmed += c; s.nonConfirmed += nc }
  })
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    if (month && salesMonthKey(d.dateOfDispatch) !== month) return
    ;(d.bundleEntries || []).forEach(be => {
      const { key, name } = resolveDistributorIdentity(be, idx, true)
      const r = row(key, name)
      const w = salesNum(be.weight)
      r.mtdInvoice += w
      const code = String(be.skuCode || '').trim()
      if (code) skuOf(r, code).mtdInvoice += w
    })
  })
  // A distributor carrying an estimate but no order/invoice activity still needs a row — otherwise
  // the miss disappears and the plant BE (Σ estimates) counts a target nothing is measured against.
  const estIdx = distributorEstimateIndex(opts.estimates, month)
  estIdx.forEach(({ name }, key) => { row(key, name) })

  // ── State/region per distributor, resolved BEFORE the stock block ────────────────────────────
  // The order is load-bearing, not tidiness. Which stock a distributor may be shown is decided by
  // its region, so the region has to exist before the pool is built. It used to be resolved after,
  // which is one reason the pool could only ever be one global number.
  // Derived, never typed: state comes from the distributor's own lines, region from the state
  // master — unless the distributor master carries an explicit override, which wins.
  const regionOf = distributorRegionResolver(orders, dispatches, opts.stateRegions, idx, opts.distributors)
  const regionByKey = new Map(Object.keys(map).map(k => [k, regionOf(k).region]))

  // ── Stock per SERVICE AREA, not one pool for the company (ticket #129) ────────────────────────
  // A distributor is shown the stock of the plants that serve ITS region and of no others. On
  // 20-Aug-2026 every one of the 1,279 production rows was Hyderabad's — a South plant — and this
  // function was handing that tonnage to West distributors: 310.6 T of Free Stock printed against
  // rows no Hyderabad lorry was ever going to fill, and West's shortfall understated by 361 T.
  //
  // FOUR things move together here, and they have to. Scope the productions alone and the numbers
  // get WORSE than they were:
  //   • productions — the stock itself, from the serving plants only.
  //   • dispatches  — the same plants, or South's invoices are subtracted from West's empty pool
  //                   and every West SKU reads as negative stock.
  //   • allConfirmed — per region, or South's Confirmed tonnage is netted off West's zero.
  //   • allPending   — per region, because "who else is queued for this size" only means anything
  //                    among distributors the same plants can actually serve.
  //
  // Within a region the pool is still SHARED and reserved to nobody (ADR-0002 is unchanged): two
  // South distributors waiting on one size are both shown its full tonnage. This ticket narrows
  // WHOSE pool a row reads, never how the pool is divided.
  const master = plantMaster(opts.plants)
  const poolByRegion = new Map(), pendingByRegion = new Map(), confirmedByRegion = new Map()
  if (opts.productions) {
    new Set(regionByKey.values()).forEach(region => {
      // An `Unmapped` distributor has no known service area — UNKNOWN, not empty. It gets no pool,
      // and its stock columns read `?` below rather than 0: telling a sales team a distributor has
      // no stock because nobody mapped its state is a wrong answer, where "?" is a true one.
      if (region === UNMAPPED_REGION) return
      const plants = plantsServingRegion(region, master)
      poolByRegion.set(region, producedPool(
        filterByPlants(opts.productions, plants),
        filterDispatchesByPlants(dispatches, plants), null, keyOf))
      pendingByRegion.set(region, {}); confirmedByRegion.set(region, {})
    })
    Object.entries(map).forEach(([key, r]) => {
      const pend = pendingByRegion.get(regionByKey.get(key)), conf = confirmedByRegion.get(regionByKey.get(key))
      if (!pend) return                       // Unmapped — counted in no region's demand
      Object.values(r._sku).forEach(s => {
        pend[s.id] = (pend[s.id] || 0) + s.confirmed + s.nonConfirmed
        conf[s.id] = (conf[s.id] || 0) + s.confirmed
      })
    })
  }
  const withStock = (region) => (s) => {
    if (!opts.productions) return s
    const pool = poolByRegion.get(region)
    // No pool ⇒ no service area known. Every stock column is null, which every surface renders as
    // "?" or "—" — never as a figure.
    if (!pool) return { ...s, onhand: null, allPending: null, allConfirmed: null, freeStock: null, shortBy: null }
    // A SKU can't hold negative stock — over-dispatched sizes floor to 0 here (the tonnage is
    // accounted for plant-wide by unmatchedDispatch, which has no place on a per-distributor row).
    const onhand = Math.max(0, Number(pool[s.id]?.availableWeight || 0))
    const allPending = pendingByRegion.get(region)[s.id] || 0
    // FREE STOCK — what the serving plants hold that is promised to nobody yet: on-hand less the
    // Confirmed (released, not yet invoiced) tonnage of every distributor IN THIS SERVICE AREA, not
    // just this one. Both terms are area-wide, so the pair stays coherent: netting only this row's
    // Confirmed against a shared pool would show a different "free" figure per distributor for the
    // same physical stock. Goes NEGATIVE when a size is committed beyond what is on the floor —
    // that is the signal, so it is not floored. Same shape as the Dashboard's Free FG.
    const allConfirmed = confirmedByRegion.get(region)[s.id] || 0
    return { ...s, onhand, allPending, allConfirmed, freeStock: onhand - allConfirmed,
      shortBy: Math.max(0, s.pending - onhand) }
  }

  const finish = (o) => ({ ...o, pending: o.confirmed + o.nonConfirmed, totalOrders: o.mtdInvoice + o.confirmed + o.nonConfirmed })
  return Object.values(map).map(r => {
    const { _sku, ...rest } = r
    const { state, states, multiState, region } = regionOf(r.id)
    const skuRows = Object.values(_sku).map(finish).map(withStock(region)).sort((a, b) => b.totalOrders - a.totalOrders)
    const base = finish(rest)
    const bestEstimate = estIdx.get(r.id)?.estimate ?? null
    const { regionOverride } = regionOf(r.id)
    return {
      ...base,
      customer: rest.customer || '—',
      // `region` is the answer; `regionOverride` is whether a person typed it. The Masters tab needs
      // both to show "South (from MAHARASHTRA)" against "South (override)" without re-deriving one
      // of them itself — which is how a screen and a report start disagreeing.
      state, states, multiState, region, regionOverride,
      bestEstimate,
      // Measured against invoiced only (decision 5) — Confirmed / Non-confirmed are an all-time
      // order-book snapshot, so comparing a month's target to them would not be like-for-like.
      pctOfBe: bestEstimate == null ? null : (base.mtdInvoice / bestEstimate) * 100,
      gapToBe: bestEstimate == null ? null : bestEstimate - base.mtdInvoice,
      skuRows,
    }
  }).sort((a, b) => b.totalOrders - a.totalOrders)
}

// Per-month sales rows. Confirmed / Non-confirmed bucket by ORDER month (orderDate); invoiced
// buckets by INVOICE month (dateOfDispatch). Newest month first. Column totals reconcile to the
// all-time Confirmed / Non-confirmed and all-time invoiced for rows with a parseable date (a
// date-less order/invoice — none in the ERP export — has no month bucket and is omitted here).
export function salesByMonth(orders, dispatches) {
  const map = {}
  const row = (m) => (map[m] = map[m] || { month: m, confirmed: 0, nonConfirmed: 0, invoiced: 0 })
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    const m = salesMonthKey(o.orderDate); if (!m) return
    const r = row(m)
    r.confirmed += salesNum(o.confirmed)
    r.nonConfirmed += salesNum(o.nonConfirmed)
  })
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    const m = salesMonthKey(d.dateOfDispatch); if (!m) return
    const r = row(m)
    ;(d.bundleEntries || []).forEach(be => { r.invoiced += salesNum(be.weight) })
  })
  return Object.values(map).map(r => ({
    ...r,
    pending: r.confirmed + r.nonConfirmed,
    totalOrders: r.invoiced + r.confirmed + r.nonConfirmed,
  })).sort((a, b) => (a.month < b.month ? 1 : -1))
}

// ── Inherit a dispatch entry's coil attribution from production FIFO. Maps `pieces` of an
// SKU onto that SKU's production coilAllocations (oldest production first), skipping pieces
// already taken by other (non-deleted) dispatches of the SKU. Carries BOTH babyCoilId and
// the mother hrCoilId through, so cost reconciliation (mother rate) and the Coil Tracker
// keep working. Returns [{babyCoilId, hrCoilId, pieces, weight}]. ──
// `keyOf` (default identity) lets the production↔dispatch match key on the canonical physical
// identity rather than an exact code string — so a dispatch coded differently from its production
// still inherits the right coil trace. Callers pass skuKeyResolver(skus) to enable it.
export function dispatchCoilTrace(skuCode, pieces, productions, dispatches, excludeDispatchId = null, keyOf = (c) => c) {
  const need = Math.max(0, Math.floor(Number(pieces || 0)))
  const wantKey = keyOf(skuCode)
  const ledger = []
  ;(productions || []).filter(p => !p.deleted && keyOf(p.skuCode) === wantKey)
    .sort((a, b) => String(a.dateOfProduction || '').localeCompare(String(b.dateOfProduction || '')))
    .forEach(p => (p.coilAllocations || []).forEach(a =>
      ledger.push({ babyCoilId: a.babyCoilId, hrCoilId: a.hrCoilId, pieces: Number(a.pieces || 0), weight: Number(a.weight || 0) })))

  // Consume pieces already taken by other (non-deleted) dispatch entries of this SKU off the head.
  const alreadyDispatched = (dispatches || [])
    .filter(d => !d.deleted && d.id !== excludeDispatchId)
    .flatMap(d => d.bundleEntries || [])
    .filter(e => keyOf(e.skuCode) === wantKey)
    .reduce((s, e) => s + Number(e.pieces || 0), 0)
  const drain = (qty, sink) => {
    let q = qty
    while (q > 0 && ledger.length) {
      const head = ledger[0]
      const wpp = head.pieces ? head.weight / head.pieces : 0
      const take = Math.min(q, head.pieces)
      if (sink) sink.push({ babyCoilId: head.babyCoilId, hrCoilId: head.hrCoilId, pieces: take, weight: take * wpp })
      head.pieces -= take; head.weight -= take * wpp; q -= take
      if (head.pieces <= 0) ledger.shift()
    }
    return q
  }
  drain(alreadyDispatched, null)
  const out = []
  drain(need, out)
  return out
}

// ── Dispatch invoice reconciliation. One row per (dispatch × invoice × SKU). A truck
// may carry several invoices (entry-level invoiceNo, falling back to the dispatch-level
// one for legacy records). Coil cost was removed — the row carries the resolved Mother
// Coil trace plus the SKU's conversion/ladder rates (Rs/MT). `coils` resolves the mother-
// coil set from each entry's coilAllocations; legacy entries fall back to traceHrCoilId. --
export function buildReconciliationRows(dispatches, coils, skus) {
  const rows = []
  const keyOf = skuKeyResolver(skus)                                    // resolve the SKU by canonical identity
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s])) // so a variant code still finds its master
  dispatches.filter(d => !d.deleted).forEach(d => {
    const groups = {}
    ;(d.bundleEntries || []).forEach(e => {
      const invoiceNo = e.invoiceNo || d.invoiceNo || ''
      const skuCode = e.skuCode || '—'
      const key = invoiceNo + ' ' + skuCode
      ;(groups[key] = groups[key] || { invoiceNo, skuCode, entries: [] }).entries.push(e)
    })
    Object.values(groups).forEach(({ invoiceNo, skuCode, entries }) => {
      const quantityMT = entries.reduce((s, e) => s + Number(e.weight || 0), 0)
      const motherSet = new Set()
      entries.forEach(e => {
        const allocs = Array.isArray(e.coilAllocations) && e.coilAllocations.length
          ? e.coilAllocations
          : [{ hrCoilId: e.traceHrCoilId, weight: e.weight }]
        allocs.forEach(a => {
          const coil = coils.find(c => c.hrCoilId === a.hrCoilId)
          if (coil?.hrCoilId) motherSet.add(coil.hrCoilId)
        })
      })
      const sku = skuByKey.get(keyOf(skuCode)) || skus.find(s => s.skuCode === skuCode)
      const conversionPerMT = Number(sku?.baseConversion || 0)
      const ladderPerMT = Number(sku?.ladderPrice || 0)
      rows.push({
        dateOfDispatch: d.dateOfDispatch || '',
        invoiceNo,
        customer: entries[0]?.customer || d.customer || '',
        sku: sku?.description || skuCode,
        grade: entries[0]?.grade || '',
        quantityMT, motherCoil: [...motherSet].join('; '),
        conversionPerMT, ladderPerMT,
      })
    })
  })
  return rows
}

// ── Weight/pieces of a record (bundle or dispatch entry) attributed to a given coil.
// Prefers coilAllocations[]; falls back to a single (fallbackCoilId) match for legacy rows. ──
function allocFor(rec, hrCoilId, fallbackCoilId, fallbackWeight, fallbackPieces) {
  if (Array.isArray(rec.coilAllocations) && rec.coilAllocations.length) {
    return rec.coilAllocations.filter(a => a.hrCoilId === hrCoilId).reduce(
      (s, a) => ({ weight: s.weight + Number(a.weight || 0), pieces: s.pieces + Number(a.pieces || 0) }),
      { weight: 0, pieces: 0 })
  }
  return fallbackCoilId === hrCoilId
    ? { weight: Number(fallbackWeight || 0), pieces: Number(fallbackPieces || 0) }
    : { weight: 0, pieces: 0 }
}

// ── Coil Tracker per-coil inventory row (Inward → Produced → Dispatched). Bundle Formation
// was removed; dispatch draws straight from production. Pure: filters !deleted internally.
// Production is the coil consumption point; produced/dispatched attribute to the MOTHER
// coil via coilAllocations[] (production rows carry the mother hrCoilId; dispatch rows fall
// back to traceHrCoilId for legacy entries). ──
export function coilInventoryRow(coil, dispatches, productions = []) {
  const coilWt = Number(coil.actualWeight || 0)

  let producedPcs = 0, producedWt = 0
  ;(productions || []).filter(p => !p.deleted).forEach(p =>
    (p.coilAllocations || []).filter(a => a.hrCoilId === coil.hrCoilId).forEach(a => {
      producedPcs += Number(a.pieces || 0); producedWt += Number(a.weight || 0)
    }))

  let dispatchedPcs = 0, dispatchedWt = 0
  ;(dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || []).forEach(be => {
    const a = allocFor(be, coil.hrCoilId, be.traceHrCoilId, be.weight, be.pieces)
    dispatchedPcs += a.pieces; dispatchedWt += a.weight
  })

  return {
    hrCoilId: coil.hrCoilId, grade: coil.coilGrade,
    coilWt, producedPcs, producedWt, dispatchedPcs, dispatchedWt,
    balanceToProduce: coilWt - producedWt,
    producedInvWt: producedWt - dispatchedWt,
    producedInvPcs: producedPcs - dispatchedPcs,
  }
}

// ── ACCESS: what one signed-in user may see (ticket #126) ──────────────────────────────────────
// Sign-in says WHO signed in (ticket #125: a login id, a role and a plant). This section is the one
// place that turns that into what the app shows — which tabs render, which of them are read-only,
// and whether the plant selector is offered at all.
//
// It is a pure function of role and plant on purpose. The rules are a table in the ticket, they
// will be edited (a plant is onboarded, a tab moves), and a rule you can only check by signing in
// and clicking is a rule nobody checks. Here it is 30 lines of data and one `filter`, and the
// tests below it read like the ticket's table.
//
// What it is NOT: a security boundary. Every data table keeps its permissive row-level policy and
// the app's public key still reaches every plant's rows, exactly as blueprints/manage-app-login.md
// says out loud. This hides another plant's screens from an operator who has no use for them. It
// does not protect that plant's data, and nothing on screen may claim it does.
export const ROLE_ADMIN = 'admin'
export const ROLE_PLANT = 'plant'

// The tab bar, in the order it is shown. It lives here rather than in App.jsx because `accessFor`
// decides which of these render, and a second list in the component is a list that drifts: a tab
// added there and not here would be shown to everyone by a rule that had never heard of it.
export const APP_TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'coilTracker', label: 'Coil Tracker' },
  { key: 'coilInward', label: '1. Coil Inward' },
  { key: 'slitting', label: '2. Slitting' },
  { key: 'production', label: '3. Production' },
  { key: 'dispatch', label: '4. Dispatch' },
  // The KEY stays `skuMaster` while the LABEL says Masters (ticket #129): the tab now holds three
  // masters (SKU, Plant, Distributor), but the key is what `accessFor` grants and what
  // PLANT_READ_ONLY_TABS names, so renaming it would silently move a permission.
  { key: 'skuMaster', label: 'Masters' },
  { key: 'orders', label: 'Orders & Invoice' },
  { key: 'sales', label: 'Sales' },
  { key: 'reports', label: 'Reports' },
]

// The three shop-floor stages. Offered only to a plant that actually manufactures — `manufactures`
// in the plant master is the single flag that decides it, exactly as ADR-0004 promised, so
// reclassifying Lepakshi is still a one-line change there and not an edit here.
const MANUFACTURING_TABS = ['coilInward', 'slitting', 'production']

// Coil Inward carries a SECOND condition, and it is not the same question. `manufactures` says a
// plant runs the pipeline at all; COIL_INWARD_PLANT_IDS is the separate rollout list of who may
// register a mother coil *today* (see coilInwardPlants above — the two are documented as distinct
// mechanisms that would diverge the day a plant lands on the master as manufacturing before Coil
// Inward is ready for it). The admin's plant picker already honours the rollout list, so gating
// this tab on `manufactures` alone would let a plant user register coils an admin cannot offer.
// Slitting and Production are NOT gated on it: they consume what Coil Inward registered, so
// without it they are empty, never wrong.
const ROLLED_OUT_ONLY_TABS = ['coilInward']

// Admin-only tabs: Reports builds the company-wide workbooks.
const ADMIN_ONLY_TABS = ['reports']

// Read-only for a plant user — visible, but without the control that changes company-wide data.
// Both are company-wide by nature, which is why they are one operator's job rather than four:
//   skuMaster  weightPerTube drives EVERY plant's tonnage and cost (see the non-negotiables).
//   orders     the upload supersedes every live order row, so a second uploader working from a
//              stale file would overwrite the whole company's order book, not just their own.
const PLANT_READ_ONLY_TABS = ['skuMaster', 'orders']

// Granting nothing. Returned for any session that does not name a role and a plant this app knows
// — deliberately empty rather than "the safe subset", because every such case is a credential row
// to fix (blueprints/manage-app-login.md) and a half-working app hides that.
const NO_ACCESS = { tabs: [], readOnly: [], plantSelector: false, plant: '' }

// role + plant → what renders.
//   tabs          the APP_TABS entries to show, IN APP_TABS ORDER
//   readOnly      keys of visible tabs whose editing controls are withheld
//   plantSelector whether the header offers the plant selector
//   plant          the plant every scoped view is filtered to — ALL_PLANTS for an admin (who then
//                  moves it with the selector), the user's own plant for a plant user (who cannot)
//
// An admin's `plant` is where the selector STARTS; a plant user's is where it is pinned. That is
// the whole difference, and it is why `plantSelector` and `plant` come out of the same function:
// offering a selector and deciding the value it starts on is one decision, not two.
export function accessFor(session, master = DEFAULT_PLANTS) {
  const role = String(session?.role ?? '').trim()
  const plant = String(session?.plant ?? '').trim()

  if (role === ROLE_ADMIN) {
    return { tabs: [...APP_TABS], readOnly: [], plantSelector: true, plant: ALL_PLANTS }
  }

  if (role !== ROLE_PLANT) return { ...NO_ACCESS }

  // A plant user must have a plant of their own. ALL_PLANTS is what a NULL plant column arrives as
  // (db.js), and blank is Unattributed — the labelling gap, not a plant. Neither is a plant to be
  // scoped to, and reading either as "all of them" would hand a plant login the whole company.
  if (!plant || plant === ALL_PLANTS) return { ...NO_ACCESS }

  // An id matching no master row is a credential to fix, not a case to widen: it stays the scope
  // (so the tabs read empty and the fault is visible) and it does not manufacture.
  const manufactures = !!plantById(plant, master)?.manufactures
  const rolledOut = COIL_INWARD_PLANT_IDS.includes(plant)
  const hidden = new Set([
    ...ADMIN_ONLY_TABS,
    ...(manufactures ? [] : MANUFACTURING_TABS),
    ...(rolledOut ? [] : ROLLED_OUT_ONLY_TABS),
  ])
  const tabs = APP_TABS.filter(t => !hidden.has(t.key))
  const visible = new Set(tabs.map(t => t.key))

  return {
    tabs,
    readOnly: PLANT_READ_ONLY_TABS.filter(k => visible.has(k)),
    plantSelector: false,
    plant,
  }
}

// ── The stored session ─────────────────────────────────────────────────────────────────────────
// A correct sign-in is remembered on that device for ~30 days so the app is not a password prompt
// every morning. This is the pure half of that: given whatever came out of storage, is it a
// session, and is it still valid? The impure half (reading and writing localStorage) stays in
// App.jsx, which is what keeps this testable at all — App.jsx cannot be imported by the suite.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000

// Anything that is not a complete, unexpired session is `null` — one answer, so the caller has one
// branch. In particular EVERY session stored before this ticket is null: they carry a login id and
// a timestamp and no role, because roles did not exist. That is the one-time re-authentication the
// ticket calls for, and it needs no version stamp to arrange — a session that cannot say what it
// may do is not a session. Everyone signs in once more; nobody is locked out.
export function parseStoredSession(saved, now = Date.now()) {
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return null
  const loginId = String(saved.loginId ?? '').trim()
  const role = String(saved.role ?? '').trim()
  const plant = String(saved.plant ?? '').trim()
  const at = saved.at
  if (!loginId) return null                                   // a session names WHO signed in
  if (role !== ROLE_ADMIN && role !== ROLE_PLANT) return null  // …and what they may do
  if (!plant) return null                                     // admin carries ALL_PLANTS, not blank
  if (typeof at !== 'number' || !Number.isFinite(at)) return null
  if (now - at > SESSION_TTL_MS) return null
  return { loginId, plant, role, at }
}

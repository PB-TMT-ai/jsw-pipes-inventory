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
// Static SKU catalog — the fallback the invoice import self-heals from when the live master is
// missing a size (see `skuImportResolver`). Same dependency shape, same load-bearing `.js`.
import DEFAULT_SKUS from '../data/skus.js'
// Planning master seed (#278) — the user's table from #249, expanded by `planningMaster` below.
// Same dependency shape, same load-bearing `.js`.
import { PLANNING_MASTER_SEED, PLANNING_PLANT_LETTERS } from '../data/planningMaster.js'

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
// The 1.2 / 3.2 / 5.0 / 6.0 rows were added 2026-09-18. They are NOT new mill capability — the
// sheet simply never described gauges the plant already runs, so 508 T of coil at those four gauges
// matched no FG gauge and was invisible to Production's suggestion, while 729 T of orders sat open
// against pipe the master already carries and the plant has already produced (1.2: 15 SKUs, 99.7 T
// made; 3.2: 18 SKUs, 83.4 T; 5.0: 15 SKUs, 123.7 T; 6.0: 5 SKUs, 19.8 T). Each is mapped to its
// OWN gauge only — the identity pairing every confirmed row already shows (1.6→1.6, 2.0→2.0,
// 2.5→2.5, 2.8→2.8, 3.0→3.0, 4.0→4.0). Any thin/thick cross-pairing for them is a mill fact nobody
// has stated, so it is deliberately NOT guessed here; add it when the plant confirms.
//
// 1.4 is deliberately STILL ABSENT. One 21.3 T coil at Lepakshi (LEP-0926-26) carries that gauge,
// but no SKU in the master is 1.4 mm, no order asks for it and none was ever produced — there is no
// pipe to map it to. It is likelier a mis-keyed 1.6 at Coil Inward than a real gauge; leaving it
// off the sheet keeps it visible as an exception rather than silently rolling it into a pipe.
export const RM_TO_FG_THICKNESS = [
  { rm: 1.2, fg: [1.2] },
  { rm: 1.6, fg: [1.6] },
  { rm: 2.0, fg: [2.0] },
  { rm: 2.1, fg: [2.0] },
  { rm: 2.2, fg: [2.2, 2.3] },
  { rm: 2.3, fg: [2.5] },
  { rm: 2.5, fg: [2.5] },
  { rm: 2.6, fg: [2.8] },
  { rm: 2.8, fg: [2.8] },
  { rm: 3.0, fg: [3.0, 3.2] },
  { rm: 3.2, fg: [3.2] },
  { rm: 3.7, fg: [3.8, 4.0] },
  { rm: 4.0, fg: [4.0] },
  { rm: 5.0, fg: [5.0] },
  { rm: 6.0, fg: [6.0] },
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

// ── Baby-coil stock: one coil, one production run — the ONE definition of "still stock".
//
// A baby coil goes into ONE production run (ADR-0015). It is stock while no live production has
// been assigned to it, and then at its FULL slit weight. The moment a production names it, it is
// out — every kilo, including what is left on it. What is left is not stock, not suggested by FIFO
// and not offered in the manual picker; the only place it is shown is the Inventory tab's slit-coil
// movement table, where the book has to be bridged to the stock figure.
//
// This replaces ADR-0007's 0.2 T scrap floor and the operator's Consumed flag. With one run per
// coil the floor has nothing left to judge (an unassigned coil carries its whole slit weight), and
// a coil that is physically gone without a production is DELETED on Slitting, not flagged. The
// `baby_coils.consumed` column stays in the database, unread.
//
// Two facts stop a baby coil being stock, and both are read live:
//   · deleted   — the row should never have existed, or the coil is not on the floor
//   · assigned  — some non-deleted production's coilAllocations names it
// "Assigned" is derived from productions, never stamped on the coil, so deleting or editing the
// production gives the coil back. `consumed` is a coilConsumption(…, 'babyCoilId') map; a
// production being edited is excluded by the caller (coilConsumption's excludeId), which is what
// keeps its own coils pickable in its own form.

// Remaining weight on one baby coil = slit weight − what production has already taken.
// Never floored: a coil consumed beyond its own weight is a fault to see (that is how 445 coils
// came to hold 123.3 T they never had), not one to hide behind a Math.max here.
export function babyCoilFree(baby, consumed = {}) {
  return Number(baby?.weight || 0) - Number(consumed[baby?.babyCoilId]?.weight || 0)
}

// Has a live production been assigned to this coil? Presence in the map, not weight: an allocation
// row carrying 0 T still names the coil.
export function babyCoilIsAssigned(baby, consumed = {}) {
  const id = baby?.babyCoilId
  return id != null && id !== '' && Object.prototype.hasOwnProperty.call(consumed || {}, id)
}

// Is this baby coil still stock? Not deleted, and no live production assigned to it.
export function babyCoilIsStock(baby, consumed = {}) {
  if (!baby || baby.deleted) return false
  return !babyCoilIsAssigned(baby, consumed)
}

// Baby-coil stock in MT — the Dashboard card, the Coil Tracker stock table and the Raw Material
// report all read this, so the three cannot report different tonnage for the same floor.
// A stock coil is unassigned, so its free weight IS its slit weight.
export function babyCoilStock(babyCoils, consumed = {}) {
  return (babyCoils || []).reduce((s, b) =>
    s + (babyCoilIsStock(b, consumed) ? Number(b.weight || 0) : 0), 0)
}

// ── Coil on hand: the steel not yet turned into tube, coil by coil (inventory-dashboard-rules S14).
// The ONE list behind the Inventory Snapshot's RM half and the week plan's coil columns (#286):
//   · HR coil not yet slit = its weight (actual, else invoice) − Σ its live slit coils' slit weight,
//     floored at 0 — a partly slit HR coil counts what is still on it. Wider on purpose than the Raw
//     Material report's "unslit", which drops any HR coil with a slit coil.
//   · Slit coil not yet used = a coil `babyCoilIsStock` calls stock — no live production assigned
//     to it — at its full slit weight (ADR-0015).
// Each coil keeps its OWN stored plant (ADR-0005), nothing is re-attributed. `thickness` is the
// coil's own: a slit coil's stored one, else its HR coil's (as the Coil Tracker buckets it, #265).
// Only coil booked at Coil Inward exists here: no typed or estimated arrival.
// Returns { hr: [{ coil, id, plant, thickness, weight }], slit: [{ coil, id, plant, thickness, width, weight }] }.
export function coilOnHand({ coils = [], babyCoils = [], productions = [] } = {}) {
  const live = (rows) => (rows || []).filter(r => r && !r.deleted)
  const liveBabies = live(babyCoils)
  const slitOff = {}
  liveBabies.forEach(b => { slitOff[b.hrCoilId] = (slitOff[b.hrCoilId] || 0) + num(b.weight) })
  const hrThk = new Map(live(coils).map(c => [String(c.hrCoilId ?? ''), c.thickness]))
  const blank = (v) => v == null || String(v).trim() === ''
  const hr = []
  live(coils).forEach(c => {
    const weight = num(c.actualWeight) > 0 ? num(c.actualWeight) : num(c.invoiceWeight)
    const mt = Math.max(0, weight - (slitOff[c.hrCoilId] || 0))
    if (mt <= 0.0005) return
    hr.push({ coil: c, id: c.hrCoilId, plant: storedPlant(c), thickness: c.thickness, weight: mt })
  })
  const consumed = coilConsumption(productions, null, 'babyCoilId')
  const slit = liveBabies.filter(b => babyCoilIsStock(b, consumed)).map(b => ({
    coil: b, id: b.babyCoilId, plant: storedPlant(b),
    thickness: blank(b.thickness) ? hrThk.get(String(b.hrCoilId ?? '')) : b.thickness,
    width: num(b.width), weight: num(b.weight),
  }))
  return { hr, slit }
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
// `opts` (ticket #232) adds two fields and changes nothing else: `bands` — ascending upper edges in
// days, e.g. [30, 60, 75] → `bands: [≤30, 31–60, 61–75, 75+]` of surviving weight (Σ = onhandWeight);
// `lots: true` — the surviving production batches themselves, oldest first, as `{ id, date, skuCode,
// weight, ageDays }`, `weight` being what FIFO left of the batch. The app has no lot id, so a batch is
// one production row.
// Which band of ascending upper `edges` a value falls in; past the last edge is the open band.
function bandIndex(edges, v) { const i = edges.findIndex(e => v <= e); return i < 0 ? edges.length : i }

export function skuAgeing(productions, dispatches, keyOf = (c) => c, asOf = new Date().toISOString().slice(0, 10), opts = {}) {
  const edges = Array.isArray(opts.bands) ? opts.bands : null
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
    ;(layersByKey[k] = layersByKey[k] || []).push({ id: p.id, skuCode: p.skuCode, date: p.dateOfProduction, weight: Number(p.totalWeight || 0) })
  })
  const out = {}
  for (const k of Object.keys(layersByKey)) {
    const layers = layersByKey[k].sort((a, b) => String(a.date).localeCompare(String(b.date)))
    let drain = dispByKey[k] || 0, onhand = 0, ageWt = 0, oldest = null
    const bkt = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 }  // surviving weight by age band
    const bands = edges ? new Array(edges.length + 1).fill(0) : null
    const lots = opts.lots ? [] : null
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
      if (bands) bands[bandIndex(edges, age)] += surv
      if (lots) lots.push({ id: L.id, date: String(L.date ?? '').slice(0, 10), skuCode: L.skuCode, weight: surv, ageDays: age })
    }
    if (onhand > 1e-9) {
      out[k] = { onhandWeight: onhand, avgAgeDays: ageWt / onhand, oldestAgeDays: oldest, buckets: bkt }
      if (bands) out[k].bands = bands
      if (lots) out[k].lots = lots
    }
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

// A tonnage that is absent, blank or unparseable is 0, never NaN — one bad cell in a 900-line order
// book must not blank a KPI. Defined here rather than in the sales section because the netting
// helper below is the first thing that needs it.
const salesNum = (v) => { const n = Number(v); return isFinite(n) ? n : 0 }

// ── CONFIRMED, NETTED AGAINST THE INVOICES ALREADY RAISED (ADR-0014) ───────────────────────────
// `confirmed` is NOT computed by this app. It is read straight off ERP column BE, "Release −
// Invoiced Qty" (`mapOrderRow`). The defect is in the ERP's own `Invoiced Qty`: it only fills
// properly once a line reaches `Delivered`. While a line sits at `Delivery in progress` the goods
// have been billed but the ERP still reports 0 (or partial) invoiced — so `Release − Invoiced`
// never falls and the line keeps claiming tonnage that has already shipped.
//
//     surplus = orderLineInvoiced(o, shipped) − o.invoicedQty      // ≥ 0 by construction
//     live    = max(0, o.confirmed − surplus)
//
// `orderLineInvoiced` takes the LARGER of the Zoho tonnage matched to this line and the order
// sheet's own `invoicedQty`, so `surplus` is exactly the tonnage Zoho has billed that the ERP
// snapshot did not know about. On 21-Sep-2026 that was 335.8 T of a 559.9 T Confirmed, across 62
// of 914 open lines. It is not an upload lag — both files were uploaded 20 seconds apart and the
// gap stood; it persists from invoicing until delivery confirmation, days or weeks.
//
// SELF-CANCELLING BY DESIGN: once the ERP catches up the two figures agree, surplus is 0, and this
// returns `o.confirmed` untouched. The correction exists only while it is needed.
//
// CLAMPED AT ZERO, and the excess is NOT spilled into `nonConfirmed` (ADR-0014). A surplus larger
// than the line's own Confirmed (16.4 T across the whole live book) is dropped: simpler, and
// nothing can go negative.
//
// KNOWN FRAGILITY: the Zoho→order-line match is a string join on item name (see
// `attributeInvoiceLine`). If Zoho's item text drifts from the ERP description, lines stop
// matching, `surplus` silently goes to 0 and the phantom tonnage returns. `unmatchedOrderLines` on
// the upload banner is the existing detector — there is deliberately no second one.
//
// CALL THIS FROM EVERY SURFACE THAT TOTALS CONFIRMED (salesKpis, salesByDistributor, salesByMonth,
// skuInventoryRows). Netting in some and not others puts the Sales tab and the WhatsApp report on
// different numbers — worse than the bug. ──
export function liveConfirmed(order, shippedByLine = {}) {
  const surplus = Math.max(0, orderLineInvoiced(order, shippedByLine) - salesNum(order?.invoicedQty))
  return Math.max(0, salesNum(order?.confirmed) - surplus)
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
// `erpRowPicker` is the header-matching both row mappers do: lower-case the header, drop `.` `_`
// and spaces, then take the first alias that holds a non-blank cell.
//
// It lives here, with `plantForErpRow` on top of it, for one reason: App.jsx cannot be imported by
// the test suite, so while plant resolution lived there the column names were untestable — the
// aliases could be pointed at a column that does not exist and the whole suite still passed, with
// every line in both sheets silently becoming Unattributed. Resolution moved to where a test can
// reach it; the mappers call in. The invoice mapper (`mapDispatchRow`, below) has since followed
// it here for the same reason (ticket #190); the Orders mapper is still App.jsx's.
export function erpRowPicker(row) {
  const norm = {}
  for (const k of Object.keys(row || {})) norm[String(k).toLowerCase().replace(/[.\s_]+/g, '')] = row[k]
  return (...keys) => {
    for (const k of keys) if (norm[k] !== undefined && norm[k] !== '') return norm[k]
    return ''
  }
}

// The ONE place ANY source file's plant columns are named (tickets #118/#119/#192). The ERP Orders
// sheet spells the name column `CM name`; the ERP Invoice sheet spells it `Ship from location`; the
// Zoho invoice register spells it `Warehouse Name`. On the two ERP sheets the name is a FALLBACK
// only — `Ship From Code` is what a plant IS (docs/adr/0004). The Zoho register carries no code
// column at all, so there the name is the only key, and also the filter (docs/adr/0013). One alias
// list serves all three, so the mappers cannot drift into recognising different columns.
export function plantForErpRow(row, index = DEFAULT_PLANT_INDEX) {
  const pick = erpRowPicker(row)
  return resolvePlant({
    shipFromCode: pick('shipfromcode', 'shipfrom', 'shipfromcodeid'),
    name:         pick('cmname', 'shipfromlocation', 'cmnames', 'warehousename', 'warehouse'),
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
// pipeline; this says which one actually does right now. All four do — NPMD's numbering was
// readied first, in ticket #122 (`nextCoilNumber`/`genHRCoilId` above are both plant-aware), then
// offered here in ticket #123, so an NPMD coil gets a correctly-shaped `NPM-` id from its very
// first save. Lepakshi and Tapi joined in ticket #156 on that same already-plant-aware numbering:
// each plant counts its own coils, so their first coil is 01 whatever number Hyderabad is on, and
// `LEP-`/`TAP-` came free from the prefixes already on the master. Order matters: Hyderabad stays
// first, so DEFAULT_COIL_PLANT below is unchanged and the ordinary path is still one click.
// A stored `plant` as the helpers below compare it: the id, or '' for a row written before this
// ticket (SQL NULL reads back as null, and a half-filled form as ''). Deliberately NOT exported —
// reading a row's plant field raw is never the interesting operation; the named rules below are.
const storedPlant = (row) => String(row?.plant ?? '').trim()

export const COIL_INWARD_PLANT_IDS = ['hyderabad', 'npmd', 'lepakshi', 'tapi']
export const DEFAULT_COIL_PLANT = COIL_INWARD_PLANT_IDS[0]

// The plant master rows Coil Inward offers, in master order. Two conditions, and they are not the
// same thing: `manufactures` is the master's own answer to "does this plant run the pipeline at
// all" — flipping it to false still removes a plant from here in one line, as ADR-0004 promised —
// while COIL_INWARD_PLANT_IDS is a separate, manually-maintained rollout list on top of it. The two
// happen to match exactly as of #156 (every plant on the master is now offered), but they're not
// the same mechanism: they'd diverge again the day a plant lands on the master with
// `manufactures: true` before Coil Inward is actually ready to offer it. Because this is an
// INTERSECTION, activating a plant means flipping BOTH switches: changing either one alone leaves
// the picker exactly as it was, with nothing on screen to say why.
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

// ── PRODUCTION PO No. (ticket: contract-manufacturing PO) ──────────────────────────────────────
// The PO **we issue to the contract manufacturer** to make finished pipes. It is the THIRD PO in
// this app and shares nothing with the other two: `coils.poNumber` is the PO we BUY HR coil under
// (inherited mother → baby), and `orders.childOrderId` is the CUSTOMER's PO for the tubes. Keeping
// the three under distinct keys is deliberate — one name for two documents is the bug class that
// cost `plant` a whole ADR (docs/adr/0005).
//
// It is a STAMP: nothing is computed from it. No reservation, no progress tracking, no plant check
// (no master says which CM a PO was issued to, so the app cannot know that a PO belongs to Nippon
// rather than NPMD).
//
// Normalised on the way IN so the datalist of previously-used POs converges instead of drifting:
// "po/2026/114 " and "PO/2026/114" are the same purchase order and must not read as two. Trim then
// uppercase — nothing more. Inner spacing and punctuation are left exactly as typed, because a PO
// number's own format is the CM's, not ours to reformat.
export function normalizeProductionPoNo(value) {
  return String(value ?? '').trim().toUpperCase()
}

// The distinct POs already stamped on production rows — the datalist behind the Production PO No.
// box. Drawn from ALL productions, never the plant-scoped view: a PO issued for one CM's batch is
// still the PO an operator is most likely typing next, and hiding it would only invite a re-typo.
// Deleted rows are skipped (a soft-deleted batch is not a record of anything), blanks drop out, and
// the result is sorted so the list reads the same on every render.
export function productionPoOptions(productions = []) {
  const seen = new Set()
  ;(productions || []).forEach(p => {
    if (p?.deleted) return
    const po = normalizeProductionPoNo(p?.productionPoNo)
    if (po) seen.add(po)
  })
  return [...seen].sort()
}

// ── PLANT FILTER (ticket #121) ─────────────────────────────────────────────────────────────────
// One selector, offered in the header and applied globally — never a per-tab filter, so nobody has
// to reason about which view is scoped and which is not. It scopes every tab that shows rows
// belonging to a plant: Dashboard, Coil Tracker, Coil Inward, Slitting, Production, Dispatch,
// Orders, Sales and Reports. Masters is the exception — a SKU catalog, a plant's service area and a
// distributor's region are company-wide masters, not rows that sit at a plant.
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
      pendingBySku[k] = (pendingBySku[k] || 0) + liveConfirmed(o, shipped) + salesNum(o.nonConfirmed)
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
//   Confirmed           = Σ liveConfirmed(order)   (excluding Delivered lines) — the ERP's
//                         "Release − Invoiced" NETTED against invoices Zoho has already matched to
//                         the line, because the ERP's own invoiced figure lags until Delivered.
//                         See liveConfirmed / ADR-0014.
//   Non-confirmed       = Σ orders.nonConfirmed    (excluding Delivered lines)
//   Pending to Dispatch = Confirmed + Non-confirmed
//   MTD Invoice         = Σ dispatch bundleEntries.weight in `month` (YYYY-MM; '' ⇒ all months)
//   Total Orders        = MTD Invoice + Confirmed + Non-confirmed
// ═══════════════════════════════════════════════════════════════
const salesMonthKey = (d) => String(d || '').slice(0, 7)

// Aggregate KPI totals for the sales cards. Used by BOTH the Sales dashboard and the factory
// Dashboard so the two screens can never diverge. `month` ('' = all months) scopes the invoiced
// tonnage only; Confirmed / Non-confirmed are the live order-book snapshot of NON-delivered
// orders — Delivered lines are excluded (a closed order is no longer pending to dispatch).
export function salesKpis(orders, dispatches, month = '') {
  const shipped = shippedByOrderLine(dispatches)   // netting: see liveConfirmed
  let confirmed = 0, nonConfirmed = 0
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    confirmed += liveConfirmed(o, shipped)
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
  const shipped = shippedByOrderLine(dispatches)                        // netting: see liveConfirmed
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
    const c = liveConfirmed(o, shipped), nc = salesNum(o.nonConfirmed)
    r.confirmed += c; r.nonConfirmed += nc
    const code = String(o.mmId || '').trim()
    if (code) { const s = skuOf(r, code, o.description); s.confirmed += c; s.nonConfirmed += nc }
  })
  // `opts.from` / `opts.to` (ISO days, inclusive) replace the month as the invoice window when given —
  // the Sales tab's Size × Thickness grid reads a date range, the rest of the tab a month.
  const inWindow = (date) => {
    if (opts.from || opts.to) {
      const s = String(date ?? '').slice(0, 10)
      return !!s && (!opts.from || s >= opts.from) && (!opts.to || s <= opts.to)
    }
    return !month || salesMonthKey(date) === month
  }
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    if (!inWindow(d.dateOfDispatch)) return
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
  const poolByPlant = new Map()
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
      // ── ON FLOOR, BY PLANT: one pool per SERVING PLANT, not the area pool divided up ──────────
      // What each plant ACTUALLY HOLDS of a size — steel someone can walk out and count. The
      // workbook no longer prints it (the Distributor × SKU sheet prints FREE inventory instead),
      // but it is not dead: it is the checkable base the free cells are derived from, and the term
      // ADR-0009's reconciliation identity is asserted against. Delete it and the printed figure
      // loses the only thing anyone can measure it against.
      //
      // `producedPool` is produced − dispatched, so it is additive: the serving plants partition
      // the same rows the area pool reads, and their unfloored weights sum to the area's exactly.
      // The only wedge between the cells and `onhand` is per-plant flooring, reported below.
      poolByPlant.set(region, new Map([...plants].map(id => [id, producedPool(
        filterByPlants(opts.productions, [id]),
        filterDispatchesByPlants(dispatches, [id]), null, keyOf)])))
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
    if (!pool) return { ...s, onhand: null, allPending: null, allConfirmed: null, freeStock: null, shortBy: null,
      onhandByPlant: null, onhandByPlantUnmatched: null, freeStockByPlant: null }
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
    // One cell per serving plant. A plant that serves this region and holds none of the size reads
    // 0 — a real answer; a plant that does not serve it gets NO KEY at all, which the renderer
    // prints as a dash. "Cannot ship to you" and "is empty" are different facts and must not share
    // a symbol (the same rule that keeps an Unmapped row on `?` rather than 0).
    const onhandByPlant = {}
    let onhandByPlantUnmatched = 0
    ;(poolByPlant.get(region) || new Map()).forEach((p, id) => {
      const w = Number(p[s.id]?.availableWeight || 0)
      onhandByPlant[id] = Math.max(0, w)                 // a plant cannot hold negative steel
      if (w < 0) onhandByPlantUnmatched -= w             // magnitude, as unmatchedDispatch reports it
    })
    // The identity, and it carries a FLOOR:
    //
    //     max(0, Σ onhandByPlant − onhandByPlantUnmatched) === onhand
    //
    // `Σ cells − unmatched` is the area's UNFLOORED weight. `onhand` floors it. Two different
    // floorings sit between them: the cells floor each plant on its own (so a plant that invoiced
    // beyond what it recorded producing is carried out into `unmatched`), and `onhand` floors the
    // COMBINED pool. While the area holds stock the two agree and the cells simply add up to it.
    // When the WHOLE AREA is over-invoiced for a size, the left side is negative and `onhand` is 0 —
    // which is why the floor is not decoration. On the live book at 07-Sep-2026 that was 54 of 667
    // rows, so the un-floored form would have failed the renderer's tie-out on real data.
    // ── FREE INVENTORY, BY PLANT — what the workbook prints (ADR-0010) ────────────────────────
    // The area's Confirmed tonnage belongs to a REGION, never to a plant: an order line names a
    // distributor, and any plant serving that distributor's region can fill it. So there is no
    // plant-level Confirmed to subtract, and one has to be apportioned. It is shared out PRO-RATA
    // BY HOLDING, which collapses to a single factor every plant in the area is scaled by:
    //
    //     freeStockByPlant[p] = onhandByPlant[p] × (1 − allConfirmed / H),  H = Σ onhandByPlant
    //
    // so the cells sum to `H − allConfirmed` and keep their proportions. The GUARD IS NOT
    // DECORATION: `allConfirmed / 0` is Infinity and `0 * Infinity` is NaN, which would print as a
    // blank cell — the one mark this sheet reserves for "not your service area".
    //
    // H === 0 (the area holds none of the size) reads 0.0 in every cell and the AREA column alone
    // carries the −allConfirmed. Splitting a commitment across plants that hold nothing would
    // invent a plant-level claim on steel that is not there.
    //
    // This is what ADR-0009 gave up. An on-floor cell was steel someone could walk out and count,
    // and it sat still no matter who ordered; a free cell cannot, because "free" means "less what
    // is promised". Netting CONFIRMED ONLY keeps half of that promise — the cells still do not
    // move when another distributor's NON-CONFIRMED book changes, only when tonnage is released
    // for dispatch, which is a real claim on the floor.
    const H = Object.values(onhandByPlant).reduce((t, v) => t + v, 0)
    const confirmedFactor = H > 0 ? 1 - allConfirmed / H : 0
    const freeStockByPlant = {}
    Object.entries(onhandByPlant).forEach(([id, w]) => { freeStockByPlant[id] = w * confirmedFactor })
    return { ...s, onhand, allPending, allConfirmed, freeStock: onhand - allConfirmed,
      shortBy: Math.max(0, s.pending - onhand), onhandByPlant, onhandByPlantUnmatched, freeStockByPlant }
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
  const shipped = shippedByOrderLine(dispatches)   // netting: see liveConfirmed
  const row = (m) => (map[m] = map[m] || { month: m, confirmed: 0, nonConfirmed: 0, invoiced: 0 })
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    const m = salesMonthKey(o.orderDate); if (!m) return
    const r = row(m)
    r.confirmed += liveConfirmed(o, shipped)
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

// ── Sales tab: Size × Thickness grid ──────────────────────────────────────────────────────────
// The indent plan's layout on the Sales tab: one row per section and size, one column per
// thickness inside each block. Two families of block, scoped by two different things on purpose:
//
//   STOCK FLOW for the From…To window — Opening, Production, Dispatch, Closing. A fact about PLANTS: the
//   finished stock of the plants that serve the regions in view (ADR-0006 — a distributor is never
//   shown stock from a plant that does not serve it). Book figures, produced − invoiced per SKU,
//   NOT floored, so Opening + Production − Dispatch = Closing holds in every cell; a size invoiced
//   beyond what was recorded produced reads negative rather than vanishing.
//   SALES — Confirmed, Non-confirmed, Pending to Dispatch, MTD Invoice. A fact about DISTRIBUTORS:
//   summed from the `salesByDistributor` rows passed in, so the grid's totals are the distributor
//   table's totals for the same rows.
//
// Dispatch is invoiced OUT OF the serving plants; MTD Invoice is invoiced TO the distributors in
// view. Under All distributors and every region they are the same tonnage; with one distributor
// picked they part company, and that difference is the point of showing both.
//
// `stockRegions`: null = no service-area scoping (every plant in the stores passed in). An array =
// the plants serving those regions. Nothing but `Unmapped` in it = the service area is unknown, and
// every stock figure is null — "?" on screen, never 0 (unknown is not empty).
export const SALES_GRID_STOCK = [
  { key: 'opening', label: 'Opening stock' }, { key: 'production', label: 'Production' },
  { key: 'dispatch', label: 'Dispatch' }, { key: 'closing', label: 'Closing stock' },
]
export const SALES_GRID_SALES = [
  { key: 'confirmed', label: 'Confirmed' }, { key: 'nonConfirmed', label: 'Non-confirmed' },
  { key: 'pending', label: 'Pending to Dispatch' }, { key: 'mtdInvoice', label: 'Invoiced' },
]
export const SALES_GRID_MEASURES = [...SALES_GRID_STOCK, ...SALES_GRID_SALES]
const SALES_GRID_SECTIONS = ['SHS', 'RHS', 'CHS']

// Section, size and thickness of one canonical key (`type|std|size|thk|len`). Size is normalised the
// way `skuFamily` does it — "40 NB", or HxB with the larger side first. Section is the master's
// product type when it is one of the three, else read from the shape (NB → CHS, square → SHS).
function salesGridShape(key) {
  const parts = String(key || '').includes('|') ? String(key).split('|') : null
  if (!parts) return { section: '', size: '', thickness: null }
  const raw = String(parts[2] || '').replace(/\s+/g, ' ').trim()
  let size = '', shape = ''
  const nb = raw.match(/^(\d+(?:\.\d+)?) ?nb$/i)
  const hb = raw.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/i)
  if (nb) { size = `${Number(nb[1])} NB`; shape = 'CHS' }
  else if (hb) {
    const [a, b] = [Number(hb[1]), Number(hb[2])]
    size = `${Math.max(a, b)}x${Math.min(a, b)}`; shape = a === b ? 'SHS' : 'RHS'
  }
  const type = String(parts[0] || '').toUpperCase()
  const t = Number(parts[3])
  return {
    section: SALES_GRID_SECTIONS.includes(type) ? type : shape,
    size,
    thickness: Number.isFinite(t) && t > 0 ? Math.round(t * 100) / 100 : null,
  }
}

export function salesSizeLines({ distRows = [], productions = [], dispatches = [], skus = [], plants = null,
  from = '', to = '', today: todayIso = today(), stockRegions = null } = {}) {
  const keyOf = skuKeyResolver(skus)
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s]))
  const lines = new Map()
  const line = (key, code = '', desc = '') => {
    if (!lines.has(key)) {
      const s = skuByKey.get(key)
      lines.set(key, { key, skuCode: s?.skuCode || code, description: s?.description || desc || '',
        ...salesGridShape(key),
        opening: 0, production: 0, dispatch: 0, closing: 0,
        confirmed: 0, nonConfirmed: 0, pending: 0, mtdInvoice: 0 })
    }
    const l = lines.get(key)
    if (!l.description && desc) l.description = desc
    return l
  }

  // ── Sales: Σ the distributor rows' own SKU rows — nothing re-derived ──
  ;(distRows || []).forEach(r => (r.skuRows || []).forEach(s => {
    const l = line(s.id, s.skuCode, s.description)
    l.confirmed += num(s.confirmed); l.nonConfirmed += num(s.nonConfirmed)
    l.pending += num(s.pending); l.mtdInvoice += num(s.mtdInvoice)
  }))

  // ── Stock flow: the serving plants' productions and invoices, BOTH scoped by the same plants ──
  let stockKnown = true, servingPlants = null
  if (stockRegions != null) {
    const known = stockRegions.filter(r => r && r !== UNMAPPED_REGION)
    if (!known.length) stockKnown = false
    else {
      const master = plantMaster(plants)
      servingPlants = new Set(known.flatMap(r => [...plantsServingRegion(r, master)]))
    }
  }
  if (stockKnown) {
    // The window is From…To inclusive. Opening is everything before From (an undated row has
    // happened, just not inside the window). A row dated after To is not counted — except when To is
    // today, where a future-dated row still counts, as on the Inventory overview (#176).
    const F = String(from || '').slice(0, 10)
    const T = String(to || '').slice(0, 10)
    const U = T && T >= String(todayIso).slice(0, 10) ? '9999-12-31' : T
    const when = (d) => {
      const s = String(d ?? '').slice(0, 10)
      if (!s || (F && s < F)) return F ? 'before' : 'in'
      return !U || s <= U ? 'in' : 'after'
    }
    notDeleted(filterByPlants(productions, servingPlants)).forEach(p => {
      const w = when(p.dateOfProduction); if (w === 'after') return
      const l = line(keyOf(p.skuCode), p.skuCode)
      l[w === 'in' ? 'production' : 'opening'] += num(p.totalWeight)
    })
    notDeleted(filterDispatchesByPlants(dispatches, servingPlants)).forEach(d => {
      const w = when(d.dateOfDispatch); if (w === 'after') return
      ;(d.bundleEntries || []).forEach(e => {
        const l = line(keyOf(String(e.skuCode || '').trim()), e.skuCode)
        if (w === 'in') l.dispatch += num(e.weight)
        else l.opening -= num(e.weight)
      })
    })
  }
  const out = [...lines.values()].map(l => {
    const closing = l.opening + l.production - l.dispatch
    return stockKnown ? { ...l, closing }
      : { ...l, opening: null, production: null, dispatch: null, closing: null }
  }).filter(l => SALES_GRID_MEASURES.some(m => Math.abs(num(l[m.key])) > EPS))
  return { lines: out.sort(salesGridOrder), stockKnown }
}

// SHS, RHS, CHS, then anything else; sizes by their numbers; thickness ascending. A line whose
// size could not be read sorts last and still counts — never dropped.
const sizeNumbers = (s) => (String(s).match(/\d+(?:\.\d+)?/g) || []).map(Number)
const sectionRank = (s) => { const i = SALES_GRID_SECTIONS.indexOf(s); return i < 0 ? (s ? 3 : 4) : i }
export function salesGridOrder(a, b) {
  const [a1 = Infinity, a2 = 0] = sizeNumbers(a.size), [b1 = Infinity, b2 = 0] = sizeNumbers(b.size)
  return sectionRank(a.section) - sectionRank(b.section) || a1 - b1 || a2 - b2
    || (a.thickness ?? Infinity) - (b.thickness ?? Infinity) || String(a.skuCode).localeCompare(String(b.skuCode))
}

// The filters' options, read off the UNFILTERED lines so a dropdown never empties itself.
export function salesGridOptions(lines) {
  const sizes = [...new Map((lines || []).filter(l => l.size).map(l => [l.size, l])).values()].sort(salesGridOrder).map(l => l.size)
  return {
    sections: SALES_GRID_SECTIONS.filter(s => (lines || []).some(l => l.section === s)),
    sizes,
    thicknesses: [...new Set((lines || []).map(l => l.thickness).filter(t => t != null))].sort((a, b) => a - b),
  }
}

// Lines kept by the Section / Size / Thickness filters (an empty list = all).
export function filterSalesLines(lines, { sections = [], sizes = [], thicknesses = [] } = {}) {
  return (lines || []).filter(l => (!sections.length || sections.includes(l.section))
    && (!sizes.length || sizes.includes(l.size))
    && (!thicknesses.length || thicknesses.includes(l.thickness)))
}

// Lines → one row per section + size, a cell per thickness. Every SKU of one size and thickness
// adds into one cell; row, column and grand totals are sums of the same lines, so they tie to the
// SKU list exactly. A null (stock unknown) stays null through every sum.
export function salesSizePivot(lines) {
  const add = (acc, l) => SALES_GRID_MEASURES.forEach(m => {
    acc[m.key] = acc[m.key] === null || l[m.key] == null ? null : (acc[m.key] || 0) + num(l[m.key])
  })
  const blank = () => Object.fromEntries(SALES_GRID_MEASURES.map(m => [m.key, 0]))
  const tkey = (t) => (t == null ? '' : String(t))
  const rows = new Map()
  const total = { cells: {}, total: blank() }
  ;(lines || []).forEach(l => {
    const rk = `${l.section}|${l.size}`
    if (!rows.has(rk)) rows.set(rk, { section: l.section, size: l.size, cells: {}, total: blank(), lines: 0 })
    const r = rows.get(rk), t = tkey(l.thickness)
    add(r.cells[t] = r.cells[t] || blank(), l); add(r.total, l); r.lines += 1
    add(total.cells[t] = total.cells[t] || blank(), l); add(total.total, l)
  })
  const thicknesses = [...new Set((lines || []).map(l => tkey(l.thickness)))]
    .sort((a, b) => (a === '' ? Infinity : Number(a)) - (b === '' ? Infinity : Number(b)))
  return { thicknesses, rows: [...rows.values()].sort(salesGridOrder), total }
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


// ── THE INVOICE IMPORT PIPELINE (ticket #190) ──────────────────────────────────────────────────
// Every rule that turns a raw One Helix invoice row into a dispatch record: `mapDispatchRow` names
// the columns, `buildDispatchRecords` applies the rest — drop Freight and quantity-less lines,
// resolve the SKU, derive pieces from weight, de-dupe per line, inherit the FIFO coil trace, group
// one record per invoice.
//
// It lives HERE rather than in App.jsx for the reason `erpRowPicker` and `plantForErpRow` above
// already do: no test in this repo can import App.jsx (module-resolution.test.js records why
// `src/lib` is the boundary), so while these rules sat there the aliases could name a column that
// does not exist and the whole suite would still pass, with every line importing blank. App.jsx
// keeps the file reading, the call and the banner — no rules.
// Distributor-name column aliases for the ERP Excel importers (dispatch + orders). Headers
// are normalised (lowercased, spaces/dots/underscores stripped) before matching, so e.g.
// "Customer Name" → customername, "Sold To Party" → soldtoparty. Broadened so a non-standard
// distributor header no longer silently imports as a blank distributor. More specific names
// come first so they win over a bare "customer".
export const DISTRIBUTOR_HEADER_ALIASES = [
  'distributorname', 'distributor', 'customername', 'customer', 'billtoname', 'billto',
  'partyname', 'party', 'consigneename', 'consignee', 'soldtoparty', 'soldtopartyname',
  'soldto', 'buyername', 'buyer', 'dealername', 'dealer', 'shiptoparty', 'shipto',
  'accountname', 'account',
]

export function mapDispatchRow(row) {
  const pick = erpRowPicker(row)
  const num = (v) => {
    if (v === '' || v === null || v === undefined) return ''
    const n = Number(String(v).replace(/[, ]/g, ''))
    return isNaN(n) ? '' : n
  }
  // "One Helix" invoice columns (case/spacing-insensitive): Invoice Date, Invoice Number,
  // Customer Name, MM ID (== SKU master skuCode), MM Description / Item Name, Quantity (MT),
  // PurchaseOrder (== the order's Child Order ID). MM ID is the authoritative SKU key when the
  // sheet carries it (the One Helix export fills it on every line); description matching stays as
  // the fallback for older sheets that omit it. No pieces column → derived from weight. Legacy
  // aliases kept so an older sheet still parses its shared fields.
  // Quantity is invoiced weight in MT (Usage unit = MT); only when the unit column clearly says
  // a piece count (NOS/PCS/…) do we treat Quantity as pieces instead.
  const unit = String(pick('usageunit', 'uom', 'unit')).trim().toUpperCase()
  const qtyIsPieces = /^(NOS?|PCS?|PC|PIECES?|EA|EACH)$/.test(unit)
  const qty = num(pick('quantity', 'invoicedqty', 'quantitymt', 'weightmt', 'weight', 'wt', 'doqty', 'netweight'))
  return {
    dateOfDispatch: toISODate(pick('invoicedate', 'dateofdispatch', 'dispatchdate', 'date')),
    invoiceNo:      String(pick('invoicenumber', 'invoiceno', 'invoice')).trim(),
    mmId:           String(pick('mmid', 'skucode', 'sku')).trim(),   // == SKU master skuCode (mirrors mapOrderRow)
    skuDescRaw:     String(pick('itemname', 'mmdescription', 'skudescription', 'description', 'item', 'product')).trim(),
    weight:         qtyIsPieces ? '' : qty,     // MT unless the unit column says pieces
    pieces:         qtyIsPieces ? qty : '',     // absent in the One Helix file → derived from weight
    customer:       String(pick(...DISTRIBUTOR_HEADER_ALIASES)).trim(),
    distributorCode: String(pick('distributorcode')).trim(),
    // Ship-to state: the Invoice sheet has NO state column, so it is decoded from the ship-to
    // GSTIN prefix (bill-to as the fallback). '' when unresolvable — counted, never guessed.
    shipToState:    resolveShipToState({
      state:     pick('shiptostate'),
      shipToGst: pick('shiptogst', 'shiptogstin', 'shiptogstno'),
      billToGst: pick('billto-gst', 'billtogst', 'billtogstin', 'gstin', 'gstno'),
    }),
    // Plant — the SAME resolver, off the SAME alias list, as the Orders sheet (ticket #119). The
    // resolver keys on the CODE, so both sheets land on one plant id and Hyderabad's invoiced
    // tonnage ties to its Invoiced Qty on the Orders side. '' when neither matched — counted on
    // the banner, never guessed at, and never a reason to fail the upload.
    plant:          plantForErpRow(row),
    grade:          String(pick('grade')).trim(),
    diameter:       num(pick('diametermm', 'diameter')),
    branchName:     String(pick('branchname', 'branch')).trim(),
    poRef:          String(pick('cfpurchasebillreferenceno', 'purchasebillreferenceno', 'billreferenceno')).trim(),
    vehicleNo:      String(pick('vehicleno', 'vehiclenumber', 'truckno', 'lorryno')).trim(),
    vehicleWeight:  num(pick('vehicleweight', 'grossweight', 'weighbridge', 'vehiclewt')),
    // Order references — link a shipment back to its order/distributor. One Helix supplies only
    // PurchaseOrder (== the order's Child Order ID); orderLineId/orderId are ERP-only.
    orderLineId:    String(pick('skuid')).trim(),                       // == orders "Sku ID" (exact per-line key, ERP only)
    orderId:        String(pick('orderid')).trim(),                     // == orders "Order ID" (ERP only)
    childOrderId:   String(pick('purchaseorder', 'childorderid')).trim(), // One Helix PurchaseOrder == orders "Child Order ID"
  }
}

// ── Build dispatch records from raw One Helix invoice rows. The whole invoice pipeline in one
// pure function: resolve + self-heal SKUs (MM ID → description → canonical key), derive pieces
// from weight, de-dupe per line, inherit the FIFO coil trace, and group one dispatch per invoice.
// Pure — the caller applies setSkus (newCatalogSkus) and setDispatches. `existing` = the
// non-deleted dispatch records dedup runs against ([] for a clean full rebuild). `catalog` and
// `makeId` are injectable for the same reason they are on `skuImportResolver`: a test needs the
// self-heal to draw on a two-row catalog and to mint ids it can predict. ──
export function buildDispatchRecords(rows, { skus, productions, existing = [], catalog = DEFAULT_SKUS, makeId = () => crypto.randomUUID() }) {
  return assembleDispatchRecords(rows.map(mapDispatchRow).filter(isProductLine),
    { skus, productions, dedupeAgainst: existing, traceAgainst: existing, catalog, makeId })
}

// A product line is one with an item description and a quantity. Freight is billed on the same
// invoice and is not a pipe; a row with neither weight nor pieces is not a shipment of anything.
export const isProductLine = (r) =>
  !!r?.skuDescRaw && !/freight/i.test(r.skuDescRaw) && !!(r.weight || r.pieces)

// ── The shared assembler both invoice sources end at. Takes lines ALREADY mapped and filtered, and
// does the part that is the same whatever file they came from: resolve + self-heal SKUs, derive
// pieces from weight, de-dupe, inherit the FIFO coil trace, group one record per invoice.
//
// The two `…Against` sets are deliberately separate, because #192 made them different answers.
//   `dedupeAgainst` — lines already stored that this batch must not import a second time.
//   `traceAgainst`  — dispatches that have already consumed production, so FIFO starts after them.
// A whole-table rebuild passes the same set for both (nothing survives, nothing has consumed).
// A WINDOWED rebuild passes [] to dedup — every line inside the window is about to be rewritten
// from the file, and dropping one because an August record resembles it would lose that tonnage —
// and the surviving out-of-window dispatches to the trace, or September would re-allocate coils
// August already shipped. ──
export function assembleDispatchRecords(parsed, { skus, productions, dedupeAgainst = [], traceAgainst = [], catalog = DEFAULT_SKUS, makeId = () => crypto.randomUUID() }) {
  if (!parsed.length) return { newRecords: [], newCatalogSkus: [], stats: { invoiceCount: 0, lineCount: 0, skippedDuplicateLines: [], unknownSkus: [], blankCustomer: 0, blankShipToState: 0, blankPlant: 0, noRows: true } }

  // SKU resolution: MM ID (== skuCode) first, then exact description, then canonical identity;
  // falling back to the static catalog (DEFAULT_SKUS) with a collision-safe self-heal. See
  // skuImportResolver in calc.js — `newCatalogSkus` is handed back for the caller to persist.
  const skuKeyOf = skuKeyResolver(skus)   // canonical identity → coil trace matches production even on a variant code
  const { resolve, newCatalogSkus } = skuImportResolver(skus, catalog, makeId)

  // Resolve each row to its SKU + weight/pieces FIRST, so the dedup key (invoiceNo | skuCode |
  // weight) is computed on the resolved code. Pieces are derived from weight (the file has none).
  const unknownSkus = new Set()
  const resolvedLines = parsed.map(r => {
    const sku = resolve(r.mmId, r.skuDescRaw)
    if (!sku) unknownSkus.add(r.skuDescRaw)
    // Unresolved lines fall back to the MM ID (a real ERP code) before the raw description, so a
    // stray line can never invent a SKU "code" that is a whole sentence.
    const skuCode = sku?.skuCode || r.mmId || r.skuDescRaw
    const wpt = Number(sku?.weightPerTube || 0)
    let pieces = Number(r.pieces || 0)
    let weight = Number(r.weight || 0)
    if (!pieces && weight && wpt) pieces = Math.round((weight * 1000) / wpt)
    if (!weight && pieces && wpt) weight = (pieces * wpt) / 1000
    return { ...r, sku, skuCode, pieces, weight }
  })

  // Per-line idempotency: skip lines already stored and lines repeated within this file.
  const { toImport, skippedDuplicateLines } = dedupeDispatchLines(dedupeAgainst, resolvedLines)

  // Build entries with an incremental FIFO coil trace (entries built so far this batch count as
  // already-dispatched, so each line draws the next production pieces).
  const builtEntries = []
  const traceCtx = () => [...traceAgainst, { id: '__batch__', deleted: false, bundleEntries: builtEntries }]
  const records = {}
  let lineCount = 0
  toImport.forEach((r) => {
    const allocs = dispatchCoilTrace(r.skuCode, r.pieces, productions, traceCtx(), null, skuKeyOf)
    const entry = {
      invoiceNo: r.invoiceNo, skuCode: r.skuCode, pieces: r.pieces, weight: r.weight,
      length: r.sku?.length || 6000, width: '', thickness: r.sku?.thickness ?? '',
      grade: r.grade || '', diameter: r.diameter || '', customer: r.customer || '',
      distributorCode: r.distributorCode || '', branchName: r.branchName || '', poRef: r.poRef || '',
      // Per-ENTRY (inside bundleEntries JSONB) — `dispatches` has no shipToState or plant column
      // and a stray top-level key makes Supabase reject the whole upsert (see
      // blueprints/import-daily-dispatch.md). Plant follows shipToState for exactly that reason.
      shipToState: r.shipToState || '', plant: r.plant || '',
      orderLineId: r.orderLineId || '', orderId: r.orderId || '', childOrderId: r.childOrderId || '',
      coilAllocations: allocs, traceHrCoilId: allocs[0]?.hrCoilId || '',
    }
    builtEntries.push(entry); lineCount++
    // One dispatch per invoice; blank-invoice fallback is index-free so re-uploads group identically.
    const key = r.invoiceNo || `__noinv__|${r.dateOfDispatch}|${String(r.customer || '').trim().toUpperCase()}`
    if (!records[key]) records[key] = {
      id: makeId(), dateOfDispatch: r.dateOfDispatch, vehicleNo: r.vehicleNo || '',
      vehicleWeight: r.vehicleWeight || '', invoiceNo: r.invoiceNo,
      bundleEntries: [], selectedBundles: [], theoreticalWeight: 0, variance: 0, deleted: false,
    }
    records[key].bundleEntries.push(entry)
  })
  // Weight/variance/selectedBundles are derived from the entries, never typed — the one helper the
  // plant filter also goes through, so an uploaded record and a filtered one can't disagree.
  const newRecords = Object.values(records).map(d => withDispatchEntries(d, d.bundleEntries))
  const blankCustomer = builtEntries.filter(e => !e.customer).length
  const blankShipToState = builtEntries.filter(e => !e.shipToState).length
  const blankPlant = builtEntries.filter(e => !e.plant).length
  return {
    newRecords, newCatalogSkus,
    stats: { invoiceCount: newRecords.length, lineCount, skippedDuplicateLines, unknownSkus: [...unknownSkus], blankCustomer, blankShipToState, blankPlant, noRows: false },
  }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// THE ZOHO INVOICE REGISTER (ticket #192) — the second upload, and every rule it applies.
//
// The operator's invoice source moved off the ERP workbook's `Invoice` sheet and onto the Zoho
// register. It is a THINNER and WIDER file: thinner because it carries no Ship From Code, no MM ID,
// no ship-to GSTIN and no order-line id; wider because it is company-wide — 6,736 rows across 44
// warehouses and every business segment, of which only the four Private Brand plants belong here.
//
// So this pipeline is a filter first and a builder second. Two things decide what survives:
//
//   Warehouse Name   resolved against the plant master. A row it cannot place is DROPPED, not
//                    stored as Unattributed, because the name is the filter — "not one of ours" and
//                    "ours but unrecognised" are the same string here and cannot be told apart.
//   Invoice Status   `Void` is dropped. The e-invoice column is NOT consulted: every `Cancelled`
//                    row in the file is already `Void`, and 53 `Void` rows are not `Cancelled`, so
//                    reading it could only ever miss rows.
//
// Dropping on a name is a real departure from ADR-0004, which chose the Ship From Code precisely
// because "name matching degrades quietly". The register has no code, so there is no choice — and
// the mitigation is that the degradation is made LOUD: `skippedByWarehouse` names every warehouse
// it skipped and what each one cost, so a warehouse renamed in Zoho reads as a named number rather
// than as a plant that silently went to zero. See docs/adr/0013.
//
// The function also decides the REBUILD WINDOW — earliest to latest invoice date across the kept
// rows — and hands it back for the caller to pass to `replaceAllRows`. Deciding it here, purely, is
// what makes "which dates get rebuilt" testable without a database. A file that qualifies nothing
// returns a null window and no records, so a wrong or empty file can never clear a period.
//
// Distributor identity, ship-to state and the order-line link are recovered from the ORDER BOOK,
// not from this file — see the #193 block further down. That is why the order book is an input here
// and why upload ORDER matters: invoices loaded into a stale or empty order book import their
// tonnage correctly and read `Unmapped`, which displays `?`. Degraded and visible, never zero.
// ══════════════════════════════════════════════════════════════════════════════════════════════

// The one status that means "this paperwork was cancelled": the row is not a shipment and its
// tonnage must never consume finished-goods stock. Compared case-folded — a re-cased export must
// not start importing void invoices.
export const ZOHO_VOID_STATUS = 'void'

// The statuses the register is known to carry on a real invoice. Anything else is imported anyway —
// refusing an unfamiliar status would silently lose tonnage — and counted, so an unfamiliar one is
// something the operator reads on the day rather than discovers in a month-end reconciliation.
export const ZOHO_EXPECTED_STATUSES = ['overdue', 'open', 'closed', 'approved']

// ── Grade, out of the item name ────────────────────────────────────────────────────────────────
// The ERP Invoice sheet had a `Grade` column; the register does not, and the item name is the only
// place the grade appears ("MS RHS One Helix IS 4923 **YSt 210** Black 75x25x2x6000"). Read, never
// defaulted: a blank grade is a fact about the row, and stamping every line `YSt 210` because that
// is what today's catalogue happens to be would make a second grade invisible on the day it ships.
export function gradeFromDescription(desc) {
  const m = /\bY\s?St\.?\s*\d+\b/i.exec(String(desc ?? ''))
  return m ? m[0].replace(/\s+/g, ' ').trim() : ''
}

// ── One register row → the shape the assembler takes ───────────────────────────────────────────
// Most of the register's columns are ones `mapDispatchRow` already names (Invoice Date, Invoice
// Number, Customer Name, Item Name, Quantity + its unit), so this delegates rather than repeating
// them — one alias list, two sources, no drift. It adds the two columns the ERP sheet never had:
// the warehouse (kept RAW as well as resolved, because the banner has to name what it skipped) and
// the invoice status. Grade comes off the item name, since the register carries no grade column.
export function mapInvoiceRow(row, index = DEFAULT_PLANT_INDEX) {
  const pick = erpRowPicker(row)
  const base = mapDispatchRow(row)
  return {
    ...base,
    // Re-resolved against the caller's index, not `base.plant`, so a test (and a future stored
    // plant master) can hand in its own. `mapDispatchRow` already resolved against the default one;
    // overwriting rather than re-running it keeps this to one resolution per row on a 6,736-row file.
    plant:         index === DEFAULT_PLANT_INDEX ? base.plant : plantForErpRow(row, index),
    warehouse:     String(pick('warehousename', 'warehouse')).trim(),
    invoiceStatus: String(pick('invoicestatus', 'status')).trim(),
    grade:         base.grade || gradeFromDescription(base.skuDescRaw),
  }
}

// Tally rows by a key, newest counts first, as `[{ <label>: key, rows: n }]` sorted biggest first
// then alphabetically — so a banner reads the same twice for the same file.
const tallyBy = (items, keyOf, label) => {
  const counts = new Map()
  items.forEach(it => { const k = keyOf(it); counts.set(k, (counts.get(k) || 0) + 1) })
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])))
    .map(([k, n]) => ({ [label]: k, rows: n }))
}

// ── One window, one predicate ──────────────────────────────────────────────────────────────────
// A closed interval of ISO dates, both ends inclusive. Every "is this row inside the window?" in
// the app goes through here — the pipeline picking which dispatches survive, the banner counting
// what it left alone, and `db.js` re-seeding state after a windowed replace. Three copies of a
// date comparison is three chances to disagree about which month a row belongs to, and the one
// thing the whole windowed rebuild rests on is that they cannot.
//
// An undated row is inside NO window. That is the same answer PostgREST gives (`gte`/`lte` are
// both false against NULL), and `db.js`'s `fetchLiveIds` relies on it: a row with no date belongs
// to no period and must never be swept up by one. ──
export function inDateWindow(date, dateWindow) {
  if (!dateWindow?.from || !dateWindow?.to) return false
  const d = String(date ?? '')
  if (!d) return false
  return d >= dateWindow.from && d <= dateWindow.to
}

// ── How much dispatch history a window leaves alone ────────────────────────────────────────────
// The banner's "nothing was lost" claim, as a number the operator can read rather than assume.
// A null window means the whole table is being rebuilt, so nothing is outside it. Soft-deleted
// records are already gone and are not history that survives. ──
export function dispatchLinesOutsideWindow(dispatches, dateWindow) {
  if (!dateWindow?.from || !dateWindow?.to) return { lines: 0, weight: 0 }
  let lines = 0, weight = 0
  ;(dispatches || []).filter(d => !d.deleted).forEach(d => {
    if (inDateWindow(d.dateOfDispatch, dateWindow)) return
    ;(d.bundleEntries || []).forEach(e => { lines++; weight += Number(e.weight || 0) })
  })
  return { lines, weight: Number(weight.toFixed(3)) }
}

// ══════════════════════════════════════════════════════════════════════════════════════════════
// WHO A ZOHO LINE SHIPPED TO (ticket #193) — distributor, ship-to state and the order-line link.
//
// The register is anonymous where it matters. It carries no distributor code, no ship-to GSTIN and
// no per-line order id, so an imported line knows WHAT shipped and FROM WHERE but not to WHOM, to
// WHICH STATE, or AGAINST WHICH ORDER. Three things need those: `salesByDistributor`, the service-
// area rule in docs/adr/0006, and the Invoiced / Pending columns on the Orders tab.
//
// All three are recoverable from the ORDER BOOK, because the register's `PurchaseOrder` is the
// order's Child Order ID and is filled on every line. Two routes, in this order:
//
//   1. Child order → the order book. The line takes that order's distributor code, distributor
//      name and ship-to state. The order LINE — and so the id that nets invoiced tonnage against
//      the right line — needs `(child order, item name)`, because one child order carries several
//      sizes and matching on the child order alone would net every size against the first one.
//   2. No child-order match → the SFDC code glued to the end of `Customer Name`, remainder as the
//      name. State and order-line id stay BLANK. On the 17-Sep file: 247 lines by route 1, 5 by
//      route 2, none left over.
//
// State is never guessed — not from a name, not from a city, not from a pincode. A line that
// resolves to nothing stores nothing, is counted on the banner, and its distributor reads
// `Unmapped` and displays `?`. Unknown is not empty (docs/adr/0006).
//
// Because every one of these facts comes out of the order book, uploading invoices into a STALE or
// EMPTY order book produces a screen full of `Unmapped`. `lowOrderMatch` is the detector and the
// banner says so in words, naming the Order Excel as the fix.
//
// KNOWN FRAGILITY: route 1's line match is a STRING join on the item name. `(Child Order ID, MM
// Description)` is unique across all 1,791 order rows, so the key is sound — but if Zoho's item
// name ever drifts from the ERP's description for the same product, those lines stop matching and
// their tonnage reappears as pending. `unmatchedOrderLines` on the banner is the detector.
// ══════════════════════════════════════════════════════════════════════════════════════════════

// A Salesforce account id: the 3-character key prefix `001`, then 12 more, then the optional
// 3-character checksum suffix that makes it 18. Every `Distributor Code` in the order book is one
// of these. Anchored on `001` rather than on "18 alphanumerics" deliberately — the code is GLUED to
// the end of the name with no separator to anchor on, so a looser pattern would start eating the
// tail of any distributor whose name happens to end in a long unbroken word.
const SFDC_CODE_RE = /^(.*?)\s*(001[0-9A-Za-z]{12}(?:[0-9A-Za-z]{3})?)\s*$/

// Split `Customer Name` into the SFDC code stuck on its end and the name in front of it. No code →
// the whole string is the name and the code is blank. Never throws, never guesses.
export function splitSfdcCustomer(value) {
  const raw = String(value ?? '').replace(/\s+/g, ' ').trim()
  const m = SFDC_CODE_RE.exec(raw)
  if (!m) return { code: '', name: raw }
  return { code: m[2], name: m[1].replace(/[\s,.\-|/]+$/, '').trim() }
}

// The item name as a join key: whitespace collapsed and case folded, so "75x25x2x6000" written with
// a double space in one export still finds its order line in the other. Nothing else is normalised
// — the two files spell the product the same way or they do not match, and `unmatchedOrderLines`
// is what makes the difference visible rather than something that quietly half-works.
const descKey = (desc) => String(desc ?? '').replace(/\s+/g, ' ').trim().toUpperCase()

// Parts joined with U+0001 so a child order id ending in the delimiter could never straddle it —
// the same guard `dispatchLineKey` uses for the same reason.
const childDescKey = (cid, desc) => `${cid}${descKey(desc)}`

// ── The order book, indexed the two ways an invoice line needs it ──────────────────────────────
// `byChild`    child order id → the order's distributor + state. First non-blank wins per field, so
//              one blank `Ship to State` among a child order's lines cannot blank the whole order.
// `byChildDesc` child order id + item name → that exact order line's ids. Named for the DESCRIPTION
//              it keys on: the register carries no code, and `skuCode` is a different and real
//              thing a few functions up.
// Soft-deleted orders are not the order book and are skipped.
export function invoiceOrderIndex(orders) {
  const byChild = new Map(), byChildDesc = new Map()
  ;(orders || []).filter(o => !o?.deleted).forEach(o => {
    const cid = String(o.childOrderId || '').trim()
    if (!cid) return
    const at = byChild.get(cid) || { distributorCode: '', customer: '', shipToState: '' }
    at.distributorCode = at.distributorCode || String(o.distributorCode || '').trim()
    at.customer        = at.customer        || String(o.customer || '').trim()
    at.shipToState     = at.shipToState     || String(o.shipToState || '').trim()
    byChild.set(cid, at)

    const dk = descKey(o.description)
    if (!dk) return
    const lineKey = childDescKey(cid, o.description)
    if (byChildDesc.has(lineKey)) return              // first line wins; the pair is unique in practice
    byChildDesc.set(lineKey, {
      orderLineId: String(o.lineId || '').trim(),
      orderId:     String(o.orderId || '').trim(),
    })
  })
  return { byChild, byChildDesc }
}

// ── One mapped invoice line + the order book → who it shipped to ───────────────────────────────
// Did the order book know this child order at all? ────────────────────────────────────────────
// The banner's order-match rate counts THIS, not the presence of a distributor name — route 2 also
// produces a name, and counting names would report a forgotten Order Excel as a healthy upload. One
// implementation, called from both places that ask it: `attributeInvoiceLine` picking a route, and
// the stats pass, which has to re-ask on the entries that were actually written (step 8). ──
export const childOrderMatched = (idx, childOrderId) => idx.byChild.has(String(childOrderId || '').trim())

// ── One mapped invoice line + the order book → who it shipped to ─────────────────────────────────
// Returns only the fields attribution owns, for the caller to merge over the mapped row.
//
// Every field falls back the same way, and the ORDER of the fallbacks is the point:
//   the ORDER BOOK — the ticket's answer, and what keeps identity agreeing with the order side
//                    instead of being re-derived from a string;
//   the ROW's own  — whatever `mapInvoiceRow` already read off the file. Blank on today's register,
//                    which carries none of these columns. It is here because this function
//                    OVERWRITES the mapped row, so forcing `''` would mean that the day Zoho adds a
//                    state or a distributor-code column, attribution starts DELETING a fact the file
//                    supplied. Preferring the order book is right; erasing the file is not;
//   the SFDC code  — parsed out of `Customer Name`, weakest because it is a name being read as data,
//                    so a real column beats it.
// What none of them supplies stays blank and is counted. Nothing is guessed at any step. ──
export function attributeInvoiceLine(line, idx) {
  const cid = String(line?.childOrderId || '').trim()
  const order = childOrderMatched(idx, cid) ? idx.byChild.get(cid) : null
  const own = splitSfdcCustomer(line?.customer)
  const rowCode  = String(line?.distributorCode || '').trim()
  const rowState = String(line?.shipToState || '').trim()
  const rowLine  = String(line?.orderLineId || '').trim()
  const rowOrder = String(line?.orderId || '').trim()
  if (order) {
    // The order line needs the item name as well: one child order carries several sizes, and
    // netting all of them against the first line's id would credit the wrong line.
    const hit = idx.byChildDesc.get(childDescKey(cid, line?.skuDescRaw))
    return {
      // A matched order with a BLANK code is not an answer, so it must not erase one the line had.
      distributorCode: order.distributorCode || rowCode || own.code,
      customer:        order.customer || own.name,
      shipToState:     order.shipToState || rowState,
      orderLineId:     hit?.orderLineId || rowLine,
      orderId:         hit?.orderId || rowOrder,
    }
  }
  // Route 2: no child order in the book. The name is all there is, so the code comes out of it.
  return { distributorCode: rowCode || own.code, customer: own.name, shipToState: rowState, orderLineId: rowLine, orderId: rowOrder }
}

// Below this share of imported lines matching the order book, the banner stops reporting and starts
// warning. The 17-Sep file matches 247 of 252 (98%); a stale or empty order book matches 0. 80%
// sits far below the healthy case and far above the broken one, so a few genuinely older invoices
// cannot trip it but a forgotten Order Excel always does.
export const MIN_ORDER_MATCH_RATE = 0.8

// ── The whole invoice upload, as one pure function ─────────────────────────────────────────────
// `dispatches` is the LIVE dispatch store, not a filtered view: the records dated outside the
// window survive the rebuild, so they are what the FIFO coil trace must start after. `orders` is
// the LIVE order book, unfiltered for the same reason — an upload made while the header is filtered
// to one plant must still attribute every other plant's lines (ticket #193). Returns the records to
// write, the window to write them into, the SKUs the caller should persist, and the stats the
// banner prints. ──
export function buildInvoiceDispatches(rows, { skus, productions, dispatches = [], orders = [], catalog = DEFAULT_SKUS, makeId = () => crypto.randomUUID(), plants = DEFAULT_PLANTS }) {
  const index = plantIndex(plants)
  const mapped = (rows || []).map(r => mapInvoiceRow(r, index))

  // 1. The warehouse filter. It runs FIRST — before the product-line filter, not after — because
  //    this tally is the ONLY detector for a warehouse renamed in Zoho (docs/adr/0013), and a
  //    detector that skips a warehouse's freight and zero-quantity rows is one that can miss a
  //    rename outright. Every row from an unrecognised warehouse is counted under its name.
  const placed = mapped.filter(r => r.plant)
  const skippedByWarehouse = tallyBy(mapped.filter(r => !r.plant),
    r => r.warehouse || '(blank)', 'warehouse')

  //    Product lines only, and only now: freight is billed on the same invoice and is not a pipe,
  //    so it must not reach the Void tonnage below or the records built at the end.
  const products = placed.filter(isProductLine)

  // 2. Void. Dropped, and counted with its tonnage so the file's own total can be reconciled
  //    against what the app took.
  const isVoid = (r) => String(r.invoiceStatus).trim().toLowerCase() === ZOHO_VOID_STATUS
  const voided = products.filter(isVoid)
  const alive = products.filter(r => !isVoid(r))

  // 3. An undated row is inside no window, so a later rebuild of this period could never supersede
  //    it — importing it would double-count on the next upload. Dropped, and counted.
  const dated = alive.filter(r => r.dateOfDispatch)
  const undatedRows = alive.length - dated.length

  // 4. An unfamiliar status is imported and flagged — see ZOHO_EXPECTED_STATUSES.
  const unusualStatuses = tallyBy(
    dated.filter(r => !ZOHO_EXPECTED_STATUSES.includes(String(r.invoiceStatus).trim().toLowerCase())),
    r => r.invoiceStatus || '(blank)', 'status')

  // 5. The window: earliest to latest across exactly the rows that are about to be written. Rows
  //    the filters dropped cannot widen it — a dropped March row must not rebuild March.
  const dates = dated.map(r => r.dateOfDispatch).sort()
  const dateWindow = dates.length ? { from: dates[0], to: dates[dates.length - 1] } : null

  const skipped = {
    skippedByWarehouse,
    voidRows: voided.length,
    voidWeight: Number(voided.reduce((s, r) => s + Number(r.weight || 0), 0).toFixed(3)),
    undatedRows,
    unusualStatuses,
  }
  if (!dateWindow) {
    return {
      newRecords: [], newCatalogSkus: [], window: null,
      stats: { invoiceCount: 0, lineCount: 0, skippedDuplicateLines: [], unknownSkus: [], blankCustomer: 0, blankShipToState: 0, blankPlant: 0, orderMatchedLines: 0, unmatchedOrderLines: 0, lowOrderMatch: false, noRows: true, ...skipped },
    }
  }

  // 6. Attribution (ticket #193): distributor, ship-to state and the order-line link, out of the
  //    order book via `PurchaseOrder`, with the SFDC code in `Customer Name` as the fallback. It
  //    runs BEFORE the assembler, not after, because these are per-LINE facts and the assembler is
  //    where a line becomes an entry — attributing afterwards would mean reaching back into a built
  //    record to patch it. What it cannot resolve it leaves blank, and the blanks are counted below.
  const orderIdx = invoiceOrderIndex(orders)
  const attributed = dated.map(r => ({ ...r, ...attributeInvoiceLine(r, orderIdx) }))

  // 7. Everything from here is the shared assembler. Dedup is within-file only and the coil trace
  //    starts after the dispatches the window will NOT touch — see assembleDispatchRecords.
  const survivors = (dispatches || []).filter(d => !d.deleted && !inDateWindow(d.dateOfDispatch, dateWindow))
  const built = assembleDispatchRecords(attributed, {
    skus, productions, dedupeAgainst: [], traceAgainst: survivors, catalog, makeId,
  })

  // 8. The attribution counts are taken off the ENTRIES THAT WERE WRITTEN, not off the rows read,
  //    so every figure on the banner shares one denominator with `lineCount`. A line dropped as a
  //    within-file duplicate is not a line the operator has to chase.
  const entries = built.newRecords.flatMap(d => d.bundleEntries || [])
  const orderMatchedLines = entries.filter(e => childOrderMatched(orderIdx, e.childOrderId)).length
  // Keyed on the STORED id, not on whether the (child, description) lookup hit: what the banner is
  // reporting is unlinked TONNAGE, and an order line found but carrying no `lineId` of its own
  // links nothing either. `shippedByOrderLine` nets on exactly this field, so this count and
  // what the Orders tab can actually match are the same question.
  const unmatchedOrderLines = entries.filter(e => !e.orderLineId).length
  return {
    ...built,
    window: dateWindow,
    stats: {
      ...built.stats, ...skipped, orderMatchedLines, unmatchedOrderLines,
      // A file whose lines mostly miss the order book is the symptom of a stale or empty one. It is
      // a warning, not a failure: the tonnage is real and importing it is still right.
      lowOrderMatch: entries.length > 0 && (orderMatchedLines / entries.length) < MIN_ORDER_MATCH_RATE,
    },
  }
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
  // Admin-only (#275): the planning master, and later the monthly and weekly campaigns (#248).
  { key: 'productionPlanning', label: 'Production Planning' },
  { key: 'reports', label: 'Reports' },
]

// The three shop-floor stages. Offered only to a plant that actually manufactures — `manufactures`
// in the plant master is the single flag that decides it, exactly as ADR-0004 promised, so taking
// a plant back off the shop floor is still a one-line change there and not an edit here. Every
// plant on the master carries it since #156, so this list currently hides nothing from anyone;
// that is the flag being inert, not absent, and it bites the day a fifth plant lands.
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

// Admin-only tabs: Reports builds the company-wide workbooks; Production Planning (#275) is the
// admin's plan for every plant, and plants get their plan from the admin as they do today. It is
// deliberately NOT gated on `manufactures` — it is hidden from every plant login, full stop.
const ADMIN_ONLY_TABS = ['reports', 'productionPlanning']

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

// ── PLANT-WISE TRACKER (ticket #174) ─────────────────────────────────────────────────────────────
// One pure function behind the Dashboard's Plant-wise Tracker: it returns the WHOLE finished grid —
// blocks, rows, day columns and MTD cells, already reconciled and already ordered — so the component
// and the CSV export read the same structure and neither performs any arithmetic. That is what keeps
// the seam count at one for every figure on that screen.
//
// The rows follow the steel: coil → strip → pipe, with each STOCK row printed directly under the
// FLOW that fills it, so a change in a stock row has its cause on the line above it.
const TRACKER_ROWS = [
  { key: 'coilInward', label: 'Coil Inward', kind: 'flow' },
  { key: 'coilStock', label: 'Coil Stock', kind: 'stock' },
  { key: 'slitting', label: 'Slitting', kind: 'flow' },
  { key: 'slitStock', label: 'Slit Stock', kind: 'stock' },
  { key: 'rmAvailability', label: 'RM Availability', kind: 'stock' },
  { key: 'rmConsumed', label: 'RM Consumed', kind: 'flow' },
  { key: 'openingInventory', label: 'Opening Inventory', kind: 'stock' },
  { key: 'production', label: 'Production', kind: 'flow' },
  { key: 'dispatch', label: 'Dispatch', kind: 'flow' },
  { key: 'currentInventory', label: 'Current Inventory', kind: 'stock' },
]

// The five dated event streams the grid is replayed from. Everything else in TRACKER_ROWS is a
// running balance over these, which is what makes every column reconcile on its own.
const TRACKER_FLOWS = ['coilInward', 'slitting', 'rmConsumed', 'production', 'dispatch']

// Below a rounded 0.1 T the grid prints 0.0 anyway, so warning about tonnage under it would be
// warning about a cell nobody can see. Half of that display precision is the threshold.
const TRACKER_EPS_MT = 0.05

// Does this cell print nothing? A FLOW cell with no activity renders as a faint dash on screen and
// as an empty field in the CSV, so stillness reads differently from activity at a glance. A STOCK
// cell ALWAYS prints its number, even unchanged day to day — a blank there would read as "we do not
// know", the same unknown-vs-empty confusion the Unmapped rule forbids elsewhere. It lives here, and
// not in either caller, because the screen and the export must not be able to drift apart on it.
export const trackerCellBlank = (row, value) => row?.kind === 'flow' && !value

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The day columns of a month, NEWEST FIRST — yesterday sits next to the MTD summary and today is
// never scrolled to. The current month stops at today (a screen two-thirds blank is a screen nobody
// reads); a past month runs to its last day; a future month has no columns at all rather than
// throwing. All arithmetic is in UTC so a browser east or west of the plant reads the same grid.
function trackerDays(month, today) {
  const key = String(month ?? '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(key)) return []
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7))
  if (m < 1 || m > 12) return []
  const lastOfMonth = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const todayKey = String(today ?? '').slice(0, 7)
  let upto = lastOfMonth
  if (key === todayKey) upto = Math.min(lastOfMonth, Number(String(today).slice(8, 10)) || 0)
  else if (todayKey && key > todayKey) upto = 0
  const out = []
  for (let d = upto; d >= 1; d--) out.push(`${key}-${String(d).padStart(2, '0')}`)
  return out
}

// "2026-09-05" → "5-Sep". Short enough that 31 of them fit across without a horizontal scroll on a
// laptop, and unambiguous about the month when a screenshot outlives the session it was taken in.
export function trackerDayLabel(iso) {
  const s = String(iso ?? '')
  if (s.length < 10) return s
  return `${Number(s.slice(8, 10))}-${MONTH_ABBR[Number(s.slice(5, 7)) - 1] ?? '??'}`
}

// Three years is as far back as either dropdown will ever usefully go, and it stops a stray 1970
// date from rendering six hundred options.
const MONTH_OPTIONS_CAP = 36

// The months a set of dates actually covers, newest first, from the earliest date through the month
// `today` falls in. Shared by the Dashboard's own period picker and the tracker's month dropdown, so
// the two offer the same months and neither can drift into offering a month with nothing in it.
export function dataMonthKeys(dates, today) {
  const todayKey = String(today ?? '').slice(0, 7)
  const present = (dates || []).filter(Boolean).map(d => String(d).slice(0, 7)).filter(k => /^\d{4}-\d{2}$/.test(k))
  const minKey = present.length ? present.reduce((a, b) => (a < b ? a : b)) : todayKey
  if (!/^\d{4}-\d{2}$/.test(todayKey)) return []
  const out = []
  const d = new Date(todayKey + '-01T00:00:00Z')
  const floor = new Date(minKey + '-01T00:00:00Z')
  while (d >= floor && out.length < MONTH_OPTIONS_CAP) {
    out.push(d.toISOString().slice(0, 7))
    d.setUTCMonth(d.getUTCMonth() - 1)
  }
  return out
}

// The five dated event streams behind the Plant-wise Tracker, one row per event: `{ plant, flow,
// date, weight }`. It is the ONE definition of what counts as Coil Inward, Slitting, RM Consumed,
// Production and Dispatch, and at which plant — the tracker buckets it into day columns and the
// Dashboard's stock movement (#232) sums it over From → To, so the two cannot replay the steel two
// ways. `keyOf` maps a row to its plant key (the caller decides what an unknown id becomes).
function trackerEvents({ coils = [], babyCoils = [], productions = [], dispatches = [], keyOf }) {
  const out = []
  const add = (plant, flow, date, n) => out.push({ plant, flow, date: String(date ?? '').slice(0, 10), weight: Number(n || 0) })
  ;(coils || []).filter(c => !c?.deleted).forEach(c =>
    add(keyOf(c), 'coilInward', c.dateOfInward, c.actualWeight))

  const liveBaby = (babyCoils || []).filter(b => !b?.deleted)
  liveBaby.forEach(b => add(keyOf(b), 'slitting', b.dateOfConversion, b.weight))

  // RM Consumed is **baby coil** weight, and a baby coil goes into ONE production run (ADR-0015):
  // the day a live production is first assigned to it, the WHOLE coil leaves slit stock — its full
  // slit weight, not the weight that production took. What is left on it is counted as used, so
  // there is no leftover to bridge anywhere and Slit Stock replays to `babyCoilStock` on every day.
  // The event sits at the BABY COIL's plant (where the slitting event is), on the earliest date of
  // a live production naming it; an undated production counts as earliest, as in the opening
  // balance. A coil several productions name (history before ADR-0015) leaves once, on the first.
  // Only allocations naming a baby coil still on the register count — a legacy mother-only
  // allocation (no `babyCoilId`, pre-slitting) never came out of a baby coil at all.
  const firstUse = new Map()
  ;(productions || []).filter(p => !p?.deleted).forEach(p => {
    add(keyOf(p), 'production', p.dateOfProduction, p.totalWeight)
    const d = String(p.dateOfProduction ?? '').slice(0, 10)
    ;(p.coilAllocations || []).forEach(a => {
      const id = a?.babyCoilId
      if (id == null || id === '') return
      if (!firstUse.has(id) || d < firstUse.get(id)) firstUse.set(id, d)
    })
  })
  liveBaby.forEach(b => {
    if (firstUse.has(b.babyCoilId)) add(keyOf(b), 'rmConsumed', firstUse.get(b.babyCoilId), b.weight)
  })

  // A dispatch record has no plant of its own — each ENTRY carries one, because one invoice can ship
  // from more than one plant. Same rule filterDispatchesByPlant applies.
  ;(dispatches || []).filter(d => !d?.deleted).forEach(d =>
    (d.bundleEntries || []).forEach(e => add(keyOf(e), 'dispatch', d.dateOfDispatch, e?.weight)))
  return out
}

// The whole grid.
//
//   coils/babyCoils/productions/dispatches — the raw stores, UNFILTERED by the header plant
//     selector. A plant-wise comparison scoped to one plant is not a comparison.
//   plants  — the plant master; it fixes both which blocks exist and the order they read in.
//   month   — 'YYYY-MM', the section's own dropdown, not the Dashboard's period picker.
//   today   — 'YYYY-MM-DD'; decides where the current month's columns stop.
//   plant   — null for the whole company (TOTAL + every plant). A plant id collapses the grid to
//             that one block with NO TOTAL, which is what a plant login gets: a total that is one
//             plant's numbers repeated is noise, and the other plants' tonnage never enters here.
//
// STOCK IS REPLAYED, NOT SNAPSHOTTED. Every other stock figure in the app is computed "as of now";
// these rows are rebuilt from coil inward dates, baby-coil conversion dates, production dates and
// invoice dates, so a column headed 4-Sep shows the position on 4-Sep. See docs/adr/0011-* for what
// that reconstruction can and cannot know.
export function plantTrackerGrid({
  coils = [], babyCoils = [], productions = [], dispatches = [],
  plants = DEFAULT_PLANTS, month = '', today = '', plant = null,
} = {}) {
  const days = trackerDays(month, today)          // newest first, as rendered
  const asc = [...days].reverse()                 // oldest first, as replayed
  const monthStart = asc[0] || `${String(month).slice(0, 7)}-01`
  const lastDay = asc.length ? asc[asc.length - 1] : null
  const todayIso = String(today ?? '').slice(0, 10)

  const master = (plants || []).filter(Boolean)
  const known = new Set(master.map(p => p?.id))
  // An id the master does not know is the SAME answer as a blank one: Unattributed. Resolving it to
  // anything else would file a plant's tonnage under a neighbour.
  const keyOf = (rowLike) => { const k = storedPlant(rowLike); return known.has(k) ? k : '' }

  const emptyBucket = () => ({
    open: Object.fromEntries(TRACKER_FLOWS.map(k => [k, 0])),
    day: Object.fromEntries(TRACKER_FLOWS.map(k => [k, {}])),
  })
  const acc = new Map()
  const bucket = (k) => { if (!acc.has(k)) acc.set(k, emptyBucket()); return acc.get(k) }
  // Dated events land in a day column, before-the-month events in the opening balance.
  const add = (k, flow, date, n) => {
    const v = Number(n || 0)
    if (!v) return
    const b = bucket(k)
    const d = String(date ?? '').slice(0, 10)
    // An UNDATED row goes into the opening balance rather than nowhere. It cannot be placed on a
    // day, but the tonnage exists and the Dashboard cards count it — dropping it would make the
    // last column quietly disagree with them. In the opening it is invisible in the flow rows and
    // correct in the stock rows, which is the honest half of what is known about it.
    if (!d || d < monthStart) { b.open[flow] += v; return }
    if (lastDay && d <= lastDay) { b.day[flow][d] = (b.day[flow][d] || 0) + v; return }
    // A row dated AFTER the last shown day is nowhere on a PAST month's grid — it hadn't happened
    // yet by that month's close, and belongs to a later month's own opening balance instead. On
    // the CURRENT month, though, the last shown day IS today, so "after it" cannot be a later
    // month arriving on schedule — it is a clock-skew or data-entry date past today. The tonnage
    // is still known to exist, the same fact the undated case above rests on, so it lands on the
    // LAST day rather than vanishing, which is what keeps this row's tie to the Dashboard cards.
    if (lastDay && lastDay === todayIso) b.day[flow][lastDay] = (b.day[flow][lastDay] || 0) + v
  }

  trackerEvents({ coils, babyCoils, productions, dispatches, keyOf })
    .forEach(e => add(e.plant, e.flow, e.date, e.weight))

  // Slit Stock needs no offset (ADR-0015): RM Consumed takes each baby coil out WHOLE on the day
  // it is first assigned, so slitting − RM consumed IS the unassigned coils, on every day, and the
  // last column lands on `babyCoilStock` — the Dashboard's "Baby Coils Left" card.

  const rowsFor = (k) => {
    const b = acc.get(k) || emptyBucket()
    const cells = Object.fromEntries(TRACKER_ROWS.map(r => [r.key, {}]))
    let coilStock = b.open.coilInward - b.open.slitting
    let slitCum = b.open.slitting - b.open.rmConsumed
    let onHand = b.open.production - b.open.dispatch
    asc.forEach(d => {
      const ci = b.day.coilInward[d] || 0, sl = b.day.slitting[d] || 0, rc = b.day.rmConsumed[d] || 0
      const pr = b.day.production[d] || 0, di = b.day.dispatch[d] || 0
      const opening = onHand
      coilStock += ci - sl
      slitCum += sl - rc
      onHand += pr - di
      const slitStock = slitCum
      cells.coilInward[d] = ci
      cells.coilStock[d] = coilStock
      cells.slitting[d] = sl
      cells.slitStock[d] = slitStock
      cells.rmAvailability[d] = coilStock + slitStock
      cells.rmConsumed[d] = rc
      cells.openingInventory[d] = opening
      cells.production[d] = pr
      cells.dispatch[d] = di
      cells.currentInventory[d] = onHand
    })
    return TRACKER_ROWS.map(r => ({ ...r, cells: cells[r.key], mtd: mtdOf(r, cells[r.key]) }))
  }

  // One column, two kinds of arithmetic — which is why the grid distinguishes stock rows visually
  // and the footnote states the rule. A FLOW sums the month. A STOCK takes its LATEST CLOSE (today
  // for the current month, month-end for a past one), because a month's worth of closing balances
  // added together is not a number that means anything. Opening Inventory is the exception on
  // purpose: its MTD cell is the month's OPENING, which is the "opening inventory of the month"
  // figure the feature was asked for and is otherwise nowhere on the grid.
  function mtdOf(r, c) {
    if (r.kind === 'flow') return asc.reduce((s, d) => s + (c[d] || 0), 0)
    if (!asc.length) return 0
    return r.key === 'openingInventory' ? c[asc[0]] : c[asc[asc.length - 1]]
  }

  const scoped = plant != null && plant !== ALL_PLANTS
  const plantBlocks = (scoped ? [plant] : master.map(p => p.id))
    .map(id => ({ id, name: plantLabel(id, master), isTotal: false, rows: rowsFor(id) }))

  const sumRows = (blocks) => TRACKER_ROWS.map((r, i) => ({
    ...r,
    cells: Object.fromEntries(asc.map(d => [d, blocks.reduce((s, b) => s + b.rows[i].cells[d], 0)])),
    mtd: blocks.reduce((s, b) => s + b.rows[i].mtd, 0),
  }))

  const blocks = scoped ? plantBlocks
    : [{ id: 'total', name: 'TOTAL (all plants)', isTotal: true, rows: sumRows(plantBlocks) }, ...plantBlocks]

  // TOTAL is the sum of the four plant blocks and there is no Unattributed block — a knowing
  // departure from the DATA-MODEL rule that Unattributed stays inside every total, taken because it
  // is 0 T today and ten permanent rows of zeros is a real cost on a fifty-row grid. This is the
  // tripwire for the day that stops being true: whatever TOTAL is leaving out, named per row, so the
  // section can never silently disagree with the Dashboard cards above it.
  // Only the FLOW rows, and only their month sums. Two reasons, both of them acceptance criteria:
  //   · A stock row's MTD is its LATEST CLOSE, which carries in from earlier months — reporting it
  //     would make a clean month raise the alarm over an orphan inwarded in August.
  //   · The stock rows are DERIVED from the flows, so naming them too announces one orphaned 7 T
  //     coil three times (Coil Inward, Coil Stock, RM Availability) and reads as 21 T.
  // The flows are the events, they are what the month actually excluded, and they are additive.
  const excludedRows = scoped ? [] : rowsFor('')
    .filter(r => r.kind === 'flow' && Math.abs(r.mtd) > TRACKER_EPS_MT)
    .map(r => ({ key: r.key, label: r.label, amount: r.mtd }))

  return {
    month: String(month ?? '').slice(0, 7),
    today: todayIso,
    days,
    columns: [{ key: 'mtd', label: 'MTD', isMtd: true }, ...days.map(d => ({ key: d, label: trackerDayLabel(d) }))],
    blocks,
    excluded: excludedRows.length ? { rows: excludedRows } : null,
  }
}

// ═══════════════════════════════════════════════════════════════
// PLANT SPLIT + SERVABLE SUMMARY — moved here verbatim from `reports.js` (ticket #232) so the
// Dispatch tab's `dispatchOverview` can compose them without pulling the lazily-loaded reports
// chunk into the main bundle. `reports.js` re-exports both, so every script and test that imports
// them from there is unchanged. The helpers below are the same one-liners `reports.js` defines.
// ═══════════════════════════════════════════════════════════════
const EPS = 0.0005 // MT — treat anything below as zero (rounding noise)
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const notDeleted = (rows) => (rows || []).filter(r => !r.deleted)
const dashMonthKey = (d) => String(d || '').slice(0, 7)
const today = () => new Date().toISOString().slice(0, 10)
const REGION_ORDER = [...REGIONS, UNMAPPED_REGION]
const regionRank = (r) => { const i = REGION_ORDER.indexOf(r); return i < 0 ? REGION_ORDER.length : i }

// ── THE PER-PLANT SPLIT (ticket #127) ───────────────────────────────────────────────────────────
// The workbook keeps every total it reports today and gains a breakdown beneath it. No headline
// number moves: the All Plants Pending to Dispatch stays at the figure it has always printed, and
// the per-plant rows are a PARTITION of it, never a replacement. Scoping the report to Hyderabad would
// drop that headline by 1854 MT overnight with nothing changed in the business — so the total
// stays, and the split explains it.
//
// It also makes visible something the reports have always done and never said: they compare FOUR
// plants' Pending to Dispatch against ONE plant's Invoiced. Only Hyderabad has ever invoiced.
// `invoicing` below is that label, DERIVED from the rows rather than hardcoded — the day NPMD
// raises its first invoice the label says so by itself.
//
// Two axes, two sources, both from the ERP and neither typed:
//   • PENDING comes from the ORDER row's own `plant` (#118).
//   • INVOICED comes from the DISPATCH ENTRY's `plant` (#119) — `dispatches` has no plant column,
//     one invoice could in principle carry lines from two plants, so it can only be per-entry.
//
// Every figure is computed by `salesKpis` over `filterByPlant` / `filterDispatchesByPlant` — the
// same composition the header's plant selector uses (calc.test.js asserts it reproduces 761.441 MT
// of the 2615.441 MT All Plants total). Re-deriving the arithmetic here would buy a second answer
// that could disagree with the selector, which is the one thing the split may not do.
//
// `Unattributed` is a real row with real tonnage, exactly as `Unmapped` is on the region split: a
// line the ERP labelled with a company nobody has mapped is a labelling gap, never a reason for
// weight to leave a total. An unknown plant id folds into it rather than opening a row of its own,
// so the id space of the master is the only thing that can produce a named row.
export function buildPlantMtdSummary(orders, dispatches, { date = today(), master = PLANTS } = {}) {
  const D = date, MONTH = dashMonthKey(D)

  // Same predicate buildMtdDashboardData uses for invoicedMtd: the month, capped at D. The cap is
  // what makes the rows tie to the Dashboard's INVOICED MTD card rather than to a later total.
  const live = notDeleted(dispatches)
  const upToD = live.filter(d => dashMonthKey(d.dateOfDispatch) === MONTH && d.dateOfDispatch <= D)
  const liveOrders = notDeleted(orders)

  // The stored plant values actually PRESENT — never the master's four. A plant with nothing is not
  // rendered as a zero row (there is nothing to say about it), and a value the master does not know
  // still gets counted, under Unattributed. Read off live rows only, so a deleted row cannot
  // conjure a row for a plant that has nothing left.
  const keys = plantKeysIn(liveOrders)
  upToD.forEach(d => plantKeysIn(d.bundleEntries).forEach(k => keys.add(k)))

  // One `salesKpis` call per stored value, then folded onto the row it displays as: a known id is
  // its own row, everything else (blank, or an id off the master) merges into Unattributed. The
  // fold is what keeps the rows summing to the company total even when the ERP sends a fifth
  // company — the alternative, two rows both labelled Unattributed, would add up and read wrong.
  const byRow = new Map()
  ;[...keys].forEach(key => {
    const ord = filterByPlant(liveOrders, key)
    const disp = filterDispatchesByPlant(upToD, key)
    const k = salesKpis(ord, disp, MONTH)
    const id = plantById(key, master) ? key : ''
    const row = byRow.get(id) || {
      plant: id, name: plantLabel(id, master),
      invoicedMtd: 0, confirmed: 0, nonConfirmed: 0, pending: 0, totalOrders: 0,
      orderLines: 0, invoiceLines: 0,
    }
    row.invoicedMtd += num(k.mtdInvoice); row.confirmed += num(k.confirmed)
    row.nonConfirmed += num(k.nonConfirmed); row.pending += num(k.pending)
    row.totalOrders += num(k.totalOrders)
    // Line counts, not tonnage: they are what tells a plant holding orders it has not invoiced
    // (a row with a real 0) from a plant with nothing to say (no row at all).
    row.orderLines += ord.length
    row.invoiceLines += disp.reduce((t, d) => t + (d.bundleEntries || []).length, 0)
    byRow.set(id, row)
  })

  // Master order — the order plants are listed in everywhere, biggest first — then Unattributed
  // last. The same "real things, then the labelling gap" order `plantFilterOptions` and REGIONS
  // both end on.
  const rank = (id) => { const i = master.findIndex(p => p.id === id); return i < 0 ? master.length : i }
  const plants = [...byRow.values()].sort((a, b) => rank(a.plant) - rank(b.plant))

  const sum = (k) => plants.reduce((t, r) => t + r[k], 0)
  const totals = {
    invoicedMtd: sum('invoicedMtd'), confirmed: sum('confirmed'),
    nonConfirmed: sum('nonConfirmed'), pending: sum('pending'), totalOrders: sum('totalOrders'),
  }

  // The All Plants figures, computed UNGROUPED over the same rows — so the tie-out below is a real
  // second pass rather than this function summing its own arithmetic. It is the same total the
  // header's All Plants selection produces, which is why it carries that name and not "company":
  // `company` is on CONTEXT.md's avoid-list, and the row this backs is rendered `ALL PLANTS`.
  const allPlants = salesKpis(liveOrders, upToD, MONTH)
  const invoicedDiff = Math.abs(totals.invoicedMtd - num(allPlants.mtdInvoice))
  const pendingDiff = Math.abs(totals.pending - num(allPlants.pending))

  // Which plants invoice — the label, derived. Today it is Hyderabad alone, which is exactly what
  // has to appear beside a Pending figure four plants contribute to.
  //
  // Two rules, both learned the hard way:
  //   • THE MONTH IS NOT THE QUESTION. On the 1st, before the first dispatch of the month, no plant
  //     has invoiced tonnage — and that is the moment the four-against-one comparison is at its
  //     most extreme (0 invoiced against 2615 MT pending), so it is the last moment to go quiet.
  //     The month's own rows answer first; if they are silent, every live dispatch answers instead.
  //     The label describes WHO INVOICES, which is a fact about the business, not about this month.
  //   • ONLY NAMED PLANTS COUNT. `Unattributed` is a labelling gap, never a plant, so it can never
  //     be the scope of anything — "Invoiced MTD (Unattributed only)" says nothing to a reader. It
  //     also keeps every pre-#119 invoice line, which carries no plant at all, from captioning the
  //     column it appears in.
  const named = (rows) => rows.filter(r => r.plant && r.invoicedMtd > EPS).map(r => r.name)
  const everInvoiced = () => {
    const seen = new Map()
    live.forEach(d => (d.bundleEntries || []).forEach(e => {
      const id = String(e?.plant ?? '').trim()
      if (id && plantById(id, master)) seen.set(id, (seen.get(id) || 0) + num(e?.weight))
    }))
    return master.filter(p => (seen.get(p.id) || 0) > EPS).map(p => p.name)
  }
  const invoicingNames = named(plants).length ? named(plants) : everInvoiced()
  const onlyPlant = invoicingNames.length === 1 ? invoicingNames[0] : null

  // Whether the Invoiced column needs naming at all, decided ONCE and handed to the renderer as a
  // ready-made `suffix`. The renderer used to re-derive this rule at three sites, which is three
  // chances for the card, the column header and the footnote to start disagreeing about whose
  // tonnage a column holds.
  //
  // The condition is not "one plant invoices" but the thing that actually misleads a reader:
  // **Invoiced covers fewer plants than Pending does** — some plant is carrying pending tonnage and
  // has invoiced none of it. That also catches two plants invoicing out of four, which the
  // one-plant test would have let pass unlabelled.
  const label = onlyPlant ? `${onlyPlant} only` : invoicingNames.join(', ')
  const pendingOnly = plants.filter(r => r.pending > EPS && !(r.invoicedMtd > EPS))
  const needsLabel = invoicingNames.length > 0 && pendingOnly.length > 0

  return {
    date: D,
    month: MONTH,
    plants,
    totals,
    // The scope label the workbook prints wherever Invoiced sits beside multi-plant Pending.
    // `null` when every plant with orders has also invoiced — there is no mismatch to announce.
    invoicing: {
      plants: invoicingNames,
      onlyPlant,
      label,
      // The one thing the renderer appends — to the KPI card caption, the two Dashboard tables, the
      // BY PLANT column header and both distributor sheets. Empty means there is nothing to name.
      suffix: needsLabel ? ` · ${label}` : '',
      // Named separately from `suffix` because it is the sentence a reader needs, not a caption: it
      // says the comparison is four-against-one and that this is the ERP's shape, not an error.
      note: needsLabel
        ? `Invoiced MTD is ${onlyPlant ? `${onlyPlant}-only` : `limited to ${label}`} — the other plants carry orders but have never invoiced. `
          + 'Pending is every plant’s, so the two columns are not like for like.'
        : '',
    },
    // Asserted before anything is printed, exactly as the region split is: a breakdown that does not
    // add up to the headline above it is worse than no breakdown at all. Both compare against the
    // ungrouped figures above, NOT against `buildMtdDashboardData`'s KPI cards — those are derived
    // their own way, and the cross-builder comparison lives in `reports.test.js` where it belongs.
    checks: {
      invoicedTiesToAllPlants: invoicedDiff <= 0.01,
      pendingTiesToAllPlants: pendingDiff <= 0.01,
      maxAbsDiff: Math.max(invoicedDiff, pendingDiff),
      allPlantsInvoicedMtd: num(allPlants.mtdInvoice),
      allPlantsPending: num(allPlants.pending),
    },
    diagnostics: {
      // A plant holding order lines that has invoiced nothing this month. It renders as a row with
      // a zero — never dropped, and never zero-FILLED either: the row exists because the orders do.
      ordersWithoutInvoice: plants.filter(r => r.orderLines > 0 && !(r.invoicedMtd > EPS)).map(r => r.name),
      unattributedPending: byRow.get('')?.pending ?? 0,
      unattributedInvoiced: byRow.get('')?.invoicedMtd ?? 0,
      plantsPresent: plants.length,
    },
  }
}

// ── SERVABLE – UNCONFIRMED, AND THE PENDING TO DISPATCH IT FEEDS ────────────────────────────────
// The open order book has always been Confirmed + Non-confirmed. This splits the Non-confirmed half
// on a question the plant can act on today: **is the steel already on the floor?**
//
//   Servable – Unconfirmed  the part of Non-confirmed a serving plant can cover right now
//   Pending to Dispatch     Confirmed + Servable – Unconfirmed
//
// WHY THIS IS NOT `scripts/servable-orders.mjs` SUMMED UP. That report answers the question PER
// DISTRIBUTOR, and inside a service area stock is shared and reserved to nobody (ADR-0002): two
// South distributors waiting on one size both read its full tonnage as servable, correctly, and
// adding those columns invents tonnage the plant does not hold. It is the one total that report
// refuses to print, and this builder must not print it either.
//
// So the roll-up is per (REGION, SIZE) and each cell is counted ONCE. That is a different question
// — "of the demand queued on this size, how much can this area's floor cover?" — and its answer IS
// additive, because each physical pool is compared against its own demand exactly once.
//
// CONFIRMED HAS FIRST CLAIM. `freeStock` (on-hand − the area's Confirmed) already encodes that rule
// and is computed by `salesByDistributor`; Non-confirmed can only count against what Confirmed has
// left. Netting Confirmed twice — once here and once inside freeStock — would double-count it.
//
// NO NEW STOCK ARITHMETIC LIVES HERE. `onhand`, `allPending` and `freeStock` come off
// `salesByDistributor`, which is where the service-area pooling (#129, ADR-0006) is implemented and
// tested. They are region-level constants written onto every distributor row in that region, so the
// dedupe below reads each one once rather than recomputing it — a second pool builder is a second
// answer, and this figure is read on a phone where nobody can check it.
//
// `Unmapped` gets `null`, never 0. A distributor whose state carries no region has no derivable
// service area, so "how much can we serve" has no answer — and 0 would be a wrong one. Its
// Confirmed and Non-confirmed tonnage stays counted; only the servable column is unknown.
export function buildServableSummary(orders, dispatches, skus, {
  date = today(), productions = null, stateRegions = null, plants = null, distributors = null,
} = {}) {
  const D = date, MONTH = dashMonthKey(D)
  const rows = salesByDistributor(orders, dispatches, MONTH, skus,
    { productions, stateRegions, plants, distributors })

  const byRegion = new Map()
  const group = (name) => {
    let g = byRegion.get(name)
    if (!g) {
      g = {
        region: name, confirmed: 0, unconfirmed: 0,
        servableUnconfirmed: name === UNMAPPED_REGION ? null : 0,
        pendingToDispatch: 0, distributors: 0, sizesWithStock: 0,
      }
      byRegion.set(name, g)
    }
    return g
  }

  // Per-distributor tonnage IS additive — a distributor's own book is nobody else's — so Confirmed
  // and Non-confirmed are summed straight off the rows.
  rows.forEach(r => {
    const g = group(r.region || UNMAPPED_REGION)
    g.distributors += 1
    g.confirmed += num(r.confirmed)
    g.unconfirmed += num(r.nonConfirmed)
  })

  // One cell per (region, size). `onhand == null` is the Unmapped case — no pool, so nothing to
  // read; it is skipped here and reported as `null` below rather than counted as zero.
  const cells = new Map()
  rows.forEach(r => {
    const name = r.region || UNMAPPED_REGION
    ;(r.skuRows || []).forEach(s => {
      if (s.onhand == null) return
      const key = `${name} ${s.id}`
      if (cells.has(key)) return
      cells.set(key, {
        region: name, sku: s.id,
        onhand: num(s.onhand), allPending: num(s.allPending), freeStock: num(s.freeStock),
      })
    })
  })

  const shortSizes = []
  cells.forEach(c => {
    // Both derived from the pair salesByDistributor already computed, so the split cannot disagree
    // with the drill-down a sales manager opens on the same size.
    const confirmed = c.onhand - c.freeStock          // freeStock = onhand − allConfirmed
    const unconfirmed = c.allPending - confirmed      // allPending = allConfirmed + allNonConfirmed
    const servable = Math.min(unconfirmed, Math.max(0, c.freeStock))
    const g = group(c.region)
    g.servableUnconfirmed += servable
    g.sizesWithStock += 1
    if (unconfirmed - servable > EPS) {
      shortSizes.push({
        region: c.region, sku: c.sku, unconfirmed,
        freeStock: Math.max(0, c.freeStock), short: unconfirmed - servable,
      })
    }
  })

  byRegion.forEach(g => {
    // Unknown servable ⇒ unknown Pending to Dispatch. Carrying Confirmed alone would read as a
    // complete answer for a region whose stock question nobody can answer yet.
    g.pendingToDispatch = g.servableUnconfirmed == null ? null : g.confirmed + g.servableUnconfirmed
  })

  // A region with no tonnage and no stocked size has nothing to say — same rule as a plant with no
  // rows. This is NOT the `Unmapped` suppression the non-negotiables forbid: an Unmapped region
  // holding real tonnage still prints, still reads `?`, and still keeps that tonnage in the book.
  // What is dropped is the empty row `salesByDistributor` can raise for a distributor resolved off
  // an invoice with no order book behind it.
  const regions = [...byRegion.values()]
    .filter(g => g.confirmed > EPS || g.unconfirmed > EPS || g.sizesWithStock > 0)
    .sort((a, b) => regionRank(a.region) - regionRank(b.region) || a.region.localeCompare(b.region))

  const sum = (k) => regions.reduce((t, g) => t + num(g[k]), 0)
  const totals = {
    confirmed: sum('confirmed'),
    unconfirmed: sum('unconfirmed'),
    // Only the regions that HAVE an answer contribute. `diagnostics.unmappedUnconfirmed` carries
    // what is missing, so the gap is stated rather than absorbed into a total as a zero.
    servableUnconfirmed: sum('servableUnconfirmed'),
    pendingToDispatch: sum('pendingToDispatch'),
  }

  // Second method: the ungrouped book, straight off `salesKpis` — no distributor identity, no
  // region, no pools. If the grouped sums and this disagree, a distributor's tonnage went missing
  // in the grouping, and the caller must refuse to print rather than publish a smaller book.
  const book = salesKpis(notDeleted(orders), notDeleted(dispatches), MONTH)
  const confirmedDiff = Math.abs(totals.confirmed - num(book.confirmed))
  const unconfirmedDiff = Math.abs(totals.unconfirmed - num(book.nonConfirmed))
  const unmapped = byRegion.get(UNMAPPED_REGION)

  return {
    date: D,
    month: MONTH,
    regions,
    totals,
    checks: {
      confirmedTiesToBook: confirmedDiff <= 0.01,
      unconfirmedTiesToBook: unconfirmedDiff <= 0.01,
      maxAbsDiff: Math.max(confirmedDiff, unconfirmedDiff),
      bookConfirmed: num(book.confirmed),
      bookUnconfirmed: num(book.nonConfirmed),
      // Servable can never exceed the Non-confirmed it is carved out of. A breach means the cell
      // dedupe read a pool twice, which is precisely the ADR-0002 fiction this builder exists to
      // avoid — so it is asserted, not assumed.
      servableWithinUnconfirmed: totals.servableUnconfirmed <= totals.unconfirmed + 0.01,
    },
    diagnostics: {
      // Non-confirmed tonnage whose servable share is unknowable because its region is not mapped.
      // Never folded into the totals as zero — map the state on the Sales tab and it resolves.
      unmappedUnconfirmed: unmapped ? unmapped.unconfirmed : 0,
      unmappedDistributors: unmapped ? unmapped.distributors : 0,
      // How many regions could answer the servable question at all. ZERO means the workbook's
      // Pending to Dispatch is UNKNOWN, not zero — `totals` sums only the regions that have an
      // answer, so with none it reads a confident 0 that means the opposite of what it says.
      regionsAnswering: regions.filter(g => g.servableUnconfirmed != null).length,
      // Sizes ordered for more than the area's free stock, biggest gap first — the production list.
      shortSizes: shortSizes.sort((a, b) => b.short - a.short),
      sizesWithStock: cells.size,
    },
  }
}

// ═══════════════════════════════════════════════════════════════
// DISPATCH OVERVIEW — the Dispatch tab's 10 am "Scoreboard" (ticket #232, part 1; screen 3a of the
// P&T Dashboard Pack v5). One pure builder; the component and every CSV read what it returns and do
// no arithmetic of their own, so a screen and its export cannot disagree.
//
// NO NEW MEANINGS. Every figure is a CONTEXT.md term computed by the function that already owns it:
//   Indent            Invoiced MTD + Confirmed + Non-confirmed            (salesKpis)
//   Invoiced MTD      the month's invoices, capped at D                   (salesKpis over the plant's entries)
//   Confirmed         netted against matched invoices, ADR-0014           (liveConfirmed via salesKpis)
//   Pending to Serve  Confirmed + Non-confirmed — the WIDE figure
//   Pending to Dispatch  Confirmed + Servable – Unconfirmed, ADR-0008     (buildServableSummary)
//   Oldest pending    days from `order_date` to D of the oldest line still holding netted Confirmed
//
// TWO GROUPINGS, AND WHY THEY DIFFER (#229). The plant table groups the order book by the ERP's
// ship-from PLANT (ADR-0004); the region tiles group it by the distributor's REGION (ADR-0006). A
// line booked on a plant that does not serve its distributor's region is OUT OF AREA (CONTEXT.md):
// it stays in both totals, nothing is moved between regions, and the screen STATES it — beside each
// plant's Confirmed and in the reconciliation line under the tiles. On 30-Oct-2026: plant Confirmed
// 308.1 = South 180.6 + West 127.5, with 77.3 T booked out of area.
//
// ONE NETTING RULE FOR THE WHOLE SCREEN. Confirmed is netted against every invoice up to D — the
// rule the Dashboard headline, the Sales tab and `buildServableSummary` follow. `buildPlantMtdSummary`
// nets only against the month's invoices, which can read a few tonnes higher on a line Zoho billed
// last month while the ERP still lags; composing it here would break "plant Confirmed = Σ region
// Confirmed". So the plant rows are built from the same primitives it uses (`salesKpis` over
// `filterByPlant` / `filterDispatchesByPlant`), with the full netting, and `checks` asserts the tie.
//
// SCOPING (#230). The plant table is a COMPARISON block: an admin's `compareOrders` /
// `compareDispatches` are the unfiltered stores whatever the header says; a plant login's are its
// pinned stores, with `comparePlant` set so the table collapses to that one row and drops Total.
// Every other block — tiles, reconciliation, Short, distributors — reads `orders` / `dispatches` /
// `productions`, the header-scoped stores, exactly as the Sales tab does.
//
// `productions` must already be live-weight-resolved (`resolveProductionWeights`), the contract
// `salesByDistributor` and `buildServableSummary` carry.
// ═══════════════════════════════════════════════════════════════

// The pack's proposed thresholds (#225), one named constant each. Changing one after sign-off is a
// one-line change; until then every screen using them prints `DISPATCH_THRESHOLDS_CAPTION`.
export const DISPATCH_OLDEST_PENDING_RED_DAYS = 3     // R: oldest pending > 3 d
export const DISPATCH_INVOICED_RATIO_AMBER = 0.9      // A: Invoiced ÷ Indent < 90%
export const DISPATCH_THRESHOLDS_CAPTION = 'Thresholds: proposed'
// The Short list shows this many sizes per region before "show all" (#228: 98 were short on 30-Oct).
export const DISPATCH_SHORT_TOP_N = 10

// Whole days from an ISO date to D, floored at 0. `null` for a missing or unparseable date — an
// unknown age is not a zero age.
export function daysSinceIso(fromIso, toIso) {
  const a = String(fromIso ?? '').slice(0, 10), b = String(toIso ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b)) return null
  const d = Math.round((Date.parse(b) - Date.parse(a)) / 86400000)
  return Number.isFinite(d) ? Math.max(0, d) : null
}

// 3a status. Red outranks amber; nothing to judge is green. Both inputs may be null (no Confirmed
// line ⇒ no oldest; no Indent ⇒ no ratio), and a null never triggers a colour.
export function dispatchStatus({ oldestPendingDays = null, invoicedRatio = null } = {}) {
  if (oldestPendingDays != null && oldestPendingDays > DISPATCH_OLDEST_PENDING_RED_DAYS) return 'red'
  if (invoicedRatio != null && invoicedRatio < DISPATCH_INVOICED_RATIO_AMBER) return 'amber'
  return 'green'
}

// One pass over a book's open lines that still hold netted Confirmed: per ship-from plant, the
// out-of-area tonnage and the oldest line; per distributor, the oldest line. The distributor's region
// comes from the SAME resolver `salesByDistributor` uses, built over the same rows, so a line is out
// of area here exactly when the Sales tab files its distributor under a region its plant does not
// serve. An `Unmapped` distributor's line is neither in nor out of area — its region is unknown — and
// is counted apart as `unmappedConfirmed` rather than guessed.
function confirmedLineBook(orders, dispatches, { D, master, stateRegions, distributors }) {
  const shipped = shippedByOrderLine(dispatches)
  const idx = distributorOrderIndex(orders)
  const regionOf = distributorRegionResolver(orders, dispatches, stateRegions, idx, distributors)
  const byPlant = new Map(), byDistributor = new Map()
  let undatedLines = 0
  const older = (e, days, date) => {
    if (days == null) return
    if (e.oldestPendingDays == null || days > e.oldestPendingDays) { e.oldestPendingDays = days; e.oldestPendingDate = date }
  }
  ;(orders || []).filter(o => !o.deleted && !isDeliveredStatus(o.orderStatus)).forEach(o => {
    const c = liveConfirmed(o, shipped)
    if (!(c > EPS)) return
    const plant = storedPlant(o)
    const { key } = resolveDistributorIdentity(o, idx, false)
    const region = regionOf(key).region
    const days = daysSinceIso(o.orderDate, D)
    if (days == null) undatedLines += 1
    const date = String(o.orderDate ?? '').slice(0, 10)

    const p = byPlant.get(plant) || { confirmed: 0, outOfArea: 0, outOfAreaLines: 0, unmappedConfirmed: 0, oldestPendingDays: null, oldestPendingDate: '' }
    p.confirmed += c
    const serves = plantById(plant, master)?.serves
    if (region === UNMAPPED_REGION) p.unmappedConfirmed += c
    else if (serves && !serves.some(r => regionKey(r) === regionKey(region))) { p.outOfArea += c; p.outOfAreaLines += 1 }
    older(p, days, date)
    byPlant.set(plant, p)

    const d = byDistributor.get(key) || { oldestPendingDays: null, oldestPendingDate: '' }
    older(d, days, date)
    byDistributor.set(key, d)
  })
  const sum = (k) => [...byPlant.values()].reduce((t, p) => t + p[k], 0)
  return {
    byPlant, byDistributor, undatedLines,
    totals: { confirmed: sum('confirmed'), outOfArea: sum('outOfArea'), outOfAreaLines: sum('outOfAreaLines'), unmappedConfirmed: sum('unmappedConfirmed') },
  }
}

export function dispatchOverview({
  orders = [], dispatches = [], productions = [], skus = [],
  compareOrders = null, compareDispatches = null, comparePlant = null,
  stateRegions = null, plants = null, distributors = null,
  date = today(),
} = {}) {
  const D = String(date).slice(0, 10), MONTH = dashMonthKey(D)
  const master = plantMaster(plants)
  // The book AS OF D: an invoice dated after D has not happened yet, for the netting as much as for
  // Invoiced MTD. With D = today (the screen) this is every live invoice.
  const asOf = (ds) => notDeleted(ds).filter(d => String(d.dateOfDispatch || '') <= D)
  const ratio = (inv, indent) => indent > EPS ? inv / indent : null

  // ── 1. Plant table — the comparison block ─────────────────────────────────────────────────────
  const cOrders = notDeleted(compareOrders ?? orders), cDisp = asOf(compareDispatches ?? dispatches)
  const cBook = confirmedLineBook(cOrders, cDisp, { D, master, stateRegions, distributors })
  const plantRow = (key, ord, disp, invoiceDisp, extra) => {
    const k = salesKpis(ord, disp, MONTH)
    const invoicedMtd = num(salesKpis([], invoiceDisp, MONTH).mtdInvoice)
    const confirmed = num(k.confirmed), nonConfirmed = num(k.nonConfirmed)
    const pendingToServe = confirmed + nonConfirmed
    const indent = invoicedMtd + pendingToServe
    const row = {
      plant: key, invoicedMtd, confirmed, nonConfirmed, pendingToServe, indent,
      invoicedRatio: ratio(invoicedMtd, indent),
      orderLines: ord.filter(o => !isDeliveredStatus(o.orderStatus)).length,
      ...extra,
    }
    return { ...row, status: dispatchStatus(row) }
  }
  const areaOf = (key) => {
    const a = cBook.byPlant.get(key)
    return {
      // Unattributed has no service area, so "out of area" has no answer for it — null, never 0.
      outOfArea: key && plantById(key, master) ? (a?.outOfArea || 0) : null,
      outOfAreaLines: a?.outOfAreaLines || 0,
      oldestPendingDays: a?.oldestPendingDays ?? null,
      oldestPendingDate: a?.oldestPendingDate || '',
    }
  }
  const keys = comparePlant != null ? [comparePlant] : [...master.map(p => p.id), '']
  const plantRows = keys
    .map(key => plantRow(key, filterByPlant(cOrders, key), cDisp, filterDispatchesByPlant(cDisp, key),
      { name: plantLabel(key, master), ...areaOf(key) }))
    // Every master plant prints, a silent one included — its zero is a finding. Unattributed prints
    // only when it holds something, exactly as on the PB MTD workbook's BY PLANT block.
    .filter(r => r.plant || r.orderLines > 0 || r.invoicedMtd > EPS || r.pendingToServe > EPS)
  // Total: UNGROUPED over the same rows, so the tie-out below is a second method, not a re-sum. Only
  // for an admin — a plant login's total would be its own row repeated.
  let total = null
  if (comparePlant == null) {
    const oldest = plantRows.reduce((m, r) => r.oldestPendingDays != null && (m == null || r.oldestPendingDays > m.d) ? { d: r.oldestPendingDays, date: r.oldestPendingDate } : m, null)
    total = plantRow(ALL_PLANTS, cOrders, cDisp, cDisp, {
      name: 'Total',
      outOfArea: cBook.totals.outOfArea, outOfAreaLines: cBook.totals.outOfAreaLines,
      oldestPendingDays: oldest?.d ?? null, oldestPendingDate: oldest?.date || '',
    })
  }
  const sumRows = (k) => plantRows.reduce((t, r) => t + num(r[k]), 0)

  // ── 2. Pending to Dispatch by service area — header-scoped ────────────────────────────────────
  const sOrders = notDeleted(orders), sDisp = asOf(dispatches)
  const servable = buildServableSummary(sOrders, sDisp, skus, { date: D, productions, stateRegions, plants, distributors })
  // `buildServableSummary` already drops a region with no tonnage; an Unmapped one is stated only
  // when it holds tonnage (#228 — an empty "? T" tile is noise). With tonnage it stays, reading `?`.
  const tiles = servable.regions
    .filter(g => g.region !== UNMAPPED_REGION || g.confirmed > EPS || g.unconfirmed > EPS)
    .map(g => ({
      region: g.region, known: g.region !== UNMAPPED_REGION,
      confirmed: g.confirmed, unconfirmed: g.unconfirmed,
      servableUnconfirmed: g.servableUnconfirmed, pendingToDispatch: g.pendingToDispatch,
      distributors: g.distributors,
    }))

  // ── 3. Reconciliation — the line that makes the two halves of the screen visibly tie ─────────
  // Over the header-scoped book, so it ties to the tiles directly above it. Under All Plants (or for
  // a plant login) that is the same book as the plant table, and `plantConfirmed` equals its Total.
  const sBook = confirmedLineBook(sOrders, sDisp, { D, master, stateRegions, distributors })
  const regionConfirmed = tiles.reduce((t, g) => t + g.confirmed, 0)
  const reconciliation = {
    plantConfirmed: sBook.totals.confirmed,
    regions: tiles.map(g => ({ region: g.region, confirmed: g.confirmed })),
    regionConfirmed,
    outOfArea: sBook.totals.outOfArea,
    outOfAreaLines: sBook.totals.outOfAreaLines,
    unmappedConfirmed: sBook.totals.unmappedConfirmed,
    ties: Math.abs(sBook.totals.confirmed - regionConfirmed) <= 0.01,
  }

  // ── 4. Short — area pending − area on-hand, per (region, size), region pool (#223, #228) ──────
  // Read straight off `salesByDistributor`'s per-SKU rows, where the service-area pools are built:
  // `allPending` and `onhand` are region constants written onto every distributor row in the region,
  // so each (region, size) cell is read ONCE. An Unmapped distributor has no pool (`onhand` null) and
  // so no Short — its question has no answer, and a 0 would be a wrong one.
  const distRows = salesByDistributor(sOrders, sDisp, MONTH, skus, { productions, stateRegions, plants, distributors })
  const skuByCode = new Map((skus || []).map(s => [s.skuCode, s]))
  const cells = new Map()
  distRows.forEach(r => (r.skuRows || []).forEach(s => {
    if (s.onhand == null) return
    const key = `${r.region} ${s.id}`
    if (cells.has(key)) return
    const short = num(s.allPending) - num(s.onhand)
    if (!(short > EPS)) { cells.set(key, null); return }
    cells.set(key, {
      region: r.region, sku: s.id, skuCode: s.skuCode, description: s.description || s.skuCode,
      size: skuSizeLabel(skuByCode.get(s.skuCode), s.description),
      areaPending: num(s.allPending), areaConfirmed: num(s.allConfirmed), onhand: num(s.onhand), short,
    })
  }))
  const shortRows = [...cells.values()].filter(Boolean)
  const short = tiles.filter(g => g.known).map(g => {
    const rows = shortRows.filter(c => c.region === g.region).sort((a, b) => b.short - a.short || a.description.localeCompare(b.description))
    return { region: g.region, rows, total: rows.reduce((t, c) => t + c.short, 0) }
  }).filter(g => g.rows.length)

  // ── 5. Distributors — oldest pending first ────────────────────────────────────────────────────
  const distributorsOut = distRows
    .filter(r => num(r.confirmed) > EPS || num(r.nonConfirmed) > EPS || num(r.mtdInvoice) > EPS)
    .map(r => {
      const o = sBook.byDistributor.get(r.id)
      const row = {
        id: r.id, customer: r.customer, region: r.region, regionKnown: r.region !== UNMAPPED_REGION,
        confirmed: num(r.confirmed), nonConfirmed: num(r.nonConfirmed), invoicedMtd: num(r.mtdInvoice),
        indent: num(r.totalOrders), invoicedRatio: ratio(num(r.mtdInvoice), num(r.totalOrders)),
        oldestPendingDays: o?.oldestPendingDays ?? null, oldestPendingDate: o?.oldestPendingDate || '',
      }
      return { ...row, status: dispatchStatus(row) }
    })
    .sort((a, b) => (b.oldestPendingDays ?? -1) - (a.oldestPendingDays ?? -1)
      || b.confirmed - a.confirmed || String(a.customer).localeCompare(String(b.customer)))

  const plantConfirmedDiff = total ? Math.abs(sumRows('confirmed') - total.confirmed) : 0
  const plantInvoicedDiff = total ? Math.abs(sumRows('invoicedMtd') - total.invoicedMtd) : 0
  return {
    date: D, month: MONTH,
    thresholds: { caption: DISPATCH_THRESHOLDS_CAPTION, oldestPendingRedDays: DISPATCH_OLDEST_PENDING_RED_DAYS, invoicedRatioAmber: DISPATCH_INVOICED_RATIO_AMBER },
    plants: { rows: plantRows, total, collapsed: comparePlant != null },
    regions: { tiles, totals: servable.totals },
    reconciliation,
    short: { topN: DISPATCH_SHORT_TOP_N, regions: short },
    distributors: distributorsOut,
    checks: {
      plantsTieToTotal: plantConfirmedDiff <= 0.01 && plantInvoicedDiff <= 0.01,
      regionsTieToBook: reconciliation.ties,
      servable: servable.checks,
    },
    diagnostics: { undatedConfirmedLines: cBook.undatedLines },
  }
}

// ═══════════════════════════════════════════════════════════════
// INVENTORY OVERVIEW (ticket #232, part 2) — the Dashboard tab's screens 2a–2g
// ═══════════════════════════════════════════════════════════════

// ── Coil stock, one row per coil, with its age (#221) ───────────────────────────────────────────
// Every coil figure on the Inventory overview reads these rows, so the plant table, the grid and the
// lists cannot disagree about which coil is stock or how old it is.
//
//   mother — an UNSLIT mother coil, whole (`actualWeight`): the Dashboard's "Full Coil Left" rule
//            (#224). A mother with any live baby coil slit by `asOf` is no longer mother stock.
//   slit   — a baby coil that `babyCoilIsStock` calls stock (ADR-0015): not deleted and not yet
//            assigned to any production dated by `asOf`, at its full slit weight — so a past date
//            sees a coil as stock until the day its production was dated.
//
// AGE is days from the MOTHER's inward date, never reset by slitting (#232 story 19): a slit coil is
// as old as the steel it came from. `daysSinceSlit` is the separate clock 2d reads.
//
// `notStock` is everything the coil books hold that is not stock, with the reason, so the movement
// section can reconcile book to stock exactly: the remainder (or over-slit) on a slit mother, slit
// weight whose mother is not on the register. A slit coil has nothing to bridge (ADR-0015): an
// assigned coil leaves the slit book whole, so what is left on it is counted as used, not shown. Σ rows + Σ notStock = the tracker's Coil Stock + Slit Stock.
//
// `upto` (default `asOf`) is the last event date counted. The overview passes a far-future date when
// `asOf` is today, so a row keyed a day ahead still counts — the Plant-wise Tracker's rule (#176).
// An undated row counts as already happened, as it does in the tracker's opening balance.
export function coilAgeRows({ coils = [], babyCoils = [], productions = [], asOf = today(), upto = null } = {}) {
  const D = String(asOf).slice(0, 10), U = String(upto || D).slice(0, 10)
  const happened = (d) => { const s = String(d ?? '').slice(0, 10); return !s || s <= U }
  const iso = (d) => String(d ?? '').slice(0, 10)

  const mothers = notDeleted(coils).filter(c => happened(c.dateOfInward))
  const motherById = new Map(notDeleted(coils).map(c => [c.hrCoilId, c]))
  const babies = notDeleted(babyCoils)
  const slitByMother = new Map()
  babies.filter(b => happened(b.dateOfConversion))
    .forEach(b => slitByMother.set(b.hrCoilId, (slitByMother.get(b.hrCoilId) || 0) + num(b.weight)))
  const consumed = coilConsumption(notDeleted(productions).filter(p => happened(p.dateOfProduction)), null, 'babyCoilId')

  const rows = [], notStock = []
  const miss = (kind, reason, id, plant, weight) => { if (Math.abs(weight) > EPS) notStock.push({ kind, reason, id, plant, weight }) }

  const inwarded = new Set()
  mothers.forEach(c => {
    inwarded.add(c.hrCoilId)
    const plant = storedPlant(c), aw = num(c.actualWeight)
    if (!slitByMother.has(c.hrCoilId)) {
      rows.push({ kind: 'mother', id: c.hrCoilId, hrCoilId: c.hrCoilId, babyCoilId: '', plant,
        thickness: c.thickness ?? null, width: c.width ?? null, weight: aw,
        inwardDate: iso(c.dateOfInward), ageDays: daysSinceIso(c.dateOfInward, D), slitDate: '', daysSinceSlit: null })
      return
    }
    const rem = aw - slitByMother.get(c.hrCoilId)
    miss('mother', rem < 0 ? 'overSlit' : 'remainder', c.hrCoilId, plant, rem)
  })
  // Slit weight with no inwarded mother behind it still came off the coil books (the tracker counts
  // every live baby as Slitting), so it is named rather than lost.
  babies.filter(b => happened(b.dateOfConversion) && !inwarded.has(b.hrCoilId))
    .forEach(b => miss('mother', 'noMother', b.babyCoilId, storedPlant(b), -num(b.weight)))

  babies.forEach(b => {
    const plant = storedPlant(b), slitIn = happened(b.dateOfConversion)
    if (slitIn && babyCoilIsStock(b, consumed)) {
      const mother = motherById.get(b.hrCoilId)
      rows.push({ kind: 'slit', id: b.babyCoilId, hrCoilId: b.hrCoilId, babyCoilId: b.babyCoilId, plant,
        thickness: b.thickness || mother?.thickness || null, width: b.width ?? null, weight: babyCoilFree(b, consumed),
        inwardDate: iso(mother?.dateOfInward), ageDays: daysSinceIso(mother?.dateOfInward, D),
        slitDate: iso(b.dateOfConversion), daysSinceSlit: daysSinceIso(b.dateOfConversion, D) })
      return
    }
    // Not stock = assigned (or not yet slit). Nothing to bridge: the movement's "Used by production"
    // already takes an assigned coil out whole (ADR-0015, trackerEvents), so slit book = slit stock.
  })
  return { asOf: D, rows, notStock }
}

// ── The Inventory overview (screens 2a–2g of the P&T Dashboard Pack, #227) ──────────────────────
// One pure builder behind the Dashboard tab's top half: the component and every CSV read what it
// returns and do no arithmetic. Nothing here is a new meaning; each figure is an existing rule:
//
//   Mother / Slit coil   coilAgeRows (Full Coil Left / babyCoilStock, ADR-0015), as of To
//   FG                   producedPool per plant, canonical SKU key, positive part; the negative part
//                        is Dispatched w/o production, stated beside it — the Dashboard's identity
//   FG age / lots        skuAgeing per plant (FIFO by batch), with the pack's bands
//   Movement             trackerEvents — the Plant-wise Tracker's replay (ADR-0011) — over From → To
//   Trend                plantTrackerGrid once per month: each stock row's MTD cell is its month-end
//
// SCOPING (#230). The stock table and the movement are COMPARISON blocks, read from `compare*`:
// every plant for an admin whatever the header says, the pinned plant for a plant login, with
// `comparePlant` set so they collapse to that one row and drop Total. The drill panel and the trend
// read `coils` / `babyCoils` / `productions` / `dispatches` / `orders`, the header-scoped stores.
//
// `productions` must already be live-weight-resolved (`resolveProductionWeights`), the contract every
// FG screen carries. Ages are counted to `to`. When `to` is `today`, a row dated after it still counts
// (the tracker's rule for a clock-skewed entry, #176), so the latest figures tie to the Dashboard cards.
export const INVENTORY_THRESHOLDS_CAPTION = 'Thresholds: proposed'
// 2a status (#225): R if coil > 30 d ≥ 100 MT or FG > 75 d ≥ 25 MT; A if any of either.
export const INVENTORY_COIL_OLD_DAYS = 30
export const INVENTORY_FG_OLD_DAYS = 75
export const INVENTORY_COIL_OLD_RED_MT = 100
export const INVENTORY_FG_OLD_RED_MT = 25
// 2d: the slit coil waiting for a mill this long or more.
export const INVENTORY_SLIT_WAIT_DAYS = 8
// 2e: FG batches listed past 60 d; "Auction list" past 75 d; "Breach" past 90 d.
export const INVENTORY_FG_LIST_DAYS = 60
export const INVENTORY_FG_AUCTION_DAYS = 75
export const INVENTORY_FG_BREACH_DAYS = 90
// Age bands, as upper edges in days (the last band is open-ended).
export const INVENTORY_COIL_BANDS = [15, 30, 60]          // 0–15 / 16–30 / 31–60 / 60+
export const INVENTORY_FG_BANDS = [30, 60, 75]            // 0–30 / 31–60 / 61–75 / 75+
export const INVENTORY_SLIT_WAIT_BANDS = [3, 7]           // 0–3 / 4–7 / 8+
// Cover reads the last 30 days of Invoiced; ABC ranks the last 90 (the Inventory Snapshot's S3 / S8).
export const INVENTORY_COVER_WINDOW_DAYS = 30
export const INVENTORY_ABC_WINDOW_DAYS = 90
export const INVENTORY_TREND_MONTHS = 6

export function inventoryStatus({ coilOver30 = 0, fgOver75 = 0 } = {}) {
  if (num(coilOver30) >= INVENTORY_COIL_OLD_RED_MT - EPS || num(fgOver75) >= INVENTORY_FG_OLD_RED_MT - EPS) return 'red'
  if (num(coilOver30) > EPS || num(fgOver75) > EPS) return 'amber'
  return 'green'
}
const STATUS_RANK = { green: 0, amber: 1, red: 2 }
const worstStatus = (list) => list.reduce((w, s) => (STATUS_RANK[s] > STATUS_RANK[w] ? s : w), 'green')

// A SKU's family for the 2b grid: "40 NB" or "HxB". Numbers are normalised ("12.50x12.50" and
// "12.5x12.5" are one family) and the larger side goes first, so an RHS keyed 40x80 joins 80x40.
export function skuFamily(sku, desc) {
  const label = skuSizeLabel(sku, desc)
  const nb = label.match(/^(\d+(?:\.\d+)?) NB$/)
  if (nb) return `${Number(nb[1])} NB`
  const hb = label.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/)
  if (hb) { const [a, b] = [Number(hb[1]), Number(hb[2])]; return `${Math.max(a, b)}x${Math.min(a, b)}` }
  return label
}

// A SKU's wall thickness in mm, as a number: the SKU master's `thickness`, else the thickness in the
// description's dimension tail ("…60x40x1.60x6000" → 1.6, "…40 NB 3.2x6000" → 3.2). null when
// neither carries one — the drill grids then file it under "—", never under a guessed gauge.
export function skuThickness(sku, desc) {
  const t = Number(sku?.thickness)
  if (sku && sku.thickness !== '' && sku.thickness != null && Number.isFinite(t) && t > 0) return t
  const s = String(desc || sku?.description || '').replace(/×/g, 'x')
  const hb = s.match(/\d+(?:\.\d+)?\s*[xX*]\s*\d+(?:\.\d+)?\s*[xX*]\s*(\d+(?:\.\d+)?)\s*[xX*]\s*\d+/)
  if (hb) return Number(hb[1])
  const nb = s.match(/NB\s*[xX*]?\s*(\d+(?:\.\d+)?)\s*[xX*]\s*\d+/i)
  if (nb) return Number(nb[1])
  return null
}
// A SKU's section — SHS / RHS / CHS — from the master's productType, else the description; '—' if neither.
export function skuSection(sku, desc) {
  const v = String(sku?.productType || /\b(SHS|RHS|CHS)\b/i.exec(String(desc || sku?.description || ''))?.[1] || '').toUpperCase()
  return v || '—'
}
// Thickness sorts thin → thick, the unknown last.
const byThickness = (a, b) => (a ?? Infinity) - (b ?? Infinity)

// Adds age-band grid rows (each `{ cells: [{ weight }], total, pendingToServe? }`) into one row, the
// cell flags re-read from `bandFlags` (an empty cell is never coloured). The drill panel's filters
// rebuild a total — or a family from the thicknesses the reader kept — with this, so a filtered
// grid still adds up. `bandFlags` null = no colours (a Total row).
export function sumGridRows(rows = [], bandFlags = null, n = bandFlags ? bandFlags.length : (rows[0]?.cells.length || 0)) {
  const cells = Array.from({ length: n }, (_, i) => {
    const weight = rows.reduce((t, r) => t + num(r.cells[i]?.weight), 0)
    return { weight, flag: bandFlags && weight > EPS ? bandFlags[i] : '' }
  })
  return { cells, total: rows.reduce((t, r) => t + num(r.total), 0), pendingToServe: rows.reduce((t, r) => t + num(r.pendingToServe), 0) }
}

// The Planning master's order: SHS, RHS, CHS, then size ascending ("50x25" before "50x50" before
// "60x40"; "32 NB" before "40 NB").
const SECTION_ORDER = { SHS: 0, RHS: 1, CHS: 2 }   // = PLANNING_SECTIONS, which is declared further down
const familyDims = (f) => String(f).match(/\d+(?:\.\d+)?/g)?.map(Number) || []
const byFamily = (a, b) => {
  const da = familyDims(a), db = familyDims(b)
  for (let i = 0; i < Math.max(da.length, db.length); i++) if ((da[i] ?? -1) !== (db[i] ?? -1)) return (da[i] ?? -1) - (db[i] ?? -1)
  return String(a).localeCompare(String(b))
}

// The lower bound, in days, of band `i` of `edges` — what decides whether the whole band is past a
// threshold, so no caller has to know how many bands there are.
const bandFloor = (edges, i) => (i ? edges[i - 1] + 1 : 0)
const addDaysIso = (iso, n) => new Date(Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)
// "0–15", "16–30", … and the open band: "60+" means past 60, as the pack writes it; the slit-wait
// bands say "8+" for the same thing (past 7), so the open label can be given.
const bandLabels = (edges, open = `${edges[edges.length - 1]}+`) => edges.map((e, i) => `${i ? edges[i - 1] + 1 : 0}–${e}`).concat(open)
// Weighted mean over rows with a known age; null when nothing has one.
const weightedAge = (rows) => {
  let w = 0, a = 0
  rows.forEach(r => { if (r.ageDays != null && r.weight > 0) { w += r.weight; a += r.weight * r.ageDays } })
  return w > EPS ? a / w : null
}

// The finished-goods partition behind the Dashboard's FG figure: live productions by their OWN plant,
// invoice lines by each ENTRY's plant (dated by their invoice), cut by `happened`. One function for
// `inventoryOverview` and `planningMasterView` (#278), so "Stock now" cannot drift from the Dashboard.
function fgPartition(stores, keyOf, happened = () => true) {
  const by = new Map()
  const at = (k) => { if (!by.has(k)) by.set(k, { productions: [], entries: [] }); return by.get(k) }
  notDeleted(stores.productions).filter(p => happened(p.dateOfProduction)).forEach(p => at(keyOf(p)).productions.push(p))
  notDeleted(stores.dispatches).filter(d => happened(d.dateOfDispatch)).forEach(d =>
    (d.bundleEntries || []).forEach(e => at(keyOf(e)).entries.push({ ...e, dateOfDispatch: d.dateOfDispatch })))
  return by
}

export function inventoryOverview({
  coils = [], babyCoils = [], productions = [], dispatches = [], orders = [], skus = [],
  compareCoils = null, compareBabyCoils = null, compareProductions = null, compareDispatches = null, comparePlant = null,
  plants = null, from = '', to = '', today: todayIso = today(), drillPlant = null,
} = {}) {
  const T = String(to || todayIso).slice(0, 10)
  const F = String(from || `${T.slice(0, 7)}-01`).slice(0, 10)
  const NOW = String(todayIso).slice(0, 10)
  // The last event date counted. A future-dated row still counts when To is today (#176).
  const U = T >= NOW ? '9999-12-31' : T
  const happened = (d) => { const s = String(d ?? '').slice(0, 10); return !s || s <= U }
  const master = plantMaster(plants)
  const known = new Set(master.map(p => p.id))
  const keyOf = (rowLike) => { const k = storedPlant(rowLike); return known.has(k) ? k : '' }
  const nameOf = (k) => plantLabel(k, master)
  const skuKey = skuKeyResolver(skus)
  const skuByKey = new Map((skus || []).map(s => [skuKey(s.skuCode), s]))

  // Every store split once by plant key — shared with the planning master's Stock now (#278).
  const partition = (stores) => fgPartition(stores, keyOf, happened)
  const asDispatches = (entries) => [{ bundleEntries: entries }]
  const invoicedBetween = (entries, a, b) => entries
    .filter(e => { const d = String(e.dateOfDispatch ?? '').slice(0, 10); return d >= a && d <= b }).reduce((t, e) => t + num(e.weight), 0)
  const coverOf = (fg, inv30) => inv30 > EPS ? fg / (inv30 / INVENTORY_COVER_WINDOW_DAYS) : null
  const coverFrom = addDaysIso(T, -(INVENTORY_COVER_WINDOW_DAYS - 1))

  // FG position of one plant: positive stock, what was invoiced beyond production, surviving batches.
  const fgOf = (slice) => {
    const pool = producedPool(slice.productions, asDispatches(slice.entries), null, skuKey)
    let fg = 0, dwop = 0
    Object.values(pool).forEach(e => { const w = num(e.availableWeight); if (w > 0) fg += w; else dwop -= w })
    const ageing = skuAgeing(slice.productions, asDispatches(slice.entries), skuKey, T, { bands: INVENTORY_FG_BANDS, lots: true })
    return { pool, ageing, fg, dwop }
  }

  // ── 1. Stock as of To — the comparison block ──────────────────────────────────────────────────
  const cStores = {
    coils: compareCoils ?? coils, babyCoils: compareBabyCoils ?? babyCoils,
    productions: compareProductions ?? productions, dispatches: compareDispatches ?? dispatches,
  }
  const cCoil = coilAgeRows({ ...cStores, asOf: T, upto: U })
  const cParts = partition(cStores)
  const stockRow = (k) => {
    const rows = cCoil.rows.filter(r => keyOf(r) === k)
    const sum = (f) => rows.filter(f).reduce((t, r) => t + r.weight, 0)
    const slice = cParts.get(k) || { productions: [], entries: [] }
    const f = fgOf(slice)
    const fgOver75 = Object.values(f.ageing).reduce((t, a) => t + a.bands.reduce((u, w, i) => u + (bandFloor(INVENTORY_FG_BANDS, i) > INVENTORY_FG_OLD_DAYS ? w : 0), 0), 0)
    const invoiced30 = invoicedBetween(slice.entries, coverFrom, T)
    const row = {
      plant: k, name: k ? nameOf(k) : 'Unattributed',
      mother: sum(r => r.kind === 'mother'), slit: sum(r => r.kind === 'slit'), coil: sum(() => true),
      coilOver30: sum(r => r.ageDays != null && r.ageDays > INVENTORY_COIL_OLD_DAYS),
      avgCoilAgeDays: weightedAge(rows),
      slitWaiting8: sum(r => r.kind === 'slit' && r.daysSinceSlit != null && r.daysSinceSlit >= INVENTORY_SLIT_WAIT_DAYS),
      fg: f.fg, fgOver75, dispatchedWithoutProduction: f.dwop, invoiced30, coverDays: coverOf(f.fg, invoiced30),
      coilWeightAged: rows.filter(r => r.ageDays != null).reduce((t, r) => t + r.weight * r.ageDays, 0),
      coilWeightWithAge: rows.filter(r => r.ageDays != null).reduce((t, r) => t + r.weight, 0),
    }
    return { ...row, status: inventoryStatus(row) }
  }
  const scoped = comparePlant != null && comparePlant !== ALL_PLANTS
  const keys = scoped ? [comparePlant] : [...master.map(p => p.id), '']
  const holds = (r) => r.coil > EPS || r.fg > EPS || r.dispatchedWithoutProduction > EPS
  const stockRows = keys.map(stockRow).filter(r => r.plant || holds(r))
  let stockTotal = null
  if (!scoped) {
    const s = (k) => stockRows.reduce((t, r) => t + num(r[k]), 0)
    const wa = s('coilWeightWithAge')
    stockTotal = {
      plant: ALL_PLANTS, name: 'Total',
      mother: s('mother'), slit: s('slit'), coil: s('coil'), coilOver30: s('coilOver30'),
      avgCoilAgeDays: wa > EPS ? s('coilWeightAged') / wa : null, slitWaiting8: s('slitWaiting8'),
      fg: s('fg'), fgOver75: s('fgOver75'), dispatchedWithoutProduction: s('dispatchedWithoutProduction'),
      invoiced30: s('invoiced30'), coverDays: coverOf(s('fg'), s('invoiced30')),
      status: worstStatus(stockRows.map(r => r.status)),
    }
  }

  // ── 2. Stock movement From → To — the tracker's replay, summed over the period ────────────────
  // Opening is the close of the day before From (undated events included, as in the tracker); every
  // stage reconciles opening + in − out = closing on the BOOK, and the book is then bridged to the
  // stock in the table above by naming what is not stock (coil) or what was invoiced beyond
  // production (FG). The bridge is stated, never absorbed.
  const events = trackerEvents({ ...cStores, keyOf })
  const flows = new Map()
  const fl = (k) => {
    if (!flows.has(k)) flows.set(k, Object.fromEntries(['open', 'period'].map(w => [w, Object.fromEntries(TRACKER_FLOWS.map(f => [f, 0]))])))
    return flows.get(k)
  }
  events.forEach(e => {
    if (!e.weight) return
    if (!e.date || e.date < F) fl(e.plant).open[e.flow] += e.weight
    else if (e.date <= U) fl(e.plant).period[e.flow] += e.weight
  })
  const NOT_STOCK = { mother: ['remainder', 'overSlit', 'noMother'], slit: [] }
  const movementRow = (k, stock) => {
    const f = flows.get(k) || fl(k)
    const ns = Object.fromEntries(Object.entries(NOT_STOCK).map(([kind, reasons]) => {
      const list = cCoil.notStock.filter(n => n.kind === kind && keyOf(n) === k)
      const by = Object.fromEntries(reasons.map(r => [r, list.filter(n => n.reason === r).reduce((t, n) => t + n.weight, 0)]))
      return [kind, { ...by, total: list.reduce((t, n) => t + n.weight, 0) }]
    }))
    const stage = (opening, inn, out, notStock, stockNow) => ({ opening, in: inn, out, closing: opening + inn - out, notStock, stock: stockNow })
    return {
      plant: k, name: stock.name,
      mother: stage(f.open.coilInward - f.open.slitting, f.period.coilInward, f.period.slitting, ns.mother, stock.mother),
      slit: stage(f.open.slitting - f.open.rmConsumed, f.period.slitting, f.period.rmConsumed, ns.slit, stock.slit),
      fg: { ...stage(f.open.production - f.open.dispatch, f.period.production, f.period.dispatch, null, stock.fg),
        dispatchedWithoutProduction: stock.dispatchedWithoutProduction },
    }
  }
  const movementRows = stockRows.map(r => movementRow(r.plant, r))
  let movementTotal = null
  if (stockTotal) {
    const addStage = (key) => {
      const pick = (f) => movementRows.reduce((t, r) => t + num(f(r[key])), 0)
      const out = { opening: pick(s => s.opening), in: pick(s => s.in), out: pick(s => s.out), closing: pick(s => s.closing), stock: pick(s => s.stock) }
      return key === 'fg'
        ? { ...out, notStock: null, dispatchedWithoutProduction: pick(s => s.dispatchedWithoutProduction) }
        : { ...out, notStock: Object.fromEntries([...NOT_STOCK[key], 'total'].map(r => [r, pick(s => s.notStock[r])])) }
    }
    movementTotal = { plant: ALL_PLANTS, name: 'Total', mother: addStage('mother'), slit: addStage('slit'), fg: addStage('fg') }
  }
  const ties = (r) => Math.abs(r.mother.closing - r.mother.notStock.total - r.mother.stock) <= 0.001
    && Math.abs(r.slit.closing - r.slit.notStock.total - r.slit.stock) <= 0.001
    && Math.abs(r.fg.closing + r.fg.dispatchedWithoutProduction - r.fg.stock) <= 0.001

  // ── 4. Month-end trend — header-scoped ───────────────────────────────────────────────────────
  // A thin wrapper over the Plant-wise Tracker (#221): each stock row's MTD cell IS that month's
  // close, so one call per month gives the trend with no snapshot table (ADR-0011). Coil = Coil
  // Stock + Slit Stock (RM Availability); FG = Current Inventory, the produced − invoiced book. To's
  // own month closes on To. For a past To the stores are cut at To first, so nothing after it leaks
  // in through the tracker's late-row rule.
  const cut = (rows, dateKey) => U === '9999-12-31' ? rows : (rows || []).filter(r => happened(r[dateKey]))
  const tStores = {
    coils: cut(coils, 'dateOfInward'), babyCoils: cut(babyCoils, 'dateOfConversion'),
    productions: cut(productions, 'dateOfProduction'), dispatches: cut(dispatches, 'dateOfDispatch'),
  }
  const trendMonths = []
  for (let i = INVENTORY_TREND_MONTHS - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(Number(T.slice(0, 4)), Number(T.slice(5, 7)) - 1 - i, 1))
    trendMonths.push(d.toISOString().slice(0, 7))
  }
  const trend = trendMonths.map(month => {
    const grid = plantTrackerGrid({ ...tStores, plants: master, month, today: T })
    const sumRow = (key) => grid.blocks.filter(b => !b.isTotal).reduce((t, b) => t + num(b.rows.find(r => r.key === key)?.mtd), 0)
    return { month, label: trackerDayLabel(`${month}-01`).replace(/^1-/, ''), close: grid.days[0] || '', coil: sumRow('rmAvailability'), fg: sumRow('currentInventory') }
  })

  // ── 3. Plant drill panel — header-scoped ──────────────────────────────────────────────────────
  let drill = null
  if (drillPlant != null && drillPlant !== ALL_PLANTS) {
    const k = keyOf({ plant: drillPlant })
    const hStores = { coils, babyCoils, productions, dispatches }
    const coilRows = coilAgeRows({ ...hStores, asOf: T, upto: U }).rows.filter(r => keyOf(r) === k)
    const slice = partition(hStores).get(k) || { productions: [], entries: [] }
    const f = fgOf(slice)
    const skuByCode = new Map((skus || []).map(sk => [sk.skuCode, sk]))
    const skuOf = (code, desc) => skuByCode.get(code) || skuByKey.get(skuKey(code, desc)) || null
    const familyOf = (code, desc) => skuFamily(skuOf(code, desc), desc || skuOf(code, desc)?.description) || '—'

    const sectionOf = (code, desc) => skuSection(skuOf(code, desc), desc)
    const thicknessOf = (code, desc) => skuThickness(skuOf(code, desc), desc)

    // 2b — HR coil and slit coil, each MT by thickness × age band, in two grids (both aged from the
    // HR coil's inward date); a band past 30 d is red.
    const coilBands = bandLabels(INVENTORY_COIL_BANDS)
    const coilFlags = coilBands.map((_, i) => bandFloor(INVENTORY_COIL_BANDS, i) > INVENTORY_COIL_OLD_DAYS ? 'red' : '')
    const thkGrid = (rows) => {
      const byThk = new Map()
      rows.filter(r => r.ageDays != null).forEach(r => {
        const t = r.thickness == null || r.thickness === '' ? null : Number(r.thickness)
        if (!byThk.has(t)) byThk.set(t, new Array(coilBands.length).fill(0))
        byThk.get(t)[bandIndex(INVENTORY_COIL_BANDS, r.ageDays)] += r.weight
      })
      const gridRows = [...byThk.entries()].sort((a, b) => byThickness(a[0], b[0])).map(([thickness, w]) => ({
        thickness, cells: w.map((weight, i) => ({ weight, flag: weight > EPS ? coilFlags[i] : '' })),
        total: w.reduce((t, x) => t + x, 0),
      }))
      const sum = sumGridRows(gridRows, null, coilBands.length)
      return { bands: coilBands, bandFlags: coilFlags, rows: gridRows, totals: sum.cells.map(c => c.weight), total: sum.total }
    }

    // 2b — FG MT by SKU family × age band (FIFO batches); 61–75 d amber, 75+ red. Beside it each
    // family's Pending to Serve (Confirmed + Non-confirmed) at this plant — never "Pending to Dispatch".
    // Each family carries the same figures per thickness, the rows it opens into (they add up to it).
    const fgBands = bandLabels(INVENTORY_FG_BANDS)
    const fgFlags = fgBands.map((_, i) => bandFloor(INVENTORY_FG_BANDS, i) > INVENTORY_FG_OLD_DAYS ? 'red'
      : bandFloor(INVENTORY_FG_BANDS, i) > INVENTORY_FG_LIST_DAYS ? 'amber' : '')
    const lots = Object.values(f.ageing).flatMap(a => a.lots || [])
    const byFam = new Map()
    const blankFg = () => ({ w: new Array(fgBands.length).fill(0), pendingToServe: 0 })
    const fam = (name, section, thickness) => {
      if (!byFam.has(name)) byFam.set(name, { section, ...blankFg(), byThk: new Map() })
      const g = byFam.get(name)
      if (!g.byThk.has(thickness)) g.byThk.set(thickness, blankFg())
      return [g, g.byThk.get(thickness)]
    }
    lots.forEach(l => {
      const i = bandIndex(INVENTORY_FG_BANDS, l.ageDays)
      fam(familyOf(l.skuCode), sectionOf(l.skuCode), thicknessOf(l.skuCode)).forEach(x => { x.w[i] += l.weight })
    })
    const shipped = shippedByOrderLine(notDeleted(dispatches))
    const openOrders = notDeleted(orders).filter(o => keyOf(o) === k && !isDeliveredStatus(o.orderStatus))
    openOrders.forEach(o => {
      const p = liveConfirmed(o, shipped) + salesNum(o.nonConfirmed)
      const code = String(o.mmId || '').trim()
      if (p > EPS) fam(familyOf(code, o.description), sectionOf(code, o.description), thicknessOf(code, o.description)).forEach(x => { x.pendingToServe += p })
    })
    const fgRow = (v) => ({
      cells: v.w.map((weight, i) => ({ weight, flag: weight > EPS ? fgFlags[i] : '' })),
      total: v.w.reduce((t, x) => t + x, 0), pendingToServe: v.pendingToServe,
    })
    const fgGridRows = [...byFam.entries()].map(([family, v]) => ({
      family, section: v.section, ...fgRow(v),
      thicknesses: [...v.byThk.entries()].sort((a, b) => byThickness(a[0], b[0])).map(([thickness, t]) => ({ thickness, ...fgRow(t) })),
    })).sort((a, b) => b.total - a.total || b.pendingToServe - a.pendingToServe || a.family.localeCompare(b.family))

    // 2c / 2d — the coil lists.
    const oldCoils = coilRows.filter(r => r.ageDays != null && r.ageDays > INVENTORY_COIL_OLD_DAYS)
      .sort((a, b) => b.weight - a.weight || String(a.id).localeCompare(String(b.id)))
    const waitLabels = bandLabels(INVENTORY_SLIT_WAIT_BANDS, `${INVENTORY_SLIT_WAIT_DAYS}+`)
    const slitRows = coilRows.filter(r => r.kind === 'slit' && r.daysSinceSlit != null)
      .map(r => ({ ...r, band: waitLabels[bandIndex(INVENTORY_SLIT_WAIT_BANDS, r.daysSinceSlit)] }))
      .sort((a, b) => b.daysSinceSlit - a.daysSinceSlit || b.weight - a.weight || String(a.id).localeCompare(String(b.id)))
    const slitWaiting = {
      bands: waitLabels.map(label => { const in_ = slitRows.filter(r => r.band === label); return { label, weight: in_.reduce((t, r) => t + r.weight, 0), count: in_.length } }),
      rows: slitRows,
    }

    // 2e — FG batches past 60 d.
    const fgLots = lots.filter(l => l.ageDays > INVENTORY_FG_LIST_DAYS).map(l => ({
      ...l, description: skuOf(l.skuCode)?.description || l.skuCode, family: familyOf(l.skuCode),
      section: sectionOf(l.skuCode), thickness: thicknessOf(l.skuCode),
      flag: l.ageDays > INVENTORY_FG_BREACH_DAYS ? 'Breach' : l.ageDays > INVENTORY_FG_AUCTION_DAYS ? 'Auction list' : '',
    })).sort((a, b) => b.ageDays - a.ageDays || b.weight - a.weight || String(a.id).localeCompare(String(b.id)))

    // 2g — SKU cover, laid out as the Planning master: one row per section × size × thickness (the
    // SIZE KEY, as the Inventory Snapshot's S1 — ERP code, IS standard and length do not split a row)
    // that this plant holds, has Confirmed for, or invoiced in the last 30 days. Each canonical SKU is
    // floored at 0 before its size adds it up. Stock-out days count the days of To's month, up to To,
    // on which NO SKU of the size had produced − invoiced at this plant above zero — rebuilt from
    // dated records. ABC ranks the sizes (not the codes) by MT invoiced over the last 90 days.
    const monthStart = `${T.slice(0, 7)}-01`
    const confirmedBy = {}, inv30By = {}, inv90By = {}, codeBy = {}, descBy = {}
    openOrders.forEach(o => {
      const code = String(o.mmId || '').trim(); if (!code) return
      const kk = skuKey(code, o.description)
      confirmedBy[kk] = (confirmedBy[kk] || 0) + liveConfirmed(o, shipped)
      if (!codeBy[kk]) codeBy[kk] = code
      if (!descBy[kk] && o.description) descBy[kk] = o.description
    })
    const abcFrom = addDaysIso(T, -(INVENTORY_ABC_WINDOW_DAYS - 1))
    const daily = {}
    const delta = (kk, d, w) => { const key = !d || d < monthStart ? '' : d > T ? T : d; ((daily[kk] = daily[kk] || {})[key] = (daily[kk][key] || 0) + w) }
    slice.productions.forEach(p => { const kk = skuKey(p.skuCode); codeBy[kk] = codeBy[kk] || p.skuCode; delta(kk, String(p.dateOfProduction ?? '').slice(0, 10), num(p.totalWeight)) })
    slice.entries.forEach(e => {
      const kk = skuKey(e.skuCode), d = String(e.dateOfDispatch ?? '').slice(0, 10)
      codeBy[kk] = codeBy[kk] || e.skuCode
      delta(kk, d, -num(e.weight))
      if (d >= coverFrom && d <= T) inv30By[kk] = (inv30By[kk] || 0) + num(e.weight)
      if (d >= abcFrom && d <= T) inv90By[kk] = (inv90By[kk] || 0) + num(e.weight)
    })
    const monthDays = []
    for (let d = monthStart; d <= T; d = addDaysIso(d, 1)) monthDays.push(d)
    const coverKeys = [...new Set([...Object.keys(f.pool), ...Object.keys(confirmedBy), ...Object.keys(inv30By), ...Object.keys(inv90By)])].sort()
    const sizes = new Map()
    coverKeys.forEach(kk => {
      const fg = Math.max(0, num(f.pool[kk]?.availableWeight))
      const confirmed = confirmedBy[kk] || 0, inv30 = inv30By[kk] || 0, inv90 = inv90By[kk] || 0
      if (!(fg > EPS || confirmed > EPS || inv30 > EPS || inv90 > EPS)) return
      const sku = skuByKey.get(kk) || skuByCode.get(codeBy[kk]) || null
      const desc = sku?.description || descBy[kk]
      const section = skuSection(sku, desc), family = skuFamily(sku, desc) || '—', thickness = skuThickness(sku, desc)
      const key = `${section}|${family}|${thickness ?? ''}`
      if (!sizes.has(key)) sizes.set(key, { key, section, family, thickness, skuCodes: [], keys: [], fg: 0, confirmed: 0, invoiced30: 0, invoiced90: 0, aged: 0, agedW: 0 })
      const g = sizes.get(key)
      g.keys.push(kk); g.skuCodes.push(sku?.skuCode || codeBy[kk] || kk)
      g.fg += fg; g.confirmed += confirmed; g.invoiced30 += inv30; g.invoiced90 += inv90
      const age = f.ageing[kk]?.avgAgeDays
      if (fg > EPS && age != null) { g.aged += fg * age; g.agedW += fg }
    })
    const stockOut = (keys) => {
      const net = keys.map(kk => (daily[kk] || {})[''] || 0)
      let n = 0
      monthDays.forEach(d => {
        keys.forEach((kk, i) => { net[i] += (daily[kk] || {})[d] || 0 })
        if (net.every(v => v <= EPS)) n += 1
      })
      return n
    }
    const ranked = [...sizes.values()].filter(g => g.invoiced90 > EPS).sort((a, b) => b.invoiced90 - a.invoiced90 || a.key.localeCompare(b.key))
    const sold90 = ranked.reduce((t, g) => t + g.invoiced90, 0)
    const abcBy = {}
    let above = 0
    ranked.forEach(g => { const share = above / sold90; abcBy[g.key] = share < 0.7 ? 'A' : share < 0.9 ? 'B' : 'C'; above += g.invoiced90 })
    const skuCover = [...sizes.values()]
      .filter(g => g.fg > EPS || g.confirmed > EPS || g.invoiced30 > EPS)
      .map(g => ({
        key: g.key, section: g.section, family: g.family, thickness: g.thickness, skuCodes: g.skuCodes,
        abc: abcBy[g.key] || 'C', fg: g.fg, ageDays: g.agedW > EPS ? g.aged / g.agedW : null,
        confirmed: g.confirmed, invoiced30: g.invoiced30, coverDays: coverOf(g.fg, g.invoiced30), stockOutDays: stockOut(g.keys),
      }))
      .sort((a, b) => (SECTION_ORDER[a.section] ?? 9) - (SECTION_ORDER[b.section] ?? 9) || byFamily(a.family, b.family)
        || byThickness(a.thickness, b.thickness))

    drill = {
      plant: k, name: k ? nameOf(k) : 'Unattributed',
      hrGrid: thkGrid(coilRows.filter(r => r.kind === 'mother')),
      slitGrid: thkGrid(coilRows.filter(r => r.kind === 'slit')),
      fgGrid: (() => { const sum = sumGridRows(fgGridRows, null, fgBands.length)
        return { bands: fgBands, bandFlags: fgFlags, rows: fgGridRows, totals: sum.cells.map(c => c.weight), total: sum.total, pendingToServe: sum.pendingToServe } })(),
      oldCoils, slitWaiting, fgLots, skuCover,
      monthDays: monthDays.length,
      // Coil with no inward date has no age: in the 2a stock, in neither 2b coil grid. Named, not dropped.
      undatedCoil: coilRows.filter(r => r.ageDays == null).reduce((t, r) => t + r.weight, 0),
    }
  }

  return {
    from: F, to: T, today: NOW,
    thresholds: {
      caption: INVENTORY_THRESHOLDS_CAPTION, coilOldDays: INVENTORY_COIL_OLD_DAYS, fgOldDays: INVENTORY_FG_OLD_DAYS,
      coilOldRedMt: INVENTORY_COIL_OLD_RED_MT, fgOldRedMt: INVENTORY_FG_OLD_RED_MT, slitWaitDays: INVENTORY_SLIT_WAIT_DAYS,
      fgListDays: INVENTORY_FG_LIST_DAYS, fgAuctionDays: INVENTORY_FG_AUCTION_DAYS, fgBreachDays: INVENTORY_FG_BREACH_DAYS,
      coverWindowDays: INVENTORY_COVER_WINDOW_DAYS, abcWindowDays: INVENTORY_ABC_WINDOW_DAYS,
    },
    stock: { rows: stockRows, total: stockTotal, collapsed: scoped },
    movement: { rows: movementRows, total: movementTotal },
    drill,
    trend,
    checks: { movementTiesToStock: movementRows.every(ties) },
  }
}

// ── COIL TRACKER — raw-material stock by age (ticket #241, docs/adr/0016-*) ──────────────────────
// The ONE view function behind the Coil Tracker's stock screen, modelled on plantTrackerGrid: the
// (already plant-scoped) stores and a fixed `today` go in, the finished table rows come out, and the
// component renders them without doing any arithmetic. Later tickets extend this same function
// (the plant × band matrix, the trace) so the matrix, the tables and the trace read ONE stock rule.
//
// Two ageing clocks (ADR-0016):
//   · an unslit mother coil is aged from its INWARD date — how long it has waited to be slit
//   · a baby coil in stock is aged from its SLITTING date — how long it has been available to produce
//     from. Never from its mother's inward date: a coil slit last week is not 180 days old.
// Three bands on fixed edges: 0–30 days Clear · 31–60 Watch · 61+ Act. A coil with no (or an
// unreadable, or future) date is "No date" — kept and shown, never dropped: unknown is not new.
export const AGE_BANDS = ['Act', 'Watch', 'Clear']
export const NO_DATE_BAND = 'No date'

// Whole days from an ISO date to `today` (both 'YYYY-MM-DD'), counted on calendar dates so no clock
// or time zone moves the answer. null when either date is missing or unreadable — and when the date
// is AFTER today: a coil inwarded tomorrow is a typing error, and a negative age would otherwise
// fall into Clear and read as the freshest stock on the floor.
function ageInDays(iso, today) {
  const day = (v) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v ?? '').trim())
    if (!m) return null
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    return Number.isNaN(t) ? null : t / 86400000
  }
  const from = day(iso), to = day(today)
  if (from == null || to == null) return null
  const age = Math.round(to - from)
  return age < 0 ? null : age
}

const ageBand = (age) => age == null ? NO_DATE_BAND : age <= 30 ? 'Clear' : age <= 60 ? 'Watch' : 'Act'

// Oldest first. An undated row sorts ABOVE every dated one — its age could be anything, and bad
// data belongs where it is seen. Ties broken by coil ID so the order never depends on input order.
const oldestFirst = (a, b) => {
  if (a.age == null || b.age == null) {
    if (a.age == null && b.age != null) return -1
    if (b.age == null && a.age != null) return 1
  } else if (a.age !== b.age) return b.age - a.age
  return String(a.id).localeCompare(String(b.id))
}

//   coils/babyCoils/productions — the stores, ALREADY scoped by the header plant selector or the
//     plant login (the app filters once, DATA-MODEL "Applied to"). This function adds no plant
//     logic: every row carries the plant stored on its own record, so plants are never mixed.
//   today   — 'YYYY-MM-DD'. An input, never read from the clock here, so tests are fixed in time.
//   plants  — the plant master, for display names and the matrix's row order.
//   dispatches / selectedCoilId — the invoice store and the mother coil whose trace is open (ticket
//             #243). `trace` comes back null until a coil is selected; see the block below.
//   cell    — the matrix cell the viewer clicked, or null for "show all" (ticket #242):
//             { plant, kind, band }, each null/absent meaning "all". `plant` is the STORED plant id
//             ('' = Unattributed, which is a real row, not "all"); `kind` is 'unslit' | 'baby';
//             `band` is a band name. It narrows BOTH tables to the plant and band, and a `kind`
//             hides the other table. The matrix is always built from the UNFILTERED rows, so
//             clicking a cell never changes the matrix itself.
export const STOCK_KINDS = [['unslit', 'HR coil (unslit)'], ['baby', 'Slit coil']]

// ── Thickness buckets (ticket #265) ────────────────────────────────────────────────────────────
// The stock-by-plant table opens each plant into these standard thicknesses. A coil goes to the
// NEAREST standard by its own thickness (never a pipe's); an exact tie goes UP to the heavier
// standard (half-up, as Excel ROUND). Below 1.2 → 1.2, above 5.0 → 5.0. Returns null — the
// "No thickness" row — for a blank, zero or unreadable thickness: unknown is never dropped.
// 6.0 is its own standard: a 6 mm coil cannot roll a 5 mm pipe, so folding it into 5.0 overstated
// 5.0 stock (79.2 T on 10-Nov-2026). Ties still go up, so 5.5 → 6.0 and 5.4 → 5.0.
export const THICKNESS_BUCKETS = [1.2, 1.6, 2.0, 2.5, 3.0, 4.0, 5.0, 6.0]
// Ties are judged with a tolerance far below a 0.1 mm gauge step, so float noise (1.4 − 1.2 is
// 0.19999999999999996) cannot tip a true tie down.
const BUCKET_TIE_EPS = 1e-6
export function thicknessBucket(thickness) {
  // The same nearest-and-heavier-on-a-tie rule the planning master bands with (#278).
  return thicknessBand(thickness, THICKNESS_BUCKETS)
}

// CSV of the stock-by-plant table (ticket #265): EVERY plant row with all its bucket rows, then All
// plants and its buckets — independent of what is expanded on screen, which is display state only.
// Weights at 3 decimals like the other Coil Tracker CSVs; a blank on screen ("–") is an empty cell.
const STOCK_BY_PLANT_CSV_HEADER = ['Plant', 'Thickness', 'HR coil T', 'HR coil # of coils', 'Slit coil T',
  'Slit coil # of coils', 'Total T', 'Avg age (days)', 'Produced 30d T', 'Days of cover']
export function stockByPlantCsv(stockByPlant) {
  const t = (part) => part.empty ? '' : fmtT3(part.weight)
  const n = (part) => part.empty ? '' : String(part.count)
  const line = (plantName, thk, r) => [plantName, thk, t(r.hr), n(r.hr), t(r.slit), n(r.slit),
    r.totalEmpty ? '' : fmtT3(r.totalWeight), r.avgAge == null ? '' : String(r.avgAge),
    r.produced30d ? fmtT3(r.produced30d) : '', r.cover.tone === 'none' ? '' : r.cover.label]
  const block = (r) => [line(r.plantName, 'All thicknesses', r), ...(r.buckets || []).map(b => line(r.plantName, b.bucketLabel, b))]
  const { rows = [], all } = stockByPlant || {}
  return { header: STOCK_BY_PLANT_CSV_HEADER, rows: [...rows.flatMap(block), ...(all ? block(all) : [])] }
}

// ── COIL STOCK BY THICKNESS × MONTH — Coil Tracker section ──────────────────────────────────────
// One pure function behind the section: it returns the whole finished grid (blocks, rows, month
// columns), already reconciled and ordered, so the component and the CSV read the same structure
// and neither does any arithmetic — the Plant-wise Tracker's pattern, cut by thickness and month.
//
// Coil stock only (raw material): no finished pipe, no dispatch. Two stocks per thickness:
//   HR coil:   Opening + Inward  − Slit out = Closing
//   Slit coil: Opening + Slit in − Consumed = Closing
// Each stock row IS the running balance, so every column reconciles by construction.
const COIL_THICKNESS_ROWS = [
  { key: 'hrOpening', stock: 'HR coil', label: 'Opening', kind: 'stock' },
  { key: 'hrInward', stock: 'HR coil', label: 'Inward', kind: 'flow' },
  { key: 'hrSlitOut', stock: 'HR coil', label: 'Slit out', kind: 'flow' },
  { key: 'hrClosing', stock: 'HR coil', label: 'Closing', kind: 'stock' },
  { key: 'slitOpening', stock: 'Slit coil', label: 'Opening', kind: 'stock' },
  { key: 'slitIn', stock: 'Slit coil', label: 'Slit in', kind: 'flow' },
  { key: 'slitConsumed', stock: 'Slit coil', label: 'Consumed', kind: 'flow' },
  { key: 'slitClosing', stock: 'Slit coil', label: 'Closing', kind: 'stock' },
]
const NO_THICKNESS_KEY = 'none'

// "2026-11" → "Nov-26".
export function coilMonthLabel(key) {
  const s = String(key ?? '')
  if (!/^\d{4}-\d{2}$/.test(s)) return s
  return `${MONTH_ABBR[Number(s.slice(5, 7)) - 1] ?? '??'}-${s.slice(2, 4)}`
}

//   coils/babyCoils/productions — the stores, ALREADY scoped by the header plant selector or the
//     plant login, exactly as coilTrackerView receives them. No plant logic here.
//   today — 'YYYY-MM-DD'; the current month runs to it and its column is labelled "(to date)".
//
// Thickness is the standard bucket (`thicknessBucket`, the stock-by-plant table's rule), so a
// bucket's Closing in the latest column is that table's bucket for the same stock. Whose thickness:
//   · HR side (Inward, Slit out) — the HR COIL's own. Slit out is filed under the HR coil it came off.
//   · Slit side (Slit in, Consumed) — the SLIT COIL's own, else its HR coil's (blank on the slit coil).
// The two agree on every live coil today, so Slit out = Slit in on every block; if they ever
// disagreed, each half would still tie to its own stock table and only TOTAL would match across.
//
// Events come from `trackerEvents` — the ONE definition of Coil Inward, Slitting and RM Consumed
// (a slit coil leaves stock WHOLE on its first live production, ADR-0015) — called once per side
// with that side's thickness key. Nothing is replayed twice.
export function coilThicknessGrid({ coils = [], babyCoils = [], productions = [], today = '' } = {}) {
  const todayKey = String(today ?? '').slice(0, 7)
  const keyOfBucket = (b) => b == null ? NO_THICKNESS_KEY : String(b)
  const hrThk = new Map((coils || []).filter(Boolean).sort((a, b) => !!b.deleted - !!a.deleted)   // a live coil wins an id clash
    .map(c => [String(c.hrCoilId ?? ''), c.thickness]))
  const blank = (t) => t == null || String(t).trim() === ''
  const isSlit = (r) => r != null && Object.prototype.hasOwnProperty.call(r, 'babyCoilId')
  // HR side: an HR coil by its own thickness; a slitting event by its HR coil's (else its own).
  const hrKey = (r) => keyOfBucket(thicknessBucket(isSlit(r)
    ? (hrThk.has(String(r.hrCoilId ?? '')) && !blank(hrThk.get(String(r.hrCoilId ?? ''))) ? hrThk.get(String(r.hrCoilId ?? '')) : r.thickness)
    : r?.thickness))
  // Slit side: a slit coil by its own thickness, else its HR coil's.
  const slitKey = (r) => keyOfBucket(thicknessBucket(blank(r?.thickness) ? hrThk.get(String(r?.hrCoilId ?? '')) : r.thickness))

  const events = [
    ...trackerEvents({ coils, babyCoils, keyOf: hrKey })
      .filter(e => e.flow === 'coilInward' || e.flow === 'slitting')
      .map(e => ({ ...e, flow: e.flow === 'coilInward' ? 'hrInward' : 'hrSlitOut' })),
    ...trackerEvents({ babyCoils, productions, keyOf: slitKey })
      .filter(e => e.flow === 'slitting' || e.flow === 'rmConsumed')
      .map(e => ({ ...e, flow: e.flow === 'slitting' ? 'slitIn' : 'slitConsumed' })),
  ].filter(e => e.weight)

  if (!events.length || !/^\d{4}-\d{2}$/.test(todayKey)) return { today: String(today ?? '').slice(0, 10), columns: [], blocks: [] }

  const months = dataMonthKeys(events.map(e => e.date), today)   // newest first, earliest data → today
  const asc = [...months].reverse()
  const firstMonth = asc[0]
  const FLOWS = ['hrInward', 'hrSlitOut', 'slitIn', 'slitConsumed']
  const acc = new Map()
  const bucket = (k) => {
    if (!acc.has(k)) acc.set(k, { open: Object.fromEntries(FLOWS.map(f => [f, 0])), month: Object.fromEntries(FLOWS.map(f => [f, {}])) })
    return acc.get(k)
  }
  events.forEach(e => {
    const b = bucket(e.plant)   // trackerEvents names the key `plant`; here it is the thickness key
    const m = /^\d{4}-\d{2}/.test(e.date) ? e.date.slice(0, 7) : ''
    // Undated (an undated production's first use) or older than the first column → opening balance:
    // it cannot be placed in a month, but the tonnage exists and the stock tables count it.
    if (!m || m < firstMonth) { b.open[e.flow] += e.weight; return }
    // Dated after today: a data-entry date past today. It still exists, so it folds into the current
    // month rather than vanishing — the Plant-wise Tracker's rule (ticket #176).
    const col = m > todayKey ? todayKey : m
    b.month[e.flow][col] = (b.month[e.flow][col] || 0) + e.weight
  })

  // A running balance of float tonnes can land on ±1e-13 instead of 0, which would print "-0.000"
  // in red. Far below the 0.001 T shown, so it is zero.
  const snapCells = (c) => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.abs(v) < 1e-6 ? 0 : v]))
  const rowsFor = (b) => {
    const cells = Object.fromEntries(COIL_THICKNESS_ROWS.map(r => [r.key, {}]))
    let hr = b.open.hrInward - b.open.hrSlitOut
    let slit = b.open.slitIn - b.open.slitConsumed
    asc.forEach(m => {
      const v = (f) => b.month[f][m] || 0
      cells.hrOpening[m] = hr
      cells.hrInward[m] = v('hrInward')
      cells.hrSlitOut[m] = v('hrSlitOut')
      hr += v('hrInward') - v('hrSlitOut')
      cells.hrClosing[m] = hr
      cells.slitOpening[m] = slit
      cells.slitIn[m] = v('slitIn')
      cells.slitConsumed[m] = v('slitConsumed')
      slit += v('slitIn') - v('slitConsumed')
      cells.slitClosing[m] = slit
    })
    return COIL_THICKNESS_ROWS.map(r => ({ ...r, cells: snapCells(cells[r.key]) }))
  }

  // Thinnest → thickest, then "No thickness" — only buckets that ever had a coil event.
  const order = [...THICKNESS_BUCKETS.map(keyOfBucket), NO_THICKNESS_KEY].filter(k => acc.has(k))
  const thkBlocks = order.map(k => ({
    id: k, name: k === NO_THICKNESS_KEY ? 'No thickness' : `${Number(k).toFixed(1)} mm`, isTotal: false, rows: rowsFor(acc.get(k)),
  }))
  // TOTAL = the sum of the thickness blocks; every event sits in exactly one of them.
  const total = {
    id: 'total', name: 'TOTAL', isTotal: true,
    rows: COIL_THICKNESS_ROWS.map((r, i) => ({
      ...r, cells: snapCells(Object.fromEntries(asc.map(m => [m, thkBlocks.reduce((s, b) => s + b.rows[i].cells[m], 0)]))),
    })),
  }
  return {
    today: String(today ?? '').slice(0, 10),
    columns: months.map(m => ({ key: m, label: m === todayKey ? `${coilMonthLabel(m)} (to date)` : coilMonthLabel(m), current: m === todayKey })),
    blocks: [total, ...thkBlocks],
  }
}

// CSV of the thickness grid: every block and row, every month, newest first — what the screen shows.
// A flow with no movement is an empty cell (`trackerCellBlank`, the screen's own rule); tonnes at 3
// decimals like the other Coil Tracker CSVs.
export function coilThicknessCsv(grid) {
  const cols = grid?.columns || []
  const header = ['Thickness', 'Stock', 'Row', ...cols.map(c => c.label)]
  const rows = (grid?.blocks || []).flatMap(b => b.rows.map(r =>
    [b.name, r.stock, r.label, ...cols.map(c => trackerCellBlank(r, r.cells[c.key]) ? '' : fmtT3(r.cells[c.key]))]))
  return { header, rows }
}

export function coilTrackerView({
  coils = [], babyCoils = [], productions = [], dispatches = [],
  today = '', plants = DEFAULT_PLANTS, cell = null, selectedCoilId = null,
} = {}) {
  const liveBabies = (babyCoils || []).filter(b => b && !b.deleted)
  const slitMothers = new Set(liveBabies.map(b => String(b.hrCoilId ?? '')))
  const spec = (r) => `${r.thickness ?? '—'} × ${r.width ?? '—'}`
  const aged = (date) => { const age = ageInDays(date, today); return { date: date || '', age, band: ageBand(age) } }
  const sitsAt = (rec) => ({ plant: storedPlant(rec), plantName: plantLabel(storedPlant(rec), plants) })

  // Unslit mother = a live mother coil with no live baby coil. On live data a mother is either
  // fully unslit or fully slit, so there is no part-slit state to apportion.
  const allUnslit = (coils || [])
    .filter(c => c && !c.deleted && !slitMothers.has(String(c.hrCoilId ?? '')))
    .map(c => ({
      kind: 'unslit', id: c.hrCoilId, motherId: c.hrCoilId, ...sitsAt(c),
      grade: c.coilGrade || '', thickness: c.thickness, width: c.width, spec: spec(c),
      weight: Number(c.actualWeight || 0), poNumber: c.poNumber || '',
      ...aged(c.dateOfInward),
    }))
    .sort(oldestFirst)

  // Baby coil stock is babyCoilIsStock (ADR-0015), read here, never re-derived: not deleted and
  // named by no live production, at its full slit weight.
  const consumed = coilConsumption(productions, null, 'babyCoilId')
  const allBaby = liveBabies
    .filter(b => babyCoilIsStock(b, consumed))
    .map(b => ({
      kind: 'baby', id: b.babyCoilId, motherId: b.hrCoilId, ...sitsAt(b),
      thickness: b.thickness, width: b.width, spec: spec(b),
      weight: Number(b.weight || 0),
      ...aged(b.dateOfConversion),
    }))
    .sort(oldestFirst)

  // ── The plant × age-band matrix (ticket #242) ─────────────────────────────────────────────────
  // Every figure is a sum over the SAME unfiltered rows the tables list, so a matrix cell and the
  // table it filters to cannot disagree: clicking a cell and totalling the table gives that cell.
  const every = [...allUnslit, ...allBaby]
  const want = { plant: cell?.plant ?? null, kind: cell?.kind ?? null, band: cell?.band ?? null }
  const inCell = (r, c) => (c.plant == null || r.plant === c.plant)
    && (c.kind == null || r.kind === c.kind) && (c.band == null || r.band === c.band)
  const makeCell = (plant, kind, band) => {
    const c = { plant, kind, band }
    const hit = every.filter(r => inCell(r, c))
    return {
      weight: hit.reduce((t, r) => t + r.weight, 0), count: hit.length,
      empty: hit.length === 0,                       // an empty cell reads "–" and is not clickable
      cell: c,                                       // what to pass back in as `cell` when clicked
      selected: !!cell && plant === want.plant && kind === want.kind && band === want.band,
    }
  }
  // Columns Act · Watch · Clear; "No date" joins only when a row carries it, so Total always equals
  // the columns beside it (the same rule as the tables' Band dropdown).
  const bands = [...AGE_BANDS, ...(every.some(r => r.band === NO_DATE_BAND) ? [NO_DATE_BAND] : [])]
  // Plants in master order, then any id the master does not know, then Unattributed last.
  const rank = (id) => { const i = (plants || []).findIndex(p => p.id === id); return id === '' ? Infinity : i < 0 ? 1e6 : i }
  const plantIds = [...new Set(every.map(r => r.plant))]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const matrix = {
    bands,
    rows: plantIds.flatMap(id => STOCK_KINDS.map(([kind, stock], j) => ({
      plant: id, plantName: plantLabel(id, plants), kind, stock, firstOfPlant: j === 0,
      cells: bands.map(b => makeCell(id, kind, b)), total: makeCell(id, kind, null),
    }))),
    all: { cells: bands.map(b => makeCell(null, null, b)), total: makeCell(null, null, null) },
  }

  // ── Raw-material stock by plant (ticket #263) — Section 1, above the matrix ────────────────────
  // One row per plant (the matrix's plantIds, so the same order), then All plants. Summed from the
  // SAME unfiltered `every` rows as the matrix, so a plant's HR T / # and Slit T / # equal the
  // matrix's plant totals by construction. Read-only: the matrix `cell` is never applied here.
  // Avg age is tonne-weighted over HR + slit stock, each coil on its own clock (ADR-0016) — `r.age`
  // already is inward date for HR, slitting date for slit. An undated coil (age null) is left out
  // of the average but kept in tonnes. Rounded to whole days here, so the component does no maths.
  const part = (rows) => {
    const weight = rows.reduce((t, r) => t + r.weight, 0)
    return { weight, count: rows.length, empty: rows.length === 0 }
  }
  const avgAgeOf = (rows) => {
    const dated = rows.filter(r => r.age != null)
    const w = dated.reduce((t, r) => t + r.weight, 0)
    return w > 0 ? Math.round(dated.reduce((t, r) => t + r.weight * r.age, 0) / w) : null
  }
  // Produced 30d (ticket #264): one entry per production allocation, on the plant of the SLIT COIL
  // it drew on, at the allocation's own weight — never the run's totalWeight. Window: runs dated
  // today−29 … today inclusive; an undated or future-dated run cannot be placed, so it is left out.
  // Thickness bucket (ticket #265) of a coil, by the COIL'S OWN thickness: an HR coil's as typed at
  // Coil Inward; a slit coil's as inherited from its HR coil at slitting (stored on it), falling back
  // to its HR coil's when blank. Never a pipe's thickness.
  const hrThk = new Map((coils || []).filter(Boolean).sort((a, b) => !!b.deleted - !!a.deleted)   // a live coil wins an id clash
    .map(c => [String(c.hrCoilId ?? ''), c.thickness]))
  // One rule for every coil: its own thickness, else (a slit coil left blank) its HR coil's.
  const coilBucket = (thickness, hrCoilId) => thicknessBucket(
    thickness == null || String(thickness).trim() === '' ? hrThk.get(String(hrCoilId ?? '')) : thickness)
  const stockBucket = (r) => coilBucket(r.thickness, r.motherId)   // an HR coil's motherId is itself
  const slitById = new Map(liveBabies.map(b => [String(b.babyCoilId ?? ''), b]))
  const inWindow = (p) => { const age = ageInDays(p.dateOfProduction, today); return age != null && age <= 29 }
  const usage = (productions || []).filter(p => p && !p.deleted && inWindow(p)).flatMap(p => (p.coilAllocations || []).map(a => {
    const slit = slitById.get(String(a.babyCoilId ?? ''))
    return {
      // A slit coil no longer on file (baby_coils is hard-delete) falls back to the run's own stored
      // plant, which it inherited from its slit coils at write time (ADR-0005), and to its HR coil's
      // thickness — the thickness the slit coil inherited.
      plant: slit ? storedPlant(slit) : storedPlant(p),
      // Bucketed by the slit coil it CONSUMED, never the SKU rolled: a 2.2 mm coil in a 2.3 mm pipe is 2.0.
      bucket: slit ? coilBucket(slit.thickness, slit.hrCoilId) : coilBucket(null, a.hrCoilId),
      weight: Number(a.weight || 0),
    }
  }))
  // Days of cover = Total T ÷ (Produced 30d ÷ 30), in whole days. Stock with no production in the
  // window reads "No use" — dead stock, not infinite cover.
  const EPS_T = 1e-9
  const coverOf = (totalT, producedT) => {
    // `sortValue` puts "No use" (and the empty "–") after every real number of days.
    if (producedT <= EPS_T && totalT <= EPS_T) return { days: null, label: '–', tone: 'none', sortValue: Infinity }
    if (producedT <= EPS_T) return { days: null, label: 'No use', tone: 'noUse', sortValue: Infinity }
    if (totalT <= EPS_T) return { days: 0, label: '0', tone: 'out', sortValue: 0 }   // producing, but run dry
    const days = Math.round(totalT / (producedT / 30))
    return { days, label: String(days), tone: 'ok', sortValue: days }
  }
  // One row's figures from its stock rows and its production allocations. Plant rows, bucket rows
  // and All plants buckets all come through here, so every level reads the same rule.
  const figures = (rows, uses) => {
    const hr = part(rows.filter(r => r.kind === 'unslit'))
    const slit = part(rows.filter(r => r.kind === 'baby'))
    const produced30d = uses.reduce((t, u) => t + u.weight, 0)
    const totalWeight = hr.weight + slit.weight
    return { hr, slit, totalWeight, totalEmpty: hr.empty && slit.empty, avgAge: avgAgeOf(rows),
      produced30d, cover: coverOf(totalWeight, produced30d) }
  }
  // A plant (or All plants) opens into the standard thicknesses, thinnest first, then "No thickness".
  // A bucket with no stock AND nothing produced in 30 days is left out; one holding stock that was
  // not drawn on stays — that is the dead-stock ("No use") signal.
  const bucketRows = (rows, uses) => [...THICKNESS_BUCKETS, null].map(bucket => ({
    bucket, bucketLabel: bucket == null ? 'No thickness' : `${bucket.toFixed(1)} mm`,
    ...figures(rows.filter(r => stockBucket(r) === bucket), uses.filter(u => u.bucket === bucket)),
  })).filter(b => !(b.totalEmpty && b.produced30d <= EPS_T))
  const stockRow = (rows, uses, plant, plantName) => ({ plant, plantName, ...figures(rows, uses), buckets: bucketRows(rows, uses) })
  // A plant that produced but holds no stock still gets a row — that is the "0 days" case. The
  // matrix keeps its own stock-only plantIds, so it does not change.
  const tablePlantIds = [...new Set([...plantIds, ...usage.map(u => u.plant)])]
    .sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
  const plantRows = tablePlantIds.map(id =>
    stockRow(every.filter(r => r.plant === id), usage.filter(u => u.plant === id), id, plantLabel(id, plants)))
  // All plants = the sum of the plant rows (tonnes and counts), so it can never drift from them; its
  // average is weighted over every coil, not an average of the plant averages.
  const sumOf = (k) => {
    const weight = plantRows.reduce((t, r) => t + r[k].weight, 0)
    const count = plantRows.reduce((t, r) => t + r[k].count, 0)
    return { weight, count, empty: count === 0 }
  }
  const allHr = sumOf('hr'), allSlit = sumOf('slit')
  const allTotal = allHr.weight + allSlit.weight
  const allProduced = plantRows.reduce((t, r) => t + r.produced30d, 0)
  const stockByPlant = {
    rows: plantRows,
    all: { plant: null, plantName: 'All plants', hr: allHr, slit: allSlit,
      totalWeight: allTotal, totalEmpty: allHr.empty && allSlit.empty, avgAge: avgAgeOf(every),
      produced30d: allProduced, cover: coverOf(allTotal, allProduced),
      // Company-wide per bucket (#265): every stock row and every allocation sits in exactly one
      // plant row, so a bucket over all of them is the sum of that bucket across the plants.
      buckets: bucketRows(every, usage) },
  }

  // ── The cell filter: both tables narrow to the plant and band; a stock type hides the other ──
  const show = { unslit: want.kind == null || want.kind === 'unslit', baby: want.kind == null || want.kind === 'baby' }
  const narrow = (rows, shown) => shown ? rows.filter(r => inCell(r, { ...want, kind: null })) : []
  const cellLabel = !cell ? '' : [
    want.plant == null ? 'All plants' : plantLabel(want.plant, plants),
    STOCK_KINDS.find(([k]) => k === want.kind)?.[1],
    want.band ?? 'all bands',
  ].filter(Boolean).join(' · ')

  // ── The trace (ticket #243) — one mother coil, end to end ──────────────────────────────────
  // Inward → Slit → Produced → Dispatched. Every weight in it is THIS COIL'S SHARE, read from the
  // `coilAllocations` that name this mother — never a production's `totalWeight` — so a run that drew
  // on two mothers is not counted in full against each. A dispatch line with no allocations falls
  // back to its legacy `traceHrCoilId` (as coilInventoryRow does). Each stage total is the sum of
  // the table under it, computed from the same rows, so the boxes and the tables cannot disagree.
  // No yield, no leftover and no "% used" (ADR-0015): what is left on an assigned coil shows nowhere.
  const trace = selectedCoilId == null ? null : buildCoilTrace()
  function buildCoilTrace() {
    const m = (coils || []).find(c => c && !c.deleted && c.hrCoilId === selectedCoilId)
    if (!m) return null
    // Weights are held to the 3 decimals the screen prints, row by row, so a stage total is exactly
    // the sum of the figures the viewer can read in the table under it (not a raw sum that rounds differently).
    const r3 = (v) => Math.round(Number(v || 0) * 1000) / 1000
    const sum = (rows, k) => r3(rows.reduce((t, r) => t + r[k], 0))
    const byDate = (a, b) => String(a.date || '').localeCompare(String(b.date || ''))

    // Production runs: one row per allocation that names this mother (a run can draw on several
    // of her baby coils), oldest first. A run is labelled by its production PO, else its date.
    const runs = (productions || []).filter(p => p && !p.deleted).flatMap(p =>
      (p.coilAllocations || []).filter(a => a.hrCoilId === m.hrCoilId).map(a => ({
        runId: p.id ?? null, no: p.productionPoNo || '', date: p.dateOfProduction || '',
        babyCoilId: a.babyCoilId || '', sku: p.skuCode || '',
        pieces: Number(a.pieces || 0), weight: r3(a.weight),
      })))
      .sort((a, b) => byDate(a, b) || a.no.localeCompare(b.no) || a.babyCoilId.localeCompare(b.babyCoilId))
    const runLabel = (r) => r.no || r.date || '—'

    // Baby coils slit from this mother — all of them, In stock and Assigned alike — with the run(s) each went into.
    const babies = liveBabies.filter(b => b.hrCoilId === m.hrCoilId).map(b => ({
      id: b.babyCoilId, date: b.dateOfConversion || '', spec: spec(b), thickness: b.thickness, width: b.width,
      weight: r3(b.weight),
      status: babyCoilIsStock(b, consumed) ? 'In stock' : 'Assigned',
      usedIn: [...new Set(runs.filter(r => r.babyCoilId === b.babyCoilId).map(runLabel))],
    })).sort((a, b) => byDate(a, b) || String(a.id).localeCompare(String(b.id)))

    // Invoice lines: one row per allocation that names this mother.
    const lines = (dispatches || []).filter(d => d && !d.deleted).flatMap(d =>
      (d.bundleEntries || []).flatMap(be => {
        const allocs = Array.isArray(be.coilAllocations) && be.coilAllocations.length ? be.coilAllocations
          : be.traceHrCoilId ? [{ hrCoilId: be.traceHrCoilId, babyCoilId: be.traceBabyCoilId, pieces: be.pieces, weight: be.weight }] : []
        return allocs.filter(a => a.hrCoilId === m.hrCoilId).map(a => ({
          invoiceNo: be.invoiceNo || d.invoiceNo || '', dispatchId: d.id ?? null, date: d.dateOfDispatch || '',
          customer: be.customer || d.customer || '', sku: be.skuCode || '', babyCoilId: a.babyCoilId || '',
          pieces: Number(a.pieces || 0), weight: r3(a.weight),
        }))
      }))
      .sort((a, b) => byDate(a, b) || a.invoiceNo.localeCompare(b.invoiceNo) || a.sku.localeCompare(b.sku))

    // ── Date out of order (ticket #244) ── a row dated STRICTLY before the stage it came from:
    //   baby coil    — slitting date  < the mother's inward date
    //   run          — production date < its baby coil's slitting date
    //   invoice line — invoice date   < the earliest run of its baby coil; where that baby has no run,
    //                  its slitting date; where the line names no baby (or one not on file), the
    //                  mother's inward date — always the nearest upstream stage that has a date.
    // Same day is in order. A missing date on either side cannot be judged and is never flagged.
    // An informational flag (amber): the automatic invoice trace ignores dates, so most of these are
    // the trace's doing, not a typing error an operator can fix.
    const day = (v) => String(v || '').slice(0, 10)
    const before = (a, b) => !!day(a) && !!day(b) && day(a) < day(b)
    const babyDate = new Map(babies.map(b => [b.id, b.date]))
    const firstRun = new Map()
    for (const r of runs) if (r.date && !firstRun.has(r.babyCoilId)) firstRun.set(r.babyCoilId, r.date) // runs are oldest first
    for (const b of babies) b.outOfOrder = before(b.date, m.dateOfInward)
    for (const r of runs) r.outOfOrder = before(r.date, babyDate.get(r.babyCoilId))
    for (const l of lines) {
      const from = (l.babyCoilId && (firstRun.get(l.babyCoilId) || babyDate.get(l.babyCoilId))) || m.dateOfInward
      l.outOfOrder = before(l.date, from)
    }

    // A "run" is one baby coil going into one production (ADR-0015) — one row of the runs table — so
    // the stage count is the table's row count. A production that ate three of her strips is three runs.
    const runCount = runs.length
    const invoiceCount = new Set(lines.map(l => l.invoiceNo || `dispatch:${l.dispatchId}`)).size
    const stages = [
      { key: 'inward', name: 'Inward', weight: r3(m.actualWeight), counts: [], sub: m.dateOfInward || '—' },
      { key: 'slit', name: 'Slit', weight: sum(babies, 'weight'), counts: [babies.length],
        sub: `${babies.length} slit coil${babies.length === 1 ? '' : 's'}` },
      { key: 'produced', name: 'Produced', weight: sum(runs, 'weight'), counts: [runCount, sum(runs, 'pieces')],
        sub: `${runCount} run${runCount === 1 ? '' : 's'} · ${sum(runs, 'pieces')} pcs` },
      { key: 'dispatched', name: 'Dispatched', weight: sum(lines, 'weight'), counts: [invoiceCount, sum(lines, 'pieces')],
        sub: `${invoiceCount} invoice${invoiceCount === 1 ? '' : 's'} · ${sum(lines, 'pieces')} pcs` },
    ]
    return {
      header: {
        id: m.hrCoilId, ...sitsAt(m), grade: m.coilGrade || '', thickness: m.thickness, width: m.width, spec: spec(m),
        poNumber: m.poNumber || '', invoiceWeight: Number(m.invoiceWeight || 0), actualWeight: Number(m.actualWeight || 0),
        dateOfInward: m.dateOfInward || '',
      },
      stages, babies,
      runs: runs.map(r => ({ ...r, label: runLabel(r) })), lines,
    }
  }

  return {
    unslitRows: narrow(allUnslit, show.unslit), babyStockRows: narrow(allBaby, show.baby),
    stockByPlant, matrix, show, cellLabel, trace,
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PRODUCTION PLANNING — the planning master (ticket #278, map #248)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// One row per region × size × thickness BAND (CONTEXT.md → Production planning). It is a planning
// grouping over the SKU master, never an edit of it: a tube keeps its own thickness there, and only
// this tab reads it into a band.

// The sections in the order the tab groups them (#254: SHS / RHS / CHS).
export const PLANNING_SECTIONS = ['SHS', 'RHS', 'CHS']
// What "Stock now" shows as none: below a tenth of a tonne at one decimal place.
const PLANNING_SHOW_MT = 0.05

// A row's identity: region, size as the master spells it, and the band at one decimal —
// `South|100x50|2.0`. Stable across reloads; a stored edit names the row it replaces by it.
export const planningRowKey = (region, size, thickness) => `${region}|${size}|${Number(thickness).toFixed(1)}`

// The seed expanded to its rows, in the posted order. Each row:
//   { id, region, size, section, thickness, type: 'Buffer' | 'MTO', buffer: MT | null, plants: [plant id] }
// `buffer` is null where the table says '-' — every MTO row, and a Buffer size's unbuffered bands.
function planningSeedRows(seed) {
  const rows = []
  String(seed).trim().split('\n').forEach(line => {
    const [region, size, type, entries] = line.trim().split('|')
    if (!entries) return
    entries.trim().split(/\s+/).forEach(entry => {
      const [thk, buf, letters = ''] = entry.split(':')
      const thickness = Number(thk)
      rows.push({
        id: planningRowKey(region, size, thickness),
        region, size, section: planningSizeKey(size).split(' ')[0], thickness,
        type: type === 'Buffer' ? 'Buffer' : 'MTO',
        buffer: buf === '-' || buf === '' ? null : Number(buf),
        plants: [...letters].map(l => PLANNING_PLANT_LETTERS[l]).filter(Boolean),
      })
    })
  })
  return rows
}

// The planning master as it stands (ticket #279): the seed, with the admin's stored rows layered
// on top PER ROW, the way `plantMaster` layers `plants`. A stored row is the WHOLE row (not a
// patch) and names its row by `rowKey`:
//   - a key the seed has  → that row, replaced in place (an edit, a retire, a restore)
//   - a key the seed lacks → a row the admin ADDED, slotted beside its size, by band
// A soft-deleted stored row is not there at all, so the seed row shows through.
//
// RETIRED rows stay in this list, flagged `retired: true` — hidden from the master screen, still
// here for a month's plan that used them to read (#249: "hidden, not deleted"). Every row carries
// `retired` and `added`. Ticks are NOT filtered here — this function does not know the plant
// master; `planningMasterView` keys them by the region's own plants, and `planningRowSave` never
// writes another region's.
export function planningMaster(stored = [], seed = PLANNING_MASTER_SEED) {
  const base = planningSeedRows(seed).map(r => ({ ...r, retired: false, added: false }))
  const at = new Map(base.map((r, i) => [r.id, i]))
  const added = []
  ;(stored || []).filter(s => s && !s.deleted && s.rowKey).forEach(s => {
    const id = String(s.rowKey)
    const row = {
      id, region: String(s.region ?? ''), size: String(s.size ?? ''),
      section: planningSizeKey(s.size).split(' ')[0], thickness: Number(s.thickness),
      type: s.type === 'Buffer' ? 'Buffer' : 'MTO',
      buffer: s.buffer === '' || s.buffer == null || !Number.isFinite(Number(s.buffer)) ? null : Number(s.buffer),
      plants: Array.isArray(s.plants) ? s.plants.map(String) : [],
      retired: !!s.retired,
    }
    if (at.has(id)) base[at.get(id)] = { ...row, added: false }
    else { at.set(id, base.length + added.length); added.push({ ...row, added: true }) }
  })
  if (!added.length) return base
  // Slot each added row beside its size: order by region (as first seen), then the size's first
  // appearance, then band. The seed is already in that order, so a stable sort leaves it be.
  const all = [...base, ...added]
  const firstSeen = (key) => { const m = new Map(); all.forEach((r, i) => { const k = key(r); if (!m.has(k)) m.set(k, i) }); return m }
  const regionAt = firstSeen(r => r.region)
  const sizeAt = firstSeen(r => `${r.region}|${planningSizeKey(r.size)}`)
  return all.map((r, i) => ({ r, i })).sort((a, b) =>
    regionAt.get(a.r.region) - regionAt.get(b.r.region)
    || sizeAt.get(`${a.r.region}|${planningSizeKey(a.r.size)}`) - sizeAt.get(`${b.r.region}|${planningSizeKey(b.r.size)}`)
    || a.r.thickness - b.r.thickness || a.i - b.i).map(x => x.r)
}

// A typed Buffer → MT, null for blank, or NaN for something that is not 0-or-more.
const planningBufferOf = (v) => {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).trim())
  return Number.isFinite(n) && n >= 0 ? n : NaN
}
const PLANNING_BUFFER_PROBLEM = 'Buffer must be blank or a number of MT, 0 or more.'

// The stored row for one master row after a change. `plants` keeps only the plants that serve the
// row's region, in plant-master order, once each — so no screen and no edit can tick another
// region's plant. An MTO row's Buffer is blank, whatever was typed.
function planningStoredRow(row, plants, master) {
  const serving = plantsServingRegion(row.region, master)
  const ticked = new Set((plants || []).map(String))
  return {
    rowKey: planningRowKey(row.region, row.size, row.thickness),
    region: row.region, size: row.size, thickness: Number(row.thickness),
    type: row.type === 'Buffer' ? 'Buffer' : 'MTO',
    buffer: row.type === 'Buffer' ? row.buffer : null,
    plants: master.map(p => p.id).filter(id => serving.has(id) && ticked.has(id)),
    retired: !!row.retired, deleted: false,
  }
}

// Writes one stored row into `stored` by its key: the stored row's id is kept on a later edit,
// a fresh one made on the first. Returns the new array; never mutates.
function planningPut(stored, rowValue, makeId) {
  const list = stored || []
  const i = list.findIndex(s => s && !s.deleted && s.rowKey === rowValue.rowKey)
  if (i >= 0) { const next = [...list]; next[i] = { id: list[i].id, ...rowValue }; return next }
  return [...list, { id: makeId(), ...rowValue }]
}

// An EDIT of one master row (ticket #279): any of `type`, `buffer`, `plants`, `retired`. Region,
// size and band are the row's identity and do not change — a different size is a different row.
// Pure: returns `{ stored, problem }`; on a problem `stored` is the input, unchanged.
// Retire is `{ retired: true }` and restore `{ retired: false }` — the same write as any edit.
export function planningRowSave(stored, row, changes = {}, { plants = null, makeId = () => crypto.randomUUID() } = {}) {
  const master = plantMaster(plants)
  const next = { ...row, ...changes }
  const buffer = planningBufferOf(next.buffer)
  if (next.type === 'Buffer' && Number.isNaN(buffer)) return { stored: stored || [], problem: PLANNING_BUFFER_PROBLEM }
  const value = planningStoredRow({ ...next, buffer: Number.isNaN(buffer) ? null : buffer }, next.plants ?? row.plants, master)
  return { stored: planningPut(stored, value, makeId), problem: null }
}

// The size an admin typed, as the master spells it: `40 nb` → `40NB`, ` 132 X 132 ` → `132x132`,
// and a size the region already carries in another spelling (50x100 for 100x50, 91.5x91.5 for
// 91x91) → the region's own spelling, so an added band lands beside its size. '' if unreadable.
function planningTypedSize(typed, rows, region) {
  const s = String(typed ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const key = planningSizeKey(s)
  if (!key) return ''
  const same = rows.find(r => r.region === region && planningSizeKey(r.size) === key)
  if (same) return same.size
  return s.endsWith('nb') ? `${Number(s.slice(0, -2))}NB` : s
}

// ADD a row (ticket #279) — e.g. a size outside the plan that started selling (#258).
// draft: { region, size, thickness, type, buffer, plants }. Pure: returns `{ stored, problem,
// restored, row }` — `row` is the stored row as written, in the master's own spelling. A row the master already has (in any spelling of its size) is refused; one it has
// RETIRED is brought back with the new values instead of being added twice.
export function planningRowAdd(stored, draft = {}, { plants = null, makeId = () => crypto.randomUUID() } = {}) {
  const master = plantMaster(plants)
  const rows = planningMaster(stored)
  const refuse = (problem) => ({ stored: stored || [], problem, restored: false })
  const region = String(draft.region ?? '').trim()
  if (!rows.some(r => r.region === region)) return refuse('Pick a region the master carries.')
  const size = planningTypedSize(draft.size, rows, region)
  if (!size) return refuse(`"${String(draft.size ?? '').trim()}" is not a size: write it as 50x50, 100x50 or 40NB.`)
  const t = typeof draft.thickness === 'number' ? draft.thickness : Number(String(draft.thickness ?? '').trim() || NaN)
  if (!Number.isFinite(t) || t <= 0) return refuse('Thickness must be a number of mm above 0.')
  if (Math.abs(t * 10 - Math.round(t * 10)) > 1e-6) return refuse('Thickness takes one decimal place, e.g. 2.5.')
  const thickness = Math.round(t * 10) / 10
  const type = draft.type === 'Buffer' ? 'Buffer' : 'MTO'
  const buffer = planningBufferOf(draft.buffer)
  if (type === 'Buffer' && Number.isNaN(buffer)) return refuse(PLANNING_BUFFER_PROBLEM)
  const id = planningRowKey(region, size, thickness)
  const existing = rows.find(r => r.id === id)
  if (existing && !existing.retired) return refuse(`${region} ${size} ${thickness.toFixed(1)} is already in the master.`)
  const value = planningStoredRow({ region, size, thickness, type, buffer: Number.isNaN(buffer) ? null : buffer, retired: false },
    draft.plants || [], master)
  return { stored: planningPut(stored, value, makeId), problem: null, restored: !!existing, row: value }
}

// A tube's thickness → the planning band it counts in, out of the bands that EXIST for its region ×
// size (#258). The nearest band; an exact tie goes to the HEAVIER one (1.8 between 1.6 and 2.0 →
// 2.0), judged within BUCKET_TIE_EPS so float noise cannot tip a true tie down — the same tie rule
// as `thicknessBucket`, but over a size's own bands rather than a fixed list. So 3.2 / 2.8 / 2.9 →
// 3.0 and 2.2 / 1.8 → 2.0 wherever those bands exist. No thickness, or no bands → null.
export function thicknessBand(thickness, bands) {
  const t = typeof thickness === 'string' ? (thickness.trim() === '' ? NaN : Number(thickness)) : thickness
  if (typeof t !== 'number' || !Number.isFinite(t) || t <= 0 || !bands?.length) return null
  let best = null, gap = Infinity
  bands.forEach(b => {
    const d = Math.abs(b - t)
    if (d < gap - BUCKET_TIE_EPS || (Math.abs(d - gap) <= BUCKET_TIE_EPS && b > best)) { best = b; gap = d }
  })
  return best
}

// A master size and a catalogue size as one comparable key: `CHS 40` for `40NB` / "40 NB", and
// `SHS 50x50` / `RHS 40x20` with the larger side first and numbers normalised, so a catalogue RHS
// keyed 20x40 meets the master's 40x20. Section is read from the size's own shape (#249), never
// from productType, so a desc-only dispatch code keys the same as its master SKU.
// `91x91` is the master's spelling of the catalogue's 91.5x91.5 (#251).
const PLANNING_SIZE_ALIASES = { '91x91': '91.5x91.5' }
function planningSizeKey(size) {
  const s = String(size ?? '').trim().toLowerCase().replace(/\s+/g, '')
  const nb = s.match(/^(\d+(?:\.\d+)?)nb$/)
  if (nb) return `CHS ${Number(nb[1])}`
  const hb = (PLANNING_SIZE_ALIASES[s] || s).match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/)
  if (!hb) return ''
  const [a, b] = [Number(hb[1]), Number(hb[2])]
  return `${a === b ? 'SHS' : 'RHS'} ${Math.max(a, b)}x${Math.min(a, b)}`
}

// ── The landing rules every planning screen shares (#278, #280) ──
// A canonical key reads `type|std|size|thickness|length`; one without '|' is a code the SKU master
// could not parse into a tube, so it has no size to land on.
function planningKeyParts(key) {
  const parts = String(key).includes('|') ? String(key).split('|') : []
  return { sizeKey: parts.length ? planningSizeKey(parts[2]) : '', thk: parts.length ? Number(parts[3]) : NaN }
}
// "SHS 132x132 × 3.0" — how a line outside the plan is named.
const planningLineLabel = (sizeKey, thk) => `${sizeKey || 'Unreadable tube'}${Number.isFinite(thk) ? ` × ${thk.toFixed(1)}` : ''}`
// The one live row of region `g` a tube of this size key and thickness counts in, or null: the
// row of the same size whose band `thicknessBand` picks out of that size's live bands.
function planningRowIn(g, sizeKey, thk) {
  const bands = g.bySize.get(sizeKey)
  const band = bands ? thicknessBand(thk, [...bands.keys()]) : null
  return band != null ? bands.get(band) : null
}
// `{ plantId: 0 }` for each of a region's plants.
const planningZero = (regionPlants) => Object.fromEntries(regionPlants.map(p => [p.id, 0]))
// Finished stock per (plant, canonical SKU), positive part — the Dashboard's FG rule read through
// its own `fgPartition`. `happened` cuts the events by date, as the Dashboard's To does.
function planningHoldings(stores, plantOf, skuKey, happened) {
  const holdings = []
  fgPartition(stores, plantOf, happened).forEach((slice, plant) => {
    const pool = producedPool(slice.productions, [{ bundleEntries: slice.entries }], null, skuKey)
    Object.entries(pool).forEach(([key, e]) => { const w = num(e.availableWeight); if (w > 0) holdings.push({ plant, key, weight: w }) })
  })
  return holdings
}
// The master split by region: each region's own plants (`plantsServingRegion`, never another
// region's), its live rows and retired rows through `shape(row, regionPlants)`, and `bySize` —
// size key → band → live row — for `planningRowIn`.
function planningRegions(rows, master, shape) {
  return [...new Set(rows.map(r => r.region))].map(region => {
    const serving = plantsServingRegion(region, master)
    const regionPlants = master.filter(p => serving.has(p.id))
      .map(p => ({ id: p.id, name: p.name, short: planningPlantShort(p.name) }))
    const mine = rows.filter(r => r.region === region)
    const list = mine.filter(r => !r.retired).map(r => shape(r, regionPlants))
    const retired = mine.filter(r => r.retired).map(r => shape(r, regionPlants))
    const bySize = new Map()
    list.forEach(r => {
      const k = planningSizeKey(r.size)
      if (!bySize.has(k)) bySize.set(k, new Map())
      bySize.get(k).set(r.thickness, r)
    })
    return { region, plants: regionPlants, serving, rows: list, retired, bySize }
  })
}

// Tonnes as the amber note reads them: one decimal, a whole number without its ".0" — "29", "4.6".
export const planningTonnes = (v) => String(Math.round(num(v) * 10) / 10)

// The short plant name on the Stock now cell: "Hyd 50.1 · Lep 22.3".
const planningPlantShort = (name) => (String(name).length <= 4 ? String(name) : String(name).slice(0, 3))

// "72.4 · Hyd 50.1 · Lep 22.3" — the region total, then each region plant holding any. '–' for none.
export function planningStockLabel(stock, plants) {
  const total = num(stock?.total)
  if (total <= PLANNING_SHOW_MT) return '–'
  const parts = (plants || []).filter(p => num(stock?.byPlant?.[p.id]) > PLANNING_SHOW_MT)
    .map(p => `${p.short} ${fmtT(stock.byPlant[p.id])}`)
  return [fmtT(total), ...parts].join(' · ')
}

// The planning master as the Production Planning tab shows it (ticket #278). One pure builder, so
// the component computes nothing.
//
// Stock now = finished stock on hand today by the Dashboard's rule (`inventoryOverview` → FG, To =
// today): produced − invoiced per PLANT per canonical SKU, the positive part, every live row counted
// (a future-dated one too, #176). Productions sit at their own plant, invoices at each ENTRY's.
// Each (plant, SKU) holding then lands on at most one row per region that plant serves: the row of
// the same section and size whose band `thicknessBand` picks out of that size's bands in that
// region. The SKU master is read, never changed.
//
// Nothing is lost. A holding that lands on no row is listed under its region's `outside` (a size
// the master does not carry, or a tube whose size cannot be read); one at an Unattributed plant, or a
// plant serving no region the master carries, under `noRegion`. `totals` counts each holding once:
// fg = inRows + outside, and fg is the Dashboard's FG figure.
//
// Ticket #279 adds three things:
//   - `stored` — the admin's edits, layered by `planningMaster(stored)`.
//   - RETIRED rows leave `rows` (and every count, total and band) and are listed in `retired`, so
//     the screen can bring one back. A tube in a retired band lands in the nearest live band.
//   - `notes` on each row — the amber "ordered / produced, not ticked" flag (#250). The ticks are
//     the rule; data that disagrees is flagged, never obeyed: for each of the region's plants NOT
//     ticked, its live, not cancelled / rejected order lines (ordered `quantity`, MT) and live productions (`totalWeight`)
//     that land on the row by the same rule as Stock now. Nothing here ticks a plant.
export function planningMasterView({ productions = [], dispatches = [], skus = [], plants = null, orders = [], stored = [] } = {}) {
  const rows = planningMaster(stored)
  const master = plantMaster(plants)
  const known = new Set(master.map(p => p.id))
  const plantOf = (r) => { const k = storedPlant(r); return known.has(k) ? k : '' }
  const skuKey = skuKeyResolver(skus)

  // ── FG per plant per canonical SKU, the Dashboard's partition ──
  const holdings = planningHoldings({ productions, dispatches }, plantOf, skuKey)

  // ── The master, per region: size key → its rows by band ──
  const regions = planningRegions(rows, master, (r, regionPlants) => {
    const zero = () => planningZero(regionPlants)
    return {
      ...r,
      canMake: Object.fromEntries(regionPlants.map(p => [p.id, r.plants.includes(p.id)])),
      stock: { total: 0, byPlant: zero() },
      ordered: zero(), produced: zero(), notes: [],
    }
  }).map(g => ({
    ...g,
    bufferRows: g.rows.filter(r => r.type === 'Buffer').length,
    mtoRows: g.rows.filter(r => r.type !== 'Buffer').length,
    bufferTotal: g.rows.reduce((t, r) => t + num(r.buffer), 0),
    outside: { total: 0, lines: [] },
  }))

  // ── Land each holding ──
  const noRegion = { total: 0, lines: [] }
  let inRows = 0, outside = 0
  const labelOf = planningLineLabel
  const readKey = planningKeyParts
  const rowIn = planningRowIn
  holdings.forEach(h => {
    const { sizeKey, thk } = readKey(h.key)
    const home = regions.filter(g => g.serving.has(h.plant))
    if (!home.length) {
      noRegion.total += h.weight
      noRegion.lines.push({ plant: h.plant, key: h.key, label: labelOf(sizeKey, thk), weight: h.weight })
      outside += h.weight
      return
    }
    let landed = false
    home.forEach(g => {
      const row = rowIn(g, sizeKey, thk)
      if (row) {
        row.stock.total += h.weight
        row.stock.byPlant[h.plant] += h.weight
        landed = true
      } else {
        g.outside.total += h.weight
        g.outside.lines.push({ plant: h.plant, key: h.key, label: labelOf(sizeKey, thk), weight: h.weight })
      }
    })
    if (landed) inRows += h.weight
    else outside += h.weight
  })
  // ── Orders and production per plant per row, for the "not ticked" note (#250) ──
  // An order or run at a plant counts on that plant's region's row only, so a West plant's order
  // can never flag a South row. A line with no known plant names nobody, so it flags nothing.
  const tally = (plant, key, weight, field) => {
    if (!plant || !(weight > 0)) return
    const { sizeKey, thk } = readKey(key)
    regions.filter(g => g.serving.has(plant)).forEach(g => {
      const row = rowIn(g, sizeKey, thk)
      if (row) row[field][plant] += weight
    })
  }
  // Ordered = valid demand, the Sales tab's rule: every live line except cancelled / rejected ones.
  notDeleted(orders).filter(o => !/cancel|reject/i.test(o.orderStatus || '')).forEach(o => tally(plantOf(o), skuKey(String(o.mmId || '').trim(), o.description || ''), num(o.quantity), 'ordered'))
  notDeleted(productions).forEach(p => tally(plantOf(p), skuKey(p.skuCode), num(p.totalWeight), 'produced'))
  regions.forEach(g => g.rows.forEach(r => {
    r.notes = g.plants.filter(p => !r.canMake[p.id] && (r.ordered[p.id] > PLANNING_SHOW_MT || r.produced[p.id] > PLANNING_SHOW_MT))
      .map(p => {
        const ordered = r.ordered[p.id], produced = r.produced[p.id]
        const said = [ordered > PLANNING_SHOW_MT && `${planningTonnes(ordered)} T ordered`, produced > PLANNING_SHOW_MT && `${planningTonnes(produced)} T produced`].filter(Boolean)
        return { plant: p.id, name: p.name, ordered, produced, text: `${p.name}: ${said.join(', ')}, not ticked` }
      })
  }))

  regions.forEach(g => g.outside.lines.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label)))
  noRegion.lines.sort((a, b) => b.weight - a.weight || a.label.localeCompare(b.label))

  return {
    regions: regions.map(({ serving, bySize, ...g }) => ({
      ...g, stockTotal: g.rows.reduce((t, r) => t + r.stock.total, 0),
    })),
    noRegion,
    totals: { fg: inRows + outside, inRows, outside },
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PRODUCTION PLANNING — the monthly campaign sheet, layout A2 (ticket #280, map #248)
// ═══════════════════════════════════════════════════════════════════════════════════════════════
// The read-only columns of the A2 sheet (#254): per region and plan month, every live master row
// with Open, last month's sales and the three months' sales. The Indent, Planned and Plant columns
// come in later tickets.

// 'YYYY-MM' moved by `n` calendar months: ('2026-01', -1) → '2025-12'.
function planningMonthShift(key, n) {
  const y = Number(key.slice(0, 4)), m = Number(key.slice(5, 7)) - 1 + n
  const d = new Date(Date.UTC(y, m, 1))
  return d.toISOString().slice(0, 7)
}
const planningMonthAbbr = (key) => MONTH_ABBR[Number(key.slice(5, 7)) - 1] ?? '??'
// "2026-08-30" → "30 Aug".
const planningDayLabel = (iso) => `${Number(String(iso).slice(8, 10))} ${planningMonthAbbr(String(iso).slice(0, 7))}`

// The months the campaign's month picker offers, newest first: NEXT month (planned before it
// starts), this month, and every earlier month the data covers. `{ key: '2026-11', label: 'Nov 2026' }`.
export function planningCampaignMonths(today, dates = []) {
  const now = String(today ?? '').slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(now)) return []
  return [planningMonthShift(now, 1), ...dataMonthKeys(dates, today)]
    .map(key => ({ key, label: `${planningMonthAbbr(key)} ${key.slice(0, 4)}` }))
}

// "Hyd 29.6 · Lep 0 (from 30 Aug)" — the per-plant split a figure shows on hover. Every region
// plant is named, a zero too, so a plant's absence reads as 0 and not as "not counted". `notes`
// (plant id → text) adds the short-history note after that plant's figure.
export function planningSplitLabel(cell, plants, notes = {}) {
  return (plants || []).map(p => {
    const v = num(cell?.byPlant?.[p.id])
    const note = notes[p.id] ? ` (${notes[p.id]})` : ''
    return `${p.short} ${v > PLANNING_SHOW_MT ? fmtT(v) : '0'}${note}`
  }).join(' · ')
}

// A figure in an A2 cell: one decimal, '–' for none.
export const planningCell = (v) => (num(v) > PLANNING_SHOW_MT ? fmtT(v) : '–')

// The A2 campaign sheet for one plan month (ticket #280). One pure builder: the component lays it
// out and computes nothing.
//
// OPEN = finished stock on hand on the 1st of the plan month, per plant, by the Dashboard's FG rule
// read as of the day before (`inventoryOverview` with To = that day): produced − invoiced per plant
// per canonical SKU, positive part, every live event dated up to that day (an undated one too, as
// the Dashboard counts it). NOT netted against orders. Once the month has begun the cut-off is in
// the past, so Open does not move as the month runs. Planned before the 1st, it is the stock so far
// (the Dashboard's today rule, a future-dated row included) and `month.provisional` is true.
//
// SALES = invoiced tonnes (the `dispatches` store, the Zoho register — never orders), counted at
// each ENTRY's plant, the shipping plant (ADR-0013), over whole calendar months before the plan
// month: `last` = the month before, `three` = the three months before. A region's figure is its own
// plants' invoices wherever the customer is, so a South customer served from NPMD counts in West.
// An entry with no known plant, or a plant serving no region, is in no region's figure.
//
// Both land on rows by the master's rule — size key, then `thicknessBand` over the size's live bands
// (2.8 / 2.9 / 3.2 → 3.0; 1.8 / 2.2 → 2.0; a tie heavier). What lands on no row goes to the region's
// `outside` lines, one per size × thickness, with its Open and both sales figures. So per region:
//   Σ rows' Open + outside Open = the region's FG on the 1st          (`totals`)
//
// `starts` — a plant whose invoices begin inside a sales window gets a "from 30 Aug" note for that
// window, so a short history is not read as low sales (#260). A row is QUIET when it has no Open, no
// sales in either window, no Buffer and nothing typed; the screen hides those by default.
//
// INDENT and PLANNED (ticket #281) come from `campaigns` — the stored campaign of this region and
// month, see `planningCampaignSave`. Each row gets `indent` (typed, or null), `suggested`
// (`planningSuggested` over that indent, the row's Buffer and its Open), `typed` (the Planned the
// admin typed, or null), `planned` (typed, else suggested) and `moved` — a typed Planned whose
// suggestion has since moved off the one it was typed against: the row turns amber, offers "use N".
//
// PLANT (ticket #282) — each row gets `plantOptions` (its ticked plants, the region's own only),
// `assign` / `plant` / `split` / `splitOk` / `assigned` / `needsPlant` / `noPlant` / `red` (see
// `planningAssignView`), and `dots` — an unticked region plant with Open or sales on the row. Each
// region gets `summary` (`planningCampaignSummary`), the plain sum of its rows.
export function planningCampaignView({ productions = [], dispatches = [], skus = [], plants = null, stored = [], campaigns = [], month = '', today: todayIso = today() } = {}) {
  const NOW = String(todayIso).slice(0, 10)
  const M = /^\d{4}-\d{2}$/.test(String(month)) ? String(month) : NOW.slice(0, 7)
  const start = `${M}-01`
  const openCut = addDaysIso(start, -1)
  const provisional = start > NOW
  // The Dashboard's rule for To: a past To cuts at To; To today or later counts every dated row.
  const U = openCut >= NOW ? '9999-12-31' : openCut
  const happened = (d) => { const s = String(d ?? '').slice(0, 10); return !s || s <= U }
  const windowOf = (back) => ({
    from: `${planningMonthShift(M, -back)}-01`, to: openCut,
    label: back === 1 ? planningMonthAbbr(planningMonthShift(M, -1)) : `${planningMonthAbbr(planningMonthShift(M, -back))}–${planningMonthAbbr(planningMonthShift(M, -1))}`,
  })
  const windows = { last: windowOf(1), three: windowOf(3) }

  const master = plantMaster(plants)
  const known = new Set(master.map(p => p.id))
  const plantOf = (r) => { const k = storedPlant(r); return known.has(k) ? k : '' }
  const skuKey = skuKeyResolver(skus)
  const FIELDS = ['open', 'last', 'three']
  const cells = (regionPlants) => Object.fromEntries([...FIELDS, 'made', 'dispatched'].map(f => [f, { total: 0, byPlant: planningZero(regionPlants) }]))

  const regions = planningRegions(planningMaster(stored), master, (r, regionPlants) => ({ ...r, ...cells(regionPlants) }))
    .map(g => ({ ...g, outsideBy: new Map() }))

  // Adds `weight` at `plant` of canonical SKU `key` into `field`, on every region the plant serves:
  // the row it lands on, else that region's outside line for its size × thickness.
  // `day` (Made only, #287): also kept by day, `madeDays[plant][day]`, so monitoring can credit a
  // row's production in date order and say which week its tonnes fell in.
  const land = (plant, key, weight, field, day = null) => {
    const { sizeKey, thk } = planningKeyParts(key)
    regions.filter(g => g.serving.has(plant)).forEach(g => {
      let cell = planningRowIn(g, sizeKey, thk)
      if (!cell) {
        const label = planningLineLabel(sizeKey, thk)
        if (!g.outsideBy.has(label)) g.outsideBy.set(label, { label, ...cells(g.plants) })
        cell = g.outsideBy.get(label)
      }
      cell[field].total += weight
      cell[field].byPlant[plant] += weight
      if (day) {
        const byDay = ((cell.madeDays ||= {})[plant] ||= {})
        byDay[day] = (byDay[day] || 0) + weight
      }
    })
  }

  // ── Open: stock on the 1st ──
  planningHoldings({ productions, dispatches }, plantOf, skuKey, happened).forEach(h => land(h.plant, h.key, h.weight, 'open'))

  // ── Sales: invoice entries by their shipping plant, in whole calendar months ──
  // `dispatched` (#288): the same entries by the same rule, dated in the plan month up to today.
  const firstInvoice = new Map()
  notDeleted(dispatches).forEach(d => {
    const day = String(d.dateOfDispatch ?? '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return
    ;(d.bundleEntries || []).forEach(e => {
      const plant = plantOf(e)
      const w = num(e.weight)
      if (!plant || !(w > 0)) return
      if (!firstInvoice.has(plant) || day < firstInvoice.get(plant)) firstInvoice.set(plant, day)
      const key = skuKey(e.skuCode)
      FIELDS.slice(1).forEach(f => { if (day >= windows[f].from && day <= windows[f].to) land(plant, key, w, f) })
      if (day >= start && day <= NOW && day.slice(0, 7) === M) land(plant, key, w, 'dispatched')
    })
  })

  // ── Made: production of the plan month up to today (#286), at the run's own plant — the coil
  // that made it has already left coil on hand, so the week plan asks coil only for the rest.
  // `entered` (#287): each plant's latest production day up to today, any tube — how far its
  // production has been entered, whatever the month.
  const entered = {}
  notDeleted(productions).forEach(p => {
    const day = String(p.dateOfProduction ?? '').slice(0, 10)
    const plant = plantOf(p)
    const w = num(p.totalWeight)
    if (plant && w > 0 && /^\d{4}-\d{2}-\d{2}$/.test(day) && day <= NOW && !(entered[plant] >= day)) entered[plant] = day
    if (!plant || !(w > 0) || day < start || day > NOW || day.slice(0, 7) !== M) return
    land(plant, skuKey(p.skuCode), w, 'made', day)
  })

  // A plant's short-history note for one window: none when its invoices began on or before the
  // window's first day.
  const startNote = (plant, w) => {
    const first = firstInvoice.get(plant)
    if (first && first <= w.from) return null
    if (!first) return 'no invoices yet'
    return first > w.to ? `none until ${planningDayLabel(first)}` : `from ${planningDayLabel(first)}`
  }

  const sum = (list, f) => list.reduce((t, r) => t + r[f].total, 0)
  return {
    today: NOW, entered,
    month: {
      key: M, label: `${planningMonthAbbr(M)} ${M.slice(0, 4)}`, provisional,
      openDate: start, openLabel: planningDayLabel(start), last: windows.last, three: windows.three,
    },
    regions: regions.map(({ serving, bySize, outsideBy, retired, ...g }) => {
      const notes = Object.fromEntries(FIELDS.slice(1).map(f =>
        [f, Object.fromEntries(g.plants.map(p => [p.id, startNote(p.id, windows[f])]).filter(([, n]) => n))]))
      const titled = (r) => ({
        ...r,
        titles: {
          open: planningSplitLabel(r.open, g.plants),
          last: planningSplitLabel(r.last, g.plants, notes.last),
          three: planningSplitLabel(r.three, g.plants, notes.three),
        },
      })
      const campaign = planningCampaignOf(campaigns, g.region, M)
      const lines = campaign?.lines || {}
      // FINALISE (#283): once finalised, Planned moves only when typed and nothing is carried any
      // more — Finalise wrote every carried plant into `lines`, so the plan reads from its own row.
      const finalised = planningIsFinalised(campaign)
      // Week moves (#285) share the stored log but are not Planned or Plant changes: they never mark
      // a row ↺ revised and stay off the monthly change log. The week plan reads them as `weekLog`.
      const allLog = planningChangeLog(campaign)
      const log = allLog.filter(c => c.field !== 'week')
      const rows = g.rows.map(r => {
        const plan = planningLineView(lines[r.id], r, finalised)
        const line = lines[r.id]
        // The row's ticked plants — out of the region's own plants only, so another region's plant
        // can never be offered, whatever a stored master row says (#253, ADR-0006).
        const options = g.plants.filter(p => r.plants.includes(p.id))
        const carried = options.length > 1 && !finalised ? planningCarriedPlant(campaigns, g.region, M, r.id, options) : null
        const assign = planningAssignView(line, options, carried, plan.planned, g.plants)
        const changes = log.filter(c => c.rowKey === r.id)
        const revision = finalised
          ? { baseline: planningBaselineRow(campaign.baseline?.[r.id]), revised: changes.length > 0, changes }
          : { baseline: null, revised: false, changes: [] }
        // An unticked region plant with stock or sales on the row: a small amber dot (#254, #250).
        const dots = g.plants.filter(p => !options.some(o => o.id === p.id)
          && (r.open.byPlant[p.id] > PLANNING_SHOW_MT || r.three.byPlant[p.id] > PLANNING_SHOW_MT))
          .map(p => {
            const said = [r.open.byPlant[p.id] > PLANNING_SHOW_MT && `${planningTonnes(r.open.byPlant[p.id])} T open`,
              r.three.byPlant[p.id] > PLANNING_SHOW_MT && `${planningTonnes(r.three.byPlant[p.id])} T sold ${windows.three.label}`].filter(Boolean)
            return { plant: p.id, name: p.name, title: `${p.name}: ${said.join(', ')} — not ticked on the planning master` }
          })
        return titled({
          ...r, ...plan, ...assign, ...revision, plantOptions: options, dots,
          weekAt: finalised && line?.weeks && typeof line.weeks === 'object' ? line.weeks : {},
          hasStock: r.open.total > PLANNING_SHOW_MT,
          quiet: FIELDS.every(f => r[f].total <= PLANNING_SHOW_MT) && !(num(r.buffer) > 0) && plan.indent == null && plan.typed == null
            && !(line && ('plant' in line || line.split)),
        })
      })
      const outLines = [...outsideBy.values()].map(titled)
        .sort((a, b) => (b.three.total + b.open.total) - (a.three.total + a.open.total) || a.label.localeCompare(b.label))
      const outside = { lines: outLines, open: sum(outLines, 'open'), last: sum(outLines, 'last'), three: sum(outLines, 'three') }
      const inRows = sum(rows, 'open')
      // Dispatched this month per plant (#288): every invoice entry of the region's plants, on a row
      // or outside one — the overview's per-plant figure.
      const dispatched = { total: 0, byPlant: planningZero(g.plants) }
      ;[...rows, ...outLines].forEach(r => {
        dispatched.total += r.dispatched.total
        g.plants.forEach(p => { dispatched.byPlant[p.id] += r.dispatched.byPlant[p.id] })
      })
      return {
        ...g, rows, outside, dispatched,
        quietRows: rows.filter(r => r.quiet).length,
        movedRows: rows.filter(r => r.moved).length,
        summary: planningCampaignSummary(rows, g.plants),
        groups: planningCampaignGroups(rows),
        counts: {
          all: rows.length,
          needPlant: rows.filter(r => r.needsPlant).length,
          noPlant: rows.filter(r => r.noPlant).length,
          hasStock: rows.filter(r => r.hasStock).length,
          typed: rows.filter(r => r.typed != null).length,
          // Rows with a Monthly Indent typed — the first line of the "before Finalise" checklist the
          // Week plan and Monitoring screens show while the month is a Draft.
          indent: rows.filter(r => r.indent != null).length,
        },
        finalise: planningFinaliseState(rows, campaign),
        changes: [...log].reverse().map(c => planningChangeView(c, rows, g)),
        weekLog: finalised ? allLog.filter(c => c.field === 'week') : [],
        starts: g.plants.map(p => ({
          plant: p.id, name: p.name, first: firstInvoice.get(p.id) || null,
          last: notes.last[p.id] || null, three: notes.three[p.id] || null,
        })),
        totals: {
          open: { fg: inRows + outside.open, inRows, outside: outside.open },
          last: sum(rows, 'last') + outside.last,
          three: sum(rows, 'three') + outside.three,
        },
      }
    }),
  }
}

// ── Indent → Suggested → Planned (ticket #281, decision #252) ──────────────────────────────────

// Always UP to the next 10 MT; an exact 0 (or less) stays 0: 3.2 → 10, 27.1 → 30, 94.4 → 100,
// 100 → 100. Read at 3 decimals first, so float noise in a sum of invoice weights (100.0000000001)
// cannot tip an exact multiple up a step.
export function planningRoundUp10(v) {
  const n = Math.round(num(v) * 1000) / 1000
  return n > 0 ? Math.ceil(n / 10) * 10 : 0
}

// Suggested production for one row, in MT (#252):
//   Buffer row: max(Indent, Buffer) − Open      MTO row: Indent − Open
// floored at 0 and rounded up to 10. A blank Indent or Buffer reads as 0. `max`, not `+`, by the
// user's choice: the month's sales are served OUT of the buffer, so a month can end below Buffer.
export function planningSuggested({ type, buffer, indent, open }) {
  const want = type === 'Buffer' ? Math.max(num(indent), num(buffer)) : num(indent)
  return planningRoundUp10(Math.max(0, want - num(open)))
}

// A typed figure in MT → the number, null for blank, NaN for something that is not 0-or-more.
function planningTypedTonnes(v) {
  if (v === '' || v == null) return null
  const n = typeof v === 'number' ? v : Number(String(v).trim().replace(/,/g, ''))
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : NaN
}
// A stored figure → the number, or null.
const planningStoredTonnes = (v) => { const n = planningTypedTonnes(v); return Number.isNaN(n) ? null : n }

// The one live stored campaign of a region and month, or null. One per region per month: the
// table is unique on (region, month).
export function planningCampaignOf(campaigns, region, month) {
  return (campaigns || []).find(c => c && !c.deleted && c.region === region && c.month === month) || null
}

// One row's Indent / Suggested / Planned, from its stored line and the row (type, buffer, open).
// A stored line: `{ indent, planned, basis }` — `basis` is the suggestion Planned was typed against.
// `moved` when a typed Planned's basis is no longer today's suggestion. A line with no basis (hand-
// written) counts its own Planned as the basis: only a later move can turn it amber.
//
// FINALISED (#283): Finalise wrote every row's Planned > 0 into its line, with the suggestion of
// that moment as `basis`. So a finalised row with nothing typed had Planned 0 and suggestion 0 —
// it stays 0 and turns amber when an Indent edit moves the suggestion off 0. Planned never follows
// the suggestion again; only a typed (and logged) change moves it.
function planningLineView(line, r, finalised = false) {
  const indent = planningStoredTonnes(line?.indent)
  const typed = planningStoredTonnes(line?.planned)
  const suggested = planningSuggested({ type: r.type, buffer: r.buffer, indent, open: r.open?.total })
  const kept = typed ?? (finalised ? 0 : null)
  const basis = planningStoredTonnes(line?.basis) ?? kept
  return {
    indent, suggested, typed, planned: kept ?? suggested, moved: kept != null && basis !== suggested,
    suggestedTitle: planningSuggestedLabel({ type: r.type, buffer: r.buffer, indent, open: r.open?.total, suggested }),
  }
}

// ── Plant: assigning a region's Planned to a plant (ticket #282, decisions #253, #250) ─────────
// A plant's campaign is the set of rows assigned to it. The row's TICKED plants (`options`, the
// region's own plants only) decide what is offered:
//   0 ticked → 'none'   "No plant can make" — red, never assigned
//   1 ticked → 'auto'   that plant, whatever is stored
//   2 ticked → a stored split          → 'split'   parts per plant, any tonnage, must add up to Planned
//              a stored plant          → 'chosen'  (a plant since unticked reads as 'blank')
//              a stored '' (Choose…)   → 'blank'
//              last month's plant      → 'carried' (see planningCarriedPlant)
//              otherwise               → 'blank'
// Tonnes within this of each other count as equal: parts are kept at 3 decimals.
const PLANNING_SPLIT_EPS = 0.0005

// The plant a two-plant row starts on: the plant it had in LAST month's campaign (#253). Not
// carried when last month's row was split, or when that plant is no longer ticked — both start
// blank. Last month "had" a plant it carried itself, so a month with nothing chosen on the row
// looks one month further back; the walk stops at the first month with no stored campaign for the
// region (the first month has no last month).
function planningCarriedPlant(campaigns, region, month, rowKey, options) {
  let m = planningMonthShift(month, -1)
  for (let i = 0; i < 240; i++, m = planningMonthShift(m, -1)) {
    const c = planningCampaignOf(campaigns, region, m)
    if (!c) return null
    const line = c.lines?.[rowKey]
    if (line?.split) return null
    if (line && 'plant' in line) return options.some(o => o.id === line.plant) ? line.plant : null
  }
  return null
}

// One row's Plant cell. `assigned` is the row's tonnes per region plant — what the summary adds up:
// the whole Planned on a single plant, a split's parts as typed. `split` holds only ticked plants'
// parts (null = not typed yet); `splitOk` once they add up to Planned.
function planningAssignView(line, options, carried, planned, regionPlants) {
  const assigned = planningZero(regionPlants)
  const out = (assign, plant = null, extra = {}) => {
    if (plant) assigned[plant] += planned
    return { assign, plant, split: null, splitTotal: null, splitOk: null, assigned, noPlant: assign === 'none',
      needsPlant: assign === 'blank' && planned > 0, red: assign === 'none', ...extra }
  }
  if (!options.length) return out('none')
  if (options.length === 1) return out('auto', options[0].id)
  if (line?.split && typeof line.split === 'object') {
    const split = Object.fromEntries(options.map(o => [o.id, planningStoredTonnes(line.split[o.id])]))
    const splitTotal = Math.round(Object.values(split).reduce((t, v) => t + num(v), 0) * 1000) / 1000
    options.forEach(o => { assigned[o.id] += num(split[o.id]) })
    const splitOk = Math.abs(splitTotal - planned) < PLANNING_SPLIT_EPS
    return out('split', null, { split, splitTotal, splitOk, red: !splitOk })
  }
  if (line && 'plant' in line) return options.some(o => o.id === line.plant) ? out('chosen', line.plant) : out('blank')
  if (carried) return out('carried', carried)
  return out('blank')
}

// The A2 summary line (#254): Planned T · T per plant · "No plant can make" T · rows needing a
// plant, each the plain sum of the rows' own figures over every live row of the region (quiet
// rows and rows a search leaves out included), so the line always equals the sheet.
function planningCampaignSummary(rows, regionPlants) {
  const round = (v) => Math.round(v * 1000) / 1000
  const byPlant = planningZero(regionPlants)
  rows.forEach(r => regionPlants.forEach(p => { byPlant[p.id] += r.assigned[p.id] }))
  Object.keys(byPlant).forEach(k => { byPlant[k] = round(byPlant[k]) })
  const need = rows.filter(r => r.needsPlant)
  return {
    planned: round(rows.reduce((t, r) => t + num(r.planned), 0)),
    byPlant,
    noPlant: round(rows.filter(r => r.noPlant).reduce((t, r) => t + num(r.planned), 0)),
    needPlant: need.length,
    needPlantT: round(need.reduce((t, r) => t + num(r.planned), 0)),
    assigned: round(Object.values(byPlant).reduce((t, v) => t + v, 0)),
    splitOff: rows.filter(r => r.assign === 'split' && !r.splitOk).length,
  }
}

// ── The clean-sheet layout (ticket #302) ──────────────────────────────────────────────────────
// One group per section × size, in sheet order (section, then the size's first row in the master's
// order), with the subtotals its collapsible size row shows: Open, last month, three months and
// Planned are the plain sums of its rows; needPlant / noPlant count its rows needing a plant / that
// no plant can make. Over every live row of the region, as the summary line is — the screen's chips,
// search and quiet toggle choose which rows show, never what a group adds up to.
function planningCampaignGroups(rows) {
  const round = (v) => Math.round(v * 1000) / 1000
  const order = (sec) => { const i = PLANNING_SECTIONS.indexOf(sec); return i < 0 ? PLANNING_SECTIONS.length : i }
  const byKey = new Map()
  rows.forEach((r, i) => {
    const key = `${r.section}|${r.size}`
    if (!byKey.has(key)) byKey.set(key, { key, section: r.section, size: r.size, at: i, rows: [] })
    byKey.get(key).rows.push(r)
  })
  return [...byKey.values()]
    .sort((a, b) => order(a.section) - order(b.section) || a.at - b.at)
    .map(({ key, section, size, rows: list }) => {
      const add = (f) => round(list.reduce((t, r) => t + f(r), 0))
      return {
        key, section, size, rowKeys: list.map(r => r.id),
        open: add(r => r.open.total), last: add(r => r.last.total), three: add(r => r.three.total),
        planned: add(r => num(r.planned)),
        needPlant: list.filter(r => r.needsPlant).length,
        noPlant: list.filter(r => r.noPlant).length,
      }
    })
}

// The filter chips that choose which rows of a region the sheet shows (#302).
export const PLANNING_CAMPAIGN_FILTERS = [
  ['all', 'All rows'], ['needPlant', 'Needs a plant'], ['noPlant', 'No plant can make'], ['hasStock', 'Has stock'],
]
const PLANNING_FILTER_TEST = { needPlant: r => r.needsPlant, noPlant: r => r.noPlant, hasStock: r => r.hasStock }

// The rows a region's sheet shows, grouped as `region.groups` (#302). `filter` is a chip: 'all'
// leaves quiet rows out unless `showQuiet`; any other chip shows every row it names, quiet or not,
// so a chip's count is the rows it shows. `q` finds a size ("50 x50" = "50x50"). A group with no
// row shown is left out; a shown group keeps the view's own subtotals. `quietLeftOut` = the quiet
// rows the search would show but 'all' leaves out. `counts` = what each chip would show under the
// same search and quiet toggle, so a chip's number is always the rows it shows.
export function planningCampaignShown(region, { filter = 'all', q = '', showQuiet = false } = {}) {
  const needle = String(q || '').trim().toLowerCase().replace(/\s+/g, '')
  const found = (region?.rows || []).filter(r => !needle || r.size.toLowerCase().includes(needle))
  const pick = (key) => { const test = PLANNING_FILTER_TEST[key]; return found.filter(r => (test ? test(r) : (showQuiet || !r.quiet))) }
  const test = PLANNING_FILTER_TEST[filter]
  const keep = pick(test ? filter : 'all')
  const byId = new Map(keep.map(r => [r.id, r]))
  const groups = (region?.groups || [])
    .map(g => ({ ...g, rows: g.rowKeys.map(k => byId.get(k)).filter(Boolean) }))
    .filter(g => g.rows.length)
  return {
    groups, rows: groups.flatMap(g => g.rows),
    counts: Object.fromEntries(PLANNING_CAMPAIGN_FILTERS.map(([key]) => [key, pick(key).length])),
    quietLeftOut: test || showQuiet ? 0 : found.filter(r => r.quiet).length,
  }
}

// ── Finalise, Baseline and the logged change (ticket #283, decision #255) ──────────────────────
// Finalise closes one region's campaign for one month ("Finalise November — South"); South and West
// finalise on their own days. Stored on the campaign row itself:
//   finalisedAt  ISO timestamp — set once, never cleared: there is NO Un-finalise
//   finalisedBy  the login that pressed it
//   baseline     { rowKey: { planned, suggested, indent, plant, split } } — the figures at that
//                moment, never written again. A row absent from it had Planned 0 and no Indent.
//   changes      append-only: { id, at, by, rowKey, field: 'planned' | 'plant', from, to, reason }
//                `plant` values are a plant id ('' = none chosen) or a split { hyderabad: 45, … }.
// These keys are written by Finalise only, so a campaign that was never finalised carries none of
// them and saves exactly as before (#281) — even on a database whose #283 columns are not yet added.
export const planningIsFinalised = (campaign) => !!(campaign && campaign.finalisedAt)

const planningChangeLog = (campaign) => (Array.isArray(campaign?.changes) ? campaign.changes.filter(c => c && c.rowKey) : [])

const planningSplitOf = (v) => (v && typeof v === 'object' ? v : null)

// One row's Baseline as stored; a row absent from the Baseline had Planned 0 at Finalise.
function planningBaselineRow(b) {
  return {
    planned: planningStoredTonnes(b?.planned) ?? 0,
    suggested: planningStoredTonnes(b?.suggested) ?? 0,
    indent: planningStoredTonnes(b?.indent),
    plant: typeof b?.plant === 'string' && b.plant ? b.plant : null,
    split: planningSplitOf(b?.split),
  }
}

// What holds Finalise back (#255): a row with Planned > 0 and no plant (a two-plant row still on
// Choose…), or a split whose parts do not add up to Planned. In sheet order (section, then the
// master's order), so "first" is the first such row on screen. A "No plant can make" row does NOT
// hold it back: it is never assigned (#250), stays red, and is counted in the summary — were it a
// blocker, a region with any capability gap (South RHS 145x82 3.0, Buffer 50) could never finalise.
export function planningFinaliseBlockers(rows = []) {
  const order = (r) => { const i = PLANNING_SECTIONS.indexOf(r.section); return i < 0 ? PLANNING_SECTIONS.length : i }
  return rows.map((r, i) => ({ r, i }))
    .filter(({ r }) => r.needsPlant || (r.assign === 'split' && !r.splitOk))
    .sort((a, b) => order(a.r) - order(b.r) || a.i - b.i)
    .map(({ r }) => ({ rowKey: r.id, why: r.needsPlant ? 'needs a plant' : 'split does not add up to Planned' }))
}

// The Finalise button's state for one region and month.
function planningFinaliseState(rows, campaign) {
  if (planningIsFinalised(campaign)) {
    return { finalised: true, at: campaign.finalisedAt, by: campaign.finalisedBy || '', blockers: [], first: null, reason: '' }
  }
  const blockers = planningFinaliseBlockers(rows)
  const need = blockers.filter(b => b.why === 'needs a plant').length
  const off = blockers.length - need
  const reason = [
    need && `${need} ${need === 1 ? 'row needs' : 'rows need'} a plant`,
    off && `${off} ${off === 1 ? 'split does' : 'splits do'} not add up to Planned`,
  ].filter(Boolean).join(' · ')
  return { finalised: false, at: null, by: '', blockers, first: blockers[0]?.rowKey || null, reason }
}

// A plant-cell value in words, for the change log: "Hyderabad", "Hyd 45 · Lep 75", "no plant".
export function planningAssignLabel(value, plants = []) {
  const split = planningSplitOf(value)
  const named = (id) => plants.find(p => p.id === id)
  if (split) {
    const ids = [...plants.map(p => p.id).filter(id => id in split), ...Object.keys(split).filter(id => !named(id))]
    return ids.length ? ids.map(id => `${named(id)?.short || id} ${planningStoredTonnes(split[id]) ?? 0}`).join(' · ') : 'Split, no parts typed'
  }
  if (typeof value === 'string' && value) return named(value)?.name || value
  return 'no plant'
}

// One logged change as the footer shows it.
function planningChangeView(c, rows, g) {
  const r = rows.find(x => x.id === c.rowKey)
  const label = r ? `${r.size} ${Number(r.thickness).toFixed(1)}` : String(c.rowKey).split('|').slice(1).join(' ')
  const say = (v) => (c.field === 'planned' ? `${planningStoredTonnes(v) ?? 0}` : planningAssignLabel(v, g.plants))
  return { ...c, label, what: c.field === 'planned' ? 'Planned' : 'Plant', fromLabel: say(c.from), toLabel: say(c.to) }
}

// The row's plant cell as a stored value: a split (typed parts only), the plant it is on, or ''.
const planningAssignValue = (r) => (r?.assign === 'split' ? planningCleanAssign(r.split || {}) : (r?.plant || ''))
// A split without its untyped parts; a plant id as itself.
function planningCleanAssign(v) {
  const split = planningSplitOf(v)
  if (!split) return typeof v === 'string' ? v : ''
  return Object.fromEntries(Object.entries(split).map(([k, t]) => [k, planningStoredTonnes(t)]).filter(([, t]) => t != null))
}
function planningSameAssign(a, b) {
  const x = planningCleanAssign(a)
  const y = planningCleanAssign(b)
  if (typeof x === 'string' || typeof y === 'string') return x === y
  const keys = new Set([...Object.keys(x), ...Object.keys(y)])
  return [...keys].every(k => x[k] === y[k])
}

// FINALISE one region's campaign for one month (#283). Pure: `{ stored, problem }`.
//   rows  the region's rows exactly as `planningCampaignView` shows them now (planned, suggested,
//         indent, assign, plant, split, needsPlant, splitOk) — what is on screen is what is kept.
//   by    the login that pressed it; at  the ISO time (passed in, so StrictMode's second run of the
//         updater writes the same row).
// Refused while `planningFinaliseBlockers` names a row, and when the month is already final.
// It writes, once:
//   - the Baseline — every row with Planned > 0 or an Indent, as shown;
//   - into `lines`, every untyped row's Planned > 0 as typed, with that suggestion as its basis, so
//     the plan no longer follows the suggestion: an Indent edit after this moves Suggested only
//     and the row turns amber. A row typed before Finalise keeps its own figure and basis;
//   - into `lines`, every carried plant (last month's) as chosen, so a later edit of last month
//     cannot move this month's plant;
//   - into `lines[rowKey].weeks`, each plant's proposed week for every row on it (#285), so the
//     week plan does not move by itself after this.
export function planningCampaignFinalise(stored, where = {}, { rows = [], by = '', at = new Date().toISOString(), makeId = () => crypto.randomUUID() } = {}) {
  const list = stored || []
  const refuse = (problem) => ({ stored: list, problem })
  const region = String(where.region ?? '').trim()
  const month = String(where.month ?? '')
  if (!region || !/^\d{4}-\d{2}$/.test(month)) return refuse('Pick a region and a month.')
  const current = planningCampaignOf(list, region, month)
  if (planningIsFinalised(current)) return refuse(`${region} ${month} is already finalised. A finalised plan is changed row by row, with a reason.`)
  const blockers = planningFinaliseBlockers(rows)
  if (blockers.length) return refuse(`Cannot finalise yet: ${planningFinaliseState(rows, null).reason}.`)
  const who = String(by ?? '').trim()
  if (!who) return refuse('Sign in again: Finalise records who pressed it.')

  const lines = { ...(current?.lines || {}) }
  const baseline = {}
  rows.forEach(r => {
    const planned = num(r.planned)
    if (planned > 0 || r.indent != null) {
      baseline[r.id] = {
        planned, suggested: num(r.suggested), indent: r.indent ?? null,
        plant: r.assign === 'split' ? null : (r.plant || null),
        split: r.assign === 'split' ? { ...(r.split || {}) } : null,
      }
    }
    const line = { ...(lines[r.id] || {}) }
    let touched = false
    if (r.typed == null && planned > 0) { line.planned = planned; line.basis = num(r.suggested); touched = true }
    if (r.assign === 'carried' && r.plant) { line.plant = r.plant; delete line.split; touched = true }
    if (touched) lines[r.id] = line
  })
  // The week plan (#285): each plant's proposed weeks are stored now, so nothing moves by itself.
  const weeks = planningWeeks(month)
  Object.keys(rows[0]?.assigned || {}).forEach(plant => {
    planningPlantRun(rows, plant, weeks).forEach(({ r, proposed }) => {
      if (!weeks[proposed]) return
      const line = { ...(lines[r.id] || {}) }
      line.weeks = { ...(line.weeks && typeof line.weeks === 'object' ? line.weeks : {}), [plant]: { week: weeks[proposed].key } }
      lines[r.id] = line
    })
  })
  const value = { region, month, lines, deleted: false, finalisedAt: at, finalisedBy: who, baseline, changes: [] }
  if (current) return { stored: list.map(c => (c === current ? { ...c, ...value } : c)), problem: null }
  return { stored: [...list, { id: makeId(), ...value }], problem: null }
}

// ── Week plan: the app's proposal per plant (ticket #284, decision #273) ───────────────────────
// Once a region's month is FINALISED, each of its plants gets a week plan: the rows assigned to
// that plant (a split row's part on each of its plants), in RUN ORDER, each WHOLE row placed in one
// week. View only — moving a row or dividing it across weeks is the planner's (ticket #285), and no
// capacity is checked (#272 is out of scope). The proposal is built from the latest plan, so a
// logged change after Finalise moves it with the plan.
//
// WEEKS (a simple default, not a rule — #273 "user will handle it"):
//   - weeks run Mon–Sun, cut at the month's own edges;
//   - a part week of fewer than 3 working days joins its neighbour — the first part week the week
//     after it, the last part week the week before it (Nov 2026: Sun 1 → W1, Mon 30 → W4);
//   - working days are Mon–Sat; a week's share of the plant's month is its working days ÷ the
//     month's. There is no per-plant calendar.
const PLANNING_WEEK_MIN_DAYS = 3
const PLANNING_DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

// The weeks of month 'YYYY-MM': [{ key: 'W1', from: '2026-11-01', to: '2026-11-08', days: 6,
// share: 6 / 25, label: '1–8 Nov', joined: 'Sun 1 Nov' | null, monday: '2026-11-02',
// mondayLabel: 'Mon' }]. `days` = Mon–Sat days in it. `monday` is the day the week is measured
// from (#274's "Monday figure"): its first Monday, or its first day when it has none (Tue 1 Dec).
// Four or five weeks, by how the month falls.
export function planningWeeks(month) {
  const m = String(month ?? '')
  if (!/^\d{4}-\d{2}$/.test(m)) return []
  const [y, mo] = [Number(m.slice(0, 4)), Number(m.slice(5, 7))]
  const last = new Date(Date.UTC(y, mo, 0)).getUTCDate()
  const iso = (d) => `${m}-${String(d).padStart(2, '0')}`
  const dow = (d) => new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  const parts = []
  for (let d = 1; d <= last; d++) {
    if (d === 1 || dow(d) === 1) parts.push({ from: d, to: d, days: 0 })
    const p = parts[parts.length - 1]
    p.to = d
    if (dow(d) !== 0) p.days++
  }
  const dayName = (d) => `${PLANNING_DOW[dow(d)]} ${d}`
  const partLabel = (p) => `${p.from === p.to ? dayName(p.from) : `${dayName(p.from)}–${dayName(p.to)}`} ${planningMonthAbbr(m)}`
  const weeks = parts.map(p => ({ ...p, joined: [] }))
  if (weeks.length > 1 && weeks[0].days < PLANNING_WEEK_MIN_DAYS) {
    const [a, b] = weeks.splice(0, 2)
    weeks.unshift({ from: a.from, to: b.to, days: a.days + b.days, joined: [partLabel(a), ...b.joined] })
  }
  if (weeks.length > 1 && weeks[weeks.length - 1].days < PLANNING_WEEK_MIN_DAYS) {
    const [a, b] = weeks.splice(-2, 2)
    weeks.push({ from: a.from, to: b.to, days: a.days + b.days, joined: [...a.joined, partLabel(b)] })
  }
  const total = weeks.reduce((t, w) => t + w.days, 0)
  return weeks.map((w, i) => {
    let mon = w.from
    while (mon < w.to && dow(mon) !== 1) mon++
    if (dow(mon) !== 1) mon = w.from
    return {
      key: `W${i + 1}`, from: iso(w.from), to: iso(w.to), days: w.days, share: total ? w.days / total : 0,
      label: `${w.from}–${w.to} ${planningMonthAbbr(m)}`, joined: w.joined.length ? w.joined.join(', ') : null,
      monday: iso(mon), mondayLabel: dow(mon) === 1 ? 'Mon' : dayName(mon),
    }
  })
}

// A row's size as numbers to sort by, smallest first: CHS by NB; SHS / RHS by the larger side,
// then the smaller (`planningSizeKey` writes the larger first). An unreadable size sorts last.
function planningSizeDims(size) {
  const k = planningSizeKey(size)
  const dims = k ? k.split(' ')[1].split('x').map(Number) : []
  return dims.length && dims.every(Number.isFinite) ? dims : [Infinity]
}

// RUN ORDER (#273, campaign-planning-parameters.md R6): section (SHS, RHS, CHS — the sheet's
// order), then size smallest first, then thin → thick. A section or size change is a roll change;
// a gauge step inside one size is an adjustment, so each size runs once, thin to thick. Returns a
// sorted copy; ties keep their input order.
export function planningRunOrder(rows = []) {
  const sec = (r) => { const i = PLANNING_SECTIONS.indexOf(r.section); return i < 0 ? PLANNING_SECTIONS.length : i }
  return rows.map((r, i) => ({ r, i, dims: planningSizeDims(r.size) })).sort((a, b) => {
    const s = sec(a.r) - sec(b.r)
    if (s) return s
    for (let k = 0; k < Math.max(a.dims.length, b.dims.length); k++) {
      const d = (a.dims[k] ?? 0) - (b.dims[k] ?? 0)
      if (d) return d
    }
    return num(a.r.thickness) - num(b.r.thickness) || a.i - b.i
  }).map(x => x.r)
}

// Size changes along a run: each step from one row to the next of a different section or size.
export const planningSizeChanges = (seq = []) =>
  seq.reduce((n, r, i) => n + (i > 0 && (seq[i - 1].section !== r.section || planningSizeKey(seq[i - 1].size) !== planningSizeKey(r.size)) ? 1 : 0), 0)

// The proposal: walk the run order, and put each WHOLE row in the week where the middle of its
// tonnes falls, each week owning its working-day share of the month. Returns a week index per row.
// Whole rows only, so a week's tonnes are near its share, not equal to it; the month adds up.
export function planningProposeWeeks(tonnes = [], weeks = []) {
  const total = tonnes.reduce((t, v) => t + num(v), 0)
  if (!weeks.length) return tonnes.map(() => -1)
  const edges = []
  weeks.reduce((c, w) => { edges.push(c + w.share); return c + w.share }, 0)
  let cum = 0
  return tonnes.map(v => {
    const mid = total > 0 ? (cum + num(v) / 2) / total : 0
    cum += num(v)
    const w = edges.findIndex(e => mid <= e + 1e-9)
    return w < 0 ? weeks.length - 1 : w
  })
}

// ── Week plan: stored weeks, moves and splits (ticket #285, decisions #273 Q2/Q9/Q10, #274) ────
// "Nothing moves by itself." Once a planner can move a row, the weeks are STORED — in the row's own
// line, per plant, so no new column is needed:
//   lines[rowKey].weeks = { hyderabad: { week: 'W2' } }                          whole row in W2
//                         { lepakshi: { week: 'W2', split: { W2: 30, W3: 20 } } } a kept split
//                         { lepakshi: { week: 'W2', draft: { W2: 30 } } }         parts being typed
// `week` is the row's MAIN week: where a whole row sits, and a kept split's biggest part.
// Finalise writes every row's proposed week (`planningCampaignFinalise`), and a month finalised
// before that is kept the first time a row of the plant is moved (`planningWeekSave`), so a later
// Planned change re-places no other row. A whole-row week follows the row's tonnes, so a logged
// Planned change (#283) lands in the same week. Typed parts (`draft`) are red until they add up to
// the row's tonnes on that plant, and until then are NOT taken as the plan: the row keeps its plan
// as it was (whole in `week`, or its kept split), so the weeks always add up to the plant's month.
// Once they add up they are kept (`split`). A Planned change on a kept split (option B, user
// 11-Nov-2026): the MAIN week takes the difference and every other week keeps its part — 60 · 40,
// Planned 100 → 120, reads 80 · 40. A cut bigger than the main week's part empties it and takes the
// rest off the latest weeks first, and the row goes red to be checked. Only a row with no stored
// week (one that came onto the plant after Finalise) still follows the proposal.
// Every move or split that changes a week's figures is logged in the campaign's `changes`, with no
// reason (#273 Q10): { id, at, by, rowKey, field: 'week', plant, from: { W1: 100 }, to: { W2: 100 } }.

// A week figure array as a log value: { W2: 60, W3: 40 }, weeks with tonnes only.
const planningWeekFigures = (figures, weeks) =>
  Object.fromEntries(weeks.map((w, j) => [w.key, Math.round(num(figures[j]) * 1000) / 1000]).filter(([, v]) => v > PLANNING_SPLIT_EPS))

// A row's main week in a set of parts: the biggest part, the earliest on a tie.
function planningWeekMain(parts, weeks) {
  let best = null
  weeks.forEach(w => { if (num(parts?.[w.key]) > PLANNING_SPLIT_EPS && (best == null || num(parts[w.key]) > num(parts[best]) + PLANNING_SPLIT_EPS)) best = w.key })
  return best
}

// Parts set to `tonnes`: the main week takes the difference, every other week keeps its part. A
// cut bigger than the main week's part empties it and takes the rest off the latest weeks first
// (`cut`: the row is red, to be checked). Returns { parts: { W1: T, … } over every week, cut }.
function planningWeekAdjust(parts, tonnes, main, weeks) {
  const round = (v) => Math.round(v * 1000) / 1000
  const out = Object.fromEntries(weeks.map(w => [w.key, num(parts?.[w.key])]))
  const d = num(tonnes) - Object.values(out).reduce((t, v) => t + v, 0)
  const key = weeks.some(w => w.key === main) ? main : weeks[0]?.key
  if (Math.abs(d) < PLANNING_SPLIT_EPS || !key) return { parts: out, cut: false }
  out[key] = round(out[key] + d)
  if (out[key] >= -PLANNING_SPLIT_EPS) { out[key] = Math.max(0, out[key]); return { parts: out, cut: false } }
  let rem = -out[key]
  out[key] = 0
  ;[...weeks].reverse().forEach(w => {
    if (w.key === key || rem <= 0) return
    const take = Math.min(rem, out[w.key])
    out[w.key] = round(out[w.key] - take)
    rem = round(rem - take)
  })
  return { parts: out, cut: true }
}

// A log value as a week figure array at the row's tonnes now, by the same rule as a kept split:
// its main week takes the difference. One week holding the row = the whole row there, whatever its
// tonnes are now. So a Planned change rewrites the Monday figure too (#274).
function planningWeekFiguresOf(value, tonnes, weeks) {
  const v = value && typeof value === 'object' ? value : {}
  const main = planningWeekMain(v, weeks)
  if (!main) return weeks.map(() => 0)
  const { parts } = planningWeekAdjust(v, tonnes, main, weeks)
  return weeks.map(w => parts[w.key])
}

// "W2" for a whole row, "W2 60 · W3 40" for a split.
export function planningWeekLabel(value) {
  const v = value && typeof value === 'object' ? value : {}
  const keys = Object.keys(v).filter(k => num(v[k]) > PLANNING_SPLIT_EPS)
  if (!keys.length) return 'no week'
  if (keys.length === 1) return keys[0]
  return keys.map(k => `${k} ${planningTonnes(v[k])}`).join(' · ')
}

// One row's place in one plant's weeks: the stored week (or the proposal's when none is stored),
// a kept split set to the row's tonnes now, and any parts still being typed. `weeks` is what the
// row puts in each week; `split` the parts the screen shows (typed, else the kept split as it
// stands now; null for a whole row); `ok` false while typed parts do not add up or a cut was too big.
function planningWeekPlaced(at, tonnes, weeks, proposed) {
  const idx = (k) => weeks.findIndex(w => w.key === k)
  const obj = (v) => (v && typeof v === 'object' ? v : null)
  const stored = !!(obj(at) && idx(at.week) >= 0)
  const week = stored ? idx(at.week) : proposed
  const kept = stored ? obj(at.split) : null
  const typed = stored ? obj(at.draft) : null
  const sumOf = (v) => Math.round(Object.values(v).reduce((t, x) => t + num(x), 0) * 1000) / 1000
  let figures = weeks.map((_, j) => (j === week ? tonnes : 0))
  let cut = false
  if (kept) {
    const set = planningWeekAdjust(kept, tonnes, at.week, weeks)
    figures = weeks.map(w => set.parts[w.key])
    cut = set.cut
  }
  let split = null
  let ok = null
  if (typed) {
    split = Object.fromEntries(weeks.map(w => [w.key, planningStoredTonnes(typed[w.key])]))
    ok = Math.abs(sumOf(split) - tonnes) < PLANNING_SPLIT_EPS
    if (ok) figures = weeks.map(w => num(split[w.key]))
  } else if (kept) {
    split = Object.fromEntries(weeks.map((w, j) => [w.key, w.key in kept ? figures[j] : null]))
    ok = !cut
  }
  return { stored, week, split, splitTotal: split ? sumOf(split) : null, splitOk: ok, cut: !typed && cut, weeks: figures }
}

// One plant's rows in run order with the proposal's week for each: what Finalise stores and what
// the view starts from. A row is on the plant when it puts tonnes there (`r.assigned`).
function planningPlantRun(rows, plant, weeks) {
  const seq = planningRunOrder((rows || []).filter(r => num(r.assigned?.[plant]) > PLANNING_SPLIT_EPS))
  const at = planningProposeWeeks(seq.map(r => r.assigned[plant]), weeks)
  return seq.map((r, i) => ({ r, tonnes: Math.round(num(r.assigned[plant]) * 1000) / 1000, proposed: at[i] }))
}

// ── The coil each row needs (ticket #286, decision #276) ───────────────────────────────────────
// Guidance only: nothing is reserved, nothing is written, and Production's coil choice is untouched.
//
//   coil on hand at THE ROW'S PLANT (`coilOnHand`: slit coil not yet used + HR coil not yet slit)
//   rows' tonnes still to make, week by week (W1, W2, …; each week in run order)
//      └► slit coil that FITS: same plant, same thickness band, width within ± 5 mm of the strip
//      └► then HR coil of the band (any width: it is still to be slit)
//      └► the rest is SHORT: amber "needs X by <week's Monday>", red "now" in a closed week
//
// Bands are `thicknessBucket` (the Coil Tracker's, #265) for coil and row alike, so 3.2 mm coil is
// 3.0 coil. Yield is 1 : 1, no scrap allowance (Production books coil at the tube weight). A slit
// coil goes into ONE run (ADR-0015, user 12-Nov-2026): it is given whole to one row, and what the row
// does not need stays with that row, never another. HR coil is still to be slit, so it is shared in
// tonnes. A row's tonnes already
// MADE this month (`made`, capped at the row's tonnes on the plant) have used their coil — it is no
// longer on hand — so they come off the row's earliest weeks first and ask for none.
const PLANNING_STRIP_FIT_MM = 5

// Strip width (CONTEXT.md), mm: SHS / RHS = perimeter − 4; CHS = π × (OD − t) + 2, the OD read from
// the SKU master by NB (`odOf(nb)`). Null when the size cannot be read or a CHS has no OD on file.
export function planningStripWidth(size, thickness, odOf = () => null) {
  const k = planningSizeKey(size)
  if (!k) return null
  const [sec, dims] = k.split(' ')
  if (sec === 'CHS') {
    const od = num(odOf(Number(dims)))
    const t = num(thickness)
    return od > 0 && t > 0 && od > t ? Math.PI * (od - t) + 2 : null
  }
  const [a, b] = dims.split('x').map(Number)
  return 2 * (a + b) - 4
}

// NB → OD (mm) from the SKU master's own `outsideDiameter`; the most common one if codes disagree.
export function planningOdByNb(skus = []) {
  const seen = new Map()
  ;(skus || []).forEach(s => {
    const nb = Number(String(s?.nominalBore ?? '').trim())
    const od = Number(String(s?.outsideDiameter ?? '').trim())
    if (!(nb > 0) || !(od > 0)) return
    const m = seen.get(nb) || new Map()
    m.set(od, (m.get(od) || 0) + 1)
    seen.set(nb, m)
  })
  const out = new Map()
  seen.forEach((m, nb) => out.set(nb, [...m.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0])[0][0]))
  return out
}

// "Mon 9 Nov" — the day a week is measured from (`planningWeeks(…).monday`).
export function planningNeedByLabel(week) {
  const iso = String(week?.monday || week?.from || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return ''
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return `${PLANNING_DOW[dow]} ${planningDayLabel(iso)}`
}

// One plant's hand-out. `rows` in run order, each { id, size, thickness, tonnes, weeks: [T], made };
// `weeks` from `planningWeeks`; `onHand` from `coilOnHand`. A week is CLOSED once its last day is
// before `today`. Returns
//   rows   { [id]: { band, strip, need, slit, hr, short, by } }   by = { week, index, now, label } | null
//   bands  [{ band, need, slit, hr, hrOnHand, slitOnHand, short, by }]  thinnest first
//   short  Σ short; shortBands — the bands short, earliest need first
export function planningCoilHandOut(rows = [], weeks = [], onHand = {}, { plant = '', today: todayIso = today(), odOf = () => null } = {}) {
  const NOW = String(todayIso).slice(0, 10)
  const EPS = PLANNING_SPLIT_EPS
  const round = (v) => Math.round(v * 1000) / 1000
  const mine = (c) => c && c.plant === plant
  // Slit coil, oldest slit first (FIFO), then by id so the hand-out is the same on every render.
  const slit = (onHand.slit || []).filter(mine)
    .map(c => ({ id: c.id, band: thicknessBucket(c.thickness), width: num(c.width), left: num(c.weight), row: null, at: String(c.coil?.dateOfConversion ?? '') }))
    .filter(c => c.band != null && c.left > EPS)
    .sort((a, b) => a.at.localeCompare(b.at) || String(a.id).localeCompare(String(b.id)))
  const slitStart = {}
  slit.forEach(c => { slitStart[c.band] = (slitStart[c.band] || 0) + c.left })
  const hrStart = {}
  ;(onHand.hr || []).filter(mine).forEach(c => {
    const b = thicknessBucket(c.thickness)
    if (b != null) hrStart[b] = (hrStart[b] || 0) + num(c.weight)
  })
  const hrLeft = { ...hrStart }
  const closed = weeks.map(w => String(w.to) < NOW)
  const byOf = (j) => ({ week: weeks[j].key, index: j, now: closed[j], label: closed[j] ? 'now' : planningNeedByLabel(weeks[j]) })
  const out = rows.map(r => {
    let made = Math.max(0, Math.min(num(r.made), num(r.tonnes)))
    const toMake = weeks.map((_, j) => { const v = num(r.weeks?.[j]); const off = Math.min(made, v); made -= off; return v - off })
    return { id: r.id, band: thicknessBucket(r.thickness), strip: planningStripWidth(r.size, r.thickness, odOf), toMake, need: 0, slit: 0, hr: 0, short: 0, by: null }
  })
  const bands = new Map()
  const bandOf = (b) => {
    if (!bands.has(b)) bands.set(b, { band: b, need: 0, slit: 0, hr: 0, short: 0, by: null })
    return bands.get(b)
  }
  weeks.forEach((_, j) => out.forEach(R => {
    let n = R.toMake[j]
    if (!(n > EPS)) return
    R.need += n
    const B = R.band != null ? bandOf(R.band) : null
    if (B) B.need += n
    if (B && R.strip != null) {
      for (const c of slit) {
        if (n <= EPS) break
        if (c.band !== R.band || c.left <= EPS || !(c.width > 0) || Math.abs(c.width - R.strip) > PLANNING_STRIP_FIT_MM + 1e-6) continue
        if (c.row != null && c.row !== R.id) continue   // already given whole to another row
        c.row = R.id
        const k = Math.min(n, c.left)
        c.left -= k; n -= k; R.slit += k; B.slit += k
      }
    }
    if (B) {
      const k = Math.min(n, hrLeft[R.band] || 0)
      if (k > 0) { hrLeft[R.band] -= k; n -= k; R.hr += k; B.hr += k }
    }
    if (n > EPS) {
      R.short += n
      if (!R.by) R.by = byOf(j)
      if (B) { B.short += n; if (!B.by) B.by = byOf(j) }
    }
  }))
  const tidy = (x) => ({ need: round(x.need), slit: round(x.slit), hr: round(x.hr), short: x.short > EPS ? round(x.short) : 0, by: x.short > EPS ? x.by : null })
  const bandList = [...bands.values()].sort((a, b) => a.band - b.band)
    .map(B => ({ band: B.band, ...tidy(B), hrOnHand: round(hrStart[B.band] || 0), slitOnHand: round(slitStart[B.band] || 0) }))
  return {
    rows: Object.fromEntries(out.map(R => [R.id, { band: R.band, strip: R.strip, ...tidy(R) }])),
    bands: bandList,
    short: round(bandList.reduce((t, B) => t + B.short, 0) + out.filter(R => R.band == null).reduce((t, R) => t + R.short, 0)),
    shortBands: bandList.filter(B => B.short > 0).sort((a, b) => a.by.index - b.by.index || a.band - b.band),
  }
}

// ── Monitoring: one plant's plan against what it made (ticket #287, decision #274) ────────────
//
//   week closes ─► the plant's credited tonnes vs the week's plan ─► short > 10 % (min 1 T)? ─► RED
//                                                                 └► rows not made ─► AMBER until moved
//   Baseline = made (credited) + plan changed + behind + still to come      ← always adds up
//
// CREDITED: a row's production at the plant this month (to today), in date order, counted up to the
// row's tonnes there — whatever week it was made in. What runs past the plan is MADE OFF PLAN, as is
// production on a row with no plan at the plant and on a size with no master row: listed beside the
// gap, never credited, and never part of a week's tonnes. A week's MADE is the credited tonnes dated
// in it. A closed week is judged on what it held on its MONDAY (`was`, #285), so moving its unmade
// rows out afterwards cannot clear its red; the move does clear the rows' amber. A row is never red:
// one whose closed weeks are not made (outside 1 T or 5 % of its plan) is amber until moved.
// BEHIND is the closed weeks' plan (latest) less everything credited so far, counted once a closed
// week is red and the total breaks the same rule — a plant that made a short week up later is behind
// no more, though that week stays red. "entered to" checks the week's last WORKING day (Mon–Sat).
const PLANNING_ROW_MADE_SHARE = 0.05
const PLANNING_ROW_MADE_MIN_T = 1
const planningRowTolerance = (t) => Math.max(PLANNING_ROW_MADE_MIN_T, PLANNING_ROW_MADE_SHARE * num(t))

// What a row's Baseline put on plant `plant`: its split part there, else all of it when the
// Baseline's plant is this one.
function planningBaselineOn(b, plant) {
  if (!b) return 0
  if (b.split) return num(b.split[plant])
  return b.plant === plant ? num(b.planned) : 0
}

// `g` the campaign view's region, `p` the plant, `rows` the plant's week-plan rows (`id`, `tonnes`,
// `weeks`), `weeks` from `planningWeeks`. Sets `monitor` on each row and returns the plant's.
function planningMonitorPlant(g, p, rows, weeks, { today: NOW, entered: enteredDay = null }) {
  const round = (v) => Math.round(v * 1000) / 1000
  const EPS = PLANNING_SPLIT_EPS
  const closed = weeks.map(w => String(w.to) < NOW)
  const weekOf = (day) => weeks.findIndex(w => day >= w.from && day <= w.to)
  const madeIn = weeks.map(() => 0)
  const source = new Map((g.rows || []).map(r => [r.id, r]))
  const daysAt = (cell) => Object.entries(cell?.madeDays?.[p.id] || {}).sort(([a], [b]) => a.localeCompare(b))
  const label = (r) => `${r.section} ${r.size} ${Number(r.thickness).toFixed(1)}`
  const offLines = []
  const onPlant = new Set(rows.map(r => r.id))

  rows.forEach(r => {
    const src = source.get(r.id)
    let room = r.tonnes
    let produced = 0
    let credited = 0
    daysAt(src).forEach(([day, w]) => {
      const c = Math.max(0, Math.min(w, room))
      room -= c; produced += w; credited += c
      const j = weekOf(day)
      if (j >= 0) madeIn[j] += c
    })
    const plan = r.tonnes
    const baseline = round(planningBaselineOn(src?.baseline, p.id))
    const due = round(weeks.reduce((t, _, j) => t + (closed[j] ? num(r.weeks[j]) : 0), 0))
    const short = round(due - credited)
    let status
    let behind = 0
    if (plan > EPS && plan - credited <= planningRowTolerance(plan) + 1e-9) status = { tone: 'green', label: 'made' }
    else if (due > EPS && short > planningRowTolerance(plan) + 1e-9) {
      behind = short
      const unmade = weeks.filter((w, j) => closed[j] && num(r.weeks[j]) > EPS).map(w => w.key).join(', ')
      status = { tone: 'amber', label: credited <= PLANNING_SHOW_MT ? `${unmade} not made` : `due ${Math.round(short)} more` }
    } else if (due > EPS) status = { tone: 'plain', label: 'on track' }
    else if (credited > PLANNING_SHOW_MT) status = { tone: 'plain', label: 'started' }
    else status = { tone: 'plain', label: 'not due yet' }
    const offPlan = round(produced - credited)
    if (offPlan > EPS) offLines.push({ label: label(r), tonnes: offPlan, why: 'past its plan' })
    r.monitor = {
      plan, baseline, changed: round(baseline - plan), produced: round(produced), credited: round(credited), offPlan,
      due, behind: round(behind), toCome: round(plan - credited - behind), pct: plan > EPS ? credited / plan : null, status,
    }
  })

  // Rows of the region that are not on this plant: production there is off plan; a Baseline there
  // (a row moved off the plant since Finalise) is plan changed.
  let leftBaseline = 0
  ;(g.rows || []).filter(r => !onPlant.has(r.id)).forEach(r => {
    leftBaseline += planningBaselineOn(r.baseline, p.id)
    const t = round(num(r.made?.byPlant?.[p.id]))
    if (t > EPS) offLines.push({ label: label(r), tonnes: t, why: 'no plan at this plant' })
  })
  ;(g.outside?.lines || []).forEach(o => {
    const t = round(num(o.made?.byPlant?.[p.id]))
    if (t > EPS) offLines.push({ label: o.label, tonnes: t, why: 'no master row' })
  })
  offLines.sort((a, b) => b.tonnes - a.tonnes || a.label.localeCompare(b.label))

  const total = (f) => round(rows.reduce((t, r) => t + r.monitor[f], 0))
  const plan = total('plan')
  const credited = total('credited')
  const baseline = round(total('baseline') + leftBaseline)
  const enteredLabel = enteredDay ? `entered to ${planningDayLabel(enteredDay)}` : 'no production entered'
  const lastWorking = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() === 0 ? addDaysIso(iso, -1) : iso)
  const weekRows = weeks.map((w, j) => {
    // A closed week's plan as it stood on its Monday: a row moved out since then still counts.
    const plan = round(rows.reduce((t, r) => t + num(closed[j] && r.was?.[j] != null ? r.was[j] : r.weeks[j]), 0))
    const made = round(madeIn[j])
    const judged = closed[j] ? planningWeekShort(plan, made) : { short: 0, red: false }
    return {
      key: w.key, closed: closed[j], plan, planNow: round(rows.reduce((t, r) => t + num(r.weeks[j]), 0)), made, short: judged.short, red: judged.red,
      entered: closed[j] && !(enteredDay >= lastWorking(w.to)) ? enteredLabel : null,
    }
  })
  const closedPlan = round(rows.reduce((t, r) => t + weeks.reduce((u, _, j) => u + (closed[j] ? num(r.weeks[j]) : 0), 0), 0))
  const owed = planningWeekShort(closedPlan, credited)
  const behind = owed.red && weekRows.some(w => w.red) ? owed.short : 0
  return {
    weeks: weekRows, plan, baseline, changed: round(baseline - plan), credited, pct: plan > EPS ? credited / plan : null,
    closedPlan, behind, toCome: round(plan - credited - behind),
    offPlan: { tonnes: round(offLines.reduce((t, l) => t + l.tonnes, 0)), lines: offLines },
    entered: enteredDay || null,
  }
}

// A region's monitoring: the plain sum of its plants'. Never red — red is a plant's week.
function planningMonitorRegion(plants, weeks, NOW) {
  const round = (v) => Math.round(v * 1000) / 1000
  const sum = (f) => round(plants.reduce((t, p) => t + p.monitor[f], 0))
  const plan = sum('plan')
  const credited = sum('credited')
  return {
    weeks: weeks.map((w, j) => ({
      key: w.key, closed: String(w.to) < NOW,
      plan: round(plants.reduce((t, p) => t + p.monitor.weeks[j].plan, 0)),
      made: round(plants.reduce((t, p) => t + p.monitor.weeks[j].made, 0)),
    })),
    plan, baseline: sum('baseline'), changed: sum('changed'), credited, pct: plan > PLANNING_SPLIT_EPS ? credited / plan : null,
    behind: sum('behind'), toCome: sum('toCome'),
    offPlan: { tonnes: round(plants.reduce((t, p) => t + p.monitor.offPlan.tonnes, 0)) },
  }
}

// ── Dispatched, Stock now / Buffer, MTO served (ticket #288, the #274 addendum) ───────────────
// REGION figures shown on a plant's row — Buffer and Indent are set per region, so a split row shows
// the same figure on both plants. Dispatched is the campaign view's `dispatched`: invoice entries
// (the Zoho register, ADR-0013) at their shipping plant, the region's own plants only, dated from the
// 1st of the plan month to today — the rule of its Oct / Aug–Oct. None of this touches red (#287).
//
// Stock now = Open + made − dispatched, region pool, against the row's Buffer: green at or above it,
// plain below, "by design" when under Buffer and Indent ≥ Buffer (#252: the month's sales are served
// out of the buffer). Dispatched beyond Open + made reads "check" (`value` null, `over` the excess),
// never a negative number. A row has a Buffer when it is a Buffer row with a Buffer typed.
const planningRound3 = (v) => Math.round(num(v) * 1000) / 1000
// The row's Buffer in MT when it is a Buffer row with one typed, else null — the one test both
// Stock now and MTO served read.
const planningRowBuffer = ({ type, buffer }) => (type === 'Buffer' && num(buffer) > 0 ? num(buffer) : null)
// Float noise allowed when comparing a stock with its Buffer.
const PLANNING_FLOAT_EPS = 1e-9

export function planningStockNow({ open, made, dispatched, type, buffer, indent } = {}) {
  const value = planningRound3(num(open) + num(made) - num(dispatched))
  const buf = planningRowBuffer({ type, buffer })
  if (value < -PLANNING_SHOW_MT) return { value: null, over: -value, check: true, buffer: buf, tone: 'amber', under: false, byDesign: false }
  const stock = Math.max(0, value)
  // Judged at the one decimal the cell shows, so "100.0 / 100" is never plain.
  const under = buf != null && Math.round(stock * 10) / 10 < buf - PLANNING_FLOAT_EPS
  return { value: stock, over: 0, check: false, buffer: buf, tone: buf != null && !under ? 'green' : 'plain', under, byDesign: under && num(indent) >= buf }
}

// MTO served = dispatched ÷ Monthly Indent, region, on MTO rows — a row with no Buffer (an MTO row,
// or a Buffer row left blank, which plans like one). No indent (blank or 0) with a dispatch reads
// "no indent" (`noIndent`), never 0 %.
export function planningMtoServed({ type, buffer, indent, dispatched } = {}) {
  const sent = planningRound3(dispatched)
  const indentT = num(indent)
  if (planningRowBuffer({ type, buffer }) != null) return { mto: false, indent: indentT, dispatched: sent, pct: null, noIndent: false }
  if (!(indentT > 0)) return { mto: true, indent: 0, dispatched: sent, pct: null, noIndent: sent > PLANNING_SHOW_MT }
  return { mto: true, indent: indentT, dispatched: sent, pct: sent / indentT, noIndent: false }
}

// One campaign row's three region figures.
function planningRowSales(r) {
  const dispatched = planningRound3(r.dispatched?.total)
  return {
    dispatched,
    stock: planningStockNow({ open: r.open?.total, made: r.made?.total, dispatched, type: r.type, buffer: r.buffer, indent: r.indent }),
    served: planningMtoServed({ type: r.type, buffer: r.buffer, indent: r.indent, dispatched }),
  }
}

// The summary line, added up from what the screen shows: Dispatched T = the overview's plant figures
// (each plant's every invoice, on a row or a size with no master row); MTO served and Buffer rows
// over the rows on the region's plant tables, a split row once — MTO served over the MTO rows that
// have an indent (Σ dispatched ÷ Σ indent; `noIndent` counts the rest that were dispatched), Buffer
// rows under Buffer now n of m, a "check" row in neither (unknown is not under).
function planningRegionSales(g, plants) {
  const round = planningRound3
  const seen = new Map()
  plants.forEach(p => p.rows.forEach(r => { if (!seen.has(r.id)) seen.set(r.id, r.sales) }))
  const rows = [...seen.values()]
  const served = rows.map(x => x.served).filter(x => x.mto)
  const withIndent = served.filter(x => x.pct != null)
  const indent = round(withIndent.reduce((t, x) => t + x.indent, 0))
  const dispatchedMto = round(withIndent.reduce((t, x) => t + x.dispatched, 0))
  const buffered = rows.map(x => x.stock).filter(x => x.buffer != null)
  return {
    dispatched: round((g.plants || []).reduce((t, p) => t + num(g.dispatched?.byPlant?.[p.id]), 0)),
    mto: { dispatched: dispatchedMto, indent, pct: indent > 0 ? dispatchedMto / indent : null, noIndent: served.filter(x => x.noIndent).length },
    buffer: { under: buffered.filter(x => x.under).length, of: buffered.filter(x => !x.check).length, check: buffered.filter(x => x.check).length },
  }
}

// The week plans of every region of a `planningCampaignView` (layout D + A on the weekly screen):
//   { month, weeks, regions: [{ region, finalised, plants: [plan], byWeek, total, unplaced, moves }] }
// A region that is not finalised has no plans (`plants: []`) — West's plants stay untouched until
// West finalises. Each plant's plan:
//   { plant, name, short, rows: [{ id, section, size, thickness, type, tonnes, planned, split,
//     revised, week, weeks: [T per week], stored, weekSplit, weekSplitTotal, weekSplitOk, was }],
//     byWeek: [T], target: [T by working days], total, sizeChanges, splitOff }
// A row's `tonnes` is what the row puts on this plant (`r.assigned`, the summary's own figure), so
// a plant's weeks add up to the summary's "T per plant", and a split row is in each plant's plan
// with its own part. A row never crosses plants. `unplaced` is what is in no plant's weeks: the
// "No plant can make" rows and any row left needing a plant. `split` is the PLANT split (#282);
// `weekSplit` the week split (#285). `moves` is the week-move log, newest first.
//
// "was X on Mon" (#274): `was[j]` is week j's figure as it stood on that week's Monday, when a week
// move since then has changed it — else null. A week whose Monday is still to come has none yet.
// Only week moves count: a Planned change is tracked against the Baseline, so it rewrites the
// Monday figure too. A move's day is read off its UTC timestamp, as the app's `today` is.
//
// COIL (#286): pass `coil = { onHand: coilOnHand(…), skus, today }` and each row gets `coil` (Strip ·
// Slit · HR · short · need-by, `planningCoilHandOut`) and each plant `coil: { bands, short,
// shortBands }`, from that plant's coil only. `made` is the row's production this month at the
// plant, capped at its tonnes there. Without `coil` the plan is as before.
export function planningWeekPlanView(view = {}, coil = null) {
  const month = view.month?.key || ''
  const weeks = planningWeeks(month)
  const round = (v) => Math.round(v * 1000) / 1000
  const dayOf = (at) => String(at ?? '').slice(0, 10)
  const odByNb = coil ? planningOdByNb(coil.skus) : new Map()
  const NOW = String(view.today || coil?.today || today()).slice(0, 10)
  const plansOf = (g) => g.plants.map(p => {
    const log = (g.weekLog || []).filter(c => c.plant === p.id).map((c, i) => ({ c, i }))
      .sort((a, b) => String(a.c.at).localeCompare(String(b.c.at)) || a.i - b.i).map(x => x.c)
    const rows = planningPlantRun(g.rows, p.id, weeks).map(({ r, tonnes, proposed }) => {
      const placed = planningWeekPlaced(r.weekAt?.[p.id], tonnes, weeks, proposed)
      // A week whose Monday is still to come has had no move since it, so it has no Monday figure.
      const was = weeks.map((w, j) => {
        const since = log.find(c => c.rowKey === r.id && dayOf(c.at) >= w.monday)
        if (!since) return null
        const then = round(planningWeekFiguresOf(since.from, tonnes, weeks)[j])
        return Math.abs(then - placed.weeks[j]) > PLANNING_SPLIT_EPS ? then : null
      })
      return {
        id: r.id, section: r.section, size: r.size, thickness: r.thickness, type: r.type,
        tonnes, planned: num(r.planned), split: r.assign === 'split', revised: !!r.revised,
        made: round(Math.min(num(r.made?.byPlant?.[p.id]), tonnes)),
        sales: planningRowSales(r),
        week: placed.week, weeks: placed.weeks.map(round), stored: placed.stored,
        weekSplit: placed.split, weekSplitTotal: placed.splitTotal, weekSplitOk: placed.splitOk, weekSplitCut: placed.cut, was,
      }
    })
    const total = round(rows.reduce((t, r) => t + r.tonnes, 0))
    // The coil each row needs (#286), when the caller hands over coil on hand. This plant's coil only.
    const handOut = coil ? planningCoilHandOut(rows, weeks, coil.onHand, { plant: p.id, today: coil.today, odOf: (nb) => odByNb.get(nb) }) : null
    if (handOut) rows.forEach(r => { r.coil = handOut.rows[r.id] })
    const monitor = planningMonitorPlant(g, p, rows, weeks, { today: NOW, entered: view.entered?.[p.id] || null })
    return {
      plant: p.id, name: p.name, short: p.short || p.name, rows, total, monitor,
      dispatched: round(num(g.dispatched?.byPlant?.[p.id])),
      coil: handOut && { bands: handOut.bands, short: handOut.short, shortBands: handOut.shortBands },
      byWeek: weeks.map((_, j) => round(rows.reduce((t, r) => t + r.weeks[j], 0))),
      target: weeks.map(w => round(total * w.share)),
      sizeChanges: planningSizeChanges(rows),
      splitOff: rows.filter(r => r.weekSplit && !r.weekSplitOk).length,
    }
  })
  return {
    month, weeks,
    regions: (view.regions || []).map(g => {
      const finalised = !!g.finalise?.finalised
      const plants = finalised ? plansOf(g) : []
      const label = (r) => `${r.section} ${r.size} ${Number(r.thickness).toFixed(1)}`
      const noPlant = (g.rows || []).filter(r => r.noPlant && num(r.planned) > 0)
      const needPlant = (g.rows || []).filter(r => r.needsPlant)
      const moves = finalised ? [...(g.weekLog || [])].reverse().map(c => {
        const r = (g.rows || []).find(x => x.id === c.rowKey)
        return {
          ...c, plantName: g.plants.find(p => p.id === c.plant)?.name || c.plant,
          label: r ? `${r.size} ${Number(r.thickness).toFixed(1)}` : String(c.rowKey).split('|').slice(1).join(' '),
          fromLabel: planningWeekLabel(c.from), toLabel: planningWeekLabel(c.to),
        }
      }) : []
      return {
        region: g.region, finalised, plants,
        monitor: planningMonitorRegion(plants, weeks, NOW),
        sales: planningRegionSales(g, plants),
        byWeek: weeks.map((_, j) => round(plants.reduce((t, p) => t + p.byWeek[j], 0))),
        total: round(plants.reduce((t, p) => t + p.total, 0)),
        unplaced: {
          noPlant: { tonnes: round(noPlant.reduce((t, r) => t + num(r.planned), 0)), rows: noPlant.map(label) },
          needPlant: { tonnes: round(needPlant.reduce((t, r) => t + num(r.planned), 0)), rows: needPlant.map(label) },
        },
        moves,
      }
    }),
  }
}

// ── Monitoring: plan against actual (ticket #287, decision #274) ───────────────────────────────
// RED is decided only at PLANT × WEEK: a closed week whose credited tonnes are short of that week's
// plan by MORE than 10 %, with a 1 T minimum — plan 100 short 11 → red, short 9 or 10 → not;
// plan 5 short 0.8 → not (under 1 T). A row is never red.
const PLANNING_WEEK_RED_SHARE = 0.10
const PLANNING_WEEK_RED_MIN_T = 1
export function planningWeekShort(plan, made) {
  const short = Math.max(0, Math.round((num(plan) - num(made)) * 1000) / 1000)
  return { short, red: short > Math.max(PLANNING_WEEK_RED_MIN_T, PLANNING_WEEK_RED_SHARE * num(plan)) + 1e-9 }
}

const PLANNING_WEEK_PART_PROBLEM = 'A week part must be blank or a number of MT, 0 or more.'

// One week move or split of one row on one plant (ticket #285). Pure: `{ stored, problem }`; on a
// problem `stored` is the input, unchanged. Admin only — the tab is (#275).
//   where   { region, month: 'YYYY-MM', rowKey, plant }
//   change  { week: 'W2' }                          the whole row to W2 (ends a split)
//           { split: true }                         Split… — the parts start untyped, the row red
//           { part: { week: 'W3', tonnes: '40' } }  one week's part ('' clears it)
//   plan    the plant's plan as `planningWeekPlanView` shows it now (its rows' weeks and tonnes)
// Never anything else: a row's plant changes on the Monthly campaign, with a reason (#283), and a
// row that is not on this plant cannot be put in its weeks. No reason is asked; who and when are
// logged when a week's figures change. The first move on a plant keeps every other row of it where
// the screen showed it, so nothing else moves afterwards.
export function planningWeekSave(stored, where = {}, change = {}, {
  plan = null, by = '', at = new Date().toISOString(), changeId = () => crypto.randomUUID(),
} = {}) {
  const list = stored || []
  const refuse = (problem) => ({ stored: list, problem })
  const region = String(where.region ?? '').trim()
  const month = String(where.month ?? '')
  const rowKey = String(where.rowKey ?? '')
  const plant = String(where.plant ?? '')
  if (!region || !/^\d{4}-\d{2}$/.test(month) || !rowKey || !plant) return refuse('Pick a region, a month, a plant and a row.')
  const current = planningCampaignOf(list, region, month)
  if (!planningIsFinalised(current)) return refuse(`${region} ${month} is not finalised: the week plan is proposed once it is.`)
  if (Object.keys(change || {}).some(k => !['week', 'split', 'part'].includes(k))) {
    return refuse('The week plan moves a row between weeks only. Its plant changes on the Monthly campaign, with a reason.')
  }
  const weeks = planningWeeks(month)
  const rows = plan && plan.plant === plant ? (plan.rows || []) : []
  const row = rows.find(r => r.id === rowKey)
  if (!row) {
    const label = String(rowKey).split('|').slice(1).join(' ')
    const name = (plan?.plant === plant && plan.name) || plantMaster(null).find(p => p.id === plant)?.name || plant
    return refuse(`${label} is not on ${name}: a row cannot be moved to another plant from this screen.`)
  }
  const who = String(by ?? '').trim()
  if (!who) return refuse('Sign in again: a week move records who made it.')
  const known = (k) => weeks.some(w => w.key === k)
  const monthLabel = `${planningMonthAbbr(month)} ${month.slice(0, 4)}`

  const lines = { ...(current.lines || {}) }
  const put = (id, value) => {
    const line = { ...(lines[id] || {}) }
    line.weeks = { ...(line.weeks && typeof line.weeks === 'object' ? line.weeks : {}), [plant]: value }
    lines[id] = line
  }
  // Keep every row of the plant where it is shown, before this one moves.
  rows.filter(r => !r.stored && weeks[r.week]).forEach(r => put(r.id, { week: weeks[r.week].key }))

  const was = lines[rowKey]?.weeks?.[plant] || { week: weeks[row.week]?.key }
  let next
  if ('week' in change) {
    const k = String(change.week ?? '')
    if (!known(k)) return refuse(`${k || 'That'} is not a week of ${monthLabel}.`)
    next = { week: k }
  } else if (change.split || change.part) {
    // Parts start from what the screen shows: the typed parts, else the kept split as it stands
    // now (after any Planned change), else none. They are kept once they add up to the row.
    const parts = Object.fromEntries(Object.entries(row.weekSplit || {}).filter(([, t]) => t != null))
    if (change.part) {
      const k = String(change.part.week ?? '')
      if (!known(k)) return refuse(`${k || 'That'} is not a week of ${monthLabel}.`)
      const v = planningTypedTonnes(change.part.tonnes)
      if (Number.isNaN(v)) return refuse(PLANNING_WEEK_PART_PROBLEM)
      if (v == null) delete parts[k]
      else parts[k] = v
    } else if (row.weekSplit) {
      return { stored: list, problem: null }                     // Split… on a split: nothing to do
    }
    const total = Object.values(parts).reduce((t, v) => t + num(v), 0)
    const main = planningWeekMain(parts, weeks)
    if (change.part && main && Math.abs(total - row.tonnes) < PLANNING_SPLIT_EPS) next = { week: main, split: parts }
    else next = { week: was.week, ...(was.split ? { split: was.split } : {}), draft: parts }
  } else {
    return refuse('Pick a week, or Split… the row across weeks.')
  }
  put(rowKey, next)

  const from = planningWeekFigures(row.weeks, weeks)
  const to = planningWeekFigures(planningWeekPlaced(next, row.tonnes, weeks, row.week).weeks, weeks)
  const moved = JSON.stringify(from) !== JSON.stringify(to)
  const value = { lines }
  if (moved) value.changes = [...planningChangeLog(current), { id: changeId(), at, by: who, rowKey, field: 'week', plant, from, to }]
  return { stored: list.map(c => (c === current ? { ...c, ...value } : c)), problem: null }
}

// How a suggestion was reached, for the Planned box's hover:
// "Suggested 100 = max(Indent 60, Buffer 100) − Open 5.6, rounded up to 10 MT".
export function planningSuggestedLabel({ type, buffer, indent, open, suggested }) {
  const t = (v) => planningTonnes(v ?? 0)
  const want = type === 'Buffer' ? `max(Indent ${t(indent)}, Buffer ${t(buffer)})` : `Indent ${t(indent)}`
  return `Suggested ${suggested} = ${want} − Open ${fmtT(num(open))}, rounded up to 10 MT`
}

const PLANNING_INDENT_PROBLEM = 'Indent must be blank or a number of MT, 0 or more.'
const PLANNING_PLANNED_PROBLEM = 'Planned must be blank or a number of MT, 0 or more.'
const PLANNING_PART_PROBLEM = 'A split part must be blank or a number of MT, 0 or more.'
// Refused for want of a reason (#283): the screen asks for one and saves again, so it matches this.
export const PLANNING_REASON_PROBLEM = 'This month is finalised: give a reason for the change.'

// One change to one row of one region's campaign for one month (ticket #281). Pure: returns
// `{ stored, problem }`; on a problem `stored` is the input, unchanged.
//   where   { region, month: 'YYYY-MM', rowKey: 'South|50x50|1.6' }
//   change  { indent: '60' }   type the Monthly Indent ('' clears it)
//           { planned: '120' } type over Planned — kept, never overwritten; '' clears it, and the
//                              box goes back to showing the suggestion
//           { use: true }      "use N": Planned becomes today's suggestion
//   row     — the campaign row as the view gives it (`type`, `buffer`, `open.total`). The suggestion
//             is worked out here, after this change's Indent, and a typed Planned is stored with it
//             as its `basis`, so a later move of the suggestion shows amber.
// The campaign row keeps its id across edits; the first edit of a region × month makes one with
// `makeId`. The arbiter is (region, month), so a second tab's fresh id UPDATEs the same row.
//   — and the Plant cell (ticket #282), refused unless the plant is one of `row.plantOptions` (the
//     row's ticked plants, the region's own; another region's plant is never one):
//           { plant: 'hyderabad' } assign the row to one plant; '' = Choose… (blank, nothing carried)
//           { split: true }        Split… across the ticked plants; the parts start untyped
//           { part: { plant: 'lepakshi', tonnes: '75' } }  one plant's part, any tonnage ('' clears it)
//   `plants` (the plant master) only names a refused plant.
//   — and, once the month is FINALISED (ticket #283), every change to Planned or Plant is logged:
//     refused without a `reason`, and appended to the campaign's `changes` as { id: changeId, at,
//     by, rowKey, field, from, to, reason }, `from` being the row as the view shows it. The Baseline
//     is never touched. A blank Planned is refused (type 0 for none): after Finalise the box no
//     longer falls back to the suggestion. An Indent edit is not logged and moves Suggested only.
//     A change that leaves Planned and Plant as they were logs nothing.
export function planningCampaignSave(stored, where = {}, change = {}, {
  row = {}, plants = null, makeId = () => crypto.randomUUID(),
  reason = '', by = '', at = new Date().toISOString(), changeId = () => crypto.randomUUID(),
} = {}) {
  const list = stored || []
  const refuse = (problem) => ({ stored: list, problem })
  const region = String(where.region ?? '').trim()
  const month = String(where.month ?? '')
  const rowKey = String(where.rowKey ?? '')
  if (!region || !/^\d{4}-\d{2}$/.test(month) || !rowKey) return refuse('Pick a region, a month and a row.')
  const current = planningCampaignOf(list, region, month)
  const finalised = planningIsFinalised(current)
  const lines = { ...(current?.lines || {}) }
  const line = { ...(lines[rowKey] || {}) }
  if (finalised && 'planned' in change && planningTypedTonnes(change.planned) == null) {
    return refuse('This month is finalised: type Planned as a number (0 for none).')
  }
  if ('indent' in change) {
    const v = planningTypedTonnes(change.indent)
    if (Number.isNaN(v)) return refuse(PLANNING_INDENT_PROBLEM)
    line.indent = v
  }
  const suggested = planningSuggested({ type: row.type, buffer: row.buffer, indent: line.indent, open: row.open?.total })
  if ('planned' in change) {
    const v = planningTypedTonnes(change.planned)
    if (Number.isNaN(v)) return refuse(PLANNING_PLANNED_PROBLEM)
    if (v == null) { delete line.planned; delete line.basis }
    else { line.planned = v; line.basis = suggested }
  }
  if (change.use) { line.planned = suggested; line.basis = suggested }
  // ── Plant (ticket #282) — only the row's ticked plants, out of the region's own ──
  if ('plant' in change || change.split || change.part) {
    const options = (row.plantOptions || []).map(p => p.id)
    const named = plantMaster(plants)
    const nameOf = (id) => named.find(p => p.id === id)?.name || String(id)
    const notOffered = (id) => (plantsServingRegion(region, named).has(id)
      ? `${nameOf(id)} is not ticked for this row: tick it on the planning master first.`
      : `${nameOf(id)} does not serve ${region}.`)
    if (!options.length) return refuse('No plant can make this row: tick a plant on the planning master first.')
    if ('plant' in change) {
      const id = String(change.plant ?? '')
      if (id && !options.includes(id)) return refuse(notOffered(id))
      line.plant = id
      delete line.split
    }
    if (change.split || change.part) {
      if (options.length < 2) return refuse('Only a row with two ticked plants can be split.')
      const split = { ...(line.split && typeof line.split === 'object' ? line.split : {}) }
      if (change.part) {
        const id = String(change.part.plant ?? '')
        if (!options.includes(id)) return refuse(notOffered(id))
        const v = planningTypedTonnes(change.part.tonnes)
        if (Number.isNaN(v)) return refuse(PLANNING_PART_PROBLEM)
        if (v == null) delete split[id]
        else split[id] = v
      }
      line.split = split
      delete line.plant
    }
    // A week (#285) is kept only on a plant the row is still on: one it left forgets it, so a row
    // that comes back is placed afresh rather than in a week it held before.
    if (line.weeks && typeof line.weeks === 'object') {
      const on = line.split ? Object.keys(line.split).filter(k => num(line.split[k]) > 0) : (line.plant ? [line.plant] : [])
      line.weeks = Object.fromEntries(Object.entries(line.weeks).filter(([k]) => on.includes(k) || (options.length === 1 && options[0] === k)))
    }
  }
  // ── Finalised (ticket #283): a change to Planned or Plant needs a reason and is logged ──
  let logged = []
  if (finalised) {
    const planOf = (v) => planningStoredTonnes(v) ?? 0
    const fromPlanned = planOf(row.planned)
    const toPlanned = planOf(line.planned)
    if (fromPlanned !== toPlanned) logged.push({ field: 'planned', from: fromPlanned, to: toPlanned })
    if ('plant' in change || change.split || change.part) {
      const fromAssign = planningAssignValue(row)
      const toAssign = line.split ? { ...line.split } : (line.plant || '')
      if (!planningSameAssign(fromAssign, toAssign)) logged.push({ field: 'plant', from: planningCleanAssign(fromAssign), to: planningCleanAssign(toAssign) })
    }
    const why = String(reason ?? '').trim()
    if (logged.length && !why) return refuse(PLANNING_REASON_PROBLEM)
    if (logged.length && !String(by ?? '').trim()) return refuse('Sign in again: a change to a finalised plan records who made it.')
    if (!logged.length && !('indent' in change)) return { stored: list, problem: null }   // nothing moved
    const id = changeId()
    logged = logged.map((c, i) => ({ id: i ? `${id}-${i}` : id, at, by: String(by).trim(), rowKey, ...c, reason: why }))
  }
  if (line.indent == null) delete line.indent
  if (line.indent == null && line.planned == null && !('plant' in line) && !line.split && !line.weeks) delete lines[rowKey]
  else lines[rowKey] = line
  const value = { region, month, lines, deleted: false }
  if (logged.length) value.changes = [...planningChangeLog(current), ...logged]
  if (current) return { stored: list.map(c => (c === current ? { ...c, ...value } : c)), problem: null }
  return { stored: [...list, { id: makeId(), ...value }], problem: null }
}

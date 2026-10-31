// ═══════════════════════════════════════════════════════════════
// REPORTS — downloadable formatted .xlsx stock reports.
//
// Two sheets, modelled on the plant's hand-built Excel stock reports but populated
// from the app's own data and adapted to JSW's data model:
//   A) Finished Pipe Stock  — on-hand pipes grouped ROUND / SHS / RHS.
//   B) Raw Material Stock    — unslit HR coils + free baby-coil strip.
//
// Pure aggregators (buildFinishedStockData / buildRawMaterialData) hold NO exceljs /
// DOM dependency so they're unit-testable; the generate* builders lazy-import exceljs
// (a styled-write library — the app's `xlsx` is read-only for our purposes) and trigger
// the download. Mirrors the Blob+anchor pattern of downloadCSV in App.jsx.
// ═══════════════════════════════════════════════════════════════
// The `.js` extension is load-bearing: `scripts/*.mjs` import this module under plain Node, which
// (unlike Vite and Vitest) does not resolve extensionless relative paths. Dropping it breaks every
// script without breaking a single test — see src/lib/module-resolution.test.js.
import { producedPool, unmatchedDispatch, resolveProductionWeights, coilConsumption, babyCoilFree, babyCoilIsStock, babyCoilStock, SCRAP_FREE_MT, skuSizeLabel, skuKeyResolver, canonicalSkuKey, skuAgeing, salesKpis,
  plantBestEstimate, salesByDistributor, distributorRegionResolver, distributorCode, REGIONS, UNMAPPED_REGION,
  PLANTS, plantById, plantLabel, plantKeysIn, filterByPlant, filterDispatchesByPlant, UNATTRIBUTED_PLANT,
  plantMaster, plantsServingRegion, normRegionName, buildPlantMtdSummary, buildServableSummary } from './calc.js'

const EPS = 0.0005 // MT — treat anything below as zero (rounding noise)

// Two rules every builder here repeats, stated once. `num` coerces a stored figure to a usable
// number (a null, a '' or a stray string is zero tonnage, never NaN spreading through a total);
// `notDeleted` is this codebase's soft-delete convention — `!deleted`, which also keeps a row whose
// `deleted` is NULL, so a builder can never disagree with the Dashboard about what is live.
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const notDeleted = (rows) => (rows || []).filter(r => !r.deleted)

// Map a SKU productType to a finished-report section. CHS rolls up to "ROUND" (matching
// the plant report's "BLACK PIPE ( ROUND )" header); anything unexpected lands in OTHER
// so a stray product type is never silently dropped.
const sectionForType = (productType) => {
  const t = String(productType || '').toUpperCase()
  if (t === 'CHS') return 'ROUND'
  if (t === 'SHS') return 'SHS'
  if (t === 'RHS') return 'RHS'
  return 'OTHER'
}
const FINISHED_SECTION_ORDER = ['ROUND', 'SHS', 'RHS', 'OTHER']

// Leading numeric dimension of a size label ("25x25" → 25, "32 NB" → 32) for in-section sort.
const leadingDim = (size) => {
  const m = String(size || '').match(/\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : Number.MAX_SAFE_INTEGER
}

// ── Report A data: per published SKU, on-hand stock = produced − dispatched
// (producedPool availablePieces / availableWeight), grouped by shape. With nonZeroOnly
// (default), only sizes that actually have stock are listed — a warehouse stock sheet,
// not the full catalogue. Returns { sections:[{name, rows, subtotal}], grand, unmatched, net } —
// `grand` sums the listed rows, `unmatched` is over-dispatched tonnage with no row, `net` = the two
// netted (the plant total, matching the Dashboard's FG Left Inventory). ──
export function buildFinishedStockData(skus, productions, dispatches, { nonZeroOnly = true } = {}) {
  const keyOf = skuKeyResolver(skus)                 // net by canonical identity (same as the Dashboard SKU table)
  const pool = producedPool(productions, dispatches, null, keyOf)
  const buckets = {}
  ;(skus || [])
    .filter(s => String(s.status || '').toLowerCase() === 'published')
    .forEach(s => {
      const p = pool[keyOf(s.skuCode)] || { availablePieces: 0, availableWeight: 0 }
      const pcs = Number(p.availablePieces || 0)
      const mt = Number(p.availableWeight || 0)
      // Negative stock = over-dispatched (dispatched > produced). A size with no stock has no place
      // on a warehouse stock sheet, so it isn't listed — but the tonnage is NOT discarded: it comes
      // back as `unmatched` below and is deducted from the net, so the sheet still ties to the
      // Dashboard's FG Left Inventory.
      if (nonZeroOnly && !(pcs > 0 || mt > EPS)) return
      const name = sectionForType(s.productType)
      ;(buckets[name] = buckets[name] || []).push({
        size: skuSizeLabel(s) || s.description || s.skuCode,
        thick: Number(s.thickness || 0),
        len: Number(s.length || 0),
        kgPerPcs: Number(s.weightPerTube || 0),
        pcs,
        mt,
        remarks: '',
      })
    })

  const sections = []
  let grandPcs = 0, grandMt = 0
  FINISHED_SECTION_ORDER.forEach(name => {
    const rows = buckets[name]
    if (!rows || !rows.length) return
    rows.sort((a, b) => (leadingDim(a.size) - leadingDim(b.size)) || (a.thick - b.thick))
    const subPcs = rows.reduce((t, r) => t + Math.max(0, r.pcs), 0)
    const subMt = rows.reduce((t, r) => t + Math.max(0, r.mt), 0)
    grandPcs += subPcs
    grandMt += subMt
    sections.push({ name, rows, subtotal: { pcs: subPcs, mt: subMt } })
  })
  // `grand` stays the sum of the LISTED rows, so the sheet adds up internally. `unmatched` is the
  // over-dispatched tonnage that has no row to sit on; `net` = grand − unmatched is the plant total
  // and matches the Dashboard's FG Left Inventory card.
  const unmatched = unmatchedDispatch(pool)
  return {
    sections,
    grand: { pcs: grandPcs, mt: grandMt },
    unmatched: { pcs: unmatched.pieces, mt: unmatched.weight, skus: unmatched.skus },
    net: { pcs: grandPcs - unmatched.pieces, mt: grandMt - unmatched.weight },
  }
}

// ── Report B data: raw-material stock, adapted to JSW.
//   HR Coil Stock  — whole, UNSLIT mother coils only (a slit coil's steel now lives in
//                    its baby coils, so counting both would double-count). Mirrors the
//                    Dashboard "Full Coil Left" rule (App.jsx). Grouped width×thick×grade.
//   Strip / Baby   — baby-coil free weight = weight − production-consumed, for coils that are
//                    still stock: not deleted, not operator-marked "consumed", and holding at
//                    least SCRAP_FREE_MT. That is `babyCoilIsStock`, the same test behind the
//                    Dashboard "Baby Coils Left" card and the Production picker, so this section
//                    and that card now report the SAME tonnage. (Until Aug-2026 this sheet
//                    dropped "consumed" coils and the card kept them, so the two disagreed by
//                    the free weight of every such coil — 17.111 T across 331 coils.)
//                    Grouped width×thick.
// Returns { hrCoil:{groups,total}, strip:{groups,total}, grand }. ──
export function buildRawMaterialData(coils, babyCoils, productions) {
  const activeBabies = (babyCoils || []).filter(b => !b.deleted)
  const slitMotherIds = new Set(activeBabies.map(b => b.hrCoilId))
  const consumedByBaby = coilConsumption(productions, null, 'babyCoilId')

  // Section 1 — unslit mother coils. Unslit ⇒ never consumed by production (which consumes
  // baby coils), so remaining weight is the coil's actualWeight (matches Dashboard fullCoilLeft).
  const hrGroups = {}
  ;(coils || [])
    .filter(c => !c.deleted && !slitMotherIds.has(c.hrCoilId))
    .forEach(c => {
      const mt = Number(c.actualWeight || 0)
      if (mt <= EPS) return
      const width = Number(c.width || 0)
      const thick = Number(c.thickness || 0)
      const grade = String(c.coilGrade || '').trim() || '—'
      const key = `${width}|${thick}|${grade}`
      const g = hrGroups[key] || { width, thick, grade, mt: 0 }
      g.mt += mt
      hrGroups[key] = g
    })

  // Section 2 — baby-coil strip free weight.
  const stripGroups = {}
  activeBabies
    .filter(b => babyCoilIsStock(b, consumedByBaby))
    .forEach(b => {
      const mt = Math.max(0, babyCoilFree(b, consumedByBaby))
      if (mt <= EPS) return
      const width = Number(b.width || 0)
      const thick = Number(b.thickness || 0)
      const key = `${width}|${thick}`
      const g = stripGroups[key] || { width, thick, mt: 0 }
      g.mt += mt
      stripGroups[key] = g
    })

  const sortGroups = (arr) => arr.sort((a, b) => (a.width - b.width) || (a.thick - b.thick))
  const hrCoil = sortGroups(Object.values(hrGroups))
  const strip = sortGroups(Object.values(stripGroups))
  const hrTotal = hrCoil.reduce((t, g) => t + g.mt, 0)
  const stripTotal = strip.reduce((t, g) => t + g.mt, 0)
  return {
    hrCoil: { groups: hrCoil, total: hrTotal },
    strip: { groups: strip, total: stripTotal },
    grand: hrTotal + stripTotal,
  }
}

// ── Report C data: PB MTD Dashboard. Reproduces the app's Sales/Dashboard KPIs (salesKpis) +
// FIFO stock ageing (skuAgeing) for the monthly management report, mirroring the `pb-mtd-report`
// skill so the two never diverge. Only P&T-possible lines are computed — segments, plants,
// FE550/FE550D grades, order categories, SFDC, carry-forward, opening/closing balances and DSI
// have no analog in this system and are deliberately absent.
//   `date` = report day D (default today), drives MTD / prev-month-same-days / D / D-1 / D-2.
//   `productions` MUST be live-weight-resolved by the caller (resolveProductionWeights) so produced
//     tonnage matches the app's FG Left Inventory (a stored total_weight overstates once a master
//     weightPerTube is edited post-save).
//   `bestEstimate` = manual monthly target MT (no forecast field exists); null ⇒ Invoice % of BE and
//     Daily Run Rate render N/A.
//   `stateRegions` = the state → region master rows, passed straight to salesByDistributor so the
//     distributor sheet's regions are the ones the Sales tab shows. Omitted ⇒ the seeded mapping.
// Pure + DOM-free (no exceljs) so it's unit-testable. ──
const dashMonthKey = (d) => String(d || '').slice(0, 7)
const dashDay = (d) => Number(String(d || '').slice(8, 10))
const dashShift = (iso, days) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10) }
const dashPrevMonth = (iso) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7) }
const dashDaysRemaining = (iso) => { const d = new Date(iso + 'T00:00:00Z'); const day = d.getUTCDate(); d.setUTCMonth(d.getUTCMonth() + 1, 0); return d.getUTCDate() - day + 1 } // report day → month end, inclusive
const MIN_ONHAND_MT = 2 // Sheet 2 lists every SKU with more than this much on-hand finished stock (MT)

// ── Distributor rows → region blocks. Pure, and exported so the grouping is testable without
// rendering a workbook. Input is salesByDistributor's output (it already carries `state` and
// `region` from the state → region master); output is:
//   { regions: [{ region, rows, total }], grand, unallocatedInvoiced }
//
// Row shape: { region, state, states, multiState, customer, plan, totalOrders, invoiced,
//              pctOfPlan, gapToPlan }.
//   plan       = the typed monthly Best Estimate, null when nobody set one (≠ a plan of zero).
//   pctOfPlan  = invoiced ÷ plan as a FRACTION, not a percentage — the sheet's cell carries a
//                percentage number format, which multiplies by 100 on display. Measured against
//                INVOICED only, matching the plant-level Invoice % of BE (Confirmed / Non-confirmed
//                are an all-time snapshot, so comparing a month's target to them isn't like-for-like).
//   gapToPlan  = plan − invoiced; null without a plan, since there is no gap to a target nobody set.
//
// A row is listed when it has a plan OR any tonnage at all (invoiced or on the order book). The old
// sheet dropped a distributor with orders but no plan and no invoice this month; with Total Orders
// now a headline column that omission would understate its region, so the filter is wider.
//
// Region order is fixed — the four REGIONS, then any off-list region a stored mapping might hold,
// then `Unmapped` last. An unmapped state is a labelling gap, never a reason for weight to leave a
// total: its rows carry their full tonnage into the grand total like any other.
export function buildDistributorRegionData(distRows) {
  const listed = (distRows || []).filter(r =>
    r.bestEstimate != null || r.mtdInvoice > EPS || r.totalOrders > EPS)

  const byRegion = new Map()
  listed.forEach(r => {
    const region = String(r.region || '').trim() || UNMAPPED_REGION
    const plan = r.bestEstimate ?? null
    const invoiced = Number(r.mtdInvoice || 0)
    if (!byRegion.has(region)) byRegion.set(region, [])
    byRegion.get(region).push({
      region,
      state: r.state || '',
      states: r.states || [],
      multiState: !!r.multiState,
      customer: r.customer || '—',
      plan,
      totalOrders: Number(r.totalOrders || 0),
      invoiced,
      pctOfPlan: plan == null ? null : invoiced / plan,
      gapToPlan: plan == null ? null : plan - invoiced,
    })
  })

  const known = REGIONS.filter(r => byRegion.has(r))
  const extra = [...byRegion.keys()]
    .filter(r => r !== UNMAPPED_REGION && !REGIONS.includes(r)).sort()
  const order = [...known, ...extra, ...(byRegion.has(UNMAPPED_REGION) ? [UNMAPPED_REGION] : [])]

  // A total over a set of rows. `plan` sums only the rows that HAVE one, and stays null when none
  // does — so a region nobody planned reads N/A rather than a target of zero it then "missed".
  const totalOf = (rows) => {
    let plan = 0, planned = false, totalOrders = 0, invoiced = 0
    rows.forEach(r => {
      if (r.plan != null) { plan += r.plan; planned = true }
      totalOrders += r.totalOrders
      invoiced += r.invoiced
    })
    const p = planned ? plan : null
    return {
      plan: p, totalOrders, invoiced,
      pctOfPlan: p != null && p > 0 ? invoiced / p : null,
      gapToPlan: p != null ? p - invoiced : null,
    }
  }

  const regions = order.map(region => {
    // Within a region: biggest plan first, then biggest invoiced, then name — the same ranking the
    // flat sheet used. State is a column, not a sort key: it gets no subtotal row, so clustering by
    // it would only hide which distributors actually carry the region.
    const rows = byRegion.get(region).sort((a, b) =>
      (b.plan ?? 0) - (a.plan ?? 0) || b.invoiced - a.invoiced || a.customer.localeCompare(b.customer))
    return { region, rows, total: totalOf(rows) }
  })

  // Invoiced tonnage from distributors nobody set a target for. It is counted in the actual but not
  // in the plan, so it is what pushes % of Plan past 100 without the plan having been beaten
  // (ADR-0001: no "Others" bucket absorbs it).
  const unallocatedInvoiced = listed.reduce((t, r) => r.bestEstimate == null ? t + Number(r.mtdInvoice || 0) : t, 0)

  return { regions, grand: totalOf(regions.flatMap(g => g.rows)), unallocatedInvoiced }
}

// SKU display label — "size x thickness" where the SKU master knows the code, else its description,
// else the raw key. Shared by the SKU Ageing and Distributor × SKU sheets so a size reads identically
// on both and the two sheets can be joined on it.
const skuLabel = (sku, fallback) => {
  const size = skuSizeLabel(sku)
  if (size) return sku?.thickness ? `${size} x ${sku.thickness}` : size
  if (sku?.description) return sku.description
  // No master row for this SKU (37 ERP codes on the order book have none). Derive the SAME
  // "size x thickness" shape from whatever identifies it — the order line's description, or the
  // canonical key ('rhs|4923|60x40|1.20|6000') — so the sheet never prints a raw MM ID or a key.
  const s = String(fallback || '')
  const isKey = s.includes('|')
  const parts = (isKey ? s : canonicalSkuKey(s)).split('|')
  if (parts.length < 5) return s
  // Size off the description itself, not the key — the key is lower-cased, which would spell one
  // bore two ways ('100 NB x 4' from the master, '100 nb x 4' here) and break the join.
  const derived = isKey ? parts[2] : (skuSizeLabel(null, s) || parts[2])
  return derived ? `${derived} x ${Number(parts[3])}` : s
}

// Region sort order for the Distributor × SKU sheet: the four fixed regions in their canonical order,
// then Unmapped, then anything unexpected. Alphabetical would bury Unmapped between South and West.
const REGION_ORDER = [...REGIONS, UNMAPPED_REGION]
const regionRank = (r) => { const i = REGION_ORDER.indexOf(r); return i < 0 ? REGION_ORDER.length : i }

// ── DAILY REPORT — the region split ─────────────────────────────────────────────────────────────
// Two numbers per region for the daily PB MTD / WhatsApp update: Invoiced MTD and Pending to serve
// (Confirmed + Non-confirmed, the Dashboard's `PENDING TO SERVE (MT)` card). Nothing else — the
// daily message carries no plan column, and Production / RM / FG have no ship-to state to split by.
//
// Everything hard is imported, deliberately. Attributing a line to a region means resolving the
// distributor's identity (dispatch lines resolve through their ORDER LINK before their own code),
// then its state (most recent line wins), then the state's region (with the eight-row seed layered
// under the stored master). Re-deriving any of that — in SQL, or here — buys a second answer that
// can disagree with the Sales tab and the workbook. `salesByDistributor` already did all of it.
//
// THE ONE ASYMMETRY, and it is deliberate:
//   • TONNAGE is day-capped at D, because it must tie to the plant's own `invoicedMtd` (which caps
//     at D) — otherwise the region lines would not sum to the headline the message prints above them.
//   • REGION ASSIGNMENT is NOT capped: the resolver sees every line, so the region a distributor
//     lands in is byte-identical to the workbook's Distributor by Region sheet and the Sales tab.
// The two diverge only when a dispatch inside the month is dated after D. `diagnostics.invoicedAfterD`
// names that tonnage rather than letting it vanish. (Sheet 3's own invoiced column is not day-capped
// at all — a pre-existing workbook inconsistency, out of scope here.)
//
// `Unmapped` is a real block with real totals, never a bucket that can be filtered out of a sum: a
// state nobody has mapped is a labelling gap, never a reason for weight to leave a total.
export function buildRegionMtdSummary(orders, dispatches, { date = today(), stateRegions = null, distributors = null } = {}) {
  const D = date, MONTH = dashMonthKey(D)

  // Same predicate buildMtdDashboardData uses for invoicedMtd. The month filter is applied inside
  // salesByDistributor, so this only has to carry the day cap.
  const live = notDeleted(dispatches)
  const upToD = live.filter(d => d.dateOfDispatch <= D)
  const rows = salesByDistributor(orders, upToD, MONTH, [], { stateRegions, distributors })

  // Built on the UNCAPPED list — see the asymmetry note above.
  //
  // `distributors` is the FIFTH step the note above lists four of, and it is not optional: since
  // ticket #129 the distributor master may carry an explicit region OVERRIDE, and an override WINS
  // over the state-derived region (see distributorRegionResolver). Omitting it here is what made
  // this block disagree with the Sales tab and the workbook — the exact second answer ADR-0003
  // exists to prevent — because both of those DO pass it. On 30-Aug-2026 that gap moved 515.4 T of
  // invoicing between South and East without a single row changing.
  const regionOf = distributorRegionResolver(orders, dispatches, stateRegions, null, distributors)

  const byRegion = new Map()
  let multiStateDistributors = 0, multiStateTonnage = 0, statelessDistributors = 0
  const unmappedStates = new Map()
  rows.forEach(r => {
    const { region, state, multiState } = regionOf(r.id)
    const invoicedMtd = num(r.mtdInvoice), confirmed = num(r.confirmed), nonConfirmed = num(r.nonConfirmed)
    const pending = confirmed + nonConfirmed
    if (!byRegion.has(region)) {
      byRegion.set(region, { region, invoicedMtd: 0, confirmed: 0, nonConfirmed: 0, pending: 0, distributors: 0 })
    }
    const g = byRegion.get(region)
    g.invoicedMtd += invoicedMtd; g.confirmed += confirmed; g.nonConfirmed += nonConfirmed
    g.pending += pending; g.distributors += 1
    if (multiState) { multiStateDistributors += 1; multiStateTonnage += invoicedMtd + pending }
    if (region === UNMAPPED_REGION) {
      if (!state) statelessDistributors += 1
      else unmappedStates.set(state, (unmappedStates.get(state) || 0) + invoicedMtd + pending)
    }
  })

  // Fixed order: the four REGIONS, then any off-list region a stored mapping holds (alphabetical),
  // then Unmapped last. Same rule as buildDistributorRegionData and the Distributor × SKU sheet.
  const regions = [...byRegion.values()].sort((a, b) =>
    regionRank(a.region) - regionRank(b.region) || a.region.localeCompare(b.region))

  const sum = (k) => regions.reduce((t, g) => t + g[k], 0)
  const totals = {
    invoicedMtd: sum('invoicedMtd'), confirmed: sum('confirmed'),
    nonConfirmed: sum('nonConfirmed'), pending: sum('pending'),
  }

  // The plant's own figures, computed here the same way the Dashboard computes them — so the tie-out
  // below is a real second method, not this function checking its own arithmetic.
  const sumDisp = (pred) => live.reduce((t, d) =>
    pred(d) ? t + (d.bundleEntries || []).reduce((s, be) => s + num(be.weight), 0) : t, 0)
  const plantInvoiced = sumDisp(d => dashMonthKey(d.dateOfDispatch) === MONTH && d.dateOfDispatch <= D)
  const kpi = salesKpis(orders, dispatches, MONTH)
  const plantPending = num(kpi.confirmed) + num(kpi.nonConfirmed)
  const invoicedDiff = Math.abs(totals.invoicedMtd - plantInvoiced)
  const pendingDiff = Math.abs(totals.pending - plantPending)

  const share = (part, whole) => whole > EPS ? part / whole : 0
  const unmapped = byRegion.get(UNMAPPED_REGION)

  return {
    date: D,
    month: MONTH,
    regions,
    totals,
    // Asserted by the caller before anything is printed: a region split that does not add up to the
    // headline is worse than no split at all.
    checks: {
      invoicedTiesToPlant: invoicedDiff <= 0.01,
      pendingTiesToPlant: pendingDiff <= 0.01,
      maxAbsDiff: Math.max(invoicedDiff, pendingDiff),
      plantInvoicedMtd: plantInvoiced,
      plantPending,
    },
    diagnostics: {
      // Month tonnage dated after D: counted for region assignment, excluded from the tonnage.
      invoicedAfterD: sumDisp(d => dashMonthKey(d.dateOfDispatch) === MONTH && d.dateOfDispatch > D),
      unmappedShareInvoiced: share(unmapped?.invoicedMtd || 0, totals.invoicedMtd),
      unmappedSharePending: share(unmapped?.pending || 0, totals.pending),
      // Top states landing in Unmapped, biggest first — the shortlist a human has to map.
      unmappedStates: [...unmappedStates.entries()]
        .map(([state, tonnage]) => ({ state, tonnage }))
        .sort((a, b) => b.tonnage - a.tonnage),
      statelessDistributors,
      multiStateDistributors,
      multiStateTonnage,
      maxDispatchDate: live.reduce((m, d) => d.dateOfDispatch > m ? d.dateOfDispatch : m, ''),
      maxOrderDate: notDeleted(orders)
        .reduce((m, o) => String(o.orderDate || '') > m ? String(o.orderDate) : m, ''),
    },
  }
}

// buildPlantMtdSummary and buildServableSummary live in calc.js since ticket #232 (so the Dispatch
// tab can compose them without loading this chunk); re-exported here so every caller is unchanged.
export { buildPlantMtdSummary, buildServableSummary }

// ── PRODUCTION AND STOCK, BY PLANT ──────────────────────────────────────────────────────────────
// Until now the daily messages printed Production, FG and RM as single company figures, on the rule
// that "pipeline figures carry no ship-to state". That rule is about REGION, and it still holds: a
// coil has no customer. It never applied to PLANT — a coil, a baby coil and a finished tube each sit
// on exactly one floor, and every one of those rows carries the `plant` it was set at (#118, ADR-0005).
//
// So this is a plain partition on a stored column, with no identity resolution anywhere. What it is
// NOT is a warehouse count: FG per plant is what that plant MADE and has not invoiced. Nothing in
// the data attributes surviving tonnage back to a floor after a stock transfer, and a plant that
// made stock and shipped every tonne still shows zero rather than disappearing.
//
// `productions` MUST already be live-weight-resolved by the caller (`resolveProductionWeights`),
// the same contract `buildMtdDashboardData` carries — a stored `total_weight` overstates produced
// once a master `weightPerTube` is edited after save.
//
// The RM half reads `babyCoilStock`, which applies the scrap floor and the operator's `consumed`
// flag (ADR-0007). That is the Dashboard's own Baby Coils Left card, so the message and the screen
// report one tonnage. A plain `Σ max(0, weight − consumed)` — what the report SQL used to do — is a
// DIFFERENT and larger number, and having both in circulation is how a card and a message start
// disagreeing about the same steel.
export function buildPlantPipelineSummary(productions, dispatches, coils, babyCoils, {
  date = today(), master = PLANTS,
} = {}) {
  const D = date, MONTH = dashMonthKey(D), PREV = dashPrevMonth(D), DAY = dashDay(D)
  const D1 = dashShift(D, -1)

  const liveProd = notDeleted(productions)
  const liveDisp = notDeleted(dispatches)
  const liveCoils = notDeleted(coils)
  const liveBabies = notDeleted(babyCoils)

  // Consumption and slitting are facts about a coil, not about a plant, so both are resolved over
  // the whole register FIRST and only the result is grouped. Computing either inside a plant filter
  // would let a production at one plant stop counting against the coil it actually consumed.
  const consumedByBaby = coilConsumption(liveProd, null, 'babyCoilId')
  const slitMotherIds = new Set(liveBabies.map(b => b.hrCoilId))

  const prodMt = (rows, pred) => rows.filter(pred).reduce((t, p) => t + num(p.totalWeight), 0)
  const inMonth = (p) => dashMonthKey(p.dateOfProduction) === MONTH && p.dateOfProduction <= D
  const inPrev = (p) => dashMonthKey(p.dateOfProduction) === PREV && dashDay(p.dateOfProduction) <= DAY
  const dispMt = (rows) => rows.reduce((t, d) =>
    t + (d.bundleEntries || []).reduce((u, e) => u + num(e.weight), 0), 0)
  const dispMtWhen = (rows, pred) => dispMt(rows.filter(pred))
  const dispInMonth = (d) => dashMonthKey(d.dateOfDispatch) === MONTH && d.dateOfDispatch <= D

  // ── The movement columns (ticket #130): Opening + Production − Dispatch = Current ───────────────
  // OPENING IS THE COMPLEMENT, not its own date filter: everything the register holds MINUS what
  // this month carries. A row with no date at all is a data fault, and the complement keeps its
  // tonnage on the opening side rather than dropping it out of the identity entirely — a movement
  // table that silently loses steel is worse than one that shows it sitting in the wrong column.
  //
  // `fromMonth` is this month ONWARDS, so it also catches rows dated later than D (a forward-dated
  // entry, or a back-dated report). Those cannot be in Opening and are not in the MTD columns
  // either, so they are the exact residual between the identity and `fgLeft` — reported as
  // `producedAfterD` / `invoicedAfterD` rather than absorbed. `invoicedAfterD` mirrors
  // `regionSplit.diagnostics.invoicedAfterD`, which already names the same tonnage on the region cut.
  const prodFromMonth = (p) => dashMonthKey(p.dateOfProduction) >= MONTH
  const dispFromMonth = (d) => dashMonthKey(d.dateOfDispatch) >= MONTH

  // Every stored plant value actually PRESENT across the four registers. A plant with nothing gets
  // no row (there is nothing to say about it); a value the master does not know still keeps its
  // tonnage, folded into Unattributed.
  const keys = plantKeysIn(liveProd)
  liveDisp.forEach(d => plantKeysIn(d.bundleEntries).forEach(k => keys.add(k)))
  plantKeysIn(liveCoils).forEach(k => keys.add(k))
  plantKeysIn(liveBabies).forEach(k => keys.add(k))

  const byRow = new Map()
  ;[...keys].forEach(key => {
    const prod = filterByPlant(liveProd, key)
    const disp = filterDispatchesByPlant(liveDisp, key)
    const babies = filterByPlant(liveBabies, key)
    const fullCoilLeft = filterByPlant(liveCoils, key)
      .filter(c => !slitMotherIds.has(c.hrCoilId))
      .reduce((t, c) => t + num(c.actualWeight), 0)
    const babyLeft = babyCoilStock(babies, consumedByBaby)

    const id = plantById(key, master) ? key : ''
    const row = byRow.get(id) || {
      plant: id, name: plantLabel(id, master),
      producedMtd: 0, producedPrev: 0, producedD1: 0, producedD: 0,
      producedAll: 0, invoicedAll: 0, fgLeft: 0,
      openingFg: 0, invoicedMtd: 0, producedAfterD: 0, invoicedAfterD: 0,
      fullCoilLeft: 0, babyLeft: 0, rmTotal: 0, productionRows: 0,
    }
    row.producedMtd += prodMt(prod, inMonth)
    row.producedPrev += prodMt(prod, inPrev)
    row.producedD1 += prodMt(prod, p => p.dateOfProduction === D1)
    row.producedD += prodMt(prod, p => p.dateOfProduction === D)
    // FG is all-time produced − all-time invoiced, the same shape as the Dashboard's FG Left card.
    // NOT floored: an over-invoiced plant reading negative is a fault to see, not to hide.
    row.producedAll += prodMt(prod, () => true)
    row.invoicedAll += dispMt(disp)
    row.fgLeft = row.producedAll - row.invoicedAll
    // Movement: what this plant held on the 1st, what it invoiced this month, and the tonnage dated
    // past D that belongs to neither column.
    row.invoicedMtd += dispMtWhen(disp, dispInMonth)
    row.producedAfterD += prodMt(prod, p => prodFromMonth(p) && !inMonth(p))
    row.invoicedAfterD += dispMtWhen(disp, d => dispFromMonth(d) && !dispInMonth(d))
    row.openingFg = (row.producedAll - prodMt(prod, prodFromMonth))
      - (row.invoicedAll - dispMtWhen(disp, dispFromMonth))
    row.fullCoilLeft += fullCoilLeft
    row.babyLeft += babyLeft
    row.rmTotal = row.fullCoilLeft + row.babyLeft
    row.productionRows += prod.length
    byRow.set(id, row)
  })

  const rank = (id) => { const i = master.findIndex(p => p.id === id); return i < 0 ? master.length : i }
  const plants = [...byRow.values()].sort((a, b) => rank(a.plant) - rank(b.plant))

  const sum = (k) => plants.reduce((t, r) => t + r[k], 0)
  const totals = {
    producedMtd: sum('producedMtd'), producedPrev: sum('producedPrev'),
    producedD1: sum('producedD1'), producedD: sum('producedD'),
    fgLeft: sum('fgLeft'), fullCoilLeft: sum('fullCoilLeft'),
    babyLeft: sum('babyLeft'), rmTotal: sum('rmTotal'),
    openingFg: sum('openingFg'), invoicedMtd: sum('invoicedMtd'),
  }

  // The company figures, computed UNGROUPED over the same rows — a real second pass, not this
  // function re-adding its own arithmetic.
  const allProducedMtd = prodMt(liveProd, inMonth)
  const allFgLeft = prodMt(liveProd, () => true) - dispMt(liveDisp)
  const allFullCoilLeft = liveCoils.filter(c => !slitMotherIds.has(c.hrCoilId))
    .reduce((t, c) => t + num(c.actualWeight), 0)
  const allBabyLeft = babyCoilStock(liveBabies, consumedByBaby)
  const diff = (a, b) => Math.abs(a - b)
  const maxAbsDiff = Math.max(
    diff(totals.producedMtd, allProducedMtd), diff(totals.fgLeft, allFgLeft),
    diff(totals.fullCoilLeft, allFullCoilLeft), diff(totals.babyLeft, allBabyLeft))

  // The movement identity, per plant and on the total: what a plant held on the 1st, plus what it
  // made, less what it invoiced, IS what it holds now. The two after-D terms close it exactly —
  // tonnage dated past the report date is in `fgLeft` (which has no date cap) but in neither
  // Opening nor the MTD columns, so it is added back rather than left as an unexplained gap.
  const afterD = (r) => r.producedAfterD - r.invoicedAfterD
  const movementGap = (r) => diff(r.openingFg + r.producedMtd - r.invoicedMtd + afterD(r), r.fgLeft)
  const maxMovementGap = plants.reduce((m, r) => Math.max(m, movementGap(r)),
    movementGap({ ...totals, producedAfterD: sum('producedAfterD'), invoicedAfterD: sum('invoicedAfterD') }))

  return {
    date: D,
    month: MONTH,
    plants,
    totals,
    checks: {
      producedTiesToAllPlants: diff(totals.producedMtd, allProducedMtd) <= 0.01,
      fgTiesToAllPlants: diff(totals.fgLeft, allFgLeft) <= 0.01,
      rmTiesToAllPlants: diff(totals.fullCoilLeft, allFullCoilLeft) <= 0.01
        && diff(totals.babyLeft, allBabyLeft) <= 0.01,
      // Opening + Production − Dispatch = Current, asserted on every row AND on the total. A breach
      // means the movement columns describe a different register from the FG figure above them.
      movementTiesToFgLeft: maxMovementGap <= 0.01,
      maxMovementGap,
      maxAbsDiff,
      allPlantsProducedMtd: allProducedMtd,
      allPlantsFgLeft: allFgLeft,
      allPlantsFullCoilLeft: allFullCoilLeft,
      allPlantsBabyLeft: allBabyLeft,
    },
    diagnostics: {
      // A plant whose steel nobody labelled. Its tonnage stays in every total; the label is the gap.
      unattributedProducedMtd: byRow.get('')?.producedMtd ?? 0,
      unattributedFgLeft: byRow.get('')?.fgLeft ?? 0,
      unattributedRmTotal: byRow.get('')?.rmTotal ?? 0,
      // Baby-coil tonnage the scrap floor and the `consumed` flag exclude, so a reader asking why
      // RM moved has the answer without re-deriving it (ADR-0007).
      babyNotCounted: liveBabies.reduce((t, b) =>
        t + (babyCoilIsStock(b, consumedByBaby) ? 0 : Math.max(0, babyCoilFree(b, consumedByBaby))), 0),
      // Tonnage dated LATER than D. Non-zero on a back-dated report or a forward-dated entry; it
      // sits in Current but in neither Opening nor the MTD columns, so the movement caption names it
      // rather than letting a reader hunt for the difference. Mirrors the region cut's own
      // `invoicedAfterD`, which reports the same tonnage on a different grouping.
      producedAfterD: sum('producedAfterD'),
      invoicedAfterD: sum('invoicedAfterD'),
      plantsPresent: plants.length,
    },
  }
}

export function buildMtdDashboardData(orders, dispatches, productions, skus, { date = today(), estimates = [], stateRegions = null, plants = null, distributors = null,
  // NAMED, never positional. Roughly 35 call sites in reports.test.js already pass the options
  // bag as the 5th argument; a 5th positional `coils` would have swallowed every one of them —
  // the DATE included — and the whole suite would have quietly reported on today instead of D.
  coils = null, babyCoils = null } = {}) {
  const D = date, D1 = dashShift(D, -1), D2 = dashShift(D, -2)
  const MONTH = dashMonthKey(D), PREV = dashPrevMonth(D), DAY = dashDay(D)
  // The plant Best Estimate is DERIVED — Σ of the month's distributor estimates, never typed
  // (ADR-0001). Null when nobody set a target, so % of BE and the run rate report N/A.
  const BE = plantBestEstimate(estimates, MONTH)

  // Invoiced tonnage from dispatches (Σ bundleEntries weight over non-deleted rows matching a predicate).
  const dispLines = notDeleted(dispatches)
  const sumDisp = (pred) => dispLines.reduce((t, d) =>
    pred(d) ? t + (d.bundleEntries || []).reduce((s, be) => s + num(be.weight), 0) : t, 0)
  const invoicedMtd = sumDisp(d => dashMonthKey(d.dateOfDispatch) === MONTH && d.dateOfDispatch <= D) // MTD capped at ≤ D
  const invoicedPrev = sumDisp(d => dashMonthKey(d.dateOfDispatch) === PREV && dashDay(d.dateOfDispatch) <= DAY) // prev month, same day-of-month window
  const dispatchD = sumDisp(d => d.dateOfDispatch === D)
  const dispatchD1 = sumDisp(d => d.dateOfDispatch === D1)

  // Order-book snapshot (Confirmed / Non-confirmed are all-time non-delivered; salesKpis is the app's own KPI).
  const kpi = salesKpis(orders, dispatches, MONTH)
  const confirmed = kpi.confirmed, nonConfirmed = kpi.nonConfirmed
  const pending = confirmed + nonConfirmed
  const totalOrders = invoicedMtd + confirmed + nonConfirmed
  const invoicedPctPipeline = totalOrders > 0 ? (invoicedMtd / totalOrders) * 100 : null

  // Orders intake (Σ quantity).
  const ordLines = notDeleted(orders)
  const sumOrd = (pred) => ordLines.reduce((t, o) => pred(o) ? t + num(o.quantity) : t, 0)
  const ordersMonthIntake = sumOrd(o => dashMonthKey(o.orderDate) === MONTH)
  const ordersD = sumOrd(o => o.orderDate === D)
  const ordersD1 = sumOrd(o => o.orderDate === D1)
  const ordersD2 = sumOrd(o => o.orderDate === D2)

  // Fresh production MTD (productions already live-resolved by caller). Physical Inventory is derived
  // below as the sum of POSITIVE per-SKU on-hand (a SKU can't hold negative stock; SKUs shipped beyond
  // their tracked production are floored to 0), so it ties to the SKU ageing sheet and its buckets.
  //
  // CAPPED AT <= D, exactly as `invoicedMtd` above is. It was month-only until ticket #130, which made
  // it the one MTD figure on the sheet that counted tonnage the report date has not reached. Nothing
  // noticed while every run was same-day — the two predicates agree until a production row is dated
  // after D. `buildPlantPipelineSummary` splits this figure per plant with its own `<= D` rule, so an
  // uncapped headline would sit above rows that do not add up to it, which ALGORITHMS.md forbids
  // outright: a breakdown that does not partition its own total is worse than no breakdown.
  const prodLines = (productions || []).filter(p => !p.deleted)
  const freshProductionMtd = prodLines.reduce((t, p) =>
    dashMonthKey(p.dateOfProduction) === MONTH && p.dateOfProduction <= D ? t + num(p.totalWeight) : t, 0)

  // Targets (only when a Best Estimate is supplied).
  const invoicePctOfBe = BE != null ? (invoicedMtd / BE) * 100 : null
  const remaining = dashDaysRemaining(D)
  const dailyRunRate = BE != null && remaining > 0 ? Math.max(0, BE - invoicedMtd) / remaining : null

  // FIFO ageing per canonical SKU (buckets + weighted-avg age), joined for the top-5 detail sheet.
  const keyOf = skuKeyResolver(skus)
  const ageing = skuAgeing(productions, dispatches, keyOf, D)
  const skuByKey = new Map((skus || []).map(s => [keyOf(s.skuCode), s]))
  const zeroBkt = () => ({ d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 })
  const addBkt = (acc, b) => { acc.d0_30 += b.d0_30; acc.d31_60 += b.d31_60; acc.d61_90 += b.d61_90; acc.d90plus += b.d90plus }
  const allBuckets = zeroBkt()
  let onhandTot = 0, ageWtTot = 0
  const ageingRows = Object.entries(ageing).map(([k, v]) => {
    onhandTot += v.onhandWeight; ageWtTot += v.onhandWeight * v.avgAgeDays; addBkt(allBuckets, v.buckets)
    const label = skuLabel(skuByKey.get(k), k)
    return { key: k, label, onhandMt: v.onhandWeight, buckets: v.buckets, oldestAgeDays: v.oldestAgeDays, avgAgeDays: v.avgAgeDays }
  })
  const invAgeingDaysAvg = onhandTot > 0 ? ageWtTot / onhandTot : null
  // skuAgeing only emits keys with surviving POSITIVE layers, so over-dispatched SKUs vanish from
  // onhandTot entirely. That pipe still left the plant, so recover the dropped tonnage from
  // producedPool and take it off the total — Physical Inventory is Σ produced − Σ invoiced, exactly
  // as its KPI caption claims. Ageing stays over positive stock only (you can't age what isn't there).
  const unmatched = unmatchedDispatch(producedPool(productions, dispatches, null, keyOf)).weight
  const physicalInventory = onhandTot - unmatched

  // Every SKU with on-hand inventory above MIN_ONHAND_MT, descending — with their combined subtotal.
  const stockRows = ageingRows.filter(r => r.onhandMt > MIN_ONHAND_MT).sort((a, b) => b.onhandMt - a.onhandMt)
  const st = stockRows.reduce((acc, r) => { acc.onhandMt += r.onhandMt; addBkt(acc.buckets, r.buckets); acc.ageWt += r.onhandMt * r.avgAgeDays; return acc },
    { onhandMt: 0, buckets: zeroBkt(), ageWt: 0 })
  const stockTotal = { onhandMt: st.onhandMt, buckets: st.buckets, avgAgeDays: st.onhandMt > 0 ? st.ageWt / st.onhandMt : null }

  // The SKUs with 0 < on-hand ≤ MIN_ONHAND_MT are excluded from the sheet's list. Together with the
  // unmatched dispatch (over-shipped SKUs, which the list also can't show) they close the ladder:
  // stockTotal(>MIN) + otherLe2(≤MIN) − unmatched == physicalInventory.
  const otherLe2 = onhandTot - stockTotal.onhandMt

  // ── Distributor sheets. ONE call to salesByDistributor — the same function (and the same options)
  // the Sales tab drill-down uses — feeds both, so the screen and the workbook cannot disagree.
  // `productions` adds stock to every SKU row, scoped to the distributor's SERVICE AREA;
  // `stateRegions` adds state + region; `plants` and `distributors` are the two masters that decide
  // which area a row reads its stock from (ticket #129). All four are pass-through — every rule
  // lives in calc.js, so the workbook cannot answer the question differently from the screen.
  const distRowsAll = salesByDistributor(orders, dispatches, MONTH, skus,
    { estimates, productions, stateRegions, plants, distributors })

  // Sheet 3 — the month's orders and invoicing, grouped by region then distributor. It stays
  // inventory-free — every one of its columns is totalled, and an unreserved stock column cannot be
  // (ADR-0002); the per-SKU stock lives on Sheet 4, which is totalled nowhere.
  const distributorRegions = buildDistributorRegionData(distRowsAll)

  // ── Sheet 4 — distributor × SKU: what is pending, what was invoiced this month, and how much of
  // that size is FREE at each plant that serves the distributor. One row per pair that is LIVE
  // (pending or invoiced MTD above zero) — not every possible pair. Region → distributor →
  // pending desc, with the SKU label as a stable tiebreak.
  //
  // `freeStock` is the SERVICE AREA's (ticket #129): on-hand at the plants that serve this
  // distributor's region, less the Confirmed tonnage of every distributor in that same area. Inside
  // an area it is reserved to nobody, so the identical tonnage repeats on every row for that size
  // and `shortBy` can read 0 on a row whose size is oversubscribed several times over. That is why
  // the rendered sheet carries no total on it — in fact no total row at all — and a caption naming
  // the sharing (ADR-0002). ACROSS areas nothing repeats: a West row reads West plants' stock, and
  // today that is zero while Hyderabad holds the lot.
  const distSkuRows = []
  distRowsAll.forEach(r => {
    ;(r.skuRows || []).forEach(s => {
      if (!(s.pending > EPS || s.mtdInvoice > EPS)) return
      distSkuRows.push({
        region: r.region, state: r.state || '', customer: r.customer,
        skuKey: s.id, sku: skuLabel(skuByKey.get(s.id), s.description || s.id),
        invoicedMtd: s.mtdInvoice, confirmed: s.confirmed, nonConfirmed: s.nonConfirmed,
        // NOT `?? 0`. A distributor with no known service area (`Unmapped`) gets null from
        // salesByDistributor, and coercing that to 0 prints "no stock" where the truth is "we
        // cannot tell" — a sales team reads the first as a fact and the second as a job to do.
        // The renderer prints "?" for null; App.jsx already renders it as an em dash.
        pending: s.pending, onhand: s.onhand ?? null, freeStock: s.freeStock ?? null,
        allConfirmed: s.allConfirmed ?? null, shortBy: s.shortBy ?? null,
        // FREE INVENTORY, BY PLANT — what the sheet prints. Same `?? null` discipline as the
        // columns above: an Unmapped distributor has no service area, so there is no set of plants
        // to ask — that is null and renders "?", not an empty object which would render four
        // confident dashes. `onhandByPlant` rides along unprinted: it is the countable base the
        // free cells are derived from, and the sheet's tie-out is asserted against it (ADR-0010).
        freeStockByPlant: s.freeStockByPlant ?? null,
        onhandByPlant: s.onhandByPlant ?? null,
        onhandByPlantUnmatched: s.onhandByPlantUnmatched ?? null,
      })
    })
  })
  distSkuRows.sort((a, b) =>
    (regionRank(a.region) - regionRank(b.region))
    || a.customer.localeCompare(b.customer)
    || (b.pending - a.pending)
    || a.sku.localeCompare(b.sku))

  // ── The per-plant split (ticket #127). Every KPI above is untouched — this is a breakdown OF
  // them. Its own `checks` assert the rows sum back to the SAME ROWS counted ungrouped; that the
  // result also equals the KPI cards above (which are derived their own way) is asserted across the
  // two builders in `reports.test.js`, because a function cannot check itself against a figure it
  // has not been shown.
  const plantSplit = buildPlantMtdSummary(orders, dispatches, { date: D })

  // ── The servable split and the plant pipeline (workbook parity, commit 3) ──────────────────────
  // Both are carried here so the workbook reads the SAME functions the daily WhatsApp message does.
  // The message was reshaped in 8d5de14 and the workbook was left behind; two builders answering one
  // question two ways is exactly how the sheet and the broadcast drift apart in a reader's hands.
  // Nothing is drawn from these yet — this step only proves they arrive intact.
  const servable = buildServableSummary(orders, dispatches, skus,
    { date: D, productions, stateRegions, plants, distributors })

  // ── `null` is not `[]` ─────────────────────────────────────────────────────────────────────────
  // `notDeleted(null)` returns `[]`, so an unsupplied register does not fail — it computes a
  // perfectly confident RM of ZERO. A workbook printing "0 T of steel" is not a gap a reader can
  // see; it is a lie they act on. So the absence is carried as a FLAG and rendered "?", never 0.
  //
  // BOTH registers or neither: the full-coil figure excludes mothers that were slit, and the set of
  // slit mothers is read off `babyCoils`. Supply coils alone and every slit mother counts as stock
  // again — steel already cut up, re-reported as whole. That is a worse answer than "unknown".
  const rmKnown = coils != null && babyCoils != null
  const pipelineRaw = buildPlantPipelineSummary(productions, dispatches, coils, babyCoils, { date: D })
  const blankRm = (o) => ({ ...o, fullCoilLeft: null, babyLeft: null, rmTotal: null })
  const pipeline = rmKnown ? pipelineRaw : {
    ...pipelineRaw,
    plants: pipelineRaw.plants.map(blankRm),
    totals: blankRm(pipelineRaw.totals),
    // A tie-out check over a figure nobody supplied would read `true` — 0 matching 0. Unknown is not
    // a passing check, so it reads null and the sheet cannot claim RM reconciles.
    checks: { ...pipelineRaw.checks, rmTiesToAllPlants: null, allPlantsFullCoilLeft: null, allPlantsBabyLeft: null },
    diagnostics: { ...pipelineRaw.diagnostics, unattributedRmTotal: null, babyNotCounted: null },
  }

  return {
    date: D, month: MONTH, prevMonth: PREV, day: DAY, daysRemaining: remaining, bestEstimate: BE,
    plantSplit,
    servable,
    pipeline,
    // What the pipeline block is allowed to claim. `rmKnown: false` means the caller never handed
    // over the coil registers, so every RM cell above is null and the renderer must print "?".
    pipelineScope: { rmKnown },
    distributorRegions,
    distributorSku: { rows: distSkuRows },
    kpis: { bestEstimate: BE, orderPipeline: totalOrders, invoicedMtd, invoicedPctPipeline, pending, physicalInventory, invAgeingDaysAvg, unmatchedDispatch: unmatched },
    orderStatus: { bestEstimate: BE, ordersReceived: totalOrders, invoicedMtd, confirmed, nonConfirmed, invoicePctOfBe },
    orderPipelineMtd: { totalOrders, ordersMonthIntake, invoicedMtd, invoicedPrev, dispatchD1, dispatchD, confirmed, nonConfirmed, dailyRunRate, ordersD, ordersD1, ordersD2 },
    inventoryProduction: { freshProductionMtd, physicalInventory, invAgeingDaysAvg, buckets: allBuckets, unmatchedDispatch: unmatched },
    skuAgeingRows: { rows: stockRows, total: stockTotal },
    reconciliation: { otherLe2, unmatchedDispatch: unmatched, physicalInventory },
  }
}

// ═══════════════════════════════════════════════════════════════
// EXCEL RENDERING (exceljs, lazy-loaded)
// ═══════════════════════════════════════════════════════════════
const ALL_BORDERS = {
  top: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  left: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  bottom: { style: 'thin', color: { argb: 'FF9CA3AF' } },
  right: { style: 'thin', color: { argb: 'FF9CA3AF' } },
}
const fill = (argb) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })
const COLOR = {
  title: 'FFBDD7EE', head: 'FFD9E1F2', sub: 'FFFFF2CC', grand: 'FFFFE699',
  ROUND: 'FFC55A11', SHS: 'FF2E7D32', RHS: 'FF1565C0', OTHER: 'FF6B7280',
  coil: 'FF7030A0', strip: 'FF0F766E',
}
const today = () => new Date().toISOString().slice(0, 10)
const ddmmyyyy = (iso) => { const [y, m, d] = String(iso).split('-'); return d ? `${d}.${m}.${y}` : iso }

// Shared download — mirrors downloadCSV (App.jsx): Blob + anchor click + revoke.
export async function downloadWorkbook(workbook, filename) {
  const buf = await workbook.xlsx.writeBuffer()
  downloadBlob(new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  }), filename)
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const loadExcelJS = async () => {
  const mod = await import('exceljs')
  // Vite resolves exceljs to its browser build; the ExcelJS object (with .Workbook) sits on
  // the default export — but harden against a bundler that surfaces the named export instead.
  return mod.Workbook ? mod : (mod.default ?? mod)
}

// Set a numeric cell's format + right-align it. Module-level so both report builders share it.
const numCell = (row, idx, fmt) => { const c = row.getCell(idx); c.numFmt = fmt; c.alignment = { horizontal: 'right' } }

// Title (merged, banded) + right-aligned date sub-title across `cols` columns. Returns
// the next free row number.
const writeTitle = (ws, cols, title, dateIso) => {
  const last = String.fromCharCode(64 + cols) // 1→A, 7→G
  ws.mergeCells(`A1:${last}1`)
  const t = ws.getCell('A1')
  t.value = title
  t.font = { bold: true, size: 14, color: { argb: 'FF1F3864' } }
  t.alignment = { horizontal: 'center', vertical: 'middle' }
  t.fill = fill(COLOR.title)
  ws.getRow(1).height = 24
  ws.mergeCells(`A2:${last}2`)
  const s = ws.getCell('A2')
  s.value = `As on: ${ddmmyyyy(dateIso)}`
  s.font = { bold: true, size: 11, color: { argb: 'FF1F3864' } }
  s.alignment = { horizontal: 'right' }
  s.fill = fill(COLOR.title)
  return 3
}

const styleHeaderRow = (row) => row.eachCell(c => {
  c.font = { bold: true }
  c.fill = fill(COLOR.head)
  c.border = ALL_BORDERS
  c.alignment = { horizontal: 'center' }
})

const sectionBand = (ws, cols, rowNum, text, argb) => {
  const last = String.fromCharCode(64 + cols)
  ws.mergeCells(`A${rowNum}:${last}${rowNum}`)
  const c = ws.getCell(`A${rowNum}`)
  c.value = text
  c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  c.fill = fill(argb)
  c.alignment = { horizontal: 'left' }
}

// A suffix appended to a report's file name, for when the workbook covers less than the whole
// company (ticket #121: the header plant filter scopes the Reports tab too). A scoped workbook is
// indistinguishable from the company one by name alone — `PB-MTD-Dashboard-2026-08-19.xlsx` either
// way — and these files are mailed and broadcast, so the file name has to carry the scope with it.
// The scope is ALSO stamped into every sheet's title via `opts.companyName`; this is the half that
// survives being saved, renamed in a mail client, or read from a download list.
const fileScope = (opts) => (opts.fileSuffix ? `-${opts.fileSuffix}` : '')

// Writes one Finished Pipe Stock worksheet into `wb`, scoped to whatever productions/dispatches it
// is handed — the sheet itself has no idea whether that is the whole company or one plant. Pulled
// out of `generateFinishedStockReport` so a per-plant tab and the company-wide tab are the exact
// same layout, built by the exact same code, never two versions to keep in sync.
const writeFinishedStockSheet = (wb, sheetName, title, date, skus, productions, dispatches, opts) => {
  const data = buildFinishedStockData(skus, productions, dispatches, opts)
  const ws = wb.addWorksheet(sheetName, { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.columns = [
    { width: 16 }, { width: 9 }, { width: 9 }, { width: 11 },
    { width: 11 }, { width: 13 }, { width: 18 },
  ]
  const COLS = ['SIZE', 'THICK', 'LEN', 'KG/PCS', 'PCS', 'QTY (MT)', 'REMARKS']

  writeTitle(ws, 7, title, date)
  styleHeaderRow(ws.addRow(COLS))

  if (!data.sections.length) {
    const r = ws.addRow(['No stock on hand', '', '', '', 0, 0, ''])
    r.eachCell(c => { c.border = ALL_BORDERS })
  }
  data.sections.forEach(section => {
    sectionBand(ws, 7, ws.addRow([]).number, `BLACK PIPE ( ${section.name} )`, COLOR[section.name] || COLOR.OTHER)
    section.rows.forEach(r => {
      const row = ws.addRow([r.size, r.thick, r.len, r.kgPerPcs, r.pcs, r.mt, r.remarks])
      numCell(row, 4, '0.00'); numCell(row, 5, '0'); numCell(row, 6, '0.000')
      row.eachCell(c => { c.border = ALL_BORDERS })
    })
    const sub = ws.addRow([`${section.name} TOTAL`, '', '', '', section.subtotal.pcs, section.subtotal.mt, ''])
    sub.font = { bold: true }
    numCell(sub, 5, '0'); numCell(sub, 6, '0.000')
    sub.eachCell(c => { c.fill = fill(COLOR.sub); c.border = ALL_BORDERS })
  })

  const gt = ws.addRow(['GRAND TOTAL (listed sizes)', '', '', '', data.grand.pcs, data.grand.mt, 'MT'])
  gt.font = { bold: true, size: 12 }
  numCell(gt, 5, '0'); numCell(gt, 6, '0.000')
  gt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })

  // Over-dispatched sizes hold no stock so they have no row above, but the pipe left the plant.
  // Deduct it here so the sheet's net ties to the Dashboard's FG Left Inventory card.
  if (data.unmatched.mt > EPS) {
    const um = ws.addRow([`Less: dispatched w/o recorded production (${data.unmatched.skus} SKU)`, '', '', '',
      data.unmatched.pcs, data.unmatched.mt, 'MT'])
    numCell(um, 5, '0'); numCell(um, 6, '0.000')
    um.eachCell(c => { c.border = ALL_BORDERS })

    const nt = ws.addRow(['NET FINISHED STOCK', '', '', '', data.net.pcs, data.net.mt, 'MT'])
    nt.font = { bold: true, size: 12 }
    numCell(nt, 5, '0'); numCell(nt, 6, '0.000')
    nt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })
  }
}

// ── Report A — Finished Pipe Stock ──
// One company-wide "Finished Stock" tab, as before, plus — only when this run covers more than one
// plant (opts.perPlantTabs, set by the caller from the header's "All Plants" selection; a run
// already scoped to a single plant would just repeat the company sheet) — one additional tab per
// plant, in plant-master order. Every master plant gets a tab even with zero stock (the Dashboard's
// Plant-wise Tracker's "always expanded" rule, ticket #174) so a plant's tab is always in the same
// place; an "Unattributed" tab is added only when such tonnage actually exists — absence is the
// common case and a permanent empty tab for it would be noise.
export async function generateFinishedStockReport(skus, productions, dispatches, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()

  writeFinishedStockSheet(wb, 'Finished Stock', `${company} — FINISHED PIPE STOCK REPORT`, date, skus, productions, dispatches, opts)

  if (opts.perPlantTabs) {
    const masterPlants = plantMaster(opts.plants)
    masterPlants.forEach(p => {
      const pProd = filterByPlant(productions, p.id)
      const pDisp = filterDispatchesByPlant(dispatches, p.id)
      writeFinishedStockSheet(wb, p.name.slice(0, 31), `${company} — ${p.name} — FINISHED PIPE STOCK`, date, skus, pProd, pDisp, opts)
    })
    // Unattributed is stored as '' (blank/missing `plant`), never the literal display name —
    // `filterByPlant`/`filterDispatchesByPlant` match on the STORED value, same as everywhere else
    // a plant filter runs. `plantKeysIn` is the one place that normalisation lives, so a tonnage
    // check here can never drift from what the filter itself considers Unattributed.
    const uProd = filterByPlant(productions, '')
    const uDisp = filterDispatchesByPlant(dispatches, '')
    const hasUnattributed = plantKeysIn(notDeleted(productions)).has('')
      || plantKeysIn(notDeleted(dispatches).flatMap(d => d.bundleEntries || [])).has('')
    if (hasUnattributed) {
      writeFinishedStockSheet(wb, 'Unattributed', `${company} — UNATTRIBUTED — FINISHED PIPE STOCK`, date, skus, uProd, uDisp, opts)
    }
  }

  await downloadWorkbook(wb, `finished-stock-${date}${fileScope(opts)}.xlsx`)
}

// ── Report B — Raw Material Stock ──
export async function generateRawMaterialReport(coils, babyCoils, productions, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const data = buildRawMaterialData(coils, babyCoils, productions)
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Raw Material Stock')
  ws.columns = [{ width: 12 }, { width: 10 }, { width: 18 }, { width: 14 }]

  writeTitle(ws, 4, `${company} — TUBE MILL RAW MATERIAL STOCK`, date)

  const col = (n) => String.fromCharCode(64 + n)
  // Total row: label merged across cols 1..labelSpan; the MT value lands in `valueCol`,
  // optionally merged out to `valueMergeTo` — so a total sits in the same column (and merge
  // span) as the data rows it sums, instead of drifting one column over.
  const totalRow = (label, labelSpan, valueCol, mt, valueMergeTo = 0) => {
    const cells = Array(4).fill('')
    cells[0] = label
    cells[valueCol - 1] = mt
    const row = ws.addRow(cells)
    if (labelSpan > 1) ws.mergeCells(`A${row.number}:${col(labelSpan)}${row.number}`)
    if (valueMergeTo > valueCol) ws.mergeCells(`${col(valueCol)}${row.number}:${col(valueMergeTo)}${row.number}`)
    row.font = { bold: true }
    numCell(row, valueCol, '0.000')
    row.eachCell(c => { c.fill = fill(COLOR.sub); c.border = ALL_BORDERS })
    return row
  }

  // Section 1 — HR Coil Stock
  sectionBand(ws, 4, ws.addRow([]).number, 'HR COIL STOCK  (whole, unslit mother coils)', COLOR.coil)
  styleHeaderRow(ws.addRow(['WIDTH', 'THICK', 'GRADE', 'WT (MT)']))
  if (!data.hrCoil.groups.length) {
    const r = ws.addRow(['No unslit coils', '', '', 0]); r.eachCell(c => { c.border = ALL_BORDERS })
  }
  data.hrCoil.groups.forEach(g => {
    const row = ws.addRow([g.width, g.thick, g.grade, g.mt])
    numCell(row, 2, '0.00'); numCell(row, 4, '0.000')
    row.eachCell(c => { c.border = ALL_BORDERS })
  })
  totalRow('HR COIL TOTAL', 3, 4, data.hrCoil.total)

  // Section 2 — HR Strip / Baby Coil Stock
  sectionBand(ws, 4, ws.addRow([]).number, 'HR STRIP / BABY-COIL STOCK  (slit strip, free weight)', COLOR.strip)
  styleHeaderRow(ws.addRow(['WIDTH', 'THICK', 'WT FREE (MT)', '']))
  ws.mergeCells(`C${ws.lastRow.number}:D${ws.lastRow.number}`)
  if (!data.strip.groups.length) {
    const r = ws.addRow(['No strip stock', '', 0, '']); r.eachCell(c => { c.border = ALL_BORDERS })
  }
  data.strip.groups.forEach(g => {
    const row = ws.addRow([g.width, g.thick, g.mt, ''])
    ws.mergeCells(`C${row.number}:D${row.number}`)
    numCell(row, 2, '0.00'); numCell(row, 3, '0.000')
    row.eachCell(c => { c.border = ALL_BORDERS })
  })
  totalRow('STRIP TOTAL', 2, 3, data.strip.total, 4)

  const gt = ws.addRow(['GRAND TOTAL', '', '', data.grand])
  ws.mergeCells(`A${gt.number}:C${gt.number}`)
  gt.font = { bold: true, size: 12 }
  numCell(gt, 4, '0.000')
  gt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })

  await downloadWorkbook(wb, `raw-material-${date}${fileScope(opts)}.xlsx`)
}

// ── Report C — PB MTD Dashboard (4 sheets) ──
// Sheet 1 "Dashboard": a 6-card KPI band + three colour-banded tables (Order Status Summary,
// Order Pipeline — MTD, Inventory & Production). Sheet 2: every SKU with on-hand inventory over
// MIN_ONHAND_MT with FIFO age buckets. Sheet 3: distributor Best Estimate vs invoiced. Sheet 4:
// distributor × SKU pending / invoiced against unreserved plant stock. Numbers come from
// buildMtdDashboardData (which mirrors pb-mtd-report), so pass live-weight-resolved productions.
// `opts.estimates` are the per-distributor monthly targets; `opts.stateRegions` the state → region
// master (both come straight off the Sales tab).
const DASH = {
  be: 'FFBF8F00', pipeline: 'FF2E75B6', invoiced: 'FF548235', pending: 'FFC55A11',
  physinv: 'FF7030A0', ageing: 'FF1F7A72',
  bandStatus: 'FF2E75B6', bandPipeline: 'FF548235', bandInv: 'FFC55A11', bandPlant: 'FF7030A0',
}
// Display-only one-decimal tonnage. Shared by the Dashboard's BY PLANT block and the distributor
// sheets: the cell holds the exact value, so every total on every sheet keeps tying to the KPIs.
const MT_1DP = '#,##0.0'
const naMt = (v) => (v == null ? 'N/A' : Number(v))                       // numeric cell (MT or a ratio): number → numFmt, null → "N/A"
const naPct = (v) => (v == null ? 'N/A' : `${Math.round(Number(v))}%`)      // percentage cell as text (whole number)
// UNKNOWN, not zero. Used where the workbook was never handed the register behind a figure (RM
// without its coils) or where no region can answer (servable under an unmapped book). A sheet that
// prints 0 there states a fact it does not have; "?" is the only honest cell.
const qMt = (v) => (v == null ? '?' : Number(v))

export async function generateMtdDashboardReport(orders, dispatches, productions, skus, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const data = buildMtdDashboardData(orders, dispatches, productions, skus,
    { date, estimates: opts.estimates ?? [], stateRegions: opts.stateRegions ?? null,
      plants: opts.plants ?? null, distributors: opts.distributors ?? null,
      // Undefined, not [], when the caller has no register: `notDeleted([])` is a confident zero
      // and `notDeleted(null)` is the same zero. Only ABSENCE reaches `rmKnown` as unknown.
      coils: opts.coils ?? null, babyCoils: opts.babyCoils ?? null })
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  const cL = (n) => String.fromCharCode(64 + n)

  // ── Sheet 1 — Dashboard (12-column grid: 6 KPI cards × 2 cols; left table cols 1–6, right 7–12) ──
  const ws = wb.addWorksheet('Dashboard', {
    views: [{ state: 'frozen', ySplit: 2 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  const N = 12
  ws.columns = Array.from({ length: N }, () => ({ width: 11 }))
  const monthLabel = new Date(date + 'T00:00:00Z')
    .toLocaleString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).toUpperCase()
  writeTitle(ws, N, `${company} — PB MTD DASHBOARD — ${monthLabel}`, date)

  const setBorders = (r, c1, c2) => { for (let c = c1; c <= c2; c++) ws.getCell(r, c).border = ALL_BORDERS }

  // KPI band — headers (row 4), values (row 5), captions (row 6).
  const k = data.kpis
  // The scope the Invoiced figures carry (#127), decided by the builder and merely appended here —
  // so the card, the tables, the block header and the two distributor sheets cannot drift into
  // saying different things about whose tonnage the column holds. Empty when there is nothing to
  // name. `ps` is the split itself, used again by the BY PLANT block further down.
  const ps = data.plantSplit
  const sv = data.servable
  const pipe = data.pipeline
  const svKnown = sv.diagnostics.regionsAnswering > 0
  const invScope = ps.invoicing.suffix
  // Whether this workbook covers the whole company or one plant. `fileSuffix` is what #121 already
  // sets for a scoped download (alongside the `— <Plant> only` sheet titles), so it is the existing
  // single answer to that question rather than a second flag that could disagree with it. The split
  // block's total row reads ALL PLANTS only when it really is: a Hyderabad-scoped workbook printing
  // "ALL PLANTS" over one Hyderabad row is exactly the mis-attribution #117 exists to end.
  const allPlantsScope = !opts.fileSuffix
  const cards = [
    { h: 'BEST ESTIMATE (MT)', v: naMt(k.bestEstimate), s: 'Σ distributor estimates', c: DASH.be },
    { h: 'INDENT (MT)', v: naMt(k.orderPipeline), s: 'Invoiced + Conf + Non-Conf', c: DASH.pipeline },
    { h: 'INVOICED MTD (MT)', v: naMt(k.invoicedMtd), s: (k.invoicedPctPipeline == null ? '' : `${Math.round(k.invoicedPctPipeline)}% of pipeline`) + invScope, c: DASH.invoiced },
    // THE RENAME (commit 5). This card used to print the whole open book under the name the daily
    // message gives to a tenth of it. It now carries the message's figure — Confirmed plus only the
    // unconfirmed tonnage the floor can actually cover — and the wide book keeps the name it already
    // has everywhere else, "Pending to Serve", on the Order Status table and the BY PLANT block.
    // N/A, never 0, when no region can answer: `totals` sums only the regions that have an answer,
    // so with none at all a plain sum reads a confident zero meaning "nothing is servable" — the
    // opposite of "nobody has mapped these states yet".
    { h: 'PENDING TO DISPATCH (MT)', v: naMt(svKnown ? sv.totals.pendingToDispatch : null),
      s: 'Conf + Servable–Unconf', c: DASH.pending },
    { h: 'PHYSICAL INVENTORY (MT)', v: naMt(k.physicalInventory), s: 'produced − invoiced', c: DASH.physinv },
    { h: 'INV. AGEING (DAYS AVG)', v: naMt(k.invAgeingDaysAvg), s: 'FIFO, tonnage-wtd', c: DASH.ageing },
  ]
  const HR = 4, VR = 5, SR = 6
  ws.getRow(HR).height = 30; ws.getRow(VR).height = 22
  cards.forEach((card, i) => {
    const c1 = i * 2 + 1, c2 = c1 + 1
    ws.mergeCells(`${cL(c1)}${HR}:${cL(c2)}${HR}`)
    const h = ws.getCell(HR, c1)
    h.value = card.h; h.font = { bold: true, size: 9, color: { argb: 'FFFFFFFF' } }
    h.fill = fill(card.c); h.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    ws.mergeCells(`${cL(c1)}${VR}:${cL(c2)}${VR}`)
    const v = ws.getCell(VR, c1)
    v.value = card.v; v.font = { bold: true, size: 15 }
    if (typeof card.v === 'number') v.numFmt = '#,##0'
    v.alignment = { horizontal: 'center', vertical: 'middle' }
    ws.mergeCells(`${cL(c1)}${SR}:${cL(c2)}${SR}`)
    const s = ws.getCell(SR, c1)
    s.value = card.s; s.font = { size: 8, color: { argb: 'FF6B7280' } }
    s.alignment = { horizontal: 'center' }
    setBorders(HR, c1, c2); setBorders(VR, c1, c2); setBorders(SR, c1, c2)
  })

  // A colour-banded label|value table. label spans lc1..lc2, value spans vc1..vc2; band spans the lot.
  const table = (startRow, lc1, lc2, vc1, vc2, title, argb, headerLabel, rows) => {
    ws.mergeCells(`${cL(lc1)}${startRow}:${cL(vc2)}${startRow}`)
    const band = ws.getCell(startRow, lc1)
    band.value = title; band.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    band.fill = fill(argb); band.alignment = { horizontal: 'left', vertical: 'middle' }
    const hrow = startRow + 1
    ws.mergeCells(`${cL(lc1)}${hrow}:${cL(lc2)}${hrow}`)
    ws.mergeCells(`${cL(vc1)}${hrow}:${cL(vc2)}${hrow}`)
    const hl = ws.getCell(hrow, lc1); hl.value = headerLabel; hl.font = { bold: true }; hl.fill = fill(COLOR.head); hl.alignment = { horizontal: 'left' }
    const hv = ws.getCell(hrow, vc1); hv.value = 'MT'; hv.font = { bold: true }; hv.fill = fill(COLOR.head); hv.alignment = { horizontal: 'right' }
    setBorders(hrow, lc1, vc2)
    let r = hrow + 1
    rows.forEach(row => {
      ws.mergeCells(`${cL(lc1)}${r}:${cL(lc2)}${r}`)
      ws.mergeCells(`${cL(vc1)}${r}:${cL(vc2)}${r}`)
      const lcell = ws.getCell(r, lc1); lcell.value = (row.indent ? '     ' : '') + row.label; lcell.alignment = { horizontal: 'left' }
      const vcell = ws.getCell(r, vc1); vcell.value = row.value; vcell.alignment = { horizontal: 'right' }
      if (typeof row.value === 'number') vcell.numFmt = '#,##0'
      if (row.strong) { lcell.font = { bold: true }; vcell.font = { bold: true }; lcell.fill = fill(COLOR.grand); vcell.fill = fill(COLOR.grand) }
      setBorders(r, lc1, vc2)
      r++
    })
    return r
  }

  // A 6-cell row across the 12-column grid — the shape every block below the cards shares.
  // Tonnage renders to ONE DECIMAL (the cards above are whole): a plant holding 0.4 MT must not
  // read as a plant holding nothing. The format alone rounds it; every cell holds the exact value,
  // so the totals keep tying to the cards.
  const psPairs = [[1, 2], [3, 4], [5, 6], [7, 8], [9, 10], [11, 12]]
  const psRow = (rowNum, values) => psPairs.map(([c1, c2], i) => {
    ws.mergeCells(`${cL(c1)}${rowNum}:${cL(c2)}${rowNum}`)
    const c = ws.getCell(rowNum, c1)
    c.value = values[i]
    c.alignment = { horizontal: i === 0 ? 'left' : 'right', vertical: 'middle', wrapText: true }
    if (typeof values[i] === 'number') c.numFmt = MT_1DP
    c.border = ALL_BORDERS
    return c
  })

  const os = data.orderStatus, op = data.orderPipelineMtd, ip = data.inventoryProduction
  let leftRow = table(8, 1, 4, 5, 6, 'ORDER STATUS SUMMARY', DASH.bandStatus, 'Metric', [
    { label: 'Best Estimate (BE)', value: naMt(os.bestEstimate) },
    { label: 'Indent', value: os.ordersReceived },
    { label: `Invoiced MTD${invScope}`, value: os.invoicedMtd },
    { label: 'Confirmed Pending Invoice', value: os.confirmed },
    { label: 'Non-Confirmed Orders', value: os.nonConfirmed },
    // The three lines that make the rename readable. A reader holding this sheet beside a screen
    // still saying "Pending to Dispatch = 4,542" can see both figures here and which is which.
    { label: 'Servable – Unconfirmed', value: qMt(svKnown ? sv.totals.servableUnconfirmed : null), indent: true },
    { label: 'Pending to Serve', value: os.confirmed + os.nonConfirmed },
    { label: 'Pending to Dispatch', value: qMt(svKnown ? sv.totals.pendingToDispatch : null) },
    { label: 'Invoice % of BE', value: naPct(os.invoicePctOfBe), strong: true },
  ])
  leftRow += 1 // spacer between the two stacked left-hand tables
  const leftEnd = table(leftRow, 1, 4, 5, 6, 'INVENTORY & PRODUCTION', DASH.bandInv, 'Metric', [
    { label: 'Fresh Production MTD', value: ip.freshProductionMtd },
    { label: 'Produced (Prev Month, same days)', value: pipe.totals.producedPrev },
    { label: 'Physical Inventory', value: ip.physicalInventory },
    // RM is a POSITION, not a movement: a coil has no "dispatch", so there is no movement table for
    // it and none is implied. "?" when the registers were never supplied — see qMt.
    { label: 'RM — Full Coil', value: qMt(pipe.totals.fullCoilLeft) },
    { label: 'RM — Baby Coil', value: qMt(pipe.totals.babyLeft) },
    { label: 'RM Total', value: qMt(pipe.totals.rmTotal) },
    { label: 'Inventory Ageing (Days Avg)', value: naMt(ip.invAgeingDaysAvg) },
    { label: 'Ageing 0–30 d', value: ip.buckets.d0_30, indent: true },
    { label: 'Ageing 31–60 d', value: ip.buckets.d31_60, indent: true },
    { label: 'Ageing 61–90 d', value: ip.buckets.d61_90, indent: true },
    { label: 'Ageing 90+ d', value: ip.buckets.d90plus, indent: true },
  ])
  const rightEnd = table(8, 7, 10, 11, 12, 'ORDER BOOK — MTD', DASH.bandPipeline, 'Line', [
    { label: 'Indent', value: op.totalOrders },
    { label: 'Current Month Orders', value: op.ordersMonthIntake },
    { label: `Invoiced Orders MTD${invScope}`, value: op.invoicedMtd },
    { label: `Invoiced MTD (Prev Month, same days)${invScope}`, value: op.invoicedPrev },
    { label: 'Dispatch D-1', value: op.dispatchD1 },
    { label: 'Dispatch D Day', value: op.dispatchD },
    { label: 'Confirmed Pending Invoice', value: op.confirmed },
    { label: 'Non-Confirmed Orders', value: op.nonConfirmed },
    { label: 'Daily Run Rate Required', value: naMt(op.dailyRunRate), strong: true },
    { label: 'Orders Logged — D Day', value: op.ordersD },
    { label: 'Orders Logged — D-1', value: op.ordersD1 },
    { label: 'Orders Logged — D-2', value: op.ordersD2 },
  ])

  // ── BY PLANT — the split, directly BENEATH the totals it breaks down (ticket #127) ────────────
  // Not a replacement for a single figure above it. The ALL PLANTS row is the same tonnage as the
  // INVOICED MTD card and the Pending to Serve line on the Order Status table, and
  // `plantSplit.checks` has already asserted that. NOTE since commit 5: its Pending column is the
  // WIDE book and no longer matches the PENDING TO DISPATCH card, which now carries the
  // stock-backed figure. That is why the column is named Pending to Serve and why the note below
  // spells the difference out — the two sit inches apart on one sheet.
  //
  // The Invoiced column carries its scope in its own header, because this is the one place in the
  // workbook where one plant's Invoiced sits directly beside four plants' Pending. Naming it is the
  // deliverable — the mismatch is the ERP's shape, not an error to correct here.
  //
  // Tonnage renders to ONE DECIMAL (the cards above are whole) — a plant holding 0.4 MT must not
  // read as a plant holding nothing. The cell format alone rounds it; every cell holds the exact
  // value, so the ALL PLANTS row keeps tying to the cards.
  // ── One banded block: title, header, body rows, a bold total, an italic note ────────────────
  // Every block below the KPI cards has this shape, and sharing the renderer is what keeps them
  // looking like one sheet. `bad` flips the note red and is how a block states its own tie-out
  // failure: the house rule is that a breakdown which does not add up to the headline above it is
  // WORSE than no breakdown, so the sheet has to say so on its own face rather than look fine.
  const block = (startRow, title, argb, headers, bodyRows, totalRow, note, bad = false) => {
    let r = startRow
    ws.mergeCells(`${cL(1)}${r}:${cL(N)}${r}`)
    const b = ws.getCell(r, 1)
    b.value = title; b.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    b.fill = fill(argb); b.alignment = { horizontal: 'left', vertical: 'middle' }
    r += 1
    psRow(r, headers).forEach(c => { c.font = { bold: true }; c.fill = fill(COLOR.head) })
    ws.getRow(r).height = 26
    r += 1
    if (!bodyRows.length) { psRow(r, ['Nothing to report']); r += 1 }
    bodyRows.forEach(vals => { psRow(r, vals); r += 1 })
    if (totalRow) {
      psRow(r, totalRow).forEach(c => { c.font = { bold: true }; c.fill = fill(COLOR.grand) })
      r += 1
    }
    ws.mergeCells(`${cL(1)}${r}:${cL(N)}${r}`)
    const n = ws.getCell(r, 1)
    n.value = (bad ? '⚠ THIS BLOCK DOES NOT ADD UP TO THE FIGURES ABOVE IT — do not circulate this sheet. ' : '') + note
    n.font = bad ? { bold: true, size: 9, color: { argb: 'FFB91C1C' } }
      : { italic: true, size: 9, color: { argb: 'FF6B7280' } }
    n.alignment = { wrapText: true, vertical: 'top' }
    ws.getRow(r).height = 34
    return r + 2
  }

  // ── SERVABLE BY REGION — the block the KPI card's new meaning rests on ────────────────────────
  // Counted once per (region, size), never per distributor: inside a service area the stock is
  // shared and reserved to nobody, so adding per-distributor servable figures would invent steel
  // the plant does not hold (ADR-0002). An Unmapped region reads "?" in both derived columns —
  // no region means no service area, so the question has no answer, which is not the same as zero.
  let pr = Math.max(leftEnd, rightEnd) + 1
  const svTied = sv.checks.confirmedTiesToBook && sv.checks.unconfirmedTiesToBook
    && sv.checks.servableWithinUnconfirmed
  pr = block(pr, 'SERVABLE BY REGION — WHAT THE FLOOR CAN COVER TODAY', DASH.bandStatus,
    ['Region', 'Confirmed', 'Non-Conf', 'Servable – Unconf', 'Pending to Dispatch'],
    sv.regions.map(g => [g.region, g.confirmed, g.unconfirmed,
      qMt(g.servableUnconfirmed), qMt(g.pendingToDispatch)]),
    ['TOTAL (= the Pending to Dispatch card)', sv.totals.confirmed, sv.totals.unconfirmed,
      qMt(svKnown ? sv.totals.servableUnconfirmed : null), qMt(svKnown ? sv.totals.pendingToDispatch : null)],
    `Servable – Unconfirmed is the part of Non-Confirmed the serving plants can cover from stock on hand RIGHT NOW, after Confirmed has taken its claim. Pending to Dispatch = Confirmed + Servable – Unconfirmed, and it is the KPI card above. It is NOT the whole order book: that is Pending to Serve (${(sv.totals.confirmed + sv.totals.unconfirmed).toFixed(1)} MT), on the Order Status table and in the BY PLANT block below. Counted once per region and size — never per distributor, because inside a service area stock is reserved to nobody and adding those figures would report more steel than the plants hold (ADR-0002). "?" means the region has no service area to read stock from${sv.diagnostics.unmappedUnconfirmed > 0 ? `; ${sv.diagnostics.unmappedUnconfirmed.toFixed(1)} MT of Non-Confirmed sits there unanswerable until its states are mapped on the Sales tab` : ''}. Values are exact; only the display is rounded.`,
    !svTied)
  ws.mergeCells(`${cL(1)}${pr}:${cL(N)}${pr}`)
  const psBand = ws.getCell(pr, 1)
  psBand.value = 'BY PLANT — WHERE THE TONNAGE ABOVE ACTUALLY SITS'
  psBand.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  psBand.fill = fill(DASH.bandPlant)
  psBand.alignment = { horizontal: 'left', vertical: 'middle' }
  pr += 1
  const psHead = psRow(pr, ['Plant', `Invoiced MTD${invScope}`,
    'Confirmed', 'Non-Conf', 'Pending to Serve', 'Indent'])
  psHead.forEach(c => { c.font = { bold: true }; c.fill = fill(COLOR.head) })
  ws.getRow(pr).height = 26
  pr += 1
  if (!ps.plants.length) {
    psRow(pr, ['No plant carries an order line or an invoice', '', '', '', '', ''])
    pr += 1
  }
  ps.plants.forEach(row => {
    psRow(pr, [row.name, row.invoicedMtd, row.confirmed, row.nonConfirmed, row.pending, row.totalOrders])
    pr += 1
  })
  if (ps.plants.length) {
    const t = ps.totals
    const tot = psRow(pr, [`${allPlantsScope ? 'ALL PLANTS' : 'TOTAL (this workbook’s plant only)'} (= the KPI cards above)`,
      t.invoicedMtd, t.confirmed, t.nonConfirmed, t.pending, t.totalOrders])
    tot.forEach(c => { c.font = { bold: true }; c.fill = fill(COLOR.grand) })
    pr += 1
  }
  ws.mergeCells(`${cL(1)}${pr}:${cL(N)}${pr}`)
  const psNote = ws.getCell(pr, 1)
  // A breakdown that does not add up to the headline above it is worse than no breakdown at all —
  // so if either tie-out fails, the sheet says so on its own face. It still renders: a workbook that
  // refuses to download tells the reader nothing, while one that names its own failure can be
  // checked. The same assertion the region split makes, made where a reader will see it.
  const psTied = ps.checks.invoicedTiesToAllPlants && ps.checks.pendingTiesToAllPlants
  psNote.value = (psTied ? '' : `⚠ THE PLANT ROWS DO NOT ADD UP TO THE TOTALS ABOVE (out by ${ps.checks.maxAbsDiff.toFixed(3)} MT) — do not circulate this sheet. `)
    + (ps.invoicing.note ? ps.invoicing.note + ' ' : '')
    + `Pending to Serve (Confirmed + Non-Confirmed — the whole open book, NOT the stock-backed Pending to Dispatch on the KPI card above) comes from each ORDER line's plant, Invoiced from each INVOICE line's plant — both the ERP's own Ship From Code, neither typed. ${UNATTRIBUTED_PLANT} is a line whose plant the ERP did not let us resolve: its tonnage stays inside every total above, exactly as ${UNMAPPED_REGION} does on the region sheet, because a labelling gap is not missing weight. A plant listed with 0 Invoiced holds orders and has invoiced nothing this month — it is not an empty row. Values are exact; only the display is rounded.`
  psNote.font = psTied ? { italic: true, size: 9, color: { argb: 'FF6B7280' } } : { bold: true, size: 9, color: { argb: 'FFB91C1C' } }
  psNote.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(pr).height = 46
  pr += 2

  // ── STOCK MOVEMENT — where this month's finished tonnage came from and went ───────────────────
  // Opening + Production − Dispatch = Current, per plant AND on the total. Opening is built as a
  // COMPLEMENT (everything the register holds, less what this month carries) rather than its own
  // `date < 1st` filter: an undated production row is a data fault, and a date test would drop it
  // from Opening while Current kept it — the movement columns would quietly lose steel. Tonnage
  // dated LATER than the report date sits in Current but in neither Opening nor the MTD columns,
  // so the note names it instead of leaving an unexplained gap.
  //
  // Finished pipe only. A coil has no "dispatch", so raw material gets a POSITION block below and
  // no movement table — inventing one would imply a flow the data cannot support.
  const mv = pipe.totals
  const mon1 = new Date(date + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  const afterD = pipe.diagnostics.producedAfterD || pipe.diagnostics.invoicedAfterD
    ? ` ${(pipe.diagnostics.producedAfterD).toFixed(1)} MT produced and ${(pipe.diagnostics.invoicedAfterD).toFixed(1)} MT invoiced are dated AFTER ${ddmmyyyy(date)}: they are inside Current but in neither Opening nor the two MTD columns, which is the whole of the difference.`
    : ''
  pr = block(pr, `STOCK MOVEMENT — ${monthLabel} (FINISHED PIPE)`, DASH.bandInv,
    ['Plant', `Opening (01-${mon1})`, 'Production', 'Dispatch', 'Current'],
    pipe.plants.map(r => [r.name, r.openingFg, r.producedMtd, r.invoicedMtd, r.fgLeft]),
    [`${allPlantsScope ? 'ALL PLANTS' : 'TOTAL (this workbook’s plant only)'} (= Physical Inventory above)`,
      mv.openingFg, mv.producedMtd, mv.invoicedMtd, mv.fgLeft],
    `Opening + Production − Dispatch = Current, on every row and on the total. Opening is what the plant held on the 1st, reached as everything it has ever made less everything this month carries — not a date filter, so a row the ERP left undated keeps its tonnage here instead of vanishing from the identity. Current is the same tonnage as the PHYSICAL INVENTORY card above, reached a completely different way (Σ produced − Σ invoiced against Σ positive on-hand less over-shipment), which is what makes this a real cross-check rather than arithmetic checking itself.${afterD} Finished pipe only — raw material has no dispatch, so it is shown as a position below and not as a movement. Values are exact; only the display is rounded.`,
    !pipe.checks.movementTiesToFgLeft)

  // ── BY PLANT — RAW MATERIAL: a position, never a movement ─────────────────────────────────────
  // Baby coil reads `babyCoilStock`: the scrap floor and the operator's `consumed` flag (ADR-0007),
  // which is the Dashboard's own Baby Coils Left card. A plain Σ max(0, weight − consumed) is a
  // DIFFERENT and larger number, and having both in circulation is how a card and a workbook start
  // disagreeing about the same steel.
  pr = block(pr, 'BY PLANT — RAW MATERIAL (POSITION AS ON REPORT DATE)', DASH.bandPlant,
    ['Plant', 'Full Coil', 'Baby Coil', 'RM Total'],
    pipe.plants.map(r => [r.name, qMt(r.fullCoilLeft), qMt(r.babyLeft), qMt(r.rmTotal)]),
    [allPlantsScope ? 'ALL PLANTS' : 'TOTAL (this workbook’s plant only)',
      qMt(mv.fullCoilLeft), qMt(mv.babyLeft), qMt(mv.rmTotal)],
    `Full Coil is mother coils not yet slit; Baby Coil is slit strip still free, after the ${'\u2265'}0.2 MT scrap floor and the operator's consumed flag (ADR-0007) — the same rule as the Dashboard's Baby Coils Left card, so the two cannot disagree. ${pipe.diagnostics.babyNotCounted == null ? '' : `${pipe.diagnostics.babyNotCounted.toFixed(1)} MT of baby-coil weight is excluded by that rule.`} "?" means this workbook was never handed the coil registers, NOT that the plants hold no steel — regenerate from the Reports tab to fill it. There is deliberately no movement table for raw material: a coil is not dispatched, so Opening + In − Out has nothing to measure. Values are exact; only the display is rounded.`,
    pipe.checks.rmTiesToAllPlants === false)
  pr -= 2

  // ── Sheet 2 — every SKU with on-hand inventory > MIN_ONHAND_MT (MT) + FIFO age buckets ──
  const ws2 = wb.addWorksheet(`SKU Ageing (>${MIN_ONHAND_MT} MT)`, {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  ws2.columns = [{ width: 24 }, { width: 12 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 15 }]
  writeTitle(ws2, 8, `${company} — SKUs WITH ON-HAND INVENTORY > ${MIN_ONHAND_MT} MT`, date)
  styleHeaderRow(ws2.addRow(['SKU', 'On-hand MT', '0–30 d', '31–60 d', '61–90 d', '90+ d', 'Oldest (d)', 'Wtd Avg Age (d)']))
  // Tonnage and the weighted-average age read to one decimal here so a small position doesn't
  // render as a bare 0; day counts stay whole (a day to one decimal is fake precision). The
  // rounding is the cell FORMAT only — the exact value goes into the cell, so this sheet's
  // subtotal and its reconciliation block keep tying to the Dashboard's Physical Inventory KPI.
  const MT1 = '#,##0.0', DAYS0 = '#,##0'
  // Any value that would render as 0 at the cell's precision shows "-" instead. `dp` matches the
  // format the cell carries: 1 for tonnage / wtd avg age, 0 for whole-day counts.
  const dash = (v, dp = 1) =>
    (v == null || v === '' ? '' : (Math.round(Number(v) * 10 ** dp) === 0 ? '-' : Number(v)))
  const stock = data.skuAgeingRows
  if (!stock.rows.length) {
    const r = ws2.addRow([`No SKU with more than ${MIN_ONHAND_MT} MT on hand`, '', '', '', '', '', '', '']); r.eachCell(c => { c.border = ALL_BORDERS })
  }
  stock.rows.forEach(row => {
    const r = ws2.addRow([row.label, dash(row.onhandMt), dash(row.buckets.d0_30), dash(row.buckets.d31_60), dash(row.buckets.d61_90),
      dash(row.buckets.d90plus), dash(row.oldestAgeDays, 0), dash(row.avgAgeDays)])
    ;[2, 3, 4, 5, 6, 8].forEach(i => numCell(r, i, MT1))
    numCell(r, 7, DAYS0)
    r.eachCell(c => { c.border = ALL_BORDERS })
  })
  if (stock.rows.length) {
    const tr = ws2.addRow([`TOTAL (>${MIN_ONHAND_MT} MT)`, dash(stock.total.onhandMt), dash(stock.total.buckets.d0_30), dash(stock.total.buckets.d31_60),
      dash(stock.total.buckets.d61_90), dash(stock.total.buckets.d90plus), '', dash(stock.total.avgAgeDays)])
    tr.font = { bold: true }
    ;[2, 3, 4, 5, 6, 8].forEach(i => numCell(tr, i, MT1))
    tr.eachCell(c => { c.fill = fill(COLOR.sub); c.border = ALL_BORDERS })
  }
  // Reconciliation to the Dashboard's Physical Inventory KPI: the sheet lists only >MIN SKUs, so the
  // small (≤MIN) ones are added back and the over-dispatched tonnage (which has no row to sit on) is
  // taken off — leaving Σ produced − Σ invoiced.
  const rec = data.reconciliation
  ws2.addRow([])
  const recRow = (label, val, strong) => {
    const r = ws2.addRow([label, dash(val), '', '', '', '', '', ''])
    numCell(r, 2, MT1)
    if (strong) { r.getCell(1).font = { bold: true }; r.getCell(2).font = { bold: true } }
    ;[1, 2].forEach(i => { const c = r.getCell(i); c.border = ALL_BORDERS; if (strong) c.fill = fill(COLOR.grand) })
    return r
  }
  recRow(`Other SKUs (≤${MIN_ONHAND_MT} MT)`, rec.otherLe2, false)
  recRow('− Dispatched w/o recorded production', rec.unmatchedDispatch, false)
  recRow('= Physical Inventory', rec.physicalInventory, true)
  const note = ws2.addRow([`Listed rows are positive on-hand stock over ${MIN_ONHAND_MT} MT (a SKU can't hold negative stock). "Dispatched w/o recorded production" is tonnage invoiced beyond what was booked as produced — it has no SKU row to sit on, but the pipe left the plant, so it is deducted. The "= Physical Inventory" line matches the Dashboard KPI.`])
  ws2.mergeCells(`A${note.number}:H${note.number}`)
  note.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }

  // ── Sheet 3 — orders and invoicing by region, then distributor. Rows sit in region blocks, each
  // closed by a region total, with a grand total at the foot; State is a column only and gets no
  // subtotal row. The Plan column sums to the Dashboard's BEST ESTIMATE KPI by construction (both
  // are Σ of the same estimates), so this sheet stays the audit trail for that headline number.
  //
  // Tonnage renders to ONE DECIMAL through the cell format alone, exactly as on the SKU Ageing
  // sheet — the exact value goes into every cell, so the region totals and the grand total keep
  // tying to the KPIs (rounding the values first would break both identities). Unlike that sheet,
  // no "-" placeholder is used: every tonnage cell here stays a plain number so the sheet can be
  // sorted, filtered and charted, which is the whole point of the re-cut. ──
  const ws3 = wb.addWorksheet('Distributor by Region', {
    views: [{ state: 'frozen', ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  ws3.columns = [{ width: 12 }, { width: 18 }, { width: 30 }, { width: 12 }, { width: 14 }, { width: 14 }, { width: 12 }, { width: 14 }]
  writeTitle(ws3, 8, `${company} — DISTRIBUTOR ORDERS & INVOICING BY REGION — ${monthLabel}`, date)
  // The Invoiced header carries its scope for the same reason the Dashboard's card does (#127):
  // Total Orders beside it is Invoiced + every plant's pending, so the two columns are not like for
  // like and the sheet says so rather than leaving the reader to find out.
  styleHeaderRow(ws3.addRow(['Region', 'State', 'Distributor', 'Plan (MT)', 'Indent (MT)',
    `Invoiced MTD (MT)${invScope}`, '% of Plan', 'Gap to Plan (MT)']))

  const PCT_1DP = '0.0%'     // a fraction in the cell; Excel renders it as a percentage
  // Tonnage columns are 4/5/6/8, the percentage is column 7.
  const styleFigures = (row) => {
    ;[4, 5, 6, 8].forEach(i => numCell(row, i, MT_1DP))
    numCell(row, 7, PCT_1DP)
  }
  // A multi-state distributor resolves to its most recent state; the "+N" says the others exist
  // rather than letting one state quietly stand for all of them (same marker as the Sales tab).
  const stateLabel = (row) =>
    (row.state || '—') + (row.multiState ? ` +${Math.max(0, (row.states?.length || 0) - 1)}` : '')

  const dr = data.distributorRegions
  if (!dr.regions.length) {
    const r = ws3.addRow(['—', '', 'No distributor plan set, and nothing ordered or invoiced this month', '', '', '', '', ''])
    r.eachCell(c => { c.border = ALL_BORDERS })
  }
  dr.regions.forEach(group => {
    group.rows.forEach(row => {
      const r = ws3.addRow([
        group.region, stateLabel(row),
        distributorCode(row.customer, 4) || row.customer || '—',
        naMt(row.plan), row.totalOrders, row.invoiced, naMt(row.pctOfPlan), naMt(row.gapToPlan),
      ])
      styleFigures(r)
      r.eachCell(c => { c.border = ALL_BORDERS })
    })
    const t = group.total
    const sub = ws3.addRow([`${group.region.toUpperCase()} TOTAL`, '', '',
      naMt(t.plan), t.totalOrders, t.invoiced, naMt(t.pctOfPlan), naMt(t.gapToPlan)])
    ws3.mergeCells(`A${sub.number}:C${sub.number}`)
    sub.font = { bold: true }
    styleFigures(sub)
    sub.eachCell(c => { c.fill = fill(COLOR.sub); c.border = ALL_BORDERS })
  })
  if (dr.regions.length) {
    const g = dr.grand
    const gt = ws3.addRow(['GRAND TOTAL (Plan = Dashboard Best Estimate)', '', '',
      naMt(g.plan), g.totalOrders, g.invoiced, naMt(g.pctOfPlan), naMt(g.gapToPlan)])
    ws3.mergeCells(`A${gt.number}:C${gt.number}`)
    gt.font = { bold: true, size: 12 }
    styleFigures(gt)
    gt.eachCell(c => { c.fill = fill(COLOR.grand); c.border = ALL_BORDERS })
  }
  ws3.addRow([])
  const unalloc = ws3.addRow([`Of which invoiced by distributors with no Plan: ${dr.unallocatedInvoiced.toFixed(1)} MT`])
  ws3.mergeCells(`A${unalloc.number}:H${unalloc.number}`)
  unalloc.getCell(1).font = { bold: true, size: 9, color: { argb: 'FF92400E' } }
  const note3 = ws3.addRow([`Indent (Invoiced MTD + Confirmed + Non-Confirmed) blends two time windows: Invoiced MTD is this month, while Confirmed and Non-Confirmed are an all-time order-book snapshot of orders not yet delivered. A distributor sitting on an old unserved backlog therefore reads as a heavy orderer. Plan is a typed monthly target per distributor; the Dashboard Best Estimate KPI is their sum, not a separate figure, and % of Plan measures INVOICED tonnage against it only. A distributor with no Plan still shows its invoiced tonnage, and that tonnage is counted in the actual but not in the plan, so % of Plan can exceed 100% without the plan having been beaten. Region comes from the state → region master, and State from the distributor’s own order and invoice lines. A state nobody has mapped groups under Unmapped, and so does a distributor with no lines at all to derive a state from — a Plan set before the first order lands there. Either way the tonnage still counts in the grand total.${ps.invoicing.note ? ' ' + ps.invoicing.note : ''}`])
  ws3.mergeCells(`A${note3.number}:H${note3.number}`)
  note3.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  note3.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  ws3.getRow(note3.number).height = 58

  // ── Sheet 4 — Distributor × SKU: pending / invoiced MTD against the FREE stock of that size at
  // each plant that serves the distributor (ADR-0010).
  // Rows come from the same salesByDistributor call the Sales tab drill-down uses.
  //
  // NO TOTAL ROW, deliberately. Free Inventory is area-wide and unreserved, so summing it would report
  // more stock than the plants physically hold; and the sheet's rows only exist where an order line
  // carried a SKU code, so a Pending / Invoiced total would not tie to the Dashboard either. It is a
  // detail listing — the totals live on the Dashboard sheet (ADR-0002). ──
  // Column order groups the plants by the region they serve — South's pair, then West's — so a
  // distributor's two real cells sit together instead of straddling two dashes.
  const areaMaster = plantMaster(opts.plants ?? null)
  const plantCols = []
  REGIONS.forEach(rg => [...plantsServingRegion(rg, areaMaster)]
    .sort((a, b) => areaMaster.findIndex(x => x.id === a) - areaMaster.findIndex(x => x.id === b))
    .forEach(id => { if (!plantCols.includes(id)) plantCols.push(id) }))
  const P1 = 9, P2 = 8 + plantCols.length, FREEC = P2 + 1, SHORTC = P2 + 2

  const ws4 = wb.addWorksheet('Distributor × SKU', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  ws4.columns = [{ width: 11 }, { width: 20 }, { width: 34 }, { width: 18 },
    { width: 13 }, { width: 12 }, { width: 12 }, { width: 12 },
    ...plantCols.map(() => ({ width: 11 })), { width: 17 }, { width: 11 }]
  writeTitle(ws4, SHORTC, `${company} — DISTRIBUTOR × SKU — PENDING vs INVOICED vs FREE SERVICE-AREA STOCK — ${monthLabel}`, date)
  // TWO header rows: the plant columns need a band of their own saying what they are, because
  // "Hyderabad" over a tonnage is ambiguous on its own — a reader could take it for what that plant
  // is holding. It is not: the area's Confirmed has already come off it. The band says FREE, and
  // the note below says the rest.
  const h1 = ws4.addRow(['Region', 'State', 'Distributor', 'SKU', `Invoiced MTD${invScope}`,
    'Confirmed', 'Non-Conf', 'Pending',
    'FREE INVENTORY, BY PLANT — holding less the area’s Confirmed', ...plantCols.slice(1).map(() => ''),
    'Free Inventory (area)', 'Short by'])
  const h2 = ws4.addRow(['', '', '', '', '', '', '', '',
    ...plantCols.map(id => plantLabel(id, areaMaster)), '', ''])
  ;[...Array(8).keys()].map(i => i + 1).concat([FREEC, SHORTC])
    .forEach(c => ws4.mergeCells(h1.number, c, h2.number, c))
  ws4.mergeCells(h1.number, P1, h1.number, P2)
  styleHeaderRow(h1); styleHeaderRow(h2)
  ws4.getRow(h1.number).height = 24
  const dsk = data.distributorSku
  const ds4HeaderRow = ws4.lastRow.number
  if (!dsk.rows.length) {
    const r = ws4.addRow(['No distributor has pending or month-to-date invoiced tonnage',
      ...Array(SHORTC - 1).fill('')])
    r.eachCell(c => { c.border = ALL_BORDERS })
  }
  // A stock cell the app cannot answer prints "?" — never a "-" and never 0. `dash` renders a real
  // 0.0 as "-", so without this an Unmapped distributor's row would be indistinguishable from one
  // whose area genuinely holds nothing, which are opposite instructions to whoever reads the sheet.
  const stockCell = (v) => (v == null ? '?' : dash(v))
  // FOUR different facts, four different marks. `dash` is no use here: it renders a real 0 as
  // "-", which is exactly the symbol a NON-SERVING plant must own, and the two say opposite things
  // to whoever reads the sheet ("nothing free here" vs "we cannot ship it to you at all").
  //   number  that much of this size is free at that plant (negative ⇒ committed beyond the floor)
  //   0.0     it serves the region and has nothing free — it holds none, or all of it is promised
  //   —       it does not serve the region
  //   ?       the distributor has no region, so there is no set of plants to ask
  const plantCell = (row, id) => row.freeStockByPlant == null ? '?'
    : (Object.prototype.hasOwnProperty.call(row.freeStockByPlant, id) ? Number(row.freeStockByPlant[id]) : '—')
  dsk.rows.forEach(row => {
    const r = ws4.addRow([row.region, row.state || '—', row.customer, row.sku,
      dash(row.invoicedMtd), dash(row.confirmed), dash(row.nonConfirmed), dash(row.pending),
      ...plantCols.map(id => plantCell(row, id)),
      stockCell(row.freeStock), stockCell(row.shortBy)])
    ;[5, 6, 7, 8, ...plantCols.map((_, i) => P1 + i), FREEC, SHORTC].forEach(i => numCell(r, i, MT1))
    r.eachCell(c => { c.border = ALL_BORDERS })
  })
  if (dsk.rows.length) {
    ws4.autoFilter = { from: { row: ds4HeaderRow, column: 1 }, to: { row: ws4.lastRow.number, column: SHORTC } }
  }
  ws4.addRow([])
  // Who serves whom is READ OFF THE MASTER, never spelled out here. A caption that states a rule as
  // a literal is exactly what let this sheet claim "Free Stock is every plant's stock combined" for
  // a month after the opposite had been decided (ADR-0006) — so the sentence has to come from the
  // same data the figures came from, and go stale only when they do.

  const servedBy = REGIONS.map(r => {
    const names = [...plantsServingRegion(r, areaMaster)].map(id => plantLabel(id, areaMaster))
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0]
    return names.length ? `${list} serve${names.length === 1 ? 's' : ''} ${r}` : ''
  }).filter(Boolean).join('; ')
  const note4 = ws4.addRow([`FREE INVENTORY, BY PLANT is what that plant holds of that size LESS its share of what the service area has already promised. The area's Confirmed tonnage belongs to a REGION, not to a plant — any plant serving the region can fill the order — so it is shared out PRO-RATA BY HOLDING: every plant in the area is scaled by the same factor. WHERE THE AREA HOLDS ANY OF THE SIZE the cells therefore ADD UP TO the Free Inventory (area) beside them; where it holds NONE of it they cannot, and the rule for that is below. Because "free" means "less what is promised", these cells MOVE when the area's Confirmed tonnage moves — they do NOT move when another distributor's Non-confirmed book changes, because Non-confirmed has no claim on the floor until it is released. A number means that much is free at that plant, and a NEGATIVE one means the area is committed beyond what that plant holds; 0.0 means the plant serves this region and has nothing free — it holds none of the size, or all of it is already promised; "—" means the plant does not serve this region at all (it cannot ship to you — that is not the same as having nothing free); "?" means the distributor has no region, so there is no set of plants to ask. WHERE THE WHOLE AREA HOLDS NONE OF A SIZE every cell reads 0.0 and the area column alone carries the shortfall, so on those rows — and only those — the cells do NOT add up to it: splitting a commitment across plants that hold nothing would invent a claim on steel that is not there. That is not a rare row; where a region is waiting on sizes its plants have not made, it is most of them. Free Inventory (area) is the stock of the plants that SERVE THIS DISTRIBUTOR'S REGION — produced minus invoiced at those plants — LESS the Confirmed tonnage of every distributor in that same service area, i.e. what is promised to nobody yet. ${servedBy || 'No plant has a service area set'} (Masters tab). A distributor is never offered stock from a plant that does not serve it. A region whose plants have produced nothing therefore shows no Free Inventory at all and its distributors' full pending as "Short by" — that is the true position, not a missing figure, and it fills itself in the day one of those plants produces. Inside one service area the stock is NOT reserved to anyone, so the same tonnage is repeated on every distributor's row there waiting on that size, and it is deliberately NOT totalled anywhere on this sheet: adding a column up would report more stock than the plants hold. For the same reason "Short by" (Pending − on-hand in the area, floored at zero, so measured against the FLOOR and not against Free Inventory) can read "-" on a row whose size several distributors are queued against — it says the area has the tonnage, not that this distributor will get it. A "?" means the distributor's service area is unknown, not that it has no stock: its state carries no region mapping (${UNMAPPED_REGION}), so map the state on the Sales tab. Rows are the live pairs only (Pending or Invoiced MTD above zero), sorted Region → Distributor → Pending.${ps.invoicing.note ? ' ' + ps.invoicing.note : ''}`])
  ws4.mergeCells(note4.number, 1, note4.number, SHORTC)
  note4.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  note4.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  ws4.getRow(note4.number).height = 104

  await downloadWorkbook(wb, `PB-MTD-Dashboard-${date}${fileScope(opts)}.xlsx`)
  return data
}

// ═════════════════════════════════════════════════════════════════════════════════════════════
// INVENTORY SNAPSHOT (#213, first cut #214) — the plant-wise RM + FG page management reads in
// Outlook. Every figure follows docs/inventory-dashboard-rules.md, which is what the data-verifier
// recomputes from; a rule changes there first, then here.
//
// Two halves, and the split is the point: `buildInventorySnapshotData` computes every figure
// (pure, no DOM), `renderInventorySnapshotHtml` only lays them out. Nothing is calculated in the
// renderer or in the Reports component, so a test of the builder is a test of the numbers.
//
// ALWAYS ALL PLANTS. Unlike every other download on the Reports tab (#121), this one ignores the
// header plant filter — the caller hands it the unfiltered arrays, and there is no plant option to
// pass. A management page that is silently one plant's is worse than no page.
// ═════════════════════════════════════════════════════════════════════════════════════════════

// Row order of the approved template: South first, then West. Plants the master gains later are
// appended in master order rather than dropped.
const SNAPSHOT_PLANT_ORDER = ['hyderabad', 'lepakshi', 'npmd', 'tapi']
// Management calls the Hyderabad plant Nippon (the company that runs it). Hard-coded for this
// report only, whatever the master says — a user decision on #213; the rest of the app keeps the
// master's name.
const SNAPSHOT_PLANT_NAME = { hyderabad: 'Nippon' }
// The Plant column of the three action lists (#215): short upper-case codes, Nippon again by name.
const SNAPSHOT_LIST_CODE = { hyderabad: 'NIPPON', lepakshi: 'LEP', npmd: 'NPMD', tapi: 'TAPI' }
export const SNAPSHOT_COVER_WINDOW_DAYS = 30
// FG days-cover bands for a plant row (rules doc S6) and for a size (S9). Both edges are Green.
export const SNAPSHOT_FG_COVER = { red: 7, amber: 45 }
// Sales class (rules doc S8): sizes ranked by MT invoiced in the last 90 days. A while the share of
// sales ABOVE the size is under 70%, B under 90%, otherwise C.
export const SNAPSHOT_CLASS_WINDOW_DAYS = 90
export const SNAPSHOT_CLASS_CUTS = { a: 0.70, b: 0.90 }
// Plant summary thresholds (rules doc S10 to S12). Every cell with a value gets a band; only one
// with nothing to divide by is left plain.
export const SNAPSHOT_AGE_DAYS = 60
export const SNAPSHOT_AGED_BANDS = { green: 0.10, red: 0.25 }    // < 10% Green, 10 to 25% Amber, > 25% Red
export const SNAPSHOT_A_OUT_BANDS = { amber: 0.10, red: 0.20 }   // < 10% Green, 10 to 20% Amber, > 20% Red
export const SNAPSHOT_EXCESS_BANDS = { amber: 0.30, red: 0.60 }  // < 30% Green, 30 to 60% Amber, > 60% Red
export const SNAPSHOT_LIST_LENGTH = 7
export const SNAPSHOT_CLASSES = ['A', 'B', 'C']
// RM days cover (rules doc S14): under 15 days is Amber, the steel is running short; 15 or more is
// Green. RM > 60 days reuses SNAPSHOT_AGED_BANDS.
export const SNAPSHOT_RM_COVER_AMBER = 15

// Size key (rules doc S1): section + size + thickness, read off the SKU master. Two ERP codes for
// one tube net together — and, unlike `canonicalSkuKey`, so do two IS standards or lengths of it,
// because management counts tubes by what they look like on the floor. A code the master does not
// carry keys as itself: it still counts, it just cannot net with anything.
export function snapshotSizeKeyResolver(skus) {
  const byCode = new Map()
  ;(skus || []).forEach(s => {
    if (!s?.skuCode || (byCode.has(s.skuCode) && s.deleted)) return   // a live row wins a duplicate code
    const section = String(s.productType || '').trim().toUpperCase()
    const size = skuSizeLabel(s, s.description)
    const thk = Number(s.thickness)
    if (section && size && s.thickness !== '' && s.thickness != null && Number.isFinite(thk)) {
      byCode.set(s.skuCode, `${section}|${size}|${thk.toFixed(2)}`)
    }
  })
  return (code) => byCode.get(code) || `code:${String(code ?? '')}`
}

const isoDayNumber = (iso) => Math.floor(Date.parse(String(iso || '').slice(0, 10)) / 86400000)

// A plant row's FG band (rules doc S6). `null` = nothing to colour: no stock and no sale.
function fgCoverBand(fgMt, coverDays) {
  if (coverDays == null) return fgMt > EPS ? 'amber' : null
  if (coverDays < SNAPSHOT_FG_COVER.red) return 'red'
  if (coverDays > SNAPSHOT_FG_COVER.amber) return 'amber'
  return 'green'
}

const coverOf = (onHandMt, sold30Mt) => sold30Mt > EPS ? onHandMt / (sold30Mt / SNAPSHOT_COVER_WINDOW_DAYS) : null

function snapshotFgRow(fgMt, sold30Mt) {
  const coverDays = coverOf(fgMt, sold30Mt)
  return { fgMt, sold30Mt, fgCoverDays: coverDays, fgCoverBand: fgCoverBand(fgMt, coverDays) }
}

// One size's band (rules doc S9). Red is tested first, so a size with no stock is Red even when it
// also had no sale in 30 days. Such a size holds no tonnage, which is why Excess (S12) equals the
// Amber MT exactly.
function sizeBand(onHandMt, sold30Mt, coverDays) {
  if (onHandMt <= EPS || (coverDays != null && coverDays < SNAPSHOT_FG_COVER.red)) return 'red'
  if (sold30Mt <= EPS || coverDays > SNAPSHOT_FG_COVER.amber) return 'amber'
  return 'green'
}

// Sales class per plant (rules doc S8). Ranked by 90-day sales, ties broken by size key so the same
// data always gives the same classes. The share compared is the share of sales ranked ABOVE the
// size, so the plant's best seller is always A, and a size that crosses 70% is still A. A tolerance
// of 1e-9 keeps float dust from moving a size that sits exactly on a cut-off.
function classifySizes(sizes) {
  const sold = sizes.filter(s => s.sold90Mt > EPS).sort((a, b) => b.sold90Mt - a.sold90Mt || a.key.localeCompare(b.key))
  const totalSold = sold.reduce((t, s) => t + s.sold90Mt, 0)
  let above = 0
  sold.forEach(s => {
    const share = above / totalSold
    s.cls = share < SNAPSHOT_CLASS_CUTS.a - 1e-9 ? 'A' : share < SNAPSHOT_CLASS_CUTS.b - 1e-9 ? 'B' : 'C'
    above += s.sold90Mt
  })
  sizes.filter(s => !(s.sold90Mt > EPS)).forEach(s => { s.cls = 'C' })
}

// "SHS|40x40|2.50" → "SHS 40x40 × 2.5"; an unkeyed code shows as itself.
function snapshotSizeLabel(key) {
  if (key.startsWith('code:')) return key.slice(5)
  const [section, size, thk] = key.split('|')
  return `${section} ${size} × ${Number(thk)}`
}

// A ratio's band (rules doc S10 to S12). `null` only when there is nothing to divide by.
const ratioOf = (part, whole) => whole > EPS ? part / whole : null
function agedBand(pct) {
  if (pct == null) return null
  if (pct < SNAPSHOT_AGED_BANDS.green) return 'green'
  return pct > SNAPSHOT_AGED_BANDS.red ? 'red' : 'amber'
}
function aOutBand(pct) {
  if (pct == null) return null
  if (pct < SNAPSHOT_A_OUT_BANDS.amber) return 'green'
  return pct > SNAPSHOT_A_OUT_BANDS.red ? 'red' : 'amber'
}
function excessBand(pct) {
  if (pct == null) return null
  if (pct < SNAPSHOT_EXCESS_BANDS.amber) return 'green'
  return pct > SNAPSHOT_EXCESS_BANDS.red ? 'red' : 'amber'
}

// One row of the class table: a class at a plant, a plant's total, or the All plants sums.
function classRow(sizes) {
  const onHandMt = sizes.reduce((t, s) => t + s.onHandMt, 0)
  const sold30Mt = sizes.reduce((t, s) => t + s.sold30Mt, 0)
  const band = (b) => {
    const inBand = sizes.filter(s => s.band === b)
    return { sizes: inBand.length, mt: inBand.reduce((t, s) => t + s.onHandMt, 0) }
  }
  const coverDays = coverOf(onHandMt, sold30Mt)
  return { sizes: sizes.length, onHandMt, sold30Mt, coverDays, coverBand: fgCoverBand(onHandMt, coverDays),
    red: band('red'), green: band('green'), amber: band('amber') }
}

// A plant row's RM cover band (rules doc S14). `null` = nothing consumed in 30 days, so nothing to
// divide by and nothing to colour.
function rmCoverBand(coverDays) {
  if (coverDays == null) return null
  return coverDays < SNAPSHOT_RM_COVER_AMBER ? 'amber' : 'green'
}

// The RM columns of one row, from their parts, banded in one place.
function snapshotRmRow(rmMt, rmUsed30Mt, rm60Mt) {
  const rmCoverDays = rmUsed30Mt > EPS ? rmMt / (rmUsed30Mt / SNAPSHOT_COVER_WINDOW_DAYS) : null
  const rm60Pct = ratioOf(rm60Mt, rmMt)
  return { rmMt, rmUsed30Mt, rmCoverDays, rmCoverBand: rmCoverBand(rmCoverDays), rm60Mt, rm60Pct, rm60Band: agedBand(rm60Pct) }
}

// RM per plant (rules doc S14 to S16): the steel not yet turned into tube, in two parts.
//   · Mother coil not yet slit = its weight (actual, else invoice) − Σ its live baby coils' slit
//     weight, floored at 0, so a partly slit coil counts only what is still on the mother. Aged by
//     the mother's inward date.
//   · Baby coil not yet used = `babyCoilFree`, counted only where `babyCoilIsStock` says so (not
//     consumed, not an end under 0.2 T: ADR-0007). Aged by its own conversion date (user decision
//     on #213: not the mother's inward date).
// Each coil sits at its OWN stored plant (ADR-0005); nothing is re-attributed, so a coil with no
// resolved plant lands in '' (Unattributed). Used 30d = coil weight allocated in productions dated
// in the 30-day window, at the production's plant.
function snapshotRm(coils, babyCoils, productions, { bucketOf, asOfDay, windowFrom }) {
  const out = {}
  const at = (plant) => (out[plant] = out[plant] || { rmMt: 0, rm60Mt: 0, rmUsed30Mt: 0 })
  const aged = (iso) => asOfDay - isoDayNumber(iso) > SNAPSHOT_AGE_DAYS
  const liveBabies = notDeleted(babyCoils)
  const slitOff = {}
  liveBabies.forEach(b => { slitOff[b.hrCoilId] = (slitOff[b.hrCoilId] || 0) + num(b.weight) })

  notDeleted(coils).forEach(c => {
    const weight = num(c.actualWeight) > 0 ? num(c.actualWeight) : num(c.invoiceWeight)
    const mt = Math.max(0, weight - (slitOff[c.hrCoilId] || 0))
    if (mt <= EPS) return
    const r = at(bucketOf(c))
    r.rmMt += mt
    if (aged(c.dateOfInward)) r.rm60Mt += mt
  })
  const consumedByBaby = coilConsumption(productions, null, 'babyCoilId')
  liveBabies.filter(b => babyCoilIsStock(b, consumedByBaby)).forEach(b => {
    const mt = babyCoilFree(b, consumedByBaby)
    const r = at(bucketOf(b))
    r.rmMt += mt
    if (aged(b.dateOfConversion)) r.rm60Mt += mt
  })
  notDeleted(productions).forEach(p => {
    const day = isoDayNumber(p.dateOfProduction)
    if (!(day >= windowFrom && day <= asOfDay)) return
    at(bucketOf(p)).rmUsed30Mt += (p.coilAllocations || []).reduce((t, a) => t + num(a.weight), 0)
  })
  return out
}

// Weights are resolved here, not trusted from the caller (#217): a production's tonnage and every coil
// allocation are pieces × the SKU master's weight per tube, never the weight frozen on the row at save
// time. The app already hands over resolved rows, and resolving twice changes nothing.
export function buildInventorySnapshotData(skus, rawProductions, dispatches, coils, babyCoils, { date = today(), plants = null } = {}) {
  const productions = resolveProductionWeights(rawProductions, skus, babyCoils)
  const keyOf = snapshotSizeKeyResolver(skus)
  const master = plantMaster(plants)
  const known = new Set(master.map(p => p.id))
  // Partition by the STORED plant, trimmed exactly as `filterByPlant` compares it, so a plant row
  // here is the same rows the header selector would show. Anything that is not a master plant —
  // blank, or an id off the master — is Unattributed ('').
  const bucketOf = (row) => { const id = String(row?.plant ?? '').trim(); return known.has(id) ? id : '' }

  const asOfDay = isoDayNumber(date)
  const windowFrom = asOfDay - (SNAPSHOT_COVER_WINDOW_DAYS - 1)        // 30 days ending on `date`, inclusive
  const classFrom = asOfDay - (SNAPSHOT_CLASS_WINDOW_DAYS - 1)         // 90 days ending on `date`, inclusive

  // stats[plant][sizeKey]: net = produced − invoiced (MT, every date); sold30 / sold90 = invoiced in
  // the window; soldEver = any invoice up to the as-of date; firstMade = earliest production date.
  // The same pass splits the live rows by plant, for the per-plant FIFO ageing below.
  const stats = {}, prodByPlant = {}, dispByPlant = {}
  const statOf = (plant, key) => {
    const p = (stats[plant] = stats[plant] || {})
    return (p[key] = p[key] || { key, net: 0, sold30Mt: 0, sold90Mt: 0, soldEver: false, firstMade: null })
  }
  notDeleted(productions).forEach(p => {
    const plant = bucketOf(p)
    const s = statOf(plant, keyOf(p.skuCode))
    s.net += num(p.totalWeight)
    const made = String(p.dateOfProduction || '').slice(0, 10)
    if (made && (s.firstMade == null || made < s.firstMade)) s.firstMade = made
    ;(prodByPlant[plant] = prodByPlant[plant] || []).push(p)
  })
  notDeleted(dispatches).forEach(d => {
    const day = isoDayNumber(d.dateOfDispatch)
    const byPlant = {}
    ;(d.bundleEntries || []).forEach(e => {
      const plant = bucketOf(e)
      const mt = num(e.weight)
      const s = statOf(plant, keyOf(e.skuCode))
      s.net -= mt
      if (day <= asOfDay) {
        if (day >= windowFrom) s.sold30Mt += mt
        if (day >= classFrom) s.sold90Mt += mt
        if (mt > EPS) s.soldEver = true
      }
      ;(byPlant[plant] = byPlant[plant] || []).push(e)
    })
    Object.entries(byPlant).forEach(([plant, entries]) =>
      (dispByPlant[plant] = dispByPlant[plant] || []).push({ dateOfDispatch: d.dateOfDispatch, bundleEntries: entries }))
  })

  // The sizes of one plant, each with its on hand (rules doc S2: floored at 0 PER SIZE, so an
  // over-invoiced size never eats into another size's stock), cover, class and band. The drop rule
  // (S8) runs first: no sale in 90 days and no stock is a data gap, not inventory.
  const sizesOf = (plant) => {
    const sizes = Object.values(stats[plant] || {}).map(s => {
      const onHandMt = Math.max(0, s.net)
      const coverDays = coverOf(onHandMt, s.sold30Mt)
      return { ...s, onHandMt, coverDays, band: sizeBand(onHandMt, s.sold30Mt, coverDays) }
    }).filter(s => s.sold90Mt > EPS || s.onHandMt > EPS)
    classifySizes(sizes)
    return sizes
  }
  const onHand = (sizes) => sizes.reduce((t, s) => t + s.onHandMt, 0)
  // FG > 60 days (rules doc S10): the existing FIFO ageing, run on ONE plant's rows at a time and
  // keyed by the same size key, so its surviving tonnage is that plant's FG on hand.
  const agedOf = (plant) => {
    const ageing = skuAgeing(prodByPlant[plant] || [], dispByPlant[plant] || [], keyOf, date)
    return Object.values(ageing).reduce((t, a) => ({
      onHandMt: t.onHandMt + a.onhandWeight,
      agedMt: t.agedMt + a.buckets.d61_90 + a.buckets.d90plus,
    }), { onHandMt: 0, agedMt: 0 })
  }

  const ordered = [
    ...SNAPSHOT_PLANT_ORDER.map(id => master.find(p => p.id === id)).filter(Boolean),
    ...master.filter(p => !SNAPSHOT_PLANT_ORDER.includes(p.id)),
  ]
  const rm = snapshotRm(coils, babyCoils, productions, { bucketOf, asOfDay, windowFrom })
  const rmOf = (plant) => rm[plant] || { rmMt: 0, rm60Mt: 0, rmUsed30Mt: 0 }
  const plantSizes = []        // every kept size at a plant, tagged with its plant, for the lists
  const classPlants = []
  let maxAgeingGap = 0
  const rows = ordered.map(p => {
    const name = SNAPSHOT_PLANT_NAME[p.id] || p.name
    const region = [...new Set((p.serves || []).map(r => normRegionName(r).charAt(0).toUpperCase()))].join('/')
    const label = region ? `${name} (${region})` : name
    const sizes = sizesOf(p.id)
    sizes.forEach(s => plantSizes.push({ ...s, plantId: p.id, plantCode: SNAPSHOT_LIST_CODE[p.id] || name.toUpperCase() }))
    const fg = snapshotFgRow(onHand(sizes), sizes.reduce((t, s) => t + s.sold30Mt, 0))
    const aged = agedOf(p.id)
    maxAgeingGap = Math.max(maxAgeingGap, Math.abs(aged.onHandMt - fg.fgMt))
    const aSizes = sizes.filter(s => s.cls === 'A')
    const aOut = aSizes.filter(s => s.band === 'red').length                         // S11
    const excessMt = onHand(sizes.filter(s => s.band === 'amber'))                   // S12
    classPlants.push({ plantId: p.id, label, name,
      classes: SNAPSHOT_CLASSES.map(cls => ({ cls, ...classRow(sizes.filter(s => s.cls === cls)) })),
      total: classRow(sizes) })
    const r = rmOf(p.id)
    return { plantId: p.id, name, region, label, ...snapshotRmRow(r.rmMt, r.rmUsed30Mt, r.rm60Mt), ...fg,
      ...summaryExtras(aged.agedMt, aOut, aSizes.length, excessMt, fg.fgMt) }
  })
  // All plants (rules doc S4) = the sum of the plant rows. Unattributed is NOT in it (ADR-0012),
  // so it is returned separately and the page names it — never silently.
  const sum = (k) => rows.reduce((s, r) => s + r[k], 0)
  const totalFg = snapshotFgRow(sum('fgMt'), sum('sold30Mt'))
  const total = { label: 'All plants', ...snapshotRmRow(sum('rmMt'), sum('rmUsed30Mt'), sum('rm60Mt')), ...totalFg,
    ...summaryExtras(sum('fg60Mt'), sum('aClassOut'), sum('aClassSizes'), sum('excessMt'), totalFg.fgMt) }
  const unSizes = Object.values(stats[''] || {})
  const unFg = unSizes.reduce((t, s) => t + Math.max(0, s.net), 0)
  const unSold = unSizes.reduce((t, s) => t + s.sold30Mt, 0)
  const unRm = rmOf('').rmMt
  const excluded = unFg > EPS || unSold > EPS || unRm > EPS ? { fgMt: unFg, sold30Mt: unSold, rmMt: unRm } : null

  // All plants in the class table: the plant class rows added up. A size held at two plants is two
  // rows, so `sizes` counts plant × size pairs.
  const sumClassRows = (list) => {
    const add = (k) => list.reduce((t, r) => t + r[k], 0)
    const band = (b) => ({ sizes: list.reduce((t, r) => t + r[b].sizes, 0), mt: list.reduce((t, r) => t + r[b].mt, 0) })
    const onHandMt = add('onHandMt'), sold30Mt = add('sold30Mt'), coverDays = coverOf(onHandMt, sold30Mt)
    return { sizes: add('sizes'), onHandMt, sold30Mt, coverDays, coverBand: fgCoverBand(onHandMt, coverDays),
      red: band('red'), green: band('green'), amber: band('amber') }
  }
  const classTable = {
    plants: classPlants,
    all: {
      classes: SNAPSHOT_CLASSES.map((cls, i) => ({ cls, ...sumClassRows(classPlants.map(p => p.classes[i])) })),
      total: sumClassRows(classPlants.map(p => p.total)),
    },
  }

  // The three action lists (rules doc S13), across all plants, top 7 each. Ties fall back to plant
  // order then size, so a re-run on the same data lists the same lines.
  const plantRank = (id) => ordered.findIndex(p => p.id === id)
  const byThen = (primary) => (a, b) => primary(a, b) || plantRank(a.plantId) - plantRank(b.plantId) || a.key.localeCompare(b.key)
  const listRow = (s) => ({ plantId: s.plantId, plant: s.plantCode, size: snapshotSizeLabel(s.key),
    onHandMt: s.onHandMt, sold30Mt: s.sold30Mt, coverDays: s.coverDays, band: s.band })
  const top = (pred, cmp) => plantSizes.filter(pred).sort(byThen(cmp)).slice(0, SNAPSHOT_LIST_LENGTH).map(listRow)
  const freshUnsold = (s) => !s.soldEver && s.firstMade != null && isoDayNumber(s.firstMade) >= windowFrom
  const lists = {
    replenish: top(s => s.cls === 'A' && s.sold30Mt > EPS && s.band === 'red', (a, b) => b.sold30Mt - a.sold30Mt),
    slowProduction: top(s => s.cls === 'A' && s.coverDays != null && s.coverDays > SNAPSHOT_FG_COVER.amber,
      (a, b) => b.onHandMt - a.onHandMt),
    slowMovers: top(s => s.cls === 'C' && s.band === 'amber' && s.onHandMt > EPS && !freshUnsold(s),
      (a, b) => b.onHandMt - a.onHandMt),
  }

  return { date, plantSummary: { rows, total }, classTable, lists, excluded,
    // The FIFO ageing must leave exactly the FG it ages (S10); a gap means the two disagree on rows.
    checks: { maxAgeingGap, ageingTiesToFg: maxAgeingGap <= 0.001 } }
}

// The three Plant summary columns #215 adds, from their parts, banded in one place.
function summaryExtras(fg60Mt, aClassOut, aClassSizes, excessMt, fgMt) {
  const fg60Pct = ratioOf(fg60Mt, fgMt), aClassOutPct = ratioOf(aClassOut, aClassSizes), excessPct = ratioOf(excessMt, fgMt)
  return {
    fg60Mt, fg60Pct, fg60Band: agedBand(fg60Pct),
    aClassOut, aClassSizes, aClassOutPct, aClassOutBand: aOutBand(aClassOutPct),
    excessMt, excessPct, excessBand: excessBand(excessPct),
  }
}

// ── Renderer. Outlook-safe markup only: tables and inline styles, no flex/grid, no <link>, no
// external src — the two images arrive as data: URIs. Fixed 1200 px. Calibri, Carlito fallback.
const SNAP = {
  navy: '#213366', zebra: '#F2F2F2', border: '#CCCCCC', text: '#1A1A1A', muted: '#404040',
  source: '#595959', red: '#C62828', amber: '#F2B705', green: '#2E7D32',
  font: "Calibri, Carlito, 'Segoe UI', Arial, sans-serif",
}
const BAND_STYLE = {
  red: `background:${SNAP.red};color:#FFFFFF;`,
  amber: `background:${SNAP.amber};color:#000000;`,
  green: `background:${SNAP.green};color:#FFFFFF;`,
}
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]))
const fmtWholeMt = (v) => Math.round(num(v)).toLocaleString('en-IN')
const fmtDays = (v) => v == null ? '-' : Math.round(v).toLocaleString('en-IN')
const fmtPct0 = (v) => `${Math.round(num(v) * 100)}%`
const SNAPSHOT_CLASS_LABEL = {
  A: 'A (fast · top 70% of sales)',
  B: 'B (medium · next 20%)',
  C: 'C (slow · last 10%)',
}
export const SNAPSHOT_LIST_TITLES = {
  replenish: 'Replenish now · A-class (fast movers, < 7 days cover)',
  slowProduction: 'Slow production · A-class (fast movers, > 45 days cover)',
  slowMovers: 'Slow movers · C-class (> 45 days cover)',
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const longDate = (iso) => {
  const [y, m, d] = String(iso || '').split('-').map(Number)
  return y && m && d ? `${d} ${MONTHS[m - 1]} ${y}` : String(iso || '')
}

export function renderInventorySnapshotHtml(data, { logoSrc = '', ribbonSrc = '' } = {}) {
  const W = 1200, PAD = 24, INNER = W - 2 * PAD
  const dateLabel = longDate(data.date)
  const cell = `border:1px solid ${SNAP.border};padding:8px 12px;font-size:15px;`
  const head = `${cell}background:${SNAP.navy};color:#FFFFFF;font-weight:bold;`
  const chip = (label, style) =>
    `<td style="padding:4px 10px;font-size:13px;font-weight:bold;border:1px solid ${SNAP.border};${style}">${esc(label)}</td><td width="8" style="width:8px;"></td>`

  // A cell is banded or zebra-striped, never both: the band colour IS the cell's background.
  const td = (text, { zebra, weight = '', band = null, right = true, attrs = '' }) =>
    `<td${attrs}${right ? ' align="right"' : ''} style="${cell}${weight}${band ? BAND_STYLE[band] : `${zebra}color:${SNAP.text};`}">${text}</td>`
  const zebraOf = (i, isTotal) => `background:${isTotal || i % 2 === 1 ? SNAP.zebra : '#FFFFFF'};`
  const mtPct = (mt, pct) => pct == null ? '-' : `${fmtWholeMt(mt)} · ${fmtPct0(pct)}`

  const summaryRow = (r, i, isTotal = false) => {
    const o = { zebra: zebraOf(i, isTotal), weight: isTotal ? 'font-weight:bold;' : '' }
    return `<tr>
${td(esc(r.label), { ...o, right: false })}
${td(fmtWholeMt(r.rmMt), o)}
${td(fmtDays(r.rmCoverDays), { ...o, band: r.rmCoverBand })}
${td(mtPct(r.rm60Mt, r.rm60Pct), { ...o, band: r.rm60Band })}
${td(fmtWholeMt(r.fgMt), o)}
${td(fmtDays(r.fgCoverDays), { ...o, band: r.fgCoverBand })}
${td(mtPct(r.fg60Mt, r.fg60Pct), { ...o, band: r.fg60Band })}
${td(r.aClassSizes ? `${r.aClassOut} / ${r.aClassSizes}` : '-', { ...o, band: r.aClassOutBand })}
${td(mtPct(r.excessMt, r.excessPct), { ...o, band: r.excessBand })}
</tr>`
  }
  const { rows, total } = data.plantSummary

  // ── Finished goods by plant × sales class. Per plant: A, B, C, then "<Plant> total"; then the same
  // for All plants. The plant name spans its three class rows.
  const classRowHtml = (plantLabel, r, i, { isTotal = false, totalLabel = '' } = {}) => {
    const o = { zebra: zebraOf(i, isTotal), weight: isTotal ? 'font-weight:bold;' : '' }
    const lead = isTotal
      ? td(esc(totalLabel), { ...o, right: false, attrs: ' colspan="2"' })
      : `${plantLabel != null ? `<td rowspan="${SNAPSHOT_CLASSES.length}" valign="top" style="${cell}background:#FFFFFF;color:${SNAP.text};font-weight:bold;">${esc(plantLabel)}</td>` : ''}
${td(esc(SNAPSHOT_CLASS_LABEL[r.cls]), { ...o, right: false })}`
    return `<tr>
${lead}
${td(r.sizes.toLocaleString('en-IN'), o)}
${td(fmtWholeMt(r.onHandMt), o)}
${td(fmtWholeMt(r.sold30Mt), o)}
${td(fmtDays(r.coverDays), { ...o, band: r.coverBand })}
${['red', 'green', 'amber'].map(b => `${td(r[b].sizes.toLocaleString('en-IN'), o)}\n${td(fmtWholeMt(r[b].mt), o)}`).join('\n')}
</tr>`
  }
  const classBlock = (label, totalLabel, block) => [
    ...block.classes.map((r, i) => classRowHtml(i === 0 ? label : null, r, i)),
    classRowHtml(null, block.total, 0, { isTotal: true, totalLabel }),
  ].join('\n')
  const ct = data.classTable
  const bandHead = (b, name) => `<td colspan="2" align="center" style="${cell}${BAND_STYLE[b]}font-weight:bold;">${name}</td>`
  const classTableHtml = `<table width="${INNER}" cellpadding="0" cellspacing="0" border="0" style="width:${INNER}px;border-collapse:collapse;font-family:${SNAP.font};">
<tr>
<td rowspan="2" style="${head}" width="150">Plant</td>
<td rowspan="2" style="${head}" width="250">Class</td>
<td rowspan="2" align="right" style="${head}">Sizes</td>
<td rowspan="2" align="right" style="${head}">Current inventory MT</td>
<td rowspan="2" align="right" style="${head}">Sold 30d MT</td>
<td rowspan="2" align="right" style="${head}">Days cover</td>
${bandHead('red', 'Red')}${bandHead('green', 'Green')}${bandHead('amber', 'Amber')}
</tr>
<tr>${['red', 'green', 'amber'].map(() => `<td align="right" style="${head}">Sizes</td><td align="right" style="${head}">MT</td>`).join('')}</tr>
${ct.plants.map(p => classBlock(p.label, `${p.name} total`, p)).join('\n')}
${classBlock('All plants', 'All plants total', ct.all)}
</table>`

  // ── The three action lists, side by side, top 7 each.
  const LIST_W = Math.floor((INNER - 2 * 24) / 3)
  const lcell = `border:1px solid ${SNAP.border};padding:6px 8px;font-size:14px;`
  const lhead = `${lcell}background:${SNAP.navy};color:#FFFFFF;font-weight:bold;`
  const listTable = (title, items) => `<td valign="top" width="${LIST_W}" style="width:${LIST_W}px;">
<div style="font-size:16px;font-weight:bold;color:${SNAP.navy};padding-bottom:6px;">${esc(title)}</div>
<table width="${LIST_W}" cellpadding="0" cellspacing="0" border="0" style="width:${LIST_W}px;border-collapse:collapse;font-family:${SNAP.font};">
<tr><td width="64" style="${lhead}">Plant</td><td style="${lhead}">Size</td><td width="78" align="right" style="${lhead}">Current inventory</td><td width="52" align="right" style="${lhead}">Sold 30d</td><td width="48" align="right" style="${lhead}">Days</td></tr>
${items.length ? items.map((r, i) => {
    const z = `${zebraOf(i, false)}color:${SNAP.text};`
    return `<tr><td style="${lcell}${z}">${esc(r.plant)}</td><td style="${lcell}${z}white-space:nowrap;">${esc(r.size)}</td><td align="right" style="${lcell}${z}">${fmtWholeMt(r.onHandMt)}</td><td align="right" style="${lcell}${z}">${fmtWholeMt(r.sold30Mt)}</td><td align="right" style="${lcell}${BAND_STYLE[r.band]}">${fmtDays(r.coverDays)}</td></tr>`
  }).join('\n') : `<tr><td colspan="5" style="${lcell}color:${SNAP.text};">None</td></tr>`}
</table>
</td>`
  const listsHtml = `<table role="presentation" width="${INNER}" cellpadding="0" cellspacing="0" border="0" style="width:${INNER}px;border-collapse:collapse;font-family:${SNAP.font};"><tr>
${listTable(SNAPSHOT_LIST_TITLES.replenish, data.lists.replenish)}
<td width="24" style="width:24px;"></td>
${listTable(SNAPSHOT_LIST_TITLES.slowProduction, data.lists.slowProduction)}
<td width="24" style="width:24px;"></td>
${listTable(SNAPSHOT_LIST_TITLES.slowMovers, data.lists.slowMovers)}
</tr></table>`

  const pct = (v) => fmtPct0(v)
  const footer = [
    `RM = mother coil not yet slit plus baby coil not yet used, ends under ${SCRAP_FREE_MT} T left out.`,
    `RM days cover = RM ÷ (coil MT used in production in the last ${SNAPSHOT_COVER_WINDOW_DAYS} days ÷ ${SNAPSHOT_COVER_WINDOW_DAYS}).`,
    `RM > ${SNAPSHOT_AGE_DAYS} days = mother coil by inward date, baby coil by slitting date.`,
    `Current inventory = produced less invoiced per plant and size (section, size, thickness), never below 0.`,
    `Days cover = current inventory ÷ (MT invoiced in the last ${SNAPSHOT_COVER_WINDOW_DAYS} days ÷ ${SNAPSHOT_COVER_WINDOW_DAYS}); "-" = nothing invoiced.`,
    `Class on MT invoiced in the last ${SNAPSHOT_CLASS_WINDOW_DAYS} days per plant; no sale = C.`,
    `Inventory > ${SNAPSHOT_AGE_DAYS} days = FIFO age, oldest shipped first.`,
    `A-class out = A sizes under ${SNAPSHOT_FG_COVER.red} days cover or with no stock.`,
    `Excess = current inventory in sizes over ${SNAPSHOT_FG_COVER.amber} days cover or with no sale in ${SNAPSHOT_COVER_WINDOW_DAYS} days.`,
    `RAG: Days cover Red < ${SNAPSHOT_FG_COVER.red}, Green ${SNAPSHOT_FG_COVER.red} to ${SNAPSHOT_FG_COVER.amber}, Amber > ${SNAPSHOT_FG_COVER.amber} or no sale;`,
    `RM days cover Amber < ${SNAPSHOT_RM_COVER_AMBER}, Green ${SNAPSHOT_RM_COVER_AMBER} or more;`,
    `RM and inventory > ${SNAPSHOT_AGE_DAYS} days Green < ${pct(SNAPSHOT_AGED_BANDS.green)}, Amber ${pct(SNAPSHOT_AGED_BANDS.green)} to ${pct(SNAPSHOT_AGED_BANDS.red)}, Red > ${pct(SNAPSHOT_AGED_BANDS.red)};`,
    `A-class out Green < ${pct(SNAPSHOT_A_OUT_BANDS.amber)}, Amber ${pct(SNAPSHOT_A_OUT_BANDS.amber)} to ${pct(SNAPSHOT_A_OUT_BANDS.red)}, Red > ${pct(SNAPSHOT_A_OUT_BANDS.red)};`,
    `Excess Green < ${pct(SNAPSHOT_EXCESS_BANDS.amber)}, Amber ${pct(SNAPSHOT_EXCESS_BANDS.amber)} to ${pct(SNAPSHOT_EXCESS_BANDS.red)}, Red > ${pct(SNAPSHOT_EXCESS_BANDS.red)}.`,
  ].join(' ')
  const excludedParts = data.excluded ? [
    data.excluded.rmMt > EPS ? `${fmtWholeMt(data.excluded.rmMt)} MT RM` : '',
    data.excluded.fgMt > EPS ? `${fmtWholeMt(data.excluded.fgMt)} MT current inventory` : '',
    data.excluded.sold30Mt > EPS ? `${fmtWholeMt(data.excluded.sold30Mt)} MT invoiced in the last ${SNAPSHOT_COVER_WINDOW_DAYS} days` : '',
  ].filter(Boolean) : []
  const excludedLine = excludedParts.length
    ? `<tr><td style="padding:6px ${PAD}px 0 ${PAD}px;font-size:14px;color:${SNAP.text};"><b>Not in All plants:</b> ${[excludedParts.slice(0, -1).join(', '), excludedParts.at(-1)].filter(Boolean).join(' and ')} with no resolved plant (Unattributed). Fix the plant on the coil, the production or the invoice's Warehouse Name.</td></tr>`
    : ''

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inventory snapshot ${esc(data.date)}</title></head>
<body style="margin:0;padding:0;background:#FFFFFF;">
<table role="presentation" width="${W}" cellpadding="0" cellspacing="0" border="0" style="width:${W}px;border-collapse:collapse;font-family:${SNAP.font};color:${SNAP.text};background:#FFFFFF;">
<tr><td style="padding:${PAD}px ${PAD}px 12px ${PAD}px;">
<table role="presentation" width="${INNER}" cellpadding="0" cellspacing="0" border="0" style="width:${INNER}px;border-collapse:collapse;">
<tr>
<td valign="bottom" style="font-family:${SNAP.font};">
<div style="font-size:28px;font-weight:bold;color:${SNAP.navy};">Inventory snapshot, plant-wise RM and FG</div>
<div style="font-size:16px;color:${SNAP.muted};padding-top:4px;">JSW Pipes &amp; Tubes · ${esc(dateLabel)}</div>
</td>
<td align="right" valign="top" width="160" style="width:160px;">${logoSrc ? `<img src="${logoSrc}" width="150" height="50" alt="JSW One" style="display:block;width:150px;height:50px;border:0;">` : ''}</td>
</tr></table>
</td></tr>
<tr><td style="padding:0 ${PAD}px;">${ribbonSrc ? `<img src="${ribbonSrc}" width="${INNER}" height="12" alt="" style="display:block;width:${INNER}px;height:12px;border:0;">` : ''}</td></tr>
<tr><td style="padding:14px ${PAD}px 0 ${PAD}px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${SNAP.font};"><tr>
${chip('Red · act now', BAND_STYLE.red)}${chip('Amber · watch', BAND_STYLE.amber)}${chip('Green · OK', BAND_STYLE.green)}
</tr></table>
</td></tr>
<tr><td style="padding:20px ${PAD}px 8px ${PAD}px;font-size:20px;font-weight:bold;color:${SNAP.navy};">Plant summary</td></tr>
<tr><td style="padding:0 ${PAD}px;">
<table width="${INNER}" cellpadding="0" cellspacing="0" border="0" style="width:${INNER}px;border-collapse:collapse;font-family:${SNAP.font};">
<tr>
<td style="${head}" width="160">Plant</td>
<td align="right" style="${head}">RM MT</td>
<td align="right" style="${head}">RM days cover</td>
<td align="right" style="${head}">RM &gt; ${SNAPSHOT_AGE_DAYS} days (MT · %)</td>
<td align="right" style="${head}">Current inventory MT</td>
<td align="right" style="${head}">Days cover</td>
<td align="right" style="${head}">Inventory &gt; ${SNAPSHOT_AGE_DAYS} days (MT · %)</td>
<td align="right" style="${head}">A-class out</td>
<td align="right" style="${head}">Excess MT (&gt; ${SNAPSHOT_FG_COVER.amber} days cover)</td>
</tr>
${rows.map((r, i) => summaryRow(r, i)).join('\n')}
${summaryRow(total, rows.length, true)}
</table>
</td></tr>
${excludedLine}
<tr><td style="padding:24px ${PAD}px 8px ${PAD}px;font-size:20px;font-weight:bold;color:${SNAP.navy};">Finished goods by plant × sales class</td></tr>
<tr><td style="padding:0 ${PAD}px;">
${classTableHtml}
</td></tr>
<tr><td style="padding:24px ${PAD}px 0 ${PAD}px;">
${listsHtml}
</td></tr>
<tr><td style="padding:12px ${PAD}px 0 ${PAD}px;font-size:14px;color:${SNAP.muted};">${esc(footer)}</td></tr>
<tr><td align="right" style="padding:8px ${PAD}px ${PAD}px ${PAD}px;font-size:13px;font-style:italic;color:${SNAP.source};">Source: JSW Pipes &amp; Tubes inventory app, live data as of ${esc(dateLabel)}</td></tr>
</table>
</body></html>
`
}

// The two brand images, inlined as data: URIs by Vite (`?inline`). A dynamic import inside the
// function, never a top-level one: `scripts/*.mjs` import this module under plain Node, which
// cannot load a .png, and only this browser-side download ever needs them.
export async function loadSnapshotBrandImages() {
  const [logo, ribbon] = await Promise.all([
    import('../assets/jsw-one-logo.png?inline'),
    import('../assets/divider-ribbon.png?inline'),
  ])
  return { logoSrc: logo.default, ribbonSrc: ribbon.default }
}

export async function generateInventorySnapshotReport(skus, productions, dispatches, coils, babyCoils, opts = {}) {
  const date = opts.date || today()
  const data = buildInventorySnapshotData(skus, productions, dispatches, coils, babyCoils, { date, plants: opts.plants })
  const html = renderInventorySnapshotHtml(data, await loadSnapshotBrandImages())
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), `Inventory-Snapshot-${date}.html`)
  return data
}

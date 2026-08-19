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
import { producedPool, unmatchedDispatch, coilConsumption, skuSizeLabel, skuKeyResolver, canonicalSkuKey, skuAgeing, salesKpis,
  plantBestEstimate, salesByDistributor, distributorRegionResolver, distributorCode, REGIONS, UNMAPPED_REGION,
  PLANTS, plantById, plantLabel, plantKeysIn, filterByPlant, filterDispatchesByPlant, UNATTRIBUTED_PLANT } from './calc.js'

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
//   Strip / Baby   — baby-coil free weight = weight − production-consumed (the Coil
//                    Tracker / Dashboard "Baby Coils Left" formula). Excludes manually
//                    "consumed" coils (operator marked them unavailable), so the section
//                    total may trail the Dashboard card by the free weight of any such
//                    coil — intentional for an available-stock sheet. Grouped width×thick.
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
    .filter(b => b.consumed !== true)
    .forEach(b => {
      const free = Number(b.weight || 0) - Number(consumedByBaby[b.babyCoilId]?.weight || 0)
      const mt = Math.max(0, free)
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
export function buildRegionMtdSummary(orders, dispatches, { date = today(), stateRegions = null } = {}) {
  const D = date, MONTH = dashMonthKey(D)

  // Same predicate buildMtdDashboardData uses for invoicedMtd. The month filter is applied inside
  // salesByDistributor, so this only has to carry the day cap.
  const live = notDeleted(dispatches)
  const upToD = live.filter(d => d.dateOfDispatch <= D)
  const rows = salesByDistributor(orders, upToD, MONTH, [], { stateRegions })

  // Built on the UNCAPPED list — see the asymmetry note above.
  const regionOf = distributorRegionResolver(orders, dispatches, stateRegions)

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

export function buildMtdDashboardData(orders, dispatches, productions, skus, { date = today(), estimates = [], stateRegions = null } = {}) {
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
  const prodLines = (productions || []).filter(p => !p.deleted)
  const freshProductionMtd = prodLines.reduce((t, p) => dashMonthKey(p.dateOfProduction) === MONTH ? t + num(p.totalWeight) : t, 0)

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
  // `productions` adds unreserved plant stock to every SKU row; `stateRegions` adds state + region.
  const distRowsAll = salesByDistributor(orders, dispatches, MONTH, skus, { estimates, productions, stateRegions })

  // Sheet 3 — the month's orders and invoicing, grouped by region then distributor. It stays
  // inventory-free — every one of its columns is totalled, and an unreserved stock column cannot be
  // (ADR-0002); the per-SKU stock lives on Sheet 4, which is totalled nowhere.
  const distributorRegions = buildDistributorRegionData(distRowsAll)

  // ── Sheet 4 — distributor × SKU: what is pending, what was invoiced this month, and how much of
  // that size the plant is holding. One row per pair that is LIVE (pending or invoiced MTD above
  // zero) — not every possible pair. Region → distributor → pending desc, with the SKU label as a
  // stable tiebreak.
  //
  // `freeStock` (on-hand less the Confirmed tonnage of EVERY distributor) is the WHOLE PLANT's and
  // is reserved to nobody, so the identical tonnage repeats on every distributor's row for that size
  // and `shortBy` can read 0 on a row whose size is oversubscribed several times over. That is why
  // the rendered sheet carries no total on it — in fact no total row at all — and a caption naming
  // the sharing (ADR-0002).
  const distSkuRows = []
  distRowsAll.forEach(r => {
    ;(r.skuRows || []).forEach(s => {
      if (!(s.pending > EPS || s.mtdInvoice > EPS)) return
      distSkuRows.push({
        region: r.region, state: r.state || '', customer: r.customer,
        skuKey: s.id, sku: skuLabel(skuByKey.get(s.id), s.description || s.id),
        invoicedMtd: s.mtdInvoice, confirmed: s.confirmed, nonConfirmed: s.nonConfirmed,
        pending: s.pending, onhand: s.onhand ?? 0, freeStock: s.freeStock ?? 0,
        allConfirmed: s.allConfirmed ?? 0, shortBy: s.shortBy ?? 0,
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

  return {
    date: D, month: MONTH, prevMonth: PREV, day: DAY, daysRemaining: remaining, bestEstimate: BE,
    plantSplit,
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
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
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

// ── Report A — Finished Pipe Stock ──
export async function generateFinishedStockReport(skus, productions, dispatches, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const data = buildFinishedStockData(skus, productions, dispatches, opts)
  const ExcelJS = await loadExcelJS()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Finished Stock', { views: [{ state: 'frozen', ySplit: 3 }] })
  ws.columns = [
    { width: 16 }, { width: 9 }, { width: 9 }, { width: 11 },
    { width: 11 }, { width: 13 }, { width: 18 },
  ]
  const COLS = ['SIZE', 'THICK', 'LEN', 'KG/PCS', 'PCS', 'QTY (MT)', 'REMARKS']

  writeTitle(ws, 7, `${company} — FINISHED PIPE STOCK REPORT`, date)
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

export async function generateMtdDashboardReport(orders, dispatches, productions, skus, opts = {}) {
  const date = opts.date || today()
  const company = opts.companyName || 'JSW One Pipes & Tubes'
  const data = buildMtdDashboardData(orders, dispatches, productions, skus,
    { date, estimates: opts.estimates ?? [], stateRegions: opts.stateRegions ?? null })
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
  const invScope = ps.invoicing.suffix
  // Whether this workbook covers the whole company or one plant. `fileSuffix` is what #121 already
  // sets for a scoped download (alongside the `— <Plant> only` sheet titles), so it is the existing
  // single answer to that question rather than a second flag that could disagree with it. The split
  // block's total row reads ALL PLANTS only when it really is: a Hyderabad-scoped workbook printing
  // "ALL PLANTS" over one Hyderabad row is exactly the mis-attribution #117 exists to end.
  const allPlantsScope = !opts.fileSuffix
  const cards = [
    { h: 'BEST ESTIMATE (MT)', v: naMt(k.bestEstimate), s: 'Σ distributor estimates', c: DASH.be },
    { h: 'ORDER PIPELINE (MT)', v: naMt(k.orderPipeline), s: 'Invoiced + Conf + Non-Conf', c: DASH.pipeline },
    { h: 'INVOICED MTD (MT)', v: naMt(k.invoicedMtd), s: (k.invoicedPctPipeline == null ? '' : `${Math.round(k.invoicedPctPipeline)}% of pipeline`) + invScope, c: DASH.invoiced },
    { h: 'PENDING TO SERVE (MT)', v: naMt(k.pending), s: 'Conf + Non-Conf', c: DASH.pending },
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

  const os = data.orderStatus, op = data.orderPipelineMtd, ip = data.inventoryProduction
  let leftRow = table(8, 1, 4, 5, 6, 'ORDER STATUS SUMMARY', DASH.bandStatus, 'Metric', [
    { label: 'Best Estimate (BE)', value: naMt(os.bestEstimate) },
    { label: 'Orders Received (Total Orders)', value: os.ordersReceived },
    { label: `Invoiced MTD${invScope}`, value: os.invoicedMtd },
    { label: 'Confirmed Pending Invoice', value: os.confirmed },
    { label: 'Non-Confirmed Orders', value: os.nonConfirmed },
    { label: 'Invoice % of BE', value: naPct(os.invoicePctOfBe), strong: true },
  ])
  leftRow += 1 // spacer between the two stacked left-hand tables
  const leftEnd = table(leftRow, 1, 4, 5, 6, 'INVENTORY & PRODUCTION', DASH.bandInv, 'Metric', [
    { label: 'Fresh Production MTD', value: ip.freshProductionMtd },
    { label: 'Physical Inventory', value: ip.physicalInventory },
    { label: 'Inventory Ageing (Days Avg)', value: naMt(ip.invAgeingDaysAvg) },
    { label: 'Ageing 0–30 d', value: ip.buckets.d0_30, indent: true },
    { label: 'Ageing 31–60 d', value: ip.buckets.d31_60, indent: true },
    { label: 'Ageing 61–90 d', value: ip.buckets.d61_90, indent: true },
    { label: 'Ageing 90+ d', value: ip.buckets.d90plus, indent: true },
  ])
  const rightEnd = table(8, 7, 10, 11, 12, 'ORDER PIPELINE — MTD', DASH.bandPipeline, 'Line', [
    { label: 'Total Orders', value: op.totalOrders },
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
  // INVOICED MTD and PENDING TO SERVE cards, and `plantSplit.checks` has already asserted that.
  //
  // The Invoiced column carries its scope in its own header, because this is the one place in the
  // workbook where one plant's Invoiced sits directly beside four plants' Pending. Naming it is the
  // deliverable — the mismatch is the ERP's shape, not an error to correct here.
  //
  // Tonnage renders to ONE DECIMAL (the cards above are whole) — a plant holding 0.4 MT must not
  // read as a plant holding nothing. The cell format alone rounds it; every cell holds the exact
  // value, so the ALL PLANTS row keeps tying to the cards.
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
  let pr = Math.max(leftEnd, rightEnd) + 1
  ws.mergeCells(`${cL(1)}${pr}:${cL(N)}${pr}`)
  const psBand = ws.getCell(pr, 1)
  psBand.value = 'BY PLANT — WHERE THE TONNAGE ABOVE ACTUALLY SITS'
  psBand.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  psBand.fill = fill(DASH.bandPlant)
  psBand.alignment = { horizontal: 'left', vertical: 'middle' }
  pr += 1
  const psHead = psRow(pr, ['Plant', `Invoiced MTD${invScope}`,
    'Confirmed', 'Non-Conf', 'Pending to Dispatch', 'Total Orders'])
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
    + `Pending to Dispatch comes from each ORDER line's plant, Invoiced from each INVOICE line's plant — both the ERP's own Ship From Code, neither typed. ${UNATTRIBUTED_PLANT} is a line whose plant the ERP did not let us resolve: its tonnage stays inside every total above, exactly as ${UNMAPPED_REGION} does on the region sheet, because a labelling gap is not missing weight. A plant listed with 0 Invoiced holds orders and has invoiced nothing this month — it is not an empty row. Values are exact; only the display is rounded.`
  psNote.font = psTied ? { italic: true, size: 9, color: { argb: 'FF6B7280' } } : { bold: true, size: 9, color: { argb: 'FFB91C1C' } }
  psNote.alignment = { wrapText: true, vertical: 'top' }
  ws.getRow(pr).height = 46

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
  styleHeaderRow(ws3.addRow(['Region', 'State', 'Distributor', 'Plan (MT)', 'Total Orders (MT)',
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
  const note3 = ws3.addRow([`Total Orders blends two time windows: Invoiced MTD is this month, while Confirmed and Non-Confirmed are an all-time order-book snapshot of orders not yet delivered. A distributor sitting on an old unserved backlog therefore reads as a heavy orderer. Plan is a typed monthly target per distributor; the Dashboard Best Estimate KPI is their sum, not a separate figure, and % of Plan measures INVOICED tonnage against it only. A distributor with no Plan still shows its invoiced tonnage, and that tonnage is counted in the actual but not in the plan, so % of Plan can exceed 100% without the plan having been beaten. Region comes from the state → region master, and State from the distributor’s own order and invoice lines. A state nobody has mapped groups under Unmapped, and so does a distributor with no lines at all to derive a state from — a Plan set before the first order lands there. Either way the tonnage still counts in the grand total.${ps.invoicing.note ? ' ' + ps.invoicing.note : ''}`])
  ws3.mergeCells(`A${note3.number}:H${note3.number}`)
  note3.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  note3.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  ws3.getRow(note3.number).height = 58

  // ── Sheet 4 — Distributor × SKU: pending / invoiced MTD against the plant's stock of that size.
  // Rows come from the same salesByDistributor call the Sales tab drill-down uses.
  //
  // NO TOTAL ROW, deliberately. Free Stock is plant-wide and unreserved, so summing it would report more
  // stock than the plant physically holds; and the sheet's rows only exist where an order line
  // carried a SKU code, so a Pending / Invoiced total would not tie to the Dashboard either. It is a
  // detail listing — the totals live on the Dashboard sheet (ADR-0002). ──
  const ws4 = wb.addWorksheet('Distributor × SKU', {
    views: [{ state: 'frozen', xSplit: 4, ySplit: 3 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.3, right: 0.3, top: 0.4, bottom: 0.4, header: 0.2, footer: 0.2 } },
  })
  ws4.columns = [{ width: 11 }, { width: 20 }, { width: 34 }, { width: 18 },
    { width: 13 }, { width: 12 }, { width: 12 }, { width: 12 }, { width: 17 }, { width: 11 }]
  writeTitle(ws4, 10, `${company} — DISTRIBUTOR × SKU — PENDING vs INVOICED vs PLANT STOCK — ${monthLabel}`, date)
  styleHeaderRow(ws4.addRow(['Region', 'State', 'Distributor', 'SKU',
    `Invoiced MTD${invScope}`, 'Confirmed', 'Non-Conf', 'Pending', 'Free Stock (plant)', 'Short by']))
  const dsk = data.distributorSku
  const ds4HeaderRow = ws4.lastRow.number
  if (!dsk.rows.length) {
    const r = ws4.addRow(['No distributor has pending or month-to-date invoiced tonnage', '', '', '', '', '', '', '', '', ''])
    r.eachCell(c => { c.border = ALL_BORDERS })
  }
  dsk.rows.forEach(row => {
    const r = ws4.addRow([row.region, row.state || '—', row.customer, row.sku,
      dash(row.invoicedMtd), dash(row.confirmed), dash(row.nonConfirmed), dash(row.pending),
      dash(row.freeStock), dash(row.shortBy)])
    ;[5, 6, 7, 8, 9, 10].forEach(i => numCell(r, i, MT1))
    r.eachCell(c => { c.border = ALL_BORDERS })
  })
  if (dsk.rows.length) {
    ws4.autoFilter = { from: { row: ds4HeaderRow, column: 1 }, to: { row: ws4.lastRow.number, column: 10 } }
  }
  ws4.addRow([])
  const note4 = ws4.addRow([`Free Stock (plant) is the WHOLE PLANT's stock of that size — produced minus invoiced — LESS the Confirmed tonnage of every distributor, i.e. what is promised to nobody yet. A NEGATIVE figure means the size is committed beyond what is on the floor. It is NOT reserved for anyone, so the same tonnage is repeated on every distributor's row waiting on that size, and it is deliberately NOT totalled anywhere on this sheet: adding the column up would report more stock than the plant holds. For the same reason "Short by" (Pending − on-hand, floored at zero) can read "-" on a row whose size several distributors are queued against — it says the plant has the tonnage, not that this distributor will get it. Rows are the live pairs only (Pending or Invoiced MTD above zero), sorted Region → Distributor → Pending. A distributor whose state carries no region mapping reads ${UNMAPPED_REGION}. Free Stock is every plant's finished stock combined — the plant column is not applied to it, because stock is held where it was made and an order is served from wherever the tonnage is.${ps.invoicing.note ? ' ' + ps.invoicing.note : ''}`])
  ws4.mergeCells(`A${note4.number}:J${note4.number}`)
  note4.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF6B7280' } }
  note4.getCell(1).alignment = { wrapText: true, vertical: 'top' }
  ws4.getRow(note4.number).height = 62

  await downloadWorkbook(wb, `PB-MTD-Dashboard-${date}${fileScope(opts)}.xlsx`)
  return data
}

// ═══════════════════════════════════════════════════════════════
// AI CONTEXT — builds the compact, name-masked data snapshot the AI Planner
// reasons over. Composes the SAME calc.js aggregates the Sales tab uses, so
// the agent's numbers always reconcile with what the user sees on screen.
//
// Privacy: customer/distributor names are replaced with opaque ids (C001…)
// before anything leaves the browser. The returned `customerMap` (id → real
// name) stays client-side; the UI swaps real names back in when it renders.
//
// Returns { context, customerMap }.
// ═══════════════════════════════════════════════════════════════
import { skuDemandSupply, distributorSalesRows, orderBacklog, coilConsumption } from './calc'

const round1 = (v) => Math.round((Number(v) || 0) * 10) / 10
const todayISO = () => new Date().toISOString().slice(0, 10)

// Trim caps — keep the payload small while preserving everything that matters
// for planning (over-committed SKUs, open demand, biggest customers/backlog).
const DEMAND_CAP = 150
const BACKLOG_CAP = 50
const DIST_CAP = 30

export function buildAIContext({ orders = [], dispatches = [], productions = [], skus = [], babyCoils = [], customerMap: seedMap = null } = {}) {
  // ── Customer-name masking (opaque ids; remapped to real names on render).
  //    Seed from the prior turn's map so a given customer keeps the SAME id
  //    for the whole chat — otherwise C001 could mean different customers on
  //    different turns and the model (and our remap) would get confused. ──
  const nameToId = new Map()
  const customerMap = {} // id -> real name
  let idCounter = 0
  if (seedMap) {
    for (const [id, name] of Object.entries(seedMap)) {
      nameToId.set(name, id)
      customerMap[id] = name
      const n = parseInt(String(id).replace(/^C/, ''), 10)
      if (Number.isFinite(n)) idCounter = Math.max(idCounter, n)
    }
  }
  const maskName = (name) => {
    const n = String(name || '').trim()
    if (!n || n === '—') return '—'
    if (!nameToId.has(n)) {
      idCounter += 1
      const id = 'C' + String(idCounter).padStart(3, '0')
      nameToId.set(n, id)
      customerMap[id] = n
    }
    return nameToId.get(n)
  }

  // ── Demand vs supply (live snapshot — same source as the Sales tab). ──
  const demandAll = skuDemandSupply(productions, dispatches, orders, skus)
  const invByCode = Object.fromEntries(demandAll.map((r) => [r.skuCode, r]))
  const projDemand = (r) => ({
    skuCode: r.skuCode,
    description: r.description,
    ordered: round1(r.ordered),
    produced: round1(r.produced),
    shipped: round1(r.shipped),
    inventory: round1(r.inventory),
    booked: round1(r.booked),
    free: round1(r.free),
    reserved: round1(r.reserved),
    available: round1(r.available),
  })
  let demandSupply
  let demandTruncated = false
  if (demandAll.length <= DEMAND_CAP) {
    demandSupply = demandAll.map(projDemand)
  } else {
    const keep = new Map()
    demandAll.forEach((r) => { if (r.free < 0 || r.booked > 0) keep.set(r.skuCode, r) })
    ;[...demandAll].sort((a, b) => b.ordered - a.ordered).slice(0, DEMAND_CAP).forEach((r) => keep.set(r.skuCode, r))
    demandSupply = [...keep.values()].map(projDemand)
    demandTruncated = keep.size < demandAll.length
  }

  // ── Open order backlog (oldest expected-delivery first; masked customer). ──
  const backlogAll = orderBacklog(orders, dispatches)
  const backlog = backlogAll.slice(0, BACKLOG_CAP).map((r) => ({
    orderId: r.orderId,
    customer: maskName(r.customer),
    skuCode: r.skuCode,
    description: r.description,
    ordered: round1(r.ordered),
    shipped: round1(r.shipped),
    open: round1(r.open),
    fulfilmentPct: Math.round(Number(r.fulfilmentPct) || 0),
    orderStatus: r.orderStatus,
    expectedDeliveryDate: r.expectedDeliveryDate,
  }))

  // ── Per-distributor matrix (drop nested skuRows; masked customer; top by pending). ──
  const distAll = distributorSalesRows(orders, dispatches, invByCode, dispatches)
  const distributors = distAll.slice(0, DIST_CAP).map((r) => ({
    customer: maskName(r.customer),
    validOrders: round1(r.validOrders),
    dispatched: round1(r.dispatched),
    invoicedVsOrders: round1(r.invoicedVsOrders),
    pending: round1(r.pending),
    openOrders: r.openOrders,
    inventory: round1(r.inventory),
    free: round1(r.free),
  }))

  // ── Raw material: free baby-coil stock grouped into thickness bands so the
  //    agent can reason about the ±0.3 mm thickness / ±5 mm width FIFO rule
  //    without the full coil list. free = baby weight − produced consumption. ──
  const consumed = coilConsumption(productions, null, 'babyCoilId') // { babyCoilId: { weight } }
  const bands = {}
  ;(babyCoils || []).filter((b) => !b.deleted && !b.consumed).forEach((b) => {
    const free = Number(b.weight || 0) - Number(consumed[b.babyCoilId]?.weight || 0)
    if (free <= 0.02) return
    const t = Number(b.thickness || 0)
    const key = t ? t.toFixed(1) : '0.0'
    const band = bands[key] || (bands[key] = { thickness: Number(key), freeMT: 0, coilCount: 0, wmin: Infinity, wmax: -Infinity })
    band.freeMT += free
    band.coilCount += 1
    const w = Number(b.width || 0)
    if (w) { band.wmin = Math.min(band.wmin, w); band.wmax = Math.max(band.wmax, w) }
  })
  const byThickness = Object.values(bands)
    .map((b) => ({
      thickness: b.thickness,
      freeMT: round1(b.freeMT),
      coilCount: b.coilCount,
      widths: [b.wmin === Infinity ? null : b.wmin, b.wmax === -Infinity ? null : b.wmax],
    }))
    .sort((a, b) => a.thickness - b.thickness)

  const asOf = todayISO()
  const totals = {
    globalFreeMT: round1(demandAll.reduce((s, r) => s + Number(r.free || 0), 0)),
    openBacklogMT: round1(backlogAll.reduce((s, r) => s + Number(r.open || 0), 0)),
    overCommittedSkuCount: demandAll.filter((r) => r.free < 0).length,
    distinctCustomers: nameToId.size,
    asOf,
  }

  const context = {
    asOf,
    units: 'MT (tonnes)',
    totals,
    demandSupply,
    demandTruncated,
    backlog,
    backlogTotal: backlogAll.length,
    distributors,
    distributorsTotal: distAll.length,
    rawMaterial: { byThickness },
  }
  return { context, customerMap }
}

// ── SKU by plant: which SKUs each plant PRODUCED, where they overlap, what only one plant makes ────
//
// Pure data builder for scripts/sku-by-plant/sku-by-plant-deck.mjs. No network, no pptx — rows in,
// one summary object out, so the numbers on the slides can be tested without rendering a deck.
//
// WHAT A "SKU" IS HERE. One cell of the heatmap: section (CHS / SHS / RHS) × size × wall thickness —
// the same unit the Plant Capability deck used ("a filled cell = one SKU (size x thickness)"). Two
// master codes for the same tube (a 1.6 vs 1.60 duplicate, a different length) are ONE cell, so the
// counts here can be a little lower than `count(distinct sku_code)`. Length is not a dimension.
//
// WHAT "PRODUCED" MEANS. At least one non-deleted production batch at that plant, dated inside the
// window. It is what the plant has made for JSW One — NOT what it can make. A blank cell says "no
// order came through", never "the mill cannot roll it".
//
// THE WINDOW. Default `from` is the day the LAST manufacturing plant produced its first batch — the
// first day all of them were live — so "unique" compares plants over the same days. Hyderabad has
// run since March; counting from then would make five months of head start read as capability.
// Default `to` is the latest production date. Both can be overridden.

const SECTIONS = [
  { type: 'CHS', label: 'Circular (CHS)' },
  { type: 'SHS', label: 'Square (SHS)' },
  { type: 'RHS', label: 'Rectangular (RHS)' },
]

const camel = (k) => k.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase())
export const toCamel = (row) => Object.fromEntries(Object.entries(row || {}).map(([k, v]) => [camel(k), v]))

const num = (v) => (v === '' || v == null ? NaN : Number(v))
const fmtNum = (n) => String(Number(n.toFixed(2)))   // 2.00 → "2", 1.60 → "1.6"

// Section, size label, size sort key and thickness for one master row. null ⇒ cannot be placed.
export function skuCell(sku) {
  if (!sku) return null
  const desc = String(sku.description || '')
  const type = String(sku.productType || desc.match(/\b(CHS|SHS|RHS)\b/i)?.[1] || '').toUpperCase()
  if (!SECTIONS.some(s => s.type === type)) return null
  const t = num(sku.thickness)
  if (!Number.isFinite(t) || t <= 0) return null
  let size, sort
  if (type === 'CHS') {
    const nb = num(sku.nominalBore ?? desc.match(/(\d+(?:\.\d+)?)\s*NB/i)?.[1])
    if (!Number.isFinite(nb)) return null
    size = fmtNum(nb); sort = [nb, 0]
  } else {
    let h = num(sku.height), b = num(sku.breadth)
    if (!Number.isFinite(h) || !Number.isFinite(b)) {
      const m = desc.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/)
      if (m) { h = Number(m[1]); b = Number(m[2]) }
    }
    if (!Number.isFinite(h) || !Number.isFinite(b)) return null
    size = `${fmtNum(h)}x${fmtNum(b)}`; sort = [h, b]
  }
  const thk = fmtNum(t)
  return { type, size, sort, thk, t, key: `${type}|${size}|${thk}` }
}

// One letter per plant for the heatmap cells (H / N / L / T). Falls back to two letters if two
// plants would share an initial, so a cell never names the wrong plant.
export function plantInitials(plants) {
  const first = plants.map(p => p.name[0].toUpperCase())
  return Object.fromEntries(plants.map((p, i) =>
    [p.id, first.filter(f => f === first[i]).length > 1 ? p.name.slice(0, 2) : first[i]]))
}

// productions / skus: rows in camelCase (use toCamel on raw PostgREST rows).
// plantMaster: src/data/plants.js rows — only `manufactures` plants are considered.
export function buildSkuByPlant({ productions, skus, plantMaster, from, to }) {
  const skuByCode = new Map((skus || []).filter(s => !s.deleted).map(s => [String(s.skuCode), s]))
  const mfg = (plantMaster || []).filter(p => p.manufactures)
  const mfgIds = new Set(mfg.map(p => p.id))
  const live = (productions || []).filter(p => !p.deleted && p.dateOfProduction)

  // First production date per plant, over ALL time — drives the default window.
  const firstDate = {}
  for (const p of live) {
    if (!mfgIds.has(p.plant)) continue
    const d = String(p.dateOfProduction).slice(0, 10)
    if (!firstDate[p.plant] || d < firstDate[p.plant]) firstDate[p.plant] = d
  }
  const allDates = live.map(p => String(p.dateOfProduction).slice(0, 10)).sort()
  const winFrom = from || Object.values(firstDate).sort().at(-1)
  const winTo = to || allDates.at(-1)
  if (!winFrom || !winTo) throw new Error('No production rows to build a window from.')

  const skipped = { noPlant: 0, noSku: 0, noSkuCodes: new Set() }
  const place = (p) => {
    if (!mfgIds.has(p.plant)) { skipped.noPlant++; return null }
    const cell = skuCell(skuByCode.get(String(p.skuCode)))
    if (!cell) { skipped.noSku++; skipped.noSkuCodes.add(String(p.skuCode)); return null }
    return cell
  }

  // All-time cell count, for the footnote only.
  const allTimeCells = new Set()
  for (const p of live) {
    if (!mfgIds.has(p.plant)) continue
    const c = skuCell(skuByCode.get(String(p.skuCode)))
    if (c) allTimeCells.add(c.key)
  }

  // Window: cell → { cell, plants: Map(plantId → MT) }
  const cells = new Map()
  const inWin = live.filter(p => {
    const d = String(p.dateOfProduction).slice(0, 10)
    return d >= winFrom && d <= winTo
  })
  for (const p of inWin) {
    const c = place(p)
    if (!c) continue
    if (!cells.has(c.key)) cells.set(c.key, { ...c, plants: new Map() })
    const e = cells.get(c.key)
    e.plants.set(p.plant, (e.plants.get(p.plant) || 0) + (Number(p.totalWeight) || 0))
  }

  const initials = plantInitials(mfg)
  const plants = mfg
    .map((pl, masterIdx) => {
      const mine = [...cells.values()].filter(c => c.plants.has(pl.id))
      const unique = mine.filter(c => c.plants.size === 1)
      const shared = mine.filter(c => c.plants.size > 1)
      const mt = (list) => list.reduce((s, c) => s + c.plants.get(pl.id), 0)
      const bySection = Object.fromEntries(SECTIONS.map(s => [s.type, {
        made: mine.filter(c => c.type === s.type).length,
        unique: unique.filter(c => c.type === s.type).length,
      }]))
      return { id: pl.id, name: pl.name, initial: initials[pl.id], masterIdx, firstDate: firstDate[pl.id] || null,
        made: mine.length, unique: unique.length, shared: shared.length,
        mt: mt(mine), mtUnique: mt(unique), mtShared: mt(shared), bySection }
    })
    .filter(p => p.made > 0)
    // Biggest first by SKUs made; master order breaks a tie.
    .sort((a, b) => b.made - a.made || a.masterIdx - b.masterIdx)

  // Pairwise: SKUs both plants made (whatever a third plant did). Diagonal = unique to that plant.
  const pair = {}
  for (const a of plants) {
    pair[a.id] = {}
    for (const b of plants) {
      pair[a.id][b.id] = a.id === b.id ? a.unique
        : [...cells.values()].filter(c => c.plants.has(a.id) && c.plants.has(b.id)).length
    }
  }

  // Exact combinations ("Hyderabad + NPMD") — these partition the union.
  const order = new Map(plants.map((p, i) => [p.id, i]))
  const combos = new Map()
  for (const c of cells.values()) {
    const ids = [...c.plants.keys()].sort((x, y) => order.get(x) - order.get(y))
    const k = ids.join('+')
    combos.set(k, { ids, count: (combos.get(k)?.count || 0) + 1 })
  }

  const sections = SECTIONS.map(s => {
    const list = [...cells.values()].filter(c => c.type === s.type)
    const sizes = [...new Map(list.map(c => [c.size, c.sort])).entries()]
      .sort((a, b) => a[1][0] - b[1][0] || a[1][1] - b[1][1]).map(([size]) => size)
    const thks = [...new Map(list.map(c => [c.thk, c.t])).entries()]
      .sort((a, b) => a[1] - b[1]).map(([thk]) => thk)
    return { ...s, total: list.length, sizes, thks, cells: new Map(list.map(c => [`${c.size}|${c.thk}`, c])) }
  })

  return {
    from: winFrom, to: winTo, plants, sections, pair,
    combos: [...combos.values()].sort((a, b) => a.ids.length - b.ids.length || b.count - a.count),
    total: cells.size,
    sharedTotal: [...cells.values()].filter(c => c.plants.size > 1).length,
    mtTotal: plants.reduce((s, p) => s + p.mt, 0),
    allTime: { total: allTimeCells.size, from: allDates[0] || null },
    skipped: { noPlant: skipped.noPlant, noSku: skipped.noSku, noSkuCodes: [...skipped.noSkuCodes] },
    initials,
  }
}

// The two or three sentences under the overlap matrix. Derived, so a refresh rewrites them.
export function takeaways(r) {
  const out = []
  const single = r.total - r.sharedTotal
  out.push(`${single} of ${r.total} SKUs (${Math.round(100 * single / r.total)}%) are made at one plant only; ` +
    `${r.sharedTotal} are made at two or more.`)
  const pairs = []
  for (let i = 0; i < r.plants.length; i++) {
    for (let j = i + 1; j < r.plants.length; j++) {
      const a = r.plants[i], b = r.plants[j]
      pairs.push({ a, b, n: r.pair[a.id][b.id] })
    }
  }
  const top = [...pairs].sort((x, y) => y.n - x.n)[0]
  if (top && top.n > 0) out.push(`Largest overlap: ${top.a.name} and ${top.b.name} share ${top.n} SKU${top.n === 1 ? '' : 's'}.`)
  const zero = pairs.filter(p => p.n === 0)
  if (zero.length) out.push(`No SKU in common: ${zero.map(p => `${p.a.name}–${p.b.name}`).join(', ')}.`)
  const dense = [...r.plants].sort((x, y) => y.mt / y.made - x.mt / x.made)[0]
  if (dense) out.push(`Highest volume per SKU: ${dense.name}, ${Math.round(dense.mt / dense.made)} MT per SKU ` +
    `(${dense.made} SKUs, ${Math.round(dense.mt)} MT)` +
    (dense.id !== r.plants[0].id ? ' — its SKU count understates its volume.' : '.'))
  return out
}

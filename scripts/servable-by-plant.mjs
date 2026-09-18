// ── Servable orders, cut by PLANT: "Distributor | Plant | MT" ────────────────────────────────────
//
// A thin RENDERER over `scripts/servable-orders.mjs --json`. It invents no tonnage: every
// distributor's servable figure is the one that script already printed and tied out, and all this
// does is say WHICH FLOOR that steel is standing on.
//
// HOW THE SPLIT IS MADE. `salesByDistributor` hands each SKU row an `onhandByPlant` map — the
// service area's on-hand, per plant, already floored at 0 per plant. A distributor's servable
// tonnage for that size is spread across those plants PRO-RATA BY HOLDING:
//
//     servableAtPlant[p] = servable × onhandByPlant[p] / Σ onhandByPlant
//
// That is the SAME apportionment rule ADR-0010 uses to share the area's Confirmed across plants, so
// this cut cannot contradict the workbook's "FREE INVENTORY, BY PLANT" columns. Where a plant's
// floor is over-invoiced its cell is 0, so `Σ cells` can exceed the area's floored `onhand`; the
// proportions are still the right ones, and the tonnage split is capped by `servable` either way.
//
// THERE IS STILL NO TOTAL, AND THERE MUST NEVER BE ONE (ADR-0002). Inside a service area stock is
// shared and reserved to nobody, so the same tonne legitimately appears against every distributor
// in that area waiting on that size. Per-distributor and per-(distributor, plant) figures are real;
// adding them up would report more steel than the plants hold. The one counted-once answer is the
// Dashboard's Servable – Unconfirmed, which is a different question and lives on the daily message.
//
// "MADE AT", NOT "HELD AT" — on-hand is produced − invoiced at those plants, and nothing in the data
// follows a tonne that physically moved afterwards. Same wording rule as servable-orders.mjs.
//
// Usage:
//   node scripts/servable-orders.mjs --date D --agg F --json | node scripts/servable-by-plant.mjs
//   node scripts/servable-by-plant.mjs --in serv.json [--min MT]
//
//   --in   read the JSON summary from a file instead of stdin
//   --min  hide (distributor, plant) lines below this tonnage (default 0 — print every plant line).
//          Anything hidden is still named as "+N more" carrying its tonnage, never dropped.
//
// stdout: the WhatsApp message   stderr: a short human summary   exit 1: unusable input

import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined }
const die = (m) => { console.error(`servable-by-plant: ${m}`); process.exit(1) }

const MIN = flag('min') === undefined ? 0 : Number(flag('min'))
if (!Number.isFinite(MIN) || MIN < 0) die(`--min must be a non-negative number, got "${flag('min')}"`)

const raw = flag('in') ? readFileSync(flag('in'), 'utf8') : readFileSync(0, 'utf8')
let data
try { data = JSON.parse(raw) } catch (e) { die(`input is not the --json summary: ${e.message}`) }
if (!Array.isArray(data?.distributors)) die('input has no `distributors` array — pass servable-orders.mjs --json')

const T = (n) => `${(Math.round(n * 10) / 10).toFixed(1)} T`
const EPS = 1e-9
// Plant id → the master's own name and service area, taken from the summary's `stockPlantAreas`
// ([{ name, regions }]) so this message spells a plant exactly as servable-orders.mjs and the
// Masters tab do — "NPMD", never a re-capitalised "Npmd".
const PLANT = new Map()
for (const p of (data.totals?.stockPlantAreas || [])) {
  if (p?.name) PLANT.set(String(p.name).toLowerCase().replace(/\s+/g, ''), p)
}
const label = (id) => PLANT.get(String(id).toLowerCase().replace(/\s+/g, ''))?.name || String(id)

// ── The split ────────────────────────────────────────────────────────────────────────────────────
const out = []
let unattributed = 0
for (const d of data.distributors) {
  const byPlant = new Map()
  for (const l of d.lines || []) {
    if (!(l.servable > EPS)) continue
    const cells = Object.entries(l.onhandByPlant || {}).filter(([, w]) => Number(w) > EPS)
    const H = cells.reduce((t, [, w]) => t + Number(w), 0)
    // No positive cell means the area holds none of this size at any single plant it can be pinned
    // to. That cannot happen while `servable > 0` on today's data, but it must never silently
    // vanish if it ever does — it is counted out loud instead.
    if (!(H > EPS)) { unattributed += l.servable; continue }
    for (const [id, w] of cells) byPlant.set(id, (byPlant.get(id) || 0) + l.servable * (Number(w) / H))
  }
  const rows = [...byPlant.entries()].map(([id, mt]) => ({ id, mt })).sort((a, b) => b.mt - a.mt)
  out.push({ ...d, rows })
}

// ── Render ───────────────────────────────────────────────────────────────────────────────────────
const L = []
L.push('*JSW Pipes & Tubes — Servable Orders by Plant*')
L.push(`📅 ${new Date(`${data.date}T00:00:00Z`).toUTCString().slice(5, 16).replace(/ /g, '-')}`)
// Same "Name (Region it serves)" header servable-orders.mjs prints: naming the floor without the
// area it ships to is half a fact — a reader cannot tell whether their distributor may have any.
const stockHeader = (data.totals?.stockPlantAreas || [])
  .map(p => `${p.name} (${(p.regions || []).join(', ') || 'no region in this report'})`).join(' + ')
L.push(`🏭 Stock made at: ${stockHeader || '—'}`)
L.push('')
L.push('_Distributor | Plant | MT we can serve today from finished stock._')

const regions = [...new Set(out.map(d => d.region))]
  .sort((a, b) => (a === 'Unmapped') - (b === 'Unmapped') || a.localeCompare(b))
for (const rg of regions) {
  const ds = out.filter(d => d.region === rg).sort((a, b) => b.servable - a.servable)
  if (!ds.length) continue
  L.push('')
  L.push(`*📍 ${rg.toUpperCase()}*`)
  for (const d of ds) {
    if (!d.rows.length) { L.push(`• ${d.customer} | — | 0.0 T`); continue }
    const big = d.rows.filter(r => r.mt >= MIN)
    // A distributor whose every plant line is sub-MIN still names its largest floor: dropping it
    // would leave the distributor off the message entirely, which reads as "nothing to serve".
    const shown = big.length ? big : d.rows.slice(0, 1)
    for (const r of shown) L.push(`• ${d.customer} | ${label(r.id)} | *${T(r.mt)}*`)
    const hidden = d.rows.filter(r => !shown.includes(r))
    if (hidden.length) L.push(`   _+${hidden.length} more plant${hidden.length > 1 ? 's' : ''} — ${T(hidden.reduce((t, r) => t + r.mt, 0))}_`)
  }
}

const dry = data.totals?.dryRegions || []
if (dry.length) {
  L.push('', `⚠️ No stock for ${dry.join(', ')} — no plant serving ${dry.length === 1 ? 'it' : 'them'} has produced any. Those distributors are the true position, not an outage.`)
}
if (unattributed > EPS) L.push('', `⚠️ ${T(unattributed)} servable could not be pinned to a plant — production rows carrying no plant.`)
L.push('')
L.push('_Stock is *made at* the plant named, not held there. No totals: inside a service area stock is shared and reserved to nobody, so these figures do not add up (ADR-0002)._')
console.log(L.join('\n'))

// ── stderr ───────────────────────────────────────────────────────────────────────────────────────
console.error(`\n  Servable by plant — as on ${data.date}\n`)
const tot = new Map()
for (const d of out) for (const r of d.rows) tot.set(r.id, (tot.get(r.id) || 0) + r.mt)
for (const d of out) {
  console.error(`   ${d.customer.slice(0, 30).padEnd(32)}${d.rows.map(r => `${label(r.id)} ${T(r.mt)}`).join(' + ') || '—'}`)
}
// A per-plant column IS additive down this list only in the sense that it is the same shared floor
// counted again for each distributor — printed here as a reconciliation aid for whoever checks the
// message, and deliberately NOT in it.
console.error('')
for (const [id, mt] of tot) console.error(`   ${label(id).padEnd(12)} appears against distributors for ${T(mt)} (shared, NOT a floor total)`)
console.error(`\n   ${out.length} distributor(s); ${[...tot.keys()].map(label).join(' + ')} named`)
console.error('   (per-plant figures are NOT additive across distributors — ADR-0002)')

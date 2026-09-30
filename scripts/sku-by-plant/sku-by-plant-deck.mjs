// ── SKU-by-plant deck: what each plant PRODUCED, where they overlap, what only one plant makes ─────
//
// Builds a JSW One–branded .pptx in the format of the "Market requirement vs plant capability" deck
// (size × thickness heatmaps, one slide per plant), re-based from capability to actual production:
//
//   1  Cover
//   2  Summary — plant × plant overlap matrix (diagonal = unique), SKUs/MT per plant, takeaways
//   3+ One heatmap slide per plant, biggest first (CHS | SHS | RHS side by side)
//
// Numbers come from build.mjs (pure, tested); this file only fetches rows and draws them.
// Decisions behind the format (window, grid, colours) are in blueprints/sku-by-plant-deck.md.
//
// Usage:
//   node scripts/sku-by-plant/sku-by-plant-deck.mjs [--from YYYY-MM-DD] [--to YYYY-MM-DD]
//        [--in FILE.json] [--url URL] [--key ANON_KEY] [--out FILE.pptx] [--audience TEXT] [--json]
//
//   --from/--to  production-date window (inclusive). Default: from = first day ALL manufacturing
//                plants had produced; to = latest production date.
//   --in         read { productions, skus } rows from a JSON file instead of Supabase (snake_case or
//                camelCase keys). For agent sessions, where the sandbox blocks the Supabase host —
//                dump the rows through the Supabase MCP instead. See the blueprint.
//   --out        default reports/SKU-by-Plant-<today>.pptx
//   --json       print the computed summary instead of writing a deck.
//
// stdout: the output path (or JSON)   stderr: a short summary   exit 1: bad args / fetch failure

import { existsSync, readFileSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import DEFAULT_PLANTS from '../../src/data/plants.js'
import { buildSkuByPlant, takeaways, toCamel } from './build.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')
const require = createRequire(import.meta.url)

const argv = process.argv.slice(2)
const flag = (n) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined }
const has = (n) => argv.includes(`--${n}`)
function die(msg) { console.error(`\nx ${msg}\n`); process.exit(1) }

const ISO = /^\d{4}-\d{2}-\d{2}$/
const FROM = flag('from'), TO = flag('to')
if (FROM && !ISO.test(FROM)) die(`--from must be YYYY-MM-DD, got "${FROM}"`)
if (TO && !ISO.test(TO)) die(`--to must be YYYY-MM-DD, got "${TO}"`)
if (FROM && TO && FROM > TO) die(`--from ${FROM} is after --to ${TO}`)
const TODAY = new Date().toISOString().slice(0, 10)
const OUT = path.resolve(flag('out') || path.join(ROOT, 'reports', `SKU-by-Plant-${TODAY}.pptx`))
const AUDIENCE = flag('audience') || 'Leadership review'

// ── rows ──
function loadEnv() {
  const f = path.join(ROOT, '.env.local')
  const env = { ...process.env }
  if (existsSync(f)) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim()
    }
  }
  return {
    url: flag('url') || env.SUPABASE_URL || env.VITE_SUPABASE_URL,
    key: flag('key') || env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY,
  }
}

async function fetchAll(url, key, table, select) {
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const q = `${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&order=created_at.asc,id.asc`
    const res = await fetch(q, { headers: { apikey: key, Authorization: `Bearer ${key}`, Range: `${from}-${from + PAGE - 1}` } })
    if (!res.ok) die(`fetch ${table} failed: ${res.status} ${res.statusText} — ${(await res.text()).slice(0, 300)}`)
    const page = await res.json()
    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
}

async function loadRows() {
  const inFile = flag('in')
  if (inFile) {
    const raw = JSON.parse(readFileSync(path.resolve(inFile), 'utf8'))
    return { productions: (raw.productions || []).map(toCamel), skus: (raw.skus || []).map(toCamel) }
  }
  const { url, key } = loadEnv()
  if (!url || !key) {
    die('Missing Supabase credentials. Pass --url/--key, set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY,\n' +
        '  or create .env.local. In an agent session use --in with rows dumped via the Supabase MCP\n' +
        '  (project ref hztblmccvvarmgxmunrp) — see blueprints/sku-by-plant-deck.md.')
  }
  const base = url.replace(/\/+$/, '')
  const [productions, skus] = await Promise.all([
    fetchAll(base, key, 'productions', 'id,deleted,created_at,date_of_production,sku_code,total_weight,plant'),
    fetchAll(base, key, 'skus', 'id,created_at,sku_code,product_type,description,nominal_bore,height,breadth,thickness'),
  ])
  return { productions: productions.map(toCamel), skus: skus.map(toCamel) }
}

// ── formatting ──
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dmy = (iso) => { const [y, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]} ${y}` }
const dm = (iso) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MON[m - 1]}` }
const span = (a, b) => (a.slice(0, 4) === b.slice(0, 4) ? `${dm(a)} – ${dmy(b)}` : `${dmy(a)} – ${dmy(b)}`)
const mtFmt = (n) => Math.round(n).toLocaleString('en-IN')
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0)

// ── draw ──
function render(r) {
  const pptxgen = require('pptxgenjs')
  const T = require('./jsw_template.cjs')
  const { C, FONT } = T
  const K = {
    UNIQUE: C.NAVY,            // made here only
    SHARED: '5A74AE',          // made here AND at another plant — letters name the others
    ELSEWHERE: 'FCE4C4',       // not made here, made at another plant — letters name who
    ELSEWHERE_TXT: '8A4B00',
    NONE: C.GREY_BG,           // no plant made it in the window
    BORDER: C.GREY_BORDER,
  }

  const pres = new pptxgen()
  T.init(pres)
  pres.title = 'SKUs produced, by plant'

  const win = span(r.from, r.to)
  const skippedNote = [
    r.skipped.noPlant ? `${r.skipped.noPlant} batches with no plant left out` : '',
    r.skipped.noSku ? `${r.skipped.noSku} batches whose SKU is not in the master left out` : '',
  ].filter(Boolean).join('; ')
  const source = `Source: Supabase productions (non-deleted), ${win}. A cell = one SKU (size x thickness) produced at least once. ` +
    `All-time since ${dmy(r.allTime.from)}: ${r.allTime.total} SKUs.${skippedNote ? ' ' + skippedNote + '.' : ''}`
  let page = 1

  // 1 — Cover
  const cover = T.cover(pres, {
    eyebrow: 'JSW ONE  |  TUBES & PIPES',
    title: 'SKUs produced, by plant',
    date: dmy(TODAY),
    period: win,
    audience: AUDIENCE,
  })
  cover.addText('Where the plants overlap, and what only one plant makes', {
    x: 0.50, y: 4.62, w: 12.33, h: 0.40, fontFace: FONT, fontSize: 16, color: C.GREY_DARK, valign: 'middle',
  })
  cover.addText(String(page++), { x: 0.30, y: 7.00, w: 0.50, h: 0.30, fontFace: FONT, fontSize: 9, color: C.GREY })

  // 2 — Summary
  {
    const s = pres.addSlide({ masterName: 'MASTER_CONTENT' })
    T.addTitle(s, 'Overlap and unique SKUs across plants')
    s.addText([
      { text: `${r.total} SKUs`, options: { bold: true, color: C.NAVY } },
      { text: ` produced across ${r.plants.length} plants, ${win}.   Diagonal = SKUs only that plant makes; ` +
        'other cells = SKUs both plants make.' },
    ], { x: 0.50, y: 0.96, w: 12.33, h: 0.28, fontFace: FONT, fontSize: 11, color: C.GREY_DARK, valign: 'middle' })

    const hdr = (t, o = {}) => ({ text: t, options: { bold: true, color: C.WHITE, fill: { color: C.NAVY }, align: 'center', ...o } })
    const border = { type: 'solid', pt: 0.5, color: K.BORDER }

    // Overlap matrix
    s.addText('Overlap matrix — number of SKUs', { x: 0.50, y: 1.40, w: 5.9, h: 0.30, fontFace: FONT, fontSize: 11, bold: true, color: C.NAVY })
    const mRows = [[hdr(''), ...r.plants.map(p => hdr(p.name))]]
    for (const a of r.plants) {
      mRows.push([
        { text: a.name, options: { bold: true, color: C.NAVY, fill: { color: C.GREY_BG }, align: 'left' } },
        ...r.plants.map(b => {
          const n = r.pair[a.id][b.id]
          if (a.id === b.id) return { text: String(n), options: { bold: true, color: C.WHITE, fill: { color: K.UNIQUE }, align: 'center' } }
          return n > 0
            ? { text: String(n), options: { bold: true, color: C.WHITE, fill: { color: K.SHARED }, align: 'center' } }
            : { text: '–', options: { color: C.GREY, fill: { color: C.WHITE }, align: 'center' } }
        }),
      ])
    }
    const mW = 5.90, first = 1.30
    s.addTable(mRows, {
      x: 0.50, y: 1.74, w: mW, colW: [first, ...r.plants.map(() => (mW - first) / r.plants.length)],
      rowH: 0.42, fontFace: FONT, fontSize: 12, valign: 'middle', border, margin: 0.04,
    })

    // Per-plant SKUs and MT
    const tX = 6.80, tW = 12.83 - tX
    s.addText('SKUs and tonnes, by plant', { x: tX, y: 1.40, w: tW, h: 0.30, fontFace: FONT, fontSize: 11, bold: true, color: C.NAVY })
    const cell = (t, o = {}) => ({ text: t, options: { color: C.GREY_DARK, align: 'center', ...o } })
    const pRows = [[hdr('Plant', { align: 'left' }), hdr('SKUs made'), hdr('Unique'), hdr('Shared'), hdr('MT produced'), hdr('MT on unique SKUs')]]
    for (const p of r.plants) {
      pRows.push([
        cell(p.name, { align: 'left', bold: true, color: C.NAVY, fill: { color: C.GREY_BG } }),
        cell(`${p.made}  (${pct(p.made, r.total)}%)`), cell(String(p.unique), { bold: true, color: C.NAVY }), cell(String(p.shared)),
        cell(mtFmt(p.mt)), cell(`${mtFmt(p.mtUnique)}  (${pct(p.mtUnique, p.mt)}%)`),
      ])
    }
    const tot = { bold: true, color: C.NAVY, fill: { color: C.GREY_HIGHLIGHT } }
    pRows.push([cell('All plants', { ...tot, align: 'left' }), cell(String(r.total), tot), cell(String(r.total - r.sharedTotal), tot),
      cell(String(r.sharedTotal), tot), cell(mtFmt(r.mtTotal), tot), cell('', tot)])
    s.addTable(pRows, {
      x: tX, y: 1.74, w: tW, colW: [1.23, 0.95, 0.70, 0.70, 0.95, 1.50],
      // One more row than the matrix (the total), squeezed so both tables end at the same line.
      rowH: (0.42 * (r.plants.length + 1)) / (r.plants.length + 2), fontFace: FONT, fontSize: 11, valign: 'middle', border, margin: 0.04,
    })

    // How the SKUs split — every exact combination, which together add to the total.
    const tableBottom = 1.74 + 0.42 * (r.plants.length + 1)
    const byId = Object.fromEntries(r.plants.map(p => [p.id, p]))
    // Non-breaking spaces inside each item, so a line wraps between combinations, never inside one.
    const combos = r.combos.map(c => `${c.ids.map(id => byId[id].name).join(' + ')}${c.ids.length === 1 ? ' only' : ''} ${c.count}`
      .replace(/ /g, '\u00A0'))
    s.addText([
      { text: `How the ${r.total} SKUs split:  `, options: { bold: true, color: C.NAVY } },
      { text: combos.join('   ·   ') },
    ], { x: 0.50, y: tableBottom + 0.20, w: 12.33, h: 0.50, fontFace: FONT, fontSize: 10.5, color: C.GREY_DARK, valign: 'top' })

    // Takeaways
    const tk = takeaways(r)
    const tkY = tableBottom + 0.85
    s.addShape('rect', { x: 0.50, y: tkY, w: 0.06, h: 0.36 * tk.length, fill: { color: C.RED }, line: { color: C.RED } })
    s.addText(tk.map((t, i) => ({ text: t, options: { breakLine: i < tk.length - 1 } })), {
      x: 0.70, y: tkY, w: 12.10, h: 0.36 * tk.length, fontFace: FONT, fontSize: 12, color: C.GREY_DARK,
      valign: 'middle', paraSpaceAfter: 4,
    })
    T.addFooter(s, source, page++)
  }

  // 3+ — One heatmap slide per plant
  const maxRows = Math.max(...r.sections.map(sec => sec.sizes.length), 1)
  const TBL_Y = 1.74, LEGEND_Y = 6.66
  const rowH = Math.min(0.30, (LEGEND_Y - 0.15 - TBL_Y) / (maxRows + 1))
  const cellPt = rowH >= 0.28 ? 7 : 6
  for (const p of r.plants) {
    const s = pres.addSlide({ masterName: 'MASTER_CONTENT' })
    T.addTitle(s, `${p.name} — SKUs produced`)
    s.addText([
      { text: 'Made ', options: {} },
      { text: `${p.made} of ${r.total}`, options: { bold: true, color: C.NAVY } },
      { text: ' network SKUs · ' },
      { text: `${mtFmt(p.mt)} MT`, options: { bold: true, color: C.NAVY } },
      { text: ' · ' },
      { text: `${p.unique} unique`, options: { bold: true, color: C.NAVY } },
      { text: ` to ${p.name}.   ${win}. Columns = wall thickness (mm), rows = section size.` },
    ], { x: 0.50, y: 0.96, w: 12.33, h: 0.28, fontFace: FONT, fontSize: 11, color: C.GREY_DARK, valign: 'middle' })

    r.sections.forEach((sec, i) => {
      const x = 0.50 + i * 4.21, W = 3.91
      const st = p.bySection[sec.type]
      s.addShape('rect', { x, y: 1.34, w: W, h: 0.34, fill: { color: C.NAVY }, line: { color: C.NAVY } })
      s.addText([
        { text: `${sec.label}   `, options: { bold: true, fontSize: 10.5 } },
        { text: `${st.made} of ${sec.total}`, options: { bold: true, fontSize: 12 } },
        { text: `   ·  ${st.unique} unique`, options: { fontSize: 8.5, color: C.NAVY_TEXT_LIGHT } },
      ], { x: x + 0.08, y: 1.34, w: W - 0.16, h: 0.34, fontFace: FONT, color: C.WHITE, valign: 'middle' })

      if (!sec.sizes.length) {
        s.addText('No plant produced this section in the window.', {
          x, y: TBL_Y, w: W, h: 0.40, fontFace: FONT, fontSize: 9, italic: true, color: C.GREY })
        return
      }
      const labelW = 0.62
      const colW = [labelW, ...sec.thks.map(() => (W - labelW) / sec.thks.length)]
      const head = { bold: true, color: C.WHITE, fill: { color: C.NAVY }, align: 'center', fontSize: 6.5 }
      const rows = [[{ text: 'size \\ mm', options: { ...head, align: 'left' } }, ...sec.thks.map(t => ({ text: t, options: head }))]]
      for (const size of sec.sizes) {
        rows.push([
          { text: size, options: { color: C.GREY_DARK, fill: { color: C.WHITE }, align: 'left', fontSize: 6.5 } },
          ...sec.thks.map(t => {
            const c = sec.cells.get(`${size}|${t}`)
            if (!c) return { text: '', options: { fill: { color: K.NONE } } }
            // Letters in slide order (H, T, N, L today), so the same pair always reads the same way.
            const others = r.plants.filter(q => q.id !== p.id && c.plants.has(q.id)).map(q => r.initials[q.id]).join('')
            if (!c.plants.has(p.id)) return { text: others, options: { fill: { color: K.ELSEWHERE }, color: K.ELSEWHERE_TXT, bold: true, align: 'center' } }
            if (!others) return { text: '', options: { fill: { color: K.UNIQUE } } }
            return { text: others, options: { fill: { color: K.SHARED }, color: C.WHITE, bold: true, align: 'center' } }
          }),
        ])
      }
      s.addTable(rows, {
        x, y: TBL_Y, w: W, colW, rowH, fontFace: FONT, fontSize: cellPt, valign: 'middle',
        border: { type: 'solid', pt: 0.25, color: K.BORDER }, margin: 0.02,
      })
    })

    // Legend
    const legend = [
      [K.UNIQUE, 'Made here only (unique)'],
      [K.SHARED, 'Shared (letters = who else)'],
      [K.ELSEWHERE, 'Elsewhere only (letters = who)'],
      [K.NONE, 'Not produced by any plant'],
    ]
    legend.forEach(([color, label], i) => {
      const lx = 0.50 + i * 3.10
      s.addShape('rect', { x: lx, y: LEGEND_Y, w: 0.20, h: 0.20, fill: { color }, line: { color: K.BORDER, width: 0.5 } })
      s.addText(label, { x: lx + 0.26, y: LEGEND_Y - 0.05, w: 2.80, h: 0.30, fontFace: FONT, fontSize: 9.5, color: C.GREY_DARK, valign: 'middle' })
    })
    const key = r.plants.map(q => `${r.initials[q.id]} = ${q.name}`).join(', ')
    s.addText(key, { x: 0.50, y: LEGEND_Y + 0.22, w: 12.33, h: 0.16, fontFace: FONT, fontSize: 7.5, color: C.GREY, valign: 'middle' })
    T.addFooter(s, source, page++)
  }

  return pres
}

// ── main ──
const rows = await loadRows()
let r
try {
  r = buildSkuByPlant({ ...rows, plantMaster: DEFAULT_PLANTS, from: FROM, to: TO })
} catch (e) { die(e.message) }
if (!r.total) die(`No production in ${r.from} … ${r.to} could be placed on the grid.`)

if (has('json')) {
  const plain = { ...r, sections: r.sections.map(s => ({ ...s, cells: undefined })), takeaways: takeaways(r) }
  process.stdout.write(JSON.stringify(plain, null, 2) + '\n')
} else {
  mkdirSync(path.dirname(OUT), { recursive: true })
  await render(r).writeFile({ fileName: OUT })
  process.stdout.write(OUT + '\n')
}
console.error(`window ${r.from} … ${r.to}: ${r.total} SKUs, ${r.sharedTotal} shared, ${mtFmt(r.mtTotal)} MT` +
  ` | ${r.plants.map(p => `${p.name} ${p.made}/${p.unique}u`).join(', ')}` +
  (r.skipped.noSku || r.skipped.noPlant ? ` | skipped: ${r.skipped.noSku} no-SKU, ${r.skipped.noPlant} no-plant` : ''))

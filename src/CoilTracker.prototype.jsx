// ═══════════════════════════════════════════════════════════════════════════════════════════════
// PROTOTYPE — THROWAWAY. Do not merge into staging or main.
// Question: "What should the Coil Tracker tab look like?"
// Four layouts on the real Coil Tracker tab, switched by ?variant=A|B|C|D and a floating bar.
//   A — Today (the current tab, untouched)
//   B — Headline + one plant table + trace in a side panel
//   C — Plant cards + "act first" list, trace opens inline under the row
//   D — Master–detail: filter chips, coil list left, trace/summary pinned right
// Every figure comes from coilTrackerView (calc.js) exactly as the live tab gets it; filtering goes
// through the same `cell` the matrix uses. The only arithmetic here is B/C's per-plant band totals
// (adding the matrix's HR + slit cells) — a winner would move that into calc.js.
// The bar and the variants only appear when the URL carries ?variant=, so the tab is unchanged otherwise.
// ═══════════════════════════════════════════════════════════════════════════════════════════════
import React, { useEffect, useState } from 'react'

export const PROTO_VARIANTS = [
  { key: 'A', name: 'Today' },
  { key: 'B', name: 'Headline + side panel' },
  { key: 'C', name: 'Plant cards, act first' },
  { key: 'D', name: 'List + pinned detail' },
]

const readVariant = () => {
  try { return new URLSearchParams(window.location.search).get('variant') } catch { return null }
}

// ?variant= in the URL, kept in sync with the floating bar. null = no prototype (live behaviour).
export function useProtoVariant() {
  const [v, setV] = useState(readVariant)
  const set = (key) => {
    const u = new URL(window.location.href)
    u.searchParams.set('variant', key)
    window.history.replaceState(null, '', u)
    setV(key)
  }
  return [v ? v.toUpperCase() : null, set]
}

export function PrototypeSwitcher({ current, onChange }) {
  const i = Math.max(0, PROTO_VARIANTS.findIndex(x => x.key === current))
  const go = (d) => onChange(PROTO_VARIANTS[(i + d + PROTO_VARIANTS.length) % PROTO_VARIANTS.length].key)
  useEffect(() => {
    const onKey = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') go(-1)
      if (e.key === 'ArrowRight') go(1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const v = PROTO_VARIANTS[i]
  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-1 rounded-full bg-fuchsia-700 text-white shadow-2xl ring-4 ring-fuchsia-300/60 px-1 py-1 text-sm">
      <button type="button" onClick={() => go(-1)} aria-label="Previous variant" className="w-9 h-9 rounded-full hover:bg-white/20">←</button>
      <span className="px-2 font-semibold whitespace-nowrap">PROTOTYPE {v.key} — {v.name}</span>
      <button type="button" onClick={() => go(1)} aria-label="Next variant" className="w-9 h-9 rounded-full hover:bg-white/20">→</button>
    </div>
  )
}

// ── small shared bits ────────────────────────────────────────────────────────────────────────────
const f1 = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const BAND_BG = { Act: 'bg-red-500', Watch: 'bg-amber-400', Clear: 'bg-emerald-500', 'No date': 'bg-slate-400' }
const BAND_TXT = { Act: 'text-red-700 dark:text-red-300', Watch: 'text-amber-700 dark:text-amber-300', Clear: 'text-emerald-700 dark:text-emerald-300', 'No date': 'text-slate-600 dark:text-slate-300' }
const COVER_TXT = { noUse: 'text-amber-700 dark:text-amber-300', out: 'text-red-700 dark:text-red-300' }
const focus = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'

// Per-plant band totals (HR + slit) from the matrix rows. Prototype-only arithmetic, see header.
function plantBands(matrix, plant) {
  return matrix.bands.map((band, i) => {
    const rows = matrix.rows.filter(r => r.plant === plant)
    return { band, weight: rows.reduce((s, r) => s + (r.cells[i]?.weight || 0), 0), count: rows.reduce((s, r) => s + (r.cells[i]?.count || 0), 0) }
  })
}
const allBands = (matrix) => matrix.bands.map((band, i) => ({ band, weight: matrix.all.cells[i].weight, count: matrix.all.cells[i].count }))

function BandBar({ bands, onPick, selectedBand, tall }) {
  const total = bands.reduce((s, b) => s + b.weight, 0) || 1
  return (
    <div className={`flex w-full overflow-hidden rounded ${tall ? 'h-3' : 'h-2'} bg-slate-100 dark:bg-slate-700`}>
      {bands.filter(b => b.weight > 0).map(b => (
        <button key={b.band} type="button" title={`${b.band}: ${f1(b.weight)} T · ${b.count} coils`}
          onClick={onPick ? () => onPick(b.band) : undefined} tabIndex={onPick ? 0 : -1}
          className={`${BAND_BG[b.band]} ${selectedBand && selectedBand !== b.band ? 'opacity-30' : ''} ${onPick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
          style={{ width: `${(b.weight / total) * 100}%` }} />
      ))}
    </div>
  )
}

function KpiStrip({ view }) {
  const all = view.stockByPlant.all
  const bands = allBands(view.matrix)
  const act = bands.find(b => b.band === 'Act') || { weight: 0, count: 0 }
  const pct = all.totalWeight ? Math.round((act.weight / all.totalWeight) * 100) : 0
  const tile = (label, value, sub, tone = '') => (
    <div className="min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white ${tone}`}>{value}</p>
      {sub && <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{sub}</p>}
    </div>
  )
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
      {tile('Raw material', `${f1(all.totalWeight)} T`, `${all.hr.count + all.slit.count} coils`)}
      {tile('HR coil, unslit', `${f1(all.hr.weight)} T`, `${all.hr.count} coils`)}
      {tile('Slit coil', `${f1(all.slit.weight)} T`, `${all.slit.count} coils`)}
      {tile('Act (61+ days)', `${f1(act.weight)} T`, `${pct}% of stock · ${act.count} coils`, BAND_TXT.Act)}
      {tile('Avg age', all.avgAge == null ? '–' : `${all.avgAge} d`, 'tonne-weighted')}
      {tile('Days of cover', all.cover.tone === 'none' ? '–' : all.cover.label, `${f1(all.produced30d)} T used in 30 d`, COVER_TXT[all.cover.tone] || '')}
    </div>
  )
}

// Stock rows (HR unslit + slit) as one list, oldest first, with a Type column.
function stockRows(view) {
  const rows = [
    ...(view.show.unslit ? view.unslitRows.map(r => ({ ...r, type: 'HR unslit' })) : []),
    ...(view.show.baby ? view.babyStockRows.map(r => ({ ...r, type: 'Slit' })) : []),
  ]
  return rows.sort((a, b) => (b.age ?? Infinity) - (a.age ?? Infinity) || String(a.id).localeCompare(String(b.id)))
}

// The trace body (header + 4 stage boxes + 3 tables), laid out for a narrow container.
function TraceBody({ trace, ui, compact }) {
  const { TraceTable, TraceDate, Badge, fmtT3 } = ui
  const sec = (title, node) => (
    <div>
      <h4 className="mb-1.5 text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
      {node}
    </div>
  )
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
        <span>{trace.header.plantName}</span><span>Grade {trace.header.grade || '—'}</span>
        <span>{trace.header.spec} mm</span><span>PO {trace.header.poNumber || '—'}</span>
        <span>Invoice {fmtT3(trace.header.invoiceWeight)} T · Actual {fmtT3(trace.header.actualWeight)} T</span>
      </div>
      <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-4'}`}>
        {trace.stages.map(st => (
          <div key={st.key} className={`p-3 rounded-lg border-l-4 ${st.weight > 0 ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-300 bg-slate-50 dark:bg-slate-800'}`}>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{st.name}</p>
            <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-white">{fmtT3(st.weight)} T</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{st.sub}</p>
          </div>
        ))}
      </div>
      {sec(`Slit coils (${trace.babies.length})`, <TraceTable empty="Not slit yet." head={['Slit coil', 'Date', 'Size', 'T', 'Status']}
        rows={trace.babies.map(b => [b.id, <TraceDate key="d" date={b.date} outOfOrder={b.outOfOrder} />, b.spec, fmtT3(b.weight), <Badge key="s" ok={b.status === 'In stock'} text={b.status} />])} numeric={[3]} />)}
      {sec(`Production runs (${trace.runs.length}) — this coil's share`, <TraceTable empty="No production yet." head={['Run', 'Date', 'Slit coil', 'Pcs', 'T']}
        rows={trace.runs.map(r => [r.no || '—', <TraceDate key="d" date={r.date} outOfOrder={r.outOfOrder} />, r.babyCoilId || '—', r.pieces, fmtT3(r.weight)])} numeric={[3, 4]} />)}
      {sec(`Invoice lines (${trace.lines.length}) — this coil's share`, <TraceTable empty="Nothing dispatched yet." head={['Invoice', 'Date', 'Customer', 'Pcs', 'T']}
        rows={trace.lines.map(l => [l.invoiceNo || '—', <TraceDate key="d" date={l.date} outOfOrder={l.outOfOrder} />, l.customer || '—', l.pieces, fmtT3(l.weight)])} numeric={[3, 4]} />)}
    </div>
  )
}

// ═══ B — Headline + one plant table + side panel ═══════════════════════════════════════════════
function VariantB({ view, cell, setCell, selectedCoilId, setSelectedCoilId, ui, rest }) {
  const { Section, Btn, DataTable, BandChip, fmtT3 } = ui
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') setSelectedCoilId(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setSelectedCoilId])
  const rows = stockRows(view)
  const pick = (plant, band) => setCell(cell && cell.plant === plant && cell.band === band ? null : { plant, kind: null, band })
  const cols = [
    { label: 'Band', value: r => r.band, render: r => <BandChip band={r.band} /> },
    { label: 'Age (d)', value: r => r.age ?? Infinity, render: r => <span className="tabular-nums font-medium">{r.age ?? '—'}</span> },
    { label: 'Type', value: r => r.type },
    { label: 'Coil ID', value: r => r.id },
    { label: 'Plant', value: r => r.plantName },
    { label: 'Thk × Width', value: r => r.spec },
    { label: 'Weight (T)', value: r => r.weight, render: r => <span className="tabular-nums">{fmtT3(r.weight)}</span>, total: v => fmtT3(v) },
    { label: 'Date', value: r => r.date || '—' },
  ]
  const table = [...view.stockByPlant.rows, view.stockByPlant.all]
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Coil Tracker</h2>
      <KpiStrip view={view} />
      <Section title="Stock by plant — click a plant or a band to filter the list" actions={cell && <Btn size="sm" variant="ghost" onClick={() => setCell(null)}>Show all</Btn>}>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-700 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
              <tr>
                <th className="sticky left-0 bg-slate-50 dark:bg-slate-700 px-3 py-2 text-left">Plant</th>
                <th className="px-3 py-2 text-right">Total T</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">HR unslit</th>
                <th className="px-3 py-2 text-right">Slit</th>
                <th className="px-3 py-2 text-left min-w-[220px]">Age mix <span className="normal-case tracking-normal font-normal">(<span className={BAND_TXT.Act}>Act</span> · <span className={BAND_TXT.Watch}>Watch</span> · <span className={BAND_TXT.Clear}>Clear</span> T)</span></th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Avg age</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Used 30d</th>
                <th className="px-3 py-2 text-right whitespace-nowrap">Cover (d)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {table.map(r => {
                const isAll = r === view.stockByPlant.all
                const plant = isAll ? null : r.plant
                const bands = isAll ? allBands(view.matrix) : plantBands(view.matrix, r.plant)
                const sel = cell && cell.plant === plant && !cell.band
                return (
                  <tr key={isAll ? '__all' : r.plant} className={isAll ? 'bg-slate-50 dark:bg-slate-700/50 font-semibold border-t-2 border-slate-400' : sel ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}>
                    <td className="sticky left-0 bg-inherit px-3 py-2 whitespace-nowrap">
                      <button type="button" onClick={() => pick(plant, null)} className={`text-left font-medium text-slate-900 dark:text-white hover:text-indigo-700 rounded ${focus}`}>{r.plantName}</button>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{f1(r.totalWeight)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.hr.empty ? '–' : <>{f1(r.hr.weight)} <span className="text-xs text-slate-500">· {r.hr.count}</span></>}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{r.slit.empty ? '–' : <>{f1(r.slit.weight)} <span className="text-xs text-slate-500">· {r.slit.count}</span></>}</td>
                    <td className="px-3 py-2">
                      <BandBar bands={bands} onPick={(b) => pick(plant, b)} selectedBand={cell && cell.plant === plant ? cell.band : null} />
                      <div className="mt-1 flex gap-3 text-xs tabular-nums">
                        {bands.map(b => (
                          <button key={b.band} type="button" disabled={!b.weight} onClick={() => pick(plant, b.band)}
                            className={`${BAND_TXT[b.band]} ${!b.weight ? 'opacity-40' : 'hover:underline'} ${cell && cell.plant === plant && cell.band === b.band ? 'underline font-semibold' : ''} rounded ${focus}`}>
                            {b.weight ? f1(b.weight) : '–'}
                          </button>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.avgAge ?? '–'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.produced30d ? f1(r.produced30d) : '–'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${COVER_TXT[r.cover.tone] || ''}`}>{r.cover.tone === 'none' ? '–' : r.cover.label}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title={`Coils in stock (${rows.length})${view.cellLabel ? ' — ' + view.cellLabel : ''} · click a coil for its trace`}>
        <DataTable key={JSON.stringify(cell)} columns={cols} data={rows} maxHeight="28rem" totalsLabel="TOTAL"
          filters={[{ key: 'type', label: 'Type', accessor: r => r.type, options: ['HR unslit', 'Slit'] }, { key: 'thk', label: 'Thickness', accessor: r => String(r.thickness ?? '') }]}
          onRowClick={r => setSelectedCoilId(r.motherId)} highlightRow={r => r.motherId === selectedCoilId} />
      </Section>
      {rest}
      {view.trace && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30" onClick={() => setSelectedCoilId(null)} aria-hidden="true" />
          <aside role="dialog" aria-label={`Trace ${view.trace.header.id}`}
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[600px] overflow-y-auto bg-white dark:bg-slate-900 shadow-2xl border-l border-slate-200 dark:border-slate-700">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-3">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Trace: {view.trace.header.id}</h3>
              <button type="button" onClick={() => setSelectedCoilId(null)} aria-label="Close trace" className={`w-10 h-10 rounded-full text-xl hover:bg-slate-100 dark:hover:bg-slate-800 ${focus}`}>✕</button>
            </div>
            <div className="p-5"><TraceBody trace={view.trace} ui={ui} /></div>
          </aside>
        </>
      )}
    </div>
  )
}

// ═══ C — Plant cards, act first; trace opens inline under the row ═══════════════════════════════
function VariantC({ view, cell, setCell, selectedCoilId, setSelectedCoilId, ui, rest }) {
  const { BandChip, fmtT3 } = ui
  const plant = cell ? cell.plant : null
  const band = cell ? cell.band : 'Act'
  // Default = Act across all plants: the coils someone should do something about, first.
  useEffect(() => { if (!cell) setCell({ plant: null, kind: null, band: 'Act' }) }, []) // eslint-disable-line
  const setPlant = (p) => setCell({ plant: plant === p ? null : p, kind: null, band })
  const setBand = (b) => setCell({ plant, kind: null, band: b })
  const rows = stockRows(view)
  const bandTabs = [...allBandsFor(view, plant), { band: null, weight: null }]
  const card = (r, isAll) => {
    const p = isAll ? null : r.plant
    const bands = isAll ? allBands(view.matrix) : plantBands(view.matrix, r.plant)
    const act = bands.find(b => b.band === 'Act') || { weight: 0 }
    const sel = plant === p
    return (
      <button key={isAll ? '__all' : r.plant} type="button" onClick={() => setPlant(p)} aria-pressed={sel}
        className={`text-left rounded-xl border p-4 transition-colors ${focus} ${sel ? 'border-indigo-500 ring-2 ring-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-slate-400'}`}>
        <div className="flex items-baseline justify-between gap-2">
          <span className="font-semibold text-slate-900 dark:text-white">{r.plantName}</span>
          <span className={`text-xs tabular-nums ${COVER_TXT[r.cover.tone] || 'text-slate-500 dark:text-slate-400'}`}>
            <b className="text-lg">{r.cover.tone === 'none' ? '–' : r.cover.label}</b> {r.cover.tone === 'ok' || r.cover.tone === 'out' ? 'days cover' : ''}
          </span>
        </div>
        <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{f1(r.totalWeight)} <span className="text-sm font-normal text-slate-500">T</span></p>
        <div className="mt-2"><BandBar bands={bands} tall /></div>
        <div className="mt-2 flex justify-between text-xs tabular-nums text-slate-600 dark:text-slate-300">
          <span>HR {r.hr.empty ? '–' : `${f1(r.hr.weight)} · ${r.hr.count}`}</span>
          <span>Slit {r.slit.empty ? '–' : `${f1(r.slit.weight)} · ${r.slit.count}`}</span>
        </div>
        <div className="mt-1 flex justify-between text-xs tabular-nums">
          <span className={act.weight ? BAND_TXT.Act + ' font-semibold' : 'text-slate-400'}>Act {act.weight ? `${f1(act.weight)} T` : '–'}</span>
          <span className="text-slate-500 dark:text-slate-400">Avg {r.avgAge ?? '–'} d</span>
        </div>
      </button>
    )
  }
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Coil Tracker</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {card(view.stockByPlant.all, true)}
        {view.stockByPlant.rows.map(r => card(r, false))}
      </div>
      <div className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-700 px-4 py-3">
          <span className="mr-2 font-semibold text-slate-900 dark:text-white">{plant == null ? 'All plants' : view.stockByPlant.rows.find(r => r.plant === plant)?.plantName}</span>
          <div role="tablist" className="flex flex-wrap gap-1 rounded-lg bg-slate-100 dark:bg-slate-700 p-1">
            {bandTabs.map(t => (
              <button key={t.band ?? 'all'} type="button" role="tab" aria-selected={band === t.band} onClick={() => setBand(t.band)}
                className={`px-3 py-1.5 rounded-md text-sm whitespace-nowrap ${focus} ${band === t.band ? 'bg-white dark:bg-slate-900 shadow font-semibold text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900'}`}>
                {t.band ? <><span className={BAND_TXT[t.band]}>{t.band}</span> <span className="tabular-nums text-xs text-slate-500">{f1(t.weight)} T · {t.count}</span></> : 'All bands'}
              </button>
            ))}
          </div>
          <span className="ml-auto text-xs text-slate-500">{rows.length} coils · oldest first · click a coil to open its trace here</span>
        </div>
        <div className="overflow-x-auto max-h-[36rem] overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
              <tr>{['Band', 'Age (d)', 'Type', 'Coil ID', 'Plant', 'Thk × Width', 'Weight (T)', 'Date'].map((h, i) =>
                <th key={h} className={`px-3 py-2 ${i === 1 || i === 6 ? 'text-right' : 'text-left'} whitespace-nowrap`}>{h}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {rows.map(r => {
                const open = r.motherId === selectedCoilId
                return (
                  <React.Fragment key={r.kind + r.id}>
                    <tr onClick={() => setSelectedCoilId(open ? null : r.motherId)} tabIndex={0}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedCoilId(open ? null : r.motherId) } }}
                      className={`cursor-pointer ${focus} ${open ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50'}`}>
                      <td className="px-3 py-2"><BandChip band={r.band} /></td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{r.age ?? '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.type}</td>
                      <td className="px-3 py-2 whitespace-nowrap font-medium"><span className="text-slate-400 mr-1">{open ? '▾' : '▸'}</span>{r.id}</td>
                      <td className="px-3 py-2">{r.plantName}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.spec}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{fmtT3(r.weight)}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{r.date || '—'}</td>
                    </tr>
                    {open && view.trace && (
                      <tr><td colSpan={8} className="bg-slate-50 dark:bg-slate-900/40 px-4 py-4 border-l-4 border-indigo-500">
                        <p className="mb-3 font-semibold text-slate-900 dark:text-white">Trace: {view.trace.header.id}</p>
                        <TraceBody trace={view.trace} ui={ui} />
                      </td></tr>
                    )}
                  </React.Fragment>
                )
              })}
              {!rows.length && <tr><td colSpan={8} className="px-3 py-6 text-center text-slate-500">No coils in this band.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
      {rest}
    </div>
  )
}
function allBandsFor(view, plant) { return plant == null ? allBands(view.matrix) : plantBands(view.matrix, plant) }

// ═══ D — Master–detail: chips, list left, pinned detail right ════════════════════════════════════
function VariantD({ view, cell, setCell, selectedCoilId, setSelectedCoilId, ui, rest }) {
  const { BandChip, Btn, fmtT3 } = ui
  const c = cell || { plant: null, kind: null, band: null }
  const set = (patch) => { const n = { ...c, ...patch }; setCell(n.plant == null && n.kind == null && n.band == null ? null : n) }
  const rows = stockRows(view)
  const chip = (active, label, onClick, extra = '') => (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`px-3 py-1.5 rounded-full border text-sm whitespace-nowrap tabular-nums ${focus} ${active ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-slate-500'} ${extra}`}>{label}</button>
  )
  const totalBands = allBands(view.matrix)
  const all = view.stockByPlant.all
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Coil Tracker</h2>
        <p className="text-sm tabular-nums text-slate-600 dark:text-slate-300">
          <b className="text-slate-900 dark:text-white">{f1(all.totalWeight)} T</b> raw material · <span className={BAND_TXT.Act}><b>{f1(totalBands.find(b => b.band === 'Act')?.weight)} T</b> Act</span> · <b className={COVER_TXT[all.cover.tone] || 'text-slate-900 dark:text-white'}>{all.cover.label}</b> days cover
        </p>
      </div>
      <div className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
        <div className="flex gap-2 overflow-x-auto pb-1"><span className="self-center w-14 shrink-0 text-xs font-medium uppercase text-slate-500">Plant</span>
          {chip(c.plant == null, `All ${f1(all.totalWeight)}`, () => set({ plant: null }))}
          {view.stockByPlant.rows.map(r => chip(c.plant === r.plant, `${r.plantName} ${f1(r.totalWeight)}`, () => set({ plant: c.plant === r.plant ? null : r.plant })))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1"><span className="self-center w-14 shrink-0 text-xs font-medium uppercase text-slate-500">Age</span>
          {chip(c.band == null, 'All', () => set({ band: null }))}
          {allBandsFor(view, c.plant).map(b => chip(c.band === b.band, <><span className={c.band === b.band ? '' : BAND_TXT[b.band]}>{b.band}</span> {f1(b.weight)}</>, () => set({ band: c.band === b.band ? null : b.band })))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1"><span className="self-center w-14 shrink-0 text-xs font-medium uppercase text-slate-500">Type</span>
          {chip(c.kind == null, 'Both', () => set({ kind: null }))}
          {chip(c.kind === 'unslit', 'HR unslit', () => set({ kind: c.kind === 'unslit' ? null : 'unslit' }))}
          {chip(c.kind === 'baby', 'Slit', () => set({ kind: c.kind === 'baby' ? null : 'baby' }))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-4 items-start">
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-700 px-4 py-2 text-sm">
            <span className="font-semibold text-slate-900 dark:text-white">{rows.length} coils</span>
            <span className="tabular-nums text-slate-500">{fmtT3(rows.reduce((s, r) => s + r.weight, 0))} T · oldest first</span>
          </div>
          <ul className="max-h-[70vh] overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
            {rows.map(r => {
              const sel = r.motherId === selectedCoilId
              return (
                <li key={r.kind + r.id}>
                  <button type="button" onClick={() => setSelectedCoilId(r.motherId)} aria-current={sel}
                    className={`w-full grid grid-cols-[auto_1fr_auto] items-center gap-3 px-4 py-2.5 text-left ${focus} ${sel ? 'bg-indigo-50 dark:bg-indigo-900/30 border-l-4 border-indigo-500' : 'hover:bg-slate-50 dark:hover:bg-slate-700/50 border-l-4 border-transparent'}`}>
                    <BandChip band={r.band} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-slate-900 dark:text-white">{r.id}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{r.type} · {r.plantName} · {r.spec}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      <span className="block text-sm font-semibold text-slate-900 dark:text-white">{fmtT3(r.weight)}</span>
                      <span className="block text-xs text-slate-500">{r.age ?? '—'} d</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="lg:sticky lg:top-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {view.trace ? (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Trace: {view.trace.header.id}</h3>
                <Btn size="sm" variant="ghost" onClick={() => setSelectedCoilId(null)}>Back to summary</Btn>
              </div>
              <TraceBody trace={view.trace} ui={ui} />
            </>
          ) : (
            <>
              <h3 className="mb-3 text-lg font-semibold text-slate-900 dark:text-white">Stock by plant</h3>
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase tracking-wider text-slate-500"><tr>
                  <th className="py-1.5 text-left">Plant</th><th className="py-1.5 text-right">HR T</th><th className="py-1.5 text-right">Slit T</th><th className="py-1.5 text-right">Total</th><th className="py-1.5 text-right">Age</th><th className="py-1.5 text-right">Cover</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700 tabular-nums">
                  {[...view.stockByPlant.rows, all].map(r => (
                    <tr key={r === all ? '__all' : r.plant} className={r === all ? 'font-semibold border-t-2 border-slate-400' : ''}>
                      <td className="py-1.5">{r.plantName}</td>
                      <td className="py-1.5 text-right">{r.hr.empty ? '–' : f1(r.hr.weight)}</td>
                      <td className="py-1.5 text-right">{r.slit.empty ? '–' : f1(r.slit.weight)}</td>
                      <td className="py-1.5 text-right font-semibold">{f1(r.totalWeight)}</td>
                      <td className="py-1.5 text-right">{r.avgAge ?? '–'}</td>
                      <td className={`py-1.5 text-right font-semibold ${COVER_TXT[r.cover.tone] || ''}`}>{r.cover.tone === 'none' ? '–' : r.cover.label}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-4 text-sm text-slate-500">Pick a coil on the left to see its Inward → Slit → Produced → Dispatched trace here.</p>
            </>
          )}
        </div>
      </div>
      {rest}
    </div>
  )
}

export function CoilTrackerPrototype({ variant, ...props }) {
  if (variant === 'B') return <VariantB {...props} />
  if (variant === 'C') return <VariantC {...props} />
  if (variant === 'D') return <VariantD {...props} />
  return null
}

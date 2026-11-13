import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useSupabaseStore, verifyLoginDetails } from './lib/db'
import {
  fmtT, fmtT3, genHRCoilId, nextCoilNumber, tolerance, periodRange, inDateRange,
  weightPerPieceFromSku, resolveProductionWeights, buildReconciliationRows, coilInventoryRow, coilTrackerView, stockByPlantCsv, coilThicknessGrid, coilThicknessCsv, AGE_BANDS, NO_DATE_BAND,
  coilFifoAllocate, coilConsumption,
  babyCoilFree, babyCoilIsStock, babyCoilStock,
  rmRollsFg, capAllocationRows, requiredStripWidth, WIDTH_TOL_MM, isOpenOrderStatus, skuInventoryRows, skuSizeLabel,
  canonicalSkuKey, salesKpis, salesByDistributor, salesByMonth,
  salesSizeLines, salesSizePivot, salesGridOptions, filterSalesLines, salesGridCellKey, SALES_GRID_REQUIRED, SALES_GRID_STOCK, SALES_GRID_SALES, SALES_GRID_MEASURES, SALES_GRID_AGEING,
  shippedByOrderLine, orderLineInvoiced, orderLineStage, distributorCode, toISODate,
  DISTRIBUTOR_HEADER_ALIASES, buildInvoiceDispatches, dispatchLinesOutsideWindow,
  resolveShipToState, REGIONS, UNMAPPED_REGION, normStateName,
  UNATTRIBUTED_PLANT, plantLabel, dispatchPlantLabel, plantForErpRow, erpRowPicker,
  coilInwardPlants, DEFAULT_COIL_PLANT, babyCoilPlant, productionPlant, crossPlantAllocationRows,
  normalizeProductionPoNo, productionPoOptions,
  ALL_PLANTS, PLANTS, plantFilterOptions, filterByPlant, filterDispatchesByPlant,
  plantMaster, plantsServingRegion, filterByPlants, filterDispatchesByPlants,
  accessFor, parseStoredSession,
  plantTrackerGrid, trackerDayLabel, trackerCellBlank, dataMonthKeys,
  dispatchOverview, inventoryOverview, sumGridRows,
  inventoryRegionStock, inventoryNeedsLook, INVENTORY_STATUS_WORD, INVENTORY_ALL_REGIONS, INVENTORY_NEEDS_LOOK_MT, servedRegions,
  planningMasterView, planningStockLabel, PLANNING_SECTIONS, planningRowSave, planningRowAdd,
  planningCampaignView, planningCampaignMonths, planningCell, planningCampaignSave,
  planningCampaignFinalise, planningAssignLabel, PLANNING_REASON_PROBLEM,
  planningCampaignShown, PLANNING_CAMPAIGN_FILTERS,
  planningWeekPlanView, planningWeekSave, coilOnHand,
} from './lib/calc'
import { loadChunk } from './lib/chunk'
import DEFAULT_SKUS from './data/skus'
import DEFAULT_STATE_REGIONS from './data/stateRegions'
// Seed data imports kept for reference — all arrays are now empty
// import { SEED_COILS, SEED_BABY_COILS, SEED_TUBES, SEED_BUNDLES, SEED_DISPATCHES } from './data/seedData'

// ═══════════════════════════════════════════════════════════════
// LOCAL STORAGE (only for preferences — dark mode, seed flag)
// ═══════════════════════════════════════════════════════════════
const LS = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null } catch { return null } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)) },
  del(k) { localStorage.removeItem(k) },
}

// ═══════════════════════════════════════════════════════════════
// CONSTANTS
// ═══════════════════════════════════════════════════════════════
// MT below which a negative inventory is rounding noise, not a real over-dispatch. Shared by the
// FG card's unmatched-dispatch count and the over-dispatch alert so the two always agree.
const EPS_MT = 0.05
const CARD_COLORS = {
  indigo: 'text-indigo-600 dark:text-indigo-400',
  cyan: 'text-cyan-600 dark:text-cyan-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
  rose: 'text-rose-600 dark:text-rose-400',
}
// Dot fills for a Card's `parts` breakdown (matches CARD_COLORS above).
const DOT_COLORS = {
  indigo: 'bg-indigo-500',
  cyan: 'bg-cyan-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════
// One Plant column for every table whose rows store a plant id directly — Coil Inward, Slitting,
// Production (#120) and Orders (#118). Dispatch needs its own: plant lives on its ENTRIES, so it
// reads through dispatchPlantLabel instead.
const PLANT_COLUMN = { label: 'Plant', value: r => plantLabel(r.plant) }

// A scoped export must carry its scope IN THE FILE — the rule `docs/DATA-MODEL.md` ("Scoped
// exports") already states and the Reports workbooks already follow via `opts.fileSuffix`. A CSV is
// read away from the screen that scoped it, so `coil-inward-2026-08-21.csv` holding only NPMD's
// rows and saying so nowhere carries the screen's authority and none of its caveats. The rows
// themselves are covered — every stage export has a Plant column — so the gap is the file NAME.
//
// Empty under All Plants, so the unscoped file name never moves. `ALL_PLANTS` is checked FIRST
// because it is not a plant id: `plantLabel` would resolve it to Unattributed and suffix the one
// file that must stay bare.
function plantFileSuffix(plant) {
  if (plant === ALL_PLANTS) return ''
  return `-${plantLabel(plant).toLowerCase().replace(/[^a-z0-9]+/g, '-')}`
}

const today = () => new Date().toISOString().split('T')[0]
const uid = () => crypto.randomUUID()
// Baby-coil suffix letter: 0→A, 1→B, … (Slitting fills gaps so freed letters reuse).
const genBabyLetter = (index) => String.fromCharCode(65 + index)

function downloadCSV(filename, header, rows) {
  const esc = (v) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [header.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ═══════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════
const Badge = ({ ok, text }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${ok ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
    {ok ? '✔' : '⚠'} {text}
  </span>
)

const Field = ({ label, children, auto, warn, helper }) => (
  <div>
    <label className={`block text-xs font-medium mb-1 ${auto ? 'text-green-700 dark:text-green-400' : warn ? 'text-yellow-700 dark:text-yellow-400' : 'text-blue-700 dark:text-blue-400'}`}>
      {auto ? '● ' : warn ? '▲ ' : '○ '}{label}
    </label>
    {children}
    {helper && <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{helper}</p>}
  </div>
)

const Input = ({ value, onChange, type = 'text', disabled, className = '', ...rest }) => (
  <input
    type={type} value={value ?? ''} onChange={e => onChange?.(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
    disabled={disabled}
    className={`w-full px-3 py-2 rounded-md border text-sm dark:text-slate-100 ${disabled ? 'field-auto cursor-not-allowed' : 'field-manual'} focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none ${className}`}
    {...rest}
  />
)

const Select = ({ value, onChange, options, placeholder = 'Select...', disabled }) => (
  <select
    value={value ?? ''} onChange={e => onChange(e.target.value)} disabled={disabled}
    className={`w-full px-3 py-2 rounded-md border text-sm dark:text-slate-100 ${disabled ? 'field-auto cursor-not-allowed' : 'field-manual'} focus:ring-2 focus:ring-indigo-500 outline-none`}
  >
    <option value="">{placeholder}</option>
    {options.map(o => typeof o === 'string' ? <option key={o} value={o}>{o}</option> : <option key={o.value} value={o.value}>{o.label}</option>)}
  </select>
)

// Searchable, drop-in replacement for <Select>: same { value, onChange, options, placeholder,
// disabled } contract. Type to filter options by label (case-insensitive); click to pick.
const SearchSelect = ({ value, onChange, options, placeholder = 'Search...', disabled }) => {
  const opts = useMemo(() => options.map(o => typeof o === 'string' ? { value: o, label: o } : o), [options])
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0) // keyboard-highlighted option
  const ref = useRef(null)
  const selected = opts.find(o => o.value === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? opts.filter(o => String(o.label).toLowerCase().includes(q)) : opts
  }, [opts, query])
  // Reset the highlight whenever the list of candidates changes.
  useEffect(() => { setActiveIdx(0) }, [query, open])
  const choose = (o) => { if (o) onChange(o.value); setOpen(false); setQuery('') }
  // Conservative blur-commit: only when the typed text EXACTLY matches one option's label
  // (case-insensitive). Prevents surprise-selecting a partial query when clicking away.
  const commitExact = () => {
    const q = query.trim().toLowerCase()
    if (!q) return
    const exact = opts.find(o => String(o.label).toLowerCase() === q)
    if (exact) onChange(exact.value)
  }
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) { commitExact(); setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open, query, opts]) // eslint-disable-line react-hooks/exhaustive-deps
  const onKeyDown = (e) => {
    if (disabled) return
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!open) setOpen(true); setActiveIdx(i => Math.min(i + 1, filtered.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    else if (e.key === 'Enter') { if (open && filtered.length) { e.preventDefault(); choose(filtered[activeIdx] || filtered[0]) } }
    else if (e.key === 'Escape') { setOpen(false); setQuery('') }
  }
  return (
    <div className="relative" ref={ref}>
      <input
        type="text" disabled={disabled}
        value={open ? query : (selected?.label ?? (value ? String(value) : ''))}
        placeholder={selected?.label || placeholder}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => !disabled && setOpen(true)}
        onKeyDown={onKeyDown}
        className={`w-full px-3 py-2 rounded-md border text-sm dark:text-slate-100 ${disabled ? 'field-auto cursor-not-allowed' : 'field-manual'} focus:ring-2 focus:ring-indigo-500 outline-none`}
      />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg">
          {filtered.length === 0
            ? <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
            : filtered.map((o, idx) => (
              <button
                type="button" key={o.value} onMouseDown={e => e.preventDefault()} onClick={() => choose(o)}
                onMouseEnter={() => setActiveIdx(idx)}
                className={`block w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-700 ${idx === activeIdx ? 'bg-indigo-50 dark:bg-slate-700' : ''} ${o.value === value ? 'font-medium' : ''}`}
              >{o.label}</button>
            ))}
        </div>
      )}
    </div>
  )
}

const Btn = ({ children, onClick, variant = 'primary', size = 'md', disabled, className = '' }) => {
  const base = 'inline-flex items-center justify-center font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2'
  const vars = {
    primary: 'bg-indigo-600 hover:bg-indigo-700 text-white focus:ring-indigo-500',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500',
    danger: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
    ghost: 'bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-slate-200 focus:ring-slate-500',
  }
  const sizes = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-6 py-3 text-base' }
  return <button onClick={onClick} disabled={disabled} className={`${base} ${vars[variant]} ${sizes[size]} ${disabled ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}>{children}</button>
}

// `parts` (optional) = [{ label, value, color }] renders a small breakdown list under the value —
// e.g. "Pending to Dispatch" split into its Confirmed + Non-confirmed components.
const Card = ({ title, value, sub, color = 'indigo', parts = null }) => (
  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
    <p className={`mt-1 text-2xl font-semibold ${CARD_COLORS[color] || CARD_COLORS.indigo}`}>{value}</p>
    {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
    {parts && parts.length > 0 && (
      <div className="mt-2 space-y-1 border-t border-slate-100 dark:border-slate-700 pt-2">
        {parts.map((p, i) => (
          <div key={i} className="flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              <span className={`inline-block w-2 h-2 rounded-full ${DOT_COLORS[p.color] || 'bg-slate-400'}`} />
              {p.label}
            </span>
            <span className={`font-medium ${CARD_COLORS[p.color] || 'text-slate-600 dark:text-slate-300'}`}>{p.value}</span>
          </div>
        ))}
      </div>
    )}
  </div>
)

const SearchInput = ({ value, onChange, placeholder = 'Search...', className = 'w-64' }) => (
  <input
    type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
    className={`px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none ${className}`}
  />
)

// Multi-value filter dropdown (tick several options at once). `selected` is an array;
// an empty array means "All". Used by DataTable's `filters`. Closes on outside click.
const MultiSelectFilter = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const btn = useRef(null)
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const toggle = (o) => onChange(selected.includes(o) ? selected.filter(x => x !== o) : [...selected, o])
  const summary = selected.length === 0 ? `${label}: All` : `${label}: ${selected.length} selected`
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(o => !o)}
        className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 flex items-center gap-1 whitespace-nowrap">
        {summary} <span className="text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute z-30 mt-1 max-h-60 overflow-auto rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg min-w-[12rem]">
          {selected.length > 0 && (
            <button type="button" onClick={() => onChange([])}
              className="block w-full text-left px-3 py-2 text-xs font-medium text-indigo-600 dark:text-indigo-400 border-b border-slate-200 dark:border-slate-700">Clear</button>
          )}
          {options.length === 0
            ? <div className="px-3 py-2 text-sm text-slate-400">No options</div>
            : options.map(o => (
              <label key={o} className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-700 cursor-pointer">
                <input type="checkbox" checked={selected.includes(o)} onChange={() => toggle(o)} className="rounded" />
                {o}
              </label>
            ))}
        </div>
      )}
    </div>
  )
}

const Section = ({ title, children, actions }) => (
  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <div className="flex gap-2">{actions}</div>
    </div>
    <div className="p-6">{children}</div>
  </div>
)

function DataTable({ columns, data, actions, onEdit, onDelete, onRowClick, highlightRow, highlightClass = 'bg-indigo-50 dark:bg-indigo-900/20', totalsLabel, filters, excel, maxHeight, selectable, bulkActions, exportRef }) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [filterVals, setFilterVals] = useState({}) // { [filterKey]: string[] } — multi-value, empty = all
  const [colSearch, setColSearch] = useState({}) // per-column text filter, keyed by column index
  const [selectedIds, setSelectedIds] = useState(() => new Set()) // row ids ticked for bulk actions

  const filtered = useMemo(() => {
    let rows = data.filter(r => !r.deleted)
    ;(filters || []).forEach(f => {
      const sel = filterVals[f.key] || []
      if (sel.length) rows = rows.filter(r => sel.includes(String(f.accessor(r) ?? '')))
    })
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => columns.some(c => String(c.value ? c.value(r) : r[c.key] ?? '').toLowerCase().includes(q)))
    }
    columns.forEach((c, i) => {
      const q = (colSearch[i] || '').trim().toLowerCase()
      if (q) rows = rows.filter(r => String(c.value ? c.value(r) : r[c.key] ?? '').toLowerCase().includes(q))
    })
    if (sortCol != null) {
      const c = columns[sortCol]
      rows = [...rows].sort((a, b) => {
        const av = c.value ? c.value(a) : a[c.key], bv = c.value ? c.value(b) : b[c.key]
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [data, search, sortCol, sortDir, columns, filters, filterVals, colSearch])

  // Surface the live filtered/searched/sorted rows to an optional caller ref, so a parent's CSV export
  // can download exactly what's on screen. Writing a ref never triggers a re-render, so this stays
  // loop-safe even though callers recreate `columns`/`filters` inline each render.
  useEffect(() => { if (exportRef) exportRef.current = filtered }, [filtered, exportRef])

  // Dropdown filter options — explicit if provided, else unique accessor values.
  const filterOptions = useMemo(() => (filters || []).map(f =>
    f.options || [...new Set(data.filter(r => !r.deleted)
      .map(r => String(f.accessor(r) ?? '')).filter(Boolean))].sort()), [filters, data])

  // Totals row — per-column sums over the filtered rows (columns opting in via `total`).
  // A column may supply `totalValue(r)` to transform its value FOR THE TOTAL ONLY (e.g. floor a
  // negative at 0) without affecting the per-row `value` used for sort/filter/search/render.
  const hasTotals = columns.some(c => c.total)
  const totals = useMemo(() => columns.map(c => c.total
    ? filtered.reduce((s, r) => s + Number((c.totalValue ? c.totalValue(r) : c.value ? c.value(r) : r[c.key]) || 0), 0)
    : null), [filtered, columns])

  // Row multi-select (opt-in via `selectable`). Selection is keyed by row id and survives
  // filter changes; select-all toggles only the currently filtered rows.
  const allFilteredSelected = selectable && filtered.length > 0 && filtered.every(r => selectedIds.has(r.id))
  const toggleAll = () => setSelectedIds(prev => {
    const next = new Set(prev)
    if (filtered.every(r => next.has(r.id))) filtered.forEach(r => next.delete(r.id))
    else filtered.forEach(r => next.add(r.id))
    return next
  })
  const toggleOne = (id) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const clearSelection = () => setSelectedIds(new Set())
  const selectedRows = data.filter(r => !r.deleted && selectedIds.has(r.id))
  const leadCol = selectable ? 1 : 0

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} />
        {(filters || []).map((f, i) => (
          <MultiSelectFilter key={f.key} label={f.label} options={filterOptions[i]}
            selected={filterVals[f.key] || []}
            onChange={vals => setFilterVals(v => ({ ...v, [f.key]: vals }))} />
        ))}
      </div>
      {selectable && selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2">
          <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">{selectedIds.size} selected</span>
          {(bulkActions || []).map((ba, i) => (
            <Btn key={i} size="sm" variant={ba.variant || 'ghost'} onClick={() => { ba.onClick(selectedRows); clearSelection() }}>{ba.label}</Btn>
          ))}
          <Btn size="sm" variant="ghost" onClick={clearSelection}>Clear</Btn>
        </div>
      )}
      <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"
        style={maxHeight ? { maxHeight } : undefined}>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {selectable && (
                <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700 px-3 py-3 border-b border-slate-200 dark:border-slate-600">
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll} aria-label="Select all rows" className="rounded" />
                </th>
              )}
              {columns.map((c, i) => (
                <th key={i} className={`sticky top-0 z-10 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap border-b border-slate-200 dark:border-slate-600 ${excel ? 'border-r last:border-r-0' : ''}`}
                  onClick={() => { setSortCol(i); setSortDir(sortCol === i && sortDir === 'asc' ? 'desc' : 'asc') }}>
                  {c.label} {sortCol === i ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
              {(onEdit || onDelete) && <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-xs font-medium text-slate-500 uppercase border-b border-slate-200 dark:border-slate-600">Actions</th>}
            </tr>
            <tr className="bg-slate-50 dark:bg-slate-700">
              {selectable && <th className="px-3 pb-2" />}
              {columns.map((c, i) => (
                <th key={i} className="px-3 pb-2 align-top">
                  {(c.key || c.value) && (
                    <input type="text" value={colSearch[i] || ''} placeholder="Filter…"
                      onClick={e => e.stopPropagation()}
                      onChange={e => setColSearch(s => ({ ...s, [i]: e.target.value }))}
                      className="w-full px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-xs font-normal normal-case bg-white dark:bg-slate-800 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none" />
                  )}
                </th>
              ))}
              {(onEdit || onDelete) && <th className="px-3 pb-2" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length + 1 + leadCol} className="px-4 py-8 text-center text-slate-400">No records found</td></tr>
            )}
            {hasTotals && filtered.length > 0 && (
              <tr className="bg-slate-100 dark:bg-slate-700/50 font-semibold text-slate-900 dark:text-slate-100">
                {selectable && <td className="px-3 py-3" />}
                {columns.map((c, i) => (
                  <td key={i} className={`px-4 py-3 whitespace-nowrap ${excel ? 'border-r last:border-r-0 border-slate-200 dark:border-slate-700' : ''}`}>
                    {c.total ? c.total(totals[i]) : (i === 0 ? (totalsLabel || 'TOTAL') : '')}
                  </td>
                ))}
                {(onEdit || onDelete) && <td className="px-4 py-3" />}
              </tr>
            )}
            {filtered.map((row, ri) => {
              const highlighted = highlightRow && highlightRow(row)
              const striped = excel && !highlighted && ri % 2 === 1
              return (
              <tr key={row.id || ri}
                className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${onRowClick ? 'cursor-pointer' : ''} ${highlighted ? highlightClass : striped ? 'bg-slate-50/60 dark:bg-slate-800/40' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {selectable && (
                  <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleOne(row.id)} aria-label="Select row" className="rounded" />
                  </td>
                )}
                {columns.map((c, ci) => (
                  <td key={ci} className={`px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300 ${excel ? 'border-r last:border-r-0 border-slate-200 dark:border-slate-700' : ''}`}>
                    {c.render ? c.render(row) : c.value ? c.value(row) : row[c.key] ?? '—'}
                  </td>
                ))}
                {(onEdit || onDelete) && (
                  <td className="px-4 py-3 whitespace-nowrap flex gap-1">
                    {onEdit && <Btn size="sm" variant="ghost" onClick={() => onEdit(row)}>Edit</Btn>}
                    {onDelete && <Btn size="sm" variant="danger" onClick={() => onDelete(row)}>Del</Btn>}
                  </td>
                )}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</p>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 1: COIL INWARD
// ═══════════════════════════════════════════════════════════════
// `operatingPlant` (ticket #126) pins the plant a NEW coil is registered against. Non-null only for
// a plant user, whose plant comes from their login: they are standing in one plant, so the plant of
// a coil arriving there is not a question to put to them. An admin passes null and keeps the picker.
// It changes only what is OFFERED — the stored value and the "set once at inward" rule below are
// untouched, and an edit still shows the plant already recorded.
// `viewPlant` (ticket #126) scopes what this screen SHOWS. Everything else — the duplicate-id
// check, the next coil number, and the delete guards — deliberately keeps reading the full `coils`,
// `babyCoils` and `productions`: a guard that cannot see the whole register is not a guard. The
// sharpest case is a legacy row whose plant is blank, since `genHRCoilId` gives it an `HYD-` id, so
// it is precisely what a new Hyderabad coil would collide with and precisely what a scoped array
// would have hidden.
function CoilInward({ coils, setCoils, dispatches, productions, babyCoils, operatingPlant = null, viewPlant = ALL_PLANTS }) {
  // What the plant picker STARTS on for a new coil. This is a PRE-SELECTION in a live control, not
  // the scope writing state: the operator can change it, and `save` still records whatever they
  // leave. Three cases, and the third is the one a two-branch version got wrong:
  //
  //   All Plants   → DEFAULT_COIL_PLANT. The unscoped path is unchanged and still one click.
  //   Any plant that can register a coil → that plant. All four can, since #156. Scoped to NPMD,
  //                  the coil being added is almost certainly NPMD's, and defaulting to Hyderabad
  //                  saves a row that vanishes from the very table it was added to.
  //   Unattributed → BLANK. It cannot register coils (`coilInwardPlants`), so there is no honest
  //                  default and guessing Hyderabad recreates the vanishing row this exists to
  //                  prevent. `save` is already blocked while a new coil has no plant, so a blank
  //                  asks the question instead of answering it wrongly. Read this branch off
  //                  `coilInwardPlants()`, never off a list of plant names: it was Lepakshi and
  //                  Tapi that landed here until #156 activated them, and Unattributed — the
  //                  labelling gap, not a plant — is the one scope that can never leave it.
  const scopeDefault = viewPlant === ALL_PLANTS ? DEFAULT_COIL_PLANT
    : coilInwardPlants().some(p => p.id === viewPlant) ? viewPlant
    : ''
  const emptyForm = { dateOfInward: today(), plant: operatingPlant || scopeDefault, hrCoilNo: '', inputCoilNumber: '', coilGrade: '', heatNumber: '', thickness: '', width: '', length: '', invoiceWeight: '', actualWeight: '', poNumber: '' }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // The pre-selection only reached the form through `setForm(emptyForm)`, so moving the header
  // selector while the form was already open left the previous plant selected — the stalest
  // possible answer, on the one field that cannot be corrected after save. Re-seed on a scope
  // change instead. NEW coils only: an edit shows the plant already recorded, which the scope may
  // not touch (CLAUDE.md — plant is set once, at inward).
  useEffect(() => {
    if (editId) return
    setForm(p => ({ ...p, plant: operatingPlant || scopeDefault }))
  }, [scopeDefault, operatingPlant, editId])

  const nextNo = useMemo(() => nextCoilNumber(coils, form.plant), [coils, form.plant])

  const hrCoilId = useMemo(() => {
    const n = editId ? form.hrCoilNo : (form.hrCoilNo || nextNo)
    return form.dateOfInward && n ? genHRCoilId(form.dateOfInward, n, form.plant) : ''
  }, [form.dateOfInward, form.hrCoilNo, nextNo, editId, form.plant])

  const isDupe = useMemo(() => coils.some(c => c.hrCoilId === hrCoilId && c.id !== editId), [coils, hrCoilId, editId])

  // The register as this user sees it. Display only — never fed to a guard or a setter.
  const shownCoils = useMemo(() => filterByPlant(coils, viewPlant), [coils, viewPlant])

  const save = () => {
    const no = form.hrCoilNo || nextNo
    // Plant is set ONCE, here, and is not editable afterwards — a coil does not move plant because
    // someone re-opened the form. An edit therefore carries the stored value straight through,
    // blank included (a coil registered before ticket #120 whose row was never backfilled). A NEW
    // coil takes what the operator picked, with no `|| DEFAULT_COIL_PLANT` fallback: registering
    // is where plant is RECORDED, so an empty pick blocks the save rather than quietly becoming
    // Hyderabad. `emptyForm` pre-selects the default, so the ordinary path is still one click.
    const plant = editId ? (form.plant || '') : form.plant
    const record = { ...form, plant, hrCoilNo: no, hrCoilId: genHRCoilId(form.dateOfInward, no, plant), id: editId || uid(), deleted: false }
    if (editId) {
      setCoils(prev => prev.map(c => c.id === editId ? record : c))
    } else {
      setCoils(prev => [...prev, record])
    }
    setForm(emptyForm); setEditId(null); setShowForm(false)
  }

  const startEdit = (row) => {
    setForm({ ...row }); setEditId(row.id); setShowForm(true)
  }

  const softDelete = (row) => {
    const slitInto = (babyCoils || []).filter(b => !b.deleted && b.hrCoilId === row.hrCoilId)
    if (slitInto.length) {
      alert(`Cannot delete ${row.hrCoilId}: it has been slit into ${slitInto.length} slit coil(s). Delete those slit coils first.`)
      return
    }
    const usedBy = (productions || []).filter(p => !p.deleted && (p.coilAllocations || []).some(a => a.hrCoilId === row.hrCoilId))
    if (usedBy.length) {
      alert(`Cannot delete ${row.hrCoilId}: ${usedBy.length} production record(s) have drawn from it. Remove those productions first.`)
      return
    }
    if (confirm('Delete this coil record?')) setCoils(prev => prev.filter(c => c.id !== row.id))
  }

  // Cross-stage calculations — dispatched weight traced directly to this mother coil
  const getCoilStats = useCallback((coil) => {
    const dispatchedWt = dispatches.filter(d => !d.deleted).flatMap(d => d.bundleEntries || [])
      .filter(be => be.traceHrCoilId === coil.hrCoilId)
      .reduce((s, be) => s + Number(be.weight || 0), 0)
    return { dispatchedWt }
  }, [dispatches])

  const columns = [
    { label: 'HR Coil ID', key: 'hrCoilId' },
    { label: 'Date', key: 'dateOfInward' },
    PLANT_COLUMN,
    { label: 'Input Coil #', key: 'inputCoilNumber' },
    { label: 'Grade', key: 'coilGrade' },
    { label: 'Thick (mm)', key: 'thickness' },
    { label: 'Width (mm)', key: 'width' },
    { label: 'Invoice Wt (T)', value: r => fmtT3(r.invoiceWeight) },
    { label: 'Actual Wt (T)', value: r => fmtT3(r.actualWeight) },
    { label: 'Dispatched Wt (T)', value: r => { const s = getCoilStats(r); return s.dispatchedWt > 0 ? fmtT3(s.dispatchedWt) : '' }, render: r => { const s = getCoilStats(r); return s.dispatchedWt > 0 ? <span>{fmtT3(s.dispatchedWt)}</span> : <span className="text-slate-400">—</span> } },
  ]

  const downloadCoilsCSV = () => {
    const header = ['HR Coil ID', 'Date', 'Plant', 'Input Coil #', 'Grade', 'Thickness (mm)', 'Width (mm)', 'Invoice Wt (T)', 'Actual Wt (T)', 'Dispatched Wt (T)']
    downloadCSV(`coil-inward-${today()}${plantFileSuffix(viewPlant)}.csv`, header, shownCoils.filter(c => !c.deleted).map(r => {
      const s = getCoilStats(r)
      return [r.hrCoilId, r.dateOfInward, plantLabel(r.plant), r.inputCoilNumber, r.coilGrade, r.thickness, r.width, fmtT3(r.invoiceWeight), fmtT3(r.actualWeight), fmtT3(s.dispatchedWt)]
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 1: Coil Inward</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={downloadCoilsCSV} disabled={shownCoils.filter(c => !c.deleted).length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ Add Coil'}</Btn>
        </div>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Coil' : 'Register New HR Coil'}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date of Inward"><Input type="date" value={form.dateOfInward} onChange={v => f('dateOfInward', v)} /></Field>
            {/* Set once, at inward. On edit it is a read-only label, NOT a disabled select — a
                select would have to fall back to some option, and for a coil registered before
                ticket #120 and never backfilled that fallback would show Hyderabad over a row
                that stores blank. The label reads what is actually there: Unattributed. */}
            <Field label="Plant" auto={!!editId || !!operatingPlant}
              helper={editId ? 'Set at inward — not editable' : operatingPlant ? 'Your plant' : 'Where this coil physically sits'}>
              {editId || operatingPlant
                ? <Input value={plantLabel(editId ? form.plant : operatingPlant)} disabled />
                : <Select value={form.plant} onChange={v => f('plant', v)}
                    options={coilInwardPlants().map(p => ({ value: p.id, label: p.name }))} placeholder="Select plant..." />}
            </Field>
            <Field label="HR Coil No."><Input type="number" value={form.hrCoilNo || nextNo} onChange={v => f('hrCoilNo', v)} placeholder={String(nextNo)} /></Field>
            <Field label="HR Coil ID" auto><Input value={hrCoilId} disabled /></Field>
            {isDupe && <div className="col-span-1 flex items-end"><Badge ok={false} text="Duplicate ID!" /></div>}
            <Field label="Input Coil Number (Batch ID)"><Input value={form.inputCoilNumber} onChange={v => f('inputCoilNumber', v)} /></Field>
            <Field label="Coil Grade"><Input value={form.coilGrade} onChange={v => f('coilGrade', v)} placeholder="e.g. E250-BR" /></Field>
            <Field label="Heat Number"><Input value={form.heatNumber} onChange={v => f('heatNumber', v)} /></Field>
            <Field label="Thickness (mm)"><Input type="number" value={form.thickness} onChange={v => f('thickness', v)} step="0.1" /></Field>
            <Field label="Width (mm)"><Input type="number" value={form.width} onChange={v => f('width', v)} /></Field>
            <Field label="Length (mm)"><Input type="number" value={form.length} onChange={v => f('length', v)} placeholder="Optional" /></Field>
            <Field label="Invoice Weight (T)" helper="Weight as per supplier invoice"><Input type="number" value={form.invoiceWeight} onChange={v => f('invoiceWeight', v)} step="0.001" /></Field>
            <Field label="Actual Weight (T)" helper="Weight measured at plant"><Input type="number" value={form.actualWeight} onChange={v => f('actualWeight', v)} step="0.001" /></Field>
            <Field label="PO Number"><Input value={form.poNumber} onChange={v => f('poNumber', v)} /></Field>
          </div>
          <div className="mt-4 flex gap-2">
            {/* A new coil must carry a plant; an EXISTING one must not be held hostage to one it
                never had, or a pre-#120 row could never be edited again. */}
            <Btn onClick={save} disabled={!hrCoilId || isDupe || (!editId && !form.plant)} variant="success">{editId ? 'Update' : 'Save Coil'}</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Registered Coils">
        <DataTable columns={columns} data={shownCoils} onEdit={startEdit} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 2: SLITTING — mother coil → baby coils (manual; proportional weight/cost by width)
// ═══════════════════════════════════════════════════════════════
// `viewPlant` (ticket #126) scopes the mother-coil picker and the baby-coil table. It must NOT
// reach `babyCoils` itself: `save` builds its next array from that prop and calls `setBabyCoils`
// with the whole thing, so a filtered prop would make every row it could not see look deleted —
// and `baby_coils` is hard-deleted. Same for `productions`, which answers "has any production
// consumed this baby coil" and has to mean *any*.
function Slitting({ coils, babyCoils, setBabyCoils, productions, viewPlant = ALL_PLANTS }) {
  const emptyForm = { dateOfConversion: today(), hrCoilId: '' }
  const [form, setForm] = useState(emptyForm)
  // Multiple baby-coil rows entered against one mother coil, saved together. Each row carries a
  // stable _rid (mirrors Production) so inputs track the right row as rows are added/removed.
  const [rows, setRows] = useState([{ _rid: uid(), width: '', length: '' }])
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [babySearch, setBabySearch] = useState('') // dedicated Baby Coil ID table search
  const [dateFilter, setDateFilter] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  // Row helpers — widths are decimals, so (unlike Production's piece counts) no Math.floor.
  const baseRows = () => rows.map(r => ({ _rid: r._rid || uid(), width: r.width, length: r.length }))
  const setRow = (i, key, val) => { const next = baseRows(); next[i] = { ...next[i], [key]: val }; setRows(next) }
  const addRow = () => setRows([...baseRows(), { _rid: uid(), width: '', length: '' }])
  const removeRow = (i) => { const next = baseRows().filter((_, j) => j !== i); setRows(next.length ? next : [{ _rid: uid(), width: '', length: '' }]) }

  const parentCoil = useMemo(() => coils.find(c => !c.deleted && c.hrCoilId === form.hrCoilId), [coils, form.hrCoilId])
  const siblingsOfParent = useMemo(() => babyCoils.filter(b => !b.deleted && b.hrCoilId === form.hrCoilId && b.id !== editId), [babyCoils, form.hrCoilId, editId])
  // Assign `count` distinct unused letters (A, B, C…) at once — fills gaps left by deleted
  // siblings and never collides among the freshly-added rows. (Editing keeps the row's own letter.)
  const assignLetters = useCallback((count) => {
    const used = new Set(siblingsOfParent.map(b => b.babyCoilEntry))
    const out = []
    let i = 0
    while (out.length < count) { const L = genBabyLetter(i++); if (!used.has(L)) { used.add(L); out.push(L) } }
    return out
  }, [siblingsOfParent])

  // Width cap: slit widths should fit within (mother width − 5 mm); mother width is the nominal cap.
  // Target  → sum ≤ mother − 5  (green)
  // Warning → mother − 5 < sum ≤ mother  (yellow, still saveable)
  // Over    → sum > mother  (red, still saveable — flagged for verification, never blocks)
  const widthStatus = (sum, motherWidth) => {
    if (!motherWidth || !sum) return null
    const effective = motherWidth - 5
    const tier = sum <= effective ? 'ok' : sum <= motherWidth ? 'warn' : 'over'
    return { tier, sum, motherWidth, effective, label: `${sum.toFixed(1)} / ${effective.toFixed(1)} mm (cap: ${motherWidth.toFixed(1)} mm)` }
  }

  // Proportionate weight: width sum spans existing siblings + ALL in-progress rows.
  const sumBabyWidths = useMemo(() =>
    siblingsOfParent.reduce((s, b) => s + Number(b.width || 0), 0) + rows.reduce((s, r) => s + Number(r.width || 0), 0),
  [siblingsOfParent, rows])
  // Per-row derived fields: auto letter, baby coil id, and width-proportional weight (live preview).
  const enrichedRows = useMemo(() => {
    const letters = assignLetters(rows.length)
    const motherW = Number(parentCoil?.actualWeight || 0)
    return rows.map((r, i) => {
      const letter = editId ? form.babyCoilEntry : letters[i]
      const width = Number(r.width || 0)
      const babyCoilId = form.hrCoilId && letter ? `${form.hrCoilId}-${letter}` : ''
      const weight = parentCoil && width > 0 && sumBabyWidths > 0 ? (width / sumBabyWidths) * motherW : 0
      return { _rid: r._rid, width: r.width, length: r.length, letter, babyCoilId, weight }
    })
  }, [rows, parentCoil, sumBabyWidths, editId, form.babyCoilEntry, form.hrCoilId, assignLetters])
  const widthCheck = parentCoil ? widthStatus(sumBabyWidths, Number(parentCoil.width)) : null
  // Validation across every row. Width-over-mother only WARNS (never blocks) — matches prior behavior.
  const validRows = enrichedRows.filter(r => Number(r.width || 0) > 0)
  const newIds = enrichedRows.map(r => r.babyCoilId).filter(Boolean)
  const dupeInForm = new Set(newIds).size !== newIds.length
  const dupeInDb = enrichedRows.some(r => r.babyCoilId && babyCoils.some(b => !b.deleted && b.babyCoilId === r.babyCoilId && b.id !== editId))
  const overLetterLimit = (siblingsOfParent.length + rows.length) > 26 // letters run A–Z only
  const isDupe = dupeInForm || dupeInDb

  const resetForm = () => { setForm(emptyForm); setRows([{ _rid: uid(), width: '', length: '' }]); setEditId(null); setShowForm(false) }

  const save = () => {
    const motherW = Number(parentCoil?.actualWeight || 0)
    let updated
    if (editId) {
      // Edit: update the single baby coil in place — keep its original id & letter (built from
      // explicit fields, never spreading _rid into the persisted record).
      const r = enrichedRows[0]
      const record = {
        id: editId, babyCoilEntry: form.babyCoilEntry, babyCoilId: r.babyCoilId,
        width: r.width, length: r.length,
        thickness: parentCoil?.thickness, poNumber: parentCoil?.poNumber,
        // Plant is the mother's, re-read here rather than carried forward from the stored row —
        // so an edit can never move a baby coil to a plant its mother is not in.
        plant: babyCoilPlant(parentCoil),
        weight: r.weight, hrCoilId: form.hrCoilId, dateOfConversion: form.dateOfConversion,
        // `consumed` is retired (ADR-0015) — nothing reads it. The stored value is carried as it
        // stands rather than rewritten, so an edit changes only what the operator edited.
        consumed: !!babyCoils.find(b => b.id === editId)?.consumed, deleted: false,
      }
      updated = babyCoils.map(b => b.id === editId ? record : b)
    } else {
      // Multi-add: one baby_coil record per valid row, all appended and saved together (the data
      // layer batches them into a single Supabase upsert).
      const newRecords = validRows.map(r => ({
        id: uid(), babyCoilEntry: r.letter, babyCoilId: r.babyCoilId,
        width: r.width, length: r.length,
        thickness: parentCoil?.thickness, poNumber: parentCoil?.poNumber,
        plant: babyCoilPlant(parentCoil),
        weight: r.weight, hrCoilId: form.hrCoilId, dateOfConversion: form.dateOfConversion,
        consumed: false, deleted: false,
      }))
      updated = [...babyCoils, ...newRecords]
    }
    // Authoritative recalc: re-split every sibling of this mother proportionally by width (the
    // freshly-added rows included), so persisted weights always reconcile to the mother weight.
    const parentBabies = updated.filter(b => !b.deleted && b.hrCoilId === form.hrCoilId)
    const newTotal = parentBabies.reduce((s, b) => s + Number(b.width || 0), 0)
    updated = updated.map(b => {
      if (!b.deleted && b.hrCoilId === form.hrCoilId && newTotal > 0) {
        return { ...b, weight: (Number(b.width) / newTotal) * motherW }
      }
      return b
    })
    setBabyCoils(updated)
    resetForm()
  }

  // Edit loads the one baby coil into a single row; its letter is stashed on the form and reused.
  const startEdit = (row) => {
    setForm({ dateOfConversion: row.dateOfConversion, hrCoilId: row.hrCoilId, babyCoilEntry: row.babyCoilEntry })
    setRows([{ _rid: uid(), width: row.width, length: row.length }])
    setEditId(row.id); setShowForm(true)
  }
  // Hard delete frees the baby_coil_id letter (e.g. A) so it can be reused. Blocked once a
  // production has FIFO-consumed this baby coil (remove those productions first).
  const softDelete = (row) => {
    const usedBy = (productions || []).filter(p => !p.deleted && (p.coilAllocations || []).some(a => a.babyCoilId === row.babyCoilId))
    if (usedBy.length) {
      alert(`Cannot delete ${row.babyCoilId}: ${usedBy.length} production record(s) have consumed it. Remove those productions first.`)
      return
    }
    if (confirm('Delete this slit coil?')) {
      const parent = coils.find(c => c.hrCoilId === row.hrCoilId)
      let updated = babyCoils.filter(b => b.id !== row.id)
      if (parent) {
        const remaining = updated.filter(b => !b.deleted && b.hrCoilId === row.hrCoilId)
        const total = remaining.reduce((s, b) => s + Number(b.width || 0), 0)
        updated = updated.map(b => {
          if (!b.deleted && b.hrCoilId === row.hrCoilId && total > 0) {
            return {
              ...b,
              weight: (Number(b.width) / total) * Number(parent.actualWeight || 0),
            }
          }
          return b
        })
      }
      setBabyCoils(updated)
    }
  }

  const coilOptions = useMemo(() => {
    // Scoped for display: a plant user is offered only their own plant's mothers. The eligibility
    // rules below are unchanged and still read the full `babyCoils`, so a mother's remaining width
    // is computed from every baby coil cut from it, not just the ones this user can see.
    return filterByPlant(coils, viewPlant).filter(c => {
      if (c.deleted) return false
      if (editId && c.hrCoilId === form.hrCoilId) return true
      const childWidths = babyCoils
        .filter(b => !b.deleted && b.hrCoilId === c.hrCoilId)
        .reduce((s, b) => s + Number(b.width || 0), 0)
      if (c.width && childWidths >= Number(c.width)) return false
      return true
    }).map(c => ({
      value: c.hrCoilId,
      label: `${c.hrCoilId} (W:${c.width}mm, ${fmtT3(c.actualWeight)}T)`
    }))
  }, [coils, babyCoils, editId, form.hrCoilId, viewPlant])

  // Group display: for each parent, show width sum check
  const parentGroups = useMemo(() => {
    const groups = {}
    babyCoils.filter(b => !b.deleted).forEach(b => {
      if (!groups[b.hrCoilId]) groups[b.hrCoilId] = { babies: [], parent: coils.find(c => c.hrCoilId === b.hrCoilId) }
      groups[b.hrCoilId].babies.push(b)
    })
    return groups
  }, [babyCoils, coils])

  const filteredBabyCoils = useMemo(() => {
    // `viewPlant` scopes what is LISTED, and it is applied ONCE, here, ahead of the date branch —
    // `babyCoils` itself stays whole for the writes and the guards above (see the note on this
    // component). It used to be applied inside the relative-cutoff branch only, so the two branches
    // that skip a cutoff — "All Time", which is the DEFAULT the tab opens on, and a custom range —
    // returned every plant's baby coils no matter who was looking. The scope belongs to the screen,
    // not to one of its date options.
    const visible = filterByPlant(babyCoils, viewPlant)
    if (dateFilter === 'all') return visible
    if (dateFilter === 'custom') {
      return visible.filter(b => {
        if (customFrom && b.dateOfConversion < customFrom) return false
        if (customTo && b.dateOfConversion > customTo) return false
        return true
      })
    }
    let cutoff
    if (dateFilter === 'today') cutoff = today()
    else if (dateFilter === 'week') {
      const now = new Date()
      const day = now.getDay()
      const diff = day === 0 ? 6 : day - 1 // Monday as start of week
      const monday = new Date(now)
      monday.setDate(now.getDate() - diff)
      cutoff = monday.toISOString().split('T')[0]
    } else if (dateFilter === 'month') {
      const now = new Date()
      cutoff = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    }
    return visible.filter(b => b.dateOfConversion >= cutoff)
  }, [babyCoils, dateFilter, customFrom, customTo, viewPlant])

  // Dedicated Baby Coil ID search, layered on top of the date filter (composes with DataTable's
  // own generic + per-column search, which run on whatever `data` we pass it).
  const displayedBabyCoils = useMemo(() => {
    const q = babySearch.trim().toLowerCase()
    return q ? filteredBabyCoils.filter(b => String(b.babyCoilId ?? '').toLowerCase().includes(q)) : filteredBabyCoils
  }, [filteredBabyCoils, babySearch])

  // Live consumption per baby coil (from production allocations) → % used for the table.
  const consumedByBaby = useMemo(() => coilConsumption(productions, null, 'babyCoilId'), [productions])
  const pctUsed = useCallback((b) => {
    const cap = Number(b.weight || 0)
    const used = consumedByBaby[b.babyCoilId]?.weight || 0
    return cap > 0 ? (used / cap) * 100 : 0
  }, [consumedByBaby])

  const columns = [
    { label: 'Date', key: 'dateOfConversion' },
    { label: 'Slit Coil ID', key: 'babyCoilId' },
    { label: 'HR Coil ID', key: 'hrCoilId' },
    PLANT_COLUMN,
    { label: 'Thick (mm)', key: 'thickness' },
    { label: 'Width (mm)', key: 'width' },
    { label: 'Weight (T)', value: r => fmtT3(r.weight), render: r => <span className="tabular-nums">{fmtT3(r.weight)}</span> },
    { label: 'Width Check',
      value: r => {
        const g = parentGroups[r.hrCoilId]
        if (!g || !g.parent) return ''
        const chk = widthStatus(g.babies.reduce((s, b) => s + Number(b.width || 0), 0), Number(g.parent.width))
        return chk ? chk.label : ''
      },
      render: r => {
      const g = parentGroups[r.hrCoilId]
      if (!g || !g.parent) return '—'
      const sum = g.babies.reduce((s, b) => s + Number(b.width || 0), 0)
      const chk = widthStatus(sum, Number(g.parent.width))
      if (!chk) return '—'
      return <Badge ok={chk.tier !== 'over'} text={chk.label} />
    }},
    { label: '% Used', value: r => pctUsed(r), render: r => { const p = pctUsed(r); return <span className={`tabular-nums font-medium ${p >= 97 ? 'text-red-600 dark:text-red-400' : ''}`}>{p.toFixed(1)}%</span> } },
    // One coil, one production run (ADR-0015): a coil any live production names is Assigned and
    // out of stock, whatever is left on it. A coil that is physically gone is deleted, not flagged.
    { label: 'Status', value: r => consumedByBaby[r.babyCoilId] ? 'Assigned' : 'In stock',
      render: r => <Badge ok={!consumedByBaby[r.babyCoilId]} text={consumedByBaby[r.babyCoilId] ? 'Assigned' : 'In stock'} /> },
    { label: 'PO Number', key: 'poNumber' },
  ]

  const downloadBabyCoilsCSV = () => {
    const header = ['Date', 'Slit Coil ID', 'HR Coil ID', 'Plant', 'Thickness (mm)', 'Width (mm)', 'Weight (T)', 'PO Number']
    downloadCSV(`slitting-${today()}${plantFileSuffix(viewPlant)}.csv`, header, displayedBabyCoils.map(r => [
      r.dateOfConversion, r.babyCoilId, r.hrCoilId, plantLabel(r.plant), r.thickness, r.width, fmtT3(r.weight), r.poNumber,
    ]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 2: Slitting</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={downloadBabyCoilsCSV} disabled={displayedBabyCoils.length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => { if (showForm) resetForm(); else { setForm(emptyForm); setRows([{ _rid: uid(), width: '', length: '' }]); setEditId(null); setShowForm(true) } }}>{showForm ? 'Cancel' : '+ Add Slit Coil'}</Btn>
        </div>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Slit Coil' : 'Slit HR Coil'}>
          {/* Mother coil is picked ONCE; thickness/PO are inherited from it. Searchable picker. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date of Conversion"><Input type="date" value={form.dateOfConversion} onChange={v => f('dateOfConversion', v)} /></Field>
            <Field label="HR Coil ID">
              <SearchSelect value={form.hrCoilId}
                onChange={v => { f('hrCoilId', v); if (!editId) setRows([{ _rid: uid(), width: '', length: '' }]) }}
                options={coilOptions} placeholder="Search HR coil…" disabled={!!editId} />
            </Field>
            <Field label="Thickness (mm)" auto><Input value={parentCoil?.thickness ?? ''} disabled /></Field>
            <Field label="PO Number" auto><Input value={parentCoil?.poNumber ?? ''} disabled /></Field>
          </div>

          <div className="my-4 border-t border-slate-200 dark:border-slate-700" />

          {/* One row per baby coil; widths split the mother weight proportionally, saved together.
              Rows stack (labelled per field) on mobile and align to a single header row on md+. */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Slit Coils {editId ? '' : `(${validRows.length})`}</span>
            {!editId && <Btn size="sm" variant="ghost" onClick={addRow} disabled={!form.hrCoilId}>+ Add row</Btn>}
          </div>
          {/* Column headers — md+ only; per-field labels (below) cover mobile. */}
          <div className="hidden md:grid md:grid-cols-[7rem_7rem_4rem_1fr_7rem_3rem] gap-2 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Width (mm)</span><span>Length (mm)</span><span>Letter</span><span>Slit Coil ID</span><span>Weight (T)</span><span></span>
          </div>
          <div className="mt-2 md:mt-1 space-y-3 md:space-y-2">
            {enrichedRows.map((r, i) => (
              <div key={r._rid} className="grid grid-cols-1 gap-2 rounded-md border border-slate-200 dark:border-slate-700 p-3 md:grid-cols-[7rem_7rem_4rem_1fr_7rem_3rem] md:items-center md:gap-2 md:rounded-none md:border-0 md:p-0">
                <div>
                  <label className="md:hidden block text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Width (mm)</label>
                  <Input type="number" min="0" step="0.1" value={r.width} onChange={v => setRow(i, 'width', v)} aria-label="Width (mm)" />
                </div>
                <div>
                  <label className="md:hidden block text-xs font-medium text-blue-700 dark:text-blue-400 mb-1">Length (mm)</label>
                  <Input type="number" value={r.length} onChange={v => setRow(i, 'length', v)} placeholder="Optional" aria-label="Length (mm)" />
                </div>
                <div>
                  <label className="md:hidden block text-xs font-medium text-green-700 dark:text-green-400 mb-1">Letter</label>
                  <Input value={r.letter || '—'} disabled aria-label="Slit coil letter" />
                </div>
                <div>
                  <label className="md:hidden block text-xs font-medium text-green-700 dark:text-green-400 mb-1">Slit Coil ID</label>
                  <Input value={r.babyCoilId || '—'} disabled aria-label="Slit Coil ID" />
                </div>
                <div>
                  <label className="md:hidden block text-xs font-medium text-green-700 dark:text-green-400 mb-1">Weight (T)</label>
                  <Input value={fmtT3(r.weight)} disabled aria-label="Weight (tonnes)" className="tabular-nums" />
                </div>
                {!editId
                  ? <div className="md:flex md:justify-center">
                      <Btn size="sm" variant="ghost" onClick={() => removeRow(i)} aria-label="Remove slit coil row" className="w-full md:w-auto min-h-[2.5rem]">✕<span className="md:hidden"> Remove</span></Btn>
                    </div>
                  : <div className="hidden md:block" />}
              </div>
            ))}
          </div>

          {parentCoil && widthCheck && (
            <div className={`mt-3 p-3 rounded-md ${widthCheck.tier === 'ok' ? 'bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800' : widthCheck.tier === 'warn' ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800' : 'bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800'}`}>
              <span className={`text-sm font-medium ${widthCheck.tier === 'ok' ? 'text-green-700 dark:text-green-400' : widthCheck.tier === 'warn' ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>
                Width Sum: {widthCheck.label} {widthCheck.tier === 'ok' ? '✔ OK (≤ HR coil − 5 mm)' : widthCheck.tier === 'warn' ? '⚠ Over HR coil − 5 mm (within HR coil width)' : '⚠ Exceeds HR coil width — please verify (save allowed)'}
              </span>
            </div>
          )}
          {isDupe && <div className="mt-2"><Badge ok={false} text="Duplicate Slit Coil ID!" /></div>}
          {overLetterLimit && <div className="mt-2"><Badge ok={false} text="Max 26 slit coils per HR coil (letters A–Z)" /></div>}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.hrCoilId || validRows.length === 0 || isDupe || overLetterLimit} variant="success">{editId ? 'Update' : `Save${validRows.length ? ` ${validRows.length}` : ''} Slit Coil${validRows.length === 1 ? '' : 's'}`}</Btn>
            <Btn variant="ghost" onClick={resetForm}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Slit Coils" actions={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={babySearch} onChange={setBabySearch} placeholder="Search Slit Coil ID…" className="w-full sm:w-56" />
          <select value={dateFilter} onChange={e => setDateFilter(e.target.value)}
            className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100">
            <option value="all">All Time</option>
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom Range</option>
          </select>
          {dateFilter === 'custom' && <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
              className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
            <span className="text-sm text-slate-500">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
              className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
          </>}
        </div>
      }>
        <DataTable columns={columns} data={displayedBabyCoils} onEdit={startEdit} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 3: PRODUCTION — tube production, FIFO-consumes BABY coils
// ═══════════════════════════════════════════════════════════════
// `viewPlant` (ticket #126) scopes the Production Records table. The allocation pickers are NOT
// scoped by it — they follow `targetPlant` (ticket #124), which is the batch's own plant and is the
// stricter, better rule. `productions` stays whole so a record's edit still resolves and the guards
// below still see every batch.
function Production({ coils, babyCoils, productions, setProductions, dispatches, skus, operatingPlant, viewPlant = ALL_PLANTS }) {
  const emptyForm = { dateOfProduction: today(), skuCode: '', tubeCount: '', productionPoNo: '' }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [manualAlloc, setManualAlloc] = useState(null) // null ⇒ follow FIFO; else [{babyCoilId, pieces}]
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  // ── OPERATING PLANT (ticket #124) — the plant this batch is being made AT, as opposed to the
  // plant a saved row HAS (see CONTEXT.md, Operating plant vs Plant inheritance). It is the ONE
  // plant this form's coil pickers may draw from, and it is never typed here: a batch being EDITED
  // uses its own stored plant (fixed at save time from what it actually consumed) regardless of
  // what the header currently reads, so opening another plant's record can never hide the very
  // coils it already consumed; anything else uses `operatingPlant`, which today is the header's
  // plant selector and after phase 3 will be the plant on the operator's login.
  //
  // A record storing blank (an unallocated batch, or a legacy row) has no plant of its own to
  // keep, so it falls through too — a blank is nothing to preserve, not a third scope. Selecting
  // Unattributed IS a real scope (coils with no plant recorded) and survives.
  // Display only — never fed to a guard, a setter, or the allocation pickers.
  const shownProductions = useMemo(() => filterByPlant(productions, viewPlant), [productions, viewPlant])

  const editingProduction = useMemo(() => editId ? productions.find(p => p.id === editId) : null, [editId, productions])
  const targetPlant = editingProduction?.plant || operatingPlant
  // ALL_PLANTS is the one value that is not a plant — it would mean "offer every plant's baby
  // coils", exactly the cross-plant leak this ticket closes. So the form asks instead of guessing,
  // for a new batch and for an edit that fell through to it alike.
  const needsPlantChoice = targetPlant === ALL_PLANTS

  // The baby coils this batch may draw on, stated ONCE. All three consumers below read it — the
  // FIFO adapter, the manual dropdown, and the save guard — so they cannot drift into disagreeing
  // about whose strip is on offer. Before this the FIFO path expressed the rule one way (carrying
  // `plant` onto adapter rows) and the dropdown another (`filterByPlant`), which is the shape the
  // #121 `withDispatchEntries` extraction exists to warn about: two correct copies today, one
  // edited next year.
  const babyCoilsAtPlant = useMemo(() => filterByPlant(babyCoils, targetPlant), [babyCoils, targetPlant])

  // How the scope reads inside a sentence. Unattributed is NOT a fifth plant (CONTEXT.md), so under
  // that scope the bare label would present it as one more place a coil can sit; the parenthetical
  // says what those coils actually are.
  const scopeName = targetPlant ? plantLabel(targetPlant) : `${UNATTRIBUTED_PLANT} (coils with no plant recorded)`

  const skuOptions = useMemo(() =>
    skus.filter(s => s.status === 'published').map(s => ({ value: s.skuCode, label: s.description || s.skuCode })),
  [skus])

  // ── PRODUCTION PO No. — the PO issued to the CONTRACT MANUFACTURER for these pipes. It is NOT
  // the coil's `poNumber` (what we bought the HR coil under, Stage 1) and NOT the customer's
  // `childOrderId` (their PO for the tubes, Orders/Dispatch). A stamp only: nothing is computed
  // from it, no stock is reserved, and no rule ties it to the plant — no master records which CM a
  // PO was issued to, so the app has nothing to check it against.
  //
  // Free text, because these POs live in procurement and not in this app. The datalist is the only
  // thing standing between that and three spellings of one PO, so it is drawn from EVERY
  // production, not the plant-scoped view: the PO an operator is about to type is the one somebody
  // typed yesterday, whichever plant that batch was at.
  const poOptions = useMemo(() => productionPoOptions(productions), [productions])
  const poNo = normalizeProductionPoNo(form.productionPoNo)

  const sku = useMemo(() => skus.find(s => s.skuCode === form.skuCode), [skus, form.skuCode])
  const weightPerPiece = weightPerPieceFromSku(sku)
  const pieces = Math.max(0, Math.floor(Number(form.tubeCount || 0))) // whole tubes only, never negative
  const totalWeight = weightPerPiece * pieces

  // Width (mm) this tube needs from a coil; 0 when unknown (then the width filter is skipped).
  const reqWidth = useMemo(() => requiredStripWidth(sku), [sku])

  // Weight already consumed from each BABY coil by other productions (exclude the edited one, so
  // it re-allocates as if released). Read by the adapter below, so it is defined first.
  const consumedByCoil = useMemo(() => coilConsumption(productions, editId, 'babyCoilId'), [productions, editId])

  // Present this plant's baby coils in the shape coilFifoAllocate expects (FIFO key = babyCoilId,
  // capacity = baby weight, date = dateOfConversion). Thickness is inherited from the mother.
  // Narrow to coils whose slit width is within ±WIDTH_TOL_MM of the needed width (skip when
  // reqWidth is unknown). `plant` is carried onto each row so coilFifoAllocate can apply its OWN
  // plant filter (ticket #124) ahead of its RM→FG thickness rule — idempotent here, since these
  // rows are already scoped, and deliberately so: the allocator's guarantee has to hold for every
  // caller, not only for one that happened to pre-filter.
  // `babyCoilIsStock` offers only coils NO other live production has been assigned to — one coil,
  // one production run (ADR-0015). `consumedByCoil` excludes the production being edited, so its
  // own coils stay offered in its own form. Suggesting pieces onto a part-used coil is what spread
  // 234.478 T over 1,430 barely-touched coils (ADR-0007); with one run per coil it cannot happen.
  const babyAsCoils = useMemo(() => babyCoilsAtPlant
    .filter(b => babyCoilIsStock(b, consumedByCoil) && (reqWidth <= 0 || Math.abs(Number(b.width || 0) - reqWidth) <= WIDTH_TOL_MM))
    .map(b => ({ hrCoilId: b.babyCoilId, thickness: b.thickness, actualWeight: b.weight, dateOfInward: b.dateOfConversion, plant: b.plant })),
  [babyCoilsAtPlant, reqWidth, consumedByCoil])

  // Live FIFO preview as the operator types (over baby coils). softFill 0.97 = advance to the
  // next coil at 97%, leaving the 97→100% and 100→105% bands for manual top-up / fallback.
  // `plant: targetPlant` never crosses plants (ticket #124). While no plant is settled it is
  // ALL_PLANTS, and this does suggest across every plant — but that result never reaches a screen:
  // the form body is gated on `needsPlantChoice` below, which is exactly that condition.
  const rawAlloc = useMemo(() => coilFifoAllocate({
    coils: babyAsCoils, consumedByCoil, skuThickness: Number(sku?.thickness || 0), weightPerPiece, pieces, thicknessRule: true, softFill: 0.97, plant: targetPlant,
  }), [babyAsCoils, consumedByCoil, sku, weightPerPiece, pieces, targetPlant])

  // Enrich each allocation with the MOTHER coil id so cost reconciliation & the Coil Tracker
  // (which key on mother hrCoilId) keep working. rawAlloc.allocations[].hrCoilId is the babyCoilId.
  const alloc = useMemo(() => ({
    ...rawAlloc,
    allocations: rawAlloc.allocations.map(a => {
      const baby = (babyCoils || []).find(b => b.babyCoilId === a.hrCoilId)
      return { babyCoilId: a.hrCoilId, hrCoilId: baby?.hrCoilId || '', pieces: a.pieces, weight: a.weight, overTolerance: a.overTolerance }
    }),
  }), [rawAlloc, babyCoils])

  // ── FIFO SUGGESTION (non-binding). `fifoRows` is only shown as a helper and copied in via
  // "Use suggestion" — it is NOT the saved allocation. Suggested coils are displayed in
  // descending MT-available order (free = baby weight − weight already consumed elsewhere). ──
  const freeOf = useCallback((id) => {
    const baby = (babyCoils || []).find(b => b.babyCoilId === id)
    return Number(baby?.weight || 0) - (consumedByCoil[id]?.weight || 0)
  }, [babyCoils, consumedByCoil])
  const fifoRows = useMemo(() => alloc.allocations
    .map(a => ({ babyCoilId: a.babyCoilId, pieces: a.pieces }))
    .sort((x, y) => freeOf(y.babyCoilId) - freeOf(x.babyCoilId)),
  [alloc, freeOf])
  // The assigned coils are ALWAYS the operator's explicit selection — never auto-seeded from
  // FIFO. FIFO is shown as a non-binding suggestion (below); "Use suggestion" copies it in.
  const rows = manualAlloc ?? []

  // Baby coils for the manual picker — only coils no OTHER live production has been assigned to
  // (ADR-0015: one coil, one run; what is left on an assigned coil is not offered), but
  // it is NOT spec-filtered, so the operator can always pick an off-spec coil. Coils matching BOTH
  // width (±5 mm) and the RM→FG thickness rule are flagged (✓) and listed first; within each group
  // sorted by MT available (descending). The label shows thickness and width so coils are easy to
  // read at a glance.
  // The ONE narrowing that is not an override an operator may make is plant (ticket #124): a coil
  // in another state is not off-spec, it is not there. Reading `babyCoilsAtPlant` puts it first, so
  // every rule below — width, thickness, already assigned — is applied only within this
  // batch's own plant, and the off-spec override survives inside it.
  // A saved row pointing at a coil another production also names (history before ADR-0015) still RENDERS: SearchSelect
  // falls back to the raw id when the value is not among its options, so editing an old production
  // never silently blanks its allocation.
  const babyCoilOptions = useMemo(() => {
    const st = Number(sku?.thickness || 0)
    return babyCoilsAtPlant
      .filter(b => babyCoilIsStock(b, consumedByCoil))
      .map(b => {
        const free = babyCoilFree(b, consumedByCoil)
        const diff = st > 0 ? Number(b.thickness) - st : 0
        const thickOk = st > 0 && rmRollsFg(b.thickness, st)
        const widthOk = reqWidth <= 0 || Math.abs(Number(b.width || 0) - reqWidth) <= WIDTH_TOL_MM
        const match = thickOk && widthOk
        const diffLabel = st > 0 ? ` (${diff > 0 ? '+' : ''}${diff.toFixed(2)}mm)` : ''
        return { value: b.babyCoilId, free, match,
          label: `${match ? '✓' : '•'} ${b.babyCoilId} · thk ${b.thickness}mm${diffLabel} · W ${b.width || '—'}mm · free ${fmtT(free)}/${fmtT(b.weight)}T` }
      })
      .sort((a, b) => (a.match === b.match ? b.free - a.free : a.match ? -1 : 1))
  }, [babyCoilsAtPlant, sku, reqWidth, consumedByCoil])
  const matchedCount = useMemo(() => babyCoilOptions.filter(o => o.match).length, [babyCoilOptions])

  // Enrich rows with mother id, weight & per-coil capacity tier (green ≤97 / amber ≤105 / red >105).
  const enriched = useMemo(() => {
    const pcsByCoil = {}
    rows.forEach(r => { if (r.babyCoilId) pcsByCoil[r.babyCoilId] = (pcsByCoil[r.babyCoilId] || 0) + Number(r.pieces || 0) })
    return rows.map((r, i) => {
      const baby = (babyCoils || []).find(b => b.babyCoilId === r.babyCoilId)
      const cap = Number(baby?.weight || 0)
      const used = (consumedByCoil[r.babyCoilId]?.weight || 0) + (pcsByCoil[r.babyCoilId] || 0) * weightPerPiece
      const pct = cap > 0 ? (used / cap) * 100 : 0
      return { _rid: r._rid ?? `row-${i}`, babyCoilId: r.babyCoilId, pieces: Number(r.pieces || 0), hrCoilId: baby?.hrCoilId || '',
        weight: Number(r.pieces || 0) * weightPerPiece, pct, tier: pct > 105 ? 'over' : pct > 97 ? 'warn' : 'ok' }
    })
  }, [rows, babyCoils, consumedByCoil, weightPerPiece])

  // Only rows with a coil actually selected count as allocated — this is EXACTLY what save()
  // persists (it drops rows lacking a babyCoilId). Counting coil-less piece rows here made the
  // form claim "Fully allocated across 0 coil(s)" and then save the record as Unallocated.
  const allocatedPieces = enriched.reduce((s, r) => s + (r.babyCoilId ? r.pieces : 0), 0)
  const sourceCoils = enriched.filter(r => r.babyCoilId).length
  // Rows where pieces were entered but no coil was picked — these silently drop on save.
  const unpickedRows = enriched.some(r => r.pieces > 0 && !r.babyCoilId)
  const overCapacity = enriched.some(r => r.tier !== 'ok')
  const over105 = enriched.some(r => r.tier === 'over')
  // Rows still holding another plant's coil (ticket #124). Scoping the pickers decides what can be
  // OFFERED; the rows outlive a change of plant, so what can be SAVED is checked here too — an
  // operator can pick Hyderabad coils, change the header to NPMD, and still be holding them.
  // A hard stop with the coils named, never a silent drop: the tonnage is theirs, so they clear it.
  //
  // This is the one consumer that does NOT read `babyCoilsAtPlant`: it re-scopes from the raw array
  // itself. A guard whose whole job is "do not assume the scoping happened" must not be handed a
  // list that assumes it — that is the same trust this check exists to withdraw.
  const crossPlantRows = useMemo(() => crossPlantAllocationRows(enriched, babyCoils, targetPlant),
    [enriched, babyCoils, targetPlant])

  // Row editing — operates purely on the operator's explicit selection (manualAlloc). Each row
  // carries a stable _rid so the picker reliably shows the chosen coil as rows are added/removed.
  const baseRows = () => (manualAlloc ?? []).map(r => ({ _rid: r._rid || uid(), babyCoilId: r.babyCoilId, pieces: r.pieces }))
  const setRow = (i, key, val) => { const next = baseRows(); next[i] = { ...next[i], [key]: key === 'pieces' ? Math.max(0, Math.floor(Number(val || 0))) : val }; setManualAlloc(next) }
  const addRow = () => setManualAlloc([...baseRows(), { _rid: uid(), babyCoilId: '', pieces: 0 }])
  const removeRow = (i) => setManualAlloc(baseRows().filter((_, j) => j !== i))
  // Cap each of the operator's rows at its coil's real capacity, spilling the excess down
  // their own rows and then into eligible coils they haven't used yet. Their coil choices and
  // row order survive — this is not "use the suggestion", it is "make my split physical".
  const fixSplit = () => {
    const freeOfCoil = (id) => {
      const baby = (babyCoils || []).find(b => b.babyCoilId === id)
      return Number(baby?.weight || 0) - (consumedByCoil[id]?.weight || 0)
    }
    const chosen = new Set(baseRows().map(r => r.babyCoilId).filter(Boolean))
    const spare = fifoRows.map(r => r.babyCoilId).filter(id => !chosen.has(id))
    const { rows: capped } = capAllocationRows({
      rows: baseRows(), capacityOf: freeOfCoil, weightPerPiece, spare,
    })
    setManualAlloc(capped.filter(r => r.pieces > 0 || r.babyCoilId).map(r => ({ _rid: r._rid || uid(), babyCoilId: r.babyCoilId, pieces: r.pieces })))
  }

  // Copy the (non-binding) FIFO suggestion into the editable rows; "Clear" empties them.
  const useSuggestion = () => setManualAlloc(fifoRows.map(r => ({ _rid: uid(), babyCoilId: r.babyCoilId, pieces: r.pieces })))
  const clearAlloc = () => setManualAlloc([])

  const save = () => {
    const allocations = enriched
      .filter(r => r.babyCoilId && r.pieces > 0)
      .map(r => ({ babyCoilId: r.babyCoilId, hrCoilId: r.hrCoilId, pieces: r.pieces, weight: r.pieces * weightPerPiece }))
    const allocPcs = allocations.reduce((s, a) => s + a.pieces, 0)
    const record = {
      id: editId || uid(),
      dateOfProduction: form.dateOfProduction,
      skuCode: form.skuCode,
      tubeCount: pieces,
      // Stored trimmed + uppercased so one PO reads as one PO in the datalist and in any export.
      // A blank here is a real value, not a failure: every batch predating this field carries one.
      productionPoNo: poNo,
      weightPerPiece,
      totalWeight,
      coilAllocations: allocations,
      // Plant is never typed here — it is wherever the strip this batch ate was sitting. Derived
      // from the saved allocations, so it always describes what the operator actually persisted.
      //
      // An UNALLOCATED batch has eaten nothing, so there is no strip to inherit from and
      // `productionPlant` returns '' — Unattributed. Saving unallocated is a supported flow ("saved
      // unallocated until a coil is slit"), and once the stages follow the plant scope an
      // Unattributed row drops off the Records table the instant it is written, at a stage where
      // the operator has no plant field to correct it with. So a batch with NO allocations falls
      // back to the plant it was MADE at (`targetPlant`) — which is what the form was already
      // scoped to when it composed the batch.
      //
      // Narrowly guarded, because this is the one place a production's plant is not inherited from
      // what it consumed: only when there are zero allocations (any allocation at all, and the
      // strip decides — a batch spanning two plants is already a hard stop above), and never under
      // All Plants, which is not a plant and would be a guess.
      plant: productionPlant(allocations, babyCoils, coils)
        || (allocations.length === 0 && targetPlant !== ALL_PLANTS ? targetPlant : ''),
      status: allocPcs > pieces ? 'over' : allocPcs >= pieces && pieces > 0 ? 'allocated' : allocPcs > 0 ? 'partial' : 'unallocated',
      deleted: false,
    }
    if (editId) setProductions(prev => prev.map(p => p.id === editId ? record : p))
    else setProductions(prev => [...prev, record])
    cancelForm()
  }
  const cancelForm = () => { setForm(emptyForm); setEditId(null); setShowForm(false); setManualAlloc(null) }
  const openNew = () => { setForm(emptyForm); setEditId(null); setManualAlloc(null); setShowForm(true) }
  const startEdit = (row) => {
    setForm({ dateOfProduction: row.dateOfProduction, skuCode: row.skuCode, tubeCount: String(row.tubeCount), productionPoNo: row.productionPoNo || '' })
    setManualAlloc((row.coilAllocations || []).length ? row.coilAllocations.map(a => ({ _rid: uid(), babyCoilId: a.babyCoilId, pieces: Number(a.pieces || 0) })) : null)
    setEditId(row.id); setShowForm(true)
  }
  const softDelete = (row) => {
    if (confirm('Delete this production record? Coil capacity is released.')) setProductions(prev => prev.map(p => p.id === row.id ? { ...p, deleted: true } : p))
  }

  // A row past 105% of its coil is now a HARD stop, not a warning. Warn-and-save is exactly
  // how 445 baby coils came to hold 123.3 T more than they physically could (issue #99).
  // Under-allocating is still fine — that saves as 'partial' and blocks nothing.
  // A row holding another plant's coil is the second hard stop (ticket #124) — a batch may not be
  // persisted spanning two plants, however its rows came to be that way.
  //
  // The Production PO is mandatory on the CREATE path ONLY. Every one of the batches already in the
  // register was recorded before this field existed and carries no PO, so a guard that also ran on
  // edit would freeze that history — nobody could fix a piece count on a June batch without
  // inventing a PO for it. Blank on an old row is the truth, and the truth has to stay saveable.
  const missingPoOnNew = !editId && !poNo
  const canSave = !!form.skuCode && pieces > 0 && !over105 && crossPlantRows.length === 0 && !missingPoOnNew

  const allocatedOf = r => (r.coilAllocations || []).reduce((s, a) => s + Number(a.pieces || 0), 0)
  const sourceCoilsOf = r => (r.coilAllocations || []).filter(a => a.babyCoilId || a.hrCoilId).length
  const columns = [
    { label: 'Date', key: 'dateOfProduction' },
    PLANT_COLUMN,
    // Plant says WHICH contract manufacturer; the PO says under which order they made it. They read
    // together, so they sit together. Blank (every batch before this field) shows as the same em-dash
    // every other empty cell in the app uses — inventing a word for it would assert more than the
    // data says.
    { label: 'Production PO', value: r => r.productionPoNo || '—' },
    { label: 'SKU', value: r => skuDesc(r.skuCode) },
    { label: 'Pieces', key: 'tubeCount' },
    { label: 'Wt/Piece (T)', value: r => fmtT3(r.weightPerPiece) },
    { label: 'Total Wt (T)', value: r => fmtT(r.totalWeight) },
    { label: 'Allocated (pcs)', value: r => `${allocatedOf(r)} / ${r.tubeCount}` },
    { label: '# Source Coils', value: r => sourceCoilsOf(r) },
    { label: 'Assigned Coils', value: r => (r.coilAllocations || []).map(a => a.babyCoilId || a.hrCoilId).join(', ') || '—' },
    { label: 'Status', value: r => r.status, render: r => r.status === 'allocated'
      ? <Badge ok={true} text="Allocated" />
      : <Badge ok={false} text={r.status === 'over' ? 'Over-allocated' : r.status === 'partial' ? 'Partial' : 'Unallocated'} /> },
  ]

  const downloadProductionsCSV = () => {
    const header = ['Date', 'Plant', 'Production PO', 'SKU', 'Pieces', 'Wt/Piece (T)', 'Total Wt (T)', 'Allocated (pcs)', '# Source Coils', 'Assigned Coils', 'Status']
    // `shownProductions`, not `productions` — the export is the table, downloaded. Coil Inward and
    // Slitting already export what they show; this one alone exported the whole company, so a
    // scoped screen produced an unscoped file with no scope named anywhere in it.
    downloadCSV(`production-${today()}${plantFileSuffix(viewPlant)}.csv`, header, shownProductions.filter(p => !p.deleted).map(r => [
      r.dateOfProduction, plantLabel(r.plant), r.productionPoNo || '—', skuDesc(r.skuCode), r.tubeCount, fmtT3(r.weightPerPiece), fmtT(r.totalWeight),
      `${allocatedOf(r)} / ${r.tubeCount}`, sourceCoilsOf(r),
      (r.coilAllocations || []).map(a => `${a.babyCoilId || a.hrCoilId}×${a.pieces}`).join('; ') || '—', r.status,
    ]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 3: Production</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={downloadProductionsCSV} disabled={shownProductions.filter(p => !p.deleted).length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => { if (showForm) cancelForm(); else openNew() }}>{showForm ? 'Cancel' : '+ Record Production'}</Btn>
        </div>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Production' : 'Record Production'}>
        {/* Plant gate (ticket #124). Allocation never crosses plants, so composing a batch needs to
            know which plant is producing — and under All Plants the app does not. It asks rather than
            defaulting to Hyderabad, which would show an NPMD operator someone else's coils. Phase 3
            replaces this with the plant on the operator's own login. One Section either way: the
            form is being withheld, not replaced by a different screen. */}
        {needsPlantChoice ? (
          <div className="rounded-md border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
            ⚠ Choose a plant in the header selector first. A production consumes slit coils from one plant
            only, so the pickers cannot be filled while the selector reads “All Plants”.
          </div>
        ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Date of Production"><Input type="date" value={form.dateOfProduction} onChange={v => f('dateOfProduction', v)} /></Field>
            <Field label="SKU"><SearchSelect value={form.skuCode} onChange={v => { f('skuCode', v); setManualAlloc(null) }} options={skuOptions} placeholder="Search SKU..." /></Field>
            <Field label="No. of Pieces"><Input type="number" min="0" step="1" value={form.tubeCount} onChange={v => f('tubeCount', v === '' ? '' : Math.max(0, Math.floor(Number(v) || 0)))} /></Field>
            {/* Required on NEW batches only (see `canSave`). Editing one of the batches recorded
                before this field existed must stay possible, so the guard never looks at an edit. */}
            <Field label="Production PO No." helper={editId ? 'PO issued to the contract manufacturer' : 'Required — PO issued to the contract manufacturer'}>
              <Input list="production-po-list" value={form.productionPoNo} onChange={v => f('productionPoNo', v)} placeholder="e.g. PO/2026/114" />
              <datalist id="production-po-list">
                {poOptions.map(po => <option key={po} value={po} />)}
              </datalist>
            </Field>
          </div>
          {/* Plant is shown, never typed — it is the scope the coils below are drawn from, and the
              saved record re-derives it from the allocations themselves (productionPlant). Under the
              Unattributed scope this says what those coils ARE — ones with no plant recorded — rather
              than naming Unattributed as though it were a fifth plant to consume from (CONTEXT.md). */}
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {targetPlant
              ? <>Consuming slit coils from <span className="font-medium text-slate-700 dark:text-slate-200">{plantLabel(targetPlant)}</span> only.</>
              : <>Consuming only slit coils with <span className="font-medium text-slate-700 dark:text-slate-200">no plant recorded</span> — rows predating the plant column, shown as {UNATTRIBUTED_PLANT}.</>}
          </div>
          <div className="my-4 border-t border-slate-200 dark:border-slate-700" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Wt/Piece (T)" auto><Input value={fmtT(weightPerPiece)} disabled /></Field>
            <Field label="Total Weight (T)" auto><Input value={fmtT(totalWeight)} disabled /></Field>
            <Field label="Allocated (pcs)" auto warn={allocatedPieces !== pieces || overCapacity}><Input value={`${allocatedPieces} / ${pieces}`} disabled /></Field>
            <Field label="# Source Coils" auto><Input value={String(sourceCoils)} disabled /></Field>
          </div>

          {/* Weight guard: warn (never block) when the chosen SKU has no weight in the SKU Master —
              this batch would otherwise save at 0 tonnes (the frozen-zero bug at the source). */}
          {sku && !(weightPerPiece > 0) && (
            <div className="mt-3 rounded-md border border-red-300 dark:border-red-800 bg-red-50 dark:bg-red-950/50 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              ⚠ This SKU has no weight in the SKU Master — Total Weight will save as 0. Add “Weight per Tube” for this SKU in SKU Master first.
            </div>
          )}

          {/* FIFO suggestion (read-only helper) — never saved on its own; "Use suggestion" copies it in */}
          {sku && pieces > 0 && (
            <div className="mt-3 rounded-md border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/40 px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                  Suggestion (FIFO · {plantLabel(targetPlant)} · width ±5 mm · coil→pipe thickness rule · unassigned coils only)
                </span>
                <Btn size="sm" variant="ghost" onClick={useSuggestion} disabled={fifoRows.length === 0}>↧ Use suggestion</Btn>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {fifoRows.length === 0
                  ? <span className="text-xs text-slate-500 dark:text-slate-400">No eligible coil to suggest — pick one manually below.</span>
                  : fifoRows.map((r, i) => (
                    <span key={i} className="px-2 py-0.5 rounded text-xs bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800 text-slate-700 dark:text-slate-200">
                      {r.babyCoilId} × {r.pieces}
                    </span>
                  ))}
                {alloc.shortfall && <span className="px-2 py-0.5 rounded text-xs bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300">+{alloc.shortfallPieces} pc not suggested</span>}
              </div>
            </div>
          )}

          {/* Assigned baby coils — the operator's explicit selection (this is what gets saved) */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Assigned Slit Coils
              </span>
              <div className="flex gap-2">
                <Btn size="sm" variant="ghost" onClick={addRow} disabled={!sku}>+ Add coil</Btn>
                {overCapacity && <Btn size="sm" variant="ghost" onClick={fixSplit}>⇄ Fix split</Btn>}
                {enriched.length > 0 && <Btn size="sm" variant="ghost" onClick={clearAlloc}>✕ Clear</Btn>}
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {enriched.length === 0 && <span className="text-sm text-slate-400">No coil assigned yet — pick a coil or click “Use suggestion”.</span>}
              {enriched.map((r, i) => (
                <div key={r._rid} className="flex items-center gap-2">
                  <div className="flex-1"><SearchSelect value={r.babyCoilId} onChange={v => setRow(i, 'babyCoilId', v)} options={babyCoilOptions} placeholder="Search slit coil..." /></div>
                  <div className="w-24"><Input type="number" min="0" step="1" value={r.pieces} onChange={v => setRow(i, 'pieces', v)} /></div>
                  {!r.babyCoilId
                    ? <span className="whitespace-nowrap px-2 py-1 rounded-md text-xs font-medium border bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200">
                        ⚠ Select a coil from the list
                      </span>
                    : <span className={`whitespace-nowrap px-2 py-1 rounded-md text-xs font-medium border ${r.tier === 'over'
                      ? 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                      : r.tier === 'warn'
                      ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                      : 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800 text-green-800 dark:text-green-200'}`}>
                      {fmtT(r.weight)}T · {r.pct.toFixed(0)}%
                    </span>}
                  <Btn size="sm" variant="ghost" onClick={() => removeRow(i)}>✕</Btn>
                </div>
              ))}
            </div>
          </div>

          {/* Status badges. Most are informational; three are hard stops that also disable Save —
              over-105% capacity, a cross-plant row, and a missing Production PO on a new batch. Each
              says so in its own text, so the block is read top to bottom without a key. */}
          <div className="mt-3 space-y-2">
            {pieces > 0 && allocatedPieces === 0 && babyCoilOptions.length === 0 && <Badge ok={false} text={`No slit coils available at ${scopeName} (none slit, or every slit coil is already assigned to a production). Production saved unallocated until a coil is slit.`} />}
            {pieces > 0 && allocatedPieces === 0 && babyCoilOptions.length > 0 && matchedCount === 0 && <Badge ok={false} text="No coil matching this tube's width (±5 mm) and the coil→pipe thickness rule — nothing to suggest, but you can pick an off-spec coil below (listed with its Δ thickness & width). Another plant's coil is never offered." />}
            {pieces > 0 && allocatedPieces === 0 && matchedCount > 0 && <Badge ok={false} text="No coil assigned yet — pick a coil above or click “Use suggestion” (otherwise the production saves unallocated)." />}
            {unpickedRows && <Badge ok={false} text="A row has pieces entered but no coil selected — click a coil from the dropdown list (rows without a coil are NOT saved)." />}
            {allocatedPieces > 0 && allocatedPieces === pieces && !overCapacity && <Badge ok={true} text={`Fully allocated across ${sourceCoils} coil(s).`} />}
            {crossPlantRows.length > 0 && <Badge ok={false} text={`${crossPlantRows.map(r => r.babyCoilId).join(', ')} ${crossPlantRows.length > 1 ? 'are' : 'is'} not at ${scopeName} — a production cannot consume coils from two plants. Remove ${crossPlantRows.length > 1 ? 'those rows' : 'that row'}, or switch the header back to the plant ${crossPlantRows.length > 1 ? 'they belong' : 'it belongs'} to. Save is blocked until it clears.`} />}
            {missingPoOnNew && <Badge ok={false} text="Production PO No. is required — enter the PO issued to the contract manufacturer for these pipes. Save is blocked until it is filled." />}
            {over105
              ? <Badge ok={false} text="A coil is filled beyond 105% of its capacity — a coil cannot give more steel than it holds. Reduce that row, or click “Fix split” to spill the excess onto the next coil. Save is blocked until it clears." />
              : overCapacity && <Badge ok={true} text="A coil is in the 97–105% band — allowed (manual top-up past the 97% auto-advance)." />}
            {allocatedPieces > 0 && allocatedPieces < pieces && <Badge ok={false} text={`Shortfall: ${pieces - allocatedPieces} piece(s) not yet assigned to a coil. Saved as partial.`} />}
            {allocatedPieces > pieces && <Badge ok={false} text={`Over-assigned: ${allocatedPieces - pieces} more piece(s) allocated than produced — reduce a row.`} />}
          </div>

          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!canSave} variant="success">{editId ? 'Update' : 'Save Production'}</Btn>
            <Btn variant="ghost" onClick={cancelForm}>Cancel</Btn>
          </div>
        </>
        )}
        </Section>
      )}

      <Section title="Production Records">
        <DataTable columns={columns} data={shownProductions} onEdit={startEdit} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 4: DISPATCH — records uploaded from the ZOHO INVOICE REGISTER via "Upload Invoice Excel"
// on the Orders tab (ticket #192). The ERP workbook's own `Invoice` sheet is no longer read at all.
// Every rule that turns a raw register row into a dispatch record (`mapInvoiceRow`,
// `buildInvoiceDispatches`) lives in `src/lib/calc.js`, where a test can reach them — App reads the
// workbook, calls in, and renders the result. Rows are grouped into one dispatch per invoice; each
// entry's coil trace is inherited from production FIFO, so the Mother Coil trace and reconciliation
// export keep working with no manual coil picking. An upload rebuilds ONLY the dates its file
// covers, so re-uploading the same file cannot double-count and an earlier month is never deleted.
// ═══════════════════════════════════════════════════════════════
// ── Dispatch overview — the 10 am "Scoreboard" (ticket #232, part 1; pack screen 3a) ──
// Every figure comes from `dispatchOverview` (calc.js); this component and its four CSVs only read
// what it returns. Two scopes, on purpose (#230): the PLANT TABLE is a comparison block, fed
// `compare*` — every plant for an admin whatever the header says, the pinned plant for a plant
// login (`comparePlant`, which drops the Total). Every OTHER block reads the header-scoped stores,
// exactly as the Sales tab does.
const STATUS_DOT = { red: 'bg-red-500', amber: 'bg-amber-400', green: 'bg-emerald-500' }
const StatusDot = ({ status }) => (
  <span title={status} aria-label={`status ${status}`}
    className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_DOT[status] || 'bg-slate-300'}`} />
)
const fmtDays = (d) => d == null ? '—' : `${d} d`
const fmtRatio = (r) => r == null ? '—' : `${(r * 100).toFixed(0)}%`
// `?` for an unknown figure (an Unmapped region's servable), never 0 — unknown is not empty.
const fmtKnown = (v) => v == null ? '?' : fmtT(v)

function DispatchOverview({ orders, dispatches, productions, skus, compareOrders, compareDispatches, comparePlant = null,
  stateRegions = [], plants = [], distributors = [], selectedPlant = ALL_PLANTS }) {
  const todayStr = today()
  const ov = useMemo(() => dispatchOverview({
    orders, dispatches, productions, skus, compareOrders, compareDispatches, comparePlant,
    stateRegions, plants, distributors, date: todayStr,
  }), [orders, dispatches, productions, skus, compareOrders, compareDispatches, comparePlant, stateRegions, plants, distributors, todayStr])
  const [showAllShort, setShowAllShort] = useState(false)
  const distExportRef = useRef([])

  // File names: the comparison block is scoped by the LOGIN (bare for an admin, who sees every
  // plant); the other blocks by the header selector — `plantFileSuffix` is bare under All Plants.
  const compareSuffix = comparePlant != null ? plantFileSuffix(comparePlant) : ''
  const scopeSuffix = plantFileSuffix(selectedPlant)
  const scopeName = selectedPlant === ALL_PLANTS ? 'All plants' : plantLabel(selectedPlant)

  const plantRows = [...ov.plants.rows, ...(ov.plants.total ? [ov.plants.total] : [])]
  const plantCols = ['Status', 'Plant', 'Indent', 'Invoiced MTD', 'Invoiced ÷ Indent', 'Confirmed', 'of which out of area', 'Pending to Serve', 'Oldest pending (d)']
  const plantCells = (r) => [r.status, r.name, fmtT(r.indent), fmtT(r.invoicedMtd), fmtRatio(r.invoicedRatio), fmtT(r.confirmed),
    r.outOfArea == null ? '—' : fmtT(r.outOfArea), fmtT(r.pendingToServe), r.oldestPendingDays == null ? '—' : r.oldestPendingDays]
  const downloadPlantsCSV = () => downloadCSV(`dispatch-plants-${ov.date}${compareSuffix}.csv`, plantCols, plantRows.map(plantCells))

  const downloadRegionsCSV = () => downloadCSV(`dispatch-pending-by-area-${ov.date}${scopeSuffix}.csv`,
    ['Region', 'Pending to Dispatch', 'Confirmed', 'Servable – Unconfirmed', 'Non-confirmed'],
    ov.regions.tiles.map(t => [t.known ? t.region : '?', fmtKnown(t.pendingToDispatch), fmtT(t.confirmed), fmtKnown(t.servableUnconfirmed), fmtT(t.unconfirmed)]))

  const shortShown = (g) => showAllShort ? g.rows : g.rows.slice(0, ov.short.topN)
  const anyShortHidden = ov.short.regions.some(g => g.rows.length > ov.short.topN)
  const downloadShortCSV = () => downloadCSV(`dispatch-short-${ov.date}${scopeSuffix}.csv`,
    ['Region', 'Size', 'SKU', 'Description', 'Area pending', 'Area on hand', 'Short'],
    ov.short.regions.flatMap(g => shortShown(g).map(c => [g.region, c.size, c.skuCode, c.description, fmtT(c.areaPending), fmtT(c.onhand), fmtT(c.short)])))

  const distCols = [
    // The status dot rides in the Distributor cell — a column of its own pushed Oldest pending off a
    // laptop screen. The CSV keeps Status as its own column.
    { label: 'Distributor', value: r => r.customer, render: r => <span className="inline-flex items-center gap-2" title={r.customer}><StatusDot status={r.status} />{distributorCode(r.customer) || r.customer}</span> },
    // An Unmapped distributor has no region to name — `?`, never a region it does not have.
    { label: 'Region', value: r => r.regionKnown ? r.region : '?' },
    { label: 'Confirmed', value: r => r.confirmed, render: r => fmtT(r.confirmed), total: v => fmtT(v) },
    { label: 'Non-confirmed', value: r => r.nonConfirmed, render: r => fmtT(r.nonConfirmed), total: v => fmtT(v) },
    { label: 'Invoiced MTD', value: r => r.invoicedMtd, render: r => fmtT(r.invoicedMtd), total: v => fmtT(v) },
    { label: 'Oldest', value: r => r.oldestPendingDays ?? -1, render: r => fmtDays(r.oldestPendingDays) },
  ]
  const downloadDistributorsCSV = () => downloadCSV(`dispatch-distributors-${ov.date}${scopeSuffix}.csv`,
    ['Status', 'Distributor', 'Region', 'Confirmed', 'Non-confirmed', 'Invoiced MTD', 'Oldest pending (d)'],
    distExportRef.current.map(r => [r.status, r.customer, r.regionKnown ? r.region : '?', fmtT(r.confirmed), fmtT(r.nonConfirmed), fmtT(r.invoicedMtd), r.oldestPendingDays ?? '']))

  const rec = ov.reconciliation
  const th = ov.thresholds
  const thresholdLine = `${th.caption} — red: oldest pending > ${th.oldestPendingRedDays} d · amber: Invoiced ÷ Indent < ${Math.round(th.invoicedRatioAmber * 100)}%`
  const num = 'px-3 py-1.5 text-right tabular-nums whitespace-nowrap'

  return (
    <div className="space-y-6">
      <Section title="Daily Dispatch — plants" actions={<Btn size="sm" variant="ghost" onClick={downloadPlantsCSV}>⬇ Plants CSV</Btn>}>
        <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md">
          <table className="min-w-full text-sm" aria-label="Dispatch by plant">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
                {plantCols.map((c, i) => <th key={c} className={`px-3 py-2 font-semibold whitespace-nowrap ${i < 2 ? 'text-left' : 'text-right'}`}>{c}</th>)}
              </tr>
            </thead>
            <tbody>
              {plantRows.map(r => {
                const isTotal = r === ov.plants.total
                return (
                  <tr key={r.plant || 'unattributed'} className={`border-t border-slate-200 dark:border-slate-700 ${isTotal ? 'font-semibold bg-slate-50 dark:bg-slate-900' : ''}`}>
                    <td className="px-3 py-1.5"><StatusDot status={r.status} /></td>
                    <td className="px-3 py-1.5 whitespace-nowrap text-slate-900 dark:text-slate-100">{r.name}</td>
                    <td className={num}>{fmtT(r.indent)}</td>
                    <td className={num}>{fmtT(r.invoicedMtd)}</td>
                    <td className={num}>{fmtRatio(r.invoicedRatio)}</td>
                    <td className={num}>{fmtT(r.confirmed)}</td>
                    <td className={`${num} ${r.outOfArea > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{r.outOfArea == null ? '—' : fmtT(r.outOfArea)}</td>
                    <td className={num}>{fmtT(r.pendingToServe)}</td>
                    <td className={num} title={r.oldestPendingDate ? `ordered ${r.oldestPendingDate}` : ''}>{fmtDays(r.oldestPendingDays)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          {comparePlant == null
            ? <>This table covers all plants regardless of the header plant selector — a plant comparison scoped to one plant is not a comparison.</>
            : <>This table shows your plant only.</>}
          {' '}Plant is the ERP’s ship-from plant. <strong>Out of area</strong> is Confirmed booked on a plant that does not serve the
          distributor’s region — kept in every total, stated here. Pending to Serve is the whole open book (Confirmed + Non-confirmed).
          Oldest pending counts only lines still holding Confirmed, netted against invoices already raised.
        </p>
        <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">{thresholdLine}</p>
      </Section>

      <Section title={`Pending to Dispatch by service area — ${scopeName}`} actions={<Btn size="sm" variant="ghost" onClick={downloadRegionsCSV}>⬇ Areas CSV</Btn>}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {ov.regions.tiles.map(t => (
            <div key={t.region} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
              <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">{t.known ? t.region : `${t.region} (no region)`}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">{fmtKnown(t.pendingToDispatch)} T</div>
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                Confirmed {fmtT(t.confirmed)} + Servable – Unconfirmed {fmtKnown(t.servableUnconfirmed)}
              </div>
            </div>
          ))}
          {ov.regions.tiles.length === 0 && <p className="text-sm text-slate-400">Nothing pending.</p>}
        </div>
        <p className={`mt-3 text-sm tabular-nums ${rec.ties ? 'text-slate-600 dark:text-slate-300' : 'text-red-600 dark:text-red-400'}`}>
          Plant Confirmed {fmtT(rec.plantConfirmed)} = {rec.regions.map(g => `${g.region} ${fmtT(g.confirmed)}`).join(' + ') || '0.0'};
          {' '}<strong>{fmtT(rec.outOfArea)} T booked out of area</strong>{rec.outOfAreaLines ? ` (${rec.outOfAreaLines} line${rec.outOfAreaLines === 1 ? '' : 's'})` : ''}.
          {!rec.ties && ' These do not tie — do not read this screen until the gap is explained.'}
        </p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Pending to Dispatch = Confirmed + Servable – Unconfirmed: what is owed and already on the floor of the plants serving that region.
          Tiles group by the distributor’s region; the plant table groups by ship-from plant — the out-of-area tonnage is the difference.
        </p>
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
        <div className="xl:col-span-2"><Section title={`Short — ${scopeName}`} actions={<Btn size="sm" variant="ghost" onClick={downloadShortCSV} disabled={!ov.short.regions.length}>⬇ Short CSV</Btn>}>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Sizes where the region’s pending (Confirmed + Non-confirmed) exceeds the region’s on-hand stock — South is Hyderabad + Lepakshi,
            West is NPMD + Tapi. Biggest gap first.
          </p>
          {ov.short.regions.length === 0 && <p className="text-sm text-slate-400">No size is short.</p>}
          {ov.short.regions.map(g => (
            <div key={g.region} className="mb-4">
              <div className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{g.region} — {g.rows.length} size{g.rows.length === 1 ? '' : 's'}, {fmtT(g.total)} T short</div>
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
                      <th className="px-3 py-1.5 text-left font-semibold">Size</th>
                      <th className="px-3 py-1.5 text-left font-semibold">Description</th>
                      <th className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">Area pending</th>
                      <th className="px-3 py-1.5 text-right font-semibold whitespace-nowrap">On hand</th>
                      <th className="px-3 py-1.5 text-right font-semibold">Short</th>
                    </tr>
                  </thead>
                  <tbody>
                    {shortShown(g).map(c => (
                      <tr key={c.sku} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-3 py-1.5 whitespace-nowrap">{c.size || '—'}</td>
                        <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{c.description}</td>
                        <td className={num}>{fmtT(c.areaPending)}</td>
                        <td className={num}>{fmtT(c.onhand)}</td>
                        <td className={`${num} font-semibold text-red-600 dark:text-red-400`}>{fmtT(c.short)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {anyShortHidden && (
            <Btn size="sm" variant="ghost" onClick={() => setShowAllShort(v => !v)}>
              {showAllShort ? `Show top ${ov.short.topN} per region` : 'Show all'}
            </Btn>
          )}
        </Section></div>

        <div className="xl:col-span-3"><Section title={`Distributors — ${scopeName}`} actions={<Btn size="sm" variant="ghost" onClick={downloadDistributorsCSV} disabled={!ov.distributors.length}>⬇ Distributors CSV</Btn>}>
          <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
            Oldest pending first. A distributor with no mapped region reads <strong>?</strong> — map its state on the Sales tab.
          </p>
          <DataTable columns={distCols} data={ov.distributors} exportRef={distExportRef} excel maxHeight="32rem" totalsLabel="TOTAL" />
          <p className="mt-1 text-xs font-medium text-amber-600 dark:text-amber-400">{thresholdLine}</p>
        </Section></div>
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ── Stage 4 Dispatch — a records + reconciliation VIEW, never hand-entered.
// `canWiden` (ticket #126) says whether the plant scope is one the user can drop. An admin moved
// the header selector and can move it back; a plant user's scope is their login, and telling them
// to "switch to All Plants" would name a control they do not have.
// The overview props (#232) arrive under their own names: `orders`/`productions` are header-scoped
// like `dispatches`; `compare*`/`comparePlant` are what the plant table reads (see DispatchOverview).
function Dispatch({ dispatches, setDispatches, coils, skus, plantScoped = false, canWiden = true,
  orders = [], productions = [], compareOrders = null, compareDispatches = null, comparePlant = null,
  stateRegions = [], plants = [], distributors = [], selectedPlant = ALL_PLANTS }) {
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  // Soft-deletes the WHOLE invoice record, by id, in the raw store — `dispatches` here may be a
  // plant-scoped copy carrying only some of that invoice's entries, but `deleted` lives on the
  // record and there is no per-entry delete. So under a plant filter this button would remove
  // lines the operator cannot see and never intended to touch. Hence `plantScoped` disables it
  // below rather than this function guessing: a filter is a way of LOOKING at the data, and it
  // must never quietly change what a write does.
  const softDelete = (row) => {
    if (confirm('Delete this dispatch record?')) setDispatches(prev => prev.map(d => d.id === row.id ? { ...d, deleted: true } : d))
  }

  // Invoice Reconciliation CSV — one row per (dispatch date × invoice × SKU). Reports
  // quantity, the Mother Coil trace, and the SKU conversion/ladder rates. Logic in calc.js.
  const downloadReconciliationCSV = () => {
    const rows = buildReconciliationRows(dispatches, coils, skus)
    const header = ['Date of Dispatch', 'Invoice No.', 'Customer', 'SKU', 'Grade', 'Quantity (MT)', 'HR Coil', 'Conversion Cost/MT', 'Ladder Cost/MT']
    downloadCSV(`invoice-reconciliation-${today()}.csv`, header, rows.map(r => [
      r.dateOfDispatch, r.invoiceNo, r.customer, r.sku, r.grade, fmtT(r.quantityMT), r.motherCoil,
      r.conversionPerMT.toFixed(2), r.ladderPerMT.toFixed(2),
    ]))
  }

  const invoiceList = (r) => {
    const set = [...new Set((r.bundleEntries || []).map(b => b.invoiceNo).filter(Boolean))]
    return set.length ? set.join(', ') : (r.invoiceNo || '—')
  }
  // Aggregate an invoice's lines by SKU so each SKU shows on its own (stacked) row, with
  // Pieces/Weight aligned to it. Customer lives on the entries (JSONB) now, not the record.
  const skuLines = (r) => {
    const map = new Map()
    for (const e of r.bundleEntries || []) {
      const cur = map.get(e.skuCode) || { skuCode: e.skuCode, pieces: 0, weight: 0 }
      cur.pieces += Number(e.pieces || 0); cur.weight += Number(e.weight || 0)
      map.set(e.skuCode, cur)
    }
    return [...map.values()]
  }
  const stack = (r, fn) => (
    <div className="space-y-1">{skuLines(r).map(l => <div key={l.skuCode} className="whitespace-nowrap">{fn(l)}</div>)}</div>
  )
  const columns = [
    { label: 'Date', key: 'dateOfDispatch' },
    { label: 'Invoice No(s).', value: r => invoiceList(r) },
    { label: 'Customer', value: r => distributorCode(r.bundleEntries?.[0]?.customer || r.customer), render: r => { const c = r.bundleEntries?.[0]?.customer || r.customer || ''; return <span title={c}>{distributorCode(c) || '—'}</span> } },
    // Short display name only — "NPMD", never "New Pashchim Maharashtra Patra Depot". Read off the
    // entries, where plant is stored; a pre-#119 record reads Unattributed.
    { label: 'Plant', value: r => dispatchPlantLabel(r) },
    { label: 'SKUs', value: r => skuLines(r).map(l => skuDesc(l.skuCode)).join(' '), render: r => stack(r, l => skuDesc(l.skuCode)) },
    { label: 'Pieces', value: r => (r.bundleEntries || []).reduce((s, b) => s + Number(b.pieces || 0), 0), render: r => stack(r, l => l.pieces) },
    { label: 'Weight (T)', value: r => r.theoreticalWeight, render: r => stack(r, l => fmtT(l.weight)) },
  ]

  // No per-tab Plant filter here. #118/#119 gave this table its own Plant dropdown; the header
  // selector (#121) replaced it, and keeping both would be exactly the "reason about which views
  // are scoped" that one global control exists to prevent — a local dropdown under a header scoped
  // elsewhere just offers plants that can only ever return nothing. The Plant COLUMN stays.

  const downloadDispatchRecordsCSV = () => {
    const header = ['Date', 'Invoice No(s).', 'Customer', 'Plant', 'SKUs', 'Pieces', 'Weight (T)']
    downloadCSV(`dispatch-records-${today()}.csv`, header, dispatches.filter(d => !d.deleted).map(r => [
      r.dateOfDispatch, invoiceList(r), r.customer || '', dispatchPlantLabel(r), [...new Set((r.bundleEntries || []).map(b => skuDesc(b.skuCode)))].join('; '),
      (r.bundleEntries || []).reduce((s, b) => s + Number(b.pieces || 0), 0), fmtT(r.theoreticalWeight),
    ]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 4: Dispatch</h2>
        <Btn variant="ghost" onClick={downloadDispatchRecordsCSV} disabled={dispatches.filter(d => !d.deleted).length === 0}>⬇ Download CSV</Btn>
      </div>

      <DispatchOverview orders={orders} dispatches={dispatches} productions={productions} skus={skus}
        compareOrders={compareOrders ?? orders} compareDispatches={compareDispatches ?? dispatches} comparePlant={comparePlant}
        stateRegions={stateRegions} plants={plants} distributors={distributors} selectedPlant={selectedPlant} />

      <p className="text-xs text-slate-400">
        Dispatch (invoice) data is loaded from the daily <strong>Upload Invoice Excel</strong> on the
        Orders tab — the <strong>Zoho invoice register</strong>. That file is company-wide, so rows are kept
        only for the four plants this app covers — Hyderabad, NPMD, Lepakshi and Tapi, matched on the
        warehouse name, which is also what decides the plant — and <strong>Void</strong> invoices are dropped.
        One dispatch per invoice; SKUs matched by Item Name, pieces derived from the SKU master's weight
        per tube, coil trace &amp; cost inherited from Production FIFO. The register names no distributor and
        carries no ship-to state, so both — and the order line each invoice nets against — come off the
        <strong> order book</strong>, matched on the invoice's <strong>PurchaseOrder</strong>; upload the orders
        before the invoices or the lines read {UNMAPPED_REGION}. Each upload rebuilds
        <strong> only the dates its file covers</strong> — everything outside that window keeps its records,
        ids and coil allocations. <strong>To correct an older month, upload a file that covers it</strong>:
        a September file only ever rebuilds September. This view is read-only — Dispatch Records + the
        Invoice Reconciliation export below.
      </p>

      {/* An invoice is one record; plant lives on its entries. Deleting is all-or-nothing, so it is
          offered only when every line of every record is on screen. */}
      {plantScoped && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Showing one plant — <strong>Delete is unavailable</strong>. A dispatch record is one whole
          invoice and can only be deleted entire, so deleting one here would also remove lines
          belonging to other plants.{' '}
          {canWiden
            ? <>Switch to <strong>All Plants</strong> to delete.</>
            : <>Deleting an invoice is done from the <strong>All Plants</strong> view.</>}
        </p>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Invoice cost reconciliation export — one row per dispatch date × invoice × SKU</h3>
        <Btn variant="ghost" onClick={downloadReconciliationCSV} disabled={dispatches.filter(d => !d.deleted).length === 0}>
          Download Invoice Reconciliation (CSV)
        </Btn>
      </div>

      <Section title="Dispatch Records">
        <DataTable columns={columns} data={dispatches}
          onDelete={plantScoped ? undefined : softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MASTERS — SKU, Plant, Distributor
// ═══════════════════════════════════════════════════════════════
// One tab, three masters (ticket #129). They sit together because they are the same KIND of thing:
// the handful of facts the ERP does not ship and a person therefore has to state — a tube's weight,
// a plant's service area, a distributor's region when its state gets it wrong. The tab KEY is still
// `skuMaster`, so `accessFor` grants exactly what it granted before.
//
// `readOnly` (ticket #126) withholds every control that WRITES — the add form, Edit and Del. The
// catalog itself still renders in full: a plant user needs to look up a SKU's weight and price
// constantly, and it is one company-wide catalog, so there is nothing here to scope, only to lock.
// The reason it is admin-only is weightPerTube: it drives every plant's tonnage and cost, so two
// people editing it is two people changing every plant's numbers.
function SKUMaster({ skus, setSkus, productions, readOnly = false }) {
  const emptySku = { productType: 'SHS', skuCode: '', description: '', height: '', breadth: '', thickness: '', length: 6000, nominalBore: '', outsideDiameter: '', hsnCode: '72080000', status: 'published', weightPerTube: '', baseConversion: 2900, thicknessExtra: 0, ladderPrice: 2900, totalConversion: '' }
  const [form, setForm] = useState(emptySku)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Auto-generate SKU code and description
  useEffect(() => {
    if (form.height && form.breadth && form.thickness && form.length) {
      const code = `${form.productType}-${form.height}x${form.breadth}x${Number(form.thickness).toFixed(2)}`
      const desc = `MS ${form.productType} One Helix IS 4923 YSt 210 Black ${form.height}x${form.breadth}x${Number(form.thickness).toFixed(2)}x${form.length}`
      if (!editId) setForm(p => ({ ...p, skuCode: code, description: desc }))
    }
  }, [form.height, form.breadth, form.thickness, form.length, form.productType, editId])

  // Auto-derive ladder price and total conversion from cost inputs
  useEffect(() => {
    const base = Number(form.baseConversion) || 0
    const extra = Number(form.thicknessExtra) || 0
    const ladder = base + extra
    const wt = Number(form.weightPerTube) || 0
    const total = wt * ladder / 1000
    setForm(p => (p.ladderPrice === ladder && p.totalConversion === (wt ? total : '') ? p : { ...p, ladderPrice: ladder, totalConversion: wt ? total : '' }))
  }, [form.baseConversion, form.thicknessExtra, form.weightPerTube])

  const save = () => {
    // Guardrail: block duplicate SKUs for the same physical product (e.g. "…1.6x6000" vs
    // "…1.60x6000"). Decimal-format duplicates are what fragment inventory across two codes and
    // produce false negatives on the dashboard. Match on canonical identity, ignoring self.
    const key = canonicalSkuKey(form)
    const dup = key && skus.find(s => !s.deleted && s.id !== editId && canonicalSkuKey(s) === key)
    if (dup) {
      alert(`A SKU for this product already exists as "${dup.skuCode}" (${dup.description}).\nEdit that SKU instead of creating a duplicate.`)
      return
    }
    // Guardrail: a published SKU MUST carry a weight — otherwise every production and dispatch of it
    // is recorded as 0 tonnes with no error (the root cause of the frozen-zero weight bug). Drafts
    // may stay weightless while being prepared; they aren't selectable in Production.
    if (String(form.status) === 'published' && !(Number(form.weightPerTube) > 0)) {
      alert('A published SKU must have a "Weight per Tube (kg)" greater than 0.\nWithout it, production & dispatch weight for this SKU save as 0.\nEnter the weight, or set Status to "draft".')
      return
    }
    const record = { ...form, id: editId || uid() }
    if (editId) {
      setSkus(prev => prev.map(s => s.id === editId ? record : s))
    } else {
      setSkus(prev => [...prev, record])
    }
    setForm(emptySku); setEditId(null); setShowForm(false)
  }

  const startEdit = (row) => { setForm({ ...row }); setEditId(row.id); setShowForm(true) }
  const deleteSku = (row) => {
    // Guard: deleting a SKU that productions reference orphans them — they drop out of the live
    // weight recompute and revert to their frozen (often 0) stored weight. Block it, like the coil guards.
    const usedBy = (productions || []).filter(p => !p.deleted && p.skuCode === row.skuCode).length
    if (usedBy) { alert(`Cannot delete "${row.skuCode}" — ${usedBy} production record(s) reference it. Their weight would break. Set the SKU to "draft" instead.`); return }
    if (confirm('Delete SKU?')) setSkus(prev => prev.filter(s => s.id !== row.id))
  }

  const fmt2 = (v) => (v === null || v === undefined || v === '' ? '' : Number(v).toFixed(2))
  const columns = [
    { label: 'Type', key: 'productType' },
    { label: 'SKU Code', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'H', key: 'height' },
    { label: 'B', key: 'breadth' },
    { label: 'NB', key: 'nominalBore' },
    { label: 'OD', key: 'outsideDiameter' },
    { label: 'Thick', key: 'thickness' },
    { label: 'Length', key: 'length' },
    { label: 'HSN', key: 'hsnCode' },
    { label: 'Wt/Tube (kg)', key: 'weightPerTube', value: r => fmt2(r.weightPerTube) },
    { label: 'Ladder (₹/MT)', key: 'ladderPrice', value: r => r.ladderPrice ?? '' },
    { label: 'Total Conv. (₹)', key: 'totalConversion', value: r => fmt2(r.totalConversion) },
    { label: 'Status', value: r => r.status, render: r => <Badge ok={r.status === 'published'} text={r.status} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">SKU Master</h3>
        {!readOnly && <Btn onClick={() => { setForm(emptySku); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ Add SKU'}</Btn>}
      </div>

      {readOnly && (
        <p className="text-xs text-slate-400">
          The SKU catalog is maintained centrally — weight per tube sets the tonnage and cost every
          plant reports, so it is edited in one place. Ask an administrator to add or change a SKU.
        </p>
      )}

      {showForm && !readOnly && (
        <Section title={editId ? 'Edit SKU' : 'Add New SKU'}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Product Type"><Select value={form.productType} onChange={v => f('productType', v)} options={['SHS', 'RHS', 'CHS', 'ERW']} /></Field>
            <Field label="Height (mm)"><Input type="number" value={form.height} onChange={v => f('height', v)} /></Field>
            <Field label="Breadth (mm)"><Input type="number" value={form.breadth} onChange={v => f('breadth', v)} /></Field>
            <Field label="Thickness (mm)"><Input type="number" value={form.thickness} onChange={v => f('thickness', v)} step="0.01" /></Field>
            <Field label="Length (mm)"><Input type="number" value={form.length} onChange={v => f('length', v)} /></Field>
            <Field label="SKU Code" auto helper={editId ? 'Locked — renaming would orphan its productions' : ''}><Input value={form.skuCode} onChange={v => f('skuCode', v)} disabled={!!editId} /></Field>
            <Field label="Description" auto><Input value={form.description} onChange={v => f('description', v)} className="col-span-2" /></Field>
            <Field label="HSN Code"><Input value={form.hsnCode} onChange={v => f('hsnCode', v)} /></Field>
            <Field label="Nominal Bore"><Input value={form.nominalBore} onChange={v => f('nominalBore', v)} /></Field>
            <Field label="Outside Diameter"><Input value={form.outsideDiameter} onChange={v => f('outsideDiameter', v)} /></Field>
            <Field label="Status"><Select value={form.status} onChange={v => f('status', v)} options={['published', 'draft']} /></Field>
            <Field label="Weight per Tube (kg)"><Input type="number" value={form.weightPerTube} onChange={v => f('weightPerTube', v)} step="0.0001" /></Field>
            <Field label="Base Conversion (₹/MT)"><Input type="number" value={form.baseConversion} onChange={v => f('baseConversion', v)} /></Field>
            <Field label="Thickness Extra (₹/MT)"><Input type="number" value={form.thicknessExtra} onChange={v => f('thicknessExtra', v)} /></Field>
            <Field label="Ladder Price (₹/MT)" auto><Input type="number" value={form.ladderPrice} disabled /></Field>
            <Field label="Total Conversion (₹)" auto><Input value={fmt2(form.totalConversion)} disabled /></Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.skuCode} variant="success">{editId ? 'Update' : 'Save SKU'}</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title={`SKU Catalog (${skus.length} items)`}>
        <DataTable columns={columns} data={skus}
          onEdit={readOnly ? undefined : startEdit} onDelete={readOnly ? undefined : deleteSku} />
      </Section>
    </div>
  )
}

// ── PLANT MASTER — the service area (ticket #129) ───────────────────────────────────────────────
// One editable field on the whole section: which regions a plant ships to. Everything else on a
// plant comes from the ERP (its Ship From Code, its coil prefix) or from the code seed (whether it
// manufactures), so it is shown and locked — there is nothing here for a person to be right about.
//
// A checkbox per region rather than a text field, because the four regions are fixed and a typed
// "Wesr" would silently mean "serves nowhere". Commits on every click; the store write is upserted
// on `plant_id`, so the first edit of a seeded plant creates its row and every later edit updates it.
function PlantServesCell({ plant, serves, onCommit, disabled }) {
  const has = (r) => serves.some(x => x.toLowerCase() === r.toLowerCase())
  return (
    <span className="flex flex-wrap gap-2">
      {REGIONS.map(r => (
        <label key={r} className={`flex items-center gap-1 text-xs px-2 py-1 rounded border ${has(r)
          ? 'border-indigo-400 bg-indigo-50 text-indigo-800 dark:border-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-200'
          : 'border-slate-300 text-slate-500 dark:border-slate-600 dark:text-slate-400'} ${disabled ? 'opacity-50' : 'cursor-pointer'}`}>
          <input type="checkbox" className="accent-indigo-600" checked={has(r)} disabled={disabled}
            aria-label={`${plant.name} serves ${r}`}
            onChange={e => onCommit(e.target.checked
              ? [...serves.filter(x => x.toLowerCase() !== r.toLowerCase()), r]
              : serves.filter(x => x.toLowerCase() !== r.toLowerCase()))} />
          {r}
        </label>
      ))}
    </span>
  )
}

function PlantMaster({ plants, setPlants, readOnly = false }) {
  const master = useMemo(() => plantMaster(plants), [plants])

  // One row per plant, keyed on the plant's LITERAL id — never on the store row's uuid, which does
  // not exist until the first edit. Writing `serves: []` is a real answer ("serves nowhere") and is
  // stored as such; what restores the shipped default is deleting the row, which this screen does
  // not offer, because un-typing a commercial decision is not a thing an operator should do by
  // accident.
  const saveServes = useCallback((plantId, serves) => {
    if (!setPlants) return
    setPlants(prev => {
      const rows = prev || []
      const i = rows.findIndex(r => String(r.plantId || '') === plantId)
      if (i >= 0) { const next = [...rows]; next[i] = { ...next[i], serves, deleted: false }; return next }
      return [...rows, { id: crypto.randomUUID(), plantId, serves, deleted: false }]
    })
  }, [setPlants])

  const columns = [
    { label: 'Plant', key: 'name' },
    { label: 'ERP Ship From Code', value: r => r.erpCode, render: r => <span className="font-mono text-xs">{r.erpCode}</span> },
    { label: 'Coil Prefix', key: 'coilPrefix' },
    { label: 'Runs the pipeline', value: r => (r.manufactures ? 'Yes' : 'No'),
      render: r => <Badge ok={r.manufactures} text={r.manufactures ? 'Yes' : 'No'} /> },
    { label: 'Serves (regions)', value: r => (r.serves || []).join(', '),
      render: r => <PlantServesCell plant={r} serves={r.serves || []}
        disabled={readOnly || !setPlants} onCommit={v => saveServes(r.id, v)} /> },
  ]

  const unserved = REGIONS.filter(r => plantsServingRegion(r, master).size === 0)

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Plant Master</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        <strong>Serves</strong> is a plant’s <strong>service area</strong> — the regions it will actually ship to. It is the
        one thing here a person sets; the ERP code, coil prefix and whether the plant runs the pipeline all come from the ERP
        and are read-only. It decides which stock a distributor is shown on the <strong>Sales</strong> tab and in the
        PB MTD workbook: a distributor sees the stock of the plants that serve <strong>its</strong> region and of no others.
      </p>
      <DataTable columns={columns} data={master} />
      {unserved.length > 0 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          No plant serves <strong>{unserved.join(', ')}</strong> — distributors there are shown no stock at all, and their
          full pending as “Short by”. That is the true position while it holds; tick a region above the day it changes.
        </p>
      )}
    </div>
  )
}

// ── DISTRIBUTOR MASTER — the region override (ticket #129) ──────────────────────────────────────
// Region normally comes from the distributor's SHIP-TO STATE, which arrives with the ERP data and
// is never typed. This section is only for the exception that rule cannot express: a distributor
// whose state says one region but who is genuinely served as another.
//
// Blank is the ordinary value and means "use the state's region" — which is why clearing writes ''
// rather than deleting the row, and why the cell shows the inherited answer beside the select.
function DistributorRegionCell({ customer, state, inherited, override, onCommit, disabled }) {
  return (
    <span onClick={e => e.stopPropagation()} className="flex items-center gap-2">
      <select value={REGIONS.includes(override) ? override : ''} disabled={disabled}
        aria-label={`Region override for ${customer}`}
        title={`Override ${customer}'s region. Blank uses ${state ? `${state}'s` : 'the state'} mapping (${inherited}).`}
        onChange={e => onCommit(e.target.value)}
        className="w-28 px-2 py-1 rounded border border-blue-300 dark:border-blue-700 text-sm bg-blue-50/60 dark:bg-blue-900/20 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50">
        <option value="">(use state)</option>
        {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
      {!override && <span className="text-xs text-slate-400">→ {inherited}</span>}
    </span>
  )
}

function DistributorMaster({ rows, distributors, setDistributors, readOnly = false }) {
  const [onlyOverridden, setOnlyOverridden] = useState(false)

  const saveOverride = useCallback((row, region) => {
    if (!setDistributors) return
    setDistributors(prev => {
      const list = prev || []
      const i = list.findIndex(r => String(r.distributorKey || '') === row.id)
      if (i >= 0) {
        const next = [...list]
        next[i] = { ...next[i], distributorKey: row.id, distributorName: row.customer, region, deleted: false }
        return next
      }
      return [...list, { id: crypto.randomUUID(), distributorKey: row.id, distributorName: row.customer, region, deleted: false }]
    })
  }, [setDistributors])

  const data = useMemo(() => (onlyOverridden ? rows.filter(r => r.regionOverride) : rows), [rows, onlyOverridden])

  const columns = [
    { label: 'Distributor', value: r => r.customer, render: r => <span title={r.customer}>{distributorCode(r.customer, 3) || '—'}</span> },
    { label: 'State', value: r => r.state || '',
      render: r => r.state || <span className="text-slate-400" title="No state on this distributor's order or invoice lines">—</span> },
    { label: 'Region in use', value: r => r.region,
      render: r => <span className={r.regionOverride ? 'text-indigo-600 dark:text-indigo-400 font-medium' : ''}
        title={r.regionOverride ? 'Set here, overriding the state map' : 'Inherited from the state map'}>{r.region}</span> },
    { label: 'Override', value: r => r.regionOverride || '',
      render: r => <DistributorRegionCell customer={r.customer} state={r.state}
        inherited={r.inheritedRegion} override={r.regionOverride}
        disabled={readOnly || !setDistributors} onCommit={v => saveOverride(r, v)} /> },
  ]

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Distributor Master</h3>
        <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <input type="checkbox" className="accent-indigo-600" checked={onlyOverridden}
            onChange={e => setOnlyOverridden(e.target.checked)} />
          Show only overridden ({rows.filter(r => r.regionOverride).length})
        </label>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        A distributor’s region comes from its <strong>ship-to state</strong>, mapped on the <strong>Sales</strong> tab —
        map a state once and every distributor there follows it, new ones included. Set an <strong>Override</strong> here
        only for the exception that rule cannot express. Blank means “use the state’s region”, which is what almost every
        distributor should stay on. Region decides which plants’ stock the distributor is shown.
      </p>
      <DataTable columns={columns} data={data} maxHeight="60vh" />
    </div>
  )
}

// The tab itself: the three masters in one place, in the order they are used — a SKU is looked up
// daily, a service area a few times a year, an override almost never.
function Masters({ skus, setSkus, productions, orders, dispatches, stateRegions,
                   plants, setPlants, distributors, setDistributors, readOnly = false }) {
  // The distributor list comes from the SAME salesByDistributor the Sales tab and the workbook read,
  // so a region shown here is the region the stock pool is actually built from. `inheritedRegion` is
  // the second call with the overrides withheld — what the row would read if the override came off,
  // which is the only honest thing to print beside a blank select.
  const rows = useMemo(() => {
    const inherited = new Map(salesByDistributor(orders, dispatches, '', [], { stateRegions })
      .map(r => [r.id, r.region]))
    return salesByDistributor(orders, dispatches, '', [], { stateRegions, distributors })
      .map(r => ({ ...r, inheritedRegion: inherited.get(r.id) || UNMAPPED_REGION }))
      .sort((a, b) => a.customer.localeCompare(b.customer))
  }, [orders, dispatches, stateRegions, distributors])

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Masters</h2>
      <SKUMaster skus={skus} setSkus={setSkus} productions={productions} readOnly={readOnly} />
      <PlantMaster plants={plants} setPlants={readOnly ? null : setPlants} readOnly={readOnly} />
      <DistributorMaster rows={rows} distributors={distributors}
        setDistributors={readOnly ? null : setDistributors} readOnly={readOnly} />
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

// ── Plant-wise Tracker grid (ticket #174) ────────────────────────────────────────────────────────
// Purely presentational: it renders the structure `plantTrackerGrid` returns and computes NOTHING.
// Every figure on screen was already reconciled in `calc.js`, which is why there is one tested seam
// for the whole section and why the CSV export can read the same object and never disagree with it.
//
// `DataTable` is deliberately not used and not modified. It is a flat column table with per-column
// search, sorting and totals; this is a mother/sub-row grid with a fixed row set and no sorting —
// a different shape, not a variant, and bending DataTable into it would cost every other table.
function PlantTrackerTable({ grid }) {
  const dayCols = grid.columns.filter(c => !c.isMtd)
  // What prints and what does not is `trackerCellBlank`'s decision, not this component's — the CSV
  // export reads the same rule, so the file and the screen cannot drift apart on it.
  const cellText = (r, v) => trackerCellBlank(r, v)
    ? <span className="text-slate-300 dark:text-slate-600">—</span>
    : <span className={Number(v) < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{fmtT(v)}</span>
  return (
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md" style={{ maxHeight: '70vh' }}>
      <table className="min-w-full text-sm border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
            <th className="sticky left-0 z-30 bg-slate-100 dark:bg-slate-700 w-36 min-w-[9rem] max-w-[9rem] px-3 py-2 text-left font-semibold">Plant</th>
            <th className="sticky left-36 z-30 bg-slate-100 dark:bg-slate-700 w-44 min-w-[11rem] max-w-[11rem] px-3 py-2 text-left font-semibold border-r border-slate-300 dark:border-slate-500">KPI (MT)</th>
            <th className="px-3 py-2 text-right font-semibold border-r border-slate-300 dark:border-slate-500">MTD</th>
            {dayCols.map(c => <th key={c.key} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.blocks.map(b => b.rows.map((r, i) => {
            // Stock rows are shaded throughout the grid — the visual cue for the MTD column carrying
            // two kinds of arithmetic (a flow sums the month, a stock shows its latest close).
                    // Fully OPAQUE on both sides, not a tint: this class also paints the STICKY label cell,
            // and a translucent sticky cell lets the day columns scroll visibly underneath it.
            const bg = r.kind === 'stock' ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-800'
            const strong = b.isTotal ? 'font-semibold' : ''
            return (
              <tr key={`${b.id}-${r.key}`} className={`${bg} ${i === 0 ? 'border-t-2 border-slate-300 dark:border-slate-600' : ''}`}>
                {i === 0 && (
                  <td rowSpan={b.rows.length}
                    className="sticky left-0 z-10 bg-white dark:bg-slate-800 w-36 min-w-[9rem] max-w-[9rem] px-3 py-2 align-top font-semibold text-slate-900 dark:text-slate-100">
                    {b.name}
                  </td>
                )}
                <td className={`sticky left-36 z-10 ${bg} w-44 min-w-[11rem] max-w-[11rem] px-3 py-1.5 whitespace-nowrap border-r border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 ${strong}`}>
                  {r.label}
                </td>
                <td className={`px-3 py-1.5 text-right tabular-nums border-r border-slate-200 dark:border-slate-600 ${strong}`}>{cellText(r, r.mtd)}</td>
                {dayCols.map(c => (
                  <td key={c.key} className={`px-3 py-1.5 text-right tabular-nums ${strong}`}>{cellText(r, r.cells[c.key])}</td>
                ))}
              </tr>
            )
          }))}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// ── Inventory overview (ticket #232, part 2) — screens 2a–2g of the P&T Dashboard Pack.
// Every figure comes from `inventoryOverview` (calc.js); this component and its CSVs only read what
// it returns. Two scopes, on purpose (#230): the STOCK TABLE and the MOVEMENT are comparison blocks,
// fed `compare*` — every plant for an admin whatever the header says, the pinned plant for a plant
// login (`comparePlant`, which drops the Total). The drill panel and the trend read the header-scoped
// stores, as every other Dashboard block does.
// ═══════════════════════════════════════════════════════════════
const fmtD = (d) => d == null ? '—' : String(Math.round(d))
const fmtIso = (iso) => { const s = String(iso || ''); return s.length < 10 ? s : `${Number(s.slice(8, 10))}-${trackerDayLabel(s).split('-')[1]}-${s.slice(0, 4)}` }
const CELL_FLAG = { red: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 font-semibold', amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200' }

// A flat table whose CSV is its own columns: each column states the TEXT it prints, and the file is
// that text, row for row — so a screenshot and its download cannot disagree. `render` (optional)
// decorates the same text; `cls` colours a cell; `wrap` lets a long text column wrap; `onRow` makes
// a row open something.
// `text` is what prints and what the CSV holds; `render` decorates it. One exception since #303: the
// Dashboard's stock table regroups the CSV columns on screen and shows Status as Act / Watch / OK
// over the CSV's red / amber / green (docs/UI-PATTERNS.md, #303) — the file stays byte-identical.
// `groups` (#303) adds a header row above the columns ([{ label, span }]); a column with `rule` draws a
// thin line before itself, so a group reads as one. `dense` is the 28 px row of the #302 sheet.
function FlatTable({ label, cols, rows, rowKey, rowClass, onRow, empty = 'Nothing to show.', groups = null, dense = false }) {
  if (!rows.length) return <p className="text-sm text-slate-400 py-3">{empty}</p>
  const rule = (c) => c.rule ? 'border-l border-slate-200 dark:border-slate-600' : ''
  return (
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800">
      <table className="min-w-full text-sm" aria-label={label}>
        <thead>
          {groups && (
            <tr className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
              {groups.map((g, i) => <th key={i} colSpan={g.span} scope="colgroup"
                className={`px-3 pt-1.5 font-semibold whitespace-nowrap text-center ${i ? 'border-l border-slate-200 dark:border-slate-600' : ''}`}>{g.label}</th>)}
            </tr>
          )}
          <tr className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
            {cols.map((c, i) => <th key={c.label} className={`px-3 ${dense ? 'h-8 py-0' : 'py-2'} font-semibold whitespace-nowrap ${rule(c)} ${c.left || i === 0 ? 'text-left' : 'text-right'}`}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={rowKey ? rowKey(r) : ri} onClick={onRow ? () => onRow(r) : undefined}
              className={`border-t border-slate-200 dark:border-slate-700 ${onRow ? 'cursor-pointer hover:bg-indigo-50 dark:hover:bg-indigo-900/20' : ''} ${rowClass ? rowClass(r) : ''}`}>
              {cols.map((c, i) => (
                <td key={c.label} className={`px-3 ${dense ? 'h-7 py-0' : 'py-1.5'} ${c.wrap ? 'min-w-[14rem]' : 'whitespace-nowrap'} ${rule(c)} ${c.left || i === 0 ? 'text-left' : 'text-right tabular-nums'} ${c.cls ? c.cls(r) : ''}`}>
                  {c.render ? c.render(r) : c.text(r)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
const flatCSV = (filename, cols, rows) => downloadCSV(filename, cols.map(c => c.label), rows.map(r => cols.map(c => c.text(r))))

// ── Dashboard building blocks (#303), the #302 campaign sheet's visual rules: underline screen
// tabs, a segmented switch, a strip of plain numbers between thin rules, a plain block (no card,
// no shadow) whose scope is a visible line, status as a word with a red dot on Act only.
const DASH_RING = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
function ScreenTabs({ label, tabs, value, onChange }) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-x-6 gap-y-1 text-sm border-b border-slate-200 dark:border-slate-700">
      {tabs.map(([key, name]) => (
        <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}
          className={`pb-2 pt-1 -mb-px border-b-2 rounded-t ${DASH_RING} ${value === key
            ? 'border-indigo-600 text-slate-900 dark:text-white font-semibold'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'}`}>
          {name}
        </button>
      ))}
    </div>
  )
}
function Segmented({ label, options, value, onChange, role = null }) {
  return (
    <div role={role === 'tablist' ? 'tablist' : 'group'} aria-label={label} className="inline-flex flex-wrap rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden text-sm">
      {options.map(([key, name], i) => {
        const on = value === key
        const a11y = role === 'tablist' ? { role: 'tab', 'aria-selected': on } : { 'aria-pressed': on }
        return (
          <button key={String(key)} type="button" {...a11y} onClick={() => onChange(key)}
            className={`px-3 py-1 ${i ? 'border-l border-slate-300 dark:border-slate-600' : ''} ${DASH_RING} ${on
              ? 'bg-indigo-600 text-white font-semibold' : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
            {name}
          </button>
        )
      })}
    </div>
  )
}
// items: [{ label, value, unit, sub }]. `value` is the same text the table beside it prints.
function KpiStrip({ label, items }) {
  return (
    <dl aria-label={label} className="grid grid-cols-2 lg:grid-cols-4 gap-y-3 border-y border-slate-200 dark:border-slate-700 py-3 lg:divide-x divide-slate-200 dark:divide-slate-700 tabular-nums">
      {items.map((k, i) => (
        <div key={k.label} className={i === 0 ? 'pr-4' : 'px-4'}>
          <dt className="text-sm text-slate-500 dark:text-slate-400">{k.label}</dt>
          <dd className="text-2xl font-semibold text-slate-900 dark:text-white">{k.value}{k.unit && <span className="ml-1 text-sm font-normal text-slate-500 dark:text-slate-400">{k.unit}</span>}</dd>
          {k.sub && <dd className="text-xs text-slate-500 dark:text-slate-400">{k.sub}</dd>}
        </div>
      ))}
    </dl>
  )
}
function DashBlock({ title, scope, actions, children }) {
  return (
    <section aria-label={title} className="space-y-2 min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h3>
        <div className="flex flex-wrap items-center gap-2 text-xs">{actions}</div>
      </div>
      {scope && <p className="text-xs text-slate-600 dark:text-slate-300">{scope}</p>}
      {children}
    </section>
  )
}
const StatusWord = ({ status }) => (
  <span className="inline-flex items-center gap-1.5">
    {status === 'red' && <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-red-600" />}
    <span className={status === 'red' ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-700 dark:text-slate-200'}>{INVENTORY_STATUS_WORD[status] || status}</span>
  </span>
)
// One Export menu for every CSV the Dashboard makes (#303): each item runs the export it replaced,
// unchanged, so a file is byte-identical to the old button's. items: [{ label, run, disabled, note }].
function ExportMenu({ items }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  const btn = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') { setOpen(false); btn.current?.focus() } }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button ref={btn} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(o => !o)}
        className={`px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 ${DASH_RING}`}>
        Export ▾
      </button>
      {open && (
        <div role="menu" aria-label="Export" className="absolute right-0 z-40 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-1 text-sm">
          {items.map(it => (
            <button key={it.label} type="button" role="menuitem" disabled={it.disabled}
              onClick={() => { setOpen(false); it.run() }}
              className={`block w-full px-3 py-1.5 text-left ${DASH_RING} ${it.disabled ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed' : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              {it.label}
              {it.note && <span className="block text-xs text-slate-500 dark:text-slate-400">{it.note}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
const DASH_SCREENS = [['overview', 'Overview'], ['drill', 'Plant drill'], ['movement', 'Stock movement'], ['tracker', 'Plant-wise Tracker'], ['sales', 'Sales & activity']]

// ── Drill-panel filters. Each tab has its own; a filter is a way of LOOKING — totals are rebuilt
// from the rows kept (`sumGridRows`), never left at the unfiltered figure. Empty selection = all.
// One decimal, as the Planning master prints it ("2.0", "1.6"); a finer gauge keeps its own digits.
const thkLabel = (t) => {
  const n = Number(t)
  if (t == null || t === '' || !Number.isFinite(n)) return '—'
  return Number.isInteger(Math.round(n * 1e6) / 1e5) ? n.toFixed(1) : String(n)
}
// The values present, numbers in numeric order ("1.6" before "10"), anything else after, "—" last.
const drillOptions = (values) => [...new Set(values.filter(v => v !== '' && v != null))].sort((a, b) => {
  const x = parseFloat(a), y = parseFloat(b), fx = Number.isFinite(x), fy = Number.isFinite(y)
  if (fx && fy && x !== y) return x - y
  if (fx !== fy) return fx ? -1 : 1
  if ((a === '—') !== (b === '—')) return a === '—' ? 1 : -1
  return String(a).localeCompare(String(b))
})
function DrillFilters({ defs, values, onChange }) {
  const active = defs.some(f => (values[f.key] || []).length)
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      {defs.map(f => (
        <MultiSelectFilter key={f.key} label={f.label} options={f.options} selected={values[f.key] || []}
          onChange={v => onChange({ ...values, [f.key]: v })} />
      ))}
      {active && <Btn size="sm" variant="ghost" onClick={() => onChange({})}>Clear filters</Btn>}
    </div>
  )
}

// The keys stay 2b–2g: they name the CSV files, which do not change (#303). Only the labels do.
const DRILL_TABS = [
  { key: '2b', label: 'Coil & FG grid' }, { key: '2c', label: 'Old coil' }, { key: '2d', label: 'Slit waiting' },
  { key: '2e', label: 'FG ageing' }, { key: '2g', label: 'SKU cover' },
]

function InventoryOverview({ coils, babyCoils, productions, dispatches, orders, skus,
  compareCoils, compareBabyCoils, compareProductions, compareDispatches, comparePlant = null,
  plants = PLANTS, selectedPlant = ALL_PLANTS, screens = {}, exports = [] }) {
  const todayStr = today()
  // #303: the Dashboard's screen tab, a UI preference kept on this device (`jsw:dashScreen`), never data.
  const [screen, setScreenState] = useState(() => { const v = LS.get('jsw:dashScreen'); return DASH_SCREENS.some(([k]) => k === v) ? v : 'overview' })
  const setScreen = (k) => { setScreenState(k); try { LS.set('jsw:dashScreen', k) } catch { /* storage blocked: the tab still switches */ } }
  // The region switch narrows the Overview's comparison rows to the plants serving that region
  // (`plants.serves`); its total is the All total run on those rows (`inventoryRegionStock`).
  const [region, setRegion] = useState(INVENTORY_ALL_REGIONS)
  const [from, setFrom] = useState(`${todayStr.slice(0, 7)}-01`)
  const [to, setTo] = useState(todayStr)
  // The drill panel opens on the header's plant (or a plant login's own) — under All Plants it waits
  // for a click, because the screen does not know which plant the reader means.
  const headerPlant = selectedPlant === ALL_PLANTS ? null : selectedPlant
  const [picked, setPicked] = useState(null)
  const drillPlant = headerPlant ?? picked
  const [drillTab, setDrillTab] = useState('2b')
  // Filters per drill tab ({ [tab]: { [key]: [values] } }) and the FG families opened into their
  // thicknesses. Both reset when the panel moves to another plant — its options differ.
  const [drillFilters, setDrillFilters] = useState({})
  const [openFams, setOpenFams] = useState(() => new Set())
  useEffect(() => { setDrillFilters({}); setOpenFams(new Set()) }, [drillPlant])

  const ov = useMemo(() => inventoryOverview({
    coils, babyCoils, productions, dispatches, orders, skus,
    compareCoils, compareBabyCoils, compareProductions, compareDispatches, comparePlant,
    plants, from, to, today: todayStr, drillPlant,
  }), [coils, babyCoils, productions, dispatches, orders, skus, compareCoils, compareBabyCoils, compareProductions, compareDispatches,
    comparePlant, plants, from, to, todayStr, drillPlant])

  const compareSuffix = comparePlant != null ? plantFileSuffix(comparePlant) : ''
  const th = ov.thresholds
  const period = `${ov.from}-to-${ov.to}`
  // A plant row opens its drill panel only where the header scope holds that plant's rows — the panel
  // follows the header (#230), so under NPMD a click on Hyderabad would open an empty panel.
  const canDrill = (r) => r.plant !== ALL_PLANTS && (headerPlant == null || r.plant === headerPlant)

  const stockRows = [...ov.stock.rows, ...(ov.stock.total ? [ov.stock.total] : [])]
  const isTotal = (r) => r.plant === ALL_PLANTS
  const stockCols = [
    { label: 'Status', text: r => r.status, render: r => <StatusDot status={r.status} /> },
    { label: 'Plant', left: true, text: r => r.name,
      render: r => canDrill(r) ? <span className="text-indigo-600 dark:text-indigo-400 underline decoration-dotted">{r.name}</span> : r.name },
    { label: 'HR coil', text: r => fmtT(r.mother) },
    { label: 'Slit coil', text: r => fmtT(r.slit) },
    { label: 'Total coil', text: r => fmtT(r.coil) },
    { label: `Coil > ${th.coilOldDays} d`, text: r => fmtT(r.coilOver30), cls: r => r.coilOver30 > 0.05 ? 'text-red-600 dark:text-red-400 font-semibold' : '' },
    { label: 'Avg coil age (d)', text: r => fmtD(r.avgCoilAgeDays) },
    { label: `Slit waiting ${th.slitWaitDays}+ d`, text: r => fmtT(r.slitWaiting8), cls: r => r.slitWaiting8 > 0.05 ? 'text-amber-600 dark:text-amber-400' : '' },
    { label: 'FG', text: r => fmtT(r.fg) },
    { label: `FG > ${th.fgOldDays} d`, text: r => fmtT(r.fgOver75), cls: r => r.fgOver75 > 0.05 ? 'text-red-600 dark:text-red-400 font-semibold' : '' },
    { label: 'Cover (d)', text: r => fmtD(r.coverDays) },
  ]

  const mv = [...ov.movement.rows, ...(ov.movement.total ? [ov.movement.total] : [])]
  const motherCols = [
    { label: 'Plant', text: r => r.name },
    { label: 'Opening', text: r => fmtT(r.mother.opening) },
    { label: '+ Inward', text: r => fmtT(r.mother.in) },
    { label: '− Slit', text: r => fmtT(r.mother.out) },
    { label: '= Closing (book)', text: r => fmtT(r.mother.closing) },
    { label: '− Not stock (left on slit coils)', text: r => fmtT(r.mother.notStock.total) },
    { label: '= HR coil stock', text: r => fmtT(r.mother.stock) },
  ]
  const slitCols = [
    { label: 'Plant', text: r => r.name },
    { label: 'Opening', text: r => fmtT(r.slit.opening) },
    { label: '+ Slit', text: r => fmtT(r.slit.in) },
    // ADR-0015: an assigned coil is used WHOLE, on the day it is assigned — so the book IS the stock
    // and there is no leftover line to bridge.
    { label: '− Used by production (whole coil)', text: r => fmtT(r.slit.out) },
    { label: '= Slit coil stock', text: r => fmtT(r.slit.stock) },
  ]
  const fgCols = [
    { label: 'Plant', text: r => r.name },
    { label: 'Opening', text: r => fmtT(r.fg.opening) },
    { label: '+ Produced', text: r => fmtT(r.fg.in) },
    { label: '− Invoiced', text: r => fmtT(r.fg.out) },
    { label: '= Closing (produced − invoiced)', text: r => fmtT(r.fg.closing) },
    { label: '+ Dispatched w/o production', text: r => fmtT(r.fg.dispatchedWithoutProduction), cls: r => r.fg.dispatchedWithoutProduction > 0.05 ? 'text-rose-600 dark:text-rose-400' : '' },
    { label: '= FG stock', text: r => fmtT(r.fg.stock) },
  ]
  const downloadMovementCSV = () => downloadCSV(`inventory-movement-${period}${compareSuffix}.csv`,
    ['Stage', ...motherCols.map(c => c.label)],
    [
      ...mv.map(r => ['HR coil', ...motherCols.map(c => c.text(r))]),
      ['Slit coil', ...slitCols.map(c => c.label)],
      ...mv.map(r => ['Slit coil', ...slitCols.map(c => c.text(r))]),
      ['FG', ...fgCols.map(c => c.label)],
      ...mv.map(r => ['FG', ...fgCols.map(c => c.text(r))]),
    ])

  const d = ov.drill
  const drillSuffix = d ? plantFileSuffix(d.plant) : ''
  const keep = (tab, key, value) => { const sel = (drillFilters[tab] || {})[key] || []; return !sel.length || sel.includes(value) }

  // 2b — HR coil and slit coil, two grids; the Thickness filter narrows both and the FG grid.
  const coilGridCols = (g) => !g ? [] : [
    { label: 'Thickness (mm)', text: r => r.isTotal ? 'Total' : thkLabel(r.thickness) },
    ...g.bands.map((b, i) => ({ label: `${b} d`, text: r => fmtT(r.cells[i].weight), cls: r => CELL_FLAG[r.cells[i].flag] || '' })),
    { label: 'Total', text: r => fmtT(r.total) },
  ]
  const coilGridView = (g) => {
    if (!g) return []
    const rows = g.rows.filter(r => keep('2b', 'thickness', thkLabel(r.thickness)))
    const sum = sumGridRows(rows, null, g.bands.length)
    return rows.length ? [...rows, { cells: sum.cells, total: sum.total, isTotal: true }] : []
  }
  const coilGrids = d ? [
    { key: 'hr', title: 'HR coil MT by thickness × age', label: 'HR coil by thickness and age', empty: 'No HR coil in stock.', cols: coilGridCols(d.hrGrid), rows: coilGridView(d.hrGrid) },
    { key: 'slit', title: 'Slit coil MT by thickness × age', label: 'Slit coil by thickness and age', empty: 'No slit coil in stock.', cols: coilGridCols(d.slitGrid), rows: coilGridView(d.slitGrid) },
  ] : []

  // 2b — FG by family; a family opens into its thicknesses. Under a Thickness filter a family is the
  // sum of the thicknesses kept, so the grid still adds up.
  const thkFiltered = ((drillFilters['2b'] || {}).thickness || []).length > 0
  const fgFamilies = !d ? [] : d.fgGrid.rows
    .filter(r => keep('2b', 'section', r.section) && keep('2b', 'family', r.family))
    .map(r => {
      const subs = r.thicknesses.filter(t => keep('2b', 'thickness', thkLabel(t.thickness)))
      return thkFiltered ? { ...r, ...sumGridRows(subs, d.fgGrid.bandFlags), thicknesses: subs } : r
    })
    .filter(r => r.thicknesses.length)
  const toggleFam = (family) => setOpenFams(prev => { const n = new Set(prev); n.has(family) ? n.delete(family) : n.add(family); return n })
  const allFamsOpen = fgFamilies.length > 0 && fgFamilies.every(r => openFams.has(r.family))
  const fgGridCols = d ? [
    { label: 'Family', text: r => r.isSub ? `${r.family} · ${thkLabel(r.thickness)} mm` : r.family,
      render: r => r.isTotal ? r.family
        : r.isSub ? <span className="pl-5 text-slate-500 dark:text-slate-400">{r.family} · {thkLabel(r.thickness)} mm</span>
        : <span><span className="inline-block w-4 text-slate-400">{openFams.has(r.family) ? '▾' : '▸'}</span>{r.family}</span> },
    ...d.fgGrid.bands.map((b, i) => ({ label: `${b} d`, text: r => fmtT(r.cells[i].weight), cls: r => CELL_FLAG[r.cells[i].flag] || '' })),
    { label: 'Total FG', text: r => fmtT(r.total) },
    { label: 'Pending to Serve', text: r => fmtT(r.pendingToServe) },
  ] : []
  const fgGridRows = []
  fgFamilies.forEach(r => {
    fgGridRows.push(r)
    if (openFams.has(r.family)) r.thicknesses.forEach(t => fgGridRows.push({ ...t, family: r.family, isSub: true }))
  })
  if (fgFamilies.length) {
    const sum = sumGridRows(fgFamilies, null, d.fgGrid.bands.length)
    fgGridRows.push({ family: 'Total', cells: sum.cells, total: sum.total, pendingToServe: sum.pendingToServe, isTotal: true })
  }

  const coilListCols = [
    { label: 'Coil', text: r => r.id },
    { label: 'Kind', left: true, text: r => r.kind === 'slit' ? 'Slit' : 'HR' },
    { label: 'HR coil', left: true, text: r => r.hrCoilId },
    { label: 'Thickness (mm)', text: r => r.thickness == null ? '—' : String(r.thickness) },
    { label: 'Width (mm)', text: r => r.width == null ? '—' : String(r.width) },
    { label: 'MT', text: r => fmtT3(r.weight) },
    { label: 'HR coil inward', text: r => r.inwardDate || '—' },
    { label: 'Age (d)', text: r => fmtD(r.ageDays) },
  ]
  const slitListCols = [
    { label: 'Slit coil', text: r => r.id },
    { label: 'HR coil', left: true, text: r => r.hrCoilId },
    { label: 'Thickness (mm)', text: r => r.thickness == null ? '—' : String(r.thickness) },
    { label: 'Width (mm)', text: r => r.width == null ? '—' : String(r.width) },
    { label: 'MT left', text: r => fmtT3(r.weight) },
    { label: 'Slit on', text: r => r.slitDate || '—' },
    { label: 'Days since slit', text: r => fmtD(r.daysSinceSlit) },
    { label: 'Band', text: r => r.band, cls: r => r.band === `${th.slitWaitDays}+` ? CELL_FLAG.amber : '' },
  ]
  const lotCols = [
    { label: 'SKU', text: r => r.skuCode },
    { label: 'Description', left: true, wrap: true, text: r => r.description },
    { label: 'Family', left: true, text: r => r.family },
    { label: 'Produced on', text: r => r.date || '—' },
    { label: 'MT left', text: r => fmtT3(r.weight) },
    { label: 'Age (d)', text: r => fmtD(r.ageDays) },
    { label: 'Flag', text: r => r.flag, cls: r => r.flag === 'Breach' ? CELL_FLAG.red : r.flag ? CELL_FLAG.amber : '' },
  ]
  // 2g reads as the Planning master: Section, then Size, then Thk — each printed once per group on
  // screen (the CSV prints every row in full, so it sorts and filters in Excel).
  const coverCols = [
    { label: 'Section', left: true, text: r => r.section, render: r => r.firstOfSection ? <span className="font-medium text-slate-900 dark:text-white">{r.section}</span> : '' },
    { label: 'Size', left: true, text: r => r.family, render: r => r.firstOfSize ? <span title={r.skuCodes.join(', ')}>{r.family}</span> : '' },
    { label: 'Thk (mm)', text: r => thkLabel(r.thickness) },
    { label: 'ABC', text: r => r.abc },
    { label: 'FG MT', text: r => fmtT(r.fg) },
    { label: 'FG age (d)', text: r => fmtD(r.ageDays) },
    { label: 'Confirmed', text: r => fmtT(r.confirmed) },
    { label: 'Invoiced 30 d', text: r => fmtT(r.invoiced30) },
    { label: 'Cover (d)', text: r => fmtD(r.coverDays) },
    { label: 'Stock-out days', text: r => String(r.stockOutDays), cls: r => r.stockOutDays > 0 ? 'text-amber-600 dark:text-amber-400' : '' },
  ]

  // Each tab's own filters. `value` reads a row; options are the values the plant's rows hold.
  const fThk = { key: 'thickness', label: 'Thickness', value: r => thkLabel(r.thickness) }
  const fWidth = { key: 'width', label: 'Width', value: r => r.width == null || r.width === '' ? '—' : String(r.width) }
  const fSection = { key: 'section', label: 'Section', value: r => r.section || '—' }
  const fFamily = { key: 'family', label: 'Family', value: r => r.family || '—' }
  const listSource = !d ? {} : { '2c': d.oldCoils, '2d': d.slitWaiting.rows, '2e': d.fgLots, '2g': d.skuCover }
  const listDefs = {
    '2c': [{ key: 'kind', label: 'Kind', value: r => r.kind === 'slit' ? 'Slit' : 'HR' }, fThk, fWidth],
    '2d': [{ key: 'band', label: 'Days since slit', value: r => r.band }, fThk, fWidth],
    '2e': [fSection, fFamily, fThk, { key: 'flag', label: 'Flag', value: r => r.flag || 'None' }],
    '2g': [fSection, { ...fFamily, label: 'Size' }, fThk, { key: 'abc', label: 'ABC', value: r => r.abc }],
  }
  const filterDefs = !d ? [] : drillTab === '2b' ? [
    { key: 'thickness', label: 'Thickness', options: drillOptions([
      ...d.hrGrid.rows, ...d.slitGrid.rows, ...d.fgGrid.rows.flatMap(r => r.thicknesses)].map(r => thkLabel(r.thickness))) },
    { key: 'section', label: 'FG section', options: drillOptions(d.fgGrid.rows.map(r => r.section)) },
    { key: 'family', label: 'FG family', options: drillOptions(d.fgGrid.rows.map(r => r.family)) },
  ] : listDefs[drillTab].map(f => ({ ...f, options: drillOptions(listSource[drillTab].map(f.value)) }))
  const filtered = (tab) => (listSource[tab] || []).filter(r => listDefs[tab].every(f => keep(tab, f.key, f.value(r))))
  const slitKept = d ? filtered('2d') : []
  const slitBands = d ? d.slitWaiting.bands.map(b => {
    const in_ = slitKept.filter(r => r.band === b.label)
    return { label: b.label, weight: in_.reduce((t, r) => t + r.weight, 0), count: in_.length }
  }) : []
  const coverRows = (d ? filtered('2g') : []).map((r, i, all) => ({
    ...r, firstOfSection: i === 0 || all[i - 1].section !== r.section,
    firstOfSize: i === 0 || all[i - 1].section !== r.section || all[i - 1].family !== r.family,
  }))
  const drillTable = !d ? null : {
    '2c': { file: 'coil-over-30d', cols: coilListCols, rows: filtered('2c'), label: `Coil older than ${th.coilOldDays} days`, empty: `No coil is older than ${th.coilOldDays} days.` },
    '2d': { file: 'slit-waiting', cols: slitListCols, rows: slitKept, label: 'Slit coil waiting', empty: 'No slit coil in stock.' },
    '2e': { file: 'fg-ageing', cols: lotCols, rows: filtered('2e'), label: `FG batches older than ${th.fgListDays} days`, empty: `No FG batch is older than ${th.fgListDays} days.` },
    '2g': { file: 'sku-cover', cols: coverCols, rows: coverRows, label: 'SKU cover', empty: 'No size stocked, confirmed or invoiced in the last 30 days.',
      rowClass: r => r.firstOfSize ? 'border-t-slate-300 dark:border-t-slate-500' : 'border-t-slate-100 dark:border-t-slate-800' },
  }[drillTab]
  const downloadDrillCSV = () => {
    if (drillTab === '2b') {
      // Three grids, one file: each grid keeps its OWN header row, exactly as on screen (filters and
      // the families opened into thicknesses included).
      const block = (name, cols, rows) => [['Grid', ...cols.map(c => c.label)], ...rows.map(r => [name, ...cols.map(c => c.text(r))])]
      const [head, ...hr] = block('HR coil', coilGrids[0].cols, coilGrids[0].rows)
      downloadCSV(`inventory-2b-plant-grid-${ov.to}${drillSuffix}.csv`, head, [
        ...hr, [],
        ...block('Slit coil', coilGrids[1].cols, coilGrids[1].rows), [],
        ...block('FG', fgGridCols, fgGridRows),
      ])
      return
    }
    flatCSV(`inventory-${drillTab}-${drillTable.file}-${ov.to}${drillSuffix}.csv`, drillTable.cols, drillTable.rows)
  }
  const trendCols = [
    { label: 'Month', text: r => r.label },
    { label: 'Closes on', text: r => r.close },
    { label: 'Coil (HR + slit)', text: r => fmtT(r.coil) },
    { label: 'FG (produced − invoiced)', text: r => fmtT(r.fg) },
  ]
  const inputCls = 'px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100'
  const link = `text-indigo-700 dark:text-indigo-300 underline decoration-dotted underline-offset-2 hover:text-indigo-900 dark:hover:text-indigo-100 rounded ${DASH_RING}`

  // ── #303 layout: everything below READS what is above; nothing new is computed in here. ──
  const regions = servedRegions(plants)
  const showRegion = comparePlant == null && regions.length > 0
  const regionView = showRegion ? inventoryRegionStock(ov.stock, region, plants) : ov.stock
  const regionNarrowed = showRegion && region !== INVENTORY_ALL_REGIONS
  const viewRows = [...regionView.rows, ...(regionView.total ? [regionView.total] : [])]
  const kpi = regionView.total || regionView.rows[0] || null
  // The screen table prints the CSV columns' own text (`stockCols`), regrouped under Coil and
  // Current inventory; the CSV keeps the old order and the colour words, so its file is unchanged.
  const sc = Object.fromEntries(stockCols.map(c => [c.label, c]))
  const bold = (v) => v >= INVENTORY_NEEDS_LOOK_MT ? 'font-semibold text-slate-900 dark:text-white' : ''
  const stockScreenCols = [
    { ...sc.Plant, cls: undefined },
    { label: 'Status', left: true, text: sc.Status.text, render: r => <StatusWord status={r.status} /> },
    { label: 'HR', rule: true, text: sc['HR coil'].text },
    { label: 'Slit', text: sc['Slit coil'].text },
    { label: 'Total', text: sc['Total coil'].text },
    { label: `> ${th.coilOldDays} d`, text: sc[`Coil > ${th.coilOldDays} d`].text, cls: r => bold(r.coilOver30) },
    { label: 'Avg age (d)', text: sc['Avg coil age (d)'].text },
    { label: `Slit ${th.slitWaitDays}+ d`, text: sc[`Slit waiting ${th.slitWaitDays}+ d`].text },
    { label: 'FG', rule: true, text: sc.FG.text, cls: () => 'font-semibold text-slate-900 dark:text-white' },
    { label: `> ${th.fgOldDays} d`, text: sc[`FG > ${th.fgOldDays} d`].text, cls: r => bold(r.fgOver75) },
    { label: 'Cover (d)', text: sc['Cover (d)'].text },
  ]
  const stockGroups = [{ label: '', span: 2 }, { label: 'Coil (MT)', span: 6 }, { label: 'Current inventory (MT)', span: 3 }]
  const regionPlants = regionNarrowed ? regionView.rows.map(r => r.name).join(', ') || 'no plant serves it' : ''
  const stockScope = comparePlant != null ? 'This table shows your plant only.'
    : `This table covers all plants regardless of the header plant selector.${regionNarrowed ? ` Region ${region}: ${regionPlants}.` : ''}`
  // Month-end stock as two rows × months — the trend's own figures, as text.
  const monthCols = [{ label: 'MT', left: true, text: r => r.label },
    ...ov.trend.map(m => ({ label: m.label, text: r => fmtT(m[r.key]) }))]
  const monthRows = [{ key: 'coil', label: 'Coil (HR + slit)' }, { key: 'fg', label: 'Current inventory' }]
  const trendScope = `${selectedPlant === ALL_PLANTS ? 'All plants' : plantLabel(selectedPlant)} — follows the header plant selector, not the region switch.`
  // "Needs a look": the stock table's own flagged tonnage, linking into the drill tab that lists it.
  const NEEDS_TEXT = { coilOld: `coil past ${th.coilOldDays} days`, fgOld: `current inventory past ${th.fgOldDays} days`, slitWait: `slit coil waiting ${th.slitWaitDays}+ days` }
  const needs = inventoryNeedsLook(regionView.rows)
  const tabName = (key) => DRILL_TABS.find(t => t.key === key)?.label || key
  const openDrill = (plant, tab) => { if (headerPlant == null) setPicked(plant); if (tab) setDrillTab(tab); setScreen('drill') }
  const drillPick = ov.stock.rows.filter(canDrill)

  const exportItems = [
    { label: 'Stock by plant CSV', run: () => flatCSV(`inventory-stock-${ov.to}${compareSuffix}.csv`, stockCols, stockRows),
      note: regionNarrowed ? 'Every plant, not only the region shown' : '' },
    { label: 'Month-end stock CSV', run: () => flatCSV(`inventory-trend-${ov.to}${plantFileSuffix(selectedPlant)}.csv`, trendCols, ov.trend) },
    { label: 'Stock movement CSV', run: downloadMovementCSV },
    { label: d ? `Plant drill CSV — ${d.name}, ${tabName(drillTab)}` : 'Plant drill CSV', run: downloadDrillCSV, disabled: !d,
      note: d ? 'The drill tab as it is open, filters included' : 'Pick a plant on Plant drill first' },
    ...exports,
  ]
  const onPeriodScreen = screen === 'overview' || screen === 'drill' || screen === 'movement'

  return (
    <div className="space-y-4 text-slate-700 dark:text-slate-200">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Dashboard</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Stock and ageing are <strong>as of {fmtIso(ov.to)}</strong>; movement runs <strong>{fmtIso(ov.from)} → {fmtIso(ov.to)}</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {screen === 'overview' && showRegion && (
            <Segmented label="Region" value={region} onChange={setRegion}
              options={[[INVENTORY_ALL_REGIONS, 'All'], ...regions.map(r => [r, r])]} />
          )}
          {onPeriodScreen && (
            <div role="group" aria-label="Period" className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
              <span>Period</span>
              <input type="date" aria-label="From" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} className={inputCls} />
              <span aria-hidden="true">–</span>
              <input type="date" aria-label="To" value={to} min={from} max={todayStr} onChange={e => e.target.value && setTo(e.target.value)} className={inputCls} />
            </div>
          )}
          <ExportMenu items={exportItems} />
        </div>
      </div>

      <ScreenTabs label="Dashboard screen" tabs={DASH_SCREENS} value={screen} onChange={setScreen} />

      {/* Every screen stays mounted and is only hidden, so each export reads the screen's own state
          (filters, sort, the open drill tab) whichever tab the Export menu is opened from. */}
      <div hidden={screen !== 'overview'}>
        <div className="space-y-6">
          {kpi && (
            <KpiStrip label={`Stock summary — ${kpi.name}`} items={[
              { label: 'Coil (HR + slit)', value: fmtT(kpi.coil), unit: 'MT', sub: `HR ${fmtT(kpi.mother)} · slit ${fmtT(kpi.slit)}` },
              { label: 'Current inventory', value: fmtT(kpi.fg), unit: 'MT', sub: `Cover ${fmtD(kpi.coverDays)} d` },
              { label: `Coil > ${th.coilOldDays} d`, value: fmtT(kpi.coilOver30), unit: 'MT', sub: `Avg coil age ${fmtD(kpi.avgCoilAgeDays)} d` },
              { label: `FG > ${th.fgOldDays} d`, value: fmtT(kpi.fgOver75), unit: 'MT', sub: <>Status <StatusWord status={kpi.status} /> · {kpi.name}</> },
            ]} />
          )}

          <DashBlock title={`Stock by plant as of ${fmtIso(ov.to)}`} scope={stockScope}
            actions={<span className="text-slate-500 dark:text-slate-400">{th.caption}</span>}>
            <FlatTable label="Inventory stock by plant" cols={stockScreenCols} rows={viewRows} groups={stockGroups} dense
              rowKey={r => r.plant || 'unattributed'}
              rowClass={r => `${isTotal(r) ? 'font-semibold bg-slate-50 dark:bg-slate-900' : ''} ${d && r.plant === d.plant ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}
              onRow={r => canDrill(r) && openDrill(r.plant, null)} />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {headerPlant == null ? 'Click a plant to open it on Plant drill.' : `Click ${plantLabel(headerPlant)} to open it on Plant drill.`}
            </p>
            <details className="text-xs text-slate-600 dark:text-slate-300">
              <summary className={`cursor-pointer font-medium text-indigo-700 dark:text-indigo-300 ${DASH_RING} rounded`}>How these numbers are worked out · thresholds</summary>
              <ul className="mt-1.5 list-disc pl-5 space-y-1 max-w-4xl">
                <li>HR coil = unslit coils, whole. Slit coil = slit coils not yet assigned to a production, at full slit weight.</li>
                <li>Coil age counts from the HR coil’s inward date, never reset by slitting; the average is tonnage-weighted.</li>
                <li>FG = produced − invoiced per SKU, positive stock only, aged by production batch (invoices take the oldest batch first).</li>
                <li>Cover = FG ÷ average daily Invoiced over the {th.coverWindowDays} days ending {fmtIso(ov.to)}.</li>
                <li>{th.caption}. Act: coil &gt; {th.coilOldDays} d ≥ {th.coilOldRedMt} MT or FG &gt; {th.fgOldDays} d ≥ {th.fgOldRedMt} MT. Watch: any coil &gt; {th.coilOldDays} d or FG &gt; {th.fgOldDays} d. OK: neither. A total takes its worst plant.</li>
                <li>The region switch shows the plants whose service area (Plant master) names that region; its total adds those plants only. Unattributed stock sits at no plant, so it shows under All plants only. The CSV always holds every plant.</li>
                <li>The CSV writes the status as red / amber / green, as before: red = Act, amber = Watch, green = OK.</li>
              </ul>
            </details>
          </DashBlock>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-6">
            <DashBlock title="Month-end stock" scope={trendScope}>
              <FlatTable label="Month-end stock" cols={monthCols} rows={monthRows} rowKey={r => r.key} dense />
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Each month’s close, rebuilt from dated records (the Plant-wise Tracker’s month-end); {fmtIso(ov.to)}’s month closes on To.
                Current inventory here is produced − invoiced. Slit coil is slit coils not yet assigned to a production as at each month-end (<code>docs/adr/0015</code>).
              </p>
            </DashBlock>
            <DashBlock title="Needs a look" scope={comparePlant != null ? 'Your plant only.' : regionNarrowed ? `Region ${region}.` : 'All plants.'}>
              {needs.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Nothing past the thresholds.</p>
              ) : (
                <ul className="border-t border-slate-200 dark:border-slate-700 text-sm">
                  {needs.map(n => {
                    const row = ov.stock.rows.find(r => r.plant === n.plant)
                    const text = `${n.name}: ${fmtT(n.weight)} MT ${NEEDS_TEXT[n.kind]}`
                    return (
                      <li key={`${n.plant}|${n.kind}`} className="flex items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-700 h-8">
                        <span className="flex items-center gap-2 min-w-0">
                          {row?.status === 'red' && <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 shrink-0" />}
                          <span className="truncate">{text}</span>
                        </span>
                        {row && canDrill(row)
                          ? <button type="button" onClick={() => openDrill(n.plant, n.tab)} className={`${link} whitespace-nowrap text-xs`}>{tabName(n.tab)} →</button>
                          : <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{tabName(n.tab)}</span>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </DashBlock>
          </div>

          <details className="text-xs text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700 pt-2">
            <summary className={`cursor-pointer font-medium text-indigo-700 dark:text-indigo-300 ${DASH_RING} rounded`}>What lives on the other tabs</summary>
            <p className="mt-1.5 max-w-4xl">
              Plant drill: the coil &amp; FG grid, old coil, slit waiting, FG ageing and SKU cover of one plant. Stock movement: the three reconciliation tables.
              Plant-wise Tracker: every plant’s day for one month. Sales &amp; activity: the sales, activity, coil and FG figures, SKU-wise inventory, the production
              and dispatch trend, alerts and recent activity. Every CSV is on the Export menu. Nothing was removed, only moved.
            </p>
          </details>
        </div>
      </div>

      <div hidden={screen !== 'drill'}>
        <DashBlock title={d ? `Plant drill — ${d.name}` : 'Plant drill'}
          scope={comparePlant != null ? 'Your plant only.'
            : selectedPlant === ALL_PLANTS ? 'Follows the header plant selector (All Plants).' : `Follows the header plant selector (${plantLabel(selectedPlant)}).`}
          actions={<span className="text-slate-500 dark:text-slate-400">{th.caption}</span>}>
          {headerPlant == null && drillPick.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Plant</span>
              <Segmented label="Drill plant" value={picked} onChange={setPicked}
                options={drillPick.map(r => [r.plant, r.name])} />
              {d && <button type="button" onClick={() => setPicked(null)} className={link}>Close</button>}
            </div>
          )}
          {!d ? (
            <p className="text-sm text-slate-400">Pick a plant above, or click one in the stock table on Overview, to open its drill panel.</p>
          ) : (
            <>
              <Segmented role="tablist" label="Drill panel" value={drillTab} onChange={setDrillTab}
                options={DRILL_TABS.map(t => [t.key, t.label])} />
              <div className="mt-3">
                <DrillFilters defs={filterDefs} values={drillFilters[drillTab] || {}}
                  onChange={v => setDrillFilters(all => ({ ...all, [drillTab]: v }))} />
              </div>
              {drillTab === '2b' ? (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="space-y-4">
                    {coilGrids.map(g => (
                      <div key={g.key}>
                        <div className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{g.title}</div>
                        <FlatTable label={g.label} cols={g.cols} rows={g.rows} dense
                          rowClass={r => r.isTotal ? 'font-semibold bg-slate-50 dark:bg-slate-900' : ''} empty={g.empty} />
                      </div>
                    ))}
                    {d.undatedCoil > 0.0005 && (
                      <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                        {fmtT3(d.undatedCoil)} T of coil has no inward date, so it has no age: it is in the stock table on Overview but in neither grid here.
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-slate-700 dark:text-slate-200">FG MT by family × age</span>
                      {fgFamilies.length > 0 && (
                        <button type="button" className={`text-xs font-medium ${link}`}
                          onClick={() => setOpenFams(allFamsOpen ? new Set() : new Set(fgFamilies.map(r => r.family)))}>
                          {allFamsOpen ? 'Collapse all' : 'Open all thicknesses'}
                        </button>
                      )}
                    </div>
                    <FlatTable label="FG by family and age" cols={fgGridCols} rows={fgGridRows} rowKey={r => r.isSub ? `${r.family}|${r.thickness}` : r.family} dense
                      onRow={r => !r.isTotal && toggleFam(r.family)}
                      rowClass={r => r.isTotal ? 'font-semibold bg-slate-50 dark:bg-slate-900' : r.isSub ? 'bg-slate-50/60 dark:bg-slate-900/40' : ''}
                      empty="No FG in stock and nothing pending." />
                  </div>
                </div>
              ) : (
                <>
                  {drillTab === '2d' && (
                    <KpiStrip label="Slit coil by days since slit" items={slitBands.map(b => ({
                      label: `${b.label} d since slit`, value: fmtT(b.weight), unit: 'T', sub: `${b.count} coil${b.count === 1 ? '' : 's'}`,
                    }))} />
                  )}
                  <div className={drillTab === '2d' ? 'mt-3' : ''}>
                    <FlatTable label={drillTable.label} cols={drillTable.cols} rows={drillTable.rows} empty={drillTable.empty} rowClass={drillTable.rowClass} dense />
                  </div>
                </>
              )}
              <details className="mt-2 text-xs text-slate-600 dark:text-slate-300">
                <summary className={`cursor-pointer font-medium text-indigo-700 dark:text-indigo-300 ${DASH_RING} rounded`}>About {tabName(drillTab)}</summary>
                <p className="mt-1.5 max-w-4xl">
                  {drillTab === '2b' && <>HR coil = unslit HR coils, whole; slit coil = slit coils not yet assigned to a production. Both are aged from the HR coil’s inward date.
                    Cells: red past {th.coilOldDays} d for coil and past {th.fgOldDays} d for FG; amber {th.fgListDays + 1}–{th.fgOldDays} d for FG. Family is “NN NB” or “HxB”; click a family to open it by thickness. Pending to Serve = Confirmed + Non-confirmed at this plant.
                    Thickness filters all three grids; FG section and FG family filter the FG grid. Totals add up the rows kept.</>}
                  {drillTab === '2c' && <>Coil older than {th.coilOldDays} days, biggest tonnage first, aged from the HR coil’s inward date.</>}
                  {drillTab === '2d' && <>Slit coil still in stock by days since it was slit; {th.slitWaitDays}+ days is waiting for a mill.</>}
                  {drillTab === '2e' && <>FG production batches older than {th.fgListDays} days, oldest first. Auction list past {th.fgAuctionDays} days, Breach past {th.fgBreachDays} days. What is left of a batch is after invoices took the oldest batches first.</>}
                  {drillTab === '2g' && <>Laid out as the Planning master: section, size, thickness. Every SKU code of one size and thickness adds up in one row (hover a size for its codes), each code floored at 0 first.
                    Confirmed is netted against invoices already raised. Cover = FG ÷ average daily Invoiced over {th.coverWindowDays} days. Stock-out days = days this month, up to To, on which no SKU of that size and thickness had produced − invoiced above zero here.
                    ABC ranks this plant’s sizes by MT invoiced over the last {th.abcWindowDays} days (A: the top 70%, B: the next 20%, C: the rest or no sale).</>}
                  {' '}The CSV file names keep the old codes ({drillTab}).
                </p>
              </details>
            </>
          )}
        </DashBlock>
      </div>

      <div hidden={screen !== 'movement'}>
        <DashBlock title={`Stock movement ${fmtIso(ov.from)} → ${fmtIso(ov.to)}`}
          scope={comparePlant == null ? 'All plants regardless of the header plant selector.' : 'Your plant only.'}>
          <div className="space-y-4">
            {[['HR coil', motherCols], ['Slit coil', slitCols], ['FG', fgCols]].map(([title, cols]) => (
              <div key={title}>
                <div className="mb-1 text-sm font-medium text-slate-700 dark:text-slate-200">{title}</div>
                <FlatTable label={`${title} movement`} cols={cols} rows={mv} rowKey={r => r.plant || 'unattributed'} dense
                  rowClass={r => isTotal(r) ? 'font-semibold bg-slate-50 dark:bg-slate-900' : ''} />
              </div>
            ))}
          </div>
          {!ov.checks.movementTiesToStock && (
            <p role="status" className="text-sm font-semibold text-slate-900 dark:text-white">
              Warning: the movement does not tie to the stock table — do not read this section until the gap is explained.
            </p>
          )}
          <details className="text-xs text-slate-600 dark:text-slate-300">
            <summary className={`cursor-pointer font-medium text-indigo-700 dark:text-indigo-300 ${DASH_RING} rounded`}>How the movement reconciles</summary>
            <p className="mt-1.5 max-w-4xl">
              Opening is the close of the day before From. Each stage reconciles on the book — opening + in − out = closing — the Plant-wise Tracker’s replay over the same dated records.
              The book is then bridged to the stock table: for HR coil, coil left on a slit HR coil comes off; for FG, invoices with no production behind them are added back, so FG stock − Dispatched w/o production = produced − invoiced.
              Slit coil needs no bridge: a slit coil counts as used whole, at its slit weight, on the day a production is first assigned to it (<code>docs/adr/0015</code>).
            </p>
          </details>
        </DashBlock>
      </div>

      <div hidden={screen !== 'tracker'}>{screens.tracker}</div>
      <div hidden={screen !== 'sales'}>{screens.sales}</div>
    </div>
  )
}

// `tracker*` are the stores the HEADER PLANT SELECTOR has not touched. The Plant-wise Tracker below
// ignores that selector on purpose — a plant comparison scoped to one plant is not a comparison — so
// it cannot read the filtered props every other block on this screen uses. They arrive under distinct
// names precisely so no existing block can pick one up by accident.
//
// It does NOT ignore the login boundary. For a plant login these arrays are already that plant's
// only (see InventoryApp), so the other plants' tonnage never reaches this component at all, and
// `trackerPlant` carries the same plant id so the grid drops its TOTAL block. Absent from the data,
// not merely unrendered.
//
// Since #303 (design A) the tab is five screen tabs. The Inventory overview owns the header, the tabs
// and the Export menu; this component's sections — the old "More" area of #231/#232 — are handed to
// it as the Plant-wise Tracker and Sales & activity screens, their figures UNCHANGED. Its CSVs join
// the Export menu as they were. No bars or charts: the trend is a table of the same numbers.
function Dashboard({ coils, productions, dispatches, skus, babyCoils, orders,
  trackerCoils = [], trackerBabyCoils = [], trackerProductions = [], trackerDispatches = [],
  trackerPlant = null, trackerPlants = PLANTS, selectedPlant = ALL_PLANTS }) {
  const active = (arr) => (arr || []).filter(x => !x.deleted)
  const ac = active(coils), ap = active(productions), ad = active(dispatches)
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])
  const todayStr = today()

  // ── Period filter (scopes ACTIVITY + trend; on-hand stock stays current). ──
  const [period, setPeriod] = useState('all')
  const [monthSel, setMonthSel] = useState(todayStr.slice(0, 7))
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = useMemo(() => periodRange(period, { today: todayStr, monthSel, customFrom, customTo }),
    [period, todayStr, monthSel, customFrom, customTo])
  const inRange = useCallback((d) => inDateRange(d, range), [range])
  const monthLabel = (key) => new Date(key + '-01T00:00:00Z').toLocaleString('en-US', { month: 'long', year: 'numeric' })
  const periodLabel = period === 'all' ? 'All Time' : period === '7d' ? 'Last 7 Days'
    : period === 'mtd' ? 'Month to Date' : period === 'custom' ? 'Custom Range' : monthLabel(monthSel)
  // Calendar months that actually have data (earliest activity → current month), newest first.
  const monthsWithData = (dates) => dataMonthKeys(dates, todayStr).map(key => ({ key, label: monthLabel(key) }))
  const monthOptions = useMemo(() => monthsWithData([
    ...ac.map(c => c.dateOfInward), ...ap.map(p => p.dateOfProduction),
    ...ad.map(d => d.dateOfDispatch), ...(orders || []).filter(o => !o.deleted).map(o => o.orderDate),
  ]), [ac, ap, ad, orders, todayStr])

  // ── Plant-wise Tracker (ticket #174) ──
  // Its own month, on purpose: the Dashboard's period picker scopes the cards and the trend, and
  // moving one must not move the other. Defaulting to the current month makes the common case cost
  // no clicks. The options come from the SAME derivation the picker above uses, over the tracker's
  // own (unfiltered) stores, so the dropdown can never offer a month with nothing in it.
  const [trackerMonth, setTrackerMonth] = useState(todayStr.slice(0, 7))
  const trackerMonthOptions = useMemo(() => monthsWithData([
    ...(trackerCoils || []).filter(c => !c.deleted).map(c => c.dateOfInward),
    ...(trackerBabyCoils || []).filter(b => !b.deleted).map(b => b.dateOfConversion),
    ...(trackerProductions || []).filter(p => !p.deleted).map(p => p.dateOfProduction),
    ...(trackerDispatches || []).filter(d => !d.deleted).map(d => d.dateOfDispatch),
  ]), [trackerCoils, trackerBabyCoils, trackerProductions, trackerDispatches, todayStr])

  // One pure call produces every figure in the section — blocks, rows, day columns, MTD cells, all
  // reconciled and ordered. Memoised on the stores and the month like every other derived value here.
  const trackerGrid = useMemo(() => plantTrackerGrid({
    coils: trackerCoils, babyCoils: trackerBabyCoils, productions: trackerProductions,
    dispatches: trackerDispatches, month: trackerMonth, today: todayStr, plant: trackerPlant,
    plants: trackerPlants,
  }), [trackerCoils, trackerBabyCoils, trackerProductions, trackerDispatches, trackerMonth, todayStr, trackerPlant, trackerPlants])

  // Exactly what is on screen: same blocks, same order, same month, same newest-first columns. It
  // reads the rendered grid and computes nothing, so the file and a screenshot cannot disagree. A
  // CSV has no row spans, so the merged plant name repeats down its block's first column.
  const downloadTrackerCSV = () => {
    const out = (r, v) => trackerCellBlank(r, v) ? '' : fmtT(v)
    const rows = trackerGrid.blocks.flatMap(b =>
      b.rows.map(r => [b.name, r.label, out(r, r.mtd), ...trackerGrid.days.map(d => out(r, r.cells[d]))]))
    downloadCSV(`plant-tracker-${trackerGrid.month}.csv`,
      ['Plant', 'KPI (MT)', 'MTD', ...trackerGrid.days.map(trackerDayLabel)], rows)
  }

  // ── Activity KPIs (all MT) — scoped to the selected period. ──
  const activity = useMemo(() => ({
    coilInward: ac.filter(c => inRange(c.dateOfInward)).reduce((s, c) => s + Number(c.actualWeight || 0), 0),
    produced: ap.filter(p => inRange(p.dateOfProduction)).reduce((s, p) => s + Number(p.totalWeight || 0), 0),
  }), [ac, ap, inRange])

  // ── Sales KPIs (Confirmed / Non-confirmed / Invoiced) — the SAME helper the Sales dashboard uses,
  // so the two screens always agree. MTD Invoice = current calendar month; Confirmed / Non-confirmed
  // are the carried-forward order-book snapshot. ──
  const sales = useMemo(() => salesKpis(orders, ad, todayStr.slice(0, 7)), [orders, ad, todayStr])

  // ── Coil metrics (current snapshot, all MT) ──
  // Dispatched weight per mother coil (entry coilAllocations; legacy traceHrCoilId fallback).
  const dispByCoil = useMemo(() => {
    const out = {}
    ad.flatMap(d => d.bundleEntries || []).forEach(be => {
      const allocs = (be.coilAllocations && be.coilAllocations.length) ? be.coilAllocations
        : (be.traceHrCoilId ? [{ hrCoilId: be.traceHrCoilId, weight: be.weight }] : [])
      allocs.forEach(a => { out[a.hrCoilId] = (out[a.hrCoilId] || 0) + Number(a.weight || 0) })
    })
    return out
  }, [ad])

  const coil = useMemo(() => {
    const activeBaby = (babyCoils || []).filter(b => !b.deleted)
    const consumedBaby = coilConsumption(ap, null, 'babyCoilId') // baby-coil weight consumed by production
    const slitMothers = new Set(activeBaby.map(b => b.hrCoilId))
    let totalInward = 0, fullDispatchedWt = 0, fullDispatchedN = 0, fullCoilLeft = 0
    ac.forEach(c => {
      const aw = Number(c.actualWeight || 0)
      totalInward += aw
      // ≥95% dispatched → treat the whole coil as dispatched.
      if (aw > 0 && (dispByCoil[c.hrCoilId] || 0) / aw >= 0.95) { fullDispatchedWt += aw; fullDispatchedN++ }
      // Full coil left = whole, unslit mother coils only (no baby coils yet).
      if (!slitMothers.has(c.hrCoilId)) fullCoilLeft += aw
    })
    // Baby coils left = what is still STOCK: baby coils no live production has been assigned to,
    // at their full slit weight (ADR-0015 — one coil, one run). What is left on an assigned coil
    // is not stock and is not shown here. `babyCoilStock` is the same helper the Coil Tracker and
    // the Raw Material report read.
    const babyLeft = babyCoilStock(activeBaby, consumedBaby)
    return { totalInward, fullDispatchedWt, fullDispatchedN, babyLeft, fullCoilLeft }
  }, [ac, ap, babyCoils, dispByCoil])

  // ── SKU-wise inventory (all MT, no pieces). Per SKU: totalOrders, totalInvoiced,
  // pendingDispatch (Confirmed + Non-confirmed — same as the Dashboard "Pending to Dispatch"),
  // inventory (produced − invoiced), free (inventory − reserved). Union of stocked ∪ ordered SKUs;
  // negative-free rows sort first. ──
  const skuRows = useMemo(() => skuInventoryRows(ap, ad, orders, skus, inRange, todayStr), [ap, ad, orders, skus, inRange, todayStr])

  // Over-dispatched SKUs have NEGATIVE per-SKU inventory (dispatched > produced) and over-committed
  // SKUs negative free. A SKU can't HOLD negative stock, so rows floor at 0 for display — but that
  // pipe physically left the plant, so its tonnage must still come off the total. Accumulate both:
  // `inventory`/`free` are the floored sums (they tie to the visible table rows) and `unmatched`/
  // `overCommitted` carry what the floor dropped. The FG cards below subtract them back out.
  // Per-row values stay negative (surfaced by the over-dispatch alert + the "Negative" table filter).
  const skuTotals = useMemo(() => skuRows.reduce(
    (t, r) => ({
      totalOrders: t.totalOrders + r.totalOrders, totalInvoiced: t.totalInvoiced + r.totalInvoiced,
      invoicedVsOrders: t.invoicedVsOrders + r.invoicedVsOrders,
      pendingDispatch: t.pendingDispatch + r.pendingDispatch, inventory: t.inventory + Math.max(0, r.inventory),
      reserved: t.reserved + r.reserved, free: t.free + Math.max(0, r.free),
      unmatched: t.unmatched - Math.min(0, r.inventory),      // magnitude of dispatch with no production
      overCommitted: t.overCommitted - Math.min(0, r.free),   // magnitude of reservation beyond stock
      negSkus: t.negSkus + (r.inventory < -EPS_MT ? 1 : 0),
    }),
    { totalOrders: 0, totalInvoiced: 0, invoicedVsOrders: 0, pendingDispatch: 0, inventory: 0, reserved: 0,
      free: 0, unmatched: 0, overCommitted: 0, negSkus: 0 }
  ), [skuRows])

  // Portfolio stock age = inventory-weighted average of the per-SKU ageing (for the table TOTAL row).
  const portfolioAge = useMemo(() => {
    let wt = 0, aw = 0
    for (const r of skuRows) if (r.ageDays != null && r.inventory > 0) { wt += r.inventory; aw += r.inventory * r.ageDays }
    return wt > 0 ? aw / wt : NaN
  }, [skuRows])

  // SKU-wise inventory table filter helpers — Type (SHS/RHS/CHS) and Size (e.g. 150x150 / 32 NB)
  // come from the SKU master, falling back to the description. The DataTable handles the actual
  // filtering + per-column totals; the FG metric cards below stay over ALL SKUs (skuTotals).
  const skuTypeOf = useCallback((code, desc) => skus.find(s => s.skuCode === code)?.productType
    || (/\b(SHS|RHS|CHS)\b/i.exec(desc || '')?.[1]?.toUpperCase() ?? ''), [skus])
  const skuSizeOf = useCallback((code, desc) =>
    skuSizeLabel(skus.find(s => s.skuCode === code), desc), [skus])
  const redIfNeg = (v) => <span className={Number(v) < 0 ? 'text-red-600 font-semibold' : ''}>{fmtT(v)}</span>
  // Stock-age colour: fresh ≤30d green, ≤60d amber, older red (data spans ~108d, so >60d = slow mover).
  const ageClass = (d) => d <= 30 ? 'text-green-600 dark:text-green-400'
    : d <= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400 font-semibold'

  // Columns + filters for the SKU-wise Inventory DataTable (Excel-like). Production / Reserved /
  // Inventory / Ageing / Free are live; Pending to Dispatch follows the period filter. Free = Inventory − Reserved.
  const skuInvCols = [
    { label: 'SKU Code', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'Production (T)', value: r => r.production, render: r => fmtT(r.production), total: v => fmtT(v) },
    { label: 'Pending to Dispatch (T)', value: r => r.pendingDispatch, render: r => fmtT(r.pendingDispatch), total: v => fmtT(v) },
    { label: 'Reserved (T)', value: r => r.reserved, render: r => fmtT(r.reserved), total: v => fmtT(v) },
    { label: 'Inventory (T)', value: r => r.inventory, totalValue: r => Math.max(0, r.inventory), render: r => fmtT(r.inventory), total: v => fmtT(v) },
    // Ageing = tonnage-weighted avg age (days) of on-hand stock, FIFO (first produced, first out).
    // "—" when there's no positive stock (e.g. over-dispatched). TOTAL row shows the portfolio avg.
    {
      label: 'Ageing (days)', value: r => r.ageDays ?? -1,
      render: r => r.ageDays == null
        ? <span className="text-slate-400">—</span>
        : <span className={`tabular-nums ${ageClass(r.ageDays)}`} title={r.oldestAgeDays != null ? `Oldest: ${Math.round(r.oldestAgeDays)}d` : undefined}>{Math.round(r.ageDays)}</span>,
      total: () => Number.isFinite(portfolioAge) ? Math.round(portfolioAge) : '—',
    },
    { label: 'Free Inventory (T)', value: r => r.free, totalValue: r => Math.max(0, r.free), render: r => redIfNeg(r.free), total: v => redIfNeg(v) },
  ]
  const skuInvFilters = [
    { key: 'type', label: 'Type', accessor: r => skuTypeOf(r.skuCode, r.description), options: ['SHS', 'RHS', 'CHS'] },
    { key: 'size', label: 'Size', accessor: r => skuSizeOf(r.skuCode, r.description) },
    { key: 'inv', label: 'Inventory', accessor: r => r.inventory > 0 ? 'In stock' : r.inventory < 0 ? 'Negative' : 'Zero', options: ['In stock', 'Zero', 'Negative'] },
    { key: 'reserved', label: 'Reserved', accessor: r => r.reserved > 0 ? 'Reserved' : 'None', options: ['Reserved', 'None'] },
  ]
  // Live filtered/searched/sorted rows of the SKU-wise Inventory table, so the CSV exports the on-screen view.
  const skuInvExportRef = useRef([])

  // ── FG metrics (all MT). The cards are the PLANT total = Σ produced − Σ dispatched, so the
  // floored row-sums have their dropped negatives subtracted back out. This deliberately makes the
  // cards differ from the SKU table's TOTAL row by exactly `unmatched` — that gap is the whole point
  // and is shown on its own card, not hidden. ──
  const fgLeft = skuTotals.inventory - skuTotals.unmatched
  const fgReserved = skuTotals.reserved
  const freeFg = skuTotals.free - skuTotals.overCommitted
  const fgUnmatched = skuTotals.unmatched

  // ── Production vs dispatch trend, scoped to the period filter (daily ≤31 days, else weekly).
  // When period = All Time the window spans the earliest production/dispatch date → today. ──
  const trend = useMemo(() => {
    const toStr = range.to || todayStr
    let fromStr = range.from
    if (!fromStr) {
      const dates = [...ap.map(p => p.dateOfProduction), ...ad.map(d => d.dateOfDispatch)].filter(Boolean)
      fromStr = dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : toStr
    }
    if (fromStr > toStr) return { data: [], weekly: false }
    const from = new Date(fromStr), to = new Date(toStr)
    const spanDays = Math.max(1, Math.round((to - from) / 86400000) + 1)
    const weekly = spanDays > 31
    const bucketKey = (dStr) => {
      if (!weekly) return dStr
      const d = new Date(dStr)
      const day = d.getDay()
      d.setDate(d.getDate() - (day === 0 ? 6 : day - 1)) // Monday of that week
      return d.toISOString().split('T')[0]
    }
    const buckets = {}
    for (let ms = from.getTime(); ms <= to.getTime(); ms += 86400000 * (weekly ? 7 : 1)) {
      buckets[bucketKey(new Date(ms).toISOString().split('T')[0])] = { produced: 0, dispatched: 0 }
    }
    ap.forEach(p => {
      if (!inRange(p.dateOfProduction)) return
      const b = buckets[bucketKey(p.dateOfProduction)]
      if (b) b.produced += Number(p.totalWeight || 0)
    })
    ad.forEach(d => {
      if (!inRange(d.dateOfDispatch)) return
      const b = buckets[bucketKey(d.dateOfDispatch)]
      if (b) b.dispatched += (d.bundleEntries || []).reduce((s, e) => s + Number(e.weight || 0), 0)
    })
    let keys = Object.keys(buckets).sort()
    if (keys.length > 31) keys = keys.slice(-31)
    return {
      weekly,
      data: keys.map(k => ({
        name: (weekly ? 'Wk ' : '') + k.slice(5),
        produced: +buckets[k].produced.toFixed(1),
        dispatched: +buckets[k].dispatched.toFixed(1),
      })),
    }
  }, [ap, ad, range, todayStr, inRange])

  // ── Alerts ──
  const alerts = useMemo(() => {
    const list = []
    // Production shortfall: a batch could not be fully attributed to eligible coil stock
    ap.filter(p => p.status === 'partial' || p.status === 'unallocated').forEach(p => {
      list.push({
        type: p.status === 'unallocated' ? 'error' : 'warn',
        msg: `Production ${p.dateOfProduction ? `on ${p.dateOfProduction} ` : ''}(${skuDesc(p.skuCode)}) ${p.status === 'unallocated' ? 'has no coil assigned' : 'is only partially allocated'} — short on eligible coil stock`,
      })
    })
    // Dispatch weight variance outside ±5%
    ad.forEach(d => {
      if (!d.vehicleWeight) return
      const chk = tolerance(Number(d.theoreticalWeight), Number(d.vehicleWeight))
      const invs = [...new Set((d.bundleEntries || []).map(e => e.invoiceNo).filter(Boolean))].join(', ') || d.invoiceNo || '—'
      if (!chk.ok) list.push({ type: 'error', msg: `Dispatch variance: invoice ${invs} (${d.dateOfDispatch}) — theoretical ${fmtT(d.theoreticalWeight)}T vs vehicle ${fmtT(d.vehicleWeight)}T` })
    })
    // Dispatched beyond recorded production: SKUs whose all-time invoiced weight exceeds produced
    // weight (negative inventory). Surfaces missing/under-recorded production at the source — and,
    // until the SKU master is deduped, any decimal-format mis-coded SKUs too.
    const overDispatched = skuRows.filter(r => r.inventory < -EPS_MT)
    if (overDispatched.length) {
      const totalShort = overDispatched.reduce((s, r) => s - r.inventory, 0)
      const neverMade = overDispatched.filter(r => (r.production || 0) <= 0).length
      list.push({
        type: 'warn',
        msg: `${overDispatched.length} SKU(s) dispatched beyond recorded production (${fmtT(totalShort)}T net${neverMade ? `, ${neverMade} with no production recorded` : ''}) — review SKU-wise inventory`,
      })
    }
    // (Bundle Formation was removed — no pending-bundle alert.)
    // Coils awaiting production for >14 days (no production has drawn from them yet)
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
    const producedIds = new Set(ap.flatMap(p => (p.coilAllocations || []).map(a => a.hrCoilId)).filter(Boolean))
    ac.filter(c => !producedIds.has(c.hrCoilId) && c.dateOfInward < fourteenDaysAgo).forEach(c => {
      list.push({ type: 'warn', msg: `Coil ${c.hrCoilId} awaiting production for >14 days` })
    })
    return list
  }, [ac, ap, ad, todayStr, skuDesc, skuRows])

  // ── Recent activity across all stages ──
  const recentActivity = useMemo(() => {
    const ev = []
    ac.forEach(c => ev.push({ date: c.dateOfInward, stage: 'Inward', msg: `Coil ${c.hrCoilId} received — ${fmtT(c.actualWeight)}T${c.coilGrade ? `, ${c.coilGrade}` : ''}` }))
    ap.forEach(p => ev.push({ date: p.dateOfProduction, stage: 'Produced', msg: `${p.tubeCount} pcs of ${skuDesc(p.skuCode)} produced (${(p.coilAllocations || []).map(a => a.babyCoilId || a.hrCoilId).join(', ') || 'no coil'})` }))
    ad.forEach(d => ev.push({ date: d.dateOfDispatch, stage: 'Dispatch', msg: `Invoice ${d.invoiceNo || '—'} — ${(d.bundleEntries || []).length} line(s), ${fmtT(d.theoreticalWeight)}T, vehicle ${d.vehicleNo || '—'}` }))
    return ev.filter(e => e.date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 10)
  }, [ac, ap, ad, skuDesc])

  // ── CSV exports ──
  const downloadStockCSV = () => {
    const rows = ac.map(c => {
      const producedWt = ap.flatMap(p => p.coilAllocations || []).filter(a => a.hrCoilId === c.hrCoilId).reduce((s, a) => s + Number(a.weight || 0), 0)
      const rawRem = Math.max(0, Number(c.actualWeight || 0) - producedWt)
      const dispWt = ad.flatMap(d => d.bundleEntries || []).flatMap(be => (be.coilAllocations && be.coilAllocations.length ? be.coilAllocations : (be.traceHrCoilId ? [{ hrCoilId: be.traceHrCoilId, weight: be.weight }] : []))).filter(a => a.hrCoilId === c.hrCoilId).reduce((s, a) => s + Number(a.weight || 0), 0)
      const readyWt = Math.max(0, producedWt - dispWt)
      return [
        c.hrCoilId, c.coilGrade || '', c.thickness ?? '', c.width ?? '', fmtT(c.actualWeight),
        fmtT(rawRem), fmtT(readyWt), fmtT(dispWt),
      ]
    })
    downloadCSV(`stock-report-${todayStr}.csv`,
      ['HR Coil', 'Grade', 'Thickness (mm)', 'Width (mm)', 'Actual Wt (T)', 'Raw Remaining (T)', 'Ready Wt (T)', 'Dispatched Wt (T)'],
      rows)
  }

  const downloadSkuCSV = () => {
    downloadCSV(`sku-report-${todayStr}.csv`,
      ['SKU Code', 'Description', 'Production (T)', 'Pending to Dispatch (T)', 'Reserved (T)', 'Inventory (T)', 'Ageing (days)', 'Free Inventory (T)'],
      skuInvExportRef.current.map(r => [r.skuCode, r.description, fmtT(r.production), fmtT(r.pendingDispatch), fmtT(r.reserved), fmtT(r.inventory), r.ageDays == null ? '—' : Math.round(r.ageDays), fmtT(r.free)]))
  }

  const sel = 'px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100'
  const tonnes = (v) => `${fmtT(v)} T`
  const trackerScreen = (
    <DashBlock title="Plant-wise Tracker"
      scope={trackerPlant == null
        ? <>This section covers <strong>all plants regardless of the header plant selector</strong> — comparing plants is the point of it — and follows its own month, not the Period or the Activity period.</>
        : <>This section shows <strong>your plant only</strong>, and follows its own month rather than the Period or the Activity period.</>}
      actions={
        <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">Month
          <select value={trackerMonth} onChange={e => setTrackerMonth(e.target.value)} aria-label="Tracker month" className={sel}>
            {trackerMonthOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      }>
      <PlantTrackerTable grid={trackerGrid} />
      {/* The tripwire for the day Unattributed tonnage appears. Renders nothing on a clean month. */}
      {trackerGrid.excluded && (
        <p role="status" className="text-xs text-slate-900 dark:text-white">
          <strong>TOTAL excludes tonnage that resolves to no plant</strong> — {trackerGrid.excluded.rows.map(r => `${r.label} ${fmtT(r.amount)} T`).join(', ')}.
          Fix the plant on those rows (Coil Inward, or the Ship From Code on the sales upload) and it will fold back into TOTAL.
        </p>
      )}
      <details className="text-xs text-slate-600 dark:text-slate-300">
        <summary className={`cursor-pointer font-medium text-indigo-700 dark:text-indigo-300 ${DASH_RING} rounded`}>How to read the tracker</summary>
        <p className="mt-1.5 max-w-4xl">
          <strong>Shaded rows are stock</strong> (a closing balance), unshaded are flows (that day's movement).
          In the <strong>MTD</strong> column a flow is the month's sum and a stock is its latest close —
          except <strong>Opening Inventory</strong>, whose MTD cell is the month's opening.
          Every column reconciles on its own: Coil Stock = previous + Coil Inward − Slitting; Slit Stock = previous + Slitting − RM Consumed;
          RM Availability = Coil Stock + Slit Stock; Current Inventory = Opening + Production − Dispatch; Opening = the previous day's close.
          {' '}<strong>RM Consumed</strong> is slit coil used <em>whole</em>: a coil's full slit weight, on the day a production is first assigned to it —
          what is left on it counts as used (<code>docs/adr/0015</code>). So Slit Stock on every day is the slit coils not yet assigned, and the latest column ties to the Coil figures on Sales &amp; activity.
        </p>
      </details>
    </DashBlock>
  )

  const salesScreen = (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">Activity period
          <select value={period} onChange={e => setPeriod(e.target.value)} aria-label="Activity period" className={sel}>
            <option value="all">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="mtd">Month to Date</option>
            <option value="month">Month…</option>
            <option value="custom">Custom Range</option>
          </select>
        </label>
        {period === 'month' && (
          <select value={monthSel} onChange={e => setMonthSel(e.target.value)} aria-label="Activity month" className={sel}>
            {monthOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        )}
        {period === 'custom' && (
          <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} aria-label="Activity from" className={sel} />
            <span className="text-slate-500">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} aria-label="Activity to" className={sel} />
          </>
        )}
        <span className="text-xs text-slate-500 dark:text-slate-400">Scopes Activity, Pending to Dispatch in SKU-wise inventory, and the trend. Stock figures stay current.</span>
      </div>

      {/* Sales (MT) — the SAME KPIs as the Sales dashboard (salesKpis): Confirmed / Non-confirmed are
          the carried-forward snapshot; MTD Invoice = current month. */}
      <DashBlock title={`Sales — ${monthLabel(todayStr.slice(0, 7))}`}>
        <KpiStrip label="Sales" items={[
          { label: 'Total Orders', value: tonnes(sales.totalOrders), sub: 'Invoiced + Confirmed + Non-conf.' },
          { label: 'Pending to Dispatch', value: tonnes(sales.pending), sub: `Confirmed ${tonnes(sales.confirmed)} · Non-confirmed ${tonnes(sales.nonConfirmed)}` },
          { label: 'MTD Invoice', value: tonnes(sales.mtdInvoice), sub: 'Invoiced this month' },
        ]} />
      </DashBlock>

      <DashBlock title={`Activity — ${periodLabel}`}>
        <KpiStrip label="Activity" items={[
          { label: 'Coil Inward', value: tonnes(activity.coilInward), sub: 'HR coil received' },
          { label: 'Produced', value: tonnes(activity.produced), sub: 'Tubes produced' },
        ]} />
      </DashBlock>

      <DashBlock title="Coil">
        <KpiStrip label="Coil" items={[
          { label: 'Total Coil Inward', value: tonnes(coil.totalInward), sub: 'All HR coil received' },
          { label: 'Full Coil Dispatched', value: tonnes(coil.fullDispatchedWt), sub: `${coil.fullDispatchedN} coil(s) ≥95% dispatched` },
          { label: 'Slit Coils Left', value: tonnes(coil.babyLeft), sub: 'Slit, not yet assigned to a production' },
          { label: 'Full Coil Left', value: tonnes(coil.fullCoilLeft), sub: 'Whole, unslit coils' },
        ]} />
      </DashBlock>

      {/* Dispatched w/o Production: the tonnage the per-SKU floor drops, shown so FG Left Inventory
          and the SKU table's TOTAL row (which stays floored) visibly reconcile. */}
      <DashBlock title="Finished Goods (FG)">
        <KpiStrip label="Finished Goods" items={[
          { label: 'FG Left Inventory', value: tonnes(fgLeft), sub: 'Produced − invoiced' },
          { label: 'FG Reserved', value: tonnes(fgReserved), sub: 'Released − invoiced (committed)' },
          { label: 'Free FG', value: tonnes(freeFg), sub: 'Inventory − reserved' },
          { label: 'Dispatched w/o Production', value: tonnes(fgUnmatched),
            sub: skuTotals.negSkus ? `${skuTotals.negSkus} SKU(s) — invoiced beyond recorded production` : 'All dispatch matched to production' },
        ]} />
      </DashBlock>

      <DashBlock title="SKU-wise Inventory">
        {skuRows.length > 0 ? (
          <>
            <DataTable columns={skuInvCols} data={skuRows} filters={skuInvFilters}
              exportRef={skuInvExportRef}
              highlightRow={r => r.free < 0} highlightClass="bg-red-50 dark:bg-red-900/30"
              excel maxHeight="60vh" totalsLabel="TOTAL" />
            <p className="text-xs text-slate-500 dark:text-slate-400">
              <strong>Pending to Dispatch</strong> = Confirmed + Non-confirmed (same as the Sales figure above);
              <strong> Reserved</strong> = released − invoiced for active orders (not delivered/cancelled);
              <strong> Free Inventory</strong> = Inventory − Reserved (negative ⇒ over-committed, red).
              Production / Reserved / Inventory are live; Pending to Dispatch follows the Activity period. The SKU-wise inventory CSV is this table as filtered and sorted.
            </p>
          </>
        ) : <p className="text-sm text-slate-400 py-4">No SKU activity yet</p>}
      </DashBlock>

      {/* Production & Dispatch Trend — the same buckets the chart drew (daily ≤ 31 days, else weekly), as text. */}
      <DashBlock title={`Production & Dispatch Trend — ${periodLabel}${trend.weekly ? ' (weekly)' : ''}`}>
        {trend.data.some(d => d.produced > 0 || d.dispatched > 0) ? (
          <FlatTable label="Production and dispatch trend" dense rowKey={r => r.key}
            cols={[{ label: 'T', left: true, text: r => r.label }, ...trend.data.map(b => ({ label: b.name, text: r => fmtT(b[r.key]) }))]}
            rows={[{ key: 'produced', label: 'Produced (T)' }, { key: 'dispatched', label: 'Dispatched (T)' }]} />
        ) : <p className="text-sm text-slate-400 py-4">No production or dispatch activity in this period</p>}
      </DashBlock>

      <DashBlock title={`Alerts & Warnings (${alerts.length})`}>
        {alerts.length === 0 ? (
          <p className="text-sm text-slate-600 dark:text-slate-300">All clear — no warnings</p>
        ) : (
          <ul className="max-h-64 overflow-y-auto border-t border-slate-200 dark:border-slate-700 text-sm">
            {alerts.map((a, i) => (
              <li key={i} className="flex items-start gap-3 border-b border-slate-100 dark:border-slate-700 py-1.5">
                <span className={`shrink-0 w-16 text-xs ${a.type === 'error' ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}>
                  {a.type === 'error' ? 'Error' : 'Warning'}
                </span>
                <span className="text-slate-700 dark:text-slate-300">{a.msg}</span>
              </li>
            ))}
          </ul>
        )}
      </DashBlock>

      <DashBlock title="Recent Activity">
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-400 py-4">No activity yet</p>
        ) : (
          <ul className="border-t border-slate-200 dark:border-slate-700">
            {recentActivity.map((e, i) => (
              <li key={i} className="h-8 flex items-center gap-3 border-b border-slate-100 dark:border-slate-700">
                <span className="shrink-0 w-16 text-xs font-medium text-slate-500 dark:text-slate-400">{e.stage}</span>
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">{e.msg}</span>
                <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 tabular-nums">{e.date}</span>
              </li>
            ))}
          </ul>
        )}
      </DashBlock>
    </div>
  )

  return (
    <InventoryOverview coils={coils} babyCoils={babyCoils} productions={productions} dispatches={dispatches} orders={orders} skus={skus}
      compareCoils={trackerCoils} compareBabyCoils={trackerBabyCoils} compareProductions={trackerProductions} compareDispatches={trackerDispatches}
      comparePlant={trackerPlant} plants={trackerPlants} selectedPlant={selectedPlant}
      screens={{ tracker: trackerScreen, sales: salesScreen }}
      exports={[
        { label: 'Plant-wise Tracker CSV', run: downloadTrackerCSV, note: `${trackerGrid.month}, as on the Plant-wise Tracker` },
        { label: 'SKU-wise inventory CSV', run: downloadSkuCSV, note: 'As filtered and sorted on Sales & activity' },
        { label: 'Coil stock report CSV', run: downloadStockCSV, note: 'Every coil: raw remaining, ready and dispatched' },
      ]} />
  )
}

// ═══════════════════════════════════════════════════════════════
// COIL TRACKER
// ═══════════════════════════════════════════════════════════════

// Excel-style summary for the 3-stage flow (Inward → Produced → Dispatched)
const SUMMARY_HEADERS = [
  'Coil ID', 'Grade', 'Coil Wt (T)', '# Produced (pcs)', 'Produced Wt (T)',
  '# Dispatched (pcs)', 'Dispatched Wt (T)', 'Balance to Produce (T)', 'Produced Inv (T)', 'Produced Inv (#)',
]
// Numeric columns in header order: wt → 2-dp tonnes, count → thousands-separated integer
const SUMMARY_COLS = [
  { key: 'coilWt', fmt: 'wt' }, { key: 'producedPcs', fmt: 'count' }, { key: 'producedWt', fmt: 'wt' },
  { key: 'dispatchedPcs', fmt: 'count' }, { key: 'dispatchedWt', fmt: 'wt' },
  { key: 'balanceToProduce', fmt: 'wt' }, { key: 'producedInvWt', fmt: 'wt' }, { key: 'producedInvPcs', fmt: 'count' },
]

// Band chip for the Coil Tracker's stock tables (ADR-0016). Colour AND glyph, so the band reads
// without colour too; "No date" is grey — unknown, not new.
const BAND_CHIP = {
  Act:     { cls: 'bg-red-100 text-red-800 dark:bg-red-900/60 dark:text-red-200', glyph: '■' },
  Watch:   { cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200', glyph: '▲' },
  Clear:   { cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200', glyph: '●' },
  [NO_DATE_BAND]: { cls: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200', glyph: '?' },
}
const BandChip = ({ band }) => {
  const s = BAND_CHIP[band] || BAND_CHIP[NO_DATE_BAND]
  return <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${s.cls}`}>{s.glyph} {band}</span>
}
// The viewer's own calendar date. Ages are whole days to local midnight, so this is NOT `today()`
// (a UTC date, which reads yesterday in India until 05:30).
const localToday = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// The plant × age-band matrix above the stock tables (ticket #242). Purely presentational: it
// renders `coilTrackerView().matrix` and sums nothing — each cell arrives with its tonnes, count,
// whether it is empty, whether it is the selected one, and the `cell` to hand back when clicked.
const fmtStockT = (v) => Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
const BAND_TEXT = { Act: 'text-red-700 dark:text-red-300', Watch: 'text-amber-700 dark:text-amber-300', Clear: 'text-emerald-700 dark:text-emerald-300' }
// Rules folded away (user, 12-Nov-2026: a screen is numbers and structure; words only where they
// must be, as super-short points). Closed by default, so the screen itself carries no prose.
function KeyPoints({ points, label = 'Key' }) {
  const shown = points.filter(Boolean)
  if (!shown.length) return null
  return (
    <details className="text-[11px] text-slate-500 dark:text-slate-400">
      <summary className="cursor-pointer w-max font-medium text-slate-600 dark:text-slate-300 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">{label}</summary>
      <ul className="mt-1 ml-4 list-disc space-y-0.5">{shown.map((pt, i) => <li key={i}>{pt}</li>)}</ul>
    </details>
  )
}

// Figures that used to sit inside a sentence: label and number side by side, split by thin rules.
// Each item is [label, value, hover?]; a falsy item is skipped.
function FactStrip({ items, label }) {
  return (
    <p aria-label={label} className="flex flex-wrap items-baseline gap-y-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
      {items.filter(Boolean).map(([k, v, title], i) => (
        <span key={k} title={title} className={`pr-3 ${i ? 'pl-3 border-l border-slate-200 dark:border-slate-700' : ''}`}>
          {k}{' '}<b className="font-semibold text-slate-900 dark:text-white">{v}</b>
        </span>
      ))}
    </p>
  )
}

function CoilStockMatrix({ matrix, onPick }) {
  const Cell = ({ c, band, strong }) => (
    <td className="p-0 text-right">
      {c.empty
        ? <span className="block px-3 py-2 text-slate-400 dark:text-slate-500" aria-label="none">–</span>
        : <button type="button" onClick={() => onPick(c.cell)} aria-pressed={c.selected}
            className={`block w-full px-3 py-2 text-right tabular-nums hover:bg-slate-100 dark:hover:bg-slate-700 ${strong ? 'font-semibold' : ''} ${c.selected ? 'ring-2 ring-inset ring-indigo-500' : ''}`}>
            <span className={`${BAND_TEXT[band] || 'text-slate-900 dark:text-slate-100'} ${band === 'Act' ? 'font-semibold' : ''}`}>{fmtStockT(c.weight)}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400"> · {c.count}</span>
          </button>}
    </td>
  )
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-700 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
            <th className="px-3 py-2 text-left">Plant</th>
            <th className="px-3 py-2 text-left">Stock</th>
            {matrix.bands.map(b => <th key={b} className="px-3 py-2 text-right"><BandChip band={b} /></th>)}
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {matrix.rows.map(r => (
            <tr key={`${r.plant}|${r.kind}`} className={r.firstOfPlant ? 'border-t-2 border-slate-300 dark:border-slate-600' : ''}>
              <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">{r.firstOfPlant ? r.plantName : ''}</td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{r.stock}</td>
              {r.cells.map((c, i) => <Cell key={matrix.bands[i]} c={c} band={matrix.bands[i]} />)}
              <Cell c={r.total} strong />
            </tr>
          ))}
          <tr className="bg-slate-50 dark:bg-slate-700/50 border-t-2 border-slate-400">
            <td className="px-3 py-2 font-semibold text-slate-900 dark:text-white" colSpan={2}>All plants</td>
            {matrix.all.cells.map((c, i) => <Cell key={matrix.bands[i]} c={c} band={matrix.bands[i]} strong />)}
            <Cell c={matrix.all.total} strong />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// Raw-material stock by plant (ticket #263) — Section 1 of the Coil Tracker, above the matrix.
// Purely presentational and read-only: it renders `coilTrackerView().stockByPlant` and sums nothing.
// Every figure arrives finished (tonnes, # of coils, empty flags, whole-day avg age); a blank reads "–".
// It never filters — the matrix below stays the only filter. Days of cover (#264) arrives with its
// label and tone: "No use" (stock, nothing produced in 30 days) amber; 0 (producing, no stock) red.
// Each plant row and All plants opens into its standard-thickness rows (#265), collapsed by default;
// the only click here is that open/close toggle, held by the parent as a Set of row keys.
const COVER_TONE = { noUse: 'text-amber-700 dark:text-amber-300 font-medium', out: 'text-red-700 dark:text-red-300 font-semibold' }
const ALL_PLANTS_KEY = '__all__'   // a plant id can be '' (Unattributed), so All plants needs its own key
const stockRowKey = (r) => r.plant == null ? ALL_PLANTS_KEY : r.plant
function CoilStockByPlant({ table, open, onToggle }) {
  const dash = <span className="text-slate-400 dark:text-slate-500" aria-label="none">–</span>
  const T = (part) => part.empty ? dash : fmtStockT(part.weight)
  const N = (part) => part.empty ? dash : part.count.toLocaleString('en-US')
  // A render function, not a nested component: a component defined in here would be a new type on
  // every render, so React would remount every row and the clicked ▸ button would lose focus.
  const row = (r, { strong = false, bucket = false } = {}) => (
    <tr key={bucket ? r.bucketLabel : 'row'} className={strong ? 'bg-slate-50 dark:bg-slate-700/50 border-t-2 border-slate-400 font-semibold'
      : bucket ? 'bg-slate-50/60 dark:bg-slate-800/60 text-xs' : ''}>
      <td className={`px-3 py-2 text-slate-900 dark:text-white ${strong || bucket ? '' : 'font-medium'}`}>
        {bucket ? <span className="pl-6 text-slate-600 dark:text-slate-300">{r.bucketLabel}</span> : (
          <button type="button" onClick={() => onToggle(stockRowKey(r))} aria-expanded={open.has(stockRowKey(r))}
            className="inline-flex items-center gap-1.5 hover:text-blue-700 dark:hover:text-blue-300">
            <span aria-hidden="true" className="w-3 text-slate-400">{open.has(stockRowKey(r)) ? '▾' : '▸'}</span>{r.plantName}
          </button>
        )}
      </td>
      <td className="px-3 py-2 text-right tabular-nums">{T(r.hr)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{N(r.hr)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{T(r.slit)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{N(r.slit)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.totalEmpty ? dash : fmtStockT(r.totalWeight)}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.avgAge == null ? dash : r.avgAge}</td>
      <td className="px-3 py-2 text-right tabular-nums">{r.produced30d ? fmtStockT(r.produced30d) : dash}</td>
      <td className={`px-3 py-2 text-right tabular-nums ${COVER_TONE[r.cover.tone] || ''}`}>
        {r.cover.tone === 'none' ? dash : r.cover.label}
      </td>
    </tr>
  )
  const th = 'px-3 py-2 text-right'
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 dark:bg-slate-700 text-xs uppercase tracking-wider text-slate-500 dark:text-slate-300">
          <tr>
            <th rowSpan={2} className="px-3 py-2 text-left align-bottom">Plant</th>
            <th colSpan={2} className="px-3 pt-2 text-center border-b border-slate-200 dark:border-slate-600">HR coil</th>
            <th colSpan={2} className="px-3 pt-2 text-center border-b border-slate-200 dark:border-slate-600">Slit coil</th>
            <th className="px-3 pt-2 text-right border-b border-slate-200 dark:border-slate-600">Total</th>
            <th rowSpan={2} className={`${th} align-bottom`}>Avg age (days)</th>
            <th className="px-3 pt-2 text-right border-b border-slate-200 dark:border-slate-600">Produced 30d</th>
            <th rowSpan={2} className={`${th} align-bottom`}>Days of cover</th>
          </tr>
          <tr>
            <th className={th}>T</th><th className={th}># of coils</th>
            <th className={th}>T</th><th className={th}># of coils</th>
            <th className={th}>T</th>
            <th className={th}>T</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700 text-slate-700 dark:text-slate-200">
          {[...table.rows, table.all].map(r => (
            <React.Fragment key={stockRowKey(r)}>
              {row(r, { strong: r === table.all })}
              {open.has(stockRowKey(r)) && r.buckets.map(b => row(b, { bucket: true }))}
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// Coil stock by thickness × month — a Coil Tracker section, collapsed by default. Purely
// presentational: it renders `coilThicknessGrid` (calc.js) and sums nothing. Same look as the
// Plant-wise Tracker: stock rows shaded, a still flow reads "—" (`trackerCellBlank`, the CSV's rule
// too), a negative in red, and the label columns pinned while the months scroll.
function CoilThicknessTable({ grid }) {
  const cellText = (r, v) => trackerCellBlank(r, v)
    ? <span className="text-slate-300 dark:text-slate-600">—</span>
    : <span className={Number(v) < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{fmtT3(v)}</span>
  const label = 'sticky z-10 px-3 py-1.5 whitespace-nowrap'
  return (
    <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded-md" style={{ maxHeight: '70vh' }}>
      <table className="min-w-full text-sm border-collapse">
        <thead className="sticky top-0 z-20">
          <tr className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200">
            <th className="sticky left-0 z-30 bg-slate-100 dark:bg-slate-700 w-28 min-w-[7rem] max-w-[7rem] px-3 py-2 text-left font-semibold">Thickness</th>
            <th className="sticky left-28 z-30 bg-slate-100 dark:bg-slate-700 w-24 min-w-[6rem] max-w-[6rem] px-3 py-2 text-left font-semibold">Stock</th>
            <th className="sticky left-52 z-30 bg-slate-100 dark:bg-slate-700 w-24 min-w-[6rem] max-w-[6rem] px-3 py-2 text-left font-semibold border-r border-slate-300 dark:border-slate-500">MT</th>
            {grid.columns.map(c => <th key={c.key} className="px-3 py-2 text-right font-semibold whitespace-nowrap">{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {grid.blocks.map(b => b.rows.map((r, i) => {
            // Fully opaque, not a tint: this class also paints the sticky label cells.
            const bg = r.kind === 'stock' ? 'bg-slate-50 dark:bg-slate-900' : 'bg-white dark:bg-slate-800'
            const strong = b.isTotal || r.label === 'Closing' ? 'font-semibold' : ''
            const firstOfStock = i === 0 || r.stock !== b.rows[i - 1].stock
            return (
              <tr key={`${b.id}-${r.key}`} className={`${bg} ${i === 0 ? 'border-t-2 border-slate-300 dark:border-slate-600' : firstOfStock ? 'border-t border-slate-200 dark:border-slate-700' : ''}`}>
                {i === 0 && (
                  <td rowSpan={b.rows.length}
                    className="sticky left-0 z-10 bg-white dark:bg-slate-800 w-28 min-w-[7rem] max-w-[7rem] px-3 py-2 align-top font-semibold text-slate-900 dark:text-slate-100">
                    {b.name}
                  </td>
                )}
                {firstOfStock && (
                  <td rowSpan={b.rows.filter(x => x.stock === r.stock).length}
                    className={`${label} left-28 bg-white dark:bg-slate-800 w-24 min-w-[6rem] max-w-[6rem] align-top text-slate-700 dark:text-slate-200`}>
                    {r.stock}
                  </td>
                )}
                <td className={`${label} left-52 ${bg} w-24 min-w-[6rem] max-w-[6rem] border-r border-slate-200 dark:border-slate-600 text-slate-600 dark:text-slate-300 ${strong}`}>
                  {r.label}
                </td>
                {grid.columns.map(c => (
                  <td key={c.key} className={`px-3 py-1.5 text-right tabular-nums ${strong}`}>{cellText(r, r.cells[c.key])}</td>
                ))}
              </tr>
            )
          }))}
        </tbody>
      </table>
    </div>
  )
}

function CoilTracker({ coils, productions, dispatches, babyCoils, plants }) {
  const [selectedCoilId, setSelectedCoilId] = useState(null)
  // The matrix cell the viewer clicked ({ plant, kind, band }) or null = show all (ticket #242).
  const [cell, setCell] = useState(null)
  // Stock-by-plant rows opened into their thickness buckets (ticket #265) — display state only;
  // every row starts collapsed and the CSV ignores this.
  const [openStock, setOpenStock] = useState(() => new Set())
  const toggleStock = (key) => setOpenStock(prev => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n })
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const active = (arr) => (arr || []).filter(x => !x.deleted)
  const ac = active(coils), ap = active(productions), ad = active(dispatches), ab = active(babyCoils)

  // ── Raw-material stock by age (ticket #241) — the default view. Every row, age and band comes
  // finished out of coilTrackerView (calc.js); this component sums nothing. The arrays are already
  // plant-scoped by the app, so a plant login sees only its own plant here. ──
  const stockToday = localToday()
  const view = useMemo(() => coilTrackerView({ coils, babyCoils, productions, dispatches, today: stockToday, plants, cell, selectedCoilId }),
    [coils, babyCoils, productions, dispatches, stockToday, plants, cell, selectedCoilId])
  const trace = view.trace
  const cellSuffix = view.cellLabel ? ` — ${view.cellLabel}` : ''
  // Each table is keyed on the cell, so clicking a new cell (or "Show all") starts the tables fresh:
  // a Band / Plant dropdown or search left over from the last view cannot silently empty them.
  const cellKey = cell ? `${cell.plant ?? '*'}|${cell.kind ?? '*'}|${cell.band ?? '*'}` : 'all'
  // Each column states the TEXT it prints (`text`), and the CSV is that text — screen and file agree.
  // `value` is what DataTable sorts and searches on; an undated age sorts as Infinity, so it lands
  // above every dated row when sorted oldest first and is never read as 0 days (ADR-0016).
  const textCol = (label, text) => ({ label, text, value: text })
  const ageCols = [
    { label: 'Band', text: r => r.band, value: r => r.band, render: r => <BandChip band={r.band} /> },
    { label: 'Age (d)', text: r => r.age == null ? '—' : String(r.age), value: r => r.age ?? Infinity,
      render: r => <span className="tabular-nums font-medium">{r.age ?? '—'}</span> },
  ]
  const wtCol = { label: 'Weight (T)', text: r => fmtT3(r.weight), value: r => r.weight,
    render: r => <span className="tabular-nums">{fmtT3(r.weight)}</span>, total: v => fmtT3(v) }
  const unslitColumns = [
    ...ageCols,
    textCol('HR Coil ID', r => r.id),
    textCol('Plant', r => r.plantName),
    textCol('Grade', r => r.grade || '-'),
    textCol('Thk × Width (mm)', r => r.spec),
    wtCol,
    textCol('Inward date', r => r.date || '—'),
    textCol('PO', r => r.poNumber || '-'),
  ]
  const babyStockColumns = [
    ...ageCols,
    textCol('Slit Coil ID', r => r.id),
    textCol('HR Coil ID', r => r.motherId),
    textCol('Plant', r => r.plantName),
    textCol('Thk × Width (mm)', r => r.spec),
    wtCol,
    textCol('Slitting date', r => r.date || '—'),
  ]
  // Band options in a fixed Act → Watch → Clear order; "No date" offered only when a row carries it.
  const bandOptions = (rows) => [...AGE_BANDS, ...(rows.some(r => r.band === NO_DATE_BAND) ? [NO_DATE_BAND] : [])]
  const stockFilters = (rows) => [
    { key: 'band', label: 'Band', accessor: r => r.band, options: bandOptions(rows) },
    { key: 'plant', label: 'Plant', accessor: r => r.plantName },
    { key: 'thickness', label: 'Thickness', accessor: r => String(r.thickness ?? '') },
  ]
  const unslitExportRef = useRef([])
  const babyStockExportRef = useRef([])
  // The CSV prints each column's `text` over the on-screen (filtered, searched, sorted) rows.
  const stockCSV = (name, columns, ref) => downloadCSV(`${name}-${stockToday}.csv`,
    columns.map(c => c.label), ref.current.map(r => columns.map(c => c.text(r))))
  // Clicking any coil opens the journey below — a baby coil opens its mother's.
  const journeyRef = useRef(null)
  const pickCoil = (hrCoilId) => {
    setSelectedCoilId(hrCoilId)
    setTimeout(() => journeyRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50)
  }

  // Excel-style formatters: round BEFORE the zero-test so float dust and -0 render '-' while real negatives keep their sign
  const fmt2 = (v) => { const r = Math.round(Number(v || 0) * 100) / 100; return r ? r.toFixed(2) : '-' }
  const fmtCount = (v) => { const n = Math.round(Number(v || 0)); return n ? n.toLocaleString('en-US') : '-' }

  // ── Period filter: coils by inward date (inclusive, open-ended bounds) ──
  const filteredCoils = useMemo(() => {
    return ac
      .filter(c => {
        if (dateFrom && c.dateOfInward < dateFrom) return false
        if (dateTo && c.dateOfInward > dateTo) return false
        return true
      })
      .sort((a, b) => (a.dateOfInward || '').localeCompare(b.dateOfInward || '') || (a.hrCoilId || '').localeCompare(b.hrCoilId || ''))
  }, [ac, dateFrom, dateTo])

  // ── Inventory summary for coils in the selected period (quantities are lifetime totals) ──
  // Per-coil derivation lives in src/lib/calc.js — coilInventoryRow.
  const inventorySummary = useMemo(
    () => filteredCoils.map(c => {
      const row = coilInventoryRow(c, ad, ap)
      // Enrich with the raw-coil fields the summary row drops (thickness/width/PO/date) + a derived
      // stage status, so the table can offer Grade/Thickness/Width/Status dropdown filters.
      return {
        ...row, thickness: c.thickness, width: c.width, poNumber: c.poNumber, dateOfInward: c.dateOfInward,
        status: row.dispatchedWt > 0 ? 'Dispatched' : row.producedWt > 0 ? 'Produced' : 'In stock',
      }
    }),
    [filteredCoils, ad, ap]
  )

  // ── Mother "Inventory Summary" as a DataTable: columns mirror SUMMARY_HEADERS/SUMMARY_COLS (the
  // DataTable TOTAL row replaces the old pinned subtotal), plus Grade/Thickness/Width/Status dropdown
  // filters and on-screen-aware CSVs — matching the other tabs. Refs capture the filtered view. ──
  const motherColumns = [
    { label: 'Coil ID', key: 'hrCoilId' },
    { label: 'Grade', value: r => r.grade || '-' },
    ...SUMMARY_COLS.map((col, i) => ({
      label: SUMMARY_HEADERS[i + 2], value: r => r[col.key],
      render: r => <span className="tabular-nums">{col.fmt === 'wt' ? fmt2(r[col.key]) : fmtCount(r[col.key])}</span>,
      total: v => col.fmt === 'wt' ? fmt2(v) : fmtCount(v),
    })),
  ]
  const motherFilters = [
    { key: 'grade', label: 'Grade', accessor: r => r.grade || '' },
    { key: 'thickness', label: 'Thickness', accessor: r => String(r.thickness ?? '') },
    { key: 'width', label: 'Width', accessor: r => String(r.width ?? '') },
    { key: 'status', label: 'Status', accessor: r => r.status, options: ['In stock', 'Produced', 'Dispatched'] },
  ]
  const motherExportRef = useRef([])
  const downloadStockCSV = () => downloadCSV(`coil-stock-${today()}.csv`,
    ['Coil ID', 'Grade', 'Thickness (mm)', 'Width (mm)', ...SUMMARY_HEADERS.slice(2), 'Status'],
    motherExportRef.current.map(r => [r.hrCoilId, r.grade || '', r.thickness ?? '', r.width ?? '',
      ...SUMMARY_COLS.map(col => col.fmt === 'wt' ? fmt2(r[col.key]) : fmtCount(r[col.key])), r.status]))

  // Expand all / Collapse all and the CSV of the stock-by-plant table (ticket #265). The CSV holds
  // every plant and bucket row whatever is open — `stockByPlantCsv` (calc.js) builds it.
  const stockKeys = [...view.stockByPlant.rows, view.stockByPlant.all].map(stockRowKey)
  const allStockOpen = stockKeys.length > 0 && stockKeys.every(k => openStock.has(k))
  const downloadStockByPlantCSV = () => {
    const { header, rows } = stockByPlantCsv(view.stockByPlant)
    downloadCSV(`raw-material-stock-by-plant-${stockToday}.csv`, header, rows)
  }

  // Coil stock by thickness × month — the same header-scoped stores as every table above.
  const thicknessGrid = useMemo(() => coilThicknessGrid({ coils, babyCoils, productions, today: stockToday }),
    [coils, babyCoils, productions, stockToday])
  const downloadThicknessCSV = () => {
    const { header, rows } = coilThicknessCsv(thicknessGrid)
    downloadCSV(`coil-thickness-${stockToday}.csv`, header, rows)
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Coil Tracker</h2>

      {/* ── Section 1: raw-material stock by plant (ticket #263) — read-only, one row per plant + All plants ── */}
      <Section title="Raw-material stock by plant and thickness" actions={
        <div className="flex gap-2">
          <Btn size="sm" variant="ghost" onClick={() => setOpenStock(allStockOpen ? new Set() : new Set(stockKeys))}
            disabled={!view.stockByPlant.rows.length}>{allStockOpen ? 'Collapse all' : 'Expand all'}</Btn>
          <Btn size="sm" variant="ghost" onClick={downloadStockByPlantCSV} disabled={!view.stockByPlant.rows.length}>⬇ CSV</Btn>
        </div>
      }>
        <CoilStockByPlant table={view.stockByPlant} open={openStock} onToggle={toggleStock} />
        <div className="mt-2"><KeyPoints points={[
          'HR coil = unslit, actual weight',
          'Slit coil = in stock, slit weight',
          'Avg age: tonne-weighted (HR from inward, slit from slitting)',
          'Produced 30d = slit coil into production, last 30 days',
          'Days of cover = Total ÷ (Produced 30d ÷ 30)',
          'No use = not drawn on in 30 days',
          'Click a plant → by thickness (nearest standard, tie up)',
        ]} /></div>
      </Section>

      {/* ── The plant × age-band matrix (ticket #242) — the only filter for the stock tables below ── */}
      <Section title="Stock by plant × age (T · coils) — click to filter" actions={
        cell && <Btn size="sm" variant="ghost" onClick={() => setCell(null)}>Show all</Btn>
      }>
        <CoilStockMatrix matrix={view.matrix} onPick={setCell} />
      </Section>
      {view.show.unslit && (
        <Section title={`HR coils, unslit (${view.unslitRows.length})${cellSuffix}`} actions={
          <Btn size="sm" variant="ghost" onClick={() => stockCSV('hr-coils-unslit', unslitColumns, unslitExportRef)} disabled={!view.unslitRows.length}>⬇ CSV</Btn>
        }>
          <DataTable key={cellKey} columns={unslitColumns} data={view.unslitRows} filters={stockFilters(view.unslitRows)}
            exportRef={unslitExportRef} maxHeight="22rem" totalsLabel="TOTAL"
            onRowClick={r => pickCoil(r.motherId)}
            highlightRow={r => r.motherId === selectedCoilId} />
        </Section>
      )}
      {view.show.baby && (
        <Section title={`Slit coils in stock (${view.babyStockRows.length})${cellSuffix}`} actions={
          <Btn size="sm" variant="ghost" onClick={() => stockCSV('slit-coils-in-stock', babyStockColumns, babyStockExportRef)} disabled={!view.babyStockRows.length}>⬇ CSV</Btn>
        }>
          <DataTable key={cellKey} columns={babyStockColumns} data={view.babyStockRows} filters={stockFilters(view.babyStockRows)}
            exportRef={babyStockExportRef} maxHeight="26rem" totalsLabel="TOTAL"
            onRowClick={r => pickCoil(r.motherId)}
            highlightRow={r => r.motherId === selectedCoilId} />
          <div className="mt-2"><KeyPoints points={['Not yet in any production, slit weight', 'Age from slitting · oldest first', '0–30 d Clear · 31–60 Watch · 61+ Act']} /></div>
        </Section>
      )}

      {/* ── Coil stock by thickness × month — collapsed by default ── */}
      <details className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="px-6 py-4 cursor-pointer text-lg font-semibold text-slate-900 dark:text-slate-100">
          Coil stock by thickness × month (T)
        </summary>
        <div className="px-6 pb-6">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
            <KeyPoints points={[
              'HR: Opening + Inward − Slit out = Closing',
              'Slit: Opening + Slit in − Consumed = Closing',
              'Consumed = whole slit coil, first production',
              'Thickness: nearest standard, tie up',
              'This month runs to today',
              'Follows the header plant',
            ]} />
            <Btn size="sm" variant="ghost" onClick={downloadThicknessCSV} disabled={!thicknessGrid.blocks.length}>⬇ CSV</Btn>
          </div>
          {thicknessGrid.blocks.length
            ? <CoilThicknessTable grid={thicknessGrid} />
            : <p className="text-sm text-slate-500 dark:text-slate-400">No coils recorded.</p>}
        </div>
      </details>

      {/* ── Section 2: the all-coils ledger (the old Inventory Summary), collapsed and otherwise unchanged ── */}
      <details className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
        <summary className="px-6 py-4 cursor-pointer text-lg font-semibold text-slate-900 dark:text-slate-100">
          All coils ledger ({inventorySummary.length})
        </summary>
        <div className="px-6 pb-6">
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <span className="text-sm text-slate-500">Period:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
          <span className="text-sm text-slate-500">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
          <Btn size="sm" variant="ghost" onClick={downloadStockCSV} disabled={!inventorySummary.length}>⬇ Stock CSV</Btn>
        </div>
        <DataTable columns={motherColumns} data={inventorySummary} filters={motherFilters}
          exportRef={motherExportRef} excel maxHeight="24rem" totalsLabel="TOTAL"
          onRowClick={r => pickCoil(r.hrCoilId)}
          highlightRow={r => r.hrCoilId === selectedCoilId} />
        </div>
      </details>

      {/* ── Section 3: the trace (ticket #243) — one mother coil, Inward → Slit → Produced → Dispatched.
          Every figure comes finished out of view.trace; every weight is THIS coil's share. ── */}
      {trace && (
        <div ref={journeyRef} className="space-y-6 scroll-mt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">Trace: {trace.header.id}</h3>
            <Btn size="sm" variant="ghost" onClick={() => setSelectedCoilId(null)}>Clear selection</Btn>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-slate-600 dark:text-slate-300">
            <span>{trace.header.plantName}</span>
            <span>Grade {trace.header.grade || '—'}</span>
            <span>{trace.header.spec} mm</span>
            <span>PO {trace.header.poNumber || '—'}</span>
            <span>Invoice wt {fmtT3(trace.header.invoiceWeight)} T · Actual {fmtT3(trace.header.actualWeight)} T</span>
          </div>

          <div className="flex items-stretch gap-1 overflow-x-auto pb-1">
            {trace.stages.map((st, i) => (
              <React.Fragment key={st.key}>
                <div className={`flex-1 min-w-[150px] p-4 rounded-lg border-l-4 ${st.weight > 0 ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-300 bg-slate-50 dark:bg-slate-800'}`}>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{st.name}</p>
                  <p className="text-lg font-semibold tabular-nums text-slate-900 dark:text-white">{fmtT3(st.weight)} T</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{st.sub}</p>
                </div>
                {i < trace.stages.length - 1 && <span className="self-center text-slate-300 text-xl">→</span>}
              </React.Fragment>
            ))}
          </div>

          <Section title={`Slit coils (${trace.babies.length})`}>
            <TraceTable empty="Not slit yet." head={['Slit coil', 'Slitting date', 'Thk × Width (mm)', 'Weight (T)', 'Status', 'Used in run(s)']}
              rows={trace.babies.map(b => [b.id, <TraceDate key="d" date={b.date} outOfOrder={b.outOfOrder} />, b.spec, fmtT3(b.weight), <Badge key="s" ok={b.status === 'In stock'} text={b.status} />, b.usedIn.join(', ') || '—'])}
              numeric={[3]} />
          </Section>
          <Section title={`Production runs (${trace.runs.length}) — this coil's share only`}>
            <TraceTable empty="No production from this coil yet." head={['Production no', 'Date', 'Slit coil', 'SKU', 'Pieces', 'T from this coil']}
              rows={trace.runs.map(r => [r.no || '—', <TraceDate key="d" date={r.date} outOfOrder={r.outOfOrder} />, r.babyCoilId || '—', r.sku || '—', r.pieces, fmtT3(r.weight)])}
              numeric={[4, 5]} />
          </Section>
          <Section title={`Invoice lines (${trace.lines.length}) — this coil's share only`}>
            <TraceTable empty="Nothing dispatched from this coil yet." head={['Invoice', 'Date', 'Customer', 'SKU', 'Slit coil', 'Pieces', 'T from this coil']}
              rows={trace.lines.map(l => [l.invoiceNo || '—', <TraceDate key="d" date={l.date} outOfOrder={l.outOfOrder} />, l.customer || '—', l.sku || '—', l.babyCoilId || '—', l.pieces, fmtT3(l.weight)])}
              numeric={[5, 6]} />
          </Section>
        </div>
      )}
    </div>
  )
}

// A trace row's date, with the amber "Date out of order" flag when view.trace set it (ticket #244):
// the row is dated strictly before the stage it came from. Amber, not red — it informs, it does not
// alarm (the automatic invoice trace ignores dates, so the operator usually cannot correct it).
// An unflagged row renders the bare date, exactly as before.
function TraceDate({ date, outOfOrder }) {
  if (!outOfOrder) return date || '—'
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {date || '—'}
      <span className="whitespace-nowrap px-1.5 py-0.5 rounded text-xs font-medium border bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200"
        title="Dated before the stage this row came from">Date out of order</span>
    </span>
  )
}

// A plain table for one trace section — the rows arrive finished from view.trace, so this only lays them out.
function TraceTable({ head, rows, empty, numeric = [] }) {
  if (!rows.length) return <p className="text-sm text-slate-400">{empty}</p>
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-slate-50 dark:bg-slate-700">
            {head.map((h, j) => (
              <th key={h} className={`px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider ${numeric.includes(j) ? 'text-right' : 'text-left'}`}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
          {rows.map((r, i) => (
            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
              {r.map((c, j) => <td key={j} className={`px-3 py-2 text-slate-700 dark:text-slate-300 ${numeric.includes(j) ? 'text-right tabular-nums' : ''}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER ORDERS (uploaded from ERP Orders Excel; drives FG Reserved / Free FG)
// ═══════════════════════════════════════════════════════════════
// `cols` (optional) = { be, bf, bk } — the header texts at fixed column positions BE/BF/BK from
// the One Helix "Orders" tab, used as a positional fallback for the Confirmed/Non-confirmed inputs.
function mapOrderRow(row, cols = {}) {
  const pick = erpRowPicker(row)
  const num = (v) => {
    if (v === '' || v === null || v === undefined) return ''
    const n = Number(String(v).replace(/[, ]/g, ''))
    return isNaN(n) ? '' : n
  }
  // Confirmed / Non-confirmed come from fixed ERP columns. Prefer the header name; fall back to the
  // TRUE column position — the raw cell from `cols.arr` at the given 0-based index — so a blank,
  // duplicated, or renamed header can't silently zero them. BE "Release − Invoiced Qty" = Confirmed;
  // Non-confirmed = BF "Ordered − Release Qty" − BK "total cancelled qty".
  const numAt = (headerKey, idx) => {
    const byName = pick(headerKey)
    const raw = byName !== '' ? byName : (cols.arr && idx != null ? cols.arr[idx] : '')
    const n = num(raw)
    return n === '' ? 0 : Number(n)
  }
  const confirmed = numAt('release-invoicedqty', cols.be)
  const nonConfirmed = numAt('ordered-releaseqty', cols.bf) - numAt('totalcancelledqty', cols.bk)
  return {
    orderDate:            toISODate(pick('opportunitydate', 'orderdate', 'date')),
    orderId:              String(pick('orderid')).trim(),
    childOrderId:         String(pick('childorderid')).trim(),
    lineId:               String(pick('skuid')).trim(),               // per-line id (reference)
    customer:             String(pick(...DISTRIBUTOR_HEADER_ALIASES)).trim(),
    distributorCode:      String(pick('distributorcode')).trim(),     // stable identity key (matches invoice/dispatch)
    // Ship-to state — the Orders sheet fills "Ship to State" on every row; its "Ship to GST" is the
    // literal 0, so the GSTIN fallback lands on bill-to. Stored UPPER-CASE, matching invoice lines.
    shipToState:          resolveShipToState({
      state:     pick('shiptostate'),
      shipToGst: pick('shiptogst', 'shiptogstin', 'shiptogstno'),
      billToGst: pick('billto-gst', 'billtogst', 'billtogstin', 'gstin', 'gstno'),
    }),
    // Plant — resolved from the Orders sheet's "Ship From Code", with its "CM name" as the
    // fallback only (ticket #118). Stored as the plant id, or blank when the ERP row matched
    // neither — blanks are counted and reported on the banner, never guessed at.
    plant:                plantForErpRow(row),
    mmId:                 String(pick('mmid', 'skucode', 'sku')).trim(), // == SKU master skuCode
    description:          String(pick('mmdescription', 'description')).trim(),
    quantity:             num(pick('quantity')),                       // ordered qty in MT
    releaseQty:           num(pick('releaseqty')),                     // released (committed) qty in MT
    invoicedQty:          num(pick('invoicedqty')),                    // shipped/invoiced qty in MT; reserved = release − invoiced
    confirmed:            confirmed,                                   // BE: Release − Invoiced (confirmed, pending dispatch)
    nonConfirmed:         nonConfirmed,                                // BF − BK: ordered-not-released, net of cancellations
    orderStatus:          String(pick('orderstatus', 'status')).trim(),
    expectedDeliveryDate: toISODate(pick('expecteddeliverydate')),
  }
}


// The banner lines that report what the invoice upload DROPPED. A warehouse the plant master does
// not carry is the one that matters most: because the name is the filter (docs/adr/0013), a
// warehouse renamed in Zoho would otherwise read as a plant that silently went to zero, so it is
// named here with what it cost. Shared by the success and the nothing-qualified banners, because
// the reason a file qualified nothing is exactly this list.
const invoiceSkipParts = (stats) => {
  const parts = []
  if (stats.skippedByWarehouse?.length) {
    parts.push(`skipped ${stats.skippedByWarehouse.map(w => `${w.warehouse} (${w.rows})`).join(', ')}`)
  }
  if (stats.voidRows) parts.push(`${stats.voidRows} Void row(s) / ${fmtT(stats.voidWeight)}T dropped`)
  if (stats.undatedRows) parts.push(`${stats.undatedRows} row(s) with no invoice date dropped`)
  if (stats.unusualStatuses?.length) {
    parts.push(`unfamiliar status imported: ${stats.unusualStatuses.map(u => `${u.status} (${u.rows})`).join(', ')}`)
  }
  return parts
}

// `readOnly` (ticket #126) withholds BOTH UPLOADS only — the order book, the CSV export and every
// figure stay. The order upload rebuilds the WHOLE company's order book by superseding every live
// row, so a second uploader working from a stale file would overwrite everyone's orders, not just
// their own plant's. One operator, once a day.
//
// `allDispatches` and `allOrders` are the UNSCOPED stores, separate from `dispatches`/`orders`
// (which the header's plant selector has already filtered for display). The invoice upload's coil
// trace, its "left alone" count and its attribution all have to see every plant's rows: an upload
// made while filtered to one plant would otherwise re-allocate other plants' coils, under-report
// what survived, and attribute no line whose order belongs to another plant — turning a filter on
// the SCREEN into missing distributors and states in the DATA (ticket #193).
function Orders({ orders, allOrders, replaceOrders, dispatches, allDispatches, replaceDispatches, productions, skus, setSkus, readOnly = false }) {
  const [uploadMsg, setUploadMsg] = useState(null)
  const [invoiceMsg, setInvoiceMsg] = useState(null)
  const fileRef = useRef(null)
  const invoiceFileRef = useRef(null)

  // Per-order-line invoiced (matched to the line via Sku ID, max of dispatch match and the ERP's
  // own Invoiced Qty) and the resulting pending. Reads `dispatches` — still the invoice source.
  const shipped = useMemo(() => shippedByOrderLine(dispatches), [dispatches])
  const lineInvoiced = useCallback((o) => orderLineInvoiced(o, shipped), [shipped])
  const linePending = useCallback((o) => isOpenOrderStatus(o.orderStatus)
    ? Math.max(0, Number(o.quantity || 0) - lineInvoiced(o)) : 0, [lineInvoiced])

  // Read one uploaded workbook into `XLSX` + the parsed workbook. Shared by both buttons so the
  // two cannot drift on cellDates (an Invoice Date read as a serial number would window nothing).
  const readWorkbook = async (file) => {
    const XLSX = await loadChunk(() => import('xlsx'))
    return { XLSX, wb: XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }) }
  }

  // ── Upload Order Excel — the One Helix ERP workbook, `Orders` sheet, and nothing else.
  // Since ticket #192 it does NOT read the workbook's `Invoice` sheet and does NOT write dispatches
  // under any circumstance. That is not tidying: invoices now arrive from the Zoho register through
  // the button below, and an order upload that still rebuilt dispatches would mean whichever button
  // was clicked last won — this one silently overwriting everything the invoice button imported.
  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { XLSX, wb } = await readWorkbook(file)
      // Orders = the sheet named like /order/i, else the first sheet.
      const ordersWs = wb.Sheets[wb.SheetNames.find(n => /order/i.test(n))] || wb.Sheets[wb.SheetNames[0]]
      if (!ordersWs) { setUploadMsg({ kind: 'err', text: 'No "Orders" sheet found in the workbook' }); return }

      // Orders — read the header row (positional) so Confirmed=BE / BF / BK resolve even if a header drifts.
      // Read the sheet as arrays (header:1) once, then build the header-keyed object for each row
      // FROM that same array — so the raw array (for true positional BE/BF/BK reads) and the object
      // (for name-based pick()) are aligned by construction, immune to blank/duplicate headers or
      // blank-row skew between two separate sheet_to_json passes.
      const oArr = XLSX.utils.sheet_to_json(ordersWs, { header: 1, raw: true, blankrows: false, defval: '' })
      const hdr = oArr[0] || []
      const parsedOrders = oArr.slice(1).map(arr => {
        const obj = {}
        hdr.forEach((h, c) => { if (h !== '' && h != null) obj[h] = arr[c] })
        return mapOrderRow(obj, { arr, be: 56, bf: 57, bk: 62 })   // BE/BF/BK by 0-based column index
      }).filter(r => r.mmId)
      if (!parsedOrders.length) { setUploadMsg({ kind: 'err', text: 'No valid order rows found (need an MM ID column in the Orders sheet)' }); return }
      const newOrders = parsedOrders.map(r => ({ ...r, id: uid(), deleted: false }))

      // Apply — the order book is REPLACED server-side via replaceAll, never by diffing this tab's
      // in-memory snapshot. A tab that loaded before someone else's upload cannot see the rows
      // that upload created, so a snapshot-driven replace leaves them live and appends on top —
      // that is exactly how every invoice and order line ended up stored twice (all tonnage 2×).
      await replaceOrders(newOrders)

      const totConf = newOrders.reduce((s, o) => s + Number(o.confirmed || 0), 0)
      const totNon = newOrders.reduce((s, o) => s + Number(o.nonConfirmed || 0), 0)
      // Lines whose ship-to state could not be resolved are stored blank and REPORTED here (never
      // guessed from a name/city/pincode) — a silent blank would quietly shrink every state total.
      const ordersNoState = newOrders.filter(o => !o.shipToState).length
      const parts = [`Orders: ${newOrders.length} line(s) · Confirmed ${fmtT(totConf)}T · Non-confirmed ${fmtT(totNon)}T`]
      if (ordersNoState) parts.push(`${ordersNoState} order line(s) with no ship-to state`)
      // Same rule for plant: a line the Ship From Code did not resolve imports as Unattributed and
      // is REPORTED here. An unrecognised code must never fail the upload — a fifth company
      // appearing in the ERP cannot be allowed to stop the daily file loading — so the only thing
      // that makes it visible is this count.
      const ordersNoPlant = newOrders.filter(o => !o.plant).length
      if (ordersNoPlant) parts.push(`${ordersNoPlant} order line(s) with no plant (${UNATTRIBUTED_PLANT})`)
      parts.push('Dispatch data untouched — use Upload Invoice Excel')
      setUploadMsg({ kind: (ordersNoState || ordersNoPlant) ? 'err' : 'ok', text: parts.join(' · ') })
    } catch (err) {
      console.error(err)
      setUploadMsg({ kind: 'err', text: `Upload failed: ${err.message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Upload Invoice Excel — the Zoho invoice register (ticket #192).
  // Every rule lives in `buildInvoiceDispatches` in calc.js, where a test can reach it: the
  // warehouse filter, the Void filter, the SKU resolution and the rebuild window are all decided
  // there. This reads the file, calls in, writes the window and renders the banner — no rules.
  const onUploadInvoices = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const { XLSX, wb } = await readWorkbook(file)
      // The register is a single-sheet export. Prefer a sheet named like /invoice/i if one exists,
      // else the first — there is no second sheet here to mistake for it.
      const ws = wb.Sheets[wb.SheetNames.find(n => /invoice/i.test(n))] || wb.Sheets[wb.SheetNames[0]]
      if (!ws) { setInvoiceMsg({ kind: 'err', text: 'The workbook has no sheet to read' }); return }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
      const out = buildInvoiceDispatches(rows, { skus, productions, dispatches: allDispatches, orders: allOrders })

      // A file that qualifies nothing clears NOTHING. Said plainly, with what it skipped, so an
      // operator who picked the wrong file reads why rather than assuming the upload worked.
      if (!out.window) {
        setInvoiceMsg({ kind: 'err', text: ['No qualifying invoice rows — nothing was changed', ...invoiceSkipParts(out.stats)].join(' · ') })
        return
      }

      // Count what survives BEFORE the write, off the live store: afterwards the window's own rows
      // are the new ones and the figure would no longer answer "what did this upload leave alone?".
      const kept = dispatchLinesOutsideWindow(allDispatches, out.window)
      if (out.newCatalogSkus.length) setSkus(prev => [...prev, ...out.newCatalogSkus])
      await replaceDispatches(out.newRecords, { window: out.window })

      const parts = [
        `Rebuilt ${out.window.from} → ${out.window.to}`,
        `${out.stats.invoiceCount} invoice(s), ${out.stats.lineCount} line(s), ${fmtT(out.newRecords.reduce((s, d) => s + Number(d.theoreticalWeight || 0), 0))}T`,
        `${kept.lines} line(s) / ${fmtT(kept.weight)}T outside the window left alone`,
        ...invoiceSkipParts(out.stats),
      ]
      if (out.newCatalogSkus.length) parts.push(`+${out.newCatalogSkus.length} new SKU(s)`)
      if (out.stats.unknownSkus.length) parts.push(`${out.stats.unknownSkus.length} unresolved SKU(s): ${out.stats.unknownSkus.slice(0, 3).join(', ')}${out.stats.unknownSkus.length > 3 ? '…' : ''}`)
      if (out.stats.blankCustomer) parts.push(`${out.stats.blankCustomer} line(s) with no distributor`)
      if (out.stats.blankShipToState) parts.push(`${out.stats.blankShipToState} line(s) with no ship-to state (shown as ${UNMAPPED_REGION})`)
      if (out.stats.unmatchedOrderLines) parts.push(`${out.stats.unmatchedOrderLines} line(s) not matched to an order line`)
      // The stale-order-book warning, spelled out rather than left to be inferred from three blank
      // counts. Distributor, state and the order-line link ALL come from the order book, so a low
      // match rate has exactly one fix and the banner names it (ticket #193).
      if (out.stats.lowOrderMatch) {
        parts.push(`Only ${out.stats.orderMatchedLines} of ${out.stats.lineCount} line(s) matched the order book — the order book looks stale or empty, so distributors and states will read ${UNMAPPED_REGION}. Upload the Order Excel first, then upload this file again.`)
      }
      // Red whenever something was DROPPED or could not be resolved: the upload succeeded, and the
      // operator still has something to look at.
      //
      // `blankShipToState` is deliberately NOT in this list, though it is printed above. Even a
      // perfectly healthy upload carries some: the lines that resolve by the SFDC code rather than
      // the order book have no state to read and never will (5 of 252 on the 17-Sep file), so
      // flagging the count would paint EVERY successful upload the same red as "nothing was
      // changed", and an operator who cannot tell those two apart stops reading the banner at all.
      // The condition worth alarming on is not "some line has no state" but "the order book did not
      // answer" — and that is `lowOrderMatch`, which is in the list and names its own fix.
      const bad = !!(out.stats.skippedByWarehouse.length || out.stats.unusualStatuses.length
        || out.stats.undatedRows || out.stats.unknownSkus.length || out.stats.lowOrderMatch)
      setInvoiceMsg({ kind: bad ? 'err' : 'ok', text: parts.join(' · ') })
    } catch (err) {
      console.error(err)
      setInvoiceMsg({ kind: 'err', text: `Invoice upload failed: ${err.message}` })
    } finally {
      if (invoiceFileRef.current) invoiceFileRef.current.value = ''
    }
  }

  // Status badge is DERIVED from the row's own numbers (orderLineStage) so it always agrees with the
  // Confirmed / Non-confirmed / Invoiced / Pending columns — the raw ERP "Order Status" overloaded
  // "Confirmed" against the non-confirmed volume bucket. Colour by stage; terminal/unknown → slate.
  const STAGE_TONE = {
    Delivered: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    Confirmed: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
    'Partially invoiced': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    'Non-confirmed': 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    Pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  }
  const statusBadge = (order) => {
    const label = orderLineStage(order, lineInvoiced(order))
    const cls = STAGE_TONE[label] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${cls}`}>{label || '—'}</span>
  }

  // Customer Orders dropdown filters (Type/Size from the SKU master, keyed on each order line's mmId) +
  // a ref to the on-screen rows so Download CSV exports the filtered/searched/sorted view.
  const skuTypeOf = (code, desc) => skus.find(s => s.skuCode === code)?.productType
    || (/\b(SHS|RHS|CHS)\b/i.exec(desc || '')?.[1]?.toUpperCase() ?? '')
  const ordersFilters = [
    { key: 'type', label: 'Type', accessor: r => skuTypeOf(r.mmId, r.description), options: ['SHS', 'RHS', 'CHS'] },
    { key: 'size', label: 'Size', accessor: r => skuSizeLabel(skus.find(s => s.skuCode === r.mmId), r.description) },
    { key: 'status', label: 'Status', accessor: r => orderLineStage(r, lineInvoiced(r)) },
    { key: 'customer', label: 'Customer', accessor: r => distributorCode(r.customer) },
    // No Plant entry — the header selector (#121) is the one plant control; see the Dispatch tab.
    { key: 'pending', label: 'Pending', accessor: r => linePending(r) > 0 ? 'Has pending' : 'None', options: ['Has pending', 'None'] },
    { key: 'month', label: 'Order month', accessor: r => String(r.orderDate || '').slice(0, 7) },
  ]
  const ordersExportRef = useRef([])

  const columns = [
    { label: 'Order Date',    key: 'orderDate' },
    { label: 'Order ID',      key: 'orderId' },
    { label: 'Customer',      value: r => distributorCode(r.customer), render: r => <span title={r.customer}>{distributorCode(r.customer) || '—'}</span> },
    // Short display name only — "NPMD", never "New Pashchim Maharashtra Patra Depot".
    PLANT_COLUMN,
    { label: 'MM ID (SKU)',   key: 'mmId' },
    { label: 'Description',   key: 'description' },
    { label: 'Qty (MT)',      value: r => fmtT(r.quantity) },
    { label: 'Confirmed (MT)',     value: r => r.confirmed, render: r => fmtT(r.confirmed) },
    { label: 'Non-confirmed (MT)', value: r => r.nonConfirmed, render: r => fmtT(r.nonConfirmed) },
    { label: 'Invoiced (MT)', value: r => fmtT(lineInvoiced(r)) },
    { label: 'Pending (MT)',  value: r => fmtT(linePending(r)) },
    { label: 'Status',        value: r => orderLineStage(r, lineInvoiced(r)), render: r => statusBadge(r) },
  ]

  const activeOrders = (orders || []).filter(o => !o.deleted)
  const openCount = activeOrders.filter(o => isOpenOrderStatus(o.orderStatus)).length

  const downloadOrdersCSV = () => {
    downloadCSV(`orders-${today()}.csv`,
      ['Order Date', 'Order ID', 'Child Order ID', 'Customer', 'Plant', 'MM ID', 'Description', 'Qty (MT)', 'Confirmed (MT)', 'Non-confirmed (MT)', 'Invoiced (MT)', 'Pending (MT)', 'Status'],
      ordersExportRef.current.map(r => [r.orderDate, r.orderId, r.childOrderId, r.customer, plantLabel(r.plant), r.mmId, r.description, r.quantity, fmtT(r.confirmed), fmtT(r.nonConfirmed), fmtT(lineInvoiced(r)), fmtT(linePending(r)), orderLineStage(r, lineInvoiced(r))]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Orders &amp; Invoice</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={downloadOrdersCSV} disabled={activeOrders.length === 0}>⬇ Download CSV</Btn>
          {/* The hidden file input goes with the button. Leaving it mounted would keep the whole
              upload path — input, onUpload, replaceOrders — one line of console away for a user
              the app is withholding it from, and would make "withheld from the DOM" untrue. */}
          {/* Two buttons, two files, one store each (#192). Each keeps its own hidden input and its
              own banner, so a result can never be read against the wrong upload. Both are withheld
              under the SAME `readOnly` grant the single button used — no new permission concept. */}
          {!readOnly && <>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onUpload} className="hidden" />
            <Btn onClick={() => fileRef.current?.click()}>Upload Order Excel</Btn>
            <input ref={invoiceFileRef} type="file" accept=".xlsx,.xls" onChange={onUploadInvoices} className="hidden" />
            <Btn onClick={() => invoiceFileRef.current?.click()}>Upload Invoice Excel</Btn>
          </>}
        </div>
      </div>

      {uploadMsg && (
        <div className={`px-3 py-2 rounded text-sm ${uploadMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          <strong>Orders · </strong>{uploadMsg.text}
        </div>
      )}

      {invoiceMsg && (
        <div className={`px-3 py-2 rounded text-sm ${invoiceMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          <strong>Invoices · </strong>{invoiceMsg.text}
        </div>
      )}

      {readOnly && (
        <p className="text-xs text-slate-400">
          One upload replaces <strong>every</strong> plant’s orders at once, so the daily upload is
          done centrally. Ask an administrator if the order book looks out of date.
        </p>
      )}

      <p className="text-xs text-slate-400">
        Two daily uploads, two files. <strong>Upload Order Excel</strong> reads the One Helix workbook’s
        <strong> Orders</strong> sheet and replaces the order book (with <strong>Confirmed</strong> = Release − Invoiced
        and <strong>Non-confirmed</strong> = Ordered − Release − Cancelled). It no longer touches dispatch data. What the
        screens show as Confirmed is that stored figure <em>net of invoices already raised against the line</em>, because
        the ERP's invoiced column lags until an order is Delivered.
        <strong> Upload Invoice Excel</strong> reads the Zoho invoice register: this app's four plants only
        (matched on the warehouse name), Void invoices dropped, and it rebuilds <strong>only the dates the file covers</strong> — a September file
        rebuilds September and leaves every earlier month exactly as it is. The register names no distributor
        and carries no ship-to state, so both — and the order line each invoice nets against — are read back
        off the <strong>order book</strong>. <strong>Upload the orders first:</strong> into a stale or empty order
        book the tonnage still imports correctly, but the lines read {UNMAPPED_REGION}. Re-uploading the
        invoice file after the orders fixes it.
        <strong> Invoiced</strong> = shipped against this order line; <strong>Pending</strong> = Qty − Invoiced for open orders.
        {' '}{activeOrders.length} order line(s) · {openCount} open.
      </p>

      <Section title="Customer Orders">
        <DataTable columns={columns} data={orders} filters={ordersFilters} exportRef={ordersExportRef} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SALES — distributor-wise sales matrix with SKU drill-down + distributor & period filters.
// Absorbs the former Fulfilment views (Open Order Backlog, SKU Demand vs Supply).
// ═══════════════════════════════════════════════════════════════

// Inline Best Estimate cell. Keeps the keystrokes local and commits on blur / Enter, so a
// per-character write never hits Supabase. Escape reverts. The wrapper swallows the click because
// the distributor row is itself clickable (it opens the drill-down) — without that, typing a target
// would also toggle the SKU breakdown open and shut.
function EstimateCell({ value, onCommit, disabled }) {
  const [draft, setDraft] = useState(value == null ? '' : String(value))
  const [focused, setFocused] = useState(false)
  // Follow the stored value whenever it changes underneath us (month switch, another tab's sync)
  // — but never while the user is mid-edit, which would eat what they are typing.
  useEffect(() => { if (!focused) setDraft(value == null ? '' : String(value)) }, [value, focused])
  const commit = () => {
    setFocused(false)
    const t = draft.trim()
    if (t === (value == null ? '' : String(value))) return
    onCommit(t === '' ? null : Number(t))
  }
  return (
    <span onClick={e => e.stopPropagation()}>
      <input type="number" min="0" step="0.001" inputMode="decimal" value={draft} disabled={disabled}
        aria-label="Best Estimate (MT)" placeholder="—"
        onFocus={() => setFocused(true)}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.currentTarget.blur() }
          else if (e.key === 'Escape') { setDraft(value == null ? '' : String(value)); setFocused(false); e.currentTarget.blur() }
        }}
        className="w-24 px-2 py-1 rounded border border-blue-300 dark:border-blue-700 text-sm text-right bg-blue-50/60 dark:bg-blue-900/20 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50" />
    </span>
  )
}

// Inline Region cell. Region is the only hand-typed value in the state/region pair, and it is keyed
// by STATE, not by distributor — so changing it here re-maps every distributor in that state, which
// the tooltip says out loud. A distributor whose lines carry no state has nothing to key a mapping
// on, so the cell is disabled rather than silently writing nowhere. Commits on change (a select has
// no half-typed state to protect, unlike EstimateCell); the wrapper swallows the click because the
// row itself opens the SKU drill-down.
function RegionCell({ state, region, onCommit, disabled }) {
  const value = REGIONS.includes(region) ? region : ''      // Unmapped renders as the blank option
  return (
    <span onClick={e => e.stopPropagation()}>
      <select value={value} disabled={disabled}
        aria-label={`Region for ${state || 'unknown state'}`}
        title={!state
          ? "No state on this distributor's order or invoice lines — nothing to map a region to"
          : `Region for ${state}. Changing it re-maps EVERY distributor in ${state}.`}
        onChange={e => onCommit(e.target.value)}
        className="w-28 px-2 py-1 rounded border border-blue-300 dark:border-blue-700 text-sm bg-blue-50/60 dark:bg-blue-900/20 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 outline-none disabled:opacity-50">
        <option value="">{UNMAPPED_REGION}</option>
        {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </span>
  )
}

// ── Size × Thickness on the Sales tab — the indent plan's layout, as 2g lays it out on the
// Inventory drill. Every figure comes from `salesSizeLines` / `salesSizePivot` (calc.js); this
// component only picks which rows go in and which blocks are shown. Two scopes, captioned:
//   - the SALES blocks follow the distributor rows (the Distributor dropdown, then Region);
//   - the STOCK blocks follow the plants that SERVE those rows' region (ADR-0006) — one picked
//     distributor reads its own area's plants, an Unmapped one reads "?" (unknown, not 0).
// Its own Plant filter narrows EVERY block to the picked plants: stock from their productions and
// invoices, sales from the orders and invoices booked on them. It only offers plants serving the
// regions in view (and only the header's plant when the header is on one), so it narrows the service
// area and never widens it. Columns are the eight STANDARD thicknesses (`stdThickness`).
const SALES_GRID_TONE = {
  opening: 'bg-slate-100 dark:bg-slate-700/60', production: 'bg-cyan-50 dark:bg-cyan-900/30',
  dispatch: 'bg-rose-50 dark:bg-rose-900/30', closing: 'bg-amber-100 dark:bg-amber-900/30',
  confirmed: 'bg-blue-50 dark:bg-blue-900/30', nonConfirmed: 'bg-violet-50 dark:bg-violet-900/30',
  pending: 'bg-yellow-50 dark:bg-yellow-900/30', required: 'bg-orange-100 dark:bg-orange-900/40',
  // FG ageing: greener is fresher; the last band (past the Auction-list age) is red.
  age0: 'bg-emerald-50 dark:bg-emerald-900/30', age1: 'bg-lime-50 dark:bg-lime-900/30',
  age2: 'bg-amber-100 dark:bg-amber-900/30', age3: 'bg-red-100 dark:bg-red-900/40', aged: 'bg-slate-100 dark:bg-slate-700/60',
}
// Production check's four figures per thickness, in reading order: what sold, what was made, what is
// left, and what is still on order (Pending to Serve = Confirmed + Non-confirmed, today's order book).
const SALES_GRID_CHECK = [['dispatch', 'Invoiced'], ['production', 'Produced'], ['closing', 'Closing'], ['pending', 'Pending']]
const SALES_GRID_SHOW = [
  { key: 'all', label: 'All', measures: SALES_GRID_MEASURES },
  { key: 'stock', label: 'Stock flow', measures: SALES_GRID_STOCK },
  { key: 'sales', label: 'Sales', measures: SALES_GRID_SALES },
  ...SALES_GRID_MEASURES.map(m => ({ key: m.key, label: m.label, measures: [m], single: true })),
]
// Cell text — the CSV prints exactly this. Blank for nothing, "?" for unknown, one decimal otherwise.
const gridCell = (v) => v == null ? '?' : Math.abs(v) < 0.05 ? '' : fmtT(v)
const gridSize = (s) => s ? s.replace('x', '×') : '—'
const gridThk = (t) => t === '' ? '—' : Number(t).toFixed(1)

// The month's From…To — the 1st to its last day, or to today in the current month.
const monthWindow = (month, todayIso) => {
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).toISOString().slice(0, 10)
  return { from: `${month}-01`, to: last < todayIso ? last : todayIso }
}

function SalesSizeGrid({ orders, dispatches, productions, skus, plants, stateRegions, distributors, distributor, month, selectedPlant = ALL_PLANTS }) {
  const todayStr = today()
  // Its own date range. It starts on the Month dropdown's month and follows it whenever that changes;
  // a date typed here moves only this table.
  const [range, setRange] = useState(() => monthWindow(month, todayStr))
  useEffect(() => { setRange(monthWindow(month, todayStr)) }, [month, todayStr])
  const { from, to } = range
  const [regions, setRegions] = useState([])
  const [sections, setSections] = useState([])
  const [sizes, setSizes] = useState([])
  const [thks, setThks] = useState([])
  const [plantNames, setPlantNames] = useState([])
  const [show, setShow] = useState('all')
  const [view, setView] = useState('grid')

  // The distributor rows again, with the invoice window set to From…To (the table above reads the
  // month). Same function, same identities, so the Distributor dropdown's id finds its row here.
  const allRows = useMemo(() => salesByDistributor(orders, dispatches, '', skus, { stateRegions, plants, distributors, from, to }),
    [orders, dispatches, skus, stateRegions, plants, distributors, from, to])
  const picked = distributor ? allRows.find(r => r.id === distributor) || null : null
  // Which distributors' sales go in, and whose plants' stock. A picked distributor overrides the
  // Region filter — its region is a fact, not a choice.
  const scope = useMemo(() => {
    if (picked) return { rows: [picked], stockRegions: [picked.region] }
    if (regions.length) return { rows: allRows.filter(r => regions.includes(r.region)), stockRegions: regions }
    return { rows: allRows, stockRegions: null }
  }, [picked, regions, allRows])
  // The Plant filter's choices: the plants serving the regions in view (every plant when no region
  // is picked), cut to the header's plant when the header is on one. An Unmapped area offers none.
  const plantOptions = useMemo(() => {
    const master = plantMaster(plants)
    const serving = scope.stockRegions == null ? null
      : new Set(scope.stockRegions.filter(r => r !== UNMAPPED_REGION).flatMap(r => [...plantsServingRegion(r, master)]))
    return master.filter(p => (!serving || serving.has(p.id)) && (selectedPlant === ALL_PLANTS || p.id === selectedPlant))
  }, [plants, scope, selectedPlant])
  // A plant that stops being offered (the Region changed) drops out of the selection, so the button
  // never claims a choice that is not being applied.
  useEffect(() => {
    setPlantNames(sel => { const keep = sel.filter(n => plantOptions.some(p => p.name === n)); return keep.length === sel.length ? sel : keep })
  }, [plantOptions])
  const pickedPlants = useMemo(() => {
    const ids = plantOptions.filter(p => plantNames.includes(p.name)).map(p => p.id)
    return ids.length ? ids : null
  }, [plantOptions, plantNames])
  // With a plant picked, the SALES blocks are rebuilt from that plant's own orders and invoices, for
  // the same distributors as `scope.rows` (matched by id, so a distributor with nothing booked on
  // the plant reads 0, never "everyone").
  const salesRows = useMemo(() => {
    if (!pickedPlants) return scope.rows
    const ids = new Set(scope.rows.map(r => r.id))
    return salesByDistributor(filterByPlants(orders, pickedPlants), filterDispatchesByPlants(dispatches, pickedPlants), '', skus,
      { stateRegions, plants, distributors, from, to }).filter(r => ids.has(r.id))
  }, [pickedPlants, scope, orders, dispatches, skus, stateRegions, plants, distributors, from, to])
  const built = useMemo(() => salesSizeLines({ distRows: salesRows, productions, dispatches, skus, plants, from, to, today: todayStr,
    stockRegions: scope.stockRegions, stockPlants: pickedPlants }),
    [salesRows, scope, pickedPlants, productions, dispatches, skus, plants, from, to, todayStr])
  const options = useMemo(() => salesGridOptions(built.lines), [built])
  const blocks = (SALES_GRID_SHOW.find(s => s.key === show) || SALES_GRID_SHOW[0]).measures
  // A line blank in every block on show is left out, so "Stock flow" does not list sizes that only
  // carry orders. Totals are of the kept lines, and the hidden figures are blank anyway.
  const lines = useMemo(() => filterSalesLines(built.lines, { sections, sizes, thicknesses: thks.map(Number) })
    .filter(l => blocks.some(m => {
      // Production required lives on the cell, not the SKU: a line counts when its cell needs any.
      const v = m.key === 'required' ? (built.required === null ? null : built.required.get(salesGridCellKey(l)) || 0) : l[m.key]
      return v == null || Math.abs(v) >= 0.05
    })), [built, sections, sizes, thks, blocks])
  const pivot = useMemo(() => salesSizePivot(lines, built.required), [lines, built])
  // FG ageing, below the grid: the same lines under the same Section / Size / Thickness filters, kept
  // when they hold any aged stock (or it is unknown). Not cut by Show — it is its own table.
  const ageLines = useMemo(() => filterSalesLines(built.lines, { sections, sizes, thicknesses: thks.map(Number) })
    .filter(l => l.aged == null || Math.abs(l.aged) >= 0.05), [built, sections, sizes, thks])
  const agePivot = useMemo(() => salesSizePivot(ageLines, null), [ageLines])
  // Production check (view 'check'): Invoiced, Production and Closing side by side under each
  // thickness, to check production went into the sizes that sell. The same figures as the Dispatch,
  // Production and Closing blocks — only the layout differs. Not cut by Show.
  const checkLines = useMemo(() => filterSalesLines(built.lines, { sections, sizes, thicknesses: thks.map(Number) })
    .filter(l => SALES_GRID_CHECK.some(([k]) => l[k] == null || Math.abs(l[k]) >= 0.05)), [built, sections, sizes, thks])
  const checkPivot = useMemo(() => salesSizePivot(checkLines, null), [checkLines])
  const requiredOn = blocks.some(m => SALES_GRID_REQUIRED.includes(m))
  const regionOptions = useMemo(() => [...REGIONS, UNMAPPED_REGION].filter(r => allRows.some(x => x.region === r)), [allRows])

  const span = `${fmtIso(from)} → ${fmtIso(to)}`
  const blockLabel = (m) => m.key === 'opening' ? `${m.label} · ${fmtIso(from)}` : m.key === 'closing' ? `${m.label} · ${fmtIso(to)}`
    : m.key === 'dispatch' || m.key === 'production' ? `${m.label} · ${span}` : m.label
  const pickedNames = pickedPlants ? pickedPlants.map(id => plantLabel(id)) : []
  const title = `${picked ? distributorCode(picked.customer) : regions.length ? regions.join(' + ') : 'All Distributors'}${pickedNames.length ? ` · ${pickedNames.join(' + ')}` : ''}`
  const fileTag = `${from}-to-${to}${picked ? `-${distributorCode(picked.customer).replace(/[^\w-]+/g, '_')}` : regions.length ? `-${regions.join('-')}` : ''}${pickedNames.length ? `-${pickedNames.join('-').replace(/[^\w-]+/g, '_')}` : ''}`

  const gridRows = [...pivot.rows, { section: '', size: 'Total', cells: pivot.total.cells, total: pivot.total.total, isTotal: true }]
  const ageRows = [...agePivot.rows, { section: '', size: 'Total', cells: agePivot.total.cells, total: agePivot.total.total, isTotal: true }]
  const downloadAgeing = () => downloadCSV(`sales-size-fg-ageing-${fileTag}.csv`,
    ['Section', 'Size', ...SALES_GRID_AGEING.flatMap(m => [...agePivot.thicknesses.map(t => `${m.label} ${gridThk(t)}`), `${m.label} Total`])],
    ageRows.map(r => [r.isTotal ? '' : (r.section || '—'), r.isTotal ? 'Total' : gridSize(r.size),
      ...SALES_GRID_AGEING.flatMap(m => [...agePivot.thicknesses.map(t => gridCell(r.cells[t]?.[m.key] ?? (built.stockKnown ? 0 : null))), gridCell(r.total[m.key])])]))
  const listCols = [
    { label: 'SKU', text: l => l.skuCode },
    { label: 'Description', left: true, wrap: true, text: l => l.description },
    { label: 'Section', left: true, text: l => l.section || '—' },
    { label: 'Size', left: true, text: l => gridSize(l.size) },
    { label: 'Thk (mm)', text: l => l.thickness == null ? '—' : String(l.thickness) },
    { label: 'Std thk', text: l => l.stdThickness == null ? '—' : l.stdThickness.toFixed(1) },
    // Production required is a CELL figure (it does not add up over SKUs), so the SKU list leaves it out.
    ...blocks.filter(m => m.key !== 'required').map(m => ({ label: blockLabel(m), text: l => gridCell(l[m.key]),
      cls: l => l[m.key] != null && l[m.key] < -0.05 ? 'text-red-600 dark:text-red-400 font-semibold' : '' })),
  ]
  const checkRows = [...checkPivot.rows, { section: '', size: 'Total', cells: checkPivot.total.cells, total: checkPivot.total.total, isTotal: true }]
  // A missing cell is 0, except a STOCK figure whose stock is unknown ("?"). Pending is never unknown.
  const checkCell = (r, t, k) => (t === 'total' ? r.total[k] : r.cells[t]?.[k]) ?? (built.stockKnown || k === 'pending' ? 0 : null)
  const downloadGrid = () => {
    if (view === 'list') { flatCSV(`sales-size-list-${fileTag}.csv`, listCols, lines); return }
    if (view === 'check') {
      downloadCSV(`sales-size-production-check-${fileTag}.csv`,
        ['Section', 'Size', ...[...checkPivot.thicknesses, 'total'].flatMap(t => SALES_GRID_CHECK.map(([, l]) => `${t === 'total' ? 'Total' : gridThk(t)} ${l}`))],
        checkRows.map(r => [r.isTotal ? '' : (r.section || '—'), r.isTotal ? 'Total' : gridSize(r.size),
          ...[...checkPivot.thicknesses, 'total'].flatMap(t => SALES_GRID_CHECK.map(([k]) => gridCell(checkCell(r, t, k))))]))
      return
    }
    downloadCSV(`sales-size-grid-${fileTag}.csv`,
      ['Section', 'Size', ...blocks.flatMap(m => [...pivot.thicknesses.map(t => `${blockLabel(m)} ${gridThk(t)}`), `${blockLabel(m)} Total`])],
      gridRows.map(r => [r.isTotal ? '' : (r.section || '—'), r.isTotal ? 'Total' : gridSize(r.size),
        ...blocks.flatMap(m => [...pivot.thicknesses.map(t => gridCell(r.cells[t]?.[m.key] ?? 0)), gridCell(r.total[m.key])])]))
  }
  const red = (v) => v != null && v < -0.05 ? 'text-red-600 dark:text-red-400 font-semibold' : ''
  const th = 'px-1.5 py-0.5 font-semibold whitespace-nowrap'
  const td = 'px-1.5 py-0.5'
  const stockOn = blocks.some(m => SALES_GRID_STOCK.includes(m))
  const areaPlants = pickedNames.length ? pickedNames : (scope.stockRegions || []).filter(r => r !== UNMAPPED_REGION)
    .flatMap(r => [...plantsServingRegion(r, plantMaster(plants))]).map(id => plantLabel(id))

  return (
    <Section title={`Size × Thickness — ${title}`} actions={<Btn size="sm" variant="ghost" disabled={view === 'check' ? !checkLines.length : !lines.length} onClick={downloadGrid}>⬇ CSV</Btn>}>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">From
          <input type="date" aria-label="Size grid from" value={from} max={to}
            onChange={e => e.target.value && setRange(r => ({ ...r, from: e.target.value }))}
            className="px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
        </label>
        <label className="flex items-center gap-1 text-sm text-slate-600 dark:text-slate-300">To
          <input type="date" aria-label="Size grid to" value={to} min={from} max={todayStr}
            onChange={e => e.target.value && setRange(r => ({ ...r, to: e.target.value }))}
            className="px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
        </label>
        {picked
          ? <span className="px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400" title="Set by the Distributor dropdown above">Region: {picked.region} (the distributor’s)</span>
          : <MultiSelectFilter label="Region" options={regionOptions} selected={regions} onChange={setRegions} />}
        <MultiSelectFilter label="Plant" options={plantOptions.map(p => p.name)} selected={plantNames} onChange={setPlantNames} />
        <MultiSelectFilter label="Section" options={options.sections} selected={sections} onChange={setSections} />
        <MultiSelectFilter label="Size" options={options.sizes} selected={sizes} onChange={setSizes} />
        <MultiSelectFilter label="Thickness" options={options.thicknesses.map(t => t.toFixed(1))} selected={thks} onChange={setThks} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3" role="group" aria-label="Show">
        {view !== 'check' && <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Show:</span>}
        {view !== 'check' && SALES_GRID_SHOW.map((s, i) => (
          <React.Fragment key={s.key}>
            {i === 3 && <span className="mx-1 h-5 w-px bg-slate-300 dark:bg-slate-600" aria-hidden="true" />}
            <button type="button" aria-pressed={show === s.key} onClick={() => setShow(s.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${show === s.key ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{s.label}</button>
          </React.Fragment>
        ))}
        <span className="ml-auto flex gap-1.5">
          {[['grid', 'Size × Thickness'], ['check', 'Production check'], ['list', 'SKU list']].map(([k, label]) => (
            <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium ${view === k ? 'bg-slate-700 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200'}`}>{label}</button>
          ))}
        </span>
      </div>

      {view === 'check' ? (!checkLines.length
          ? <p className="text-sm text-slate-400 py-6 text-center">Nothing produced, invoiced or in stock for these filters.</p>
          : (
          <div className="overflow-auto max-h-[70vh] border border-slate-200 dark:border-slate-700 rounded-md">
            <table className="min-w-full text-xs" aria-label="Production check by size and thickness">
              <thead className="sticky top-0 z-10">
                <tr className="text-slate-600 dark:text-slate-200">
                  <th rowSpan={2} className={`${th} text-left align-bottom bg-slate-100 dark:bg-slate-800 sticky left-0`}>Section</th>
                  <th rowSpan={2} className={`${th} text-left align-bottom bg-slate-100 dark:bg-slate-800 sticky left-16`}>Size</th>
                  {[...checkPivot.thicknesses, 'total'].map(t => <th key={t} colSpan={SALES_GRID_CHECK.length} className={`${th} text-center border-l-2 border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800`}>{t === 'total' ? 'Total' : `${gridThk(t)} mm`}</th>)}
                </tr>
                <tr className="text-slate-600 dark:text-slate-200">
                  {[...checkPivot.thicknesses, 'total'].map(t => SALES_GRID_CHECK.map(([k, l], i) => (
                    <th key={`${t}|${k}`} className={`${th} text-right ${i ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'} ${SALES_GRID_TONE[k]}`}>{l}</th>
                  )))}
                </tr>
              </thead>
              <tbody>
                {checkRows.map(r => (
                  <tr key={r.isTotal ? 'total' : `${r.section}|${r.size}`} className={`border-t border-slate-200 dark:border-slate-700 ${r.isTotal ? 'font-semibold bg-slate-50 dark:bg-slate-900' : ''}`}>
                    <td className={`${td} text-left whitespace-nowrap sticky left-0 bg-white dark:bg-slate-800 w-16`}>{r.isTotal ? '' : (r.section || '—')}</td>
                    <td className={`${td} text-left whitespace-nowrap sticky left-16 bg-white dark:bg-slate-800`}>{r.isTotal ? 'Total' : gridSize(r.size)}</td>
                    {[...checkPivot.thicknesses, 'total'].map(t => SALES_GRID_CHECK.map(([k], i) => {
                      const v = checkCell(r, t, k)
                      return <td key={`${t}|${k}`} className={`${td} text-right tabular-nums whitespace-nowrap ${i ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'} ${t === 'total' ? 'font-semibold' : ''} ${red(v)}`}>{gridCell(v)}</td>
                    }))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))
        : !lines.length ? <p className="text-sm text-slate-400 py-6 text-center">Nothing stocked, produced, invoiced or on order for these filters.</p>
        : view === 'list' ? <>
            {requiredOn && <p className="mb-2 text-xs text-slate-500 dark:text-slate-400"><strong>Production required</strong> is worked out per cell of the grid, not per SKU, so the SKU list does not show it — switch to Size × Thickness.</p>}
            <div className="max-h-[70vh] overflow-auto"><FlatTable label="Sales by SKU" cols={listCols} rows={lines} rowKey={l => l.key} /></div>
          </>
        : (
          <div className="overflow-auto max-h-[70vh] border border-slate-200 dark:border-slate-700 rounded-md">
            <table className="min-w-full text-xs" aria-label="Sales by size and thickness">
              <thead className="sticky top-0 z-10">
                <tr className="text-slate-600 dark:text-slate-200">
                  <th rowSpan={2} className={`${th} text-left align-bottom bg-slate-100 dark:bg-slate-800 sticky left-0`}>Section</th>
                  <th rowSpan={2} className={`${th} text-left align-bottom bg-slate-100 dark:bg-slate-800 sticky left-16`}>Size</th>
                  {blocks.map(m => <th key={m.key} colSpan={pivot.thicknesses.length + 1} className={`${th} text-center border-l-2 border-slate-300 dark:border-slate-600 ${SALES_GRID_TONE[m.key]}`}>{blockLabel(m)}</th>)}
                </tr>
                <tr className="text-slate-600 dark:text-slate-200">
                  {blocks.map(m => (
                    <React.Fragment key={m.key}>
                      {pivot.thicknesses.map((t, i) => <th key={t} className={`${th} text-right ${i ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'} ${SALES_GRID_TONE[m.key]}`}>{gridThk(t)}</th>)}
                      <th className={`${th} text-right ${pivot.thicknesses.length ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'} ${SALES_GRID_TONE[m.key]}`}>Total</th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>
              <tbody>
                {gridRows.map(r => (
                  <tr key={r.isTotal ? 'total' : `${r.section}|${r.size}`} className={`border-t border-slate-200 dark:border-slate-700 ${r.isTotal ? 'font-semibold bg-slate-50 dark:bg-slate-900' : ''}`}>
                    <td className={`${td} text-left whitespace-nowrap sticky left-0 bg-white dark:bg-slate-800 w-16`}>{r.isTotal ? '' : (r.section || '—')}</td>
                    <td className={`${td} text-left whitespace-nowrap sticky left-16 bg-white dark:bg-slate-800`}>{r.isTotal ? 'Total' : gridSize(r.size)}</td>
                    {blocks.map(m => (
                      <React.Fragment key={m.key}>
                        {pivot.thicknesses.map((t, i) => {
                          const v = r.cells[t]?.[m.key] ?? (built.stockKnown || SALES_GRID_SALES.includes(m) ? 0 : null)
                          return <td key={t} className={`${td} text-right tabular-nums whitespace-nowrap ${i ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'} ${red(v)}`}>{gridCell(v)}</td>
                        })}
                        <td className={`${td} text-right tabular-nums whitespace-nowrap font-semibold ${pivot.thicknesses.length ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'} ${red(r.total[m.key])}`}>{gridCell(r.total[m.key])}</td>
                      </React.Fragment>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      <div className="mt-5 mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">FG ageing · as of {fmtIso(to)}</h3>
        <span className="text-xs text-slate-500 dark:text-slate-400">days since production, of the stock still on hand</span>
        <span className="ml-auto"><Btn size="sm" variant="ghost" disabled={!ageLines.length} onClick={downloadAgeing}>⬇ CSV</Btn></span>
      </div>
      {!ageLines.length ? <p className="text-sm text-slate-400 py-4 text-center">No finished stock on hand for these filters.</p> : (
        <div className="overflow-auto max-h-[70vh] border border-slate-200 dark:border-slate-700 rounded-md">
          <table className="min-w-full text-xs" aria-label="FG ageing by size and thickness">
            <thead className="sticky top-0 z-10">
              <tr className="text-slate-600 dark:text-slate-200">
                <th rowSpan={2} className={`${th} text-left align-bottom bg-slate-100 dark:bg-slate-800 sticky left-0`}>Section</th>
                <th rowSpan={2} className={`${th} text-left align-bottom bg-slate-100 dark:bg-slate-800 sticky left-16`}>Size</th>
                {SALES_GRID_AGEING.map(m => <th key={m.key} colSpan={agePivot.thicknesses.length + 1} className={`${th} text-center border-l-2 border-slate-300 dark:border-slate-600 ${SALES_GRID_TONE[m.key]}`}>{m.label}</th>)}
              </tr>
              <tr className="text-slate-600 dark:text-slate-200">
                {SALES_GRID_AGEING.map(m => (
                  <React.Fragment key={m.key}>
                    {agePivot.thicknesses.map((t, i) => <th key={t} className={`${th} text-right ${i ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'} ${SALES_GRID_TONE[m.key]}`}>{gridThk(t)}</th>)}
                    <th className={`${th} text-right ${agePivot.thicknesses.length ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'} ${SALES_GRID_TONE[m.key]}`}>Total</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {ageRows.map(r => (
                <tr key={r.isTotal ? 'total' : `${r.section}|${r.size}`} className={`border-t border-slate-200 dark:border-slate-700 ${r.isTotal ? 'font-semibold bg-slate-50 dark:bg-slate-900' : ''}`}>
                  <td className={`${td} text-left whitespace-nowrap sticky left-0 bg-white dark:bg-slate-800 w-16`}>{r.isTotal ? '' : (r.section || '—')}</td>
                  <td className={`${td} text-left whitespace-nowrap sticky left-16 bg-white dark:bg-slate-800`}>{r.isTotal ? 'Total' : gridSize(r.size)}</td>
                  {SALES_GRID_AGEING.map(m => (
                    <React.Fragment key={m.key}>
                      {agePivot.thicknesses.map((t, i) => {
                        const v = r.cells[t]?.[m.key] ?? (built.stockKnown ? 0 : null)
                        return <td key={t} className={`${td} text-right tabular-nums whitespace-nowrap ${i ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'}`}>{gridCell(v)}</td>
                      })}
                      <td className={`${td} text-right tabular-nums whitespace-nowrap font-semibold ${agePivot.thicknesses.length ? '' : 'border-l-2 border-slate-300 dark:border-slate-600'}`}>{gridCell(r.total[m.key])}</td>
                    </React.Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        One row per section and size, one column per <strong>standard thickness</strong> (mm) inside each block — the indent plan’s layout. SKUs of one size and
        standard thickness add up in one cell: 2.2 mm counts in 2.0; 2.8, 2.9 and 3.2 mm count in 3.0 (the Coil Tracker’s eight standards). The SKU list shows each SKU’s own thickness. <strong>Sales</strong> blocks follow the Distributor dropdown above{picked ? '' : ' and the Region filter'}:
        Confirmed / Non-confirmed are today’s open order book (not dated, so not cut by the dates); Pending to Serve = Confirmed + Non-confirmed.
        {pickedNames.length ? <> With <strong>Plant</strong> = {pickedNames.join(' + ')}, every block is that plant’s: its stock, and the orders and invoices booked on it.</> : null}
        {' '}<strong>Stock flow</strong> is finished stock (produced − invoiced) from {fmtIso(from)} to {fmtIso(to)} at {pickedNames.length
          ? pickedNames.join(' + ')
          : scope.stockRegions == null ? 'every plant'
          : areaPlants.length ? `the plants that serve ${scope.stockRegions.filter(r => r !== UNMAPPED_REGION).join(' + ')} (${[...new Set(areaPlants)].join(' + ')})` : 'no plant'}:
        Opening is the close of the day before From; Production and Dispatch are From to To, both days included; Closing = Opening + Production − Dispatch, as of To.
        Dispatch is invoiced <em>out of</em> those plants, to anyone.
        {' '}<strong>Production required</strong> = Pending to Serve less Closing stock, per cell, never below 0; a negative Closing counts as 0, so a recording gap
        never asks for more. Each region’s orders are netted only against the stock of the plants that serve it, then the regions are added — so under All regions it
        is not the cell’s Pending to Serve − Closing. Not rounded: rounding to a campaign is Suggested production, on the Production Planning tab.
        The dates start on the Month selected above and follow it when it changes; a date picked here moves only this table.
        {' '}<strong>Production check</strong> puts Invoiced, Produced, Closing and Pending side by side under each thickness, so a size made but not
        selling (Produced with no Invoiced or Pending, Closing climbing) or wanted but not made (Pending above Closing, nothing Produced) reads in one place.
        Invoiced is the Dispatch block (invoiced out of these plants, From to To), Closing is as of To, and Pending is Pending to Serve — today’s open
        order book, not cut by the dates, following the Distributor and Region filters like the other Sales blocks.
        {' '}<strong>FG ageing</strong> is the stock on hand on {fmtIso(to)}, at the same plants as Closing stock, by days since it was produced: at each plant, invoices
        take the oldest batches first and what is left is aged (the Dashboard’s FG ageing bands; 75+ d is past the Auction-list age). It does not follow Show or the From date.
        All ages equals Closing stock, except where a plant has invoiced a size beyond its production: that plant’s negative has no age, so All ages reads higher there.
        {' '}A <span className="text-red-600 dark:text-red-400 font-semibold">negative</span> stock is a size invoiced beyond what was recorded produced. Follows the header plant selector.
      </p>
      {stockOn && !built.stockKnown && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          <strong>This distributor’s state carries no region</strong>, so we cannot tell which plants serve it and every stock figure reads “?” rather than 0 —
          unknown, not empty. Map the state in the Region column of the Distributor-wise Sales table.
        </p>
      )}
      {requiredOn && built.stockKnown && built.unmappedPending >= 0.05 && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          <strong>{fmtT(built.unmappedPending)} T of orders are not counted in Production required</strong> — they belong to distributors whose state carries no
          region, so we cannot tell which plants’ stock covers them (unknown, not 0). Map the state in the Region column of the Distributor-wise Sales table.
        </p>
      )}
      {(stockOn || requiredOn) && !built.stockKnown && !stockOn && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          <strong>This distributor’s state carries no region</strong>, so we cannot tell which plants serve it and Production required reads “?” rather than a figure.
          Map the state in the Region column of the Distributor-wise Sales table.
        </p>
      )}
      {stockOn && built.stockKnown && scope.stockRegions != null && !areaPlants.length && (
        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
          <strong>No plant serves {scope.stockRegions.join(' + ')}</strong>, so every stock figure is 0. That is the real position, not a loading error —
          which plants serve a region is set on the Masters tab.
        </p>
      )}
    </Section>
  )
}

function SalesDashboard({ orders, dispatches, skus, productions = [], estimates = [], setEstimates = null, stateRegions = [], setStateRegions = null, plants = [], distributors = [], selectedPlant = ALL_PLANTS, canWiden = true }) {
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  // ── Best Estimate under a plant filter (ticket #121) ──────────────────────────────────────────
  // A Best Estimate is typed per distributor per month and carries NO plant — #117 puts a per-plant
  // Best Estimate explicitly out of scope ("Best Estimate stays per distributor per month, and
  // Plant Best Estimate stays their sum"). So `orders`/`dispatches` above arrive plant-scoped while
  // `estimates` cannot be, and every figure that DIVIDES one by the other silently changes meaning:
  // achievement would read one plant's invoiced tonnage against the whole company's plan. That is
  // the very four-plants-against-one mismatch #117 exists to expose, so it must not be reintroduced
  // here under a filter.
  //
  // The plan itself is still real and still shown — Best Estimate stays on the table, and the TOTAL
  // row still sums it, because a company-wide plan is a correct company-wide number. What is
  // withheld while scoped is the COMPARISON: % of BE, Gap to BE, and the Plant BE achievement line.
  // Blanking a figure whose basis does not hold is the same discipline `Unattributed` follows —
  // show the gap, never paper over it with a number that looks fine and is not.
  const plantScoped = selectedPlant !== ALL_PLANTS
  const plantScopeName = plantLabel(selectedPlant)
  // The closing sentence names a control only an admin has — a plant user cannot switch to All
  // Plants, so telling them to is telling them to do something impossible (the same fix Dispatch's
  // filter note carries as `canWiden`).
  const beScopeNote = `Best Estimate is company-wide (never split by plant), so it cannot be measured against ${plantScopeName}'s invoiced tonnage alone. ${canWiden ? 'Switch to All Plants to see achievement.' : 'Achievement against it is read on the All Plants view.'}`

  const todayStr = today()
  const curMonth = todayStr.slice(0, 7)
  // Free Stock is the one figure on this tab that can legitimately go negative — a size committed
  // beyond what is on the floor. Red is the signal, not an error state.
  const redIfNeg = (v) => <span className={Number(v) < 0 ? 'text-red-600 dark:text-red-400 font-semibold' : ''}>{fmtT(v)}</span>

  // ── Filters. `month` scopes the invoiced (MTD) figure only — Confirmed / Non-confirmed are a
  // carried-forward order-book snapshot. Default = the current calendar month. ──
  const [month, setMonth] = useState(curMonth)
  const [distributor, setDistributor] = useState('')       // '' = All distributors
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // Month options = every month present in orders/dispatches ∪ the current month, newest first.
  const monthOptions = useMemo(() => {
    const set = new Set([curMonth])
    ;(orders || []).forEach(o => { const m = String(o.orderDate || '').slice(0, 7); if (m) set.add(m) })
    ;(dispatches || []).forEach(d => { const m = String(d.dateOfDispatch || '').slice(0, 7); if (m) set.add(m) })
    return [...set].sort().reverse()
  }, [orders, dispatches, curMonth])

  const kpis = useMemo(() => salesKpis(orders, dispatches, month), [orders, dispatches, month])
  const allRows = useMemo(() => salesByDistributor(orders, dispatches, month, skus, { estimates, productions, stateRegions, plants, distributors }),
    [orders, dispatches, month, skus, estimates, productions, stateRegions, plants, distributors])
  const rows = useMemo(() => distributor ? allRows.filter(r => r.id === distributor) : allRows, [allRows, distributor])
  const selected = useMemo(() => allRows.find(r => r.id === selectedCustomer) || null, [allRows, selectedCustomer])

  // Whose stock the drill-down is showing (ticket #129). The stock columns are scoped to the open
  // distributor's SERVICE AREA, so the tooltips have to name it — "the plant's stock" is the
  // sentence that made the workbook offer Hyderabad tonnage to West distributors for a month.
  const selectedRegion = selected?.region || UNMAPPED_REGION
  // The plants that serve a region, by display name. One helper, three readers (two tooltips and
  // the caption) — three sites re-deriving "whose stock is this?" is three chances to tell the
  // reader a different story about the same tonnage.
  const areaPlants = useCallback((region) => region === UNMAPPED_REGION ? []
    : [...plantsServingRegion(region, plantMaster(plants))].map(id => plantLabel(id)), [plants])
  // The same thing said as a noun phrase, for a tooltip. Every branch has to name the AREA, because
  // a figure whose scope is unstated is what this ticket was about: "the plant's stock" is the
  // sentence that let the workbook offer Hyderabad tonnage to West for a month.
  const areaLabel = useCallback((region) => {
    if (region === UNMAPPED_REGION) return 'an unknown service area (this distributor\u2019s state carries no region)'
    const names = areaPlants(region)
    return names.length ? `${names.join(' + ')} \u2014 the plants serving ${region}` : `${region}, which no plant serves`
  }, [areaPlants])
  const monthRows = useMemo(() => salesByMonth(orders, dispatches), [orders, dispatches])

  // Filter options carry the identity id as value (matches r.id) and the short code as label.
  const distOptions = useMemo(() => allRows
    .filter(r => r.customer && r.customer !== '—')
    .map(r => ({ id: r.id, label: distributorCode(r.customer) }))
    .sort((a, b) => a.label.localeCompare(b.label)), [allRows])

  const monthLabel = (key) => {
    try { return new Date(key + '-01T00:00:00Z').toLocaleString('en-US', { month: 'short', year: 'numeric' }) }
    catch { return key }
  }

  // ── Best Estimate write path. One row per (distributorKey, month); a blank clears the target by
  // soft-deleting the row, so the distributor drops out of the plant BE sum rather than counting as
  // a target of zero. `distributorName` is stored for readability only — `distributorKey` is the
  // join. ──
  const saveEstimate = useCallback((row, value) => {
    if (!setEstimates) return
    setEstimates(prev => {
      const i = (prev || []).findIndex(e => String(e.distributorKey) === String(row.id) && String(e.month) === month)
      if (i >= 0) {
        const next = [...prev]
        next[i] = { ...next[i], bestEstimate: value, distributorName: row.customer, deleted: value == null }
        return next
      }
      if (value == null) return prev || []      // nothing stored, nothing to clear
      return [...(prev || []), {
        id: crypto.randomUUID(), distributorKey: row.id, distributorName: row.customer,
        month, bestEstimate: value, deleted: false,
      }]
    })
  }, [setEstimates, month])

  // ── Region write path. One row per STATE (not per distributor), so this single write re-maps every
  // distributor in that state — new ones included, which is the whole point of a state-keyed master.
  // A blank region is stored as '' rather than soft-deleted: the static seed is layered UNDER the
  // stored rows, so only an explicit blank can un-map a seeded state. Re-using the seed's own id for
  // a seeded state keeps the first write idempotent; `state` is the upsert arbiter either way. ──
  const saveRegion = useCallback((state, region) => {
    if (!setStateRegions) return
    const key = normStateName(state)
    if (!key) return                       // no state ⇒ nothing to key the mapping on
    setStateRegions(prev => {
      const rows = prev || []
      const i = rows.findIndex(r => normStateName(r.state) === key)
      if (i >= 0) {
        const next = [...rows]
        next[i] = { ...next[i], state: key, region, deleted: false }
        return next
      }
      const seeded = DEFAULT_STATE_REGIONS.find(r => normStateName(r.state) === key)
      return [...rows, { id: seeded?.id || crypto.randomUUID(), state: key, region, deleted: false }]
    })
  }, [setStateRegions])

  // Plant Best Estimate = Σ the month's distributor estimates (ADR-0001) — nothing is typed at plant
  // level. Shown under the table so the derived total and its achievement are visible in one place.
  const beTotals = useMemo(() => {
    const be = allRows.reduce((t, r) => t + (r.bestEstimate ?? 0), 0)
    const invoicedAgainstBe = allRows.reduce((t, r) => r.bestEstimate != null ? t + r.mtdInvoice : t, 0)
    const unallocated = allRows.reduce((t, r) => r.bestEstimate == null ? t + r.mtdInvoice : t, 0)
    return { be: be > 0 ? be : null, invoicedAgainstBe, unallocated, pct: be > 0 ? (kpis.mtdInvoice / be) * 100 : null }
  }, [allRows, kpis.mtdInvoice])

  // Distributor & month tables share the same five metrics (salesKpis logic, grouped).
  const salesCols = [
    { label: 'Distributor', value: r => distributorCode(r.customer), render: r => <span title={r.customer}>{distributorCode(r.customer) || '—'}</span> },
    // State — DERIVED from this distributor's own order/invoice lines, never typed. A distributor
    // whose lines disagree shows the most recent state plus a "+N" marker, so a genuinely multi-state
    // party is visible instead of silently collapsed to one.
    { label: 'State', value: r => r.state || '',
      render: r => !r.state
        ? <span className="text-slate-400" title="No state on this distributor's order or invoice lines">—</span>
        : <span title={r.multiState ? `Lines across ${r.states.length} states: ${r.states.join(', ')} — showing the most recent` : r.state}>
            {r.state}
            {r.multiState && <span className="ml-1 text-amber-600 dark:text-amber-400 font-medium">+{r.states.length - 1}</span>}
          </span> },
    // Region — the one hand-mapped value, held per STATE and editable in place.
    { label: 'Region', value: r => r.region,
      render: r => <RegionCell state={r.state} region={r.region}
        disabled={!setStateRegions || !r.state} onCommit={v => saveRegion(r.state, v)} /> },
    // Best Estimate — typed target for the SELECTED month, editable in place.
    { label: 'Best Estimate (T)', value: r => r.bestEstimate ?? 0,
      render: r => <EstimateCell value={r.bestEstimate} disabled={!setEstimates} onCommit={v => saveEstimate(r, v)} />,
      total: v => fmtT(v) },
    // Both compare a plant-scoped actual against a company-wide plan once a plant is selected, so
    // they read "—" rather than a mixed-basis number (see beScopeNote above).
    { label: '% of BE', value: r => plantScoped ? -1 : (r.pctOfBe ?? -1),
      render: r => plantScoped
        ? <span className="text-slate-400" title={beScopeNote}>—</span>
        : r.pctOfBe == null
          ? <span className="text-slate-400">—</span>
          : <span className={r.pctOfBe >= 100 ? 'text-emerald-600 dark:text-emerald-400 font-medium' : r.pctOfBe >= 80 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'}>{Math.round(r.pctOfBe)}%</span> },
    { label: 'Gap to BE (T)', value: r => plantScoped ? 0 : (r.gapToBe ?? 0),
      render: r => plantScoped
        ? <span className="text-slate-400" title={beScopeNote}>—</span>
        : r.gapToBe == null
          ? <span className="text-slate-400">—</span>
          : <span className={r.gapToBe > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}>{fmtT(r.gapToBe)}</span>,
      total: v => plantScoped ? '—' : fmtT(v) },
    { label: 'Confirmed (T)', value: r => r.confirmed, render: r => fmtT(r.confirmed), total: v => fmtT(v) },
    { label: 'Non-confirmed (T)', value: r => r.nonConfirmed, render: r => fmtT(r.nonConfirmed), total: v => fmtT(v) },
    { label: 'Pending to Dispatch (T)', value: r => r.pending, render: r => fmtT(r.pending), total: v => fmtT(v) },
    { label: 'MTD Invoice (T)', value: r => r.mtdInvoice, render: r => fmtT(r.mtdInvoice), total: v => fmtT(v) },
    { label: 'Total Orders (T)', value: r => r.totalOrders, render: r => fmtT(r.totalOrders), total: v => fmtT(v) },
  ]
  const skuCols = [
    { label: 'SKU', key: 'skuCode' },
    // The row's own description first: an ERP code the SKU master doesn't carry has no master
    // description to look up, and skuDesc() would fall back to printing the MM ID itself.
    { label: 'Description', value: r => r.description || skuDesc(r.skuCode) },
    { label: 'Confirmed (T)', value: r => r.confirmed, render: r => fmtT(r.confirmed), total: v => fmtT(v) },
    { label: 'Non-confirmed (T)', value: r => r.nonConfirmed, render: r => fmtT(r.nonConfirmed), total: v => fmtT(v) },
    { label: 'Pending to Dispatch (T)', value: r => r.pending, render: r => fmtT(r.pending), total: v => fmtT(v) },
    { label: 'MTD Invoice (T)', value: r => r.mtdInvoice, render: r => fmtT(r.mtdInvoice), total: v => fmtT(v) },
    { label: 'Total Orders (T)', value: r => r.totalOrders, render: r => fmtT(r.totalOrders), total: v => fmtT(v) },
    // ── Inventory against the orders, scoped to this distributor's SERVICE AREA (ticket #129). Free
    // Stock is the stock of the plants that serve its region, less the Confirmed tonnage of every
    // distributor in that same area — unreserved there, so the same figure shows under every
    // distributor in the area waiting on that size (ADR-0002). "All Distr. Pending" is what makes
    // that sharing visible: stock below it means the size is oversubscribed even where this
    // distributor alone looks covered. A null (an `Unmapped` distributor — no known service area)
    // renders as an em dash, never as 0. ──
    { label: 'Free Stock (T)', value: r => r.freeStock ?? 0,
      render: r => r.freeStock == null
        ? <span className="text-slate-400" title={`No region mapped for this distributor's state, so we cannot tell which plants serve it. Map the state in the Region column above.`}>—</span>
        : <span title={`Stock at ${areaLabel(selectedRegion)}, less the Confirmed orders of every distributor in that area — not reserved for this one. On-hand ${fmtT(r.onhand ?? 0)} T − Confirmed ${fmtT(r.allConfirmed ?? 0)} T`}>{redIfNeg(r.freeStock)}</span>,
      total: v => redIfNeg(v) },
    { label: 'All Distr. Pending (T)', value: r => r.allPending ?? 0,
      render: r => r.allPending == null ? <span className="text-slate-400">—</span>
        : <span className={r.onhand != null && r.allPending > r.onhand ? 'text-amber-600 dark:text-amber-400' : ''}
            title={`Pending across every distributor in ${selectedRegion} — the demand competing for this same stock. Distributors elsewhere are served from other plants and are not counted here.`}>{fmtT(r.allPending)}</span> },
    { label: 'Short by (T)', value: r => r.shortBy ?? 0,
      render: r => r.shortBy == null ? <span className="text-slate-400">—</span>
        : r.shortBy > 0
          ? <span className="text-red-600 dark:text-red-400 font-medium">{fmtT(r.shortBy)}</span>
          : <span className="text-emerald-600 dark:text-emerald-400">—</span>,
      total: v => fmtT(v) },
  ]
  // SKU Breakdown dropdown filters (Type/Size, derived from the SKU master via each row's skuCode) +
  // a ref to the on-screen rows so the SKU CSV exports exactly the filtered/searched/sorted view.
  // Both read the row's own description when the master has no row for the code — otherwise every
  // master-less SKU falls into a blank Type/Size bucket and the dropdowns cannot reach it.
  const skuTypeOf = useCallback((code, desc) => skus.find(s => s.skuCode === code)?.productType
    || (/\b(SHS|RHS|CHS)\b/i.exec(desc || skuDesc(code) || '')?.[1]?.toUpperCase() ?? ''), [skus, skuDesc])
  const skuSizeOf = useCallback((code, desc) => skuSizeLabel(skus.find(s => s.skuCode === code), desc || skuDesc(code)), [skus, skuDesc])
  const skuBreakdownFilters = [
    { key: 'type', label: 'Type', accessor: r => skuTypeOf(r.skuCode, r.description), options: ['SHS', 'RHS', 'CHS'] },
    { key: 'size', label: 'Size', accessor: r => skuSizeOf(r.skuCode, r.description) },
  ]
  const skuBreakdownExportRef = useRef([])
  const monthCols = [
    { label: 'Month', value: r => r.month, render: r => monthLabel(r.month) },
    { label: 'Confirmed (T)', value: r => r.confirmed, render: r => fmtT(r.confirmed), total: v => fmtT(v) },
    { label: 'Non-confirmed (T)', value: r => r.nonConfirmed, render: r => fmtT(r.nonConfirmed), total: v => fmtT(v) },
    { label: 'Pending to Dispatch (T)', value: r => r.pending, render: r => fmtT(r.pending), total: v => fmtT(v) },
    { label: 'Invoiced (T)', value: r => r.invoiced, render: r => fmtT(r.invoiced), total: v => fmtT(v) },
    { label: 'Total Orders (T)', value: r => r.totalOrders, render: r => fmtT(r.totalOrders), total: v => fmtT(v) },
  ]

  const inputCls = 'px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Sales Dashboard</h2>
        <Btn size="sm" variant="ghost" onClick={() => downloadCSV(`distributor-sales-${todayStr}.csv`,
          ['Distributor', 'State', 'All States', 'Region', 'Best Estimate (T)', '% of BE', 'Gap to BE (T)', 'Confirmed (T)', 'Non-confirmed (T)', 'Pending to Dispatch (T)', 'MTD Invoice (T)', 'Total Orders (T)'],
          // "All States" is only populated for a multi-state distributor — it is what makes the
          // resolved single State auditable rather than something to take on trust.
          // % of BE / Gap to BE are blanked under a plant filter for the same reason the columns
          // are — an exported mixed-basis figure outlives the screen that explained it.
          rows.map(r => [r.customer, r.state || '', r.multiState ? r.states.join(' | ') : '', r.region,
            r.bestEstimate == null ? '' : fmtT(r.bestEstimate),
            plantScoped || r.pctOfBe == null ? '' : `${Math.round(r.pctOfBe)}%`,
            plantScoped || r.gapToBe == null ? '' : fmtT(r.gapToBe),
            fmtT(r.confirmed), fmtT(r.nonConfirmed), fmtT(r.pending), fmtT(r.mtdInvoice), fmtT(r.totalOrders)]))}>⬇ Sales CSV</Btn>
      </div>
      <p className="text-xs text-slate-400 -mt-3">
        <strong>Confirmed</strong> = Release − Invoiced (orders confirmed, pending dispatch), <em>less any tonnage already
        invoiced against the line</em> — the ERP's own invoiced figure does not fill until an order reaches Delivered, so
        without that the same steel is counted as both shipped and still owed; <strong>Non-confirmed</strong> = Ordered − Release − Cancelled;
        both are the carried-forward order-book snapshot. <strong>MTD Invoice</strong> = invoiced tonnage in the selected month (<strong>{monthLabel(month)}</strong>);
        <strong> Pending to Dispatch</strong> = Confirmed + Non-confirmed; <strong>Total Orders</strong> = MTD Invoice + Confirmed + Non-confirmed. All weights in MT.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card title="Total Orders" value={`${fmtT(kpis.totalOrders)} T`} sub="Invoiced + Confirmed + Non-conf." color="indigo" />
        <Card title="Pending to Dispatch" value={`${fmtT(kpis.pending)} T`} color="amber"
          parts={[
            { label: 'Confirmed', value: `${fmtT(kpis.confirmed)} T`, color: 'emerald' },
            { label: 'Non-confirmed', value: `${fmtT(kpis.nonConfirmed)} T`, color: 'cyan' },
          ]} />
        <Card title="MTD Invoice" value={`${fmtT(kpis.mtdInvoice)} T`} sub={`Invoiced · ${monthLabel(month)}`} color="emerald" />
      </div>

      <Section title="Distributor-wise Sales" actions={
        <div className="flex items-center gap-2 flex-wrap">
          <select value={distributor} onChange={e => setDistributor(e.target.value)} className={inputCls}>
            <option value="">All Distributors</option>
            {distOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
          <select value={month} onChange={e => setMonth(e.target.value)} className={inputCls} title="Scopes the MTD Invoice / Total Orders figures">
            {monthOptions.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
          </select>
        </div>
      }>
        {rows.length ? (
          <>
            <DataTable columns={salesCols} data={rows} excel maxHeight="60vh" totalsLabel="TOTAL"
              onRowClick={r => setSelectedCustomer(r.id)}
              highlightRow={r => r.id === selectedCustomer} />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              MTD Invoice scoped to <strong>{monthLabel(month)}</strong>; Confirmed / Non-confirmed are the live order-book snapshot. Click a distributor for its SKU-wise breakdown.
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              <strong>State</strong> is derived from the distributor's own order and invoice lines — never typed. A
              <span className="text-amber-600 dark:text-amber-400 font-medium"> +N</span> marker means its lines span
              several states and the most recent one is shown (hover for the full list). <strong>Region</strong> is held
              per <em>state</em>, so changing it here re-maps <strong>every</strong> distributor in that state, and a new
              distributor in a mapped state inherits it automatically. A state with no region reads
              <strong> {UNMAPPED_REGION}</strong> and still counts in every total.
            </p>
            {/* The plant Best Estimate is Σ the rows above — never typed (ADR-0001). Invoiced by a
                distributor with no target counts in the actual but not in the plan, so % of BE can
                pass 100% without the plan being beaten; it is called out rather than absorbed. */}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              <strong>Best Estimate</strong> = the target you type for {monthLabel(month)}, measured against MTD Invoice only.
              {' '}Plant BE <strong>{beTotals.be == null ? 'not set' : `${fmtT(beTotals.be)} T`}</strong>
              {/* Achievement is withheld under a plant filter — one plant's invoiced against the
                  whole company's plan is the four-against-one mismatch #117 exists to expose. */}
              {plantScoped
                ? <> — <span className="text-amber-600 dark:text-amber-400">company-wide, not {plantScopeName}'s. {beScopeNote}</span></>
                : <>
                    {beTotals.pct != null && <> · invoiced <strong>{Math.round(beTotals.pct)}%</strong> of it</>}.
                    {beTotals.unallocated > 0.0005 && (
                      <span className="text-amber-600 dark:text-amber-400">
                        {' '}{fmtT(beTotals.unallocated)} T invoiced by distributors with no estimate — counted in the actual, not in the plan.
                      </span>
                    )}
                  </>}
              {' '}Estimates do not carry over: each month starts blank.
            </p>
          </>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No order / invoice data yet</p>}
      </Section>

      {selected && (
        <Section title={`SKU Breakdown — ${distributorCode(selected.customer)}`} actions={
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="ghost" disabled={!selected.skuRows.length} onClick={() => downloadCSV(
              `sku-breakdown-${(selected.customer || 'distributor').replace(/[^\w-]+/g, '_')}-${todayStr}.csv`,
              ['SKU', 'Description', 'Confirmed (T)', 'Non-confirmed (T)', 'Pending to Dispatch (T)', 'MTD Invoice (T)', 'Total Orders (T)',
                'Free Stock (T)', 'All Distr. Pending (T)', 'Short by (T)'],
              skuBreakdownExportRef.current.map(r => [r.skuCode, r.description || skuDesc(r.skuCode), fmtT(r.confirmed), fmtT(r.nonConfirmed), fmtT(r.pending), fmtT(r.mtdInvoice), fmtT(r.totalOrders),
                r.freeStock == null ? '' : fmtT(r.freeStock), r.allPending == null ? '' : fmtT(r.allPending), r.shortBy == null ? '' : fmtT(r.shortBy)]))}>⬇ SKU CSV</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setSelectedCustomer(null)}>× Close</Btn>
          </div>
        }>
          {selected.skuRows.length ? (
            <>
              <DataTable columns={skuCols} data={selected.skuRows} filters={skuBreakdownFilters} exportRef={skuBreakdownExportRef} excel maxHeight="60vh" totalsLabel="TOTAL" />
              {/* Ticket #129 — the stock shown here is the SERVICE AREA's, and ADR-0002 still holds
                  inside it: two distributors in the same area waiting on one size are both shown
                  covered by the same tonnage. The empty-area sentence below is not decoration —
                  without it a screen of dashes reads like a loading bug. */}
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                <strong>Free Stock</strong> = the stock of the plants that <strong>serve {selectedRegion}</strong>
                {areaPlants(selectedRegion).length ? ` (${areaPlants(selectedRegion).join(' + ')})` : ''} for this SKU (produced − invoiced) less the
                {' '}<strong>Confirmed</strong> tonnage of <strong>every</strong> distributor in that same area — what is promised to
                nobody yet. It is <strong>not reserved</strong> for {distributorCode(selected.customer)}, and goes
                {' '}<span className="text-red-600 dark:text-red-400">negative</span> when the size is committed beyond what is on the
                floor. Where <strong>All Distr. Pending</strong> exceeds it, the size is oversubscribed and this distributor may not
                be served even with no <strong>Short by</strong> shown. {selectedRegion} is set from this distributor’s ship-to state,
                and which plants serve it is set on the <strong>Masters</strong> tab.
              </p>
              {selectedRegion !== UNMAPPED_REGION && areaPlants(selectedRegion).length === 0 && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  <strong>No plant serves {selectedRegion} yet</strong>, so every Free Stock reads 0 and every
                  {' '}<strong>Short by</strong> is this distributor’s full pending. Those dashes are the real position, not a
                  loading error — they fill in by themselves the day a plant that serves {selectedRegion} produces.
                </p>
              )}
              {selectedRegion === UNMAPPED_REGION && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                  <strong>This distributor’s state carries no region</strong>, so we cannot tell which plants serve it and the
                  stock columns read “—” rather than 0 — unknown, not empty. Map the state in the <strong>Region</strong> column of
                  the table above and the figures appear.
                </p>
              )}
            </>
          ) : <p className="text-sm text-slate-400 py-8 text-center">No SKU rows for this distributor</p>}
        </Section>
      )}

      <SalesSizeGrid orders={orders} dispatches={dispatches} productions={productions} skus={skus} plants={plants}
        stateRegions={stateRegions} distributors={distributors} distributor={distributor} month={month} selectedPlant={selectedPlant} />

      <Section title="Month-wise Sales">
        {monthRows.length ? (
          <>
            <p className="mb-3 text-xs text-slate-400">
              Confirmed / Non-confirmed bucket by order month; Invoiced by invoice month. Total Orders = Invoiced + Confirmed + Non-confirmed. All weights in MT.
            </p>
            <DataTable columns={monthCols} data={monthRows} excel maxHeight="60vh" totalsLabel="TOTAL" />
          </>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No order / invoice data yet</p>}
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
const TABLE_LABELS = {
  coils: 'Coil Inward',
  baby_coils: 'Slitting',
  productions: 'Production',
  dispatches: 'Dispatches',
  skus: 'SKU Master',
  orders: 'Orders',
  plants: 'Plant Master',
  distributors: 'Distributor Master',
}

function SyncErrorBanner() {
  const [err, setErr] = useState(null)
  useEffect(() => {
    const handler = (e) => setErr(e.detail || null)
    window.addEventListener('jsw:syncError', handler)
    return () => window.removeEventListener('jsw:syncError', handler)
  }, [])
  if (!err) return null
  const tbl = TABLE_LABELS[err.tableName] || err.tableName
  const parts = [err.message, err.details, err.hint].filter(Boolean).join(' — ')
  return (
    <div className="bg-red-50 dark:bg-red-950 border-b border-red-200 dark:border-red-900 text-red-800 dark:text-red-200 text-sm">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-2 flex items-start gap-3">
        <span className="font-semibold whitespace-nowrap">Sync failed ({tbl}):</span>
        {/* `recovery`, when the write path supplies one, REPLACES the generic tail. A rebuild that
            was rolled back left the previous data in place, and a rebuild whose supersede failed
            saved the new rows and left duplicates — telling either operator their "changes will
            NOT persist" is false, and in opposite directions. Only an ordinary sync has no
            recovery line, and for that one the generic tail is the true thing to say. */}
        <span className="flex-1 break-words">
          {err.op} rejected for {err.rowCount} row{err.rowCount === 1 ? '' : 's'}. {parts}.{' '}
          {err.recovery || 'These changes will NOT persist on refresh.'}
        </span>
        <button
          onClick={() => setErr(null)}
          className="text-red-700 dark:text-red-300 hover:underline shrink-0"
          title="Dismiss"
        >Dismiss</button>
      </div>
    </div>
  )
}

// ── Reports — one-click formatted .xlsx stock reports (lazy-loads exceljs via ./lib/reports).
// Finished = on-hand pipes (produced − dispatched) by ROUND/SHS/RHS; Raw = unslit HR coils +
// free baby-coil strip. Buttons disable while generating; failures surface inline.
// The lazy import goes through loadChunk (lib/chunk.js): a tab left open across a deploy asks for a
// hashed chunk Vercel no longer serves ("Failed to fetch dynamically imported module"), so it
// reloads once instead of showing that to the operator. ──
function Reports({ skus, productions, dispatches, coils, babyCoils, orders, estimates = [], stateRegions = [], plants = [], distributors = [], selectedPlant = ALL_PLANTS,
  allProductions = productions, allDispatches = dispatches, allCoils = coils, allBabyCoils = babyCoils }) {
  const [busy, setBusy] = useState(null)   // 'finished' | 'raw' | 'dashboard' | 'snapshot' | null
  const [err, setErr] = useState(null)

  // ── Reports follow the header plant filter (ticket #121) ──────────────────────────────────────
  // These workbooks leave the building — they are mailed, broadcast on WhatsApp and read by people
  // who never saw the screen that produced them. So a scoped one must announce its scope in every
  // channel that travels with it, or somebody circulates Hyderabad's 761.441 MT as the company's
  // 2615.441 MT and nobody can tell by looking:
  //   · every sheet's title, via `companyName` (reaches all 7 title rows across the 3 workbooks)
  //   · the file name, via `fileSuffix` — the half that survives a rename or a download list
  //   · the on-screen banner below, which stops the mistake before the click
  //
  // NOTE (#117 phase 4): the eventual design is a company-wide total that KEEPS its headline figure
  // and gains a per-plant split beneath it, with Invoiced labelled Hyderabad-only. Finished Pipe
  // Stock now does its half of this — the company sheet plus one tab per plant, see `perPlantTabs`
  // below — but Raw Material Stock and the PB MTD Dashboard workbook are still whole-workbook-scoped.
  // Until the rest lands, scoping those two workbooks is the honest reading of "every shared view
  // follows the selector" — the alternative was a header saying NPMD above an export saying
  // everybody, which is the mis-attribution this spec exists to end.
  const plantScoped = selectedPlant !== ALL_PLANTS
  const plantScopeName = plantLabel(selectedPlant)
  const reportOpts = plantScoped
    ? { companyName: `JSW One Pipes & Tubes — ${plantScopeName} only`, fileSuffix: plantScopeName.toLowerCase().replace(/[^a-z0-9]+/g, '-') }
    : {}

  const run = async (which) => {
    setErr(null); setBusy(which)
    try {
      const R = await loadChunk(() => import('./lib/reports'))
      // `perPlantTabs` only when the header itself is unscoped — a run already scoped to one plant
      // (the header pinned to it, or a plant user's login) has nothing left to split: `productions`/
      // `dispatches` here already hold that one plant only, so a per-plant tab would just repeat the
      // company sheet. `plants` rides along as the LIVE master (Masters tab), same as everywhere
      // else a plant name is shown, so a renamed plant is renamed on its own tab too.
      if (which === 'finished') await R.generateFinishedStockReport(skus, productions, dispatches, { ...reportOpts, perPlantTabs: !plantScoped, plants })
      else if (which === 'raw') await R.generateRawMaterialReport(coils, babyCoils, productions, { ...reportOpts })
      // The Inventory Snapshot ignores the header (#213, a user decision): it reads the `all*` arrays
      // and takes no `reportOpts`, so it has no scope to stamp. The banner above says so.
      else if (which === 'snapshot') await R.generateInventorySnapshotReport(skus, allProductions, allDispatches, allCoils, allBabyCoils, { plants })
      // The same page as a PNG picture — same arrays, so it ignores the header exactly as the .html does.
      else if (which === 'snapshotPng') await R.generateInventorySnapshotPng(skus, allProductions, allDispatches, allCoils, allBabyCoils, { plants })
      // No Best Estimate field here any more — the plant BE is Σ the Sales tab's distributor
      // estimates for the report month (ADR-0001), so it can't drift from what the Sales tab shows.
      // The state → region master rides along for the same reason: the workbook's Region column and
      // the Sales tab's are one mapping, not two.
      // `coils`/`babyCoils` ride along so the workbook can print the raw-material position (#130).
      // They are ALREADY plant-scoped by the header selector, exactly as `productions` is, so a
      // scoped workbook's RM block covers the same plants as every other figure in the file.
      // Omitting them is not a smaller report, it is an unanswerable one: the sheet prints "?"
      // rather than a confident zero, because the builder cannot tell "no steel" from "not asked".
      else await R.generateMtdDashboardReport(orders, dispatches, productions, skus, { estimates, stateRegions, plants, distributors, coils, babyCoils, ...reportOpts })
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-6">
      {/* Loud on purpose. Every other scoped view is read on the screen that scoped it; a workbook
          is read somewhere else entirely, by someone who cannot see the header. */}
      {plantScoped && (
        <div className="px-3 py-2 rounded bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 text-sm">
          <strong>The Excel reports cover {plantScopeName} only.</strong> The header is filtered, so every
          workbook below excludes the other plants — this is <strong>not</strong> the company-wide report.
          Each sheet is titled “{plantScopeName} only” and the file name ends
          {' '}<span className="font-mono">-{reportOpts.fileSuffix}</span>. Switch to
          {' '}<strong>All Plants</strong> for the company report.
          {' '}<strong>The Inventory Snapshot still covers all plants</strong> — it ignores the header.
        </div>
      )}
      <Section title="PB MTD Dashboard (Excel)">
        <div className="flex flex-wrap items-end gap-3">
          <Btn variant="primary" disabled={busy === 'dashboard'} onClick={() => run('dashboard')}>
            {busy === 'dashboard' ? 'Generating…' : '⬇ PB MTD Dashboard (.xlsx)'}
          </Btn>
        </div>
        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p><span className="font-medium text-slate-600 dark:text-slate-300">PB MTD Dashboard</span> — the monthly order/invoice/inventory dashboard (as on today): headline KPIs, Order Status Summary, Order Pipeline — MTD, and Inventory &amp; Production, plus a second sheet of every SKU holding more than 2 MT with FIFO ageing. Numbers reconcile with the Sales &amp; Dashboard KPIs.</p>
          <p><span className="font-medium text-slate-600 dark:text-slate-300">Best Estimate</span> is no longer typed here — it is the sum of the per-distributor targets set on the <span className="font-medium">Sales</span> tab for this month. Set none and <span className="font-medium">% of BE</span> / <span className="font-medium">Daily Run Rate</span> show N/A.</p>
          <p><span className="font-medium text-slate-600 dark:text-slate-300">Distributor by Region</span> — a third sheet reading Plan, Total Orders and Invoiced MTD per distributor, in region blocks with a total per region and a grand total. Regions come from the state map on the <span className="font-medium">Sales</span> tab; a state nobody has mapped groups under <span className="font-medium">Unmapped</span> and still counts in the grand total.</p>
          {/* Sheet 4 repeats one service area's on-hand tonnage on every row in that area (nothing
              is reserved there), so it is totalled nowhere — say so here, not just on the sheet. */}
          <p><span className="font-medium text-slate-600 dark:text-slate-300">Distributor × SKU</span> — a fourth sheet: per distributor and size, what is pending, what was invoiced this month, and how much of that size is <span className="font-medium">free at each plant that serves that distributor</span> — what the plant holds, less its pro-rata share of what the whole service area has already confirmed. The plant cells add up to the <span className="font-medium">Free Inventory (area)</span> column beside them. The area figure is the same one the <span className="font-medium">Sales</span> tab drill-down calls Free Stock. <span className="font-medium">It is area-wide and unreserved</span> — it repeats on every distributor in the area waiting on that size, so the sheet carries no totals. Service areas are set on the <span className="font-medium">Masters</span> tab; a region no plant serves reads no stock, and a distributor whose state carries no region reads “?”.</p>
        </div>
      </Section>

      <Section title="Stock Reports (Excel)">
        <div className="flex flex-wrap gap-3">
          <Btn variant="success" disabled={busy === 'finished'} onClick={() => run('finished')}>
            {busy === 'finished' ? 'Generating…' : '⬇ Finished Pipe Stock (.xlsx)'}
          </Btn>
          <Btn variant="primary" disabled={busy === 'raw'} onClick={() => run('raw')}>
            {busy === 'raw' ? 'Generating…' : '⬇ Raw Material Stock (.xlsx)'}
          </Btn>
        </div>
        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p><span className="font-medium text-slate-600 dark:text-slate-300">Finished Pipe Stock</span> — on-hand pipes (produced − dispatched) grouped ROUND / SHS / RHS, with per-section and grand totals. On <span className="font-medium">All Plants</span> the workbook also gets one tab per plant (plus an Unattributed tab if any tonnage has no resolved plant) alongside the company-wide sheet; scoped to one plant, only that plant's sheet is produced.</p>
          <p><span className="font-medium text-slate-600 dark:text-slate-300">Raw Material Stock</span> — whole unslit HR coils plus free slit-coil strip, grouped by width × thickness.</p>
        </div>
      </Section>

      <Section title="Inventory Snapshot (Outlook)">
        <div className="flex flex-wrap items-end gap-3">
          <Btn variant="primary" disabled={busy === 'snapshot'} onClick={() => run('snapshot')}>
            {busy === 'snapshot' ? 'Generating…' : '⬇ Inventory Snapshot (.html)'}
          </Btn>
          <Btn variant="primary" disabled={busy === 'snapshotPng'} onClick={() => run('snapshotPng')}>
            {busy === 'snapshotPng' ? 'Generating…' : '⬇ Inventory Snapshot (.png)'}
          </Btn>
        </div>
        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p><span className="font-medium text-slate-600 dark:text-slate-300">Inventory Snapshot</span> — the plant-wise page for management, as on today: FG on hand, days cover, FG over 60 days, A-class out and Excess for each plant and all plants; finished goods by sales class; and the top 7 to replenish, slow production and slow movers. Open the file in Chrome or Edge, press Ctrl+A then Ctrl+C, and paste into an Outlook email; the tables, colours and logo come across. Or take the <span className="font-medium">.png</span> — the same page as one picture — and drag it into the email (or Insert → Pictures); a picture cannot reflow, so it reads the same in every inbox. <span className="font-medium">Always covers all plants</span>, whatever the header says. Figures follow <span className="font-mono">docs/inventory-dashboard-rules.md</span>.</p>
        </div>
      </Section>

      {err && <p className="text-sm text-red-600 dark:text-red-400">Report failed: {err}</p>}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PRODUCTION PLANNING (ticket #278, map #248) — admin-only (#275)
// ═══════════════════════════════════════════════════════════════
// Stage 1, the planning master: one row per region × size × thickness band, as the user posted it
// on #249. Every figure is built by `planningMasterView` (calc.js); this component only lays it out.
// Like Masters, it ignores the header plant selector: a region's plan spans that region's plants.
//
// Ticket #279: the admin keeps the master up to date ON SCREEN ONLY — there is no upload. A row is
// edited (Type, Buffer, Can-be-made-at ticks), added, or retired (hidden, not deleted, and brought
// back from "Show retired"). Every write goes through `planningRowSave` / `planningRowAdd`, which
// only ever store the plants that serve the row's region. The amber note is a flag, not a fix
// (#250): it says a plant has orders or production on a row it is not ticked for, and ticks nothing.
const PLANNING_TYPES = ['Buffer', 'MTO']
const emptyPlanningDraft = () => ({ size: '', thickness: '', type: 'MTO', buffer: '', plants: [] })

function PlanningTicks({ plants, ticked, onChange, label }) {
  return plants.map(p => (
    <td key={p.id} className="px-2 py-1 text-center">
      <input type="checkbox" className="accent-indigo-600" checked={ticked.includes(p.id)}
        aria-label={`${p.name} can make ${label}`}
        onChange={e => onChange(e.target.checked ? [...ticked.filter(x => x !== p.id), p.id] : ticked.filter(x => x !== p.id))} />
    </td>
  ))
}

function ProductionPlanning({ productions, dispatches, skus, plants, orders, stored, setStored, pick = null }) {
  const view = useMemo(() => planningMasterView({ productions, dispatches, skus, plants, orders, stored }),
    [productions, dispatches, skus, plants, orders, stored])
  // With a shared pick the tab's step bar holds the region; on its own the master keeps one.
  const [ownRegion, setOwnRegion] = useState(view.regions[0]?.region || '')
  const regionKey = pick ? pick.region : ownRegion
  const setRegionKey = pick ? pick.setRegion : setOwnRegion
  const [q, setQ] = useState('')
  const [editId, setEditId] = useState(null)
  const [draft, setDraft] = useState(null)
  const [adding, setAdding] = useState(false)
  const [addDraft, setAddDraft] = useState(emptyPlanningDraft)
  const [showRetired, setShowRetired] = useState(false)
  const [msg, setMsg] = useState(null)   // { ok, text }
  // A region picked on the bar closes an edit or an add that belonged to the other region.
  useEffect(() => { setEditId(null); setAdding(false); setMsg(null) }, [regionKey])
  const region = view.regions.find(r => r.region === regionKey) || view.regions[0]
  if (!region) return <p className="text-sm text-slate-500 dark:text-slate-400">The planning master has no rows.</p>

  const canEdit = !!setStored
  const needle = q.trim().toLowerCase().replace(/\s+/g, '')
  const shown = region.rows.filter(r => !needle || r.size.toLowerCase().includes(needle))
  const cols = 8 + region.plants.length
  const th = 'px-2 py-1.5 font-medium'
  const outsideLine = (o) => o.lines.map(l => `${l.label} ${fmtT(l.weight)}`).join(' · ')
  const rowLabel = (r) => `${r.region} ${r.size} ${r.thickness.toFixed(1)}`
  const small = 'px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'

  const pickRegion = (name) => { setRegionKey(name); setEditId(null); setAdding(false); setMsg(null) }
  const startEdit = (r) => {
    setEditId(r.id); setMsg(null)
    setDraft({ type: r.type, buffer: r.buffer == null ? '' : r.buffer, plants: region.plants.filter(p => r.canMake[p.id]).map(p => p.id) })
  }
  // Validate against what is on screen, then write through the store's functional update so a
  // second edit in flight cannot be lost. ONE id per click: the updater may run more than once
  // (React's StrictMode does, in development), and every run must produce the same stored row.
  const write = (fn, okText) => {
    const id = crypto.randomUUID()
    const opts = { plants, makeId: () => id }
    const res = fn(stored, opts)
    if (res.problem) { setMsg({ ok: false, text: res.problem }); return false }
    setStored(prev => fn(prev, opts).stored)
    setMsg({ ok: true, text: okText(res) })
    return true
  }
  const saveEdit = (r) => {
    if (write((s, o) => planningRowSave(s, r, draft, o), () => `Saved ${rowLabel(r)}.`)) { setEditId(null); setDraft(null) }
  }
  const setRetired = (r, retired) => write((s, o) => planningRowSave(s, r, { retired }, o),
    () => retired ? `Retired ${rowLabel(r)}.` : `Restored ${rowLabel(r)}.`)
  const saveAdd = () => {
    const ok = write((s, o) => planningRowAdd(s, { ...addDraft, region: region.region }, o),
      (res) => `${res.restored ? 'Brought back the retired row' : 'Added'} ${res.row.region} ${res.row.size} ${res.row.thickness.toFixed(1)}.`)
    if (ok) { setAddDraft(emptyPlanningDraft()); setAdding(false) }
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-4 space-y-3 text-xs text-slate-700 dark:text-slate-200">
      <div className="flex flex-wrap items-center gap-3">
        {!pick && <>
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Planning master</h3>
        <div role="group" aria-label="Region" className="inline-flex rounded border border-slate-300 dark:border-slate-600 overflow-hidden">
          {view.regions.map(r => (
            <button key={r.region} type="button" aria-pressed={r.region === region.region} onClick={() => pickRegion(r.region)}
              className={`px-3 py-1 ${r.region === region.region ? 'bg-slate-800 text-white dark:bg-slate-200 dark:text-slate-900' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              {r.region}
            </button>
          ))}
        </div>
        </>}
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find size, e.g. 50x50" aria-label="Find size"
          className="w-40 px-2 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
        {canEdit && <Btn size="sm" variant={adding ? 'ghost' : 'primary'} onClick={() => { setAdding(a => !a); setMsg(null) }}>{adding ? 'Close' : `Add a ${region.region} row`}</Btn>}
        {region.retired.length > 0 && (
          <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
            <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} /> Show retired ({region.retired.length})
          </label>
        )}
      </div>

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-slate-500 dark:text-slate-400">
        <span>Rows <b className="text-slate-900 dark:text-white">{region.rows.length}</b></span>
        <span>Buffer <b className="text-slate-900 dark:text-white">{region.bufferRows}</b></span>
        <span>MTO <b className="text-slate-900 dark:text-white">{region.mtoRows}</b></span>
        <span>Buffer total <b className="text-slate-900 dark:text-white tabular-nums">{region.bufferTotal.toLocaleString('en-IN')}</b> MT</span>
        <span>Stock now <b className="text-slate-900 dark:text-white tabular-nums">{fmtT(region.stockTotal)}</b> T</span>
      </p>

      {msg && (
        <p role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>{msg.text}</p>
      )}

      {adding && canEdit && (
        <div className="flex flex-wrap items-end gap-3 p-3 rounded border border-indigo-200 dark:border-indigo-800 bg-indigo-50/50 dark:bg-indigo-900/20">
          <label className="flex flex-col gap-0.5">Size
            <input value={addDraft.size} onChange={e => setAddDraft(d => ({ ...d, size: e.target.value }))} placeholder="132x132 or 40NB" aria-label="New row size" className={`${small} w-28`} />
          </label>
          <label className="flex flex-col gap-0.5">Thk (mm)
            <input type="number" step="0.1" value={addDraft.thickness} onChange={e => setAddDraft(d => ({ ...d, thickness: e.target.value }))} aria-label="New row thickness" className={`${small} w-20`} />
          </label>
          <label className="flex flex-col gap-0.5">Type
            <select value={addDraft.type} onChange={e => setAddDraft(d => ({ ...d, type: e.target.value }))} aria-label="New row type" className={small}>
              {PLANNING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-0.5">Buffer (MT)
            <input type="number" min="0" value={addDraft.type === 'Buffer' ? addDraft.buffer : ''} disabled={addDraft.type !== 'Buffer'}
              onChange={e => setAddDraft(d => ({ ...d, buffer: e.target.value }))} aria-label="New row buffer" className={`${small} w-20 disabled:opacity-50`} />
          </label>
          <span className="flex flex-col gap-0.5">Can be made at
            <span className="flex gap-3">
              {region.plants.map(p => (
                <label key={p.id} className="flex items-center gap-1">
                  <input type="checkbox" className="accent-indigo-600" checked={addDraft.plants.includes(p.id)}
                    onChange={e => setAddDraft(d => ({ ...d, plants: e.target.checked ? [...d.plants, p.id] : d.plants.filter(x => x !== p.id) }))} />
                  {p.name}
                </label>
              ))}
            </span>
          </span>
          <Btn size="sm" variant="success" onClick={saveAdd}>Add row</Btn>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-200 dark:border-slate-700 rounded">
        <table className="text-xs">
          <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
            <tr>
              <th rowSpan={2} className={`${th} text-left align-bottom`}>Section</th>
              <th rowSpan={2} className={`${th} text-left align-bottom`}>Size</th>
              <th rowSpan={2} className={`${th} text-right align-bottom`}>Thk (mm)</th>
              <th rowSpan={2} className={`${th} text-left align-bottom`}>Type</th>
              <th rowSpan={2} className={`${th} text-right align-bottom`}>Buffer (MT)</th>
              <th colSpan={region.plants.length} className={`${th} text-center border-b border-slate-200 dark:border-slate-600`}>Can be made at</th>
              <th rowSpan={2} className={`${th} text-left align-bottom`}>Stock now (T)</th>
              <th rowSpan={2} className={`${th} text-left align-bottom`}>Check</th>
              <th rowSpan={2} className={`${th} align-bottom`}><span className="sr-only">Actions</span></th>
            </tr>
            <tr>{region.plants.map(p => <th key={p.id} className={`${th} text-center`} title={p.name}>{p.short}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            {PLANNING_SECTIONS.map(sec => {
              const rows = shown.filter(r => r.section === sec)
              return rows.map((r, i) => {
                const firstOfSize = i === 0 || rows[i - 1].size !== r.size
                const editing = editId === r.id
                const noPlant = !region.plants.some(p => r.canMake[p.id])
                return (
                  <tr key={r.id} className={`${firstOfSize && i > 0 ? 'border-t border-slate-300 dark:border-slate-600' : ''} ${editing ? 'bg-indigo-50/60 dark:bg-indigo-900/20' : ''}`}>
                    <td className="px-2 py-1 font-medium text-slate-900 dark:text-white">{i === 0 ? sec : ''}</td>
                    <td className="px-2 py-1 whitespace-nowrap">{firstOfSize ? r.size : ''}{r.added && <span className="ml-1 text-[10px] text-indigo-600 dark:text-indigo-400" title="Added on screen">new</span>}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.thickness.toFixed(1)}</td>
                    {editing ? (
                      <>
                        <td className="px-2 py-1">
                          <select value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))} aria-label={`Type of ${rowLabel(r)}`} className={small}>
                            {PLANNING_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-1 text-right">
                          <input type="number" min="0" value={draft.type === 'Buffer' ? draft.buffer : ''} disabled={draft.type !== 'Buffer'}
                            onChange={e => setDraft(d => ({ ...d, buffer: e.target.value }))} aria-label={`Buffer of ${rowLabel(r)}`} className={`${small} w-16 text-right disabled:opacity-50`} />
                        </td>
                        <PlanningTicks plants={region.plants} ticked={draft.plants} label={rowLabel(r)} onChange={v => setDraft(d => ({ ...d, plants: v }))} />
                      </>
                    ) : (
                      <>
                        <td className="px-2 py-1">{r.type}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{r.buffer == null ? '' : r.buffer}</td>
                        {region.plants.map(p => (
                          <td key={p.id} className="px-2 py-1 text-center" aria-label={`${p.name} ${r.canMake[p.id] ? 'can' : 'cannot'} make ${r.size} ${r.thickness.toFixed(1)}`}>
                            {r.canMake[p.id] ? '✓' : ''}
                          </td>
                        ))}
                      </>
                    )}
                    <td className="px-2 py-1 whitespace-nowrap tabular-nums">{planningStockLabel(r.stock, region.plants)}</td>
                    <td className="px-2 py-1">
                      {/* A flag for the admin to tick or leave — text only, so clicking it changes nothing (#250). */}
                      {r.notes.map(n => (
                        <span key={n.plant} role="note" className="block whitespace-nowrap text-amber-700 dark:text-amber-400">{n.text}</span>
                      ))}
                      {noPlant && <span className="block whitespace-nowrap text-red-600 dark:text-red-400">No plant can make</span>}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-right">
                      {canEdit && (editing ? (
                        <span className="inline-flex gap-1">
                          <Btn size="sm" variant="success" onClick={() => saveEdit(r)}>Save</Btn>
                          <Btn size="sm" variant="ghost" onClick={() => { setEditId(null); setDraft(null); setMsg(null) }}>Cancel</Btn>
                        </span>
                      ) : (
                        <span className="inline-flex gap-1">
                          <button type="button" onClick={() => startEdit(r)} aria-label={`Edit ${rowLabel(r)}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">Edit</button>
                          <button type="button" onClick={() => setRetired(r, true)} aria-label={`Retire ${rowLabel(r)}`} className="text-slate-500 dark:text-slate-400 hover:underline">Retire</button>
                        </span>
                      ))}
                    </td>
                  </tr>
                )
              })
            })}
            {!shown.length && <tr><td colSpan={cols} className="px-2 py-3 text-center text-slate-400 dark:text-slate-500">No size matches “{q}”.</td></tr>}
          </tbody>
        </table>
      </div>

      {showRetired && region.retired.length > 0 && (
        <div className="space-y-1">
          <p className="font-medium text-slate-700 dark:text-slate-200">Retired · {region.region} · {region.retired.length}</p>
          <ul className="space-y-0.5">
            {region.retired.map(r => (
              <li key={r.id} className="flex items-center gap-3 text-slate-500 dark:text-slate-400">
                <span>{r.section} {r.size} {r.thickness.toFixed(1)} · {r.type}{r.buffer != null ? ` ${r.buffer} MT` : ''}</span>
                {canEdit && <button type="button" onClick={() => setRetired(r, false)} aria-label={`Restore ${rowLabel(r)}`} className="text-indigo-600 dark:text-indigo-400 hover:underline">Restore</button>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-1">
        <FactStrip label="Stock outside the plan" items={[
          ['FG all plants', `${fmtT(view.totals.fg)} T`],
          ['On master rows', `${fmtT(view.totals.inRows)} T`],
          [`Outside plan · ${region.region}`, `${fmtT(region.outside.total)} T`, outsideLine(region.outside) || undefined],
          view.noRegion.total > EPS_MT && ['At no region plant', `${fmtT(view.noRegion.total)} T`, outsideLine(view.noRegion)],
        ]} />
        <KeyPoints points={[
          'Stock now = FG on hand today',
          '2.0 band = 1.8 · 2.0 · 2.2 mm',
          '3.0 band = 2.8 · 2.9 · 3.0 · 3.2 mm',
          'Other thickness → nearest band, tie heavier',
          <><span className="text-amber-700 dark:text-amber-400">Amber</span> = orders / production, plant not ticked</>,
          'Ticks are the rule · tick via Edit',
          'Hover Outside plan for the sizes',
        ]} />
      </div>
    </div>
  )
}

// One typed MT figure on the A2 sheet (#281): Indent or Planned. Keeps keystrokes local and commits
// on blur / Enter, so a per-character write never reaches Supabase; Escape reverts. `onCommit(text)`
// returns false when the figure is refused, and the box goes back to the stored value. `placeholder`
// is what shows faintly when nothing is typed — Planned's suggestion. `bare` (#302, the monthly
// sheet): no visible border until hovered or focused; `strong`: a typed figure in bold black, so a
// typed Planned reads apart from the grey suggestion.
function PlanningTonnesCell({ value, placeholder = '', label, title, onCommit, bare = false, strong = false }) {
  const shown = value == null ? '' : String(value)
  const [draft, setDraft] = useState(shown)
  const [focused, setFocused] = useState(false)
  const cancel = useRef(false)
  // Follow the stored value when it changes underneath (month or region switch, "use N", another
  // tab's sync) — but never mid-edit, which would eat what is being typed.
  useEffect(() => { if (!focused) setDraft(shown) }, [shown, focused])
  const commit = () => {
    setFocused(false)
    if (cancel.current) { cancel.current = false; setDraft(shown); return }
    const t = draft.trim()
    if (t === shown) return
    if (!onCommit(t)) setDraft(shown)
  }
  return (
    <input type="text" inputMode="decimal" value={draft} placeholder={placeholder} aria-label={label} title={title}
      onFocus={() => setFocused(true)} onChange={e => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur()
        else if (e.key === 'Escape') { cancel.current = true; e.currentTarget.blur() }
      }}
      className={bare
        ? `w-14 h-6 px-1.5 text-right tabular-nums rounded border border-transparent bg-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-indigo-500 focus:bg-white dark:focus:bg-slate-900 placeholder:text-slate-500 dark:placeholder:text-slate-400 placeholder:font-normal focus:outline-none focus:ring-2 focus:ring-indigo-500 ${strong ? 'font-semibold text-slate-900 dark:text-white' : 'text-slate-900 dark:text-white'}`
        : 'w-12 h-[18px] px-1 text-right tabular-nums rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500'} />
  )
}

// "12 Nov, 10:30" for a logged change's ISO time — the monthly change log and the week moves.
const stamp = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
}

// "November" for '2026-11' — the Finalise button names the month in full.
const planningMonthName = (key) => new Date(`${key}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })

// The reason a change to a finalised month needs (#283). Save stays off until a reason is typed;
// Enter saves, Escape cancels. Nothing is written until Save.
function PlanningReasonDialog({ name, what, initial = '', onSave, onCancel }) {
  const [text, setText] = useState(initial)
  const box = useRef(null)
  useEffect(() => { box.current?.focus(); box.current?.select() }, [])
  const ok = text.trim().length > 0
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4" onClick={onCancel}>
      <div role="dialog" aria-modal="true" aria-label="Reason for the change" onClick={e => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg p-3 space-y-2 text-xs text-slate-700 dark:text-slate-200">
        <p className="font-semibold text-slate-900 dark:text-white">{name}: {what}</p>
        <p className="text-slate-500 dark:text-slate-400">Finalised month · logged with name, time, reason · Baseline unchanged</p>
        <label className="block">Reason (required)
          <input ref={box} type="text" value={text} onChange={e => setText(e.target.value)} aria-label="Reason"
            onKeyDown={e => { if (e.key === 'Enter' && ok) onSave(text); else if (e.key === 'Escape') onCancel() }}
            className="mt-0.5 w-full px-1.5 py-1 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900" />
        </label>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700">Cancel</button>
          <button type="button" disabled={!ok} onClick={() => onSave(text)}
            className="px-2 py-0.5 rounded bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed">Save change</button>
        </div>
      </div>
    </div>
  )
}

// The Plant cell of one A2 row (#282). Everything it shows is the view's (`planningCampaignView`):
// it lays out `assign` and writes one change through `write`. Only `r.plantOptions` — the row's
// ticked plants, the region's own — are ever offered.
function PlanningPlantCell({ r, name, canEdit, write }) {
  const dots = r.dots.map(d => (
    <span key={d.plant} title={d.title} aria-label={d.title} role="img"
      className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500 align-middle" />
  ))
  const shortOf = (id) => r.plantOptions.find(p => p.id === id)?.short || id
  let body
  if (r.assign === 'none') {
    body = <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
      <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-red-600" />No plant can make
    </span>
  }
  else if (r.assign === 'auto') body = <span title="The only ticked plant">{r.plantOptions[0].name}</span>
  else if (!canEdit) {
    body = r.assign === 'split'
      ? <span>{r.splitOk ? '' : <span aria-hidden="true" className="inline-block w-1.5 h-1.5 mr-1 rounded-full bg-red-600 align-middle" />}{r.plantOptions.map(p => `${p.short} ${r.split[p.id] ?? 0}`).join(' · ')}</span>
      : r.plant ? <span>{r.plantOptions.find(p => p.id === r.plant)?.name}</span>
        : <span className="text-slate-400 dark:text-slate-500">–</span>
  } else {
    body = (
      <>
        <select value={r.assign === 'split' ? 'split' : (r.plant || '')} aria-label={`Plant ${name}`}
          title={r.assign === 'carried' ? 'From last month’s campaign' : undefined}
          onChange={e => write(e.target.value === 'split' ? { split: true } : { plant: e.target.value })}
          className={`h-6 px-1 text-xs rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 ${r.needsPlant
            ? 'border border-dashed border-indigo-400 dark:border-indigo-500 text-indigo-700 dark:text-indigo-300 bg-white dark:bg-slate-800'
            : 'border border-transparent hover:border-slate-300 dark:hover:border-slate-600 bg-transparent text-slate-700 dark:text-slate-200'}`}>
          <option value="">Choose plant</option>
          {r.plantOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          <option value="split">Split…</option>
        </select>
        {r.assign === 'split' && r.plantOptions.map(p => (
          <span key={p.id} className="inline-flex items-center gap-0.5">
            <span className="text-slate-500 dark:text-slate-400">{shortOf(p.id)}</span>
            <PlanningTonnesCell value={r.split[p.id]} label={`Split ${name} ${p.name}`}
              onCommit={t => write({ part: { plant: p.id, tonnes: t } })} />
          </span>
        ))}
        {r.assign === 'split' && (
          <span className={`inline-flex items-center gap-1 ${r.splitOk ? 'text-slate-500 dark:text-slate-400' : 'text-slate-700 dark:text-slate-200'}`}>
            {!r.splitOk && <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-red-600" />}
            {r.splitOk ? `= ${r.planned}` : `${r.splitTotal} of ${r.planned} — does not add up`}
          </span>
        )}
      </>
    )
  }
  return <span className="inline-flex items-center gap-1">{body}{dots}</span>
}

// ── Monthly campaign, clean sheet (#302) over layout A2 (tickets #280, #281, #282) ──
// #302 (layout only): headline + Finalise, a four-number summary strip, filter chips, and each size
// a collapsible group row with its subtotals (`region.groups`); `planningCampaignShown` picks the
// rows a chip / search / quiet toggle shows. No bars, no row fills: red only as a small dot.
//
// One light, compact sheet per region and plan month: Size · Thk · Buffer · Open · <last month> ·
// <three months> · Indent · Planned. Every figure is built by `planningCampaignView` (calc.js); this
// component lays it out and computes nothing. The per-plant split of each figure shows on hover
// (the cell's title). The admin types the Monthly Indent and may type over Planned, which otherwise
// shows the suggestion faintly; both save to `planning_campaigns`, one row per region per month.
// Plant (#282): one-plant rows fill in, two-plant rows pick a plant or Split…, no-plant rows are red.
// The Region and Plan month the planning screens share (Monthly campaign, Week plan, Monitoring):
// ProductionPlanningTab holds them, so switching screens keeps South · November on every one. A
// screen rendered on its own (no `pick`) keeps its own; a blank region reads as the first region.
function usePlanningPick(pick, todayStr) {
  const [ownMonth, setOwnMonth] = useState(todayStr.slice(0, 7))
  const [ownRegion, setOwnRegion] = useState('')
  return pick ? [pick.month, pick.setMonth, pick.region, pick.setRegion] : [ownMonth, setOwnMonth, ownRegion, setOwnRegion]
}

function PlanningCampaign({ productions, dispatches, skus, plants, stored, campaigns = [], setCampaigns = null, who = '', tabs = null, onOpenMaster = null, pick = null }) {
  const todayStr = today()
  const months = useMemo(() => planningCampaignMonths(todayStr,
    [...productions.map(p => p.dateOfProduction), ...dispatches.map(d => d.dateOfDispatch)]), [todayStr, productions, dispatches])
  const [month, setMonth, regionKey, setRegionKey] = usePlanningPick(pick, todayStr)
  const view = useMemo(() => pick?.view || planningCampaignView({ productions, dispatches, skus, plants, stored, campaigns, month, today: todayStr }),
    [pick?.view, productions, dispatches, skus, plants, stored, campaigns, month, todayStr])
  const [q, setQ] = useState('')
  const [showQuiet, setShowQuiet] = useState(false)
  // #302: a filter chip ('all' · 'needPlant' · 'noPlant' · 'hasStock') and the collapsed size groups.
  const [filter, setFilter] = useState('all')
  const [collapsed, setCollapsed] = useState(() => new Set())
  const [problem, setProblem] = useState(null)
  // #283: a change to a finalised month waits here for its reason; `reasons` remembers the last
  // reason given per row this session, so a split's two parts do not need it typed twice.
  const [pending, setPending] = useState(null)
  const [reasons, setReasons] = useState({})
  const [confirming, setConfirming] = useState(false)
  const [jump, setJump] = useState(null)
  // The bar's Region / Plan month change outside this screen: clear a half-made change with them.
  useEffect(() => { setProblem(null); setPending(null); setConfirming(false) }, [regionKey, month])
  // The Finalise button, while blocked, jumps to the first row that needs a plant: scroll it into
  // view and put the cursor in its Plant cell.
  useEffect(() => {
    if (!jump) return
    const tr = document.querySelector(`tr[data-row-key="${CSS.escape(jump)}"]`)
    if (tr) {
      tr.scrollIntoView({ block: 'center' })
      tr.querySelector('td:last-child select, td:last-child input')?.focus()
    }
    setJump(null)
  }, [jump])
  const region = view.regions.find(r => r.region === regionKey) || view.regions[0]
  // With a shared pick the tab's step bar carries Region and Plan month: the campaign draws none.
  const header = (controls) => pick ? null : (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 border-b border-slate-200 dark:border-slate-700">
      {tabs}
      {controls && <div className="flex flex-wrap items-center gap-3 pb-1.5">{controls}</div>}
    </div>
  )
  if (!region) return <div className="space-y-3">{header(null)}<p className="text-sm text-slate-500 dark:text-slate-400">The planning master has no rows.</p></div>

  const m = view.month
  const canEdit = !!setCampaigns
  const rowName = (r) => `${region.region} ${r.size} ${r.thickness.toFixed(1)}`
  // Validate against what is on screen, then write through the store's functional update so a
  // second edit in flight cannot be lost. ONE id per change: the updater may run more than once
  // (React's StrictMode does), and every run must produce the same campaign row. `row` is the row
  // as shown — its Buffer and Open; the save works the suggestion out itself.
  // Once the month is finalised (#283) a change to Planned or Plant needs a reason: the save refuses
  // it, the screen asks (the box shows the stored figure meanwhile), and the save runs again with it.
  const fin = region.finalise
  const write = (r, change, reason = '') => {
    const id = crypto.randomUUID()
    const changeId = crypto.randomUUID()
    const at = new Date().toISOString()
    const where = { region: region.region, month: m.key, rowKey: r.id }
    const opts = { row: r, plants, makeId: () => id, changeId: () => changeId, reason, by: who, at }
    const res = planningCampaignSave(campaigns, where, change, opts)
    if (res.problem === PLANNING_REASON_PROBLEM && !reason) {
      // What would be logged, for the dialog to show: the save with a stand-in reason.
      const before = planningCampaignSave(campaigns, where, change, { ...opts, reason: '…' })
      const was = (campaigns.find(c => !c.deleted && c.region === region.region && c.month === m.key)?.changes || []).length
      const entries = (before.stored.find(c => !c.deleted && c.region === region.region && c.month === m.key)?.changes || []).slice(was)
      const say = (c, v) => (c.field === 'planned' ? `${v}` : planningAssignLabel(v, region.plants))
      setPending({ r, change, what: entries.map(c => `${c.field === 'planned' ? 'Planned' : 'Plant'} ${say(c, c.from)} → ${say(c, c.to)}`).join(' · ') })
      setProblem(null)
      return false
    }
    if (res.problem) { setProblem(`${rowName(r)}: ${res.problem}`); return false }
    setCampaigns(prev => planningCampaignSave(prev, where, change, opts).stored)
    setProblem(null)
    return true
  }
  const saveWithReason = (reason) => {
    if (!pending || !reason.trim()) return
    if (write(pending.r, pending.change, reason.trim())) {
      setReasons(prev => ({ ...prev, [pending.r.id]: reason.trim() }))
      setPending(null)
    }
  }
  const finalise = () => {
    const id = crypto.randomUUID()
    const at = new Date().toISOString()
    const where = { region: region.region, month: m.key }
    const opts = { rows: region.rows, by: who, at, makeId: () => id }
    const res = planningCampaignFinalise(campaigns, where, opts)
    setConfirming(false)
    if (res.problem) { setProblem(res.problem); return }
    setCampaigns(prev => planningCampaignFinalise(prev, where, opts).stored)
    setProblem(null)
  }
  // The first blocker may sit behind a search, a chip or a collapsed size: clear all three first.
  const goToFirstBlocker = () => {
    setQ('')
    setFilter('all')
    setCollapsed(new Set())
    setJump(fin.first)
  }
  const reset = () => { setProblem(null); setPending(null); setConfirming(false) }
  const shown = planningCampaignShown(region, { filter, q, showQuiet })
  const cols = fin.finalised ? 10 : 9
  const toggle = (key) => setCollapsed(prev => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next })
  const th = 'px-2 h-8 font-semibold text-[11px] whitespace-nowrap'
  const td = 'px-2 h-7 whitespace-nowrap'
  const num = `${td} text-right tabular-nums`
  const typedRule = 'border-l border-slate-200 dark:border-slate-700'  // the rule before Indent: what is typed
  const sizeCell = `${td} sticky left-0 z-[1] bg-white dark:bg-slate-800`
  const BAND_NOTE = { 2: 'Also counts 1.8 and 2.2 mm', 3: 'Also counts 2.8, 2.9 and 3.2 mm' }
  // A plant whose invoices start inside a window: once when both windows say the same, else per window.
  const notes = region.starts.flatMap(st => st.last && st.last === st.three ? [`${st.name} ${st.last}`]
    : [st.last && `${m.last.label}: ${st.name} ${st.last}`, st.three && `${m.three.label}: ${st.name} ${st.three}`].filter(Boolean))
  const sm = region.summary
  const rows = (n, one, many) => `${n} ${n === 1 ? one : many}`
  const dot = <span aria-hidden="true" className="inline-block w-1.5 h-1.5 rounded-full bg-red-600 align-middle" />
  const link = 'text-indigo-700 dark:text-indigo-300 underline decoration-dotted underline-offset-2 hover:text-indigo-900 dark:hover:text-indigo-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 rounded'
  const ring = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'

  return (
    <div className="space-y-3 text-xs text-slate-700 dark:text-slate-200">
      {header(
        <>
          <div role="group" aria-label="Region" className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden">
            {view.regions.map(r => (
              <button key={r.region} type="button" aria-pressed={r.region === region.region} onClick={() => { setRegionKey(r.region); reset() }}
                className={`px-3 py-1 ${ring} ${r.region === region.region ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
                {r.region}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">Plan month
            <select value={m.key} onChange={e => { setMonth(e.target.value); reset() }} aria-label="Plan month"
              className="px-1.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
              {months.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
          </label>
        </>,
      )}

      <section aria-label="Campaign summary" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">{planningMonthName(m.key)} {m.key.slice(0, 4)} · {region.region}</h3>
            {fin.finalised ? (
              <span role="status" aria-label="Finalised" className="px-1.5 py-0.5 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                title="Still editable: every change to Planned or Plant is logged with a reason. There is no Un-finalise.">
                Finalised {stamp(fin.at)}{fin.by ? ` by ${fin.by}` : ''}
              </span>
            ) : null}
          </div>
          {!fin.finalised && canEdit && (
            confirming ? (
              <span className="inline-flex flex-wrap items-center gap-2">
                <span className="text-slate-600 dark:text-slate-300">Finalise {planningMonthName(m.key)} — {region.region}? It cannot be undone.</span>
                <button type="button" onClick={finalise} className={`px-3 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 ${ring}`}>Yes, finalise</button>
                <button type="button" onClick={() => setConfirming(false)} className={`px-3 py-1 rounded-md border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 ${ring}`}>Cancel</button>
              </span>
            ) : (
              <span className="inline-flex flex-wrap items-center gap-2">
                {fin.blockers.length > 0 && <span className="text-slate-500 dark:text-slate-400">Not yet: {fin.reason}</span>}
                <button type="button" onClick={() => (fin.blockers.length ? goToFirstBlocker() : setConfirming(true))}
                  title={fin.blockers.length ? `Not yet: ${fin.reason}. Click to go to the first row.` : 'Keep these figures as the Baseline. The plan stays editable; every change is logged.'}
                  className={`px-3 py-1 rounded-md ${ring} ${fin.blockers.length ? 'border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                  Finalise {planningMonthName(m.key)} — {region.region}
                </button>
              </span>
            )
          )}
        </div>

        <dl className="grid grid-cols-2 lg:grid-cols-4 gap-y-3 lg:divide-x divide-slate-200 dark:divide-slate-700 tabular-nums">
          <div className="pr-4">
            <dt className="text-slate-500 dark:text-slate-400">Planned production</dt>
            <dd className="text-lg font-semibold text-slate-900 dark:text-white">{fmtT(sm.planned)} T</dd>
            <dd className="text-[11px] text-slate-500 dark:text-slate-400">{rows(region.counts.typed, 'row', 'rows')} typed over</dd>
          </div>
          <div className="lg:px-4">
            <dt className="text-slate-500 dark:text-slate-400">Assigned to a plant</dt>
            <dd className="text-lg font-semibold text-slate-900 dark:text-white">{fmtT(sm.assigned)} T</dd>
            <dd className="text-[11px] text-slate-500 dark:text-slate-400">{region.plants.map(p => `${p.name} ${fmtT(sm.byPlant[p.id])} T`).join(' · ')}</dd>
            {sm.splitOff > 0 && <dd className="text-[11px] text-slate-700 dark:text-slate-200">{dot} {sm.splitOff} {sm.splitOff === 1 ? 'split does' : 'splits do'} not add up to Planned</dd>}
          </div>
          <div className="pr-4 lg:px-4">
            <dt className="text-slate-500 dark:text-slate-400">Needs a plant</dt>
            <dd className="text-lg font-semibold text-slate-900 dark:text-white">{fmtT(sm.needPlantT)} T</dd>
            <dd className="text-[11px] text-slate-500 dark:text-slate-400">
              {sm.needPlant > 0
                ? <button type="button" onClick={() => setFilter('needPlant')} className={link}>{rows(sm.needPlant, 'row', 'rows')} — show only these</button>
                : 'No rows'}
            </dd>
          </div>
          <div className="lg:pl-4">
            <dt className="text-slate-500 dark:text-slate-400">No plant can make</dt>
            <dd className="text-lg font-semibold text-slate-900 dark:text-white">{region.counts.noPlant > 0 && <>{dot} </>}{fmtT(sm.noPlant)} T</dd>
            <dd className="text-[11px] text-slate-500 dark:text-slate-400">
              {onOpenMaster && region.counts.noPlant > 0
                ? <button type="button" onClick={onOpenMaster} className={link}>{rows(region.counts.noPlant, 'row', 'rows')} — fix in master</button>
                : `${rows(region.counts.noPlant, 'row', 'rows')}${region.counts.noPlant > 0 ? ' — fix in master' : ''}`}
            </dd>
          </div>
        </dl>
      </section>

      {problem && <p role="alert" className="text-red-700 dark:text-red-400">{problem}</p>}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div role="group" aria-label="Row filter" className="flex flex-wrap gap-1.5">
          {PLANNING_CAMPAIGN_FILTERS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}
              className={`px-2.5 py-1 rounded-full border ${ring} ${filter === key
                ? 'border-indigo-600 bg-indigo-600 text-white'
                : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              {label} <span className={`tabular-nums ${filter === key ? 'text-indigo-100' : 'text-slate-500 dark:text-slate-400'}`}>{shown.counts[key]}</span>
            </button>
          ))}
        </div>
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Find size, e.g. 50x50" aria-label="Find size"
          className="w-40 px-2 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
        <label className={`flex items-center gap-1.5 ${filter === 'all' ? 'text-slate-600 dark:text-slate-300' : 'text-slate-400 dark:text-slate-500'}`}
          title={filter === 'all' ? undefined : 'A chip shows every row it names, quiet or not'}>
          <input type="checkbox" checked={showQuiet} disabled={filter !== 'all'} onChange={e => setShowQuiet(e.target.checked)} /> Show quiet rows
        </label>
        <span className="ml-auto flex gap-3">
          <button type="button" onClick={() => setCollapsed(new Set(region.groups.map(g => g.key)))} className={link}>Collapse all</button>
          <button type="button" onClick={() => setCollapsed(new Set())} className={link}>Expand all</button>
        </span>
      </div>

      <div className="overflow-x-auto max-w-full border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800">
        <table className="w-full min-w-[56rem] border-collapse tabular-nums">
          <thead className="bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
            <tr className="border-b border-slate-200 dark:border-slate-600">
              <th className={`${th} text-left sticky left-0 z-[2] bg-slate-100 dark:bg-slate-700`}>Size</th>
              <th className={`${th} text-right`}>Thk</th>
              <th className={`${th} text-right`} title="Buffer, MT — or MTO, made to order">Buffer</th>
              <th className={`${th} text-right`} title={`Finished stock on hand on ${m.openLabel}, T, the region's plants — not netted against orders`}>Open</th>
              <th className={`${th} text-right`} title={`Invoiced in ${m.last.label}, T, by the shipping plant`}>{m.last.label}</th>
              <th className={`${th} text-right`} title={`Invoiced ${m.three.label}, T, by the shipping plant`}>{m.three.label}</th>
              <th className={`${th} text-right ${typedRule}`} title="Monthly Indent, MT — typed by hand, never taken from the order book">Indent</th>
              <th className={`${th} text-left`} title="Planned production, MT. Grey = the suggestion; type over it to keep your own figure (black)">Planned</th>
              {fin.finalised && <th className={`${th} text-right`} title={`Planned when ${region.region} was finalised — kept unchanged`}>Baseline</th>}
              <th className={`${th} text-left`} title="The plant that makes this row's Planned — only the row's ticked plants are offered">Plant</th>
            </tr>
          </thead>
          <tbody>
            {PLANNING_SECTIONS.map(sec => {
              const groups = shown.groups.filter(g => g.section === sec)
              if (!groups.length) return null
              return [
                <tr key={sec} className="border-t border-slate-200 dark:border-slate-700">
                  <td colSpan={cols} className={`${td} h-6 sticky left-0 text-[10px] font-semibold tracking-wider text-slate-500 dark:text-slate-400`}>{sec}</td>
                </tr>,
                ...groups.flatMap(g => {
                  const open = !collapsed.has(g.key)
                  const groupRow = (
                    <tr key={g.key} aria-label={`${region.region} ${g.size}`} data-group={g.key} className="border-t border-slate-200 dark:border-slate-700 font-medium text-slate-900 dark:text-white">
                      <td className={sizeCell}>
                        <button type="button" aria-expanded={open} aria-label={`${g.size}, ${g.rowKeys.length} thicknesses`} onClick={() => toggle(g.key)}
                          className={`inline-flex items-center gap-1 font-semibold ${ring} rounded`}>
                          <span aria-hidden="true" className="text-slate-400 dark:text-slate-500 w-2">{open ? '▾' : '▸'}</span>{g.size}
                        </button>
                      </td>
                      <td className={td} />
                      <td className={td} />
                      <td className={num}>{planningCell(g.open)}</td>
                      <td className={num}>{planningCell(g.last)}</td>
                      <td className={num}>{planningCell(g.three)}</td>
                      <td className={`${td} ${typedRule}`} />
                      <td className={`${num} !text-left pl-3`}>{g.planned > 0 ? g.planned : '–'}</td>
                      {fin.finalised && <td className={td} />}
                      <td className={`${td} font-normal`}>
                        {g.needPlant > 0
                          ? <span className="text-indigo-700 dark:text-indigo-300">{g.needPlant} to assign</span>
                          : g.noPlant > 0
                            ? <span className="text-slate-600 dark:text-slate-300">{dot} {g.noPlant === g.rowKeys.length ? 'No plant can make' : `${g.noPlant} no plant can make`}</span>
                            : null}
                      </td>
                    </tr>
                  )
                  if (!open) return [groupRow]
                  return [groupRow, ...g.rows.map(r => {
                    const band = BAND_NOTE[r.thickness]
                    return (
                      <tr key={r.id} aria-label={rowName(r)} data-row-key={r.id} data-moved={r.moved || undefined} data-red={r.red || undefined} data-revised={r.revised || undefined}
                        className="border-t border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-700/40">
                        <td className={sizeCell} />
                        <td className={num} title={band}>{r.thickness.toFixed(1)}{band ? '*' : ''}</td>
                        <td className={`${num} ${r.type === 'Buffer' && r.buffer != null ? '' : 'text-slate-400 dark:text-slate-500'}`}>
                          {r.type === 'Buffer' ? (r.buffer != null ? r.buffer : '–') : 'MTO'}
                        </td>
                        <td className={num} title={r.titles.open}>{planningCell(r.open.total)}</td>
                        <td className={num} title={r.titles.last}>{planningCell(r.last.total)}</td>
                        <td className={num} title={r.titles.three}>{planningCell(r.three.total)}</td>
                        <td className={`${num} ${typedRule}`}>
                          {canEdit
                            ? <PlanningTonnesCell bare value={r.indent} label={`Indent ${rowName(r)}`} onCommit={t => write(r, { indent: t })} />
                            : (r.indent != null ? r.indent : '–')}
                        </td>
                        <td className={`${td} tabular-nums`}>
                          <span className="inline-flex items-center gap-1.5">
                            {canEdit
                              ? <PlanningTonnesCell bare strong value={r.typed} placeholder={fin.finalised ? '0' : String(r.suggested)} label={`Planned ${rowName(r)}`}
                                  title={r.suggestedTitle} onCommit={t => write(r, { planned: t })} />
                              : <span title={r.suggestedTitle} className={r.typed == null ? 'text-slate-400 dark:text-slate-500' : 'font-semibold text-slate-900 dark:text-white'}>{r.planned}</span>}
                            {r.moved && (
                              <span className="inline-flex items-center gap-1 text-[10px] text-slate-600 dark:text-slate-300" title={`Typed ${r.planned}; the suggestion has moved to ${r.suggested}. ${r.suggestedTitle}`}>
                                <span aria-hidden="true">◆</span>moved
                                {canEdit
                                  ? <button type="button" onClick={() => write(r, { use: true })} title={r.suggestedTitle} className={link}>use {r.suggested}</button>
                                  : <span>· suggests {r.suggested}</span>}
                              </span>
                            )}
                            {r.revised && (
                              <span className="text-[10px] text-indigo-700 dark:text-indigo-300"
                                title={r.changes.map(c => `${stamp(c.at)} ${c.by}: ${c.field === 'planned' ? 'Planned' : 'Plant'} ${c.field === 'planned' ? c.from : planningAssignLabel(c.from, region.plants)} → ${c.field === 'planned' ? c.to : planningAssignLabel(c.to, region.plants)} — ${c.reason}`).join('\n')}>
                                ↺ revised
                              </span>
                            )}
                          </span>
                        </td>
                        {fin.finalised && (
                          <td className={`${num} text-slate-500 dark:text-slate-400`}
                            title={`Baseline: ${r.baseline.planned} T${r.baseline.planned > 0 ? ` on ${planningAssignLabel(r.baseline.split || r.baseline.plant || '', region.plants)}` : ''}`}>
                            {r.baseline.planned > 0 ? r.baseline.planned : '–'}
                          </td>
                        )}
                        <td className={td}><PlanningPlantCell r={r} name={rowName(r)} canEdit={canEdit} write={change => write(r, change)} /></td>
                      </tr>
                    )
                  })]
                }),
              ]
            })}
            {!shown.rows.length && <tr><td colSpan={cols} className={`${td} text-center text-slate-400 dark:text-slate-500`}>{q.trim() ? `No size matches “${q}”.` : 'No rows to show.'}</td></tr>}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
        {m.provisional && (
          <li role="note" className="text-slate-700 dark:text-slate-200">Provisional · {m.label} not started · Open moves until {m.openLabel}</li>
        )}
        {region.movedRows > 0 && (
          <li className="text-slate-700 dark:text-slate-200">◆ {rows(region.movedRows, 'row', 'rows')} moved · “use N” takes the new suggestion</li>
        )}
        {filter === 'all' && !showQuiet && shown.quietLeftOut > 0 && <li>{shown.quietLeftOut} quiet rows not shown</li>}
      </ul>

      {pending && (
        <PlanningReasonDialog key={`${pending.r.id}|${pending.what}`} name={rowName(pending.r)} what={pending.what} initial={reasons[pending.r.id] || ''}
          onSave={saveWithReason} onCancel={() => setPending(null)} />
      )}

      {fin.finalised && region.changes.length > 0 && (
        <section aria-label="Change log" className="text-[11px] text-slate-600 dark:text-slate-300 border-t border-slate-200 dark:border-slate-700 pt-1.5">
          <b className="text-slate-700 dark:text-slate-200">Changes since Finalise ({region.changes.length})</b>
          {region.changes.length
            ? (
              <ul className="mt-0.5 space-y-0.5 tabular-nums">
                {region.changes.map(c => (
                  <li key={c.id}>
                    <span className="text-slate-500 dark:text-slate-400">{stamp(c.at)} · {c.by}</span> · <b>{c.label}</b> · {c.what} {c.fromLabel} → {c.toLabel} · <i>{c.reason}</i>
                  </li>
                ))}
              </ul>
            )
            : <span> — none</span>}
        </section>
      )}

      <div className="space-y-1.5 border-t border-slate-200 dark:border-slate-700 pt-1.5">
        <FactStrip label="Open stock" items={[
          [`Open ${m.openLabel} · ${region.region}`, `${fmtT(region.totals.open.fg)} T`],
          ['On rows', `${fmtT(region.totals.open.inRows)} T`],
          ['Outside plan', `${fmtT(region.totals.open.outside)} T`],
        ]} />
        {region.outside.lines.length > 0 && (
          <details className="text-[11px] text-slate-500 dark:text-slate-400">
            <summary className={`cursor-pointer w-max font-medium text-slate-600 dark:text-slate-300 ${ring} rounded`}>
              Outside the plan · {rows(region.outside.lines.length, 'size', 'sizes')}
            </summary>
            <table aria-label={`Outside the plan · ${region.region}`} className="mt-1 w-max border-collapse tabular-nums">
              <thead className="text-slate-500 dark:text-slate-400">
                <tr><th className="pr-4 text-left font-medium">Size</th><th className="px-2 text-right font-medium">Open</th>
                  <th className="px-2 text-right font-medium">{m.last.label}</th><th className="px-2 text-right font-medium">{m.three.label}</th></tr>
              </thead>
              <tbody className="text-slate-700 dark:text-slate-200">
                {region.outside.lines.map(l => (
                  <tr key={l.label} aria-label={l.label}>
                    <td className="pr-4">{l.label}</td>
                    <td className="px-2 text-right" title={l.titles.open}>{planningCell(l.open.total)}</td>
                    <td className="px-2 text-right" title={l.titles.last}>{planningCell(l.last.total)}</td>
                    <td className="px-2 text-right" title={l.titles.three}>{planningCell(l.three.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
        <KeyPoints points={[
          'Buffer row: Planned = max(Indent, Buffer) − Open',
          'MTO row: Planned = Indent − Open',
          'Floor 0 · round up to 10 MT',
          <>Planned <span className="text-slate-400 dark:text-slate-500">grey = suggested</span> · <b className="text-slate-700 dark:text-slate-200">bold = typed</b></>,
          'One ticked plant fills in · two: pick or Split…',
          'Split… must add up to Planned',
          'Amber dot = unticked plant with stock / sales',
          'Finalise: every planned row needs a plant',
          'After Finalise: each change needs a reason',
          '2.0 = 1.8–2.2 mm · 3.0 = 2.8–3.2 mm',
          'Other thickness → nearest band, tie heavier',
          'Open = FG on the 1st, not netted',
          `${m.last.label} · ${m.three.label} = invoiced, by shipping plant`,
          'Hover a figure for the plant split',
          notes.length > 0 && `Short history: ${notes.join(' · ')}`,
        ]} />
      </div>
    </div>
  )
}

// The weekly screen, layout D + A (ticket #284, decision #273): once a region's month is finalised,
// the app's week plan for each of its plants. A region overview (each plant's weeks side by side)
// over one plant's rows in run order, each whole row in one week column. Every figure is built by
// `planningWeekPlanView` (calc.js) from the same `planningCampaignView` the monthly sheet shows;
// this component lays it out and computes nothing. #285: the admin moves a row to another week or
// splits it across weeks (Split…, red until the weeks add up), saved by `planningWeekSave` and
// logged with no reason. A row's plant is never changed here. "was X on Mon" marks a week cell a
// week move has changed since that week's Monday. #286: the plant view's Strip · Slit · HR · Coil
// columns and thickness-band lines, and the overview's "Coil short", are `planningCoilHandOut`
// over `coilOnHand` — guidance only, nothing is reserved or written.
// While a region's month is a Draft, the Week plan and Monitoring have nothing to show: the weeks are
// proposed at Finalise. Instead of one sentence, say what is left to do, from the campaign's own
// figures (planningCampaignView — counts, summary and the Finalise state), and offer the way there.
function PlanningBeforeFinalise({ campaign, monthKey, onOpenCampaign = null }) {
  if (!campaign) return null
  const fin = campaign.finalise
  const sm = campaign.summary
  const mon = planningMonthName(monthKey)
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3">
        <p role="note" className="font-medium text-slate-800 dark:text-slate-100">🔒 Finalise {campaign.region} · {mon} first</p>
        {onOpenCampaign && (
          <button type="button" onClick={onOpenCampaign}
            className="px-2.5 py-1 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500">
            Monthly campaign →
          </button>
        )}
      </div>
      <FactStrip label={`${campaign.region} before Finalise`} items={[
        ['Planned', `${fmtT(sm.planned)} T`],
        ['To assign', `${sm.needPlant} rows`],
        fin.blockers.length > sm.needPlant && ['Splits off', `${fin.blockers.length - sm.needPlant}`],
        ['Indent typed', `${campaign.counts.indent} rows`],
      ]} />
    </div>
  )
}

// One component, two screens over the same finalised plan (`mode`):
//   'plan'    — Week plan: the app's weeks per plant, moving / splitting rows, the coil each needs.
//   'monitor' — Monitoring: plan against actual (#287) and Dispatched · Stock now · MTO served (#288).
// Both read `planningWeekPlanView`; neither computes. A closed week stays grey on both, and a row its
// closed week did not make stays amber on the Week plan too — that is what tells the planner to move it.
function PlanningWeekPlan({ productions, dispatches, skus, plants, stored, coils = [], babyCoils = [], campaigns = [], setCampaigns = null, who = '', mode = 'plan', pick: shared = null, onOpenCampaign = null }) {
  const todayStr = today()
  const months = useMemo(() => planningCampaignMonths(todayStr,
    [...productions.map(p => p.dateOfProduction), ...dispatches.map(d => d.dateOfDispatch)]), [todayStr, productions, dispatches])
  const [month, setMonth, regionKey, setRegionKey] = usePlanningPick(shared, todayStr)
  const monitoring = mode === 'monitor'
  // With a shared pick the tab built both already (the step bar reads them too).
  const view = useMemo(() => shared?.view || planningCampaignView({ productions, dispatches, skus, plants, stored, campaigns, month, today: todayStr }),
    [shared?.view, productions, dispatches, skus, plants, stored, campaigns, month, todayStr])
  const onHand = useMemo(() => (shared?.plan ? null : coilOnHand({ coils, babyCoils, productions })), [shared?.plan, coils, babyCoils, productions])
  const plan = useMemo(() => shared?.plan || planningWeekPlanView(view, { onHand, skus, today: todayStr }), [shared?.plan, view, onHand, skus, todayStr])
  const [plantKey, setPlantKey] = useState('')
  const [problem, setProblem] = useState(null)
  useEffect(() => { setPlantKey(''); setProblem(null) }, [regionKey])
  const region = plan.regions.find(r => r.region === regionKey) || plan.regions[0]
  if (!region) return <p className="text-sm text-slate-500 dark:text-slate-400">The planning master has no rows.</p>

  const m = view.month
  const weeks = plan.weeks
  const days = weeks.reduce((t, w) => t + w.days, 0)
  const pick = region.plants.find(p => p.plant === plantKey) || region.plants[0] || null
  const th = 'px-1.5 h-6 font-medium text-[10px] uppercase tracking-wide whitespace-nowrap'
  const td = 'px-1.5 h-[22px] whitespace-nowrap'
  const num = `${td} text-right tabular-nums`
  const weekTitle = (w) => `${w.key} ${w.label}: ${w.days} of ${days} working days (Mon–Sat), ${Math.round(w.share * 100)}% of the month${w.joined ? ` · ${w.joined} joined in` : ''}`
  // #287: a week is closed once its last day is before today — judged, shown greyed.
  const closedAt = (j) => !!region?.monitor?.weeks[j]?.closed
  const weekHead = (w, j) => (
    <th key={w.key} className={`${th} text-right ${closedAt(j) ? 'bg-slate-100 dark:bg-slate-700/80' : ''}`} title={`${weekTitle(w)}${closedAt(j) ? (monitoring ? ' · closed: plan / made' : ' · closed') : ''}`}>
      {w.key}<span className="block normal-case tracking-normal font-normal text-slate-400 dark:text-slate-500">{closedAt(j) ? `${w.label} · closed` : w.label}</span>
    </th>
  )
  // Monitoring (#287): % made of the latest plan; a status is amber or plain, never red (red is a
  // plant's week).
  const pctOf = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`)
  const statusTone = { green: 'text-emerald-700 dark:text-emerald-400', amber: 'text-amber-800 dark:text-amber-300', plain: 'text-slate-500 dark:text-slate-400' }
  const red = 'text-red-700 dark:text-red-400'
  // A closed week's cell on the overview: plan / made, red when the plant's week is short.
  const closedCell = (pw, name, target) => (
    <span title={`${name} ${pw.key}: plan ${fmtT(pw.plan)} T as it stood on the week's Monday, made against plan ${fmtT(pw.made)} T${pw.red ? ` — short ${fmtT(pw.short)} T, more than 10 % (min 1 T)` : ''} · by working days ${fmtT(target)} T`}>
      <span className={pw.red ? `${red} font-semibold` : ''}>{planningCell(pw.plan)} / {planningCell(pw.made)}</span>
      {Math.abs(pw.planNow - pw.plan) > 0.05 && <span className="block text-[9px] leading-none font-normal text-slate-500 dark:text-slate-400" title="The week's plan now, after a week move since its Monday">now {fmtT(pw.planNow)}</span>}
      {pw.entered && <span className="block text-[9px] leading-none font-normal text-amber-800 dark:text-amber-300">{pw.entered}</span>}
    </span>
  )
  const rowName = (r) => `${r.size} ${Number(r.thickness).toFixed(1)}`
  const un = region.unplaced
  const canEdit = !!setCampaigns
  // Rows move between weeks on the Week plan only; Monitoring reads.
  const moves = canEdit && !monitoring
  // Validate against what is on screen, then write through the store's functional update. ONE id
  // and time per change: the updater may run twice (StrictMode) and must write the same row.
  const writeWeek = (r, change) => {
    const changeId = crypto.randomUUID()
    const where = { region: region.region, month: m.key, rowKey: r.id, plant: pick.plant }
    const opts = { plan: pick, by: who, at: new Date().toISOString(), changeId: () => changeId }
    const res = planningWeekSave(campaigns, where, change, opts)
    if (res.problem) { setProblem(res.problem); return false }
    setCampaigns(prev => planningWeekSave(prev, where, change, opts).stored)
    setProblem(null)
    return true
  }
  const dayLabel = (iso) => new Date(`${iso}T00:00:00Z`).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
  // Coil (#286): red = a closed week's leftover ("now"), amber = needed by a week still to run.
  const coilTone = (by) => by?.now ? 'text-red-700 dark:text-red-400' : 'text-amber-800 dark:text-amber-300'
  const t1 = (v) => (Math.round((Number(v) || 0) * 10) / 10).toLocaleString('en-IN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

  return (
    <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-3 space-y-2 text-xs text-slate-700 dark:text-slate-200">
      {!shared && (
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{monitoring ? `${m.label}: plan against actual` : `${m.label} by week`}</h3>
        <div role="group" aria-label="Region" className="inline-flex rounded border border-slate-300 dark:border-slate-600 overflow-hidden">
          {plan.regions.map(r => (
            <button key={r.region} type="button" aria-pressed={r.region === region.region} onClick={() => { setRegionKey(r.region); setPlantKey('') }}
              className={`px-2.5 py-0.5 ${r.region === region.region ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              {r.region}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1 text-slate-500 dark:text-slate-400">Plan month
          <select value={m.key} onChange={e => setMonth(e.target.value)} aria-label="Plan month"
            className="px-1 py-0.5 rounded border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200">
            {months.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </label>
      </div>
      )}

      {!region.finalised ? (
        <PlanningBeforeFinalise campaign={view.regions.find(g => g.region === region.region)} monthKey={m.key} onOpenCampaign={onOpenCampaign} />
      ) : (
        <>
          {monitoring && <FactStrip label={`${region.region} dispatched and served`} items={[
            ['Dispatched MTD', `${fmtT(region.sales.dispatched)} T`, `Zoho invoices at ${region.region}'s own plants, by shipping plant, ${m.openLabel} to today`],
            ['MTO served', `${pctOf(region.sales.mto.pct)} of ${fmtT(region.sales.mto.indent)} T`, 'Dispatched ÷ Monthly Indent, MTO rows with an indent'],
            region.sales.mto.noIndent > 0 && ['MTO, no indent', `${region.sales.mto.noIndent} rows`],
            ['Under buffer', `${region.sales.buffer.under} / ${region.sales.buffer.of}`, 'Buffer rows with Stock now under Buffer'],
            region.sales.buffer.check > 0 && ['To check', `${region.sales.buffer.check}`],
          ]} />}
          <div className="overflow-x-auto max-w-full w-max border border-slate-200 dark:border-slate-700 rounded">
            <table aria-label="Region overview" className="w-max border-collapse tabular-nums">
              <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                <tr className="border-b border-slate-300 dark:border-slate-600">
                  <th className={`${th} text-left`}>Plant</th>
                  {weeks.map(weekHead)}
                  <th className={`${th} text-right`} title="The plant's assigned Planned for the month — the campaign summary's T per plant (latest plan; the Baseline beneath when it differs)">Month</th>
                  {monitoring ? <>
                    <th className={`${th} text-right`} title="Production credited to the plant's rows this month, whatever week it was made in, up to each row's plan">Made</th>
                    <th className={`${th} text-right`} title="Made ÷ the latest Month plan">%</th>
                    <th className={`${th} text-right`} title="The closed weeks' plan less everything credited so far, when that is short by more than 10 % (min 1 T)">Behind</th>
                    <th className={`${th} text-right`} title="Made, not credited: past a row's plan, on a row with no plan at this plant, or on a size with no master row. Not part of any week's tonnes.">Off plan</th>
                    <th className={`${th} text-right`} title="Invoice entries (the uploaded Zoho register) shipped from this plant this month, to today — any size">Dispatched<span className="block normal-case tracking-normal font-normal text-slate-400 dark:text-slate-500">MTD</span></th>
                  </> : (
                    <th className={`${th} text-left`} title="Coil the plant's weeks need beyond the coil on hand at that plant (unused slit coil + HR coil not yet slit), per thickness band. Red = needed now, for what a closed week did not make.">Coil short (T)</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {region.plants.map(p => (
                  <tr key={p.plant} aria-label={p.name} className={`border-t border-slate-100 dark:border-slate-700 ${pick?.plant === p.plant ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''}`}>
                    <td className={td}>
                      <button type="button" aria-pressed={pick?.plant === p.plant} onClick={() => setPlantKey(p.plant)}
                        className="text-indigo-700 dark:text-indigo-300 underline decoration-dotted font-medium">{p.name}</button>
                    </td>
                    {weeks.map((w, j) => (p.monitor.weeks[j].closed
                      ? <td key={w.key} className={`${num} bg-slate-50 dark:bg-slate-700/40`} aria-label={`${p.name} ${w.key}`}>
                          {monitoring ? closedCell(p.monitor.weeks[j], p.name, p.target[j]) : planningCell(p.byWeek[j])}
                        </td>
                      : <td key={w.key} className={num} title={`${p.name} ${w.key}: proposed ${fmtT(p.byWeek[j])} T · by working days ${fmtT(p.target[j])} T`}>{planningCell(p.byWeek[j])}</td>
                    ))}
                    <td className={`${num} font-semibold`}>
                      {planningCell(p.total)}
                      {Math.abs(p.monitor.changed) > 0.05 && <span className="block text-[9px] leading-none font-normal text-slate-400 dark:text-slate-500" title="The month as finalised (Baseline)">Base {fmtT(p.monitor.baseline)}</span>}
                    </td>
                    {monitoring ? <>
                      <td className={num}>{planningCell(p.monitor.credited)}</td>
                      <td className={num}>{pctOf(p.monitor.pct)}</td>
                      <td className={`${num} ${p.monitor.behind > 0 ? `${red} font-semibold` : ''}`} aria-label={`${p.name} behind`}>{planningCell(p.monitor.behind)}</td>
                      <td className={num} title={p.monitor.offPlan.lines.map(l => `${l.label} ${fmtT(l.tonnes)} T (${l.why})`).join('\n') || undefined}>{planningCell(p.monitor.offPlan.tonnes)}</td>
                      <td className={num} aria-label={`${p.name} dispatched`}>{planningCell(p.dispatched)}</td>
                    </> : (
                    <td className="px-1.5 py-0.5 text-[11px] leading-snug" aria-label={`${p.name} coil short`}>
                      {p.coil?.shortBands.length
                        ? p.coil.shortBands.map(b => (
                          <span key={b.band} className={`${coilTone(b.by)} block whitespace-nowrap tabular-nums`}>{b.band.toFixed(1)}: {fmtT(b.short)} {b.by.now ? 'now' : b.by.label}</span>
                        ))
                        : <span className="text-emerald-700 dark:text-emerald-400">covered</span>}
                    </td>
                    )}
                  </tr>
                ))}
                <tr className="border-t border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 font-semibold">
                  <td className={td}>{region.region} total</td>
                  {weeks.map((w, j) => (
                    <td key={w.key} className={num}>
                      {monitoring && region.monitor.weeks[j].closed ? `${planningCell(region.monitor.weeks[j].plan)} / ${planningCell(region.monitor.weeks[j].made)}` : planningCell(region.byWeek[j])}
                    </td>
                  ))}
                  <td className={num}>
                    {planningCell(region.total)}
                    {Math.abs(region.monitor.changed) > 0.05 && <span className="block text-[9px] leading-none font-normal text-slate-400 dark:text-slate-500" title="The month as finalised (Baseline)">Base {fmtT(region.monitor.baseline)}</span>}
                  </td>
                  {monitoring ? <>
                    <td className={num}>{planningCell(region.monitor.credited)}</td>
                    <td className={num}>{pctOf(region.monitor.pct)}</td>
                    <td className={num}>{planningCell(region.monitor.behind)}</td>
                    <td className={num}>{planningCell(region.monitor.offPlan.tonnes)}</td>
                    <td className={num} aria-label={`${region.region} dispatched`}>{planningCell(region.sales.dispatched)}</td>
                  </> : <td className={td} />}
                </tr>
              </tbody>
            </table>
          </div>
          {(un.noPlant.tonnes > 0 || un.needPlant.tonnes > 0) && (
            <p aria-label="Not in any plant's weeks" className="text-[11px]">
              <b>Not in weeks:</b>{' '}
              {un.noPlant.tonnes > 0 && <span className="text-red-700 dark:text-red-400" title={un.noPlant.rows.join(', ')}>No plant can make {fmtT(un.noPlant.tonnes)} T ({un.noPlant.rows.length} {un.noPlant.rows.length === 1 ? 'row' : 'rows'})</span>}
              {un.noPlant.tonnes > 0 && un.needPlant.tonnes > 0 && ' · '}
              {un.needPlant.tonnes > 0 && <span className="text-amber-800 dark:text-amber-300" title={un.needPlant.rows.join(', ')}>needs a plant {fmtT(un.needPlant.tonnes)} T ({un.needPlant.rows.length} {un.needPlant.rows.length === 1 ? 'row' : 'rows'})</span>}
            </p>
          )}

          {pick && (
            <section aria-label={`${pick.name} ${monitoring ? 'monitoring' : 'week plan'}`} className="space-y-1">
              <h4 className="text-[13px] font-semibold text-slate-900 dark:text-white">
                {pick.name}
                <span className="ml-2 font-normal text-slate-500 dark:text-slate-400">
                  {pick.rows.length} {pick.rows.length === 1 ? 'row' : 'rows'} · {pick.sizeChanges} size {pick.sizeChanges === 1 ? 'change' : 'changes'} · {fmtT(pick.total)} T
                  {pick.splitOff > 0 && <span className="text-red-700 dark:text-red-400"> · {pick.splitOff} week {pick.splitOff === 1 ? 'split does' : 'splits do'} not add up</span>}
                </span>
              </h4>
              {monitoring && <FactStrip label={`${pick.name} plan against made`} items={[
                ['Baseline', fmtT(pick.monitor.baseline), 'Baseline = made + plan changed + behind + still to come'],
                ['Made', fmtT(pick.monitor.credited)],
                ['Plan changed', fmtT(pick.monitor.changed)],
                ['Behind', <span className={pick.monitor.behind > 0 ? red : ''}>{fmtT(pick.monitor.behind)}</span>],
                ['Still to come', fmtT(pick.monitor.toCome)],
                pick.monitor.offPlan.tonnes > 0.05 && ['Off plan', fmtT(pick.monitor.offPlan.tonnes), 'Made, not credited to any row'],
              ]} />}
              {!monitoring && pick.coil?.bands.length > 0 && (
                <table aria-label={`${pick.name} coil by thickness`} className="w-max border-collapse tabular-nums text-[11px] border border-slate-200 dark:border-slate-700 rounded">
                  <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                    <tr>
                      <th className={`${th} text-left`} title={`Coil on hand at ${pick.name} only, handed out in week order`}>Coil band</th>
                      <th className={`${th} text-right`} title="Coil still needed for the month">Need</th>
                      <th className={`${th} text-right`} title="Fitting slit coil handed out">Slit</th>
                      <th className={`${th} text-right`} title="HR coil of the band handed out">HR</th>
                      <th className={`${th} text-right`} title="HR coil of the band on hand">HR on hand</th>
                      <th className={`${th} text-right`}>Short</th>
                      <th className={`${th} text-left`} title="Start of the first week the coil runs out">First</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pick.coil.bands.map(b => (
                      <tr key={b.band} aria-label={`${pick.name} ${b.band.toFixed(1)} mm coil`} className="border-t border-slate-100 dark:border-slate-700">
                        <td className={`${td} font-semibold`}>{b.band.toFixed(1)} mm</td>
                        <td className={num}>{t1(b.need)}</td>
                        <td className={num}>{t1(b.slit)}</td>
                        <td className={num}>{t1(b.hr)}</td>
                        <td className={num}>{t1(b.hrOnHand)}</td>
                        <td className={`${num} ${b.short > 0 ? coilTone(b.by) : 'text-emerald-700 dark:text-emerald-400'}`}>{b.short > 0 ? t1(b.short) : '✓'}</td>
                        <td className={`${td} ${b.short > 0 ? coilTone(b.by) : ''}`}>{b.short > 0 ? (b.by.now ? 'now' : b.by.label) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {pick.rows.length ? (
                <div className="overflow-x-auto max-w-full w-max border border-slate-200 dark:border-slate-700 rounded">
                  <table className="w-max border-collapse tabular-nums">
                    <thead className="bg-slate-50 dark:bg-slate-700 text-slate-500 dark:text-slate-300">
                      <tr className="border-b border-slate-300 dark:border-slate-600">
                        <th className={`${th} text-right`}>#</th>
                        <th className={`${th} text-left`}>Sec</th>
                        <th className={`${th} text-left`}>Size</th>
                        <th className={`${th} text-right`}>Thk</th>
                        <th className={`${th} text-right`} title={`T this row puts on ${pick.name}: its Planned, or its part of a split (ˢ)`}>T</th>
                        {moves && <th className={`${th} text-left`} title="Move the row to another week, or Split… it across weeks. Logged with your name and the time; no reason asked.">Week</th>}
                        {weeks.map(weekHead)}
                        {monitoring ? <>
                        <th className={`${th} text-right`} title="This row's production at this plant this month, whatever week it was made in, up to the row's T">Made</th>
                        <th className={`${th} text-right`} title="Made ÷ the row's latest T">%</th>
                        <th className={`${th} text-left`} title="Amber = a closed week's tonnes not made (outside 1 T or 5 %), until the row is moved. A row is never red: red is the plant's week.">Status</th>
                        <th className={`${th} text-right border-l border-slate-200 dark:border-slate-600`} title={`Invoice entries on this row this month, to today, at ${region.region}'s own plants by shipping plant — a region figure, the same on both plants of a split row`}>Dispatched<span className="block normal-case tracking-normal font-normal text-slate-400 dark:text-slate-500">region MTD</span></th>
                        <th className={`${th} text-right`} title="Open + made − dispatched, region pool, against the row's Buffer. Green at or above Buffer. “check” = dispatched more than Open + made: an entry or a band is missing.">Stock now / Buffer<span className="block normal-case tracking-normal font-normal text-slate-400 dark:text-slate-500">region</span></th>
                        <th className={`${th} text-right`} title="MTO rows: dispatched ÷ Monthly Indent, region">MTO served<span className="block normal-case tracking-normal font-normal text-slate-400 dark:text-slate-500">of indent</span></th>
                        </> : <>
                        <th className={`${th} text-right`} title="Strip width worked out from the tube's size: SHS/RHS perimeter − 4 mm; CHS π × (OD − t) + 2 mm. ? = no OD on the SKU master for that NB.">Strip<span className="block normal-case tracking-normal font-normal text-slate-400 dark:text-slate-500">mm</span></th>
                        <th className={`${th} text-right`} title="Slit coil on hand that fits this row (this plant, this thickness band, within ± 5 mm of the strip), handed out in week order">Slit</th>
                        <th className={`${th} text-right`} title="HR coil of the band on hand at this plant, after fitting slit coil">HR</th>
                        <th className={`${th} text-left`} title="What the coil on hand cannot cover. Guidance only: nothing is reserved.">Coil short</th>
                        </>}
                      </tr>
                    </thead>
                    <tbody>
                      {pick.rows.map((r, i) => {
                        const prev = pick.rows[i - 1]
                        const newSec = !prev || prev.section !== r.section
                        const newSize = newSec || prev.size !== r.size
                        const splitting = !!r.weekSplit
                        const off = splitting && !r.weekSplitOk
                        const inWeeks = weeks.filter((w, j) => r.weeks[j] > 0).map(w => w.key).join(' ')
                        return (
                          <tr key={r.id} aria-label={rowName(r)} data-row-key={r.id} data-week={inWeeks}
                            className={`${newSize ? 'border-t border-slate-200 dark:border-slate-600' : 'border-t border-slate-100 dark:border-slate-700'}`}>
                            <td className={`${num} text-slate-400 dark:text-slate-500`}>{i + 1}</td>
                            <td className={`${td} text-[10px] font-semibold tracking-wider text-slate-500 dark:text-slate-300`}>{newSec ? r.section : ''}</td>
                            <td className={`${td} ${newSize ? 'font-semibold text-slate-900 dark:text-white' : 'text-center text-slate-300 dark:text-slate-500'}`}>{newSize ? r.size : '·'}</td>
                            <td className={num}>{Number(r.thickness).toFixed(1)}</td>
                            <td className={num} title={r.split ? `Split row: ${pick.name}'s ${fmtT(r.tonnes)} T of Planned ${fmtT(r.planned)} T` : undefined}>
                              {fmtT(r.tonnes)}{r.split ? 'ˢ' : ''}
                              {Math.abs(r.monitor.changed) > 0.05 && <span className="ml-1 text-[10px] text-slate-400 dark:text-slate-500" title="Baseline: this row on this plant as finalised">B {fmtT(r.monitor.baseline)}</span>}
                              {r.revised && <span className="ml-1 text-[10px] text-indigo-700 dark:text-indigo-300" title="Revised after Finalise — see the Monthly campaign's change log">↺</span>}
                            </td>
                            {moves && (
                              <td className={td}>
                                <span className="inline-flex items-center gap-1">
                                  <select value={splitting ? 'split' : (weeks[r.week]?.key || '')} aria-label={`Week ${rowName(r)}`}
                                    title={r.stored ? undefined : 'Proposed by the app: not yet kept. Any move keeps every row of this plant where it is.'}
                                    onChange={e => writeWeek(r, e.target.value === 'split' ? { split: true } : { week: e.target.value })}
                                    className={`h-[18px] px-0.5 text-[11px] rounded border bg-white dark:bg-slate-800 ${off ? 'border-red-400' : 'border-slate-300 dark:border-slate-600'}`}>
                                    {weeks.map(w => <option key={w.key} value={w.key}>{w.key}</option>)}
                                    <option value="split">Split…</option>
                                  </select>
                                  {splitting && (
                                    <span className={off ? 'text-red-700 dark:text-red-400' : 'text-slate-500 dark:text-slate-400'}
                                      title={r.weekSplitCut
                                        ? `Planned was cut by more than ${weeks[r.week]?.key} held: it is empty and the rest came off the latest weeks. Check the split.`
                                        : off ? 'Not taken as the plan until the weeks add up: the row keeps its weeks as they were'
                                          : `A Planned change goes to ${weeks[r.week]?.key}, the biggest part; the other weeks keep theirs`}>
                                      {r.weekSplitCut ? `= ${fmtT(r.tonnes)} · check` : off ? `${fmtT(r.weekSplitTotal)} of ${fmtT(r.tonnes)}` : `= ${fmtT(r.tonnes)}`}
                                    </span>
                                  )}
                                </span>
                              </td>
                            )}
                            {weeks.map((w, j) => {
                              const has = r.weeks[j] > 0
                              const was = r.was[j]
                              return (
                                <td key={w.key} className={`${num} ${has ? `bg-indigo-50 dark:bg-indigo-900/30 font-medium ${closedAt(j) && r.monitor.status.tone === 'amber' ? statusTone.amber : ''}` : 'text-slate-300 dark:text-slate-600'}`}
                                  title={was != null ? `${w.key} held ${fmtT(was)} T on ${dayLabel(w.monday)}; a week move since then changed it` : undefined}>
                                  {splitting && moves
                                    ? <PlanningTonnesCell value={r.weekSplit[w.key]} label={`Week ${w.key} ${rowName(r)}`}
                                        onCommit={t => writeWeek(r, { part: { week: w.key, tonnes: t } })} />
                                    : (has ? fmtT(r.weeks[j]) : '·')}
                                  {was != null && <span className="block text-[9px] leading-none font-normal italic text-slate-500 dark:text-slate-400">was {fmtT(was)} on {w.mondayLabel}</span>}
                                </td>
                              )
                            })}
                            {monitoring ? <>
                            <td className={num} title={r.monitor.offPlan > 0 ? `Produced ${fmtT(r.monitor.produced)} T: ${fmtT(r.monitor.offPlan)} T past the plan is made off plan` : undefined}>{planningCell(r.monitor.credited)}</td>
                            <td className={num}>{pctOf(r.monitor.pct)}</td>
                            <td className={`${td} text-[11px] ${statusTone[r.monitor.status.tone]}`} aria-label={`Status ${rowName(r)}`}>
                              {r.monitor.status.label}{r.monitor.offPlan > 0 && <span className="text-slate-500 dark:text-slate-400"> · +{fmtT(r.monitor.offPlan)} off plan</span>}
                            </td>
                            <td className={`${num} border-l border-slate-200 dark:border-slate-600`} aria-label={`Dispatched ${rowName(r)}`}>{planningCell(r.sales.dispatched)}</td>
                            <td className={num} aria-label={`Stock now ${rowName(r)}`}>
                              {r.sales.stock.check
                                ? <span className={statusTone[r.sales.stock.tone]} title={`Dispatched ${fmtT(r.sales.stock.over)} T more than Open + made: an entry or a band is missing`}>check</span>
                                : <>
                                    <span className={r.sales.stock.tone === 'green' ? statusTone.green : ''}>{t1(r.sales.stock.value)}</span>
                                    {r.sales.stock.buffer != null && <span className="text-slate-400 dark:text-slate-500"> / {fmtT(r.sales.stock.buffer)}</span>}
                                    {r.sales.stock.byDesign && <span className="ml-1 text-[10px] text-slate-500 dark:text-slate-400" title="Indent ≥ Buffer: the month's sales are served out of the buffer, so it ends under Buffer by design (#252)">by design</span>}
                                  </>}
                            </td>
                            <td className={num} aria-label={`MTO served ${rowName(r)}`}>
                              {!r.sales.served.mto ? <span className="text-slate-300 dark:text-slate-600">·</span>
                                : r.sales.served.pct != null ? <span title={`${fmtT(r.sales.served.dispatched)} T of ${fmtT(r.sales.served.indent)} T indent`}>{pctOf(r.sales.served.pct)}</span>
                                  : r.sales.served.noIndent ? <span className="text-[11px] text-slate-500 dark:text-slate-400" title={`${fmtT(r.sales.served.dispatched)} T dispatched with no Monthly Indent`}>no indent</span>
                                    : '–'}
                            </td>
                            </> : <>
                            <td className={`${num} text-slate-500 dark:text-slate-400`} aria-label={`Strip ${rowName(r)}`}>{r.coil?.strip != null ? Math.round(r.coil.strip) : '?'}</td>
                            <td className={num}>{r.coil?.slit > 0.05 ? t1(r.coil.slit) : '–'}</td>
                            <td className={num}>{r.coil?.hr > 0.05 ? t1(r.coil.hr) : '–'}</td>
                            <td className={`${td} text-[11px]`} aria-label={`Coil ${rowName(r)}`}>
                              {r.coil?.short > 0
                                ? <span className={coilTone(r.coil.by)}>{t1(r.coil.short)} {r.coil.by.now ? 'now' : r.coil.by.label}</span>
                                : r.coil?.need > 0 ? <span className="text-emerald-700 dark:text-emerald-400">✓</span>
                                  : <span className="text-slate-400 dark:text-slate-500" title="Made this month: no coil still needed">made</span>}
                            </td>
                            </>}
                          </tr>
                        )
                      })}
                      <tr className="border-t border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/60 font-semibold">
                        <td className={td} colSpan={4}>{pick.name}</td>
                        <td className={num}>{fmtT(pick.total)}</td>
                        {moves && <td className={td} />}
                        {weeks.map((w, j) => <td key={w.key} className={num} title={`By working days ${fmtT(pick.target[j])} T`}>{planningCell(pick.byWeek[j])}</td>)}
                        {monitoring ? <>
                          <td className={num}>{planningCell(pick.monitor.credited)}</td>
                          <td className={num}>{pctOf(pick.monitor.pct)}</td>
                          <td className={td} />
                          <td className={td} colSpan={3} />
                        </> : <>
                          <td className={td} colSpan={3} />
                          <td className={`${td} text-[11px]`}>{pick.coil?.short > 0 ? <span className="text-amber-800 dark:text-amber-300">{t1(pick.coil.short)}</span> : ''}</td>
                        </>}
                      </tr>
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-slate-500 dark:text-slate-400">{pick.name} · {m.label} · 0 T</p>
              )}
              {monitoring && pick.monitor.offPlan.lines.length > 0 && (
                <ul aria-label={`${pick.name} made off plan`} className="w-max max-w-full text-[11px] space-y-0.5">
                  <li className="font-semibold text-slate-700 dark:text-slate-200">Made off plan · {fmtT(pick.monitor.offPlan.tonnes)} T</li>
                  {pick.monitor.offPlan.lines.map(l => (
                    <li key={`${l.label}|${l.why}`} className="tabular-nums">{l.label} — <b>{fmtT(l.tonnes)}</b> T <span className="text-slate-500 dark:text-slate-400">({l.why})</span></li>
                  ))}
                </ul>
              )}
              {problem && <p role="alert" className="text-red-700 dark:text-red-400">{problem}</p>}
            </section>
          )}

          {!monitoring && region.moves.length > 0 && <section aria-label="Week moves" className="space-y-0.5">
            <h4 className="text-[12px] font-semibold text-slate-900 dark:text-white">Week moves ({region.moves.length})</h4>
            {region.moves.length ? (
              <ul className="text-[11px] space-y-0.5">
                {region.moves.map(c => (
                  <li key={c.id}>{stamp(c.at)} · {c.by} · {c.plantName} · {c.label} · {c.fromLabel} → {c.toLabel}</li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400">none</p>
            )}
          </section>}
        </>
      )}

      <KeyPoints points={monitoring ? [
        'Made = production on its row, up to plan',
        'Off plan = made, not credited',
        '% = Made ÷ latest plan · Base = as finalised',
        <>Closed week: plan on its Monday / made · <span className={red}>red</span> = &gt; 10 % short (min 1 T)</>,
        <><span className={statusTone.amber}>Amber row</span> = closed week not made</>,
        'Behind = closed weeks’ plan − made',
        '“entered to” = last production date entered',
        'Dispatched = Zoho invoices, shipping plant, MTD',
        'Stock now = Open + made − dispatched (region)',
        'MTO served = dispatched ÷ Indent',
        'Rows move on the Week plan only',
      ] : [
        'Run order: section → size → thin to thick',
        'Weeks Mon–Sun · share by Mon–Sat days',
        'Part week < 3 days joins its neighbour',
        'No capacity check',
        'Week / Split… moves a row · logged, no reason',
        '“was X on Mon” = before a move',
        'ˢ split row · ↺ revised after Finalise',
        <>Grey week = closed · <span className={statusTone.amber}>amber</span> = not made</>,
        'Coil: on hand at this plant only',
        'Coil: fitting slit first, then HR · 1 : 1',
        <><span className={statusTone.amber}>Amber date</span> = runs out · <span className={red}>red now</span> = overdue</>,
      ]} />
    </div>
  )
}

// The Production Planning tab's screens (#280) as a step bar, left to right in the order the work
// runs: the master the plan reads, the monthly campaign (Finalised there), its week plan (#284) and
// monitoring — plan against actual (#287, #288). Each step shows its state for the picked region and
// month as a figure, so where the planner stands reads off the bar. The tab OPENS on the campaign.
const PLANNING_SCREENS = [['master', 'Planning master'], ['campaign', 'Monthly campaign'], ['weekly', 'Week plan'], ['monitor', 'Monitoring']]

function ProductionPlanningTab(props) {
  const [screen, setScreen] = useState('campaign')
  // One Region and Plan month for every step (see usePlanningPick), picked once, on the bar.
  const todayStr = today()
  const [month, setMonth] = useState(() => todayStr.slice(0, 7))
  const [region, setRegion] = useState('')
  const { productions, dispatches, skus, plants, stored, campaigns = [], coils = [], babyCoils = [] } = props
  // Built once here and handed to the screens, so the bar and the screen read the same figures.
  const months = useMemo(() => planningCampaignMonths(todayStr,
    [...productions.map(p => p.dateOfProduction), ...dispatches.map(d => d.dateOfDispatch)]), [todayStr, productions, dispatches])
  const view = useMemo(() => planningCampaignView({ productions, dispatches, skus, plants, stored, campaigns, month, today: todayStr }),
    [productions, dispatches, skus, plants, stored, campaigns, month, todayStr])
  const onHand = useMemo(() => coilOnHand({ coils, babyCoils, productions }), [coils, babyCoils, productions])
  const plan = useMemo(() => planningWeekPlanView(view, { onHand, skus, today: todayStr }), [view, onHand, skus, todayStr])
  const pick = { month, setMonth, region, setRegion, months, view, plan }
  const cg = view.regions.find(g => g.region === region) || view.regions[0]
  const wg = plan.regions.find(g => g.region === cg?.region)
  const fin = !!cg?.finalise.finalised
  const pct = (v) => (v == null ? '–' : `${Math.round(v * 100)}%`)
  // Each step: [state text, tone]. Grey = locked until Finalise.
  const state = !cg ? {} : {
    master: [`${cg.rows.length} rows${cg.counts.noPlant ? ` · ${cg.counts.noPlant} no plant` : ''}`, cg.counts.noPlant ? 'warn' : ''],
    campaign: [`${fmtT(cg.summary.planned)} T · ${fin ? 'final' : cg.finalise.blockers.length ? `${cg.summary.needPlant} to assign` : 'ready'}`, fin ? 'ok' : ''],
    weekly: fin ? [`${plan.weeks.length} weeks`, ''] : ['locked', 'off'],
    monitor: fin && wg ? [`${pct(wg.monitor.pct)} made${wg.monitor.behind > 0.05 ? ` · ${fmtT(wg.monitor.behind)} T behind` : ''}`, wg.monitor.behind > 0.05 ? 'bad' : ''] : ['locked', 'off'],
  }
  const tone = { ok: 'text-emerald-700 dark:text-emerald-400', warn: 'text-amber-800 dark:text-amber-300', bad: 'text-red-700 dark:text-red-400', off: 'text-slate-400 dark:text-slate-500', '': 'text-slate-500 dark:text-slate-400' }
  const ring = 'focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500'
  const bar = (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 border-b border-slate-200 dark:border-slate-700">
      <div role="group" aria-label="Planning screen" className="flex items-stretch gap-1 text-sm -mb-px">
        {PLANNING_SCREENS.map(([key, label], i) => {
          const [text, t] = state[key] || ['', '']
          return (
            <React.Fragment key={key}>
              {i > 0 && <span aria-hidden="true" className={`self-center px-1 ${key === 'weekly' ? (fin ? tone.ok : tone.off) : 'text-slate-300 dark:text-slate-600'}`}
                title={key === 'weekly' ? (fin ? 'Finalised' : 'Finalise the month to unlock') : undefined}>{key === 'weekly' ? (fin ? '✓' : '🔒') : '→'}</span>}
              <button type="button" aria-pressed={screen === key} aria-label={label} title={text} onClick={() => setScreen(key)}
                className={`px-1 pb-1.5 pt-1 text-left border-b-2 rounded-t ${ring} ${screen === key
                  ? 'border-indigo-600 text-slate-900 dark:text-white'
                  : 'border-transparent text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'}`}>
                <span className={`block whitespace-nowrap ${screen === key ? 'font-semibold' : ''}`}><span className="text-slate-400 dark:text-slate-500 mr-1 tabular-nums">{i + 1}</span>{label}</span>
                <span className={`block whitespace-nowrap text-[11px] tabular-nums ${tone[t]}`}>{text}</span>
              </button>
            </React.Fragment>
          )
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 pb-1.5 text-xs">
        <div role="group" aria-label="Region" className="inline-flex rounded-md border border-slate-300 dark:border-slate-600 overflow-hidden">
          {view.regions.map(g => (
            <button key={g.region} type="button" aria-pressed={g.region === cg?.region} onClick={() => setRegion(g.region)}
              className={`px-3 py-1 ${ring} ${g.region === cg?.region ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700'}`}>
              {g.region}
            </button>
          ))}
        </div>
        {screen !== 'master' && (
          <select value={view.month.key} onChange={e => setMonth(e.target.value)} aria-label="Plan month"
            className={`px-1.5 py-1 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 ${ring}`}>
            {months.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        )}
      </div>
    </div>
  )
  return (
    <div className="space-y-3">
      {bar}
      {screen === 'campaign'
        ? <PlanningCampaign productions={productions} dispatches={dispatches} skus={skus} plants={plants} stored={stored}
            campaigns={campaigns} setCampaigns={props.setCampaigns} who={props.who} onOpenMaster={() => setScreen('master')} pick={pick} />
        : screen === 'weekly' || screen === 'monitor'
          ? <PlanningWeekPlan key={screen} mode={screen === 'monitor' ? 'monitor' : 'plan'} pick={pick} onOpenCampaign={() => setScreen('campaign')}
              productions={productions} dispatches={dispatches} skus={skus} plants={plants} stored={stored}
              coils={coils} babyCoils={babyCoils} campaigns={campaigns} setCampaigns={props.setCampaigns} who={props.who} />
          : <ProductionPlanning {...props} pick={pick} />}
    </div>
  )
}

function InventoryApp({ session, onLogout }) {
  const [dark, setDark] = useState(() => LS.get('jsw:dark') ?? false)
  // ── Who signed in decides what renders (ticket #126) ──
  // One pure function, one call site. Everything below reads `access` and never `session.role`
  // directly, so the rules stay in calc.js where they are tested and there is exactly one place to
  // change them. See accessFor's own comment for what this does NOT do — it is not a data boundary.
  const access = useMemo(() => accessFor(session), [session])
  const isReadOnly = useCallback((key) => access.readOnly.includes(key), [access])

  const [tab, setTab] = useState(access.tabs[0]?.key || 'dashboard')
  // ── Plant selector (tickets #121, #126) — one control in the header, applied globally. An admin
  // gets it and starts on All Plants, so every figure reads exactly as it did before #121;
  // switching it scopes EVERY tab at once — Dashboard, Coil Tracker, the three pipeline stages,
  // Dispatch, Orders, Sales and Reports. A plant user gets NO selector: their plant comes from
  // their login and is the only value this can hold.
  //
  // The pipeline stages used to be the exception, and it did not survive contact with the floor:
  // an admin who picked NPMD read NPMD on six tabs and the whole company on the three screens
  // where a coil's plant is actually recorded. Masters is still unscoped, and for a reason that
  // does not apply to the stages — a SKU catalog, a plant's service area and a distributor's
  // region are company-wide masters, not rows that sit at a plant.
  //
  // What the selector does NOT change is what the stages WRITE. Scope is display; the register
  // behind it stays whole (see `viewPlant` below).
  const [chosenPlant, setChosenPlant] = useState(access.plant)
  // The plant everything reads. A plant user's is pinned to their login — never derived from a
  // control they could be shown, because there is no such control to get wrong.
  const selectedPlant = access.plantSelector ? chosenPlant : access.plant
  const [coils, setCoils, coilsLoading] = useSupabaseStore('jsw:coils', [])
  const [babyCoils, setBabyCoils, babyCoilsLoading] = useSupabaseStore('jsw:babyCoils', [])
  const [productions, setProductions, productionsLoading] = useSupabaseStore('jsw:productions', [])
  const [dispatches, setDispatches, dispatchesLoading, replaceDispatches] = useSupabaseStore('jsw:dispatches', [])
  const [skus, setSkus, skusLoading] = useSupabaseStore('jsw:skus', DEFAULT_SKUS)
  const [orders, , ordersLoading, replaceOrders] = useSupabaseStore('jsw:orders', [])
  const [distributorEstimates, setDistributorEstimates] = useSupabaseStore('jsw:distributorEstimates', [])
  // State → region master. Falls back to the shipped seed while the table is empty, exactly as the
  // SKU master falls back to DEFAULT_SKUS; the seed is ALSO layered under the stored rows inside
  // stateRegionIndex, so a table holding one edited state cannot un-map the other five.
  const [stateRegions, setStateRegions] = useSupabaseStore('jsw:stateRegions', DEFAULT_STATE_REGIONS)
  // Plant + distributor masters (ticket #129). Both fall back to an EMPTY array rather than to their
  // code seed, because unlike state_regions the stored row is not the same shape as the seed: a
  // plants row holds a plant id and a service area, not an ERP code and a coil prefix. The seeds are
  // layered underneath inside calc.js (plantMaster / distributorRegionIndex), which is the only
  // place either shape is known — so an empty table reads as "nothing overridden", never as
  // "nothing serves anywhere".
  const [plants, setPlants] = useSupabaseStore('jsw:plants', [])
  const [distributors, setDistributors] = useSupabaseStore('jsw:distributors', [])
  // Planning master edits (ticket #279). Falls back to an EMPTY array: the 471-row seed is layered
  // underneath inside calc.js (planningMaster), so an empty table reads as the seed exactly.
  const [planningRows, setPlanningRows] = useSupabaseStore('jsw:planningMaster', [])
  // The monthly campaigns (#281): one row per region per month, each row's Indent and Planned.
  const [planningCampaigns, setPlanningCampaigns] = useSupabaseStore('jsw:planningCampaigns', [])

  const loading = coilsLoading || babyCoilsLoading || productionsLoading || dispatchesLoading || skusLoading || ordersLoading

  // Production weight is recomputed LIVE from the current SKU master (never the value frozen at
  // save-time), so fixing a SKU's weight flows through to every produced-tonnage view. See
  // resolveProductionWeights (calc.js) — non-destructive; stored rows are untouched.
  const resolvedProductions = useMemo(() => resolveProductionWeights(productions, skus, babyCoils), [productions, skus, babyCoils])

  // Scoped once here — the tabs that only READ these stores take them pre-filtered, so a plant
  // filter can never be applied inconsistently between them. The three pipeline stages are the
  // ones that WRITE, so they keep taking the raw arrays above and scope their own display instead
  // (`viewPlant` below) — same scope, applied where it cannot reach a setter or a guard.
  const plantCoils = useMemo(() => filterByPlant(coils, selectedPlant), [coils, selectedPlant])
  const plantBabyCoils = useMemo(() => filterByPlant(babyCoils, selectedPlant), [babyCoils, selectedPlant])
  const plantProductions = useMemo(() => filterByPlant(resolvedProductions, selectedPlant), [resolvedProductions, selectedPlant])
  const plantOrders = useMemo(() => filterByPlant(orders, selectedPlant), [orders, selectedPlant])
  const plantDispatches = useMemo(() => filterDispatchesByPlant(dispatches, selectedPlant), [dispatches, selectedPlant])
  // ── What the Plant-wise Tracker gets (ticket #174) ──
  // It ignores the header plant selector on purpose, so it takes the RAW stores rather than the
  // filtered ones above. It does NOT ignore the login boundary: a plant user has no selector, and
  // `plantCoils` & co. are already pinned to their one plant, so handing those over means the other
  // plants' tonnage never reaches the page at all — an absence in the data, not a rendering choice.
  // `trackerPlant` then tells the grid to drop the TOTAL block: a total that is one plant's numbers
  // repeated is noise. Both halves are driven by the same `access.plantSelector`, so nothing widens.
  // The LIVE plant master, not the compiled-in default: which blocks exist and what each is called
  // is the master's answer, so a plant renamed on the Masters tab is renamed here too.
  const plantMasterRows = useMemo(() => plantMaster(plants), [plants])
  const trackerPlant = access.plantSelector ? null : access.plant
  const trackerCoils = access.plantSelector ? coils : plantCoils
  const trackerBabyCoils = access.plantSelector ? babyCoils : plantBabyCoils
  const trackerProductions = access.plantSelector ? resolvedProductions : plantProductions
  const trackerDispatches = access.plantSelector ? dispatches : plantDispatches
  // The Dispatch tab's plant table (#232) is the same kind of comparison block, and needs the order
  // book too — raw for an admin, pinned for a plant login, under the same one switch.
  const trackerOrders = access.plantSelector ? orders : plantOrders

  // The plant named in the header subtitle. For an admin it follows the selector; for a plant user
  // it is the only plant they have, and is the ONLY place their plant is stated — which is why it
  // is not dropped when the selector is: without a selector the header would otherwise not say
  // which plant's numbers these are.
  //
  // The fallback matters more than it looks. An admin's value always comes from the options, so it
  // is always found. A PINNED value comes from the credential row and may match no plant master row
  // (blueprints/manage-app-login.md: fix the row, don't work around it) — and falling back to
  // "All Plants" there would tell someone scoped to nothing that they were looking at everything,
  // the exact opposite of the truth. So an unmatched pinned id shows the id itself: wrong-looking,
  // which is what it is, and it names the value to correct.
  const plantLabelForHeader = useMemo(() => {
    const option = plantFilterOptions().find(o => o.id === selectedPlant)
    if (option) return option.name
    return access.plantSelector ? 'All Plants' : selectedPlant
  }, [selectedPlant, access.plantSelector])

  // ── What the PIPELINE stages SHOW (ticket #126) ──
  // A plant user's plant is not a view they chose, it is where they are, so the stages must not
  // show them another plant's coils. But the stages are NOT handed filtered arrays to achieve it,
  // and the distinction is load-bearing rather than stylistic:
  //
  //   * They WRITE through the store setter. Slitting builds its next array from the prop and calls
  //     `setBabyCoils(updated)` outright, so a filtered prop makes `next` a strict subset of `prev`
  //     — and syncToSupabase reads every id in prev-but-not-next as a deletion. `baby_coils` is a
  //     HARD-delete table. One plant user saving one baby coil would have permanently deleted every
  //     other plant's.
  //   * They GUARD across stages. "A baby coil consumed by any production cannot be deleted", the
  //     duplicate-coil-id check, and the next-coil-number all have to see the WHOLE register to be
  //     true. Narrow the input and the guard silently stops guarding — worst for a legacy row whose
  //     plant is blank, which is exactly the row a duplicate HYD- id would collide with.
  //
  // So the stages keep receiving the raw stores, exactly as #121 and #124 left them, and each one
  // scopes only what it puts ON SCREEN. `viewPlant` is that scope, and it is simply
  // `selectedPlant` — the SAME value the other six tabs are scoped by. The stages used to be
  // handed `null` whenever a selector existed, which meant an admin who picked NPMD read NPMD
  // everywhere except the three screens where a coil's plant is actually recorded: Coil Inward,
  // Slitting and Production still listed Hyderabad. One control has to mean one thing, or the
  // header is telling the operator something the table below it contradicts.
  //
  // It is passed as the SENTINEL, not as a nullable id, so `filterByPlant` does the deciding:
  // ALL_PLANTS is its pass-through and '' (Unattributed) is a real scope. A `viewPlant ? … : rows`
  // test read Unattributed as falsy and quietly widened it back to every plant — the one selection
  // where "show me the rows nothing resolved to" matters most.
  // There is no `viewPlant` variable: it would be a second name for `selectedPlant` and a second
  // name is a second thing to keep in sync. The stages take it as a PROP called `viewPlant`, which
  // is where the name earns its keep — inside a stage it says "this scopes display, not state".
  const plantPinned = !access.plantSelector

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    LS.set('jsw:dark', dark)
  }, [dark])

  // Show loading spinner while fetching from Supabase
  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 dark:bg-slate-900">
      <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      <p className="mt-4 text-slate-500 dark:text-slate-400 text-sm">Loading inventory data...</p>
    </div>
  )

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900 transition-colors">
      {/* Header */}
      <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm">J</div>
              <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">JSW One Pipes & Tubes</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">Inventory Management — {plantLabelForHeader}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Offered to an admin only. A plant user has one plant and it is on their login,
                  so there is no control here to get wrong — the header names it instead. */}
              {access.plantSelector ? (
                <select
                  value={selectedPlant}
                  onChange={e => setChosenPlant(e.target.value)}
                  title="Scopes every tab to one plant — Dashboard, Coil Tracker, the three pipeline stages, Dispatch, Orders, Sales and Reports — and sets the plant a new Production consumes coils from"
                  aria-label="Plant"
                  className="px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100"
                >
                  {plantFilterOptions().map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : null}
              <button
                onClick={() => setDark(!dark)}
                className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Toggle dark mode"
              >
                {dark ? '☀️' : '🌙'}
              </button>
              <button
                onClick={onLogout}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Log out"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <SyncErrorBanner />

      {/* Tab Navigation */}
      <nav className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex gap-0 -mb-px">
            {access.tabs.map(t => (
              <button
                key={t.key} onClick={() => setTab(t.key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.key
                    ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {tab === 'dashboard' && <Dashboard coils={plantCoils} productions={plantProductions} dispatches={plantDispatches} skus={skus} babyCoils={plantBabyCoils} orders={plantOrders}
          trackerCoils={trackerCoils} trackerBabyCoils={trackerBabyCoils} trackerProductions={trackerProductions} trackerDispatches={trackerDispatches}
          trackerPlant={trackerPlant} trackerPlants={plantMasterRows} selectedPlant={selectedPlant} />}
        {tab === 'coilTracker' && <CoilTracker coils={plantCoils} productions={plantProductions} dispatches={plantDispatches} babyCoils={plantBabyCoils} plants={plantMasterRows} />}
        {tab === 'coilInward' && <CoilInward coils={coils} setCoils={setCoils} dispatches={dispatches} productions={resolvedProductions} babyCoils={babyCoils}
          operatingPlant={plantPinned ? selectedPlant : null} viewPlant={selectedPlant} />}
        {tab === 'slitting' && <Slitting coils={coils} babyCoils={babyCoils} setBabyCoils={setBabyCoils} productions={resolvedProductions} viewPlant={selectedPlant} />}
        {/* Production reads the RAW stores and scopes them itself (ticket #124): its plant filter is
            the batch's own plant — the operating plant for a new one, the record's stored plant when
            editing — so opening another plant's record never hides the coils it already consumed.
            The selector doubles as the operating plant until phase 3 puts it on the login, so it is
            passed under that name rather than as `selectedPlant`: inside Production it answers
            "which plant am I working as", not "which plant am I looking at". */}
        {tab === 'production' && <Production coils={coils} babyCoils={babyCoils} productions={resolvedProductions} setProductions={setProductions} dispatches={dispatches} skus={skus}
          operatingPlant={selectedPlant} viewPlant={selectedPlant} />}
        {tab === 'dispatch' && <Dispatch dispatches={plantDispatches} setDispatches={setDispatches} coils={plantCoils} skus={skus}
          plantScoped={selectedPlant !== ALL_PLANTS} canWiden={access.plantSelector}
          orders={plantOrders} productions={plantProductions}
          compareOrders={trackerOrders} compareDispatches={trackerDispatches} comparePlant={trackerPlant}
          stateRegions={stateRegions} plants={plants} distributors={distributors} selectedPlant={selectedPlant} />}
        {tab === 'skuMaster' && <Masters skus={skus} setSkus={setSkus} productions={productions}
          orders={orders} dispatches={dispatches} stateRegions={stateRegions}
          plants={plants} setPlants={setPlants} distributors={distributors} setDistributors={setDistributors}
          readOnly={isReadOnly('skuMaster')} />}
        {/* `productions`, `allDispatches` and `allOrders` stay the FULL unfiltered sets here — they
            feed the invoice upload's coil trace, its "left alone" count and its attribution
            (buildInvoiceDispatches), which must resolve against every plant's coils, records and
            orders regardless of what the header selector shows. An upload made while filtered to one
            plant would otherwise silently lose every other plant's coil trace, under-report what
            survived the window, and leave every other plant's lines reading `Unmapped`.
            `orders`/`dispatches` are the scoped display data; replaceOrders/replaceDispatches (the
            uploads' write path) are untouched. */}
        {tab === 'orders' && <Orders orders={plantOrders} allOrders={orders} replaceOrders={replaceOrders} dispatches={plantDispatches} allDispatches={dispatches} replaceDispatches={replaceDispatches} productions={resolvedProductions} skus={skus} setSkus={setSkus} readOnly={isReadOnly('orders')} />}
        {/* `estimates` and `stateRegions` stay UNFILTERED — Best Estimate is keyed by distributor
            and Region by state; neither carries a plant, and #117 puts a per-plant Best Estimate
            out of scope. `selectedPlant` goes in so the tab can withhold the BE comparisons that
            would otherwise divide one plant's invoiced by the whole company's plan. */}
        {tab === 'sales' && <SalesDashboard orders={plantOrders} dispatches={plantDispatches} skus={skus} productions={plantProductions}
          estimates={distributorEstimates} setEstimates={setDistributorEstimates}
          stateRegions={stateRegions} setStateRegions={setStateRegions}
          plants={plants} distributors={distributors}
          selectedPlant={selectedPlant} canWiden={access.plantSelector} />}
        {/* Reports follows the selector too (#121). `estimates`/`stateRegions` stay unfiltered for
            the same reason as Sales — neither carries a plant. A scoped workbook announces itself
            in its sheet titles and file name; see the Reports component.
            The one exception is the Inventory Snapshot (#214): it always covers all plants, so it
            takes the same arrays the Plant-wise Tracker does — the raw stores for an admin (the only
            role that sees Reports), still pinned for a plant login, so it can never widen one. */}
        {/* Production Planning (#278) is admin-only (#275) and region-wide, so it takes the RAW stores
            and ignores the header selector, as Masters does. Productions are the resolved ones the
            Dashboard reads, so Stock now is the Dashboard's FG figure. */}
        {tab === 'productionPlanning' && <ProductionPlanningTab productions={resolvedProductions} dispatches={dispatches} skus={skus} plants={plants} coils={coils} babyCoils={babyCoils}
          orders={orders} stored={planningRows} setStored={isReadOnly('productionPlanning') ? null : setPlanningRows}
          campaigns={planningCampaigns} setCampaigns={isReadOnly('productionPlanning') ? null : setPlanningCampaigns} who={session?.loginId || ''} />}
        {tab === 'reports' && <Reports skus={skus} productions={plantProductions} dispatches={plantDispatches} coils={plantCoils} babyCoils={plantBabyCoils} orders={plantOrders}
          estimates={distributorEstimates} stateRegions={stateRegions}
          plants={plants} distributors={distributors} selectedPlant={selectedPlant}
          allProductions={trackerProductions} allDispatches={trackerDispatches} allCoils={trackerCoils} allBabyCoils={trackerBabyCoils} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 py-4 mt-8">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-slate-400">
            JSW One Pipes & Tubes — Inventory Management System v1.0
            {' · '}Build <span className="font-mono">{__BUILD_SHA__}</span>
            {' · '}{__BUILD_TIME__}
          </p>
        </div>
      </footer>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// LOGIN GATE — the app is shown only after a correct login ID + password.
// The check runs against Supabase (verifyLoginDetails → the verify_login_details DB
// function); the password never reaches the browser. What comes back is WHO signed
// in — a login id, a role and a plant (ticket #125) — and that decides what the app
// shows (ticket #126, accessFor in calc.js). On success we remember the session on
// THIS device for ~30 days so the user isn't asked every visit. This guards the
// app UI, not the raw database. To change the login ID / password, or the login
// model, see blueprints/manage-app-login.md.
// ═══════════════════════════════════════════════════════════════
const AUTH_KEY = 'jsw:auth'

// A session is only a session if it also GRANTS something. Shape and rules are two questions and
// stay two functions, but a credential can pass the first and fail the second — a `plant` role
// whose plant column is NULL arrives as ALL_PLANTS, which is a well-formed session that accessFor
// correctly refuses to read as "every plant". Signing that user into an app with no tabs would
// present a credential to fix as a bug in the app.
const grantsAccess = (session) => !!session && accessFor(session).tabs.length > 0

// The stored session, or null. The shape rules — including "no role means this was stored before
// roles existed, so sign in once more" — live in parseStoredSession (calc.js), where they are
// tested; this is only the read. An invalid session is DELETED rather than left to be re-read and
// re-rejected on every visit, which is what makes the one-time re-authentication actually once.
function loadSession() {
  const session = parseStoredSession(LS.get(AUTH_KEY))
  if (!grantsAccess(session)) { LS.del(AUTH_KEY); return null }
  return session
}

export default function App() {
  const [session, setSession] = useState(loadSession)

  // Theme the login screen too: apply the saved dark-mode class on mount.
  // (InventoryApp owns the live toggle once the user is signed in.)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', LS.get('jsw:dark') ?? false)
  }, [])

  if (!session) return <LoginGate onSuccess={setSession} />

  // `key` remounts the whole app when a different user signs in on the same device, so no tab
  // selection, filter or form draft from the previous session survives into the next one.
  return <InventoryApp key={session.loginId} session={session}
    onLogout={() => { LS.del(AUTH_KEY); setSession(null) }} />
}

function LoginGate({ onSuccess }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (busy) return
    setError('')
    setBusy(true)
    try {
      // null = wrong login id or password. A THROW is a dead connection — the two must keep
      // reading differently on screen, or "the server is down" reads as "you typed it wrong".
      const who = await verifyLoginDetails(loginId.trim(), password)
      const session = who && parseStoredSession({ ...who, at: Date.now() })
      if (grantsAccess(session)) {
        LS.set(AUTH_KEY, session)
        onSuccess(session)
      } else if (who) {
        // The password was right, but the credential row cannot say what this user may do — a role
        // the app does not know, or a `plant` login with no plant. Nothing is guessed at: say what
        // is wrong and where it is fixed, rather than signing them into an app with no tabs.
        setError('This login is not set up correctly (no valid role or plant). Ask an administrator to fix it.')
        setPassword('')
      } else {
        setError('Invalid login ID or password.')
        setPassword('')
      }
    } catch {
      setError('Could not reach the server. Check your connection and try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-4 transition-colors">
      <form onSubmit={submit} className="w-full max-w-sm bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">J</div>
          <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight">JSW One Pipes & Tubes</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">Inventory Management — Hyderabad</p>
          </div>
        </div>

        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-4">Sign in to continue</h2>

        <label htmlFor="login-id" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Login ID</label>
        <input
          id="login-id"
          type="text"
          value={loginId}
          onChange={e => setLoginId(e.target.value)}
          autoFocus
          autoComplete="username"
          className="w-full mb-4 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Password</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          autoComplete="current-password"
          className="w-full mb-4 px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />

        {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={busy || !loginId.trim() || !password}
          className="w-full py-2 rounded-md bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}

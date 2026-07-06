import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useSupabaseStore } from './lib/db'
import {
  fmtT, fmtT3, genHRCoilId, tolerance, periodRange, inDateRange,
  weightPerPieceFromSku, resolveProductionWeights, buildReconciliationRows, coilInventoryRow,
  coilFifoAllocate, coilConsumption, dispatchCoilTrace,
  THICKNESS_TOL_MM, requiredStripWidth, WIDTH_TOL_MM, isOpenOrderStatus, skuInventoryRows, skuSizeLabel,
  canonicalSkuKey, salesKpis, salesByDistributor, salesByMonth,
  shippedByOrderLine, orderLineInvoiced, orderLineStage, distributorCode, dedupeDispatchLines, toISODate,
} from './lib/calc'
import DEFAULT_SKUS from './data/skus'
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
const CHART_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626', '#7c3aed', '#db2777', '#ea580c']
const CARD_COLORS = {
  indigo: 'text-indigo-600 dark:text-indigo-400',
  cyan: 'text-cyan-600 dark:text-cyan-400',
  emerald: 'text-emerald-600 dark:text-emerald-400',
  amber: 'text-amber-600 dark:text-amber-400',
}
// Dot fills for a Card's `parts` breakdown (matches CARD_COLORS above).
const DOT_COLORS = {
  indigo: 'bg-indigo-500',
  cyan: 'bg-cyan-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════
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
  const hasTotals = columns.some(c => c.total)
  const totals = useMemo(() => columns.map(c => c.total
    ? filtered.reduce((s, r) => s + Number((c.value ? c.value(r) : r[c.key]) || 0), 0)
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
function CoilInward({ coils, setCoils, dispatches, productions, babyCoils }) {
  const emptyForm = { dateOfInward: today(), hrCoilNo: '', inputCoilNumber: '', coilGrade: '', heatNumber: '', thickness: '', width: '', length: '', invoiceWeight: '', actualWeight: '', poNumber: '' }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const nextNo = useMemo(() => {
    const nums = coils.map(c => c.hrCoilNo)
    return nums.length ? Math.max(...nums) + 1 : 1
  }, [coils])

  const hrCoilId = useMemo(() => {
    const n = editId ? form.hrCoilNo : (form.hrCoilNo || nextNo)
    return form.dateOfInward && n ? genHRCoilId(form.dateOfInward, n) : ''
  }, [form.dateOfInward, form.hrCoilNo, nextNo, editId])

  const isDupe = useMemo(() => coils.some(c => c.hrCoilId === hrCoilId && c.id !== editId), [coils, hrCoilId, editId])

  const save = () => {
    const no = form.hrCoilNo || nextNo
    const record = { ...form, hrCoilNo: no, hrCoilId: genHRCoilId(form.dateOfInward, no), id: editId || uid(), deleted: false }
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
      alert(`Cannot delete ${row.hrCoilId}: it has been slit into ${slitInto.length} baby coil(s). Delete those baby coils first.`)
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
    { label: 'Input Coil #', key: 'inputCoilNumber' },
    { label: 'Grade', key: 'coilGrade' },
    { label: 'Thick (mm)', key: 'thickness' },
    { label: 'Width (mm)', key: 'width' },
    { label: 'Invoice Wt (T)', value: r => fmtT3(r.invoiceWeight) },
    { label: 'Actual Wt (T)', value: r => fmtT3(r.actualWeight) },
    { label: 'Dispatched Wt (T)', value: r => { const s = getCoilStats(r); return s.dispatchedWt > 0 ? fmtT3(s.dispatchedWt) : '' }, render: r => { const s = getCoilStats(r); return s.dispatchedWt > 0 ? <span>{fmtT3(s.dispatchedWt)}</span> : <span className="text-slate-400">—</span> } },
  ]

  const downloadCoilsCSV = () => {
    const header = ['HR Coil ID', 'Date', 'Input Coil #', 'Grade', 'Thickness (mm)', 'Width (mm)', 'Invoice Wt (T)', 'Actual Wt (T)', 'Dispatched Wt (T)']
    downloadCSV(`coil-inward-${today()}.csv`, header, coils.filter(c => !c.deleted).map(r => {
      const s = getCoilStats(r)
      return [r.hrCoilId, r.dateOfInward, r.inputCoilNumber, r.coilGrade, r.thickness, r.width, fmtT3(r.invoiceWeight), fmtT3(r.actualWeight), fmtT3(s.dispatchedWt)]
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 1: Coil Inward</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={downloadCoilsCSV} disabled={coils.filter(c => !c.deleted).length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ Add Coil'}</Btn>
        </div>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Coil' : 'Register New Mother Coil'}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date of Inward"><Input type="date" value={form.dateOfInward} onChange={v => f('dateOfInward', v)} /></Field>
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
            <Btn onClick={save} disabled={!hrCoilId || isDupe} variant="success">{editId ? 'Update' : 'Save Coil'}</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Registered Coils">
        <DataTable columns={columns} data={coils} onEdit={startEdit} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 2: SLITTING — mother coil → baby coils (manual; proportional weight/cost by width)
// ═══════════════════════════════════════════════════════════════
function Slitting({ coils, babyCoils, setBabyCoils, productions }) {
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
        weight: r.weight, hrCoilId: form.hrCoilId, dateOfConversion: form.dateOfConversion,
        consumed: !!form.consumed, deleted: false,
      }
      updated = babyCoils.map(b => b.id === editId ? record : b)
    } else {
      // Multi-add: one baby_coil record per valid row, all appended and saved together (the data
      // layer batches them into a single Supabase upsert).
      const newRecords = validRows.map(r => ({
        id: uid(), babyCoilEntry: r.letter, babyCoilId: r.babyCoilId,
        width: r.width, length: r.length,
        thickness: parentCoil?.thickness, poNumber: parentCoil?.poNumber,
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
    setForm({ dateOfConversion: row.dateOfConversion, hrCoilId: row.hrCoilId, babyCoilEntry: row.babyCoilEntry, consumed: !!row.consumed })
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
    if (confirm('Delete this baby coil?')) {
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
    return coils.filter(c => {
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
  }, [coils, babyCoils, editId, form.hrCoilId])

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
    if (dateFilter === 'all') return babyCoils
    if (dateFilter === 'custom') {
      return babyCoils.filter(b => {
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
    return babyCoils.filter(b => b.dateOfConversion >= cutoff)
  }, [babyCoils, dateFilter, customFrom, customTo])

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
  // Bulk-mark selected baby coils consumed / active (persists via setBabyCoils → Supabase).
  const bulkSetConsumed = (rowsToMark, val) => {
    const ids = new Set(rowsToMark.map(r => r.id))
    setBabyCoils(babyCoils.map(b => ids.has(b.id) ? { ...b, consumed: val } : b))
  }

  const columns = [
    { label: 'Date', key: 'dateOfConversion' },
    { label: 'Baby Coil ID', key: 'babyCoilId' },
    { label: 'HR Coil ID', key: 'hrCoilId' },
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
    { label: 'Consumed', value: r => r.consumed ? 'Consumed' : 'Active', render: r => <Badge ok={!r.consumed} text={r.consumed ? 'Consumed' : 'Active'} /> },
    { label: 'PO Number', key: 'poNumber' },
  ]

  const downloadBabyCoilsCSV = () => {
    const header = ['Date', 'Baby Coil ID', 'HR Coil ID', 'Thickness (mm)', 'Width (mm)', 'Weight (T)', 'PO Number']
    downloadCSV(`slitting-${today()}.csv`, header, displayedBabyCoils.map(r => [
      r.dateOfConversion, r.babyCoilId, r.hrCoilId, r.thickness, r.width, fmtT3(r.weight), r.poNumber,
    ]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 2: Slitting</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={downloadBabyCoilsCSV} disabled={displayedBabyCoils.length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => { if (showForm) resetForm(); else { setForm(emptyForm); setRows([{ _rid: uid(), width: '', length: '' }]); setEditId(null); setShowForm(true) } }}>{showForm ? 'Cancel' : '+ Add Baby Coil'}</Btn>
        </div>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Baby Coil' : 'Slit Mother Coil'}>
          {/* Mother coil is picked ONCE; thickness/PO are inherited from it. Searchable picker. */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date of Conversion"><Input type="date" value={form.dateOfConversion} onChange={v => f('dateOfConversion', v)} /></Field>
            <Field label="HR Coil ID">
              <SearchSelect value={form.hrCoilId}
                onChange={v => { f('hrCoilId', v); if (!editId) setRows([{ _rid: uid(), width: '', length: '' }]) }}
                options={coilOptions} placeholder="Search mother coil…" disabled={!!editId} />
            </Field>
            <Field label="Thickness (mm)" auto><Input value={parentCoil?.thickness ?? ''} disabled /></Field>
            <Field label="PO Number" auto><Input value={parentCoil?.poNumber ?? ''} disabled /></Field>
            {editId && (
              <Field label="Consumed">
                <label className="flex items-center gap-2 px-3 py-2">
                  <input type="checkbox" checked={!!form.consumed} onChange={e => f('consumed', e.target.checked)} className="rounded" />
                  <span className="text-sm text-slate-600 dark:text-slate-300">Mark consumed (hides from Production)</span>
                </label>
              </Field>
            )}
          </div>

          <div className="my-4 border-t border-slate-200 dark:border-slate-700" />

          {/* One row per baby coil; widths split the mother weight proportionally, saved together.
              Rows stack (labelled per field) on mobile and align to a single header row on md+. */}
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Baby Coils {editId ? '' : `(${validRows.length})`}</span>
            {!editId && <Btn size="sm" variant="ghost" onClick={addRow} disabled={!form.hrCoilId}>+ Add row</Btn>}
          </div>
          {/* Column headers — md+ only; per-field labels (below) cover mobile. */}
          <div className="hidden md:grid md:grid-cols-[7rem_7rem_4rem_1fr_7rem_3rem] gap-2 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Width (mm)</span><span>Length (mm)</span><span>Letter</span><span>Baby Coil ID</span><span>Weight (T)</span><span></span>
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
                  <Input value={r.letter || '—'} disabled aria-label="Baby coil letter" />
                </div>
                <div>
                  <label className="md:hidden block text-xs font-medium text-green-700 dark:text-green-400 mb-1">Baby Coil ID</label>
                  <Input value={r.babyCoilId || '—'} disabled aria-label="Baby Coil ID" />
                </div>
                <div>
                  <label className="md:hidden block text-xs font-medium text-green-700 dark:text-green-400 mb-1">Weight (T)</label>
                  <Input value={fmtT3(r.weight)} disabled aria-label="Weight (tonnes)" className="tabular-nums" />
                </div>
                {!editId
                  ? <div className="md:flex md:justify-center">
                      <Btn size="sm" variant="ghost" onClick={() => removeRow(i)} aria-label="Remove baby coil row" className="w-full md:w-auto min-h-[2.5rem]">✕<span className="md:hidden"> Remove</span></Btn>
                    </div>
                  : <div className="hidden md:block" />}
              </div>
            ))}
          </div>

          {parentCoil && widthCheck && (
            <div className={`mt-3 p-3 rounded-md ${widthCheck.tier === 'ok' ? 'bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800' : widthCheck.tier === 'warn' ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800' : 'bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800'}`}>
              <span className={`text-sm font-medium ${widthCheck.tier === 'ok' ? 'text-green-700 dark:text-green-400' : widthCheck.tier === 'warn' ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>
                Width Sum: {widthCheck.label} {widthCheck.tier === 'ok' ? '✔ OK (≤ Mother − 5 mm)' : widthCheck.tier === 'warn' ? '⚠ Over Mother − 5 mm (within mother width)' : '⚠ Exceeds mother coil width — please verify (save allowed)'}
              </span>
            </div>
          )}
          {isDupe && <div className="mt-2"><Badge ok={false} text="Duplicate Baby Coil ID!" /></div>}
          {overLetterLimit && <div className="mt-2"><Badge ok={false} text="Max 26 baby coils per mother coil (letters A–Z)" /></div>}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.hrCoilId || validRows.length === 0 || isDupe || overLetterLimit} variant="success">{editId ? 'Update' : `Save${validRows.length ? ` ${validRows.length}` : ''} Baby Coil${validRows.length === 1 ? '' : 's'}`}</Btn>
            <Btn variant="ghost" onClick={resetForm}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Baby Coils" actions={
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={babySearch} onChange={setBabySearch} placeholder="Search Baby Coil ID…" className="w-full sm:w-56" />
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
        <DataTable columns={columns} data={displayedBabyCoils} onEdit={startEdit} onDelete={softDelete}
          selectable
          bulkActions={[
            { label: 'Mark consumed', onClick: rowsToMark => bulkSetConsumed(rowsToMark, true) },
            { label: 'Mark active', onClick: rowsToMark => bulkSetConsumed(rowsToMark, false) },
          ]} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 3: PRODUCTION — tube production, FIFO-consumes BABY coils
// ═══════════════════════════════════════════════════════════════
function Production({ coils, babyCoils, productions, setProductions, dispatches, skus }) {
  const emptyForm = { dateOfProduction: today(), skuCode: '', tubeCount: '' }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [manualAlloc, setManualAlloc] = useState(null) // null ⇒ follow FIFO; else [{babyCoilId, pieces}]
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  const skuOptions = useMemo(() =>
    skus.filter(s => s.status === 'published').map(s => ({ value: s.skuCode, label: s.description || s.skuCode })),
  [skus])

  const sku = useMemo(() => skus.find(s => s.skuCode === form.skuCode), [skus, form.skuCode])
  const weightPerPiece = weightPerPieceFromSku(sku)
  const pieces = Math.max(0, Math.floor(Number(form.tubeCount || 0))) // whole tubes only, never negative
  const totalWeight = weightPerPiece * pieces

  // Width (mm) this tube needs from a coil; 0 when unknown (then the width filter is skipped).
  const reqWidth = useMemo(() => requiredStripWidth(sku), [sku])

  // Present baby coils in the shape coilFifoAllocate expects (FIFO key = babyCoilId,
  // capacity = baby weight, date = dateOfConversion). Thickness is inherited from the mother.
  // Narrow to coils whose slit width is within ±WIDTH_TOL_MM of the needed width (skip when
  // reqWidth is unknown); coilFifoAllocate then applies the ±0.3 mm thickness band on top, so
  // the FIFO suggestion is eligible only on width ±5 mm AND thickness ±0.3 mm.
  const babyAsCoils = useMemo(() => (babyCoils || [])
    .filter(b => !b.deleted && !b.consumed && (reqWidth <= 0 || Math.abs(Number(b.width || 0) - reqWidth) <= WIDTH_TOL_MM))
    .map(b => ({ hrCoilId: b.babyCoilId, thickness: b.thickness, actualWeight: b.weight, dateOfInward: b.dateOfConversion })),
  [babyCoils, reqWidth])

  // Weight already consumed from each BABY coil by other productions (exclude the edited one).
  const consumedByCoil = useMemo(() => coilConsumption(productions, editId, 'babyCoilId'), [productions, editId])

  // Live FIFO preview as the operator types (over baby coils). softFill 0.97 = advance to the
  // next coil at 97%, leaving the 97→100% and 100→105% bands for manual top-up / fallback.
  const rawAlloc = useMemo(() => coilFifoAllocate({
    coils: babyAsCoils, consumedByCoil, skuThickness: Number(sku?.thickness || 0), weightPerPiece, pieces, thickTolMm: THICKNESS_TOL_MM, softFill: 0.97,
  }), [babyAsCoils, consumedByCoil, sku, weightPerPiece, pieces])

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

  // Baby coils for the manual picker — only coils with more than 0.02 MT free are listed (so
  // exhausted coils don't clutter it), but it is NOT spec-filtered, so the operator can always
  // pick an off-spec coil. Coils matching BOTH width (±5 mm) and thickness (±0.3 mm) are flagged
  // (✓) and listed first; within each group sorted by MT available (descending). The label shows
  // thickness and width so coils are easy to read at a glance.
  const babyCoilOptions = useMemo(() => {
    const st = Number(sku?.thickness || 0)
    return (babyCoils || [])
      .filter(b => !b.deleted && !b.consumed)
      .map(b => {
        const free = Number(b.weight) - (consumedByCoil[b.babyCoilId]?.weight || 0)
        const diff = st > 0 ? Number(b.thickness) - st : 0
        const thickOk = st > 0 && Math.abs(diff) <= THICKNESS_TOL_MM
        const widthOk = reqWidth <= 0 || Math.abs(Number(b.width || 0) - reqWidth) <= WIDTH_TOL_MM
        const match = thickOk && widthOk
        const diffLabel = st > 0 ? ` (${diff > 0 ? '+' : ''}${diff.toFixed(2)}mm)` : ''
        return { value: b.babyCoilId, free, match,
          label: `${match ? '✓' : '•'} ${b.babyCoilId} · thk ${b.thickness}mm${diffLabel} · W ${b.width || '—'}mm · free ${fmtT(free)}/${fmtT(b.weight)}T` }
      })
      .filter(o => o.free > 0.02)
      .sort((a, b) => (a.match === b.match ? b.free - a.free : a.match ? -1 : 1))
  }, [babyCoils, sku, reqWidth, consumedByCoil])
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

  // Row editing — operates purely on the operator's explicit selection (manualAlloc). Each row
  // carries a stable _rid so the picker reliably shows the chosen coil as rows are added/removed.
  const baseRows = () => (manualAlloc ?? []).map(r => ({ _rid: r._rid || uid(), babyCoilId: r.babyCoilId, pieces: r.pieces }))
  const setRow = (i, key, val) => { const next = baseRows(); next[i] = { ...next[i], [key]: key === 'pieces' ? Math.max(0, Math.floor(Number(val || 0))) : val }; setManualAlloc(next) }
  const addRow = () => setManualAlloc([...baseRows(), { _rid: uid(), babyCoilId: '', pieces: 0 }])
  const removeRow = (i) => setManualAlloc(baseRows().filter((_, j) => j !== i))
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
      weightPerPiece,
      totalWeight,
      coilAllocations: allocations,
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
    setForm({ dateOfProduction: row.dateOfProduction, skuCode: row.skuCode, tubeCount: String(row.tubeCount) })
    setManualAlloc((row.coilAllocations || []).length ? row.coilAllocations.map(a => ({ _rid: uid(), babyCoilId: a.babyCoilId, pieces: Number(a.pieces || 0) })) : null)
    setEditId(row.id); setShowForm(true)
  }
  const softDelete = (row) => {
    if (confirm('Delete this production record? Coil capacity is released.')) setProductions(prev => prev.map(p => p.id === row.id ? { ...p, deleted: true } : p))
  }

  const canSave = !!form.skuCode && pieces > 0

  const allocatedOf = r => (r.coilAllocations || []).reduce((s, a) => s + Number(a.pieces || 0), 0)
  const sourceCoilsOf = r => (r.coilAllocations || []).filter(a => a.babyCoilId || a.hrCoilId).length
  const columns = [
    { label: 'Date', key: 'dateOfProduction' },
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
    const header = ['Date', 'SKU', 'Pieces', 'Wt/Piece (T)', 'Total Wt (T)', 'Allocated (pcs)', '# Source Coils', 'Assigned Coils', 'Status']
    downloadCSV(`production-${today()}.csv`, header, productions.filter(p => !p.deleted).map(r => [
      r.dateOfProduction, skuDesc(r.skuCode), r.tubeCount, fmtT3(r.weightPerPiece), fmtT(r.totalWeight),
      `${allocatedOf(r)} / ${r.tubeCount}`, sourceCoilsOf(r),
      (r.coilAllocations || []).map(a => `${a.babyCoilId || a.hrCoilId}×${a.pieces}`).join('; ') || '—', r.status,
    ]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 3: Production</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={downloadProductionsCSV} disabled={productions.filter(p => !p.deleted).length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => { if (showForm) cancelForm(); else openNew() }}>{showForm ? 'Cancel' : '+ Record Production'}</Btn>
        </div>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Production' : 'Record Production'}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Date of Production"><Input type="date" value={form.dateOfProduction} onChange={v => f('dateOfProduction', v)} /></Field>
            <Field label="SKU"><SearchSelect value={form.skuCode} onChange={v => { f('skuCode', v); setManualAlloc(null) }} options={skuOptions} placeholder="Search SKU..." /></Field>
            <Field label="No. of Pieces"><Input type="number" min="0" step="1" value={form.tubeCount} onChange={v => f('tubeCount', v === '' ? '' : Math.max(0, Math.floor(Number(v) || 0)))} /></Field>
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
                  Suggestion (FIFO · width ±5 mm · thickness ±0.3 mm · &gt;0.02 MT free)
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
                Assigned Baby Coils
              </span>
              <div className="flex gap-2">
                <Btn size="sm" variant="ghost" onClick={addRow} disabled={!sku}>+ Add coil</Btn>
                {enriched.length > 0 && <Btn size="sm" variant="ghost" onClick={clearAlloc}>✕ Clear</Btn>}
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {enriched.length === 0 && <span className="text-sm text-slate-400">No coil assigned yet — pick a coil or click “Use suggestion”.</span>}
              {enriched.map((r, i) => (
                <div key={r._rid} className="flex items-center gap-2">
                  <div className="flex-1"><SearchSelect value={r.babyCoilId} onChange={v => setRow(i, 'babyCoilId', v)} options={babyCoilOptions} placeholder="Search baby coil..." /></div>
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

          {/* Status badges (informational — never block save) */}
          <div className="mt-3 space-y-2">
            {pieces > 0 && allocatedPieces === 0 && babyCoilOptions.length === 0 && <Badge ok={false} text="No baby coils available (none slit, or all consumed/deleted). Production saved unallocated until a coil is slit." />}
            {pieces > 0 && allocatedPieces === 0 && babyCoilOptions.length > 0 && matchedCount === 0 && <Badge ok={false} text="No coil matching this tube's width (±5 mm) and thickness (±0.3 mm) — nothing to suggest, but you can pick an off-spec coil below (listed with its Δ thickness & width)." />}
            {pieces > 0 && allocatedPieces === 0 && matchedCount > 0 && <Badge ok={false} text="No coil assigned yet — pick a coil above or click “Use suggestion” (otherwise the production saves unallocated)." />}
            {unpickedRows && <Badge ok={false} text="A row has pieces entered but no coil selected — click a coil from the dropdown list (rows without a coil are NOT saved)." />}
            {allocatedPieces > 0 && allocatedPieces === pieces && !overCapacity && <Badge ok={true} text={`Fully allocated across ${sourceCoils} coil(s).`} />}
            {over105
              ? <Badge ok={false} text="A coil is filled beyond 105% of its capacity — allowed, but review the split." />
              : overCapacity && <Badge ok={true} text="A coil is in the 97–105% band — allowed (manual top-up past the 97% auto-advance)." />}
            {allocatedPieces > 0 && allocatedPieces < pieces && <Badge ok={false} text={`Shortfall: ${pieces - allocatedPieces} piece(s) not yet assigned to a coil. Saved as partial.`} />}
            {allocatedPieces > pieces && <Badge ok={false} text={`Over-assigned: ${allocatedPieces - pieces} more piece(s) allocated than produced — reduce a row.`} />}
          </div>

          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!canSave} variant="success">{editId ? 'Update' : 'Save Production'}</Btn>
            <Btn variant="ghost" onClick={cancelForm}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Production Records">
        <DataTable columns={columns} data={productions} onEdit={startEdit} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 4: DISPATCH — records uploaded from the "One Helix" invoice Excel export (Zoho). Rows
// are grouped into one dispatch per invoice; the SKU is matched by Item Name (== description)
// since the file has no MM ID, and each entry's coil trace is inherited from production FIFO
// (dispatchCoilTrace), so the Mother Coil trace and reconciliation export keep working with no
// manual coil picking. The import is idempotent per line (dedupeDispatchLines), so re-uploading
// the same/overlapping file never double-counts.
// ═══════════════════════════════════════════════════════════════
// Distributor-name column aliases for the ERP Excel importers (dispatch + orders). Headers
// are normalised (lowercased, spaces/dots/underscores stripped) before matching, so e.g.
// "Customer Name" → customername, "Sold To Party" → soldtoparty. Broadened so a non-standard
// distributor header no longer silently imports as a blank distributor. More specific names
// come first so they win over a bare "customer".
const DISTRIBUTOR_HEADER_ALIASES = [
  'distributorname', 'distributor', 'customername', 'customer', 'billtoname', 'billto',
  'partyname', 'party', 'consigneename', 'consignee', 'soldtoparty', 'soldtopartyname',
  'soldto', 'buyername', 'buyer', 'dealername', 'dealer', 'shiptoparty', 'shipto',
  'accountname', 'account',
]

function mapDispatchRow(row) {
  const norm = {}
  for (const k of Object.keys(row)) norm[k.toLowerCase().replace(/[.\s_]+/g, '')] = row[k]
  const pick = (...keys) => {
    for (const k of keys) if (norm[k] !== undefined && norm[k] !== '') return norm[k]
    return ''
  }
  const num = (v) => {
    if (v === '' || v === null || v === undefined) return ''
    const n = Number(String(v).replace(/[, ]/g, ''))
    return isNaN(n) ? '' : n
  }
  // "One Helix" invoice columns (case/spacing-insensitive): Invoice Date, Invoice Number,
  // Customer Name, Item Name (== SKU description), Quantity (MT), PurchaseOrder (== the order's
  // Child Order ID). No MM ID / Sku ID / pieces → SKU resolved by description, pieces derived
  // from weight. Legacy aliases kept so an older sheet still parses its shared fields.
  // Quantity is invoiced weight in MT (Usage unit = MT); only when the unit column clearly says
  // a piece count (NOS/PCS/…) do we treat Quantity as pieces instead.
  const unit = String(pick('usageunit', 'uom', 'unit')).trim().toUpperCase()
  const qtyIsPieces = /^(NOS?|PCS?|PC|PIECES?|EA|EACH)$/.test(unit)
  const qty = num(pick('quantity', 'invoicedqty', 'quantitymt', 'weightmt', 'weight', 'wt', 'doqty', 'netweight'))
  return {
    dateOfDispatch: toISODate(pick('invoicedate', 'dateofdispatch', 'dispatchdate', 'date')),
    invoiceNo:      String(pick('invoicenumber', 'invoiceno', 'invoice')).trim(),
    skuDescRaw:     String(pick('itemname', 'mmdescription', 'skudescription', 'description', 'item', 'product')).trim(),
    weight:         qtyIsPieces ? '' : qty,     // MT unless the unit column says pieces
    pieces:         qtyIsPieces ? qty : '',     // absent in the One Helix file → derived from weight
    customer:       String(pick(...DISTRIBUTOR_HEADER_ALIASES)).trim(),
    distributorCode: String(pick('distributorcode')).trim(),
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

// ── Build dispatch records from raw One Helix invoice rows. Extracted from the former Dispatch
// uploader so the combined "Upload Sales Excel" (Orders tab) reuses the EXACT invoice pipeline:
// resolve + self-heal SKUs (One Helix has no MM ID → match by description/canonical key), derive
// pieces from weight, de-dupe per line, inherit the FIFO coil trace, and group one dispatch per
// invoice. Pure — the caller applies setSkus (newCatalogSkus) and setDispatches. `existing` = the
// non-deleted dispatch records dedup runs against ([] for a clean full rebuild). ──
function buildDispatchRecords(rows, { skus, productions, existing = [] }) {
  // Keep product lines only: need an item description + qty; drop any Freight line.
  const parsed = rows.map(mapDispatchRow).filter(r =>
    r.skuDescRaw && !/freight/i.test(r.skuDescRaw) && (r.weight || r.pieces))
  if (!parsed.length) return { newRecords: [], newCatalogSkus: [], stats: { invoiceCount: 0, lineCount: 0, skippedDuplicateLines: [], unknownSkus: [], blankCustomer: 0, noRows: true } }

  // SKU resolution by exact description then canonical identity (One Helix has no MM ID). If the
  // live `skus` store lacks a SKU that the static catalog (DEFAULT_SKUS) knows, self-heal: use it
  // and hand it back in newCatalogSkus so the caller can persist it to the master.
  const byCode = new Map(skus.map(s => [s.skuCode, s]))
  const byDesc = new Map(skus.map(s => [(s.description || '').toLowerCase(), s]))
  const byKey = new Map(skus.map(s => [canonicalSkuKey(s), s]))
  const defByDesc = new Map(DEFAULT_SKUS.map(s => [(s.description || '').toLowerCase(), s]))
  const defByKey = new Map(DEFAULT_SKUS.map(s => [canonicalSkuKey(s), s]))
  const newCatalogSkus = []
  const resolve = (descRaw) => {
    const key = canonicalSkuKey(descRaw)
    let s = byDesc.get((descRaw || '').toLowerCase()) || (key && byKey.get(key))
    if (s) return s
    s = defByDesc.get((descRaw || '').toLowerCase()) || (key && defByKey.get(key))
    if (s && !byCode.has(s.skuCode)) { newCatalogSkus.push(s); byCode.set(s.skuCode, s) }
    return s || null
  }

  // Resolve each row to its SKU + weight/pieces FIRST, so the dedup key (invoiceNo | skuCode |
  // weight) is computed on the resolved code. Pieces are derived from weight (the file has none).
  const unknownSkus = new Set()
  const resolvedLines = parsed.map(r => {
    const sku = resolve(r.skuDescRaw)
    if (!sku) unknownSkus.add(r.skuDescRaw)
    const skuCode = sku?.skuCode || r.skuDescRaw
    const wpt = Number(sku?.weightPerTube || 0)
    let pieces = Number(r.pieces || 0)
    let weight = Number(r.weight || 0)
    if (!pieces && weight && wpt) pieces = Math.round((weight * 1000) / wpt)
    if (!weight && pieces && wpt) weight = (pieces * wpt) / 1000
    return { ...r, sku, skuCode, pieces, weight }
  })

  // Per-line idempotency: skip lines already stored and lines repeated within this file.
  const { toImport, skippedDuplicateLines } = dedupeDispatchLines(existing, resolvedLines)

  // Build entries with an incremental FIFO coil trace (entries built so far this batch count as
  // already-dispatched, so each line draws the next production pieces).
  const builtEntries = []
  const traceCtx = () => [...existing, { id: '__batch__', deleted: false, bundleEntries: builtEntries }]
  const records = {}
  let lineCount = 0
  toImport.forEach((r) => {
    const allocs = dispatchCoilTrace(r.skuCode, r.pieces, productions, traceCtx())
    const entry = {
      invoiceNo: r.invoiceNo, skuCode: r.skuCode, pieces: r.pieces, weight: r.weight,
      length: r.sku?.length || 6000, width: '', thickness: r.sku?.thickness ?? '',
      grade: r.grade || '', diameter: r.diameter || '', customer: r.customer || '',
      distributorCode: r.distributorCode || '', branchName: r.branchName || '', poRef: r.poRef || '',
      orderLineId: r.orderLineId || '', orderId: r.orderId || '', childOrderId: r.childOrderId || '',
      coilAllocations: allocs, traceHrCoilId: allocs[0]?.hrCoilId || '',
    }
    builtEntries.push(entry); lineCount++
    // One dispatch per invoice; blank-invoice fallback is index-free so re-uploads group identically.
    const key = r.invoiceNo || `__noinv__|${r.dateOfDispatch}|${String(r.customer || '').trim().toUpperCase()}`
    if (!records[key]) records[key] = {
      id: uid(), dateOfDispatch: r.dateOfDispatch, vehicleNo: r.vehicleNo || '',
      vehicleWeight: r.vehicleWeight || '', invoiceNo: r.invoiceNo,
      bundleEntries: [], selectedBundles: [], theoreticalWeight: 0, variance: 0, deleted: false,
    }
    records[key].bundleEntries.push(entry)
  })
  const newRecords = Object.values(records).map(d => {
    const theo = d.bundleEntries.reduce((s, e) => s + Number(e.weight || 0), 0)
    return { ...d, selectedBundles: d.bundleEntries, theoreticalWeight: theo, variance: d.vehicleWeight ? Number(d.vehicleWeight) - theo : 0 }
  })
  const blankCustomer = builtEntries.filter(e => !e.customer).length
  return {
    newRecords, newCatalogSkus,
    stats: { invoiceCount: newRecords.length, lineCount, skippedDuplicateLines, unknownSkus: [...unknownSkus], blankCustomer, noRows: false },
  }
}

// ── Stage 4 Dispatch — now a records + reconciliation VIEW. Dispatch data arrives via the daily
// "Upload Sales Excel" (Orders tab), which feeds the Invoice sheet through buildDispatchRecords.
function Dispatch({ dispatches, setDispatches, coils, skus }) {
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  const softDelete = (row) => {
    if (confirm('Delete this dispatch record?')) setDispatches(prev => prev.map(d => d.id === row.id ? { ...d, deleted: true } : d))
  }

  // Invoice Reconciliation CSV — one row per (dispatch date × invoice × SKU). Reports
  // quantity, the Mother Coil trace, and the SKU conversion/ladder rates. Logic in calc.js.
  const downloadReconciliationCSV = () => {
    const rows = buildReconciliationRows(dispatches, coils, skus)
    const header = ['Date of Dispatch', 'Invoice No.', 'Customer', 'SKU', 'Grade', 'Quantity (MT)', 'Mother Coil', 'Conversion Cost/MT', 'Ladder Cost/MT']
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
    { label: 'SKUs', value: r => skuLines(r).map(l => skuDesc(l.skuCode)).join(' '), render: r => stack(r, l => skuDesc(l.skuCode)) },
    { label: 'Pieces', value: r => (r.bundleEntries || []).reduce((s, b) => s + Number(b.pieces || 0), 0), render: r => stack(r, l => l.pieces) },
    { label: 'Weight (T)', value: r => r.theoreticalWeight, render: r => stack(r, l => fmtT(l.weight)) },
  ]

  const downloadDispatchRecordsCSV = () => {
    const header = ['Date', 'Invoice No(s).', 'Customer', 'SKUs', 'Pieces', 'Weight (T)']
    downloadCSV(`dispatch-records-${today()}.csv`, header, dispatches.filter(d => !d.deleted).map(r => [
      r.dateOfDispatch, invoiceList(r), r.customer || '', [...new Set((r.bundleEntries || []).map(b => skuDesc(b.skuCode)))].join('; '),
      (r.bundleEntries || []).reduce((s, b) => s + Number(b.pieces || 0), 0), fmtT(r.theoreticalWeight),
    ]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 4: Dispatch</h2>
        <Btn variant="ghost" onClick={downloadDispatchRecordsCSV} disabled={dispatches.filter(d => !d.deleted).length === 0}>⬇ Download CSV</Btn>
      </div>

      <p className="text-xs text-slate-400">
        Dispatch (invoice) data is loaded from the daily <strong>Upload Sales Excel</strong> on the
        Orders tab (the workbook's <strong>Invoice</strong> sheet). One dispatch per invoice; SKUs
        matched by Item Name, coil trace &amp; cost inherited from Production FIFO. This view is
        read-only — Dispatch Records + the Invoice Reconciliation export below.
      </p>

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Invoice cost reconciliation export — one row per dispatch date × invoice × SKU</h3>
        <Btn variant="ghost" onClick={downloadReconciliationCSV} disabled={dispatches.filter(d => !d.deleted).length === 0}>
          Download Invoice Reconciliation (CSV)
        </Btn>
      </div>

      <Section title="Dispatch Records">
        <DataTable columns={columns} data={dispatches} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SKU MASTER
// ═══════════════════════════════════════════════════════════════
function SKUMaster({ skus, setSkus, productions }) {
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
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">SKU Master</h2>
        <Btn onClick={() => { setForm(emptySku); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ Add SKU'}</Btn>
      </div>

      {showForm && (
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
        <DataTable columns={columns} data={skus} onEdit={startEdit} onDelete={deleteSku} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════
const STAGE_BADGE = {
  Inward: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300',
  Produced: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  Dispatch: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
}

function Dashboard({ coils, productions, dispatches, skus, babyCoils, orders }) {
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
  const monthOptions = useMemo(() => {
    const dates = [
      ...ac.map(c => c.dateOfInward), ...ap.map(p => p.dateOfProduction),
      ...ad.map(d => d.dateOfDispatch), ...(orders || []).filter(o => !o.deleted).map(o => o.orderDate),
    ].filter(Boolean)
    const minKey = (dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : todayStr).slice(0, 7)
    const out = []
    const d = new Date(todayStr.slice(0, 7) + '-01T00:00:00Z')
    const floor = new Date(minKey + '-01T00:00:00Z')
    while (d >= floor && out.length < 36) {
      const key = d.toISOString().slice(0, 7)
      out.push({ key, label: monthLabel(key) })
      d.setUTCMonth(d.getUTCMonth() - 1)
    }
    return out
  }, [ac, ap, ad, orders, todayStr])

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
    const babyLeft = activeBaby.reduce((s, b) =>
      s + Math.max(0, Number(b.weight || 0) - Number(consumedBaby[b.babyCoilId]?.weight || 0)), 0)
    return { totalInward, fullDispatchedWt, fullDispatchedN, babyLeft, fullCoilLeft }
  }, [ac, ap, babyCoils, dispByCoil])

  // ── SKU-wise inventory (all MT, no pieces). Per SKU: totalOrders, totalInvoiced,
  // pendingDispatch (Confirmed + Non-confirmed — same as the Dashboard "Pending to Dispatch"),
  // inventory (produced − invoiced), free (inventory − reserved). Union of stocked ∪ ordered SKUs;
  // negative-free rows sort first. ──
  const skuRows = useMemo(() => skuInventoryRows(ap, ad, orders, skus, inRange), [ap, ad, orders, skus, inRange])

  const skuTotals = useMemo(() => skuRows.reduce(
    (t, r) => ({
      totalOrders: t.totalOrders + r.totalOrders, totalInvoiced: t.totalInvoiced + r.totalInvoiced,
      invoicedVsOrders: t.invoicedVsOrders + r.invoicedVsOrders,
      pendingDispatch: t.pendingDispatch + r.pendingDispatch, inventory: t.inventory + r.inventory,
      reserved: t.reserved + r.reserved, free: t.free + r.free,
    }),
    { totalOrders: 0, totalInvoiced: 0, invoicedVsOrders: 0, pendingDispatch: 0, inventory: 0, reserved: 0, free: 0 }
  ), [skuRows])

  // SKU-wise inventory table filter helpers — Type (SHS/RHS/CHS) and Size (e.g. 150x150 / 32 NB)
  // come from the SKU master, falling back to the description. The DataTable handles the actual
  // filtering + per-column totals; the FG metric cards below stay over ALL SKUs (skuTotals).
  const skuTypeOf = useCallback((code, desc) => skus.find(s => s.skuCode === code)?.productType
    || (/\b(SHS|RHS|CHS)\b/i.exec(desc || '')?.[1]?.toUpperCase() ?? ''), [skus])
  const skuSizeOf = useCallback((code, desc) =>
    skuSizeLabel(skus.find(s => s.skuCode === code), desc), [skus])
  const redIfNeg = (v) => <span className={Number(v) < 0 ? 'text-red-600 font-semibold' : ''}>{fmtT(v)}</span>

  // Columns + filters for the SKU-wise Inventory DataTable (Excel-like). Production / Reserved /
  // Inventory / Free are live; Pending to Dispatch follows the period filter. Free = Inventory − Reserved.
  const skuInvCols = [
    { label: 'SKU Code', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'Production (T)', value: r => r.production, render: r => fmtT(r.production), total: v => fmtT(v) },
    { label: 'Pending to Dispatch (T)', value: r => r.pendingDispatch, render: r => fmtT(r.pendingDispatch), total: v => fmtT(v) },
    { label: 'Reserved (T)', value: r => r.reserved, render: r => fmtT(r.reserved), total: v => fmtT(v) },
    { label: 'Inventory (T)', value: r => r.inventory, render: r => fmtT(r.inventory), total: v => fmtT(v) },
    { label: 'Free Inventory (T)', value: r => r.free, render: r => redIfNeg(r.free), total: v => redIfNeg(v) },
  ]
  const skuInvFilters = [
    { key: 'type', label: 'Type', accessor: r => skuTypeOf(r.skuCode, r.description), options: ['SHS', 'RHS', 'CHS'] },
    { key: 'size', label: 'Size', accessor: r => skuSizeOf(r.skuCode, r.description) },
    { key: 'inv', label: 'Inventory', accessor: r => r.inventory > 0 ? 'In stock' : r.inventory < 0 ? 'Negative' : 'Zero', options: ['In stock', 'Zero', 'Negative'] },
    { key: 'reserved', label: 'Reserved', accessor: r => r.reserved > 0 ? 'Reserved' : 'None', options: ['Reserved', 'None'] },
  ]
  // Live filtered/searched/sorted rows of the SKU-wise Inventory table, so the CSV exports the on-screen view.
  const skuInvExportRef = useRef([])

  // ── FG metrics (all MT) — totals reconcile with the SKU table ──
  const fgLeft = skuTotals.inventory
  const fgReserved = skuTotals.reserved
  const freeFg = skuTotals.free

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
    const overDispatched = skuRows.filter(r => r.inventory < -0.05)
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
      ['Mother Coil', 'Grade', 'Thickness (mm)', 'Width (mm)', 'Actual Wt (T)', 'Raw Remaining (T)', 'Ready Wt (T)', 'Dispatched Wt (T)'],
      rows)
  }

  const downloadSkuCSV = () => {
    downloadCSV(`sku-report-${todayStr}.csv`,
      ['SKU Code', 'Description', 'Production (T)', 'Pending to Dispatch (T)', 'Reserved (T)', 'Inventory (T)', 'Free Inventory (T)'],
      skuInvExportRef.current.map(r => [r.skuCode, r.description, fmtT(r.production), fmtT(r.pendingDispatch), fmtT(r.reserved), fmtT(r.inventory), fmtT(r.free)]))
  }

  return (
    <div className="space-y-6">
      {/* Header: title + period filter + stock export — sticky just below the app header */}
      <div className="sticky top-16 z-30 flex flex-wrap items-center justify-between gap-3
        -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3
        bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Dashboard</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100">
            <option value="all">All Time</option>
            <option value="7d">Last 7 Days</option>
            <option value="mtd">Month to Date</option>
            <option value="month">Month…</option>
            <option value="custom">Custom Range</option>
          </select>
          {period === 'month' && (
            <select value={monthSel} onChange={e => setMonthSel(e.target.value)}
              className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100">
              {monthOptions.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
            </select>
          )}
          {period === 'custom' && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)}
                className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
              <span className="text-sm text-slate-500">to</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)}
                className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
            </>
          )}
          <Btn size="sm" variant="ghost" onClick={downloadStockCSV}>⬇ Stock CSV</Btn>
        </div>
      </div>

      {/* Sales (MT) — the SAME KPIs as the Sales dashboard (Confirmed / Non-confirmed are the
          carried-forward snapshot; MTD Invoice = current month). Both screens use salesKpis, with
          Pending to Dispatch broken into its Confirmed + Non-confirmed parts. */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Sales — {monthLabel(todayStr.slice(0, 7))}</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card title="Total Orders" value={`${fmtT(sales.totalOrders)} T`} sub="Invoiced + Confirmed + Non-conf." color="indigo" />
          <Card title="Pending to Dispatch" value={`${fmtT(sales.pending)} T`} color="amber"
            parts={[
              { label: 'Confirmed', value: `${fmtT(sales.confirmed)} T`, color: 'emerald' },
              { label: 'Non-confirmed', value: `${fmtT(sales.nonConfirmed)} T`, color: 'cyan' },
            ]} />
          <Card title="MTD Invoice" value={`${fmtT(sales.mtdInvoice)} T`} sub="Invoiced this month" color="emerald" />
        </div>
      </div>

      {/* Activity (MT) — scoped to the selected period */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Activity — {periodLabel}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="Coil Inward" value={`${fmtT(activity.coilInward)} T`} sub="Mother coil received" />
          <Card title="Produced" value={`${fmtT(activity.produced)} T`} sub="Tubes produced" color="cyan" />
        </div>
      </div>

      {/* Coil metrics (MT) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Coil</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="Total Coil Inward" value={`${fmtT(coil.totalInward)} T`} sub="All mother coil received" />
          <Card title="Full Coil Dispatched" value={`${fmtT(coil.fullDispatchedWt)} T`} sub={`${coil.fullDispatchedN} coil(s) ≥95% dispatched`} color="emerald" />
          <Card title="Baby Coils Left" value={`${fmtT(coil.babyLeft)} T`} sub="Slit, not yet produced" color="cyan" />
          <Card title="Full Coil Left" value={`${fmtT(coil.fullCoilLeft)} T`} sub="Whole, unslit coils" color="amber" />
        </div>
      </div>

      {/* Finished Goods metrics (MT) */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Finished Goods (FG)</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="FG Left Inventory" value={`${fmtT(fgLeft)} T`} sub="Produced − invoiced" />
          <Card title="FG Reserved" value={`${fmtT(fgReserved)} T`} sub="Released − invoiced (committed)" color="cyan" />
          <Card title="Free FG" value={`${fmtT(freeFg)} T`} sub="Inventory − reserved" color="amber" />
        </div>
      </div>

      {/* SKU-wise Inventory (MT) — Excel-like, static header; negative free inventory highlighted.
          Columns: Production / Pending to Dispatch / Reserved / Inventory / Free Inventory. */}
      <Section title="SKU-wise Inventory" actions={
        <Btn size="sm" variant="ghost" onClick={downloadSkuCSV}>⬇ SKU CSV</Btn>
      }>
        {skuRows.length > 0 ? (
          <>
            <DataTable columns={skuInvCols} data={skuRows} filters={skuInvFilters}
              exportRef={skuInvExportRef}
              highlightRow={r => r.free < 0} highlightClass="bg-red-50 dark:bg-red-900/30"
              excel maxHeight="60vh" totalsLabel="TOTAL" />
            <p className="mt-2 text-xs text-slate-400">
              <strong>Pending to Dispatch</strong> = Confirmed + Non-confirmed (same as the Dashboard card);
              <strong> Reserved</strong> = released − invoiced for active orders (not delivered/cancelled);
              <strong> Free Inventory</strong> = Inventory − Reserved (negative ⇒ over-committed, red).
              Production / Reserved / Inventory are live; Pending to Dispatch follows the period filter.
            </p>
          </>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No SKU activity yet</p>}
      </Section>

      {/* Production & Dispatch Trend (all-time; daily ≤31 days, else weekly) */}
      <Section title={`Production & Dispatch Trend — ${periodLabel}${trend.weekly ? ' (weekly)' : ''}`}>
        {trend.data.some(d => d.produced > 0 || d.dispatched > 0) ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={trend.data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => `${fmtT(v)}T`} />
              <Legend />
              <Bar dataKey="produced" name="Produced (T)" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="dispatched" name="Dispatched (T)" fill="#059669" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No production or dispatch activity in this period</p>}
      </Section>

      {/* Alerts */}
      <Section title={`Alerts & Warnings (${alerts.length})`}>
        {alerts.length === 0 ? (
          <p className="text-sm text-green-600 dark:text-green-400">All clear — no warnings</p>
        ) : (
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {alerts.map((a, i) => (
              <div key={i} className={`flex items-start gap-2 p-3 rounded-md ${a.type === 'error' ? 'bg-red-50 dark:bg-red-900/30' : 'bg-yellow-50 dark:bg-yellow-900/30'}`}>
                <span>{a.type === 'error' ? '🔴' : '🟡'}</span>
                <span className="text-sm text-slate-700 dark:text-slate-300">{a.msg}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Recent Activity */}
      <Section title="Recent Activity">
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No activity yet</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-700">
            {recentActivity.map((e, i) => (
              <li key={i} className="py-2.5 flex items-center gap-3">
                <span className={`shrink-0 inline-flex px-2 py-0.5 rounded text-xs font-medium ${STAGE_BADGE[e.stage]}`}>{e.stage}</span>
                <span className="text-sm text-slate-700 dark:text-slate-300 flex-1">{e.msg}</span>
                <span className="text-xs text-slate-400 shrink-0">{e.date}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// COIL TRACKER
// ═══════════════════════════════════════════════════════════════
const STAGE_NAMES = ['Inward', 'Produced', 'Dispatched']
const STAGE_COLORS = ['#4f46e5', '#0891b2', '#dc2626']

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

function CoilTracker({ coils, productions, dispatches, babyCoils }) {
  const [selectedCoilId, setSelectedCoilId] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const active = (arr) => (arr || []).filter(x => !x.deleted)
  const ac = active(coils), ap = active(productions), ad = active(dispatches), ab = active(babyCoils)

  // ── Baby coils with live consumption: % used, weight consumed, free, and the manual
  // "Consumed" flag. Consumption is summed from production coilAllocations keyed by babyCoilId. ──
  const consumedByBaby = useMemo(() => coilConsumption(productions, null, 'babyCoilId'), [productions])
  const babyRows = useMemo(() => ab.map(b => {
    const cap = Number(b.weight || 0)
    const used = consumedByBaby[b.babyCoilId]?.weight || 0
    const free = cap - used
    const pct = cap > 0 ? (used / cap) * 100 : 0
    return { ...b, used, free, pct, statusLabel: b.consumed ? 'Consumed' : 'Active' }
  }), [ab, consumedByBaby])
  const babyColumns = [
    { label: 'Baby Coil ID', key: 'babyCoilId' },
    { label: 'Mother (HR Coil ID)', key: 'hrCoilId' },
    { label: 'Date of Conversion', key: 'dateOfConversion' },
    { label: 'Width (mm)', key: 'width' },
    { label: 'Thick (mm)', key: 'thickness' },
    { label: 'Weight (T)', value: r => fmtT3(r.weight), render: r => <span className="tabular-nums">{fmtT3(r.weight)}</span> },
    { label: 'Used (T)', value: r => fmtT3(r.used), render: r => <span className="tabular-nums">{fmtT3(r.used)}</span> },
    { label: 'Free (T)', value: r => fmtT3(r.free), render: r => <span className="tabular-nums">{fmtT3(r.free)}</span> },
    { label: '% Used', value: r => r.pct, render: r => <span className={`tabular-nums font-medium ${r.pct >= 97 ? 'text-red-600 dark:text-red-400' : ''}`}>{r.pct.toFixed(1)}%</span> },
    { label: 'Status', value: r => r.statusLabel, render: r => <Badge ok={!r.consumed} text={r.statusLabel} /> },
  ]
  const babyFilters = [
    { key: 'mother', label: 'Mother', accessor: r => r.hrCoilId },
    { key: 'status', label: 'Status', accessor: r => r.statusLabel },
    { key: 'thickness', label: 'Thickness', accessor: r => String(r.thickness ?? '') },
    { key: 'width', label: 'Width', accessor: r => String(r.width ?? '') },
  ]
  const motherBabies = useMemo(() => babyRows.filter(r => r.hrCoilId === selectedCoilId), [babyRows, selectedCoilId])

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
  const babyExportRef = useRef([])
  const downloadStockCSV = () => downloadCSV(`coil-stock-${today()}.csv`,
    ['Coil ID', 'Grade', 'Thickness (mm)', 'Width (mm)', ...SUMMARY_HEADERS.slice(2), 'Status'],
    motherExportRef.current.map(r => [r.hrCoilId, r.grade || '', r.thickness ?? '', r.width ?? '',
      ...SUMMARY_COLS.map(col => col.fmt === 'wt' ? fmt2(r[col.key]) : fmtCount(r[col.key])), r.status]))
  const downloadBabyCoilsCSV = () => downloadCSV(`baby-coils-${today()}.csv`,
    ['Baby Coil ID', 'Mother (HR Coil ID)', 'Date of Conversion', 'Width (mm)', 'Thick (mm)', 'Weight (T)', 'Used (T)', 'Free (T)', '% Used', 'Status'],
    babyExportRef.current.map(r => [r.babyCoilId, r.hrCoilId, r.dateOfConversion, r.width ?? '', r.thickness ?? '',
      fmtT3(r.weight), fmtT3(r.used), fmtT3(r.free), r.pct.toFixed(1), r.statusLabel]))

  // ── Selected coil journey ──
  const selectedCoil = ac.find(c => c.hrCoilId === selectedCoilId)
  const journey = useMemo(() => {
    if (!selectedCoil) return null
    // A record "touches" this coil via its coilAllocations (new) or trace (legacy).
    const touches = (rec, fallbackId) => (rec.coilAllocations && rec.coilAllocations.length)
      ? rec.coilAllocations.some(a => a.hrCoilId === selectedCoilId)
      : fallbackId === selectedCoilId
    // Dispatch lines drawn from this coil; pieces/weight scoped to this coil's share.
    const dispEntries = ad.flatMap(d => (d.bundleEntries || []).map(be => ({ ...be, dateOfDispatch: d.dateOfDispatch, vehicleNo: d.vehicleNo, invoiceNo: be.invoiceNo || d.invoiceNo })))
      .filter(be => touches(be, be.traceHrCoilId))
      .map(be => {
        const allocs = (be.coilAllocations && be.coilAllocations.length) ? be.coilAllocations : (be.traceHrCoilId ? [{ hrCoilId: be.traceHrCoilId, pieces: be.pieces, weight: be.weight }] : [])
        const mine = allocs.filter(a => a.hrCoilId === selectedCoilId)
        return { ...be, pieces: mine.reduce((s, a) => s + Number(a.pieces || 0), 0), weight: mine.reduce((s, a) => s + Number(a.weight || 0), 0) }
      })

    // Production weight made from this coil.
    const totalProducedWt = ap.flatMap(p => p.coilAllocations || [])
      .filter(a => a.hrCoilId === selectedCoilId)
      .reduce((s, a) => s + Number(a.weight || 0), 0)

    const totalDispatchWt = dispEntries.reduce((s, be) => s + Number(be.weight || 0), 0)

    // Stage reached: 0=Inward, 1=Produced, 2=Dispatched
    const stageReached = totalDispatchWt > 0 ? 2 : totalProducedWt > 0 ? 1 : 0

    return { dispEntries, totalProducedWt, totalDispatchWt, stageReached }
  }, [selectedCoil, selectedCoilId, ap, ad])

  // ── Weight flow chart data ──
  const weightFlowData = useMemo(() => {
    if (!selectedCoil || !journey) return []
    return [
      { name: 'Mother Coil', weight: Number(selectedCoil.actualWeight || 0) },
      { name: 'Produced', weight: journey.totalProducedWt },
      { name: 'Dispatched', weight: journey.totalDispatchWt },
    ]
  }, [selectedCoil, journey])

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Coil Tracker</h2>

      {/* ── Section 1: Inventory Summary (filterable DataTable; TOTAL row replaces the old subtotal) ── */}
      <Section title={`Inventory Summary — All Coils (${inventorySummary.length})`} actions={
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Period:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
          <span className="text-sm text-slate-500">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
          <Btn size="sm" variant="ghost" onClick={downloadStockCSV} disabled={!inventorySummary.length}>⬇ Stock CSV</Btn>
        </div>
      }>
        <DataTable columns={motherColumns} data={inventorySummary} filters={motherFilters}
          exportRef={motherExportRef} excel maxHeight="24rem" totalsLabel="TOTAL"
          onRowClick={r => setSelectedCoilId(r.hrCoilId)}
          highlightRow={r => r.hrCoilId === selectedCoilId} />
      </Section>

      {/* ── Section 2: Coil Journey Detail ── */}
      {selectedCoil && journey && (
        <>
          {/* 2a: Coil Info Header */}
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
              Journey: {selectedCoilId}
            </h3>
            <Btn size="sm" variant="ghost" onClick={() => setSelectedCoilId(null)}>Clear Selection</Btn>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Card title="Coil ID" value={selectedCoilId} sub={`Grade: ${selectedCoil.coilGrade || '—'}`} />
            <Card title="Dimensions" value={`${selectedCoil.thickness || '—'} × ${selectedCoil.width || '—'} mm`} sub={`PO: ${selectedCoil.poNumber || '—'}`} color="cyan" />
            <Card title="Actual Weight" value={`${fmtT(selectedCoil.actualWeight)} T`} sub={`Invoice: ${fmtT(selectedCoil.invoiceWeight)} T`} color="emerald" />
          </div>

          {/* 2b: Stage Progress Bar */}
          <Section title="Stage Progress">
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {STAGE_NAMES.map((name, i) => {
                const reached = i <= journey.stageReached
                const isCurrent = i === journey.stageReached
                const stageValues = [
                  `${fmtT(selectedCoil.actualWeight)} T`,
                  `${fmtT(journey.totalProducedWt)} T`,
                  `${fmtT(journey.totalDispatchWt)} T`,
                ]
                const color = reached ? (isCurrent ? '#d97706' : '#059669') : '#94a3b8'
                return (
                  <React.Fragment key={name}>
                    <div className="flex-1 min-w-[130px] text-center p-4 rounded-lg" style={{ backgroundColor: `${color}15`, borderLeft: `4px solid ${color}` }}>
                      <p className="text-xs font-medium uppercase tracking-wider" style={{ color }}>{name}</p>
                      <p className="text-sm font-semibold mt-1 text-slate-700 dark:text-slate-300">{stageValues[i]}</p>
                    </div>
                    {i < STAGE_NAMES.length - 1 && <span className="text-slate-300 text-xl">→</span>}
                  </React.Fragment>
                )
              })}
            </div>
          </Section>

          {/* Baby coils slit from this mother — live % used, free, and consumed status */}
          {motherBabies.length > 0 && (
            <Section title={`Baby Coils from this Mother (${motherBabies.length})`}>
              <DataTable columns={babyColumns} data={motherBabies}
                highlightRow={r => r.pct >= 97} highlightClass="bg-amber-50 dark:bg-amber-900/20" />
            </Section>
          )}

          {/* 2e: Dispatch lines drawn from this coil */}
          {journey.dispEntries.length > 0 && (
            <Section title={`Dispatch (${journey.dispEntries.length})`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700">
                      {['Invoice', 'SKU', 'Pieces', 'Weight (T)', 'Dispatch Date', 'Vehicle'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {journey.dispEntries.map((b, i) => (
                      <tr key={(b.invoiceNo || '') + b.skuCode + i} className="hover:bg-slate-50 dark:hover:bg-slate-700/50 border-l-4 border-l-green-400">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{b.invoiceNo || '—'}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.skuCode}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.pieces}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{fmtT(b.weight)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.dateOfDispatch || '—'}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.vehicleNo || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* Section 3: Weight Flow Chart */}
          <Section title="Weight Flow">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={weightFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(3)} T`} />
                <Bar dataKey="weight" radius={[4, 4, 0, 0]}>
                  {weightFlowData.map((_, i) => <Cell key={i} fill={STAGE_COLORS[i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Section>
        </>
      )}

      {!selectedCoilId && (
        <Section title={`All Baby Coils (${babyRows.length})`} actions={
          <Btn size="sm" variant="ghost" onClick={downloadBabyCoilsCSV} disabled={!babyRows.length}>⬇ Baby Coils CSV</Btn>
        }>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Select a mother coil from the table above to view its full journey, or browse every baby coil below.
            Rows at 97%+ used are highlighted.
          </p>
          <DataTable columns={babyColumns} data={babyRows} filters={babyFilters}
            exportRef={babyExportRef}
            highlightRow={r => r.pct >= 97} highlightClass="bg-amber-50 dark:bg-amber-900/20" />
        </Section>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER ORDERS (uploaded from ERP Orders Excel; drives FG Reserved / Free FG)
// ═══════════════════════════════════════════════════════════════
// `cols` (optional) = { be, bf, bk } — the header texts at fixed column positions BE/BF/BK from
// the One Helix "Orders" tab, used as a positional fallback for the Confirmed/Non-confirmed inputs.
function mapOrderRow(row, cols = {}) {
  const norm = {}
  for (const k of Object.keys(row)) norm[k.toLowerCase().replace(/[.\s_]+/g, '')] = row[k]
  const pick = (...keys) => {
    for (const k of keys) if (norm[k] !== undefined && norm[k] !== '') return norm[k]
    return ''
  }
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

function Orders({ orders, setOrders, dispatches, setDispatches, productions, skus, setSkus }) {
  const [uploadMsg, setUploadMsg] = useState(null)
  const fileRef = useRef(null)

  // Per-order-line invoiced (matched to the line via Sku ID, max of dispatch match and the ERP's
  // own Invoiced Qty) and the resulting pending. Reads `dispatches` — still the invoice source.
  const shipped = useMemo(() => shippedByOrderLine(dispatches), [dispatches])
  const lineInvoiced = useCallback((o) => orderLineInvoiced(o, shipped), [shipped])
  const linePending = useCallback((o) => isOpenOrderStatus(o.orderStatus)
    ? Math.max(0, Number(o.quantity || 0) - lineInvoiced(o)) : 0, [lineInvoiced])

  // One daily upload of the One Helix workbook. Sheet "Orders" → orders (replace-all, carrying the
  // Confirmed/Non-confirmed columns); sheet "Invoice" → dispatches (the single invoice source) via
  // the shared buildDispatchRecords pipeline, rebuilt fresh each upload (replace → never double-counts).
  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      // Orders = the sheet named like /order/i, else the first sheet. Invoice = the sheet named
      // like /invoice/i, else the 2nd sheet ONLY when the workbook is exactly the expected two-tab
      // shape — so a stray 3rd sheet is never mistaken for invoices and can't wipe dispatches.
      const ordersWs = wb.Sheets[wb.SheetNames.find(n => /order/i.test(n))] || wb.Sheets[wb.SheetNames[0]]
      let invoiceWs = wb.Sheets[wb.SheetNames.find(n => /invoice/i.test(n))]
        || (wb.SheetNames.length === 2 ? wb.Sheets[wb.SheetNames[1]] : null)
      if (invoiceWs === ordersWs) invoiceWs = null   // single-sheet / self-match guard
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

      // Invoice → dispatches (rebuild fresh; existing:[] so dedup is within-file only).
      let disp = { newRecords: [], newCatalogSkus: [], stats: { invoiceCount: 0, lineCount: 0, unknownSkus: [], blankCustomer: 0 } }
      if (invoiceWs) {
        const iRows = XLSX.utils.sheet_to_json(invoiceWs, { defval: '', raw: true })
        disp = buildDispatchRecords(iRows, { skus, productions, existing: [] })
      }

      // Apply — orders replace-all; dispatches replaced (soft-delete prior non-deleted + append rebuild).
      setOrders(newOrders)
      if (disp.newCatalogSkus.length) setSkus(prev => [...prev, ...disp.newCatalogSkus])
      // Replace dispatches ONLY when the Invoice sheet produced records — never wipe the dispatch
      // history to empty because a sheet was missing, misnamed, or malformed.
      const didReplaceDispatches = !!(invoiceWs && disp.newRecords.length)
      if (didReplaceDispatches) setDispatches(prev => {
        const base = prev.map(d => (d.deleted ? d : { ...d, deleted: true }))
        return [...base, ...disp.newRecords]
      })

      const totConf = newOrders.reduce((s, o) => s + Number(o.confirmed || 0), 0)
      const totNon = newOrders.reduce((s, o) => s + Number(o.nonConfirmed || 0), 0)
      const parts = [`Orders: ${newOrders.length} line(s) · Confirmed ${fmtT(totConf)}T · Non-confirmed ${fmtT(totNon)}T`]
      if (didReplaceDispatches) {
        parts.push(`Invoice: ${disp.stats.invoiceCount} invoice(s), ${disp.stats.lineCount} line(s)`)
        if (disp.newCatalogSkus.length) parts.push(`+${disp.newCatalogSkus.length} new SKU(s)`)
        if (disp.stats.unknownSkus.length) parts.push(`${disp.stats.unknownSkus.length} unresolved SKU(s): ${disp.stats.unknownSkus.slice(0, 3).join(', ')}${disp.stats.unknownSkus.length > 3 ? '…' : ''}`)
        if (disp.stats.blankCustomer) parts.push(`${disp.stats.blankCustomer} invoice line(s) with no distributor`)
      } else if (invoiceWs) {
        parts.push('Invoice sheet had no valid rows — dispatch data left unchanged')
      } else {
        parts.push('no "Invoice" sheet — dispatch data unchanged')
      }
      const bad = !didReplaceDispatches && invoiceWs ? true
        : (invoiceWs && (disp.stats.unknownSkus.length || disp.stats.blankCustomer))
      setUploadMsg({ kind: bad ? 'err' : 'ok', text: parts.join(' · ') })
    } catch (err) {
      console.error(err)
      setUploadMsg({ kind: 'err', text: `Upload failed: ${err.message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
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
    { key: 'pending', label: 'Pending', accessor: r => linePending(r) > 0 ? 'Has pending' : 'None', options: ['Has pending', 'None'] },
    { key: 'month', label: 'Order month', accessor: r => String(r.orderDate || '').slice(0, 7) },
  ]
  const ordersExportRef = useRef([])

  const columns = [
    { label: 'Order Date',    key: 'orderDate' },
    { label: 'Order ID',      key: 'orderId' },
    { label: 'Customer',      value: r => distributorCode(r.customer), render: r => <span title={r.customer}>{distributorCode(r.customer) || '—'}</span> },
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
      ['Order Date', 'Order ID', 'Child Order ID', 'Customer', 'MM ID', 'Description', 'Qty (MT)', 'Confirmed (MT)', 'Non-confirmed (MT)', 'Invoiced (MT)', 'Pending (MT)', 'Status'],
      ordersExportRef.current.map(r => [r.orderDate, r.orderId, r.childOrderId, r.customer, r.mmId, r.description, r.quantity, fmtT(r.confirmed), fmtT(r.nonConfirmed), fmtT(lineInvoiced(r)), fmtT(linePending(r)), orderLineStage(r, lineInvoiced(r))]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Orders &amp; Invoice</h2>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onUpload} className="hidden" />
          <Btn variant="ghost" onClick={downloadOrdersCSV} disabled={activeOrders.length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => fileRef.current?.click()}>Upload Sales Excel</Btn>
        </div>
      </div>

      {uploadMsg && (
        <div className={`px-3 py-2 rounded text-sm ${uploadMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          {uploadMsg.text}
        </div>
      )}

      <p className="text-xs text-slate-400">
        One daily upload of the One Helix workbook. The <strong>Orders</strong> sheet replaces the order book
        (with <strong>Confirmed</strong> = Release − Invoiced and <strong>Non-confirmed</strong> = Ordered − Release − Cancelled);
        the <strong>Invoice</strong> sheet rebuilds the Dispatch/Invoice records (idempotent — a re-upload can't double-count).
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
function SalesDashboard({ orders, dispatches, skus }) {
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  const todayStr = today()
  const curMonth = todayStr.slice(0, 7)

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
  const allRows = useMemo(() => salesByDistributor(orders, dispatches, month), [orders, dispatches, month])
  const rows = useMemo(() => distributor ? allRows.filter(r => r.id === distributor) : allRows, [allRows, distributor])
  const selected = useMemo(() => allRows.find(r => r.id === selectedCustomer) || null, [allRows, selectedCustomer])
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

  // Distributor & month tables share the same five metrics (salesKpis logic, grouped).
  const salesCols = [
    { label: 'Distributor', value: r => distributorCode(r.customer), render: r => <span title={r.customer}>{distributorCode(r.customer) || '—'}</span> },
    { label: 'Confirmed (T)', value: r => r.confirmed, render: r => fmtT(r.confirmed), total: v => fmtT(v) },
    { label: 'Non-confirmed (T)', value: r => r.nonConfirmed, render: r => fmtT(r.nonConfirmed), total: v => fmtT(v) },
    { label: 'Pending to Dispatch (T)', value: r => r.pending, render: r => fmtT(r.pending), total: v => fmtT(v) },
    { label: 'MTD Invoice (T)', value: r => r.mtdInvoice, render: r => fmtT(r.mtdInvoice), total: v => fmtT(v) },
    { label: 'Total Orders (T)', value: r => r.totalOrders, render: r => fmtT(r.totalOrders), total: v => fmtT(v) },
  ]
  const skuCols = [
    { label: 'SKU', key: 'skuCode' },
    { label: 'Description', value: r => skuDesc(r.skuCode) },
    { label: 'Confirmed (T)', value: r => r.confirmed, render: r => fmtT(r.confirmed), total: v => fmtT(v) },
    { label: 'Non-confirmed (T)', value: r => r.nonConfirmed, render: r => fmtT(r.nonConfirmed), total: v => fmtT(v) },
    { label: 'Pending to Dispatch (T)', value: r => r.pending, render: r => fmtT(r.pending), total: v => fmtT(v) },
    { label: 'MTD Invoice (T)', value: r => r.mtdInvoice, render: r => fmtT(r.mtdInvoice), total: v => fmtT(v) },
    { label: 'Total Orders (T)', value: r => r.totalOrders, render: r => fmtT(r.totalOrders), total: v => fmtT(v) },
  ]
  // SKU Breakdown dropdown filters (Type/Size, derived from the SKU master via each row's skuCode) +
  // a ref to the on-screen rows so the SKU CSV exports exactly the filtered/searched/sorted view.
  const skuTypeOf = useCallback((code) => skus.find(s => s.skuCode === code)?.productType
    || (/\b(SHS|RHS|CHS)\b/i.exec(skuDesc(code) || '')?.[1]?.toUpperCase() ?? ''), [skus, skuDesc])
  const skuSizeOf = useCallback((code) => skuSizeLabel(skus.find(s => s.skuCode === code), skuDesc(code)), [skus, skuDesc])
  const skuBreakdownFilters = [
    { key: 'type', label: 'Type', accessor: r => skuTypeOf(r.skuCode), options: ['SHS', 'RHS', 'CHS'] },
    { key: 'size', label: 'Size', accessor: r => skuSizeOf(r.skuCode) },
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
          ['Distributor', 'Confirmed (T)', 'Non-confirmed (T)', 'Pending to Dispatch (T)', 'MTD Invoice (T)', 'Total Orders (T)'],
          rows.map(r => [r.customer, fmtT(r.confirmed), fmtT(r.nonConfirmed), fmtT(r.pending), fmtT(r.mtdInvoice), fmtT(r.totalOrders)]))}>⬇ Sales CSV</Btn>
      </div>
      <p className="text-xs text-slate-400 -mt-3">
        <strong>Confirmed</strong> = Release − Invoiced (orders confirmed, pending dispatch); <strong>Non-confirmed</strong> = Ordered − Release − Cancelled;
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
          </>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No order / invoice data yet</p>}
      </Section>

      {selected && (
        <Section title={`SKU Breakdown — ${distributorCode(selected.customer)}`} actions={
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="ghost" disabled={!selected.skuRows.length} onClick={() => downloadCSV(
              `sku-breakdown-${(selected.customer || 'distributor').replace(/[^\w-]+/g, '_')}-${todayStr}.csv`,
              ['SKU', 'Description', 'Confirmed (T)', 'Non-confirmed (T)', 'Pending to Dispatch (T)', 'MTD Invoice (T)', 'Total Orders (T)'],
              skuBreakdownExportRef.current.map(r => [r.skuCode, skuDesc(r.skuCode), fmtT(r.confirmed), fmtT(r.nonConfirmed), fmtT(r.pending), fmtT(r.mtdInvoice), fmtT(r.totalOrders)]))}>⬇ SKU CSV</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setSelectedCustomer(null)}>× Close</Btn>
          </div>
        }>
          {selected.skuRows.length ? (
            <DataTable columns={skuCols} data={selected.skuRows} filters={skuBreakdownFilters} exportRef={skuBreakdownExportRef} excel maxHeight="60vh" totalsLabel="TOTAL" />
          ) : <p className="text-sm text-slate-400 py-8 text-center">No SKU rows for this distributor</p>}
        </Section>
      )}

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
const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'coilTracker', label: 'Coil Tracker' },
  { key: 'coilInward', label: '1. Coil Inward' },
  { key: 'slitting', label: '2. Slitting' },
  { key: 'production', label: '3. Production' },
  { key: 'dispatch', label: '4. Dispatch' },
  { key: 'skuMaster', label: 'SKU Master' },
  { key: 'orders', label: 'Orders & Invoice' },
  { key: 'sales', label: 'Sales' },
  { key: 'reports', label: 'Reports' },
]

const TABLE_LABELS = {
  coils: 'Coil Inward',
  baby_coils: 'Slitting',
  productions: 'Production',
  dispatches: 'Dispatches',
  skus: 'SKU Master',
  orders: 'Orders',
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
        <span className="flex-1 break-words">
          {err.op} rejected for {err.rowCount} row{err.rowCount === 1 ? '' : 's'}. {parts}. These changes will NOT persist on refresh.
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
// free baby-coil strip. Buttons disable while generating; failures surface inline. ──
function Reports({ skus, productions, dispatches, coils, babyCoils }) {
  const [busy, setBusy] = useState(null)   // 'finished' | 'raw' | null
  const [err, setErr] = useState(null)
  const run = async (which) => {
    setErr(null); setBusy(which)
    try {
      const R = await import('./lib/reports')
      if (which === 'finished') await R.generateFinishedStockReport(skus, productions, dispatches)
      else await R.generateRawMaterialReport(coils, babyCoils, productions)
    } catch (e) {
      setErr(String(e?.message || e))
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="space-y-6">
      <Section title="Stock Reports (Excel)">
        <div className="flex flex-wrap gap-3">
          <Btn variant="success" disabled={busy === 'finished'} onClick={() => run('finished')}>
            {busy === 'finished' ? 'Generating…' : '⬇ Finished Pipe Stock (.xlsx)'}
          </Btn>
          <Btn variant="primary" disabled={busy === 'raw'} onClick={() => run('raw')}>
            {busy === 'raw' ? 'Generating…' : '⬇ Raw Material Stock (.xlsx)'}
          </Btn>
        </div>
        {err && <p className="mt-3 text-sm text-red-600 dark:text-red-400">Report failed: {err}</p>}
        <div className="mt-4 text-xs text-slate-500 dark:text-slate-400 space-y-1">
          <p><span className="font-medium text-slate-600 dark:text-slate-300">Finished Pipe Stock</span> — on-hand pipes (produced − dispatched) grouped ROUND / SHS / RHS, with per-section and grand totals.</p>
          <p><span className="font-medium text-slate-600 dark:text-slate-300">Raw Material Stock</span> — whole unslit HR coils plus free baby-coil strip, grouped by width × thickness.</p>
        </div>
      </Section>
    </div>
  )
}

export default function App() {
  const [dark, setDark] = useState(() => LS.get('jsw:dark') ?? false)
  const [tab, setTab] = useState('dashboard')
  const [coils, setCoils, coilsLoading] = useSupabaseStore('jsw:coils', [])
  const [babyCoils, setBabyCoils, babyCoilsLoading] = useSupabaseStore('jsw:babyCoils', [])
  const [productions, setProductions, productionsLoading] = useSupabaseStore('jsw:productions', [])
  const [dispatches, setDispatches, dispatchesLoading] = useSupabaseStore('jsw:dispatches', [])
  const [skus, setSkus, skusLoading] = useSupabaseStore('jsw:skus', DEFAULT_SKUS)
  const [orders, setOrders, ordersLoading] = useSupabaseStore('jsw:orders', [])

  const loading = coilsLoading || babyCoilsLoading || productionsLoading || dispatchesLoading || skusLoading || ordersLoading

  // Production weight is recomputed LIVE from the current SKU master (never the value frozen at
  // save-time), so fixing a SKU's weight flows through to every produced-tonnage view. See
  // resolveProductionWeights (calc.js) — non-destructive; stored rows are untouched.
  const resolvedProductions = useMemo(() => resolveProductionWeights(productions, skus, babyCoils), [productions, skus, babyCoils])

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
                <p className="text-xs text-slate-500 dark:text-slate-400">Inventory Management — Hyderabad</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDark(!dark)}
                className="p-2 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                title="Toggle dark mode"
              >
                {dark ? '☀️' : '🌙'}
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
            {TABS.map(t => (
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
        {tab === 'dashboard' && <Dashboard coils={coils} productions={resolvedProductions} dispatches={dispatches} skus={skus} babyCoils={babyCoils} orders={orders} />}
        {tab === 'coilTracker' && <CoilTracker coils={coils} productions={resolvedProductions} dispatches={dispatches} babyCoils={babyCoils} />}
        {tab === 'coilInward' && <CoilInward coils={coils} setCoils={setCoils} dispatches={dispatches} productions={resolvedProductions} babyCoils={babyCoils} />}
        {tab === 'slitting' && <Slitting coils={coils} babyCoils={babyCoils} setBabyCoils={setBabyCoils} productions={resolvedProductions} />}
        {tab === 'production' && <Production coils={coils} babyCoils={babyCoils} productions={resolvedProductions} setProductions={setProductions} dispatches={dispatches} skus={skus} />}
        {tab === 'dispatch' && <Dispatch dispatches={dispatches} setDispatches={setDispatches} coils={coils} skus={skus} />}
        {tab === 'skuMaster' && <SKUMaster skus={skus} setSkus={setSkus} productions={productions} />}
        {tab === 'orders' && <Orders orders={orders} setOrders={setOrders} dispatches={dispatches} setDispatches={setDispatches} productions={resolvedProductions} skus={skus} setSkus={setSkus} />}
        {tab === 'sales' && <SalesDashboard orders={orders} dispatches={dispatches} skus={skus} />}
        {tab === 'reports' && <Reports skus={skus} productions={resolvedProductions} dispatches={dispatches} coils={coils} babyCoils={babyCoils} />}
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

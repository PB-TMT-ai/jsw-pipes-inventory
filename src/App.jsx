import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useSupabaseStore } from './lib/db'
import {
  fmtT, fmtT3, genHRCoilId, tolerance, periodRange, inDateRange,
  weightPerPieceFromSku, buildReconciliationRows, coilInventoryRow,
  coilFifoAllocate, coilConsumption, dispatchCoilTrace,
  THICKNESS_TOL_MM, requiredStripWidth, WIDTH_TOL_MM, isOpenOrderStatus, skuInventoryRows, skuSizeLabel,
  canonicalSkuKey, orderBacklog, skuDemandSupply, distributorSalesRows,
  shippedByOrderLine, orderLineInvoiced,
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
  const ref = useRef(null)
  const selected = opts.find(o => o.value === value)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? opts.filter(o => String(o.label).toLowerCase().includes(q)) : opts
  }, [opts, query])
  useEffect(() => {
    if (!open) return
    const onDoc = e => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery('') } }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const choose = (o) => { onChange(o.value); setOpen(false); setQuery('') }
  return (
    <div className="relative" ref={ref}>
      <input
        type="text" disabled={disabled}
        value={open ? query : (selected?.label ?? '')}
        placeholder={selected?.label || placeholder}
        onChange={e => { setQuery(e.target.value); if (!open) setOpen(true) }}
        onFocus={() => !disabled && setOpen(true)}
        className={`w-full px-3 py-2 rounded-md border text-sm dark:text-slate-100 ${disabled ? 'field-auto cursor-not-allowed' : 'field-manual'} focus:ring-2 focus:ring-indigo-500 outline-none`}
      />
      {open && !disabled && (
        <div className="absolute z-20 mt-1 w-full max-h-60 overflow-auto rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-lg">
          {filtered.length === 0
            ? <div className="px-3 py-2 text-sm text-slate-400">No matches</div>
            : filtered.map(o => (
              <button
                type="button" key={o.value} onMouseDown={e => e.preventDefault()} onClick={() => choose(o)}
                className={`block w-full text-left px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-indigo-50 dark:hover:bg-slate-700 ${o.value === value ? 'bg-indigo-50 dark:bg-slate-700 font-medium' : ''}`}
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

const Card = ({ title, value, sub, color = 'indigo' }) => (
  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 p-6">
    <p className="text-sm text-slate-500 dark:text-slate-400">{title}</p>
    <p className={`mt-1 text-2xl font-semibold ${CARD_COLORS[color] || CARD_COLORS.indigo}`}>{value}</p>
    {sub && <p className="mt-1 text-xs text-slate-400">{sub}</p>}
  </div>
)

const SearchInput = ({ value, onChange }) => (
  <input
    type="text" value={value} onChange={e => onChange(e.target.value)} placeholder="Search..."
    className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none w-64"
  />
)

const Section = ({ title, children, actions }) => (
  <div className="bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <div className="flex gap-2">{actions}</div>
    </div>
    <div className="p-6">{children}</div>
  </div>
)

function DataTable({ columns, data, actions, onEdit, onDelete, onRowClick, highlightRow, highlightClass = 'bg-indigo-50 dark:bg-indigo-900/20', totalsLabel, filters, excel, maxHeight }) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')
  const [filterVals, setFilterVals] = useState({})
  const [colSearch, setColSearch] = useState({}) // per-column text filter, keyed by column index

  const filtered = useMemo(() => {
    let rows = data.filter(r => !r.deleted)
    ;(filters || []).forEach(f => {
      const v = filterVals[f.key]
      if (v) rows = rows.filter(r => String(f.accessor(r) ?? '') === v)
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

  // Dropdown filter options — explicit if provided, else unique accessor values.
  const filterOptions = useMemo(() => (filters || []).map(f =>
    f.options || [...new Set(data.filter(r => !r.deleted)
      .map(r => String(f.accessor(r) ?? '')).filter(Boolean))].sort()), [filters, data])

  // Totals row — per-column sums over the filtered rows (columns opting in via `total`).
  const hasTotals = columns.some(c => c.total)
  const totals = useMemo(() => columns.map(c => c.total
    ? filtered.reduce((s, r) => s + Number((c.value ? c.value(r) : r[c.key]) || 0), 0)
    : null), [filtered, columns])

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchInput value={search} onChange={setSearch} />
        {(filters || []).map((f, i) => (
          <select key={f.key} value={filterVals[f.key] || ''}
            onChange={e => setFilterVals(v => ({ ...v, [f.key]: e.target.value }))}
            className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100">
            <option value="">{f.label}: All</option>
            {filterOptions[i].map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        ))}
      </div>
      <div className="overflow-auto rounded-lg border border-slate-200 dark:border-slate-700"
        style={maxHeight ? { maxHeight } : undefined}>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              {columns.map((c, i) => (
                <th key={i} className={`sticky top-0 z-10 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap border-b border-slate-200 dark:border-slate-600 ${excel ? 'border-r last:border-r-0' : ''}`}
                  onClick={() => { setSortCol(i); setSortDir(sortCol === i && sortDir === 'asc' ? 'desc' : 'asc') }}>
                  {c.label} {sortCol === i ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
              {(onEdit || onDelete) && <th className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-700 px-4 py-3 text-xs font-medium text-slate-500 uppercase border-b border-slate-200 dark:border-slate-600">Actions</th>}
            </tr>
            <tr className="bg-slate-50 dark:bg-slate-700">
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
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-400">No records found</td></tr>
            )}
            {hasTotals && filtered.length > 0 && (
              <tr className="bg-slate-100 dark:bg-slate-700/50 font-semibold text-slate-900 dark:text-slate-100">
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
  const emptyForm = { dateOfInward: today(), hrCoilNo: '', inputCoilNumber: '', coilGrade: '', heatNumber: '', thickness: '', width: '', length: '', invoiceWeight: '', actualWeight: '', costPrice: '', poNumber: '' }
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
    { label: 'Cost (₹)', value: r => r.costPrice ? `₹${Math.round(r.costPrice).toLocaleString()}` : '—' },
  ]

  const downloadCoilsCSV = () => {
    const header = ['HR Coil ID', 'Date', 'Input Coil #', 'Grade', 'Thickness (mm)', 'Width (mm)', 'Invoice Wt (T)', 'Actual Wt (T)', 'Dispatched Wt (T)', 'Cost (₹)']
    downloadCSV(`coil-inward-${today()}.csv`, header, coils.filter(c => !c.deleted).map(r => {
      const s = getCoilStats(r)
      return [r.hrCoilId, r.dateOfInward, r.inputCoilNumber, r.coilGrade, r.thickness, r.width, fmtT3(r.invoiceWeight), fmtT3(r.actualWeight), fmtT3(s.dispatchedWt), r.costPrice ? Math.round(r.costPrice) : '']
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
            <Field label="Cost Price (₹)" helper="Total cost of coil in ₹"><Input type="number" value={form.costPrice} onChange={v => f('costPrice', v)} /></Field>
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
  const emptyForm = { dateOfConversion: today(), hrCoilId: '', width: '', length: '' }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [dateFilter, setDateFilter] = useState('all')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const parentCoil = useMemo(() => coils.find(c => !c.deleted && c.hrCoilId === form.hrCoilId), [coils, form.hrCoilId])
  const siblingsOfParent = useMemo(() => babyCoils.filter(b => !b.deleted && b.hrCoilId === form.hrCoilId && b.id !== editId), [babyCoils, form.hrCoilId, editId])
  // Pick the first unused letter (A, B, C…) — fills gaps left by deleted siblings so letters are reused.
  const nextLetter = useMemo(() => {
    const used = new Set(siblingsOfParent.map(b => b.babyCoilEntry))
    let i = 0
    while (used.has(genBabyLetter(i))) i++
    return genBabyLetter(i)
  }, [siblingsOfParent])

  const babyCoilEntry = editId ? form.babyCoilEntry : nextLetter
  const babyCoilId = form.hrCoilId ? `${form.hrCoilId}-${babyCoilEntry}` : ''
  const isDupe = babyCoils.some(b => !b.deleted && b.babyCoilId === babyCoilId && b.id !== editId)

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

  // Proportionate weight & cost
  const allBabyWidths = useMemo(() => {
    const ws = siblingsOfParent.map(b => Number(b.width || 0))
    if (form.width) ws.push(Number(form.width))
    return ws
  }, [siblingsOfParent, form.width])
  const sumBabyWidths = allBabyWidths.reduce((s, w) => s + w, 0)
  const calcWeight = parentCoil && form.width && sumBabyWidths > 0
    ? (Number(form.width) / sumBabyWidths) * Number(parentCoil.actualWeight || 0) : 0
  const calcCostPrice = parentCoil && form.width && sumBabyWidths > 0
    ? (Number(form.width) / sumBabyWidths) * Number(parentCoil.costPrice || 0) : 0
  const widthCheck = parentCoil ? widthStatus(sumBabyWidths, Number(parentCoil.width)) : null

  const save = () => {
    // Recalculate all sibling weights and cost prices with new width distribution
    const record = {
      ...form, id: editId || uid(), babyCoilEntry, babyCoilId,
      thickness: parentCoil?.thickness, poNumber: parentCoil?.poNumber,
      weight: calcWeight, costPrice: calcCostPrice,
      hrCoilId: form.hrCoilId, deleted: false,
    }
    let updated = editId ? babyCoils.map(b => b.id === editId ? record : b) : [...babyCoils, record]
    // Recalculate all siblings' weights and cost prices (proportional to width)
    const parentBabies = updated.filter(b => !b.deleted && b.hrCoilId === form.hrCoilId)
    const newTotal = parentBabies.reduce((s, b) => s + Number(b.width || 0), 0)
    updated = updated.map(b => {
      if (!b.deleted && b.hrCoilId === form.hrCoilId && newTotal > 0) {
        return {
          ...b,
          weight: (Number(b.width) / newTotal) * Number(parentCoil.actualWeight || 0),
          costPrice: (Number(b.width) / newTotal) * Number(parentCoil.costPrice || 0),
        }
      }
      return b
    })
    setBabyCoils(updated)
    setForm(emptyForm); setEditId(null); setShowForm(false)
  }

  const startEdit = (row) => { setForm({ ...row }); setEditId(row.id); setShowForm(true) }
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
              costPrice: (Number(b.width) / total) * Number(parent.costPrice || 0),
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

  const columns = [
    { label: 'Date', key: 'dateOfConversion' },
    { label: 'Baby Coil ID', key: 'babyCoilId' },
    { label: 'HR Coil ID', key: 'hrCoilId' },
    { label: 'Thick (mm)', key: 'thickness' },
    { label: 'Width (mm)', key: 'width' },
    { label: 'Weight (T)', value: r => fmtT3(r.weight) },
    { label: 'Cost (₹)', value: r => r.costPrice ? `₹${Math.round(r.costPrice).toLocaleString()}` : '—' },
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
    { label: 'PO Number', key: 'poNumber' },
  ]

  const downloadBabyCoilsCSV = () => {
    const header = ['Date', 'Baby Coil ID', 'HR Coil ID', 'Thickness (mm)', 'Width (mm)', 'Weight (T)', 'Cost (₹)', 'PO Number']
    downloadCSV(`slitting-${today()}.csv`, header, filteredBabyCoils.map(r => [
      r.dateOfConversion, r.babyCoilId, r.hrCoilId, r.thickness, r.width, fmtT3(r.weight), r.costPrice ? Math.round(r.costPrice) : '', r.poNumber,
    ]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 2: Slitting</h2>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={downloadBabyCoilsCSV} disabled={filteredBabyCoils.length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ Add Baby Coil'}</Btn>
        </div>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Baby Coil' : 'Slit Mother Coil'}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date of Conversion"><Input type="date" value={form.dateOfConversion} onChange={v => f('dateOfConversion', v)} /></Field>
            <Field label="HR Coil ID"><Select value={form.hrCoilId} onChange={v => f('hrCoilId', v)} options={coilOptions} /></Field>
            <Field label="Baby Coil Entry" auto><Input value={babyCoilEntry} disabled /></Field>
            <Field label="Baby Coil ID" auto><Input value={babyCoilId} disabled /></Field>
            <Field label="Thickness (mm)" auto><Input value={parentCoil?.thickness ?? ''} disabled /></Field>
            <Field label="Width (mm)"><Input type="number" value={form.width} onChange={v => f('width', v)} /></Field>
            <Field label="Length (mm)"><Input type="number" value={form.length} onChange={v => f('length', v)} placeholder="Optional" /></Field>
            <Field label="Weight (T)" auto><Input value={fmtT3(calcWeight)} disabled /></Field>
            <Field label="Cost Price (₹)" auto><Input value={calcCostPrice ? `₹${Math.round(calcCostPrice).toLocaleString()}` : '—'} disabled /></Field>
            <Field label="PO Number" auto><Input value={parentCoil?.poNumber ?? ''} disabled /></Field>
          </div>
          {parentCoil && widthCheck && (
            <div className={`mt-3 p-3 rounded-md ${widthCheck.tier === 'ok' ? 'bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800' : widthCheck.tier === 'warn' ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800' : 'bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800'}`}>
              <span className={`text-sm font-medium ${widthCheck.tier === 'ok' ? 'text-green-700 dark:text-green-400' : widthCheck.tier === 'warn' ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>
                Width Sum: {widthCheck.label} {widthCheck.tier === 'ok' ? '✔ OK (≤ Mother − 5 mm)' : widthCheck.tier === 'warn' ? '⚠ Over Mother − 5 mm (within mother width)' : '⚠ Exceeds mother coil width — please verify (save allowed)'}
              </span>
            </div>
          )}
          {isDupe && <div className="mt-2"><Badge ok={false} text="Duplicate Baby Coil ID!" /></div>}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.hrCoilId || !form.width || isDupe} variant="success">{editId ? 'Update' : 'Save Baby Coil'}</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Baby Coils" actions={
        <div className="flex items-center gap-2">
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
        <DataTable columns={columns} data={filteredBabyCoils} onEdit={startEdit} onDelete={softDelete} />
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
  const pieces = Number(form.tubeCount || 0)
  const totalWeight = weightPerPiece * pieces

  // Width (mm) this tube needs from a coil; 0 when unknown (then the width filter is skipped).
  const reqWidth = useMemo(() => requiredStripWidth(sku), [sku])

  // Present baby coils in the shape coilFifoAllocate expects (FIFO key = babyCoilId,
  // capacity = baby weight, date = dateOfConversion). Thickness is inherited from the mother.
  // Narrow to coils whose slit width is within ±WIDTH_TOL_MM of the needed width (skip when
  // reqWidth is unknown); coilFifoAllocate then applies the ±0.3 mm thickness band on top, so
  // the FIFO suggestion is eligible only on width ±5 mm AND thickness ±0.3 mm.
  const babyAsCoils = useMemo(() => (babyCoils || [])
    .filter(b => !b.deleted && (reqWidth <= 0 || Math.abs(Number(b.width || 0) - reqWidth) <= WIDTH_TOL_MM))
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
      .filter(b => !b.deleted)
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
  const setRow = (i, key, val) => { const next = baseRows(); next[i] = { ...next[i], [key]: key === 'pieces' ? Number(val || 0) : val }; setManualAlloc(next) }
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
      status: allocPcs >= pieces && pieces > 0 ? 'allocated' : allocPcs > 0 ? 'partial' : 'unallocated',
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
      : <Badge ok={false} text={r.status === 'partial' ? 'Partial' : 'Unallocated'} /> },
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
            <Field label="No. of Pieces"><Input type="number" value={form.tubeCount} onChange={v => f('tubeCount', v)} /></Field>
          </div>
          <div className="my-4 border-t border-slate-200 dark:border-slate-700" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Wt/Piece (T)" auto><Input value={fmtT(weightPerPiece)} disabled /></Field>
            <Field label="Total Weight (T)" auto><Input value={fmtT(totalWeight)} disabled /></Field>
            <Field label="Allocated (pcs)" auto warn={allocatedPieces !== pieces || overCapacity}><Input value={`${allocatedPieces} / ${pieces}`} disabled /></Field>
            <Field label="# Source Coils" auto><Input value={String(sourceCoils)} disabled /></Field>
          </div>

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
                  <div className="w-24"><Input type="number" value={r.pieces} onChange={v => setRow(i, 'pieces', v)} /></div>
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
// STAGE 4: DISPATCH — records uploaded from the ERP invoice Excel export. Rows are
// grouped into one dispatch per invoice; the SKU is matched by MM ID (== skuCode) and
// each entry's coil trace is inherited from production FIFO (dispatchCoilTrace), so cost
// reconciliation (mother-coil rate) keeps working with no manual coil picking.
// ═══════════════════════════════════════════════════════════════
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
  // ERP invoice columns (case/spacing-insensitive); legacy aliases kept for back-compat.
  return {
    dateOfDispatch: toISODate(pick('invoicedate', 'dateofdispatch', 'dispatchdate', 'date')),
    invoiceNo:      String(pick('invoicenumber', 'invoiceno', 'invoice')).trim(),
    mmId:           String(pick('mmid', 'skucode', 'sku')).trim(),                                   // == SKU master skuCode
    skuDescRaw:     String(pick('mmdescription', 'skudescription', 'description', 'item', 'product')).trim(),
    weight:         num(pick('invoicedqty', 'weight', 'weightmt', 'quantitymt', 'doqty', 'netweight', 'wt')),
    pieces:         num(pick('pieces', 'noofpieces', 'qty', 'quantity', 'nos')),                     // absent in ERP file → derived from weight
    customer:       String(pick('distributorname', 'customer', 'billtoname')).trim(),
    grade:          String(pick('grade')).trim(),
    diameter:       num(pick('diametermm', 'diameter')),
    vehicleNo:      String(pick('vehicleno', 'vehiclenumber', 'truckno', 'lorryno')).trim(),
    vehicleWeight:  num(pick('vehicleweight', 'grossweight', 'weighbridge', 'vehiclewt')),
    // ERP order references — link a shipment back to its order line (orders ↔ dispatch).
    orderLineId:    String(pick('skuid')).trim(),            // == orders "Sku ID" (exact per-line key)
    orderId:        String(pick('orderid')).trim(),          // == orders "Order ID"
    childOrderId:   String(pick('childorderid')).trim(),     // == orders "Child Order ID"
  }
}

function Dispatch({ dispatches, setDispatches, coils, skus, setSkus, productions }) {
  const [uploadMsg, setUploadMsg] = useState(null)
  const fileRef = useRef(null)
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) { setUploadMsg({ kind: 'err', text: 'Workbook has no sheets' }); return }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
      // Keep product lines only: need an MM ID + qty; drop the Freight line (MM ID 9000000).
      const parsed = rows.map(mapDispatchRow).filter(r =>
        r.mmId && r.mmId !== '9000000' && !/^freight$/i.test(r.skuDescRaw) && (r.weight || r.pieces))
      if (!parsed.length) { setUploadMsg({ kind: 'err', text: 'No valid rows found (need MM ID + Invoiced qty/Weight)' }); return }

      // Skip invoices already imported — the ERP file is re-uploaded daily and overlaps.
      const existing = dispatches.filter(d => !d.deleted)
      const existingInvoices = new Set(existing.map(d => d.invoiceNo).filter(Boolean))

      // SKU resolution by MM ID (== skuCode) then exact description. If the live `skus`
      // store lacks a SKU that the static catalog (DEFAULT_SKUS) knows, self-heal: use it
      // and persist it to the master (setSkus below) so future uploads + costing resolve.
      const byCode = new Map(skus.map(s => [s.skuCode, s]))
      const byDesc = new Map(skus.map(s => [(s.description || '').toLowerCase(), s]))
      const byKey = new Map(skus.map(s => [canonicalSkuKey(s), s]))
      const defByCode = new Map(DEFAULT_SKUS.map(s => [s.skuCode, s]))
      const defByDesc = new Map(DEFAULT_SKUS.map(s => [(s.description || '').toLowerCase(), s]))
      const defByKey = new Map(DEFAULT_SKUS.map(s => [canonicalSkuKey(s), s]))
      const newCatalogSkus = []
      const resolve = (mmId, descRaw) => {
        // Match by MM ID, then exact description, then canonical identity — so an ERP line whose
        // decimals differ ("…1.6") still resolves to the existing master code ("…1.60") instead
        // of minting an off-master duplicate that would later fragment inventory.
        const key = canonicalSkuKey(descRaw)
        let s = byCode.get(mmId) || byDesc.get((descRaw || '').toLowerCase()) || (key && byKey.get(key))
        if (s) return s
        s = defByCode.get(mmId) || defByDesc.get((descRaw || '').toLowerCase()) || (key && defByKey.get(key))
        if (s && !byCode.has(s.skuCode)) { newCatalogSkus.push(s); byCode.set(s.skuCode, s) }
        return s || null
      }

      // Build entries with an incremental FIFO coil trace (entries built so far this batch
      // count as already-dispatched, so each line draws the next production pieces).
      const builtEntries = []
      const traceCtx = () => [...existing, { id: '__batch__', deleted: false, bundleEntries: builtEntries }]
      const records = {}
      const unknownSkus = new Set()
      const skippedInvoices = new Set()
      let lineCount = 0
      parsed.forEach((r, i) => {
        if (r.invoiceNo && existingInvoices.has(r.invoiceNo)) { skippedInvoices.add(r.invoiceNo); return }
        const sku = resolve(r.mmId, r.skuDescRaw)
        if (!sku) unknownSkus.add(r.mmId || r.skuDescRaw)
        const skuCode = sku?.skuCode || r.mmId
        const wpt = Number(sku?.weightPerTube || 0)
        let pieces = Number(r.pieces || 0)
        let weight = Number(r.weight || 0)
        if (!pieces && weight && wpt) pieces = Math.round((weight * 1000) / wpt) // ERP file has weight only
        if (!weight && pieces && wpt) weight = (pieces * wpt) / 1000
        const allocs = dispatchCoilTrace(skuCode, pieces, productions, traceCtx())
        const entry = {
          invoiceNo: r.invoiceNo, skuCode, pieces, weight,
          length: sku?.length || 6000, width: '', thickness: sku?.thickness ?? '',
          grade: r.grade || '', diameter: r.diameter || '', customer: r.customer || '',
          orderLineId: r.orderLineId || '', orderId: r.orderId || '', childOrderId: r.childOrderId || '',
          coilAllocations: allocs, traceHrCoilId: allocs[0]?.hrCoilId || '',
        }
        builtEntries.push(entry); lineCount++
        const key = r.invoiceNo || `${r.dateOfDispatch}||${r.vehicleNo}||${i}` // one dispatch per invoice
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
      if (newCatalogSkus.length) setSkus(prev => [...prev, ...newCatalogSkus])
      if (newRecords.length) setDispatches(prev => [...prev, ...newRecords])
      const parts = [`Imported ${newRecords.length} invoice(s), ${lineCount} line(s)`]
      if (skippedInvoices.size) parts.push(`skipped ${skippedInvoices.size} already-imported invoice(s)`)
      if (newCatalogSkus.length) parts.push(`added ${newCatalogSkus.length} new SKU(s)`)
      if (unknownSkus.size) parts.push(`${unknownSkus.size} unresolved SKU(s): ${[...unknownSkus].slice(0, 3).join(', ')}${unknownSkus.size > 3 ? '…' : ''}`)
      setUploadMsg({ kind: unknownSkus.size ? 'err' : 'ok', text: parts.join(' · ') })
    } catch (err) {
      console.error(err)
      setUploadMsg({ kind: 'err', text: `Upload failed: ${err.message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const softDelete = (row) => {
    if (confirm('Delete this dispatch record?')) setDispatches(prev => prev.map(d => d.id === row.id ? { ...d, deleted: true } : d))
  }

  // Invoice Reconciliation CSV — one row per (dispatch date × invoice × SKU). Cost model
  // (locked): total = (costPrice/MT + ladder/MT) × quantityMT. Logic in calc.js.
  const downloadReconciliationCSV = () => {
    const rows = buildReconciliationRows(dispatches, coils, skus)
    const header = ['Date of Dispatch', 'Invoice No.', 'Customer', 'SKU', 'Grade', 'Quantity (MT)', 'Mother Coil', 'Cost Price/MT', 'Conversion Cost/MT', 'Ladder Cost/MT', 'Total Cost of Invoice Qty']
    downloadCSV(`invoice-reconciliation-${today()}.csv`, header, rows.map(r => [
      r.dateOfDispatch, r.invoiceNo, r.customer, r.sku, r.grade, fmtT(r.quantityMT), r.motherCoil,
      r.costPricePerMT.toFixed(2), r.conversionPerMT.toFixed(2), r.ladderPerMT.toFixed(2), r.totalCost.toFixed(2),
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
    { label: 'Customer', value: r => r.bundleEntries?.[0]?.customer || r.customer || '—' },
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
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onUpload} className="hidden" />
          <Btn variant="ghost" onClick={downloadDispatchRecordsCSV} disabled={dispatches.filter(d => !d.deleted).length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => fileRef.current?.click()}>Upload Dispatch Excel</Btn>
        </div>
      </div>

      <Section title="Upload dispatches from the ERP invoice Excel">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          One row per invoice line. Recognised columns (case/spacing-insensitive):
          <span className="font-mono text-xs"> Invoice date, Invoice number, MM ID, MM Description, Invoiced qty (MT), Distributor Name, Grade, Diameter mm, Sku ID / Order ID (order reconciliation)</span>.
          Rows group into one dispatch per invoice; already-imported invoices are skipped. SKUs match by MM ID — unknown catalog sizes are added automatically. Order references (Sku ID / Order ID) are captured to reconcile shipments against orders; coil trace &amp; cost are inherited from Production FIFO.
        </p>
        {uploadMsg && (
          <div className={`mt-3 text-sm ${uploadMsg.kind === 'ok' ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{uploadMsg.text}</div>
        )}
      </Section>

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
function SKUMaster({ skus, setSkus }) {
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
    const record = { ...form, id: editId || uid() }
    if (editId) {
      setSkus(prev => prev.map(s => s.id === editId ? record : s))
    } else {
      setSkus(prev => [...prev, record])
    }
    setForm(emptySku); setEditId(null); setShowForm(false)
  }

  const startEdit = (row) => { setForm({ ...row }); setEditId(row.id); setShowForm(true) }
  const deleteSku = (row) => { if (confirm('Delete SKU?')) setSkus(prev => prev.filter(s => s.id !== row.id)) }

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
            <Field label="SKU Code" auto><Input value={form.skuCode} onChange={v => f('skuCode', v)} /></Field>
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

function Dashboard({ coils, productions, dispatches, skus, purchaseOrders, babyCoils, orders }) {
  const active = (arr) => (arr || []).filter(x => !x.deleted)
  const ac = active(coils), ap = active(productions), ad = active(dispatches), apo = active(purchaseOrders)
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
    invoiced: ad.filter(d => inRange(d.dateOfDispatch)).flatMap(d => d.bundleEntries || []).reduce((s, e) => s + Number(e.weight || 0), 0),
    ordered: (orders || []).filter(o => !o.deleted && !/cancel|reject/i.test(o.orderStatus || '') && inRange(o.orderDate)).reduce((s, o) => s + Number(o.quantity || 0), 0),
  }), [ac, ap, ad, orders, inRange])

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
  // pendingToInvoice (orders − invoiced), inventory (produced − invoiced), free (inventory −
  // pending). Union of stocked ∪ ordered SKUs; negative-free rows sort first. ──
  const skuRows = useMemo(() => skuInventoryRows(ap, ad, orders, skus, inRange), [ap, ad, orders, skus, inRange])

  const skuTotals = useMemo(() => skuRows.reduce(
    (t, r) => ({
      totalOrders: t.totalOrders + r.totalOrders, totalInvoiced: t.totalInvoiced + r.totalInvoiced,
      invoicedVsOrders: t.invoicedVsOrders + r.invoicedVsOrders,
      pendingToInvoice: t.pendingToInvoice + r.pendingToInvoice, inventory: t.inventory + r.inventory,
      reserved: t.reserved + r.reserved, free: t.free + r.free,
    }),
    { totalOrders: 0, totalInvoiced: 0, invoicedVsOrders: 0, pendingToInvoice: 0, inventory: 0, reserved: 0, free: 0 }
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
  // Inventory / Free are live; Pending to Invoice follows the period filter. Free = Inventory − Reserved.
  const skuInvCols = [
    { label: 'SKU Code', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'Production (T)', value: r => r.production, render: r => fmtT(r.production), total: v => fmtT(v) },
    { label: 'Pending to Invoice (T)', value: r => r.pendingToInvoice, render: r => fmtT(r.pendingToInvoice), total: v => fmtT(v) },
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

  // ── FG metrics (all MT) — totals reconcile with the SKU table ──
  const totalFgDispatched = skuTotals.totalInvoiced       // invoiced this period (any order)
  const fgInvoicedVsOrders = skuTotals.invoicedVsOrders   // invoiced against these orders (per line)
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
    // POs ending within 7 days
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    apo.forEach(p => {
      if (p.poEndDate && p.poEndDate >= todayStr && p.poEndDate <= in7) {
        list.push({ type: 'warn', msg: `PO ${p.purchaseOrderNumber} (${p.vendorName || '—'}) ends on ${p.poEndDate}` })
      }
    })
    return list
  }, [ac, ap, ad, apo, todayStr, skuDesc, skuRows])

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
      const rate = Number(c.actualWeight) > 0 ? Number(c.costPrice || 0) / Number(c.actualWeight) : 0
      const producedWt = ap.flatMap(p => p.coilAllocations || []).filter(a => a.hrCoilId === c.hrCoilId).reduce((s, a) => s + Number(a.weight || 0), 0)
      const rawRem = Math.max(0, Number(c.actualWeight || 0) - producedWt)
      const dispWt = ad.flatMap(d => d.bundleEntries || []).flatMap(be => (be.coilAllocations && be.coilAllocations.length ? be.coilAllocations : (be.traceHrCoilId ? [{ hrCoilId: be.traceHrCoilId, weight: be.weight }] : []))).filter(a => a.hrCoilId === c.hrCoilId).reduce((s, a) => s + Number(a.weight || 0), 0)
      const readyWt = Math.max(0, producedWt - dispWt)
      const stockVal = (rawRem + readyWt) * rate
      return [
        c.hrCoilId, c.coilGrade || '', c.thickness ?? '', c.width ?? '', fmtT(c.actualWeight),
        fmtT(rawRem), fmtT(readyWt), fmtT(dispWt), stockVal.toFixed(2),
      ]
    })
    downloadCSV(`stock-report-${todayStr}.csv`,
      ['Mother Coil', 'Grade', 'Thickness (mm)', 'Width (mm)', 'Actual Wt (T)', 'Raw Remaining (T)', 'Ready Wt (T)', 'Dispatched Wt (T)', 'Stock Value (INR)'],
      rows)
  }

  const downloadSkuCSV = () => {
    downloadCSV(`sku-report-${todayStr}.csv`,
      ['SKU Code', 'Description', 'Production (T)', 'Pending to Invoice (T)', 'Reserved (T)', 'Inventory (T)', 'Free Inventory (T)'],
      skuRows.map(r => [r.skuCode, r.description, fmtT(r.production), fmtT(r.pendingToInvoice), fmtT(r.reserved), fmtT(r.inventory), fmtT(r.free)]))
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

      {/* Activity (MT) — scoped to the selected period */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Activity — {periodLabel}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="Coil Inward" value={`${fmtT(activity.coilInward)} T`} sub="Mother coil received" />
          <Card title="Produced" value={`${fmtT(activity.produced)} T`} sub="Tubes produced" color="cyan" />
          <Card title="Invoiced" value={`${fmtT(activity.invoiced)} T`} sub="Dispatched / invoiced" color="emerald" />
          <Card title="Ordered" value={`${fmtT(activity.ordered)} T`} sub="New customer orders" color="amber" />
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
          <Card title="FG Invoiced · Period" value={`${fmtT(totalFgDispatched)} T`} sub="Invoiced this period (any order)" color="emerald" />
          <Card title="FG Invoiced vs Orders" value={`${fmtT(fgInvoicedVsOrders)} T`} sub="Invoiced against these orders" color="emerald" />
          <Card title="FG Left Inventory" value={`${fmtT(fgLeft)} T`} sub="Produced − invoiced" />
          <Card title="FG Reserved" value={`${fmtT(fgReserved)} T`} sub="Released − invoiced (committed)" color="cyan" />
          <Card title="Free FG" value={`${fmtT(freeFg)} T`} sub="Inventory − reserved" color="amber" />
        </div>
      </div>

      {/* SKU-wise Inventory (MT) — Excel-like, static header; negative free inventory highlighted.
          Columns: Production / Pending to Invoice / Reserved / Inventory / Free Inventory. */}
      <Section title="SKU-wise Inventory" actions={
        <Btn size="sm" variant="ghost" onClick={downloadSkuCSV}>⬇ SKU CSV</Btn>
      }>
        {skuRows.length > 0 ? (
          <>
            <DataTable columns={skuInvCols} data={skuRows} filters={skuInvFilters}
              highlightRow={r => r.free < 0} highlightClass="bg-red-50 dark:bg-red-900/30"
              excel maxHeight="60vh" totalsLabel="TOTAL" />
            <p className="mt-2 text-xs text-slate-400">
              <strong>Reserved</strong> = released − invoiced for active orders (not delivered/cancelled);
              <strong> Free Inventory</strong> = Inventory − Reserved (negative ⇒ over-committed, red).
              Production / Reserved / Inventory are live; Pending to Invoice follows the period filter.
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
const SUMMARY_TD = 'px-2 py-1 whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-600'
const SUBTOTAL_TD = 'sticky top-8 z-10 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap border-b-2 border-r border-slate-300 dark:border-slate-600'

function CoilTracker({ coils, productions, dispatches }) {
  const [selectedCoilId, setSelectedCoilId] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const active = (arr) => (arr || []).filter(x => !x.deleted)
  const ac = active(coils), ap = active(productions), ad = active(dispatches)

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
    () => filteredCoils.map(c => coilInventoryRow(c, ad, ap)),
    [filteredCoils, ad, ap]
  )

  // ── Subtotals over the filtered set (rendered pinned at the top of the table) ──
  const subtotals = useMemo(() => inventorySummary.reduce((s, r) => ({
    coilCount: s.coilCount + 1,
    coilWt: s.coilWt + r.coilWt, producedPcs: s.producedPcs + r.producedPcs, producedWt: s.producedWt + r.producedWt,
    dispatchedPcs: s.dispatchedPcs + r.dispatchedPcs, dispatchedWt: s.dispatchedWt + r.dispatchedWt,
    balanceToProduce: s.balanceToProduce + r.balanceToProduce, producedInvWt: s.producedInvWt + r.producedInvWt, producedInvPcs: s.producedInvPcs + r.producedInvPcs,
  }), { coilCount: 0, coilWt: 0, producedPcs: 0, producedWt: 0, dispatchedPcs: 0, dispatchedWt: 0, balanceToProduce: 0, producedInvWt: 0, producedInvPcs: 0 }), [inventorySummary])

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

      {/* ── Section 1: Inventory Summary (Excel-style, subtotals pinned at top) ── */}
      <Section title="Inventory Summary — All Coils" actions={
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-500">Period:</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
          <span className="text-sm text-slate-500">to</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            className="px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100" />
        </div>
      }>
        <div className="overflow-auto max-h-96 rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                {SUMMARY_HEADERS.map((h, i) => (
                  <th key={h} className={`sticky top-0 z-20 h-8 px-2 py-1 bg-slate-50 dark:bg-slate-700 text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-600 ${i < 2 ? 'text-left' : 'text-right'}`}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Subtotal row — pinned just below the header, recomputes with the period filter */}
              <tr>
                <td className={`${SUBTOTAL_TD} text-left`}>Total ({subtotals.coilCount})</td>
                <td className={`${SUBTOTAL_TD} text-left`}>-</td>
                {SUMMARY_COLS.map(col => (
                  <td key={col.key} className={`${SUBTOTAL_TD} text-right tabular-nums`}>
                    {col.fmt === 'wt' ? fmt2(subtotals[col.key]) : fmtCount(subtotals[col.key])}
                  </td>
                ))}
              </tr>
              {inventorySummary.length === 0 && (
                <tr>
                  <td colSpan={SUMMARY_HEADERS.length} className="px-2 py-8 text-center text-slate-400 border-b border-slate-200 dark:border-slate-600">No coils in the selected period</td>
                </tr>
              )}
              {inventorySummary.map(row => (
                <tr key={row.hrCoilId} onClick={() => setSelectedCoilId(row.hrCoilId)}
                  className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50 ${row.hrCoilId === selectedCoilId ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}>
                  <td className={`${SUMMARY_TD} text-left font-medium text-slate-900 dark:text-white`}>{row.hrCoilId}</td>
                  <td className={`${SUMMARY_TD} text-left text-slate-700 dark:text-slate-300`}>{row.grade || '-'}</td>
                  {SUMMARY_COLS.map(col => (
                    <td key={col.key} className={`${SUMMARY_TD} text-right tabular-nums text-slate-700 dark:text-slate-300`}>
                      {col.fmt === 'wt' ? fmt2(row[col.key]) : fmtCount(row[col.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
        <div className="text-center py-12 text-slate-400 dark:text-slate-500">
          <p className="text-lg">Select a coil from the table above to view its full journey</p>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// PO MASTER — monthly Zoho Books PO upload + manual edit
// ═══════════════════════════════════════════════════════════════
function toISODate(v) {
  if (v === null || v === undefined || v === '') return ''
  const fromDate = (d) => {
    if (isNaN(d)) return ''
    // xlsx 0.18.x produces Date objects in local time by default, so use
    // local getters to avoid an off-by-one day in non-UTC timezones (e.g. IST).
    const y = d.getFullYear()
    const mo = String(d.getMonth() + 1).padStart(2, '0')
    const da = String(d.getDate()).padStart(2, '0')
    return `${y}-${mo}-${da}`
  }
  if (v instanceof Date) return fromDate(v)
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
  return fromDate(new Date(s))
}

function mapExcelRow(row) {
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
  return {
    purchaseOrderDate:   toISODate(pick('purchaseorderdate')),
    purchaseOrderNumber: String(pick('purchaseordernumber')).trim(),
    vendorName:          String(pick('vendorname')).trim(),
    itemName:            String(pick('itemname')).trim(),
    quantityOrdered:     num(pick('quantityordered')),
    updatedQty:          num(pick('itemcfupdatedqty', 'cfupdatedqty', 'updatedqty')),
    itemPrice:           num(pick('itemprice')),
    updatedPrice:        num(pick('itemcfupdatedprice', 'cfupdatedprice', 'updatedprice')),
    poEndDate:           toISODate(pick('cfpoenddate', 'poenddate')),
  }
}

function POMaster({ purchaseOrders, setPurchaseOrders }) {
  const emptyForm = {
    purchaseOrderDate: today(),
    purchaseOrderNumber: '',
    vendorName: '',
    itemName: '',
    quantityOrdered: '',
    updatedQty: '',
    itemPrice: '',
    updatedPrice: '',
    poEndDate: '',
  }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [uploadMsg, setUploadMsg] = useState(null)
  const fileRef = useRef(null)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const save = () => {
    const record = { ...form, id: editId || uid(), deleted: false }
    setPurchaseOrders(prev =>
      editId
        ? prev.map(r => (r.id === editId ? record : r))
        : [...prev, record]
    )
    setForm(emptyForm)
    setEditId(null)
    setShowForm(false)
  }

  const startEdit = (row) => {
    setForm({ ...emptyForm, ...row })
    setEditId(row.id)
    setShowForm(true)
  }

  const softDelete = (row) => {
    if (confirm('Delete this PO row?'))
      setPurchaseOrders(prev => prev.map(r => (r.id === row.id ? { ...r, deleted: true } : r)))
  }

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) {
        setUploadMsg({ kind: 'err', text: 'Workbook has no sheets' })
        return
      }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
      const parsed = rows.map(mapExcelRow).filter(r => r.purchaseOrderNumber && r.itemName)
      if (!parsed.length) {
        setUploadMsg({ kind: 'err', text: 'No valid rows found (need Purchase Order Number + Item Name)' })
        return
      }

      setPurchaseOrders(prev => {
        const keyOf = r => `${r.purchaseOrderNumber}||${r.itemName}`
        const active = prev.filter(r => !r.deleted)
        const deletedRows = prev.filter(r => r.deleted)
        const byKey = new Map(active.map(r => [keyOf(r), r]))
        let added = 0
        let updated = 0
        for (const row of parsed) {
          const k = keyOf(row)
          const existing = byKey.get(k)
          if (existing) {
            byKey.set(k, { ...existing, ...row })
            updated++
          } else {
            byKey.set(k, { ...row, id: uid(), deleted: false })
            added++
          }
        }
        setUploadMsg({ kind: 'ok', text: `Imported: ${added} new, ${updated} updated` })
        return [...deletedRows, ...byKey.values()]
      })
    } catch (err) {
      console.error(err)
      setUploadMsg({ kind: 'err', text: `Upload failed: ${err.message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const columns = [
    { label: 'Purchase Order Date',   key: 'purchaseOrderDate' },
    { label: 'Purchase Order Number', key: 'purchaseOrderNumber' },
    { label: 'Vendor Name',           key: 'vendorName' },
    { label: 'Item Name',             key: 'itemName' },
    { label: 'QuantityOrdered',       key: 'quantityOrdered' },
    { label: 'Item.CF.Updated Qty',   key: 'updatedQty' },
    { label: 'Item Price',            value: r => (r.itemPrice !== '' && r.itemPrice != null) ? `₹${Number(r.itemPrice).toLocaleString()}` : '—' },
    { label: 'Item.CF.Updated Price', value: r => (r.updatedPrice !== '' && r.updatedPrice != null) ? `₹${Number(r.updatedPrice).toLocaleString()}` : '—' },
    { label: 'CF.PO end Date',        key: 'poEndDate' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">PO Master</h2>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onUpload} className="hidden" />
          <Btn variant="ghost" onClick={() => fileRef.current?.click()}>Upload Excel</Btn>
          <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(!showForm) }}>
            {showForm ? 'Cancel' : '+ Add PO Row'}
          </Btn>
        </div>
      </div>

      {uploadMsg && (
        <div className={`px-3 py-2 rounded text-sm ${uploadMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          {uploadMsg.text}
        </div>
      )}

      {showForm && (
        <Section title={editId ? 'Edit PO Row' : 'Add PO Row'}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Purchase Order Date"><Input type="date" value={form.purchaseOrderDate} onChange={v => f('purchaseOrderDate', v)} /></Field>
            <Field label="Purchase Order Number"><Input value={form.purchaseOrderNumber} onChange={v => f('purchaseOrderNumber', v)} /></Field>
            <Field label="Vendor Name"><Input value={form.vendorName} onChange={v => f('vendorName', v)} /></Field>
            <Field label="Item Name"><Input value={form.itemName} onChange={v => f('itemName', v)} /></Field>
            <Field label="QuantityOrdered"><Input type="number" value={form.quantityOrdered} onChange={v => f('quantityOrdered', v)} /></Field>
            <Field label="Item.CF.Updated Qty"><Input type="number" value={form.updatedQty} onChange={v => f('updatedQty', v)} /></Field>
            <Field label="Item Price"><Input type="number" value={form.itemPrice} onChange={v => f('itemPrice', v)} /></Field>
            <Field label="Item.CF.Updated Price"><Input type="number" value={form.updatedPrice} onChange={v => f('updatedPrice', v)} /></Field>
            <Field label="CF.PO end Date"><Input type="date" value={form.poEndDate} onChange={v => f('poEndDate', v)} /></Field>
          </div>
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.purchaseOrderNumber || !form.itemName} variant="success">
              {editId ? 'Update' : 'Save'}
            </Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Purchase Orders">
        <DataTable columns={columns} data={purchaseOrders} onEdit={startEdit} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// CUSTOMER ORDERS (uploaded from ERP Orders Excel; drives FG Reserved / Free FG)
// ═══════════════════════════════════════════════════════════════
function mapOrderRow(row) {
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
  return {
    orderDate:            toISODate(pick('opportunitydate', 'orderdate', 'date')),
    orderId:              String(pick('orderid')).trim(),
    childOrderId:         String(pick('childorderid')).trim(),
    lineId:               String(pick('skuid')).trim(),               // per-line id (reference)
    customer:             String(pick('distributorname', 'customer', 'billtoname')).trim(),
    mmId:                 String(pick('mmid', 'skucode', 'sku')).trim(), // == SKU master skuCode
    description:          String(pick('mmdescription', 'description')).trim(),
    quantity:             num(pick('quantity')),                       // ordered qty in MT
    releaseQty:           num(pick('releaseqty')),                     // released (committed) qty in MT
    invoicedQty:          num(pick('invoicedqty')),                    // shipped/invoiced qty in MT; reserved = release − invoiced
    orderStatus:          String(pick('orderstatus', 'status')).trim(),
    expectedDeliveryDate: toISODate(pick('expecteddeliverydate')),
  }
}

function Orders({ orders, setOrders, dispatches }) {
  const [uploadMsg, setUploadMsg] = useState(null)
  const fileRef = useRef(null)

  // Per-order-line invoiced (matched to the line via Sku ID, max of dispatch-file match and the
  // ERP's own Invoiced Qty) and the resulting pending. Lets each order show what's invoiced against
  // IT — a same-SKU invoice for a different order never inflates this line's invoiced/pending.
  const shipped = useMemo(() => shippedByOrderLine(dispatches), [dispatches])
  const lineInvoiced = useCallback((o) => orderLineInvoiced(o, shipped), [shipped])
  const linePending = useCallback((o) => isOpenOrderStatus(o.orderStatus)
    ? Math.max(0, Number(o.quantity || 0) - lineInvoiced(o)) : 0, [lineInvoiced])

  const onUpload = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const XLSX = await import('xlsx')
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })
      const ws = wb.Sheets[wb.SheetNames[0]]
      if (!ws) { setUploadMsg({ kind: 'err', text: 'Workbook has no sheets' }); return }
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true })
      const parsed = rows.map(mapOrderRow).filter(r => r.mmId)
      if (!parsed.length) {
        setUploadMsg({ kind: 'err', text: 'No valid order rows found (need an MM ID column)' })
        return
      }
      // Replace-all: the uploaded sheet is the current snapshot of the order book.
      const newRecords = parsed.map(r => ({ ...r, id: uid(), deleted: false }))
      const openLines = newRecords.filter(r => isOpenOrderStatus(r.orderStatus))
      const openMt = openLines.reduce((s, r) => s + Number(r.quantity || 0), 0)
      setOrders(newRecords)
      setUploadMsg({ kind: 'ok', text: `Imported ${newRecords.length} order line(s), replacing the previous set · ${openLines.length} open · ${fmtT(openMt)} MT booked (pre-dispatch)` })
    } catch (err) {
      console.error(err)
      setUploadMsg({ kind: 'err', text: `Upload failed: ${err.message}` })
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const statusBadge = (s) => {
    const open = isOpenOrderStatus(s)
    return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${open ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`}>{s || '—'}</span>
  }

  const columns = [
    { label: 'Order Date',    key: 'orderDate' },
    { label: 'Order ID',      key: 'orderId' },
    { label: 'Customer',      key: 'customer' },
    { label: 'MM ID (SKU)',   key: 'mmId' },
    { label: 'Description',   key: 'description' },
    { label: 'Qty (MT)',      value: r => fmtT(r.quantity) },
    { label: 'Invoiced (MT)', value: r => fmtT(lineInvoiced(r)) },
    { label: 'Pending (MT)',  value: r => fmtT(linePending(r)) },
    { label: 'Status',        render: r => statusBadge(r.orderStatus) },
    { label: 'Exp. Delivery', key: 'expectedDeliveryDate' },
  ]

  const activeOrders = (orders || []).filter(o => !o.deleted)
  const openCount = activeOrders.filter(o => isOpenOrderStatus(o.orderStatus)).length

  const downloadOrdersCSV = () => {
    downloadCSV(`orders-${today()}.csv`,
      ['Order Date', 'Order ID', 'Child Order ID', 'Customer', 'MM ID', 'Description', 'Qty (MT)', 'Invoiced (MT)', 'Pending (MT)', 'Status', 'Expected Delivery'],
      activeOrders.map(r => [r.orderDate, r.orderId, r.childOrderId, r.customer, r.mmId, r.description, r.quantity, fmtT(lineInvoiced(r)), fmtT(linePending(r)), r.orderStatus, r.expectedDeliveryDate]))
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Orders</h2>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onUpload} className="hidden" />
          <Btn variant="ghost" onClick={downloadOrdersCSV} disabled={activeOrders.length === 0}>⬇ Download CSV</Btn>
          <Btn onClick={() => fileRef.current?.click()}>Upload Orders Excel</Btn>
        </div>
      </div>

      {uploadMsg && (
        <div className={`px-3 py-2 rounded text-sm ${uploadMsg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'}`}>
          {uploadMsg.text}
        </div>
      )}

      <p className="text-xs text-slate-400">
        Uploading <strong>replaces the entire order book</strong> with the sheet's contents (current snapshot).
        <strong> Invoiced</strong> = shipped against <em>this</em> order line (matched per order by Sku ID, so another order's
        dispatch of the same SKU never counts here); <strong>Pending</strong> = Qty − Invoiced for open orders (Confirmed / Delivery in progress).
        {' '}{activeOrders.length} order line(s) · {openCount} open.
      </p>

      <Section title="Customer Orders">
        <DataTable columns={columns} data={orders} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// SALES — distributor-wise sales matrix with SKU drill-down + distributor & period filters.
// Absorbs the former Fulfilment views (Open Order Backlog, SKU Demand vs Supply).
// ═══════════════════════════════════════════════════════════════
function SalesDashboard({ orders, dispatches, productions, skus }) {
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])
  const tot = (arr, k) => arr.reduce((s, r) => s + Number(r[k] || 0), 0)
  const redIfNeg = (v) => <span className={Number(v) < 0 ? 'text-red-600 font-semibold' : ''}>{fmtT(v)}</span>

  // ── Filters ──
  const [period, setPeriod] = useState('')          // '' = All Time · 'YYYY-MM' · 'custom'
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [distributor, setDistributor] = useState('') // '' = All distributors
  const [selectedCustomer, setSelectedCustomer] = useState(null)

  // Month options from order + dispatch dates (string slice — dates are already YYYY-MM-DD).
  const monthOptions = useMemo(() => {
    const set = new Set()
    ;(orders || []).forEach(o => { const m = String(o.orderDate || '').slice(0, 7); if (m) set.add(m) })
    ;(dispatches || []).forEach(d => { const m = String(d.dateOfDispatch || '').slice(0, 7); if (m) set.add(m) })
    return [...set].sort().reverse()
  }, [orders, dispatches])

  const inPeriod = useCallback((dateStr) => {
    const s = String(dateStr || '')
    if (period === '') return true
    if (period === 'custom') return s !== '' && (!from || s >= from) && (!to || s <= to)
    return s.slice(0, 7) === period
  }, [period, from, to])

  const ordersF = useMemo(() => (orders || []).filter(o => inPeriod(o.orderDate)), [orders, inPeriod])
  const dispatchesF = useMemo(() => (dispatches || []).filter(d => inPeriod(d.dateOfDispatch)), [dispatches, inPeriod])

  // Inventory/Free are LIVE — always derived from UNFILTERED data (point-in-time stock).
  const demand = useMemo(() => skuDemandSupply(productions, dispatches, orders, skus), [productions, dispatches, orders, skus])
  const invByCode = useMemo(() => Object.fromEntries(demand.map(r => [r.skuCode, r])), [demand])

  // Pass full (unfiltered) dispatches as the 4th arg so per-line invoiced/pending counts cumulative
  // shipments (incl. prior periods); dispatchesF stays the period flow for the "Invoiced · Period" column.
  const allRows = useMemo(() => distributorSalesRows(ordersF, dispatchesF, invByCode, dispatches), [ordersF, dispatchesF, invByCode, dispatches])
  const rows = useMemo(() => distributor ? allRows.filter(r => r.id === distributor) : allRows, [allRows, distributor])
  const selected = useMemo(() => allRows.find(r => r.id === selectedCustomer) || null, [allRows, selectedCustomer])
  const backlog = useMemo(() => orderBacklog(ordersF, dispatchesF), [ordersF, dispatchesF])

  const distOptions = useMemo(() => allRows.map(r => r.customer).filter(c => c && c !== '—').sort(), [allRows])
  const todayStr = today()
  const globalFree = tot(demand, 'free')
  const periodLabel = period === '' ? 'All Time' : period === 'custom' ? `${from || '…'} → ${to || '…'}` : period
  const fillRate = tot(rows, 'validOrders') > 0 ? (tot(rows, 'dispatched') / tot(rows, 'validOrders')) * 100 : 0

  // Product type (SHS/RHS/CHS) from the SKU master, falling back to the description.
  const skuTypeOf = useCallback((code, desc) => skus.find(s => s.skuCode === code)?.productType
    || (/\b(SHS|RHS|CHS)\b/i.exec(desc || '')?.[1]?.toUpperCase() ?? ''), [skus])
  const skuSizeOf = useCallback((code, desc) =>
    skuSizeLabel(skus.find(s => s.skuCode === code), desc), [skus])

  // Inventory & Free are intentionally NOT totalled here — they're a shared global pool and
  // would double-count across distributors (see the note under the table).
  const salesCols = [
    { label: 'Distributor', key: 'customer' },
    { label: 'Valid Orders (T)', value: r => r.validOrders, render: r => fmtT(r.validOrders), total: v => fmtT(v) },
    { label: 'Invoiced · Period (T)', value: r => r.dispatched, render: r => fmtT(r.dispatched), total: v => fmtT(v) },
    { label: 'Invoiced vs Orders (T)', value: r => r.invoicedVsOrders, render: r => fmtT(r.invoicedVsOrders), total: v => fmtT(v) },
    { label: 'Pending to Invoice (T)', value: r => r.pending, render: r => fmtT(r.pending), total: v => fmtT(v) },
    { label: 'Inventory (T)', value: r => r.inventory, render: r => fmtT(r.inventory) },
    { label: 'Free Stock (T)', value: r => r.free, render: r => redIfNeg(r.free) },
    { label: 'Open Orders', value: r => r.openOrders, total: v => v },
  ]
  // Per-SKU breakup for the selected distributor. Reserved = released − invoiced (active orders);
  // "Available (Most Relevant)" = global free stock for the SKU (Inventory − Reserved) — the headline
  // number for whether this order can be fulfilled from stock.
  const skuCols = [
    { label: 'SKU', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'Valid Orders (T)', value: r => r.validOrders, render: r => fmtT(r.validOrders), total: v => fmtT(v) },
    { label: 'Invoiced · Period (T)', value: r => r.dispatched, render: r => fmtT(r.dispatched), total: v => fmtT(v) },
    { label: 'Invoiced vs Orders (T)', value: r => r.invoicedVsOrders, render: r => fmtT(r.invoicedVsOrders), total: v => fmtT(v) },
    { label: 'Pending to Invoice (T)', value: r => r.pending, render: r => fmtT(r.pending), total: v => fmtT(v) },
    { label: 'Reserved (T)', value: r => r.reserved, render: r => fmtT(r.reserved), total: v => fmtT(v) },
    { label: 'Inventory (T)', value: r => r.inventory, render: r => fmtT(r.inventory), total: v => fmtT(v) },
    { label: 'Available (Most Relevant) (T)', value: r => r.available, render: r => redIfNeg(r.available), total: v => redIfNeg(v) },
  ]
  const skuBreakupFilters = [
    { key: 'type', label: 'Type', accessor: r => skuTypeOf(r.skuCode, r.description), options: ['SHS', 'RHS', 'CHS'] },
    { key: 'size', label: 'Size', accessor: r => skuSizeOf(r.skuCode, r.description) },
    { key: 'reserved', label: 'Reserved', accessor: r => r.reserved > 0 ? 'Reserved' : 'None', options: ['Reserved', 'None'] },
    { key: 'inv', label: 'Inventory', accessor: r => r.inventory > 0 ? 'In stock' : r.inventory < 0 ? 'Negative' : 'Zero', options: ['In stock', 'Zero', 'Negative'] },
  ]
  const backlogCols = [
    { label: 'Order ID', key: 'orderId' },
    { label: 'Customer', key: 'customer' },
    { label: 'SKU', value: r => skuDesc(r.skuCode) },
    { label: 'Ordered (T)', value: r => r.ordered, render: r => fmtT(r.ordered), total: v => fmtT(v) },
    { label: 'Shipped (T)', value: r => r.shipped, render: r => fmtT(r.shipped), total: v => fmtT(v) },
    { label: 'Open (T)', value: r => r.open, render: r => fmtT(r.open), total: v => fmtT(v) },
    { label: 'Fulfilment', value: r => r.fulfilmentPct, render: r => `${r.fulfilmentPct.toFixed(0)}%` },
    { label: 'Exp. Delivery', key: 'expectedDeliveryDate' },
    { label: 'Status', key: 'orderStatus' },
  ]
  const demandCols = [
    { label: 'SKU', value: r => r.skuCode },
    { label: 'Description', key: 'description' },
    { label: 'Ordered (T)', value: r => r.ordered, render: r => fmtT(r.ordered), total: v => fmtT(v) },
    { label: 'Produced (T)', value: r => r.produced, render: r => fmtT(r.produced), total: v => fmtT(v) },
    { label: 'Shipped (T)', value: r => r.shipped, render: r => fmtT(r.shipped), total: v => fmtT(v) },
    { label: 'Inventory (T)', value: r => r.inventory, render: r => fmtT(r.inventory), total: v => fmtT(v) },
    { label: 'Booked (T)', value: r => r.booked, render: r => fmtT(r.booked), total: v => fmtT(v) },
    { label: 'Free (T)', value: r => r.free, render: r => redIfNeg(r.free), total: v => redIfNeg(v) },
  ]

  const inputCls = 'px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Sales Dashboard</h2>
        <Btn size="sm" variant="ghost" onClick={() => downloadCSV(`distributor-sales-${todayStr}.csv`,
          ['Distributor', 'Valid Orders (T)', 'Invoiced Period (T)', 'Invoiced vs Orders (T)', 'Pending to Invoice (T)', 'Inventory (T)', 'Free Stock (T)', 'Open Orders'],
          rows.map(r => [r.customer, fmtT(r.validOrders), fmtT(r.dispatched), fmtT(r.invoicedVsOrders), fmtT(r.pending), fmtT(r.inventory), fmtT(r.free), r.openOrders]))}>⬇ Sales CSV</Btn>
      </div>
      <p className="text-xs text-slate-400 -mt-3">
        Distributor-wise demand vs invoiced shipments. <strong>Valid Orders</strong> = ordered qty (excludes Cancelled/Rejected);
        <strong> Invoiced · Period</strong> = weight shipped to the customer this period (any order); <strong>Invoiced vs Orders</strong> = invoiced
        raised against <em>these</em> order lines (matched per order); <strong>Pending to Invoice</strong> = Valid Orders − Invoiced vs Orders, per order line.
        Flow columns follow the period filter (<strong>{periodLabel}</strong>); <strong>Inventory &amp; Free Stock are live</strong> (current
        global pool, not period-scoped) shown as the shared pool for each distributor's ordered SKUs — not exclusive, not additive. All weights in MT.
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Valid Orders" value={`${fmtT(tot(rows, 'validOrders'))} T`} sub="Ordered qty (excl. cancelled/rejected)" color="indigo" />
        <Card title="Invoiced · Period" value={`${fmtT(tot(rows, 'dispatched'))} T`} sub={`Shipped this period · fill ${fillRate.toFixed(0)}%`} color="emerald" />
        <Card title="Invoiced vs Orders" value={`${fmtT(tot(rows, 'invoicedVsOrders'))} T`} sub="Invoiced against these orders" color="emerald" />
        <Card title="Pending to Invoice" value={`${fmtT(tot(rows, 'pending'))} T`} sub="Ordered − invoiced, per order line" color="amber" />
        <Card title="Free Stock (live)" value={<>{redIfNeg(globalFree)} T</>} sub="Global inventory − booked" color="cyan" />
      </div>

      <Section title="Distributor-wise Sales" actions={
        <div className="flex items-center gap-2 flex-wrap">
          <select value={distributor} onChange={e => setDistributor(e.target.value)} className={inputCls}>
            <option value="">All Distributors</option>
            {distOptions.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select value={period} onChange={e => setPeriod(e.target.value)} className={inputCls}>
            <option value="">All Time</option>
            {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
            <option value="custom">Custom range…</option>
          </select>
          {period === 'custom' && <>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} className={inputCls} />
            <span className="text-sm text-slate-500">to</span>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} className={inputCls} />
          </>}
        </div>
      }>
        {rows.length ? (
          <>
            <DataTable columns={salesCols} data={rows} excel maxHeight="60vh"
              onRowClick={r => setSelectedCustomer(r.id)}
              highlightRow={r => r.id === selectedCustomer} />
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              <strong>Total</strong> — Valid Orders {fmtT(tot(rows, 'validOrders'))}T · Invoiced·Period {fmtT(tot(rows, 'dispatched'))}T · Invoiced vs Orders {fmtT(tot(rows, 'invoicedVsOrders'))}T · Pending {fmtT(tot(rows, 'pending'))}T.
              {' '}Inventory &amp; Free omitted from the total (shared pool — would double-count across distributors).
              {' '}Click a distributor for its SKU-wise breakdown.
            </p>
          </>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No order / dispatch data for this period</p>}
      </Section>

      {selected && (
        <Section title={`SKU Breakdown — ${selected.customer}`} actions={
          <div className="flex items-center gap-2">
            <Btn size="sm" variant="ghost" disabled={!selected.skuRows.length} onClick={() => downloadCSV(
              `sku-breakdown-${(selected.customer || 'distributor').replace(/[^\w-]+/g, '_')}-${todayStr}.csv`,
              ['SKU', 'Description', 'Valid Orders (T)', 'Invoiced Period (T)', 'Invoiced vs Orders (T)', 'Pending to Invoice (T)', 'Reserved (T)', 'Inventory (T)', 'Available (Most Relevant) (T)'],
              selected.skuRows.map(r => [r.skuCode, r.description, fmtT(r.validOrders), fmtT(r.dispatched), fmtT(r.invoicedVsOrders), fmtT(r.pending), fmtT(r.reserved), fmtT(r.inventory), fmtT(r.available)]))}>⬇ SKU CSV</Btn>
            <Btn size="sm" variant="ghost" onClick={() => setSelectedCustomer(null)}>× Close</Btn>
          </div>
        }>
          {selected.skuRows.length ? (
            <>
              <DataTable columns={skuCols} data={selected.skuRows} filters={skuBreakupFilters} excel maxHeight="60vh" />
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                <strong>Total</strong> — Valid Orders {fmtT(tot(selected.skuRows, 'validOrders'))}T · Invoiced·Period {fmtT(tot(selected.skuRows, 'dispatched'))}T · Invoiced vs Orders {fmtT(tot(selected.skuRows, 'invoicedVsOrders'))}T · Pending {fmtT(tot(selected.skuRows, 'pending'))}T · Reserved {fmtT(tot(selected.skuRows, 'reserved'))}T.
                {' '}<strong>Reserved</strong> = released − invoiced (active orders); <strong>Available (Most Relevant)</strong> = Inventory − Reserved, the live global free stock per SKU.
              </p>
            </>
          ) : <p className="text-sm text-slate-400 py-8 text-center">No SKU rows for this distributor</p>}
        </Section>
      )}

      <Section title={`Open Order Backlog (${backlog.length})`}>
        {backlog.length ? (
          <>
            <p className="mb-3 text-xs text-slate-400">One row per still-open order line (open = ordered − shipped &gt; 0), oldest expected delivery first; <span className="text-red-600 font-semibold">overdue</span> rows highlighted. Open total {fmtT(tot(backlog, 'open'))}T.</p>
            <DataTable columns={backlogCols} data={backlog} excel maxHeight="60vh" highlightRow={r => r.expectedDeliveryDate && r.expectedDeliveryDate < todayStr}
              filters={[
                { key: 'status', label: 'Status', accessor: r => r.orderStatus },
                { key: 'type', label: 'Type', accessor: r => skuTypeOf(r.skuCode) },
              ]} />
          </>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No open orders for this period</p>}
      </Section>

      <Section title="SKU Demand vs Supply">
        {demand.length ? (
          <>
            <p className="mb-3 text-xs text-slate-400">
              Ordered {fmtT(tot(demand, 'ordered'))}T · Produced {fmtT(tot(demand, 'produced'))}T · Shipped {fmtT(tot(demand, 'shipped'))}T · Booked {fmtT(tot(demand, 'booked'))}T · Free {fmtT(tot(demand, 'free'))}T.
              Inventory = produced − shipped; Booked = open orders (net of shipment); Free = inventory − booked (negative = over-committed). Live, not period-scoped.
            </p>
            <DataTable columns={demandCols} data={demand} excel maxHeight="60vh"
              highlightRow={r => r.free < 0} highlightClass="bg-red-50 dark:bg-red-900/30"
              filters={[
                { key: 'type', label: 'Type', accessor: r => skuTypeOf(r.skuCode, r.description) },
                { key: 'size', label: 'Size', accessor: r => skuSizeOf(r.skuCode, r.description) },
              ]} />
          </>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No order / production / dispatch data yet</p>}
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
  { key: 'poMaster', label: 'PO Master' },
  { key: 'orders', label: 'Orders' },
  { key: 'sales', label: 'Sales' },
]

const TABLE_LABELS = {
  coils: 'Coil Inward',
  baby_coils: 'Slitting',
  productions: 'Production',
  dispatches: 'Dispatches',
  skus: 'SKU Master',
  purchase_orders: 'PO Master',
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

export default function App() {
  const [dark, setDark] = useState(() => LS.get('jsw:dark') ?? false)
  const [tab, setTab] = useState('dashboard')
  const [coils, setCoils, coilsLoading] = useSupabaseStore('jsw:coils', [])
  const [babyCoils, setBabyCoils, babyCoilsLoading] = useSupabaseStore('jsw:babyCoils', [])
  const [productions, setProductions, productionsLoading] = useSupabaseStore('jsw:productions', [])
  const [dispatches, setDispatches, dispatchesLoading] = useSupabaseStore('jsw:dispatches', [])
  const [skus, setSkus, skusLoading] = useSupabaseStore('jsw:skus', DEFAULT_SKUS)
  const [purchaseOrders, setPurchaseOrders, poLoading] = useSupabaseStore('jsw:purchaseOrders', [])
  const [orders, setOrders, ordersLoading] = useSupabaseStore('jsw:orders', [])

  const loading = coilsLoading || babyCoilsLoading || productionsLoading || dispatchesLoading || skusLoading || poLoading || ordersLoading

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
        {tab === 'dashboard' && <Dashboard coils={coils} productions={productions} dispatches={dispatches} skus={skus} purchaseOrders={purchaseOrders} babyCoils={babyCoils} orders={orders} />}
        {tab === 'coilTracker' && <CoilTracker coils={coils} productions={productions} dispatches={dispatches} />}
        {tab === 'coilInward' && <CoilInward coils={coils} setCoils={setCoils} dispatches={dispatches} productions={productions} babyCoils={babyCoils} />}
        {tab === 'slitting' && <Slitting coils={coils} babyCoils={babyCoils} setBabyCoils={setBabyCoils} productions={productions} />}
        {tab === 'production' && <Production coils={coils} babyCoils={babyCoils} productions={productions} setProductions={setProductions} dispatches={dispatches} skus={skus} />}
        {tab === 'dispatch' && <Dispatch dispatches={dispatches} setDispatches={setDispatches} coils={coils} skus={skus} setSkus={setSkus} productions={productions} />}
        {tab === 'skuMaster' && <SKUMaster skus={skus} setSkus={setSkus} />}
        {tab === 'poMaster' && <POMaster purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} />}
        {tab === 'orders' && <Orders orders={orders} setOrders={setOrders} dispatches={dispatches} />}
        {tab === 'sales' && <SalesDashboard orders={orders} dispatches={dispatches} productions={productions} skus={skus} />}
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

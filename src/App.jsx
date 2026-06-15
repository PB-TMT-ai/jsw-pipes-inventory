import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useSupabaseStore } from './lib/db'
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
const fmtT = (v) => v != null ? Number(v).toFixed(3) : '—'
const fmtPct = (v) => v != null ? Number(v).toFixed(1) + '%' : '—'
const fmtINR = (v) => v != null && !isNaN(v) ? '₹' + Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 }) : '—'

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

function genHRCoilId(dateStr, num) {
  const d = new Date(dateStr)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const yy = String(d.getFullYear()).slice(2)
  return `HYD-${mm}${yy}-${String(num).padStart(2, '0')}`
}

function tolerance(actual, expected, tol = 0.05) {
  if (!expected || !actual) return { ok: true, pct: 0, label: '—' }
  const pct = (actual / expected) * 100
  const ok = pct >= (1 - tol) * 100 && pct <= (1 + tol) * 100
  return { ok, pct, label: `${actual.toFixed(1)} / ${expected.toFixed(1)} (${pct.toFixed(1)}%)` }
}

// ═══════════════════════════════════════════════════════════════
// SHARED UI COMPONENTS
// ═══════════════════════════════════════════════════════════════
const Badge = ({ ok, text }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${ok ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200'}`}>
    {ok ? '✔' : '⚠'} {text}
  </span>
)

const YieldBadge = ({ pct }) => {
  if (pct == null || isNaN(pct)) return <span className="text-slate-400">—</span>
  const color = pct >= 95 ? 'bg-green-100 text-green-800' : pct >= 90 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
  return <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${color}`}>{pct.toFixed(1)}%</span>
}

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

function DataTable({ columns, data, actions, onEdit, onDelete, onRowClick, highlightRow }) {
  const [search, setSearch] = useState('')
  const [sortCol, setSortCol] = useState(null)
  const [sortDir, setSortDir] = useState('asc')

  const filtered = useMemo(() => {
    let rows = data.filter(r => !r.deleted)
    if (search) {
      const q = search.toLowerCase()
      rows = rows.filter(r => columns.some(c => String(c.value ? c.value(r) : r[c.key] ?? '').toLowerCase().includes(q)))
    }
    if (sortCol != null) {
      const c = columns[sortCol]
      rows = [...rows].sort((a, b) => {
        const av = c.value ? c.value(a) : a[c.key], bv = c.value ? c.value(b) : b[c.key]
        const cmp = av < bv ? -1 : av > bv ? 1 : 0
        return sortDir === 'asc' ? cmp : -cmp
      })
    }
    return rows
  }, [data, search, sortCol, sortDir, columns])

  return (
    <div>
      <div className="mb-3"><SearchInput value={search} onChange={setSearch} /></div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-slate-50 dark:bg-slate-700">
              {columns.map((c, i) => (
                <th key={i} className="sticky top-0 px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap"
                  onClick={() => { setSortCol(i); setSortDir(sortCol === i && sortDir === 'asc' ? 'desc' : 'asc') }}>
                  {c.label} {sortCol === i ? (sortDir === 'asc' ? '↑' : '↓') : ''}
                </th>
              ))}
              {(onEdit || onDelete) && <th className="sticky top-0 px-4 py-3 text-xs font-medium text-slate-500 uppercase">Actions</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {filtered.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-4 py-8 text-center text-slate-400">No records found</td></tr>
            )}
            {filtered.map((row, ri) => (
              <tr key={row.id || ri}
                className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${onRowClick ? 'cursor-pointer' : ''} ${highlightRow && highlightRow(row) ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
                onClick={onRowClick ? () => onRowClick(row) : undefined}>
                {columns.map((c, ci) => (
                  <td key={ci} className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
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
            ))}
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
function CoilInward({ coils, setCoils, dispatches }) {
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
    if (confirm('Delete this coil record?')) setCoils(prev => prev.filter(c => c.id !== row.id))
  }

  // Cross-stage calculations — dispatched weight traced directly to this mother coil
  const getCoilStats = useCallback((coil) => {
    const dispatchedWt = dispatches.filter(d => !d.deleted).flatMap(d => d.bundleEntries || [])
      .filter(be => be.traceHrCoilId === coil.hrCoilId)
      .reduce((s, be) => s + Number(be.weight || 0), 0)
    const yieldPct = coil.actualWeight ? (dispatchedWt / coil.actualWeight) * 100 : 0
    return { dispatchedWt, yieldPct }
  }, [dispatches])

  const columns = [
    { label: 'HR Coil ID', key: 'hrCoilId' },
    { label: 'Date', key: 'dateOfInward' },
    { label: 'Input Coil #', key: 'inputCoilNumber' },
    { label: 'Grade', key: 'coilGrade' },
    { label: 'Thick (mm)', key: 'thickness' },
    { label: 'Width (mm)', key: 'width' },
    { label: 'Invoice Wt (T)', value: r => fmtT(r.invoiceWeight) },
    { label: 'Actual Wt (T)', value: r => fmtT(r.actualWeight) },
    { label: 'Dispatched Wt (T)', render: r => { const s = getCoilStats(r); return s.dispatchedWt > 0 ? <span>{fmtT(s.dispatchedWt)}</span> : <span className="text-slate-400">—</span> } },
    { label: 'Yield', render: r => { const s = getCoilStats(r); return s.dispatchedWt > 0 ? <YieldBadge pct={s.yieldPct} /> : <span className="text-slate-400">—</span> } },
    { label: 'Cost (₹)', value: r => r.costPrice ? `₹${Math.round(r.costPrice).toLocaleString()}` : '—' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 1: Coil Inward</h2>
        <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ Add Coil'}</Btn>
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
// STAGE 4: BUNDLE FORMATION
// ═══════════════════════════════════════════════════════════════
function BundleFormation({ coils, bundles, setBundles, skus }) {
  const emptyForm = { dateOfEntry: today(), hrCoilId: '', skuCode: '', tubeCount: '', bundleNo: '' }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [formMode, setFormMode] = useState('new') // 'new' | 'addSource'
  const [targetBundleId, setTargetBundleId] = useState(null)
  const [expandedBundles, setExpandedBundles] = useState(new Set())
  const [accSearch, setAccSearch] = useState('')
  const [accSortCol, setAccSortCol] = useState(null)
  const [accSortDir, setAccSortDir] = useState('asc')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  const nextBundleNo = useMemo(() => {
    const nums = bundles.filter(b => !b.deleted).map(b => Number(b.bundleNo))
    return nums.length ? Math.max(...nums) + 1 : 1
  }, [bundles])

  // Source mother coil + manually-chosen SKU; weight cascades from SKU.weightPerTube (kg → T)
  const coil = useMemo(() => coils.find(c => !c.deleted && c.hrCoilId === form.hrCoilId), [coils, form.hrCoilId])
  const sku = useMemo(() => skus.find(s => s.skuCode === form.skuCode), [skus, form.skuCode])
  const skuCode = form.skuCode || ''
  const weightPerPiece = sku?.weightPerTube ? Number(sku.weightPerTube) / 1000 : 0

  // Weight already bundled from this coil (across all bundles), excluding the row being edited
  const allocatedWeight = useMemo(() => {
    return bundles.filter(b => !b.deleted && b.hrCoilId === form.hrCoilId && b.id !== editId)
      .reduce((s, b) => s + Number(b.totalWeight || 0), 0)
  }, [bundles, form.hrCoilId, editId])

  const coilWeight = Number(coil?.actualWeight || 0)
  const prospectiveWeight = allocatedWeight + weightPerPiece * Number(form.tubeCount || 0)
  // Weight-based cap: pieces × wt/piece ≤ coil actual weight, with ±5% over-fill ceiling.
  const weightCeiling = coilWeight * 1.05
  const remainingWeight = coilWeight - prospectiveWeight
  const overFilled = coilWeight > 0 && prospectiveWeight > weightCeiling
  const overTolerance = coilWeight > 0 && prospectiveWeight > coilWeight && prospectiveWeight <= weightCeiling
  // Piece-equivalent of the remaining capacity, for the input placeholder
  const maxPieces = weightPerPiece > 0 && coilWeight > 0 ? Math.max(0, Math.floor((weightCeiling - allocatedWeight) / weightPerPiece)) : 0
  const bundleId = form.bundleNo ? `BND-${form.bundleNo}` : ''

  // Validate: same SKU in bundle
  const bundleRows = useMemo(() => bundles.filter(b => !b.deleted && b.bundleNo === Number(form.bundleNo) && b.id !== editId), [bundles, form.bundleNo, editId])
  const skuMismatch = bundleRows.length > 0 && bundleRows[0].skuCode && bundleRows[0].skuCode !== skuCode

  // Duplicate check
  const isDupe = bundles.some(b => !b.deleted && b.bundleId === bundleId && b.hrCoilId === form.hrCoilId && b.id !== editId)

  const save = () => {
    const record = {
      ...form, id: editId || uid(),
      bundleNo: Number(form.bundleNo || nextBundleNo),
      bundleId: `BND-${form.bundleNo || nextBundleNo}`,
      hrCoilId: form.hrCoilId, skuCode, weightPerPiece,
      tubeCount: Number(form.tubeCount),
      totalWeight: weightPerPiece * Number(form.tubeCount),
      dispatched: false, deleted: false,
    }
    if (editId) {
      setBundles(prev => prev.map(b => b.id === editId ? record : b))
    } else {
      setBundles(prev => [...prev, record])
    }
    cancelForm()
  }

  const cancelForm = () => {
    setForm(emptyForm); setEditId(null); setShowForm(false)
    setFormMode('new'); setTargetBundleId(null)
  }

  const openNewBundleForm = () => {
    setForm({ ...emptyForm, bundleNo: String(nextBundleNo) })
    setEditId(null); setFormMode('new'); setTargetBundleId(null); setShowForm(true)
  }

  const openAddSourceForm = (bid, bundleNo) => {
    const grpSku = bundleGroups[bid]?.skuCode || ''
    setForm({ ...emptyForm, bundleNo: String(bundleNo), skuCode: grpSku })
    setEditId(null); setFormMode('addSource'); setTargetBundleId(bid); setShowForm(true)
  }

  const startEdit = (row) => {
    setForm({ ...row, bundleNo: String(row.bundleNo) })
    setEditId(row.id); setFormMode('new'); setTargetBundleId(null); setShowForm(true)
  }

  const softDelete = (row) => { if (confirm('Delete this source row?')) setBundles(prev => prev.map(b => b.id === row.id ? { ...b, deleted: true } : b)) }

  const toggleExpand = (bid) => {
    setExpandedBundles(prev => {
      const next = new Set(prev)
      if (next.has(bid)) next.delete(bid); else next.add(bid)
      return next
    })
  }

  // Mother coil options — keyed on remaining weight (SKU is chosen per row)
  const coilOptions = useMemo(() => {
    return coils.filter(c => !c.deleted).map(c => {
      const alloc = bundles.filter(b => !b.deleted && b.hrCoilId === c.hrCoilId)
        .reduce((s, b) => s + Number(b.totalWeight || 0), 0)
      const rem = Number(c.actualWeight || 0) - alloc
      return { value: c.hrCoilId, label: `${c.hrCoilId} — ${fmtT(rem)}T remaining (${c.coilGrade || '—'})`, _rem: rem }
    }).filter(opt => (editId && opt.value === form.hrCoilId) ? true : opt._rem > 0)
  }, [coils, bundles, editId, form.hrCoilId])

  // SKU options — published; soft-filtered to ±5% of the mother coil's thickness
  const skuOptions = useMemo(() => {
    const published = skus.filter(s => s.status === 'published')
    const eligible = coil && Number(coil.thickness)
      ? published.filter(s => Math.abs(Number(s.thickness) - Number(coil.thickness)) <= 0.05 * Number(coil.thickness))
      : published
    return eligible.map(s => ({ value: s.skuCode, label: s.description || s.skuCode }))
  }, [skus, coil])

  // Group by bundle for display
  const bundleGroups = useMemo(() => {
    const groups = {}
    bundles.filter(b => !b.deleted).forEach(b => {
      if (!groups[b.bundleId]) groups[b.bundleId] = { rows: [], totalPieces: 0, totalWeight: 0, skuCode: b.skuCode }
      groups[b.bundleId].rows.push(b)
      groups[b.bundleId].totalPieces += Number(b.tubeCount || 0)
      groups[b.bundleId].totalWeight += Number(b.totalWeight || 0)
    })
    // Dispatched = true only when ALL rows in the bundle are dispatched
    Object.values(groups).forEach(g => { g.dispatched = g.rows.every(r => r.dispatched) })
    return groups
  }, [bundles])

  // Filtered and sorted groups for accordion
  const filteredGroups = useMemo(() => {
    let entries = Object.entries(bundleGroups)
    if (accSearch) {
      const q = accSearch.toLowerCase()
      entries = entries.filter(([bid, g]) =>
        bid.toLowerCase().includes(q) ||
        (skuDesc(g.skuCode) || '').toLowerCase().includes(q) ||
        g.rows.some(r => (r.hrCoilId || '').toLowerCase().includes(q))
      )
    }
    if (accSortCol !== null) {
      const sortFns = [
        (a, b) => a[0].localeCompare(b[0]),
        (a, b) => (skuDesc(a[1].skuCode) || '').localeCompare(skuDesc(b[1].skuCode) || ''),
        (a, b) => a[1].totalPieces - b[1].totalPieces,
        (a, b) => a[1].totalWeight - b[1].totalWeight,
        (a, b) => a[1].rows.length - b[1].rows.length,
        (a, b) => (a[1].dispatched ? 1 : 0) - (b[1].dispatched ? 1 : 0),
      ]
      const fn = sortFns[accSortCol]
      if (fn) entries = [...entries].sort((a, b) => accSortDir === 'asc' ? fn(a, b) : fn(b, a))
    }
    return entries
  }, [bundleGroups, accSearch, accSortCol, accSortDir, skuDesc])

  const accColumns = ['Bundle ID', 'SKU Description', 'Total Pieces', 'Total Weight (T)', '# Sources', 'Status']

  const canSave = form.hrCoilId && form.skuCode && form.tubeCount && !skuMismatch && !isDupe && !overFilled

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 2: Bundle Formation</h2>
        <Btn onClick={() => { if (showForm) cancelForm(); else openNewBundleForm() }}>
          {showForm ? 'Cancel' : '+ New Bundle'}
        </Btn>
      </div>

      {/* Mode A: New Bundle / Edit Source Row */}
      {showForm && formMode === 'new' && (
        <Section title={editId ? 'Edit Source Row' : 'Create New Bundle'}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Field label="Date of Entry"><Input type="date" value={form.dateOfEntry} onChange={v => f('dateOfEntry', v)} /></Field>
            <Field label="Bundle No."><Input type="number" value={form.bundleNo || nextBundleNo} onChange={v => f('bundleNo', v)} /></Field>
            <Field label="Mother Coil (HR Coil ID)"><Select value={form.hrCoilId} onChange={v => f('hrCoilId', v)} options={coilOptions} /></Field>
            <Field label="SKU" helper={coil ? 'Filtered to ±5% of coil thickness' : undefined}><Select value={form.skuCode} onChange={v => f('skuCode', v)} options={skuOptions} /></Field>
          </div>
          <div className="my-4 border-t border-slate-200 dark:border-slate-700" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="No. of Pieces"><Input type="number" value={form.tubeCount} onChange={v => f('tubeCount', v)} placeholder={`Max: ${maxPieces}`} /></Field>
            <Field label="Weight Remaining (T)" auto warn={overTolerance}><Input value={fmtT(remainingWeight)} disabled /></Field>
            <Field label="Wt/Piece (T)" auto><Input value={fmtT(weightPerPiece)} disabled /></Field>
            <Field label="Total Weight (T)" auto><Input value={fmtT(weightPerPiece * Number(form.tubeCount || 0))} disabled /></Field>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Bundle ID: <span className="font-mono font-medium">{bundleId || `BND-${nextBundleNo}`}</span>
          </p>
          {skuMismatch && <div className="mt-2"><Badge ok={false} text="SKU mismatch! All rows in a bundle must share the same SKU." /></div>}
          {isDupe && <div className="mt-2"><Badge ok={false} text="Duplicate Bundle ID + Mother Coil!" /></div>}
          {overTolerance && <div className="mt-2"><Badge ok={true} text={`Within tolerance — coil at ${fmtT(prospectiveWeight)}T of ${fmtT(coilWeight)}T (≤105%).`} /></div>}
          {overFilled && <div className="mt-2"><Badge ok={false} text={`Over-filled! Coil holds ~${fmtT(coilWeight)}T; this would bundle ${fmtT(prospectiveWeight)}T (>105%).`} /></div>}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!canSave} variant="success">{editId ? 'Update' : 'Save Bundle'}</Btn>
            <Btn variant="ghost" onClick={cancelForm}>Cancel</Btn>
          </div>
        </Section>
      )}

      {/* Mode B: Add Source to existing bundle */}
      {showForm && formMode === 'addSource' && (
        <Section title={`Add Source to ${targetBundleId}`}>
          <div className="flex items-center gap-6 p-3 bg-slate-50 dark:bg-slate-900 rounded-lg mb-4">
            <span className="text-sm text-slate-600 dark:text-slate-400">Bundle: <strong className="text-slate-900 dark:text-white">{targetBundleId}</strong></span>
            <span className="text-sm text-slate-600 dark:text-slate-400">SKU: <strong className="text-slate-900 dark:text-white">{skuDesc(bundleGroups[targetBundleId]?.skuCode)}</strong></span>
            <span className="text-sm text-slate-600 dark:text-slate-400">Current Pieces: <strong className="text-slate-900 dark:text-white">{bundleGroups[targetBundleId]?.totalPieces}</strong></span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date of Entry"><Input type="date" value={form.dateOfEntry} onChange={v => f('dateOfEntry', v)} /></Field>
            <Field label="Mother Coil (HR Coil ID)"><Select value={form.hrCoilId} onChange={v => f('hrCoilId', v)} options={coilOptions} /></Field>
            <Field label="No. of Pieces"><Input type="number" value={form.tubeCount} onChange={v => f('tubeCount', v)} placeholder={`Max: ${maxPieces}`} /></Field>
            <Field label="Wt/Piece (T)" auto><Input value={fmtT(weightPerPiece)} disabled /></Field>
          </div>
          {skuMismatch && <div className="mt-2"><Badge ok={false} text="SKU mismatch! All rows in a bundle must share the same SKU." /></div>}
          {overFilled && <div className="mt-2"><Badge ok={false} text={`Over-filled! Coil holds ~${fmtT(coilWeight)}T (>105%).`} /></div>}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!canSave} variant="success">Add Source</Btn>
            <Btn variant="ghost" onClick={cancelForm}>Cancel</Btn>
          </div>
        </Section>
      )}

      {/* Accordion table — grouped bundles with expandable source rows */}
      <Section title="Bundles" actions={<SearchInput value={accSearch} onChange={setAccSearch} />}>
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-700">
                <th className="w-10 px-2 py-3" />
                {accColumns.map((label, i) => (
                  <th key={i}
                    className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider cursor-pointer select-none whitespace-nowrap"
                    onClick={() => { setAccSortCol(i); setAccSortDir(accSortCol === i && accSortDir === 'asc' ? 'desc' : 'asc') }}
                  >
                    {label} {accSortCol === i ? (accSortDir === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
              {filteredGroups.length === 0 && (
                <tr><td colSpan={accColumns.length + 1} className="px-4 py-8 text-center text-slate-400">No bundles found</td></tr>
              )}
              {filteredGroups.map(([bid, g]) => (
                <React.Fragment key={bid}>
                  {/* Parent row */}
                  <tr className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer ${g.dispatched ? 'border-l-4 border-l-green-400' : ''}`}
                    onClick={() => toggleExpand(bid)}>
                    <td className="px-2 py-3 text-center text-slate-400">
                      <span className={`inline-block transition-transform duration-150 ${expandedBundles.has(bid) ? 'rotate-90' : ''}`}>▶</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">{bid}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{skuDesc(g.skuCode)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{g.totalPieces}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{fmtT(g.totalWeight)}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{g.rows.length}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {g.dispatched ? <Badge ok={true} text="Dispatched" /> : <span className="text-xs text-slate-400">Pending</span>}
                    </td>
                  </tr>

                  {/* Expanded child rows */}
                  {expandedBundles.has(bid) && (
                    <>
                      <tr className="bg-slate-100/50 dark:bg-slate-800/50">
                        <td />
                        <td colSpan={accColumns.length} className="px-4 py-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">Coil Sources</span>
                            {!g.dispatched && (
                              <Btn size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); openAddSourceForm(bid, g.rows[0].bundleNo) }}>+ Add Source</Btn>
                            )}
                          </div>
                        </td>
                      </tr>
                      <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                        <td />
                        <td className="px-4 py-2 text-xs font-medium text-slate-500 uppercase pl-8">Mother Coil</td>
                        <td className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Pieces</td>
                        <td className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Wt/Piece (T)</td>
                        <td className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Total Wt (T)</td>
                        <td colSpan={2} className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Actions</td>
                      </tr>
                      {g.rows.map(row => (
                        <tr key={row.id} className="bg-slate-50/30 dark:bg-slate-800/20 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20">
                          <td />
                          <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 pl-8">{row.hrCoilId}</td>
                          <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">{row.tubeCount}</td>
                          <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">{fmtT(row.weightPerPiece)}</td>
                          <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300">{fmtT(row.totalWeight)}</td>
                          <td colSpan={2} className="px-4 py-2 whitespace-nowrap">
                            {!row.dispatched && (
                              <div className="flex gap-1">
                                <Btn size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); startEdit(row) }}>Edit</Btn>
                                <Btn size="sm" variant="danger" onClick={(e) => { e.stopPropagation(); softDelete(row) }}>Del</Btn>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-slate-100/70 dark:bg-slate-800/50 border-b-2 border-slate-300 dark:border-slate-600">
                        <td />
                        <td className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 pl-8">Total</td>
                        <td className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{g.totalPieces}</td>
                        <td className="px-4 py-2 text-xs text-slate-400">—</td>
                        <td className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300">{fmtT(g.totalWeight)}</td>
                        <td colSpan={2} />
                      </tr>
                    </>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-slate-400">
          {filteredGroups.length} bundle{filteredGroups.length !== 1 ? 's' : ''} ({bundles.filter(b => !b.deleted).length} source rows)
        </p>
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 5: DISPATCH
// ═══════════════════════════════════════════════════════════════
function Dispatch({ bundles, setBundles, dispatches, setDispatches, coils, skus }) {
  const emptyForm = { dateOfDispatch: today(), vehicleNo: '', invoiceNo: '', vehicleWeight: '', selectedBundles: [] }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [bundleToAdd, setBundleToAdd] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  // Undispatched bundles (grouped by bundleId). When editing a dispatch, also include
  // the bundles already on that record so they stay selectable mid-edit.
  const undispatchedBundles = useMemo(() => {
    const editingIds = editId ? new Set((dispatches.find(d => d.id === editId)?.bundleEntries || []).map(b => b.bundleId)) : new Set()
    const groups = {}
    bundles.filter(b => !b.deleted && (!b.dispatched || editingIds.has(b.bundleId))).forEach(b => {
      if (!groups[b.bundleId]) groups[b.bundleId] = { bundleId: b.bundleId, skuCode: b.skuCode, totalPieces: 0, totalWeight: 0, rows: [] }
      groups[b.bundleId].totalPieces += Number(b.tubeCount || 0)
      groups[b.bundleId].totalWeight += Number(b.totalWeight || 0)
      groups[b.bundleId].rows.push(b)
    })
    return Object.values(groups)
  }, [bundles, editId, dispatches])

  const bundleOptions = undispatchedBundles.map(b => ({ value: b.bundleId, label: `${b.bundleId} — ${skuDesc(b.skuCode)} — ${b.totalPieces} pcs, ${fmtT(b.totalWeight)}T` }))

  const addBundle = () => {
    if (!bundleToAdd) return
    const bg = undispatchedBundles.find(b => b.bundleId === bundleToAdd)
    if (!bg || form.selectedBundles.some(sb => sb.bundleId === bundleToAdd)) return
    // Trace directly to the mother coil; dimensions come from the SKU / coil
    const firstRow = bg.rows[0]
    const sku = skus.find(s => s.skuCode === bg.skuCode)
    const coil = coils.find(c => c.hrCoilId === firstRow?.hrCoilId)
    const entry = {
      bundleId: bg.bundleId, skuCode: bg.skuCode,
      pieces: bg.totalPieces, weight: bg.totalWeight,
      length: sku?.length || 6000,
      width: coil?.width || '', thickness: sku?.thickness ?? '',
      traceHrCoilId: firstRow?.hrCoilId,
    }
    f('selectedBundles', [...form.selectedBundles, entry])
    setBundleToAdd('')
  }

  const removeBundle = (bid) => f('selectedBundles', form.selectedBundles.filter(b => b.bundleId !== bid))

  const theoreticalTotal = form.selectedBundles.reduce((s, b) => s + Number(b.weight || 0), 0)
  const variance = form.vehicleWeight ? Number(form.vehicleWeight) - theoreticalTotal : 0
  const varianceCheck = form.vehicleWeight ? tolerance(theoreticalTotal, Number(form.vehicleWeight)) : null

  const save = () => {
    const record = {
      id: editId || uid(), ...form,
      bundleEntries: form.selectedBundles,
      theoreticalWeight: theoreticalTotal,
      variance, deleted: false,
    }
    // Bundles previously on this record (edit case) so any dropped during the edit
    // get released back to undispatched instead of being orphaned.
    const prevIds = editId ? ((dispatches.find(d => d.id === editId)?.bundleEntries) || []).map(b => b.bundleId) : []
    const newIds = form.selectedBundles.map(b => b.bundleId)
    if (editId) {
      setDispatches(prev => prev.map(d => d.id === editId ? record : d))
    } else {
      setDispatches(prev => [...prev, record])
    }
    // Mark selected bundles dispatched; release any removed during an edit.
    setBundles(prev => prev.map(b =>
      newIds.includes(b.bundleId) ? { ...b, dispatched: true } :
      prevIds.includes(b.bundleId) ? { ...b, dispatched: false } : b
    ))
    setForm(emptyForm); setEditId(null); setShowForm(false)
  }

  const startEdit = (row) => {
    setForm({ ...row, selectedBundles: row.bundleEntries || row.selectedBundles || [] })
    setEditId(row.id)
    setShowForm(true)
  }

  const softDelete = (row) => {
    if (confirm('Delete dispatch record? Bundles will be marked as undispatched.')) {
      const bundleIds = (row.bundleEntries || []).map(b => b.bundleId)
      setBundles(prev => prev.map(b => bundleIds.includes(b.bundleId) ? { ...b, dispatched: false } : b))
      setDispatches(prev => prev.map(d => d.id === row.id ? { ...d, deleted: true } : d))
    }
  }

  // ── Invoice Reconciliation CSV ──────────────────────────────────────────
  // One row per (dispatch date × invoice no. × SKU). Cost model (locked):
  //   total = (costPrice/MT + ladder/MT) × quantityMT  (ladder already includes
  //   conversion, so conversion column is informational — no double-count).
  // Quantity basis is dispatched weight in MT. Mother-coil cost price/MT is a
  // weight-weighted average over the entries whose mother coil resolves.
  const buildReconciliationRows = () => {
    const rows = []
    dispatches.filter(d => !d.deleted).forEach(d => {
      const bySku = {}
      ;(d.bundleEntries || []).forEach(e => {
        const k = e.skuCode || '—'
        ;(bySku[k] = bySku[k] || []).push(e)
      })
      Object.entries(bySku).forEach(([skuCode, entries]) => {
        const quantityMT = entries.reduce((s, e) => s + Number(e.weight || 0), 0)
        const motherSet = new Set()
        let costNum = 0, costDen = 0 // separate denominator so unresolved coils don't dilute toward 0
        entries.forEach(e => {
          const coil = coils.find(c => c.hrCoilId === e.traceHrCoilId)
          if (coil?.hrCoilId) motherSet.add(coil.hrCoilId)
          const aw = Number(coil?.actualWeight || 0)
          if (coil && aw > 0) {
            const rate = Number(coil.costPrice || 0) / aw // ₹ per MT
            costNum += Number(e.weight || 0) * rate
            costDen += Number(e.weight || 0)
          }
        })
        const costPricePerMT = costDen > 0 ? costNum / costDen : 0
        const sku = skus.find(s => s.skuCode === skuCode)
        const conversionPerMT = Number(sku?.baseConversion || 0)
        const ladderPerMT = Number(sku?.ladderPrice || 0)
        const totalCost = (costPricePerMT + ladderPerMT) * quantityMT
        rows.push({
          dateOfDispatch: d.dateOfDispatch || '',
          invoiceNo: d.invoiceNo || '',
          sku: sku?.description || skuCode,
          quantityMT, motherCoil: [...motherSet].join('; '),
          costPricePerMT, conversionPerMT, ladderPerMT, totalCost,
        })
      })
    })
    return rows
  }

  const downloadReconciliationCSV = () => {
    const rows = buildReconciliationRows()
    const header = ['Date of Dispatch', 'Invoice No.', 'SKU', 'Quantity (MT)', 'Mother Coil', 'Cost Price/MT', 'Conversion Cost/MT', 'Ladder Cost/MT', 'Total Cost of Invoice Qty']
    const esc = (v) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const lines = [header.map(esc).join(',')]
    rows.forEach(r => lines.push([
      r.dateOfDispatch, r.invoiceNo, r.sku, fmtT(r.quantityMT), r.motherCoil,
      r.costPricePerMT.toFixed(2), r.conversionPerMT.toFixed(2), r.ladderPerMT.toFixed(2), r.totalCost.toFixed(2),
    ].map(esc).join(',')))
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `invoice-reconciliation-${today()}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const columns = [
    { label: 'Date', key: 'dateOfDispatch' },
    { label: 'Invoice No.', key: 'invoiceNo' },
    { label: 'Vehicle No.', key: 'vehicleNo' },
    { label: 'Vehicle Wt (T)', value: r => fmtT(r.vehicleWeight) },
    { label: 'Bundles', value: r => (r.bundleEntries || []).map(b => b.bundleId).join(', ') },
    { label: 'Theor. Wt (T)', value: r => fmtT(r.theoreticalWeight) },
    { label: 'Variance (T)', render: r => {
      const v = Number(r.vehicleWeight) - Number(r.theoreticalWeight)
      const chk = tolerance(Number(r.theoreticalWeight), Number(r.vehicleWeight))
      return <Badge ok={chk.ok} text={`${v >= 0 ? '+' : ''}${fmtT(v)}T`} />
    }},
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 3: Dispatch</h2>
        <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ New Dispatch'}</Btn>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Dispatch' : 'Record Dispatch'}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date of Dispatch"><Input type="date" value={form.dateOfDispatch} onChange={v => f('dateOfDispatch', v)} /></Field>
            <Field label="Vehicle No."><Input value={form.vehicleNo} onChange={v => f('vehicleNo', v)} /></Field>
            <Field label="Invoice No."><Input value={form.invoiceNo} onChange={v => f('invoiceNo', v)} /></Field>
            <Field label="Vehicle Weight (T)"><Input type="number" value={form.vehicleWeight} onChange={v => f('vehicleWeight', v)} step="0.001" /></Field>
          </div>

          <div className="mt-4 p-4 bg-slate-50 dark:bg-slate-900 rounded-lg">
            <h4 className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">Add Bundles to Dispatch</h4>
            <div className="flex gap-2">
              <div className="flex-1"><Select value={bundleToAdd} onChange={setBundleToAdd} options={bundleOptions} placeholder="Select bundle..." /></div>
              <Btn onClick={addBundle} variant="ghost">Add</Btn>
            </div>
            {form.selectedBundles.length > 0 && (
              <div className="mt-3 space-y-2">
                {form.selectedBundles.map(b => (
                  <div key={b.bundleId} className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
                    <div>
                      <span className="font-medium text-sm">{b.bundleId}</span>
                      <span className="text-xs text-slate-500 ml-2">{skuDesc(b.skuCode)} | {b.pieces} pcs | {fmtT(b.weight)}T</span>
                    </div>
                    <Btn size="sm" variant="danger" onClick={() => removeBundle(b.bundleId)}>Remove</Btn>
                  </div>
                ))}
                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex justify-between text-sm">
                  <span className="text-slate-600 dark:text-slate-400">Theoretical Total: <strong>{fmtT(theoreticalTotal)}T</strong></span>
                  {varianceCheck && <Badge ok={varianceCheck.ok} text={`Variance: ${variance >= 0 ? '+' : ''}${fmtT(variance)}T`} />}
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.invoiceNo || !form.vehicleNo || form.selectedBundles.length === 0} variant="success">{editId ? 'Update Dispatch' : 'Save Dispatch'}</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

      <div className="flex justify-between items-center">
        <h3 className="text-sm font-medium text-slate-600 dark:text-slate-400">Invoice cost reconciliation export — one row per dispatch date × invoice × SKU</h3>
        <Btn variant="ghost" onClick={downloadReconciliationCSV} disabled={dispatches.filter(d => !d.deleted).length === 0}>
          Download Invoice Reconciliation (CSV)
        </Btn>
      </div>

      <Section title="Dispatch Records">
        <DataTable columns={columns} data={dispatches} onEdit={startEdit} onDelete={softDelete} />
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
    { label: 'Status', render: r => <Badge ok={r.status === 'published'} text={r.status} /> },
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
  Bundle: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  Dispatch: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
}

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 }

function Dashboard({ coils, bundles, dispatches, skus, purchaseOrders }) {
  const active = (arr) => arr.filter(x => !x.deleted)
  const ac = active(coils), abn = active(bundles), ad = active(dispatches), apo = active(purchaseOrders)
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])
  const todayStr = today()

  // ── Period filter: presets + custom date range ──
  const [period, setPeriod] = useState('30d')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const range = useMemo(() => {
    if (period === 'all') return { from: '', to: '' }
    if (period === 'custom') return { from: customFrom, to: customTo }
    return { from: new Date(Date.now() - (PERIOD_DAYS[period] - 1) * 86400000).toISOString().split('T')[0], to: '' }
  }, [period, customFrom, customTo])
  const inRange = useCallback((d) => {
    if (!range.from && !range.to) return true
    if (!d) return false
    if (range.from && d < range.from) return false
    if (range.to && d > range.to) return false
    return true
  }, [range])
  const periodLabel = period === 'all' ? 'All Time' : period === 'custom' ? 'Custom Range' : `Last ${PERIOD_DAYS[period]} Days`

  // ── Production flow KPIs (period-scoped) ──
  const coilsInPeriod = ac.filter(c => inRange(c.dateOfInward))
  const coilsInWt = coilsInPeriod.reduce((s, c) => s + Number(c.actualWeight || 0), 0)
  const bundlesInPeriod = abn.filter(b => inRange(b.dateOfEntry))
  const bundledPcsPeriod = bundlesInPeriod.reduce((s, b) => s + Number(b.tubeCount || 0), 0)
  const bundledWtPeriod = bundlesInPeriod.reduce((s, b) => s + Number(b.totalWeight || 0), 0)
  const dispInPeriod = ad.filter(d => inRange(d.dateOfDispatch))
  const dispWtPeriod = dispInPeriod.reduce((s, d) => s + (d.bundleEntries || []).reduce((x, e) => x + Number(e.weight || 0), 0), 0)
  const dispBundlesPeriod = dispInPeriod.reduce((s, d) => s + (d.bundleEntries || []).length, 0)
  const bundlesFormed = abn.length
  const bundlesDispatched = abn.filter(b => b.dispatched).length

  // Active SKUs in period + top by pieces
  const skuPcsInPeriod = useMemo(() => {
    const counts = {}
    bundlesInPeriod.forEach(b => { counts[b.skuCode] = (counts[b.skuCode] || 0) + Number(b.tubeCount || 0) })
    return counts
  }, [bundlesInPeriod])
  const activeSkuCount = Object.keys(skuPcsInPeriod).length
  const topSkuPeriod = Object.entries(skuPcsInPeriod).sort((a, b) => b[1] - a[1])[0]?.[0]

  // ── Stock in hand (point-in-time) with ₹ value via mother-coil cost rate ──
  const stock = useMemo(() => {
    const rateOf = {}
    ac.forEach(c => { rateOf[c.hrCoilId] = Number(c.actualWeight) > 0 ? Number(c.costPrice || 0) / Number(c.actualWeight) : 0 })

    let rawWt = 0, rawVal = 0
    ac.forEach(c => {
      const bundled = abn.filter(b => b.hrCoilId === c.hrCoilId).reduce((s, b) => s + Number(b.totalWeight || 0), 0)
      const rem = Math.max(0, Number(c.actualWeight || 0) - bundled)
      rawWt += rem; rawVal += rem * (rateOf[c.hrCoilId] || 0)
    })

    let readyWt = 0, readyPcs = 0, readyVal = 0
    const readyBundleIds = new Set()
    abn.filter(b => !b.dispatched).forEach(b => {
      readyWt += Number(b.totalWeight || 0)
      readyPcs += Number(b.tubeCount || 0)
      readyBundleIds.add(b.bundleId)
      readyVal += Number(b.totalWeight || 0) * (rateOf[b.hrCoilId] || 0)
    })

    return {
      rawWt, rawVal,
      readyWt, readyPcs, readyVal, readyBundles: readyBundleIds.size,
      totalVal: rawVal + readyVal,
    }
  }, [ac, abn])

  // ── PO summary ──
  const poStats = useMemo(() => {
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    const open = apo.filter(p => !p.poEndDate || p.poEndDate >= todayStr)
    const expiring = open.filter(p => p.poEndDate && p.poEndDate <= in7)
    return { open: open.length, expiring: expiring.length }
  }, [apo, todayStr])

  // Coil stage breakdown
  const coilStages = useMemo(() => {
    const bundledIds = new Set(abn.map(b => b.hrCoilId).filter(Boolean))
    const dispatchedIds = new Set(ad.flatMap(d => (d.bundleEntries || []).map(be => be.traceHrCoilId)).filter(Boolean))

    return [
      { name: 'In Stock', value: ac.filter(c => !bundledIds.has(c.hrCoilId)).length },
      { name: 'Bundled', value: ac.filter(c => bundledIds.has(c.hrCoilId) && !dispatchedIds.has(c.hrCoilId)).length },
      { name: 'Dispatched', value: ac.filter(c => dispatchedIds.has(c.hrCoilId)).length },
    ]
  }, [ac, abn, ad])

  // ── Production vs dispatch trend (daily ≤31 days, else weekly) ──
  const trend = useMemo(() => {
    const toStr = range.to || todayStr
    let fromStr = range.from
    if (!fromStr) {
      const dates = [...abn.map(b => b.dateOfEntry), ...ad.map(d => d.dateOfDispatch)].filter(Boolean)
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
    abn.forEach(bn => {
      if (!inRange(bn.dateOfEntry)) return
      const b = buckets[bucketKey(bn.dateOfEntry)]
      if (b) b.produced += Number(bn.totalWeight || 0)
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
        produced: +buckets[k].produced.toFixed(3),
        dispatched: +buckets[k].dispatched.toFixed(3),
      })),
    }
  }, [abn, ad, range, todayStr, inRange])

  // Yield per coil
  const yieldData = useMemo(() => {
    return ac.map(c => {
      const dispWt = ad.flatMap(d => (d.bundleEntries || []))
        .filter(be => be.traceHrCoilId === c.hrCoilId)
        .reduce((s, be) => s + Number(be.weight || 0), 0)
      return { name: c.hrCoilId, yield: c.actualWeight ? (dispWt / c.actualWeight) * 100 : 0, actualWt: c.actualWeight, dispWt }
    }).filter(d => d.dispWt > 0)
  }, [ac, ad])

  const avgYield = yieldData.length ? yieldData.reduce((s, d) => s + d.yield, 0) / yieldData.length : 0

  // Top SKUs
  const topSkus = useMemo(() => {
    const counts = {}
    abn.forEach(b => { counts[b.skuCode] = (counts[b.skuCode] || 0) + Number(b.tubeCount || 0) })
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [abn])

  // ── SKU-wise summary (produced/dispatched follow the period; WIP/ready are current) ──
  const skuSummary = useMemo(() => {
    const map = {}
    const get = (code) => (map[code] = map[code] || {
      skuCode: code, bundledPcs: 0, bundledWt: 0,
      readyPcs: 0, readyWt: 0, dispPcs: 0, dispWt: 0,
    })
    abn.forEach(b => {
      const r = get(b.skuCode)
      if (inRange(b.dateOfEntry)) {
        r.bundledPcs += Number(b.tubeCount || 0)
        r.bundledWt += Number(b.totalWeight || 0)
      }
      if (!b.dispatched) {
        r.readyPcs += Number(b.tubeCount || 0)
        r.readyWt += Number(b.totalWeight || 0)
      }
    })
    ad.forEach(d => {
      if (!inRange(d.dateOfDispatch)) return
      ;(d.bundleEntries || []).forEach(e => {
        const r = get(e.skuCode)
        r.dispPcs += Number(e.pieces || 0)
        r.dispWt += Number(e.weight || 0)
      })
    })
    return Object.values(map).filter(r => r.skuCode).map(r => {
      const sku = skus.find(s => s.skuCode === r.skuCode)
      return {
        ...r, id: r.skuCode,
        description: sku?.description || r.skuCode,
        type: sku?.productType || '—',
      }
    })
  }, [abn, ad, skus, inRange])

  const skuColumns = [
    { label: 'SKU Code', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'Type', key: 'type' },
    { label: 'Bundled (pcs)', key: 'bundledPcs' },
    { label: 'Bundled (T)', value: r => fmtT(r.bundledWt) },
    { label: 'Ready (pcs)', key: 'readyPcs' },
    { label: 'Ready (T)', value: r => fmtT(r.readyWt) },
    { label: 'Dispatched (pcs)', key: 'dispPcs' },
    { label: 'Dispatched (T)', value: r => fmtT(r.dispWt) },
  ]

  // ── Alerts ──
  const alerts = useMemo(() => {
    const list = []
    // Bundle over-fill: more weight bundled from a coil than its actual weight (+5%)
    const bundledByCoil = {}
    abn.forEach(b => { bundledByCoil[b.hrCoilId] = (bundledByCoil[b.hrCoilId] || 0) + Number(b.totalWeight || 0) })
    Object.entries(bundledByCoil).forEach(([coilId, wt]) => {
      const coil = ac.find(c => c.hrCoilId === coilId)
      const cap = Number(coil?.actualWeight || 0)
      if (cap > 0 && wt > cap * 1.05) list.push({ type: 'error', msg: `Over-fill: ${coilId} has ${fmtT(wt)}T bundled but coil is only ${fmtT(cap)}T` })
    })
    // Dispatch weight variance outside ±5%
    ad.forEach(d => {
      if (!d.vehicleWeight) return
      const chk = tolerance(Number(d.theoreticalWeight), Number(d.vehicleWeight))
      if (!chk.ok) list.push({ type: 'error', msg: `Dispatch variance: invoice ${d.invoiceNo || '—'} (${d.dateOfDispatch}) — theoretical ${fmtT(d.theoreticalWeight)}T vs vehicle ${fmtT(d.vehicleWeight)}T` })
    })
    // Undispatched bundles older than 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
    abn.filter(b => !b.dispatched && b.dateOfEntry < sevenDaysAgo).forEach(b => {
      list.push({ type: 'warn', msg: `Bundle ${b.bundleId} pending dispatch for >7 days (created ${b.dateOfEntry})` })
    })
    // Coils with no activity
    const fourteenDaysAgo = new Date(Date.now() - 14 * 86400000).toISOString().split('T')[0]
    const bundledIds = new Set(abn.map(b => b.hrCoilId).filter(Boolean))
    ac.filter(c => !bundledIds.has(c.hrCoilId) && c.dateOfInward < fourteenDaysAgo).forEach(c => {
      list.push({ type: 'warn', msg: `Coil ${c.hrCoilId} awaiting bundling for >14 days` })
    })
    // POs ending within 7 days
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    apo.forEach(p => {
      if (p.poEndDate && p.poEndDate >= todayStr && p.poEndDate <= in7) {
        list.push({ type: 'warn', msg: `PO ${p.purchaseOrderNumber} (${p.vendorName || '—'}) ends on ${p.poEndDate}` })
      }
    })
    return list
  }, [ac, abn, ad, apo, todayStr])

  // ── Recent activity across all stages ──
  const recentActivity = useMemo(() => {
    const ev = []
    ac.forEach(c => ev.push({ date: c.dateOfInward, stage: 'Inward', msg: `Coil ${c.hrCoilId} received — ${fmtT(c.actualWeight)}T${c.coilGrade ? `, ${c.coilGrade}` : ''}` }))
    abn.forEach(b => ev.push({ date: b.dateOfEntry, stage: 'Bundle', msg: `${b.bundleId}: ${b.tubeCount} pcs of ${skuDesc(b.skuCode)} from ${b.hrCoilId}` }))
    ad.forEach(d => ev.push({ date: d.dateOfDispatch, stage: 'Dispatch', msg: `Invoice ${d.invoiceNo || '—'} — ${(d.bundleEntries || []).length} bundle(s), ${fmtT(d.theoreticalWeight)}T, vehicle ${d.vehicleNo || '—'}` }))
    return ev.filter(e => e.date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 10)
  }, [ac, abn, ad, skuDesc])

  const totalInvoiceWt = ac.reduce((s, c) => s + Number(c.invoiceWeight || 0), 0)
  const totalActualWt = ac.reduce((s, c) => s + Number(c.actualWeight || 0), 0)

  // ── CSV exports ──
  const downloadStockCSV = () => {
    const rows = ac.map(c => {
      const rate = Number(c.actualWeight) > 0 ? Number(c.costPrice || 0) / Number(c.actualWeight) : 0
      const bundledWt = abn.filter(bn => bn.hrCoilId === c.hrCoilId).reduce((s, bn) => s + Number(bn.totalWeight || 0), 0)
      const rawRem = Math.max(0, Number(c.actualWeight || 0) - bundledWt)
      const readyWt = abn.filter(bn => !bn.dispatched && bn.hrCoilId === c.hrCoilId).reduce((s, bn) => s + Number(bn.totalWeight || 0), 0)
      const dispWt = ad.flatMap(d => d.bundleEntries || []).filter(be => be.traceHrCoilId === c.hrCoilId).reduce((s, be) => s + Number(be.weight || 0), 0)
      const stockVal = (rawRem + readyWt) * rate
      return [
        c.hrCoilId, c.coilGrade || '', c.thickness ?? '', c.width ?? '', fmtT(c.actualWeight),
        fmtT(rawRem), fmtT(readyWt), fmtT(dispWt),
        (c.actualWeight ? ((dispWt / Number(c.actualWeight)) * 100).toFixed(1) : '0.0') + '%', stockVal.toFixed(2),
      ]
    })
    downloadCSV(`stock-report-${todayStr}.csv`,
      ['Mother Coil', 'Grade', 'Thickness (mm)', 'Width (mm)', 'Actual Wt (T)', 'Raw Remaining (T)', 'Ready Wt (T)', 'Dispatched Wt (T)', 'Yield %', 'Stock Value (INR)'],
      rows)
  }

  const downloadSkuCSV = () => {
    downloadCSV(`sku-report-${todayStr}.csv`,
      ['SKU Code', 'Description', 'Type', 'Bundled (pcs)', 'Bundled (T)', 'Ready (pcs)', 'Ready (T)', 'Dispatched (pcs)', 'Dispatched (T)'],
      skuSummary.map(r => [r.skuCode, r.description, r.type, r.bundledPcs, fmtT(r.bundledWt), r.readyPcs, fmtT(r.readyWt), r.dispPcs, fmtT(r.dispWt)]))
  }

  const dateInputCls = 'px-2 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100'

  return (
    <div className="space-y-6">
      {/* Header: title + period selector + export */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Dashboard</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={period} onChange={e => setPeriod(e.target.value)}
            className="px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 text-sm bg-white dark:bg-slate-800 dark:text-slate-100">
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
            <option value="custom">Custom Range</option>
          </select>
          {period === 'custom' && <>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className={dateInputCls} />
            <span className="text-sm text-slate-500">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className={dateInputCls} />
          </>}
          <Btn size="sm" variant="ghost" onClick={downloadStockCSV}>⬇ Stock CSV</Btn>
        </div>
      </div>

      {/* Production Flow KPIs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Production Flow — {periodLabel}</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="Coils Inward" value={coilsInPeriod.length} sub={`${fmtT(coilsInWt)}T actual · ${ac.length} total (Inv: ${fmtT(totalInvoiceWt)}T / Act: ${fmtT(totalActualWt)}T)`} />
          <Card title="Pieces Bundled" value={bundledPcsPeriod} sub={`${fmtT(bundledWtPeriod)}T`} color="cyan" />
          <Card title="Dispatched" value={`${fmtT(dispWtPeriod)}T`} sub={`${dispInPeriod.length} dispatch(es) · ${dispBundlesPeriod} bundle(s)`} color="emerald" />
          <Card title="Avg. Yield (All Time)" value={fmtPct(avgYield)} sub={`${yieldData.length} coils with dispatches`} color="amber" />
        </div>
      </div>

      {/* Stock in Hand KPIs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Stock in Hand — Current</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Raw Coil Stock" value={`${fmtT(stock.rawWt)}T`} sub={`${fmtINR(stock.rawVal)} · unbundled coil weight`} />
          <Card title="Ready to Dispatch" value={`${fmtT(stock.readyWt)}T`} sub={`${stock.readyBundles} bundle(s) · ${stock.readyPcs} pcs · ${fmtINR(stock.readyVal)}`} color="amber" />
        </div>
      </div>

      {/* Commercial KPIs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Commercial</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="Total Stock Value" value={fmtINR(stock.totalVal)} sub="Raw + Ready" />
          <Card title="Open POs" value={poStats.open} sub={`${poStats.expiring} ending ≤7 days`} color="cyan" />
          <Card title="Bundles (All Time)" value={`${bundlesDispatched} / ${bundlesFormed}`} sub="Dispatched / Formed" color="emerald" />
          <Card title="Active SKUs" value={activeSkuCount} sub={topSkuPeriod ? `Top: ${skuDesc(topSkuPeriod)}` : '—'} color="amber" />
        </div>
      </div>

      {/* Pipeline */}
      <Section title="Coil Pipeline">
        <div className="flex items-center gap-1 overflow-x-auto pb-2">
          {coilStages.map((s, i) => (
            <React.Fragment key={s.name}>
              <div className="flex-1 min-w-[120px] text-center p-4 rounded-lg" style={{ backgroundColor: `${CHART_COLORS[i]}15`, borderLeft: `4px solid ${CHART_COLORS[i]}` }}>
                <p className="text-2xl font-bold" style={{ color: CHART_COLORS[i] }}>{s.value}</p>
                <p className="text-xs text-slate-500 mt-1">{s.name}</p>
              </div>
              {i < coilStages.length - 1 && <span className="text-slate-300 text-xl">→</span>}
            </React.Fragment>
          ))}
        </div>
      </Section>

      {/* Production & Dispatch Trend */}
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Yield Chart */}
        <Section title="Yield by Coil">
          {yieldData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={yieldData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `${Number(v).toFixed(1)}%`} />
                <Bar dataKey="yield" fill="#4f46e5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 py-8 text-center">No dispatch data yet</p>}
        </Section>

        {/* Top SKUs */}
        <Section title="Top SKUs by Volume (All Time)">
          {topSkus.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={topSkus} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                  {topSkus.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : <p className="text-sm text-slate-400 py-8 text-center">No production data yet</p>}
        </Section>
      </div>

      {/* SKU-wise Summary */}
      <Section title={`SKU-wise Summary — ${periodLabel}`} actions={<Btn size="sm" variant="ghost" onClick={downloadSkuCSV}>⬇ SKU CSV</Btn>}>
        {skuSummary.length > 0 ? (
          <>
            <p className="mb-3 text-xs text-slate-400">Bundled & Dispatched columns follow the selected period; Ready is current stock.</p>
            <DataTable columns={skuColumns} data={skuSummary} />
          </>
        ) : <p className="text-sm text-slate-400 py-8 text-center">No SKU activity yet</p>}
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
const STAGE_NAMES = ['Inward', 'Bundled', 'Dispatched']
const STAGE_COLORS = ['#4f46e5', '#d97706', '#dc2626']

// Excel-style summary for the 3-stage flow (Inward → Bundled → Dispatched)
const SUMMARY_HEADERS = [
  'Coil ID', 'Grade', 'Coil Wt (T)', '# Bundled (pcs)', 'Bundled Wt (T)',
  '# Dispatched (pcs)', 'Dispatched Wt (T)', 'Balance to Bundle (T)', 'Bundled Inv (T)', 'Bundled Inv (#)',
]
// Numeric columns in header order: wt → 2-dp tonnes, count → thousands-separated integer
const SUMMARY_COLS = [
  { key: 'coilWt', fmt: 'wt' }, { key: 'bundledPcs', fmt: 'count' }, { key: 'bundledWt', fmt: 'wt' },
  { key: 'dispatchedPcs', fmt: 'count' }, { key: 'dispatchedWt', fmt: 'wt' },
  { key: 'balanceToBundle', fmt: 'wt' }, { key: 'bundledInvWt', fmt: 'wt' }, { key: 'bundledInvPcs', fmt: 'count' },
]
const SUMMARY_TD = 'px-2 py-1 whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-600'
const SUBTOTAL_TD = 'sticky top-8 z-10 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap border-b-2 border-r border-slate-300 dark:border-slate-600'

function CoilTracker({ coils, bundles, dispatches }) {
  const [selectedCoilId, setSelectedCoilId] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const active = (arr) => arr.filter(x => !x.deleted)
  const ac = active(coils), abn = active(bundles), ad = active(dispatches)

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
  const inventorySummary = useMemo(() => {
    return filteredCoils.map(c => {
      const coilBundles = abn.filter(b => b.hrCoilId === c.hrCoilId)
      const coilWt = Number(c.actualWeight || 0)
      const bundledPcs = coilBundles.reduce((s, b) => s + Number(b.tubeCount || 0), 0)
      const bundledWt = coilBundles.reduce((s, b) => s + Number(b.totalWeight || 0), 0)
      const dispEntries = ad.flatMap(d => (d.bundleEntries || [])).filter(be => be.traceHrCoilId === c.hrCoilId)
      const dispatchedPcs = dispEntries.reduce((s, be) => s + Number(be.pieces || 0), 0)
      const dispatchedWt = dispEntries.reduce((s, be) => s + Number(be.weight || 0), 0)

      return {
        hrCoilId: c.hrCoilId, grade: c.coilGrade,
        coilWt, bundledPcs, bundledWt, dispatchedPcs, dispatchedWt,
        balanceToBundle: coilWt - bundledWt,
        bundledInvWt: bundledWt - dispatchedWt,
        bundledInvPcs: bundledPcs - dispatchedPcs,
      }
    })
  }, [filteredCoils, abn, ad])

  // ── Subtotals over the filtered set (rendered pinned at the top of the table) ──
  const subtotals = useMemo(() => inventorySummary.reduce((s, r) => ({
    coilCount: s.coilCount + 1,
    coilWt: s.coilWt + r.coilWt, bundledPcs: s.bundledPcs + r.bundledPcs, bundledWt: s.bundledWt + r.bundledWt,
    dispatchedPcs: s.dispatchedPcs + r.dispatchedPcs, dispatchedWt: s.dispatchedWt + r.dispatchedWt,
    balanceToBundle: s.balanceToBundle + r.balanceToBundle, bundledInvWt: s.bundledInvWt + r.bundledInvWt, bundledInvPcs: s.bundledInvPcs + r.bundledInvPcs,
  }), { coilCount: 0, coilWt: 0, bundledPcs: 0, bundledWt: 0, dispatchedPcs: 0, dispatchedWt: 0, balanceToBundle: 0, bundledInvWt: 0, bundledInvPcs: 0 }), [inventorySummary])

  // ── Selected coil journey ──
  const selectedCoil = ac.find(c => c.hrCoilId === selectedCoilId)
  const journey = useMemo(() => {
    if (!selectedCoil) return null
    const coilBundles = abn.filter(b => b.hrCoilId === selectedCoilId)
    const dispEntries = ad.flatMap(d => (d.bundleEntries || []).map(be => ({ ...be, dateOfDispatch: d.dateOfDispatch, vehicleNo: d.vehicleNo, invoiceNo: d.invoiceNo })))
      .filter(be => be.traceHrCoilId === selectedCoilId)

    // Bundle details
    const bundleIds = [...new Set(coilBundles.map(b => b.bundleId))]
    const bundleDetails = bundleIds.map(bid => {
      const rows = coilBundles.filter(b => b.bundleId === bid)
      const totalPcs = rows.reduce((s, r) => s + Number(r.tubeCount || 0), 0)
      const totalWt = rows.reduce((s, r) => s + Number(r.totalWeight || 0), 0)
      const dispatched = rows.every(r => r.dispatched)
      const dispEntry = dispatched ? dispEntries.find(de => de.bundleId === bid) : null
      return {
        bundleId: bid, skuCode: rows[0]?.skuCode, totalPcs, totalWt,
        sources: rows.length, dispatched,
        dateOfDispatch: dispEntry?.dateOfDispatch || '',
        vehicleNo: dispEntry?.vehicleNo || ''
      }
    })

    // Weight at each stage
    const totalBundleWt = coilBundles.reduce((s, b) => s + Number(b.totalWeight || 0), 0)
    const totalDispatchWt = dispEntries.reduce((s, be) => s + Number(be.weight || 0), 0)

    // Stage reached: 0=Inward, 1=Bundled, 2=Dispatched
    const stageReached = totalDispatchWt > 0 ? 2 : bundleDetails.length > 0 ? 1 : 0

    return { bundleDetails, totalBundleWt, totalDispatchWt, stageReached }
  }, [selectedCoil, selectedCoilId, abn, ad])

  // ── Weight flow chart data ──
  const weightFlowData = useMemo(() => {
    if (!selectedCoil || !journey) return []
    return [
      { name: 'Mother Coil', weight: Number(selectedCoil.actualWeight || 0) },
      { name: 'Bundled', weight: journey.totalBundleWt },
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
                  <td colSpan={10} className="px-2 py-8 text-center text-slate-400 border-b border-slate-200 dark:border-slate-600">No coils in the selected period</td>
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

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card title="Coil ID" value={selectedCoilId} sub={`Grade: ${selectedCoil.coilGrade || '—'}`} />
            <Card title="Dimensions" value={`${selectedCoil.thickness || '—'} × ${selectedCoil.width || '—'} mm`} sub={`PO: ${selectedCoil.poNumber || '—'}`} color="cyan" />
            <Card title="Actual Weight" value={`${fmtT(selectedCoil.actualWeight)} T`} sub={`Invoice: ${fmtT(selectedCoil.invoiceWeight)} T`} color="emerald" />
            <Card title="Yield" value={fmtPct(selectedCoil.actualWeight ? (journey.totalDispatchWt / selectedCoil.actualWeight) * 100 : 0)} sub={`Dispatched: ${fmtT(journey.totalDispatchWt)} T`} color="amber" />
          </div>

          {/* 2b: Stage Progress Bar */}
          <Section title="Stage Progress">
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {STAGE_NAMES.map((name, i) => {
                const reached = i <= journey.stageReached
                const isCurrent = i === journey.stageReached
                const stageValues = [
                  `${fmtT(selectedCoil.actualWeight)} T`,
                  `${journey.bundleDetails.length} bundles · ${fmtT(journey.totalBundleWt)} T`,
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

          {/* 2e: Bundles & Dispatch */}
          {journey.bundleDetails.length > 0 && (
            <Section title={`Bundles & Dispatch (${journey.bundleDetails.length})`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700">
                      {['Bundle ID', 'SKU', 'Pieces', 'Weight (T)', 'Sources', 'Status', 'Dispatch Date', 'Vehicle'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {journey.bundleDetails.map(b => (
                      <tr key={b.bundleId} className={`hover:bg-slate-50 dark:hover:bg-slate-700/50 ${b.dispatched ? 'border-l-4 border-l-green-400' : ''}`}>
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{b.bundleId}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.skuCode}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.totalPcs}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{fmtT(b.totalWt)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.sources}</td>
                        <td className="px-4 py-3">{b.dispatched ? <Badge ok={true} text="Dispatched" /> : <span className="text-xs text-slate-400">Pending</span>}</td>
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
// MAIN APP
// ═══════════════════════════════════════════════════════════════
const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'coilTracker', label: 'Coil Tracker' },
  { key: 'coilInward', label: '1. Coil Inward' },
  { key: 'bundleFormation', label: '2. Bundle Formation' },
  { key: 'dispatch', label: '3. Dispatch' },
  { key: 'skuMaster', label: 'SKU Master' },
  { key: 'poMaster', label: 'PO Master' },
]

const TABLE_LABELS = {
  coils: 'Coil Inward',
  bundles: 'Bundles',
  dispatches: 'Dispatches',
  skus: 'SKU Master',
  purchase_orders: 'PO Master',
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
  const [bundles, setBundles, bundlesLoading] = useSupabaseStore('jsw:bundles', [])
  const [dispatches, setDispatches, dispatchesLoading] = useSupabaseStore('jsw:dispatches', [])
  const [skus, setSkus, skusLoading] = useSupabaseStore('jsw:skus', DEFAULT_SKUS)
  const [purchaseOrders, setPurchaseOrders, poLoading] = useSupabaseStore('jsw:purchaseOrders', [])

  const loading = coilsLoading || bundlesLoading || dispatchesLoading || skusLoading || poLoading

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    LS.set('jsw:dark', dark)
  }, [dark])

  const resetData = () => {
    if (confirm('Reset ALL data? This will clear all coil, bundle & dispatch records. SKU Master will be preserved. This cannot be undone.')) {
      setCoils([])
      setBundles([])
      setDispatches([])
      setSkus(DEFAULT_SKUS)
      LS.del('jsw:seeded')
      LS.set('jsw:seeded', true)
    }
  }

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
              <Btn size="sm" variant="ghost" onClick={resetData}>Reset Data</Btn>
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
        {tab === 'dashboard' && <Dashboard coils={coils} bundles={bundles} dispatches={dispatches} skus={skus} purchaseOrders={purchaseOrders} />}
        {tab === 'coilTracker' && <CoilTracker coils={coils} bundles={bundles} dispatches={dispatches} />}
        {tab === 'coilInward' && <CoilInward coils={coils} setCoils={setCoils} dispatches={dispatches} />}
        {tab === 'bundleFormation' && <BundleFormation coils={coils} bundles={bundles} setBundles={setBundles} skus={skus} />}
        {tab === 'dispatch' && <Dispatch bundles={bundles} setBundles={setBundles} dispatches={dispatches} setDispatches={setDispatches} coils={coils} skus={skus} />}
        {tab === 'skuMaster' && <SKUMaster skus={skus} setSkus={setSkus} />}
        {tab === 'poMaster' && <POMaster purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} />}
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

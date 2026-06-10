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

function genBabyLetter(index) {
  return String.fromCharCode(65 + index)
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
function CoilInward({ coils, setCoils, babyCoils, dispatches }) {
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

  // Cross-stage calculations
  const getCoilStats = useCallback((coil) => {
    const babies = babyCoils.filter(b => !b.deleted && b.hrCoilId === coil.hrCoilId)
    const totalBabyWidth = babies.reduce((s, b) => s + Number(b.width || 0), 0)
    const widthCheck = tolerance(totalBabyWidth, coil.width)
    const dispatchedWt = dispatches.filter(d => !d.deleted).flatMap(d => d.bundleEntries || [])
      .filter(be => {
        const baby = babyCoils.find(b => b.babyCoilId === be.traceBabyCoilId)
        return baby && baby.hrCoilId === coil.hrCoilId
      }).reduce((s, be) => s + Number(be.weight || 0), 0)
    const yieldPct = coil.actualWeight ? (dispatchedWt / coil.actualWeight) * 100 : 0
    return { totalBabyWidth, widthCheck, dispatchedWt, yieldPct, babyCount: babies.length }
  }, [babyCoils, dispatches])

  const columns = [
    { label: 'HR Coil ID', key: 'hrCoilId' },
    { label: 'Date', key: 'dateOfInward' },
    { label: 'Input Coil #', key: 'inputCoilNumber' },
    { label: 'Grade', key: 'coilGrade' },
    { label: 'Thick (mm)', key: 'thickness' },
    { label: 'Width (mm)', key: 'width' },
    { label: 'Invoice Wt (T)', value: r => fmtT(r.invoiceWeight) },
    { label: 'Actual Wt (T)', value: r => fmtT(r.actualWeight) },
    { label: 'Baby Width Sum', render: r => { const s = getCoilStats(r); return s.babyCount > 0 ? <Badge ok={s.widthCheck.ok} text={s.widthCheck.label} /> : <span className="text-slate-400">No slits</span> } },
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
// STAGE 2: COIL TO SLIT
// ═══════════════════════════════════════════════════════════════
function CoilToSlit({ coils, babyCoils, setBabyCoils }) {
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

  // Width cap: slit widths must fit within (mother width − 5 mm); hard cap is mother width itself.
  // Target  → sum ≤ mother − 5  (green)
  // Warning → mother − 5 < sum ≤ mother  (yellow, still saveable)
  // Blocked → sum > mother  (red, save disabled)
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
    const allWidths = [...siblingsOfParent.map(b => Number(b.width)), Number(form.width)]
    const totalW = allWidths.reduce((s, w) => s + w, 0)
    const record = {
      ...form, id: editId || uid(), babyCoilEntry, babyCoilId,
      thickness: parentCoil?.thickness, poNumber: parentCoil?.poNumber,
      weight: totalW > 0 ? (Number(form.width) / totalW) * Number(parentCoil.actualWeight || 0) : 0,
      costPrice: totalW > 0 ? (Number(form.width) / totalW) * Number(parentCoil.costPrice || 0) : 0,
      hrCoilId: form.hrCoilId, deleted: false,
    }
    let updated
    if (editId) {
      updated = babyCoils.map(b => b.id === editId ? record : b)
    } else {
      updated = [...babyCoils, record]
    }
    // Recalculate all siblings' weights and cost prices
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
  // Hard delete: removes the row from state (and from Supabase via the sync diff). This frees the
  // baby_coil_id letter (e.g. A) so it can be reused on the next entry — soft-delete would keep
  // the unique baby_coil_id locked in the DB.
  const softDelete = (row) => {
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
      label: `${c.hrCoilId} (W:${c.width}mm, ${fmtT(c.actualWeight)}T)`
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
    { label: 'Weight (T)', value: r => fmtT(r.weight) },
    { label: 'Cost (₹)', value: r => r.costPrice ? `₹${Math.round(r.costPrice).toLocaleString()}` : '—' },
    { label: 'Width Check', render: r => {
      const g = parentGroups[r.hrCoilId]
      if (!g || !g.parent) return '—'
      const sum = g.babies.reduce((s, b) => s + Number(b.width || 0), 0)
      const chk = widthStatus(sum, Number(g.parent.width))
      if (!chk) return '—'
      return <Badge ok={chk.tier !== 'over'} text={chk.label} />
    }},
    { label: 'PO Number', key: 'poNumber' },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 2: Coil to Slit</h2>
        <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ Add Baby Coil'}</Btn>
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
            <Field label="Weight (T)" auto><Input value={fmtT(calcWeight)} disabled /></Field>
            <Field label="Cost Price (₹)" auto><Input value={calcCostPrice ? `₹${Math.round(calcCostPrice).toLocaleString()}` : '—'} disabled /></Field>
            <Field label="PO Number" auto><Input value={parentCoil?.poNumber ?? ''} disabled /></Field>
          </div>
          {parentCoil && widthCheck && (
            <div className={`mt-3 p-3 rounded-md ${widthCheck.tier === 'ok' ? 'bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800' : widthCheck.tier === 'warn' ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800' : 'bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800'}`}>
              <span className={`text-sm font-medium ${widthCheck.tier === 'ok' ? 'text-green-700 dark:text-green-400' : widthCheck.tier === 'warn' ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>
                Width Sum: {widthCheck.label} {widthCheck.tier === 'ok' ? '✔ OK (≤ Mother − 5 mm)' : widthCheck.tier === 'warn' ? '⚠ Over Mother − 5 mm (within mother width)' : '✘ Exceeds mother coil width — cannot save'}
              </span>
            </div>
          )}
          {isDupe && <div className="mt-2"><Badge ok={false} text="Duplicate Baby Coil ID!" /></div>}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.hrCoilId || !form.width || isDupe || (widthCheck && widthCheck.tier === 'over')} variant="success">{editId ? 'Update' : 'Save Baby Coil'}</Btn>
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
// STAGE 3: SLIT TO TUBE
// ═══════════════════════════════════════════════════════════════
function SlitToTube({ babyCoils, tubes, setTubes, skus, coils }) {
  const emptyForm = { dateOfConversion: today(), skuCode: '', babyCoilId: '', numberOfPieces: '' }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const baby = useMemo(() => babyCoils.find(b => !b.deleted && b.babyCoilId === form.babyCoilId), [babyCoils, form.babyCoilId])
  const sku = useMemo(() => skus.find(s => s.skuCode === form.skuCode), [skus, form.skuCode])

  // Strip width a tube consumes from the slit: SHS/RHS perimeter ≈ 2(H+B); CHS ≈ π·OD
  const stripWidth = useMemo(() => {
    if (!sku) return 0
    if (sku.productType === 'CHS') return Math.PI * Number(sku.outsideDiameter || 0)
    return 2 * (Number(sku.height || 0) + Number(sku.breadth || 0))
  }, [sku])

  // A slit may run up to ±10 mm off the theoretical strip width (corner allowance / spring-back).
  // Minimum acceptable slit width = stripWidth − tolerance.
  const SLIT_TOLERANCE_MM = 10
  const minSlitWidth = stripWidth > 0 ? stripWidth - SLIT_TOLERANCE_MM : 0

  // Total batch weight = pieces × weightPerTube, converted kg → T
  const theoreticalWeight = sku?.weightPerTube && form.numberOfPieces
    ? (Number(form.numberOfPieces) * Number(sku.weightPerTube)) / 1000
    : 0

  // Weight already consumed by tubes previously produced from this baby coil.
  // Exclude the row being edited so a batch never counts against itself.
  const consumedWeight = useMemo(() =>
    tubes.filter(t => !t.deleted && t.babyCoilId === form.babyCoilId && t.id !== editId)
      .reduce((s, t) => s + Number(t.theoreticalWeight || 0), 0)
  , [tubes, form.babyCoilId, editId])
  // Weight still available on the slit after prior production
  const remainingWeight = baby ? Number(baby.weight || 0) - consumedWeight : 0

  // Max tubes the REMAINING slit can yield, by weight (0 once the coil is spent)
  const maxByWeight = baby && sku?.weightPerTube
    ? Math.max(0, Math.floor((remainingWeight * 1000) / Number(sku.weightPerTube)))
    : null
  const slitTooNarrow = stripWidth > 0 && baby && Number(baby.width || 0) < minSlitWidth
  const piecesOverMax = maxByWeight != null && Number(form.numberOfPieces || 0) > maxByWeight

  const motherCoil = useMemo(() => baby ? coils.find(c => c.hrCoilId === baby.hrCoilId) : null, [baby, coils])

  const save = () => {
    const record = {
      ...form, id: editId || uid(),
      thickness: baby?.thickness,
      width: stripWidth,
      length: sku?.length || 6000,
      theoreticalWeight,
      deleted: false,
    }
    const updated = editId
      ? tubes.map(t => t.id === editId ? record : t)
      : [...tubes, record]
    setTubes(updated)
    setForm(emptyForm); setEditId(null); setShowForm(false)
  }

  const startEdit = (row) => { setForm({ ...row }); setEditId(row.id); setShowForm(true) }
  const softDelete = (row) => { if (confirm('Delete?')) setTubes(prev => prev.map(t => t.id === row.id ? { ...t, deleted: true } : t)) }

  const babyOptions = useMemo(() => {
    return babyCoils.filter(b => !b.deleted).map(b => {
      const consumed = tubes.filter(t => !t.deleted && t.babyCoilId === b.babyCoilId && t.id !== editId)
        .reduce((s, t) => s + Number(t.theoreticalWeight || 0), 0)
      const rem = Number(b.weight || 0) - consumed
      return { value: b.babyCoilId, label: `${b.babyCoilId} (W:${b.width}mm, ${fmtT(rem)}T remaining)`, _rem: rem }
    }).filter(opt => (editId && opt.value === form.babyCoilId) ? true : opt._rem > 0)
  }, [babyCoils, tubes, editId, form.babyCoilId])
  // SKU options: published only; once a baby coil is chosen, restrict to SKUs
  // whose thickness is within ±5% of the coil's thickness (project tolerance).
  const skuOptions = useMemo(() => {
    const published = skus.filter(s => s.status === 'published')
    const eligible = baby && Number(baby.thickness)
      ? published.filter(s => Math.abs(Number(s.thickness) - Number(baby.thickness)) <= 0.05 * Number(baby.thickness))
      : published
    return eligible.map(s => ({ value: s.skuCode, label: s.description || s.skuCode }))
  }, [skus, baby])

  const dimLabel = (r) => {
    const s = skus.find(x => x.skuCode === r.skuCode)
    if (!s) return '—'
    if (s.productType === 'CHS') return `${s.nominalBore} NB × ${s.thickness} × ${s.length} (OD ${s.outsideDiameter})`
    return `${s.height}×${s.breadth}×${Number(s.thickness).toFixed(2)}×${s.length}`
  }
  const wtPerTube = (r) => {
    const s = skus.find(x => x.skuCode === r.skuCode)
    return s?.weightPerTube != null ? Number(s.weightPerTube).toFixed(3) : ''
  }
  const columns = [
    { label: 'Baby Coil ID', key: 'babyCoilId' },
    { label: 'SKU Description', value: r => skus.find(s => s.skuCode === r.skuCode)?.description || r.skuCode },
    { label: 'Pieces', key: 'numberOfPieces' },
    { label: 'Dimensions', value: dimLabel },
    { label: 'Wt/Tube (kg)', value: wtPerTube },
    { label: 'Total Wt (T)', value: r => fmtT(r.theoreticalWeight) },
  ]

  const isCHS = sku?.productType === 'CHS'

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 3: Slit to Tube</h2>
        <Btn onClick={() => { setForm(emptyForm); setEditId(null); setShowForm(!showForm) }}>{showForm ? 'Cancel' : '+ Add Tube Batch'}</Btn>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Tube Batch' : 'Record Tube Production'}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Date of Conversion"><Input type="date" value={form.dateOfConversion} onChange={v => f('dateOfConversion', v)} /></Field>
            <Field label="Baby Coil ID"><Select value={form.babyCoilId} onChange={v => f('babyCoilId', v)} options={babyOptions} /></Field>
            <Field label="SKU Code" helper={baby ? 'Filtered to ±5% of coil thickness' : undefined}><Select value={form.skuCode} onChange={v => f('skuCode', v)} options={skuOptions} /></Field>
            <Field
              label="Number of Pieces"
              helper={
                sku && baby
                  ? slitTooNarrow
                    ? `⚠ Slit width ${Number(baby.width).toFixed(1)} mm is too narrow for this SKU (needs ≥ ${minSlitWidth.toFixed(1)} mm — ${stripWidth.toFixed(1)} mm strip, ±${SLIT_TOLERANCE_MM} mm tolerance)`
                    : maxByWeight != null
                      ? piecesOverMax
                        ? `⚠ Over remaining capacity — max ${maxByWeight} tubes (${fmtT(remainingWeight)}T of ${fmtT(baby.weight)}T left)`
                        : `Max from remaining slit: ${maxByWeight} tubes (${fmtT(remainingWeight)}T of ${fmtT(baby.weight)}T left)`
                      : undefined
                  : undefined
              }
            ><Input type="number" value={form.numberOfPieces} onChange={v => f('numberOfPieces', v)} /></Field>
            <Field label="Thickness (mm)" auto><Input value={baby?.thickness ?? ''} disabled /></Field>
            {!isCHS && <Field label="H (mm)" auto><Input value={sku?.height ?? ''} disabled /></Field>}
            {!isCHS && <Field label="B (mm)" auto><Input value={sku?.breadth ?? ''} disabled /></Field>}
            {isCHS && <Field label="Nominal Bore (mm)" auto><Input value={sku?.nominalBore ?? ''} disabled /></Field>}
            {isCHS && <Field label="Outside Dia (mm)" auto><Input value={sku?.outsideDiameter ?? ''} disabled /></Field>}
            <Field label="Weight per Tube (kg)" auto><Input value={sku?.weightPerTube != null ? Number(sku.weightPerTube).toFixed(3) : ''} disabled /></Field>
            <Field label="Total Weight (T)" auto><Input value={fmtT(theoreticalWeight)} disabled /></Field>
          </div>
          {motherCoil && (
            <p className="mt-2 text-xs text-slate-500">Mother Coil: {motherCoil.hrCoilId} — Actual Wt: {fmtT(motherCoil.actualWeight)}T</p>
          )}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.babyCoilId || !form.skuCode || !form.numberOfPieces || slitTooNarrow || piecesOverMax} variant="success">{editId ? 'Update' : 'Save'}</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Tube Production Records">
        <DataTable columns={columns} data={tubes} onEdit={startEdit} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 4: BUNDLE FORMATION
// ═══════════════════════════════════════════════════════════════
function BundleFormation({ tubes, bundles, setBundles, babyCoils, skus }) {
  const emptyForm = { dateOfEntry: today(), babyCoilId: '', tubeCount: '', bundleNo: '' }
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

  // Find tube record for selected baby coil
  const tubeRecord = useMemo(() => tubes.find(t => !t.deleted && t.babyCoilId === form.babyCoilId), [tubes, form.babyCoilId])
  const skuCode = tubeRecord?.skuCode || ''

  // How many pieces from this baby are already allocated to bundles
  const allocatedPieces = useMemo(() => {
    return bundles.filter(b => !b.deleted && b.babyCoilId === form.babyCoilId && b.id !== editId)
      .reduce((s, b) => s + Number(b.tubeCount || 0), 0)
  }, [bundles, form.babyCoilId, editId])

  const totalProduced = tubeRecord ? Number(tubeRecord.numberOfPieces) : 0
  const remaining = totalProduced - allocatedPieces
  const weightPerPiece = tubeRecord && totalProduced > 0 ? tubeRecord.theoreticalWeight / totalProduced : 0
  const bundleId = form.bundleNo ? `BND-${form.bundleNo}` : ''

  // Validate: same SKU in bundle
  const bundleRows = useMemo(() => bundles.filter(b => !b.deleted && b.bundleNo === Number(form.bundleNo) && b.id !== editId), [bundles, form.bundleNo, editId])
  const skuMismatch = bundleRows.length > 0 && bundleRows[0].skuCode && bundleRows[0].skuCode !== skuCode

  // Duplicate check
  const isDupe = bundles.some(b => !b.deleted && b.bundleId === bundleId && b.babyCoilId === form.babyCoilId && b.id !== editId)

  const save = () => {
    const record = {
      ...form, id: editId || uid(),
      bundleNo: Number(form.bundleNo || nextBundleNo),
      bundleId: `BND-${form.bundleNo || nextBundleNo}`,
      skuCode, weightPerPiece,
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
    setForm({ ...emptyForm, bundleNo: String(bundleNo) })
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

  // Baby coil options — only those with tube production
  const babyOptions = useMemo(() => {
    const babyIds = [...new Set(tubes.filter(t => !t.deleted).map(t => t.babyCoilId))]
    return babyIds.map(id => {
      const t = tubes.find(x => !x.deleted && x.babyCoilId === id)
      const alloc = bundles.filter(b => !b.deleted && b.babyCoilId === id).reduce((s, b) => s + Number(b.tubeCount || 0), 0)
      const rem = Number(t?.numberOfPieces || 0) - alloc
      return { value: id, label: `${id} — ${rem} pcs remaining (${skuDesc(t?.skuCode)})`, _rem: rem }
    }).filter(opt => {
      if (editId && opt.value === form.babyCoilId) return true
      return opt._rem > 0
    })
  }, [tubes, bundles, editId, form.babyCoilId, skuDesc])

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
        g.rows.some(r => (r.babyCoilId || '').toLowerCase().includes(q))
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

  const canSave = form.babyCoilId && form.tubeCount && !skuMismatch && !isDupe && Number(form.tubeCount) <= remaining

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 4: Bundle Formation</h2>
        <Btn onClick={() => { if (showForm) cancelForm(); else openNewBundleForm() }}>
          {showForm ? 'Cancel' : '+ New Bundle'}
        </Btn>
      </div>

      {/* Mode A: New Bundle / Edit Source Row */}
      {showForm && formMode === 'new' && (
        <Section title={editId ? 'Edit Source Row' : 'Create New Bundle'}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Date of Entry"><Input type="date" value={form.dateOfEntry} onChange={v => f('dateOfEntry', v)} /></Field>
            <Field label="Bundle No."><Input type="number" value={form.bundleNo || nextBundleNo} onChange={v => f('bundleNo', v)} /></Field>
            <Field label="Baby Coil ID"><Select value={form.babyCoilId} onChange={v => f('babyCoilId', v)} options={babyOptions} /></Field>
          </div>
          <div className="my-4 border-t border-slate-200 dark:border-slate-700" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Field label="SKU Description" auto><Input value={skuDesc(skuCode)} disabled /></Field>
            <Field label="No. of Tube Pieces"><Input type="number" value={form.tubeCount} onChange={v => f('tubeCount', v)} placeholder={`Max: ${remaining}`} /></Field>
            <Field label="Pieces Remaining" auto><Input value={remaining - Number(form.tubeCount || 0)} disabled /></Field>
            <Field label="Wt/Piece (T)" auto><Input value={fmtT(weightPerPiece)} disabled /></Field>
            <Field label="Total Weight (T)" auto><Input value={fmtT(weightPerPiece * Number(form.tubeCount || 0))} disabled /></Field>
          </div>
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Bundle ID: <span className="font-mono font-medium">{bundleId || `BND-${nextBundleNo}`}</span>
          </p>
          {skuMismatch && <div className="mt-2"><Badge ok={false} text="SKU mismatch! All rows in a bundle must share the same SKU." /></div>}
          {isDupe && <div className="mt-2"><Badge ok={false} text="Duplicate Bundle ID + Baby Coil ID!" /></div>}
          {Number(form.tubeCount) > remaining && <div className="mt-2"><Badge ok={false} text={`Over-allocated! Only ${remaining} pieces available.`} /></div>}
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
            <Field label="Baby Coil ID"><Select value={form.babyCoilId} onChange={v => f('babyCoilId', v)} options={babyOptions} /></Field>
            <Field label="No. of Tube Pieces"><Input type="number" value={form.tubeCount} onChange={v => f('tubeCount', v)} placeholder={`Max: ${remaining}`} /></Field>
            <Field label="Wt/Piece (T)" auto><Input value={fmtT(weightPerPiece)} disabled /></Field>
          </div>
          {skuMismatch && <div className="mt-2"><Badge ok={false} text="SKU mismatch! All rows in a bundle must share the same SKU." /></div>}
          {Number(form.tubeCount) > remaining && <div className="mt-2"><Badge ok={false} text={`Over-allocated! Only ${remaining} pieces available.`} /></div>}
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
                        <td className="px-4 py-2 text-xs font-medium text-slate-500 uppercase pl-8">Baby Coil ID</td>
                        <td className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Pieces</td>
                        <td className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Wt/Piece (T)</td>
                        <td className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Total Wt (T)</td>
                        <td colSpan={2} className="px-4 py-2 text-xs font-medium text-slate-500 uppercase">Actions</td>
                      </tr>
                      {g.rows.map(row => (
                        <tr key={row.id} className="bg-slate-50/30 dark:bg-slate-800/20 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/20">
                          <td />
                          <td className="px-4 py-2 text-sm text-slate-700 dark:text-slate-300 pl-8">{row.babyCoilId}</td>
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
function Dispatch({ bundles, setBundles, dispatches, setDispatches, babyCoils, coils, skus }) {
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
    // Trace back to baby coil for width/thickness
    const firstRow = bg.rows[0]
    const baby = babyCoils.find(b => b.babyCoilId === firstRow?.babyCoilId)
    const entry = {
      bundleId: bg.bundleId, skuCode: bg.skuCode,
      pieces: bg.totalPieces, weight: bg.totalWeight,
      length: firstRow?.length || 6000,
      width: baby?.width || '', thickness: baby?.thickness || '',
      traceBabyCoilId: firstRow?.babyCoilId,
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
          const baby = babyCoils.find(b => b.babyCoilId === e.traceBabyCoilId)
          const coil = baby ? coils.find(c => c.hrCoilId === baby.hrCoilId) : null
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
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 5: Dispatch</h2>
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
  Slit: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/50 dark:text-cyan-300',
  Tube: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300',
  Bundle: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  Dispatch: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
}

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 }

function Dashboard({ coils, babyCoils, tubes, bundles, dispatches, skus, purchaseOrders }) {
  const active = (arr) => arr.filter(x => !x.deleted)
  const ac = active(coils), ab = active(babyCoils), at = active(tubes), abn = active(bundles), ad = active(dispatches), apo = active(purchaseOrders)
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
  const tubesInPeriod = at.filter(t => inRange(t.dateOfConversion))
  const tubesPcsPeriod = tubesInPeriod.reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
  const tubesWtPeriod = tubesInPeriod.reduce((s, t) => s + Number(t.theoreticalWeight || 0), 0)
  const dispInPeriod = ad.filter(d => inRange(d.dateOfDispatch))
  const dispWtPeriod = dispInPeriod.reduce((s, d) => s + (d.bundleEntries || []).reduce((x, e) => x + Number(e.weight || 0), 0), 0)
  const dispBundlesPeriod = dispInPeriod.reduce((s, d) => s + (d.bundleEntries || []).length, 0)
  const bundlesFormed = abn.length
  const bundlesDispatched = abn.filter(b => b.dispatched).length

  // Active SKUs in period + top by pieces
  const skuPcsInPeriod = useMemo(() => {
    const counts = {}
    tubesInPeriod.forEach(t => { counts[t.skuCode] = (counts[t.skuCode] || 0) + Number(t.numberOfPieces || 0) })
    return counts
  }, [tubesInPeriod])
  const activeSkuCount = Object.keys(skuPcsInPeriod).length
  const topSkuPeriod = Object.entries(skuPcsInPeriod).sort((a, b) => b[1] - a[1])[0]?.[0]

  // ── Stock in hand (point-in-time) with ₹ value via mother-coil cost rate ──
  const stock = useMemo(() => {
    const rateOf = {}
    ac.forEach(c => { rateOf[c.hrCoilId] = Number(c.actualWeight) > 0 ? Number(c.costPrice || 0) / Number(c.actualWeight) : 0 })

    let rawWt = 0, rawVal = 0
    ac.forEach(c => {
      const slit = ab.filter(b => b.hrCoilId === c.hrCoilId).reduce((s, b) => s + Number(b.weight || 0), 0)
      const rem = Math.max(0, Number(c.actualWeight || 0) - slit)
      rawWt += rem; rawVal += rem * (rateOf[c.hrCoilId] || 0)
    })

    let slitWt = 0, slitVal = 0
    ab.forEach(b => {
      const consumed = at.filter(t => t.babyCoilId === b.babyCoilId).reduce((s, t) => s + Number(t.theoreticalWeight || 0), 0)
      const rem = Math.max(0, Number(b.weight || 0) - consumed)
      slitWt += rem; slitVal += rem * (rateOf[b.hrCoilId] || 0)
    })

    let wipPcs = 0, wipWt = 0, wipVal = 0
    const byBaby = {}
    at.forEach(t => {
      const k = t.babyCoilId
      byBaby[k] = byBaby[k] || { pcs: 0, wt: 0 }
      byBaby[k].pcs += Number(t.numberOfPieces || 0)
      byBaby[k].wt += Number(t.theoreticalWeight || 0)
    })
    Object.entries(byBaby).forEach(([babyId, prod]) => {
      const bundled = abn.filter(bn => bn.babyCoilId === babyId).reduce((s, bn) => s + Number(bn.tubeCount || 0), 0)
      const remPcs = Math.max(0, prod.pcs - bundled)
      const remWt = prod.pcs > 0 ? remPcs * (prod.wt / prod.pcs) : 0
      const baby = ab.find(b => b.babyCoilId === babyId)
      wipPcs += remPcs; wipWt += remWt; wipVal += remWt * (baby ? (rateOf[baby.hrCoilId] || 0) : 0)
    })

    let readyWt = 0, readyPcs = 0, readyVal = 0
    const readyBundleIds = new Set()
    abn.filter(b => !b.dispatched).forEach(b => {
      readyWt += Number(b.totalWeight || 0)
      readyPcs += Number(b.tubeCount || 0)
      readyBundleIds.add(b.bundleId)
      const baby = ab.find(bb => bb.babyCoilId === b.babyCoilId)
      readyVal += Number(b.totalWeight || 0) * (baby ? (rateOf[baby.hrCoilId] || 0) : 0)
    })

    return {
      rawWt, rawVal, slitWt, slitVal, wipPcs, wipWt, wipVal,
      readyWt, readyPcs, readyVal, readyBundles: readyBundleIds.size,
      totalVal: rawVal + slitVal + wipVal + readyVal,
    }
  }, [ac, ab, at, abn])

  // ── PO summary ──
  const poStats = useMemo(() => {
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    const open = apo.filter(p => !p.poEndDate || p.poEndDate >= todayStr)
    const expiring = open.filter(p => p.poEndDate && p.poEndDate <= in7)
    return { open: open.length, expiring: expiring.length }
  }, [apo, todayStr])

  // Coil stage breakdown
  const coilStages = useMemo(() => {
    const slittedIds = new Set(ab.map(b => b.hrCoilId))
    const tubedIds = new Set(at.map(t => {
      const baby = ab.find(b => b.babyCoilId === t.babyCoilId)
      return baby?.hrCoilId
    }).filter(Boolean))
    const bundledIds = new Set(abn.map(b => {
      const tube = at.find(t => t.babyCoilId === b.babyCoilId)
      const baby = tube ? ab.find(bb => bb.babyCoilId === tube.babyCoilId) : null
      return baby?.hrCoilId
    }).filter(Boolean))
    const dispatchedIds = new Set(ad.flatMap(d => (d.bundleEntries || []).map(be => {
      const baby = ab.find(b => b.babyCoilId === be.traceBabyCoilId)
      return baby?.hrCoilId
    })).filter(Boolean))

    return [
      { name: 'Awaiting Slit', value: ac.filter(c => !slittedIds.has(c.hrCoilId)).length },
      { name: 'Slit Done', value: ac.filter(c => slittedIds.has(c.hrCoilId) && !tubedIds.has(c.hrCoilId)).length },
      { name: 'Tubes Made', value: ac.filter(c => tubedIds.has(c.hrCoilId) && !bundledIds.has(c.hrCoilId)).length },
      { name: 'Bundled', value: ac.filter(c => bundledIds.has(c.hrCoilId) && !dispatchedIds.has(c.hrCoilId)).length },
      { name: 'Dispatched', value: ac.filter(c => dispatchedIds.has(c.hrCoilId)).length },
    ]
  }, [ac, ab, at, abn, ad])

  // ── Production vs dispatch trend (daily ≤31 days, else weekly) ──
  const trend = useMemo(() => {
    const toStr = range.to || todayStr
    let fromStr = range.from
    if (!fromStr) {
      const dates = [...at.map(t => t.dateOfConversion), ...ad.map(d => d.dateOfDispatch)].filter(Boolean)
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
    at.forEach(t => {
      if (!inRange(t.dateOfConversion)) return
      const b = buckets[bucketKey(t.dateOfConversion)]
      if (b) b.produced += Number(t.theoreticalWeight || 0)
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
  }, [at, ad, range, todayStr, inRange])

  // Yield per coil
  const yieldData = useMemo(() => {
    return ac.map(c => {
      const dispWt = ad.flatMap(d => (d.bundleEntries || []))
        .filter(be => { const baby = ab.find(b => b.babyCoilId === be.traceBabyCoilId); return baby?.hrCoilId === c.hrCoilId })
        .reduce((s, be) => s + Number(be.weight || 0), 0)
      return { name: c.hrCoilId, yield: c.actualWeight ? (dispWt / c.actualWeight) * 100 : 0, actualWt: c.actualWeight, dispWt }
    }).filter(d => d.dispWt > 0)
  }, [ac, ad, ab])

  const avgYield = yieldData.length ? yieldData.reduce((s, d) => s + d.yield, 0) / yieldData.length : 0

  // Top SKUs
  const topSkus = useMemo(() => {
    const counts = {}
    at.forEach(t => { counts[t.skuCode] = (counts[t.skuCode] || 0) + Number(t.numberOfPieces || 0) })
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [at])

  // ── SKU-wise summary (produced/dispatched follow the period; WIP/ready are current) ──
  const skuSummary = useMemo(() => {
    const map = {}
    const get = (code) => (map[code] = map[code] || {
      skuCode: code, producedPcs: 0, producedWt: 0, allProduced: 0, allBundled: 0,
      readyPcs: 0, readyWt: 0, dispPcs: 0, dispWt: 0,
    })
    at.forEach(t => {
      const r = get(t.skuCode)
      r.allProduced += Number(t.numberOfPieces || 0)
      if (inRange(t.dateOfConversion)) {
        r.producedPcs += Number(t.numberOfPieces || 0)
        r.producedWt += Number(t.theoreticalWeight || 0)
      }
    })
    abn.forEach(b => {
      const r = get(b.skuCode)
      r.allBundled += Number(b.tubeCount || 0)
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
        wipPcs: Math.max(0, r.allProduced - r.allBundled),
      }
    })
  }, [at, abn, ad, skus, inRange])

  const skuColumns = [
    { label: 'SKU Code', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'Type', key: 'type' },
    { label: 'Produced (pcs)', key: 'producedPcs' },
    { label: 'Produced (T)', value: r => fmtT(r.producedWt) },
    { label: 'WIP (pcs)', key: 'wipPcs' },
    { label: 'Ready (pcs)', key: 'readyPcs' },
    { label: 'Ready (T)', value: r => fmtT(r.readyWt) },
    { label: 'Dispatched (pcs)', key: 'dispPcs' },
    { label: 'Dispatched (T)', value: r => fmtT(r.dispWt) },
  ]

  // ── Alerts ──
  const alerts = useMemo(() => {
    const list = []
    // Width validation failures
    ac.forEach(c => {
      const babies = ab.filter(b => b.hrCoilId === c.hrCoilId)
      if (babies.length > 0) {
        const sum = babies.reduce((s, b) => s + Number(b.width || 0), 0)
        const chk = tolerance(sum, c.width)
        if (!chk.ok) list.push({ type: 'error', msg: `Width mismatch: ${c.hrCoilId} — ${chk.label}` })
      }
    })
    // Bundle over-allocation: more pieces bundled than produced from a baby coil
    const producedByBaby = {}
    at.forEach(t => { producedByBaby[t.babyCoilId] = (producedByBaby[t.babyCoilId] || 0) + Number(t.numberOfPieces || 0) })
    const bundledByBaby = {}
    abn.forEach(b => { bundledByBaby[b.babyCoilId] = (bundledByBaby[b.babyCoilId] || 0) + Number(b.tubeCount || 0) })
    Object.entries(bundledByBaby).forEach(([babyId, pcs]) => {
      const prod = producedByBaby[babyId] || 0
      if (pcs > prod) list.push({ type: 'error', msg: `Over-allocation: ${babyId} has ${pcs} pcs bundled but only ${prod} produced` })
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
    const slittedIds = new Set(ab.map(b => b.hrCoilId))
    ac.filter(c => !slittedIds.has(c.hrCoilId) && c.dateOfInward < fourteenDaysAgo).forEach(c => {
      list.push({ type: 'warn', msg: `Coil ${c.hrCoilId} awaiting slitting for >14 days` })
    })
    // POs ending within 7 days
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    apo.forEach(p => {
      if (p.poEndDate && p.poEndDate >= todayStr && p.poEndDate <= in7) {
        list.push({ type: 'warn', msg: `PO ${p.purchaseOrderNumber} (${p.vendorName || '—'}) ends on ${p.poEndDate}` })
      }
    })
    return list
  }, [ac, ab, at, abn, ad, apo, todayStr])

  // ── Recent activity across all stages ──
  const recentActivity = useMemo(() => {
    const ev = []
    ac.forEach(c => ev.push({ date: c.dateOfInward, stage: 'Inward', msg: `Coil ${c.hrCoilId} received — ${fmtT(c.actualWeight)}T${c.coilGrade ? `, ${c.coilGrade}` : ''}` }))
    ab.forEach(b => ev.push({ date: b.dateOfConversion, stage: 'Slit', msg: `${b.babyCoilId} slit from ${b.hrCoilId} — ${b.width}mm, ${fmtT(b.weight)}T` }))
    at.forEach(t => ev.push({ date: t.dateOfConversion, stage: 'Tube', msg: `${t.numberOfPieces} pcs of ${skuDesc(t.skuCode)} from ${t.babyCoilId}` }))
    abn.forEach(b => ev.push({ date: b.dateOfEntry, stage: 'Bundle', msg: `${b.bundleId}: ${b.tubeCount} pcs from ${b.babyCoilId}` }))
    ad.forEach(d => ev.push({ date: d.dateOfDispatch, stage: 'Dispatch', msg: `Invoice ${d.invoiceNo || '—'} — ${(d.bundleEntries || []).length} bundle(s), ${fmtT(d.theoreticalWeight)}T, vehicle ${d.vehicleNo || '—'}` }))
    return ev.filter(e => e.date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 10)
  }, [ac, ab, at, abn, ad, skuDesc])

  const totalInvoiceWt = ac.reduce((s, c) => s + Number(c.invoiceWeight || 0), 0)
  const totalActualWt = ac.reduce((s, c) => s + Number(c.actualWeight || 0), 0)

  // ── CSV exports ──
  const downloadStockCSV = () => {
    const rows = ac.map(c => {
      const rate = Number(c.actualWeight) > 0 ? Number(c.costPrice || 0) / Number(c.actualWeight) : 0
      const babies = ab.filter(b => b.hrCoilId === c.hrCoilId)
      const babyIds = babies.map(b => b.babyCoilId)
      const slitTotal = babies.reduce((s, b) => s + Number(b.weight || 0), 0)
      const rawRem = Math.max(0, Number(c.actualWeight || 0) - slitTotal)
      const slitRem = babies.reduce((s, b) => {
        const consumed = at.filter(t => t.babyCoilId === b.babyCoilId).reduce((x, t) => x + Number(t.theoreticalWeight || 0), 0)
        return s + Math.max(0, Number(b.weight || 0) - consumed)
      }, 0)
      let wipPcs = 0, wipWt = 0
      babyIds.forEach(id => {
        const prod = at.filter(t => t.babyCoilId === id)
        const prodPcs = prod.reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
        const prodWt = prod.reduce((s, t) => s + Number(t.theoreticalWeight || 0), 0)
        const bundled = abn.filter(bn => bn.babyCoilId === id).reduce((s, bn) => s + Number(bn.tubeCount || 0), 0)
        const rem = Math.max(0, prodPcs - bundled)
        wipPcs += rem
        wipWt += prodPcs > 0 ? rem * (prodWt / prodPcs) : 0
      })
      const readyWt = abn.filter(bn => !bn.dispatched && babyIds.includes(bn.babyCoilId)).reduce((s, bn) => s + Number(bn.totalWeight || 0), 0)
      const dispWt = ad.flatMap(d => d.bundleEntries || []).filter(be => babyIds.includes(be.traceBabyCoilId)).reduce((s, be) => s + Number(be.weight || 0), 0)
      const stockVal = (rawRem + slitRem + wipWt + readyWt) * rate
      return [
        c.hrCoilId, c.coilGrade || '', c.thickness ?? '', c.width ?? '', fmtT(c.actualWeight),
        fmtT(rawRem), fmtT(slitRem), wipPcs, fmtT(wipWt), fmtT(readyWt), fmtT(dispWt),
        (c.actualWeight ? ((dispWt / Number(c.actualWeight)) * 100).toFixed(1) : '0.0') + '%', stockVal.toFixed(2),
      ]
    })
    downloadCSV(`stock-report-${todayStr}.csv`,
      ['Mother Coil', 'Grade', 'Thickness (mm)', 'Width (mm)', 'Actual Wt (T)', 'Raw Remaining (T)', 'Slit Remaining (T)', 'WIP (pcs)', 'WIP Wt (T)', 'Ready Wt (T)', 'Dispatched Wt (T)', 'Yield %', 'Stock Value (INR)'],
      rows)
  }

  const downloadSkuCSV = () => {
    downloadCSV(`sku-report-${todayStr}.csv`,
      ['SKU Code', 'Description', 'Type', 'Produced (pcs)', 'Produced (T)', 'WIP (pcs)', 'Ready (pcs)', 'Ready (T)', 'Dispatched (pcs)', 'Dispatched (T)'],
      skuSummary.map(r => [r.skuCode, r.description, r.type, r.producedPcs, fmtT(r.producedWt), r.wipPcs, r.readyPcs, fmtT(r.readyWt), r.dispPcs, fmtT(r.dispWt)]))
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
          <Card title="Tubes Produced" value={tubesPcsPeriod} sub={`${fmtT(tubesWtPeriod)}T`} color="cyan" />
          <Card title="Dispatched" value={`${fmtT(dispWtPeriod)}T`} sub={`${dispInPeriod.length} dispatch(es) · ${dispBundlesPeriod} bundle(s)`} color="emerald" />
          <Card title="Avg. Yield (All Time)" value={fmtPct(avgYield)} sub={`${yieldData.length} coils with dispatches`} color="amber" />
        </div>
      </div>

      {/* Stock in Hand KPIs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Stock in Hand — Current</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="Raw Coil Stock" value={`${fmtT(stock.rawWt)}T`} sub={fmtINR(stock.rawVal)} />
          <Card title="Slit Stock" value={`${fmtT(stock.slitWt)}T`} sub={fmtINR(stock.slitVal)} color="cyan" />
          <Card title="Tube WIP" value={`${stock.wipPcs} pcs`} sub={`${fmtT(stock.wipWt)}T · ${fmtINR(stock.wipVal)}`} color="emerald" />
          <Card title="Ready to Dispatch" value={`${fmtT(stock.readyWt)}T`} sub={`${stock.readyBundles} bundle(s) · ${stock.readyPcs} pcs · ${fmtINR(stock.readyVal)}`} color="amber" />
        </div>
      </div>

      {/* Commercial KPIs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Commercial</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="Total Stock Value" value={fmtINR(stock.totalVal)} sub="Raw + Slit + WIP + Ready" />
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
            <p className="mb-3 text-xs text-slate-400">Produced & Dispatched columns follow the selected period; WIP & Ready are current stock.</p>
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
const STAGE_NAMES = ['Inward', 'Slit', 'Tubes', 'Bundled', 'Dispatched']
const STAGE_COLORS = ['#4f46e5', '#0891b2', '#059669', '#d97706', '#dc2626']

// Excel-style summary: 14 locked columns (order is contractual — see .planning/phases/02-coil-tracker-summary)
const SUMMARY_HEADERS = [
  'Coil ID', 'Grade', 'Coil Wt (T)', '# Baby Coils', 'Baby Coil Wt (T)', '# Converted', 'Converted Wt (T)',
  '# Tubes', 'Tubes Wt (T)', '# Dispatched', 'Dispatched Wt (T)', 'Balance to Roll (T)', 'Tube Inventory (T)', 'Tube Inventory (#)',
]
// Numeric columns 3-14 in header order: wt → 2-dp tonnes, count → thousands-separated integer
const SUMMARY_COLS = [
  { key: 'coilWt', fmt: 'wt' }, { key: 'babyCount', fmt: 'count' }, { key: 'babyWt', fmt: 'wt' },
  { key: 'convertedCount', fmt: 'count' }, { key: 'convertedWt', fmt: 'wt' },
  { key: 'tubePcs', fmt: 'count' }, { key: 'tubesWt', fmt: 'wt' },
  { key: 'dispatchedPcs', fmt: 'count' }, { key: 'dispatchedWt', fmt: 'wt' },
  { key: 'balanceToRoll', fmt: 'wt' }, { key: 'tubeInvWt', fmt: 'wt' }, { key: 'tubeInvPcs', fmt: 'count' },
]
const SUMMARY_TD = 'px-2 py-1 whitespace-nowrap border-b border-r border-slate-200 dark:border-slate-600'
const SUBTOTAL_TD = 'sticky top-8 z-10 px-2 py-1 bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap border-b-2 border-r border-slate-300 dark:border-slate-600'

function CoilTracker({ coils, babyCoils, tubes, bundles, dispatches }) {
  const [selectedCoilId, setSelectedCoilId] = useState(null)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const active = (arr) => arr.filter(x => !x.deleted)
  const ac = active(coils), ab = active(babyCoils), at = active(tubes), abn = active(bundles), ad = active(dispatches)

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
      const babies = ab.filter(b => b.hrCoilId === c.hrCoilId)
      const babyIds = babies.map(b => b.babyCoilId)
      const coilTubes = at.filter(t => babyIds.includes(t.babyCoilId))
      const coilWt = Number(c.actualWeight || 0)
      const babyWt = babies.reduce((s, b) => s + Number(b.weight || 0), 0)
      const convertedBabies = babies.filter(b => coilTubes.some(t => t.babyCoilId === b.babyCoilId))
      const convertedWt = convertedBabies.reduce((s, b) => s + Number(b.weight || 0), 0)
      const tubePcs = coilTubes.reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
      const tubesWt = coilTubes.reduce((s, t) => s + Number(t.theoreticalWeight || 0), 0)
      const dispEntries = ad.flatMap(d => (d.bundleEntries || [])).filter(be => babyIds.includes(be.traceBabyCoilId))
      const dispatchedPcs = dispEntries.reduce((s, be) => s + Number(be.pieces || 0), 0)
      const dispatchedWt = dispEntries.reduce((s, be) => s + Number(be.weight || 0), 0)

      return {
        hrCoilId: c.hrCoilId, grade: c.coilGrade,
        coilWt, babyCount: babies.length, babyWt,
        convertedCount: convertedBabies.length, convertedWt,
        tubePcs, tubesWt, dispatchedPcs, dispatchedWt,
        balanceToRoll: coilWt - babyWt,
        tubeInvWt: tubesWt - dispatchedWt,
        tubeInvPcs: tubePcs - dispatchedPcs,
      }
    })
  }, [filteredCoils, ab, at, ad])

  // ── Subtotals over the filtered set (rendered pinned at the top of the table) ──
  const subtotals = useMemo(() => inventorySummary.reduce((s, r) => ({
    coilCount: s.coilCount + 1,
    coilWt: s.coilWt + r.coilWt, babyCount: s.babyCount + r.babyCount, babyWt: s.babyWt + r.babyWt,
    convertedCount: s.convertedCount + r.convertedCount, convertedWt: s.convertedWt + r.convertedWt,
    tubePcs: s.tubePcs + r.tubePcs, tubesWt: s.tubesWt + r.tubesWt,
    dispatchedPcs: s.dispatchedPcs + r.dispatchedPcs, dispatchedWt: s.dispatchedWt + r.dispatchedWt,
    balanceToRoll: s.balanceToRoll + r.balanceToRoll, tubeInvWt: s.tubeInvWt + r.tubeInvWt, tubeInvPcs: s.tubeInvPcs + r.tubeInvPcs,
  }), { coilCount: 0, coilWt: 0, babyCount: 0, babyWt: 0, convertedCount: 0, convertedWt: 0, tubePcs: 0, tubesWt: 0, dispatchedPcs: 0, dispatchedWt: 0, balanceToRoll: 0, tubeInvWt: 0, tubeInvPcs: 0 }), [inventorySummary])

  // ── Selected coil journey ──
  const selectedCoil = ac.find(c => c.hrCoilId === selectedCoilId)
  const journey = useMemo(() => {
    if (!selectedCoil) return null
    const babies = ab.filter(b => b.hrCoilId === selectedCoilId)
    const babyIds = babies.map(b => b.babyCoilId)
    const coilTubes = at.filter(t => babyIds.includes(t.babyCoilId))
    const coilBundles = abn.filter(b => babyIds.includes(b.babyCoilId))
    const dispEntries = ad.flatMap(d => (d.bundleEntries || []).map(be => ({ ...be, dateOfDispatch: d.dateOfDispatch, vehicleNo: d.vehicleNo, invoiceNo: d.invoiceNo })))
      .filter(be => babyIds.includes(be.traceBabyCoilId))

    // Baby coil details with downstream info
    const babyDetails = babies.map(b => {
      const bTubes = coilTubes.filter(t => t.babyCoilId === b.babyCoilId)
      const bBundles = coilBundles.filter(bn => bn.babyCoilId === b.babyCoilId)
      const tubePcs = bTubes.reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
      const tubeWt = bTubes.reduce((s, t) => s + Number(t.theoreticalWeight || 0), 0)
      const bundledPcs = bBundles.reduce((s, bn) => s + Number(bn.tubeCount || 0), 0)
      const hasDispatch = bBundles.some(bn => bn.dispatched)
      return { ...b, tubePcs, tubeWt, bundledPcs, hasDispatch }
    })

    // Tube details
    const tubeDetails = coilTubes.map(t => {
      const bundled = coilBundles.filter(b => b.babyCoilId === t.babyCoilId).reduce((s, b) => s + Number(b.tubeCount || 0), 0)
      return { ...t, bundledPcs: bundled, remainingPcs: Number(t.numberOfPieces || 0) - bundled }
    })

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
    const totalSlitWt = babies.reduce((s, b) => s + Number(b.weight || 0), 0)
    const totalTubeWt = coilTubes.reduce((s, t) => s + Number(t.theoreticalWeight || 0), 0)
    const totalBundleWt = coilBundles.reduce((s, b) => s + Number(b.totalWeight || 0), 0)
    const totalDispatchWt = dispEntries.reduce((s, be) => s + Number(be.weight || 0), 0)

    // Stage reached
    const stageReached = totalDispatchWt > 0 ? 4 : bundleDetails.length > 0 ? 3 : coilTubes.length > 0 ? 2 : babies.length > 0 ? 1 : 0

    return { babyDetails, tubeDetails, bundleDetails, totalSlitWt, totalTubeWt, totalBundleWt, totalDispatchWt, stageReached }
  }, [selectedCoil, selectedCoilId, ab, at, abn, ad])

  // ── Weight flow chart data ──
  const weightFlowData = useMemo(() => {
    if (!selectedCoil || !journey) return []
    return [
      { name: 'Mother Coil', weight: Number(selectedCoil.actualWeight || 0) },
      { name: 'Slit', weight: journey.totalSlitWt },
      { name: 'Tubes', weight: journey.totalTubeWt },
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
                  <td colSpan={14} className="px-2 py-8 text-center text-slate-400 border-b border-slate-200 dark:border-slate-600">No coils in the selected period</td>
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
                  `${journey.babyDetails.length} coils · ${fmtT(journey.totalSlitWt)} T`,
                  `${journey.tubeDetails.reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)} pcs · ${fmtT(journey.totalTubeWt)} T`,
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

          {/* 2c: Baby Coils Breakdown */}
          {journey.babyDetails.length > 0 && (
            <Section title={`Baby Coils (${journey.babyDetails.length})`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700">
                      {['Baby Coil ID', 'Width (mm)', 'Weight (T)', 'Cost (₹)', 'Tubes (pcs)', 'Tube Wt (T)', 'Bundled (pcs)', 'Status'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {journey.babyDetails.map(b => (
                      <tr key={b.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{b.babyCoilId}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.width}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{fmtT(b.weight)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.costPrice ? `₹${Number(b.costPrice).toLocaleString()}` : '—'}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.tubePcs || '—'}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{fmtT(b.tubeWt)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{b.bundledPcs || '—'}</td>
                        <td className="px-4 py-3">
                          {b.hasDispatch ? <Badge ok={true} text="Dispatched" /> : b.tubePcs > 0 ? <span className="text-xs text-amber-600 dark:text-amber-400">In Progress</span> : <span className="text-xs text-slate-400">Awaiting</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          {/* 2d: Tubes Detail */}
          {journey.tubeDetails.length > 0 && (
            <Section title={`Tubes (${journey.tubeDetails.length} batches)`}>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-slate-700">
                      {['Baby Coil ID', 'SKU', 'Pieces', 'Tube Wt (T)', 'Bundled (pcs)', 'Remaining (pcs)'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-300 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
                    {journey.tubeDetails.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 dark:hover:bg-slate-700/50">
                        <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{t.babyCoilId}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.skuCode}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.numberOfPieces}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{fmtT(t.theoreticalWeight)}</td>
                        <td className="px-4 py-3 text-slate-700 dark:text-slate-300">{t.bundledPcs}</td>
                        <td className="px-4 py-3">
                          <span className={t.remainingPcs > 0 ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-green-600 dark:text-green-400'}>
                            {t.remainingPcs}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

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
  { key: 'coilToSlit', label: '2. Coil to Slit' },
  { key: 'slitToTube', label: '3. Slit to Tube' },
  { key: 'bundleFormation', label: '4. Bundle Formation' },
  { key: 'dispatch', label: '5. Dispatch' },
  { key: 'skuMaster', label: 'SKU Master' },
  { key: 'poMaster', label: 'PO Master' },
]

const TABLE_LABELS = {
  coils: 'Coil Inward',
  baby_coils: 'Baby Coils',
  tubes: 'Tubes',
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
  const [babyCoils, setBabyCoils, babyCoilsLoading] = useSupabaseStore('jsw:babyCoils', [])
  const [tubes, setTubes, tubesLoading] = useSupabaseStore('jsw:tubes', [])
  const [bundles, setBundles, bundlesLoading] = useSupabaseStore('jsw:bundles', [])
  const [dispatches, setDispatches, dispatchesLoading] = useSupabaseStore('jsw:dispatches', [])
  const [skus, setSkus, skusLoading] = useSupabaseStore('jsw:skus', DEFAULT_SKUS)
  const [purchaseOrders, setPurchaseOrders, poLoading] = useSupabaseStore('jsw:purchaseOrders', [])

  const loading = coilsLoading || babyCoilsLoading || tubesLoading || bundlesLoading || dispatchesLoading || skusLoading || poLoading

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    LS.set('jsw:dark', dark)
  }, [dark])

  const resetData = () => {
    if (confirm('Reset ALL data? This will clear all coil, slit, tube, bundle & dispatch records. SKU Master will be preserved. This cannot be undone.')) {
      setCoils([])
      setBabyCoils([])
      setTubes([])
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
        {tab === 'dashboard' && <Dashboard coils={coils} babyCoils={babyCoils} tubes={tubes} bundles={bundles} dispatches={dispatches} skus={skus} purchaseOrders={purchaseOrders} />}
        {tab === 'coilTracker' && <CoilTracker coils={coils} babyCoils={babyCoils} tubes={tubes} bundles={bundles} dispatches={dispatches} />}
        {tab === 'coilInward' && <CoilInward coils={coils} setCoils={setCoils} babyCoils={babyCoils} dispatches={dispatches} />}
        {tab === 'coilToSlit' && <CoilToSlit coils={coils} babyCoils={babyCoils} setBabyCoils={setBabyCoils} />}
        {tab === 'slitToTube' && <SlitToTube babyCoils={babyCoils} tubes={tubes} setTubes={setTubes} skus={skus} coils={coils} />}
        {tab === 'bundleFormation' && <BundleFormation tubes={tubes} bundles={bundles} setBundles={setBundles} babyCoils={babyCoils} skus={skus} />}
        {tab === 'dispatch' && <Dispatch bundles={bundles} setBundles={setBundles} dispatches={dispatches} setDispatches={setDispatches} babyCoils={babyCoils} coils={coils} skus={skus} />}
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

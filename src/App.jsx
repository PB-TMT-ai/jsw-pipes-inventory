import React, { useState, useEffect, useMemo, useCallback } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useSupabaseStore } from './lib/db'
import DEFAULT_SKUS from './data/skus'
import { SEED_COILS, SEED_BABY_COILS, SEED_TUBES, SEED_BUNDLES, SEED_DISPATCHES } from './data/seedData'

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

// ═══════════════════════════════════════════════════════════════
// SEED DATA BUILDERS
// ═══════════════════════════════════════════════════════════════
function buildSeedCoils() {
  return SEED_COILS.map(c => {
    const d = new Date(c.dateOfInward)
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yy = String(d.getFullYear()).slice(2)
    const xx = String(c.hrCoilNo).padStart(2, '0')
    return { ...c, id: crypto.randomUUID(), hrCoilId: `HYD-${mm}${yy}-${xx}`, deleted: false }
  })
}

function buildSeedBabyCoils() {
  return SEED_BABY_COILS.map(bc => ({
    ...bc, id: crypto.randomUUID(), length: 0, deleted: false
  }))
}

function buildSeedTubes() {
  return SEED_TUBES.map(t => ({
    ...t, id: crypto.randomUUID(), length: 6000, deleted: false
  }))
}

function buildSeedBundles() {
  return SEED_BUNDLES.map(b => ({
    ...b, id: crypto.randomUUID(), dispatched: false, deleted: false
  }))
}

function buildSeedDispatches() {
  return SEED_DISPATCHES.map(d => ({
    ...d, id: crypto.randomUUID(), selectedBundles: d.bundleEntries, deleted: false
  }))
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════
const today = () => new Date().toISOString().split('T')[0]
const uid = () => crypto.randomUUID()
const fmtT = (v) => v != null ? Number(v).toFixed(3) : '—'
const fmtPct = (v) => v != null ? Number(v).toFixed(1) + '%' : '—'

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
    <p className={`mt-1 text-2xl font-semibold text-${color}-600 dark:text-${color}-400`}>{value}</p>
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

function DataTable({ columns, data, actions, onEdit, onDelete }) {
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
              <tr key={row.id || ri} className="hover:bg-slate-50 dark:hover:bg-slate-750">
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
    const nums = coils.filter(c => !c.deleted).map(c => c.hrCoilNo)
    return nums.length ? Math.max(...nums) + 1 : 1
  }, [coils])

  const hrCoilId = useMemo(() => {
    const n = editId ? form.hrCoilNo : (form.hrCoilNo || nextNo)
    return form.dateOfInward && n ? genHRCoilId(form.dateOfInward, n) : ''
  }, [form.dateOfInward, form.hrCoilNo, nextNo, editId])

  const isDupe = useMemo(() => coils.some(c => !c.deleted && c.hrCoilId === hrCoilId && c.id !== editId), [coils, hrCoilId, editId])

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
    if (confirm('Delete this coil record?')) setCoils(prev => prev.map(c => c.id === row.id ? { ...c, deleted: true } : c))
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
    { label: 'Yield', render: r => <YieldBadge pct={getCoilStats(r).yieldPct} /> },
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
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const parentCoil = useMemo(() => coils.find(c => !c.deleted && c.hrCoilId === form.hrCoilId), [coils, form.hrCoilId])
  const siblingsOfParent = useMemo(() => babyCoils.filter(b => !b.deleted && b.hrCoilId === form.hrCoilId && b.id !== editId), [babyCoils, form.hrCoilId, editId])
  const nextLetter = useMemo(() => genBabyLetter(siblingsOfParent.length + (editId ? 0 : 0)), [siblingsOfParent, editId])

  const babyCoilEntry = editId ? form.babyCoilEntry : nextLetter
  const babyCoilId = form.hrCoilId ? `${form.hrCoilId}-${babyCoilEntry}` : ''
  const isDupe = babyCoils.some(b => !b.deleted && b.babyCoilId === babyCoilId && b.id !== editId)

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
  const widthCheck = parentCoil ? tolerance(sumBabyWidths, parentCoil.width) : null

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
  const softDelete = (row) => {
    if (confirm('Delete this baby coil?')) {
      const parent = coils.find(c => c.hrCoilId === row.hrCoilId)
      let updated = babyCoils.map(b => b.id === row.id ? { ...b, deleted: true } : b)
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

  const coilOptions = coils.filter(c => !c.deleted).map(c => ({ value: c.hrCoilId, label: `${c.hrCoilId} (W:${c.width}mm, ${fmtT(c.actualWeight)}T)` }))

  // Group display: for each parent, show width sum check
  const parentGroups = useMemo(() => {
    const groups = {}
    babyCoils.filter(b => !b.deleted).forEach(b => {
      if (!groups[b.hrCoilId]) groups[b.hrCoilId] = { babies: [], parent: coils.find(c => c.hrCoilId === b.hrCoilId) }
      groups[b.hrCoilId].babies.push(b)
    })
    return groups
  }, [babyCoils, coils])

  const columns = [
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
      const chk = tolerance(sum, g.parent.width)
      return <Badge ok={chk.ok} text={chk.label} />
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
            <div className={`mt-3 p-3 rounded-md ${widthCheck.pct <= 100 ? 'bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800' : widthCheck.pct <= 105 ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800' : 'bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800'}`}>
              <span className={`text-sm font-medium ${widthCheck.pct <= 100 ? 'text-green-700 dark:text-green-400' : widthCheck.pct <= 105 ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>
                Width Sum: {widthCheck.label} {widthCheck.pct <= 100 ? '✔ OK' : widthCheck.pct <= 105 ? '⚠ Over 100% (within tolerance)' : '✘ Exceeds 105% — cannot save'}
              </span>
            </div>
          )}
          {isDupe && <div className="mt-2"><Badge ok={false} text="Duplicate Baby Coil ID!" /></div>}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.hrCoilId || !form.width || isDupe || (widthCheck && widthCheck.pct > 105)} variant="success">{editId ? 'Update' : 'Save Baby Coil'}</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

      <Section title="Baby Coils">
        <DataTable columns={columns} data={babyCoils} onEdit={startEdit} onDelete={softDelete} />
      </Section>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// STAGE 3: SLIT TO TUBE
// ═══════════════════════════════════════════════════════════════
function SlitToTube({ babyCoils, tubes, setTubes, skus, coils }) {
  const emptyForm = { dateOfConversion: today(), skuCode: '', babyCoilId: '', numberOfPieces: '', width: '' }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const baby = useMemo(() => babyCoils.find(b => !b.deleted && b.babyCoilId === form.babyCoilId), [babyCoils, form.babyCoilId])
  const sku = useMemo(() => skus.find(s => s.skuCode === form.skuCode), [skus, form.skuCode])

  // Theoretical weight = (pieces / total possible) × baby weight
  // Simplified: total weight for all tubes from this baby = baby weight
  // Per piece weight = baby.weight / totalPiecesFromBaby, then × numberOfPieces
  const existingTubesFromBaby = useMemo(() => tubes.filter(t => !t.deleted && t.babyCoilId === form.babyCoilId && t.id !== editId), [tubes, form.babyCoilId, editId])
  const totalPiecesExisting = existingTubesFromBaby.reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
  const totalPiecesIncl = totalPiecesExisting + Number(form.numberOfPieces || 0)
  const theoreticalWeight = baby && form.numberOfPieces && totalPiecesIncl > 0
    ? (Number(form.numberOfPieces) / totalPiecesIncl) * baby.weight : 0

  // Width sum check: total tube widths vs baby coil width
  const sumTubeWidths = useMemo(() => {
    const existingWidths = existingTubesFromBaby.reduce((s, t) => s + Number(t.width || 0), 0)
    return existingWidths + Number(form.width || 0)
  }, [existingTubesFromBaby, form.width])
  const tubeWidthCheck = baby ? tolerance(sumTubeWidths, baby.width) : null

  const motherCoil = useMemo(() => baby ? coils.find(c => c.hrCoilId === baby.hrCoilId) : null, [baby, coils])

  const save = () => {
    const record = {
      ...form, id: editId || uid(),
      thickness: baby?.thickness, width: Number(form.width),
      length: sku?.length || 6000,
      theoreticalWeight,
      deleted: false,
    }
    let updated
    if (editId) {
      updated = tubes.map(t => t.id === editId ? record : t)
    } else {
      updated = [...tubes, record]
    }
    // Recalculate all tube weights for this baby
    const babyTubes = updated.filter(t => !t.deleted && t.babyCoilId === form.babyCoilId)
    const totalPcs = babyTubes.reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
    updated = updated.map(t => {
      if (!t.deleted && t.babyCoilId === form.babyCoilId && totalPcs > 0 && baby) {
        return { ...t, theoreticalWeight: (Number(t.numberOfPieces) / totalPcs) * baby.weight }
      }
      return t
    })
    setTubes(updated)
    setForm(emptyForm); setEditId(null); setShowForm(false)
  }

  const startEdit = (row) => { setForm({ ...row }); setEditId(row.id); setShowForm(true) }
  const softDelete = (row) => { if (confirm('Delete?')) setTubes(prev => prev.map(t => t.id === row.id ? { ...t, deleted: true } : t)) }

  const babyOptions = babyCoils.filter(b => !b.deleted).map(b => ({ value: b.babyCoilId, label: `${b.babyCoilId} (W:${b.width}mm, ${fmtT(b.weight)}T)` }))
  const skuOptions = skus.filter(s => s.status === 'published').map(s => ({ value: s.skuCode, label: s.description || s.skuCode }))

  const columns = [
    { label: 'Baby Coil ID', key: 'babyCoilId' },
    { label: 'SKU', key: 'skuCode' },
    { label: 'Pieces', key: 'numberOfPieces' },
    { label: 'Thick (mm)', key: 'thickness' },
    { label: 'Width (mm)', key: 'width' },
    { label: 'Length (mm)', key: 'length' },
    { label: 'Theor. Wt (T)', value: r => fmtT(r.theoreticalWeight) },
  ]

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
            <Field label="SKU Code"><Select value={form.skuCode} onChange={v => f('skuCode', v)} options={skuOptions} /></Field>
            <Field label="Baby Coil ID"><Select value={form.babyCoilId} onChange={v => f('babyCoilId', v)} options={babyOptions} /></Field>
            <Field label="Number of Pieces"><Input type="number" value={form.numberOfPieces} onChange={v => f('numberOfPieces', v)} /></Field>
            <Field label="Thickness (mm)" auto><Input value={baby?.thickness ?? ''} disabled /></Field>
            <Field label="Width (mm)" helper="Tube width — can differ from slit width"><Input type="number" value={form.width} onChange={v => f('width', v)} /></Field>
            <Field label="Length (mm)" auto><Input value={sku?.length ?? 6000} disabled /></Field>
            <Field label="Theoretical Weight (T)" auto><Input value={fmtT(theoreticalWeight)} disabled /></Field>
          </div>
          {baby && tubeWidthCheck && form.width && (
            <div className={`mt-3 p-3 rounded-md ${tubeWidthCheck.pct <= 100 ? 'bg-green-50 border border-green-200 dark:bg-green-950 dark:border-green-800' : tubeWidthCheck.pct <= 105 ? 'bg-yellow-50 border border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800' : 'bg-red-50 border border-red-200 dark:bg-red-950 dark:border-red-800'}`}>
              <span className={`text-sm font-medium ${tubeWidthCheck.pct <= 100 ? 'text-green-700 dark:text-green-400' : tubeWidthCheck.pct <= 105 ? 'text-yellow-700 dark:text-yellow-400' : 'text-red-700 dark:text-red-400'}`}>
                Width Sum: {tubeWidthCheck.label} {tubeWidthCheck.pct <= 100 ? '✔ OK' : tubeWidthCheck.pct <= 105 ? '⚠ Over 100% (within tolerance)' : '✘ Exceeds 105% — cannot save'}
              </span>
            </div>
          )}
          {motherCoil && (
            <p className="mt-2 text-xs text-slate-500">Mother Coil: {motherCoil.hrCoilId} — Actual Wt: {fmtT(motherCoil.actualWeight)}T</p>
          )}
          <div className="mt-4 flex gap-2">
            <Btn onClick={save} disabled={!form.babyCoilId || !form.skuCode || !form.numberOfPieces || !form.width || (tubeWidthCheck && tubeWidthCheck.pct > 105)} variant="success">{editId ? 'Update' : 'Save'}</Btn>
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
function BundleFormation({ tubes, bundles, setBundles, babyCoils }) {
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
      return { value: id, label: `${id} — ${rem} pcs remaining (SKU: ${t?.skuCode})` }
    })
  }, [tubes, bundles])

  // Group by bundle for display
  const bundleGroups = useMemo(() => {
    const groups = {}
    bundles.filter(b => !b.deleted).forEach(b => {
      if (!groups[b.bundleId]) groups[b.bundleId] = { rows: [], totalPieces: 0, totalWeight: 0, skuCode: b.skuCode, dispatched: b.dispatched }
      groups[b.bundleId].rows.push(b)
      groups[b.bundleId].totalPieces += Number(b.tubeCount || 0)
      groups[b.bundleId].totalWeight += Number(b.totalWeight || 0)
    })
    return groups
  }, [bundles])

  // Filtered and sorted groups for accordion
  const filteredGroups = useMemo(() => {
    let entries = Object.entries(bundleGroups)
    if (accSearch) {
      const q = accSearch.toLowerCase()
      entries = entries.filter(([bid, g]) =>
        bid.toLowerCase().includes(q) ||
        (g.skuCode || '').toLowerCase().includes(q) ||
        g.rows.some(r => (r.babyCoilId || '').toLowerCase().includes(q))
      )
    }
    if (accSortCol !== null) {
      const sortFns = [
        (a, b) => a[0].localeCompare(b[0]),
        (a, b) => (a[1].skuCode || '').localeCompare(b[1].skuCode || ''),
        (a, b) => a[1].totalPieces - b[1].totalPieces,
        (a, b) => a[1].totalWeight - b[1].totalWeight,
        (a, b) => a[1].rows.length - b[1].rows.length,
        (a, b) => (a[1].dispatched ? 1 : 0) - (b[1].dispatched ? 1 : 0),
      ]
      const fn = sortFns[accSortCol]
      if (fn) entries = [...entries].sort((a, b) => accSortDir === 'asc' ? fn(a, b) : fn(b, a))
    }
    return entries
  }, [bundleGroups, accSearch, accSortCol, accSortDir])

  const accColumns = ['Bundle ID', 'SKU', 'Total Pieces', 'Total Weight (T)', '# Sources', 'Status']

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
            <Field label="SKU Code" auto><Input value={skuCode} disabled /></Field>
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
            <span className="text-sm text-slate-600 dark:text-slate-400">SKU: <strong className="text-slate-900 dark:text-white">{bundleGroups[targetBundleId]?.skuCode}</strong></span>
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
                  <tr className={`hover:bg-slate-50 dark:hover:bg-slate-750 cursor-pointer ${g.dispatched ? 'border-l-4 border-l-green-400' : ''}`}
                    onClick={() => toggleExpand(bid)}>
                    <td className="px-2 py-3 text-center text-slate-400">
                      <span className={`inline-block transition-transform duration-150 ${expandedBundles.has(bid) ? 'rotate-90' : ''}`}>▶</span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white whitespace-nowrap">{bid}</td>
                    <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">{g.skuCode}</td>
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
function Dispatch({ bundles, setBundles, dispatches, setDispatches, babyCoils }) {
  const emptyForm = { dateOfDispatch: today(), vehicleNo: '', invoiceNo: '', vehicleWeight: '', selectedBundles: [] }
  const [form, setForm] = useState(emptyForm)
  const [editId, setEditId] = useState(null)
  const [showForm, setShowForm] = useState(false)
  const [bundleToAdd, setBundleToAdd] = useState('')
  const f = (k, v) => setForm(p => ({ ...p, [k]: v }))

  // Undispatched bundles (grouped by bundleId)
  const undispatchedBundles = useMemo(() => {
    const groups = {}
    bundles.filter(b => !b.deleted && !b.dispatched).forEach(b => {
      if (!groups[b.bundleId]) groups[b.bundleId] = { bundleId: b.bundleId, skuCode: b.skuCode, totalPieces: 0, totalWeight: 0, rows: [] }
      groups[b.bundleId].totalPieces += Number(b.tubeCount || 0)
      groups[b.bundleId].totalWeight += Number(b.totalWeight || 0)
      groups[b.bundleId].rows.push(b)
    })
    return Object.values(groups)
  }, [bundles])

  const bundleOptions = undispatchedBundles.map(b => ({ value: b.bundleId, label: `${b.bundleId} — ${b.totalPieces} pcs, ${fmtT(b.totalWeight)}T (${b.skuCode})` }))

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
    if (editId) {
      setDispatches(prev => prev.map(d => d.id === editId ? record : d))
    } else {
      setDispatches(prev => [...prev, record])
    }
    // Mark bundles as dispatched
    const dispBundleIds = form.selectedBundles.map(b => b.bundleId)
    setBundles(prev => prev.map(b => dispBundleIds.includes(b.bundleId) ? { ...b, dispatched: true } : b))
    setForm(emptyForm); setEditId(null); setShowForm(false)
  }

  const softDelete = (row) => {
    if (confirm('Delete dispatch record? Bundles will be marked as undispatched.')) {
      const bundleIds = (row.bundleEntries || []).map(b => b.bundleId)
      setBundles(prev => prev.map(b => bundleIds.includes(b.bundleId) ? { ...b, dispatched: false } : b))
      setDispatches(prev => prev.map(d => d.id === row.id ? { ...d, deleted: true } : d))
    }
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
        <Section title="Record Dispatch">
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
                      <span className="text-xs text-slate-500 ml-2">{b.skuCode} | {b.pieces} pcs | {fmtT(b.weight)}T</span>
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
            <Btn onClick={save} disabled={!form.invoiceNo || !form.vehicleNo || form.selectedBundles.length === 0} variant="success">Save Dispatch</Btn>
            <Btn variant="ghost" onClick={() => { setShowForm(false); setEditId(null) }}>Cancel</Btn>
          </div>
        </Section>
      )}

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
  const emptySku = { productType: 'SHS', skuCode: '', description: '', height: '', breadth: '', thickness: '', length: 6000, nominalBore: '', outsideDiameter: '', hsnCode: '72080000', status: 'published' }
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

  const columns = [
    { label: 'Type', key: 'productType' },
    { label: 'SKU Code', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'H', key: 'height' },
    { label: 'B', key: 'breadth' },
    { label: 'Thick', key: 'thickness' },
    { label: 'Length', key: 'length' },
    { label: 'HSN', key: 'hsnCode' },
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
function Dashboard({ coils, babyCoils, tubes, bundles, dispatches }) {
  const active = (arr) => arr.filter(x => !x.deleted)
  const ac = active(coils), ab = active(babyCoils), at = active(tubes), abn = active(bundles), ad = active(dispatches)

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

  // Production metrics
  const todayStr = today()
  const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]
  const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0]
  const tubesToday = at.filter(t => t.dateOfConversion === todayStr).reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
  const tubesWeek = at.filter(t => t.dateOfConversion >= weekAgo).reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
  const tubesMonth = at.filter(t => t.dateOfConversion >= monthAgo).reduce((s, t) => s + Number(t.numberOfPieces || 0), 0)
  const bundlesFormed = abn.length
  const bundlesDispatched = abn.filter(b => b.dispatched).length

  // Alerts
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
    return list
  }, [ac, ab, abn])

  const totalInvoiceWt = ac.reduce((s, c) => s + Number(c.invoiceWeight || 0), 0)
  const totalActualWt = ac.reduce((s, c) => s + Number(c.actualWeight || 0), 0)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Dashboard</h2>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card title="Total Coils" value={ac.length} sub={`Invoice: ${fmtT(totalInvoiceWt)}T | Actual: ${fmtT(totalActualWt)}T`} />
        <Card title="Tubes Produced (Month)" value={tubesMonth} sub={`Today: ${tubesToday} | Week: ${tubesWeek}`} color="cyan" />
        <Card title="Bundles" value={`${bundlesDispatched} / ${bundlesFormed}`} sub="Dispatched / Formed" color="emerald" />
        <Card title="Avg. Yield" value={fmtPct(avgYield)} sub={`${yieldData.length} coils with dispatches`} color="amber" />
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
        <Section title="Top SKUs by Volume">
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
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════
const TABS = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'coilInward', label: '1. Coil Inward' },
  { key: 'coilToSlit', label: '2. Coil to Slit' },
  { key: 'slitToTube', label: '3. Slit to Tube' },
  { key: 'bundleFormation', label: '4. Bundle Formation' },
  { key: 'dispatch', label: '5. Dispatch' },
  { key: 'skuMaster', label: 'SKU Master' },
]

export default function App() {
  const [dark, setDark] = useState(() => LS.get('jsw:dark') ?? false)
  const [tab, setTab] = useState('dashboard')
  const [coils, setCoils, coilsLoading] = useSupabaseStore('jsw:coils', [])
  const [babyCoils, setBabyCoils, babyCoilsLoading] = useSupabaseStore('jsw:babyCoils', [])
  const [tubes, setTubes, tubesLoading] = useSupabaseStore('jsw:tubes', [])
  const [bundles, setBundles, bundlesLoading] = useSupabaseStore('jsw:bundles', [])
  const [dispatches, setDispatches, dispatchesLoading] = useSupabaseStore('jsw:dispatches', [])
  const [skus, setSkus, skusLoading] = useSupabaseStore('jsw:skus', DEFAULT_SKUS)

  const loading = coilsLoading || babyCoilsLoading || tubesLoading || bundlesLoading || dispatchesLoading || skusLoading

  // Auto-seed: push seed data to Supabase when seed version changes
  const SEED_VERSION = 2
  useEffect(() => {
    if (!loading && LS.get('jsw:seedVersion') !== SEED_VERSION) {
      setCoils(buildSeedCoils())
      setBabyCoils(buildSeedBabyCoils())
      setTubes(buildSeedTubes())
      setBundles(buildSeedBundles())
      setDispatches(buildSeedDispatches())
      setSkus(DEFAULT_SKUS)
      LS.set('jsw:seedVersion', SEED_VERSION)
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    LS.set('jsw:dark', dark)
  }, [dark])

  const resetData = () => {
    if (confirm('Reset ALL data to seed state? This cannot be undone.')) {
      setCoils(buildSeedCoils())
      setBabyCoils(buildSeedBabyCoils())
      setTubes(buildSeedTubes())
      setBundles(buildSeedBundles())
      setDispatches(buildSeedDispatches())
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
        {tab === 'dashboard' && <Dashboard coils={coils} babyCoils={babyCoils} tubes={tubes} bundles={bundles} dispatches={dispatches} />}
        {tab === 'coilInward' && <CoilInward coils={coils} setCoils={setCoils} babyCoils={babyCoils} dispatches={dispatches} />}
        {tab === 'coilToSlit' && <CoilToSlit coils={coils} babyCoils={babyCoils} setBabyCoils={setBabyCoils} />}
        {tab === 'slitToTube' && <SlitToTube babyCoils={babyCoils} tubes={tubes} setTubes={setTubes} skus={skus} coils={coils} />}
        {tab === 'bundleFormation' && <BundleFormation tubes={tubes} bundles={bundles} setBundles={setBundles} babyCoils={babyCoils} />}
        {tab === 'dispatch' && <Dispatch bundles={bundles} setBundles={setBundles} dispatches={dispatches} setDispatches={setDispatches} babyCoils={babyCoils} />}
        {tab === 'skuMaster' && <SKUMaster skus={skus} setSkus={setSkus} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-700 py-4 mt-8">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-xs text-slate-400">JSW One Pipes & Tubes — Inventory Management System v1.0</p>
        </div>
      </footer>
    </div>
  )
}

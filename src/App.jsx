import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts'
import { useSupabaseStore } from './lib/db'
import {
  fmtT, fmtPct, fmtINR, genHRCoilId, tolerance,
  weightPerPieceFromSku, buildReconciliationRows, coilInventoryRow,
  coilFifoAllocate, coilConsumption, producedPool, dispatchCoilTrace,
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
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 2: Slitting</h2>
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

  // Present baby coils in the shape coilFifoAllocate expects (FIFO key = babyCoilId,
  // capacity = baby weight, date = dateOfConversion). Thickness is inherited from the mother.
  const babyAsCoils = useMemo(() => (babyCoils || [])
    .filter(b => !b.deleted)
    .map(b => ({ hrCoilId: b.babyCoilId, thickness: b.thickness, actualWeight: b.weight, dateOfInward: b.dateOfConversion })),
  [babyCoils])

  // Weight already consumed from each BABY coil by other productions (exclude the edited one).
  const consumedByCoil = useMemo(() => coilConsumption(productions, editId, 'babyCoilId'), [productions, editId])

  // Live FIFO preview as the operator types (over baby coils). softFill 0.97 = advance to the
  // next coil at 97%, leaving the 97→100% and 100→105% bands for manual top-up / fallback.
  const rawAlloc = useMemo(() => coilFifoAllocate({
    coils: babyAsCoils, consumedByCoil, skuThickness: Number(sku?.thickness || 0), weightPerPiece, pieces, softFill: 0.97,
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

  // ── Editable allocation: FIFO pre-fills; the operator may override (manualAlloc) ──
  const fifoRows = useMemo(() => alloc.allocations.map(a => ({ babyCoilId: a.babyCoilId, pieces: a.pieces })), [alloc])
  const rows = manualAlloc ?? fifoRows

  // Eligible baby coils for this SKU (±5% thickness), labelled with free capacity.
  const babyCoilOptions = useMemo(() => {
    const st = Number(sku?.thickness || 0)
    return (babyCoils || [])
      .filter(b => !b.deleted && Number(b.weight) > 0 && st > 0 && Math.abs(Number(b.thickness) - st) <= 0.05 * st)
      .map(b => {
        const free = Number(b.weight) - (consumedByCoil[b.babyCoilId]?.weight || 0)
        return { value: b.babyCoilId, label: `${b.babyCoilId} · thk ${b.thickness} · free ${fmtT(free)}/${fmtT(b.weight)}T` }
      })
  }, [babyCoils, sku, consumedByCoil])

  // Enrich rows with mother id, weight & per-coil capacity tier (green ≤97 / amber ≤105 / red >105).
  const enriched = useMemo(() => {
    const pcsByCoil = {}
    rows.forEach(r => { if (r.babyCoilId) pcsByCoil[r.babyCoilId] = (pcsByCoil[r.babyCoilId] || 0) + Number(r.pieces || 0) })
    return rows.map(r => {
      const baby = (babyCoils || []).find(b => b.babyCoilId === r.babyCoilId)
      const cap = Number(baby?.weight || 0)
      const used = (consumedByCoil[r.babyCoilId]?.weight || 0) + (pcsByCoil[r.babyCoilId] || 0) * weightPerPiece
      const pct = cap > 0 ? (used / cap) * 100 : 0
      return { babyCoilId: r.babyCoilId, pieces: Number(r.pieces || 0), hrCoilId: baby?.hrCoilId || '',
        weight: Number(r.pieces || 0) * weightPerPiece, pct, tier: pct > 105 ? 'over' : pct > 97 ? 'warn' : 'ok' }
    })
  }, [rows, babyCoils, consumedByCoil, weightPerPiece])

  const allocatedPieces = enriched.reduce((s, r) => s + r.pieces, 0)
  const sourceCoils = enriched.filter(r => r.babyCoilId).length
  const overCapacity = enriched.some(r => r.tier !== 'ok')
  const over105 = enriched.some(r => r.tier === 'over')

  // Row editing — any edit seeds manualAlloc from the current (FIFO or manual) rows.
  const baseRows = () => (manualAlloc ?? fifoRows).map(r => ({ babyCoilId: r.babyCoilId, pieces: r.pieces }))
  const setRow = (i, key, val) => { const next = baseRows(); next[i] = { ...next[i], [key]: key === 'pieces' ? Number(val || 0) : val }; setManualAlloc(next) }
  const addRow = () => setManualAlloc([...baseRows(), { babyCoilId: '', pieces: 0 }])
  const removeRow = (i) => setManualAlloc(baseRows().filter((_, j) => j !== i))
  const resetToFifo = () => setManualAlloc(null)

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
    setManualAlloc((row.coilAllocations || []).length ? row.coilAllocations.map(a => ({ babyCoilId: a.babyCoilId, pieces: Number(a.pieces || 0) })) : null)
    setEditId(row.id); setShowForm(true)
  }
  // Would removing/shrinking this production leave more pieces dispatched than produced for its SKU?
  const dispatchedForSku = useCallback((skuForRow) =>
    (dispatches || []).filter(d => !d.deleted).flatMap(d => d.bundleEntries || [])
      .filter(e => e.skuCode === skuForRow).reduce((s, e) => s + Number(e.pieces || 0), 0),
  [dispatches])
  const wouldStrandDispatches = (skuForRow, remainingProducedForSku) => dispatchedForSku(skuForRow) > remainingProducedForSku
  const softDelete = (row) => {
    const remaining = producedPool(productions.filter(p => p.id !== row.id), [])[row.skuCode]?.producedPieces ?? 0
    if (wouldStrandDispatches(row.skuCode, remaining)) {
      alert(`Cannot delete: dispatches for this SKU already use more pieces than would remain produced. Remove those dispatches first.`)
      return
    }
    if (confirm('Delete this production record? Coil capacity is released.')) setProductions(prev => prev.map(p => p.id === row.id ? { ...p, deleted: true } : p))
  }

  // Block saving an edit that shrinks production below what's already dispatched for the SKU.
  const editStrands = editId
    ? wouldStrandDispatches(form.skuCode, (producedPool(productions.filter(p => p.id !== editId), [])[form.skuCode]?.producedPieces ?? 0) + pieces)
    : false
  const canSave = !!form.skuCode && pieces > 0 && !editStrands

  const columns = [
    { label: 'Date', key: 'dateOfProduction' },
    { label: 'SKU', value: r => skuDesc(r.skuCode) },
    { label: 'Pieces', key: 'tubeCount' },
    { label: 'Total Wt (T)', value: r => fmtT(r.totalWeight) },
    { label: 'Assigned Coils', value: r => (r.coilAllocations || []).map(a => `${a.babyCoilId || a.hrCoilId}×${a.pieces}`).join(', ') || '—' },
    { label: 'Status', render: r => r.status === 'allocated'
      ? <Badge ok={true} text="Allocated" />
      : <Badge ok={false} text={r.status === 'partial' ? 'Partial' : 'Unallocated'} /> },
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 2: Production</h2>
        <Btn onClick={() => { if (showForm) cancelForm(); else openNew() }}>{showForm ? 'Cancel' : '+ Record Production'}</Btn>
      </div>

      {showForm && (
        <Section title={editId ? 'Edit Production' : 'Record Production'}>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <Field label="Date of Production"><Input type="date" value={form.dateOfProduction} onChange={v => f('dateOfProduction', v)} /></Field>
            <Field label="SKU"><Select value={form.skuCode} onChange={v => { f('skuCode', v); setManualAlloc(null) }} options={skuOptions} placeholder="Select SKU..." /></Field>
            <Field label="No. of Pieces"><Input type="number" value={form.tubeCount} onChange={v => f('tubeCount', v)} /></Field>
          </div>
          <div className="my-4 border-t border-slate-200 dark:border-slate-700" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Field label="Wt/Piece (T)" auto><Input value={fmtT(weightPerPiece)} disabled /></Field>
            <Field label="Total Weight (T)" auto><Input value={fmtT(totalWeight)} disabled /></Field>
            <Field label="Allocated (pcs)" auto warn={allocatedPieces !== pieces || overCapacity}><Input value={`${allocatedPieces} / ${pieces}`} disabled /></Field>
            <Field label="# Source Coils" auto><Input value={String(sourceCoils)} disabled /></Field>
          </div>

          {/* Editable baby-coil allocation — FIFO pre-fills; operator can override up to 100% (105% max) */}
          <div className="mt-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Assigned Baby Coils {manualAlloc ? '(manual)' : '(FIFO · advance at 97% · ±5% thickness)'}
              </span>
              <div className="flex gap-2">
                <Btn size="sm" variant="ghost" onClick={addRow} disabled={!sku}>+ Add coil</Btn>
                {manualAlloc && <Btn size="sm" variant="ghost" onClick={resetToFifo}>↻ Reset to FIFO</Btn>}
              </div>
            </div>
            <div className="mt-2 space-y-2">
              {enriched.length === 0 && <span className="text-sm text-slate-400">No baby coil assigned yet.</span>}
              {enriched.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="flex-1"><Select value={r.babyCoilId} onChange={v => setRow(i, 'babyCoilId', v)} options={babyCoilOptions} placeholder="Select baby coil..." /></div>
                  <div className="w-24"><Input type="number" value={r.pieces} onChange={v => setRow(i, 'pieces', v)} /></div>
                  <span className={`whitespace-nowrap px-2 py-1 rounded-md text-xs font-medium border ${r.tier === 'over'
                    ? 'bg-red-50 dark:bg-red-950 border-red-300 dark:border-red-800 text-red-700 dark:text-red-300'
                    : r.tier === 'warn'
                    ? 'bg-amber-50 dark:bg-amber-950 border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-200'
                    : 'bg-green-50 dark:bg-green-950 border-green-300 dark:border-green-800 text-green-800 dark:text-green-200'}`}>
                    {fmtT(r.weight)}T · {r.pct.toFixed(0)}%
                  </span>
                  <Btn size="sm" variant="ghost" onClick={() => removeRow(i)}>✕</Btn>
                </div>
              ))}
            </div>
          </div>

          {/* Status badges (informational — never block save) */}
          <div className="mt-3 space-y-2">
            {pieces > 0 && allocatedPieces === 0 && babyCoilOptions.length === 0 && <Badge ok={false} text="No eligible baby coil within ±5% of this SKU's thickness. Production saved unallocated until a matching baby coil is slit." />}
            {pieces > 0 && allocatedPieces === 0 && babyCoilOptions.length > 0 && <Badge ok={false} text="No baby coil assigned yet — pick a coil above (otherwise the production saves unallocated)." />}
            {allocatedPieces > 0 && allocatedPieces === pieces && !overCapacity && <Badge ok={true} text={`Fully allocated across ${sourceCoils} coil(s).`} />}
            {over105
              ? <Badge ok={false} text="A coil is filled beyond 105% of its capacity — allowed, but review the split." />
              : overCapacity && <Badge ok={true} text="A coil is in the 97–105% band — allowed (manual top-up past the 97% auto-advance)." />}
            {allocatedPieces > 0 && allocatedPieces < pieces && <Badge ok={false} text={`Shortfall: ${pieces - allocatedPieces} piece(s) not yet assigned to a coil. Saved as partial.`} />}
            {allocatedPieces > pieces && <Badge ok={false} text={`Over-assigned: ${allocatedPieces - pieces} more piece(s) allocated than produced — reduce a row.`} />}
            {editStrands && <Badge ok={false} text="Reducing this production would leave more pieces dispatched than produced for this SKU — increase pieces or remove those dispatches first." />}
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
// STAGE 4: DISPATCH — records uploaded from an Excel sheet. Each row → a dispatch
// entry; coil trace is inherited from production FIFO (dispatchCoilTrace), so cost
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
  return {
    dateOfDispatch: toISODate(pick('dateofdispatch', 'dispatchdate', 'date')),
    vehicleNo:      String(pick('vehicleno', 'vehiclenumber', 'truckno', 'lorryno')).trim(),
    invoiceNo:      String(pick('invoiceno', 'invoicenumber', 'invoice')).trim(),
    skuRaw:         String(pick('sku', 'skucode', 'skudescription', 'description', 'item', 'product')).trim(),
    pieces:         num(pick('pieces', 'noofpieces', 'qty', 'quantity', 'nos')),
    weight:         num(pick('weight', 'weightmt', 'quantitymt', 'netweight', 'wt')),
    vehicleWeight:  num(pick('vehicleweight', 'grossweight', 'weighbridge', 'vehiclewt')),
  }
}

function Dispatch({ dispatches, setDispatches, coils, skus, productions }) {
  const [uploadMsg, setUploadMsg] = useState(null)
  const fileRef = useRef(null)
  const skuDesc = useCallback((code) => skus.find(s => s.skuCode === code)?.description || code, [skus])

  // Resolve an Excel SKU cell (code or description) to a known SKU.
  const resolveSku = useCallback((raw) => {
    if (!raw) return null
    const r = String(raw).trim().toLowerCase()
    return skus.find(s => (s.skuCode || '').toLowerCase() === r)
      || skus.find(s => (s.description || '').toLowerCase() === r)
      || skus.find(s => (s.skuCode || '').toLowerCase().includes(r) || (s.description || '').toLowerCase().includes(r))
      || null
  }, [skus])

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
      const parsed = rows.map(mapDispatchRow).filter(r => r.skuRaw && (r.pieces || r.weight))
      if (!parsed.length) { setUploadMsg({ kind: 'err', text: 'No valid rows found (need SKU + Pieces or Weight)' }); return }

      // Build entries with an incremental FIFO coil trace (entries built so far this batch
      // count as already-dispatched, so each line draws the next production pieces).
      const existing = dispatches.filter(d => !d.deleted)
      const builtEntries = []
      const traceCtx = () => [...existing, { id: '__batch__', deleted: false, bundleEntries: builtEntries }]
      const records = {}
      const unknownSkus = new Set()
      for (const r of parsed) {
        const sku = resolveSku(r.skuRaw)
        if (!sku) unknownSkus.add(r.skuRaw)
        const skuCode = sku?.skuCode || r.skuRaw
        const wpt = Number(sku?.weightPerTube || 0)
        let pieces = Number(r.pieces || 0)
        let weight = Number(r.weight || 0)
        if (!pieces && weight && wpt) pieces = Math.round((weight * 1000) / wpt)
        if (!weight && pieces && wpt) weight = (pieces * wpt) / 1000
        const allocs = dispatchCoilTrace(skuCode, pieces, productions, traceCtx())
        const entry = {
          invoiceNo: r.invoiceNo, skuCode, pieces, weight,
          length: sku?.length || 6000, width: '', thickness: sku?.thickness ?? '',
          coilAllocations: allocs, traceHrCoilId: allocs[0]?.hrCoilId || '',
        }
        builtEntries.push(entry)
        const key = `${r.dateOfDispatch}||${r.vehicleNo}`
        if (!records[key]) records[key] = {
          id: uid(), dateOfDispatch: r.dateOfDispatch, vehicleNo: r.vehicleNo,
          vehicleWeight: r.vehicleWeight, invoiceNo: r.invoiceNo,
          bundleEntries: [], selectedBundles: [], theoreticalWeight: 0, variance: 0, deleted: false,
        }
        records[key].bundleEntries.push(entry)
      }
      const newRecords = Object.values(records).map(d => {
        const theo = d.bundleEntries.reduce((s, e) => s + Number(e.weight || 0), 0)
        return { ...d, selectedBundles: d.bundleEntries, theoreticalWeight: theo, variance: d.vehicleWeight ? Number(d.vehicleWeight) - theo : 0 }
      })
      setDispatches(prev => [...prev, ...newRecords])
      const warn = unknownSkus.size ? ` · ${unknownSkus.size} unresolved SKU(s): ${[...unknownSkus].slice(0, 3).join(', ')}${unknownSkus.size > 3 ? '…' : ''}` : ''
      setUploadMsg({ kind: unknownSkus.size ? 'err' : 'ok', text: `Imported ${newRecords.length} dispatch record(s), ${parsed.length} line(s)${warn}` })
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
    const header = ['Date of Dispatch', 'Invoice No.', 'SKU', 'Quantity (MT)', 'Mother Coil', 'Cost Price/MT', 'Conversion Cost/MT', 'Ladder Cost/MT', 'Total Cost of Invoice Qty']
    downloadCSV(`invoice-reconciliation-${today()}.csv`, header, rows.map(r => [
      r.dateOfDispatch, r.invoiceNo, r.sku, fmtT(r.quantityMT), r.motherCoil,
      r.costPricePerMT.toFixed(2), r.conversionPerMT.toFixed(2), r.ladderPerMT.toFixed(2), r.totalCost.toFixed(2),
    ]))
  }

  const invoiceList = (r) => {
    const set = [...new Set((r.bundleEntries || []).map(b => b.invoiceNo).filter(Boolean))]
    return set.length ? set.join(', ') : (r.invoiceNo || '—')
  }
  const columns = [
    { label: 'Date', key: 'dateOfDispatch' },
    { label: 'Invoice No(s).', value: r => invoiceList(r) },
    { label: 'Vehicle No.', key: 'vehicleNo' },
    { label: 'Vehicle Wt (T)', value: r => fmtT(r.vehicleWeight) },
    { label: 'SKUs', value: r => [...new Set((r.bundleEntries || []).map(b => skuDesc(b.skuCode)))].join(', ') },
    { label: 'Pieces', value: r => (r.bundleEntries || []).reduce((s, b) => s + Number(b.pieces || 0), 0) },
    { label: 'Theor. Wt (T)', value: r => fmtT(r.theoreticalWeight) },
    { label: 'Variance (T)', render: r => {
      if (!r.vehicleWeight) return <span className="text-slate-400">—</span>
      const v = Number(r.vehicleWeight) - Number(r.theoreticalWeight)
      const chk = tolerance(Number(r.theoreticalWeight), Number(r.vehicleWeight))
      return <Badge ok={chk.ok} text={`${v >= 0 ? '+' : ''}${fmtT(v)}T`} />
    }},
  ]

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Stage 4: Dispatch</h2>
        <div className="flex gap-2">
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={onUpload} className="hidden" />
          <Btn onClick={() => fileRef.current?.click()}>Upload Dispatch Excel</Btn>
        </div>
      </div>

      <Section title="Upload dispatches from Excel">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          One row per dispatched line. Recognised columns (case/spacing-insensitive):
          <span className="font-mono text-xs"> Date of Dispatch, Vehicle No, Invoice No, SKU, Pieces, Weight (MT), Vehicle Weight</span>.
          Rows are grouped into one dispatch per (date × vehicle). Coil trace &amp; cost are inherited from Production FIFO.
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
  Produced: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300',
  Dispatch: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300',
}

const PERIOD_DAYS = { '7d': 7, '30d': 30, '90d': 90 }

function Dashboard({ coils, productions, dispatches, skus, purchaseOrders }) {
  const active = (arr) => (arr || []).filter(x => !x.deleted)
  const ac = active(coils), ap = active(productions), ad = active(dispatches), apo = active(purchaseOrders)
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
  const prodInPeriod = ap.filter(p => inRange(p.dateOfProduction))
  const producedPcsPeriod = prodInPeriod.reduce((s, p) => s + Number(p.tubeCount || 0), 0)
  const producedWtPeriod = prodInPeriod.reduce((s, p) => s + Number(p.totalWeight || 0), 0)
  const dispInPeriod = ad.filter(d => inRange(d.dateOfDispatch))
  const dispWtPeriod = dispInPeriod.reduce((s, d) => s + (d.bundleEntries || []).reduce((x, e) => x + Number(e.weight || 0), 0), 0)
  const dispLinesPeriod = dispInPeriod.reduce((s, d) => s + (d.bundleEntries || []).length, 0)
  const productionsAllTime = ap.length

  // Active SKUs in period + top by pieces (produced)
  const skuPcsInPeriod = useMemo(() => {
    const counts = {}
    prodInPeriod.forEach(p => { counts[p.skuCode] = (counts[p.skuCode] || 0) + Number(p.tubeCount || 0) })
    return counts
  }, [prodInPeriod])
  const activeSkuCount = Object.keys(skuPcsInPeriod).length
  const topSkuPeriod = Object.entries(skuPcsInPeriod).sort((a, b) => b[1] - a[1])[0]?.[0]

  // ── Stock in hand (point-in-time) with ₹ value via mother-coil cost rate ──
  const stock = useMemo(() => {
    const rateOf = {}
    ac.forEach(c => { rateOf[c.hrCoilId] = Number(c.actualWeight) > 0 ? Number(c.costPrice || 0) / Number(c.actualWeight) : 0 })

    // Raw coil stock = coil weight not yet consumed by Production (the new consumption point).
    const consumed = coilConsumption(ap)
    let rawWt = 0, rawVal = 0
    ac.forEach(c => {
      const used = Number(consumed[c.hrCoilId]?.weight || 0)
      const rem = Math.max(0, Number(c.actualWeight || 0) - used)
      rawWt += rem; rawVal += rem * (rateOf[c.hrCoilId] || 0)
    })

    // Ready to dispatch = produced − dispatched, attributed per mother coil.
    const dispByCoil = {}
    ad.flatMap(d => d.bundleEntries || []).forEach(be => {
      const allocs = (be.coilAllocations && be.coilAllocations.length) ? be.coilAllocations
        : (be.traceHrCoilId ? [{ hrCoilId: be.traceHrCoilId, weight: be.weight, pieces: be.pieces }] : [])
      allocs.forEach(a => {
        const cur = dispByCoil[a.hrCoilId] || { weight: 0, pieces: 0 }
        cur.weight += Number(a.weight || 0); cur.pieces += Number(a.pieces || 0)
        dispByCoil[a.hrCoilId] = cur
      })
    })
    let readyWt = 0, readyPcs = 0, readyVal = 0
    ac.forEach(c => {
      const prod = consumed[c.hrCoilId] || { weight: 0, pieces: 0 }
      const disp = dispByCoil[c.hrCoilId] || { weight: 0, pieces: 0 }
      const remWt = Math.max(0, Number(prod.weight) - Number(disp.weight))
      readyWt += remWt
      readyPcs += Math.max(0, Number(prod.pieces) - Number(disp.pieces))
      readyVal += remWt * (rateOf[c.hrCoilId] || 0)
    })

    return {
      rawWt, rawVal,
      readyWt, readyPcs, readyVal,
      totalVal: rawVal + readyVal,
    }
  }, [ac, ap, ad])

  // ── PO summary ──
  const poStats = useMemo(() => {
    const in7 = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]
    const open = apo.filter(p => !p.poEndDate || p.poEndDate >= todayStr)
    const expiring = open.filter(p => p.poEndDate && p.poEndDate <= in7)
    return { open: open.length, expiring: expiring.length }
  }, [apo, todayStr])

  // Coil stage breakdown (furthest stage each coil has reached)
  const coilStages = useMemo(() => {
    const idsOf = (rec, fallback) => (rec.coilAllocations && rec.coilAllocations.length)
      ? rec.coilAllocations.map(a => a.hrCoilId) : (fallback ? [fallback] : [])
    const producedIds = new Set(ap.flatMap(p => (p.coilAllocations || []).map(a => a.hrCoilId)).filter(Boolean))
    const dispatchedIds = new Set(ad.flatMap(d => (d.bundleEntries || []).flatMap(be => idsOf(be, be.traceHrCoilId))).filter(Boolean))

    return [
      { name: 'In Stock', value: ac.filter(c => !producedIds.has(c.hrCoilId)).length },
      { name: 'Produced', value: ac.filter(c => producedIds.has(c.hrCoilId) && !dispatchedIds.has(c.hrCoilId)).length },
      { name: 'Dispatched', value: ac.filter(c => dispatchedIds.has(c.hrCoilId)).length },
    ]
  }, [ac, ap, ad])

  // ── Production vs dispatch trend (daily ≤31 days, else weekly) ──
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
        produced: +buckets[k].produced.toFixed(3),
        dispatched: +buckets[k].dispatched.toFixed(3),
      })),
    }
  }, [ap, ad, range, todayStr, inRange])

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
    ap.forEach(p => { counts[p.skuCode] = (counts[p.skuCode] || 0) + Number(p.tubeCount || 0) })
    return Object.entries(counts).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value).slice(0, 5)
  }, [ap])

  // ── SKU-wise summary (produced/dispatched follow the period; WIP/ready are current) ──
  const skuSummary = useMemo(() => {
    const map = {}
    const get = (code) => (map[code] = map[code] || {
      skuCode: code, producedPcs: 0, producedWt: 0, readyPcs: 0, readyWt: 0, dispPcs: 0, dispWt: 0,
      _allProdPcs: 0, _allProdWt: 0, _allDispPcs: 0, _allDispWt: 0,
    })
    ap.forEach(p => {
      const r = get(p.skuCode)
      r._allProdPcs += Number(p.tubeCount || 0); r._allProdWt += Number(p.totalWeight || 0)
      if (inRange(p.dateOfProduction)) { r.producedPcs += Number(p.tubeCount || 0); r.producedWt += Number(p.totalWeight || 0) }
    })
    ad.forEach(d => (d.bundleEntries || []).forEach(e => {
      const r = get(e.skuCode)
      r._allDispPcs += Number(e.pieces || 0); r._allDispWt += Number(e.weight || 0)
      if (inRange(d.dateOfDispatch)) { r.dispPcs += Number(e.pieces || 0); r.dispWt += Number(e.weight || 0) }
    }))
    return Object.values(map).filter(r => r.skuCode).map(r => {
      const sku = skus.find(s => s.skuCode === r.skuCode)
      return {
        ...r, id: r.skuCode,
        readyPcs: Math.max(0, r._allProdPcs - r._allDispPcs),
        readyWt: Math.max(0, r._allProdWt - r._allDispWt),
        description: sku?.description || r.skuCode,
        type: sku?.productType || '—',
      }
    })
  }, [ap, ad, skus, inRange])

  const skuColumns = [
    { label: 'SKU Code', key: 'skuCode' },
    { label: 'Description', key: 'description' },
    { label: 'Type', key: 'type' },
    { label: 'Produced (pcs)', key: 'producedPcs' },
    { label: 'Produced (T)', value: r => fmtT(r.producedWt) },
    { label: 'Ready (pcs)', key: 'readyPcs' },
    { label: 'Ready (T)', value: r => fmtT(r.readyWt) },
    { label: 'Dispatched (pcs)', key: 'dispPcs' },
    { label: 'Dispatched (T)', value: r => fmtT(r.dispWt) },
  ]

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
  }, [ac, ap, ad, apo, todayStr, skuDesc])

  // ── Recent activity across all stages ──
  const recentActivity = useMemo(() => {
    const ev = []
    ac.forEach(c => ev.push({ date: c.dateOfInward, stage: 'Inward', msg: `Coil ${c.hrCoilId} received — ${fmtT(c.actualWeight)}T${c.coilGrade ? `, ${c.coilGrade}` : ''}` }))
    ap.forEach(p => ev.push({ date: p.dateOfProduction, stage: 'Produced', msg: `${p.tubeCount} pcs of ${skuDesc(p.skuCode)} produced (${(p.coilAllocations || []).map(a => a.babyCoilId || a.hrCoilId).join(', ') || 'no coil'})` }))
    ad.forEach(d => ev.push({ date: d.dateOfDispatch, stage: 'Dispatch', msg: `Invoice ${d.invoiceNo || '—'} — ${(d.bundleEntries || []).length} line(s), ${fmtT(d.theoreticalWeight)}T, vehicle ${d.vehicleNo || '—'}` }))
    return ev.filter(e => e.date).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 10)
  }, [ac, ap, ad, skuDesc])

  const totalInvoiceWt = ac.reduce((s, c) => s + Number(c.invoiceWeight || 0), 0)
  const totalActualWt = ac.reduce((s, c) => s + Number(c.actualWeight || 0), 0)

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
      ['SKU Code', 'Description', 'Type', 'Produced (pcs)', 'Produced (T)', 'Ready (pcs)', 'Ready (T)', 'Dispatched (pcs)', 'Dispatched (T)'],
      skuSummary.map(r => [r.skuCode, r.description, r.type, r.producedPcs, fmtT(r.producedWt), r.readyPcs, fmtT(r.readyWt), r.dispPcs, fmtT(r.dispWt)]))
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
          <Card title="Pieces Produced" value={producedPcsPeriod} sub={`${fmtT(producedWtPeriod)}T`} color="cyan" />
          <Card title="Dispatched" value={`${fmtT(dispWtPeriod)}T`} sub={`${dispInPeriod.length} dispatch(es) · ${dispLinesPeriod} line(s)`} color="emerald" />
          <Card title="Avg. Yield (All Time)" value={fmtPct(avgYield)} sub={`${yieldData.length} coils with dispatches`} color="amber" />
        </div>
      </div>

      {/* Stock in Hand KPIs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Stock in Hand — Current</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card title="Raw Coil Stock" value={`${fmtT(stock.rawWt)}T`} sub={`${fmtINR(stock.rawVal)} · unproduced coil weight`} />
          <Card title="Ready to Dispatch" value={`${fmtT(stock.readyWt)}T`} sub={`${stock.readyPcs} pcs · ${fmtINR(stock.readyVal)} · produced − dispatched`} color="amber" />
        </div>
      </div>

      {/* Commercial KPIs */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Commercial</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card title="Total Stock Value" value={fmtINR(stock.totalVal)} sub="Raw + Ready" />
          <Card title="Open POs" value={poStats.open} sub={`${poStats.expiring} ending ≤7 days`} color="cyan" />
          <Card title="Production Batches" value={productionsAllTime} sub="All-time production records" color="emerald" />
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
            <p className="mb-3 text-xs text-slate-400">Produced & Dispatched columns follow the selected period; Ready is current stock (produced − dispatched).</p>
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
  { key: 'slitting', label: '2. Slitting' },
  { key: 'production', label: '3. Production' },
  { key: 'dispatch', label: '4. Dispatch' },
  { key: 'skuMaster', label: 'SKU Master' },
  { key: 'poMaster', label: 'PO Master' },
]

const TABLE_LABELS = {
  coils: 'Coil Inward',
  baby_coils: 'Slitting',
  productions: 'Production',
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
  const [productions, setProductions, productionsLoading] = useSupabaseStore('jsw:productions', [])
  const [dispatches, setDispatches, dispatchesLoading] = useSupabaseStore('jsw:dispatches', [])
  const [skus, setSkus, skusLoading] = useSupabaseStore('jsw:skus', DEFAULT_SKUS)
  const [purchaseOrders, setPurchaseOrders, poLoading] = useSupabaseStore('jsw:purchaseOrders', [])

  const loading = coilsLoading || babyCoilsLoading || productionsLoading || dispatchesLoading || skusLoading || poLoading

  // Dark mode
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    LS.set('jsw:dark', dark)
  }, [dark])

  const resetData = () => {
    if (confirm('Reset ALL data? This will clear all coil, baby coil, production & dispatch records. SKU Master will be preserved. This cannot be undone.')) {
      setCoils([])
      setBabyCoils([])
      setProductions([])
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
        {tab === 'dashboard' && <Dashboard coils={coils} productions={productions} dispatches={dispatches} skus={skus} purchaseOrders={purchaseOrders} />}
        {tab === 'coilTracker' && <CoilTracker coils={coils} productions={productions} dispatches={dispatches} />}
        {tab === 'coilInward' && <CoilInward coils={coils} setCoils={setCoils} dispatches={dispatches} productions={productions} babyCoils={babyCoils} />}
        {tab === 'slitting' && <Slitting coils={coils} babyCoils={babyCoils} setBabyCoils={setBabyCoils} productions={productions} />}
        {tab === 'production' && <Production coils={coils} babyCoils={babyCoils} productions={productions} setProductions={setProductions} dispatches={dispatches} skus={skus} />}
        {tab === 'dispatch' && <Dispatch dispatches={dispatches} setDispatches={setDispatches} coils={coils} skus={skus} productions={productions} />}
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

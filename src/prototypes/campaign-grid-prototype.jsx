// ─────────────────────────────────────────────────────────────────────────────
// PROTOTYPE — THROWAWAY. Not production code. No tests, no persistence, no
// error handling beyond what makes it run.
//
// Question: what should the Campaign planner look like as a family × gauge grid?
//
// Three variants of the Campaign plan grid, switchable via `?variant=`, mounted
// inside the existing Campaign tab (sub-shape A).
//
// Seeded with the REAL Jul 2026 production shape pulled from Supabase:
// 17 families × 7 gauges, 51 of 119 cells populated (~43% fill). The 51 real pairs are
// "resolvable"; every other cell is typeable but marks itself UNRESOLVED, which
// is what the Commit gate tests. That gate is the thing this prototype exists to
// let you judge — see issue #97.
//
// Run:  npm run dev   →   http://localhost:3000  →  Campaign tab  →  ?variant=A
// ─────────────────────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useCallback } from 'react'

const MILL_RATE_TPH = 4.32
const BUDGET_H = 324                    // Jul 2026: 27 working days × 12 h
const FAMILY_FLOOR_MT = 20
const GAUGE_FLOOR_MT = 3

const mtToHours = (mt) => (Number(mt) || 0) / MILL_RATE_TPH
const fmt = (n) => (Number(n) || 0).toFixed(1)

// ── Real Jul 2026 production, family → { gauge: mt }. These are the pairs the
// SKU master can resolve; anything else typed into the grid is unresolvable. ──
const SEED = [
  ['CHS 21.3',   { 1.6: 15.72, 2: 20.47 }],
  ['CHS 26.9',   { 1.6: 26.69, 2: 38.28, 2.5: 3.90 }],
  ['CHS 33.7',   { 1.6: 23.54, 2: 26.97, 2.5: 25.36, 2.8: 18.92, 4: 4.58 }],
  ['CHS 42.4',   { 1.6: 22.32, 2: 32.25, 2.5: 38.43, 2.8: 2.08 }],
  ['CHS 48.3',   { 1.6: 36.33, 2: 27.24 }],
  ['CHS 60.3',   { 1.6: 32.37, 2: 13.75, 2.5: 9.15, 2.8: 11.34 }],
  ['CHS 88.9',   { 1.6: 18.45, 2: 30.45, 2.5: 49.60, 2.8: 37.74, 4: 17.30 }],
  ['RHS 100x50', { 1.6: 45.16, 2: 79.63, 2.5: 50.91, 2.8: 42.24, 4: 18.46 }],
  ['RHS 40x20',  { 1.6: 24.96, 2: 33.04 }],
  ['RHS 50x25',  { 1.6: 29.49 }],
  ['RHS 60x40',  { 1.6: 23.84, 2.5: 35.44 }],
  ['SHS (size unparsed)', { 3: 60.51 }],   // real row — the SKU master has no size on it
  ['SHS 20x20',  { 1.6: 30.53, 2: 27.64 }],
  ['SHS 25x25',  { 1.6: 39.68, 2: 4.54, 2.5: 18.80, 2.8: 19.71, 3.2: 3.06 }],
  ['SHS 30x30',  { 1.6: 31.57, 2: 30.21, 2.5: 20.87 }],
  ['SHS 38x38',  { 2: 27.13, 2.5: 26.74 }],
  ['SHS 50x50',  { 1.6: 35.31, 2: 25.34, 2.8: 32.22 }],
]

const GAUGES = [1.6, 2, 2.5, 2.8, 3, 3.2, 4]
const FAMILIES = SEED.map(([f]) => f)
const key = (f, g) => `${f}|${g}`
const RESOLVABLE = new Set(SEED.flatMap(([f, gs]) => Object.keys(gs).map(g => key(f, Number(g)))))
const SUGGESTED = new Map(SEED.flatMap(([f, gs]) => Object.entries(gs).map(([g, mt]) => [key(f, Number(g)), mt])))

// ── Shared model. Local state only — nothing is written to Supabase. ──
function usePlan() {
  const [typed, setTyped] = useState(() => new Map())   // "family|gauge" → number | null
  const [famTyped, setFamTyped] = useState(() => new Map())

  const cellMt = useCallback((f, g) => {
    const t = typed.get(key(f, g))
    if (t != null) return t
    return SUGGESTED.get(key(f, g)) ?? null
  }, [typed])

  const rows = useMemo(() => FAMILIES.map(f => {
    const cells = GAUGES.map(g => {
      const mt = cellMt(f, g)
      const isTyped = typed.has(key(f, g)) && typed.get(key(f, g)) != null
      return {
        gauge: g, mt, isTyped,
        resolvable: RESOLVABLE.has(key(f, g)),
        unresolved: isTyped && !RESOLVABLE.has(key(f, g)),
        belowFloor: mt != null && mt > 0 && mt < GAUGE_FLOOR_MT,
      }
    })
    const gaugeSum = cells.reduce((t, c) => t + (c.mt || 0), 0)
    const famIsTyped = famTyped.has(f)
    const famTarget = famTyped.get(f) ?? gaugeSum
    const delta = gaugeSum - famTarget
    return {
      family: f, cells, gaugeSum, famTarget, delta, famIsTyped,
      reconciled: Math.abs(delta) < 0.05,
      hours: mtToHours(famTarget),
      belowFloor: famTarget > 0 && famTarget < FAMILY_FLOOR_MT,
    }
  }), [cellMt, typed, famTyped])

  const totals = useMemo(() => {
    const mt = rows.reduce((t, r) => t + r.famTarget, 0)
    const hours = mtToHours(mt)
    const unresolved = rows.flatMap(r => r.cells.filter(c => c.unresolved))
    const unreconciled = rows.filter(r => !r.reconciled)
    return {
      mt, hours, overH: hours - BUDGET_H,
      overMt: (hours - BUDGET_H) * MILL_RATE_TPH,
      unresolved, unreconciled,
      canCommit: unresolved.length === 0 && unreconciled.length === 0,
    }
  }, [rows])

  const setCell = (f, g, v) => setTyped(prev => new Map(prev).set(key(f, g), v))
  const setFam = (f, v) => setFamTyped(prev => {
    const n = new Map(prev)
    if (v == null) n.delete(f); else n.set(f, v)
    return n
  })
  const reset = () => { setTyped(new Map()); setFamTyped(new Map()) }

  return { rows, totals, setCell, setFam, reset, gauges: GAUGES }
}

// ── A bare number input. Deliberately dumber than the real TargetCell. ──
function Cell({ value, suggested, onCommit, tone = '' }) {
  const [draft, setDraft] = useState('')
  const [focused, setFocused] = useState(false)
  useEffect(() => { if (!focused) setDraft(value == null ? '' : String(value)) }, [value, focused])
  return (
    <input
      type="number" min="0" step="0.01" inputMode="decimal" value={draft}
      placeholder={suggested == null ? '—' : fmt(suggested)}
      onFocus={() => setFocused(true)}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); const t = draft.trim(); onCommit(t === '' ? null : Number(t)) }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className={`w-full px-1.5 py-1 text-xs text-right rounded border outline-none focus:ring-1 focus:ring-indigo-500 bg-transparent ${tone}`}
    />
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT A — Cross-tab matrix. Families down, gauges across, every cell typeable.
// Primary affordance: the cell. You see the whole month's split at once.
// ═════════════════════════════════════════════════════════════════════════════
export const VariantA = { name: 'Cross-tab matrix', render: MatrixVariant }

function MatrixVariant({ plan }) {
  const { rows, gauges, setCell, setFam } = plan
  const colTotals = gauges.map(g => rows.reduce((t, r) => t + (r.cells.find(c => c.gauge === g)?.mt || 0), 0))

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-separate border-spacing-0">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white dark:bg-slate-800 text-left px-3 py-2 font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700">Family</th>
            {gauges.map(g => (
              <th key={g} className="px-2 py-2 font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700 w-20">{g} mm</th>
            ))}
            <th className="px-3 py-2 font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700">Σ gauges</th>
            <th className="px-3 py-2 font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700">Family target</th>
            <th className="px-3 py-2 font-medium text-slate-500 border-b border-slate-200 dark:border-slate-700">Hours</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(r => (
            <tr key={r.family} className={r.reconciled ? '' : 'bg-amber-50/50 dark:bg-amber-900/10'}>
              <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 px-3 py-1 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap border-b border-slate-100 dark:border-slate-700/50">
                {r.family}
                {r.belowFloor && <span className="ml-1.5 text-[10px] px-1 rounded bg-amber-100 text-amber-800">under {FAMILY_FLOOR_MT}</span>}
              </td>
              {r.cells.map(c => (
                <td key={c.gauge} className={`px-1 py-1 border-b border-slate-100 dark:border-slate-700/50 ${
                  c.unresolved ? 'bg-red-50 dark:bg-red-900/20'
                  : !c.resolvable ? 'bg-slate-50/60 dark:bg-slate-900/30' : ''}`}>
                  <Cell value={c.isTyped ? c.mt : null} suggested={c.resolvable ? c.mt : null}
                    onCommit={v => setCell(r.family, c.gauge, v)}
                    tone={c.unresolved ? 'border-red-400 text-red-700 dark:text-red-300'
                      : c.isTyped ? 'border-blue-300 text-blue-700 dark:text-blue-300'
                      : 'border-transparent text-green-700 dark:text-green-400'} />
                  {c.belowFloor && <div className="text-[9px] text-amber-600 text-right pr-1">&lt;{GAUGE_FLOOR_MT}</div>}
                </td>
              ))}
              <td className={`px-3 py-1 text-right tabular-nums border-b border-slate-100 dark:border-slate-700/50 ${r.reconciled ? 'text-slate-500' : 'text-amber-700 font-medium'}`}>
                {fmt(r.gaugeSum)}
              </td>
              <td className="px-2 py-1 border-b border-slate-100 dark:border-slate-700/50 w-24">
                <Cell value={r.famIsTyped ? r.famTarget : null} suggested={r.gaugeSum} onCommit={v => setFam(r.family, v)}
                  tone="border-slate-300 dark:border-slate-600" />
                {!r.reconciled && <div className="text-[9px] text-amber-600 text-right pr-1">{r.delta > 0 ? '+' : ''}{fmt(r.delta)}</div>}
              </td>
              <td className="px-3 py-1 text-right tabular-nums text-slate-500 border-b border-slate-100 dark:border-slate-700/50">{fmt(r.hours)}</td>
            </tr>
          ))}
          <tr className="font-medium">
            <td className="sticky left-0 bg-white dark:bg-slate-800 px-3 py-2 text-slate-700 dark:text-slate-200">Gauge total</td>
            {colTotals.map((t, i) => (
              <td key={i} className="px-2 py-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{fmt(t)}</td>
            ))}
            <td colSpan={3} />
          </tr>
        </tbody>
      </table>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT B — Hour-budget allocation. No table. Each family is a horizontal bar
// segmented by gauge, sized in HOURS against the 324 h budget ruler.
// Primary affordance: the budget, not the cell.
// ═════════════════════════════════════════════════════════════════════════════
export const VariantB = { name: 'Hour-budget bars', render: BudgetVariant }

const SEG = ['bg-indigo-400', 'bg-cyan-400', 'bg-emerald-400', 'bg-amber-400', 'bg-rose-400', 'bg-violet-400', 'bg-slate-400']

function BudgetVariant({ plan }) {
  const { rows, gauges, totals, setCell } = plan
  const [open, setOpen] = useState(null)
  const maxH = Math.max(BUDGET_H, totals.hours)          // budget ruler scale
  // Family bars scale to the BIGGEST family, not the budget — against a 324 h ruler every family
  // is a stub and you cannot compare them, which is the whole point of the bars.
  const maxFam = Math.max(1, ...rows.map(r => r.hours))

  return (
    <div className="space-y-4">
      {/* The budget consumed family by family — every family is a slice of the same 324 h. */}
      <div>
        <div className="relative h-9 rounded-md bg-slate-100 dark:bg-slate-900/50 overflow-hidden flex">
          {rows.map((r, i) => (
            <span key={r.family} title={`${r.family} — ${fmt(r.hours)} h`}
              className={`${SEG[i % SEG.length]} ${open === r.family ? 'ring-2 ring-inset ring-slate-900' : ''} border-r border-white/40`}
              style={{ width: `${(r.hours / maxH) * 100}%` }} />
          ))}
          <div className="absolute inset-y-0 border-l-2 border-slate-900 dark:border-slate-100"
            style={{ left: `${(BUDGET_H / maxH) * 100}%` }} />
        </div>
        <div className="mt-1 flex justify-between text-xs">
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {fmt(totals.hours)} h planned across {rows.length} families
          </span>
          <span className={totals.overH > 0 ? 'text-amber-700 dark:text-amber-400 font-medium' : 'text-emerald-700 dark:text-emerald-400'}>
            {totals.overH > 0
              ? `${fmt(totals.hours)} / ${BUDGET_H}, over by ${fmt(totals.overH)} h ≈ ${fmt(totals.overMt)} t`
              : `${fmt(totals.hours)} / ${BUDGET_H} h, ${fmt(-totals.overH)} h spare`}
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
        {gauges.map((g, i) => (
          <span key={g} className="flex items-center gap-1"><span className={`w-2.5 h-2.5 rounded-sm ${SEG[i]}`} />{g} mm</span>
        ))}
      </div>

      <div className="space-y-1.5">
        {rows.map(r => (
          <div key={r.family}>
            <button onClick={() => setOpen(open === r.family ? null : r.family)} className="w-full flex items-center gap-3 group text-left">
              <span className="w-36 shrink-0 text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{r.family}</span>
              <span className="flex-1 h-6 flex rounded overflow-hidden bg-slate-100 dark:bg-slate-900/50">
                {r.cells.map((c, i) => c.mt ? (
                  <span key={c.gauge} title={`${c.gauge} mm — ${fmt(c.mt)} T`}
                    className={`${SEG[i]} ${c.unresolved ? 'ring-2 ring-inset ring-red-600' : ''}`}
                    style={{ width: `${(mtToHours(c.mt) / maxFam) * 100}%` }} />
                ) : null)}
              </span>
              <span className="w-14 shrink-0 text-xs text-right tabular-nums text-slate-500">{fmt(r.hours)} h</span>
              <span className={`w-4 shrink-0 text-xs ${r.reconciled ? 'text-emerald-600' : 'text-amber-600'}`}>{r.reconciled ? '✔' : '▲'}</span>
            </button>
            {open === r.family && (
              <div className="ml-36 mt-1 mb-2 p-2 rounded bg-slate-50 dark:bg-slate-900/40 grid grid-cols-7 gap-2">
                {r.cells.map(c => (
                  <div key={c.gauge}>
                    <div className="text-[10px] text-slate-500 mb-0.5">{c.gauge} mm</div>
                    <Cell value={c.isTyped ? c.mt : null} suggested={c.resolvable ? c.mt : null}
                      onCommit={v => setCell(r.family, c.gauge, v)}
                      tone={c.unresolved ? 'border-red-400 text-red-700' : 'border-slate-300 dark:border-slate-600'} />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// VARIANT C — Master / detail. Left rail lists families with status; right pane
// gives the selected family's gauges full-size inputs. No cross-tab at all.
// Primary affordance: one family at a time, but nothing hidden behind an expander.
// ═════════════════════════════════════════════════════════════════════════════
export const VariantC = { name: 'Master / detail', render: DetailVariant }

function DetailVariant({ plan }) {
  const { rows, setCell, setFam } = plan
  const [sel, setSel] = useState(FAMILIES[0])
  const row = rows.find(r => r.family === sel) || rows[0]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4">
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-700/50 max-h-[28rem] overflow-y-auto">
        {rows.map(r => (
          <button key={r.family} onClick={() => setSel(r.family)}
            className={`w-full flex items-center justify-between px-3 py-2 text-left text-xs ${
              r.family === sel ? 'bg-indigo-50 dark:bg-indigo-900/20' : 'hover:bg-slate-50 dark:hover:bg-slate-900/30'}`}>
            <span className="font-medium text-slate-700 dark:text-slate-200 truncate">{r.family}</span>
            <span className="flex items-center gap-2 shrink-0">
              <span className="tabular-nums text-slate-500">{fmt(r.famTarget)}</span>
              <span className={r.reconciled ? 'text-emerald-500' : 'text-amber-500'}>{r.reconciled ? '●' : '▲'}</span>
            </span>
          </button>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3 mb-4">
          <h4 className="text-base font-semibold text-slate-800 dark:text-slate-100">{row.family}</h4>
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">Family target</span>
            <span className="w-24"><Cell value={row.famIsTyped ? row.famTarget : null} suggested={row.gaugeSum} onCommit={v => setFam(row.family, v)} tone="border-slate-300 dark:border-slate-600" /></span>
            <span className="text-slate-500">T · {fmt(row.hours)} h</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {row.cells.map(c => (
            <div key={c.gauge} className={`rounded-md border p-3 ${
              c.unresolved ? 'border-red-300 bg-red-50 dark:bg-red-900/20'
              : c.resolvable ? 'border-slate-200 dark:border-slate-700'
              : 'border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30'}`}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{c.gauge} mm</span>
                {!c.resolvable && <span className="text-[9px] text-slate-400">no SKU</span>}
              </div>
              <Cell value={c.isTyped ? c.mt : null} suggested={c.resolvable ? c.mt : null}
                onCommit={v => setCell(row.family, c.gauge, v)}
                tone={c.unresolved ? 'border-red-400 text-red-700' : 'border-slate-300 dark:border-slate-600'} />
              <div className="mt-1 text-[10px] text-slate-400">{c.mt ? `${fmt(mtToHours(c.mt))} h` : '—'}</div>
            </div>
          ))}
        </div>

        <div className={`mt-4 text-xs ${row.reconciled ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'}`}>
          {row.reconciled
            ? `✔ gauge split adds to ${fmt(row.gaugeSum)} T`
            : `▲ gauges add to ${fmt(row.gaugeSum)} T against a family target of ${fmt(row.famTarget)} T — off by ${fmt(Math.abs(row.delta))} T`}
        </div>
      </div>
    </div>
  )
}

// ═════════════════════════════════════════════════════════════════════════════
// Switcher + state readout
// ═════════════════════════════════════════════════════════════════════════════
const VARIANTS = { A: VariantA, B: VariantB, C: VariantC }
const KEYS = ['A', 'B', 'C']

export function readVariant() {
  if (typeof window === 'undefined') return null
  const v = new URLSearchParams(window.location.search).get('variant')
  return v && VARIANTS[v.toUpperCase()] ? v.toUpperCase() : null
}

function PrototypeSwitcher({ current, onChange, totals }) {
  useEffect(() => {
    const h = (e) => {
      const t = e.target
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === 'ArrowLeft') onChange(KEYS[(KEYS.indexOf(current) - 1 + KEYS.length) % KEYS.length])
      if (e.key === 'ArrowRight') onChange(KEYS[(KEYS.indexOf(current) + 1) % KEYS.length])
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [current, onChange])

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-stretch rounded-full bg-slate-900 text-white shadow-2xl ring-1 ring-white/20 text-xs overflow-hidden">
      <button onClick={() => onChange(KEYS[(KEYS.indexOf(current) - 1 + KEYS.length) % KEYS.length])}
        className="px-3 hover:bg-white/10" aria-label="Previous variant">←</button>
      <span className="px-4 py-2 font-medium border-x border-white/20 whitespace-nowrap">
        {current} — {VARIANTS[current].name}
      </span>
      <span className="px-4 py-2 flex items-center gap-3 whitespace-nowrap text-slate-300">
        <span>{fmt(totals.mt)} T · {fmt(totals.hours)} h / {BUDGET_H} h</span>
        <span className={totals.unreconciled.length ? 'text-amber-400' : 'text-emerald-400'}>
          {totals.unreconciled.length} unreconciled
        </span>
        <span className={totals.unresolved.length ? 'text-red-400' : 'text-emerald-400'}>
          {totals.unresolved.length} unresolved
        </span>
        <span className={totals.canCommit ? 'text-emerald-400' : 'text-slate-500'}>
          Commit {totals.canCommit ? 'enabled' : 'BLOCKED'}
        </span>
      </span>
      <button onClick={() => onChange(KEYS[(KEYS.indexOf(current) + 1) % KEYS.length])}
        className="px-3 hover:bg-white/10" aria-label="Next variant">→</button>
    </div>
  )
}

export default function CampaignGridPrototype({ variant, onVariant }) {
  const plan = usePlan()
  const V = VARIANTS[variant] || VariantA

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-dashed border-amber-400 bg-amber-50 dark:bg-amber-900/20 px-4 py-3 text-xs text-amber-900 dark:text-amber-200">
        <strong>PROTOTYPE — throwaway.</strong> Seeded with real Jul 2026 production
        (17 families × 7 gauges, 51 of 119 cells populated). Nothing here is saved to Supabase.
        Grey / dashed cells are family+gauge pairs the SKU master cannot resolve — type in one and
        it turns red and blocks Commit, which is the gate under discussion in issue #97.
        <button onClick={plan.reset} className="ml-2 underline">reset</button>
      </div>

      <V.render plan={plan} />

      {plan.totals.unresolved.length > 0 && (
        <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-900 px-4 py-3 text-xs text-red-800 dark:text-red-300">
          ▲ Commit blocked — {plan.totals.unresolved.length} typed cell(s) resolve to no SKU:{' '}
          {plan.totals.unresolved.slice(0, 4).map(c => `${c.gauge} mm`).join(', ')}
          {plan.totals.unresolved.length > 4 ? '…' : ''}. On Track these would read 0 achieved all
          month and their production would land in the unplanned block.
        </div>
      )}

      <PrototypeSwitcher current={variant} onChange={onVariant} totals={plan.totals} />
    </div>
  )
}

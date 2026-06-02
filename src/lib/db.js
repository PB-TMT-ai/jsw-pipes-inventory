import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase, supabaseConfigured } from './supabase'

// ═══════════════════════════════════════════════════════════════
// CONNECTION & SYNC STATUS — broadcast so the UI can show health
// ═══════════════════════════════════════════════════════════════
// Module-level counter of in-flight write batches. Read synchronously by the
// beforeunload guard so we can warn before unsaved writes are lost.
let pendingWrites = 0

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', (e) => {
    if (pendingWrites > 0) {
      e.preventDefault()
      e.returnValue = '' // Chrome requires returnValue to be set to prompt
      return ''
    }
  })
}

function emitStatus(detail) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('jsw:syncStatus', { detail }))
}

// Retry only transient (network) failures. PostgREST/Postgres errors carry a
// code (missing column '42703', unique violation '23505', etc.) and won't fix
// themselves — those return immediately so the caller can surface them.
function isTransient(error) {
  if (!error) return false
  if (error.code) return false
  const msg = (error.message || '').toLowerCase()
  return msg.includes('fetch') || msg.includes('network') ||
         msg.includes('timeout') || msg.includes('connection')
}

async function withRetry(fn, attempts = 4) {
  let delay = 500
  let last
  for (let i = 0; i < attempts; i++) {
    try {
      last = await fn()
    } catch (err) {
      last = { error: err }
    }
    if (!last.error) return last
    if (i === attempts - 1 || !isTransient(last.error)) return last
    await new Promise(r => setTimeout(r, delay))
    delay *= 2
  }
  return last
}

// ═══════════════════════════════════════════════════════════════
// CASE CONVERSION — camelCase (JS) ↔ snake_case (Postgres)
// ═══════════════════════════════════════════════════════════════
function toSnake(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    // Empty strings are rejected by Postgres on numeric/date columns — send null instead.
    out[snakeKey] = v === '' ? null : v
  }
  return out
}

function toCamel(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    out[camelKey] = v
  }
  return out
}

// ═══════════════════════════════════════════════════════════════
// TABLE NAME MAPPING — localStorage key → Supabase table name
// ═══════════════════════════════════════════════════════════════
const TABLE_MAP = {
  'jsw:coils': 'coils',
  'jsw:babyCoils': 'baby_coils',
  'jsw:tubes': 'tubes',
  'jsw:bundles': 'bundles',
  'jsw:dispatches': 'dispatches',
  'jsw:skus': 'skus',
  'jsw:purchaseOrders': 'purchase_orders',
}

// ═══════════════════════════════════════════════════════════════
// useSupabaseStore — drop-in replacement for useStore
// Returns [data, updateFn, loading]
// ═══════════════════════════════════════════════════════════════
export function useSupabaseStore(localStorageKey, fallback) {
  const tableName = TABLE_MAP[localStorageKey]
  const [data, setData] = useState(fallback)
  const [loading, setLoading] = useState(true)
  const prevIds = useRef(new Set())

  // Fetch on mount
  useEffect(() => {
    let cancelled = false

    async function load() {
      let rows, error
      try {
        const res = await withRetry(() =>
          supabase.from(tableName).select('*').order('created_at', { ascending: true })
        )
        rows = res.data
        error = res.error
      } catch (err) {
        error = err
      }

      if (cancelled) return

      if (error || !rows) {
        const message = !supabaseConfigured
          ? 'Supabase is not configured (missing URL / key)'
          : (error?.message || 'Database unreachable')
        console.error(`[db] Error fetching ${tableName}:`, message)
        emitStatus({ type: 'readError', tableName, message })
        setLoading(false)
        return
      }

      const camelRows = rows.map(toCamel)
      setData(camelRows.length > 0 ? camelRows : fallback)
      prevIds.current = new Set(rows.map(r => r.id))
      emitStatus({ type: 'readOk', tableName, count: rows.length })
      setLoading(false)
    }

    load()
    return () => { cancelled = true }
  }, [tableName]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update function — same signature as old useStore setter
  const update = useCallback((v) => {
    setData(prev => {
      const next = typeof v === 'function' ? v(prev) : v

      // Sync to Supabase in the background
      syncToSupabase(tableName, prev, next, prevIds)

      return next
    })
  }, [tableName])

  return [data, update, loading]
}

// ═══════════════════════════════════════════════════════════════
// SYNC ERROR BROADCAST — UI components can listen for failures
// ═══════════════════════════════════════════════════════════════
function emitSyncError(tableName, op, error, rows) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('jsw:syncError', {
    detail: {
      tableName,
      op,
      message: error?.message || String(error),
      details: error?.details || '',
      hint: error?.hint || '',
      code: error?.code || '',
      sampleRow: Array.isArray(rows) ? rows[0] : rows,
      rowCount: Array.isArray(rows) ? rows.length : 0,
    },
  }))
}

// ═══════════════════════════════════════════════════════════════
// SYNC LOGIC — diffs local state against Supabase
// ═══════════════════════════════════════════════════════════════
async function syncToSupabase(tableName, prev, next, prevIdsRef) {
  const nextIds = new Set(next.map(r => r.id))
  const prevIdSet = prevIdsRef.current

  // Find items to upsert (new or changed)
  const toUpsert = next.filter(item => {
    const oldItem = prev.find(p => p.id === item.id)
    if (!oldItem) return true // new item
    return JSON.stringify(item) !== JSON.stringify(oldItem) // changed
  })

  // Find items to hard-delete (in prev but not in next — for SKU deletes)
  const toDelete = [...prevIdSet].filter(id => !nextIds.has(id))

  // Nothing actually changed — keep tracked IDs current, skip the round-trip.
  if (toUpsert.length === 0 && toDelete.length === 0) {
    prevIdsRef.current = nextIds
    return
  }

  // Mark a write in flight (drives the "Saving…" pill + beforeunload guard).
  pendingWrites++
  emitStatus({ type: 'writeStart', tableName })
  let ok = true

  // Upsert changed/new items
  if (toUpsert.length > 0) {
    const snakeRows = toUpsert.map(toSnake)
    const { error } = await withRetry(() =>
      supabase.from(tableName).upsert(snakeRows, { onConflict: 'id', ignoreDuplicates: false })
    )
    if (error) {
      ok = false
      console.error(`[db] Upsert error on ${tableName}:`, error.message, { sampleRow: snakeRows[0] })
      emitSyncError(tableName, 'upsert', error, snakeRows)
    }
  }

  // Hard-delete removed items
  if (toDelete.length > 0) {
    const { error } = await withRetry(() =>
      supabase.from(tableName).delete().in('id', toDelete)
    )
    if (error) {
      ok = false
      console.error(`[db] Delete error on ${tableName}:`, error.message)
      emitSyncError(tableName, 'delete', error, toDelete)
    }
  }

  pendingWrites = Math.max(0, pendingWrites - 1)
  emitStatus({ type: 'writeDone', tableName, ok })

  // Update tracked IDs
  prevIdsRef.current = nextIds
}

// ═══════════════════════════════════════════════════════════════
// useSyncStatus — aggregate connection + write health for the UI
// Returns { connected, pending, lastSyncAt, readError }
//   connected: null = connecting, true = reachable, false = unreachable
//   pending:   number of in-flight write batches (drives "Saving…")
// ═══════════════════════════════════════════════════════════════
export function useSyncStatus() {
  const [state, setState] = useState({ connected: null, pending: 0, lastSyncAt: null, readError: null })
  const failed = useRef(new Set())

  useEffect(() => {
    const handler = (e) => {
      const d = e.detail || {}
      setState(prev => {
        switch (d.type) {
          case 'readError':
            failed.current.add(d.tableName)
            return { ...prev, connected: false, readError: d.message || 'Database unreachable' }
          case 'readOk': {
            failed.current.delete(d.tableName)
            const clear = failed.current.size === 0
            return { ...prev, connected: clear ? true : prev.connected, readError: clear ? null : prev.readError }
          }
          case 'writeStart':
            return { ...prev, pending: prev.pending + 1 }
          case 'writeDone':
            return {
              ...prev,
              pending: Math.max(0, prev.pending - 1),
              lastSyncAt: d.ok ? Date.now() : prev.lastSyncAt,
              // A successful write proves the DB is reachable again.
              connected: d.ok && failed.current.size === 0 ? true : prev.connected,
            }
          default:
            return prev
        }
      })
    }
    window.addEventListener('jsw:syncStatus', handler)
    return () => window.removeEventListener('jsw:syncStatus', handler)
  }, [])

  return state
}

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

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
      const { data: rows, error } = await supabase
        .from(tableName)
        .select('*')
        .order('created_at', { ascending: true })

      if (cancelled) return

      if (error) {
        console.error(`[db] Error fetching ${tableName}:`, error.message)
        setLoading(false)
        return
      }

      const camelRows = rows.map(toCamel)
      setData(camelRows.length > 0 ? camelRows : fallback)
      prevIds.current = new Set(rows.map(r => r.id))
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

  // Upsert changed/new items
  if (toUpsert.length > 0) {
    const snakeRows = toUpsert.map(toSnake)
    const { error } = await supabase.from(tableName).upsert(snakeRows, { onConflict: 'id', ignoreDuplicates: false })
    if (error) {
      console.error(`[db] Upsert error on ${tableName}:`, error.message, { sampleRow: snakeRows[0] })
      emitSyncError(tableName, 'upsert', error, snakeRows)
    }
  }

  // Hard-delete removed items
  if (toDelete.length > 0) {
    const { error } = await supabase.from(tableName).delete().in('id', toDelete)
    if (error) {
      console.error(`[db] Delete error on ${tableName}:`, error.message)
      emitSyncError(tableName, 'delete', error, toDelete)
    }
  }

  // Update tracked IDs
  prevIdsRef.current = nextIds
}

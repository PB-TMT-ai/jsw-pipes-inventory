import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'

// ═══════════════════════════════════════════════════════════════
// CASE CONVERSION — camelCase (JS) ↔ snake_case (Postgres)
// ═══════════════════════════════════════════════════════════════
export function toSnake(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const snakeKey = k.replace(/[A-Z]/g, m => '_' + m.toLowerCase())
    // Empty strings are rejected by Postgres on numeric/date columns — send null instead.
    out[snakeKey] = v === '' ? null : v
  }
  return out
}

export function toCamel(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj)) {
    const camelKey = k.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
    out[camelKey] = v
  }
  return out
}

// Tables that use hard-delete (no soft-delete). On load, any lingering rows with
// deleted=true are purged from Supabase — cleans up legacy soft-deleted data.
// baby_coils hard-deletes so a freed letter (A, B, C…) can be reused on re-slit.
const HARD_DELETE_TABLES = new Set(['coils', 'baby_coils'])

// ═══════════════════════════════════════════════════════════════
// TABLE NAME MAPPING — localStorage key → Supabase table name
// ═══════════════════════════════════════════════════════════════
const TABLE_MAP = {
  'jsw:coils': 'coils',
  'jsw:babyCoils': 'baby_coils',
  'jsw:productions': 'productions',
  'jsw:bundles': 'bundles',
  'jsw:dispatches': 'dispatches',
  'jsw:skus': 'skus',
  'jsw:orders': 'orders',
}

// ═══════════════════════════════════════════════════════════════
// UPSERT CONFLICT TARGET — the column Postgres arbitrates on
// ═══════════════════════════════════════════════════════════════
// Postgres resolves ON CONFLICT against ONE index. A conflict on any OTHER unique index is a hard
// error, not an update — so a table with a second unique column needs that column as the arbiter.
// `skus.sku_code` is UNIQUE: upserting on `id` meant a row carrying an existing code under a new id
// was rejected ("duplicate key value violates unique constraint skus_sku_code_key"), which failed
// the whole batch. Arbitrating on sku_code makes that case an UPDATE of the existing row instead.
export const CONFLICT_TARGET = { skus: 'sku_code' }
export const conflictTargetFor = (tableName) => CONFLICT_TARGET[tableName] || 'id'

// ═══════════════════════════════════════════════════════════════
// useSupabaseStore — drop-in replacement for useStore
// Returns [data, updateFn, loading]
// ═══════════════════════════════════════════════════════════════
export function useSupabaseStore(localStorageKey, fallback) {
  const tableName = TABLE_MAP[localStorageKey]
  const [data, setData] = useState(fallback)
  const [loading, setLoading] = useState(true)
  const prevIds = useRef(new Set())
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback

  // Pull the table into state. Used on mount AND after a failed sync — a rejected write leaves the
  // optimistic row in React state only, so the UI would keep showing (and re-sending) data the
  // database never accepted. Re-reading is the one move that always makes the two agree again.
  const pull = useCallback(async (isCancelled = () => false) => {
    const rows = await fetchAllRows(tableName)
    if (isCancelled()) return
    if (!rows) { setLoading(false); return }   // fetch failed — keep whatever is on screen

    // For hard-delete tables (e.g. coils): purge any legacy soft-deleted rows from
    // Supabase so their unique column values are fully released.
    if (HARD_DELETE_TABLES.has(tableName)) {
      const legacyDeleted = rows.filter(r => r.deleted).map(r => r.id)
      if (legacyDeleted.length > 0) {
        await supabase.from(tableName).delete().in('id', legacyDeleted)
      }
      if (isCancelled()) return
    }

    const liveRows = HARD_DELETE_TABLES.has(tableName) ? rows.filter(r => !r.deleted) : rows
    const camelRows = liveRows.map(toCamel)
    setData(camelRows.length > 0 ? camelRows : fallbackRef.current)
    prevIds.current = new Set(liveRows.map(r => r.id))
    setLoading(false)
  }, [tableName])

  // Fetch on mount
  useEffect(() => {
    let cancelled = false
    pull(() => cancelled)
    return () => { cancelled = true }
  }, [pull])

  // Update function — same signature as old useStore setter
  const update = useCallback((v) => {
    setData(prev => {
      const next = typeof v === 'function' ? v(prev) : v

      // Sync to Supabase in the background; on rejection re-read the table so state stops
      // claiming rows Postgres refused.
      syncToSupabase(tableName, prev, next, prevIds, () => { pull() })

      return next
    })
  }, [tableName, pull])

  return [data, update, loading]
}

// ── Page through a table (PostgREST caps a limit-less select at 1000 rows, and baby_coils alone
// exceeds that → the Slitting stage was silently truncated). Order by created_at then id: a stable
// tiebreaker is required because a bulk import gives every row an identical created_at, which alone
// makes .range() non-deterministic. Returns null when the read fails. ──
async function fetchAllRows(tableName) {
  const PAGE = 1000
  const rows = []
  for (let from = 0; ; from += PAGE) {
    const { data: page, error } = await supabase
      .from(tableName)
      .select('*')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      console.error(`[db] Error fetching ${tableName}:`, error.message)
      return null
    }

    rows.push(...page)
    if (page.length < PAGE) break
  }
  return rows
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
async function syncToSupabase(tableName, prev, next, prevIdsRef, onReject = () => {}) {
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
    const onConflict = conflictTargetFor(tableName)
    const { error } = await supabase.from(tableName).upsert(snakeRows, { onConflict, ignoreDuplicates: false })
    if (error) {
      console.error(`[db] Upsert error on ${tableName}:`, error.message, { onConflict, sampleRow: snakeRows[0] })
      emitSyncError(tableName, 'upsert', error, snakeRows)
      onReject()   // re-read the table: these rows are in React state but not in Postgres
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

// ═══════════════════════════════════════════════════════════════
// APP LOGIN — check a login id + password against Supabase.
// The credential lives in the private `app_credentials` table, which the app
// cannot read. We only ASK the `verify_login` database function whether the
// password is correct and get back a plain yes/no — the password/hash never
// reaches the browser. Returns true/false; throws only on a network/RPC error
// so the UI can tell "wrong password" (false) apart from "couldn't connect".
// ═══════════════════════════════════════════════════════════════
export async function verifyLogin(loginId, password) {
  const { data, error } = await supabase.rpc('verify_login', {
    p_login_id: loginId,
    p_password: password,
  })
  if (error) {
    console.error('[db] verify_login error:', error.message)
    throw error
  }
  return data === true
}

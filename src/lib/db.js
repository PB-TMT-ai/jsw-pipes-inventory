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

// How `replaceAll` supersedes the rows already in a table:
//   'soft' → set deleted=true (history is kept and still queryable)
//   'hard' → delete the rows outright (no history kept)
// Only the tables rebuilt wholesale by the daily Sales upload need an entry.
const REPLACE_MODE = { dispatches: 'soft', orders: 'hard' }

// PostgREST sends `.in('id', […])` as a URL filter, so a few hundred UUIDs blow past the
// ~8 KB request-line limit and the request fails outright. Upserts are POST bodies, but a
// full rebuild of dispatches is megabytes of JSONB. Chunk both.
const CHUNK = 200

function chunk(arr, size = CHUNK) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

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
  'jsw:distributorEstimates': 'distributor_estimates',
}

// ═══════════════════════════════════════════════════════════════
// UPSERT CONFLICT TARGET — the column Postgres arbitrates on
// ═══════════════════════════════════════════════════════════════
// Postgres resolves ON CONFLICT against ONE index. A conflict on any OTHER unique index is a hard
// error, not an update — so a table with a second unique column needs that column as the arbiter.
// `skus.sku_code` is UNIQUE: upserting on `id` meant a row carrying an existing code under a new id
// was rejected ("duplicate key value violates unique constraint skus_sku_code_key"), which failed
// the whole batch. Arbitrating on sku_code makes that case an UPDATE of the existing row instead.
// `distributor_estimates` is the same trap with a COMPOSITE arbiter: one estimate exists per
// (distributor_key, month), and re-saving that pair under a fresh id must UPDATE the existing row.
// PostgREST accepts a comma-joined column list as the on_conflict target.
export const CONFLICT_TARGET = { skus: 'sku_code', distributor_estimates: 'distributor_key,month' }
export const conflictTargetFor = (tableName) => CONFLICT_TARGET[tableName] || 'id'

// ═══════════════════════════════════════════════════════════════
// useSupabaseStore — drop-in replacement for useStore
// Returns [data, updateFn, loading, replaceAllFn]
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

  // Wholesale replace — supersedes server-side, so a stale tab can't double-count.
  // Local state is re-seeded from what we wrote, keeping this tab consistent afterwards.
  const replaceAll = useCallback(async (newRows) => {
    const rows = await replaceAllRows(tableName, newRows)
    setData(rows)
    prevIds.current = new Set(rows.map(r => r.id))
    return rows
  }, [tableName])

  return [data, update, loading, replaceAll]
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
// REPLACE-ALL — wholesale table rebuild for the daily Sales upload
//
// The ordinary `update` setter diffs against the tab's in-memory snapshot, taken when the
// page loaded. That snapshot cannot contain rows another tab (or another day's upload)
// created since, so a "replace" driven by it silently leaves those rows live and appends
// its own on top — the July 2026 incident where every invoice and order line was stored
// twice and all reported tonnage read exactly 2×.
//
// So supersede SERVER-SIDE instead: one statement scoped by a predicate, never by a list of
// ids read from local state. Whatever is live at the moment of the write is superseded,
// no matter which tab last read it.
// ═══════════════════════════════════════════════════════════════
export async function replaceAllRows(tableName, newRows, client = supabase) {
  const mode = REPLACE_MODE[tableName] || 'soft'

  // 1. Supersede everything currently live. `neq('id', <never-matching uuid>)` is just a
  //    PostgREST-required WHERE clause — it matches every row.
  const ALL = '00000000-0000-0000-0000-000000000000'
  const { error: supersedeErr } = mode === 'hard'
    ? await client.from(tableName).delete().neq('id', ALL)
    : await client.from(tableName).update({ deleted: true }).eq('deleted', false)

  if (supersedeErr) {
    console.error(`[db] Replace(${mode}) error on ${tableName}:`, supersedeErr.message)
    emitSyncError(tableName, 'replace', supersedeErr, newRows)
    throw supersedeErr   // abort — inserting now would duplicate, which is the bug we're fixing
  }

  // 2. Insert the rebuilt set, chunked so a large rebuild can't exceed the payload limit.
  const snakeRows = newRows.map(toSnake)
  for (const batch of chunk(snakeRows)) {
    const { error } = await client.from(tableName).insert(batch)
    if (error) {
      console.error(`[db] Replace insert error on ${tableName}:`, error.message, { sampleRow: batch[0] })
      emitSyncError(tableName, 'insert', error, batch)
      throw error
    }
  }
  return newRows
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
    let rejected = false
    for (const batch of chunk(snakeRows)) {
      const { error } = await supabase.from(tableName).upsert(batch, { onConflict, ignoreDuplicates: false })
      if (error) {
        console.error(`[db] Upsert error on ${tableName}:`, error.message, { onConflict, sampleRow: batch[0] })
        emitSyncError(tableName, 'upsert', error, batch)
        rejected = true
      }
    }
    // Re-read once, after every batch: the rejected rows are in React state but not in Postgres.
    if (rejected) onReject()
  }

  // Hard-delete removed items
  if (toDelete.length > 0) {
    for (const batch of chunk(toDelete)) {
      const { error } = await supabase.from(tableName).delete().in('id', batch)
      if (error) {
        console.error(`[db] Delete error on ${tableName}:`, error.message)
        emitSyncError(tableName, 'delete', error, batch)
      }
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

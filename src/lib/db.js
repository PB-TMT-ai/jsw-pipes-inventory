import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from './supabase'
import { ALL_PLANTS } from './calc'

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

// A body chunk is not a URL chunk. `.in('id', […])` rides in the query string, where 200 UUIDs is
// ~7.8 KB — right on the ~8 KB request-line limit above, so it fails intermittently and by payload
// size rather than by code. 100 is ~3.9 KB, comfortably inside it.
const ID_FILTER_CHUNK = 100

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
  'jsw:stateRegions': 'state_regions',
  'jsw:plants': 'plants',
  'jsw:distributors': 'distributors',
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
// `state_regions` holds one row per state, so `state` is its arbiter: the first edit of a SEEDED
// state arrives under the seed's literal id, and any later re-map of the same state must UPDATE that
// row rather than collide with unique(state).
// `plants` and `distributors` (ticket #129) are the same shape as `state_regions`: one row per
// real-world thing, layered over a code seed, so the arbiter is the thing itself — the plant's
// literal id, the distributor's resolved identity key — and never the surrogate uuid. The first
// edit of a plant that has only ever existed in the seed arrives under a fresh id, and every later
// edit of that plant must UPDATE that row rather than collide with unique(plant_id).
export const CONFLICT_TARGET = {
  skus: 'sku_code',
  distributor_estimates: 'distributor_key,month',
  state_regions: 'state',
  plants: 'plant_id',
  distributors: 'distributor_key',
}
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
// `recovery` is the one thing the raw PostgREST message can never say: what state the data is in
// now. A rejected rebuild that changed nothing and one that left duplicates read identically at the
// error level and could not be more different to the operator, so replaceAllRows states it.
function emitSyncError(tableName, op, error, rows, { recovery = '' } = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('jsw:syncError', {
    detail: {
      tableName,
      op,
      recovery,
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
// TWO failures shape this function. Both have happened; neither may happen again.
//
// 1. THE 2x DUPLICATION (July 2026). The ordinary `update` setter diffs against the tab's
//    in-memory snapshot, taken when the page loaded. That snapshot cannot contain rows another
//    tab (or another day's upload) created since, so a "replace" driven by it silently leaves
//    those rows live and appends its own on top — every invoice and order line stored twice, all
//    reported tonnage exactly 2x. So what gets superseded is decided SERVER-SIDE, from the ids
//    that are live at the moment of the write, and NEVER from local state.
//
// 2. THE EMPTIED ORDER BOOK (2026-08-20). This function used to supersede FIRST and insert
//    second. The two steps are separate HTTP round-trips with no transaction spanning them, so
//    when the insert was rejected — `orders` had no `plant` column, ticket #118's DDL having
//    never been run — the delete had already committed and the order book was left EMPTY.
//    Any rejected insert did this: a new column, one bad row, a dropped connection.
//
// So the order is now INSERT FIRST, SUPERSEDE AFTER, which buys one plain invariant:
//
//   A FAILED UPLOAD NEVER LEAVES FEWER ROWS THAN IT STARTED WITH.
//   Worst case it leaves duplicates, and duplicates are healed by uploading again.
//
// That asymmetry is the whole design. Duplicates are visible, self-healing, and cost a re-upload;
// an empty order book is none of those things. Every failure path below is therefore allowed to
// end in duplicates and is forbidden to end in loss.
//
//   step 1  read the live ids        fails -> nothing was touched
//   step 2  insert the new rows      fails -> roll the inserts back, old rows still there
//   step 3  supersede the step-1 ids fails -> new rows are in, some old ones linger (duplicates)
//
// The step-1 id list is what keeps failure 1 fixed: it is fetched from the server here, inside
// the write, so a stale tab cannot narrow it. It is NOT the local snapshot that caused the 2x bug
// — that distinction is the entire difference between this and the July regression, and a change
// that starts passing `newRows` or component state in here reintroduces it.
//
// Residual, accepted: a row created by ANOTHER writer between step 1 and step 3 is not in the id
// list, so it survives. The old predicate would have deleted it. Two concurrent rebuilds of the
// same table is not a real workflow (one operator, one daily file), and surviving is the safe
// side of that trade — see docs/DATA-MODEL.md.
// ═══════════════════════════════════════════════════════════════

// The ids live in the table RIGHT NOW — server-side, read inside the write, never from local
// state. Paginated: `dispatches` runs to thousands of rows and PostgREST caps a page at 1000.
// Ordered by id so pages cannot overlap or skip (`created_at` is identical across a bulk import,
// which alone makes .range() non-deterministic — the same trap fetchAllRows documents).
async function fetchLiveIds(tableName, mode, client) {
  const PAGE = 1000
  const ids = []
  for (let from = 0; ; from += PAGE) {
    let query = client.from(tableName).select('id')
    // A soft-superseded table keeps its history, so only the rows still showing are "live".
    if (mode === 'soft') query = query.eq('deleted', false)
    const { data, error } = await query.order('id', { ascending: true }).range(from, from + PAGE - 1)
    if (error) throw error
    const page = data || []
    ids.push(...page.map(r => r.id))
    if (page.length < PAGE) break
  }
  return ids
}

// Undo the rows this call inserted, so a rejected rebuild leaves the table exactly as it found it.
// Always a HARD delete, even on a soft-superseded table: these rows are seconds old and were never
// part of the history, so flagging them `deleted` would file a failed upload as real dispatches.
// Best-effort by design — if the rollback itself fails we are left with duplicates, which the
// invariant permits and a re-upload heals. Never let it throw over the original error, which is
// the one that says WHY the upload failed.
async function rollbackInserted(tableName, insertedIds, client) {
  if (!insertedIds.length) return true
  let clean = true
  for (const batch of chunk(insertedIds, ID_FILTER_CHUNK)) {
    try {
      const { error } = await client.from(tableName).delete().in('id', batch)
      if (error) { clean = false; console.error(`[db] Rollback error on ${tableName}:`, error.message) }
    } catch (err) {
      clean = false
      console.error(`[db] Rollback threw on ${tableName}:`, err?.message || err)
    }
  }
  return clean
}

export async function replaceAllRows(tableName, newRows, client = supabase) {
  const mode = REPLACE_MODE[tableName] || 'soft'

  // ── 1. What is live right now? Read it before anything is written, and read it from the
  //       server. Failing here is the cheap failure: not one row has been touched yet.
  let staleIds
  try {
    staleIds = await fetchLiveIds(tableName, mode, client)
  } catch (err) {
    console.error(`[db] Replace(${mode}) could not read live ids on ${tableName}:`, err?.message || err)
    emitSyncError(tableName, 'replace', err, newRows, {
      recovery: 'Nothing was changed — the previous rows are still in place. Try again.',
    })
    throw err
  }

  // ── 2. Insert the rebuilt set, chunked so a large rebuild can't exceed the payload limit.
  //       The old rows are still there throughout, which is the point: if this step is rejected
  //       the table keeps yesterday's data instead of being left empty.
  const snakeRows = newRows.map(toSnake)
  const insertedIds = []
  for (const batch of chunk(snakeRows)) {
    const { error } = await client.from(tableName).insert(batch)
    if (error) {
      console.error(`[db] Replace insert error on ${tableName}:`, error.message, { sampleRow: batch[0] })
      const clean = await rollbackInserted(tableName, insertedIds, client)
      emitSyncError(tableName, 'insert', error, batch, {
        recovery: clean
          ? 'No data was lost — the previous rows are still in place. Fix the cause and upload again.'
          : 'The previous rows are still in place, but part of this upload could not be rolled back. Upload again to clear the duplicates.',
      })
      throw error
    }
    insertedIds.push(...batch.map(r => r.id).filter(Boolean))
  }

  // ── 3. Only now supersede what step 1 found. Scoped to those exact ids, so it cannot touch
  //       the rows just inserted — which is why the predicate form (`neq id <impossible>`,
  //       `eq deleted false`) cannot be used here any more: both would match the new rows too.
  // Belt and braces: never supersede an id this call just inserted. A caller that reuses an
  // existing id would already have been stopped by the primary-key conflict in step 2, so this
  // cannot fire today — but it makes "step 3 can only ever remove pre-existing rows" a property of
  // the function rather than something inferred from what every caller happens to pass in.
  const insertedSet = new Set(insertedIds)
  const toSupersede = staleIds.filter(id => !insertedSet.has(id))

  let supersededCount = 0
  for (const batch of chunk(toSupersede, ID_FILTER_CHUNK)) {
    const { error } = mode === 'hard'
      ? await client.from(tableName).delete().in('id', batch)
      : await client.from(tableName).update({ deleted: true }).in('id', batch)

    if (error) {
      // The new data is already safely in. Do NOT roll it back — that trades duplicates, which a
      // re-upload heals, for the loss this function exists to prevent.
      console.error(`[db] Replace(${mode}) supersede error on ${tableName}:`, error.message)
      emitSyncError(tableName, 'replace', error, newRows, {
        recovery: `The new rows were saved, but ${toSupersede.length - supersededCount} older row(s) could not be superseded, so some records may appear twice. Upload again to clear them.`,
      })
      throw error
    }
    supersededCount += batch.length
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
//
// NO LONGER CALLED BY THIS BUILD. Ticket #126 moved sign-in onto
// `verifyLoginDetails` below, which answers WHO signed in — a yes/no cannot
// decide which tabs to render. It is kept, with its SQL function, for the
// deployment window: a browser tab still running the previous build calls
// `verify_login` until it is reloaded, and that call must keep working. Delete
// both once no such tab can plausibly be open.
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

// ═══════════════════════════════════════════════════════════════
// APP LOGIN, WITH PLANT AND ROLE (ticket #125) — a SECOND question put to a
// SECOND database function. `verifyLogin` above is untouched and still works:
// the SQL adding this one is additive, so it can be run against the database
// serving the current build without breaking sign-in before the new build ships.
// Since ticket #126 this is the one the app actually signs in with.
//
// `verify_login_details` answers with the signer's identity — login id, plant
// and role — instead of yes/no. Same guarantee as the boolean version: the
// password goes in, the hash never comes out. A wrong password returns NO ROWS
// (never a row with the fields blanked), so `null` here means "nobody signed
// in" and can never be read as "signed in, plant unknown".
//
// A credential carrying no plant is the admin, and that comes back as
// `ALL_PLANTS` — deliberately NOT blank. Blank is the app's OTHER plant
// sentinel: `Unattributed`, the labelling gap (`plantFilterOptions` offers it
// as `{ id: '' }`). Returning '' here would hand `filterByPlant` the one value
// that shows the admin only the rows nobody could attribute — the exact
// opposite of every plant. Throws only on a network/RPC error, so the UI can
// tell "wrong password" (null) apart from "couldn't connect" (throw).
//
// UI tidiness, NOT confidentiality: every table keeps its permissive row-level
// policy and the app's public key still reaches all data. See
// blueprints/manage-app-login.md.
// ═══════════════════════════════════════════════════════════════
export async function verifyLoginDetails(loginId, password, client = supabase) {
  const { data, error } = await client.rpc('verify_login_details', {
    p_login_id: String(loginId ?? '').trim(),
    p_password: password,
  })
  if (error) {
    console.error('[db] verify_login_details error:', error.message)
    throw error
  }
  const row = Array.isArray(data) ? data[0] : data
  if (!row) return null
  return {
    loginId: row.login_id ?? '',
    plant: row.plant || ALL_PLANTS,   // no plant on the credential = every plant
    role: row.role ?? '',
  }
}

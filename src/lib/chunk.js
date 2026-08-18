// ═══════════════════════════════════════════════════════════════
// LAZY-CHUNK LOADING ACROSS DEPLOYS
// ═══════════════════════════════════════════════════════════════
// The Reports tab and the Orders uploader pull their heavy libraries in on demand
// (`import('./lib/reports')` → exceljs, `import('xlsx')`). Vite emits those as hash-named files,
// e.g. /assets/reports-BjkJ5Jvy.js, and Vercel only serves the CURRENT deploy's /assets. A tab that
// was opened before a deploy is still running the OLD bundle, so its click asks for a hash that no
// longer exists — and the browser reports:
//
//   Failed to fetch dynamically imported module: .../assets/reports-BjkJ5Jvy.js
//
// Nothing is broken; the page is stale. The fix is to reload once so the tab picks up the new
// index.html and the new hashes. The reload is guarded by a sessionStorage timestamp so a genuinely
// missing chunk degrades into a readable message instead of an endless reload loop.

const RELOAD_KEY = 'jsw:chunkReloadAt'
const RELOAD_WINDOW_MS = 60_000   // a second failure inside this window means reloading did not help

const STALE_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /'text\/html' is not a valid javascript mime type/i,   // SPA rewrite answered the .js request with index.html
  /expected a javascript(-or-wasm)? module script/i,
  /failed to fetch/i,
]

export const STALE_BUILD_MESSAGE =
  'This page is running an older version of the app and could not load that feature. ' +
  'Refresh the page (Ctrl+Shift+R, or Cmd+Shift+R on a Mac) and try again.'

export const OFFLINE_MESSAGE =
  'You appear to be offline, so that feature could not be downloaded. Reconnect and try again.'

export function isStaleChunkError(e) {
  const msg = String(e?.message || e || '')
  return STALE_PATTERNS.some(re => re.test(msg))
}

function safeSession() {
  try { return window.sessionStorage } catch { return null }   // private mode / blocked storage
}

// True when we actually triggered a reload. False when one was already tried in this tab moments
// ago, or when the guard cannot be recorded at all (storage blocked in private browsing) — the
// caller then surfaces STALE_BUILD_MESSAGE and the operator refreshes by hand. Never reload without
// a working guard: an auto-reload that cannot remember itself is an infinite reload loop.
export function reloadOnce({ storage = safeSession(), reload, now = () => Date.now() } = {}) {
  let last
  try { last = Number(storage?.getItem(RELOAD_KEY) || 0) } catch { return false }
  if (last === undefined || Number.isNaN(last)) return false
  if (last && now() - last < RELOAD_WINDOW_MS) return false
  try { storage.setItem(RELOAD_KEY, String(now())) } catch { return false }
  ;(reload || (() => window.location.reload()))()
  return true
}

// Wraps a dynamic import. Success clears the reload guard; a stale-build failure reloads the tab
// once; anything else (a real error inside the module) is rethrown untouched.
export async function loadChunk(load, {
  storage = safeSession(),
  reload,
  now = () => Date.now(),
  online = () => (typeof navigator === 'undefined' ? true : navigator.onLine !== false),
} = {}) {
  try {
    const mod = await load()
    try { storage?.removeItem(RELOAD_KEY) } catch { /* ignore */ }
    return mod
  } catch (e) {
    if (!isStaleChunkError(e)) throw e
    if (!online()) throw new Error(OFFLINE_MESSAGE)          // reloading an offline tab just blanks it
    if (!reloadOnce({ storage, reload, now })) throw new Error(STALE_BUILD_MESSAGE)
    return await new Promise(() => {})                        // hold the caller: the page is going away
  }
}

// Vite fires `vite:preloadError` when a <link rel=modulepreload> for a lazy chunk 404s — the same
// stale-deploy situation, caught before the import() even runs. Same one-shot reload.
export function installChunkReloadHandler(target = typeof window === 'undefined' ? null : window, deps = {}) {
  if (!target?.addEventListener) return () => {}
  const onPreloadError = (event) => {
    event.preventDefault?.()      // stop Vite's default "throw the error" behaviour
    reloadOnce(deps)
  }
  target.addEventListener('vite:preloadError', onPreloadError)
  return () => target.removeEventListener('vite:preloadError', onPreloadError)
}

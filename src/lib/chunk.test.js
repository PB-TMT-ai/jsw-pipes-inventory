import { describe, it, expect } from 'vitest'
import {
  isStaleChunkError, loadChunk, reloadOnce, installChunkReloadHandler,
  STALE_BUILD_MESSAGE, OFFLINE_MESSAGE,
} from './chunk'

// A stand-in for sessionStorage — the real one does not exist in the node test environment.
const fakeStorage = () => {
  const map = new Map()
  return {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    size: () => map.size,
  }
}

// The exact error a stale tab produced on 2026-08-18 when the Reports button asked for a chunk
// hash the current Vercel deploy no longer serves.
const REAL_ERROR = new TypeError(
  'Failed to fetch dynamically imported module: https://jsw-pipes-inventory.vercel.app/assets/reports-BjkJ5Jvy.js'
)

describe('isStaleChunkError', () => {
  it('matches the browser wordings for a chunk that is no longer served', () => {
    expect(isStaleChunkError(REAL_ERROR)).toBe(true)                                      // Chrome
    expect(isStaleChunkError(new Error('error loading dynamically imported module'))).toBe(true)  // Safari
    expect(isStaleChunkError(new Error('Importing a module script failed.'))).toBe(true)          // Firefox
    // SPA rewrite answering the .js request with index.html
    expect(isStaleChunkError(new Error("Failed to load module script: Expected a JavaScript module script but the server responded with a MIME type of 'text/html'"))).toBe(true)
  })

  it('does not match a real error thrown from inside the report code', () => {
    expect(isStaleChunkError(new TypeError("Cannot read properties of undefined (reading 'weightPerTube')"))).toBe(false)
    expect(isStaleChunkError(new Error('Worksheet PB MTD not found'))).toBe(false)
  })
})

describe('loadChunk', () => {
  it('returns the module and clears any earlier reload marker', async () => {
    const storage = fakeStorage()
    storage.setItem('jsw:chunkReloadAt', '1000')
    const mod = await loadChunk(async () => ({ generateFinishedStockReport: () => 'ok' }), { storage })
    expect(mod.generateFinishedStockReport()).toBe('ok')
    expect(storage.size()).toBe(0)
  })

  it('reloads the page once on a stale-chunk failure', async () => {
    const storage = fakeStorage()
    let reloads = 0
    const pending = loadChunk(() => Promise.reject(REAL_ERROR), {
      storage, reload: () => { reloads++ }, now: () => 5_000,
    })
    // The call never settles — the tab is navigating away — so assert on the side effects.
    await Promise.race([pending, Promise.resolve()])
    expect(reloads).toBe(1)
    expect(storage.getItem('jsw:chunkReloadAt')).toBe('5000')
  })

  it('does not loop: a second failure right after a reload surfaces a readable message', async () => {
    const storage = fakeStorage()
    let reloads = 0
    const deps = { storage, reload: () => { reloads++ }, now: () => 5_000 }
    await Promise.race([loadChunk(() => Promise.reject(REAL_ERROR), deps), Promise.resolve()])
    await expect(loadChunk(() => Promise.reject(REAL_ERROR), { ...deps, now: () => 12_000 }))
      .rejects.toThrow(STALE_BUILD_MESSAGE)
    expect(reloads).toBe(1)
  })

  it('reloads again once the guard window has passed (a later deploy, same tab)', async () => {
    const storage = fakeStorage()
    let reloads = 0
    const deps = { storage, reload: () => { reloads++ } }
    await Promise.race([loadChunk(() => Promise.reject(REAL_ERROR), { ...deps, now: () => 5_000 }), Promise.resolve()])
    await Promise.race([loadChunk(() => Promise.reject(REAL_ERROR), { ...deps, now: () => 200_000 }), Promise.resolve()])
    expect(reloads).toBe(2)
  })

  it('never reloads an offline tab — that would just blank the screen', async () => {
    const storage = fakeStorage()
    let reloads = 0
    await expect(loadChunk(() => Promise.reject(REAL_ERROR), {
      storage, reload: () => { reloads++ }, online: () => false,
    })).rejects.toThrow(OFFLINE_MESSAGE)
    expect(reloads).toBe(0)
  })

  it('rethrows a genuine error from inside the module untouched', async () => {
    let reloads = 0
    const boom = new TypeError('skus.find is not a function')
    await expect(loadChunk(() => Promise.reject(boom), { storage: fakeStorage(), reload: () => { reloads++ } }))
      .rejects.toThrow('skus.find is not a function')
    expect(reloads).toBe(0)
  })

  it('asks for a manual refresh instead of looping when storage is blocked', async () => {
    const blocked = {
      getItem() { throw new Error('SecurityError') },
      setItem() { throw new Error('SecurityError') },
      removeItem() { throw new Error('SecurityError') },
    }
    let reloads = 0
    // No guard can be recorded, so an auto-reload could never stop itself. Tell the operator instead.
    expect(reloadOnce({ storage: blocked, reload: () => { reloads++ } })).toBe(false)
    await expect(loadChunk(() => Promise.reject(REAL_ERROR), { storage: blocked, reload: () => { reloads++ } }))
      .rejects.toThrow(STALE_BUILD_MESSAGE)
    expect(reloads).toBe(0)
  })

  it('does not reload when sessionStorage is missing entirely', async () => {
    let reloads = 0
    await expect(loadChunk(() => Promise.reject(REAL_ERROR), { storage: null, reload: () => { reloads++ } }))
      .rejects.toThrow(STALE_BUILD_MESSAGE)
    expect(reloads).toBe(0)
  })
})

describe('installChunkReloadHandler', () => {
  it('reloads once on Vite\'s preloadError and stops the default throw', () => {
    const listeners = {}
    const target = {
      addEventListener: (type, fn) => { listeners[type] = fn },
      removeEventListener: (type) => { delete listeners[type] },
    }
    const storage = fakeStorage()
    let reloads = 0, prevented = 0
    const off = installChunkReloadHandler(target, { storage, reload: () => { reloads++ }, now: () => 1 })
    listeners['vite:preloadError']({ preventDefault: () => { prevented++ } })
    expect(reloads).toBe(1)
    expect(prevented).toBe(1)
    off()
    expect(listeners['vite:preloadError']).toBeUndefined()
  })

  it('is a no-op with no window (SSR / tests)', () => {
    expect(() => installChunkReloadHandler(null)()).not.toThrow()
  })
})

// ── Guard: src/lib must stay importable by plain Node ───────────────────────────────────────────
// `scripts/*.mjs` import calc.js / reports.js directly, and Node — unlike Vite and Vitest — does NOT
// resolve extensionless relative paths. So `import x from '../data/stateRegions'` runs fine in every
// test and in the browser, and throws ERR_MODULE_NOT_FOUND the moment a script touches it.
//
// That is not hypothetical: it is how scripts/coil-realloc-dryrun.mjs quietly stopped working. No
// test could see it, because the test runner resolves what Node will not. This spawns a real Node
// process to close that gap.
import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const importsUnderNode = (rel) => {
  const href = pathToFileURL(resolve(process.cwd(), rel)).href
  try {
    execFileSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(href)})`],
      { stdio: 'pipe' })
    return ''
  } catch (e) {
    return String(e.stderr || e.message)
  }
}

describe('src/lib is importable by plain Node (so scripts/ keeps working)', () => {
  // Only modules a script may legitimately import. db.js and supabase.js are browser-bound (React,
  // import.meta.env) and are deliberately NOT covered — a script must never reach for them.
  it.each(['src/lib/calc.js', 'src/lib/reports.js'])('%s imports without a resolver error', (rel) => {
    expect(importsUnderNode(rel)).toBe('')
  })
})

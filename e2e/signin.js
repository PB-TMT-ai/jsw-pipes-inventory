import { expect } from '@playwright/test'

// ── Signing in, for E2E (ticket #126) ──────────────────────────────────────────────────────────
// Every spec goes through the login gate, because the app does. Before this ticket the specs
// called `page.goto('/')` and drove the tabs directly — which stopped working the day the gate
// shipped, silently, since the specs cannot run in a sandbox with no Chromium binary. They do not
// bypass it now: they sign in through the real form, so the whole chain the ticket is about
// (form → verify_login_details → the stored session → which tabs render) is what runs.
//
// What IS faked is the ONE database call, and only that. `.env.test` points at a Supabase host
// that does not exist, so no password on earth would verify — but the password check is not what
// these tests are for; it is a bcrypt function tested against a real Postgres (see TESTING.md),
// and `verifyLoginDetails` itself is covered in src/lib/db.test.js. Here we say "this user signed
// in correctly" and test what the app does with the answer.
//
// A wrong password returns NO ROWS from `verify_login_details` (never a row saying "false"), so
// the fake returns rows the same way: `[row]` or `[]`. NULL plant = all plants, exactly as the
// credential table stores it for `admin`.
export const LOGINS = {
  admin:     { login_id: 'admin',     plant: null,        role: 'admin' },
  hyderabad: { login_id: 'hyderabad', plant: 'hyderabad', role: 'plant' },
  npmd:      { login_id: 'npmd',      plant: 'npmd',      role: 'plant' },
}

const RPC = '**/rest/v1/rpc/verify_login_details'
const REST = '**/rest/v1/**'

// ── The rest of Supabase ───────────────────────────────────────────────────────────────────────
// `.env.test` points at a host that does not resolve, so every table read used to fail — slowly,
// through the sandbox's proxy, one stalled request per table, and the app sat on "Loading inventory
// data..." for longer than any sensible test timeout. Answering them here with an EMPTY table is
// the same starting state the specs always assumed (no persistence, drive the optimistic in-session
// state) and it is instant and deterministic instead of depending on how a network fails.
//
// An empty read is not "no data" to the app: `useSupabaseStore` keeps its fallback when a table
// comes back empty, which is what still puts the 232-SKU DEFAULT_SKUS catalog behind the SKU
// picker — the specs pick SKU-001 out of it by index.
//
// Writes are answered as accepted, so nothing here re-reads the table mid-flow. That matters more
// than it looks: a REJECTED write makes the store re-pull to stop showing rows Postgres refused,
// and a re-pull against an empty table would throw away the very coil the test just registered.
async function stubTables(page) {
  await page.route(REST, route => {
    if (route.request().url().includes('/rpc/')) return route.fallback()
    return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })
}

// Stand in for the sign-in RPC. `rows` decides the answer: a credential row for a correct
// sign-in, `[]` for a wrong password.
export async function stubSignIn(page, rows) {
  await stubTables(page)
  await page.route(RPC, route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(rows),
  }))
}

// Open the app and sign in as one of the three logins. Returns once the tab bar is on screen, so
// a caller can go straight to clicking tabs exactly as the specs did before the gate existed.
export async function signIn(page, who = 'admin', { password = 'correct-horse' } = {}) {
  const row = LOGINS[who]
  if (!row) throw new Error(`No such test login: ${who}`)
  await stubSignIn(page, [row])   // installs the table stub too
  await page.goto('/')
  await page.getByLabel('Login ID').fill(row.login_id)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // Dashboard is the landing tab for every role, so it is the one signal that works for all three.
  await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible()
}

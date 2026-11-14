import { test, expect } from '@playwright/test'
import { signIn } from './signin'

// Incident 14-Nov-2026: the live site read page 0 of baby_coils (1000 rows), lost page 1 to a
// dropped connection (and Dispatch has lost pages to 500/57014 statement timeouts), and fetchAllRows threw the whole table away — Slitting rendered EMPTY with no
// warning. These specs serve a real two-page baby_coils (1001 rows, honouring offset/limit the way
// PostgREST does) and fault page 1.
//
// The row asserted on sits on PAGE 0. It was received both times; only the later page failed.
// Before the fix it vanished anyway — that is the bug.

const SEEN = {
  id: 'seed-hyd-baby', baby_coil_id: 'HYD-1126-01-A', hr_coil_id: 'HYD-1126-01',
  plant: 'hyderabad', date_of_conversion: '2026-11-01', width: 100, thickness: 2.5, weight: 5,
  baby_coil_entry: 'A', deleted: false,
}
const COIL = {
  id: 'seed-hyd-coil', hr_coil_id: 'HYD-1126-01', hr_coil_no: 1, plant: 'hyderabad',
  date_of_inward: '2026-11-01', thickness: 2.5, width: 150, actual_weight: 10, deleted: false,
}
const BABY_COILS = [SEEN, ...Array.from({ length: 1000 }, (_, i) => ({
  ...SEEN, id: `fill-${i}`, baby_coil_id: `HYD-1126-01-F${i}`, baby_coil_entry: `F${i}`,
}))]

// `down.failures`: how many more times the baby_coils offset=1000 read fails before it is answered
// (Infinity = until the test says otherwise). A switch, not a fixed count, because dev-mode React
// StrictMode mounts the store twice and so issues the first load twice.
function pagedBabyCoils(down) {
  return (route, table, url) => {
    if (route.request().method() !== 'GET') return null
    if (table === 'coils') {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([COIL]) })
    }
    if (table !== 'baby_coils') return null
    const q = new URL(url).searchParams
    const offset = Number(q.get('offset') || 0)
    const limit = Number(q.get('limit') || 1000)
    if (offset === 1000 && down.failures > 0) {
      down.failures--
      // A 500 / 57014, not an abort: postgrest-js retries an aborted fetch itself, which would hide
      // whether OUR retry works. It never retries a 500 — the Dispatch failure seen on the live site.
      return route.fulfill({
        status: 500, contentType: 'application/json',
        body: JSON.stringify({ code: '57014', message: 'canceling statement due to statement timeout', details: null, hint: null }),
      })
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify(BABY_COILS.slice(offset, offset + limit)),
    })
  }
}

const tab = (page, name) => page.getByRole('button', { name, exact: true })
const cell = (page, text) => page.locator('table').getByText(text, { exact: true })

test('a page that fails once is retried — Slitting still shows its rows, no banner', async ({ page }) => {
  // Once per mount: StrictMode's two loads each fail page 1 once, then retry it.
  await signIn(page, 'admin', { respond: pagedBabyCoils({ failures: 2 }) })
  await tab(page, '2. Slitting').click()
  await expect(cell(page, 'HYD-1126-01-A')).toBeVisible()
  await expect(page.getByTestId('load-error-banner')).toHaveCount(0)
})

test('a page that never loads raises the banner naming the table, and Retry recovers it', async ({ page }) => {
  const down = { failures: Infinity }
  await signIn(page, 'admin', { respond: pagedBabyCoils(down) })
  const banner = page.getByTestId('load-error-banner')
  await expect(banner).toContainText("Couldn't load Slitting from the database")
  await expect(banner).toContainText('incomplete')

  await banner.getByRole('button', { name: 'Retry' }).click()     // still failing
  await expect(banner).toBeVisible()
  await page.waitForTimeout(4000)                                    // its 3 attempts finish
  await expect(banner).toBeVisible()

  down.failures = 0                                                  // network is back
  await banner.getByRole('button', { name: 'Retry' }).click()
  await expect(banner).toHaveCount(0)
  await tab(page, '2. Slitting').click()
  await expect(cell(page, 'HYD-1126-01-A')).toBeVisible()
})

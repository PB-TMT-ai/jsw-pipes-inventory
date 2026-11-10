import { test, expect } from '@playwright/test'
import { signIn, writeRecorder } from './signin'

// E2E for ticket #279 — the admin edits, adds and retires planning-master rows on screen.
//
// The rules are pure functions with their own unit tests (`planningRowSave`, `planningRowAdd`,
// `planningMasterView` in src/lib/calc.js). What only a browser answers is the wiring: that Save
// sends the row to `planning_master` on its `row_key` arbiter, that stored rows come back on load
// (a reload is a fresh read of the table), that a retired row leaves the table, that the tick
// boxes offer only the row's region's plants, and that the amber note writes nothing.

const tab = (page, name) => page.getByRole('button', { name, exact: true })
const RHS_100x50_2 = '1140-13075-10074984'   // DEFAULT_SKUS: MS RHS … 100x50x2x6000

async function openPlanning(page, opts) {
  await signIn(page, 'admin', opts)
  await tab(page, 'Production Planning').click()
  // The tab opens on the monthly campaign (#280); the master is its second screen.
  await tab(page, 'Planning master').click()
  await expect(page.getByRole('heading', { name: 'Planning master' })).toBeVisible()
}

const planningWrites = (rec) => rec.writes.filter(w => w.url.includes('/rest/v1/planning_master'))

test('an edit is written on row_key, with only the region’s plants ticked', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { onRequest: rec.onRequest })

  await page.getByRole('button', { name: 'Edit South 100x50 2.0' }).click()
  // A South row offers Hyderabad and Lepakshi — never NPMD or Tapi.
  await expect(page.getByLabel('Hyderabad can make South 100x50 2.0')).toBeVisible()
  await expect(page.getByLabel('Lepakshi can make South 100x50 2.0')).toBeVisible()
  await expect(page.getByLabel(/^(NPMD|Tapi) can make/)).toHaveCount(0)

  await page.getByLabel('Type of South 100x50 2.0').selectOption('Buffer')
  await page.getByLabel('Buffer of South 100x50 2.0').fill('40')
  await page.getByLabel('Lepakshi can make South 100x50 2.0').check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Saved South 100x50 2.0.')).toBeVisible()
  await rec.settle(page)

  const writes = planningWrites(rec)
  expect(new Set(writes.map(w => w.body)).size).toBe(1)   // one row, however often the updater ran
  expect(writes[0].url).toContain('on_conflict=row_key')
  const [body] = JSON.parse(writes[0].body)
  expect(body).toMatchObject({
    row_key: 'South|100x50|2.0', region: 'South', size: '100x50', thickness: 2,
    type: 'Buffer', buffer: 40, plants: ['hyderabad', 'lepakshi'], retired: false, deleted: false,
  })
})

test('stored rows come back on load: an edit, an added row and a retired row', async ({ page }) => {
  const stored = [
    { id: 'a1', row_key: 'South|100x50|2.0', region: 'South', size: '100x50', thickness: 2, type: 'Buffer', buffer: 40, plants: ['hyderabad', 'lepakshi'], retired: false, deleted: false },
    { id: 'a2', row_key: 'South|132x132|3.0', region: 'South', size: '132x132', thickness: 3, type: 'MTO', buffer: null, plants: [], retired: false, deleted: false },
    { id: 'a3', row_key: 'South|50x50|2.0', region: 'South', size: '50x50', thickness: 2, type: 'Buffer', buffer: 100, plants: ['hyderabad', 'lepakshi'], retired: true, deleted: false },
  ]
  await openPlanning(page, { rows: { planning_master: stored } })

  await expect(page.getByLabel('Lepakshi can make 100x50 2.0')).toHaveText('✓')
  await expect(page.getByRole('button', { name: 'Edit South 132x132 3.0' })).toBeVisible()
  await expect(page.getByText('No plant can make').first()).toBeVisible()
  // Retired: gone from the master, still listed apart, and the region's counts drop with it.
  await expect(page.getByRole('button', { name: 'Edit South 50x50 2.0' })).toHaveCount(0)
  await page.getByLabel(/Show retired \(1\)/).check()
  await expect(page.getByRole('button', { name: 'Restore South 50x50 2.0' })).toBeVisible()
})

test('retire hides the row and writes retired, not deleted', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { onRequest: rec.onRequest })
  await page.getByRole('button', { name: 'Retire South 50x50 2.0' }).click()
  await expect(page.getByRole('button', { name: 'Edit South 50x50 2.0' })).toHaveCount(0)
  await rec.settle(page)
  const writes = planningWrites(rec)
  // An upsert, never a DELETE. React's dev StrictMode may run the store's updater twice; every
  // run must send the same row, under the same id.
  expect(writes.length).toBeGreaterThan(0)
  expect(new Set(writes.map(w => w.method))).toEqual(new Set(['POST']))
  expect(new Set(writes.map(w => w.body)).size).toBe(1)
  expect(JSON.parse(writes[0].body)[0]).toMatchObject({ row_key: 'South|50x50|2.0', retired: true, deleted: false })
})

test('adds a row for a size outside the plan', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { onRequest: rec.onRequest })
  await page.getByRole('button', { name: 'Add a South row' }).click()
  await page.getByLabel('New row size').fill('132 x 132')
  await page.getByLabel('New row thickness').fill('3')
  await page.getByRole('button', { name: 'Add row' }).click()
  await expect(page.getByRole('button', { name: 'Edit South 132x132 3.0' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Added South 132x132 3.0.')
  await rec.settle(page)
  expect(JSON.parse(planningWrites(rec)[0].body)[0]).toMatchObject({ row_key: 'South|132x132|3.0', type: 'MTO', plants: [] })

  // A row the master already has is refused, and nothing is written for it.
  await page.getByRole('button', { name: 'Add a South row' }).click()
  await page.getByLabel('New row size').fill('50x100')
  await page.getByLabel('New row thickness').fill('2')
  await page.getByRole('button', { name: 'Add row' }).click()
  await expect(page.getByRole('alert')).toHaveText('South 100x50 2.0 is already in the master.')
  await rec.settle(page)
  expect(planningWrites(rec).every(w => JSON.parse(w.body)[0].row_key === 'South|132x132|3.0')).toBe(true)
})

test('the amber note flags Lepakshi on South RHS 100x50 2.0, and clicking it ticks nothing', async ({ page }) => {
  const rec = writeRecorder()
  const orders = [
    { id: 'o1', mm_id: RHS_100x50_2, description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x2x6000', quantity: 20, plant: 'lepakshi', order_date: '2026-10-01', deleted: false },
  ]
  await openPlanning(page, { rows: { orders }, onRequest: rec.onRequest })
  const note = page.getByRole('note').filter({ hasText: 'Lepakshi: 20 T ordered, not ticked' })
  await expect(note).toBeVisible()
  await note.click()
  await expect(page.getByLabel('Lepakshi cannot make 100x50 2.0')).toHaveText('')
  await rec.settle(page)
  expect(planningWrites(rec)).toHaveLength(0)
})

test('the tab has no upload control for the master', async ({ page }) => {
  await openPlanning(page)
  await expect(page.locator('input[type=file]')).toHaveCount(0)
  await expect(page.getByRole('button', { name: /upload/i })).toHaveCount(0)
})

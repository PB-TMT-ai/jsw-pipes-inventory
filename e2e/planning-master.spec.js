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
  await expect(page.getByRole('button', { name: 'Planning master', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByLabel('Find size')).toBeVisible()
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
  await page.getByRole('button', { name: 'Add a South line' }).click()
  await page.getByLabel('New row size').fill('132 x 132')
  await page.getByLabel('New row thickness').fill('3')
  await page.getByRole('button', { name: 'Add line', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Edit South 132x132 3.0' })).toBeVisible()
  await expect(page.getByRole('status')).toHaveText('Added South 132x132 3.0.')
  await rec.settle(page)
  expect(JSON.parse(planningWrites(rec)[0].body)[0]).toMatchObject({ row_key: 'South|132x132|3.0', type: 'MTO', plants: [] })

  // A row the master already has is refused, and nothing is written for it.
  await page.getByRole('button', { name: 'Add a South line' }).click()
  await page.getByLabel('New row size').fill('50x100')
  await page.getByLabel('New row thickness').fill('2')
  await page.getByRole('button', { name: 'Add line', exact: true }).click()
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

// ── Ticket #340: the Planning master warns about orders with no line of their own ──
// 6 T of West CHS 20 NB 2.5 mm (Gujarat + Maharashtra), on a master whose West 20NB stops at 2.0,
// plus 1.5 T of 15 NB 2.5 mm, which is under the 2 T cut-off and stays quiet.
const NO_LINE_ORDERS = [
  { id: 'n1', line_id: 'n1', distributor_code: 'G1', customer: 'G1', ship_to_state: 'GUJARAT', mm_id: 'X-20NB-25', description: 'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.50x6000', quantity: 4, order_status: 'Confirmed', order_date: '2026-11-02', deleted: false },
  { id: 'n2', line_id: 'n2', distributor_code: 'G2', customer: 'G2', ship_to_state: 'MAHARASHTRA', mm_id: 'X-20NB-25', description: 'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.50x6000', quantity: 2, order_status: 'Confirmed', order_date: '2026-11-03', deleted: false },
  { id: 'n3', line_id: 'n3', distributor_code: 'G1', customer: 'G1', ship_to_state: 'GUJARAT', mm_id: 'X-15NB-25', description: 'MS CHS One Helix IS 1161 YSt 210 Black 15 NBx2.50x6000', quantity: 1.5, order_status: 'Confirmed', order_date: '2026-11-03', deleted: false },
]

test('Planning master: adding a line from the no-line warning makes its entry disappear', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { rows: { orders: NO_LINE_ORDERS }, onRequest: rec.onRequest })
  // The warning is per region on screen: South has nothing to say.
  await expect(page.getByText('Every South order of 2 T or more has a line of its own.')).toBeVisible()
  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West', exact: true }).click()
  const entry = page.getByRole('row', { name: 'West CHS 20NB 2.5' })
  await expect(entry).toBeVisible()
  await expect(entry).toContainText('the 2.0 line')
  await expect(page.getByRole('row', { name: 'West CHS 15NB 2.5' })).toHaveCount(0)   // 1.5 T: under 2 T

  // "Add a line" fills in the screen's own Add a line strip; the admin picks the plants there.
  await page.getByRole('button', { name: 'Add a line for West CHS 20NB 2.5' }).click()
  await expect(page.getByLabel('New row size')).toHaveValue('20NB')
  await expect(page.getByLabel('New row thickness')).toHaveValue('2.5')
  await expect(page.getByLabel('Hyderabad', { exact: true })).toHaveCount(0)   // only West's plants
  await page.getByLabel('NPMD', { exact: true }).check()
  await page.getByLabel('Tapi', { exact: true }).check()
  await page.getByRole('button', { name: 'Add line', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Added West 20NB 2.5.')
  await expect(entry).toHaveCount(0)
  await expect(page.getByText('Every West order of 2 T or more has a line of its own.')).toBeVisible()
  await rec.settle(page)
  const writes = planningWrites(rec)
  expect(new Set(writes.map(w => w.body)).size).toBe(1)
  expect(writes[0].url).toContain('on_conflict=row_key')
  expect(JSON.parse(writes[0].body)[0]).toMatchObject({ row_key: 'West|20NB|2.5', type: 'MTO', buffer: null, plants: ['npmd', 'tapi'], retired: false })
})

test('the no-line warning is on Production Planning only, not on the Masters tab', async ({ page }) => {
  await signIn(page, 'admin', { rows: { orders: NO_LINE_ORDERS } })
  await tab(page, 'Masters').click()
  await expect(page.getByRole('heading', { name: 'Distributor Master' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'West CHS 20NB 2.5' })).toHaveCount(0)
  await expect(page.getByText(/no line of (its|their) own/)).toHaveCount(0)
})

test('a plant login sees no no-line warning anywhere', async ({ page }) => {
  await signIn(page, 'hyderabad', { rows: { orders: NO_LINE_ORDERS } })
  await expect(tab(page, 'Production Planning')).toHaveCount(0)
  await tab(page, 'Masters').click()
  await expect(page.getByRole('heading', { name: 'Distributor Master' })).toBeVisible()
  await expect(page.getByRole('row', { name: 'West CHS 20NB 2.5' })).toHaveCount(0)
})

// ── Ticket #350: one clean table, plain words, size lines with counts ──
test('the master is one full-width table in plain words, with a size line per size', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 800 })
  await openPlanning(page)
  await expect(page.getByRole('heading', { name: 'Planning master · South' })).toBeVisible()
  await expect(page.getByText(/Lines\s*236/)).toBeVisible()
  await expect(page.getByText(/No plant can make\s*41/)).toBeVisible()

  const table = page.getByRole('table', { name: 'Planning master South' })
  const heads = (await table.locator('thead th').allInnerTexts()).map(t => t.trim()).filter(t => t && t !== 'Actions')
  expect(heads.map(t => (t === 'CAN BE MADE AT' ? 'Can be made at' : t))).toEqual(['Size', 'Thickness (mm)', 'Type', 'Buffer (T)', 'Can be made at', 'Stock now (T)', 'Check', 'Hyderabad', 'Lepakshi'])

  // A size line carries the counts; the shipped South seed has 25×25 as a size.
  await expect(table.getByRole('row', { name: /SHS 25x25 summary/ })).toContainText(/25×25 · \d+ lines?/)

  // One border, filling the content width: the table's box is the scroll box.
  const box = await table.evaluate(el => {
    const wrap = el.parentElement
    const style = getComputedStyle(wrap)
    return { tableW: el.getBoundingClientRect().width, wrapW: wrap.getBoundingClientRect().width, border: style.borderTopWidth, parentBorder: getComputedStyle(wrap.parentElement).borderTopWidth, shadow: getComputedStyle(wrap.parentElement).boxShadow }
  })
  expect(box.tableW).toBeGreaterThan(1100)
  expect(Math.abs(box.tableW - box.wrapW)).toBeLessThan(4)
  expect(box.border).toBe('1px')
  expect(box.parentBorder).toBe('0px')           // no box inside a box
  expect(box.shadow).toBe('none')

  // The words: none of the short forms, and never "hidden", anywhere on the master screen.
  const text = await page.locator('main').innerText()
  for (const bad of [/\bThk\b/, /\bMTO\b/, /\bMT\b/, /\bHyd\b/, /\bLep\b/, /\brows?\b/i, /hidden/i]) expect(text.match(new RegExp(`.{0,40}${bad.source}.{0,40}`, bad.flags))?.[0] ?? '').toBe('')
  await page.getByRole('button', { name: 'Add a South line' }).click()
  const strip = await page.locator('main').innerText()
  for (const bad of [/\bThk\b/, /\bMTO\b/, /\bMT\b/, /\brows?\b/i]) expect(strip).not.toMatch(bad)
  await page.getByLabel('Find size').fill('zzzz')
  await expect(page.locator('main')).toContainText('No size matches')
  expect(await page.locator('main').innerText()).not.toMatch(/\brows?\b/i)
  await page.screenshot({ path: 'test-results/planning-master-1366.png' })
})

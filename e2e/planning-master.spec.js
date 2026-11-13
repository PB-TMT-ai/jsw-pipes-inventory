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
  await expect(page.getByRole('status')).toHaveText('Saved')   // on that line (#352)
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
  // #351: Retired is a chip. Picked, the same table lists it with Restore where Edit was.
  const chips = page.getByRole('group', { name: 'Check' })
  await chips.getByRole('button', { name: /^Retired 1$/ }).click()
  await expect(page.getByRole('button', { name: 'Restore South 50x50 2.0' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Edit South 132x132 3.0' })).toHaveCount(0)
  await expect(page.getByText(/Show retired/)).toHaveCount(0)
})

test('Check chips: the seed counts, a zero chip reads a plain sentence, the step bar opens No plant can make', async ({ page }) => {
  await openPlanning(page)
  const chips = page.getByRole('group', { name: 'Check' })
  await expect(chips.getByRole('button', { name: /^All lines 236$/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(chips.getByRole('button', { name: /^No plant can make 41$/ })).toBeVisible()
  await expect(chips.getByRole('button', { name: /^Retired 0$/ })).toBeVisible()
  await chips.getByRole('button', { name: /^Retired 0$/ }).click()
  await expect(page.getByText('No line is retired.')).toBeVisible()
  // The step bar's count is red and opens the master with the chip picked.
  const count = page.getByRole('link', { name: '41 no plant can make' })
  await expect(count.locator('xpath=..')).toHaveClass(/text-red-700/)
  await count.click()
  await expect(chips.getByRole('button', { name: /^No plant can make 41$/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('Every line has a plant. Nothing to fix.')).toHaveCount(0)
  // The red fact opens it too.
  await chips.getByRole('button', { name: /^All lines/ }).click()
  await page.getByRole('button', { name: /^No plant can make 41$/ }).last().click()
  await expect(chips.getByRole('button', { name: /^No plant can make 41$/ })).toHaveAttribute('aria-pressed', 'true')
  // A search narrows the chip.
  await page.getByLabel('Find size').fill('50x50')
  await expect(chips.getByRole('button', { name: /^All lines \d+$/ })).not.toHaveText(/236/)
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
  await expect(page.getByRole('status')).toHaveText('Added')
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
  await expect(page.getByRole('status')).toHaveText('Added')
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
  await expect(page.getByRole('group', { name: 'Check' }).getByRole('button', { name: /^No plant can make 41$/ })).toBeVisible()

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

// ── Ticket #352: messages on the line, pinned header, phone layout ──
const lineOf = (page, name) => page.getByRole('row').filter({ has: page.getByLabel(name) })
// A South RHS 100x50 line no plant can make, so ticking one moves its size line's count.
const NO_PLANT_100x50 = [{ id: 'b1', row_key: 'South|100x50|2.0', region: 'South', size: '100x50', thickness: 2, type: 'Buffer', buffer: 40, plants: [], retired: false, deleted: false }]
const noPlantCount = async (page) => Number((await page.getByRole('row', { name: /RHS 100x50 summary/ }).innerText()).match(/(\d+) no plant can make/)?.[1] ?? 0)

test('Saved prints on the edited line, in view, and the size line counts at once', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { rows: { planning_master: NO_PLANT_100x50 }, onRequest: rec.onRequest })
  const before = await noPlantCount(page)
  expect(before).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Edit South 100x50 2.0' }).click()
  await page.getByLabel('Hyderabad can make South 100x50 2.0').check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const saved = page.getByRole('status')
  await expect(saved).toHaveText('Saved')
  await expect(saved).toBeInViewport()                         // no scrolling to find it
  await expect(page.getByRole('button', { name: 'Edit South 100x50 2.0' }).locator('xpath=ancestor::tr')).toContainText('Saved')
  expect(await noPlantCount(page)).toBe(before - 1)            // the size line, same moment
  await expect(page.locator('p[role=status]')).toHaveCount(0)  // nothing at the top
  // It fades after 4 s.
  await expect(saved).toHaveCount(0, { timeout: 7000 })
  await rec.settle(page)
  expect(planningWrites(rec).length).toBeGreaterThan(0)
})

test('a refused edit says so on its own line and writes nothing', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { onRequest: rec.onRequest })
  await page.getByRole('button', { name: 'Edit South 100x50 2.0' }).click()
  await page.getByLabel('Type of South 100x50 2.0').selectOption('Buffer')
  await page.getByLabel('Buffer of South 100x50 2.0').fill('-5')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  const alert = lineOf(page, 'Buffer of South 100x50 2.0').getByRole('alert')
  await expect(alert).toHaveText('Buffer must be blank or a number of T, 0 or more.')
  await expect(alert).toBeInViewport()
  await expect(page.getByRole('alert')).toHaveCount(1)          // not repeated at the top
  await expect(page.getByLabel('Type of South 100x50 2.0')).toBeVisible()   // still in edit mode
  await rec.settle(page)
  expect(planningWrites(rec)).toHaveLength(0)
})

test('the Add strip shows its own refusal inside the strip', async ({ page }) => {
  await openPlanning(page)
  await page.getByRole('button', { name: 'Add a South line' }).click()
  await page.getByLabel('New row size').fill('banana')
  await page.getByLabel('New row thickness').fill('2')
  await page.getByRole('button', { name: 'Add line', exact: true }).click()
  const alert = page.getByRole('alert')
  await expect(alert).toContainText('is not a size')
  await expect(page.getByLabel('New row size').locator('xpath=ancestor::div[contains(@class,"border-indigo-200")]')).toContainText('is not a size')
})

test('a new line flashes indigo for a moment and the chip stays picked; none under reduced motion', async ({ page }) => {
  await openPlanning(page)
  const chips = page.getByRole('group', { name: 'Check' })
  await page.getByRole('button', { name: 'Add a South line' }).click()
  await page.getByLabel('New row size').fill('132x132')
  await page.getByLabel('New row thickness').fill('3')
  await page.getByRole('button', { name: 'Add line', exact: true }).click()
  const row = page.getByRole('button', { name: 'Edit South 132x132 3.0' }).locator('xpath=ancestor::tr')
  await expect(row).toHaveClass(/plan-flash/)
  expect(await row.locator('td').first().evaluate(el => getComputedStyle(el).animationName)).toBe('plan-flash')
  await expect(chips.getByRole('button', { name: /^All lines/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(row).not.toHaveClass(/plan-flash/, { timeout: 3000 })

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.getByRole('button', { name: 'Add a South line' }).click()
  await page.getByLabel('New row size').fill('132x132')
  await page.getByLabel('New row thickness').fill('3.5')
  await page.getByRole('button', { name: 'Add line', exact: true }).click()
  const row2 = page.getByRole('button', { name: 'Edit South 132x132 3.5' }).locator('xpath=ancestor::tr')
  await expect(row2).toBeVisible()
  await expect(row2).not.toHaveClass(/plan-flash/)
})

test('the amber outline marks the named plant in edit mode only, and ticks nothing', async ({ page }) => {
  const rec = writeRecorder()
  const orders = [
    { id: 'o1', mm_id: RHS_100x50_2, description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x2x6000', quantity: 20, plant: 'lepakshi', order_date: '2026-10-01', deleted: false },
  ]
  await openPlanning(page, { rows: { orders }, onRequest: rec.onRequest })
  await expect(page.locator('[data-amber]')).toHaveCount(0)      // not outside edit mode
  await page.getByRole('button', { name: 'Edit South 100x50 2.0' }).click()
  const lep = page.getByLabel('Lepakshi can make South 100x50 2.0')
  await expect(lep).toHaveAttribute('data-amber', 'true')
  await expect(lep).not.toBeChecked()
  expect(await lep.evaluate(el => getComputedStyle(el).outlineColor)).toBe('rgb(245, 158, 11)')
  await expect(page.getByLabel('Hyderabad can make South 100x50 2.0')).not.toHaveAttribute('data-amber', 'true')
  await expect(page.locator('[data-amber]')).toHaveCount(1)
  await page.getByRole('button', { name: 'Cancel', exact: true }).click()
  await expect(page.locator('[data-amber]')).toHaveCount(0)
  await rec.settle(page)
  expect(planningWrites(rec)).toHaveLength(0)
})

test('keyboard: Enter on Edit focuses Type, Escape cancels, Save returns focus to Edit', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { onRequest: rec.onRequest })
  const edit = page.getByRole('button', { name: 'Edit South 100x50 2.0' })
  await edit.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByLabel('Type of South 100x50 2.0')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByLabel('Type of South 100x50 2.0')).toHaveCount(0)
  await expect(edit).toBeFocused()
  await rec.settle(page)
  expect(planningWrites(rec)).toHaveLength(0)

  await page.keyboard.press('Enter')
  await page.getByLabel('Lepakshi can make South 100x50 2.0').check()
  await page.getByRole('button', { name: 'Save', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('status')).toHaveText('Saved')
  await expect(edit).toBeFocused()
})

test('phone 390 px: Edit is reachable and 44 px, the header and Size stay pinned, Retire is inside edit mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openPlanning(page)
  const edit = page.getByRole('button', { name: /^Edit South / }).first()
  await expect(edit).toBeInViewport()
  const b = await edit.boundingBox()
  expect(b.height).toBeGreaterThanOrEqual(44)
  expect(b.width).toBeGreaterThanOrEqual(44)
  // The table box fits the phone and scrolls inside itself, so Edit needs no sideways scroll. (The step bar
  // above it is wider than 390 px — that is the tab's header, outside this ticket, noted on the PR.)
  const fit = await page.getByRole('table', { name: 'Planning master South' }).locator('xpath=..').boundingBox()
  expect(fit.x + fit.width).toBeLessThanOrEqual(391)
  await expect(page.getByRole('button', { name: /^Retire South / }).first()).toBeHidden()

  // The table scrolls inside its own box; the header row and the Size column stay in place.
  const table = page.getByRole('table', { name: 'Planning master South' })
  const box = table.locator('xpath=..')
  await box.evaluate(el => { el.scrollTop = 600; el.scrollLeft = 150 })
  const head = await table.locator('thead th', { hasText: /^Size$/ }).boundingBox()
  const boxRect = await box.boundingBox()
  expect(head.y).toBeLessThanOrEqual(boxRect.y + 2)
  expect(head.y).toBeGreaterThanOrEqual(boxRect.y - 2)
  expect(Math.abs(head.x - boxRect.x)).toBeLessThan(4)       // Size column pinned left
  const editNow = await page.getByRole('button', { name: /^Edit South / }).evaluateAll(els => els.map(e => e.getBoundingClientRect().right))
  expect(Math.min(...editNow)).toBeLessThanOrEqual(boxRect.x + boxRect.width + 1)   // Edit column pinned right
  // Scrolled down and sideways, an Edit button is still inside the box, in view: no sideways hunt for it.
  const seen = await page.getByRole('button', { name: /^Edit South / }).evaluateAll((els, r) => els.some(e => {
    const q = e.getBoundingClientRect()
    return q.left >= r.x - 1 && q.right <= r.x + r.width + 1 && q.top >= r.y + 20 && q.bottom <= r.y + r.height + 1
  }), boxRect)
  expect(seen).toBe(true)

  // Edit mode on a phone carries Retire.
  await page.getByRole('button', { name: /^Edit South / }).nth(2).click()
  await expect(page.getByRole('button', { name: /^Retire South / })).toBeVisible()
  const save = await page.getByRole('button', { name: 'Save', exact: true }).boundingBox()
  expect(save.height).toBeGreaterThanOrEqual(44)
})

test('banned words: none on the Retired chip view either', async ({ page }) => {
  const stored = [{ id: 'a3', row_key: 'South|50x50|2.0', region: 'South', size: '50x50', thickness: 2, type: 'Buffer', buffer: 100, plants: ['hyderabad'], retired: true, deleted: false }]
  await openPlanning(page, { rows: { planning_master: stored } })
  await page.getByRole('group', { name: 'Check' }).getByRole('button', { name: /^Retired 1$/ }).click()
  await expect(page.getByRole('button', { name: 'Restore South 50x50 2.0' })).toBeVisible()
  const text = await page.locator('main').innerText()
  for (const bad of [/\bThk\b/, /\bMTO\b/, /\bMT\b/, /\bHyd\b/, /\bLep\b/, /\brows?\b/i, /hidden/i]) expect(text).not.toMatch(bad)
  await page.getByRole('group', { name: 'Check' }).getByRole('button', { name: /^Retired 1$/ }).click()
  await page.getByRole('group', { name: 'Check' }).getByRole('button', { name: /^All lines/ }).click()
  await page.getByRole('group', { name: 'Check' }).getByRole('button', { name: /^Retired 1$/ }).click()
  await page.getByRole('button', { name: 'Restore South 50x50 2.0' }).click()
  const after = await page.locator('main').innerText()
  expect(after).not.toMatch(/hidden/i)
})

// ── Ticket #353: "Not made in South" ──
test('Edit SHS 25x25 5.0, tick Not made in South, Save: grey on the line, chip and step-bar counts drop by 1', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { onRequest: rec.onRequest })
  const chip = page.getByRole('group', { name: 'Check' }).getByRole('button', { name: /^No plant can make 41$/ })
  await expect(chip).toBeVisible()
  await expect(page.getByRole('link', { name: '41 no plant can make' })).toBeVisible()   // the step bar

  await page.getByRole('button', { name: 'Edit South 25x25 5.0' }).click()
  const box = page.getByLabel('Not made in South')
  await expect(box).toBeVisible()
  // Ticking a plant takes the box away (and clears it); unticking brings it back unticked.
  await page.getByLabel('Hyderabad can make South 25x25 5.0').check()
  await expect(box).toHaveCount(0)
  await page.getByLabel('Hyderabad can make South 25x25 5.0').uncheck()
  await expect(box).not.toBeChecked()
  await box.check()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')

  const row = page.locator('tr[data-line="South|25x25|5.0"]')
  const grey = row.getByText('Not made in South', { exact: true })
  await expect(grey).toBeVisible()
  await expect(grey).toHaveClass(/text-slate-500/)                  // grey, not red
  await expect(row.getByText('No plant can make')).toHaveCount(0)
  await expect(page.getByRole('group', { name: 'Check' }).getByRole('button', { name: /^No plant can make 40$/ })).toBeVisible()
  await expect(page.getByRole('link', { name: '40 no plant can make' })).toBeVisible()
  await expect(page.getByRole('row', { name: /SHS 25x25 summary/ })).toContainText('1 not made in South')

  await rec.settle(page)
  const [body] = JSON.parse(planningWrites(rec)[0].body)
  expect(body).toMatchObject({ row_key: 'South|25x25|5.0', plants: [], not_made: true })
})

// #354 — the database refuses a master write. The store re-reads (the edit disappears) and the app
// banner shows, as for every table; the line itself now says which edit was lost.
test('a refused save puts the old values back and says Not saved on that line, with the app banner', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { onRequest: rec.onRequest })
  // Registered after the stub, so it runs first; anything else falls through to the stub.
  await page.route('**/rest/v1/planning_master*', route => route.request().method() === 'POST'
    ? route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST204', message: 'refused for the test' }) })
    : route.fallback())

  const line = page.locator('tr[data-line="South|100x50|2.0"]')
  await page.getByRole('button', { name: 'Edit South 100x50 2.0' }).click()
  await page.getByLabel('Type of South 100x50 2.0').selectOption('Buffer')
  await page.getByLabel('Buffer of South 100x50 2.0').fill('40')
  await page.getByRole('button', { name: 'Save', exact: true }).click()

  const alert = line.getByRole('alert')
  await expect(alert).toHaveText('Not saved: changed back. Check the connection and Edit again')
  await expect(alert).toHaveClass(/text-red-700/)
  await expect(line.getByRole('status')).toHaveCount(0)                       // *Saved* is replaced, not kept
  await expect(page.getByText('Sync failed (Planning master)')).toBeVisible() // the shared banner still shows
  // The re-read put the seed's old values back on the line.
  await page.getByRole('button', { name: 'Edit South 100x50 2.0' }).click()
  await expect(page.getByLabel('Buffer of South 100x50 2.0')).not.toHaveValue('40')
})

test('a successful save shows Saved and never Not saved', async ({ page }) => {
  const rec = writeRecorder()
  await openPlanning(page, { onRequest: rec.onRequest })
  await page.getByRole('button', { name: 'Edit South 100x50 2.0' }).click()
  await page.getByLabel('Type of South 100x50 2.0').selectOption('Buffer')
  await page.getByLabel('Buffer of South 100x50 2.0').fill('40')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status')).toHaveText('Saved')
  await rec.settle(page)
  await expect(page.getByText(/Not saved/)).toHaveCount(0)
  await expect(page.getByText(/Sync failed/)).toHaveCount(0)
})

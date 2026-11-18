import { test, expect } from '@playwright/test'
import { signIn } from './signin.js'

// ── Sales tab, FM / MM / SM sub-tab, By FM / MM / SM tab (#381) ─────────────────────────────────────
// The split is calc's (`fmMmSmTagSections`, unit-tested in src/lib/fm-mm-sm-by-tag.test.js). What only a
// browser answers: the sections are this tab's grid (stacked, in order), All measures draws the five
// figures, No sales drops days and rate but keeps orders, the sections add up to the region's grid, and
// the header plant selector moves no tag or count. Rows are invented.
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const SHS_50x50_16 = '1139-13064-10059417'    // DEFAULT_SKUS: MS SHS … 50x50x1.60x6000 — sells in both regions
const SHS_40x40_20 = '1139-13064-10059410'    // MS SHS … 40x40x2.00 — on order in South, never invoiced → No sales
const now = new Date()
const monthDay = (back, day) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10)
const entry = (weight, plant) => ({ skuCode: SHS_50x50_16, weight, pieces: 1, plant })
const order = (i, plant, code, customer, state, sku, confirmed) => ({ id: `seed-o${i}`, line_id: `L-o${i}`, plant, distributor_code: code,
  customer, ship_to_state: state, order_status: '', order_date: monthDay(0, 1), mm_id: sku,
  confirmed, non_confirmed: 0, invoiced_qty: 0, deleted: false })
const rows = {
  productions: [
    { id: 'p1', sku_code: SHS_50x50_16, total_weight: 0, tube_count: 6000, plant: 'hyderabad', date_of_production: monthDay(2, 3), deleted: false },
    { id: 'p2', sku_code: SHS_50x50_16, total_weight: 0, tube_count: 2000, plant: 'npmd', date_of_production: monthDay(2, 3), deleted: false },
  ],
  dispatches: [
    { id: 'd1', invoice_no: 'INV-1', date_of_dispatch: monthDay(1, 10), deleted: false, bundle_entries: [entry(29.6, 'hyderabad')] },
    { id: 'd2', invoice_no: 'INV-2', date_of_dispatch: monthDay(1, 12), deleted: false, bundle_entries: [entry(21.9, 'npmd')] },
  ],
  orders: [
    order(1, 'hyderabad', 'D-S1', 'SOUTH ONE', 'TELANGANA', SHS_50x50_16, 5),
    order(2, 'npmd', 'D-W1', 'WEST ONE', 'MAHARASHTRA', SHS_50x50_16, 3),
    order(3, 'hyderabad', 'D-S1', 'SOUTH ONE', 'TELANGANA', SHS_40x40_20, 4),
  ],
}

const strip = (page) => page.getByRole('group', { name: 'Sales view' })
const block = (page, region) => page.getByRole('region', { name: `${region} block` })
const openBy = async (page) => {
  await tab(page, 'Sales').click()
  await strip(page).getByRole('button', { name: 'FM / MM / SM', exact: true }).click()
  await page.getByRole('group', { name: 'FM / MM / SM tabs' }).getByRole('button', { name: 'By FM / MM / SM', exact: true }).click()
  await expect(block(page, 'South')).toBeVisible()
}
const sectionTable = (page, region, label) => block(page, region).getByRole('table', { name: `Sales by size and thickness · ${region} · ${label}`, exact: true })
const headers = (table) => table.locator('thead tr').nth(1).locator('th').allInnerTexts()
const totalRow = (table) => table.locator('tbody tr').last().locator('td').allInnerTexts()

test('the By tab’s grid is the four tag sections and Not tagged / Outside the plan, stacked, in each region', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  for (const region of ['South', 'West']) {
    const order = await block(page, region).locator('[data-fm-mm-sm-section]').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
    expect(order).toEqual(['FM', 'MM', 'SM', 'No sales', 'Not tagged / Outside the plan'].map(l => `${l} · ${region}`))
    // the single tagged grid is replaced, not drawn as well
    await expect(block(page, region).getByRole('table', { name: `Sales by size and thickness · ${region}`, exact: true })).toHaveCount(0)
    // stacked: each section starts below the one before
    const tops = await block(page, region).locator('[data-fm-mm-sm-section]').evaluateAll(els => els.map(e => e.getBoundingClientRect().top))
    tops.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(tops[i]))
  }
  // SHS 50x50 1.6 sells: it is in South's FM section with its days and tag; the 40x40 on order is No sales
  const fm = sectionTable(page, 'South', 'FM')
  await expect(fm.locator('tbody tr', { hasText: '50×50' })).toHaveCount(1)
  expect((await fm.locator('tbody tr', { hasText: '50×50' }).locator('td').allInnerTexts())[2]).toMatch(/^\d+ d FM$/)
  await expect(sectionTable(page, 'South', 'No sales').locator('tbody tr', { hasText: '40×40' })).toHaveCount(1)
  // Back on Status key, the single tagged grid is back
  await page.getByRole('group', { name: 'FM / MM / SM tabs' }).getByRole('button', { name: 'Status key', exact: true }).click()
  await expect(block(page, 'South').getByRole('table', { name: 'Sales by size and thickness · South', exact: true })).toBeVisible()
  await expect(block(page, 'South').getByRole('button', { name: 'All measures', exact: true })).toHaveCount(0)
})

test('All measures: FG days of cover, Blended monthly rate, Current inventory, Pending to Dispatch, Production required — No sales drops days and rate', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  const b = block(page, 'South')
  await b.getByRole('button', { name: 'All measures', exact: true }).click()
  await expect(b.getByRole('button', { name: 'All measures', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const fmHead = await headers(sectionTable(page, 'South', 'FM'))
  expect(fmHead.slice(0, 5)).toEqual(['FG days of cover · FM / MM / SM', 'Blended monthly rate', 'Current inventory', 'Pending to Dispatch', 'Production required'])
  const nsHead = await headers(sectionTable(page, 'South', 'No sales'))
  expect(nsHead.slice(0, 3)).toEqual(['Current inventory', 'Pending to Dispatch', 'Production required'])
  expect(nsHead.join('|')).not.toMatch(/FG days of cover|Blended monthly rate/)
  // No sales keeps its orders: 4 T of 40x40 on order, nothing in stock → 4 T required
  const ns = sectionTable(page, 'South', 'No sales')
  const total = await totalRow(ns)
  expect(total.slice(-3)).toEqual(['', '4.0', '4.0'])
  await expect(b.getByText(/^\d+ SKUs? · \d+ on the grid.*no days of cover or rate/)).toBeVisible()
  // FM's rate and inventory are figures, not blank
  const fmTotal = await totalRow(sectionTable(page, 'South', 'FM'))
  expect(Number(fmTotal.at(-4))).toBeGreaterThan(0)
  expect(Number(fmTotal.at(-3))).toBeGreaterThan(0)
})

test('the sections add up to the region’s grid total, as the Tagged and not tagged table reads it', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  for (const region of ['South', 'West']) {
    const b = block(page, region)
    const grid = await b.getByRole('table', { name: `Tagged and not tagged · ${region}` }).locator('tbody tr').last().locator('td').allInnerTexts()
    const sums = [0, 0, 0]
    for (const s of await b.locator('[data-fm-mm-sm-section]').all()) {
      const t = s.getByRole('table')
      if (!await t.count()) continue
      // FM / MM / SM view: Total = Closing, Dispatch, Pending to Dispatch, Production required
      const cells = (await totalRow(t)).slice(-4, -1)
      cells.forEach((v, i) => { sums[i] += Number(v || 0) })
    }
    ;[1, 2, 3].forEach(i => expect(sums[i - 1]).toBeCloseTo(Number(grid[i] || 0), 1))
  }
})

test('the header plant selector narrows the sections’ figures but moves no tag and no count', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  const heads = () => block(page, 'West').locator('[data-fm-mm-sm-section] h4 + span').allInnerTexts()
  const counts = (texts) => texts.map(t => t.match(/^(\d+) SKUs?/)?.[1] ?? t)
  const before = await heads()
  const westTag = (await sectionTable(page, 'West', 'FM').locator('tbody tr', { hasText: '50×50' }).locator('td').allInnerTexts())[2]
  await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'NPMD' })
  await expect(block(page, 'South').getByText(/NPMD does not serve South/)).toBeVisible()
  expect(counts(await heads())).toEqual(counts(before))
  expect((await sectionTable(page, 'West', 'FM').locator('tbody tr', { hasText: '50×50' }).locator('td').allInnerTexts())[2]).toBe(westTag)
  // South has nothing at NPMD: its FM SKU is still counted, now off the grid
  await expect(block(page, 'South').locator('[data-fm-mm-sm-section="FM"]')).toContainText(/1 SKU · 0 on the grid, 1 in SKUs not shown in the grid/)
})

test('at 1366 × 768 the sections fit the width and every tag cell prints its number and tag', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await signIn(page, 'admin', { rows })
  await openBy(page)
  await block(page, 'South').getByRole('button', { name: 'All measures', exact: true }).click()
  const tags = block(page, 'South').locator('[data-fm-mm-sm-cell="days"]')
  expect(await tags.count()).toBeGreaterThan(0)
  for (const t of await tags.all()) {
    await expect(t).toHaveText(/^\d+ d (FM|MM|SM)$/)
    expect(await t.evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(120)
  }
  // no page-wide horizontal scroll: the sections scroll inside their own box
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await block(page, 'South').locator('[data-fm-mm-sm-section="FM"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: process.env.SHOT_381 || 'test-results/fm-mm-sm-by-tag-1366.png', fullPage: false })
})

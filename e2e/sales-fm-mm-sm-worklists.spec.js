import { test, expect } from '@playwright/test'
import { signIn } from './signin.js'

// ── Sales tab, FM / MM / SM sub-tab: Make next · Stock stuck (#380) ─────────────────────────────────────
// Membership, order, the No stock marker and the section totals are calc's (`fmMmSmWorklists`, unit-tested in
// src/lib/fm-mm-sm-worklists.test.js). What only a browser answers: the lists sit in each region block, never
// mixed; the marker shows; the Priority / Size switch is there per section; a SKU clicked is found in that
// block's grid. Rows are invented: SHS 50x50 1.6 sells in the South with nothing in stock there (Make next,
// marked No stock) and sits in stock at NPMD with no West sales (Stock stuck, No use).
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const SHS_50x50_16 = '1139-13064-10059417'    // DEFAULT_SKUS: MS SHS … 50x50x1.60x6000
const now = new Date()
const monthDay = (back, day) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10)
const rows = {
  productions: [
    { id: 'p2', sku_code: SHS_50x50_16, total_weight: 0, tube_count: 2000, plant: 'npmd', date_of_production: monthDay(2, 3), deleted: false },
  ],
  dispatches: [
    { id: 'd1', invoice_no: 'INV-1', date_of_dispatch: monthDay(1, 10), deleted: false,
      bundle_entries: [{ skuCode: SHS_50x50_16, weight: 29.6, pieces: 1, plant: 'hyderabad' }] },
  ],
  orders: [{ id: 'seed-o1', line_id: 'L-o1', plant: 'hyderabad', distributor_code: 'D-S1', customer: 'SOUTH ONE', ship_to_state: 'TELANGANA',
    order_status: '', order_date: monthDay(0, 1), mm_id: SHS_50x50_16, confirmed: 5, non_confirmed: 0, invoiced_qty: 0, deleted: false }],
}
const block = (page, region) => page.getByRole('region', { name: `${region} block` })
const list = (page, region, name) => block(page, region).getByRole('table', { name: `${name} · ${region}` })
const openLists = async (page) => {
  await signIn(page, 'admin', { rows })
  await tab(page, 'Sales').click()
  await page.getByRole('group', { name: 'Sales view' }).getByRole('button', { name: 'FM / MM / SM', exact: true }).click()
  await page.getByRole('group', { name: 'FM / MM / SM tabs' }).getByRole('button', { name: 'Make next · Stock stuck', exact: true }).click()
  await expect(block(page, 'South')).toBeVisible()
}

test('each region block carries its own Make next and Stock stuck, above its grid; Status key does not', async ({ page }) => {
  await openLists(page)
  await expect(page.getByText(/built in a later ticket/)).toHaveCount(0)
  // South: sales and no stock → Make next, Running out · 0 d, marked No stock
  const southNext = list(page, 'South', 'Make next')
  const row = southNext.locator('tr[data-sku="South|50x50|1.6"]')
  await expect(row).toContainText('SHS 50×50 · 1.6 mm')
  await expect(row).toContainText('Running out · 0 d')
  await expect(row.locator('[data-no-stock]')).toHaveText('No stock')
  await expect(block(page, 'South').getByRole('region', { name: 'Stock stuck · South' })).toContainText('No SKU of South')
  // West: stock, no sales → Stock stuck, No use group; nothing in Make next; never the South row
  const westStuck = list(page, 'West', 'Stock stuck')
  await expect(westStuck).toContainText('No use — 1 SKUs')
  await expect(westStuck.locator('tr[data-sku="West|50x50|1.6"]')).toContainText('No use')
  await expect(westStuck.locator('[data-no-stock]')).toHaveCount(0)
  await expect(block(page, 'West').getByRole('region', { name: 'Make next · West' })).toContainText('No SKU of West')
  await expect(block(page, 'West').locator('tr[data-sku^="South|"]')).toHaveCount(0)
  // The list comes before the grid in the block
  const before = await block(page, 'South').evaluate(b => {
    const l = b.querySelector('table[aria-label="Make next · South"]'), g = b.querySelector('table[aria-label="Sales by size and thickness · South"]')
    return !!(l && g && (l.compareDocumentPosition(g) & Node.DOCUMENT_POSITION_FOLLOWING))
  })
  expect(before).toBe(true)
  // No Export on this tab either
  await expect(page.getByRole('button', { name: /CSV|Export/ })).toHaveCount(0)
  // Back on Status key the lists are gone
  await page.getByRole('group', { name: 'FM / MM / SM tabs' }).getByRole('button', { name: 'Status key', exact: true }).click()
  await expect(page.getByRole('table', { name: 'Make next · South' })).toHaveCount(0)
})

test('a section heading carries its SKU count and tonnes, and a Priority / Size switch that keeps the rows', async ({ page }) => {
  await openLists(page)
  const westStuck = list(page, 'West', 'Stock stuck')
  const sw = westStuck.getByRole('group', { name: 'Stock stuck No use SHS order' })
  await expect(sw.getByRole('button', { name: 'Priority' })).toHaveAttribute('aria-pressed', 'true')
  await sw.getByRole('button', { name: 'Size' }).click()
  await expect(sw.getByRole('button', { name: 'Size' })).toHaveAttribute('aria-pressed', 'true')
  await expect(westStuck.locator('tr[data-sku]')).toHaveCount(1)
  await expect(westStuck.getByTestId('worklist-section')).toContainText('SHS — 1 SKUs')
})

test('clicking a SKU finds it in the same block’s grid, switching back to Size × Thickness', async ({ page }) => {
  await openLists(page)
  const west = block(page, 'West')
  await west.getByRole('button', { name: 'Production check', exact: true }).click()
  await expect(west.getByRole('table', { name: 'Sales by size and thickness · West' })).toHaveCount(0)
  await list(page, 'West', 'Stock stuck').getByRole('button', { name: 'SHS 50×50 · 1.6 mm' }).click()
  await expect(west.getByRole('button', { name: 'Size × Thickness', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const cell = west.locator('td[data-cell-key="SHS|50x50|1.6"]')
  await expect(cell).toHaveAttribute('data-found', 'true')
  await expect(cell).toBeInViewport()
  // Only the West grid is ringed
  await expect(block(page, 'South').locator('td[data-found]')).toHaveCount(0)
})

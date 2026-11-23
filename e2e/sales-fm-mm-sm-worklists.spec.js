import { test, expect } from '@playwright/test'
import { signIn, openDashboard } from './signin.js'

// ── Dashboards › FM / MM / SM › Worklists: Make next and Stock stuck (#380; ADR-0018) ────────────────────
// Membership, order, the No stock marker and the section totals are calc's (`fmMmSmWorklists`, unit-tested in
// src/lib/fm-mm-sm-worklists.test.js). What only a browser answers: the lists sit in each region block, never
// mixed; the marker shows; the Priority / Size switch is there per section; a SKU clicked opens Overview with
// its cell found in that block's grid. Rows are invented: SHS 50x50 1.6 sells in the South with nothing in stock there (Make next,
// marked No stock) and sits in stock at NPMD with no West sales (Stock stuck, No use).
const screen = (page, name) => page.getByRole('tablist', { name: 'FM / MM / SM screens' }).getByRole('tab', { name, exact: true })
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
// #389: one region block is shown at a time; a spec that reads the other region switches to it first.
const showRegion = (page, region) => page.getByRole('group', { name: 'Region', exact: true }).getByRole('button', { name: region, exact: true }).click()
const list = (page, region, name) => block(page, region).getByRole('table', { name: `${name} · ${region}` })
const openLists = async (page) => {
  await signIn(page, 'admin', { rows })
  await openDashboard(page, 'FM / MM / SM', 'Worklists')
  await expect(block(page, 'South')).toBeVisible()
}

test('each region block carries its own Make next and Stock stuck, and no grid; Overview does not', async ({ page }) => {
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
  await showRegion(page, 'West')
  const westStuck = list(page, 'West', 'Stock stuck')
  await expect(westStuck).toContainText('No use — 1 SKUs')
  await expect(westStuck.locator('tr[data-sku="West|50x50|1.6"]')).toContainText('No use')
  await expect(westStuck.locator('[data-no-stock]')).toHaveCount(0)
  await expect(block(page, 'West').getByRole('region', { name: 'Make next · West' })).toContainText('No SKU of West')
  await expect(block(page, 'West').locator('tr[data-sku^="South|"]')).toHaveCount(0)
  // Worklists is the lists only (ADR-0018): the grid is drawn on Overview
  await showRegion(page, 'South')
  await expect(block(page, 'South').getByRole('heading', { name: 'Worklists · South' })).toBeVisible()
  await expect(block(page, 'South').getByRole('table', { name: 'Sales by size and thickness · South' })).toHaveCount(0)
  // No Export on this screen either
  await expect(page.getByRole('button', { name: /CSV|Export/ })).toHaveCount(0)
  // On Overview the lists are gone and the grid is back
  await screen(page, 'Overview').click()
  await expect(page.getByRole('table', { name: 'Make next · South' })).toHaveCount(0)
  await expect(block(page, 'South').getByRole('table', { name: 'Sales by size and thickness · South' })).toBeVisible()
})

test('a section heading carries its SKU count and tonnes, and a Priority / Size switch that keeps the rows', async ({ page }) => {
  await openLists(page)
  await showRegion(page, 'West')
  const westStuck = list(page, 'West', 'Stock stuck')
  const sw = westStuck.getByRole('group', { name: 'Stock stuck No use SHS order' })
  await expect(sw.getByRole('button', { name: 'Priority' })).toHaveAttribute('aria-pressed', 'true')
  await sw.getByRole('button', { name: 'Size' }).click()
  await expect(sw.getByRole('button', { name: 'Size' })).toHaveAttribute('aria-pressed', 'true')
  await expect(westStuck.locator('tr[data-sku]')).toHaveCount(1)
  await expect(westStuck.getByTestId('worklist-section')).toContainText('SHS — 1 SKUs')
})

test('clicking a SKU opens Overview and finds it in the same block’s grid', async ({ page }) => {
  await openLists(page)
  await showRegion(page, 'West')
  const west = block(page, 'West')
  await expect(west.getByRole('table', { name: 'Sales by size and thickness · West' })).toHaveCount(0)
  await list(page, 'West', 'Stock stuck').getByRole('button', { name: 'SHS 50×50 · 1.6 mm' }).click()
  await expect(screen(page, 'Overview')).toHaveAttribute('aria-selected', 'true')
  await expect(west).toBeVisible()
  await expect(west.getByRole('table', { name: 'Sales by size and thickness · West' })).toBeVisible()
  const cell = west.locator('td[data-cell-key="SHS|50x50|1.6"]')
  await expect(cell).toHaveAttribute('data-found', 'true')
  await expect(cell).toBeInViewport()
  // Only the West grid is ringed
  await showRegion(page, 'South')
  await expect(block(page, 'South').locator('td[data-found]')).toHaveCount(0)
})

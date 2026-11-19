import { test, expect } from '@playwright/test'
import { signIn } from './signin.js'

// ── Sales tab, FM / MM / SM sub-tab: Raw material available and required (#382) ─────────────────────────
// The split is calc's (`fmMmSmRawMaterial`, unit-tested on the frozen invented fixture). What only a browser
// answers: the chip's two measures per cell in each block, the shared-cell mark and its hover, the by-plant
// table, the two Make next columns, the visible "plant confirmed" note, and that West never sees a
// South plant's coil. Rows are invented. South orders 5 T of SHS 50×50 1.6 and 3 T of RHS 60×40 1.6 with no
// South stock, so Production required is 5 and 3. Hyderabad (South) holds one 196 mm 1.6 mm slit coil of 4 T,
// which fits both (strip 196 mm): split 4 × 5/8 = 2.5 and 4 × 3/8 = 1.5, so 2.5 and 1.5 T still required.
// NPMD (West) holds the same coil at 6 T: never South's.
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const SHS_50x50_16 = '1139-13064-10059417'    // DEFAULT_SKUS: MS SHS … 50x50x1.60x6000
const RHS_60x40_16 = '1140-13075-10059474'    // DEFAULT_SKUS: MS RHS … 60x40x1.60x6000
const now = new Date()
const monthDay = (back, day) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10)
const order = (i, sku, t) => ({ id: `seed-o${i}`, line_id: `L-o${i}`, plant: 'hyderabad', distributor_code: 'D-S1', customer: 'SOUTH ONE',
  ship_to_state: 'TELANGANA', order_status: '', order_date: monthDay(0, 1), mm_id: sku, confirmed: t, non_confirmed: 0, invoiced_qty: 0, deleted: false })
const hrCoil = (id, plant, w) => ({ id: `seed-${id}`, hr_coil_id: id, plant, date_of_inward: monthDay(1, 1), thickness: 1.6, width: 1250, actual_weight: w, deleted: false })
const slit = (id, hr, plant, w) => ({ id: `seed-${id}`, baby_coil_id: id, hr_coil_id: hr, plant, date_of_conversion: monthDay(1, 2),
  thickness: 1.6, width: 196, weight: w, baby_coil_entry: 'A', deleted: false })
const rows = {
  dispatches: [
    { id: 'd1', invoice_no: 'INV-1', date_of_dispatch: monthDay(1, 10), deleted: false,
      bundle_entries: [{ skuCode: SHS_50x50_16, weight: 29.6, pieces: 1, plant: 'hyderabad' }] },
  ],
  orders: [order(1, SHS_50x50_16, 5), order(2, RHS_60x40_16, 3)],
  coils: [hrCoil('H-HYD16', 'hyderabad', 4), hrCoil('H-NPM16', 'npmd', 6)],
  baby_coils: [slit('H-HYD16-A', 'H-HYD16', 'hyderabad', 4), slit('H-NPM16-A', 'H-NPM16', 'npmd', 6)],
}
const block = (page, region) => page.getByRole('region', { name: `${region} block` })
// #389: one region block is shown at a time; a spec that reads the other region switches to it first.
const showRegion = (page, region) => page.getByRole('group', { name: 'Region', exact: true }).getByRole('button', { name: region, exact: true }).click()
const open = async (page, inner = 'Status key') => {
  await signIn(page, 'admin', { rows })
  await tab(page, 'Sales').click()
  await page.getByRole('group', { name: 'Sales view' }).getByRole('button', { name: 'FM / MM / SM', exact: true }).click()
  await page.getByRole('group', { name: 'FM / MM / SM tabs' }).getByRole('button', { name: inner, exact: true }).click()
  await expect(block(page, 'South')).toBeVisible()
}
const cellTexts = (grid, size) => grid.locator('tbody tr', { hasText: size }).first().locator('td').allInnerTexts()

test('the Raw material chip shows Production required, Raw material available and required per cell, split', async ({ page }) => {
  await open(page)
  const south = block(page, 'South')
  await south.getByRole('button', { name: 'Raw material', exact: true }).click()
  const grid = south.getByRole('table', { name: 'Raw material by size and thickness · South' })
  await expect(grid.locator('thead')).toContainText('Raw material available')
  // #393: 11 px grid text, 10 px heads
  expect(await grid.evaluate(el => [getComputedStyle(el.querySelector('tbody td')).fontSize, getComputedStyle(el.querySelector('thead th')).fontSize])).toEqual(['11px', '10px'])
  await expect(grid.locator('thead')).toContainText('Raw material required')
  // Section, Size, then 1.6 mm: tag, Production required, Raw material available, Raw material required
  expect((await cellTexts(grid, '50×50')).slice(3, 6)).toEqual(['5.0', '2.5', '2.5'])
  expect((await cellTexts(grid, '60×40')).slice(3, 6)).toEqual(['3.0', '1.5', '1.5'])
  // Counted once: the cells add up to the 4 T coil, not 8
  const total = await grid.locator('tbody tr', { hasText: 'Total' }).last().locator('td').allInnerTexts()
  expect(total.slice(-3)).toEqual(['8.0', '4.0', '4.0'])
  // The shared mark: dotted underline, hover names the other size and the plant
  const shared = grid.locator('[data-raw-shared="true"]')
  await expect(shared).toHaveCount(2)
  await expect(shared.first()).toHaveAttribute('title', /Hyderabad/)
  await expect(shared.first()).toHaveAttribute('title', /50×50, 60×40/)
  // The visible note
  await expect(south.getByText(/plant confirmed this method/)).toBeVisible()
  await expect(page.getByText(/has not confirmed/)).toHaveCount(0)
  await expect(south.getByText(/ignores yield loss from coil to tube/).first()).toBeVisible()
  // The Dashboard's figure is named apart: no "Slit coil that fits" block on this chip
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits' })).toHaveCount(0)
})

test('Raw material by plant: HR coil, slit coil that fits, fits no size, off the grid; West never sees a South plant', async ({ page }) => {
  await open(page)
  await block(page, 'South').getByRole('button', { name: 'Raw material', exact: true }).click()
  const southPlants = block(page, 'South').getByRole('table', { name: 'Raw material by plant · South' })
  await expect(southPlants.locator('tbody tr', { hasText: 'Hyderabad' })).toContainText('4.0')
  await expect(southPlants).not.toContainText('NPMD')
  await showRegion(page, 'West')
  await block(page, 'West').getByRole('button', { name: 'Raw material', exact: true }).click()
  const westPlants = block(page, 'West').getByRole('table', { name: 'Raw material by plant · West' })
  await expect(westPlants).not.toContainText('Hyderabad')
  // NPMD's 196 mm coil fits only sizes off West's grid (West has no orders): off the grid, never in a cell
  const npmd = await westPlants.locator('tbody tr', { hasText: 'NPMD' }).first().locator('td').allInnerTexts()
  expect(npmd).toEqual(['NPMD', '', '', '', '6.0', '6.0'])
})

test('Make next carries Raw material available and required for the SKU’s cell', async ({ page }) => {
  await open(page, 'Make next · Stock stuck')
  const list = block(page, 'South').getByRole('table', { name: 'Make next · South' })
  await expect(list.locator('thead')).toContainText('Raw material available (T)')
  await expect(list.locator('thead')).toContainText('Raw material required (T)')
  const row = await list.locator('tr[data-sku="South|50x50|1.6"] td').allInnerTexts()
  expect(row.slice(-2)).toEqual(['2.5', '2.5'])
})

test('the Sales Dashboard’s Raw material chip is unchanged: the shared coil sits in both sizes', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await tab(page, 'Sales').click()
  await page.getByRole('button', { name: 'Raw material', exact: true }).click()
  const grid = page.getByRole('table', { name: 'Sales by size and thickness' })
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits · Hyderabad' })).toBeVisible()
  await expect(grid.locator('thead th', { hasText: 'Raw material available' })).toHaveCount(0)
})

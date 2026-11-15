import { test, expect } from '@playwright/test'
import { signIn } from './signin.js'

// ── Sales tab, Size × Thickness: standard thicknesses and its own Plant filter ───────────────────
// SHS 38x38 in five catalogue thicknesses (DEFAULT_SKUS codes, so tonnage is re-derived from the
// SKU master on load). On screen they must read as two standard columns, 2.0 and 3.0 — never 2.2,
// 2.8, 2.9 or 3.2 — and the Plant filter must narrow every figure to the picked plant.
const today = new Date().toISOString().slice(0, 10)
const lastMonth = (() => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 10) })()
const SHS38 = {
  '2': '1139-13064-10059404', '2.2': '1139-13064-10059405', '2.8': '1139-13064-10071617',
  '2.9': '1139-13064-10059406', '3.2': '1139-13064-10074092',
}
const prod = (id, thk, tubes, plant, date) => ({ id, sku_code: SHS38[thk], tube_count: tubes, plant, date_of_production: date })
const rows = {
  productions: [
    prod('p1', '2', 1000, 'hyderabad', lastMonth),   // 13.56 T
    prod('p2', '2.2', 500, 'hyderabad', lastMonth),  //  7.42 T
    prod('p3', '2.8', 1000, 'hyderabad', lastMonth), // 18.57 T
    prod('p4', '2.9', 200, 'hyderabad', today),      //  3.84 T
    prod('p5', '3.2', 100, 'npmd', today),           //  2.10 T — West's plant
  ],
}

test('the grid shows standard thicknesses and narrows to a picked plant', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  const grid = page.getByRole('table', { name: 'Sales by size and thickness' })
  await expect(grid).toBeVisible()

  // Opening is the first block: its thickness headers are the standards only
  const heads = await grid.locator('thead tr').nth(1).locator('th').allInnerTexts()
  expect(heads.slice(0, 3)).toEqual(['2.0', '3.0', 'Total'])
  for (const odd of ['2.2', '2.8', '2.9', '3.2']) expect(heads).not.toContain(odd)

  const row = grid.locator('tbody tr', { hasText: '38×38' })
  const cells = () => row.locator('td').allInnerTexts()
  // Opening: 2.0 = 13.6 + 7.4 = 21.0; 3.0 = 18.6. Production: 3.0 = 3.8 (Hyderabad) + 2.1 (NPMD) = 5.9
  expect((await cells()).slice(2, 5)).toEqual(['21.0', '18.6', '39.6'])
  expect((await cells()).slice(5, 8)).toEqual(['', '5.9', '5.9'])

  // Plant = NPMD: only NPMD's 2.1 T run is left
  await page.getByRole('button', { name: 'Plant: All' }).click()
  await page.getByLabel('NPMD').check()
  await expect(page.getByRole('heading', { name: /Size × Thickness — All Distributors · NPMD/ })).toBeVisible()
  // only the 3.0 column is left in each block: Opening [3.0, Total], Production [3.0, Total]
  await expect(grid.locator('thead tr').nth(1).locator('th').first()).toHaveText('3.0')
  expect((await cells()).slice(2, 6)).toEqual(['', '', '2.1', '2.1'])

  await page.screenshot({ path: 'test-results/sales-size-grid.png', fullPage: false })
})

test('with no Region picked, the Plant filter offers every plant', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await page.getByRole('button', { name: 'Plant: All' }).click()
  for (const p of ['Hyderabad', 'NPMD', 'Lepakshi', 'Tapi']) await expect(page.getByLabel(p, { exact: true })).toBeVisible()
})

// ── Raw material available (#348): slit coil by size, HR coil by plant ───────────────────────────
// Strips: 38×38 = 148 mm, 50×25 = 146 mm, so a 147 mm coil fits both. Hyderabad and Lepakshi serve
// South; NPMD serves West. 38×38 is on the grid (SHS38 productions above); 50×25 is not.
const hrCoil = (id, plant, thickness, w) => ({ id: `seed-${id}`, hr_coil_id: id, plant, date_of_inward: '2026-11-01', thickness, width: 1250, actual_weight: w, deleted: false })
const slit = (id, hr, plant, width, w) => ({ id: `seed-${id}`, baby_coil_id: id, hr_coil_id: hr, plant, date_of_conversion: '2026-11-02', thickness: 2, width, weight: w, baby_coil_entry: 'A', deleted: false })
const coilRows = {
  ...rows,
  coils: [hrCoil('H-HYD3', 'hyderabad', 3, 43.1), hrCoil('H-HYD2', 'hyderabad', 2, 30), hrCoil('H-LEP2', 'lepakshi', 2, 20), hrCoil('H-NPM2', 'npmd', 2, 15)],
  // The Region filter offers the regions of the distributors that exist, so seed one in each.
  orders: [1, 2].map(i => ({ id: `seed-o${i}`, line_id: `L-o${i}`, plant: i === 1 ? 'hyderabad' : 'npmd', distributor_code: i === 1 ? 'D-S1' : 'D-W1',
    customer: i === 1 ? 'SOUTH ONE' : 'WEST ONE', ship_to_state: i === 1 ? 'TELANGANA' : 'MAHARASHTRA', order_status: '', order_date: today,
    mm_id: 'SKU-001', confirmed: 5, non_confirmed: 0, invoiced_qty: 0, deleted: false })),
  baby_coils: [slit('H-HYD2-A', 'H-HYD2', 'hyderabad', 147, 10), slit('H-LEP2-A', 'H-LEP2', 'lepakshi', 148, 6),
    slit('H-LEP2-B', 'H-LEP2', 'lepakshi', 500, 4), slit('H-NPM2-A', 'H-NPM2', 'npmd', 147, 8)],
}
const underRow = (grid, label) => grid.locator('tbody tr', { hasText: label }).first().locator('td').allInnerTexts()

test('Raw material: slit coil in its size row, HR coil and totals under Total, per plant', async ({ page }) => {
  await signIn(page, 'admin', { rows: coilRows })
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await page.getByRole('button', { name: 'Raw material', exact: true }).click()
  const grid = page.getByRole('table', { name: 'Sales by size and thickness' })
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits · Hyderabad' })).toBeVisible()
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits · Lepakshi' })).toBeVisible()

  // Columns: label, then one [2.0, 3.0, Total] block per plant in the master's order — Hyderabad, NPMD,
  // Lepakshi. No Region is picked, so NPMD's block is here too (it is a plant in view).
  const row = await grid.locator('tbody tr', { hasText: '38×38' }).first().locator('td').allInnerTexts()
  expect(row.slice(2, 5)).toEqual(['10.0', '', '10.0'])      // Hyderabad: the 147 mm coil
  expect(row.slice(5, 8)).toEqual(['8.0', '', '8.0'])        // NPMD: the 147 mm coil
  expect(row.slice(8, 11)).toEqual(['6.0', '', '6.0'])       // Lepakshi: the 148 mm coil
  await expect(grid.locator('tbody tr', { hasText: '38×38' }).first().locator('td[title*="also fits 50×25"]')).toHaveCount(3)  // 147, 147 and 148 mm each fit both
  expect((await underRow(grid, 'HR coil (not yet slit) · Hyderabad')).slice(1, 4)).toEqual(['20.0', '43.1', '63.1'])
  expect((await underRow(grid, 'Slit coil · fits no size · Lepakshi')).slice(7, 10)).toEqual(['4.0', '', '4.0'])
  // raw total = slit + HR: Hyderabad 2.0 → 10 + 20, 3.0 → 43.1
  expect((await underRow(grid, 'Raw material total · Hyderabad')).slice(1, 4)).toEqual(['30.0', '43.1', '73.1'])
  expect((await underRow(grid, 'Raw material total · Lepakshi')).slice(7, 10)).toEqual(['20.0', '', '20.0'])
})

test('Raw material: the Region and Plant filters narrow the coil blocks; no other region’s plant shows', async ({ page }) => {
  await signIn(page, 'admin', { rows: coilRows })
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await page.getByRole('button', { name: 'Raw material', exact: true }).click()
  const grid = page.getByRole('table', { name: 'Sales by size and thickness' })
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits · NPMD' })).toBeVisible()

  await page.getByRole('button', { name: 'Region: All' }).click()
  await page.getByLabel('South', { exact: true }).check()
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits · NPMD' })).toHaveCount(0)
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits · Hyderabad' })).toBeVisible()
  await expect(grid.locator('tbody tr', { hasText: '· NPMD' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Plant: All' }).click()
  await page.getByLabel('Lepakshi', { exact: true }).check()
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits · Hyderabad' })).toHaveCount(0)
  await expect(grid.locator('thead th', { hasText: 'Slit coil that fits · Lepakshi' })).toBeVisible()
  await page.screenshot({ path: 'test-results/sales-raw-material.png', fullPage: false })
})

test('Raw material: the CSV carries the coil blocks and the rows under Total', async ({ page }) => {
  await signIn(page, 'admin', { rows: coilRows })
  await page.getByRole('button', { name: 'Sales', exact: true }).click()
  await page.getByRole('button', { name: 'Raw material', exact: true }).click()
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: '⬇ CSV' }).first().click()])
  const csv = await (await import('node:fs/promises')).readFile(await dl.path(), 'utf8')
  expect(csv).toContain('Slit coil that fits · Hyderabad 2.0')
  expect(csv).toContain('Slit coil that fits · Lepakshi Total')
  expect(csv).toContain('HR coil (not yet slit) · Hyderabad')
  expect(csv).toContain('Slit coil · fits no size · Lepakshi')
  expect(csv).toContain('Raw material total · Hyderabad')
})

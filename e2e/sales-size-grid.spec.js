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

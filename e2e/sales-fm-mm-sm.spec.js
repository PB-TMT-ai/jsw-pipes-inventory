import { test, expect } from '@playwright/test'
import { signIn } from './signin.js'

// ── Sales tab, FM / MM / SM sub-tab (#384): gate, strip, inner tabs, South and West blocks ─────────
// The tag, cover and cards are calc's (`fmMmSmFeed`, `fmMmSmCellLabel`, unit-tested in
// src/lib/fm-mm-sm-subtab.test.js). What only a browser answers is the wiring: who sees the strip, that
// the sub-tab is fed the WHOLE stores (the header plant selector moves no tag or card), that each block
// reads only its own region's plants, and that its Production check and SKU list are the Dashboard's
// with the Region filter on that region. Rows are invented; SHS 50x50 1.6 is on both regions' seed master.
const tab = (page, name) => page.getByRole('button', { name, exact: true })
const SHS_50x50_16 = '1139-13064-10059417'    // DEFAULT_SKUS: MS SHS … 50x50x1.60x6000
const now = new Date()
const monthDay = (back, day) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10)
const entry = (weight, plant) => ({ skuCode: SHS_50x50_16, weight, pieces: 1, plant })
const order = (i, plant, code, customer, state, confirmed) => ({ id: `seed-o${i}`, line_id: `L-o${i}`, plant, distributor_code: code,
  customer, ship_to_state: state, order_status: '', order_date: monthDay(0, 1), mm_id: SHS_50x50_16,
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
  orders: [order(1, 'hyderabad', 'D-S1', 'SOUTH ONE', 'TELANGANA', 5), order(2, 'npmd', 'D-W1', 'WEST ONE', 'MAHARASHTRA', 3)],
}

const strip = (page) => page.getByRole('group', { name: 'Sales view' })
const block = (page, region) => page.getByRole('region', { name: `${region} block` })
const openSubTab = async (page) => {
  await tab(page, 'Sales').click()
  await strip(page).getByRole('button', { name: 'FM / MM / SM', exact: true }).click()
  await expect(block(page, 'South')).toBeVisible()
}
const cellsOf = (table, size) => table.locator('tbody tr', { hasText: size }).first().locator('td').allInnerTexts()

test('admin: the strip shows, Sales Dashboard is the default, FM / MM / SM opens on Status key', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await tab(page, 'Sales').click()
  await expect(strip(page).getByRole('button', { name: 'Sales Dashboard', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible()
  await expect(page.getByRole('table', { name: 'Sales by size and thickness' })).toBeVisible()

  await strip(page).getByRole('button', { name: 'FM / MM / SM', exact: true }).click()
  const inner = page.getByRole('group', { name: 'FM / MM / SM tabs' })
  await expect(inner.getByRole('button')).toHaveText(['Status key', 'Make next · Stock stuck', 'By FM / MM / SM'])
  await expect(inner.getByRole('button', { name: 'Status key', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // South block then West block, one under the other
  const order = await page.getByRole('region', { name: / block$/ }).evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
  expect(order).toEqual(['South block', 'West block'])
  // No Export, no CSV anywhere on the sub-tab; the Dashboard's heading is gone
  await expect(page.getByRole('button', { name: /CSV|Export/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toHaveCount(0)
  // No Region filter on the sub-tab; Plant, Section, Size, Thickness stay
  await expect(block(page, 'South').getByRole('button', { name: /^Region:/ })).toHaveCount(0)
  for (const f of ['Plant', 'Section', 'Size', 'Thickness']) await expect(block(page, 'South').getByRole('button', { name: `${f}: All` })).toBeVisible()
  // The default Show chip is FM / MM / SM view, and a later tab's content is still to come
  await expect(block(page, 'South').getByRole('button', { name: 'FM / MM / SM view', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/built in a later ticket/)).toBeVisible()

  // Back to the Dashboard: it is all there again
  await strip(page).getByRole('button', { name: 'Sales Dashboard', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible()
  await expect(page.getByRole('button', { name: '⬇ CSV' }).first()).toBeVisible()
})

test('a plant login sees no strip — the Sales tab is the Dashboard alone', async ({ page }) => {
  await signIn(page, 'hyderabad', { rows })
  await tab(page, 'Sales').click()
  await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toBeVisible()
  await expect(strip(page)).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'FM / MM / SM', exact: true })).toHaveCount(0)
})

test('each block reads its own region’s plants; a size sold in both shows in both with separate numbers', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const south = block(page, 'South').getByRole('table', { name: 'Sales by size and thickness · South' })
  const west = block(page, 'West').getByRole('table', { name: 'Sales by size and thickness · West' })
  const s = await cellsOf(south, '50×50'), w = await cellsOf(west, '50×50')
  // [Section, Size, 1.6: tag, Closing, Dispatch, Pending, Required, Total: Closing, Dispatch, Pending, Required]
  expect(s[2]).toMatch(/^\d+ d FM$/)
  expect(w[2]).toMatch(/^\d+ d FM$/)
  expect(s[3]).not.toEqual(w[3])          // Closing: Hyderabad's stock vs NPMD's
  expect(s[5]).toBe('5.0')                // Pending to Dispatch: South's distributor only
  expect(w[5]).toBe('3.0')                // West's only
  await expect(block(page, 'South').getByText('stock at Hyderabad + Lepakshi', { exact: true })).toBeVisible()
  await expect(block(page, 'West').getByText('stock at NPMD + Tapi', { exact: true })).toBeVisible()
})

test('the header plant selector moves no tag, rate or SKU count in either block', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const cards = () => Promise.all(['South', 'West'].map(r => block(page, r).getByTestId('fm-mm-sm-cards').innerText()))
  const tagOf = async (r) => (await cellsOf(block(page, r).getByRole('table', { name: `Sales by size and thickness · ${r}` }), '50×50'))[2]
  const before = await cards()
  const southTag = await tagOf('South'), westTag = await tagOf('West')
  expect(before[0]).toMatch(/SKUs/)
  expect(southTag).toMatch(/^\d+ d FM$/)

  // Header = NPMD (a West plant): the plant- and date-scoped figures narrow, the region-wide ones do not
  await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'NPMD' })
  await expect(block(page, 'South').getByText(/NPMD does not serve South/)).toBeVisible()
  expect(await cards()).toEqual(before)
  expect(await tagOf('West')).toBe(westTag)
  // South's 50x50 has no NPMD figures, so it leaves the grid — and is named, with the same tag and days
  await block(page, 'South').getByText(/^SKUs not shown in the grid/).click()
  const [days] = southTag.split(' ')
  await expect(block(page, 'South').getByRole('listitem').filter({ hasText: /^SHS 50x50 · 1\.6 mm/ })).toContainText(`FM · ${days} d`)
})

test('each block’s Production check and SKU list equal the Dashboard’s with the Region filter on that region', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await tab(page, 'Sales').click()
  const dash = {}
  for (const region of ['South', 'West']) {
    await page.getByRole('button', { name: /^Region:/ }).click()
    for (const r of ['South', 'West']) {
      const box = page.getByLabel(r, { exact: true })
      if (await box.isChecked() !== (r === region)) await box.click()
    }
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Production check', exact: true }).click()
    const check = await page.getByRole('table', { name: 'Production check by size and thickness' }).innerText()
    await page.getByRole('button', { name: 'SKU list', exact: true }).click()
    const list = await page.getByRole('table', { name: 'Sales by SKU' }).innerText()
    await page.getByRole('button', { name: 'Size × Thickness', exact: true }).click()
    dash[region] = { check, list }
  }
  await strip(page).getByRole('button', { name: 'FM / MM / SM', exact: true }).click()
  for (const region of ['South', 'West']) {
    const b = block(page, region)
    await b.getByRole('button', { name: 'Production check', exact: true }).click()
    expect(await b.getByRole('table', { name: `Production check by size and thickness · ${region}` }).innerText()).toBe(dash[region].check)
    // The SKU list's columns follow the Show chip: set the Dashboard's default, All
    await b.getByRole('button', { name: 'SKU list', exact: true }).click()
    await b.getByRole('button', { name: 'All', exact: true }).click()
    expect(await b.getByRole('table', { name: `Sales by SKU · ${region}` }).innerText()).toBe(dash[region].list)
  }
})

test('each block ends with the FG age grid, the Not tagged row and the SKUs not shown in the grid', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  for (const region of ['South', 'West']) {
    const b = block(page, region)
    await expect(b.getByRole('table', { name: `FG age by size and thickness · ${region}` })).toBeVisible()
    const check = b.getByRole('table', { name: `Tagged and not tagged · ${region}` })
    await expect(check.locator('tbody tr')).toHaveCount(3)
    const [tagged, untagged, total] = await Promise.all([0, 1, 2].map(i => check.locator('tbody tr').nth(i).locator('td').allInnerTexts()))
    expect(untagged[0]).toBe('Not tagged / Outside the plan')
    // tagged + untagged = the grid total, for Closing stock, Dispatch and Pending to Dispatch
    ;[1, 2, 3].forEach(i => expect(Number(tagged[i] || 0) + Number(untagged[i] || 0)).toBeCloseTo(Number(total[i] || 0), 1))
    await expect(b.getByText(/^SKUs not shown in the grid \(\d+\)$/)).toBeVisible()
  }
})

// A wider South: two sizes over six standard thicknesses, so the 1366 px check sees a full-width grid.
const SHS = { '50|1.2': '1139-13064-10059416', '50|2': '1139-13064-10059419', '50|2.5': '1139-13064-10059421', '50|2.9': '1139-13064-10059422',
  '50|4': '1139-13064-10059424', '40|1.6': '1139-13064-10059408', '40|2': '1139-13064-10059410', '40|3': '1139-13064-10080502' }
const wide = {
  ...rows,
  productions: [...rows.productions, ...Object.entries(SHS).map(([k, code], i) => ({ id: `pw${i}`, sku_code: code, total_weight: 0,
    tube_count: 400 + 300 * i, plant: 'hyderabad', date_of_production: monthDay(3, 2), deleted: false }))],
  dispatches: [...rows.dispatches, ...Object.entries(SHS).map(([k, code], i) => ({ id: `dw${i}`, invoice_no: `INV-W${i}`, date_of_dispatch: monthDay(1, 5),
    deleted: false, bundle_entries: [{ skuCode: code, weight: 2 + 3 * i, pieces: 1, plant: 'hyderabad' }] }))],
}

test('at 1366 × 768 every tagged cell prints its number and its tag', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await signIn(page, 'admin', { rows: wide })
  await openSubTab(page)
  const tags = page.locator('[data-fm-mm-sm-cell]')
  expect(await tags.count()).toBeGreaterThan(0)
  for (const t of await tags.all()) {
    const kind = await t.getAttribute('data-fm-mm-sm-cell')
    if (kind === 'days') await expect(t).toHaveText(/^\d+ d (FM|MM|SM)$/)
    // nothing clipped: the cell is at least as wide as what it prints
    expect(await t.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
    // and what it prints fits a narrow cell (CONTEXT.md, Cover bracket: under 120 px) — no bracket word in it
    expect(await t.evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(120)
  }
  await block(page, 'South').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/fm-mm-sm-1366.png', fullPage: false })
})

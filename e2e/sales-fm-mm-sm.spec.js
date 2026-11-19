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
// #389: one region block is shown at a time; a spec that reads the other region switches to it first.
const showRegion = (page, region) => page.getByRole('group', { name: 'Region', exact: true }).getByRole('button', { name: region, exact: true }).click()
const regionLine = async (page, region) => { await showRegion(page, region); return page.getByTestId('fm-mm-sm-region-line').innerText() }
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
  // One region block at a time (#389): a South | West switch, South first and shown; West is behind the switch
  await expect(page.getByRole('group', { name: 'Region', exact: true }).getByRole('button')).toHaveText(['South', 'West'])
  await expect(page.getByRole('group', { name: 'Region', exact: true }).getByRole('button', { name: 'South', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.getByRole('region', { name: / block$/ }).evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual(['South block'])
  await expect(page.getByTestId('fm-mm-sm-cards')).toHaveCount(0)   // the three cards are gone: their figures sit on the region line
  await expect(page.getByRole('heading', { name: 'South', exact: true })).toHaveCount(0)
  // No Export, no CSV anywhere on the sub-tab; the Dashboard's heading is gone
  await expect(page.getByRole('button', { name: /CSV|Export/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Sales Dashboard' })).toHaveCount(0)
  // No Region filter on the sub-tab; Plant, Section, Size, Thickness stay
  await expect(block(page, 'South').getByRole('button', { name: /^Region:/ })).toHaveCount(0)
  for (const f of ['Plant', 'Section', 'Size', 'Thickness']) await expect(block(page, 'South').getByRole('button', { name: `${f}: All` })).toBeVisible()
  // The default Show chip is FM / MM / SM view; Status key (#379) opens on its key
  await expect(block(page, 'South').getByRole('button', { name: 'FM / MM / SM view', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('table', { name: 'Status key', exact: true })).toBeVisible()
  await inner.getByRole('button', { name: 'Make next · Stock stuck', exact: true }).click()
  await expect(page.getByText(/built in a later ticket/)).toHaveCount(0) // all three tabs are built (#379, #380, #381)
  await expect(page.getByRole('table', { name: 'Status key', exact: true })).toHaveCount(0)

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
  const s = await cellsOf(south, '50×50')
  await expect(page.getByText('stock at Hyderabad + Lepakshi', { exact: true })).toBeVisible()
  await showRegion(page, 'West')
  const west = block(page, 'West').getByRole('table', { name: 'Sales by size and thickness · West' })
  const w = await cellsOf(west, '50×50')
  // [Section, Size, 1.6: tag, Closing, Dispatch, Pending, Required, Total: Closing, Dispatch, Pending, Required]
  expect(s[2]).toMatch(/^\d+ d FM$/)
  expect(w[2]).toMatch(/^\d+ d FM$/)
  expect(s[3]).not.toEqual(w[3])          // Closing: Hyderabad's stock vs NPMD's
  expect(s[5]).toBe('5.0')                // Pending to Dispatch: South's distributor only
  expect(w[5]).toBe('3.0')                // West's only
  await expect(page.getByText('stock at NPMD + Tapi', { exact: true })).toBeVisible()
})

test('the header plant selector moves no tag, rate or SKU count in either block', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const cards = async () => [await regionLine(page, 'South'), await regionLine(page, 'West')]
  const tagOf = async (r) => { await showRegion(page, r); return (await cellsOf(block(page, r).getByRole('table', { name: `Sales by size and thickness · ${r}` }), '50×50'))[2] }
  const before = await cards()
  const southTag = await tagOf('South'), westTag = await tagOf('West')
  expect(before[0]).toMatch(/SKUs/)
  expect(southTag).toMatch(/^\d+ d FM$/)

  // Header = NPMD (a West plant): the plant- and date-scoped figures narrow, the region-wide ones do not
  await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'NPMD' })
  expect(await cards()).toEqual(before)
  expect(await tagOf('West')).toBe(westTag)
  await showRegion(page, 'South')
  await expect(block(page, 'South').getByText(/NPMD does not serve South/)).toBeVisible()
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
    await showRegion(page, region)
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
    await showRegion(page, region)
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

// ── Status key tab (#379). The boxes' counts and tonnes are calc's (`fmMmSmStatusBoxes`, unit-tested in
// src/lib/fm-mm-sm-status-key.test.js); here: South and West read apart, the header plant moves no box, and a
// box narrows its own region's grid only, with a chip that clears it. On the seed master each region sells
// one SKU, SHS 50x50 1.6 — an FM — and holds no other stock, so every other SKU sits in No sales.
const statusKey = (page) => page.getByRole('table', { name: 'Status key', exact: true })
const southFmBox = async (page) => {
  // the one South FM bracket box holding a SKU (its bracket depends on the days of cover, so look it up)
  const boxes = statusKey(page).getByRole('button', { name: /^South · .+ · FM$/ })
  for (const b of await boxes.all()) if (await b.isEnabled()) return b
  throw new Error('no South FM box with a SKU')
}

test('Status key: one key, South and West columns, every box region-wide and unmoved by the header plant', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const key = statusKey(page)
  await expect(key.locator('thead th')).toHaveText(['Status', 'FG days of cover', 'South', 'West'])
  // The day limits are CONTEXT.md's (Cover bracket)
  await expect(key.locator('tbody tr', { hasText: 'Running out' }).first()).toContainText('under 7 d')
  await expect(key.locator('tbody tr', { hasText: 'Too much' }).last()).toContainText('over 180 d')
  // FM group: one SKU each side; the box it sits in reads 1 SKU
  const fmRow = await key.locator('tbody tr').first().locator('td').allInnerTexts()
  expect(fmRow[0]).toBe('FM')
  expect(fmRow[2]).toMatch(/^1 SKU · /)
  expect(fmRow[3]).toMatch(/^1 SKU · /)
  await expect(await southFmBox(page)).toHaveText(/^1 SKU · /)
  await expect(await southFmBox(page)).toHaveAttribute('title', /Blended monthly rate/)
  // No use and No sales SKUs show no days and no rate (#379): their hovers print no Blended monthly rate
  for (const word of ['No use', 'No sales']) {
    await expect(key.getByRole('button', { name: `South · ${word}`, exact: true })).not.toHaveAttribute('title', /Blended monthly rate|rate/i)
  }
  // The Total row is the SKUs card of each block
  const total = await key.locator('tbody tr').last().locator('td').allInnerTexts()
  for (const [i, region] of [[1, 'South'], [2, 'West']]) {
    const card = await regionLine(page, region)
    const skus = card.match(/SKUs\s*(\d+)/)[1]
    expect(total[i]).toMatch(new RegExp(`^${skus} SKUs · `))
  }
  // A plant filter never changes a box
  const before = await key.innerText()
  await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'NPMD' })
  await showRegion(page, 'South')
  await expect(block(page, 'South').getByText(/NPMD does not serve South/)).toBeVisible()
  expect(await key.innerText()).toBe(before)
})

test('Status key: a box narrows its own region’s grid only; the chip clears it', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const grid = (r) => block(page, r).getByRole('table', { name: `Sales by size and thickness · ${r}` })
  const chip = (r) => block(page, r).getByRole('button', { name: `Clear the ${r} status filter` })

  // The FM box: South keeps its 50x50 (the FM SKU's cell); West is untouched, no chip there
  await (await southFmBox(page)).click()
  await expect(chip('South')).toContainText('FM · 1 SKU')
  await expect(grid('South').locator('tbody tr', { hasText: '50×50' })).toHaveCount(1)
  await showRegion(page, 'West')
  await expect(chip('West')).toHaveCount(0)
  await expect(grid('West').locator('tbody tr', { hasText: '50×50' })).toHaveCount(1)

  // No sales (no stock, no sales): picking a South box brings South to the front; South's 50x50 leaves its grid; West still shows its own
  await statusKey(page).getByRole('button', { name: 'South · No sales', exact: true }).click()
  await expect(block(page, 'South')).toBeVisible()
  await expect(statusKey(page).getByRole('button', { name: 'South · No sales', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(chip('South')).toContainText('No sales')
  await expect(grid('South').locator('tbody tr', { hasText: '50×50' })).toHaveCount(0)
  await showRegion(page, 'West')
  await expect(grid('West').locator('tbody tr', { hasText: '50×50' })).toHaveCount(1)
  // Picking a West box brings the West block to the front, from South (#389)
  await showRegion(page, 'South')
  for (const b of await statusKey(page).getByRole('button', { name: /^West · .+ · FM$/ }).all()) if (await b.isEnabled()) { await b.click(); break }
  await expect(block(page, 'West')).toBeVisible()
  await expect(block(page, 'South')).toHaveCount(0)
  await showRegion(page, 'South')
  await expect(chip('South')).toContainText('No sales')   // South kept its own pick while West was shown

  // The chip clears it
  await chip('South').click()
  await expect(chip('South')).toHaveCount(0)
  await expect(grid('South').locator('tbody tr', { hasText: '50×50' })).toHaveCount(1)

  // The filter belongs to the Status key tab: another tab shows the whole grid
  await (await southFmBox(page)).click()
  await page.getByRole('group', { name: 'FM / MM / SM tabs' }).getByRole('button', { name: 'Make next · Stock stuck', exact: true }).click()
  await expect(chip('South')).toHaveCount(0)
})

// ── #390: less text — the Key in a dropdown, one-line intros, the Raw material note only in its own view ──
test('Key: days of cover is a dropdown on the tabs strip (not on Status key); the Raw material note shows only in its view', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const inner = page.getByRole('group', { name: 'FM / MM / SM tabs' })
  const keyBtn = page.getByRole('button', { name: /^Key: days of cover/ })
  const keyTable = page.getByRole('table', { name: 'Key: FG days of cover brackets' })
  await expect(keyBtn).toHaveCount(0)                                        // Status key carries every limit itself
  await expect(page.getByText(/plant confirmed this method/)).toHaveCount(0)  // the amber note is not above the blocks
  for (const name of ['Make next · Stock stuck', 'By FM / MM / SM']) {
    await inner.getByRole('button', { name, exact: true }).click()
    await expect(keyTable).toHaveCount(0)                                    // folded away until asked for
    await keyBtn.click()
    await expect(keyTable.locator('tbody tr', { hasText: 'FM' }).first()).toBeVisible()
    await expect(keyTable.locator('thead')).toContainText('Running out')
    await expect(keyTable.locator('thead')).toContainText('Too much')
    await expect(keyTable.locator('thead')).toContainText('No use')
    await page.keyboard.press('Escape')
    await expect(keyTable).toHaveCount(0)
    await expect(page.getByText(/plant confirmed this method/)).toHaveCount(0)
  }
  // The By tab's intro is one line; the rest is folded under "How this is worked out"
  const fold = page.locator('details', { hasText: 'How this is worked out' }).first()
  await expect(fold).not.toHaveAttribute('open', '')
  await fold.locator('summary').click()
  await expect(fold).toContainText('The sections add up to the region’s grid')
  // The Raw material view carries the note, and its long explanation is folded, not deleted
  await block(page, 'South').getByRole('button', { name: 'Raw material', exact: true }).click()
  const note = block(page, 'South').getByText(/plant confirmed this method \(18-Nov-2026\)/)
  await expect(note).toBeVisible()
  await expect(note).toContainText('yield loss from coil to tube')
  await expect(block(page, 'South').getByText(/Raw material available is each cell’s share/)).toBeHidden()
  await block(page, 'South').getByText('How this is worked out').first().click()
  await expect(block(page, 'South').getByText(/Raw material available is each cell’s share/)).toBeVisible()
})

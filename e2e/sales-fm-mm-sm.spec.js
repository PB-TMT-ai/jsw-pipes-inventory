import { test, expect } from '@playwright/test'
import { signIn, openDashboard } from './signin.js'

// ── Dashboards › FM / MM / SM (#384; ADR-0018): gate, screens, South and West blocks ─────────────────
// The tag, cover and cards are calc's (`fmMmSmFeed`, `fmMmSmCellLabel`, unit-tested in
// src/lib/fm-mm-sm-subtab.test.js). What only a browser answers is the wiring: who gets the dashboard, that
// it is fed the WHOLE stores (the header plant selector moves no tag or card), that each block
// reads only its own region's plants, and that its Production check and SKU list are the Dashboard's
// with the Region filter on that region. Rows are invented; SHS 50x50 1.6 is on both regions' seed master.
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

// Dashboards › <board> › <screen> (ADR-0018): the dashboard row, then that dashboard's screens.
const dashRow = (page) => page.getByRole('group', { name: 'Dashboard', exact: true })
const screens = (page) => page.getByRole('tablist', { name: 'FM / MM / SM screens' })
const goScreen = (page, name) => screens(page).getByRole('tab', { name, exact: true }).click()
const block = (page, region) => page.getByRole('region', { name: `${region} block` })
// #389: one region block is shown at a time; a spec that reads the other region switches to it first.
const showRegion = (page, region) => page.getByRole('group', { name: 'Region', exact: true }).getByRole('button', { name: region, exact: true }).click()
// #391: the Dashboard's chips sit under a More dropdown in each block.
const pickMore = async (b, name) => { await b.getByRole('button', { name: /^More/ }).click(); await b.getByRole('button', { name, exact: true }).click() }
const regionLine = async (page, region) => { await showRegion(page, region); return page.getByTestId('fm-mm-sm-region-line').innerText() }
const openSubTab = async (page, screen = 'Overview') => {
  await openDashboard(page, 'FM / MM / SM', screen)
  await expect(block(page, 'South')).toBeVisible()
}
const cellsOf = (table, size) => table.locator('tbody tr', { hasText: size }).first().locator('td').allInnerTexts()

test('admin: FM / MM / SM is its own dashboard, opening on Overview with the Status key', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  // Sales is a dashboard of its own, opening on This month; its grid is a screen
  await openDashboard(page, 'Sales')
  await expect(page.getByRole('tablist', { name: 'Sales screens' }).getByRole('tab', { name: 'This month', exact: true })).toHaveAttribute('aria-selected', 'true')
  await openDashboard(page, 'Sales', 'Size × Thickness')
  await expect(page.getByRole('table', { name: 'Sales by size and thickness' })).toBeVisible()

  await dashRow(page).getByRole('button', { name: 'FM / MM / SM', exact: true }).click()
  await expect(screens(page).getByRole('tab')).toHaveText(['Overview', 'Worklists', 'Production check', 'SKU list'])
  await expect(screens(page).getByRole('tab', { name: 'Overview', exact: true })).toHaveAttribute('aria-selected', 'true')
  // One region block at a time (#389): a South | West switch, South first and shown; West is behind the switch
  await expect(page.getByRole('group', { name: 'Region', exact: true }).getByRole('button')).toHaveText(['South', 'West'])
  await expect(page.getByRole('group', { name: 'Region', exact: true }).getByRole('button', { name: 'South', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.getByRole('region', { name: / block$/ }).evaluateAll(els => els.map(e => e.getAttribute('aria-label')))).toEqual(['South block'])
  await expect(page.getByTestId('fm-mm-sm-cards')).toHaveCount(0)   // the three cards are gone: their figures sit on the region line
  // The grid's title reads the region alone — it no longer repeats the screen name (ADR-0018)
  await expect(page.getByRole('heading', { name: 'South', exact: true })).toHaveCount(1)
  // No Export, no CSV anywhere on this dashboard
  await expect(page.getByRole('button', { name: /CSV|Export/ })).toHaveCount(0)
  // No Region filter in the block; Plant, Section, Size, Thickness stay
  await expect(block(page, 'South').getByRole('button', { name: /^Region:/ })).toHaveCount(0)
  for (const f of ['Plant', 'Section', 'Size', 'Thickness']) await expect(block(page, 'South').getByRole('button', { name: `${f}: All` })).toBeVisible()
  // The default Show chip is FM / MM / SM view; Overview (#379) opens with the region's Status key on top
  await expect(block(page, 'South').getByRole('button', { name: 'FM / MM / SM view', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('table', { name: 'Status key · South', exact: true })).toBeVisible()
  await goScreen(page, 'Worklists')
  await expect(page.getByText(/built in a later ticket/)).toHaveCount(0)
  await expect(page.getByRole('table', { name: 'Status key · South', exact: true })).toHaveCount(0)

  // Back on Sales: its grid and its Export menu are all there again
  await openDashboard(page, 'Sales', 'Size × Thickness')
  await expect(page.getByRole('table', { name: 'Sales by size and thickness' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export ▾' })).toBeVisible()
})

test('a plant login gets no FM / MM / SM dashboard — Sales is there alone', async ({ page }) => {
  await signIn(page, 'hyderabad', { rows })
  await openDashboard(page, 'Sales', 'Size × Thickness')
  await expect(page.getByRole('table', { name: 'Sales by size and thickness' })).toBeVisible()
  await expect(dashRow(page).getByRole('button', { name: 'FM / MM / SM', exact: true })).toHaveCount(0)
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

test('each block’s Production check and SKU list equal the Sales screens’ with the Region filter on that region', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  // Region is set on each Sales screen, so the reading never depends on a filter carried between screens
  const setRegion = async (region) => {
    await page.getByRole('button', { name: /^Region:/ }).click()
    for (const r of ['South', 'West']) {
      // a checkbox, not the grid's own section — its title reads the region alone once one is picked
      const box = page.getByRole('checkbox', { name: r, exact: true })
      if (await box.isChecked() !== (r === region)) await box.click()
    }
    await page.keyboard.press('Escape')
  }
  const dash = {}
  for (const region of ['South', 'West']) {
    await openDashboard(page, 'Sales', 'Production check')
    await setRegion(region)
    const check = await page.getByRole('table', { name: 'Production check by size and thickness' }).innerText()
    await openDashboard(page, 'Sales', 'SKU list')
    await setRegion(region)
    const list = await page.getByRole('table', { name: 'Sales by SKU' }).innerText()
    dash[region] = { check, list }
  }
  await openDashboard(page, 'FM / MM / SM', 'Production check')
  for (const region of ['South', 'West']) {
    await showRegion(page, region)
    const b = block(page, region)
    expect(await b.getByRole('table', { name: `Production check by size and thickness · ${region}` }).innerText()).toBe(dash[region].check)
  }
  await goScreen(page, 'SKU list')
  for (const region of ['South', 'West']) {
    await showRegion(page, region)
    const b = block(page, region)
    // The SKU list's columns follow the Show chip: set the Sales screen's default, All
    await pickMore(b, 'All')
    expect(await b.getByRole('table', { name: `Sales by SKU · ${region}` }).innerText()).toBe(dash[region].list)
  }
})

test('each block ends with the Not tagged row and the SKUs not shown in the grid; FG age is not in the block', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  for (const region of ['South', 'West']) {
    await showRegion(page, region)
    const b = block(page, region)
    // FG age is drawn once, under Sales › Size × Thickness (ADR-0018)
    await expect(b.getByRole('table', { name: `FG age by size and thickness · ${region}` })).toHaveCount(0)
    await expect(b.getByText(/^FG age · as of/)).toHaveCount(0)
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

// ── Status key (#379), now one matrix per region on top of Overview (ADR-0018). The boxes' counts and tonnes are
// calc's (`fmMmSmStatusBoxes`, unit-tested in src/lib/fm-mm-sm-status-key.test.js); here: South and West read
// apart, the header plant moves no box, and a box narrows its own region's grid only, with a chip that clears it.
// On the seed master each region sells one SKU, SHS 50x50 1.6 — an FM — and holds no other stock, so every
// other SKU sits in No sales. A cell prints "SKUs · Current inventory".
const statusKey = (page, region = 'South') => page.getByRole('table', { name: `Status key · ${region}`, exact: true })
const fmBox = async (page, region = 'South') => {
  // the one FM bracket box holding a SKU (its bracket depends on the days of cover, so look it up)
  const boxes = statusKey(page, region).getByRole('button', { name: new RegExp(`^${region} · .+ · FM$`) })
  for (const b of await boxes.all()) if (await b.isEnabled()) return b
  throw new Error(`no ${region} FM box with a SKU`)
}
const southFmBox = (page) => fmBox(page, 'South')

test('Status key: one matrix per region, every box region-wide and unmoved by the header plant', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const before = {}
  for (const region of ['South', 'West']) {
    await showRegion(page, region)
    const key = statusKey(page, region)
    await expect(key.locator('thead th')).toHaveText(['FM / MM / SM', 'Running out', 'Thin', 'Healthy', 'Heavy', 'Too much', 'No use', 'No sales', 'Total'])
    // The day limits are CONTEXT.md's (Cover bracket): on each box's hover
    await expect(key.getByRole('button', { name: `${region} · Running out · FM`, exact: true })).toHaveAttribute('title', /under 7 d/)
    await expect(key.getByRole('button', { name: `${region} · Too much · SM`, exact: true })).toHaveAttribute('title', /over 180 d/)
    // FM row: one SKU; the box it sits in reads 1 SKU
    const fmRow = await key.locator('tbody tr').first().locator('td').allInnerTexts()
    expect(fmRow[0]).toBe('FM')
    expect(fmRow[fmRow.length - 1]).toMatch(/^1 · /)
    await expect(await fmBox(page, region)).toHaveText(/^1 · /)
    await expect(await fmBox(page, region)).toHaveAttribute('title', /1 SKU, .*Blended monthly rate/)
    // No use and No sales SKUs show no days and no rate (#379): their hovers print no Blended monthly rate
    for (const word of ['No use', 'No sales']) {
      await expect(key.getByRole('button', { name: `${region} · ${word}`, exact: true })).not.toHaveAttribute('title', /Blended monthly rate|rate/i)
    }
    // The Total row's Total is the region line's SKUs
    const total = await key.locator('tbody tr').last().locator('td').allInnerTexts()
    const skus = (await regionLine(page, region)).match(/SKUs\s*(\d+)/)[1]
    expect(total[total.length - 1]).toMatch(new RegExp(`^${skus} · `))
    before[region] = await key.innerText()
  }
  // A plant filter never changes a box
  await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'NPMD' })
  await showRegion(page, 'South')
  await expect(block(page, 'South').getByText(/NPMD does not serve South/)).toBeVisible()
  expect(await statusKey(page, 'South').innerText()).toBe(before.South)
  await showRegion(page, 'West')
  expect(await statusKey(page, 'West').innerText()).toBe(before.West)
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

  // No sales (no stock, no sales): South's 50x50 leaves its grid; West still shows its own
  await showRegion(page, 'South')
  await statusKey(page, 'South').getByRole('button', { name: 'South · No sales', exact: true }).click()
  await expect(statusKey(page, 'South').getByRole('button', { name: 'South · No sales', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(chip('South')).toContainText('No sales')
  await expect(grid('South').locator('tbody tr', { hasText: '50×50' })).toHaveCount(0)
  await showRegion(page, 'West')
  await expect(grid('West').locator('tbody tr', { hasText: '50×50' })).toHaveCount(1)
  // A West box narrows West; South keeps its own pick while West is shown
  await (await fmBox(page, 'West')).click()
  await expect(chip('West')).toContainText('FM · 1 SKU')
  await showRegion(page, 'South')
  await expect(chip('South')).toContainText('No sales')

  // The chip clears it
  await chip('South').click()
  await expect(chip('South')).toHaveCount(0)
  await expect(grid('South').locator('tbody tr', { hasText: '50×50' })).toHaveCount(1)

  // A pick holds on every screen until its chip clears it (ADR-0018): Worklists shows the same chip
  await (await southFmBox(page)).click()
  await goScreen(page, 'Worklists')
  await expect(chip('South')).toContainText('FM · 1 SKU')
})

// ── #390: less text — the Key in a dropdown, one-line intros, the Raw material note only in its own view ──
test('Key: days of cover is a dropdown beside the Status key and the Worklists heading; the Raw material note shows only in its view', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const keyBtn = page.getByRole('button', { name: /^Key: days of cover/ })
  const keyTable = page.getByRole('table', { name: 'Key: FG days of cover brackets' })
  await expect(page.getByText(/plant confirmed this method/)).toHaveCount(0)  // the amber note is not above the blocks
  for (const name of ['Overview', 'Worklists']) {
    await goScreen(page, name)
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
  // Split by tag says in one line what the groups add up to
  await goScreen(page, 'Overview')
  await expect(block(page, 'South').locator('label', { has: page.getByRole('switch', { name: 'Split by tag' }) }))
    .toHaveAttribute('title', /The groups add up to the region’s grid/)
  // The Raw material view carries the note, and its long explanation is folded, not deleted
  await block(page, 'South').getByRole('button', { name: 'Raw material', exact: true }).click()
  const note = block(page, 'South').getByText(/plant confirmed this method \(18-Nov-2026\)/)
  await expect(note).toBeVisible()
  await expect(note).toContainText('yield loss from coil to tube')
  await expect(block(page, 'South').getByText(/Raw material available is each cell’s share/)).toBeHidden()
  await block(page, 'South').getByText('How this is worked out').first().click()
  await expect(block(page, 'South').getByText(/Raw material available is each cell’s share/)).toBeVisible()
})

// ── #391: the view chips in front, the Sales screen's measures under More ──
test('each block shows its own chips in front and the Sales screen’s eleven under More; More reads selected while one is on', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  const b = block(page, 'South')
  const show = b.getByRole('group', { name: 'Show' })
  const inFront = (names) => Promise.all(names.map(n => expect(show.getByRole('button', { name: n, exact: true })).toBeVisible()))
  await inFront(['FM / MM / SM view', 'Raw material'])
  await expect(show.getByRole('button', { name: 'All measures', exact: true })).toHaveCount(0)   // with Split by tag only
  await expect(show.getByRole('button', { name: 'Stock flow', exact: true })).toHaveCount(0)     // behind More
  await b.getByRole('switch', { name: 'Split by tag' }).check()
  await inFront(['FM / MM / SM view', 'All measures', 'Raw material'])
  const more = b.getByRole('button', { name: /^More/ })
  await expect(more).toHaveAttribute('aria-pressed', 'false')
  await more.click()
  const names = ['All', 'Stock flow', 'Sales', 'Opening stock', 'Production', 'Dispatch', 'Closing stock', 'Confirmed', 'Non-confirmed', 'Pending to Dispatch', 'Production required']
  for (const n of names) await expect(b.getByRole('button', { name: n, exact: true })).toBeVisible()
  await b.getByRole('button', { name: 'Stock flow', exact: true }).click()
  await expect(more).toHaveAttribute('aria-pressed', 'true')
  await expect(b.getByRole('button', { name: 'Stock flow', exact: true })).toHaveCount(0)   // the menu closed
  await expect(b.getByRole('table', { name: 'Sales by size and thickness · South', exact: true })).toBeVisible()  // the Sales screen's grid, whole
  await b.getByRole('button', { name: 'Raw material', exact: true }).click()
  await expect(more).toHaveAttribute('aria-pressed', 'false')
})

// ── #392 → ADR-0018: the FG age table is drawn once, under Sales › Size × Thickness, open; no FM / MM / SM screen carries it ──
test('FG age is on Sales › Size × Thickness only, open; no FM / MM / SM screen and no other Sales screen draws it', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openSubTab(page)
  for (const name of ['Overview', 'Worklists', 'Production check', 'SKU list']) {
    await goScreen(page, name)
    await expect(page.getByRole('table', { name: /^FG age by size and thickness/ })).toHaveCount(0)
    await expect(page.locator('summary', { hasText: 'FG age · as of' })).toHaveCount(0)
  }
  for (const name of ['Production check', 'SKU list']) {
    await openDashboard(page, 'Sales', name)
    await expect(page.getByRole('table', { name: /^FG age by size and thickness/ })).toHaveCount(0)
  }
  await openDashboard(page, 'Sales', 'Size × Thickness')
  await expect(page.getByRole('table', { name: 'FG age by size and thickness' })).toBeVisible()
  await expect(page.locator('summary', { hasText: 'FG age · as of' })).toHaveCount(0)
})

// ── #393: smaller type on this dashboard's own grids (11 px, heads 10 px); the Sales screen's stay 12 px ──
test('the FM / MM / SM grids print 11 px with 10 px heads; the Sales screen’s grid is unchanged', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await signIn(page, 'admin', { rows: wide })
  await openSubTab(page)
  const sizes = (t) => t.evaluate(el => [getComputedStyle(el.querySelector('tbody td')).fontSize, getComputedStyle(el.querySelector('thead th')).fontSize])
  const grid = block(page, 'South').getByRole('table', { name: 'Sales by size and thickness · South' })
  expect(await sizes(grid)).toEqual(['11px', '10px'])
  await block(page, 'South').getByRole('switch', { name: 'Split by tag' }).check()
  expect(await sizes(block(page, 'South').getByRole('table', { name: 'Sales by size and thickness · South · split by tag', exact: true }))).toEqual(['11px', '10px'])
  await openDashboard(page, 'Sales', 'Size × Thickness')
  expect(await sizes(page.getByRole('table', { name: 'Sales by size and thickness' }))).toEqual(['12px', '12px'])
})

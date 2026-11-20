import { test, expect } from '@playwright/test'
import { signIn, openDashboard } from './signin.js'

// ── Dashboards › FM / MM / SM › Overview, Split by tag (#381; ADR-0018) ────────────────────────────────
// The split is calc's (`fmMmSmTagSections`, unit-tested in src/lib/fm-mm-sm-by-tag.test.js). What only a
// browser answers: Split by tag draws ONE table whose rows are grouped FM, MM, SM, No sales, then Not tagged /
// Outside the plan (it was the By FM / MM / SM tab's stacked sections); All measures draws the five figures;
// No sales leaves days and rate blank but keeps its orders; the groups add up to the Total row and to the
// region's grid; the header plant selector moves no tag or count. Rows are invented.
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

const block = (page, region) => page.getByRole('region', { name: `${region} block` })
// #389: one region block is shown at a time; a spec that reads the other region switches to it first.
const showRegion = (page, region) => page.getByRole('group', { name: 'Region', exact: true }).getByRole('button', { name: region, exact: true }).click()
// Each region block keeps its own switch, so a spec turns it on in the block it reads.
const splitOn = async (page, region) => {
  await showRegion(page, region)
  const sw = block(page, region).getByRole('switch', { name: 'Split by tag' })
  if (!await sw.isChecked()) await sw.check()
  await expect(splitTable(page, region)).toBeVisible()
}
const openBy = async (page) => {
  await openDashboard(page, 'FM / MM / SM', 'Overview')
  await expect(block(page, 'South')).toBeVisible()
  await splitOn(page, 'South')
}
const splitTable = (page, region) => block(page, region).getByRole('table', { name: `Sales by size and thickness · ${region} · split by tag`, exact: true })
const GROUPS = ['FM', 'MM', 'SM', 'No sales', 'outside']
// Every body row with the group it sits under: a group row carries `data-fm-mm-sm-section`; the rows after it are its own.
const splitRows = (table) => table.locator('tbody tr').evaluateAll(trs => {
  let group = null
  return trs.map(tr => {
    const g = tr.getAttribute('data-fm-mm-sm-section')
    if (g) group = g
    return { group, head: !!g, cells: [...tr.querySelectorAll('td')].map(td => td.innerText.trim()) }
  })
})
// The blocks' titles, left to right (the first header row bar Section and Size): the Sales Dashboard's layout.
const blockTitles = async (table) => (await table.locator('thead tr').first().locator('th').allInnerTexts()).slice(2)
const totalRow = (table) => table.locator('tbody tr').last().locator('td').allInnerTexts()
// [first, last] cell index of the block whose title starts with `title` (Section and Size are cells 0 and 1).
const blockRange = async (table, title) => {
  const spans = await table.locator('thead tr').first().locator('th').evaluateAll(els => els.map(e => [e.innerText, e.colSpan]))
  let end = -1
  for (const [text, span] of spans) { end += span; if (text.startsWith(title)) return [end - span + 1, end] }
  throw new Error(`no block ${title}`)
}
// A row's figure in the Total column of the block whose title starts with `title` (the block's last column).
const blockTotal = async (table, cells, title) => cells[(await blockRange(table, title))[1]]

test('Split by tag is one table: group rows FM, MM, SM, No sales, then Not tagged / Outside the plan, in each region', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  for (const region of ['South', 'West']) {
    await splitOn(page, region)
    const b = block(page, region)
    // ONE table — not a table per tag — and the single tagged grid is replaced, not drawn as well
    await expect(b.locator('[data-fm-mm-sm-split] table')).toHaveCount(1)
    await expect(b.getByRole('table', { name: `Sales by size and thickness · ${region}`, exact: true })).toHaveCount(0)
    const groups = splitTable(page, region).locator('tr[data-fm-mm-sm-section]')
    expect(await groups.evaluateAll(els => els.map(e => e.getAttribute('data-fm-mm-sm-section')))).toEqual(GROUPS)
    const names = await groups.evaluateAll(els => els.map(e => e.querySelector('td > span > span').innerText.trim()))
    expect(names).toEqual(['FM', 'MM', 'SM', 'No sales', 'Not tagged / Outside the plan'])
    // in order down the table
    const tops = await groups.evaluateAll(els => els.map(e => e.getBoundingClientRect().top))
    tops.slice(1).forEach((t, i) => expect(t).toBeGreaterThan(tops[i]))
  }
  await showRegion(page, 'South')
  // SHS 50x50 1.6 sells: it sits under South's FM group with its days (the group row names the tag, so the cell
  // prints days only); the 40x40 on order is under No sales
  const all = await splitRows(splitTable(page, 'South'))
  const fm50 = all.filter(r => r.group === 'FM' && !r.head && r.cells[1] === '50×50')
  expect(fm50).toHaveLength(1)
  expect(fm50[0].cells[2]).toMatch(/^\d+ d$/)
  expect(all.filter(r => r.group === 'No sales' && !r.head && r.cells[1] === '40×40')).toHaveLength(1)
  // Switch off: the single tagged grid is back, and All measures (a Split by tag chip) goes with the split
  await block(page, 'South').getByRole('switch', { name: 'Split by tag' }).uncheck()
  await expect(block(page, 'South').getByRole('table', { name: 'Sales by size and thickness · South', exact: true })).toBeVisible()
  await expect(block(page, 'South').getByRole('button', { name: 'All measures', exact: true })).toHaveCount(0)
})

test('All measures: FG days of cover, Blended monthly rate, Current inventory, Pending to Dispatch, Production required — No sales has no days or rate', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  const b = block(page, 'South')
  await b.getByRole('button', { name: 'All measures', exact: true }).click()
  await expect(b.getByRole('button', { name: 'All measures', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const t = splitTable(page, 'South')
  expect(await blockTitles(t)).toEqual(['FG days of cover', 'Blended monthly rate', 'Current inventory', 'Pending to Dispatch', 'Production required'])
  // inside a block: the thicknesses, then Total — except FG days of cover, which has no Total
  const sub = await t.locator('thead tr').nth(1).locator('th').allInnerTexts()
  expect(sub.filter(x => x === 'Total')).toHaveLength(4)
  expect(sub.every(x => x === 'Total' || /^\d+\.\d$/.test(x))).toBe(true)
  const all = await splitRows(t)
  const [d0, d1] = await blockRange(t, 'FG days of cover')
  const [r0, r1] = await blockRange(t, 'Blended monthly rate')
  // No sales: no days and no rate on any of its rows, its total row included
  const ns = all.filter(r => r.group === 'No sales' && !r.head)
  expect(ns.length).toBeGreaterThan(0)
  for (const r of ns) expect([...r.cells.slice(d0, d1 + 1), ...r.cells.slice(r0, r1 + 1)].every(v => v === '')).toBe(true)
  // No sales keeps its orders: 4 T of 40x40 on order, nothing in stock → 4 T required
  const nsTotal = ns.find(r => r.cells[1] === 'No sales total').cells
  expect(await blockTotal(t, nsTotal, 'Current inventory')).toBe('')
  expect(await blockTotal(t, nsTotal, 'Pending to Dispatch')).toBe('4.0')
  expect(await blockTotal(t, nsTotal, 'Production required')).toBe('4.0')
  await expect(t.locator('tr[data-fm-mm-sm-section="No sales"]')).toContainText(/\d+ SKUs? · \d+ cells? on this grid.*no days of cover or rate/)
  // FM's rate and inventory are figures, not blank
  const fmTotal = all.find(r => r.group === 'FM' && r.cells[1] === 'FM total').cells
  expect(Number(await blockTotal(t, fmTotal, 'Blended monthly rate'))).toBeGreaterThan(0)
  expect(Number(await blockTotal(t, fmTotal, 'Current inventory'))).toBeGreaterThan(0)
})

test('the groups add up to the Total row, and to the region’s grid total as the Tagged and not tagged table reads it', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  for (const region of ['South', 'West']) {
    await splitOn(page, region)
    const b = block(page, region)
    const t = splitTable(page, region)
    const grid = await b.getByRole('table', { name: `Tagged and not tagged · ${region}` }).locator('tbody tr').last().locator('td').allInnerTexts()
    const all = await splitRows(t)
    const groupTotals = all.filter(r => !r.head && / total$/.test(r.cells[1]) && r.cells[1] !== 'Total')
    const total = all[all.length - 1]
    expect(total.cells[1]).toBe('Total')
    // FM / MM / SM view: the Total columns of the Closing stock, Dispatch and Pending to Dispatch blocks
    for (const [i, title] of ['Closing stock', 'Dispatch', 'Pending to Dispatch'].entries()) {
      let sum = 0
      for (const g of groupTotals) sum += Number(await blockTotal(t, g.cells, title) || 0)
      expect(sum).toBeCloseTo(Number(await blockTotal(t, total.cells, title) || 0), 1)   // groups = the Total row
      expect(sum).toBeCloseTo(Number(grid[i + 1] || 0), 1)                              // = the region's grid
    }
  }
})

test('the header plant selector narrows the groups’ figures but moves no tag and no SKU count', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  await splitOn(page, 'West')
  // Every number printed on a group row or the Tagged row, bar a count of CELLS (which follows the grid), is a
  // SKU count and must be region-wide, as of today (#384 item 8).
  const heads = async (region) => { await showRegion(page, region); return splitTable(page, region).locator('tr[data-fm-mm-sm-section] td > span > span:nth-child(2)').allInnerTexts() }
  const tagged = async (region) => { await showRegion(page, region); return block(page, region).getByRole('table', { name: `Tagged and not tagged · ${region}` }).locator('tbody tr').first().locator('td').first().innerText() }
  const counts = (texts) => texts.map(t => t.replace(/\d+ cells?/g, '').match(/\d+/g)?.join(',') ?? '')
  const before = await heads('West')
  const beforeAll = { South: counts([...await heads('South'), await tagged('South')]), West: counts([...before, await tagged('West')]) }
  const westDays = async () => { await showRegion(page, 'West'); return (await splitRows(splitTable(page, 'West'))).find(r => r.group === 'FM' && r.cells[1] === '50×50').cells[2] }
  const westTag = await westDays()
  await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'NPMD' })
  await showRegion(page, 'South')
  await expect(block(page, 'South').getByText(/NPMD does not serve South/)).toBeVisible()
  expect(counts(await heads('West'))).toEqual(counts(before))
  for (const region of ['South', 'West']) expect(counts([...await heads(region), await tagged(region)])).toEqual(beforeAll[region])
  expect(await westDays()).toBe(westTag)
  await showRegion(page, 'South')
  // South has nothing at NPMD: its FM SKU is still counted, now off the grid
  await expect(splitTable(page, 'South').locator('tr[data-fm-mm-sm-section="FM"]')).toContainText(/1 SKU · 0 cells on this grid/)
})

test('at 1366 × 768 the split table fits the width and every days cell prints its number', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 })
  await signIn(page, 'admin', { rows })
  await openBy(page)
  await block(page, 'South').getByRole('button', { name: 'All measures', exact: true }).click()
  const tags = splitTable(page, 'South').locator('[data-fm-mm-sm-cell="days"]')
  expect(await tags.count()).toBeGreaterThan(0)
  for (const t of await tags.all()) {
    await expect(t).toHaveText(/^\d+ d$/)   // the group row names the tag
    expect(await t.evaluate(el => el.getBoundingClientRect().width)).toBeLessThan(120)
  }
  // no page-wide horizontal scroll: the table scrolls inside its own box
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
  await splitTable(page, 'South').locator('tr[data-fm-mm-sm-section="FM"]').scrollIntoViewIfNeeded()
  await page.screenshot({ path: process.env.SHOT_381 || 'test-results/fm-mm-sm-by-tag-1366.png', fullPage: false })
})

test('Raw material with Split by tag stacks the same groups; No sales keeps its raw material figures (#381 + #382)', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await openBy(page)
  const b = block(page, 'South')
  await b.getByRole('button', { name: 'Raw material', exact: true }).click()
  await expect(b.getByRole('button', { name: 'Raw material', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const order = await b.locator('[data-fm-mm-sm-raw-section]').evaluateAll(els => els.map(e => e.getAttribute('aria-label')))
  expect(order).toEqual(['FM', 'MM', 'SM', 'No sales', 'Not tagged / Outside the plan'].map(l => `Raw material · ${l} · South`))
  // the 40x40 on order, no stock and no coil: 4 T Production required, all of it still Raw material required
  const ns = b.getByRole('table', { name: 'Raw material by size and thickness · South · No sales', exact: true })
  expect(await blockTitles(ns)).toEqual(['FG days of cover · FM / MM / SM', 'Production required', 'Raw material available', 'Raw material required'])
  const row = await ns.locator('tbody tr', { hasText: '40×40' }).locator('td').allInnerTexts()
  expect(await blockTotal(ns, row, 'Production required')).toBe('4.0')
  expect(await blockTotal(ns, row, 'Raw material available')).toBe('')
  expect(await blockTotal(ns, row, 'Raw material required')).toBe('4.0')
  // the Total row carries each thickness's figure too, as on the Dashboard
  const tot = await totalRow(ns)
  expect(tot.filter(v => v === '4.0').length).toBeGreaterThanOrEqual(4)
  // the whole-grid table is replaced, not drawn as well
  await expect(b.getByRole('table', { name: 'Raw material by size and thickness · South', exact: true })).toHaveCount(0)
  await expect(b.getByText(/plant confirmed this method/).first()).toBeVisible()
})

import { test, expect } from '@playwright/test'
import { signIn, writeRecorder } from './signin'

// E2E for tickets #280 and #281 — the monthly campaign sheet (layout A2): its read-only columns,
// then the typed Indent and Planned and how they save.
//
// The figures are `planningCampaignView`'s, unit-tested in src/lib/calc.test.js. What only a
// browser answers is the wiring: the tab opens on the campaign, the headers name the real months,
// a figure carries its per-plant split on hover, quiet rows hide and come back, the region toggle
// shows only that region's plants' invoices; and (#281) a typed Indent moves the faint suggestion,
// a typed Planned is kept and turns amber, and both come back from `planning_campaigns`.

const tab = (page, name) => page.getByRole('button', { name, exact: true })
const SHS_50x50_16 = '1139-13064-10059417'    // DEFAULT_SKUS: MS SHS … 50x50x1.60x6000
const SHS_132x132_32 = '1139-13064-10059451'  // no master row for 132x132
const ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Dates relative to today, so the spec does not rot: the default plan month is this month.
const now = new Date()
const monthDay = (back, day) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10)
const fullMonth = (back) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
const abbr = (back) => ABBR[new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, 1)).getUTCMonth()]

const productions = [
  { id: 'p1', sku_code: SHS_50x50_16, total_weight: 0, tube_count: 6000, plant: 'hyderabad', date_of_production: monthDay(2, 3), deleted: false },
  { id: 'p2', sku_code: SHS_132x132_32, total_weight: 0, tube_count: 1000, plant: 'hyderabad', date_of_production: monthDay(2, 3), deleted: false },
]
const entry = (sku_code, weight, plant) => ({ skuCode: sku_code, weight, pieces: 1, plant })
const dispatches = [
  { id: 'd1', invoice_no: 'INV-1', date_of_dispatch: monthDay(1, 10), deleted: false,
    bundle_entries: [entry(SHS_50x50_16, 29.6, 'hyderabad'), entry(SHS_132x132_32, 12, 'hyderabad')] },
  { id: 'd2', invoice_no: 'INV-2', date_of_dispatch: monthDay(2, 10), deleted: false, bundle_entries: [entry(SHS_50x50_16, 20.9, 'hyderabad')] },
  // Shipped from NPMD: West's sale, wherever the customer is.
  { id: 'd3', invoice_no: 'INV-3', date_of_dispatch: monthDay(1, 12), deleted: false, bundle_entries: [entry(SHS_50x50_16, 21.9, 'npmd')] },
]

async function openCampaign(page, opts = {}) {
  await signIn(page, 'admin', { rows: { productions, dispatches }, ...opts })
  await tab(page, 'Production Planning').click()
  await expect(page.getByRole('heading', { name: / · South$/ })).toBeVisible()
}

// A row is named for its region, size and band, since its Size cell is empty (the size sits on the group row above).
const sheetRow = (page, name) => page.getByRole('row', { name, exact: true })

test('opens on the campaign, with headers that name the months', async ({ page }) => {
  await openCampaign(page)
  // #334: plain names under one Sold (T) heading, and the month's own date on the stock column.
  const heads = ['Size', 'Thickness (mm)', 'Buffer (T)', `Stock on 1 ${abbr(0)}`, 'Sold (T)', fullMonth(1), `${abbr(3)}–${abbr(1)}`,
    'Last 30 days', 'Last 90 days', 'Avg per month since Apr', 'This month (T)', 'Indent', 'Orders pending', 'Extra needed', 'Planned', 'Plant',
    'Coil (T)', 'Coil required', 'Coil available', 'Coil shortfall', 'Shortfall from']
  for (const name of heads) await expect(page.getByRole('columnheader', { name, exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /^(Thk|Open|Buffer|MTO)$|L30|L90|YTD/ })).toHaveCount(0)
  await expect(page.getByRole('row', { name: 'South total', exact: true })).toBeVisible()
})

test('shows South sales by the shipping plant, with the split on hover', async ({ page }) => {
  await openCampaign(page)
  const cells = sheetRow(page, 'South 50x50 1.6').getByRole('cell')
  // Size · Thickness · Buffer · Stock on the 1st · last month · three months · Last 30 · Last 90 · Avg since Apr
  await expect(cells.nth(4)).toHaveText('29.6')
  await expect(cells.nth(4)).toHaveAttribute('title', 'Hyderabad 29.6 · Lepakshi 0 (no invoices yet)')
  await expect(cells.nth(5)).toHaveText('50.5')
  // Weight is pieces × weightPerTube: 6000 × 14.59 kg = 87.5 T made, − 29.6 − 20.9 = 37.0 on the 1st
  await expect(cells.nth(3)).toHaveText('37.0')
  // Outside the plan is a small folded table: Size · Open · last month · three months.
  await page.getByText(/^Outside the plan · \d+ sizes?$/).click()
  const outside = page.getByRole('table', { name: 'Outside the plan · South' }).getByRole('row', { name: 'SHS 132x132 × 3.2' }).getByRole('cell')
  await expect(outside).toHaveText(['SHS 132x132 × 3.2', '65.7', '12.0', '12.0'])

  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await expect(sheetRow(page, 'West 50x50 1.6').getByRole('cell').nth(4)).toHaveText('21.9')
  await expect(sheetRow(page, 'West 50x50 1.6').getByRole('cell').nth(3)).toHaveText('–')
})

test('Coil (T): required, available at the line’s plant, shortfall and when it bites (#336)', async ({ page }) => {
  const thisMonth = monthDay(0, 1).slice(0, 7)
  // South 50x50 1.6 planned 30 T at Hyderabad; Hyderabad holds one 1.6 mm HR coil of 10 T.
  const planning_campaigns = [{ id: 'cc', region: 'South', month: thisMonth, deleted: false,
    lines: { 'South|50x50|1.6': { planned: 30, plant: 'hyderabad' } } }]
  const coils = [{ hr_coil_id: 'HR-16', plant: 'hyderabad', thickness: 1.6, actual_weight: 10, deleted: false }]
  await openCampaign(page, { rows: { productions, dispatches, planning_campaigns, coils } })
  await expect(page.getByRole('columnheader', { name: 'Coil (T)', exact: true })).toBeVisible()
  const cells = sheetRow(page, 'South 50x50 1.6').getByRole('cell')
  // Size0 Thickness1 Buffer2 Stock3 last4 three5 L30 6 L90 7 Avg8 Indent9 pending10 extra11 Planned12 Plant13 Coil required14 available15 shortfall16 from17
  await expect(cells.nth(14)).toHaveText('30.0')                           // Coil required = Planned still to make × 1
  await expect(cells.nth(15)).toHaveText('10.0')                           // available: HR of the band in full
  await expect(cells.nth(16)).toHaveText('20.0')                           // shortfall = 30 − 10
  await expect(cells.nth(17)).toHaveText(/needed now|^by /)                // when it bites
  // Red when needed now, amber when it bites a later week (design rules, 13-Nov).
  const now = (await cells.nth(17).textContent()) === 'needed now'
  await expect(cells.nth(16)).toHaveClass(now ? /text-red-600/ : /text-amber-800/)
  await expect(page.getByText(/shortfall timing uses the week order the app would propose at Finalise/)).toBeVisible()
})

// ── #337: the Coil tab — one heading per plant × thickness, its lines under it ──
const coilTabCase = () => ({
  planning_campaigns: [{ id: 'cc', region: 'South', month: monthDay(0, 1).slice(0, 7), deleted: false,
    lines: { 'South|50x50|1.6': { planned: 30, plant: 'hyderabad' } } }],
  coils: [{ hr_coil_id: 'HR-16', plant: 'hyderabad', thickness: 1.6, actual_weight: 10, deleted: false }],
})
const sheetTabs = (page) => page.getByRole('group', { name: 'Campaign sheet' })

test('Coil tab: Hyderabad · 1.6 mm heading with its line, the same figures as the Plan tab, and a red count on the label (#337)', async ({ page }) => {
  await openCampaign(page, { rows: { productions, dispatches, ...coilTabCase() } })
  const plan = sheetRow(page, 'South 50x50 1.6').getByRole('cell')
  const planCoil = [await plan.nth(14).textContent(), await plan.nth(16).textContent(), await plan.nth(17).textContent()]
  await expect(sheetTabs(page).getByRole('button', { name: 'Plan', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const coilBtn = sheetTabs(page).getByRole('button', { name: /^Coil/ })
  const count = await page.locator('[aria-label="Campaign sheet"] button', { hasText: /short$/ }).textContent()
  const short = Number(count.match(/(\d+) short$/)[1])
  expect(short).toBeGreaterThanOrEqual(1)
  await coilBtn.click()
  await expect(coilBtn).toHaveAttribute('aria-pressed', 'true')
  const table = page.getByRole('table', { name: 'Coil by plant and thickness' })
  for (const name of ['Line', 'Thickness (mm)', 'Planned (T)', 'Coil required (T)', 'Strip width (mm)', 'Available: slit coil (T)', 'Available: HR coil (T)', 'Coil shortfall (T)', 'Shortfall from']) {
    await expect(table.getByRole('columnheader', { name, exact: true })).toBeVisible()
  }
  // Heading: Hyderabad · 1.6 mm · on hand: HR 10.0 T, no slit | Planned | required · strip · slit · HR · shortfall · from
  const head = table.getByRole('row', { name: 'Hyderabad · 1.6 mm', exact: true }).getByRole('cell')
  await expect(head.nth(0)).toHaveText('Hyderabad · 1.6 mm · on hand: HR 10.0 T, no slit')
  await expect(head.nth(2)).toHaveText('30.0')
  await expect(head.nth(4)).toHaveText('–')                                   // no slit handed out, as the Plan tab writes it
  await expect(head.nth(5)).toHaveText('10.0')
  await expect(head.nth(6)).toHaveText('20.0')
  // The line under it reads what the Plan tab's Coil (T) columns read.
  const lineCells = table.getByRole('row', { name: 'Hyderabad SHS 50x50 1.6', exact: true }).getByRole('cell')
  await expect(lineCells.nth(2)).toHaveText('30')
  await expect(lineCells.nth(3)).toHaveText(planCoil[0])
  await expect(lineCells.nth(4)).toHaveText('196')
  await expect(lineCells.nth(6)).toHaveText('10.0')
  await expect(lineCells.nth(7)).toHaveText(planCoil[1])
  await expect(lineCells.nth(8)).toHaveText(planCoil[2])
  // The label's count is the headings with a shortfall.
  await expect(table.locator('tr[data-tone="red"], tr[data-tone="amber"]')).toHaveCount(short)
  await expect(page.getByRole('note').filter({ hasText: /within 5 mm.*coil on order is not counted/ })).toBeVisible()
})

test('switching between Plan and Coil keeps the region, month, search and chip (#337)', async ({ page }) => {
  await openCampaign(page, { rows: { productions, dispatches, ...coilTabCase() } })
  const month = page.getByRole('combobox', { name: 'Plan month' })
  const picked = await month.inputValue()
  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await page.getByRole('searchbox', { name: 'Find size' }).fill('50x50')
  await page.getByRole('group', { name: 'Row filter' }).getByRole('button', { name: /^Has stock/ }).click()
  for (const to of [/^Coil/, /^Plan$/, /^Coil/]) {
    await sheetTabs(page).getByRole('button', { name: to }).click()
    await expect(page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' })).toHaveAttribute('aria-pressed', 'true')
    await expect(month).toHaveValue(picked)
    await expect(page.getByRole('searchbox', { name: 'Find size' })).toHaveValue('50x50')
    await expect(page.getByRole('group', { name: 'Row filter' }).getByRole('button', { name: /^Has stock/ })).toHaveAttribute('aria-pressed', 'true')
  }
  await sheetTabs(page).getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(page.getByRole('heading', { name: / · West$/ })).toBeVisible()
})

test.describe('the 18-column sheet at 1366 px (#336 AC)', () => {
  test.use({ viewport: { width: 1366, height: 900 } })
  test('fits with no sideways page scroll; the scroll stays inside the sheet and Size is pinned', async ({ page }) => {
    const thisMonth = monthDay(0, 1).slice(0, 7)
    const planning_campaigns = [{ id: 'cc', region: 'South', month: thisMonth, deleted: false,
      lines: { 'South|50x50|1.6': { planned: 30, plant: 'hyderabad' } } }]
    const coils = [{ hr_coil_id: 'HR-16', plant: 'hyderabad', thickness: 1.6, actual_weight: 10, deleted: false }]
    await openCampaign(page, { rows: { productions, dispatches, planning_campaigns, coils } })
    await expect(page.getByRole('columnheader', { name: 'Shortfall from', exact: true })).toBeVisible()
    // The page itself never scrolls sideways; any width is absorbed by the sheet's own scroller.
    const noPageScroll = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
    expect(noPageScroll).toBe(true)
    // With all 18 columns the sheet fits its own scroller at 1366 px, so even that does not scroll.
    const fits = await page.evaluate(() => {
      const t = [...document.querySelectorAll('table')].find(x => x.querySelector('thead')?.textContent?.includes('Coil required'))
      const el = t?.closest('.overflow-x-auto')
      return el ? el.scrollWidth <= el.clientWidth + 1 : null
    })
    expect(fits).toBe(true)
    // Size stays pinned: its header cell is sticky to the left edge.
    const pinned = await page.getByRole('columnheader', { name: 'Size', exact: true }).evaluate(el => getComputedStyle(el).position)
    expect(pinned).toBe('sticky')
  })
})

test.describe('narrower than 1366 px (#336 AC)', () => {
  test.use({ viewport: { width: 1024, height: 800 } })
  test('the sheet scrolls inside itself and Size stays pinned at the left edge', async ({ page }) => {
    await openCampaign(page)
    await expect(page.getByRole('columnheader', { name: 'Shortfall from', exact: true })).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
    const t = page.getByRole('table').filter({ has: page.getByRole('columnheader', { name: 'Coil required', exact: true }) })
    const scroller = t.locator('xpath=ancestor::div[contains(@class,"overflow-x-auto")][1]')
    expect(await scroller.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
    const size = page.getByRole('columnheader', { name: 'Size', exact: true })
    const before = await size.boundingBox()
    await scroller.evaluate(el => { el.scrollLeft = 300 })
    const after = await size.boundingBox()
    expect(Math.abs(after.x - before.x)).toBeLessThan(1)   // pinned: does not move with the scroll
  })
})

test('hides quiet rows until asked, and writes nothing until a figure is typed', async ({ page }) => {
  const rec = writeRecorder()
  await openCampaign(page, { onRequest: rec.onRequest })
  await expect(sheetRow(page, 'South 15NB 1.2')).toHaveCount(0)
  await expect(page.getByText(/quiet rows not shown/)).toBeVisible()
  await page.getByLabel('Show quiet rows').check()
  await expect(sheetRow(page, 'South 15NB 1.2')).toBeVisible()
  await expect(sheetRow(page, 'South 15NB 1.2').getByRole('cell').nth(2)).toHaveText('Made to order')

  await rec.settle(page)
  expect(rec.writes.filter(w => w.url.includes('/rest/v1/planning'))).toHaveLength(0)
})

// ── Ticket #281: Indent → Suggested → Planned, saved per region per month ──
// South 50x50 1.6 is a Buffer row (100 MT) with 37.0 T open on the 1st (above), so:
//   no Indent / Indent 60  → max(·, 100) − 37.0 = 63    → 70
//   Indent 150             → 150 − 37.0          = 113   → 120
const thisMonth = monthDay(0, 1).slice(0, 7)
const campaignWrites = (rec) => rec.writes.filter(w => w.url.includes('/rest/v1/planning_campaigns'))
const indentBox = (page, name) => page.getByRole('textbox', { name: `Indent ${name}`, exact: true })
const plannedBox = (page, name) => page.getByRole('textbox', { name: `Planned ${name}`, exact: true })

test('types the Indent, shows the suggestion faintly in Planned, and saves one campaign on region,month', async ({ page }) => {
  const rec = writeRecorder()
  await openCampaign(page, { onRequest: rec.onRequest })
  const name = 'South 50x50 1.6'
  await expect(plannedBox(page, name)).toHaveValue('')
  await expect(plannedBox(page, name)).toHaveAttribute('placeholder', '70')

  await indentBox(page, name).fill('150')
  await indentBox(page, name).press('Enter')
  await expect(plannedBox(page, name)).toHaveAttribute('placeholder', '120')
  await expect(plannedBox(page, name)).toHaveValue('')
  await expect(plannedBox(page, name)).toHaveAttribute('title', 'Suggested 120 = max(Indent 150, Buffer 100) − Open 37.0, rounded up to 10 T')

  await rec.settle(page)
  const writes = campaignWrites(rec)
  expect(writes).toHaveLength(1)
  expect(decodeURIComponent(writes[0].url)).toContain('on_conflict=region,month')
  expect(JSON.parse(writes[0].body)).toEqual([expect.objectContaining({
    region: 'South', month: thisMonth, deleted: false, lines: { 'South|50x50|1.6': { indent: 150 } },
  })])
})

test('keeps a typed Planned when the Indent moves; the row goes amber and "use N" puts the new suggestion in', async ({ page }) => {
  await openCampaign(page)
  const name = 'South 50x50 1.6'
  await plannedBox(page, name).fill('130')
  await plannedBox(page, name).press('Enter')
  await expect(sheetRow(page, name)).not.toHaveAttribute('data-moved', 'true')

  await indentBox(page, name).fill('150')
  await indentBox(page, name).press('Enter')
  await expect(plannedBox(page, name)).toHaveValue('130')
  await expect(sheetRow(page, name)).toHaveAttribute('data-moved', 'true')
  await expect(page.getByText(/◆ 1 row moved/)).toBeVisible()

  await sheetRow(page, name).getByRole('button', { name: 'use 120' }).click()
  await expect(plannedBox(page, name)).toHaveValue('120')
  await expect(sheetRow(page, name)).not.toHaveAttribute('data-moved', 'true')
  await expect(sheetRow(page, name).getByRole('button')).toHaveCount(0)
})

test('reads Indent and Planned back from the table, kept apart per region and per month', async ({ page }) => {
  const lastMonth = monthDay(1, 1).slice(0, 7)
  const planning_campaigns = [
    { id: 'c1', region: 'South', month: thisMonth, deleted: false, lines: { 'South|50x50|1.6': { indent: 60, planned: 90, basis: 70 } } },
    { id: 'c2', region: 'West', month: thisMonth, deleted: false, lines: { 'West|50x50|1.6': { indent: 10 } } },
    { id: 'c3', region: 'South', month: lastMonth, deleted: false, lines: { 'South|50x50|1.6': { indent: 999 } } },
  ]
  await openCampaign(page, { rows: { productions, dispatches, planning_campaigns } })
  await expect(indentBox(page, 'South 50x50 1.6')).toHaveValue('60')
  await expect(plannedBox(page, 'South 50x50 1.6')).toHaveValue('90')
  await expect(sheetRow(page, 'South 50x50 1.6')).not.toHaveAttribute('data-moved', 'true')   // typed against 70, still 70

  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await expect(indentBox(page, 'West 50x50 1.6')).toHaveValue('10')
  await expect(plannedBox(page, 'West 50x50 1.6')).toHaveValue('')

  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'South' }).click()
  await page.getByLabel('Plan month').selectOption(lastMonth)
  await expect(indentBox(page, 'South 50x50 1.6')).toHaveValue('999')
  await expect(plannedBox(page, 'South 50x50 1.6')).toHaveValue('')
})

// ── Ticket #282: the Plant column ──
// South 50x50 1.6 is ticked Hyderabad + Lepakshi; 40x40 1.6 Lepakshi only; 145x82 3.0 no plant.
const plantBox = (page, name) => page.getByRole('combobox', { name: `Plant ${name}`, exact: true })
const splitBox = (page, name, plant) => page.getByRole('textbox', { name: `Split ${name} ${plant}`, exact: true })
const commit = async (box, text) => { await box.fill(text); await box.press('Enter') }

test('offers only the row’s ticked plants; one-plant rows fill in, no-plant rows are red', async ({ page }) => {
  await openCampaign(page)
  await page.getByLabel('Show quiet rows').check()
  const name = 'South 50x50 1.6'
  await expect(plantBox(page, name)).toHaveValue('')                                   // first month: Choose plant
  await expect(plantBox(page, name).locator('option')).toHaveText(['Choose plant', 'Hyderabad', 'Lepakshi', 'Split…'])
  // Plant is no longer the last column (the four Coil (T) columns sit after it, #336): index 13.
  await expect(sheetRow(page, 'South 40x40 1.6').getByRole('cell').nth(13)).toHaveText('Lepakshi')
  await expect(sheetRow(page, 'South 40x40 1.6').getByRole('combobox')).toHaveCount(0)
  await expect(sheetRow(page, 'South 145x82 3.0').getByRole('cell').nth(13)).toHaveText('No plant can make')
  await expect(sheetRow(page, 'South 145x82 3.0')).toHaveAttribute('data-red', 'true')

  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await expect(plantBox(page, 'West 50x50 1.6').locator('option')).toHaveText(['Choose plant', 'NPMD', 'Tapi', 'Split…'])
})

test('Split… 120 as Hyderabad 45 · Lepakshi 75 is accepted; 45 · 70 shows red; the summary follows', async ({ page }) => {
  const rec = writeRecorder()
  await openCampaign(page, { onRequest: rec.onRequest })
  const name = 'South 50x50 1.6'
  const summary = page.getByLabel('Campaign summary')
  await commit(plannedBox(page, name), '120')
  await plantBox(page, name).selectOption('split')
  await expect(sheetRow(page, name)).toHaveAttribute('data-red', 'true')
  await commit(splitBox(page, name, 'Hyderabad'), '45')
  await commit(splitBox(page, name, 'Lepakshi'), '70')
  await expect(sheetRow(page, name)).toHaveAttribute('data-red', 'true')
  await expect(sheetRow(page, name)).toContainText('115 of 120')
  await expect(summary).toContainText('1 split does not add up to Planned')
  await commit(splitBox(page, name, 'Lepakshi'), '75')
  await expect(sheetRow(page, name)).not.toHaveAttribute('data-red', 'true')
  await expect(sheetRow(page, name)).toContainText('= 120')
  await expect(summary).not.toContainText('does not add up')

  await rec.settle(page)
  const last = campaignWrites(rec).at(-1)
  expect(JSON.parse(last.body)[0].lines['South|50x50|1.6']).toEqual({ planned: 120, basis: 70, split: { hyderabad: 45, lepakshi: 75 } })

  // Picking one plant ends the split, and the whole 120 goes to it.
  await plantBox(page, name).selectOption('hyderabad')
  await expect(splitBox(page, name, 'Hyderabad')).toHaveCount(0)
  await expect(summary).toContainText(/Hyderabad 1\d\d\.\d T/)
})

test('a two-plant row starts on last month’s plant, and an unticked plant with stock shows an amber dot', async ({ page }) => {
  const lastMonth = monthDay(1, 1).slice(0, 7)
  const SHS_40x40_16 = '1139-13064-10059408'
  const planning_campaigns = [
    { id: 'c1', region: 'South', month: lastMonth, deleted: false, lines: { 'South|50x50|1.6': { plant: 'lepakshi' }, 'South|50x50|2.0': { split: { hyderabad: 10, lepakshi: 10 } } } },
  ]
  const more = [...productions, { id: 'p3', sku_code: SHS_40x40_16, total_weight: 0, tube_count: 1000, plant: 'hyderabad', date_of_production: monthDay(2, 3), deleted: false }]
  await openCampaign(page, { rows: { productions: more, dispatches, planning_campaigns } })
  await expect(plantBox(page, 'South 50x50 1.6')).toHaveValue('lepakshi')
  await expect(plantBox(page, 'South 50x50 1.6')).toHaveAttribute('title', 'From last month’s campaign')
  await expect(plantBox(page, 'South 50x50 2.0')).toHaveValue('')                      // last month split: blank
  // 40x40 1.6 is ticked Lepakshi only; Hyderabad holds 1000 × 11.58 kg = 11.6 T of it.
  await expect(sheetRow(page, 'South 40x40 1.6').getByRole('img')).toHaveAttribute('title', 'Hyderabad: 11.6 T open — not ticked on the planning master')
})

// ── Design rules (user, 13-Nov-2026, #334 / #335 comments) ──
// The grouped heading row is 10 px caps, muted, over a rule; the column names stay 11 px semibold.
// Extra needed's `+N` is indigo (tonnes added); ◆ moved is amber.
test('the group heading is small caps over a rule, and Extra needed +N is indigo', async ({ page }) => {
  const orders = [{ id: 'o1', line_id: 'o1', distributor_code: 'T1', customer: 'T1', ship_to_state: 'TELANGANA', mm_id: SHS_50x50_16,
    description: 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x1.60x6000', quantity: 200, confirmed: 200, non_confirmed: 0, invoiced_qty: 0, order_status: '', order_date: monthDay(0, 1), deleted: false }]
  await openCampaign(page, { rows: { productions, dispatches, orders } })
  const group = page.getByRole('columnheader', { name: 'Sold (T)', exact: true })
  const g = await group.evaluate(el => { const s = getComputedStyle(el); return { size: s.fontSize, tt: s.textTransform, rule: s.borderBottomStyle } })
  expect(g).toEqual({ size: '10px', tt: 'uppercase', rule: 'solid' })
  const col = page.getByRole('columnheader', { name: 'Extra needed', exact: true })
  expect(await col.evaluate(el => [getComputedStyle(el).fontSize, getComputedStyle(el).textTransform, getComputedStyle(el).fontWeight]))
    .toEqual(['11px', 'none', '600'])
  const extra = sheetRow(page, 'South 50x50 1.6').getByRole('cell').nth(11)
  await expect(extra).toHaveText(/^\+\d+$/)
  await expect(extra).toHaveClass(/text-indigo-700/)
})

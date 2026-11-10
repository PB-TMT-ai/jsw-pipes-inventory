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
  await expect(page.getByRole('heading', { name: /campaign$/ })).toBeVisible()
}

// A row is named for its region, size and band, since the Size cell shows '·' below a group's first row.
const sheetRow = (page, name) => page.getByRole('row', { name, exact: true })

test('opens on the campaign, with headers that name the months', async ({ page }) => {
  await openCampaign(page)
  await expect(page.getByRole('columnheader', { name: 'Open', exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: abbr(1), exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: `${abbr(3)}–${abbr(1)}`, exact: true })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: /L30|L90/ })).toHaveCount(0)
})

test('shows South sales by the shipping plant, with the split on hover', async ({ page }) => {
  await openCampaign(page)
  const cells = sheetRow(page, 'South 50x50 1.6').getByRole('cell')
  // Size · Thk · Buffer · Open · last month · three months
  await expect(cells.nth(4)).toHaveText('29.6')
  await expect(cells.nth(4)).toHaveAttribute('title', 'Hyd 29.6 · Lep 0 (no invoices yet)')
  await expect(cells.nth(5)).toHaveText('50.5')
  // Weight is pieces × weightPerTube: 6000 × 14.59 kg = 87.5 T made, − 29.6 − 20.9 = 37.0 on the 1st
  await expect(cells.nth(3)).toHaveText('37.0')
  await expect(page.locator('p', { hasText: 'Outside the plan (South):' })).toContainText('SHS 132x132 × 3.2 Open 65.7, '+abbr(1)+' 12.0, '+abbr(3)+'–'+abbr(1)+' 12.0')

  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await expect(sheetRow(page, 'West 50x50 1.6').getByRole('cell').nth(4)).toHaveText('21.9')
  await expect(sheetRow(page, 'West 50x50 1.6').getByRole('cell').nth(3)).toHaveText('–')
})

test('hides quiet rows until asked, and writes nothing until a figure is typed', async ({ page }) => {
  const rec = writeRecorder()
  await openCampaign(page, { onRequest: rec.onRequest })
  await expect(sheetRow(page, 'South 15NB 1.2')).toHaveCount(0)
  await expect(page.getByText(/quiet rows not shown/)).toBeVisible()
  await page.getByLabel('Hide quiet rows').uncheck()
  await expect(sheetRow(page, 'South 15NB 1.2')).toBeVisible()

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
  await expect(plannedBox(page, name)).toHaveAttribute('title', 'Suggested 120 = max(Indent 150, Buffer 100) − Open 37.0, rounded up to 10 MT')

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
  await expect(page.getByText(/1 row has a typed Planned whose suggestion has moved/)).toBeVisible()

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
  await page.getByLabel('Hide quiet rows').uncheck()
  const name = 'South 50x50 1.6'
  await expect(plantBox(page, name)).toHaveValue('')                                   // first month: Choose…
  await expect(plantBox(page, name).locator('option')).toHaveText(['Choose…', 'Hyderabad', 'Lepakshi', 'Split…'])
  await expect(sheetRow(page, 'South 40x40 1.6').getByRole('cell').last()).toHaveText('Lepakshi')
  await expect(sheetRow(page, 'South 40x40 1.6').getByRole('combobox')).toHaveCount(0)
  await expect(sheetRow(page, 'South 145x82 3.0').getByRole('cell').last()).toHaveText('No plant can make')
  await expect(sheetRow(page, 'South 145x82 3.0')).toHaveAttribute('data-red', 'true')

  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await expect(plantBox(page, 'West 50x50 1.6').locator('option')).toHaveText(['Choose…', 'NPMD', 'Tapi', 'Split…'])
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

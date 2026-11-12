import { test, expect } from '@playwright/test'
import { signIn, writeRecorder } from './signin'
import { planningCampaignView } from '../src/lib/calc'

// E2E for ticket #283 — Finalise a region's month: the Baseline and the logged change.
//
// The rules are `planningCampaignFinalise` / `planningCampaignSave`'s, unit-tested in
// src/lib/calc.test.js. What only a browser answers is the wiring: the button names the month and
// region, refuses while a row needs a plant and jumps to it, the reason dialog holds a Planned edit
// back until a reason is typed, the row shows ↺ revised beside its Baseline, the change log lists
// it, and no control on the sheet goes back to Draft.

const tab = (page, name) => page.getByRole('button', { name, exact: true })
const SHS_50x50_16 = '1139-13064-10059417'    // DEFAULT_SKUS: MS SHS … 50x50x1.60x6000

const now = new Date()
const monthDay = (back, day) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - back, day)).toISOString().slice(0, 10)
const thisMonth = monthDay(0, 1).slice(0, 7)
const MONTH = new Date(`${thisMonth}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })

// 37.0 T of South SHS 50x50 1.6 on the 1st (see campaign.spec.js): its Buffer 100 suggests 70.
const productions = [
  { id: 'p1', sku_code: SHS_50x50_16, total_weight: 0, tube_count: 6000, plant: 'hyderabad', date_of_production: monthDay(2, 3), deleted: false },
]
const dispatches = [
  { id: 'd1', invoice_no: 'INV-1', date_of_dispatch: monthDay(1, 10), deleted: false,
    bundle_entries: [{ skuCode: SHS_50x50_16, weight: 29.6, pieces: 1, plant: 'hyderabad' }] },
  { id: 'd2', invoice_no: 'INV-2', date_of_dispatch: monthDay(2, 10), deleted: false,
    bundle_entries: [{ skuCode: SHS_50x50_16, weight: 20.9, pieces: 1, plant: 'hyderabad' }] },
]

// This month's South campaign with every two-plant row already on Hyderabad, except 50x50 1.6 —
// so exactly one row needs a plant. Built from the shipped planning master, not typed by hand.
const NAME = 'South 50x50 1.6'
const KEY = 'South|50x50|1.6'
const twoPlant = planningCampaignView({ month: thisMonth, today: monthDay(0, 1) }).regions
  .find(g => g.region === 'South').rows.filter(r => r.plantOptions.length === 2).map(r => r.id)
const seeded = (extra = {}) => [{
  id: 'c1', region: 'South', month: thisMonth, deleted: false,
  lines: { ...Object.fromEntries(twoPlant.filter(k => k !== KEY).map(k => [k, { plant: 'hyderabad' }])), ...extra },
}]

async function openCampaign(page, planning_campaigns, opts = {}) {
  await signIn(page, 'admin', { rows: { productions, dispatches, planning_campaigns }, ...opts })
  await tab(page, 'Production Planning').click()
  await expect(page.getByRole('heading', { name: / · South$/ })).toBeVisible()
}
const sheetRow = (page, name) => page.getByRole('row', { name, exact: true })
const plannedBox = (page, name) => page.getByRole('textbox', { name: `Planned ${name}`, exact: true })
const indentBox = (page, name) => page.getByRole('textbox', { name: `Indent ${name}`, exact: true })
const plantBox = (page, name) => page.getByRole('combobox', { name: `Plant ${name}`, exact: true })
const commit = async (box, text) => { await box.fill(text); await box.press('Enter') }
const finaliseButton = (page) => page.getByRole('button', { name: `Finalise ${MONTH} — South`, exact: true })
const campaignWrites = (rec) => rec.writes.filter(w => w.url.includes('/rest/v1/planning_campaigns'))

test('is refused while a row needs a plant, jumps to it, and finalises once it has one', async ({ page }) => {
  const rec = writeRecorder()
  await openCampaign(page, seeded(), { onRequest: rec.onRequest })
  const summary = page.getByLabel('Campaign summary')
  await expect(summary).toContainText('Not yet: 1 row needs a plant')
  await page.getByLabel('Find size').fill('100x50')                    // the row is not on screen
  await finaliseButton(page).click()
  await expect(plantBox(page, NAME)).toBeFocused()                     // search cleared, cursor in its Plant cell
  await expect(page.getByRole('button', { name: 'Yes, finalise' })).toHaveCount(0)

  await commit(plannedBox(page, NAME), '110')
  await plantBox(page, NAME).selectOption('hyderabad')
  await expect(summary).not.toContainText('Not yet')
  await finaliseButton(page).click()
  await expect(summary).toContainText(`Finalise ${MONTH} — South? It cannot be undone.`)
  await page.getByRole('button', { name: 'Yes, finalise' }).click()
  await expect(page.getByRole('status', { name: 'Finalised' })).toContainText('by admin')
  await expect(finaliseButton(page)).toHaveCount(0)
  await expect(page.getByRole('columnheader', { name: 'Baseline', exact: true })).toBeVisible()

  await rec.settle(page)
  const row = JSON.parse(campaignWrites(rec).at(-1).body)[0]
  expect(row).toMatchObject({ region: 'South', month: thisMonth, finalised_by: 'admin', changes: [] })
  expect(row.finalised_at).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  expect(row.baseline[KEY]).toEqual({ planned: 110, suggested: 70, indent: null, plant: 'hyderabad', split: null })
})

test('after Finalise a Planned edit needs a reason; it is logged, ↺ revised, and the Baseline stays 110', async ({ page }) => {
  const rec = writeRecorder()
  await openCampaign(page, seeded({ [KEY]: { planned: 110, basis: 70, plant: 'hyderabad' } }), { onRequest: rec.onRequest })
  await finaliseButton(page).click()
  await page.getByRole('button', { name: 'Yes, finalise' }).click()
  await expect(page.getByRole('status', { name: 'Finalised' })).toBeVisible()
  await rec.settle(page)
  const before = campaignWrites(rec).length

  // Without a reason nothing is saved.
  await commit(plannedBox(page, NAME), '150')
  const dialog = page.getByRole('dialog', { name: 'Reason for the change' })
  await expect(dialog).toContainText(`${NAME}: Planned 110 → 150`)
  await expect(dialog.getByRole('button', { name: 'Save change' })).toBeDisabled()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
  await expect(plannedBox(page, NAME)).toHaveValue('110')
  await rec.settle(page)
  expect(campaignWrites(rec)).toHaveLength(before)

  // With one it is.
  await commit(plannedBox(page, NAME), '150')
  await dialog.getByLabel('Reason').fill('Distributor indent raised')
  await dialog.getByRole('button', { name: 'Save change' }).click()
  await expect(plannedBox(page, NAME)).toHaveValue('150')
  const cells = sheetRow(page, NAME).getByRole('cell')
  await expect(sheetRow(page, NAME)).toHaveAttribute('data-revised', 'true')
  await expect(sheetRow(page, NAME)).toContainText('↺ revised')
  // Size · Thk · Buffer · Open · last · three · Indent · Planned · Baseline · Plant
  await expect(cells.nth(8)).toHaveText('110')
  await expect(page.getByLabel('Change log')).toContainText('Changes since Finalise (1)')
  await expect(page.getByLabel('Change log')).toContainText('50x50 1.6 · Planned 110 → 150 · Distributor indent raised')

  await rec.settle(page)
  const row = JSON.parse(campaignWrites(rec).at(-1).body)[0]
  expect(row.baseline[KEY].planned).toBe(110)
  expect(row.lines[KEY].planned).toBe(150)
  expect(row.changes).toEqual([expect.objectContaining({ by: 'admin', rowKey: KEY, field: 'planned', from: 110, to: 150, reason: 'Distributor indent raised' })])
})

test('an Indent edit after Finalise moves Suggested only, turns the row amber, and asks no reason', async ({ page }) => {
  await openCampaign(page, seeded({ [KEY]: { plant: 'hyderabad' } }))
  await finaliseButton(page).click()
  await page.getByRole('button', { name: 'Yes, finalise' }).click()
  await expect(plannedBox(page, NAME)).toHaveValue('70')               // the suggestion, now kept as typed
  await commit(indentBox(page, NAME), '150')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(plannedBox(page, NAME)).toHaveValue('70')
  await expect(sheetRow(page, NAME)).toHaveAttribute('data-moved', 'true')
  await expect(sheetRow(page, NAME).getByRole('button', { name: 'use 120' })).toBeVisible()
  await expect(sheetRow(page, NAME)).not.toHaveAttribute('data-revised', 'true')
})

test('a finalised month read back from the table has no control that returns it to Draft', async ({ page }) => {
  const [c] = seeded({ [KEY]: { planned: 110, basis: 70, plant: 'hyderabad' } })
  const finalised = [{ ...c, finalised_at: `${thisMonth}-05T09:00:00+00:00`, finalised_by: 'admin', baseline: { [KEY]: { planned: 110, suggested: 70, plant: 'hyderabad' } }, changes: [] }]
  await openCampaign(page, finalised)
  await expect(page.getByRole('status', { name: 'Finalised' })).toContainText('by admin')
  await expect(page.getByRole('button', { name: /finalise|draft|reopen|unlock/i })).toHaveCount(0)
  await expect(page.getByLabel('Change log')).toContainText('none')
  // West is its own campaign, still in Draft.
  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await expect(page.getByRole('button', { name: `Finalise ${MONTH} — West`, exact: true })).toBeVisible()
})

// ── Ticket #302: the clean-sheet layout — chips, collapsed sizes, and the jump clearing both ──
test('a chip shows only the rows it names; the jump to the first blocker clears the chip and any collapse', async ({ page }) => {
  await openCampaign(page, seeded())
  const chips = page.getByRole('group', { name: 'Row filter' })
  await expect(chips.getByRole('button', { name: /^Needs a plant 1$/ })).toBeVisible()
  // The summary's link sets the same chip: exactly the one row that needs a plant.
  await page.getByRole('button', { name: '1 row — show only these' }).click()
  await expect(chips.getByRole('button', { name: /^Needs a plant/ })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('tr[data-row-key]')).toHaveCount(1)
  await expect(sheetRow(page, NAME)).toBeVisible()
  // Has stock: 50x50 1.6 holds the only stock.
  await chips.getByRole('button', { name: /^Has stock/ }).click()
  await expect(page.locator('tr[data-row-key]')).toHaveCount(1)
  // The size row reads the group's subtotals: Open 37.0 and "1 to assign".
  await expect(page.getByRole('row', { name: 'South 50x50', exact: true })).toContainText('37.0')
  await expect(page.getByRole('row', { name: 'South 50x50', exact: true })).toContainText('1 to assign')

  // Collapse everything and leave a chip that hides the row: the jump still lands on it.
  await chips.getByRole('button', { name: /^No plant can make/ }).click()
  await page.getByRole('button', { name: 'Collapse all' }).click()
  await expect(page.locator('tr[data-row-key]')).toHaveCount(0)
  await finaliseButton(page).click()
  await expect(plantBox(page, NAME)).toBeFocused()
  await expect(chips.getByRole('button', { name: /^All rows/ })).toHaveAttribute('aria-pressed', 'true')
})

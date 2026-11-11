import { test, expect } from '@playwright/test'
import { signIn } from './signin'
import { planningCampaignView, planningCampaignFinalise, planningWeeks } from '../src/lib/calc'

// E2E for ticket #284 — the weekly screen (layout D + A): once a region's month is finalised, the
// app's week plan per plant. The rules (weeks, run order, whole-row placement, split shares) are
// `planningWeekPlanView`'s, unit-tested in src/lib/calc.test.js. What only a browser answers is the
// wiring: the Week plan screen reads the same finalised campaign the monthly sheet shows, each
// plant's month matches the campaign summary, a split row sits in both plants with its own part,
// and an unfinalised region shows no weeks.

const tab = (page, name) => page.getByRole('button', { name, exact: true })
const now = new Date()
const thisMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 7)
const MONTH = new Date(`${thisMonth}-01T00:00:00Z`).toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })
const KEY = 'South|50x50|1.6'

// This month's South campaign: every two-plant row on Hyderabad, except 50x50 1.6, split Hyderabad
// 40 / Lepakshi 30 (its Planned is typed 70). Finalised by the app's own Finalise, from the shipped
// planning master — not typed by hand.
const view = (campaigns) => planningCampaignView({ month: thisMonth, today: `${thisMonth}-01`, campaigns })
const south = (campaigns) => view(campaigns).regions.find(g => g.region === 'South')
const twoPlant = south([]).rows.filter(r => r.plantOptions.length === 2).map(r => r.id)
const draft = [{
  id: 'c1', region: 'South', month: thisMonth, deleted: false,
  lines: {
    ...Object.fromEntries(twoPlant.filter(k => k !== KEY).map(k => [k, { plant: 'hyderabad' }])),
    [KEY]: { planned: 70, basis: 70, split: { hyderabad: 40, lepakshi: 30 } },
  },
}]
const fin = planningCampaignFinalise(draft, { region: 'South', month: thisMonth }, { rows: south(draft).rows, by: 'admin', at: `${thisMonth}-01T09:00:00.000Z` })
if (fin.problem) throw new Error(fin.problem)
const { finalisedAt, finalisedBy, ...rest } = fin.stored[0]
const finalised = [{ ...rest, finalised_at: finalisedAt, finalised_by: finalisedBy }]

async function openWeekPlan(page, planning_campaigns) {
  await signIn(page, 'admin', { rows: { planning_campaigns } })
  await tab(page, 'Production Planning').click()
  await page.getByRole('group', { name: 'Planning screen' }).getByRole('button', { name: 'Week plan' }).click()
  await expect(page.getByRole('heading', { name: /by week$/ })).toBeVisible()
}

test("a finalised South shows each plant's weeks; the month matches the campaign summary", async ({ page }) => {
  await signIn(page, 'admin', { rows: { planning_campaigns: finalised } })
  await tab(page, 'Production Planning').click()
  const summary = page.getByLabel('Campaign summary')
  await expect(page.getByRole('status', { name: 'Finalised' })).toBeVisible()
  const said = await summary.textContent()
  const hydT = said.match(/Hyderabad ([\d.]+) T/)[1]
  const lepT = said.match(/Lepakshi ([\d.]+) T/)[1]

  await page.getByRole('group', { name: 'Planning screen' }).getByRole('button', { name: 'Week plan' }).click()
  const overview = page.getByRole('table', { name: 'Region overview' })
  const weeks = planningWeeks(thisMonth)
  for (const w of weeks) await expect(overview.getByRole('columnheader', { name: new RegExp(`^${w.key}`) })).toBeVisible()
  // Plant · W1..Wn · Month: the last cell is the plant's assigned Planned.
  await expect(overview.getByRole('row', { name: 'Hyderabad', exact: true }).getByRole('cell').last()).toHaveText(hydT)
  await expect(overview.getByRole('row', { name: 'Lepakshi', exact: true }).getByRole('cell').last()).toHaveText(lepT)
  await expect(overview.getByRole('row', { name: /^NPMD|^Tapi/ })).toHaveCount(0)

  // The split row: Hyderabad's part in Hyderabad's plan, Lepakshi's in Lepakshi's — one week each.
  const hyd = page.getByRole('region', { name: 'Hyderabad week plan' })
  const row = hyd.getByRole('row', { name: '50x50 1.6', exact: true })
  await expect(row.getByRole('cell').nth(4)).toHaveText('40.0ˢ')
  await expect(row).toHaveAttribute('data-week', /^W\d$/)
  await overview.getByRole('button', { name: 'Lepakshi' }).click()
  const lep = page.getByRole('region', { name: 'Lepakshi week plan' })
  await expect(lep.getByRole('row', { name: '50x50 1.6', exact: true }).getByRole('cell').nth(4)).toHaveText('30.0ˢ')
  // View only: nothing on the screen moves a row.
  await expect(lep.getByRole('button')).toHaveCount(0)
  await expect(lep.getByRole('textbox')).toHaveCount(0)
})

test('an unfinalised region has no weeks: West waits for its own Finalise', async ({ page }) => {
  await openWeekPlan(page, finalised)
  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await expect(page.getByRole('note')).toContainText(`West’s ${MONTH} plan is not finalised yet`)
  await expect(page.getByRole('table', { name: 'Region overview' })).toHaveCount(0)
})

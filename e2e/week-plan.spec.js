import { test, expect } from '@playwright/test'
import { signIn, writeRecorder } from './signin'
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
  // #285: the only control on a row is its week — never its plant.
  await expect(lep.getByRole('combobox', { name: /^Plant / })).toHaveCount(0)
  await expect(lep.getByRole('combobox', { name: 'Week 50x50 1.6', exact: true })).toBeVisible()
})

// ── Ticket #285: move and split rows across weeks ──
// The rules (stored weeks, red splits, the Monday figure, the log) are `planningWeekSave` /
// `planningWeekPlanView`'s, unit-tested in calc.test.js. Here: the Week picker moves the row and
// both week totals, the move is logged with no reason asked, "was X on Mon" shows where that
// week's Monday has passed, and Split… stays red until the weeks add up.
const todayIso = now.toISOString().slice(0, 10)
const weeksOf = planningWeeks(thisMonth)
const campaignWrites = (rec) => rec.writes.filter(w => w.url.includes('/rest/v1/planning_campaigns'))

test('moving a row to another week moves both week totals and is logged, with no reason asked', async ({ page }) => {
  const rec = writeRecorder()
  await signIn(page, 'admin', { rows: { planning_campaigns: finalised }, onRequest: rec.onRequest })
  await tab(page, 'Production Planning').click()
  await page.getByRole('group', { name: 'Planning screen' }).getByRole('button', { name: 'Week plan' }).click()
  const overview = page.getByRole('table', { name: 'Region overview' })
  const hyd = page.getByRole('region', { name: 'Hyderabad week plan' })
  const row = hyd.getByRole('row', { name: '50x50 1.6', exact: true })
  const from = (await row.getAttribute('data-week'))
  const a = weeksOf.findIndex(w => w.key === from)
  // To the week holding today (or a neighbour, when it is already there).
  const cur = Math.max(0, weeksOf.findIndex(w => w.from <= todayIso && todayIso <= w.to))
  const b = a !== cur ? cur : (cur + 1 < weeksOf.length ? cur + 1 : cur - 1)
  const total = async (j) => Number(await overview.getByRole('row', { name: 'Hyderabad', exact: true }).getByRole('cell').nth(j + 1).textContent())
  const [ta, tb] = [await total(a), await total(b)]

  await hyd.getByRole('combobox', { name: 'Week 50x50 1.6', exact: true }).selectOption(weeksOf[b].key)
  await expect(page.getByRole('dialog')).toHaveCount(0)                     // no reason asked
  await expect(row).toHaveAttribute('data-week', weeksOf[b].key)
  await expect.poll(() => total(a)).toBeCloseTo(ta - 40, 1)
  await expect.poll(() => total(b)).toBeCloseTo(tb + 40, 1)
  await expect(page.getByRole('region', { name: 'Week moves' })).toContainText(`admin · Hyderabad · 50x50 1.6 · ${weeksOf[a].key} → ${weeksOf[b].key}`)
  // "was X on Mon" on a cell whose week's Monday has passed; none on a week still to come.
  const cell = (j) => row.getByRole('cell').nth(6 + j)
  for (const [j, was] of [[a, '40.0'], [b, '0.0']]) {
    if (weeksOf[j].monday <= todayIso) await expect(cell(j)).toContainText(`was ${was} on ${weeksOf[j].mondayLabel}`)
    else await expect(cell(j)).not.toContainText('was')
  }

  await rec.settle(page)
  const saved = JSON.parse(campaignWrites(rec).at(-1).body)[0]
  expect(saved.lines[KEY].weeks.hyderabad).toEqual({ week: weeksOf[b].key })
  expect(saved.lines[KEY].split).toEqual({ hyderabad: 40, lepakshi: 30 })    // the plant is untouched
  expect(saved.changes.at(-1)).toMatchObject({ field: 'week', plant: 'hyderabad', by: 'admin', from: { [weeksOf[a].key]: 40 }, to: { [weeksOf[b].key]: 40 } })
  expect(saved.changes.at(-1).reason).toBeUndefined()
})

test('Split… is red until the weeks add up to the row’s tonnes', async ({ page }) => {
  await openWeekPlan(page, finalised)
  const hyd = page.getByRole('region', { name: 'Hyderabad week plan' })
  const row = hyd.getByRole('row', { name: '50x50 1.6', exact: true })
  const was = await row.getAttribute('data-week')
  await hyd.getByRole('combobox', { name: 'Week 50x50 1.6', exact: true }).selectOption('split')
  const part = (w) => hyd.getByRole('textbox', { name: `Week ${w} 50x50 1.6`, exact: true })
  await part('W1').fill('25')
  await part('W1').press('Enter')
  await expect(row).toContainText('25.0 of 40.0')
  await expect(row).toHaveAttribute('data-week', was)                       // not yet the row's plan
  await part('W2').fill('15')
  await part('W2').press('Enter')
  await expect(row).toContainText('= 40.0')
  await expect(row).toHaveAttribute('data-week', 'W1 W2')
})

test('an unfinalised region has no weeks: West waits for its own Finalise', async ({ page }) => {
  await openWeekPlan(page, finalised)
  await page.getByRole('group', { name: 'Region' }).getByRole('button', { name: 'West' }).click()
  await expect(page.getByRole('note')).toContainText(`West’s ${MONTH} plan is not finalised yet`)
  await expect(page.getByRole('table', { name: 'Region overview' })).toHaveCount(0)
})

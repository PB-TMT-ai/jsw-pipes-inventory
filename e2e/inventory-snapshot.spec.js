import { test, expect } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { signIn } from './signin.js'

// ── Inventory Snapshot (#214): the one Reports download that ignores the header plant filter ──
// The builder has no plant option to ignore (reports.test.js covers that). What only a browser can
// show is the WIRING: that the Reports tab hands it the unfiltered stores, so picking NPMD in the
// header leaves the file byte-for-byte the same, and that the banner says so.
const today = new Date().toISOString().slice(0, 10)
// Two plants' rows, seeded straight into the stubbed tables. Codes are DEFAULT_SKUS entries
// (SKU-001 SHS 25x25 2.5 at 10.5975 kg/tube; SKU-002 SHS 25x25 1.6 at 7.053696 kg/tube), because
// production tonnage is re-derived from the SKU master on load.
const rows = {
  productions: [
    { id: 'p-hyd', sku_code: '1139-13064-10055315', tube_count: 1000, plant: 'hyderabad', date_of_production: today },
    { id: 'p-npm', sku_code: '1139-13064-10055318', tube_count: 2000, plant: 'npmd', date_of_production: today },
  ],
  dispatches: [
    { id: 'd-hyd', date_of_dispatch: today, invoice_no: 'INV-1',
      bundle_entries: [{ skuCode: '1139-13064-10055315', plant: 'hyderabad', pieces: 200, weight: 2.1195 }] },
  ],
}

const download = async (page) => {
  const [file] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: '⬇ Inventory Snapshot (.html)' }).click(),
  ])
  return { name: file.suggestedFilename(), html: await readFile(await file.path(), 'utf8') }
}

test('the Inventory Snapshot covers every plant whatever the header says', async ({ page }) => {
  await signIn(page, 'admin', { rows })
  await page.getByRole('button', { name: 'Reports', exact: true }).click()

  const all = await download(page)
  expect(all.name).toBe(`Inventory-Snapshot-${today}.html`)
  expect(all.html).toContain('Inventory snapshot, plant-wise RM and FG')
  expect(all.html).toContain('Nippon (S)')
  expect(all.html).toMatch(/data:image\/png;base64,/)

  await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'NPMD' })
  await expect(page.getByText('The Inventory Snapshot still covers all plants')).toBeVisible()

  const scoped = await download(page)
  expect(scoped.name).toBe(all.name)
  expect(scoped.html).toBe(all.html)
})

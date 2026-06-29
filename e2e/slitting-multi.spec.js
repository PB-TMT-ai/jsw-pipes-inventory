import { test, expect } from '@playwright/test'

// E2E for Stage 2 Slitting: multi-row baby-coil entry (one mother → many baby coils in a
// SINGLE save) and the dedicated Baby Coil ID table search.
//
// Runs against a Vite server with dummy Supabase creds (.env.test), so backend writes fail
// and the flow is exercised via React's optimistic in-session state. ONE session per test,
// NO page reloads mid-flow.

// Field labels render as `<label>○ Label</label><input/>` (no htmlFor); plain inputs are the
// label's following-sibling. The searchable picker (SearchSelect) nests its <input> inside a
// sibling <div>, so it is located through that div.
const inputFor = (page, label) =>
  page.locator('label', { hasText: label }).locator('xpath=following-sibling::input[1]')
const searchInputFor = (page, label) =>
  page.locator('label', { hasText: label }).locator('xpath=following-sibling::div[1]//input')
const gotoTab = (page, name) => page.getByRole('button', { name, exact: true }).click()

// Drive a SearchSelect: focus, type a query to filter, then click the matching option.
async function pickSearch(page, label, query) {
  const input = searchInputFor(page, label)
  await input.click()
  await input.fill(query)
  await page.getByRole('button', { name: query }).first().click()
}

async function addCoil(page, { thickness = '2.5', actualWeight, width = '150' }) {
  await page.getByRole('button', { name: '+ Add Coil' }).click()
  await inputFor(page, 'Thickness (mm)').fill(thickness)
  await inputFor(page, 'Width (mm)').fill(width)
  await inputFor(page, 'Actual Weight (T)').fill(actualWeight)
  await page.getByRole('button', { name: 'Save Coil' }).click()
}

// All Width (mm) inputs inside the open Slitting form (one per baby-coil row).
const rowWidths = (page) =>
  page.locator('label', { hasText: 'Width (mm)' }).locator('xpath=following-sibling::input[1]')

test.describe('Slitting — multi-row entry + search', () => {
  test('one mother → three baby coils saved together', async ({ page }) => {
    await page.goto('/')

    // Register a mother coil (12T, 150mm wide).
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '12', costPrice: '600000', width: '150' })
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    expect(coilId).toMatch(/^HYD-\d{4}-\d{2}$/)

    // Open the Slitting form, pick the mother via the searchable picker, add three rows.
    await gotoTab(page, '2. Slitting')
    await page.getByRole('button', { name: '+ Add Baby Coil' }).click()
    await pickSearch(page, 'HR Coil ID', coilId)

    const widths = rowWidths(page)
    await widths.nth(0).fill('40')
    await page.getByRole('button', { name: '+ Add row' }).click()
    await widths.nth(1).fill('40')
    await page.getByRole('button', { name: '+ Add row' }).click()
    await widths.nth(2).fill('40')

    // Auto-assigned letters A/B/C populate the disabled Baby Coil ID fields before saving.
    const babyIds = page.locator('label', { hasText: 'Baby Coil ID' }).locator('xpath=following-sibling::input[1]')
    await expect(babyIds.nth(0)).toHaveValue(`${coilId}-A`)
    await expect(babyIds.nth(1)).toHaveValue(`${coilId}-B`)
    await expect(babyIds.nth(2)).toHaveValue(`${coilId}-C`)

    // One click saves all three.
    await page.getByRole('button', { name: /Save 3 Baby Coils/ }).click()

    const table = page.locator('table')
    await expect(table.getByText(`${coilId}-A`, { exact: true })).toBeVisible()
    await expect(table.getByText(`${coilId}-B`, { exact: true })).toBeVisible()
    await expect(table.getByText(`${coilId}-C`, { exact: true })).toBeVisible()
  })

  test('dedicated Baby Coil ID search narrows the table', async ({ page }) => {
    await page.goto('/')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '12', costPrice: '600000', width: '150' })
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()

    await gotoTab(page, '2. Slitting')
    await page.getByRole('button', { name: '+ Add Baby Coil' }).click()
    await pickSearch(page, 'HR Coil ID', coilId)
    const widths = rowWidths(page)
    await widths.nth(0).fill('50')
    await page.getByRole('button', { name: '+ Add row' }).click()
    await widths.nth(1).fill('50')
    await page.getByRole('button', { name: /Save 2 Baby Coils/ }).click()

    const table = page.locator('table')
    await expect(table.getByText(`${coilId}-A`, { exact: true })).toBeVisible()
    await expect(table.getByText(`${coilId}-B`, { exact: true })).toBeVisible()

    // Filter to just the -B baby coil; -A drops out of the table body.
    await page.getByPlaceholder('Search Baby Coil ID…').fill(`${coilId}-B`)
    await expect(table.getByText(`${coilId}-B`, { exact: true })).toBeVisible()
    await expect(page.locator('table tbody').getByText(`${coilId}-A`, { exact: true })).toHaveCount(0)
  })
})

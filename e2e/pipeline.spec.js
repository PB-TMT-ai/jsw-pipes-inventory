import { test, expect } from '@playwright/test'

// E2E for the 3-stage pipeline: Coil Inward → Bundle Formation → Dispatch.
//
// These tests run against a Vite server with dummy Supabase creds (.env.test), so
// backend writes fail and a sync-error banner may appear — the flow is exercised
// via React's optimistic in-session state. Therefore: ONE session per test, NO page
// reloads between steps (a reload would lose the unsynced data).

// Field labels are rendered as `<label>○ Label</label><input/>` (no htmlFor), so we
// locate the input as the label's following sibling. hasText is a substring match,
// which absorbs the ○/●/▲ prefix.
const inputFor = (page, label) =>
  page.locator('label', { hasText: label }).locator('xpath=following-sibling::input[1]')
const selectFor = (page, label) =>
  page.locator('label', { hasText: label }).locator('xpath=following-sibling::select[1]')

const gotoTab = (page, name) => page.getByRole('button', { name, exact: true }).click()

test.describe('3-stage pipeline', () => {
  test('Coil Inward → Bundle Formation → Dispatch happy path', async ({ page }) => {
    await page.goto('/')

    // ── Stage 1: register a mother coil ──
    await gotoTab(page, '1. Coil Inward')
    await page.getByRole('button', { name: '+ Add Coil' }).click()
    await inputFor(page, 'Thickness (mm)').fill('2.5')
    await inputFor(page, 'Width (mm)').fill('150')
    await inputFor(page, 'Actual Weight (T)').fill('10')
    await inputFor(page, 'Cost Price (₹)').fill('500000')
    await page.getByRole('button', { name: 'Save Coil' }).click()

    // The generated HR Coil ID (HYD-MMYY-01) should now show in the table.
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    expect(coilId).toMatch(/^HYD-\d{4}-\d{2}$/)

    // ── Stage 2: form a bundle from that coil + a thickness-compatible SKU ──
    await gotoTab(page, '2. Bundle Formation')
    await page.getByRole('button', { name: '+ New Bundle' }).click()
    await selectFor(page, 'Mother Coil (HR Coil ID)').selectOption({ index: 1 }) // first real coil
    await selectFor(page, 'SKU').selectOption({ index: 1 })                      // first eligible SKU
    await inputFor(page, 'No. of Pieces').fill('10')
    const saveBundle = page.getByRole('button', { name: 'Save Bundle' })
    await expect(saveBundle).toBeEnabled()
    await saveBundle.click()

    // Bundle row (BND-1) appears in the accordion.
    await expect(page.getByText('BND-1').first()).toBeVisible()

    // ── Stage 3: dispatch the bundle ──
    await gotoTab(page, '3. Dispatch')
    await page.getByRole('button', { name: '+ New Dispatch' }).click()
    await inputFor(page, 'Vehicle No.').fill('KA01AB1234')
    await inputFor(page, 'Invoice No.').fill('INV-E2E-1')
    await inputFor(page, 'Vehicle Weight (T)').fill('0.13')
    // The bundle picker is the only select in the "Add Bundles to Dispatch" panel.
    await page.getByText('Add Bundles to Dispatch').locator('xpath=following::select[1]').selectOption({ index: 1 })
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByRole('button', { name: 'Save Dispatch' }).click()

    // Dispatch record lands with the invoice number.
    await expect(page.getByText('INV-E2E-1').first()).toBeVisible()
  })

  test('over-fill beyond +5% disables Save', async ({ page }) => {
    await page.goto('/')
    await gotoTab(page, '1. Coil Inward')
    await page.getByRole('button', { name: '+ Add Coil' }).click()
    await inputFor(page, 'Thickness (mm)').fill('2.5')
    await inputFor(page, 'Actual Weight (T)').fill('1')
    await inputFor(page, 'Cost Price (₹)').fill('50000')
    await page.getByRole('button', { name: 'Save Coil' }).click()

    await gotoTab(page, '2. Bundle Formation')
    await page.getByRole('button', { name: '+ New Bundle' }).click()
    await selectFor(page, 'Mother Coil (HR Coil ID)').selectOption({ index: 1 })
    await selectFor(page, 'SKU').selectOption({ index: 1 })
    await inputFor(page, 'No. of Pieces').fill('100000000') // absurdly over the 1T (+5%) cap
    await expect(page.getByRole('button', { name: 'Save Bundle' })).toBeDisabled()
    await expect(page.getByText(/Over-filled/i)).toBeVisible()
  })

  test('removed stages are gone (refactor regression guard)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: '2. Bundle Formation', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '3. Dispatch', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Coil to Slit/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Slit to Tube/ })).toHaveCount(0)
  })
})

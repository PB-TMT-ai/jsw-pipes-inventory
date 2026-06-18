import { test, expect } from '@playwright/test'

// E2E for the 4-stage pipeline: Coil Inward → Production → Bundle Formation → Dispatch.
//
// (June 2026 change) Mother coils are no longer picked by hand. Production FIFO-consumes
// coils by ±5% thickness; Bundle Formation packs the produced pool; Dispatch inherits the
// coil trace and supports multiple invoices per vehicle.
//
// These tests run against a Vite server with dummy Supabase creds (.env.test), so backend
// writes fail and a sync-error banner may appear — the flow is exercised via React's
// optimistic in-session state. Therefore: ONE session per test, NO page reloads mid-flow.

// Field labels are rendered as `<label>○ Label</label><input/>` (no htmlFor), so we locate
// the input as the label's following sibling. hasText is a substring match, which absorbs
// the ○/●/▲ prefix (and label suffixes like "Invoice No. (for bundles added below)").
const inputFor = (page, label) =>
  page.locator('label', { hasText: label }).locator('xpath=following-sibling::input[1]')
const selectFor = (page, label) =>
  page.locator('label', { hasText: label }).locator('xpath=following-sibling::select[1]')

const gotoTab = (page, name) => page.getByRole('button', { name, exact: true }).click()

// SKU option index 1 = first published SKU (SKU-001, a 25x25x2.50 → 2.5mm tube), which is
// thickness-compatible with the 2.5mm coils registered below. Index 0 is the placeholder.
const SKU_INDEX = 1

async function addCoil(page, { thickness = '2.5', actualWeight, costPrice, width = '150' }) {
  await page.getByRole('button', { name: '+ Add Coil' }).click()
  await inputFor(page, 'Thickness (mm)').fill(thickness)
  await inputFor(page, 'Width (mm)').fill(width)
  await inputFor(page, 'Actual Weight (T)').fill(actualWeight)
  await inputFor(page, 'Cost Price (₹)').fill(costPrice)
  await page.getByRole('button', { name: 'Save Coil' }).click()
}

test.describe('4-stage pipeline', () => {
  test('Coil Inward → Production → Bundle Formation → Dispatch happy path', async ({ page }) => {
    await page.goto('/')

    // ── Stage 1: register a mother coil (2.5mm, 10T) ──
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '10', costPrice: '500000' })
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    expect(coilId).toMatch(/^HYD-\d{4}-\d{2}$/)

    // ── Stage 2: produce 10 tubes of a 2.5mm SKU → FIFO assigns the coil automatically ──
    await gotoTab(page, '2. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
    await inputFor(page, 'No. of Pieces').fill('10')
    await expect(page.getByText(/Fully allocated/)).toBeVisible()  // FIFO matched the coil
    await page.getByRole('button', { name: 'Save Production' }).click()
    // The Assigned Coils cell traces back to the mother coil.
    await expect(page.locator('table').getByText(coilId, { exact: false }).first()).toBeVisible()

    // ── Stage 3: bundle 10 produced tubes (coil inherited from production FIFO) ──
    await gotoTab(page, '3. Bundle Formation')
    await page.getByRole('button', { name: '+ New Bundle' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX }) // only the produced SKU is offered
    await inputFor(page, 'No. of Pieces').fill('10')
    const saveBundle = page.getByRole('button', { name: 'Save Bundle' })
    await expect(saveBundle).toBeEnabled()
    await saveBundle.click()
    await expect(page.getByText('BND-1').first()).toBeVisible()

    // ── Stage 4: dispatch the bundle under one invoice (invoice-first form) ──
    await gotoTab(page, '4. Dispatch')
    await page.getByRole('button', { name: '+ New Dispatch' }).click()
    await inputFor(page, 'Vehicle No.').fill('KA01AB1234')
    await inputFor(page, 'Vehicle Weight (T)').fill('0.11')
    await inputFor(page, 'Invoice No.').first().fill('INV-E2E-1') // seeded Invoice #1
    await selectFor(page, 'Bundle').first().selectOption({ value: 'BND-1' })
    await page.getByRole('button', { name: 'Add Bundle', exact: true }).first().click()
    await page.getByRole('button', { name: 'Save Dispatch' }).click()
    await expect(page.getByText('INV-E2E-1').first()).toBeVisible()
  })

  test('Production splits across coils FIFO (oldest first, spill to next)', async ({ page }) => {
    await page.goto('/')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '0.05', costPrice: '5000' })  // -01: small, filled first
    await addCoil(page, { actualWeight: '10', costPrice: '500000' })  // -02: absorbs the spill

    await gotoTab(page, '2. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
    await inputFor(page, 'No. of Pieces').fill('10') // ~0.106T > coil -01's 0.05T → spill to -02
    // Two source coils means the batch split across coils.
    await expect(inputFor(page, '# Source Coils')).toHaveValue('2')
  })

  test('Production shortfall is allowed (saved as Partial) but flagged', async ({ page }) => {
    await page.goto('/')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '0.05', costPrice: '5000' }) // far too little for the batch

    await gotoTab(page, '2. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
    await inputFor(page, 'No. of Pieces').fill('100') // ~1.06T ≫ 0.05T capacity
    await expect(page.getByText(/Shortfall/)).toBeVisible()
    // Allow + warn policy: save stays enabled.
    await expect(page.getByRole('button', { name: 'Save Production' })).toBeEnabled()
  })

  test('one vehicle carries multiple invoices', async ({ page }) => {
    await page.goto('/')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '10', costPrice: '500000' })

    // Produce 20, then make two 10-piece bundles.
    await gotoTab(page, '2. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
    await inputFor(page, 'No. of Pieces').fill('20')
    await page.getByRole('button', { name: 'Save Production' }).click()

    await gotoTab(page, '3. Bundle Formation')
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: '+ New Bundle' }).click()
      await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
      await inputFor(page, 'No. of Pieces').fill('10')
      await page.getByRole('button', { name: 'Save Bundle' }).click()
    }
    await expect(page.getByText('BND-1').first()).toBeVisible()
    await expect(page.getByText('BND-2').first()).toBeVisible()

    // Dispatch (invoice-first): invoice INV-A holds BND-1, invoice INV-B holds BND-2,
    // one weighbridge reading for the whole truck.
    await gotoTab(page, '4. Dispatch')
    await page.getByRole('button', { name: '+ New Dispatch' }).click()
    await inputFor(page, 'Vehicle No.').fill('KA01AB1234')
    await inputFor(page, 'Vehicle Weight (T)').fill('0.22')

    // Invoice #1 (seeded): INV-A → BND-1
    await inputFor(page, 'Invoice No.').nth(0).fill('INV-A')
    await selectFor(page, 'Bundle').nth(0).selectOption({ value: 'BND-1' })
    await page.getByRole('button', { name: 'Add Bundle', exact: true }).nth(0).click()

    // + Add Invoice → Invoice #2: INV-B → BND-2
    await page.getByRole('button', { name: '+ Add Invoice' }).click()
    await inputFor(page, 'Invoice No.').nth(1).fill('INV-B')
    await selectFor(page, 'Bundle').nth(1).selectOption({ value: 'BND-2' })
    await page.getByRole('button', { name: 'Add Bundle', exact: true }).nth(1).click()

    await page.getByRole('button', { name: 'Save Dispatch' }).click()
    await expect(page.getByText('INV-A', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('INV-B', { exact: false }).first()).toBeVisible()
  })

  test('pipeline tabs reflect the new 4-stage flow', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: '2. Production', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '3. Bundle Formation', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '4. Dispatch', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Coil to Slit/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Slit to Tube/ })).toHaveCount(0)
  })
})

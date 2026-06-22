import { test, expect } from '@playwright/test'

// E2E for the 5-stage flow: Coil Inward → Slitting → Production → Dispatch (Excel).
//
// (June 2026 later change) Slitting is back: mother coils are slit into baby coils, and
// Production FIFO-consumes BABY coils by ±5% thickness. Bundle Formation was removed.
// Dispatch records are uploaded from an Excel sheet (not entered by hand).
//
// These tests run against a Vite server with dummy Supabase creds (.env.test), so backend
// writes fail and a sync-error banner may appear — the flow is exercised via React's
// optimistic in-session state. Therefore: ONE session per test, NO page reloads mid-flow.

// Field labels render as `<label>○ Label</label><input/>` (no htmlFor), so we locate the
// control as the label's following sibling. hasText is a substring match.
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

// Slit a mother coil into one baby coil (width well under mother−5mm → green, saveable).
async function slit(page, coilId, width = '100') {
  await gotoTab(page, '2. Slitting')
  await page.getByRole('button', { name: '+ Add Baby Coil' }).click()
  await selectFor(page, 'HR Coil ID').selectOption(coilId)
  await inputFor(page, 'Width (mm)').fill(width)
  await page.getByRole('button', { name: 'Save Baby Coil' }).click()
}

test.describe('5-stage pipeline', () => {
  test('Coil Inward → Slitting → Production happy path (baby-coil FIFO)', async ({ page }) => {
    await page.goto('/')

    // ── Stage 1: register a mother coil (2.5mm, 10T) ──
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '10', costPrice: '500000' })
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    expect(coilId).toMatch(/^HYD-\d{4}-\d{2}$/)

    // ── Stage 2: slit it into one baby coil (inherits 2.5mm thickness) ──
    await slit(page, coilId, '100')
    await expect(page.locator('table').getByText(`${coilId}-A`, { exact: false }).first()).toBeVisible()

    // ── Stage 3: produce 10 tubes → FIFO assigns the baby coil automatically ──
    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
    await inputFor(page, 'No. of Pieces').fill('10')
    await expect(page.getByText(/Fully allocated/)).toBeVisible()  // FIFO matched the baby coil
    await page.getByRole('button', { name: 'Save Production' }).click()
    // The Assigned Coils cell traces back to the baby coil.
    await expect(page.locator('table').getByText(`${coilId}-A`, { exact: false }).first()).toBeVisible()
  })

  test('Production splits across baby coils FIFO (oldest first, spill to next)', async ({ page }) => {
    await page.goto('/')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '0.05', costPrice: '5000' })  // -01: small, filled first
    await addCoil(page, { actualWeight: '10', costPrice: '500000' })  // -02: absorbs the spill
    const rows = page.locator('table tbody tr')
    const coil1 = await rows.nth(0).locator('td').first().innerText()
    const coil2 = await rows.nth(1).locator('td').first().innerText()

    // Slit each mother into one full-weight baby coil.
    await slit(page, coil1, '100')
    await slit(page, coil2, '100')

    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
    await inputFor(page, 'No. of Pieces').fill('10') // ~0.106T > baby -01's 0.05T → spill to -02
    // Two source baby coils means the batch split across coils.
    await expect(inputFor(page, '# Source Coils')).toHaveValue('2')
  })

  test('Production shortfall is allowed (saved as Partial) but flagged', async ({ page }) => {
    await page.goto('/')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '0.05', costPrice: '5000' }) // far too little for the batch
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    await slit(page, coilId, '100')

    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
    await inputFor(page, 'No. of Pieces').fill('100') // ~1.06T ≫ 0.05T capacity
    await expect(page.getByText(/Shortfall/)).toBeVisible()
    // Allow + warn policy: save stays enabled.
    await expect(page.getByRole('button', { name: 'Save Production' })).toBeEnabled()
  })

  test('no eligible baby coil until slitting is done', async ({ page }) => {
    await page.goto('/')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '10', costPrice: '500000' })

    // Skip slitting → Production finds no eligible baby coil.
    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await selectFor(page, 'SKU').selectOption({ index: SKU_INDEX })
    await inputFor(page, 'No. of Pieces').fill('10')
    await expect(page.getByText(/No eligible baby coil/)).toBeVisible()
  })

  test('pipeline tabs reflect the new flow (Slitting in, Bundle Formation out)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('button', { name: '2. Slitting', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '3. Production', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '4. Dispatch', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Bundle Formation/ })).toHaveCount(0)
    // Dispatch is upload-driven now.
    await gotoTab(page, '4. Dispatch')
    await expect(page.getByRole('button', { name: 'Upload Dispatch Excel' })).toBeVisible()
  })
})

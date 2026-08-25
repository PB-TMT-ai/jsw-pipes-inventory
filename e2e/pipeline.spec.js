import { test, expect } from '@playwright/test'
import { signIn } from './signin'

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
// A SearchSelect renders an <input> inside a wrapping <div>, not a <select> — Production's SKU
// picker is one (232 SKUs is not a dropdown you scroll).
const searchInputFor = (page, label) =>
  page.locator('label', { hasText: label }).locator('xpath=following-sibling::div[1]//input')

// Production PO No. — the PO issued to the contract manufacturer, mandatory on the CREATE path.
// Every "record a production" flow has to fill it now, so it lives in one helper.
const PRODUCTION_PO = 'PO/2026/114'
const fillProductionPo = (page, po = PRODUCTION_PO) =>
  inputFor(page, 'Production PO No.').fill(po)

const gotoTab = (page, name) => page.getByRole('button', { name, exact: true }).click()

// The header plant selector (ticket #121). It defaults to "All Plants", which scopes nothing —
// but Production allocates coils from ONE plant and so needs a real one chosen (ticket #124).
// Coils registered by `addCoil` below take Coil Inward's default plant, Hyderabad.
// Located by its accessible name, not `header select` — the control is the only unlabelled input
// in the header, so the aria-label is what a screen reader and this test both read.
const selectPlant = (page, name) => page.getByLabel('Plant', { exact: true }).selectOption({ label: name })

// SKU-001, a 25x25x2.50 → 2.5mm tube, thickness-compatible with the 2.5mm coils registered below.
// Searched by the size in its description, which is unique across the whole 232-SKU catalog — an
// option's label IS its description, so this both filters the list and names the option to click.
const SKU_SIZE = '25x25x2.50x6000'

// Drive a SearchSelect: focus, type a query to filter, then click the matching option. `name` is a
// substring match, so a query that identifies the option is enough — the label carries more.
async function pickSearch(page, label, query) {
  const input = searchInputFor(page, label)
  await input.click()
  await input.fill(query)
  await page.getByRole('button', { name: query }).first().click()
}

const pickSku = (page, size = SKU_SIZE) => pickSearch(page, 'SKU', size)

// Take the FIFO suggestion. It is never applied on its own — a non-negotiable of this app: the
// suggestion is GUIDANCE, and what a production saves is the operator's own allocation. So every
// flow that means to consume coils has to click this, exactly as an operator does.
const useSuggestion = (page) => page.getByRole('button', { name: 'Use suggestion' }).click()

// Coil Inward carries no cost field — a coil's cost reaches the pipeline through the daily Excel,
// not through this form — so the only figures a registration needs are the physical ones.
async function addCoil(page, { thickness = '2.5', actualWeight, width = '150' }) {
  await page.getByRole('button', { name: '+ Add Coil' }).click()
  await inputFor(page, 'Thickness (mm)').fill(thickness)
  await inputFor(page, 'Width (mm)').fill(width)
  await inputFor(page, 'Actual Weight (T)').fill(actualWeight)
  await page.getByRole('button', { name: 'Save Coil' }).click()
}

// Slit a mother coil into one baby coil (width well under mother−5mm → green, saveable).
async function slit(page, coilId, width = '100') {
  await gotoTab(page, '2. Slitting')
  await page.getByRole('button', { name: '+ Add Baby Coil' }).click()
  await pickSearch(page, 'HR Coil ID', coilId)
  await inputFor(page, 'Width (mm)').fill(width)
  // The button counts what it will save — "Save 1 Baby Coil" for a single row.
  await page.getByRole('button', { name: /Save 1 Baby Coil/ }).click()
}

test.describe('5-stage pipeline', () => {
  test('Coil Inward → Slitting → Production happy path (baby-coil FIFO)', async ({ page }) => {
    await signIn(page, 'admin')

    // ── Stage 1: register a mother coil (2.5mm, 10T) ──
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '10' })
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    expect(coilId).toMatch(/^HYD-\d{4}-\d{2}$/)

    // ── Stage 2: slit it into one baby coil (inherits 2.5mm thickness) ──
    await slit(page, coilId, '100')
    await expect(page.locator('table').getByText(`${coilId}-A`, { exact: false }).first()).toBeVisible()

    // ── Stage 3: produce 10 tubes → FIFO assigns the baby coil automatically ──
    await selectPlant(page, 'Hyderabad')
    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await pickSku(page)
    await inputFor(page, 'No. of Pieces').fill('10')
    await fillProductionPo(page)
    await useSuggestion(page)
    await expect(page.getByText(/Fully allocated/)).toBeVisible()  // FIFO matched the baby coil
    await page.getByRole('button', { name: 'Save Production' }).click()
    // The Assigned Coils cell traces back to the baby coil.
    await expect(page.locator('table').getByText(`${coilId}-A`, { exact: false }).first()).toBeVisible()
  })

  test('Production splits across baby coils FIFO (oldest first, spill to next)', async ({ page }) => {
    await signIn(page, 'admin')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '0.05' })  // -01: small, filled first
    await addCoil(page, { actualWeight: '10' })  // -02: absorbs the spill
    const rows = page.locator('table tbody tr')
    const coil1 = await rows.nth(0).locator('td').first().innerText()
    const coil2 = await rows.nth(1).locator('td').first().innerText()

    // Slit each mother into one full-weight baby coil.
    await slit(page, coil1, '100')
    await slit(page, coil2, '100')

    await selectPlant(page, 'Hyderabad')
    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await pickSku(page)
    await inputFor(page, 'No. of Pieces').fill('10') // ~0.106T > baby -01's 0.05T → spill to -02
    await useSuggestion(page)
    // Two source baby coils means the batch split across coils.
    await expect(inputFor(page, '# Source Coils')).toHaveValue('2')
  })

  test('Production shortfall is allowed (saved as Partial) but flagged', async ({ page }) => {
    await signIn(page, 'admin')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '0.05' }) // far too little for the batch
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    await slit(page, coilId, '100')

    await selectPlant(page, 'Hyderabad')
    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await pickSku(page)
    await inputFor(page, 'No. of Pieces').fill('100') // ~1.06T ≫ 0.05T capacity
    await fillProductionPo(page)
    await useSuggestion(page)
    await expect(page.getByText(/Shortfall/)).toBeVisible()
    // Allow + warn policy: save stays enabled. (The PO is filled above so this asserts the
    // shortfall policy and not the PO guard.)
    await expect(page.getByRole('button', { name: 'Save Production' })).toBeEnabled()
  })

  test('Production PO No. is required to record a NEW batch', async ({ page }) => {
    await signIn(page, 'admin')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '10' })
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    await slit(page, coilId, '100')

    await selectPlant(page, 'Hyderabad')
    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await pickSku(page)
    await inputFor(page, 'No. of Pieces').fill('10')
    await useSuggestion(page)

    // Everything else about this batch is valid — fully allocated, one plant, inside capacity —
    // so a blocked save here can only be the missing PO.
    await expect(page.getByText(/Fully allocated/)).toBeVisible()
    await expect(page.getByText(/Production PO No. is required/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Save Production' })).toBeDisabled()

    await fillProductionPo(page)
    await expect(page.getByText(/Production PO No. is required/)).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Save Production' })).toBeEnabled()

    // Stored uppercase + trimmed, so one PO reads as one PO in the table and any export.
    await inputFor(page, 'Production PO No.').fill('  po/2026/115 ')
    await page.getByRole('button', { name: 'Save Production' }).click()
    await expect(page.locator('table').getByText('PO/2026/115', { exact: true }).first()).toBeVisible()
  })

  test('no eligible baby coil until slitting is done', async ({ page }) => {
    await signIn(page, 'admin')
    await gotoTab(page, '1. Coil Inward')
    await addCoil(page, { actualWeight: '10' })

    // Skip slitting → Production finds no eligible baby coil.
    await selectPlant(page, 'Hyderabad')
    await gotoTab(page, '3. Production')
    await page.getByRole('button', { name: '+ Record Production' }).click()
    await pickSku(page)
    await inputFor(page, 'No. of Pieces').fill('10')
    await expect(page.getByText(/No eligible coil to suggest/)).toBeVisible()
  })

  test('pipeline tabs reflect the new flow (Slitting in, Bundle Formation out)', async ({ page }) => {
    await signIn(page, 'admin')
    await expect(page.getByRole('button', { name: '2. Slitting', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '3. Production', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '4. Dispatch', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Bundle Formation/ })).toHaveCount(0)
    // Dispatch is upload-driven now — and the upload lives on the Orders tab (one daily workbook
    // whose Invoice sheet rebuilds these records), so this view offers no entry and no upload of
    // its own. Asserting the absence is the point: hand-entering a dispatch is a non-negotiable.
    await gotoTab(page, '4. Dispatch')
    await expect(page.getByRole('button', { name: /Add Dispatch|Upload Dispatch/ })).toHaveCount(0)
    await expect(page.getByText('This view is read-only')).toBeVisible()
  })
})

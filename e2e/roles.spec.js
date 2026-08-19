import { test, expect } from '@playwright/test'
import { signIn, stubSignIn, writeRecorder, LOGINS } from './signin'

// E2E for ticket #126 — role and plant decide what a user sees.
//
// The rules themselves are a pure function with its own unit tests (`accessFor` in src/lib/calc.js);
// what only a browser can answer is whether the app is actually WIRED to them — that the tab bar
// renders what the rule returns, that the controls a plant user must not have are absent from the
// DOM rather than merely disabled, and that a session stored before roles existed asks for a fresh
// sign-in instead of opening the app.
//
// Sign-in goes through the real form; only the one database call is stubbed (see ./signin.js).

const tab = (page, name) => page.getByRole('button', { name, exact: true })
const ALL_TABS = ['Dashboard', 'Coil Tracker', '1. Coil Inward', '2. Slitting', '3. Production',
  '4. Dispatch', 'SKU Master', 'Orders & Invoice', 'Sales', 'Reports']
const MANUFACTURING_TABS = ['1. Coil Inward', '2. Slitting', '3. Production']

test.describe('admin', () => {
  test('sees every tab, with the plant selector', async ({ page }) => {
    await signIn(page, 'admin')
    for (const name of ALL_TABS) await expect(tab(page, name)).toBeVisible()
    await expect(page.getByLabel('Plant', { exact: true })).toBeVisible()
    // Starts on All Plants, exactly as #121 left it — deploy day must change no figure on screen.
    await expect(page.getByLabel('Plant', { exact: true })).toHaveValue('__all__')
    await expect(page.getByText('Inventory Management — All Plants')).toBeVisible()
  })

  test('can edit the SKU master and upload the sales workbook', async ({ page }) => {
    await signIn(page, 'admin')
    await tab(page, 'SKU Master').click()
    await expect(page.getByRole('button', { name: '+ Add SKU' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Edit' }).first()).toBeVisible()

    await tab(page, 'Orders & Invoice').click()
    await expect(page.getByRole('button', { name: 'Upload Sales Excel' })).toBeVisible()
  })

  test('can still move the selector onto one plant', async ({ page }) => {
    await signIn(page, 'admin')
    await page.getByLabel('Plant', { exact: true }).selectOption({ label: 'NPMD' })
    await expect(page.getByText('Inventory Management — NPMD')).toBeVisible()
    // A view, not an identity: the stages stay, unlike for a plant user at a non-manufacturing plant.
    for (const name of MANUFACTURING_TABS) await expect(tab(page, name)).toBeVisible()
  })
})

// Both plant logins manufacture, so both get the shop-floor stages. They are run through the same
// table rather than one spec each: the rule is "your plant", and a rule stated once for Hyderabad
// would not catch NPMD being wired to Hyderabad's data.
for (const [login, plantName] of [['hyderabad', 'Hyderabad'], ['npmd', 'NPMD']]) {
  test.describe(`plant user — ${login}`, () => {
    test('opens on their own plant with no selector to get wrong', async ({ page }) => {
      await signIn(page, login)
      await expect(page.getByLabel('Plant', { exact: true })).toHaveCount(0)
      await expect(page.getByText(`Inventory Management — ${plantName}`)).toBeVisible()
      // The header is the ONLY place a plant user's plant is stated, so it must never read as the
      // whole company.
      await expect(page.getByText('Inventory Management — All Plants')).toHaveCount(0)
    })

    test('sees the four viewing tabs and the three stages, and no Reports', async ({ page }) => {
      await signIn(page, login)
      for (const name of ['Dashboard', 'Coil Tracker', '4. Dispatch', 'Sales', ...MANUFACTURING_TABS]) {
        await expect(tab(page, name)).toBeVisible()
      }
      await expect(tab(page, 'Reports')).toHaveCount(0)
    })

    test('reads the SKU master but cannot change it', async ({ page }) => {
      await signIn(page, login)
      await tab(page, 'SKU Master').click()
      // The catalog itself is fully there — a plant user looks SKUs up all day.
      await expect(page.getByText(/SKU Catalog \(\d+ items\)/)).toBeVisible()
      // Every control that writes is absent from the DOM, not merely disabled.
      await expect(page.getByRole('button', { name: '+ Add SKU' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Edit' })).toHaveCount(0)
      await expect(page.getByRole('button', { name: 'Del' })).toHaveCount(0)
    })

    test('reads the order book but cannot upload it', async ({ page }) => {
      await signIn(page, login)
      await tab(page, 'Orders & Invoice').click()
      await expect(page.getByRole('button', { name: 'Upload Sales Excel' })).toHaveCount(0)
      // The CSV export stays — reading your own orders out is not the risk being managed.
      await expect(page.getByRole('button', { name: /Download CSV/ })).toBeVisible()
    })

    test('registers a coil against their own plant, with nothing to pick', async ({ page }) => {
      await signIn(page, login)
      await tab(page, '1. Coil Inward').click()
      await page.getByRole('button', { name: '+ Add Coil' }).click()
      const plantField = page.locator('label', { hasText: 'Plant' }).locator('xpath=following-sibling::input[1]')
      await expect(plantField).toHaveValue(plantName)
      await expect(plantField).toBeDisabled()
      // The coil id it will mint carries that plant's prefix, not the default Hyderabad one.
      await expect(page.locator('label', { hasText: 'HR Coil ID' }).locator('xpath=following-sibling::input[1]'))
        .toHaveValue(new RegExp(`^${login === 'npmd' ? 'NPM' : 'HYD'}-`))
    })
  })
}

test.describe('the session', () => {
  test('stored before roles existed is cleared, prompting one fresh sign-in', async ({ page }) => {
    await signIn(page, 'admin')
    // Overwrite with the exact pre-#126 shape: a login id and a timestamp, and no role.
    await page.evaluate(() => localStorage.setItem('jsw:auth',
      JSON.stringify({ loginId: 'admin', at: Date.now() })))
    await page.reload()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
    // …and it is cleared, so the next visit is not asked again for the same stale session.
    expect(await page.evaluate(() => localStorage.getItem('jsw:auth'))).toBe(null)
  })

  test('is remembered across a reload, so signing in is a once-a-month event', async ({ page }) => {
    await signIn(page, 'npmd')
    await page.reload()
    await expect(page.getByText('Inventory Management — NPMD')).toBeVisible()
    await expect(tab(page, 'Reports')).toHaveCount(0)
  })

  test('is dropped by Logout, returning to the sign-in screen', async ({ page }) => {
    await signIn(page, 'hyderabad')
    await page.getByRole('button', { name: 'Logout' }).click()
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible()
  })

  test('does not open the app when the credential row cannot say what the user may do', async ({ page }) => {
    // A `plant` role whose plant column is NULL arrives as "all plants" — read as such it would
    // hand a plant login the whole company, so the app refuses it and says where it is fixed.
    await stubSignIn(page, [{ login_id: 'broken', plant: null, role: 'plant' }])
    await page.goto('/')
    await page.getByLabel('Login ID').fill('broken')
    await page.getByLabel('Password').fill('correct-horse')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText(/not set up correctly/)).toBeVisible()
    await expect(tab(page, 'Dashboard')).toHaveCount(0)
  })

  test('never tells a plant user with a broken plant id that they see All Plants', async ({ page }) => {
    // A credential naming a plant no master row matches is a row to fix, not a case to widen. The
    // header must not answer "which plant's numbers are these?" with the whole company.
    await stubSignIn(page, [{ login_id: 'typo', plant: 'hyderbad', role: 'plant' }])   // sic
    await page.goto('/')
    await page.getByLabel('Login ID').fill('typo')
    await page.getByLabel('Password').fill('correct-horse')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(tab(page, 'Dashboard')).toBeVisible()
    await expect(page.getByText('Inventory Management — All Plants')).toHaveCount(0)
    await expect(page.getByText('Inventory Management — hyderbad')).toBeVisible()
  })

  test('tells a wrong password apart from a dead connection', async ({ page }) => {
    await stubSignIn(page, [])            // no rows = wrong login id or password
    await page.goto('/')
    await page.getByLabel('Login ID').fill('admin')
    await page.getByLabel('Password').fill('wrong')
    await page.getByRole('button', { name: 'Sign in' }).click()
    await expect(page.getByText('Invalid login ID or password.')).toBeVisible()
  })
})

test.describe('a plant user never writes over another plant', () => {
  // The regression this exists for: the stages were briefly handed PLANT-FILTERED arrays. Slitting
  // builds its next array from that prop and calls `setBabyCoils(updated)` outright, so every row
  // the user could not see looked deleted to the sync — and `baby_coils` is a HARD-delete table.
  // One plant user saving one baby coil would have permanently destroyed every other plant's.
  //
  // It is invisible on screen (the rows it removes are ones this user cannot see anyway), so the
  // assertion is on the WRITES the app sends, not on the DOM.
  const NPMD_BABY = {
    id: 'seed-npmd-baby', baby_coil_id: 'NPM-0826-01-A', hr_coil_id: 'NPM-0826-01',
    plant: 'npmd', date_of_conversion: '2026-08-01', width: 100, thickness: 2.5, weight: 5,
    baby_coil_entry: 'A', deleted: false,
  }
  const NPMD_COIL = {
    id: 'seed-npmd-coil', hr_coil_id: 'NPM-0826-01', hr_coil_no: 1, plant: 'npmd',
    date_of_inward: '2026-08-01', thickness: 2.5, width: 150, actual_weight: 10, deleted: false,
  }

  test('slitting as hyderabad never deletes NPMD baby coils', async ({ page }) => {
    const { writes, settle, onRequest } = writeRecorder()
    await signIn(page, 'hyderabad', { rows: { baby_coils: [NPMD_BABY], coils: [NPMD_COIL] }, onRequest })

    // Register a Hyderabad mother, then slit it — the exact flow that triggered the bug.
    await tab(page, '1. Coil Inward').click()
    await page.getByRole('button', { name: '+ Add Coil' }).click()
    const inputFor = (label) => page.locator('label', { hasText: label }).locator('xpath=following-sibling::input[1]')
    await inputFor('Thickness (mm)').fill('2.5')
    await inputFor('Width (mm)').fill('150')
    await inputFor('Actual Weight (T)').fill('10')
    await page.getByRole('button', { name: 'Save Coil' }).click()

    // NPMD's coil is not on this user's register…
    await expect(page.getByText('NPM-0826-01', { exact: true })).toHaveCount(0)
    const coilId = await page.locator('table tbody tr').first().locator('td').first().innerText()
    expect(coilId).toMatch(/^HYD-/)

    await tab(page, '2. Slitting').click()
    await page.getByRole('button', { name: '+ Add Baby Coil' }).click()
    const search = page.locator('label', { hasText: 'HR Coil ID' }).locator('xpath=following-sibling::div[1]//input')
    await search.click()
    await search.fill(coilId)
    await page.getByRole('button', { name: coilId }).first().click()
    await page.locator('label', { hasText: 'Width (mm)' }).locator('xpath=following-sibling::input[1]').first().fill('100')
    await page.getByRole('button', { name: /Save 1 Baby Coil/ }).click()
    await expect(page.locator('table').getByText(`${coilId}-A`, { exact: false }).first()).toBeVisible()

    // Guard against a vacuous pass: if the recorder saw nothing, the assertions below prove nothing.
    // Registering and slitting a coil must have produced writes.
    await settle(page)
    expect(writes.length, 'the recorder observed no writes at all — the stub is not wired up').toBeGreaterThan(0)

    // …and nothing this user did may remove it. Any DELETE at all on these tables is the bug.
    const destructive = writes.filter(w => w.method === 'DELETE' && /baby_coils|\/coils/.test(w.url))
    expect(destructive, `unexpected deletes: ${JSON.stringify(destructive, null, 2)}`).toEqual([])
    // Belt and braces: the seeded id must never appear in any write the app sent.
    const mentionsNpmd = writes.filter(w => w.url.includes('seed-npmd') || w.body.includes('seed-npmd'))
    expect(mentionsNpmd, `NPMD rows touched: ${JSON.stringify(mentionsNpmd, null, 2)}`).toEqual([])
  })

  test('the mother-coil picker offers only their own plant', async ({ page }) => {
    await signIn(page, 'hyderabad', { rows: { coils: [NPMD_COIL] } })
    await tab(page, '2. Slitting').click()
    await page.getByRole('button', { name: '+ Add Baby Coil' }).click()
    const search = page.locator('label', { hasText: 'HR Coil ID' }).locator('xpath=following-sibling::div[1]//input')
    await search.click()
    await search.fill('NPM')
    await expect(page.getByRole('button', { name: /NPM-0826-01/ })).toHaveCount(0)
  })
})

test.describe('what the screens say about other plants', () => {
  // An acceptance criterion of #126, and a promise made in blueprints/manage-app-login.md: this is
  // UI tidiness, NOT confidentiality. Every table keeps its permissive row-level policy and the
  // public key still reaches every plant's rows. So no screen may tell a plant team their data is
  // private, hidden or secure — it would be a claim the system does not back.
  // `hidden` is named in the acceptance criterion, so it is checked — even though it is the one
  // word here with an innocent everyday use. If a screen ever legitimately needs it ("show hidden
  // columns"), narrow this to the claim rather than dropping the word.
  const FORBIDDEN = /\b(private|confidential|secure[dl]?|restricted|protected|hidden|no access|not authori[sz]ed|permission denied)\b/i

  for (const login of Object.keys(LOGINS)) {
    test(`says nothing about privacy or security to ${login}`, async ({ page }) => {
      await signIn(page, login)
      const tabs = await page.locator('nav button').allInnerTexts()
      for (const name of tabs) {
        await tab(page, name.trim()).click()
        const body = await page.locator('body').innerText()
        expect(body, `on the ${name} tab`).not.toMatch(FORBIDDEN)
      }
    })
  }
})

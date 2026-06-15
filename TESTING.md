# Testing

## Unit tests (Vitest)
Fast, deterministic tests of the pure business logic extracted to `src/lib/calc.js`
(weight cap, dispatch cost reconciliation, coil inventory derivations, tolerance,
ID/format helpers) and the camelCase↔snake_case mapping in `src/lib/db.js`.

```bash
npm test          # run once (CI)
npm run test:watch
```

Tests live next to the code they cover: `src/lib/calc.test.js`, `src/lib/db.test.js`.
They run in Node (no DOM/Supabase needed). `db.test.js` mocks `./supabase` so importing
`db.js` doesn't try to construct a real client.

## E2E tests (Playwright)
Drives the **Coil Inward → Bundle Formation → Dispatch** flow plus the over-fill
Save-block and a guard that the removed Slit/Tube tabs are gone. Specs: `e2e/pipeline.spec.js`.

```bash
npx playwright install chromium   # one-time: download the browser binary
npm run test:e2e
```

`playwright.config.js` boots the Vite dev server in `test` mode, which loads
`.env.test` (dummy Supabase creds) so the app renders. Because that backend is fake,
writes don't persist — the tests exercise the **optimistic in-session UI state**, so
each test runs in a single page session with no reloads mid-flow (a dismissible
sync-error banner may appear; that's expected).

### Known environment blocker
Installing the Chromium binary requires downloading from `cdn.playwright.dev`. In
network-restricted sandboxes where that host is not allow-listed, the download fails
with `Host not in allowlist` and the E2E tests cannot run. The specs are authored and
discoverable (`npx playwright test --list`), and the Vite webServer starts correctly —
only the browser binary is missing. Run them in an environment with network access to
`cdn.playwright.dev` (or a pre-provisioned browser image) to execute the suite.

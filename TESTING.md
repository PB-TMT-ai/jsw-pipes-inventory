# Testing

## Unit tests (Vitest)
Fast, deterministic tests of the pure business logic extracted to `src/lib/calc.js`
(weight cap, dispatch cost reconciliation, coil inventory derivations, tolerance,
ID/format helpers), and of `src/lib/db.js` — the camelCase↔snake_case mapping, the
replace-all write path, and what sign-in reports back (`verifyLoginDetails`: the
signer's plant and role, `null` for a wrong password, a throw for a dead connection).

**The database half is not reachable from here.** `supabase-setup.sql` — the DDL, the
backfills, the `verify_login*` functions — is verified by running it against a throwaway
local Postgres (`initdb`, apply, assert, drop), which is the only way to prove a migration
is additive and re-runnable. See the 2026-08-19 #125 entry in `LEARNINGS.md` for the recipe.

```bash
npm test          # run once (CI)
npm run test:watch
```

Tests live next to the code they cover: `src/lib/calc.test.js`, `src/lib/db.test.js`, and
`scripts/daily-messages.test.mjs`. They run in Node (no DOM/Supabase needed). `db.test.js`
mocks `./supabase` so importing `db.js` doesn't try to construct a real client.

**`scripts/daily-messages.test.mjs` runs the two report scripts for real** — spawned as plain
Node processes, fed rows through `--in`, no network. The daily WhatsApp messages are rendered
from what those scripts print, so "computed through the same helper" is a claim only a test
that executes them can hold: it asserts `daily-splits.mjs` emits exactly what
`buildPlantMtdSummary` builds, and that `servable-orders.mjs` names the plant its stock is on.
It doubles as the module-resolution guard for the scripts themselves.

## E2E tests (Playwright)
Three specs, 46 tests (39 `test()` calls; `roles.spec.js` generates the rest by looping over the three logins):
- `e2e/pipeline.spec.js` — **Coil Inward → Slitting → Production**, FIFO split across baby coils,
  the shortfall warn-don't-block policy, and a guard that the removed stages are gone.
- `e2e/slitting-multi.spec.js` — multi-row slitting and the baby-coil search.
- `e2e/roles.spec.js` — **which tabs each of `admin`, `hyderabad` and `npmd` renders** (ticket #126),
  the read-only SKU Master and order book, the pinned Coil Inward plant, the one-time clearing of a
  pre-#126 session, and that no screen describes another plant's data as private or secure. It also
  covers the one bug in this ticket that **nothing on screen could show**: a plant user's Slitting
  save must never delete another plant's baby coils. `signIn` takes `rows` to seed a table with data
  that did not come from the UI, and `writeRecorder()` captures every write so the test can assert
  on what the app did *not* send. It also covers **the plant selector scoping the three pipeline
  stages**: that All Plants still shows every plant (the control — a scoping test suite whose every
  case asserts an absence can pass by rendering nothing), that picking NPMD leaves Hyderabad off all
  three, that Unattributed narrows rather than widens, that Slitting stays scoped on *every* date
  option including the default "All Time", and that a new coil's plant and the CSV exports follow
  the scope. Since ticket #156 it also pins **which plants Coil Inward offers** — all four, in
  master order, Hyderabad first — because that dropdown is the only thing on screen that changed
  when Lepakshi and Tapi were activated, and it is the intersection of two switches in two files.

**Two traps that make a request-level test pass while the bug is live**, both hit while writing it:
  - **Route shadowing.** Playwright runs the most recently registered matching handler first, so a
    recorder installed before `signIn` is shadowed by `signIn`'s own stub and records nothing — the
    test then passes because it observed *nothing at all*. Pass `onRequest` into `signIn`; there
    must be exactly one handler. The test also asserts `writes.length > 0` so a silent recorder
    fails loudly.
  - **Ordering.** `syncToSupabase` awaits its upsert *before* issuing any delete, so when a saved
    row appears on screen the destructive half of that same sync has not been sent yet. Use
    `settle(page)` to wait for the traffic to stop before asserting.

  Both were caught by deliberately reintroducing the defect and checking the test failed. **A new
  regression test is not finished until you have seen it fail on the bug it describes.**

**Every spec signs in**, through the real form, via `e2e/signin.js`. Only the one sign-in RPC is
stubbed — `.env.test` points at a host that does not exist, so no password could verify, and the
password check itself is covered elsewhere (bcrypt against a real Postgres, and `verifyLoginDetails`
in `db.test.js`). The same helper answers the table reads with an empty table, which is the state
the specs always assumed and is instant instead of waiting on a network failure.

```bash
npx playwright install chromium   # one-time: download the browser binary
npm run test:e2e
```

`playwright.config.js` boots the Vite dev server in `test` mode, which loads `.env.test` (dummy
Supabase creds) so the app renders. Nothing persists — the pipeline specs exercise the **optimistic
in-session UI state**, so they run in a single page session with no reloads mid-flow. Since the
stub answers writes as accepted there is no sync-error banner any more, and no re-pull to throw
away a row a test just entered. `roles.spec.js` *does* reload on purpose: what survives a reload is
the point of a session.

### When the Chromium download is blocked
Installing the browser requires `cdn.playwright.dev`. Where that host is not allow-listed the
download fails with `Host not in allowlist` — but if the machine already has a Chromium built for
Playwright, point at it instead of downloading:

```bash
PW_CHROMIUM_PATH=/opt/pw-browsers/chromium npm run test:e2e
```

`playwright.config.js` sets `launchOptions.executablePath` only when that variable is present, so a
normal `npx playwright install` run is unaffected.

**These specs went unrun for a long time and it cost.** They could not execute in the sandbox, so
nothing noticed as the app moved under them: they still filled a `Cost Price (₹)` field that had
been deleted, clicked an `Upload Dispatch Excel` button that no longer existed, drove two
`SearchSelect` pickers as if they were `<select>`s, and expected FIFO to allocate without clicking
**Use suggestion** — which the never-auto-save rule requires. Then the login gate shipped and every
one of them stopped at the sign-in screen. A test that cannot run is not a test that passes. If you
change the app in a sandbox where these cannot execute, say so in the commit rather than assuming
they still hold.

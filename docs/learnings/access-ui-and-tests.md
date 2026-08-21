# Learnings — Access, UI and tests

Detail for the one-line entries in [`LEARNINGS.md`](../../LEARNINGS.md). Entries are verbatim, newest first.

Format: `Date | Component | Issue | Resolution | Insight`

---

2026-08-20 | App login gate — the live database was two tickets behind the app | Asked who the app's users were, the answer was one row: `admin`, on a July 2026 `app_credentials` of `(id, login_id, password_hash, updated_at)`. No `plant`, no `role`, and **no `verify_login_details`** — tickets #125/#126 shipped in `src/App.jsx` and `src/lib/db.js` and were never run against Supabase. That is not drift, it is an outage: `verifyLoginDetails` is the ONLY sign-in path `LoginGate` has (`verifyLogin` is still exported at `db.js:305` but called from nowhere), so the RPC errored, the `catch` at `App.jsx:3627` fired, and every fresh sign-in read **"Could not reach the server."** Nobody had reported it, because a valid `jsw:auth` session lasts ~30 days — the only people who could still get in were the only people who would have noticed. | `supabase-setup.sql` already carried the fix but is written for a **new** database and also runs `delete from tubes;` and re-creates every policy. So its "APP LOGIN GATE" section was extracted **verbatim** (lines 418–441, 447–460) into `migrate-login-plant-role.sql` at the repo root — the `restore-baby-coils.sql` precedent — and run. Preconditions were checked read-only first (`crypt` present, 0 columns, 0 constraint, 0 function, 1 row), so every guarded branch was known to fire exactly once. `admin` backfilled to `role='admin'`, `plant` NULL. Then `hyderabad` and `npmd` were created, and the sign-in path proved end-to-end: correct password → right plant + role, wrong password → no rows. `blueprints/manage-app-login.md` gained a "bring an EXISTING database up to date" section with a two-count era check. | **Shipping the app does not migrate the database, and nothing tells you.** The repo's own history hides this: every schema change lives in one file called *setup*, which reads as something you run once, so a merged PR feels like a completed change when half of it never left the repo. Worse, this failure mode is **silent by construction** — a session-based login means the failure is invisible to exactly the people with the power to report it, and it disguises itself as a network error, sending the next person to the env vars. Two rules follow. (1) A ticket that adds SQL is not done at merge; it is done when a query against the live database says so — which is why the blueprint's new section leads with a `select`, not a paragraph. (2) When an app can only fail for users who are not currently looking, **the check has to be scheduled, not triggered by a complaint.**

2026-08-19 | db.js + supabase-setup.sql + CONTEXT.md — ticket #125 review follow-up | Two findings the local Postgres run could not have caught, both about MEANING rather than mechanics. (1) **Two sentinels, opposite meanings, and I picked the wrong one.** I returned `plant: ''` from `verifyLoginDetails` for the admin and wrote "'' = all plants" in three places. But this app already has a documented value for all plants — `ALL_PLANTS = '__all__'`, the pass-through branch of `filterByPlant` — and `''` is the OTHER plant sentinel: `Unattributed`, offered by `plantFilterOptions` as `{ id: '' }`. NULL on the credential column genuinely does mean all plants; the error was carrying that NULL straight out to a client value whose blank already meant something else. Handed to `filterByPlant`, the admin would have seen only the rows nobody could attribute — and nothing would have failed until the next ticket wired it up. (2) The **commented-out seed block** in `supabase-setup.sql` still read `insert into app_credentials (login_id, password_hash)`, which my own `role not null` had just made an error — the one instruction in the file a human runs by hand, broken by the ticket, and invisible to "ran the full file twice, clean" because a comment does not run. | Return `row.plant || ALL_PLANTS`; imported the constant from `calc.js` rather than restating `'__all__'`. New test asserts on what the value SELECTS (`filterByPlant(rows, admin.plant)` returns every row, `npmd.plant` returns one) instead of on the sentinel's spelling. Fixed the seed block, re-ran the cluster, and confirmed the finding was real by running the old form: `null value in column "role" … violates not-null`. Also: the backfill's `update … set role = 'admin'` has no `where` and the comment justified it by assuming only one login exists — replaced with what is actually true (before #125 the app had no roles, so every credential could already do everything; 'admin' describes it rather than promotes it) plus a blueprint step to demote a legacy extra login, tested. Added **Login role** to `CONTEXT.md`, un-staled **Operating plant**, and told `TESTING.md` that the database half is verified by `initdb`, not by vitest. 375 tests, build clean. | **When a value can be blank, find out what blank already means in this codebase before you assign it a meaning.** I invented "blank = all plants" inside a project that had spent four tickets establishing blank = Unattributed, and wrote it into the docs, which is how a private mistake becomes a shared one. The tell was there in my own diff: I had to explain the convention in a comment. A sentinel needing explanation is usually a sentinel that already exists somewhere else under a different name. Second: **the test that would have caught it asserts on consequence, not on value.** `expect(plant).toBe('')` passes for both readings; `expect(filterByPlant(rows, plant))` cannot. Third: a **commented-out** instruction is code that a human executes — my constraint broke it, and neither the SQL run nor the suite could see it, because the only thing that reads it is a person following the file's own advice.

2026-08-19 | supabase-setup.sql + db.js — ticket #125, sign-in returns a plant and a role | The whole ticket turns on one sentence — "running the SQL against a database serving the current build breaks nothing" — and that is a claim about a **database**, which the vitest suite cannot reach: the unit tests can only prove the client maps `{login_id, plant, role}` correctly, and would pass just as happily against SQL that errors on `alter table`, re-stamps a plant login as admin on a re-run, or leaves `verify_login` shadowed. Second trap, in the backfill: `update app_credentials set role = 'admin' where role is null` left standing looks idempotent and is not — the day someone adds a login and mistypes the role column, a re-run of the setup file silently promotes them. The #120 pipeline backfill had already solved exactly this and the answer was three lines up in the same file. | Wrote the tests first against an injectable client (the `replaceAllRows` seam), then **ran the SQL for real**: `initdb` a throwaway Postgres 16 in `/var/tmp`, rebuild the pre-#125 world from `git show HEAD:supabase-setup.sql`, seed an `admin` with a local throwaway password, and apply the new section to it. That proved what unit tests structurally cannot: `verify_login` still answers t/f afterwards, the admin kept its password and gained `role='admin'` with `plant` NULL, `verify_login_details` returns no rows for a wrong password, two further runs of the section left the `hyderabad`/`npmd` logins as `plant`, the check constraint and `not null` reject `'superuser'` and a missing role, and as `anon` the function executes while `select … from app_credentials` is still permission-denied. Then the full file on a fresh database, twice, clean. Backfill gated on the column not existing, per #120. Cluster deleted; no password reached any file (grepped). 374 tests, build clean. | **When the acceptance criterion is about the migration rather than the code, the test has to be the migration.** Everything I could assert in vitest was true of a version of this SQL that would have taken the live app down, because the client half cannot observe whether `verify_login` survived — so the only honest evidence was a real cluster, and it cost about ten minutes. Reach for `initdb` whenever a ticket's risk lives in DDL. Second: **"additive" is a property of the whole file, not of the new lines.** The new function is obviously additive; the re-runnability of the backfill beside it is where the damage would have been, and it is only visible on the *second* run. Third: the idempotency pattern to copy was already in this file — checking whether the last person to solve this problem left the answer behind beat inventing one.

2026-08-19 | App-wide (header) — ticket #121, Phase 1 of the #117 multi-plant spec | Feature — a single plant selector in the header, scoping Dashboard / Coil Tracker / Dispatch / Orders / Sales at once, defaulting to All Plants. Built on #118 (order lines carry plant), #119 (invoice lines carry plant) and #120 (pipeline rows carry plant, backfilled to Hyderabad) — all three landed on this same stacked branch first. | Two new pure helpers in `calc.js`: `filterByPlant(rows, selected)` — pass-through on the `ALL_PLANTS` sentinel, else `rows.filter(r => storedPlant(r) === selected)`, for anything with a top-level `plant` (coils, baby coils, productions, orders); `filterDispatchesByPlant(dispatches, selected)` — filters each record's `bundleEntries` (plant lives per-entry, not on the record) and re-derives `theoreticalWeight` from the survivors, dropping a record left with none. `plantFilterOptions()` returns the fixed order the `<select>` always shows: All Plants, the four plants, Unattributed last. `InventoryApp` holds `selectedPlant` (plain `useState`, not persisted — a reload always comes back to All Plants) and filters ONCE, passing the scoped arrays into Dashboard/CoilTracker/Dispatch/Orders/SalesDashboard as ordinary props; none of those five components filter themselves. Coil Inward/Slitting/Production/SKU Master/Reports keep receiving the raw store arrays unchanged. The header's hardcoded "Inventory Management — Hyderabad" now reads the selection. | **Filtering at one seam (the parent) rather than inside each tab is what makes "nobody has to reason about which views are scoped" literally true** — the five components have zero new plant-aware code; they just render whatever array they're handed, same as always. The two traps found while wiring it in: (1) Orders' upload path (`replaceOrders`/`replaceDispatches`, and the `productions` fed into `buildDispatchRecords` for the invoice coil trace) must stay on the RAW unfiltered data — filtering it would have made an upload made while scoped to one plant silently lose every other plant's coil trace, a correctness bug invisible until someone happened to upload while filtered; (2) Sales' `estimates`/`stateRegions` must also stay raw, because Best Estimate and Region are keyed by distributor/state, not plant, and the acceptance criterion is explicitly that scoping the header leaves them untouched. Verified at the `calc.test.js` unit level against the real #117 figures — order rows constructed to the published per-plant tonnages: `salesKpis` on plant-filtered orders reproduces 761.441 MT (Hyderabad alone) from the same 2615.441 MT (+ an Unattributed row) All Plants total, and summing every plant option's `filterByPlant`/`filterDispatchesByPlant` output reproduces the unfiltered total exactly — the same "a labelling gap may never make weight vanish from a sum" invariant `Unmapped`/`Unattributed` already carry elsewhere. **The live check (Supabase MCP, project `hztblmccvvarmgxmunrp`) could NOT confirm the 2615.441 / 761.441 figures, and found two things that block it — both deployment state, not code:** (1) **`orders` has no `plant` column in production** — #118's `alter table orders add column if not exists plant text` in `supabase-setup.sql` has never been run there (`information_schema` lists `ship_to_state` but no `plant`), so until it is, every order line reads Unattributed and the header filter does nothing visible on Orders/Sales; (2) **`orders` is empty — 0 rows** (it is replace-all on upload and currently holds nothing), so there is no 18-Aug order book in the database to measure at all. The pipeline side is in better shape and DID verify: #120's backfill is live and complete — 294 coils / 2057 baby coils / 1276 productions, **all `hyderabad`, zero NULL** — so scoping Coil Tracker and the Dashboard to Hyderabad shows everything and to any other plant shows nothing, exactly as intended. **Running #118/#119's SQL and one daily upload is the prerequisite for this ticket to do anything on the Orders and Sales tabs.** 339 tests pass (6 new), `vite build` clean, and a Playwright smoke pass (dummy Supabase creds, `--mode test`) confirmed the selector renders with the right options/order, the header text updates per selection, and all ten tabs render with no console errors while scoped to Hyderabad.

2026-08-18 | Reports / Orders (lazy chunks) | `Report failed: Failed to fetch dynamically imported module: .../assets/reports-BjkJ5Jvy.js`. Not a report bug — the tab was opened before a deploy, so it asked for a chunk hash Vercel no longer serves, and the SPA rewrite answered the `.js` request with `index.html`. | Both on-demand imports now go through `loadChunk` (`src/lib/chunk.js`): reload the tab once (sessionStorage guard, 60 s window) so the new hashes load; a second failure, blocked storage or offline shows a plain "refresh the page" message instead of looping. `main.jsx` installs the same one-shot reload on Vite's `vite:preloadError`, and `vercel.json` no longer rewrites `/assets` to `index.html`, so a vanished chunk 404s honestly. | The user-visible error named the report, so it reads like a report failure — the giveaway is the hash in the URL. Any deploy while a tab sits open re-arms this for EVERY lazy import (xlsx upload included), which is why the fix is a shared wrapper, not a try/catch on the Reports button. Never auto-reload without a persisted guard: private browsing blocks sessionStorage, and a reload that cannot remember itself never stops.

2026-08-18 | E2E (Playwright) | `e2e/pipeline.spec.js` and `e2e/slitting-multi.spec.js` have been failing since the login gate shipped (July 2026) — all 7 specs, every run. They `page.goto('/')` and immediately look for the stage tabs; the app now renders `Sign in to continue` instead, so every locator times out. Verified identical on a clean checkout of `main`, so it is not a regression from the plant work. | Not fixed here — it needs either a real test credential or a `LoginGate` bypass in `--mode test`, and both are decisions about auth, not about #120. Recorded so the next ticket that claims "the existing specs pass unchanged" checks what "unchanged" currently means. | A guard nobody runs is not a guard. The specs were the stated regression net for the whole #117 multi-plant spec — "the existing pipeline and slitting specs must keep passing" is an acceptance criterion on three of its tickets — and they had been red for a month. Also worth noting: this image ships Chromium revision 1194 while `@playwright/test` 1.60 wants 1223, so `npx playwright test` fails with "Executable doesn't exist" before it ever reaches the app; run it through a throwaway config setting `launchOptions.executablePath: '/opt/pw-browsers/chromium'`.

2026-08-17 | Tests (exceljs) | `worksheet.getColumn(n).values` is a SPARSE array — blank rows are holes, and `.map()` preserves holes, so a later `.find()` visits `undefined` and throws on `.includes`. | Filter before mapping: `ws.getColumn(1).values.filter(v => v != null).map(String)`. Same trap applies to `getRow().values`, which is also 1-based (hence the existing `.slice(1)` in the render tests). | Cost one failing assertion that looked like a missing caption when the caption was rendered correctly.

2026-07-15 | App-wide (auth) | Feature — added a login gate (one shared login id + password) in front of the previously wide-open app | The app had no auth: anyone with the Vercel URL had full UI access (and the anon key + open `using(true)` RLS meant the data was reachable regardless). Chose a **Supabase-stored gate** (over an env-var password baked into the bundle, or full Supabase Auth + RLS lockdown): new private table `app_credentials(login_id, password_hash)` with **RLS on + NO policy + privileges revoked from anon/authenticated**, so the hash is unreadable through the public key; a `security definer` function `verify_login(p_login_id, p_password) → boolean` (bcrypt via pgcrypto `crypt()`/`gen_salt('bf')`, `search_path = public, extensions`) granted `execute` to anon is the ONLY way in. Client: `verifyLogin()` in `db.js` wraps `supabase.rpc('verify_login', …)`; `App.jsx` split into an auth wrapper `App` (gates on `jsw:auth` localStorage w/ ~30-day expiry, applies the dark class on mount) + the renamed `InventoryApp` (gained an `onLogout` prop + header **Logout** button) + a new `LoginGate` form. Mirrored the DDL into `supabase-setup.sql` (seed left commented so no password enters git); seeded `admin` + a temporary password via MCP. | **A client-side gate on a static site guards the UI, not the data** — the anon key is in the bundle and the data tables stay open, so this is honestly scoped as "keep people out of the app," with Supabase-Auth-+-RLS lockdown documented as the upgrade path (`blueprints/manage-app-login.md`). Keeping the credential in a table the app itself can't read (the definer RPC returns only yes/no) is strictly better than an env-var/bundle password and needs no redeploy to change. Verified via Supabase MCP: `verify_login` → true/false/false for correct/wrong/unknown, and anon has no SELECT/INSERT on `app_credentials` (RLS on). Browser test (Playwright + pre-installed Chromium): the login screen shows first and the app is hidden pre-login; the browser→Supabase RPC round-trip couldn't run in-sandbox (the agent proxy 403s all outbound incl. `supabase.co`) — it works on Vercel. `vite build` clean.

2026-04-08 | Stage 2/3 | Width sum validation now uses 3-color system | Green (≤100%), Yellow (100-105% — save allowed), Red (>105% — save blocked). Replaces the old single-color tolerance badge | Operators need clear visual feedback: green = safe, yellow = warning but ok, red = stop

2026-04-08 | Build | Folder name "Pipes&Tubes" contains `&` which bash interprets as command separator | Use `node node_modules/vite/bin/vite.js` directly instead of `npx vite` or `npm run dev` when shell expansion is an issue | Avoid special characters (&, spaces) in project folder names for CLI compatibility

2026-04-08 | Storage | useStore hook must read fresh value from localStorage inside updater function | `const next = typeof v === 'function' ? v(S.get(key) ?? fallback) : v` — reads from storage, not stale closure | React setState closures can capture stale values. Always read from source of truth (localStorage) inside functional updates.

2026-04-08 | Validation | ±5% tolerance is the universal validation threshold across all stages | `tolerance(actual, expected)` utility returns `{ok, pct, label}` — green badge for 95-105%, red outside | Consistent tolerance function reused across all 5 stages. Never hardcode tolerance checks inline.

## 2026-08-19 — #126 Role and plant decide what a user sees

**A test that cannot run is not a test that passes.** `TESTING.md` carried a "known environment
blocker": Chromium could not be downloaded in the sandbox, so the Playwright specs were "authored
and discoverable" but never executed. This session's machine had a pre-provisioned Chromium at
`/opt/pw-browsers/chromium`, so they ran for the first time in a long while — and **all 7 failed**,
none of it caused by this ticket:

| The spec still did | Reality |
|---|---|
| Filled `Cost Price (₹)` at Coil Inward | The field was deleted; cost arrives via the daily Excel |
| Clicked `Upload Dispatch Excel` | Dispatch has no upload — it is rebuilt from the Orders tab's workbook |
| `selectOption` on the SKU and HR Coil ID pickers | Both are `SearchSelect` (an `<input>` + option buttons), not `<select>` |
| Expected `Save Baby Coil` | The button counts: `Save 1 Baby Coil` |
| Expected `No eligible baby coil` | The message reads `No eligible coil to suggest` |
| Expected FIFO to allocate on its own | **Use suggestion** must be clicked — the never-auto-save rule |
| Went straight to `page.goto('/')` | The login gate has stood in front of the app since July |

Every one of those is a change that shipped, correctly, past a suite that could not object. The fix
is two lines in `playwright.config.js` — an optional `PW_CHROMIUM_PATH` that sets
`launchOptions.executablePath` — so a machine with a browser already on it never has to pretend it
cannot test. **Before believing a suite, run it.** 28 E2E tests now pass.

**Stub the backend, don't wait for it to fail.** With `.env.test` pointing at a host that does not
resolve, the app sat on "Loading inventory data..." while six table reads died slowly through the
proxy — longer than any test timeout. Answering `**/rest/v1/**` with `[]` is the same starting state
the specs always assumed, and instant. One subtlety worth keeping: answer **writes** as accepted
too. A rejected write makes `useSupabaseStore` re-pull so the UI stops showing rows Postgres
refused, and a re-pull against an empty stub would throw away the very coil the test just registered.

**A session can be well-formed and still grant nothing.** `parseStoredSession` asks "is this a
session?" and `accessFor` asks "what may it do?" — and a `plant` credential with a NULL plant column
passes the first and fails the second, because `verifyLoginDetails` maps NULL → `ALL_PLANTS` (right
for an admin, meaningless for a plant login). Keeping them separate was correct; requiring **both**
at the two call sites is what closes the hole. Reading that session as "every plant" would have
handed a plant login the whole company; signing them into an app with zero tabs would have
presented a credential to fix as a bug in the app. It now says which, and where it is fixed.

**Two lists of tabs is one list too many.** `APP_TABS` moved from `App.jsx` into `calc.js` beside
`accessFor`. A tab added to a component-local list and not to the rule is a tab shown to everyone by
a rule that had never heard of it — and `App.jsx` cannot be imported by the test suite, so no test
could ever catch the drift.

**Copy has to survive the change it describes.** The Dispatch plant-filter notice ended "Switch to
**All Plants** to delete" — an instruction a plant user cannot follow, because they have no
selector. Gating tabs meant re-reading every string that assumed the reader could change the scope.
`docs/ARCHITECTURE.md` also still described a "Reset Data" header button that no longer exists
anywhere in the app.

### Review round on #126 — what the two axes caught

**The doc you skip is the one that governs the code you changed.** `CLAUDE.md`'s "Read before you
change these areas" table binds `docs/UI-PATTERNS.md` to "Components, DataTable, stage forms". This
ticket changed a stage form (Coil Inward's Plant field), two components' write controls and a
DataTable's Actions column — and updated five other docs while skipping that one. Three of its
statements were left false. Updating the docs you *thought of* is not the same as updating the ones
the table names.

**"All Plants" is the worst possible fallback for a scoped user.** `plantLabelForHeader` ended
`|| 'All Plants'`. For an admin that is unreachable (the value always comes from the options). For a
plant user whose credential names a plant id no master row matches, it fired — and the one place
their plant is stated told them they were looking at the whole company. A fallback is only safe if
it is safe on *every* path that can reach it. It now shows the unmatched id itself.

**Unmounting a button is not withholding the feature.** The Orders upload's hidden
`<input type="file">` was left mounted while only its `<Btn>` was gated — the whole write path one
console line away, and the docs claiming controls were "withheld from the DOM". The trigger and the
thing it triggers gate together.

**Two mechanisms documented as separate will diverge — gate on the right one.** `accessFor` gated
the manufacturing tabs on `manufactures`, but Coil Inward's admin picker honours
`COIL_INWARD_PLANT_IDS`, a rollout list `calc.js` explicitly says is *not* the same question. A
plant with `manufactures: true` not yet on the rollout list would have let a plant user register
coils an admin cannot offer. Latent today (both lists match) — closed, with a test that flips
Lepakshi to manufacturing to prove it.

**Scoping hides the unattributed, and someone must still fix them.** `filterByPlant` matches the
stored value exactly, so a legacy blank-plant row is invisible to a plant user in the pipeline
stages. That is right — a row that cannot say where it sits is not one plant's to claim — but it
silently makes backfilling an admin-only job. Written down in both `ARCHITECTURE.md` and
`UI-PATTERNS.md` rather than left to be discovered by a plant user who cannot find their coil.

### Round two on #126 — the fix that was worse than the bug

**Never hand a component a filtered copy of a store it writes back.** Scoping the pipeline stages by
passing `pipelineBabyCoils` looked like the tidy version of "a plant user sees only their plant". It
was a data-loss bug. `Slitting.save` builds its next array from the `babyCoils` prop and calls
`setBabyCoils(updated)` — not `setBabyCoils(prev => …)` — so with a filtered prop `next` is a strict
subset of `prev`, and `syncToSupabase` reads every id in prev-but-not-next as a deletion. On
`baby_coils`, a HARD one. **One Hyderabad operator saving one baby coil would have permanently
deleted every NPMD baby coil.** `CoilInward` and `Production` use the functional setter and were
safe — which is exactly why the bug was easy to miss: two of the three stages tolerated it.

The same blunt filtering also silently disarmed the cross-stage guards. "A baby coil consumed by
**any** production cannot be deleted" is only true against the whole register; so are the duplicate
`hrCoilId` check and `nextCoilNumber`. Worst case is a legacy blank-plant row, which `genHRCoilId`
gives an `HYD-` id — precisely what a new Hyderabad coil collides with, and precisely what the
scoped array hid. **Display scopes; state and guards do not.**

**A regression test is not finished until you have watched it fail.** The first version of the
new test passed with the defect deliberately reintroduced — twice, for two different reasons:
1. **Route shadowing.** The recorder installed its own `page.route` before `signIn` installed the
   stub. Playwright runs the most recently registered handler first, so the recorder never fired and
   `writes` was always `[]` — every assertion on it was vacuously true. Fixed by passing `onRequest`
   into `signIn` (one handler), plus an `expect(writes.length).toBeGreaterThan(0)` so a silent
   recorder fails loudly instead of passing quietly.
2. **Ordering.** `syncToSupabase` awaits its upsert before issuing any delete, so when the saved row
   appears on screen the destructive half of that same sync has not been sent. Asserting there
   passes while the bug is live. Fixed with a `settle()` that waits for the request traffic to stop.

Only after reintroducing the defect a third time did the test actually go red. Two review rounds
found this; the first round's Standards axis flagged the guard narrowing and the Spec axis found the
delete. **Neither would have been caught by the app's own screens** — the rows destroyed are the
ones the user cannot see, which is why the assertion had to move to the network layer.

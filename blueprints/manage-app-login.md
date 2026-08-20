# Blueprint: Manage the App Logins (ID + Password + Plant + Role)

## Goal
Add, change or reset a login, and understand what a login does and does not protect.

## This is UI tidiness, NOT confidentiality
Read this before you promise anyone anything.

- A login keeps people out of the **app**, and a plant login keeps the **other plant's screens**
  out of one operator's way. That is all it is for.
- It is **not** a security boundary. Every data table keeps its permissive `using (true)`
  row-level policy, and the app's public key still reaches **all** data — every plant's — exactly
  as it did before logins carried a plant.
- So: never tell a plant team their data is private, hidden, or protected from the other plant.
  It is not. Anyone technical with the public key can read all of it.
- Locking the **data** down needs Supabase Auth and rewritten policies — see "Upgrade path".

## How the login works (plain version)
- When someone opens the app they see a **Sign in** screen (Login ID + Password).
- The password is **not** stored in the app. It lives in a private Supabase table
  (`app_credentials`) that the app itself cannot read. The app only asks a database function
  whether the password is correct.
- There are **two** such functions, both `security definer`, both bcrypt:
  - `verify_login(p_login_id, p_password) → boolean` — the original yes/no. **No longer used by
    the app** since ticket #126: a yes/no cannot decide which tabs to render. Kept so a browser
    tab still running an older build can sign in until it reloads.
  - `verify_login_details(p_login_id, p_password) → (login_id, plant, role)` — added by ticket
    #125, and what the app signs in with today. A wrong password returns **no rows**.
  The second was added **beside** the first, not instead of it, so the SQL could be run against
  the database serving the live app without breaking sign-in before the new build shipped.
  Neither function ever returns the password hash.
- After a correct sign-in, the browser remembers the session on **that device for ~30 days**
  (stored under `jsw:auth` as `{loginId, plant, role, at}`), so the user isn't asked every visit.
  **Logout** (top bar, next to the dark-mode moon) clears it.

## What each login SEES (ticket #126)
| Tab | `admin` | `hyderabad` / `npmd` |
|---|---|---|
| Dashboard, Coil Tracker, Dispatch, Sales | All plants, plus the plant selector | Their plant only |
| Coil Inward, Slitting, Production | All plants, plus the selector | Their plant, pinned — and only if that plant `manufactures` |
| SKU Master | View and **edit** | View only |
| Orders & Invoice | **Upload** and view | View, their plant |
| Reports | **Yes** | Hidden |

The three admin-only powers are admin-only for a reason worth knowing before you hand anyone the
`admin` password: the **upload** replaces the whole company's order book in one go (a second
uploader on a stale file overwrites everyone), **SKU Master** sets `weightPerTube` and therefore
every plant's tonnage and cost, and **Reports** builds the company-wide workbooks.

A plant user gets **no plant selector** — their plant is on their login, and the header names it.
Read the box at the top of this file again before telling anyone what that does and does not mean.

## The three logins
| Login ID | Role | Plant | Who |
|---|---|---|---|
| `admin` | `admin` | *(none — all plants)* | The existing shared login. Kept working; became the admin role without being recreated |
| `hyderabad` | `plant` | `hyderabad` | The Hyderabad team |
| `npmd` | `plant` | `npmd` | The NPMD team |

Lepakshi and Tapi have **no login**. They are modelled as plants for attribution only — they carry
orders but have never produced or invoiced — and credentials wait until someone there asks.

**Passwords are set by a human, in the Supabase SQL editor.** No password is stored in this
repository, and none is chosen or handled by an agent.

## Where things live
- Table `app_credentials` (`login_id`, `password_hash`, `plant`, `role`, `updated_at`) — private,
  no anon access.
  - `plant` = a plant **id** from `src/data/plants.js` (`hyderabad`, `npmd`, …), never a display
    name. **NULL means all plants**, which is what `admin` carries.
  - `role` = `'admin'` or `'plant'`, enforced by a check constraint, `not null`, and **no default** —
    a row written without a role fails loudly rather than quietly minting an admin.
- Functions `verify_login` and `verify_login_details` — the only ways in.
- All of it is defined in `supabase-setup.sql` (section "APP LOGIN GATE"), which is written for a
  **brand-new** database. For a database that already holds data, the same section is extracted
  verbatim into `migrate-login-plant-role.sql` — see "bring an EXISTING database up to date" below.
- App code: `verifyLogin()` and `verifyLoginDetails()` in `src/lib/db.js`; the `LoginGate` + `App`
  wrapper in `src/App.jsx`.

## Steps — add the two plant logins (run once)
In the Supabase dashboard → **SQL Editor**, replacing each `CHOOSE_A_PASSWORD` with a password you
choose. Run it once; re-running it just resets those two passwords.

```sql
insert into app_credentials (login_id, password_hash, plant, role)
values
  ('hyderabad', extensions.crypt('CHOOSE_A_PASSWORD', extensions.gen_salt('bf')), 'hyderabad', 'plant'),
  ('npmd',      extensions.crypt('CHOOSE_A_PASSWORD', extensions.gen_salt('bf')), 'npmd',      'plant')
on conflict (login_id) do update
  set password_hash = excluded.password_hash,
      plant         = excluded.plant,
      role          = excluded.role,
      updated_at    = now();
```

Check what you created — this shows the logins and **never** the hashes:

```sql
select login_id, role, coalesce(plant, '(all plants)') as plant, updated_at
from app_credentials order by role, login_id;
```

## Steps — change a PASSWORD
```sql
update app_credentials
  set password_hash = extensions.crypt('NEW_PASSWORD', extensions.gen_salt('bf')),
      updated_at = now()
  where login_id = 'hyderabad';   -- or 'npmd', or 'admin'
```
Anyone logged in stays logged in on their device until they log out or ~30 days pass; the new
password is required at the next sign-in.

## Steps — demote a legacy login to a plant login
Before ticket #125 there were no roles, so **every** login that already existed could do everything —
and the backfill therefore reads them all as `admin`, which is what they already were. If your
database carries a second login from those days, decide what it should now be and say so:

```sql
update app_credentials
  set role = 'plant', plant = 'hyderabad', updated_at = now()
  where login_id = 'the-old-second-login';
```
Run the `select login_id, role, plant …` above first — that is the only way to find out whether you
have any. Nothing guesses this for you: which plant a legacy login belongs to is not in the data.

## Steps — change a LOGIN ID
```sql
update app_credentials set login_id = 'your-new-id' where login_id = 'admin';
```

## Steps — onboard a further plant later (e.g. Lepakshi)
A new plant login is **two** changes, and the code one comes first — the database will accept a
plant id the app has never heard of, and then the sign-in has a plant nothing recognises.

1. **In the code**: the plant must already exist in `src/data/plants.js` with its own `id`. All four
   (`hyderabad`, `npmd`, `lepakshi`, `tapi`) are there today, so for those four there is nothing to
   do. A **fifth** company appearing in the ERP needs a row added there first — see
   `docs/DATA-MODEL.md` and `docs/adr/0004-plant-dimension-from-erp-ship-from-code.md`.
2. **In the database**: one insert, same shape as above.
   ```sql
   insert into app_credentials (login_id, password_hash, plant, role)
   values ('lepakshi', extensions.crypt('CHOOSE_A_PASSWORD', extensions.gen_salt('bf')), 'lepakshi', 'plant')
   on conflict (login_id) do update
     set password_hash = excluded.password_hash,
         plant         = excluded.plant,
         role          = excluded.role,
         updated_at    = now();
   ```

A plant that does not manufacture (`manufactures: false` in the plant master — Lepakshi and Tapi
today) is never offered the Coil Inward / Slitting / Production stages. That flag, not the login,
decides it — `accessFor` in `src/lib/calc.js` reads it, and flipping it is still the one-line change
`docs/adr/0004` promised.

## Steps — bring an EXISTING database up to date
The SQL in this file assumes `app_credentials` already has `plant` and `role` and that
`verify_login_details` exists. On a database created before ticket #125 neither is true, and
**shipping the app does not change the database** — the two move separately, and nothing warns you.

Check which era a database is in before you trust any step above:
```sql
select
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'app_credentials'
       and column_name in ('plant', 'role'))            as plant_role_cols,   -- want 2
  (select count(*) from pg_proc
     where proname = 'verify_login_details')            as details_fn;        -- want 1
```
Anything less than `2` and `1` means the database is behind. Fix it by running
**`migrate-login-plant-role.sql`** (repo root) in the SQL Editor: it is the "APP LOGIN GATE" section
of `supabase-setup.sql` extracted verbatim and nothing else, it is safe to re-run, and it touches no
password. Then re-run the check above. Do **not** run the whole `supabase-setup.sql` against a live
database to achieve this — it also carries `delete from tubes;` and re-creates every table policy.

**A database that is behind means nobody new can sign in.** `verifyLoginDetails` is the only
sign-in path the app has, so a missing `verify_login_details` makes the RPC error, and `LoginGate`
reports **"Could not reach the server."** — the same words a dead connection produces. Everyone
already signed in stays signed in for their ~30 days, which is exactly why this can sit unnoticed:
the people who would report it are the only people who cannot see it. If sign-in fails on a fresh
browser but works on yours, run the check above **before** looking at the network or the env vars.

## Steps — set up the logins on a brand-new database
Running `supabase-setup.sql` creates the table + both functions but seeds **no** password (on
purpose). Create the admin once, then add the plant logins with the SQL above:
```sql
insert into app_credentials (login_id, password_hash, plant, role)
values ('admin', extensions.crypt('CHOOSE_A_PASSWORD', extensions.gen_salt('bf')), null, 'admin')
on conflict (login_id) do update
  set password_hash = excluded.password_hash,
      plant         = excluded.plant,
      role          = excluded.role,
      updated_at    = now();
```

## Edge Cases
- **Forgot the password**: there is no "reset email" — just set a new one with the password SQL above.
- **Locked out on a shared PC / want everyone re-prompted**: change the password; each device
  re-prompts at its next sign-in.
- **"Could not reach the server" on the login screen**: the app can't reach Supabase (bad/missing
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, or network). Fix the env/connection.
- **Wrong password vs. no connection**: `verifyLoginDetails` returns `null` for a wrong password and
  **throws** on a network/RPC error. The UI must keep telling those two apart.
- **A login with a plant id no plant master row matches**: the sign-in succeeds and the plant reads
  as nothing recognised. Fix the row (step 1 above), don't work around it in the app.
- **`role` rejected on insert**: the check constraint allows only `'admin'` and `'plant'`. There is
  no third role; if you need one, that is a code change, not a data change.

## Known Issues / Limits
- The login guards the app UI, not the database. A technical person with the public key can still
  reach **every plant's** data directly. Use strong, non-obvious passwords.
- The password check is callable with the public key, so pick a strong password (bcrypt slows
  guessing, but don't use something trivial).
- A login with `role = 'plant'` and **no plant** (a NULL `plant` column) cannot sign in: the app
  refuses it with "This login is not set up correctly" rather than opening with no tabs. A NULL
  plant means *all plants*, which is an admin, and a plant login with all plants would defeat the
  point. Fix the row — the `select` above shows you which logins have no plant.

## Upgrade path (only if you need to protect the DATA too)
Switch to **Supabase Auth** (real accounts) and replace the open `using (true)` policies on the
data tables with `auth`-scoped ones. Bigger change, and it can affect the Excel-import scripts and
the daily-report skills that use the open key — plan it separately.

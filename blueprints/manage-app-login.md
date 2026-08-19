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
  - `verify_login(p_login_id, p_password) → boolean` — the original yes/no.
  - `verify_login_details(p_login_id, p_password) → (login_id, plant, role)` — added by ticket
    #125; answers **who** signed in. A wrong password returns **no rows**.
  The second was added **beside** the first, not instead of it, so the SQL could be run against
  the database serving the live app without breaking sign-in before the new build shipped.
  Neither function ever returns the password hash.
- After a correct sign-in, the browser remembers the login on **that device for ~30 days**
  (stored under `jsw:auth`), so the user isn't asked every visit. **Logout** (top bar,
  next to the dark-mode moon) clears it.

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
- All of it is defined in `supabase-setup.sql` (section "APP LOGIN GATE").
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
decides it.

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
- Nothing on screen reads the plant or the role **yet**. Ticket #125 laid the credential model only;
  the tab gating is the next ticket. Until it ships, all three logins see the same app.

## Upgrade path (only if you need to protect the DATA too)
Switch to **Supabase Auth** (real accounts) and replace the open `using (true)` policies on the
data tables with `auth`-scoped ones. Bigger change, and it can affect the Excel-import scripts and
the daily-report skills that use the open key — plan it separately.

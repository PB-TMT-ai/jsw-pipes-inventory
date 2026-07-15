# Blueprint: Manage the App Login (ID + Password)

## Goal
Change, reset, or understand the single shared login ID and password that gate the app.

## How the login works (plain version)
- When someone opens the app they see a **Sign in** screen (Login ID + Password).
- The password is **not** stored in the app. It lives in a private Supabase table
  (`app_credentials`) that the app itself cannot read. The app only asks a database
  function, `verify_login`, "is this password correct?" and gets back yes/no.
- After a correct sign-in, the browser remembers the login on **that device for ~30 days**
  (stored under `jsw:auth`), so the user isn't asked every visit. **Logout** (top bar,
  next to the dark-mode moon) clears it.
- This keeps people out of the **app**. It does **not** lock down the raw Supabase data,
  which is still reachable with the app's public key (that's how the app was built). Fully
  protecting the data is a bigger job — see "Upgrade path" below.

## Where things live
- Table `app_credentials` (`login_id`, `password_hash`, `updated_at`) — private, no anon access.
- Function `verify_login(p_login_id, p_password) → boolean` — the only way in.
- Both are defined in `supabase-setup.sql` (section "APP LOGIN GATE").
- App code: `verifyLogin()` in `src/lib/db.js`; the `LoginGate` + `App` wrapper in `src/App.jsx`.

## Steps — change the PASSWORD
1. Open the Supabase dashboard → your project → **SQL Editor**.
2. Run (replace `NEW_PASSWORD` with the password you want):
   ```sql
   update app_credentials
     set password_hash = extensions.crypt('NEW_PASSWORD', extensions.gen_salt('bf')),
         updated_at = now()
     where login_id = 'admin';
   ```
3. Anyone logged in stays logged in on their device until they log out or ~30 days pass;
   the new password is required at the next sign-in.

## Steps — change the LOGIN ID
```sql
update app_credentials set login_id = 'your-new-id' where login_id = 'admin';
```

## Steps — set up the login on a brand-new database
Running `supabase-setup.sql` creates the table + function but seeds **no** password (on purpose).
Create the first login once:
```sql
insert into app_credentials (login_id, password_hash)
values ('admin', extensions.crypt('CHOOSE_A_PASSWORD', extensions.gen_salt('bf')))
on conflict (login_id) do update
  set password_hash = excluded.password_hash, updated_at = now();
```

## Edge Cases
- **Forgot the password**: there is no "reset email" — just set a new one with the password SQL above.
- **Locked out on a shared PC / want everyone re-prompted**: change the password; each device
  re-prompts at its next sign-in.
- **"Could not reach the server" on the login screen**: the app can't reach Supabase (bad/missing
  `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`, or network). Fix the env/connection.
- **More than one login**: this is one shared login by design. For separate per-person logins,
  add more rows to `app_credentials` and adjust the check — or move to the upgrade path below.

## Known Issues / Limits
- The login guards the app UI, not the database. A technical person with the public key can still
  reach the data directly. Use a strong, non-obvious password.
- The password check is callable with the public key, so pick a strong password (bcrypt slows
  guessing, but don't use something trivial).

## Upgrade path (only if you need to protect the DATA too)
Switch to **Supabase Auth** (real accounts) and replace the open `using (true)` policies on the
data tables with `auth`-scoped ones. Bigger change, and it can affect the Excel-import scripts and
the daily-report skills that use the open key — plan it separately.

# Authentication setup (required)

As of the security remediation on branch `claude/keen-newton-djsckg`, the app is
**gated behind Supabase Auth** and the database enforces **authenticated-only**
Row Level Security. The public anon key alone no longer grants any access.

This closes the Critical finding in `ENGINEERING_REVIEW.md` (C-1): previously the
RLS policies were `using (true)`, so anyone with the public URL could read, write,
and delete every table.

## What changed in the code

- `supabase-setup.sql` — every table's policy is now
  `using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated')`.
  The policy name is intentionally left as `"Allow all access"` so the
  `drop policy if exists` lines replace any previously-deployed permissive policy
  in place (renaming would orphan the old `using (true)` policy and silently keep
  access open).
- `src/App.jsx` — a `LoginScreen` now wraps the app; data loads only after a user
  signs in. A **Sign out** button and the signed-in email appear in the header.
- `src/lib/supabase.js` — throws at startup if `VITE_SUPABASE_URL` /
  `VITE_SUPABASE_ANON_KEY` are missing (fail loud instead of silently broken).

## One-time setup in your Supabase project

These steps happen in the Supabase dashboard / SQL editor — they cannot be done
from the app code.

1. **Run the updated SQL.** Open **SQL Editor**, paste the full
   `supabase-setup.sql`, and **Run**. This replaces the old open policies with the
   authenticated-only ones (safe to re-run; idempotent).
2. **Enable the Email provider.** **Authentication → Providers → Email → Enable.**
3. **Disable public sign-ups** so only accounts you create can log in.
   **Authentication → Providers → Email** (or **Authentication → Settings**):
   turn **off** "Allow new users to sign up". (This app has no sign-up screen by
   design — operators are provisioned by an admin.)
4. **Create operator accounts.** **Authentication → Users → Add user** → set email
   + password, and mark the email **confirmed** (or send an invite). Repeat per
   operator.

## Environment variables

Local dev and any deployment must provide:

```
VITE_SUPABASE_URL=...          # your project URL
VITE_SUPABASE_ANON_KEY=...     # your project anon (public) key
```

Copy `.env.example` to `.env.local` and fill these in for local dev. On Vercel,
set them in the project's Environment Variables. If either is missing the app
throws a clear error at startup instead of failing silently.

## Verify it works

1. `npm run dev`, open the app → you should see the **Sign in** screen, not the
   dashboard.
2. Sign in with a provisioned account → the pipeline loads as before.
3. Click **Sign out** → you're returned to the login screen and data is no longer
   loaded.
4. (Optional, proves the DB gate) With the app signed out, a raw request using the
   anon key — e.g. `supabase.from('coils').select('*')` from a console — should
   return **no rows / a permission error**, where before it returned everything.

## Notes

- This is a shared-account-capable gate (any number of email/password accounts),
  not a full user-management or per-row-ownership system. Per-user roles/ownership
  can be layered on later by tightening the policies (e.g. `auth.uid()`-scoped
  rows).
- The Excel parser was also moved off the vulnerable `xlsx` package to the patched
  `@e965/xlsx` mirror; `npm audit` reports 0 vulnerabilities.

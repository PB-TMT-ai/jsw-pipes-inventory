-- ═══════════════════════════════════════════════════════════════
-- JSW Pipes & Tubes Inventory — Add plant + role to the app logins
-- ═══════════════════════════════════════════════════════════════
-- WHY: the live database still carries the July 2026 login gate — `app_credentials`
-- with only (id, login_id, password_hash, updated_at), and `verify_login` alone.
-- Tickets #125/#126 shipped in the app but were never run against it, so today:
--
--   * `verify_login_details` DOES NOT EXIST on the database, and it is the ONLY
--     sign-in path the current build has (src/App.jsx LoginGate → verifyLoginDetails
--     in src/lib/db.js). The RPC errors, the catch fires, and the login screen says
--     "Could not reach the server." Anyone signing in on a new device, or whose
--     ~30-day `jsw:auth` session has lapsed, CANNOT GET IN. Running this file fixes
--     that; it is not housekeeping.
--   * there is no `plant` / `role` column, so no plant login can exist yet.
--
-- This file is the login-gate section of supabase-setup.sql and NOTHING ELSE —
-- extracted verbatim so the two can never drift. Prefer it over running the whole
-- setup file against a live database: that file also carries `delete from tubes;`
-- and re-creates every table policy, which is a far wider blast radius than this.
--
-- HOW TO USE:
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste this ENTIRE file → Run
--   3. Reload the app (no redeploy needed — it reads Supabase live)
--
-- SAFE TO RE-RUN: every step is guarded (column-exists checks, `if not exists` on
-- the constraint, `create or replace` on the function). The backfill runs only at
-- the moment the column is introduced, so re-running can never re-stamp a login
-- somebody has since set to 'plant'.
--
-- NO PASSWORD IS TOUCHED. The existing `admin` login is not recreated and nobody is
-- locked out. This file creates NO new login either — `hyderabad` and `npmd` need a
-- password a human chooses, and that SQL is in blueprints/manage-app-login.md.
--
-- UI TIDINESS, NOT CONFIDENTIALITY. Every data table keeps its permissive
-- `using (true)` policy and the app's public key still reaches every plant's data.
-- A plant login keeps the wrong plant's coil off an operator's screen; it does not
-- make a plant's data private, and nobody may describe it that way.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. plant + role on the credential (verbatim: supabase-setup.sql 418–441) ────────────────────
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'app_credentials'
                   and column_name = 'plant') then
    alter table app_credentials add column plant text;
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'app_credentials'
                   and column_name = 'role') then
    alter table app_credentials add column role text;
    -- Every login that predates #125 is the shared admin. Plant stays NULL: all plants.
    update app_credentials set role = 'admin';
    alter table app_credentials alter column role set not null;
  end if;

  -- No default on `role` — a login's role is always stated when the row is written, so a mis-typed
  -- INSERT fails loudly instead of quietly minting an admin (or quietly stranding a plant user).
  if not exists (select 1 from pg_constraint where conname = 'app_credentials_role_check') then
    alter table app_credentials
      add constraint app_credentials_role_check check (role in ('admin', 'plant'));
  end if;
end $$;

-- ── 2. the sign-in function the app actually calls (verbatim: supabase-setup.sql 447–460) ───────
-- Additive: `verify_login` above is left exactly as it is, so a browser tab still running an older
-- build keeps signing in until it reloads. The password goes in as a parameter and the hash never
-- comes out — the result carries only the login id, plant and role. A wrong password returns NO
-- ROWS rather than a row with the fields blanked.
create or replace function verify_login_details(p_login_id text, p_password text)
returns table (login_id text, plant text, role text)
language sql
security definer
set search_path = public, extensions
as $$
  select c.login_id, c.plant, c.role
  from app_credentials c
  where c.login_id = p_login_id
    and c.password_hash = extensions.crypt(p_password, c.password_hash);
$$;

revoke all on function verify_login_details(text, text) from public;
grant execute on function verify_login_details(text, text) to anon, authenticated;

-- ── 3. Check what you have. Shows the logins and NEVER the hashes. ──────────────────────────────
select login_id,
       role,
       coalesce(plant, '(all plants)') as plant,
       updated_at
from app_credentials
order by role, login_id;

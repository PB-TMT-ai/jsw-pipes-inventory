-- ═══════════════════════════════════════════════════════════════
-- JSW Pipes & Tubes Inventory — Add orders.plant + the state_regions table
-- ═══════════════════════════════════════════════════════════════
-- WHY: the daily "Upload Sales Excel" fails with
--
--     Could not find the 'plant' column of 'orders' in the schema cache
--
-- Ticket #118 gave every order line a `plant` and shipped it in the app; the
-- matching DDL went into supabase-setup.sql but was never RUN against the live
-- database. So `App.jsx` sends a `plant` key on all ~200 order rows, PostgREST
-- finds no such column, and the whole insert is rejected.
--
-- This is not cosmetic. `orders` is a HARD replace-all on upload (REPLACE_MODE in
-- src/lib/db.js): the old rows are deleted BEFORE the new ones land, so a rejected
-- insert leaves the order book EMPTY — which is the "0 order line(s) · 0 open" and
-- "No records found" on screen. Nothing is recoverable from the database; the fix is
-- to run this file and then RE-UPLOAD the same Sales Excel, which rebuilds the book.
--
-- The same audit found `state_regions` (ticket #101–#105, the State → Region master
-- edited from the Sales tab) missing from the live database for the same reason.
-- It is created here too, so the next region edit does not fail the same way.
--
-- Every other column the app writes was checked against the live database and is
-- present: coils.plant, baby_coils.plant, productions.plant, orders.ship_to_state,
-- orders.distributor_code, app_credentials.plant/role.
--
-- This file is those statements from supabase-setup.sql and NOTHING ELSE — extracted
-- verbatim so the two can never drift. Prefer it over running the whole setup file
-- against a live database: that file also carries `delete from tubes;` and re-creates
-- every table policy, which is a far wider blast radius than this.
--
-- HOW TO USE:
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste this ENTIRE file → Run
--   3. Reload the app and upload the day's Sales Excel again (no redeploy needed)
--
-- SAFE TO RE-RUN: `add column if not exists` / `create table if not exists`, and the
-- policy is dropped before it is created. NO EXISTING ROW IS TOUCHED — there is no
-- backfill here and none is needed: orders are replace-all on upload, so the next
-- upload stamps a plant on every line, and `state_regions` is meant to start empty
-- (the shipped mappings live in src/data/stateRegions.js and are layered underneath).
-- ═══════════════════════════════════════════════════════════════

-- ── 1. plant on the order book (verbatim: supabase-setup.sql 218–223) ───────────────────────────
-- The plant id resolved from the ERP's "Ship From Code" ('hyderabad' | 'npmd' | 'lepakshi' |
-- 'tapi'), NULL when the code matched no plant, which the app displays as `Unattributed`. The
-- plant master itself is a code constant (src/data/plants.js), not a table: four rows, all of them
-- the ERP's own identifiers, nothing for an operator to type.
alter table orders add column if not exists plant text;

-- ── 2. the State → Region master (verbatim: supabase-setup.sql 252–275) ─────────────────────────
-- Region is a business concept the ERP never exports; state arrives with the data. So the master is
-- keyed by STATE, not by distributor: map a state once and every distributor shipping there
-- inherits the region, and no state is ever hand-typed. `state` is UPPER-CASE, matching
-- resolveShipToState's storage on both order and invoice lines, and is the UNIQUE upsert arbiter
-- (see CONFLICT_TARGET in src/lib/db.js) — one row per state, so re-mapping a state must UPDATE
-- that row instead of colliding. `region` is nullable because an un-mapping is an explicit blank
-- (stored NULL) that must override the seed rather than let the seeded value spring back.
create table if not exists state_regions (
  id uuid primary key default gen_random_uuid(),
  state text not null,
  region text,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (state)
);
alter table state_regions enable row level security;
drop policy if exists "Allow all access" on state_regions;
create policy "Allow all access" on state_regions for all using (true) with check (true);

-- ── 3. Nudge PostgREST to re-read the schema. ──────────────────────────────────────────────────
-- The error names the "schema cache" for a reason: PostgREST answers from a cached view of the
-- schema. Supabase reloads it on DDL by itself, but saying so costs nothing and removes the
-- "I ran the SQL and it still fails" round-trip.
notify pgrst, 'reload schema';

-- ── 4. Check what you have. Both rows must come back `yes`. ────────────────────────────────────
select 'orders.plant' as item,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'orders'
                           and column_name = 'plant') then 'yes' else 'NO' end as present
union all
select 'state_regions table',
       case when exists (select 1 from information_schema.tables
                         where table_schema = 'public' and table_name = 'state_regions')
            then 'yes' else 'NO' end;

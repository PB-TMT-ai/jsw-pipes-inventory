-- ═══════════════════════════════════════════════════════════════
-- JSW Pipes & Tubes Inventory — Create the planning_master table (ticket #279)
-- ═══════════════════════════════════════════════════════════════
-- WHY: the Production Planning tab's master can now be edited, added to and retired from on
-- screen. Those edits are stored in `planning_master` (store key `jsw:planningMaster`). Without the
-- table every edit is rejected, the sync-error banner shows, and the screen falls back to the seed.
--
-- Additive only: one new, empty table and its policy. Nothing existing is read, changed or
-- deleted. An empty table reads as the shipped seed, so running this changes nothing on screen.
--
-- This file is the block from supabase-setup.sql, extracted verbatim so the two cannot drift, plus
-- one closing `notify pgrst` line. Prefer it over running the whole setup file against a live database (that file
-- also carries `delete from tubes;`). Safe to re-run: every statement is guarded.
-- After running it: `notify pgrst, 'reload schema';` so PostgREST sees the table at once.

-- ── PLANNING MASTER (ticket #279, map #248) ─────────────────────────────────────────────────────
-- The admin's edits to the Production Planning tab's master. The 471 starting rows are a code seed
-- (src/data/planningMaster.js); this table holds only the rows an admin has EDITED, ADDED or
-- RETIRED, each as the WHOLE row, and `planningMaster(stored)` in calc.js layers them over the seed
-- per row. It starts empty, and an empty table reads as the seed exactly. No upload writes here:
-- the master is kept on screen only (#249).
--
-- `row_key` is the row's identity, `Region|Size|band` ('South|100x50|2.0'), and the UNIQUE upsert
-- arbiter — the first edit of a seeded row arrives under a fresh uuid, and every later edit must
-- UPDATE that row rather than collide.
--
-- `retired` is NOT `deleted`. A retired row is hidden from the master but stays readable, so a
-- month's plan that used it still can (#249). A soft-deleted row is not there at all: the seed row
-- shows through it.
--
-- `plants` is a text[] of plant ids ('{hyderabad,lepakshi}'); the app writes only plants that
-- serve the row's region. An EMPTY array is a real answer: "No plant can make" (#250).
create table if not exists planning_master (
  id uuid primary key default gen_random_uuid(),
  row_key text not null,
  region text not null,
  size text not null,
  thickness numeric not null,
  type text not null,
  buffer numeric,
  plants text[] not null default '{}',
  retired boolean not null default false,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (row_key)
);
alter table planning_master enable row level security;
drop policy if exists "Allow all access" on planning_master;
create policy "Allow all access" on planning_master for all using (true) with check (true);

notify pgrst, 'reload schema';

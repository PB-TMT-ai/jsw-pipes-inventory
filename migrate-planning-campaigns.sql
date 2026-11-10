-- ═══════════════════════════════════════════════════════════════
-- JSW Pipes & Tubes Inventory — Create the planning_campaigns table (ticket #281)
-- ═══════════════════════════════════════════════════════════════
-- WHY: the Production Planning tab's monthly campaign (A2 sheet) now saves the Monthly Indent and
-- the Planned production the admin types. They are stored in `planning_campaigns` (store key
-- `jsw:planningCampaigns`). Without the table every typed figure is rejected, the sync-error banner
-- shows, and the sheet falls back to showing only the suggestions.
--
-- Additive only: one new, empty table and its policy. Nothing existing is read, changed or deleted.
--
-- This file is the block from supabase-setup.sql, extracted verbatim so the two cannot drift, plus
-- one closing `notify pgrst` line. Prefer it over running the whole setup file against a live
-- database (that file also carries `delete from tubes;`). Safe to re-run: every statement is guarded.

-- ── PLANNING CAMPAIGNS (ticket #281, map #248) ──────────────────────────────────────────────────
-- The monthly campaign the admin types on the Production Planning tab's A2 sheet: ONE row per
-- region per month ('South', '2026-11'), unique on that pair, which is also the upsert arbiter —
-- the first edit of a region × month arrives under a fresh uuid, and every later edit (from this tab
-- or another) must UPDATE that row rather than collide.
--
-- `lines` is a JSONB object keyed by the planning master's row key, one entry per row with anything
-- typed:  { "South|50x50|1.6": { "indent": 60, "planned": 120, "basis": 100 } }
--   indent   the Monthly Indent, MT, typed by hand (never derived from the order book)
--   planned  the Planned production, MT, ONLY when the admin typed over the suggestion; absent, the
--            screen shows the suggestion. A typed figure is kept, never overwritten.
--   basis    the suggestion Planned was typed against — when today's suggestion differs, the row
--            turns amber and offers "use N"
--   plant    (ticket #282) the plant chosen for a two-plant row; '' = Choose… (blank, not carried)
--   split    (ticket #282) { "hyderabad": 45, "lepakshi": 75 } — the row divided across its ticked
--            plants, any tonnage, adding up to Planned. A line holds plant or split, never both.
-- The suggestion itself is never stored: it is worked out from Indent, Buffer and Open each time.
create table if not exists planning_campaigns (
  id uuid primary key default gen_random_uuid(),
  region text not null,
  month text not null,
  lines jsonb not null default '{}'::jsonb,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (region, month)
);
alter table planning_campaigns enable row level security;
drop policy if exists "Allow all access" on planning_campaigns;
create policy "Allow all access" on planning_campaigns for all using (true) with check (true);

notify pgrst, 'reload schema';

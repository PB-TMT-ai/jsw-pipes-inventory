-- ═══════════════════════════════════════════════════════════════
-- JSW Pipes & Tubes Inventory — Campaign tables, keyed by (plant, month)
-- ═══════════════════════════════════════════════════════════════
-- WHY: the Campaign Planner & Monitor (phase 3, PR #96) was built on 2026-08-04
-- against a one-plant app and keyed its campaigns on `month` ALONE. Three weeks
-- later ticket #156 activated Lepakshi and Tapi for Coil Inward, Slitting and
-- Production, so four plants can now produce.
--
-- Keyed on month alone, every plant shares ONE August row. That is wrong in both
-- directions and quietly so:
--
--   * A Campaign is one MILL's commitment. Its Hour budget is that plant's
--     working days × 12 h, and its tonnage is sized on 4.32 t/h — a rate measured
--     from Hyderabad's own July output (1,400.3 MT ÷ 27 days ÷ 12 h). Lepakshi
--     has no such measurement and no reason to share the number.
--   * `campaignProgress` scores the plan against the productions handed to it.
--     One shared row means Lepakshi's and Tapi's tonnes tick off Hyderabad's
--     targets, and a month reads complete on another plant's steel.
--
-- This is the same rule the rest of the app already holds to: allocation never
-- crosses plants, and a distributor is never shown stock from a plant that does
-- not serve its region (docs/adr/0006). Planning is not the exception.
--
-- The live database already carries these four tables — the phase-3 preview
-- deploys created them on 2026-08-05 — with `unique (month)` and no `plant`
-- column, plus one August 2026 DRAFT (33 family lines, 45 gauges) left over from
-- that testing. It was never committed (status = 'draft', no Active revision).
-- Hyderabad is the only plant that has ever produced a single tube, so that row
-- is backfilled to 'hyderabad': the only attribution the data supports.
--
-- HOW TO USE:
--   1. Supabase dashboard → SQL Editor → New query
--   2. Paste this ENTIRE file → Run
--   3. Reload the app (no redeploy needed)
--
-- SAFE TO RE-RUN: every statement is `if not exists` / `if exists` guarded, and
-- the backfill only touches rows whose plant is still NULL.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. The four tables, for any environment that does not have them yet. ───────────────────────
-- Verbatim from supabase-setup.sql. On the live database all four already exist, so every
-- statement here is a no-op and step 2 does the real work.
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  plant text not null,
  month text not null,
  status text default 'draft',
  budget_h numeric,
  days_override numeric,
  day_exceptions jsonb default '[]'::jsonb,
  suggestion_source text,
  suggestion_month text,
  suggestion_volume_mt numeric,
  suggested_at timestamptz,
  notes text,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (plant, month)
);
create table if not exists campaign_revisions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  revision_no integer not null,
  committed_at timestamptz,
  reason text,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (campaign_id, revision_no)
);
create table if not exists campaign_lines (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null,
  family_key text not null,
  target_mt numeric,
  suggested_mt numeric,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (revision_id, family_key)
);
create table if not exists campaign_gauges (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null,
  sku_key text not null,
  label text,
  thickness numeric,
  target_mt numeric,
  suggested_mt numeric,
  was_suggested boolean default true,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (line_id, sku_key)
);

-- ── 2. Add `plant`, backfill it, and swap the unique key. ──────────────────────────────────────
-- Order matters: the column has to exist and be fully populated before `not null` and the new
-- unique index can be applied, and the OLD unique(month) has to go or a second plant's August
-- still collides.
alter table campaigns add column if not exists plant text;

-- Only ever touches rows left un-stamped. Hyderabad is the sole plant with production history,
-- so an existing campaign can have meant nothing else.
update campaigns set plant = 'hyderabad' where plant is null;

alter table campaigns alter column plant set not null;

alter table campaigns drop constraint if exists campaigns_month_key;
create unique index if not exists campaigns_plant_month_key on campaigns (plant, month);

-- ── 3. RLS, matching every other table in this app. ────────────────────────────────────────────
alter table campaigns enable row level security;
alter table campaign_revisions enable row level security;
alter table campaign_lines enable row level security;
alter table campaign_gauges enable row level security;
drop policy if exists "Allow all access" on campaigns;
create policy "Allow all access" on campaigns for all using (true) with check (true);
drop policy if exists "Allow all access" on campaign_revisions;
create policy "Allow all access" on campaign_revisions for all using (true) with check (true);
drop policy if exists "Allow all access" on campaign_lines;
create policy "Allow all access" on campaign_lines for all using (true) with check (true);
drop policy if exists "Allow all access" on campaign_gauges;
create policy "Allow all access" on campaign_gauges for all using (true) with check (true);

-- ── 4. Nudge PostgREST to re-read the schema. ─────────────────────────────────────────────────
notify pgrst, 'reload schema';

-- ── 5. Check what you have. All four rows must come back `yes`. ───────────────────────────────
select 'campaigns.plant column' as item,
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'campaigns'
                           and column_name = 'plant') then 'yes' else 'NO' end as present
union all
select 'campaigns.plant is not null',
       case when exists (select 1 from information_schema.columns
                         where table_schema = 'public' and table_name = 'campaigns'
                           and column_name = 'plant' and is_nullable = 'NO') then 'yes' else 'NO' end
union all
select 'unique (plant, month)',
       case when exists (select 1 from pg_indexes
                         where schemaname = 'public' and tablename = 'campaigns'
                           and indexname = 'campaigns_plant_month_key') then 'yes' else 'NO' end
union all
select 'old unique (month) gone',
       case when not exists (select 1 from pg_constraint c join pg_class t on t.oid = c.conrelid
                             where t.relname = 'campaigns' and c.conname = 'campaigns_month_key')
            then 'yes' else 'NO' end;

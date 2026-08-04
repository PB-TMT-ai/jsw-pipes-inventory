-- ═══════════════════════════════════════════════════════════════
-- JSW Pipes & Tubes Inventory — Supabase Database Setup
-- ═══════════════════════════════════════════════════════════════
-- HOW TO USE:
-- 1. Go to your Supabase dashboard
-- 2. Click "SQL Editor" in the left sidebar
-- 3. Click "New query"
-- 4. Paste this ENTIRE file and click "Run"
-- ═══════════════════════════════════════════════════════════════

-- STAGE 1: Coil Inward (Mother Coils)
create table if not exists coils (
  id uuid primary key default gen_random_uuid(),
  hr_coil_no integer,
  hr_coil_id text unique,
  date_of_inward date,
  input_coil_number text,
  coil_grade text,
  heat_number text,
  thickness numeric,
  width numeric,
  length numeric default 0,
  invoice_weight numeric,
  actual_weight numeric,
  cost_price numeric,
  po_number text,
  deleted boolean default false,
  created_at timestamptz default now()
);

-- STAGE 2: Slitting (mother coil → baby coils). RE-ENABLED — the app reads/writes this
-- again. Baby coils are slit manually (proportional weight/cost by width) and then
-- FIFO-consumed by Production on ±5% thickness. Hard-deleted so letters (A,B,C…) reuse.
create table if not exists baby_coils (
  id uuid primary key default gen_random_uuid(),
  hr_coil_id text,
  baby_coil_entry text,
  baby_coil_id text unique,
  date_of_conversion date,
  thickness numeric,
  width numeric,
  length numeric,
  weight numeric,
  cost_price numeric,
  po_number text,
  consumed boolean default false,   -- manual "fully consumed" flag; hides the coil from the Production picker
  deleted boolean default false,
  created_at timestamptz default now()
);

-- Migration for existing deployments: add the manual consumed flag if it doesn't exist yet.
alter table baby_coils add column if not exists consumed boolean default false;

-- LEGACY (process change June 2026): tube production was folded into Bundle Formation.
-- Retained-but-emptied; the app no longer reads or writes it.
create table if not exists tubes (
  id uuid primary key default gen_random_uuid(),
  baby_coil_id text,
  date_of_conversion date,
  sku_code text,
  number_of_pieces integer,
  thickness numeric,
  width numeric,
  length numeric default 6000,
  theoretical_weight numeric,
  deleted boolean default false,
  created_at timestamptz default now()
);

-- STAGE 2: Production (tube production; FIFO-consumes mother coils by ±5% thickness).
-- coil_allocations holds the FIFO split [{hrCoilId, pieces, weight}] — camelCase inside
-- the JSONB (db.js case-conversion is top-level only), same pattern as bundle_entries.
create table if not exists productions (
  id uuid primary key default gen_random_uuid(),
  production_no integer,
  date_of_production date,
  sku_code text,
  tube_count integer,
  weight_per_piece numeric,   -- tonnes/piece, snapshot of the SKU at production time
  total_weight numeric,       -- tube_count × weight_per_piece (tonnes), snapshot
  coil_allocations jsonb default '[]',
  status text,                -- 'allocated' | 'partial' | 'unallocated'
  deleted boolean default false,
  created_at timestamptz default now()
);

-- STAGE 3: Bundles (packed from the produced pool; coil split inherited from production)
create table if not exists bundles (
  id uuid primary key default gen_random_uuid(),
  bundle_no integer,
  bundle_id text,
  hr_coil_id text,          -- mother coil source (new model)
  baby_coil_id text,        -- legacy column (pre-process-change); no longer written
  sku_code text,
  date_of_entry date,
  tube_count integer,
  weight_per_piece numeric,
  total_weight numeric,
  dispatched boolean default false,
  deleted boolean default false,
  created_at timestamptz default now()
);

-- STAGE 5: Dispatches
create table if not exists dispatches (
  id uuid primary key default gen_random_uuid(),
  date_of_dispatch date,
  vehicle_no text,
  invoice_no text,
  vehicle_weight numeric,
  bundle_entries jsonb default '[]',
  theoretical_weight numeric,
  variance numeric,
  selected_bundles jsonb default '[]',
  deleted boolean default false,
  created_at timestamptz default now()
);

-- PO Master (Purchase Orders)
create table if not exists purchase_orders (
  id uuid primary key default gen_random_uuid(),
  purchase_order_date date,
  purchase_order_number text,
  vendor_name text,
  item_name text,
  quantity_ordered numeric,
  updated_qty numeric,
  item_price numeric,
  updated_price numeric,
  po_end_date date,
  deleted boolean default false,
  created_at timestamptz default now()
);

-- Customer Orders (uploaded from the ERP "Orders" Excel; drives FG Booked / Free FG / Reserved).
-- Quantity is in MT; mm_id == SKU master sku_code (join key shared with the dispatch upload).
-- Booked   = open-status ordered − dispatched (per SKU).
-- Reserved = open-status max(0, release_qty − invoiced_qty) per SKU (released but not yet invoiced).
create table if not exists orders (
  id uuid primary key default gen_random_uuid(),
  order_date date,
  order_id text,
  child_order_id text,
  line_id text,
  customer text,
  mm_id text,
  description text,
  quantity numeric,
  release_qty numeric,
  invoiced_qty numeric,
  confirmed numeric,
  non_confirmed numeric,
  distributor_code text,
  order_status text,
  expected_delivery_date date,
  deleted boolean default false,
  created_at timestamptz default now()
);
-- For databases created before the Reserved feature, add the column in place (idempotent):
alter table orders add column if not exists release_qty numeric;
-- Sales dashboard (Confirmed / Non-confirmed model) + stable distributor identity (idempotent):
alter table orders add column if not exists confirmed numeric;
alter table orders add column if not exists non_confirmed numeric;
alter table orders add column if not exists distributor_code text;
alter table orders enable row level security;
drop policy if exists "Allow all access" on orders;
create policy "Allow all access" on orders for all using (true) with check (true);

-- Distributor Monthly Estimate — the typed Best Estimate (planned invoiced MT) for one distributor
-- in one month. `distributor_key` is the app's resolved distributor identity (the ERP distributor
-- code when the sales file supplies one, otherwise the normalised distributor name), so an estimate
-- joins to the same rows the Sales dashboard groups by. `month` is 'YYYY-MM'.
--
-- The unique index on (distributor_key, month) is the upsert arbiter, NOT `id` — see
-- CONFLICT_TARGET in src/lib/db.js. Postgres resolves ON CONFLICT against one index only, so
-- re-saving an existing (distributor, month) under a fresh id would otherwise be a hard error that
-- fails the whole batch (the same trap skus.sku_code hit).
create table if not exists distributor_estimates (
  id uuid primary key default gen_random_uuid(),
  distributor_key text not null,
  distributor_name text,
  month text not null,
  best_estimate numeric,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (distributor_key, month)
);
alter table distributor_estimates enable row level security;
drop policy if exists "Allow all access" on distributor_estimates;
create policy "Allow all access" on distributor_estimates for all using (true) with check (true);

-- ═══════════════════════════════════════════════════════════════
-- CAMPAIGN — the monthly production plan and the commitment it is scored against.
--
-- One campaign per calendar month (`month` UNIQUE, 'YYYY-MM'). Its targets do not live on the
-- campaign itself: they hang off `campaign_revisions`, and revision 1 is the BASELINE — the first
-- committed version, never modified and never deleted. Pressing Revise writes revision n+1 with a
-- one-line reason; the Baseline survives so the month can still be scored against what was
-- originally promised (ADR-0003).
--
-- `budget_h` is an outright hours override (null = derive). `days_override` overrides the computed
-- working-day count. `day_exceptions` is a jsonb array of { date, reason } for maintenance,
-- holidays and shutdown. Derivation lives in campaignHourBudget (src/lib/calc.js):
--   (calendar days − Sundays − exceptions) × 12 h
--
-- Each child table carries a COMPOSITE unique index, and that index — not `id` — is the upsert
-- arbiter (see CONFLICT_TARGET in src/lib/db.js). Postgres resolves ON CONFLICT against one index
-- only, so re-saving an existing (revision, family) pair under a fresh id would otherwise be a hard
-- error that fails the whole batch — the trap distributor_estimates and skus.sku_code both hit.
-- ═══════════════════════════════════════════════════════════════
create table if not exists campaigns (
  id uuid primary key default gen_random_uuid(),
  month text not null,
  status text default 'draft',              -- draft | active | closed, every transition by hand
  budget_h numeric,                          -- explicit hours override; null = derive
  days_override numeric,                     -- working-day override; null = calendar − Sundays − exceptions
  day_exceptions jsonb default '[]'::jsonb,  -- [{ date, reason }] maintenance / holiday / shutdown
  -- Provenance of the last Initiate press. Kept on the campaign so the screen can state which
  -- demand source it used without recomputing anything on render (D4).
  suggestion_source text,                    -- 'estimate' | 'trailing'
  suggestion_month text,                     -- the trailing month the mix came from
  suggestion_volume_mt numeric,
  suggested_at timestamptz,
  notes text,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (month)
);
alter table campaigns enable row level security;
drop policy if exists "Allow all access" on campaigns;
create policy "Allow all access" on campaigns for all using (true) with check (true);

create table if not exists campaign_revisions (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null,
  revision_no integer not null,              -- 1 = the Baseline, never overwritten
  committed_at timestamptz,
  reason text,                               -- required from revision 2 onward
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (campaign_id, revision_no)
);
alter table campaign_revisions enable row level security;
drop policy if exists "Allow all access" on campaign_revisions;
create policy "Allow all access" on campaign_revisions for all using (true) with check (true);

create table if not exists campaign_lines (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null,
  family_key text not null,                  -- familyKey(sku) — "SHS 50x50", never a raw skuCode
  target_mt numeric,                         -- typed by the operator; the commitment
  suggested_mt numeric,                      -- what Initiate proposed, kept for comparison
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (revision_id, family_key)
);
alter table campaign_lines enable row level security;
drop policy if exists "Allow all access" on campaign_lines;
create policy "Allow all access" on campaign_lines for all using (true) with check (true);

create table if not exists campaign_gauges (
  id uuid primary key default gen_random_uuid(),
  line_id uuid not null,
  sku_key text not null,                     -- canonicalSkuKey — decimal-formatting twins collapse
  target_mt numeric,
  suggested_mt numeric,
  was_suggested boolean default true,        -- false once the operator types over the suggestion
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (line_id, sku_key)
);
alter table campaign_gauges enable row level security;
drop policy if exists "Allow all access" on campaign_gauges;
create policy "Allow all access" on campaign_gauges for all using (true) with check (true);

-- SKU Master
create table if not exists skus (
  id text primary key,
  product_type text,
  sku_code text unique,
  description text,
  height numeric,
  breadth numeric,
  thickness numeric,
  length numeric default 6000,
  nominal_bore text default '',
  outside_diameter text default '',
  hsn_code text,
  status text default 'published',
  weight_per_tube numeric,
  base_conversion numeric default 2900,
  thickness_extra numeric default 0,
  ladder_price numeric,
  total_conversion numeric,
  created_at timestamptz default now()
);

-- Migration for existing deployments: add new cost columns if they don't exist yet
alter table skus add column if not exists weight_per_tube numeric;
alter table skus add column if not exists base_conversion numeric default 2900;
alter table skus add column if not exists thickness_extra numeric default 0;
alter table skus add column if not exists ladder_price numeric;
alter table skus add column if not exists total_conversion numeric;

-- Process-change migration (June 2026): bundles now reference the mother coil directly.
alter table bundles add column if not exists hr_coil_id text;

-- Process-change migration (June 2026 — Production stage + FIFO coil attribution):
-- bundles inherit a (possibly multi-coil) split from production FIFO.
alter table bundles add column if not exists coil_allocations jsonb default '[]';

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — Open access (no login required for now)
-- ═══════════════════════════════════════════════════════════════
alter table coils enable row level security;
alter table productions enable row level security;
alter table baby_coils enable row level security;
alter table tubes enable row level security;
alter table bundles enable row level security;
alter table dispatches enable row level security;
alter table skus enable row level security;
alter table purchase_orders enable row level security;

drop policy if exists "Allow all access" on coils;
drop policy if exists "Allow all access" on productions;
drop policy if exists "Allow all access" on baby_coils;
drop policy if exists "Allow all access" on tubes;
drop policy if exists "Allow all access" on bundles;
drop policy if exists "Allow all access" on dispatches;
drop policy if exists "Allow all access" on skus;
drop policy if exists "Allow all access" on purchase_orders;

create policy "Allow all access" on coils for all using (true) with check (true);
create policy "Allow all access" on productions for all using (true) with check (true);
create policy "Allow all access" on baby_coils for all using (true) with check (true);
create policy "Allow all access" on tubes for all using (true) with check (true);
create policy "Allow all access" on bundles for all using (true) with check (true);
create policy "Allow all access" on dispatches for all using (true) with check (true);
create policy "Allow all access" on skus for all using (true) with check (true);
create policy "Allow all access" on purchase_orders for all using (true) with check (true);

-- ═══════════════════════════════════════════════════════════════
-- APP LOGIN GATE — one shared login id + password (added July 2026)
-- The credential lives HERE, never in the app bundle. The browser can only call
-- verify_login() to get a yes/no; it can never read the password hash. This
-- guards the app UI. (The data tables above stay open to the anon key — locking
-- those down too would need Supabase Auth + rewritten policies, a bigger change.)
-- To change the login id / password, see blueprints/manage-app-login.md.
-- ═══════════════════════════════════════════════════════════════
create extension if not exists pgcrypto with schema extensions;

create table if not exists app_credentials (
  id uuid primary key default gen_random_uuid(),
  login_id text unique not null,
  password_hash text not null,
  updated_at timestamptz not null default now()
);

-- RLS on + NO policy, and privileges revoked from the API roles => the anon and
-- authenticated keys can neither read nor write the hashes. Only postgres /
-- service_role (the dashboard and this script) can.
alter table app_credentials enable row level security;
revoke all on table app_credentials from anon, authenticated;

-- Password check. SECURITY DEFINER lets it read app_credentials on the caller's
-- behalf and return only a boolean. bcrypt via pgcrypto's crypt() / gen_salt().
create or replace function verify_login(p_login_id text, p_password text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select exists (
    select 1
    from app_credentials
    where login_id = p_login_id
      and password_hash = extensions.crypt(p_password, password_hash)
  );
$$;

revoke all on function verify_login(text, text) from public;
grant execute on function verify_login(text, text) to anon, authenticated;

-- Seed / reset the shared login. Kept commented so no real password is stored in
-- git — run this once in the Supabase SQL editor with your own password:
--
--   insert into app_credentials (login_id, password_hash)
--   values ('admin', extensions.crypt('CHOOSE_A_PASSWORD', extensions.gen_salt('bf')))
--   on conflict (login_id) do update
--     set password_hash = excluded.password_hash, updated_at = now();

-- ═══════════════════════════════════════════════════════════════
-- SEED DATA — 8 Default SKUs
-- ═══════════════════════════════════════════════════════════════
insert into skus (id, product_type, sku_code, description, height, breadth, thickness, length, nominal_bore, outside_diameter, hsn_code, status) values
  ('SKU-001', 'SHS', 'SHS-25x25x2.50', 'MS SHS One Helix IS 4923 YSt 210 Black 25x25x2.50x6000', 25, 25, 2.5, 6000, '', '', '7306', 'published'),
  ('SKU-002', 'SHS', 'SHS-38x38x2.80', 'MS SHS One Helix IS 4923 YSt 210 Black 38x38x2.80x6000', 38, 38, 2.8, 6000, '', '', '7306', 'published'),
  ('SKU-003', 'SHS', 'SHS-38x38x2.50', 'MS SHS One Helix IS 4923 YSt 210 Black 38x38x2.50x6000', 38, 38, 2.5, 6000, '', '', '7306', 'published'),
  ('SKU-004', 'SHS', 'SHS-38x38x2.20', 'MS SHS One Helix IS 4923 YSt 210 Black 38x38x2.20x6000', 38, 38, 2.2, 6000, '', '', '7306', 'published'),
  ('SKU-005', 'SHS', 'SHS-50x50x2.80', 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.80x6000', 50, 50, 2.8, 6000, '', '', '7306', 'published'),
  ('SKU-006', 'SHS', 'SHS-50x50x2.50', 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.50x6000', 50, 50, 2.5, 6000, '', '', '7306', 'published'),
  ('SKU-007', 'SHS', 'SHS-50x50x2.20', 'MS SHS One Helix IS 4923 YSt 210 Black 50x50x2.20x6000', 50, 50, 2.2, 6000, '', '', '7306', 'published'),
  ('SKU-008', 'SHS', 'SHS-20x20x2.00', 'MS SHS One Helix IS 4923 YSt 210 Black 20x20x2.00x6000', 20, 20, 2.0, 6000, '', '', '7306', 'published')
on conflict (id) do nothing;

-- ═══════════════════════════════════════════════════════════════
-- ONE-TIME WIPE (legacy tubes only)
-- The tube stage stays removed; the slitting stage / baby_coils were RE-ENABLED.
-- Do NOT delete from baby_coils — it is back in active use (Slitting → Production FIFO).
-- Run ONCE in the Supabase SQL editor if abandoned tube rows linger (safe to re-run).
-- ═══════════════════════════════════════════════════════════════
delete from tubes;

-- ═══════════════════════════════════════════════════════════════
-- DONE! Your database is ready.
-- ═══════════════════════════════════════════════════════════════

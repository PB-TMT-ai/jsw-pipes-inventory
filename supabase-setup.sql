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

-- LEGACY (process change June 2026): the slit→tube stages were removed. This table
-- is retained-but-emptied only so historical rows can be inspected; the app no longer
-- reads or writes it. See the one-time wipe at the bottom of this file.
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
  deleted boolean default false,
  created_at timestamptz default now()
);

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
-- ONE-TIME PROCESS-CHANGE WIPE (June 2026)
-- The slit→tube stages were removed. Run these ONCE in the Supabase SQL editor
-- to clear the abandoned slit/tube data. coils, bundles, dispatches & skus are
-- preserved. (No-op if the tables are already empty; safe to re-run.)
-- ═══════════════════════════════════════════════════════════════
delete from tubes;
delete from baby_coils;

-- ═══════════════════════════════════════════════════════════════
-- DONE! Your database is ready.
-- ═══════════════════════════════════════════════════════════════

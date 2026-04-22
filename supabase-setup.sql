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

-- STAGE 2: Baby Coils (Slitting)
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

-- STAGE 3: Tubes
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

-- STAGE 4: Bundles
create table if not exists bundles (
  id uuid primary key default gen_random_uuid(),
  bundle_no integer,
  bundle_id text,
  baby_coil_id text,
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

-- PO Master (monthly Zoho Books upload)
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
create index if not exists purchase_orders_po_number_idx on purchase_orders (purchase_order_number);
create index if not exists purchase_orders_po_item_idx on purchase_orders (purchase_order_number, item_name);

-- ═══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY — Open access (no login required for now)
-- ═══════════════════════════════════════════════════════════════
alter table coils enable row level security;
alter table baby_coils enable row level security;
alter table tubes enable row level security;
alter table bundles enable row level security;
alter table dispatches enable row level security;
alter table skus enable row level security;
alter table purchase_orders enable row level security;

create policy "Allow all access" on coils for all using (true) with check (true);
create policy "Allow all access" on baby_coils for all using (true) with check (true);
create policy "Allow all access" on tubes for all using (true) with check (true);
create policy "Allow all access" on bundles for all using (true) with check (true);
create policy "Allow all access" on dispatches for all using (true) with check (true);
create policy "Allow all access" on skus for all using (true) with check (true);
create policy "Allow all access" on purchase_orders for all using (true) with check (true);

-- ═══════════════════════════════════════════════════════════════
-- DONE! Your database is ready.
-- All tables start empty — add data via the app UI.
-- ═══════════════════════════════════════════════════════════════

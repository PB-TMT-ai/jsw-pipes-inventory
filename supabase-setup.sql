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
  plant text,
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
  plant text,
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
  plant text,                 -- inherited from the baby coils consumed (ticket #120)
  production_po_no text,      -- PO issued to the CONTRACT MANUFACTURER for these pipes (see below)
  deleted boolean default false,
  created_at timestamptz default now()
);

-- ── Plant on the pipeline (ticket #120) ────────────────────────────────────────────────────────
-- Orders and invoices get their plant from the ERP's "Ship From Code". Pipeline rows cannot — the
-- ERP has no view of the shop floor — so plant is set ONCE by an operator at Coil Inward and
-- inherited from there: a baby coil takes its mother's, a production batch takes the plant of the
-- baby coils it consumes. Stored as the plant id ('hyderabad' | 'npmd' | …), never a label; the
-- master itself is a code constant (src/data/plants.js), not a table.
--
-- ADD AND BACKFILL TOGETHER, ONCE. Unlike orders and dispatches, pipeline rows are NOT replace-all
-- on upload — nothing rewrites them, so the history needs an explicit statement. But `update … set
-- plant = 'hyderabad' where plant is null` must NOT be left standing on its own: the app stores a
-- blank plant as SQL NULL (toSnake turns '' into null), so a row the app deliberately left
-- Unattributed — a cross-plant production, a baby coil whose mother is gone — is indistinguishable
-- from un-backfilled history. Re-running the file would stamp it 'hyderabad', which is exactly the
-- guess every other line of this feature refuses to make.
--
-- So each backfill is gated on its column not existing yet. It runs at the moment the column is
-- introduced, when NULL can only mean "predates the plant dimension", and never again. Re-running
-- this file is a no-op. IDs, weights, costs and coil_allocations are untouched — a coil id is
-- printed on a physical tag and embedded inside stored production allocations.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'coils' and column_name = 'plant') then
    alter table coils add column plant text;
    update coils set plant = 'hyderabad';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'baby_coils' and column_name = 'plant') then
    alter table baby_coils add column plant text;
    update baby_coils set plant = 'hyderabad';
  end if;

  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'productions' and column_name = 'plant') then
    alter table productions add column plant text;
    update productions set plant = 'hyderabad';
  end if;
end $$;

-- ── Production PO No. ──────────────────────────────────────────────────────────────────────────
-- The PO **we issue to the contract manufacturer** to make finished pipes. This is the THIRD PO in
-- the schema and is unrelated to the other two:
--   coils.po_number         the PO we BUY HR coil under        (inherited mother → baby)
--   orders.child_order_id   the CUSTOMER's PO for the tubes    (One Helix "PurchaseOrder")
--   productions.production_po_no   ← this one
-- A stamp: nothing is computed from it. No stock is reserved against it, and no constraint ties it
-- to `plant`, because nothing in the app records which contract manufacturer a PO was issued to.
--
-- Deliberately NO backfill. The field is mandatory on the app's CREATE path only, so the batches
-- recorded before it existed keep a blank PO and stay editable. A later `where … is null` update
-- would re-stamp rows the app left blank on purpose — hence the gate on the column, not the data.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'productions' and column_name = 'production_po_no') then
    alter table productions add column production_po_no text;
  end if;
end $$;

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
-- NOTE (ticket #119): an invoice line's plant is deliberately NOT a column here. `dispatches` is one
-- row per invoice, not per line, so per-line facts live inside `bundle_entries` — `plant` sits
-- beside the per-entry `shipToState` key already there (also NOT a column), for the same reason. A
-- stray top-level key on a dispatch record makes Supabase reject the whole upsert. No DDL here.

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
  ship_to_state text,
  plant text,
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
-- Region/state reporting — the Orders sheet's "Ship to State", UPPER-CASE (idempotent). Invoice
-- lines keep their state inside dispatches.bundle_entries (no column there). Both stores are
-- replace-all on upload, so one Sales Excel upload backfills every historical row.
alter table orders add column if not exists ship_to_state text;
-- Plant attribution (ticket #118) — the plant id resolved from the ERP's "Ship From Code"
-- ('hyderabad' | 'npmd' | 'lepakshi' | 'tapi'), NULL when the code matched no plant, which the app
-- displays as `Unattributed`. The plant master itself is a code constant (src/data/plants.js), not
-- a table: four rows, all of them the ERP's own identifiers, nothing for an operator to type.
-- Orders are replace-all on upload, so one Sales Excel upload backfills every row.
alter table orders add column if not exists plant text;
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

-- State → Region master. Region is a business concept the ERP never exports; state arrives with the
-- data (orders.ship_to_state / the per-entry shipToState in dispatches.bundle_entries). So the master
-- is keyed by STATE, not by distributor: map a state once and every distributor shipping there
-- inherits the region, and no state is ever hand-typed.
--
-- `state` is UPPER-CASE, matching resolveShipToState's storage on both order and invoice lines, and
-- is the UNIQUE upsert arbiter (see CONFLICT_TARGET in src/lib/db.js) — one row per state, so
-- re-mapping a state must UPDATE that row instead of colliding.
--
-- The table starts EMPTY: the six shipped mappings live in src/data/stateRegions.js and are layered
-- under whatever this table holds (stateRegionIndex in calc.js), so editing one state cannot make
-- the other seeded states read as Unmapped. An un-mapping is an explicit blank `region` (which
-- `toSnake` stores as NULL) rather than a soft delete, so it overrides the seed instead of letting
-- the seeded value spring back. Hence `region` is nullable while `state` is not.
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

-- ── PLANT MASTER (ticket #129) ────────────────────────────────────────────────────────────────
-- The SERVICE AREA of each plant: which regions it will actually ship to. Everything else about a
-- plant (its ERP Ship From Code, its ERP name strings, its coil prefix, whether it manufactures)
-- comes from the ERP and stays a read-only code constant in src/data/plants.js — there is nothing
-- for an operator to type in any of them, so there is nothing to store.
--
-- `plant_id` is the plant's fixed literal id ('hyderabad', 'npmd', …) — the same value the pipeline
-- and order rows carry in their own `plant` column — and is the UNIQUE upsert arbiter, so re-saving
-- a plant's service area UPDATES its row rather than colliding.
--
-- `serves` is a Postgres text[] of region names ('{South}'). It is NOT nullable-means-blank the way
-- state_regions.region is: an EMPTY array is a real answer ("this plant serves nowhere, so its
-- stock appears on no distributor's row") and NULL reads the same, because a plant that serves
-- nowhere and a plant whose service area was cleared are the same fact. What restores the shipped
-- default is deleting the row, not blanking it.
--
-- The table starts EMPTY: the shipped service areas live in src/data/plants.js and are layered
-- under whatever this table holds (plantMaster in calc.js), so editing one plant cannot silently
-- un-serve the other three.
create table if not exists plants (
  id uuid primary key default gen_random_uuid(),
  plant_id text not null,
  serves text[],
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (plant_id)
);
alter table plants enable row level security;
drop policy if exists "Allow all access" on plants;
create policy "Allow all access" on plants for all using (true) with check (true);

-- ── DISTRIBUTOR MASTER (ticket #129) ──────────────────────────────────────────────────────────
-- A REGION OVERRIDE per distributor, and nothing else. Region normally comes from the
-- distributor's ship-to state through state_regions; this table is for the exception that rule
-- cannot express — a distributor whose state says one region but who is genuinely served as
-- another. Name, state, orders and invoices all arrive with the ERP data and are never stored here.
--
-- `distributor_key` is the resolved distributor identity (resolveDistributorIdentity in calc.js) —
-- the same key distributor_estimates uses — and is the UNIQUE upsert arbiter.
-- `distributor_name` is a label so the Masters tab can show a readable row; it is never joined on.
--
-- A BLANK `region` (stored NULL by toSnake) means "use the state's region". It is not a region and
-- not Unmapped: blank is the ordinary state, which is why clearing an override writes '' instead of
-- deleting the row — the two mean the same thing and both must read as "fall through to the state".
create table if not exists distributors (
  id uuid primary key default gen_random_uuid(),
  distributor_key text not null,
  distributor_name text,
  region text,
  deleted boolean default false,
  created_at timestamptz default now(),
  unique (distributor_key)
);
alter table distributors enable row level security;
drop policy if exists "Allow all access" on distributors;
create policy "Allow all access" on distributors for all using (true) with check (true);
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
  label text,                                -- "2.60 mm" — the wall thickness, for display
  thickness numeric,                         -- ordering, so the split reads thin-to-thick
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
-- APP LOGIN GATE — a login id + password, each carrying a plant and a role
-- (one shared login from July 2026; plant + role from ticket #125, below)
-- The credential lives HERE, never in the app bundle. The browser can only call
-- verify_login() to get a yes/no; it can never read the password hash. This
-- guards the app UI. (The data tables above stay open to the anon key — locking
-- those down too would need Supabase Auth + rewritten policies, a bigger change.)
-- To add a login, or change a login id / password, see blueprints/manage-app-login.md.
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

-- ── Plant + role on the login (ticket #125) ────────────────────────────────────────────────────
-- The login stops being a yes/no and starts saying WHO signed in: which plant they belong to and
-- whether they are an admin. Three logins are intended — `admin` (all plants), `hyderabad`, `npmd`.
-- Lepakshi and Tapi get none. Ticket #156 put both of them on the pipeline, so that is no longer
-- because they only carry orders — their logins were simply deferred, and until someone there asks
-- an admin enters for them. Nothing in this file changes when a plant is activated: `manufactures`
-- and the Coil Inward rollout list are both code constants, not columns.
--
-- THIS IS UI TIDINESS, NOT CONFIDENTIALITY. Every data table above keeps its permissive
-- `using (true)` policy and the app's public key still reaches all of it. A plant login keeps the
-- wrong plant's coil off an operator's screen; it does not make a plant's data private, and nobody
-- may describe it that way. Real enforcement is the Supabase Auth upgrade path, out of scope here.
--
-- EVERYTHING HERE IS ADDITIVE, on purpose. `verify_login` above is left exactly as it is and a
-- SECOND function is added beside it, so running this file against the database serving the CURRENT
-- build breaks nothing: the old build keeps calling the boolean function until the new one ships.
-- There is no window in which the live app cannot sign anyone in.
--
--   plant  the plant id ('hyderabad' | 'npmd' | …) from src/data/plants.js, never a label.
--          NULL = every plant, which is what the admin carries.
--   role   'admin' (all plants, the whole app) or 'plant' (one plant's own screens).
--
-- The backfill is gated on the column not existing yet — the same rule the pipeline plant columns
-- follow. It runs once, at the moment the column is introduced; re-running the file is a no-op and
-- can never re-stamp a login somebody has since set to 'plant'. No password is touched, so the
-- existing admin keeps working — it is not recreated and nobody is locked out.
--
-- It stamps EVERY pre-existing row 'admin', with no `where`, and that is a description rather than
-- a promotion: before this ticket the app had no roles, so every credential that existed could
-- already do everything in it. `role = 'admin'` says exactly what such a login already was. If a
-- database carries more than the one shared login — the old blueprint did invite extra rows — the
-- extras become admins because they already were, and demoting one to a plant login is the
-- `update … set role = 'plant', plant = '…'` in blueprints/manage-app-login.md. Guessing which of
-- them belongs to which plant is not something this file can do.
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

-- The second verification function. Same shape of promise as verify_login: the password goes in as
-- a parameter, and the hash never comes out — the result carries only the login id, plant and role.
-- A wrong password returns NO ROWS rather than a row with the fields blanked, so the caller cannot
-- confuse "who signed in" with "nobody did".
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

-- Adding the plant logins (`hyderabad`, `npmd`) is a HUMAN step run once in the Supabase SQL editor
-- with passwords the human chooses — no password is stored in this repository, and none is chosen or
-- handled by an agent. The exact SQL lives in blueprints/manage-app-login.md.

-- Seed / reset the admin login. Kept commented so no real password is stored in
-- git — run this once in the Supabase SQL editor with your own password. `role` is
-- NOT NULL with no default (see #125 below), so it is stated here explicitly; `plant`
-- is null, which is what "all plants" looks like on a credential:
--
--   insert into app_credentials (login_id, password_hash, plant, role)
--   values ('admin', extensions.crypt('CHOOSE_A_PASSWORD', extensions.gen_salt('bf')), null, 'admin')
--   on conflict (login_id) do update
--     set password_hash = excluded.password_hash,
--         plant = excluded.plant, role = excluded.role, updated_at = now();
--
-- The plant logins (`hyderabad`, `npmd`) are added the same way — SQL in the blueprint.

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

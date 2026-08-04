# P&T OS — Local Stack: Schema, Sync Jobs, Cron

*How the OS actually runs on a local machine + Supabase + OKF memory. Derived from `synthesis.md` and the four briefs. Drafted 2026-08-01.*

**Assumption stated up front:** "OKF memory" is read here as the **agent/knowledge memory layer** — glossary, rules, thresholds, decisions, and the narrative *why* behind past exceptions. Not a numeric store. If OKF means a specific product, the OKF section changes; nothing else does.

---

## 0. The governing rule

**Every table has exactly one writer.** Two-way sync on a shared table produces conflicts nobody can adjudicate, so the architecture forbids it structurally rather than by convention.

| Store | Owns truth for | Written by | Read by |
|---|---|---|---|
| **Supabase** | Shared transactional records: estimates, orders, dispatch, masters | ERP sync + human apps + (publish/flag only) the local engine | Everyone |
| **Local DB** | *Nothing.* Mirror + compute sandbox | Sync-down job + engine | Engine only |
| **OKF memory** | Meaning: definitions, rules, thresholds, decisions, exception rationale | Humans + writeback job | Engine + humans |

Consequence: the local machine is disposable. Lose it and you lose an afternoon of compute, not data.

---

## 1. Supabase schema (cloud — shared system of record)

Four schemas by **writer**, not by subject. This is what makes the one-writer rule enforceable with grants.

```
master.*   ← ERP sync only        (reference data)
txn.*      ← ERP sync only        (what happened)
capture.*  ← humans / apps only   (what ERP cannot see)
publish.*  ← local engine only    (what the OS decided)
flag.*     ← local engine only    (+ human notes/status)
audit.*    ← jobs only
```

### 1.1 `master` — reference data, ERP-owned

```sql
create table master.sku_family (
  family_id      text primary key,          -- 'SQ-100100', 'RD-050NB'
  shape          text not null,             -- Round|Square|Rectangular|Oval|Profile
  size_code      text not null,             -- '100x100' | '050NB'
  size_label     text not null,
  standard       text not null,             -- IS 1239-1 | IS 4923 | IS 3589 | IS 3601
  demand_class   text,                      -- runner|repeater|stranger  (set by engine, see §5)
  active         boolean not null default true
);

create table master.sku (
  sku_id            text primary key,       -- SQ-100100-W40-Y310-GP-060-4923
  family_id         text not null references master.sku_family,
  wall_mm           numeric(4,2),
  thickness_class   text,                   -- A|B|C for IS 1239
  grade             text,                   -- YSt210|YSt240|YSt310|Fe410...
  finish            text not null,          -- BLACK|GI|GP
  coating_gsm       numeric(6,1),
  length_mm         integer not null,
  standard          text not null,
  bis_license_id    text,                   -- QCO compliance, not decoration
  weight_per_m_kg   numeric(8,4) not null,  -- the tonne↔piece converter
  pieces_per_bundle integer not null,
  active            boolean not null default true
);
```

> The `weight_per_m_kg` / `pieces_per_bundle` pair is the most-called function in the business (trade quotes pieces, mills plan tonnes). Make it master data with an effective date, never a hardcoded constant.

```sql
create table master.distributor (
  distributor_id    text primary key,
  name              text not null,
  region_id         text not null references master.region,
  asm_user_id       uuid references auth.users,   -- the named owner for D1/D11/D12
  credit_limit      numeric(14,2),
  credit_terms_days integer,
  onboarded_on      date,
  active            boolean not null default true
);

create table master.mill (
  mill_id             text primary key,
  plant_id            text not null references master.plant,
  min_campaign_tonnes numeric(8,2) not null,
  strip_width_min_mm  numeric(6,1),
  strip_width_max_mm  numeric(6,1),
  tph_nominal         numeric(6,2)
);

create table master.mill_changeover (   -- the constraint that makes campaigns necessary
  mill_id      text references master.mill,
  from_group   text, to_group text,      -- strip-width group
  minutes      integer not null,
  primary key (mill_id, from_group, to_group)
);

create table master.price_circular (
  circular_id  text primary key,
  effective_at timestamptz not null,     -- timestamp, not date — intra-month re-pricing is normal
  superseded_at timestamptz,
  doc_url      text
);
create table master.price_line (
  circular_id  text references master.price_circular,
  family_id    text references master.sku_family,
  base_rate_per_t numeric(10,2) not null,
  extras       jsonb not null default '{}',  -- grade premium, finish, length, end-finish
  primary key (circular_id, family_id)
);
```

### 1.2 `capture` — the load-bearing part (what ERP cannot see)

```sql
create table capture.estimate_cycle (
  cycle_id      bigserial primary key,
  plan_month    date not null unique,        -- first of month
  opens_at      timestamptz not null,        -- D22 08:00
  cutoff_at     timestamptz not null,        -- D27 23:59
  status        text not null default 'open' check (status in ('open','locked')),
  locked_at     timestamptz,
  row_count     integer,
  snapshot_hash text
);

-- MUTABLE until cutoff. Distributors edit freely here.
create table capture.estimate_draft (
  cycle_id      bigint references capture.estimate_cycle,
  distributor_id text references master.distributor,
  family_id     text references master.sku_family,
  qty_mt        numeric(10,3) not null check (qty_mt >= 0),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users,
  primary key (cycle_id, distributor_id, family_id)
);

-- IMMUTABLE. Append-only. The single most load-bearing decision in the model.
create table capture.estimate_locked (
  cycle_id      bigint references capture.estimate_cycle,
  distributor_id text not null,
  family_id     text not null,
  qty_mt        numeric(10,3) not null,
  imputed       boolean not null default false,   -- non-filer carry-forward (see open Q2)
  locked_at     timestamptz not null,
  primary key (cycle_id, distributor_id, family_id)
);
```

Immutability is enforced, not requested:

```sql
create function capture.deny_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'estimate_locked is append-only (cycle %, distributor %)',
    old.cycle_id, old.distributor_id;
end $$;

create trigger estimate_locked_immutable
  before update or delete on capture.estimate_locked
  for each row execute function capture.deny_mutation();

revoke update, delete on capture.estimate_locked from public, authenticated, service_role;
```

```sql
create table capture.secondary_sale (      -- the chronic blind spot; schemes buy this data
  id bigserial primary key,
  distributor_id text not null references master.distributor,
  family_id      text not null references master.sku_family,
  sold_on        date not null,
  qty_mt         numeric(10,3) not null,
  dealer_ref     text,
  source         text not null check (source in ('dms','field_app','manual','declared')),
  captured_at    timestamptz not null default now()
);

create table capture.distributor_stock (
  distributor_id text not null,
  family_id      text not null,
  as_of_date     date not null,
  closing_qty_mt numeric(10,3) not null,
  source         text not null check (source in ('declared','computed','audited')),
  primary key (distributor_id, family_id, as_of_date)
);

create table capture.grn (                 -- distributor receipt, closes the D8 loop
  dispatch_id    text primary key references txn.dispatch,
  received_on    date not null,
  qty_mt         numeric(10,3) not null,
  damage_qty_mt  numeric(10,3) not null default 0,
  remarks        text
);
```

### 1.3 `txn` — mirrored from ERP, one-way

`txn.order`, `txn.invoice` (primary sales), `txn.dispatch`, `txn.production_log`, `txn.ar_open`.

Two fields carry disproportionate weight:

```sql
create table txn.production_log (
  mill_id           text not null references master.mill,
  shift_date        date not null,
  shift_no          smallint not null,
  sku_id            text not null references master.sku,
  campaign_id       bigint,                 -- FK to publish.campaign — null means UNPLANNED run
  tonnes_prime      numeric(10,3) not null,
  tonnes_scrap      numeric(10,3) not null default 0,
  tonnes_downgrade  numeric(10,3) not null default 0,
  interruption_flag boolean not null default false,
  reason_code       text,                   -- D4 is uncomputable without this
  primary key (mill_id, shift_date, shift_no, sku_id)
);
```

Without `campaign_id` and `reason_code` on the shift log, D4 (campaign adherence) cannot be computed at all. That's the single integration point to fight for with the plant.

### 1.4 `publish` — engine output, read-only to humans

```sql
create table publish.plan_run (            -- the provenance spine; everything hangs off this
  run_id         bigserial primary key,
  plan_month     date not null,
  run_type       text not null check (run_type in ('forecast','supply','campaign','allocation','deviation')),
  engine_version text not null,
  inputs_hash    text not null,            -- reproducibility: same inputs ⇒ same hash
  started_at     timestamptz not null,
  completed_at   timestamptz,
  status         text not null default 'running' check (status in ('running','ok','failed')),
  approved_by    uuid references auth.users,
  approved_at    timestamptz
);
```

Plans are **never updated** — a re-run creates a new `run_id`. "Current" is a view:

```sql
create view publish.current_campaign as
select c.* from publish.campaign c
join publish.plan_run r using (run_id)
where r.status='ok' and r.approved_at is not null
  and r.run_id = (select max(run_id) from publish.plan_run
                   where plan_month=r.plan_month and run_type='campaign'
                     and status='ok' and approved_at is not null);
```

This makes the push job idempotent for free, and gives you "what did we tell the distributor on 3 June?" for nothing.

```sql
create table publish.demand_plan (
  run_id bigint references publish.plan_run,
  plan_month date, family_id text, region_id text,
  baseline_mt numeric(12,3),        -- statistical
  estimate_mt numeric(12,3),        -- raw distributor sum
  bias_adj_mt numeric(12,3),        -- after per-distributor bias correction
  consensus_mt numeric(12,3),       -- post-S&OP, the committed number
  fva_score   numeric(6,2),         -- vs naive; negative = this step made it worse
  primary key (run_id, plan_month, family_id, region_id)
);

create table publish.campaign (
  campaign_id  bigserial primary key,
  run_id       bigint references publish.plan_run,
  mill_id      text references master.mill,
  strip_group  text not null,
  planned_start date not null, planned_end date not null,
  planned_tonnes numeric(10,3) not null,
  order_cutoff_at timestamptz not null,
  status       text not null check (status in ('open','closed','running','complete'))
);
create table publish.campaign_sku (
  campaign_id bigint references publish.campaign,
  sku_id text references master.sku,
  sequence_no smallint not null,      -- thickness ladder position
  planned_tonnes numeric(10,3) not null,
  primary key (campaign_id, sku_id)
);

create table publish.allocation (
  run_id bigint references publish.plan_run,
  distributor_id text, family_id text, plan_month date,
  requested_mt numeric(10,3),
  entitled_mt  numeric(10,3),          -- fair share on TRAILING OFFTAKE, not on estimate
  allocated_mt numeric(10,3),
  rule_applied text not null,          -- rule_id from OKF
  override_by  uuid references auth.users,
  override_reason text,                -- the override log IS a deviation report on sales
  primary key (run_id, distributor_id, family_id, plan_month)
);
```

**The rolling program** — the distributor-facing artifact, a view, not a table:

```sql
create view publish.rolling_program as
select c.mill_id, cs.sku_id, s.family_id,
       date_trunc('week', c.planned_start)::date as week,
       c.planned_tonnes, c.order_cutoff_at, c.status
from publish.current_campaign c
join publish.campaign_sku cs using (campaign_id)
join master.sku s on s.sku_id = cs.sku_id;
```

### 1.5 `flag` — the deviation engine's output

One generic shape for all sixteen. Every deviation is `(left, right, rule) → rag`.

```sql
create table flag.deviation (
  flag_id      bigserial primary key,
  code         text not null,               -- D1..D16
  run_id       bigint references publish.plan_run,
  subject_type text not null,                -- distributor|mill|campaign|sku|lane
  subject_id   text not null,
  period_start date not null, period_end date not null,
  rag          text not null check (rag in ('GREEN','AMBER','RED','UNRATED')),
  measured     numeric(14,4),
  threshold    numeric(14,4),
  rule_id      text not null,                -- → OKF rule file
  rule_version text not null,                -- why the threshold was what it was, then
  owner_user_id uuid references auth.users,  -- NOT NULL for amber/red — no orphan alerts
  due_at       timestamptz,
  status       text not null default 'open'
               check (status in ('open','ack','closed','expired')),
  opened_at    timestamptz not null default now(),
  closed_at    timestamptz, closed_reason text,
  unique (code, subject_type, subject_id, period_start)   -- dedupe: no alert floods
);

create table flag.deviation_evidence (      -- the "two clicks to detail" requirement
  flag_id bigint primary key references flag.deviation,
  left_label text, left_value numeric(14,4),
  right_label text, right_value numeric(14,4),
  detail jsonb,                              -- the row-level breakdown
  drilldown_sql text
);

create table flag.deviation_note (          -- the human "why" — feeds back to OKF
  id bigserial primary key,
  flag_id bigint references flag.deviation,
  author uuid references auth.users,
  note text not null,
  created_at timestamptz not null default now()
);
```

`unique (code, subject, period)` is the anti-alert-fatigue mechanism at the schema level: a re-scan updates the existing flag rather than creating a duplicate.

### 1.6 RLS — three roles

```sql
alter table capture.estimate_draft enable row level security;

create policy distributor_own on capture.estimate_draft
  for all to authenticated
  using  (distributor_id = auth.jwt()->>'distributor_id')
  with check (distributor_id = auth.jwt()->>'distributor_id'
              and exists (select 1 from capture.estimate_cycle c
                          where c.cycle_id = estimate_draft.cycle_id
                            and c.status = 'open' and now() < c.cutoff_at));
```

That `with check` clause is the cutoff enforced in the database — not in the app, where it can be bypassed.

| Role | Sees |
|---|---|
| `distributor` | own rows in capture/publish/flag; all of `publish.rolling_program` |
| `asm` / `rsm` | all distributors in their region |
| `planner` / `exec` | everything |

---

## 2. Local DB schema (Postgres — mirror + compute)

```
mirror.*  exact copies of Supabase, pulled nightly + full history beyond cloud retention
ref.*     OKF rules compiled into joinable tables  (see §3)
feat.*    derived features the engine needs repeatedly
scn.*     scenarios — NEVER pushed
out.*     staging for what will be pushed up
```

The `feat` layer is where the domain lives:

```sql
create table feat.offtake_trailing (      -- the anti-gaming denominator
  distributor_id text, family_id text, as_of_month date,
  trailing_3m_mt numeric(12,3),
  trailing_12m_mt numeric(12,3),
  primary key (distributor_id, family_id, as_of_month)
);

create table feat.circular_event (        -- so the engine doesn't misread price noise as demand
  circular_id text primary key,
  effective_at timestamptz,
  direction text check (direction in ('up','down','flat')),
  magnitude_pct numeric(5,2),
  families_affected text[]
);

create table feat.seasonality_index (     -- monsoon trough, Q4 peak, GI agri cycle
  family_id text, month_of_year smallint, region_id text,
  index_value numeric(5,3),               -- 1.000 = average
  primary key (family_id, month_of_year, region_id)
);
```

`feat.circular_event` is what stops D11 from screaming "channel stuffing" every time a price hike triggers legitimate pre-buying.

---

## 3. OKF memory — and how it becomes executable

File-backed, git-versioned, with machine-readable frontmatter. The point is that **thresholds live here, not in code** — so changing a rule is a documented knowledge change with an author and a date.

```
okf/
  glossary/     estimate.md  order.md  indent.md  campaign.md  ...   (= CONTEXT.md, split)
  rules/        d1-estimate-reliability.md  d12-stock-days.md  allocation-fair-share.md
  decisions/    adr-001-estimates-immutable.md  adr-002-one-writer-per-table.md
  events/       2026-05-price-circular.md  2026-06-mill2-shutdown.md
  exceptions/   2026-06-verma-tubes-d11-red.md      ← written back from flag.deviation_note
```

A rule file:

```markdown
---
rule_id: D12-stock-days
version: 3
applies_to: D12
status: assumed          # assumed | confirmed-by-client
source: briefs/04-deviations-kpis.md#addendum-2
params:
  green_max_days: 28
  amber_max_days: 35
  a_class_stockout_days: 10
  consecutive_months_for_red: 2
owner_role: ASM
due_days: 14
---
Distributor stock-days vs the 18–28 day healthy band for fast movers. >35 days for two
consecutive months is the channel-stuffing signature. Bands are practitioner heuristics —
**calibrate against this company's own 24-month history before going live.**
```

**The compile step.** At engine start, a job parses every rule file and materialises:

```sql
create table ref.rule_param (
  rule_id text, version int, param text, value numeric,
  compiled_at timestamptz, primary key (rule_id, param)
);
```

Now SQL joins directly against OKF-authored thresholds, and every flag stamps `rule_id + rule_version`. Six months later you can answer "why was this amber in June?" — the rule file at that version says so.

**The writeback loop.** When a red flag closes, its notes append to `okf/exceptions/`. Next cycle the engine (and any agent) reads that history before flagging the same subject again. That is the difference between a dashboard and memory.

---

## 4. Sync jobs

| # | Job | Direction | Trigger | Idempotency mechanism |
|---|---|---|---|---|
| J1 | `sync.erp_pull` | ERP → Supabase `master`,`txn` | 01:00 daily | Stage → upsert on natural key. **Unknown sku_code/distributor_code rejects to `audit.reject` and alerts — never auto-creates.** |
| J2 | `sync.down` | Supabase → local `mirror` | 02:00 daily + on demand | Watermark on `updated_at`; append-only tables use last-seen PK |
| J3 | `okf.compile` | OKF files → `ref.rule_param` | before every engine run | Full rebuild, cheap |
| J4 | `sync.up` | local `out.*` → Supabase `publish`,`flag` | on engine completion | One transaction per `run_id`; insert-only, new run_id each time |
| J5 | `okf.writeback` | `flag.deviation_note` → `okf/exceptions/` | Fri 18:00 | One file per closed flag_id |

**J1's rejection rule is the highest-value line in this table.** Master-data drift — an ERP SKU code silently not matching the OS master — makes every downstream number wrong with no visible symptom. Reject and alert; never auto-create.

---

## 5. Cron — the month

Times IST. `D` = day of month.

```
 MONTHLY CYCLE
 D22 08:00  cycle.open           create estimate_cycle, notify distributors
 D25 09:00  nudge.estimates      remind non-filers
 D26 09:00  nudge.estimates      second reminder, cc ASM
 D27 23:59  cycle.lock       ★   draft → estimate_locked, hash, verify row count
 D28 02:00  engine.forecast      baseline + per-distributor bias correction + FVA stairstep
 D28 10:00  [HUMAN] demand review — consensus number
 D29 02:00  engine.supply        constrained plan vs mill capacity
 D29 10:00  [HUMAN] supply review → pre-S&OP reconciliation
 D30 02:00  engine.campaign      strip-width grouping, thickness ladder, min tonnage (MILP)
 D30 15:00  [HUMAN] executive S&OP — approve (sets plan_run.approved_at)
 D01 06:00  publish.program      push rolling program + allocations, notify distributors

 CONTINUOUS
 daily 05:00   engine.deviation_daily     D4 D5 D6 D7 D14
 daily 23:00   flag.expire                age out unactioned, escalate a tier, log
 Mon   06:00   engine.deviation_weekly    D8 D9 D10 D11 D12 D13 D15
 D01   08:00   engine.deviation_monthly   D1 D2 D3 D16
 Sat   03:00   engine.reclassify          runner/repeater/stranger per family
```

★ **`cycle.lock` is the one job that must never silently fail.** It is the boundary between "what they said" and "what they did", and every deviation downstream depends on it.

```sql
begin;
  select cycle_id from capture.estimate_cycle
   where plan_month = :m and status = 'open' for update;   -- exactly-once

  insert into capture.estimate_locked (cycle_id, distributor_id, family_id, qty_mt, locked_at)
  select cycle_id, distributor_id, family_id, qty_mt, now()
    from capture.estimate_draft where cycle_id = :cycle_id;

  update capture.estimate_cycle set
    status = 'locked',
    locked_at = now(),
    row_count = (select count(*) from capture.estimate_locked where cycle_id = :cycle_id),
    snapshot_hash = (select md5(string_agg(distributor_id||':'||family_id||':'||qty_mt,
                                           ',' order by distributor_id, family_id))
                       from capture.estimate_locked where cycle_id = :cycle_id)
  where cycle_id = :cycle_id;
commit;
```

Then alert on `row_count` deviating >20% from last cycle — that catches a half-failed lock, which is worse than a fully failed one.

**Scheduler choice:** not Windows Task Scheduler. Run the engine as a container with an in-process scheduler (node-cron / APScheduler) so the whole OS is `git clone && docker compose up` on any machine. This directly retires the "one laptop under one desk" failure mode.

---

## 6. A deviation, end to end

D1, with every edge case from the brief handled in SQL:

```sql
with paired as (
  select e.distributor_id, e.cycle_id, e.family_id,
         e.qty_mt as est,
         coalesce(o.confirmed_net_mt, 0) as act
  from mirror.estimate_locked e
  join mirror.estimate_cycle c using (cycle_id)
  left join feat.confirmed_orders_by_month o
         on o.distributor_id = e.distributor_id
        and o.family_id      = e.family_id
        and o.plan_month     = c.plan_month
  where c.plan_month between (:m::date - interval '2 months') and :m
    and e.imputed = false                       -- carry-forwards never score a distributor
), agg as (
  select distributor_id,
         sum(est - act)       as sum_err,
         sum(abs(est - act))  as sum_abs_err,
         sum(act)             as sum_act,
         count(distinct cycle_id) as n_periods
  from paired group by 1
)
select a.distributor_id,
       case when sum_act = 0 then null
            else round(100.0 * sum_err     / sum_act, 1) end as bias_pct,
       case when sum_act = 0 then null
            else round(100.0 * sum_abs_err / sum_act, 1) end as wmape_pct,
       case
         when sum_act = 0 or n_periods < 3                      then 'UNRATED'
         when abs(100.0*sum_err/sum_act)     > p_bias.value
           or  100.0*sum_abs_err/sum_act     > p_wmape.value     then 'RED'
         when 100.0*sum_abs_err/sum_act      > p_amber.value     then 'AMBER'
         else 'GREEN'
       end as rag
from agg a
cross join lateral (select value from ref.rule_param
                     where rule_id='D1-estimate-reliability' and param='red_bias_pct')  p_bias
cross join lateral (select value from ref.rule_param
                     where rule_id='D1-estimate-reliability' and param='red_wmape_pct') p_wmape
cross join lateral (select value from ref.rule_param
                     where rule_id='D1-estimate-reliability' and param='amber_wmape_pct') p_amber;
```

Covered: WMAPE denominator is Σ actuals (never Σ forecast); zero-actual slices report UNRATED rather than 0% or 100%; <3 periods excluded; imputed estimates excluded; thresholds joined from OKF. When `wmape_pct ≈ |bias_pct|`, the errors are one-sided — that's a gaming fingerprint, and routes to sales management rather than planner coaching.

---

## 7. Build order

| Stage | Deliverable | Proves |
|---|---|---|
| 1 | `master` + J1 with rejection | You can hold one SKU master and one distributor master. **Nothing else works until this does.** |
| 2 | `capture.estimate_*` + cycle.lock + RLS portal | You can capture and freeze estimates |
| 3 | `mirror` + J2 + `ref` + J3 | The engine can run offline against real data and OKF rules |
| 4 | D1 + D14 | Two deviations end-to-end, with owners and a standing meeting |
| 5 | `publish.campaign` + rolling program | The published calendar — the artifact that disciplines both plant and channel |
| 6 | D4, D11, D12 + allocation on trailing offtake | The remaining three chronic failure modes |

Stage 1 is 80% of the risk. Every studied control-tower build succeeded or died there.

---

## 8. Open decisions (need the client, not research)

1. **Non-filers at cutoff.** If a distributor files nothing by D27, does the OS write zero, carry forward last month flagged `imputed`, or use the statistical baseline? Affects D1 scoring and allocation entitlement. *Recommendation: carry forward, `imputed=true`, excluded from reliability scoring — implemented above, but confirm.*
2. **Estimate grain.** Schema assumes distributor × SKU-family × month. If the business wants SKU-level estimates, D1 and allocation both change shape.
3. **Secondary-sales capture point.** Distributor's dealer-invoice vs field-app-captured order vs monthly declaration. Determines whether D11 is weekly-credible or monthly-only.
4. **ERP reality.** Whether `txn.production_log` can actually carry `campaign_id` and `reason_code` from the shift log. If not, D4 needs a separate capture path and stage 5 gets harder.
5. **Who approves a plan_run.** `approved_at` is modelled as a single exec sign-off. If approval is committee-based, the model needs an approvals table.
6. **Threshold calibration.** Every band in OKF is currently `status: assumed` from practitioner heuristics. Run all sixteen against 24 months of history before a single alert reaches a human — going live on unvalidated thresholds is how dashboards become wallpaper.

---
name: servable-orders-whatsapp
description: >-
  Daily WhatsApp message listing, distributor by distributor, how much of each
  distributor's pending order book the plant can serve from finished stock on hand
  today — scoped to the plant's service area (South). Runs
  scripts/servable-orders.mjs so every figure comes from the app's own
  salesByDistributor, and writes reports/servable-orders-whatsapp-<date>.txt.
  Trigger phrases: "servable orders", "orders we can serve", "which orders can we
  serve", "servable orders whatsapp", "daily servable report".
---

# Orders we can serve today — WhatsApp (Pipes & Tubes)

Answers one question per distributor and size: **of what this distributor is waiting on, how much is
sitting on the floor right now?** `servable = min(pending, plant on-hand)`.

Every number comes from `scripts/servable-orders.mjs`, which computes through the **same**
`salesByDistributor(orders, dispatches, month, skus, { productions })` call the Sales tab drill-down
and the PB MTD workbook read. Do **not** recompute any figure here in SQL — that is how the screen
and the message start to disagree (ADR-0003).

## Inputs
- `report_date` — optional `YYYY-MM-DD`, default **today**.
- `serves` — optional comma-separated region list, default **`South`** (the plant's service area,
  see below). **Omit the `--serves` flag entirely** for a plant-wide report across all regions.
- `top` — optional, max SKU lines per distributor, default **5**.
- `min` — optional, hide SKU lines under this many MT, default **0.5**.

## The two rules this report exists to respect

**1 — There is no plant total, and there must never be one.** On-hand is the whole plant's and is
reserved to nobody (ADR-0002). The same tonnage legitimately appears against every distributor
waiting on that size, so the servable column does not add up. On 18-Aug-2026, `50x50x2.0 SHS` had
39.3 T on the floor with 88.0 T queued against it across six distributors, and each read its full
pending as servable. Per-distributor totals are real; a plant total would be fiction — the identical
total ADR-0002 suppressed on the workbook's Distributor × SKU sheet. A `⚠️` marks a size ordered for
more than the plant holds.

**2 — The plant cannot ship everywhere.** This one is **not in the data model at all**: the app has
a single unnamed "the plant", no plant column, and the word "Nippon" appears nowhere in the
codebase. The service area is a business rule that has to be passed in, and today it is
**South only**. It is applied with `--serves South`, which filters the **order book before any stock
maths**, so `allPending`, Free Stock and the contested flag all recompute against demand this plant
can actually serve. Filtering the *output* instead would leave South sizes reading "contested"
because of West orders that were never competing for this stock.

> **Known limit — single plant.** The report assumes every production and dispatch row in the
> database belongs to one plant. That holds today. The moment a second plant's stock lands in the
> same tables, `--serves` is **not** enough: on-hand itself would be overstated, and the fix is a
> plant column on `productions`/`dispatches`, not a wider region filter. Say so rather than shipping
> a report that silently mixes two floors.

## Steps

### 1 — Run the script (live path)
```bash
node scripts/servable-orders.mjs --date <D> --serves South
```
Credentials come from `.env.local` (`VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY`) or `--url`/`--key`.
stdout is the WhatsApp message; stderr carries the per-distributor summary, the bundle tie-out and
any warnings. **Read stderr** — it is where excluded distributors and unmapped states are reported.

### 2 — If the live path is blocked (`403 … Host not in allowlist`)
Remote agent sessions run behind an egress policy that may not allow
`hztblmccvvarmgxmunrp.supabase.co`. Do **not** route around it and do **not** retry. Use the
aggregated path instead: run the query below via the Supabase MCP `execute_sql` (project
`hztblmccvvarmgxmunrp`), write the single returned JSON string verbatim to
`.workspace/agg.json`, then:
```bash
node scripts/servable-orders.mjs --date <D> --serves South --agg .workspace/agg.json
```
The bundle carries only plain Σs; every identity, SKU key and stock rule still runs in `calc.js`.
The script re-adds the expanded rows and refuses to report if they disagree with the bundle's own
`checks` block, so a truncated or half-pasted payload fails loudly instead of under-reporting.

```sql
with open_o as (
  select * from orders
  where deleted is not true
    and lower(trim(coalesce(order_status,''))) <> 'delivered'
    and coalesce(confirmed,0) + coalesce(non_confirmed,0) > 0
),
latest as (
  select distinct on (customer) customer, ship_to_state
  from open_o where coalesce(ship_to_state,'') <> ''
  order by customer, order_date desc nulls last
),
relevant as (
  select distinct sku_code c from productions where deleted is not true
  union select distinct be->>'skuCode' from dispatches d, lateral jsonb_array_elements(d.bundle_entries) be where d.deleted is not true
  union select distinct mm_id from open_o
)
select json_build_object(
  'skus', (select coalesce(json_agg(json_build_array(
       s.sku_code, s.product_type, s.height, s.breadth, s.nominal_bore, s.thickness, s.length,
       substring(lower(coalesce(s.description,'')) from 'is\s*(\d+)'), s.weight_per_tube
     ) order by s.sku_code), '[]'::json)
     from skus s join relevant r on r.c = s.sku_code),
  'prod', (select coalesce(json_agg(json_build_array(sku_code, tc, tw) order by sku_code), '[]'::json) from (
       select sku_code, sum(coalesce(tube_count,0)) tc, round(sum(coalesce(total_weight,0))::numeric,4) tw
       from productions where deleted is not true group by sku_code) p),
  'disp', (select coalesce(json_agg(json_build_array(c, w, pc) order by c), '[]'::json) from (
       select be->>'skuCode' c, round(sum(coalesce((be->>'weight')::numeric,0)),4) w,
              sum(coalesce((be->>'pieces')::numeric,0)) pc
       from dispatches d, lateral jsonb_array_elements(d.bundle_entries) be
       where d.deleted is not true group by 1) q),
  'orders', (select coalesce(json_agg(json_build_object('code', dc, 'name', nm, 'state', st, 'lines', ls) order by nm), '[]'::json) from (
       select dc, nm, max(st) st, json_agg(json_build_array(mm, cf, nc) order by mm) ls from (
         select coalesce(nullif(trim(o.distributor_code),''),'') dc, trim(coalesce(o.customer,'')) nm,
                coalesce(l.ship_to_state,'') st, o.mm_id mm,
                round(sum(coalesce(o.confirmed,0))::numeric,4) cf, round(sum(coalesce(o.non_confirmed,0))::numeric,4) nc
         from open_o o left join latest l on l.customer = o.customer group by 1,2,3,4) g
       group by dc, nm) h),
  'missingDesc', (select coalesce(json_agg(json_build_array(mm, d) order by mm), '[]'::json) from (
       select mm_id mm, max(description) d from open_o
       where mm_id not in (select sku_code from skus) group by 1) m),
  'checks', json_build_object(
     'pendingMt', (select round(sum(coalesce(confirmed,0)+coalesce(non_confirmed,0))::numeric,4) from open_o),
     'producedMt', (select round(sum(coalesce(total_weight,0))::numeric,4) from productions where deleted is not true),
     'invoicedMt', (select round(sum(coalesce((be->>'weight')::numeric,0)),4)
                    from dispatches d, lateral jsonb_array_elements(d.bundle_entries) be where d.deleted is not true))
)::text as bundle;
```

### 3 — Sanity-check before sending
Refuse to send, and say why, if any of these trip:
- The script exited non-zero — it never prints a half-loaded book on purpose.
- stderr reports distributors **excluded only because their state is unmapped**. That is a
  labelling gap, not a service-area decision (`Unmapped` is never a region — CONTEXT.md). Fix it by
  mapping the state on the Sales tab, never by letting the filter swallow the row.
- The in-scope pending total moved by more than a few percent overnight with no upload to explain it.

Cross-checks worth keeping (they caught real errors when this was built):
`Σ pending` across the whole book is **2,512.0 T** and the West book excluded by `--serves South` is
**1,397.0 T** — both figures are independently recorded in `LEARNINGS.md` and `ADR-0002`.

### 4 — Output
1. Print the message inside a plain code block so it copy-pastes cleanly.
2. Save it to `reports/servable-orders-whatsapp-<D>.txt`.
3. State plainly what was excluded: the out-of-area distributors and their tonnage. That figure is
   in the message footer already — do not drop it when summarising.

## WhatsApp formatting
`*bold*` single asterisks, `_italic_` underscores, `•` bullets, no markdown tables or headers.
Weights to one decimal with a trailing ` T`. Emojis for scanability only. The script emits all of
this — do not hand-edit its output; change the script so the next run inherits the fix.

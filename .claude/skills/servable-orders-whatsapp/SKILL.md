---
name: servable-orders-whatsapp
description: >-
  Daily WhatsApp message listing, distributor by distributor, how much of each
  distributor's pending order book the plant can serve from finished stock on hand
  today — naming the plant that made that stock, and scoped to the service area
  (South). Runs
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

## The three rules this report exists to respect

**1 — There is no plant total, and there must never be one.** On-hand is the whole plant's and is
reserved to nobody (ADR-0002). The same tonnage legitimately appears against every distributor
waiting on that size, so the servable column does not add up. On 18-Aug-2026, `50x50x2.0 SHS` had
39.3 T on the floor with 88.0 T queued against it across six distributors, and each read its full
pending as servable. Per-distributor totals are real; a plant total would be fiction — the identical
total ADR-0002 suppressed on the workbook's Distributor × SKU sheet. A `⚠️` marks a size ordered for
more than the plant holds.

**2 — The plant cannot ship everywhere.** The service area is **not in the data model**: plants are
attributed (#118) but nothing records where each one ships, so it is a business rule that has to be
passed in, and today it is **South only**. It is applied with `--serves South`, which filters the
**order book before any stock maths**, so `allPending`, Free Stock and the contested flag all
recompute against demand this plant can actually serve. Filtering the *output* instead would leave
South sizes reading "contested" because of West orders that were never competing for this stock.

**3 — The message names the floor it is counting (#128).** `🏭 Stock made at: Hyderabad` in the
header, read off the `plant` on the production rows via `plantNamesIn` — never typed, never assumed.
Until four plants were attributed, "the plant" could go unnamed without lying; now an unnamed floor is
a claim, and a wrong one.

It says **made at**, not *held at*, and the difference is load-bearing: on-hand is produced − invoiced
across all plants for a size, and nothing attributes the surviving tonnage back to a floor. A plant
that made stock and has since shipped every tonne is still named. Naming who made what this report
counts is true; claiming to know where each tonne now sits is not.

> **Known limit — several floors, one on-hand.** If the stock spans more than one plant the header
> says so (`🏭 Stock made at: Hyderabad + NPMD — combined, not split by plant`) and a `⚠️` footer warns
> that a size may be sitting at a different plant from the distributor waiting on it. That is a
> **statement, not a fix**: on-hand is still summed across plants. Scoping stock and demand per plant
> needs an answer to "which regions does NPMD serve?", which #117 deliberately left open — do not
> invent one by adding a filter here. Today NPMD produces nothing, so the message names Hyderabad
> alone.

Two ways the plant can be missing, and they are **not** the same fact:
`🏭 Stock: plant not identified — aggregated bundle carries no plant` means the bundle predates #128
and should be rebuilt; `🏭 Stock: made at a plant nobody has labelled` means the production rows
themselves carry no plant, which is a labelling gap to fix on the floor. Never report the second as
the first — it sends someone off to rebuild a query that was fine.

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

The production Σs are grouped **per SKU and per plant**, which is what lets the aggregated path still
name the floor. A bundle built before #128 carries three-element `prod` tuples: the message then says
`🏭 Stock: plant not identified` rather than filing every tonne under `Unattributed` — rebuild it with
the query below. A **current** bundle whose rows carry an empty plant is a different message (see
rule 3) and needs no rebuild.

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
  'prod', (select coalesce(json_agg(json_build_array(sku_code, tc, tw, plant) order by sku_code), '[]'::json) from (
       select sku_code, coalesce(plant,'') plant, sum(coalesce(tube_count,0)) tc, round(sum(coalesce(total_weight,0))::numeric,4) tw
       from productions where deleted is not true group by sku_code, coalesce(plant,'')) p),
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
- The header names a plant nobody expects, or says nobody labelled the rows, or names a second plant
  on a day NPMD has not started producing. All three mean the production rows' `plant` is wrong, not
  that the stock moved.

Cross-checks worth keeping (they caught real errors when this was built):
`Σ pending` across the whole book is **2,512.0 T** and the West book excluded by `--serves South` is
**1,397.0 T** — both figures are independently recorded in `LEARNINGS.md` and `ADR-0002`.

### 4 — Output
1. Print the message inside a plain code block so it copy-pastes cleanly.
2. Save it to `reports/servable-orders-whatsapp-<D>.txt`.
3. State plainly what was excluded: the out-of-area distributors and their tonnage. That figure is
   in the message footer already — do not drop it when summarising.
4. Say whose stock it was. The header line carries it; repeat it when summarising, because "we can
   serve 638 T" means nothing without the floor it came off.

## WhatsApp formatting
`*bold*` single asterisks, `_italic_` underscores, `•` bullets, no markdown tables or headers.
Weights to one decimal with a trailing ` T`. Emojis for scanability only. The script emits all of
this — do not hand-edit its output; change the script so the next run inherits the fix.

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

**1 — There is no plant total, and there must never be one.** Inside a service area, on-hand is
shared and reserved to nobody (ADR-0002). The same tonnage legitimately appears against every
distributor in that area waiting on that size, so the servable column does not add up. On
18-Aug-2026, `50x50x2.0 SHS` had 39.3 T on the floor with 88.0 T queued against it, and each
distributor read its full pending as servable. Per-distributor totals are real; a plant total would
be fiction — the identical total ADR-0002 suppressed on the workbook's Distributor × SKU sheet. A
`⚠️` marks a size ordered for more than its area holds.

**2 — A distributor is only offered stock from plants that serve its region (#129, ADR-0006).** This
is now automatic and unconditional, in `salesByDistributor`, and it comes off the **plant master**:
Hyderabad and Lepakshi serve South, NPMD and Tapi serve West. Every one of the script's figures is
already scoped that way before you pass any flag.

`--serves South` is a **different** control and still worth passing: it narrows the ORDER BOOK, so
the message lists the South sales team's own distributors instead of the national book. It chooses
the audience; the plant master chooses the stock. The tonnage it excludes is still stated (`📍 South
only`, plus the out-of-area line) rather than dropped.

> Today that means a West distributor's servable tonnage is **zero**, because no plant serving West
> has produced anything. The message says so outright — `⚠️ No stock for West — no plant serving it
> has produced any` — because a list of zeros otherwise reads as an outage. It fills itself in the
> day NPMD produces. Do **not** "fix" it by widening the pool.

**3 — The message names each floor with the region it serves (#128, #129).** `🏭 Stock made at:
Hyderabad (South)` in the header, read off the `plant` on the production rows — never typed, never
assumed. Naming the plant without the region it serves is only half the fact: a reader who knows the
stock was made at Hyderabad still cannot tell whether their distributor may have any of it.

It says **made at**, not *held at*, and the difference is load-bearing: on-hand is produced −
invoiced at those plants, and nothing attributes the surviving tonnage back to one floor. A plant
that made stock and has since shipped every tonne is still named.

> **Known limit — two floors, one on-hand.** Where two plants serve the SAME region their floors are
> summed into one on-hand. Inside a service area that is intended — an order there can be filled
> from either — but a size may still be sitting at the further of the two, so a `⚠️` footer names it
> per region (`On-hand for South combines Hyderabad and Lepakshi`). Plants serving *different*
> regions are never combined and the message must never say they are.

`Unattributed` is not a plant (CONTEXT.md) and serves no region, so it can never be printed as one —
and its stock is offered to nobody. A production row with a blank plant is reported on **stderr**
(`N T of production carries no plant…`) as a labelling gap to fix on the floor, never silently
dropped.

An **aggregated bundle** (`--agg`) must carry `plant` on BOTH its `prod` and its `disp` tuples —
on-hand is produced − invoiced *within an area*, so scoping one half and not the other compares
different things. A bundle missing either is **refused outright**, with the tuple shapes to rebuild
it: reporting from it would announce that nothing can be served at all.

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

Both the production **and** the dispatch Σs are grouped **per SKU and per plant** — on-hand is
produced − invoiced *within a service area*, so scoping one half and not the other compares different
things. A bundle built before #128/#129 carries three-element `prod` or `disp` tuples and the script
**refuses to run**, naming which half is short: it cannot pool per area without them, and would
otherwise announce that nothing can be served. Rebuild with the query below. A **current** bundle
whose rows carry an empty plant needs no rebuild — that is a shop-floor labelling gap, reported as
one on stderr.

The bundle also carries a **`masters`** block, and it is the one part that is not a Σ — it is the
three masters copied row for row. `state_regions` decides which region a distributor is in,
`plants.serves` decides which floors serve that region, and `distributors.region` overrides the
first for the exceptions a state rule cannot express. Between them they answer this report's whole
question, so a bundle without them answers it from the **code seeds** instead and can contradict the
Sales tab, the workbook and `daily-splits.mjs` about who can be served. The script **refuses** a
bundle with no `masters` key: an absent block cannot be told apart from three empty tables. Empty
arrays are a real answer and mean the seeds carry it, exactly as the live path's optional fetches do.

> This is not hypothetical. On 27-Aug-2026 `state_regions` held one stored row — `KARNATAKA → East`,
> typed two days earlier over the seed's `KARNATAKA → South`. The live path saw it; the bundle did
> not. The aggregate filed **SST STEEL CORPORATION** in South and offered it 32.4 T of Hyderabad
> stock, while the same database through `daily-splits.mjs` put it in East, which **no plant serves
> at all**. Two reports off one book, opposite answers about who can be served.

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
  'disp', (select coalesce(json_agg(json_build_array(c, w, pc, plant) order by c), '[]'::json) from (
       select be->>'skuCode' c, coalesce(be->>'plant','') plant,
              round(sum(coalesce((be->>'weight')::numeric,0)),4) w,
              sum(coalesce((be->>'pieces')::numeric,0)) pc
       from dispatches d, lateral jsonb_array_elements(d.bundle_entries) be
       where d.deleted is not true group by 1, 2) q),
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
  'masters', json_build_object(
     'stateRegions', (select coalesce(json_agg(json_build_array(state, region, deleted) order by state), '[]'::json) from state_regions),
     'plants', (select coalesce(json_agg(json_build_array(plant_id, to_json(serves), deleted) order by plant_id), '[]'::json) from plants),
     'distributors', (select coalesce(json_agg(json_build_array(distributor_key, region, deleted) order by distributor_key), '[]'::json) from distributors)),
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
- The header names a plant nobody expects, or says no plant serving the area has produced, or names a
  second plant on a day NPMD has not started producing. All three mean the production rows' `plant`
  is wrong, not that the stock moved.
- The header names a plant against a region it should not serve (`NPMD (South)`). That is the plant
  master, not the data — check the Masters tab before sending.
- stderr reports production tonnage carrying no plant. That stock is offered to nobody; fix the rows
  rather than explaining the gap in the message.

Cross-checks worth keeping (they caught real errors when this was built). Both are **dated
reference points, not constants** — compare against the most recent one, and if the gap is large,
look for the upload that explains it before concluding the script is wrong:
- 18-Aug-2026 — `Σ pending` across the whole book **2,512.0 T**, West excluded by `--serves South`
  **1,397.0 T**. Independently recorded in `LEARNINGS.md` and `ADR-0002`.
- 27-Aug-2026 — `Σ pending` **3,133.0 T**, West excluded **2,365.0 T**, South's in-scope book
  **768.0 T**. That last figure is the one to check first: it must equal the daily message's
  `Pending to serve` for South exactly. The two are built by different scripts off the same masters,
  so a mismatch means one of them is not reading a master — see the 27-Aug `LEARNINGS.md` entry.

### 4 — Output
1. Print the message inside a plain code block so it copy-pastes cleanly.
2. Save it to `reports/servable-orders-whatsapp-<D>.txt`.
3. State plainly what was excluded: the out-of-area distributors and their tonnage. That figure is
   in the message footer already — do not drop it when summarising.
4. Say whose stock it was **and whose region it serves**. The header line carries both; repeat them
   when summarising, because "we can serve 638 T" means nothing without the floor it came off, and
   the floor means nothing without who may be served from it.
5. If any region in the message has no serving plant with stock, say so in your summary too — the
   zeros are the true position, and a reader who assumes an outage will go looking for a bug.

## WhatsApp formatting
`*bold*` single asterisks, `_italic_` underscores, `•` bullets, no markdown tables or headers.
Weights to one decimal with a trailing ` T`. Emojis for scanability only. The script emits all of
this — do not hand-edit its output; change the script so the next run inherits the fix.

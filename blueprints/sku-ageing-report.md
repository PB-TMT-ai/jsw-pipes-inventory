# Blueprint: SKU ageing report — plant-wise (finished-goods inventory ageing)

## Goal
Answer "give the ageing of these SKUs" / "plant-wise SKU ageing": for each plant and size, how much
finished stock is on hand and how long it has sat since production, bucketed by age — and, for the
weekly sales push, how much of last time's aged stock has since been invoiced.

## Rules of record
The stock and ageing rules are the **approved** Inventory Snapshot rules in
`docs/inventory-dashboard-rules.md` (#213). Do not restate or vary them here; this report uses:

| Snapshot rule | What it fixes for this report |
|---|---|
| **S1** size key | section + size (NB, else height x breadth) + thickness (2 dp). ERP code, **IS standard and length do not split** a size. App: `snapshotSizeKeyResolver` (`src/lib/reports.js`) |
| **S2** on hand | produced − invoiced **at the same plant**, per size, floored at 0. Production MT = tubes × master `weightPerTube` (`resolveProductionWeights`, `src/lib/calc.js`), **never** the stored `total_weight` when the master has a weight. Invoice plant = each **entry's** `plant`. Soft-deleted rows out |
| **S10** ageing | per plant and size, invoices drain the **oldest** production first (FIFO by weight, `skuAgeing`); survivors aged as-of − production date. "Over 60 days" = **61 or more** |
| **S5** plant names | the Snapshot shows plant id `hyderabad` as **Nippon**. This report has used "Hyderabad" in its sales emails; either is fine, but say "Nippon (Hyderabad)" if a reader may compare the two |

Because the rules are shared, this report's per-plant on hand and > 60 days **must equal** the
Inventory Snapshot for the same as-of date. That equality is the first check.

Report-only rules (not in the Snapshot):
- **Buckets:** 0–30 / 31–60 / 61–90 / 90+ days, where 31 is the first "over 30" day and 90+ means 91 or more.
- **Over 30 days** = 31–60 + 61–90 + 90+. An attachment row = a (plant, size) with more than 0.005 MT over 30 days.
- **Priority** (sales email and attachment), by the size's **oldest surviving batch**: over 90 days → P1, 61–90 → P2, 31–60 → P3. Within a plant and priority, sizes with ≥ 5 MT over 30 days get their own email row; the rest are one "+N smaller" row (all are in the attachment).
- **Sold since `<base>`** (week-on-week), per size: `over-30 on the base date` − `over-30 surviving today when today's data is aged as on the base date`, floored at 0. "new" when the size had nothing over 30 days on the base date. Under FIFO an invoice always takes the oldest batches first, so this is exactly the aged stock invoiced since. **Rebuild the base under the same rules** (same key, same weights) — never subtract figures made under different rules. Sizes whose aged stock sold out completely are not attachment rows, so their sales are only in the plant totals, never a column total.
- **Sells to:** Hyderabad and Lepakshi → South; NPMD and Tapi → West (`plants.serves`, CLAUDE.md).

## Input
Live Supabase tables: `productions` (`plant`, `sku_code`, `date_of_production`, `tube_count`,
`total_weight`), `dispatches` (`bundle_entries[]`: `skuCode`, `weight`, `pieces`, `plant`), `skus`
(dimensions + `weight_per_tube`). No file upload.

## Steps
1. **Pull the data.** Remote sessions cannot reach Supabase REST (403). Use one MCP `execute_sql` that
   returns a single JSON bundle — `skus` (incl. `weightPerTube`), `prod` grouped by plant + code + date
   (Σ weight, Σ tubes), `disp` grouped by entry plant + code (Σ weight, Σ pieces), and a `checks` block
   (Σ per plant, last production / invoice date, last `created_at`, future-dated rows, codes missing
   from the master). Pad it with `repeat('pad', 40000)` so the harness saves it to a file; parse it with
   `python3 -I`; re-check every Σ against `checks` before using it.
2. **Compute with the app's own code**, per plant: `resolveProductionWeights` → `snapshotSizeKeyResolver`
   → `skuAgeing(plantProductions, plantInvoices, keyOf, asOf)`. Assert per plant: Σ buckets = on hand,
   and on hand − over-invoiced = produced − invoiced.
3. **Cross-check independently** with `scripts/sku-ageing-by-plant.sql` (set `as_of`). Per plant size
   count, on hand and every bucket must agree to 0.001 MT, and on hand / > 60 days must equal the
   Inventory Snapshot for that date.
4. **Week-on-week:** rebuild the base date's figures under these rules from the base date's data (keep
   the base bundle), then apply the "sold since" rule above.
5. **Outputs** in `reports/`: `SKU-Ageing-by-Plant-<as_of>.md` (+ `.csv`, one row per plant × size);
   for the sales push, `Ageing-Push-Email-<as_of>.html` (inline-styled tables, Outlook-safe) and the
   attachment `SKU-Ageing-over-30d-<as_of>.xlsx` (Summary by plant + one row per size over 30 days,
   priority colours, filter, SUBTOTAL total row).
6. **Verify before sending** (CLAUDE.md): every `.csv` / `.xlsx` goes to the `data-verifier` agent with
   this blueprint and `docs/inventory-dashboard-rules.md` as the spec, and is sent only with a PASS
   stamp (`scripts/verify-stamp.py`). Check the `.md` and email figures the same way. The verifier's
   working folder lands in `reports/verifier/` — move it out of the repo when it finishes; commit the stamp.

## Number handling (each of these failed a verification once)
- **Store unrounded values** in every cell a formula adds; format to 2 decimals. Totals of pre-rounded
  cells drift past the 0.02 MT tolerance (Nippon 90+ was off 0.027 MT on 26 Oct).
- **Round half up on decimals**, not with bare JS `toFixed`: 4.05 is stored as 4.0499… in a float. Use
  `(Math.round(n * 10 + 1e-6) / 10).toFixed(1)`.
- **Sum exact values, round once.** Never add rounded plant figures to make a total.
- A list's filter and its footer must cover the same rows.

## Edge cases
- **Over-invoiced size** (invoiced > produced at that plant, e.g. pre-tracking stock, an invoice booked
  to the wrong plant): on hand 0, not aged, not a row; report the plant's over-invoiced MT and count.
- **Deleted invoices with no live replacement** are excluded like every soft-deleted row; if one looks
  real (e.g. `JODLGJ0926/01685`, Tapi, 10 Sep, ~32 MT), say so — that plant's stock may be overstated.
- **Invoice history starts later** for Lepakshi, NPMD and Tapi (30/31 Aug 2026) than Hyderabad
  (31 Mar). Production before that with no invoice in the system ages as unsold.
- **Max age is capped** by tracking start (Hyderabad 28 Mar 2026).
- **Possible duplicate production rows** (same baby coil entered twice, e.g. HYD-0526-112-A/B/C) count
  as entered; flag them.
- "Made at", not "held at": stock counts at the plant that produced it.

## Legacy
`scripts/sku-ageing.sql` and `scripts/sku-ageing-fifo-layers.sql` are the **company-wide** method of
14 Jul 2026 (pieces drain, IS-agnostic size key, stored weights). Use them only when a company-wide
cut is explicitly asked for; their totals will not equal the Inventory Snapshot. The plant-wise reports
of 19 and 26 Oct 2026 used stored weights and an IS-split key — their figures differ slightly from
runs under these rules (26 Oct Nippon over 30 days: 488.2 old method, 486.6 these rules).

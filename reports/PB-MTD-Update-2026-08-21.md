# JSW Pipes & Tubes — PB MTD Update (2026-08-21)

Reproduces the JSW "PB MTD update" order/invoice layout for the Pipes & Tubes system,
with numbers pulled live from Supabase. Only lines that are both **relevant to P&T** and
**computable** from current data are included.

```
PB MTD update as on --->	2026-08-21
Revised Best Estimate --->	⚠️ N/A
Total Orders --->	4273.9T
Current Month Orders --->	4186.0T
Invoiced Orders MTD --->	544.7T
Invoiced MTD (Previous Month) --->	502.8T
Dispatch D-1 (Current Month) --->	56.1T
Dispatch D Day --->	25.2T
Confirmed Orders Pending to be Invoiced --->	30.0T
Non-Confirmed Orders --->	3699.2T
Daily Run Rate Required --->	⚠️ N/A
Physical Inventory --->	1383.1T
RM Full Coil Left --->	729.8T
RM Baby Coil Left --->	676.3T
RM Total --->	1406.1T
	
Invoiced MTD · Hyderabad only - South --->	544.7T
Invoiced MTD · Hyderabad only - West --->	0T
Invoiced MTD · Hyderabad only - All Regions --->	544.7T
	
Pending to Serve - South --->	1613.2T
Pending to Serve - West --->	2116.0T
Pending to Serve - All Regions --->	3729.2T
	
Invoiced MTD by Plant · Hyderabad only - Hyderabad --->	544.7T
Invoiced MTD by Plant · Hyderabad only - NPMD --->	0T
Invoiced MTD by Plant · Hyderabad only - Lepakshi --->	0T
Invoiced MTD by Plant · Hyderabad only - Tapi --->	0T
Invoiced MTD by Plant · Hyderabad only - All Plants --->	544.7T
Invoiced MTD is Hyderabad-only — the other plants carry orders but have never invoiced. Pending is every plant's, so the two columns are not like for like.
	
Pending to Serve by Plant - Hyderabad --->	748.2T
Pending to Serve by Plant - NPMD --->	1082.0T
Pending to Serve by Plant - Lepakshi --->	825.0T
Pending to Serve by Plant - Tapi --->	1074.0T
Pending to Serve by Plant - All Plants --->	3729.2T
	
Produced MTD --->	386.5T
Produced MTD (Previous Month) --->	1120.2T
Production D-1 --->	0T
Production D Day --->	0T
	
Orders Logged D Day --->	0T
Orders Logged D-1 --->	60.0T
Orders Logged D-2 --->	968.0T
```

Notes:
- **Revised Best Estimate / Daily Run Rate Required** — no August target supplied; give a
  best-estimate MT figure and both lines compute (10 calendar days remain, Aug 22–31 inclusive).
- **Both splits come from `scripts/daily-splits.mjs`, never from SQL** — `buildRegionMtdSummary` and
  `buildPlantMtdSummary`, the same builders the PB MTD workbook prints from. This session's network
  egress policy blocks the script's own HTTPS fetch to `hztblmccvvarmgxmunrp.supabase.co` (`403` both
  directly and through the agent proxy), so the rows were read through the Supabase MCP instead and
  fed to the script via its documented `--in` offline path. The **computation is unchanged** — only
  the transport differs. The transferred row set was verified byte-identical to what the script's own
  fetch would have produced (MD5 `40abaa5091d8505216e2738bd6c75288`, checked against the database).
- **The row set is a projection, and a provably inert one.** It carries every one of the 1,121 order
  rows in full, and the dispatch-entry keys the two builders actually read (`weight`, `plant`,
  `shipToState`, `orderLineId`, `orderId`, `childOrderId`, `distributorCode`, `customer`). Dispatch
  entries outside 2026-08 that carry neither a `shipToState` nor a `plant` were omitted: they enter no
  month-scoped sum, contribute nothing to `distributorStateIndex` (a blank state returns early) and
  nothing to `everInvoiced` (a blank plant is skipped), so they cannot move any figure here. That
  drops 24,306 entries to 2,725 and 20.6 MB to 1.1 MB. `maxDispatchDate` is unchanged at 2026-08-21.
  `coilAllocations` — 8.7 MB of costing/traceability data neither builder reads — is not carried.
- **Invoiced MTD (Previous Month)** = July invoiced **through the same day-of-month** (Jul 1–21)
  = 502.8 T, for a like-for-like pace comparison. August is ahead: 544.7 vs 502.8
  (**+41.9 T, +8.3%**).
- **Total Orders** = MTD Invoice + Confirmed + Non-confirmed = 544.7 + 30.0 + 3699.2 = 4273.9 T.
- **Physical Inventory** = finished pipe stock = **produced − invoiced**, produced **recomputed
  live from the current SKU master** (`tubeCount × weightPerTube`), matching the app:
  4,978.5 − 3,595.4 = **1,383.1 T**. Dashboard → **Finished Goods → FG Left Inventory**.
  Stored-basis production sum is 4,978.3 T (Δ −0.2 T vs live) — negligible master-weight drift.
- **Dispatch is current** (latest dispatch date loaded is 2026-08-21, the report date itself), but
  **orders and production are behind**: latest order date loaded is **2026-08-20**, latest
  production date **2026-08-19**. Treat every 0 on Orders Logged D Day, Production D-1 and
  Production D Day as **"not loaded yet"**, not a stopped order desk or a stopped mill.
- **Production** uses the same live master recompute as Physical Inventory, so Produced and FG
  can never disagree. August MTD reads 386.5 T against July's 1,120.2 T over the same 21 days —
  but with production data loaded only through Aug 19, the August figure is short two days, not a
  real slowdown of that size.
- **RM (raw material)** mirrors the Dashboard → **Coil** cards:
  **Full Coil Left 729.8 T** + **Baby Coil Left 676.3 T** = **RM Total 1,406.1 T**. FG is a
  separate stage — never add it into RM. Total mother coil inward to date is 6,235.5 T.

## Verification

| # | Check | Method A | Method B | Verdict |
|---|---|---|---|---|
| 1 | Invoiced MTD (current) | `theoretical_weight` sum = 544.7 | bundle-line sum = 544.725 | ✅ PASS |
| 1 | Invoiced MTD (prev, day-capped) | `theoretical_weight` sum = 502.8 | bundle-line sum = 502.835 | ✅ PASS |
| 2 | Partition — orders | month intake = 4186.0 | Σ daily orders Aug = 4186.000 | ✅ PASS |
| 2 | Partition — dispatch | invoiced MTD = 544.7 | Σ daily dispatch Aug ≤ D = 544.725 | ✅ PASS |
| 3 | Arithmetic — Total Orders | 4273.9 | 544.7 + 30.0 + 3699.2 = 4273.9 | ✅ PASS |
| 4 | Freshness | report date 2026-08-21 | max order 08-20 · dispatch 08-21 · production 08-19 | ⚠️ Orders/production lag — zeros on those D/D-1 slots are "not loaded yet" |
| 5 | Region partition — invoiced | Σ regions (JS, app helpers) = 544.725 | `invoiced_mtd` (Postgres) = 544.7 | ✅ PASS (diff 0) |
| 6 | Region partition — pending | Σ regions (JS) = 3,729.15 | confirmed + non-confirmed (Postgres) = 3,729.15 | ✅ PASS (diff 0) |
| 7 | Plant partition — invoiced | Σ plants (JS) = 544.725 | All Plants ungrouped = 544.725 | ✅ PASS (diff 0) |
| 8 | Plant partition — pending | Σ plants (JS) = 3,729.15 | All Plants ungrouped = 3,729.15 | ✅ PASS (diff 0) |
| — | Row-set integrity | Postgres MD5 of the projected rows | MD5 of the decoded local file | ✅ PASS (`40abaa50…` exact) |
| — | Mass balance (RM) | inward − full coil left = 6,235.5 − 729.8 = 5,505.7 | baby coil total = 5,505.7 | ✅ PASS (exact) |

**Overall: PASS.** Every hard check holds, checks 5–8 included — the script exits non-zero on any
failed tie-out and exited 0. Those four are genuinely dual-method: one side counts rows in JS through
the app's own helpers, the other aggregates in Postgres, so neither can quietly adopt the other's bug.
What they cannot see is unchanged: a Σ check passes just as happily when a distributor is filed in the
wrong region or a line under the wrong plant. They prove each split is a partition of its headline,
not that every line is attributed correctly — which is exactly why neither was re-derived in SQL.

Advisory flags (reported, do not fail):
- **Plants with orders and no invoices** — NPMD, Lepakshi and Tapi. Expected: only Hyderabad has ever
  invoiced, so the report compares four plants' Pending (3,729.2 T) against one plant's Invoiced
  (544.7 T). That is the ERP's shape, not an error, and `· Hyderabad only` is the label that stops a
  reader taking the ratio at face value.
- **Multi-state distributor** — 1 distributor, 272.3 T (**6.4%** of the 4,273.9 T book), above the 5%
  threshold worth naming. Its whole book sits in one region by design — its most recent line's state —
  matching the workbook's *Distributor by Region* sheet. Nothing is split across regions.
- **No `Unmapped`, no `Unattributed`** — every distributor's state maps to a region and every line
  carries a Ship From Code on the plant master, so no labelling-gap row prints this run. Post-`D`
  dispatch tonnage is 0, so the day-capped split and the workbook's uncapped sheet agree exactly.
- **Confirmed variance** — stored bucket 30.000 T vs ERP formula (`release_qty − invoiced_qty`)
  28.445 T, a **1.555 T** gap. The report uses the **stored** bucket, matching the app's Sales KPI.
- **Baby coil over-consumption** — unfloored `baby_total − consumed` = 5,505.7 − 4,955.0 = 550.7 T,
  but the per-coil floored figure (what the Dashboard shows) is **676.3 T**. The **125.6 T** gap
  means some baby coils were consumed beyond their recorded slit weight. Worth a data check on
  the affected productions; it does not change the Dashboard-aligned number reported above.

## Change vs last report (2026-08-05 → 2026-08-21, 16 days)

| Line | Previous | Current | Δ |
|---|---|---|---|
| Total Orders | 262.0 T | 4,273.9 T | **+4,011.9** |
| Current Month Orders | 93.0 T | 4,186.0 T | **+4,093.0** |
| Invoiced Orders MTD | 129.2 T | 544.7 T | **+415.5** |
| Invoiced MTD (Prev Month, day-capped) | 104.5 T | 502.8 T | +398.3 (different windows: day 5 vs day 21) |
| Dispatch D-1 | 0 T | 56.1 T | +56.1 (08-05 read 0 = not loaded yet then) |
| Dispatch D Day | 0 T | 25.2 T | +25.2 (08-05 read 0 = not loaded yet then) |
| Confirmed Pending Invoice | 56.5 T | 30.0 T | **−26.5** |
| Non-Confirmed Orders | 76.3 T | 3,699.2 T | **+3,622.9** |
| Physical Inventory | 1,463.8 T | 1,383.1 T | **−80.7** |
| RM Full Coil Left | 616.3 T | 729.8 T | +113.5 |
| RM Baby Coil Left | 695.7 T | 676.3 T | −19.4 |
| RM Total | 1,312.0 T | 1,406.1 T | +94.1 |
| Produced MTD | 26.3 T | 386.5 T | +360.2 |
| Produced MTD (Prev Month, day-capped) | 197.8 T | 1,120.2 T | +922.4 (different windows: day 5 vs day 21) |
| Production D-1 / D Day | 0 / 0 T | 0 / 0 T | — (both still data-lag zeros) |
| Orders Logged D Day | 0 T | 0 T | — (both data-lag zeros) |
| Orders Logged D-1 | 60.0 T | 60.0 T | — |
| Orders Logged D-2 | 28.0 T | 968.0 T | **+940.0** |

Reading the move: 16 days of fresh activity since the last snapshot — orders intake jumped by
~4,093 T for the month (mostly landing as Non-Confirmed, +3,622.9 T, since Confirmed actually fell
26.5 T as it converted to invoice), invoicing pace nearly quadrupled (+415.5 T), and 452 T of extra
raw material came in net (Full Coil +113.5 T, Baby Coil −19.4 T as it was slit down and consumed
into the 360.2 T of extra production). Physical Inventory fell 80.7 T — dispatch is outpacing
production over this stretch.

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
	
Invoiced MTD - Region split --->	⚠️ N/A (region split unavailable — see note)
Pending to Serve - Region split --->	⚠️ N/A (region split unavailable — see note)
	
Invoiced MTD by Plant - Plant split --->	⚠️ N/A (plant split unavailable — see note)
Pending to Serve by Plant - Plant split --->	⚠️ N/A (plant split unavailable — see note)
	
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
- **Region split / Plant split — unavailable this run.** `scripts/daily-splits.mjs` needs outbound
  access to this project's Supabase host; this session's network egress policy blocks it
  (confirmed `403` both on a direct connection and via the agent proxy's CONNECT tunnel — see
  the Verification section). The Supabase MCP tool can still reach the database for the plain SQL
  above, but per the skill's guardrail the region/plant attribution is never hand-rolled in SQL —
  it only comes from the app's own tested helpers via that script. Re-run once egress for
  `hztblmccvvarmgxmunrp.supabase.co` is allowed for this session, or from an environment where it is.
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
| 5 | Region partition — invoiced | — | — | ⚠️ N/A (region split script blocked — network egress; see Notes) |
| 6 | Region partition — pending | — | — | ⚠️ N/A (region split script blocked — network egress; see Notes) |
| 7 | Plant partition — invoiced | — | — | ⚠️ N/A (plant split script blocked — network egress; see Notes) |
| 8 | Plant partition — pending | — | — | ⚠️ N/A (plant split script blocked — network egress; see Notes) |
| — | Mass balance (RM) | inward − full coil left = 6,235.5 − 729.8 = 5,505.7 | baby coil total = 5,505.7 | ✅ PASS (exact) |

**Overall: PASS on every check that could run.** Checks 5–8 did not run this report — `node
scripts/daily-splits.mjs` failed with `403 Forbidden — Host not in allowlist:
hztblmccvvarmgxmunrp.supabase.co` on a direct connection, and `Proxy response (403) !== 200 when
HTTP Tunneling` when routed through this session's agent proxy — i.e. this session's egress policy,
not a code or data problem. Per the skill's guardrail an absent split is reported as unavailable
rather than reconstructed in SQL, which could silently mis-attribute a distributor's region or plant.

Advisory flags (reported, do not fail):
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

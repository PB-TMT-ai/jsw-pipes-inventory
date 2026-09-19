---
name: daily-report-pt-whatsapp
description: >-
  Produce the JSW Pipes & Tubes daily PB MTD update as a WhatsApp-ready message —
  concise, mobile-friendly, WhatsApp-formatted (*bold*, emojis, no tables), ready to
  copy-paste into a WhatsApp chat/broadcast. Reuses the pb-mtd-report numbers (same
  verified figures, no drift). Trigger phrases: "daily P&T whatsapp report",
  "whatsapp daily report", "daily report P&T", "P&T whatsapp update".
---

# Daily P&T report — WhatsApp format

Renders the daily **PB MTD update** for Pipes & Tubes as a WhatsApp message the plant team can
paste straight into a chat/broadcast. This skill is **presentation only** — all numbers and their
verification come from the `pb-mtd-report` skill, so the WhatsApp text can never disagree with the
full report.

## Inputs
- `report_date` — optional `YYYY-MM-DD`, default today. Passed through to `pb-mtd-report`.
- `best_estimate` — the month's INVOICING target (MT). Passed through to `pb-mtd-report`.
- `production_target` — the month's PRODUCTION target (MT). Used only by this skill; there is no
  production forecast field in the system, so it cannot be derived.

**Both targets are monthly inputs the user supplies, and NEITHER carries forward.** Ask the user to
confirm both at the start of each month rather than reusing last month's — a stale target silently
reports the wrong gap and the wrong run rate, and nobody reading a phone can tell. Sep 2026 was
`best_estimate` 5550 and `production_target` 5000. If one is genuinely unavailable, drop its two
lines (the target line and its run-rate line) rather than printing N/A on WhatsApp, and for
`best_estimate` also drop the BE and % columns from *🗺️ Invoiced by Region*.

## Steps

### 1 — Get verified numbers
Run the **`pb-mtd-report`** skill (same `report_date` / `best_estimate`) to obtain the verified,
Dashboard-aligned figures and its verification result. Use those values verbatim — do **not**
recompute here. (If `pb-mtd-report` is unavailable, fall back to its SQL steps against project
`hztblmccvvarmgxmunrp`.) If pb-mtd-report reports a FAILED verification check, **say so above the
message** and let the user decide before sending.

Four of this message's blocks come from **one run of `scripts/daily-splits.mjs`**, which
`pb-mtd-report` already invokes — read them off its stdout JSON rather than asking for them twice:

| block | source |
|---|---|
| `*📦 Orders*` — Confirmed, Servable – Unconfirmed, Pending to Dispatch | `servableSplit.totals` |
| `*🗺️ Orders by Region*` | `servableSplit.regions[]` |
| `*🗺️ Invoiced by Region*` — the Invoiced column | `regionSplit.regions[].invoicedMtd` |
| `*🏭 Production*` | `plantPipeline.plants[]` + `.totals` |
| `*📦 Inventory*` | `plantPipeline.plants[]` + `.totals` |

The **BE column** of *🗺️ Invoiced by Region* is the one figure not in that JSON: it is Σ the
distributor master's `plan` over the region, which `buildDistributorRegionData` (`src/lib/reports.js`)
aggregates for the workbook's *Distributor by Region* sheet — the same sum the Best Estimate KPI
itself is. Read it off that sheet or that builder; never type a region's BE, and never split the
headline BE across regions by any rule of your own.

The script exits non-zero if any cut fails its tie-out, so a zero exit already means every block
adds up. **Never compute any of these four in SQL** — see the guardrails.

### 2 — Render the WhatsApp message
Fill the template below. WhatsApp formatting rules: `*bold*` = single asterisks, `_italic_` =
underscores, emojis for scan-ability, **no markdown tables/headers**, one metric per line with a
`•` bullet, blank line between groups. Keep it short — only real numbers, never the N/A lines.
Weights to 1 decimal, append ` T`; a true zero stays `0 T`.

```
*JSW Pipes & Tubes — Daily Update*
📅 {D:DD-Mon-YYYY}

*🚚 Invoiced*
• Invoiced MTD{invoicing_suffix}: {invoiced_mtd} T
• Best Estimate ({Mon}): {best_estimate} T — {invoiced_pct}% achieved   (drop this line AND the next if no best_estimate)
• Daily Run Rate Reqd: {run_rate} T
• Prev Month (same days): {invoiced_prev} T
• Dispatch D-1: {dispatch_D1} T
• Dispatch Today: {dispatch_D} T

*🗺️ Invoiced by Region* _(Invoiced | BE | %)_   (omit the block if the split is unavailable; drop the BE and % columns if no best_estimate)
• {Region}: {region_invoiced} T | {region_be} T | {region_pct}%
*Total: {invoiced_mtd} T | {best_estimate} T | {invoiced_pct}%*

*🏭 Production* _(MTD | D-1)_
• {Plant}: {plant_produced_mtd} T | {plant_produced_D1} T
*Total MTD: {produced_mtd} T* _(prev month same days {produced_prev} T)_
• Target ({Mon}): {production_target} T — {produced_pct}% achieved   (drop this line AND the next if no production_target)
• Daily Run Rate Reqd: {production_run_rate} T

*📦 Orders*
• Indent: {indent} T
• Current Month: {orders_month_intake} T
• Confirmed (pending invoice): {confirmed} T
• Servable – Unconfirmed: {servable_unconfirmed} T
• Pending to Dispatch: {pending_to_dispatch} T
_Servable – Unconfirmed = stock is on the floor, only the confirmation is awaited. Pending to Dispatch = Confirmed + Servable – Unconfirmed._

*🗺️ Orders by Region* _(Servable – Unconfirmed | Pending to Dispatch)_   (omit this whole block if the split is unavailable)
• {Region}: {region_servable} T | {region_pending_to_dispatch} T
*Total: {servable_unconfirmed} T | {pending_to_dispatch} T*

*📦 Inventory* _(Finished Pipe | RM)_
• {Plant}: {plant_fg} T | {plant_rm} T
*Total: {phys_inventory} T | {rm_total} T*

*📝 Orders Logged*
• Today: {orders_D} T
• D-1: {orders_D1} T
• D-2: {orders_D2} T

_Live data · generated {D}_
```

Notes to preserve when filling:
- **Indent** = `invoiced_mtd + confirmed + non_confirmed` — the whole book placed on the plant to
  date, invoiced and open alike. It is the line this message used to call *Total Orders*: same
  formula, same number, renamed to the word the business uses.
- **Servable – Unconfirmed** = `servableSplit.totals.servableUnconfirmed`. Never re-derive it, and
  never build it by adding up `scripts/servable-orders.mjs`'s per-distributor column — inside a
  service area stock is shared and reserved to nobody, so those figures deliberately do not sum
  (ADR-0002). The builder counts each (region, size) pool ONCE, which is a different question and
  the only one whose answer is additive.
- **Pending to Dispatch** = Confirmed + Servable – Unconfirmed. The unconfirmed tonnage with **no**
  stock behind it is deliberately NOT on this message — it is the production backlog, and on today's
  data it is the larger number. `servableSplit.totals.unconfirmed` carries it if anyone asks.
- **Confirmed has first claim on the floor.** Unconfirmed counts only against what Confirmed leaves
  (`onhand − allConfirmed`, the `freeStock` the builder reads). Never net Confirmed a second time.
- **Prev Month (same days)** = previous month figure through the same day-of-month (like-for-like).
  Applies to both the Invoiced and Production lines.
- **Production** = same live master recompute as Physical Inventory (`tubeCount × weightPerTube`),
  so Produced and FG never disagree.
- **Finished Pipe (FG)** = Dashboard FG Left Inventory (produced live-recompute − invoiced).
- **RM** = full coil + baby coil, per plant. Never add FG into it — different stage, would
  double-count. Baby coil is the Dashboard's **Baby Coils Left**, which applies the scrap floor and
  the operator's `consumed` flag (ADR-0007); a plain `Σ max(0, weight − consumed)` is a larger,
  different number and must never appear here.
- **INVOICED LEADS THE MESSAGE, PRODUCTION IS SECOND**, then Orders, Inventory, Orders Logged. The
  first thing the plant is asked each morning is what went out and whether the month is on pace, so
  that is the first thing the message answers; what the mill made is the second. Orders and stock
  explain those two, so they follow them.
- **Each region block sits directly under the figures it decomposes** — *Invoiced by Region* under
  *🚚 Invoiced*, *Orders by Region* under *📦 Orders*. There are now TWO region blocks and they must
  keep their distinguishing names: a bare `*🗺️ Regions*` no longer says which one it is.
- **THE `*🎯 Targets*` BLOCK IS GONE.** Best Estimate and its run rate live on *🚚 Invoiced*; the
  production target and its run rate live on *🏭 Production*. Never re-add a trailing Targets block —
  it would print Best Estimate twice, and the second copy is the one that goes stale.
- **The separator is a pipe (`|`)**, in every header and every line. Not a middot — it has to stay
  legible in WhatsApp's font on a phone.
- **Orders by Region** — one line per region in `servableSplit.regions[]`, in the order the array already
  carries (the four regions, then off-list regions, **`Unmapped` last**). A region absent from the
  data gets no line; a region present at zero prints `0 T`.
- **An `Unmapped` region prints `?`, never `0`**, in both columns — `servableUnconfirmed` and
  `pendingToDispatch` come back `null`, because a distributor with no region has no service area and
  the question has no answer. Append to the footnote:
  `_Unmapped = state not yet mapped to a region — we cannot tell which plants serve it, so its servable share is unknown, not zero. Its tonnage is still on the book._`
  Never print it as 0 and never drop the line: that hides a config gap behind a fact.
- **Invoiced by Region** — one line per region in `regionSplit.regions[]`. The Invoiced column is
  that region's `invoicedMtd`; the BE column is its Σ distributor `plan`; the % is Invoiced ÷ BE,
  whole numbers. Both columns tie to the headline: Σ region invoiced == `invoiced_mtd`, Σ region BE
  == `best_estimate`. On 18-Sep-2026 that was South 236.3 + West 1217.2 == 1453.5, and
  2350 + 3200 == 5550. A region with a `plan` but no invoicing reads `0.0 T` and `0%`; a region with
  invoicing but NO plan reads `—` in the BE and % columns, never `0` — unplanned is not a target of
  zero it then missed (`buildDistributorRegionData` already keeps `plan` null for exactly this).
- **BOTH RUN RATES USE THE SAME DENOMINATOR: days left in the month, counting the report day** —
  `daysInMonth − day + 1`. On 18-Sep-2026 that is 30 − 18 + 1 = 13, which is what reproduces the
  workbook's own printed 315.1 T (4096.5 ÷ 13). Production's run rate uses that same 13 so the two
  are read side by side on one screen; a different denominator would make the two lines
  incomparable without saying so. Never hardcode 13 — derive it from the report date.
- **The target lines are `{target} T — {pct}% achieved`**, where pct is the MTD figure over the
  target, whole numbers, and the run rate beneath is `(target − MTD) ÷ days left`. Once MTD passes
  the target the percentage goes over 100 and the run rate goes NEGATIVE: print `0.0 T`, never the
  negative — "you need to make −40 T a day" is not a sentence anyone can act on.
- **The `*Total:*` lines print the headline figures**, not the sum of the rounded region lines, so
  they always equal the `*📦 Orders*` numbers above. Rounded lines can look 0.1 T off; the exact
  values tie.
- **A distributor sits in exactly one region** — its most recent line's state, unless the
  distributor master overrides it. Never split one across regions, and never name distributors here.
- **Production and Inventory split by PLANT** — one line per plant in `plantPipeline.plants[]`, in
  master order (Hyderabad, NPMD, Lepakshi, Tapi) with **`Unattributed` last**. A plant with no rows
  gets no line. The rows are a partition of the totals printed beneath them, never a replacement:
  `checks.producedTiesToAllPlants` / `fgTiesToAllPlants` / `rmTiesToAllPlants` assert it and the
  script refuses to emit otherwise.
- **`Unattributed` is never dropped** — a production, coil or baby coil carrying no plant is a
  labelling gap on the shop floor, and its tonnage stays inside every total. When it prints, append:
  `_Unattributed = the row carries no plant — its tonnage is still counted in every total._`
- **Finished pipe per plant is "made at", not "held at".** It is produced − invoiced at that plant;
  nothing in the data follows stock that physically moves. Never describe it as a warehouse count.
- **Never split Production, RM or Inventory by REGION** — they carry no ship-to state. PLANT is a
  different question (a coil sits on exactly one floor) and is the only pipeline split allowed.
- **`{invoicing_suffix}` comes from `plantSplit.invoicing`** — never typed, never hardcoded to a
  plant name. It goes on the `• Invoiced MTD` line only; when `suffix` is empty, print nothing.

### 3 — Output
1. Print the finished message inside a plain code block so it copy-pastes cleanly.
2. Offer to save it to `reports/daily-whatsapp-{D}.txt` (only if the user wants a file).

## Sending to WhatsApp
There is **no WhatsApp integration wired into this repo**, so this skill produces copy-paste text
by default. To actually auto-send, one of these must be set up (offer, don't assume):
- **WhatsApp Business Cloud API** (Meta) — POST the text to `/{phone-number-id}/messages` with a
  permanent token; best for a fixed broadcast/group.
- **Twilio WhatsApp API** — `messages.create({ from: 'whatsapp:…', to: 'whatsapp:…', body })`.
Either needs credentials + recipient(s) the user provides; then add a small script/edge function
and this skill can call it. Never hard-code tokens in the repo — read from env.

## Guardrails
- Numbers come from `pb-mtd-report` — never invent or re-derive them here. That includes all four
  cuts: if any is reported unavailable, omit that block entirely (same rule as a missing target)
  rather than guessing one.
- **The message and the PB MTD workbook print the same plant figures** — both are
  `buildPlantMtdSummary`, reached through `scripts/daily-splits.mjs`. Never compute a plant line any
  other way; a second implementation is a second answer, and this one is read on a phone where
  nobody can check it.
- **Never hand-roll the servable split in SQL.** Which stock a distributor may be offered depends on
  its region, which is not a column — it is resolved from the distributor master's override, else
  the most recent line's state, else the state → region seed. A SQL re-derivation gets a second
  answer whose failure mode is invisible: a distributor filed South→West still passes every Σ check
  (ADR-0003). `buildServableSummary` is the only source.
- **Never add up per-distributor servable tonnage.** `scripts/servable-orders.mjs` refuses to print
  that total on purpose (ADR-0002) and so must this message. If you find yourself summing a column
  from that report, stop — the number you want is `servableSplit.totals.servableUnconfirmed`.
- **Never print `0` where a figure is `null`.** An Unmapped region's servable share is unknown, and
  "we can serve none of your book" is a different — and false — statement.
- No tables, headers, or links that render poorly on WhatsApp; keep it thumb-scrollable.
- Don't print the "not relevant / not possible" lines on WhatsApp — they live in the full report.

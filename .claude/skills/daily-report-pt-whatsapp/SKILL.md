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
- `best_estimate` — optional monthly target (MT). Passed through. If omitted, drop the
  "Best Estimate" and "Run Rate Reqd" lines from the message (don't print N/A on WhatsApp).

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
| `*🗺️ Regions*` | `servableSplit.regions[]` |
| `*🏭 Production*` | `plantPipeline.plants[]` + `.totals` |
| `*📦 Inventory*` | `plantPipeline.plants[]` + `.totals` |

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

*📦 Orders*
• Indent: {indent} T
• Current Month: {orders_month_intake} T
• Confirmed (pending invoice): {confirmed} T
• Servable – Unconfirmed: {servable_unconfirmed} T
• Pending to Dispatch: {pending_to_dispatch} T
_Servable – Unconfirmed = stock is on the floor, only the confirmation is awaited. Pending to Dispatch = Confirmed + Servable – Unconfirmed._

*🗺️ Regions* _(Servable – Unconfirmed | Pending to Dispatch)_   (omit this whole block if the split is unavailable)
• {Region}: {region_servable} T | {region_pending_to_dispatch} T
*Total: {servable_unconfirmed} T | {pending_to_dispatch} T*

*🚚 Invoiced / Dispatch*
• Invoiced MTD{invoicing_suffix}: {invoiced_mtd} T
• Prev Month (same days): {invoiced_prev} T
• Dispatch D-1: {dispatch_D1} T
• Dispatch Today: {dispatch_D} T

*🏭 Production* _(MTD | D-1)_
• {Plant}: {plant_produced_mtd} T | {plant_produced_D1} T
*Total MTD: {produced_mtd} T* _(prev month same days {produced_prev} T)_

*📦 Inventory* _(Finished Pipe | RM)_
• {Plant}: {plant_fg} T | {plant_rm} T
*Total: {phys_inventory} T | {rm_total} T*

*📝 Orders Logged*
• Today: {orders_D} T
• D-1: {orders_D1} T
• D-2: {orders_D2} T

*🎯 Targets*   (omit this whole block if no best_estimate)
• Best Estimate ({Mon}): {best_estimate} T
• Daily Run Rate Reqd: {run_rate} T

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
- **Regions sits directly under `*📦 Orders*`**, before Invoiced / Dispatch — it decomposes the two
  order figures printed above it, so it belongs beside them.
- **The separator is a pipe (`|`)**, in every header and every line. Not a middot — it has to stay
  legible in WhatsApp's font on a phone.
- **Regions** — one line per region in `servableSplit.regions[]`, in the order the array already
  carries (the four regions, then off-list regions, **`Unmapped` last**). A region absent from the
  data gets no line; a region present at zero prints `0 T`.
- **An `Unmapped` region prints `?`, never `0`**, in both columns — `servableUnconfirmed` and
  `pendingToDispatch` come back `null`, because a distributor with no region has no service area and
  the question has no answer. Append to the footnote:
  `_Unmapped = state not yet mapped to a region — we cannot tell which plants serve it, so its servable share is unknown, not zero. Its tonnage is still on the book._`
  Never print it as 0 and never drop the line: that hides a config gap behind a fact.
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
  cuts: if any is reported unavailable, omit that block entirely (same rule as `*🎯 Targets*`)
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

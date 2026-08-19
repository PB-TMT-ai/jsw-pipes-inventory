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
Dashboard-aligned figures and its verification result — including its **region split** (§2d:
`regionSplit.regions[]` and `.totals`) and its **plant split** (§2e: `plantSplit.plants[]`,
`.totals`, `.invoicing`). Use those values verbatim — do **not**
recompute here. (If `pb-mtd-report` is unavailable, fall back to its SQL steps against project
`hztblmccvvarmgxmunrp`.) If pb-mtd-report reports a FAILED verification check, **say so above the
message** and let the user decide before sending.

### 2 — Render the WhatsApp message
Fill the template below. WhatsApp formatting rules: `*bold*` = single asterisks, `_italic_` =
underscores, emojis for scan-ability, **no markdown tables/headers**, one metric per line with a
`•` bullet, blank line between groups. Keep it short — only real numbers, never the N/A lines.
Weights to 1 decimal, append ` T`; a true zero stays `0 T`.

```
*JSW Pipes & Tubes — Daily Update*
📅 {D:DD-Mon-YYYY}

*📦 Orders*
• Total Orders: {total_orders} T
• Current Month: {orders_month_intake} T
• Confirmed (pending invoice): {confirmed} T
• Non-Confirmed: {non_confirmed} T

*🗺️ Regions* _(Invoiced MTD | Pending to serve)_   (omit this whole block if the split is unavailable)
• {Region}: {region_invoiced} T | {region_pending} T
*Total: {invoiced_mtd} T | {pending} T*
_Pending to serve = Confirmed + Non-Confirmed (all-time open book); Invoiced is this month._

*🏭 Plants* _(Invoiced MTD{invoicing_suffix} | Pending to serve)_   (omit this whole block if the split is unavailable)
• {Plant}: {plant_invoiced} T | {plant_pending} T
*Total: {invoiced_mtd} T | {pending} T*
_{invoicing_note}_

*🚚 Invoiced / Dispatch*
• Invoiced MTD: {invoiced_mtd} T
• Prev Month (same days): {invoiced_prev} T
• Dispatch D-1: {dispatch_D1} T
• Dispatch Today: {dispatch_D} T

*⚙️ Production*
• Produced MTD: {produced_mtd} T
• Prev Month (same days): {produced_prev} T
• Production D-1: {produced_D1} T
• Production Today: {produced_D} T

*📝 Orders Logged*
• Today: {orders_D} T
• D-1: {orders_D1} T
• D-2: {orders_D2} T

*🎯 Targets*   (omit this whole block if no best_estimate)
• Best Estimate ({Mon}): {best_estimate} T
• Daily Run Rate Reqd: {run_rate} T

*📦 Inventory*
• Finished Pipe (FG): {phys_inventory} T
• RM — Full Coil: {full_coil_left} T
• RM — Baby Coil: {baby_left} T
• RM Total: {rm_total} T

_Live data · generated {D}_
```

Notes to preserve when filling:
- **Prev Month (same days)** = previous month figure through the same day-of-month (like-for-like).
  Applies to both the Invoiced and Production lines.
- **Production** = same live master recompute as Physical Inventory (`tubeCount × weightPerTube`),
  so Produced and FG never disagree.
- **Finished Pipe (FG)** = Dashboard FG Left Inventory (produced live-recompute − invoiced).
- **RM — Full Coil** = Dashboard "Full Coil Left" (whole, unslit mother coils).
- **RM — Baby Coil** = Dashboard "Baby Coils Left" (slit, not yet produced).
- **RM Total** = full coil + baby coil. Never add FG into it — different stage, would double-count.
- **Regions sits directly under `*📦 Orders*`**, before Invoiced / Dispatch — the split decomposes the
  order and invoice numbers, so it belongs beside them rather than at the foot of the message. The
  reader sees the regional shape before scrolling into Production and Inventory, which have no
  regional dimension at all.
- **The separator is a pipe (`|`)**, in the header and every line. Not a middot — it has to stay
  legible in WhatsApp's font on a phone.
- **Regions** — one line per region present in `regions[]`, in the order the array already carries
  (the four regions, then off-list regions, **`Unmapped` last**). A region absent from the data gets
  no line; a region present at zero prints `0 T`. With today's six-state seed that normally means
  South and West only — North and East are absent, not zero.
- **The `*Total:*` line prints the headline figures** (`invoiced_mtd`, `confirmed + non_confirmed`),
  not the sum of the rounded region lines — so it always equals the `*🚚 Invoiced / Dispatch*` and
  `*📦 Orders*` numbers above. Rounded region lines can look 0.1 T off it; the exact values tie.
- **A distributor sits in exactly one region** — its most recent line's state, matching the PB MTD
  workbook. Never split one distributor across regions, and never name distributors in this block.
- **When an `Unmapped` line prints**, append to the footnote:
  `_Unmapped = state not yet mapped to a region — its tonnage is still counted in every total._`
  If nothing is mapped at all, print the single Unmapped line plus
  `_No states are mapped to a region yet — set State → Region on the Sales tab._` Never drop the
  block silently; that would hide a config gap.
- **🏭 is the Plants block's**, so Production carries ⚙️ — one emoji per idea, or the eye stops
  telling the two blocks apart while scrolling. Nothing else about the Production block changed.
- **Plants sits directly under `*🗺️ Regions*`**, before Invoiced / Dispatch. Both blocks split the
  same pair of numbers (Invoiced MTD | Pending to serve), so they belong together — region says where
  the tonnage ships, plant says who makes it. Regions keeps its position: nothing a daily reader
  relies on moves, the plant split is added beneath.
- **Plants** — one line per plant in `plantSplit.plants[]`, in the order the array already carries
  (master order, **`Unattributed` last**). A plant absent from the data gets no line; a plant with
  orders and no invoices prints a real `0 T` — that zero is the point of the block. Today that is
  normally Hyderabad, NPMD, Lepakshi and Tapi with only Hyderabad invoicing.
- **`{invoicing_suffix}` and `{invoicing_note}` come from `plantSplit.invoicing`** — never typed.
  Print the suffix in the header (` · Hyderabad only`) and the note as the footnote. When `suffix` is
  empty, print neither: every plant with orders has also invoiced and there is nothing to explain.
  Never hardcode "Hyderabad" here — the day NPMD invoices, the strings change themselves.
- **The plant `*Total:*` line prints the same two figures the regions' one does**, because both
  blocks partition the same book. If they disagree, something is wrong upstream — say so above the
  message rather than sending it.
- **`Unattributed` is never dropped.** Same rule as `Unmapped`: a Ship From Code nobody has mapped is
  a labelling gap, and its tonnage stays inside every total. When it prints, append to the footnote:
  `_Unattributed = the ERP's Ship From Code is not on the plant master — its tonnage is still counted
  in every total._`
- **Never split Production, RM or Inventory by region or by plant** — they carry no ship-to state,
  and this message does not break pipeline figures down.

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
- Numbers come from `pb-mtd-report` — never invent or re-derive them here. That includes both splits:
  if pb-mtd-report reports either unavailable, omit that block entirely (same rule as `*🎯 Targets*`)
  rather than guessing one.
- **The message and the PB MTD workbook print the same plant figures** — both are
  `buildPlantMtdSummary`, reached through `scripts/daily-splits.mjs`. Never compute a plant line any
  other way; a second implementation is a second answer, and this one is read on a phone where
  nobody can check it.
- No tables, headers, or links that render poorly on WhatsApp; keep it thumb-scrollable.
- Don't print the "not relevant / not possible" lines on WhatsApp — they live in the full report.

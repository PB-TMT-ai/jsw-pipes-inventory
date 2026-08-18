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
`regions[]` and `totals`). Use those values verbatim — do **not**
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

*🚚 Invoiced / Dispatch*
• Invoiced MTD: {invoiced_mtd} T
• Prev Month (same days): {invoiced_prev} T
• Dispatch D-1: {dispatch_D1} T
• Dispatch Today: {dispatch_D} T

*🏭 Production*
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

*🗺️ Regions* _(Invoiced MTD · Pending to serve)_   (omit this whole block if the split is unavailable)
• {Region}: {region_invoiced} T · {region_pending} T
*Total: {invoiced_mtd} T · {pending} T*
_Pending to serve = Confirmed + Non-Confirmed (all-time open book); Invoiced is this month._

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
- **Regions** — one line per region present in `regions[]`, in the order the array already carries
  (the four regions, then off-list regions, **`Unmapped` last**). A region absent from the data gets
  no line; a region present at zero prints `0 T`. With today's six-state seed that normally means
  South and West only — North and East are absent, not zero.
- **The `*Total:*` line prints the plant figures** (`invoiced_mtd`, `confirmed + non_confirmed`), not
  the sum of the rounded region lines — so it always equals the `*🚚 Invoiced / Dispatch*` and
  `*📦 Orders*` numbers above. Rounded region lines can look 0.1 T off it; the exact values tie.
- **A distributor sits in exactly one region** — its most recent line's state, matching the PB MTD
  workbook. Never split one distributor across regions, and never name distributors in this block.
- **When an `Unmapped` line prints**, append to the footnote:
  `_Unmapped = state not yet mapped to a region — its tonnage is still counted in every total._`
  If nothing is mapped at all, print the single Unmapped line plus
  `_No states are mapped to a region yet — set State → Region on the Sales tab._` Never drop the
  block silently; that would hide a config gap.
- **Never split Production, RM or Inventory by region** — they carry no ship-to state.

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
- Numbers come from `pb-mtd-report` — never invent or re-derive them here. That includes the region
  split: if pb-mtd-report reports it unavailable, omit the `*🗺️ Regions*` block entirely (same rule
  as `*🎯 Targets*`) rather than guessing one.
- No tables, headers, or links that render poorly on WhatsApp; keep it thumb-scrollable.
- Don't print the "not relevant / not possible" lines on WhatsApp — they live in the full report.

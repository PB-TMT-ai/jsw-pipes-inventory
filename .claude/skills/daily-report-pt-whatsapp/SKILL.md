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

*📝 Orders Logged*
• Today: {orders_D} T
• D-1: {orders_D1} T
• D-2: {orders_D2} T

*🎯 Targets*   (omit this whole block if no best_estimate)
• Best Estimate (Jul): {best_estimate} T
• Daily Run Rate Reqd: {run_rate} T

*🏭 Inventory*
• Finished Pipe (FG): {phys_inventory} T

_Live data · generated {D}_
```

Notes to preserve when filling:
- **Prev Month (same days)** = previous month invoiced through the same day-of-month (like-for-like).
- **Finished Pipe (FG)** = Dashboard FG Left Inventory (produced live-recompute − invoiced).
- If today's data isn't loaded yet (Dispatch Today / Orders Logged Today = 0 because
  `report_date` is after the latest loaded date), add a final line:
  `⚠️ _Today's dispatch/orders not yet loaded_` so a 0 isn't read as "no business".

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
- Numbers come from `pb-mtd-report` — never invent or re-derive them here.
- No tables, headers, or links that render poorly on WhatsApp; keep it thumb-scrollable.
- Don't print the "not relevant / not possible" lines on WhatsApp — they live in the full report.

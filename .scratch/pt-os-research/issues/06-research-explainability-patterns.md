# Decision inventory: what the cockpit exists to decide

Type: grilling
Status: resolved
Blocked by: —

## Question

Which recurring decisions does the command centre exist to serve?

This is the spine of the whole map. Screens, the action queue, the deviation set and every logic-reveal hang off it — a cockpit organised around data sources ages badly; one organised around decisions does not.

For each decision, pin down:

- **The call being made** — stated as a choice, not a topic. "Which families run on Mill 2 next week" not "campaign planning".
- **Cadence** — daily, weekly, at month-lock, ad hoc on a trigger.
- **Inputs** — what must be true and known before it can be made.
- **Output** — what changes in the world once it's made, and where that lands.
- **The logic** — the rule or reasoning that produces the answer, and whether it is currently written down, in someone's head, or genuinely judgement.
- **Cost of getting it wrong** — this ranks the screens later.

Seed set to interrogate and correct, drawn from the physical chain:

1. How much to make next cycle, of which families, on which mill.
2. Which orders to release now versus hold.
3. Whether a distributor's estimate should be believed.
4. Which distributor needs chasing this week, and about what.
5. What to hold as finished stock versus make-to-order.
6. When to intervene on a campaign that is running behind.
7. Whether a month is tracking to plan mid-month, and what lever to pull if not.

Push back on any that are not really the owner's decisions, and surface the ones missing.

**Done when**: a ranked table of decisions, each with cadence, inputs, output, logic-status and cost-of-error — enough that a screen map can be derived from it rather than invented.

## Answer

Resolved by grilling, 2026-08-01.

### The headline finding

**This is not a decision-making system. It is a watching system with one real decision inside it.**

Of the seven candidate decisions, the owner makes exactly one. The rest he either monitors, or they are settled elsewhere by process or by payment. The design consequence is large: the home screen should be built around the owner's week, not around a menu of modules, and screen weight should follow the ranking below rather than spreading evenly across the physical chain.

### Rank 1 — Which distributors to chase this week

The only genuine owner decision in the system.

| | |
|---|---|
| **Cadence** | Weekly |
| **Trigger** | A distributor has an expected order for which **money has not been received**. "Confirmed" in this business means payment arrived — not that a purchase order exists. |
| **Output** | Communicated to the **sales manager and the sales team**, who do the chasing |
| **Logic status** | To be supplied by the user from base data sheets — deliberately not elicited here |
| **Cost of error** | Directly lost volume in the month |

Design consequences:
- The system's most valuable output is a **weekly chase list**, not a dashboard. Ranking that list is the highest-value ranking problem in the effort.
- The owner does not act on this himself — he hands it off. So the AI drafting mode has an immediate, concrete job: draft the message to the sales manager. This is the first place AI earns its place.
- **Money-received data is required.** Note the boundary carefully: *credit and receivables* (outstanding, ageing, limit breach) remain out of scope, but *payment-received against an expected order* is now load-bearing for the top-ranked decision. Different data, different purpose, no contradiction — but the feed is mandatory.

### Rank 2 — Whether to intervene on a campaign

| | |
|---|---|
| **Cadence** | Every 7 days |
| **Owner role** | Monitors; intervenes when it runs behind |
| **Cost of error** | Missed availability, which feeds back into lost orders |

### Rank 3 — Planned versus actually produced, by SKU

Raised by the user unprompted, which is a strong signal of felt pain. Watch what was *meant* to be produced against what *was* produced, at SKU level. Pairs naturally with Rank 2 on the same weekly rhythm.

### Explicitly not owner decisions

- **How much to make, of what, on which mill** — falls out of campaign planning once that process is settled. The owner then only monitors. Campaign planning still needs designing, but as a *process the system shows*, not a choice the system asks the owner to make.
- **Which orders to release** — payment decides. The owner stated he has no control here. Not a decision surface; at most a status.
- **Whether to believe a distributor's estimate** — [out of scope](11-estimate-reliability-score.md).

### Open gap

- **Stock versus make-to-order** — "no idea about this." Nobody is deciding it today. Recorded as a genuine gap rather than an answered question; it may be an opportunity, but it is not a current need and should not drive design.
- **Whether the month is tracking to plan** — not answered directly, but implied by the weekly monitoring rhythm. Left to [The time spine](02-time-spine.md) to settle.

### The rhythm this implies

Everything the owner does is **weekly**, not daily and not monthly: chase list weekly, campaign check every 7 days, planned-versus-produced weekly. The cockpit's natural heartbeat is a week, with the month as the accounting frame around it. [The time spine](02-time-spine.md) should start from that rather than from the monthly estimate cycle the prior research assumed.

# The time spine: what "current month" and "different months" mean

Type: grilling
Status: claimed
Blocked by: —

## Question

What is the cockpit's time skeleton?

**Start from the week.** [Decision inventory](01-decision-inventory.md) found that everything the owner actually does runs on a 7-day rhythm — chase list weekly, campaign check every 7 days, planned-versus-produced weekly — with the month as the accounting frame around it. Do not inherit the monthly estimate cycle the prior research assumed as the primary spine; test it against the weekly reality first.

The user asked for "different months view, current month views" — but a month is not one thing. Mid-month it is a race against a target; at close it is a scorecard; three months back it is a trend point. Each needs a different screen, and they must agree on where the boundaries sit.

Pin down:

- **Operating month boundaries** — calendar month, or a cycle that starts at the estimate window? Fiscal-year alignment (Apr–Mar) for comparison views.
- **The cycle calendar** — when the estimate window opens and locks, when the campaign plan freezes, when dispatch closes, when the month is declared final. Prior research assumed a D22–27 estimate window and a monthly cycle; confirm against actual practice rather than inheriting it.
- **Mid-month state** — what "current month" shows on day 8 versus day 24. Run-rate projection, pace-versus-target, or committed-versus-open? Decide whether the screen extrapolates and how honestly it shows that it is extrapolating.
- **Immutability** — once a month closes, do its numbers freeze? Late invoices and returns will otherwise silently rewrite history and break every trend.
- **Which comparisons are meaningful** — month-over-month, same-month-last-year, rolling three, versus plan. Seasonality is strong (monsoon trough Jun–Sep, Q4 fiscal peak), so naive MoM will mislead.
- **Retention horizon** — how far back the cockpit lets you go.

**Done when**: the cycle calendar is written down with named checkpoints, the mid-month/closed-month distinction is resolved, and the default comparison basis for trend screens is chosen.

## Scope correction (user, 2026-08-01)

The user redirected mid-grilling: **"these rules and logics will be shared later. we are focusing on the UI and architecture."**

So this ticket splits. The **business calendar** — estimate window dates, campaign freeze, month-close day, retention horizon — is deferred to the user and is **not** answered here. What is answered is the **shape of time on screen and underneath it**, designed so that whatever dates arrive later drop into named slots without any screen being redrawn.

Do not re-ask the date questions. They are listed under *Still with the user* below.

## Answer (in progress)

Settled by grilling, 2026-08-01.

### 1. The month is the calendar month

1st to last day, matching the accounting books and the ERP. Every other date the user supplies later — estimate window, plan freeze, close — becomes a **named marker inside** a calendar month, never a competing definition of one. Rejected: a working month starting at the estimate window, which would put every figure about a week out of step with the accounts.

### 2. Weeks are fixed Monday–Sunday

Not a rolling last-7-days window. A week keeps its meaning, so week-on-week comparison is sound and week boundaries line up with campaign date ranges like `4–8 Aug`.

### 3. There is no fixed review day

The owner looks whenever he looks — contradicting the assumption in [Decision inventory](01-decision-inventory.md) that the weekly rhythm implies a weekly sitting. The rhythm is weekly; the *visit* is irregular. The cockpit must therefore be correct on any day of any week, and cannot open with "it's Monday, here's your week."

**Offered and declined**: a *what's changed since you last looked* layer over the fixed weeks. _Consequence, accepted_: after a gap of a week or more the cockpit gives no help finding what was missed — the user hunts for it. If catching up after absence later proves painful, this is the first thing to revisit.

### 4. One period control governs the whole cockpit

A single bar directly under the tabs sets the period for every view at once. Rejected: a period selector per table, which lets two blocks on one screen sit on different periods and quietly break the standing rule that figures must reconcile across views.

Consequences, now built into the prototype:

- The per-view week/month toggle that used to sit inside Campaign monitoring is **removed**; that view now answers to the global control like everything else. This is the visible proof of the rule.
- **Forward-looking views declare their offset.** Campaign planning and Coils to order are inherently about the *next* period, so with July selected they show August and say so in their headings. The selected period is the anchor; a view may sit at anchor+1, but never silently.
- The bar states the period's **condition** next to its name — `Running · day 28 of 31`. This is where the mid-period/closed-period distinction lives, and it answers that part of the ticket without needing the business dates: the period itself declares whether it is still moving.
- The **Read** narration is grain-aware. On the week it reads 85.3% and clears the floor; on the month it reads 84.6% and does not. Same data, one control, opposite conclusions — the strongest argument in the prototype for why the period control must be global and explicit.

### 5. What the box offers — deferred

Week / Month / Year with step-back and step-forward arrows is **built as a proposal**, with Year disabled. The user said "will decide later". Not settled.

## Still with the user

Deferred by the user, not by omission:

1. Estimate window open and lock dates (research assumed D22–27; unconfirmed).
2. When the campaign plan freezes.
3. When a month is declared final, and whether closed months freeze against late invoices and returns.
4. Fiscal-year alignment for annual comparison (Apr–Mar assumed, unconfirmed).
5. Default comparison basis for trend screens — month-over-month, same-month-last-year, rolling three, versus plan.
6. Retention horizon.

## Defect found and fixed

The prototype's header read `Week 31 · Mon 28`. **28 July 2026 is a Tuesday.** Week 31 is correct and runs Mon 27 Jul – Sun 2 Aug. Header now reads `Today · Tue 28 Jul 2026`.

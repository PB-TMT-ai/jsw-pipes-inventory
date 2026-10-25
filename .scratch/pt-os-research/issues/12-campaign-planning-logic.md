# Campaign planning logic and its visible rationale

Type: grilling
Status: resolved (2026-08-04)
Blocked by: 02, 04 — both cleared

## Question

How is the campaign plan formed, and how is its reasoning made visible?

The user asked for "campaign planning based on the distributors' orders and best estimate", and separately for the logic behind every decision to be inspectable. Campaign planning is where those two demands bite hardest — it is the most consequential output of the system and the least obvious to justify.

Decide:

- **The demand input** — how confirmed orders and forward estimates combine into the quantity a campaign is planned against. Note that estimates now enter at face value: distributor reliability scoring is [out of scope](11-estimate-reliability-score.md), so decide whether any aggregate-level guard remains (a cap, a plausibility band against history) or whether estimates are taken as given.
- **Grouping** — what makes SKUs shareable in one campaign: coil width, size band, thickness ladder, grade, finish. Taken from the capability matrix in [Plant and mill configuration](04-plant-mill-configuration.md) and the mechanics in [01-planning-flow.md](../../pt-os-research/briefs/01-planning-flow.md).
- **Sequencing** — the order campaigns run within a cycle, and what the sequence is optimising: changeover time, due dates, or stock cover.
- **The two planning levels** — established while prototyping, 2026-08-01, after the user asked why campaign decisions carried no thickness. Run-or-defer is decided at **SKU family** level because minimum campaign size is a *size*-changeover economics question; the thickness ladder is planned **inside** the campaign, where changeover is comparatively cheap. Both levels must be on screen. Open questions this raises: does a thickness that is individually tiny still get made because the family is running, or does it have its own floor? And is the ladder always one-directional (thin → thick), or does the mill run it either way?
- **The min-tonnage problem** — what happens when demand for a family falls below the minimum economic campaign. Defer to next cycle, run short and eat the cost, or aggregate across plants. This decision creates the stockouts distributors will complain about, so its rationale must be the most visible thing on the screen.
- **Mill selection** — the rule when several mills can make a family.
- **Frozen versus open horizon** — how far ahead the plan is committed and where it stays fluid, with the cut-off that separates them.
- **The artifact** — what the plan looks like when published. The research's strongest single find is the Nucor/Atlas-style size-by-week rolling program with per-family open/closed status and order cut-offs. Decide whether this cockpit produces that artifact, and whether it is internal-only given the distributor portal is out of scope.
- **The rationale view** — for any family in the plan, what explains its placement, its quantity, and why anything that did not make the cut was excluded.

**Done when**: the plan-forming rule is written down end to end, the min-tonnage policy is chosen, and the rationale view is specified concretely enough to prototype.

## Answer

Settled 2026-08-04, once [04](04-plant-mill-configuration.md) supplied the real plant configuration. The rule below is written against **one plant, one mill, 12 hours a day, 4.32 t/h effective**.

### The plan-forming rule, end to end

```
1  DEMAND     = max(orders, sales) per family × month
                estimates enter AT FACE VALUE — reliability scoring is
                out of scope, so inflation propagates unchallenged
2  GROUP      by strip width, then thickness ladder inside the size
3  BUDGET     available hours = production days × 12 h
                demand hours  = demand MT ÷ 4.32 t/h
4  LEVEL 1    per FAMILY, on SIZE — run if the family clears 20 MT
                AND its hours fit the remaining budget
                else DEFER to next cycle
5  LEVEL 2    per GAUGE, inside a running family — run if the lot
                clears 3 MT, else DROP
6  UPLIFT     planned may exceed demand — deliberate cushion, a choice
7  SEQUENCE   adjacent sizes to minimise stand swaps, thickness ladder
                within a size                       [direction unverified]
8  ARTIFACT   size × week rolling program, one mill, per-family
                O / C / I / PS status, order cut-offs, refreshed weekly
```

### The binding constraint is hours, not tonnage

The most important correction this ticket makes. At a 20 MT family floor, **Level 1 defers nothing** — all 16 families produced in July 2026 cleared it, the smallest by 9.5 MT. The tonnage floor is close to vacuous at these volumes.

```
July 2026   demand    1,400.3 MT ÷ 4.32 t/h  =  324.1 h needed
            available 27 days × 12 h         =  324.0 h
```

The mill is exactly full. Deferral is forced by the **hour budget**; the tonnage floor is a sanity check that rarely fires. Level 1 must therefore carry a running cumulative-hours column, and that column — not the floor — is where a family falls out.

### The min-tonnage problem — answered

Floors are **20 MT per family, 3 MT per SKU** (user, 2026-08-04). July actuals: 16 of 16 families and 50 of 51 gauges cleared them, the single exception a CHS 42.4 lot at 2.1 MT that was made anyway.

Because the floors almost never bind, the feared consequence of this ticket — *"this decision creates the stockouts distributors will complain about"* — **does not materialise from the floors**. It materialises from the hour budget. The rationale that must be most visible on screen is therefore "the mill ran out of hours", not "your size was too small to make".

### Both planning levels — confirmed by observation

The two-level model was established while prototyping and is now confirmed against real mill behaviour. July 2026 ran **1–3 sizes per day and 1–4 gauges per day**: size changes 1–2 a day, gauge changes 2–4 a day. The mill already works the way the screen describes.

The open question this ticket raised — *does a thickness that is individually tiny still get made because the family is running?* — is answered: **it has its own floor, but the floor is 3 MT, not 40.** In practice a gauge is dropped roughly once a month.

### Mill selection — moot

There is one mill. The rule this ticket asked for has no subject. Remove it from the logic and remove the mill column from the screen.

### Demand input, grouping, rationale view

Unchanged from where prior tickets left them, and not re-litigated here:

- **Demand** — read as the higher of orders and sales, because campaign shortages censor sales downward and perpetuate themselves ([05](05-research-forecasting-methods.md)). Estimates at face value; no aggregate guard was added, since [11](11-estimate-reliability-score.md) is out of scope.
- **Grouping** — strip width first, thickness within size ([synthesis.md](../synthesis.md) §2).
- **Rationale view** — the `Basis` component from [06](06-research-explainability-patterns.md): dotted underline, one visible line of substituted arithmetic, right-docked rail one interaction deep, every explanation terminating in a drillable operand with a named source.

## Still open

- **Sequencing has no objective function.** The 4.32 t/h rate absorbs changeover, so the capacity plan reconciles, but minutes-per-size-change and minutes-per-gauge-change were not gathered ([04](04-plant-mill-configuration.md) *Still open*). Campaigns can be ordered but not optimised, and the thickness ladder's direction stays unverified.
- **Frozen versus open horizon.** Depends on the campaign-freeze date, which the user deferred in [02](02-time-spine.md) *Still with the user*.
- **The artifact's audience.** Whether the rolling program stays internal or goes distributor-facing is unresolved; the distributor portal is out of scope, which argues internal for now.
- **The second shift.** The mill uses 12 of 24 hours. Doubling the shift roughly doubles capacity to ~2,800 MT/month, which would change every deferral decision this logic produces. Whether that lever is available is a business question nobody has asked.

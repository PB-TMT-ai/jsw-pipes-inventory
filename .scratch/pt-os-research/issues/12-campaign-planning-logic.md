# Campaign planning logic and its visible rationale

Type: grilling
Status: open
Blocked by: 02, 04

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

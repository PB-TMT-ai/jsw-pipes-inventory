# The action-required model

Type: grilling
Status: open
Blocked by: 01

## Question

"Monitor sales and action required" is half the brief. The research is emphatic that this is where systems like this die: dashboards without a response mechanism decay into wallpaper.

Decide:

- **The raise condition** — what causes something to demand attention. A threshold crossing, a trend, a missed checkpoint, or a compound condition. Be specific enough to encode.
- **The shape** — is this a queue you work down, an inbox that fills, or annotations on the screens where the problem lives? Each implies a different system.
- **Ranking** — when five things need attention, what orders them. Value at risk, time-criticality, or decision cost. This is the difference between a useful list and an anxiety generator.
- **The lifecycle** — how an item is acknowledged, acted on, snoozed, or dismissed. Whether dismissing is recorded. Whether it comes back.
- **Persistence across the cycle** — what happens to an open item at month close.
- **Volume control** — the realistic daily count. If it exceeds what one person can act on, the thresholds are wrong and the system must say so rather than flood.
- **Ignoring** — what the cockpit does when an item is repeatedly ignored. Escalate, decay, or stay silent.

Single seat matters here: there is no one to escalate *to*. The design must handle "the only person who can act has not acted" honestly.

**Done when**: the shape is chosen, raise/rank/close rules are specified, and the expected daily volume is estimated against real history.

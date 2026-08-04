# Plant and mill configuration: the capability matrix

Type: task
Status: open
Blocked by: —

## Question

"Prepared for different plants and their configurations" only means something once the configurations are known. Campaign planning is notional wish-listing until these numbers exist.

Fact-gathering from the plants — HITL, the agent cannot source this.

Gather, per plant and per mill:

- **Capability envelope** — section shapes, size range and wall-thickness range the mill can run. Which mills overlap (this decides whether there is a choice of where to make a family).
- **Minimum economic campaign tonnage** — per family or per size band. The single most load-bearing number in campaign planning: it decides what cannot be made this cycle regardless of demand.
- **Changeover cost** — time lost changing size, and separately changing thickness. Whether a thickness ladder (running thin→thick or the reverse) is observed and why.
- **Throughput** — tonnes per hour or per shift by size band, and available hours per month after planned maintenance.
- **Yield / scrap** — typical percentage, and whether it varies by size or thickness.
- **Downstream constraints** — galvanizing line capacity and batch size if GI is made, slitting constraints, any coil-width dependency that couples families together.
- **Practical exceptions** — what the plant actually does that contradicts the above.

**Done when**: a capability matrix exists — mill × size × thickness with min tonnage, changeover, throughput and yield — good enough for [Campaign planning logic and its visible rationale](12-campaign-planning-logic.md) to produce a plan a plant head would not laugh at.

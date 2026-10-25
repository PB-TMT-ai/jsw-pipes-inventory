# Plant and mill configuration: the capability matrix

Type: task
Status: resolved (2026-08-04)
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

## Answer

Settled 2026-08-04. The matrix collapses to a single row, and the ticket closes.

### The estate

**One plant, one mill** (user, 2026-08-04): Hyderabad, a single tube mill, running **12 hours a day**. There is no estate. Raipur, Bhiwadi and Hosur — the three plants and six mills carried in the design dataset — were **invented for the prototype** and describe nothing real.

Everything in this ticket that presumed a choice of where to make a family is therefore moot: capability overlap, mill selection, and the whole mill × size × thickness shape of the matrix. There is one capability envelope, and it is the mill's.

### Throughput — measured, not gathered

Derived from real production in the Pipes and Tubes Inventory System (Supabase `hztblmccvvarmgxmunrp`, table `productions`), not from the plant:

| Month | MT | Production days | MT/day | Effective t/h @ 12 h |
|---|---|---|---|---|
| May 2026 | 1,211.2 | 24 | 50.5 | 4.21 |
| Jun 2026 | 1,373.4 | 27 | 50.9 | 4.24 |
| Jul 2026 | 1,400.3 | 27 | 51.9 | **4.32** |

**4.32 t/h** is the planning rate. It is an *effective* rate — changeover is already absorbed into it, which is what makes it the right number for a capacity check and the wrong number for sequencing.

The research's 12 t/h ([01-planning-flow.md](../briefs/01-planning-flow.md), worked example) is **2.8× too high**. It is a large-mill figure and never applied to the 12.5–100 mm sections this mill runs. Delete it wherever it was used.

### Capacity

```
27 production days × 12 h × 4.32 t/h  =  ~1,400 MT/month     ← current pattern
```

July produced 1,400.3 MT against a 324-hour budget and consumed 324.1 hours. **The mill is exactly full at the current shift pattern.** The `89.2% used` figure in the design dataset was never mill time and cannot be reconciled with hours; treat it as a commercial or AOP allocation and keep it out of any hour arithmetic.

**Headroom**: 12 of 24 hours are used. A second shift takes the mill to roughly **2,800 MT/month**. This is the largest single capacity lever in the business and appears on no screen.

### Minimum economic campaign tonnage

Stated by the user, 2026-08-04:

| Level | Floor |
|---|---|
| Family (size) | **20 MT** |
| SKU (family × thickness) | **3 MT** |

Tested against July 2026 actuals:

- **16 of 16 families** cleared the 20 MT floor. Smallest: RHS 50x25 at 29.5 MT.
- **50 of 51 gauges** cleared the 3 MT floor. One exception: a CHS 42.4 lot at 2.1 MT, made anyway.

The plant already obeys these rules, with one sub-floor lot in a month. The floors are real operating constraints, not aspirations.

## Consequence — the binding constraint is hours, not tonnage

At a 20 MT floor, Level 1 defers **nothing**: all 16 families pass. As a run-or-defer gate the tonnage floor is close to vacuous on these volumes.

```
July demand   1,400.3 MT ÷ 4.32 t/h  =  324.1 h needed
Available     27 days × 12 h         =  324.0 h
```

Deferral is forced by the **hour budget**, not the floor. [Campaign planning logic](12-campaign-planning-logic.md) and the Level 1 block of the [campaign planning screen](17-campaign-planning-screen.md) must both test hours; the tonnage floor stays as a sanity check that rarely fires.

## Still open — the one input that did not arrive

**Changeover cost.** The 4.32 t/h rate absorbs changeover, so the capacity plan reconciles, but rolling time cannot be separated from changeover time. July ran **15 size changes and roughly 35 gauge changes**. Without minutes-per-size-change and minutes-per-gauge-change, campaign sequencing can be ordered but not optimised, and the thickness-ladder direction (thin→thick or either way) stays unverified.

Not gathered, and out of scope rather than missing: **yield/scrap** (the coil block assumes 96%, unverified), **galvanizing** (GI is not in the product range — see [01-planning-flow.md](../briefs/01-planning-flow.md)), and **planned maintenance hours**.

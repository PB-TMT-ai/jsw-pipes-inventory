# P&T Operating System — knowledge pack

Everything of substance from the "P&T Operating system" project, exported 2026-08-04 for reuse in another project. Documents only — no session logs, no browser/tooling state.

*Last updated 2026-08-04 — added the campaign-planning parameters research and a plain-English primer.*

**Domain**: steel pipes & tubes (ERW / structural, coil-fed tube mills), multi-plant, distributor channel, ~250 SKUs / 75–80 core SKU families. The system's job: visibility, monitoring, deviation highlighting, and campaign planning along the chain *distributor estimate → order → demand plan → mill campaign → dispatch*.

## Reading order

0. **New to steel tube manufacturing?** Start at `01-context/campaign-planning-explained-simply.md` — plain English, no jargon, ~5 minutes. It explains why campaign planning works the way it does. Skip if you already know the domain.
1. `01-context/CONTEXT.md` — the fixed vocabulary. Read this first, always. Estimate ≠ Order, Distributor ≠ Dealer, Primary ≠ Secondary sale. Every other doc assumes these.
2. `02-research/01-synthesis-READ-FIRST.md` — the verdict: buy-the-edges, build-the-brain. Six cross-brief convergences.
3. `01-context/command-centre-map.md` — the design effort's scope, standing constraints, and ticket index.
4. Then dive by need — briefs for evidence and formulas, design tickets for locked decisions.

## What's in each folder

| Folder | Contents |
|---|---|
| `01-context/` | Domain vocabulary (`CONTEXT.md`), the plain-English primer, and the Command Centre design map with standing constraints |
| `02-research/` | 4 foundation briefs + synthesis, plus 3 follow-up research docs (campaign-planning parameters, forecasting methods, explainability patterns) and worked numeric examples |
| `03-design-decisions/` | ADR-0001 (campaign planning = gauge matrix) and 17 design tickets — the decision record |
| `04-prototypes/` | 5 working HTML prototypes + the local server that persists edits |
| `05-repo-conventions/` | How the source repo organised issues, triage labels, and domain docs. Optional — process, not content. Its `CLAUDE.md` is kept as `source-repo-CLAUDE.md` so Claude Code does not load it as live instructions for this repo. |

### 02-research — the load-bearing material

| File | What it gives you |
|---|---|
| `briefs/01-planning-flow.md` | Five-layer planning flow, campaign mechanics and cycle frequency, Nucor-style **published rolling program**, FVA-disciplined forecast rollup, fair-share allocation, runner/repeater/stranger policy — with worked numbers |
| `briefs/02-systems-landscape.md` | Build-vs-buy per layer; what APL Apollo (Sarathi), Tata Steel, JSW actually built |
| `briefs/03-domain-expertise.md` | SKU attribute tuple + coding scheme, price-circular decomposition, scheme/claim mechanics, monthly indent calendar, seasonality |
| `briefs/04-deviations-kpis.md` | **16-deviation catalog** with owners/cadences, exact metric formulas with edge cases, encoding specs for the 5 priority deviations, thresholds and escalation |
| `campaign-planning-parameters.md` | **The physical mechanics of campaign sequencing** — which parameters drive roll-set changes, the changeover cost matrix, the T/D band constraint, sequencing algorithm, cut-off logic, multi-mill allocation, and a full worked fortnight at Bhiwadi. 52 cited sources. Newest and most implementable. |
| `forecasting-methods.md` | Forecast method selection for this SKU profile, backtesting approach |
| `explainability-patterns.md` | How to make every number show the rule that produced it (a hard requirement of this system) |
| `worked-example.md`, `full-chain-example.md`, `step4-deep-dive.md`, `simple-flow.md` | End-to-end numeric walkthroughs |
| `local-stack.md` | Local runnable stack options |
| `00-research-spec.md` | Original research brief — the quality bar that was set |

### 04-prototypes

Open the HTML files directly in a browser to view. **Exception**: `campaign-matrix.html` needs `serve.py` running to persist edits (it POSTs overrides to a local endpoint):

```bash
python serve.py
```

| File | What it shows |
|---|---|
| `campaign-matrix.html` | The main one — editable family × gauge matrix, one plant at a time, override-with-reason workflow, change log, persistent state |
| `command-centre.html` | Cockpit screen — filters, BASIS/GRAIN declarative data, sidebar rail for metric derivation |
| `grid-shapes.html` | Grid layout explorations |
| `visual-language.html` | The visual system — console density, reconciling tables |
| `control-tower.html` | Earliest sketch. Prior art to react to, **not** a baseline — its dark palette failed WCAG AA contrast |

## Carry these forward

Decisions already made and worth not re-litigating:

- **Estimates and orders are separate, immutable snapshots.** The single most load-bearing data-model decision — three independent briefs converge on it.
- **Allocation keys to trailing 3-month actual offtake, not to raw estimates.** Neutralises indent inflation.
- **The campaign calendar is a published artifact**, not internal output. Distributors book against it.
- **Every number must be able to show its derivation rule.** Hard requirement — see `explainability-patterns.md` and design ticket 15 (derivation object contract).
- **Single seat, owner/MD.** No auth, roles, permissions, or concurrency anywhere in the design.
- **Finish dimension is out of scope** — everything is black ERW, no GI. Raw material (coil requirement, stock, order-by dates) *is* in scope.
- **Campaigns group by roll set, and the roll set is set by diameter** (mother-round diameter for square/rectangular sections). Gauge is the cheap axis. This is the physical basis of the whole matrix — see `campaign-planning-parameters.md`.
- **Coil is ordered per matrix cell, not per family.** Strip width depends on gauge as well as size, so 40 NB needs 145.6 / 143.7 / 141.2 mm at 2.6 / 3.2 / 4.0. With ~14 days coil lead time, the campaign cut-off is `campaign_start − 14d coil − 2d slitting − 1d buffer`.

## The blocking open question

**Do the mills need a roll change to move between sizes at constant gauge?**

Some tube mills use a versatile edgeform breakdown where one roll set covers several diameters provided gauge is held constant. On such a mill a campaign is a matrix **column**, not a row — the inverse of what ADR-0001 assumes.

The question to put to the plant: *"On Mill 2, do we change breakdown rolls going from 40 NB to 50 NB?"*

- **Yes** → ADR-0001 stands as written.
- **No** → ADR-0001 needs a successor, not an amendment.

Cheap to ask, expensive to get wrong. Worth resolving before building further on the matrix.

## Known gaps

- Deviation set was still v1 at export; the full 16-deviation catalog in the brief is ahead of what the prototypes implement.
- `03-design-decisions/design-tickets/16-june-baseline-defect.md` records an open data defect.
- Prototype accessibility: the dark palettes across design variants failed WCAG AA contrast checks and were not fully remediated.
- **The T/D band is not yet reflected in the prototype.** Roll manufacturers put a single breakdown design's comfortable range at thickness ÷ diameter ≈ 3–8%. Against this project's own families, 40 NB × 4.0 sits at 8.3% and light-gauge 100×100 SHS at 1.6–2.6% — so gauge steps within one row are *not* uniformly cheap. The matrix currently treats them as equal.
- **No Indian tube maker publishes a rolling programme.** All published-calendar evidence is North American (Atlas Tube, Nucor-Yamato). Searched for and not found.
- **One source needs a re-read**: the Nucor HSS availability PDF returned an empty file, so its frequency bands come from search excerpts rather than the document itself. Flagged inside the brief.

Cross-document links have been rewritten to work inside this pack. A few plain-text path mentions still refer to the original repo layout (`.scratch/…`) — those are labels, not links.

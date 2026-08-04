# Making the logic visible without drowning the reader

Research brief for the **P&T Command Centre** — ticket [06-research-explainability-patterns](../issues/06-research-explainability-patterns.md).
Compiled 2026-08-01. Sources with URLs at the end; every recommendation not traceable to a source is tagged **[synthesized]**.

---

## TL;DR

1. **"Show the logic" and "keep it simple" are not in tension once you split by cost, not by user level.** The *arithmetic* is one line and should always be visible. The *lineage, threshold, counterfactual and history* are ten lines each and should be one keystroke away. Splitting by "novice sees less / expert sees more" is the wrong axis for a single expert operator. **[synthesized]**

2. **The evidence says explanation UI usually fails, and fails in a specific way: it produces agreement, not scrutiny.** Bansal et al. (CHI 2021) found AI explanations did *not* improve human+AI team accuracy over showing the prediction alone, and increased the rate at which people accepted wrong answers. Poursabzi-Sangdeh et al. (CHI 2021) found that *increasing* model transparency made people **worse** at catching the model's large mistakes. Kaur et al. (CHI 2020) found data scientists over-trusted and misread interpretability output. Design implication: an explanation that cannot be *disagreed with* is decorative. Every explanation in this system must end in a drillable operand and a named source, not a persuasive sentence.

3. **The anti-pattern that kills this class of feature is the same one that kills alarm systems: volume.** EEMUA 191 / ANSI-ISA-18.2 practice reports up to 80% of alarm activations come from a dozen or fewer "bad actor" sources, and that operators respond by ignoring or suppressing the system. Your own deviations brief already reached the same conclusion independently ("management-by-exception fails through alert fatigue, not lack of alerts"). Explanations are subject to identical economics.

4. **The right container is a docked rail, not a hover tooltip and not a modal.** Tableau explicitly moved Explain Data from a dialog to a right-hand pane to allow exploration alongside the view. Hover-only tooltips also break WCAG 2.1 SC 1.4.13 (content on hover must be dismissible, hoverable, persistent) — the existing `control-tower.html` tooltip fails all three.

5. **Recommendation (full spec in §9): one reusable component called `Basis`.** Three tiers: a hairline **derived mark** on every computed number (always on, ~0px); a **basis line** carrying the substituted arithmetic (`173 ÷ 270 = 64.1%`, always on, one line); and the **Basis rail** (on demand — formula with operands aligned under their tokens, operand table with per-operand provenance and recursive drill, threshold band, one pre-computed counterfactual, as-of control). Every number on every screen is either marked-and-derivable or unmarked-and-sourced. No exceptions, no second mechanism.

---

## 1. What the requirement actually demands

"Logics clear visible for each decision" is three separate requirements wearing one coat. Separating them is most of the design work. **[synthesized]**

| # | Requirement | Question it answers | Where it lives |
|---|---|---|---|
| R1 | **Derivation** | *How was this number computed from other numbers?* | Formula + substituted operands |
| R2 | **Attribution** | *What moved it, and by how much?* | Contribution breakdown |
| R3 | **Adjudication** | *Why is it flagged / ranked here / recommended?* | Threshold + rank basis |
| R4 | **Dependence** | *What assumptions is it standing on?* | Assumption panel |
| R5 | **Leverage** | *What would have to change for this to clear?* | Counterfactual |
| R6 | **Trust** | *Where did the inputs come from, how fresh, how sure?* | Provenance + confidence |
| R7 | **Reconstruction** | *What did we know when we decided?* | As-of / audit trail |

The failure mode of most "explainable" dashboards is answering R6 loudly (a "last synced" chip) and R1 not at all. The user's phrasing — *the rule that produced it* — is R1 first. R2–R7 are what R1 opens onto.

A second framing that matters for this domain: in a P&T operating system almost nothing is a model output. Campaign adherence is arithmetic. Stock cover is arithmetic. Fair-share allocation is a policy expressed as arithmetic. Only the statistical baseline forecast and the bias adjustment are model-ish. **So this system's explainability problem is 90% "show the arithmetic and the policy", 10% "explain the model".** That is a much easier problem than the XAI literature is usually solving, and it should be solved with a spreadsheet-auditing idiom rather than a SHAP-plot idiom. **[synthesized]**

---

## 2. Progressive disclosure vs always-visible reasoning, for a domain expert

This is the pivot the whole design turns on, so the evidence first.

**For progressive disclosure.** Nielsen's original formulation defers advanced features to secondary screens, showing "only a few of the most important options" initially, and claims improvements in learnability, efficiency and error rate — including for advanced users, who "save time because they avoid having to scan past a large list of features they rarely use." NN/g's own caution is that designs needing **three or more disclosure levels should be simplified instead** ([NN/g](https://www.nngroup.com/articles/progressive-disclosure/)). Recent clinical-AI work operationalises the same idea as "selective transparency": progressive, on-demand disclosure of explanation detail helped medical professionals manage load and follow the system's reasoning ([Kim et al., Int. J. Human-Computer Studies 2025](https://www.sciencedirect.com/science/article/abs/pii/S107158192500148X)).

**Against always-visible everything.** Poursabzi-Sangdeh et al. ran pre-registered experiments with ~3,800 participants on functionally identical models varying only in number of visible features and transparency. Clear, few-feature models were easier to *simulate* — but increased transparency **hampered** participants' ability to detect when the model made a sizeable mistake, apparently through information overload ([arXiv 1802.07810](https://arxiv.org/pdf/1802.07810) / [CHI 2021](https://dl.acm.org/doi/abs/10.1145/3411764.3445315)). More visible reasoning is not monotonically better even for capable readers.

**Against pure progressive disclosure for experts.** NN/g's own guidance carries the counter-note that progressive disclosure should not be used where users operate in expert mode and rely on always-visible features. And the density literature agrees: what makes the Bloomberg Terminal work is not that it hides things but that it exposes a *stable, learnable grammar* — function codes and keyboard affordances that are constant across years — and then trusts the reader ([Core77](https://www.core77.com/posts/24893/moneymaking-multi-monitor-mayhem-and-why-some-prefer-interface-design-that-sucks-24893); [Homnack, "Designing for Cognition"](https://www.lippihom.com/blog/designing-for-cognition-the-enduring-value-of-high-information-density-interfaces); [The Terminalist](https://theterminalist.substack.com/p/bloombergs-7-powers-and-why-the-terminal)). Density is tolerable when it is *predictable*; it is intolerable when it is *variable*.

### The resolution [synthesized]

Disclose by **cost and volatility of the content**, not by expertise of the reader.

```
                            px cost   changes per   always
                            per use   reading?      visible?
  T0  derived mark            ~0      never          YES   a number is marked as computed
  T1  substituted arithmetic  ~1 ln   every read     YES   173 ÷ 270 = 64.1%
  ------------------------------------------------------------------------------
  T2  operand provenance      ~6 ln   rarely         NO    where each operand came from
  T2  threshold logic         ~2 ln   rarely         NO    < 85% floor -> Red
  T2  contribution breakdown  ~8 ln   sometimes      NO    which SKU moved it
  T2  counterfactual          ~2 ln   sometimes      NO    clears at +56.5 MT
  T3  rule text + version     ~10 ln  never          NO    the policy as written
  T3  as-of reconstruction    ~var    never          NO    what we knew on the 24th
```

Two rules fall out, and they are the two rules the rest of this brief obeys:

- **The arithmetic is never hidden.** A one-line substituted expression is cheap enough that hiding it costs more (a click, a context switch, a doubt) than showing it. This is the always-visible reasoning that an expert operator actually wants, and it is what a hover tooltip conspicuously fails to provide.
- **Everything past the arithmetic is exactly one interaction deep, and it is the same interaction everywhere.** NN/g's "don't exceed two levels" is satisfied: T0/T1 are level zero; T2 and T3 both live in one rail. No sub-modals, no explain-the-explanation.

---

## 3. Drill-to-formula

**What it is good for.** The primary R1 answer. It converts "trust me" into "check me". It is also the cheapest way to make a metric *definition dispute* resolvable — which your own deviations brief identifies as the thing that kills operating meetings ("meetings degenerate into reconciling which number is right — the dashboard has already failed").

**How it fails.**
- *Formula shown without operands.* "Adherence = in-window ÷ planned" tells the operator nothing they did not know. The value is entirely in the substitution.
- *Operands shown without the formula.* A list of numbers with no expression is a data dump; the reader has to reconstruct the rule.
- *One-step-at-a-time evaluation.* Excel's Evaluate Formula walks a nested expression one operator at a time (Formulas → Evaluate Formula), which is excellent for debugging a 200-character nested `IF` and terrible for a two-operand ratio you read forty times a day ([Excel formula auditing overview](https://www.excel-easy.com/examples/formula-auditing.html); [GoSkills](https://www.goskills.com/excel/resources/formula-auditing-tools-excel)). Stepping is a debugging affordance, not a reading affordance.
- *Dead-end operands.* If `planned_tonnes = 270` is not itself clickable back to the locked PPC schedule version, the drill stops one level short of where every real argument happens.
- *Rule drift.* The number was computed under rule v2; the panel renders rule v3. Silent and corrosive.

**Concrete rendering.** The strongest available idiom is Excel's *Trace Precedents* (arrows from a result back to its feeding cells) combined with the formula bar's live expression — but rendered statically, both rows at once, aligned. Template on top, live operands directly beneath each token:

```
CAMPAIGN ADHERENCE — Mill 2, campaign C-2206, Wk 23        D4 · rule v3

     adherence   =   in-window tonnes   ÷   planned tonnes
                     ................       ..............
                          173 MT                270 MT          =  64.1%
                     shift log 18:40        PPC sched v7
                                            locked 24 Jul
```

Two things make this work rather than being a diagram: (a) the template row and the operand row are one CSS grid with one column per token, so alignment is structural and cannot drift; (b) each operand is itself a trigger — `173 MT` opens its own basis (`118 + 55 + 0`, three SKU rows), and `270 MT` opens the locked schedule record. Recursion terminates at a raw record with a source and a timestamp.

Markup skeleton:

```html
<div class="formula" role="group" aria-label="adherence equals in-window tonnes divided by planned tonnes">
  <span class="tok name">adherence</span>
  <span class="tok op">=</span>
  <span class="tok operand">
    <span class="t">in-window tonnes</span>
    <button class="v" data-basis="d4.inwindow.mill2.w23">173<i>MT</i></button>
    <span class="s">shift log 18:40</span>
  </span>
  <span class="tok op">÷</span>
  <span class="tok operand">
    <span class="t">planned tonnes</span>
    <button class="v" data-basis="ppc.sched.v7.c2206">270<i>MT</i></button>
    <span class="s">PPC sched v7 · locked 24 Jul</span>
  </span>
  <span class="tok op">=</span>
  <span class="tok result">64.1<i>%</i></span>
</div>
```

```css
.formula{display:grid;grid-auto-flow:column;align-items:end;gap:0 10px;
         font-family:var(--mono);font-variant-numeric:tabular-nums}
.tok{display:grid;grid-template-rows:auto auto auto;justify-items:center;row-gap:2px}
.tok .t{font-family:var(--body);font-size:11px;color:var(--ink-3)} /* template row  */
.tok .v{font-size:16px;color:var(--ink);border:0;background:none}  /* operand row   */
.tok .s{font-size:10.5px;color:var(--ink-3)}                        /* provenance row */
.tok.op{align-self:center;color:var(--ink-3);font-size:15px}
.tok.result .v{font-weight:600}
```

The three rows are: *what the rule calls it* / *what it is right now* / *where it came from*. R1 and R6 answered in one object, in about 70px of vertical space.

---

## 4. Contribution breakdown

**What it is good for.** R2 — the "and by how much" that turns a red number into a work item. In this domain it is the difference between "adherence 64%" and "one SKU, 40×40×2.6 GI, cut from 90 to 55 MT on a sales override, is 100% of the gap."

**How it fails.**
- *Decomposing when the total is not actually decomposable.* Ratios do not add. Adherence is `Σin-window ÷ Σplanned`; a waterfall over the ratio is wrong. Decompose the **numerator gap in MT**, then state the ratio effect once. This is the single most common error in bridge charts in operational reporting.
- *Too many bars.* Above ~7 segments a waterfall becomes a bar chart with extra steps. Standard finance practice is to order by magnitude and roll the tail into "Other" ([Sigma](https://www.sigmacomputing.com/blog/waterfall-charts-data-visualization); [Inforiver](https://inforiver.com/insights/waterfall-charts-finance-professionals-best-friend/)).
- *Statistical contribution presented as causal.* Tableau's Explain Data surfaces unvisualised dimensions that *may* be contributing, and is careful to say "possible explanations" ([Tableau: how it works](https://help.tableau.com/current/pro/desktop/en-us/explain_data_explained.htm); [explanation types](https://help.tableau.com/current/online/en-us/explain_data_explanation_types.htm)). A hand-built system with known formulas has no such excuse and should never present a correlational contributor next to an arithmetic one without labelling which is which.
- *No residual.* If the parts do not sum to the whole, say so on the chart. An unlabelled residual destroys the credibility of every future breakdown.

**Concrete rendering.** For a business this size a horizontal text-waterfall beats a chart: it is denser, sortable, copy-pasteable into a WhatsApp message to the plant, and needs no chart library.

```
GAP DECOMPOSITION — planned 270 MT -> in-window 173 MT           -97 MT

  planned                                              270.0  |==================|
  40x40x2.6 GI   cut 90 -> 55   sales override, export  -35.0  |     ####         |
  50x50x2.0 GI   pushed to 8 Jun, out of window         -60.0  |  ########        |
  40x40x2.0 GI   ran 120 -> 118  strip join             -2.0   |         #        |
  ------------------------------------------------------------------------------
  in-window                                             173.0  |========          |
  residual                                                0.0   reconciles exactly
```

Rules for this rendering **[synthesized]**:
- Column 1 the contributor, column 2 the *transition* in the contributor's own units, column 3 the signed delta, column 4 a shared-scale bar.
- Sort by |delta| descending. Cap at 6 rows + "Other (n)".
- Always render the residual row, even when zero — its visible zero is the proof of completeness.
- Reason codes (`sales override, export`) sit in column 2, not in a tooltip. They are the actual finding.
- Deltas are links: clicking `-35.0` opens the interruption record.

For the ratio caveat, the panel states it in one line rather than drawing it: `Ratio effect: -97 MT on a 270 MT base = -35.9 pp of adherence.`

---

## 5. "Why am I seeing this"

**What it is good for.** R3. Two distinct sub-questions that are usually conflated: *why does this item exist in the list* (threshold) and *why is it in position 3* (rank basis). For a command centre whose whole premise is a capped exception queue, the rank basis is arguably the highest-stakes explanation on the screen — it is the system asserting what the owner should do first.

**How it fails.**
- *Tautology.* "You are seeing this because adherence is below the floor" restates the number. The explanation must expose the **threshold, its provenance, and its editability**: `floor 85% — set 2026-04-02, recommended range 85–92% (SCW), last reviewed by you`.
- *Explanations that cannot be acted on.* Meta's "Why am I seeing this ad" is the canonical negative example: research finds the explanations do not align with how the system is actually driven by advertisers, and are scoped so narrowly to a single item that no pattern is learnable ([Andreou et al. discussion via TechPolicy.Press](https://www.techpolicy.press/a-menu-of-recommender-transparency-options/); [arXiv 2410.04917](https://arxiv.org/pdf/2410.04917)). Transparency that cannot change anything reads as a legal notice.
- *Transparency reducing perceived control.* Ad-transparency research finds effects on user behaviour are not uniformly positive and can dampen sense of control ([Why Am I Seeing This Ad?](https://www.researchgate.net/publication/332211297_Why_Am_I_Seeing_This_Ad_The_Effect_of_Ad_Transparency_on_Ad_Effectiveness)). The fix in an operator tool is that the explanation is always accompanied by the lever — the threshold is editable from inside the explanation.
- *Rank explained by score.* "Priority score 8.4" is not an explanation; it is a second unexplained number.

**Concrete rendering.** Attach the rank basis to the row, not to a separate legend. In the exception queue, the age/tier column becomes a rank-basis column that decomposes the sort key:

```
STATUS  DEV  ENTITY & GAP                              RANK BASIS        AGE
------  ---  ----------------------------------------  ----------------  ----
 Red    D4   Mill 2 · campaign C-2206                  sev 3 x 100       2d
             adherence 64.1% vs 85.0% floor            + breach 20.9pp  <- why here
             ...................................       + age 2d
                                                       = 320.9   #1
```

And the on-demand form, in the Basis rail:

```
WHY THIS IS #1 OF 14

  ordering rule    severity(3) x 100  +  breach magnitude(20.9)  +  age days(2)
                        300           +          20.9           +      2      = 322.9

  next item        D11 Verma Tubes                                        = 306.0
  it would rank below this one if     breach fell to 3.1 pp  (adherence 81.9%)

  threshold        adherence < 85.0%  ->  Red        floor set 02 Apr 2026 [edit]
                   85-92% typical world-class (SCW, vendor-sourced)
  queue cap        14 shown of 22 breaching; cap = one shift's work   [why capped]
```

Three deliberate choices **[synthesized]**: the ordering rule is arithmetic and therefore gets the same formula renderer as everything else; the *margin to the next item* is shown, because that is what tells an expert whether the ordering is meaningful or a coin-flip; the queue cap is disclosed on the same surface, because a hidden cap is the most dangerous invisible logic in an exception system.

---

## 6. Assumption panels

**What it is good for.** R4. Anything projected — next campaign window, promised availability date, forecast rollup, coil indent quantity — is standing on inputs the operator holds opinions about. Driver-based planning tools make this the centrepiece: outputs are computed from operational drivers rather than typed in, so "variances are easy to explain — the model shows exactly what driver caused the shift" ([Anaplan](https://www.anaplan.com/blog/put-drivers-in-front-steer-planning-with-confidence/); [Pigment](https://www.pigment.com/glossary/driver-based-planning)).

**How it fails.**
- *Assumptions listed but not distinguished from measurements.* The critical distinction is `measured` / `derived` / `assumed` / `defaulted`. A defaulted assumption nobody has ever looked at is the most dangerous number on the screen and must be visually distinct from a measured one.
- *Editable assumptions that silently persist.* If moving a slider changes the saved plan, the operator will stop touching it. Scratch edits must be visibly ephemeral and revertible in one action.
- *Panels listing 30 assumptions.* Rank by sensitivity, show the 3 that actually move the answer, collapse the rest.
- *Stale assumptions with no age.* `changeover 4h` set in 2019 is not an assumption, it is a fossil. Show `set` date and `last confirmed` date.

**Concrete rendering.** A fixed-height assumption block inside the Basis rail, sensitivity-ordered, with provenance class as a leading glyph:

```
STANDING ON                                     sensitivity-ordered · 3 of 9

  o  min campaign lot        150 MT   assumed    set 12 Mar 26 · never confirmed
     |------[====]--------|           +/-50 MT moves promise date by 7 days   <- highest
  =  changeover, size         4.0 h   assumed    set 04 Jan 24 · confirmed Apr 26
     |----[==]------------|           +/-1h moves campaign end by 0.4 days
  *  mill net rate          12.0 t/h  measured   90-day actual, +/-0.8 sd
     |------[==]----------|
                                                            [show 6 more]
  o assumed   = defaulted   * measured   ~ derived      [reset all]  [what-if]
```

The glyph column is the load-bearing part **[synthesized]**: `*` measured, `~` derived, `o` assumed, `=` defaulted-and-never-touched. It is one character wide, works in a dense table, and is the fastest available answer to "how much of this projection is real".

Editing rule: dragging a handle puts the whole screen into a visibly-marked **scratch state** — a 3px accent border on the viewport and a persistent `SCRATCH — 2 assumptions changed [revert]` bar. Nothing is written. Leaving the screen discards. This is the difference between a what-if that gets used and one that gets feared.

---

## 7. What-if / counterfactual

**What it is good for.** R5. Wachter et al.'s framing is exactly right for an operations console: shift from *why the system is like this* to *what would need to change for a different result* ([Wachter, Mittelstadt & Russell, 2018](https://arxiv.org/pdf/2102.02671) — discussed in the directive-explanations literature).

**What makes it a toy rather than useful.** The recourse literature is blunt: static point counterfactuals frequently recommend changes users cannot actually enact ([Beyond Individualized Recourse, arXiv 2009.07165](https://arxiv.org/pdf/2009.07165); [FACET / interactive counterfactual regions](https://par.nsf.gov/biblio/10523424-actionable-recourse-automated-decisions-examining-effects-counterfactual-explanation-type-presentation-lay-user-understanding)). Three concrete failure modes here:

1. **Counterfactual on an uncontrollable operand.** "This clears if secondary sales rise 12%" — the company cannot move that. Every operand needs an `actionable: true|false` flag, and the engine must only propose counterfactuals over actionable ones.
2. **Counterfactual on the past.** "Adherence would have been 85% if the campaign hadn't been broken" is true and useless. For closed periods the counterfactual should be *diagnostic* ("the break cost 35 MT and 12.9pp") not hypothetical.
3. **Open sandbox with no target.** A slider with no goal is a fidget toy. The useful form is **solve-for**: state the goal, let the system compute the required operand value.

**Concrete rendering.** One pre-computed line, always present in the rail; the sandbox only on request.

```
TO CLEAR

  needs   in-window tonnes  >=  229.5 MT       (+56.5 MT from 173.0)
  from    50x50x2.0 GI, 60 MT, currently out of window
  if      pulled into window by Fri 17:00 cut-off  ->  adherence 86.3%  GREEN

  binding operand: in-window tonnes  (actionable)
  planned tonnes is fixed - schedule v7 locked 24 Jul       [open solve-for]
```

The four-line grammar — **needs / from / if / result** — is worth standardising across the whole system **[synthesized]**. It states the target value, names where the shortfall could come from, names the enabling action with its own deadline, and shows the resulting state change. It reads as a work instruction, which is the point.

`solve-for` opens the same assumption block in scratch state, with a target field pinned at the top (`adherence = 85.0%`) and the actionable operands unlocked. Non-actionable operands remain visible but locked, with the reason on hover-or-focus (`locked: schedule v7 is signed`).

---

## 8. Confidence, provenance, and audit trail

### 8a. Confidence and provenance (R6)

**What it is good for.** Preventing the meeting that reconciles which number is right. Dashboard-freshness practice converges on: a visible last-updated marker, an explicit state for refreshing/failed, and lineage from the consumed figure back to its sources ([Sifflet on data freshness](https://www.siffletdata.com/blog/data-freshness); [IBM on stale data](https://www.ibm.com/think/topics/stale-data)).

**How it fails.**
- *One global "synced 09:12" chip.* The mockup does exactly this. It is a lie by aggregation: the shift log is 20 minutes old, the locked PPC schedule is 8 days old and correctly so, and the GRN feed may be 3 days stale. Freshness is a per-operand property.
- *Caveat walls.* A paragraph of qualifications is read once and never again.
- *Confidence rendered as a number with no referent.* "Confidence 82%" is uninterpretable. Confidence must be typed: `measured` / `reconciled` / `modelled` / `estimated` / `stale`.
- *Uncertainty rendered as a point.* For forecasts, prediction intervals beat points; and there is evidence of an inverted-U — prediction-interval plots with *medium* perceived uncertainty produced better outcomes than either point plots or busy ensemble plots ([Leffrang et al., Journal of Forecasting 2025](https://onlinelibrary.wiley.com/doi/full/10.1002/for.3222)). Two bands, not five.

**Concrete rendering.** Freshness rides on the operand, in the row it belongs to, using an age not a timestamp:

```
OPERANDS

  operand              value     class       source                     age
  -------------------  --------  ----------  -------------------------  -----
  in-window tonnes     173.0 MT  measured    shift production log       20 m
  planned tonnes       270.0 MT  reconciled  PPC schedule v7 (locked)   8 d *
  floor                 85.0 %   policy      thresholds, set 02 Apr 26  121 d
                                                     * locked by design, not stale
```

Two rules **[synthesized]**: age in coarse human units (`20 m`, `8 d`), never an ISO timestamp, with the exact timestamp on focus; and **"locked by design" must be a distinct state from "stale"**, because the single most confusing thing in a planning system is that some old numbers are correct precisely because they are old. For a forecast number the same block gains one row: `p10–p90  238–312 MT  · backtested on 24 months · WMAPE 18.4%` — a range and the score of the method that produced it, in one line.

### 8b. Audit trail and reconstruction (R7)

**What it is good for.** "Why did we build 90 MT of that in June?" asked in October. This is the one requirement that is architectural rather than visual: it cannot be retrofitted into the UI.

**How it fails.** The universal failure is recomputing history with today's rules and today's data, producing a number that never appeared on any screen. The remedy is bitemporality — two independent time axes, *valid time* (when the fact was true) and *transaction time* (when we learned it) — which is what makes "as we knew it on 24 July" answerable at all ([bitemporal modelling overview](https://softwarepatternslexicon.com/bitemporal-modeling/); [XTDB on time-travel for compliance](https://xtdb.com/blog/launching-xtdb-v2)).

**Concrete rendering.** One control, in the rail header, and it is a *mode* not a filter:

```
+---------------------------------------------------------------+
| BASIS                                    as of [ now      v ] |
|                                               | 24 Jul 17:00  |  <- estimate lock
|                                               | 31 Jul 18:40  |  <- last shift close
|                                               | pick date...  |
+---------------------------------------------------------------+
```

When set to a past instant the entire rail switches to a marked historical state — a 2px amber top border and a `AS AT 24 JUL 17:00 · rule v2` strip — and every operand, threshold and rule version resolves as of that instant. The preset list is not arbitrary dates: it is **the decision points of the cycle** (estimate lock, S&OP sign-off, campaign freeze, shift close), because those are the moments an operator actually wants to stand in. **[synthesized]**

The stored record per decision is small and worth specifying now, before any screen is built:

```json
{ "decision_id":"alloc.2026-06.40NB-3.2",
  "taken_at":"2026-05-28T15:12+05:30",
  "rule_id":"D3.fairshare", "rule_version":4,
  "inputs_as_of":"2026-05-28T09:00+05:30",
  "operand_snapshot":{ "capacity_mt":5000, "indent_mt":6500,
                       "trailing_offtake":{"D1":1800,"D2":1200,"D3":600,"D4":400} },
  "output":{"D1":2250,"D2":1500,"D3":750,"D4":500},
  "overrides":[{"who":"owner","field":"D3","from":750,"to":870,
                "reason":"project commitment","at":"2026-05-28T15:40+05:30"}] }
```

A stored `operand_snapshot` is what makes replay honest; a stored `rule_version` is what makes it explicable; a stored `overrides` array is what makes the human part of the decision visible alongside the machine part.

---

## 9. Anti-patterns — what makes explanation UI get switched off

Ordered by how likely each is to actually happen here.

**A1 — Volume.** Alarm-management practice is the closest empirical analogue and its finding is stark: up to 80% of activations come from a dozen or fewer "bad actor" sources, and alarm overload historically ends in operators suppressing the system ([exida](https://www.exida.com/Alarm-Management/Resources); [Rockwell white paper](https://literature.rockwellautomation.com/idc/groups/literature/documents/wp/proces-wp013_-en-p.pdf); EEMUA 191 / ANSI-ISA-18.2 rate limits). Applied to explanations: if every figure sprouts a badge, an icon and a "learn more", the marks stop being read within a week. **Mitigation: exactly one mark, one pixel-cheap, and it means one thing.**

**A2 — Explanation that produces agreement instead of scrutiny.** Bansal et al. found explanations did not improve complementary team accuracy and increased acceptance of incorrect recommendations ([CHI 2021](https://dl.acm.org/doi/fullHtml/10.1145/3411764.3445717) / [PDF](https://idl.cs.washington.edu/files/2021-AIExplanationsTeamPerformance-CHI.pdf)). Poursabzi-Sangdeh et al. found more transparency made large mistakes *harder* to catch. Kaur et al. found practitioners over-trusted and misdescribed interpretability output ([CHI 2020](https://dl.acm.org/doi/10.1145/3313831.3376219)). **Mitigation: every explanation terminates in a drillable operand with a named source and a timestamp, so the reader can disagree with a specific thing rather than with a vibe. Never end an explanation in prose.**

**A3 — Automation complacency.** Parasuraman & Manzey show complacency and automation bias appear in experts as well as novices and are not trained away ([Human Factors 2010](https://journals.sagepub.com/doi/10.1177/0018720810376055)). A system that is usually right teaches its operator to stop checking. **Mitigation: the system must show its own miss record where it makes recommendations — a forecast's backtest WMAPE next to the forecast, an allocation rule's override rate next to the allocation. Self-reported fallibility is the only durable counterweight.**

**A4 — Hover-only explanation.** WCAG 2.1 SC 1.4.13 requires hover/focus content to be dismissible, hoverable and persistent ([W3C via Deque](https://dequeuniversity.com/resources/wcag2.1/1.4.13-content-on-hover-or-focus); [Higley](https://sarahmhigley.com/writing/tooltips-in-wcag-21/)). Beyond compliance: a tooltip cannot be read alongside the number, cannot be compared with a second tooltip, cannot be copied, and vanishes if the reader looks away. **Mitigation: click-to-open, click-to-pin, Esc to close. Hover changes nothing but the mark's weight.**

**A5 — Tautological explanation.** "Red because it is below the threshold." Restating the comparison is the most common filler in this genre. **Mitigation: an explanation must add at least one of — a number not already on screen, a source, or a lever. If it adds none, delete it.**

**A6 — Rule/number version skew.** The number was computed under one rule and is explained under another. Silent, and it destroys trust permanently when discovered. **Mitigation: `rule_version` is stamped on the computed value, not looked up at render time; a mismatch renders a `SUPERSEDED — computed under v2, current rule v3 [recompute]` strip.**

**A7 — Explanation reserved for the AI features.** If only the forecast and the recommendation are explained, the operator learns that "explained" means "not to be trusted", and explanation becomes a disclaimer. **Mitigation: the plainest arithmetic on the screen uses the identical component. Uniformity is what makes the affordance invisible-until-needed.**

**A8 — Aggregate freshness.** One "synced 09:12" chip covering feeds of wildly different cadences. **Mitigation: freshness is per operand; the header chip, if any, shows the *oldest* contributing source, not the newest.**

**A9 — Explanations that cost a page load.** If opening the basis navigates away, it will be used twice and abandoned. **Mitigation: the rail is client-side over already-loaded derivation objects; opening a basis must be instantaneous and must not disturb the underlying screen.**

**A10 — Decorative confidence.** "Confidence: 82%" with no definition. **Mitigation: typed confidence classes, never a bare percentage.**

---

## 10. Reading the existing sketch — `docs/mockups/control-tower.html`

Reacting, not preserving. What is worth keeping, what to discard, and one correction to the accessibility note in the map.

**Worth keeping.**
- The *shape*: sticky rail, cycle ticker, signal strip, two-column working area, escalation rail. The information architecture is sound and dense without being loud.
- Tabular-numeric monospace for every figure (`.num`, `font-variant-numeric: tabular-nums`). Non-negotiable for a scanning reader; keep it.
- The band plot for stock-days — a labelled band axis with dots on it is a genuinely good dense encoding of "where does this sit against policy", and it is *self-explaining* in a way a bar chart is not. Generalise it: **any thresholded metric should render against its band, not against zero.** **[synthesized]**
- The adherence bars carry a dashed `85% floor` marker on the track. This is the single most explainable element on the page — the threshold is drawn where the comparison happens. Promote this to a system rule.
- The `adh-note` sentence explaining adherence-vs-attainment. Correct instinct, wrong location: it is a footnote where it should be the panel's basis line.

**What to discard.**
- **The tooltip is the whole explanation layer, and it cannot carry it.** `#tip` is `pointer-events:none`, hides on `mouseleave`, has no Esc handler, and holds exactly three pipe-delimited fields (`data-tip="name|value|note"`). It fails all three parts of SC 1.4.13, is unreachable except by focus-or-hover, cannot be pinned or compared, and structurally cannot show a formula. Replace wholesale.
- `#tip` also carries `role="status" aria-live="polite"`, so every hover fires a screen-reader announcement — a live region used as a tooltip, which produces continuous interruption while scanning a table.
- The exception queue's `q-detail` prose embeds the arithmetic in a sentence: *"Adherence 64.1% vs 85% floor. 40×40×2.6 GI cut to 55 of 90 MT — reason code sales override, export."* All the right facts, but as prose it cannot be scanned, aligned, sorted or drilled. This is precisely the content that should be a structured basis line.
- Five signal tiles with sparklines but no substituted arithmetic. `78.6` with subtitle `Bias +21.4% · one-sided · rolling 3M` tells you the answer and one derived statistic, not the rule.
- **Three of the five signal tiles are out of scope** under the current charter (D11 primary–secondary, D12 distributor stock-days, D14 credit-limit). Do not carry the strip forward as-is.

**Correction to the map's accessibility note.** The map records that "its dark palette failed accessibility validation." Recomputing the token contrasts, the failure is not confined to the dark palette — it is the **tertiary ink token in both themes**:

| Token | On | Contrast | 4.5:1 AA? |
|---|---|---|---|
| `--ink-3 #7A8792` (light) | `--surface #FFFFFF` | **3.68:1** | fail |
| `--ink-3 #7A8792` (light) | `--paper #EDEFF2` | **3.19:1** | fail |
| `--ink-3 #6F7E8A` (dark) | `--surface #141A21` | **4.27:1** | fail |
| `--ink-2 #4A5762` (light) | `--surface #FFFFFF` | 7.66:1 | pass |
| `--ink #E7ECF1` (dark) | `--surface #141A21` | 14.5:1 | pass |

`--ink-3` is the token carrying `.eyebrow`, `.panel-head .meta`, `.tile-foot`, `.rp-h`, `.band-ticks`, `.q-code` and `.esc` — at 9.5–11.5px, i.e. all of the labelling, all of the provenance text, and all of the axis ticks. Every metadata layer in the mockup is below AA in **both** themes, light slightly worse than dark. Since provenance and freshness are load-bearing in the design this brief recommends, the tertiary ink token must be re-derived to ≥4.5:1 in both themes before any of it is built — roughly `#5E6B76` on white and `#8E9CA8` on `#141A21`. **[synthesized]**

---

## 11. RECOMMENDATION — the `Basis` component

One component. Used for every number on every screen. Named **Basis** — noun, short, and it reads correctly in the sentence the operator is actually asking: *"what's the basis for that?"*

### 11.1 Scope rule

Every rendered figure is exactly one of:

| Kind | Mark | Basis shows |
|---|---|---|
| **Derived** — computed from other figures | hairline dotted underline | formula, operands, threshold, contribution, counterfactual |
| **Raw** — a measured or entered record | no underline, pointer cursor | source record, who/what entered it, valid-time, transaction-time |
| **Policy** — a threshold, norm, or rule constant | dotted underline + `§` prefix | the rule text, when set, by whom, review date, edit control |

There is no fourth kind and no opt-out. If a figure cannot be classified, it does not go on a screen. **[synthesized]**

### 11.2 The three tiers

**T0 — the derived mark.** A 1px dotted bottom border, `--hairline-2`, on the number only (not its unit or label). Cost: zero layout, near-zero ink. It is the system's only global affordance and it means exactly one thing: *there is a rule behind this and I will show it to you.* Consistency here is what buys the density — the Bloomberg lesson.

```css
.basis-trig{ border:0; background:none; padding:0; font:inherit; color:inherit;
             font-variant-numeric:tabular-nums; cursor:pointer;
             border-bottom:1px dotted var(--hairline-2); }
.basis-trig:hover,
.basis-trig:focus-visible{ border-bottom:1px solid var(--accent); }
.basis-trig:focus-visible{ outline:2px solid var(--accent); outline-offset:2px; }
.basis-trig[aria-expanded="true"]{ background:var(--accent-soft);
                                   border-bottom:1px solid var(--accent); }
.basis-trig[data-state="stale"]{ border-bottom-style:dashed; border-bottom-color:var(--warn); }
.basis-trig[data-state="superseded"]{ border-bottom-color:var(--crit); }
```

**T1 — the basis line.** One line, ≤ 64 characters, directly beneath the number in a tile or as a second line in a table row. It carries **the substituted arithmetic and nothing else** — no adjectives, no interpretation:

```
  CAMPAIGN ADHERENCE                             D4
  64.1%                                        Red
  173 / 270 MT in window  ·  floor 85.0%         <- the basis line
  ...................................
```

Style: `--mono`, 11px, `--ink-2`, tabular numerals, `÷` rendered as `/` for width. It replaces the current `.tile-sub` prose. This is the always-visible reasoning; the rest is one keystroke away.

**T2/T3 — the Basis rail.** A right-docked, resizable panel (default 400px, min 320, max 640), pushing the console rather than overlaying it. Docked, not floating: Tableau moved Explain Data out of a dialog and into a right pane for exactly this reason — you must be able to read the explanation while looking at the thing explained. Up to **3 pinned cards** stack in the rail, so two mills' derivations can be compared side by side. Closing the rail returns focus to the originating number.

### 11.3 Rail layout

```
+-------------------------------------------------------------+
| BASIS                            as of [ now  v ]   [x]     |  header: as-of + close
+-------------------------------------------------------------+
| CAMPAIGN ADHERENCE  Mill 2 · C-2206 · Wk 23      [pin] D4v3 |  identity + rule version
|                                                             |
|   adherence  =  in-window tonnes  ÷  planned tonnes         |  <-- FORMULA
|                      173 MT           270 MT      = 64.1%   |      (see 11.4)
|                  shift log 20m     sched v7 · 8d *          |
|                                                             |
| THRESHOLD                                                   |
|   |####|########|##################|      64.1%             |  <-- band, not text
|    0   64.1     85.0              100      < 85.0 floor -> RED
|   floor set 02 Apr 26 · world-class 92-98% (vendor)  [edit] |
|                                                             |
| WHAT MOVED IT                             -97.0 MT          |  <-- contribution
|   planned                        270.0  |=================| |
|   50x50x2.0 GI  out of window    -60.0  |  ########       | |
|   40x40x2.6 GI  cut 90->55       -35.0  |     ####        | |
|   40x40x2.0 GI  strip join        -2.0  |         #       | |
|   in-window                      173.0  |========         | |
|   residual                         0.0   reconciles         |
|   ratio effect: -97 MT on 270 = -35.9pp                     |
|                                                             |
| TO CLEAR                                                    |  <-- counterfactual
|   needs   in-window >= 229.5 MT   (+56.5)                   |
|   from    50x50x2.0 GI, 60 MT, out of window                |
|   if      pulled in by Fri 17:00 -> 86.3%  GREEN            |
|                                                  [solve-for]|
|                                                             |
| OPERANDS                                        [4]         |  <-- provenance
|   in-window tonnes  173.0 MT  measured    shift log    20m  |
|   planned tonnes    270.0 MT  reconciled  sched v7      8d *|
|   floor              85.0 %   policy      thresholds  121d  |
|   * locked by design, not stale                             |
|                                                             |
| RULE  D4 v3 · in effect since 02 Apr 2026        [full text]|  <-- T3
| Adherence counts only tonnage that ran as scheduled and     |
| in window. Out-of-window completion scores zero here and    |
| appears in attainment; the gap between the two is plan      |
| churn.                                                      |
+-------------------------------------------------------------+
```

Sections render only when the derivation object carries them. A raw figure renders header + operands + rule only, and collapses to about a fifth of this height. Section order is **fixed across every basis in the system** — that invariance is what lets an expert learn where to look and stop reading headings.

### 11.4 Rendering a formula with live operands substituted

The mechanism, precisely, because this is the part that must not be improvised per screen.

**Input contract.** Every derived figure ships with a `derivation` object:

```json
{
  "id": "d4.adherence.mill2.2026-W23",
  "label": "Campaign adherence",
  "scope": "Mill 2 · C-2206 · Wk 23",
  "rule": { "id": "D4", "version": 3, "since": "2026-04-02",
            "text": "Adherence counts only tonnage that ran as scheduled and in window..." },
  "tokens": [
    { "t": "name",    "text": "adherence" },
    { "t": "op",      "text": "=" },
    { "t": "operand", "ref": "in_window" },
    { "t": "op",      "text": "÷" },
    { "t": "operand", "ref": "planned" },
    { "t": "op",      "text": "=" },
    { "t": "result",  "ref": "adherence" }
  ],
  "operands": {
    "in_window": { "label":"in-window tonnes", "value":173.0, "unit":"MT", "dp":1,
                   "class":"measured", "source":"shift production log",
                   "as_of":"2026-07-31T18:40+05:30", "basis_id":"d4.inwindow.mill2.w23",
                   "actionable":true,  "locked":false },
    "planned":   { "label":"planned tonnes",   "value":270.0, "unit":"MT", "dp":1,
                   "class":"reconciled", "source":"PPC schedule v7",
                   "as_of":"2026-07-24T17:00+05:30", "basis_id":"ppc.sched.v7.c2206",
                   "actionable":false, "locked":true, "locked_reason":"schedule v7 signed" },
    "adherence": { "label":"adherence", "value":64.1, "unit":"%", "dp":1, "class":"derived" }
  },
  "threshold": { "kind":"floor", "value":85.0, "unit":"%", "state":"red",
                 "expr":"adherence < 85.0 → Red", "set_on":"2026-04-02", "editable":true },
  "contribution": { "unit":"MT", "from":270.0, "to":173.0, "residual":0.0, "items":[
      {"label":"50x50x2.0 GI","note":"out of window","delta":-60.0,"link":"campaign.c2206.sku3"},
      {"label":"40x40x2.6 GI","note":"cut 90->55","delta":-35.0,"link":"interrupt.2206.01"},
      {"label":"40x40x2.0 GI","note":"strip join","delta":-2.0,"link":"campaign.c2206.sku1"} ] },
  "counterfactual": { "binding":"in_window", "target":229.5, "delta":56.5, "unit":"MT",
                      "from":"50x50x2.0 GI, 60 MT, out of window",
                      "action":"pulled into window by Fri 17:00", "result":86.3, "state":"green" },
  "computed_at": "2026-07-31T18:41+05:30",
  "computed_under_rule_version": 3
}
```

**Layout mechanism.** One CSS grid; one column per token; three rows. Template text row 1, live value row 2, provenance row 3. Because every token is a grid column, the substituted value is *always* dead-centre under the term it substitutes, at any font size, in any language, with no measurement code:

```
grid columns:  [ adherence ] [ = ] [ in-window tonnes ] [ ÷ ] [ planned tonnes ] [ = ] [ result ]
row 1 (rule):    adherence     =    in-window tonnes     ÷     planned tonnes      =
row 2 (live):                            173 MT                    270 MT              64.1%
row 3 (prov):                        shift log · 20m        sched v7 · 8d *
```

Rules governing the render **[synthesized]**:
- **Row 1 never changes** for a given rule version. It is the rule. Grey (`--ink-3`), body font, 11px.
- **Row 2 is the only live part.** Mono, tabular, 16px, `--ink`. Each operand value is itself a `.basis-trig` when `basis_id` is present — recursion, terminating at raw records.
- **Row 3 is age, not timestamp.** Coarse units; exact ISO value on focus via `<time datetime>`.
- **Units are rendered small and inline** (`173`<small>`MT`</small>) so the digits stay the visual anchor.
- **Long formulas wrap by clause, never mid-token.** Above 4 operands the renderer switches to stacked mode: one operand per row, operator in a left gutter, result on a rule below — the classic long-division layout. Fair-share allocation renders in stacked mode:

```
  allocation, Sharma Steels
      trailing 3-mo offtake      1,800 MT   measured · 3d
   ÷  network trailing offtake   4,000 MT   derived  · 3d
   =  offtake share                 45.0 %
   x  capacity this month        5,000 MT   reconciled · S&OP 28 May
   =  fair share                 2,250 MT
      capped at indent           2,600 MT   -> not binding
   =  allocation                 2,250 MT     fill vs indent 87%
      + override                  +120 MT   owner · "project commitment" · 28 May
   =  released                   2,370 MT
```

That last block is the whole argument for this component: the override is rendered *in the same expression* as the rule, at the same weight, with its reason and author inline. The policy and the departure from it are one readable object.

**Screen-reader form.** The grid is `role="group"` with an `aria-label` carrying the sentence form (`"adherence equals in-window tonnes 173 megatonnes divided by planned tonnes 270 megatonnes equals 64.1 percent"`), and the visual rows are `aria-hidden` scaffolding. Do not attempt to make a three-row grid navigable cell-by-cell.

### 11.5 States

| State | Trigger appearance | Rail behaviour |
|---|---|---|
| `dormant` | dotted underline | — |
| `marked` | solid accent underline (hover/focus) | — |
| `open` | accent-soft background, `aria-expanded="true"` | rail shows this basis |
| `pinned` | accent-soft + 2px left accent bar | card persists as others open (max 3) |
| `stale` | dashed **amber** underline | rail shows amber `OLDEST INPUT 3d — expected hourly` strip |
| `degraded` | dotted underline + `~` prefix | one or more operands `class:"estimated"`; those rows amber in the operand table |
| `superseded` | dotted **crit** underline | red strip: `computed under rule v2 · current v3` + `[recompute]` |
| `historical` | (rail-wide) amber 2px top border | as-of set to a past instant; every operand resolved bitemporally |
| `scratch` | (screen-wide) 3px accent viewport border | assumptions edited; `SCRATCH · 2 changed [revert]` bar; nothing written |
| `unavailable` | no mark, pointer cursor | raw figure: rail shows the source record only |

### 11.6 Trigger and interaction

- **Mouse**: click opens. Click the same trigger again closes. Click a different one replaces the unpinned card.
- **Keyboard**: triggers use **roving tabindex within their region** — one Tab stop per tile/table/panel, then arrow keys to move between figures. A dense table must never put 200 numbers in the tab order.
  - `Enter` / `Space` / `b` — open basis
  - `p` — pin
  - `Esc` — close rail, return focus to trigger
  - `[` / `]` — previous / next pinned card
  - `Alt+B` — toggle rail without moving focus
- **Hover does not open anything.** It thickens the mark. This sidesteps SC 1.4.13 entirely and prevents accidental firing while scanning a dense table — the failure mode of the current mockup's tooltip.
- **Opening is client-side and instant** over already-loaded derivation objects. If a basis needs a fetch, it renders its skeleton immediately with a spinner in the operand table only; the formula row is always available offline because tokens and values ship with the figure.
- **Copy**: `Ctrl+C` inside the rail yields a plain-text rendering of the visible card — the formula, the operands with sources, the timestamp. This is what gets pasted into the message to the plant, and it is a bigger adoption lever than any visual.

### 11.7 What this buys, in one sentence per requirement

| Req | Answered by |
|---|---|
| R1 derivation | T1 basis line + formula grid |
| R2 attribution | contribution block, signed deltas, visible residual |
| R3 adjudication | threshold band + rank-basis expression using the same renderer |
| R4 dependence | operand `class` glyphs + assumption block in scratch state |
| R5 leverage | needs / from / if / result, with `actionable` and `locked` operand flags |
| R6 trust | per-operand class + age; typed confidence; "locked by design" ≠ stale |
| R7 reconstruction | as-of control over a bitemporal store; `rule_version` stamped on the value |

### 11.8 Build order [synthesized]

1. **The derivation object contract** (§11.4) — before any screen. Everything else is a renderer over it, and retrofitting `rule_version` or `as_of` later is a rewrite.
2. **T0 mark + T1 basis line.** Cheap, and on its own delivers most of the felt "logic is visible" quality.
3. **Rail with formula grid + operand table.** The minimum viable rail.
4. **Threshold band and contribution.** Per-metric work; sequence with the deviation set.
5. **Counterfactual and scratch assumptions.** Only after 1–4 are used in anger, and only on metrics with a genuinely actionable binding operand.
6. **As-of / bitemporal.** Architectural from day one in the store; the UI control can land last.

---

## Sources

**Explanation efficacy and its failure modes**
- https://dl.acm.org/doi/fullHtml/10.1145/3411764.3445717 · https://idl.cs.washington.edu/files/2021-AIExplanationsTeamPerformance-CHI.pdf — Bansal et al., CHI 2021: explanations did not improve complementary team performance; increased acceptance of incorrect predictions.
- https://arxiv.org/pdf/1802.07810 · https://dl.acm.org/doi/abs/10.1145/3411764.3445315 — Poursabzi-Sangdeh et al.: ~3,800 participants; increased transparency *hampered* detection of large model mistakes.
- https://dl.acm.org/doi/10.1145/3313831.3376219 — Kaur et al., CHI 2020: data scientists over-trust and misuse interpretability tools (GAMs, SHAP).
- https://journals.sagepub.com/doi/10.1177/0018720810376055 — Parasuraman & Manzey: automation complacency and bias occur in experts, not removed by training.

**Progressive disclosure and density**
- https://www.nngroup.com/articles/progressive-disclosure/ — Nielsen: definition, learnability/efficiency/error benefits, ≤2 levels, expert-mode caveat.
- https://www.sciencedirect.com/science/article/abs/pii/S107158192500148X — selective transparency via progressive disclosure in clinical AI diagnosis.
- https://www.core77.com/posts/24893/moneymaking-multi-monitor-mayhem-and-why-some-prefer-interface-design-that-sucks-24893 · https://www.lippihom.com/blog/designing-for-cognition-the-enduring-value-of-high-information-density-interfaces · https://theterminalist.substack.com/p/bloombergs-7-powers-and-why-the-terminal — why Bloomberg-style density works: stable learnable grammar, predictability, no unexpected change.

**Contribution / decomposition**
- https://help.tableau.com/current/pro/desktop/en-us/explain_data_explained.htm · https://help.tableau.com/current/online/en-us/explain_data_explanation_types.htm · https://www.tableau.com/blog/bringing-power-explain-data-all-tableau-users — Explain Data: contribution analysis semantics; dialog → right pane; "possible explanations" hedging.
- https://www.sigmacomputing.com/blog/waterfall-charts-data-visualization · https://inforiver.com/insights/waterfall-charts-finance-professionals-best-friend/ — waterfall/bridge practice: magnitude ordering, direction colour, standardisation.

**Drill-to-formula precedent**
- https://www.excel-easy.com/examples/formula-auditing.html · https://www.goskills.com/excel/resources/formula-auditing-tools-excel · https://coefficient.io/excel-tutorials/formula-auditing-in-excel — Trace Precedents / Trace Dependents / Evaluate Formula step-through.

**"Why am I seeing this"**
- https://www.techpolicy.press/a-menu-of-recommender-transparency-options/ · https://arxiv.org/pdf/2410.04917 — critique of Meta's WAIST: misaligned with how the system is driven, scoped too narrowly to yield pattern understanding.
- https://www.researchgate.net/publication/332211297_Why_Am_I_Seeing_This_Ad_The_Effect_of_Ad_Transparency_on_Ad_Effectiveness — transparency's non-uniform effect on perceived control.

**Counterfactual / recourse**
- https://arxiv.org/pdf/2102.02671 — directive explanations; Wachter et al. framing of "what would need to change".
- https://arxiv.org/pdf/2009.07165 · https://par.nsf.gov/biblio/10523424-actionable-recourse-automated-decisions-examining-effects-counterfactual-explanation-type-presentation-lay-user-understanding — static point counterfactuals often unenactable; interactive/comparative forms.

**Assumptions and driver-based planning**
- https://www.anaplan.com/blog/put-drivers-in-front-steer-planning-with-confidence/ · https://www.pigment.com/glossary/driver-based-planning — driver-based models: outputs computed from operational assumptions; variance traceable to driver.

**Provenance, freshness, uncertainty**
- https://www.siffletdata.com/blog/data-freshness · https://www.ibm.com/think/topics/stale-data — freshness indicators, refresh states, lineage to downstream consumers.
- https://onlinelibrary.wiley.com/doi/full/10.1002/for.3222 — Leffrang et al., J. Forecasting 2025: prediction-interval plots with medium perceived uncertainty outperformed point and ensemble plots (inverted-U).

**Audit trail**
- https://softwarepatternslexicon.com/bitemporal-modeling/ · https://xtdb.com/blog/launching-xtdb-v2 — valid time vs transaction time; "as we knew it" reconstruction.

**Alert fatigue**
- https://www.exida.com/Alarm-Management/Resources · https://literature.rockwellautomation.com/idc/groups/literature/documents/wp/proces-wp013_-en-p.pdf · https://www.eemua.org/products/publications/digital/eemua-publication-191 — EEMUA 191 / ANSI-ISA-18.2: rate limits, bad-actor concentration (~80% from ≤12 sources), historical suppression of alarm systems.
- https://incident.io/blog/sre-alerting-best-practices · https://sre.google/sre-book/monitoring-distributed-systems/ — actionability test for alerts; attach the runbook to the rule.

**Accessibility**
- https://dequeuniversity.com/resources/wcag2.1/1.4.13-content-on-hover-or-focus · https://sarahmhigley.com/writing/tooltips-in-wcag-21/ · https://www.wcag.com/authors/1-4-13-content-on-hover-or-focus/ — SC 1.4.13: dismissible, hoverable, persistent.

**Internal**
- [`.scratch/pt-os-research/briefs/04-deviations-kpis.md`](../../pt-os-research/briefs/04-deviations-kpis.md) — D4 adherence worked example (64.1% / 75.2%), alert-fatigue and contested-data failure modes, deviation catalog.
- [`.scratch/pt-os-research/briefs/01-planning-flow.md`](../../pt-os-research/briefs/01-planning-flow.md) — fair-share allocation worked example used in §11.4 stacked-mode rendering.
- [`docs/mockups/control-tower.html`](../../../docs/mockups/control-tower.html) — prior sketch; contrast recomputation and tooltip critique in §10.

*Contrast ratios in §10 were computed from the mockup's own CSS custom properties using the WCAG 2.x relative-luminance formula. They are arithmetic, not a citation.*

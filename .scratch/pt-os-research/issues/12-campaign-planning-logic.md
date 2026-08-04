# Visual language and the logic-reveal component

Type: prototype
Status: resolved
Blocked by: 06

## Question

What does this cockpit look and feel like, and how does a number reveal its own logic?

"Highly visual and intuitive", "visually simple", and "can convey all the relevant information" are in tension. Resolve them by making rough alternatives to react to — not one polished take.

Establish:

- **Density and hierarchy** — how much fits on one screen before it stops being readable. The user is an expert operator: simple means *legible*, not sparse.
- **Colour semantics** — the deviation state ramp (on-plan / watch / act) and its meaning. Must survive both light and dark, and must not rely on colour alone. Note the earlier control-tower mockup's dark palette failed accessibility validation — do not repeat it.
- **The logic-reveal component** — the reusable element that shows the rule behind any number, chosen from the patterns found in [Research: making the logic visible without drowning the reader](06-research-explainability-patterns.md). This is the signature component of the whole system; get it right here and every screen inherits it.
- **Number rendering** — tonnes versus pieces versus bundles, Indian numbering conventions, how deltas and percentages are shown, how "no data" differs from "zero".
- **The action affordance** — what a thing that needs your attention looks like versus a thing that is merely informational.

Produce **2–3 distinct alternatives** at rough fidelity, deliberately different in density and tone, and put them side by side for a reaction. Use `/prototype`; consult `dataviz` before any chart styling.

**Done when**: one visual language is chosen, and the logic-reveal component is specified concretely enough that every later screen can use it without re-deciding.

## Answer

Resolved 2026-08-01. Prototype: [prototypes/visual-language.html](../prototypes/visual-language.html), superseded by [prototypes/command-centre.html](../prototypes/command-centre.html).

**Density: Console — the highest of the three offered.** The user chose it outright over the narrative Brief and the card-based Board. Every screen in this system is built at that density: table-first, no folded-away content, minimal chrome, and no click required between one number and the next. Do not reintroduce card layouts or narrative summaries as the primary form; they may appear only as a single narrator line above a dense table.

**Consequences that now bind every later screen:**

- Tables are the default component. A card is the exception and needs a reason.
- Tabs carry **views**, not densities. The user redirected the tab pattern to switch between Flow / Sales / Campaign planning / Campaign monitoring / Inventory. Screen count is therefore low and each screen is deep.
- Every view carries **filters** — plant, family, thickness, finish, distributor, month — as a standing bar, not a hidden panel.
- Numbers must **reconcile across views**. The user asked for "a flow with real numbers": the same tonnes must be traceable from order through campaign, production, dispatch and into stock. Any view that shows a figure the next view contradicts is a defect.

**Visual language fixed:**

| | |
|---|---|
| Neutrals | Cool slate with a blue bias — steel, not generic grey |
| Accent | Steel blue `#1B5E8A` light / `#5FADE0` dark. Interactive only. |
| Semantic | `Act` oxide red · `Watch` amber · `Clear`/`Met` green — separate from the accent, each carrying a distinct glyph shape so state never rests on colour alone |
| Type | Segoe UI Variable for interface, Cascadia Mono/Consolas for every figure, tabular numerals throughout |
| Contrast | All ink tokens verified AA on both grounds. The `--ink-3` failure in the old control-tower mockup is fixed; that mockup is now superseded. |

**The logic-reveal component is `Basis`**, built as the research specified: a dotted underline marks any derived figure; a monospace basis line under key figures carries the substituted arithmetic; clicking opens a right-docked rail with the formula grid (term / live value / source + age), the rule in words, the threshold band, the contribution breakdown, and a counterfactual. Click or `Esc`, never hover. Working in the prototype — judged and accepted.

**Provenance marker added beyond the ticket's scope**: the prototype distinguishes rule-computed figures from system-written narration with a visible marker. This was not asked for here but is required by [The AI trust ladder](14-ai-trust-ladder.md), and proving it early was cheap. Carry it forward.

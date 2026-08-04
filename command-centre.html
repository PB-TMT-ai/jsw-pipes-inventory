# The AI trust ladder

Type: grilling
Status: open
Blocked by: 09, 10

## Question

Four AI modes were chosen for this OS: narrator/drafter, ask-anything query, forecast/recommend, and background watcher. They carry very different risks and cannot share one trust setting.

Decide, per mode, where AI is allowed to **explain**, to **recommend**, and to **act unattended**:

- **Narrator/drafter** — writes the sentence explaining a flag, drafts the message to a distributor. Lowest risk since the math stays deterministic. Decide what it is allowed to assert beyond the numbers, and whether drafts ever send without review.
- **Ask-anything** — the failure mode is a confident wrong answer to a question you did not know to check. Decide whether every answer must show its query and its row count, whether it may only reach agreed metric definitions rather than raw tables, and what it does when it cannot answer rather than guessing.
- **Forecast/recommend** — the highest bar. Decide what evidence must accompany a recommendation before it can appear (backtest performance, the comparison to a naive baseline, the inputs used), and whether a recommendation is ever pre-applied rather than proposed.
- **Background watcher** — decide what it may raise on its own versus what needs a deterministic rule to raise it. The risk is silent omission: a watcher that fails to flag is invisible in a way a wrong flag is not.

Cutting across all four:

- **The bright line** — what is never AI-decided in this business, stated explicitly.
- **Catching wrong output** — how a bad recommendation surfaces before it costs a campaign. Backtesting, a challenge log, or comparison against the deterministic rule that would have fired.
- **Degradation** — what each mode does when data is stale or missing, rather than answering from nothing.
- **Provenance** — how a reader tells at a glance whether a sentence came from a rule or from a model. Given the hard requirement that all logic stays visible, this may be the most important design decision in the ticket.

**Evidence that cuts against the premise** — from [Research: making the logic visible without drowning the reader](06-research-explainability-patterns.md): the CHI literature (Bansal 2021, Poursabzi-Sangdeh 2021, Kaur 2020) repeatedly finds that explanations produce *agreement rather than scrutiny*, and that more transparency made large model mistakes **harder** to catch, not easier. An AI that explains its recommendation persuasively is therefore a risk, not a safeguard. Design this ticket assuming a well-argued AI recommendation will be accepted without checking, and decide what mechanism actually catches a wrong one — the answer is probably a deterministic comparison, not better prose.

**Done when**: each mode has an explicit explain/recommend/act level, the bright line is stated, and the rule-versus-model provenance marker is specified for the visual language to implement.

## Scoped and parked (user, 2026-08-01)

> "AI will be used to maintain the inputs and answer the questions. leave this as of now. will pick from other sessions for this."

**AI's job in this system is two things: maintaining the inputs, and answering questions.** Not recommending, not acting. That removes *forecast/recommend* and *background watcher* from the near-term ladder — the watcher's flags must come from deterministic rules, and recommendations are not a near-term surface. Ticket parked for a later session; do not grill it further here.

**One consequence to carry forward, flagged not argued.** "Maintaining the inputs" is a **write** role, and it is the highest-risk of the four modes, not the lowest — higher than recommending. A bad recommendation announces itself as a recommendation and can be ignored. A bad input does not: it flows into every derived figure, reconciles perfectly across all seven views because everything downstream is computed from it, and is therefore invisible to the reconciliation rule that catches everything else. The `Basis` trail terminates in an operand with a named source — if AI is that source, the trail terminates in a guess wearing the clothes of a fact.

This does not need answering now. It means the *maintaining the inputs* mode, when this ticket is taken up, needs its own treatment: which fields AI may write, what marks an AI-written value on screen and inside `Basis`, and whether such a value is ever accepted without a human confirming it. That belongs with [The derivation-object contract](15-derivation-object-contract.md), which must be able to carry "this operand was written by AI" as a first-class property.

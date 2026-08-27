# Handoff — Activate Lepakshi and Tapi for pipeline data entry

**Written:** 2026-08-27, at the end of a `/grilling` session with the product owner.
**For:** a fresh session that will implement this end to end.
**Branch:** `claude/grill-me-plant-activation-mchiso`, cut from `origin/staging`. PR into **`staging`**, never `main`.

---

## 1. Goal in one line

Let **Lepakshi** and **Tapi** register mother coils, slit them and record production — the same three
shop-floor stages Hyderabad (Nippon) and NPMD already run.

---

## 2. Decisions already taken — do NOT reopen these

Every row below was put to the product owner and answered. Implement them; don't re-litigate them.

| # | Question put | Answer |
|---|---|---|
| 1 | Full pipeline (Coil Inward + Slitting + Production), or attribution-only? | **Full pipeline.** |
| 2 | Both plants together, or one as a pilot? | **Both together, one change.** |
| 3 | Should their stock pool by region — Lepakshi with Nippon in South, Tapi with NPMD in West? | **Yes.** Leave `serves` exactly as seeded. |
| 4 | Create `lepakshi` / `tapi` logins? | **No — deferred.** Admin enters for them for now. |
| 5 | Is there opening stock to type in? | **No.** Both yards are empty of steel coil. Start clean from the first coil that lands. |
| 6 | Commercial model — do we send them steel, or buy finished pipe from them? | **We buy the HR coil and send it to them** (same as Nippon and NPMD). |
| 7 | Anything else different about these two plants? | **No — "everything is same as other plants."** |

Decision 4 is the single deliberate difference from Hyderabad/NPMD. Everything else is symmetric.

---

## 3. Facts verified in that session — trust these, re-check only if something looks wrong

**Code (as of `85b8c88`):**

- `src/data/plants.js` already carries all four plants with ids, ERP Ship From Codes and coil
  prefixes. `LEP-` and `TAP-` exist; nothing new to invent.
- `nextCoilNumber` (`calc.js:72`) counts each plant's coils **separately**, so Lepakshi's first coil
  is `LEP-0826-01` regardless of Hyderabad being on ~313.
- `genHRCoilId` (`calc.js:86`) takes the prefix from the plant's own master row.
- `coilFifoAllocate` (`calc.js:277`) filters by plant **before** every other eligibility rule, and
  sorts FIFO on `dateOfInward` ascending (`calc.js:300`).
- `producedPool` (`calc.js:380`) counts **every** non-deleted production regardless of `status` — an
  `unallocated` row with empty `coilAllocations` is still real stock in the pool.
- `coilInwardPlants()` (`calc.js:1093`) is the **intersection** of `COIL_INWARD_PLANT_IDS` and
  `manufactures`. Both switches must flip or nothing changes.
- `accessFor` (`calc.js:2219`) gives an **admin every tab regardless of plant**. So with no plant
  logins, flipping `manufactures` is currently **inert** — see §7.
- `scripts/servable-orders.mjs` reads the `plants` table and `serves` dynamically (lines 119, 391).
  None of the three report skills name a plant. **No report changes are needed.**

**Live database (`hztblmccvvarmgxmunrp`, "Pipes and Tubes Inventory System"):**

| Table | hyderabad | npmd | lepakshi | tapi |
|---|---|---|---|---|
| `coils` | 313 (27-Mar → 25-Aug) | 13 (21-Aug → 24-Aug) | 0 | 0 |
| `baby_coils` | 2,150 | 6 | 0 | 0 |
| `productions` (live) | 1,287 · 5,124.860 T | 0 | 0 | 0 |
| `orders` | 806 | 144 | 63 | 143 |
| dispatch entries | 668 · 3,807.464 T | 0 | 0 | 0 |

- `app_credentials`: `admin` (all plants), `hyderabad`, `npmd`. Nothing else.
- The `plants` table is **empty** — every service area comes from the seed in `src/data/plants.js`.
- NPMD's two `productions` rows are **soft-deleted**: a dry run on 2026-08-24, one minute apart. One
  was `unallocated` with `coilAllocations: []`; the other allocated **correctly** to `NPM-0826-10-F`
  (mother `NPM-0826-10`). **Plant-scoped FIFO is proven working for a non-Hyderabad plant.** Do not
  treat those rows as a bug.

---

## 4. The code change — two lines that matter

### 4.1 `src/data/plants.js`

Line 61 (lepakshi) and line 70 (tapi):

```diff
-    manufactures: false,
+    manufactures: true,
```

Also update the header comment, lines 25–27, which currently reads:

> `manufactures` whether the plant runs Coil Inward / Slitting / Production. Lepakshi and Tapi
> carry orders and have never produced or invoiced, so they exist for attribution only.
> Reclassifying one is a one-line change to this flag.

All four plants now manufacture. Say so, and keep the "one-line change" promise intact.

### 4.2 `src/lib/calc.js`

Line 1083:

```diff
-export const COIL_INWARD_PLANT_IDS = ['hyderabad', 'npmd']
+export const COIL_INWARD_PLANT_IDS = ['hyderabad', 'npmd', 'lepakshi', 'tapi']
```

`DEFAULT_COIL_PLANT` is `COIL_INWARD_PLANT_IDS[0]` — Hyderabad stays first so the default is
unchanged. **Do not reorder.**

Also update the comment block at lines 1086–1092. It currently says the two mechanisms "happen to
match exactly as of #123". They still match — now across all four — but the sentence about them
diverging "the day a plant lands on the master with `manufactures: true` before Coil Inward is
ready" is now the *only* thing keeping that branch meaningful. Keep the distinction; it is load-
bearing for the tests in §5.4.

**Nothing else in `src/` changes.** `App.jsx` reads `coilInwardPlants()` at line 610 and derives
`scopeDefault` at 491 from it, so both pick the new plants up automatically.

---

## 5. Tests that will break — and how to fix each

Run `npm test` first to see the real list before editing. Expected failures:

### 5.1 `src/lib/calc.test.js:1284`

```js
expect(PLANTS.filter(p => p.manufactures).map(p => p.id)).toEqual(['hyderabad', 'npmd'])
```
→ becomes `['hyderabad', 'npmd', 'lepakshi', 'tapi']`.

### 5.2 `src/lib/calc.test.js:1624–1625`

```js
expect(coilInwardPlants().map(p => p.id)).toEqual(['hyderabad', 'npmd'])
expect(coilInwardPlants().map(p => p.name)).toEqual(['Hyderabad', 'NPMD'])
```
→ all four ids, and names `['Hyderabad', 'NPMD', 'Lepakshi', 'Tapi']`.

### 5.3 `src/lib/calc.test.js:1635–1638`

The "flip either plant off" assertions:
```js
expect(coilInwardPlants(hydOff).map(p => p.id)).toEqual(['npmd'])
expect(coilInwardPlants(npmdOff).map(p => p.id)).toEqual(['hyderabad'])
```
→ `['npmd', 'lepakshi', 'tapi']` and `['hyderabad', 'lepakshi', 'tapi']`. Keep the test — it is what
proves `manufactures` is still the one-line off-switch ADR-0004 promised.

### 5.4 `src/lib/calc.test.js:3111–3203` — the `accessFor` block. **This is the awkward one.**

Lepakshi is the suite's stand-in for "a plant that does not manufacture" (`:3116`) *and*, inverted,
for "a plant that manufactures but is not on the rollout list" (`:3197`). After this change **all
four plants manufacture and all four are on the rollout list**, so two branches of `accessFor` lose
their real-world example:

- `:3116` — `const lepakshi = { role: 'plant', plant: 'lepakshi' }   // manufactures: false`
- `:3143` — `offers the manufacturing tabs only to a plant that manufactures`
- `:3192` — `offers Coil Inward only to a plant on the rollout list, not merely one that manufactures`
- `:3164` — the `[admin, hyd, npmd, lepakshi]` loop still passes; just rename the binding.

**Fix:** exercise both branches against a **constructed master**, the way `:1635` already does —
do not delete the tests. Suggested shape:

```js
// No real plant is non-manufacturing any more (all four were activated 2026-08). These branches
// are still live rules, so they are tested against a constructed master rather than a real plant.
// Name it so the next person knows it is deliberately fictional.
const NON_MFG = [...PLANTS, { id: 'future-depot', name: 'Future Depot', erpCode: 'X', erpNames: [],
                              coilPrefix: 'FUT', manufactures: false, serves: [] }]
const NOT_ROLLED_OUT = [...PLANTS, { ...same but manufactures: true }]
```

`COIL_INWARD_PLANT_IDS` is a module constant and cannot be injected, so a plant id absent from it is
the only way to reach the not-rolled-out branch. `future-depot` satisfies that.

**This is `LEARNINGS.md:155` repeating itself** — *"When a test needs an example of an unmapped
thing, that example is a hostage to the next mapping."* It was KERALA last time; it is Lepakshi this
time. Name the new fixture so it says it is fictional and cannot be activated out from under the test.

### 5.5 `e2e/roles.spec.js:385–396`

`a scope that cannot register coils asks rather than guessing` picks `lepakshi` and expects a **blank**
plant field with Save disabled. After activation, scoping to Lepakshi **pre-selects `lepakshi`** —
correct new behaviour, failing old test.

→ Repoint the test at **Unattributed** (`''`), which is now the only scope that cannot register
coils. Update the comment on line 386, which names Lepakshi and Tapi.

Run `npm run test:e2e` for this one.

---

## 6. Docs to update

| File | Line(s) | What is now wrong |
|---|---|---|
| `src/data/plants.js` | 25–27 | "Lepakshi and Tapi … exist for attribution only" |
| `src/lib/calc.js` | 1086–1092 | comment on the two mechanisms matching "as of #123" |
| `docs/DATA-MODEL.md` | 112 | "**Offered** — Hyderabad and NPMD … Lepakshi and Tapi are never offered here" |
| `docs/DATA-MODEL.md` | 322 | "Lepakshi and Tapi get none — modelled for attribution only" (still true for logins — see §7; reword, don't delete) |
| `docs/adr/0005-*` | 58–62 | "**Hyderabad and NPMD are offered**, via `COIL_INWARD_PLANT_IDS`" |
| `blueprints/manage-app-login.md` | 37–43 | the SEES table header says `hyderabad` / `npmd` |
| `blueprints/manage-app-login.md` | 60–61 | "Lepakshi and Tapi … have never produced or invoiced" |
| `blueprints/manage-app-login.md` | 150–153 | "A plant that does not manufacture (… Lepakshi and Tapi today)" — no longer true |
| `blueprints/add-new-stage-field.md` | 78–83 | add an entry for this change beside the #123 one |
| `CONTEXT.md` | 59 | "Lepakshi and Tapi carry orders and have never produced" |
| `LEARNINGS.md` | append | new entry — see below |
| `docs/ARCHITECTURE.md` | 39 | **check only.** It states the mechanism generically and is probably still correct |

**ADR:** amend **ADR-0005's Consequences**. Do **not** write ADR-0007 — activating a plant is not a
new architectural decision, it is the one-line switch ADR-0004 already promised.

**`LEARNINGS.md` entry** should capture: the fixture-hostage repeat (§5.4), and that flipping
`manufactures` is inert without a plant login (§7) — the kind of half-landed change that reads as
"done" and isn't.

**Ask before creating any new blueprint** (CLAUDE.md rule 4). None is expected to be needed.

---

## 7. The thing most likely to be misreported as "done"

`accessFor` gives an **admin every tab regardless of plant**. There are no `lepakshi` / `tapi`
logins (decision 4). So flipping `manufactures` changes **nothing anyone can see today**.

```
manufactures: true   → gates tabs for a PLANT user → no such user exists yet → inert
COIL_INWARD_PLANT_IDS → gates the Coil Inward plant dropdown for admin → THIS is the visible change
```

The one observable result of this whole change is that **"Lepakshi" and "Tapi" appear in the Coil
Inward plant dropdown**, and that scoping the header selector to either pre-selects it in the form.

Set `manufactures` anyway — the two switches must not drift — but **do not tell the user the plants
are "live for their teams"**. They are live for whoever signs in as `admin`.

---

## 8. Operational note to pass back to the user

With no plant login, whoever registers a Lepakshi coil does it as `admin`, so **plant is a live
dropdown on the one field that has no edit path** (set once at Coil Inward, never editable —
ADR-0005, CLAUDE.md non-negotiable). A wrong pick is a database fix, not a form fix.

Free mitigation worth telling them: **set the header plant selector to Lepakshi first**, and
`scopeDefault` (`App.jsx:491`) pre-selects Lepakshi in the form.

---

## 9. Explicitly out of scope — do NOT do these

- **No logins, no passwords, no SQL against `app_credentials`.** Deferred by decision 4, and no
  password is ever chosen or handled by an agent (`blueprints/manage-app-login.md`).
- **No `serves` edits.** The seed is already correct and decision 3 confirmed it.
- **No opening-stock data entry or backfill.** Both yards are empty (decision 5).
- **No changes to `scripts/` or the three report skills.** Verified plant-agnostic.
- **No Free Stock split by plant** on the Sales tab or in the PB MTD workbook. ADR-0006 left that
  out deliberately and decision 3 upheld it.
- **No new ADR.** Amend ADR-0005.
- **No new tables, columns or migrations.** Nothing in the database changes.
- **Do not delete the `accessFor` tests** in §5.4 because their example plant went away.

---

## 10. Verification before opening the PR

1. `npm test` — green. Confirm §5.1–5.4 were **updated**, not deleted or loosened.
2. `npm run test:e2e` — green. Confirm §5.5.
3. `npm run build` — clean.
4. Manual check with `npm run dev`, signed in as `admin`:
   - Coil Inward → **+ Add Coil** → plant dropdown lists **Hyderabad, NPMD, Lepakshi, Tapi**.
   - Header selector → **Lepakshi** → **+ Add Coil** → plant field pre-selects **Lepakshi**.
   - Header selector → **Unattributed** → **+ Add Coil** → plant field **blank**, Save **disabled**.
   - Masters → Plant Master → **Runs the pipeline** reads **Yes** on all four rows.
   - Sales tab figures for South and West are **unchanged** — there is no Lepakshi or Tapi stock yet,
     so nothing may move. If a number moves, something is wrong.
5. Re-read the diff adversarially before pushing. One validated push beats three speculative ones.

---

## 11. Branch and PR mechanics

```bash
git fetch origin staging
git checkout -B claude/grill-me-plant-activation-mchiso origin/staging
# … work …
git push -u origin claude/grill-me-plant-activation-mchiso
```

PR **into `staging`**. `main` is the live site and only moves when staging is merged, one batch at a
time. Each branch gets its own Vercel preview — see "Deploys (Vercel)" in `docs/ARCHITECTURE.md`.

Do **not** open the PR unless the user asks for one.

---

## 12. Deferred — raise these with the user later, don't act on them now

- **Logins for Lepakshi and Tapi.** The moment they exist, `manufactures` starts doing real work and
  the plant field becomes un-typo-able. `blueprints/manage-app-login.md` §"onboard a further plant
  later" already carries the exact SQL, with `CHOOSE_A_PASSWORD` placeholders for a human to fill.
- **Nobody has confirmed when coil will actually be dispatched to either plant.** Until it is, both
  registers stay empty — which is honest, but it looks identical to "nobody is typing".
- **NPMD has 13 coils and 6 baby coils but zero live productions.** Its loop is not closed either.
  Worth watching alongside these two rather than assuming activation equals adoption.

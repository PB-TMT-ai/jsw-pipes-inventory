# Worked example: Steps 1, 2, 4, 5

*4 distributors, 6 products, one month, real arithmetic. All quantities in tonnes.*

## The setup

Distributors: **Sharma Steels** (Jaipur), **Verma Tubes** (Indore), **Krishna Traders** (Nagpur), **Bhatia Steel** (Ludhiana).

Six products in two size families — this matters later, because the factory can change thickness easily but changing *size* is a big job:

| | Product | Family |
|---|---|---|
| 1 | 40×40, 2.0mm, black | 40mm |
| 2 | 40×40, 2.6mm, black | 40mm |
| 3 | 40×40, 2.0mm, **GI** | 40mm |
| 4 | 50×50, 2.0mm, black | 50mm |
| 5 | 50×50, 3.2mm, black | 50mm |
| 6 | 50×50, 2.0mm, **GI** | 50mm |

## Step 1 — Collect the guesses (25th–27th, for next month)

| Product | Sharma | Verma | Krishna | Bhatia | **Total asked** |
|---|---|---|---|---|---|
| 40×40 2.0 black | 100 | 90 | 150 | 40 | **380** |
| 40×40 2.6 black | 50 | 40 | 60 | 20 | **170** |
| 40×40 2.0 GI | 75 | 50 | 90 | 40 | **255** |
| 50×50 2.0 black | 100 | 80 | 120 | 60 | **360** |
| 50×50 3.2 black | 25 | 30 | 30 | 20 | **105** |
| 50×50 2.0 GI | 50 | 30 | 60 | 20 | **160** |
| **Total** | **400** | **320** | **510** | **200** | **1,430** |

Stopping here would tell the factory to make 1,430 tonnes. That would be a mistake.

## Step 2 — Correct the guesses using each distributor's track record

| Distributor | Habit | Factor | Why |
|---|---|---|---|
| Sharma | Asks 125, takes 100 | **1.25** | Pads so he's never short |
| Verma | Asks 100, takes 100 | **1.00** | Disciplined shop |
| Krishna | Asks 150, takes 100 | **1.50** | Asks big to get more when stock is tight |
| Bhatia | Asks 80, takes 100 | **0.80** | Under-commits to keep his target easy |

Divide each person's ask by their own factor. Bhatia is adjusted **upward** — his problem is the opposite of Krishna's.

| Product | Sharma ÷1.25 | Verma ÷1.00 | Krishna ÷1.50 | Bhatia ÷0.80 | **Realistic** | (was) |
|---|---|---|---|---|---|---|
| 40×40 2.0 black | 80 | 90 | 100 | 50 | **320** | 380 |
| 40×40 2.6 black | 40 | 40 | 40 | 25 | **145** | 170 |
| 40×40 2.0 GI | 60 | 50 | 60 | 50 | **220** | 255 |
| 50×50 2.0 black | 80 | 80 | 80 | 75 | **315** | 360 |
| 50×50 3.2 black | 20 | 30 | 20 | 25 | **95** | 105 |
| 50×50 2.0 GI | 40 | 30 | 40 | 25 | **135** | 160 |
| **Total** | **320** | **320** | **340** | **250** | **1,230** | 1,430 |

**200 tonnes of air removed** — roughly ₹1–1.5 crore of steel you were about to make for nobody. Krishna asked the most (510) but genuinely needs less than Sharma or Verma (340); uncorrected, he would have driven the entire plan.

Then subtract what's already in the yard:

| Product | Realistic need | In stock | **To make** |
|---|---|---|---|
| 40×40 2.0 black | 320 | 60 | **260** |
| 40×40 2.6 black | 145 | 25 | **120** |
| 40×40 2.0 GI | 220 | 20 | **200** |
| 50×50 2.0 black | 315 | 55 | **260** |
| 50×50 3.2 black | 95 | 10 | **85** |
| 50×50 2.0 GI | 135 | 15 | **120** |
| | | | **1,045** |

*(Mill capacity ~1,400 t/month, so no shortage this month — nobody gets cut back.)*

## Step 4 — Turn 1,045 tonnes into a factory timetable

Three facts drive the timetable:

1. Changing 40mm → 50mm means swapping tooling: **~4 hours** stopped plus wasted material.
2. Changing only *thickness* within a size: **~30 minutes**. Cheap.
3. A GI pipe **is** a black pipe until the last step — same machine, same setting, then dipped in zinc afterwards.

So: group by size, run thin-to-thick within each group, let GI ride along with its black twin.

Products 1 and 3 are the same pipe on the machine (2.0mm) — one gets galvanized later. Zero changeover between them:

> **40mm run:** 130t of 2.0 black → 100t of 2.0 (for GI) *— no changeover* → 30-min thickness change → 60t of 2.6 black

One thickness change for three products instead of three separate setups.

Each size runs **twice a month**. Mill does ~250 t/day:

| Day | What runs | Tonnes |
|---|---|---|
| **Mon 5 – Tue 6** | 40mm: 130 + 100(GI) + 60 | 290 |
| *Tue 6 midday* | *tooling swap 40mm → 50mm* | *4 hrs* |
| **Wed 7** | 50mm: 130 + 60(GI) + 45 | 235 |
| **Thu 8** | Zinc tank: the 100 + 60 GI | 160 |
| **Fri 9** | Spare — odd sizes, catch-up | — |
| **Mon 19 – Tue 20** | 40mm again | 290 |
| **Wed 21** | 50mm again | 230 |
| **Thu 22** | Zinc tank | 160 |
| **Fri 23** | Spare | — |

Publish to all distributors like a train timetable, with a boarding deadline:

> **40mm** — made 5th and 19th. Confirm by the **3rd** / by the **17th**.
> **50mm** — made 7th and 21st. Confirm by the **5th** / by the **19th**.
> **GI takes 2 extra days** — it goes through the zinc tank after the pipe is made.

This changes behaviour. When Sharma calls on the 10th for 40 extra tonnes of 40×40, you don't say "we'll try" — you read the timetable: **"made on the 19th, dispatched the 20th."** A real date, in ten seconds, that the factory will hit.

## Step 5 — Make it and ship it

Each distributor gets roughly half his month in each fortnight; GI dispatches two days later because of the zinc tank. ~25 tonnes to a truck:

**First fortnight**

| Distributor | Tonnes | Trucks | Ships |
|---|---|---|---|
| Sharma (Jaipur) | 160 | 6–7 | 7th (black), 9th (GI) |
| Verma (Indore) | 160 | 6–7 | 7th, 9th |
| Krishna (Nagpur) | 170 | 7 | 8th, 9th |
| Bhatia (Ludhiana) | 125 | 5 | 7th, 9th |
| **Total** | **615** | | |

Second fortnight repeats: 615 more tonnes on the 20th–23rd. Month total **1,230 tonnes dispatched** = 1,045 produced + 185 opening stock. It balances exactly.

## The payoff

- **Step 1** gives a demand number a month ahead, instead of reacting to daily phone calls.
- **Step 2** strips ~14% imaginary demand — the difference between a plan and a wish list.
- **Step 4** turns it into a timetable the factory runs at its cheapest, and gives distributors real dates.
- **Step 5** becomes almost boring, which is the goal.

*Note on the arithmetic: this makes exactly what's needed, so the yard ends at zero. In practice keep a small buffer on the two fastest movers so a walk-in order doesn't wait for the next run — a refinement to the quantity, not a change to the flow.*

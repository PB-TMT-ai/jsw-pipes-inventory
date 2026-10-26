# Step 4 deep dive: building next month's factory timetable

*2 plants, 5 mills, 20 sizes. Every number below is illustrative but internally consistent — the arithmetic ties.*

## The rules this follows (from the grilling session)

1. Mills are mostly dedicated; two sizes can flex to a second mill
2. The sequence is rebuilt fresh every month — no fixed wheel
3. Aim for fewest changeovers, but no size waits more than ~2 weeks
4. No GI — single-stage plan
5. Mother coils bought in, all slitting done in-house
6. Coil takes 4–6 weeks to arrive, so next month runs on steel already owned or ordered

**Assumptions:** size changeover 4 hours, thickness-only change 30 minutes, minimum 40 t per item and 150 t per family run, 26 working days, mother coils 1,250 mm and 1,500 mm.

---

## 1. The factory

| Mill | Plant | Makes | Rate |
|---|---|---|---|
| N1 | North | 15 NB and 25 NB round | 80 t/day |
| N2 | North | 40×40 and 50×50 square | 200 t/day |
| N3 | North | 75×75 square | 280 t/day |
| W1 | West | 32 NB round — *can also take 40×40* | 150 t/day |
| W2 | West | 100×50 rectangle — *can also take 50×50* | 260 t/day |

The two italicised lines are the whole flex. Everything else has exactly one home.

## 2. What Step 2 handed over

20 items, 12,695 tonnes. Grouped into 7 families (a family = one size, all its thicknesses — because thickness is a 30-minute change but size is a 4-hour one).

| Family | Items | Tonnes | Home mill |
|---|---|---|---|
| 15 NB round | 2.0mm (220), 2.6mm (180), 3.2mm (60) | 460 | N1 |
| 25 NB round | 2.6mm (340), 3.2mm (260), 4.0mm (35) | 635 | N1 |
| 40×40 square | 2.0mm (1,200), 2.6mm (900), 3.2mm (600), 4.0mm (150) | 2,850 | N2 |
| 50×50 square | 2.0mm (1,100), 2.6mm (800), 3.2mm (450) | 2,350 | N2 |
| 75×75 square | 3.2mm (1,400), 4.0mm (1,100), 4.8mm (500) | 3,000 | N3 |
| 32 NB round | 2.6mm (700), 3.2mm (500) | 1,200 | W1 |
| 100×50 rect | 3.2mm (1,300), 4.0mm (900) | 2,200 | W2 |
| | | **12,695** | |

## 3. Working 1 — which mill makes what

Start by sending everything to its home mill and check if it fits.

| Mill | Tonnes at home | Days needed | Days available | Verdict |
|---|---|---|---|---|
| N1 | 1,095 | 13.7 | 26 | fine |
| **N2** | **5,200** | **26.0 + changeovers** | **26** | **over** |
| N3 | 3,000 | 10.7 | 26 | fine |
| W1 | 1,200 | 8.0 | 26 | fine |
| W2 | 2,200 | 8.5 | 26 | fine |

N2 needs 26 days of pure rolling before a single changeover — impossible. About 600 tonnes has to move, and N2 is exactly the mill with flex partners.

**Which items move?** Rule: move the *smallest* item that frees enough time, because a small item costs one changeover at the destination either way — so you want the cheapest tonnage to buy that changeover.

- 40×40 × 4.0mm (150 t) → **W1**
- 50×50 × 3.2mm (450 t) → **W2**

Cost of moving: two extra 4-hour changeovers, at two mills that have three weeks of slack. Benefit: 3 days freed at the mill that has none. Easy trade.

**The coil check that nearly changed this.** Before confirming, planning checks whether West can actually be fed. The 50×50 × 3.2mm needs a 191 mm strip — a North pattern. If West couldn't produce that strip, the slit coil would have to be trucked 1,200 km and the flex would be a false saving. It turns out West's 3.2mm slitting pattern has room for a 191 mm strip (see section 6), so the flex holds. *This check has to happen before the mill decision, not after.*

## 4. Working 2 — how often each size runs

Rule 3 says nothing waits more than about two weeks. Translated into a schedule rule: **every family gets a run in the first fortnight and another in the second.** So each family splits into two runs of roughly half.

But two smaller rules override that:

- **40 t minimum per item.** 15 NB × 3.2mm is only 60 t for the month. Split in two it becomes 30 t per run — below minimum. So it runs **once**, at 60 t, in the first fortnight only.
- **Anything under 40 t doesn't run at all.** 25 NB × 4.0mm is 35 t. It is **deferred** — held back and added to next month, when it should clear 70 t and be worth a run. The distributor who wanted it gets told now, not on the day it fails to arrive.

## 5. Working 3 — the order inside each run

Within a family, run thinnest to thickest so each change is 30 minutes instead of 4 hours. Here is N2, the choked mill, in full:

| Working days | What runs | Tonnes | Change at end |
|---|---|---|---|
| 1 – 3 | 40×40 × 2.0mm | 600 | 30 min |
| 3 – 5.3 | 40×40 × 2.6mm | 450 | 30 min |
| 5.3 – 6.8 | 40×40 × 3.2mm | 300 | **4 hr — size change** |
| 7.3 – 9.6 | 50×50 × 2.0mm | 468 | 30 min |
| 9.6 – 11.6 | 50×50 × 2.6mm | 400 | **4 hr — size change** |
| 12.1 – 18.9 | 40×40 again (2.0 → 2.6 → 3.2) | 1,350 | **4 hr — size change** |
| 19.4 – 23.7 | 50×50 again (2.0 → 2.6) | 867 | — |
| 24 – 26 | Spare — breakdown buffer, catch-up | — | |

Rolling time 22.2 days, changeovers 1.9 days, total **24.1 of 26 days**. Two days of genuine slack, which is what absorbs a breakdown without the month collapsing.

Note what rule 3 cost: three size changeovers instead of one. That is 12 hours of lost rolling — about 2,400 tonnes of capacity — bought deliberately so that no distributor waits more than a fortnight for a common size.

## 6. Working 4 — from pipe plan to steel

Now the part that decides whether any of this is real.

Each item needs a strip of a particular width. **Critical constraint: one mother coil has one thickness.** So strips can only be pooled onto a coil if they share thickness and grade — never across thicknesses. This means the slitting plan groups by *thickness*, while the rolling plan groups by *size*. They cut across each other, which is the central awkwardness of this business.

**The 2.0 mm coil serves three different families on two different mills:**

| Item | Strip width | Tonnes |
|---|---|---|
| 50×50 × 2.0 | 195 mm | 1,100 |
| 40×40 × 2.0 | 155 mm | 1,200 |
| 15 NB × 2.0 | 61 mm | 220 |

Best pattern from a 1,250 mm coil: **2 × 195 + 5 × 155 + 1 × 61 = 1,226 mm**, leaving 24 mm trim — **1.9% loss**.

**The 2.6 mm coil serves five items across three mills:**

Pattern: **3 × 193 + 2 × 153 + 2 × 125 + 1 × 98 = 1,233 mm**, trim 17 mm — **1.4% loss**. This is the best-pooled thickness you have, precisely because five different products want it.

**The 3.2 mm coil (the big one, 4,570 t):** here 75×75 and 100×50 both want a 291 mm strip — same steel, different plants. Pattern from a 1,500 mm coil: **4 × 291 + 1 × 191 + 1 × 123 = 1,478 mm**, trim 22 mm — **1.5% loss**. That 191 mm slot is what makes the West flex work.

**The 4.8 mm coil is the warning.** Only one product uses it (75×75 × 4.8, 500 t). Best pattern is 5 × 285 = 1,425 mm from a 1,500 coil — **5.0% loss**, three times worse than the pooled thicknesses. A thickness with only one customer always slits badly. Worth asking whether that product earns its place.

There is a small irony worth noticing: the deferred 25 NB × 4.0mm item needed a 93 mm strip, which would have filled the leftover on the 4.0 mm pattern. Dropping a tiny item made a big pattern slightly worse.

**Coil required, including trim:**

| Coil | Pipe tonnes | Trim | Coil tonnes |
|---|---|---|---|
| 2.0 mm × 1250 | 2,520 | 1.9% | 2,569 |
| 2.6 mm × 1250 | 2,920 | 1.4% | 2,961 |
| 3.2 mm × 1500 | 4,570 | 1.5% | 4,641 |
| 4.0 mm × 1500 | 2,150 | 3.5% | 2,228 |
| 4.8 mm × 1500 | 500 | 5.0% | 526 |
| **Total** | **12,660** | | **12,925** |

## 7. Working 5 — what steel we actually have

| Coil | Needed | In yard | In transit | Available | **Short** |
|---|---|---|---|---|---|
| 2.0 × 1250 | 2,569 | 900 | 1,500 | 2,400 | **169** |
| 2.6 × 1250 | 2,961 | 1,200 | 1,800 | 3,000 | — (39 spare) |
| 3.2 × 1500 | 4,641 | 1,100 | 2,600 | 3,700 | **941** |
| 4.0 × 1500 | 2,228 | 800 | 1,400 | 2,200 | **28** |
| 4.8 × 1500 | 526 | 600 | 0 | 600 | — (74 spare) |
| **Total** | **12,925** | **4,600** | **7,300** | **11,900** | **1,138** |

Here is where rule 6 bites. Coil takes 4–6 weeks. **These 1,138 tonnes cannot be fixed for next month.** No amount of chasing changes it. So the plan must be cut by about 1,120 tonnes of finished pipe *now*, while there is still time to tell people, rather than discovered on day 19 when the mill runs out of steel.

**What gets cut:** the items carrying the most finished stock already, and never below their minimum lot.

- 3.2 mm short 941 t → 75×75 × 3.2 second run cut by 500 t (18 days cover in yard), 100×50 × 3.2 second run cut by 441 t (21 days cover)
- 2.0 mm short 169 t → 50×50 × 2.0 cut by 165 t
- 4.0 mm short 28 t → absorbed by tightening the 4.0 pattern

The N2 calendar in section 5 already reflects the 50×50 cut — that is why it shows 935 t and not 1,100 t.

## 8. Working 6 — the coil order to place this week

The order placed now covers the month *after* next, plus the shortfall that could not be covered:

| Coil | Month-after need | Carried shortfall | Spare in hand | **Order now** |
|---|---|---|---|---|
| 2.0 × 1250 | 2,570 | +169 | — | **2,750** |
| 2.6 × 1250 | 2,960 | — | −39 | **2,925** |
| 3.2 × 1500 | 4,640 | +941 | — | **5,600** |
| 4.0 × 1500 | 2,230 | +28 | — | **2,275** |
| 4.8 × 1500 | 525 | — | −74 | **450** |
| | | | | **≈ 14,000 t** |

*(Rounded to whole coil lots.)*

This list is the real output of Step 4 that nobody expects. The timetable tells the factory what to do next month; **the coil order decides whether the month after next is possible at all.**

## 9. What the plan produces, in one place

1. **A run sequence per mill** — 5 calendars like section 5's
2. **A slitting schedule** — derived from those calendars, running 2–3 days ahead of each mill run
3. **A cut list** — 1,120 tonnes deferred for lack of steel, with names against it, communicated now
4. **A deferral list** — items too small to run (25 NB × 4.0mm), rolling into next month
5. **A coil order** — ~14,000 tonnes by thickness and width, placed this week

## 10. The three things this example teaches

**The rolling plan and the slitting plan pull in opposite directions.** Rolling wants to group by size (tooling). Slitting wants to group by thickness (one coil, one thickness). A 40×40 run needs four different coils; a 2.0 mm coil feeds three different families on two mills. Neither can be optimised alone. The practical resolution: **build the rolling sequence first, then slit to that calendar** — the slitting line works to the mill's timetable, not its own convenience, staying 2–3 days ahead.

**Every extra run costs twice.** The two-week guardrail added three size changeovers on N2 — and each of those also forces another slitting setup. When you decide how patient your distributors have to be, you are spending in two places at once.

**Steel decides the plan, not the other way round.** With 4–6 week lead times, next month's ceiling was fixed six weeks ago. The only genuinely free decisions left are *which* products to sacrifice and *how* to sequence what remains. That is why the coil order in section 8 matters more than the timetable in section 5 — the order sets next-but-one month's ceiling, and by the time you're building that timetable, it will be too late to argue with it.

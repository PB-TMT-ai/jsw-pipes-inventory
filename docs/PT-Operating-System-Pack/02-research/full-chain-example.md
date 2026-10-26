# The full chain: from distributor orders to what actually ships

*6 distributors, 20 SKUs, 2 plants, 5 mills. Every number ties — this feeds the [Step 4 deep dive](step4-deep-dive.md).*

## 1. The six distributors

Each has a track record. The "factor" is simply what they ask divided by what they actually take, measured over the last six months.

| Distributor | Region | Factor | What that means |
|---|---|---|---|
| **Sharma Steels** | Jaipur | 1.25 | Asks for 5, takes 4. Pads to be safe |
| **Verma Tubes** | Indore | 1.00 | Asks 100, takes 100. Straight shooter |
| **Krishna Traders** | Nagpur | 1.50 | Asks for 3, takes 2. Asks big to get more when stock is tight |
| **Bhatia Steel** | Ludhiana | 0.80 | Asks for 4, takes 5. Under-commits so his target stays easy |
| **Reddy Pipes** | Hyderabad | 1.25 | Asks for 5, takes 4. Pads like Sharma |
| **Mehta Agencies** | Delhi | 1.00 | Reliable |

These factors are not opinions. They come out of comparing last month's order sheet with last month's invoices, and they get recalculated every month.

## 2. The order book as it arrives (25th–27th)

This is what six salespeople bring back. Tonnes, by SKU.

| SKU | Sharma | Verma | Krishna | Bhatia | Reddy | Mehta | **Asked** |
|---|---|---|---|---|---|---|---|
| 15 NB × 2.0 | 50 | 30 | 69 | 32 | 35 | 36 | **252** |
| 15 NB × 2.6 | 45 | 23 | 51 | 24 | 30 | 33 | **206** |
| 15 NB × 3.2 | 15 | 9 | 21 | 8 | 10 | 7 | **70** |
| 25 NB × 2.6 | 75 | 52 | 105 | 36 | 65 | 61 | **394** |
| 25 NB × 3.2 | 55 | 40 | 84 | 36 | 50 | 35 | **300** |
| 25 NB × 4.0 | 5 | 6 | 15 | 4 | 5 | 6 | **41** |
| 40×40 × 2.0 | 300 | 180 | 375 | 120 | 250 | 180 | **1,405** |
| 40×40 × 2.6 | 225 | 140 | 285 | 88 | 185 | 132 | **1,055** |
| 40×40 × 3.2 | 150 | 90 | 195 | 56 | 125 | 90 | **706** |
| 40×40 × 4.0 | 40 | 20 | 51 | 16 | 30 | 20 | **177** |
| 50×50 × 2.0 | 250 | 190 | 345 | 112 | 235 | 152 | **1,284** |
| 50×50 × 2.6 | 185 | 130 | 249 | 80 | 175 | 116 | **935** |
| 50×50 × 3.2 | 105 | 70 | 144 | 44 | 100 | 65 | **528** |
| 75×75 × 3.2 | 325 | 220 | 375 | 136 | 375 | 200 | **1,631** |
| 75×75 × 4.0 | 250 | 175 | 315 | 104 | 290 | 153 | **1,287** |
| 75×75 × 4.8 | 110 | 80 | 159 | 48 | 120 | 70 | **587** |
| 32 NB × 2.6 | 165 | 115 | 216 | 72 | 150 | 99 | **817** |
| 32 NB × 3.2 | 120 | 80 | 156 | 52 | 105 | 71 | **584** |
| 100×50 × 3.2 | 320 | 205 | 405 | 128 | 250 | 209 | **1,517** |
| 100×50 × 4.0 | 210 | 145 | 285 | 88 | 165 | 155 | **1,048** |
| **Total** | **3,000** | **2,000** | **3,900** | **1,284** | **2,750** | **1,890** | **14,824** |

Look at the bottom row before anything else. Krishna asks for 3,900 tonnes — more than anyone. Bhatia asks for 1,284 — the least. If you plan off this row you will build a month for Krishna and starve Bhatia. Both would be wrong.

## 3. The correction

Divide each distributor's number by his own factor. Take one row — 40×40 × 2.0mm, your biggest seller:

| | Sharma | Verma | Krishna | Bhatia | Reddy | Mehta | Total |
|---|---|---|---|---|---|---|---|
| Asked | 300 | 180 | 375 | 120 | 250 | 180 | **1,405** |
| Divide by | 1.25 | 1.00 | 1.50 | 0.80 | 1.25 | 1.00 | |
| **Real** | **240** | **180** | **250** | **150** | **200** | **180** | **1,200** |

Krishna's 375 becomes 250. Bhatia's 120 becomes **150** — he gets adjusted *up*, because his habit is the opposite. That single row moved 205 tonnes of imaginary demand out of the plan.

Across all 20 SKUs:

| SKU | Asked | **Real** | Air |
|---|---|---|---|
| 15 NB × 2.0 | 252 | **220** | 32 |
| 15 NB × 2.6 | 206 | **180** | 26 |
| 15 NB × 3.2 | 70 | **60** | 10 |
| 25 NB × 2.6 | 394 | **340** | 54 |
| 25 NB × 3.2 | 300 | **260** | 40 |
| 25 NB × 4.0 | 41 | **35** | 6 |
| 40×40 × 2.0 | 1,405 | **1,200** | 205 |
| 40×40 × 2.6 | 1,055 | **900** | 155 |
| 40×40 × 3.2 | 706 | **600** | 106 |
| 40×40 × 4.0 | 177 | **150** | 27 |
| 50×50 × 2.0 | 1,284 | **1,100** | 184 |
| 50×50 × 2.6 | 935 | **800** | 135 |
| 50×50 × 3.2 | 528 | **450** | 78 |
| 75×75 × 3.2 | 1,631 | **1,400** | 231 |
| 75×75 × 4.0 | 1,287 | **1,100** | 187 |
| 75×75 × 4.8 | 587 | **500** | 87 |
| 32 NB × 2.6 | 817 | **700** | 117 |
| 32 NB × 3.2 | 584 | **500** | 84 |
| 100×50 × 3.2 | 1,517 | **1,300** | 217 |
| 100×50 × 4.0 | 1,048 | **900** | 148 |
| **Total** | **14,824** | **12,695** | **2,129** |

**2,129 tonnes of air — 14.4%.** At roughly ₹55,000 a tonne that is about ₹11.7 crore of steel you were about to buy, roll and store for nobody.

And the distributors' true sizes are nothing like their order sheets:

| | Asked | Real need | Reality vs ask |
|---|---|---|---|
| Krishna | 3,900 | 2,600 | asks 50% more than he needs |
| Sharma | 3,000 | 2,400 | asks 25% more |
| Reddy | 2,750 | 2,200 | asks 25% more |
| Verma | 2,000 | 2,000 | exact |
| Mehta | 1,890 | 1,890 | exact |
| Bhatia | 1,284 | **1,605** | asks 20% *less* than he needs |

## 4. What the factory sees

Those 20 SKUs collapse into 7 families — a family being one size with all its thicknesses, because thickness is a 30-minute change and size is a 4-hour one.

| Family | Tonnes | Home mill | Fits? |
|---|---|---|---|
| 15 NB + 25 NB round | 1,095 | N1 (80 t/day) | yes, 13.7 of 26 days |
| 40×40 + 50×50 square | 5,200 | N2 (200 t/day) | **no — 26 days before a single changeover** |
| 75×75 square | 3,000 | N3 (280 t/day) | yes, 10.7 days |
| 32 NB round | 1,200 | W1 (150 t/day) | yes, 8 days |
| 100×50 rect | 2,200 | W2 (260 t/day) | yes, 8.5 days |

N2 is over. Two items move to the West plant on the flex: 40×40 × 4.0mm (150 t) to W1, and 50×50 × 3.2mm (450 t) to W2 — the smallest items that free enough time, because a small item costs the same changeover at the destination as a big one would.

The full mill-by-mill sequence, the thickness ladders and the slitting patterns are in the [Step 4 deep dive](step4-deep-dive.md).

## 5. Then steel says no

Converting the plan into strip widths and coils gives a requirement of 12,925 tonnes of mother coil. Against that:

| Coil | Needed | In yard + in transit | **Short** |
|---|---|---|---|
| 2.0 mm × 1250 | 2,569 | 2,400 | **169** |
| 2.6 mm × 1250 | 2,961 | 3,000 | — |
| 3.2 mm × 1500 | 4,641 | 3,700 | **941** |
| 4.0 mm × 1500 | 2,228 | 2,200 | **28** |
| 4.8 mm × 1500 | 526 | 600 | — |
| **Total** | **12,925** | **11,900** | **1,138** |

Coil takes 4–6 weeks. **Nothing can be done about this for next month.** So roughly 1,141 tonnes of finished pipe comes out of the plan now, while there is still time to tell people:

- **75×75 × 3.2** cut 500 t (from 1,400 to 900) — 18 days of stock already in the yard
- **100×50 × 3.2** cut 441 t (from 1,300 to 859) — 21 days of stock
- **50×50 × 2.0** cut 165 t (from 1,100 to 935)
- **25 NB × 4.0** dropped entirely (35 t) — too small to be worth a run at all; it rolls into next month at ~70 t

## 6. What each distributor actually gets

The cut is spread pro-rata across everyone's share of those SKUs — nobody is protected, nobody is singled out.

| | Asked | Real need | **Gets** | vs his ask | **vs his real need** |
|---|---|---|---|---|---|
| Sharma | 3,000 | 2,400 | **2,187** | 73% | **91%** |
| Verma | 2,000 | 2,000 | **1,816** | 91% | **91%** |
| Krishna | 3,900 | 2,600 | **2,375** | 61% | **91%** |
| Bhatia | 1,284 | 1,605 | **1,464** | **114%** | **91%** |
| Reddy | 2,750 | 2,200 | **1,993** | 72% | **91%** |
| Mehta | 1,890 | 1,890 | **1,719** | 91% | **91%** |
| **Total** | **14,824** | **12,695** | **11,554** | 78% | **91%** |

**Read the last column.** Every single distributor gets 91% of what he genuinely needs. That is the whole point of the correction — the shortage is shared perfectly evenly, and it is impossible to improve your position by exaggerating.

Now read the column before it, because that is what they will actually see and argue about:

- **Krishna** gets 61% of his ask and will be the loudest voice in the room. He has no case: he got the same 91% of real need as everyone. The order sheet is the evidence.
- **Bhatia** gets 114% of his ask — more pipe than he requested. He is not being rewarded; he is being *corrected*, because his habit of under-asking would otherwise have starved a market that genuinely wanted the material.
- **Verma and Mehta**, who tell the truth, see 91% both ways. Their number never gets touched. Over time this is the strongest argument you have for why the others should stop gaming.

## 7. What gets communicated, and when

All of this is settled around the 28th of the *previous* month. Six conversations happen then:

| To whom | Message |
|---|---|
| All six | "You're getting about 91% of your real requirement this month. Steel is short and it's shared evenly." |
| Krishna | The order sheet vs invoice history, plainly. His ask no longer buys him anything |
| Bhatia | "We're sending you more than you asked for, because your last six months say you'll need it" |
| Everyone wanting 75×75 × 3.2 and 100×50 × 3.2 | Named cut, with quantity, three weeks before they'd have found out the hard way |
| Whoever wanted 25 NB × 4.0 | "Not made this month — 35 tonnes isn't a run. It goes in next month's batch" |
| Purchase | Order ~14,000 t of coil **this week** — the shortfall plus the month after next |

The 1,141-tonne cut is not the failure here. The failure would have been discovering it on day 19, with six distributors already promised material that was never going to exist.

## What this chain shows

**The order book is not demand.** 14,824 tonnes was asked for; 12,695 was real; 11,554 could be made. Three different numbers, and only the middle one should ever drive a factory.

**Correcting for habit is what makes shortage fair.** Without it, Krishna's exaggeration would have taken capacity from Bhatia's genuine market. With it, everyone lands on the same 91%.

**The binding constraint was set six weeks ago.** Nothing decided this month could change the 1,138-tonne coil gap. The only real choices left were *which* products to sacrifice and *who to tell, when* — which is exactly why the coil order in section 7 matters more than the timetable.

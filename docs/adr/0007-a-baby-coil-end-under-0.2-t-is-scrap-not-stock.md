# A baby-coil end under 0.2 T is scrap, not stock

A baby coil counts as stock only when it is **not deleted**, **not operator-marked `consumed`**, and
still holds at least **0.2 T**. One helper — `babyCoilIsStock` — decides it, and every screen that
counts, offers or reports baby-coil stock reads that helper.

## What was happening

On 28-Aug-2026 the Hyderabad plant team sent their slit-coil stock: **170 baby coils, 415.214 T**.
The app's Dashboard read **841.137 T**. Nothing was wrong with the plant's list — all 170 of their
coils were in `baby_coils`, and their slit weights matched to within 0.11 T. The whole gap was
tonnage the app was still holding:

```
841.137  Dashboard "Baby Coils Left"
-234.478  1,430 part-used ends the floor had already scrapped
-116.659  24 NPMD + Tapi coils (the plant file is Hyderabad only — correctly absent)
- 79.910  33 Hyderabad coils with no production entry against them
+  5.124  already booked against the plant's own 170
=415.214  the plant's count
```

Two of those four lines were the app's fault, and they had different causes.

**The ends.** Production rarely lands on a coil's last kilo, so FIFO leaves a remainder every time
and the app carried each one forever. 1,430 coils averaged **0.16 T** left; 1,163 of them held under
a tenth of a tonne, together 138.568 T. Worse, the allocator kept *offering* those ends, so each run
created a few more — the suggestion list was itself the scrap generator.

**The flag.** An operator marking a coil **Consumed** hid it from the Production picker but not from
the Dashboard card, which filtered on `deleted` alone. 331 coils that operators had already retired
still added **17.111 T** to the headline. The Raw Material report used the third rule again — it
dropped `consumed` coils but kept every sliver — and its own comment admitted it "may trail the
Dashboard card". Three screens, three definitions of the same tonnage.

## The decision

**`SCRAP_FREE_MT = 0.2`, and one `babyCoilIsStock` behind every screen.**

Three separate facts stop a baby coil being stock, and none is derivable from the others:

| | means | who says so |
|---|---|---|
| `deleted` | the row should never have existed | whoever deleted it |
| `consumed` | the floor finished this coil | an operator — the app cannot derive it |
| free < 0.2 T | what is left is end crop | the rule in this ADR |

The floor sits in the Production **adapter**, ahead of `coilFifoAllocate`, not only on the reports
that count stock. Putting it only on the count would leave the mechanism that creates the scrap
running. `coilFifoAllocate` itself stays generic over any coil and learns nothing about baby coils.

`babyCoilFree` is deliberately **not** floored at zero. A coil consumed beyond its own weight is a
fault to see — that is how 445 baby coils came to hold 123.3 T they never had — not one to hide
behind a `Math.max` in the helper everything reads. The floor comparison rounds free weight **to the
kilogram** before testing, because `1 − 0.8` is `0.19999999999999996` in binary floating point and a
coil sitting exactly on the floor is stock, not crop. Weights are stored and displayed to three
decimals, so the kilo is the real precision of the number being compared.

## What this does not do

**It does not scrap anything.** No row is written, no coil is deleted, no `consumed` flag is set.
The steel is still on the floor and still in the table; the app has stopped calling it available.
Coil Tracker shows those coils as **Scrap**, the section footer prints the dropped tonnage next to
the counted tonnage, and the **Status** filter lists them — so the number that left the headline is
one click away, never silently gone.

**It does not explain the 33 coils.** 79.910 T of Hyderabad baby coils show 0.000 T consumed in the
app and are not on the plant's floor list. Seven mothers tell the story: **HYD-0626-198** was slit
into A–I and **HYD-0626-202** into A–I, and in both cases the plant holds only letter **H** while
the app still shows **A–G whole**. Those coils were run and no Production entry was ever saved
against them. That is a data hole only the plant can close, not a rule the app can infer, so it is
listed in `reports/Baby-Coils-Unaccounted-2026-08-30.xlsx` for the plant to answer coil by coil.

## Effect

On the 30-Aug-2026 database the card reads **1,099.198 T → 998.519 T**, and the coil count behind it
falls from **1,741 to 638**. The Consumed flag is worth **17.109 T** across 331 coils and the scrap
floor **83.570 T** across 772. (The card moved from the 841.137 T of the 28-Aug reconciliation above
because slitting carried on in between — the four-line split is what is stable, not the total.)

The remaining distance to the plant's count is the 33 unaccounted coils plus NPMD/Tapi, both of
which are answers the app is right not to invent.

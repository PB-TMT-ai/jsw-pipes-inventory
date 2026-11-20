---
status: accepted — owner decisions, Nov-2026 (approved step by step on the Vercel preview)
---

# Every dashboard lives under one Dashboards tab, two layers deep

There is one app tab for reading the business, **Dashboards** (`APP_TABS` key `dashboard`, so no role
grant moved). Under it there are exactly two layers: a row of dashboards, then that dashboard's screens.
No dashboard has a third row of tabs.

```
Dashboards
├─ Inventory      Overview · Stock movement · Plant-wise Tracker · Activity
├─ Plant drill    Coil & FG grid · Old coil · Slit waiting · FG age · FG days of cover
├─ Coil Tracker   Stock now · Movement by month · Coil ledger
├─ Sales          This month · Distributor · Size × Thickness · Production check · SKU list · Month-wise · Dispatch
└─ FM / MM / SM   Overview · Worklists · Production check · SKU list        (admin only)
```

## Why

Before this, the same kind of reading sat at three different depths. Coil Tracker and Sales were app
tabs of their own; the Dashboard had five screen tabs, one of which (Plant drill) had its own tab row;
Sales had a "Sales view" strip, and under it FM / MM / SM had a third row ("Status key",
"Make next · Stock stuck", "By FM / MM / SM"). The Dispatch summary sat on the 4. Dispatch tab above
the invoice list. A reader had to remember where each figure lived and how many rows down it was. The
owner chose one place and a fixed depth, and approved each step on the preview.

## What moved where

| Was | Now |
|---|---|
| App tab **Dashboard** | App tab **Dashboards** (same key) › Inventory |
| Dashboard › Plant drill (screen with its own tabs) | Dashboards › **Plant drill** (a dashboard; its tabs are its screens) |
| Dashboard › Sales & activity | Inventory › **Activity** |
| App tab **Coil Tracker** | Dashboards › Coil Tracker |
| App tab **Sales** (Sales view strip: Sales Dashboard / FM / MM / SM) | Dashboards › Sales, and Dashboards › FM / MM / SM |
| Sales' Size × Thickness views (Size × Thickness / Production check / SKU list buttons) | Sales screens |
| 4. Dispatch tab's summary (`DispatchOverview`) | Sales › **Dispatch**. "4. Dispatch" keeps only its invoice list |
| FM / MM / SM › Status key tab | FM / MM / SM › **Overview**: the Status key as a matrix on top of the region grid |
| FM / MM / SM › Make next · Stock stuck tab | FM / MM / SM › **Worklists** (the lists, no grid) |
| FM / MM / SM › By FM / MM / SM tab (stacked tables) | the **Split by tag** switch on the grid: one table, group rows |
| FG age in every FM block and on Production check / SKU list | Sales › Size × Thickness only |
| Inventory's "Coil stock report CSV" | removed |

The design rules that came with it (pinned rows, one-line strip, one control row, one Export menu, T on
screen, one control system) are in `DESIGN.md`.

## Consequences

- **No figure, rule or CSV changed.** Every export item calls the function its old button called, so
  files are byte-identical; CSV headers keep their names even where the screen label changed
  (`Free Inventory (T)` under Free after reserved and Free in area; MT where they said MT).
- No table or grid was restyled. Restyling one needs the owner's confirmation first (`DESIGN.md` §7).
- Plant logins get the same tab; their dashboard row stops at Sales — FM / MM / SM stays behind
  `accessFor().fmMmSmSubTab`.
- FM / MM / SM's region switch gained **All** (owner, 20-Nov-2026): every region one under the other, never added up.
- A Status key pick now holds on every FM / MM / SM screen until its chip clears it (it used to clear
  when the tab changed). Clicking a SKU in Worklists opens Overview and rings its cell.
- The last screen per dashboard is kept on the device (`jsw:dashScreen`, `{ board, screens }`). An old
  stored value from before this change is unreadable and simply opens Inventory › Overview.
- Left for the owner — same name, different rule, not touched here: Old coil "> 30 d" vs Coil Tracker
  "Act, 61+ d"; three definitions of "Current inventory"; status word "OK" (Inventory) vs "Clear"
  (Coil Tracker); Coil Tracker's as-of date is `localToday()` while the other dashboards use `today()`.

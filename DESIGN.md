# Dashboards — design rules

The rules every dashboard screen follows. Scope: the **Dashboards** tab only (pipeline stages,
Masters, Orders, Planning and Reports keep their own patterns in `docs/UI-PATTERNS.md`).
Decided by the owner, step by step on the Vercel preview, Nov-2026. Why: `docs/adr/0018-one-dashboards-tab.md`.

## 1. Two layers, never three

```
App tab bar      Dashboards                                   (APP_TABS key `dashboard`)
Layer 1          Inventory · Plant drill · Coil Tracker · Sales · FM / MM / SM      ScreenTabs, group "Dashboard"
Layer 2          the open dashboard's screens                 Segmented role="tablist", "<board> screens"
```

| Dashboard | Screens |
|---|---|
| Inventory | Overview · Stock movement · Plant-wise Tracker · Activity |
| Plant drill | Coil & FG grid · Old coil · Slit waiting · FG age · FG days of cover |
| Coil Tracker | Stock now · Movement by month · Coil ledger |
| Sales | This month · Distributor · Size × Thickness · Production check · SKU list · Month-wise · Dispatch |
| FM / MM / SM (admin only, `accessFor().fmMmSmSubTab`) | Overview · Worklists · Production check · SKU list |

- A new view is a **screen** on one of these rows, never a third row of tabs. A switch inside a
  screen is a `Segmented` *control* (pick one), not a tab.
- The config is `DASHBOARDS` in `src/App.jsx`. The open dashboard and each one's last screen are a
  device preference in `jsw:dashScreen` (`{ board, screens }`), never data. An unreadable or
  not-granted value opens the first.

## 2. Look C — dense console

- **Pinned rows.** The two tab rows and the dashboard's control row are `position: sticky` under the
  app header. Their offsets are **measured** (`Dashboards` reads the header's and its own heights
  into `--dash-top2`), never hard-coded — the header wraps on a narrow screen.
- **One-line strip.** `KpiStrip` is a single line of figures between two thin rules. A text `sub` is
  the figure's hover, not a second line. It replaced Sales' coloured cards, Dispatch's area tiles,
  Coil Tracker's title block and six fields, and the Coil record's stage boxes.
- **Block headings 14 px** (`text-sm font-semibold`, `DashBlock`). No cards, no shadows, no tints.

## 3. The control row

One per dashboard, `DashControls`:

```
[ scope · as of <date> ]                        [ filters … ]  [ Export ▾ ]
  (second, smaller line: a period, if any)
```

- **Left:** what the numbers cover (header plant or region) and the as-of date.
- **Right:** the dashboard's own filters, then **one** `Export ▾`.

## 4. Export

- Every CSV a dashboard makes is an item in its one `Export ▾` menu. **No loose CSV buttons.**
- The menu lists the **open screen's** files. Inventory is the exception: it lists all of its
  screens' files, as it did before.
- An item calls the same function its old button called, so the file is byte-identical. CSV
  **headers do not change** with screen labels (e.g. `Free Inventory (T)` stays).
- Inventory's "Coil stock report CSV" is gone.

## 5. Units

- **T is the only unit on screen.** `FlatTable` headers print `screenT` (T, not MT).
- CSV headers keep what they said (MT where they said MT) — a spreadsheet looks them up by name.

## 6. One system

| Thing | Rule |
|---|---|
| Control height | **32 px** (`h-8`). `MultiSelectFilter compact`, date inputs and `Export ▾` all match. |
| Pick one of several | `Segmented` (e.g. "Show families", "Show one measure" on Sales; "Show view" + **More ▾** on FM / MM / SM). Never a row of chip buttons. |
| On / off | a checkbox with `role="switch"` (e.g. **Split by tag**). |
| Help | a folded `<details>` whose summary uses `HELP_SUMMARY` ("How …", "About …"). One look everywhere. |
| Nothing to show | one grey line, `DASH_EMPTY`, left-aligned. |
| A grid's title | the scope only ("All Distributors", "South") — it never repeats the screen name. |
| Days-of-cover key | "Key: days of cover" button beside the Status key and the "Worklists · <region>" heading. |

## 7. Never restyle a table or grid without the owner's confirmation

The dashboards work changed navigation, the control row, the strip and the names. **No table or
grid was restyled** — cell colours, tints, the Tracker grid, the drill grids and the size grid are
as they were. A change to how a table or grid looks is shown to the owner first, on a preview.

- **Alignment:** a cell's content aligns the way its column head does. Right-aligned heads (thickness columns) get
  right-aligned figures **and** pills, so a pill never reads as the column to its left (owner-confirmed fix, 20-Nov-2026).

## 8. Names

| On screen | Means | Note |
|---|---|---|
| **Coil days of cover** | raw-material stock (HR + slit) ÷ (Produced 30d ÷ 30) | Coil Tracker |
| **FG days of cover** | Current inventory ÷ (Invoiced 30d ÷ 30) | Plant drill, FM / MM / SM |
| **FG days of cover (blended)** | stock now ÷ (Blended monthly rate ÷ 30) | unchanged |
| **Free after reserved** | Current inventory − Reserved, one SKU, company-wide | Inventory › Activity |
| **Free in area** | Current inventory at the plants serving the area − the area's Confirmed | Sales › Distributor drill |

The last two replace the screen name "Free Inventory"; their CSV headers still say `Free Inventory`.
Definitions: `CONTEXT.md`.

---
status: accepted — supersedes the naming in ADR-0008
---

# "Pending to Dispatch" is the whole open book, on every surface

**Pending to Dispatch** is Confirmed + Non-confirmed, the whole open order book, on the app screens,
the PB MTD workbook and the daily messages. The stock-backed figure (Confirmed + Servable –
Unconfirmed) is now called **Dispatchable from Inventory**. *Pending to Serve* is retired, because it
was a second name for the whole book.

## Why

ADR-0008 gave the name to the small figure, but only in the workbook and the WhatsApp message. The
screens kept the old meaning "for now". So the same words meant two numbers, side by side, for two
months:

```
16-Nov-2026, live data
  App screens         Pending to Dispatch   855.1 T   Confirmed 106.0 + Non-confirmed 749.1
  Workbook, WhatsApp  Pending to Dispatch   106.0 T   Confirmed 106.0 + Servable – Unconfirmed 0.0
```

The user chose to keep the name on the figure the screens, their CSVs and most readers already used,
and to give the stock-backed figure a name that says what it is. That is the smaller move: the
Dashboard and Sales cards and their CSVs keep the name they had. What is relabelled is the Dispatch
tab's service-area tiles, the workbook's KPI card, its Servable-by-Region block, the Order Status
line and the WhatsApp line. No number moves anywhere.

Four CSV headers follow their screen labels and do change: the Dispatch tab's Areas CSV
(`Dispatchable from Inventory`), its plant table and the Plant drill CSV (`Pending to Serve` →
`Pending to Dispatch`), and the Sales distributor drill CSV (`Free Stock (T)` → `Free Inventory (T)`).
A spreadsheet that looks those columns up by name must be updated.

## Consequences

- Anyone used to reading "Pending to Dispatch" on the WhatsApp message since Sep-2026 now sees that
  line as **Dispatchable from Inventory**. The number is the same; only the name changed.
- Code keeps the identifier `pendingToDispatch` for the stock-backed figure (`buildServableSummary`,
  `scripts/daily-splits.mjs` JSON). It is a legacy name, like `babyCoilId`. It is never printed.
- `src/lib/glossary-names.test.js` fails if *Pending to Serve* comes back, or if any surface defines
  Pending to Dispatch as Confirmed + Servable.

# Plant is keyed on the ERP's Ship From Code, not the CM name

Every order line now carries the plant that will make it. The One Helix workbook offers two ways to
say which plant a line belongs to, and they are not equally trustworthy:

| | Orders sheet | Invoice sheet |
|---|---|---|
| Code | `Ship From Code` — `V2482-2973-JODL-4144` | `Ship From Code` — same column, same values |
| Name | `CM name` — `NIPPON PIPES PRIVATE LIMITED` | `Ship from location` — same strings, different header |

**Plant resolves from the code. The name is a fallback only.**

The name looks like the friendlier key — it is what a human would read, and it is what the spec's own
evidence table is sorted by. It is also the field that can change without anything changing. A
company can be renamed, re-cased, or have its legal suffix edited in the ERP's master data and the
plant it describes is the same shed with the same mill in it. The code cannot: it is the ERP's
identifier for the shipping location, and if it changes, the ERP is describing a different place.

Three concrete properties decided it:

1. **The code is one column; the name is two.** `CM name` and `Ship from location` are the same
   value under different headers in the two sheets. Keying on the name means maintaining a list of
   header aliases per sheet, and a header the ERP renames lands every line of that sheet in
   Unattributed. `Ship From Code` is spelled identically in both.
2. **The code already matched across both sheets for Hyderabad** in the 18-Aug-2026 file — which is
   what establishes that one identity spans an order and its invoice, and therefore that Phase 3's
   invoice-side attribution can use the same key.
3. **Name matching degrades quietly, code matching does not.** A near-miss name — `NIPPON PIPES`
   against `NIPPON PIPES PRIVATE LIMITED` — invites fuzzy matching, and fuzzy matching is how a
   fifth company gets silently absorbed into a fourth. An unrecognised code has exactly one possible
   reading: this is not a plant we know.

This is the same discipline the `state → region` work follows, for the same reason. Region is the
one thing a human types; state is never typed, because it comes off the ERP row. Plant is likewise
never typed. Nothing an operator does can make a line's plant drift from what the ERP said.

## Unattributed is not a fifth plant

An unresolved line stores a blank plant and displays **`Unattributed`**, mirroring `Unmapped` in the
region master precisely:

- It is not in `PLANT_IDS`, so nothing can iterate the plants and get five.
- It is never a "rest" bucket — its tonnage stays inside every total. A missing mapping is a
  labelling gap, never a reason for weight to leave a sum.
- It is surfaced in the upload banner, so it gets fixed rather than filtered away.

The banner count is load-bearing rather than cosmetic. NPMD's Ship From Code has never appeared on
an invoice — NPMD has raised none — so the assumption that `V1865-2222-JODL-4081` will show up in
the Invoice sheet the way it does in Orders becomes fact only on the day NPMD invoices. The count is
what turns that from a silent mis-attribution into a line somebody reads that morning.

## Why the plant master is a code constant, not a table

`state_regions` is a table because a human maps states to regions, there are 38 of them, and the
mapping is a judgement that changes. The plant master is none of those things: four rows, every
field of which is either an ERP identifier or a label, and nothing in it for an operator to type.
Putting it in Postgres would add a sync path, a seed-vs-stored layering rule, and an editing UI, in
exchange for a row nobody edits. It lives in `src/data/plants.js` with fixed literal ids.

## Consequences

- `orders.plant` stores the **id** (`hyderabad`, `npmd`, `lepakshi`, `tapi`), never the label. A
  plant can be renamed on screen without orphaning a single row.
- Screens show the short name only. `New Pashchim Maharashtra Patra Depot` does not reach a user.
- An unrecognised Ship From Code **imports** as Unattributed. It never fails the upload — a fifth
  company appearing in the ERP must not stop the daily file loading.
- `resolvePlant` is a pure helper in `src/lib/calc.js`, called from `mapOrderRow`. This keeps the
  one existing test seam rather than opening a second, at the cost that the ERP **column-name**
  matching (`shipfromcode` / `cmname`) is covered only by the upload banner, not by a unit test —
  the same trade the `state → region` work made.
- The `manufactures` flag makes reclassifying a plant a one-line change. NPMD's ERP name ends in
  "Depot" and it is modelled as manufacturing on explicit instruction; if it turns out to be a
  stocking depot, one flipped boolean takes it back off the shop floor. That promise was collected
  in the opposite direction by ticket #156, which flipped Lepakshi's and Tapi's — and found the
  flag alone insufficient, because Coil Inward gates on `COIL_INWARD_PLANT_IDS` as well. Removing
  a plant is still one line; **adding** one is two. See `docs/adr/0005`.
- Attribution alone does not fix that reports compare four plants' Pending to Dispatch against one
  plant's Invoiced. It makes that mismatch visible, which is the intent; labelling it is Phase 4.

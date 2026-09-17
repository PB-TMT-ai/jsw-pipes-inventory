# Invoice-side plant resolves from the Zoho warehouse name, and that name is also the filter

Ticket #192 moved the invoice source off the One Helix ERP workbook's `Invoice` sheet and onto the
**Zoho invoice register**. The register is a thinner and wider file, and one missing column changes
a decision `docs/adr/0004` made:

| | ERP `Invoice` sheet | Zoho invoice register |
|---|---|---|
| Code | `Ship From Code` — `V2482-2973-JODL-4144` | **none** |
| Name | `Ship from location` — `NIPPON PIPES PRIVATE LIMITED` | `Warehouse Name` — `Wanaparthy_One Helix` |
| Scope | the four Private Brand plants | **44 warehouses**, every business segment, 6,736 rows |

**On the invoice side, plant now resolves from `Warehouse Name`, and a row it cannot place is
dropped rather than stored as `Unattributed`.** ADR-0004 continues to govern the Orders sheet
unchanged: that sheet still carries `Ship From Code`, and that is still what an order line's plant
is resolved from.

## Why the departure is forced

ADR-0004 chose the code on three properties, and the register keeps none of them. There is no code
column to key on, so "the code is one column, the name is two" and "the code already matched across
both sheets" are moot. What is left is the third — *name matching degrades quietly* — and that one
is still true. The register simply offers no alternative: the warehouse name is the only thing on
the row that says where the pipe shipped from.

## Why an unrecognised name is dropped, not stored as Unattributed

Because the file is company-wide, the name is doing **two jobs at once**: it decides *which plant?*
and it decides *keep this row at all?*. Those two questions have the same evidence and cannot be
told apart:

```
Warehouse Name
      │
      ├── matches the plant master  → one of our four plants → keep, attributed
      └── matches nothing           → either a JSW warehouse that is not ours
                                      or one of ours, renamed in Zoho
                                      ← the row cannot tell you which
```

Storing an unmatched row as `Unattributed` would import 40 other JSW warehouses' tonnage into this
app and inflate every total. Dropping it is the only safe answer, and it is the opposite of what
ADR-0004's Orders path does with an unrecognised `Ship From Code`.

## How the quiet degradation is made loud

Dropping on a name is exactly the failure mode ADR-0004 warned about: a warehouse renamed in Zoho
would make a real plant's tonnage go to zero with nothing on screen to say so. The mitigation is
that the drop is **counted by name and printed**:

> Rebuilt 2026-09-01 → 2026-09-16 · 58 invoice(s), 252 line(s), 1,453.5T · 790 line(s) / 4,570.4T
> outside the window left alone · skipped **Wanaparthy_One Helix Unit 2 (61)**, Salem_JSW Steel (204)

A rename therefore reads as a **named number** on the day it happens, not as a plant that silently
went to zero. `buildInvoiceDispatches` returns `stats.skippedByWarehouse` for exactly this, and the
Orders tab's invoice banner always prints it. That count is the detector; without it this decision
would not be safe to make.

Fuzzy matching is still refused, for ADR-0004's own reason: a near-miss name is how a fifth company
gets silently absorbed into a fourth. Matching is exact, case-folded and whitespace-collapsed
(`normPlantKey`), and nothing else.

## What changed in the master

`Wanaparthy_One Helix` was added to Hyderabad's `erpNames` in `src/data/plants.js`. The other three
warehouse names already matched. `erpNames` is now "the name strings the source files call this
plant by" rather than "the ERP's own name strings" — a fallback on the Orders side, the only key on
the invoice side. Nothing else about the plant master moved: no schema change, and `serves` and the
service-area rule in `docs/adr/0006` are untouched.

## Consequences

- A warehouse renamed in Zoho stops importing until the new string is added to `erpNames`. That is
  a one-line change to the master, and the banner names the string to add.
- A fifth Private Brand plant appearing in Zoho is invisible to the app until it is added to the
  master — visible on the banner as a named skip count from its first invoice.
- Invoice-side plant is no longer verifiable against the order side by a shared key. Both still land
  on the same plant **id**, so an invoice and its order line agree; but they now agree because two
  different strings were mapped to one id, rather than because one code matched itself.
- The Orders side is unaffected. `plantForErpRow` names `warehousename` alongside `cmname` and
  `shipfromlocation` in one alias list, and `Ship From Code` still wins wherever it is present, so
  an Orders row's resolution is byte-for-byte what ADR-0004 specified.

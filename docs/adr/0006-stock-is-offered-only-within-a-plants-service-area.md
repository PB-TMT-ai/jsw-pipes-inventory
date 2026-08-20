# Stock is offered only within a plant's service area

A distributor is shown the finished stock of the plants that ship to **its** region, and of no
others. Service area is stored on a **plant master**, and a **distributor master** carries a
per-distributor region override for the exception a state map cannot express.

## What was happening

`producedPool` (`src/lib/calc.js`) summed stock by SKU across every plant and never read `p.plant`.
`salesByDistributor` wrote that one number onto every distributor's row, regardless of region. So
the Sales tab drill-down, the PB MTD workbook's **Distributor × SKU** sheet, and the WhatsApp
servable-orders message all answered "what stock is there for this size?" with the company total.

On 20-Aug-2026 every one of the 1,279 production rows in the database was `plant = 'hyderabad'`, a
**South** plant. NPMD, Lepakshi and Tapi had produced nothing. And the workbook was offering
Hyderabad's tonnage to **West** distributors:

```
                       what the file said        what was true
West rows w/ Free Stock   50 of 270                 0 of 270
West Free Stock offered   310.61 MT                 0 MT
West "Short by"           1,755.35 MT               2,116 MT  ← the whole West order book
```

The rule itself was not missing. It was written in `CONTEXT.md` under **Service area** and
implemented once — as the `--serves` flag in `scripts/servable-orders.mjs`, which filters *orders*
and never *stock*. Three captions stated the opposite as though it were a decision: the workbook's
sheet-4 note, and two lines of `docs/ALGORITHMS.md` ("Free Stock stays every plant's finished stock
combined: stock is held where it was made, and the plant column is not applied to it"). A rule that
lives in one document and one flag, contradicted by three captions, is not a rule.

## The decision

**Hyderabad and Lepakshi serve South. NPMD and Tapi serve West.**

That answer is now data, in two new tables built like `state_regions` — a code seed with the table
layered on top, per row, so a half-populated table can never un-serve what shipped:

| | holds | seed | editable on |
|---|---|---|---|
| `plants` | `serves` — the regions this plant ships to | `src/data/plants.js` | Masters tab |
| `distributors` | a region override, blank ⇒ use the state's region | `src/data/distributors.js` (empty) | Masters tab |

Everything else about a plant — Ship From Code, ERP names, coil prefix, `manufactures` — stays a
read-only code constant. There is nothing in any of them for a person to be right about.

`salesByDistributor` now builds **one pool per region** rather than one per company:

```
distributor ─► region ────────────────► plants ─────────────► pool
  its most      state → region map,      plants.serves        productions AND dispatch
  recent line   or the distributor       (plant master)       entries at those plants
  's state      master's override
```

## Four things had to move together

Scoping the productions alone makes the numbers **worse** than the bug:

1. **Dispatches**, by the same plant set — otherwise South's invoices are subtracted from West's
   empty pool and every West SKU reads as negative stock. Hyderabad invoices West distributors
   today; that tonnage leaves the *South* floor.
2. **`allConfirmed` per region** — otherwise South's Confirmed tonnage is netted off West's zero.
3. **`allPending` per region** — "who else is queued for this size" only means something among
   distributors the same plants can serve.
4. **`regionOf` resolved before the stock block**, not after it. Which pool a row reads is decided
   by its region, so the region has to exist first. That ordering is one reason the pool could only
   ever be one global number.

## Consequences

- **A West distributor's row shows West plants' stock — zero today.** Blank Free Stock, and `Short
  by` equal to the full pending. That is the true position, and it self-corrects the day NPMD
  produces. Every surface now says so in a sentence, because a screen of dashes otherwise reads as
  a loading bug.
- **Every South figure is unchanged**, to the kilo. All stock is Hyderabad's, so South's pool is
  what the global pool was. That is the proof nothing else broke.
- **`Unmapped` is unknown, not empty.** A distributor whose state carries no region has no derivable
  service area, so its stock fields are `null` — `?` in the workbook, an em dash on screen, never
  `0`. "We hold nothing for you" and "we cannot tell who serves you" are opposite instructions.
- **An unattributed production row belongs to no service area** and is offered to nobody. This is
  the same treatment `filterByPlant` already gives a blank plant under the header selector, and it
  is reported: the servable-orders script prints the unlabelled tonnage on stderr rather than
  letting it disappear.
- **ADR-0002 is untouched inside an area.** Stock stays shared and unreserved between distributors
  in the same region; no allocation rule was introduced and none is implied.
- **`--serves` changed meaning.** It chooses the *audience* of the WhatsApp message; the plant
  master chooses the *stock*. Those were one control by accident and are now two on purpose.

## What was deliberately left out

- **No allocation rule.** ADR-0002 still stands: inside a region, nothing is reserved to anybody.
- **No plant split on the Dashboard's Physical Inventory total.** That KPI is the company's stock
  and stays so.
- **No change to how orders or invoices are attributed to plants** (ADR-0004 is untouched). An
  order line's own `plant` still moves no stock figure — a test asserts it. Stock follows the
  **production** row's plant, which is a different column on a different table.
- **No editing of ERP-owned plant fields.** Renaming a plant, changing its Ship From Code or its
  coil prefix stays a code change, because those are the ERP's facts and not ours.

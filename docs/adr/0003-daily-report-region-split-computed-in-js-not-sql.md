# The daily report's region split is computed in JS, not SQL

The daily PB MTD update and its WhatsApp form now carry a region block — Invoiced MTD and Pending to
serve per region. Every other number in those reports comes from SQL run through the Supabase MCP.
The region split does not: it comes from `scripts/daily-splits.mjs`, which reads the same database but
computes through `buildRegionMtdSummary` and the `src/lib` helpers underneath it.

The obvious implementation was a `GROUP BY` in the existing `pb-mtd-report` SQL. Region, though, is
not a column. Putting a tonne of steel in a region takes four steps, each of them already written and
tested:

1. **`resolveDistributorIdentity`** — a dispatch line adopts its *order's* identity where one exists
   (`byLine → byOrder → byChild`), and only falls back to its own distributor code, then to a
   normalised customer name.
2. **`distributorOrderIndex`** — which order row wins per link key depends on fetch order
   (`created_at, id`), so the same rows read in a different order can attribute a line differently.
3. **`distributorStateIndex`** — a distributor's state is its most recent line's, blank states
   skipped, ties keeping the earlier line.
4. **`stateRegionIndex`** — the eight-row seed in `src/data/stateRegions.js` layered *under* the
   `state_regions` table, where a stored blank region is an explicit un-mapping that beats the seed.

Reproducing four behaviours in a second language, in a file no test covers, buys a second answer that
can disagree with the Sales tab and the PB MTD workbook — which is precisely what the region work was
built to prevent.

**The deciding argument is the failure mode.** The verification we would rely on is
`Σ regions == plant total`. A distributor mis-attributed South → West still passes it. Both checks
stay green while the message tells the plant the wrong thing about the wrong region — and a regional
report exists to be acted on regionally. SQL's failure here is a plausible wrong number, and no sum
check can see it. The script's failure is a stack trace.

It also happens to be what CLAUDE.md already says: *use `scripts/`, don't rewrite tested code.*

## The plant split rides the same road (ticket #128, 2026-08-19)

The daily messages later gained a **per-plant** split, and it goes through the same script — which is
why that script is now `daily-splits.mjs` rather than `region-mtd.mjs`. Plant, unlike region, *is* a
column (`orders.plant`, and per-entry inside `dispatches.bundle_entries`), so a `GROUP BY` would have
worked arithmetically. It was still the wrong tool, for a different reason: the PB MTD workbook
already prints this split, from `buildPlantMtdSummary`. A SQL version would be a **second
implementation of a number that already exists** — and the acceptance criterion was that a figure on a
phone and a figure in a spreadsheet cannot disagree. Nothing can disagree with itself; two
implementations of the same figure eventually do.

Both splits are computed in one run, off one fetch and one `D`. Two scripts a minute apart could each
be right and still print a region block and a plant block describing different books.

## Consequences

- The daily report now needs a `node` run and Supabase credentials, where before it needed only the
  MCP. Credentials come from `.env.local`, flags, or the MCP's `get_project_url` +
  `get_publishable_keys`; nothing is committed.
- The script uses plain `fetch` rather than `@supabase/supabase-js`, so it runs without
  `npm install` — `calc.js` and `reports.js` have no runtime dependencies. It cannot reuse
  `src/lib/db.js`, which imports React and reads `import.meta.env`.
- **Relative imports inside `src/lib` and `src/data` must now carry `.js` extensions.** Node does not
  resolve extensionless paths; Vite and Vitest do. `src/lib/module-resolution.test.js` guards this by
  spawning a real Node process. Fixing it also revived `scripts/coil-realloc-dryrun.mjs`, which had
  been silently broken since the region work landed.
- When the script cannot run, the report emits `⚠️ N/A (<region|plant> split unavailable: <reason>)`
  and the WhatsApp block is omitted entirely. An absent split beats a guessed one.
- The script exits non-zero if **either** split misses its tie-out, so one broken split withholds
  both. That is deliberate: they are two cuts of one book, and a message carrying one of them
  invites the reader to reconcile it against a total that is not there.
- Region tonnage is day-capped at `D` so it ties to the plant's `invoicedMtd`, while region
  *assignment* is uncapped so it ties to the workbook. The gap between them is reported as
  `diagnostics.invoicedAfterD` rather than left to be discovered.
- The workbook's own *Distributor by Region* sheet does **not** day-cap its invoiced column. That
  inconsistency predates this decision and is left alone; it matters only for a back-dated report.

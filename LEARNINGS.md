# Project Learnings

Track errors, solutions, and insights. System gets smarter with each entry.

## Format
Date | Component | Issue | Resolution | Insight

---

## Entries
(Add new entries at top)

2026-04-22 | Seed data | Final removal of all seeding — SKU Master is no longer pre-populated either | Dropped the `insert into skus ...` block from `supabase-setup.sql`, the `DEFAULT_SKUS` import from `src/App.jsx`, and deleted `src/data/skus.js` (the `src/data/` folder too). `useSupabaseStore('jsw:skus', [])` now falls back to an empty array, and `resetData` no longer touches SKUs (preserved as master data). Rewrote `blueprints/add-new-sku-type.md` around Path A (UI `+ Add SKU`) and Path B (bulk SQL insert). | Seed data has a long tail — even after removing pipeline seeds, the SKU seed kept docs/skills drifting out of sync. Removing everything at once is cleaner than dripping it out over multiple commits. If a user needs example SKUs, the `blueprints/add-new-sku-type.md` Path B SQL snippet is there to copy.

2026-04-22 | Supabase sync | Upserted rows silently disappeared on refresh when any optional numeric/date field was blank | Excel uploads and manual saves passed `''` for skipped fields. PostgREST rejects `''` on `numeric`/`date` columns and the whole upsert batch fails, but the error was only `console.error`'d — React state still showed the rows until the next fetch. Fix: coerce `''` → `null` in `syncToSupabase` right before the upsert. | Don't send empty strings to typed columns. Either coerce at the sync boundary (chosen) or normalize inside `toSnake`. Also: silent `console.error` hides real data loss — surface DB errors in the UI next time we touch this.

2026-04-22 | Seed data | `SEED_VERSION` effect + empty `buildSeed*` builders were dead code *and* a latent data-loss hazard | All pipeline seed builders returned `[]`, so the effect only wrote empty arrays into Supabase on each version bump — wiping live data from every user who loaded the app after the bump. Removed the effect entirely; kept `DEFAULT_SKUS` as the `useSupabaseStore` fallback and `resetData` still explicitly re-seeds SKUs. | An auto-migration that pushes seed data from the client is dangerous — if the seed is ever wrong or empty, it overwrites real rows. Seed from SQL on the server side only; keep the client-side copy strictly as a read-time fallback.

2026-04-22 | Docs drift | `.claude/skills/data-storage.md` still described the app as localStorage-only after the Supabase migration | Rewrote the skill file around `useSupabaseStore`, added the Store Key Registry with both JS keys and table names, documented the `''` → `null` coercion, and pruned the old `S.get` / `useStore` snippets. Also removed the stale `jsw:seedVersion` / `jsw:seeded` references from CLAUDE.md and the api-integration skill. | After any architectural migration, grep the repo for the old paradigm (e.g. `localStorage`, the old hook name) — skill and blueprint files don't always surface in normal edits but Claude reads them before acting.

2026-04-22 | PO Master | Zoho Books exports custom fields with dotted headers (`Item.CF.Updated Qty`, `CF.PO end Date`) | Normalize headers in `mapExcelRow` by lowercasing and stripping `.`, spaces, and underscores before matching, so `Item.CF.Updated Qty`, `Item CF Updated Qty`, and `cfupdatedqty` all resolve to the same internal field `updatedQty`. Accept multiple alias keys per field via a `pick()` helper. | Never match Excel headers with exact string equality — Zoho/Excel round-trips mutate whitespace and casing. Normalize once, match many.

2026-04-22 | PO Master | Monthly Excel re-upload must not wipe operator edits or resurrect soft-deleted rows | Upsert keyed on `(purchaseOrderNumber + itemName)`: match → merge via `{...existing, ...row}`; miss → insert with fresh `uid()`. Before building the key map, partition `prev` into active vs deleted and merge the deleted rows back at the end. | Uploads in this app are idempotent by design. The upsert key choice (PO + Item) is dictated by the source system — a single PO has multiple line items, so PO alone is not unique.

2026-04-22 | PO Master | `xlsx` (SheetJS) is a 430 kB chunk and should never ship in the initial bundle | Use dynamic `await import('xlsx')` inside the upload handler. Vite automatically code-splits dynamic imports into a separate chunk that is fetched on click, not on page load. | The same trick applies to any heavy peer dep used on an uncommon code path.

2026-04-22 | PO Master | PO Master is master data, not pipeline data — should survive `Reset Data` | Do not include `setPurchaseOrders([])` in `resetData()`. Same pattern as SKU Master (which is re-seeded, not cleared). | Distinguish master/reference data from pipeline/transaction data when building destructive actions.

2026-04-08 | Stage 4 (Bundle Formation) | Redesigned Bundle Formation UI — removed summary cards and flat DataTable | Replaced with expandable accordion table (one row per bundle, click to expand source rows) and two-mode form: "Create New Bundle" (full form) and "Add Source to BND-X" (simplified, pre-filled). Added search/sort on accordion, "+ Add Source" button inside expanded rows. | Users think in bundles, not allocation rows. Grouping by bundle with expand/collapse is far more intuitive than a flat list of rows. Two-mode form reduces cognitive load by showing only relevant fields per action.

2026-04-08 | Stage 1 | Chemistry fields (Carbon, Mn, YS, Elongation) removed from Coil Inward | Fields were not needed for plant operations — chemistry specs managed outside this system | Keep Stage 1 lean; only fields used in downstream calculations or daily operations

2026-04-08 | Stage 1 | Coil Grade changed from dropdown (GRADES constant) to free text input | Operators enter grades not always in a fixed list; dropdown was too restrictive | Use free text with placeholder examples when the value set is open-ended

2026-04-08 | Stage 2 | Baby coil Cost Price now auto-calculated proportionally | Formula: `(Baby Width / Sum Widths) × Parent Cost Price`. Recalculates all siblings on add/edit/delete, same as weight | Cost must follow the same proportionate pattern as weight to maintain traceability

2026-04-08 | Stage 2/3 | Width sum validation now uses 3-color system | Green (≤100%), Yellow (100-105% — save allowed), Red (>105% — save blocked). Replaces the old single-color tolerance badge | Operators need clear visual feedback: green = safe, yellow = warning but ok, red = stop

2026-04-08 | Stage 3 | Width changed from auto-fetched to manual input | Tube widths can differ from slit width (various tube profiles). Width sum validated against baby coil width with same 3-color system | Auto-fetching width was incorrect assumption — tubes from same slit can have different widths

2026-04-08 | Build | Folder name "Pipes&Tubes" contains `&` which bash interprets as command separator | Use `node node_modules/vite/bin/vite.js` directly instead of `npx vite` or `npm run dev` when shell expansion is an issue | Avoid special characters (&, spaces) in project folder names for CLI compatibility

2026-04-08 | Stage 2 (Coil to Slit) | Proportionate weight recalculation — adding a new baby coil changes all siblings' weights | After any add/edit/delete of baby coils, recalculate ALL siblings for the same parent using the updated width distribution | This is by design: proportionate weight means the sum always equals parent actual weight. Every mutation must trigger a full sibling recalc.

2026-04-08 | Stage 4 (Bundle Formation) | Multi-coil bundles — a single bundle can contain tubes from multiple baby coils, each as separate rows | Bundle rows are keyed by (bundleId + babyCoilId). Bundle summary is computed by grouping rows by bundleId. All rows in a bundle must share the same SKU. | This is the most complex stage. Carry-forward logic: leftover pieces from one baby coil become the first allocation in the next bundle.

2026-04-08 | Storage | useStore hook must read fresh value from localStorage inside updater function | `const next = typeof v === 'function' ? v(S.get(key) ?? fallback) : v` — reads from storage, not stale closure | React setState closures can capture stale values. Always read from source of truth (localStorage) inside functional updates.

2026-04-08 | Validation | ±5% tolerance is the universal validation threshold across all stages | `tolerance(actual, expected)` utility returns `{ok, pct, label}` — green badge for 95-105%, red outside | Consistent tolerance function reused across all 5 stages. Never hardcode tolerance checks inline.

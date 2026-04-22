# Project Learnings

Track errors, solutions, and insights. System gets smarter with each entry.

## Format
Date | Component | Issue | Resolution | Insight

---

## Entries
(Add new entries at top)

2026-04-22 | Supabase sync (db.js) | Empty string `''` on nullable numeric/date/integer columns caused silent 400 rejections; rows vanished on refresh across every table (POs, coils, baby coils, etc.) | `toSnake()` in `src/lib/db.js` now maps `'' → null` before upsert. Safe across all 7 tables because every affected column is nullable. | Postgres rejects `""` on non-text columns — forms that initialize numeric fields to `''` must be normalized at the sync boundary, not the form boundary. One centralized fix covers every table.

2026-04-22 | PO Master Excel upload | `toISODate` assumed DD/MM/YYYY, so Excel cells in MM/DD/YYYY (e.g. `04/28/2026`) produced malformed strings like `2026-28-04` that Postgres rejected. Combined with `sheet_to_json({raw: false})` emitting locale-formatted strings instead of Date objects. | Switched to `raw: true` so `cellDates` produces real Date objects; `toISODate` auto-detects MM/DD vs DD/MM based on which segment is >12 (ambiguous defaults to DD/MM/YYYY, Indian convention); Date-to-ISO uses local getters to avoid IST off-by-one. | Always expect dates from Excel in multiple formats. For Zoho Books exports, MM/DD/YYYY is common. Never trust a single date format.

2026-04-22 | Supabase sync (db.js) | Sync failures only logged to `console.error` — users saw the row in the UI, thought the save succeeded, and only discovered the data loss after refresh. | `syncToSupabase` now dispatches `jsw:syncError` CustomEvents with `{tableName, op, message, details, hint, code, sampleRow, rowCount}`. `SyncErrorBanner` in the app shell listens and renders a red banner under the header. | Silent failures are worse than loud failures. Sync-layer errors must surface in the UI, not just the console. Every future boundary to an external service needs a visible error path.

2026-04-22 | xlsx 0.18.x | `cellDates: true` produces Date objects in the local timezone by default; `getUTCDate()` on those shifts the day back by 5.5h in IST, so `2026-04-22` persisted as `2026-04-21`. | Use `getFullYear/getMonth/getDate` (local) on Date objects that came from xlsx, not the UTC variants. | xlsx emits local-time Date objects (`UTC: false` default) — match that with local getters. UTC getters would only be correct if xlsx was configured with `UTC: true`.

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

# Project Learnings

Track errors, solutions, and insights. System gets smarter with each entry.

## Format
Date | Component | Issue | Resolution | Insight

---

## Entries
(Add new entries at top)

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

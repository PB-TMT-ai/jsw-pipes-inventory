// ── STATE → REGION MASTER (static seed) ─────────────────────────────────────────────────────────
// Region is a pure business concept: the ERP never exports it and it appears nowhere in the One
// Helix workbook. State, by contrast, now arrives with the data (orders.ship_to_state and the
// per-entry shipToState inside dispatches.bundle_entries — see ticket #101), so the ONLY thing a
// human ever types is the region for a state. A new distributor in an already-mapped state inherits
// its region automatically, and a distributor's state can never drift from what the ERP said
// because it is never hand-typed.
//
// These six rows are the mappings already in use. They ship as a static default in the same way
// DEFAULT_SKUS backs the SKU master: used when the `state_regions` table is empty, and layered
// UNDER whatever the table does hold (stateRegionIndex in calc.js), so a partially-populated table
// can never make a seeded state read as Unmapped.
//
// `state` is stored UPPER-CASE because that is how resolveShipToState stores it on every order and
// invoice line ("TAMIL NADU"), so a line and its mapping join on one identical key. Ids are fixed
// literals rather than crypto.randomUUID() so re-seeding is idempotent.

const DEFAULT_STATE_REGIONS = [
  { id: 'a1000001-0000-4000-8000-000000000001', state: 'TELANGANA', region: 'South', deleted: false },
  { id: 'a1000001-0000-4000-8000-000000000002', state: 'ANDHRA PRADESH', region: 'South', deleted: false },
  { id: 'a1000001-0000-4000-8000-000000000003', state: 'KARNATAKA', region: 'South', deleted: false },
  { id: 'a1000001-0000-4000-8000-000000000004', state: 'TAMIL NADU', region: 'South', deleted: false },
  { id: 'a1000001-0000-4000-8000-000000000005', state: 'MAHARASHTRA', region: 'West', deleted: false },
  { id: 'a1000001-0000-4000-8000-000000000006', state: 'GUJARAT', region: 'West', deleted: false },
]

export default DEFAULT_STATE_REGIONS

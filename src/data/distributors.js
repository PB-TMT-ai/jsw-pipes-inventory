// ── DISTRIBUTOR MASTER (static seed) ────────────────────────────────────────────────────────────
// One thing only: a REGION OVERRIDE per distributor (ticket #129). Nothing else belongs here — a
// distributor's name, state, order book and invoices all arrive with the ERP data and are resolved
// from it (`distributorStateIndex`, `resolveDistributorIdentity`), so anything else this table held
// would be a second, hand-typed copy of a fact the ERP already ships, free to drift from it.
//
// Region normally comes from the distributor's STATE, via the state → region master: map a state
// once and every distributor shipping there inherits it. That is right for almost everybody and is
// the reason the state master is keyed by state rather than by distributor.
//
// The override exists for the exception the state rule cannot express: a distributor whose state
// says one region but who is genuinely served as another (a border depot, a group buying through a
// single billing state). It is per distributor and it WINS over the state's answer.
//
// **Blank means "use the state's region"** — it is not a region, and it is not `Unmapped`. That is
// why the Masters tab writes `region: ''` to clear an override instead of deleting the row: blank
// is the ordinary state, and a stored blank and no row at all mean exactly the same thing.
//
// The seed ships EMPTY on purpose. An override is a correction to the state rule, and shipping one
// nobody asked for would be a correction to nothing. It exists as a seed at all so the table
// follows the same layered shape as the state → region and plant masters — seed underneath,
// stored rows on top (`distributorRegionIndex` in calc.js) — and so a future well-known exception
// has an obvious place to live.

const DEFAULT_DISTRIBUTORS = []

export default DEFAULT_DISTRIBUTORS

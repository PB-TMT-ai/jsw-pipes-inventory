// ── PLANT MASTER (static seed) ──────────────────────────────────────────────────────────────────
// Four manufacturing companies appear in the One Helix workbook's Orders sheet. Until ticket #118
// the app had no column to put them in, so all four were counted as Hyderabad's.
//
// Everything here EXCEPT `serves` comes from the ERP and is read-only: an id, a Ship From Code, the
// ERP's own name strings, a coil prefix. There is nothing for an operator to type in any of them.
//
// `serves` is the exception and the reason a `plants` TABLE now exists beside this file (ticket
// #129). Which regions a plant will ship to is a commercial decision, not an ERP field — it appears
// in no export and can be changed by a person on a Tuesday — so it follows the state → region
// master exactly: these rows ship as the static default, and whatever the `plants` table holds is
// layered ON TOP of them (`plantMaster` in calc.js). A half-populated table can therefore never
// make a seeded plant serve nowhere by accident.
//
// Each plant carries:
//   id           fixed literal, stored on the row (orders.plant). Never derived from a label, so
//                renaming a plant on screen can never orphan the rows that point at it.
//   erpCode      the ERP's **Ship From Code** — the ONLY thing plant is resolved from. It appears
//                in both sheets of the workbook and matched exactly across them for Hyderabad.
//   erpNames     the ERP's own name strings ("CM name" in Orders, "Ship from location" in Invoice).
//                A FALLBACK for matching only — see docs/adr/0004.
//   name         the short display name. This is what a screen shows; the ERP's
//                "New Pashchim Maharashtra Patra Depot" never reaches a user.
//   coilPrefix   the coil-ID prefix for that plant's own register (phase 2 — #119).
//   manufactures whether the plant runs Coil Inward / Slitting / Production. All four do, as of
//                ticket #156. Lepakshi and Tapi existed for attribution only until then — they
//                carried orders and had never produced or invoiced — and activating them was the
//                one-line change to this flag that ADR-0004 promised it would be. It is a
//                CAPABILITY, not a rollout date: `COIL_INWARD_PLANT_IDS` in calc.js is the
//                separate list of who may register a mother coil today, and Coil Inward offers
//                the INTERSECTION of the two, so flipping this alone would not have offered them.
//   serves       the regions this plant will ship to — its SERVICE AREA (CONTEXT.md). A
//                distributor is offered stock from the plants that serve ITS region and from no
//                other, because a coil in another state is not far away, it is not there. An empty
//                list means the plant serves nowhere, which is a real answer and not a fallback:
//                its stock then appears on no distributor's row. EDITABLE — see above.
//
// Order matters: it is the order plants are listed in on screen, biggest first.

const DEFAULT_PLANTS = [
  {
    id: 'hyderabad',
    erpCode: 'V2482-2973-JODL-4144',
    erpNames: ['NIPPON PIPES PRIVATE LIMITED'],
    name: 'Hyderabad',
    coilPrefix: 'HYD',
    manufactures: true,
    serves: ['South'],
  },
  {
    id: 'npmd',
    erpCode: 'V1865-2222-JODL-4081',
    erpNames: ['New Pashchim Maharashtra Patra Depot'],
    name: 'NPMD',
    coilPrefix: 'NPM',
    manufactures: true,
    serves: ['West'],
  },
  {
    id: 'lepakshi',
    erpCode: 'V2732-3276-JODL-4606',
    erpNames: ['LEPAKSHI TUBES PRIVATE LIMITED'],
    name: 'Lepakshi',
    coilPrefix: 'LEP',
    manufactures: true,
    serves: ['South'],
  },
  {
    id: 'tapi',
    erpCode: 'V2744-3288-JODL-4631',
    erpNames: ['TAPI PIPES AND TUBES PRIVATE LIMITED'],
    name: 'Tapi',
    coilPrefix: 'TAP',
    manufactures: true,
    serves: ['West'],
  },
]

export default DEFAULT_PLANTS

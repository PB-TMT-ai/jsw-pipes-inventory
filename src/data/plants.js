// ── PLANT MASTER (static constant) ──────────────────────────────────────────────────────────────
// Four manufacturing companies appear in the One Helix workbook's Orders sheet. Until ticket #118
// the app had no column to put them in, so all four were counted as Hyderabad's.
//
// Unlike the state → region master (38 possible states, continuously hand-mapped, so it lives in a
// `state_regions` table), plants are four, change rarely, and every identifier here comes from the
// ERP rather than from human judgement. There is nothing for an operator to type and therefore
// nothing to store — so this is a code constant, not a table.
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
//   manufactures whether the plant runs Coil Inward / Slitting / Production. Lepakshi and Tapi
//                carry orders and have never produced or invoiced, so they exist for attribution
//                only. Reclassifying one is a one-line change to this flag.
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
  },
  {
    id: 'npmd',
    erpCode: 'V1865-2222-JODL-4081',
    erpNames: ['New Pashchim Maharashtra Patra Depot'],
    name: 'NPMD',
    coilPrefix: 'NPM',
    manufactures: true,
  },
  {
    id: 'lepakshi',
    erpCode: 'V2732-3276-JODL-4606',
    erpNames: ['LEPAKSHI TUBES PRIVATE LIMITED'],
    name: 'Lepakshi',
    coilPrefix: 'LEP',
    manufactures: false,
  },
  {
    id: 'tapi',
    erpCode: 'V2744-3288-JODL-4631',
    erpNames: ['TAPI PIPES AND TUBES PRIVATE LIMITED'],
    name: 'Tapi',
    coilPrefix: 'TAP',
    manufactures: false,
  },
]

export default DEFAULT_PLANTS

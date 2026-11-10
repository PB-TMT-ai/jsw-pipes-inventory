// ── PLANNING MASTER (static seed) ───────────────────────────────────────────────────────────────
// The user's planning master, 3-Nov-2026, exactly as posted on #249 — the starting data for the
// Production Planning tab (ticket #278). It is NOT the SKU master: one row per region × size ×
// thickness BAND, saying whether the region holds it as Buffer or MTO, how much Buffer, and which
// plants can make it. `planningMaster()` in calc.js expands it to the 471 rows.
//
// Compact form, one line per region × size, one entry per thickness band:
//   Region|Size|Type|thickness:buffer MT:plant letters …
//   buffer '-'   = none (every MTO row, and a Buffer size's unbuffered bands)
//   plant letters N = Hyderabad, L = Lepakshi, P = NPMD, T = Tapi (user-confirmed, #248). No order:
//                 "NL" and "LN" are the same row. Empty = no plant can make it.
//   Section follows from the size: `NB` → CHS, equal sides → SHS, unequal → RHS.
//
// Dropped on purpose (#249): Matrix thickness, Matrix header row, Plant option 1 / 2.
// Check figures: 471 rows (South 236, West 235); Buffer total South 3,020 MT, West 2,822 MT.
//
// Edits (ticket 2 of #248) will layer stored rows on top of this seed; nothing here is ever
// rewritten by the app. Do not hand-edit it to "fix" a row either — the master is maintained on
// screen, and this file is only where it starts.

export const PLANNING_MASTER_SEED = `
South|15NB|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL
South|20NB|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL
South|25NB|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL 2.5:-:NL 3.0:-:NL 4.0:-:NL 5.0:-:L 6.0:-:L
South|32NB|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL 2.5:-:NL 3.0:-:NL 4.0:-:NL 5.0:-:L 6.0:-:L
South|40NB|Buffer|1.2:-:L 1.6:20:NL 2.0:20:NL 2.5:-:NL 3.0:20:NL 4.0:20:NL 5.0:-:L 6.0:-:L
South|50NB|Buffer|1.2:-:L 1.6:20:NL 2.0:20:NL 2.5:-:NL 3.0:20:NL 4.0:20:NL 5.0:-:L 6.0:-:L
South|65NB|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL 2.5:-:NL 3.0:-:NL 4.0:-:NL 5.0:-:L 6.0:-:L
South|80NB|MTO|1.6:-:N 2.0:-:N 2.5:-:N 3.0:-:N 4.0:-:N 5.0:-:L 6.0:-:L
South|100NB|MTO|1.6:-: 2.0:-: 2.5:-: 3.0:-:N 4.0:-:N 5.0:-:L 6.0:-:L
South|150NB|MTO|5.0:-:L 6.0:-:L
South|173NB|MTO|1.6:-:L 2.0:-:L 2.5:-:L 3.0:-:L 4.0:-:L 5.0:-:L 6.0:-:L
South|15x15|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL
South|20x20|Buffer|1.2:20:L 1.6:20:NL 2.0:20:NL
South|25x25|Buffer|1.2:60:L 1.6:60:NL 2.0:60:NL 2.5:30:N 3.0:30:N 4.0:-:N 5.0:-:
South|30x30|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL 2.5:-:N 3.0:-:N 4.0:-:N 5.0:-:
South|38x38|MTO|1.2:-:L 1.6:-:N 2.0:-:N 2.5:-:N 3.0:-:N 4.0:-:N
South|40x40|Buffer|1.2:40:L 1.6:60:L 2.0:50:L 2.5:30:L 3.0:50:L 4.0:30:L 5.0:-: 6.0:-:
South|50x50|Buffer|1.2:40:L 1.6:100:NL 2.0:100:NL 2.5:30:NL 3.0:60:NL 4.0:30:NL 5.0:-:L 6.0:-:L
South|60x60|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL 2.5:-:NL 3.0:-:NL 4.0:-:NL 5.0:-:L 6.0:-:L
South|72x72|Buffer|1.2:20:L 1.6:40:L 2.0:60:L 2.5:-:L 3.0:50:L 4.0:30:L 5.0:-:L 6.0:-:L
South|80x80|MTO|1.6:-:NL 2.0:-:NL 2.5:-:NL 3.0:-:NL 4.0:-:NL 5.0:-:L 6.0:-:L
South|91x91|MTO|1.6:-: 2.0:-: 2.5:-: 3.0:-: 4.0:-: 5.0:-: 6.0:-:
South|100x100|Buffer|1.6:-:L 2.0:60:L 2.5:20:L 3.0:80:L 4.0:60:L 5.0:60:L 6.0:40:L
South|113x113|MTO|3.0:-: 4.0:-: 5.0:-: 6.0:-:
South|120x120|MTO|3.0:-: 4.0:-: 5.0:-: 6.0:-:
South|150x150|Buffer|1.6:-:L 2.0:-:L 2.5:20:L 3.0:60:L 4.0:60:L 5.0:40:L 6.0:40:L
South|40x20|MTO|1.2:-:L 1.6:-:NL 2.0:-:NL 2.5:-:NL 3.0:-:NL 4.0:-:NL
South|50x25|Buffer|1.2:20:L 1.6:20:NL 2.0:20:NL 2.5:-:NL 3.0:20:NL 4.0:-:NL 5.0:-:
South|60x40|Buffer|1.2:20:L 1.6:60:NL 2.0:60:NL 2.5:-:NL 3.0:20:NL 4.0:-:NL 5.0:-:
South|75x25|MTO|1.2:-:L 1.6:-:N 2.0:-:N 2.5:-:N 3.0:-:N 4.0:-:N 5.0:-:
South|80x40|Buffer|1.2:20:L 1.6:60:NL 2.0:60:NL 2.5:-:NL 3.0:40:NL 4.0:40:NL 5.0:-: 6.0:-:
South|96x48|Buffer|1.2:-:L 1.6:40:L 2.0:80:L 2.5:30:L 3.0:60:L 4.0:40:L 5.0:-:L 6.0:-:L
South|100x50|MTO|1.2:-: 1.6:-:N 2.0:-:N 2.5:-:N 3.0:-:N 4.0:-:N 5.0:-: 6.0:-:
South|122x61|Buffer|1.6:-:L 2.0:20:L 2.5:20:L 3.0:50:L 4.0:50:L 5.0:20:L 6.0:-:L
South|145x82|Buffer|1.6:-: 2.0:-: 2.5:-: 3.0:50: 4.0:50: 5.0:30: 6.0:-:
South|172x92|MTO|3.0:-: 4.0:-: 5.0:-: 6.0:-:
South|200x100|Buffer|3.0:50:L 4.0:50:L 5.0:50:L 6.0:50:L
West|15NB|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT
West|20NB|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT
West|25NB|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:T 3.0:-: 4.0:-: 5.0:-: 6.0:-:
West|32NB|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:T 3.0:-:T 4.0:-:T 5.0:-:T 6.0:-:T
West|40NB|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:PT 3.0:-:PT 4.0:-:PT 5.0:-:T 6.0:-:T
West|50NB|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:PT 3.0:-:PT 4.0:-:PT 5.0:-:T 6.0:-:T
West|65NB|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:PT 3.0:-:PT 4.0:-:PT 5.0:-:T 6.0:-:T
West|80NB|MTO|1.6:-:PT 2.0:-:PT 2.5:-:PT 3.0:-:PT 4.0:-:PT 5.0:-:T 6.0:-:T
West|100NB|MTO|1.6:-:PT 2.0:-:PT 2.5:-:PT 3.0:-:PT 4.0:-:PT 5.0:-:T 6.0:-:T
West|150NB|MTO|5.0:-:T 6.0:-:T
West|173NB|MTO|1.6:-: 2.0:-: 2.5:-: 3.0:-:T 4.0:-:T 5.0:-:T 6.0:-:T
West|15x15|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT
West|20x20|Buffer|1.2:30:PT 1.6:30:PT 2.0:30:PT
West|25x25|Buffer|1.2:60:PT 1.6:60:PT 2.0:60:PT 2.5:30:T 3.0:30:T 4.0:-:T 5.0:-:T
West|30x30|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:T 3.0:-:T 4.0:-:T 5.0:-:T
West|38x38|MTO|1.2:-:P 1.6:-:P 2.0:-:P 2.5:-:P 3.0:-:P 4.0:-:P
West|40x40|Buffer|1.2:40:PT 1.6:60:PT 2.0:50:PT 2.5:30:PT 3.0:50:PT 4.0:30:PT 5.0:-:T 6.0:-:T
West|50x50|Buffer|1.2:60:PT 1.6:100:PT 2.0:100:PT 2.5:30:PT 3.0:60:PT 4.0:30:PT 5.0:-:T 6.0:-:T
West|60x60|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:PT 3.0:-:PT 4.0:-:PT 5.0:-:T 6.0:-:T
West|72x72|Buffer|1.2:20:PT 1.6:40:PT 2.0:60:PT 2.5:-:PT 3.0:50:PT 4.0:30:PT 5.0:-:T 6.0:-:T
West|80x80|MTO|1.6:-:PT 2.0:-:PT 2.5:-:PT 3.0:-:PT 4.0:-:PT 5.0:-:T 6.0:-:T
West|91x91|MTO|1.6:-:T 2.0:-:T 2.5:-:T 3.0:-:T 4.0:-:T 5.0:-:T 6.0:-:T
West|100x100|Buffer|1.6:10:PT 2.0:61:PT 2.5:16:PT 3.0:83:PT 4.0:59:PT 5.0:52:T 6.0:31:T
West|113x113|MTO|3.0:-:T 4.0:-:T 5.0:-:T 6.0:-:T
West|120x120|MTO|3.0:-:T 4.0:-:T 5.0:-:T 6.0:-:T
West|150x150|Buffer|1.6:-:PT 2.0:-:PT 2.5:20:PT 3.0:60:PT 4.0:60:PT 5.0:40:T 6.0:40:T
West|40x20|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:T 3.0:-:T 4.0:-:T
West|50x25|Buffer|1.2:20:PT 1.6:20:PT 2.0:20:PT 2.5:-:PT 3.0:20:PT 4.0:-:PT 5.0:-:T
West|60x40|Buffer|1.2:20:PT 1.6:60:PT 2.0:60:PT 2.5:-:PT 3.0:20:PT 4.0:-:PT 5.0:-:T
West|75x25|MTO|1.2:-:PT 1.6:-:PT 2.0:-:PT 2.5:-:PT 3.0:-:PT 4.0:-:PT 5.0:-:T
West|80x40|Buffer|1.2:-:PT 1.6:60:PT 2.0:60:PT 2.5:-:PT 3.0:40:PT 4.0:40:PT 5.0:-:T 6.0:-:T
West|96x48|Buffer|1.2:-:PT 1.6:40:PT 2.0:80:PT 2.5:30:PT 3.0:60:PT 4.0:40:PT 5.0:-:PT 6.0:-:PT
West|100x50|MTO|1.2:-:T 1.6:-:T 2.0:-:T 2.5:-:T 3.0:-:T 4.0:-:T 5.0:-:T 6.0:-:T
West|122x61|Buffer|1.6:-:PT 2.0:12:PT 2.5:18:PT 3.0:52:PT 4.0:50:PT 5.0:18:T 6.0:-:T
West|145x82|Buffer|1.6:-:T 2.0:-:T 2.5:-:T 3.0:50:T 4.0:50:T 5.0:30:T 6.0:-:T
West|172x92|MTO|3.0:-:T 4.0:-:T 5.0:-:T 6.0:-:T
West|200x100|Buffer|3.0:50:T 4.0:50:T 5.0:50:T
`

// Plant letters → plant ids. The ids are the plant master's own literals (src/data/plants.js).
export const PLANNING_PLANT_LETTERS = { N: 'hyderabad', L: 'lepakshi', P: 'npmd', T: 'tapi' }

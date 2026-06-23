// ─────────────────────────────────────────────────────────────────────────────
// generate-skus.mjs — offline SKU-master generator
//
// Produces ready-to-paste DEFAULT_SKUS entries for SKUs that appear in an uploaded
// dispatch/invoice Excel (by MM ID / MM Description) but are missing from the 232-entry
// catalog in src/data/skus.js.
//
// WHY THIS LIVES IN /scripts (not src/): the steel-density weight formula must never be
// used in pipeline code — CLAUDE.md: "No density constants for weight; derive from
// SKU.weightPerTube." This script computes weightPerTube ONCE, offline, exactly the way
// the original catalog was generated, and emits STATIC numbers to bake into skus.js.
//
// Usage:
//   node scripts/generate-skus.mjs
// Then paste the printed objects before the closing `]` of DEFAULT_SKUS in
// src/data/skus.js. Spot-check a couple of weights against known catalog rows.
//
// Formulas (verified to reproduce existing catalog values exactly, length L in mm):
//   SHS/RHS: weightPerTube = 7850 × (2·t·(H+B) − 4·t²) / 1e6 × (L/1000)
//   CHS:     weightPerTube = 7850 × π · t · (OD − t)     / 1e6 × (L/1000)
//   thicknessExtra ladder: t≤1.2→1000, t≤1.6→750, t≤2.0→500, else 0
//   ladderPrice = 2900 + thicknessExtra ;  totalConversion = weightPerTube × ladderPrice / 1000
// ─────────────────────────────────────────────────────────────────────────────
import DEFAULT_SKUS from '../src/data/skus.js'

const DENSITY = 7850 // kg/m³ mild steel — offline catalog authoring only

// NB → OD (mm) derived from existing CHS catalog rows (no hardcoded table).
const NB_TO_OD = {}
for (const s of DEFAULT_SKUS) {
  if (s.productType === 'CHS' && s.nominalBore && s.outsideDiameter) {
    NB_TO_OD[String(s.nominalBore)] = String(s.outsideDiameter)
  }
}

const thicknessExtra = (t) => (t <= 1.2 ? 1000 : t <= 1.6 ? 750 : t <= 2.0 ? 500 : 0)

function weightPerTube(spec) {
  const t = spec.thickness, L = spec.length / 1000
  if (spec.productType === 'CHS') {
    return DENSITY * Math.PI * t * (Number(spec.outsideDiameter) - t) / 1e6 * L
  }
  return DENSITY * (2 * t * (spec.height + spec.breadth) - 4 * t * t) / 1e6 * L
}

function parseDescription(desc) {
  const type = (desc.match(/\b(SHS|RHS|CHS)\b/) || [])[1]
  if (!type) throw new Error(`No product type in: ${desc}`)
  if (type === 'CHS') {
    const m = desc.match(/(\d+(?:\.\d+)?)\s*NBx(\d+(?:\.\d+)?)x(\d+)\s*$/i)
    if (!m) throw new Error(`Cannot parse CHS dims: ${desc}`)
    const nb = m[1]
    const od = NB_TO_OD[nb]
    if (!od) throw new Error(`No OD known for NB ${nb} — add a catalog CHS row first: ${desc}`)
    return { productType: 'CHS', height: null, breadth: null, thickness: Number(m[2]),
             length: Number(m[3]), nominalBore: nb, outsideDiameter: od }
  }
  const m = desc.match(/(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)x(\d+)\s*$/)
  if (!m) throw new Error(`Cannot parse ${type} dims: ${desc}`)
  return { productType: type, height: Number(m[1]), breadth: Number(m[2]), thickness: Number(m[3]),
           length: Number(m[4]), nominalBore: '', outsideDiameter: '' }
}

// MM IDs present in the dispatch file but missing from DEFAULT_SKUS (Freight excluded).
const MISSING = [
  { mmId: '1140-13075-10074984', description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x2x6000' },
  { mmId: '1139-13064-10074091', description: 'MS SHS One Helix IS 4923 YSt 210 Black 30x30x2.50x6000' },
  { mmId: '1139-13064-10074088', description: 'MS SHS One Helix IS 4923 YSt 210 Black 30x30x1.60x6000' },
  { mmId: '1140-13075-10074990', description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x4x6000' },
  { mmId: '1140-13075-10074989', description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x3.20x6000' },
  { mmId: '1140-13075-10074986', description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x2.50x6000' },
  { mmId: '1140-13075-10074982', description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x1.60x6000' },
  { mmId: '1139-13064-10074089', description: 'MS SHS One Helix IS 4923 YSt 210 Black 30x30x2x6000' },
  { mmId: '1139-13064-10074092', description: 'MS SHS One Helix IS 4923 YSt 210 Black 38x38x3.20x6000' },
  { mmId: '1140-13075-10074095', description: 'MS RHS One Helix IS 4923 YSt 210 Black 75x25x2.80x6000' },
  { mmId: '1140-13075-10074987', description: 'MS RHS One Helix IS 4923 YSt 210 Black 100x50x2.80x6000' },
  { mmId: '1139-13064-10078303', description: 'MS SHS One Helix IS 4923 YSt 210 Black 60x60x4x6000' },
  { mmId: '1141-13068-10078411', description: 'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2x6000' },
  { mmId: '1141-13068-10078403', description: 'MS CHS One Helix IS 1161 YSt 210 Black 20 NBx2.50x6000' },
  { mmId: '1139-13064-10074093', description: 'MS SHS One Helix IS 4923 YSt 210 Black 60x60x2.80x6000' },
]

// Serialize one object in the same single-line style as src/data/skus.js.
const KEY_ORDER = ['id', 'productType', 'skuCode', 'description', 'height', 'breadth', 'thickness',
  'length', 'nominalBore', 'outsideDiameter', 'hsnCode', 'status', 'weightPerTube',
  'baseConversion', 'thicknessExtra', 'ladderPrice', 'totalConversion']
const lit = (v) => v === null ? 'null' : typeof v === 'string' ? `'${v}'` : String(v)
const serialize = (o) => `{ ${KEY_ORDER.map(k => `${k}: ${lit(o[k])}`).join(', ')} }`

const known = new Set(DEFAULT_SKUS.map(s => s.skuCode))
let nextId = Math.max(...DEFAULT_SKUS.map(s => Number((String(s.id).match(/SKU-(\d+)/) || [])[1] || 0))) + 1

const out = []
for (const { mmId, description } of MISSING) {
  if (known.has(mmId)) { console.error(`skip (already in catalog): ${mmId}`); continue }
  const spec = parseDescription(description)
  const wpt = weightPerTube(spec)
  const extra = thicknessExtra(spec.thickness)
  const ladderPrice = 2900 + extra
  out.push(serialize({
    id: `SKU-${String(nextId++).padStart(3, '0')}`,
    productType: spec.productType, skuCode: mmId, description,
    height: spec.height, breadth: spec.breadth, thickness: spec.thickness, length: spec.length,
    nominalBore: spec.nominalBore, outsideDiameter: spec.outsideDiameter,
    hsnCode: '72080000', status: 'published',
    weightPerTube: wpt, baseConversion: 2900, thicknessExtra: extra,
    ladderPrice, totalConversion: wpt * ladderPrice / 1000,
  }))
}

// Self-check: recompute two known catalog rows and assert the formula matches.
const check = (skuCode, expected) => {
  const s = DEFAULT_SKUS.find(x => x.skuCode === skuCode)
  if (!s) return
  const got = weightPerTube(s.productType === 'CHS'
    ? { productType: 'CHS', thickness: s.thickness, length: s.length, outsideDiameter: s.outsideDiameter }
    : { productType: s.productType, height: s.height, breadth: s.breadth, thickness: s.thickness, length: s.length })
  const ok = Math.abs(got - expected) < 1e-6
  console.error(`self-check ${skuCode}: got ${got.toFixed(6)} expected ${expected} ${ok ? 'OK' : 'MISMATCH'}`)
}
check('1139-13064-10055315', 10.5975)      // SHS 25x25x2.50
check('1141-13068-10059591', 5.9897856860755265) // CHS 20NB x1.60

console.error(`\n// ${out.length} new SKU object(s) — paste before the closing ] of DEFAULT_SKUS:\n`)
console.log(out.map(l => '  ' + l + ',').join('\n'))

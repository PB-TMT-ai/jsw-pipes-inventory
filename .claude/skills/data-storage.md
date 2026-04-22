# Data Storage Skill (Supabase + light localStorage)

## Architecture
Data persists in **Supabase Postgres**. A thin React hook (`useSupabaseStore`) keeps local state in sync with Supabase on every mutation. Only UI preferences (`jsw:dark`) live in `localStorage`.

- **JS fields** are camelCase (`purchaseOrderNumber`, `hrCoilId`).
- **DB columns** are snake_case (`purchase_order_number`, `hr_coil_id`).
- Conversion is automatic via `toSnake` / `toCamel` in `src/lib/db.js`.

## useSupabaseStore Hook — `src/lib/db.js`
```js
const [rows, setRows, loading] = useSupabaseStore('jsw:coils', [])
// setRows accepts a value or a functional updater, same as useState.
// Writes are mirrored to Supabase in the background.
```

Empty strings (`''`) are coerced to `null` at the sync boundary so optional `numeric` / `date` columns accept the row.

## localStorage Helper — `LS` in `src/App.jsx`
Used only for browser-local preferences. Do NOT put business data here.
```js
const LS = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)) } catch { return null } },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
  del: (k) => localStorage.removeItem(k),
}
```

## Store Key Registry
`TABLE_MAP` in `src/lib/db.js` binds the store key to the Supabase table.

| Store key              | Supabase table     | Content                          |
|------------------------|--------------------|----------------------------------|
| `jsw:coils`            | `coils`            | Stage 1 mother coil records      |
| `jsw:babyCoils`        | `baby_coils`       | Stage 2 baby coil records        |
| `jsw:tubes`            | `tubes`            | Stage 3 tube production records  |
| `jsw:bundles`          | `bundles`          | Stage 4 bundle rows              |
| `jsw:dispatches`       | `dispatches`       | Stage 5 dispatch records         |
| `jsw:skus`             | `skus`             | SKU master catalog               |
| `jsw:purchaseOrders`   | `purchase_orders`  | PO Master (monthly Excel upload) |

Browser-only (not in Supabase):

| Key        | Type    | Description             |
|------------|---------|-------------------------|
| `jsw:dark` | Boolean | Dark mode preference    |

## Soft-Delete Pattern
Records are not removed from arrays. Set `deleted: true` and filter in the UI.
```js
setCoils(prev => prev.map(c => c.id === row.id ? { ...c, deleted: true } : c))
const active = coils.filter(c => !c.deleted)
```
Exception: SKU Master hard-deletes (no `deleted` flag on `skus`).

## Recalculation on Mutation
When baby coils are added / edited / deleted, ALL siblings for the same parent recalculate their proportionate weight and cost:
```js
const parentBabies = updated.filter(b => !b.deleted && b.hrCoilId === parentId)
const totalWidth = parentBabies.reduce((s, b) => s + Number(b.width || 0), 0)
updated = updated.map(b => {
  if (!b.deleted && b.hrCoilId === parentId && totalWidth > 0) {
    return {
      ...b,
      weight: (Number(b.width) / totalWidth) * parent.actualWeight,
      costPrice: (Number(b.width) / totalWidth) * parent.costPrice,
    }
  }
  return b
})
```

## Seed Data
Nothing is seeded. Every table — `skus`, `coils`, `baby_coils`, `tubes`, `bundles`, `dispatches`, `purchase_orders` — starts empty after `supabase-setup.sql` runs. Users populate them via the app UI (or a manual bulk-insert in the SQL editor for master data like SKUs).

## Don'ts
- NEVER put business data in `localStorage` — it's Supabase-backed now.
- NEVER hard-delete pipeline rows — use the `deleted: true` flag.
- NEVER mutate state directly — always go through the `setRows` update fn.
- NEVER forget to recalculate sibling weights after a baby-coil mutation.
- NEVER send `''` for `numeric` / `date` fields directly to Supabase — `useSupabaseStore` already coerces, but don't defeat it by bypassing the hook.

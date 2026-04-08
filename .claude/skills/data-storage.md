# Data Storage Skill (localStorage)

## Architecture
This project uses client-side localStorage with JSON serialization.
No backend database — all data persists in the browser.
All keys are namespaced with `jsw:` prefix.

## Storage Helpers (as implemented in App.jsx)
```javascript
const S = {
  get(k) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null } catch { return null } },
  set(k, v) { localStorage.setItem(k, JSON.stringify(v)) },
  del(k) { localStorage.removeItem(k) },
}
```

## useStore Hook (React state + localStorage sync)
```javascript
const useStore = (key, fallback) => {
  const [val, setVal] = useState(() => S.get(key) ?? fallback)
  const update = useCallback((v) => {
    const next = typeof v === 'function' ? v(S.get(key) ?? fallback) : v
    S.set(key, next)
    setVal(next)
  }, [key, fallback])
  return [val, update]
}
```

## Key Registry
| Key | Type | Description |
|-----|------|-------------|
| `jsw:coils` | Array | Stage 1 mother coil records |
| `jsw:babyCoils` | Array | Stage 2 baby coil records |
| `jsw:tubes` | Array | Stage 3 tube production records |
| `jsw:bundles` | Array | Stage 4 bundle formation rows |
| `jsw:dispatches` | Array | Stage 5 dispatch records |
| `jsw:skus` | Array | SKU master catalog |
| `jsw:dark` | Boolean | Dark mode preference |
| `jsw:seeded` | Boolean | Seed data initialization flag |

## Soft Delete Pattern
Records are never removed from arrays. Instead, set `deleted: true`:
```javascript
// Delete
setCoils(prev => prev.map(c => c.id === row.id ? { ...c, deleted: true } : c))

// Filter in display
const active = coils.filter(c => !c.deleted)
```

## Recalculation on Mutation
When baby coils are added/edited/deleted, ALL siblings' weights must recalculate:
```javascript
// After mutation, recalculate all siblings
const parentBabies = updated.filter(b => !b.deleted && b.hrCoilId === parentId)
const newTotal = parentBabies.reduce((s, b) => s + Number(b.width || 0), 0)
updated = updated.map(b => {
  if (!b.deleted && b.hrCoilId === parentId && newTotal > 0) {
    return { ...b, weight: (Number(b.width) / newTotal) * parentCoil.actualWeight }
  }
  return b
})
```

## Storage Limits
- localStorage limit is ~5-10MB per origin
- Monitor usage: `JSON.stringify(localStorage).length` bytes
- Current dataset (7 seed coils + 8 SKUs) is ~5KB

## Don'ts
- NEVER store sensitive credentials in localStorage
- NEVER skip JSON parse error handling (S.get handles this)
- NEVER use sessionStorage for persistent data
- NEVER mutate state directly — always use the update function from useStore
- NEVER forget to recalculate sibling weights after baby coil mutations

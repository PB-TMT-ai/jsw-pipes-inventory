# API Integration Skill

## Current Status
This application uses **Supabase Postgres** as its backend via the `@supabase/supabase-js` client. State is wrapped in `useSupabaseStore` (`src/lib/db.js`); see the `data-storage` skill for details. This skill applies if/when *additional* external APIs are added (e.g., Zoho Books direct API instead of Excel, or an ERP push).

## Error Handling Pattern
```javascript
async function fetchData(endpoint) {
  try {
    const response = await fetch(endpoint)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.json()
  } catch (error) {
    console.error('API Error:', error)
    throw error
  }
}
```

## Retry with Backoff
```javascript
async function fetchWithRetry(fn, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn()
    } catch (e) {
      if (i === retries - 1) throw e
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)))
    }
  }
}
```

## Future Integration Points
If adding a new external API (e.g., Zoho Books live sync):
1. Mirror the `useSupabaseStore` pattern — put the fetch + local-state binding in a custom hook inside `src/lib/`
2. Add loading/error states to the consuming component
3. Keep secrets in `.env` with the `VITE_` prefix (only anon/public keys are safe to ship to the client)
4. For writes that must survive refresh, persist to Supabase, not localStorage

## Rate Limiting
- Track requests per minute
- Add delays for batch operations
- Respect Retry-After headers

## Don'ts
- NEVER hardcode API keys — use environment variables (VITE_* prefix for Vite)
- NEVER log sensitive data
- NEVER ignore rate limits
- NEVER expose service keys to the client

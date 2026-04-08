# API Integration Skill

## Current Status
This application is **client-side only** with no backend API.
All data is stored in localStorage. This skill applies if/when external APIs are added.

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
If migrating to a backend (e.g., Supabase, Express):
1. Replace `useStore` hook with API-backed state
2. Add loading/error states to each stage component
3. Replace `S.get/S.set` calls with API fetch/post
4. Keep localStorage as offline cache/fallback

## Rate Limiting
- Track requests per minute
- Add delays for batch operations
- Respect Retry-After headers

## Don'ts
- NEVER hardcode API keys — use environment variables (VITE_* prefix for Vite)
- NEVER log sensitive data
- NEVER ignore rate limits
- NEVER expose service keys to the client

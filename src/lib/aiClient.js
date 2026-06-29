// ═══════════════════════════════════════════════════════════════
// AI CLIENT — thin fetch wrapper to the server-side proxy (api/ai-planner).
// The proxy holds the Anthropic key; the browser never sees it. Default URL
// is same-origin (/api/ai-planner on Vercel); override with VITE_AI_FN_URL
// when hitting a preview/remote deploy during local `vite dev`.
// ═══════════════════════════════════════════════════════════════

const FN_URL = import.meta.env.VITE_AI_FN_URL || '/api/ai-planner'
// Optional shared-secret gate (only used if the server sets AI_PLANNER_TOKEN).
const TOKEN = import.meta.env.VITE_AI_PLANNER_TOKEN || import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// messages: [{ role: 'user' | 'assistant', content: string }]
// context:  the object from buildAIContext().context
// → resolves to { answer, usage, model }; throws Error(message) on failure.
export async function askPlanner(messages, context) {
  let res
  try {
    res = await fetch(FN_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(TOKEN ? { authorization: `Bearer ${TOKEN}` } : {}),
      },
      body: JSON.stringify({ messages, context }),
    })
  } catch {
    throw new Error('Could not reach the AI Planner. Check your connection and that the function is deployed.')
  }

  let data = null
  try {
    data = await res.json()
  } catch {
    // fall through to status-based error below
  }

  if (!res.ok) {
    throw new Error((data && data.error) || `AI Planner request failed (${res.status}).`)
  }
  if (!data || !data.answer) {
    throw new Error('AI Planner returned an empty answer.')
  }
  return data
}

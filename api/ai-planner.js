// ═══════════════════════════════════════════════════════════════
// AI PLANNER — server-side proxy (Vercel serverless function).
//
// Why this exists: the app is a browser-only SPA, so it cannot hold the
// Anthropic API key (a VITE_ var ends up in the public bundle). This
// function runs on the server, keeps the key in ANTHROPIC_API_KEY, and is
// the ONLY thing that talks to Anthropic. The browser sends a question +
// pre-computed data context and gets back a structured answer.
//
// It is a thin proxy: it does NOT re-implement calc.js. The client builds
// the compact, name-masked context (src/lib/aiContext.js) and ships it here.
//
// Security posture (honest): the goal is to protect the KEY. A public,
// loginless SPA can't cryptographically prove "only our app is calling" —
// any secret the browser holds is exposed. So we rely on: (1) the key never
// leaving the server, (2) a CORS/Origin allowlist, (3) size/turn caps to
// bound cost, and (4) an OPTIONAL shared bearer token (AI_PLANNER_TOKEN) for
// deployments that want an extra gate.
// ═══════════════════════════════════════════════════════════════

const AI_MODEL = 'claude-sonnet-4-6' // swap here to change model (single source of truth)
const MAX_TOKENS = 4096
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'

// Caps (bound token cost / abuse).
const MAX_BODY_BYTES = 200_000
const MAX_MESSAGES = 24
const MAX_MESSAGE_CHARS = 12_000

// ── Forced structured-output tool. Claude MUST call this, so every answer
// comes back as a typed payload the UI renders as tables + point-form notes. ──
const RESPONSE_TOOL = {
  name: 'render_answer',
  description:
    'Return the analyst answer as structured blocks the UI renders as tables plus point-form note sections. Always use this tool.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['summary', 'blocks'],
    properties: {
      summary: { type: 'string', description: '1-3 sentence plain-language headline answer / verdict.' },
      clarifying_questions: {
        type: 'array',
        description:
          'Non-empty ONLY when you genuinely need more info before building a plan (planner mode). When present, blocks may be empty. Never use for ordinary factual questions.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['question'],
          properties: {
            question: { type: 'string' },
            why: { type: 'string', description: 'Why this is needed.' },
            suggestions: { type: 'array', items: { type: 'string' }, description: 'Optional quick-reply options.' },
          },
        },
      },
      blocks: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type'],
          properties: {
            type: { type: 'string', enum: ['table', 'note', 'kpi'] },
            title: { type: 'string', description: 'Table caption, or the note section label e.g. "Assumptions".' },
            text: { type: 'string', description: 'For note: optional lead sentence.' },
            bullets: { type: 'array', items: { type: 'string' }, description: 'For note: point-form items (preferred).' },
            tone: { type: 'string', enum: ['info', 'warning', 'risk'], description: 'For note styling.' },
            columns: {
              type: 'array',
              description: 'For table.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['key', 'label'],
                properties: {
                  key: { type: 'string' },
                  label: { type: 'string' },
                  numeric: { type: 'boolean' },
                  format: { type: 'string', enum: ['mt', 'pct', 'inr', 'text'] },
                },
              },
            },
            rows: {
              type: 'array',
              description: 'For table. Each row is an array of cells aligned to columns.',
              items: { type: 'array', items: {} },
            },
            kpis: {
              type: 'array',
              description: 'For kpi.',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['label', 'value'],
                properties: { label: { type: 'string' }, value: { type: 'string' }, sub: { type: 'string' } },
              },
            },
          },
        },
      },
    },
  },
}

function buildSystemPrompt() {
  return `You are the JSW Pipes & Tubes Sales & Production Planning Specialist — a seasoned domain expert who advises sales, production, and leadership at a steel tube/pipe manufacturer in Hyderabad.

EXPERTISE. You deeply understand the pipeline: HR mother coils are slit into baby coils, baby coils are roll-formed into tubes (SHS / RHS / CHS), tubes are dispatched against customer orders. You reason fluently about demand vs supply, over-commitment, reservations, FIFO coil matching, fulfilment trade-offs, and backlog ageing. Speak with authority. Give a clear verdict and the "so what", not a menu of options.

ANSWER-FIRST. For any factual or data question, ANSWER DIRECTLY AND IMMEDIATELY from the provided context. Do NOT ask the user anything back. Only in PLANNER mode — when the user asks you to build a plan and a critical input is genuinely missing (available capacity, time window, priority rule, hard constraints) — return 1-4 specific clarifying_questions (each with short "why" and suggestions). After the user answers, return the plan. Never ask a question you can reasonably answer or assume-and-state from the data.

OUTPUT. Always call the render_answer tool. Every substantive answer = the data as one or more 'table' blocks PLUS clearly-labelled point-form 'note' sections. At minimum include these note sections, each as bullets:
  • "Assumptions" — what you took as given, the data window/asOf used.
  • "Consequences" — what the numbers mean; what happens if acted on or ignored (use tone:"risk" or "warning" for over-commitment, overdue, shortfalls).
  • "Recommendations" — concrete next steps in priority order.
Add other sections when useful ("Constraints", "Data gaps"). Prefer bullets over paragraphs and tables over prose. Put a 1-3 sentence verdict in 'summary'. Never write outside the schema.

DATA DICTIONARY (all weights are MT / tonnes unless noted). The context object you receive:
  • demandSupply[] — per SKU: ordered, produced, shipped, inventory (=produced−shipped), booked (open per-line demand), free (=inventory−booked; NEGATIVE means OVER-COMMITTED → flag as risk), reserved (=Σ max(0, released−invoiced) over open orders), available (=inventory−reserved; the headline "can we fulfil from stock").
  • backlog[] — open order lines: orderId, customer, skuCode, description, ordered, shipped, open (=ordered−shipped), fulfilmentPct, orderStatus, expectedDeliveryDate. Oldest expected-delivery first; a date before asOf is OVERDUE.
  • distributors[] — per customer: validOrders, dispatched, invoicedVsOrders, pending (≥0, per-line), openOrders, inventory, free. NOTE: distributor inventory/free are a SHARED GLOBAL POOL across customers — never sum them across customers.
  • rawMaterial.byThickness[] — free baby-coil stock grouped by thickness band: { thickness, freeMT, coilCount, widths:[min,max] }. To produce an SKU you need baby coils with width within ±5 mm of its required strip width (2×(height+breadth) for SHS/RHS, π×outsideDiameter for CHS) AND thickness within ±0.3 mm.
  • totals — headline scalars (globalFreeMT, openBacklogMT, overCommittedSkuCount, distinctCustomers, asOf).

BUSINESS RULES. free = inventory − reserved (negative = over-committed → risk). A SKU is fulfillable from stock when available ≥ open. Production is raw-material-constrained when no baby coil matches the SKU's width (±5 mm) and thickness (±0.3 mm). An order line is "open"/active when its status is not Delivered / Cancelled / Rejected.

GUARDRAILS. NEVER invent numbers, SKUs, customers, or dates that are not in the context. If the data needed isn't there, say so in a "Data gaps" note (and, only in planner mode, ask). Report MT to 1 decimal. Do not assume capacity, lead times, or prices unless the user provides them.

PRIVACY. Customers appear as opaque ids (e.g. "C001"). Refer to them by that id; the app maps ids back to real names for the user.`
}

// Attach the data context to the LAST user message so the model always sees
// the current snapshot alongside the question (system prompt stays constant).
function injectContext(messages, context) {
  const out = messages.map((m) => ({ role: m.role, content: String(m.content || '') }))
  for (let i = out.length - 1; i >= 0; i--) {
    if (out[i].role === 'user') {
      out[i] = {
        role: 'user',
        content: `${out[i].content}\n\n<DATA_CONTEXT>\n${JSON.stringify(context || {})}\n</DATA_CONTEXT>`,
      }
      break
    }
  }
  return out
}

// ── CORS ──
function allowedOrigin(origin) {
  if (!origin) return null // same-origin / curl — no CORS header needed
  const list = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (list.includes(origin)) return origin
  if (/^https?:\/\/localhost(:\d+)?$/.test(origin)) return origin
  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return origin // preview deploys
  return false // disallowed
}

function setCors(res, origin) {
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Vary', 'Origin')
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type')
}

export default async function handler(req, res) {
  const origin = req.headers.origin
  const resolved = allowedOrigin(origin)
  if (resolved === false) {
    res.status(403).json({ error: 'origin not allowed' })
    return
  }
  setCors(res, resolved)

  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' })
    return
  }

  // Optional shared-secret gate (set AI_PLANNER_TOKEN on the server + VITE_AI_PLANNER_TOKEN on the client).
  const requiredToken = process.env.AI_PLANNER_TOKEN || ''
  if (requiredToken) {
    const auth = req.headers.authorization || ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (token !== requiredToken) {
      res.status(401).json({ error: 'unauthorized' })
      return
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(500).json({ error: 'AI planner is not configured (missing ANTHROPIC_API_KEY).' })
    return
  }

  // Parse + validate body.
  let body = req.body
  try {
    if (typeof body === 'string') body = JSON.parse(body)
  } catch {
    res.status(400).json({ error: 'invalid JSON body' })
    return
  }
  if (!body || typeof body !== 'object') {
    res.status(400).json({ error: 'missing body' })
    return
  }
  if (JSON.stringify(body).length > MAX_BODY_BYTES) {
    res.status(413).json({ error: 'request too large' })
    return
  }
  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) {
    res.status(400).json({ error: 'messages required' })
    return
  }
  if (messages.length > MAX_MESSAGES) {
    res.status(400).json({ error: 'too many messages' })
    return
  }
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') {
      res.status(400).json({ error: 'each message needs {role: user|assistant, content: string}' })
      return
    }
    if (m.content.length > MAX_MESSAGE_CHARS) {
      res.status(400).json({ error: 'a message is too long' })
      return
    }
  }

  const payload = {
    model: AI_MODEL,
    max_tokens: MAX_TOKENS,
    system: buildSystemPrompt(),
    messages: injectContext(messages, body.context),
    tools: [RESPONSE_TOOL],
    tool_choice: { type: 'tool', name: 'render_answer' },
  }

  let aResp
  try {
    aResp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch (e) {
    res.status(502).json({ error: 'could not reach the AI service' })
    return
  }

  if (!aResp.ok) {
    const detail = (await aResp.text().catch(() => '')).slice(0, 300)
    res.status(502).json({ error: `AI service error (${aResp.status}): ${detail}` })
    return
  }

  const data = await aResp.json().catch(() => null)
  if (!data) {
    res.status(502).json({ error: 'invalid AI response' })
    return
  }

  // Newer models can decline via a refusal stop reason.
  if (data.stop_reason === 'refusal') {
    res.status(200).json({
      answer: {
        summary: 'I can’t help with that request.',
        blocks: [{ type: 'note', title: 'Declined', tone: 'warning', text: 'The request was declined.' }],
      },
      model: AI_MODEL,
    })
    return
  }

  const toolBlock = (data.content || []).find((b) => b.type === 'tool_use' && b.name === 'render_answer')
  if (!toolBlock) {
    res.status(502).json({ error: 'no structured answer returned' })
    return
  }

  res.status(200).json({ answer: toolBlock.input, usage: data.usage, model: AI_MODEL })
}

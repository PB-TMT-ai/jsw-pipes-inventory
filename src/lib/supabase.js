import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Whether real credentials were provided at build time. Exposed so the UI can
// distinguish "misconfigured" from "network down".
export const supabaseConfigured = Boolean(supabaseUrl && supabaseKey)

if (!supabaseConfigured) {
  // Don't hard-crash the app on missing config — createClient throws on an
  // undefined URL, which would white-screen before React can render a warning.
  // Fall back to a placeholder so runtime fetches fail loudly through the
  // connection banner instead.
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY — ' +
    'database is NOT connected. Set them in your environment to enable saving.'
  )
}

export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseKey || 'placeholder-anon-key'
)

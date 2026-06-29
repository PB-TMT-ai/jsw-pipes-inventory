import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Fail loud on a missing/mis-set deploy config instead of silently constructing a broken
// client (which would otherwise surface later as opaque request failures / empty data).
if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing required env vars VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY — copy .env.example to .env.local and fill them in.')
}

export const supabase = createClient(supabaseUrl, supabaseKey)

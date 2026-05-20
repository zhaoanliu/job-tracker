import { createClient } from '@supabase/supabase-js'

// Service-role client — bypasses RLS and can call auth.admin APIs.
// Server-side only: never import this from a client component.
export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

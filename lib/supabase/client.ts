import { createBrowserClient } from '@supabase/ssr'

// Type the client with the Database generic once you have the Supabase CLI-generated
// types: npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
// and then: createBrowserClient<Database>(...)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        lock: async (name, _acquireTimeout, fn) => {
          if (typeof navigator === 'undefined' || !navigator.locks) {
            return fn()
          }
          return navigator.locks.request(name, { mode: 'exclusive' }, () => fn())
        },
      },
    }
  )
}

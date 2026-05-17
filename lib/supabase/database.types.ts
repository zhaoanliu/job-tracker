// Auto-generate the authoritative version with:
//   npx supabase gen types typescript --project-id <id> > lib/supabase/database.types.ts
// This hand-written version is a minimal stand-in for local development.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

// Separate Row interface avoids the circular Database['public']['Tables'][...]['Row'] self-reference
// that TypeScript collapses into `never` inside generic constraints.
interface ApplicationRow {
  id: string
  user_id: string
  company: string
  role: string | null
  status: string
  type: string | null
  priority: string
  location: string | null
  workmode: string
  date: string | null
  link: string | null
  source: string
  referrer: string | null
  notes: string | null
  next_step: string | null
  jd: string | null
  order: number
  created_at: string
  updated_at: string
}

export interface Database {
  public: {
    Tables: {
      applications: {
        Row: ApplicationRow
        Insert: Omit<ApplicationRow, 'id' | 'created_at' | 'updated_at'>
        Update: Partial<ApplicationRow>
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}

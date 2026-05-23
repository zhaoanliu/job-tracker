import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function RootPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const adminEmail = process.env.ADMIN_EMAIL
  if (user && adminEmail && user.email === adminEmail) {
    redirect('/admin')
  }
  redirect('/dashboard')
}

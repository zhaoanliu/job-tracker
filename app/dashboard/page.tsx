import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Application } from '@/lib/types'
import KanbanBoard from '@/components/board/KanbanBoard'

export default async function DashboardPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Belt-and-suspenders: middleware already redirects, but guard here too
  if (!user) redirect('/login')

  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .order('order', { ascending: true })
    .order('created_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch applications:', error)
  }

  return (
    <KanbanBoard
      initialApplications={(data as Application[]) ?? []}
      userEmail={user.email ?? ''}
    />
  )
}

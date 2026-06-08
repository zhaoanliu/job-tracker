import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const supabase = createClient()

  const body = await req.json().catch(() => null) as { event_name?: string; metadata?: unknown } | null
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  const eventName = (body.event_name ?? '').trim().slice(0, 100)
  if (!eventName) {
    return NextResponse.json({ error: 'event_name is required' }, { status: 400 })
  }

  const { error } = await supabase.from('events').insert({
    user_id: user.id,
    event_name: eventName,
    metadata: body.metadata ?? null,
  })

  if (error) {
    console.error('Failed to record event:', error.message, error)
    return NextResponse.json({ error: 'Failed to record event' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
